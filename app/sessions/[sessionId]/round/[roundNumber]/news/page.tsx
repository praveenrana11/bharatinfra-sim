"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { formatStatus } from "@/lib/formatters";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { ConstructionEvent, getRoundConstructionEvents } from "@/lib/constructionNews";
import { getNewsImageUrl } from "@/lib/newsVisuals";
import { parseConstructionEvents } from "@/lib/newsPayload";

type RouteParams = {
  sessionId?: string;
  roundNumber?: string;
  round?: string;
};

type MembershipRow = { team_id: string };
type TeamRow = { id: string; session_id: string };
type SessionRoundRow = { deadline_at: string | null; status: string | null; news_payload: unknown };

function formatDateTime(iso: string | null) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function RoundNewsPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseClient(), []);

  const routeParams = params as RouteParams;
  const sessionId = routeParams.sessionId ?? "";
  const roundParam = routeParams.roundNumber ?? routeParams.round ?? "1";
  const roundNumber = Number.parseInt(roundParam, 10);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [roundStatus, setRoundStatus] = useState("closed");
  const [deadline, setDeadline] = useState<string | null>(null);
  const [news, setNews] = useState<ConstructionEvent[]>([]);

  useEffect(() => {
    (async () => {
      setError("");
      setLoading(true);

      if (!sessionId || !Number.isFinite(roundNumber) || roundNumber <= 0) {
        setError("Invalid round URL.");
        setLoading(false);
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: membershipsData, error: membershipErr } = await supabase
        .from("team_memberships")
        .select("team_id")
        .eq("user_id", user.id);

      if (membershipErr) {
        setError(membershipErr.message);
        setLoading(false);
        return;
      }

      const memberships = (membershipsData ?? []) as MembershipRow[];
      const teamIds = memberships.map((row) => row.team_id);
      if (teamIds.length === 0) {
        setError("No team membership found.");
        setLoading(false);
        return;
      }

      const { data: teamsData, error: teamErr } = await supabase
        .from("teams")
        .select("id,session_id")
        .in("id", teamIds)
        .eq("session_id", sessionId);

      if (teamErr) {
        setError(teamErr.message);
        setLoading(false);
        return;
      }

      const teams = (teamsData ?? []) as TeamRow[];
      if (teams.length === 0) {
        setError("You are not part of this session.");
        setLoading(false);
        return;
      }

      const fallbackNews = getRoundConstructionEvents(sessionId, roundNumber);

      const { data: roundData, error: roundErr } = await supabase
        .from("session_rounds")
        .select("deadline_at,status,news_payload")
        .eq("session_id", sessionId)
        .eq("round_number", roundNumber)
        .maybeSingle();

      if (roundErr) {
        setNews(fallbackNews);
        setRoundStatus("closed");
        setDeadline(null);
        setLoading(false);
        return;
      }

      const row = roundData as SessionRoundRow | null;
      if (!row) {
        setNews(fallbackNews);
        setRoundStatus("closed");
        setDeadline(null);
        setLoading(false);
        return;
      }

      setRoundStatus(row.status ?? "closed");
      setDeadline(row.deadline_at ?? null);
      setNews(parseConstructionEvents(row.news_payload) ?? fallbackNews);
      setLoading(false);
    })();
  }, [router, roundNumber, sessionId, supabase]);

  const fyLabel = `FY ${roundNumber}`;

  return (
    <RequireAuth>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Round News Desk</h1>
            <p className="mt-1 text-sm text-slate-600">
              {fyLabel} external events and shocks for BharatInfra simulation.
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link className="underline text-slate-700" href={`/sessions/${sessionId}/round/${roundNumber}`}>
              Round Decisions
            </Link>
            <Link className="underline text-slate-700" href={`/sessions/${sessionId}`}>
              Session Hub
            </Link>
          </div>
        </div>

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
        ) : null}

        {loading ? (
          <Card>
            <CardBody>
              <p className="text-sm text-slate-600">Loading round news...</p>
            </CardBody>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader title={`${fyLabel} Round Control Snapshot`} subtitle="Shared orchestration state" />
              <CardBody className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-slate-500">Round status</div>
                  <div className="mt-1 font-semibold text-slate-900">{formatStatus(roundStatus)}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-slate-500">Deadline</div>
                  <div className="mt-1 font-semibold text-slate-900">{formatDateTime(deadline)}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-slate-500">Events this year</div>
                  <div className="mt-1 font-semibold text-slate-900">{news.length}</div>
                </div>
              </CardBody>
            </Card>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {news.map((event) => (
                <Card key={event.id}>
                  <CardBody className="space-y-3">
                    <img
                      src={getNewsImageUrl(event)}
                      alt={event.title}
                      className="h-40 w-full rounded-lg object-cover"
                      loading="lazy"
                    />
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="text-base font-semibold text-slate-900">{event.title}</h2>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          event.severity >= 3
                            ? "bg-rose-100 text-rose-700"
                            : event.severity === 2
                              ? "bg-amber-100 text-amber-800"
                              : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        Severity {event.severity}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600">{event.description}</p>
                    <p className="text-xs text-slate-500">Tags: {event.tags.join(", ")}</p>
                  </CardBody>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </RequireAuth>
  );
}
