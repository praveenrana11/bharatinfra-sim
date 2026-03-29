import Link from "next/link";

const howItWorksSteps = [
  {
    icon: "🏗️",
    title: "Set up your company",
    description: "Choose your project, assign roles, and set the targets your team will be judged against.",
  },
  {
    icon: "⚡",
    title: "Make decisions each round",
    description: "Allocate budget, manage risk, and respond when the site throws unexpected problems at you.",
  },
  {
    icon: "📊",
    title: "See the consequences",
    description: "Every round changes your score, your reputation, and the path you can take next.",
  },
];

const learningTiles = [
  {
    icon: "🗓️",
    title: "Schedule Management (SPI)",
    description: "Learn whether the job is moving faster or slower than planned, and what your choices do to that pace.",
  },
  {
    icon: "💰",
    title: "Cost Control (CPI)",
    description: "See when spending is helping progress and when costs are rising faster than the value you are creating.",
  },
  {
    icon: "🦺",
    title: "Safety & Compliance",
    description: "Balance speed with safe site practices and the rules that keep work legal, insurable, and trusted.",
  },
  {
    icon: "🤝",
    title: "Stakeholder Relations",
    description: "Manage client trust, public confidence, and team alignment when pressure starts to build.",
  },
];

const glossaryTerms = [
  {
    term: "SPI",
    definition: "A simple measure of whether work is moving faster or slower than the schedule you planned.",
  },
  {
    term: "CPI",
    definition: "A simple check on whether the money you spend is delivering enough progress in return.",
  },
  {
    term: "KPI",
    definition: "The few outcomes you decide to track, such as time, cost, safety, or client satisfaction.",
  },
  {
    term: "EPC",
    definition: "Engineering, procurement, and construction under one contract, so one team handles design, buying, and building.",
  },
  {
    term: "P&M",
    definition: "Plant and machinery, meaning the heavy equipment and machines used to do the work on site.",
  },
];

function ctaClassName(primary: boolean) {
  return primary
    ? "inline-flex items-center justify-center rounded-full border border-white bg-white px-6 py-3 text-sm font-semibold text-teal-950 transition hover:-translate-y-0.5 hover:bg-teal-50"
    : "inline-flex items-center justify-center rounded-full border border-white/30 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/15";
}

export default function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 pb-10">
      <section className="overflow-hidden rounded-[2rem] border border-teal-400/20 bg-gradient-to-br from-teal-950 via-teal-900 to-slate-950 px-6 py-12 text-white shadow-[0_30px_80px_rgba(3,105,105,0.28)] sm:px-10 sm:py-16">
        <div className="max-w-3xl">
          <div className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-teal-100">
            BharatInfra Sim
          </div>

          <h1 className="mt-6 max-w-4xl text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
            Run Real Infrastructure Projects. Make Real Decisions.
          </h1>

          <p className="mt-5 max-w-2xl text-lg leading-8 text-teal-50/90">
            A competitive simulation for project managers, engineers, and construction professionals. 4-6 rounds.
            Real consequences. No second chances.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/login" className={ctaClassName(true)}>
              Join a Session
            </Link>
            <Link href="/login" className={ctaClassName(false)}>
              Create Session
            </Link>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-slate-950/55 px-6 py-8 shadow-[0_20px_55px_rgba(15,23,42,0.24)] sm:px-8">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-teal-300">How It Works</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">Three moves shape the whole game.</h2>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            You build the company, make the calls, and live with the results. Each round forces trade-offs that
            feel close to a real project team under pressure.
          </p>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {howItWorksSteps.map((step, index) => (
            <article
              key={step.title}
              className="rounded-[1.5rem] border border-white/10 bg-white/95 p-6 text-slate-900 shadow-[0_18px_35px_rgba(15,23,42,0.16)]"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-950 text-2xl text-white">
                  {step.icon}
                </span>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
                    Step {index + 1}
                  </div>
                  <h3 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">{step.title}</h3>
                </div>
              </div>

              <p className="mt-5 text-sm leading-7 text-slate-600">{step.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-slate-950/55 px-6 py-8 shadow-[0_20px_55px_rgba(15,23,42,0.24)] sm:px-8">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-teal-300">What You Will Learn</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">The pressure points that decide whether a project holds together.</h2>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            The simulation gives you simple, practical feedback on the choices that move time, money, safety, and trust.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {learningTiles.map((tile) => (
            <article
              key={tile.title}
              className="rounded-[1.5rem] border border-white/10 bg-slate-900/80 p-5 text-white shadow-[0_14px_30px_rgba(2,6,23,0.28)]"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-500/15 text-2xl">
                {tile.icon}
              </span>
              <h3 className="mt-4 text-lg font-semibold tracking-tight text-white">{tile.title}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-300">{tile.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-[2rem] border border-teal-400/15 bg-gradient-to-r from-slate-950 to-teal-950/70 px-5 py-4 shadow-[0_18px_40px_rgba(3,105,105,0.18)] sm:px-6">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-left">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-teal-300">Glossary</p>
              <h2 className="mt-1 text-lg font-semibold text-white">New to these terms?</h2>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-200 transition group-open:rotate-180">
              Expand
            </span>
          </summary>

          <div className="mt-4 grid gap-3 border-t border-white/10 pt-4 md:grid-cols-2 xl:grid-cols-5">
            {glossaryTerms.map((item) => (
              <div key={item.term} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-200">{item.term}</div>
                <p className="mt-2 text-sm leading-6 text-slate-300">{item.definition}</p>
              </div>
            ))}
          </div>
        </details>
      </section>
    </div>
  );
}
