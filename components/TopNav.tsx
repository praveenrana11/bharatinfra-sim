"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/Button";

export default function TopNav() {
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
      ? "rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-slate-900 shadow"
      : "rounded-full px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-white/80";
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-slate-100/75 backdrop-blur-lg">
      <div className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-teal-700 via-teal-600 to-cyan-500 shadow-sm" />
          <div>
            <Link href="/" className="text-sm font-semibold tracking-wide text-slate-900">
              BharatInfra Sim
            </Link>
            <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Simulation Studio</div>
          </div>
        </div>

        <nav className="hidden items-center gap-2 sm:flex">
          <Link href="/" className={navClass(pathname === "/")}>
            Home
          </Link>
          <Link href="/dashboard" className={navClass(Boolean(pathname?.startsWith("/dashboard")))}>
            Dashboard
          </Link>
          {email ? (
            <Link href="/admin" className={navClass(Boolean(pathname?.startsWith("/admin")))}>
              Admin
            </Link>
          ) : null}
        </nav>

        <div className="flex items-center gap-2">
          {email ? <span className="hidden text-sm text-slate-600 md:inline">{email}</span> : null}
          {email ? (
            <Button variant="secondary" onClick={logout} className="h-9">
              Logout
            </Button>
          ) : (
            <Link className="rounded-full px-3 py-1.5 text-sm text-slate-700 hover:bg-white/70" href="/login">
              Login
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
