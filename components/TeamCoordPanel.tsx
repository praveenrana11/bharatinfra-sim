"use client";

import { Button } from "@/components/ui/Button";
import { TEAM_MEMBER_ROLES, TeamMemberRole, getRoleLabel, getRoleName } from "@/lib/rolePermissions";

type RoleAssignment = {
  memberLabel: string;
  userId: string;
} | null;

type RoleStatus = {
  draftSavedAt: string | null;
};

type TeamCoordPanelProps = {
  currentRole: TeamMemberRole | null;
  assignments: Partial<Record<TeamMemberRole, RoleAssignment>>;
  statuses: Partial<Record<TeamMemberRole, RoleStatus>>;
  allRolesReady: boolean;
  canProjectDirectorLock: boolean;
  isLocked: boolean;
  locking: boolean;
  waitingMessage: string;
  onLock: () => void;
};

function formatSavedAt(value: string | null | undefined) {
  if (!value) return "Waiting for draft save";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Draft saved";

  return `Saved ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export default function TeamCoordPanel({
  currentRole,
  assignments,
  statuses,
  allRolesReady,
  canProjectDirectorLock,
  isLocked,
  locking,
  waitingMessage,
  onLock,
}: TeamCoordPanelProps) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-slate-900/60 px-5 py-5 shadow-[0_18px_45px_rgba(2,6,23,0.24)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-teal-300">Team Coordination</div>
          <div className="mt-2 text-2xl font-black tracking-tight text-white">Role Readiness Board</div>
          <div className="mt-2 text-sm leading-6 text-slate-300">
            Every specialist can see the full round, but final lock waits on saved inputs from the assigned roles.
          </div>
        </div>
        <div
          className={`rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] ${
            allRolesReady
              ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-100"
              : "border-amber-400/30 bg-amber-500/15 text-amber-100"
          }`}
        >
          {allRolesReady ? "All Roles Ready" : "Coordination In Progress"}
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        {TEAM_MEMBER_ROLES.map((role) => {
          const assignment = assignments[role] ?? null;
          const status = statuses[role];
          const ready = Boolean(status?.draftSavedAt);
          const current = currentRole === role;

          return (
            <div
              key={role}
              className={`grid gap-3 rounded-2xl border px-4 py-4 md:grid-cols-[minmax(0,1fr)_180px] ${
                current
                  ? "border-teal-400/30 bg-teal-500/10"
                  : "border-white/10 bg-slate-950/65"
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-sm font-black ${
                      ready
                        ? "border-emerald-400/30 bg-emerald-500/20 text-emerald-100"
                        : "border-slate-700 bg-slate-900 text-slate-400"
                    }`}
                  >
                    {ready ? "✓" : "•"}
                  </span>
                  <div>
                    <div className="text-sm font-bold text-white">{getRoleName(role)}</div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {getRoleLabel(role)}
                    </div>
                  </div>
                </div>
                <div className="mt-3 text-sm text-slate-300">
                  {assignment ? assignment.memberLabel : "Unassigned in identity setup"}
                </div>
              </div>
              <div className="flex flex-col justify-center text-left md:text-right">
                <div
                  className={`text-xs font-bold uppercase tracking-[0.18em] ${
                    ready ? "text-emerald-300" : "text-slate-500"
                  }`}
                >
                  {ready ? "Ready" : "Pending"}
                </div>
                <div className="mt-1 text-xs text-slate-400">{formatSavedAt(status?.draftSavedAt)}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-4">
        {isLocked ? (
          <div className="text-sm font-semibold text-emerald-200">Round already locked for this team.</div>
        ) : currentRole === "project_director" ? (
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-slate-300">
              {allRolesReady
                ? "All assigned roles have saved their drafts. The Project Director can finalize the round now."
                : waitingMessage}
            </div>
            <Button
              onClick={onLock}
              disabled={!canProjectDirectorLock || locking}
              className="w-full md:w-auto py-3 text-[11px] tracking-widest"
            >
              {locking ? "INITIALIZING..." : "LOCK AND GENERATE RESULTS"}
            </Button>
          </div>
        ) : (
          <div className="text-sm font-semibold text-slate-300">Waiting for Project Director to lock.</div>
        )}
      </div>
    </section>
  );
}
