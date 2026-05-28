import { getStore } from "@netlify/blobs";
import { getStripe } from "./stripe";
import { SPEND_CAP_CONFIG } from "./spend-cap";

/**
 * Financials aggregator — single source for "am I making money right
 * now?" Combines three data sources:
 *
 *   1. AI spend     — read from the spend-cap blob counters (which the
 *                     audit runner already increments per query). This
 *                     is what already gates the daily $5 / monthly $60
 *                     caps in lib/spend-cap.ts.
 *   2. Revenue      — pulled fresh from the Stripe API. We use actual
 *                     charges + active subscriptions rather than our
 *                     local user-record cache so the dashboard reflects
 *                     reality even if a webhook is briefly stale.
 *   3. Ad spend     — manually entered via the admin UI (or POST to
 *                     /api/admin/finances) for now. When you wire the
 *                     Google Ads API later, swap getAdSpend() for the
 *                     live pull and everything else just works.
 *
 * The admin dashboard composes these into a profit-like snapshot:
 *   net = revenue − AI cost − ad spend
 *
 * Keep all expensive Stripe calls in this module so the route handler
 * stays thin and easy to cache later.
 */

/* ── Date helpers ───────────────────────────────────────────────── */

function utcDayStart(d = new Date()): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}
function utcMonthStart(d = new Date()): Date {
  const x = new Date(d);
  x.setUTCDate(1);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}
function dayKey(d = new Date()): string {
  return `day-${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
function monthKey(d = new Date()): string {
  return `month-${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/* ── AI spend ───────────────────────────────────────────────────── */

interface AiSpendSnapshot {
  todayQueries: number;
  monthQueries: number;
  todayUsd: number;
  monthUsd: number;
  /** Per-query cost we're multiplying by — exposed so the UI can show
   *  it next to the number ("at $0.015/query"). */
  costPerQueryUsd: number;
  /** Daily / monthly hard caps (config). UI can show as gauges. */
  dailyCapUsd: number;
  monthlyCapUsd: number;
}

async function readSpendUsage(key: string): Promise<number> {
  try {
    const store = getStore({ name: "spend" });
    const val = await store.get(key, { type: "text" });
    if (typeof val !== "string") return 0;
    return parseInt(val, 10) || 0;
  } catch {
    return 0;
  }
}

export async function getAiSpend(): Promise<AiSpendSnapshot> {
  const [today, month] = await Promise.all([
    readSpendUsage(dayKey()),
    readSpendUsage(monthKey()),
  ]);
  const cpq = SPEND_CAP_CONFIG.costPerQueryUSD;
  return {
    todayQueries: today,
    monthQueries: month,
    todayUsd: today * cpq,
    monthUsd: month * cpq,
    costPerQueryUsd: cpq,
    dailyCapUsd: SPEND_CAP_CONFIG.maxDailySpendUSD,
    monthlyCapUsd: SPEND_CAP_CONFIG.maxMonthlySpendUSD,
  };
}

/* ── Ad spend (manual entry, ready for Google Ads API later) ────── */

interface AdSpendSnapshot {
  todayUsd: number;
  monthUsd: number;
}

const ADS_STORE = "ads";

export async function getAdSpend(): Promise<AdSpendSnapshot> {
  try {
    const store = getStore({ name: ADS_STORE });
    const [todayStr, monthStr] = await Promise.all([
      store.get(dayKey(), { type: "text" }),
      store.get(monthKey(), { type: "text" }),
    ]);
    return {
      todayUsd: typeof todayStr === "string" ? parseFloat(todayStr) || 0 : 0,
      monthUsd: typeof monthStr === "string" ? parseFloat(monthStr) || 0 : 0,
    };
  } catch {
    return { todayUsd: 0, monthUsd: 0 };
  }
}

/**
 * Write a manual ad spend entry. Period is "today" or "month".
 * Replaces the existing value — there's no atomic add since the user
 * may want to correct a typo. When Google Ads API integration comes
 * online, this function becomes a no-op and getAdSpend() pulls live.
 */
export async function setAdSpend(
  period: "today" | "month",
  usd: number
): Promise<void> {
  if (!Number.isFinite(usd) || usd < 0) return;
  try {
    const store = getStore({ name: ADS_STORE });
    const key = period === "today" ? dayKey() : monthKey();
    await store.set(key, String(usd));
  } catch (e) {
    console.error("[finances] setAdSpend failed:", e);
  }
}

/* ── Stripe revenue ─────────────────────────────────────────────── */

interface RevenueSnapshot {
  /** Number of subscriptions currently in active/trialing status. */
  activePro: number;
  /** Sum of recurring price across active subs (in USD/month). Estimate. */
  mrrUsd: number;
  /** Actual successful charges since UTC midnight today. */
  todayUsd: number;
  /** Actual successful charges since UTC start of this month. */
  monthUsd: number;
  /** True if the Stripe lookup succeeded — UI can show a stale notice. */
  ok: boolean;
}

/**
 * Sum charge amounts (cents → USD) since a given UTC instant. Pages
 * through the Stripe charges API in 100-at-a-time batches; for the
 * volumes we'll see at this stage (single-digit per day) the first
 * page is almost always all we need.
 */
async function sumChargesSince(
  stripe: ReturnType<typeof getStripe>,
  sinceUnix: number
): Promise<number> {
  if (!stripe) return 0;
  let total = 0;
  let startingAfter: string | undefined;
  for (let i = 0; i < 10; i++) {
    // Hard cap at 10 pages = 1000 charges so we never spin forever.
    const page = await stripe.charges.list({
      created: { gte: sinceUnix },
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    for (const c of page.data) {
      // Only count succeeded charges. Skip refunds — we account for
      // those by subtracting amount_refunded at the end.
      if (c.status === "succeeded") {
        total += c.amount - (c.amount_refunded || 0);
      }
    }
    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data[page.data.length - 1].id;
  }
  return total / 100; // cents → USD
}

/**
 * Estimate MRR from currently active subscriptions. Sums each sub's
 * unit_amount × quantity normalized to monthly (yearly subs divided
 * by 12). Pulls up to 100 subscriptions in one page — once you have
 * more than that, this needs pagination but for now we'll trust the
 * count.
 */
async function sumActiveMrr(
  stripe: ReturnType<typeof getStripe>
): Promise<{ count: number; mrrUsd: number }> {
  if (!stripe) return { count: 0, mrrUsd: 0 };
  const subs = await stripe.subscriptions.list({
    status: "active",
    limit: 100,
    expand: ["data.items.data.price"],
  });
  let mrrCents = 0;
  for (const sub of subs.data) {
    for (const item of sub.items.data) {
      const price = item.price;
      // Skip unit_amount-less prices (metered, tiered) — they'd need
      // usage records to estimate accurately and aren't part of our
      // current Pro plan.
      if (!price.unit_amount) continue;
      const qty = item.quantity ?? 1;
      const months = price.recurring?.interval === "year" ? 12 : 1;
      mrrCents += (price.unit_amount * qty) / months;
    }
  }
  return { count: subs.data.length, mrrUsd: mrrCents / 100 };
}

export async function getRevenue(): Promise<RevenueSnapshot> {
  const stripe = getStripe();
  if (!stripe) {
    return { activePro: 0, mrrUsd: 0, todayUsd: 0, monthUsd: 0, ok: false };
  }
  try {
    const dayStart = Math.floor(utcDayStart().getTime() / 1000);
    const monthStart = Math.floor(utcMonthStart().getTime() / 1000);

    const [{ count, mrrUsd }, todayUsd, monthUsd] = await Promise.all([
      sumActiveMrr(stripe),
      sumChargesSince(stripe, dayStart),
      sumChargesSince(stripe, monthStart),
    ]);

    return { activePro: count, mrrUsd, todayUsd, monthUsd, ok: true };
  } catch (e) {
    console.error("[finances] Stripe lookup failed:", e);
    return { activePro: 0, mrrUsd: 0, todayUsd: 0, monthUsd: 0, ok: false };
  }
}

/* ── Combined snapshot ──────────────────────────────────────────── */

export interface FinancialSnapshot {
  ai: AiSpendSnapshot;
  revenue: RevenueSnapshot;
  ads: AdSpendSnapshot;
  /** Net = revenue − AI cost − ad spend, for each window. */
  net: { todayUsd: number; monthUsd: number };
  /** ISO timestamp this snapshot was taken — caller can display. */
  asOf: string;
}

export async function getFinancialSnapshot(): Promise<FinancialSnapshot> {
  const [ai, revenue, ads] = await Promise.all([
    getAiSpend(),
    getRevenue(),
    getAdSpend(),
  ]);
  return {
    ai,
    revenue,
    ads,
    net: {
      todayUsd: revenue.todayUsd - ai.todayUsd - ads.todayUsd,
      monthUsd: revenue.monthUsd - ai.monthUsd - ads.monthUsd,
    },
    asOf: new Date().toISOString(),
  };
}
