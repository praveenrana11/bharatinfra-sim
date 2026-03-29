"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Tooltip } from "@/components/ui/Tooltip";
import { buildDeterministicRoundDebrief } from "@/lib/aiDebrief";
import { generateCausalInsights } from "@/lib/causalDebrief";
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
  detail: Record<string, unknown> | null;
};

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function formatCurrencyInr(value: number) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(value);
}

function toNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function metricBadgeTone(metric: string) {
  if (metric === "SPI") return "border-cyan-400/20 bg-cyan-400/10 text-cyan-100";
  if (metric === "CPI") return "border-amber-400/25 bg-amber-400/10 text-amber-100";
  if (metric === "Safety") return "border-rose-400/25 bg-rose-400/10 text-rose-100";
  if (metric === "Quality") return "border-violet-400/25 bg-violet-400/10 text-violet-100";
  if (metric === "Stakeholder") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-100";
  if (metric === "KPI") return "border-fuchsia-400/25 bg-fuchsia-400/10 text-fuchsia-100";
  return "border-white/10 bg-white/5 text-slate-200";
}

function impactBorderTone(impact: "positive" | "negative" | "neutral") {
  if (impact === "positive") return "border-l-emerald-400";
  if (impact === "negative") return "border-l-rose-400";
  return "border-l-slate-500";
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
      label: "Below average - review your focus allocation",
      tone: "text-rose-300",
      badge: "border-rose-500/30 bg-rose-500/15 text-rose-200",
      bar: "from-rose-500 to-orange-500",
    };
  }

  if (points <= 500) {
    return {
      label: "Average performance",
      tone: "text-amber-300",
      badge: "border-amber-500/30 bg-amber-500/15 text-amber-100",
      bar: "from-amber-400 to-yellow-400",
    };
  }

  if (points <= 700) {
    return {
      label: "Strong round",
      tone: "text-emerald-300",
      badge: "border-emerald-500/30 bg-emerald-500/15 text-emerald-100",
      bar: "from-emerald-400 to-teal-400",
    };
  }

  return {
    label: "Exceptional - top quartile performance",
    tone: "text-cyan-200",
    badge: "border-cyan-400/30 bg-cyan-400/15 text-cyan-100",
    bar: "from-cyan-400 to-sky-400",
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
  const [decision, setDecision] = useState<DecisionRow | null>(null);
  const [result, setResult] = useState<TeamResultRow | null>(null);
  const [previousResult, setPreviousResult] = useState<TeamResultRow | null>(null);
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
        .select("id,session_id,team_name,total_points,kpi_target")
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
        "session_id,team_id,round_number,schedule_index,cost_index,cash_closing,quality_score,safety_score,stakeholder_score,claim_entitlement_score,points_earned,penalties,detail";

      const [resultResponse, decisionResponse, previousResultResponse] = await Promise.all([
        supabase
          .from("team_results")
          .select(teamResultSelect)
          .eq("session_id", sessionId)
          .eq("team_id", myTeam.id)
          .eq("round_number", roundNumber)
          .maybeSingle(),
        supabase
          .from("decisions")
          .select(
            "focus_cost,focus_quality,focus_stakeholder,focus_speed,risk_appetite,governance_intensity,buffer_percent,vendor_strategy,raw"
          )
          .eq("session_id", sessionId)
          .eq("team_id", myTeam.id)
          .eq("round_number", roundNumber)
          .maybeSingle(),
        roundNumber > 1
          ? supabase
              .from("team_results")
              .select(teamResultSelect)
              .eq("session_id", sessionId)
              .eq("team_id", myTeam.id)
              .eq("round_number", roundNumber - 1)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (resultResponse.error) {
        if (!cancelled) {
          setError(resultResponse.error.message);
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

      if (previousResultResponse.error) {
        if (!cancelled) {
          setError(previousResultResponse.error.message);
          setLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setSession((sessionResponse.data as SessionRow | null) ?? null);
        setTeam(myTeam);
        setDecision((decisionResponse.data as DecisionRow | null) ?? null);
        setResult((resultResponse.data as TeamResultRow | null) ?? null);
        setPreviousResult((previousResultResponse.data as TeamResultRow | null) ?? null);
        setLoading(false);
      }
    };

    void loadResults();

    return () => {
      cancelled = true;
    };
  }, [roundNumber, sessionId, supabase]);

  useEffect(() => {
    setShowAllInsights(false);
  }, [roundNumber, result?.team_id]);

  const pointsThisRound = Math.max(0, Math.round(result?.points_earned ?? 0));
  const pointsPerformance = getRoundPerformance(pointsThisRound);
  const roundPerformancePct = clampPercent((pointsThisRound / 800) * 100);
  const cashClosing = result?.cash_closing ?? 0;
  const cashState = getCashClosingState(cashClosing);
  const resultDetail = (result?.detail ?? null) as Record<string, any> | null;
  const latePenalty = toNumber(resultDetail?.kpi?.late_points_penalty, 0);
  const basePoints = Math.round(toNumber(resultDetail?.kpi?.base_points, pointsThisRound));
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
                  <CardHeader
                    title="Round performance"
                    subtitle="Scoring benchmark against the round maximum"
                  />
                  <CardBody className="space-y-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
                          Points earned
                        </div>
                        <div className="mt-2 text-4xl font-black tracking-tight text-white">
                          {pointsThisRound} pts this round
                        </div>
                      </div>
                      <div className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${pointsPerformance.badge}`}>
                        {pointsPerformance.label}
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                        <span>Round performance</span>
                        <span className={pointsPerformance.tone}>{Math.round(roundPerformancePct)}% of 800</span>
                      </div>
                      <div className="h-3 rounded-full bg-slate-800">
                        <div
                          className={`h-3 rounded-full bg-gradient-to-r ${pointsPerformance.bar}`}
                          style={{ width: `${roundPerformancePct}%` }}
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-4">
                        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                          Base points
                        </div>
                        <div className="mt-2 text-2xl font-black text-white">{basePoints}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-4">
                        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                          Penalties
                        </div>
                        <div className="mt-2 text-2xl font-black text-white">{Math.round(result.penalties ?? 0)}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-4">
                        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                          Late penalty
                        </div>
                        <div className="mt-2 text-2xl font-black text-white">{latePenalty}</div>
                      </div>
                    </div>
                  </CardBody>
                </Card>

                <Card className="border-white/10 bg-slate-900/70">
                  <CardHeader
                    title="Cash closing"
                    subtitle="Round-end cash signal"
                    right={
                      <Tooltip
                        title="Cash closing"
                        lines={[
                          "Cash closing = revenue received minus all project costs this round.",
                          "Persistent negative cash increases CPI pressure in future rounds.",
                        ]}
                      />
                    }
                  />
                  <CardBody className="space-y-5">
                    <div className={`text-4xl font-black tracking-tight ${cashState.amountTone}`}>
                      Rs {formatCurrencyInr(cashClosing)}
                    </div>
                    <div className={`rounded-2xl border px-4 py-4 text-sm font-semibold ${cashState.badge}`}>
                      {cashState.label}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-4">
                        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                          CPI
                        </div>
                        <div className="mt-2 text-2xl font-black text-white">
                          {toNumber(result.cost_index, 0).toFixed(2)}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-4">
                        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                          Total team points
                        </div>
                        <div className="mt-2 text-2xl font-black text-white">
                          {Math.round(team?.total_points ?? pointsThisRound)}
                        </div>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              </div>

              <Card className="border-white/10 bg-slate-900/70">
                <CardHeader
                  title="Round scorecard"
                  subtitle="Execution, quality, and stakeholder outcomes from this locked round"
                />
                <CardBody>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-4">
                      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">SPI</div>
                      <div className="mt-2 text-3xl font-black text-white">
                        {toNumber(result.schedule_index, 0).toFixed(2)}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-4">
                      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Quality</div>
                      <div className="mt-2 text-3xl font-black text-white">
                        {Math.round(result.quality_score ?? 0)}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-4">
                      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Safety</div>
                      <div className="mt-2 text-3xl font-black text-white">
                        {Math.round(result.safety_score ?? 0)}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-4">
                      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                        Stakeholder
                      </div>
                      <div className="mt-2 text-3xl font-black text-white">
                        {Math.round(result.stakeholder_score ?? 0)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.16em]">
                    {kpiTarget && kpiEvaluation ? (
                      <div
                        className={`rounded-full border px-3 py-1.5 ${
                          kpiEvaluation.achieved
                            ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-100"
                            : "border-amber-500/30 bg-amber-500/15 text-amber-100"
                        }`}
                      >
                        KPI {kpiEvaluation.achieved ? "hit" : "miss"} - {kpiEvaluation.thresholdLabel}
                      </div>
                    ) : null}
                    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-slate-300">
                      Claim entitlement {Math.round(result.claim_entitlement_score ?? 0)}
                    </div>
                  </div>
                </CardBody>
              </Card>

              <Card className="border-white/10 bg-slate-900/70">
                <CardHeader
                  title="What Happened This Round"
                  subtitle="Cause-and-effect signals from your decisions, score shifts, and round shocks"
                />
                <CardBody className="space-y-4">
                  {visibleCausalInsights.length > 0 ? (
                    <div className="space-y-3">
                      {visibleCausalInsights.map((insight, index) => (
                        <div
                          key={`${insight.metric}-${index}-${insight.decision}`}
                          className={`flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-4 border-l-4 ${impactBorderTone(insight.impact)}`}
                        >
                          <div className="min-w-0 space-y-2">
                            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                              {insight.decision}
                            </div>
                            <div className="text-base font-bold leading-6 text-white">{insight.outcome}</div>
                            <div className="text-sm italic text-teal-300">
                              Next round: {insight.advice}
                            </div>
                          </div>
                          <div
                            className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] ${metricBadgeTone(insight.metric)}`}
                          >
                            {insight.metric}
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
                    title="AI Debrief"
                    subtitle="Deterministic coaching based on your round outcome and weakest execution concepts"
                  />
                  <CardBody className="space-y-5">
                    <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm text-cyan-50">
                      {aiDebrief.summary}
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-4">
                        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                          Strengths
                        </div>
                        <div className="mt-3 space-y-2 text-sm text-slate-200">
                          {aiDebrief.strengths.map((item) => (
                            <div key={item} className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 px-3 py-3">
                              {item}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-4">
                        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                          Risks To Watch
                        </div>
                        <div className="mt-3 space-y-2 text-sm text-slate-200">
                          {aiDebrief.risks.map((item) => (
                            <div key={item} className="rounded-xl border border-amber-500/15 bg-amber-500/5 px-3 py-3">
                              {item}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                          Practice Actions
                        </div>
                        <Link
                          href={`/sessions/${sessionId}/round/${roundNumber}/practice`}
                          className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200 transition hover:text-cyan-100"
                        >
                          Open practice
                        </Link>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        {aiDebrief.actions.map((action) => (
                          <div
                            key={`${action.concept_code}-${action.title}`}
                            className="rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-4"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-bold text-white">{action.title}</div>
                              <div className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">
                                {action.concept_code}
                              </div>
                            </div>
                            <div className="mt-2 text-sm text-slate-300">{action.why}</div>
                            <div className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">
                              {action.practice_minutes} min drill
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardBody>
                </Card>
              ) : null}
            </>
          )}
        </div>
      </main>
    </RequireAuth>
  );
}
