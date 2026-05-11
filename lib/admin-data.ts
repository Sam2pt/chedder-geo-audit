import { getStore } from "@netlify/blobs";
import type { AuditResult } from "./types";
import type { Lead } from "./leads";
import type { EventRow } from "./events";

/**
 * Admin summary helpers. Every function defensively handles the case
 * where blobs aren't available (local dev without netlify-cli) by
 * returning an empty list — the admin page will simply show zero rows
 * rather than crashing.
 *
 * Data volume today is tiny (a few hundred audits max) so we list with
 * generous caps. When we cross ~10k items we'll want a real index or
 * Netlify DB; until then this is the simplest thing that ships.
 */

export interface AdminAuditRow {
  slug: string;
  domain: string;
  url: string;
  overallScore: number;
  grade: string;
  timestamp: string;
  leadEmail?: string;
  deviceId?: string;
}

export interface AdminLeadRow {
  email: string;
  name: string;
  role: string;
  company: string;
  createdAt: string;
  sourceAuditSlug?: string;
}

export interface AdminEventSummary {
  byType: Array<{ type: string; count: number }>;
  total: number;
  windowStart?: string;
  windowEnd?: string;
}

export interface AdminSummary {
  audits: AdminAuditRow[];
  leads: AdminLeadRow[];
  events: AdminEventSummary;
  totals: {
    audits: number;
    leads: number;
  };
}

async function listKeys(
  storeName: string,
  prefix: string,
  cap: number
): Promise<string[]> {
  try {
    const store = getStore({ name: storeName });
    const keys: string[] = [];
    const res = await store.list({ prefix });
    for (const b of res.blobs) {
      keys.push(b.key);
      if (keys.length >= cap) break;
    }
    return keys;
  } catch {
    return [];
  }
}

export async function listRecentAudits(limit = 100): Promise<AdminAuditRow[]> {
  const keys = await listKeys("audits", "audit:", 500);
  if (keys.length === 0) return [];
  const store = getStore({ name: "audits" });
  const rows = await Promise.all(
    keys.map(async (key) => {
      try {
        const data = (await store.get(key, { type: "json" })) as
          | AuditResult
          | null;
        if (!data) return null;
        const row: AdminAuditRow = {
          slug: data.slug || key.replace(/^audit:/, ""),
          domain: data.domain,
          url: data.url,
          overallScore: data.overallScore,
          grade: data.grade,
          timestamp: data.timestamp,
          leadEmail: data.leadEmail,
          deviceId: data.deviceId,
        };
        return row;
      } catch {
        return null;
      }
    })
  );
  return rows
    .filter((r): r is AdminAuditRow => !!r)
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
    .slice(0, limit);
}

export async function listRecentLeads(limit = 100): Promise<AdminLeadRow[]> {
  // Read from lead:* rows (latest per email). Log entries are skipped here
  // since the admin view cares about who signed up, not every re-submission.
  const keys = await listKeys("leads", "lead:", 500);
  if (keys.length === 0) return [];
  const store = getStore({ name: "leads" });
  const rows = await Promise.all(
    keys.map(async (key) => {
      try {
        const data = (await store.get(key, { type: "json" })) as Lead | null;
        if (!data) return null;
        const row: AdminLeadRow = {
          email: data.email,
          name: data.name,
          role: data.role,
          company: data.company,
          createdAt: data.createdAt,
          sourceAuditSlug: data.sourceAuditSlug,
        };
        return row;
      } catch {
        return null;
      }
    })
  );
  return rows
    .filter((r): r is AdminLeadRow => !!r)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit);
}

export async function summarizeEvents(sampleCap = 2000): Promise<AdminEventSummary> {
  const keys = await listKeys("events", "event:", sampleCap);
  if (keys.length === 0) {
    return { byType: [], total: 0 };
  }
  const store = getStore({ name: "events" });
  const rows = await Promise.all(
    keys.map(async (key) => {
      try {
        return (await store.get(key, { type: "json" })) as EventRow | null;
      } catch {
        return null;
      }
    })
  );
  const counts = new Map<string, number>();
  let min: string | undefined;
  let max: string | undefined;
  for (const r of rows) {
    if (!r) continue;
    counts.set(r.type, (counts.get(r.type) || 0) + 1);
    if (!min || r.createdAt < min) min = r.createdAt;
    if (!max || r.createdAt > max) max = r.createdAt;
  }
  const byType = Array.from(counts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
  return {
    byType,
    total: rows.filter(Boolean).length,
    windowStart: min,
    windowEnd: max,
  };
}

export async function getAdminSummary(): Promise<AdminSummary> {
  const [audits, leads, events] = await Promise.all([
    listRecentAudits(100),
    listRecentLeads(100),
    summarizeEvents(2000),
  ]);
  return {
    audits,
    leads,
    events,
    totals: {
      audits: audits.length,
      leads: leads.length,
    },
  };
}

// ──────────────────────────────────────────────────────────────────────
//  Usage dashboard (sessions, funnel, daily activity, top brands/refs)
// ──────────────────────────────────────────────────────────────────────

export interface DailyBucket {
  /** Bucket key: YYYY-MM-DD (daily), YYYY-MM-DDTHH (hourly), or YYYY-Www (weekly). */
  date: string;
  /** Human label for this bucket (e.g. "11", "Mon", "14:00"). */
  label: string;
  sessions: number; // unique deviceIds in this bucket
  auditsStarted: number;
  auditsCompleted: number;
  leadSignups: number;
}

export type DashboardGranularity = "hour" | "day" | "week";

export interface FunnelStats {
  /** Window in days the funnel covers. */
  days: number;
  sessions: number; // unique deviceIds that did anything
  auditsStarted: number; // unique deviceIds that started an audit
  auditsCompleted: number; // unique deviceIds that completed
  leadSignups: number; // unique deviceIds that signed up
  pdfRequested: number; // count of pdf-download submissions
}

export interface TopBrandRow {
  domain: string;
  count: number;
}

export interface TopReferrerRow {
  source: string;
  count: number;
}

export interface UsageDashboard {
  totalEventsScanned: number;
  windowStart?: string;
  windowEnd?: string;
  granularity: DashboardGranularity;
  daily: DailyBucket[];
  funnel: FunnelStats;
  topBrands: TopBrandRow[];
  topReferrers: TopReferrerRow[];
}

/** Pick a sensible bucket granularity for a given window size. */
function pickGranularity(days: number): DashboardGranularity {
  if (days <= 1) return "hour";
  if (days <= 30) return "day";
  return "week";
}

/** Bucket key for a given timestamp at a given granularity. */
function bucketKey(d: Date, granularity: DashboardGranularity): string {
  if (granularity === "hour") {
    // YYYY-MM-DDTHH (Z) — derived from ISO so DST doesn't drift
    return d.toISOString().slice(0, 13);
  }
  if (granularity === "week") {
    // ISO-ish week: anchor to the Monday of the week (UTC)
    const monday = new Date(d);
    const dow = monday.getUTCDay() || 7; // 1..7 (Mon..Sun)
    monday.setUTCDate(monday.getUTCDate() - (dow - 1));
    return monday.toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
}

/** Friendly axis label for a bucket key. */
function bucketLabel(key: string, granularity: DashboardGranularity): string {
  if (granularity === "hour") {
    // Show hour-of-day in viewer's local time so "now" reads naturally
    const d = new Date(key + ":00:00Z");
    return d.toLocaleTimeString([], { hour: "numeric" }).toLowerCase().replace(/\s/g, "");
  }
  if (granularity === "week") {
    // Week of Mon DD (or just DD)
    const d = new Date(key);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }
  return key.slice(8); // DD
}

function normalizeReferrer(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    let host = u.hostname.toLowerCase();
    if (host.startsWith("www.")) host = host.slice(4);
    // Filter out self-referrers (internal nav within Chedder)
    if (host === "chedder.2pt.ai") return null;
    // Filter out Netlify deploy-preview URLs (--<hash>.netlify.app)
    if (host.endsWith(".netlify.app") || host.endsWith("netlify.app")) return null;
    // Filter out localhost / dev hosts
    if (host === "localhost" || host.startsWith("127.") || host.startsWith("192.168.")) {
      return null;
    }
    // Special-case the common social/SEO sources for nicer labels
    if (host === "lnkd.in" || host === "linkedin.com") return "LinkedIn";
    if (host === "t.co" || host === "twitter.com" || host === "x.com") return "X / Twitter";
    if (host === "news.ycombinator.com") return "Hacker News";
    if (host === "reddit.com" || host.endsWith(".reddit.com")) return "Reddit";
    if (host === "google.com" || host.endsWith(".google.com")) return "Google";
    if (host === "facebook.com" || host.endsWith(".facebook.com")) return "Facebook";
    if (host === "duckduckgo.com") return "DuckDuckGo";
    if (host === "bing.com") return "Bing";
    return host;
  } catch {
    return null;
  }
}

/**
 * Build a usage dashboard from the events store. Reads a generous sample
 * of recent events, then computes a time-bucketed activity chart, a
 * session→signup funnel, and a couple of "top N" tables. All aggregation
 * is in-memory so we make exactly one storage round-trip.
 *
 * `days` controls both the window and the bucket granularity:
 *   days = 1    → 24 hourly buckets
 *   days <= 30  → daily buckets
 *   days > 30   → weekly buckets
 */
export async function getUsageDashboard(opts: {
  days?: number;
  sampleCap?: number;
  granularity?: DashboardGranularity;
} = {}): Promise<UsageDashboard> {
  const days = Math.max(1, Math.min(365, opts.days ?? 14));
  const granularity = opts.granularity ?? pickGranularity(days);
  // Scale the sample cap to the window so longer ranges actually capture
  // their full content. Capped to keep storage costs bounded.
  const sampleCap = Math.min(10000, opts.sampleCap ?? Math.max(2000, days * 250));
  const keys = await listKeys("events", "event:", sampleCap);
  if (keys.length === 0) {
    return {
      totalEventsScanned: 0,
      granularity,
      daily: emptyBuckets(days, granularity),
      funnel: {
        days,
        sessions: 0,
        auditsStarted: 0,
        auditsCompleted: 0,
        leadSignups: 0,
        pdfRequested: 0,
      },
      topBrands: [],
      topReferrers: [],
    };
  }

  const store = getStore({ name: "events" });
  const rows = (
    await Promise.all(
      keys.map(async (key) => {
        try {
          return (await store.get(key, { type: "json" })) as EventRow | null;
        } catch {
          return null;
        }
      })
    )
  ).filter((r): r is EventRow => !!r);

  // Window bounds
  const cutoffMs = Date.now() - days * 24 * 3600 * 1000;
  const inWindow = rows.filter((r) => {
    const t = Date.parse(r.createdAt);
    return !Number.isNaN(t) && t >= cutoffMs;
  });

  // ── Time bins ─────────────────────────────────────────────────────
  // Pre-seed buckets so any "quiet" days/hours still appear with zeros.
  const dailyMap = new Map<string, DailyBucket>();
  const stepMs =
    granularity === "hour" ? 3600 * 1000 :
    granularity === "week" ? 7 * 24 * 3600 * 1000 :
    24 * 3600 * 1000;
  // We want `days` worth of buckets at the chosen granularity:
  //   hour  → 24 buckets (one per hour over the last 24h)
  //   day   → `days` buckets
  //   week  → ceil(days/7) buckets
  const bucketCount =
    granularity === "hour" ? Math.min(24, Math.max(1, days * 24)) :
    granularity === "week" ? Math.max(1, Math.ceil(days / 7)) :
    days;
  for (let i = 0; i < bucketCount; i++) {
    const ts = new Date(Date.now() - (bucketCount - 1 - i) * stepMs);
    const key = bucketKey(ts, granularity);
    if (!dailyMap.has(key)) {
      dailyMap.set(key, {
        date: key,
        label: bucketLabel(key, granularity),
        sessions: 0,
        auditsStarted: 0,
        auditsCompleted: 0,
        leadSignups: 0,
      });
    }
  }

  // Track per-bucket device sets so "sessions" is unique deviceIds, not raw event counts
  const dailyDevices = new Map<string, Set<string>>();

  for (const r of inWindow) {
    const key = bucketKey(new Date(r.createdAt), granularity);
    const bucket = dailyMap.get(key);
    if (!bucket) continue;
    if (r.deviceId && r.deviceId !== "server") {
      let set = dailyDevices.get(key);
      if (!set) {
        set = new Set();
        dailyDevices.set(key, set);
      }
      set.add(r.deviceId);
    }
    if (r.type === "audit.started") bucket.auditsStarted++;
    else if (r.type === "audit.completed") bucket.auditsCompleted++;
    else if (r.type === "lead.signup") bucket.leadSignups++;
  }
  for (const [key, set] of dailyDevices.entries()) {
    const b = dailyMap.get(key);
    if (b) b.sessions = set.size;
  }
  const daily = Array.from(dailyMap.values());

  // ── Funnel (in-window) ────────────────────────────────────────────
  const sessions = new Set<string>();
  const started = new Set<string>();
  const completed = new Set<string>();
  const signedUp = new Set<string>();
  let pdfRequested = 0;

  for (const r of inWindow) {
    if (r.deviceId && r.deviceId !== "server") sessions.add(r.deviceId);
    if (r.type === "audit.started" && r.deviceId) started.add(r.deviceId);
    if (r.type === "audit.completed" && r.deviceId) completed.add(r.deviceId);
    if (r.type === "lead.signup" && r.deviceId) signedUp.add(r.deviceId);
    if (r.type === "pdf.requested" || r.type === "pdf.downloaded") pdfRequested++;
  }

  const funnel: FunnelStats = {
    days,
    sessions: sessions.size,
    auditsStarted: started.size,
    auditsCompleted: completed.size,
    leadSignups: signedUp.size,
    pdfRequested,
  };

  // ── Top audited brands (from audit.started slug → domain) ────────
  const brandCounts = new Map<string, number>();
  for (const r of inWindow) {
    if (r.type !== "audit.started") continue;
    // We store the audit URL in meta.url for audit.started events; fall
    // back to slug→domain conversion (slug looks like "<domain>-xxxxxx").
    const url =
      typeof r.meta?.url === "string"
        ? (r.meta.url as string)
        : r.slug
          ? r.slug.replace(/-[a-z0-9]+$/, "").replace(/-/g, ".")
          : null;
    if (!url) continue;
    let host = url;
    try {
      host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname.toLowerCase();
      if (host.startsWith("www.")) host = host.slice(4);
    } catch {
      // already a host-ish string
    }
    brandCounts.set(host, (brandCounts.get(host) || 0) + 1);
  }
  const topBrands = Array.from(brandCounts.entries())
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // ── Top referrers (session.start events carry the referrer) ──────
  const refCounts = new Map<string, number>();
  for (const r of inWindow) {
    if (r.type !== "session.start") continue;
    const raw = (r.meta?.referrer as string | undefined) || r.referrer;
    const norm = normalizeReferrer(raw);
    if (!norm) continue;
    refCounts.set(norm, (refCounts.get(norm) || 0) + 1);
  }
  const topReferrers = Array.from(refCounts.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const sortedTs = inWindow
    .map((r) => r.createdAt)
    .sort();
  return {
    totalEventsScanned: inWindow.length,
    granularity,
    windowStart: sortedTs[0],
    windowEnd: sortedTs[sortedTs.length - 1],
    daily,
    funnel,
    topBrands,
    topReferrers,
  };
}

function emptyBuckets(days: number, granularity: DashboardGranularity): DailyBucket[] {
  const stepMs =
    granularity === "hour" ? 3600 * 1000 :
    granularity === "week" ? 7 * 24 * 3600 * 1000 :
    24 * 3600 * 1000;
  const bucketCount =
    granularity === "hour" ? Math.min(24, Math.max(1, days * 24)) :
    granularity === "week" ? Math.max(1, Math.ceil(days / 7)) :
    days;
  const out: DailyBucket[] = [];
  for (let i = 0; i < bucketCount; i++) {
    const ts = new Date(Date.now() - (bucketCount - 1 - i) * stepMs);
    const key = bucketKey(ts, granularity);
    out.push({
      date: key,
      label: bucketLabel(key, granularity),
      sessions: 0,
      auditsStarted: 0,
      auditsCompleted: 0,
      leadSignups: 0,
    });
  }
  return out;
}
