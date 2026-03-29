import * as React from "react";

export function Page({ children }: { children: React.ReactNode }) {
  return <div className="w-full p-1 sm:p-2">{children}</div>;
}

export function PageTitle({ children }: { children: React.ReactNode }) {
  return <h1 className="text-3xl font-black tracking-tight text-white uppercase sm:text-4xl">{children}</h1>;
}

export function PageSubTitle({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-sm text-blue-400/80 uppercase tracking-widest font-semibold sm:text-base">{children}</p>;
}
