import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAdminSummary,
  getUsageDashboard,
  type DailyBucket,
  type FunnelStats,
} from "@/lib/admin-data";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Internal admin dashboard. Protected by a shared token (CHEDDER_ADMIN_TOKEN
 * env var) passed as ?token=… in the URL. This is deliberately the crudest
 * auth possible — there's no public user system yet and we'd rather ship
 * the operational visibility we need than wait for a login flow.
 *
 * If CHEDDER_ADMIN_TOKEN is unset the page 404s (fail closed — never
 * expose admin data if the env var wasn't wired up on deploy).
 */

interface Props {
  searchParams: Promise<{ token?: string; days?: string }>;
}

// Allowed presets for the timeline selector. Anything else falls back
// to the default to keep URL tampering harmless.
const WINDOW_PRESETS: Array<{ label: string; days: number }> = [
  { label: "24h", days: 1 },
  { label: "7d", days: 7 },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];
const DEFAULT_DAYS = 14;

export default async function AdminPage({ searchParams }: Props) {
  const expected = process.env.CHEDDER_ADMIN_TOKEN;
  const { token, days: daysParam } = await searchParams;

  if (!expected || !token || token !== expected) {
    notFound();
  }

  const parsedDays = daysParam ? parseInt(daysParam, 10) : NaN;
  const selectedDays = WINDOW_PRESETS.some((p) => p.days === parsedDays)
    ? parsedDays
    : DEFAULT_DAYS;

  const [data, usage] = await Promise.all([
    getAdminSummary(),
    getUsageDashboard({ days: selectedDays }),
  ]);
  const { audits, leads, events } = data;

  return (
    <main className="flex-1 px-6 py-10">
      <div className="max-w-[1100px] mx-auto space-y-10">
        <header className="space-y-2">
          <Link
            href="/"
            className="text-[13px] text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to Chedder
          </Link>
          <h1 className="text-[32px] font-semibold tracking-[-0.02em] text-foreground leading-tight">
            Admin
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Live snapshot from Netlify Blobs. Last refreshed {new Date().toLocaleString()}.
          </p>
        </header>

        {/* Summary tiles */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Tile label="Audits (shown)" value={audits.length.toString()} />
          <Tile label="Leads (shown)" value={leads.length.toString()} />
          <Tile label="Events (sampled)" value={events.total.toString()} />
          <Tile
            label="Latest audit"
            value={
              audits[0]?.timestamp
                ? new Date(audits[0].timestamp).toLocaleString()
                : "·"
            }
            small
          />
        </section>

        {/* Timeline selector — drives all the windowed sections below.
            Server-rendered links so it works without JS. */}
        <section className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-foreground">
              Usage window
            </h2>
            <p className="text-[12px] text-muted-foreground">
              Funnel, daily activity, top brands, and referrers all use this range.
            </p>
          </div>
          <div className="inline-flex rounded-xl border border-black/[0.08] bg-white p-0.5">
            {WINDOW_PRESETS.map((p) => {
              const active = p.days === selectedDays;
              const url = `/admin?token=${encodeURIComponent(token)}&days=${p.days}`;
              return (
                <Link
                  key={p.days}
                  href={url}
                  className={`px-3 py-1.5 rounded-lg text-[12.5px] font-semibold tracking-[-0.01em] transition-colors ${
                    active
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground hover:bg-black/[0.03]"
                  }`}
                >
                  {p.label}
                </Link>
              );
            })}
          </div>
        </section>

        {/* Funnel (last N days) */}
        <FunnelSection funnel={usage.funnel} />

        {/* Activity chart (granularity matches the timeline window) */}
        <DailySection daily={usage.daily} granularity={usage.granularity} />

        {/* Top brands + top referrers */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h2 className="text-[18px] font-semibold tracking-[-0.015em] text-foreground">
              Top brands audited
            </h2>
            <p className="text-[12px] text-muted-foreground">
              {usage.funnel.days === 1 ? "Last 24 hours" : `Last ${usage.funnel.days} days`}, ranked by audit count.
            </p>
            {usage.topBrands.length === 0 ? (
              <EmptyBlock>No audits yet in this window.</EmptyBlock>
            ) : (
              <div className="rounded-xl border border-black/[0.06] bg-white divide-y divide-black/[0.04]">
                {usage.topBrands.map((b) => (
                  <div
                    key={b.domain}
                    className="flex items-center justify-between px-3 py-2 text-[13px]"
                  >
                    <span className="font-mono text-foreground/85 truncate">
                      {b.domain}
                    </span>
                    <span className="text-foreground font-semibold tabular-nums">
                      {b.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-3">
            <h2 className="text-[18px] font-semibold tracking-[-0.015em] text-foreground">
              Where visitors came from
            </h2>
            <p className="text-[12px] text-muted-foreground">
              {usage.funnel.days === 1 ? "Last 24 hours" : `Last ${usage.funnel.days} days`}, sessions with a known referrer.
            </p>
            {usage.topReferrers.length === 0 ? (
              <EmptyBlock>
                No referrers captured yet (direct visits don&apos;t carry one).
              </EmptyBlock>
            ) : (
              <div className="rounded-xl border border-black/[0.06] bg-white divide-y divide-black/[0.04]">
                {usage.topReferrers.map((r) => (
                  <div
                    key={r.source}
                    className="flex items-center justify-between px-3 py-2 text-[13px]"
                  >
                    <span className="text-foreground/85 truncate">
                      {r.source}
                    </span>
                    <span className="text-foreground font-semibold tabular-nums">
                      {r.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Events by type */}
        <section className="space-y-3">
          <h2 className="text-[18px] font-semibold tracking-[-0.015em] text-foreground">
            Event counts
          </h2>
          <p className="text-[12px] text-muted-foreground">
            Sampled over the most recent {events.total} events
            {events.windowStart && events.windowEnd ? (
              <>
                {" "}
                ({new Date(events.windowStart).toLocaleDateString()} →{" "}
                {new Date(events.windowEnd).toLocaleDateString()}).
              </>
            ) : (
              "."
            )}
          </p>
          {events.byType.length === 0 ? (
            <EmptyBlock>No events captured yet.</EmptyBlock>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {events.byType.map((e) => (
                <div
                  key={e.type}
                  className="flex items-center justify-between rounded-lg border border-black/[0.06] bg-white px-3 py-2"
                >
                  <span className="text-[12.5px] font-mono text-foreground/80 truncate">
                    {e.type}
                  </span>
                  <span className="text-[13px] font-semibold tabular-nums text-foreground">
                    {e.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Leads */}
        <section className="space-y-3">
          <h2 className="text-[18px] font-semibold tracking-[-0.015em] text-foreground">
            Leads ({leads.length})
          </h2>
          {leads.length === 0 ? (
            <EmptyBlock>No leads yet.</EmptyBlock>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-black/[0.06] bg-white">
              <table className="w-full text-[13px]">
                <thead className="bg-black/[0.02] text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
                  <tr>
                    <Th>When</Th>
                    <Th>Name</Th>
                    <Th>Email</Th>
                    <Th>Role</Th>
                    <Th>Company</Th>
                    <Th>Source audit</Th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l) => (
                    <tr
                      key={`${l.email}:${l.createdAt}`}
                      className="border-t border-black/[0.04]"
                    >
                      <Td mono>
                        {new Date(l.createdAt).toLocaleString()}
                      </Td>
                      <Td>{l.name}</Td>
                      <Td mono>
                        <a
                          href={`mailto:${l.email}`}
                          className="hover:underline"
                        >
                          {l.email}
                        </a>
                      </Td>
                      <Td>{l.role}</Td>
                      <Td>{l.company}</Td>
                      <Td mono>
                        {l.sourceAuditSlug ? (
                          <Link
                            href={`/a/${l.sourceAuditSlug}`}
                            className="hover:underline text-[#6f8aab]"
                          >
                            {l.sourceAuditSlug}
                          </Link>
                        ) : (
                          "·"
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Audits */}
        <section className="space-y-3">
          <h2 className="text-[18px] font-semibold tracking-[-0.015em] text-foreground">
            Audits ({audits.length})
          </h2>
          {audits.length === 0 ? (
            <EmptyBlock>No audits yet.</EmptyBlock>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-black/[0.06] bg-white">
              <table className="w-full text-[13px]">
                <thead className="bg-black/[0.02] text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
                  <tr>
                    <Th>When</Th>
                    <Th>Domain</Th>
                    <Th>Score</Th>
                    <Th>Grade</Th>
                    <Th>Lead</Th>
                    <Th>Slug</Th>
                  </tr>
                </thead>
                <tbody>
                  {audits.map((a) => (
                    <tr key={a.slug} className="border-t border-black/[0.04]">
                      <Td mono>{new Date(a.timestamp).toLocaleString()}</Td>
                      <Td>
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                        >
                          {a.domain}
                        </a>
                      </Td>
                      <Td mono>{a.overallScore}</Td>
                      <Td>{a.grade}</Td>
                      <Td mono>{a.leadEmail || "·"}</Td>
                      <Td mono>
                        <Link
                          href={`/a/${a.slug}`}
                          className="hover:underline text-[#6f8aab]"
                        >
                          {a.slug}
                        </Link>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Tile({
  label,
  value,
  small,
}: {
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-xl border border-black/[0.06] bg-white p-4">
      <div className="text-[11px] uppercase tracking-[0.04em] text-muted-foreground mb-1">
        {label}
      </div>
      <div
        className={
          small
            ? "text-[14px] font-medium text-foreground"
            : "text-[28px] font-semibold tracking-[-0.02em] text-foreground tabular-nums"
        }
      >
        {value}
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left px-3 py-2 font-medium">{children}</th>;
}

function Td({
  children,
  mono,
}: {
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <td
      className={`px-3 py-2 align-top ${mono ? "font-mono text-[12px]" : ""}`}
    >
      {children}
    </td>
  );
}

function EmptyBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-black/[0.1] bg-white/40 px-4 py-6 text-[13px] text-muted-foreground">
      {children}
    </div>
  );
}

function pct(num: number, denom: number): string {
  if (!denom) return "·";
  const r = Math.round((num / denom) * 100);
  return `${r}%`;
}

/**
 * Session → audit → completion → lead signup funnel for the last N
 * days. Each step shows the absolute count and the percentage relative
 * to the step above it, so you can see where users drop off.
 */
function FunnelSection({ funnel }: { funnel: FunnelStats }) {
  const steps = [
    {
      label: "Sessions",
      sub: "Unique visitors",
      value: funnel.sessions,
      ofPrev: null as number | null,
      accent: "#6f8aab",
    },
    {
      label: "Audits started",
      sub: "Hit Analyze",
      value: funnel.auditsStarted,
      ofPrev: funnel.sessions,
      accent: "#9a7aa0",
    },
    {
      label: "Audits completed",
      sub: "Saw a result",
      value: funnel.auditsCompleted,
      ofPrev: funnel.auditsStarted,
      accent: "#c2745f",
    },
    {
      label: "Lead signups",
      sub: "Crossed the soft gate",
      value: funnel.leadSignups,
      ofPrev: funnel.auditsCompleted,
      accent: "#7a8b6b",
    },
    {
      label: "PDF requests",
      sub: "Total downloads/emails",
      value: funnel.pdfRequested,
      ofPrev: null,
      accent: "#d8a23e",
    },
  ];
  const maxBar = Math.max(funnel.sessions, 1);
  return (
    <section className="space-y-3">
      <h2 className="text-[18px] font-semibold tracking-[-0.015em] text-foreground">
        Funnel · {funnel.days === 1 ? "last 24 hours" : `last ${funnel.days} days`}
      </h2>
      <div className="rounded-2xl border border-black/[0.06] bg-white p-4 sm:p-5 space-y-2.5">
        {steps.map((s) => {
          const widthPct = Math.max(2, (s.value / maxBar) * 100);
          return (
            <div key={s.label} className="space-y-1">
              <div className="flex items-center justify-between gap-3 text-[12.5px]">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full"
                    style={{ background: s.accent }}
                  />
                  <span className="font-semibold text-foreground">
                    {s.label}
                  </span>
                  <span className="text-muted-foreground/80">{s.sub}</span>
                </div>
                <div className="flex items-center gap-3 tabular-nums">
                  <span className="text-foreground font-semibold">
                    {s.value}
                  </span>
                  {s.ofPrev !== null && (
                    <span className="text-[11.5px] text-muted-foreground w-10 text-right">
                      {pct(s.value, s.ofPrev)}
                    </span>
                  )}
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-black/[0.05] overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${widthPct}%`,
                    background: s.accent,
                    transition: "width 600ms ease-out",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Compact stacked-bar chart for daily activity. One column per day in
 * the window, with sessions / audits started / completed / signups
 * shown as a 4-color stack. Drawn as plain divs (no chart library).
 */
function DailySection({
  daily,
  granularity,
}: {
  daily: DailyBucket[];
  granularity: "hour" | "day" | "week";
}) {
  const max = Math.max(
    1,
    ...daily.map((d) =>
      Math.max(d.sessions, d.auditsStarted, d.auditsCompleted, d.leadSignups)
    )
  );
  const bucketWord =
    granularity === "hour" ? "hours" : granularity === "week" ? "weeks" : "days";
  const sectionTitle =
    granularity === "hour" ? "Hourly activity" :
    granularity === "week" ? "Weekly activity" :
    "Daily activity";
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[18px] font-semibold tracking-[-0.015em] text-foreground">
            {sectionTitle}
          </h2>
          <p className="text-[12px] text-muted-foreground">
            {daily.length} {bucketWord}, unique-device sessions and audit funnel events.
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <LegendDot color="#6f8aab" label="Sessions" />
          <LegendDot color="#9a7aa0" label="Audits" />
          <LegendDot color="#c2745f" label="Completed" />
          <LegendDot color="#7a8b6b" label="Signups" />
        </div>
      </div>
      <div className="rounded-2xl border border-black/[0.06] bg-white p-4 overflow-x-auto">
        <div className="flex items-end gap-1.5 h-[140px] min-w-[280px]">
          {daily.map((d) => {
            const cols: Array<{ v: number; color: string; label: string }> = [
              { v: d.sessions, color: "#6f8aab", label: "Sessions" },
              { v: d.auditsStarted, color: "#9a7aa0", label: "Audits started" },
              { v: d.auditsCompleted, color: "#c2745f", label: "Audits completed" },
              { v: d.leadSignups, color: "#7a8b6b", label: "Signups" },
            ];
            return (
              <div
                key={d.date}
                className="flex-1 min-w-0 flex flex-col items-center gap-1"
                title={cols
                  .map((c) => `${c.label}: ${c.v}`)
                  .concat([`Bucket: ${d.date}`])
                  .join("\n")}
              >
                <div className="flex items-end gap-[2px] h-[120px] w-full justify-center">
                  {cols.map((c, i) => {
                    const h = (c.v / max) * 100;
                    return (
                      <div
                        key={i}
                        className="w-[3px] rounded-t-sm transition-all"
                        style={{
                          height: c.v > 0 ? `${Math.max(2, h)}%` : "0",
                          background: c.color,
                          opacity: c.v > 0 ? 1 : 0,
                        }}
                      />
                    );
                  })}
                </div>
                <div className="text-[9.5px] tabular-nums text-muted-foreground">
                  {d.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}
