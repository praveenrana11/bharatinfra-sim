import { RoundResult } from "@/lib/simEngine";

export type KpiTarget =
  | "Schedule Excellence"
  | "Cost Leadership"
  | "Quality Champion"
  | "Safety First"
  | "Stakeholder Trust"
  | "Cash Discipline";

export const KPI_TARGET_OPTIONS: Array<{
  value: KpiTarget;
  short: string;
  description: string;
  thresholdLabel: string;
}> = [
  {
    value: "Schedule Excellence",
    short: "SPI",
    description: "Deliver with strong schedule reliability.",
    thresholdLabel: "SPI >= 1.05",
  },
  {
    value: "Cost Leadership",
    short: "CPI",
    description: "Protect commercial efficiency and margin discipline.",
    thresholdLabel: "CPI >= 1.04",
  },
  {
    value: "Quality Champion",
    short: "QLTY",
    description: "Maintain higher construction quality benchmark.",
    thresholdLabel: "Quality >= 85",
  },
  {
    value: "Safety First",
    short: "SAFE",
    description: "Prioritize worker and site safety outcomes.",
    thresholdLabel: "Safety >= 88",
  },
  {
    value: "Stakeholder Trust",
    short: "STKH",
    description: "Strengthen client, regulator, and community trust.",
    thresholdLabel: "Stakeholder >= 84",
  },
  {
    value: "Cash Discipline",
    short: "CASH",
    description: "Maintain strong cash position through execution.",
    thresholdLabel: "Cash >= 1200000",
  },
];

export function parseKpiTarget(value: unknown): KpiTarget | null {
  if (typeof value !== "string") return null;
  const match = KPI_TARGET_OPTIONS.find((option) => option.value === value);
  return match?.value ?? null;
}

export function evaluateKpiAchievement(target: KpiTarget | null, result: RoundResult) {
  if (!target) {
    return {
      target: null,
      achieved: false,
      metricKey: null,
      actual: null,
      threshold: null,
      thresholdLabel: "No KPI target selected",
    } as const;
  }

  if (target === "Schedule Excellence") {
    return {
      target,
      achieved: result.schedule_index >= 1.05,
      metricKey: "schedule_index",
      actual: result.schedule_index,
      threshold: 1.05,
      thresholdLabel: "SPI >= 1.05",
    } as const;
  }

  if (target === "Cost Leadership") {
    return {
      target,
      achieved: result.cost_index >= 1.04,
      metricKey: "cost_index",
      actual: result.cost_index,
      threshold: 1.04,
      thresholdLabel: "CPI >= 1.04",
    } as const;
  }

  if (target === "Quality Champion") {
    return {
      target,
      achieved: result.quality_score >= 85,
      metricKey: "quality_score",
      actual: result.quality_score,
      threshold: 85,
      thresholdLabel: "Quality >= 85",
    } as const;
  }

  if (target === "Safety First") {
    return {
      target,
      achieved: result.safety_score >= 88,
      metricKey: "safety_score",
      actual: result.safety_score,
      threshold: 88,
      thresholdLabel: "Safety >= 88",
    } as const;
  }

  if (target === "Stakeholder Trust") {
    return {
      target,
      achieved: result.stakeholder_score >= 84,
      metricKey: "stakeholder_score",
      actual: result.stakeholder_score,
      threshold: 84,
      thresholdLabel: "Stakeholder >= 84",
    } as const;
  }

  return {
    target,
    achieved: result.cash_closing >= 1_200_000,
    metricKey: "cash_closing",
    actual: result.cash_closing,
    threshold: 1_200_000,
    thresholdLabel: "Cash >= 1200000",
  } as const;
}

export function applyKpiMultiplier(basePoints: number, achieved: boolean) {
  return achieved ? basePoints * 4 : basePoints;
}
