"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

export type LockConfirmationSection = {
  title: string;
  items: Array<{
    label: string;
    value: string;
  }>;
};

type LockConfirmationModalProps = {
  open: boolean;
  sections: LockConfirmationSection[];
  warningItems?: string[];
  onClose: () => void;
  onReview: () => void;
  onConfirm: () => void;
  isSubmitting?: boolean;
};

export default function LockConfirmationModal({
  open,
  sections,
  warningItems = [],
  onClose,
  onReview,
  onConfirm,
  isSubmitting = false,
}: LockConfirmationModalProps) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSubmitting) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSubmitting, onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-stretch justify-center bg-slate-950/80 px-0 py-0 backdrop-blur-sm sm:items-center sm:px-4 sm:py-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lock-confirmation-title"
        className="flex h-full w-full flex-col overflow-hidden rounded-none border-0 bg-white shadow-[0_35px_120px_rgba(15,23,42,0.45)] sm:h-auto sm:max-h-[90vh] sm:max-w-5xl sm:rounded-[28px] sm:border sm:border-slate-200"
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-4 py-4 sm:px-6 sm:py-5">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.24em] text-slate-500">
              Final Lock Check
            </div>
            <h2 id="lock-confirmation-title" className="mt-2 text-2xl font-black text-slate-950">
              Lock and Generate Results
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Review every major choice from this round before you make the lock permanent.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close confirmation modal"
            className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-800 disabled:pointer-events-none disabled:opacity-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="border-b border-rose-200 bg-rose-50 px-4 py-4 sm:px-6">
          <div className="text-sm font-semibold text-rose-800">
            Once locked, decisions cannot be changed for this round.
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
          {warningItems.length > 0 ? (
            <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">
                Current Lock Warnings
              </div>
              <div className="mt-3 space-y-2">
                {warningItems.map((item) => (
                  <div key={item} className="text-sm text-amber-900">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            {sections.map((section) => (
              <section
                key={section.title}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4"
              >
                <div className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                  {section.title}
                </div>
                <div className="mt-4 space-y-3">
                  {section.items.map((item) => (
                    <div key={`${section.title}-${item.label}`} className="rounded-xl bg-white px-4 py-3">
                      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                        {item.label}
                      </div>
                      <div className="mt-1 text-sm font-semibold leading-6 text-slate-900">
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-4 sm:px-6 sm:py-5 md:flex-row md:items-center md:justify-between">
          <Button
            type="button"
            variant="secondary"
            onClick={onReview}
            disabled={isSubmitting}
            className="border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-100"
          >
            Review Decisions
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="border-rose-700 bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-[0_10px_24px_rgba(225,29,72,0.28)] hover:from-rose-500 hover:to-red-500"
          >
            {isSubmitting ? "Locking..." : "Confirm & Lock"}
          </Button>
        </div>
      </div>
    </div>
  );
}
