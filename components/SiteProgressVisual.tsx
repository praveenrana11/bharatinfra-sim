"use client";

type SiteProgressVisualProps = {
  scenarioType: "metro" | "airport" | "industrial" | "highway";
  currentRound: number;
  totalRounds: number;
  spi: number;
  safety: number;
  hasIncident: boolean;
};

const COLORS = {
  complete: "#14b8a6",
  completeDark: "#0f766e",
  progress: "#94a3b8",
  delayed: "#f59e0b",
  critical: "#ef4444",
  outline: "#dbe4f0",
  muted: "#475569",
  text: "#e2e8f0",
  subtext: "#94a3b8",
  bg: "#020617",
  ground: "#1e293b",
} as const;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeRound(currentRound: number, totalRounds: number) {
  return clamp(currentRound / Math.max(totalRounds, 1), 0, 1);
}

function progressPercent(currentRound: number, totalRounds: number) {
  return Math.round(normalizeRound(currentRound, totalRounds) * 100);
}

function completeColor(isComplete: boolean) {
  return isComplete ? COLORS.complete : COLORS.progress;
}

function labelColor(isDelayed: boolean, isCritical: boolean) {
  if (isCritical) return COLORS.critical;
  if (isDelayed) return COLORS.delayed;
  return COLORS.complete;
}

function ScenarioLegend() {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
      <span className="inline-flex items-center gap-2">
        <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: COLORS.complete }} />
        Complete
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: COLORS.progress }} />
        In Progress
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: COLORS.delayed }} />
        Delayed
      </span>
    </div>
  );
}

function DelayOverlay({
  x,
  y,
  width,
  height,
  text = "DELAY",
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx="10"
        fill="url(#delay-hatch)"
        opacity="0.95"
      />
      <text
        x={x + width / 2}
        y={y + height / 2 + 5}
        fill="#fef3c7"
        fontSize="14"
        fontWeight="800"
        letterSpacing="0.28em"
        textAnchor="middle"
      >
        {text}
      </text>
    </g>
  );
}

function IncidentMarker({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r="18" fill="rgba(239,68,68,0.12)" stroke={COLORS.critical} strokeWidth="2" />
      <path
        d={`M ${x - 8} ${y - 8} L ${x + 8} ${y + 8} M ${x + 8} ${y - 8} L ${x - 8} ${y + 8}`}
        stroke={COLORS.critical}
        strokeWidth="3"
        strokeLinecap="round"
      />
    </g>
  );
}

function renderMetro(round: number, delayed: boolean, hasIncident: boolean) {
  const excavationReady = round >= 1;
  const boringReady = round >= 2;
  const platformReady = round >= 3;
  const finishingReady = round >= 4;

  return (
    <>
      <path d="M40 108 H760" stroke={COLORS.outline} strokeWidth="3" strokeLinecap="round" />
      <path d="M80 108 L170 188 H630 L720 108" fill={COLORS.ground} opacity="0.9" />
      <path
        d="M140 110 C180 160 250 188 400 188 C550 188 620 160 660 110"
        fill="none"
        stroke={COLORS.outline}
        strokeWidth="3"
        strokeLinecap="round"
      />

      <rect
        x="206"
        y="142"
        width="388"
        height="44"
        rx="22"
        fill={completeColor(boringReady)}
        opacity={boringReady ? 0.95 : 0.42}
        stroke={COLORS.outline}
        strokeWidth="2"
      />
      {!boringReady ? (
        <circle cx="228" cy="164" r="14" fill={COLORS.progress} stroke={COLORS.outline} strokeWidth="2" />
      ) : (
        <g>
          <circle cx="238" cy="164" r="18" fill={COLORS.completeDark} stroke="#99f6e4" strokeWidth="2" />
          <circle cx="238" cy="164" r="8" fill="#67e8f9" opacity="0.75" />
        </g>
      )}

      <rect
        x="282"
        y="100"
        width="236"
        height="56"
        rx="10"
        fill={completeColor(platformReady)}
        opacity={platformReady ? 0.18 : 0.1}
        stroke={platformReady ? COLORS.complete : COLORS.progress}
        strokeWidth="2"
      />
      <path d="M300 146 H500" stroke={platformReady ? COLORS.complete : COLORS.progress} strokeWidth="5" />
      <path d="M324 146 V108 M476 146 V108" stroke={platformReady ? COLORS.complete : COLORS.progress} strokeWidth="4" />

      {finishingReady ? (
        <g>
          <path d="M264 94 L400 52 L536 94" fill="rgba(20,184,166,0.12)" stroke={COLORS.complete} strokeWidth="3" />
          <path d="M340 94 V72 M460 94 V72" stroke={COLORS.complete} strokeWidth="3" />
          <path d="M342 72 H458" stroke={COLORS.complete} strokeWidth="3" strokeLinecap="round" />
          <path d="M362 100 L362 144 M400 100 L400 144 M438 100 L438 144" stroke={COLORS.outline} strokeWidth="2" opacity="0.7" />
        </g>
      ) : null}

      {delayed ? <DelayOverlay x={536} y={114} width={132} height={56} /> : null}
      {hasIncident ? <IncidentMarker x={610} y={88} /> : null}

      <text x="62" y="66" fill={COLORS.subtext} fontSize="15" fontWeight="700" letterSpacing="0.16em">
        UNDERGROUND METRO STATION
      </text>
      <text x="62" y="86" fill={labelColor(delayed, hasIncident)} fontSize="24" fontWeight="800">
        Tunnel + platform works
      </text>
    </>
  );
}

function renderHighway(round: number, totalRounds: number, delayed: boolean, hasIncident: boolean) {
  const segmentCount = 6;
  const completedSegments = Math.max(
    0,
    Math.min(segmentCount, Math.round(normalizeRound(round, totalRounds) * segmentCount))
  );

  return (
    <>
      <path d="M84 164 C168 120 246 120 326 164 C404 208 492 208 576 164 C646 128 696 126 738 144" stroke="#1f2937" strokeWidth="96" strokeLinecap="round" fill="none" />
      <path d="M84 164 C168 120 246 120 326 164 C404 208 492 208 576 164 C646 128 696 126 738 144" stroke={COLORS.outline} strokeWidth="4" strokeLinecap="round" fill="none" opacity="0.8" />

      {Array.from({ length: segmentCount }, (_, index) => {
        const startX = 112 + index * 100;
        const isComplete = index < completedSegments;
        const isDelayed = delayed && !isComplete && index === completedSegments;
        return (
          <g key={index}>
            <rect
              x={startX}
              y="132"
              width="78"
              height="64"
              rx="18"
              fill={isComplete ? COLORS.complete : isDelayed ? COLORS.critical : COLORS.progress}
              opacity={isComplete ? 0.98 : isDelayed ? 0.92 : 0.38}
              stroke={COLORS.outline}
              strokeWidth="2"
            />
            <path d={`M${startX + 14} 164 H${startX + 64}`} stroke="rgba(255,255,255,0.45)" strokeWidth="4" strokeDasharray="14 10" strokeLinecap="round" />
          </g>
        );
      })}

      <rect x="98" y="104" width="112" height="18" rx="9" fill="rgba(15,118,110,0.16)" stroke={COLORS.complete} strokeWidth="2" />
      <text x="154" y="118" fill={COLORS.text} fontSize="12" fontWeight="700" textAnchor="middle">
        Alignment
      </text>

      {delayed ? <DelayOverlay x={492} y={76} width={132} height={42} text="LATE" /> : null}
      {hasIncident ? <IncidentMarker x={424} y={126} /> : null}

      <text x="62" y="66" fill={COLORS.subtext} fontSize="15" fontWeight="700" letterSpacing="0.16em">
        HIGHWAY PACKAGE
      </text>
      <text x="62" y="86" fill={labelColor(delayed, hasIncident)} fontSize="24" fontWeight="800">
        Pavement opening left to right
      </text>
    </>
  );
}

function renderAirport(round: number, totalRounds: number, delayed: boolean, hasIncident: boolean) {
  const stage = Math.max(1, Math.round(normalizeRound(round, totalRounds) * 4));
  const floorsVisible = Math.max(0, Math.min(2, stage - 1));
  const roofVisible = stage >= 4;

  return (
    <>
      <path d="M96 202 H720" stroke={COLORS.outline} strokeWidth="3" strokeLinecap="round" />
      <rect x="168" y="164" width="470" height="38" rx="10" fill="rgba(20,184,166,0.12)" stroke={completeColor(stage >= 1)} strokeWidth="3" />
      <path d="M188 164 V132 M618 164 V132" stroke={COLORS.outline} strokeWidth="3" />

      {floorsVisible >= 1 ? (
        <rect x="192" y="122" width="420" height="38" rx="10" fill="rgba(20,184,166,0.18)" stroke={COLORS.complete} strokeWidth="3" />
      ) : (
        <rect x="192" y="122" width="420" height="38" rx="10" fill="rgba(148,163,184,0.08)" stroke={COLORS.progress} strokeWidth="2" strokeDasharray="10 8" />
      )}

      {floorsVisible >= 2 ? (
        <rect x="232" y="84" width="340" height="34" rx="10" fill="rgba(20,184,166,0.2)" stroke={COLORS.complete} strokeWidth="3" />
      ) : (
        <rect x="232" y="84" width="340" height="34" rx="10" fill="rgba(148,163,184,0.08)" stroke={COLORS.progress} strokeWidth="2" strokeDasharray="10 8" />
      )}

      {roofVisible ? (
        <path d="M210 78 L402 38 L594 78" fill="rgba(20,184,166,0.12)" stroke={COLORS.complete} strokeWidth="3" strokeLinejoin="round" />
      ) : null}

      {Array.from({ length: 6 }, (_, index) => (
        <rect
          key={index}
          x={214 + index * 60}
          y="136"
          width="24"
          height="14"
          rx="4"
          fill={floorsVisible >= 1 ? "rgba(103,232,249,0.85)" : "rgba(148,163,184,0.45)"}
        />
      ))}

      {delayed ? <DelayOverlay x={546} y={92} width={110} height={54} /> : null}
      {hasIncident ? <IncidentMarker x={254} y={110} /> : null}

      <text x="62" y="66" fill={COLORS.subtext} fontSize="15" fontWeight="700" letterSpacing="0.16em">
        AIRPORT TERMINAL
      </text>
      <text x="62" y="86" fill={labelColor(delayed, hasIncident)} fontSize="24" fontWeight="800">
        Terminal superstructure rising
      </text>
    </>
  );
}

function renderIndustrial(round: number, totalRounds: number, delayed: boolean, hasIncident: boolean) {
  const stage = Math.max(1, Math.round(normalizeRound(round, totalRounds) * 4));
  const columnsReady = stage >= 2;
  const wallsReady = stage >= 3;
  const chimneyReady = stage >= 4;

  return (
    <>
      <path d="M88 202 H732" stroke={COLORS.outline} strokeWidth="3" strokeLinecap="round" />
      <rect x="154" y="160" width="498" height="42" rx="12" fill="rgba(20,184,166,0.08)" stroke={completeColor(stage >= 1)} strokeWidth="3" />
      <path d="M188 160 L262 114 L354 144 L438 104 L560 144 L618 118 L618 160" fill="rgba(20,184,166,0.06)" stroke={columnsReady ? COLORS.complete : COLORS.progress} strokeWidth="3" strokeLinejoin="round" />

      {Array.from({ length: 5 }, (_, index) => (
        <rect
          key={index}
          x={202 + index * 82}
          y="136"
          width="18"
          height="24"
          rx="5"
          fill={columnsReady ? COLORS.completeDark : COLORS.progress}
          opacity={columnsReady ? 0.9 : 0.42}
        />
      ))}

      {wallsReady ? (
        <rect x="202" y="130" width="376" height="30" rx="8" fill="rgba(20,184,166,0.18)" stroke={COLORS.complete} strokeWidth="3" />
      ) : (
        <rect x="202" y="130" width="376" height="30" rx="8" fill="rgba(148,163,184,0.06)" stroke={COLORS.progress} strokeWidth="2" strokeDasharray="10 8" />
      )}

      {chimneyReady ? (
        <g>
          <rect x="612" y="88" width="36" height="72" rx="10" fill="rgba(20,184,166,0.2)" stroke={COLORS.complete} strokeWidth="3" />
          <path d="M626 88 V62" stroke={COLORS.complete} strokeWidth="3" strokeLinecap="round" />
        </g>
      ) : null}

      {delayed ? <DelayOverlay x={492} y={82} width={128} height={52} /> : null}
      {hasIncident ? <IncidentMarker x={286} y={118} /> : null}

      <text x="62" y="66" fill={COLORS.subtext} fontSize="15" fontWeight="700" letterSpacing="0.16em">
        INDUSTRIAL PLANT
      </text>
      <text x="62" y="86" fill={labelColor(delayed, hasIncident)} fontSize="24" fontWeight="800">
        Structural assembly in sequence
      </text>
    </>
  );
}

export default function SiteProgressVisual({
  scenarioType,
  currentRound,
  totalRounds,
  spi,
  safety,
  hasIncident,
}: SiteProgressVisualProps) {
  const normalizedRound = Math.max(1, currentRound);
  const normalizedTotalRounds = Math.max(1, totalRounds);
  const completion = progressPercent(normalizedRound, normalizedTotalRounds);
  const delayed = spi < 0.9;
  const critical = hasIncident || safety < 75;

  return (
    <div className="mx-auto w-full max-md:w-4/5">
      <div className="rounded-[24px] border border-white/10 bg-slate-950/65 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Site progress model</div>
            <div className="mt-1 text-sm font-semibold text-slate-200">
              Round {normalizedRound} Progress: {completion}%
            </div>
          </div>
          <div
            className="rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em]"
            style={{
              borderColor: critical ? "rgba(239,68,68,0.35)" : delayed ? "rgba(245,158,11,0.35)" : "rgba(20,184,166,0.35)",
              backgroundColor: critical ? "rgba(239,68,68,0.12)" : delayed ? "rgba(245,158,11,0.12)" : "rgba(20,184,166,0.12)",
              color: critical ? "#fecaca" : delayed ? "#fde68a" : "#99f6e4",
            }}
          >
            {critical ? "Critical watch" : delayed ? "Delay watch" : "On track"}
          </div>
        </div>

        <svg
          viewBox="0 0 800 230"
          className="h-auto w-full"
          role="img"
          aria-label={`Round ${normalizedRound} project progress illustration for the ${scenarioType} scenario`}
        >
          <defs>
            <pattern id="delay-hatch" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="12" height="12" fill="rgba(245,158,11,0.18)" />
              <rect width="4" height="12" fill="rgba(245,158,11,0.76)" />
            </pattern>
          </defs>
          <rect x="0" y="0" width="800" height="230" rx="24" fill={COLORS.bg} />
          <rect x="18" y="18" width="764" height="194" rx="20" fill="rgba(15,23,42,0.92)" stroke="rgba(148,163,184,0.18)" />

          {scenarioType === "metro"
            ? renderMetro(normalizedRound, delayed, critical)
            : scenarioType === "airport"
              ? renderAirport(normalizedRound, normalizedTotalRounds, delayed, critical)
              : scenarioType === "industrial"
                ? renderIndustrial(normalizedRound, normalizedTotalRounds, delayed, critical)
                : renderHighway(normalizedRound, normalizedTotalRounds, delayed, critical)}
        </svg>

        <ScenarioLegend />
      </div>
    </div>
  );
}
