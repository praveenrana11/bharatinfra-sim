import { ConstructionEvent, EventImpact } from "@/lib/constructionNews";

const ZERO_IMPACT: EventImpact = {
  schedule: 0,
  cost: 0,
  quality: 0,
  safety: 0,
  stakeholder: 0,
  cash: 0,
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function sanitizeTags(tags: unknown) {
  if (!Array.isArray(tags)) return ["general"];

  const next = tags
    .map((tag) => (typeof tag === "string" ? tag.trim().toLowerCase() : ""))
    .filter(Boolean)
    .slice(0, 8);

  return next.length > 0 ? next : ["general"];
}

function sanitizeImpacts(impacts: unknown): EventImpact {
  if (!impacts || typeof impacts !== "object") return { ...ZERO_IMPACT };

  const record = impacts as Record<string, unknown>;

  return {
    schedule: clamp(asNumber(record.schedule, 0), -0.2, 0.2),
    cost: clamp(asNumber(record.cost, 0), -0.2, 0.2),
    quality: clamp(asNumber(record.quality, 0), -20, 20),
    safety: clamp(asNumber(record.safety, 0), -20, 20),
    stakeholder: clamp(asNumber(record.stakeholder, 0), -20, 20),
    cash: clamp(asNumber(record.cash, 0), -500000, 500000),
  };
}

function sanitizeSeverity(value: unknown): 1 | 2 | 3 {
  const rounded = Math.round(asNumber(value, 2));
  if (rounded <= 1) return 1;
  if (rounded >= 3) return 3;
  return 2;
}

function fallbackId(prefix: string, index: number) {
  return `${prefix}-${index + 1}`;
}

export function makeNewsEventId(title: string, index: number) {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug || fallbackId("event", index);
}

export function parseConstructionEvents(payload: unknown): ConstructionEvent[] | null {
  if (!Array.isArray(payload)) return null;

  const parsed: ConstructionEvent[] = payload
    .map((raw, index) => {
      if (!raw || typeof raw !== "object") return null;

      const record = raw as Record<string, unknown>;
      const title = typeof record.title === "string" ? record.title.trim() : "";
      const description = typeof record.description === "string" ? record.description.trim() : "";

      if (!title || !description) return null;

      const idRaw = typeof record.id === "string" ? record.id.trim() : "";
      const id = idRaw || makeNewsEventId(title, index);

      const imageUrl = typeof record.image_url === "string" ? record.image_url.trim() : "";

      return {
        id,
        title,
        description,
        severity: sanitizeSeverity(record.severity),
        tags: sanitizeTags(record.tags),
        impacts: sanitizeImpacts(record.impacts),
        image_url: imageUrl || undefined,
      };
    })
    .filter(Boolean) as ConstructionEvent[];

  return parsed.length > 0 ? parsed : null;
}

export function tagsToCsv(tags: string[]) {
  return tags.join(", ");
}

export function csvToTags(value: string) {
  const tags = value
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 8);

  return tags.length > 0 ? tags : ["general"];
}
