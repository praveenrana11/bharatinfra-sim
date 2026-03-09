"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { getSupabaseClient } from "@/lib/supabaseClient";

type RouteParams = {
  sessionId?: string;
  roundNumber?: string;
};

type TeamMembershipRow = {
  team_id: string;
};

type TeamRow = {
  id: string;
};

type AiFeedbackRawRow = {
  raw: Record<string, unknown> | null;
};

type ConceptRow = {
  id: string;
  code: string;
};

type PracticeItemRawRow = {
  id: string;
  concept_id: string;
  difficulty: number;
  prompt: string;
  options: unknown;
  answer_key: string;
  explanation: string | null;
};

type ConceptMasteryRow = {
  mastery_score: number;
  evidence_count: number;
};

type PracticeItemRow = {
  id: string;
  concept_id: string;
  difficulty: number;
  prompt: string;
  options: string[];
  answer_key: string;
  explanation: string | null;
};

type AttemptOutcome = {
  is_correct: boolean;
  explanation: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function toErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: string }).message;
    if (message) return message;
  }
  return fallback;
}

export default function PracticePage() {
  const params = useParams();
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseClient(), []);

  const routeParams = params as RouteParams;
  const sessionId = routeParams.sessionId ?? "";
  const roundNumber = Number(routeParams.roundNumber ?? "0");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [teamId, setTeamId] = useState("");
  const [items, setItems] = useState<PracticeItemRow[]>([]);
  const [selectedByItem, setSelectedByItem] = useState<Record<string, string>>({});
  const [outcomeByItem, setOutcomeByItem] = useState<Record<string, AttemptOutcome>>({});
  const [submittingItemId, setSubmittingItemId] = useState<string>("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      setItems([]);

      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: membershipsData, error: mErr } = await supabase
        .from("team_memberships")
        .select("team_id")
        .eq("user_id", user.id);

      if (mErr) {
        setError(mErr.message);
        setLoading(false);
        return;
      }

      const memberships = (membershipsData ?? []) as TeamMembershipRow[];
      const teamIds = memberships.map((m) => m.team_id);
      if (teamIds.length === 0) {
        setError("No team membership found.");
        setLoading(false);
        return;
      }

      const { data: teamsData, error: tErr } = await supabase
        .from("teams")
        .select("id")
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

      const myTeamId = teams[0].id;
      setTeamId(myTeamId);

      const { data: feedbackRowData } = await supabase
        .from("ai_feedback")
        .select("raw")
        .eq("session_id", sessionId)
        .eq("team_id", myTeamId)
        .eq("user_id", user.id)
        .eq("round_number", roundNumber)
        .eq("feedback_type", "round_debrief")
        .maybeSingle();

      const feedbackRow = feedbackRowData as AiFeedbackRawRow | null;
      const raw = feedbackRow?.raw ?? {};
      const focusCodes = Array.isArray(raw.practice_focus_codes)
        ? raw.practice_focus_codes.map((v) => String(v))
        : ["SCHED", "COST", "QUAL"];

      const { data: conceptsData, error: cErr } = await supabase
        .from("curriculum_concepts")
        .select("id,code")
        .in("code", focusCodes);

      if (cErr) {
        setError(cErr.message);
        setLoading(false);
        return;
      }

      const concepts = (conceptsData ?? []) as ConceptRow[];
      if (concepts.length === 0) {
        setError("No curriculum concepts found. Run migration seed step.");
        setLoading(false);
        return;
      }

      const conceptIds = concepts.map((c) => c.id);

      const { data: practiceRowsData, error: pErr } = await supabase
        .from("practice_items")
        .select("id,concept_id,difficulty,prompt,options,answer_key,explanation")
        .in("concept_id", conceptIds)
        .eq("is_active", true)
        .order("difficulty", { ascending: true })
        .limit(5);

      if (pErr) {
        setError(pErr.message);
        setLoading(false);
        return;
      }

      const normalized = ((practiceRowsData ?? []) as PracticeItemRawRow[]).map((row) => ({
        id: row.id,
        concept_id: row.concept_id,
        difficulty: Number(row.difficulty ?? 1),
        prompt: String(row.prompt ?? ""),
        options: Array.isArray(row.options) ? row.options.map((v) => String(v)) : [],
        answer_key: String(row.answer_key ?? ""),
        explanation: row.explanation ? String(row.explanation) : null,
      }));

      setItems(normalized);
      setLoading(false);
    })();
  }, [router, roundNumber, sessionId, supabase]);

  async function submitAttempt(item: PracticeItemRow) {
    setError("");

    const selected = selectedByItem[item.id];
    if (!selected) {
      setError("Please select an answer before submitting.");
      return;
    }

    setSubmittingItemId(item.id);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        router.replace("/login");
        return;
      }

      const isCorrect = selected === item.answer_key;

      const { error: insErr } = await supabase.from("practice_attempts").insert({
        user_id: user.id,
        session_id: sessionId,
        team_id: teamId,
        concept_id: item.concept_id,
        item_id: item.id,
        round_number: roundNumber,
        selected_answer: selected,
        is_correct: isCorrect,
        confidence: 3,
        latency_ms: null,
        attempt_payload: {
          source: "practice_page",
        },
      });

      if (insErr) throw insErr;

      const { data: existingData, error: existingErr } = await supabase
        .from("concept_mastery")
        .select("mastery_score,evidence_count")
        .eq("user_id", user.id)
        .eq("session_id", sessionId)
        .eq("team_id", teamId)
        .eq("concept_id", item.concept_id)
        .maybeSingle();

      if (existingErr) throw existingErr;

      const existing = existingData as ConceptMasteryRow | null;
      const prevScore = Number(existing?.mastery_score ?? 60);
      const prevEvidence = Number(existing?.evidence_count ?? 0);
      const delta = isCorrect ? 6 : -4;

      const nextScore = clamp(prevScore + delta, 0, 100);
      const nextEvidence = prevEvidence + 1;
      const nowIso = new Date().toISOString();

      const { error: masteryErr } = await supabase.from("concept_mastery").upsert(
        {
          user_id: user.id,
          session_id: sessionId,
          team_id: teamId,
          concept_id: item.concept_id,
          mastery_score: nextScore,
          evidence_count: nextEvidence,
          last_seen_at: nowIso,
          updated_at: nowIso,
        },
        { onConflict: "user_id,session_id,team_id,concept_id" }
      );

      if (masteryErr) throw masteryErr;

      await supabase.from("telemetry_events").insert({
        user_id: user.id,
        session_id: sessionId,
        team_id: teamId,
        round_number: roundNumber,
        event_name: "practice_attempt_submitted",
        event_payload: {
          item_id: item.id,
          concept_id: item.concept_id,
          is_correct: isCorrect,
        },
        client_ts: nowIso,
      });

      setOutcomeByItem((p) => ({
        ...p,
        [item.id]: {
          is_correct: isCorrect,
          explanation: item.explanation ?? "Review the reasoning and retry a similar question.",
        },
      }));
    } catch (unknownError: unknown) {
      setError(toErrorMessage(unknownError, "Failed to submit practice attempt"));
    } finally {
      setSubmittingItemId("");
    }
  }

  return (
    <RequireAuth>
      <div className="p-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Practice</h1>
          <Link className="underline" href={`/sessions/${sessionId}/round/${roundNumber}/results`}>
            Back to results
          </Link>
        </div>

        <p className="mt-2 text-sm text-slate-600">
          Round {roundNumber}: quick targeted practice based on your AI Debrief.
        </p>

        {loading ? <p className="mt-6 text-sm opacity-80">Loading practice...</p> : null}

        {error ? (
          <div className="mt-4 p-3 border border-red-300 bg-red-50 text-red-800 rounded">{error}</div>
        ) : null}

        {!loading && !error && items.length === 0 ? (
          <div className="mt-6 p-4 border rounded text-sm text-slate-700">
            No practice items found yet.
          </div>
        ) : null}

        {!loading && items.length > 0 ? (
          <div className="mt-6 space-y-4">
            {items.map((item, idx) => (
              <div key={item.id} className="p-4 border rounded space-y-3">
                <div className="text-sm text-slate-500">
                  Q{idx + 1} - Difficulty {item.difficulty}
                </div>
                <div className="font-medium text-slate-900">{item.prompt}</div>

                <div className="space-y-2">
                  {item.options.map((opt) => (
                    <label key={opt} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name={`item-${item.id}`}
                        value={opt}
                        checked={selectedByItem[item.id] === opt}
                        onChange={(e) =>
                          setSelectedByItem((p) => ({
                            ...p,
                            [item.id]: e.target.value,
                          }))
                        }
                      />
                      {opt}
                    </label>
                  ))}
                </div>

                <button
                  className="px-4 py-2 border rounded bg-white hover:bg-slate-100 disabled:opacity-50"
                  disabled={submittingItemId === item.id || Boolean(outcomeByItem[item.id])}
                  onClick={() => submitAttempt(item)}
                >
                  {submittingItemId === item.id ? "Submitting..." : "Submit answer"}
                </button>

                {outcomeByItem[item.id] ? (
                  <div
                    className={`text-sm rounded p-2 border ${
                      outcomeByItem[item.id].is_correct
                        ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                        : "bg-amber-50 border-amber-200 text-amber-800"
                    }`}
                  >
                    <div>
                      {outcomeByItem[item.id].is_correct ? "Correct." : "Not correct this time."}
                    </div>
                    <div className="mt-1">{outcomeByItem[item.id].explanation}</div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </RequireAuth>
  );
}
