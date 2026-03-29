import { NextRequest, NextResponse } from "next/server";
import { parseKpiTarget } from "@/lib/kpi";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

type SetTeamKpiRequest = {
  sessionId?: string;
  kpiTarget?: string;
};

type TeamRow = {
  id: string;
  kpi_target: string | null;
  kpi_selected_at: string | null;
};

function asErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return fallback;
}

function parseAuthToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export async function POST(request: NextRequest) {
  try {
    const token = parseAuthToken(request);
    if (!token) {
      return NextResponse.json({ error: "Missing bearer token." }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as SetTeamKpiRequest | null;
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
    const requestedTargetRaw = typeof body?.kpiTarget === "string" ? body.kpiTarget.trim() : "";
    const requestedTarget = parseKpiTarget(requestedTargetRaw);

    if (!sessionId || !requestedTarget) {
      return NextResponse.json({ error: "Invalid sessionId or kpiTarget." }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized user." }, { status: 401 });
    }

    const { data: membershipData, error: membershipError } = await supabase
      .from("team_memberships")
      .select("team_id")
      .eq("user_id", user.id);

    if (membershipError) throw membershipError;

    const teamIds = (membershipData ?? [])
      .map((row) => (typeof row.team_id === "string" ? row.team_id : ""))
      .filter(Boolean);

    if (teamIds.length === 0) {
      return NextResponse.json({ error: "No team membership found for this user." }, { status: 403 });
    }

    const { data: teamRows, error: teamError } = await supabase
      .from("teams")
      .select("id,kpi_target,kpi_selected_at")
      .in("id", teamIds)
      .eq("session_id", sessionId)
      .order("id", { ascending: true })
      .limit(1);

    if (teamError) throw teamError;

    const team = ((teamRows ?? []) as TeamRow[])[0] ?? null;
    if (!team) {
      return NextResponse.json({ error: "User is not a member of this session." }, { status: 403 });
    }

    if (team.kpi_target) {
      if (team.kpi_target === requestedTarget) {
        return NextResponse.json({
          teamId: team.id,
          kpiTarget: team.kpi_target,
          kpiSelectedAt: team.kpi_selected_at ?? new Date().toISOString(),
        });
      }

      return NextResponse.json(
        { error: "Team KPI target is already locked and cannot be changed." },
        { status: 409 }
      );
    }

    const nowIso = new Date().toISOString();

    const { data: updatedData, error: updateError } = await supabase
      .from("teams")
      .update({
        kpi_target: requestedTarget,
        kpi_selected_at: nowIso,
      })
      .eq("id", team.id)
      .eq("session_id", sessionId)
      .is("kpi_target", null)
      .select("id,kpi_target,kpi_selected_at")
      .maybeSingle();

    if (updateError) throw updateError;

    const updated = (updatedData as TeamRow | null) ?? null;
    if (!updated || !updated.kpi_target) {
      return NextResponse.json(
        { error: "KPI target was already selected by another update. Refresh and retry." },
        { status: 409 }
      );
    }

    return NextResponse.json({
      teamId: updated.id,
      kpiTarget: updated.kpi_target,
      kpiSelectedAt: updated.kpi_selected_at ?? nowIso,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: asErrorMessage(error, "Failed to save KPI target.") }, { status: 500 });
  }
}
