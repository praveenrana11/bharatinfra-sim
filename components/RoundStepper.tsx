"use client";

export type RoundState = "completed" | "active" | "locked" | "pending";

export interface RoundNode {
  round_number: number;
  state: RoundState;
  points_earned?: number | null;
  label: string;
}

export default function RoundStepper({
  rounds,
  currentRoundId,
  onEnterRound,
}: {
  rounds: RoundNode[];
  currentRoundId: number;
  onEnterRound: (roundNum: number) => void;
}) {
  return (
    <div className="relative ml-2 flex flex-col space-y-10 border-l-2 border-slate-800 pl-8 pt-4 pb-4">
      {rounds.map((r) => {
        const isActive = r.round_number === currentRoundId && r.state === "active";

        return (
          <div key={r.round_number} className="relative">
            {/* The Dot */}
            <div
              className={`absolute -left-[41px] top-1.5 h-4 w-4 rounded-full border-2 ${
                isActive
                  ? "border-blue-400 bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.8)] animate-pulse"
                  : r.state === "completed"
                  ? "border-emerald-400 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                  : r.state === "locked"
                  ? "border-amber-400 bg-amber-500"
                  : "border-slate-700 bg-slate-900"
              }`}
            />

            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`text-xl font-bold tracking-tight ${
                    isActive
                      ? "text-blue-400"
                      : r.state === "completed"
                      ? "text-emerald-400"
                      : "text-slate-300"
                  }`}
                >
                  Round {r.round_number}
                </span>
                <span className="text-[10px] uppercase tracking-widest text-slate-500">
                  {r.state}
                </span>

                {r.state === "completed" && r.points_earned != null && (
                  <span className="ml-2 font-mono text-sm font-bold text-emerald-400">
                    +{r.points_earned} pts
                  </span>
                )}
              </div>

              <div className="text-sm text-slate-400">{r.label}</div>

              {isActive && (
                <div className="mt-3">
                  <button
                    onClick={() => onEnterRound(r.round_number)}
                    className="group relative inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-bold tracking-wide text-white shadow-lg transition-transform hover:scale-[1.02] hover:bg-blue-500 active:scale-95"
                  >
                    ENTER WAR ROOM
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
