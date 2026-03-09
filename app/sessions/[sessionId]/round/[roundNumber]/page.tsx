
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { getSupabaseClient } from "@/lib/supabaseClient";
import {
  computeRoundResultV2,
  DecisionDraft,
  RoundResult,
  RiskAppetite,
  Governance,
  VendorStrategy,
} from "@/lib/simEngine";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  DecisionProfile,
  DEFAULT_DECISION_PROFILE,
  estimateBudgetBreakdown,
  parseDecisionProfile,
  ExternalContext,
  StrategicPosture,
  ExpansionMode,
  ConstructionSector,
  SecondarySector,
  SubcontractorProfile,
  WorkforceLoadState,
  CompliancePosture,
  WorkforcePlan,
  OvertimePolicy,
  QaFrequency,
  LogisticsResilience,
  TransparencyLevel,
  FinancingPosture,
  MessageTone,
  BudgetBreakdown,
} from "@/lib/decisionProfile";
import { ConstructionEvent, getRoundConstructionEvents } from "@/lib/constructionNews";
import { KPI_TARGET_OPTIONS, KpiTarget, parseKpiTarget, evaluateKpiAchievement, applyKpiMultiplier } from "@/lib/kpi";
import { getNewsImageUrl } from "@/lib/newsVisuals";
import { parseConstructionEvents } from "@/lib/newsPayload";

const externalContextOptions: Array<{ value: ExternalContext; icon: string; text: string }> = [
  { value: "Stable Environment", icon: "ST", text: "Stable environment" },
  { value: "Material Price Spike", icon: "MP", text: "Material price spike" },
  { value: "Labor Tightness", icon: "LB", text: "Labor tightness" },
  { value: "Permitting Delay", icon: "PD", text: "Permitting delay" },
];

const postureOptions: Array<{ value: StrategicPosture; icon: string; text: string }> = [
  { value: "Balanced Portfolio", icon: "BP", text: "Balanced portfolio" },
  { value: "Cost Leadership", icon: "CL", text: "Cost leadership" },
  { value: "Quality Leadership", icon: "QL", text: "Quality leadership" },
  { value: "Stakeholder Trust", icon: "TR", text: "Stakeholder trust" },
];

const expansionOptions: Array<{ value: ExpansionMode; icon: string; text: string }> = [
  { value: "Consolidate Existing Regions", icon: "CO", text: "Consolidate existing regions" },
  { value: "Pilot One New Region", icon: "P1", text: "Pilot one new region" },
  { value: "Scale Two New Regions", icon: "S2", text: "Scale two new regions" },
];

const sectorOptions: Array<{ value: ConstructionSector; icon: string; text: string }> = [
  { value: "Roads & Highways", icon: "RD", text: "Roads & Highways" },
  { value: "Transmission & Power", icon: "TR", text: "Transmission & Power" },
  { value: "Bridges & Flyovers", icon: "BR", text: "Bridges & Flyovers" },
  { value: "Airports & Metro", icon: "AP", text: "Airports & Metro" },
  { value: "Dams & Irrigation", icon: "DM", text: "Dams & Irrigation" },
  { value: "Residential & Real Estate", icon: "RE", text: "Residential & Real Estate" },
  { value: "Heavy Civil & Industrial", icon: "HC", text: "Heavy Civil & Industrial" },
];

const secondarySectorOptions: SecondarySector[] = ["None", ...sectorOptions.map((sector) => sector.value)];

const subcontractorOptions: Array<{ value: SubcontractorProfile; icon: string; text: string; hint: string }> = [
  { value: "Tier 1 Proven", icon: "T1", text: "Tier 1 Proven", hint: "Highest quality and governance, premium cost." },
  { value: "Tier 2 Value", icon: "T2", text: "Tier 2 Value", hint: "Balanced quality-productivity-cost profile." },
  { value: "Tier 3 Fast Track", icon: "T3", text: "Tier 3 Fast Track", hint: "Fast and cheaper, elevated quality/compliance risk." },
];

const workloadOptions: WorkforceLoadState[] = ["Underloaded", "Balanced", "Overloaded"];
const complianceOptions: CompliancePosture[] = ["Strict Compliance", "Pragmatic", "High-Risk Facilitation"];
const workforceOptions: Array<{ value: WorkforcePlan; icon: string; text: string }> = [
  { value: "Lean Core Team", icon: "LC", text: "Lean core team" },
  { value: "Balanced Hiring", icon: "BH", text: "Balanced hiring" },
  { value: "Acceleration Hiring", icon: "AH", text: "Acceleration hiring" },
];

const overtimeOptions: Array<{ value: OvertimePolicy; icon: string; text: string }> = [
  { value: "Tight Limits", icon: "TL", text: "Tight overtime limits" },
  { value: "Flexible", icon: "FX", text: "Flexible overtime" },
  { value: "High Intensity", icon: "HI", text: "High intensity" },
];

const qaOptions: QaFrequency[] = ["Weekly", "Biweekly", "Monthly"];

const logisticsOptions: Array<{ value: LogisticsResilience; icon: string; text: string }> = [
  { value: "Lean Cost", icon: "LC", text: "Lean cost" },
  { value: "Balanced", icon: "BL", text: "Balanced" },
  { value: "High Resilience", icon: "HR", text: "High resilience" },
];

const transparencyOptions: Array<{ value: TransparencyLevel; icon: string; text: string }> = [
  { value: "Standard", icon: "ST", text: "Standard" },
  { value: "Proactive", icon: "PR", text: "Proactive" },
  { value: "Public Dashboard", icon: "DB", text: "Public dashboard" },
];

const financingOptions: Array<{ value: FinancingPosture; icon: string; text: string }> = [
  { value: "Cash First", icon: "CF", text: "Cash first" },
  { value: "Balanced Debt", icon: "BD", text: "Balanced debt" },
  { value: "Growth Debt", icon: "GD", text: "Growth debt" },
];

const messageToneOptions: MessageTone[] = ["Confident", "Collaborative", "Aggressive"];
const riskOptions: RiskAppetite[] = ["Conservative", "Balanced", "Aggressive"];
const governanceOptions: Governance[] = ["Low", "Medium", "High"];
const vendorOptions: VendorStrategy[] = ["Cheapest", "Balanced", "Reliable"];

const stepTitles = [
  "Context & Strategy",
  "Market & Governance",
  "People & Engineering",
  "Ops & Stakeholder",
  "Finance & Lock",
] as const;

const ROUND_LOCK_WINDOW_MINUTES = 35;

type StepIndex = 0 | 1 | 2 | 3 | 4;

type ExtendedDecisionForm = DecisionDraft & DecisionProfile;

type RouteParams = {
  sessionId?: string;
  roundNumber?: string;
  round?: string;
};

type SessionRow = { round_count: number; current_round: number; created_by: string };
type MembershipRow = { team_id: string };
type TeamRow = { id: string; team_name: string; session_id: string; kpi_target: string | null };

type ExistingDecisionRow = DecisionDraft & {
  raw: Record<string, unknown> | null;
  locked: boolean;
};

type TeamResultSummaryRow = { points_earned: number | null };
type PrevDecisionRawRow = { raw: Record<string, unknown> | null };
type SessionRoundRow = { deadline_at: string; status: string | null; news_payload: unknown };

const defaultForm: ExtendedDecisionForm = {
  focus_cost: 25,
  focus_quality: 25,
  focus_stakeholder: 25,
  focus_speed: 25,
  risk_appetite: "Balanced",
  governance_intensity: "Medium",
  buffer_percent: 5,
  vendor_strategy: "Balanced",
  ...DEFAULT_DECISION_PROFILE,
};


const externalContextVisuals: Record<ExternalContext, { emoji: string; visualClass: string }> = {
  "Stable Environment": {
    emoji: "SK",
    visualClass: "bg-gradient-to-br from-cyan-500 via-sky-500 to-blue-700",
  },
  "Material Price Spike": {
    emoji: "MC",
    visualClass: "bg-gradient-to-br from-amber-500 via-orange-500 to-rose-600",
  },
  "Labor Tightness": {
    emoji: "LF",
    visualClass: "bg-gradient-to-br from-fuchsia-500 via-pink-500 to-rose-500",
  },
  "Permitting Delay": {
    emoji: "RG",
    visualClass: "bg-gradient-to-br from-slate-500 via-slate-600 to-zinc-700",
  },
};

const postureVisuals: Record<StrategicPosture, { emoji: string; visualClass: string }> = {
  "Balanced Portfolio": {
    emoji: "BL",
    visualClass: "bg-gradient-to-br from-teal-500 via-emerald-500 to-green-700",
  },
  "Cost Leadership": {
    emoji: "CT",
    visualClass: "bg-gradient-to-br from-indigo-500 via-blue-500 to-cyan-700",
  },
  "Quality Leadership": {
    emoji: "QL",
    visualClass: "bg-gradient-to-br from-violet-500 via-purple-500 to-indigo-700",
  },
  "Stakeholder Trust": {
    emoji: "TR",
    visualClass: "bg-gradient-to-br from-rose-500 via-red-500 to-orange-700",
  },
};
type SectorVisualMeta = {
  image: string;
  headline: string;
  challenge: string;
  quality_expectation: string;
};

const sectorVisuals: Record<ConstructionSector, SectorVisualMeta> = {
  "Roads & Highways": {
    image: "https://images.pexels.com/photos/280221/pexels-photo-280221.jpeg?auto=compress&cs=tinysrgb&w=1200",
    headline: "High volume corridor EPC",
    challenge: "Monsoon drainage, bitumen volatility, and traffic-diversion sequencing drive yearly variance.",
    quality_expectation: "Pavement quality and turnaround speed are heavily audited.",
  },
  "Transmission & Power": {
    image: "https://images.pexels.com/photos/414837/pexels-photo-414837.jpeg?auto=compress&cs=tinysrgb&w=1200",
    headline: "Grid reliability and corridor access",
    challenge: "ROW clearances and safety protocols create schedule and stakeholder pressure.",
    quality_expectation: "Reliability and incident-free delivery matter more than pure speed.",
  },
  "Bridges & Flyovers": {
    image: "https://images.pexels.com/photos/258117/pexels-photo-258117.jpeg?auto=compress&cs=tinysrgb&w=1200",
    headline: "Complex staging in dense corridors",
    challenge: "Temporary works, traffic management, and quality control of structural packages are key.",
    quality_expectation: "Rework penalties are nonlinear due to structural safety scrutiny.",
  },
  "Airports & Metro": {
    image: "https://images.pexels.com/photos/1105766/pexels-photo-1105766.jpeg?auto=compress&cs=tinysrgb&w=1200",
    headline: "Interface-heavy urban mega projects",
    challenge: "Multi-agency approvals and handover integration often drive delay risk.",
    quality_expectation: "High QA, documentation discipline, and stakeholder trust are non-negotiable.",
  },
  "Dams & Irrigation": {
    image: "https://images.pexels.com/photos/1227513/pexels-photo-1227513.jpeg?auto=compress&cs=tinysrgb&w=1200",
    headline: "Heavy civil under hydrology uncertainty",
    challenge: "Flood windows and geotechnical risk require strong resilience and contingency budgets.",
    quality_expectation: "Concrete quality and safety controls dominate scoring outcomes.",
  },
  "Residential & Real Estate": {
    image: "https://images.pexels.com/photos/323780/pexels-photo-323780.jpeg?auto=compress&cs=tinysrgb&w=1200",
    headline: "Cash-cycle sensitive delivery",
    challenge: "Demand cycles and compliance disclosures directly impact cash and stakeholder scores.",
    quality_expectation: "Timely handover plus transparent communication sustain trust.",
  },
  "Heavy Civil & Industrial": {
    image: "https://images.pexels.com/photos/256381/pexels-photo-256381.jpeg?auto=compress&cs=tinysrgb&w=1200",
    headline: "Specialized equipment-led execution",
    challenge: "Asset utilization, specialist subcontracting, and safety governance drive competitiveness.",
    quality_expectation: "Capability fit and execution depth are rewarded over aggressive bidding.",
  },
};
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function toErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: string }).message;
    if (message) return message;
  }
  return fallback;
}


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

function parseRoundEventsPayload(payload: unknown): ConstructionEvent[] | null {
  return parseConstructionEvents(payload);
}

function buildCoreDecision(form: ExtendedDecisionForm): DecisionDraft {
  return {
    focus_cost: form.focus_cost,
    focus_quality: form.focus_quality,
    focus_stakeholder: form.focus_stakeholder,
    focus_speed: form.focus_speed,
    risk_appetite: form.risk_appetite,
    governance_intensity: form.governance_intensity,
    buffer_percent: form.buffer_percent,
    vendor_strategy: form.vendor_strategy,
  };
}

function extractProfile(form: ExtendedDecisionForm): DecisionProfile {
  return {
    external_context: form.external_context,
    public_message_tone: form.public_message_tone,
    strategic_posture: form.strategic_posture,
    market_expansion: form.market_expansion,

    primary_sector: form.primary_sector,
    secondary_sector: form.secondary_sector,

    project_mix_public_pct: form.project_mix_public_pct,
    bid_aggressiveness: form.bid_aggressiveness,

    self_perform_percent: form.self_perform_percent,
    subcontractor_profile: form.subcontractor_profile,
    specialized_work_index: form.specialized_work_index,

    workforce_plan: form.workforce_plan,
    workforce_load_state: form.workforce_load_state,
    work_life_balance_index: form.work_life_balance_index,
    training_intensity: form.training_intensity,
    overtime_policy: form.overtime_policy,

    qa_audit_frequency: form.qa_audit_frequency,
    innovation_budget_index: form.innovation_budget_index,

    logistics_resilience: form.logistics_resilience,
    inventory_cover_weeks: form.inventory_cover_weeks,
    pm_utilization_target: form.pm_utilization_target,

    digital_visibility_spend: form.digital_visibility_spend,
    community_engagement: form.community_engagement,
    transparency_level: form.transparency_level,

    compliance_posture: form.compliance_posture,
    facilitation_budget_index: form.facilitation_budget_index,
    csr_sustainability_index: form.csr_sustainability_index,

    financing_posture: form.financing_posture,
    cash_buffer_months: form.cash_buffer_months,
    contingency_fund_percent: form.contingency_fund_percent,
  };
}

function StepTile({
  active,
  title,
  description,
  icon,
  onClick,
  disabled,
  emoji,
  visualClass,
  imageUrl,
}: {
  active: boolean;
  title: string;
  description: string;
  icon: string;
  onClick: () => void;
  disabled?: boolean;
  emoji?: string;
  visualClass?: string;
  imageUrl?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full rounded-xl border px-3 py-3 text-left transition ${
        active
          ? "border-teal-400 bg-teal-50 shadow-sm"
          : "border-slate-200 bg-white hover:border-teal-300"
      } ${disabled ? "opacity-50" : ""}`}
    >
      {imageUrl ? (
        <div className="relative mb-2 h-16 overflow-hidden rounded-lg border border-slate-200">
          <img src={imageUrl} alt={title} className="h-full w-full object-cover" loading="lazy" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/35 to-transparent" />
        </div>
      ) : visualClass ? (
        <div
          className={`mb-2 flex h-14 items-end rounded-lg border border-white/30 px-2 py-1 text-xs font-semibold text-white shadow-sm ${visualClass}`}
        >
          {emoji ? `${emoji} theme` : "Scenario"}
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <span className="text-base">{icon}</span>
        <span className="text-sm font-semibold text-slate-900">{title}</span>
      </div>
      <div className="mt-1 text-xs text-slate-600">{description}</div>
    </button>
  );
}
function BudgetBar({ label, value, max }: { label: string; value: number; max: number }) {
  const width = Math.round((value / Math.max(max, 1)) * 100);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-slate-600">
        <span>{label}</span>
        <span>Rs {Math.round(value / 1000)}k</span>
      </div>
      <div className="h-2 rounded-full bg-slate-200">
        <div
          className="h-2 rounded-full bg-gradient-to-r from-cyan-500 to-teal-600"
          style={{ width: `${clamp(width, 5, 100)}%` }}
        />
      </div>
    </div>
  );
}


function FocusSlider({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (next: number) => void;
}) {
  return (
    <label className="block rounded-lg border border-slate-200 bg-white p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-slate-700">{label}</span>
        <span className="text-xs text-slate-500">{value}</span>
      </div>
      <input
        className="mt-2 w-full"
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  disabled?: boolean;
  onChange: (next: number) => void;
}) {
  return (
    <label className="block rounded-lg border border-slate-200 bg-white p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-slate-700">{label}</span>
        <span className="text-xs text-slate-500">
          {value}
          {suffix}
        </span>
      </div>
      <input
        className="mt-2 w-full"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
function formatClock(ms: number) {
  const clamped = Math.max(0, ms);
  const minutes = Math.floor(clamped / 60000);
  const seconds = Math.floor((clamped % 60000) / 1000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function ProjectionBar({
  label,
  value,
  min,
  max,
  suffix,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
}) {
  const percent = clamp(((value - min) / Math.max(max - min, 1)) * 100, 0, 100);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-slate-600">
        <span>{label}</span>
        <span>
          {value}
          {suffix ?? ""}
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-200">
        <div
          className="h-2 rounded-full bg-gradient-to-r from-indigo-500 via-cyan-500 to-emerald-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
export default function RoundDecisionPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseClient(), []);

  const routeParams = params as RouteParams;
  const sessionId = routeParams.sessionId ?? "";
  const roundParam = routeParams.roundNumber ?? routeParams.round ?? "1";
  const parsedRound = Number.parseInt(roundParam, 10);
  const roundNumber = Number.isFinite(parsedRound) && parsedRound > 0 ? parsedRound : 1;

  const [userId, setUserId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [teamName, setTeamName] = useState("");
  const [sessionRoundCount, setSessionRoundCount] = useState(0);

  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [locking, setLocking] = useState(false);

  const [clockNow, setClockNow] = useState(Date.now());
  const [roundDeadlineIso, setRoundDeadlineIso] = useState<string | null>(null);
  const [roundClockSource, setRoundClockSource] = useState<"shared" | "fallback">("fallback");
  const [roundStatus, setRoundStatus] = useState<"open" | "closed">("open");
  const [lockedTeamsCount, setLockedTeamsCount] = useState(0);
  const [totalTeamsCount, setTotalTeamsCount] = useState(0);

  const [activeStep, setActiveStep] = useState<StepIndex>(0);
  const [form, setForm] = useState<ExtendedDecisionForm>(defaultForm);
  const [teamKpiTarget, setTeamKpiTarget] = useState<KpiTarget | null>(null);
  const [draftKpiTarget, setDraftKpiTarget] = useState<KpiTarget | null>(null);
  const [savingKpiTarget, setSavingKpiTarget] = useState(false);

  const roundEvents = useMemo(() => getRoundConstructionEvents(sessionId, roundNumber), [sessionId, roundNumber]);
  const [resolvedRoundEvents, setResolvedRoundEvents] = useState<ConstructionEvent[]>(roundEvents);

  const focusSum = form.focus_cost + form.focus_quality + form.focus_stakeholder + form.focus_speed;
  const kpiReady = roundNumber !== 1 || Boolean(teamKpiTarget || draftKpiTarget);
  const profile = useMemo(() => extractProfile(form), [form]);
  const budget: BudgetBreakdown = useMemo(() => estimateBudgetBreakdown(profile), [profile]);

  useEffect(() => {
    setResolvedRoundEvents(roundEvents);
  }, [roundEvents]);


    const stepValidations: Record<StepIndex, boolean> = {
    0: focusSum === 100 && kpiReady && Boolean(form.external_context && form.strategic_posture && form.primary_sector),
    1:
      form.bid_aggressiveness >= 1 &&
      form.bid_aggressiveness <= 5 &&
      (form.secondary_sector === "None" || form.secondary_sector !== form.primary_sector),
    2:
      form.training_intensity >= 20 &&
      form.innovation_budget_index >= 25 &&
      form.self_perform_percent >= 30 &&
      form.self_perform_percent <= 90,
    3:
      form.inventory_cover_weeks >= 2 &&
      form.community_engagement >= 30 &&
      form.work_life_balance_index >= 25,
    4:
      form.cash_buffer_months >= 2 &&
      form.contingency_fund_percent >= 4 &&
      (form.compliance_posture !== "High-Risk Facilitation" || form.facilitation_budget_index <= 60),
  };

    const readinessChecks = [
    { label: "Focus allocation totals exactly 100", pass: focusSum === 100 },
    {
      label: "Team KPI target selected in Round 1",
      pass: roundNumber !== 1 || Boolean(teamKpiTarget || draftKpiTarget),
    },
    {
      label: "Primary sector selected and secondary sector not duplicated",
      pass: form.secondary_sector === "None" || form.secondary_sector !== form.primary_sector,
    },
    {
      label: "Expansion not overloaded by workforce",
      pass:
        form.market_expansion === "Consolidate Existing Regions" ||
        form.workforce_plan !== "Lean Core Team",
    },
    {
      label: "Aggressive risk has contingency cover",
      pass: form.risk_appetite !== "Aggressive" || form.contingency_fund_percent >= 8,
    },
    {
      label: "Make-vs-buy mix is in stable operating range",
      pass: form.self_perform_percent >= 35 && form.self_perform_percent <= 85,
    },
    {
      label: "P&M utilization not in overload zone",
      pass: form.pm_utilization_target <= 88,
    },
    {
      label: "Quality guardrails align with speed",
      pass: form.focus_speed <= 35 || form.qa_audit_frequency !== "Monthly",
    },
    {
      label: "Compliance risk budget controlled",
      pass: form.compliance_posture !== "High-Risk Facilitation" || form.facilitation_budget_index <= 40,
    },
    {
      label: "Liquidity protection for current budget pressure",
      pass: budget.total_budget_pressure < 4800000 || form.cash_buffer_months >= 4,
    },
  ];

  const readinessScore = Math.round(
    (readinessChecks.filter((check) => check.pass).length / readinessChecks.length) * 100
  );

  function update<K extends keyof ExtendedDecisionForm>(key: K, value: ExtendedDecisionForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }


  async function ensureTeamKpiTarget(requireForRoundOne: boolean): Promise<KpiTarget | null> {
    if (teamKpiTarget) return teamKpiTarget;

    const selected = draftKpiTarget;
    if (!selected) {
      if (requireForRoundOne && roundNumber === 1) {
        throw new Error("Select a Team KPI target in Step 1 before locking Round 1.");
      }
      return null;
    }

    if (!teamId) throw new Error("Team not loaded yet.");

    setSavingKpiTarget(true);
    try {
      const nowIso = new Date().toISOString();
      const { error: teamErr } = await supabase
        .from("teams")
        .update({ kpi_target: selected, kpi_selected_at: nowIso })
        .eq("id", teamId);

      if (teamErr) throw teamErr;

      setTeamKpiTarget(selected);
      return selected;
    } finally {
      setSavingKpiTarget(false);
    }
  }


  async function saveKpiTargetNow() {
    setError("");

    try {
      await ensureTeamKpiTarget(true);
    } catch (unknownError: unknown) {
      setError(toErrorMessage(unknownError, "Failed to save KPI target"));
    }
  }

  const previewResult = useMemo(() => {
    const seed = `${sessionId}:${teamId || "preview"}:${roundNumber}:preview`;
    return computeRoundResultV2(buildCoreDecision(form), seed, {
      profile,
      events: resolvedRoundEvents,
    });
  }, [form, profile, resolvedRoundEvents, roundNumber, sessionId, teamId]);

  const msLeft = roundDeadlineIso ? Date.parse(roundDeadlineIso) - clockNow : null;
  const lockWindowExpired = msLeft !== null && msLeft <= 0;
  const availableStep = (index: StepIndex) => {
    if (index === 0) return true;

    for (let i = 0; i < index; i++) {
      const key = i as StepIndex;
      if (!stepValidations[key]) return false;
    }

    return true;
  };

  
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setClockNow(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!sessionId || !teamId) return;

    let cancelled = false;

    const setFallbackDeadline = () => {
      const key = `bharatinfra:round-clock:${sessionId}:${teamId}:${roundNumber}`;

      try {
        let anchorIso = window.localStorage.getItem(key);
        if (!anchorIso) {
          anchorIso = new Date().toISOString();
          window.localStorage.setItem(key, anchorIso);
        }

        const anchorMs = Date.parse(anchorIso);
        const deadlineMs = anchorMs + ROUND_LOCK_WINDOW_MINUTES * 60_000;
        if (!cancelled) {
          setRoundDeadlineIso(new Date(deadlineMs).toISOString());
          setRoundClockSource("fallback");
        }
      } catch {
        const fallback = Date.now() + ROUND_LOCK_WINDOW_MINUTES * 60_000;
        if (!cancelled) {
          setRoundDeadlineIso(new Date(fallback).toISOString());
          setRoundClockSource("fallback");
        }
      }
    };

    const syncSharedRoundState = async () => {
      const { data: roundRowData, error: roundErr } = await supabase
        .from("session_rounds")
        .select("deadline_at,status,news_payload")
        .eq("session_id", sessionId)
        .eq("round_number", roundNumber)
        .maybeSingle();

      if (roundErr) {
        if (!isMissingTableError(roundErr.message) && !cancelled) {
          setError((prev) => prev || `Round orchestration sync failed: ${roundErr.message}`);
        }
        setFallbackDeadline();
        return;
      }

      const row = roundRowData as SessionRoundRow | null;
      if (!row) {
        if (!cancelled) {
          setRoundClockSource("shared");
          setRoundStatus("closed");
          setRoundDeadlineIso(null);
          setResolvedRoundEvents(roundEvents);
          setError((prev) => prev || "Round is not opened by facilitator yet.");
        }
        return;
      }

      if (!cancelled) {
        setRoundDeadlineIso(row.deadline_at);
        setRoundClockSource("shared");
        setRoundStatus(row.status === "closed" ? "closed" : "open");
        if (row.status === "closed") setError((prev) => prev || "Round is closed by facilitator.");
        if (row.status !== "closed") setError((prev) => (prev === "Round is closed by facilitator." || prev === "Round is not opened by facilitator yet." ? "" : prev));
        setResolvedRoundEvents(parseRoundEventsPayload(row.news_payload) ?? roundEvents);
      }
    };

    syncSharedRoundState();
    const intervalId = window.setInterval(syncSharedRoundState, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [roundNumber, roundEvents, sessionId, supabase, teamId, userId]);

  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;

    const refreshLockProgress = async () => {
      const { count: totalCount } = await supabase
        .from("teams")
        .select("id", { head: true, count: "exact" })
        .eq("session_id", sessionId);

      const { count: lockedCount } = await supabase
        .from("decisions")
        .select("team_id", { head: true, count: "exact" })
        .eq("session_id", sessionId)
        .eq("round_number", roundNumber)
        .eq("locked", true);

      if (!cancelled) {
        const total = totalCount ?? 0;
        const lockedCountSafe = lockedCount ?? 0;
        setTotalTeamsCount(total);
        setLockedTeamsCount(lockedCountSafe);
        if (total > 0 && lockedCountSafe >= total) {
          setRoundStatus("closed");
        }
      }
    };

    refreshLockProgress();
    const intervalId = window.setInterval(refreshLockProgress, 8000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [roundNumber, sessionId, supabase]);
  useEffect(() => {
    (async () => {
      setError("");
      setLoading(true);

      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;

      if (!user) {
        router.replace("/login");
        return;
      }
      setUserId(user.id);

      const { data: sessionData, error: sErr } = await supabase
        .from("sessions")
        .select("round_count,current_round,created_by")
        .eq("id", sessionId)
        .single();

      if (sErr) {
        setError(sErr.message);
        setLoading(false);
        return;
      }

      const sessionRow = sessionData as SessionRow;
      setSessionRoundCount(sessionRow.round_count ?? 0);

      if (sessionRow.round_count && roundNumber > sessionRow.round_count) {
        router.replace(`/sessions/${sessionId}`);
        return;
      }

      const { data: membershipsData, error: mErr } = await supabase
        .from("team_memberships")
        .select("team_id")
        .eq("user_id", user.id);

      if (mErr) {
        setError(mErr.message);
        setLoading(false);
        return;
      }

      const memberships = (membershipsData ?? []) as MembershipRow[];
      const teamIds = memberships.map((m) => m.team_id);

      const { data: teamsData, error: tErr } = await supabase
        .from("teams")
        .select("id,team_name,session_id,kpi_target")
        .in("id", teamIds)
        .eq("session_id", sessionId);

      if (tErr) {
        setError(tErr.message);
        setLoading(false);
        return;
      }

      const teams = (teamsData ?? []) as TeamRow[];
      if (teams.length === 0) {
        setError("You are not a member of this session.");
        setLoading(false);
        return;
      }

      const myTeam = teams[0];
      setTeamId(myTeam.id);
      setTeamName(myTeam.team_name);
      const parsedKpi = parseKpiTarget(myTeam.kpi_target);
      setTeamKpiTarget(parsedKpi);
      setDraftKpiTarget(parsedKpi);

      const { data: existingData, error: dErr } = await supabase
        .from("decisions")
        .select(
          "focus_cost,focus_quality,focus_stakeholder,focus_speed,risk_appetite,governance_intensity,buffer_percent,vendor_strategy,locked,raw"
        )
        .eq("session_id", sessionId)
        .eq("team_id", myTeam.id)
        .eq("round_number", roundNumber)
        .maybeSingle();

      if (dErr) {
        setError(dErr.message);
        setLoading(false);
        return;
      }

      const existing = existingData as ExistingDecisionRow | null;
      if (existing) {
        const parsedProfile = parseDecisionProfile(existing.raw);

        setForm({
          ...defaultForm,
          ...parsedProfile,
          focus_cost: existing.focus_cost,
          focus_quality: existing.focus_quality,
          focus_stakeholder: existing.focus_stakeholder,
          focus_speed: existing.focus_speed,
          risk_appetite: existing.risk_appetite,
          governance_intensity: existing.governance_intensity,
          buffer_percent: existing.buffer_percent,
          vendor_strategy: existing.vendor_strategy,
        });

        setLocked(Boolean(existing.locked));
      }

      setLoading(false);
    })();
  }, [roundNumber, router, sessionId, supabase]);

  async function saveDraft() {
    setError("");
    setSaving(true);

    try {
      if (!teamId) throw new Error("Team not loaded yet.");
      await ensureTeamKpiTarget(false);

      const core = buildCoreDecision(form);
      const profileSnapshot = extractProfile(form);

      const { error: upErr } = await supabase.from("decisions").upsert(
        {
          session_id: sessionId,
          team_id: teamId,
          round_number: roundNumber,
          ...core,
          raw: {
            ...profileSnapshot,
            focusSum,
            readinessScore,
            active_step: activeStep,
            budget,
            events: resolvedRoundEvents,
          },
          locked: false,
          submitted_at: null,
        },
        { onConflict: "session_id,team_id,round_number" }
      );

      if (upErr) throw upErr;
    } catch (unknownError: unknown) {
      setError(toErrorMessage(unknownError, "Failed to save draft"));
    } finally {
      setSaving(false);
    }
  }

  async function lockAndGenerateResults() {
    setError("");
    setLocking(true);

    try {
      if (!teamId) throw new Error("Team not loaded yet.");
      if (focusSum !== 100) throw new Error(`Focus must total 100 (current: ${focusSum}).`);

      const effectiveKpiTarget = await ensureTeamKpiTarget(true);

      const core = buildCoreDecision(form);
      const currentProfile = extractProfile(form);
      const submittedAt = new Date().toISOString();

      const { error: lockErr } = await supabase.from("decisions").upsert(
        {
          session_id: sessionId,
          team_id: teamId,
          round_number: roundNumber,
          ...core,
          raw: {
            ...currentProfile,
            focusSum,
            readinessScore,
            active_step: activeStep,
            budget,
            events: resolvedRoundEvents,
          },
          locked: true,
          submitted_at: submittedAt,
        },
        { onConflict: "session_id,team_id,round_number" }
      );

      if (lockErr) throw lockErr;

      let prevResult: RoundResult | null = null;
      let prevProfile: DecisionProfile | null = null;

      if (roundNumber > 1) {
        const { data: prevResultData } = await supabase
          .from("team_results")
          .select(
            "schedule_index,cost_index,cash_closing,quality_score,safety_score,stakeholder_score,claim_entitlement_score,points_earned,penalties,detail"
          )
          .eq("session_id", sessionId)
          .eq("team_id", teamId)
          .eq("round_number", roundNumber - 1)
          .maybeSingle();

        if (prevResultData) {
          prevResult = {
            ...(prevResultData as Omit<RoundResult, "detail">),
            detail: (prevResultData as { detail?: Record<string, unknown> }).detail ?? {},
          };
        }

        const { data: prevDecisionData } = await supabase
          .from("decisions")
          .select("raw")
          .eq("session_id", sessionId)
          .eq("team_id", teamId)
          .eq("round_number", roundNumber - 1)
          .maybeSingle();

        const prevDecision = prevDecisionData as PrevDecisionRawRow | null;
        prevProfile = parseDecisionProfile(prevDecision?.raw);
      }

      const seed = `${sessionId}:${teamId}:${roundNumber}`;
      const result = computeRoundResultV2(core, seed, {
        profile: currentProfile,
        prevResult,
        prevProfile,
        events: resolvedRoundEvents,
      });

      const kpiEval = evaluateKpiAchievement(effectiveKpiTarget, result);
      const boostedPoints = applyKpiMultiplier(result.points_earned, kpiEval.achieved);

      const augmentedResult: RoundResult = {
        ...result,
        points_earned: boostedPoints,
        detail: {
          ...result.detail,
          events: resolvedRoundEvents,
          kpi: {
            target: effectiveKpiTarget,
            achieved: kpiEval.achieved,
            metric: kpiEval.metricKey,
            actual: kpiEval.actual,
            threshold: kpiEval.threshold,
            threshold_label: kpiEval.thresholdLabel,
            base_points: result.points_earned,
            multiplied_points: boostedPoints,
            multiplier: kpiEval.achieved ? 4 : 1,
          },
        },
      };

      const { error: resultErr } = await supabase.from("team_results").upsert(
        {
          session_id: sessionId,
          team_id: teamId,
          round_number: roundNumber,
          schedule_index: augmentedResult.schedule_index,
          cost_index: augmentedResult.cost_index,
          cash_closing: augmentedResult.cash_closing,
          quality_score: augmentedResult.quality_score,
          safety_score: augmentedResult.safety_score,
          stakeholder_score: augmentedResult.stakeholder_score,
          claim_entitlement_score: augmentedResult.claim_entitlement_score,
          points_earned: augmentedResult.points_earned,
          penalties: augmentedResult.penalties,
          detail: augmentedResult.detail,
        },
        { onConflict: "session_id,team_id,round_number" }
      );

      if (resultErr) throw resultErr;

      const { data: allResultsData, error: allResultsErr } = await supabase
        .from("team_results")
        .select("points_earned")
        .eq("session_id", sessionId)
        .eq("team_id", teamId);

      if (allResultsErr) throw allResultsErr;

      const allResults = (allResultsData ?? []) as TeamResultSummaryRow[];
      const recomputedTotal = allResults.reduce((sum, row) => sum + (row.points_earned ?? 0), 0);

      const { error: teamUpdateErr } = await supabase
        .from("teams")
        .update({ total_points: recomputedTotal })
        .eq("id", teamId);

      if (teamUpdateErr) throw teamUpdateErr;


      const { count: teamCountForRound } = await supabase
        .from("teams")
        .select("id", { head: true, count: "exact" })
        .eq("session_id", sessionId);

      const { count: lockedCountForRound } = await supabase
        .from("decisions")
        .select("team_id", { head: true, count: "exact" })
        .eq("session_id", sessionId)
        .eq("round_number", roundNumber)
        .eq("locked", true);

      const totalCountSafe = teamCountForRound ?? 0;
      const lockedCountSafe = lockedCountForRound ?? 0;
      const allTeamsLocked = totalCountSafe > 0 && lockedCountSafe >= totalCountSafe;

      setTotalTeamsCount(totalCountSafe);
      setLockedTeamsCount(lockedCountSafe);
      setRoundStatus(allTeamsLocked ? "closed" : "open");

      if (allTeamsLocked) {
        const defaultDeadline = roundDeadlineIso ?? new Date().toISOString();
        const { error: roundCloseErr } = await supabase.from("session_rounds").upsert(
          {
            session_id: sessionId,
            round_number: roundNumber,
            status: "closed",
            deadline_at: defaultDeadline,
            closed_at: submittedAt,
            closed_by: userId || null,
            news_payload: resolvedRoundEvents,
            created_by: userId || null,
          },
          { onConflict: "session_id,round_number" }
        );

        if (roundCloseErr && !isMissingTableError(roundCloseErr.message)) {
          throw roundCloseErr;
        }
      }

      const { data: sessionData } = await supabase
        .from("sessions")
        .select("current_round,round_count,created_by")
        .eq("id", sessionId)
        .single();

      const latestSession = sessionData as SessionRow | null;
      if (latestSession && latestSession.created_by === userId && allTeamsLocked) {
        const updatedRound = Math.max(latestSession.current_round ?? 0, roundNumber);
        const status = updatedRound >= (latestSession.round_count ?? 0) ? "complete" : "in_progress";

        await supabase
          .from("sessions")
          .update({ current_round: updatedRound, status })
          .eq("id", sessionId);
      }

      setLocked(true);
      router.push(`/sessions/${sessionId}/round/${roundNumber}/results`);
    } catch (unknownError: unknown) {
      setError(toErrorMessage(unknownError, "Failed to lock and generate results"));
    } finally {
      setLocking(false);
    }
  }

    const biggestBudget = Math.max(
    budget.people_l_and_d,
    budget.engineering_quality,
    budget.operations_resilience,
    budget.stakeholder_visibility,
    budget.risk_contingency,
    budget.financing_cost_pressure,
    budget.subcontracting_and_partnering,
    budget.asset_and_specialization,
    budget.compliance_and_sustainability,
    1
  );

  const riskLevel =
    readinessScore >= 80 ? "Controlled" : readinessScore >= 60 ? "Watchlist" : "High Risk";

  const formReadOnly = locked || roundStatus !== "open";
  const fyLabel = `FY ${roundNumber}`;
  const selectedSectorMeta = sectorVisuals[form.primary_sector];
  const subcontractShare = Math.max(0, 100 - form.self_perform_percent);

  const makeVsBuySnapshot = useMemo(() => {
    const inHouseCostIndex = clamp(
      0.9 +
        (form.pm_utilization_target - 70) / 220 +
        (form.workforce_load_state === "Overloaded"
          ? 0.08
          : form.workforce_load_state === "Underloaded"
            ? -0.05
            : 0),
      0.75,
      1.3
    );

    const subcontractCostIndex = clamp(
      0.92 +
        (form.subcontractor_profile === "Tier 1 Proven"
          ? 0.16
          : form.subcontractor_profile === "Tier 3 Fast Track"
            ? -0.08
            : 0.04) +
        subcontractShare / 500,
      0.75,
      1.35
    );

    const qualityConfidence =
      form.subcontractor_profile === "Tier 1 Proven"
        ? "High"
        : form.subcontractor_profile === "Tier 2 Value"
          ? "Moderate"
          : "Variable";

    const executionRisk =
      form.workforce_load_state === "Overloaded"
        ? "Elevated"
        : form.workforce_load_state === "Underloaded"
          ? "Capacity under-used"
          : "Balanced";

    return {
      inHouseCostIndex,
      subcontractCostIndex,
      qualityConfidence,
      executionRisk,
    };
  }, [
    form.pm_utilization_target,
    form.workforce_load_state,
    form.subcontractor_profile,
    subcontractShare,
  ]);

  const nextStep = () => {
    const candidate = Math.min(activeStep + 1, 4) as StepIndex;
    if (availableStep(candidate)) {
      setActiveStep(candidate);
    }
  };

  const prevStep = () => {
    const candidate = Math.max(activeStep - 1, 0) as StepIndex;
    setActiveStep(candidate);
  };

  return (
    <RequireAuth>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="h-fit space-y-4 lg:sticky lg:top-24">
          <Card>
            <CardHeader
              title={`${fyLabel} Decision Workspace`}
              subtitle={teamName ? `Team ${teamName}` : "Loading team..."}
            />
            <CardBody className="space-y-3">
              {stepTitles.map((title, index) => {
                const idx = index as StepIndex;
                const current = activeStep === idx;
                const unlocked = availableStep(idx);
                return (
                  <button
                    key={title}
                    type="button"
                    disabled={!unlocked}
                    onClick={() => setActiveStep(idx)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                      current
                        ? "border-teal-400 bg-teal-50 text-teal-900"
                        : "border-slate-200 bg-white text-slate-700"
                    } ${unlocked ? "hover:border-teal-300" : "opacity-50"}`}
                  >
                    <div className="font-semibold">Step {index + 1}</div>
                    <div className="text-xs opacity-80">{title}</div>
                  </button>
                );
              })}

              <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Readiness</span>
                  <b>{readinessScore}%</b>
                </div>
                <div className="mt-2 h-2 rounded-full bg-slate-200">
                  <div
                    className="h-2 rounded-full bg-gradient-to-r from-amber-500 to-teal-600"
                    style={{ width: `${readinessScore}%` }}
                  />
                </div>
                <div className="mt-2 text-xs text-slate-600">Risk band: {riskLevel}</div>
              </div>

              <div
                className={`rounded-lg border px-3 py-2 text-xs ${
                  lockWindowExpired
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : "border-cyan-200 bg-cyan-50 text-cyan-900"
                }`}
              >
                <div className="font-semibold">Round lock clock</div>
                <div className="mt-1">
                  {locked
                    ? "Round already locked"
                    : msLeft === null
                      ? "Initializing..."
                      : lockWindowExpired
                        ? "Window elapsed. You can still submit in extension mode."
                        : `Time left: ${formatClock(msLeft)}`}
                </div>
                <div className="mt-1 text-[11px]">
                  Teams locked: {lockedTeamsCount}/{totalTeamsCount || "-"} | Round status: {roundStatus}
                </div>
                <div className="mt-1 text-[11px]">Clock source: {roundClockSource === "shared" ? "session_rounds" : "local fallback"}</div>
              </div>

              <Link className="inline-flex text-sm underline text-slate-700" href={`/sessions/${sessionId}`}>
                Back to Session
              </Link>
              <Link className="inline-flex text-sm underline text-slate-700" href={`/sessions/${sessionId}/report`}>
                Open FY Report
              </Link>
            </CardBody>
          </Card>

          <Card>
                        <CardHeader title="Budget Pressure" subtitle="Live impact of selected decisions" />
            <CardBody className="space-y-3">
              <BudgetBar label="People & L&D" value={budget.people_l_and_d} max={biggestBudget} />
              <BudgetBar label="Engineering Quality" value={budget.engineering_quality} max={biggestBudget} />
              <BudgetBar label="Ops Resilience" value={budget.operations_resilience} max={biggestBudget} />
              <BudgetBar label="Subcontracting & Partners" value={budget.subcontracting_and_partnering} max={biggestBudget} />
              <BudgetBar label="Assets & Specialized Capability" value={budget.asset_and_specialization} max={biggestBudget} />
              <BudgetBar label="Compliance + CSR" value={budget.compliance_and_sustainability} max={biggestBudget} />
              <BudgetBar label="Stakeholder Visibility" value={budget.stakeholder_visibility} max={biggestBudget} />
              <BudgetBar label="Risk Contingency" value={budget.risk_contingency} max={biggestBudget} />
              <BudgetBar label="Financing Pressure" value={budget.financing_cost_pressure} max={biggestBudget} />
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                Total budget pressure: Rs {Math.round(budget.total_budget_pressure / 1000)}k
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Projected Outcome" subtitle="Deterministic preview before locking" />
            <CardBody className="space-y-3">
              <ProjectionBar label="SPI" value={previewResult.schedule_index} min={0.64} max={1.28} />
              <ProjectionBar label="CPI" value={previewResult.cost_index} min={0.62} max={1.27} />
              <ProjectionBar label="Quality" value={previewResult.quality_score} min={0} max={100} />
              <ProjectionBar label="Safety" value={previewResult.safety_score} min={0} max={100} />
              <ProjectionBar label="Stakeholder" value={previewResult.stakeholder_score} min={0} max={100} />
              <ProjectionBar label="Points" value={previewResult.points_earned} min={0} max={700} />
            </CardBody>
          </Card>
        </aside>

        <div className="space-y-4">
          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {error}
            </div>
          ) : null}

          {loading ? (
            <Card>
              <CardBody>
                <p className="text-sm text-slate-600">Loading round setup...</p>
              </CardBody>
            </Card>
          ) : (
            <>
              {activeStep === 0 ? (
                <Card>
                  <CardHeader title="Step 1 - Context & Strategy" subtitle="Read the round shocks, set posture, and assign strategic focus." />
                  <CardBody className="space-y-5">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="text-sm font-semibold text-slate-900">Team KPI Target (4x points when achieved)</div>
                      {teamKpiTarget ? (
                        <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                          Locked KPI target: <b>{teamKpiTarget}</b>
                        </div>
                      ) : roundNumber === 1 ? (
                        <>
                          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {KPI_TARGET_OPTIONS.map((kpi) => (
                              <StepTile
                                key={kpi.value}
                                active={draftKpiTarget === kpi.value}
                                icon={kpi.short}
                                title={kpi.value}
                                description={`${kpi.description} | ${kpi.thresholdLabel}`}
                                disabled={formReadOnly}
                                onClick={() => setDraftKpiTarget(kpi.value)}
                              />
                            ))}
                          </div>
                          <div className="mt-2">
                            <Button
                              variant="secondary"
                              onClick={saveKpiTargetNow}
                              disabled={formReadOnly || !draftKpiTarget || savingKpiTarget}
                            >
                              {savingKpiTarget ? "Saving KPI..." : "Save Team KPI Target"}
                            </Button>
                          </div>
                        </>
                      ) : (
                        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                          KPI target was not set in Round 1. Ask facilitator to reset this session if you want KPI scoring.
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-slate-900">Round news (Indian construction context)</div>
                        <Link className="text-xs underline text-slate-700" href={`/sessions/${sessionId}/round/${roundNumber}/news`}>
                          Open News Desk
                        </Link>
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                        {resolvedRoundEvents.map((event: ConstructionEvent) => (
                          <div
                            key={event.id}
                            className="rounded-lg border border-slate-200 bg-white p-3 text-sm"
                          >
                            <img src={getNewsImageUrl(event)} alt={event.title} className="h-28 w-full rounded-md object-cover" loading="lazy" />
                            <div className="mt-2 font-semibold text-slate-900">{event.title}</div>
                            <div className="mt-1 text-xs text-slate-600">{event.description}</div>
                            <div className="mt-2 text-xs text-slate-500">
                              Severity: {event.severity} | {event.tags.join(", ")}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="text-sm font-semibold text-slate-900">External context tiles</div>
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {externalContextOptions.map((option) => (
                          <StepTile
                            key={option.value}
                            active={form.external_context === option.value}
                            icon={option.icon}
                            title={option.text}
                            description="Influences round volatility and execution constraints."
                            disabled={formReadOnly}
                            emoji={externalContextVisuals[option.value].emoji}
                            visualClass={externalContextVisuals[option.value].visualClass}
                            onClick={() => update("external_context", option.value)}
                          />
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="text-sm font-semibold text-slate-900">Strategic posture tiles</div>
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {postureOptions.map((option) => (
                          <StepTile
                            key={option.value}
                            active={form.strategic_posture === option.value}
                            icon={option.icon}
                            title={option.text}
                            description="Affects alignment bonus in scoring."
                            disabled={formReadOnly}
                            emoji={postureVisuals[option.value].emoji}
                            visualClass={postureVisuals[option.value].visualClass}
                            onClick={() => update("strategic_posture", option.value)}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      <FocusSlider
                        label="Cost focus"
                        value={form.focus_cost}
                        disabled={formReadOnly}
                        onChange={(v) => update("focus_cost", v)}
                      />
                      <FocusSlider
                        label="Quality focus"
                        value={form.focus_quality}
                        disabled={formReadOnly}
                        onChange={(v) => update("focus_quality", v)}
                      />
                      <FocusSlider
                        label="Stakeholder focus"
                        value={form.focus_stakeholder}
                        disabled={formReadOnly}
                        onChange={(v) => update("focus_stakeholder", v)}
                      />
                      <FocusSlider
                        label="Speed focus"
                        value={form.focus_speed}
                        disabled={formReadOnly}
                        onChange={(v) => update("focus_speed", v)}
                      />
                    </div>

                    <div className={`rounded-lg px-3 py-2 text-sm ${focusSum === 100 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                      Focus total: {focusSum} {focusSum === 100 ? "(valid)" : "(must be 100)"}
                    </div>
                  </CardBody>
                </Card>
              ) : null}

              {activeStep === 1 ? (
                <Card>
                                    <CardHeader title="Step 2 - Market & Governance" subtitle="Choose entry sectors and bidding posture for your EPC portfolio." />
                  <CardBody className="space-y-5">
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-slate-900">Primary sector entry</div>
                        <div className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{fyLabel} specialization</div>
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {sectorOptions.map((option) => (
                          <StepTile
                            key={option.value}
                            active={form.primary_sector === option.value}
                            icon={option.icon}
                            title={option.text}
                            description="Sets base complexity, quality expectations, and sector shocks."
                            imageUrl={sectorVisuals[option.value].image}
                            disabled={formReadOnly}
                            onClick={() => update("primary_sector", option.value)}
                          />
                        ))}
                      </div>

                      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
                        <img
                          src={selectedSectorMeta.image}
                          alt={form.primary_sector}
                          className="h-40 w-full object-cover"
                          loading="lazy"
                        />
                        <div className="grid grid-cols-1 gap-2 p-3 text-sm md:grid-cols-3">
                          <div>
                            <div className="text-xs uppercase tracking-wide text-slate-500">Sector</div>
                            <div className="mt-1 font-semibold text-slate-900">{form.primary_sector}</div>
                            <div className="mt-1 text-xs text-slate-600">{selectedSectorMeta.headline}</div>
                          </div>
                          <div>
                            <div className="text-xs uppercase tracking-wide text-slate-500">Execution challenge</div>
                            <div className="mt-1 text-xs text-slate-700">{selectedSectorMeta.challenge}</div>
                          </div>
                          <div>
                            <div className="text-xs uppercase tracking-wide text-slate-500">Quality expectation</div>
                            <div className="mt-1 text-xs text-slate-700">{selectedSectorMeta.quality_expectation}</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <label className="text-sm">
                      Secondary sector entry
                      <select
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                        value={form.secondary_sector}
                        disabled={formReadOnly}
                        onChange={(e) => update("secondary_sector", e.target.value as SecondarySector)}
                      >
                        {secondarySectorOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {expansionOptions.map((option) => (
                        <StepTile
                          key={option.value}
                          active={form.market_expansion === option.value}
                          icon={option.icon}
                          title={option.text}
                          description="Controls growth speed vs complexity."
                          disabled={formReadOnly}
                          onClick={() => update("market_expansion", option.value)}
                        />
                      ))}
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <SliderField
                        label="Bid aggressiveness"
                        value={form.bid_aggressiveness}
                        min={1}
                        max={5}
                        disabled={formReadOnly}
                        onChange={(v) => update("bid_aggressiveness", v)}
                      />
                      <SliderField
                        label="Public project mix"
                        value={form.project_mix_public_pct}
                        min={0}
                        max={100}
                        suffix="%"
                        disabled={formReadOnly}
                        onChange={(v) => update("project_mix_public_pct", v)}
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <label className="text-sm">
                        Risk appetite
                        <select
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                          value={form.risk_appetite}
                          disabled={formReadOnly}
                          onChange={(e) => update("risk_appetite", e.target.value as RiskAppetite)}
                        >
                          {riskOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="text-sm">
                        Governance intensity
                        <select
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                          value={form.governance_intensity}
                          disabled={formReadOnly}
                          onChange={(e) => update("governance_intensity", e.target.value as Governance)}
                        >
                          {governanceOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="text-sm">
                        Message tone
                        <select
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                          value={form.public_message_tone}
                          disabled={formReadOnly}
                          onChange={(e) => update("public_message_tone", e.target.value as MessageTone)}
                        >
                          {messageToneOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </CardBody>
                </Card>
              ) : null}

              {activeStep === 2 ? (
                <Card>
                                    <CardHeader title="Step 3 - Delivery Mix, People & Assets" subtitle="Choose self-perform vs subcontracting, workforce loading, and specialized capability." />
                  <CardBody className="space-y-5">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <SliderField
                        label="Self-perform share"
                        value={form.self_perform_percent}
                        min={0}
                        max={100}
                        suffix="%"
                        disabled={formReadOnly}
                        onChange={(v) => update("self_perform_percent", v)}
                      />
                      <SliderField
                        label="P&M utilization target"
                        value={form.pm_utilization_target}
                        min={40}
                        max={95}
                        suffix="%"
                        disabled={formReadOnly}
                        onChange={(v) => update("pm_utilization_target", v)}
                      />
                      <SliderField
                        label="Specialized work capability"
                        value={form.specialized_work_index}
                        min={0}
                        max={100}
                        disabled={formReadOnly}
                        onChange={(v) => update("specialized_work_index", v)}
                      />
                      <SliderField
                        label="Work-life balance index"
                        value={form.work_life_balance_index}
                        min={0}
                        max={100}
                        disabled={formReadOnly}
                        onChange={(v) => update("work_life_balance_index", v)}
                      />
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-slate-900">Make vs Buy Simulator</div>
                        <div className="text-xs text-slate-600">Self {form.self_perform_percent}% | Subcontract {subcontractShare}%</div>
                      </div>

                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700">
                          <div className="font-semibold text-slate-900">In-house delivery</div>
                          <div className="mt-1">Estimated cost index: {makeVsBuySnapshot.inHouseCostIndex.toFixed(2)}</div>
                          <div className="mt-1">Execution risk: {makeVsBuySnapshot.executionRisk}</div>
                          <div className="mt-2 h-2 rounded-full bg-slate-200">
                            <div className="h-2 rounded-full bg-gradient-to-r from-cyan-500 to-teal-600" style={{ width: `${Math.round(form.self_perform_percent)}%` }} />
                          </div>
                        </div>

                        <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700">
                          <div className="font-semibold text-slate-900">Subcontract delivery</div>
                          <div className="mt-1">Estimated cost index: {makeVsBuySnapshot.subcontractCostIndex.toFixed(2)}</div>
                          <div className="mt-1">Quality confidence: {makeVsBuySnapshot.qualityConfidence}</div>
                          <div className="mt-2 h-2 rounded-full bg-slate-200">
                            <div className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-600" style={{ width: `${Math.round(subcontractShare)}%` }} />
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        Higher Tier-1 subcontracting improves quality confidence but increases cost pressure. Tier-3 can improve short-term speed but raises governance and quality risk.
                      </div>
                    </div>

                    <div>
                      <div className="text-sm font-semibold text-slate-900">Subcontractor profile</div>
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                        {subcontractorOptions.map((option) => (
                          <StepTile
                            key={option.value}
                            active={form.subcontractor_profile === option.value}
                            icon={option.icon}
                            title={option.text}
                            description={option.hint}
                            disabled={formReadOnly}
                            onClick={() => update("subcontractor_profile", option.value)}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {workforceOptions.map((option) => (
                        <StepTile
                          key={option.value}
                          active={form.workforce_plan === option.value}
                          icon={option.icon}
                          title={option.text}
                          description="Core staffing capacity for execution."
                          disabled={formReadOnly}
                          onClick={() => update("workforce_plan", option.value)}
                        />
                      ))}
                    </div>

                    <label className="text-sm">
                      Workforce load state
                      <select
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                        value={form.workforce_load_state}
                        disabled={formReadOnly}
                        onChange={(e) => update("workforce_load_state", e.target.value as WorkforceLoadState)}
                      >
                        {workloadOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {overtimeOptions.map((option) => (
                        <StepTile
                          key={option.value}
                          active={form.overtime_policy === option.value}
                          icon={option.icon}
                          title={option.text}
                          description="High intensity may hurt safety and quality."
                          disabled={formReadOnly}
                          onClick={() => update("overtime_policy", option.value)}
                        />
                      ))}
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <SliderField
                        label="Training intensity"
                        value={form.training_intensity}
                        min={0}
                        max={100}
                        disabled={formReadOnly}
                        onChange={(v) => update("training_intensity", v)}
                      />
                      <SliderField
                        label="Innovation budget index"
                        value={form.innovation_budget_index}
                        min={0}
                        max={100}
                        disabled={formReadOnly}
                        onChange={(v) => update("innovation_budget_index", v)}
                      />
                    </div>

                    <label className="text-sm">
                      QA audit frequency
                      <select
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                        value={form.qa_audit_frequency}
                        disabled={formReadOnly}
                        onChange={(e) => update("qa_audit_frequency", e.target.value as QaFrequency)}
                      >
                        {qaOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                  </CardBody>
                </Card>
              ) : null}

              {activeStep === 3 ? (
                <Card>
                                    <CardHeader title="Step 4 - Ops, Compliance & Stakeholder" subtitle="Balance procurement resilience, governance exposure, CSR, and public trust." />
                  <CardBody className="space-y-5">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {logisticsOptions.map((option) => (
                        <StepTile
                          key={option.value}
                          active={form.logistics_resilience === option.value}
                          icon={option.icon}
                          title={option.text}
                          description="Changes monsoon and logistics shock resilience."
                          disabled={formReadOnly}
                          onClick={() => update("logistics_resilience", option.value)}
                        />
                      ))}
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <SliderField
                        label="Buffer"
                        value={form.buffer_percent}
                        min={0}
                        max={15}
                        suffix="%"
                        disabled={formReadOnly}
                        onChange={(v) => update("buffer_percent", v)}
                      />
                      <SliderField
                        label="Inventory cover"
                        value={form.inventory_cover_weeks}
                        min={1}
                        max={12}
                        suffix="w"
                        disabled={formReadOnly}
                        onChange={(v) => update("inventory_cover_weeks", v)}
                      />
                      <SliderField
                        label="Community engagement"
                        value={form.community_engagement}
                        min={0}
                        max={100}
                        disabled={formReadOnly}
                        onChange={(v) => update("community_engagement", v)}
                      />
                      <SliderField
                        label="Digital visibility spend"
                        value={form.digital_visibility_spend}
                        min={0}
                        max={100}
                        disabled={formReadOnly}
                        onChange={(v) => update("digital_visibility_spend", v)}
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <SliderField
                        label="CSR & sustainability"
                        value={form.csr_sustainability_index}
                        min={0}
                        max={100}
                        disabled={formReadOnly}
                        onChange={(v) => update("csr_sustainability_index", v)}
                      />
                      <SliderField
                        label="Facilitation risk budget"
                        value={form.facilitation_budget_index}
                        min={0}
                        max={100}
                        disabled={formReadOnly}
                        onChange={(v) => update("facilitation_budget_index", v)}
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <label className="text-sm">
                        Compliance posture
                        <select
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                          value={form.compliance_posture}
                          disabled={formReadOnly}
                          onChange={(e) => update("compliance_posture", e.target.value as CompliancePosture)}
                        >
                          {complianceOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="text-sm">
                        Vendor strategy
                        <select
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                          value={form.vendor_strategy}
                          disabled={formReadOnly}
                          onChange={(e) => update("vendor_strategy", e.target.value as VendorStrategy)}
                        >
                          {vendorOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>

                      <div>
                        <div className="text-sm font-semibold text-slate-700">Transparency mode</div>
                        <div className="mt-2 grid grid-cols-1 gap-2">
                          {transparencyOptions.map((option) => (
                            <StepTile
                              key={option.value}
                              active={form.transparency_level === option.value}
                              icon={option.icon}
                              title={option.text}
                              description="Impacts stakeholder trust and claim defensibility."
                              disabled={formReadOnly}
                              onClick={() => update("transparency_level", option.value)}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              ) : null}

              {activeStep === 4 ? (
                <Card>
                  <CardHeader title="Step 5 - Finance & Lock" subtitle="Set liquidity safeguards, review checks, then submit." />
                  <CardBody className="space-y-5">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {financingOptions.map((option) => (
                        <StepTile
                          key={option.value}
                          active={form.financing_posture === option.value}
                          icon={option.icon}
                          title={option.text}
                          description="Cash vs growth debt tradeoff."
                          disabled={formReadOnly}
                          onClick={() => update("financing_posture", option.value)}
                        />
                      ))}
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <SliderField
                        label="Cash buffer months"
                        value={form.cash_buffer_months}
                        min={1}
                        max={12}
                        disabled={formReadOnly}
                        onChange={(v) => update("cash_buffer_months", v)}
                      />

                      <SliderField
                        label="Contingency fund"
                        value={form.contingency_fund_percent}
                        min={0}
                        max={20}
                        suffix="%"
                        disabled={formReadOnly}
                        onChange={(v) => update("contingency_fund_percent", v)}
                      />
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="text-sm font-semibold text-slate-900">Readiness checks</div>
                      <div className="mt-2 space-y-1">
                        {readinessChecks.map((check) => (
                          <div key={check.label} className="text-sm">
                            <span className={check.pass ? "text-emerald-700" : "text-amber-700"}>
                              {check.pass ? "OK" : "!"}
                            </span>{" "}
                            <span className="text-slate-700">{check.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                      Round readiness: <b>{readinessScore}%</b> | Session rounds: {sessionRoundCount || "-"}
                    </div>
                  </CardBody>
                </Card>
              ) : null}

              <Card>
                <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={prevStep} disabled={activeStep === 0 || formReadOnly}>
                      Previous
                    </Button>
                    <Button onClick={nextStep} disabled={activeStep === 4 || !stepValidations[activeStep] || formReadOnly}>
                      Next
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={saveDraft} disabled={saving || locking || savingKpiTarget || formReadOnly}>
                      {saving ? "Saving..." : "Save Draft"}
                    </Button>
                    <Button onClick={lockAndGenerateResults} disabled={locking || saving || savingKpiTarget || formReadOnly || !stepValidations[4]}>
                      {locking ? "Locking..." : roundStatus === "closed" ? "Round Closed" : lockWindowExpired ? "Lock and Generate Results (Extension)" : "Lock and Generate Results"}
                    </Button>
                    {locked ? (
                      <Link
                        href={`/sessions/${sessionId}/round/${roundNumber}/results`}
                        className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                      >
                        View Results
                      </Link>
                    ) : null}
                  </div>
                </CardBody>
              </Card>
            </>
          )}
        </div>
      </div>
    </RequireAuth>
  );
}








































































