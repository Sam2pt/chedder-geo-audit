import { getStore } from "@netlify/blobs";
import { getStripe } from "./stripe";
import { SPEND_CAP_CONFIG, getEngineSpendBreakdown, type EngineSpendSnapshot } from "./spend-cap";

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
  /** Per-engine breakdown (openai / perplexity / brave / llm). Populated
   *  when callers use the per-engine record functions. The legacy
   *  aggregate above is the source of truth for cap math; this is the
   *  source of truth for cost attribution. */
  engines: EngineSpendSnapshot;
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
  const [today, month, engines] = await Promise.all([
    readSpendUsage(dayKey()),
    readSpendUsage(monthKey()),
    getEngineSpendBreakdown(),
  ]);
  const cpq = SPEND_CAP_CONFIG.costPerQueryUSD;
  // Prefer the per-engine total when it's been populated (more
  // accurate), else fall back to the legacy aggregate × blended cost.
  const todayUsd =
    engines.todayTotalUsd > 0 ? engines.todayTotalUsd : today * cpq;
  const monthUsd =
    engines.monthTotalUsd > 0 ? engines.monthTotalUsd : month * cpq;
  return {
    todayQueries: today,
    monthQueries: month,
    todayUsd,
    monthUsd,
    costPerQueryUsd: cpq,
    dailyCapUsd: SPEND_CAP_CONFIG.maxDailySpendUSD,
    monthlyCapUsd: SPEND_CAP_CONFIG.maxMonthlySpendUSD,
    engines,
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
  /** Actual successful charges since UTC midnight today (gross — fees
   *  not yet deducted; subtract feeTodayUsd for net deposit). */
  todayUsd: number;
  /** Actual successful charges since UTC start of this month (gross). */
  monthUsd: number;
  /** Stripe fees on those charges (2.9% + $0.30 per US card on default
   *  pricing — actual rates vary by country & dispute history). */
  feeTodayUsd: number;
  feeMonthUsd: number;
  /** True if the Stripe lookup succeeded — UI can show a stale notice. */
  ok: boolean;
}

/**
 * Sum charge amounts AND Stripe fees (cents → USD) since a given UTC
 * instant. Stripe puts the fee on the charge's balance_transaction;
 * we expand it inline so we don't need a second round-trip per charge.
 * Pages through 100 at a time and caps at 10 pages.
 */
async function sumChargesSince(
  stripe: ReturnType<typeof getStripe>,
  sinceUnix: number
): Promise<{ chargesUsd: number; feesUsd: number }> {
  if (!stripe) return { chargesUsd: 0, feesUsd: 0 };
  let chargesCents = 0;
  let feesCents = 0;
  let startingAfter: string | undefined;
  for (let i = 0; i < 10; i++) {
    const page = await stripe.charges.list({
      created: { gte: sinceUnix },
      limit: 100,
      expand: ["data.balance_transaction"],
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    for (const c of page.data) {
      if (c.status !== "succeeded") continue;
      chargesCents += c.amount - (c.amount_refunded || 0);
      // balance_transaction comes back as an object thanks to expand=.
      // The .fee field is total fees in cents on that transaction.
      const bt = c.balance_transaction;
      if (bt && typeof bt === "object" && "fee" in bt && typeof bt.fee === "number") {
        feesCents += bt.fee;
      }
    }
    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data[page.data.length - 1].id;
  }
  return {
    chargesUsd: chargesCents / 100,
    feesUsd: feesCents / 100,
  };
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
    return {
      activePro: 0,
      mrrUsd: 0,
      todayUsd: 0,
      monthUsd: 0,
      feeTodayUsd: 0,
      feeMonthUsd: 0,
      ok: false,
    };
  }
  try {
    const dayStart = Math.floor(utcDayStart().getTime() / 1000);
    const monthStart = Math.floor(utcMonthStart().getTime() / 1000);

    const [{ count, mrrUsd }, todaySums, monthSums] = await Promise.all([
      sumActiveMrr(stripe),
      sumChargesSince(stripe, dayStart),
      sumChargesSince(stripe, monthStart),
    ]);

    return {
      activePro: count,
      mrrUsd,
      todayUsd: todaySums.chargesUsd,
      monthUsd: monthSums.chargesUsd,
      feeTodayUsd: todaySums.feesUsd,
      feeMonthUsd: monthSums.feesUsd,
      ok: true,
    };
  } catch (e) {
    console.error("[finances] Stripe lookup failed:", e);
    return {
      activePro: 0,
      mrrUsd: 0,
      todayUsd: 0,
      monthUsd: 0,
      feeTodayUsd: 0,
      feeMonthUsd: 0,
      ok: false,
    };
  }
}

/* ── Fixed costs (manual entry: hosting, domain, monitoring etc.) ── */

const FIXED_COSTS_STORE = "costs";
const FIXED_COSTS_KEY = "fixed";

export interface FixedCost {
  id: string;
  label: string;
  monthlyUsd: number;
  /** Optional notes the operator wants to leave next to the line. */
  notes?: string;
}

interface FixedCostSnapshot {
  items: FixedCost[];
  totalMonthlyUsd: number;
  /** Amortized to a single day for today-column display. */
  todayUsd: number;
}

export async function getFixedCosts(): Promise<FixedCostSnapshot> {
  let items: FixedCost[] = [];
  try {
    const store = getStore({ name: FIXED_COSTS_STORE });
    const raw = await store.get(FIXED_COSTS_KEY, { type: "json" });
    if (Array.isArray(raw)) items = raw as FixedCost[];
  } catch {
    // ignore — return empty list
  }
  const totalMonthlyUsd = items.reduce(
    (acc, x) => acc + (Number.isFinite(x.monthlyUsd) ? x.monthlyUsd : 0),
    0
  );
  // Days-in-month approximation (30.4 = 365/12) so the today amortization
  // stays consistent across months.
  const todayUsd = totalMonthlyUsd / 30.4;
  return { items, totalMonthlyUsd, todayUsd };
}

/**
 * Replace the entire fixed-costs list. Caller owns the array shape;
 * we don't merge or upsert individual rows (keeps the route handler
 * simple and the data model boring).
 */
export async function setFixedCosts(items: FixedCost[]): Promise<void> {
  try {
    const store = getStore({ name: FIXED_COSTS_STORE });
    // Defensive normalization — coerce numbers, clip strings.
    const cleaned: FixedCost[] = items
      .filter((x) => x && typeof x.label === "string")
      .map((x) => ({
        id: typeof x.id === "string" && x.id ? x.id : crypto.randomUUID(),
        label: x.label.trim().slice(0, 120),
        monthlyUsd:
          typeof x.monthlyUsd === "number" && Number.isFinite(x.monthlyUsd)
            ? Math.max(0, x.monthlyUsd)
            : 0,
        notes:
          typeof x.notes === "string" && x.notes.trim()
            ? x.notes.trim().slice(0, 240)
            : undefined,
      }));
    await store.setJSON(FIXED_COSTS_KEY, cleaned);
  } catch (e) {
    console.error("[finances] setFixedCosts failed:", e);
  }
}

/* ── Combined snapshot ──────────────────────────────────────────── */

export interface FinancialSnapshot {
  ai: AiSpendSnapshot;
  revenue: RevenueSnapshot;
  ads: AdSpendSnapshot;
  fixed: FixedCostSnapshot;
  /** Net = revenue − AI cost − Stripe fees − ad spend − fixed costs.
   *  This is the closest thing to true daily/monthly profit we can
   *  calculate without payroll/contractors. */
  net: { todayUsd: number; monthUsd: number };
  /** ISO timestamp this snapshot was taken — caller can display. */
  asOf: string;
}

export async function getFinancialSnapshot(): Promise<FinancialSnapshot> {
  const [ai, revenue, ads, fixed] = await Promise.all([
    getAiSpend(),
    getRevenue(),
    getAdSpend(),
    getFixedCosts(),
  ]);
  return {
    ai,
    revenue,
    ads,
    fixed,
    net: {
      todayUsd:
        revenue.todayUsd -
        revenue.feeTodayUsd -
        ai.todayUsd -
        ads.todayUsd -
        fixed.todayUsd,
      monthUsd:
        revenue.monthUsd -
        revenue.feeMonthUsd -
        ai.monthUsd -
        ads.monthUsd -
        fixed.totalMonthlyUsd,
    },
    asOf: new Date().toISOString(),
  };
}
