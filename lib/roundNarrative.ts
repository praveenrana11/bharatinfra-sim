import {
  DEFAULT_CARRYOVER_STATE,
  parseCarryoverState,
  type CarryoverState,
} from "@/lib/consequenceEngine";

type PreviousResultsLike = {
  spi?: number | null;
  schedule_index?: number | null;
  safety?: number | null;
  safety_score?: number | null;
  stakeholder?: number | null;
  stakeholder_score?: number | null;
  ld_triggered?: boolean | null;
} | null;

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function clampSentenceCount(sentences: string[]) {
  return sentences.slice(0, 4).join(" ");
}

function resolveScenarioLabel(scenarioType: string) {
  const normalized = scenarioType.trim();
  return normalized.length > 0 ? normalized : "project";
}

function resolvePreviousResults(previousResults: PreviousResultsLike) {
  if (!previousResults) {
    return {
      spi: null,
      safety: null,
      stakeholder: null,
      ldTriggered: false,
    };
  }

  return {
    spi: toNumber(previousResults.spi ?? previousResults.schedule_index),
    safety: toNumber(previousResults.safety ?? previousResults.safety_score),
    stakeholder: toNumber(previousResults.stakeholder ?? previousResults.stakeholder_score),
    ldTriggered: Boolean(previousResults.ld_triggered),
  };
}

function resolveCarryoverState(carryoverState: CarryoverState | null | unknown) {
  return carryoverState ? parseCarryoverState(carryoverState) : DEFAULT_CARRYOVER_STATE;
}

export function generateRoundNarrative(
  roundNumber: number,
  scenarioType: string,
  client: string,
  projectName: string,
  previousResults: PreviousResultsLike,
  carryoverState: CarryoverState | null | unknown
): string {
  const safeClient = client.trim() || "The client";
  const safeProjectName = projectName.trim() || "the project";
  const safeScenarioType = resolveScenarioLabel(scenarioType).toLowerCase();

  if (roundNumber <= 1 || !previousResults) {
    return [
      "Week 1 on site.",
      `The mobilisation phase is behind me on the ${safeScenarioType} package, equipment is in place, and the subcontractor teams have started positioning across ${safeProjectName}.`,
      `${safeClient} has confirmed Milestone 1 expectations and the PMC team will be on site next month.`,
      "This is the window for me to establish the execution rhythm before noise starts to build.",
    ].join(" ");
  }

  const previous = resolvePreviousResults(previousResults);
  const carryover = resolveCarryoverState(carryoverState);
  const sentences: string[] = [
    `Quarter ${roundNumber} is opening on ${safeProjectName}, and I am carrying the last site signals straight into this round's execution plan.`,
  ];

  const specificSignals: string[] = [];

  if (previous.ldTriggered) {
    specificSignals.push(
      "Liquidated damages were invoked last quarter, the deduction has tightened cash flow, and the hit to team morale is still visible on site."
    );
  }

  if ((previous.spi ?? 1) < 0.95) {
    specificSignals.push(
      `I am still under schedule pressure after last quarter; ${safeClient}'s PMC flagged the delay in their last visit and recovery is now the first management priority.`
    );
  } else if ((previous.spi ?? 1) > 1.0) {
    specificSignals.push(
      `I am coming in with momentum after a strong quarter, and ${safeClient} acknowledged that ahead-of-baseline performance in the review cycle.`
    );
  }

  if ((previous.safety ?? 100) < 72) {
    specificSignals.push(
      "The near-miss from last quarter is still being discussed at the safety committee, inspector attention is up, and I need to rebuild crew confidence visibly."
    );
  }

  if ((previous.stakeholder ?? 0) > 80) {
    specificSignals.push(
      `Client relations are in good shape, ${safeClient}'s team is responsive, and I can use that goodwill carefully while the variation register is still moving.`
    );
  }

  if (specificSignals.length === 0 && carryover.relationship_score < 60) {
    specificSignals.push(
      `Trust on the client side is thinner than I want, so every update to ${safeClient} needs to be sharper and more disciplined this quarter.`
    );
  }

  if (specificSignals.length === 0 && carryover.labour_stability < 60) {
    specificSignals.push(
      "Labour confidence feels fragile going into the round, and I need steadier site discipline before a routine issue turns into lost production."
    );
  }

  if (specificSignals.length === 0) {
    specificSignals.push(
      "Nothing is broken yet, but the site is at the stage where small coordination misses will start compounding if I let daily controls slip."
    );
  }

  sentences.push(...specificSignals.slice(0, 2));

  if (carryover.regulatory_exposure > 60) {
    sentences.push("Documentation and compliance discipline need to stay tight because any avoidable inspection issue will cost us time we do not have.");
  } else if (carryover.fatigue_index > 70) {
    sentences.push("The team has been carrying fatigue longer than is healthy, so I need this round to recover control without burning out the people holding the fronts together.");
  } else {
    sentences.push("This round's calls will decide whether I turn the current position into controlled progress or let the site drift into a harder recovery cycle.");
  }

  return clampSentenceCount(sentences);
}
