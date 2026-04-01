import { type CarryoverState, DEFAULT_CARRYOVER_STATE } from "@/lib/consequenceEngine";

export interface InboxMessage {
  id: string;
  from: string;
  subject: string;
  body: string;
  type: "urgent" | "info" | "opportunity" | "warning";
  icon: string;
  requires_response: boolean;
  consequence_hint?: string;
}

export type InboxPreviousRound = {
  spi?: number | null;
  cpi?: number | null;
  safety?: number | null;
  stakeholder?: number | null;
  ld_triggered?: boolean | null;
};

export type InboxIdentityProfile = {
  company_name?: string | null;
  positioning_strategy?: string | null;
  primary_kpi?: string | null;
  scenario_name?: string | null;
};

export type GenerateProjectInboxParams = {
  sessionId: string;
  roundNumber: number;
  clientName?: string | null;
  companyName?: string | null;
  identityProfile?: InboxIdentityProfile | null;
  previousRound?: InboxPreviousRound | null;
  carryoverState?: CarryoverState | null;
};

type MessageBuilderContext = {
  companyName: string;
  clientName: string;
  roundNumber: number;
  previousRound: InboxPreviousRound;
  identityProfile: InboxIdentityProfile;
  carryoverState: CarryoverState;
  random: () => number;
};

const DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  timeZone: "Asia/Kolkata",
});

const BASE_PROJECT_DATE_UTC = Date.UTC(2026, 3, 1);
const SUBCONTRACTOR_NAMES = [
  "Shivam Buildtech",
  "Metroline Infra",
  "Aditya Earthmovers",
  "Vardhan Civil Works",
  "Surya Buildcon",
];

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function stringToSeed(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return hash;
}

function mulberry32(seed: number) {
  return function nextRandom() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleDeterministic<T>(items: T[], random: () => number) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function projectDateLabel(roundNumber: number, extraDays: number) {
  const projectDayOffset = (roundNumber - 1) * 14 + extraDays;
  return DATE_FORMATTER.format(new Date(BASE_PROJECT_DATE_UTC + projectDayOffset * 24 * 60 * 60 * 1000));
}

function choose<T>(items: T[], random: () => number) {
  return items[Math.floor(random() * items.length)];
}

function inferScenarioThread(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("metro")) return "traffic diversion window";
  if (lower.includes("airport")) return "airside access permit";
  if (lower.includes("bridge")) return "launch sequence review";
  if (lower.includes("power") || lower.includes("transmission")) return "shutdown coordination";
  if (lower.includes("dam") || lower.includes("irrigation")) return "canal block approval";
  return "critical path look-ahead";
}

function normalizePrimaryKpi(kpi: string | null | undefined) {
  if (!kpi) return "";
  return kpi.toLowerCase();
}

function buildPlanningMessage(context: MessageBuilderContext): InboxMessage {
  const scenarioThread = inferScenarioThread(context.identityProfile.scenario_name ?? "");
  const kpiFocus = normalizePrimaryKpi(context.identityProfile.primary_kpi);
  const consequence =
    kpiFocus.includes("schedule") || kpiFocus.includes("spi")
      ? "Ignoring this may weaken SPI and delay stakeholder recovery"
      : "Ignoring this may reduce site coordination next round";

  return {
    id: "planning-lookahead",
    from: "Planning Cell — Anita Menon",
    subject: "14-Day Look-Ahead Due",
    body: `The ${scenarioThread} is not yet reflected in the rolling look-ahead. Please freeze crew, plant, and material sequences before tonight's coordination call.`,
    type: kpiFocus.includes("schedule") || kpiFocus.includes("spi") ? "warning" : "info",
    icon: "🗓️",
    requires_response: true,
    consequence_hint: consequence,
  };
}

function buildQualityMessage(context: MessageBuilderContext): InboxMessage {
  const kpiFocus = normalizePrimaryKpi(context.identityProfile.primary_kpi);
  return {
    id: "qa-cube-results",
    from: "QA/QC Lab",
    subject: "Test Register Update Pending",
    body: "Cube reports, MIR closures, and the latest inspection register are out of sync. Consultant review is expected this week, so document gaps should be closed before the next site walk.",
    type: kpiFocus.includes("quality") ? "warning" : "info",
    icon: "🧪",
    requires_response: kpiFocus.includes("quality"),
    consequence_hint: "Ignoring this may affect quality perception and consultant trust",
  };
}

function buildStakeholderMessage(context: MessageBuilderContext): InboxMessage {
  const pressureHigh = (context.previousRound.stakeholder ?? 75) < 70;
  return {
    id: "stakeholder-liaison",
    from: "Local Liaison — Meera Singh",
    subject: pressureHigh ? "Community Friction Building Near Site Gate" : "Stakeholder Touchpoint Window Open",
    body: pressureHigh
      ? "Shop owners near the access gate are complaining about dust and truck timing again. A short outreach visit this week can calm the issue before it reaches the client escalation channel."
      : "Ward office contacts are available for a short coordination visit before weekend activities begin. A proactive briefing now will make later approvals smoother.",
    type: pressureHigh ? "warning" : "opportunity",
    icon: "🤝",
    requires_response: pressureHigh,
    consequence_hint: "Ignoring this may reduce stakeholder score next round",
  };
}

function buildCostMessage(context: MessageBuilderContext): InboxMessage {
  const lowCpi = (context.previousRound.cpi ?? 1) < 0.98;
  return {
    id: "cost-watch",
    from: `Commercial Controls — ${context.companyName}`,
    subject: lowCpi ? "Cost Drift Flagged in Site Spend" : "Variation Register Opportunity",
    body: lowCpi
      ? "Steel, diesel, and overtime lines are drifting above the approved burn curve. Freeze non-critical commitments and review rate justifications before the next certification cycle."
      : "Two client-side changes are still sitting in the variation register without commercial narration. Pushing paperwork early could improve claim recovery without disturbing execution.",
    type: lowCpi ? "warning" : "opportunity",
    icon: lowCpi ? "💸" : "📈",
    requires_response: true,
    consequence_hint: lowCpi
      ? "Ignoring this may worsen CPI next round"
      : "Ignoring this may leave commercial upside unclaimed",
  };
}

function buildPlantMessage(context: MessageBuilderContext): InboxMessage {
  const equipmentWindow = choose(["batching plant", "crawler crane", "DG backup", "rebar cutting line"], context.random);
  return {
    id: "plant-maintenance-window",
    from: "Plant & Machinery",
    subject: "Preventive Maintenance Slot Available",
    body: `A short maintenance slot has opened for the ${equipmentWindow} during the next low-utilisation window. Approving it now will reduce breakdown risk without materially disturbing output.`,
    type: "opportunity",
    icon: "🛠️",
    requires_response: false,
    consequence_hint: "Skipping this may increase equipment disruption risk later",
  };
}

function buildPrimaryKpiPriorityMessage(context: MessageBuilderContext): InboxMessage | null {
  const primaryKpi = normalizePrimaryKpi(context.identityProfile.primary_kpi);

  if (primaryKpi.includes("schedule") || primaryKpi.includes("spi")) {
    return {
      id: "kpi-schedule-focus",
      from: "Client Scheduler — Rahul Deshpande",
      subject: "Milestone Tracker Needs Refresh",
      body: "The client scheduler has asked for a refreshed milestone tracker before the weekly review. They are comparing planned versus achieved fronts more aggressively this cycle.",
      type: "warning",
      icon: "⏱️",
      requires_response: true,
      consequence_hint: "Ignoring this may put SPI under sharper scrutiny next round",
    };
  }

  if (primaryKpi.includes("cost") || primaryKpi.includes("cpi")) {
    return {
      id: "kpi-cost-focus",
      from: "Procurement Analytics",
      subject: "Rate Lock Window Closing",
      body: "Two high-value material lines can still be rate-locked before the next vendor revision cycle. Acting now protects margin, but delayed approval will likely expose the package to fresh rates.",
      type: "opportunity",
      icon: "📊",
      requires_response: true,
      consequence_hint: "Ignoring this may worsen CPI in the next round",
    };
  }

  if (primaryKpi.includes("safety")) {
    return {
      id: "kpi-safety-focus",
      from: "HSE Training Cell",
      subject: "Supervisor Safety Drill Slot Reserved",
      body: "A half-shift drill slot is available for foremen and lifting supervisors. Using it this round reinforces safety discipline before the next external review.",
      type: "opportunity",
      icon: "🦺",
      requires_response: true,
      consequence_hint: "Ignoring this may weaken safety resilience next round",
    };
  }

  if (primaryKpi.includes("stakeholder")) {
    return {
      id: "kpi-stakeholder-focus",
      from: "Client Relations Desk",
      subject: "Executive Visit Window Open",
      body: "The client leadership team has a short visit window next week and expects a calm, well-briefed site. A polished walkthrough can buy goodwill before harder commercial conversations land.",
      type: "opportunity",
      icon: "🏢",
      requires_response: true,
      consequence_hint: "Ignoring this may waste an easy stakeholder uplift",
    };
  }

  if (primaryKpi.includes("quality")) {
    return {
      id: "kpi-quality-focus",
      from: "Independent Engineer",
      subject: "Mock Audit Opportunity This Week",
      body: "The independent engineer is open to a mock audit before the formal review. Closing observations early would help us avoid visible non-conformances later.",
      type: "opportunity",
      icon: "✅",
      requires_response: true,
      consequence_hint: "Ignoring this may leave quality gaps exposed next round",
    };
  }

  return null;
}

function buildCarryoverMessages(context: MessageBuilderContext): InboxMessage[] {
  const messages: InboxMessage[] = [];
  const carryover = context.carryoverState;

  if (carryover.fatigue_index > 70) {
    messages.push({
      id: "carryover-fatigue-safety",
      from: "HSE Controller",
      subject: "Fatigue Trend Raising Safety Exposure",
      body: "Shift rosters and overtime patterns are showing sustained fatigue risk. Supervisors are asking for a controlled reset before a near-miss turns into a reportable incident.",
      type: "urgent",
      icon: "🦺",
      requires_response: true,
      consequence_hint: "Persistent fatigue now increases the chance of a safety incident event",
    });
  }

  if (carryover.relationship_score < 50) {
    messages.push({
      id: "carryover-client-escalation",
      from: `Client Director - ${context.clientName}`,
      subject: "Escalation Call Requested by Client Leadership",
      body: "The client is no longer satisfied with routine updates and has requested an executive-level explanation of open issues. Relationship recovery now needs visible action, not just narrative.",
      type: "urgent",
      icon: "📣",
      requires_response: true,
      consequence_hint: "Weak client trust now increases the chance of a client escalation event",
    });
  }

  if (carryover.regulatory_exposure > 60) {
    messages.push({
      id: "carryover-regulatory-audit",
      from: "Compliance Office",
      subject: "Inspection Readiness Requested",
      body: "Recent process gaps have lifted the likelihood of an audit or inspection. Permit files, worker records, and site logs should be pulled into one clean pack immediately.",
      type: "warning",
      icon: "📋",
      requires_response: true,
      consequence_hint: "High exposure now increases the chance of an audit or inspection event",
    });
  }

  if (carryover.labour_stability < 50) {
    messages.push({
      id: "carryover-labour-instability",
      from: "Site Labour Desk",
      subject: "Crew Morale and Attendance Slipping",
      body: "Attendance patterns and supervisor feedback both suggest labour stability is deteriorating. Delayed payments and overtime fatigue are now being discussed openly on site.",
      type: "urgent",
      icon: "👷",
      requires_response: true,
      consequence_hint: "Low labour stability now increases the chance of a labour dispute event",
    });
  }

  if (carryover.documentation_quality < 40) {
    messages.push({
      id: "carryover-billing-dispute",
      from: "Commercial Controls",
      subject: "Documentation Gaps Threaten Bill Certification",
      body: "Running bill backup is patchy across measurements, approvals, and closure logs. If this stays unresolved, the next certification cycle is likely to turn into a billing dispute.",
      type: "warning",
      icon: "🧾",
      requires_response: true,
      consequence_hint: "Weak records now increase the chance of a billing dispute event",
    });
  }

  return messages;
}

function withOrdering(messages: InboxMessage[]) {
  const typePriority: Record<InboxMessage["type"], number> = {
    urgent: 0,
    warning: 1,
    opportunity: 2,
    info: 3,
  };

  return messages
    .map((message, index) => ({ message, index }))
    .sort((left, right) => {
      const typeDelta = typePriority[left.message.type] - typePriority[right.message.type];
      return typeDelta !== 0 ? typeDelta : left.index - right.index;
    })
    .map((entry) => entry.message);
}

export function generateProjectInboxMessages(params: GenerateProjectInboxParams): InboxMessage[] {
  const random = mulberry32(stringToSeed(`${params.sessionId}:${params.roundNumber}`));
  const previousRound: InboxPreviousRound = params.previousRound ?? {};
  const identityProfile = params.identityProfile ?? {};
  const carryoverState = params.carryoverState ?? DEFAULT_CARRYOVER_STATE;
  const companyName =
    params.companyName?.trim() ||
    identityProfile.company_name?.trim() ||
    "Project Team";
  const clientName = params.clientName?.trim() || "Client";

  const context: MessageBuilderContext = {
    companyName,
    clientName,
    roundNumber: params.roundNumber,
    previousRound,
    identityProfile,
    carryoverState,
    random,
  };

  const messages: InboxMessage[] = [];

  if (params.roundNumber === 1) {
    messages.push({
      id: "kickoff-expectations",
      from: `Client PM — ${clientName}`,
      subject: "Project Kickoff — Key Expectations",
      body: "Welcome to the project. Our board expects milestone 1 by end of Q2. Please ensure your S-curve is submitted by next week. We will be monitoring SPI closely.",
      type: "info",
      icon: "📋",
      requires_response: false,
    });
  }

  if ((previousRound.spi ?? 1) < 0.95) {
    messages.push({
      id: "schedule-concern",
      from: `Client PM — ${clientName}`,
      subject: "Schedule Concern — Immediate Action Required",
      body: "Our monitoring shows your progress is behind plan. Please submit a recovery schedule within 48 hours. Repeated delays will trigger LD clause review.",
      type: "urgent",
      icon: "🚨",
      requires_response: true,
      consequence_hint: "Ignoring this reduces stakeholder score next round",
    });
  }

  if ((previousRound.safety ?? 100) < 72) {
    messages.push({
      id: "safety-alert",
      from: "HSE Department",
      subject: "Safety Alert — Toolbox Talk Overdue",
      body: "Following last fortnight's near-miss, a mandatory site-wide toolbox talk is overdue. Please confirm scheduling. Labour inspector visit is possible this month.",
      type: "warning",
      icon: "🦺",
      requires_response: true,
      consequence_hint: "May trigger safety audit event next round",
    });
  }

  if (params.roundNumber >= 2) {
    const billLakhs = 18 + params.roundNumber * 5 + Math.floor(random() * 22);
    const followUpLabel = projectDateLabel(params.roundNumber, 10 + Math.floor(random() * 6));
    messages.push({
      id: `running-bill-${params.roundNumber}`,
      from: `Accounts — ${companyName}`,
      subject: "Running Bill Certification Pending",
      body: `Running Bill No. ${params.roundNumber} for ₹${billLakhs}L submitted. Client has 21 days to certify. Follow up recommended if not received by ${followUpLabel}.`,
      type: "info",
      icon: "🧾",
      requires_response: false,
    });
  }

  if ((previousRound.ld_triggered ?? false) === true) {
    messages.push({
      id: "ld-review",
      from: `Contracts — ${companyName}`,
      subject: "LD Clause Review Flagged",
      body: "Last round's delay position has pushed the client into formal LD review. Please prepare extension-of-time support and site records before the next commercial meeting.",
      type: "urgent",
      icon: "⚖️",
      requires_response: true,
      consequence_hint: "Ignoring this may increase LD exposure and reduce stakeholder confidence",
    });
  }

  messages.push(...buildCarryoverMessages(context));

  const subcontractorStressChance =
    carryoverState.subcontractor_reliability < 50 ? 0.55 : carryoverState.labour_stability < 60 ? 0.4 : 0.3;

  if (random() < subcontractorStressChance) {
    const subcontractorName = choose(SUBCONTRACTOR_NAMES, random);
    messages.push({
      id: "subcontractor-payment",
      from: "Site Engineer — Ramesh Kumar",
      subject: "Subcontractor Payment Issue",
      body: `M/s ${subcontractorName} Infra has stopped work citing non-payment of last month's bill. 47 workers idle. Suggest immediate payment release or replacement.`,
      type: "urgent",
      icon: "💥",
      requires_response: true,
      consequence_hint: "Ignoring this triggers labour event next round",
    });
  }

  if (identityProfile.positioning_strategy === "Cost Leadership" && params.roundNumber >= 2) {
    messages.push({
      id: "alt-vendor",
      from: `Procurement — ${companyName}`,
      subject: "Alternative Vendor Identified — 18% Cost Saving",
      body: "We have identified a Tier-3 vendor for TMT bars at 18% lower cost. Quality certification pending. Recommend switching if schedule allows.",
      type: "opportunity",
      icon: "💰",
      requires_response: true,
      consequence_hint: "Switching affects quality score but improves CPI",
    });
  }

  const prioritizedContextMessage = buildPrimaryKpiPriorityMessage(context);
  const fillerPool = shuffleDeterministic(
    [
      buildPlanningMessage(context),
      buildQualityMessage(context),
      buildStakeholderMessage(context),
      buildCostMessage(context),
      buildPlantMessage(context),
    ],
    random
  );

  if (prioritizedContextMessage) {
    fillerPool.unshift(prioritizedContextMessage);
  }

  for (const filler of fillerPool) {
    if (messages.some((message) => message.id === filler.id)) continue;
    if (messages.length >= 5) break;
    messages.push(filler);
  }

  const ordered = withOrdering(messages);
  return ordered.slice(0, clamp(ordered.length, 5, 7));
}
