"use client";

import { useEffect, useRef } from "react";

export type MetricTileModel = {
  key: string;
  label: string;
  current: number;
  displayValue: string;
  deltaLabel: string;
  deltaArrow: string;
  barPercent: number;
  isHealthy: boolean;
  thresholdLabel: string;
  previous: number | null;
};

export type ComparisonMetric = {
  label: string;
  current: number;
  previous: number | null;
  scaledCurrent: number;
  scaledPrevious: number | null;
  format: "index" | "score";
};

export type HistoryMetricRow = {
  roundLabel: string;
  spi: number;
  cpi: number;
  quality: number;
  safety: number;
  stakeholder: number;
  pointsScaled: number;
};

export function ScoreGauge({
  points,
  roundNumber,
  benchmarkLabel,
  color,
  rankLabel,
}: {
  points: number;
  roundNumber: number;
  benchmarkLabel: string;
  color: string;
  rankLabel: string;
}) {
  const size = 236;
  const radius = 86;
  const stroke = 18;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * Math.max(0, Math.min(points / 800, 1));

  return (
    <div className="flex flex-col items-center justify-center">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-[236px] w-[236px] overflow-visible">
        <defs>
          <filter id="score-gauge-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(148,163,184,0.15)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeLinecap="round"
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          filter="url(#score-gauge-glow)"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={58}
          fill="rgba(2,6,23,0.86)"
          stroke="rgba(255,255,255,0.06)"
        />
        <text x="50%" y="47%" textAnchor="middle" className="fill-white text-[34px] font-black tracking-tight">
          {points}
        </text>
        <text x="50%" y="58%" textAnchor="middle" className="fill-slate-300 text-[11px] font-semibold uppercase tracking-[0.28em]">
          points
        </text>
        <text x="50%" y="67%" textAnchor="middle" className="fill-slate-400 text-[10px] font-semibold uppercase tracking-[0.18em]">
          {benchmarkLabel}
        </text>
      </svg>

      <div className="mt-4 text-center">
        <div className="text-sm font-semibold text-white">Round {roundNumber} Performance</div>
        <div className="mt-2 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-slate-200">
          {rankLabel}
        </div>
      </div>
    </div>
  );
}

export function MetricTile({ tile }: { tile: MetricTileModel }) {
  const tone = tile.isHealthy
    ? {
        border: "border-emerald-500/20",
        panel: "bg-emerald-500/8",
        number: "text-emerald-200",
        delta: "text-emerald-200",
        fill: "from-emerald-400 to-teal-400",
      }
    : {
        border: "border-rose-500/20",
        panel: "bg-rose-500/8",
        number: "text-rose-200",
        delta: "text-rose-200",
        fill: "from-rose-400 to-orange-400",
      };

  return (
    <div className={`rounded-[26px] border ${tone.border} ${tone.panel} px-4 py-4`}>
      <div className={`text-4xl font-black tracking-tight ${tone.number}`}>{tile.displayValue}</div>
      <div className="mt-1 text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">{tile.label}</div>
      <div className="mt-3 flex items-center justify-between gap-3 text-xs">
        <div className={`font-semibold ${tile.previous === null ? "text-slate-300" : tone.delta}`}>
          {tile.deltaArrow} {tile.deltaLabel}
        </div>
        <div className="text-slate-500">{tile.thresholdLabel}</div>
      </div>
      <div className="mt-3 h-2.5 rounded-full bg-white/10">
        <div className={`h-2.5 rounded-full bg-gradient-to-r ${tone.fill}`} style={{ width: `${tile.barPercent}%` }} />
      </div>
      <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">Normalized on 0-1.2 scale</div>
    </div>
  );
}

export function RadarComparisonChart({ metrics }: { metrics: ComparisonMetric[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let chart: { destroy: () => void } | null = null;
    let cancelled = false;

    const renderChart = async () => {
      if (!canvasRef.current) return;
      const { default: Chart } = await import("chart.js/auto");
      if (cancelled || !canvasRef.current) return;

      chart = new Chart(canvasRef.current, {
        type: "radar",
        data: {
          labels: metrics.map((metric) => metric.label),
          datasets: [
            {
              label: "Current round",
              data: metrics.map((metric) => metric.scaledCurrent),
              borderColor: "#14b8a6",
              backgroundColor: "rgba(20, 184, 166, 0.28)",
              pointBackgroundColor: "#2dd4bf",
              pointBorderColor: "#ccfbf1",
              pointHoverBackgroundColor: "#99f6e4",
              pointHoverBorderColor: "#ffffff",
              borderWidth: 2.5,
              fill: true,
            },
            ...(metrics.some((metric) => metric.scaledPrevious !== null)
              ? [{
                  label: "Previous round",
                  data: metrics.map((metric) => metric.scaledPrevious ?? 0),
                  borderColor: "#94a3b8",
                  backgroundColor: "rgba(148, 163, 184, 0)",
                  pointBackgroundColor: "#cbd5e1",
                  pointBorderColor: "#e2e8f0",
                  pointHoverBackgroundColor: "#e2e8f0",
                  pointHoverBorderColor: "#ffffff",
                  borderWidth: 2,
                  fill: false,
                  borderDash: [6, 6],
                }]
              : []),
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: {
            legend: {
              position: "bottom",
              labels: { color: "#cbd5e1", boxWidth: 18, boxHeight: 10 },
            },
            tooltip: {
              callbacks: {
                label(context) {
                  const metric = metrics[context.dataIndex];
                  const actual = context.datasetIndex === 0 ? metric.current : (metric.previous ?? 0);
                  return `${context.dataset.label}: ${metric.format === "index" ? actual.toFixed(2) : Math.round(actual)}`;
                },
              },
            },
          },
          scales: {
            r: {
              min: 0,
              max: 100,
              angleLines: { color: "rgba(148,163,184,0.18)" },
              grid: { color: "rgba(148,163,184,0.18)" },
              pointLabels: {
                color: "#e2e8f0",
                font: { size: 12, weight: 600 },
              },
              ticks: {
                stepSize: 20,
                color: "#64748b",
                showLabelBackdrop: false,
                z: 1,
              },
            },
          },
        },
      });
    };

    void renderChart();
    return () => {
      cancelled = true;
      chart?.destroy();
    };
  }, [metrics]);

  return <div className="h-[360px]"><canvas ref={canvasRef} /></div>;
}

export function PerformanceHistoryChart({ rows }: { rows: HistoryMetricRow[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let chart: { destroy: () => void } | null = null;
    let cancelled = false;

    const renderChart = async () => {
      if (!canvasRef.current) return;
      const { default: Chart } = await import("chart.js/auto");
      if (cancelled || !canvasRef.current) return;

      chart = new Chart(canvasRef.current, {
        type: "line",
        data: {
          labels: rows.map((row) => row.roundLabel),
          datasets: [
            { label: "SPI", data: rows.map((row) => row.spi), borderColor: "#14b8a6", backgroundColor: "#14b8a6", yAxisID: "yIndex", tension: 0.35, fill: false, borderWidth: 2.5 },
            { label: "CPI", data: rows.map((row) => row.cpi), borderColor: "#3b82f6", backgroundColor: "#3b82f6", yAxisID: "yIndex", tension: 0.35, fill: false, borderWidth: 2.5 },
            { label: "Quality", data: rows.map((row) => row.quality), borderColor: "#8b5cf6", backgroundColor: "#8b5cf6", yAxisID: "yScore", tension: 0.35, fill: false, borderWidth: 2.3 },
            { label: "Safety", data: rows.map((row) => row.safety), borderColor: "#22c55e", backgroundColor: "#22c55e", yAxisID: "yScore", tension: 0.35, fill: false, borderWidth: 2.3 },
            { label: "Points/100", data: rows.map((row) => row.pointsScaled), borderColor: "#f59e0b", backgroundColor: "#f59e0b", yAxisID: "yScore", tension: 0.35, fill: false, borderWidth: 2.3 },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: {
              position: "bottom",
              labels: { color: "#cbd5e1", usePointStyle: true, pointStyle: "line" },
            },
          },
          scales: {
            x: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(148,163,184,0.08)" } },
            yIndex: { type: "linear", position: "left", min: 0, max: 1.2, ticks: { color: "#94a3b8", stepSize: 0.2 }, grid: { color: "rgba(148,163,184,0.12)" } },
            yScore: { type: "linear", position: "right", min: 0, max: 100, ticks: { color: "#94a3b8", stepSize: 20 }, grid: { drawOnChartArea: false } },
          },
        },
      });
    };

    void renderChart();
    return () => {
      cancelled = true;
      chart?.destroy();
    };
  }, [rows]);

  return <div className="h-[360px]"><canvas ref={canvasRef} /></div>;
}
