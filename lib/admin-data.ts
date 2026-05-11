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
  date: string; // YYYY-MM-DD
  sessions: number; // unique deviceIds with any event that day
  auditsStarted: number;
  auditsCompleted: number;
  leadSignups: number;
}

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
  daily: DailyBucket[];
  funnel: FunnelStats;
  topBrands: TopBrandRow[];
  topReferrers: TopReferrerRow[];
}

function isoDay(ts: string): string {
  // YYYY-MM-DD slice. Safe across browsers + node.
  return ts.slice(0, 10);
}

function normalizeReferrer(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    let host = u.hostname.toLowerCase();
    if (host.startsWith("www.")) host = host.slice(4);
    // Special-case the common social/SEO sources for nicer labels
    if (host === "lnkd.in" || host === "linkedin.com") return "LinkedIn";
    if (host === "t.co" || host === "twitter.com" || host === "x.com") return "X / Twitter";
    if (host === "news.ycombinator.com") return "Hacker News";
    if (host === "reddit.com" || host.endsWith(".reddit.com")) return "Reddit";
    if (host === "google.com" || host.endsWith(".google.com")) return "Google";
    if (host === "facebook.com" || host.endsWith(".facebook.com")) return "Facebook";
    return host;
  } catch {
    return null;
  }
}

/**
 * Build a usage dashboard from the events store. Reads a generous sample
 * of recent events, then computes daily activity, a session→signup
 * funnel, and a couple of "top N" tables. All aggregation is in-memory
 * so we make exactly one storage round-trip.
 */
export async function getUsageDashboard(opts: {
  days?: number;
  sampleCap?: number;
} = {}): Promise<UsageDashboard> {
  const days = opts.days ?? 14;
  const sampleCap = opts.sampleCap ?? 3000;
  const keys = await listKeys("events", "event:", sampleCap);
  if (keys.length === 0) {
    return {
      totalEventsScanned: 0,
      daily: emptyDailyBuckets(days),
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

  // ── Daily bins ────────────────────────────────────────────────────
  const dailyMap = new Map<string, DailyBucket>();
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - (days - 1 - i) * 24 * 3600 * 1000);
    const key = isoDay(d.toISOString());
    dailyMap.set(key, {
      date: key,
      sessions: 0,
      auditsStarted: 0,
      auditsCompleted: 0,
      leadSignups: 0,
    });
  }

  // Track per-day device sets so "sessions" is unique deviceIds, not raw event counts
  const dailyDevices = new Map<string, Set<string>>();

  for (const r of inWindow) {
    const day = isoDay(r.createdAt);
    const bucket = dailyMap.get(day);
    if (!bucket) continue;
    // Sessions = unique deviceIds per day across any event
    if (r.deviceId && r.deviceId !== "server") {
      let set = dailyDevices.get(day);
      if (!set) {
        set = new Set();
        dailyDevices.set(day, set);
      }
      set.add(r.deviceId);
    }
    if (r.type === "audit.started") bucket.auditsStarted++;
    else if (r.type === "audit.completed") bucket.auditsCompleted++;
    else if (r.type === "lead.signup") bucket.leadSignups++;
  }
  for (const [day, set] of dailyDevices.entries()) {
    const b = dailyMap.get(day);
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
    windowStart: sortedTs[0],
    windowEnd: sortedTs[sortedTs.length - 1],
    daily,
    funnel,
    topBrands,
    topReferrers,
  };
}

function emptyDailyBuckets(days: number): DailyBucket[] {
  const out: DailyBucket[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - (days - 1 - i) * 24 * 3600 * 1000);
    out.push({
      date: isoDay(d.toISOString()),
      sessions: 0,
      auditsStarted: 0,
      auditsCompleted: 0,
      leadSignups: 0,
    });
  }
  return out;
}
