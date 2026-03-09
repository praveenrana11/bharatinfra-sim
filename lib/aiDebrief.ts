import { DecisionDraft, RoundResult } from "@/lib/simEngine";

export type DebriefAction = {
  title: string;
  why: string;
  concept_code: "SCHED" | "COST" | "QUAL" | "STKH" | "GOV";
  practice_minutes: number;
};

export type DebriefOutput = {
  summary: string;
  strengths: string[];
  risks: string[];
  actions: DebriefAction[];
  concept_scores: Record<DebriefAction["concept_code"], number>;
  practice_focus_codes: DebriefAction["concept_code"][];
  model_name: string;
  raw: Record<string, unknown>;
};

type PartialDecision = Partial<DecisionDraft> | null;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function toBand(score: number) {
  if (score >= 80) return "strong";
  if (score >= 65) return "moderate";
  return "needs attention";
}

export function buildDeterministicRoundDebrief(
  result: RoundResult,
  decision: PartialDecision
): DebriefOutput {
  const concept_scores: DebriefOutput["concept_scores"] = {
    SCHED: clamp(Math.round(result.schedule_index * 75), 0, 100),
    COST: clamp(Math.round(result.cost_index * 75), 0, 100),
    QUAL: clamp(Math.round(result.quality_score), 0, 100),
    STKH: clamp(Math.round(result.stakeholder_score), 0, 100),
    GOV: clamp(
      Math.round(result.safety_score * 0.55 + result.claim_entitlement_score * 0.45),
      0,
      100
    ),
  };

  const orderedWeakest = (Object.entries(concept_scores) as Array<
    [DebriefAction["concept_code"], number]
  >)
    .sort((a, b) => a[1] - b[1])
    .map(([code]) => code);

  const topStrengths = (Object.entries(concept_scores) as Array<
    [DebriefAction["concept_code"], number]
  >)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);

  const conceptLabel: Record<DebriefAction["concept_code"], string> = {
    SCHED: "Schedule control",
    COST: "Cost control",
    QUAL: "Quality assurance",
    STKH: "Stakeholder management",
    GOV: "Governance and claims",
  };

  const strengths = topStrengths.map(
    ([code, score]) => `${conceptLabel[code]} is ${toBand(score)} (${score}/100).`
  );

  const risks: string[] = [];
  if (result.schedule_index < 1) {
    risks.push("Schedule pressure detected (SPI < 1.0). Delays may compound next round.");
  }
  if (result.cost_index < 1) {
    risks.push("Cost pressure detected (CPI < 1.0). Budget drift risk is rising.");
  }
  if ((result.penalties ?? 0) > 0) {
    risks.push("Focus allocation penalty applied. Ensure focus totals exactly 100.");
  }
  if (risks.length === 0) {
    risks.push("No critical risk flags this round. Maintain discipline to preserve gains.");
  }

  const baseActions: Record<DebriefAction["concept_code"], DebriefAction> = {
    SCHED: {
      title: "Stabilize schedule execution",
      why: "Adjust buffers and sequence critical activities to lift SPI.",
      concept_code: "SCHED",
      practice_minutes: 7,
    },
    COST: {
      title: "Tighten cost controls",
      why: "Re-check procurement packages and cost-focused tradeoffs to recover CPI.",
      concept_code: "COST",
      practice_minutes: 7,
    },
    QUAL: {
      title: "Protect quality under pressure",
      why: "Prevent rework by balancing speed with quality assurance checks.",
      concept_code: "QUAL",
      practice_minutes: 6,
    },
    STKH: {
      title: "Improve stakeholder alignment",
      why: "Increase clarity and communication cadence to reduce friction.",
      concept_code: "STKH",
      practice_minutes: 6,
    },
    GOV: {
      title: "Strengthen governance evidence",
      why: "Governance rigor improves defensibility and safety consistency.",
      concept_code: "GOV",
      practice_minutes: 6,
    },
  };

  const practice_focus_codes = orderedWeakest.slice(0, 2);
  const actions = practice_focus_codes.map((code) => baseActions[code]);

  if (decision?.risk_appetite === "Aggressive") {
    actions.push({
      title: "Add a risk check before locking decisions",
      why: "Aggressive settings can improve upside but increase volatility.",
      concept_code: "GOV",
      practice_minutes: 5,
    });
  }

  const summary =
    result.points_earned >= 280
      ? "Strong round outcome. Preserve momentum while addressing weakest concepts."
      : result.points_earned >= 220
        ? "Stable round outcome with clear room for improvement in weaker concepts."
        : "Recovery round. Focused corrective practice should improve next-round performance.";

  return {
    summary,
    strengths,
    risks,
    actions: actions.slice(0, 3),
    concept_scores,
    practice_focus_codes,
    model_name: "deterministic-v1",
    raw: {
      points: result.points_earned,
      penalties: result.penalties,
      schedule_index: result.schedule_index,
      cost_index: result.cost_index,
      decision: decision ?? null,
    },
  };
}
