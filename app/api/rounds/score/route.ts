import { NextRequest, NextResponse } from "next/server";
import { computeRoundResultV2, type DecisionDraft, type RoundResult } from "@/lib/simEngine";
import { parseDecisionProfile } from "@/lib/decisionProfile";
import { parseKpiTarget, evaluateKpiAchievement, applyKpiMultiplier } from "@/lib/kpi";
import { parseConstructionEvents } from "@/lib/newsPayload";
import { getRoundConstructionEvents } from "@/lib/constructionNews";
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

type TeamResultSummaryRow = {
  points_earned: number | null;
};

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

    let teamQuery = supabase.from("teams").select("id,kpi_target").eq("session_id", sessionId);

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

    if (roundNumber > 1) {
      const { data: prevResultData, error: prevResultError } = await supabase
        .from("team_results")
        .select(
          "schedule_index,cost_index,cash_closing,quality_score,safety_score,stakeholder_score,claim_entitlement_score,points_earned,penalties,detail"
        )
        .eq("session_id", sessionId)
        .eq("team_id", teamId)
        .eq("round_number", roundNumber - 1)
        .maybeSingle();

      if (prevResultError) throw prevResultError;

      if (prevResultData) {
        prevResult = {
          ...(prevResultData as Omit<RoundResult, "detail">),
          detail: (prevResultData as { detail?: Record<string, unknown> }).detail ?? {},
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
    }

    const { data: roundRowData, error: roundRowError } = await supabase
      .from("session_rounds")
      .select("deadline_at,news_payload")
      .eq("session_id", sessionId)
      .eq("round_number", roundNumber)
      .maybeSingle();

    if (roundRowError) throw roundRowError;

    const roundRow = (roundRowData as SessionRoundRow | null) ?? null;
    const events = parseConstructionEvents(roundRow?.news_payload) ?? getRoundConstructionEvents(sessionId, roundNumber);

    const seed = `${sessionId}:${teamId}:${roundNumber}`;
    const computed = computeRoundResultV2(draft, seed, {
      profile,
      prevResult,
      prevProfile,
      events,
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
      .update({ total_points: totalPoints })
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
