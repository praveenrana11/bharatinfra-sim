"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ConstructionEvent, getRoundConstructionEvents } from "@/lib/constructionNews";
import { computeRoundResultV2, DecisionDraft, RoundResult } from "@/lib/simEngine";
import { parseDecisionProfile, DEFAULT_DECISION_PROFILE, DecisionProfile } from "@/lib/decisionProfile";
import { parseKpiTarget, evaluateKpiAchievement, applyKpiMultiplier } from "@/lib/kpi";

type RouteParams = { sessionId?: string };
type MembershipRow = { team_id: string };
type TeamRow = { id: string; team_name: string; session_id: string; total_points: number | null; kpi_target: string | null };
type SessionTeamRow = { id: string; kpi_target: string | null };

type DecisionRow = DecisionDraft & {
  locked: boolean;
  raw: Record<string, unknown> | null;
};

type TeamResultFullRow = {
  schedule_index: number;
  cost_index: number;
  cash_closing: number;
  quality_score: number;
  safety_score: number;
  stakeholder_score: number;
  claim_entitlement_score: number;
  points_earned: number;
  penalties: number;
  detail: Record<string, unknown> | null;
};

type TeamScoreRow = {
  team_id: string;
  points_earned: number | null;
};

type AutoCloseSummary = {
  autoLockedTeams: number;
  generatedResults: number;
  preservedLockedTeams: number;
  totalLatePenalty: number;
};

type SessionRow = {
  name: string | null;
  code: string;
  status: string;
  round_count: number;
  current_round: number;
  created_by: string;
};

type TeamResultRow = { round_number: number };

type SessionRoundRow = {
  deadline_at: string;
  status: string | null;
  news_payload: unknown;
};

const DEFAULT_ROUND_WINDOW_MINUTES = 35;
const LATE_PENALTY_PER_MINUTE = 2;
const LATE_PENALTY_CAP = 80;

const DEFAULT_DECISION_DRAFT: DecisionDraft = {
  focus_cost: 25,
  focus_quality: 25,
  focus_stakeholder: 25,
  focus_speed: 25,
  risk_appetite: "Balanced",
  governance_intensity: "Medium",
  buffer_percent: 5,
  vendor_strategy: "Balanced",
};

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

function formatClock(ms: number) {
  const clamped = Math.max(0, ms);
  const minutes = Math.floor(clamped / 60000);
  const seconds = Math.floor((clamped % 60000) / 1000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function parseRoundEvents(payload: unknown): ConstructionEvent[] | null {
  if (!Array.isArray(payload)) return null;

  const parsed = payload.filter((item) => {
    if (!item || typeof item !== "object") return false;
    const event = item as Record<string, unknown>;
    return (
      typeof event.id === "string" &&
      typeof event.title === "string" &&
      typeof event.description === "string" &&
      typeof event.severity === "number" &&
      Array.isArray(event.tags)
    );
  }) as ConstructionEvent[];

  return parsed.length > 0 ? parsed : null;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function computeLatePenalty(deadlineIso: string | null, submittedIso: string) {
  if (!deadlineIso) {
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

function buildDecisionFromRow(row: DecisionRow): DecisionDraft {
  return {
    focus_cost: row.focus_cost,
    focus_quality: row.focus_quality,
    focus_stakeholder: row.focus_stakeholder,
    focus_speed: row.focus_speed,
    risk_appetite: row.risk_appetite,
    governance_intensity: row.governance_intensity,
    buffer_percent: row.buffer_percent,
    vendor_strategy: row.vendor_strategy,
  };
}

export default function SessionPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseClient(), []);

  const routeParams = params as RouteParams;
  const sessionId = routeParams.sessionId ?? "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [sessionName, setSessionName] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("");
  const [roundCount, setRoundCount] = useState(0);
  const [sessionCurrentRound, setSessionCurrentRound] = useState(0);

  const [teamName, setTeamName] = useState("");
  const [points, setPoints] = useState(0);
  const [teamKpi, setTeamKpi] = useState<string>("Not selected");
  const [completedRound, setCompletedRound] = useState(0);
  const [viewerUserId, setViewerUserId] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminMessage, setAdminMessage] = useState("");
  const [lastAutoCloseSummary, setLastAutoCloseSummary] = useState<AutoCloseSummary | null>(null);
  const [autoCloseAttemptKey, setAutoCloseAttemptKey] = useState("");

  const [nextRound, setNextRound] = useState(1);
  const [roundDeadlineIso, setRoundDeadlineIso] = useState<string | null>(null);
  const [roundStatus, setRoundStatus] = useState("open");
  const [orchestrationSource, setOrchestrationSource] = useState<"shared" | "fallback">("fallback");
  const [roundShocks, setRoundShocks] = useState<ConstructionEvent[]>([]);

  const [lockedTeams, setLockedTeams] = useState(0);
  const [teamCount, setTeamCount] = useState(0);

  const [clockNow, setClockNow] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    (async () => {
      setError("");
      setLoading(true);

      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: sessionData, error: sessionErr } = await supabase
        .from("sessions")
        .select("name, code, status, round_count, current_round, created_by")
        .eq("id", sessionId)
        .single();

      if (sessionErr) {
        setError(sessionErr.message);
        setLoading(false);
        return;
      }

      setViewerUserId(user.id);

      const session = sessionData as SessionRow;
      setSessionName(session.name ?? "");
      setCode(session.code ?? "");
      setStatus(session.status ?? "");
      setRoundCount(session.round_count ?? 0);
      setSessionCurrentRound(session.current_round ?? 0);
      setIsHost(session.created_by === user.id);

      const { data: membershipsData, error: mErr } = await supabase
        .from("team_memberships")
        .select("team_id")
        .eq("user_id", user.id);

      if (mErr) {
        setError(mErr.message);
        setLoading(false);
        return;
      }

      const memberships = (membershipsData ?? []) as MembershipRow[];
      const teamIds = memberships.map((m) => m.team_id);

      const { data: teamsData, error: tErr } = await supabase
        .from("teams")
        .select("id, team_name, session_id, total_points, kpi_target")
        .in("id", teamIds)
        .eq("session_id", sessionId);

      if (tErr) {
        setError(tErr.message);
        setLoading(false);
        return;
      }

      const teams = (teamsData ?? []) as TeamRow[];
      if (teams.length === 0) {
        setError("You are not a member of this session.");
        setLoading(false);
        return;
      }

      const myTeam = teams[0];
      setTeamName(myTeam.team_name ?? "");
      setPoints(myTeam.total_points ?? 0);
      setTeamKpi(myTeam.kpi_target ?? "Not selected");

      const { data: lastResultData, error: rErr } = await supabase
        .from("team_results")
        .select("round_number")
        .eq("session_id", sessionId)
        .eq("team_id", myTeam.id)
        .order("round_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (rErr) {
        setError(rErr.message);
        setLoading(false);
        return;
      }

      const lastResult = lastResultData as TeamResultRow | null;
      const completed = lastResult?.round_number ?? 0;
      setCompletedRound(completed);

      const computedNextRound = Math.min(completed + 1, session.round_count || completed + 1);
      setNextRound(Math.max(computedNextRound, 1));

      setLoading(false);
    })();
  }, [router, sessionId, supabase]);

  useEffect(() => {
    if (loading || !sessionId || nextRound <= 0) return;

    let cancelled = false;

    const refreshRoundState = async () => {
      const defaultEvents = getRoundConstructionEvents(sessionId, nextRound);

      const { count: totalCount } = await supabase
        .from("teams")
        .select("id", { head: true, count: "exact" })
        .eq("session_id", sessionId);

      const { count: lockedCount } = await supabase
        .from("decisions")
        .select("team_id", { head: true, count: "exact" })
        .eq("session_id", sessionId)
        .eq("round_number", nextRound)
        .eq("locked", true);

      if (!cancelled) {
        setTeamCount(totalCount ?? 0);
        setLockedTeams(lockedCount ?? 0);
      }

      const { data: roundRowData, error: roundErr } = await supabase
        .from("session_rounds")
        .select("deadline_at,status,news_payload")
        .eq("session_id", sessionId)
        .eq("round_number", nextRound)
        .maybeSingle();

      if (roundErr) {
        if (!isMissingTableError(roundErr.message) && !cancelled) {
          setError(roundErr.message);
        }

        const fallbackDeadline = new Date(Date.now() + DEFAULT_ROUND_WINDOW_MINUTES * 60_000).toISOString();

        if (!cancelled) {
          setOrchestrationSource("fallback");
          setRoundStatus((lockedCount ?? 0) > 0 && (totalCount ?? 0) > 0 && (lockedCount ?? 0) >= (totalCount ?? 0) ? "closed" : "open");
          setRoundDeadlineIso(fallbackDeadline);
          setRoundShocks(defaultEvents);
        }
        return;
      }

      const roundRow = roundRowData as SessionRoundRow | null;
      if (!roundRow) {
        if (!cancelled) {
          setOrchestrationSource("shared");
          setRoundStatus("closed");
          setRoundDeadlineIso(null);
          setRoundShocks(defaultEvents);
        }
        return;
      }

      if (!cancelled) {
        setOrchestrationSource("shared");
        setRoundStatus(roundRow.status ?? "open");
        setRoundDeadlineIso(roundRow.deadline_at ?? null);
        setRoundShocks(parseRoundEvents(roundRow.news_payload) ?? defaultEvents);
      }
    };

    refreshRoundState();
    const intervalId = window.setInterval(refreshRoundState, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [loading, nextRound, sessionId, supabase]);

  const isComplete = roundCount > 0 && completedRound >= roundCount;
  const msLeft = roundDeadlineIso && clockNow ? Date.parse(roundDeadlineIso) - clockNow : null;
  const lockWindowExpired = msLeft !== null && msLeft <= 0;


    useEffect(() => {
    if (!isHost || loading || adminBusy || isComplete) return;
    if (orchestrationSource !== "shared") return;
    if (roundStatus !== "open" || !lockWindowExpired) return;

    const roundKey = sessionId + ":" + nextRound;
    if (autoCloseAttemptKey === roundKey) return;

    void closeRoundByHost(true);
  // closeRoundByHost is intentionally excluded to avoid effect churn on each render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    adminBusy,
    autoCloseAttemptKey,
    isComplete,
    isHost,
    loading,
    lockWindowExpired,
    nextRound,
    orchestrationSource,
    roundStatus,
    sessionId,
  ]);

async function autoCloseRoundWithAutolock(closeIso: string): Promise<AutoCloseSummary> {
    const { data: roundData, error: roundErr } = await supabase
      .from("session_rounds")
      .select("deadline_at,news_payload")
      .eq("session_id", sessionId)
      .eq("round_number", nextRound)
      .maybeSingle();

    if (roundErr && !isMissingTableError(roundErr.message)) throw roundErr;

    const roundRow = (roundData as SessionRoundRow | null) ?? null;
    const deadlineIso = roundRow?.deadline_at ?? roundDeadlineIso ?? closeIso;
    const events =
      parseRoundEvents(roundRow?.news_payload) ??
      (roundShocks.length > 0 ? roundShocks : getRoundConstructionEvents(sessionId, nextRound));

    const { data: teamsData, error: teamsErr } = await supabase
      .from("teams")
      .select("id,kpi_target")
      .eq("session_id", sessionId);

    if (teamsErr) throw teamsErr;

    const teams = (teamsData ?? []) as SessionTeamRow[];

    let autoLockedTeams = 0;
    let generatedResults = 0;
    let preservedLockedTeams = 0;
    let totalLatePenalty = 0;

    for (const team of teams) {
      const teamId = team.id;

      const { data: decisionData, error: decisionErr } = await supabase
        .from("decisions")
        .select(
          "focus_cost,focus_quality,focus_stakeholder,focus_speed,risk_appetite,governance_intensity,buffer_percent,vendor_strategy,locked,raw"
        )
        .eq("session_id", sessionId)
        .eq("team_id", teamId)
        .eq("round_number", nextRound)
        .maybeSingle();

      if (decisionErr) throw decisionErr;

      const currentDecision = (decisionData as DecisionRow | null) ?? null;
      let decision = DEFAULT_DECISION_DRAFT;
      let profile: DecisionProfile = DEFAULT_DECISION_PROFILE;
      let autoLockSource = "default_baseline";

      if (currentDecision) {
        decision = buildDecisionFromRow(currentDecision);
        profile = parseDecisionProfile(currentDecision.raw);
        autoLockSource = currentDecision.locked ? "already_locked" : "existing_draft";
      } else if (nextRound > 1) {
        const { data: prevDecisionData, error: prevDecisionErr } = await supabase
          .from("decisions")
          .select(
            "focus_cost,focus_quality,focus_stakeholder,focus_speed,risk_appetite,governance_intensity,buffer_percent,vendor_strategy,locked,raw"
          )
          .eq("session_id", sessionId)
          .eq("team_id", teamId)
          .eq("round_number", nextRound - 1)
          .maybeSingle();

        if (prevDecisionErr) throw prevDecisionErr;

        const prevDecision = (prevDecisionData as DecisionRow | null) ?? null;
        if (prevDecision) {
          decision = buildDecisionFromRow(prevDecision);
          profile = parseDecisionProfile(prevDecision.raw);
          autoLockSource = "carry_forward_prev_round";
        }
      }

      if (!currentDecision || !currentDecision.locked) {
        const { error: autoLockErr } = await supabase.from("decisions").upsert(
          {
            session_id: sessionId,
            team_id: teamId,
            round_number: nextRound,
            ...decision,
            raw: {
              ...profile,
              auto_locked: true,
              auto_lock_source: autoLockSource,
              auto_locked_by: viewerUserId,
              auto_locked_at: closeIso,
              auto_lock_reason: "host_round_close",
            },
            locked: true,
            submitted_at: closeIso,
          },
          { onConflict: "session_id,team_id,round_number" }
        );

        if (autoLockErr) throw autoLockErr;
        autoLockedTeams += 1;
      } else {
        preservedLockedTeams += 1;
      }

      const { data: existingResultData, error: existingResultErr } = await supabase
        .from("team_results")
        .select("schedule_index")
        .eq("session_id", sessionId)
        .eq("team_id", teamId)
        .eq("round_number", nextRound)
        .maybeSingle();

      if (existingResultErr) throw existingResultErr;
      if (existingResultData) continue;

      let prevResult: RoundResult | null = null;
      let prevProfile: DecisionProfile | null = null;

      if (nextRound > 1) {
        const { data: prevResultData, error: prevResultErr } = await supabase
          .from("team_results")
          .select(
            "schedule_index,cost_index,cash_closing,quality_score,safety_score,stakeholder_score,claim_entitlement_score,points_earned,penalties,detail"
          )
          .eq("session_id", sessionId)
          .eq("team_id", teamId)
          .eq("round_number", nextRound - 1)
          .maybeSingle();

        if (prevResultErr) throw prevResultErr;

        if (prevResultData) {
          const prevRow = prevResultData as TeamResultFullRow;
          prevResult = {
            schedule_index: prevRow.schedule_index,
            cost_index: prevRow.cost_index,
            cash_closing: prevRow.cash_closing,
            quality_score: prevRow.quality_score,
            safety_score: prevRow.safety_score,
            stakeholder_score: prevRow.stakeholder_score,
            claim_entitlement_score: prevRow.claim_entitlement_score,
            points_earned: prevRow.points_earned,
            penalties: prevRow.penalties,
            detail: prevRow.detail ?? {},
          };
        }

        const { data: prevDecisionRawData, error: prevDecisionRawErr } = await supabase
          .from("decisions")
          .select("raw")
          .eq("session_id", sessionId)
          .eq("team_id", teamId)
          .eq("round_number", nextRound - 1)
          .maybeSingle();

        if (prevDecisionRawErr) throw prevDecisionRawErr;
        const prevRaw = (prevDecisionRawData as { raw?: Record<string, unknown> | null } | null)?.raw ?? null;
        prevProfile = parseDecisionProfile(prevRaw);
      }

      const seed = sessionId + ":" + teamId + ":" + nextRound;
      const computed = computeRoundResultV2(decision, seed, {
        profile,
        prevResult,
        prevProfile,
        events,
      });

      const kpiTarget = parseKpiTarget(team.kpi_target);
      const kpiEval = evaluateKpiAchievement(kpiTarget, computed);
      const boostedPoints = applyKpiMultiplier(computed.points_earned, kpiEval.achieved);

      const latePenalty = computeLatePenalty(deadlineIso, closeIso);
      totalLatePenalty += latePenalty.pointsPenalty;

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
          auto_lock: {
            source: autoLockSource,
            by_user: viewerUserId,
            at: closeIso,
            reason: "host_round_close",
          },
          timeliness: {
            deadline_at: deadlineIso,
            submitted_at: closeIso,
            minutes_late: latePenalty.minutesLate,
            points_penalty: latePenalty.pointsPenalty,
            stakeholder_penalty: latePenalty.stakeholderPenalty,
            extension_mode: latePenalty.extensionMode,
          },
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
        },
      };

      const { error: resultErr } = await supabase.from("team_results").upsert(
        {
          session_id: sessionId,
          team_id: teamId,
          round_number: nextRound,
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
        },
        { onConflict: "session_id,team_id,round_number" }
      );

      if (resultErr) throw resultErr;
      generatedResults += 1;
    }

    const { data: scoreRowsData, error: scoreErr } = await supabase
      .from("team_results")
      .select("team_id,points_earned")
      .eq("session_id", sessionId);

    if (scoreErr) throw scoreErr;

    const scoreRows = (scoreRowsData ?? []) as TeamScoreRow[];
    const totals = new Map<string, number>();

    for (const row of scoreRows) {
      totals.set(row.team_id, (totals.get(row.team_id) ?? 0) + (row.points_earned ?? 0));
    }

    for (const team of teams) {
      const { error: totalErr } = await supabase
        .from("teams")
        .update({ total_points: totals.get(team.id) ?? 0 })
        .eq("id", team.id);

      if (totalErr) throw totalErr;
    }

    setTeamCount(teams.length);
    setLockedTeams(teams.length);

    return {
      autoLockedTeams,
      generatedResults,
      preservedLockedTeams,
      totalLatePenalty,
    };
  }
  async function openRoundByHost() {
    if (!isHost || !sessionId || !viewerUserId) return;

    setAdminBusy(true);
    setAdminMessage("");
    setError("");

    try {
      const events = roundShocks.length > 0 ? roundShocks : getRoundConstructionEvents(sessionId, nextRound);
      const deadlineIso = new Date(Date.now() + DEFAULT_ROUND_WINDOW_MINUTES * 60_000).toISOString();

      const { error: upErr } = await supabase.from("session_rounds").upsert(
        {
          session_id: sessionId,
          round_number: nextRound,
          status: "open",
          deadline_at: deadlineIso,
          news_payload: events,
          created_by: viewerUserId,
          closed_at: null,
          closed_by: null,
        },
        { onConflict: "session_id,round_number" }
      );

      if (upErr) throw upErr;

      const { error: sessErr } = await supabase
        .from("sessions")
        .update({ status: "in_progress" })
        .eq("id", sessionId);

      if (sessErr) throw sessErr;

      setStatus("in_progress");
      setRoundStatus("open");
      setRoundDeadlineIso(deadlineIso);
      setRoundShocks(events);
      setOrchestrationSource("shared");
      setAdminMessage(`Round ${nextRound} opened. Teams can start decisions.`);
      setLastAutoCloseSummary(null);
      setAutoCloseAttemptKey("");
    } catch (unknownError: unknown) {
      const message = unknownError instanceof Error ? unknownError.message : "Failed to open round";
      setError(message);
    } finally {
      setAdminBusy(false);
    }
  }

  async function closeRoundByHost(autoTriggered = false) {
    if (!isHost || !sessionId || !viewerUserId) return;

    const roundKey = sessionId + ":" + nextRound;

    setAdminBusy(true);
    setAdminMessage("");
    setError("");
    setAutoCloseAttemptKey(roundKey);

    try {
      const nowIso = new Date().toISOString();
      const summary = await autoCloseRoundWithAutolock(nowIso);
      setLastAutoCloseSummary(summary);

      const { error: roundErr } = await supabase
        .from("session_rounds")
        .update({ status: "closed", closed_at: nowIso, closed_by: viewerUserId })
        .eq("session_id", sessionId)
        .eq("round_number", nextRound);

      if (roundErr && !isMissingTableError(roundErr.message)) throw roundErr;

      const updatedRound = Math.max(sessionCurrentRound, nextRound);
      const nextStatus = updatedRound >= roundCount ? "complete" : "in_progress";

      const { error: sessErr } = await supabase
        .from("sessions")
        .update({ current_round: updatedRound, status: nextStatus })
        .eq("id", sessionId);

      if (sessErr) throw sessErr;

      setSessionCurrentRound(updatedRound);
      setStatus(nextStatus);
      setRoundStatus("closed");

      if (updatedRound < roundCount) {
        const candidateRound = updatedRound + 1;
        setNextRound(candidateRound);
      }

      const summaryText =
        "Auto-locked " +
        summary.autoLockedTeams +
        " teams, generated " +
        summary.generatedResults +
        " results" +
        (summary.totalLatePenalty > 0 ? ", timeliness penalties " + summary.totalLatePenalty + " pts." : ".");

      setAdminMessage(
        (autoTriggered ? "Deadline reached. " : "") +
          "Round " +
          nextRound +
          " closed. " +
          summaryText
      );
    } catch (unknownError: unknown) {
      const message = unknownError instanceof Error ? unknownError.message : "Failed to close round";
      setError(message);
    } finally {
      setAdminBusy(false);
    }
  }
  async function extendDeadlineByHost(minutes = 10) {
    if (!isHost || !sessionId) return;

    setAdminBusy(true);
    setAdminMessage("");
    setError("");

    try {
      const now = Date.now();
      const baseMs = roundDeadlineIso ? Date.parse(roundDeadlineIso) : now;
      const effectiveBase = Number.isFinite(baseMs) ? Math.max(baseMs, now) : now;
      const nextDeadlineIso = new Date(effectiveBase + minutes * 60_000).toISOString();

      const { error: upErr } = await supabase.from("session_rounds").upsert(
        {
          session_id: sessionId,
          round_number: nextRound,
          status: "open",
          deadline_at: nextDeadlineIso,
        },
        { onConflict: "session_id,round_number" }
      );

      if (upErr) throw upErr;

      setRoundDeadlineIso(nextDeadlineIso);
      setRoundStatus("open");
      setOrchestrationSource("shared");
      setAdminMessage(`Deadline extended by ${minutes} minutes.`);
    } catch (unknownError: unknown) {
      const message = unknownError instanceof Error ? unknownError.message : "Failed to extend deadline";
      setError(message);
    } finally {
      setAdminBusy(false);
    }
  }

  return (
    <RequireAuth>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Session Hub</h1>
            <p className="mt-1 text-sm text-slate-600">Manage round flow, live locks, news, and analysis.</p>
          </div>
          <Link className="text-sm underline text-slate-700" href="/dashboard">
            Dashboard
          </Link>
        </div>

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>
        ) : null}

        {loading ? (
          <Card>
            <CardBody>
              <p className="text-sm text-slate-600">Loading session...</p>
            </CardBody>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader title={sessionName || "Session"} subtitle={`Code: ${code}`} />
              <CardBody className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-slate-500">Status</div>
                  <div className="mt-1 font-semibold text-slate-900">{status || "pending"}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-slate-500">Round progress</div>
                  <div className="mt-1 font-semibold text-slate-900">
                    {completedRound}/{roundCount}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">Session marker: {sessionCurrentRound}/{roundCount}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-slate-500">Team</div>
                  <div className="mt-1 font-semibold text-slate-900">{teamName}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-slate-500">Total points</div>
                  <div className="mt-1 font-semibold text-slate-900">{points}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-slate-500">Team KPI target</div>
                  <div className="mt-1 font-semibold text-slate-900">{teamKpi}</div>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title={`Live Round ${nextRound} Orchestration`}
                subtitle="Shared lock window, team progress, and round shocks"
              />
              <CardBody className="space-y-3 text-sm">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="text-slate-500">Round status</div>
                    <div className="mt-1 font-semibold text-slate-900">{roundStatus}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      Source: {orchestrationSource === "shared" ? "session_rounds" : "fallback"}
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="text-slate-500">Lock progress</div>
                    <div className="mt-1 font-semibold text-slate-900">
                      {lockedTeams}/{teamCount || "-"} teams locked
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="text-slate-500">Lock clock</div>
                    <div className="mt-1 font-semibold text-slate-900">
                      {msLeft === null
                        ? "Initializing..."
                        : lockWindowExpired
                          ? "Window elapsed"
                          : formatClock(msLeft)}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Round shocks preview</div>
                  <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                    {roundShocks.slice(0, 4).map((event) => (
                      <div key={event.id} className="rounded-lg border border-slate-200 bg-white p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold text-slate-900">{event.title}</div>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              event.severity >= 3
                                ? "bg-rose-100 text-rose-700"
                                : event.severity === 2
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            S{event.severity}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-slate-600">{event.description}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Facilitator Controls</div>
                  {isHost ? (
                    <>
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={openRoundByHost} disabled={adminBusy || isComplete}>
                          {adminBusy ? "Working..." : `Open Round ${nextRound}`}
                        </Button>
                        <Button variant="secondary" onClick={() => void closeRoundByHost()} disabled={adminBusy || isComplete}>
                          {adminBusy ? "Working..." : `Close + Auto-lock Round ${nextRound}`}
                        </Button>
                        <Button variant="secondary" onClick={() => extendDeadlineByHost(10)} disabled={adminBusy || isComplete}>
                          +10 min deadline
                        </Button>
                      </div>
                      <p className="text-xs text-slate-600">
                        Host-only: open round, and close round with hard-deadline auto-lock for remaining teams.
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-slate-600">Waiting for facilitator to open/close rounds.</p>
                  )}

                  {adminMessage ? (
                    <div className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700">{adminMessage}</div>
                  ) : null}

                  {lastAutoCloseSummary ? (
                    <div className="rounded border border-slate-200 bg-slate-50 px-2 py-2 text-xs text-slate-700">
                      <div>Auto-locked teams: <b>{lastAutoCloseSummary.autoLockedTeams}</b></div>
                      <div>Generated results: <b>{lastAutoCloseSummary.generatedResults}</b></div>
                      <div>Already locked preserved: <b>{lastAutoCloseSummary.preservedLockedTeams}</b></div>
                      <div>Total timeliness penalty: <b>{lastAutoCloseSummary.totalLatePenalty}</b></div>
                    </div>
                  ) : null}
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Next actions" subtitle="Move step-by-step through each round." />
              <CardBody className="flex flex-wrap gap-3">
                {!isComplete ? (
                  (roundStatus === "open" && (orchestrationSource !== "shared" || !lockWindowExpired)) || isHost ? (
                    <Link href={`/sessions/${sessionId}/round/${nextRound}`}>
                      <Button>Go to Round {nextRound} Decisions</Button>
                    </Link>
                  ) : (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      Round is not open (or deadline has passed). Wait for facilitator action.
                    </div>
                  )
                ) : (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                    Simulation complete
                  </div>
                )}

                <Link href={`/sessions/${sessionId}/round/${nextRound}/news`}>
                  <Button variant="secondary">Open Round News Desk</Button>
                </Link>

                <Link href={`/sessions/${sessionId}/report`}>
                  <Button variant="secondary">Open FY Report</Button>
                </Link>

                {completedRound > 0 ? (
                  <Link href={`/sessions/${sessionId}/round/${completedRound}/results`}>
                    <Button variant="secondary">View Round {completedRound} Results</Button>
                  </Link>
                ) : null}
              </CardBody>
            </Card>
          </>
        )}
      </div>
    </RequireAuth>
  );
}
