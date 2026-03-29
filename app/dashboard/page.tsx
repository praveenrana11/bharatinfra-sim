"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { Page } from "@/components/ui/Page";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Label } from "@/components/ui/Label";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { MetricTile } from "@/components/ui/MetricTile";

type Scenario = { id: string; name: string; description: string | null };
type SessionRow = {
  id: string;
  code: string;
  name: string | null;
  status: string;
  current_round: number;
  round_count: number;
};
type MembershipRow = { team_id: string };
type TeamRow = {
  id: string;
  session_id: string;
  team_name: string;
  total_points: number;
  identity_completed: boolean;
};

type SessionCardRow = {
  session: SessionRow;
  team: TeamRow;
  teamCount: number;
};

function isSessionCompleted(status: string | null | undefined) {
  const normalized = status?.toLowerCase();
  return normalized === "complete" || normalized === "completed";
}

function makeSessionCode() {
  const part = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `BI-${part}`;
}

function makePendingTeamName(email: string | null | undefined) {
  const localPart = email?.split("@")[0]?.trim();
  if (!localPart) return "Identity Setup Pending";
  return `${localPart} Team`;
}

function toDisplayName(value: string) {
  return value
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function resolveFirstName(email: string | null | undefined, userMeta: Record<string, unknown> | undefined) {
  const firstName =
    (typeof userMeta?.first_name === "string" && userMeta.first_name) ||
    (typeof userMeta?.name === "string" && userMeta.name.split(" ")[0]) ||
    (typeof userMeta?.full_name === "string" && userMeta.full_name.split(" ")[0]) ||
    email?.split("@")[0] ||
    "Builder";

  return toDisplayName(firstName);
}

function formatSessionStatus(status: string) {
  if (status === "in_progress") return "In Progress";
  if (status === "pending") return "Pending";
  if (status === "complete" || status === "completed") return "Completed";
  return toDisplayName(status);
}

function getSessionStatusTone(status: string) {
  if (status === "in_progress") return "info" as const;
  if (status === "pending") return "warning" as const;
  if (status === "complete" || status === "completed") return "success" as const;
  return "neutral" as const;
}

function DashboardModal({
  open,
  title,
  description,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-[28px] border border-white/10 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-950 shadow-[0_35px_120px_rgba(15,23,42,0.45)]">
        <div className="flex items-start justify-between border-b border-white/10 px-6 py-5">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-amber-300">Session Workspace</div>
            <h2 className="mt-2 text-2xl font-black text-white">{title}</h2>
            <p className="mt-2 text-sm text-slate-300">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-full border border-white/10 p-2 text-slate-400 transition hover:border-white/20 hover:text-white"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-6">{children}</div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [firstName, setFirstName] = useState("Builder");
  const [email, setEmail] = useState("");
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [mySessions, setMySessions] = useState<SessionCardRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const [scenarioId, setScenarioId] = useState("");
  const [sessionName, setSessionName] = useState("");
  const [roundCount] = useState(4);
  const [joinCode, setJoinCode] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

  async function loadAll() {
    setError("");
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) return;

    setEmail(userData.user.email ?? "");
    setFirstName(resolveFirstName(userData.user.email, userData.user.user_metadata));

    const { data: scenarioData, error: scenarioErr } = await supabase
      .from("scenarios")
      .select("id,name,description")
      .order("created_at", { ascending: false });

    if (scenarioErr) setError(scenarioErr.message);
    const scenarioRows = (scenarioData ?? []) as Scenario[];
    setScenarios(scenarioRows);
    if (!scenarioId && scenarioRows[0]?.id) setScenarioId(scenarioRows[0].id);

    const { data: memberships, error: membershipErr } = await supabase
      .from("team_memberships")
      .select("team_id")
      .eq("user_id", userData.user.id);

    if (membershipErr) {
      setError(membershipErr.message);
      setMySessions([]);
      return;
    }

    const membershipRows = (memberships ?? []) as MembershipRow[];
    const teamIds = membershipRows.map((row) => row.team_id);

    if (teamIds.length === 0) {
      setMySessions([]);
      return;
    }

    const { data: teams, error: teamErr } = await supabase
      .from("teams")
      .select("id,session_id,team_name,total_points,identity_completed")
      .in("id", teamIds);

    if (teamErr) {
      setError(teamErr.message);
      setMySessions([]);
      return;
    }

    const teamRows = (teams ?? []) as TeamRow[];
    const sessionIds = Array.from(new Set(teamRows.map((row) => row.session_id)));

    const { data: sessions, error: sessionErr } = await supabase
      .from("sessions")
      .select("id,code,name,status,current_round,round_count")
      .in("id", sessionIds);

    if (sessionErr) {
      setError(sessionErr.message);
      setMySessions([]);
      return;
    }

    const { data: allSessionTeams, error: sessionTeamsErr } = await supabase
      .from("teams")
      .select("session_id")
      .in("session_id", sessionIds);

    if (sessionTeamsErr) {
      setError(sessionTeamsErr.message);
      setMySessions([]);
      return;
    }

    const sessionRows = (sessions ?? []) as SessionRow[];
    const byId = new Map<string, SessionRow>(sessionRows.map((row) => [row.id, row]));
    const sessionCounts = new Map<string, number>();

    for (const row of (allSessionTeams ?? []) as Array<{ session_id: string }>) {
      sessionCounts.set(row.session_id, (sessionCounts.get(row.session_id) ?? 0) + 1);
    }

    const merged = teamRows
      .map((team) => {
        const session = byId.get(team.session_id);
        if (!session) return null;

        return {
          session,
          team,
          teamCount: sessionCounts.get(team.session_id) ?? 1,
        };
      })
      .filter(Boolean) as SessionCardRow[];

    merged.sort((left, right) => {
      const leftIsPending = left.team.identity_completed ? 1 : 0;
      const rightIsPending = right.team.identity_completed ? 1 : 0;
      if (leftIsPending !== rightIsPending) return rightIsPending - leftIsPending;
      return (left.session.name ?? "").localeCompare(right.session.name ?? "");
    });

    setMySessions(merged);
  }

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreateSession() {
    setError("");
    setCreating(true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        router.replace("/login");
        return;
      }

      if (!scenarioId) throw new Error("No scenario found. Seed scenarios in Supabase first.");

      const trimmedSessionName = sessionName.trim();
      if (!trimmedSessionName) {
        throw new Error("Enter a session name before creating the session.");
      }

      const code = makeSessionCode();
      const pendingTeamName = makePendingTeamName(user.email);

      const { data: session, error: sessionErr } = await supabase
        .from("sessions")
        .insert({
          scenario_id: scenarioId,
          code,
          name: trimmedSessionName,
          status: "pending",
          round_count: roundCount,
          current_round: 0,
          created_by: user.id,
        })
        .select("id,code")
        .single();

      if (sessionErr) throw sessionErr;

      const { data: team, error: teamErr } = await supabase
        .from("teams")
        .insert({
          session_id: session.id,
          team_name: pendingTeamName,
        })
        .select("id")
        .single();

      if (teamErr) throw teamErr;

      const { error: membershipErr } = await supabase.from("team_memberships").insert({
        team_id: team.id,
        user_id: user.id,
        team_role: "CEO",
        is_team_lead: true,
      });

      if (membershipErr) throw membershipErr;

      router.push(`/sessions/${session.id}`);
    } catch (unknownError: unknown) {
      const message = unknownError instanceof Error ? unknownError.message : "Failed to create session";
      setError(message);
    } finally {
      setCreating(false);
    }
  }

  async function handleJoinByCode() {
    setError("");
    setJoining(true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        router.replace("/login");
        return;
      }

      const code = joinCode.trim().toUpperCase();
      if (!code) throw new Error("Enter a session code (for example BI-8F2KQZ).");

      const { data: session, error: sessionErr } = await supabase
        .from("sessions")
        .select("id,code,name,status")
        .eq("code", code)
        .single();

      if (sessionErr) throw sessionErr;

      const teamName = makePendingTeamName(user.email);

      const { data: team, error: teamErr } = await supabase
        .from("teams")
        .insert({ session_id: session.id, team_name: teamName })
        .select("id")
        .single();

      if (teamErr) throw teamErr;

      const { error: membershipErr } = await supabase.from("team_memberships").insert({
        team_id: team.id,
        user_id: user.id,
        team_role: "CEO",
        is_team_lead: true,
      });

      if (membershipErr) throw membershipErr;

      router.push(`/sessions/${session.id}`);
    } catch (unknownError: unknown) {
      const message = unknownError instanceof Error ? unknownError.message : "Failed to join session";
      setError(message);
    } finally {
      setJoining(false);
    }
  }

  const activeSessions = mySessions.filter((entry) => !isSessionCompleted(entry.session.status));

  return (
    <RequireAuth>
      <Page>
        <div className="space-y-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-heading-1 text-white">Welcome back, {firstName}</h1>
              <p className="text-body mt-3 text-brand-muted">Your active simulation sessions</p>
              <button
                type="button"
                onClick={() => setShowJoinModal(true)}
                className="mt-4 text-sm font-semibold text-amber-300 transition hover:text-amber-200"
              >
                Join with a session code
              </button>
            </div>

            <Button
              size="lg"
              onClick={() => setShowCreateModal(true)}
              className="rounded-2xl border-amber-300/20 bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 shadow-[0_14px_30px_rgba(249,115,22,0.28)] hover:from-amber-300 hover:to-orange-400"
            >
              Create New Session
            </Button>
          </div>

          {error ? <Alert variant="error">{error}</Alert> : null}

          {activeSessions.length === 0 ? (
            <Card variant="elevated" className="overflow-hidden">
              <CardBody className="flex min-h-[420px] flex-col items-center justify-center px-6 py-12 text-center">
                <div className="text-7xl leading-none">🏗️</div>
                <h2 className="mt-8 text-heading-2 text-white">No active sessions</h2>
                <p className="mt-4 max-w-xl text-body text-brand-muted">
                  Ask your facilitator for a session code, or create one to get started.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Button
                    variant="secondary"
                    size="lg"
                    onClick={() => setShowJoinModal(true)}
                    className="rounded-2xl border-white/10 bg-white/5 px-6 text-white hover:border-white/20 hover:bg-white/10"
                  >
                    Join Session
                  </Button>
                  <Button
                    size="lg"
                    onClick={() => setShowCreateModal(true)}
                    className="rounded-2xl border-amber-300/20 bg-gradient-to-r from-amber-400 to-orange-500 px-6 text-slate-950 hover:from-amber-300 hover:to-orange-400"
                  >
                    Create Session
                  </Button>
                </div>
              </CardBody>
            </Card>
          ) : (
            <div className="grid gap-6 xl:grid-cols-2">
              {activeSessions.map(({ session, team, teamCount }) => (
                <Card
                  key={`${session.id}-${team.id}`}
                  variant="elevated"
                  className="hover:-translate-y-1 hover:shadow-lg"
                >
                  <CardBody className="space-y-6 p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h2 className="text-heading-3 text-white">{session.name ?? "Untitled Session"}</h2>
                        <div className="mt-2 text-sm text-slate-400">Code: {session.code}</div>
                      </div>

                      <Badge tone={getSessionStatusTone(session.status)}>{formatSessionStatus(session.status)}</Badge>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <MetricTile
                        label="Current Round"
                        value={`Round ${Math.max(session.current_round, 1)} of ${Math.max(session.round_count, 1)}`}
                        helper={session.status === "pending" ? "Awaiting facilitator kickoff" : "Live simulation progress"}
                        tone="info"
                        valueClassName="text-base font-black tracking-tight text-white"
                      />
                      <MetricTile
                        label="Teams"
                        value={String(teamCount)}
                        helper="Registered teams"
                        tone="neutral"
                      />
                      <MetricTile
                        label="Your Team"
                        value={
                          <Badge tone={team.identity_completed ? "success" : "warning"}>
                            {team.identity_completed ? "Ready" : "Setup Pending"}
                          </Badge>
                        }
                        helper={team.team_name}
                        tone={team.identity_completed ? "success" : "warning"}
                        valueClassName=""
                      />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Link href={`/sessions/${session.id}`} className="block">
                        <Button className="w-full rounded-2xl border-amber-300/20 bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 hover:from-amber-300 hover:to-orange-400">
                          Enter Session
                        </Button>
                      </Link>
                      <Link href={`/sessions/${session.id}/report`} className="block">
                        <Button
                          variant="ghost"
                          className="w-full rounded-2xl border border-white/10 bg-white/5 text-white hover:border-white/20 hover:bg-white/10"
                        >
                          View Report
                        </Button>
                      </Link>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </div>

        <DashboardModal
          open={showCreateModal}
          title="Create session"
          description="Set the session name and scenario, then we’ll create the host session and take you straight into the hub."
          onClose={() => setShowCreateModal(false)}
        >
          <div className="space-y-5">
            <div>
              <Label htmlFor="sessionName">Session Name</Label>
              <Input
                id="sessionName"
                placeholder="IIM Kozhikode Batch 2025 - Module 3"
                value={sessionName}
                onChange={(event) => setSessionName(event.target.value)}
                className="mt-3 h-12 rounded-2xl border-white/10 bg-white/5 px-4 text-base"
              />
            </div>

            <div>
              <Label htmlFor="scenario">Scenario</Label>
              <select
                id="scenario"
                value={scenarioId}
                onChange={(event) => setScenarioId(event.target.value)}
                className="mt-3 h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-base text-white outline-none transition focus:border-amber-400/40 focus:bg-white/10"
              >
                {scenarios.map((scenario) => (
                  <option key={scenario.id} value={scenario.id} className="bg-slate-900">
                    {scenario.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:justify-end">
              <Button
                variant="secondary"
                onClick={() => setShowCreateModal(false)}
                className="rounded-2xl border-white/10 bg-white/5 text-white hover:border-white/20 hover:bg-white/10"
              >
                Cancel
              </Button>
              <Button
                onClick={() => void handleCreateSession()}
                disabled={creating}
                className="rounded-2xl border-amber-300/20 bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 hover:from-amber-300 hover:to-orange-400"
              >
                {creating ? "Creating..." : "Create"}
              </Button>
            </div>
          </div>
        </DashboardModal>

        <DashboardModal
          open={showJoinModal}
          title="Join session"
          description="Enter the session code shared by your facilitator and we’ll add you to the simulation."
          onClose={() => setShowJoinModal(false)}
        >
          <div className="space-y-5">
            <div>
              <Label htmlFor="joinCode">Session Code</Label>
              <Input
                id="joinCode"
                placeholder="BI-XXXXXX"
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value)}
                className="mt-3 h-12 rounded-2xl border-white/10 bg-white/5 px-4 text-base uppercase"
              />
            </div>

            <div className="flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:justify-end">
              <Button
                variant="secondary"
                onClick={() => setShowJoinModal(false)}
                className="rounded-2xl border-white/10 bg-white/5 text-white hover:border-white/20 hover:bg-white/10"
              >
                Cancel
              </Button>
              <Button
                onClick={() => void handleJoinByCode()}
                disabled={joining}
                className="rounded-2xl border-amber-300/20 bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 hover:from-amber-300 hover:to-orange-400"
              >
                {joining ? "Joining..." : "Join"}
              </Button>
            </div>
          </div>
        </DashboardModal>
      </Page>
    </RequireAuth>
  );
}
