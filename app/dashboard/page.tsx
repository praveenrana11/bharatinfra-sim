"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { Page, PageTitle, PageSubTitle } from "@/components/ui/Page";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Label } from "@/components/ui/Label";
import { Input } from "@/components/ui/Input";

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

export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [email, setEmail] = useState<string>("");

  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [mySessions, setMySessions] = useState<Array<{ session: SessionRow; team: TeamRow }>>([]);

  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string>("");

  const [scenarioId, setScenarioId] = useState<string>("");
  const [sessionName, setSessionName] = useState<string>("");
  const [roundCount, setRoundCount] = useState<number>(4);
  const [joinCode, setJoinCode] = useState<string>("");

  async function loadAll() {
    setError("");
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) return;

    setEmail(userData.user.email ?? "");

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

    const sessionRows = (sessions ?? []) as SessionRow[];
    const byId = new Map<string, SessionRow>(sessionRows.map((row) => [row.id, row]));

    const merged = teamRows
      .map((team) => {
        const session = byId.get(team.session_id);
        if (!session) return null;
        return { session, team };
      })
      .filter(Boolean) as Array<{ session: SessionRow; team: TeamRow }>;

    setMySessions(merged);
  }

  useEffect(() => {
    loadAll();
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
      if (!code) throw new Error("Enter a session code (e.g., BI-8F2KQZ)");

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

  const activeMissions = mySessions.filter((m) => !isSessionCompleted(m.session.status));
  const sortedLeaderboard = [...mySessions].sort((a, b) => b.team.total_points - a.team.total_points);

  return (
    <RequireAuth>
      <Page>
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <PageTitle>The Arena</PageTitle>
            <PageSubTitle>Operative: {email || "-"}</PageSubTitle>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex gap-4">
              <div className="flex flex-col items-center justify-center rounded-lg border border-white/10 bg-slate-900/50 px-6 py-2">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Total XP</span>
                <span className="text-xl font-black text-blue-400">
                  {mySessions.reduce((acc, curr) => acc + curr.team.total_points, 0)}
                </span>
              </div>
              <div className="flex flex-col items-center justify-center rounded-lg border border-white/10 bg-slate-900/50 px-6 py-2">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Global Rank</span>
                <span className="text-xl font-black text-emerald-400">#42</span>
              </div>
            </div>
          </div>
        </div>

        {error ? (
          <Alert variant="error" className="mt-6">
            {error}
          </Alert>
        ) : null}

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* LEFT COL: ACTIVE MISSIONS & JOIN */}
          <div className="space-y-6 lg:col-span-8">
            <Card>
              <CardHeader title="Active Missions" subtitle="Missions requiring your immediate strategic input." />
              <CardBody className="space-y-4">
                {activeMissions.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/50 p-8 text-center text-sm text-slate-500">
                    No active missions. Join or create one below.
                  </div>
                ) : (
                  activeMissions.map(({ session, team }) => (
                    <div
                      key={`${session.id}-${team.id}`}
                      className="group relative flex flex-col justify-between gap-4 rounded-xl border border-slate-700 bg-slate-900/40 p-5 transition-all hover:border-blue-500/50 hover:bg-slate-800/60 sm:flex-row sm:items-center"
                    >
                      <div>
                        <div className="flex items-center gap-3">
                          <div className="h-3 w-3 animate-pulse rounded-full bg-blue-500" />
                          <h3 className="text-lg font-bold text-white">{session.name ?? "Classified Mission"}</h3>
                          <span
                            className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${
                              team.identity_completed
                                ? "border border-emerald-400/25 bg-emerald-500/10 text-emerald-200"
                                : "border border-amber-400/25 bg-amber-500/10 text-amber-200"
                            }`}
                          >
                            {team.identity_completed ? "Ready" : "Setup Pending"}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center gap-4 text-xs font-medium text-slate-400">
                          <span className="flex items-center gap-1">
                            <span className="text-slate-500">CODE:</span> <span className="font-mono text-blue-300">{session.code}</span>
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="text-slate-500">PHASE:</span> <span className="text-emerald-400">{session.current_round}/{session.round_count}</span>
                          </span>
                        </div>
                      </div>

                      <Link href={`/sessions/${session.id}`} className="shrink-0">
                        <Button className="w-full sm:w-auto text-xs shadow-blue-500/20">RESUME MISSION</Button>
                      </Link>
                    </div>
                  ))
                )}
              </CardBody>
            </Card>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <Card>
                <CardHeader title="Join by Code" subtitle="Enter a code from your Game Master." />
                <CardBody className="space-y-4">
                  <div>
                    <Label htmlFor="joinCode" className="text-slate-400">Session Code</Label>
                    <Input
                      id="joinCode"
                      placeholder="BI-XXXXXX"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value)}
                      className="font-mono uppercase"
                    />
                  </div>
                  <Button variant="secondary" onClick={handleJoinByCode} disabled={joining} className="w-full">
                    {joining ? "Joining..." : "Join Mission"}
                  </Button>
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="Create Mission" subtitle="Host a new simulation for your team." />
                <CardBody className="space-y-4">
                  <div>
                    <Label htmlFor="sessionName" className="text-slate-400">Session Name</Label>
                    <Input
                      id="sessionName"
                      placeholder="IIM Kozhikode Batch 2025 - Module 3"
                      value={sessionName}
                      onChange={(e) => setSessionName(e.target.value)}
                    />
                    <div className="mt-2 text-xs text-slate-500">
                      Use a clear cohort or workshop name so participants can spot the right session quickly.
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="scenario" className="text-slate-400">Scenario</Label>
                    <select
                      id="scenario"
                      className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm text-white shadow-inner focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      value={scenarioId}
                      onChange={(e) => setScenarioId(e.target.value)}
                    >
                      {scenarios.map((scenario) => (
                        <option key={scenario.id} value={scenario.id}>
                          {scenario.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button variant="ghost" onClick={handleCreateSession} disabled={creating} className="w-full border border-slate-700">
                    {creating ? "Creating..." : "Create Host Session"}
                  </Button>
                </CardBody>
              </Card>
            </div>
          </div>

          {/* RIGHT COL: LEADERBOARD */}
          <div className="lg:col-span-4">
            <Card className="h-full">
              <CardHeader title="Global Leaderboard" subtitle="Top performers across your network." />
              <CardBody className="space-y-2">
                {sortedLeaderboard.length === 0 ? (
                  <div className="text-sm text-slate-500 text-center py-6">No ranked data available.</div>
                ) : (
                  sortedLeaderboard.map(({ session, team }, index) => (
                    <div key={`${session.id}-${team.id}`} className="flex flex-col gap-1 rounded-lg border border-white/5 bg-slate-900/30 p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${index === 0 ? 'bg-amber-500/20 text-amber-400' : index === 1 ? 'bg-slate-300/20 text-slate-300' : index === 2 ? 'bg-orange-700/20 text-orange-400' : 'bg-slate-800 text-slate-500'}`}>
                            {index + 1}
                          </span>
                          <span className="font-semibold text-white text-sm">{team.team_name}</span>
                        </div>
                        <span className="font-mono text-sm font-bold text-blue-400">{team.total_points}</span>
                      </div>
                      <div className="ml-8 text-[10px] uppercase tracking-wider text-slate-500 truncate">
                        {session.name}
                      </div>
                    </div>
                  ))
                )}
              </CardBody>
            </Card>
          </div>
        </div>
      </Page>
    </RequireAuth>
  );
}
