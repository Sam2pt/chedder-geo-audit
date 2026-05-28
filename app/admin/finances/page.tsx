import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFinancialSnapshot } from "@/lib/finances";
import { AdSpendForm } from "./ad-spend-form";

export const metadata: Metadata = {
  title: "Finances · Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Real-time profit dashboard.
 *
 *   /admin/finances?token=…
 *
 * Three rows × two columns:
 *   Revenue     Today | Month
 *   AI costs    Today | Month
 *   Ad spend    Today | Month   (manual entry until Google Ads wired)
 *   Net margin  Today | Month
 *
 * Plus a sidebar with active Pro subscriber count, MRR estimate, and
 * the current daily/monthly AI spend caps so we can see how close
 * we're getting to throttling.
 */

interface Props {
  searchParams: Promise<{ token?: string }>;
}

function fmtUsd(n: number, { decimals = 2 }: { decimals?: number } = {}): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toFixed(decimals)}`;
}

export default async function FinancesPage({ searchParams }: Props) {
  const expected = process.env.CHEDDER_ADMIN_TOKEN;
  const { token } = await searchParams;

  if (!expected || !token || token !== expected) {
    notFound();
  }

  const snap = await getFinancialSnapshot();
  const { ai, revenue, ads, net } = snap;
  const dailyCapPct = ai.dailyCapUsd > 0 ? (ai.todayUsd / ai.dailyCapUsd) * 100 : 0;
  const monthlyCapPct = ai.monthlyCapUsd > 0 ? (ai.monthUsd / ai.monthlyCapUsd) * 100 : 0;

  return (
    <main className="flex-1 px-6 py-10 max-w-[1100px] mx-auto space-y-10">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <Link
            href={`/admin?token=${token}`}
            className="text-[13px] text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to admin
          </Link>
          <span className="text-[13px] text-muted-foreground/60">·</span>
          <span className="text-[12px] text-muted-foreground/60 tabular-nums">
            as of {new Date(snap.asOf).toLocaleString()}
          </span>
        </div>
        <h1 className="text-[32px] font-semibold tracking-[-0.03em] text-foreground">
          Finances
        </h1>
        <p className="text-[14px] text-muted-foreground">
          Live snapshot of revenue, AI compute spend, and ad spend. Net is
          revenue minus AI costs minus ads.
        </p>
      </header>

      {/* Top headline — today and month net margin */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <HeadlineCard
          label="Net today"
          value={net.todayUsd}
          subline={`${fmtUsd(revenue.todayUsd)} in − ${fmtUsd(ai.todayUsd + ads.todayUsd)} out`}
        />
        <HeadlineCard
          label="Net this month"
          value={net.monthUsd}
          subline={`${fmtUsd(revenue.monthUsd)} in − ${fmtUsd(ai.monthUsd + ads.monthUsd)} out`}
        />
      </section>

      {/* Two-column detail: numbers grid + Pro/MRR sidebar */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Detail rows */}
        <div className="md:col-span-2 rounded-2xl border border-foreground/[0.07] bg-white overflow-hidden">
          <DetailRow
            label="Revenue (Stripe)"
            today={revenue.todayUsd}
            month={revenue.monthUsd}
            polarity="in"
          />
          <DetailRow
            label="AI compute (OpenAI · Perplexity · Brave)"
            today={ai.todayUsd}
            month={ai.monthUsd}
            polarity="out"
            note={`${ai.todayQueries} queries today · ${ai.monthQueries} this month at ${fmtUsd(ai.costPerQueryUsd, { decimals: 3 })}/query (blended)`}
          />
          <DetailRow
            label="Ad spend (manual)"
            today={ads.todayUsd}
            month={ads.monthUsd}
            polarity="out"
            note="Edit to keep this accurate. Wire Google Ads API later to auto-pull."
            isLast
          />
        </div>

        {/* Sidebar — subscriber state + cap gauges */}
        <aside className="space-y-4">
          <div className="rounded-2xl border border-foreground/[0.07] bg-white p-5 space-y-3">
            <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
              Subscribers
            </h3>
            <div>
              <div className="text-[32px] font-semibold tabular-nums tracking-[-0.03em] text-foreground">
                {revenue.activePro}
              </div>
              <div className="text-[12.5px] text-muted-foreground mt-0.5">
                active Pro {revenue.activePro === 1 ? "subscription" : "subscriptions"}
              </div>
            </div>
            <div className="pt-3 border-t border-foreground/[0.06]">
              <div className="text-[20px] font-semibold tabular-nums tracking-[-0.02em] text-foreground">
                {fmtUsd(revenue.mrrUsd)}
              </div>
              <div className="text-[12px] text-muted-foreground mt-0.5">
                MRR estimate (yearly subs ÷ 12)
              </div>
            </div>
            {!revenue.ok && (
              <p className="text-[11.5px] text-[var(--brand-terracotta-dark)] bg-[var(--brand-terracotta)]/[0.07] border border-[var(--brand-terracotta)]/[0.18] rounded-lg px-2.5 py-2 leading-snug">
                Couldn&apos;t reach Stripe — numbers may be stale.
              </p>
            )}
          </div>

          <CapGauge label="Daily AI cap" used={ai.todayUsd} cap={ai.dailyCapUsd} pct={dailyCapPct} />
          <CapGauge label="Monthly AI cap" used={ai.monthUsd} cap={ai.monthlyCapUsd} pct={monthlyCapPct} />
        </aside>
      </section>

      {/* Manual ad-spend entry until Google Ads is wired up */}
      <section className="rounded-2xl border border-foreground/[0.07] bg-white p-5 sm:p-6 space-y-4">
        <div className="space-y-1">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
            Update ad spend
          </h2>
          <p className="text-[12.5px] text-muted-foreground">
            Drop in totals from the Google Ads dashboard. Replaces the
            existing value for the period. Use month for the running total.
          </p>
        </div>
        <AdSpendForm
          token={token}
          initialToday={ads.todayUsd}
          initialMonth={ads.monthUsd}
        />
      </section>
    </main>
  );
}

/* ── Sub-components ─────────────────────────────────────────────── */

function HeadlineCard({
  label,
  value,
  subline,
}: {
  label: string;
  value: number;
  subline: string;
}) {
  // Status-color: green if positive, terracotta if negative, neutral
  // if zero (often the case in the first week before any charges).
  const colorVar =
    value > 0
      ? "var(--brand-sage)"
      : value < 0
        ? "var(--brand-terracotta)"
        : "var(--muted-foreground)";
  return (
    <div className="relative p-6 rounded-2xl bg-white border border-foreground/[0.07] overflow-hidden">
      <div
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ background: colorVar }}
      />
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
        {label}
      </div>
      <div
        className="text-[40px] sm:text-[44px] font-semibold tabular-nums tracking-[-0.035em] leading-none mt-2"
        style={{ color: colorVar }}
      >
        {fmtUsd(value)}
      </div>
      <div className="text-[12.5px] text-muted-foreground mt-2">{subline}</div>
    </div>
  );
}

function DetailRow({
  label,
  today,
  month,
  polarity,
  note,
  isLast = false,
}: {
  label: string;
  today: number;
  month: number;
  polarity: "in" | "out";
  note?: string;
  isLast?: boolean;
}) {
  const sign = polarity === "in" ? "+" : "−";
  const color =
    polarity === "in" ? "var(--brand-sage-dark)" : "var(--brand-terracotta-dark)";
  return (
    <div className={isLast ? "p-5" : "p-5 border-b border-foreground/[0.06]"}>
      <div className="text-[13px] font-medium text-foreground/85">{label}</div>
      <div className="flex items-baseline justify-between gap-6 mt-2">
        <div>
          <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground/70">
            Today
          </div>
          <div
            className="text-[22px] font-semibold tabular-nums tracking-[-0.02em]"
            style={{ color }}
          >
            {sign}
            {fmtUsd(today)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground/70">
            Month
          </div>
          <div
            className="text-[22px] font-semibold tabular-nums tracking-[-0.02em]"
            style={{ color }}
          >
            {sign}
            {fmtUsd(month)}
          </div>
        </div>
      </div>
      {note && (
        <p className="text-[11.5px] text-muted-foreground/80 mt-2 leading-snug">
          {note}
        </p>
      )}
    </div>
  );
}

function CapGauge({
  label,
  used,
  cap,
  pct,
}: {
  label: string;
  used: number;
  cap: number;
  pct: number;
}) {
  const clamped = Math.min(100, Math.max(0, pct));
  // Bar color escalates: sage under 50%, amber 50-80, terracotta over 80.
  const color =
    clamped >= 80
      ? "var(--brand-terracotta)"
      : clamped >= 50
        ? "var(--brand-amber)"
        : "var(--brand-sage)";
  return (
    <div className="rounded-2xl border border-foreground/[0.07] bg-white p-4 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
          {label}
        </h3>
        <span className="text-[11px] tabular-nums text-muted-foreground/80">
          {fmtUsd(used)} / {fmtUsd(cap)}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-foreground/[0.06] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${clamped}%`, background: color }}
        />
      </div>
      <div
        className="text-[11px] tabular-nums"
        style={{ color }}
      >
        {clamped.toFixed(1)}% used
      </div>
    </div>
  );
}
