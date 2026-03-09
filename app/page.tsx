"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default function HomePage() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data } = supabase.auth.onAuthStateChange((_evt, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  return (
    <div className="space-y-6">
      <section className="glass-panel rounded-3xl border border-slate-200/80 p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)] sm:p-10">
        <div className="inline-flex items-center rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-teal-800">
          Simulation First Learning
        </div>

        <h1 className="mt-4 max-w-3xl text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          BharatInfra Sim
        </h1>

        <p className="mt-4 max-w-2xl text-base text-slate-600 sm:text-lg">
          A round-based infrastructure management simulator combining strategic choices, team gameplay,
          deterministic scoring, and AI debrief insights.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          {email ? (
            <>
              <Link href="/dashboard">
                <Button>Go to Dashboard</Button>
              </Link>
              <Link href="/admin">
                <Button variant="secondary">Facilitator Console</Button>
              </Link>
              <Button variant="secondary" onClick={() => supabase.auth.signOut()}>
                Logout
              </Button>
            </>
          ) : (
            <Link href="/login">
              <Button>Login to Start</Button>
            </Link>
          )}
        </div>

        <div className="mt-4 text-sm text-slate-600">
          {email ? `Signed in as ${email}` : "Not signed in"}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader title="Round Decisions" subtitle="Strategy, execution, and tradeoffs" />
          <CardBody className="text-sm text-slate-600">
            Structured module-by-module controls for planning and execution in each round.
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Results & Debrief" subtitle="Understand what changed" />
          <CardBody className="text-sm text-slate-600">
            Deterministic outcomes with AI debriefs that explain strengths, risks, and next actions.
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Practice Loop" subtitle="Learn between rounds" />
          <CardBody className="text-sm text-slate-600">
            Concept-focused practice to improve weak areas and build mastery over time.
          </CardBody>
        </Card>
      </section>
    </div>
  );
}
