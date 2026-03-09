"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";

export default function AuthCallbackPage() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [status, setStatus] = useState("Finishing sign-in...");

  useEffect(() => {
    (async () => {
      try {
        const hash = window.location.hash.startsWith("#")
          ? window.location.hash.slice(1)
          : window.location.hash;

        const hashParams = new URLSearchParams(hash);
        const hashError = hashParams.get("error");
        const hashErrorDesc = hashParams.get("error_description");

        if (hashError) {
          setStatus(`Login failed: ${hashError}${hashErrorDesc ? ` - ${hashErrorDesc}` : ""}\nTry logging in again.`);
          return;
        }

        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;

          router.replace("/dashboard");
          return;
        }

        const qs = new URLSearchParams(window.location.search);
        const code = qs.get("code");

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;

          router.replace("/dashboard");
          return;
        }

        setStatus("No auth code or token found in URL. Please try logging in again.");
      } catch (unknownError: unknown) {
        const message = unknownError instanceof Error ? unknownError.message : "Unknown error";
        setStatus(`Auth error: ${message}`);
      }
    })();
  }, [router, supabase]);

  return (
    <div style={{ padding: 24, whiteSpace: "pre-wrap" }}>
      {status}
      <div style={{ marginTop: 12 }}>
        <a href="/login" style={{ textDecoration: "underline" }}>
          Go to Login
        </a>
      </div>
    </div>
  );
}
