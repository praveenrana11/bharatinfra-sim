"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { getRoundConstructionEvents, ConstructionEvent } from "@/lib/constructionNews";
import { parseConstructionEvents, csvToTags, tagsToCsv, makeNewsEventId } from "@/lib/newsPayload";
import { getNewsImageUrl } from "@/lib/newsVisuals";
import { ROUND_NEWS_TEMPLATES, buildTemplateEvents, getRoundNewsTemplate } from "@/lib/newsTemplates";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type HostedSession = {
  id: string;
  code: string;
  name: string | null;
  status: string;
  round_count: number;
  current_round: number;
  created_at: string;
};

type TeamRow = {
  id: string;
  session_id: string;
  team_name: string;
  total_points: number | null;
  kpi_target: string | null;
};

type SessionRoundRow = {
  status: string | null;
  deadline_at: string;
  news_payload: unknown;
  updated_at: string;
  closed_at: string | null;
  closed_by: string | null;
};

type CustomTemplateRow = {
  id: string;
  name: string;
  description: string;
  sector_tags: string[] | null;
  visibility_scope: "private" | "session";
  session_id: string | null;
  template_payload: unknown;
  created_at: string;
};

type EditableNewsEvent = {
  id: string;
  title: string;
  description: string;
  image_url: string;
  tags_csv: string;
  severity: 1 | 2 | 3;
  impact_schedule: number;
  impact_cost: number;
  impact_quality: number;
  impact_safety: number;
  impact_stakeholder: number;
  impact_cash: number;
};

const DEFAULT_ROUND_WINDOW_MINUTES = 35;

function clampRound(roundNumber: number, roundCount: number) {
  if (roundCount <= 0) return 1;
  return Math.min(Math.max(roundNumber, 1), roundCount);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function asNumber(value: string, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

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

function formatDateTime(iso: string | null) {
  if (!iso) return "Not set";
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return "Invalid date";
  return new Date(parsed).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function toEditableEvent(event: ConstructionEvent): EditableNewsEvent {
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    image_url: event.image_url ?? "",
    tags_csv: tagsToCsv(event.tags),
    severity: event.severity,
    impact_schedule: event.impacts.schedule,
    impact_cost: event.impacts.cost,
    impact_quality: event.impacts.quality,
    impact_safety: event.impacts.safety,
    impact_stakeholder: event.impacts.stakeholder,
    impact_cash: event.impacts.cash,
  };
}

function makeBlankDraft(index: number): EditableNewsEvent {
  return {
    id: `custom-${index + 1}`,
    title: `Custom Event ${index + 1}`,
    description: "Describe the event for this round and how teams should respond.",
    image_url: "",
    tags_csv: "general, custom",
    severity: 2,
    impact_schedule: -0.02,
    impact_cost: -0.02,
    impact_quality: -1,
    impact_safety: -1,
    impact_stakeholder: -1,
    impact_cash: -25000,
  };
}

function draftToConstructionEvents(draft: EditableNewsEvent[]) {
  return draft.map((event, index): ConstructionEvent => {
    const title = event.title.trim() || `Custom Event ${index + 1}`;
    const description = event.description.trim() || "No description provided.";
    const id = makeNewsEventId(event.id.trim() || title, index);

    return {
      id,
      title,
      description,
      image_url: event.image_url.trim() || undefined,
      severity: event.severity,
      tags: csvToTags(event.tags_csv),
      impacts: {
        schedule: clamp(event.impact_schedule, -0.2, 0.2),
        cost: clamp(event.impact_cost, -0.2, 0.2),
        quality: clamp(event.impact_quality, -20, 20),
        safety: clamp(event.impact_safety, -20, 20),
        stakeholder: clamp(event.impact_stakeholder, -20, 20),
        cash: clamp(event.impact_cash, -500000, 500000),
      },
    };
  });
}

export default function AdminPage() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [savingNewsDraft, setSavingNewsDraft] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [userId, setUserId] = useState("");
  const [hostedSessions, setHostedSessions] = useState<HostedSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");

  const [teamRows, setTeamRows] = useState<TeamRow[]>([]);
  const [roundControl, setRoundControl] = useState(1);
  const [roundRow, setRoundRow] = useState<SessionRoundRow | null>(null);
  const [newsDraft, setNewsDraft] = useState<EditableNewsEvent[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(ROUND_NEWS_TEMPLATES[0]?.id ?? "");
  const [customTemplates, setCustomTemplates] = useState<CustomTemplateRow[]>([]);
  const [selectedCustomTemplateId, setSelectedCustomTemplateId] = useState("");
  const [customTemplateName, setCustomTemplateName] = useState("");
  const [customTemplateDescription, setCustomTemplateDescription] = useState("");
  const [customTemplateSectorCsv, setCustomTemplateSectorCsv] = useState("");
  const [customTemplateScope, setCustomTemplateScope] = useState<"private" | "session">("private");
  const [savingCustomTemplate, setSavingCustomTemplate] = useState(false);
  const [deletingCustomTemplateId, setDeletingCustomTemplateId] = useState("");
  const [customTemplatesReady, setCustomTemplatesReady] = useState(true);

  const selectedSession = hostedSessions.find((session) => session.id === selectedSessionId) ?? null;
  const selectedTemplate = useMemo(() => getRoundNewsTemplate(selectedTemplateId), [selectedTemplateId]);
  const selectedCustomTemplate = useMemo(
    () => customTemplates.find((template) => template.id === selectedCustomTemplateId) ?? null,
    [customTemplates, selectedCustomTemplateId]
  );
  const defaultRoundEvents = useMemo(
    () => (selectedSession ? getRoundConstructionEvents(selectedSession.id, roundControl) : []),
    [selectedSession, roundControl]
  );

  const effectiveDraftEvents = useMemo(
    () => (newsDraft.length > 0 ? draftToConstructionEvents(newsDraft) : defaultRoundEvents),
    [newsDraft, defaultRoundEvents]
  );

  async function loadCustomTemplates(currentUserId: string) {
    if (!customTemplatesReady) return;

    const { data, error: templateErr } = await supabase
      .from("news_templates")
      .select("id,name,description,sector_tags,visibility_scope,session_id,template_payload,created_at")
      .eq("created_by", currentUserId)
      .order("created_at", { ascending: false });

    if (templateErr) {
      if (isMissingTableError(templateErr.message)) {
        setCustomTemplatesReady(false);
        setCustomTemplates([]);
        return;
      }

      setError(templateErr.message);
      setCustomTemplates([]);
      return;
    }

    setCustomTemplatesReady(true);
    const rows = (data ?? []) as CustomTemplateRow[];
    setCustomTemplates(rows);

    if (!selectedCustomTemplateId && rows[0]?.id) {
      setSelectedCustomTemplateId(rows[0].id);
    }
  }

  async function loadHostedSessions() {
    setError("");

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;

    if (!user) {
      router.replace("/login");
      return;
    }

    setUserId(user.id);
    await loadCustomTemplates(user.id);

    const { data, error: sessionErr } = await supabase
      .from("sessions")
      .select("id,code,name,status,round_count,current_round,created_at")
      .eq("created_by", user.id)
      .order("created_at", { ascending: false });

    if (sessionErr) {
      setError(sessionErr.message);
      setHostedSessions([]);
      setSelectedSessionId("");
      return;
    }

    const rows = (data ?? []) as HostedSession[];
    setHostedSessions(rows);

    if (rows.length === 0) {
      setSelectedSessionId("");
      setRoundControl(1);
      return;
    }

    const nextSelected = rows.some((row) => row.id === selectedSessionId) ? selectedSessionId : rows[0].id;
    setSelectedSessionId(nextSelected);

    const selected = rows.find((row) => row.id === nextSelected) ?? rows[0];
    const suggestedRound = clampRound((selected.current_round ?? 0) + 1, selected.round_count ?? 1);
    setRoundControl(suggestedRound);
  }

  async function loadTeams(sessionId: string) {
    const { data, error: teamErr } = await supabase
      .from("teams")
      .select("id,session_id,team_name,total_points,kpi_target")
      .eq("session_id", sessionId)
      .order("total_points", { ascending: false });

    if (teamErr) {
      setError(teamErr.message);
      setTeamRows([]);
      return;
    }

    setTeamRows((data ?? []) as TeamRow[]);
  }
  async function loadRoundState(sessionId: string, roundNumber: number) {
    const { data, error: roundErr } = await supabase
      .from("session_rounds")
      .select("status,deadline_at,news_payload,updated_at,closed_at,closed_by")
      .eq("session_id", sessionId)
      .eq("round_number", roundNumber)
      .maybeSingle();

    if (roundErr) {
      if (!isMissingTableError(roundErr.message)) {
        setError(roundErr.message);
      }
      setRoundRow(null);
      return;
    }

    setRoundRow((data as SessionRoundRow | null) ?? null);
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadHostedSessions();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedSession) {
      setTeamRows([]);
      setRoundRow(null);
      return;
    }

    setRoundControl((prev) => clampRound(prev, selectedSession.round_count));

    (async () => {
      await loadTeams(selectedSession.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSessionId]);

  useEffect(() => {
    if (!selectedSession) return;

    (async () => {
      await loadRoundState(selectedSession.id, roundControl);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSessionId, roundControl]);

  useEffect(() => {
    const fromRow = parseConstructionEvents(roundRow?.news_payload);
    const seed = fromRow ?? defaultRoundEvents;
    setNewsDraft(seed.map(toEditableEvent));
  }, [roundRow, defaultRoundEvents]);

  function updateDraftEvent(index: number, patch: Partial<EditableNewsEvent>) {
    setNewsDraft((prev) => prev.map((event, i) => (i === index ? { ...event, ...patch } : event)));
  }

  function addDraftEvent() {
    setNewsDraft((prev) => [...prev, makeBlankDraft(prev.length)]);
  }

  function removeDraftEvent(index: number) {
    setNewsDraft((prev) => prev.filter((_, i) => i !== index));
  }

  function applyTemplate(templateId: string) {
    const templateEvents = buildTemplateEvents(templateId, roundControl);
    if (templateEvents.length === 0) {
      setError("Template not found. Please choose another template.");
      return;
    }

    const template = getRoundNewsTemplate(templateId);
    setNewsDraft(templateEvents.map(toEditableEvent));
    setSelectedTemplateId(templateId);
    setError("");
    setMessage(`Template applied: ${template?.name ?? templateId}`);
  }

  function resetNewsToDeterministicDefault() {
    setNewsDraft(defaultRoundEvents.map(toEditableEvent));
    setError("");
    setMessage("Reset to deterministic default round events.");
  }

  async function saveCurrentAsCustomTemplate() {
    if (!userId) return;
    if (!customTemplatesReady) {
      setError("Custom templates are unavailable until the SQL migration is run.");
      return;
    }

    const trimmedName = customTemplateName.trim();
    if (trimmedName.length < 3) {
      setError("Template name must be at least 3 characters.");
      return;
    }

    const scope = customTemplateScope;
    const sessionIdForScope = scope === "session" ? selectedSession?.id ?? null : null;
    if (scope === "session" && !sessionIdForScope) {
      setError("Select a session before saving a session-shared template.");
      return;
    }

    setSavingCustomTemplate(true);
    setError("");
    setMessage("");

    try {
      const payloadEvents = draftToConstructionEvents(newsDraft);

      const { data, error: insertErr } = await supabase
        .from("news_templates")
        .insert({
          name: trimmedName,
          description: customTemplateDescription.trim(),
          sector_tags: csvToTags(customTemplateSectorCsv),
          visibility_scope: scope,
          session_id: sessionIdForScope,
          template_payload: payloadEvents,
          created_by: userId,
        })
        .select("id")
        .single();

      if (insertErr) throw insertErr;

      await loadCustomTemplates(userId);
      setSelectedCustomTemplateId(data.id);
      setCustomTemplateName("");
      setCustomTemplateDescription("");
      setCustomTemplateSectorCsv("");
      setCustomTemplateScope("private");
      setMessage("Custom template saved.");
    } catch (unknownError: unknown) {
      const messageText = unknownError instanceof Error ? unknownError.message : "Failed to save custom template";
      setError(messageText);
    } finally {
      setSavingCustomTemplate(false);
    }
  }

  function applyCustomTemplate(templateId: string) {
    if (!customTemplatesReady) {
      setError("Custom templates are unavailable until the SQL migration is run.");
      return;
    }

    const template = customTemplates.find((row) => row.id === templateId);
    if (!template) {
      setError("Custom template not found.");
      return;
    }

    const parsed = parseConstructionEvents(template.template_payload);
    if (!parsed || parsed.length === 0) {
      setError("Selected custom template has invalid events.");
      return;
    }

    setNewsDraft(parsed.map(toEditableEvent));
    setSelectedCustomTemplateId(templateId);
    setError("");
    setMessage(`Custom template applied: ${template.name}`);
  }

  async function deleteCustomTemplate(templateId: string) {
    if (!userId || !templateId) return;
    if (!customTemplatesReady) {
      setError("Custom templates are unavailable until the SQL migration is run.");
      return;
    }

    setDeletingCustomTemplateId(templateId);
    setError("");
    setMessage("");

    try {
      const { error: deleteErr } = await supabase
        .from("news_templates")
        .delete()
        .eq("id", templateId)
        .eq("created_by", userId);

      if (deleteErr) throw deleteErr;

      await loadCustomTemplates(userId);
      if (selectedCustomTemplateId === templateId) {
        setSelectedCustomTemplateId("");
      }
      setMessage("Custom template deleted.");
    } catch (unknownError: unknown) {
      const messageText = unknownError instanceof Error ? unknownError.message : "Failed to delete custom template";
      setError(messageText);
    } finally {
      setDeletingCustomTemplateId("");
    }
  }

  async function saveNewsDraft() {
    if (!selectedSession || !userId) return;

    setSavingNewsDraft(true);
    setError("");
    setMessage("");

    try {
      const payloadEvents = draftToConstructionEvents(newsDraft);
      const status = roundRow?.status ?? "closed";
      const deadlineIso = roundRow?.deadline_at ?? new Date(Date.now() + DEFAULT_ROUND_WINDOW_MINUTES * 60_000).toISOString();
      const closedAt = status === "closed" ? roundRow?.closed_at ?? new Date().toISOString() : null;
      const closedBy = status === "closed" ? roundRow?.closed_by ?? userId : null;

      const { error: upErr } = await supabase.from("session_rounds").upsert(
        {
          session_id: selectedSession.id,
          round_number: roundControl,
          status,
          deadline_at: deadlineIso,
          news_payload: payloadEvents,
          created_by: userId,
          closed_at: closedAt,
          closed_by: closedBy,
        },
        { onConflict: "session_id,round_number" }
      );

      if (upErr) throw upErr;

      setMessage(`News draft saved for round ${roundControl}.`);
      await loadRoundState(selectedSession.id, roundControl);
    } catch (unknownError: unknown) {
      const messageText = unknownError instanceof Error ? unknownError.message : "Failed to save news draft";
      setError(messageText);
    } finally {
      setSavingNewsDraft(false);
    }
  }

  async function openRound() {
    if (!selectedSession || !userId) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const payloadEvents = draftToConstructionEvents(newsDraft);
      const deadlineIso = new Date(Date.now() + DEFAULT_ROUND_WINDOW_MINUTES * 60_000).toISOString();

      const { error: roundErr } = await supabase.from("session_rounds").upsert(
        {
          session_id: selectedSession.id,
          round_number: roundControl,
          status: "open",
          deadline_at: deadlineIso,
          news_payload: payloadEvents,
          created_by: userId,
          closed_at: null,
          closed_by: null,
        },
        { onConflict: "session_id,round_number" }
      );
      if (roundErr) throw roundErr;

      const { error: sessionErr } = await supabase
        .from("sessions")
        .update({ status: "in_progress" })
        .eq("id", selectedSession.id)
        .eq("created_by", userId);
      if (sessionErr) throw sessionErr;

      setMessage(`Round ${roundControl} opened with ${DEFAULT_ROUND_WINDOW_MINUTES} minute deadline.`);
      await Promise.all([loadRoundState(selectedSession.id, roundControl), loadHostedSessions()]);
    } catch (unknownError: unknown) {
      const messageText = unknownError instanceof Error ? unknownError.message : "Failed to open round";
      setError(messageText);
    } finally {
      setBusy(false);
    }
  }

  async function closeRound() {
    if (!selectedSession || !userId) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const nowIso = new Date().toISOString();
      const payloadEvents = draftToConstructionEvents(newsDraft);
      const deadlineIso = roundRow?.deadline_at ?? nowIso;

      const { error: roundErr } = await supabase.from("session_rounds").upsert(
        {
          session_id: selectedSession.id,
          round_number: roundControl,
          status: "closed",
          deadline_at: deadlineIso,
          news_payload: payloadEvents,
          created_by: userId,
          closed_at: nowIso,
          closed_by: userId,
        },
        { onConflict: "session_id,round_number" }
      );
      if (roundErr) throw roundErr;

      const updatedRound = Math.max(selectedSession.current_round ?? 0, roundControl);
      const nextStatus = updatedRound >= selectedSession.round_count ? "complete" : "in_progress";

      const { error: sessionErr } = await supabase
        .from("sessions")
        .update({ current_round: updatedRound, status: nextStatus })
        .eq("id", selectedSession.id)
        .eq("created_by", userId);
      if (sessionErr) throw sessionErr;

      setMessage(`Round ${roundControl} closed. Session current round updated to ${updatedRound}.`);
      await Promise.all([
        loadRoundState(selectedSession.id, roundControl),
        loadHostedSessions(),
        loadTeams(selectedSession.id),
      ]);
    } catch (unknownError: unknown) {
      const messageText = unknownError instanceof Error ? unknownError.message : "Failed to close round";
      setError(messageText);
    } finally {
      setBusy(false);
    }
  }

  async function extendDeadline(minutes: number) {
    if (!selectedSession || !userId) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const nowMs = Date.now();
      const currentDeadlineMs = roundRow?.deadline_at ? Date.parse(roundRow.deadline_at) : nowMs;
      const baseMs = Number.isFinite(currentDeadlineMs) ? Math.max(currentDeadlineMs, nowMs) : nowMs;
      const nextDeadlineIso = new Date(baseMs + minutes * 60_000).toISOString();

      const payloadEvents = draftToConstructionEvents(newsDraft);

      const { error: roundErr } = await supabase.from("session_rounds").upsert(
        {
          session_id: selectedSession.id,
          round_number: roundControl,
          status: "open",
          deadline_at: nextDeadlineIso,
          news_payload: payloadEvents,
          created_by: userId,
          closed_at: null,
          closed_by: null,
        },
        { onConflict: "session_id,round_number" }
      );
      if (roundErr) throw roundErr;

      setMessage(`Deadline extended by ${minutes} minutes.`);
      await loadRoundState(selectedSession.id, roundControl);
    } catch (unknownError: unknown) {
      const messageText = unknownError instanceof Error ? unknownError.message : "Failed to extend deadline";
      setError(messageText);
    } finally {
      setBusy(false);
    }
  }
  return (
    <RequireAuth>
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Facilitator Console</h1>
            <p className="mt-1 text-sm text-slate-600">
              Host-level control center for opening rounds, deadlines, news editing, and leaderboard tracking.
            </p>
          </div>
          <Link href="/dashboard" className="text-sm font-medium text-slate-700 underline">
            Dashboard
          </Link>
        </div>

        {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
        {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}

        {loading ? (
          <Card>
            <CardBody>
              <p className="text-sm text-slate-600">Loading hosted sessions...</p>
            </CardBody>
          </Card>
        ) : hostedSessions.length === 0 ? (
          <Card>
            <CardHeader title="No hosted sessions yet" subtitle="Create one from Dashboard to unlock facilitator tools." />
            <CardBody>
              <Link href="/dashboard">
                <Button>Create Session</Button>
              </Link>
            </CardBody>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
            <Card className="h-fit">
              <CardHeader title="Your Hosted Sessions" subtitle="Choose a session to control rounds." />
              <CardBody className="space-y-3">
                {hostedSessions.map((session) => {
                  const isActive = session.id === selectedSessionId;
                  const nextRound = clampRound((session.current_round ?? 0) + 1, session.round_count ?? 1);

                  return (
                    <button
                      type="button"
                      key={session.id}
                      onClick={() => {
                        setSelectedSessionId(session.id);
                        setRoundControl(nextRound);
                      }}
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        isActive
                          ? "border-teal-300 bg-teal-50 shadow-sm"
                          : "border-slate-200 bg-white hover:border-teal-200"
                      }`}
                    >
                      <div className="font-semibold text-slate-900">{session.name ?? "Untitled session"}</div>
                      <div className="mt-1 text-xs text-slate-600">
                        Code: <span className="font-mono">{session.code}</span>
                      </div>
                      <div className="mt-1 text-xs text-slate-600">
                        Status: {session.status} | Round {session.current_round}/{session.round_count}
                      </div>
                    </button>
                  );
                })}
              </CardBody>
            </Card>

            {selectedSession ? (
              <div className="space-y-5">
                <Card>
                  <CardHeader title={selectedSession.name ?? "Session"} subtitle={`Session code: ${selectedSession.code}`} />
                  <CardBody className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="text-slate-500">Session status</div>
                      <div className="mt-1 font-semibold text-slate-900">{selectedSession.status}</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="text-slate-500">Current round</div>
                      <div className="mt-1 font-semibold text-slate-900">
                        {selectedSession.current_round}/{selectedSession.round_count}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="text-slate-500">Teams joined</div>
                      <div className="mt-1 font-semibold text-slate-900">{teamRows.length}</div>
                    </div>
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader title="Round Control" subtitle="Open, close, and extend deadlines centrally." />
                  <CardBody className="space-y-4">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <label className="text-sm">
                        Control round number
                        <input
                          type="number"
                          min={1}
                          max={selectedSession.round_count}
                          value={roundControl}
                          onChange={(e) => setRoundControl(clampRound(Number(e.target.value), selectedSession.round_count))}
                          className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                        />
                      </label>

                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                        <div className="text-slate-500">Round state</div>
                        <div className="mt-1 font-semibold text-slate-900">{roundRow?.status ?? "not opened yet"}</div>
                        <div className="mt-1 text-xs text-slate-600">Deadline: {formatDateTime(roundRow?.deadline_at ?? null)}</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button onClick={openRound} disabled={busy || selectedSession.status === "complete"}>
                        {busy ? "Working..." : `Open Round ${roundControl}`}
                      </Button>
                      <Button variant="secondary" onClick={closeRound} disabled={busy || selectedSession.status === "complete"}>
                        {busy ? "Working..." : `Close Round ${roundControl}`}
                      </Button>
                      <Button variant="secondary" onClick={() => extendDeadline(10)} disabled={busy || selectedSession.status === "complete"}>
                        +10 min
                      </Button>
                    </div>

                    <div className="flex flex-wrap gap-2 text-sm">
                      <Link href={`/sessions/${selectedSession.id}`}>
                        <Button variant="secondary">Open Session Hub</Button>
                      </Link>
                      <Link href={`/sessions/${selectedSession.id}/round/${roundControl}`}>
                        <Button variant="secondary">Open Decisions</Button>
                      </Link>
                      <Link href={`/sessions/${selectedSession.id}/round/${roundControl}/news`}>
                        <Button variant="secondary">Open News Desk</Button>
                      </Link>
                      <Link href={`/sessions/${selectedSession.id}/round/${roundControl}/results`}>
                        <Button variant="secondary">Open Results</Button>
                      </Link>
                    </div>
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader
                    title="Round Template Library"
                    subtitle="Apply curated sector packs, then fine-tune in News Editor."
                  />
                  <CardBody className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                      <label className="text-sm">
                        Choose template
                        <select
                          className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                          value={selectedTemplateId}
                          onChange={(e) => setSelectedTemplateId(e.target.value)}
                        >
                          {ROUND_NEWS_TEMPLATES.map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <div className="flex flex-wrap items-end gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => applyTemplate(selectedTemplateId)}
                          disabled={busy || savingNewsDraft || !selectedTemplateId}
                        >
                          Apply Template
                        </Button>
                        <Button variant="ghost" onClick={resetNewsToDeterministicDefault} disabled={busy || savingNewsDraft}>
                          Reset Default
                        </Button>
                      </div>
                    </div>

                    {selectedTemplate ? (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                        <div className="font-semibold text-slate-900">{selectedTemplate.name}</div>
                        <div className="mt-1 text-slate-600">{selectedTemplate.description}</div>
                        <div className="mt-1 text-xs text-slate-500">Sectors: {selectedTemplate.sectors.join(", ")}</div>
                      </div>
                    ) : null}

                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {ROUND_NEWS_TEMPLATES.map((template) => (
                        <button
                          type="button"
                          key={template.id}
                          onClick={() => applyTemplate(template.id)}
                          className={
                            "rounded-xl border p-3 text-left transition " +
                            (selectedTemplateId === template.id
                              ? "border-teal-300 bg-teal-50"
                              : "border-slate-200 bg-white hover:border-teal-200")
                          }
                        >
                          <div className="text-sm font-semibold text-slate-900">{template.name}</div>
                          <div className="mt-1 text-xs text-slate-600 line-clamp-2">{template.description}</div>
                          <div className="mt-2 text-[11px] text-slate-500">{template.sectors.join(" | ")}</div>
                        </button>
                      ))}
                    </div>
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader
                    title="My Custom Templates"
                    subtitle="Save and reuse your own template library across sessions."
                  />
                  <CardBody className="space-y-3">
                    {!customTemplatesReady ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                        Custom templates table not found. Run migration <code>20260312_news_templates_bootstrap_hotfix.sql</code> in Supabase.
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                          <label className="text-sm">
                            Template name
                            <input
                              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                              value={customTemplateName}
                              onChange={(e) => setCustomTemplateName(e.target.value)}
                              placeholder="Example: Metro audit pressure"
                            />
                          </label>
                          <label className="text-sm">
                            Sectors (comma separated)
                            <input
                              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                              value={customTemplateSectorCsv}
                              onChange={(e) => setCustomTemplateSectorCsv(e.target.value)}
                              placeholder="metro, airports, compliance"
                            />
                          </label>
                          <label className="text-sm">
                            Sharing scope
                            <select
                              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                              value={customTemplateScope}
                              onChange={(e) => setCustomTemplateScope(e.target.value as "private" | "session")}
                            >
                              <option value="private">Private (only me)</option>
                              <option value="session">Session Shared</option>
                            </select>
                          </label>
                        </div>

                        <label className="text-sm block">
                          Description
                          <textarea
                            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                            rows={2}
                            value={customTemplateDescription}
                            onChange={(e) => setCustomTemplateDescription(e.target.value)}
                            placeholder="What this template simulates"
                          />
                        </label>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            onClick={saveCurrentAsCustomTemplate}
                            disabled={savingCustomTemplate || busy}
                          >
                            {savingCustomTemplate ? "Saving..." : "Save Current Draft as Template"}
                          </Button>
                        </div>

                        {customTemplates.length > 0 ? (
                          <>
                            <label className="text-sm block">
                              Saved templates
                              <select
                                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                                value={selectedCustomTemplateId}
                                onChange={(e) => setSelectedCustomTemplateId(e.target.value)}
                              >
                                <option value="">Select custom template</option>
                                {customTemplates.map((template) => (
                                  <option key={template.id} value={template.id}>
                                    {template.name}
                                  </option>
                                ))}
                              </select>
                            </label>

                            {selectedCustomTemplate ? (
                              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                                <div className="font-semibold text-slate-900">{selectedCustomTemplate.name}</div>
                                <div className="mt-1">{selectedCustomTemplate.description || "No description."}</div>
                                <div className="mt-1 text-slate-500">
                                  Sectors: {(selectedCustomTemplate.sector_tags ?? []).join(", ") || "general"}
                                </div>
                                <div className="mt-1 text-slate-500">Scope: {selectedCustomTemplate.visibility_scope === "session" ? "Session Shared" : "Private"}</div>
                              </div>
                            ) : null}

                            <div className="flex flex-wrap gap-2">
                              <Button
                                variant="secondary"
                                onClick={() => applyCustomTemplate(selectedCustomTemplateId)}
                                disabled={!selectedCustomTemplateId || busy}
                              >
                                Apply Custom Template
                              </Button>
                              <Button
                                variant="ghost"
                                onClick={() => deleteCustomTemplate(selectedCustomTemplateId)}
                                disabled={
                                  !selectedCustomTemplateId ||
                                  deletingCustomTemplateId === selectedCustomTemplateId ||
                                  busy
                                }
                              >
                                {deletingCustomTemplateId === selectedCustomTemplateId ? "Deleting..." : "Delete"}
                              </Button>
                            </div>
                          </>
                        ) : (
                          <div className="text-xs text-slate-500">No custom templates yet.</div>
                        )}
                      </>
                    )}
                  </CardBody>
                </Card>
                <Card>
                  <CardHeader
                    title="News Editor"
                    subtitle="Set event title, image, severity, tags, and impact values before opening the round."
                    right={
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={addDraftEvent} disabled={savingNewsDraft || busy}>
                          + Add Event
                        </Button>
                        <Button onClick={saveNewsDraft} disabled={savingNewsDraft || busy}>
                          {savingNewsDraft ? "Saving..." : "Save News Draft"}
                        </Button>
                      </div>
                    }
                  />
                  <CardBody className="space-y-4">
                    {newsDraft.map((event, index) => (
                      <div key={`${event.id}-${index}`} className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm font-semibold text-slate-900">Event {index + 1}</div>
                          <Button variant="ghost" onClick={() => removeDraftEvent(index)} disabled={newsDraft.length <= 1 || savingNewsDraft || busy}>
                            Remove
                          </Button>
                        </div>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <label className="text-sm">
                            Event title
                            <input
                              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                              value={event.title}
                              onChange={(e) => updateDraftEvent(index, { title: e.target.value })}
                            />
                          </label>

                          <label className="text-sm">
                            Image URL (optional)
                            <input
                              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                              placeholder="https://..."
                              value={event.image_url}
                              onChange={(e) => updateDraftEvent(index, { image_url: e.target.value })}
                            />
                          </label>
                        </div>

                        <label className="text-sm block">
                          Description
                          <textarea
                            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                            rows={3}
                            value={event.description}
                            onChange={(e) => updateDraftEvent(index, { description: e.target.value })}
                          />
                        </label>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <label className="text-sm">
                            Tags (comma separated)
                            <input
                              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                              value={event.tags_csv}
                              onChange={(e) => updateDraftEvent(index, { tags_csv: e.target.value })}
                            />
                          </label>

                          <label className="text-sm">
                            Severity
                            <select
                              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                              value={event.severity}
                              onChange={(e) =>
                                updateDraftEvent(index, {
                                  severity: clamp(asNumber(e.target.value, 2), 1, 3) as 1 | 2 | 3,
                                })
                              }
                            >
                              <option value={1}>1 - Mild</option>
                              <option value={2}>2 - Moderate</option>
                              <option value={3}>3 - Severe</option>
                            </select>
                          </label>
                        </div>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                          <label className="text-sm">
                            Schedule impact
                            <input
                              type="number"
                              step="0.01"
                              min={-0.2}
                              max={0.2}
                              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                              value={event.impact_schedule}
                              onChange={(e) => updateDraftEvent(index, { impact_schedule: asNumber(e.target.value, 0) })}
                            />
                          </label>

                          <label className="text-sm">
                            Cost impact
                            <input
                              type="number"
                              step="0.01"
                              min={-0.2}
                              max={0.2}
                              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                              value={event.impact_cost}
                              onChange={(e) => updateDraftEvent(index, { impact_cost: asNumber(e.target.value, 0) })}
                            />
                          </label>

                          <label className="text-sm">
                            Cash impact (INR)
                            <input
                              type="number"
                              step="1000"
                              min={-500000}
                              max={500000}
                              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                              value={event.impact_cash}
                              onChange={(e) => updateDraftEvent(index, { impact_cash: asNumber(e.target.value, 0) })}
                            />
                          </label>
                          <label className="text-sm">
                            Quality impact
                            <input
                              type="number"
                              step="1"
                              min={-20}
                              max={20}
                              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                              value={event.impact_quality}
                              onChange={(e) => updateDraftEvent(index, { impact_quality: asNumber(e.target.value, 0) })}
                            />
                          </label>

                          <label className="text-sm">
                            Safety impact
                            <input
                              type="number"
                              step="1"
                              min={-20}
                              max={20}
                              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                              value={event.impact_safety}
                              onChange={(e) => updateDraftEvent(index, { impact_safety: asNumber(e.target.value, 0) })}
                            />
                          </label>

                          <label className="text-sm">
                            Stakeholder impact
                            <input
                              type="number"
                              step="1"
                              min={-20}
                              max={20}
                              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                              value={event.impact_stakeholder}
                              onChange={(e) => updateDraftEvent(index, { impact_stakeholder: asNumber(e.target.value, 0) })}
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader title="Round News Preview" subtitle="What teams will see in the round news desk." />
                  <CardBody className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {effectiveDraftEvents.length === 0 ? (
                      <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
                        No events yet. Add events and save news draft.
                      </div>
                    ) : (
                      effectiveDraftEvents.map((event) => (
                        <div key={event.id} className="rounded-xl border border-slate-200 bg-white p-3">
                          <img src={getNewsImageUrl(event)} alt={event.title} className="h-28 w-full rounded-md object-cover" loading="lazy" />
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <div className="text-sm font-semibold text-slate-900">{event.title}</div>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                event.severity >= 3
                                  ? "bg-rose-100 text-rose-700"
                                  : event.severity === 2
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-emerald-100 text-emerald-700"
                              }`}
                            >
                              Severity {event.severity}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-slate-600">{event.description}</div>
                          <div className="mt-1 text-[11px] text-slate-500">Tags: {event.tags.join(", ")}</div>
                        </div>
                      ))
                    )}
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader title="Leaderboard Snapshot" subtitle="Current team ranking by total points." />
                  <CardBody className="space-y-2 text-sm">
                    {teamRows.length === 0 ? (
                      <div className="rounded-xl border border-slate-200 bg-white p-3 text-slate-600">
                        No teams found for this session yet.
                      </div>
                    ) : (
                      teamRows.map((team, index) => (
                        <div key={team.id} className="grid grid-cols-[42px_minmax(0,1fr)_96px] items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <div className="text-center text-sm font-semibold text-slate-700">#{index + 1}</div>
                          <div>
                            <div className="font-semibold text-slate-900">{team.team_name}</div>
                            <div className="text-xs text-slate-500">KPI: {team.kpi_target ?? "Not selected"}</div>
                          </div>
                          <div className="text-right font-semibold text-slate-900">{team.total_points ?? 0}</div>
                        </div>
                      ))
                    )}
                  </CardBody>
                </Card>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </RequireAuth>
  );
}


