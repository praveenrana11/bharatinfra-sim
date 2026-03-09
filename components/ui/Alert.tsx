import * as React from "react";

type AlertVariant = "info" | "success" | "error";

export function Alert({
  variant = "info",
  className = "",
  children,
}: {
  variant?: AlertVariant;
  className?: string;
  children: React.ReactNode;
}) {
  const base = "rounded-lg border px-4 py-3 text-sm";
  const styles: Record<AlertVariant, string> = {
    info: "border-slate-300 bg-white text-slate-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    error: "border-rose-200 bg-rose-50 text-rose-900",
  };

  return <div className={`${base} ${styles[variant]} ${className}`}>{children}</div>;
}
