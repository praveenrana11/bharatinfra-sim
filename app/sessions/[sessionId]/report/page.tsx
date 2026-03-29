"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { formatStatus } from "@/lib/formatters";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { parseKpiTarget, evaluateKpiAchievement } from "@/lib/kpi";
import { RoundResult } from "@/lib/simEngine";

type RouteParams = { sessionId?: string };

type SessionRow = {
  id: string;
  name: string | null;
  code: string;
  status: string;
  round_count: number;
  current_round: number;
  created_by: string;
};

type MembershipRow = { team_id: string };

type TeamRow = {
  id: string;
  session_id: string;
  team_name: string;
  total_points: number | null;
  kpi_target: string | null;
};

type SessionTeamRow = {
  id: string;
  team_name: string;
};

type SessionScoreRow = {
  team_id: string;
  round_number: number;
  points_earned: number | null;
};

type TeamResultRow = {
  session_id: string;
  team_id: string;
  round_number: number;
  schedule_index: number;
  cost_index: number;
  cash_closing: number;
  quality_score: number;
  safety_score: number;
  stakeholder_score: number;
  claim_entitlement_score: number;
  points_earned: number;
  penalties: number;
  detail: Record<string, unknown>;
};

type WhatIfScenarioRow = {
  id: string;
  user_id: string;
  session_id: string;
  team_id: string;
  scenario_name: string;
  mode: WhatIfModeKey;
  capex_shift: number;
  subcontract_share: number;
  risk_control_budget: number;
  notes: string | null;
  projected_points: number | null;
  projected_rank: number | null;
  projected_debt: number | null;
  confidence: "High" | "Medium" | "Low" | null;
  created_at: string;
  updated_at: string;
};

type PromotionHistoryRow = {
  id: string;
  user_id: string;
  session_id: string;
  team_id: string;
  target_round: number;
  source_scenario_name: string | null;
  promotion_payload: unknown;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
};
type YearRow = {
  fy: string;
  round_number: number;
  points: number;
  penalties: number;
  spi: number;
  cpi: number;
  quality: number;
  safety: number;
  stakeholder: number;
  cash: number;
  kpi_hit: boolean;
  kpi_threshold_label: string;
  kpi_base_points: number;
  kpi_multiplier: number;
  kpi_multiplied_points: number;
  kpi_late_points_penalty: number;
  kpi_final_points: number;
  risk_debt_total: number;
  risk_debt_delivery: number;
  risk_debt_quality: number;
  risk_debt_safety: number;
  risk_debt_stakeholder: number;
  risk_debt_compliance: number;
  risk_debt_cash: number;
};

type DebtMetricKey = "total" | "delivery" | "quality" | "safety" | "compliance" | "cash";

type DebtMetric = {
  key: DebtMetricKey;
  label: string;
  color: string;
  value: (row: YearRow) => number;
};

type RankRound = {
  round_number: number;
  fy: string;
  rank: number;
  points: number;
  rank_delta: number;
  points_delta: number;
  change_reason: string;
};

type WhatIfModeKey = "stabilize" | "balanced" | "attack";

type WhatIfMode = {
  key: WhatIfModeKey;
  label: string;
  subtitle: string;
  pointsBias: number;
  debtBias: number;
  spiBias: number;
  cpiBias: number;
  confidence: "high" | "medium";
};
type TrendMetricKey = "points" | "spi" | "cpi" | "quality" | "safety" | "stakeholder";

type TrendMetric = {
  key: TrendMetricKey;
  label: string;
  color: string;
  value: (row: YearRow) => number;
};

type BenchmarkPoint = {
  round_number: number;
  fy: string;
  value: number;
  x: number;
  y: number;
};

type BenchmarkSeries = {
  team_id: string;
  team_name: string;
  rank: number;
  final_points: number;
  color: string;
  is_my_team: boolean;
  points: BenchmarkPoint[];
  path: string;
};

const TREND_METRICS: TrendMetric[] = [
  { key: "points", label: "Points", color: "#0f766e", value: (row) => row.points },
  { key: "spi", label: "SPI", color: "#0284c7", value: (row) => row.spi },
  { key: "cpi", label: "CPI", color: "#6366f1", value: (row) => row.cpi },
  { key: "quality", label: "Quality", color: "#16a34a", value: (row) => row.quality },
  { key: "safety", label: "Safety", color: "#ea580c", value: (row) => row.safety },
  { key: "stakeholder", label: "Stakeholder", color: "#dc2626", value: (row) => row.stakeholder },
];

const DEBT_METRICS: DebtMetric[] = [
  { key: "total", label: "Debt Total", color: "#dc2626", value: (row) => row.risk_debt_total },
  { key: "delivery", label: "Delivery", color: "#0ea5e9", value: (row) => row.risk_debt_delivery },
  { key: "quality", label: "Quality", color: "#f59e0b", value: (row) => row.risk_debt_quality },
  { key: "safety", label: "Safety", color: "#16a34a", value: (row) => row.risk_debt_safety },
  { key: "compliance", label: "Compliance", color: "#9333ea", value: (row) => row.risk_debt_compliance },
  { key: "cash", label: "Cash", color: "#475569", value: (row) => row.risk_debt_cash },
];

const BENCHMARK_COLORS = [
  "#0f766e",
  "#2563eb",
  "#7c3aed",
  "#dc2626",
  "#16a34a",
  "#ea580c",
  "#0891b2",
  "#be123c",
];

const WHAT_IF_MODES: WhatIfMode[] = [
  {
    key: "stabilize",
    label: "Stabilize",
    subtitle: "Protect downside and clear debt carry-over.",
    pointsBias: 4,
    debtBias: -24,
    spiBias: 0.03,
    cpiBias: 0.04,
    confidence: "high",
  },
  {
    key: "balanced",
    label: "Balanced",
    subtitle: "Moderate growth with controlled risk.",
    pointsBias: 9,
    debtBias: -8,
    spiBias: 0.015,
    cpiBias: 0.015,
    confidence: "high",
  },
  {
    key: "attack",
    label: "Attack",
    subtitle: "Push rank aggressively with higher execution strain.",
    pointsBias: 14,
    debtBias: 16,
    spiBias: 0.01,
    cpiBias: -0.03,
    confidence: "medium",
  },
];
function isMissingTableError(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("does not exist") ||
    lower.includes("relation") ||
    lower.includes("42p01") ||
    lower.includes("schema cache") ||
    lower.includes("could not find the table")
  );
}

function buildPromotionPayload(scenario: WhatIfScenarioRow): Record<string, unknown> {
  const mode = scenario.mode;
  const capexShift = clamp(scenario.capex_shift, -20, 20);
  const subcontractShare = clamp(scenario.subcontract_share, 0, 100);
  const riskControlBudget = clamp(scenario.risk_control_budget, 0, 25);

  const selfPerformPercent = clamp(100 - subcontractShare, 20, 90);
  const riskControlIndex = clamp(Math.round((riskControlBudget / 25) * 100), 0, 100);

  const focusByMode: Record<WhatIfModeKey, { cost: number; quality: number; stakeholder: number; speed: number }> = {
    stabilize: { cost: 22, quality: 30, stakeholder: 30, speed: 18 },
    balanced: { cost: 25, quality: 25, stakeholder: 25, speed: 25 },
    attack: { cost: 30, quality: 20, stakeholder: 15, speed: 35 },
  };

  const focus = focusByMode[mode];

  const riskAppetite = mode === "attack" ? "Aggressive" : mode === "stabilize" ? "Conservative" : "Balanced";
  const governance =
    mode === "stabilize"
      ? "High"
      : mode === "attack" && riskControlBudget < 8
      ? "Low"
      : "Medium";

  const marketExpansion =
    mode === "attack" && capexShift >= 6
      ? "Scale Two New Regions"
      : mode !== "stabilize" && capexShift > 0
      ? "Pilot One New Region"
      : "Consolidate Existing Regions";

  const subcontractorProfile =
    subcontractShare >= 70
      ? mode === "attack"
        ? "Tier 3 Fast Track"
        : "Tier 1 Proven"
      : subcontractShare >= 45
      ? "Tier 2 Value"
      : "Tier 1 Proven";

  const compliancePosture =
    riskControlBudget >= 10
      ? "Strict Compliance"
      : mode === "attack"
      ? "Pragmatic"
      : "Pragmatic";

  const qaFrequency = riskControlBudget >= 16 ? "Weekly" : riskControlBudget >= 7 ? "Biweekly" : mode === "attack" ? "Monthly" : "Biweekly";

  return {
    focus_cost: focus.cost,
    focus_quality: focus.quality,
    focus_stakeholder: focus.stakeholder,
    focus_speed: focus.speed,
    risk_appetite: riskAppetite,
    governance_intensity: governance,
    buffer_percent: clamp(mode === "attack" ? 4 : mode === "stabilize" ? 8 : 6, 0, 20),
    vendor_strategy: mode === "stabilize" ? "Reliable" : mode === "attack" ? "Cheapest" : "Balanced",

    strategic_posture:
      mode === "attack" ? "Cost Leadership" : mode === "stabilize" ? "Stakeholder Trust" : "Balanced Portfolio",
    market_expansion: marketExpansion,

    self_perform_percent: selfPerformPercent,
    subcontractor_profile: subcontractorProfile,
    specialized_work_index: clamp(50 + capexShift, 20, 90),

    workforce_plan: mode === "attack" ? "Acceleration Hiring" : "Balanced Hiring",
    workforce_load_state:
      mode === "attack" && selfPerformPercent > 60
        ? "Overloaded"
        : mode === "stabilize" && riskControlBudget >= 10
        ? "Balanced"
        : "Balanced",
    work_life_balance_index: clamp(mode === "attack" ? 44 : 55 + Math.round(riskControlBudget * 0.8), 30, 85),
    training_intensity: clamp(45 + Math.round(riskControlBudget * 2), 30, 95),
    overtime_policy: mode === "attack" ? "High Intensity" : "Flexible",

    qa_audit_frequency: qaFrequency,
    innovation_budget_index: clamp(50 + capexShift * 2, 10, 95),

    logistics_resilience: riskControlBudget >= 14 ? "High Resilience" : "Balanced",
    inventory_cover_weeks: clamp(3 + Math.round(riskControlBudget / 8), 2, 8),
    pm_utilization_target: clamp(70 + (mode === "attack" ? 7 : 2) - Math.round(riskControlBudget / 6), 60, 88),

    digital_visibility_spend: clamp(50 + (mode === "attack" ? 10 : 2), 25, 95),
    community_engagement: clamp(45 + Math.round(riskControlIndex * 0.35), 25, 95),
    transparency_level: riskControlBudget >= 14 ? "Public Dashboard" : riskControlBudget >= 8 ? "Proactive" : "Standard",

    compliance_posture: compliancePosture,
    facilitation_budget_index: clamp(mode === "attack" && riskControlBudget < 6 ? 18 : mode === "attack" ? 8 : 0, 0, 30),
    csr_sustainability_index: clamp(40 + Math.round(riskControlIndex * 0.5), 20, 95),

    financing_posture: mode === "attack" ? "Growth Debt" : mode === "stabilize" ? "Cash First" : "Balanced Debt",
    cash_buffer_months: clamp(mode === "stabilize" ? 4 + Math.round(riskControlBudget / 8) : mode === "attack" ? 3 : 4, 2, 8),
    contingency_fund_percent: clamp(8 + Math.round(riskControlBudget * 0.2), 5, 16),

    external_context: "Stable Environment",
    public_message_tone: mode === "attack" ? "Aggressive" : mode === "stabilize" ? "Collaborative" : "Confident",
    project_mix_public_pct: clamp(55 + Math.round(riskControlBudget * 0.6), 35, 90),
    bid_aggressiveness: clamp(mode === "attack" ? 4 : mode === "stabilize" ? 2 : 3, 1, 5),

    promotion_source: "what_if_compare_5e7",
    promotion_source_name: scenario.scenario_name,
  };
}
function formatCurrencyInr(value: number) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDelta(delta: number) {
  if (delta > 0) return `+${delta}`;
  return `${delta}`;
}

function formatSignedFixed(delta: number, digits = 2) {
  const rounded = Number(delta.toFixed(digits));
  if (rounded > 0) return `+${rounded.toFixed(digits)}`;
  return rounded.toFixed(digits);
}

function formatTimestampCompact(iso: string | null | undefined) {
  if (!iso) return "-";
  const stamp = iso.replace("T", " ").replace("Z", " UTC");
  return stamp.length >= 16 ? stamp.slice(0, 16) : stamp;
}
function toNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
function toNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalize(values: number[]) {
  const min = Math.min(...values);
  const max = Math.max(...values);

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return values.map(() => 50);
  }

  if (Math.abs(max - min) < 0.000001) {
    return values.map(() => 50);
  }

  return values.map((value) => ((value - min) / (max - min)) * 100);
}

function polylinePath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  return `M ${first.x.toFixed(2)} ${first.y.toFixed(2)} ${rest
    .map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ")}`;
}

function escapeCsvCell(value: unknown) {
  const raw = value === null || value === undefined ? "" : String(value);
  const escaped = raw.replace(/"/g, '""');
  return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
}

function buildCsv(headers: string[], rows: Array<Array<unknown>>) {
  const lines = [headers.map((header) => escapeCsvCell(header)).join(",")];
  for (const row of rows) {
    lines.push(row.map((cell) => escapeCsvCell(cell)).join(","));
  }
  return lines.join("\n");
}

function downloadTextFile(filename: string, text: string, mimeType: string) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function SessionFinancialReportPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseClient(), []);

  const routeParams = params as RouteParams;
  const sessionId = routeParams.sessionId ?? "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [session, setSession] = useState<SessionRow | null>(null);
  const [team, setTeam] = useState<TeamRow | null>(null);
  const [isFacilitator, setIsFacilitator] = useState(false);
  const [rows, setRows] = useState<TeamResultRow[]>([]);
  const [sessionTeams, setSessionTeams] = useState<SessionTeamRow[]>([]);
  const [sessionScores, setSessionScores] = useState<SessionScoreRow[]>([]);
  const [benchmarkError, setBenchmarkError] = useState("");

  const [whatIfMode, setWhatIfMode] = useState<WhatIfModeKey>("balanced");
  const [whatIfCapexShift, setWhatIfCapexShift] = useState(0);
  const [whatIfSubcontractShare, setWhatIfSubcontractShare] = useState(45);
  const [whatIfRiskControlBudget, setWhatIfRiskControlBudget] = useState(12);

  const [userId, setUserId] = useState("");
  const [scenarioName, setScenarioName] = useState("Balanced Base");
  const [scenarioNotes, setScenarioNotes] = useState("");
  const [savedScenarios, setSavedScenarios] = useState<WhatIfScenarioRow[]>([]);
  const [promotionHistory, setPromotionHistory] = useState<PromotionHistoryRow[]>([]);
  const [promotionHistoryReady, setPromotionHistoryReady] = useState(true);
  const [promotionHistoryError, setPromotionHistoryError] = useState("");
  const [compareLeftScenarioId, setCompareLeftScenarioId] = useState("");
  const [compareRightScenarioId, setCompareRightScenarioId] = useState("");
  const [scenarioSaving, setScenarioSaving] = useState(false);
  const [scenarioBusyId, setScenarioBusyId] = useState<string | null>(null);
  const [scenarioError, setScenarioError] = useState("");
  const [scenarioMessage, setScenarioMessage] = useState("");
  const [promotionBusyKey, setPromotionBusyKey] = useState<"left" | "right" | null>(null);
  const [promotionMessage, setPromotionMessage] = useState("");

  const [drilldownRound, setDrilldownRound] = useState<number | null>(null);
  const [drilldownScheduleEffort, setDrilldownScheduleEffort] = useState(55);
  const [drilldownCostControl, setDrilldownCostControl] = useState(55);
  const [drilldownQualitySafety, setDrilldownQualitySafety] = useState(55);
  const [drilldownActionBusy, setDrilldownActionBusy] = useState<"save" | "promote" | null>(null);
  const [drilldownActionError, setDrilldownActionError] = useState("");
  const [drilldownActionMessage, setDrilldownActionMessage] = useState("");

  const loadSavedScenarios = useCallback(
    async (uid: string, tid: string) => {
      const { data, error: scenarioErr } = await supabase
        .from("what_if_scenarios")
        .select(
          "id,user_id,session_id,team_id,scenario_name,mode,capex_shift,subcontract_share,risk_control_budget,notes,projected_points,projected_rank,projected_debt,confidence,created_at,updated_at"
        )
        .eq("user_id", uid)
        .eq("session_id", sessionId)
        .eq("team_id", tid)
        .order("updated_at", { ascending: false });

      if (scenarioErr) {
        setSavedScenarios([]);
        setScenarioError(
          isMissingTableError(scenarioErr.message)
            ? "Scenario presets are unavailable right now."
            : scenarioErr.message
        );
        return;
      }

      setSavedScenarios((data ?? []) as WhatIfScenarioRow[]);
      setScenarioError("");
    },
    [sessionId, supabase]
  );

  const loadPromotionHistory = useCallback(
    async (uid: string, tid: string) => {
      const { data, error: promotionErr } = await supabase
        .from("scenario_promotions")
        .select("id,user_id,session_id,team_id,target_round,source_scenario_name,promotion_payload,applied_at,created_at,updated_at")
        .eq("user_id", uid)
        .eq("session_id", sessionId)
        .eq("team_id", tid)
        .order("target_round", { ascending: true })
        .order("updated_at", { ascending: false });

      if (promotionErr) {
        if (isMissingTableError(promotionErr.message)) {
          setPromotionHistoryReady(false);
          setPromotionHistoryError("");
          setPromotionHistory([]);
          return;
        }

        setPromotionHistoryReady(true);
        setPromotionHistoryError(promotionErr.message);
        setPromotionHistory([]);
        return;
      }

      setPromotionHistoryReady(true);
      setPromotionHistoryError("");
      setPromotionHistory((data ?? []) as PromotionHistoryRow[]);
    },
    [sessionId, supabase]
  );

  useEffect(() => {
    if (savedScenarios.length === 0) {
      if (compareLeftScenarioId !== "") setCompareLeftScenarioId("");
      if (compareRightScenarioId !== "") setCompareRightScenarioId("");
      return;
    }

    const first = savedScenarios[0];
    const second = savedScenarios[1] ?? savedScenarios[0];

    if (!compareLeftScenarioId || !savedScenarios.some((row) => row.id === compareLeftScenarioId)) {
      setCompareLeftScenarioId(first.id);
    }

    const rightInvalid = !compareRightScenarioId || !savedScenarios.some((row) => row.id === compareRightScenarioId);
    const rightSameAsLeft = compareRightScenarioId === compareLeftScenarioId;

    if (rightInvalid || rightSameAsLeft) {
      setCompareRightScenarioId(second.id);
    }
  }, [compareLeftScenarioId, compareRightScenarioId, savedScenarios]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");

      if (!sessionId) {
        setError("Session id missing in URL.");
        setLoading(false);
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        router.replace("/login");
        return;
      }
      setUserId(user.id);
      const { data: sessionData, error: sessionErr } = await supabase
        .from("sessions")
        .select("id,name,code,status,round_count,current_round,created_by")
        .eq("id", sessionId)
        .maybeSingle();

      if (sessionErr) {
        setError(sessionErr.message);
        setLoading(false);
        return;
      }

      const sessionRow = (sessionData as SessionRow | null) ?? null;
      if (!sessionRow) {
        setError("Session not found.");
        setLoading(false);
        return;
      }
      setSession(sessionRow);
      setIsFacilitator(sessionRow.created_by === user.id);

      const { data: membershipData, error: membershipErr } = await supabase
        .from("team_memberships")
        .select("team_id")
        .eq("user_id", user.id);

      if (membershipErr) {
        setError(membershipErr.message);
        setLoading(false);
        return;
      }

      const teamIds = ((membershipData ?? []) as MembershipRow[]).map((row) => row.team_id);
      if (teamIds.length === 0) {
        setError("No team membership found for this user.");
        setLoading(false);
        return;
      }

      const { data: teamData, error: teamErr } = await supabase
        .from("teams")
        .select("id,session_id,team_name,total_points,kpi_target")
        .in("id", teamIds)
        .eq("session_id", sessionId)
        .maybeSingle();

      if (teamErr) {
        setError(teamErr.message);
        setLoading(false);
        return;
      }

      const teamRow = (teamData as TeamRow | null) ?? null;
      if (!teamRow) {
        setError("You are not a member of this session.");
        setLoading(false);
        return;
      }
      setTeam(teamRow);
      await Promise.all([loadSavedScenarios(user.id, teamRow.id), loadPromotionHistory(user.id, teamRow.id)]);

      const { data: resultsData, error: resultsErr } = await supabase
        .from("team_results")
        .select(
          "session_id,team_id,round_number,schedule_index,cost_index,cash_closing,quality_score,safety_score,stakeholder_score,claim_entitlement_score,points_earned,penalties,detail"
        )
        .eq("session_id", sessionId)
        .eq("team_id", teamRow.id)
        .order("round_number", { ascending: true });

      if (resultsErr) {
        setError(resultsErr.message);
        setLoading(false);
        return;
      }

      setRows((resultsData ?? []) as TeamResultRow[]);

      try {
        const [{ data: teamsData, error: teamsErr }, { data: scoresData, error: scoresErr }] = await Promise.all([
          supabase.from("teams").select("id,team_name").eq("session_id", sessionId),
          supabase.from("team_results").select("team_id,round_number,points_earned").eq("session_id", sessionId),
        ]);

        if (teamsErr) throw teamsErr;
        if (scoresErr) throw scoresErr;

        setSessionTeams((teamsData ?? []) as SessionTeamRow[]);
        setSessionScores((scoresData ?? []) as SessionScoreRow[]);
        setBenchmarkError("");
      } catch (unknownError: unknown) {
        const message =
          unknownError instanceof Error ? unknownError.message : "Could not load session benchmark for this report.";
        setBenchmarkError(message);
        setSessionTeams([]);
        setSessionScores([]);
      }

      setLoading(false);
    })();
  }, [loadPromotionHistory, loadSavedScenarios, router, sessionId, supabase]);

  const yearRows: YearRow[] = useMemo(() => {
    const teamKpi = parseKpiTarget(team?.kpi_target);

    return rows.map((row) => {
      const detail = toRecord(row.detail);
      const kpi = toRecord(detail?.kpi);
      const kpiHitFromDetail = typeof kpi?.achieved === "boolean" ? kpi.achieved : null;
      const computed = teamKpi ? evaluateKpiAchievement(teamKpi, row as unknown as RoundResult).achieved : false;
      const kpiHit = kpiHitFromDetail ?? computed;
      const kpiMultiplierRaw = toNullableNumber(kpi?.multiplier);
      const kpiMultiplier = Math.max(1, Math.round(kpiMultiplierRaw ?? (kpiHit ? 4 : 1)));
      const pointsEarned = row.points_earned ?? 0;
      const kpiBasePoints = Math.max(
        0,
        Math.round(toNullableNumber(kpi?.base_points) ?? (kpiMultiplier > 1 ? pointsEarned / kpiMultiplier : pointsEarned))
      );
      const kpiMultipliedPoints = Math.max(0, Math.round(toNullableNumber(kpi?.multiplied_points) ?? kpiBasePoints * kpiMultiplier));
      const kpiLatePointsPenalty = Math.max(0, Math.round(toNullableNumber(kpi?.late_points_penalty) ?? 0));
      const kpiFinalPoints = Math.max(0, Math.round(toNullableNumber(kpi?.final_points) ?? pointsEarned));
      const kpiThresholdLabel = typeof kpi?.threshold_label === "string" ? kpi.threshold_label : "No KPI target selected";

      const debt = toRecord(detail?.riskDebt);
      const debtTotals = toRecord(detail?.riskDebtTotals);

      const debtDelivery = clamp(toNumber(debt?.delivery), 0, 100);
      const debtQuality = clamp(toNumber(debt?.quality), 0, 100);
      const debtSafety = clamp(toNumber(debt?.safety), 0, 100);
      const debtStakeholder = clamp(toNumber(debt?.stakeholder), 0, 100);
      const debtCompliance = clamp(toNumber(debt?.compliance), 0, 100);
      const debtCash = clamp(toNumber(debt?.cash), 0, 100);

      const debtTotalFromDetail = toNumber(debtTotals?.current, -1);
      const debtTotalDerived = debtDelivery + debtQuality + debtSafety + debtStakeholder + debtCompliance + debtCash;

      return {
        fy: `FY ${row.round_number}`,
        round_number: row.round_number,
        points: row.points_earned ?? 0,
        penalties: row.penalties ?? 0,
        spi: row.schedule_index ?? 0,
        cpi: row.cost_index ?? 0,
        quality: row.quality_score ?? 0,
        safety: row.safety_score ?? 0,
        stakeholder: row.stakeholder_score ?? 0,
        cash: row.cash_closing ?? 0,
        kpi_hit: kpiHit,
        kpi_threshold_label: kpiThresholdLabel,
        kpi_base_points: kpiBasePoints,
        kpi_multiplier: kpiMultiplier,
        kpi_multiplied_points: kpiMultipliedPoints,
        kpi_late_points_penalty: kpiLatePointsPenalty,
        kpi_final_points: kpiFinalPoints,
        risk_debt_total: clamp(debtTotalFromDetail >= 0 ? debtTotalFromDetail : debtTotalDerived, 0, 600),
        risk_debt_delivery: debtDelivery,
        risk_debt_quality: debtQuality,
        risk_debt_safety: debtSafety,
        risk_debt_stakeholder: debtStakeholder,
        risk_debt_compliance: debtCompliance,
        risk_debt_cash: debtCash,
      };
    });
  }, [rows, team?.kpi_target]);

  useEffect(() => {
    if (yearRows.length === 0) {
      if (drilldownRound !== null) setDrilldownRound(null);
      return;
    }

    const hasRound = drilldownRound !== null && yearRows.some((row) => row.round_number === drilldownRound);
    if (!hasRound) {
      setDrilldownRound(yearRows[yearRows.length - 1].round_number);
    }
  }, [drilldownRound, yearRows]);

  const drilldownModel = useMemo(() => {
    if (yearRows.length === 0 || drilldownRound === null) return null;

    const currentIndex = yearRows.findIndex((row) => row.round_number === drilldownRound);
    if (currentIndex < 0) return null;

    const current = yearRows[currentIndex];
    const previous = currentIndex > 0 ? yearRows[currentIndex - 1] : null;

    const scheduleLift = (drilldownScheduleEffort - 50) / 50;
    const costLift = (drilldownCostControl - 50) / 50;
    const qualityLift = (drilldownQualitySafety - 50) / 50;
    const debtPressure = current.risk_debt_total / 600;

    const projectedSpi = clamp(current.spi + scheduleLift * 0.1 + qualityLift * 0.03 - debtPressure * 0.08, 0.65, 1.35);
    const projectedCpi = clamp(current.cpi + costLift * 0.11 + scheduleLift * 0.02 - debtPressure * 0.06, 0.65, 1.35);
    const projectedQuality = Math.round(clamp(current.quality + qualityLift * 10 - debtPressure * 5, 40, 100));
    const projectedSafety = Math.round(clamp(current.safety + qualityLift * 9 - Math.max(0, scheduleLift) * 2 - debtPressure * 4, 35, 100));
    const projectedStakeholder = Math.round(clamp(current.stakeholder + qualityLift * 6 + scheduleLift * 2 + costLift * 2 - debtPressure * 3, 35, 100));
    const projectedPenalties = Math.max(
      0,
      Math.round(current.penalties - (drilldownScheduleEffort * 0.05 + drilldownCostControl * 0.04 + drilldownQualitySafety * 0.05) + debtPressure * 8)
    );

    const debtDrag = Math.round(debtPressure * 14);
    const driverImpacts = [
      { label: "Schedule recovery", points: Math.round((projectedSpi - current.spi) * 40) },
      { label: "Cost discipline", points: Math.round((projectedCpi - current.cpi) * 42) },
      { label: "Quality uplift", points: Math.round((projectedQuality - current.quality) * 0.45) },
      { label: "Safety uplift", points: Math.round((projectedSafety - current.safety) * 0.35) },
      { label: "Stakeholder trust", points: Math.round((projectedStakeholder - current.stakeholder) * 0.25) },
      { label: "Penalty recovery", points: Math.round((current.penalties - projectedPenalties) * 1.8) },
      { label: "Debt carry-over drag", points: -debtDrag },
    ];

    const projectedPoints = Math.max(0, Math.round(current.points + driverImpacts.reduce((sum, item) => sum + item.points, 0)));
    const projectedCash = Math.round(
      current.cash +
        (projectedCpi - current.cpi) * 5200000 +
        (projectedSpi - current.spi) * 2100000 -
        (drilldownQualitySafety - 50) * 70000 -
        Math.max(0, 50 - drilldownScheduleEffort) * 90000
    );
    const projectedRiskDebt = Math.round(
      clamp(
        current.risk_debt_total - drilldownQualitySafety * 0.7 - drilldownCostControl * 0.45 - drilldownScheduleEffort * 0.35 + debtPressure * 25,
        0,
        600
      )
    );

    const yoyChanges = previous
      ? [
          { label: "Points", delta: current.points - previous.points, higherIsBetter: true },
          { label: "Penalties", delta: current.penalties - previous.penalties, higherIsBetter: false },
          { label: "SPI", delta: current.spi - previous.spi, higherIsBetter: true, precision: 2 },
          { label: "CPI", delta: current.cpi - previous.cpi, higherIsBetter: true, precision: 2 },
          { label: "Quality", delta: current.quality - previous.quality, higherIsBetter: true },
          { label: "Safety", delta: current.safety - previous.safety, higherIsBetter: true },
          { label: "Stakeholder", delta: current.stakeholder - previous.stakeholder, higherIsBetter: true },
          { label: "Cash", delta: current.cash - previous.cash, higherIsBetter: true },
        ]
      : [];

    const maxImpactAbs = Math.max(1, ...driverImpacts.map((item) => Math.abs(item.points)));
    const maxYoyAbs = Math.max(1, ...yoyChanges.map((item) => Math.abs(item.delta)));

    const coachCue =
      projectedPoints >= current.points
        ? "Current lever mix suggests a stronger next FY. Preserve discipline and avoid debt creep."
        : "Current lever mix looks risky. Tighten schedule + cost controls before chasing growth moves.";

    return {
      current,
      previous,
      projected: {
        points: projectedPoints,
        cash: projectedCash,
        spi: projectedSpi,
        cpi: projectedCpi,
        quality: projectedQuality,
        safety: projectedSafety,
        stakeholder: projectedStakeholder,
        penalties: projectedPenalties,
        riskDebt: projectedRiskDebt,
      },
      driverImpacts,
      yoyChanges,
      maxImpactAbs,
      maxYoyAbs,
      coachCue,
    };
  }, [drilldownCostControl, drilldownQualitySafety, drilldownRound, drilldownScheduleEffort, yearRows]);

  const summary = useMemo(() => {
    if (yearRows.length === 0) {
      return {
        yearsPlayed: 0,
        totalPoints: 0,
        totalPenalties: 0,
        avgSpi: 0,
        avgCpi: 0,
        avgQuality: 0,
        avgSafety: 0,
        avgStakeholder: 0,
        latestCash: 0,
        kpiHitYears: 0,
      };
    }

    const totals = yearRows.reduce(
      (acc, row) => {
        acc.totalPoints += row.points;
        acc.totalPenalties += row.penalties;
        acc.avgSpi += row.spi;
        acc.avgCpi += row.cpi;
        acc.avgQuality += row.quality;
        acc.avgSafety += row.safety;
        acc.avgStakeholder += row.stakeholder;
        acc.kpiHitYears += row.kpi_hit ? 1 : 0;
        acc.latestCash = row.cash;
        return acc;
      },
      {
        totalPoints: 0,
        totalPenalties: 0,
        avgSpi: 0,
        avgCpi: 0,
        avgQuality: 0,
        avgSafety: 0,
        avgStakeholder: 0,
        latestCash: 0,
        kpiHitYears: 0,
      }
    );

    const n = yearRows.length;
    return {
      yearsPlayed: n,
      totalPoints: totals.totalPoints,
      totalPenalties: totals.totalPenalties,
      avgSpi: totals.avgSpi / n,
      avgCpi: totals.avgCpi / n,
      avgQuality: totals.avgQuality / n,
      avgSafety: totals.avgSafety / n,
      avgStakeholder: totals.avgStakeholder / n,
      latestCash: totals.latestCash,
      kpiHitYears: totals.kpiHitYears,
    };
  }, [yearRows]);

  const yearlyLedgerCsv = useMemo(() => {
    if (yearRows.length === 0) return "";

    const headers = [
      "FY",
      "Round",
      "Points",
      "Penalties",
      "SPI",
      "CPI",
      "Quality",
      "Safety",
      "Stakeholder",
      "Cash Closing (INR)",
      "KPI Hit",
      "KPI Threshold",
      "KPI Multiplier",
      "KPI Final Points",
      "Risk Debt Total",
    ];

    const csvRows: Array<Array<unknown>> = yearRows.map((row) => [
      row.fy,
      row.round_number,
      row.points,
      row.penalties,
      row.spi.toFixed(2),
      row.cpi.toFixed(2),
      row.quality,
      row.safety,
      row.stakeholder,
      row.cash,
      row.kpi_hit ? "Yes" : "No",
      row.kpi_threshold_label,
      row.kpi_multiplier,
      row.kpi_final_points,
      row.risk_debt_total.toFixed(1),
    ]);

    csvRows.push([
      "Total / Avg",
      "-",
      summary.totalPoints,
      summary.totalPenalties,
      summary.avgSpi.toFixed(2),
      summary.avgCpi.toFixed(2),
      summary.avgQuality.toFixed(1),
      summary.avgSafety.toFixed(1),
      summary.avgStakeholder.toFixed(1),
      summary.latestCash,
      `${summary.kpiHitYears}/${summary.yearsPlayed}`,
      team?.kpi_target ?? "Not selected",
      "-",
      "-",
      "-",
    ]);

    return buildCsv(headers, csvRows);
  }, [summary, team?.kpi_target, yearRows]);

  const handleDownloadYearlyLedger = useCallback(() => {
    if (!yearlyLedgerCsv) return;

    const safeSession = (session?.code ?? session?.name ?? "session")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const safeTeam = (team?.team_name ?? "team")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    const fileName = `bharatinfra-yearly-ledger-${safeSession || "session"}-${safeTeam || "team"}.csv`;
    downloadTextFile(fileName, yearlyLedgerCsv, "text/csv;charset=utf-8;");
  }, [session?.code, session?.name, team?.team_name, yearlyLedgerCsv]);

  const chartModel = useMemo(() => {
    if (yearRows.length < 2) return null;

    const width = 1000;
    const height = 340;
    const padLeft = 64;
    const padRight = 24;
    const padTop = 22;
    const padBottom = 64;

    const innerW = width - padLeft - padRight;
    const innerH = height - padTop - padBottom;

    const xForIndex = (index: number) => {
      if (yearRows.length <= 1) return padLeft;
      return padLeft + (index / (yearRows.length - 1)) * innerW;
    };

    const yForPercent = (percent: number) => padTop + innerH - (percent / 100) * innerH;

    const series = TREND_METRICS.map((metric) => {
      const raw = yearRows.map((row) => metric.value(row));
      const normalized = normalize(raw);

      const points = normalized.map((percent, index) => ({
        x: xForIndex(index),
        y: yForPercent(percent),
        value: raw[index],
        fy: yearRows[index].fy,
      }));

      return {
        metric,
        points,
        path: polylinePath(points),
      };
    });

    const yTicks = [0, 25, 50, 75, 100];

    return {
      width,
      height,
      padLeft,
      padRight,
      padTop,
      padBottom,
      innerW,
      innerH,
      xForIndex,
      yForPercent,
      yTicks,
      series,
    };
  }, [yearRows]);

  const benchmarkModel = useMemo(() => {
    if (!team?.id || sessionTeams.length === 0) return null;

    const maxRound = Math.max(
      ...yearRows.map((row) => row.round_number),
      ...sessionScores.map((score) => score.round_number),
      1
    );

    const rounds = Array.from({ length: maxRound }, (_, index) => index + 1);

    const totalsByTeam = new Map<string, Map<number, number>>();
    for (const teamRow of sessionTeams) {
      totalsByTeam.set(teamRow.id, new Map<number, number>());
    }

    for (const score of sessionScores) {
      const teamMap = totalsByTeam.get(score.team_id);
      if (!teamMap) continue;
      teamMap.set(score.round_number, (teamMap.get(score.round_number) ?? 0) + (score.points_earned ?? 0));
    }

    const rawSeries = sessionTeams.map((teamRow, index) => {
      const teamMap = totalsByTeam.get(teamRow.id) ?? new Map<number, number>();
      let running = 0;
      const runningSeries = rounds.map((round) => {
        running += teamMap.get(round) ?? 0;
        return {
          round_number: round,
          fy: `FY ${round}`,
          value: running,
        };
      });

      return {
        team_id: teamRow.id,
        team_name: teamRow.team_name,
        color: BENCHMARK_COLORS[index % BENCHMARK_COLORS.length],
        is_my_team: teamRow.id === team.id,
        final_points: running,
        points: runningSeries,
      };
    });

    const sortedSeries = [...rawSeries].sort(
      (a, b) => b.final_points - a.final_points || a.team_name.localeCompare(b.team_name)
    );

    const ranked = sortedSeries.map((row, index) => ({
      ...row,
      rank: index + 1,
    }));

    const width = 1000;
    const height = 340;
    const padLeft = 64;
    const padRight = 24;
    const padTop = 24;
    const padBottom = 64;

    const innerW = width - padLeft - padRight;
    const innerH = height - padTop - padBottom;

    const maxValue = Math.max(...ranked.map((row) => row.final_points), 1);

    const xForRound = (round: number) => {
      if (maxRound <= 1) return padLeft;
      return padLeft + ((round - 1) / (maxRound - 1)) * innerW;
    };

    const yForValue = (value: number) => padTop + innerH - (value / maxValue) * innerH;

    const chartSeries: BenchmarkSeries[] = ranked.map((row) => {
      const points: BenchmarkPoint[] = row.points.map((point) => ({
        ...point,
        x: xForRound(point.round_number),
        y: yForValue(point.value),
      }));

      return {
        ...row,
        points,
        path: polylinePath(points),
      };
    });

    const myIndex = chartSeries.findIndex((row) => row.is_my_team);
    const myRank = myIndex >= 0 ? chartSeries[myIndex].rank : null;
    const myFinal = myIndex >= 0 ? chartSeries[myIndex].final_points : 0;

    const leader = chartSeries[0] ?? null;
    const above = myIndex > 0 ? chartSeries[myIndex - 1] : null;
    const below = myIndex >= 0 && myIndex < chartSeries.length - 1 ? chartSeries[myIndex + 1] : null;

    return {
      width,
      height,
      padLeft,
      padRight,
      padTop,
      padBottom,
      rounds,
      xForRound,
      yForValue,
      maxValue,
      yTicks: [0, 0.25, 0.5, 0.75, 1],
      series: chartSeries,
      myRank,
      myFinal,
      leader,
      gapToLeader: Math.max((leader?.final_points ?? 0) - myFinal, 0),
      above,
      gapToAbove: Math.max((above?.final_points ?? 0) - myFinal, 0),
      below,
      leadOverBelow: Math.max(myFinal - (below?.final_points ?? 0), 0),
    };
  }, [team?.id, yearRows, sessionScores, sessionTeams]);
  const hasCompetitiveLeaderboard = (benchmarkModel?.series.length ?? 0) > 1;

  const riskDebtModel = useMemo(() => {
    if (yearRows.length === 0) return null;

    const width = 1000;
    const height = 320;
    const padLeft = 64;
    const padRight = 24;
    const padTop = 20;
    const padBottom = 64;
    const innerW = width - padLeft - padRight;
    const innerH = height - padTop - padBottom;

    const xForIndex = (index: number) => {
      if (yearRows.length <= 1) return padLeft;
      return padLeft + (index / (yearRows.length - 1)) * innerW;
    };

    const yForPercent = (percent: number) => padTop + innerH - (percent / 100) * innerH;

    const series = DEBT_METRICS.map((metric) => {
      const raw = yearRows.map((row) => metric.value(row));
      const normalized = normalize(raw);
      const points = normalized.map((percent, index) => ({
        x: xForIndex(index),
        y: yForPercent(percent),
        value: raw[index],
        fy: yearRows[index].fy,
      }));

      return {
        metric,
        points,
        path: polylinePath(points),
      };
    });

    const latest = yearRows[yearRows.length - 1];
    const previous = yearRows.length > 1 ? yearRows[yearRows.length - 2] : null;

    const drivers = [
      { key: "delivery", label: "Delivery", value: latest.risk_debt_delivery },
      { key: "quality", label: "Quality", value: latest.risk_debt_quality },
      { key: "safety", label: "Safety", value: latest.risk_debt_safety },
      { key: "stakeholder", label: "Stakeholder", value: latest.risk_debt_stakeholder },
      { key: "compliance", label: "Compliance", value: latest.risk_debt_compliance },
      { key: "cash", label: "Cash", value: latest.risk_debt_cash },
    ]
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);

    return {
      width,
      height,
      padLeft,
      padRight,
      padTop,
      padBottom,
      xForIndex,
      yForPercent,
      series,
      latest,
      previous,
      debtDelta: latest.risk_debt_total - (previous?.risk_debt_total ?? latest.risk_debt_total),
      yTicks: [0, 25, 50, 75, 100],
      drivers,
    };
  }, [yearRows]);

  const rankMovementModel = useMemo(() => {
    if (!team?.id || sessionTeams.length === 0) return null;

    const maxRound = Math.max(
      ...yearRows.map((row) => row.round_number),
      ...sessionScores.map((score) => score.round_number),
      1
    );

    const rounds = Array.from({ length: maxRound }, (_, index) => index + 1);
    const teamNames = new Map(sessionTeams.map((row) => [row.id, row.team_name]));

    const roundScoreMap = new Map<string, number>();
    for (const score of sessionScores) {
      const key = `${score.team_id}:${score.round_number}`;
      roundScoreMap.set(key, (roundScoreMap.get(key) ?? 0) + (score.points_earned ?? 0));
    }

    const runningTotals = new Map<string, number>();
    for (const row of sessionTeams) {
      runningTotals.set(row.id, 0);
    }

    const yearByRound = new Map(yearRows.map((row) => [row.round_number, row]));
    const roundsForTeam: RankRound[] = [];

    for (const round of rounds) {
      for (const row of sessionTeams) {
        const key = `${row.id}:${round}`;
        runningTotals.set(row.id, (runningTotals.get(row.id) ?? 0) + (roundScoreMap.get(key) ?? 0));
      }

      const ranking = sessionTeams
        .map((row) => ({
          team_id: row.id,
          team_name: row.team_name,
          points: runningTotals.get(row.id) ?? 0,
        }))
        .sort((a, b) => b.points - a.points || a.team_name.localeCompare(b.team_name));

      const myIndex = ranking.findIndex((entry) => entry.team_id === team.id);
      if (myIndex < 0) continue;

      const rank = myIndex + 1;
      const points = ranking[myIndex].points;
      const prev = roundsForTeam.length > 0 ? roundsForTeam[roundsForTeam.length - 1] : null;
      const currentYear = yearByRound.get(round) ?? null;
      const prevYear = prev ? yearByRound.get(prev.round_number) ?? null : null;

      let reason = "Round opened; baseline rank established.";
      if (sessionTeams.length <= 1) {
        reason = "Rank comparison will appear once more teams join the session.";
      } else if (prev) {
        if (rank < prev.rank) {
          if (currentYear?.kpi_hit && !prevYear?.kpi_hit) {
            reason = "KPI hit unlocked stronger points growth than peers.";
          } else if ((currentYear?.penalties ?? 0) + 5 < (prevYear?.penalties ?? 0)) {
            reason = "Penalty control improved and moved rank upward.";
          } else if ((currentYear?.risk_debt_total ?? 0) + 10 < (prevYear?.risk_debt_total ?? 0)) {
            reason = "Risk debt dropped, reducing carry-forward drag.";
          } else {
            reason = "Round points outperformed nearby teams.";
          }
        } else if (rank > prev.rank) {
          if ((currentYear?.penalties ?? 0) > (prevYear?.penalties ?? 0) + 5) {
            reason = "Penalty spike caused relative rank loss.";
          } else if ((currentYear?.risk_debt_total ?? 0) > (prevYear?.risk_debt_total ?? 0) + 10) {
            reason = "Risk debt buildup reduced compounding performance.";
          } else if ((currentYear?.spi ?? 1) < 1 || (currentYear?.cpi ?? 1) < 1) {
            reason = "Schedule/cost slippage weakened round competitiveness.";
          } else {
            reason = "Peer teams gained faster this round.";
          }
        } else {
          if ((currentYear?.risk_debt_total ?? 0) < (prevYear?.risk_debt_total ?? 0) - 8) {
            reason = "Rank held steady while risk debt improved.";
          } else {
            reason = "Rank stable; point pace similar to direct competitors.";
          }
        }
      }

      roundsForTeam.push({
        round_number: round,
        fy: `FY ${round}`,
        rank,
        points,
        rank_delta: prev && sessionTeams.length > 1 ? prev.rank - rank : 0,
        points_delta: prev ? points - prev.points : points,
        change_reason: reason,
      });
    }

    if (roundsForTeam.length === 0) return null;

    const width = 1000;
    const height = 300;
    const padLeft = 64;
    const padRight = 24;
    const padTop = 20;
    const padBottom = 56;
    const innerW = width - padLeft - padRight;
    const innerH = height - padTop - padBottom;

    const xForIndex = (index: number) => {
      if (roundsForTeam.length <= 1) return padLeft;
      return padLeft + (index / (roundsForTeam.length - 1)) * innerW;
    };

    const maxRank = Math.max(sessionTeams.length, 1);
    const yForRank = (rank: number) => {
      if (maxRank <= 1) return padTop + innerH / 2;
      return padTop + ((rank - 1) / (maxRank - 1)) * innerH;
    };

    const chartPoints = roundsForTeam.map((row, index) => ({
      x: xForIndex(index),
      y: yForRank(row.rank),
      rank: row.rank,
      fy: row.fy,
      points: row.points,
    }));

    const bestRank = Math.min(...roundsForTeam.map((row) => row.rank));
    const worstRank = Math.max(...roundsForTeam.map((row) => row.rank));
    const latest = roundsForTeam[roundsForTeam.length - 1];
    const opening = roundsForTeam[0];

    return {
      rounds: roundsForTeam,
      width,
      height,
      padLeft,
      padRight,
      padTop,
      padBottom,
      maxRank,
      yForRank,
      chartPoints,
      chartPath: polylinePath(chartPoints),
      bestRank,
      worstRank,
      latest,
      opening,
      rankShiftFromStart: opening.rank - latest.rank,
      totalPointGain: latest.points - opening.points,
      teamName: teamNames.get(team.id) ?? "Your Team",
    };
  }, [sessionScores, sessionTeams, team?.id, yearRows]);

  const whatIfProjection = useMemo(() => {
    if (yearRows.length === 0) return null;

    const latest = yearRows[yearRows.length - 1];
    const previous = yearRows.length > 1 ? yearRows[yearRows.length - 2] : null;
    const mode = WHAT_IF_MODES.find((entry) => entry.key === whatIfMode) ?? WHAT_IF_MODES[1];

    const capexShift = clamp(whatIfCapexShift, -20, 20);
    const subcontractShare = clamp(whatIfSubcontractShare, 0, 100);
    const riskControlBudget = clamp(whatIfRiskControlBudget, 0, 25);
    const subcontractDelta = subcontractShare - 45;

    const projectedSpi = clamp(
      latest.spi + mode.spiBias + capexShift * 0.001 + (subcontractDelta > 0 ? 0.008 : 0),
      0.82,
      1.28
    );

    const projectedCpi = clamp(
      latest.cpi + mode.cpiBias - capexShift * 0.002 - Math.max(subcontractDelta - 20, 0) * 0.001 + riskControlBudget * 0.001,
      0.78,
      1.26
    );

    let projectedDebt = latest.risk_debt_total;
    projectedDebt += mode.debtBias;
    projectedDebt += Math.max(subcontractDelta, 0) * 0.55;
    projectedDebt += Math.max(capexShift - 5, 0) * 0.9;
    projectedDebt -= riskControlBudget * 1.8;
    projectedDebt += Math.max(0, 1 - projectedSpi) * 90;
    projectedDebt += Math.max(0, 1 - projectedCpi) * 85;
    projectedDebt = clamp(Number(projectedDebt.toFixed(1)), 0, 600);

    const trendPoints = previous
      ? latest.points - previous.points
      : Math.round(summary.totalPoints / Math.max(summary.yearsPlayed, 1));

    let projectedPoints = latest.points;
    projectedPoints += mode.pointsBias;
    projectedPoints += Math.round((projectedSpi - latest.spi) * 38);
    projectedPoints += Math.round((projectedCpi - latest.cpi) * 34);
    projectedPoints += Math.round(Math.max(0, 8 - Math.abs(subcontractDelta) * 0.22));
    projectedPoints += Math.round(capexShift >= 0 ? capexShift * 0.35 : capexShift * 0.2);
    projectedPoints -= Math.round(riskControlBudget * 0.35);
    projectedPoints += Math.round(trendPoints * 0.2);

    const debtDelta = Number((projectedDebt - latest.risk_debt_total).toFixed(1));
    if (debtDelta <= -20) projectedPoints += 5;
    if (debtDelta >= 20) projectedPoints -= 6;

    projectedPoints = Math.round(clamp(projectedPoints, 10, 220));

    let peerExpectedGain = Math.max(8, Math.round((summary.totalPoints / Math.max(summary.yearsPlayed, 1)) * 0.85));
    if (sessionScores.length > 0) {
      const latestRound = Math.max(...sessionScores.map((score) => score.round_number), 1);
      const pool = sessionScores.filter((score) => score.round_number === latestRound).map((score) => score.points_earned ?? 0);
      if (pool.length > 0) {
        peerExpectedGain = Math.max(5, Math.round(pool.reduce((acc, value) => acc + value, 0) / pool.length));
      }
    }

    const hasCompetitiveLeaderboard = (benchmarkModel?.series.length ?? 0) > 1;
    let projectedRank = benchmarkModel?.myRank ?? null;
    let rankDelta = 0;

    if (benchmarkModel) {
      const projectedBoard = benchmarkModel.series
        .map((series) => {
          const historicalAverage = series.points.length > 0 ? series.final_points / series.points.length : peerExpectedGain;
          const projectedGain = series.is_my_team
            ? projectedPoints
            : Math.round(clamp(historicalAverage, peerExpectedGain * 0.7, peerExpectedGain * 1.35));

          return {
            team_id: series.team_id,
            team_name: series.team_name,
            projected_total: series.final_points + projectedGain,
          };
        })
        .sort((a, b) => b.projected_total - a.projected_total || a.team_name.localeCompare(b.team_name));

      const myIndex = projectedBoard.findIndex((row) => row.team_id === team?.id);
      projectedRank = myIndex >= 0 ? myIndex + 1 : null;
      rankDelta = benchmarkModel.myRank && projectedRank ? benchmarkModel.myRank - projectedRank : 0;
    }

    let confidence: "High" | "Medium" | "Low" = mode.confidence === "high" ? "High" : "Medium";
    if (mode.key === "attack" && debtDelta > 15) confidence = "Low";
    if (Math.abs(subcontractDelta) > 35) confidence = "Low";
    if (Math.abs(capexShift) > 16 && mode.key !== "stabilize") confidence = "Low";
    if (Math.abs(rankDelta) >= 2 && confidence === "High") confidence = "Medium";

    const reasons: string[] = [];
    if (debtDelta <= -10) {
      reasons.push(`Risk debt improves by ${Math.abs(debtDelta).toFixed(1)} points, reducing carry-forward drag.`);
    } else if (debtDelta >= 10) {
      reasons.push(`Risk debt rises by ${debtDelta.toFixed(1)} points, increasing shock vulnerability.`);
    } else {
      reasons.push("Risk debt remains broadly stable versus current year.");
    }

    if (!hasCompetitiveLeaderboard) {
      reasons.push("Rank comparison will appear once more teams join the session.");
    } else if (rankDelta > 0) {
      reasons.push(`Projected rank improves by ${rankDelta} place(s) if peers maintain current pace.`);
    } else if (rankDelta < 0) {
      reasons.push(`Projected rank may drop by ${Math.abs(rankDelta)} place(s) under current assumptions.`);
    } else {
      reasons.push("Projected rank is stable unless peers materially change strategy.");
    }

    if (projectedCpi < 1 || projectedSpi < 1) {
      reasons.push("Execution health warning: projected SPI/CPI slips below 1.0; lock schedule-cost recovery first.");
    } else {
      reasons.push("Execution baseline remains above 1.0 on both SPI and CPI in this scenario.");
    }

    return {
      mode,
      nextFy: `FY ${latest.round_number + 1}`,
      projectedPoints,
      projectedDebt,
      debtDelta,
      projectedSpi,
      projectedCpi,
      projectedRank,
      rankDelta,
      peerExpectedGain,
      confidence,
      reasons,
      controls: {
        capexShift,
        subcontractShare,
        riskControlBudget,
      },
    };
  }, [benchmarkModel, sessionScores, summary.totalPoints, summary.yearsPlayed, team?.id, whatIfCapexShift, whatIfMode, whatIfRiskControlBudget, whatIfSubcontractShare, yearRows]);

  const handleApplyScenario = (scenario: WhatIfScenarioRow) => {
    const mode: WhatIfModeKey =
      scenario.mode === "stabilize" || scenario.mode === "attack" || scenario.mode === "balanced"
        ? scenario.mode
        : "balanced";

    setWhatIfMode(mode);
    setWhatIfCapexShift(scenario.capex_shift);
    setWhatIfSubcontractShare(scenario.subcontract_share);
    setWhatIfRiskControlBudget(scenario.risk_control_budget);
    setScenarioName(scenario.scenario_name);
    setScenarioNotes(scenario.notes ?? "");
    setScenarioError("");
    setScenarioMessage(`Loaded scenario: ${scenario.scenario_name}`);
  };

  const handleSaveScenario = async () => {
    if (!sessionId || !team?.id || !userId) {
      setScenarioError("Session/team context missing. Refresh and try again.");
      return;
    }

    if (!whatIfProjection) {
      setScenarioError("Play at least one round to save a scenario.");
      return;
    }

    const name = scenarioName.trim();
    if (!name) {
      setScenarioError("Scenario name is required.");
      return;
    }

    setScenarioSaving(true);
    setScenarioError("");
    setScenarioMessage("");

    const { error: upsertErr } = await supabase.from("what_if_scenarios").upsert(
      {
        user_id: userId,
        session_id: sessionId,
        team_id: team.id,
        scenario_name: name,
        mode: whatIfMode,
        capex_shift: whatIfCapexShift,
        subcontract_share: whatIfSubcontractShare,
        risk_control_budget: whatIfRiskControlBudget,
        notes: scenarioNotes.trim() || null,
        projected_points: whatIfProjection.projectedPoints,
        projected_rank: whatIfProjection.projectedRank,
        projected_debt: Number(whatIfProjection.projectedDebt.toFixed(1)),
        confidence: whatIfProjection.confidence,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,session_id,team_id,scenario_name" }
    );

    if (upsertErr) {
      setScenarioSaving(false);
      setScenarioError(upsertErr.message);
      return;
    }

    await loadSavedScenarios(userId, team.id);
    setScenarioSaving(false);
    setScenarioMessage(`Scenario saved: ${name}`);
  };

  const buildDrilldownPreset = useCallback(() => {
    if (!drilldownModel) return null;

    const deltaPoints = drilldownModel.projected.points - drilldownModel.current.points;
    const deltaDebt = drilldownModel.projected.riskDebt - drilldownModel.current.risk_debt_total;

    let mode: WhatIfModeKey = "balanced";
    if (deltaDebt <= -12 || deltaPoints <= 4) mode = "stabilize";
    if (deltaPoints >= 10 && deltaDebt <= 8 && drilldownScheduleEffort >= 58) mode = "attack";

    const capexShift = clamp(Math.round((drilldownScheduleEffort - 50) * 0.4), -20, 20);
    const subcontractShare = clamp(
      Math.round(50 - (drilldownCostControl - 50) * 0.5 + (drilldownQualitySafety - 50) * 0.2),
      0,
      100
    );
    const riskControlBudget = clamp(Math.round((drilldownQualitySafety / 100) * 25), 0, 25);

    let confidence: "High" | "Medium" | "Low" = "Medium";
    if (deltaPoints >= 8 && deltaDebt <= 0) confidence = "High";
    if (deltaPoints < 0 || deltaDebt > 20) confidence = "Low";

    const scenarioName = `Auto ${drilldownModel.current.fy} Preset`;
    const notes =
      `Generated from FY change drilldown. ` +
      `Levers: schedule ${drilldownScheduleEffort}, cost ${drilldownCostControl}, quality & safety ${drilldownQualitySafety}. ` +
      `Projected next FY points: ${drilldownModel.projected.points}, risk debt: ${drilldownModel.projected.riskDebt}.`;

    return {
      scenarioName,
      mode,
      capexShift,
      subcontractShare,
      riskControlBudget,
      confidence,
      notes,
      projectedPoints: drilldownModel.projected.points,
      projectedDebt: drilldownModel.projected.riskDebt,
      projectedRank: benchmarkModel?.myRank ?? null,
    };
  }, [benchmarkModel?.myRank, drilldownCostControl, drilldownModel, drilldownQualitySafety, drilldownScheduleEffort]);

  const upsertDrilldownPreset = useCallback(async () => {
    if (!sessionId || !team?.id || !userId) {
      setDrilldownActionError("Session/team context missing. Refresh and try again.");
      return null;
    }

    const preset = buildDrilldownPreset();
    if (!preset) {
      setDrilldownActionError("Drilldown data not ready. Play at least one FY first.");
      return null;
    }

    const nowIso = new Date().toISOString();
    const { error: upsertErr } = await supabase.from("what_if_scenarios").upsert(
      {
        user_id: userId,
        session_id: sessionId,
        team_id: team.id,
        scenario_name: preset.scenarioName,
        mode: preset.mode,
        capex_shift: preset.capexShift,
        subcontract_share: preset.subcontractShare,
        risk_control_budget: preset.riskControlBudget,
        notes: preset.notes,
        projected_points: preset.projectedPoints,
        projected_rank: preset.projectedRank,
        projected_debt: Number(preset.projectedDebt.toFixed(1)),
        confidence: preset.confidence,
        updated_at: nowIso,
      },
      { onConflict: "user_id,session_id,team_id,scenario_name" }
    );

    if (upsertErr) {
      setDrilldownActionError(upsertErr.message);
      return null;
    }

    const { data: scenarioRow, error: selectErr } = await supabase
      .from("what_if_scenarios")
      .select("id")
      .eq("user_id", userId)
      .eq("session_id", sessionId)
      .eq("team_id", team.id)
      .eq("scenario_name", preset.scenarioName)
      .maybeSingle();

    if (selectErr) {
      setDrilldownActionError(selectErr.message);
      return null;
    }

    const scenarioId = typeof scenarioRow?.id === "string" ? scenarioRow.id : null;
    if (!scenarioId) {
      setDrilldownActionError("Could not resolve saved preset id. Try again.");
      return null;
    }

    return {
      preset,
      scenarioId,
    };
  }, [buildDrilldownPreset, sessionId, supabase, team?.id, userId]);

  const handleSaveDrilldownPreset = async () => {
    setDrilldownActionBusy("save");
    setDrilldownActionError("");
    setDrilldownActionMessage("");

    const result = await upsertDrilldownPreset();
    setDrilldownActionBusy(null);

    if (!result || !team?.id) return;

    await loadSavedScenarios(userId, team.id);
    setDrilldownActionMessage(`Saved preset: ${result.preset.scenarioName}`);
  };

  const handlePromoteDrilldownPreset = async () => {
    if (!sessionId || !team?.id || !userId) {
      setDrilldownActionError("Session/team context missing. Refresh and try again.");
      return;
    }

    if (!nextPlayableRound) {
      setDrilldownActionError("No playable next round is available for promotion.");
      return;
    }

    setDrilldownActionBusy("promote");
    setDrilldownActionError("");
    setDrilldownActionMessage("");

    const result = await upsertDrilldownPreset();
    if (!result) {
      setDrilldownActionBusy(null);
      return;
    }

    const nowIso = new Date().toISOString();
    const syntheticScenario: WhatIfScenarioRow = {
      id: result.scenarioId,
      user_id: userId,
      session_id: sessionId,
      team_id: team.id,
      scenario_name: result.preset.scenarioName,
      mode: result.preset.mode,
      capex_shift: result.preset.capexShift,
      subcontract_share: result.preset.subcontractShare,
      risk_control_budget: result.preset.riskControlBudget,
      notes: result.preset.notes,
      projected_points: result.preset.projectedPoints,
      projected_rank: result.preset.projectedRank,
      projected_debt: result.preset.projectedDebt,
      confidence: result.preset.confidence,
      created_at: nowIso,
      updated_at: nowIso,
    };

    const payload = buildPromotionPayload(syntheticScenario);

    const { error: promoteErr } = await supabase.from("scenario_promotions").upsert(
      {
        user_id: userId,
        session_id: sessionId,
        team_id: team.id,
        target_round: nextPlayableRound,
        source_scenario_id: result.scenarioId,
        source_scenario_name: result.preset.scenarioName,
        promotion_payload: payload,
        updated_at: nowIso,
        applied_at: null,
      },
      { onConflict: "user_id,session_id,team_id,target_round" }
    );

    setDrilldownActionBusy(null);

    if (promoteErr) {
      setDrilldownActionError(
        isMissingTableError(promoteErr.message)
          ? "Promotion history is unavailable right now."
          : promoteErr.message
      );
      return;
    }

    await loadSavedScenarios(userId, team.id);
    await loadPromotionHistory(userId, team.id);
    setDrilldownActionMessage(`Promoted ${result.preset.scenarioName} to FY ${nextPlayableRound} draft defaults.`);
  };

  const handleDeleteScenario = async (scenarioId: string) => {
    if (!sessionId || !team?.id || !userId) return;

    setScenarioBusyId(scenarioId);
    setScenarioError("");
    setScenarioMessage("");

    const { error: deleteErr } = await supabase
      .from("what_if_scenarios")
      .delete()
      .eq("id", scenarioId)
      .eq("user_id", userId)
      .eq("session_id", sessionId)
      .eq("team_id", team.id);

    if (deleteErr) {
      setScenarioBusyId(null);
      setScenarioError(deleteErr.message);
      return;
    }

    await loadSavedScenarios(userId, team.id);
    setScenarioBusyId(null);
    setScenarioMessage("Scenario deleted.");
  };

  const scenarioComparison = useMemo(() => {
    if (savedScenarios.length < 2) return null;

    const left = savedScenarios.find((row) => row.id === compareLeftScenarioId) ?? savedScenarios[0];

    let right = savedScenarios.find((row) => row.id === compareRightScenarioId) ?? null;
    if (!right || right.id === left.id) {
      right = savedScenarios.find((row) => row.id !== left.id) ?? null;
    }
    if (!right) return null;

    const leftPoints = toNullableNumber(left.projected_points as unknown) ?? 0;
    const rightPoints = toNullableNumber(right.projected_points as unknown) ?? 0;

    const leftRank = toNullableNumber(left.projected_rank as unknown);
    const rightRank = toNullableNumber(right.projected_rank as unknown);

    const leftDebt = toNullableNumber(left.projected_debt as unknown);
    const rightDebt = toNullableNumber(right.projected_debt as unknown);

    const pointsDelta = rightPoints - leftPoints;
    const rankDelta = leftRank !== null && rightRank !== null ? leftRank - rightRank : null;
    const debtDelta = leftDebt !== null && rightDebt !== null ? Number((rightDebt - leftDebt).toFixed(1)) : null;

    let recommendation = "Both scenarios are closely matched; choose based on team execution confidence.";
    if (pointsDelta >= 6 && (rankDelta === null || rankDelta >= 0) && (debtDelta === null || debtDelta <= 8)) {
      recommendation = `Prefer ${right.scenario_name}: better upside without major debt increase.`;
    } else if (pointsDelta >= 6 && debtDelta !== null && debtDelta > 8) {
      recommendation = `Use ${right.scenario_name} only if your team can absorb higher risk debt.`;
    } else if (pointsDelta <= -6 && (debtDelta === null || debtDelta >= -8)) {
      recommendation = `Prefer ${left.scenario_name}: right scenario loses points without clear debt benefit.`;
    } else if (debtDelta !== null && debtDelta <= -12 && pointsDelta >= -4) {
      recommendation = `Prefer ${right.scenario_name} for stability: debt drops materially with limited points tradeoff.`;
    }

    return {
      left,
      right,
      pointsDelta,
      rankDelta,
      debtDelta,
      recommendation,
    };
  }, [compareLeftScenarioId, compareRightScenarioId, savedScenarios]);


  const promotionImpactModel = useMemo(() => {
    if (promotionHistory.length === 0) return null;

    const latestByRound = new Map<number, PromotionHistoryRow>();
    for (const row of promotionHistory) {
      const existing = latestByRound.get(row.target_round);
      if (!existing || row.updated_at > existing.updated_at) {
        latestByRound.set(row.target_round, row);
      }
    }

    const byRound = new Map(yearRows.map((row) => [row.round_number, row]));
    const rounds = Array.from(latestByRound.keys()).sort((a, b) => a - b);

    const details = rounds.map((roundNumber) => {
      const promotion = latestByRound.get(roundNumber)!;
      const current = byRound.get(roundNumber) ?? null;
      const previous = byRound.get(roundNumber - 1) ?? null;
      const payload = toRecord(promotion.promotion_payload);

      const pointsDelta = current && previous ? current.points - previous.points : null;
      const debtDelta = current && previous ? Number((current.risk_debt_total - previous.risk_debt_total).toFixed(1)) : null;
      const spiDelta = current && previous ? Number((current.spi - previous.spi).toFixed(2)) : null;
      const cpiDelta = current && previous ? Number((current.cpi - previous.cpi).toFixed(2)) : null;
      const penaltiesDelta = current && previous ? current.penalties - previous.penalties : null;

      let verdict: "Positive" | "Mixed" | "Negative" | "Pending" = "Pending";
      if (current && previous) {
        let score = 0;
        if ((pointsDelta ?? 0) >= 0) score += 1;
        if ((debtDelta ?? 0) <= 0) score += 1;
        if ((spiDelta ?? 0) >= 0) score += 1;
        if ((cpiDelta ?? 0) >= 0) score += 1;
        if ((penaltiesDelta ?? 0) <= 0) score += 1;

        if (score >= 4) verdict = "Positive";
        else if (score <= 1) verdict = "Negative";
        else verdict = "Mixed";
      }

      return {
        id: promotion.id,
        targetRound: roundNumber,
        scenarioName: promotion.source_scenario_name ?? "Unnamed scenario",
        updatedAt: promotion.updated_at,
        appliedAt: promotion.applied_at,
        riskAppetite: typeof payload?.risk_appetite === "string" ? payload.risk_appetite : "Balanced",
        governance: typeof payload?.governance_intensity === "string" ? payload.governance_intensity : "Medium",
        pointsDelta,
        debtDelta,
        spiDelta,
        cpiDelta,
        penaltiesDelta,
        verdict,
      };
    });

    const playedCount = details.filter((row) => row.pointsDelta !== null).length;
    const positiveCount = details.filter((row) => row.verdict === "Positive").length;
    const mixedCount = details.filter((row) => row.verdict === "Mixed").length;
    const negativeCount = details.filter((row) => row.verdict === "Negative").length;

    return {
      details,
      playedCount,
      positiveCount,
      mixedCount,
      negativeCount,
      appliedCount: details.filter((row) => Boolean(row.appliedAt)).length,
    };
  }, [promotionHistory, yearRows]);

  const nextPlayableRound = useMemo(() => {
    if (!session) return null;

    const maxPlayedRound = yearRows.length > 0 ? Math.max(...yearRows.map((row) => row.round_number)) : 0;
    const candidate = Math.max(session.current_round ?? 1, maxPlayedRound + 1);

    if (session.round_count > 0 && candidate > session.round_count) {
      return null;
    }

    return candidate;
  }, [session, yearRows]);

  const handlePromoteScenario = async (scenario: WhatIfScenarioRow, side: "left" | "right") => {
    if (!sessionId || !team?.id || !userId) {
      setScenarioError("Session/team context missing. Refresh and try again.");
      return;
    }

    if (!nextPlayableRound) {
      setScenarioError("No playable next round is available for promotion.");
      return;
    }

    setPromotionBusyKey(side);
    setScenarioError("");
    setPromotionMessage("");

    const payload = buildPromotionPayload(scenario);

    const { error: promoteErr } = await supabase.from("scenario_promotions").upsert(
      {
        user_id: userId,
        session_id: sessionId,
        team_id: team.id,
        target_round: nextPlayableRound,
        source_scenario_id: scenario.id,
        source_scenario_name: scenario.scenario_name,
        promotion_payload: payload,
        updated_at: new Date().toISOString(),
        applied_at: null,
      },
      { onConflict: "user_id,session_id,team_id,target_round" }
    );

    setPromotionBusyKey(null);

    if (promoteErr) {
      setScenarioError(
        isMissingTableError(promoteErr.message)
          ? "Promotion history is unavailable right now."
          : promoteErr.message
      );
      return;
    }

    setPromotionMessage(`Promoted \"${scenario.scenario_name}\" to FY ${nextPlayableRound} draft defaults.`);
  };

  const strategicFocus = useMemo(() => {
    if (yearRows.length === 0) return [] as string[];

    const suggestions: string[] = [];

    if (summary.avgCpi < 1) {
      suggestions.push("Cost recovery lane: improve procurement sequencing, tighten subcontract package scope, and protect CPI.");
    }

    if (summary.avgSpi < 1) {
      suggestions.push("Schedule recovery lane: prioritize critical-path tasks, reduce rework loops, and protect SPI.");
    }

    if (summary.avgSafety < 75 || summary.avgQuality < 75) {
      suggestions.push("Execution discipline lane: push QA/QC checklists and safety supervision to avoid heavy penalties.");
    }

    if (team?.kpi_target && summary.kpiHitYears < Math.ceil(summary.yearsPlayed * 0.5)) {
      suggestions.push("KPI discipline lane: align every round allocation with your chosen KPI to unlock 4x years more often.");
    }

    if (riskDebtModel && riskDebtModel.latest.risk_debt_total > 170) {
      suggestions.push("Debt reset lane: reduce delivery/safety/compliance debt for 1-2 rounds before expansion.");
    }

    if (benchmarkModel && benchmarkModel.gapToLeader > 0) {
      suggestions.push(
        benchmarkModel.gapToLeader <= 30
          ? "Competitive lane: you are close to the leader, so a focused two-round push can close rank gap."
          : "Foundation lane: close structural gaps first before aggressive ranking moves."
      );
    }

    if (suggestions.length === 0) {
      suggestions.push("Stability lane: maintain this balance and avoid sudden risk appetite shifts unless news shock demands it.");
    }

    return suggestions.slice(0, 3);
  }, [yearRows.length, summary, team?.kpi_target, benchmarkModel, riskDebtModel]);

  const kpiForensicsModel = useMemo(() => {
    if (yearRows.length === 0) return null;

    const width = 1000;
    const height = 320;
    const padLeft = 64;
    const padRight = 24;
    const padTop = 20;
    const padBottom = 64;
    const innerW = width - padLeft - padRight;
    const innerH = height - padTop - padBottom;

    const xForIndex = (index: number) => {
      if (yearRows.length <= 1) return padLeft;
      return padLeft + (index / (yearRows.length - 1)) * innerW;
    };

    const maxValue = Math.max(
      ...yearRows.map((row) => Math.max(row.kpi_base_points, row.kpi_final_points, row.kpi_base_points * 4)),
      1
    );

    const yForValue = (value: number) => padTop + innerH - (value / maxValue) * innerH;

    const basePoints = yearRows.map((row, index) => ({
      x: xForIndex(index),
      y: yForValue(row.kpi_base_points),
      value: row.kpi_base_points,
      fy: row.fy,
    }));

    const finalPoints = yearRows.map((row, index) => ({
      x: xForIndex(index),
      y: yForValue(row.kpi_final_points),
      value: row.kpi_final_points,
      fy: row.fy,
      hit: row.kpi_hit,
    }));

    const idealPoints = yearRows.map((row, index) => ({
      x: xForIndex(index),
      y: yForValue(row.kpi_base_points * 4),
      value: row.kpi_base_points * 4,
      fy: row.fy,
    }));

    const totalBase = yearRows.reduce((acc, row) => acc + row.kpi_base_points, 0);
    const totalFinal = yearRows.reduce((acc, row) => acc + row.kpi_final_points, 0);
    const totalBoostGross = yearRows.reduce((acc, row) => acc + Math.max(0, row.kpi_multiplied_points - row.kpi_base_points), 0);
    const totalLatePenalty = yearRows.reduce((acc, row) => acc + row.kpi_late_points_penalty, 0);
    const totalBoostNet = totalFinal - totalBase;

    const hitYears = yearRows.filter((row) => row.kpi_hit).length;
    const missYears = yearRows.length - hitYears;
    const hitRate = yearRows.length > 0 ? (hitYears / yearRows.length) * 100 : 0;

    const missedUpside = yearRows.reduce((acc, row) => {
      if (row.kpi_hit) return acc;
      const ideal = row.kpi_base_points * 4;
      return acc + Math.max(0, ideal - row.kpi_final_points);
    }, 0);

    const topMissedYears = yearRows
      .filter((row) => !row.kpi_hit)
      .map((row) => ({
        fy: row.fy,
        threshold: row.kpi_threshold_label,
        potential: Math.max(0, row.kpi_base_points * 4 - row.kpi_final_points),
      }))
      .sort((a, b) => b.potential - a.potential)
      .slice(0, 3);

    return {
      width,
      height,
      padLeft,
      padRight,
      padTop,
      padBottom,
      yTicks: [0, 0.25, 0.5, 0.75, 1],
      maxValue,
      basePoints,
      finalPoints,
      idealPoints,
      basePath: polylinePath(basePoints),
      finalPath: polylinePath(finalPoints),
      idealPath: polylinePath(idealPoints),
      hitYears,
      missYears,
      hitRate,
      totalBase,
      totalFinal,
      totalBoostGross,
      totalBoostNet,
      totalLatePenalty,
      missedUpside,
      topMissedYears,
    };
  }, [yearRows]);

  const maxPoints = Math.max(...yearRows.map((row) => row.points), 1);
  const maxCashAbs = Math.max(...yearRows.map((row) => Math.abs(row.cash)), 1);

  return (
    <RequireAuth>
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Financial Year Report</h1>
            <p className="mt-1 text-sm text-slate-600">
              Round = one financial year. Review cumulative business performance and KPI discipline.
            </p>
          </div>
          <div className="flex gap-3 text-sm">
            <Link className="underline text-slate-700" href={`/sessions/${sessionId}`}>
              Session Hub
            </Link>
            {session?.current_round ? (
              <Link className="underline text-slate-700" href={`/sessions/${sessionId}/round/${session.current_round}/results`}>
                Latest Results
              </Link>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
        ) : null}

        {loading ? (
          <Card>
            <CardBody>
              <p className="text-sm text-slate-600">Loading report...</p>
            </CardBody>
          </Card>
        ) : null}

        {!loading && !error ? (
          <>
            <Card>
              <CardHeader title={session?.name ?? "Session"} subtitle={`Code: ${session?.code ?? "-"} | Team: ${team?.team_name ?? "-"}`} />
              <CardBody className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-slate-500">Session status</div>
                  <div className="mt-1 font-semibold text-slate-900">{session?.status ? formatStatus(session.status) : "-"}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-slate-500">Years played</div>
                  <div className="mt-1 font-semibold text-slate-900">{summary.yearsPlayed}/{session?.round_count ?? 0}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-slate-500">Team KPI target</div>
                  <div className="mt-1 font-semibold text-slate-900">{team?.kpi_target ?? "Not selected"}</div>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Cumulative Performance" subtitle="Aggregate financial and execution indicators" />
              <CardBody className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-slate-500">Total points</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">{summary.totalPoints}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-slate-500">Total penalties</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">{summary.totalPenalties}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-slate-500">Avg SPI / CPI</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">
                    {summary.avgSpi.toFixed(2)} / {summary.avgCpi.toFixed(2)}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-slate-500">Avg quality / safety</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">
                    {summary.avgQuality.toFixed(0)} / {summary.avgSafety.toFixed(0)}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-slate-500">Latest cash</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">Rs {formatCurrencyInr(summary.latestCash)}</div>
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardHeader
                title="KPI Multiplier Insights"
                subtitle="Round-wise base vs 4x KPI effect, missed upside, and multiplier discipline"
              />
              <CardBody className="space-y-4">
                {!kpiForensicsModel ? (
                  <div className="text-sm text-slate-600">KPI multiplier insights will appear once at least one FY result is available.</div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2 xl:grid-cols-5">
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-slate-500">KPI hit years</div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">
                          {kpiForensicsModel.hitYears} / {summary.yearsPlayed}
                        </div>
                        <div className="text-xs text-slate-500">Hit rate {kpiForensicsModel.hitRate.toFixed(0)}%</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-slate-500">Base points total</div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">{kpiForensicsModel.totalBase}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-slate-500">KPI boost (gross)</div>
                        <div className="mt-1 text-lg font-semibold text-emerald-700">+{kpiForensicsModel.totalBoostGross}</div>
                        <div className="text-xs text-slate-500">Before late penalties</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-slate-500">KPI boost (net)</div>
                        <div className={`mt-1 text-lg font-semibold ${kpiForensicsModel.totalBoostNet >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                          {formatDelta(kpiForensicsModel.totalBoostNet)}
                        </div>
                        <div className="text-xs text-slate-500">Late penalty impact {kpiForensicsModel.totalLatePenalty}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-slate-500">Missed 4x upside</div>
                        <div className="mt-1 text-lg font-semibold text-amber-700">{kpiForensicsModel.missedUpside}</div>
                        <div className="text-xs text-slate-500">Potential points left on table</div>
                      </div>
                    </div>

                    <div className="mobile-scroll-x rounded-xl border border-slate-200 bg-white p-3">
                      <svg
                        viewBox={`0 0 ${kpiForensicsModel.width} ${kpiForensicsModel.height}`}
                        className="min-w-[720px] w-full"
                        role="img"
                        aria-label="KPI multiplier forensics chart"
                      >
                        <rect x="0" y="0" width={kpiForensicsModel.width} height={kpiForensicsModel.height} fill="white" />

                        {kpiForensicsModel.yTicks.map((tick) => {
                          const y =
                            kpiForensicsModel.padTop +
                            (kpiForensicsModel.height - kpiForensicsModel.padTop - kpiForensicsModel.padBottom) * (1 - tick);
                          return (
                            <g key={`kpi-y-${tick}`}>
                              <line
                                x1={kpiForensicsModel.padLeft}
                                y1={y}
                                x2={kpiForensicsModel.width - kpiForensicsModel.padRight}
                                y2={y}
                                stroke="#e2e8f0"
                                strokeWidth="1"
                              />
                              <text x={kpiForensicsModel.padLeft - 10} y={y + 4} textAnchor="end" fontSize="11" fill="#64748b">
                                {Math.round(kpiForensicsModel.maxValue * tick)}
                              </text>
                            </g>
                          );
                        })}

                        {yearRows.map((row, index) => {
                          const x = kpiForensicsModel.finalPoints[index]?.x ?? kpiForensicsModel.padLeft;
                          return (
                            <g key={`kpi-fy-${row.round_number}`}>
                              <line
                                x1={x}
                                y1={kpiForensicsModel.padTop}
                                x2={x}
                                y2={kpiForensicsModel.height - kpiForensicsModel.padBottom}
                                stroke="#f1f5f9"
                                strokeWidth="1"
                              />
                              <text
                                x={x}
                                y={kpiForensicsModel.height - kpiForensicsModel.padBottom + 18}
                                textAnchor="middle"
                                fontSize="11"
                                fill="#475569"
                              >
                                {row.fy}
                              </text>
                            </g>
                          );
                        })}

                        <path d={kpiForensicsModel.idealPath} fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="5 4" />
                        <path d={kpiForensicsModel.basePath} fill="none" stroke="#0284c7" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
                        <path d={kpiForensicsModel.finalPath} fill="none" stroke="#16a34a" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />

                        {kpiForensicsModel.finalPoints.map((point, index) => (
                          <circle key={`kpi-final-${index}`} cx={point.x} cy={point.y} r="4" fill={point.hit ? "#16a34a" : "#f59e0b"}>
                            <title>{`${point.fy}: final ${point.value}`}</title>
                          </circle>
                        ))}
                      </svg>
                    </div>

                    <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-3">
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700">
                        <span className="inline-block h-2.5 w-2.5 rounded-full bg-sky-600" />
                        <span className="ml-2 font-semibold">Base points (before KPI multiplier)</span>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700">
                        <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-600" />
                        <span className="ml-2 font-semibold">Final points (after KPI + late penalty)</span>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700">
                        <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-400" />
                        <span className="ml-2 font-semibold">Ideal 4x potential line</span>
                      </div>
                    </div>

                    {kpiForensicsModel.topMissedYears.length > 0 ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
                        <div className="font-semibold text-amber-900">Top missed KPI upside years</div>
                        <div className="mt-2 space-y-1 text-amber-800">
                          {kpiForensicsModel.topMissedYears.map((item) => (
                            <div key={`kpi-miss-${item.fy}`}>
                              {item.fy}: +{item.potential} potential points if KPI was achieved ({item.threshold})
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                        Strong KPI consistency. No major missed 4x upside years detected.
                      </div>
                    )}
                  </>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Session Benchmark"
                subtitle="Cumulative points race across all teams in this simulation"
              />
              <CardBody className="space-y-4">
                {benchmarkError ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    {benchmarkError}
                  </div>
                ) : null}

                {!benchmarkModel ? (
                  <div className="text-sm text-slate-600">
                    Session benchmark will appear once team scoreboard data is available.
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-slate-500">Your rank</div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">
                          {benchmarkModel.myRank ? `#${benchmarkModel.myRank}` : "-"}
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-slate-500">Gap to leader</div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">{benchmarkModel.gapToLeader} pts</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-slate-500">Gap to team above</div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">{benchmarkModel.gapToAbove} pts</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-slate-500">Lead over team below</div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">{benchmarkModel.leadOverBelow} pts</div>
                      </div>
                    </div>

                    <div className="mobile-scroll-x rounded-xl border border-slate-200 bg-white p-3">
                      <svg viewBox={`0 0 ${benchmarkModel.width} ${benchmarkModel.height}`} className="min-w-[720px] w-full" role="img" aria-label="Session cumulative points trend chart">
                        <rect x="0" y="0" width={benchmarkModel.width} height={benchmarkModel.height} fill="white" />

                        {benchmarkModel.yTicks.map((tick) => {
                          const y = benchmarkModel.yForValue(benchmarkModel.maxValue * tick);
                          return (
                            <g key={`b-y-${tick}`}>
                              <line
                                x1={benchmarkModel.padLeft}
                                y1={y}
                                x2={benchmarkModel.width - benchmarkModel.padRight}
                                y2={y}
                                stroke="#e2e8f0"
                                strokeWidth="1"
                              />
                              <text x={benchmarkModel.padLeft - 10} y={y + 4} textAnchor="end" fontSize="11" fill="#64748b">
                                {Math.round(benchmarkModel.maxValue * tick)}
                              </text>
                            </g>
                          );
                        })}

                        {benchmarkModel.rounds.map((round) => {
                          const x = benchmarkModel.xForRound(round);
                          return (
                            <g key={`b-r-${round}`}>
                              <line
                                x1={x}
                                y1={benchmarkModel.padTop}
                                x2={x}
                                y2={benchmarkModel.height - benchmarkModel.padBottom}
                                stroke="#f1f5f9"
                                strokeWidth="1"
                              />
                              <text
                                x={x}
                                y={benchmarkModel.height - benchmarkModel.padBottom + 18}
                                textAnchor="middle"
                                fontSize="11"
                                fill="#475569"
                              >
                                FY {round}
                              </text>
                            </g>
                          );
                        })}

                        {benchmarkModel.series.map((series) => (
                          <g key={`bench-${series.team_id}`}>
                            <path
                              d={series.path}
                              fill="none"
                              stroke={series.color}
                              strokeWidth={series.is_my_team ? "3.6" : "2.2"}
                              strokeLinejoin="round"
                              strokeLinecap="round"
                              opacity={series.is_my_team ? "1" : "0.8"}
                            />
                            {series.points.map((point, idx) => (
                              <circle key={`bench-${series.team_id}-${idx}`} cx={point.x} cy={point.y} r={series.is_my_team ? "4" : "3"} fill={series.color}>
                                <title>{`${series.team_name} | ${point.fy}: ${point.value}`}</title>
                              </circle>
                            ))}
                          </g>
                        ))}
                      </svg>
                    </div>

                    <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
                      {benchmarkModel.series.map((series) => (
                        <div
                          key={`legend-${series.team_id}`}
                          className={`rounded-lg border px-3 py-2 ${series.is_my_team ? "border-teal-300 bg-teal-50" : "border-slate-200 bg-white"}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: series.color }} />
                              <span className="font-semibold text-slate-900">#{series.rank} {series.team_name}</span>
                            </div>
                            <span className="text-slate-600">{series.final_points} pts</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Risk Debt Trend" subtitle="Carry-forward debt across delivery, quality, safety, compliance, and cash" />
              <CardBody className="space-y-4">
                {!riskDebtModel ? (
                  <div className="text-sm text-slate-600">Risk debt trend will appear once round results are available.</div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-slate-500">Latest debt total</div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">{riskDebtModel.latest.risk_debt_total.toFixed(1)}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-slate-500">Debt delta vs previous FY</div>
                        <div className={`mt-1 text-lg font-semibold ${riskDebtModel.debtDelta <= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                          {formatDelta(Number(riskDebtModel.debtDelta.toFixed(1)))}
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-slate-500">Top debt driver</div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">{riskDebtModel.drivers[0]?.label ?? "-"}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-slate-500">Debt status</div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">
                          {riskDebtModel.latest.risk_debt_total > 200 ? "High" : riskDebtModel.latest.risk_debt_total > 130 ? "Watch" : "Controlled"}
                        </div>
                      </div>
                    </div>

                    <div className="mobile-scroll-x rounded-xl border border-slate-200 bg-white p-3">
                      <svg viewBox={`0 0 ${riskDebtModel.width} ${riskDebtModel.height}`} className="min-w-[720px] w-full" role="img" aria-label="Risk debt trend chart">
                        <rect x="0" y="0" width={riskDebtModel.width} height={riskDebtModel.height} fill="white" />

                        {riskDebtModel.yTicks.map((tick) => {
                          const y = riskDebtModel.yForPercent(tick);
                          return (
                            <g key={`debt-y-${tick}`}>
                              <line
                                x1={riskDebtModel.padLeft}
                                y1={y}
                                x2={riskDebtModel.width - riskDebtModel.padRight}
                                y2={y}
                                stroke="#e2e8f0"
                                strokeWidth="1"
                              />
                              <text x={riskDebtModel.padLeft - 10} y={y + 4} textAnchor="end" fontSize="11" fill="#64748b">
                                {tick}
                              </text>
                            </g>
                          );
                        })}

                        {yearRows.map((row, index) => {
                          const x = riskDebtModel.xForIndex(index);
                          return (
                            <g key={`debt-round-${row.round_number}`}>
                              <line
                                x1={x}
                                y1={riskDebtModel.padTop}
                                x2={x}
                                y2={riskDebtModel.height - riskDebtModel.padBottom}
                                stroke="#f1f5f9"
                                strokeWidth="1"
                              />
                              <text
                                x={x}
                                y={riskDebtModel.height - riskDebtModel.padBottom + 18}
                                textAnchor="middle"
                                fontSize="11"
                                fill="#475569"
                              >
                                {row.fy}
                              </text>
                            </g>
                          );
                        })}

                        {riskDebtModel.series.map((series) => (
                          <g key={`debt-${series.metric.key}`}>
                            <path
                              d={series.path}
                              fill="none"
                              stroke={series.metric.color}
                              strokeWidth={series.metric.key === "total" ? "3.2" : "2.1"}
                              strokeLinejoin="round"
                              strokeLinecap="round"
                              opacity={series.metric.key === "total" ? "1" : "0.9"}
                            />
                            {series.points.map((point, idx) => (
                              <circle key={`debt-${series.metric.key}-${idx}`} cx={point.x} cy={point.y} r={series.metric.key === "total" ? "4" : "3"} fill={series.metric.color}>
                                <title>{`${series.metric.label} | ${point.fy}: ${point.value.toFixed(1)}`}</title>
                              </circle>
                            ))}
                          </g>
                        ))}
                      </svg>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                      {riskDebtModel.series.map((series) => (
                        <div key={`debt-legend-${series.metric.key}`} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700">
                          <div className="flex items-center gap-2">
                            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: series.metric.color }} />
                            <span className="font-semibold text-slate-900">{series.metric.label}</span>
                          </div>
                          <div className="mt-1 text-slate-500">Trend index</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Rank Movement" subtitle="How your rank changed each FY and why" />
              <CardBody className="space-y-4">
                {!rankMovementModel ? (
                  <div className="text-sm text-slate-600">Rank movement forensics will appear once session score timeline is available.</div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-slate-500">Current rank</div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">#{rankMovementModel.latest.rank}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-slate-500">Best / Worst</div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">#{rankMovementModel.bestRank} / #{rankMovementModel.worstRank}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-slate-500">Rank shift from start</div>
                        <div className={`mt-1 text-lg font-semibold ${rankMovementModel.rankShiftFromStart >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                          {formatDelta(rankMovementModel.rankShiftFromStart)}
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-slate-500">Cumulative points gain</div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">{formatDelta(rankMovementModel.totalPointGain)} pts</div>
                      </div>
                    </div>

                    <div className="mobile-scroll-x rounded-xl border border-slate-200 bg-white p-3">
                      <svg viewBox={`0 0 ${rankMovementModel.width} ${rankMovementModel.height}`} className="min-w-[720px] w-full" role="img" aria-label="Rank movement chart">
                        <rect x="0" y="0" width={rankMovementModel.width} height={rankMovementModel.height} fill="white" />

                        {Array.from({ length: rankMovementModel.maxRank }, (_, index) => index + 1).map((rank) => {
                          const y = rankMovementModel.yForRank(rank);
                          return (
                            <g key={`rank-y-${rank}`}>
                              <line
                                x1={rankMovementModel.padLeft}
                                y1={y}
                                x2={rankMovementModel.width - rankMovementModel.padRight}
                                y2={y}
                                stroke="#e2e8f0"
                                strokeWidth="1"
                              />
                              <text x={rankMovementModel.padLeft - 10} y={y + 4} textAnchor="end" fontSize="11" fill="#64748b">
                                #{rank}
                              </text>
                            </g>
                          );
                        })}

                        <path d={rankMovementModel.chartPath} fill="none" stroke="#0f766e" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
                        {rankMovementModel.chartPoints.map((point, idx) => (
                          <circle key={`rank-point-${idx}`} cx={point.x} cy={point.y} r="4" fill="#0f766e">
                            <title>{`${point.fy}: rank #${point.rank}, ${point.points} pts`}</title>
                          </circle>
                        ))}

                        {rankMovementModel.rounds.map((round, index) => {
                          const x = rankMovementModel.chartPoints[index]?.x ?? rankMovementModel.padLeft;
                          return (
                            <text key={`rank-label-${round.round_number}`} x={x} y={rankMovementModel.height - rankMovementModel.padBottom + 18} textAnchor="middle" fontSize="11" fill="#475569">
                              {round.fy}
                            </text>
                          );
                        })}
                      </svg>
                    </div>

                    <div className="space-y-2">
                      {rankMovementModel.rounds.map((round) => (
                        <div key={`rank-row-${round.round_number}`} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="font-semibold text-slate-900">{round.fy} - Rank #{round.rank}</div>
                            <div className="flex items-center gap-2 text-xs">
                              {hasCompetitiveLeaderboard ? (
                                <span className={`rounded-full px-2 py-0.5 ${round.rank_delta >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                                  Rank delta {formatDelta(round.rank_delta)}
                                </span>
                              ) : null}
                              <span className={`rounded-full px-2 py-0.5 ${round.points_delta >= 0 ? "bg-cyan-100 text-cyan-700" : "bg-amber-100 text-amber-700"}`}>
                                Points delta {formatDelta(round.points_delta)}
                              </span>
                            </div>
                          </div>
                          <div className="mt-1 text-slate-600">{round.change_reason}</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Next FY What-if Simulator" subtitle="Deterministic projection before lock: simulate points, debt, and rank movement" />
              <CardBody className="space-y-4">
                {!whatIfProjection ? (
                  <div className="text-sm text-slate-600">Play at least one financial year to unlock the what-if simulator.</div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-white p-3">
                        <div className="text-slate-500">Projected FY points</div>
                        <div className="mt-1 text-xl font-semibold text-slate-900">{whatIfProjection.projectedPoints}</div>
                        <div className="text-xs text-slate-600">vs peer pace {whatIfProjection.peerExpectedGain} pts</div>
                      </div>
                      <div className="rounded-xl border border-rose-200 bg-gradient-to-br from-rose-50 to-white p-3">
                        <div className="text-slate-500">Projected debt total</div>
                        <div className="mt-1 text-xl font-semibold text-slate-900">{whatIfProjection.projectedDebt.toFixed(1)}</div>
                        <div className={`text-xs ${whatIfProjection.debtDelta <= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                          Debt delta {formatDelta(Number(whatIfProjection.debtDelta.toFixed(1)))}
                        </div>
                      </div>
                      <div className="rounded-xl border border-teal-200 bg-gradient-to-br from-teal-50 to-white p-3">
                        <div className="text-slate-500">Projected rank ({whatIfProjection.nextFy})</div>
                        <div className="mt-1 text-xl font-semibold text-slate-900">
                          {whatIfProjection.projectedRank ? `#${whatIfProjection.projectedRank}` : "-"}
                        </div>
                        {hasCompetitiveLeaderboard ? (
                          <div className={`text-xs ${whatIfProjection.rankDelta >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                            Rank delta {formatDelta(whatIfProjection.rankDelta)}
                          </div>
                        ) : null}
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-slate-500">Scenario confidence</div>
                        <div className="mt-1 text-xl font-semibold text-slate-900">{whatIfProjection.confidence}</div>
                        <div className="text-xs text-slate-500">Assumes peers continue at current average strategy.</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      {WHAT_IF_MODES.map((mode) => {
                        const selected = whatIfMode === mode.key;
                        return (
                          <button
                            key={mode.key}
                            type="button"
                            onClick={() => setWhatIfMode(mode.key)}
                            className={`rounded-xl border px-4 py-3 text-left transition ${
                              selected
                                ? "border-teal-500 bg-teal-50 shadow-sm"
                                : "border-slate-200 bg-white hover:border-slate-300"
                            }`}
                          >
                            <div className="font-semibold text-slate-900">{mode.label}</div>
                            <div className="mt-1 text-xs text-slate-600">{mode.subtitle}</div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex items-center justify-between text-xs text-slate-600">
                          <span>Capex / innovation tilt</span>
                          <span className="font-semibold text-slate-900">{whatIfProjection.controls.capexShift > 0 ? "+" : ""}{whatIfProjection.controls.capexShift}%</span>
                        </div>
                        <input
                          type="range"
                          min={-20}
                          max={20}
                          step={1}
                          value={whatIfCapexShift}
                          onChange={(event) => setWhatIfCapexShift(Number(event.target.value))}
                          className="mt-3 w-full"
                        />
                        <p className="mt-2 text-xs text-slate-500">Higher spend can improve future competitiveness but may pressure CPI now.</p>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex items-center justify-between text-xs text-slate-600">
                          <span>Subcontract share</span>
                          <span className="font-semibold text-slate-900">{whatIfProjection.controls.subcontractShare}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={5}
                          value={whatIfSubcontractShare}
                          onChange={(event) => setWhatIfSubcontractShare(Number(event.target.value))}
                          className="mt-3 w-full"
                        />
                        <p className="mt-2 text-xs text-slate-500">Balance speed vs coordination risk. Extreme values usually increase debt volatility.</p>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex items-center justify-between text-xs text-slate-600">
                          <span>Risk-control budget</span>
                          <span className="font-semibold text-slate-900">{whatIfProjection.controls.riskControlBudget}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={25}
                          step={1}
                          value={whatIfRiskControlBudget}
                          onChange={(event) => setWhatIfRiskControlBudget(Number(event.target.value))}
                          className="mt-3 w-full"
                        />
                        <p className="mt-2 text-xs text-slate-500">Budget for safety/compliance controls. Reduces debt, but over-allocation can limit growth points.</p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                      <div className="font-semibold text-slate-900">Projected execution indices</div>
                      <div className="mt-1">SPI {whatIfProjection.projectedSpi.toFixed(2)} | CPI {whatIfProjection.projectedCpi.toFixed(2)}</div>
                      <div className="mt-1">This simulator is deterministic and uses your session trend + leaderboard pace. No LLM randomness is used.</div>
                    </div>

                    <div className="space-y-2">
                      {whatIfProjection.reasons.map((reason) => (
                        <div key={reason} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                          {reason}
                        </div>
                      ))}
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-semibold text-slate-900">Scenario Presets</div>
                          <div className="text-xs text-slate-500">Save and reload combinations for faster team discussions before lock.</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
                        <input
                          type="text"
                          value={scenarioName}
                          onChange={(event) => setScenarioName(event.target.value.slice(0, 80))}
                          placeholder="Scenario name"
                          className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-500"
                        />
                        <button
                          type="button"
                          onClick={handleSaveScenario}
                          disabled={scenarioSaving}
                          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                        >
                          {scenarioSaving ? "Saving..." : "Save / Update"}
                        </button>
                      </div>

                      <textarea
                        value={scenarioNotes}
                        onChange={(event) => setScenarioNotes(event.target.value.slice(0, 240))}
                        rows={2}
                        placeholder="Optional note for your team"
                        className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-500"
                      />

                      {scenarioError ? (
                        <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{scenarioError}</div>
                      ) : null}
                      {scenarioMessage ? (
                        <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{scenarioMessage}</div>
                      ) : null}
                      {promotionMessage ? (
                        <div className="mt-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-700">{promotionMessage}</div>
                      ) : null}

                      {savedScenarios.length === 0 ? (
                        <div className="mt-3 text-xs text-slate-500">No presets saved yet for this team.</div>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {savedScenarios.map((scenario) => (
                            <div key={scenario.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <div className="font-semibold text-slate-900">{scenario.scenario_name}</div>
                                  <div className="text-xs text-slate-500">
                                    {scenario.mode} | Capex {scenario.capex_shift > 0 ? "+" : ""}{scenario.capex_shift}% | Subcontract {scenario.subcontract_share}% | Risk control {scenario.risk_control_budget}%
                                  </div>
                                  <div className="text-xs text-slate-400">Updated {formatTimestampCompact(scenario.updated_at)}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleApplyScenario(scenario)}
                                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                                  >
                                    Load
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteScenario(scenario.id)}
                                    disabled={scenarioBusyId === scenario.id}
                                    className="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-60"
                                  >
                                    {scenarioBusyId === scenario.id ? "Deleting..." : "Delete"}
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                      {scenarioComparison ? (
                        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <div className="font-semibold text-slate-900">Scenario Compare</div>
                          <div className="text-xs text-slate-500">Choose two saved presets and compare downside vs upside before locking next FY.</div>

                          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                            <label className="text-xs text-slate-600">
                              Scenario A
                              <select
                                value={scenarioComparison.left.id}
                                onChange={(event) => setCompareLeftScenarioId(event.target.value)}
                                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900"
                              >
                                {savedScenarios.map((option) => (
                                  <option key={`left-${option.id}`} value={option.id}>
                                    {option.scenario_name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="text-xs text-slate-600">
                              Scenario B
                              <select
                                value={scenarioComparison.right.id}
                                onChange={(event) => setCompareRightScenarioId(event.target.value)}
                                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900"
                              >
                                {savedScenarios.map((option) => (
                                  <option key={`right-${option.id}`} value={option.id}>
                                    {option.scenario_name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>

                          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                            <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                              <div className="font-semibold text-slate-900">A: {scenarioComparison.left.scenario_name}</div>
                              <div className="mt-1 text-xs text-slate-600">{scenarioComparison.left.mode} | Confidence {scenarioComparison.left.confidence ?? "-"}</div>
                              <div className="mt-2 text-xs text-slate-600">Points {scenarioComparison.left.projected_points ?? "-"}</div>
                              <div className="text-xs text-slate-600">Rank {scenarioComparison.left.projected_rank ? `#${scenarioComparison.left.projected_rank}` : "-"}</div>
                              <div className="text-xs text-slate-600">Debt {scenarioComparison.left.projected_debt ?? "-"}</div>
                            </div>

                            <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                              <div className="font-semibold text-slate-900">B: {scenarioComparison.right.scenario_name}</div>
                              <div className="mt-1 text-xs text-slate-600">{scenarioComparison.right.mode} | Confidence {scenarioComparison.right.confidence ?? "-"}</div>
                              <div className="mt-2 text-xs text-slate-600">Points {scenarioComparison.right.projected_points ?? "-"}</div>
                              <div className="text-xs text-slate-600">Rank {scenarioComparison.right.projected_rank ? `#${scenarioComparison.right.projected_rank}` : "-"}</div>
                              <div className="text-xs text-slate-600">Debt {scenarioComparison.right.projected_debt ?? "-"}</div>
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700">
                              Points delta (B-A):
                              <span className={`ml-1 font-semibold ${scenarioComparison.pointsDelta >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                                {formatDelta(scenarioComparison.pointsDelta)}
                              </span>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700">
                              Rank delta (B-A):
                              <span className={`ml-1 font-semibold ${scenarioComparison.rankDelta === null ? "text-slate-700" : scenarioComparison.rankDelta >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                                {scenarioComparison.rankDelta === null ? "N/A" : formatDelta(scenarioComparison.rankDelta)}
                              </span>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700">
                              Debt delta (B-A):
                              <span className={`ml-1 font-semibold ${scenarioComparison.debtDelta === null ? "text-slate-700" : scenarioComparison.debtDelta <= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                                {scenarioComparison.debtDelta === null ? "N/A" : formatDelta(scenarioComparison.debtDelta)}
                              </span>
                            </div>
                          </div>

                          <div className="mt-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-800">
                            {scenarioComparison.recommendation}
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void handlePromoteScenario(scenarioComparison.left, "left")}
                              disabled={!nextPlayableRound || promotionBusyKey !== null}
                              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-60"
                            >
                              {promotionBusyKey === "left"
                                ? "Promoting..."
                                : nextPlayableRound
                                ? `Promote A -> FY ${nextPlayableRound}`
                                : "No next FY available"}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handlePromoteScenario(scenarioComparison.right, "right")}
                              disabled={!nextPlayableRound || promotionBusyKey !== null}
                              className="rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                            >
                              {promotionBusyKey === "right"
                                ? "Promoting..."
                                : nextPlayableRound
                                ? `Promote B -> FY ${nextPlayableRound}`
                                : "No next FY available"}
                            </button>
                          </div>
                        </div>
                      ) : savedScenarios.length === 1 ? (
                        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                          Save one more scenario to unlock side-by-side compare.
                        </div>
                      ) : null}

                  </>
                )}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Promotion Impact Backtest" subtitle="Did promoted scenarios actually improve next financial year performance?" />
              <CardBody className="space-y-4">
                {!promotionHistoryReady ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Promotion impact history is unavailable right now.
                  </div>
                ) : promotionHistoryError ? (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{promotionHistoryError}</div>
                ) : !promotionImpactModel ? (
                  <div className="text-sm text-slate-600">Promote at least one scenario to unlock promotion impact analytics.</div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-slate-500">Total promotions</div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">{promotionImpactModel.details.length}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-slate-500">Rounds evaluated</div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">{promotionImpactModel.playedCount}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-slate-500">Positive verdicts</div>
                        <div className="mt-1 text-lg font-semibold text-emerald-700">{promotionImpactModel.positiveCount}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-slate-500">Mixed / negative</div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">
                          {promotionImpactModel.mixedCount} / {promotionImpactModel.negativeCount}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {promotionImpactModel.details.map((item) => (
                        <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div className="font-semibold text-slate-900">FY {item.targetRound}: {item.scenarioName}</div>
                              <div className="text-xs text-slate-500">
                                Risk {item.riskAppetite} | Governance {item.governance} | Updated {formatTimestampCompact(item.updatedAt)}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                              <span className={`rounded-full px-2 py-0.5 ${item.appliedAt ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                                {item.appliedAt ? "Applied" : "Pending apply"}
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 ${
                                  item.verdict === "Positive"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : item.verdict === "Negative"
                                    ? "bg-rose-100 text-rose-700"
                                    : item.verdict === "Mixed"
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-slate-100 text-slate-700"
                                }`}
                              >
                                {item.verdict}
                              </span>
                            </div>
                          </div>

                          {item.pointsDelta === null ? (
                            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                              Waiting for FY {item.targetRound} results lock to compute actual impact.
                            </div>
                          ) : (
                            <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                              <div className="rounded-md bg-slate-50 px-2 py-1">
                                Points <b className={item.pointsDelta >= 0 ? "text-emerald-700" : "text-rose-700"}>{formatDelta(item.pointsDelta)}</b>
                              </div>
                              <div className="rounded-md bg-slate-50 px-2 py-1">
                                Debt <b className={(item.debtDelta ?? 0) <= 0 ? "text-emerald-700" : "text-rose-700"}>{formatSignedFixed(item.debtDelta ?? 0, 1)}</b>
                              </div>
                              <div className="rounded-md bg-slate-50 px-2 py-1">
                                SPI <b className={(item.spiDelta ?? 0) >= 0 ? "text-emerald-700" : "text-rose-700"}>{formatSignedFixed(item.spiDelta ?? 0)}</b>
                              </div>
                              <div className="rounded-md bg-slate-50 px-2 py-1">
                                CPI <b className={(item.cpiDelta ?? 0) >= 0 ? "text-emerald-700" : "text-rose-700"}>{formatSignedFixed(item.cpiDelta ?? 0)}</b>
                              </div>
                              <div className="rounded-md bg-slate-50 px-2 py-1">
                                Penalties <b className={(item.penaltiesDelta ?? 0) <= 0 ? "text-emerald-700" : "text-rose-700"}>{formatDelta(item.penaltiesDelta ?? 0)}</b>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Next FY Strategic Focus" subtitle="Deterministic coaching cues generated from your trend + rank position" />
              <CardBody>
                {strategicFocus.length === 0 ? (
                  <div className="text-sm text-slate-600">Play at least one financial year to unlock strategic focus cues.</div>
                ) : (
                  <div className="space-y-2">
                    {strategicFocus.map((item, index) => (
                      <div key={item} className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                        <div className="font-semibold text-slate-900">Priority {index + 1}</div>
                        <div className="mt-1">{item}</div>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Comparative Line Graph"
                subtitle="Normalized trend view for points, SPI, CPI, quality, safety, and stakeholder across financial years"
              />
              <CardBody className="space-y-4">
                {!chartModel ? (
                  <div className="text-sm text-slate-600">
                    Line graph appears once at least 2 financial years are available.
                  </div>
                ) : (
                  <>
                    <div className="mobile-scroll-x rounded-xl border border-slate-200 bg-white p-3">
                      <svg viewBox={`0 0 ${chartModel.width} ${chartModel.height}`} className="min-w-[720px] w-full" role="img" aria-label="Comparative financial year line chart">
                        <rect x="0" y="0" width={chartModel.width} height={chartModel.height} fill="white" />

                        {chartModel.yTicks.map((tick) => {
                          const y = chartModel.yForPercent(tick);
                          return (
                            <g key={`y-${tick}`}>
                              <line
                                x1={chartModel.padLeft}
                                y1={y}
                                x2={chartModel.width - chartModel.padRight}
                                y2={y}
                                stroke="#e2e8f0"
                                strokeWidth="1"
                              />
                              <text x={chartModel.padLeft - 10} y={y + 4} textAnchor="end" fontSize="11" fill="#64748b">
                                {tick}
                              </text>
                            </g>
                          );
                        })}

                        {yearRows.map((row, index) => {
                          const x = chartModel.xForIndex(index);
                          return (
                            <g key={row.round_number}>
                              <line
                                x1={x}
                                y1={chartModel.padTop}
                                x2={x}
                                y2={chartModel.height - chartModel.padBottom}
                                stroke="#f1f5f9"
                                strokeWidth="1"
                              />
                              <text
                                x={x}
                                y={chartModel.height - chartModel.padBottom + 18}
                                textAnchor="middle"
                                fontSize="11"
                                fill="#475569"
                              >
                                {row.fy}
                              </text>
                            </g>
                          );
                        })}

                        {chartModel.series.map((series) => (
                          <g key={series.metric.key}>
                            <path d={series.path} fill="none" stroke={series.metric.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                            {series.points.map((point, idx) => (
                              <circle key={`${series.metric.key}-${idx}`} cx={point.x} cy={point.y} r="3.5" fill={series.metric.color}>
                                <title>{`${series.metric.label} | ${point.fy}: ${point.value.toFixed(2)}`}</title>
                              </circle>
                            ))}
                          </g>
                        ))}
                      </svg>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                      {chartModel.series.map((series) => (
                        <div key={series.metric.key} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700">
                          <div className="flex items-center gap-2">
                            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: series.metric.color }} />
                            <span className="font-semibold text-slate-900">{series.metric.label}</span>
                          </div>
                          <div className="mt-1 text-slate-500">Normalized trend</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="FY Change Drilldown"
                subtitle="Select an FY, inspect what changed vs previous year, and simulate deterministic next FY impact"
              />
              <CardBody className="space-y-4">
                {!drilldownModel ? (
                  <div className="text-sm text-slate-600">Play at least one financial year to unlock this drilldown.</div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
                      <div className="rounded-xl border border-slate-200 bg-white p-3 lg:col-span-1">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Financial year</label>
                        <select
                          value={drilldownRound ?? ""}
                          onChange={(event) => {
                            const next = Number(event.target.value);
                            setDrilldownRound(Number.isFinite(next) ? next : null);
                          }}
                          className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
                        >
                          {yearRows.map((row) => (
                            <option key={`drilldown-round-${row.round_number}`} value={row.round_number}>
                              {row.fy}
                            </option>
                          ))}
                        </select>
                        <div className="mt-2 text-xs text-slate-500">
                          {drilldownModel.previous
                            ? `Compared against ${drilldownModel.previous.fy}.`
                            : "First available FY baseline for this team."}
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white p-3 lg:col-span-1">
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span>Schedule recovery</span>
                          <span className="font-semibold text-slate-900">{drilldownScheduleEffort}</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={drilldownScheduleEffort}
                          onChange={(event) => setDrilldownScheduleEffort(Number(event.target.value))}
                          className="mt-2 w-full accent-teal-600"
                        />
                        <div className="mt-2 text-[11px] text-slate-500">Higher values improve SPI and reduce delay penalties.</div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white p-3 lg:col-span-1">
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span>Cost discipline</span>
                          <span className="font-semibold text-slate-900">{drilldownCostControl}</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={drilldownCostControl}
                          onChange={(event) => setDrilldownCostControl(Number(event.target.value))}
                          className="mt-2 w-full accent-cyan-600"
                        />
                        <div className="mt-2 text-[11px] text-slate-500">Higher values improve CPI and protect cash closing.</div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white p-3 lg:col-span-1">
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span>Quality & safety program</span>
                          <span className="font-semibold text-slate-900">{drilldownQualitySafety}</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={drilldownQualitySafety}
                          onChange={(event) => setDrilldownQualitySafety(Number(event.target.value))}
                          className="mt-2 w-full accent-emerald-600"
                        />
                        <div className="mt-2 text-[11px] text-slate-500">Higher values cut risk debt and lift stakeholder confidence.</div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recommended Preset</div>
                          <div className="mt-1 text-sm font-semibold text-slate-900">
                            Auto {drilldownModel.current.fy} Preset
                          </div>
                          <div className="text-xs text-slate-500">Save this recommendation or promote directly to next FY draft defaults.</div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleSaveDrilldownPreset()}
                            disabled={drilldownActionBusy !== null}
                            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            {drilldownActionBusy === "save" ? "Saving..." : "Save Recommended Preset"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handlePromoteDrilldownPreset()}
                            disabled={drilldownActionBusy !== null || !nextPlayableRound}
                            className="rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            {drilldownActionBusy === "promote"
                              ? "Promoting..."
                              : nextPlayableRound
                              ? `Promote to FY ${nextPlayableRound}`
                              : "No next FY available"}
                          </button>
                        </div>
                      </div>

                      {drilldownActionError ? (
                        <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{drilldownActionError}</div>
                      ) : null}
                      {drilldownActionMessage ? (
                        <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{drilldownActionMessage}</div>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
                      <div className="rounded-lg border border-slate-200 bg-white p-2">
                        <div className="text-slate-500">Projected points</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">
                          {drilldownModel.projected.points}
                          <span className={`ml-1 ${drilldownModel.projected.points >= drilldownModel.current.points ? "text-emerald-700" : "text-rose-700"}`}>
                            ({formatDelta(drilldownModel.projected.points - drilldownModel.current.points)})
                          </span>
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white p-2">
                        <div className="text-slate-500">Projected cash</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">
                          Rs {formatCurrencyInr(drilldownModel.projected.cash)}
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white p-2">
                        <div className="text-slate-500">Projected SPI / CPI</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">
                          {drilldownModel.projected.spi.toFixed(2)} / {drilldownModel.projected.cpi.toFixed(2)}
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white p-2">
                        <div className="text-slate-500">Projected quality / safety</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">
                          {drilldownModel.projected.quality} / {drilldownModel.projected.safety}
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white p-2">
                        <div className="text-slate-500">Projected stakeholder</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">{drilldownModel.projected.stakeholder}</div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white p-2">
                        <div className="text-slate-500">Projected risk debt</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">
                          {drilldownModel.projected.riskDebt}
                          <span className={`ml-1 ${drilldownModel.projected.riskDebt <= drilldownModel.current.risk_debt_total ? "text-emerald-700" : "text-rose-700"}`}>
                            ({formatDelta(drilldownModel.projected.riskDebt - drilldownModel.current.risk_debt_total)})
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-sm font-semibold text-slate-900">What changed in selected FY</div>
                        <div className="mt-2 space-y-2">
                          {drilldownModel.yoyChanges.length === 0 ? (
                            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                              This is your first FY. Play one more round to unlock year-on-year change bars.
                            </div>
                          ) : (
                            drilldownModel.yoyChanges.map((item) => {
                              const magnitude = Math.max(6, Math.round((Math.abs(item.delta) / drilldownModel.maxYoyAbs) * 100));
                              const improving = item.higherIsBetter ? item.delta >= 0 : item.delta <= 0;
                              const deltaText =
                                item.label === "Cash"
                                  ? `${item.delta >= 0 ? "+" : "-"}Rs ${formatCurrencyInr(Math.abs(item.delta))}`
                                  : item.precision
                                  ? formatSignedFixed(item.delta, item.precision)
                                  : formatDelta(Math.round(item.delta));

                              return (
                                <div key={`yoy-${item.label}`} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs">
                                  <div className="mb-1 flex items-center justify-between">
                                    <span className="font-medium text-slate-700">{item.label}</span>
                                    <span className={improving ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}>{deltaText}</span>
                                  </div>
                                  <div className="h-2 rounded-full bg-slate-200">
                                    <div
                                      className={`h-2 rounded-full ${improving ? "bg-emerald-500" : "bg-rose-500"}`}
                                      style={{ width: `${magnitude}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-sm font-semibold text-slate-900">Next FY deterministic impact estimate</div>
                        <div className="mt-2 space-y-2">
                          {drilldownModel.driverImpacts.map((item) => {
                            const magnitude = Math.max(6, Math.round((Math.abs(item.points) / drilldownModel.maxImpactAbs) * 100));
                            const positive = item.points >= 0;
                            return (
                              <div key={`impact-${item.label}`} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs">
                                <div className="mb-1 flex items-center justify-between">
                                  <span className="font-medium text-slate-700">{item.label}</span>
                                  <span className={positive ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}>{formatDelta(item.points)} pts</span>
                                </div>
                                <div className="h-2 rounded-full bg-slate-200">
                                  <div
                                    className={`h-2 rounded-full ${positive ? "bg-emerald-500" : "bg-rose-500"}`}
                                    style={{ width: `${magnitude}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="mt-3 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-900">
                          {drilldownModel.coachCue}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="FY Trend" subtitle="Year-by-year points and cash movement" />
              <CardBody className="space-y-3">
                {yearRows.length === 0 ? (
                  <div className="text-sm text-slate-600">No locked results yet. Play at least one round to generate report data.</div>
                ) : (
                  yearRows.map((row, index) => {
                    const prev = index > 0 ? yearRows[index - 1] : null;
                    const pointsDelta = prev ? row.points - prev.points : 0;
                    const cashDelta = prev ? row.cash - prev.cash : 0;
                    const pointsWidth = Math.max(8, Math.round((row.points / maxPoints) * 100));
                    const cashWidth = Math.max(8, Math.round((Math.abs(row.cash) / maxCashAbs) * 100));

                    return (
                      <div key={row.round_number} className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-semibold text-slate-900">{row.fy}</div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className={`rounded-full px-2 py-0.5 ${row.kpi_hit ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                              KPI {row.kpi_hit ? "hit" : "miss"}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">Penalties {row.penalties}</span>
                          </div>
                        </div>

                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                          <div className="rounded-md bg-slate-50 p-2">SPI <b>{row.spi.toFixed(2)}</b></div>
                          <div className="rounded-md bg-slate-50 p-2">CPI <b>{row.cpi.toFixed(2)}</b></div>
                          <div className="rounded-md bg-slate-50 p-2">Quality <b>{row.quality}</b></div>
                          <div className="rounded-md bg-slate-50 p-2">Safety <b>{row.safety}</b></div>
                          <div className="rounded-md bg-slate-50 p-2">Stakeholder <b>{row.stakeholder}</b></div>
                        </div>

                        <div className="mt-3 space-y-2">
                          <div>
                            <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                              <span>Points</span>
                              <span>
                                {row.points}
                                {prev ? ` (${formatDelta(pointsDelta)} vs previous FY)` : ""}
                              </span>
                            </div>
                            <div className="h-2 rounded-full bg-slate-200">
                              <div className="h-2 rounded-full bg-gradient-to-r from-teal-500 to-cyan-600" style={{ width: `${pointsWidth}%` }} />
                            </div>
                          </div>

                          <div>
                            <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                              <span>Cash closing</span>
                              <span>
                                Rs {formatCurrencyInr(row.cash)}
                                {prev ? ` (${formatCurrencyInr(cashDelta)} vs previous FY)` : ""}
                              </span>
                            </div>
                            <div className="h-2 rounded-full bg-slate-200">
                              <div
                                className={`h-2 rounded-full ${row.cash >= 0 ? "bg-gradient-to-r from-emerald-500 to-teal-600" : "bg-gradient-to-r from-rose-500 to-orange-500"}`}
                                style={{ width: `${cashWidth}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Yearly Ledger"
                subtitle={
                  isFacilitator
                    ? "Round-wise financial and scoring snapshot with CSV export"
                    : "Round-wise financial and scoring snapshot"
                }
              />
              <CardBody>
                {isFacilitator ? (
                  <div className="mb-3 flex justify-end">
                    <button
                      type="button"
                      onClick={handleDownloadYearlyLedger}
                      disabled={yearRows.length === 0}
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Download CSV
                    </button>
                  </div>
                ) : null}
                <div className="mobile-scroll-x">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-2 py-2">FY</th>
                        <th className="px-2 py-2">Points</th>
                        <th className="px-2 py-2">Penalties</th>
                        <th className="px-2 py-2">SPI</th>
                        <th className="px-2 py-2">CPI</th>
                        <th className="px-2 py-2">Quality</th>
                        <th className="px-2 py-2">Safety</th>
                        <th className="px-2 py-2">Stakeholder</th>
                        <th className="px-2 py-2">Cash Closing (Rs)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {yearRows.map((row) => (
                        <tr key={row.round_number} className="border-b border-slate-100">
                          <td className="px-2 py-2 font-semibold text-slate-900">{row.fy}</td>
                          <td className="px-2 py-2">{row.points}</td>
                          <td className="px-2 py-2">{row.penalties}</td>
                          <td className="px-2 py-2">{row.spi.toFixed(2)}</td>
                          <td className="px-2 py-2">{row.cpi.toFixed(2)}</td>
                          <td className="px-2 py-2">{row.quality}</td>
                          <td className="px-2 py-2">{row.safety}</td>
                          <td className="px-2 py-2">{row.stakeholder}</td>
                          <td className="px-2 py-2">{formatCurrencyInr(row.cash)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
          </>
        ) : null}
      </div>
    </RequireAuth>
  );
}




















