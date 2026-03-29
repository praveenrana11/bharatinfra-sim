"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";

type LoginMode = "magic-link" | "password";

const PASSWORD_LOGIN_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN === "true";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<LoginMode>("magic-link");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loadingMode, setLoadingMode] = useState<LoginMode | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function clearFeedback() {
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function switchMode(nextMode: LoginMode) {
    setMode(nextMode);
    clearFeedback();
  }

  async function handleMagicLinkSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();
    setLoadingMode("magic-link");

    try {
      const supabase = getSupabaseClient();
      const origin =
        process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? window.location.origin;

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${origin}/auth/callback`,
        },
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      setSuccessMessage("Magic link sent. Check your inbox and spam folder, then open the link to continue.");
    } catch (unknownError: unknown) {
      const message = unknownError instanceof Error ? unknownError.message : String(unknownError);
      setErrorMessage(message);
    } finally {
      setLoadingMode(null);
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();
    setLoadingMode("password");

    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      router.replace("/dashboard");
    } catch (unknownError: unknown) {
      const message = unknownError instanceof Error ? unknownError.message : String(unknownError);
      setErrorMessage(message);
    } finally {
      setLoadingMode(null);
    }
  }

  const isMagicLinkLoading = loadingMode === "magic-link";
  const isPasswordLoading = loadingMode === "password";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
            BharatInfra Sim
          </p>
          <h1 className="text-2xl font-semibold text-slate-950">Sign in</h1>
          <p className="text-sm leading-6 text-slate-600">
            Magic link stays the default sign-in path. Password login is an optional fallback for
            review and deep testing.
          </p>
        </div>

        {PASSWORD_LOGIN_ENABLED ? (
          <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm font-medium text-slate-600">
            <button
              type="button"
              onClick={() => switchMode("magic-link")}
              className={`rounded-lg px-3 py-2 transition ${
                mode === "magic-link" ? "bg-white text-slate-950 shadow-sm" : "hover:text-slate-950"
              }`}
              aria-pressed={mode === "magic-link"}
            >
              Magic Link
            </button>
            <button
              type="button"
              onClick={() => switchMode("password")}
              className={`rounded-lg px-3 py-2 transition ${
                mode === "password" ? "bg-white text-slate-950 shadow-sm" : "hover:text-slate-950"
              }`}
              aria-pressed={mode === "password"}
            >
              Password
            </button>
          </div>
        ) : null}

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          {mode === "magic-link" || !PASSWORD_LOGIN_ENABLED ? (
            <p>
              Enter your email and we&apos;ll send a secure login link that returns to
              `/auth/callback`.
            </p>
          ) : (
            <p>
              Password login is enabled for review mode. Use a pre-created test account and you
              will be sent straight to the dashboard.
            </p>
          )}
        </div>

        {mode === "magic-link" || !PASSWORD_LOGIN_ENABLED ? (
          <form className="space-y-4" onSubmit={handleMagicLinkSubmit}>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-800" htmlFor="magic-link-email">
                Email
              </label>
              <input
                id="magic-link-email"
                type="email"
                autoComplete="email"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="reviewer@example.com"
              />
            </div>

            <button
              type="submit"
              disabled={!email || isMagicLinkLoading || isPasswordLoading}
              className="w-full rounded-md bg-slate-950 py-2 text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isMagicLinkLoading ? "Sending magic link..." : "Send magic link"}
            </button>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={handlePasswordSubmit}>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-800" htmlFor="password-email">
                Email
              </label>
              <input
                id="password-email"
                type="email"
                autoComplete="email"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="reviewer@example.com"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-800" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={!email || !password || isPasswordLoading || isMagicLinkLoading}
              className="w-full rounded-md bg-slate-950 py-2 text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPasswordLoading ? "Signing in..." : "Sign in with password"}
            </button>
          </form>
        )}

        {errorMessage ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        {successMessage ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {successMessage}
          </div>
        ) : null}

        {!PASSWORD_LOGIN_ENABLED ? (
          <p className="text-xs leading-5 text-slate-500">
            Password login is currently disabled. To expose the review fallback, set
            `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN=true`.
          </p>
        ) : null}
      </div>
    </main>
  );
}
