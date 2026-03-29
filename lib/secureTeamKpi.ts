import type { SupabaseClient } from "@supabase/supabase-js";

export type SecureTeamKpiResponse = {
  teamId: string;
  kpiTarget: string;
  kpiSelectedAt: string;
};

export async function setTeamKpiTargetSecureClient(params: {
  supabase: SupabaseClient;
  sessionId: string;
  kpiTarget: string;
}): Promise<SecureTeamKpiResponse> {
  const { supabase, sessionId, kpiTarget } = params;

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    throw new Error("Auth session expired. Please log in again.");
  }

  const response = await fetch("/api/teams/kpi", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ sessionId, kpiTarget }),
  });

  const payload = (await response.json().catch(() => null)) as
    | (Partial<SecureTeamKpiResponse> & { error?: string })
    | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? "Failed to save KPI target.");
  }

  if (
    !payload ||
    typeof payload.teamId !== "string" ||
    typeof payload.kpiTarget !== "string" ||
    typeof payload.kpiSelectedAt !== "string"
  ) {
    throw new Error("KPI save response was invalid.");
  }

  return payload as SecureTeamKpiResponse;
}
