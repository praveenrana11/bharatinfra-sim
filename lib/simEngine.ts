import { ConstructionEvent } from "@/lib/constructionNews";
import {
  DecisionProfile,
  DEFAULT_DECISION_PROFILE,
  estimateBudgetBreakdown,
  ConstructionSector,
  SecondarySector,
} from "@/lib/decisionProfile";

export type RiskAppetite = "Conservative" | "Balanced" | "Aggressive";
export type Governance = "Low" | "Medium" | "High";
export type VendorStrategy = "Cheapest" | "Balanced" | "Reliable";

export type DecisionDraft = {
  focus_cost: number;
  focus_quality: number;
  focus_stakeholder: number;
  focus_speed: number;
  risk_appetite: RiskAppetite;
  governance_intensity: Governance;
  buffer_percent: number;
  vendor_strategy: VendorStrategy;
};

export type RoundResult = {
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

export type RoundComputationContext = {
  profile?: DecisionProfile;
  prevResult?: RoundResult | null;
  prevProfile?: DecisionProfile | null;
  events?: ConstructionEvent[];
};

type RiskDebtState = {
  delivery: number;
  quality: number;
  safety: number;
  stakeholder: number;
  compliance: number;
  cash: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function toNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function seededUnit(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

function sumFocus(d: DecisionDraft) {
  return d.focus_cost + d.focus_quality + d.focus_stakeholder + d.focus_speed;
}

function maxFocusTrack(d: DecisionDraft) {
  const tracks = [
    ["cost", d.focus_cost],
    ["quality", d.focus_quality],
    ["stakeholder", d.focus_stakeholder],
    ["speed", d.focus_speed],
  ] as const;

  const sortedTracks = [...tracks].sort((a, b) => b[1] - a[1]);
  return sortedTracks[0][0];
}

function eventSeverityFactor(severity: 1 | 2 | 3) {
  if (severity === 1) return 0.65;
  if (severity === 2) return 1;
  return 1.35;
}
function emptyRiskDebt(): RiskDebtState {
  return {
    delivery: 0,
    quality: 0,
    safety: 0,
    stakeholder: 0,
    compliance: 0,
    cash: 0,
  };
}

function riskDebtFromResult(prevResult?: RoundResult | null): RiskDebtState {
  const raw = prevResult?.detail?.riskDebt;
  if (!raw || typeof raw !== "object") return emptyRiskDebt();
  const source = raw as Record<string, unknown>;

  return {
    delivery: clamp(toNumber(source.delivery), 0, 100),
    quality: clamp(toNumber(source.quality), 0, 100),
    safety: clamp(toNumber(source.safety), 0, 100),
    stakeholder: clamp(toNumber(source.stakeholder), 0, 100),
    compliance: clamp(toNumber(source.compliance), 0, 100),
    cash: clamp(toNumber(source.cash), 0, 100),
  };
}

function sectorTags(sector: ConstructionSector | SecondarySector) {
  if (sector === "Roads & Highways") return ["roads"];
  if (sector === "Transmission & Power") return ["transmission", "power"];
  if (sector === "Bridges & Flyovers") return ["bridges"];
  if (sector === "Airports & Metro") return ["airports", "metro"];
  if (sector === "Dams & Irrigation") return ["dams", "irrigation"];
  if (sector === "Residential & Real Estate") return ["residential", "real-estate"];
  if (sector === "Heavy Civil & Industrial") return ["heavy-civil", "industrial"];
  return [];
}
function sectorTagSensitivity(sector: ConstructionSector, tag: string) {
  if (tag === "all-sectors") return 1;

  if (sector === "Roads & Highways") {
    if (["roads", "monsoon", "logistics", "cost"].includes(tag)) return 1.24;
    if (["bridges", "public-procurement", "climate"].includes(tag)) return 1.1;
    if (["transmission", "real-estate"].includes(tag)) return 0.82;
  }

  if (sector === "Transmission & Power") {
    if (["transmission", "power", "regulatory", "safety"].includes(tag)) return 1.25;
    if (["labor", "compliance", "governance"].includes(tag)) return 1.12;
    if (["real-estate", "residential"].includes(tag)) return 0.78;
  }

  if (sector === "Bridges & Flyovers") {
    if (["bridges", "quality", "safety", "monsoon"].includes(tag)) return 1.24;
    if (["logistics", "public-procurement"].includes(tag)) return 1.1;
    if (["transmission", "residential"].includes(tag)) return 0.8;
  }

  if (sector === "Airports & Metro") {
    if (["airports", "metro", "regulatory", "stakeholder"].includes(tag)) return 1.24;
    if (["public-procurement", "sustainability", "compliance"].includes(tag)) return 1.14;
    if (["roads", "dams"].includes(tag)) return 0.84;
  }

  if (sector === "Dams & Irrigation") {
    if (["dams", "irrigation", "monsoon", "climate"].includes(tag)) return 1.3;
    if (["safety", "quality", "logistics"].includes(tag)) return 1.14;
    if (["residential", "real-estate"].includes(tag)) return 0.76;
  }

  if (sector === "Residential & Real Estate") {
    if (["residential", "real-estate", "demand"].includes(tag)) return 1.3;
    if (["stakeholder", "regulatory"].includes(tag)) return 1.12;
    if (["dams", "transmission"].includes(tag)) return 0.78;
  }

  if (sector === "Heavy Civil & Industrial") {
    if (["heavy-civil", "industrial", "safety", "labor"].includes(tag)) return 1.24;
    if (["cost", "logistics", "compliance"].includes(tag)) return 1.12;
    if (["real-estate", "residential"].includes(tag)) return 0.8;
  }

  return 1;
}

function sectorDifficulty(sector: ConstructionSector) {
  if (sector === "Roads & Highways") return 0.45;
  if (sector === "Transmission & Power") return 0.62;
  if (sector === "Bridges & Flyovers") return 0.7;
  if (sector === "Airports & Metro") return 0.78;
  if (sector === "Dams & Irrigation") return 0.82;
  if (sector === "Residential & Real Estate") return 0.4;
  return 0.75;
}
function sectorSpecificEventMultiplier(event: ConstructionEvent, profile: DecisionProfile) {
  if (event.tags.length === 0) return 1;

  const primaryWeights = event.tags.map((tag) => sectorTagSensitivity(profile.primary_sector, tag));
  const primaryAvg = primaryWeights.reduce((sum, value) => sum + value, 0) / primaryWeights.length;

  const secondarySector = profile.secondary_sector === "None" ? null : profile.secondary_sector;
  const secondaryAvg =
    secondarySector === null
      ? 1
      : event.tags
          .map((tag) => sectorTagSensitivity(secondarySector, tag))
          .reduce((sum, value) => sum + value, 0) / event.tags.length;

  const blended = primaryAvg * 0.82 + secondaryAvg * 0.18;
  const publicMixAdj =
    event.tags.includes("public-procurement") || event.tags.includes("governance")
      ? profile.project_mix_public_pct >= 60
        ? 1.08
        : 0.94
      : 1;

  return clamp(blended * publicMixAdj, 0.72, 1.42);
}

function eventRelevance(event: ConstructionEvent, profile: DecisionProfile) {
  if (event.tags.includes("all-sectors") || event.tags.includes("monsoon") || event.tags.includes("climate")) {
    return 1;
  }

  const primaryTags = sectorTags(profile.primary_sector);
  const secondaryTags = profile.secondary_sector === "None" ? [] : sectorTags(profile.secondary_sector);

  if (event.tags.some((tag) => primaryTags.includes(tag))) return 1;
  if (event.tags.some((tag) => secondaryTags.includes(tag))) return 0.78;

  if (event.tags.includes("public-procurement")) {
    return profile.project_mix_public_pct >= 55 ? 0.9 : 0.65;
  }

  return 0.55;
}

function aggregateEventImpacts(events: ConstructionEvent[], profile: DecisionProfile) {
  return events.reduce(
    (acc, event) => {
      const factor =
        eventSeverityFactor(event.severity) *
        eventRelevance(event, profile) *
        sectorSpecificEventMultiplier(event, profile);
      acc.schedule += event.impacts.schedule * factor;
      acc.cost += event.impacts.cost * factor;
      acc.quality += event.impacts.quality * factor;
      acc.safety += event.impacts.safety * factor;
      acc.stakeholder += event.impacts.stakeholder * factor;
      acc.cash += event.impacts.cash * factor;
      return acc;
    },
    { schedule: 0, cost: 0, quality: 0, safety: 0, stakeholder: 0, cash: 0 }
  );
}

function strategicBonus(profile: DecisionProfile, d: DecisionDraft) {
  const topTrack = maxFocusTrack(d);

  if (profile.strategic_posture === "Cost Leadership") {
    return topTrack === "cost" ? 14 : -8;
  }

  if (profile.strategic_posture === "Quality Leadership") {
    return topTrack === "quality" ? 14 : -8;
  }

  if (profile.strategic_posture === "Stakeholder Trust") {
    return topTrack === "stakeholder" ? 14 : -8;
  }

  return 4;
}

function profileScheduleAdjustment(profile: DecisionProfile) {
  const resilienceAdj =
    profile.logistics_resilience === "High Resilience"
      ? 0.03
      : profile.logistics_resilience === "Lean Cost"
        ? -0.02
        : 0;

  const workforceAdj =
    profile.workforce_plan === "Acceleration Hiring"
      ? 0.02
      : profile.workforce_plan === "Lean Core Team"
        ? -0.02
        : 0;

  const expansionAdj =
    profile.market_expansion === "Scale Two New Regions"
      ? -0.03
      : profile.market_expansion === "Pilot One New Region"
        ? -0.01
        : 0;

  const trainingAdj = (profile.training_intensity - 50) / 2500;

  return resilienceAdj + workforceAdj + expansionAdj + trainingAdj;
}

function profileCostAdjustment(profile: DecisionProfile) {
  const logisticsCost =
    profile.logistics_resilience === "High Resilience"
      ? -0.03
      : profile.logistics_resilience === "Lean Cost"
        ? 0.02
        : 0;

  const expansionCost =
    profile.market_expansion === "Scale Two New Regions"
      ? -0.02
      : profile.market_expansion === "Pilot One New Region"
        ? -0.01
        : 0;

  const financeCost =
    profile.financing_posture === "Growth Debt"
      ? -0.02
      : profile.financing_posture === "Cash First"
        ? 0.01
        : 0;

  return logisticsCost + expansionCost + financeCost;
}

function delayedEffects(
  prevProfile?: DecisionProfile | null,
  prevResult?: RoundResult | null,
  prevDebt: RiskDebtState = emptyRiskDebt()
) {
  if (!prevProfile && !prevResult) {
    return { schedule: 0, quality: 0, safety: 0, cost: 0, stakeholder: 0, cash: 0 };
  }

  const trainingCarry = prevProfile ? (prevProfile.training_intensity - 50) / 3000 : 0;
  const innovationCarry = prevProfile ? (prevProfile.innovation_budget_index - 50) / 2800 : 0;

  const overtimePenalty =
    prevProfile?.overtime_policy === "High Intensity"
      ? 0.018
      : prevProfile?.overtime_policy === "Flexible"
        ? 0.007
        : 0;

  const reworkLag = prevResult ? Math.max(0, 74 - prevResult.quality_score) / 240 : 0;
  const safetyLag = prevResult ? Math.max(0, 76 - prevResult.safety_score) / 16 : 0;
  const stakeholderLag = prevResult ? Math.max(0, 74 - prevResult.stakeholder_score) / 12 : 0;
  const debtCashLag = prevDebt.cash * 680;

  return {
    schedule: trainingCarry + innovationCarry - reworkLag,
    quality: (prevProfile ? (prevProfile.innovation_budget_index - 50) / 4.5 : 0) - prevDebt.quality * 0.02,
    safety: (prevProfile ? (prevProfile.training_intensity - 50) / 5 : 0) - overtimePenalty * 100 - safetyLag,
    cost: overtimePenalty + prevDebt.delivery / 3800,
    stakeholder: (prevProfile?.community_engagement ? (prevProfile.community_engagement - 50) / 20 : 0) - stakeholderLag,
    cash: -Math.round(debtCashLag),
  };
}
function subcontractorAdjustment(profile: DecisionProfile) {
  const subcontractShare = (100 - profile.self_perform_percent) / 100;

  const profileAdjustments =
    profile.subcontractor_profile === "Tier 1 Proven"
      ? { schedule: -0.005, cost: -0.018, quality: 4, safety: 2, stakeholder: 2 }
      : profile.subcontractor_profile === "Tier 3 Fast Track"
        ? { schedule: 0.02, cost: 0.014, quality: -4, safety: -2, stakeholder: -2 }
        : { schedule: 0.006, cost: 0.002, quality: 1, safety: 0, stakeholder: 0 };

  return {
    schedule: profileAdjustments.schedule * subcontractShare,
    cost: profileAdjustments.cost * subcontractShare,
    quality: profileAdjustments.quality * subcontractShare,
    safety: profileAdjustments.safety * subcontractShare,
    stakeholder: profileAdjustments.stakeholder * subcontractShare,
  };
}

export function computeRoundResultV2(
  d: DecisionDraft,
  seed: string,
  context: RoundComputationContext = {}
): RoundResult {
  const profile = context.profile ?? DEFAULT_DECISION_PROFILE;
  const prevResult = context.prevResult ?? null;
  const prevDebt = riskDebtFromResult(prevResult);
  const delayed = delayedEffects(context.prevProfile, prevResult, prevDebt);
  const events = context.events ?? [];
  const eventAgg = aggregateEventImpacts(events, profile);
  const budget = estimateBudgetBreakdown(profile);

  const focusPenalty = Math.abs(100 - sumFocus(d));
  const r = seededUnit(seed);

  const sectorComplexity = sectorDifficulty(profile.primary_sector);
  const diversificationLoad = profile.secondary_sector === "None" ? 0 : 0.015;

  const subcontractor = subcontractorAdjustment(profile);

  const riskMult =
    d.risk_appetite === "Aggressive" ? 1.07 : d.risk_appetite === "Conservative" ? 0.95 : 1.0;
  const volatility =
    d.risk_appetite === "Aggressive" ? 0.14 : d.risk_appetite === "Conservative" ? 0.07 : 0.1;

  const governanceAdj =
    d.governance_intensity === "High" ? -0.012 : d.governance_intensity === "Low" ? 0.01 : 0;

  const vendorAdj =
    d.vendor_strategy === "Reliable" ? -0.02 : d.vendor_strategy === "Cheapest" ? 0.012 : 0;

  const contextAdj =
    profile.external_context === "Material Price Spike"
      ? -0.015
      : profile.external_context === "Permitting Delay"
        ? -0.012
        : profile.external_context === "Labor Tightness"
          ? -0.01
          : 0;

  const momentum = prevResult ? (prevResult.schedule_index - 1) / 8 : 0;

  const workloadAdj =
    profile.workforce_load_state === "Overloaded"
      ? { schedule: 0.025, cost: -0.015, quality: -4, safety: -6, stakeholder: -3 }
      : profile.workforce_load_state === "Underloaded"
        ? { schedule: -0.03, cost: 0.01, quality: 1, safety: 3, stakeholder: 1 }
        : { schedule: 0, cost: 0, quality: 0, safety: 0, stakeholder: 0 };

  const workLifeAdj = (profile.work_life_balance_index - 50) / 100;

  const pmGap = Math.abs(profile.pm_utilization_target - 74);
  const pmEfficiency = 1 - pmGap / 50;

  const specializationGain = ((profile.specialized_work_index - 50) / 100) * (0.6 + sectorComplexity);

  let schedule_index = clamp(
    1 +
      (d.focus_speed - 25) / 245 +
      d.buffer_percent / 370 +
      governanceAdj +
      profileScheduleAdjustment(profile) +
      delayed.schedule +
      momentum +
      -prevDebt.delivery / 2500 +
      eventAgg.schedule +
      contextAdj +
      subcontractor.schedule +
      workloadAdj.schedule +
      (pmEfficiency - 0.7) * 0.05 +
      specializationGain * 0.03 -
      diversificationLoad -
      workLifeAdj * 0.01 +
      (r - 0.5) * volatility,
    0.64,
    1.3
  );

  let cost_index = clamp(
    1 +
      (d.focus_cost - 25) / 250 -
      d.buffer_percent / 610 +
      vendorAdj +
      profileCostAdjustment(profile) -
      delayed.cost +
      eventAgg.cost +
      -prevDebt.cash / 3000 +
      -prevDebt.compliance / 4200 +
      subcontractor.cost +
      workloadAdj.cost +
      (pmEfficiency - 0.7) * 0.04 -
      sectorComplexity * 0.01 +
      (0.5 - r) * (volatility / 2),
    0.62,
    1.29
  );

  let quality_score = clamp(
    67 +
      (d.focus_quality - 25) * 1.16 +
      (profile.qa_audit_frequency === "Weekly" ? 5 : profile.qa_audit_frequency === "Monthly" ? -4 : 1) +
      (profile.innovation_budget_index - 50) * 0.18 +
      delayed.quality +
      eventAgg.quality +
      -prevDebt.quality * 0.05 +
      subcontractor.quality +
      workloadAdj.quality +
      specializationGain * 4 +
      (profile.csr_sustainability_index - 50) * 0.05 -
      sectorComplexity * 3,
    0,
    100
  );

  let safety_score = clamp(
    68 +
      (d.governance_intensity === "High" ? 8 : d.governance_intensity === "Low" ? -5 : 2) +
      (profile.overtime_policy === "High Intensity" ? -7 : profile.overtime_policy === "Tight Limits" ? 3 : 0) +
      (profile.training_intensity - 50) * 0.14 +
      delayed.safety +
      eventAgg.safety +
      -prevDebt.safety * 0.06 +
      subcontractor.safety +
      workloadAdj.safety +
      (profile.work_life_balance_index - 50) * 0.15 -
      sectorComplexity * 2,
    0,
    100
  );

  let stakeholder_score = clamp(
    66 +
      (d.focus_stakeholder - 25) * 1.2 +
      (profile.community_engagement - 50) * 0.2 +
      (profile.transparency_level === "Public Dashboard" ? 6 : profile.transparency_level === "Standard" ? -2 : 2) +
      (profile.public_message_tone === "Collaborative" ? 4 : profile.public_message_tone === "Aggressive" ? -3 : 1) +
      delayed.stakeholder +
      eventAgg.stakeholder +
      -prevDebt.stakeholder * 0.05 +
      -prevDebt.compliance * 0.04 +
      subcontractor.stakeholder +
      workloadAdj.stakeholder +
      (profile.csr_sustainability_index - 50) * 0.16 +
      (profile.compliance_posture === "Strict Compliance"
        ? 3
        : profile.compliance_posture === "High-Risk Facilitation"
          ? -4
          : 0),
    0,
    100
  );

  let claim_entitlement_score = clamp(
    58 +
      (d.governance_intensity === "High" ? 10 : d.governance_intensity === "Low" ? -4 : 2) +
      (profile.transparency_level === "Public Dashboard" ? 5 : profile.transparency_level === "Proactive" ? 3 : 0) +
      (profile.bid_aggressiveness >= 4 ? -3 : 2) +
      -prevDebt.compliance * 0.04 +
      (profile.compliance_posture === "Strict Compliance"
        ? 5
        : profile.compliance_posture === "High-Risk Facilitation"
          ? -6
          : 1),
    0,
    100
  );

  let penalties = Math.round(focusPenalty * 2);
  const penaltyBreakdown: Record<string, number> = { focus_discipline: Math.round(focusPenalty * 2) };

  const prevDebtTotal =
    prevDebt.delivery +
    prevDebt.quality +
    prevDebt.safety +
    prevDebt.stakeholder +
    prevDebt.compliance +
    prevDebt.cash;

  if (prevDebtTotal > 120) {
    const carryPenalty = Math.round((prevDebtTotal - 120) * 0.12);
    penalties += carryPenalty;
    penaltyBreakdown.risk_debt_carryforward = carryPenalty;
  }

  if (profile.market_expansion === "Scale Two New Regions" && profile.workforce_plan === "Lean Core Team") {
    penalties += 26;
    penaltyBreakdown.capacity_overstretch = 26;
    schedule_index = clamp(schedule_index - 0.03, 0.62, 1.3);
    quality_score = clamp(quality_score - 4, 0, 100);
  }

  if (d.risk_appetite === "Aggressive" && profile.contingency_fund_percent < 8) {
    const p = Math.round((8 - profile.contingency_fund_percent) * (8 - profile.contingency_fund_percent) * 0.8);
    penalties += p;
    penaltyBreakdown.risk_without_cover = p;
    cost_index = clamp(cost_index - 0.02, 0.62, 1.29);
    safety_score = clamp(safety_score - 3, 0, 100);
  }

  if (d.focus_speed > 35 && profile.qa_audit_frequency === "Monthly") {
    penalties += 14;
    penaltyBreakdown.speed_quality_mismatch = 14;
    quality_score = clamp(quality_score - 5, 0, 100);
  }

  const hasMonsoonShock = events.some((event) => event.id === "monsoon-rainfall");
  if (hasMonsoonShock && profile.logistics_resilience === "Lean Cost" && d.buffer_percent < 5) {
    penalties += 18;
    penaltyBreakdown.monsoon_unprepared = 18;
    schedule_index = clamp(schedule_index - 0.04, 0.62, 1.3);
  }

  if (budget.total_budget_pressure > 3600000 && profile.cash_buffer_months <= 3) {
    penalties += 14;
    penaltyBreakdown.liquidity_stress = 14;
    stakeholder_score = clamp(stakeholder_score - 2, 0, 100);
  }

  if (profile.pm_utilization_target > 88) {
    penalties += 8;
    penaltyBreakdown.pm_over_utilization = 8;
    safety_score = clamp(safety_score - 4, 0, 100);
  }

  if (profile.workforce_load_state === "Overloaded" && profile.work_life_balance_index < 40) {
    penalties += 10;
    penaltyBreakdown.workforce_burnout = 10;
    quality_score = clamp(quality_score - 3, 0, 100);
    safety_score = clamp(safety_score - 3, 0, 100);
  }

  const complianceEvent = events.some((event) => event.tags.includes("compliance") || event.tags.includes("governance"));

  if (profile.compliance_posture === "High-Risk Facilitation" && profile.facilitation_budget_index > 20) {
    const exposure = complianceEvent ? 1.45 : 1;
    const p = Math.round((profile.facilitation_budget_index / 100) ** 2 * 55 * exposure);
    penalties += p;
    penaltyBreakdown.compliance_exposure = p;
    stakeholder_score = clamp(stakeholder_score - 4, 0, 100);
    claim_entitlement_score = clamp(claim_entitlement_score - 5, 0, 100);
  }

  if (profile.compliance_posture === "Strict Compliance" && profile.facilitation_budget_index > 10) {
    penalties += 6;
    penaltyBreakdown.policy_misalignment = 6;
  }

  const liquidityStressIndex =
    (budget.total_budget_pressure > 4_000_000 ? 12 : 0) +
    (profile.cash_buffer_months < 3 ? 10 : 0) +
    (cost_index < 0.95 ? (0.95 - cost_index) * 120 : 0);

  const currentDebt: RiskDebtState = {
    delivery: clamp(
      prevDebt.delivery * 0.62 +
        (schedule_index < 0.98 ? (0.98 - schedule_index) * 125 : -6) +
        (profile.market_expansion === "Scale Two New Regions" ? 7 : 0),
      0,
      100
    ),
    quality: clamp(
      prevDebt.quality * 0.62 +
        (quality_score < 75 ? (75 - quality_score) * 0.95 : -7) +
        (d.focus_speed > 35 && profile.qa_audit_frequency === "Monthly" ? 9 : 0),
      0,
      100
    ),
    safety: clamp(
      prevDebt.safety * 0.64 +
        (safety_score < 76 ? (76 - safety_score) : -8) +
        (profile.workforce_load_state === "Overloaded" ? 7 : 0),
      0,
      100
    ),
    stakeholder: clamp(
      prevDebt.stakeholder * 0.63 +
        (stakeholder_score < 74 ? (74 - stakeholder_score) * 0.85 : -6) +
        (profile.public_message_tone === "Aggressive" ? 4 : 0),
      0,
      100
    ),
    compliance: clamp(
      prevDebt.compliance * 0.68 +
        (profile.compliance_posture === "High-Risk Facilitation"
          ? profile.facilitation_budget_index * 0.36
          : profile.compliance_posture === "Strict Compliance"
            ? -8
            : -2),
      0,
      100
    ),
    cash: clamp(
      prevDebt.cash * 0.6 +
        liquidityStressIndex +
        (profile.financing_posture === "Growth Debt" ? 5 : 0),
      0,
      100
    ),
  };

  const currentDebtTotal =
    currentDebt.delivery +
    currentDebt.quality +
    currentDebt.safety +
    currentDebt.stakeholder +
    currentDebt.compliance +
    currentDebt.cash;

  const debtLoadPenalty = Math.round(currentDebtTotal * 0.08);
  if (debtLoadPenalty > 0) {
    penalties += debtLoadPenalty;
    penaltyBreakdown.current_risk_debt = debtLoadPenalty;
  }

  const debtImprovementBonus =
    prevDebtTotal > 0 && currentDebtTotal + 8 < prevDebtTotal
      ? Math.round((prevDebtTotal - currentDebtTotal) * 0.14)
      : 0;
  const strategyAlignmentBonus = strategicBonus(profile, d);
  const resilienceBonus = hasMonsoonShock && profile.logistics_resilience === "High Resilience" ? 8 : 0;
  const sectorFitBonus = Math.round((profile.specialized_work_index - 50) * 0.18 * (0.7 + sectorComplexity));

  const basePoints =
    schedule_index * 130 +
    cost_index * 130 +
    quality_score * 0.94 +
    safety_score * 0.96 +
    stakeholder_score * 0.9 +
    claim_entitlement_score * 0.56 +
    strategyAlignmentBonus +
    debtImprovementBonus +
    resilienceBonus +
    sectorFitBonus;

  const points_earned = Math.max(0, Math.round(basePoints * riskMult - penalties));

  const financingBoost =
    profile.financing_posture === "Growth Debt"
      ? 130000
      : profile.financing_posture === "Balanced Debt"
        ? 70000
        : 20000;

  const prevCarry = prevResult ? prevResult.cash_closing * 0.08 : 0;

  const facilitationExposureCash =
    profile.compliance_posture === "High-Risk Facilitation"
      ? -Math.round(profile.facilitation_budget_index * 1200 * (complianceEvent ? 1.35 : 1))
      : 0;

  const cash_closing = Math.round(
    1_180_000 +
      (cost_index - 1) * 260000 +
      (schedule_index - 1) * 170000 +
      (stakeholder_score - 70) * 1500 -
      budget.total_budget_pressure * 0.36 +
      financingBoost +
      prevCarry +
      eventAgg.cash +
      delayed.cash +
      facilitationExposureCash +
      -prevDebt.cash * 1700
  );

  return {
    schedule_index: Number(schedule_index.toFixed(2)),
    cost_index: Number(cost_index.toFixed(2)),
    cash_closing,
    quality_score: Math.round(quality_score),
    safety_score: Math.round(safety_score),
    stakeholder_score: Math.round(stakeholder_score),
    claim_entitlement_score: Math.round(claim_entitlement_score),
    points_earned,
    penalties,
    detail: {
      seed,
      events: events.map((event) => {
        const relevance = eventRelevance(event, profile);
        const sectorMultiplier = sectorSpecificEventMultiplier(event, profile);
        const severityFactor = eventSeverityFactor(event.severity);
        return {
          id: event.id,
          title: event.title,
          severity: event.severity,
          tags: event.tags,
          relevance: Number(relevance.toFixed(3)),
          sector_multiplier: Number(sectorMultiplier.toFixed(3)),
          combined_factor: Number((relevance * sectorMultiplier * severityFactor).toFixed(3)),
        };
      }),
      eventAggregate: {
        schedule: Number(eventAgg.schedule.toFixed(3)),
        cost: Number(eventAgg.cost.toFixed(3)),
        quality: Number(eventAgg.quality.toFixed(2)),
        safety: Number(eventAgg.safety.toFixed(2)),
        stakeholder: Number(eventAgg.stakeholder.toFixed(2)),
        cash: Math.round(eventAgg.cash),
      },
      profile,
      budget,
      riskMult,
      volatility,
      strategyAlignmentBonus,
      resilienceBonus,
      sectorFitBonus,
      debtImprovementBonus,
      focusSum: sumFocus(d),
      penaltyBreakdown,
      delayedEffects: delayed,
      riskDebt: currentDebt,
      riskDebtTotals: {
        previous: Number(prevDebtTotal.toFixed(2)),
        current: Number(currentDebtTotal.toFixed(2)),
      },
      sectorComplexity,
      pmEfficiency: Number(pmEfficiency.toFixed(3)),
      specializationGain: Number(specializationGain.toFixed(3)),
      subcontractorAdjustment: subcontractor,
      workloadAdjustment: workloadAdj,
    },
  };
}

export function computePlaceholderRoundResult(d: DecisionDraft, seed: string): RoundResult {
  return computeRoundResultV2(d, seed, {
    profile: DEFAULT_DECISION_PROFILE,
    events: [],
  });
}
