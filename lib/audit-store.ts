import { getStore } from "@netlify/blobs";
import type {
  AuditResult,
  BenchmarkData,
  BenchmarkStats,
  HistoryEntry,
} from "./types";

/**
 * Storage layout (Netlify Blobs, store name: "audits"):
 *
 *   audit:<slug>                — full AuditResult JSON
 *   domain:<domain>:history     — HistoryEntry[] (most recent first, capped at 20)
 *   benchmarks:scores           — per-slug arrays of recent scores (ring-buffered, cap 500)
 *                                 { overall: number[], modules: Record<slug, number[]> }
 */

const STORE_NAME = "audits";
const BENCHMARK_CAP = 500;
const HISTORY_CAP = 20;

function getAuditStore() {
  return getStore({ name: STORE_NAME });
}

/**
 * Slugify a domain + timestamp into a short URL-safe ID.
 * Uses the domain as a prefix plus 6 random base36 chars so old audits
 * remain reachable even when rebuilt.
 */
export function makeSlug(domain: string): string {
  const cleanDomain = domain
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 24);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${cleanDomain}-${rand}`;
}

/**
 * Save a completed audit under its slug and return the slug.
 * Also appends to per-domain history and updates benchmarks.
 */
export async function saveAudit(result: AuditResult): Promise<string> {
  const slug = result.slug || makeSlug(result.domain);
  const stored: AuditResult = { ...result, slug };

  try {
    const store = getAuditStore();
    await store.setJSON(`audit:${slug}`, stored);

    // Append to domain history (best-effort, fire & forget)
    await Promise.all([
      appendHistory(result.domain, stored),
      updateBenchmarks(stored),
    ]);
  } catch (e) {
    // If blobs aren't configured locally, don't fail the audit.
    console.error("saveAudit failed (blob store unavailable):", e);
  }

  return slug;
}

/**
 * Fetch a saved audit by slug. Returns null if missing.
 */
export async function getAudit(slug: string): Promise<AuditResult | null> {
  try {
    const store = getAuditStore();
    const data = await store.get(`audit:${slug}`, { type: "json" });
    if (!data) return null;
    return data as AuditResult;
  } catch (e) {
    console.error("getAudit failed:", e);
    return null;
  }
}

/**
 * Append a compact history entry for a domain.
 */
async function appendHistory(domain: string, result: AuditResult) {
  const key = `domain:${normalizeDomain(domain)}:history`;
  try {
    const store = getAuditStore();
    const current = (await store.get(key, { type: "json" })) as
      | HistoryEntry[]
      | null;
    const entry: HistoryEntry = {
      slug: result.slug!,
      timestamp: result.timestamp,
      overallScore: result.overallScore,
      moduleScores: Object.fromEntries(
        result.modules.map((m) => [m.slug, m.score])
      ),
    };
    const next = [entry, ...(current || [])].slice(0, HISTORY_CAP);
    await store.setJSON(key, next);
  } catch (e) {
    console.error("appendHistory failed:", e);
  }
}

/**
 * Get past audits for a domain (most recent first). Excludes the passed-in slug.
 */
export async function getDomainHistory(
  domain: string,
  excludeSlug?: string
): Promise<HistoryEntry[]> {
  try {
    const store = getAuditStore();
    const key = `domain:${normalizeDomain(domain)}:history`;
    const current = (await store.get(key, { type: "json" })) as
      | HistoryEntry[]
      | null;
    if (!current) return [];
    return excludeSlug ? current.filter((h) => h.slug !== excludeSlug) : current;
  } catch {
    return [];
  }
}

interface BenchmarkBuffer {
  overall: number[];
  modules: Record<string, number[]>;
}

async function readBenchmarkBuffer(): Promise<BenchmarkBuffer> {
  try {
    const store = getAuditStore();
    const data = (await store.get("benchmarks:scores", { type: "json" })) as
      | BenchmarkBuffer
      | null;
    return data || { overall: [], modules: {} };
  } catch {
    return { overall: [], modules: {} };
  }
}

async function writeBenchmarkBuffer(buffer: BenchmarkBuffer) {
  try {
    const store = getAuditStore();
    await store.setJSON("benchmarks:scores", buffer);
  } catch (e) {
    console.error("writeBenchmarkBuffer failed:", e);
  }
}

/**
 * Record this audit's scores in the global benchmark buffer (ring-buffered).
 */
export async function updateBenchmarks(result: AuditResult) {
  const buf = await readBenchmarkBuffer();

  buf.overall = [...buf.overall, result.overallScore].slice(-BENCHMARK_CAP);
  for (const m of result.modules) {
    const arr = buf.modules[m.slug] || [];
    buf.modules[m.slug] = [...arr, m.score].slice(-BENCHMARK_CAP);
  }

  await writeBenchmarkBuffer(buf);
}

function computeStats(values: number[]): BenchmarkStats {
  if (values.length === 0) {
    return { count: 0, median: 0, p25: 0, p75: 0, p90: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const pct = (p: number) => {
    const i = Math.floor(((sorted.length - 1) * p) / 100);
    return sorted[i];
  };
  return {
    count: sorted.length,
    median: pct(50),
    p25: pct(25),
    p75: pct(75),
    p90: pct(90),
  };
}

/**
 * Compute benchmark data + this audit's percentile rank.
 */
export async function getBenchmarks(
  result: AuditResult
): Promise<BenchmarkData> {
  const buf = await readBenchmarkBuffer();

  const modules: Record<string, BenchmarkStats> = {};
  for (const slug of Object.keys(buf.modules)) {
    modules[slug] = computeStats(buf.modules[slug]);
  }
  const overall = computeStats(buf.overall);

  // Percentile: fraction of stored audits with score <= this one
  let yourPercentile: number | undefined;
  if (overall.count > 0) {
    const below = buf.overall.filter((s) => s <= result.overallScore).length;
    yourPercentile = Math.round((below / overall.count) * 100);
  }

  return { modules, overall, yourPercentile };
}

function normalizeDomain(d: string) {
  return d.replace(/^www\./, "").toLowerCase();
}
