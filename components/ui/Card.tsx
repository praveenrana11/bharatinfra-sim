import * as React from "react";

export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`glass-panel rounded-2xl border border-slate-200/80 shadow-[0_14px_34px_rgba(15,23,42,0.07)] transition-shadow hover:shadow-[0_18px_38px_rgba(15,23,42,0.09)] ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  right,
  className = "",
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-start justify-between gap-4 border-b border-slate-200/80 px-5 py-4 ${className}`}>
      <div>
        <div className="text-base font-semibold text-slate-900">{title}</div>
        {subtitle ? <div className="mt-1 text-sm text-slate-600">{subtitle}</div> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

export function CardBody({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={`px-5 py-4 ${className}`}>{children}</div>;
}
