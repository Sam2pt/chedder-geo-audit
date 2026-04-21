import { getStore } from "@netlify/blobs";

/**
 * Sliding-window rate limiter backed by Netlify Blobs.
 *
 * Keyed by deviceId (from localStorage) AND IP (from x-forwarded-for) —
 * whoever hits the cap first wins. deviceId catches "I'm on the same
 * laptop running audits in a loop" and IP catches "attacker rotating
 * deviceIds from one box." Signed-up users (anyone with a leadEmail)
 * get a higher ceiling.
 *
 * Window is 1 hour. Anonymous: 5 audits/hr. Signed-up: 25/hr.
 *
 * Storage is intentionally lightweight — a single blob per key holding
 * an array of unix-ms timestamps. Old entries are pruned on read. If
 * blobs are unavailable (local dev without netlify-cli, etc.), the
 * limiter fails open rather than blocking all traffic.
 */

const STORE_NAME = "rate-limits";
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

export const LIMITS = {
  anonymous: 5,
  signedUp: 25,
} as const;

function getRateStore() {
  try {
    return getStore({ name: STORE_NAME });
  } catch {
    return null;
  }
}

function sanitizeKey(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Unix-ms when the oldest hit in the window ages out. */
  resetAt: number;
  /** Which key tripped — useful for diagnostics/logging. */
  scope?: "device" | "ip";
}

interface Entry {
  hits: number[];
}

async function loadEntry(
  store: ReturnType<typeof getStore>,
  key: string
): Promise<Entry> {
  try {
    const raw = await store.get(key, { type: "json" });
    if (
      raw &&
      typeof raw === "object" &&
      Array.isArray((raw as Entry).hits)
    ) {
      return raw as Entry;
    }
  } catch {
    // fall through
  }
  return { hits: [] };
}

async function saveEntry(
  store: ReturnType<typeof getStore>,
  key: string,
  entry: Entry
): Promise<void> {
  try {
    await store.setJSON(key, entry);
  } catch {
    // ignore — we don't want a blob write failure to block audits
  }
}

/**
 * Check and record a single audit attempt.
 * Call this at the top of the audit handler. If `allowed` is false,
 * return 429 with the resetAt hint in a Retry-After-style field.
 */
export async function checkAuditRateLimit(opts: {
  deviceId?: string;
  ip?: string;
  signedUp: boolean;
}): Promise<RateLimitResult> {
  const store = getRateStore();
  const limit = opts.signedUp ? LIMITS.signedUp : LIMITS.anonymous;
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  // Fail open if blobs aren't wired up (e.g. local dev without netlify CLI)
  if (!store) {
    return { allowed: true, limit, remaining: limit, resetAt: now + WINDOW_MS };
  }

  const keys: Array<{ scope: "device" | "ip"; key: string }> = [];
  if (opts.deviceId) {
    keys.push({ scope: "device", key: `device:${sanitizeKey(opts.deviceId)}` });
  }
  if (opts.ip) {
    keys.push({ scope: "ip", key: `ip:${sanitizeKey(opts.ip)}` });
  }

  if (keys.length === 0) {
    // No identifying info at all — allow but don't record. This can only
    // happen if the client omits deviceId AND we can't read an IP header,
    // which shouldn't occur on Netlify. Don't fail closed on it.
    return { allowed: true, limit, remaining: limit, resetAt: now + WINDOW_MS };
  }

  const entries = await Promise.all(
    keys.map(async ({ scope, key }) => {
      const entry = await loadEntry(store, key);
      const pruned = entry.hits.filter((t) => t > windowStart);
      return { scope, key, pruned };
    })
  );

  // Check every scope — if any is over, we reject and don't record a
  // new hit anywhere (avoids compounding the block).
  for (const e of entries) {
    if (e.pruned.length >= limit) {
      const oldest = e.pruned[0] ?? now;
      return {
        allowed: false,
        limit,
        remaining: 0,
        resetAt: oldest + WINDOW_MS,
        scope: e.scope,
      };
    }
  }

  // Record the hit against every scope so both gates advance together.
  await Promise.all(
    entries.map((e) =>
      saveEntry(store, e.key, { hits: [...e.pruned, now] })
    )
  );

  const tightest = entries.reduce((min, e) =>
    e.pruned.length > min.pruned.length ? e : min
  );
  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - (tightest.pruned.length + 1)),
    resetAt: (tightest.pruned[0] ?? now) + WINDOW_MS,
  };
}

/**
 * Best-effort extraction of the client IP from request headers. Netlify
 * sets `x-nf-client-connection-ip`; we fall back to the leftmost entry
 * in `x-forwarded-for`.
 */
export function getClientIp(headers: Headers): string | undefined {
  const nf = headers.get("x-nf-client-connection-ip");
  if (nf) return nf.trim();
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || undefined;
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  return undefined;
}

/**
 * Build a user-facing message for 429s. Keeps the tone consistent with
 * the rest of the app — friendly, not scolding.
 */
export function rateLimitMessage(result: RateLimitResult): string {
  const mins = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 60000));
  if (result.limit <= LIMITS.anonymous) {
    return `You've run ${result.limit} audits in the last hour. Sign up and you'll get ${LIMITS.signedUp} per hour, or try again in ${mins} min.`;
  }
  return `Whoa, that's ${result.limit} audits in an hour. Give it ${mins} min and we'll pick back up.`;
}
