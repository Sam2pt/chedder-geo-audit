import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getAuditsForLead } from "@/lib/audit-store";
import { SignOutButton } from "./sign-out-button";

export const metadata: Metadata = {
  title: "My audits",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function MyAuditsPage() {
  const email = await getCurrentUser();
  if (!email) redirect("/sign-in");

  const audits = await getAuditsForLead(email);

  return (
    <main className="flex-1 px-6 py-12">
      <div className="max-w-[900px] mx-auto space-y-8">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2">
            <Link
              href="/"
              className="text-[13px] text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Back to Chedder
            </Link>
            <h1 className="text-[32px] font-semibold tracking-[-0.02em] text-foreground leading-tight">
              My audits
            </h1>
            <p className="text-[13.5px] text-muted-foreground">
              Signed in as <strong className="text-foreground/80">{email}</strong>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="h-10 px-4 rounded-xl bg-foreground text-background text-[13.5px] font-semibold tracking-[-0.01em] inline-flex items-center gap-2 hover:bg-foreground/90 transition-colors"
            >
              Run a new audit
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
            <SignOutButton />
          </div>
        </header>

        {audits.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-black/[0.1] bg-white/40 px-6 py-12 text-center space-y-3">
            <div className="text-[44px]">🧀</div>
            <h2 className="text-[18px] font-semibold text-foreground">
              No audits yet
            </h2>
            <p className="text-[13.5px] text-muted-foreground max-w-[420px] mx-auto">
              Run your first Chedder audit and it&apos;ll appear here so you can come back to it anytime.
            </p>
            <div>
              <Link
                href="/"
                className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-foreground text-background text-[13.5px] font-semibold hover:bg-foreground/90 transition-colors"
              >
                Run your first audit
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            {audits.map((a) => {
              const accent =
                a.overallScore >= 80
                  ? "#34c759"
                  : a.overallScore >= 60
                    ? "#5ac8fa"
                    : a.overallScore >= 40
                      ? "#ff9f0a"
                      : "#ff453a";
              return (
                <Link
                  key={a.slug}
                  href={`/a/${a.slug}`}
                  className="group flex items-center gap-5 p-5 rounded-2xl bg-white border border-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:shadow-[0_4px_14px_rgba(0,0,0,0.05)] transition-shadow"
                >
                  <div
                    className="shrink-0 w-14 h-14 rounded-xl flex items-center justify-center text-[18px] font-bold tabular-nums"
                    style={{
                      background: `${accent}15`,
                      color: accent,
                    }}
                  >
                    {a.overallScore}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[16px] font-semibold tracking-[-0.01em] text-foreground truncate group-hover:text-[#0071e3] transition-colors">
                      {a.domain}
                    </div>
                    <div className="text-[12.5px] text-muted-foreground mt-0.5">
                      Grade {a.grade} · {new Date(a.timestamp).toLocaleString()}
                    </div>
                  </div>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-muted-foreground/40 group-hover:text-foreground/60 transition-colors"
                  >
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
