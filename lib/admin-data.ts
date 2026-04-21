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
