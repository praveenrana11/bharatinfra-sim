"use client";

export const TEAM_MEMBER_ROLES = [
  "project_director",
  "contracts_manager",
  "planning_manager",
  "hse_manager",
  "finance_head",
] as const;

export type TeamMemberRole = (typeof TEAM_MEMBER_ROLES)[number];
export type RoleStepNumber = 1 | 2 | 3 | 4 | 5;

type RolePermission = {
  steps: RoleStepNumber[];
  owns: string[];
  label: string;
  name: string;
};

export const rolePermissions: Record<TeamMemberRole, RolePermission> = {
  project_director: {
    steps: [1, 2, 3, 4, 5],
    owns: [
      "strategic_posture",
      "risk_appetite",
      "growth_strategy",
      "dilemma_client",
      "dilemma_regulatory",
    ],
    label: "Full Access - Strategy & Escalations",
    name: "Project Director",
  },
  planning_manager: {
    steps: [1, 3, 5],
    owns: ["focus_speed", "focus_quality", "buffer", "pm_utilisation", "schedule_decisions"],
    label: "Schedule, Planning & Delivery",
    name: "Planning Manager",
  },
  contracts_manager: {
    steps: [2, 5],
    owns: [
      "bid_aggressiveness",
      "public_project_mix",
      "dilemma_procurement",
      "dilemma_commercial",
      "vendor_strategy",
    ],
    label: "Procurement, Contracts & Commercial",
    name: "Contracts Manager",
  },
  hse_manager: {
    steps: [1, 3, 4],
    owns: [
      "focus_stakeholder",
      "work_life_balance_index",
      "community_engagement",
      "csr_sustainability",
      "dilemma_people",
      "safety_decisions",
    ],
    label: "Safety, People & Community",
    name: "HSE Manager",
  },
  finance_head: {
    steps: [4, 5],
    owns: ["cash_buffer_months", "contingency_fund", "debt_posture", "facilitation_risk_budget"],
    label: "Finance, Cash & Risk",
    name: "Finance Head",
  },
};

export const roleDecisionLabels: Record<string, string> = {
  strategic_posture: "Strategic posture",
  risk_appetite: "Risk appetite",
  growth_strategy: "Growth strategy",
  dilemma_client: "Client escalations",
  dilemma_regulatory: "Regulatory escalations",
  focus_speed: "Speed focus",
  focus_quality: "Quality focus",
  buffer: "Schedule buffer",
  pm_utilisation: "P&M utilisation",
  schedule_decisions: "Schedule decisions",
  bid_aggressiveness: "Bid aggressiveness",
  public_project_mix: "Public project mix",
  dilemma_procurement: "Procurement dilemmas",
  dilemma_commercial: "Commercial dilemmas",
  vendor_strategy: "Vendor strategy",
  focus_stakeholder: "Stakeholder focus",
  work_life_balance_index: "Work-life balance",
  community_engagement: "Community engagement",
  csr_sustainability: "CSR & sustainability",
  dilemma_people: "People dilemmas",
  safety_decisions: "Safety decisions",
  cash_buffer_months: "Cash buffer",
  contingency_fund: "Contingency fund",
  debt_posture: "Debt posture",
  facilitation_risk_budget: "Facilitation risk budget",
};

export const fieldOwnership: Record<string, TeamMemberRole> = {
  team_kpi_target: "project_director",
  external_context: "project_director",
  strategic_posture: "project_director",
  market_expansion: "project_director",
  focus_cost: "finance_head",
  focus_quality: "planning_manager",
  focus_stakeholder: "hse_manager",
  focus_speed: "planning_manager",
  primary_sector: "contracts_manager",
  secondary_sector: "contracts_manager",
  project_mix_public_pct: "contracts_manager",
  self_perform_percent: "planning_manager",
  subcontractor_profile: "contracts_manager",
  pm_utilization_target: "planning_manager",
  specialized_work_index: "planning_manager",
  work_life_balance_index: "hse_manager",
  workforce_plan: "hse_manager",
  workforce_load_state: "hse_manager",
  qa_audit_frequency: "planning_manager",
  overtime_policy: "hse_manager",
  training_intensity: "hse_manager",
  innovation_budget_index: "planning_manager",
  logistics_resilience: "planning_manager",
  buffer_percent: "planning_manager",
  inventory_cover_weeks: "planning_manager",
  community_engagement: "hse_manager",
  digital_visibility_spend: "hse_manager",
  csr_sustainability_index: "hse_manager",
  facilitation_budget_index: "finance_head",
  compliance_posture: "finance_head",
  vendor_strategy: "contracts_manager",
  transparency_level: "hse_manager",
  financing_posture: "finance_head",
  cash_buffer_months: "finance_head",
  contingency_fund_percent: "finance_head",
  forecast: "finance_head",
  dilemma_procurement: "contracts_manager",
  dilemma_commercial: "contracts_manager",
  dilemma_client: "project_director",
  dilemma_regulatory: "project_director",
  dilemma_people: "hse_manager",
};

export function getRoleName(role: TeamMemberRole | null | undefined) {
  if (!role) return "Role not assigned";
  return rolePermissions[role].name;
}

export function getRoleLabel(role: TeamMemberRole | null | undefined) {
  if (!role) return "No permissions assigned yet";
  return rolePermissions[role].label;
}

export function getRoleOwnedAreas(role: TeamMemberRole | null | undefined) {
  if (!role) return [];
  return rolePermissions[role].owns.map((key) => roleDecisionLabels[key] ?? key.replace(/_/g, " "));
}

export function roleOwnsStep(role: TeamMemberRole | null | undefined, stepNumber: number) {
  if (!role) return false;
  return rolePermissions[role].steps.includes(stepNumber as RoleStepNumber);
}

export function getDecisionOwner(key: string) {
  return fieldOwnership[key] ?? null;
}

export function formatRoleList(roles: TeamMemberRole[]) {
  const names = roles.map((role) => getRoleName(role));
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}
