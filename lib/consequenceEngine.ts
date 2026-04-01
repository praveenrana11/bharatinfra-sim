import { parseDecisionProfile } from "@/lib/decisionProfile";
import { parseStoredDilemmaSummary } from "@/lib/dilemmaEngine";

export interface CarryoverState {
  fatigue_index: number;
  relationship_score: number;
  documentation_quality: number;
  subcontractor_reliability: number;
  regulatory_exposure: number;
  labour_stability: number;
}

export interface TeamResult {
  cash_closing?: number | null;
  stakeholder_score?: number | null;
  ld_triggered?: boolean | null;
  detail?: Record<string, unknown> | null;
}

export interface Decision {
  focus_speed?: number | null;
  governance_intensity?: string | null;
  raw?: Record<string, unknown> | null;
}

export type CarryoverRiskIndicator = {
  key: "fatigue" | "regulatory" | "labour" | "relationship" | "stable";
  label: string;
  tone: "good" | "warning" | "danger";
  severity: number;
};

export const DEFAULT_CARRYOVER_STATE: CarryoverState = {
  fatigue_index: 20,
  relationship_score: 70,
  documentation_quality: 60,
  subcontractor_reliability: 70,
  regulatory_exposure: 10,
  labour_stability: 80,
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function governanceIntensityScore(decision: Decision | null | undefined) {
  const direct = decision?.governance_intensity;
  if (direct === "High") return 80;
  if (direct === "Medium") return 50;
  if (direct === "Low") return 20;

  const rawValue = decision?.raw?.governance_intensity;
  if (typeof rawValue === "number") return clamp(rawValue, 0, 100);

  return 50;
}

function speedFocusScore(decision: Decision | null | undefined) {
  if (typeof decision?.focus_speed === "number") {
    return clamp(decision.focus_speed, 0, 100);
  }

  const rawValue = decision?.raw?.focus_speed ?? decision?.raw?.speedFocus;
  return clamp(toNumber(rawValue, 0), 0, 100);
}

function transparencyMode(decision: Decision | null | undefined) {
  const rawValue = decision?.raw?.transparency_mode ?? decision?.raw?.transparency_level;
  if (typeof rawValue === "string") {
    if (rawValue === "Proactive") return "Proactive";
    if (rawValue === "Public" || rawValue === "Public Dashboard") return "Public";
    return "Standard";
  }

  const profile = parseDecisionProfile(decision?.raw);
  const normalized: string =
    typeof profile.transparency_level === "string" ? String(profile.transparency_level) : "";

  if (normalized === "Proactive") return "Proactive";
  if (normalized === "Public" || normalized === "Public Dashboard") return "Public";
  return "Standard";
}

function workLifeBalanceIndex(decision: Decision | null | undefined) {
  const profile = parseDecisionProfile(decision?.raw);
  return clamp(profile.work_life_balance_index, 0, 100);
}

function subcontractorAdjustment(decision: Decision | null | undefined, result: TeamResult | null | undefined) {
  const profile = parseDecisionProfile(decision?.raw);
  let delta = 0;

  if (profile.subcontractor_profile === "Tier 1 Proven") delta += 10;
  if (profile.subcontractor_profile === "Tier 3 Fast Track") delta -= 10;
  if (governanceIntensityScore(decision) > 70) delta += 5;
  if (toNumber(result?.cash_closing, 0) < 0) delta -= 10;

  return delta;
}

function handledRiskyRegulatoryDilemma(decision: Decision | null | undefined) {
  const summary = parseStoredDilemmaSummary(decision?.raw);
  if (!summary) return false;

  return summary.selected.some(
    (selection) => selection.category === "regulatory" && selection.risk_level === "high"
  );
}

export function parseCarryoverState(value: unknown): CarryoverState {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_CARRYOVER_STATE };
  }

  const source = value as Record<string, unknown>;
  return {
    fatigue_index: clamp(toNumber(source.fatigue_index, DEFAULT_CARRYOVER_STATE.fatigue_index), 0, 100),
    relationship_score: clamp(
      toNumber(source.relationship_score, DEFAULT_CARRYOVER_STATE.relationship_score),
      0,
      100
    ),
    documentation_quality: clamp(
      toNumber(source.documentation_quality, DEFAULT_CARRYOVER_STATE.documentation_quality),
      0,
      100
    ),
    subcontractor_reliability: clamp(
      toNumber(source.subcontractor_reliability, DEFAULT_CARRYOVER_STATE.subcontractor_reliability),
      0,
      100
    ),
    regulatory_exposure: clamp(
      toNumber(source.regulatory_exposure, DEFAULT_CARRYOVER_STATE.regulatory_exposure),
      0,
      100
    ),
    labour_stability: clamp(
      toNumber(source.labour_stability, DEFAULT_CARRYOVER_STATE.labour_stability),
      0,
      100
    ),
  };
}

export function computeCarryover(
  previousResults: TeamResult[],
  previousDecisions: Decision[]
): CarryoverState {
  let fatigueIndex = DEFAULT_CARRYOVER_STATE.fatigue_index;
  let relationshipScore = DEFAULT_CARRYOVER_STATE.relationship_score;
  let documentationQuality = DEFAULT_CARRYOVER_STATE.documentation_quality;
  let subcontractorReliability = DEFAULT_CARRYOVER_STATE.subcontractor_reliability;
  let regulatoryExposure = DEFAULT_CARRYOVER_STATE.regulatory_exposure;
  let labourStability = DEFAULT_CARRYOVER_STATE.labour_stability;

  const roundCount = Math.max(previousResults.length, previousDecisions.length);
  let ldTriggered = false;
  let riskyRegulatoryChoice = false;

  for (let index = 0; index < roundCount; index += 1) {
    const result = previousResults[index] ?? null;
    const decision = previousDecisions[index] ?? null;

    const workLifeBalance = workLifeBalanceIndex(decision);
    const speedFocus = speedFocusScore(decision);
    const governanceIntensity = governanceIntensityScore(decision);
    const stakeholderScore = clamp(toNumber(result?.stakeholder_score, 70), 0, 100);
    const cashClosing = toNumber(result?.cash_closing, 0);
    const transparency = transparencyMode(decision);

    if (workLifeBalance < 40) fatigueIndex += 15;
    if (speedFocus > 40) fatigueIndex += 10;
    if (workLifeBalance > 65) fatigueIndex -= 10;

    if (stakeholderScore > 80) relationshipScore += 5;
    if (stakeholderScore < 60) relationshipScore -= 10;
    if (transparency === "Standard" && stakeholderScore < 70) relationshipScore -= 5;

    if (governanceIntensity > 70) documentationQuality += 10;
    if (governanceIntensity < 30) documentationQuality -= 10;
    if (transparency === "Proactive" || transparency === "Public") documentationQuality += 5;

    if (governanceIntensity < 30) regulatoryExposure += 20;
    if (governanceIntensity > 70) regulatoryExposure -= 10;

    if (workLifeBalance < 35) labourStability -= 15;
    if (cashClosing < 0) labourStability -= 10;
    if (workLifeBalance > 70) labourStability += 10;

    subcontractorReliability += subcontractorAdjustment(decision, result);

    ldTriggered = ldTriggered || Boolean(result?.ld_triggered);
    riskyRegulatoryChoice = riskyRegulatoryChoice || handledRiskyRegulatoryDilemma(decision);
  }

  if (ldTriggered) relationshipScore -= 15;
  if (riskyRegulatoryChoice) regulatoryExposure += 15;

  return {
    fatigue_index: clamp(fatigueIndex, 0, 100),
    relationship_score: clamp(relationshipScore, 0, 100),
    documentation_quality: clamp(documentationQuality, 0, 100),
    subcontractor_reliability: clamp(subcontractorReliability, 0, 100),
    regulatory_exposure: clamp(regulatoryExposure, 0, 100),
    labour_stability: clamp(labourStability, 0, 100),
  };
}

export function getCarryoverRiskIndicators(carryoverState: CarryoverState): CarryoverRiskIndicator[] {
  const indicators: CarryoverRiskIndicator[] = [];

  if (carryoverState.fatigue_index > 60) {
    indicators.push({
      key: "fatigue",
      label: "🔴 High Team Fatigue",
      tone: "danger",
      severity: carryoverState.fatigue_index - 60,
    });
  }

  if (carryoverState.relationship_score < 60) {
    indicators.push({
      key: "relationship",
      label: "🔴 Client Relationship Strained",
      tone: "danger",
      severity: 60 - carryoverState.relationship_score,
    });
  }

  if (carryoverState.regulatory_exposure > 50) {
    indicators.push({
      key: "regulatory",
      label: "🟡 Regulatory Exposure",
      tone: "warning",
      severity: carryoverState.regulatory_exposure - 50,
    });
  }

  if (carryoverState.labour_stability < 60) {
    indicators.push({
      key: "labour",
      label: "🟡 Labour Instability",
      tone: "warning",
      severity: 60 - carryoverState.labour_stability,
    });
  }

  if (indicators.length === 0) {
    return [
      {
        key: "stable",
        label: "🟢 Site Conditions Stable",
        tone: "good",
        severity: 0,
      },
    ];
  }

  return indicators
    .sort((left, right) => right.severity - left.severity)
    .slice(0, 3);
}
