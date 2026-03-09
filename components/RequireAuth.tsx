"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";

export default function RequireAuth({
  children,
  redirectTo = "/login",
}: {
  children: React.ReactNode;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseClient();
    let cancelled = false;

    supabase.auth.getUser().then(({ data, error }) => {
      if (cancelled) return;

      if (error || !data.user) {
        router.replace(redirectTo);
        return;
      }
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (!session?.user) router.replace(redirectTo);
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, [router, redirectTo]);

  if (loading) return <div className="p-6">Checking session…</div>;
  return <>{children}</>;
}
