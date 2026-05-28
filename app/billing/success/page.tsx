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
    <main className="min-h-screen flex items-center justify-center px-5 sm:px-6 py-12 sm:py-16 pb-[calc(env(safe-area-inset-bottom)+48px)] relative overflow-hidden">
      {/* Ambient indigo→cyan glow behind the card. Subtle on desktop,
          slightly bolder on mobile where the page IS the moment. */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[120%] sm:w-[80%] h-[60%] rounded-full bg-[var(--brand-coral)]/[0.07] blur-[100px]" />
        <div className="absolute top-[30%] left-1/2 -translate-x-1/2 w-[100%] sm:w-[60%] h-[40%] rounded-full bg-[var(--brand-accent-2)]/[0.05] blur-[100px]" />
      </div>

      <div className="max-w-[500px] w-full text-center space-y-6 sm:space-y-7 anim-slide-up">
        {/* Indigo→cyan halo with checkmark. Adds a gentle pulse on
            mobile so the moment feels earned. */}
        <div className="flex items-center justify-center">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-[var(--brand-coral)]/30 blur-2xl animate-pulse" />
            <div className="relative w-20 h-20 sm:w-16 sm:h-16 rounded-3xl sm:rounded-2xl bg-gradient-to-br from-[var(--brand-coral)] to-[var(--brand-accent-2)] flex items-center justify-center shadow-[0_8px_28px_rgba(79,70,229,0.32)]">
              <svg width="36" height="36" className="sm:w-7 sm:h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" className="text-white" />
              </svg>
            </div>
          </div>
        </div>

        <div className="space-y-3 sm:space-y-2">
          <h1 className="text-[38px] sm:text-[48px] font-semibold tracking-[-0.04em] leading-[1.05] text-foreground">
            <span className="text-foreground/40">Welcome to</span><br />
            <span className="bg-gradient-to-r from-[var(--brand-coral)] to-[var(--brand-accent-2)] bg-clip-text text-transparent">
              Chedder Pro
            </span>
          </h1>
          <p className="text-[15px] sm:text-[15.5px] text-muted-foreground leading-[1.55] max-w-[400px] mx-auto px-2 sm:px-0">
            Your plan is active. Run unlimited audits, compare competitors side-by-side, and export PDF reports.
          </p>
        </div>

        {/* CTAs: 52px on mobile for thumb comfort, stacked first then
            side-by-side from sm: up. Primary CTA gets the active scale. */}
        <div className="flex flex-col sm:flex-row gap-2.5 pt-3">
          <Link
            href="/"
            className="flex-1 h-[52px] sm:h-11 rounded-2xl sm:rounded-xl bg-foreground text-background font-semibold text-[15px] sm:text-[14px] tracking-[-0.01em] hover:bg-foreground/90 active:scale-[0.99] transition-all duration-150 text-center leading-[52px] sm:leading-[44px]"
          >
            Run an audit
          </Link>
          <Link
            href="/my-audits"
            className="flex-1 h-[52px] sm:h-11 rounded-2xl sm:rounded-xl bg-white border border-foreground/[0.09] text-foreground font-semibold text-[15px] sm:text-[14px] tracking-[-0.01em] hover:bg-foreground/[0.03] active:scale-[0.99] transition-all duration-150 text-center leading-[52px] sm:leading-[44px]"
          >
            See your audits
          </Link>
        </div>

        <p className="text-[12.5px] sm:text-[12px] text-muted-foreground/70 pt-2 sm:pt-4 leading-snug">
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
