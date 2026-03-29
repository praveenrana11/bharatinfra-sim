import * as React from "react";
import { cn } from "@/lib/cn";

type MetricTileProps = React.HTMLAttributes<HTMLDivElement> & {
  label: string;
  value: React.ReactNode;
  unit?: string;
  delta?: React.ReactNode;
  deltaPositive?: boolean;
  icon?: React.ReactNode;
  color?: string;
  helper?: React.ReactNode;
  tone?: "success" | "warning" | "danger" | "neutral" | "info";
  valueClassName?: string;
  labelClassName?: string;
  helperClassName?: string;
};

const toneColors = {
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#EF4444",
  neutral: "#64748B",
  info: "#0D6E6E",
} as const;

const toneClasses = {
  success: "border-emerald-500/20 bg-slate-950/80",
  warning: "border-amber-400/20 bg-slate-950/80",
  danger: "border-rose-500/20 bg-slate-950/80",
  neutral: "border-white/10 bg-slate-950/70",
  info: "border-teal-400/20 bg-slate-950/80",
} as const;

function DeltaArrow({ positive }: { positive: boolean }) {
  return positive ? (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
      <path d="M8 3.334 12.667 8H9.334v4H6.667V8H3.334L8 3.334Z" />
    </svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
      <path d="M6.667 4h2.666v4h3.334L8 12.666 3.334 8h3.333V4Z" />
    </svg>
  );
}

export function MetricTile({
  label,
  value,
  unit,
  delta,
  deltaPositive = true,
  icon,
  color,
  helper,
  tone,
  valueClassName,
  labelClassName,
  helperClassName,
  className,
  style,
  ...props
}: MetricTileProps) {
  const accentColor = color ?? (tone ? toneColors[tone] : "#0D6E6E");
  const isToneTile = Boolean(tone);

  return (
    <div
      className={cn(
        "rounded-xl border p-5 shadow-sm",
        isToneTile ? toneClasses[tone!] : "border-brand-border bg-brand-card",
        className
      )}
      style={{ ...style, borderTopWidth: 4, borderTopColor: accentColor }}
      {...props}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className={cn("text-label", isToneTile ? "text-slate-400" : "text-brand-muted", labelClassName)}>
            {label}
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div
              className={cn(
                "font-display",
                isToneTile ? "text-heading-2 text-white" : "text-heading-1 text-brand-dark",
                valueClassName
              )}
            >
              {value}
            </div>
            {unit ? (
              <div className={cn("pb-1 text-caption", isToneTile ? "text-slate-400" : "text-brand-muted")}>
                {unit}
              </div>
            ) : null}
          </div>
        </div>
        {icon ? (
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm"
            style={{ backgroundColor: `${accentColor}1A`, color: accentColor }}
          >
            {icon}
          </div>
        ) : null}
      </div>

      {delta !== undefined && delta !== null && delta !== "" ? (
        <div
          className={cn(
            "mt-4 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
            deltaPositive
              ? "bg-brand-success/10 text-brand-success"
              : "bg-brand-danger/10 text-brand-danger"
          )}
        >
          <DeltaArrow positive={deltaPositive} />
          <span>{delta}</span>
        </div>
      ) : null}

      {helper ? (
        <div
          className={cn(
            "mt-3 text-caption",
            isToneTile ? "text-slate-400" : "text-brand-muted",
            helperClassName
          )}
        >
          {helper}
        </div>
      ) : null}
    </div>
  );
}
