import { type CarryoverState, DEFAULT_CARRYOVER_STATE } from "@/lib/consequenceEngine";

export type EventImpact = {
  schedule: number;
  cost: number;
  quality: number;
  safety: number;
  stakeholder: number;
  cash: number;
};

export type ConstructionEvent = {
  image_url?: string;
  id: string;
  title: string;
  description: string;
  severity: 1 | 2 | 3;
  tags: string[];
  impacts: EventImpact;
};

type WeightedConstructionEvent = ConstructionEvent & {
  base_weight?: number;
};

function seededUnit(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

const BASE_EVENTS: WeightedConstructionEvent[] = [
  {
    id: "monsoon-rainfall",
    title: "Heavy monsoon disrupts site progress",
    description:
      "Persistent rainfall slows earthwork, concrete curing windows, and transport turnaround in multiple regions.",
    severity: 3,
    tags: ["monsoon", "schedule", "logistics", "roads", "bridges", "dams"],
    impacts: { schedule: -0.07, cost: -0.03, quality: -2, safety: -3, stakeholder: -2, cash: -70000 },
  },
  {
    id: "labor-migration",
    title: "Skilled labor migration spike",
    description:
      "Festival and migration cycles reduce skilled labor availability, increasing overtime pressure and subcontract rates.",
    severity: 2,
    tags: ["labor", "productivity", "all-sectors"],
    impacts: { schedule: -0.04, cost: -0.02, quality: -1, safety: -2, stakeholder: -1, cash: -45000 },
  },
  {
    id: "diesel-volatility",
    title: "Fuel and haulage cost volatility",
    description:
      "Diesel price movement pushes up logistics and equipment operating costs this round.",
    severity: 2,
    tags: ["cost", "logistics", "roads", "airports", "heavy-civil"],
    impacts: { schedule: -0.01, cost: -0.05, quality: 0, safety: 0, stakeholder: -1, cash: -60000 },
  },
  {
    id: "permit-hold",
    title: "Municipal permit clarification hold",
    description:
      "A regulatory clarification delays approvals for selected work packages.",
    severity: 2,
    tags: ["regulatory", "governance", "real-estate", "residential"],
    impacts: { schedule: -0.05, cost: -0.01, quality: 0, safety: 0, stakeholder: -2, cash: -35000 },
  },
  {
    id: "material-qc",
    title: "Incoming material quality variance",
    description:
      "Unexpected variance in delivered material quality requires additional inspections and rework prevention.",
    severity: 2,
    tags: ["quality", "procurement", "bridges", "dams", "airports"],
    impacts: { schedule: -0.02, cost: -0.02, quality: -4, safety: -1, stakeholder: -1, cash: -30000 },
  },
  {
    id: "heatwave",
    title: "Heatwave productivity drop",
    description:
      "Extreme daytime heat reduces productivity windows and elevates worker safety risk.",
    severity: 2,
    tags: ["climate", "safety", "all-sectors"],
    impacts: { schedule: -0.03, cost: -0.01, quality: -1, safety: -3, stakeholder: -1, cash: -25000 },
  },
  {
    id: "fatigue-safety-incident",
    title: "Crew fatigue triggers a safety stand-down",
    description:
      "Extended overtime and supervision fatigue have culminated in a near-miss, forcing an incident review and temporary stand-down.",
    severity: 3,
    tags: ["safety", "labor", "all-sectors"],
    impacts: { schedule: -0.05, cost: -0.02, quality: -1, safety: -6, stakeholder: -2, cash: -65000 },
    base_weight: 0.35,
  },
  {
    id: "client-escalation",
    title: "Client escalation reaches executive level",
    description:
      "Frustration over unresolved issues has triggered an executive escalation from the client team, increasing scrutiny on recovery plans.",
    severity: 3,
    tags: ["stakeholder", "governance", "all-sectors"],
    impacts: { schedule: -0.03, cost: -0.01, quality: 0, safety: 0, stakeholder: -6, cash: -30000 },
    base_weight: 0.35,
  },
  {
    id: "audit-inspection",
    title: "Audit and inspection sweep announced",
    description:
      "Regulators have scheduled an expanded audit and inspection sweep after a pattern of weak process discipline across the project.",
    severity: 3,
    tags: ["regulatory", "compliance", "governance", "all-sectors"],
    impacts: { schedule: -0.04, cost: -0.02, quality: -1, safety: 0, stakeholder: -4, cash: -55000 },
    base_weight: 0.35,
  },
  {
    id: "labour-dispute",
    title: "Labour dispute disrupts workfronts",
    description:
      "Payment stress and site morale have spilled into a labour dispute, slowing output and raising disruption risk across active zones.",
    severity: 3,
    tags: ["labor", "productivity", "all-sectors"],
    impacts: { schedule: -0.05, cost: -0.03, quality: -1, safety: -2, stakeholder: -3, cash: -70000 },
    base_weight: 0.35,
  },
  {
    id: "billing-dispute",
    title: "Billing dispute delays certification",
    description:
      "Weak documentation has triggered a billing dispute, slowing certification and forcing the commercial team into rework mode.",
    severity: 2,
    tags: ["commercial", "governance", "stakeholder", "all-sectors"],
    impacts: { schedule: -0.02, cost: -0.02, quality: 0, safety: 0, stakeholder: -3, cash: -60000 },
    base_weight: 0.35,
  },
  {
    id: "anti-corruption-drive",
    title: "State anti-corruption vigilance drive",
    description:
      "Public procurement audit intensity rises. Governance quality and clean process discipline are under scrutiny.",
    severity: 2,
    tags: ["compliance", "governance", "public-procurement"],
    impacts: { schedule: -0.02, cost: -0.01, quality: 0, safety: 0, stakeholder: -4, cash: -50000 },
  },
  {
    id: "green-procurement",
    title: "Green procurement preference announced",
    description:
      "Tenders reward stronger ESG disclosures and sustainability-linked execution methods.",
    severity: 1,
    tags: ["sustainability", "stakeholder", "airports", "metro", "public-procurement"],
    impacts: { schedule: 0, cost: -0.01, quality: 1, safety: 1, stakeholder: 4, cash: 12000 },
  },
  {
    id: "highway-epc-pipeline",
    title: "New highway EPC pipeline opens",
    description:
      "Additional road and flyover packages are opened under fast-track tendering.",
    severity: 1,
    tags: ["roads", "bridges", "opportunity"],
    impacts: { schedule: 0.02, cost: 0.01, quality: 0, safety: 0, stakeholder: 2, cash: 30000 },
  },
  {
    id: "transmission-clearance",
    title: "Transmission corridor clearances improve",
    description:
      "Faster right-of-way resolution improves execution feasibility in power projects.",
    severity: 1,
    tags: ["transmission", "power", "opportunity"],
    impacts: { schedule: 0.03, cost: 0.01, quality: 1, safety: 1, stakeholder: 1, cash: 35000 },
  },
  {
    id: "real-estate-slowdown",
    title: "Urban real estate demand cools",
    description:
      "Slower absorption impacts residential and mixed-use project momentum.",
    severity: 2,
    tags: ["real-estate", "residential", "demand"],
    impacts: { schedule: -0.02, cost: -0.01, quality: 0, safety: 0, stakeholder: -2, cash: -45000 },
  },
  {
    id: "digital-inspection",
    title: "Digital inspection initiative support",
    description:
      "Government digital documentation initiative reduces compliance friction for prepared teams.",
    severity: 1,
    tags: ["governance", "compliance", "opportunity"],
    impacts: { schedule: 0.02, cost: 0.01, quality: 1, safety: 1, stakeholder: 2, cash: 15000 },
  },
];

function isMonsoonRound(roundNumber: number) {
  const phase = ((roundNumber - 1) % 4) + 1;
  return phase === 2 || phase === 3;
}

function eventWeight(event: WeightedConstructionEvent, carryoverState: CarryoverState) {
  let weight = event.base_weight ?? 1;

  if (event.id === "fatigue-safety-incident" && carryoverState.fatigue_index > 70) {
    weight *= 1.4;
  }

  if (event.id === "client-escalation" && carryoverState.relationship_score < 50) {
    weight *= 1.5;
  }

  if (event.id === "audit-inspection" && carryoverState.regulatory_exposure > 60) {
    weight *= 1.6;
  }

  if (event.id === "labour-dispute" && carryoverState.labour_stability < 50) {
    weight *= 1.5;
  }

  if (event.id === "billing-dispute" && carryoverState.documentation_quality < 40) {
    weight *= 1.4;
  }

  return Math.max(weight, 0.05);
}

function pickWeightedEvent(
  events: WeightedConstructionEvent[],
  usedIds: Set<string>,
  seed: string,
  carryoverState: CarryoverState
) {
  const available = events.filter((event) => !usedIds.has(event.id));
  if (available.length === 0) return null;

  const totalWeight = available.reduce((sum, event) => sum + eventWeight(event, carryoverState), 0);
  let roll = seededUnit(seed) * totalWeight;

  for (const event of available) {
    roll -= eventWeight(event, carryoverState);
    if (roll <= 0) return event;
  }

  return available[available.length - 1] ?? null;
}

export function isCarryoverDrivenEvent(eventId: string) {
  return [
    "fatigue-safety-incident",
    "client-escalation",
    "audit-inspection",
    "labour-dispute",
    "billing-dispute",
  ].includes(eventId);
}

export function mergeConstructionEvents(
  primaryEvents: ConstructionEvent[] | null | undefined,
  secondaryEvents: ConstructionEvent[] | null | undefined,
  limit = 4
) {
  const merged: ConstructionEvent[] = [];
  const seenIds = new Set<string>();

  for (const event of [...(primaryEvents ?? []), ...(secondaryEvents ?? [])]) {
    if (seenIds.has(event.id)) continue;
    merged.push(event);
    seenIds.add(event.id);
    if (merged.length >= limit) break;
  }

  return merged;
}

export function resolveRoundConstructionEvents(params: {
  sessionId: string;
  roundNumber: number;
  sharedEvents?: ConstructionEvent[] | null;
  carryoverState?: CarryoverState | null;
}) {
  const carryoverState = params.carryoverState ?? DEFAULT_CARRYOVER_STATE;
  const generatedEvents = getRoundConstructionEvents(params.sessionId, params.roundNumber, carryoverState);

  if (!params.sharedEvents || params.sharedEvents.length === 0) {
    return generatedEvents;
  }

  const carryoverEvents = generatedEvents.filter((event) => isCarryoverDrivenEvent(event.id));
  return mergeConstructionEvents(
    params.sharedEvents,
    carryoverEvents.length > 0 ? carryoverEvents : generatedEvents,
    4
  );
}

export function getRoundConstructionEvents(
  sessionId: string,
  roundNumber: number,
  carryoverState: CarryoverState = DEFAULT_CARRYOVER_STATE
): ConstructionEvent[] {
  const monsoon = isMonsoonRound(roundNumber);

  const weightedPool = BASE_EVENTS.filter((event) => {
    if (monsoon) return true;
    if (event.id === "monsoon-rainfall") return false;
    return true;
  });

  const chosen: ConstructionEvent[] = [];
  const used = new Set<string>();

  const firstEvent = pickWeightedEvent(weightedPool, used, `${sessionId}:r${roundNumber}:event-1`, carryoverState);
  if (firstEvent) {
    chosen.push(firstEvent);
    used.add(firstEvent.id);
  }

  if (monsoon && !used.has("monsoon-rainfall")) {
    const monsoonEvent = BASE_EVENTS.find((event) => event.id === "monsoon-rainfall");
    if (monsoonEvent) {
      chosen.unshift(monsoonEvent);
      used.add(monsoonEvent.id);
    }
  }

  const secondCandidate = pickWeightedEvent(weightedPool, used, `${sessionId}:r${roundNumber}:event-2`, carryoverState);
  if (secondCandidate && !used.has(secondCandidate.id)) {
    chosen.push(secondCandidate);
    used.add(secondCandidate.id);
  }

  const thirdRoll = seededUnit(`${sessionId}:r${roundNumber}:event-3`);
  if (thirdRoll > 0.55) {
    const thirdCandidate = pickWeightedEvent(weightedPool, used, `${sessionId}:r${roundNumber}:event-3b`, carryoverState);
    if (thirdCandidate && !used.has(thirdCandidate.id)) {
      chosen.push(thirdCandidate);
      used.add(thirdCandidate.id);
    }
  }

  return chosen.slice(0, 3);
}
