import { Metadata } from "next";
import { isBillingConfigured } from "@/lib/stripe";
import { PricingCTAs } from "./pricing-ctas";
import { TopNav } from "@/components/top-nav";
import { SiteFooter } from "@/components/site-footer";

/**
 * Pricing page — single Pro tier, no trial.
 *
 * When billing env vars are configured, the Pro CTAs POST to
 * /api/billing/checkout and redirect to Stripe Checkout. Until then the
 * CTAs become a "Notify me when Pro is live" mailto so we capture
 * demand pre-launch.
 *
 * Kept deliberately minimal: hero + 2-column compare + FAQ. No fluff.
 */

export const metadata: Metadata = {
  title: "Pricing · Chedder",
  description:
    "One free audit, then Chedder Pro at $29/mo. Unlimited audits, competitor compare, PDF export, and full history.",
};

const PRO_PERKS = [
  "Unlimited audits",
  "Compare up to 3 competitors per audit",
  "Downloadable PDF reports",
  "Full audit history saved forever",
  "Weekly auto-audits + score-change alerts",
  "Priority support",
];

const FREE_PERKS = [
  "1 audit after signup",
  "Full visibility into AI mentions",
  "Action plan included",
  "30-day history retention",
];

export default function PricingPage() {
  const billingLive = isBillingConfigured();

  return (
    <div className="min-h-screen flex flex-col">
    <TopNav variant="solid" />
    <main className="flex-1 px-5 sm:px-6 py-12 sm:py-20 max-w-[1040px] mx-auto pb-[calc(env(safe-area-inset-bottom)+48px)] w-full">
      <header className="text-center space-y-3 sm:space-y-4 mb-10 sm:mb-14">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/60 backdrop-blur-sm border border-foreground/[0.07] text-[12.5px] text-muted-foreground font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-coral)]" />
          Pricing
        </div>
        <h1 className="text-[38px] sm:text-[64px] font-semibold tracking-[-0.045em] leading-[1.02] sm:leading-[1.0] text-foreground">
          One free audit.<br />
          <span className="text-foreground/40">Then unlimited </span>
          <span className="bg-gradient-to-r from-[var(--brand-coral)] to-[var(--brand-accent-2)] bg-clip-text text-transparent">Pro</span>
          <span className="text-foreground/40">.</span>
        </h1>
        <p className="text-[15px] sm:text-[17px] text-muted-foreground max-w-[520px] mx-auto leading-[1.5] sm:leading-[1.55] px-2 sm:px-0">
          Try Chedder once, free. When you&apos;re ready to keep watching, Pro is $29/month.
        </p>
      </header>

      {/*
        Tile order: on mobile (flex column) we show Pro FIRST so the
        upgrade decision is the first thing in the user's eyeline — no
        scrolling past Free to find the paid tier. On md+ we use grid
        with order classes to keep Free on the left, Pro on the right
        (Pro is the headline product but Western reading order makes
        a left-then-right narrative feel natural on desktop).
      */}
      <section className="flex flex-col md:grid md:grid-cols-2 gap-3 sm:gap-4 max-w-[800px] mx-auto">
        {/* Pro tier — first on mobile, second on desktop */}
        <div className="order-1 md:order-2 relative p-6 sm:p-7 rounded-3xl sm:rounded-2xl bg-foreground text-background flex flex-col overflow-hidden">
          {/* Indigo→cyan accent halo */}
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--brand-coral)]/[0.18] via-transparent to-[var(--brand-accent-2)]/[0.1] pointer-events-none" />
          {/* RECOMMENDED ribbon on mobile only, to reinforce primary CTA */}
          <div className="md:hidden absolute top-3 right-3 text-[10px] font-bold uppercase tracking-[0.1em] px-2 py-1 rounded-md bg-[var(--brand-coral)] text-white">
            Recommended
          </div>
          <div className="relative space-y-1.5">
            <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--brand-coral)]">
              Pro
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-[44px] sm:text-[40px] font-semibold tracking-[-0.04em] leading-none tabular-nums">
                $29
              </span>
              <span className="text-[14px] text-background/60">/month</span>
            </div>
            <p className="text-[13px] text-background/60">
              Or $290/yr (save ~17%).
            </p>
          </div>
          <ul className="relative space-y-2.5 sm:space-y-2 mt-5 sm:mt-6 flex-1">
            {PRO_PERKS.map((p) => (
              <li
                key={p}
                className="flex items-start gap-2.5 text-[14px] sm:text-[13.5px] text-background/90 leading-snug"
              >
                <svg className="w-4 h-4 mt-0.5 text-[var(--brand-coral)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                {p}
              </li>
            ))}
          </ul>
          <PricingCTAs billingLive={billingLive} />
        </div>

        {/* Free tier — second on mobile, first on desktop */}
        <div className="order-2 md:order-1 p-6 sm:p-7 rounded-3xl sm:rounded-2xl bg-white border border-foreground/[0.07] flex flex-col">
          <div className="space-y-1.5">
            <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
              Free
            </div>
            <div className="text-[44px] sm:text-[40px] font-semibold tracking-[-0.04em] leading-none tabular-nums text-foreground">
              $0
            </div>
            <p className="text-[13px] text-muted-foreground">
              One audit, on the house.
            </p>
          </div>
          <ul className="space-y-2.5 sm:space-y-2 mt-5 sm:mt-6 flex-1">
            {FREE_PERKS.map((p) => (
              <li
                key={p}
                className="flex items-start gap-2.5 text-[14px] sm:text-[13.5px] text-foreground/85 leading-snug"
              >
                <svg className="w-4 h-4 mt-0.5 text-foreground/40 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                {p}
              </li>
            ))}
          </ul>
          <a
            href="/"
            className="mt-6 h-[52px] sm:h-11 rounded-2xl sm:rounded-xl bg-foreground/[0.05] hover:bg-foreground/[0.09] active:bg-foreground/[0.12] text-foreground font-semibold text-[15px] sm:text-[14px] tracking-[-0.01em] transition-colors text-center leading-[52px] sm:leading-[44px]"
          >
            Run your free audit
          </a>
        </div>
      </section>

      <footer className="text-center mt-12 sm:mt-16 text-[13px] text-muted-foreground">
        Questions?{" "}
        <a href="mailto:info@twopointtechnologies.com" className="underline hover:text-foreground transition-colors">
          info@twopointtechnologies.com
        </a>
      </footer>
    </main>
    <SiteFooter />
    </div>
  );
}
