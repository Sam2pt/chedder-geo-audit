import { getStore } from "@netlify/blobs";

/**
 * Lightweight event capture for Chedder.
 *
 * The PRD calls for observing behavior before we make any monetization
 * decisions. This is the raw capture layer — every interesting thing that
 * happens (audit started, gate shown, lead signed up) lands here as an
 * append-only log we can aggregate later.
 *
 * Storage layout (Netlify Blobs, store: "events"):
 *   event:<iso-timestamp>:<rand>   — one row per event
 *
 * Tech choice: Blobs is the right call today. Events are append-only and
 * rarely queried individually — KV is the cheapest case for that pattern,
 * and the migration story is trivial (events are already JSON with
 * timestamps, so dumping them into Postgres later is a one-time script).
 * When we add login + "my audits" UI we'll want query capability and
 * that's the right moment to move the indexed/queryable data to Netlify
 * DB (Neon). For now, capture is what matters.
 */

const STORE_NAME = "events";

function getEventsStore() {
  return getStore({ name: STORE_NAME });
}

/**
 * Event types we know about. Kept as a string union (not an enum) so
 * client-side callers stay loose and we can add new types without a
 * backend deploy. We validate the shape but not the specific type.
 */
export type EventType =
  // Audit lifecycle
  | "audit.started"
  | "audit.completed"
  | "audit.failed"
  | "audit.viewed" // someone opened a permalink page
  | "audit.shared" // share button clicked
  | "audit.reaudit" // re-audit button clicked
  // Compare flow
  | "compare.started"
  | "compare.completed"
  // Soft gate
  | "gate.shown"
  | "gate.submitted"
  | "gate.dismissed"
  // Lead lifecycle (server-side counterpart of gate.submitted)
  | "lead.signup"
  // Session / page
  | "session.start"
  | "page.viewed"
  // Catch-all for ad-hoc
  | string;

export interface EventRow {
  /** When the event fired (ISO 8601). */
  createdAt: string;
  /** Persistent-per-browser identifier set in localStorage. */
  deviceId: string;
  /** Optional signed-up user email once the gate has been crossed. */
  leadEmail?: string;
  /** Human slug of the audit the event relates to, when applicable. */
  slug?: string;
  /** The event type (see EventType union above). */
  type: string;
  /** Loose metadata bag. Keep individual values < 500 chars. */
  meta?: Record<string, string | number | boolean | null>;
  /** User agent from the request. */
  ua?: string;
  /** HTTP referrer if present. */
  referrer?: string;
}

export interface SaveEventInput {
  deviceId: string;
  type: string;
  slug?: string;
  leadEmail?: string;
  meta?: Record<string, string | number | boolean | null>;
  ua?: string;
  referrer?: string;
}

/** Persist a single event. Returns the stored row. */
export async function saveEvent(input: SaveEventInput): Promise<EventRow> {
  const row: EventRow = {
    createdAt: new Date().toISOString(),
    deviceId: input.deviceId.slice(0, 64),
    type: input.type.slice(0, 64),
    slug: input.slug?.slice(0, 120),
    leadEmail: input.leadEmail?.trim().toLowerCase().slice(0, 200),
    meta: clampMeta(input.meta),
    ua: input.ua?.slice(0, 400),
    referrer: input.referrer?.slice(0, 500),
  };
  const key = `event:${row.createdAt}:${Math.random().toString(36).slice(2, 8)}`;
  try {
    const store = getEventsStore();
    await store.setJSON(key, row);
  } catch (e) {
    // Never let event capture break the request that triggered it.
    console.warn("[events] save failed:", e);
  }
  return row;
}

/** Bound meta values so a misbehaving client can't blow up storage. */
function clampMeta(
  raw: Record<string, string | number | boolean | null> | undefined
): Record<string, string | number | boolean | null> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, string | number | boolean | null> = {};
  let count = 0;
  for (const [k, v] of Object.entries(raw)) {
    if (count >= 20) break;
    if (typeof v === "string") out[k.slice(0, 40)] = v.slice(0, 500);
    else if (typeof v === "number" || typeof v === "boolean" || v === null)
      out[k.slice(0, 40)] = v;
    count++;
  }
  return out;
}
