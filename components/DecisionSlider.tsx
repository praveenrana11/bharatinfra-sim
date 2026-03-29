"use client";

import React from "react";

export function DecisionSlider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  disabled,
  formatValue,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  disabled?: boolean;
  formatValue?: (value: number) => string;
  hint?: string;
  onChange: (next: number) => void;
}) {
  const displayValue = formatValue ? formatValue(value) : `${value}${suffix}`;

  return (
    <label className={`block rounded-xl border border-slate-700 bg-slate-900/50 p-4 transition-all focus-within:border-blue-500/50 focus-within:bg-slate-800/80 ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="font-bold text-slate-300">{label}</span>
        <span className="text-sm font-black text-blue-400 font-mono">{displayValue}</span>
      </div>
      <input
        className="mt-4 w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400 transition-all outline-none focus:ring-2 focus:ring-blue-500/30"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="flex justify-between mt-2 text-[10px] uppercase font-semibold text-slate-500">
        <span>{min}{suffix}</span>
        <span>{max}{suffix}</span>
      </div>
      {hint ? <div className="mt-2 text-[11px] text-slate-500">{hint}</div> : null}
    </label>
  );
}
