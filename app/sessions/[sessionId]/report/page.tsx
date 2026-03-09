"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { parseKpiTarget, evaluateKpiAchievement } from "@/lib/kpi";
import { RoundResult } from "@/lib/simEngine";

type RouteParams = { sessionId?: string };

type SessionRow = {
  id: string;
  name: string | null;
  code: string;
  status: string;
  round_count: number;
  current_round: number;
};

type MembershipRow = { team_id: string };

type TeamRow = {
  id: string;
  session_id: string;
  team_name: string;
  total_points: number | null;
  kpi_target: string | null;
};

type SessionTeamRow = {
  id: string;
  team_name: string;
};

type SessionScoreRow = {
  team_id: string;
  round_number: number;
  points_earned: number | null;
};

type TeamResultRow = {
  session_id: string;
  team_id: string;
  round_number: number;
  schedule_index: number;
  cost_index: number;
  cash_closing: number;
  quality_score: number;
  safety_score: number;
  stakeholder_score: number;
  claim_entitlement_score: number;
  points_earned: number;
  penalties: number;
  detail: Record<string, unknown>;
};

type YearRow = {
  fy: string;
  round_number: number;
  points: number;
  penalties: number;
  spi: number;
  cpi: number;
  quality: number;
  safety: number;
  stakeholder: number;
  cash: number;
  kpi_hit: boolean;
};

type TrendMetricKey = "points" | "spi" | "cpi" | "quality" | "safety" | "stakeholder";

type TrendMetric = {
  key: TrendMetricKey;
  label: string;
  color: string;
  value: (row: YearRow) => number;
};

type BenchmarkPoint = {
  round_number: number;
  fy: string;
  value: number;
  x: number;
  y: number;
};

type BenchmarkSeries = {
  team_id: string;
  team_name: string;
  rank: number;
  final_points: number;
  color: string;
  is_my_team: boolean;
  points: BenchmarkPoint[];
  path: string;
};

const TREND_METRICS: TrendMetric[] = [
  { key: "points", label: "Points", color: "#0f766e", value: (row) => row.points },
  { key: "spi", label: "SPI", color: "#0284c7", value: (row) => row.spi },
  { key: "cpi", label: "CPI", color: "#6366f1", value: (row) => row.cpi },
  { key: "quality", label: "Quality", color: "#16a34a", value: (row) => row.quality },
  { key: "safety", label: "Safety", color: "#ea580c", value: (row) => row.safety },
  { key: "stakeholder", label: "Stakeholder", color: "#dc2626", value: (row) => row.stakeholder },
];

const BENCHMARK_COLORS = [
  "#0f766e",
  "#2563eb",
  "#7c3aed",
  "#dc2626",
  "#16a34a",
  "#ea580c",
  "#0891b2",
  "#be123c",
];

function formatCurrencyInr(value: number) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDelta(delta: number) {
  if (delta > 0) return `+${delta}`;
  return `${delta}`;
}

function normalize(values: number[]) {
  const min = Math.min(...values);
  const max = Math.max(...values);

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return values.map(() => 50);
  }

  if (Math.abs(max - min) < 0.000001) {
    return values.map(() => 50);
  }

  return values.map((value) => ((value - min) / (max - min)) * 100);
}

function polylinePath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  return `M ${first.x.toFixed(2)} ${first.y.toFixed(2)} ${rest
    .map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ")}`;
}

export default function SessionFinancialReportPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseClient(), []);

  const routeParams = params as RouteParams;
  const sessionId = routeParams.sessionId ?? "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [session, setSession] = useState<SessionRow | null>(null);
  const [team, setTeam] = useState<TeamRow | null>(null);
  const [rows, setRows] = useState<TeamResultRow[]>([]);
  const [sessionTeams, setSessionTeams] = useState<SessionTeamRow[]>([]);
  const [sessionScores, setSessionScores] = useState<SessionScoreRow[]>([]);
  const [benchmarkError, setBenchmarkError] = useState("");

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
      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: sessionData, error: sessionErr } = await supabase
        .from("sessions")
        .select("id,name,code,status,round_count,current_round")
        .eq("id", sessionId)
        .maybeSingle();

      if (sessionErr) {
        setError(sessionErr.message);
        setLoading(false);
        return;
      }

      const sessionRow = (sessionData as SessionRow | null) ?? null;
      if (!sessionRow) {
        setError("Session not found.");
        setLoading(false);
        return;
      }
      setSession(sessionRow);

      const { data: membershipData, error: membershipErr } = await supabase
        .from("team_memberships")
        .select("team_id")
        .eq("user_id", user.id);

      if (membershipErr) {
        setError(membershipErr.message);
        setLoading(false);
        return;
      }

      const teamIds = ((membershipData ?? []) as MembershipRow[]).map((row) => row.team_id);
      if (teamIds.length === 0) {
        setError("No team membership found for this user.");
        setLoading(false);
        return;
      }

      const { data: teamData, error: teamErr } = await supabase
        .from("teams")
        .select("id,session_id,team_name,total_points,kpi_target")
        .in("id", teamIds)
        .eq("session_id", sessionId)
        .maybeSingle();

      if (teamErr) {
        setError(teamErr.message);
        setLoading(false);
        return;
      }

      const teamRow = (teamData as TeamRow | null) ?? null;
      if (!teamRow) {
        setError("You are not a member of this session.");
        setLoading(false);
        return;
      }
      setTeam(teamRow);

      const { data: resultsData, error: resultsErr } = await supabase
        .from("team_results")
        .select(
          "session_id,team_id,round_number,schedule_index,cost_index,cash_closing,quality_score,safety_score,stakeholder_score,claim_entitlement_score,points_earned,penalties,detail"
        )
        .eq("session_id", sessionId)
        .eq("team_id", teamRow.id)
        .order("round_number", { ascending: true });

      if (resultsErr) {
        setError(resultsErr.message);
        setLoading(false);
        return;
      }

      setRows((resultsData ?? []) as TeamResultRow[]);

      try {
        const [{ data: teamsData, error: teamsErr }, { data: scoresData, error: scoresErr }] = await Promise.all([
          supabase.from("teams").select("id,team_name").eq("session_id", sessionId),
          supabase.from("team_results").select("team_id,round_number,points_earned").eq("session_id", sessionId),
        ]);

        if (teamsErr) throw teamsErr;
        if (scoresErr) throw scoresErr;

        setSessionTeams((teamsData ?? []) as SessionTeamRow[]);
        setSessionScores((scoresData ?? []) as SessionScoreRow[]);
        setBenchmarkError("");
      } catch (unknownError: unknown) {
        const message =
          unknownError instanceof Error ? unknownError.message : "Could not load session benchmark for this report.";
        setBenchmarkError(message);
        setSessionTeams([]);
        setSessionScores([]);
      }

      setLoading(false);
    })();
  }, [router, sessionId, supabase]);

  const yearRows: YearRow[] = useMemo(() => {
    const teamKpi = parseKpiTarget(team?.kpi_target);

    return rows.map((row) => {
      const kpi = (row.detail as { kpi?: Record<string, unknown> } | undefined)?.kpi;
      const kpiHitFromDetail = typeof kpi?.achieved === "boolean" ? kpi.achieved : null;
      const computed = teamKpi ? evaluateKpiAchievement(teamKpi, row as unknown as RoundResult).achieved : false;

      return {
        fy: `FY ${row.round_number}`,
        round_number: row.round_number,
        points: row.points_earned ?? 0,
        penalties: row.penalties ?? 0,
        spi: row.schedule_index ?? 0,
        cpi: row.cost_index ?? 0,
        quality: row.quality_score ?? 0,
        safety: row.safety_score ?? 0,
        stakeholder: row.stakeholder_score ?? 0,
        cash: row.cash_closing ?? 0,
        kpi_hit: kpiHitFromDetail ?? computed,
      };
    });
  }, [rows, team?.kpi_target]);

  const summary = useMemo(() => {
    if (yearRows.length === 0) {
      return {
        yearsPlayed: 0,
        totalPoints: 0,
        totalPenalties: 0,
        avgSpi: 0,
        avgCpi: 0,
        avgQuality: 0,
        avgSafety: 0,
        avgStakeholder: 0,
        latestCash: 0,
        kpiHitYears: 0,
      };
    }

    const totals = yearRows.reduce(
      (acc, row) => {
        acc.totalPoints += row.points;
        acc.totalPenalties += row.penalties;
        acc.avgSpi += row.spi;
        acc.avgCpi += row.cpi;
        acc.avgQuality += row.quality;
        acc.avgSafety += row.safety;
        acc.avgStakeholder += row.stakeholder;
        acc.kpiHitYears += row.kpi_hit ? 1 : 0;
        acc.latestCash = row.cash;
        return acc;
      },
      {
        totalPoints: 0,
        totalPenalties: 0,
        avgSpi: 0,
        avgCpi: 0,
        avgQuality: 0,
        avgSafety: 0,
        avgStakeholder: 0,
        latestCash: 0,
        kpiHitYears: 0,
      }
    );

    const n = yearRows.length;
    return {
      yearsPlayed: n,
      totalPoints: totals.totalPoints,
      totalPenalties: totals.totalPenalties,
      avgSpi: totals.avgSpi / n,
      avgCpi: totals.avgCpi / n,
      avgQuality: totals.avgQuality / n,
      avgSafety: totals.avgSafety / n,
      avgStakeholder: totals.avgStakeholder / n,
      latestCash: totals.latestCash,
      kpiHitYears: totals.kpiHitYears,
    };
  }, [yearRows]);

  const chartModel = useMemo(() => {
    if (yearRows.length < 2) return null;

    const width = 1000;
    const height = 340;
    const padLeft = 64;
    const padRight = 24;
    const padTop = 22;
    const padBottom = 64;

    const innerW = width - padLeft - padRight;
    const innerH = height - padTop - padBottom;

    const xForIndex = (index: number) => {
      if (yearRows.length <= 1) return padLeft;
      return padLeft + (index / (yearRows.length - 1)) * innerW;
    };

    const yForPercent = (percent: number) => padTop + innerH - (percent / 100) * innerH;

    const series = TREND_METRICS.map((metric) => {
      const raw = yearRows.map((row) => metric.value(row));
      const normalized = normalize(raw);

      const points = normalized.map((percent, index) => ({
        x: xForIndex(index),
        y: yForPercent(percent),
        value: raw[index],
        fy: yearRows[index].fy,
      }));

      return {
        metric,
        points,
        path: polylinePath(points),
      };
    });

    const yTicks = [0, 25, 50, 75, 100];

    return {
      width,
      height,
      padLeft,
      padRight,
      padTop,
      padBottom,
      innerW,
      innerH,
      xForIndex,
      yForPercent,
      yTicks,
      series,
    };
  }, [yearRows]);

  const benchmarkModel = useMemo(() => {
    if (!team?.id || sessionTeams.length === 0) return null;

    const maxRound = Math.max(
      ...yearRows.map((row) => row.round_number),
      ...sessionScores.map((score) => score.round_number),
      1
    );

    const rounds = Array.from({ length: maxRound }, (_, index) => index + 1);

    const totalsByTeam = new Map<string, Map<number, number>>();
    for (const teamRow of sessionTeams) {
      totalsByTeam.set(teamRow.id, new Map<number, number>());
    }

    for (const score of sessionScores) {
      const teamMap = totalsByTeam.get(score.team_id);
      if (!teamMap) continue;
      teamMap.set(score.round_number, (teamMap.get(score.round_number) ?? 0) + (score.points_earned ?? 0));
    }

    const rawSeries = sessionTeams.map((teamRow, index) => {
      const teamMap = totalsByTeam.get(teamRow.id) ?? new Map<number, number>();
      let running = 0;
      const runningSeries = rounds.map((round) => {
        running += teamMap.get(round) ?? 0;
        return {
          round_number: round,
          fy: `FY ${round}`,
          value: running,
        };
      });

      return {
        team_id: teamRow.id,
        team_name: teamRow.team_name,
        color: BENCHMARK_COLORS[index % BENCHMARK_COLORS.length],
        is_my_team: teamRow.id === team.id,
        final_points: running,
        points: runningSeries,
      };
    });

    const sortedSeries = [...rawSeries].sort(
      (a, b) => b.final_points - a.final_points || a.team_name.localeCompare(b.team_name)
    );

    const ranked = sortedSeries.map((row, index) => ({
      ...row,
      rank: index + 1,
    }));

    const width = 1000;
    const height = 340;
    const padLeft = 64;
    const padRight = 24;
    const padTop = 24;
    const padBottom = 64;

    const innerW = width - padLeft - padRight;
    const innerH = height - padTop - padBottom;

    const maxValue = Math.max(...ranked.map((row) => row.final_points), 1);

    const xForRound = (round: number) => {
      if (maxRound <= 1) return padLeft;
      return padLeft + ((round - 1) / (maxRound - 1)) * innerW;
    };

    const yForValue = (value: number) => padTop + innerH - (value / maxValue) * innerH;

    const chartSeries: BenchmarkSeries[] = ranked.map((row) => {
      const points: BenchmarkPoint[] = row.points.map((point) => ({
        ...point,
        x: xForRound(point.round_number),
        y: yForValue(point.value),
      }));

      return {
        ...row,
        points,
        path: polylinePath(points),
      };
    });

    const myIndex = chartSeries.findIndex((row) => row.is_my_team);
    const myRank = myIndex >= 0 ? chartSeries[myIndex].rank : null;
    const myFinal = myIndex >= 0 ? chartSeries[myIndex].final_points : 0;

    const leader = chartSeries[0] ?? null;
    const above = myIndex > 0 ? chartSeries[myIndex - 1] : null;
    const below = myIndex >= 0 && myIndex < chartSeries.length - 1 ? chartSeries[myIndex + 1] : null;

    return {
      width,
      height,
      padLeft,
      padRight,
      padTop,
      padBottom,
      rounds,
      xForRound,
      yForValue,
      maxValue,
      yTicks: [0, 0.25, 0.5, 0.75, 1],
      series: chartSeries,
      myRank,
      myFinal,
      leader,
      gapToLeader: Math.max((leader?.final_points ?? 0) - myFinal, 0),
      above,
      gapToAbove: Math.max((above?.final_points ?? 0) - myFinal, 0),
      below,
      leadOverBelow: Math.max(myFinal - (below?.final_points ?? 0), 0),
    };
  }, [team?.id, yearRows, sessionScores, sessionTeams]);

  const strategicFocus = useMemo(() => {
    if (yearRows.length === 0) return [] as string[];

    const suggestions: string[] = [];

    if (summary.avgCpi < 1) {
      suggestions.push("Cost recovery lane: improve procurement sequencing, tighten subcontract package scope, and protect CPI.");
    }

    if (summary.avgSpi < 1) {
      suggestions.push("Schedule recovery lane: prioritize critical-path tasks, reduce rework loops, and protect SPI.");
    }

    if (summary.avgSafety < 75 || summary.avgQuality < 75) {
      suggestions.push("Execution discipline lane: push QA/QC checklists and safety supervision to avoid heavy penalties.");
    }

    if (team?.kpi_target && summary.kpiHitYears < Math.ceil(summary.yearsPlayed * 0.5)) {
      suggestions.push("KPI discipline lane: align every round allocation with your chosen KPI to unlock 4x years more often.");
    }

    if (benchmarkModel && benchmarkModel.gapToLeader > 0) {
      suggestions.push(
        benchmarkModel.gapToLeader <= 30
          ? "Competitive lane: you are close to the leader, so a focused two-round push can close rank gap."
          : "Foundation lane: close structural gaps first before aggressive ranking moves."
      );
    }

    if (suggestions.length === 0) {
      suggestions.push("Stability lane: maintain this balance and avoid sudden risk appetite shifts unless news shock demands it.");
    }

    return suggestions.slice(0, 3);
  }, [yearRows.length, summary, team?.kpi_target, benchmarkModel]);
  const maxPoints = Math.max(...yearRows.map((row) => row.points), 1);
  const maxCashAbs = Math.max(...yearRows.map((row) => Math.abs(row.cash)), 1);

  return (
    <RequireAuth>
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Financial Year Report</h1>
            <p className="mt-1 text-sm text-slate-600">
              Round = one financial year. Review cumulative business performance and KPI discipline.
            </p>
          </div>
          <div className="flex gap-3 text-sm">
            <Link className="underline text-slate-700" href={`/sessions/${sessionId}`}>
              Session Hub
            </Link>
            {session?.current_round ? (
              <Link className="underline text-slate-700" href={`/sessions/${sessionId}/round/${session.current_round}/results`}>
                Latest Results
              </Link>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
        ) : null}

        {loading ? (
          <Card>
            <CardBody>
              <p className="text-sm text-slate-600">Loading report...</p>
            </CardBody>
          </Card>
        ) : null}

        {!loading && !error ? (
          <>
            <Card>
              <CardHeader title={session?.name ?? "Session"} subtitle={`Code: ${session?.code ?? "-"} | Team: ${team?.team_name ?? "-"}`} />
              <CardBody className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-slate-500">Session status</div>
                  <div className="mt-1 font-semibold text-slate-900">{session?.status ?? "-"}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-slate-500">Years played</div>
                  <div className="mt-1 font-semibold text-slate-900">{summary.yearsPlayed}/{session?.round_count ?? 0}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-slate-500">Team KPI target</div>
                  <div className="mt-1 font-semibold text-slate-900">{team?.kpi_target ?? "Not selected"}</div>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Cumulative Performance" subtitle="Aggregate financial and execution indicators" />
              <CardBody className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-slate-500">Total points</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">{summary.totalPoints}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-slate-500">Total penalties</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">{summary.totalPenalties}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-slate-500">Avg SPI / CPI</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">
                    {summary.avgSpi.toFixed(2)} / {summary.avgCpi.toFixed(2)}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-slate-500">Avg quality / safety</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">
                    {summary.avgQuality.toFixed(0)} / {summary.avgSafety.toFixed(0)}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-slate-500">Latest cash</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">Rs {formatCurrencyInr(summary.latestCash)}</div>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Session Benchmark (5B)"
                subtitle="Cumulative points race across all teams in this simulation"
              />
              <CardBody className="space-y-4">
                {benchmarkError ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    {benchmarkError}
                  </div>
                ) : null}

                {!benchmarkModel ? (
                  <div className="text-sm text-slate-600">
                    Session benchmark will appear once team scoreboard data is available.
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-4">
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-slate-500">Your rank</div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">
                          {benchmarkModel.myRank ? `#${benchmarkModel.myRank}` : "-"}
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-slate-500">Gap to leader</div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">{benchmarkModel.gapToLeader} pts</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-slate-500">Gap to team above</div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">{benchmarkModel.gapToAbove} pts</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-slate-500">Lead over team below</div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">{benchmarkModel.leadOverBelow} pts</div>
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-3">
                      <svg viewBox={`0 0 ${benchmarkModel.width} ${benchmarkModel.height}`} className="min-w-[720px] w-full" role="img" aria-label="Session cumulative points trend chart">
                        <rect x="0" y="0" width={benchmarkModel.width} height={benchmarkModel.height} fill="white" />

                        {benchmarkModel.yTicks.map((tick) => {
                          const y = benchmarkModel.yForValue(benchmarkModel.maxValue * tick);
                          return (
                            <g key={`b-y-${tick}`}>
                              <line
                                x1={benchmarkModel.padLeft}
                                y1={y}
                                x2={benchmarkModel.width - benchmarkModel.padRight}
                                y2={y}
                                stroke="#e2e8f0"
                                strokeWidth="1"
                              />
                              <text x={benchmarkModel.padLeft - 10} y={y + 4} textAnchor="end" fontSize="11" fill="#64748b">
                                {Math.round(benchmarkModel.maxValue * tick)}
                              </text>
                            </g>
                          );
                        })}

                        {benchmarkModel.rounds.map((round) => {
                          const x = benchmarkModel.xForRound(round);
                          return (
                            <g key={`b-r-${round}`}>
                              <line
                                x1={x}
                                y1={benchmarkModel.padTop}
                                x2={x}
                                y2={benchmarkModel.height - benchmarkModel.padBottom}
                                stroke="#f1f5f9"
                                strokeWidth="1"
                              />
                              <text
                                x={x}
                                y={benchmarkModel.height - benchmarkModel.padBottom + 18}
                                textAnchor="middle"
                                fontSize="11"
                                fill="#475569"
                              >
                                FY {round}
                              </text>
                            </g>
                          );
                        })}

                        {benchmarkModel.series.map((series) => (
                          <g key={`bench-${series.team_id}`}>
                            <path
                              d={series.path}
                              fill="none"
                              stroke={series.color}
                              strokeWidth={series.is_my_team ? "3.6" : "2.2"}
                              strokeLinejoin="round"
                              strokeLinecap="round"
                              opacity={series.is_my_team ? "1" : "0.8"}
                            />
                            {series.points.map((point, idx) => (
                              <circle key={`bench-${series.team_id}-${idx}`} cx={point.x} cy={point.y} r={series.is_my_team ? "4" : "3"} fill={series.color}>
                                <title>{`${series.team_name} | ${point.fy}: ${point.value}`}</title>
                              </circle>
                            ))}
                          </g>
                        ))}
                      </svg>
                    </div>

                    <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
                      {benchmarkModel.series.map((series) => (
                        <div
                          key={`legend-${series.team_id}`}
                          className={`rounded-lg border px-3 py-2 ${series.is_my_team ? "border-teal-300 bg-teal-50" : "border-slate-200 bg-white"}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: series.color }} />
                              <span className="font-semibold text-slate-900">#{series.rank} {series.team_name}</span>
                            </div>
                            <span className="text-slate-600">{series.final_points} pts</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Next FY Strategic Focus" subtitle="Deterministic coaching cues generated from your trend + rank position" />
              <CardBody>
                {strategicFocus.length === 0 ? (
                  <div className="text-sm text-slate-600">Play at least one financial year to unlock strategic focus cues.</div>
                ) : (
                  <div className="space-y-2">
                    {strategicFocus.map((item, index) => (
                      <div key={item} className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                        <div className="font-semibold text-slate-900">Priority {index + 1}</div>
                        <div className="mt-1">{item}</div>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Comparative Line Graph"
                subtitle="Normalized trend view for points, SPI, CPI, quality, safety, and stakeholder across financial years"
              />
              <CardBody className="space-y-4">
                {!chartModel ? (
                  <div className="text-sm text-slate-600">
                    Line graph appears once at least 2 financial years are available.
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-3">
                      <svg viewBox={`0 0 ${chartModel.width} ${chartModel.height}`} className="min-w-[720px] w-full" role="img" aria-label="Comparative financial year line chart">
                        <rect x="0" y="0" width={chartModel.width} height={chartModel.height} fill="white" />

                        {chartModel.yTicks.map((tick) => {
                          const y = chartModel.yForPercent(tick);
                          return (
                            <g key={`y-${tick}`}>
                              <line
                                x1={chartModel.padLeft}
                                y1={y}
                                x2={chartModel.width - chartModel.padRight}
                                y2={y}
                                stroke="#e2e8f0"
                                strokeWidth="1"
                              />
                              <text x={chartModel.padLeft - 10} y={y + 4} textAnchor="end" fontSize="11" fill="#64748b">
                                {tick}
                              </text>
                            </g>
                          );
                        })}

                        {yearRows.map((row, index) => {
                          const x = chartModel.xForIndex(index);
                          return (
                            <g key={row.round_number}>
                              <line
                                x1={x}
                                y1={chartModel.padTop}
                                x2={x}
                                y2={chartModel.height - chartModel.padBottom}
                                stroke="#f1f5f9"
                                strokeWidth="1"
                              />
                              <text
                                x={x}
                                y={chartModel.height - chartModel.padBottom + 18}
                                textAnchor="middle"
                                fontSize="11"
                                fill="#475569"
                              >
                                {row.fy}
                              </text>
                            </g>
                          );
                        })}

                        {chartModel.series.map((series) => (
                          <g key={series.metric.key}>
                            <path d={series.path} fill="none" stroke={series.metric.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                            {series.points.map((point, idx) => (
                              <circle key={`${series.metric.key}-${idx}`} cx={point.x} cy={point.y} r="3.5" fill={series.metric.color}>
                                <title>{`${series.metric.label} | ${point.fy}: ${point.value.toFixed(2)}`}</title>
                              </circle>
                            ))}
                          </g>
                        ))}
                      </svg>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                      {chartModel.series.map((series) => (
                        <div key={series.metric.key} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700">
                          <div className="flex items-center gap-2">
                            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: series.metric.color }} />
                            <span className="font-semibold text-slate-900">{series.metric.label}</span>
                          </div>
                          <div className="mt-1 text-slate-500">Normalized trend</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="FY Trend" subtitle="Year-by-year points and cash movement" />
              <CardBody className="space-y-3">
                {yearRows.length === 0 ? (
                  <div className="text-sm text-slate-600">No locked results yet. Play at least one round to generate report data.</div>
                ) : (
                  yearRows.map((row, index) => {
                    const prev = index > 0 ? yearRows[index - 1] : null;
                    const pointsDelta = prev ? row.points - prev.points : 0;
                    const cashDelta = prev ? row.cash - prev.cash : 0;
                    const pointsWidth = Math.max(8, Math.round((row.points / maxPoints) * 100));
                    const cashWidth = Math.max(8, Math.round((Math.abs(row.cash) / maxCashAbs) * 100));

                    return (
                      <div key={row.round_number} className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-semibold text-slate-900">{row.fy}</div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className={`rounded-full px-2 py-0.5 ${row.kpi_hit ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                              KPI {row.kpi_hit ? "hit" : "miss"}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">Penalties {row.penalties}</span>
                          </div>
                        </div>

                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                          <div className="rounded-md bg-slate-50 p-2">SPI <b>{row.spi.toFixed(2)}</b></div>
                          <div className="rounded-md bg-slate-50 p-2">CPI <b>{row.cpi.toFixed(2)}</b></div>
                          <div className="rounded-md bg-slate-50 p-2">Quality <b>{row.quality}</b></div>
                          <div className="rounded-md bg-slate-50 p-2">Safety <b>{row.safety}</b></div>
                          <div className="rounded-md bg-slate-50 p-2">Stakeholder <b>{row.stakeholder}</b></div>
                        </div>

                        <div className="mt-3 space-y-2">
                          <div>
                            <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                              <span>Points</span>
                              <span>
                                {row.points}
                                {prev ? ` (${formatDelta(pointsDelta)} vs previous FY)` : ""}
                              </span>
                            </div>
                            <div className="h-2 rounded-full bg-slate-200">
                              <div className="h-2 rounded-full bg-gradient-to-r from-teal-500 to-cyan-600" style={{ width: `${pointsWidth}%` }} />
                            </div>
                          </div>

                          <div>
                            <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                              <span>Cash closing</span>
                              <span>
                                Rs {formatCurrencyInr(row.cash)}
                                {prev ? ` (${formatCurrencyInr(cashDelta)} vs previous FY)` : ""}
                              </span>
                            </div>
                            <div className="h-2 rounded-full bg-slate-200">
                              <div
                                className={`h-2 rounded-full ${row.cash >= 0 ? "bg-gradient-to-r from-emerald-500 to-teal-600" : "bg-gradient-to-r from-rose-500 to-orange-500"}`}
                                style={{ width: `${cashWidth}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Yearly Ledger" subtitle="Round-wise financial and scoring snapshot" />
              <CardBody>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-2 py-2">FY</th>
                        <th className="px-2 py-2">Points</th>
                        <th className="px-2 py-2">Penalties</th>
                        <th className="px-2 py-2">SPI</th>
                        <th className="px-2 py-2">CPI</th>
                        <th className="px-2 py-2">Quality</th>
                        <th className="px-2 py-2">Safety</th>
                        <th className="px-2 py-2">Stakeholder</th>
                        <th className="px-2 py-2">Cash Closing (Rs)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {yearRows.map((row) => (
                        <tr key={row.round_number} className="border-b border-slate-100">
                          <td className="px-2 py-2 font-semibold text-slate-900">{row.fy}</td>
                          <td className="px-2 py-2">{row.points}</td>
                          <td className="px-2 py-2">{row.penalties}</td>
                          <td className="px-2 py-2">{row.spi.toFixed(2)}</td>
                          <td className="px-2 py-2">{row.cpi.toFixed(2)}</td>
                          <td className="px-2 py-2">{row.quality}</td>
                          <td className="px-2 py-2">{row.safety}</td>
                          <td className="px-2 py-2">{row.stakeholder}</td>
                          <td className="px-2 py-2">{formatCurrencyInr(row.cash)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
          </>
        ) : null}
      </div>
    </RequireAuth>
  );
}
