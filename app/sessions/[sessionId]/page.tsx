"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ConstructionEvent, getRoundConstructionEvents } from "@/lib/constructionNews";

type RouteParams = { sessionId?: string };
type MembershipRow = { team_id: string };
type TeamRow = { id: string; team_name: string; session_id: string; total_points: number | null; kpi_target: string | null };

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
    } catch (unknownError: unknown) {
      const message = unknownError instanceof Error ? unknownError.message : "Failed to open round";
      setError(message);
    } finally {
      setAdminBusy(false);
    }
  }

  async function closeRoundByHost() {
    if (!isHost || !sessionId || !viewerUserId) return;

    setAdminBusy(true);
    setAdminMessage("");
    setError("");

    try {
      const nowIso = new Date().toISOString();

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

      setAdminMessage(`Round ${nextRound} closed.`);
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
                        <Button variant="secondary" onClick={closeRoundByHost} disabled={adminBusy || isComplete}>
                          {adminBusy ? "Working..." : `Close Round ${nextRound}`}
                        </Button>
                        <Button variant="secondary" onClick={() => extendDeadlineByHost(10)} disabled={adminBusy || isComplete}>
                          +10 min deadline
                        </Button>
                      </div>
                      <p className="text-xs text-slate-600">
                        Host-only: opens/closes round access for all teams and controls lock deadline.
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-slate-600">Waiting for facilitator to open/close rounds.</p>
                  )}

                  {adminMessage ? (
                    <div className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700">{adminMessage}</div>
                  ) : null}
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Next actions" subtitle="Move step-by-step through each round." />
              <CardBody className="flex flex-wrap gap-3">
                {!isComplete ? (
                  roundStatus === "open" || isHost ? (
                    <Link href={`/sessions/${sessionId}/round/${nextRound}`}>
                      <Button>Go to Round {nextRound} Decisions</Button>
                    </Link>
                  ) : (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      Round is not opened by facilitator yet.
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









