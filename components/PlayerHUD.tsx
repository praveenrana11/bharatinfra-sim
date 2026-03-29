"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/Button";

type ViewerState = {
  email: string | null;
  isHost: boolean;
};

export default function PlayerHUD() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [viewer, setViewer] = useState<ViewerState>({ email: null, isHost: false });

  useEffect(() => {
    let active = true;

    async function syncViewer(nextUser?: { id: string; email?: string | null } | null) {
      const user = nextUser ?? (await supabase.auth.getUser()).data.user;

      if (!active) return;

      if (!user) {
        setViewer({ email: null, isHost: false });
        return;
      }

      const { data, error } = await supabase.from("sessions").select("id").eq("created_by", user.id).limit(1);

      if (!active) return;

      setViewer({
        email: user.email ?? null,
        isHost: !error && Boolean(data?.length),
      });
    }

    void syncViewer();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      void syncViewer(session?.user ?? null);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  function navClass(active: boolean) {
    return active
      ? "rounded-full border border-teal-300/25 bg-teal-500/15 px-4 py-2 text-sm font-semibold text-white"
      : "rounded-full border border-transparent px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-white/10 hover:bg-white/5 hover:text-white";
  }

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/88 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-teal-800 text-sm font-bold text-white shadow-[0_12px_26px_rgba(13,148,136,0.28)]">
              BI
            </div>
            <div>
              <Link href="/" className="text-base font-semibold tracking-wide text-white">
                BharatInfra Sim
              </Link>
              <div className="text-[11px] uppercase tracking-[0.2em] text-teal-200/80">Project Simulation</div>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <nav className="flex flex-wrap items-center gap-2">
              <Link href="/" className={navClass(pathname === "/")}>
                Home
              </Link>
              <Link href="/dashboard" className={navClass(Boolean(pathname?.startsWith("/dashboard")))}>
                Dashboard
              </Link>
              {viewer.email && viewer.isHost ? (
                <Link href="/admin" className={navClass(Boolean(pathname?.startsWith("/admin")))}>
                  Facilitator Console
                </Link>
              ) : null}
            </nav>

            <div className="flex items-center gap-3 lg:justify-end">
              {viewer.email ? <span className="truncate text-sm text-slate-300">{viewer.email}</span> : null}
              {viewer.email ? (
                <Button variant="secondary" onClick={logout} className="h-10 rounded-full border-white/10 bg-white/5 normal-case tracking-normal text-slate-100 hover:bg-white/10">
                  Logout
                </Button>
              ) : (
                <Link
                  className="inline-flex h-10 items-center justify-center rounded-full border border-teal-300/25 bg-teal-500/15 px-4 text-sm font-semibold text-white transition hover:bg-teal-500/25"
                  href="/login"
                >
                  Login
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
