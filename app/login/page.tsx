"use client";

import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function sendOtp() {
    setLoading(true);
    setMsg(null);

    try {
      const supabase = getSupabaseClient();
      const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
      const redirectTo = `${appUrl || window.location.origin}/auth/callback`;

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });

      if (error) setMsg(error.message);
      else setMsg("OTP link sent. Check inbox/spam.");
    } catch (unknownError: unknown) {
      const message = unknownError instanceof Error ? unknownError.message : String(unknownError);
      setMsg(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border p-6 space-y-4">
        <h1 className="text-2xl font-bold">BharatInfra Sim - Login</h1>

        <label className="text-sm font-medium">Email</label>
        <input
          className="w-full border rounded-md px-3 py-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
        />

        <button
          onClick={sendOtp}
          disabled={!email || loading}
          className="w-full rounded-md bg-black text-white py-2 disabled:opacity-50"
        >
          {loading ? "Sending..." : "Send login link (OTP)"}
        </button>

        {msg ? <p className="text-sm">{msg}</p> : null}
      </div>
    </main>
  );
}
