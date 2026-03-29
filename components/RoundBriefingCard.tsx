"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";

import { parseConstructionEvents } from "@/lib/newsPayload";
import { getSupabaseClient } from "@/lib/supabaseClient";

type RoundBriefingCardProps = {
  sessionId: string;
  roundNumber: number;
  teamId: string;
};

type TeamRow = {
  identity_profile: Record<string, unknown> | null;
  scenario_id: string | null;
  total_points: number | null;
  kpi_target: string | null;
};

type ScenarioRow = {
  name: string | null;
  client: string | null;
  base_budget_cr: number | null;
  duration_rounds: number | null;
};

type PreviousResultRow = {
  schedule_index: number | null;
  cost_index: number | null;
  safety_score: number | null;
  stakeholder_score: number | null;
};

type SessionRoundRow = {
  news_payload: unknown;
};

type BriefingState = {
  projectName: string;
  client: string;
  totalRounds: number;
  baseBudgetCr: number | null;
  totalPoints: number;
  rank: number;
  totalTeams: number;
  previousResult: PreviousResultRow | null;
  eventTitle: string;
  eventDescription: string;
  positioningStrategy: string;
  primaryKpi: string;
};

type Tone = "good" | "warning" | "danger" | "neutral";

const DEFAULT_STATE: BriefingState = {
  projectName: "Project Scenario",
  client: "Client",
  totalRounds: 4,
  baseBudgetCr: null,
  totalPoints: 0,
  rank: 1,
  totalTeams: 0,
  previousResult: null,
  eventTitle: "",
  eventDescription: "",
  positioningStrategy: "Not selected",
  primaryKpi: "Not selected",
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function quarterForRound(roundNumber: number) {
  return `Q${((roundNumber - 1) % 4) + 1}`;
}

function fyForRound(roundNumber: number) {
  return Math.floor((roundNumber - 1) / 4) + 1;
}

function clientInitials(client: string) {
  const parts = client
    .split(/[\s/&-]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) return "CL";
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "CL";
}

function toneClasses(tone: Tone) {
  switch (tone) {
    case "good":
      return "border-emerald-400/30 bg-emerald-500/12 text-emerald-100";
    case "warning":
      return "border-amber-400/30 bg-amber-500/12 text-amber-100";
    case "danger":
      return "border-rose-400/30 bg-rose-500/12 text-rose-100";
    default:
      return "border-white/10 bg-white/5 text-slate-100";
  }
}

function accentClasses(tone: Tone) {
  switch (tone) {
    case "good":
      return "bg-emerald-400";
    case "warning":
      return "bg-amber-400";
    case "danger":
      return "bg-rose-400";
    default:
      return "bg-slate-400";
  }
}

function budgetTone(cpi: number): Tone {
  if (cpi > 0.95) return "good";
  if (cpi >= 0.8) return "warning";
  return "danger";
}

function scheduleTone(spi: number): Tone {
  if (spi > 0.95) return "good";
  if (spi >= 0.8) return "warning";
  return "danger";
}

function safetyTone(score: number): Tone {
  if (score < 70) return "danger";
  if (score < 85) return "warning";
  return "good";
}

function stakeholderTone(score: number): Tone {
  if (score < 65) return "danger";
  if (score < 80) return "warning";
  return "good";
}

function formatBudgetStatus(cpi: number) {
  const consumedPercent = Math.round(clamp((1 / Math.max(cpi, 0.01)) * 100, 0, 250));
  return `${consumedPercent}% used`;
}

function formatIndex(value: number) {
  return value.toFixed(2);
}

function formatScore(value: number) {
  return `${Math.round(value)}`;
}

function formatCr(value: number | null) {
  if (value === null) return "Budget pending";
  return `Base budget Rs ${Math.round(value)} cr`;
}

function MetricIcon({ children }: { children: string }) {
  return (
    <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-slate-950/40 text-sm font-black tracking-[0.24em] text-white">
      {children}
    </span>
  );
}

function ArrowTrendIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4">
      <path
        d="M5 16l5-5 3 3 6-7"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M15 7h4v4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4">
      <path
        d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M9.5 12.5l1.7 1.7 3.8-4.2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4">
      <path
        d="M8 11a3 3 0 100-6 3 3 0 000 6zm8 1a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM4 19a4 4 0 018 0m4 0a3.5 3.5 0 017 0"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4">
      <path
        d="M12 4l8 14H4l8-14z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M12 9v4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="16.5" r="1" fill="currentColor" />
    </svg>
  );
}

function MetricTile({
  label,
  value,
  helper,
  tone,
  icon,
}: {
  label: string;
  value: string;
  helper: string;
  tone: Tone;
  icon: ReactNode;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${toneClasses(tone)}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-300/90">{label}</div>
          <div className="mt-3 text-2xl font-black tracking-tight text-white">{value}</div>
        </div>
        <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl text-white ${accentClasses(tone)}`}>
          {icon}
        </div>
      </div>
      <div className="mt-3 text-xs text-slate-300/80">{helper}</div>
    </div>
  );
}

export default function RoundBriefingCard({
  sessionId,
  roundNumber,
  teamId,
}: RoundBriefingCardProps) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [state, setState] = useState<BriefingState>(DEFAULT_STATE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!sessionId || !teamId || roundNumber <= 0) {
        if (!cancelled) {
          setState(DEFAULT_STATE);
          setLoading(false);
        }
        return;
      }

      setLoading(true);

      const { data: teamData, error: teamError } = await supabase
        .from("teams")
        .select("identity_profile,scenario_id,total_points,kpi_target")
        .eq("id", teamId)
        .maybeSingle();

      if (teamError || !teamData) {
        if (!cancelled) {
          setState(DEFAULT_STATE);
          setLoading(false);
        }
        return;
      }

      const team = teamData as TeamRow;
      const totalPoints = team.total_points ?? 0;
      const identityProfile =
        team.identity_profile && typeof team.identity_profile === "object"
          ? team.identity_profile
          : {};

      const previousRoundPromise =
        roundNumber > 1
          ? supabase
              .from("team_results")
              .select("schedule_index,cost_index,safety_score,stakeholder_score")
              .eq("session_id", sessionId)
              .eq("team_id", teamId)
              .eq("round_number", roundNumber - 1)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null });

      const scenarioPromise = team.scenario_id
        ? supabase
            .from("project_scenarios")
            .select("name,client,base_budget_cr,duration_rounds")
            .eq("id", team.scenario_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null });

      const [scenarioResult, previousResult, roundResult, higherTeamsResult, totalTeamsResult] =
        await Promise.all([
          scenarioPromise,
          previousRoundPromise,
          supabase
            .from("session_rounds")
            .select("news_payload")
            .eq("session_id", sessionId)
            .eq("round_number", roundNumber)
            .maybeSingle(),
          supabase
            .from("teams")
            .select("id", { head: true, count: "exact" })
            .eq("session_id", sessionId)
            .gt("total_points", totalPoints),
          supabase
            .from("teams")
            .select("id", { head: true, count: "exact" })
            .eq("session_id", sessionId),
        ]);

      const scenario = (scenarioResult.data as ScenarioRow | null) ?? null;
      const previousRound = (previousResult.data as PreviousResultRow | null) ?? null;
      const currentRound = (roundResult.data as SessionRoundRow | null) ?? null;

      const parsedEvents = parseConstructionEvents(currentRound?.news_payload) ?? [];
      const activeEvent = parsedEvents[0];

      const nextState: BriefingState = {
        projectName: toText(scenario?.name, DEFAULT_STATE.projectName),
        client: toText(scenario?.client, DEFAULT_STATE.client),
        totalRounds: Math.max(scenario?.duration_rounds ?? DEFAULT_STATE.totalRounds, roundNumber),
        baseBudgetCr: toNumber(scenario?.base_budget_cr),
        totalPoints,
        rank: Math.max((higherTeamsResult.count ?? 0) + 1, 1),
        totalTeams: totalTeamsResult.count ?? 0,
        previousResult: previousRound,
        eventTitle: activeEvent?.title ?? "",
        eventDescription: activeEvent?.description ?? "",
        positioningStrategy: toText(identityProfile.positioning_strategy, "Not selected"),
        primaryKpi: toText(identityProfile.primary_kpi, team.kpi_target ?? "Not selected"),
      };

      if (!cancelled) {
        setState(nextState);
        setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [roundNumber, sessionId, supabase, teamId]);

  const isBaseline = roundNumber === 1 || !state.previousResult;
  const quarterLabel = quarterForRound(roundNumber);
  const fyLabel = fyForRound(roundNumber);
  const clientBadge = clientInitials(state.client);

  const budgetTile = isBaseline
    ? {
        value: "Baseline",
        helper: "Round 1",
        tone: "neutral" as Tone,
      }
    : {
        value: formatBudgetStatus(state.previousResult?.cost_index ?? 1),
        helper: `Last CPI ${formatIndex(state.previousResult?.cost_index ?? 1)}`,
        tone: budgetTone(state.previousResult?.cost_index ?? 1),
      };

  const scheduleTile = isBaseline
    ? {
        value: "Baseline",
        helper: "Round 1",
        tone: "neutral" as Tone,
      }
    : {
        value: formatIndex(state.previousResult?.schedule_index ?? 1),
        helper: "Schedule performance index",
        tone: scheduleTone(state.previousResult?.schedule_index ?? 1),
      };

  const safetyTile = isBaseline
    ? {
        value: "Baseline",
        helper: "Round 1",
        tone: "neutral" as Tone,
      }
    : {
        value: formatScore(state.previousResult?.safety_score ?? 0),
        helper: "Safety score",
        tone: safetyTone(state.previousResult?.safety_score ?? 0),
      };

  const stakeholderTile = isBaseline
    ? {
        value: "Baseline",
        helper: "Round 1",
        tone: "neutral" as Tone,
      }
    : {
        value: formatScore(state.previousResult?.stakeholder_score ?? 0),
        helper: "Stakeholder score",
        tone: stakeholderTone(state.previousResult?.stakeholder_score ?? 0),
      };

  return (
    <section className="glass-panel overflow-hidden rounded-[28px] border border-white/10 shadow-[0_24px_70px_rgba(15,23,42,0.45)]">
      <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.24),transparent_38%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.16),transparent_28%),linear-gradient(135deg,#0f172a_0%,#111827_45%,#1e293b_100%)] px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-lg font-black tracking-[0.28em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
              {clientBadge}
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-blue-200/80">Round Briefing</div>
              <div className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">{state.projectName}</div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-300">
                <span>{state.client}</span>
                <span className="h-1 w-1 rounded-full bg-slate-500" />
                <span>{formatCr(state.baseBudgetCr)}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:items-end">
            <div className="rounded-full border border-blue-400/20 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-100">
              {`Round ${roundNumber} of ${state.totalRounds} - ${quarterLabel} FY${fyLabel}`}
            </div>
            <div className="rounded-full border border-amber-400/25 bg-amber-500/12 px-4 py-2 text-sm font-semibold text-amber-100">
              {`Rank ${state.rank} of ${Math.max(state.totalTeams, 1)} teams`}
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 py-5 sm:px-6">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricTile
            label="Budget Status"
            value={budgetTile.value}
            helper={budgetTile.helper}
            tone={budgetTile.tone}
            icon={<ArrowTrendIcon />}
          />
          <MetricTile
            label="Schedule Status"
            value={scheduleTile.value}
            helper={scheduleTile.helper}
            tone={scheduleTile.tone}
            icon={<ArrowTrendIcon />}
          />
          <MetricTile
            label="Safety"
            value={safetyTile.value}
            helper={safetyTile.helper}
            tone={safetyTile.tone}
            icon={<ShieldIcon />}
          />
          <MetricTile
            label="Stakeholder"
            value={stakeholderTile.value}
            helper={stakeholderTile.helper}
            tone={stakeholderTile.tone}
            icon={<PeopleIcon />}
          />
        </div>

        {state.eventTitle ? (
          <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/12 px-4 py-4 text-amber-50">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400 text-slate-950">
                <WarningIcon />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-black uppercase tracking-[0.24em] text-amber-200">Site Event</div>
                <div className="mt-1 text-lg font-bold text-white">{state.eventTitle}</div>
                <div className="mt-1 text-sm text-amber-100/90">{state.eventDescription}</div>
                <div className="mt-2 text-xs font-semibold uppercase tracking-[0.22em] text-amber-200/80">
                  This will affect your score this round
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-1 gap-3 border-t border-white/10 pt-4 md:grid-cols-2">
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <MetricIcon>PS</MetricIcon>
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Your positioning</div>
              <div className="truncate text-sm font-semibold text-white">
                {loading ? "Loading..." : state.positioningStrategy}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <MetricIcon>KP</MetricIcon>
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Primary KPI</div>
              <div className="truncate text-sm font-semibold text-white">
                {loading ? "Loading..." : state.primaryKpi}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
