import { Metadata } from "next";
import Link from "next/link";

/**
 * Pricing page — single Pro tier, no trial. Stripe Checkout will hook
 * into the primary CTA once we wire it; for now the CTA mailtos / opens
 * an interest signal so we capture demand pre-launch.
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
  return (
    <main className="min-h-screen px-6 py-16 sm:py-24 max-w-[1040px] mx-auto">
      <header className="text-center space-y-4 mb-14">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/60 backdrop-blur-sm border border-foreground/[0.07] text-[12.5px] text-muted-foreground font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-coral)]" />
          Pricing
        </div>
        <h1 className="text-[44px] sm:text-[64px] font-semibold tracking-[-0.045em] leading-[1.0] text-foreground">
          One free audit.<br />
          <span className="text-foreground/40">Then unlimited </span>
          <span className="bg-gradient-to-r from-[var(--brand-coral)] to-[var(--brand-accent-2)] bg-clip-text text-transparent">Pro</span>
          <span className="text-foreground/40">.</span>
        </h1>
        <p className="text-[17px] text-muted-foreground max-w-[520px] mx-auto leading-[1.55]">
          Try Chedder once, free. When you&apos;re ready to keep watching, Pro is $29/month.
        </p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-[800px] mx-auto">
        {/* Free tier */}
        <div className="p-7 rounded-2xl bg-white border border-foreground/[0.07] flex flex-col">
          <div className="space-y-1.5">
            <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
              Free
            </div>
            <div className="text-[40px] font-semibold tracking-[-0.04em] leading-none tabular-nums text-foreground">
              $0
            </div>
            <p className="text-[13px] text-muted-foreground">
              One audit, on the house.
            </p>
          </div>
          <ul className="space-y-2 mt-6 flex-1">
            {FREE_PERKS.map((p) => (
              <li key={p} className="flex items-start gap-2.5 text-[13.5px] text-foreground/85">
                <svg className="w-4 h-4 mt-0.5 text-foreground/40 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                {p}
              </li>
            ))}
          </ul>
          <Link
            href="/"
            className="mt-6 h-11 rounded-xl bg-foreground/[0.05] hover:bg-foreground/[0.09] text-foreground font-semibold text-[14px] tracking-[-0.01em] transition-colors text-center leading-[44px]"
          >
            Run your free audit
          </Link>
        </div>

        {/* Pro tier */}
        <div className="relative p-7 rounded-2xl bg-foreground text-background flex flex-col overflow-hidden">
          {/* Indigo→cyan accent halo */}
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--brand-coral)]/[0.15] via-transparent to-[var(--brand-accent-2)]/[0.08] pointer-events-none" />
          <div className="relative space-y-1.5">
            <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--brand-coral)]">
              Pro
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-[40px] font-semibold tracking-[-0.04em] leading-none tabular-nums">
                $29
              </span>
              <span className="text-[14px] text-background/60">/month</span>
            </div>
            <p className="text-[13px] text-background/60">
              Or $290/yr (save ~17%).
            </p>
          </div>
          <ul className="relative space-y-2 mt-6 flex-1">
            {PRO_PERKS.map((p) => (
              <li key={p} className="flex items-start gap-2.5 text-[13.5px] text-background/90">
                <svg className="w-4 h-4 mt-0.5 text-[var(--brand-coral)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                {p}
              </li>
            ))}
          </ul>
          {/* Stripe Checkout slot — will become a POST to /api/billing/checkout
              once Stripe keys are configured. For now this is a "notify me"
              form pointed at the leads endpoint so we capture demand. */}
          <a
            href="mailto:sam@twopointtechnologies.com?subject=Chedder%20Pro%20interest&body=Hi%20Sam%2C%20I%27m%20interested%20in%20Chedder%20Pro.%20Please%20let%20me%20know%20when%20it%27s%20live."
            className="relative mt-6 h-11 rounded-xl bg-[var(--brand-coral)] hover:bg-[var(--brand-coral-dark)] text-white font-semibold text-[14px] tracking-[-0.01em] transition-colors text-center leading-[44px]"
          >
            Notify me when Pro is live
          </a>
        </div>
      </section>

      <footer className="text-center mt-16 text-[13px] text-muted-foreground">
        Questions?{" "}
        <a href="mailto:sam@twopointtechnologies.com" className="underline hover:text-foreground transition-colors">
          sam@twopointtechnologies.com
        </a>
      </footer>
    </main>
  );
}
