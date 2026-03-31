"use client";

import React, { useEffect, useId, useRef, useState } from "react";

type TooltipProps = {
  title: string;
  lines: string[];
};

const MOBILE_BREAKPOINT = 768;

export function Tooltip({ title, lines }: TooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const titleId = useId();

  useEffect(() => {
    const updateIsMobile = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };

    updateIsMobile();
    window.addEventListener("resize", updateIsMobile);

    return () => window.removeEventListener("resize", updateIsMobile);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !isMobile) return;

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = overflow;
    };
  }, [isMobile, isOpen]);

  const stopTriggerEvent = (event: React.PointerEvent<HTMLButtonElement> | React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const toggleTooltip = (event: React.MouseEvent<HTMLButtonElement>) => {
    stopTriggerEvent(event);
    setIsOpen((current) => !current);
  };

  return (
    <span ref={wrapperRef} className="relative inline-flex">
      <button
        type="button"
        aria-label={`Explain ${title}`}
        aria-expanded={isOpen}
        aria-controls={titleId}
        aria-haspopup={isMobile ? "dialog" : "true"}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-[11px] font-black text-teal-700 shadow-sm transition hover:border-teal-300 hover:text-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
        onPointerDown={stopTriggerEvent}
        onClick={toggleTooltip}
      >
        ?
      </button>

      {isOpen && !isMobile ? (
        <div
          id={titleId}
          role="tooltip"
          className="absolute left-0 top-full z-50 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-900/15"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="text-sm font-semibold text-teal-700">{title}</div>
          <div className="mt-2 space-y-1.5 text-sm leading-6 text-slate-600">
            {lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>
      ) : null}

      {isOpen && isMobile ? (
        <>
          <button
            type="button"
            aria-label="Close tooltip"
            className="fixed inset-0 z-50 bg-slate-950/45"
            onClick={() => setIsOpen(false)}
          />
          <div
            id={titleId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${titleId}-heading`}
            className="fixed inset-x-0 bottom-0 z-[60] rounded-t-[28px] border border-slate-200 bg-white px-5 pb-6 pt-4 shadow-2xl shadow-slate-900/20"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="mx-auto h-1.5 w-14 rounded-full bg-slate-200" />
            <div className="mt-4 flex items-start justify-between gap-3">
              <div>
                <div id={`${titleId}-heading`} className="text-base font-semibold text-teal-700">
                  {title}
                </div>
                <div className="mt-2 space-y-2 text-sm leading-6 text-slate-600">
                  {lines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              </div>
              <button
                type="button"
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-teal-300 hover:text-teal-700"
                onClick={() => setIsOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </>
      ) : null}
    </span>
  );
}
