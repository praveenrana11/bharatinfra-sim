"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import SiteProgressVisual from "@/components/SiteProgressVisual";
import {
  MetricTile as ResultsMetricTile,
  PerformanceHistoryChart,
  RadarComparisonChart,
  ScoreGauge,
  type ComparisonMetric,
  type HistoryMetricRow,
  type MetricTileModel,
} from "@/components/results/ResultsVisuals";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { MetricTile as StatTile } from "@/components/ui/MetricTile";
import { Tooltip } from "@/components/ui/Tooltip";
import { buildDeterministicRoundDebrief } from "@/lib/aiDebrief";
import { generateCausalInsights } from "@/lib/causalDebrief";
import { parseStoredDilemmaSummary } from "@/lib/dilemmaEngine";
import { getScenarioFamily } from "@/lib/simVisuals";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { evaluateKpiAchievement, parseKpiTarget } from "@/lib/kpi";
import type { DecisionDraft, RoundResult } from "@/lib/simEngine";

type RouteParams = {
  sessionId?: string;
  roundNumber?: string;
};

type SessionRow = {
  id: string;
  name: string | null;
  code: string;
};

type MembershipRow = {
  team_id: string;
};

type TeamRow = {
  id: string;
  session_id: string;
  team_name: string;
  total_points: number | null;
  kpi_target: string | null;
  scenario_id: string | null;
};

type ScenarioRow = {
  name: string | null;
  duration_rounds: number | null;
};

type DecisionRow = {
  focus_cost: number;
  focus_quality: number;
  focus_stakeholder: number;
  focus_speed: number;
  risk_appetite: DecisionDraft["risk_appetite"];
  governance_intensity: DecisionDraft["governance_intensity"];
  buffer_percent: number;
  vendor_strategy: DecisionDraft["vendor_strategy"];
  raw: Record<string, unknown> | null;
};

type TeamResultRow = {
  session_id: string;
  team_id: string;
  round_number: number;
  schedule_index: number | null;
  cost_index: number | null;
  cash_closing: number | null;
  quality_score: number | null;
  safety_score: number | null;
  stakeholder_score: number | null;
  claim_entitlement_score: number | null;
  points_earned: number | null;
  penalties: number | null;
  ld_triggered: boolean | null;
  ld_amount_cr: number | string | null;
  ld_cumulative_cr: number | string | null;
  ld_weeks: number | null;
  ld_capped: boolean | null;
  detail: Record<string, unknown> | null;
};

type RoundPointsRow = {
  team_id: string;
  round_number: number;
  points_earned: number | null;
};

type MetricKey = "spi" | "cpi" | "quality" | "safety" | "stakeholder";

type MetricConfig = {
  key: MetricKey;
  label: string;
  threshold: number;
  precision: number;
  kind: "index" | "score";
};

const METRIC_CONFIG: MetricConfig[] = [
  { key: "spi", label: "SPI", threshold: 1.05, precision: 2, kind: "index" },
  { key: "cpi", label: "CPI", threshold: 1.04, precision: 2, kind: "index" },
  { key: "quality", label: "Quality", threshold: 85, precision: 0, kind: "score" },
  { key: "safety", label: "Safety", threshold: 88, precision: 0, kind: "score" },
  { key: "stakeholder", label: "Stakeholder", threshold: 84, precision: 0, kind: "score" },
];

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatCurrencyInr(value: number) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(value);
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function formatCrores(value: number) {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function metricValueFromResult(result: TeamResultRow | null, key: MetricKey) {
  if (!result) return 0;
  if (key === "spi") return toNumber(result.schedule_index, 0);
  if (key === "cpi") return toNumber(result.cost_index, 0);
  if (key === "quality") return toNumber(result.quality_score, 0);
  if (key === "safety") return toNumber(result.safety_score, 0);
  return toNumber(result.stakeholder_score, 0);
}

function formatMetricValue(value: number, precision: number) {
  return precision === 0 ? `${Math.round(value)}` : value.toFixed(precision);
}

function metricThresholdLabel(config: MetricConfig) {
  return config.kind === "index"
    ? `Target ${config.threshold.toFixed(2)}`
    : `Target ${Math.round(config.threshold)}`;
}

function buildMetricTileModel(
  config: MetricConfig,
  currentResult: TeamResultRow | null,
  previousResult: TeamResultRow | null
): MetricTileModel {
  const current = metricValueFromResult(currentResult, config.key);
  const previous = previousResult ? metricValueFromResult(previousResult, config.key) : null;
  const delta = previous === null ? null : current - previous;
  const normalizedScaleValue =
    config.kind === "index" ? clamp(current, 0, 1.2) : clamp((current / 100) * 1.2, 0, 1.2);

  return {
    key: config.key,
    label: config.label,
    current,
    previous,
    displayValue: formatMetricValue(current, config.precision),
    deltaLabel:
      delta === null
        ? "Baseline"
        : `${delta > 0 ? "+" : ""}${formatMetricValue(delta, config.precision)}`,
    deltaArrow: delta === null ? "\u2192" : delta >= 0 ? "\u2191" : "\u2193",
    barPercent: clampPercent((normalizedScaleValue / 1.2) * 100),
    isHealthy: current >= config.threshold,
    thresholdLabel: metricThresholdLabel(config),
  };
}

function comparisonMetricRows(
  currentResult: TeamResultRow | null,
  previousResult: TeamResultRow | null
): ComparisonMetric[] {
  const currentSpi = metricValueFromResult(currentResult, "spi");
  const currentCpi = metricValueFromResult(currentResult, "cpi");
  const currentQuality = metricValueFromResult(currentResult, "quality");
  const currentSafety = metricValueFromResult(currentResult, "safety");
  const currentStakeholder = metricValueFromResult(currentResult, "stakeholder");
  const previousSpi = previousResult ? metricValueFromResult(previousResult, "spi") : null;
  const previousCpi = previousResult ? metricValueFromResult(previousResult, "cpi") : null;
  const previousQuality = previousResult ? metricValueFromResult(previousResult, "quality") : null;
  const previousSafety = previousResult ? metricValueFromResult(previousResult, "safety") : null;
  const previousStakeholder = previousResult
    ? metricValueFromResult(previousResult, "stakeholder")
    : null;

  return [
    {
      label: "Schedule",
      current: currentSpi,
      previous: previousSpi,
      scaledCurrent: clampPercent((currentSpi / 1.2) * 100),
      scaledPrevious: previousSpi === null ? null : clampPercent((previousSpi / 1.2) * 100),
      format: "index",
    },
    {
      label: "Cost",
      current: currentCpi,
      previous: previousCpi,
      scaledCurrent: clampPercent((currentCpi / 1.2) * 100),
      scaledPrevious: previousCpi === null ? null : clampPercent((previousCpi / 1.2) * 100),
      format: "index",
    },
    {
      label: "Quality",
      current: currentQuality,
      previous: previousQuality,
      scaledCurrent: clampPercent(currentQuality),
      scaledPrevious: previousQuality === null ? null : clampPercent(previousQuality),
      format: "score",
    },
    {
      label: "Safety",
      current: currentSafety,
      previous: previousSafety,
      scaledCurrent: clampPercent(currentSafety),
      scaledPrevious: previousSafety === null ? null : clampPercent(previousSafety),
      format: "score",
    },
    {
      label: "Stakeholder",
      current: currentStakeholder,
      previous: previousStakeholder,
      scaledCurrent: clampPercent(currentStakeholder),
      scaledPrevious:
        previousStakeholder === null ? null : clampPercent(previousStakeholder),
      format: "score",
    },
  ];
}

function impactBorderTone(impact: "positive" | "negative" | "neutral") {
  if (impact === "positive") return "border-l-teal-400";
  if (impact === "negative") return "border-l-rose-400";
  return "border-l-slate-500";
}

function impactBadgeTone(impact: "positive" | "negative" | "neutral") {
  if (impact === "positive") return "border-emerald-400/30 bg-emerald-500/15 text-emerald-100";
  if (impact === "negative") return "border-rose-400/30 bg-rose-500/15 text-rose-100";
  return "border-slate-500/30 bg-slate-500/10 text-slate-200";
}

function sortInsights<T extends { impact: "positive" | "negative" | "neutral" }>(insights: T[]) {
  const weights: Record<"positive" | "negative" | "neutral", number> = {
    negative: 0,
    positive: 1,
    neutral: 2,
  };

  return [...insights].sort((a, b) => weights[a.impact] - weights[b.impact]);
}

function getRoundPerformance(points: number) {
  if (points < 300) {
    return {
      benchmark: "Below benchmark",
      summary: "Recovery needed",
      tone: "text-rose-200",
      badge: "border-rose-500/30 bg-rose-500/15 text-rose-100",
      gaugeColor: "#ef4444",
      gaugeGlow: "shadow-[0_0_30px_rgba(239,68,68,0.25)]",
    };
  }

  if (points <= 500) {
    return {
      benchmark: "On benchmark",
      summary: "Stable round",
      tone: "text-amber-100",
      badge: "border-amber-500/30 bg-amber-500/15 text-amber-100",
      gaugeColor: "#f59e0b",
      gaugeGlow: "shadow-[0_0_30px_rgba(245,158,11,0.22)]",
    };
  }

  return {
    benchmark: "Above benchmark",
    summary: "High-performing round",
    tone: "text-emerald-100",
    badge: "border-emerald-500/30 bg-emerald-500/15 text-emerald-100",
    gaugeColor: "#22c55e",
    gaugeGlow: "shadow-[0_0_30px_rgba(34,197,94,0.22)]",
  };
}

function getCashClosingState(cashClosing: number) {
  if (cashClosing < 0) {
    return {
      label: "Negative cash position - this will increase cost pressure next round",
      badge: "border-amber-400/30 bg-amber-400/15 text-amber-100",
      amountTone: "text-amber-200",
    };
  }

  if (cashClosing > 0 && cashClosing < 50_000) {
    return {
      label: "Low cash buffer - consider reducing spend next round",
      badge: "border-yellow-400/30 bg-yellow-400/15 text-yellow-100",
      amountTone: "text-yellow-100",
    };
  }

  return {
    label: "Healthy cash position",
    badge: "border-emerald-400/30 bg-emerald-400/15 text-emerald-100",
    amountTone: "text-emerald-200",
  };
}

export default function RoundResultsPage() {
  const params = useParams() as RouteParams;
  const sessionId = params.sessionId ?? "";
  const roundNumber = Number.parseInt(params.roundNumber ?? "1", 10) || 1;
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [session, setSession] = useState<SessionRow | null>(null);
  const [team, setTeam] = useState<TeamRow | null>(null);
  const [scenario, setScenario] = useState<ScenarioRow | null>(null);
  const [decision, setDecision] = useState<DecisionRow | null>(null);
  const [teamHistory, setTeamHistory] = useState<TeamResultRow[]>([]);
  const [roundPoints, setRoundPoints] = useState<RoundPointsRow[]>([]);
  const [showAllInsights, setShowAllInsights] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadResults = async () => {
      setLoading(true);
      setError("");

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        if (!cancelled) {
          setError(userError?.message ?? "Unable to load your session.");
          setLoading(false);
        }
        return;
      }

      const [sessionResponse, membershipsResponse] = await Promise.all([
        supabase.from("sessions").select("id,name,code").eq("id", sessionId).maybeSingle(),
        supabase.from("team_memberships").select("team_id").eq("user_id", userData.user.id),
      ]);

      if (sessionResponse.error) {
        if (!cancelled) {
          setError(sessionResponse.error.message);
          setLoading(false);
        }
        return;
      }

      if (membershipsResponse.error) {
        if (!cancelled) {
          setError(membershipsResponse.error.message);
          setLoading(false);
        }
        return;
      }

      const memberships = (membershipsResponse.data ?? []) as MembershipRow[];
      const teamIds = memberships.map((membership) => membership.team_id);

      if (teamIds.length === 0) {
        if (!cancelled) {
          setError("You are not assigned to a team in this simulation.");
          setLoading(false);
        }
        return;
      }

      const { data: teamsData, error: teamError } = await supabase
        .from("teams")
        .select("id,session_id,team_name,total_points,kpi_target,scenario_id")
        .in("id", teamIds)
        .eq("session_id", sessionId);

      if (teamError) {
        if (!cancelled) {
          setError(teamError.message);
          setLoading(false);
        }
        return;
      }

      const teams = (teamsData ?? []) as TeamRow[];
      const myTeam = teams[0] ?? null;

      if (!myTeam) {
        if (!cancelled) {
          setError("You are not a member of this session.");
          setLoading(false);
        }
        return;
      }

      const teamResultSelect =
        "session_id,team_id,round_number,schedule_index,cost_index,cash_closing,quality_score,safety_score,stakeholder_score,claim_entitlement_score,points_earned,penalties,ld_triggered,ld_amount_cr,ld_cumulative_cr,ld_weeks,ld_capped,detail";

      const [historyResponse, decisionResponse, roundPointsResponse, scenarioResponse] = await Promise.all([
        supabase
          .from("team_results")
          .select(teamResultSelect)
          .eq("session_id", sessionId)
          .eq("team_id", myTeam.id)
          .order("round_number", { ascending: true }),
        supabase
          .from("decisions")
          .select(
            "focus_cost,focus_quality,focus_stakeholder,focus_speed,risk_appetite,governance_intensity,buffer_percent,vendor_strategy,raw"
          )
          .eq("session_id", sessionId)
          .eq("team_id", myTeam.id)
          .eq("round_number", roundNumber)
          .maybeSingle(),
        supabase
          .from("team_results")
          .select("team_id,round_number,points_earned")
          .eq("session_id", sessionId)
          .eq("round_number", roundNumber),
        myTeam.scenario_id
          ? supabase
              .from("project_scenarios")
              .select("name,duration_rounds")
              .eq("id", myTeam.scenario_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (historyResponse.error) {
        if (!cancelled) {
          setError(historyResponse.error.message);
          setLoading(false);
        }
        return;
      }

      if (decisionResponse.error) {
        if (!cancelled) {
          setError(decisionResponse.error.message);
          setLoading(false);
        }
        return;
      }

      if (roundPointsResponse.error) {
        if (!cancelled) {
          setError(roundPointsResponse.error.message);
          setLoading(false);
        }
        return;
      }

      if (scenarioResponse.error) {
        if (!cancelled) {
          setError(scenarioResponse.error.message);
          setLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setSession((sessionResponse.data as SessionRow | null) ?? null);
        setTeam(myTeam);
        setScenario((scenarioResponse.data as ScenarioRow | null) ?? null);
        setDecision((decisionResponse.data as DecisionRow | null) ?? null);
        setTeamHistory((historyResponse.data as TeamResultRow[] | null) ?? []);
        setRoundPoints((roundPointsResponse.data as RoundPointsRow[] | null) ?? []);
        setLoading(false);
      }
    };

    void loadResults();

    return () => {
      cancelled = true;
    };
  }, [roundNumber, sessionId, supabase]);

  const result = useMemo(
    () => teamHistory.find((row) => row.round_number === roundNumber) ?? null,
    [roundNumber, teamHistory]
  );

  const previousResult = useMemo(
    () => teamHistory.find((row) => row.round_number === roundNumber - 1) ?? null,
    [roundNumber, teamHistory]
  );

  useEffect(() => {
    setShowAllInsights(false);
  }, [roundNumber, result?.team_id]);

  const pointsThisRound = Math.max(0, Math.round(result?.points_earned ?? 0));
  const pointsPerformance = getRoundPerformance(pointsThisRound);
  const cashClosing = result?.cash_closing ?? 0;
  const cashState = getCashClosingState(cashClosing);
  const resultDetail = (result?.detail ?? null) as Record<string, any> | null;
  const latePenalty = toNumber(resultDetail?.kpi?.late_points_penalty, 0);
  const basePoints = Math.round(toNumber(resultDetail?.kpi?.base_points, pointsThisRound));
  const claimEntitlement = Math.round(toNumber(result?.claim_entitlement_score, 0));
  const totalTeamPoints = Math.round(team?.total_points ?? pointsThisRound);
  const currentSpi = toNumber(result?.schedule_index, 0);
  const ldTriggered = Boolean(result?.ld_triggered);
  const ldAmountCr = toNumber(result?.ld_amount_cr, 0);
  const ldCumulativeCr = toNumber(result?.ld_cumulative_cr, 0);
  const ldCapped = Boolean(result?.ld_capped);
  const ldCapCr = toNumber(resultDetail?.ld?.cap_cr, 0);
  const ldRemainingCr = Math.max(0, ldCapCr - ldCumulativeCr);
  const ldProgressPercent = ldCapCr > 0 ? clampPercent((ldCumulativeCr / ldCapCr) * 100) : 0;
  const scenarioFamily = getScenarioFamily(scenario?.name);
  const scenarioRounds = Math.max(scenario?.duration_rounds ?? 0, roundNumber, 1);

  const roundRank = useMemo(() => {
    if (!team) return null;
    const ranking = [...roundPoints].sort(
      (left, right) => toNumber(right.points_earned, 0) - toNumber(left.points_earned, 0)
    );
    const index = ranking.findIndex((row) => row.team_id === team.id);
    return index < 0 ? null : { rank: index + 1, total: ranking.length };
  }, [roundPoints, team]);

  const normalizedResult: RoundResult | null = result
    ? {
        schedule_index: toNumber(result.schedule_index, 0),
        cost_index: toNumber(result.cost_index, 0),
        cash_closing: toNumber(result.cash_closing, 0),
        quality_score: toNumber(result.quality_score, 0),
        safety_score: toNumber(result.safety_score, 0),
        stakeholder_score: toNumber(result.stakeholder_score, 0),
        claim_entitlement_score: toNumber(result.claim_entitlement_score, 0),
        points_earned: toNumber(result.points_earned, 0),
        penalties: toNumber(result.penalties, 0),
        ld_triggered: Boolean(result.ld_triggered),
        ld_amount_cr: toNumber(result.ld_amount_cr, 0),
        ld_cumulative_cr: toNumber(result.ld_cumulative_cr, 0),
        ld_weeks: toNumber(result.ld_weeks, 0),
        ld_capped: Boolean(result.ld_capped),
        detail: result.detail ?? {},
      }
    : null;
  const normalizedPreviousResult: RoundResult | null = previousResult
    ? {
        schedule_index: toNumber(previousResult.schedule_index, 0),
        cost_index: toNumber(previousResult.cost_index, 0),
        cash_closing: toNumber(previousResult.cash_closing, 0),
        quality_score: toNumber(previousResult.quality_score, 0),
        safety_score: toNumber(previousResult.safety_score, 0),
        stakeholder_score: toNumber(previousResult.stakeholder_score, 0),
        claim_entitlement_score: toNumber(previousResult.claim_entitlement_score, 0),
        points_earned: toNumber(previousResult.points_earned, 0),
        penalties: toNumber(previousResult.penalties, 0),
        ld_triggered: Boolean(previousResult.ld_triggered),
        ld_amount_cr: toNumber(previousResult.ld_amount_cr, 0),
        ld_cumulative_cr: toNumber(previousResult.ld_cumulative_cr, 0),
        ld_weeks: toNumber(previousResult.ld_weeks, 0),
        ld_capped: Boolean(previousResult.ld_capped),
        detail: previousResult.detail ?? {},
      }
    : null;
  const decisionDraft: Partial<DecisionDraft> | null = decision
    ? {
        focus_cost: toNumber(decision.focus_cost, 0),
        focus_quality: toNumber(decision.focus_quality, 0),
        focus_stakeholder: toNumber(decision.focus_stakeholder, 0),
        focus_speed: toNumber(decision.focus_speed, 0),
        risk_appetite: decision.risk_appetite,
        governance_intensity: decision.governance_intensity,
        buffer_percent: toNumber(decision.buffer_percent, 0),
        vendor_strategy: decision.vendor_strategy,
      }
    : null;
  const dilemmaSummary = useMemo(() => parseStoredDilemmaSummary(decision?.raw ?? null), [decision?.raw]);
  const kpiTarget = parseKpiTarget(team?.kpi_target ?? null);
  const kpiEvaluation =
    kpiTarget && normalizedResult ? evaluateKpiAchievement(kpiTarget, normalizedResult) : null;
  const causalInsights = useMemo(() => {
    if (!normalizedResult) return [];

    const decisionPayload = {
      ...(decision?.raw ?? {}),
      focus_cost: decision?.focus_cost,
      focus_quality: decision?.focus_quality,
      focus_stakeholder: decision?.focus_stakeholder,
      focus_speed: decision?.focus_speed,
    };

    const resultPayload = {
      ...normalizedResult,
      detail: normalizedResult.detail ?? {},
      kpiAchieved: kpiEvaluation?.achieved,
      kpiMetric: kpiEvaluation?.metricKey,
    };

    return sortInsights(
      generateCausalInsights(
        decisionPayload,
        resultPayload,
        normalizedPreviousResult
          ? {
              ...normalizedPreviousResult,
              detail: normalizedPreviousResult.detail ?? {},
            }
          : null
      )
    );
  }, [decision, kpiEvaluation?.achieved, kpiEvaluation?.metricKey, normalizedPreviousResult, normalizedResult]);
  const visibleCausalInsights = showAllInsights ? causalInsights : causalInsights.slice(0, 5);
  const hiddenInsightCount = Math.max(0, causalInsights.length - visibleCausalInsights.length);
  const aiDebrief = useMemo(() => {
    if (!normalizedResult) return null;
    return buildDeterministicRoundDebrief(normalizedResult, decisionDraft);
  }, [decisionDraft, normalizedResult]);

  const metricTiles = useMemo(
    () => METRIC_CONFIG.map((config) => buildMetricTileModel(config, result, previousResult)),
    [previousResult, result]
  );

  const comparisonMetrics = useMemo(
    () => comparisonMetricRows(result, previousResult),
    [previousResult, result]
  );

  const historyRows = useMemo<HistoryMetricRow[]>(
    () =>
      [...teamHistory]
        .sort((left, right) => left.round_number - right.round_number)
        .map((row) => ({
          roundLabel: `Round ${row.round_number}`,
          spi: clamp(toNumber(row.schedule_index, 0), 0, 1.2),
          cpi: clamp(toNumber(row.cost_index, 0), 0, 1.2),
          quality: clamp(toNumber(row.quality_score, 0), 0, 100),
          safety: clamp(toNumber(row.safety_score, 0), 0, 100),
          stakeholder: clamp(toNumber(row.stakeholder_score, 0), 0, 100),
          pointsScaled: clamp(toNumber(row.points_earned, 0) / 100, 0, 100),
        })),
    [teamHistory]
  );

  return (
    <RequireAuth>
      <main className="min-h-[100dvh] bg-[#020617] px-4 py-8 text-slate-200 md:px-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="flex flex-col gap-4 rounded-[28px] border border-white/10 bg-slate-950/70 px-6 py-6 shadow-[0_24px_60px_rgba(2,6,23,0.4)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
                  BharatInfra Sim
                </div>
                <h1 className="mt-2 text-3xl font-black tracking-tight text-white">
                  FY {roundNumber} Results
                </h1>
                <p className="mt-2 text-sm text-slate-400">
                  {team?.team_name ?? "Your team"}
                  {session?.name ? ` in ${session.name}` : session?.code ? ` in ${session.code}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.18em]">
                <Link
                  href={`/sessions/${sessionId}/round/${roundNumber}`}
                  className="rounded-full border border-white/10 px-4 py-2 text-slate-300 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
                >
                  Back to war room
                </Link>
                <Link
                  href={`/sessions/${sessionId}/report`}
                  className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-cyan-100 transition hover:border-cyan-300/30 hover:bg-cyan-300/10"
                >
                  Open team report
                </Link>
              </div>
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="h-72 animate-pulse rounded-[28px] border border-white/10 bg-slate-900/60" />
              <div className="h-72 animate-pulse rounded-[28px] border border-white/10 bg-slate-900/60" />
            </div>
          ) : !result ? (
            <Card className="border-white/10 bg-slate-900/70">
              <CardHeader title="Results pending" subtitle="Lock the round first to generate your team result." />
              <CardBody>
                <div className="text-sm text-slate-300">
                  No locked result was found for FY {roundNumber} yet.
                </div>
              </CardBody>
            </Card>
          ) : (
            <>
              <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                <Card className="border-white/10 bg-slate-900/70">
                  <CardHeader title="Score Hero" subtitle="Visual round benchmark for your latest locked result" />
                  <CardBody className="space-y-5">
                    <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
                      <div className={`rounded-[28px] border border-white/10 bg-slate-950/80 px-4 py-5 ${pointsPerformance.gaugeGlow}`}>
                        <ScoreGauge
                          points={pointsThisRound}
                          roundNumber={roundNumber}
                          benchmarkLabel={pointsPerformance.benchmark}
                          color={pointsPerformance.gaugeColor}
                          rankLabel={roundRank ? `Rank #${roundRank.rank} / ${roundRank.total}` : "Rank pending"}
                        />
                      </div>
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-start justify-between gap-3 rounded-[28px] border border-white/10 bg-slate-950/70 px-5 py-5">
                          <div>
                            <div className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Benchmark read</div>
                            <div className={`mt-2 text-2xl font-black tracking-tight ${pointsPerformance.tone}`}>{pointsPerformance.summary}</div>
                            <div className="mt-2 text-sm text-slate-400">Gauge reflects this round&apos;s points earned against the 800-point ceiling.</div>
                          </div>
                          <div className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${pointsPerformance.badge}`}>{pointsPerformance.benchmark}</div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-3">
                          <StatTile label="Base points" value={basePoints} color="#0D6E6E" />
                          <StatTile label="Penalties" value={Math.round(result.penalties ?? 0)} color="#EF4444" />
                          <StatTile label="Late penalty" value={latePenalty} color="#F59E0B" />
                        </div>

                        <div className="rounded-[26px] border border-cyan-400/15 bg-cyan-400/8 px-4 py-4 text-sm text-cyan-50">
                          {roundNumber === 1
                            ? "This is your opening benchmark round, so deltas and previous-round comparisons begin from the next result."
                            : "Current gauges, deltas, and radar comparison all benchmark against your last completed round."}
                        </div>
                      </div>
                    </div>
                  </CardBody>
                </Card>

                <Card className="border-white/10 bg-slate-900/70">
                  <CardHeader title="Cash closing" subtitle="Round-end liquidity and commercial resilience" right={<Tooltip title="Cash closing" lines={["Cash closing = revenue received minus all project costs this round.", "Persistent negative cash increases CPI pressure in future rounds."]} />} />
                  <CardBody className="space-y-5">
                    <div className={`text-4xl font-black tracking-tight ${cashState.amountTone}`}>Rs {formatCurrencyInr(cashClosing)}</div>
                    <div className={`rounded-2xl border px-4 py-4 text-sm font-semibold ${cashState.badge}`}>
                      {cashState.label}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <StatTile label="Claim entitlement" value={claimEntitlement} color="#0D6E6E" />
                      <StatTile label="Total team points" value={totalTeamPoints} color="#0D6E6E" />
                    </div>
                    {kpiTarget && kpiEvaluation ? (
                      <div className={`rounded-[22px] border px-4 py-3 text-sm font-semibold ${kpiEvaluation.achieved ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100" : "border-amber-500/30 bg-amber-500/10 text-amber-100"}`}>
                        KPI {kpiEvaluation.achieved ? "hit" : "miss"} - {kpiEvaluation.thresholdLabel}
                      </div>
                    ) : null}
                  </CardBody>
                </Card>
              </div>

              <Card className="border-white/10 bg-slate-900/70">
                <CardHeader
                  title="Site Progress Model"
                  subtitle="BIM-inspired progress snapshot updated to this round's execution status"
                />
                <CardBody>
                  <SiteProgressVisual
                    scenarioType={scenarioFamily}
                    currentRound={roundNumber}
                    totalRounds={scenarioRounds}
                    spi={toNumber(result?.schedule_index, 1)}
                    safety={toNumber(result?.safety_score, 100)}
                    hasIncident={toNumber(result?.safety_score, 100) < 75}
                  />
                </CardBody>
              </Card>

              {ldTriggered ? (
                <Card
                  className={
                    ldCapped
                      ? "border-emerald-500/30 bg-emerald-500/10"
                      : "border-rose-500/30 bg-rose-500/10"
                  }
                >
                  <CardHeader
                    title="⚠️ Liquidated Damages Invoked"
                    subtitle={`Schedule performance (SPI ${currentSpi.toFixed(2)}) fell below the 0.90 threshold. Client has invoked LD clause.`}
                  />
                  <CardBody className="space-y-5">
                    <div
                      className={`rounded-[24px] border px-4 py-4 text-sm font-semibold ${
                        ldCapped
                          ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-100"
                          : "border-rose-400/30 bg-rose-500/15 text-rose-100"
                      }`}
                    >
                      {ldCapped
                        ? "LD Cap Reached — no further deductions"
                        : "LD is now carrying forward round to round until schedule performance recovers or the contract cap is exhausted."}
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="rounded-[24px] border border-white/10 bg-slate-950/70 px-4 py-4">
                        <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                          This round
                        </div>
                        <div className="mt-2 text-2xl font-black text-white">
                          ₹{formatCrores(ldAmountCr)} Cr deducted
                        </div>
                      </div>
                      <div className="rounded-[24px] border border-white/10 bg-slate-950/70 px-4 py-4">
                        <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                          Cumulative
                        </div>
                        <div className="mt-2 text-2xl font-black text-white">
                          ₹{formatCrores(ldCumulativeCr)} Cr total LD to date
                        </div>
                      </div>
                      <div className="rounded-[24px] border border-white/10 bg-slate-950/70 px-4 py-4">
                        <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                          Contract remaining
                        </div>
                        <div className="mt-2 text-2xl font-black text-white">
                          ₹{formatCrores(ldRemainingCr)} Cr before cap
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 rounded-[24px] border border-white/10 bg-slate-950/70 px-4 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-white">LD exposure against cap</div>
                        <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                          {ldCapCr > 0 ? `${ldProgressPercent.toFixed(0)}% of ₹${formatCrores(ldCapCr)} Cr cap` : "Cap unavailable"}
                        </div>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className={`h-full rounded-full transition-all ${
                            ldCapped ? "bg-emerald-400" : "bg-rose-400"
                          }`}
                          style={{ width: `${ldProgressPercent}%` }}
                        />
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-white/10 bg-slate-950/70 px-4 py-4">
                      <div className="text-sm font-black uppercase tracking-[0.18em] text-amber-200">
                        DISPUTE OPTIONS (next round)
                      </div>
                      <div className="mt-4 grid gap-4 lg:grid-cols-3">
                        <div className="rounded-[22px] border border-white/10 bg-slate-900/80 px-4 py-4">
                          <div className="text-sm font-bold text-white">1. Accept LD</div>
                          <div className="mt-2 text-sm text-slate-300">
                            Absorb and focus on schedule recovery
                          </div>
                        </div>
                        <div className="rounded-[22px] border border-white/10 bg-slate-900/80 px-4 py-4">
                          <div className="text-sm font-bold text-white">2. Formal Dispute</div>
                          <div className="mt-2 text-sm text-slate-300">
                            Costs ₹15L legal fees, 40% success rate, takes 2 rounds to resolve
                          </div>
                        </div>
                        <div className="rounded-[22px] border border-white/10 bg-slate-900/80 px-4 py-4">
                          <div className="text-sm font-bold text-white">3. Negotiate Settlement</div>
                          <div className="mt-2 text-sm text-slate-300">
                            Offer 60% of LD amount as settlement, preserves relationship
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 text-sm text-slate-400">
                        Your response to LD will be a decision in the next round
                      </div>
                    </div>
                  </CardBody>
                </Card>
              ) : null}

              <Card className="border-white/10 bg-slate-900/70">
                <CardHeader title="Metrics Row" subtitle="Round health across schedule, cost, quality, safety, and stakeholder outcomes" />
                <CardBody className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                    {metricTiles.map((tile) => (
                      <ResultsMetricTile key={tile.key} tile={tile} />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">Claim entitlement {claimEntitlement}</div>
                    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">Base points {basePoints}</div>
                    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">Late penalty {latePenalty}</div>
                  </div>
                </CardBody>
              </Card>

              <Card className="border-white/10 bg-slate-900/70">
                <CardHeader title="This Round vs Last Round" subtitle="Radar comparison across the five scoring axes" />
                <CardBody className="space-y-4">
                  <RadarComparisonChart metrics={comparisonMetrics} />
                  {roundNumber === 1 ? (
                    <div className="rounded-[22px] border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
                      Previous-round overlay is hidden for Round 1 because no earlier result exists yet.
                    </div>
                  ) : null}
                </CardBody>
              </Card>

              <Card className="border-white/10 bg-slate-900/70">
                <CardHeader title="What Happened This Round" subtitle="Your management calls, score shifts, and round shocks in one debrief" />
                <CardBody className="space-y-4">
                  {dilemmaSummary?.selected.length ? (
                    <div className="space-y-3">
                      {dilemmaSummary.selected.map((selection) => (
                        <div
                          key={`${selection.dilemma_id}-${selection.option_id}`}
                          className="rounded-[24px] border border-cyan-400/15 bg-cyan-400/8 px-4 py-4 text-sm text-cyan-50"
                        >
                          You chose <span className="font-bold text-white">{selection.option_label}</span> for{" "}
                          <span className="font-bold text-white">{selection.dilemma_title}</span> {"->"}{" "}
                          {selection.outcome_description}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {visibleCausalInsights.length > 0 ? (
                    <div className="space-y-4">
                      {visibleCausalInsights.map((insight, index) => (
                        <div
                          key={`${insight.metric}-${index}-${insight.decision}`}
                          className={`rounded-[26px] border border-white/10 bg-slate-950/75 px-5 py-5 border-l-4 ${impactBorderTone(insight.impact)}`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="min-w-0 flex-1 space-y-3">
                              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{insight.decision}</div>
                              <div className="text-base font-bold leading-6 text-white">{insight.outcome}</div>
                              <div className="text-sm italic text-teal-300">{"\u2192"} {insight.advice}</div>
                            </div>
                            <div className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] ${impactBadgeTone(insight.impact)}`}>
                              {insight.metric}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/50 px-4 py-5 text-sm text-slate-400">
                      No standout causal signals were detected beyond the scorecard this round.
                    </div>
                  )}

                  {hiddenInsightCount > 0 ? (
                    <Button
                      variant="secondary"
                      className="w-full border-white/10 bg-slate-950 text-slate-200 hover:bg-slate-900"
                      onClick={() => setShowAllInsights(true)}
                    >
                      Show all insights ({causalInsights.length})
                    </Button>
                  ) : null}
                </CardBody>
              </Card>

              {aiDebrief ? (
                <Card className="border-white/10 bg-slate-900/70">
                  <CardHeader
                    title="AI Analysis"
                    subtitle="Deterministic coaching based on your round outcome and weakest execution concepts"
                  />
                  <CardBody className="space-y-5">
                    <div className="rounded-[24px] border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm text-cyan-50">
                      {aiDebrief.summary}
                    </div>

                    <div className="grid gap-4 xl:grid-cols-3">
                      <div className="rounded-[26px] border border-emerald-500/20 bg-slate-950/75 px-5 py-5">
                        <div className="text-sm font-black uppercase tracking-[0.18em] text-emerald-200">
                          Strengths
                        </div>
                        <div className="mt-1 text-xs text-slate-400">What held up well this round</div>
                        <div className="mt-4 flex flex-wrap gap-3">
                          {aiDebrief.strengths.map((item) => (
                            <div
                              key={item}
                              className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-50"
                            >
                              {item}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-[26px] border border-amber-500/20 bg-slate-950/75 px-5 py-5">
                        <div className="text-sm font-black uppercase tracking-[0.18em] text-amber-200">
                          Risks
                        </div>
                        <div className="mt-1 text-xs text-slate-400">Pressure points to watch next</div>
                        <div className="mt-4 flex flex-wrap gap-3">
                          {aiDebrief.risks.map((item) => (
                            <div
                              key={item}
                              className="rounded-full border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm text-amber-50"
                            >
                              {item}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-[26px] border border-teal-500/20 bg-slate-950/75 px-5 py-5">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-black uppercase tracking-[0.18em] text-teal-200">
                              Recommended Actions
                            </div>
                            <div className="mt-1 text-xs text-slate-400">Practice next before the next lock</div>
                          </div>
                          <Link
                            href={`/sessions/${sessionId}/round/${roundNumber}/practice`}
                            className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200 transition hover:text-cyan-100"
                          >
                            Open practice
                          </Link>
                        </div>
                        <div className="mt-4 flex flex-col gap-3">
                          {aiDebrief.actions.map((action) => (
                            <div
                              key={`${action.concept_code}-${action.title}`}
                              className="rounded-[22px] border border-teal-500/20 bg-teal-500/10 px-4 py-3 text-sm text-teal-50"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="text-sm font-bold text-white">{action.title}</div>
                                <div className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-200">
                                  {action.concept_code} | {action.practice_minutes} min
                                </div>
                              </div>
                              <div className="mt-2 text-teal-50/90">{action.why}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              ) : null}

              <Card className="border-white/10 bg-slate-900/70">
                <CardHeader title="Performance Across All Rounds" subtitle="Smooth trend view for schedule, cost, quality, safety, and scaled points" />
                <CardBody className="space-y-4">
                  <PerformanceHistoryChart rows={historyRows} />
                  <div className="rounded-[22px] border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
                    Left axis shows SPI/CPI on a 0-1.2 range. Right axis shows Quality, Safety, and Points/100 on a 0-100 range.
                  </div>
                </CardBody>
              </Card>
            </>
          )}
        </div>
      </main>
    </RequireAuth>
  );
}
