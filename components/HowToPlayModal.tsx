"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

type HowToPlayModalProps = {
  open: boolean;
  initialSlide?: number;
  onClose: () => void;
  onComplete: () => void;
};

const slideCount = 6;

const decisionTiles = [
  {
    icon: "📊",
    title: "Focus Allocation",
    description: "Where does your effort go?",
  },
  {
    icon: "🏢",
    title: "Strategy & Governance",
    description: "How do you bid and govern?",
  },
  {
    icon: "👷",
    title: "People & Assets",
    description: "How do you manage your team?",
  },
  {
    icon: "🤝",
    title: "Stakeholder & Ops",
    description: "How do you manage relationships?",
  },
  {
    icon: "💰",
    title: "Finance",
    description: "How do you manage cash?",
  },
  {
    icon: "🎯",
    title: "KPI Target",
    description: "What is your primary success metric?",
  },
] as const;

const termRows = [
  {
    term: "SPI (Schedule Performance Index)",
    meaning: "Are you ahead or behind schedule? Above 1.0 = on track.",
  },
  {
    term: "CPI (Cost Performance Index)",
    meaning: "Are you within budget? Above 1.0 = under budget.",
  },
  {
    term: "KPI Target",
    meaning: "The one metric you commit to excel at. Hitting it = 4x points.",
  },
  {
    term: "Round Shock",
    meaning: "An unplanned site event (monsoon, strike, audit) that affects your score.",
  },
  {
    term: "Lock",
    meaning: "Submitting your final decisions for the round. Cannot be undone.",
  },
  {
    term: "Points",
    meaning: "Your cumulative performance score across all rounds.",
  },
] as const;

const scoreComponents = [
  { label: "SPI", width: "18%", className: "bg-sky-500" },
  { label: "CPI", width: "18%", className: "bg-emerald-500" },
  { label: "Quality", width: "20%", className: "bg-violet-500" },
  { label: "Safety", width: "18%", className: "bg-amber-500" },
  { label: "Stakeholder", width: "26%", className: "bg-rose-500" },
] as const;

const roundFlow = [
  { title: "Open", description: "Decision window opens." },
  { title: "Decide", description: "Your team discusses options." },
  { title: "Lock", description: "Final choices are submitted." },
  { title: "Results", description: "Scores are calculated automatically." },
  { title: "Next Round", description: "The next 6 months begin." },
] as const;

function clampSlide(value: number) {
  return Math.max(0, Math.min(slideCount - 1, value));
}

function renderSlideContent(activeSlide: number) {
  if (activeSlide === 0) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1.05fr,0.95fr]">
        <div className="rounded-[28px] border border-teal-500/15 bg-slate-950 p-6">
          <div className="mb-5 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.24em] text-teal-300/75">
            <span>Project Journey</span>
            <span>4-6 rounds</span>
          </div>
          <div className="relative pt-6">
            <div className="absolute left-5 right-5 top-[1.85rem] h-px bg-gradient-to-r from-teal-400/70 via-amber-400/70 to-teal-400/50" />
            <div className="grid gap-4 sm:grid-cols-4">
              {[
                { title: "Mobilize", detail: "Set your operating posture." },
                { title: "Build", detail: "Push delivery, people, and cash." },
                { title: "Absorb Shocks", detail: "Respond to site surprises." },
                { title: "Finish Strong", detail: "Close with the highest score." },
              ].map((milestone, index) => (
                <div key={milestone.title} className="relative">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-slate-900 text-sm font-black text-white shadow-[0_0_0_8px_rgba(2,6,23,0.65)]">
                    {index + 1}
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                    <div className="text-sm font-bold text-white">{milestone.title}</div>
                    <div className="mt-2 text-sm leading-6 text-slate-300">{milestone.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-6 text-slate-900">
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">What this means</div>
          <div className="mt-4 space-y-4">
            {[
              "You make decisions together as the leadership team.",
              "Each round simulates a new phase of project delivery.",
              "Trade-offs between speed, cost, quality, and trust drive the outcome.",
            ].map((line) => (
              <div key={line} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium leading-6 text-slate-700">
                {line}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (activeSlide === 1) {
    return (
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 text-slate-900">
        <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">Round lifecycle</div>
        <div className="mt-6 grid gap-4 lg:grid-cols-5">
          {roundFlow.map((step, index) => (
            <div key={step.title} className="relative rounded-3xl border border-slate-200 bg-slate-50 px-4 py-5">
              {index < roundFlow.length - 1 ? (
                <div className="absolute -right-3 top-1/2 hidden h-px w-6 -translate-y-1/2 bg-gradient-to-r from-teal-500 to-amber-400 lg:block" />
              ) : null}
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-sm font-black text-white">
                {index + 1}
              </div>
              <div className="mt-4 text-base font-black text-slate-950">{step.title}</div>
              <div className="mt-2 text-sm leading-6 text-slate-600">{step.description}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (activeSlide === 2) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {decisionTiles.map((tile) => (
          <div key={tile.title} className="rounded-[28px] border border-slate-200 bg-white p-5 text-slate-900 shadow-[0_18px_45px_rgba(15,23,42,0.12)]">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-2xl">
              {tile.icon}
            </div>
            <div className="mt-4 text-lg font-black">{tile.title}</div>
            <div className="mt-2 text-sm leading-6 text-slate-600">{tile.description}</div>
          </div>
        ))}
      </div>
    );
  }

  if (activeSlide === 3) {
    return (
      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white text-slate-900">
        <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] border-b border-slate-200 bg-slate-50 px-6 py-4 text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">
          <div>Term</div>
          <div>Meaning</div>
        </div>
        <div className="divide-y divide-slate-200">
          {termRows.map((row) => (
            <div key={row.term} className="grid gap-3 px-6 py-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="text-sm font-bold leading-6 text-slate-950">{row.term}</div>
              <div className="text-sm leading-6 text-slate-600">{row.meaning}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (activeSlide === 4) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1.05fr,0.95fr]">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 text-slate-900">
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">Score mix</div>
          <div className="mt-6 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
            <div className="flex h-14 w-full">
              {scoreComponents.map((component) => (
                <div
                  key={component.label}
                  className={`${component.className} flex items-center justify-center text-[11px] font-black uppercase tracking-[0.12em] text-white`}
                  style={{ width: component.width }}
                >
                  {component.label}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {scoreComponents.map((component) => (
              <div key={component.label} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <span className={`h-3.5 w-3.5 rounded-full ${component.className}`} />
                <span className="text-sm font-semibold text-slate-700">{component.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[28px] border border-teal-500/15 bg-slate-950 p-6">
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-teal-300/75">Bonus rule</div>
          <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <div className="text-sm font-bold uppercase tracking-[0.18em] text-amber-300">KPI target multiplier</div>
            <div className="mt-3 text-4xl font-black text-white">4x</div>
            <div className="mt-3 text-sm leading-7 text-slate-300">
              Pick one metric to specialize in. If you hit it, that metric gets multiplied and can swing the leaderboard.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr,0.9fr]">
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 text-slate-900">
        <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">Before round 1</div>
        <div className="mt-5 space-y-4">
          {[
            "Align your team on whether you want speed, cost discipline, quality, or trust to define your play style.",
            "Check which KPI target you want to chase before locking decisions.",
            "Watch the timer. Once the round is locked, your choices are final.",
          ].map((line) => (
            <div key={line} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
              {line}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[28px] border border-emerald-500/20 bg-gradient-to-br from-emerald-500/12 via-teal-500/10 to-slate-950 p-6">
        <div className="flex h-full flex-col justify-between rounded-[24px] border border-white/10 bg-slate-950/70 p-5">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-emerald-300/80">Mission briefing</div>
            <div className="mt-4 text-2xl font-black text-white">Discuss first, then commit.</div>
            <div className="mt-3 text-sm leading-7 text-slate-300">
              The strongest teams share a clear strategy before anyone starts moving sliders.
            </div>
          </div>
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 text-sm font-medium text-slate-200">
            When you are ready, hit <span className="font-black text-white">Let&apos;s Go</span> and the overlay will stay out of your way.
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HowToPlayModal({
  open,
  initialSlide = 0,
  onClose,
  onComplete,
}: HowToPlayModalProps) {
  const [activeSlide, setActiveSlide] = useState(clampSlide(initialSlide));

  useEffect(() => {
    if (!open) return;

    setActiveSlide(clampSlide(initialSlide));

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }

      if (event.key === "ArrowRight") {
        setActiveSlide((current) => clampSlide(current + 1));
      }

      if (event.key === "ArrowLeft") {
        setActiveSlide((current) => clampSlide(current - 1));
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [initialSlide, onClose, open]);

  if (!open) return null;

  const isLastSlide = activeSlide === slideCount - 1;
  const slideMeta = [
    {
      icon: "🏗️",
      title: "You are now a Project Director",
      body:
        "Your team has just won a major infrastructure contract. Over the next 4-6 rounds, you will make real management decisions - budget, risk, people, and strategy. Every choice has consequences.",
    },
    {
      icon: "🔄",
      title: "Each Round = 6 Months of Execution",
      body:
        "Every round your facilitator opens a decision window. Your team discusses and submits decisions before the deadline. Once locked, results are calculated automatically.",
    },
    {
      icon: "⚡",
      title: "6 Areas of Decision",
      body: "Each round asks you to set the posture of the whole project, not just one isolated number.",
    },
    {
      icon: "📖",
      title: "Terms You Will See",
      body: "These are the core score and workflow terms you will see during the simulation.",
    },
    {
      icon: "🏆",
      title: "How You Win",
      body:
        "Points are earned each round based on SPI, CPI, Quality, Safety, and Stakeholder scores. Hit your KPI target for a 4x bonus on that metric. The team with the most cumulative points at the end wins.",
    },
    {
      icon: "✅",
      title: "You're Ready to Start",
      body:
        "Your facilitator will open Round 1 when all teams are set up. Discuss your strategy with your team before making any decisions.",
    },
  ] as const;

  const currentSlide = slideMeta[activeSlide];

  return (
    <div className="fixed inset-0 z-[120] overflow-y-auto bg-slate-950/88 px-0 py-0 backdrop-blur-md sm:px-6 sm:py-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="how-to-play-title"
        className="mx-auto flex min-h-full w-full flex-col overflow-hidden rounded-none border-0 bg-[#020817] shadow-[0_45px_140px_rgba(2,6,23,0.75)] sm:max-w-6xl sm:rounded-[32px] sm:border sm:border-white/10"
      >
        <div className="border-b border-white/10 bg-gradient-to-r from-teal-500/12 via-transparent to-amber-400/10 px-4 py-4 sm:px-8 sm:py-5">
          <div className="flex items-start justify-between gap-6">
            <div className="max-w-3xl">
              <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-teal-200/75">
                How to Play
              </div>
              <div className="mt-4 flex items-start gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[22px] border border-white/10 bg-white/[0.05] text-3xl">
                  {currentSlide.icon}
                </div>
                <div>
                  <h2 id="how-to-play-title" className="text-2xl font-black tracking-tight text-white sm:text-3xl">
                    {currentSlide.title}
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
                    {currentSlide.body}
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close how to play"
              className="rounded-full border border-white/10 bg-white/[0.04] p-2 text-slate-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-8 sm:py-8">{renderSlideContent(activeSlide)}</div>

        <div className="border-t border-white/10 bg-slate-950/85 px-4 py-4 sm:px-8 sm:py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center justify-center gap-2 lg:justify-start">
              {Array.from({ length: slideCount }).map((_, index) => (
                <button
                  key={index}
                  type="button"
                  aria-label={`Go to slide ${index + 1}`}
                  onClick={() => setActiveSlide(index)}
                  className={`h-2.5 rounded-full transition-all ${
                    activeSlide === index ? "w-8 bg-teal-400" : "w-2.5 bg-slate-600 hover:bg-slate-500"
                  }`}
                />
              ))}
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setActiveSlide((current) => clampSlide(current - 1))}
                disabled={activeSlide === 0}
                className="border-white/10 bg-white/[0.04] text-slate-100 hover:border-white/20 hover:bg-white/[0.08]"
              >
                Back
              </Button>

              {isLastSlide ? (
                <Button
                  type="button"
                  onClick={onComplete}
                  className="border-teal-500 bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-[0_12px_30px_rgba(20,184,166,0.28)] hover:from-teal-400 hover:to-cyan-400"
                >
                  Let&apos;s Go
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() => setActiveSlide((current) => clampSlide(current + 1))}
                  className="border-teal-500 bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-[0_12px_30px_rgba(20,184,166,0.28)] hover:from-teal-400 hover:to-cyan-400"
                >
                  Next
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
