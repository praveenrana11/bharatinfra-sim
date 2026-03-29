export type EventChoice = {
  id: string;
  label: string;
  theoryHint: string;
};

export type GameEvent = {
  id: string;
  title: string;
  description: string;
  choices: EventChoice[];
};

function mulberry32(a: number) {
  return function() {
    var t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

function stringToSeed(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash;
}

const EVENT_POOL: GameEvent[] = [
  {
    id: "EVT_LABOR_UNION",
    title: "Labor Union Demands",
    description: "The local union is demanding a 15% wage hike for skilled trades, threatening to strike and shut down critical path zones.",
    choices: [
      { id: "A", label: "Accept Demands", theoryHint: "Capitulation ensures schedule but ruins margin." },
      { id: "B", label: "Push Back & Replace", theoryHint: "Firm negotiation requires schedule buffer." },
      { id: "C", label: "Performance-Linked Bonus", theoryHint: "Collaborative contracting aligns incentives." }
    ]
  },
  {
    id: "EVT_MONSOON_WARNING",
    title: "Severe Weather Warning",
    description: "Meteorologists warn of early, unprecedented monsoons starting next month. Earthworks will be heavily impacted.",
    choices: [
      { id: "A", label: "Halt earthworks, secure site", theoryHint: "Defensive posturing preserves quality but damages SPI." },
      { id: "B", label: "Push earthworks with overtime", theoryHint: "Accelerating critical path buys time at a high CPI premium." },
      { id: "C", label: "Re-sequence to elevated structures", theoryHint: "Agile planning mitigates ground-level risk." }
    ]
  },
  {
    id: "EVT_STEEL_SPIKE",
    title: "Structural Steel Shortage",
    description: "Global supply chain constraints have caused structural steel prices to spike by 22% overnight.",
    choices: [
      { id: "A", label: "Absorb Cost Premium", theoryHint: "Buying at spot price hits CPI heavily but keeps site moving." },
      { id: "B", label: "Wait for Market Correction", theoryHint: "Pausing procurement gambles schedule against cost savings." },
      { id: "C", label: "Value Engineer Alternative Materials", theoryHint: "Redesign requires engineering lead time but structurally lowers cost." }
    ]
  },
  {
    id: "EVT_PERMIT_DELAY",
    title: "Environmental Clearance Blocked",
    description: "Local authorities have abruptly frozen clearance for the upcoming heavy civil package.",
    choices: [
      { id: "A", label: "Aggressive Legal Escalation", theoryHint: "Combative stance risks stakeholder trust fallout." },
      { id: "B", label: "Redesign to Avoid Protected Zone", theoryHint: "Rework hits both cost and immediate schedule momentum." },
      { id: "C", label: "Community Outreach & Negotiation", theoryHint: "Soft-power approach relies on strong CSR footprint." }
    ]
  },
  {
    id: "EVT_SAFETY_INCIDENT",
    title: "Near-Miss on Site C",
    description: "A crane load shifted near an active pedestrian zone. No injuries, but public stakeholders are demanding an audit.",
    choices: [
      { id: "A", label: "Downplay internally", theoryHint: "Ignoring precursors elevates long-term catastrophic risk." },
      { id: "B", label: "Stand-down and retraining", theoryHint: "Immediate schedule hit but prevents future accidents." },
      { id: "C", label: "Public dashboard transparency", theoryHint: "Open disclosure builds stakeholder trust but invites scrutiny." }
    ]
  }
];

export function getRoundEvents(sessionId: string, teamId: string, roundNumber: number): GameEvent[] {
  const seedString = `${sessionId}:${teamId}:${roundNumber}`;
  const seedNum = stringToSeed(seedString);
  const random = mulberry32(seedNum);

  const shuffledPool = [...EVENT_POOL];
  // Fisher-Yates shuffle using our deterministic random function
  for (let i = shuffledPool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffledPool[i], shuffledPool[j]] = [shuffledPool[j], shuffledPool[i]];
  }

  // Pick 2-3 events (randomly 2 or 3)
  const numEvents = random() > 0.5 ? 3 : 2;
  return shuffledPool.slice(0, numEvents);
}
