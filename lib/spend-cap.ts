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
 * Record that we used N AI queries.
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

export const SPEND_CAP_CONFIG = {
  maxQueriesPerAudit: MAX_QUERIES_PER_AUDIT,
  maxDailySpendUSD: MAX_DAILY_SPEND_USD,
  maxMonthlySpendUSD: MAX_MONTHLY_SPEND_USD,
  costPerQueryUSD: COST_PER_QUERY_USD,
};
