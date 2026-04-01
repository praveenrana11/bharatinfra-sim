"use client";

import { useEffect, useMemo, useState } from "react";
import { InboxMessage } from "@/lib/inboxEngine";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

type ProjectInboxProps = {
  sessionId: string;
  roundNumber: number;
  companyName: string;
  messages: InboxMessage[];
};

const TYPE_STYLES: Record<
  InboxMessage["type"],
  {
    itemBorder: string;
    badgeClass: string;
    label: string;
  }
> = {
  urgent: {
    itemBorder: "border-l-4 border-l-rose-500",
    badgeClass: "border-rose-400/20 bg-rose-500/10 text-rose-200",
    label: "Urgent",
  },
  warning: {
    itemBorder: "border-l-4 border-l-amber-400",
    badgeClass: "border-amber-300/30 bg-amber-400/15 text-amber-100",
    label: "Warning",
  },
  info: {
    itemBorder: "border-l-4 border-l-slate-400",
    badgeClass: "border-slate-300 bg-slate-100 text-slate-700",
    label: "Info",
  },
  opportunity: {
    itemBorder: "border-l-4 border-l-teal-500",
    badgeClass: "border-teal-400/25 bg-teal-500/10 text-teal-100",
    label: "Opportunity",
  },
};

function storageKey(sessionId: string, roundNumber: number, messageId: string) {
  return `bharatinfra:inbox:${sessionId}:${roundNumber}:${messageId}`;
}

function stringToSeed(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function buildTimeLabel(roundNumber: number, messageId: string, index: number) {
  const seed = stringToSeed(`${roundNumber}:${messageId}:${index}`);
  const hour = 7 + (seed % 11);
  const minute = [8, 17, 24, 39, 46, 58][seed % 6];
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function sortMessages(messages: InboxMessage[]) {
  const typePriority: Record<InboxMessage["type"], number> = {
    urgent: 0,
    warning: 1,
    opportunity: 2,
    info: 3,
  };

  return [...messages].sort((left, right) => typePriority[left.type] - typePriority[right.type]);
}

export function ProjectInbox({ sessionId, roundNumber, companyName, messages }: ProjectInboxProps) {
  const orderedMessages = useMemo(() => sortMessages(messages), [messages]);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(orderedMessages[0]?.id ?? "");
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const nextReadIds = new Set<string>();
    for (const message of orderedMessages) {
      if (window.localStorage.getItem(storageKey(sessionId, roundNumber, message.id)) === "read") {
        nextReadIds.add(message.id);
      }
    }
    setReadIds(nextReadIds);
  }, [orderedMessages, roundNumber, sessionId]);

  useEffect(() => {
    if (!orderedMessages.some((message) => message.id === selectedId)) {
      setSelectedId(orderedMessages[0]?.id ?? "");
    }
  }, [orderedMessages, selectedId]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const selectedMessage = orderedMessages.find((message) => message.id === selectedId) ?? orderedMessages[0] ?? null;
  const unreadCount = orderedMessages.filter((message) => !readIds.has(message.id)).length;
  const hasUrgentUnread = orderedMessages.some((message) => message.type === "urgent" && !readIds.has(message.id));

  const markAsRead = (messageId: string) => {
    window.localStorage.setItem(storageKey(sessionId, roundNumber, messageId), "read");
    setReadIds((current) => {
      const next = new Set(current);
      next.add(messageId);
      return next;
    });
  };

  const openMessage = (messageId: string) => {
    setSelectedId(messageId);
    markAsRead(messageId);
  };

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => setOpen(true)}
        className={cn(
          "rounded-2xl border-white/10 bg-slate-950/70 px-4 py-2.5 text-slate-100 hover:border-white/20 hover:bg-slate-900",
          hasUrgentUnread && "border-amber-300/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/15"
        )}
      >
        <span aria-hidden="true">📬</span>
        <span>Inbox ({unreadCount})</span>
        {hasUrgentUnread ? (
          <span className="rounded-full border border-amber-300/30 bg-amber-400 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.18em] text-slate-950">
            urgent
          </span>
        ) : null}
      </Button>

      {open ? (
        <div className="fixed inset-0 z-[95] flex items-stretch justify-center bg-slate-950/80 p-0 backdrop-blur-sm md:p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-inbox-title"
            className="flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-none border-0 bg-white shadow-[0_35px_120px_rgba(15,23,42,0.45)] md:h-[88vh] md:rounded-[28px] md:border md:border-slate-200"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-4 py-4 md:px-6 md:py-5">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">{companyName} | Site Inbox | Round {roundNumber}</div>
                <h2 id="project-inbox-title" className="mt-2 text-2xl font-black text-slate-950">
                  Project Inbox
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {unreadCount} unread message{unreadCount === 1 ? "" : "s"} across site operations, client, and commercial threads.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-800"
                aria-label="Close inbox"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[340px_minmax(0,1fr)]">
              <aside className="min-h-0 overflow-y-auto border-b border-slate-200 bg-slate-50 md:border-b-0 md:border-r">
                <div className="space-y-3 p-4">
                  {orderedMessages.map((message, index) => {
                    const isSelected = message.id === selectedMessage?.id;
                    const isUnread = !readIds.has(message.id);
                    const styles = TYPE_STYLES[message.type];

                    return (
                      <button
                        key={message.id}
                        type="button"
                        title={message.consequence_hint}
                        onClick={() => openMessage(message.id)}
                        className={cn(
                          "w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left transition hover:border-slate-300 hover:bg-slate-50",
                          styles.itemBorder,
                          isSelected && "border-slate-900 bg-slate-950 text-white hover:bg-slate-950"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className={cn("truncate text-xs font-bold uppercase tracking-[0.2em]", isSelected ? "text-slate-400" : "text-slate-500")}>
                              {message.from}
                            </div>
                            <div className={cn("mt-2 text-sm font-bold leading-5", isSelected ? "text-white" : "text-slate-900")}>
                              {message.icon} {message.subject}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {isUnread ? <span className="h-2.5 w-2.5 rounded-full bg-amber-400" aria-label="Unread message" /> : null}
                            <span className={cn("text-[11px] font-semibold", isSelected ? "text-slate-400" : "text-slate-500")}>
                              {buildTimeLabel(roundNumber, message.id, index)}
                            </span>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center gap-2">
                          <Badge className={cn(styles.badgeClass, isSelected && "border-white/10 bg-white/10 text-white")}>
                            {styles.label}
                          </Badge>
                          {message.requires_response ? (
                            <Badge className={cn("border-slate-300 bg-slate-100 text-slate-700", isSelected && "border-white/10 bg-white/10 text-white")}>
                              Response needed
                            </Badge>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </aside>

              <section className="min-h-0 overflow-y-auto bg-white">
                {selectedMessage ? (
                  <div className="flex min-h-full flex-col px-5 py-5 md:px-8 md:py-8">
                    <div className="flex flex-wrap items-center gap-3">
                      <Badge className={TYPE_STYLES[selectedMessage.type].badgeClass}>{TYPE_STYLES[selectedMessage.type].label}</Badge>
                      {selectedMessage.requires_response ? (
                        <Badge className="border-slate-300 bg-slate-100 text-slate-700">Requires response</Badge>
                      ) : null}
                    </div>
                    <div className="mt-5 text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">
                      {selectedMessage.from}
                    </div>
                    <h3 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
                      {selectedMessage.icon} {selectedMessage.subject}
                    </h3>
                    <div className="mt-6 max-w-3xl text-base leading-8 text-slate-700">
                      {selectedMessage.body}
                    </div>

                    {selectedMessage.consequence_hint ? (
                      <div className="mt-auto pt-8 text-sm italic text-teal-700">
                        ⚠️ Consequence: {selectedMessage.consequence_hint}
                      </div>
                    ) : (
                      <div className="mt-auto pt-8 text-sm italic text-slate-400">
                        No immediate consequence flag on this thread.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center px-6 py-16 text-center text-slate-500">
                    Select a message to review the site thread.
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
