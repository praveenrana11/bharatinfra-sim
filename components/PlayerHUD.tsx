"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";

export default function PlayerHUD() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });
    const { data } = supabase.auth.onAuthStateChange((_evt, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  function navClass(active: boolean) {
    return active
      ? "rounded-full bg-blue-600/20 text-blue-400 px-3 py-1.5 text-sm font-semibold border border-blue-500/30"
      : "rounded-full px-3 py-1.5 text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-white/5";
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-slate-950/80 px-4 py-3 backdrop-blur-md sm:px-6">
      <div className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 shadow-sm shadow-blue-500/20">
            <span className="text-sm font-bold text-white">BI</span>
          </div>
          <div>
            <Link href="/" className="text-sm font-bold tracking-wide text-white">
              THE ARENA
            </Link>
            <div className="text-[10px] uppercase tracking-[0.2em] text-blue-400/80">Command Center</div>
          </div>
        </div>

        <nav className="hidden items-center gap-2 md:flex">
          <Link href="/dashboard" className={navClass(Boolean(pathname?.startsWith("/dashboard")))}>
            Active Missions
          </Link>
          {email ? (
            <Link href="/admin" className={navClass(Boolean(pathname?.startsWith("/admin")))}>
              Game Master
            </Link>
          ) : null}
        </nav>

        <div className="flex items-center gap-3">
          {email ? (
            <>
              <div className="hidden flex-col items-end md:flex">
                <span className="text-xs font-semibold text-slate-300">{email.split("@")[0]}</span>
                <span className="text-[10px] uppercase tracking-wide text-slate-500">Level 4 Operative</span>
              </div>
              <button
                onClick={logout}
                className="rounded-full bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10"
              >
                Exit
              </button>
            </>
          ) : (
            <Link
              className="rounded-full bg-blue-600 px-4 py-1.5 text-xs font-bold text-white shadow-lg hover:bg-blue-500"
              href="/login"
            >
              INITIATE
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
