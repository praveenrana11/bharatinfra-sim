import type { SupabaseClient } from "@supabase/supabase-js";

export type SecureLatePenalty = {
  minutesLate: number;
  pointsPenalty: number;
  stakeholderPenalty: number;
  extensionMode: boolean;
};

export type SecureRoundResultRow = {
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

export type SecureScoreRoundResponse = {
  result: SecureRoundResultRow;
  latePenalty: SecureLatePenalty;
  submittedAt: string;
};

export async function scoreRoundSecureClient(params: {
  supabase: SupabaseClient;
  sessionId: string;
  roundNumber: number;
  teamId?: string;
}): Promise<SecureScoreRoundResponse> {
  const { supabase, sessionId, roundNumber, teamId } = params;

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    throw new Error("Auth session expired. Please log in again.");
  }

  const response = await fetch("/api/rounds/score", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ sessionId, roundNumber, teamId }),
  });

  const responseText = await response.text();
  let payload: (Partial<SecureScoreRoundResponse> & { error?: string }) | null = null;

  if (responseText) {
    try {
      payload = JSON.parse(responseText) as Partial<SecureScoreRoundResponse> & { error?: string };
    } catch {
      payload = { error: responseText };
    }
  }

  if (!response.ok) {
    throw new Error(payload?.error ?? `Secure scoring failed (${response.status}).`);
  }

  if (!payload?.result || !payload.latePenalty || typeof payload.submittedAt !== "string") {
    throw new Error("Secure scoring response was invalid.");
  }

  return payload as SecureScoreRoundResponse;
}
