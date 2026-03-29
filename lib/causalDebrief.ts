export interface CausalInsight {
  decision: string;
  outcome: string;
  impact: "positive" | "negative" | "neutral";
  metric: string;
  advice: string;
}

type AnyRecord = Record<string, any>;

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readPath(source: AnyRecord | null | undefined, path: string): unknown {
  if (!source) return undefined;

  return path.split(".").reduce<unknown>((current, part) => {
    if (!isRecord(current)) return undefined;
    return current[part];
  }, source);
}

function readNumber(source: AnyRecord | null | undefined, paths: string[], fallback = 0) {
  for (const path of paths) {
    const value = readPath(source, path);
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }

  return fallback;
}

function readBoolean(source: AnyRecord | null | undefined, paths: string[]) {
  for (const path of paths) {
    const value = readPath(source, path);
    if (typeof value === "boolean") return value;
  }

  return undefined;
}

function readString(source: AnyRecord | null | undefined, paths: string[], fallback = "") {
  for (const path of paths) {
    const value = readPath(source, path);
    if (typeof value === "string" && value.trim().length > 0) return value;
  }

  return fallback;
}

function formatPercent(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatIndex(value: number) {
  return value.toFixed(2);
}

function formatScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function labelKpiMetric(metric: string) {
  const normalized = metric.trim();

  if (normalized === "schedule_index") return "SPI";
  if (normalized === "cost_index") return "CPI";
  if (normalized === "quality_score") return "Quality";
  if (normalized === "safety_score") return "Safety";
  if (normalized === "stakeholder_score") return "Stakeholder";
  if (normalized === "claim_entitlement_score") return "Claim entitlement";
  if (normalized === "cash_closing") return "Cash";
  if (normalized === "points_earned") return "Points";

  return normalized || "KPI";
}

function getShockEvents(results: AnyRecord | null | undefined) {
  const directShocks = readPath(results, "shocks");
  if (Array.isArray(directShocks)) {
    return directShocks.filter(isRecord);
  }

  const events = readPath(results, "detail.events");
  if (!Array.isArray(events)) return [];

  return events.filter((event) => {
    if (!isRecord(event)) return false;
    const impacts = isRecord(event.impacts) ? event.impacts : null;
    if (!impacts) return false;

    const impactTotal = Object.values(impacts).reduce((sum, value) => {
      return sum + (typeof value === "number" && Number.isFinite(value) ? value : 0);
    }, 0);

    return impactTotal < 0;
  });
}

export function generateCausalInsights(
  decisions: Record<string, any>,
  results: Record<string, any>,
  previousResults: Record<string, any> | null
): CausalInsight[] {
  const currentDecision = isRecord(decisions) ? decisions : {};
  const currentResult = isRecord(results) ? results : {};
  const previousResult = isRecord(previousResults) ? previousResults : null;
  void previousResult;

  const speedFocus = readNumber(currentDecision, ["speedFocus", "focus_speed"]);
  const costFocus = readNumber(currentDecision, ["costFocus", "focus_cost"]);
  const qualityFocus = readNumber(currentDecision, ["qualityFocus", "focus_quality"]);
  const stakeholderFocus = readNumber(currentDecision, ["stakeholderFocus", "focus_stakeholder"]);
  const bidAggressiveness = readNumber(currentDecision, ["bidAggressiveness", "bid_aggressiveness"]);
  const workLifeBalance = readNumber(currentDecision, ["workLifeBalance", "work_life_balance_index"]);
  const communityEngagement = readNumber(currentDecision, ["communityEngagement", "community_engagement"]);

  const spi = readNumber(currentResult, ["spi", "schedule_index"]);
  const cpi = readNumber(currentResult, ["cpi", "cost_index"]);
  const safety = readNumber(currentResult, ["safety", "safety_score"]);
  const quality = readNumber(currentResult, ["quality", "quality_score"]);
  const stakeholder = readNumber(currentResult, ["stakeholder", "stakeholder_score"]);

  const insights: CausalInsight[] = [];

  if (speedFocus < 25 && spi < 0.95) {
    insights.push({
      decision: `Low speed focus (${formatPercent(speedFocus)}%)`,
      outcome: `Schedule slipped - SPI fell to ${formatIndex(spi)}`,
      impact: "negative",
      metric: "SPI",
      advice: "Increase speed focus above 30% to protect schedule",
    });
  }

  if (spi > 1.05) {
    insights.push({
      decision: "Strong speed and planning discipline",
      outcome: `Delivered ahead of schedule - SPI ${formatIndex(spi)}`,
      impact: "positive",
      metric: "SPI",
      advice: "Maintain this balance. Watch cost if speed focus exceeds 45%",
    });
  }

  if (costFocus < 20 && cpi < 0.95) {
    insights.push({
      decision: `Cost focus too low (${formatPercent(costFocus)}%)`,
      outcome: `Budget overrun - CPI dropped to ${formatIndex(cpi)}`,
      impact: "negative",
      metric: "CPI",
      advice: "Allocate at least 25% to cost focus next round",
    });
  }

  if (bidAggressiveness >= 4 && cpi < 0.9) {
    insights.push({
      decision: `Aggressive bidding (level ${formatScore(bidAggressiveness)})`,
      outcome: `Thin margins caused cash pressure - CPI ${formatIndex(cpi)}`,
      impact: "negative",
      metric: "CPI",
      advice: "Reduce bid aggressiveness to 2-3 while rebuilding margins",
    });
  }

  if (workLifeBalance < 40 && safety < 70) {
    insights.push({
      decision: `Low work-life balance index (${formatPercent(workLifeBalance)})`,
      outcome: `Team fatigue increased safety incident risk - Safety ${formatScore(safety)}`,
      impact: "negative",
      metric: "Safety",
      advice: "Keep work-life balance above 50 to prevent incidents",
    });
  }

  if (qualityFocus < 20 && quality < 65) {
    insights.push({
      decision: `Quality focus under-invested (${formatPercent(qualityFocus)}%)`,
      outcome: `Snag rate increased - Quality score ${formatScore(quality)}`,
      impact: "negative",
      metric: "Quality",
      advice: "Quality focus below 20% consistently leads to rework costs",
    });
  }

  if (stakeholderFocus < 15 && stakeholder < 65) {
    insights.push({
      decision: `Stakeholder focus low (${formatPercent(stakeholderFocus)}%)`,
      outcome: `Client satisfaction dropped - Stakeholder score ${formatScore(stakeholder)}`,
      impact: "negative",
      metric: "Stakeholder",
      advice: "Minimum 20% stakeholder focus recommended for client-heavy projects",
    });
  }

  if (communityEngagement > 60 && stakeholder > 75) {
    insights.push({
      decision: `High community engagement (${formatPercent(communityEngagement)})`,
      outcome: "Strong local relations protected stakeholder score",
      impact: "positive",
      metric: "Stakeholder",
      advice: "Sustain this - community relations compound positively over rounds",
    });
  }

  const shocks = getShockEvents(currentResult);
  for (const shock of shocks) {
    insights.push({
      decision: `Round shock: ${readString(shock, ["title"], "Unexpected event")}`,
      outcome: readString(shock, ["description"], "An external shock disrupted this round."),
      impact: "negative",
      metric: "Multiple",
      advice: "Increase facilitation risk budget to buffer against shocks",
    });
  }

  const kpiAchieved = readBoolean(currentResult, ["kpiAchieved", "detail.kpi.achieved"]);
  if (kpiAchieved === false) {
    const kpiMetric = labelKpiMetric(readString(currentResult, ["kpiMetric", "detail.kpi.metric"], "KPI"));
    insights.push({
      decision: `KPI target not met: ${kpiMetric}`,
      outcome: "4x point multiplier not earned this round",
      impact: "negative",
      metric: "KPI",
      advice: "Check if your focus allocation supports your KPI target",
    });
  }

  return insights;
}
