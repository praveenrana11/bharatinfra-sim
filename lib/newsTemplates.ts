import { ConstructionEvent, EventImpact } from "@/lib/constructionNews";

export type RoundNewsTemplate = {
  id: string;
  name: string;
  description: string;
  sectors: string[];
  events: ConstructionEvent[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clampSeverity(value: number): 1 | 2 | 3 {
  if (value <= 1) return 1;
  if (value >= 3) return 3;
  return 2;
}

function scaleImpacts(impacts: EventImpact, factor: number): EventImpact {
  return {
    schedule: clamp(impacts.schedule * factor, -0.2, 0.2),
    cost: clamp(impacts.cost * factor, -0.2, 0.2),
    quality: clamp(impacts.quality * factor, -20, 20),
    safety: clamp(impacts.safety * factor, -20, 20),
    stakeholder: clamp(impacts.stakeholder * factor, -20, 20),
    cash: clamp(Math.round(impacts.cash * factor), -500000, 500000),
  };
}

function roundFactor(roundNumber: number) {
  if (roundNumber >= 6) return 1.25;
  if (roundNumber >= 4) return 1.15;
  if (roundNumber >= 2) return 1.05;
  return 1;
}

export const ROUND_NEWS_TEMPLATES: RoundNewsTemplate[] = [
  {
    id: "roads-monsoon-recovery",
    name: "Roads Monsoon Recovery",
    description: "Highway and flyover contractors balance monsoon delays, bitumen inflation, and recovery targets.",
    sectors: ["Roads", "Bridges", "Flyovers"],
    events: [
      {
        id: "roads-heavy-rain",
        title: "Cloudburst damages embankment stretches",
        description: "Drainage failures and slope instability force rework across active EPC packages.",
        image_url: "https://images.pexels.com/photos/1001682/pexels-photo-1001682.jpeg?auto=compress&cs=tinysrgb&w=1200",
        severity: 3,
        tags: ["monsoon", "roads", "schedule", "quality"],
        impacts: { schedule: -0.08, cost: -0.04, quality: -3, safety: -2, stakeholder: -2, cash: -80000 },
      },
      {
        id: "roads-bitumen-price",
        title: "Bitumen and aggregate rates surge",
        description: "Input procurement turns volatile, forcing package-level renegotiation and value engineering.",
        image_url: "https://images.pexels.com/photos/2219024/pexels-photo-2219024.jpeg?auto=compress&cs=tinysrgb&w=1200",
        severity: 2,
        tags: ["roads", "cost", "procurement"],
        impacts: { schedule: -0.02, cost: -0.06, quality: -1, safety: 0, stakeholder: -1, cash: -70000 },
      },
      {
        id: "roads-expressway-award",
        title: "State fast-tracks expressway packages",
        description: "New lane expansion tenders reward teams with strong claim documentation and execution capacity.",
        image_url: "https://images.pexels.com/photos/93398/pexels-photo-93398.jpeg?auto=compress&cs=tinysrgb&w=1200",
        severity: 1,
        tags: ["roads", "opportunity", "stakeholder"],
        impacts: { schedule: 0.03, cost: 0.01, quality: 1, safety: 1, stakeholder: 3, cash: 45000 },
      },
    ],
  },
  {
    id: "transmission-row-compliance",
    name: "Transmission ROW and Compliance",
    description: "Transmission EPC teams navigate right-of-way risk, tower delays, and safety audits.",
    sectors: ["Transmission", "Power"],
    events: [
      {
        id: "transmission-row-protest",
        title: "Local ROW clearance protests intensify",
        description: "Access restrictions delay foundation and stringing work in multiple corridors.",
        image_url: "https://images.pexels.com/photos/257736/pexels-photo-257736.jpeg?auto=compress&cs=tinysrgb&w=1200",
        severity: 2,
        tags: ["transmission", "regulatory", "schedule"],
        impacts: { schedule: -0.06, cost: -0.02, quality: 0, safety: -1, stakeholder: -4, cash: -50000 },
      },
      {
        id: "transmission-safety-drive",
        title: "Grid operator enforces live-line safety protocol",
        description: "Mandatory competency checks slow short-term output but reduce incident probability.",
        image_url: "https://images.pexels.com/photos/236705/pexels-photo-236705.jpeg?auto=compress&cs=tinysrgb&w=1200",
        severity: 2,
        tags: ["transmission", "safety", "quality"],
        impacts: { schedule: -0.03, cost: -0.01, quality: 2, safety: 4, stakeholder: 1, cash: -22000 },
      },
      {
        id: "transmission-green-corridor",
        title: "Green corridor policy incentives released",
        description: "Teams with cleaner methods and reporting gain bid preference and faster approvals.",
        image_url: "https://images.pexels.com/photos/302896/pexels-photo-302896.jpeg?auto=compress&cs=tinysrgb&w=1200",
        severity: 1,
        tags: ["transmission", "sustainability", "opportunity"],
        impacts: { schedule: 0.02, cost: 0.01, quality: 1, safety: 1, stakeholder: 3, cash: 35000 },
      },
    ],
  },
  {
    id: "metro-airport-audit",
    name: "Metro and Airport Audit Cycle",
    description: "Urban infra teams face high public scrutiny, safety compliance, and interface coordination risk.",
    sectors: ["Metro", "Airports", "Urban Infra"],
    events: [
      {
        id: "metro-interface-delay",
        title: "Multi-agency interface approvals slip",
        description: "Civil, MEP, and systems handover sequencing creates bottlenecks near commissioning.",
        image_url: "https://images.pexels.com/photos/1105766/pexels-photo-1105766.jpeg?auto=compress&cs=tinysrgb&w=1200",
        severity: 2,
        tags: ["metro", "schedule", "governance"],
        impacts: { schedule: -0.05, cost: -0.02, quality: -1, safety: -1, stakeholder: -2, cash: -55000 },
      },
      {
        id: "airport-safety-audit",
        title: "Aviation safety audit flags site controls",
        description: "Audit observations increase re-inspection load but reward robust QA systems.",
        image_url: "https://images.pexels.com/photos/1658967/pexels-photo-1658967.jpeg?auto=compress&cs=tinysrgb&w=1200",
        severity: 3,
        tags: ["airports", "safety", "quality", "compliance"],
        impacts: { schedule: -0.04, cost: -0.02, quality: 2, safety: 3, stakeholder: 1, cash: -30000 },
      },
      {
        id: "metro-ridership-upside",
        title: "Ridership forecast upgrade boosts urgency",
        description: "Public demand pressure increases reward for timely completion and reliable commissioning.",
        image_url: "https://images.pexels.com/photos/2055389/pexels-photo-2055389.jpeg?auto=compress&cs=tinysrgb&w=1200",
        severity: 1,
        tags: ["metro", "opportunity", "stakeholder"],
        impacts: { schedule: 0.03, cost: 0.01, quality: 1, safety: 1, stakeholder: 4, cash: 40000 },
      },
    ],
  },
  {
    id: "dam-hydrology-season",
    name: "Dam Hydrology Season",
    description: "Heavy civil dam works manage inflow uncertainty, concrete quality, and downstream compliance.",
    sectors: ["Dams", "Hydro", "Heavy Civil"],
    events: [
      {
        id: "dam-inflow-spike",
        title: "Unexpected inflow spike at cofferdam",
        description: "Flood protection and diversion infrastructure require emergency reinforcement.",
        image_url: "https://images.pexels.com/photos/1227513/pexels-photo-1227513.jpeg?auto=compress&cs=tinysrgb&w=1200",
        severity: 3,
        tags: ["dams", "monsoon", "safety", "schedule"],
        impacts: { schedule: -0.09, cost: -0.03, quality: -2, safety: -4, stakeholder: -2, cash: -90000 },
      },
      {
        id: "dam-cement-qc",
        title: "Cement batch variance triggers QA hold",
        description: "Mix design recalibration delays pours but prevents long-term structural risk.",
        image_url: "https://images.pexels.com/photos/259950/pexels-photo-259950.jpeg?auto=compress&cs=tinysrgb&w=1200",
        severity: 2,
        tags: ["dams", "quality", "procurement"],
        impacts: { schedule: -0.03, cost: -0.02, quality: 2, safety: 1, stakeholder: 0, cash: -35000 },
      },
      {
        id: "dam-irrigation-priority",
        title: "Irrigation command area declared priority",
        description: "Government accelerates funding release for teams with transparent progress dashboards.",
        image_url: "https://images.pexels.com/photos/235725/pexels-photo-235725.jpeg?auto=compress&cs=tinysrgb&w=1200",
        severity: 1,
        tags: ["dams", "stakeholder", "opportunity"],
        impacts: { schedule: 0.02, cost: 0.01, quality: 0, safety: 1, stakeholder: 3, cash: 50000 },
      },
    ],
  },
  {
    id: "real-estate-demand-credit",
    name: "Residential Demand and Credit Cycle",
    description: "Real estate teams balance demand slowdown, financing pressure, and customer trust.",
    sectors: ["Residential", "Real Estate"],
    events: [
      {
        id: "residential-booking-slowdown",
        title: "Urban booking momentum slows",
        description: "Absorption drops in mid-income projects, stressing cash planning and launch phasing.",
        image_url: "https://images.pexels.com/photos/323780/pexels-photo-323780.jpeg?auto=compress&cs=tinysrgb&w=1200",
        severity: 2,
        tags: ["residential", "demand", "cash"],
        impacts: { schedule: -0.02, cost: -0.01, quality: 0, safety: 0, stakeholder: -2, cash: -65000 },
      },
      {
        id: "real-estate-rera-scrutiny",
        title: "RERA disclosure scrutiny tightens",
        description: "Customer communication and milestone evidence become central to reputation and collections.",
        image_url: "https://images.pexels.com/photos/669615/pexels-photo-669615.jpeg?auto=compress&cs=tinysrgb&w=1200",
        severity: 2,
        tags: ["real-estate", "compliance", "stakeholder"],
        impacts: { schedule: -0.01, cost: -0.01, quality: 1, safety: 0, stakeholder: -1, cash: -25000 },
      },
      {
        id: "residential-affordable-scheme",
        title: "Affordable housing subsidy tranche announced",
        description: "Faster demand recovery for developers with credible delivery records and ESG disclosures.",
        image_url: "https://images.pexels.com/photos/186077/pexels-photo-186077.jpeg?auto=compress&cs=tinysrgb&w=1200",
        severity: 1,
        tags: ["residential", "opportunity", "sustainability"],
        impacts: { schedule: 0.01, cost: 0.01, quality: 1, safety: 0, stakeholder: 3, cash: 55000 },
      },
    ],
  },
  {
    id: "integrity-csr-public",
    name: "Integrity, CSR, and Public Trust",
    description: "Cross-sector governance scenario with anti-corruption pressure and trust-recovery pathways.",
    sectors: ["Public Procurement", "All Sectors"],
    events: [
      {
        id: "integrity-vigilance-sweep",
        title: "Vigilance unit expands procurement sweep",
        description: "Facilitation-heavy teams face severe trust and continuity penalties.",
        image_url: "https://images.pexels.com/photos/4386321/pexels-photo-4386321.jpeg?auto=compress&cs=tinysrgb&w=1200",
        severity: 3,
        tags: ["compliance", "governance", "public-procurement"],
        impacts: { schedule: -0.03, cost: -0.02, quality: 0, safety: 0, stakeholder: -6, cash: -70000 },
      },
      {
        id: "csr-local-partnership",
        title: "District-level CSR partnership gets visibility",
        description: "Community engagement and transparent execution improve site access and trust.",
        image_url: "https://images.pexels.com/photos/6646917/pexels-photo-6646917.jpeg?auto=compress&cs=tinysrgb&w=1200",
        severity: 1,
        tags: ["csr", "stakeholder", "sustainability"],
        impacts: { schedule: 0.02, cost: 0.01, quality: 1, safety: 1, stakeholder: 4, cash: 25000 },
      },
      {
        id: "digital-transparency-mandate",
        title: "Digital dashboard disclosure mandate",
        description: "Public milestone publication becomes mandatory for high-value works.",
        image_url: "https://images.pexels.com/photos/1181671/pexels-photo-1181671.jpeg?auto=compress&cs=tinysrgb&w=1200",
        severity: 2,
        tags: ["governance", "transparency", "stakeholder"],
        impacts: { schedule: -0.01, cost: -0.01, quality: 1, safety: 0, stakeholder: 2, cash: -15000 },
      },
    ],
  },
];

export function getRoundNewsTemplate(templateId: string) {
  return ROUND_NEWS_TEMPLATES.find((template) => template.id === templateId) ?? null;
}

export function buildTemplateEvents(templateId: string, roundNumber: number): ConstructionEvent[] {
  const template = getRoundNewsTemplate(templateId);
  if (!template) return [];

  const factor = roundFactor(roundNumber);
  const severityBump = factor >= 1.2 ? 1 : 0;

  return template.events.map((event, index) => ({
    ...event,
    id: `${event.id}-fy${roundNumber}-${index + 1}`,
    severity: clampSeverity(event.severity + severityBump),
    tags: [...event.tags],
    impacts: scaleImpacts(event.impacts, factor),
  }));
}
