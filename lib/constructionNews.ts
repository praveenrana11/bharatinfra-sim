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

function seededUnit(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

const BASE_EVENTS: ConstructionEvent[] = [
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

export function getRoundConstructionEvents(sessionId: string, roundNumber: number): ConstructionEvent[] {
  const monsoon = isMonsoonRound(roundNumber);

  const weightedPool = BASE_EVENTS.filter((event) => {
    if (monsoon) return true;
    if (event.id === "monsoon-rainfall") return false;
    return true;
  });

  const chosen: ConstructionEvent[] = [];
  const used = new Set<string>();

  const firstIndex = Math.floor(seededUnit(`${sessionId}:r${roundNumber}:event-1`) * weightedPool.length);
  if (weightedPool[firstIndex]) {
    chosen.push(weightedPool[firstIndex]);
    used.add(weightedPool[firstIndex].id);
  }

  if (monsoon && !used.has("monsoon-rainfall")) {
    const monsoonEvent = BASE_EVENTS.find((event) => event.id === "monsoon-rainfall");
    if (monsoonEvent) {
      chosen.unshift(monsoonEvent);
      used.add(monsoonEvent.id);
    }
  }

  const secondIndex = Math.floor(seededUnit(`${sessionId}:r${roundNumber}:event-2`) * weightedPool.length);
  const secondCandidate = weightedPool[secondIndex];
  if (secondCandidate && !used.has(secondCandidate.id)) {
    chosen.push(secondCandidate);
    used.add(secondCandidate.id);
  }

  const thirdRoll = seededUnit(`${sessionId}:r${roundNumber}:event-3`);
  if (thirdRoll > 0.55) {
    const thirdIndex = Math.floor(seededUnit(`${sessionId}:r${roundNumber}:event-3b`) * weightedPool.length);
    const thirdCandidate = weightedPool[thirdIndex];
    if (thirdCandidate && !used.has(thirdCandidate.id)) {
      chosen.push(thirdCandidate);
      used.add(thirdCandidate.id);
    }
  }

  return chosen.slice(0, 3);
}
