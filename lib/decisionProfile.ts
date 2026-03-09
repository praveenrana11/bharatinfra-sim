export type ExternalContext =
  | "Stable Environment"
  | "Material Price Spike"
  | "Labor Tightness"
  | "Permitting Delay";

export type StrategicPosture =
  | "Balanced Portfolio"
  | "Cost Leadership"
  | "Quality Leadership"
  | "Stakeholder Trust";

export type ExpansionMode =
  | "Consolidate Existing Regions"
  | "Pilot One New Region"
  | "Scale Two New Regions";

export type ConstructionSector =
  | "Roads & Highways"
  | "Transmission & Power"
  | "Bridges & Flyovers"
  | "Airports & Metro"
  | "Dams & Irrigation"
  | "Residential & Real Estate"
  | "Heavy Civil & Industrial";

export type SecondarySector = ConstructionSector | "None";

export type WorkforcePlan = "Lean Core Team" | "Balanced Hiring" | "Acceleration Hiring";
export type OvertimePolicy = "Tight Limits" | "Flexible" | "High Intensity";
export type QaFrequency = "Weekly" | "Biweekly" | "Monthly";
export type LogisticsResilience = "Lean Cost" | "Balanced" | "High Resilience";
export type TransparencyLevel = "Standard" | "Proactive" | "Public Dashboard";
export type FinancingPosture = "Cash First" | "Balanced Debt" | "Growth Debt";
export type MessageTone = "Confident" | "Collaborative" | "Aggressive";
export type SubcontractorProfile = "Tier 1 Proven" | "Tier 2 Value" | "Tier 3 Fast Track";
export type WorkforceLoadState = "Underloaded" | "Balanced" | "Overloaded";
export type CompliancePosture = "Strict Compliance" | "Pragmatic" | "High-Risk Facilitation";

export type DecisionProfile = {
  external_context: ExternalContext;
  public_message_tone: MessageTone;
  strategic_posture: StrategicPosture;
  market_expansion: ExpansionMode;

  primary_sector: ConstructionSector;
  secondary_sector: SecondarySector;

  project_mix_public_pct: number;
  bid_aggressiveness: number;

  self_perform_percent: number;
  subcontractor_profile: SubcontractorProfile;
  specialized_work_index: number;

  workforce_plan: WorkforcePlan;
  workforce_load_state: WorkforceLoadState;
  work_life_balance_index: number;
  training_intensity: number;
  overtime_policy: OvertimePolicy;

  qa_audit_frequency: QaFrequency;
  innovation_budget_index: number;

  logistics_resilience: LogisticsResilience;
  inventory_cover_weeks: number;
  pm_utilization_target: number;

  digital_visibility_spend: number;
  community_engagement: number;
  transparency_level: TransparencyLevel;

  compliance_posture: CompliancePosture;
  facilitation_budget_index: number;
  csr_sustainability_index: number;

  financing_posture: FinancingPosture;
  cash_buffer_months: number;
  contingency_fund_percent: number;
};

export type BudgetBreakdown = {
  people_l_and_d: number;
  engineering_quality: number;
  operations_resilience: number;
  stakeholder_visibility: number;
  risk_contingency: number;
  financing_cost_pressure: number;
  subcontracting_and_partnering: number;
  asset_and_specialization: number;
  compliance_and_sustainability: number;
  total_budget_pressure: number;
};

export const DEFAULT_DECISION_PROFILE: DecisionProfile = {
  external_context: "Stable Environment",
  public_message_tone: "Confident",
  strategic_posture: "Balanced Portfolio",
  market_expansion: "Consolidate Existing Regions",

  primary_sector: "Roads & Highways",
  secondary_sector: "None",

  project_mix_public_pct: 60,
  bid_aggressiveness: 3,

  self_perform_percent: 65,
  subcontractor_profile: "Tier 2 Value",
  specialized_work_index: 50,

  workforce_plan: "Balanced Hiring",
  workforce_load_state: "Balanced",
  work_life_balance_index: 55,
  training_intensity: 55,
  overtime_policy: "Flexible",

  qa_audit_frequency: "Biweekly",
  innovation_budget_index: 50,

  logistics_resilience: "Balanced",
  inventory_cover_weeks: 4,
  pm_utilization_target: 72,

  digital_visibility_spend: 50,
  community_engagement: 55,
  transparency_level: "Proactive",

  compliance_posture: "Strict Compliance",
  facilitation_budget_index: 0,
  csr_sustainability_index: 50,

  financing_posture: "Balanced Debt",
  cash_buffer_months: 4,
  contingency_fund_percent: 8,
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function parseEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  if (typeof value !== "string") return fallback;
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function parseNumber(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return clamp(value, min, max);
}

const externalContextOptions: ExternalContext[] = [
  "Stable Environment",
  "Material Price Spike",
  "Labor Tightness",
  "Permitting Delay",
];

const messageToneOptions: MessageTone[] = ["Confident", "Collaborative", "Aggressive"];

const strategicPostureOptions: StrategicPosture[] = [
  "Balanced Portfolio",
  "Cost Leadership",
  "Quality Leadership",
  "Stakeholder Trust",
];

const expansionOptions: ExpansionMode[] = [
  "Consolidate Existing Regions",
  "Pilot One New Region",
  "Scale Two New Regions",
];

const sectorOptions: ConstructionSector[] = [
  "Roads & Highways",
  "Transmission & Power",
  "Bridges & Flyovers",
  "Airports & Metro",
  "Dams & Irrigation",
  "Residential & Real Estate",
  "Heavy Civil & Industrial",
];

const secondarySectorOptions: SecondarySector[] = ["None", ...sectorOptions];
const subcontractorOptions: SubcontractorProfile[] = ["Tier 1 Proven", "Tier 2 Value", "Tier 3 Fast Track"];
const workforceOptions: WorkforcePlan[] = ["Lean Core Team", "Balanced Hiring", "Acceleration Hiring"];
const workloadOptions: WorkforceLoadState[] = ["Underloaded", "Balanced", "Overloaded"];
const overtimeOptions: OvertimePolicy[] = ["Tight Limits", "Flexible", "High Intensity"];
const qaOptions: QaFrequency[] = ["Weekly", "Biweekly", "Monthly"];
const logisticsOptions: LogisticsResilience[] = ["Lean Cost", "Balanced", "High Resilience"];
const transparencyOptions: TransparencyLevel[] = ["Standard", "Proactive", "Public Dashboard"];
const complianceOptions: CompliancePosture[] = ["Strict Compliance", "Pragmatic", "High-Risk Facilitation"];
const financingOptions: FinancingPosture[] = ["Cash First", "Balanced Debt", "Growth Debt"];

export function parseDecisionProfile(raw: Record<string, unknown> | null | undefined): DecisionProfile {
  const source = raw ?? {};

  return {
    external_context: parseEnum(
      source.external_context,
      externalContextOptions,
      DEFAULT_DECISION_PROFILE.external_context
    ),
    public_message_tone: parseEnum(
      source.public_message_tone,
      messageToneOptions,
      DEFAULT_DECISION_PROFILE.public_message_tone
    ),
    strategic_posture: parseEnum(
      source.strategic_posture,
      strategicPostureOptions,
      DEFAULT_DECISION_PROFILE.strategic_posture
    ),
    market_expansion: parseEnum(
      source.market_expansion,
      expansionOptions,
      DEFAULT_DECISION_PROFILE.market_expansion
    ),

    primary_sector: parseEnum(
      source.primary_sector,
      sectorOptions,
      DEFAULT_DECISION_PROFILE.primary_sector
    ),
    secondary_sector: parseEnum(
      source.secondary_sector,
      secondarySectorOptions,
      DEFAULT_DECISION_PROFILE.secondary_sector
    ),

    project_mix_public_pct: parseNumber(
      source.project_mix_public_pct,
      DEFAULT_DECISION_PROFILE.project_mix_public_pct,
      0,
      100
    ),
    bid_aggressiveness: parseNumber(
      source.bid_aggressiveness,
      DEFAULT_DECISION_PROFILE.bid_aggressiveness,
      1,
      5
    ),

    self_perform_percent: parseNumber(
      source.self_perform_percent,
      DEFAULT_DECISION_PROFILE.self_perform_percent,
      0,
      100
    ),
    subcontractor_profile: parseEnum(
      source.subcontractor_profile,
      subcontractorOptions,
      DEFAULT_DECISION_PROFILE.subcontractor_profile
    ),
    specialized_work_index: parseNumber(
      source.specialized_work_index,
      DEFAULT_DECISION_PROFILE.specialized_work_index,
      0,
      100
    ),

    workforce_plan: parseEnum(
      source.workforce_plan,
      workforceOptions,
      DEFAULT_DECISION_PROFILE.workforce_plan
    ),
    workforce_load_state: parseEnum(
      source.workforce_load_state,
      workloadOptions,
      DEFAULT_DECISION_PROFILE.workforce_load_state
    ),
    work_life_balance_index: parseNumber(
      source.work_life_balance_index,
      DEFAULT_DECISION_PROFILE.work_life_balance_index,
      0,
      100
    ),
    training_intensity: parseNumber(
      source.training_intensity,
      DEFAULT_DECISION_PROFILE.training_intensity,
      0,
      100
    ),
    overtime_policy: parseEnum(
      source.overtime_policy,
      overtimeOptions,
      DEFAULT_DECISION_PROFILE.overtime_policy
    ),

    qa_audit_frequency: parseEnum(
      source.qa_audit_frequency,
      qaOptions,
      DEFAULT_DECISION_PROFILE.qa_audit_frequency
    ),
    innovation_budget_index: parseNumber(
      source.innovation_budget_index,
      DEFAULT_DECISION_PROFILE.innovation_budget_index,
      0,
      100
    ),

    logistics_resilience: parseEnum(
      source.logistics_resilience,
      logisticsOptions,
      DEFAULT_DECISION_PROFILE.logistics_resilience
    ),
    inventory_cover_weeks: parseNumber(
      source.inventory_cover_weeks,
      DEFAULT_DECISION_PROFILE.inventory_cover_weeks,
      1,
      12
    ),
    pm_utilization_target: parseNumber(
      source.pm_utilization_target,
      DEFAULT_DECISION_PROFILE.pm_utilization_target,
      40,
      95
    ),

    digital_visibility_spend: parseNumber(
      source.digital_visibility_spend,
      DEFAULT_DECISION_PROFILE.digital_visibility_spend,
      0,
      100
    ),
    community_engagement: parseNumber(
      source.community_engagement,
      DEFAULT_DECISION_PROFILE.community_engagement,
      0,
      100
    ),
    transparency_level: parseEnum(
      source.transparency_level,
      transparencyOptions,
      DEFAULT_DECISION_PROFILE.transparency_level
    ),

    compliance_posture: parseEnum(
      source.compliance_posture,
      complianceOptions,
      DEFAULT_DECISION_PROFILE.compliance_posture
    ),
    facilitation_budget_index: parseNumber(
      source.facilitation_budget_index,
      DEFAULT_DECISION_PROFILE.facilitation_budget_index,
      0,
      100
    ),
    csr_sustainability_index: parseNumber(
      source.csr_sustainability_index,
      DEFAULT_DECISION_PROFILE.csr_sustainability_index,
      0,
      100
    ),

    financing_posture: parseEnum(
      source.financing_posture,
      financingOptions,
      DEFAULT_DECISION_PROFILE.financing_posture
    ),
    cash_buffer_months: parseNumber(
      source.cash_buffer_months,
      DEFAULT_DECISION_PROFILE.cash_buffer_months,
      1,
      12
    ),
    contingency_fund_percent: parseNumber(
      source.contingency_fund_percent,
      DEFAULT_DECISION_PROFILE.contingency_fund_percent,
      0,
      20
    ),
  };
}

export function estimateBudgetBreakdown(profile: DecisionProfile): BudgetBreakdown {
  const people_l_and_d = Math.round(
    370000 +
      profile.training_intensity * 2400 +
      (profile.work_life_balance_index > 60 ? 50000 : 0)
  );

  const engineering_quality = Math.round(
    430000 + profile.innovation_budget_index * 2800 + profile.specialized_work_index * 1600
  );

  const logisticsBase =
    profile.logistics_resilience === "High Resilience"
      ? 650000
      : profile.logistics_resilience === "Balanced"
        ? 520000
        : 390000;

  const operations_resilience = Math.round(logisticsBase + profile.inventory_cover_weeks * 60000);

  const stakeholder_visibility = Math.round(
    210000 +
      profile.community_engagement * 1700 +
      profile.digital_visibility_spend * 1600 +
      profile.csr_sustainability_index * 1200
  );

  const risk_contingency = Math.round(180000 + profile.contingency_fund_percent * 28000);

  const subcontracting_and_partnering = Math.round(
    160000 +
      (100 - profile.self_perform_percent) * 5800 +
      (profile.subcontractor_profile === "Tier 1 Proven"
        ? 130000
        : profile.subcontractor_profile === "Tier 3 Fast Track"
          ? 45000
          : 80000)
  );

  const asset_and_specialization = Math.round(
    190000 + profile.pm_utilization_target * 2800 + profile.specialized_work_index * 2100
  );

  const compliance_and_sustainability = Math.round(
    90000 +
      profile.csr_sustainability_index * 1800 +
      (profile.compliance_posture === "Strict Compliance"
        ? 70000
        : profile.compliance_posture === "Pragmatic"
          ? 30000
          : 10000) +
      profile.facilitation_budget_index * 900
  );

  const financing_cost_pressure =
    profile.financing_posture === "Growth Debt"
      ? 240000
      : profile.financing_posture === "Balanced Debt"
        ? 140000
        : 70000;

  const total_budget_pressure =
    people_l_and_d +
    engineering_quality +
    operations_resilience +
    stakeholder_visibility +
    risk_contingency +
    financing_cost_pressure +
    subcontracting_and_partnering +
    asset_and_specialization +
    compliance_and_sustainability;

  return {
    people_l_and_d,
    engineering_quality,
    operations_resilience,
    stakeholder_visibility,
    risk_contingency,
    financing_cost_pressure,
    subcontracting_and_partnering,
    asset_and_specialization,
    compliance_and_sustainability,
    total_budget_pressure,
  };
}
