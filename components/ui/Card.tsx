import * as React from "react";
import { cn } from "@/lib/cn";

type CardVariant = "default" | "elevated" | "metric" | "amber";

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: CardVariant;
  metricColor?: string;
};

const variantClasses: Record<CardVariant, string> = {
  default: "rounded-xl border border-brand-border bg-brand-card p-6 shadow-sm",
  elevated: "rounded-xl bg-brand-card p-6 shadow-md",
  metric: "rounded-xl border border-brand-border border-l-4 bg-brand-card p-5 shadow-sm",
  amber: "rounded-xl border border-amber-200 bg-amber-50 p-6",
};

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant = "default", metricColor = "#0D6E6E", className, children, style, ...props },
  ref
) {
  const darkSurfacePattern = /(bg-(slate|gray|zinc|neutral|stone|black)|bg-\[#|from-(slate|gray|zinc|neutral|stone|black)|to-(slate|gray|zinc|neutral|stone|black))/;
  const isDarkSurface = darkSurfacePattern.test(className ?? "");
  const cardStyle = {
    ...style,
    "--card-title-color": isDarkSurface ? "#F8FAFC" : "#0F172A",
    "--card-subtitle-color": isDarkSurface ? "#94A3B8" : "#64748B",
  } as React.CSSProperties;

  return (
    <div
      ref={ref}
      className={cn(variantClasses[variant], className)}
      style={
        variant === "metric"
          ? { ...cardStyle, borderLeftColor: metricColor }
          : cardStyle
      }
      {...props}
    >
      {children}
    </div>
  );
});

export function CardHeader({
  title,
  subtitle,
  right,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 border-b border-brand-border pb-4", className)}>
      <div>
        <div className="font-display text-heading-3 text-[color:var(--card-title-color)]">{title}</div>
        {subtitle ? <div className="mt-1 text-body text-[color:var(--card-subtitle-color)]">{subtitle}</div> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

export function CardBody({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("pt-4", className)}>{children}</div>;
}
