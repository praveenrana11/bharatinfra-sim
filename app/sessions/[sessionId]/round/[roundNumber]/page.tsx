
"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { CompetitorIntelFeed } from "@/components/CompetitorIntelFeed";
import { formatStatus } from "@/lib/formatters";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { scoreRoundSecureClient } from "@/lib/secureRoundScoring";
import { setTeamKpiTargetSecureClient } from "@/lib/secureTeamKpi";
import { cn } from "@/lib/cn";
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
import { ProjectInbox } from "@/components/ProjectInbox";
import LockConfirmationModal, { type LockConfirmationSection } from "@/components/LockConfirmationModal";
import RoundBriefingCard from "@/components/RoundBriefingCard";
import TeamCoordPanel from "@/components/TeamCoordPanel";
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
import { ConstructionEvent, resolveRoundConstructionEvents } from "@/lib/constructionNews";
import { KPI_TARGET_OPTIONS, KpiTarget, parseKpiTarget } from "@/lib/kpi";
import { parseConstructionEvents } from "@/lib/newsPayload";
import {
  buildDilemmaRoundSummary,
  deriveManagementFields,
  getCategoryLabel,
  parseStoredDilemmaSummary,
  selectDilemmasForRound,
  type Dilemma,
  type DilemmaOption,
  type DilemmaSelectionMap,
  type DilemmaRoundSummary,
} from "@/lib/dilemmaEngine";
import {
  type CarryoverState,
  DEFAULT_CARRYOVER_STATE,
  parseCarryoverState,
} from "@/lib/consequenceEngine";
import {
  formatScenarioComplexity,
  getDecisionEventImageUrl,
  getExternalContextIcon,
  getScenarioTypeLabel,
} from "@/lib/simVisuals";
import { getRoundEvents, GameEvent } from "@/lib/eventDeck";
import { generateProjectInboxMessages, type InboxIdentityProfile, type InboxPreviousRound } from "@/lib/inboxEngine";
import {
  TEAM_MEMBER_ROLES,
  TeamMemberRole,
  formatRoleList,
  getDecisionOwner,
  getRoleLabel,
  getRoleName,
  getRoleOwnedAreas,
  roleOwnsStep,
} from "@/lib/rolePermissions";

const externalContextOptions: Array<{ value: ExternalContext; icon: string; text: string }> = [
  { value: "Stable Environment", icon: getExternalContextIcon("Stable Environment"), text: "Stable environment" },
  { value: "Material Price Spike", icon: getExternalContextIcon("Material Price Spike"), text: "Material price spike" },
  { value: "Labor Tightness", icon: getExternalContextIcon("Labor Tightness"), text: "Labor tightness" },
  { value: "Permitting Delay", icon: getExternalContextIcon("Permitting Delay"), text: "Permitting delay" },
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
  "Management Decisions",
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

type ChecklistItem = {
  label: string;
  pass: boolean;
  remainingLabel?: string;
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
type MembershipRow = { team_id: string; member_role: TeamMemberRole | null };
type TeamIdentityProfile = {
  company_name?: string | null;
  positioning_strategy?: string | null;
  primary_kpi?: string | null;
};
type TeamRow = {
  id: string;
  team_name: string;
  session_id: string;
  kpi_target: string | null;
  scenario_id: string | null;
  identity_profile: TeamIdentityProfile | null;
};
type ScenarioRow = {
  name: string | null;
  client: string | null;
  base_budget_cr: number | string | null;
  duration_rounds: number | null;
  complexity: "moderate" | "high" | "extreme" | null;
};

type ExistingDecisionRow = DecisionDraft & {
  raw: Record<string, unknown> | null;
  locked: boolean;
};

type PreviousRoundPerformanceRow = {
  spi: number | null;
  cpi: number | null;
};

type SessionRoundRow = {
  session_id?: string;
  round_number?: number | null;
  deadline_at: string | null;
  status: string | null;
  news_payload: unknown;
};

type ScenarioPromotionRow = {
  id: string;
  source_scenario_name: string | null;
  promotion_payload: Record<string, unknown> | null;
  applied_at: string | null;
};

type TeamMembershipRoleRow = {
  user_id: string;
  team_role: string | null;
  is_team_lead: boolean | null;
  member_role: TeamMemberRole | null;
};

type TeamRoleAssignment = {
  userId: string;
  memberLabel: string;
};

type CoordinationStatus = {
  draftSavedAt: string | null;
  userId: string | null;
  memberLabel: string | null;
};

type ForecastState = {
  predicted_schedule_index: number;
  predicted_cost_index: number;
  confidence: number;
};

type StepProjectContext = {
  projectName: string;
  client: string;
  scenarioType: string;
  positioningStrategy: string;
  complexity: string;
  baseBudgetCr: number | null;
  totalRounds: number;
};

const DEFAULT_FORECAST: ForecastState = {
  predicted_schedule_index: 1,
  predicted_cost_index: 1,
  confidence: 50,
};

const DEFAULT_STEP_PROJECT_CONTEXT: StepProjectContext = {
  projectName: "Project Scenario",
  client: "Client",
  scenarioType: "Highway Package",
  positioningStrategy: "Not selected",
  complexity: "moderate",
  baseBudgetCr: null,
  totalRounds: 1,
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

function toNumberOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
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

function formatBudgetCr(value: number | null) {
  if (value === null) return "Pending";
  return `${Math.round(value)}`;
}

function StepContextBanner({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/55 px-4 py-3 text-xs font-medium text-slate-300">
      {children}
    </div>
  );
}

const dilemmaCategoryOwnership: Record<Dilemma["category"], TeamMemberRole> = {
  procurement: "contracts_manager",
  commercial: "contracts_manager",
  client: "project_director",
  regulatory: "project_director",
  people: "hse_manager",
};

const ownedFormFields: Record<TeamMemberRole, Array<keyof ExtendedDecisionForm>> = {
  project_director: ["external_context", "strategic_posture", "market_expansion"],
  contracts_manager: [
    "primary_sector",
    "secondary_sector",
    "project_mix_public_pct",
    "subcontractor_profile",
    "vendor_strategy",
  ],
  planning_manager: [
    "focus_quality",
    "focus_speed",
    "self_perform_percent",
    "pm_utilization_target",
    "specialized_work_index",
    "qa_audit_frequency",
    "innovation_budget_index",
    "logistics_resilience",
    "buffer_percent",
    "inventory_cover_weeks",
  ],
  hse_manager: [
    "focus_stakeholder",
    "work_life_balance_index",
    "workforce_plan",
    "workforce_load_state",
    "training_intensity",
    "overtime_policy",
    "community_engagement",
    "digital_visibility_spend",
    "csr_sustainability_index",
    "transparency_level",
  ],
  finance_head: [
    "focus_cost",
    "compliance_posture",
    "facilitation_budget_index",
    "financing_posture",
    "cash_buffer_months",
    "contingency_fund_percent",
  ],
};

function formatMemberLabel(member: TeamMembershipRoleRow, currentUserId: string, fallbackName: string) {
  if (member.user_id === currentUserId) return `${fallbackName} (You)`;
  if (member.team_role?.trim()) return member.team_role.trim();
  if (member.is_team_lead) return "Team Lead";
  return "Team Member";
}

function parseCoordinationState(raw: Record<string, unknown> | null) {
  const coordinationRaw = toRecord(raw?.team_coordination);
  const roleStatusesRaw = toRecord(coordinationRaw?.role_statuses);

  return TEAM_MEMBER_ROLES.reduce<Partial<Record<TeamMemberRole, CoordinationStatus>>>((accumulator, role) => {
    const statusRaw = toRecord(roleStatusesRaw?.[role]);
    accumulator[role] = {
      draftSavedAt: typeof statusRaw?.draft_saved_at === "string" ? statusRaw.draft_saved_at : null,
      userId: typeof statusRaw?.user_id === "string" ? statusRaw.user_id : null,
      memberLabel: typeof statusRaw?.member_label === "string" ? statusRaw.member_label : null,
    };
    return accumulator;
  }, {});
}

function applyRoleOwnedFields(
  baseForm: ExtendedDecisionForm,
  nextForm: ExtendedDecisionForm,
  role: TeamMemberRole | null
) {
  if (!role) return baseForm;
  if (role === "project_director") return nextForm;

  const merged: ExtendedDecisionForm = { ...baseForm };
  const mergedRecord = merged as Record<
    keyof ExtendedDecisionForm,
    ExtendedDecisionForm[keyof ExtendedDecisionForm]
  >;
  for (const field of ownedFormFields[role]) {
    mergedRecord[field] = nextForm[field];
  }
  return merged;
}

function mergeDilemmaSelectionsByRole(
  currentSelections: DilemmaSelectionMap,
  latestSelections: DilemmaSelectionMap,
  role: TeamMemberRole | null,
  dilemmas: Dilemma[]
) {
  if (!role) return latestSelections;
  if (role === "project_director") return currentSelections;

  const merged = { ...latestSelections };
  for (const dilemma of dilemmas) {
    if (dilemmaCategoryOwnership[dilemma.category] !== role) continue;
    const nextSelection = currentSelections[dilemma.id];
    if (nextSelection) {
      merged[dilemma.id] = nextSelection;
    } else {
      delete merged[dilemma.id];
    }
  }
  return merged;
}

function buildCoordinationPayload(
  existingState: Partial<Record<TeamMemberRole, CoordinationStatus>>,
  currentRole: TeamMemberRole | null,
  assignments: Partial<Record<TeamMemberRole, TeamRoleAssignment>>,
  userId: string,
  savedAt: string | null
) {
  const nextState = { ...existingState };

  for (const role of TEAM_MEMBER_ROLES) {
    const assignment = assignments[role];
    const previous = existingState[role];
    nextState[role] = {
      draftSavedAt: previous?.draftSavedAt ?? null,
      userId: assignment?.userId ?? previous?.userId ?? null,
      memberLabel: assignment?.memberLabel ?? previous?.memberLabel ?? null,
    };
  }

  if (currentRole) {
    nextState[currentRole] = {
      draftSavedAt: savedAt,
      userId,
      memberLabel: assignments[currentRole]?.memberLabel ?? nextState[currentRole]?.memberLabel ?? null,
    };
  }

  return nextState;
}

function serializeCoordinationState(state: Partial<Record<TeamMemberRole, CoordinationStatus>>) {
  return {
    role_statuses: Object.fromEntries(
      TEAM_MEMBER_ROLES.map((role) => [
        role,
        {
          draft_saved_at: state[role]?.draftSavedAt ?? null,
          user_id: state[role]?.userId ?? null,
          member_label: state[role]?.memberLabel ?? null,
        },
      ])
    ),
  };
}

function extractDecisionState(row: ExistingDecisionRow | null) {
  if (!row) {
    return {
      form: defaultForm,
      selectedDilemmaOptionIds: {} as DilemmaSelectionMap,
      eventsChosen: {} as Record<string, string>,
      forecast: DEFAULT_FORECAST,
      coordinationState: {} as Partial<Record<TeamMemberRole, CoordinationStatus>>,
      locked: false,
    };
  }

  const parsedProfile = parseDecisionProfile(row.raw);
  const storedDilemmaSummary = parseStoredDilemmaSummary(row.raw);
  const warRoomV2 = toRecord(row.raw?.war_room_v2);

  const selectedDilemmaOptionIds =
    storedDilemmaSummary?.selected.reduce<DilemmaSelectionMap>((accumulator, selection) => {
      accumulator[selection.dilemma_id] = selection.option_id;
      return accumulator;
    }, {}) ?? {};

  const eventsChosen: Record<string, string> = {};
  const storedEvents = Array.isArray(warRoomV2?.eventsChosen) ? warRoomV2.eventsChosen : [];
  for (const entry of storedEvents) {
    const eventRecord = toRecord(entry);
    if (typeof eventRecord?.eventId === "string" && typeof eventRecord.choiceId === "string") {
      eventsChosen[eventRecord.eventId] = eventRecord.choiceId;
    }
  }

  const forecast = (() => {
    const forecastRaw = toRecord(warRoomV2?.forecast);
    if (!forecastRaw) return DEFAULT_FORECAST;
    return {
      predicted_schedule_index:
        toNumberOrNull(forecastRaw.predicted_schedule_index) ?? DEFAULT_FORECAST.predicted_schedule_index,
      predicted_cost_index:
        toNumberOrNull(forecastRaw.predicted_cost_index) ?? DEFAULT_FORECAST.predicted_cost_index,
      confidence: toNumberOrNull(forecastRaw.confidence) ?? DEFAULT_FORECAST.confidence,
    };
  })();

  return {
    form: {
      ...defaultForm,
      ...parsedProfile,
      focus_cost: row.focus_cost,
      focus_quality: row.focus_quality,
      focus_stakeholder: row.focus_stakeholder,
      focus_speed: row.focus_speed,
      risk_appetite: row.risk_appetite,
      governance_intensity: row.governance_intensity,
      buffer_percent: row.buffer_percent,
      vendor_strategy: row.vendor_strategy,
    },
    selectedDilemmaOptionIds,
    eventsChosen,
    forecast,
    coordinationState: parseCoordinationState(row.raw),
    locked: Boolean(row.locked),
  };
}

function DecisionOwnershipGate({
  decisionKey,
  currentRole,
  roleAssignments,
  children,
  className = "",
}: {
  decisionKey: string;
  currentRole: TeamMemberRole | null;
  roleAssignments: Partial<Record<TeamMemberRole, TeamRoleAssignment>>;
  children: ReactNode;
  className?: string;
}) {
  const ownerRole = getDecisionOwner(decisionKey);
  const isOwned = ownerRole ? currentRole === "project_director" || currentRole === ownerRole : true;
  const ownerName = getRoleName(ownerRole);
  const ownerMember = ownerRole ? roleAssignments[ownerRole]?.memberLabel ?? ownerName : "Shared";

  return (
    <div className={`relative ${className}`}>
      <div className={!isOwned ? "pointer-events-none opacity-50 saturate-50" : ""}>{children}</div>
      {!isOwned && ownerRole ? (
        <div className="pointer-events-none absolute inset-0 flex items-start justify-between rounded-2xl border border-slate-600/70 bg-slate-950/35 px-3 py-3">
          <div className="rounded-xl border border-slate-500/60 bg-slate-950/90 px-3 py-2 text-xs">
            <div className="font-bold uppercase tracking-[0.18em] text-slate-200">Owned by: {ownerName}</div>
            <div className="mt-1 text-slate-400">Request input from {ownerMember}.</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function buildDecisionPersistencePayload(params: {
  sessionId: string;
  teamId: string;
  roundNumber: number;
  form: ExtendedDecisionForm;
  activeStep: StepIndex;
  focusSum: number;
  readinessScore: number;
  budget: BudgetBreakdown;
  resolvedRoundEvents: ConstructionEvent[];
  deckEvents: GameEvent[];
  eventsChosen: Record<string, string>;
  forecast: ForecastState;
  dilemmaSummary: DilemmaRoundSummary;
  coordinationState: Partial<Record<TeamMemberRole, CoordinationStatus>>;
  locked: boolean;
  submittedAt: string | null;
}) {
  const {
    sessionId,
    teamId,
    roundNumber,
    form,
    activeStep,
    focusSum,
    readinessScore,
    budget,
    resolvedRoundEvents,
    deckEvents,
    eventsChosen,
    forecast,
    dilemmaSummary,
    coordinationState,
    locked,
    submittedAt,
  } = params;
  const core = buildCoreDecision(form);
  const profileSnapshot = extractProfile(form);

  return {
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
        eventsShown: deckEvents.map((event) => event.id),
        eventsChosen: Object.entries(eventsChosen).map(([eventId, choiceId]) => ({ eventId, choiceId })),
        forecast,
      },
      management_dilemmas: dilemmaSummary,
      team_coordination: serializeCoordinationState(coordinationState),
    },
    locked,
    submitted_at: submittedAt,
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
    <span className="inline-flex items-center gap-2">
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

function ChecklistPopover({
  title,
  buttonLabel,
  items,
}: {
  title: string;
  buttonLabel: string;
  items: ChecklistItem[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const incompleteCount = items.filter((item) => !item.pass).length;

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  return (
    <div ref={wrapperRef} className="relative inline-flex">
      <button
        type="button"
        aria-expanded={isOpen}
        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-slate-950/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-sky-200 transition hover:border-sky-400/40 hover:text-white"
        onClick={() => setIsOpen((current) => !current)}
      >
        <span>{buttonLabel}</span>
        <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${incompleteCount > 0 ? "bg-amber-500/20 text-amber-300" : "bg-emerald-500/20 text-emerald-300"}`}>
          {incompleteCount}
        </span>
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl border border-white/10 bg-slate-950/95 p-4 shadow-2xl shadow-slate-950/40">
          <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-200">{title}</div>
          <div className="mt-3 space-y-2">
            {items.map((item) => (
              <div
                key={item.label}
                className={`flex items-start gap-3 rounded-xl border px-3 py-2 text-xs ${
                  item.pass
                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-100"
                    : "border-rose-500/20 bg-rose-500/10 text-rose-100"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-0.5 inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${
                    item.pass ? "bg-emerald-400" : "bg-rose-400"
                  }`}
                />
                <span>{item.pass ? item.label : `Complete: ${item.remainingLabel ?? item.label}`}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
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

function riskBadgeTone(level: DilemmaOption["risk_level"]) {
  if (level === "low") return "border-emerald-400/30 bg-emerald-500/15 text-emerald-100";
  if (level === "medium") return "border-amber-400/30 bg-amber-500/15 text-amber-100";
  return "border-rose-400/30 bg-rose-500/15 text-rose-100";
}

function formatImpactChip(label: string, value: number, decimals = 0) {
  const roundedValue = decimals > 0 ? value.toFixed(decimals) : `${Math.round(value)}`;
  const arrow = value >= 0 ? "↑" : "↓";
  const sign = value > 0 ? "+" : "";
  return `${arrow} ${label} ${sign}${roundedValue}`;
}

function buildImpactPreview(option: DilemmaOption) {
  const candidates = [
    { label: "SPI", value: option.impact.spi, decimals: 2 },
    { label: "CPI", value: option.impact.cpi, decimals: 2 },
    { label: "Safety", value: option.impact.safety, decimals: 0 },
    { label: "Stakeholder", value: option.impact.stakeholder, decimals: 0 },
    { label: "Cash", value: option.impact.cash, decimals: 0 },
  ]
    .filter((item) => Math.abs(item.value) > 0)
    .sort((left, right) => Math.abs(right.value) - Math.abs(left.value))
    .slice(0, 2);

  if (candidates.length === 0) return "No material impact preview";
  return candidates.map((item) => formatImpactChip(item.label, item.value, item.decimals)).join(" | ");
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
  const [companyName, setCompanyName] = useState("Project Team");
  const [currentRole, setCurrentRole] = useState<TeamMemberRole | null>(null);
  const [isSolo, setIsSolo] = useState(false);
  const [roleAssignments, setRoleAssignments] = useState<Partial<Record<TeamMemberRole, TeamRoleAssignment>>>({});
  const [coordinationState, setCoordinationState] = useState<Partial<Record<TeamMemberRole, CoordinationStatus>>>({});
  const [sessionRoundCount, setSessionRoundCount] = useState(0);
  const [stepProjectContext, setStepProjectContext] = useState<StepProjectContext>(
    DEFAULT_STEP_PROJECT_CONTEXT
  );
  const [identityProfile, setIdentityProfile] = useState<InboxIdentityProfile>({});
  const [previousInboxSignals, setPreviousInboxSignals] = useState<InboxPreviousRound>({});
  const [carryoverState, setCarryoverState] = useState<CarryoverState>(DEFAULT_CARRYOVER_STATE);
  const [sharedRoundEvents, setSharedRoundEvents] = useState<ConstructionEvent[] | null>(null);

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
  const [navigationNotice, setNavigationNotice] = useState<{ id: number; message: string } | null>(null);

  const [clockNow, setClockNow] = useState(Date.now());
  const [roundDeadlineIso, setRoundDeadlineIso] = useState<string | null>(null);
  const [roundClockSource, setRoundClockSource] = useState<RoundClockSource>("fallback");
  const [roundStatus, setRoundStatus] = useState<"pending" | "open" | "closed">("pending");
  const [lockedTeamsCount, setLockedTeamsCount] = useState(0);
  const [totalTeamsCount, setTotalTeamsCount] = useState(0);

  const [activeStep, setActiveStep] = useState<StepIndex>(0);
  const [form, setForm] = useState<ExtendedDecisionForm>(defaultForm);
  const [selectedDilemmaOptionIds, setSelectedDilemmaOptionIds] = useState<DilemmaSelectionMap>({});
  const [previousRoundPerformance, setPreviousRoundPerformance] = useState<PreviousRoundPerformanceRow | null>(null);
  const [showPortfolioContext, setShowPortfolioContext] = useState(false);
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

  const roundEvents = useMemo(
    () =>
      resolveRoundConstructionEvents({
        sessionId,
        roundNumber,
        sharedEvents: sharedRoundEvents,
        carryoverState,
      }),
    [carryoverState, roundNumber, sessionId, sharedRoundEvents]
  );
  const [resolvedRoundEvents, setResolvedRoundEvents] = useState<ConstructionEvent[]>(roundEvents);

  const focusSum = form.focus_cost + form.focus_quality + form.focus_stakeholder + form.focus_speed;
  const kpiReady = roundNumber !== 1 || Boolean(teamKpiTarget || draftKpiTarget);
  const eventDeckReady = deckEvents.every((event) => Boolean(eventsChosen[event.id]));
  const profile = useMemo(() => extractProfile(form), [form]);
  const roundDilemmas = useMemo<Dilemma[]>(
    () =>
      selectDilemmasForRound({
        session_id: sessionId || "preview-session",
        round_number: roundNumber,
        scenario_type: stepProjectContext.scenarioType,
        previous_round_performance: previousRoundPerformance,
      }),
    [previousRoundPerformance, roundNumber, sessionId, stepProjectContext.scenarioType]
  );
  const selectedDilemmaCount = useMemo(
    () => roundDilemmas.filter((dilemma) => Boolean(selectedDilemmaOptionIds[dilemma.id])).length,
    [roundDilemmas, selectedDilemmaOptionIds]
  );
  const derivedManagementFields = useMemo(
    () => deriveManagementFields(roundDilemmas, selectedDilemmaOptionIds),
    [roundDilemmas, selectedDilemmaOptionIds]
  );
  const dilemmaSummary = useMemo(
    () => buildDilemmaRoundSummary(roundDilemmas, selectedDilemmaOptionIds, stepProjectContext.scenarioType, roundNumber),
    [roundDilemmas, roundNumber, selectedDilemmaOptionIds, stepProjectContext.scenarioType]
  );
  const budget: BudgetBreakdown = useMemo(() => estimateBudgetBreakdown(profile), [profile]);
  const totalRounds = Math.max(stepProjectContext.totalRounds, sessionRoundCount, roundNumber, 1);
  const roundsRemaining = Math.max(totalRounds - roundNumber, 0);
  const effectiveRole = isSolo ? "project_director" : currentRole;
  const canEditField = (fieldOwner: TeamMemberRole | string | null | undefined) =>
    isSolo || effectiveRole === "project_director" || effectiveRole === fieldOwner;
  const canEditDecision = (decisionKey: string) => canEditField(getDecisionOwner(decisionKey));
  const isProjectDirector = effectiveRole === "project_director";
  const ownedAreaLabels = isSolo ? ["All decision areas (solo mode)"] : getRoleOwnedAreas(effectiveRole);
  const assignedOtherRoles = TEAM_MEMBER_ROLES.filter((role) => role !== effectiveRole && Boolean(roleAssignments[role]));
  const coordinationReadyRoles = TEAM_MEMBER_ROLES.filter(
    (role) => roleAssignments[role] && coordinationState[role]?.draftSavedAt
  );
  const allAssignedRolesReady =
    isSolo ||
    (Object.keys(roleAssignments).length > 0 &&
      TEAM_MEMBER_ROLES.every((role) => !roleAssignments[role] || Boolean(coordinationState[role]?.draftSavedAt)));
  const coordinationWaitingRoles = isSolo
    ? []
    : TEAM_MEMBER_ROLES.filter((role) => roleAssignments[role] && !coordinationState[role]?.draftSavedAt);

  useEffect(() => {
    setResolvedRoundEvents(roundEvents);
  }, [roundEvents]);

  useEffect(() => {
    setForm((previousForm) => {
      if (
        previousForm.bid_aggressiveness === derivedManagementFields.bid_aggressiveness &&
        previousForm.risk_appetite === derivedManagementFields.risk_appetite &&
        previousForm.governance_intensity === derivedManagementFields.governance_intensity &&
        previousForm.public_message_tone === derivedManagementFields.public_message_tone
      ) {
        return previousForm;
      }

      return {
        ...previousForm,
        bid_aggressiveness: derivedManagementFields.bid_aggressiveness,
        risk_appetite: derivedManagementFields.risk_appetite,
        governance_intensity: derivedManagementFields.governance_intensity,
        public_message_tone: derivedManagementFields.public_message_tone,
      };
    });
  }, [derivedManagementFields]);
  const stepChecklists: Record<StepIndex, ChecklistItem[]> = {
    0: [
      {
        label: "Focus allocation totals exactly 100",
        pass: focusSum === 100,
        remainingLabel: "Balance focus allocation to exactly 100",
      },
      {
        label: "Strategic posture selected",
        pass: Boolean(form.strategic_posture),
        remainingLabel: "Select Strategic Posture",
      },
      ...(deckEvents.length > 0
        ? [
            {
              label: "Event deck decisions completed",
              pass: eventDeckReady,
              remainingLabel: "Decide all event deck actions",
            },
          ]
        : []),
    ],
    1: [
      {
        label: "All management dilemmas have a decision",
        pass: selectedDilemmaCount === roundDilemmas.length,
        remainingLabel: `Choose an option for all ${roundDilemmas.length} dilemma cards`,
      },
      {
        label: "Primary sector selected",
        pass: Boolean(form.primary_sector),
        remainingLabel: "Select primary sector",
      },
      {
        label: "Secondary sector does not duplicate the primary sector",
        pass: form.secondary_sector === "None" || form.secondary_sector !== form.primary_sector,
        remainingLabel: "Keep secondary sector different from the primary sector",
      },
    ],
    2: [
      {
        label: "Training intensity is at least 20",
        pass: form.training_intensity >= 20,
        remainingLabel: "Raise training intensity to at least 20",
      },
      {
        label: "Innovation budget index is at least 25",
        pass: form.innovation_budget_index >= 25,
        remainingLabel: "Raise innovation budget index to at least 25",
      },
      {
        label: "Self-perform share is between 30 and 90",
        pass: form.self_perform_percent >= 30 && form.self_perform_percent <= 90,
        remainingLabel: "Keep self-perform share between 30% and 90%",
      },
    ],
    3: [
      {
        label: "Inventory cover is at least 2 weeks",
        pass: form.inventory_cover_weeks >= 2,
        remainingLabel: "Increase inventory cover to at least 2 weeks",
      },
      {
        label: "Community engagement is at least 30",
        pass: form.community_engagement >= 30,
        remainingLabel: "Raise community engagement to at least 30",
      },
      {
        label: "Work-life balance index is at least 25",
        pass: form.work_life_balance_index >= 25,
        remainingLabel: "Raise work-life balance index to at least 25",
      },
    ],
    4: [
      {
        label: "Cash buffer is at least 2 months",
        pass: form.cash_buffer_months >= 2,
        remainingLabel: "Increase cash buffer to at least 2 months",
      },
      {
        label: "Contingency fund is at least 4%",
        pass: form.contingency_fund_percent >= 4,
        remainingLabel: "Increase contingency fund to at least 4%",
      },
      {
        label: "High-risk facilitation budget stays controlled",
        pass: form.compliance_posture !== "High-Risk Facilitation" || form.facilitation_budget_index <= 60,
        remainingLabel: "Reduce facilitation risk budget to 60 or below",
      },
    ],
  };

  const stepValidations: Record<StepIndex, boolean> = {
    0: stepChecklists[0].every((check) => check.pass),
    1: stepChecklists[1].every((check) => check.pass),
    2: stepChecklists[2].every((check) => check.pass),
    3: stepChecklists[3].every((check) => check.pass),
    4: stepChecklists[4].every((check) => check.pass),
  };

  const readinessChecks: ChecklistItem[] = [
    {
      label: "Focus allocation totals exactly 100",
      pass: focusSum === 100,
      remainingLabel: "Balance focus allocation to exactly 100",
    },
    {
      label: "Team KPI target selected in Round 1",
      pass: roundNumber !== 1 || Boolean(teamKpiTarget || draftKpiTarget),
      remainingLabel: "Select Team KPI target in Round 1",
    },
    {
      label: "Strategic posture selected",
      pass: Boolean(form.strategic_posture),
      remainingLabel: "Select Strategic Posture",
    },
    {
      label: "Event deck decisions completed when events are present",
      pass: deckEvents.length === 0 || eventDeckReady,
      remainingLabel: "Decide all event deck actions",
    },
    {
      label: "Primary sector selected and secondary sector not duplicated",
      pass: form.secondary_sector === "None" || form.secondary_sector !== form.primary_sector,
      remainingLabel: "Select a primary sector and keep the secondary sector unique",
    },
    {
      label: "Management dilemma choices completed",
      pass: selectedDilemmaCount === roundDilemmas.length,
      remainingLabel: `Commit all ${roundDilemmas.length} management decisions`,
    },
    {
      label: "Expansion not overloaded by workforce",
      pass:
        form.market_expansion === "Consolidate Existing Regions" ||
        form.workforce_plan !== "Lean Core Team",
      remainingLabel: "Avoid pairing expansion with a lean core team",
    },
    {
      label: "Aggressive risk has contingency cover",
      pass: form.risk_appetite !== "Aggressive" || form.contingency_fund_percent >= 8,
      remainingLabel: "Increase contingency fund to at least 8% for aggressive risk",
    },
    {
      label: "Make-vs-buy mix is in stable operating range",
      pass: form.self_perform_percent >= 35 && form.self_perform_percent <= 85,
      remainingLabel: "Keep self-perform share between 35% and 85%",
    },
    {
      label: "P&M utilization not in overload zone",
      pass: form.pm_utilization_target <= 88,
      remainingLabel: "Reduce P&M utilization target to 88% or lower",
    },
    {
      label: "Quality guardrails align with speed",
      pass: form.focus_speed <= 35 || form.qa_audit_frequency !== "Monthly",
      remainingLabel: "Increase QA cadence when speed focus is above 35",
    },
    {
      label: "Compliance risk budget controlled",
      pass: form.compliance_posture !== "High-Risk Facilitation" || form.facilitation_budget_index <= 40,
      remainingLabel: "Reduce facilitation risk budget to 40 or lower",
    },
    {
      label: "Liquidity protection for current budget pressure",
      pass: budget.total_budget_pressure < 4800000 || form.cash_buffer_months >= 4,
      remainingLabel: "Increase cash buffer to at least 4 months under current budget pressure",
    },
  ];

  const readinessScore = Math.round(
    (readinessChecks.filter((check) => check.pass).length / readinessChecks.length) * 100
  );
  const readinessMissingChecks = readinessChecks.filter((check) => !check.pass);
  const readinessRemainingText = readinessMissingChecks.length
    ? readinessMissingChecks.map((check) => `Complete: ${check.remainingLabel ?? check.label}`).join(" • ")
    : "Nothing blocking readiness right now.";

  function update<K extends keyof ExtendedDecisionForm>(key: K, value: ExtendedDecisionForm[K]) {
    setHasUnsavedChanges(true);
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateDilemmaChoice(dilemmaId: string, optionId: string) {
    setHasUnsavedChanges(true);
    setSelectedDilemmaOptionIds((previousChoices) => ({ ...previousChoices, [dilemmaId]: optionId }));
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

  function navigateToStep(nextStep: StepIndex, source: string) {
    console.log("Step nav clicked, going to step:", nextStep, "from:", source);
    setActiveStep(nextStep);
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
    if (!navigationNotice) return;

    const timeoutId = window.setTimeout(() => {
      setNavigationNotice(null);
    }, 3200);

    return () => window.clearTimeout(timeoutId);
  }, [navigationNotice]);

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
    if (!isProjectDirector) {
      if (requireForRoundOne && roundNumber === 1) {
        throw new Error("Only the Project Director can set the team KPI target in Step 1.");
      }
      return teamKpiTarget;
    }

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
      carryoverState,
    });
  }, [carryoverState, form, profile, resolvedRoundEvents, roundNumber, sessionId, teamId]);
  const inboxMessages = useMemo(
    () =>
      generateProjectInboxMessages({
        sessionId,
        roundNumber,
        clientName: stepProjectContext.client,
        companyName,
        identityProfile: {
          ...identityProfile,
          company_name: companyName,
          scenario_name: stepProjectContext.projectName,
        },
        previousRound: previousInboxSignals,
        carryoverState,
      }),
    [
      carryoverState,
      companyName,
      identityProfile,
      previousInboxSignals,
      roundNumber,
      sessionId,
      stepProjectContext.client,
      stepProjectContext.projectName,
    ]
  );

  const msLeft = roundDeadlineIso ? Date.parse(roundDeadlineIso) - clockNow : null;
  const lockWindowExpired = msLeft !== null && msLeft <= 0;

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

    const applySharedRoundState = (row: SessionRoundRow | null) => {
      if (!row) {
        if (!cancelled) {
          setRoundClockSource("shared");
          setRoundStatus("pending");
          setRoundDeadlineIso(null);
          setSharedRoundEvents(null);
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
        setSharedRoundEvents(parseRoundEventsPayload(row.news_payload));
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

      applySharedRoundState(roundRowData as SessionRoundRow | null);
    };

    syncSharedRoundState();
    const intervalId = window.setInterval(syncSharedRoundState, 10000);
    const roundChannel = supabase
      .channel(`session-rounds:${sessionId}:${roundNumber}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "session_rounds",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const nextRecord =
            payload.new && typeof payload.new === "object" ? (payload.new as Record<string, unknown>) : null;
          const previousRecord =
            payload.old && typeof payload.old === "object" ? (payload.old as Record<string, unknown>) : null;
          const candidateRecord = nextRecord ?? previousRecord;

          if (!candidateRecord) return;
          if (candidateRecord.session_id !== sessionId) return;
          if (Number(candidateRecord.round_number) !== roundNumber) return;

          if (payload.eventType === "DELETE") {
            applySharedRoundState(null);
            return;
          }

          applySharedRoundState({
            session_id: sessionId,
            round_number: roundNumber,
            deadline_at: typeof candidateRecord.deadline_at === "string" ? candidateRecord.deadline_at : null,
            status: typeof candidateRecord.status === "string" ? candidateRecord.status : null,
            news_payload: candidateRecord.news_payload,
          });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      void supabase.removeChannel(roundChannel);
    };
  }, [roundNumber, sessionId, supabase, teamId, userId]);

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
      setCurrentRole(null);
      setIsSolo(false);
      setRoleAssignments({});
      setCoordinationState({});
      setStepProjectContext(DEFAULT_STEP_PROJECT_CONTEXT);
      setSelectedDilemmaOptionIds({});
      setPreviousRoundPerformance(null);
      setCarryoverState(DEFAULT_CARRYOVER_STATE);
      setSharedRoundEvents(null);

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
        .select("team_id,member_role")
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
        .select("id,team_name,session_id,kpi_target,scenario_id,identity_profile")
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
      const viewerMembership = memberships.find((membership) => membership.team_id === myTeam.id) ?? null;
      setTeamId(myTeam.id);
      setTeamName(myTeam.team_name);
      setCompanyName(myTeam.identity_profile?.company_name?.trim() || myTeam.team_name || "Project Team");
      setCurrentRole(viewerMembership?.member_role ?? null);
      const parsedKpi = parseKpiTarget(myTeam.kpi_target);
      setTeamKpiTarget(parsedKpi);
      setDraftKpiTarget(parsedKpi);

      const { data: teamMembershipRows, error: teamMembershipErr } = await supabase
        .from("team_memberships")
        .select("user_id,team_role,is_team_lead,member_role")
        .eq("team_id", myTeam.id);

      if (teamMembershipErr) {
        setError(teamMembershipErr.message);
        setLoading(false);
        return;
      }
      const teamMembershipList = (teamMembershipRows ?? []) as TeamMembershipRoleRow[];
      setIsSolo(teamMembershipList.length === 1);

      const viewerLabel =
        (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name) ||
        (typeof user.user_metadata?.name === "string" && user.user_metadata.name) ||
        user.email?.split("@")[0] ||
        "You";

      const assignments = teamMembershipList.reduce<
        Partial<Record<TeamMemberRole, TeamRoleAssignment>>
      >((accumulator, member) => {
        if (!member.member_role) return accumulator;
        accumulator[member.member_role] = {
          userId: member.user_id,
          memberLabel: formatMemberLabel(member, user.id, viewerLabel),
        };
        return accumulator;
      }, {});
      setRoleAssignments(assignments);

      const identityProfile =
        myTeam.identity_profile && typeof myTeam.identity_profile === "object"
          ? myTeam.identity_profile
          : {};
      setIdentityProfile(identityProfile);
      const positioningStrategy = toText(identityProfile.positioning_strategy, "Not selected");
      let nextProjectContext: StepProjectContext = {
        ...DEFAULT_STEP_PROJECT_CONTEXT,
        positioningStrategy,
        totalRounds: Math.max(sessionRow.round_count ?? 0, roundNumber, 1),
      };

      if (myTeam.scenario_id) {
        const { data: scenarioData } = await supabase
          .from("project_scenarios")
          .select("name,client,base_budget_cr,duration_rounds,complexity")
          .eq("id", myTeam.scenario_id)
          .maybeSingle();

        const scenario = (scenarioData as ScenarioRow | null) ?? null;
        const projectName = toText(scenario?.name, DEFAULT_STEP_PROJECT_CONTEXT.projectName);

        nextProjectContext = {
          projectName,
          client: toText(scenario?.client, DEFAULT_STEP_PROJECT_CONTEXT.client),
          scenarioType: getScenarioTypeLabel(projectName),
          positioningStrategy,
          complexity: formatScenarioComplexity(scenario?.complexity),
          baseBudgetCr: toNumberOrNull(scenario?.base_budget_cr),
          totalRounds: Math.max(scenario?.duration_rounds ?? 0, sessionRow.round_count ?? 0, roundNumber, 1),
        };
      }

      setStepProjectContext(nextProjectContext);

      if (roundNumber > 1) {
        const { data: previousResultData, error: previousResultError } = await supabase
          .from("team_results")
          .select("schedule_index,cost_index,safety_score,stakeholder_score,ld_triggered,carryover_state")
          .eq("session_id", sessionId)
          .eq("team_id", myTeam.id)
          .eq("round_number", roundNumber - 1)
          .maybeSingle();

        if (previousResultError) {
          setError(previousResultError.message);
          setLoading(false);
          return;
        }

        const previousResult =
          previousResultData && typeof previousResultData === "object"
            ? (previousResultData as Record<string, unknown>)
            : null;

        setPreviousRoundPerformance({
          spi: typeof previousResult?.schedule_index === "number" ? previousResult.schedule_index : null,
          cpi: typeof previousResult?.cost_index === "number" ? previousResult.cost_index : null,
        });

        setPreviousInboxSignals({
          spi: toNumberOrNull(previousResult?.schedule_index),
          cpi: toNumberOrNull(previousResult?.cost_index),
          safety: toNumberOrNull(previousResult?.safety_score),
          stakeholder: toNumberOrNull(previousResult?.stakeholder_score),
          ld_triggered:
            typeof previousResult?.ld_triggered === "boolean" ? previousResult.ld_triggered : false,
        });
        setCarryoverState(parseCarryoverState(previousResult?.carryover_state));
      } else {
        setPreviousInboxSignals({});
        setPreviousRoundPerformance(null);
        setCarryoverState(DEFAULT_CARRYOVER_STATE);
      }

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
        const extractedState = extractDecisionState(existing);

        setForm(extractedState.form);
        setSelectedDilemmaOptionIds(extractedState.selectedDilemmaOptionIds);
        setEventsChosen(extractedState.eventsChosen);
        setForecast(extractedState.forecast);
        setCoordinationState(extractedState.coordinationState);

        const storedEvents = parseConstructionEvents(existing.raw?.events);
        if (storedEvents && storedEvents.length > 0) {
          setResolvedRoundEvents(storedEvents);
        }

        const savedStepRaw = (existing.raw as { active_step?: unknown } | null)?.active_step;
        const savedStep =
          typeof savedStepRaw === "number" && savedStepRaw >= 0 && savedStepRaw <= 4
            ? (savedStepRaw as StepIndex)
            : 0;

        setActiveStep(savedStep);
        activeStepRef.current = savedStep;
        stepStartRef.current = Date.now();
        setLocked(extractedState.locked);
        setPromotionNotice("");
        setPromotionWarning("");
      } else {
        setLocked(false);
        setForm(defaultForm);
        setSelectedDilemmaOptionIds({});
        setEventsChosen({});
        setForecast(DEFAULT_FORECAST);
        setCoordinationState({});
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
      if (!effectiveRole) throw new Error("Your specialist role is not assigned yet. Complete identity setup first.");
      await ensureTeamKpiTarget(false);

      const { data: latestDecisionData, error: latestDecisionError } = await supabase
        .from("decisions")
        .select(
          "focus_cost,focus_quality,focus_stakeholder,focus_speed,risk_appetite,governance_intensity,buffer_percent,vendor_strategy,locked,raw"
        )
        .eq("session_id", sessionId)
        .eq("team_id", teamId)
        .eq("round_number", roundNumber)
        .maybeSingle();

      if (latestDecisionError) throw latestDecisionError;

      const latestState = extractDecisionState((latestDecisionData as ExistingDecisionRow | null) ?? null);
      const mergedForm = applyRoleOwnedFields(latestState.form, form, effectiveRole);
      const mergedDilemmaSelections = mergeDilemmaSelectionsByRole(
        selectedDilemmaOptionIds,
        latestState.selectedDilemmaOptionIds,
        effectiveRole,
        roundDilemmas
      );
      const mergedEventsChosen = canEditField("project_director") ? eventsChosen : latestState.eventsChosen;
      const mergedForecast = canEditField("finance_head") ? forecast : latestState.forecast;
      const savedAt = new Date().toISOString();
      const mergedCoordinationState = buildCoordinationPayload(
        latestState.coordinationState,
        effectiveRole,
        roleAssignments,
        userId,
        savedAt
      );
      const mergedDilemmaSummary = buildDilemmaRoundSummary(
        roundDilemmas,
        mergedDilemmaSelections,
        stepProjectContext.scenarioType,
        roundNumber
      );
      const mergedBudget = estimateBudgetBreakdown(extractProfile(mergedForm));
      const mergedFocusSum =
        mergedForm.focus_cost + mergedForm.focus_quality + mergedForm.focus_stakeholder + mergedForm.focus_speed;

      const { error: upErr } = await supabase.from("decisions").upsert(
        buildDecisionPersistencePayload({
          sessionId,
          teamId,
          roundNumber,
          form: mergedForm,
          activeStep,
          focusSum: mergedFocusSum,
          readinessScore,
          budget: mergedBudget,
          resolvedRoundEvents,
          deckEvents,
          eventsChosen: mergedEventsChosen,
          forecast: mergedForecast,
          dilemmaSummary: mergedDilemmaSummary,
          coordinationState: mergedCoordinationState,
          locked: false,
          submittedAt: null,
        }),
        { onConflict: "session_id,team_id,round_number" }
      );

      if (upErr) throw upErr;

      const timingSnapshot = buildStepTimingSnapshot();
      setStepDurationsMs(timingSnapshot);
      setHasUnsavedChanges(false);
      setForm(mergedForm);
      setSelectedDilemmaOptionIds(mergedDilemmaSelections);
      setEventsChosen(mergedEventsChosen);
      setForecast(mergedForecast);
      setCoordinationState(mergedCoordinationState);

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
      if (!isProjectDirector) throw new Error("Only the Project Director can lock and generate results.");
      if (!effectiveRole) throw new Error("Your specialist role is not assigned yet. Complete identity setup first.");
      if (!allAssignedRolesReady) {
        throw new Error(
          coordinationWaitingRoles.length > 0
            ? `Waiting on draft saves from ${formatRoleList(coordinationWaitingRoles)} before final lock.`
            : "Every assigned specialist must save a draft before the Project Director can lock."
        );
      }
      if (roundClockSource === "shared" && lockWindowExpired) {
        throw new Error("Round deadline has passed. Wait for facilitator to close and auto-lock.");
      }
      await ensureTeamKpiTarget(true);

      const { data: latestDecisionData, error: latestDecisionError } = await supabase
        .from("decisions")
        .select(
          "focus_cost,focus_quality,focus_stakeholder,focus_speed,risk_appetite,governance_intensity,buffer_percent,vendor_strategy,locked,raw"
        )
        .eq("session_id", sessionId)
        .eq("team_id", teamId)
        .eq("round_number", roundNumber)
        .maybeSingle();

      if (latestDecisionError) throw latestDecisionError;

      const latestState = extractDecisionState((latestDecisionData as ExistingDecisionRow | null) ?? null);
      const mergedForm = applyRoleOwnedFields(latestState.form, form, effectiveRole);
      const mergedDilemmaSelections = mergeDilemmaSelectionsByRole(
        selectedDilemmaOptionIds,
        latestState.selectedDilemmaOptionIds,
        effectiveRole,
        roundDilemmas
      );
      const mergedEventsChosen = canEditField("project_director") ? eventsChosen : latestState.eventsChosen;
      const mergedForecast = canEditField("finance_head") ? forecast : latestState.forecast;
      const mergedFocusSum =
        mergedForm.focus_cost + mergedForm.focus_quality + mergedForm.focus_stakeholder + mergedForm.focus_speed;
      if (mergedFocusSum !== 100) throw new Error(`Focus must total 100 (current: ${mergedFocusSum}).`);

      const submittedAt = new Date().toISOString();
      const latePenaltyPreview = computeLatePenalty(roundDeadlineIso, submittedAt, roundClockSource);
      const mergedCoordinationState = buildCoordinationPayload(
        latestState.coordinationState,
        effectiveRole,
        roleAssignments,
        userId,
        submittedAt
      );
      const mergedDilemmaSummary = buildDilemmaRoundSummary(
        roundDilemmas,
        mergedDilemmaSelections,
        stepProjectContext.scenarioType,
        roundNumber
      );
      const mergedBudget = estimateBudgetBreakdown(extractProfile(mergedForm));

      const { error: lockErr } = await supabase.from("decisions").upsert(
        buildDecisionPersistencePayload({
          sessionId,
          teamId,
          roundNumber,
          form: mergedForm,
          activeStep,
          focusSum: mergedFocusSum,
          readinessScore,
          budget: mergedBudget,
          resolvedRoundEvents,
          deckEvents,
          eventsChosen: mergedEventsChosen,
          forecast: mergedForecast,
          dilemmaSummary: mergedDilemmaSummary,
          coordinationState: mergedCoordinationState,
          locked: true,
          submittedAt,
        }),
        { onConflict: "session_id,team_id,round_number" }
      );

      if (lockErr) throw lockErr;
      await scoreRoundSecureClient({
        supabase,
        sessionId,
        roundNumber,
        teamId,
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
      setForm(mergedForm);
      setSelectedDilemmaOptionIds(mergedDilemmaSelections);
      setCoordinationState(mergedCoordinationState);

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
      const message = toErrorMessage(unknownError, "Failed to lock and generate results");
      console.error("Round lock failed", unknownError);
      setShowLockConfirmation(false);
      setError(message);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setLocking(false);
    }
  }

  const openLockConfirmation = () => {
    if (!isProjectDirector) {
      setError("Only the Project Director can lock and generate results.");
      return;
    }
    if (!allAssignedRolesReady) {
      setError(
        coordinationWaitingRoles.length > 0
          ? `Waiting on draft saves from ${formatRoleList(coordinationWaitingRoles)} before final lock.`
          : "Every assigned specialist must save a draft before the Project Director can lock."
      );
      return;
    }
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
        title: "Step 2 - Management Decisions",
        items: [
          {
            label: "Dilemma Choices",
            value:
              dilemmaSummary.selected.length > 0
                ? dilemmaSummary.selected
                    .map((selection) => `${selection.dilemma_title}: ${selection.option_label}`)
                    .join(" | ")
                : "No dilemma decisions selected yet",
          },
          {
            label: "Derived Management Posture",
            value: `${describeBidAggressiveness(form.bid_aggressiveness)} bidding, ${form.risk_appetite.toLowerCase()} risk appetite, ${form.governance_intensity.toLowerCase()} governance, and a ${form.public_message_tone.toLowerCase()} tone`,
          },
          {
            label: "Portfolio Context",
            value:
              form.secondary_sector === "None"
                ? `${form.primary_sector} focus with ${form.project_mix_public_pct}% public exposure and ${form.market_expansion.toLowerCase()}`
                : `${form.primary_sector} primary, ${form.secondary_sector} secondary, ${form.project_mix_public_pct}% public exposure, ${form.market_expansion.toLowerCase()}`,
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
      dilemmaSummary.selected,
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

  const getIncompleteStepMessage = (step: StepIndex) => {
    const missingChecks = stepChecklists[step].filter((check) => !check.pass);
    if (missingChecks.length === 0) return "";

    const summary = missingChecks
      .slice(0, 2)
      .map((check) => check.remainingLabel ?? check.label)
      .join("; ");
    const remainder = missingChecks.length > 2 ? `; plus ${missingChecks.length - 2} more item(s)` : "";

    return `Step ${step + 1} is incomplete - ${summary}${remainder}. Some fields may be missing.`;
  };

  const goToStep = (nextStep: StepIndex, source: string) => {
    if (nextStep > activeStep && !stepValidations[activeStep]) {
      const warningMessage = getIncompleteStepMessage(activeStep);
      if (warningMessage) {
        setNavigationNotice({ id: Date.now(), message: warningMessage });
      }
    }

    navigateToStep(nextStep, source);
  };

  const nextStep = () => {
    const candidate = Math.min(activeStep + 1, 4) as StepIndex;
    if (candidate !== activeStep) {
      goToStep(candidate, "next-button");
    }
  };

  const prevStep = () => {
    const candidate = Math.max(activeStep - 1, 0) as StepIndex;
    goToStep(candidate, "previous-button");
  };
  const handleFooterNext = () => {
    console.log("Footer Next clicked");
    const candidate = Math.min(activeStep + 1, 4) as StepIndex;
    if (candidate !== activeStep) {
      goToStep(candidate, "footer-next");
    }
  };
  const handleFooterPrevious = () => {
    const candidate = Math.max(activeStep - 1, 0) as StepIndex;
    goToStep(candidate, "footer-previous");
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
  const coordinationWaitingMessage = isSolo
    ? "Solo session - lock available when ready"
    : coordinationWaitingRoles.length > 0
      ? `Waiting on ${formatRoleList(coordinationWaitingRoles)} to save their specialist drafts.`
      : "Waiting for the team to complete role assignments.";
  const zeroDilemmaWarning =
    selectedDilemmaCount === 0
      ? isSolo
        ? {
            tone: "amber" as const,
            title: "Management decisions were skipped. Default outcomes applied.",
            body: "No Step 2 dilemmas were committed for this solo session. The simulator will apply default outcomes if you lock now.",
          }
        : {
            tone: "red" as const,
            title: "⚠️ No Management Decisions committed",
            body: "You have not committed any decisions in Step 2. This will apply default (lowest scoring) outcomes to all 3 management dilemmas. Your score will be penalised.",
          }
      : null;

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
            if (selectedDilemmaCount === 0) {
              navigateToStep(1, "lock-review-dilemmas");
              window.scrollTo({ top: 0, behavior: "smooth" });
              return;
            }
            navigateToStep(0, "lock-review");
          }}
          onConfirm={lockAndGenerateResults}
          reviewLabel={selectedDilemmaCount === 0 ? "Go Back and Decide" : "Review Decisions"}
          confirmLabel={selectedDilemmaCount === 0 && !isSolo ? "Lock Anyway - Accept Penalty" : "Confirm & Lock"}
          preflightWarning={zeroDilemmaWarning}
          isSubmitting={locking}
        />
        {navigationNotice ? (
          <div className="pointer-events-none fixed inset-x-4 top-[110px] z-[70] flex justify-center">
            <div
              role="status"
              aria-live="polite"
              className="pointer-events-auto max-w-xl rounded-2xl border border-amber-400/30 bg-amber-500/15 px-4 py-3 text-sm font-semibold text-amber-100 shadow-2xl shadow-slate-950/30 backdrop-blur"
            >
              {navigationNotice.message}
            </div>
          </div>
        ) : null}
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
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <ProjectInbox
                sessionId={sessionId}
                roundNumber={roundNumber}
                companyName={companyName}
                messages={inboxMessages}
              />
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
          </div>
        </header>

        {/* MAIN ZONE */}
        <main className="w-full max-w-[1180px] mx-auto p-4 md:p-6 space-y-6">
          {error && (
            <div
              role="alert"
              aria-live="assertive"
              className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400 shadow-inner"
            >
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
                <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,rgba(13,148,136,0.16),rgba(15,23,42,0.92))] px-5 py-5 shadow-[0_18px_45px_rgba(2,6,23,0.24)]">
                  <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-teal-300">Role Indicator</div>
                  <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="text-sm text-slate-200">
                      <span className="font-bold text-white">You are: {getRoleName(effectiveRole)}</span>
                      <span className="mx-2 text-slate-500">|</span>
                      <span>
                        You own: {ownedAreaLabels.length > 0 ? ownedAreaLabels.join(", ") : "No specialist areas assigned yet"}
                      </span>
                    </div>
                    <div className="rounded-full border border-white/10 bg-slate-950/60 px-4 py-2 text-xs font-semibold text-slate-300">
                      {isSolo
                        ? "Solo mode - all decisions unlocked"
                        : effectiveRole
                          ? getRoleLabel(effectiveRole)
                          : "Complete identity setup to unlock ownership"}
                    </div>
                  </div>
                  {isSolo ? (
                    <div className="mt-3 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
                      Solo mode - all decisions unlocked. In team play, decisions are split by role.
                    </div>
                  ) : null}
                  <div className="mt-3 text-sm text-slate-300">
                    {isSolo
                      ? "This is a solo session, so you can work across every decision area and lock when ready."
                      : assignedOtherRoles.length > 0
                      ? `Coordinate with your ${formatRoleList(assignedOtherRoles)} before locking.`
                      : "Coordinate with the rest of the team before locking."}
                  </div>
                </section>
                <TeamCoordPanel
                  currentRole={effectiveRole}
                  isSolo={isSolo}
                  assignments={roleAssignments}
                  statuses={coordinationState}
                  allRolesReady={allAssignedRolesReady}
                  canProjectDirectorLock={isProjectDirector && allAssignedRolesReady && !isLocked && !saving}
                  isLocked={locked}
                  locking={locking}
                  waitingMessage={coordinationWaitingMessage}
                  onLock={openLockConfirmation}
                />
                <div className="rounded-2xl border border-white/5 bg-slate-950/70 px-4 py-4 md:flex md:items-center md:justify-between md:gap-4 lg:hidden">
                  <div className="flex items-center gap-2">
                    {stepTitles.map((title, index) => {
                      const idx = index as StepIndex;
                      const current = activeStep === idx;
                      const complete = idx < activeStep || stepValidations[idx];
                      const ownsStep = roleOwnsStep(effectiveRole, idx + 1);
                      return (
                        <div
                          key={`tablet-step-${title}`}
                          className={`h-2.5 w-8 rounded-full transition-all ${
                            current ? (ownsStep ? "bg-teal-400" : "bg-slate-500") : complete ? (ownsStep ? "bg-teal-700" : "bg-slate-700") : ownsStep ? "bg-teal-950" : "bg-slate-800"
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
                          const ownsStep = roleOwnsStep(effectiveRole, idx + 1);
                          return (
                            <button
                              key={title}
                              onClick={() => goToStep(idx, "stepper-tab")}
                              className={`px-5 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-all ${
                                current
                                  ? ownsStep
                                    ? "border border-teal-300/30 bg-teal-500/15 text-white shadow-lg shadow-teal-500/10"
                                    : "border border-white/10 bg-slate-800 text-slate-200 shadow-lg shadow-slate-950/20"
                                  : ownsStep
                                    ? "border border-teal-900/50 bg-slate-900/50 text-teal-200 hover:border-teal-700 hover:bg-slate-800"
                                    : "border border-transparent bg-slate-900/50 text-slate-500 hover:bg-slate-800"
                              }`}
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
                        <StepContextBanner>
                          {`📍 ${stepProjectContext.projectName} | ${stepProjectContext.client} | Round ${roundNumber} of ${totalRounds}`}
                        </StepContextBanner>
                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Team KPI Target (4x points)</div>
                          <DecisionOwnershipGate decisionKey="team_kpi_target" currentRole={effectiveRole} roleAssignments={roleAssignments}>
                            {teamKpiTarget ? (
                              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400 font-bold shadow-inner flex justify-between items-center">
                                <span>LOCKED TARGET // {teamKpiTarget}</span>
                                {savingKpiTarget && <span className="text-emerald-400 animate-pulse text-xs">SAVING...</span>}
                              </div>
                            ) : roundNumber === 1 ? (
                              <div className="space-y-4">
                                <SegmentedControl options={KPI_TARGET_OPTIONS.map(k=>({value:k.value,text:k.value,hint:k.thresholdLabel}))} activeOption={draftKpiTarget} onSelect={(value) => setDraftKpiTarget(value)} disabled={isLocked || !canEditDecision("team_kpi_target")} />
                                <div className="pt-2"><Button variant="secondary" onClick={saveKpiTargetNow} disabled={isLocked || !draftKpiTarget || savingKpiTarget || !canEditDecision("team_kpi_target")}>{savingKpiTarget ? "SAVING..." : "LOCK KPI TARGET"}</Button></div>
                              </div>
                            ) : (
                              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400 shadow-inner">KPI TARGET NOT SET IN R1</div>
                            )}
                          </DecisionOwnershipGate>
                        </div>

                        {deckEvents.length > 0 && (
                          <DecisionOwnershipGate decisionKey="strategic_posture" currentRole={effectiveRole} roleAssignments={roleAssignments}>
                          <div className="p-5 rounded-2xl bg-slate-900/40 border border-teal-500/30 space-y-4">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-teal-500 flex items-center justify-between">
                              <span>Event Deck (Action Required)</span>
                              <span className="text-teal-400/50">{Object.keys(eventsChosen).length}/{deckEvents.length} Decided</span>
                            </div>
                            <div className="space-y-6">
                              {deckEvents.map(evt => (
                                <div key={evt.id} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/50">
                                  <img
                                    src={getDecisionEventImageUrl(evt.title)}
                                    alt={`${evt.title} context`}
                                    className="h-24 w-full object-cover"
                                    loading="lazy"
                                  />
                                  <div className="space-y-3 p-4">
                                    <div className="font-bold text-slate-200">{evt.title}</div>
                                    <div className="text-xs text-slate-400 mt-1 leading-relaxed">{evt.description}</div>
                                    <div className="pt-2">
                                      <SegmentedControl
                                        options={evt.choices.map(c => ({ value: c.id, text: c.label, hint: c.theoryHint }))}
                                        activeOption={eventsChosen[evt.id] || ""}
                                        onSelect={(v) => updateEventChoice(evt.id, v)}
                                        disabled={isLocked || !canEditField("project_director")}
                                      />
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                          </DecisionOwnershipGate>
                        )}

                        <DecisionOwnershipGate decisionKey="external_context" currentRole={effectiveRole} roleAssignments={roleAssignments}>
                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Live External Context</div>
                          <SegmentedControl
                            options={externalContextOptions.map((option) => ({
                              value: option.value,
                              text: `${option.icon} ${option.text}`,
                            }))}
                            activeOption={form.external_context}
                            onSelect={(v)=>update("external_context",v)}
                            disabled={isLocked || !canEditDecision("external_context")}
                          />
                        </div>
                        </DecisionOwnershipGate>

                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Focus Allocation</div>
                            <div className={`text-[10px] font-mono font-bold ${focusSum===100?"text-emerald-400":"text-rose-400"}`}>TOTAL: {focusSum}/100</div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DecisionOwnershipGate decisionKey="focus_cost" currentRole={effectiveRole} roleAssignments={roleAssignments}><DecisionSlider label={<FieldLabel label="Cost Focus" tooltip={decisionFieldTooltips.costFocus} />} value={form.focus_cost} min={0} max={100} onChange={v=>update("focus_cost",v)} disabled={isLocked || !canEditDecision("focus_cost")} /></DecisionOwnershipGate>
                            <DecisionOwnershipGate decisionKey="focus_quality" currentRole={effectiveRole} roleAssignments={roleAssignments}><DecisionSlider label={<FieldLabel label="Quality Focus" tooltip={decisionFieldTooltips.qualityFocus} />} value={form.focus_quality} min={0} max={100} onChange={v=>update("focus_quality",v)} disabled={isLocked || !canEditDecision("focus_quality")} /></DecisionOwnershipGate>
                            <DecisionOwnershipGate decisionKey="focus_stakeholder" currentRole={effectiveRole} roleAssignments={roleAssignments}><DecisionSlider label={<FieldLabel label="Stakeholder Focus" tooltip={decisionFieldTooltips.stakeholderFocus} />} value={form.focus_stakeholder} min={0} max={100} onChange={v=>update("focus_stakeholder",v)} disabled={isLocked || !canEditDecision("focus_stakeholder")} /></DecisionOwnershipGate>
                            <DecisionOwnershipGate decisionKey="focus_speed" currentRole={effectiveRole} roleAssignments={roleAssignments}><DecisionSlider label={<FieldLabel label="Speed Focus" tooltip={decisionFieldTooltips.speedFocus} />} value={form.focus_speed} min={0} max={100} onChange={v=>update("focus_speed",v)} disabled={isLocked || !canEditDecision("focus_speed")} /></DecisionOwnershipGate>
                          </div>
                        </div>
                        
                        <DecisionOwnershipGate decisionKey="strategic_posture" currentRole={effectiveRole} roleAssignments={roleAssignments}>
                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Strategic Posture</div>
                          <SegmentedControl options={postureOptions.map(o=>({value:o.value,text:o.text}))} activeOption={form.strategic_posture} onSelect={(v)=>update("strategic_posture",v)} disabled={isLocked || !canEditDecision("strategic_posture")} />
                        </div>
                        </DecisionOwnershipGate>
                     </div>
                   )}

                   {/* TAB CONTENT: STEP 2 */}
                   {activeStep === 1 && (
                     <div className="space-y-6 animate-in fade-in duration-300">
                        <StepContextBanner>
                          {`🏗️ Current portfolio: ${stepProjectContext.scenarioType} | Your strategy: ${stepProjectContext.positioningStrategy}`}
                        </StepContextBanner>
                        {isSolo ? (
                          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
                            Solo mode - all decisions unlocked. In team play, decisions are split by role.
                          </div>
                        ) : null}
                        <div className="rounded-[28px] border border-cyan-400/20 bg-gradient-to-br from-cyan-400/10 via-slate-950/90 to-slate-950 px-5 py-5 shadow-[0_18px_45px_rgba(2,6,23,0.32)]">
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="space-y-2">
                              <div className="text-[10px] font-bold uppercase tracking-[0.26em] text-cyan-300">Management Decisions - Round {roundNumber}</div>
                              <div className="text-2xl font-black uppercase tracking-tight text-white">MANAGEMENT DECISIONS - Round {roundNumber}</div>
                              <p className="max-w-2xl text-sm leading-6 text-slate-300">
                                Your team faces {roundDilemmas.length} decisions this round. Discuss before committing.
                              </p>
                            </div>
                            <div className="rounded-2xl border border-cyan-400/20 bg-slate-950/75 px-4 py-3 text-right">
                              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Committed</div>
                              <div className="mt-1 text-2xl font-black text-cyan-100">{selectedDilemmaCount}/{roundDilemmas.length}</div>
                            </div>
                          </div>
                          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-4">
                              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Bid posture</div>
                              <div className="mt-2 text-lg font-black text-white">{describeBidAggressiveness(form.bid_aggressiveness)}</div>
                              <div className="mt-1 text-xs text-slate-400">Engine value {form.bid_aggressiveness}/5</div>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-4">
                              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Risk appetite</div>
                              <div className="mt-2 text-lg font-black text-white">{form.risk_appetite}</div>
                              <div className="mt-1 text-xs text-slate-400">Derived from the choices above</div>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-4">
                              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Governance</div>
                              <div className="mt-2 text-lg font-black text-white">{form.governance_intensity}</div>
                              <div className="mt-1 text-xs text-slate-400">Tracks safety and stakeholder trade-offs</div>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-4">
                              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Message tone</div>
                              <div className="mt-2 text-lg font-black text-white">{form.public_message_tone}</div>
                              <div className="mt-1 text-xs text-slate-400">Auto-shaped by the stance you take</div>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-5">
                          {roundDilemmas.map((dilemma) => (
                            <div key={dilemma.id} className="rounded-[28px] border border-white/10 bg-slate-900/45 px-5 py-5 shadow-[0_18px_45px_rgba(2,6,23,0.22)]">
                              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                <div className="min-w-0 flex-1">
                                  <div className="text-xl font-black tracking-tight text-white">{dilemma.title}</div>
                                  <p className="mt-3 max-w-3xl text-sm italic leading-6 text-slate-400">{dilemma.situation}</p>
                                </div>
                                <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-100">
                                  {getCategoryLabel(dilemma.category)}
                                </div>
                              </div>

                              <div className="mt-5 grid gap-4 md:grid-cols-2">
                                {dilemma.options.map((option) => {
                                  const selected = selectedDilemmaOptionIds[dilemma.id] === option.id;
                                  const dilemmaOwnerKey = `dilemma_${dilemma.category}`;
                                  const dilemmaOwnedByCurrentRole = canEditDecision(dilemmaOwnerKey);

                                  return (
                                    <DecisionOwnershipGate decisionKey={dilemmaOwnerKey} currentRole={effectiveRole} roleAssignments={roleAssignments} key={option.id}>
                                    <button
                                      type="button"
                                      disabled={isLocked || !dilemmaOwnedByCurrentRole}
                                      title={buildImpactPreview(option)}
                                      onClick={() => updateDilemmaChoice(dilemma.id, option.id)}
                                      className={cn(
                                        "group relative flex min-h-[176px] cursor-pointer flex-col rounded-[24px] border px-4 py-4 text-left transition-all",
                                        selected
                                          ? "border-2 border-brand-primary bg-brand-primary/5 shadow-md"
                                          : "border-white/10 bg-slate-950/75 hover:border-brand-primary hover:shadow-md",
                                        isLocked || !dilemmaOwnedByCurrentRole ? "cursor-not-allowed" : "hover:bg-slate-950"
                                      )}
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="text-base font-bold text-white">{option.label}</div>
                                        {selected ? (
                                          <span className="absolute right-4 top-4 inline-flex h-7 w-7 items-center justify-center rounded-full border border-brand-primary/40 bg-brand-primary/15 text-brand-primary">
                                            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                                              <path d="M3 8.5L6.5 12L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                          </span>
                                        ) : null}
                                      </div>
                                      <p className="mt-3 text-sm leading-6 text-slate-300">{option.description}</p>
                                      <div className="mt-4">
                                        <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em]", riskBadgeTone(option.risk_level))}>
                                          {option.risk_level}
                                        </span>
                                      </div>
                                      <div className="mt-auto pt-5 text-xs font-semibold text-slate-400 opacity-100 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:group-focus-visible:opacity-100">
                                        {buildImpactPreview(option)}
                                      </div>
                                      <div className="pointer-events-none absolute right-4 top-14 max-w-[220px] rounded-xl border border-brand-primary/25 bg-slate-950/95 px-3 py-2 text-[11px] font-semibold text-slate-200 opacity-0 shadow-lg transition-all group-hover:opacity-100 group-focus-visible:opacity-100">
                                        {buildImpactPreview(option)}
                                      </div>
                                    </button>
                                    </DecisionOwnershipGate>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="rounded-[26px] border border-white/10 bg-slate-900/45 px-5 py-5">
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Portfolio Context</div>
                              <div className="mt-2 text-sm text-slate-300">
                                Less dramatic inputs that still shape the engine underneath the dilemmas.
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setShowPortfolioContext((current) => !current)}
                              className="inline-flex items-center justify-center rounded-full border border-white/10 bg-slate-950/80 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-200 transition hover:border-white/20 hover:bg-slate-950"
                            >
                              {showPortfolioContext ? "Hide context" : "Open context"}
                            </button>
                          </div>

                          {showPortfolioContext ? (
                            <div className="mt-5 space-y-5">
                              <div className="rounded-2xl border border-white/10 bg-slate-950/65 px-4 py-4">
                                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Sector Selection</div>
                                <div className="mt-4">
                                  <DecisionOwnershipGate decisionKey="primary_sector" currentRole={effectiveRole} roleAssignments={roleAssignments}>
                                    <SegmentedControl options={sectorOptions.map(o=>({value:o.value,text:o.text}))} activeOption={form.primary_sector} onSelect={(v)=>update("primary_sector",v)} disabled={isLocked || !canEditDecision("primary_sector")} />
                                  </DecisionOwnershipGate>
                                </div>
                                <div className="mt-4 grid gap-4 md:grid-cols-2">
                                  <DecisionOwnershipGate decisionKey="secondary_sector" currentRole={effectiveRole} roleAssignments={roleAssignments}>
                                  <div className="flex flex-col">
                                    <span className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Secondary Sector</span>
                                    <select className="w-full rounded-lg bg-slate-900 border border-slate-700 px-4 py-3 text-sm font-semibold text-white outline-none focus:border-cyan-500" value={form.secondary_sector} disabled={isLocked || !canEditDecision("secondary_sector")} onChange={e=>update("secondary_sector",e.target.value as SecondarySector)}>
                                      {secondarySectorOptions.map(o=><option key={o} value={o}>{o}</option>)}
                                    </select>
                                  </div>
                                  </DecisionOwnershipGate>
                                  <DecisionOwnershipGate decisionKey="project_mix_public_pct" currentRole={effectiveRole} roleAssignments={roleAssignments}>
                                    <DecisionSlider label={<FieldLabel label="Public Project Mix" tooltip={decisionFieldTooltips.publicProjectMix} />} value={form.project_mix_public_pct} min={0} max={100} suffix="%" onChange={v=>update("project_mix_public_pct",v)} disabled={isLocked || !canEditDecision("project_mix_public_pct")} />
                                  </DecisionOwnershipGate>
                                </div>
                              </div>

                              <DecisionOwnershipGate decisionKey="market_expansion" currentRole={effectiveRole} roleAssignments={roleAssignments}>
                              <div className="rounded-2xl border border-white/10 bg-slate-950/65 px-4 py-4">
                                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Market Expansion</div>
                                <div className="mt-4">
                                  <SegmentedControl options={expansionOptions.map(o=>({value:o.value,text:o.text,hint:o.hint}))} activeOption={form.market_expansion} onSelect={(v)=>update("market_expansion",v)} disabled={isLocked || !canEditDecision("market_expansion")} />
                                </div>
                              </div>
                              </DecisionOwnershipGate>
                            </div>
                          ) : null}
                        </div>
                     </div>
                   )}

                   {/* TAB CONTENT: STEP 3 */}
                   {activeStep === 2 && (
                     <div className="space-y-6 animate-in fade-in duration-300">
                        <StepContextBanner>
                          {`👷 Team context: ${stepProjectContext.complexity} complexity project`}
                        </StepContextBanner>
                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Delivery Mix & Assets</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DecisionOwnershipGate decisionKey="self_perform_percent" currentRole={effectiveRole} roleAssignments={roleAssignments}><DecisionSlider label="Self-Perform Share" value={form.self_perform_percent} min={0} max={100} suffix="%" onChange={v=>update("self_perform_percent",v)} disabled={isLocked || !canEditDecision("self_perform_percent")} /></DecisionOwnershipGate>
                            <DecisionOwnershipGate decisionKey="pm_utilization_target" currentRole={effectiveRole} roleAssignments={roleAssignments}><DecisionSlider label={<FieldLabel label="P&M Utilization Target" tooltip={decisionFieldTooltips.pmUtilizationTarget} />} value={form.pm_utilization_target} min={40} max={95} suffix="%" onChange={v=>update("pm_utilization_target",v)} disabled={isLocked || !canEditDecision("pm_utilization_target")} /></DecisionOwnershipGate>
                            <DecisionOwnershipGate decisionKey="specialized_work_index" currentRole={effectiveRole} roleAssignments={roleAssignments}><DecisionSlider label={<FieldLabel label="Specialized Capability" tooltip={decisionFieldTooltips.specializedCapability} />} value={form.specialized_work_index} min={0} max={100} onChange={v=>update("specialized_work_index",v)} disabled={isLocked || !canEditDecision("specialized_work_index")} /></DecisionOwnershipGate>
                            <DecisionOwnershipGate decisionKey="work_life_balance_index" currentRole={effectiveRole} roleAssignments={roleAssignments}><DecisionSlider label={<FieldLabel label="Work-Life Balance" tooltip={decisionFieldTooltips.workLifeBalance} />} value={form.work_life_balance_index} min={0} max={100} onChange={v=>update("work_life_balance_index",v)} disabled={isLocked || !canEditDecision("work_life_balance_index")} /></DecisionOwnershipGate>
                          </div>
                        </div>
                        <DecisionOwnershipGate decisionKey="subcontractor_profile" currentRole={effectiveRole} roleAssignments={roleAssignments}>
                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Subcontractor Profile</div>
                          <SegmentedControl options={subcontractorOptions.map(o=>({value:o.value,text:o.text,hint:o.hint}))} activeOption={form.subcontractor_profile} onSelect={(v)=>update("subcontractor_profile",v)} disabled={isLocked || !canEditDecision("subcontractor_profile")} />
                        </div>
                        </DecisionOwnershipGate>
                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Workforce Dynamics</div>
                          <DecisionOwnershipGate decisionKey="workforce_plan" currentRole={effectiveRole} roleAssignments={roleAssignments}>
                            <SegmentedControl options={workforceOptions.map(o=>({value:o.value,text:o.text}))} activeOption={form.workforce_plan} onSelect={(v)=>update("workforce_plan",v)} disabled={isLocked || !canEditDecision("workforce_plan")} />
                          </DecisionOwnershipGate>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                            <DecisionOwnershipGate decisionKey="workforce_load_state" currentRole={effectiveRole} roleAssignments={roleAssignments}><div className="flex flex-col"><span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-2">Load State</span><select className="w-full rounded-lg bg-slate-900 border border-slate-700 px-4 py-3 text-sm text-white font-semibold outline-none" value={form.workforce_load_state} disabled={isLocked || !canEditDecision("workforce_load_state")} onChange={e=>update("workforce_load_state",e.target.value as WorkforceLoadState)}>{workloadOptions.map(o=><option key={o} value={o}>{o}</option>)}</select></div></DecisionOwnershipGate>
                            <DecisionOwnershipGate decisionKey="qa_audit_frequency" currentRole={effectiveRole} roleAssignments={roleAssignments}><div className="flex flex-col"><span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-2">QA Frequency</span><select className="w-full rounded-lg bg-slate-900 border border-slate-700 px-4 py-3 text-sm text-white font-semibold outline-none" value={form.qa_audit_frequency} disabled={isLocked || !canEditDecision("qa_audit_frequency")} onChange={e=>update("qa_audit_frequency",e.target.value as QaFrequency)}>{qaOptions.map(o=><option key={o} value={o}>{o}</option>)}</select></div></DecisionOwnershipGate>
                          </div>
                        </div>
                        <DecisionOwnershipGate decisionKey="overtime_policy" currentRole={effectiveRole} roleAssignments={roleAssignments}>
                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Overtime Policy</div>
                          <SegmentedControl options={overtimeOptions.map(o=>({value:o.value,text:o.text}))} activeOption={form.overtime_policy} onSelect={(v)=>update("overtime_policy",v)} disabled={isLocked || !canEditDecision("overtime_policy")} />
                        </div>
                        </DecisionOwnershipGate>
                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">L&D and Innovation</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DecisionOwnershipGate decisionKey="training_intensity" currentRole={effectiveRole} roleAssignments={roleAssignments}><DecisionSlider label="Training Intensity" value={form.training_intensity} min={0} max={100} onChange={v=>update("training_intensity",v)} disabled={isLocked || !canEditDecision("training_intensity")} /></DecisionOwnershipGate>
                            <DecisionOwnershipGate decisionKey="innovation_budget_index" currentRole={effectiveRole} roleAssignments={roleAssignments}><DecisionSlider label="Innovation Budget" value={form.innovation_budget_index} min={0} max={100} onChange={v=>update("innovation_budget_index",v)} disabled={isLocked || !canEditDecision("innovation_budget_index")} /></DecisionOwnershipGate>
                          </div>
                        </div>
                     </div>
                   )}

                   {/* TAB CONTENT: STEP 4 */}
                   {activeStep === 3 && (
                     <div className="space-y-6 animate-in fade-in duration-300">
                        <StepContextBanner>
                          {`🤝 Stakeholder: ${stepProjectContext.client} expects ${stepProjectContext.complexity} compliance`}
                        </StepContextBanner>
                         <DecisionOwnershipGate decisionKey="logistics_resilience" currentRole={effectiveRole} roleAssignments={roleAssignments}>
                         <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Logistics & Buffer</div>
                          <SegmentedControl options={logisticsOptions.map(o=>({value:o.value,text:o.text}))} activeOption={form.logistics_resilience} onSelect={(v)=>update("logistics_resilience",v)} disabled={isLocked || !canEditDecision("logistics_resilience")} />
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                            <DecisionOwnershipGate decisionKey="buffer_percent" currentRole={effectiveRole} roleAssignments={roleAssignments}><DecisionSlider label={<FieldLabel label="Buffer" tooltip={decisionFieldTooltips.buffer} />} value={form.buffer_percent} min={0} max={15} suffix="%" onChange={v=>update("buffer_percent",v)} disabled={isLocked || !canEditDecision("buffer_percent")} /></DecisionOwnershipGate>
                            <DecisionOwnershipGate decisionKey="inventory_cover_weeks" currentRole={effectiveRole} roleAssignments={roleAssignments}><DecisionSlider label="Inventory Cover" value={form.inventory_cover_weeks} min={1} max={12} suffix="w" onChange={v=>update("inventory_cover_weeks",v)} disabled={isLocked || !canEditDecision("inventory_cover_weeks")} /></DecisionOwnershipGate>
                          </div>
                        </div>
                        </DecisionOwnershipGate>
                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Stakeholder Engagement</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DecisionOwnershipGate decisionKey="community_engagement" currentRole={effectiveRole} roleAssignments={roleAssignments}><DecisionSlider label={<FieldLabel label="Community Engagement" tooltip={decisionFieldTooltips.communityEngagement} />} value={form.community_engagement} min={0} max={100} onChange={v=>update("community_engagement",v)} disabled={isLocked || !canEditDecision("community_engagement")} /></DecisionOwnershipGate>
                            <DecisionOwnershipGate decisionKey="digital_visibility_spend" currentRole={effectiveRole} roleAssignments={roleAssignments}><DecisionSlider label="Digital Visibility Spend" value={form.digital_visibility_spend} min={0} max={100} onChange={v=>update("digital_visibility_spend",v)} disabled={isLocked || !canEditDecision("digital_visibility_spend")} /></DecisionOwnershipGate>
                            <DecisionOwnershipGate decisionKey="csr_sustainability_index" currentRole={effectiveRole} roleAssignments={roleAssignments}><DecisionSlider label={<FieldLabel label="CSR & Sustainability" tooltip={decisionFieldTooltips.csrSustainability} />} value={form.csr_sustainability_index} min={0} max={100} onChange={v=>update("csr_sustainability_index",v)} disabled={isLocked || !canEditDecision("csr_sustainability_index")} /></DecisionOwnershipGate>
                            <DecisionOwnershipGate decisionKey="facilitation_budget_index" currentRole={effectiveRole} roleAssignments={roleAssignments}><DecisionSlider label={<FieldLabel label="Facilitation Risk Budget" tooltip={decisionFieldTooltips.facilitationRiskBudget} />} value={form.facilitation_budget_index} min={0} max={100} onChange={v=>update("facilitation_budget_index",v)} disabled={isLocked || !canEditDecision("facilitation_budget_index")} /></DecisionOwnershipGate>
                          </div>
                        </div>
                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Compliance & Transparency</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                             <DecisionOwnershipGate decisionKey="compliance_posture" currentRole={effectiveRole} roleAssignments={roleAssignments}><div className="flex flex-col"><span className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-2">Compliance Posture</span><select className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white font-semibold outline-none" value={form.compliance_posture} disabled={isLocked || !canEditDecision("compliance_posture")} onChange={e=>update("compliance_posture",e.target.value as CompliancePosture)}>{complianceOptions.map(o=><option key={o} value={o}>{o}</option>)}</select></div></DecisionOwnershipGate>
                             <DecisionOwnershipGate decisionKey="vendor_strategy" currentRole={effectiveRole} roleAssignments={roleAssignments}><div className="flex flex-col"><span className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-2">Vendor Strategy</span><select className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white font-semibold outline-none" value={form.vendor_strategy} disabled={isLocked || !canEditDecision("vendor_strategy")} onChange={e=>update("vendor_strategy",e.target.value as VendorStrategy)}>{vendorOptions.map(o=><option key={o} value={o}>{o}</option>)}</select></div></DecisionOwnershipGate>
                             <DecisionOwnershipGate decisionKey="transparency_level" currentRole={effectiveRole} roleAssignments={roleAssignments}><div className="flex flex-col lg:col-span-1 md:col-span-2"><span className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">Transparency Mode</span><SegmentedControl options={transparencyOptions.map(o=>({value:o.value,text:o.text,hint:o.hint}))} activeOption={form.transparency_level} onSelect={(v)=>update("transparency_level",v)} disabled={isLocked || !canEditDecision("transparency_level")} /></div></DecisionOwnershipGate>
                          </div>
                        </div>
                     </div>
                   )}

                   {/* TAB CONTENT: STEP 5 */}
                   {activeStep === 4 && (
                     <div className="space-y-6 animate-in fade-in duration-300">
                        <StepContextBanner>
                          {`💰 Base budget: ${
                            stepProjectContext.baseBudgetCr === null
                              ? "Pending"
                              : `₹${formatBudgetCr(stepProjectContext.baseBudgetCr)} Cr`
                          } | Rounds remaining: ${roundsRemaining}`}
                        </StepContextBanner>
                         <DecisionOwnershipGate decisionKey="financing_posture" currentRole={effectiveRole} roleAssignments={roleAssignments}>
                         <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                           <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Financing Strategy</div>
                           <SegmentedControl options={financingOptions.map(o=>({value:o.value,text:o.text}))} activeOption={form.financing_posture} onSelect={(v)=>update("financing_posture",v)} disabled={isLocked || !canEditDecision("financing_posture")} />
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                              <DecisionOwnershipGate decisionKey="cash_buffer_months" currentRole={effectiveRole} roleAssignments={roleAssignments}><DecisionSlider label="Cash Buffer" value={form.cash_buffer_months} min={1} max={12} suffix="m" onChange={v=>update("cash_buffer_months",v)} disabled={isLocked || !canEditDecision("cash_buffer_months")} /></DecisionOwnershipGate>
                              <DecisionOwnershipGate decisionKey="contingency_fund_percent" currentRole={effectiveRole} roleAssignments={roleAssignments}><DecisionSlider label="Contingency Fund" value={form.contingency_fund_percent} min={0} max={20} suffix="%" onChange={v=>update("contingency_fund_percent",v)} disabled={isLocked || !canEditDecision("contingency_fund_percent")} /></DecisionOwnershipGate>
                            </div>
                        </div>
                        </DecisionOwnershipGate>
                        <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-4">
                           <div className="text-[10px] font-bold uppercase tracking-widest text-amber-500">Deterministic Preview</div>
                           <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                             <div className="flex flex-col"><span className="text-[10px] uppercase text-amber-500/70">SPI Projection</span><span className="text-xl font-mono font-bold text-amber-400">{previewResult.schedule_index.toFixed(2)}</span></div>
                             <div className="flex flex-col"><span className="text-[10px] uppercase text-amber-500/70">CPI Projection</span><span className="text-xl font-mono font-bold text-amber-400">{previewResult.cost_index.toFixed(2)}</span></div>
                             <div className="flex flex-col"><span className="text-[10px] uppercase text-amber-500/70">Points Expected</span><span className="text-xl font-mono font-bold text-amber-400">+{Math.round(previewResult.points_earned)}</span></div>
                           </div>
                        </div>
                        <DecisionOwnershipGate decisionKey="forecast" currentRole={effectiveRole} roleAssignments={roleAssignments}>
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
                                disabled={isLocked || !canEditDecision("forecast")}
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
                                disabled={isLocked || !canEditDecision("forecast")}
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
                                disabled={isLocked || !canEditDecision("forecast")}
                               formatValue={(v) => v + "%"}
                               hint="Over-confidence will be heavily penalized later."
                             />
                          </div>
                        </div>
                        </DecisionOwnershipGate>
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
                            const ownsStep = roleOwnsStep(effectiveRole, idx + 1);
                           return (
                             <div
                               key={`mobile-progress-${title}`}
                               className={`h-2 w-6 rounded-full ${
                                 activeStep === idx ? (ownsStep ? "bg-teal-400" : "bg-slate-500") : activeStep > idx ? (ownsStep ? "bg-teal-700" : "bg-slate-700") : ownsStep ? "bg-teal-950" : "bg-slate-800"
                               }`}
                             />
                           );
                         })}
                       </div>
                      <Button
                        onClick={nextStep}
                        disabled={activeStep === 4 || isLocked}
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
                            disabled={saving || isLocked || !effectiveRole}
                           className="w-full border-slate-700 bg-slate-900 text-slate-200"
                         >
                           {saving ? "Saving..." : "Save Draft"}
                         </Button>
                         {isProjectDirector ? (
                           <Button
                             onClick={openLockConfirmation}
                             disabled={locking || saving || isLocked || !stepValidations[4] || !allAssignedRolesReady}
                             className="w-full"
                           >
                             {locking ? "Initializing..." : lockBlockedByDeadline ? "Window Closed" : "Lock and Generate Results"}
                           </Button>
                         ) : (
                           <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-xs font-bold uppercase tracking-[0.2em] text-slate-300">
                             Waiting for Project Director to lock
                           </div>
                         )}
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
                        const ownsStep = roleOwnsStep(effectiveRole, idx + 1);
                        return (
                          <button
                            key={`sidebar-step-${title}`}
                            type="button"
                            onClick={() => goToStep(idx, "stepper-sidebar")}
                            className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition ${
                              current
                                ? ownsStep
                                  ? "border-teal-400/40 bg-teal-500/15 text-white"
                                  : "border-slate-500/40 bg-slate-800 text-white"
                                : ownsStep
                                  ? "border-teal-950 bg-slate-950/70 text-slate-200 hover:border-teal-800 hover:bg-slate-900"
                                  : "border-white/5 bg-slate-950/70 text-slate-500 hover:border-white/10 hover:bg-slate-900"
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                                Step {index + 1}
                              </div>
                              <div className="mt-1 truncate text-sm font-semibold">{title}</div>
                            </div>
                            <span
                              className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                                current ? (ownsStep ? "bg-teal-300" : "bg-slate-300") : stepValidations[idx] ? (ownsStep ? "bg-teal-500" : "bg-slate-500") : ownsStep ? "bg-teal-900" : "bg-slate-700"
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
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-200">{readinessScore}%</span>
                          <ChecklistPopover title="What's missing?" buttonLabel="What's missing?" items={readinessChecks} />
                        </div>
                      </div>
                      <div className="h-2 rounded-full bg-slate-800">
                        <div
                          className="h-2 rounded-full bg-gradient-to-r from-blue-500 via-cyan-500 to-emerald-500 transition-all"
                          style={{ width: `${readinessScore}%` }}
                        />
                      </div>
                      <div className="text-[11px] leading-5 text-slate-400">
                        <span className="font-bold uppercase tracking-[0.18em] text-slate-500">Remaining:</span>{" "}
                        <span>{readinessRemainingText}</span>
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

                  <CompetitorIntelFeed sessionId={sessionId} teamId={teamId} roundNumber={roundNumber} />
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
                <Button type="button" variant="ghost" onClick={handleFooterPrevious} disabled={activeStep === 0 || isLocked} className="text-slate-400 hover:text-white">
                  &lt; Previous
                </Button>
                <div className="hidden md:flex flex-row gap-1">
                  {[0,1,2,3,4].map(idx => (
                     <div
                       key={idx}
                       className={`w-8 h-2 rounded-full transition-all ${
                         activeStep === idx
                            ? roleOwnsStep(effectiveRole, idx + 1)
                             ? "bg-teal-400"
                             : "bg-slate-500"
                           : activeStep > idx
                              ? roleOwnsStep(effectiveRole, idx + 1)
                               ? "bg-teal-700"
                               : "bg-slate-700"
                              : roleOwnsStep(effectiveRole, idx + 1)
                               ? "bg-teal-950"
                               : "bg-slate-800"
                       }`}
                     />
                  ))}
                </div>
                <Button type="button" variant="ghost" onClick={handleFooterNext} disabled={activeStep === 4 || isLocked} className="text-slate-400 hover:text-white">
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
                      <Button type="button" variant="secondary" onClick={saveDraft} disabled={saving || isLocked || !effectiveRole} className="w-full md:w-auto border-slate-700 bg-slate-900 text-slate-300 py-3 text-[11px] tracking-widest">
                       {saving ? "SAVING..." : "SAVE DRAFT"}
                     </Button>
                     {isProjectDirector ? (
                        <Button type="button" onClick={openLockConfirmation} disabled={locking || saving || isLocked || !stepValidations[4] || !allAssignedRolesReady} className="w-full md:w-auto shadow-blue-500/40 py-3 text-[11px] tracking-widest">
                         {locking ? "INITIALIZING..." : lockBlockedByDeadline ? "WINDOW CLOSED" : "LOCK AND GENERATE RESULTS"}
                       </Button>
                     ) : (
                       <div className="flex items-center rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-300">
                         Waiting for Project Director to lock
                       </div>
                     )}
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




