"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Page } from "@/components/ui/Page";
import { getScenarioHeroImageUrl } from "@/lib/simVisuals";

type RouteParams = { sessionId?: string };
type MembershipRow = { team_id: string };
type IdentityProfile = { company_name?: string | null; [key: string]: unknown };
type SessionRow = { id: string; name: string | null; code: string | null; status: string | null; round_count: number | null };
type TeamRow = { id: string; team_name: string; total_points: number | null; identity_profile: IdentityProfile | null; scenario_id: string | null };
type ScenarioRow = { id: string; name: string | null; client: string | null; base_budget_cr: number | null };
type TeamResultRow = {
  team_id: string;
  round_number: number;
  schedule_index: number | null;
  cost_index: number | null;
  quality_score: number | null;
  safety_score: number | null;
  stakeholder_score: number | null;
  claim_entitlement_score: number | null;
  points_earned: number | null;
  penalties: number | null;
  detail: Record<string, unknown> | null;
};
type TeamAggregate = {
  id: string;
  teamName: string;
  companyName: string;
  totalPoints: number;
  rank: number;
  avgSpi: number;
  avgCpi: number;
  avgSafety: number;
  avgStakeholder: number;
  avgQuality: number;
  avgClaims: number;
  incidentFreeRounds: number;
  roundsPlayed: number;
  strongestMetric: string;
  resultRows: TeamResultRow[];
};

const PLANNED_DAYS_PER_ROUND = 30;

const isSessionCompleted = (status: string | null | undefined) => ["complete", "completed"].includes((status ?? "").toLowerCase());
const toRecord = (value: unknown) => (value && typeof value === "object" ? (value as Record<string, unknown>) : null);
const average = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
const numberFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const int = (value: number) => numberFormat.format(Math.round(value));
const fixed = (value: number, digits = 2) => value.toFixed(digits);
const cr = (value: number) => `Rs ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: value % 1 === 0 ? 0 : 2 }).format(value)}Cr`;
const initials = (value: string) => value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
const stakeholderLabel = (value: number) => (value >= 85 ? "Excellent" : value >= 70 ? "Good" : value >= 60 ? "Poor" : "Critical");
const pillTone = (value: number, threshold: number) => (value >= threshold ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100" : value >= threshold * 0.92 ? "border-amber-300/20 bg-amber-400/10 text-amber-100" : "border-rose-400/20 bg-rose-500/10 text-rose-100");
const safetyTone = (value: number) => (value >= 85 ? "emerald" : value >= 75 ? "amber" : "rose");

function readNumber(source: Record<string, unknown> | null, ...keys: string[]) {
  if (!source) return null;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function readLdCumulative(detail: Record<string, unknown> | null) {
  return readNumber(detail, "ld_cumulative", "ldCumulative", "ld_cumulative_cr", "ldCumulativeCr") ?? readNumber(toRecord(detail?.timeliness), "ld_cumulative", "ldCumulative", "ld_cumulative_cr", "ldCumulativeCr") ?? 0;
}

function strongestMetric(avgSpi: number, avgCpi: number, avgSafety: number, avgStakeholder: number, avgQuality: number, avgClaims: number) {
  return [
    { label: `SPI ${fixed(avgSpi)}`, score: avgSpi * 100 },
    { label: `CPI ${fixed(avgCpi)}`, score: avgCpi * 100 },
    { label: `Safety ${int(avgSafety)}`, score: avgSafety },
    { label: `Stakeholder ${int(avgStakeholder)}`, score: avgStakeholder },
    { label: `Quality ${int(avgQuality)}`, score: avgQuality },
    { label: `Claims ${int(avgClaims)}`, score: avgClaims },
  ].sort((left, right) => right.score - left.score)[0]?.label ?? "Consistent scoring";
}

export default function SessionDebriefPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseClient(), []);
  const sessionId = (params as RouteParams).sessionId ?? "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [session, setSession] = useState<SessionRow | null>(null);
  const [scenario, setScenario] = useState<ScenarioRow | null>(null);
  const [currentTeam, setCurrentTeam] = useState<TeamRow | null>(null);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [results, setResults] = useState<TeamResultRow[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");

      if (!sessionId) {
        setError("Session id missing in URL.");
        setLoading(false);
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return void router.replace("/login");

      const [{ data: sessionData, error: sessionErr }, { data: membershipData, error: membershipErr }] = await Promise.all([
        supabase.from("sessions").select("id,name,code,status,round_count").eq("id", sessionId).maybeSingle(),
        supabase.from("team_memberships").select("team_id").eq("user_id", user.id),
      ]);
      if (sessionErr) return void (setError(sessionErr.message), setLoading(false));
      if (membershipErr) return void (setError(membershipErr.message), setLoading(false));

      const sessionRow = (sessionData as SessionRow | null) ?? null;
      if (!sessionRow) return void (setError("Session not found."), setLoading(false));
      setSession(sessionRow);

      const teamIds = ((membershipData ?? []) as MembershipRow[]).map((row) => row.team_id);
      if (teamIds.length === 0) return void (setError("You are not assigned to a team in this session."), setLoading(false));

      const { data: myTeamData, error: myTeamErr } = await supabase.from("teams").select("id,team_name,total_points,identity_profile,scenario_id").in("id", teamIds).eq("session_id", sessionId).maybeSingle();
      if (myTeamErr) return void (setError(myTeamErr.message), setLoading(false));

      const myTeam = (myTeamData as TeamRow | null) ?? null;
      if (!myTeam) return void (setError("Your team could not be resolved for this session."), setLoading(false));
      setCurrentTeam(myTeam);

      const [{ data: teamData, error: teamsErr }, { data: resultData, error: resultsErr }, scenarioResponse] = await Promise.all([
        supabase.from("teams").select("id,team_name,total_points,identity_profile,scenario_id").eq("session_id", sessionId),
        supabase.from("team_results").select("team_id,round_number,schedule_index,cost_index,quality_score,safety_score,stakeholder_score,claim_entitlement_score,points_earned,penalties,detail").eq("session_id", sessionId).order("round_number", { ascending: true }).order("team_id", { ascending: true }),
        myTeam.scenario_id ? supabase.from("project_scenarios").select("id,name,client,base_budget_cr").eq("id", myTeam.scenario_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      ]);
      if (teamsErr) return void (setError(teamsErr.message), setLoading(false));
      if (resultsErr) return void (setError(resultsErr.message), setLoading(false));
      if (scenarioResponse.error) return void (setError(scenarioResponse.error.message), setLoading(false));

      setTeams((teamData ?? []) as TeamRow[]);
      setResults((resultData ?? []) as TeamResultRow[]);
      setScenario((scenarioResponse.data as ScenarioRow | null) ?? null);
      setLoading(false);
    })();
  }, [router, sessionId, supabase]);

  const leaderboard = useMemo(() => {
    const resultsByTeam = new Map<string, TeamResultRow[]>();
    for (const row of results) {
      const bucket = resultsByTeam.get(row.team_id) ?? [];
      bucket.push(row);
      resultsByTeam.set(row.team_id, bucket);
    }

    return teams
      .map((team) => {
        const resultRows = [...(resultsByTeam.get(team.id) ?? [])].sort((left, right) => left.round_number - right.round_number);
        const totalPoints = team.total_points ?? resultRows.reduce((sum, row) => sum + (row.points_earned ?? 0), 0);
        const avgSpi = average(resultRows.map((row) => row.schedule_index ?? 0));
        const avgCpi = average(resultRows.map((row) => row.cost_index ?? 0));
        const avgSafety = average(resultRows.map((row) => row.safety_score ?? 0));
        const avgStakeholder = average(resultRows.map((row) => row.stakeholder_score ?? 0));
        const avgQuality = average(resultRows.map((row) => row.quality_score ?? 0));
        const avgClaims = average(resultRows.map((row) => row.claim_entitlement_score ?? 0));
        return {
          id: team.id,
          teamName: team.team_name,
          companyName: typeof team.identity_profile?.company_name === "string" && team.identity_profile.company_name.trim() ? team.identity_profile.company_name : team.team_name,
          totalPoints,
          rank: 0,
          avgSpi,
          avgCpi,
          avgSafety,
          avgStakeholder,
          avgQuality,
          avgClaims,
          incidentFreeRounds: resultRows.filter((row) => (row.safety_score ?? 0) >= 75).length,
          roundsPlayed: resultRows.length,
          strongestMetric: strongestMetric(avgSpi, avgCpi, avgSafety, avgStakeholder, avgQuality, avgClaims),
          resultRows,
        } satisfies TeamAggregate;
      })
      .sort((left, right) => {
        if (right.totalPoints !== left.totalPoints) return right.totalPoints - left.totalPoints;
        if (right.avgSpi !== left.avgSpi) return right.avgSpi - left.avgSpi;
        return left.companyName.localeCompare(right.companyName);
      })
      .map((team, index) => ({ ...team, rank: index + 1 }));
  }, [results, teams]);

  const myTeamSummary = leaderboard.find((team) => team.id === currentTeam?.id) ?? null;
  const myResults = myTeamSummary?.resultRows ?? [];

  const sessionBestPossible = useMemo(() => {
    const bestByRound = new Map<number, number>();
    for (const row of results) {
      const best = bestByRound.get(row.round_number) ?? 0;
      bestByRound.set(row.round_number, Math.max(best, row.points_earned ?? 0));
    }
    return Array.from(bestByRound.values()).reduce((sum, value) => sum + value, 0);
  }, [results]);

  const scheduleDays = myTeamSummary ? Number((((myTeamSummary.avgSpi - 1) * PLANNED_DAYS_PER_ROUND)).toFixed(1)) : 0;
  const budgetVariance = myTeamSummary ? (myTeamSummary.avgCpi >= 1 ? (1 - 1 / myTeamSummary.avgCpi) * 100 : (1 / myTeamSummary.avgCpi - 1) * 100) : 0;
  const ldCumulativeCr = myResults.reduce((sum, row) => sum + readLdCumulative(row.detail), 0);
  const verdictTone = myTeamSummary && myTeamSummary.avgSpi > 0.85 && myTeamSummary.avgCpi > 0.85 ? "success" : "danger";
  const scenarioImageUrl = getScenarioHeroImageUrl(scenario?.name ?? "Project Scenario");
  const weakestMetric = myTeamSummary
    ? [
        { label: "schedule recovery", score: myTeamSummary.avgSpi * 100 },
        { label: "cost discipline", score: myTeamSummary.avgCpi * 100 },
        { label: "safety assurance", score: myTeamSummary.avgSafety },
        { label: "client alignment", score: myTeamSummary.avgStakeholder },
      ].sort((left, right) => left.score - right.score)[0]?.label ?? "execution control"
    : "execution control";

  const narrative = useMemo(() => {
    if (!myTeamSummary) return null;
    const clientName = scenario?.client ?? "The client";
    const budgetCr = scenario?.base_budget_cr ?? 0;
    if (myTeamSummary.avgSpi < 0.85 && ldCumulativeCr > 0) {
      return {
        tone: "danger" as const,
        title: "CONTRACT TERMINATED EARLY",
        body: `${clientName} exercised termination rights due to persistent underperformance. LD of ${cr(ldCumulativeCr)} was enforced.`,
      };
    }
    if (myTeamSummary.avgSpi > 1 && myTeamSummary.avgStakeholder > 75 && myTeamSummary.avgSafety > 75) {
      return {
        tone: "success" as const,
        title: "PREFERRED BIDDER STATUS ACHIEVED",
        body: `${clientName} has shortlisted your company for the next phase. Your consistent delivery and client relations earned preferred bidder status worth ${cr(Number((budgetCr * 1.5).toFixed(2)))}.`,
      };
    }
    if (myTeamSummary.avgSpi > 0.9 && myTeamSummary.avgStakeholder > 65) {
      return {
        tone: "info" as const,
        title: "INVITED TO REBID",
        body: `${clientName} has invited you to bid for the next package. Good overall performance, though some concerns remain on ${weakestMetric}.`,
      };
    }
    return {
      tone: "warning" as const,
      title: "RELATIONSHIP STRAINED",
      body: `${clientName} has not shortlisted your company for the next phase. Repeated delays and ${weakestMetric} damaged the relationship.`,
    };
  }, [ldCumulativeCr, myTeamSummary, scenario?.base_budget_cr, scenario?.client, weakestMetric]);

  const learning = useMemo(() => {
    if (!myTeamSummary) return { good: [] as string[], improve: [] as string[] };
    const strongestRound = [...myResults].sort((left, right) => (right.points_earned ?? 0) - (left.points_earned ?? 0))[0];
    const weakestSpiRound = [...myResults].sort((left, right) => (left.schedule_index ?? 0) - (right.schedule_index ?? 0))[0];
    const weakestCpiRound = [...myResults].sort((left, right) => (left.cost_index ?? 0) - (right.cost_index ?? 0))[0];
    const weakestStakeholderRound = [...myResults].sort((left, right) => (left.stakeholder_score ?? 0) - (right.stakeholder_score ?? 0))[0];

    const good = [
      `Strong safety record - ${myTeamSummary.incidentFreeRounds} of ${myTeamSummary.roundsPlayed} rounds stayed above threshold.`,
      myTeamSummary.avgSpi >= 1 ? `Schedule discipline - SPI averaged ${fixed(myTeamSummary.avgSpi)}, keeping delivery on or ahead of plan.` : "",
      myTeamSummary.avgCpi >= 1 ? `Commercial control - CPI averaged ${fixed(myTeamSummary.avgCpi)}, protecting budget performance.` : "",
      myTeamSummary.avgStakeholder >= 75 ? `Client confidence - Stakeholder score averaged ${int(myTeamSummary.avgStakeholder)} across the project.` : "",
      strongestRound ? `Peak round execution - Round ${strongestRound.round_number} delivered ${int(strongestRound.points_earned ?? 0)} points.` : "",
      `Stayed competitive to the close - Final score reached ${int(myTeamSummary.totalPoints)} points.`,
    ].filter(Boolean).slice(0, 3);

    const improve = [
      myTeamSummary.avgSpi < 1 ? `Schedule recovery - SPI averaged ${fixed(myTeamSummary.avgSpi)}, showing recurring delay pressure.` : "",
      myTeamSummary.avgCpi < 1 ? `Cost control - CPI averaged ${fixed(myTeamSummary.avgCpi)}, indicating budget drift.` : "",
      myTeamSummary.avgStakeholder < 70 ? `Client management - Stakeholder confidence averaged ${int(myTeamSummary.avgStakeholder)}, leaving trust to rebuild.` : "",
      myTeamSummary.incidentFreeRounds < myTeamSummary.roundsPlayed ? `Safety consistency - Only ${myTeamSummary.incidentFreeRounds} rounds cleared the incident-free threshold cleanly.` : "",
      weakestSpiRound ? `Round ${weakestSpiRound.round_number} exposed schedule fragility with SPI ${fixed(weakestSpiRound.schedule_index ?? 0)}.` : "",
      weakestCpiRound ? `Round ${weakestCpiRound.round_number} highlighted commercial strain with CPI ${fixed(weakestCpiRound.cost_index ?? 0)}.` : "",
      weakestStakeholderRound ? `Round ${weakestStakeholderRound.round_number} weakened client sentiment with stakeholder ${int(weakestStakeholderRound.stakeholder_score ?? 0)}.` : "",
      "Earlier corrective action on weak rounds would have protected the final outcome.",
    ].filter(Boolean).slice(0, 3);

    return { good, improve };
  }, [myResults, myTeamSummary]);

  const knowledgeAreas = useMemo(() => {
    if (myResults.length === 0) return [] as string[];
    return [
      "Schedule Management",
      "Cost Management",
      "Risk Management",
      "Quality Management",
      "Stakeholder Management",
      "Procurement Management",
      "Resource Management",
    ];
  }, [myResults]);

  const certificateText = myTeamSummary
    ? `${myTeamSummary.companyName} completed ${scenario?.name ?? "Project Scenario"} for ${scenario?.client ?? "Client"}\nFinal Rank: ${myTeamSummary.rank} of ${leaderboard.length} teams | Total Points: ${int(myTeamSummary.totalPoints)}\nKey Achievement: ${myTeamSummary.strongestMetric}`
    : "";

  return (
    <RequireAuth>
      <Page>
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href={`/sessions/${sessionId}`} className="text-sm font-semibold text-slate-400 transition hover:text-white">
              Back to session
            </Link>
            <div className="text-sm text-slate-500">Session code {session?.code ?? "-"}</div>
          </div>

          {error ? <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-5 py-4 text-sm font-semibold text-rose-100">{error}</div> : null}

          {loading ? (
            <Card variant="elevated">
              <CardBody className="space-y-4 p-6">
                <div className="h-8 w-1/3 animate-pulse rounded bg-white/10" />
                <div className="h-40 animate-pulse rounded-3xl bg-white/5" />
              </CardBody>
            </Card>
          ) : null}

          {!loading && !error && session && !isSessionCompleted(session.status) ? (
            <Card variant="elevated" className="border-amber-300/20 bg-gradient-to-br from-amber-500/10 via-slate-950 to-slate-950">
              <CardBody className="space-y-4 p-6">
                <Badge tone="warning" className="w-fit">Debrief Locked</Badge>
                <div className="text-heading-2 text-slate-50">The post-project debrief unlocks after the final round closes.</div>
                <p className="max-w-2xl text-sm text-slate-300">
                  Finish the session first. Once the session status moves to complete, the full closeout narrative and final leaderboard will appear here.
                </p>
                <Link href={`/sessions/${sessionId}`} className="block w-fit">
                  <Button className="rounded-2xl border-amber-300/20 bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 hover:from-amber-300 hover:to-orange-400">
                    Return to Session Hub
                  </Button>
                </Link>
              </CardBody>
            </Card>
          ) : null}

          {!loading && !error && session && isSessionCompleted(session.status) && myTeamSummary ? (
            <>
              <Card variant="elevated" className="overflow-hidden border-slate-800/90 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
                <CardBody className="grid gap-6 p-0 lg:grid-cols-[1.25fr_0.9fr]">
                  <div className="space-y-6 p-6">
                    <div className="flex flex-wrap items-center gap-3">
                      <Badge tone={verdictTone} className="border-0 px-3 py-1 text-[11px] tracking-[0.22em]">
                        {verdictTone === "success" ? "PROJECT COMPLETE" : "PROJECT DISTRESSED"}
                      </Badge>
                      <Badge tone="neutral">{session.name ?? "Simulation Session"}</Badge>
                    </div>
                    <div className="flex flex-wrap items-start gap-4">
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-lg font-black text-slate-100">
                        {initials(scenario?.client ?? "CL")}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-amber-200">Project Verdict</div>
                        <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] text-slate-50">{scenario?.name ?? "Project Scenario"}</h1>
                        <p className="mt-3 max-w-3xl text-base text-slate-300">
                          Final closeout for {scenario?.client ?? "Client"} after {session.round_count ?? myTeamSummary.roundsPlayed} rounds of schedule, cost, safety, and stakeholder trade-offs.
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                        <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-300">Your Company</div>
                        <div className="mt-3 text-2xl font-black text-slate-50">{myTeamSummary.companyName}</div>
                        <div className="mt-2 text-sm text-slate-300">Final rank {myTeamSummary.rank} of {leaderboard.length}</div>
                      </div>
                      <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                        <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-300">Points Earned</div>
                        <div className="mt-3 text-2xl font-black text-slate-50">
                          {int(myTeamSummary.totalPoints)} / {int(sessionBestPossible || myTeamSummary.totalPoints)}
                        </div>
                        <div className="mt-2 text-sm text-slate-300">Against the best round benchmark achieved in this session.</div>
                      </div>
                      <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                        <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-300">Average SPI / CPI</div>
                        <div className="mt-3 text-2xl font-black text-slate-50">{fixed(myTeamSummary.avgSpi)} / {fixed(myTeamSummary.avgCpi)}</div>
                        <div className="mt-2 text-sm text-slate-300">Project-level schedule and commercial closeout health.</div>
                      </div>
                    </div>
                  </div>
                  <div className="relative min-h-[320px] overflow-hidden border-t border-white/5 bg-slate-950/50 lg:border-l lg:border-t-0">
                    <img src={scenarioImageUrl} alt={`${scenario?.name ?? "Scenario"} visual`} className="absolute inset-0 h-full w-full object-cover opacity-50" />
                    <div className="absolute inset-0 bg-gradient-to-br from-slate-950/70 via-slate-950/30 to-slate-950" />
                    <div className="relative flex h-full flex-col justify-end p-6">
                      <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5 backdrop-blur-sm">
                        <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-amber-200">Closeout Snapshot</div>
                        <div className="mt-3 text-xl font-black text-slate-50">{myTeamSummary.strongestMetric}</div>
                        <p className="mt-2 text-sm text-slate-300">
                          Safety averaged {int(myTeamSummary.avgSafety)}, stakeholder averaged {int(myTeamSummary.avgStakeholder)}, and the team completed {myTeamSummary.roundsPlayed} scored rounds.
                        </p>
                      </div>
                    </div>
                  </div>
                </CardBody>
              </Card>

              <Card variant="elevated" className="border-slate-800/90 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
                <CardBody className="space-y-6 p-6">
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-amber-200">Your Company Performance</div>
                      <div className="mt-2 text-heading-2 text-slate-50">Round-by-round trajectory</div>
                    </div>
                    <div className="text-sm text-slate-300">{myResults.length} rounds scored</div>
                  </div>

                  <div className="overflow-x-auto pb-2">
                    <div className="flex min-w-max items-start">
                      {myResults.map((row, index) => {
                        const safety = row.safety_score ?? 0;
                        const tone = safetyTone(safety);
                        return (
                          <div key={row.round_number} className="flex items-start">
                            <div className="w-[220px] rounded-3xl border border-slate-800 bg-slate-950/65 p-4">
                              <div className="flex items-center justify-between">
                                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-amber-200">Round {row.round_number}</div>
                                <div className={`h-3 w-3 rounded-full ${tone === "emerald" ? "bg-emerald-400" : tone === "amber" ? "bg-amber-300" : "bg-rose-400"}`} />
                              </div>
                              <div className="mt-4 grid gap-3">
                                <div className={`rounded-2xl border px-3 py-2 text-sm font-semibold ${pillTone(row.schedule_index ?? 0, 1)}`}>SPI {fixed(row.schedule_index ?? 0)}</div>
                                <div className={`rounded-2xl border px-3 py-2 text-sm font-semibold ${pillTone(row.cost_index ?? 0, 1)}`}>CPI {fixed(row.cost_index ?? 0)}</div>
                                <div className={`rounded-2xl border px-3 py-2 text-sm font-semibold ${tone === "emerald" ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100" : tone === "amber" ? "border-amber-300/20 bg-amber-400/10 text-amber-100" : "border-rose-400/20 bg-rose-500/10 text-rose-100"}`}>
                                  Safety {int(safety)}
                                </div>
                              </div>
                            </div>
                            {index < myResults.length - 1 ? (
                              <div className="mt-16 hidden h-1 w-14 rounded-full md:block">
                                <div className={`h-full w-full rounded-full bg-gradient-to-r ${(myResults[index + 1].schedule_index ?? 0) >= (row.schedule_index ?? 0) ? "from-emerald-400 via-emerald-300 to-amber-300" : "from-rose-400 via-amber-300 to-amber-200"}`} />
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-3xl border border-slate-800/90 bg-slate-950/70 p-5">
                      <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-amber-200">Schedule Verdict</div>
                      <div className="mt-3 text-xl font-black text-slate-50">
                        {Math.abs(scheduleDays) < 1 ? "Delivered on time on average" : scheduleDays > 0 ? `Delivered ${int(scheduleDays)} days early on average` : `Delivered ${int(Math.abs(scheduleDays))} days late on average`}
                      </div>
                      <p className="mt-2 text-sm text-slate-300">Derived from average SPI where 1.00 represents on-time delivery.</p>
                    </div>
                    <div className="rounded-3xl border border-slate-800/90 bg-slate-950/70 p-5">
                      <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-amber-200">Cost Verdict</div>
                      <div className="mt-3 text-xl font-black text-slate-50">
                        {Math.abs(myTeamSummary.avgCpi - 1) < 0.01 ? "Finished broadly on budget" : myTeamSummary.avgCpi >= 1 ? `Finished ${int(budgetVariance)}% under budget` : `Finished ${int(budgetVariance)}% over budget`}
                      </div>
                      <p className="mt-2 text-sm text-slate-300">Commercial closeout based on average CPI across all rounds.</p>
                    </div>
                    <div className="rounded-3xl border border-slate-800/90 bg-slate-950/70 p-5">
                      <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-amber-200">Safety Record</div>
                      <div className="mt-3 text-xl font-black text-slate-50">{myTeamSummary.incidentFreeRounds} incident-free rounds out of {myTeamSummary.roundsPlayed}</div>
                      <p className="mt-2 text-sm text-slate-300">Rounds count as incident-free when safety stays at or above 75.</p>
                    </div>
                    <div className="rounded-3xl border border-slate-800/90 bg-slate-950/70 p-5">
                      <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-amber-200">Client Satisfaction</div>
                      <div className="mt-3 text-xl font-black text-slate-50">{stakeholderLabel(myTeamSummary.avgStakeholder)}</div>
                      <p className="mt-2 text-sm text-slate-300">Average stakeholder score {int(myTeamSummary.avgStakeholder)} across the project.</p>
                    </div>
                  </div>
                </CardBody>
              </Card>

              <Card variant="elevated" className="border-slate-800/90 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
                <CardBody className="space-y-5 p-6">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-amber-200">Did You Win The Next Package?</div>
                      <div className="mt-2 text-heading-2 text-slate-50">Commercial relationship outcome</div>
                    </div>
                    {narrative ? <Badge tone={narrative.tone}>{narrative.title}</Badge> : null}
                  </div>
                  {narrative ? (
                    <div className={`rounded-[28px] border p-6 ${narrative.tone === "success" ? "border-emerald-400/25 bg-emerald-500/10" : narrative.tone === "info" ? "border-sky-400/25 bg-sky-500/10" : narrative.tone === "warning" ? "border-amber-300/25 bg-amber-400/10" : "border-rose-400/25 bg-rose-500/10"}`}>
                      <div className="text-2xl font-black text-slate-50">{narrative.title}</div>
                      <p className="mt-3 max-w-4xl text-base text-slate-200">{narrative.body}</p>
                    </div>
                  ) : null}
                </CardBody>
              </Card>

              <Card variant="elevated" className="border-slate-800/90 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
                <CardBody className="space-y-6 p-6">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-amber-200">Learning Summary</div>
                    <div className="mt-2 text-heading-2 text-slate-50">What went well, and what to sharpen next time</div>
                  </div>
                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="space-y-4">
                      <div className="text-sm font-bold uppercase tracking-[0.22em] text-emerald-200">Three Things You Did Well</div>
                      {learning.good.map((item) => (
                        <div key={item} className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5 text-sm text-emerald-50">{item}</div>
                      ))}
                    </div>
                    <div className="space-y-4">
                      <div className="text-sm font-bold uppercase tracking-[0.22em] text-amber-200">Three Things To Improve</div>
                      {learning.improve.map((item) => (
                        <div key={item} className="rounded-3xl border border-amber-300/20 bg-amber-400/10 p-5 text-sm text-amber-50">{item}</div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="text-sm font-bold uppercase tracking-[0.22em] text-slate-200">PMI Knowledge Areas Practiced</div>
                    <div className="flex flex-wrap gap-2">
                      {knowledgeAreas.map((tag) => (
                        <span key={tag} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">{tag}</span>
                      ))}
                    </div>
                  </div>
                </CardBody>
              </Card>

              <Card variant="elevated" className="border-slate-800/90 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
                <CardBody className="space-y-5 p-6">
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-amber-200">Leaderboard Final</div>
                      <div className="mt-2 text-heading-2 text-slate-50">Final team standings</div>
                    </div>
                    <div className="text-sm text-slate-300">{leaderboard.length} teams ranked</div>
                  </div>
                  <div className="space-y-3">
                    {leaderboard.map((team) => (
                      <div key={team.id} className={`grid gap-4 rounded-3xl border px-4 py-4 md:grid-cols-[80px_minmax(0,1.2fr)_0.8fr_0.9fr] md:items-center ${team.id === myTeamSummary.id ? "border-amber-300/30 bg-amber-400/10" : "border-slate-800 bg-slate-950/65"}`}>
                        <div className="flex items-center gap-3">
                          <div className={`flex h-12 w-12 items-center justify-center rounded-2xl text-lg font-black ${team.rank === 1 ? "bg-amber-300 text-slate-950" : team.rank === 2 ? "bg-slate-300 text-slate-950" : team.rank === 3 ? "bg-orange-400 text-slate-950" : "bg-white/5 text-slate-100"}`}>{team.rank}</div>
                          {team.rank === 1 ? <Badge tone="warning">WINNER</Badge> : null}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-lg font-black text-slate-50">{team.companyName}</div>
                          <div className="mt-1 text-sm text-slate-300">{team.teamName}</div>
                        </div>
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Total Points</div>
                          <div className="mt-2 text-2xl font-black text-slate-50">{int(team.totalPoints)}</div>
                        </div>
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Key Differentiator</div>
                          <div className="mt-2 text-sm font-semibold text-slate-200">{team.strongestMetric}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>

              <Card variant="elevated" className="border-slate-800/90 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 print:border-slate-300 print:bg-white">
                <CardBody className="space-y-5 p-6">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-amber-200 print:text-slate-600">Certificates</div>
                      <div className="mt-2 text-heading-2 text-slate-50 print:text-slate-900">Download Performance Certificate</div>
                    </div>
                    <Button onClick={() => window.print()} className="rounded-2xl border-amber-300/20 bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 hover:from-amber-300 hover:to-orange-400 print:hidden">
                      Download Performance Certificate
                    </Button>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-white/5 p-6 print:border-slate-300 print:bg-white">
                    <div className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-300 print:text-slate-500">Use browser print or Save as PDF to export</div>
                    <pre className="mt-4 whitespace-pre-wrap font-mono text-sm leading-7 text-slate-100 print:text-slate-900">{certificateText}</pre>
                  </div>
                </CardBody>
              </Card>
            </>
          ) : null}
        </div>
      </Page>
    </RequireAuth>
  );
}
