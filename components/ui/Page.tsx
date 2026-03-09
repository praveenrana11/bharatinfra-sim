import * as React from "react";

export function Page({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-[1160px] p-1 sm:p-2">{children}</div>;
}

export function PageTitle({ children }: { children: React.ReactNode }) {
  return <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{children}</h1>;
}

export function PageSubTitle({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-sm text-slate-600 sm:text-base">{children}</p>;
}
