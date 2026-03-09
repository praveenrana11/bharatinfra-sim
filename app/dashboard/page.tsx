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
type TeamRow = { id: string; session_id: string; team_name: string; total_points: number };

function makeSessionCode() {
  const part = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `BI-${part}`;
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
  const [sessionName, setSessionName] = useState<string>("My BharatInfra Session");
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
      .select("id,session_id,team_name,total_points")
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

      const code = makeSessionCode();

      const { data: session, error: sessionErr } = await supabase
        .from("sessions")
        .insert({
          scenario_id: scenarioId,
          code,
          name: sessionName,
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
          team_name: "Team 1",
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

      const teamName = email ? `Team-${email.split("@")[0]}` : "New Team";

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

  return (
    <RequireAuth>
      <Page>
        <div className="flex items-start justify-between gap-4">
          <div>
            <PageTitle>Dashboard</PageTitle>
            <PageSubTitle>Signed in as: {email || "-"}</PageSubTitle>
          </div>

          <div className="flex items-center gap-3">
            <Link className="text-sm text-slate-600 underline hover:text-slate-900" href="/admin">
              Facilitator Console
            </Link>
            <Link className="text-sm text-slate-600 underline hover:text-slate-900" href="/">
              Home
            </Link>
          </div>
        </div>

        {error ? (
          <Alert variant="error" className="mt-4">
            {error}
          </Alert>
        ) : null}

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <Card>
              <CardHeader title="Create a new session" subtitle="Start a fresh simulation for your team." />
              <CardBody className="space-y-4">
                <div>
                  <Label htmlFor="scenario">Scenario</Label>
                  <select
                    id="scenario"
                    className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
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

                <div>
                  <Label htmlFor="sessionName">Session name</Label>
                  <Input id="sessionName" value={sessionName} onChange={(e) => setSessionName(e.target.value)} />
                </div>

                <div>
                  <Label htmlFor="roundCount">Round count</Label>
                  <Input
                    id="roundCount"
                    type="number"
                    min={1}
                    max={12}
                    value={roundCount}
                    onChange={(e) => setRoundCount(Number(e.target.value))}
                  />
                </div>

                <Button onClick={handleCreateSession} disabled={creating}>
                  {creating ? "Creating..." : "Create session"}
                </Button>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Join by session code" subtitle="Enter a code shared by the session host." />
              <CardBody className="space-y-4">
                <div>
                  <Label htmlFor="joinCode">Session code</Label>
                  <Input
                    id="joinCode"
                    placeholder="BI-XXXXXX"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                  />
                </div>

                <Button variant="secondary" onClick={handleJoinByCode} disabled={joining}>
                  {joining ? "Joining..." : "Join"}
                </Button>
              </CardBody>
            </Card>
          </div>

          <Card className="h-fit">
            <CardHeader
              title="My sessions"
              subtitle={mySessions.length ? "Your active / joined sessions." : "No sessions yet. Create or join one."}
            />
            <CardBody className="space-y-3">
              {mySessions.length === 0 ? (
                <div className="text-sm text-slate-600">Nothing to show yet.</div>
              ) : (
                mySessions.map(({ session, team }) => (
                  <div key={`${session.id}-${team.id}`} className="rounded-md border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-900">{session.name ?? "Untitled session"}</div>
                        <div className="mt-1 text-sm text-slate-600">
                          Code: <span className="font-mono">{session.code}</span> | Status: {session.status} | Round{" "}
                          {session.current_round}/{session.round_count}
                        </div>
                        <div className="mt-1 text-sm text-slate-600">
                          Team: <span className="font-mono">{team.team_name}</span> | Points:{" "}
                          <span className="font-semibold text-slate-900">{team.total_points}</span>
                        </div>
                      </div>

                      <Link className="text-sm underline text-slate-700 hover:text-slate-900" href={`/sessions/${session.id}`}>
                        Open
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        </div>
      </Page>
    </RequireAuth>
  );
}
