
"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { formatStatus } from "@/lib/formatters";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { scoreRoundSecureClient } from "@/lib/secureRoundScoring";
import { setTeamKpiTargetSecureClient } from "@/lib/secureTeamKpi";
import {
  computeRoundResultV2,
  DecisionDraft,
  RiskAppetite,
  Governance,
  VendorStrategy,
} from "@/lib/simEngine";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DecisionSlider } from "@/components/DecisionSlider";
import { SegmentedControl } from "@/components/SegmentedControl";
import { Tooltip } from "@/components/ui/Tooltip";
import LockConfirmationModal, { type LockConfirmationSection } from "@/components/LockConfirmationModal";
import RoundBriefingCard from "@/components/RoundBriefingCard";
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
import { KPI_TARGET_OPTIONS, KpiTarget, parseKpiTarget } from "@/lib/kpi";
import { getNewsImageUrl } from "@/lib/newsVisuals";
import { parseConstructionEvents } from "@/lib/newsPayload";
import { getRoundEvents, GameEvent } from "@/lib/eventDeck";

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

const expansionOptions: Array<{ value: ExpansionMode; icon: string; text: string; hint: string }> = [
  {
    value: "Consolidate Existing Regions",
    icon: "CO",
    text: "Consolidate existing regions",
    hint: "Focus on current projects. Lower complexity, protect margins, reduce delivery risk. Best when behind on schedule.",
  },
  {
    value: "Pilot One New Region",
    icon: "P1",
    text: "Pilot one new region",
    hint: "Moderate expansion. Adds one new geography. Balanced risk and a practical test of a new market without overextending.",
  },
  {
    value: "Scale Two New Regions",
    icon: "S2",
    text: "Scale two new regions",
    hint: "Aggressive growth. High revenue upside but stretches workforce and increases delivery risk significantly.",
  },
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

const transparencyOptions: Array<{ value: TransparencyLevel; icon: string; text: string; hint: string }> = [
  {
    value: "Standard",
    icon: "ST",
    text: "Standard",
    hint: "Routine reporting only. Low overhead but more reactive when issues appear. Suits stable projects.",
  },
  {
    value: "Proactive",
    icon: "PR",
    text: "Proactive",
    hint: "Regular client updates before issues escalate. Builds trust and reduces claim disputes.",
  },
  {
    value: "Public Dashboard",
    icon: "DB",
    text: "Public dashboard",
    hint: "Full visibility to client and stakeholders. Maximum trust, but internal issues are exposed publicly.",
  },
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
const LATE_PENALTY_PER_MINUTE = 2;
const LATE_PENALTY_CAP = 80;

type StepIndex = 0 | 1 | 2 | 3 | 4;
type RoundClockSource = "shared" | "fallback";

type LatePenaltyResult = {
  minutesLate: number;
  pointsPenalty: number;
  stakeholderPenalty: number;
  extensionMode: boolean;
};

type TooltipCopy = {
  title: string;
  lines: string[];
};

const decisionFieldTooltips = {
  costFocus: {
    title: "Cost focus",
    lines: [
      "How much you prioritise budget control.",
      "Higher means tighter cost discipline.",
      "That can compromise quality or speed.",
    ],
  },
  qualityFocus: {
    title: "Quality focus",
    lines: [
      "Investment in defect-free delivery.",
      "Higher means fewer snags and better client satisfaction.",
      "It also costs more.",
    ],
  },
  stakeholderFocus: {
    title: "Stakeholder focus",
    lines: [
      "Effort on client communication and community relations.",
      "Higher improves your stakeholder score.",
      "It also diverts bandwidth from the core team.",
    ],
  },
  speedFocus: {
    title: "Speed focus",
    lines: [
      "How strongly you prioritise schedule over other factors.",
      "Higher can improve SPI and visible pace.",
      "It raises the risk of cost overrun and quality issues.",
    ],
  },
  bidAggressiveness: {
    title: "Bid aggressiveness",
    lines: [
      "1 means conservative bids with healthier margins.",
      "5 means razor-thin margins to win more volume.",
      "At 5, cash pressure risk is much higher.",
    ],
  },
  publicProjectMix: {
    title: "Public project mix",
    lines: [
      "This is the share of your portfolio that sits in government contracts.",
      "Higher usually means more stable work.",
      "It also brings slower payment cycles and more compliance load.",
    ],
  },
  riskAppetite: {
    title: "Risk appetite",
    lines: [
      "Conservative choices reduce penalties and downside.",
      "Aggressive choices create more upside.",
      "They also leave you more exposed to shock events.",
    ],
  },
  governanceIntensity: {
    title: "Governance intensity",
    lines: [
      "This is your compliance and control investment level.",
      "Higher reduces regulatory risk.",
      "It also adds overhead cost.",
    ],
  },
  pmUtilizationTarget: {
    title: "P&M utilisation target",
    lines: [
      "How hard you are running your plant and machinery.",
      "Pushing above 85% creates a breakdown and maintenance risk zone.",
      "That can trigger cost spikes quickly.",
    ],
  },
  specializedCapability: {
    title: "Specialised work capability",
    lines: [
      "Your in-house specialist skill level.",
      "Higher reduces dependency on subcontractors.",
      "It requires more training and capability investment.",
    ],
  },
  workLifeBalance: {
    title: "Work-life balance index",
    lines: [
      "A welfare score for how sustainable the team setup feels.",
      "Low levels raise burnout, attrition, and safety incident risk.",
      "Higher levels support productivity and retention.",
    ],
  },
  buffer: {
    title: "Buffer",
    lines: [
      "Schedule contingency buffer for the plan.",
      "Higher helps protect SPI when conditions worsen.",
      "It can also signal lower confidence to the client.",
    ],
  },
  communityEngagement: {
    title: "Community engagement",
    lines: [
      "Investment in local stakeholder relations.",
      "It affects stakeholder score directly.",
      "It also changes the risk of protests or local delays.",
    ],
  },
  csrSustainability: {
    title: "CSR & sustainability",
    lines: [
      "Your ESG and sustainability spend level.",
      "It influences stakeholder score.",
      "It also matters more in client evaluation criteria over time.",
    ],
  },
  facilitationRiskBudget: {
    title: "Facilitation risk budget",
    lines: [
      "Reserve kept aside for unforeseen risk management.",
      "If you set it to 0, you stay fully exposed to shock-event penalties.",
    ],
  },
} satisfies Record<string, TooltipCopy>;

function createInitialStepDurations(): Record<StepIndex, number> {
  return { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
}

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

type SessionRoundRow = { deadline_at: string; status: string | null; news_payload: unknown };

type ScenarioPromotionRow = {
  id: string;
  source_scenario_name: string | null;
  promotion_payload: Record<string, unknown> | null;
  applied_at: string | null;
};

type ForecastState = {
  predicted_schedule_index: number;
  predicted_cost_index: number;
  confidence: number;
};

const DEFAULT_FORECAST: ForecastState = {
  predicted_schedule_index: 1,
  predicted_cost_index: 1,
  confidence: 50,
};

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
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function parsePromotionNumber(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value === "number" && Number.isFinite(value)) return clamp(value, min, max);
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return clamp(parsed, min, max);
  }
  return clamp(fallback, min, max);
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function toText(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function toEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  if (typeof value !== "string") return fallback;
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
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

function FieldLabel({ label, tooltip }: { label: string; tooltip?: TooltipCopy }) {
  return (
    <span
      className="inline-flex items-center gap-2"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <span>{label}</span>
      {tooltip ? <Tooltip title={tooltip.title} lines={tooltip.lines} /> : null}
    </span>
  );
}

function SidebarAccordion({
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/5 bg-slate-900/60">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
      >
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{title}</div>
          <div className="mt-1 text-xs font-medium text-slate-300">{summary}</div>
        </div>
        <svg
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="m5 7 5 5 5-5" />
        </svg>
      </button>
      {open ? <div className="border-t border-white/5 px-4 py-4">{children}</div> : null}
    </div>
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

function computeLatePenalty(
  deadlineIso: string | null,
  submittedIso: string,
  clockSource: RoundClockSource
): LatePenaltyResult {
  if (!deadlineIso || clockSource !== "shared") {
    return {
      minutesLate: 0,
      pointsPenalty: 0,
      stakeholderPenalty: 0,
      extensionMode: false,
    };
  }

  const deadlineMs = Date.parse(deadlineIso);
  const submittedMs = Date.parse(submittedIso);
  const deltaMs = submittedMs - deadlineMs;

  if (!Number.isFinite(deadlineMs) || !Number.isFinite(submittedMs) || deltaMs <= 0) {
    return {
      minutesLate: 0,
      pointsPenalty: 0,
      stakeholderPenalty: 0,
      extensionMode: false,
    };
  }

  const minutesLate = Math.max(1, Math.ceil(deltaMs / 60000));
  const pointsPenalty = Math.min(LATE_PENALTY_CAP, minutesLate * LATE_PENALTY_PER_MINUTE);
  const stakeholderPenalty = Math.min(12, Math.ceil(minutesLate / 4));

  return {
    minutesLate,
    pointsPenalty,
    stakeholderPenalty,
    extensionMode: true,
  };
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

function describeScaleLevel(value: number, max = 100) {
  const normalized = max <= 0 ? 0 : (value / max) * 100;
  if (normalized >= 80) return "High";
  if (normalized >= 60) return "Strong";
  if (normalized >= 40) return "Balanced";
  if (normalized >= 20) return "Low";
  return "Very low";
}

function describeBidAggressiveness(value: number) {
  if (value >= 5) return "Very aggressive";
  if (value >= 4) return "Aggressive";
  if (value >= 3) return "Balanced";
  if (value >= 2) return "Measured";
  return "Conservative";
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
  const [promotionNotice, setPromotionNotice] = useState("");
  const [promotionWarning, setPromotionWarning] = useState("");
  const [saving, setSaving] = useState(false);
  const [locking, setLocking] = useState(false);
  const [showLockConfirmation, setShowLockConfirmation] = useState(false);
  const [showBudgetPressure, setShowBudgetPressure] = useState(false);
  const [showProjectedOutcome, setShowProjectedOutcome] = useState(false);

  const [clockNow, setClockNow] = useState(Date.now());
  const [roundDeadlineIso, setRoundDeadlineIso] = useState<string | null>(null);
  const [roundClockSource, setRoundClockSource] = useState<RoundClockSource>("fallback");
  const [roundStatus, setRoundStatus] = useState<"pending" | "open" | "closed">("pending");
  const [lockedTeamsCount, setLockedTeamsCount] = useState(0);
  const [totalTeamsCount, setTotalTeamsCount] = useState(0);

  const [activeStep, setActiveStep] = useState<StepIndex>(0);
  const [form, setForm] = useState<ExtendedDecisionForm>(defaultForm);
  const [teamKpiTarget, setTeamKpiTarget] = useState<KpiTarget | null>(null);
  const [draftKpiTarget, setDraftKpiTarget] = useState<KpiTarget | null>(null);
  const [savingKpiTarget, setSavingKpiTarget] = useState(false);
  const deckEvents = useMemo<GameEvent[]>(() => {
    if (!sessionId || !teamId) return [];
    return getRoundEvents(sessionId, teamId, roundNumber);
  }, [roundNumber, sessionId, teamId]);
  const [eventsChosen, setEventsChosen] = useState<Record<string, string>>({});
  const [forecast, setForecast] = useState<ForecastState>(DEFAULT_FORECAST);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [stepDurationsMs, setStepDurationsMs] = useState<Record<StepIndex, number>>(createInitialStepDurations);

  const stepStartRef = useRef<number>(Date.now());
  const activeStepRef = useRef<StepIndex>(0);

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
    setHasUnsavedChanges(true);
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateEventChoice(eventId: string, choiceId: string) {
    setHasUnsavedChanges(true);
    setEventsChosen((prev) => ({ ...prev, [eventId]: choiceId }));
  }

  function buildStepTimingSnapshot(nowMs = Date.now()) {
    const snapshot = { ...stepDurationsMs } as Record<StepIndex, number>;
    const currentStep = activeStepRef.current;
    snapshot[currentStep] = snapshot[currentStep] + Math.max(0, nowMs - stepStartRef.current);
    return snapshot;
  }

  async function trackTelemetry(eventName: string, eventPayload: Record<string, unknown>) {
    if (!userId || !teamId) return;

    const { error: telemetryErr } = await supabase.from("telemetry_events").insert({
      user_id: userId,
      session_id: sessionId,
      team_id: teamId,
      round_number: roundNumber,
      event_name: eventName,
      event_payload: eventPayload,
      client_ts: new Date().toISOString(),
    });

    if (telemetryErr && !isMissingTableError(telemetryErr.message)) {
      console.warn("telemetry insert failed", telemetryErr.message);
    }
  }

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges || locked || roundStatus !== "open") return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedChanges, locked, roundStatus]);

  useEffect(() => {
    const now = Date.now();
    const previousStep = activeStepRef.current;
    const elapsedMs = Math.max(0, now - stepStartRef.current);

    if (elapsedMs > 0) {
      setStepDurationsMs((prev) => ({
        ...prev,
        [previousStep]: prev[previousStep] + elapsedMs,
      }));
    }

    activeStepRef.current = activeStep;
    stepStartRef.current = now;
  }, [activeStep]);


  async function ensureTeamKpiTarget(requireForRoundOne: boolean): Promise<KpiTarget | null> {
    if (teamKpiTarget) return teamKpiTarget;

    const selected = draftKpiTarget;
    if (!selected) {
      if (requireForRoundOne && roundNumber === 1) {
        throw new Error("Select a Team KPI target in Step 1 before locking Round 1.");
      }
      return null;
    }

    setSavingKpiTarget(true);
    try {
      const saved = await setTeamKpiTargetSecureClient({
        supabase,
        sessionId,
        kpiTarget: selected,
      });

      const parsed = parseKpiTarget(saved.kpiTarget);
      if (!parsed) {
        throw new Error("Server returned invalid KPI target.");
      }

      setTeamKpiTarget(parsed);
      setDraftKpiTarget(parsed);
      return parsed;
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

  const submissionPressure = useMemo(() => {
    const nowIso = new Date(clockNow).toISOString();
    const lateNow = computeLatePenalty(roundDeadlineIso, nowIso, roundClockSource);
    const projectedPointsAfterPenalty = Math.max(0, previewResult.points_earned - lateNow.pointsPenalty);

    const toneClass =
      lateNow.pointsPenalty > 0
        ? "border-rose-200 bg-rose-50 text-rose-800"
        : msLeft !== null && msLeft < 8 * 60_000
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-emerald-200 bg-emerald-50 text-emerald-800";

    const message =
      roundClockSource === "shared" && lockWindowExpired
        ? "Deadline reached. Team lock is disabled. Facilitator will auto-lock pending teams."
        : lateNow.pointsPenalty > 0
          ? "Currently " + lateNow.minutesLate + " min late, estimated -" + lateNow.pointsPenalty + " points if locked now."
          : msLeft === null
            ? "Clock syncing..."
            : "Within lock window. No timeliness penalty if locked now.";

    return {
      lateNow,
      projectedPointsAfterPenalty,
      toneClass,
      message,
    };
  }, [clockNow, lockWindowExpired, msLeft, previewResult.points_earned, roundClockSource, roundDeadlineIso]);

  const timeRemainingLabel = msLeft === null ? "--:--" : formatClock(msLeft);
  const activeStepLabel = stepTitles[activeStep];

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
          setRoundStatus("open");
        }
      } catch {
        const fallback = Date.now() + ROUND_LOCK_WINDOW_MINUTES * 60_000;
        if (!cancelled) {
          setRoundDeadlineIso(new Date(fallback).toISOString());
          setRoundClockSource("fallback");
          setRoundStatus("open");
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
          setRoundStatus("pending");
          setRoundDeadlineIso(null);
          setResolvedRoundEvents(roundEvents);
          setError((prev) => (prev === "Round is closed by facilitator." ? "" : prev));
        }
        return;
      }

      if (!cancelled) {
        const sharedRoundStatus =
          row.status === "closed" ? "closed" : row.status === "open" || Boolean(row.deadline_at) ? "open" : "pending";
        setRoundDeadlineIso(row.deadline_at);
        setRoundClockSource("shared");
        setRoundStatus(sharedRoundStatus);
        if (sharedRoundStatus === "closed") setError((prev) => prev || "Round is closed by facilitator.");
        if (sharedRoundStatus !== "closed") setError((prev) => (prev === "Round is closed by facilitator." ? "" : prev));
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
      setHasUnsavedChanges(false);
      setStepDurationsMs(createInitialStepDurations());
      activeStepRef.current = 0;
      stepStartRef.current = Date.now();
      setActiveStep(0);

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

        const warRoomV2 = existing.raw?.war_room_v2 as any;
        if (warRoomV2 && Array.isArray(warRoomV2.eventsChosen)) {
          const initChosen: Record<string, string> = {};
          warRoomV2.eventsChosen.forEach((ec: any) => {
            if (ec.eventId && ec.choiceId) initChosen[ec.eventId] = ec.choiceId;
          });
          setEventsChosen(initChosen);
        }
        if (warRoomV2?.forecast) {
          setForecast(warRoomV2.forecast);
        }

        const savedStepRaw = (existing.raw as { active_step?: unknown } | null)?.active_step;
        const savedStep =
          typeof savedStepRaw === "number" && savedStepRaw >= 0 && savedStepRaw <= 4
            ? (savedStepRaw as StepIndex)
            : 0;

        setActiveStep(savedStep);
        activeStepRef.current = savedStep;
        stepStartRef.current = Date.now();
        setLocked(Boolean(existing.locked));
        setPromotionNotice("");
        setPromotionWarning("");
      } else {
        setLocked(false);
        setForm(defaultForm);
        setPromotionNotice("");
        setPromotionWarning("");

        const { data: promotionData, error: promotionErr } = await supabase
          .from("scenario_promotions")
          .select("id,source_scenario_name,promotion_payload,applied_at")
          .eq("session_id", sessionId)
          .eq("team_id", myTeam.id)
          .eq("user_id", user.id)
          .eq("target_round", roundNumber)
          .maybeSingle();

        if (promotionErr) {
          if (!isMissingTableError(promotionErr.message)) {
            setPromotionWarning(`Could not load promoted defaults: ${promotionErr.message}`);
          }
        } else {
          const promotion = promotionData as ScenarioPromotionRow | null;
          if (promotion) {
            const payload = toRecord(promotion.promotion_payload) ?? {};
            const parsedPromotionProfile = parseDecisionProfile(payload);

            const promotedRisk = toEnum(payload.risk_appetite, riskOptions, defaultForm.risk_appetite);
            const promotedGovernance = toEnum(
              payload.governance_intensity,
              governanceOptions,
              defaultForm.governance_intensity
            );
            const promotedVendor = toEnum(payload.vendor_strategy, vendorOptions, defaultForm.vendor_strategy);

            setForm({
              ...defaultForm,
              ...parsedPromotionProfile,
              focus_cost: parsePromotionNumber(payload.focus_cost, defaultForm.focus_cost, 0, 100),
              focus_quality: parsePromotionNumber(payload.focus_quality, defaultForm.focus_quality, 0, 100),
              focus_stakeholder: parsePromotionNumber(payload.focus_stakeholder, defaultForm.focus_stakeholder, 0, 100),
              focus_speed: parsePromotionNumber(payload.focus_speed, defaultForm.focus_speed, 0, 100),
              risk_appetite: promotedRisk,
              governance_intensity: promotedGovernance,
              buffer_percent: parsePromotionNumber(payload.buffer_percent, defaultForm.buffer_percent, 0, 20),
              vendor_strategy: promotedVendor,
            });

            const label = toText(promotion.source_scenario_name, "scenario preset");
            setPromotionNotice(`Loaded promoted defaults from \"${label}\" for FY ${roundNumber}.`);

            const stamp = new Date().toISOString();
            await supabase
              .from("scenario_promotions")
              .update({ applied_at: stamp, updated_at: stamp })
              .eq("id", promotion.id)
              .eq("user_id", user.id)
              .eq("session_id", sessionId)
              .eq("team_id", myTeam.id);
          }
        }
      }

      setHasUnsavedChanges(false);
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
            war_room_v2: {
              eventsShown: deckEvents.map(e => e.id),
              eventsChosen: Object.entries(eventsChosen).map(([eventId, choiceId]) => ({ eventId, choiceId })),
              forecast: forecast
            },
          },
          locked: false,
          submitted_at: null,
        },
        { onConflict: "session_id,team_id,round_number" }
      );

      if (upErr) throw upErr;

      const timingSnapshot = buildStepTimingSnapshot();
      setStepDurationsMs(timingSnapshot);
      setHasUnsavedChanges(false);

      void trackTelemetry("decision_draft_saved", {
        active_step: activeStep,
        readiness_score: readinessScore,
        focus_sum: focusSum,
        ms_left: msLeft,
        round_clock_source: roundClockSource,
        lock_window_expired: lockWindowExpired,
        step_durations_ms: timingSnapshot,
      });
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
      if (roundClockSource === "shared" && lockWindowExpired) {
        throw new Error("Round deadline has passed. Wait for facilitator to close and auto-lock.");
      }
      if (focusSum !== 100) throw new Error(`Focus must total 100 (current: ${focusSum}).`);

      await ensureTeamKpiTarget(true);

      const core = buildCoreDecision(form);
      const currentProfile = extractProfile(form);
      const submittedAt = new Date().toISOString();
      const latePenaltyPreview = computeLatePenalty(roundDeadlineIso, submittedAt, roundClockSource);

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
            war_room_v2: {
              eventsShown: deckEvents.map(e => e.id),
              eventsChosen: Object.entries(eventsChosen).map(([eventId, choiceId]) => ({ eventId, choiceId })),
              forecast: forecast
            },
          },
          locked: true,
          submitted_at: submittedAt,
        },
        { onConflict: "session_id,team_id,round_number" }
      );

      if (lockErr) throw lockErr;
      await scoreRoundSecureClient({
        supabase,
        sessionId,
        roundNumber,
      });


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
      const finalTimingSnapshot = buildStepTimingSnapshot();
      setStepDurationsMs(finalTimingSnapshot);
      setHasUnsavedChanges(false);

      void trackTelemetry("decision_locked", {
        active_step: activeStep,
        readiness_score: readinessScore,
        focus_sum: focusSum,
        ms_left: msLeft,
        round_clock_source: roundClockSource,
        lock_window_expired: lockWindowExpired,
        late_minutes: latePenaltyPreview.minutesLate,
        late_points_penalty: latePenaltyPreview.pointsPenalty,
        step_durations_ms: finalTimingSnapshot,
      });

      setLocked(true);
      setShowLockConfirmation(false);
      router.push(`/sessions/${sessionId}/round/${roundNumber}/results`);
    } catch (unknownError: unknown) {
      setShowLockConfirmation(false);
      setError(toErrorMessage(unknownError, "Failed to lock and generate results"));
    } finally {
      setLocking(false);
    }
  }

  const openLockConfirmation = () => {
    setError("");
    setShowLockConfirmation(true);
  };

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
  const riskLevelTone =
    riskLevel === "Controlled"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : riskLevel === "Watchlist"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-rose-200 bg-rose-50 text-rose-800";
  const budgetPressureItems = [
    { label: "People & L&D", value: budget.people_l_and_d },
    { label: "Engineering quality", value: budget.engineering_quality },
    { label: "Operations resilience", value: budget.operations_resilience },
    { label: "Stakeholder visibility", value: budget.stakeholder_visibility },
    { label: "Risk contingency", value: budget.risk_contingency },
    { label: "Financing pressure", value: budget.financing_cost_pressure },
    { label: "Subcontractor mix", value: budget.subcontracting_and_partnering },
    { label: "Assets & specialization", value: budget.asset_and_specialization },
    { label: "Compliance & sustainability", value: budget.compliance_and_sustainability },
  ];
  const projectedOutcomeItems = [
    { label: "Est. points", value: `+${Math.round(previewResult.points_earned)}` },
    { label: "Projected after penalty", value: `+${Math.round(submissionPressure.projectedPointsAfterPenalty)}` },
    { label: "SPI", value: previewResult.schedule_index.toFixed(2) },
    { label: "CPI", value: previewResult.cost_index.toFixed(2) },
    { label: "Quality", value: `${Math.round(previewResult.quality_score)}` },
    { label: "Safety", value: `${Math.round(previewResult.safety_score)}` },
  ];

  const lockBlockedByDeadline = roundClockSource === "shared" && lockWindowExpired;
  const subcontractShare = Math.max(0, 100 - form.self_perform_percent);
  const latePenaltyPreview = useMemo(
    () => computeLatePenalty(roundDeadlineIso, new Date(clockNow).toISOString(), roundClockSource),
    [clockNow, roundClockSource, roundDeadlineIso]
  );

  const lockSummarySections = useMemo<LockConfirmationSection[]>(
    () => [
      {
        title: "Step 1 - Context & Strategy",
        items: [
          {
            label: "Focus Allocation",
            value: `Cost ${form.focus_cost}%, Quality ${form.focus_quality}%, Stakeholder ${form.focus_stakeholder}%, Speed ${form.focus_speed}%`,
          },
          {
            label: "External Context",
            value: `${form.external_context} with a ${form.public_message_tone.toLowerCase()} message tone`,
          },
          {
            label: "Strategic Posture",
            value: `${form.strategic_posture} with ${form.market_expansion.toLowerCase()}`,
          },
        ],
      },
      {
        title: "Step 2 - Market & Governance",
        items: [
          {
            label: "Sector & Strategy",
            value:
              form.secondary_sector === "None"
                ? `${form.primary_sector} as the sole delivery focus`
                : `${form.primary_sector} primary with ${form.secondary_sector} as the secondary sector`,
          },
          {
            label: "Risk & Governance",
            value: `${form.risk_appetite} risk appetite with ${form.governance_intensity} governance and ${form.vendor_strategy.toLowerCase()} vendor strategy`,
          },
          {
            label: "Key Sliders",
            value: `Public mix: ${describeScaleLevel(form.project_mix_public_pct)} (${form.project_mix_public_pct}/100), Bid aggressiveness: ${describeBidAggressiveness(form.bid_aggressiveness)} (${form.bid_aggressiveness}/5), Buffer: ${describeScaleLevel(form.buffer_percent, 15)} (${form.buffer_percent}/15)`,
          },
        ],
      },
      {
        title: "Step 3 - People & Engineering",
        items: [
          {
            label: "Subcontractor Mix Choice",
            value: `${form.self_perform_percent}% self-perform and ${subcontractShare}% subcontracted through ${form.subcontractor_profile}`,
          },
          {
            label: "Workforce Direction",
            value: `${form.workforce_plan} with ${form.workforce_load_state.toLowerCase()} crews and ${form.overtime_policy.toLowerCase()} overtime`,
          },
          {
            label: "Key Sliders",
            value: `Training intensity: ${describeScaleLevel(form.training_intensity)} (${form.training_intensity}/100), P&M utilization: ${describeScaleLevel(form.pm_utilization_target, 95)} (${form.pm_utilization_target}/95), Specialized capability: ${describeScaleLevel(form.specialized_work_index)} (${form.specialized_work_index}/100)`,
          },
        ],
      },
      {
        title: "Step 4 - Ops & Stakeholder",
        items: [
          {
            label: "Operations Setup",
            value: `${form.logistics_resilience} logistics resilience, ${form.inventory_cover_weeks} weeks of inventory cover, ${form.qa_audit_frequency.toLowerCase()} QA audits`,
          },
          {
            label: "Stakeholder Posture",
            value: `${form.compliance_posture}, ${form.transparency_level.toLowerCase()} transparency, and ${form.community_engagement >= 70 ? "proactive" : form.community_engagement >= 40 ? "balanced" : "light"} community engagement`,
          },
          {
            label: "Key Sliders",
            value: `Community engagement: ${describeScaleLevel(form.community_engagement)} (${form.community_engagement}/100), Digital visibility: ${describeScaleLevel(form.digital_visibility_spend)} (${form.digital_visibility_spend}/100), CSR & sustainability: ${describeScaleLevel(form.csr_sustainability_index)} (${form.csr_sustainability_index}/100)`,
          },
        ],
      },
      {
        title: "Step 5 - Finance & Lock",
        items: [
          {
            label: "Financing Strategy",
            value: `${form.financing_posture} with a ${form.cash_buffer_months}-month cash buffer and ${form.contingency_fund_percent}% contingency fund`,
          },
          {
            label: "Forecast Call",
            value: `Predicted SPI ${forecast.predicted_schedule_index.toFixed(2)}, predicted CPI ${forecast.predicted_cost_index.toFixed(2)}, confidence ${forecast.confidence}%`,
          },
          {
            label: "Budget Pressure Snapshot",
            value: `Estimated total budget pressure Rs ${Math.round(budget.total_budget_pressure / 1000)}k with Rs ${Math.round(budget.operations_resilience / 1000)}k toward operations resilience`,
          },
        ],
      },
    ],
    [
      budget.operations_resilience,
      budget.total_budget_pressure,
      forecast.confidence,
      forecast.predicted_cost_index,
      forecast.predicted_schedule_index,
      form,
      subcontractShare,
    ]
  );

  const lockWarningItems = useMemo(() => {
    const items: string[] = [];

    if (latePenaltyPreview.pointsPenalty > 0) {
      items.push(
        `Locking now is ${latePenaltyPreview.minutesLate} minute${latePenaltyPreview.minutesLate === 1 ? "" : "s"} late and may apply a ${latePenaltyPreview.pointsPenalty}-point timeliness penalty.`
      );
    }

    if (readinessScore < 60) {
      items.push(`Readiness is currently ${readinessScore}%. Review weak checks before final lock if you want a safer round outcome.`);
    }

    return items;
  }, [latePenaltyPreview.minutesLate, latePenaltyPreview.pointsPenalty, readinessScore]);

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

  const showWaitingForRound = !locked && roundStatus === "pending";
  const isLocked = locked || roundStatus !== "open" || lockBlockedByDeadline;
  const headerStatusLabel = locked
    ? "LOCKED"
    : roundStatus === "pending"
      ? "WAITING"
      : roundStatus === "closed"
        ? "CLOSED"
        : "DRAFTING";
  const headerStatusTone = locked || roundStatus === "closed"
    ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
    : roundStatus === "pending"
      ? "border-amber-500/30 bg-amber-500/15 text-amber-300"
      : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
  const headerStatusMessage =
    roundStatus === "open"
      ? submissionPressure.message
      : roundStatus === "pending"
        ? "Facilitator has not opened this round yet."
        : `${formatStatus(roundStatus)}. Awaiting next step.`;

  return (
    <RequireAuth>
      <div className="flex min-h-[100dvh] flex-col bg-[#020617] pb-40 text-slate-300 md:pb-32">
        <LockConfirmationModal
          open={showLockConfirmation}
          sections={lockSummarySections}
          warningItems={lockWarningItems}
          onClose={() => setShowLockConfirmation(false)}
          onReview={() => {
            setShowLockConfirmation(false);
            setActiveStep(0);
          }}
          onConfirm={lockAndGenerateResults}
          isSubmitting={locking}
        />
        {/* HEADER ZONE */}
        <header className="sticky top-[60px] z-40 bg-slate-950/80 backdrop-blur-md border-b border-white/5 px-4 py-3 shadow-lg">
          <div className="max-w-[1180px] mx-auto flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <Link className="text-slate-400 hover:text-white" href={`/sessions/${sessionId}`}>
                  <svg className="w-5 h-5 block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </Link>
                <h1 className="text-lg font-black text-white uppercase tracking-tight">Round {roundNumber} War Room</h1>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-widest ${headerStatusTone}`}>{headerStatusLabel}</span>
              </div>
              <div className="mt-1 flex items-center gap-3 text-[10px] text-slate-500 uppercase tracking-widest font-semibold ml-8">
                <span>{teamName}</span>
                <span>•</span>
                <span>Readiness: {readinessScore}%</span>
              </div>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-slate-500 uppercase tracking-widest text-[9px]">Time Remaining</span>
              <span className={`font-bold text-lg font-mono leading-none ${lockWindowExpired ? "text-rose-400" : "text-emerald-400"}`}>
                {timeRemainingLabel}
              </span>
              <span
                className={`mt-1 max-w-[260px] text-right text-[10px] font-semibold uppercase tracking-wide ${
                  lockWindowExpired ? "text-rose-300" : "text-slate-400"
                }`}
              >
                {headerStatusMessage}
              </span>
            </div>
          </div>
        </header>

        {/* MAIN ZONE */}
        <main className="w-full max-w-[1180px] mx-auto p-4 md:p-6 space-y-6">
          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400 shadow-inner">
              {error}
            </div>
          )}
          {loading ? (
             <div className="animate-pulse flex flex-col gap-4">
               <div className="h-10 w-48 bg-slate-800 rounded-lg" />
               <div className="h-64 rounded-xl bg-slate-900/50 border border-white/5" />
             </div>
          ) : showWaitingForRound ? (
            <div className="space-y-6">
              <section className="rounded-[28px] border border-amber-500/20 bg-gradient-to-br from-amber-500/12 via-slate-950/90 to-slate-950 px-6 py-8 text-center shadow-[0_24px_60px_rgba(15,23,42,0.35)]">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-amber-400/25 bg-amber-500/10 text-4xl">
                  ⏳
                </div>
                <h2 className="mt-5 text-2xl font-black uppercase tracking-tight text-white">Waiting for Round to Open</h2>
                <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-300">
                  Your facilitator will open this round shortly. Use this time to discuss strategy with your team.
                </p>
              </section>
              <RoundBriefingCard sessionId={sessionId} roundNumber={roundNumber} teamId={teamId} />
            </div>
          ) : (
             <>
                <RoundBriefingCard sessionId={sessionId} roundNumber={roundNumber} teamId={teamId} />
                <div className="rounded-2xl border border-white/5 bg-slate-950/70 px-4 py-4 md:flex md:items-center md:justify-between md:gap-4 lg:hidden">
                  <div className="flex items-center gap-2">
                    {stepTitles.map((title, index) => {
                      const idx = index as StepIndex;
                      const current = activeStep === idx;
                      const complete = idx < activeStep || stepValidations[idx];
                      return (
                        <div
                          key={`tablet-step-${title}`}
                          className={`h-2.5 w-8 rounded-full transition-all ${
                            current ? "bg-blue-500" : complete ? "bg-emerald-500/80" : "bg-slate-800"
                          }`}
                          aria-hidden="true"
                        />
                      );
                    })}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-4 text-xs md:mt-0">
                    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2 font-bold uppercase tracking-[0.18em] text-slate-200">
                      Ready {readinessScore}%
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Time remaining</div>
                      <div className={`mt-1 font-mono text-lg font-black ${lockWindowExpired ? "text-rose-400" : "text-emerald-400"}`}>
                        {timeRemainingLabel}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="space-y-6">
                   {/* TAB BAR */}
                   <div className="hidden overflow-x-auto pb-2 scrollbar-hide">
                     <div className="flex gap-2 min-w-max">
                       {stepTitles.map((title, index) => {
                         const idx = index as StepIndex;
                         const current = activeStep === idx;
                         const unlocked = availableStep(idx);
                         return (
                           <button
                             key={title}
                             onClick={() => setActiveStep(idx)}
                             disabled={!unlocked}
                             className={`px-5 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-all ${
                               current ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20 border border-white/10" : "bg-slate-900/50 text-slate-400 border border-transparent hover:bg-slate-800"
                             } ${!unlocked && "opacity-30 cursor-not-allowed"}`}
                           >
                             {String(index+1).padStart(2,"0")} <span className="opacity-50 mx-1">/</span> {title}
                           </button>
                         );
                       })}
                     </div>
                   </div>

                   {/* TAB CONTENT: STEP 1 */}
                   {activeStep === 0 && (
                     <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Team KPI Target (4x points)</div>
                          {teamKpiTarget ? (
                            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400 font-bold shadow-inner flex justify-between items-center">
                              <span>LOCKED TARGET // {teamKpiTarget}</span>
                              {savingKpiTarget && <span className="text-emerald-400 animate-pulse text-xs">SAVING...</span>}
                            </div>
                          ) : roundNumber === 1 ? (
                            <div className="space-y-4">
                              <SegmentedControl options={KPI_TARGET_OPTIONS.map(k=>({value:k.value,text:k.value,hint:k.thresholdLabel}))} activeOption={draftKpiTarget} onSelect={(value) => setDraftKpiTarget(value)} disabled={isLocked} />
                              <div className="pt-2"><Button variant="secondary" onClick={saveKpiTargetNow} disabled={isLocked || !draftKpiTarget || savingKpiTarget}>{savingKpiTarget ? "SAVING..." : "LOCK KPI TARGET"}</Button></div>
                            </div>
                          ) : (
                            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400 shadow-inner">KPI TARGET NOT SET IN R1</div>
                          )}
                        </div>

                        {deckEvents.length > 0 && (
                          <div className="p-5 rounded-2xl bg-slate-900/40 border border-teal-500/30 space-y-4">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-teal-500 flex items-center justify-between">
                              <span>Event Deck (Action Required)</span>
                              <span className="text-teal-400/50">{Object.keys(eventsChosen).length}/{deckEvents.length} Decided</span>
                            </div>
                            <div className="space-y-6">
                              {deckEvents.map(evt => (
                                <div key={evt.id} className="space-y-3 p-4 rounded-xl bg-slate-950/50 border border-slate-800">
                                  <div>
                                    <div className="font-bold text-slate-200">{evt.title}</div>
                                    <div className="text-xs text-slate-400 mt-1 leading-relaxed">{evt.description}</div>
                                  </div>
                                  <div className="pt-2">
                                    <SegmentedControl
                                      options={evt.choices.map(c => ({ value: c.id, text: c.label, hint: c.theoryHint }))}
                                      activeOption={eventsChosen[evt.id] || ""}
                                      onSelect={(v) => updateEventChoice(evt.id, v)}
                                      disabled={isLocked}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Live External Context</div>
                          <SegmentedControl options={externalContextOptions.map(o=>({value:o.value,text:o.text}))} activeOption={form.external_context} onSelect={(v)=>update("external_context",v)} disabled={isLocked} />
                        </div>

                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Focus Allocation</div>
                            <div className={`text-[10px] font-mono font-bold ${focusSum===100?"text-emerald-400":"text-rose-400"}`}>TOTAL: {focusSum}/100</div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DecisionSlider label={<FieldLabel label="Cost Focus" tooltip={decisionFieldTooltips.costFocus} />} value={form.focus_cost} min={0} max={100} onChange={v=>update("focus_cost",v)} disabled={isLocked} />
                            <DecisionSlider label={<FieldLabel label="Quality Focus" tooltip={decisionFieldTooltips.qualityFocus} />} value={form.focus_quality} min={0} max={100} onChange={v=>update("focus_quality",v)} disabled={isLocked} />
                            <DecisionSlider label={<FieldLabel label="Stakeholder Focus" tooltip={decisionFieldTooltips.stakeholderFocus} />} value={form.focus_stakeholder} min={0} max={100} onChange={v=>update("focus_stakeholder",v)} disabled={isLocked} />
                            <DecisionSlider label={<FieldLabel label="Speed Focus" tooltip={decisionFieldTooltips.speedFocus} />} value={form.focus_speed} min={0} max={100} onChange={v=>update("focus_speed",v)} disabled={isLocked} />
                          </div>
                        </div>
                        
                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Strategic Posture</div>
                          <SegmentedControl options={postureOptions.map(o=>({value:o.value,text:o.text}))} activeOption={form.strategic_posture} onSelect={(v)=>update("strategic_posture",v)} disabled={isLocked} />
                        </div>
                     </div>
                   )}

                   {/* TAB CONTENT: STEP 2 */}
                   {activeStep === 1 && (
                     <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Sector Selection</div>
                          <SegmentedControl options={sectorOptions.map(o=>({value:o.value,text:o.text}))} activeOption={form.primary_sector} onSelect={(v)=>update("primary_sector",v)} disabled={isLocked} />
                          <div className="mt-4 flex flex-col bg-slate-950/50 rounded-xl p-4 border border-white/5">
                            <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-2">Secondary Sector</span>
                            <select className="w-full rounded-lg bg-slate-900 border border-slate-700 px-4 py-3 text-sm font-semibold text-white focus:border-blue-500 outline-none" value={form.secondary_sector} disabled={isLocked} onChange={e=>update("secondary_sector",e.target.value as SecondarySector)}>
                               {secondarySectorOptions.map(o=><option key={o} value={o}>{o}</option>)}
                            </select>
                          </div>
                        </div>

                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Market Expansion</div>
                          <SegmentedControl options={expansionOptions.map(o=>({value:o.value,text:o.text,hint:o.hint}))} activeOption={form.market_expansion} onSelect={(v)=>update("market_expansion",v)} disabled={isLocked} />
                        </div>

                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Portfolio Posture</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DecisionSlider label={<FieldLabel label="Bid Aggressiveness" tooltip={decisionFieldTooltips.bidAggressiveness} />} value={form.bid_aggressiveness} min={1} max={5} onChange={v=>update("bid_aggressiveness",v)} disabled={isLocked} />
                            <DecisionSlider label={<FieldLabel label="Public Project Mix" tooltip={decisionFieldTooltips.publicProjectMix} />} value={form.project_mix_public_pct} min={0} max={100} suffix="%" onChange={v=>update("project_mix_public_pct",v)} disabled={isLocked} />
                          </div>
                        </div>

                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Governance & Risk</div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="flex flex-col"><span className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500"><FieldLabel label="Risk Appetite" tooltip={decisionFieldTooltips.riskAppetite} /></span><select className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white font-semibold outline-none" value={form.risk_appetite} disabled={isLocked} onChange={e=>update("risk_appetite",e.target.value as RiskAppetite)}>{riskOptions.map(o=><option key={o} value={o}>{o}</option>)}</select></div>
                            <div className="flex flex-col"><span className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500"><FieldLabel label="Governance Intensity" tooltip={decisionFieldTooltips.governanceIntensity} /></span><select className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white font-semibold outline-none" value={form.governance_intensity} disabled={isLocked} onChange={e=>update("governance_intensity",e.target.value as Governance)}>{governanceOptions.map(o=><option key={o} value={o}>{o}</option>)}</select></div>
                            <div className="flex flex-col"><span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-2">Message Tone</span><select className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white font-semibold outline-none" value={form.public_message_tone} disabled={isLocked} onChange={e=>update("public_message_tone",e.target.value as MessageTone)}>{messageToneOptions.map(o=><option key={o} value={o}>{o}</option>)}</select></div>
                          </div>
                        </div>
                     </div>
                   )}

                   {/* TAB CONTENT: STEP 3 */}
                   {activeStep === 2 && (
                     <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Delivery Mix & Assets</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DecisionSlider label="Self-Perform Share" value={form.self_perform_percent} min={0} max={100} suffix="%" onChange={v=>update("self_perform_percent",v)} disabled={isLocked} />
                            <DecisionSlider label={<FieldLabel label="P&M Utilization Target" tooltip={decisionFieldTooltips.pmUtilizationTarget} />} value={form.pm_utilization_target} min={40} max={95} suffix="%" onChange={v=>update("pm_utilization_target",v)} disabled={isLocked} />
                            <DecisionSlider label={<FieldLabel label="Specialized Capability" tooltip={decisionFieldTooltips.specializedCapability} />} value={form.specialized_work_index} min={0} max={100} onChange={v=>update("specialized_work_index",v)} disabled={isLocked} />
                            <DecisionSlider label={<FieldLabel label="Work-Life Balance" tooltip={decisionFieldTooltips.workLifeBalance} />} value={form.work_life_balance_index} min={0} max={100} onChange={v=>update("work_life_balance_index",v)} disabled={isLocked} />
                          </div>
                        </div>
                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Subcontractor Profile</div>
                          <SegmentedControl options={subcontractorOptions.map(o=>({value:o.value,text:o.text,hint:o.hint}))} activeOption={form.subcontractor_profile} onSelect={(v)=>update("subcontractor_profile",v)} disabled={isLocked} />
                        </div>
                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Workforce Dynamics</div>
                          <SegmentedControl options={workforceOptions.map(o=>({value:o.value,text:o.text}))} activeOption={form.workforce_plan} onSelect={(v)=>update("workforce_plan",v)} disabled={isLocked} />
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                            <div className="flex flex-col"><span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-2">Load State</span><select className="w-full rounded-lg bg-slate-900 border border-slate-700 px-4 py-3 text-sm text-white font-semibold outline-none" value={form.workforce_load_state} disabled={isLocked} onChange={e=>update("workforce_load_state",e.target.value as WorkforceLoadState)}>{workloadOptions.map(o=><option key={o} value={o}>{o}</option>)}</select></div>
                            <div className="flex flex-col"><span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-2">QA Frequency</span><select className="w-full rounded-lg bg-slate-900 border border-slate-700 px-4 py-3 text-sm text-white font-semibold outline-none" value={form.qa_audit_frequency} disabled={isLocked} onChange={e=>update("qa_audit_frequency",e.target.value as QaFrequency)}>{qaOptions.map(o=><option key={o} value={o}>{o}</option>)}</select></div>
                          </div>
                        </div>
                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Overtime Policy</div>
                          <SegmentedControl options={overtimeOptions.map(o=>({value:o.value,text:o.text}))} activeOption={form.overtime_policy} onSelect={(v)=>update("overtime_policy",v)} disabled={isLocked} />
                        </div>
                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">L&D and Innovation</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DecisionSlider label="Training Intensity" value={form.training_intensity} min={0} max={100} onChange={v=>update("training_intensity",v)} disabled={isLocked} />
                            <DecisionSlider label="Innovation Budget" value={form.innovation_budget_index} min={0} max={100} onChange={v=>update("innovation_budget_index",v)} disabled={isLocked} />
                          </div>
                        </div>
                     </div>
                   )}

                   {/* TAB CONTENT: STEP 4 */}
                   {activeStep === 3 && (
                     <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Logistics & Buffer</div>
                          <SegmentedControl options={logisticsOptions.map(o=>({value:o.value,text:o.text}))} activeOption={form.logistics_resilience} onSelect={(v)=>update("logistics_resilience",v)} disabled={isLocked} />
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                            <DecisionSlider label={<FieldLabel label="Buffer" tooltip={decisionFieldTooltips.buffer} />} value={form.buffer_percent} min={0} max={15} suffix="%" onChange={v=>update("buffer_percent",v)} disabled={isLocked} />
                            <DecisionSlider label="Inventory Cover" value={form.inventory_cover_weeks} min={1} max={12} suffix="w" onChange={v=>update("inventory_cover_weeks",v)} disabled={isLocked} />
                          </div>
                        </div>
                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Stakeholder Engagement</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DecisionSlider label={<FieldLabel label="Community Engagement" tooltip={decisionFieldTooltips.communityEngagement} />} value={form.community_engagement} min={0} max={100} onChange={v=>update("community_engagement",v)} disabled={isLocked} />
                            <DecisionSlider label="Digital Visibility Spend" value={form.digital_visibility_spend} min={0} max={100} onChange={v=>update("digital_visibility_spend",v)} disabled={isLocked} />
                            <DecisionSlider label={<FieldLabel label="CSR & Sustainability" tooltip={decisionFieldTooltips.csrSustainability} />} value={form.csr_sustainability_index} min={0} max={100} onChange={v=>update("csr_sustainability_index",v)} disabled={isLocked} />
                            <DecisionSlider label={<FieldLabel label="Facilitation Risk Budget" tooltip={decisionFieldTooltips.facilitationRiskBudget} />} value={form.facilitation_budget_index} min={0} max={100} onChange={v=>update("facilitation_budget_index",v)} disabled={isLocked} />
                          </div>
                        </div>
                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Compliance & Transparency</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                             <div className="flex flex-col"><span className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-2">Compliance Posture</span><select className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white font-semibold outline-none" value={form.compliance_posture} disabled={isLocked} onChange={e=>update("compliance_posture",e.target.value as CompliancePosture)}>{complianceOptions.map(o=><option key={o} value={o}>{o}</option>)}</select></div>
                             <div className="flex flex-col"><span className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-2">Vendor Strategy</span><select className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white font-semibold outline-none" value={form.vendor_strategy} disabled={isLocked} onChange={e=>update("vendor_strategy",e.target.value as VendorStrategy)}>{vendorOptions.map(o=><option key={o} value={o}>{o}</option>)}</select></div>
                             <div className="flex flex-col lg:col-span-1 md:col-span-2"><span className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">Transparency Mode</span><SegmentedControl options={transparencyOptions.map(o=>({value:o.value,text:o.text,hint:o.hint}))} activeOption={form.transparency_level} onSelect={(v)=>update("transparency_level",v)} disabled={isLocked} /></div>
                          </div>
                        </div>
                     </div>
                   )}

                   {/* TAB CONTENT: STEP 5 */}
                   {activeStep === 4 && (
                     <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                           <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Financing Strategy</div>
                           <SegmentedControl options={financingOptions.map(o=>({value:o.value,text:o.text}))} activeOption={form.financing_posture} onSelect={(v)=>update("financing_posture",v)} disabled={isLocked} />
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                             <DecisionSlider label="Cash Buffer" value={form.cash_buffer_months} min={1} max={12} suffix="m" onChange={v=>update("cash_buffer_months",v)} disabled={isLocked} />
                             <DecisionSlider label="Contingency Fund" value={form.contingency_fund_percent} min={0} max={20} suffix="%" onChange={v=>update("contingency_fund_percent",v)} disabled={isLocked} />
                           </div>
                        </div>
                        <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-4">
                           <div className="text-[10px] font-bold uppercase tracking-widest text-amber-500">Deterministic Preview</div>
                           <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                             <div className="flex flex-col"><span className="text-[10px] uppercase text-amber-500/70">SPI Projection</span><span className="text-xl font-mono font-bold text-amber-400">{previewResult.schedule_index.toFixed(2)}</span></div>
                             <div className="flex flex-col"><span className="text-[10px] uppercase text-amber-500/70">CPI Projection</span><span className="text-xl font-mono font-bold text-amber-400">{previewResult.cost_index.toFixed(2)}</span></div>
                             <div className="flex flex-col"><span className="text-[10px] uppercase text-amber-500/70">Points Expected</span><span className="text-xl font-mono font-bold text-amber-400">+{Math.round(previewResult.points_earned)}</span></div>
                           </div>
                        </div>
                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-purple-500/30 space-y-4 mt-6">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-purple-400">Pre-Lock Forecast</div>
                          <p className="text-xs text-slate-400">Before locking, predict your performance. Future rounds will tie point bonuses to prediction calibration.</p>
                          <div className="space-y-6 pt-2">
                             <DecisionSlider
                               label="Predicted SPI"
                               value={forecast.predicted_schedule_index}
                               min={0.60}
                               max={1.35}
                               step={0.01}
                               onChange={(v) => { setHasUnsavedChanges(true); setForecast(p => ({...p, predicted_schedule_index: v})); }}
                               disabled={isLocked}
                               formatValue={(v) => v.toFixed(2)}
                               hint="> 1.0 means ahead of schedule"
                             />
                             <DecisionSlider
                               label="Predicted CPI"
                               value={forecast.predicted_cost_index}
                               min={0.60}
                               max={1.50}
                               step={0.01}
                               onChange={(v) => { setHasUnsavedChanges(true); setForecast(p => ({...p, predicted_cost_index: v})); }}
                               disabled={isLocked}
                               formatValue={(v) => v.toFixed(2)}
                               hint="> 1.0 means under budget"
                             />
                             <DecisionSlider
                               label="Confidence Level"
                               value={forecast.confidence}
                               min={0}
                               max={100}
                               step={5}
                               onChange={(v) => { setHasUnsavedChanges(true); setForecast(p => ({...p, confidence: v})); }}
                               disabled={isLocked}
                               formatValue={(v) => v + "%"}
                               hint="Over-confidence will be heavily penalized later."
                             />
                          </div>
                        </div>
                     </div>
                   )}

                   <div className="space-y-4 rounded-2xl border border-white/5 bg-slate-950/70 p-4 md:hidden">
                     <div className="flex items-center justify-between gap-3">
                       <Button
                         variant="secondary"
                         onClick={prevStep}
                         disabled={activeStep === 0 || isLocked}
                         className="flex-1 border-slate-700 bg-slate-900 text-slate-200"
                       >
                         Previous
                       </Button>
                       <div className="flex items-center gap-1">
                         {stepTitles.map((title, index) => {
                           const idx = index as StepIndex;
                           return (
                             <div
                               key={`mobile-progress-${title}`}
                               className={`h-2 w-6 rounded-full ${
                                 activeStep === idx ? "bg-blue-500" : activeStep > idx ? "bg-emerald-500/70" : "bg-slate-800"
                               }`}
                             />
                           );
                         })}
                       </div>
                       <Button
                         onClick={nextStep}
                         disabled={activeStep === 4 || !stepValidations[activeStep] || isLocked}
                         className="flex-1"
                       >
                         Next
                       </Button>
                     </div>

                     {isLocked ? (
                       <Link href={`/sessions/${sessionId}/round/${roundNumber}/results`} className="block">
                         <Button className="w-full bg-emerald-600 text-white shadow-emerald-500/20 border-emerald-500">
                           View Impact Report
                         </Button>
                       </Link>
                     ) : (
                       <div className="grid grid-cols-1 gap-3">
                         <Button
                           variant="secondary"
                           onClick={saveDraft}
                           disabled={saving || isLocked}
                           className="w-full border-slate-700 bg-slate-900 text-slate-200"
                         >
                           {saving ? "Saving..." : "Save Draft"}
                         </Button>
                         <Button
                           onClick={openLockConfirmation}
                           disabled={locking || saving || isLocked || !stepValidations[4]}
                           className="w-full"
                         >
                           {locking ? "Initializing..." : lockBlockedByDeadline ? "Window Closed" : "Lock and Generate Results"}
                         </Button>
                         <div className="text-center text-[10px] font-bold uppercase tracking-[0.22em]">
                           {hasUnsavedChanges ? (
                             <span className="text-amber-400">Unsaved Draft</span>
                           ) : (
                             <span className="text-emerald-500">Input Accepted</span>
                           )}
                         </div>
                       </div>
                     )}
                   </div>
                </div>

                {/* SIDEBAR ZONE */}
                <aside className="hidden w-full shrink-0 flex-col gap-4 lg:sticky lg:top-28 lg:flex">
                  <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-4">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Step Navigation</div>
                    <div className="mt-4 space-y-2">
                      {stepTitles.map((title, index) => {
                        const idx = index as StepIndex;
                        const current = activeStep === idx;
                        const unlocked = availableStep(idx);
                        return (
                          <button
                            key={`sidebar-step-${title}`}
                            type="button"
                            onClick={() => setActiveStep(idx)}
                            disabled={!unlocked}
                            className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition ${
                              current
                                ? "border-blue-500/40 bg-blue-500/15 text-white"
                                : "border-white/5 bg-slate-950/70 text-slate-300 hover:border-white/10 hover:bg-slate-900"
                            } ${!unlocked ? "cursor-not-allowed opacity-40" : ""}`}
                          >
                            <div className="min-w-0">
                              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                                Step {index + 1}
                              </div>
                              <div className="mt-1 truncate text-sm font-semibold">{title}</div>
                            </div>
                            <span
                              className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                                current ? "bg-blue-400" : stepValidations[idx] ? "bg-emerald-400" : "bg-slate-700"
                              }`}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-4">
                    <div className="space-y-3 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-bold uppercase tracking-[0.18em] text-slate-500">Readiness</span>
                        <span className="font-semibold text-slate-200">{readinessScore}%</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-bold uppercase tracking-[0.18em] text-slate-500">Risk band</span>
                        <span className={`rounded-full border px-2 py-1 font-semibold ${riskLevelTone}`}>
                          {riskLevel}
                        </span>
                      </div>
                    </div>
                    <div className="mt-4 rounded-2xl border border-white/5 bg-slate-950/80 px-4 py-4">
                      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Time remaining</div>
                      <div className={`mt-2 font-mono text-3xl font-black ${lockWindowExpired ? "text-rose-400" : "text-emerald-400"}`}>
                        {timeRemainingLabel}
                      </div>
                      <div className="mt-2 text-[11px] text-slate-400">{submissionPressure.message}</div>
                    </div>
                  </div>

                  <SidebarAccordion
                    title="Budget Pressure"
                    summary={`Estimated total Rs ${Math.round(budget.total_budget_pressure / 1000)}k`}
                    open={showBudgetPressure}
                    onToggle={() => setShowBudgetPressure((current) => !current)}
                  >
                    <div className="space-y-3">
                      {budgetPressureItems.map((item) => (
                        <BudgetBar key={item.label} label={item.label} value={item.value} max={biggestBudget} />
                      ))}
                    </div>
                  </SidebarAccordion>

                  <SidebarAccordion
                    title="Projected Outcome"
                    summary={`Est. Points: ${Math.round(previewResult.points_earned)} | Risk: ${riskLevel}`}
                    open={showProjectedOutcome}
                    onToggle={() => setShowProjectedOutcome((current) => !current)}
                  >
                    <div className="space-y-3">
                      {projectedOutcomeItems.map((item) => (
                        <div
                          key={item.label}
                          className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-slate-950/70 px-3 py-3 text-xs"
                        >
                          <span className="font-bold uppercase tracking-[0.18em] text-slate-500">{item.label}</span>
                          <span className="font-semibold text-slate-200">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </SidebarAccordion>
                </aside>
             </div>
             </>
          )}
        </main>

        {!loading && !showWaitingForRound ? (
          <div className="fixed inset-x-4 bottom-4 z-50 rounded-2xl border border-white/10 bg-slate-950/95 px-4 py-3 shadow-[0_18px_45px_rgba(2,6,23,0.55)] backdrop-blur-xl md:hidden">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Current step</div>
                <div className="mt-1 truncate text-sm font-semibold text-white">{activeStepLabel}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Ready</div>
                <div className="mt-1 text-sm font-black text-slate-100">{readinessScore}%</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Time</div>
                <div className={`mt-1 font-mono text-sm font-black ${lockWindowExpired ? "text-rose-400" : "text-emerald-400"}`}>
                  {timeRemainingLabel}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* FOOTER CTA ZONE (Sticky) */}
        {!loading && !showWaitingForRound && (
          <footer className="fixed bottom-0 left-0 right-0 z-50 hidden border-t border-white/10 bg-[#020617]/90 p-4 shadow-[0_-20px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl md:block">
            <div className="max-w-[1180px] mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center justify-between md:justify-start w-full md:w-auto gap-4">
                <Button variant="ghost" onClick={prevStep} disabled={activeStep === 0 || isLocked} className="text-slate-400 hover:text-white">
                  &lt; Previous
                </Button>
                <div className="hidden md:flex flex-row gap-1">
                  {[0,1,2,3,4].map(idx => (
                     <div key={idx} className={`w-8 h-2 rounded-full transition-all ${activeStep === idx ? "bg-blue-500" : activeStep > idx ? "bg-blue-900" : "bg-slate-800"}`} />
                  ))}
                </div>
                <Button variant="ghost" onClick={nextStep} disabled={activeStep === 4 || !stepValidations[activeStep] || isLocked} className="text-slate-400 hover:text-white">
                  Next &gt;
                </Button>
              </div>

              <div className="flex flex-col md:flex-row md:items-center gap-3 w-full md:w-auto">
                 {isLocked ? (
                   <Link href={`/sessions/${sessionId}/round/${roundNumber}/results`} className="w-full md:w-auto">
                     <Button className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20 border-emerald-500 font-bold uppercase tracking-widest text-[11px] py-3">
                       VIEW IMPACT REPORT
                     </Button>
                   </Link>
                 ) : (
                   <>
                     <div className="flex items-center justify-center md:justify-end pr-2 font-mono text-[10px] font-bold tracking-widest">
                       {hasUnsavedChanges ? (
                         <span className="text-amber-400 animate-pulse uppercase">Unsaved Draft</span>
                       ) : (
                         <span className="text-emerald-500 uppercase">Input Accepted</span>
                       )}
                     </div>
                     <Button variant="secondary" onClick={saveDraft} disabled={saving || isLocked} className="w-full md:w-auto border-slate-700 bg-slate-900 text-slate-300 py-3 text-[11px] tracking-widest">
                       {saving ? "SAVING..." : "SAVE DRAFT"}
                     </Button>
                     <Button onClick={openLockConfirmation} disabled={locking || saving || isLocked || !stepValidations[4]} className="w-full md:w-auto shadow-blue-500/40 py-3 text-[11px] tracking-widest">
                       {locking ? "INITIALIZING..." : lockBlockedByDeadline ? "WINDOW CLOSED" : "LOCK AND GENERATE RESULTS"}
                     </Button>
                   </>
                 )}
              </div>
            </div>
          </footer>
        )}
      </div>
    </RequireAuth>
  );
}




