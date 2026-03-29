"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { getRoundConstructionEvents, ConstructionEvent } from "@/lib/constructionNews";
import { parseConstructionEvents, csvToTags, tagsToCsv, makeNewsEventId } from "@/lib/newsPayload";
import { getNewsImageUrl } from "@/lib/newsVisuals";
import { ROUND_NEWS_TEMPLATES, buildTemplateEvents, getRoundNewsTemplate } from "@/lib/newsTemplates";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type HostedSession = {
  id: string;
  code: string;
  name: string | null;
  status: string;
  round_count: number;
  current_round: number;
  created_at: string;
};

type TeamRow = {
  id: string;
  session_id: string;
  team_name: string;
  total_points: number | null;
  kpi_target: string | null;
};

type SessionRoundRow = {
  status: string | null;
  deadline_at: string;
  news_payload: unknown;
  updated_at: string;
  closed_at: string | null;
  closed_by: string | null;
};


type ScenarioPromotionRow = {
  id: string;
  user_id: string;
  team_id: string;
  target_round: number;
  source_scenario_name: string | null;
  promotion_payload: unknown;
  applied_at: string | null;
  updated_at: string;
  created_at: string;
};

type TeamResultRow = {
  team_id: string;
  round_number: number;
  points_earned: number | null;
  penalties: number | null;
  schedule_index: number | null;
  cost_index: number | null;
  cash_closing: number | null;
  detail: unknown;
};

type PromotionOutcomeVerdict = "Positive" | "Mixed" | "Negative" | "Pending";

type PromotionOutcome = {
  verdict: PromotionOutcomeVerdict;
  pointsDelta: number | null;
  debtDelta: number | null;
  spiDelta: number | null;
  cpiDelta: number | null;
  penaltiesDelta: number | null;
};

type CustomTemplateRow = {
  id: string;
  name: string;
  description: string;
  sector_tags: string[] | null;
  visibility_scope: "private" | "session";
  session_id: string | null;
  template_payload: unknown;
  created_at: string;
};

type EditableNewsEvent = {
  id: string;
  title: string;
  description: string;
  image_url: string;
  tags_csv: string;
  severity: 1 | 2 | 3;
  impact_schedule: number;
  impact_cost: number;
  impact_quality: number;
  impact_safety: number;
  impact_stakeholder: number;
  impact_cash: number;
};

const DEFAULT_ROUND_WINDOW_MINUTES = 35;

function clampRound(roundNumber: number, roundCount: number) {
  if (roundCount <= 0) return 1;
  return Math.min(Math.max(roundNumber, 1), roundCount);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function asNumber(value: string, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}


function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function toText(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function toNumber(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function promotionBrief(payload: unknown) {
  const source = toRecord(payload) ?? {};
  const risk = toText(source.risk_appetite, "Balanced");
  const governance = toText(source.governance_intensity, "Medium");
  const selfPerform = Math.round(clamp(toNumber(source.self_perform_percent, 0), 0, 100));
  const subcontract = Math.round(clamp(100 - selfPerform, 0, 100));
  const focusCost = Math.round(clamp(toNumber(source.focus_cost, 25), 0, 100));
  const focusSpeed = Math.round(clamp(toNumber(source.focus_speed, 25), 0, 100));

  return {
    risk,
    governance,
    selfPerform,
    subcontract,
    focusCost,
    focusSpeed,
  };
}

function escapeCsvCell(value: unknown) {
  const raw = value === null || value === undefined ? "" : String(value);
  const escaped = raw.replace(/"/g, '""');
  return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
}

function buildCsv(headers: string[], rows: Array<Array<unknown>>) {
  const lines = [headers.map((h) => escapeCsvCell(h)).join(",")];
  for (const row of rows) {
    lines.push(row.map((cell) => escapeCsvCell(cell)).join(","));
  }
  return lines.join("\n");
}
function isMissingTableError(message: string) {
  const lower = message.toLowerCase();

  return (
    lower.includes("does not exist") ||
    lower.includes("relation") ||
    lower.includes("42p01") ||
    lower.includes("schema cache") ||
    lower.includes("could not find the table")
  );
}

function formatDateTime(iso: string | null) {
  if (!iso) return "Not set";
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return "Invalid date";
  return new Date(parsed).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function extractRiskDebtTotal(detail: unknown) {
  const detailRecord = toRecord(detail);
  const debtTotals = toRecord(detailRecord?.riskDebtTotals);
  const fromTotals = toNumber(debtTotals?.current, -1);
  if (fromTotals >= 0) return fromTotals;

  const debt = toRecord(detailRecord?.riskDebt);
  const delivery = toNumber(debt?.delivery, 0);
  const quality = toNumber(debt?.quality, 0);
  const safety = toNumber(debt?.safety, 0);
  const stakeholder = toNumber(debt?.stakeholder, 0);
  const compliance = toNumber(debt?.compliance, 0);
  const cash = toNumber(debt?.cash, 0);
  return delivery + quality + safety + stakeholder + compliance + cash;
}

function formatSigned(value: number | null, digits = 2) {
  if (value === null) return "N/A";
  const rounded = Number(value.toFixed(digits));
  if (rounded > 0) return `+${rounded.toFixed(digits)}`;
  return rounded.toFixed(digits);
}


function formatInr(value: number | null) {
  if (value === null) return "N/A";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value);
}

function buildSparklinePath(values: number[], width = 84, height = 24, pad = 2) {
  if (values.length === 0) return "";

  const innerW = Math.max(1, width - pad * 2);
  const innerH = Math.max(1, height - pad * 2);
  const points = values.map((raw, index) => {
    const value = clamp(raw, 0, 1);
    const x = values.length === 1 ? width / 2 : pad + (index / (values.length - 1)) * innerW;
    const y = pad + (1 - value) * innerH;
    return { x, y };
  });

  const [first, ...rest] = points;
  return `M ${first.x.toFixed(2)} ${first.y.toFixed(2)} ${rest
    .map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ")}`;
}
function kpiThresholdLabelForTarget(target: string | null | undefined) {
  if (target === "Schedule Excellence") return "SPI >= 1.05";
  if (target === "Cost Leadership") return "CPI >= 1.04";
  if (target === "Quality Champion") return "Quality >= 85";
  if (target === "Safety First") return "Safety >= 88";
  if (target === "Stakeholder Trust") return "Stakeholder >= 84";
  if (target === "Cash Discipline") return "Cash >= 1200000";
  return "No KPI target selected";
}

function evaluateKpiAchievedFromTarget(target: string | null | undefined, row: TeamResultRow) {
  if (!target) return null;
  if (target === "Schedule Excellence") return (row.schedule_index ?? 0) >= 1.05;
  if (target === "Cost Leadership") return (row.cost_index ?? 0) >= 1.04;

  const detail = toRecord(row.detail);
  const kpi = toRecord(detail?.kpi);
  const actual = toNumber(kpi?.actual, Number.NaN);

  if (target === "Quality Champion") return Number.isFinite(actual) ? actual >= 85 : null;
  if (target === "Safety First") return Number.isFinite(actual) ? actual >= 88 : null;
  if (target === "Stakeholder Trust") return Number.isFinite(actual) ? actual >= 84 : null;
  if (target === "Cash Discipline") return Number.isFinite(actual) ? actual >= 1_200_000 : (row.cash_closing ?? 0) >= 1_200_000;
  return null;
}

function toEditableEvent(event: ConstructionEvent): EditableNewsEvent {
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    image_url: event.image_url ?? "",
    tags_csv: tagsToCsv(event.tags),
    severity: event.severity,
    impact_schedule: event.impacts.schedule,
    impact_cost: event.impacts.cost,
    impact_quality: event.impacts.quality,
    impact_safety: event.impacts.safety,
    impact_stakeholder: event.impacts.stakeholder,
    impact_cash: event.impacts.cash,
  };
}

function makeBlankDraft(index: number): EditableNewsEvent {
  return {
    id: `custom-${index + 1}`,
    title: `Custom Event ${index + 1}`,
    description: "Describe the event for this round and how teams should respond.",
    image_url: "",
    tags_csv: "general, custom",
    severity: 2,
    impact_schedule: -0.02,
    impact_cost: -0.02,
    impact_quality: -1,
    impact_safety: -1,
    impact_stakeholder: -1,
    impact_cash: -25000,
  };
}

function draftToConstructionEvents(draft: EditableNewsEvent[]) {
  return draft.map((event, index): ConstructionEvent => {
    const title = event.title.trim() || `Custom Event ${index + 1}`;
    const description = event.description.trim() || "No description provided.";
    const id = makeNewsEventId(event.id.trim() || title, index);

    return {
      id,
      title,
      description,
      image_url: event.image_url.trim() || undefined,
      severity: event.severity,
      tags: csvToTags(event.tags_csv),
      impacts: {
        schedule: clamp(event.impact_schedule, -0.2, 0.2),
        cost: clamp(event.impact_cost, -0.2, 0.2),
        quality: clamp(event.impact_quality, -20, 20),
        safety: clamp(event.impact_safety, -20, 20),
        stakeholder: clamp(event.impact_stakeholder, -20, 20),
        cash: clamp(event.impact_cash, -500000, 500000),
      },
    };
  });
}

export default function AdminPage() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [savingNewsDraft, setSavingNewsDraft] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [userId, setUserId] = useState("");
  const [hostedSessions, setHostedSessions] = useState<HostedSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");

  const [teamRows, setTeamRows] = useState<TeamRow[]>([]);
  const [teamResultRows, setTeamResultRows] = useState<TeamResultRow[]>([]);
  const [promotionRows, setPromotionRows] = useState<ScenarioPromotionRow[]>([]);
  const [promotionLoading, setPromotionLoading] = useState(false);
  const [promotionError, setPromotionError] = useState("");
  const [resultLoading, setResultLoading] = useState(false);
  const [resultError, setResultError] = useState("");
  const [promotionsReady, setPromotionsReady] = useState(true);
  const [roundControl, setRoundControl] = useState(1);
  const [roundRow, setRoundRow] = useState<SessionRoundRow | null>(null);
  const [newsDraft, setNewsDraft] = useState<EditableNewsEvent[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(ROUND_NEWS_TEMPLATES[0]?.id ?? "");
  const [customTemplates, setCustomTemplates] = useState<CustomTemplateRow[]>([]);
  const [selectedCustomTemplateId, setSelectedCustomTemplateId] = useState("");
  const [customTemplateName, setCustomTemplateName] = useState("");
  const [customTemplateDescription, setCustomTemplateDescription] = useState("");
  const [customTemplateSectorCsv, setCustomTemplateSectorCsv] = useState("");
  const [customTemplateScope, setCustomTemplateScope] = useState<"private" | "session">("private");
  const [savingCustomTemplate, setSavingCustomTemplate] = useState(false);
  const [deletingCustomTemplateId, setDeletingCustomTemplateId] = useState("");
  const [customTemplatesReady, setCustomTemplatesReady] = useState(true);

  const selectedSession = hostedSessions.find((session) => session.id === selectedSessionId) ?? null;
  const selectedTemplate = useMemo(() => getRoundNewsTemplate(selectedTemplateId), [selectedTemplateId]);
  const selectedCustomTemplate = useMemo(
    () => customTemplates.find((template) => template.id === selectedCustomTemplateId) ?? null,
    [customTemplates, selectedCustomTemplateId]
  );
  const defaultRoundEvents = useMemo(
    () => (selectedSession ? getRoundConstructionEvents(selectedSession.id, roundControl) : []),
    [selectedSession, roundControl]
  );

  const effectiveDraftEvents = useMemo(
    () => (newsDraft.length > 0 ? draftToConstructionEvents(newsDraft) : defaultRoundEvents),
    [newsDraft, defaultRoundEvents]
  );

  const teamNameById = useMemo(() => new Map(teamRows.map((team) => [team.id, team.team_name])), [teamRows]);

  const promotionsForRound = useMemo(
    () => promotionRows.filter((row) => row.target_round === roundControl),
    [promotionRows, roundControl]
  );

  const promotionsAppliedCount = useMemo(
    () => promotionsForRound.filter((row) => Boolean(row.applied_at)).length,
    [promotionsForRound]
  );

  const latestPromotionByTeam = useMemo(() => {
    const map = new Map<string, ScenarioPromotionRow>();
    for (const row of promotionsForRound) {
      const existing = map.get(row.team_id);
      if (!existing || row.updated_at > existing.updated_at) {
        map.set(row.team_id, row);
      }
    }
    return map;
  }, [promotionsForRound]);
  const resultByTeamRound = useMemo(() => {
    const map = new Map<string, TeamResultRow>();
    for (const row of teamResultRows) {
      map.set(`${row.team_id}:${row.round_number}`, row);
    }
    return map;
  }, [teamResultRows]);

  const promotionOutcomeByTeam = useMemo(() => {
    const map = new Map<string, PromotionOutcome>();

    for (const team of teamRows) {
      if (!latestPromotionByTeam.has(team.id)) continue;
      const current = resultByTeamRound.get(`${team.id}:${roundControl}`) ?? null;
      const previous = resultByTeamRound.get(`${team.id}:${roundControl - 1}`) ?? null;

      if (!current || !previous) {
        map.set(team.id, {
          verdict: "Pending",
          pointsDelta: null,
          debtDelta: null,
          spiDelta: null,
          cpiDelta: null,
          penaltiesDelta: null,
        });
        continue;
      }

      const pointsDelta = (current.points_earned ?? 0) - (previous.points_earned ?? 0);
      const debtDelta = Number((extractRiskDebtTotal(current.detail) - extractRiskDebtTotal(previous.detail)).toFixed(1));
      const spiDelta = Number(((current.schedule_index ?? 0) - (previous.schedule_index ?? 0)).toFixed(2));
      const cpiDelta = Number(((current.cost_index ?? 0) - (previous.cost_index ?? 0)).toFixed(2));
      const penaltiesDelta = (current.penalties ?? 0) - (previous.penalties ?? 0);

      let score = 0;
      if (pointsDelta >= 0) score += 1;
      if (debtDelta <= 0) score += 1;
      if (spiDelta >= 0) score += 1;
      if (cpiDelta >= 0) score += 1;
      if (penaltiesDelta <= 0) score += 1;

      const verdict: PromotionOutcomeVerdict = score >= 4 ? "Positive" : score <= 1 ? "Negative" : "Mixed";

      map.set(team.id, {
        verdict,
        pointsDelta,
        debtDelta,
        spiDelta,
        cpiDelta,
        penaltiesDelta,
      });
    }

    return map;
  }, [teamRows, latestPromotionByTeam, resultByTeamRound, roundControl]);

  const promotionOutcomeSummary = useMemo(() => {
    const outcomes = Array.from(promotionOutcomeByTeam.values());
    return {
      teamsPromoted: outcomes.length,
      evaluated: outcomes.filter((row) => row.verdict !== "Pending").length,
      positive: outcomes.filter((row) => row.verdict === "Positive").length,
      mixed: outcomes.filter((row) => row.verdict === "Mixed").length,
      negative: outcomes.filter((row) => row.verdict === "Negative").length,
      pending: outcomes.filter((row) => row.verdict === "Pending").length,
    };
  }, [promotionOutcomeByTeam]);


  const roundResultRows = useMemo(() => {
    const rows: Array<{
      teamId: string;
      teamName: string;
      points: number;
      penalties: number;
      spi: number;
      cpi: number;
      riskDebt: number;
      pointsDelta: number | null;
      debtDelta: number | null;
    }> = [];

    for (const team of teamRows) {
      const current = resultByTeamRound.get(`${team.id}:${roundControl}`) ?? null;
      if (!current) continue;

      const previous = resultByTeamRound.get(`${team.id}:${roundControl - 1}`) ?? null;
      const points = current.points_earned ?? 0;
      const penalties = current.penalties ?? 0;
      const spi = current.schedule_index ?? 0;
      const cpi = current.cost_index ?? 0;
      const riskDebt = extractRiskDebtTotal(current.detail);

      const pointsDelta = previous ? points - (previous.points_earned ?? 0) : null;
      const debtDelta = previous ? Number((riskDebt - extractRiskDebtTotal(previous.detail)).toFixed(1)) : null;

      rows.push({
        teamId: team.id,
        teamName: team.team_name,
        points,
        penalties,
        spi,
        cpi,
        riskDebt,
        pointsDelta,
        debtDelta,
      });
    }

    rows.sort((a, b) => b.points - a.points || a.penalties - b.penalties || a.teamName.localeCompare(b.teamName));
    return rows;
  }, [teamRows, resultByTeamRound, roundControl]);

  const roundReviewModel = useMemo(() => {
    if (!selectedSession) return null;

    const teamsWithResults = roundResultRows.length;
    const totalPoints = roundResultRows.reduce((acc, row) => acc + row.points, 0);
    const totalPenalties = roundResultRows.reduce((acc, row) => acc + row.penalties, 0);
    const avgSpi = teamsWithResults > 0 ? roundResultRows.reduce((acc, row) => acc + row.spi, 0) / teamsWithResults : null;
    const avgCpi = teamsWithResults > 0 ? roundResultRows.reduce((acc, row) => acc + row.cpi, 0) / teamsWithResults : null;

    const topTeam = roundResultRows[0] ?? null;
    const highestPenaltyTeam = [...roundResultRows].sort((a, b) => b.penalties - a.penalties)[0] ?? null;
    const highestDebtTeam = [...roundResultRows].sort((a, b) => b.riskDebt - a.riskDebt)[0] ?? null;

    const promotionTeams = roundResultRows.filter((row) => latestPromotionByTeam.has(row.teamId));
    const promotionEvaluated = promotionTeams.filter((row) => {
      const verdict = promotionOutcomeByTeam.get(row.teamId)?.verdict;
      return verdict !== undefined && verdict !== "Pending";
    }).length;
    const promotionPositive = promotionTeams.filter((row) => promotionOutcomeByTeam.get(row.teamId)?.verdict === "Positive").length;

    const talkingPoints: string[] = [];
    if (avgSpi !== null && avgSpi < 1) {
      talkingPoints.push("Schedule pressure detected: ask teams to protect critical path sequencing in next FY.");
    }
    if (avgCpi !== null && avgCpi < 1) {
      talkingPoints.push("Cost pressure detected: tighten package-level cost controls before expansion decisions.");
    }
    if (highestPenaltyTeam && highestPenaltyTeam.penalties > 25) {
      talkingPoints.push(`Penalty hotspot: ${highestPenaltyTeam.teamName} needs immediate compliance and execution reset.`);
    }
    if (highestDebtTeam && highestDebtTeam.riskDebt > 180) {
      talkingPoints.push(`Risk-debt watch: ${highestDebtTeam.teamName} is carrying high debt into upcoming FY.`);
    }
    if (promotionEvaluated > 0 && promotionPositive / promotionEvaluated >= 0.6) {
      talkingPoints.push("Promoted scenarios are working well this FY. Encourage teams to continue evidence-based promotion.");
    }
    if (talkingPoints.length === 0) {
      talkingPoints.push("Round is broadly stable. Keep strategy consistency and avoid abrupt risk-appetite changes.");
    }

    return {
      teamsWithResults,
      totalPoints,
      totalPenalties,
      avgSpi,
      avgCpi,
      topTeam,
      highestPenaltyTeam,
      highestDebtTeam,
      promotionTeams: promotionTeams.length,
      promotionEvaluated,
      promotionPositive,
      talkingPoints,
      rows: roundResultRows,
    };
  }, [selectedSession, roundResultRows, latestPromotionByTeam, promotionOutcomeByTeam]);

  const kpiHeatmapModel = useMemo(() => {
    if (!selectedSession || teamRows.length === 0) return null;

    const maxResultRound = teamResultRows.length > 0 ? Math.max(...teamResultRows.map((row) => row.round_number), 0) : 0;
    const roundLimit = Math.max(selectedSession.round_count ?? 0, maxResultRound, 1);
    const rounds = Array.from({ length: roundLimit }, (_, index) => index + 1);

    const byTeamRound = new Map<string, TeamResultRow>();
    for (const row of teamResultRows) {
      byTeamRound.set(`${row.team_id}:${row.round_number}`, row);
    }

    const rows = teamRows
      .map((team) => {
        const cells = rounds.map((roundNumber) => {
          const result = byTeamRound.get(`${team.id}:${roundNumber}`) ?? null;
          if (!result) {
            return {
              roundNumber,
              status: "not_played" as const,
              achieved: null as boolean | null,
              multiplier: 1,
              basePoints: 0,
              multipliedPoints: 0,
              latePenalty: 0,
              finalPoints: 0,
              boost: 0,
              thresholdLabel: kpiThresholdLabelForTarget(team.kpi_target),
            };
          }

          const detail = toRecord(result.detail);
          const kpi = toRecord(detail?.kpi);

          const achievedFromDetail = typeof kpi?.achieved === "boolean" ? kpi.achieved : null;
          const achieved = achievedFromDetail ?? evaluateKpiAchievedFromTarget(team.kpi_target, result);
          const multiplier = Math.max(1, Math.round(toNumber(kpi?.multiplier, achieved === true ? 4 : 1)));

          const finalPoints = Math.max(0, Math.round(toNumber(kpi?.final_points, result.points_earned ?? 0)));
          const baseFallback = multiplier > 1 ? finalPoints / multiplier : finalPoints;
          const basePoints = Math.max(0, Math.round(toNumber(kpi?.base_points, baseFallback)));
          const multipliedPoints = Math.max(0, Math.round(toNumber(kpi?.multiplied_points, basePoints * multiplier)));
          const latePenalty = Math.max(0, Math.round(toNumber(kpi?.late_points_penalty, 0)));
          const boost = finalPoints - basePoints;
          const thresholdLabel = typeof kpi?.threshold_label === "string" ? kpi.threshold_label : kpiThresholdLabelForTarget(team.kpi_target);
          const status = achieved === true ? "hit" : achieved === false ? "miss" : "unknown";

          return {
            roundNumber,
            status,
            achieved,
            multiplier,
            basePoints,
            multipliedPoints,
            latePenalty,
            finalPoints,
            boost,
            thresholdLabel,
          };
        });

        const playedCells = cells.filter((cell) => cell.status !== "not_played");
        const playedCount = playedCells.length;
        const hitCount = cells.filter((cell) => cell.status === "hit").length;
        const missCount = cells.filter((cell) => cell.status === "miss").length;
        const unknownCount = cells.filter((cell) => cell.status === "unknown").length;
        const hitRate = playedCount > 0 ? (hitCount / playedCount) * 100 : 0;

        const finalPointsTotal = cells.reduce((acc, cell) => acc + cell.finalPoints, 0);
        const netBoost = cells.reduce((acc, cell) => acc + cell.boost, 0);
        const grossBoost = cells.reduce((acc, cell) => acc + Math.max(0, cell.multipliedPoints - cell.basePoints), 0);

        const sparklineValues = playedCells.map((cell) => (cell.status === "hit" ? 1 : cell.status === "miss" ? 0 : 0.45));
        const sparklinePath = buildSparklinePath(sparklineValues);

        const recentWindow = playedCells.slice(-3);
        const recentHits = recentWindow.filter((cell) => cell.status === "hit").length;
        const recentMisses = recentWindow.filter((cell) => cell.status === "miss").length;

        let riskScore = 0;
        if (playedCount > 0 && hitRate < 60) riskScore += 1;
        if (playedCount > 0 && hitRate < 40) riskScore += 1;
        if (recentMisses >= 1) riskScore += 1;
        if (recentMisses >= 2) riskScore += 1;
        if (recentWindow.length >= 2 && recentHits === 0) riskScore += 1;
        if (unknownCount > 0) riskScore += 0.5;

        let riskLevel: "High" | "Watch" | "Stable" | "No Data" = "Stable";
        let riskReason = "KPI discipline is stable for next FY.";

        if (playedCount === 0) {
          riskLevel = "No Data";
          riskReason = "No played FY results yet.";
        } else if (riskScore >= 3) {
          riskLevel = "High";
          riskReason =
            recentWindow.length >= 2 && recentHits === 0
              ? "Recent FYs show consecutive KPI misses."
              : "KPI hit discipline is weak; 4x multiplier risk is high.";
        } else if (riskScore >= 1.5) {
          riskLevel = "Watch";
          riskReason = "KPI performance is mixed; watch next FY execution closely.";
        }

        return {
          teamId: team.id,
          teamName: team.team_name,
          kpiTarget: team.kpi_target,
          totalPoints: team.total_points ?? 0,
          cells,
          playedCount,
          hitCount,
          missCount,
          unknownCount,
          hitRate,
          finalPointsTotal,
          netBoost,
          grossBoost,
          sparklinePath,
          sparklineValues,
          riskLevel,
          riskReason,
          recentHits,
          recentMisses,
        };
      })
      .sort(
        (a, b) =>
          b.hitRate - a.hitRate ||
          b.hitCount - a.hitCount ||
          b.netBoost - a.netBoost ||
          b.totalPoints - a.totalPoints ||
          a.teamName.localeCompare(b.teamName)
      );

    const totalPlayedCells = rows.reduce((acc, row) => acc + row.playedCount, 0);
    const totalHitCells = rows.reduce((acc, row) => acc + row.hitCount, 0);
    const totalMissCells = rows.reduce((acc, row) => acc + row.missCount, 0);
    const overallHitRate = totalPlayedCells > 0 ? (totalHitCells / totalPlayedCells) * 100 : 0;

    const topDisciplineTeam = rows.find((row) => row.playedCount > 0) ?? null;
    const riskPriority = (level: "High" | "Watch" | "Stable" | "No Data") =>
      level === "High" ? 3 : level === "Watch" ? 2 : level === "Stable" ? 1 : 0;

    const mostAtRiskTeam =
      [...rows].sort(
        (a, b) =>
          riskPriority(b.riskLevel) - riskPriority(a.riskLevel) ||
          b.missCount - a.missCount ||
          a.hitRate - b.hitRate ||
          a.teamName.localeCompare(b.teamName)
      )[0] ?? null;

    return {
      rounds,
      rows,
      totalPlayedCells,
      totalHitCells,
      totalMissCells,
      overallHitRate,
      topDisciplineTeam,
      mostAtRiskTeam,
      atRiskHighCount: rows.filter((row) => row.riskLevel === "High").length,
      atRiskWatchCount: rows.filter((row) => row.riskLevel === "Watch").length,
      teamsWithKpiTarget: rows.filter((row) => Boolean(row.kpiTarget)).length,
    };
  }, [selectedSession, teamRows, teamResultRows]);

  async function loadCustomTemplates(currentUserId: string) {
    if (!customTemplatesReady) return;

    const { data, error: templateErr } = await supabase
      .from("news_templates")
      .select("id,name,description,sector_tags,visibility_scope,session_id,template_payload,created_at")
      .eq("created_by", currentUserId)
      .order("created_at", { ascending: false });

    if (templateErr) {
      if (isMissingTableError(templateErr.message)) {
        setCustomTemplatesReady(false);
        setCustomTemplates([]);
        return;
      }

      setError(templateErr.message);
      setCustomTemplates([]);
      return;
    }

    setCustomTemplatesReady(true);
    const rows = (data ?? []) as CustomTemplateRow[];
    setCustomTemplates(rows);

    if (!selectedCustomTemplateId && rows[0]?.id) {
      setSelectedCustomTemplateId(rows[0].id);
    }
  }

  async function loadHostedSessions() {
    setError("");

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;

    if (!user) {
      router.replace("/login");
      return;
    }

    setUserId(user.id);
    await loadCustomTemplates(user.id);

    const { data, error: sessionErr } = await supabase
      .from("sessions")
      .select("id,code,name,status,round_count,current_round,created_at")
      .eq("created_by", user.id)
      .order("created_at", { ascending: false });

    if (sessionErr) {
      setError(sessionErr.message);
      setHostedSessions([]);
      setSelectedSessionId("");
      return;
    }

    const rows = (data ?? []) as HostedSession[];
    setHostedSessions(rows);

    if (rows.length === 0) {
      setSelectedSessionId("");
      setRoundControl(1);
      return;
    }

    const nextSelected = rows.some((row) => row.id === selectedSessionId) ? selectedSessionId : rows[0].id;
    setSelectedSessionId(nextSelected);

    const selected = rows.find((row) => row.id === nextSelected) ?? rows[0];
    const suggestedRound = clampRound((selected.current_round ?? 0) + 1, selected.round_count ?? 1);
    setRoundControl(suggestedRound);
  }

  async function loadTeams(sessionId: string) {
    const { data, error: teamErr } = await supabase
      .from("teams")
      .select("id,session_id,team_name,total_points,kpi_target")
      .eq("session_id", sessionId)
      .order("total_points", { ascending: false });

    if (teamErr) {
      setError(teamErr.message);
      setTeamRows([]);
      return;
    }

    setTeamRows((data ?? []) as TeamRow[]);
  }

  async function loadScenarioPromotions(sessionId: string) {
    setPromotionLoading(true);
    setPromotionError("");

    const { data, error: promotionErr } = await supabase
      .from("scenario_promotions")
      .select("id,user_id,team_id,target_round,source_scenario_name,promotion_payload,applied_at,updated_at,created_at")
      .eq("session_id", sessionId)
      .order("target_round", { ascending: false })
      .order("updated_at", { ascending: false });

    setPromotionLoading(false);

    if (promotionErr) {
      if (isMissingTableError(promotionErr.message)) {
        setPromotionsReady(false);
        setPromotionRows([]);
        return;
      }

      setPromotionsReady(true);
      setPromotionError(promotionErr.message);
      setPromotionRows([]);
      return;
    }

    setPromotionsReady(true);
    setPromotionRows((data ?? []) as ScenarioPromotionRow[]);
  }
  async function loadTeamResults(sessionId: string) {
    setResultLoading(true);
    setResultError("");

    const { data, error: resultErr } = await supabase
      .from("team_results")
      .select("team_id,round_number,points_earned,penalties,schedule_index,cost_index,cash_closing,detail")
      .eq("session_id", sessionId)
      .order("round_number", { ascending: true });

    setResultLoading(false);

    if (resultErr) {
      setResultError(resultErr.message);
      setTeamResultRows([]);
      return;
    }

    setTeamResultRows((data ?? []) as TeamResultRow[]);
  }
  async function loadRoundState(sessionId: string, roundNumber: number) {
    const { data, error: roundErr } = await supabase
      .from("session_rounds")
      .select("status,deadline_at,news_payload,updated_at,closed_at,closed_by")
      .eq("session_id", sessionId)
      .eq("round_number", roundNumber)
      .maybeSingle();

    if (roundErr) {
      if (!isMissingTableError(roundErr.message)) {
        setError(roundErr.message);
      }
      setRoundRow(null);
      return;
    }

    setRoundRow((data as SessionRoundRow | null) ?? null);
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadHostedSessions();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedSession) {
      setTeamRows([]);
      setTeamResultRows([]);
      setPromotionRows([]);
      setPromotionError("");
      setResultError("");
      setRoundRow(null);
      return;
    }

    setRoundControl((prev) => clampRound(prev, selectedSession.round_count));

    (async () => {
      await Promise.all([loadTeams(selectedSession.id), loadScenarioPromotions(selectedSession.id), loadTeamResults(selectedSession.id)]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSessionId]);

  useEffect(() => {
    if (!selectedSession) return;

    (async () => {
      await loadRoundState(selectedSession.id, roundControl);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSessionId, roundControl]);

  useEffect(() => {
    const fromRow = parseConstructionEvents(roundRow?.news_payload);
    const seed = fromRow ?? defaultRoundEvents;
    setNewsDraft(seed.map(toEditableEvent));
  }, [roundRow, defaultRoundEvents]);

  function updateDraftEvent(index: number, patch: Partial<EditableNewsEvent>) {
    setNewsDraft((prev) => prev.map((event, i) => (i === index ? { ...event, ...patch } : event)));
  }

  function addDraftEvent() {
    setNewsDraft((prev) => [...prev, makeBlankDraft(prev.length)]);
  }

  function removeDraftEvent(index: number) {
    setNewsDraft((prev) => prev.filter((_, i) => i !== index));
  }

  function applyTemplate(templateId: string) {
    const templateEvents = buildTemplateEvents(templateId, roundControl);
    if (templateEvents.length === 0) {
      setError("Template not found. Please choose another template.");
      return;
    }

    const template = getRoundNewsTemplate(templateId);
    setNewsDraft(templateEvents.map(toEditableEvent));
    setSelectedTemplateId(templateId);
    setError("");
    setMessage(`Template applied: ${template?.name ?? templateId}`);
  }

  function resetNewsToDeterministicDefault() {
    setNewsDraft(defaultRoundEvents.map(toEditableEvent));
    setError("");
    setMessage("Reset to deterministic default round events.");
  }

  async function saveCurrentAsCustomTemplate() {
    if (!userId) return;
    if (!customTemplatesReady) {
      setError("Custom templates are unavailable until the SQL migration is run.");
      return;
    }

    const trimmedName = customTemplateName.trim();
    if (trimmedName.length < 3) {
      setError("Template name must be at least 3 characters.");
      return;
    }

    const scope = customTemplateScope;
    const sessionIdForScope = scope === "session" ? selectedSession?.id ?? null : null;
    if (scope === "session" && !sessionIdForScope) {
      setError("Select a session before saving a session-shared template.");
      return;
    }

    setSavingCustomTemplate(true);
    setError("");
    setMessage("");

    try {
      const payloadEvents = draftToConstructionEvents(newsDraft);

      const { data, error: insertErr } = await supabase
        .from("news_templates")
        .insert({
          name: trimmedName,
          description: customTemplateDescription.trim(),
          sector_tags: csvToTags(customTemplateSectorCsv),
          visibility_scope: scope,
          session_id: sessionIdForScope,
          template_payload: payloadEvents,
          created_by: userId,
        })
        .select("id")
        .single();

      if (insertErr) throw insertErr;

      await loadCustomTemplates(userId);
      setSelectedCustomTemplateId(data.id);
      setCustomTemplateName("");
      setCustomTemplateDescription("");
      setCustomTemplateSectorCsv("");
      setCustomTemplateScope("private");
      setMessage("Custom template saved.");
    } catch (unknownError: unknown) {
      const messageText = unknownError instanceof Error ? unknownError.message : "Failed to save custom template";
      setError(messageText);
    } finally {
      setSavingCustomTemplate(false);
    }
  }

  function applyCustomTemplate(templateId: string) {
    if (!customTemplatesReady) {
      setError("Custom templates are unavailable until the SQL migration is run.");
      return;
    }

    const template = customTemplates.find((row) => row.id === templateId);
    if (!template) {
      setError("Custom template not found.");
      return;
    }

    const parsed = parseConstructionEvents(template.template_payload);
    if (!parsed || parsed.length === 0) {
      setError("Selected custom template has invalid events.");
      return;
    }

    setNewsDraft(parsed.map(toEditableEvent));
    setSelectedCustomTemplateId(templateId);
    setError("");
    setMessage(`Custom template applied: ${template.name}`);
  }

  async function deleteCustomTemplate(templateId: string) {
    if (!userId || !templateId) return;
    if (!customTemplatesReady) {
      setError("Custom templates are unavailable until the SQL migration is run.");
      return;
    }

    setDeletingCustomTemplateId(templateId);
    setError("");
    setMessage("");

    try {
      const { error: deleteErr } = await supabase
        .from("news_templates")
        .delete()
        .eq("id", templateId)
        .eq("created_by", userId);

      if (deleteErr) throw deleteErr;

      await loadCustomTemplates(userId);
      if (selectedCustomTemplateId === templateId) {
        setSelectedCustomTemplateId("");
      }
      setMessage("Custom template deleted.");
    } catch (unknownError: unknown) {
      const messageText = unknownError instanceof Error ? unknownError.message : "Failed to delete custom template";
      setError(messageText);
    } finally {
      setDeletingCustomTemplateId("");
    }
  }

  async function saveNewsDraft() {
    if (!selectedSession || !userId) return;

    setSavingNewsDraft(true);
    setError("");
    setMessage("");

    try {
      const payloadEvents = draftToConstructionEvents(newsDraft);
      const status = roundRow?.status ?? "closed";
      const deadlineIso = roundRow?.deadline_at ?? new Date(Date.now() + DEFAULT_ROUND_WINDOW_MINUTES * 60_000).toISOString();
      const closedAt = status === "closed" ? roundRow?.closed_at ?? new Date().toISOString() : null;
      const closedBy = status === "closed" ? roundRow?.closed_by ?? userId : null;

      const { error: upErr } = await supabase.from("session_rounds").upsert(
        {
          session_id: selectedSession.id,
          round_number: roundControl,
          status,
          deadline_at: deadlineIso,
          news_payload: payloadEvents,
          created_by: userId,
          closed_at: closedAt,
          closed_by: closedBy,
        },
        { onConflict: "session_id,round_number" }
      );

      if (upErr) throw upErr;

      setMessage(`News draft saved for round ${roundControl}.`);
      await loadRoundState(selectedSession.id, roundControl);
    } catch (unknownError: unknown) {
      const messageText = unknownError instanceof Error ? unknownError.message : "Failed to save news draft";
      setError(messageText);
    } finally {
      setSavingNewsDraft(false);
    }
  }

  async function openRound() {
    if (!selectedSession || !userId) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const payloadEvents = draftToConstructionEvents(newsDraft);
      const deadlineIso = new Date(Date.now() + DEFAULT_ROUND_WINDOW_MINUTES * 60_000).toISOString();

      const { error: roundErr } = await supabase.from("session_rounds").upsert(
        {
          session_id: selectedSession.id,
          round_number: roundControl,
          status: "open",
          deadline_at: deadlineIso,
          news_payload: payloadEvents,
          created_by: userId,
          closed_at: null,
          closed_by: null,
        },
        { onConflict: "session_id,round_number" }
      );
      if (roundErr) throw roundErr;

      const { error: sessionErr } = await supabase
        .from("sessions")
        .update({ status: "in_progress" })
        .eq("id", selectedSession.id)
        .eq("created_by", userId);
      if (sessionErr) throw sessionErr;

      setMessage(`Round ${roundControl} opened with ${DEFAULT_ROUND_WINDOW_MINUTES} minute deadline.`);
      await Promise.all([loadRoundState(selectedSession.id, roundControl), loadHostedSessions()]);
    } catch (unknownError: unknown) {
      const messageText = unknownError instanceof Error ? unknownError.message : "Failed to open round";
      setError(messageText);
    } finally {
      setBusy(false);
    }
  }

  async function closeRound() {
    if (!selectedSession || !userId) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const nowIso = new Date().toISOString();
      const payloadEvents = draftToConstructionEvents(newsDraft);
      const deadlineIso = roundRow?.deadline_at ?? nowIso;

      const { error: roundErr } = await supabase.from("session_rounds").upsert(
        {
          session_id: selectedSession.id,
          round_number: roundControl,
          status: "closed",
          deadline_at: deadlineIso,
          news_payload: payloadEvents,
          created_by: userId,
          closed_at: nowIso,
          closed_by: userId,
        },
        { onConflict: "session_id,round_number" }
      );
      if (roundErr) throw roundErr;

      const updatedRound = Math.max(selectedSession.current_round ?? 0, roundControl);
      const nextStatus = updatedRound >= selectedSession.round_count ? "complete" : "in_progress";

      const { error: sessionErr } = await supabase
        .from("sessions")
        .update({ current_round: updatedRound, status: nextStatus })
        .eq("id", selectedSession.id)
        .eq("created_by", userId);
      if (sessionErr) throw sessionErr;

      setMessage(`Round ${roundControl} closed. Session current round updated to ${updatedRound}.`);
      await Promise.all([
        loadRoundState(selectedSession.id, roundControl),
        loadHostedSessions(),
        loadTeams(selectedSession.id),
        loadTeamResults(selectedSession.id),
      ]);
    } catch (unknownError: unknown) {
      const messageText = unknownError instanceof Error ? unknownError.message : "Failed to close round";
      setError(messageText);
    } finally {
      setBusy(false);
    }
  }

  async function extendDeadline(minutes: number) {
    if (!selectedSession || !userId) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const nowMs = Date.now();
      const currentDeadlineMs = roundRow?.deadline_at ? Date.parse(roundRow.deadline_at) : nowMs;
      const baseMs = Number.isFinite(currentDeadlineMs) ? Math.max(currentDeadlineMs, nowMs) : nowMs;
      const nextDeadlineIso = new Date(baseMs + minutes * 60_000).toISOString();

      const payloadEvents = draftToConstructionEvents(newsDraft);

      const { error: roundErr } = await supabase.from("session_rounds").upsert(
        {
          session_id: selectedSession.id,
          round_number: roundControl,
          status: "open",
          deadline_at: nextDeadlineIso,
          news_payload: payloadEvents,
          created_by: userId,
          closed_at: null,
          closed_by: null,
        },
        { onConflict: "session_id,round_number" }
      );
      if (roundErr) throw roundErr;

      setMessage(`Deadline extended by ${minutes} minutes.`);
      await loadRoundState(selectedSession.id, roundControl);
    } catch (unknownError: unknown) {
      const messageText = unknownError instanceof Error ? unknownError.message : "Failed to extend deadline";
      setError(messageText);
    } finally {
      setBusy(false);
    }
  }

  function exportFacilitatorCsv() {
    if (!selectedSession) {
      setError("Select a hosted session before exporting.");
      return;
    }

    const headers = [
      "Session Code",
      "Session Name",
      "Round",
      "Round Status",
      "Round Deadline",
      "Rank",
      "Team Name",
      "Team ID",
      "Total Points",
      "KPI Target",
      "Promotions In Round",
      "Latest Scenario",
      "Latest Promotion User",
      "Latest Updated At",
      "Latest Applied At",
      "Latest Risk",
      "Latest Governance",
      "Latest Self Perform %",
      "Latest Subcontract %",
      "Latest Focus Cost",
      "Latest Focus Speed",
      "Promotion Verdict",
      "Points Delta (vs prev FY)",
      "Debt Delta (vs prev FY)",
      "SPI Delta (vs prev FY)",
      "CPI Delta (vs prev FY)",
      "Penalties Delta (vs prev FY)",
      "All Scenarios (Round)",
    ];

    const rows = teamRows.map((team, index) => {
      const teamPromotions = promotionsForRound
        .filter((row) => row.team_id === team.id)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

      const latest = latestPromotionByTeam.get(team.id) ?? null;
      const brief = latest ? promotionBrief(latest.promotion_payload) : null;
      const outcome = promotionOutcomeByTeam.get(team.id) ?? null;

      const scenarioNames = Array.from(
        new Set(
          teamPromotions
            .map((row) => (row.source_scenario_name ?? "").trim())
            .filter((name) => name.length > 0)
        )
      );

      return [
        selectedSession.code,
        selectedSession.name ?? "",
        roundControl,
        roundRow?.status ?? "not_opened",
        roundRow?.deadline_at ?? "",
        index + 1,
        team.team_name,
        team.id,
        team.total_points ?? 0,
        team.kpi_target ?? "Not selected",
        teamPromotions.length,
        latest?.source_scenario_name ?? "",
        latest ? `${latest.user_id.slice(0, 8)}...` : "",
        latest?.updated_at ?? "",
        latest?.applied_at ?? "",
        brief?.risk ?? "",
        brief?.governance ?? "",
        brief?.selfPerform ?? "",
        brief?.subcontract ?? "",
        brief?.focusCost ?? "",
        brief?.focusSpeed ?? "",
        outcome?.verdict ?? "",
        outcome?.pointsDelta ?? "",
        outcome?.debtDelta ?? "",
        outcome?.spiDelta ?? "",
        outcome?.cpiDelta ?? "",
        outcome?.penaltiesDelta ?? "",
        scenarioNames.join(" | "),
      ];
    });

    const csv = buildCsv(headers, rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const filename = `bharatinfra_${selectedSession.code}_round_${roundControl}_facilitator_report.csv`;

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setMessage(`CSV exported: ${filename}`);
  }


  function exportRoundReviewPack() {
    if (!selectedSession) {
      setError("Select a hosted session before exporting the review pack.");
      return;
    }

    if (!roundReviewModel || roundReviewModel.rows.length === 0) {
      setError(`No locked results found for FY ${roundControl}. Close the round first, then export.`);
      return;
    }

    const lines: string[] = [];
    lines.push("# Bharat Infra Round Review Pack (5E-12)");
    lines.push("");
    lines.push(`Session: ${selectedSession.name ?? "Untitled"} (${selectedSession.code})`);
    lines.push(`Financial Year: FY ${roundControl}`);
    lines.push(`Round Status: ${roundRow?.status ?? "not_opened"}`);
    lines.push(`Round Deadline: ${formatDateTime(roundRow?.deadline_at ?? null)}`);
    lines.push(
      `Generated At: ${new Date().toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      })}`
    );
    lines.push("");

    lines.push("## Snapshot");
    lines.push(`- Teams with locked results: ${roundReviewModel.teamsWithResults}`);
    lines.push(`- Total round points: ${roundReviewModel.totalPoints}`);
    lines.push(`- Total penalties: ${roundReviewModel.totalPenalties}`);
    lines.push(`- Average SPI: ${roundReviewModel.avgSpi === null ? "N/A" : roundReviewModel.avgSpi.toFixed(2)}`);
    lines.push(`- Average CPI: ${roundReviewModel.avgCpi === null ? "N/A" : roundReviewModel.avgCpi.toFixed(2)}`);
    lines.push(`- Top team: ${roundReviewModel.topTeam ? `${roundReviewModel.topTeam.teamName} (${roundReviewModel.topTeam.points} pts)` : "N/A"}`);
    lines.push(`- Promotion outcomes: ${roundReviewModel.promotionPositive}/${roundReviewModel.promotionEvaluated} positive (evaluated)`);
    lines.push("");

    lines.push("## Team Table");
    lines.push("| Rank | Team | Points | Delta | Penalties | SPI | CPI | Risk Debt |");
    lines.push("|---|---|---:|---:|---:|---:|---:|---:|");
    roundReviewModel.rows.forEach((row, index) => {
      lines.push(
        `| ${index + 1} | ${row.teamName} | ${row.points} | ${formatSigned(row.pointsDelta, 0)} | ${row.penalties} | ${row.spi.toFixed(2)} | ${row.cpi.toFixed(2)} | ${row.riskDebt.toFixed(1)} |`
      );
    });
    lines.push("");

    lines.push("## Promotion Impact");
    if (roundReviewModel.promotionTeams === 0) {
      lines.push("- No promoted scenarios were applied for this FY.");
    } else {
      lines.push("| Team | Verdict | Points Delta | Debt Delta | SPI Delta | CPI Delta | Penalties Delta |");
      lines.push("|---|---|---:|---:|---:|---:|---:|");
      roundReviewModel.rows
        .filter((row) => latestPromotionByTeam.has(row.teamId))
        .forEach((row) => {
          const outcome = promotionOutcomeByTeam.get(row.teamId);
          lines.push(
            `| ${row.teamName} | ${outcome?.verdict ?? "Pending"} | ${formatSigned(outcome?.pointsDelta ?? null, 0)} | ${formatSigned(outcome?.debtDelta ?? null, 1)} | ${formatSigned(outcome?.spiDelta ?? null, 2)} | ${formatSigned(outcome?.cpiDelta ?? null, 2)} | ${formatSigned(outcome?.penaltiesDelta ?? null, 0)} |`
          );
        });
    }
    lines.push("");

    lines.push("## Facilitator Talking Points");
    roundReviewModel.talkingPoints.forEach((point, index) => {
      lines.push(`${index + 1}. ${point}`);
    });
    lines.push("");

    const reportText = lines.join("\n");
    const blob = new Blob([reportText], { type: "text/markdown;charset=utf-8;" });
    const filename = `bharatinfra_${selectedSession.code}_round_${roundControl}_review_pack.md`;

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setMessage(`Round review pack exported: ${filename}`);
  }

  function exportKpiHeatmapCsv() {
    if (!selectedSession) {
      setError("Select a hosted session before exporting KPI analytics.");
      return;
    }

    if (!kpiHeatmapModel || kpiHeatmapModel.rows.length === 0) {
      setError("No KPI heatmap data available for export.");
      return;
    }

    const headers = [
      "Session Code",
      "Session Name",
      "FY",
      "Team",
      "KPI Target",
      "Cell Status",
      "KPI Achieved",
      "Multiplier",
      "Base Points",
      "Multiplied Points",
      "Late Penalty",
      "Final Points",
      "Boost (Final-Base)",
      "Threshold",
      "Team Hit Rate %",
      "Team Hits",
      "Team Misses",
    ];

    const rows: Array<Array<unknown>> = [];
    kpiHeatmapModel.rows.forEach((teamRow) => {
      teamRow.cells.forEach((cell) => {
        rows.push([
          selectedSession.code,
          selectedSession.name ?? "",
          `FY ${cell.roundNumber}`,
          teamRow.teamName,
          teamRow.kpiTarget ?? "Not selected",
          cell.status,
          cell.achieved === null ? "" : cell.achieved ? "Yes" : "No",
          cell.multiplier,
          cell.basePoints,
          cell.multipliedPoints,
          cell.latePenalty,
          cell.finalPoints,
          cell.boost,
          cell.thresholdLabel,
          Number(teamRow.hitRate.toFixed(1)),
          teamRow.hitCount,
          teamRow.missCount,
        ]);
      });
    });

    const csv = buildCsv(headers, rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const filename = `bharatinfra_${selectedSession.code}_kpi_heatmap.csv`;

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setMessage(`KPI heatmap CSV exported: ${filename}`);
  }

  return (
    <RequireAuth>
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Facilitator Console</h1>
            <p className="mt-1 text-sm text-slate-600">
              Host-level control center for opening rounds, deadlines, news editing, and leaderboard tracking.
            </p>
          </div>
          <Link href="/dashboard" className="text-sm font-medium text-slate-700 underline">
            Dashboard
          </Link>
        </div>

        {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
        {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}

        {loading ? (
          <Card>
            <CardBody>
              <p className="text-sm text-slate-600">Loading hosted sessions...</p>
            </CardBody>
          </Card>
        ) : hostedSessions.length === 0 ? (
          <Card>
            <CardHeader title="No hosted sessions yet" subtitle="Create one from Dashboard to unlock facilitator tools." />
            <CardBody>
              <Link href="/dashboard">
                <Button>Create Session</Button>
              </Link>
            </CardBody>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
            <Card className="h-fit">
              <CardHeader title="Your Hosted Sessions" subtitle="Choose a session to control rounds." />
              <CardBody className="space-y-3">
                {hostedSessions.map((session) => {
                  const isActive = session.id === selectedSessionId;
                  const nextRound = clampRound((session.current_round ?? 0) + 1, session.round_count ?? 1);

  return (
                    <button
                      type="button"
                      key={session.id}
                      onClick={() => {
                        setSelectedSessionId(session.id);
                        setRoundControl(nextRound);
                      }}
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        isActive
                          ? "border-teal-300 bg-teal-50 shadow-sm"
                          : "border-slate-200 bg-white hover:border-teal-200"
                      }`}
                    >
                      <div className="font-semibold text-slate-900">{session.name ?? "Untitled session"}</div>
                      <div className="mt-1 text-xs text-slate-600">
                        Code: <span className="font-mono">{session.code}</span>
                      </div>
                      <div className="mt-1 text-xs text-slate-600">
                        Status: {session.status} | Round {session.current_round}/{session.round_count}
                      </div>
                    </button>
                  );
                })}
              </CardBody>
            </Card>

            {selectedSession ? (
              <div className="space-y-5">
                <Card>
                  <CardHeader title={selectedSession.name ?? "Session"} subtitle={`Session code: ${selectedSession.code}`} />
                  <CardBody className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="text-slate-500">Session status</div>
                      <div className="mt-1 font-semibold text-slate-900">{selectedSession.status}</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="text-slate-500">Current round</div>
                      <div className="mt-1 font-semibold text-slate-900">
                        {selectedSession.current_round}/{selectedSession.round_count}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="text-slate-500">Teams joined</div>
                      <div className="mt-1 font-semibold text-slate-900">{teamRows.length}</div>
                    </div>
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader title="Round Control" subtitle="Open, close, and extend deadlines centrally." />
                  <CardBody className="space-y-4">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <label className="text-sm">
                        Control round number
                        <input
                          type="number"
                          min={1}
                          max={selectedSession.round_count}
                          value={roundControl}
                          onChange={(e) => setRoundControl(clampRound(Number(e.target.value), selectedSession.round_count))}
                          className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                        />
                      </label>

                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                        <div className="text-slate-500">Round state</div>
                        <div className="mt-1 font-semibold text-slate-900">{roundRow?.status ?? "not opened yet"}</div>
                        <div className="mt-1 text-xs text-slate-600">Deadline: {formatDateTime(roundRow?.deadline_at ?? null)}</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button onClick={openRound} disabled={busy || selectedSession.status === "complete"}>
                        {busy ? "Working..." : `Open Round ${roundControl}`}
                      </Button>
                      <Button variant="secondary" onClick={closeRound} disabled={busy || selectedSession.status === "complete"}>
                        {busy ? "Working..." : `Close Round ${roundControl}`}
                      </Button>
                      <Button variant="secondary" onClick={() => extendDeadline(10)} disabled={busy || selectedSession.status === "complete"}>
                        +10 min
                      </Button>
                    </div>

                    <div className="flex flex-wrap gap-2 text-sm">
                      <Link href={`/sessions/${selectedSession.id}`}>
                        <Button variant="secondary">Open Session Hub</Button>
                      </Link>
                      <Link href={`/sessions/${selectedSession.id}/round/${roundControl}`}>
                        <Button variant="secondary">Open Decisions</Button>
                      </Link>
                      <Link href={`/sessions/${selectedSession.id}/round/${roundControl}/news`}>
                        <Button variant="secondary">Open News Desk</Button>
                      </Link>
                      <Link href={`/sessions/${selectedSession.id}/round/${roundControl}/results`}>
                        <Button variant="secondary">Open Results</Button>
                      </Link>
                    </div>
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader
                    title="Round Template Library"
                    subtitle="Apply curated sector packs, then fine-tune in News Editor."
                  />
                  <CardBody className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                      <label className="text-sm">
                        Choose template
                        <select
                          className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                          value={selectedTemplateId}
                          onChange={(e) => setSelectedTemplateId(e.target.value)}
                        >
                          {ROUND_NEWS_TEMPLATES.map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <div className="flex flex-wrap items-end gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => applyTemplate(selectedTemplateId)}
                          disabled={busy || savingNewsDraft || !selectedTemplateId}
                        >
                          Apply Template
                        </Button>
                        <Button variant="ghost" onClick={resetNewsToDeterministicDefault} disabled={busy || savingNewsDraft}>
                          Reset Default
                        </Button>
                      </div>
                    </div>

                    {selectedTemplate ? (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                        <div className="font-semibold text-slate-900">{selectedTemplate.name}</div>
                        <div className="mt-1 text-slate-600">{selectedTemplate.description}</div>
                        <div className="mt-1 text-xs text-slate-500">Sectors: {selectedTemplate.sectors.join(", ")}</div>
                      </div>
                    ) : null}

                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {ROUND_NEWS_TEMPLATES.map((template) => (
                        <button
                          type="button"
                          key={template.id}
                          onClick={() => applyTemplate(template.id)}
                          className={
                            "rounded-xl border p-3 text-left transition " +
                            (selectedTemplateId === template.id
                              ? "border-teal-300 bg-teal-50"
                              : "border-slate-200 bg-white hover:border-teal-200")
                          }
                        >
                          <div className="text-sm font-semibold text-slate-900">{template.name}</div>
                          <div className="mt-1 text-xs text-slate-600 line-clamp-2">{template.description}</div>
                          <div className="mt-2 text-[11px] text-slate-500">{template.sectors.join(" | ")}</div>
                        </button>
                      ))}
                    </div>
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader
                    title="My Custom Templates"
                    subtitle="Save and reuse your own template library across sessions."
                  />
                  <CardBody className="space-y-3">
                    {!customTemplatesReady ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                        Custom templates table not found. Run migration <code>20260312_news_templates_bootstrap_hotfix.sql</code> in Supabase.
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                          <label className="text-sm">
                            Template name
                            <input
                              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                              value={customTemplateName}
                              onChange={(e) => setCustomTemplateName(e.target.value)}
                              placeholder="Example: Metro audit pressure"
                            />
                          </label>
                          <label className="text-sm">
                            Sectors (comma separated)
                            <input
                              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                              value={customTemplateSectorCsv}
                              onChange={(e) => setCustomTemplateSectorCsv(e.target.value)}
                              placeholder="metro, airports, compliance"
                            />
                          </label>
                          <label className="text-sm">
                            Sharing scope
                            <select
                              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                              value={customTemplateScope}
                              onChange={(e) => setCustomTemplateScope(e.target.value as "private" | "session")}
                            >
                              <option value="private">Private (only me)</option>
                              <option value="session">Session Shared</option>
                            </select>
                          </label>
                        </div>

                        <label className="text-sm block">
                          Description
                          <textarea
                            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                            rows={2}
                            value={customTemplateDescription}
                            onChange={(e) => setCustomTemplateDescription(e.target.value)}
                            placeholder="What this template simulates"
                          />
                        </label>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            onClick={saveCurrentAsCustomTemplate}
                            disabled={savingCustomTemplate || busy}
                          >
                            {savingCustomTemplate ? "Saving..." : "Save Current Draft as Template"}
                          </Button>
                        </div>

                        {customTemplates.length > 0 ? (
                          <>
                            <label className="text-sm block">
                              Saved templates
                              <select
                                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                                value={selectedCustomTemplateId}
                                onChange={(e) => setSelectedCustomTemplateId(e.target.value)}
                              >
                                <option value="">Select custom template</option>
                                {customTemplates.map((template) => (
                                  <option key={template.id} value={template.id}>
                                    {template.name}
                                  </option>
                                ))}
                              </select>
                            </label>

                            {selectedCustomTemplate ? (
                              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                                <div className="font-semibold text-slate-900">{selectedCustomTemplate.name}</div>
                                <div className="mt-1">{selectedCustomTemplate.description || "No description."}</div>
                                <div className="mt-1 text-slate-500">
                                  Sectors: {(selectedCustomTemplate.sector_tags ?? []).join(", ") || "general"}
                                </div>
                                <div className="mt-1 text-slate-500">Scope: {selectedCustomTemplate.visibility_scope === "session" ? "Session Shared" : "Private"}</div>
                              </div>
                            ) : null}

                            <div className="flex flex-wrap gap-2">
                              <Button
                                variant="secondary"
                                onClick={() => applyCustomTemplate(selectedCustomTemplateId)}
                                disabled={!selectedCustomTemplateId || busy}
                              >
                                Apply Custom Template
                              </Button>
                              <Button
                                variant="ghost"
                                onClick={() => deleteCustomTemplate(selectedCustomTemplateId)}
                                disabled={
                                  !selectedCustomTemplateId ||
                                  deletingCustomTemplateId === selectedCustomTemplateId ||
                                  busy
                                }
                              >
                                {deletingCustomTemplateId === selectedCustomTemplateId ? "Deleting..." : "Delete"}
                              </Button>
                            </div>
                          </>
                        ) : (
                          <div className="text-xs text-slate-500">No custom templates yet.</div>
                        )}
                      </>
                    )}
                  </CardBody>
                </Card>
                <Card>
                  <CardHeader
                    title="News Editor"
                    subtitle="Set event title, image, severity, tags, and impact values before opening the round."
                    right={
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={addDraftEvent} disabled={savingNewsDraft || busy}>
                          + Add Event
                        </Button>
                        <Button onClick={saveNewsDraft} disabled={savingNewsDraft || busy}>
                          {savingNewsDraft ? "Saving..." : "Save News Draft"}
                        </Button>
                      </div>
                    }
                  />
                  <CardBody className="space-y-4">
                    {newsDraft.map((event, index) => (
                      <div key={`${event.id}-${index}`} className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm font-semibold text-slate-900">Event {index + 1}</div>
                          <Button variant="ghost" onClick={() => removeDraftEvent(index)} disabled={newsDraft.length <= 1 || savingNewsDraft || busy}>
                            Remove
                          </Button>
                        </div>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <label className="text-sm">
                            Event title
                            <input
                              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                              value={event.title}
                              onChange={(e) => updateDraftEvent(index, { title: e.target.value })}
                            />
                          </label>

                          <label className="text-sm">
                            Image URL (optional)
                            <input
                              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                              placeholder="https://..."
                              value={event.image_url}
                              onChange={(e) => updateDraftEvent(index, { image_url: e.target.value })}
                            />
                          </label>
                        </div>

                        <label className="text-sm block">
                          Description
                          <textarea
                            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                            rows={3}
                            value={event.description}
                            onChange={(e) => updateDraftEvent(index, { description: e.target.value })}
                          />
                        </label>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <label className="text-sm">
                            Tags (comma separated)
                            <input
                              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                              value={event.tags_csv}
                              onChange={(e) => updateDraftEvent(index, { tags_csv: e.target.value })}
                            />
                          </label>

                          <label className="text-sm">
                            Severity
                            <select
                              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                              value={event.severity}
                              onChange={(e) =>
                                updateDraftEvent(index, {
                                  severity: clamp(asNumber(e.target.value, 2), 1, 3) as 1 | 2 | 3,
                                })
                              }
                            >
                              <option value={1}>1 - Mild</option>
                              <option value={2}>2 - Moderate</option>
                              <option value={3}>3 - Severe</option>
                            </select>
                          </label>
                        </div>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                          <label className="text-sm">
                            Schedule impact
                            <input
                              type="number"
                              step="0.01"
                              min={-0.2}
                              max={0.2}
                              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                              value={event.impact_schedule}
                              onChange={(e) => updateDraftEvent(index, { impact_schedule: asNumber(e.target.value, 0) })}
                            />
                          </label>

                          <label className="text-sm">
                            Cost impact
                            <input
                              type="number"
                              step="0.01"
                              min={-0.2}
                              max={0.2}
                              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                              value={event.impact_cost}
                              onChange={(e) => updateDraftEvent(index, { impact_cost: asNumber(e.target.value, 0) })}
                            />
                          </label>

                          <label className="text-sm">
                            Cash impact (INR)
                            <input
                              type="number"
                              step="1000"
                              min={-500000}
                              max={500000}
                              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                              value={event.impact_cash}
                              onChange={(e) => updateDraftEvent(index, { impact_cash: asNumber(e.target.value, 0) })}
                            />
                          </label>
                          <label className="text-sm">
                            Quality impact
                            <input
                              type="number"
                              step="1"
                              min={-20}
                              max={20}
                              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                              value={event.impact_quality}
                              onChange={(e) => updateDraftEvent(index, { impact_quality: asNumber(e.target.value, 0) })}
                            />
                          </label>

                          <label className="text-sm">
                            Safety impact
                            <input
                              type="number"
                              step="1"
                              min={-20}
                              max={20}
                              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                              value={event.impact_safety}
                              onChange={(e) => updateDraftEvent(index, { impact_safety: asNumber(e.target.value, 0) })}
                            />
                          </label>

                          <label className="text-sm">
                            Stakeholder impact
                            <input
                              type="number"
                              step="1"
                              min={-20}
                              max={20}
                              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                              value={event.impact_stakeholder}
                              onChange={(e) => updateDraftEvent(index, { impact_stakeholder: asNumber(e.target.value, 0) })}
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader title="Round News Preview" subtitle="What teams will see in the round news desk." />
                  <CardBody className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {effectiveDraftEvents.length === 0 ? (
                      <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
                        No events yet. Add events and save news draft.
                      </div>
                    ) : (
                      effectiveDraftEvents.map((event) => (
                        <div key={event.id} className="rounded-xl border border-slate-200 bg-white p-3">
                          <img src={getNewsImageUrl(event)} alt={event.title} className="h-28 w-full rounded-md object-cover" loading="lazy" />
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <div className="text-sm font-semibold text-slate-900">{event.title}</div>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                event.severity >= 3
                                  ? "bg-rose-100 text-rose-700"
                                  : event.severity === 2
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-emerald-100 text-emerald-700"
                              }`}
                            >
                              Severity {event.severity}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-slate-600">{event.description}</div>
                          <div className="mt-1 text-[11px] text-slate-500">Tags: {event.tags.join(", ")}</div>
                        </div>
                      ))
                    )}
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader title="Applied Promotions (5E-8)" subtitle="Track which teams promoted scenarios into upcoming FY decision drafts." />
                  <CardBody className="space-y-3 text-sm">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-slate-500">Total promotions</div>
                        <div className="mt-1 font-semibold text-slate-900">{promotionRows.length}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-slate-500">For round {roundControl}</div>
                        <div className="mt-1 font-semibold text-slate-900">{promotionsForRound.length}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-slate-500">Applied in round {roundControl}</div>
                        <div className="mt-1 font-semibold text-slate-900">{promotionsAppliedCount}</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          if (!selectedSession) return;
                          void loadScenarioPromotions(selectedSession.id);
                        }}
                        disabled={promotionLoading || !selectedSession}
                      >
                        {promotionLoading ? "Refreshing..." : "Refresh Promotions"}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={exportFacilitatorCsv}
                        disabled={!selectedSession || teamRows.length === 0}
                      >
                        Export CSV
                      </Button>
                      {promotionError ? (
                        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-700">
                          {promotionError}
                        </div>
                      ) : null}
                    </div>

                    {!promotionsReady ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                        Scenario promotions table not found. Run migration <code>20260314_scenario_promotions_5e7.sql</code> and <code>20260314_scenario_promotions_host_policy_5e8.sql</code>.
                      </div>
                    ) : promotionRows.length === 0 ? (
                      <div className="rounded-xl border border-slate-200 bg-white p-3 text-slate-600">
                        No scenario promotions captured yet for this session.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {promotionRows.map((row) => {
                          const teamName = teamNameById.get(row.team_id) ?? `Team ${row.team_id.slice(0, 8)}`;
                          const brief = promotionBrief(row.promotion_payload);
                          const applied = Boolean(row.applied_at);

  return (
                            <div key={row.id} className="rounded-xl border border-slate-200 bg-white p-3">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <div className="font-semibold text-slate-900">{row.source_scenario_name ?? "Unnamed scenario"}</div>
                                  <div className="text-xs text-slate-500">{teamName} | User {row.user_id.slice(0, 8)}...</div>
                                  <div className="text-xs text-slate-400">Updated {formatDateTime(row.updated_at)}</div>
                                </div>
                                <div className="flex items-center gap-2 text-xs">
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">FY {row.target_round}</span>
                                  <span className={`rounded-full px-2 py-0.5 ${applied ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                                    {applied ? "Applied" : "Pending"}
                                  </span>
                                </div>
                              </div>
                              <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
                                <div className="rounded-md bg-slate-50 px-2 py-1">Risk <b>{brief.risk}</b></div>
                                <div className="rounded-md bg-slate-50 px-2 py-1">Governance <b>{brief.governance}</b></div>
                                <div className="rounded-md bg-slate-50 px-2 py-1">Self perform <b>{brief.selfPerform}%</b></div>
                                <div className="rounded-md bg-slate-50 px-2 py-1">Subcontract <b>{brief.subcontract}%</b></div>
                                <div className="rounded-md bg-slate-50 px-2 py-1">Focus cost <b>{brief.focusCost}</b></div>
                                <div className="rounded-md bg-slate-50 px-2 py-1">Focus speed <b>{brief.focusSpeed}</b></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader title="Promotion Outcome Backtest (5E-11)" subtitle="Did promoted scenarios improve actual FY results?" />
                  <CardBody className="space-y-3 text-sm">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-slate-500">Promoted teams (FY {roundControl})</div>
                        <div className="mt-1 font-semibold text-slate-900">{promotionOutcomeSummary.teamsPromoted}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-slate-500">Evaluated</div>
                        <div className="mt-1 font-semibold text-slate-900">{promotionOutcomeSummary.evaluated}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-slate-500">Positive / Mixed / Negative</div>
                        <div className="mt-1 font-semibold text-slate-900">
                          {promotionOutcomeSummary.positive} / {promotionOutcomeSummary.mixed} / {promotionOutcomeSummary.negative}
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-slate-500">Pending result rows</div>
                        <div className="mt-1 font-semibold text-slate-900">{promotionOutcomeSummary.pending}</div>
                      </div>
                    </div>

                    {resultLoading ? (
                      <div className="rounded-xl border border-slate-200 bg-white p-3 text-slate-600">Loading result outcomes...</div>
                    ) : resultError ? (
                      <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{resultError}</div>
                    ) : promotionsForRound.length === 0 ? (
                      <div className="rounded-xl border border-slate-200 bg-white p-3 text-slate-600">
                        No promoted scenarios found for FY {roundControl}.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {teamRows
                          .filter((team) => latestPromotionByTeam.has(team.id))
                          .map((team) => {
                            const promotion = latestPromotionByTeam.get(team.id);
                            const outcome = promotionOutcomeByTeam.get(team.id);
                            if (!promotion || !outcome) return null;

                            const verdictClass =
                              outcome.verdict === "Positive"
                                ? "bg-emerald-100 text-emerald-700"
                                : outcome.verdict === "Negative"
                                  ? "bg-rose-100 text-rose-700"
                                  : outcome.verdict === "Mixed"
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-slate-100 text-slate-700";

  return (
                              <div key={`outcome-${team.id}`} className="rounded-xl border border-slate-200 bg-white p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <div className="font-semibold text-slate-900">{team.team_name}</div>
                                    <div className="text-xs text-slate-500">{promotion.source_scenario_name ?? "Unnamed scenario"}</div>
                                  </div>
                                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${verdictClass}`}>{outcome.verdict}</span>
                                </div>

                                <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                                  <div className="rounded-md bg-slate-50 px-2 py-1">
                                    Points <b className={outcome.pointsDelta !== null && outcome.pointsDelta >= 0 ? "text-emerald-700" : "text-rose-700"}>{formatSigned(outcome.pointsDelta, 0)}</b>
                                  </div>
                                  <div className="rounded-md bg-slate-50 px-2 py-1">
                                    Debt <b className={outcome.debtDelta !== null && outcome.debtDelta <= 0 ? "text-emerald-700" : "text-rose-700"}>{formatSigned(outcome.debtDelta, 1)}</b>
                                  </div>
                                  <div className="rounded-md bg-slate-50 px-2 py-1">
                                    SPI <b className={outcome.spiDelta !== null && outcome.spiDelta >= 0 ? "text-emerald-700" : "text-rose-700"}>{formatSigned(outcome.spiDelta, 2)}</b>
                                  </div>
                                  <div className="rounded-md bg-slate-50 px-2 py-1">
                                    CPI <b className={outcome.cpiDelta !== null && outcome.cpiDelta >= 0 ? "text-emerald-700" : "text-rose-700"}>{formatSigned(outcome.cpiDelta, 2)}</b>
                                  </div>
                                  <div className="rounded-md bg-slate-50 px-2 py-1">
                                    Penalties <b className={outcome.penaltiesDelta !== null && outcome.penaltiesDelta <= 0 ? "text-emerald-700" : "text-rose-700"}>{formatSigned(outcome.penaltiesDelta, 0)}</b>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </CardBody>
                </Card>
                <Card>
                  <CardHeader
                    title="Round Review Pack (5E-12)"
                    subtitle="One-click facilitator summary for FY outcomes, risk hotspots, and coaching points."
                  />
                  <CardBody className="space-y-3 text-sm">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          if (!selectedSession) return;
                          void Promise.all([
                            loadRoundState(selectedSession.id, roundControl),
                            loadTeams(selectedSession.id),
                            loadTeamResults(selectedSession.id),
                            loadScenarioPromotions(selectedSession.id),
                          ]);
                        }}
                        disabled={busy || !selectedSession}
                      >
                        Refresh FY Data
                      </Button>
                      <Button
                        onClick={exportRoundReviewPack}
                        disabled={!roundReviewModel || roundReviewModel.rows.length === 0}
                      >
                        Export Review Pack
                      </Button>
                    </div>

                    {!roundReviewModel ? (
                      <div className="rounded-xl border border-slate-200 bg-white p-3 text-slate-600">
                        Select a hosted session to generate FY review insights.
                      </div>
                    ) : roundReviewModel.rows.length === 0 ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800">
                        No locked team results found for FY {roundControl}. Close the round first, then export.
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                          <div className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="text-slate-500">Teams with Results</div>
                            <div className="mt-1 text-lg font-semibold text-slate-900">{roundReviewModel.teamsWithResults}</div>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="text-slate-500">Total FY Points</div>
                            <div className="mt-1 text-lg font-semibold text-slate-900">{formatInr(roundReviewModel.totalPoints)}</div>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="text-slate-500">Total Penalties</div>
                            <div className="mt-1 text-lg font-semibold text-slate-900">{formatInr(roundReviewModel.totalPenalties)}</div>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="text-slate-500">Average SPI</div>
                            <div className="mt-1 text-lg font-semibold text-slate-900">
                              {roundReviewModel.avgSpi === null ? "N/A" : roundReviewModel.avgSpi.toFixed(2)}
                            </div>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="text-slate-500">Average CPI</div>
                            <div className="mt-1 text-lg font-semibold text-slate-900">
                              {roundReviewModel.avgCpi === null ? "N/A" : roundReviewModel.avgCpi.toFixed(2)}
                            </div>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="text-slate-500">Top Team (FY)</div>
                            <div className="mt-1 text-lg font-semibold text-slate-900">
                              {roundReviewModel.topTeam
                                ? `${roundReviewModel.topTeam.teamName} (${roundReviewModel.topTeam.points})`
                                : "N/A"}
                            </div>
                          </div>
                        </div>

                        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                          <table className="min-w-full text-left text-xs">
                            <thead className="bg-slate-100 text-slate-600">
                              <tr>
                                <th className="px-3 py-2 font-semibold">Rank</th>
                                <th className="px-3 py-2 font-semibold">Team</th>
                                <th className="px-3 py-2 font-semibold text-right">Points</th>
                                <th className="px-3 py-2 font-semibold text-right">Delta</th>
                                <th className="px-3 py-2 font-semibold text-right">Penalties</th>
                                <th className="px-3 py-2 font-semibold text-right">SPI</th>
                                <th className="px-3 py-2 font-semibold text-right">CPI</th>
                                <th className="px-3 py-2 font-semibold text-right">Risk Debt</th>
                              </tr>
                            </thead>
                            <tbody>
                              {roundReviewModel.rows.map((row, index) => (
                                <tr key={`review-row-${row.teamId}`} className="border-t border-slate-100">
                                  <td className="px-3 py-2 text-slate-700">#{index + 1}</td>
                                  <td className="px-3 py-2 font-medium text-slate-900">{row.teamName}</td>
                                  <td className="px-3 py-2 text-right text-slate-800">{row.points}</td>
                                  <td
                                    className={`px-3 py-2 text-right ${
                                      row.pointsDelta !== null && row.pointsDelta >= 0 ? "text-emerald-700" : "text-rose-700"
                                    }`}
                                  >
                                    {formatSigned(row.pointsDelta, 0)}
                                  </td>
                                  <td className="px-3 py-2 text-right text-slate-800">{row.penalties}</td>
                                  <td className="px-3 py-2 text-right text-slate-800">{row.spi.toFixed(2)}</td>
                                  <td className="px-3 py-2 text-right text-slate-800">{row.cpi.toFixed(2)}</td>
                                  <td className="px-3 py-2 text-right text-slate-800">{row.riskDebt.toFixed(1)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white p-3">
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Facilitator Talking Points</div>
                          <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700">
                            {roundReviewModel.talkingPoints.map((point, index) => (
                              <li key={`talking-point-${index}`}>{point}</li>
                            ))}
                          </ul>
                        </div>
                      </>
                    )}
                  </CardBody>
                </Card>
                <Card>
                  <CardHeader
                    title="KPI Leaderboard & Hit Heatmap (5E-14)"
                    subtitle="Track 4x KPI strike discipline by team and financial year."
                  />
                  <CardBody className="space-y-3 text-sm">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          if (!selectedSession) return;
                          void Promise.all([
                            loadTeams(selectedSession.id),
                            loadTeamResults(selectedSession.id),
                          ]);
                        }}
                        disabled={busy || !selectedSession}
                      >
                        Refresh KPI Data
                      </Button>
                      <Button onClick={exportKpiHeatmapCsv} disabled={!kpiHeatmapModel || kpiHeatmapModel.rows.length === 0}>
                        Export KPI Heatmap CSV
                      </Button>
                    </div>

                    {!kpiHeatmapModel ? (
                      <div className="rounded-xl border border-slate-200 bg-white p-3 text-slate-600">
                        Select a hosted session to load KPI leaderboard analytics.
                      </div>
                    ) : kpiHeatmapModel.rows.length === 0 ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800">
                        No team rows found for KPI analysis.
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
                          <div className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="text-slate-500">Teams with KPI target</div>
                            <div className="mt-1 text-lg font-semibold text-slate-900">{kpiHeatmapModel.teamsWithKpiTarget}</div>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="text-slate-500">Total KPI hits</div>
                            <div className="mt-1 text-lg font-semibold text-emerald-700">{kpiHeatmapModel.totalHitCells}</div>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="text-slate-500">Total KPI misses</div>
                            <div className="mt-1 text-lg font-semibold text-rose-700">{kpiHeatmapModel.totalMissCells}</div>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="text-slate-500">Overall KPI hit rate</div>
                            <div className="mt-1 text-lg font-semibold text-slate-900">
                              {kpiHeatmapModel.totalPlayedCells > 0 ? `${kpiHeatmapModel.overallHitRate.toFixed(1)}%` : "N/A"}
                            </div>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="text-slate-500">Top KPI discipline</div>
                            <div className="mt-1 text-lg font-semibold text-slate-900">
                              {kpiHeatmapModel.topDisciplineTeam ? kpiHeatmapModel.topDisciplineTeam.teamName : "N/A"}
                            </div>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="text-slate-500">Next FY risk (H / W)</div>
                            <div className="mt-1 text-lg font-semibold text-slate-900">
                              {kpiHeatmapModel.atRiskHighCount} / {kpiHeatmapModel.atRiskWatchCount}
                            </div>
                          </div>
                        </div>
                        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                          <table className="min-w-full text-left text-xs">
                            <thead className="bg-slate-100 text-slate-600">
                              <tr>
                                <th className="px-3 py-2 font-semibold">Rank</th>
                                <th className="px-3 py-2 font-semibold">Team</th>
                                <th className="px-3 py-2 font-semibold text-right">KPI Hit Rate</th>
                                <th className="px-3 py-2 font-semibold text-right">Hits / Played</th>
                                <th className="px-3 py-2 font-semibold text-center">KPI Trend</th>
                                <th className="px-3 py-2 font-semibold text-center">Next FY Risk</th>
                                <th className="px-3 py-2 font-semibold text-right">Net KPI Boost</th>
                                <th className="px-3 py-2 font-semibold text-right">Total Points</th>
                              </tr>
                            </thead>
                            <tbody>
                              {kpiHeatmapModel.rows.map((row, index) => (
                                <tr key={`kpi-leader-${row.teamId}`} className="border-t border-slate-100">
                                  <td className="px-3 py-2 text-slate-700">#{index + 1}</td>
                                  <td className="px-3 py-2">
                                    <div className="font-medium text-slate-900">{row.teamName}</div>
                                    <div className="text-[11px] text-slate-500">KPI: {row.kpiTarget ?? "Not selected"}</div>
                                  </td>
                                  <td className="px-3 py-2 text-right font-semibold text-slate-900">
                                    {row.playedCount > 0 ? `${row.hitRate.toFixed(1)}%` : "N/A"}
                                  </td>
                                  <td className="px-3 py-2 text-right text-slate-800">{row.hitCount} / {row.playedCount}</td>
                                  <td className="px-3 py-2">
                                    {row.sparklinePath ? (
                                      <svg viewBox="0 0 84 24" className="h-6 w-24">
                                        <path d={row.sparklinePath} fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                      </svg>
                                    ) : (
                                      <span className="text-slate-400">-</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                        row.riskLevel === "High"
                                          ? "bg-rose-100 text-rose-700"
                                          : row.riskLevel === "Watch"
                                            ? "bg-amber-100 text-amber-700"
                                            : row.riskLevel === "Stable"
                                              ? "bg-emerald-100 text-emerald-700"
                                              : "bg-slate-100 text-slate-600"
                                      }`}
                                      title={row.riskReason}
                                    >
                                      {row.riskLevel}
                                    </span>
                                  </td>
                                  <td className={`px-3 py-2 text-right font-semibold ${row.netBoost >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                                    {row.netBoost >= 0 ? `+${row.netBoost}` : row.netBoost}
                                  </td>
                                  <td className="px-3 py-2 text-right text-slate-800">{row.totalPoints}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-2">
                          <table className="min-w-full text-left text-[11px]">
                            <thead>
                              <tr className="text-slate-500">
                                <th className="px-2 py-2 font-semibold">Team</th>
                                {kpiHeatmapModel.rounds.map((roundNumber) => (
                                  <th key={`kpi-h-round-${roundNumber}`} className="px-2 py-2 text-center font-semibold">FY {roundNumber}</th>
                                ))}
                                <th className="px-2 py-2 text-right font-semibold">Hit Rate</th>`r`n                                <th className="px-2 py-2 text-center font-semibold">Next FY Risk</th>
                              </tr>
                            </thead>
                            <tbody>
                              {kpiHeatmapModel.rows.map((row) => (
                                <tr key={`kpi-heat-${row.teamId}`} className="border-t border-slate-100">
                                  <td className="px-2 py-2 font-medium text-slate-900">{row.teamName}</td>
                                  {row.cells.map((cell) => {
                                    const cellClass =
                                      cell.status === "hit"
                                        ? "bg-emerald-100 text-emerald-700"
                                        : cell.status === "miss"
                                          ? "bg-rose-100 text-rose-700"
                                          : cell.status === "unknown"
                                            ? "bg-amber-100 text-amber-700"
                                            : "bg-slate-100 text-slate-500";

                                    const cellLabel =
                                      cell.status === "hit"
                                        ? "4x"
                                        : cell.status === "miss"
                                          ? "x1"
                                          : cell.status === "unknown"
                                            ? "?"
                                            : "-";

                                    const title =
                                      cell.status === "not_played"
                                        ? `FY ${cell.roundNumber}: no locked result`
                                        : `FY ${cell.roundNumber}: ${cell.thresholdLabel} | multiplier ${cell.multiplier} | base ${cell.basePoints} | final ${cell.finalPoints}`;

                                    return (
                                      <td key={`kpi-cell-${row.teamId}-${cell.roundNumber}`} className="px-1 py-1 text-center">
                                        <div className={`rounded-md px-2 py-1 font-semibold ${cellClass}`} title={title}>
                                          {cellLabel}
                                        </div>
                                      </td>
                                    );
                                  })}`r`n                                  <td className="px-2 py-2 text-right font-semibold text-slate-900">
                                    {row.playedCount > 0 ? `${row.hitRate.toFixed(1)}%` : "N/A"}
                                  </td>
                                  <td className="px-2 py-2 text-center">
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                        row.riskLevel === "High"
                                          ? "bg-rose-100 text-rose-700"
                                          : row.riskLevel === "Watch"
                                            ? "bg-amber-100 text-amber-700"
                                            : row.riskLevel === "Stable"
                                              ? "bg-emerald-100 text-emerald-700"
                                              : "bg-slate-100 text-slate-600"
                                      }`}
                                      title={row.riskReason}
                                    >
                                      {row.riskLevel}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-4">
                          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700">Legend: <b className="text-emerald-700">4x</b> = KPI achieved</div>
                          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700">Legend: <b className="text-rose-700">x1</b> = KPI missed</div>
                          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700">Legend: <b className="text-amber-700">?</b> = KPI data incomplete</div>
                          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700">Legend: <b>-</b> = FY not played</div>
                        </div>

                        {kpiHeatmapModel.mostAtRiskTeam && kpiHeatmapModel.mostAtRiskTeam.riskLevel !== "No Data" ? (
                          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                            Watchlist: <b>{kpiHeatmapModel.mostAtRiskTeam.teamName}</b> flagged as <b>{kpiHeatmapModel.mostAtRiskTeam.riskLevel}</b>. {kpiHeatmapModel.mostAtRiskTeam.riskReason}
                          </div>
                        ) : null}
                      </>
                    )}
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader title="Leaderboard Snapshot" subtitle="Current team ranking by total points." />
                  <CardBody className="space-y-2 text-sm">
                    {teamRows.length === 0 ? (
                      <div className="rounded-xl border border-slate-200 bg-white p-3 text-slate-600">
                        No teams found for this session yet.
                      </div>
                    ) : (
                      teamRows.map((team, index) => (
                        <div key={team.id} className="grid grid-cols-[42px_minmax(0,1fr)_96px] items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <div className="text-center text-sm font-semibold text-slate-700">#{index + 1}</div>
                          <div>
                            <div className="font-semibold text-slate-900">{team.team_name}</div>
                            <div className="text-xs text-slate-500">KPI: {team.kpi_target ?? "Not selected"}</div>
                          </div>
                          <div className="text-right font-semibold text-slate-900">{team.total_points ?? 0}</div>
                        </div>
                      ))
                    )}
                  </CardBody>
                </Card>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </RequireAuth>
  );
}















































