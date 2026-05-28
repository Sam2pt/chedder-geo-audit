import { getStore } from "@netlify/blobs";

// Blended cost per AI query across supported engines:
//   Perplexity Sonar  ≈ $0.001/query
//   OpenAI Responses + web_search_preview  ≈ $0.025/query (tool call dominates)
//   Brave summarizer  ≈ $0.025/query
// Weighted midpoint we use for budgeting. Err on the higher side so the cap is safe.
const COST_PER_QUERY_USD = parseFloat(
  process.env.AI_COST_PER_QUERY_USD || "0.015"
);

// Defaults. overridable via env vars
// MAX_AI_QUERIES_PER_AUDIT is the TOTAL query budget per audit across
// all engines. Default 15 = 5 shopper-question scenarios × 3 engines.
// Cost: 15 × $0.015 ≈ $0.225 per audit, comfortably under the daily
// cap. Lower this to throttle individual audits; raise it to dig
// deeper per shopper. The previous default (5) was too tight — it
// forced only 1 scenario per audit, which gave users a "you appeared
// in 2/2 categories" headline based on a single shopper question.
// User feedback flagged this as not comprehensive enough.
const MAX_QUERIES_PER_AUDIT = parseInt(
  process.env.MAX_AI_QUERIES_PER_AUDIT || "15",
  10
);
const MAX_DAILY_SPEND_USD = parseFloat(
  process.env.MAX_DAILY_AI_SPEND_USD || "5"
);
const MAX_MONTHLY_SPEND_USD = parseFloat(
  process.env.MAX_MONTHLY_AI_SPEND_USD || "60"
);

export interface SpendCheckResult {
  allowed: boolean;
  remainingQueriesToday: number;
  reason?: string;
}

function dayKey(d = new Date()) {
  return `day-${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function monthKey(d = new Date()) {
  return `month-${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function readUsage(key: string): Promise<number> {
  try {
    const store = getStore({ name: "spend" });
    const val = await store.get(key, { type: "text" });
    if (typeof val !== "string") return 0;
    return parseInt(val, 10) || 0;
  } catch {
    return 0;
  }
}

async function writeUsage(key: string, count: number) {
  try {
    const store = getStore({ name: "spend" });
    await store.set(key, String(count));
  } catch {
    // blob store unavailable. fail silently; caps won't persist but
    // the per-audit cap still applies
  }
}

/**
 * Check if we can spend on AI queries right now.
 * Returns the max queries allowed (clamped by per-audit + daily remaining).
 */
export async function checkSpendCap(): Promise<SpendCheckResult> {
  const [dailyQueries, monthlyQueries] = await Promise.all([
    readUsage(dayKey()),
    readUsage(monthKey()),
  ]);

  const dailySpend = dailyQueries * COST_PER_QUERY_USD;
  const monthlySpend = monthlyQueries * COST_PER_QUERY_USD;

  if (monthlySpend >= MAX_MONTHLY_SPEND_USD) {
    return {
      allowed: false,
      remainingQueriesToday: 0,
      reason: `Monthly AI spend cap reached ($${MAX_MONTHLY_SPEND_USD.toFixed(2)}). Resets on the 1st.`,
    };
  }

  if (dailySpend >= MAX_DAILY_SPEND_USD) {
    return {
      allowed: false,
      remainingQueriesToday: 0,
      reason: `Daily AI spend cap reached ($${MAX_DAILY_SPEND_USD.toFixed(2)}). Resets at midnight UTC.`,
    };
  }

  // Compute how many queries remain in today's budget
  const dailyRemaining = Math.floor(
    (MAX_DAILY_SPEND_USD - dailySpend) / COST_PER_QUERY_USD
  );
  const monthlyRemaining = Math.floor(
    (MAX_MONTHLY_SPEND_USD - monthlySpend) / COST_PER_QUERY_USD
  );

  const remaining = Math.min(
    dailyRemaining,
    monthlyRemaining,
    MAX_QUERIES_PER_AUDIT
  );

  return {
    allowed: remaining > 0,
    remainingQueriesToday: remaining,
  };
}

/**
 * Record that we used N AI queries (legacy aggregate counter — kept
 * for the existing spend-cap logic). For accurate per-engine cost
 * breakdowns, callers should ALSO call recordEngineSpend(engine, n)
 * so the finances dashboard can show OpenAI vs Perplexity vs Brave
 * separately.
 */
export async function recordSpend(queriesUsed: number) {
  if (queriesUsed <= 0) return;

  const [daily, monthly] = await Promise.all([
    readUsage(dayKey()),
    readUsage(monthKey()),
  ]);

  await Promise.all([
    writeUsage(dayKey(), daily + queriesUsed),
    writeUsage(monthKey(), monthly + queriesUsed),
  ]);
}

/* ── Per-engine tracking ─────────────────────────────────────────
 *
 * Each engine has a wildly different real cost per query — Perplexity
 * Sonar is ~$0.001/call, Brave summarizer and OpenAI's web-search
 * tool sit around $0.025/call. The aggregate counter above uses a
 * blended $0.015 for the cap math, which is conservative enough for
 * throttling but not accurate enough for the finances dashboard.
 *
 * The per-engine counters live in the same `spend` store but under
 * sub-namespaces:
 *   day-2026-05-18:openai
 *   day-2026-05-18:perplexity
 *   day-2026-05-18:brave
 *   day-2026-05-18:llm        — gpt-4o-mini analyzer calls
 *   month-2026-05:openai      …etc
 *
 * Costs below are real public list prices we should keep in sync
 * with the actual API contracts.
 */

export type SpendEngine = "openai" | "perplexity" | "brave" | "llm";

const ENGINE_COST_PER_CALL_USD: Record<SpendEngine, number> = {
  // OpenAI Responses API with web_search_preview tool. Tool call
  // dominates per-request; chat completion alone would be far cheaper.
  openai: parseFloat(process.env.AI_COST_OPENAI_USD || "0.025"),
  // Perplexity Sonar — flat per-query, very cheap.
  perplexity: parseFloat(process.env.AI_COST_PERPLEXITY_USD || "0.001"),
  // Brave Web Search Summarizer — per-summarized-search fee.
  brave: parseFloat(process.env.AI_COST_BRAVE_USD || "0.025"),
  // gpt-4o-mini analyzer calls (category inference, brand extraction,
  // quality review, tailored recs). Tiny per-call cost; we count
  // calls rather than tokens for now since the per-call variance is
  // small.
  llm: parseFloat(process.env.AI_COST_LLM_USD || "0.0001"),
};

function engineDayKey(engine: SpendEngine, d = new Date()): string {
  return `${dayKey(d)}:${engine}`;
}
function engineMonthKey(engine: SpendEngine, d = new Date()): string {
  return `${monthKey(d)}:${engine}`;
}

/**
 * Record N calls to a specific engine. Use this in addition to (or
 * instead of) recordSpend() for accurate cost attribution.
 */
export async function recordEngineSpend(
  engine: SpendEngine,
  callCount: number
): Promise<void> {
  if (callCount <= 0) return;
  const [d, m] = await Promise.all([
    readUsage(engineDayKey(engine)),
    readUsage(engineMonthKey(engine)),
  ]);
  await Promise.all([
    writeUsage(engineDayKey(engine), d + callCount),
    writeUsage(engineMonthKey(engine), m + callCount),
  ]);
}

/**
 * Convenience for analyzer LLM calls (gpt-4o-mini for categorization,
 * brand extraction, quality review, tailored recs). Equivalent to
 * recordEngineSpend("llm", n) but reads more clearly at the call site.
 */
export async function recordLlmSpend(callCount = 1): Promise<void> {
  return recordEngineSpend("llm", callCount);
}

export interface EnginePeriodSpend {
  engine: SpendEngine;
  calls: number;
  usd: number;
  costPerCallUsd: number;
}

export interface EngineSpendSnapshot {
  today: EnginePeriodSpend[];
  month: EnginePeriodSpend[];
  todayTotalUsd: number;
  monthTotalUsd: number;
}

/**
 * Read per-engine spend for today and the current month. Used by the
 * finances dashboard to render the breakdown table.
 */
export async function getEngineSpendBreakdown(): Promise<EngineSpendSnapshot> {
  const engines: SpendEngine[] = ["openai", "perplexity", "brave", "llm"];
  const [todayCounts, monthCounts] = await Promise.all([
    Promise.all(engines.map((e) => readUsage(engineDayKey(e)))),
    Promise.all(engines.map((e) => readUsage(engineMonthKey(e)))),
  ]);
  const today: EnginePeriodSpend[] = engines.map((e, i) => ({
    engine: e,
    calls: todayCounts[i],
    usd: todayCounts[i] * ENGINE_COST_PER_CALL_USD[e],
    costPerCallUsd: ENGINE_COST_PER_CALL_USD[e],
  }));
  const month: EnginePeriodSpend[] = engines.map((e, i) => ({
    engine: e,
    calls: monthCounts[i],
    usd: monthCounts[i] * ENGINE_COST_PER_CALL_USD[e],
    costPerCallUsd: ENGINE_COST_PER_CALL_USD[e],
  }));
  return {
    today,
    month,
    todayTotalUsd: today.reduce((acc, x) => acc + x.usd, 0),
    monthTotalUsd: month.reduce((acc, x) => acc + x.usd, 0),
  };
}

export const SPEND_CAP_CONFIG = {
  maxQueriesPerAudit: MAX_QUERIES_PER_AUDIT,
  maxDailySpendUSD: MAX_DAILY_SPEND_USD,
  maxMonthlySpendUSD: MAX_MONTHLY_SPEND_USD,
  costPerQueryUSD: COST_PER_QUERY_USD,
  enginePrices: ENGINE_COST_PER_CALL_USD,
};
