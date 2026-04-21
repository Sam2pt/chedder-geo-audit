import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminSummary } from "@/lib/admin-data";

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
  searchParams: Promise<{ token?: string }>;
}

export default async function AdminPage({ searchParams }: Props) {
  const expected = process.env.CHEDDER_ADMIN_TOKEN;
  const { token } = await searchParams;

  if (!expected || !token || token !== expected) {
    notFound();
  }

  const data = await getAdminSummary();
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
                            className="hover:underline text-[#0071e3]"
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
                          className="hover:underline text-[#0071e3]"
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
