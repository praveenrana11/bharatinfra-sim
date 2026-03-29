export type ReviewCause = {
  title: string;
  because: string;
  concept_tag: string;
  recommended_action: string;
};

export type CalibrationGrade = "A" | "B" | "C" | "D";

export type AfterActionReview = {
  headline: string;
  causes: ReviewCause[];
  calibration: {
    spi_diff: number;
    cpi_diff: number;
    calibration_grade: CalibrationGrade;
  };
};

export type ReviewInput = {
  actual: {
    schedule_index: number;
    cost_index: number;
    points_earned: number;
    quality_score: number;
    safety_score: number;
    stakeholder_score: number;
  };
  forecast?: {
    predicted_schedule_index: number;
    predicted_cost_index: number;
    confidence: number;
  } | null;
  eventsChosen?: Array<{ eventId: string; choiceId: string }> | null;
  decisions: {
    buffer_percent: number;
    risk_appetite: string;
    governance_intensity: string;
    focus_speed: number;
    focus_cost: number;
    focus_quality: number;
    focus_stakeholder: number;
  };
};

export function buildAfterActionReview(input: ReviewInput): AfterActionReview {
  const causes: ReviewCause[] = [];
  
  // 1. Calibration Grading
  let spiDiff = 0;
  let cpiDiff = 0;
  let grade: CalibrationGrade = "C";
  
  if (input.forecast) {
    spiDiff = Math.abs(input.forecast.predicted_schedule_index - input.actual.schedule_index);
    cpiDiff = Math.abs(input.forecast.predicted_cost_index - input.actual.cost_index);
    const totalError = spiDiff + cpiDiff;
    
    if (totalError <= 0.05) grade = "A";
    else if (totalError <= 0.15) grade = "B";
    else if (totalError <= 0.30) grade = "C";
    else grade = "D";
    
    if (grade === "D" && input.forecast.confidence >= 75) {
      causes.push({
        title: "Overconfidence Penalty",
        because: `You predicted high confidence (${input.forecast.confidence}%) but missed metrics by ${totalError.toFixed(2)} total margin.`,
        concept_tag: "Dunning-Kruger Effect",
        recommended_action: "Lower confidence scores when facing volatile new events, or invest in better planning data."
      });
    } else if (grade === "A" && input.forecast.confidence >= 80) {
      causes.push({
        title: "Masterful Calibration",
        because: `You accurately forecasted exactly how strategic tradeoffs would play out in reality with high confidence.`,
        concept_tag: "Expert Calibration",
        recommended_action: "Maintain this predictive accuracy as complexities rise in future rounds."
      });
    }
  }

  // 2. Risk & Buffer heuristics
  if (input.decisions.risk_appetite === "Aggressive" && input.decisions.buffer_percent < 5 && input.actual.schedule_index < 0.95) {
    causes.push({
      title: "Schedule Fragility Exposed",
      because: `Aggressive risk-taking without sufficient buffer (${input.decisions.buffer_percent}%) caused cascade delays when shocks hit.`,
      concept_tag: "Buffer Management",
      recommended_action: "Increase buffer capacity or reduce aggressiveness when external volatility markers are high."
    });
  }

  if (input.decisions.focus_cost > 35 && input.actual.quality_score < 75) {
    causes.push({
      title: "Cost Over-Optimization",
      because: `Over-allocating focus to Cost (${input.decisions.focus_cost}%) starved the project of necessary quality controls.`,
      concept_tag: "Tradeoff Dynamics",
      recommended_action: "Rebalance focus points towards quality or increase governance intensity."
    });
  }

  if (input.decisions.focus_speed > 35 && input.actual.safety_score < 75) {
    causes.push({
      title: "Reckless Acceleration",
      because: `Excessive focus on speed (${input.decisions.focus_speed}%) bypassed critical safety pause-points.`,
      concept_tag: "Safety Risk",
      recommended_action: "Implement High Governance if you must accelerate, to provide guardrails."
    });
  }
  
  if (input.decisions.governance_intensity === "Low" && input.actual.stakeholder_score < 70) {
    causes.push({
      title: "Stakeholder Drift",
      because: "Low governance meant stakeholder grievances compounded without systematic resolution channels.",
      concept_tag: "Stakeholder Theory",
      recommended_action: "Elevate governance or directly increase stakeholder focus next round."
    });
  }

  // 3. Event Choice specific narratives
  if (input.eventsChosen && input.eventsChosen.length > 0) {
    const defensive = input.eventsChosen.find(e => e.choiceId === "A" && e.eventId === "EVT_MONSOON_WARNING");
    if (defensive) {
      causes.push({
        title: "Defensive Success",
        because: "Choosing to secure the site during the weather warning protected quality but naturally hit schedule.",
        concept_tag: "Risk Avoidance",
        recommended_action: "Ensure you accelerate non-critical path activities next round to recover time."
      });
    }
    
    const capitulate = input.eventsChosen.find(e => e.choiceId === "A" && e.eventId === "EVT_LABOR_UNION");
    if (capitulate) {
      causes.push({
        title: "Union Capitulation",
        because: "Accepting union demands unconditionally preserved schedule momentum but permanently elevated cost baselines.",
        concept_tag: "Negotiation Dynamics",
        recommended_action: "Try linking rewards to performance thresholds rather than granting flat pay hikes."
      });
    }
  }

  // Fallback defaults if no causes triggered
  if (causes.length === 0) {
    if (input.actual.points_earned >= 80) {
      causes.push({
        title: "Balanced Execution",
        because: "Your distributed focus avoided critical system failures, maintaining stability across all metrics.",
        concept_tag: "System Stability",
        recommended_action: "Look for targeted areas to aggressively optimize next round."
      });
    } else {
      causes.push({
        title: "Mediocre Alignment",
        because: "The combination of decisions neither heavily damaged nor particularly drove project value.",
        concept_tag: "Strategic Drift",
        recommended_action: "Adopt a stronger, more opinionated posture (e.g., intense Cost Leadership, or extreme Quality)."
      });
    }
  }

  const topCauses = causes.slice(0, 3);
  
  let headline = "Review: Steady execution with standard tradeoffs.";
  if (grade === "A") headline = "Review: Exceptional predictive command of the simulation.";
  else if (grade === "D") headline = "Review: Strategy disconnected from actual environmental constraints.";
  else if (input.actual.points_earned < 50) headline = "Review: Approaching project failure due to compounding errors.";

  return {
    headline,
    causes: topCauses,
    calibration: {
      spi_diff: spiDiff,
      cpi_diff: cpiDiff,
      calibration_grade: grade
    }
  };
}
