import * as React from "react";
import { cn } from "@/lib/cn";

type BadgeVariant = "success" | "warning" | "danger" | "neutral" | "info";
type BadgeSize = "sm" | "md";

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
  tone?: BadgeVariant;
  size?: BadgeSize;
};

const variantClasses: Record<BadgeVariant, string> = {
  success: "border border-brand-success/20 bg-brand-success/10 text-brand-success",
  warning: "border border-brand-accent/20 bg-brand-accent/10 text-amber-700",
  danger: "border border-brand-danger/20 bg-brand-danger/10 text-brand-danger",
  neutral: "border border-slate-300 bg-slate-100 text-slate-700",
  info: "border border-brand-primary/20 bg-brand-primary/10 text-brand-primary",
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: "px-2 py-0.5",
  md: "px-2.5 py-1",
};

export function Badge({
  className,
  variant = "neutral",
  tone,
  size = "md",
  children,
  ...props
}: BadgeProps) {
  const resolvedVariant = tone ?? variant;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-semibold text-xs",
        variantClasses[resolvedVariant],
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
