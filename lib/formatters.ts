const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  approved: "Approved",
  closed: "Closed",
  complete: "Complete",
  completed: "Completed",
  draft: "Draft",
  in_progress: "In Progress",
  locked: "Locked",
  not_opened: "Not Opened",
  not_played: "Not Played",
  open: "Open",
  pending: "Pending",
  rejected: "Rejected",
  under_review: "Under Review",
};

export function formatStatus(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (!normalized) return "";

  return (
    STATUS_LABELS[normalized] ??
    normalized.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
  );
}
