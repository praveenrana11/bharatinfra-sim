"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { getSupabaseClient } from "@/lib/supabaseClient";
import {
  computeRoundResultV2,
  DecisionDraft,
  RoundResult,
} from "@/lib/simEngine";
import { buildDeterministicRoundDebrief, DebriefAction } from "@/lib/aiDebrief";
import { ConstructionEvent, getRoundConstructionEvents } from "@/lib/constructionNews";
import { parseDecisionProfile, DecisionProfile } from "@/lib/decisionProfile";
import { KpiTarget, parseKpiTarget, evaluateKpiAchievement, applyKpiMultiplier } from "@/lib/kpi";

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

type DebriefView = {
  summary: string;
  strengths: string[];
  risks: string[];
  actions: DebriefAction[];
  practice_focus_codes: string[];
};

type DecisionRow = {
  focus_cost: number;
  focus_quality: number;
  focus_stakeholder: number;
  focus_speed: number;
  risk_appetite: "Conservative" | "Balanced" | "Aggressive";
  governance_intensity: "Low" | "Medium" | "High";
  buffer_percent: number;
  vendor_strategy: "Cheapest" | "Balanced" | "Reliable";
  locked: boolean;
  raw: Record<string, unknown> | null;
};

type SessionRow = { round_count: number | null };
type MembershipRow = { team_id: string };
type TeamRow = { id: string; team_name: string; session_id: string; kpi_target: string | null };
type TeamScoreRow = { team_id: string; round_number: number; points_earned: number | null };

type LeaderboardViewRow = {
  team_id: string;
  team_name: string;
  total_points: number;
  round_points: number;
  previous_rank: number | null;
  rank: number;
  movement: number | null;
  is_my_team: boolean;
};
type ConceptRow = { id: string; code: string };
type MasteryRow = { concept_id: string; mastery_score: number; evidence_count: number };
type FeedbackRow = {
  summary: string;
  strengths: string[] | null;
  risks: string[] | null;
  actions: DebriefAction[] | null;
  raw: Record<string, unknown> | null;
};

type PrevDecisionRawRow = { raw: Record<string, unknown> | null };

type RouteParams = {
  sessionId?: string;
  roundNumber?: string;
  round?: string;
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

function toErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: string }).message;
    if (message) return message;
  }
  return fallback;
}

function buildLeaderboard(
  teams: TeamRow[],
  scores: TeamScoreRow[],
  currentRound: number,
  myTeamId: string
): LeaderboardViewRow[] {
  const totals = new Map<string, number>();
  const previousTotals = new Map<string, number>();
  const roundPoints = new Map<string, number>();

  for (const team of teams) {
    totals.set(team.id, 0);
    previousTotals.set(team.id, 0);
    roundPoints.set(team.id, 0);
  }

  for (const row of scores) {
    const points = row.points_earned ?? 0;
    totals.set(row.team_id, (totals.get(row.team_id) ?? 0) + points);

    if (row.round_number < currentRound) {
      previousTotals.set(row.team_id, (previousTotals.get(row.team_id) ?? 0) + points);
    }

    if (row.round_number === currentRound) {
      roundPoints.set(row.team_id, points);
    }
  }

  const currentSorted = [...teams]
    .map((team) => ({
      team_id: team.id,
      team_name: team.team_name,
      total_points: totals.get(team.id) ?? 0,
    }))
    .sort((a, b) => b.total_points - a.total_points || a.team_name.localeCompare(b.team_name));

  const previousSorted = [...teams]
    .map((team) => ({
      team_id: team.id,
      total_points: previousTotals.get(team.id) ?? 0,
      team_name: team.team_name,
    }))
    .sort((a, b) => b.total_points - a.total_points || a.team_name.localeCompare(b.team_name));

  const previousRankMap = new Map<string, number>();
  previousSorted.forEach((row, index) => previousRankMap.set(row.team_id, index + 1));

  return currentSorted.map((row, index) => {
    const rank = index + 1;
    const previousRank = currentRound > 1 ? (previousRankMap.get(row.team_id) ?? null) : null;
    const movement = previousRank === null ? null : previousRank - rank;

    return {
      team_id: row.team_id,
      team_name: row.team_name,
      total_points: row.total_points,
      round_points: roundPoints.get(row.team_id) ?? 0,
      previous_rank: previousRank,
      rank,
      movement,
      is_my_team: row.team_id === myTeamId,
    };
  });
}

export default function RoundResultsPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseClient(), []);

  const routeParams = params as RouteParams;
  const sessionId = routeParams.sessionId ?? "";
  const roundParam = routeParams.roundNumber ?? routeParams.round ?? "";
  const roundNumber = Number(roundParam);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [teamId, setTeamId] = useState<string>("");
  const [teamName, setTeamName] = useState<string>("");
  const [totalRounds, setTotalRounds] = useState<number>(0);
  const [result, setResult] = useState<TeamResultRow | null>(null);
  const [teamKpiTarget, setTeamKpiTarget] = useState<KpiTarget | null>(null);
  const [yearlyResults, setYearlyResults] = useState<TeamResultRow[]>([]);

  const [debrief, setDebrief] = useState<DebriefView | null>(null);
  const [debriefLoading, setDebriefLoading] = useState(false);
  const [debriefError, setDebriefError] = useState("");

  const [previousResult, setPreviousResult] = useState<TeamResultRow | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardViewRow[]>([]);
  const [leaderboardError, setLeaderboardError] = useState("");

  useEffect(() => {
    (async () => {
      setError("");
      setDebriefError("");
      setLoading(true);
      setDebriefLoading(false);
      setResult(null);
      setDebrief(null);

      if (!sessionId || !Number.isFinite(roundNumber) || roundNumber <= 0) {
        setError("Bad URL: round number missing/invalid.");
        setLoading(false);
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: sessionRowData, error: sErr } = await supabase
        .from("sessions")
        .select("round_count")
        .eq("id", sessionId)
        .maybeSingle();

      if (sErr) {
        setError(sErr.message);
        setLoading(false);
        return;
      }

      const sessionRow = sessionRowData as SessionRow | null;
      setTotalRounds(sessionRow?.round_count ?? 0);

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
      if (teamIds.length === 0) {
        setError("No team membership found.");
        setLoading(false);
        return;
      }

      const { data: teamsData, error: tErr } = await supabase
        .from("teams")
        .select("id,team_name,session_id,kpi_target")
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
      setTeamId(myTeam.id);
      setTeamName(myTeam.team_name);
      const activeTeamKpi = parseKpiTarget(myTeam.kpi_target);
      setTeamKpiTarget(activeTeamKpi);

      
      let prevRoundResult: TeamResultRow | null = null;

      if (roundNumber > 1) {
        const { data: prevRoundData, error: prevRoundErr } = await supabase
          .from("team_results")
          .select(
            "session_id,team_id,round_number,schedule_index,cost_index,cash_closing,quality_score,safety_score,stakeholder_score,claim_entitlement_score,points_earned,penalties,detail"
          )
          .eq("session_id", sessionId)
          .eq("team_id", myTeam.id)
          .eq("round_number", roundNumber - 1)
          .maybeSingle();

        if (prevRoundErr) {
          setError(prevRoundErr.message);
          setLoading(false);
          return;
        }

        prevRoundResult = (prevRoundData as TeamResultRow | null) ?? null;
      }

      setPreviousResult(prevRoundResult);

      let activeResult: TeamResultRow | null = null;

      const { data: rRowData, error: rErr } = await supabase
        .from("team_results")
        .select(
          "session_id,team_id,round_number,schedule_index,cost_index,cash_closing,quality_score,safety_score,stakeholder_score,claim_entitlement_score,points_earned,penalties,detail"
        )
        .eq("session_id", sessionId)
        .eq("team_id", myTeam.id)
        .eq("round_number", roundNumber)
        .maybeSingle();

      if (rErr) {
        setError(rErr.message);
        setLoading(false);
        return;
      }

      const existingResult = rRowData as TeamResultRow | null;

      const { data: decisionData, error: dErr } = await supabase
        .from("decisions")
        .select(
          "focus_cost,focus_quality,focus_stakeholder,focus_speed,risk_appetite,governance_intensity,buffer_percent,vendor_strategy,locked,raw"
        )
        .eq("session_id", sessionId)
        .eq("team_id", myTeam.id)
        .eq("round_number", roundNumber)
        .maybeSingle();

      if (dErr) {
        setError(dErr.message);
        setLoading(false);
        return;
      }

      const decision = decisionData as DecisionRow | null;

      if (existingResult) {
        activeResult = existingResult;
      } else {
        if (!decision || !decision.locked) {
          setError("This round is not locked yet. Please submit decisions first.");
          setLoading(false);
          return;
        }

        const draft: DecisionDraft = {
          focus_cost: decision.focus_cost,
          focus_quality: decision.focus_quality,
          focus_stakeholder: decision.focus_stakeholder,
          focus_speed: decision.focus_speed,
          risk_appetite: decision.risk_appetite,
          governance_intensity: decision.governance_intensity,
          buffer_percent: decision.buffer_percent,
          vendor_strategy: decision.vendor_strategy,
        };

        let prevResult: RoundResult | null = null;
        let prevProfile: DecisionProfile | null = null;

        if (roundNumber > 1) {
          const { data: prevResultData } = await supabase
            .from("team_results")
            .select(
              "schedule_index,cost_index,cash_closing,quality_score,safety_score,stakeholder_score,claim_entitlement_score,points_earned,penalties,detail"
            )
            .eq("session_id", sessionId)
            .eq("team_id", myTeam.id)
            .eq("round_number", roundNumber - 1)
            .maybeSingle();

          if (prevResultData) {
            prevResult = {
              ...(prevResultData as Omit<RoundResult, "detail">),
              detail: (prevResultData as { detail?: Record<string, unknown> }).detail ?? {},
            };
          }

          const { data: prevDecisionData } = await supabase
            .from("decisions")
            .select("raw")
            .eq("session_id", sessionId)
            .eq("team_id", myTeam.id)
            .eq("round_number", roundNumber - 1)
            .maybeSingle();

          const prevDecision = prevDecisionData as PrevDecisionRawRow | null;
          prevProfile = parseDecisionProfile(prevDecision?.raw);
        }

        const profile = parseDecisionProfile(decision.raw);
        const events = getRoundConstructionEvents(sessionId, roundNumber);
        const seed = `${sessionId}:${myTeam.id}:${roundNumber}`;

        const computed = computeRoundResultV2(draft, seed, {
          profile,
          events,
          prevResult,
          prevProfile,
        });

        const kpiEval = evaluateKpiAchievement(activeTeamKpi, computed);
        const boostedPoints = applyKpiMultiplier(computed.points_earned, kpiEval.achieved);

        const computedWithKpi: RoundResult = {
          ...computed,
          points_earned: boostedPoints,
          detail: {
            ...computed.detail,
            events,
            kpi: {
              target: activeTeamKpi,
              achieved: kpiEval.achieved,
              metric: kpiEval.metricKey,
              actual: kpiEval.actual,
              threshold: kpiEval.threshold,
              threshold_label: kpiEval.thresholdLabel,
              base_points: computed.points_earned,
              multiplied_points: boostedPoints,
              multiplier: kpiEval.achieved ? 4 : 1,
            },
          },
        };

        const { error: upErr } = await supabase.from("team_results").upsert(
          {
            session_id: sessionId,
            team_id: myTeam.id,
            round_number: roundNumber,
            schedule_index: computedWithKpi.schedule_index,
            cost_index: computedWithKpi.cost_index,
            cash_closing: computedWithKpi.cash_closing,
            quality_score: computedWithKpi.quality_score,
            safety_score: computedWithKpi.safety_score,
            stakeholder_score: computedWithKpi.stakeholder_score,
            claim_entitlement_score: computedWithKpi.claim_entitlement_score,
            points_earned: computedWithKpi.points_earned,
            penalties: computedWithKpi.penalties,
            detail: computedWithKpi.detail,
          },
          { onConflict: "session_id,team_id,round_number" }
        );

        if (upErr) {
          setError(upErr.message);
          setLoading(false);
          return;
        }

        activeResult = {
          session_id: sessionId,
          team_id: myTeam.id,
          round_number: roundNumber,
          ...computedWithKpi,
        };
      }
      setResult(activeResult);

      const { data: yearlyData, error: yearlyErr } = await supabase
        .from("team_results")
        .select(
          "session_id,team_id,round_number,schedule_index,cost_index,cash_closing,quality_score,safety_score,stakeholder_score,claim_entitlement_score,points_earned,penalties,detail"
        )
        .eq("session_id", sessionId)
        .eq("team_id", myTeam.id)
        .lte("round_number", roundNumber)
        .order("round_number", { ascending: true });

      if (!yearlyErr) {
        setYearlyResults((yearlyData ?? []) as TeamResultRow[]);
      }

      setLoading(false);

      try {
        const { data: allScoresData, error: scoreErr } = await supabase
          .from("team_results")
          .select("team_id,round_number,points_earned")
          .eq("session_id", sessionId);

        if (scoreErr) {
          setLeaderboardError(scoreErr.message);
        } else {
          const allScores = (allScoresData ?? []) as TeamScoreRow[];
          const table = buildLeaderboard(teams, allScores, roundNumber, myTeam.id);
          setLeaderboard(table);
        }
      } catch (unknownError: unknown) {
        setLeaderboardError(toErrorMessage(unknownError, "Failed to load leaderboard"));
      }
      try {
        setDebriefLoading(true);

        const { data: existingFeedbackData, error: fbErr } = await supabase
          .from("ai_feedback")
          .select("summary,strengths,risks,actions,raw")
          .eq("session_id", sessionId)
          .eq("team_id", myTeam.id)
          .eq("user_id", user.id)
          .eq("round_number", roundNumber)
          .eq("feedback_type", "round_debrief")
          .maybeSingle();

        if (fbErr && !isMissingTableError(fbErr.message)) {
          throw fbErr;
        }

        const existingFeedback = existingFeedbackData as FeedbackRow | null;

        if (existingFeedback) {
          const raw = existingFeedback.raw ?? {};
          const existingCodes = Array.isArray(raw.practice_focus_codes)
            ? raw.practice_focus_codes.map((code) => String(code))
            : [];

          setDebrief({
            summary: existingFeedback.summary,
            strengths: existingFeedback.strengths ?? [],
            risks: existingFeedback.risks ?? [],
            actions: existingFeedback.actions ?? [],
            practice_focus_codes: existingCodes,
          });
        } else {
          const generated = buildDeterministicRoundDebrief(activeResult, decision);
          const nowIso = new Date().toISOString();

          const { error: insertFeedbackErr } = await supabase.from("ai_feedback").upsert(
            {
              user_id: user.id,
              session_id: sessionId,
              team_id: myTeam.id,
              round_number: roundNumber,
              feedback_type: "round_debrief",
              summary: generated.summary,
              strengths: generated.strengths,
              risks: generated.risks,
              actions: generated.actions,
              model_name: generated.model_name,
              raw: {
                ...generated.raw,
                practice_focus_codes: generated.practice_focus_codes,
                concept_scores: generated.concept_scores,
              },
              updated_at: nowIso,
            },
            { onConflict: "user_id,session_id,team_id,round_number,feedback_type" }
          );

          if (insertFeedbackErr && !isMissingTableError(insertFeedbackErr.message)) {
            throw insertFeedbackErr;
          }

          const conceptCodes = Object.keys(generated.concept_scores);

          const { data: conceptRowsData, error: conceptErr } = await supabase
            .from("curriculum_concepts")
            .select("id,code")
            .in("code", conceptCodes);

          if (conceptErr && !isMissingTableError(conceptErr.message)) {
            throw conceptErr;
          }

          const conceptRows = (conceptRowsData ?? []) as ConceptRow[];
          if (conceptRows.length > 0) {
            const conceptIds = conceptRows.map((c) => c.id);
            const byCode = new Map<string, string>(conceptRows.map((c) => [c.code, c.id]));

            const { data: existingMasteryData, error: masteryErr } = await supabase
              .from("concept_mastery")
              .select("concept_id,mastery_score,evidence_count")
              .eq("user_id", user.id)
              .eq("session_id", sessionId)
              .eq("team_id", myTeam.id)
              .in("concept_id", conceptIds);

            if (masteryErr && !isMissingTableError(masteryErr.message)) {
              throw masteryErr;
            }

            const existingMastery = (existingMasteryData ?? []) as MasteryRow[];
            const prevByConceptId = new Map<string, MasteryRow>(
              existingMastery.map((row) => [row.concept_id, row])
            );

            const upserts = conceptCodes
              .map((code) => {
                const conceptId = byCode.get(code);
                if (!conceptId) return null;

                const signal = generated.concept_scores[code as keyof typeof generated.concept_scores];
                const prev = prevByConceptId.get(conceptId);

                const prevEvidence = prev?.evidence_count ?? 0;
                const prevScore = prev?.mastery_score ?? signal;
                const nextEvidence = prevEvidence + 1;
                const nextScore = Math.round((prevScore * prevEvidence + signal) / Math.max(nextEvidence, 1));

                return {
                  user_id: user.id,
                  session_id: sessionId,
                  team_id: myTeam.id,
                  concept_id: conceptId,
                  mastery_score: nextScore,
                  evidence_count: nextEvidence,
                  last_seen_at: nowIso,
                  updated_at: nowIso,
                };
              })
              .filter((row): row is {
                user_id: string;
                session_id: string;
                team_id: string;
                concept_id: string;
                mastery_score: number;
                evidence_count: number;
                last_seen_at: string;
                updated_at: string;
              } => row !== null);

            if (upserts.length > 0) {
              const { error: masteryUpsertErr } = await supabase.from("concept_mastery").upsert(upserts, {
                onConflict: "user_id,session_id,team_id,concept_id",
              });

              if (masteryUpsertErr && !isMissingTableError(masteryUpsertErr.message)) {
                throw masteryUpsertErr;
              }
            }
          }

          setDebrief({
            summary: generated.summary,
            strengths: generated.strengths,
            risks: generated.risks,
            actions: generated.actions,
            practice_focus_codes: generated.practice_focus_codes,
          });
        }

        await supabase.from("telemetry_events").insert({
          user_id: user.id,
          session_id: sessionId,
          team_id: myTeam.id,
          round_number: roundNumber,
          event_name: "round_results_viewed",
          event_payload: {
            source: "round_results_page",
          },
          client_ts: new Date().toISOString(),
        });
      } catch (unknownError: unknown) {
        const msg = toErrorMessage(unknownError, "Failed to build AI debrief");
        if (isMissingTableError(msg)) {
          setDebriefError("Telemetry/AI tables not found yet. Run the SQL migration first.");
        } else {
          setDebriefError(msg);
        }
      } finally {
        setDebriefLoading(false);
      }
    })();
  }, [router, sessionId, roundNumber, supabase]);

  async function handlePracticeNow() {
    const { data } = await supabase.auth.getUser();
    const user = data.user;

    if (user && teamId) {
      await supabase.from("telemetry_events").insert({
        user_id: user.id,
        session_id: sessionId,
        team_id: teamId,
        round_number: roundNumber,
        event_name: "practice_cta_clicked",
        event_payload: {
          source: "ai_debrief_card",
        },
        client_ts: new Date().toISOString(),
      });
    }

    router.push(`/sessions/${sessionId}/round/${roundNumber}/practice`);
  }

  const nextRound = roundNumber + 1;
  const canGoNext = totalRounds ? nextRound <= totalRounds : true;

  

  const myLeaderboardRow = leaderboard.find((row) => row.is_my_team) ?? null;

  const activeShocks: ConstructionEvent[] = useMemo(() => {
    if (!result) return [];

    const payload = (result.detail as { events?: unknown })?.events;
    if (!Array.isArray(payload)) return [];

    return payload.filter((item) => {
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
  }, [result]);

  function movementBadge(movement: number | null) {
    if (movement === null) return { text: "New", className: "bg-slate-100 text-slate-700" };
    if (movement > 0) return { text: `Up ${movement}`, className: "bg-emerald-100 text-emerald-700" };
    if (movement < 0) return { text: `Down ${Math.abs(movement)}`, className: "bg-rose-100 text-rose-700" };
    return { text: "No change", className: "bg-slate-100 text-slate-700" };
  }


  const fyLabel = `FY ${roundNumber}`;

  const kpiDetail = (result?.detail as { kpi?: Record<string, unknown> } | undefined)?.kpi ?? null;
  const effectiveKpiTarget =
    typeof kpiDetail?.target === "string" ? parseKpiTarget(kpiDetail.target) : teamKpiTarget;

  const computedKpiEval =
    result && effectiveKpiTarget ? evaluateKpiAchievement(effectiveKpiTarget, result as unknown as RoundResult) : null;

  const kpiAchieved =
    typeof kpiDetail?.achieved === "boolean" ? kpiDetail.achieved : (computedKpiEval?.achieved ?? false);

  const kpiThresholdLabel =
    typeof kpiDetail?.threshold_label === "string"
      ? kpiDetail.threshold_label
      : (computedKpiEval?.thresholdLabel ?? "No KPI target selected");

  const kpiBasePoints =
    typeof kpiDetail?.base_points === "number"
      ? kpiDetail.base_points
      : (result?.points_earned ?? 0);

  const kpiFinalPoints =
    typeof kpiDetail?.multiplied_points === "number"
      ? kpiDetail.multiplied_points
      : (result?.points_earned ?? 0);

  const kpiMultiplier =
    typeof kpiDetail?.multiplier === "number" ? kpiDetail.multiplier : (kpiAchieved ? 4 : 1);

  const yearlySummary = useMemo(() => {
    if (yearlyResults.length === 0) {
      return {
        years: 0,
        totalPoints: 0,
        avgSpi: 0,
        avgCpi: 0,
        avgQuality: 0,
        avgSafety: 0,
        kpiHitYears: 0,
      };
    }

    let totalPoints = 0;
    let totalSpi = 0;
    let totalCpi = 0;
    let totalQuality = 0;
    let totalSafety = 0;
    let kpiHitYears = 0;

    for (const row of yearlyResults) {
      totalPoints += row.points_earned ?? 0;
      totalSpi += row.schedule_index ?? 0;
      totalCpi += row.cost_index ?? 0;
      totalQuality += row.quality_score ?? 0;
      totalSafety += row.safety_score ?? 0;

      const rowKpi = (row.detail as { kpi?: Record<string, unknown> } | undefined)?.kpi;
      if (typeof rowKpi?.achieved === "boolean") {
        if (rowKpi.achieved) kpiHitYears += 1;
      } else if (teamKpiTarget) {
        if (evaluateKpiAchievement(teamKpiTarget, row as unknown as RoundResult).achieved) {
          kpiHitYears += 1;
        }
      }
    }

    const n = yearlyResults.length;
    return {
      years: n,
      totalPoints,
      avgSpi: totalSpi / n,
      avgCpi: totalCpi / n,
      avgQuality: totalQuality / n,
      avgSafety: totalSafety / n,
      kpiHitYears,
    };
  }, [teamKpiTarget, yearlyResults]);

  const metricComparison = result
    ? [
        {
          key: "spi",
          label: "SPI",
          current: result.schedule_index,
          previous: previousResult?.schedule_index ?? null,
          precision: 2,
        },
        {
          key: "cpi",
          label: "CPI",
          current: result.cost_index,
          previous: previousResult?.cost_index ?? null,
          precision: 2,
        },
        {
          key: "quality",
          label: "Quality",
          current: result.quality_score,
          previous: previousResult?.quality_score ?? null,
          precision: 0,
        },
        {
          key: "safety",
          label: "Safety",
          current: result.safety_score,
          previous: previousResult?.safety_score ?? null,
          precision: 0,
        },
        {
          key: "stakeholder",
          label: "Stakeholder",
          current: result.stakeholder_score,
          previous: previousResult?.stakeholder_score ?? null,
          precision: 0,
        },
        {
          key: "points",
          label: "Points",
          current: result.points_earned,
          previous: previousResult?.points_earned ?? null,
          precision: 0,
        },
      ]
    : [];

  return (
    <RequireAuth>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">
            Round {Number.isFinite(roundNumber) ? roundNumber : "?"} Results{" "}
            <span className="text-sm opacity-70">({teamName || "..."})</span>
          </h1>

          <div className="flex items-center gap-3 text-sm">
            <Link className="underline" href={`/sessions/${sessionId}/round/${roundNumber}/news`}>
              News Desk
            </Link>
            <Link className="underline" href={`/sessions/${sessionId}`}>
              Session
            </Link>
            <Link className="underline" href={`/sessions/${sessionId}/report`}>
              FY Report
            </Link>
          </div>
        </div>

        {loading ? <p className="mt-6 text-sm opacity-80">Loading...</p> : null}

        {error && !loading ? (
          <div className="mt-6 p-4 border border-red-300 bg-red-50 text-red-800 rounded space-y-3">
            <div>{error}</div>
            <div className="flex gap-3">
              <Link className="px-4 py-2 border rounded bg-white" href={`/sessions/${sessionId}/round/${roundNumber}`}>
                Go to Round {roundNumber} decisions
              </Link>
              <Link className="underline" href={`/sessions/${sessionId}`}>
                Session
              </Link>
            </div>
          </div>
        ) : null}

        {!loading && !error && result ? (
          <div className="mt-6 p-4 border rounded space-y-4">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                Points earned: <b>{result.points_earned}</b> (penalties: {result.penalties ?? 0})
              </div>
              <div>
                Cash closing: <b>{result.cash_closing}</b>
              </div>

              <div>
                Schedule index (SPI): <b>{result.schedule_index}</b>
              </div>
              <div>
                Cost index (CPI): <b>{result.cost_index}</b>
              </div>

              <div>
                Quality: <b>{result.quality_score}</b>
              </div>
              <div>
                Safety: <b>{result.safety_score}</b>
              </div>

              <div>
                Stakeholder: <b>{result.stakeholder_score}</b>
              </div>
              <div>
                Claims: <b>{result.claim_entitlement_score}</b>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-md border border-slate-200 bg-white p-4 space-y-2">
                <div className="text-sm font-semibold text-slate-900">Team KPI Performance</div>
                <div className="text-sm text-slate-700">
                  Target: <b>{effectiveKpiTarget ?? "Not selected"}</b>
                </div>
                <div className="text-sm text-slate-700">Threshold: {kpiThresholdLabel}</div>
                <div className="text-sm">
                  Status:{" "}
                  <span className={kpiAchieved ? "text-emerald-700 font-semibold" : "text-amber-700 font-semibold"}>
                    {kpiAchieved ? "Achieved" : "Not achieved"}
                  </span>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  KPI points: base <b>{kpiBasePoints}</b> x {kpiMultiplier} = <b>{kpiFinalPoints}</b>
                </div>
              </div>

              <div className="rounded-md border border-slate-200 bg-white p-4 space-y-2">
                <div className="text-sm font-semibold text-slate-900">{fyLabel} Year-End Report</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>Total years played: <b>{yearlySummary.years}</b></div>
                  <div>Total points: <b>{yearlySummary.totalPoints}</b></div>
                  <div>Avg SPI: <b>{yearlySummary.avgSpi.toFixed(2)}</b></div>
                  <div>Avg CPI: <b>{yearlySummary.avgCpi.toFixed(2)}</b></div>
                  <div>Avg Quality: <b>{yearlySummary.avgQuality.toFixed(0)}</b></div>
                  <div>Avg Safety: <b>{yearlySummary.avgSafety.toFixed(0)}</b></div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  KPI achieved in <b>{yearlySummary.kpiHitYears}</b> of <b>{yearlySummary.years}</b> years.
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_0.9fr]">
              <div className="rounded-md border border-slate-200 bg-white p-4 space-y-3">
                <div className="text-sm font-semibold text-slate-900">Round Comparison Dashboard</div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {metricComparison.map((metric) => {
                    const previous = metric.previous;
                    const delta = previous === null ? null : metric.current - previous;
                    const signedDelta =
                      delta === null
                        ? "N/A"
                        : `${delta > 0 ? "+" : ""}${delta.toFixed(metric.precision)}`;

                    return (
                      <div key={metric.key} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-600">{metric.label}</span>
                          <span className="font-semibold text-slate-900">
                            {metric.current.toFixed(metric.precision)}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">Delta vs previous: {signedDelta}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900">Leaderboard</h2>
                  {myLeaderboardRow ? (
                    <span className="text-xs text-slate-600">Your rank: #{myLeaderboardRow.rank}</span>
                  ) : null}
                </div>

                {leaderboardError ? (
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                    {leaderboardError}
                  </div>
                ) : null}

                <div className="space-y-2">
                  {leaderboard.slice(0, 6).map((row) => (
                    <div
                      key={row.team_id}
                      className={`rounded-lg border px-3 py-2 text-sm ${
                        row.is_my_team
                          ? "border-teal-300 bg-teal-50"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-900">#{row.rank} {row.team_name}</span>
                        <span className="text-xs text-slate-600">Total {row.total_points}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-xs">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">Round +{row.round_points}</span>
                        {(() => {
                          const badge = movementBadge(row.movement);
                          return <span className={`rounded-full px-2 py-0.5 ${badge.className}`}>{badge.text}</span>;
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">Round Shocks Applied</h2>
                <span className="text-xs text-slate-500">{activeShocks.length} active events</span>
              </div>

              {activeShocks.length > 0 ? (
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {activeShocks.map((event) => (
                    <div key={event.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-900">{event.title}</span>
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
                      <p className="mt-1 text-xs text-slate-600">{event.description}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-600">No external shock events were recorded for this round.</p>
              )}
            </div>

            <details className="text-sm">
              <summary className="cursor-pointer select-none">Debug details</summary>
              <pre className="mt-2 p-3 bg-slate-50 border rounded overflow-auto text-xs">
                {JSON.stringify(result.detail ?? {}, null, 2)}
              </pre>
            </details>

            <div className="rounded-md border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-slate-900">AI Debrief</h2>
                {debriefLoading ? <span className="text-xs text-slate-500">Generating...</span> : null}
              </div>

              {debriefError ? (
                <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                  {debriefError}
                </div>
              ) : null}

              {debrief ? (
                <>
                  <p className="text-sm text-slate-700">{debrief.summary}</p>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <div className="text-sm font-medium text-slate-900">Strengths</div>
                      <ul className="mt-1 text-sm text-slate-700 list-disc list-inside">
                        {debrief.strengths.map((s, i) => (
                          <li key={`s-${i}`}>{s}</li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <div className="text-sm font-medium text-slate-900">Risks</div>
                      <ul className="mt-1 text-sm text-slate-700 list-disc list-inside">
                        {debrief.risks.map((r, i) => (
                          <li key={`r-${i}`}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div>
                    <div className="text-sm font-medium text-slate-900">Recommended next actions</div>
                    <ul className="mt-1 text-sm text-slate-700 list-disc list-inside">
                      {debrief.actions.map((a, i) => (
                        <li key={`a-${i}`}>
                          <b>{a.title}:</b> {a.why} ({a.practice_minutes} min)
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="pt-1">
                    <button
                      className="px-4 py-2 border rounded bg-white hover:bg-slate-100"
                      onClick={handlePracticeNow}
                    >
                      Practice Now
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-600">Debrief will appear after telemetry tables are ready.</p>
              )}
            </div>

            <div className="flex flex-wrap gap-3 pt-2 items-center">
              <Link className="underline" href={`/sessions/${sessionId}/round/${roundNumber}`}>
                Back to decisions
              </Link>

              {canGoNext ? (
                <Link className="px-4 py-2 border rounded" href={`/sessions/${sessionId}/round/${nextRound}`}>
                  Proceed to Round {nextRound} decisions
                </Link>
              ) : (
                <Link className="px-4 py-2 border rounded" href={`/sessions/${sessionId}`}>
                  Finish / back to session
                </Link>
              )}

              <Link className="underline" href={`/sessions/${sessionId}/report`}>
                Full FY report
              </Link>

              <Link className="underline" href="/dashboard">
                Dashboard
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </RequireAuth>
  );
}







































