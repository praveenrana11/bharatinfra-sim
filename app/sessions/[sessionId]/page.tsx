"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { MetricTile } from "@/components/ui/MetricTile";
import { Page } from "@/components/ui/Page";
import { ConstructionEvent, getRoundConstructionEvents } from "@/lib/constructionNews";
import { computeRoundResultV2, DecisionDraft, RoundResult } from "@/lib/simEngine";
import { parseDecisionProfile, DEFAULT_DECISION_PROFILE, DecisionProfile } from "@/lib/decisionProfile";
import { parseKpiTarget, evaluateKpiAchievement, applyKpiMultiplier } from "@/lib/kpi";
import { getScenarioHeroImageUrl } from "@/lib/simVisuals";
import {
  BHARATINFRA_ONBOARDING_STORAGE_KEY,
  HOW_TO_PLAY_SEEN_EVENT,
  openHowToPlay,
} from "@/lib/howToPlay";

type RouteParams = { sessionId?: string };
type MembershipRow = { team_id: string };
type IdentityProfile = { primary_kpi?: string | null };
type TeamRow = {
  id: string;
  team_name: string;
  session_id: string;
  total_points: number | null;
  kpi_target: string | null;
  identity_profile: IdentityProfile | null;
  identity_completed: boolean;
  scenario_id: string | null;
};
type SessionTeamRow = { id: string; kpi_target: string | null };
type ScenarioRow = { name: string | null; client: string | null; duration_rounds: number | null };
type DecisionRow = DecisionDraft & { locked: boolean; raw: Record<string, unknown> | null };
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
type TeamScoreRow = { team_id: string; points_earned: number | null };
type AutoCloseSummary = { autoLockedTeams: number; generatedResults: number; preservedLockedTeams: number; totalLatePenalty: number };
type SessionRow = { name: string | null; code: string; status: string; round_count: number; current_round: number; created_by: string };
type TeamResultRow = { round_number: number };
type SessionRoundRow = { deadline_at: string; status: string | null; news_payload: unknown };
type LeaderboardEntry = { id: string; teamName: string; totalPoints: number; currentRank: number; previousRank: number };
type PreviousMetrics = { spi: number | null; cpi: number | null; safety: number | null; points: number | null };

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

const isMissingTableError = (message: string) => {
  const lower = message.toLowerCase();
  return lower.includes("does not exist") || lower.includes("relation") || lower.includes("42p01") || lower.includes("schema cache") || lower.includes("could not find the table");
};
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const isSessionCompleted = (status: string | null | undefined) => ["complete", "completed"].includes(status?.toLowerCase() ?? "");
const formatClock = (ms: number) => `${String(Math.floor(Math.max(0, ms) / 60000)).padStart(2, "0")}:${String(Math.floor((Math.max(0, ms) % 60000) / 1000)).padStart(2, "0")}`;
const resolvePrimaryKpi = (team: Pick<TeamRow, "kpi_target" | "identity_profile">) =>
  team.kpi_target ?? team.identity_profile?.primary_kpi ?? "Not selected";
const buildDecisionFromRow = (row: DecisionRow): DecisionDraft => ({
  focus_cost: row.focus_cost,
  focus_quality: row.focus_quality,
  focus_stakeholder: row.focus_stakeholder,
  focus_speed: row.focus_speed,
  risk_appetite: row.risk_appetite,
  governance_intensity: row.governance_intensity,
  buffer_percent: row.buffer_percent,
  vendor_strategy: row.vendor_strategy,
});

function parseRoundEvents(payload: unknown): ConstructionEvent[] | null {
  if (!Array.isArray(payload)) return null;
  const parsed = payload.filter((item) => {
    if (!item || typeof item !== "object") return false;
    const event = item as Record<string, unknown>;
    return typeof event.id === "string" && typeof event.title === "string" && typeof event.description === "string" && typeof event.severity === "number" && Array.isArray(event.tags);
  }) as ConstructionEvent[];
  return parsed.length > 0 ? parsed : null;
}

function computeLatePenalty(deadlineIso: string | null, submittedIso: string) {
  if (!deadlineIso) return { minutesLate: 0, pointsPenalty: 0, stakeholderPenalty: 0, extensionMode: false };
  const deadlineMs = Date.parse(deadlineIso);
  const submittedMs = Date.parse(submittedIso);
  const deltaMs = submittedMs - deadlineMs;
  if (!Number.isFinite(deadlineMs) || !Number.isFinite(submittedMs) || deltaMs <= 0) return { minutesLate: 0, pointsPenalty: 0, stakeholderPenalty: 0, extensionMode: false };
  const minutesLate = Math.max(1, Math.ceil(deltaMs / 60000));
  return {
    minutesLate,
    pointsPenalty: Math.min(LATE_PENALTY_CAP, minutesLate * LATE_PENALTY_PER_MINUTE),
    stakeholderPenalty: Math.min(12, Math.ceil(minutesLate / 4)),
    extensionMode: true,
  };
}

function DeltaArrow({ direction }: { direction: "up" | "down" | "flat" }) {
  if (direction === "flat") return <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">No change</span>;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${direction === "up" ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100" : "border-rose-400/20 bg-rose-500/10 text-rose-100"}`}>
      <svg viewBox="0 0 16 16" className={`h-3 w-3 ${direction === "down" ? "rotate-180" : ""}`} fill="none" stroke="currentColor">
        <path d="M8 12V4M8 4 4.5 7.5M8 4l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
      </svg>
      {direction === "up" ? "Up" : "Down"}
    </span>
  );
}

export default function SessionPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseClient(), []);
  const sessionId = (params as RouteParams).sessionId ?? "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sessionName, setSessionName] = useState("");
  const [scenarioName, setScenarioName] = useState("Project Scenario");
  const [scenarioClient, setScenarioClient] = useState("Client");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("");
  const [roundCount, setRoundCount] = useState(0);
  const [sessionCurrentRound, setSessionCurrentRound] = useState(0);
  const [teamId, setTeamId] = useState("");
  const [teamName, setTeamName] = useState("");
  const [points, setPoints] = useState(0);
  const [teamKpi, setTeamKpi] = useState("Not selected");
  const [completedRound, setCompletedRound] = useState(0);
  const [viewerUserId, setViewerUserId] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminMessage, setAdminMessage] = useState("");
  const [lastAutoCloseSummary, setLastAutoCloseSummary] = useState<AutoCloseSummary | null>(null);
  const [autoCloseAttemptKey, setAutoCloseAttemptKey] = useState("");
  const [nextRound, setNextRound] = useState(1);
  const [roundDeadlineIso, setRoundDeadlineIso] = useState<string | null>(null);
  const [roundStatus, setRoundStatus] = useState("pending");
  const [orchestrationSource, setOrchestrationSource] = useState<"shared" | "fallback">("fallback");
  const [roundShocks, setRoundShocks] = useState<ConstructionEvent[]>([]);
  const [lockedTeams, setLockedTeams] = useState(0);
  const [teamCount, setTeamCount] = useState(0);
  const [showHowToPlayButton, setShowHowToPlayButton] = useState(false);
  const [clockNow, setClockNow] = useState(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [previousMetrics, setPreviousMetrics] = useState<PreviousMetrics>({ spi: null, cpi: null, safety: null, points: null });
  const onboardingCheckRef = useRef(false);

  useEffect(() => {
    const id = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  async function refreshSessionAnalytics(activeTeamId: string, latestCompletedRound: number) {
    const { data: teamsData, error: teamsErr } = await supabase.from("teams").select("id,team_name,total_points").eq("session_id", sessionId);
    if (teamsErr) throw teamsErr;
    const teams = (teamsData ?? []) as Array<{ id: string; team_name: string; total_points: number | null }>;
    const totals = new Map(teams.map((row) => [row.id, row.total_points ?? 0]));
    setTeamCount(teams.length);
    setPoints(totals.get(activeTeamId) ?? 0);

    let roundRows: Array<{ team_id: string; points_earned: number | null; schedule_index: number | null; cost_index: number | null; safety_score: number | null }> = [];
    if (latestCompletedRound > 0) {
      const { data, error: roundErr } = await supabase.from("team_results").select("team_id,points_earned,schedule_index,cost_index,safety_score").eq("session_id", sessionId).eq("round_number", latestCompletedRound);
      if (roundErr) throw roundErr;
      roundRows = data ?? [];
    }

    const roundPoints = new Map<string, number>();
    let metrics: PreviousMetrics = { spi: null, cpi: null, safety: null, points: null };
    for (const row of roundRows) {
      roundPoints.set(row.team_id, row.points_earned ?? 0);
      if (row.team_id === activeTeamId) metrics = { spi: row.schedule_index ?? null, cpi: row.cost_index ?? null, safety: row.safety_score ?? null, points: row.points_earned ?? null };
    }

    const currentRanked = [...teams].sort((a, b) => (b.total_points ?? 0) - (a.total_points ?? 0));
    const currentRankMap = new Map(currentRanked.map((row, index) => [row.id, index + 1]));
    const previousRankMap = new Map(
      [...teams]
        .map((row) => ({ ...row, previousPoints: (row.total_points ?? 0) - (roundPoints.get(row.id) ?? 0) }))
        .sort((a, b) => b.previousPoints - a.previousPoints)
        .map((row, index) => [row.id, index + 1])
    );

    setLeaderboard(currentRanked.map((row) => ({
      id: row.id,
      teamName: row.team_name,
      totalPoints: row.total_points ?? 0,
      currentRank: currentRankMap.get(row.id) ?? 1,
      previousRank: previousRankMap.get(row.id) ?? currentRankMap.get(row.id) ?? 1,
    })));
    setPreviousMetrics(metrics);
  }

  useEffect(() => {
    (async () => {
      setError("");
      setLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return void router.replace("/login");

      const { data: sessionData, error: sessionErr } = await supabase.from("sessions").select("name, code, status, round_count, current_round, created_by").eq("id", sessionId).single();
      if (sessionErr) return void (setError(sessionErr.message), setLoading(false));

      setViewerUserId(user.id);
      const session = sessionData as SessionRow;
      setSessionName(session.name ?? "");
      setCode(session.code ?? "");
      setStatus(session.status ?? "");
      setRoundCount(session.round_count ?? 0);
      setSessionCurrentRound(session.current_round ?? 0);
      setIsHost(session.created_by === user.id);

      const { data: membershipsData, error: membershipErr } = await supabase.from("team_memberships").select("team_id").eq("user_id", user.id);
      if (membershipErr) return void (setError(membershipErr.message), setLoading(false));

      const teamIds = ((membershipsData ?? []) as MembershipRow[]).map((row) => row.team_id);
      const { data: teamsData, error: teamsErr } = await supabase.from("teams").select("id, team_name, session_id, total_points, kpi_target, identity_profile, identity_completed, scenario_id").in("id", teamIds).eq("session_id", sessionId);
      if (teamsErr) return void (setError(teamsErr.message), setLoading(false));

      const myTeam = ((teamsData ?? []) as TeamRow[])[0];
      if (!myTeam) return void (setError("You are not a member of this session."), setLoading(false));

      setTeamId(myTeam.id);
      setTeamName(myTeam.team_name ?? "");
      setPoints(myTeam.total_points ?? 0);
      setTeamKpi(resolvePrimaryKpi(myTeam));
      if (!myTeam.identity_completed && !isSessionCompleted(session.status)) return void router.replace(`/sessions/${sessionId}/identity`);

      const { data: lastResultData, error: resultErr } = await supabase.from("team_results").select("round_number").eq("session_id", sessionId).eq("team_id", myTeam.id).order("round_number", { ascending: false }).limit(1).maybeSingle();
      if (resultErr) return void (setError(resultErr.message), setLoading(false));

      const completed = (lastResultData as TeamResultRow | null)?.round_number ?? 0;
      setCompletedRound(completed);
      setNextRound(Math.max(Math.min(completed + 1, session.round_count || completed + 1), 1));

      if (myTeam.scenario_id) {
        const { data: scenarioData } = await supabase.from("project_scenarios").select("name,client,duration_rounds").eq("id", myTeam.scenario_id).maybeSingle();
        const scenario = (scenarioData as ScenarioRow | null) ?? null;
        if (scenario?.name) setScenarioName(scenario.name);
        if (scenario?.client) setScenarioClient(scenario.client);
        if ((session.round_count ?? 0) === 0 && scenario?.duration_rounds) setRoundCount(scenario.duration_rounds);
      }

      await refreshSessionAnalytics(myTeam.id, completed);
      setLoading(false);
    })();
  }, [router, sessionId, supabase]);

  useEffect(() => {
    if (loading || !sessionId || nextRound <= 0) return;
    let cancelled = false;
    const refreshRoundState = async () => {
      const defaultEvents = getRoundConstructionEvents(sessionId, nextRound);
      const { count: totalCount } = await supabase.from("teams").select("id", { head: true, count: "exact" }).eq("session_id", sessionId);
      const { count: lockedCount } = await supabase.from("decisions").select("team_id", { head: true, count: "exact" }).eq("session_id", sessionId).eq("round_number", nextRound).eq("locked", true);
      if (!cancelled) {
        setTeamCount(totalCount ?? 0);
        setLockedTeams(lockedCount ?? 0);
      }

      const { data: roundRowData, error: roundErr } = await supabase.from("session_rounds").select("deadline_at,status,news_payload").eq("session_id", sessionId).eq("round_number", nextRound).maybeSingle();
      if (roundErr) {
        if (!isMissingTableError(roundErr.message) && !cancelled) setError(roundErr.message);
        const fallbackDeadline = new Date(Date.now() + DEFAULT_ROUND_WINDOW_MINUTES * 60_000).toISOString();
        if (!cancelled) {
          setOrchestrationSource("fallback");
          setRoundStatus((lockedCount ?? 0) > 0 && (totalCount ?? 0) > 0 && (lockedCount ?? 0) >= (totalCount ?? 0) ? "closed" : "pending");
          setRoundDeadlineIso(fallbackDeadline);
          setRoundShocks(defaultEvents);
        }
        return;
      }

      const roundRow = roundRowData as SessionRoundRow | null;
      if (!roundRow) {
        if (!cancelled) {
          setOrchestrationSource("shared");
          setRoundStatus("pending");
          setRoundDeadlineIso(null);
          setRoundShocks(defaultEvents);
        }
        return;
      }

      if (!cancelled) {
        setOrchestrationSource("shared");
        setRoundStatus(roundRow.status ?? "pending");
        setRoundDeadlineIso(roundRow.deadline_at ?? null);
        setRoundShocks(parseRoundEvents(roundRow.news_payload) ?? defaultEvents);
      }
    };

    void refreshRoundState();
    const intervalId = window.setInterval(() => void refreshRoundState(), 10000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [loading, nextRound, sessionId, supabase]);

  useEffect(() => {
    const handleSeen = () => setShowHowToPlayButton(true);
    window.addEventListener(HOW_TO_PLAY_SEEN_EVENT, handleSeen);
    return () => window.removeEventListener(HOW_TO_PLAY_SEEN_EVENT, handleSeen);
  }, []);

  useEffect(() => {
    if (loading || error || onboardingCheckRef.current) return;
    onboardingCheckRef.current = true;
    if (localStorage.getItem(BHARATINFRA_ONBOARDING_STORAGE_KEY) === "true") return void setShowHowToPlayButton(true);
    const openTimer = window.setTimeout(() => openHowToPlay(0), 0);
    return () => window.clearTimeout(openTimer);
  }, [error, loading]);

  const isComplete = roundCount > 0 && completedRound >= roundCount;
  const msLeft = roundDeadlineIso && clockNow ? Date.parse(roundDeadlineIso) - clockNow : null;
  const lockWindowExpired = msLeft !== null && msLeft <= 0;

  useEffect(() => {
    if (!isHost || loading || adminBusy || isComplete || orchestrationSource !== "shared" || roundStatus !== "open" || !lockWindowExpired) return;
    const roundKey = sessionId + ":" + nextRound;
    if (autoCloseAttemptKey === roundKey) return;
    void closeRoundByHost(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminBusy, autoCloseAttemptKey, isComplete, isHost, loading, lockWindowExpired, nextRound, orchestrationSource, roundStatus, sessionId]);

  async function autoCloseRoundWithAutolock(closeIso: string): Promise<AutoCloseSummary> {
    const { data: roundData, error: roundErr } = await supabase.from("session_rounds").select("deadline_at,news_payload").eq("session_id", sessionId).eq("round_number", nextRound).maybeSingle();
    if (roundErr && !isMissingTableError(roundErr.message)) throw roundErr;

    const roundRow = (roundData as SessionRoundRow | null) ?? null;
    const deadlineIso = roundRow?.deadline_at ?? roundDeadlineIso ?? closeIso;
    const events = parseRoundEvents(roundRow?.news_payload) ?? (roundShocks.length > 0 ? roundShocks : getRoundConstructionEvents(sessionId, nextRound));
    const { data: teamsData, error: teamsErr } = await supabase.from("teams").select("id,kpi_target").eq("session_id", sessionId);
    if (teamsErr) throw teamsErr;

    const teams = (teamsData ?? []) as SessionTeamRow[];
    let autoLockedTeams = 0;
    let generatedResults = 0;
    let preservedLockedTeams = 0;
    let totalLatePenalty = 0;

    for (const team of teams) {
      const activeTeamId = team.id;
      const { data: decisionData, error: decisionErr } = await supabase.from("decisions").select("focus_cost,focus_quality,focus_stakeholder,focus_speed,risk_appetite,governance_intensity,buffer_percent,vendor_strategy,locked,raw").eq("session_id", sessionId).eq("team_id", activeTeamId).eq("round_number", nextRound).maybeSingle();
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
        const { data: prevDecisionData, error: prevDecisionErr } = await supabase.from("decisions").select("focus_cost,focus_quality,focus_stakeholder,focus_speed,risk_appetite,governance_intensity,buffer_percent,vendor_strategy,locked,raw").eq("session_id", sessionId).eq("team_id", activeTeamId).eq("round_number", nextRound - 1).maybeSingle();
        if (prevDecisionErr) throw prevDecisionErr;
        const prevDecision = (prevDecisionData as DecisionRow | null) ?? null;
        if (prevDecision) {
          decision = buildDecisionFromRow(prevDecision);
          profile = parseDecisionProfile(prevDecision.raw);
          autoLockSource = "carry_forward_prev_round";
        }
      }

      if (!currentDecision || !currentDecision.locked) {
        const { error: autoLockErr } = await supabase.from("decisions").upsert({
          session_id: sessionId,
          team_id: activeTeamId,
          round_number: nextRound,
          ...decision,
          raw: { ...profile, auto_locked: true, auto_lock_source: autoLockSource, auto_locked_by: viewerUserId, auto_locked_at: closeIso, auto_lock_reason: "host_round_close" },
          locked: true,
          submitted_at: closeIso,
        }, { onConflict: "session_id,team_id,round_number" });
        if (autoLockErr) throw autoLockErr;
        autoLockedTeams += 1;
      } else {
        preservedLockedTeams += 1;
      }

      const { data: existingResultData, error: existingResultErr } = await supabase.from("team_results").select("schedule_index").eq("session_id", sessionId).eq("team_id", activeTeamId).eq("round_number", nextRound).maybeSingle();
      if (existingResultErr) throw existingResultErr;
      if (existingResultData) continue;

      let prevResult: RoundResult | null = null;
      let prevProfile: DecisionProfile | null = null;

      if (nextRound > 1) {
        const { data: prevResultData, error: prevResultErr } = await supabase.from("team_results").select("schedule_index,cost_index,cash_closing,quality_score,safety_score,stakeholder_score,claim_entitlement_score,points_earned,penalties,detail").eq("session_id", sessionId).eq("team_id", activeTeamId).eq("round_number", nextRound - 1).maybeSingle();
        if (prevResultErr) throw prevResultErr;
        if (prevResultData) {
          const prevRow = prevResultData as TeamResultFullRow;
          prevResult = { schedule_index: prevRow.schedule_index, cost_index: prevRow.cost_index, cash_closing: prevRow.cash_closing, quality_score: prevRow.quality_score, safety_score: prevRow.safety_score, stakeholder_score: prevRow.stakeholder_score, claim_entitlement_score: prevRow.claim_entitlement_score, points_earned: prevRow.points_earned, penalties: prevRow.penalties, detail: prevRow.detail ?? {} };
        }
        const { data: prevDecisionRawData, error: prevDecisionRawErr } = await supabase.from("decisions").select("raw").eq("session_id", sessionId).eq("team_id", activeTeamId).eq("round_number", nextRound - 1).maybeSingle();
        if (prevDecisionRawErr) throw prevDecisionRawErr;
        prevProfile = parseDecisionProfile((prevDecisionRawData as { raw?: Record<string, unknown> | null } | null)?.raw ?? null);
      }

      const computed = computeRoundResultV2(decision, sessionId + ":" + activeTeamId + ":" + nextRound, { profile, prevResult, prevProfile, events });
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
          auto_lock: { source: autoLockSource, by_user: viewerUserId, at: closeIso, reason: "host_round_close" },
          timeliness: { deadline_at: deadlineIso, submitted_at: closeIso, minutes_late: latePenalty.minutesLate, points_penalty: latePenalty.pointsPenalty, stakeholder_penalty: latePenalty.stakeholderPenalty, extension_mode: latePenalty.extensionMode },
          kpi: { target: kpiTarget, achieved: kpiEval.achieved, metric: kpiEval.metricKey, actual: kpiEval.actual, threshold: kpiEval.threshold, threshold_label: kpiEval.thresholdLabel, base_points: computed.points_earned, multiplied_points: boostedPoints, late_points_penalty: latePenalty.pointsPenalty, final_points: finalPoints, multiplier: kpiEval.achieved ? 4 : 1 },
        },
      };

      const { error: resultErr } = await supabase.from("team_results").upsert({
        session_id: sessionId,
        team_id: activeTeamId,
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
      }, { onConflict: "session_id,team_id,round_number" });
      if (resultErr) throw resultErr;
      generatedResults += 1;
    }

    const { data: scoreRowsData, error: scoreErr } = await supabase.from("team_results").select("team_id,points_earned").eq("session_id", sessionId);
    if (scoreErr) throw scoreErr;
    const totals = new Map<string, number>();
    for (const row of (scoreRowsData ?? []) as TeamScoreRow[]) totals.set(row.team_id, (totals.get(row.team_id) ?? 0) + (row.points_earned ?? 0));
    for (const team of teams) {
      const { error: totalErr } = await supabase.from("teams").update({ total_points: totals.get(team.id) ?? 0 }).eq("id", team.id);
      if (totalErr) throw totalErr;
    }

    setTeamCount(teams.length);
    setLockedTeams(teams.length);
    return { autoLockedTeams, generatedResults, preservedLockedTeams, totalLatePenalty };
  }

  async function openRoundByHost() {
    if (!isHost || !sessionId || !viewerUserId) return;
    setAdminBusy(true);
    setAdminMessage("");
    setError("");
    try {
      const events = roundShocks.length > 0 ? roundShocks : getRoundConstructionEvents(sessionId, nextRound);
      const deadlineIso = new Date(Date.now() + DEFAULT_ROUND_WINDOW_MINUTES * 60_000).toISOString();
      const { error: upErr } = await supabase.from("session_rounds").upsert({ session_id: sessionId, round_number: nextRound, status: "open", deadline_at: deadlineIso, news_payload: events, created_by: viewerUserId, closed_at: null, closed_by: null }, { onConflict: "session_id,round_number" });
      if (upErr) throw upErr;
      const { error: sessErr } = await supabase.from("sessions").update({ status: "in_progress" }).eq("id", sessionId);
      if (sessErr) throw sessErr;
      setStatus("in_progress");
      setRoundStatus("open");
      setRoundDeadlineIso(deadlineIso);
      setRoundShocks(events);
      setOrchestrationSource("shared");
      setAdminMessage(`Round ${nextRound} opened. Teams can now submit decisions.`);
      setLastAutoCloseSummary(null);
      setAutoCloseAttemptKey("");
    } catch (unknownError: unknown) {
      setError(unknownError instanceof Error ? unknownError.message : "Failed to open round");
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
      const { error: roundErr } = await supabase.from("session_rounds").update({ status: "closed", closed_at: nowIso, closed_by: viewerUserId }).eq("session_id", sessionId).eq("round_number", nextRound);
      if (roundErr && !isMissingTableError(roundErr.message)) throw roundErr;

      const updatedRound = Math.max(sessionCurrentRound, nextRound);
      const nextStatus = updatedRound >= roundCount ? "complete" : "in_progress";
      const { error: sessErr } = await supabase.from("sessions").update({ current_round: updatedRound, status: nextStatus }).eq("id", sessionId);
      if (sessErr) throw sessErr;

      setSessionCurrentRound(updatedRound);
      setCompletedRound(updatedRound);
      setStatus(nextStatus);
      setRoundStatus("closed");
      if (updatedRound < roundCount) setNextRound(updatedRound + 1);
      if (teamId) await refreshSessionAnalytics(teamId, updatedRound);

      const summaryText = `Auto-locked ${summary.autoLockedTeams} teams and generated ${summary.generatedResults} results${summary.totalLatePenalty > 0 ? `, applying ${summary.totalLatePenalty} late-penalty points.` : "."}`;
      setAdminMessage(`${autoTriggered ? "Deadline reached. " : ""}Round ${nextRound} closed. ${summaryText}`);
    } catch (unknownError: unknown) {
      setError(unknownError instanceof Error ? unknownError.message : "Failed to close round");
    } finally {
      setAdminBusy(false);
    }
  }

  async function extendDeadlineByHost(minutes = 30) {
    if (!isHost || !sessionId) return;
    setAdminBusy(true);
    setAdminMessage("");
    setError("");
    try {
      const now = Date.now();
      const baseMs = roundDeadlineIso ? Date.parse(roundDeadlineIso) : now;
      const effectiveBase = Number.isFinite(baseMs) ? Math.max(baseMs, now) : now;
      const nextDeadlineIso = new Date(effectiveBase + minutes * 60_000).toISOString();
      const { error: upErr } = await supabase.from("session_rounds").upsert({ session_id: sessionId, round_number: nextRound, status: "open", deadline_at: nextDeadlineIso }, { onConflict: "session_id,round_number" });
      if (upErr) throw upErr;
      setRoundDeadlineIso(nextDeadlineIso);
      setRoundStatus("open");
      setOrchestrationSource("shared");
      setAdminMessage(`Round extended by ${minutes} minutes.`);
    } catch (unknownError: unknown) {
      setError(unknownError instanceof Error ? unknownError.message : "Failed to extend deadline");
    } finally {
      setAdminBusy(false);
    }
  }

  const currentTeamEntry = leaderboard.find((entry) => entry.id === teamId) ?? null;
  const displayRound = isComplete ? Math.max(roundCount, 1) : Math.max(nextRound, 1);
  const activeTimer = roundStatus === "open" && msLeft !== null ? formatClock(msLeft) : "00:00";
  const roundTitle = isComplete ? "Simulation complete" : roundStatus === "open" ? `Round ${displayRound} is Open` : roundStatus === "closed" ? "Round closed - results being calculated" : "Waiting for facilitator to open round";
  const roundSubtitle = isComplete
    ? "All rounds are closed and final standings are now available."
    : roundStatus === "open"
      ? "Decision window is live. Lock your choices before the timer runs out."
      : roundStatus === "closed"
        ? "The facilitator has closed this round. Updated standings will appear as soon as scoring finishes."
        : "The next decision window will begin once the facilitator starts the round.";
  const roundTone = isComplete ? "success" : roundStatus === "open" ? "success" : roundStatus === "closed" ? "neutral" : "warning";
  const metricTone = (value: number | null, threshold: number) => (value === null ? "neutral" : value >= threshold ? "success" : "danger") as "neutral" | "success" | "danger";
  const pointsTone = (value: number | null) => (value === null ? "neutral" : value >= 0 ? "success" : "danger") as "neutral" | "success" | "danger";
  const metricValue = (value: number | null, decimals = 0) => value === null ? "—" : decimals > 0 ? value.toFixed(decimals) : Math.round(value).toString();

  const scenarioHeroImageUrl = getScenarioHeroImageUrl(scenarioName);
  return (
    <RequireAuth>
      <Page>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <Link href="/dashboard" className="text-sm font-semibold text-slate-400 transition hover:text-white">Back to dashboard</Link>
            <span className="text-sm text-slate-500">Session code {code || "—"}</span>
          </div>

          {error ? <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-5 py-4 text-sm font-semibold text-rose-100">{error}</div> : null}

          {loading ? (
            <Card variant="elevated"><CardBody className="space-y-4 p-6"><div className="h-8 w-1/3 animate-pulse rounded bg-white/10" /><div className="h-24 animate-pulse rounded-2xl bg-white/5" /></CardBody></Card>
          ) : (
            <>
              <Card variant="elevated" className="border-slate-800/90 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
                <CardBody className="grid gap-6 p-6 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={scenarioHeroImageUrl}
                          alt={`${scenarioName} thumbnail`}
                          className="h-12 w-16 rounded-xl border border-white/10 object-cover"
                          loading="lazy"
                        />
                        <h1 className="text-heading-2 text-slate-50">{scenarioName}</h1>
                      </div>
                      <Badge tone="neutral">{scenarioClient}</Badge>
                    </div>
                    <div className="mt-2 text-sm text-slate-300">{sessionName || "Simulation session"}</div>
                  </div>
                  <div className="flex min-w-[260px] flex-col items-center gap-4">
                    <div className="text-center">
                      <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-amber-200">Round Progress</div>
                      <div className="mt-2 text-3xl font-black text-slate-50">Round {displayRound} of {Math.max(roundCount, 1)}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      {Array.from({ length: Math.max(roundCount, 1) }, (_, index) => {
                        const roundNumber = index + 1;
                        const complete = roundNumber < displayRound;
                        const current = roundNumber === displayRound;
                        return (
                          <div key={roundNumber} className="flex items-center gap-3">
                            <div className={`h-3.5 w-3.5 rounded-full border ${complete ? "border-amber-300 bg-amber-400" : current ? "border-amber-300 bg-amber-500" : "border-white/20 bg-transparent"}`} />
                            {roundNumber < Math.max(roundCount, 1) ? <div className={`h-[2px] w-10 ${complete ? "bg-amber-400" : "bg-slate-700"}`} /> : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 lg:items-end">
                    <div className="text-heading-3 text-slate-50">{teamName}</div>
                    <Badge tone="info">Rank {currentTeamEntry?.currentRank ?? 1} of {Math.max(teamCount, 1)}</Badge>
                    <div className="text-sm text-slate-300">Primary KPI: {teamKpi}</div>
                  </div>
                </CardBody>
              </Card>

              <Card variant="elevated" className="border-slate-800/90 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
                <CardBody className="space-y-6 p-6">
                  <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <span className={`h-3.5 w-3.5 rounded-full ${roundTone === "success" ? "bg-emerald-400 animate-pulse" : roundTone === "warning" ? "bg-amber-400" : "bg-slate-400"}`} />
                        <span className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-300">Round Status</span>
                      </div>
                      <div>
                        <div className="text-heading-2 text-slate-50">{roundTitle}</div>
                        <p className="mt-3 max-w-3xl text-body text-slate-300">{roundSubtitle}</p>
                      </div>
                    </div>
                    <div className="min-w-[220px] rounded-[24px] border border-amber-400/20 bg-slate-900/90 px-6 py-5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                      <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-amber-200">Countdown</div>
                      <div className="mt-3 text-[2.75rem] font-black tracking-[-0.06em] text-white">{activeTimer}</div>
                      <div className="mt-2 text-sm text-slate-300">{roundStatus === "open" ? "Round closes at the facilitator deadline" : "Timer activates when the round opens"}</div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Link href={`/sessions/${sessionId}/round/${displayRound}`} className="block">
                      <Button className="w-full rounded-2xl border-amber-300/20 bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 hover:from-amber-300 hover:to-orange-400">Enter Round Workspace</Button>
                    </Link>
                    <Link href={`/sessions/${sessionId}/report`} className="block">
                      <Button variant="ghost" className="w-full rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 hover:border-slate-600 hover:bg-slate-800 hover:text-white">View Report</Button>
                    </Link>
                    {showHowToPlayButton ? <Button variant="secondary" onClick={() => openHowToPlay(0)} className="rounded-2xl border-slate-700 bg-slate-900 text-slate-100 hover:border-slate-600 hover:bg-slate-800 hover:text-white">How to Play</Button> : null}
                  </div>
                </CardBody>
              </Card>

              <div className="grid gap-4 md:grid-cols-4">
                <MetricTile label="SPI" value={metricValue(previousMetrics.spi, 2)} helper="Last round schedule index" tone={metricTone(previousMetrics.spi, 1)} />
                <MetricTile label="CPI" value={metricValue(previousMetrics.cpi, 2)} helper="Last round cost index" tone={metricTone(previousMetrics.cpi, 1)} />
                <MetricTile label="Safety" value={metricValue(previousMetrics.safety)} helper="Last round safety score" tone={metricTone(previousMetrics.safety, 85)} />
                <MetricTile label="Points" value={metricValue(previousMetrics.points)} helper="Points earned last round" tone={pointsTone(previousMetrics.points)} />
              </div>

              <div className={`grid gap-6 ${isHost ? "xl:grid-cols-[minmax(0,1fr)_320px]" : ""}`}>
                <Card variant="elevated" className="border-slate-800/90 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
                  <CardBody className="space-y-5 p-6">
                    <div className="flex items-center justify-between">
                      <div><div className="text-[11px] font-bold uppercase tracking-[0.24em] text-amber-200">Leaderboard</div><div className="mt-2 text-heading-3 text-slate-50">Current standings</div></div>
                      <Badge tone="neutral">{teamCount} teams</Badge>
                    </div>
                    <div className="space-y-3">
                      {leaderboard.map((entry) => {
                        const direction = entry.currentRank < entry.previousRank ? "up" : entry.currentRank > entry.previousRank ? "down" : "flat";
                        const isCurrent = entry.id === teamId;
                        return (
                          <div key={entry.id} className={`grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-4 rounded-2xl border px-4 py-4 ${isCurrent ? "border-amber-400/30 border-l-4 border-l-amber-400 bg-amber-400/10" : "border-slate-800 bg-slate-900/70"}`}>
                            <div className="text-2xl font-black text-slate-50">{entry.currentRank}</div>
                            <div className="min-w-0"><div className="truncate text-base font-semibold text-slate-50">{entry.teamName}</div><div className="mt-1 text-sm text-slate-300">{isCurrent ? "Your team" : "Competitor team"}</div></div>
                            <div className="flex flex-col items-end gap-2"><div className="text-lg font-black text-slate-50">{entry.totalPoints}</div><DeltaArrow direction={direction} /></div>
                          </div>
                        );
                      })}
                    </div>
                  </CardBody>
                </Card>

                {isHost ? (
                  <Card variant="elevated" className="border-amber-300/20 bg-gradient-to-br from-amber-500/10 via-slate-950 to-slate-950">
                    <CardBody className="space-y-5 p-6">
                      <div><div className="text-[11px] font-bold uppercase tracking-[0.24em] text-amber-300">Facilitator Controls</div><div className="mt-2 text-heading-3 text-white">Session operations</div><p className="mt-2 text-sm text-slate-300">Keep rounds moving without pulling focus away from the main hub.</p></div>
                      <div className="rounded-2xl border border-amber-300/20 bg-slate-950/50 px-4 py-4 text-sm text-slate-200">{lockedTeams} of {teamCount} teams locked for round {displayRound}</div>
                      <div className="grid gap-3">
                        <Button variant="secondary" onClick={openRoundByHost} disabled={adminBusy || isComplete || roundStatus === "open"} className="rounded-2xl border-amber-300/20 bg-amber-500/10 text-amber-100 hover:border-amber-300/30 hover:bg-amber-500/15">{adminBusy ? "Working..." : "Open Round"}</Button>
                        <Button variant="secondary" onClick={() => void closeRoundByHost()} disabled={adminBusy || isComplete || roundStatus === "closed"} className="rounded-2xl border-white/10 bg-white/5 text-white hover:border-white/20 hover:bg-white/10">{adminBusy ? "Working..." : "Close Round"}</Button>
                        <Button variant="secondary" onClick={() => void extendDeadlineByHost(30)} disabled={adminBusy || isComplete || roundStatus !== "open"} className="rounded-2xl border-white/10 bg-white/5 text-white hover:border-white/20 hover:bg-white/10">{adminBusy ? "Working..." : "Extend (30 min)"}</Button>
                      </div>
                      {adminMessage ? <div className="rounded-2xl border border-amber-300/20 bg-slate-950/60 px-4 py-3 text-sm text-amber-100">{adminMessage}</div> : null}
                      {lastAutoCloseSummary ? <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">Auto-close summary: {lastAutoCloseSummary.generatedResults} results generated, {lastAutoCloseSummary.autoLockedTeams} teams auto-locked.</div> : null}
                    </CardBody>
                  </Card>
                ) : null}
              </div>
            </>
          )}
        </div>
      </Page>
    </RequireAuth>
  );
}
