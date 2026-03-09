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

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
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

function sectorDifficulty(sector: ConstructionSector) {
  if (sector === "Roads & Highways") return 0.45;
  if (sector === "Transmission & Power") return 0.62;
  if (sector === "Bridges & Flyovers") return 0.7;
  if (sector === "Airports & Metro") return 0.78;
  if (sector === "Dams & Irrigation") return 0.82;
  if (sector === "Residential & Real Estate") return 0.4;
  return 0.75;
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
      const factor = eventSeverityFactor(event.severity) * eventRelevance(event, profile);
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

function delayedEffects(prevProfile?: DecisionProfile | null) {
  if (!prevProfile) {
    return { schedule: 0, quality: 0, safety: 0, cost: 0 };
  }

  const trainingCarry = (prevProfile.training_intensity - 50) / 3000;
  const innovationCarry = (prevProfile.innovation_budget_index - 50) / 2800;

  const overtimePenalty =
    prevProfile.overtime_policy === "High Intensity"
      ? 0.018
      : prevProfile.overtime_policy === "Flexible"
        ? 0.007
        : 0;

  return {
    schedule: trainingCarry + innovationCarry,
    quality: (prevProfile.innovation_budget_index - 50) / 4.5,
    safety: (prevProfile.training_intensity - 50) / 5 - overtimePenalty * 100,
    cost: overtimePenalty,
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
  const delayed = delayedEffects(context.prevProfile);
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
      eventAgg.stakeholder +
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
      facilitationExposureCash
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
      events: events.map((event) => ({
        id: event.id,
        title: event.title,
        severity: event.severity,
        tags: event.tags,
      })),
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
      focusSum: sumFocus(d),
      penaltyBreakdown,
      delayedEffects: delayed,
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

