import { NextRequest, NextResponse } from "next/server";
import { computeRoundResultV2, type DecisionDraft, type RoundResult } from "@/lib/simEngine";
import { parseDecisionProfile } from "@/lib/decisionProfile";
import { parseKpiTarget, evaluateKpiAchievement, applyKpiMultiplier } from "@/lib/kpi";
import { parseConstructionEvents } from "@/lib/newsPayload";
import { resolveRoundConstructionEvents } from "@/lib/constructionNews";
import {
  computeCarryover,
  type Decision as CarryoverDecision,
  type TeamResult as CarryoverTeamResult,
} from "@/lib/consequenceEngine";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

const LATE_PENALTY_PER_MINUTE = 2;
const LATE_PENALTY_CAP = 80;

type ScoreRoundRequest = {
  sessionId?: string;
  roundNumber?: number;
  teamId?: string;
};

type TeamRow = {
  id: string;
  kpi_target: string | null;
  scenario_id: string | null;
};

type DecisionRow = {
  focus_cost: number;
  focus_quality: number;
  focus_stakeholder: number;
  focus_speed: number;
  risk_appetite: "Conservative" | "Balanced" | "Aggressive";
  governance_intensity: "Low" | "Medium" | "High";
  buffer_percent: number;
  vendor_strategy: "Cheapest" | "Balanced" | "Reliable";
  raw: Record<string, unknown> | null;
  locked: boolean;
  submitted_at: string | null;
};

type SessionRoundRow = {
  deadline_at: string | null;
  news_payload: unknown;
};

type PrevDecisionRawRow = {
  raw: Record<string, unknown> | null;
};

type ScenarioBudgetRow = {
  base_budget_cr: number | string | null;
};

type TeamResultSummaryRow = {
  points_earned: number | null;
};

type CarryoverDecisionRow = CarryoverDecision;
type CarryoverResultRow = CarryoverTeamResult;

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return fallback;
}

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function computeLatePenalty(deadlineIso: string | null, submittedIso: string, sharedClock: boolean) {
  if (!deadlineIso || !sharedClock) {
    return {
      minutesLate: 0,
      pointsPenalty: 0,
      stakeholderPenalty: 0,
      extensionMode: false,
    };
  }

  const deadlineMs = Date.parse(deadlineIso);
  const submittedMs = Date.parse(submittedIso);
  const deltaMs = submittedMs - deadlineMs;

  if (!Number.isFinite(deadlineMs) || !Number.isFinite(submittedMs) || deltaMs <= 0) {
    return {
      minutesLate: 0,
      pointsPenalty: 0,
      stakeholderPenalty: 0,
      extensionMode: false,
    };
  }

  const minutesLate = Math.max(1, Math.ceil(deltaMs / 60000));
  const pointsPenalty = Math.min(LATE_PENALTY_CAP, minutesLate * LATE_PENALTY_PER_MINUTE);
  const stakeholderPenalty = Math.min(12, Math.ceil(minutesLate / 4));

  return {
    minutesLate,
    pointsPenalty,
    stakeholderPenalty,
    extensionMode: true,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function parseAuthToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1]?.trim() ?? "";
  return token.length > 0 ? token : null;
}

export async function POST(request: NextRequest) {
  try {
    const token = parseAuthToken(request);
    if (!token) {
      return NextResponse.json({ error: "No authorization token" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as ScoreRoundRequest | null;
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
    const roundNumber = typeof body?.roundNumber === "number" ? Math.trunc(body.roundNumber) : NaN;
    const requestedTeamId = typeof body?.teamId === "string" ? body.teamId.trim() : "";

    if (!sessionId || !Number.isFinite(roundNumber) || roundNumber <= 0) {
      return NextResponse.json({ error: "Invalid sessionId or roundNumber." }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: asErrorMessage(authError, "Unauthorized user.") },
        { status: 401 }
      );
    }

    let membershipQuery = supabase
      .from("team_memberships")
      .select("team_id")
      .eq("user_id", user.id);

    if (requestedTeamId) {
      membershipQuery = membershipQuery.eq("team_id", requestedTeamId);
    }

    const { data: membershipData, error: membershipError } = await membershipQuery;

    if (membershipError) throw membershipError;

    const teamIds = (membershipData ?? [])
      .map((row) => (typeof row.team_id === "string" ? row.team_id : ""))
      .filter(Boolean);

    if (teamIds.length === 0) {
      return NextResponse.json(
        { error: "Team not found for this user/session" },
        { status: 404 }
      );
    }

    let teamQuery = supabase.from("teams").select("id,kpi_target,scenario_id").eq("session_id", sessionId);

    if (requestedTeamId) {
      teamQuery = teamQuery.eq("id", requestedTeamId);
    } else {
      teamQuery = teamQuery.in("id", teamIds).order("id", { ascending: true }).limit(1);
    }

    const { data: teamRows, error: teamError } = await teamQuery;

    if (teamError) throw teamError;

    const team = ((teamRows ?? []) as TeamRow[])[0] ?? null;
    if (!team) {
      return NextResponse.json(
        { error: "Team not found for this user/session" },
        { status: 404 }
      );
    }

    const teamId = team.id;
    let baseBudgetCr = 0;

    if (team.scenario_id) {
      const { data: scenarioData, error: scenarioError } = await supabase
        .from("project_scenarios")
        .select("base_budget_cr")
        .eq("id", team.scenario_id)
        .maybeSingle();

      if (scenarioError) throw scenarioError;
      baseBudgetCr = toNumber((scenarioData as ScenarioBudgetRow | null)?.base_budget_cr, 0);
    }

    const { data: decisionData, error: decisionError } = await supabase
      .from("decisions")
      .select(
        "focus_cost,focus_quality,focus_stakeholder,focus_speed,risk_appetite,governance_intensity,buffer_percent,vendor_strategy,raw,locked,submitted_at"
      )
      .eq("session_id", sessionId)
      .eq("team_id", teamId)
      .eq("round_number", roundNumber)
      .eq("locked", true)
      .maybeSingle();

    if (decisionError) throw decisionError;

    const decision = (decisionData as DecisionRow | null) ?? null;
    if (!decision) {
      return NextResponse.json({ error: "No locked decision found" }, { status: 404 });
    }

    const draft: DecisionDraft = {
      focus_cost: decision.focus_cost,
      focus_quality: decision.focus_quality,
      focus_stakeholder: decision.focus_stakeholder,
      focus_speed: decision.focus_speed,
      risk_appetite: decision.risk_appetite,
      governance_intensity: decision.governance_intensity,
      buffer_percent: decision.buffer_percent,
      vendor_strategy: decision.vendor_strategy,
    };

    const profile = parseDecisionProfile(decision.raw);

    let prevResult: RoundResult | null = null;
    let prevProfile = null;
    let priorCarryoverResults: CarryoverResultRow[] = [];
    let priorCarryoverDecisions: CarryoverDecisionRow[] = [];

    if (roundNumber > 1) {
      const { data: prevResultData, error: prevResultError } = await supabase
        .from("team_results")
        .select(
          "schedule_index,cost_index,cash_closing,quality_score,safety_score,stakeholder_score,claim_entitlement_score,points_earned,penalties,ld_triggered,ld_amount_cr,ld_cumulative_cr,ld_weeks,ld_capped,detail"
        )
        .eq("session_id", sessionId)
        .eq("team_id", teamId)
        .eq("round_number", roundNumber - 1)
        .maybeSingle();

      if (prevResultError) throw prevResultError;

      if (prevResultData) {
        const prevRow = prevResultData as Partial<RoundResult> & { detail?: Record<string, unknown> };
        prevResult = {
          schedule_index: toNumber(prevRow.schedule_index, 0),
          cost_index: toNumber(prevRow.cost_index, 0),
          cash_closing: toNumber(prevRow.cash_closing, 0),
          quality_score: toNumber(prevRow.quality_score, 0),
          safety_score: toNumber(prevRow.safety_score, 0),
          stakeholder_score: toNumber(prevRow.stakeholder_score, 0),
          claim_entitlement_score: toNumber(prevRow.claim_entitlement_score, 0),
          points_earned: toNumber(prevRow.points_earned, 0),
          penalties: toNumber(prevRow.penalties, 0),
          ld_triggered: Boolean(prevRow.ld_triggered),
          ld_amount_cr: toNumber(prevRow.ld_amount_cr, 0),
          ld_cumulative_cr: toNumber(prevRow.ld_cumulative_cr, 0),
          ld_weeks: toNumber(prevRow.ld_weeks, 0),
          ld_capped: Boolean(prevRow.ld_capped),
          detail: prevRow.detail ?? {},
        };
      }

      const { data: prevDecisionData, error: prevDecisionError } = await supabase
        .from("decisions")
        .select("raw")
        .eq("session_id", sessionId)
        .eq("team_id", teamId)
        .eq("round_number", roundNumber - 1)
        .maybeSingle();

      if (prevDecisionError) throw prevDecisionError;

      const prevDecision = (prevDecisionData as PrevDecisionRawRow | null) ?? null;
      prevProfile = parseDecisionProfile(prevDecision?.raw ?? null);

      const [carryoverResultsResponse, carryoverDecisionsResponse] = await Promise.all([
        supabase
          .from("team_results")
          .select("cash_closing,stakeholder_score,ld_triggered,detail")
          .eq("session_id", sessionId)
          .eq("team_id", teamId)
          .lt("round_number", roundNumber)
          .order("round_number", { ascending: true }),
        supabase
          .from("decisions")
          .select("focus_speed,governance_intensity,raw")
          .eq("session_id", sessionId)
          .eq("team_id", teamId)
          .lt("round_number", roundNumber)
          .order("round_number", { ascending: true }),
      ]);

      if (carryoverResultsResponse.error) throw carryoverResultsResponse.error;
      if (carryoverDecisionsResponse.error) throw carryoverDecisionsResponse.error;

      priorCarryoverResults = (carryoverResultsResponse.data ?? []) as CarryoverResultRow[];
      priorCarryoverDecisions = (carryoverDecisionsResponse.data ?? []) as CarryoverDecisionRow[];
    }

    const incomingCarryoverState = computeCarryover(priorCarryoverResults, priorCarryoverDecisions);

    const { data: roundRowData, error: roundRowError } = await supabase
      .from("session_rounds")
      .select("deadline_at,news_payload")
      .eq("session_id", sessionId)
      .eq("round_number", roundNumber)
      .maybeSingle();

    if (roundRowError) throw roundRowError;

    const roundRow = (roundRowData as SessionRoundRow | null) ?? null;
    const decisionEvents = parseConstructionEvents(decision.raw?.events);
    const sharedRoundEvents = parseConstructionEvents(roundRow?.news_payload);
    const events =
      decisionEvents ??
      resolveRoundConstructionEvents({
        sessionId,
        roundNumber,
        sharedEvents: sharedRoundEvents,
        carryoverState: incomingCarryoverState,
      });

    const seed = `${sessionId}:${teamId}:${roundNumber}`;
    const computed = computeRoundResultV2(draft, seed, {
      profile,
      prevResult,
      prevProfile,
      events,
      carryoverState: incomingCarryoverState,
      baseBudgetCr,
    });

    const kpiTarget = parseKpiTarget(team.kpi_target);
    const kpiEval = evaluateKpiAchievement(kpiTarget, computed);
    const boostedPoints = applyKpiMultiplier(computed.points_earned, kpiEval.achieved);

    const submittedAt =
      typeof decision.submitted_at === "string" && Number.isFinite(Date.parse(decision.submitted_at))
        ? decision.submitted_at
        : new Date().toISOString();

    const latePenalty = computeLatePenalty(roundRow?.deadline_at ?? null, submittedAt, Boolean(roundRow?.deadline_at));
    const finalPoints = Math.max(0, boostedPoints - latePenalty.pointsPenalty);
    const finalStakeholder = clamp(computed.stakeholder_score - latePenalty.stakeholderPenalty, 0, 100);
    const updatedCarryoverState = computeCarryover(
      [
        ...priorCarryoverResults,
        {
          cash_closing: computed.cash_closing,
          stakeholder_score: finalStakeholder,
          ld_triggered: computed.ld_triggered,
          detail: computed.detail,
        },
      ],
      [
        ...priorCarryoverDecisions,
        {
          focus_speed: decision.focus_speed,
          governance_intensity: decision.governance_intensity,
          raw: decision.raw,
        },
      ]
    );

    const finalResult: RoundResult = {
      ...computed,
      stakeholder_score: finalStakeholder,
      points_earned: finalPoints,
      penalties: (computed.penalties ?? 0) + latePenalty.pointsPenalty,
      detail: {
        ...computed.detail,
        events,
        kpi: {
          target: kpiTarget,
          achieved: kpiEval.achieved,
          metric: kpiEval.metricKey,
          actual: kpiEval.actual,
          threshold: kpiEval.threshold,
          threshold_label: kpiEval.thresholdLabel,
          base_points: computed.points_earned,
          multiplied_points: boostedPoints,
          late_points_penalty: latePenalty.pointsPenalty,
          final_points: finalPoints,
          multiplier: kpiEval.achieved ? 4 : 1,
        },
        timeliness: {
          clock_source: roundRow?.deadline_at ? "shared" : "fallback",
          deadline_at: roundRow?.deadline_at ?? null,
          submitted_at: submittedAt,
          minutes_late: latePenalty.minutesLate,
          points_penalty: latePenalty.pointsPenalty,
          stakeholder_penalty: latePenalty.stakeholderPenalty,
          extension_mode: latePenalty.extensionMode,
        },
        carryover_state: updatedCarryoverState,
      },
    };

    const resultRow = {
      session_id: sessionId,
      team_id: teamId,
      round_number: roundNumber,
      schedule_index: finalResult.schedule_index,
      cost_index: finalResult.cost_index,
      cash_closing: finalResult.cash_closing,
      quality_score: finalResult.quality_score,
      safety_score: finalResult.safety_score,
      stakeholder_score: finalResult.stakeholder_score,
      claim_entitlement_score: finalResult.claim_entitlement_score,
      points_earned: finalResult.points_earned,
      penalties: finalResult.penalties,
      ld_triggered: finalResult.ld_triggered,
      ld_amount_cr: finalResult.ld_amount_cr,
      ld_cumulative_cr: finalResult.ld_cumulative_cr,
      ld_weeks: finalResult.ld_weeks,
      ld_capped: finalResult.ld_capped,
      carryover_state: updatedCarryoverState,
      detail: finalResult.detail,
    };

    const { error: upsertError } = await supabase
      .from("team_results")
      .upsert(resultRow, { onConflict: "session_id,team_id,round_number" });

    if (upsertError) {
      throw new HttpError(500, asErrorMessage(upsertError, "Scoring error"));
    }

    const { data: allResultsData, error: allResultsError } = await supabase
      .from("team_results")
      .select("points_earned")
      .eq("session_id", sessionId)
      .eq("team_id", teamId);

    if (allResultsError) throw allResultsError;

    const allResults = (allResultsData ?? []) as TeamResultSummaryRow[];
    const totalPoints = allResults.reduce((sum, row) => sum + (row.points_earned ?? 0), 0);

    const { error: teamUpdateError } = await supabase
      .from("teams")
      .update({ total_points: totalPoints, total_ld_cr: finalResult.ld_cumulative_cr })
      .eq("id", teamId)
      .eq("session_id", sessionId);

    if (teamUpdateError) throw teamUpdateError;

    return NextResponse.json({
      result: resultRow,
      latePenalty,
      submittedAt,
    });
  } catch (error: unknown) {
    const status = error instanceof HttpError ? error.status : 500;
    return NextResponse.json(
      { error: asErrorMessage(error, "Secure round scoring failed.") },
      { status }
    );
  }
}
