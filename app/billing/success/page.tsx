import { Metadata } from "next";
import Link from "next/link";

/**
 * Post-Checkout thank-you page.
 *
 * Stripe redirects here with ?session_id=cs_… after a successful
 * payment. We intentionally DO NOT trust that param to flip the user's
 * plan — the webhook is the source of truth and runs before (or just
 * after) the redirect lands. This page is purely a celebratory landing
 * with next-step CTAs.
 *
 * If a user lands here without an active Pro plan (e.g. webhook hasn't
 * processed yet), the page still works — they'll see Pro entitlement
 * within a few seconds and the navigation will reflect it on next load.
 */

export const metadata: Metadata = {
  title: "Welcome to Chedder Pro",
  description: "Your Pro plan is active. Run unlimited audits, compare competitors, and export PDF reports.",
};

export default function BillingSuccessPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-16">
      <div className="max-w-[500px] w-full text-center space-y-7">
        {/* Indigo→cyan halo with checkmark */}
        <div className="flex items-center justify-center">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-[var(--brand-coral)]/25 blur-2xl" />
            <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--brand-coral)] to-[var(--brand-accent-2)] flex items-center justify-center shadow-[0_8px_24px_rgba(79,70,229,0.25)]">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-[40px] sm:text-[48px] font-semibold tracking-[-0.04em] leading-[1.05] text-foreground">
            <span className="text-foreground/40">Welcome to</span><br />
            <span className="bg-gradient-to-r from-[var(--brand-coral)] to-[var(--brand-accent-2)] bg-clip-text text-transparent">
              Chedder Pro
            </span>
          </h1>
          <p className="text-[15.5px] text-muted-foreground leading-[1.55] max-w-[400px] mx-auto">
            Your plan is active. Run unlimited audits, compare competitors side-by-side, and export PDF reports.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5 pt-3">
          <Link
            href="/"
            className="flex-1 h-11 rounded-xl bg-foreground text-background font-semibold text-[14px] tracking-[-0.01em] hover:bg-foreground/90 transition-colors text-center leading-[44px]"
          >
            Run an audit
          </Link>
          <Link
            href="/my-audits"
            className="flex-1 h-11 rounded-xl bg-white border border-foreground/[0.09] text-foreground font-semibold text-[14px] tracking-[-0.01em] hover:bg-foreground/[0.03] transition-colors text-center leading-[44px]"
          >
            See your audits
          </Link>
        </div>

        <p className="text-[12px] text-muted-foreground/70 pt-4">
          Receipt sent to your email. Manage billing anytime at{" "}
          <Link href="/api/billing/portal" className="underline hover:text-foreground transition-colors">
            the billing portal
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
