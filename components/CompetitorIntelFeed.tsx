"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { getSupabaseClient } from "@/lib/supabaseClient";

type CompetitorIntelFeedProps = {
  sessionId: string;
  teamId: string;
  roundNumber: number;
};

type TeamRow = {
  id: string;
  team_name: string;
  total_points: number | null;
};

type TeamResultRow = {
  team_id: string;
  schedule_index: number | null;
  cost_index: number | null;
  safety_score: number | null;
  points_earned: number | null;
};

type LeaderboardEntry = {
  id: string;
  teamName: string;
  totalPoints: number;
  currentRank: number;
  previousRank: number;
};

type IntelSnapshot = {
  leaderboard: LeaderboardEntry[];
  teamCount: number;
  lockedCount: number;
  averageTotalPoints: number;
  averageSpi: number | null;
  averageCpi: number | null;
  anyAheadOfSchedule: boolean;
  anySafetyIncident: boolean;
  hasPreviousRoundData: boolean;
};

type IntelSignalTone = "neutral" | "positive" | "warning" | "danger";
type IntelSignalIcon = "bolt" | "coins" | "shield" | "up" | "down" | "score" | "pace";

type IntelSignal = {
  icon: IntelSignalIcon;
  label: string;
  tone: IntelSignalTone;
};

const scoreFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });
const pointsFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

function byPointsThenName(
  a: { team_name: string; total_points?: number | null },
  b: { team_name: string; total_points?: number | null }
) {
  const pointsDelta = (b.total_points ?? 0) - (a.total_points ?? 0);
  if (pointsDelta !== 0) return pointsDelta;
  return a.team_name.localeCompare(b.team_name);
}

function average(values: Array<number | null>) {
  const numeric = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (numeric.length === 0) return null;
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
}

function buildLeaderboard(teams: TeamRow[], previousRoundResults: TeamResultRow[]) {
  const roundPoints = new Map(previousRoundResults.map((row) => [row.team_id, row.points_earned ?? 0]));
  const currentRanked = [...teams].sort(byPointsThenName);
  const currentRankMap = new Map(currentRanked.map((team, index) => [team.id, index + 1]));
  const previousRankMap = new Map(
    [...teams]
      .map((team) => ({
        ...team,
        total_points: (team.total_points ?? 0) - (roundPoints.get(team.id) ?? 0),
      }))
      .sort(byPointsThenName)
      .map((team, index) => [team.id, index + 1])
  );

  return currentRanked.map((team) => ({
    id: team.id,
    teamName: team.team_name,
    totalPoints: team.total_points ?? 0,
    currentRank: currentRankMap.get(team.id) ?? 1,
    previousRank: previousRankMap.get(team.id) ?? currentRankMap.get(team.id) ?? 1,
  }));
}

function toneClasses(tone: IntelSignalTone) {
  if (tone === "positive") return "border-emerald-400/20 bg-emerald-500/10 text-emerald-100";
  if (tone === "warning") return "border-amber-400/20 bg-amber-500/10 text-amber-100";
  if (tone === "danger") return "border-rose-400/20 bg-rose-500/10 text-rose-100";
  return "border-white/10 bg-white/5 text-slate-200";
}

function progressTone(progress: number) {
  if (progress >= 0.75) {
    return {
      bar: "bg-gradient-to-r from-emerald-500 to-green-400",
      text: "text-emerald-200",
      chip: "border-emerald-400/20 bg-emerald-500/10 text-emerald-100",
    };
  }
  if (progress >= 0.35) {
    return {
      bar: "bg-gradient-to-r from-amber-500 to-orange-400",
      text: "text-amber-100",
      chip: "border-amber-400/20 bg-amber-500/10 text-amber-100",
    };
  }
  return {
    bar: "bg-gradient-to-r from-slate-500 to-slate-400",
    text: "text-slate-200",
    chip: "border-white/10 bg-white/5 text-slate-200",
  };
}

function SignalIcon({ icon }: { icon: IntelSignalIcon }) {
  if (icon === "bolt") {
    return (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor">
        <path d="M9.6 1.5 4.8 8h2.8L6.4 14.5l4.8-6.5H8.4L9.6 1.5Z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
      </svg>
    );
  }
  if (icon === "coins") {
    return (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor">
        <ellipse cx="8" cy="4" rx="4.5" ry="2.2" strokeWidth="1.3" />
        <path d="M3.5 4v4c0 1.2 2 2.2 4.5 2.2s4.5-1 4.5-2.2V4M3.5 8v4c0 1.2 2 2.2 4.5 2.2s4.5-1 4.5-2.2V8" strokeWidth="1.3" />
      </svg>
    );
  }
  if (icon === "shield") {
    return (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor">
        <path d="M8 1.8 3.5 3.4v3.9c0 3 1.8 5.3 4.5 6.9 2.7-1.6 4.5-3.9 4.5-6.9V3.4L8 1.8Z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3" />
      </svg>
    );
  }
  if (icon === "up" || icon === "down") {
    return (
      <svg viewBox="0 0 16 16" className={`h-3.5 w-3.5 ${icon === "down" ? "rotate-180" : ""}`} fill="none" stroke="currentColor">
        <path d="M8 12V4M8 4 4.7 7.3M8 4l3.3 3.3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
      </svg>
    );
  }
  if (icon === "pace") {
    return (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor">
        <path d="M3 10.5a5 5 0 1 1 10 0M8 8l2.8-2.3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor">
      <path d="M8 2.5v11M2.5 8h11" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
    </svg>
  );
}

function LeaderboardRow({
  entry,
  highlighted,
  compact,
  label,
}: {
  entry: LeaderboardEntry;
  highlighted: boolean;
  compact: boolean;
  label?: string;
}) {
  return (
    <div
      className={`grid items-center gap-3 rounded-2xl border px-3 py-3 ${
        compact ? "grid-cols-[36px_minmax(0,1fr)_auto]" : "grid-cols-[40px_minmax(0,1fr)_auto]"
      } ${
        highlighted
          ? "border-amber-400/30 bg-amber-500/10 text-white"
          : "border-white/5 bg-slate-950/70 text-slate-200"
      }`}
    >
      <div className="text-lg font-black text-slate-50">#{entry.currentRank}</div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-slate-50">{entry.teamName}</div>
        {label ? <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-400">{label}</div> : null}
      </div>
      <div className="text-right text-sm font-black text-slate-50">{pointsFormatter.format(entry.totalPoints)}</div>
    </div>
  );
}

export function CompetitorIntelFeed({ sessionId, teamId, roundNumber }: CompetitorIntelFeedProps) {
  const pathname = usePathname();
  const compact = !pathname.includes("/round/");
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [snapshot, setSnapshot] = useState<IntelSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sessionId || !teamId || roundNumber <= 0) return;

    let cancelled = false;

    const fetchIntel = async () => {
      try {
        setError("");
        const previousRoundNumber = roundNumber - 1;
        const previousRoundPromise =
          previousRoundNumber > 0
            ? supabase
                .from("team_results")
                .select("team_id,schedule_index,cost_index,safety_score,points_earned")
                .eq("session_id", sessionId)
                .eq("round_number", previousRoundNumber)
            : Promise.resolve({ data: [], error: null });

        const [teamsResponse, lockedResponse, previousRoundResponse] = await Promise.all([
          supabase.from("teams").select("id,team_name,total_points").eq("session_id", sessionId),
          supabase
            .from("decisions")
            .select("team_id", { head: true, count: "exact" })
            .eq("session_id", sessionId)
            .eq("round_number", roundNumber)
            .eq("locked", true),
          previousRoundPromise,
        ]);

        if (teamsResponse.error) throw teamsResponse.error;
        if (lockedResponse.error) throw lockedResponse.error;
        if (previousRoundResponse.error) throw previousRoundResponse.error;

        const teams = (teamsResponse.data ?? []) as TeamRow[];
        const previousRoundResults = (previousRoundResponse.data ?? []) as TeamResultRow[];
        const leaderboard = buildLeaderboard(teams, previousRoundResults);

        if (!cancelled) {
          setSnapshot({
            leaderboard,
            teamCount: teams.length,
            lockedCount: lockedResponse.count ?? 0,
            averageTotalPoints:
              teams.length > 0
                ? teams.reduce((sum, team) => sum + (team.total_points ?? 0), 0) / teams.length
                : 0,
            averageSpi: average(previousRoundResults.map((row) => row.schedule_index)),
            averageCpi: average(previousRoundResults.map((row) => row.cost_index)),
            anyAheadOfSchedule: previousRoundResults.some((row) => (row.schedule_index ?? 0) > 1.05),
            anySafetyIncident: previousRoundResults.some((row) => (row.safety_score ?? 100) < 70),
            hasPreviousRoundData: previousRoundResults.length > 0,
          });
          setLoading(false);
        }
      } catch (unknownError) {
        if (!cancelled) {
          const message = unknownError instanceof Error ? unknownError.message : "Failed to load market intelligence.";
          setError(message);
          setLoading(false);
        }
      }
    };

    setLoading(true);
    void fetchIntel();
    const intervalId = window.setInterval(() => void fetchIntel(), 30000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [roundNumber, sessionId, supabase, teamId]);

  const currentTeamEntry = snapshot?.leaderboard.find((entry) => entry.id === teamId) ?? null;
  const topThree = snapshot?.leaderboard.slice(0, 3) ?? [];
  const progress = snapshot && snapshot.teamCount > 0 ? snapshot.lockedCount / snapshot.teamCount : 0;
  const progressWidth = Math.round(progress * 100);
  const progressStyle = progressTone(progress);

  const signals = useMemo(() => {
    if (!snapshot) return [] as IntelSignal[];

    const nextSignals: IntelSignal[] = [];

    if (snapshot.hasPreviousRoundData) {
      if (snapshot.anyAheadOfSchedule) {
        nextSignals.push({
          icon: "bolt",
          tone: "positive",
          label: "At least one team delivered ahead of schedule last round",
        });
      } else if ((snapshot.averageSpi ?? 1) < 0.98) {
        nextSignals.push({
          icon: "pace",
          tone: "warning",
          label: "Schedule drag is building across the sector",
        });
      }

      if ((snapshot.averageCpi ?? 1) < 0.95) {
        nextSignals.push({
          icon: "coins",
          tone: "danger",
          label: "Most teams are reporting budget pressure this round",
        });
      } else if ((snapshot.averageCpi ?? 0) >= 1) {
        nextSignals.push({
          icon: "coins",
          tone: "positive",
          label: "Commercial discipline is holding across much of the market",
        });
      }

      if (snapshot.anySafetyIncident) {
        nextSignals.push({
          icon: "shield",
          tone: "danger",
          label: "Safety incidents reported across the sector last round",
        });
      }

      if (currentTeamEntry) {
        if (currentTeamEntry.currentRank > currentTeamEntry.previousRank) {
          nextSignals.push({
            icon: "down",
            tone: "warning",
            label: "Your rank has slipped - competitors are catching up",
          });
        } else if (currentTeamEntry.currentRank < currentTeamEntry.previousRank) {
          nextSignals.push({
            icon: "up",
            tone: "positive",
            label: "You moved up in rankings - maintain momentum",
          });
        }
      }
    } else {
      nextSignals.push({
        icon: "pace",
        tone: "neutral",
        label: "No sector benchmark yet - first-round results will create the first market read",
      });
    }

    nextSignals.push({
      icon: "score",
      tone: "neutral",
      label: `Average sector score: ${scoreFormatter.format(snapshot.averageTotalPoints)}`,
    });

    return nextSignals.slice(0, 4);
  }, [currentTeamEntry, snapshot]);

  return (
    <Card
      variant="elevated"
      className={`p-0 border-slate-800/90 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 ${compact ? "rounded-[24px]" : "rounded-[28px]"}`}
    >
      <div className={compact ? "space-y-5 p-5" : "space-y-6 p-6"}>
        <div className="flex items-start justify-between gap-4 border-b border-white/5 pb-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-amber-200">Market Intelligence</div>
            <div className="mt-2 text-lg font-black uppercase tracking-[0.04em] text-slate-50">
              {compact ? "Live market read" : "Sector pressure monitor"}
            </div>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-100">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
            <span>Live</span>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            <div className="h-4 w-2/3 animate-pulse rounded bg-white/10" />
            <div className="h-2 animate-pulse rounded-full bg-white/10" />
            <div className="grid gap-2">
              <div className="h-14 animate-pulse rounded-2xl bg-white/5" />
              <div className="h-14 animate-pulse rounded-2xl bg-white/5" />
            </div>
          </div>
        ) : (
          <>
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className={`text-sm font-semibold ${progressStyle.text}`}>
                  {snapshot?.lockedCount ?? 0} of {snapshot?.teamCount ?? 0} teams have locked decisions this round
                </div>
                <div className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${progressStyle.chip}`}>
                  {progressWidth}%
                </div>
              </div>
              <div className="h-2.5 rounded-full bg-slate-800/90">
                <div
                  className={`h-2.5 rounded-full transition-all duration-500 ${progressStyle.bar}`}
                  style={{ width: `${progressWidth}%` }}
                />
              </div>
            </section>

            {!compact ? (
              <section className="space-y-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Anonymous Competitor Signals</div>
                <div className="flex flex-wrap gap-2.5">
                  {signals.map((signal) => (
                    <div
                      key={signal.label}
                      className={`inline-flex max-w-full items-start gap-2 rounded-full border px-3 py-2 text-xs leading-5 ${toneClasses(signal.tone)}`}
                    >
                      <span className="mt-0.5 shrink-0" aria-hidden="true">
                        <SignalIcon icon={signal.icon} />
                      </span>
                      <span>{signal.label}</span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Leaderboard Mini</div>
                {currentTeamEntry ? (
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Your position #{currentTeamEntry.currentRank}
                  </div>
                ) : null}
              </div>
              <div className="space-y-2">
                {topThree.map((entry) => (
                  <LeaderboardRow
                    key={entry.id}
                    entry={entry}
                    compact={compact}
                    highlighted={entry.id === teamId}
                    label={entry.id === teamId ? "Your team" : undefined}
                  />
                ))}
                {currentTeamEntry && currentTeamEntry.currentRank > 3 ? (
                  <LeaderboardRow entry={currentTeamEntry} compact={compact} highlighted label="Your team" />
                ) : null}
              </div>
            </section>

            {error ? (
              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-3 py-3 text-xs text-rose-100">
                {error}
              </div>
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}
