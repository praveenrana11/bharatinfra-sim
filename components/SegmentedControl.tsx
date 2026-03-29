"use client";

import React from "react";

export function SegmentedControl<T extends string>({
  options,
  activeOption,
  onSelect,
  disabled
}: {
  options: { value: T; text: string; hint?: string }[];
  activeOption: T | null | undefined;
  onSelect: (val: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2 p-1.5 bg-slate-900/60 rounded-xl border border-slate-800 ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      {options.map((opt) => {
        const isActive = activeOption === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onSelect(opt.value)}
            disabled={disabled}
            className={`w-full text-left px-4 py-3 rounded-lg flex flex-col transition-all duration-200 outline-none focus:ring-2 focus:ring-blue-500/30 ${
              isActive 
                ? "bg-blue-600 shadow-md shadow-blue-500/20 border border-blue-400 text-white font-bold" 
                : "bg-transparent text-slate-400 border border-transparent hover:bg-slate-800 hover:text-slate-200 active:bg-slate-700"
            }`}
          >
            <div className="text-sm">{opt.text}</div>
            {opt.hint && (
              <div className={`text-[11px] mt-1 leading-tight ${isActive ? "text-blue-100/90" : "text-slate-500"}`}>
                {opt.hint}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
