import type { MessageTone } from "@/lib/decisionProfile";
import type { Governance, RiskAppetite } from "@/lib/simEngine";

export interface Dilemma {
  id: string;
  category: "procurement" | "client" | "regulatory" | "commercial" | "people";
  title: string;
  situation: string;
  options: DilemmaOption[];
}

export interface DilemmaOption {
  id: string;
  label: string;
  description: string;
  impact: {
    spi: number;
    cpi: number;
    safety: number;
    stakeholder: number;
    cash: number;
  };
  risk_level: "low" | "medium" | "high";
}

type ScenarioFamily = "metro" | "airport" | "industrial" | "highway";
type DilemmaCategory = Dilemma["category"];

type DilemmaBankEntry = Dilemma & {
  scenario_weights: Record<ScenarioFamily, number>;
  schedule_pressure_weight: number;
  cost_pressure_weight: number;
};

export type DilemmaSelectionMap = Record<string, string>;

export type DilemmaSelectionRecord = {
  dilemma_id: string;
  dilemma_title: string;
  category: Dilemma["category"];
  option_id: string;
  option_label: string;
  outcome_description: string;
  risk_level: DilemmaOption["risk_level"];
  impact: DilemmaOption["impact"];
};

export type DilemmaRoundSummary = {
  scenario_family: ScenarioFamily;
  round_number: number;
  selected: DilemmaSelectionRecord[];
  derived_fields: {
    bid_aggressiveness: number;
    risk_appetite: RiskAppetite;
    governance_intensity: Governance;
    public_message_tone: MessageTone;
  };
};

export type DerivedManagementFields = DilemmaRoundSummary["derived_fields"];

export type DilemmaRoundSelectionInput = {
  session_id: string;
  round_number: number;
  scenario_type: string;
  previous_round_performance?: {
    spi?: number | null;
    cpi?: number | null;
  } | null;
};

const CATEGORY_LABELS: Record<DilemmaCategory, string> = {
  procurement: "Procurement",
  client: "Client",
  regulatory: "Regulatory",
  commercial: "Commercial",
  people: "People",
};

const DEFAULT_DERIVED_FIELDS: DerivedManagementFields = {
  bid_aggressiveness: 3,
  risk_appetite: "Balanced",
  governance_intensity: "Medium",
  public_message_tone: "Confident",
};

const DILEMMA_BANK: DilemmaBankEntry[] = [
  {
    id: "proc-rate-revision",
    category: "procurement",
    title: "Subcontractor rate revision mid-contract",
    situation:
      "Your finishing subcontractor claims diesel, labour, and steel-linked inputs have all moved since award. They have slowed mobilization and want a revised rate sheet before they ramp back up.",
    options: [
      {
        id: "reject-outright",
        label: "Reject outright",
        description: "You hold the line on the contract, but productivity slips while the package stalls.",
        impact: { spi: -0.04, cpi: 0.02, safety: 0, stakeholder: -2, cash: 4 },
        risk_level: "high",
      },
      {
        id: "accept-eight",
        label: "Accept 8%",
        description: "You share some pain, keep the crew moving, and preserve a workable relationship.",
        impact: { spi: 0.01, cpi: -0.02, safety: 1, stakeholder: 2, cash: -10 },
        risk_level: "medium",
      },
      {
        id: "accept-full",
        label: "Accept full claim",
        description: "The dispute ends quickly, but your package margin takes a direct hit.",
        impact: { spi: 0.02, cpi: -0.05, safety: 1, stakeholder: 3, cash: -22 },
        risk_level: "low",
      },
      {
        id: "escalate-client",
        label: "Escalate to client",
        description: "You try to pass the pressure upward, but the client reads it as poor contract control.",
        impact: { spi: -0.02, cpi: 0.01, safety: 0, stakeholder: -4, cash: 6 },
        risk_level: "medium",
      },
    ],
    scenario_weights: { metro: 1.2, airport: 1.15, industrial: 1.05, highway: 1.3 },
    schedule_pressure_weight: 1.35,
    cost_pressure_weight: 0.8,
  },
  {
    id: "proc-tier3-vendor",
    category: "procurement",
    title: "Alternative material vendor at 18% lower cost",
    situation:
      "A new Tier-3 supplier offers a deep discount on a critical material package and promises immediate availability. Your procurement team is split between protecting quality and grabbing a much-needed cost win.",
    options: [
      {
        id: "reject-offer",
        label: "Reject and stay proven",
        description: "You protect quality certainty, but miss a cost saving when margins are tight.",
        impact: { spi: 0, cpi: -0.01, safety: 2, stakeholder: 1, cash: -4 },
        risk_level: "low",
      },
      {
        id: "accept-with-trials",
        label: "Accept with trials",
        description: "You ringfence the risk with sample testing and staged release.",
        impact: { spi: 0.01, cpi: 0.02, safety: 0, stakeholder: 0, cash: 8 },
        risk_level: "medium",
      },
      {
        id: "accept-immediately",
        label: "Accept immediately",
        description: "Your CPI jumps early, but any quality failure will come back hard later.",
        impact: { spi: 0.02, cpi: 0.05, safety: -3, stakeholder: -2, cash: 16 },
        risk_level: "high",
      },
    ],
    scenario_weights: { metro: 1.15, airport: 1.1, industrial: 1.2, highway: 1.25 },
    schedule_pressure_weight: 0.9,
    cost_pressure_weight: 1.4,
  },
  {
    id: "proc-crane-capex",
    category: "procurement",
    title: "Critical crane: hire or buy",
    situation:
      "A long-reach crane has become the bottleneck on your critical path. The operations team needs a decision this week because either route affects mobilization and liquidity.",
    options: [
      {
        id: "hire-premium",
        label: "Hire at premium",
        description: "You protect schedule flexibility, but the monthly burn is painful.",
        impact: { spi: 0.03, cpi: -0.03, safety: 1, stakeholder: 0, cash: -14 },
        risk_level: "low",
      },
      {
        id: "buy-outright",
        label: "Buy outright",
        description: "You secure the asset for the long term, but lock up capital immediately.",
        impact: { spi: 0.02, cpi: 0.01, safety: 1, stakeholder: 0, cash: -24 },
        risk_level: "medium",
      },
      {
        id: "share-equipment",
        label: "Share with peer contractor",
        description: "You save money, but coordination failures can ripple straight into the schedule.",
        impact: { spi: -0.03, cpi: 0.02, safety: -1, stakeholder: -1, cash: 10 },
        risk_level: "high",
      },
    ],
    scenario_weights: { metro: 1.25, airport: 1.2, industrial: 1.1, highway: 1.15 },
    schedule_pressure_weight: 1.5,
    cost_pressure_weight: 1.05,
  },
  {
    id: "proc-import-clearance",
    category: "procurement",
    title: "Imported systems stuck at port",
    situation:
      "A customs hold has trapped imported systems needed for a milestone handover. The site team can either pay to accelerate clearance or re-sequence work and absorb uncertainty.",
    options: [
      {
        id: "fast-track-clearance",
        label: "Fast-track clearance",
        description: "You spend more now, but keep the handover sequence intact.",
        impact: { spi: 0.03, cpi: -0.02, safety: 0, stakeholder: 2, cash: -12 },
        risk_level: "low",
      },
      {
        id: "resequence-works",
        label: "Re-sequence works",
        description: "The site stays busy, though interfaces become harder to manage.",
        impact: { spi: -0.01, cpi: 0.01, safety: 0, stakeholder: -1, cash: 3 },
        risk_level: "medium",
      },
      {
        id: "substitute-local",
        label: "Substitute locally",
        description: "You regain pace with a local substitute, but technical acceptance becomes uncertain.",
        impact: { spi: 0.02, cpi: 0.03, safety: -2, stakeholder: -2, cash: 12 },
        risk_level: "high",
      },
    ],
    scenario_weights: { metro: 1.3, airport: 1.3, industrial: 1.05, highway: 0.95 },
    schedule_pressure_weight: 1.4,
    cost_pressure_weight: 1,
  },
  {
    id: "proc-batch-failure",
    category: "procurement",
    title: "Test failure in a material batch",
    situation:
      "A recent batch has failed one of the acceptance tests, but replacing it means a visible hit to the near-term programme. The project controls team wants a management call before the consultant hears rumours from site.",
    options: [
      {
        id: "replace-full-batch",
        label: "Replace full batch",
        description: "You absorb pain early and retain technical credibility with the consultant.",
        impact: { spi: -0.02, cpi: -0.03, safety: 3, stakeholder: 3, cash: -11 },
        risk_level: "low",
      },
      {
        id: "segregate-and-retest",
        label: "Segregate and retest",
        description: "You buy time to isolate the issue, though the team works under tighter supervision.",
        impact: { spi: -0.01, cpi: -0.01, safety: 1, stakeholder: 1, cash: -5 },
        risk_level: "medium",
      },
      {
        id: "use-and-monitor",
        label: "Use and monitor",
        description: "You keep output moving, but any defect later will look like a deliberate shortcut.",
        impact: { spi: 0.02, cpi: 0.03, safety: -4, stakeholder: -4, cash: 11 },
        risk_level: "high",
      },
    ],
    scenario_weights: { metro: 1.15, airport: 1.1, industrial: 1.2, highway: 1.05 },
    schedule_pressure_weight: 0.85,
    cost_pressure_weight: 0.95,
  },
  {
    id: "client-spec-upgrade",
    category: "client",
    title: "Client wants a spec upgrade with no VO yet",
    situation:
      "The client team has verbally pushed for an upgraded scope mid-execution, but no variation order has been issued. Your PM says the client is acting as if the instruction is already approved.",
    options: [
      {
        id: "refuse-without-vo",
        label: "Refuse without VO",
        description: "You protect margin discipline, but the relationship turns visibly harder.",
        impact: { spi: -0.02, cpi: 0.03, safety: 0, stakeholder: -4, cash: 8 },
        risk_level: "medium",
      },
      {
        id: "agree-informally",
        label: "Agree informally",
        description: "You keep the client warm, but execution starts consuming unpaid scope.",
        impact: { spi: 0.02, cpi: -0.04, safety: 0, stakeholder: 4, cash: -14 },
        risk_level: "high",
      },
      {
        id: "partial-pending-vo",
        label: "Partial pending VO",
        description: "You release limited scope, show good faith, and keep leverage for the formal approval.",
        impact: { spi: 0.01, cpi: -0.01, safety: 0, stakeholder: 2, cash: -5 },
        risk_level: "low",
      },
      {
        id: "escalate-md",
        label: "Escalate to MD",
        description: "Senior attention may unlock a decision, but the project team loses some day-to-day trust.",
        impact: { spi: 0, cpi: 0.01, safety: 0, stakeholder: -2, cash: 2 },
        risk_level: "medium",
      },
    ],
    scenario_weights: { metro: 1.25, airport: 1.2, industrial: 1, highway: 1.05 },
    schedule_pressure_weight: 0.95,
    cost_pressure_weight: 1.2,
  },
  {
    id: "client-rebaseline",
    category: "client",
    title: "New client PM wants to re-baseline schedule",
    situation:
      "The client has rotated in a new project manager who wants to revisit the master baseline. Your team believes the current float is one of the few protections you still control.",
    options: [
      {
        id: "accept-rebaseline",
        label: "Accept rebaseline",
        description: "You reset the relationship positively, but surrender leverage and usable float.",
        impact: { spi: -0.03, cpi: 0, safety: 0, stakeholder: 3, cash: 0 },
        risk_level: "medium",
      },
      {
        id: "resist-firmly",
        label: "Resist firmly",
        description: "You defend your position, though the client now reads your team as combative.",
        impact: { spi: 0.01, cpi: 0.01, safety: 0, stakeholder: -4, cash: 3 },
        risk_level: "high",
      },
      {
        id: "negotiate-partial",
        label: "Negotiate partial reset",
        description: "You give the client a clean narrative without giving away every recovery buffer.",
        impact: { spi: -0.01, cpi: 0, safety: 0, stakeholder: 2, cash: 1 },
        risk_level: "low",
      },
      {
        id: "request-change-order",
        label: "Request change order",
        description: "You formalize the process, but the paperwork cycle slows near-term decisions.",
        impact: { spi: -0.02, cpi: 0.02, safety: 0, stakeholder: -1, cash: 5 },
        risk_level: "medium",
      },
    ],
    scenario_weights: { metro: 1.2, airport: 1.2, industrial: 1, highway: 1.05 },
    schedule_pressure_weight: 1.3,
    cost_pressure_weight: 0.85,
  },
  {
    id: "client-inauguration-pressure",
    category: "client",
    title: "Political inauguration pressure on an incomplete structure",
    situation:
      "Local stakeholders are pushing for a public opening before every workfront is genuinely ready. The ask is politically sensitive and the client is avoiding putting the instruction in writing.",
    options: [
      {
        id: "refuse-request",
        label: "Refuse handover",
        description: "You hold the technical line, but political and client frustration escalates fast.",
        impact: { spi: -0.01, cpi: 0, safety: 3, stakeholder: -4, cash: 0 },
        risk_level: "medium",
      },
      {
        id: "agree-with-disclaimers",
        label: "Agree with disclaimers",
        description: "The event goes ahead, but your team now carries visible safety exposure.",
        impact: { spi: 0.02, cpi: 0, safety: -5, stakeholder: 2, cash: 0 },
        risk_level: "high",
      },
      {
        id: "partial-handover",
        label: "Partial zone handover",
        description: "You contain the exposure by opening only complete zones and keeping unsafe fronts closed.",
        impact: { spi: 0.01, cpi: 0, safety: 2, stakeholder: 1, cash: 0 },
        risk_level: "low",
      },
      {
        id: "request-extension",
        label: "Request formal extension",
        description: "You push the decision back to process, which buys safety but tests stakeholder patience.",
        impact: { spi: -0.02, cpi: 0.01, safety: 2, stakeholder: -2, cash: 2 },
        risk_level: "medium",
      },
    ],
    scenario_weights: { metro: 1.3, airport: 1.15, industrial: 0.95, highway: 1.05 },
    schedule_pressure_weight: 1.25,
    cost_pressure_weight: 0.7,
  },
  {
    id: "client-night-shift-demand",
    category: "client",
    title: "Client demands extended night shifts near a milestone",
    situation:
      "A milestone is slipping and the client wants night work across major zones for the next three weeks. Site leaders warn the request is feasible only with tighter supervision and fatigue controls.",
    options: [
      {
        id: "decline-night-shift",
        label: "Decline night shift",
        description: "You avoid fatigue exposure, but give up a visible recovery opportunity.",
        impact: { spi: -0.03, cpi: 0.01, safety: 3, stakeholder: -2, cash: 3 },
        risk_level: "medium",
      },
      {
        id: "approve-full-night-shift",
        label: "Approve full rollout",
        description: "Schedule gets a lift, but site discipline and fatigue become real management problems.",
        impact: { spi: 0.04, cpi: -0.02, safety: -4, stakeholder: 1, cash: -8 },
        risk_level: "high",
      },
      {
        id: "pilot-critical-zones",
        label: "Pilot critical zones only",
        description: "You target the bottleneck without overstretching every crew at once.",
        impact: { spi: 0.02, cpi: -0.01, safety: -1, stakeholder: 1, cash: -4 },
        risk_level: "medium",
      },
    ],
    scenario_weights: { metro: 1.1, airport: 1.2, industrial: 1.05, highway: 1.15 },
    schedule_pressure_weight: 1.5,
    cost_pressure_weight: 0.8,
  },
  {
    id: "reg-ngo-clearance",
    category: "regulatory",
    title: "Environmental clearance challenge from NGO",
    situation:
      "A local NGO has raised a formal challenge around part of your alignment. The issue now has enough visibility that any move will be read as a signal of how seriously you take environmental commitments.",
    options: [
      {
        id: "legal-escalation",
        label: "Legal escalation",
        description: "You defend the approval path strongly, though time and legal spend both climb.",
        impact: { spi: -0.02, cpi: -0.02, safety: 0, stakeholder: -3, cash: -12 },
        risk_level: "high",
      },
      {
        id: "redesign-avoid-zone",
        label: "Redesign to avoid zone",
        description: "You reduce public hostility, but accept a real redesign and delay cost.",
        impact: { spi: -0.04, cpi: -0.03, safety: 1, stakeholder: 4, cash: -18 },
        risk_level: "medium",
      },
      {
        id: "community-outreach",
        label: "Lead community outreach",
        description: "You slow the pace temporarily, but create room for a less adversarial settlement.",
        impact: { spi: -0.01, cpi: -0.01, safety: 0, stakeholder: 3, cash: -6 },
        risk_level: "low",
      },
      {
        id: "engage-moef",
        label: "Engage MOEF directly",
        description: "A higher-level intervention may help, but the outcome is hard to predict and slow to land.",
        impact: { spi: -0.02, cpi: 0, safety: 0, stakeholder: 0, cash: -4 },
        risk_level: "medium",
      },
    ],
    scenario_weights: { metro: 1.1, airport: 1.15, industrial: 1.05, highway: 1.3 },
    schedule_pressure_weight: 1,
    cost_pressure_weight: 0.9,
  },
  {
    id: "reg-labour-inspector",
    category: "regulatory",
    title: "Surprise labour inspection finds gaps",
    situation:
      "A labour inspector has flagged gaps in worker documentation and camp controls during an unannounced visit. The issue is manageable now, but only if your response is disciplined.",
    options: [
      {
        id: "rectify-immediately",
        label: "Rectify immediately",
        description: "You spend money fast, but close the issue before it becomes a broader credibility problem.",
        impact: { spi: -0.01, cpi: -0.02, safety: 3, stakeholder: 2, cash: -9 },
        risk_level: "low",
      },
      {
        id: "negotiate-informally",
        label: "Negotiate informally",
        description: "The visit may blow over, but the ethical and reputational risk rises sharply.",
        impact: { spi: 0.01, cpi: 0.01, safety: -3, stakeholder: -4, cash: 5 },
        risk_level: "high",
      },
      {
        id: "contest-findings",
        label: "Contest findings",
        description: "You defend the record, though the process drags management attention and legal support.",
        impact: { spi: -0.02, cpi: -0.01, safety: 0, stakeholder: -2, cash: -5 },
        risk_level: "medium",
      },
      {
        id: "accept-penalty",
        label: "Accept penalty",
        description: "You keep the matter contained, but take a direct cash hit with little upside.",
        impact: { spi: 0, cpi: -0.03, safety: 1, stakeholder: 0, cash: -12 },
        risk_level: "medium",
      },
    ],
    scenario_weights: { metro: 1.1, airport: 1.05, industrial: 1.25, highway: 1.15 },
    schedule_pressure_weight: 0.8,
    cost_pressure_weight: 0.95,
  },
  {
    id: "reg-fire-noc",
    category: "regulatory",
    title: "Fire NOC comments arrive late in the cycle",
    situation:
      "Fire authority comments have landed just before a planned handover gate. The team can either redesign now, push for provisional clearance, or split the handover package.",
    options: [
      {
        id: "redesign-now",
        label: "Redesign now",
        description: "You protect compliance and future auditability, but absorb immediate redesign drag.",
        impact: { spi: -0.03, cpi: -0.02, safety: 4, stakeholder: 2, cash: -10 },
        risk_level: "low",
      },
      {
        id: "provisional-clearance",
        label: "Push provisional NOC",
        description: "You may save the milestone, though any rejection later becomes much costlier.",
        impact: { spi: 0.03, cpi: 0.01, safety: -4, stakeholder: -2, cash: 6 },
        risk_level: "high",
      },
      {
        id: "split-handover",
        label: "Split the handover",
        description: "You ringfence the non-compliant area and keep part of the milestone alive.",
        impact: { spi: 0.01, cpi: -0.01, safety: 2, stakeholder: 1, cash: -3 },
        risk_level: "medium",
      },
    ],
    scenario_weights: { metro: 1.2, airport: 1.3, industrial: 1.05, highway: 0.85 },
    schedule_pressure_weight: 1.35,
    cost_pressure_weight: 0.85,
  },
  {
    id: "reg-water-discharge",
    category: "regulatory",
    title: "Water discharge notice after heavy rains",
    situation:
      "Post-rain runoff from the site has triggered a local discharge notice. Regulators want immediate controls, while operations argues the event was temporary and self-correcting.",
    options: [
      {
        id: "install-controls-now",
        label: "Install controls now",
        description: "You spend against the issue immediately and reduce repeat exposure fast.",
        impact: { spi: -0.01, cpi: -0.02, safety: 1, stakeholder: 3, cash: -8 },
        risk_level: "low",
      },
      {
        id: "temporary-workaround",
        label: "Use temporary workaround",
        description: "You save some cost today, but leave the team exposed if another storm hits.",
        impact: { spi: 0.01, cpi: 0.01, safety: -2, stakeholder: -3, cash: 4 },
        risk_level: "high",
      },
      {
        id: "joint-audit",
        label: "Invite joint audit",
        description: "You open the books to regulators, slowing the week but building confidence in your response.",
        impact: { spi: -0.02, cpi: -0.01, safety: 1, stakeholder: 4, cash: -4 },
        risk_level: "medium",
      },
    ],
    scenario_weights: { metro: 0.95, airport: 1, industrial: 1.05, highway: 1.25 },
    schedule_pressure_weight: 0.75,
    cost_pressure_weight: 0.8,
  },
  {
    id: "com-running-bill-cut",
    category: "commercial",
    title: "Running bill certified at 60% of claimed amount",
    situation:
      "The client has certified only part of your running bill and left major lines pending. Commercial, site, and subcontract teams all want different responses because cash is already tightening.",
    options: [
      {
        id: "accept-and-move",
        label: "Accept and move on",
        description: "You avoid a visible fight, but live with immediate cash flow pressure.",
        impact: { spi: 0.01, cpi: -0.02, safety: 0, stakeholder: 1, cash: -18 },
        risk_level: "low",
      },
      {
        id: "dispute-formally",
        label: "Dispute formally",
        description: "You defend entitlement, though the process adds friction and slows decisions.",
        impact: { spi: -0.02, cpi: 0.02, safety: 0, stakeholder: -3, cash: 8 },
        risk_level: "medium",
      },
      {
        id: "negotiate-eighty",
        label: "Negotiate at 80%",
        description: "You secure a practical middle ground and release some cash pressure quickly.",
        impact: { spi: 0.01, cpi: 0.01, safety: 0, stakeholder: 1, cash: -7 },
        risk_level: "low",
      },
      {
        id: "withhold-subcontractor",
        label: "Withhold subcontractor payment",
        description: "Your cash position improves now, but trust on site erodes and delivery risk rises.",
        impact: { spi: -0.03, cpi: 0.03, safety: -2, stakeholder: -4, cash: 15 },
        risk_level: "high",
      },
    ],
    scenario_weights: { metro: 1.15, airport: 1.05, industrial: 1.1, highway: 1.2 },
    schedule_pressure_weight: 0.9,
    cost_pressure_weight: 1.5,
  },
  {
    id: "com-steel-spike",
    category: "commercial",
    title: "Steel price spike with no escalation clause",
    situation:
      "Steel has spiked 22% and your contract gives you no clean escalation route. The commercial team needs a decision before upcoming packages are procured at the new rate.",
    options: [
      {
        id: "absorb-fully",
        label: "Absorb fully",
        description: "You keep the client calm, but your margin shrinks materially.",
        impact: { spi: 0, cpi: -0.05, safety: 0, stakeholder: 2, cash: -18 },
        risk_level: "low",
      },
      {
        id: "claim-force-majeure",
        label: "Claim force majeure",
        description: "You try a hard commercial position, though success is uncertain and relationally costly.",
        impact: { spi: -0.01, cpi: 0.02, safety: 0, stakeholder: -3, cash: 6 },
        risk_level: "high",
      },
      {
        id: "value-engineer",
        label: "Value engineer",
        description: "You rework the design basis to recover cost, but spend time validating acceptance.",
        impact: { spi: -0.02, cpi: 0.03, safety: 0, stakeholder: 0, cash: 9 },
        risk_level: "medium",
      },
      {
        id: "renegotiate-proactively",
        label: "Renegotiate proactively",
        description: "You open the issue early and may preserve trust even if relief is partial.",
        impact: { spi: 0, cpi: 0.01, safety: 0, stakeholder: 2, cash: 3 },
        risk_level: "medium",
      },
    ],
    scenario_weights: { metro: 1.1, airport: 1.1, industrial: 1.2, highway: 1.15 },
    schedule_pressure_weight: 0.7,
    cost_pressure_weight: 1.55,
  },
  {
    id: "com-advance-recovery",
    category: "commercial",
    title: "Advance recovery deduction hits this quarter",
    situation:
      "The client has accelerated recovery of past advances just as your working capital is tightening. Finance wants cash protection, but site leadership is worried about the downstream effect on vendors and morale.",
    options: [
      {
        id: "bridge-with-debt",
        label: "Bridge with debt",
        description: "You protect payment continuity, but financing costs step up immediately.",
        impact: { spi: 0.01, cpi: -0.02, safety: 0, stakeholder: 1, cash: -8 },
        risk_level: "medium",
      },
      {
        id: "slow-discretionary-spend",
        label: "Slow discretionary spend",
        description: "Cash improves, though some productivity and goodwill soften around the edges.",
        impact: { spi: -0.01, cpi: 0.02, safety: 0, stakeholder: -1, cash: 7 },
        risk_level: "low",
      },
      {
        id: "delay-vendor-payments",
        label: "Delay vendor payments",
        description: "Liquidity improves fast, but site trust and delivery reliability both deteriorate.",
        impact: { spi: -0.03, cpi: 0.03, safety: -1, stakeholder: -4, cash: 14 },
        risk_level: "high",
      },
    ],
    scenario_weights: { metro: 1.05, airport: 1.05, industrial: 1.2, highway: 1.15 },
    schedule_pressure_weight: 0.8,
    cost_pressure_weight: 1.45,
  },
  {
    id: "people-poached-engineer",
    category: "people",
    title: "Key site engineer poached by a competitor",
    situation:
      "A competing contractor has made an offer to one of your key site engineers during a critical execution window. The team expects a same-day response because rumours are already spreading through the site office.",
    options: [
      {
        id: "counter-offer",
        label: "Counter-offer now",
        description: "You protect continuity, but set an expensive benchmark for the rest of the team.",
        impact: { spi: 0.02, cpi: -0.02, safety: 1, stakeholder: 0, cash: -6 },
        risk_level: "medium",
      },
      {
        id: "promote-internal",
        label: "Promote from within",
        description: "You back internal growth, but the transition creates short-term execution risk.",
        impact: { spi: -0.02, cpi: 0.01, safety: -1, stakeholder: 1, cash: 2 },
        risk_level: "medium",
      },
      {
        id: "hire-lateral",
        label: "Hire lateral replacement",
        description: "You keep capability intact eventually, though the site absorbs a handover lag first.",
        impact: { spi: -0.01, cpi: -0.01, safety: 0, stakeholder: 0, cash: -4 },
        risk_level: "low",
      },
      {
        id: "restructure-roles",
        label: "Restructure responsibilities",
        description: "You avoid a quick spend decision, but stretch existing leaders harder.",
        impact: { spi: -0.03, cpi: 0.02, safety: -2, stakeholder: -1, cash: 5 },
        risk_level: "high",
      },
    ],
    scenario_weights: { metro: 1.05, airport: 1.05, industrial: 1.2, highway: 1.1 },
    schedule_pressure_weight: 1.2,
    cost_pressure_weight: 1,
  },
  {
    id: "people-whistleblower",
    category: "people",
    title: "Whistleblower raises a safety concern",
    situation:
      "A junior engineer has raised a serious safety concern and says they will escalate externally if ignored. Supervisors insist the issue is being exaggerated, but the allegation is specific enough to require a management response.",
    options: [
      {
        id: "investigate-immediately",
        label: "Investigate immediately",
        description: "You slow work briefly, but show the team and client that the concern is being handled properly.",
        impact: { spi: -0.01, cpi: -0.01, safety: 4, stakeholder: 3, cash: -4 },
        risk_level: "low",
      },
      {
        id: "handle-internally",
        label: "Handle quietly",
        description: "You keep the issue off the radar for now, but suppression risk grows if facts emerge later.",
        impact: { spi: 0.01, cpi: 0.01, safety: -3, stakeholder: -3, cash: 3 },
        risk_level: "high",
      },
      {
        id: "ignore-concern",
        label: "Ignore the concern",
        description: "Short-term disruption is avoided, but the ethical and safety downside is severe.",
        impact: { spi: 0.01, cpi: 0.01, safety: -5, stakeholder: -5, cash: 2 },
        risk_level: "high",
      },
      {
        id: "escalate-to-client",
        label: "Escalate to client",
        description: "You signal transparency, though the client now expects formal corrective action.",
        impact: { spi: -0.02, cpi: -0.01, safety: 3, stakeholder: 4, cash: -3 },
        risk_level: "medium",
      },
    ],
    scenario_weights: { metro: 1.15, airport: 1.2, industrial: 1.1, highway: 1.05 },
    schedule_pressure_weight: 0.7,
    cost_pressure_weight: 0.7,
  },
  {
    id: "people-union-rumour",
    category: "people",
    title: "Labour unrest rumours start on site",
    situation:
      "Rumours of a walkout are spreading after delayed camp improvements and overtime complaints. Supervisors think they can contain it informally, but the mood on site is turning quickly.",
    options: [
      {
        id: "meet-and-fix",
        label: "Meet workers and fix basics",
        description: "You spend modestly to cool tensions and rebuild credibility before they harden.",
        impact: { spi: -0.01, cpi: -0.02, safety: 2, stakeholder: 2, cash: -7 },
        risk_level: "low",
      },
      {
        id: "wait-and-watch",
        label: "Wait and watch",
        description: "You preserve cash today, but the risk of a sharper disruption remains alive.",
        impact: { spi: -0.03, cpi: 0.01, safety: -2, stakeholder: -2, cash: 4 },
        risk_level: "medium",
      },
      {
        id: "replace-crew-threat",
        label: "Threaten replacement",
        description: "Output may hold for a moment, but site trust and safety discipline both deteriorate.",
        impact: { spi: 0.01, cpi: 0.02, safety: -4, stakeholder: -4, cash: 6 },
        risk_level: "high",
      },
    ],
    scenario_weights: { metro: 0.95, airport: 1, industrial: 1.25, highway: 1.15 },
    schedule_pressure_weight: 1.25,
    cost_pressure_weight: 0.9,
  },
];

function hashUnit(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function resolveScenarioFamily(scenarioType: string): ScenarioFamily {
  const normalized = scenarioType.toLowerCase();

  if (normalized.includes("metro")) return "metro";
  if (normalized.includes("airport")) return "airport";
  if (normalized.includes("industrial")) return "industrial";

  return "highway";
}

function categoryRoundWeight(category: DilemmaCategory, roundNumber: number) {
  if (roundNumber <= 2) {
    if (category === "procurement") return 1.45;
    if (category === "people") return 1.3;
    if (category === "commercial") return 0.95;
    return 0.75;
  }

  if (roundNumber >= 4) {
    if (category === "client") return 1.35;
    if (category === "commercial") return 1.3;
    if (category === "regulatory") return 1.2;
    return 0.85;
  }

  if (category === "procurement" || category === "people") return 1.1;
  if (category === "client" || category === "commercial") return 1.05;
  return 1;
}

function dilemmaWeight(
  entry: DilemmaBankEntry,
  family: ScenarioFamily,
  roundNumber: number,
  previousRoundPerformance?: DilemmaRoundSelectionInput["previous_round_performance"]
) {
  const spi = toNumber(previousRoundPerformance?.spi);
  const cpi = toNumber(previousRoundPerformance?.cpi);
  const schedulePressure = spi !== null && spi < 0.97 ? (0.97 - spi) * 18 : 0;
  const costPressure = cpi !== null && cpi < 0.97 ? (0.97 - cpi) * 18 : 0;

  return (
    entry.scenario_weights[family] *
    categoryRoundWeight(entry.category, roundNumber) *
    (1 + schedulePressure * entry.schedule_pressure_weight * 0.09 + costPressure * entry.cost_pressure_weight * 0.09)
  );
}

function sortBySelectionScore(
  entries: DilemmaBankEntry[],
  input: DilemmaRoundSelectionInput
) {
  const family = resolveScenarioFamily(input.scenario_type);
  const seedRoot = `${input.session_id}:${input.round_number}`;

  return [...entries].sort((left, right) => {
    const leftScore =
      dilemmaWeight(left, family, input.round_number, input.previous_round_performance) +
      hashUnit(`${seedRoot}:${left.id}`) * 0.35;
    const rightScore =
      dilemmaWeight(right, family, input.round_number, input.previous_round_performance) +
      hashUnit(`${seedRoot}:${right.id}`) * 0.35;

    return rightScore - leftScore;
  });
}

export function getCategoryLabel(category: DilemmaCategory) {
  return CATEGORY_LABELS[category];
}

export function listAllDilemmas(): Dilemma[] {
  return DILEMMA_BANK.map(({ scenario_weights, schedule_pressure_weight, cost_pressure_weight, ...dilemma }) => dilemma);
}

export function selectDilemmasForRound(input: DilemmaRoundSelectionInput): Dilemma[] {
  const ranked = sortBySelectionScore(DILEMMA_BANK, input);
  const selected: DilemmaBankEntry[] = [];

  for (const candidate of ranked) {
    const duplicateCount = selected.filter((item) => item.category === candidate.category).length;
    const sameTitle = selected.some((item) => item.id === candidate.id);
    if (sameTitle) continue;
    if (duplicateCount >= 2) continue;
    selected.push(candidate);
    if (selected.length === 3) break;
  }

  return selected.map(({ scenario_weights, schedule_pressure_weight, cost_pressure_weight, ...dilemma }) => dilemma);
}

export function getDilemmaById(dilemmaId: string) {
  return listAllDilemmas().find((dilemma) => dilemma.id === dilemmaId) ?? null;
}

export function getDilemmaOption(dilemma: Dilemma, optionId: string) {
  return dilemma.options.find((option) => option.id === optionId) ?? null;
}

export function getSelectedDilemmaRecords(
  dilemmas: Dilemma[],
  selectedOptionIds: DilemmaSelectionMap
): DilemmaSelectionRecord[] {
  return dilemmas.flatMap((dilemma) => {
    const optionId = selectedOptionIds[dilemma.id];
    if (!optionId) return [];

    const option = getDilemmaOption(dilemma, optionId);
    if (!option) return [];

    return [
      {
        dilemma_id: dilemma.id,
        dilemma_title: dilemma.title,
        category: dilemma.category,
        option_id: option.id,
        option_label: option.label,
        outcome_description: option.description,
        risk_level: option.risk_level,
        impact: option.impact,
      },
    ];
  });
}

export function deriveManagementFields(
  dilemmas: Dilemma[],
  selectedOptionIds: DilemmaSelectionMap
): DerivedManagementFields {
  const selected = getSelectedDilemmaRecords(dilemmas, selectedOptionIds);
  if (selected.length === 0) return DEFAULT_DERIVED_FIELDS;

  const totals = selected.reduce(
    (accumulator, record) => {
      accumulator.spi += record.impact.spi;
      accumulator.cpi += record.impact.cpi;
      accumulator.safety += record.impact.safety;
      accumulator.stakeholder += record.impact.stakeholder;
      accumulator.cash += record.impact.cash;
      accumulator.highRisk += record.risk_level === "high" ? 1 : 0;
      accumulator.mediumRisk += record.risk_level === "medium" ? 1 : 0;
      return accumulator;
    },
    { spi: 0, cpi: 0, safety: 0, stakeholder: 0, cash: 0, highRisk: 0, mediumRisk: 0 }
  );

  const governanceSignal =
    totals.safety * 0.9 + totals.stakeholder * 0.65 - totals.highRisk * 2.1 - Math.max(0, totals.cash) * 0.08;
  const aggressionSignal =
    totals.cpi * 20 + totals.spi * 14 + totals.cash * 0.06 - totals.safety * 0.3 - totals.stakeholder * 0.28;
  const riskSignal = totals.highRisk * 1.6 + totals.mediumRisk * 0.7 + Math.max(0, aggressionSignal) * 0.22;

  let risk_appetite: RiskAppetite = "Balanced";
  if (riskSignal >= 3 || aggressionSignal >= 1.6) {
    risk_appetite = "Aggressive";
  } else if (governanceSignal >= 3.2 || totals.safety >= 4 || totals.stakeholder >= 4) {
    risk_appetite = "Conservative";
  }

  let governance_intensity: Governance = "Medium";
  if (governanceSignal >= 2.5) {
    governance_intensity = "High";
  } else if (governanceSignal <= -1.5) {
    governance_intensity = "Low";
  }

  let public_message_tone: MessageTone = "Confident";
  if (totals.stakeholder >= 3 || governance_intensity === "High") {
    public_message_tone = "Collaborative";
  } else if (totals.highRisk >= 2 || totals.stakeholder <= -3) {
    public_message_tone = "Aggressive";
  }

  const rawBid =
    3 +
    aggressionSignal * 0.45 +
    (risk_appetite === "Aggressive" ? 0.35 : 0) -
    (governance_intensity === "High" ? 0.3 : 0);

  return {
    bid_aggressiveness: clamp(Math.round(rawBid), 1, 5),
    risk_appetite,
    governance_intensity,
    public_message_tone,
  };
}

export function buildDilemmaRoundSummary(
  dilemmas: Dilemma[],
  selectedOptionIds: DilemmaSelectionMap,
  scenarioType: string,
  roundNumber: number
): DilemmaRoundSummary {
  return {
    scenario_family: resolveScenarioFamily(scenarioType),
    round_number: roundNumber,
    selected: getSelectedDilemmaRecords(dilemmas, selectedOptionIds),
    derived_fields: deriveManagementFields(dilemmas, selectedOptionIds),
  };
}

function isImpact(value: unknown): value is DilemmaOption["impact"] {
  if (!value || typeof value !== "object") return false;
  const impact = value as Record<string, unknown>;
  return (
    typeof impact.spi === "number" &&
    typeof impact.cpi === "number" &&
    typeof impact.safety === "number" &&
    typeof impact.stakeholder === "number" &&
    typeof impact.cash === "number"
  );
}

export function parseStoredDilemmaSummary(raw: Record<string, unknown> | null | undefined): DilemmaRoundSummary | null {
  const source = raw?.management_dilemmas;
  if (!source || typeof source !== "object") return null;

  const summary = source as Record<string, unknown>;
  const selected = Array.isArray(summary.selected)
    ? summary.selected.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const record = item as Record<string, unknown>;
        if (
          typeof record.dilemma_id !== "string" ||
          typeof record.dilemma_title !== "string" ||
          typeof record.category !== "string" ||
          typeof record.option_id !== "string" ||
          typeof record.option_label !== "string" ||
          typeof record.outcome_description !== "string" ||
          typeof record.risk_level !== "string" ||
          !isImpact(record.impact)
        ) {
          return [];
        }

        return [
          {
            dilemma_id: record.dilemma_id,
            dilemma_title: record.dilemma_title,
            category: record.category as Dilemma["category"],
            option_id: record.option_id,
            option_label: record.option_label,
            outcome_description: record.outcome_description,
            risk_level: record.risk_level as DilemmaOption["risk_level"],
            impact: record.impact,
          } satisfies DilemmaSelectionRecord,
        ];
      })
    : [];

  const derivedSource =
    summary.derived_fields && typeof summary.derived_fields === "object"
      ? (summary.derived_fields as Record<string, unknown>)
      : null;

  return {
    scenario_family:
      summary.scenario_family === "metro" ||
      summary.scenario_family === "airport" ||
      summary.scenario_family === "industrial" ||
      summary.scenario_family === "highway"
        ? summary.scenario_family
        : "highway",
    round_number: typeof summary.round_number === "number" ? summary.round_number : 1,
    selected,
    derived_fields: {
      bid_aggressiveness:
        typeof derivedSource?.bid_aggressiveness === "number"
          ? clamp(Math.round(derivedSource.bid_aggressiveness), 1, 5)
          : DEFAULT_DERIVED_FIELDS.bid_aggressiveness,
      risk_appetite:
        derivedSource?.risk_appetite === "Conservative" ||
        derivedSource?.risk_appetite === "Balanced" ||
        derivedSource?.risk_appetite === "Aggressive"
          ? derivedSource.risk_appetite
          : DEFAULT_DERIVED_FIELDS.risk_appetite,
      governance_intensity:
        derivedSource?.governance_intensity === "Low" ||
        derivedSource?.governance_intensity === "Medium" ||
        derivedSource?.governance_intensity === "High"
          ? derivedSource.governance_intensity
          : DEFAULT_DERIVED_FIELDS.governance_intensity,
      public_message_tone:
        derivedSource?.public_message_tone === "Confident" ||
        derivedSource?.public_message_tone === "Collaborative" ||
        derivedSource?.public_message_tone === "Aggressive"
          ? derivedSource.public_message_tone
          : DEFAULT_DERIVED_FIELDS.public_message_tone,
    },
  };
}
