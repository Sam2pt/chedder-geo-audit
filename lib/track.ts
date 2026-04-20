/**
 * Client-side analytics helpers.
 *
 * Two things this file owns:
 *  1. A persistent per-browser deviceId (localStorage UUID). This is the
 *     key that stitches together a user's activity before and after
 *     they sign up via the soft gate.
 *  2. A fire-and-forget track() that posts events to /api/events.
 *     Uses navigator.sendBeacon when available (survives page unload);
 *     falls back to fetch with keepalive for browsers that don't.
 *
 * We intentionally don't import any analytics SDKs. When we outgrow
 * this (funnels, retention cohorts, session replay) PostHog is the
 * natural next step — generous free tier, queryable events, drop-in.
 * Until then, keeping the raw capture fully in our control is the
 * right move.
 */

const DEVICE_ID_KEY = "chedder:deviceId";
const LEAD_EMAIL_KEY = "chedder:leadEmail";

/** Get or create a per-browser stable id. Safe to call on the server. */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing && existing.length >= 6) return existing;
    const fresh = makeId();
    localStorage.setItem(DEVICE_ID_KEY, fresh);
    return fresh;
  } catch {
    // localStorage disabled or quota exceeded — generate ephemeral.
    return makeId();
  }
}

/** Returns the saved lead email if the user has signed up. */
export function getLeadEmail(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return localStorage.getItem(LEAD_EMAIL_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Fire-and-forget event send. Never throws, never blocks UI.
 *
 * Pattern of use:
 *   track("audit.started", { url });
 *   track("gate.submitted");
 *   track("audit.shared", { via: "copy-link" });
 */
export function track(
  type: string,
  meta?: Record<string, string | number | boolean | null>,
  opts?: { slug?: string }
): void {
  if (typeof window === "undefined") return;
  const payload = JSON.stringify({
    deviceId: getDeviceId(),
    type,
    slug: opts?.slug,
    leadEmail: getLeadEmail(),
    meta,
  });

  // sendBeacon is the correct primitive for unload/leave tracking.
  // It queues the request and the browser sends it even if the page
  // navigates away immediately after.
  try {
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.sendBeacon === "function"
    ) {
      const ok = navigator.sendBeacon(
        "/api/events",
        new Blob([payload], { type: "application/json" })
      );
      if (ok) return;
    }
  } catch {
    // fall through to fetch
  }
  // Fallback for browsers without sendBeacon, or when it returns false.
  try {
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    });
  } catch {
    // Swallow — capture is best-effort.
  }
}

function makeId(): string {
  // Short crypto-random id. 12 base36 chars = plenty for our scale and
  // readable in logs. Falls back to Math.random for very old browsers.
  try {
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      const bytes = new Uint8Array(9);
      crypto.getRandomValues(bytes);
      return Array.from(bytes)
        .map((b) => b.toString(36).padStart(2, "0"))
        .join("")
        .slice(0, 14);
    }
  } catch {
    // fall through
  }
  return (
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 8)
  );
}
