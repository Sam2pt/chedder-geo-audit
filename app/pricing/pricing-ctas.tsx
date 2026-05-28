"use client";

import { useEffect, useState } from "react";
import { track } from "@/lib/track";

/**
 * Client CTA block for the Pro tile on /pricing.
 *
 * Behavior:
 *   • When billingLive is false, renders a mailto fallback so we capture
 *     interest before Stripe is wired.
 *   • When billingLive is true, renders a monthly/yearly toggle and a
 *     primary "Upgrade to Pro" button that POSTs to /api/billing/checkout
 *     then redirects to Stripe.
 *   • If the user is already Pro, swaps in "Manage your subscription"
 *     that hits /api/billing/portal.
 */

type Interval = "monthly" | "yearly";

interface MeSummary {
  email: string | null;
  plan?: "free" | "pro";
}

export function PricingCTAs({ billingLive }: { billingLive: boolean }) {
  const [interval, setInterval] = useState<Interval>("monthly");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<MeSummary | null>(null);

  // Look up the user's current plan so Pro users see "Manage" instead
  // of "Upgrade" — and signed-out users get sent through sign-in first.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { email: null }))
      .then((d: MeSummary) => {
        if (!cancelled) setMe(d);
      })
      .catch(() => {
        if (!cancelled) setMe({ email: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function startCheckout() {
    if (loading) return;
    setLoading(true);
    setError(null);
    track("billing.checkout.started", { interval });
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval }),
      });
      const data = await res.json();
      if (!res.ok || !data?.url) {
        // Not signed in → bounce through sign-in then back to pricing.
        if (res.status === 401) {
          window.location.href = "/sign-in?next=/pricing";
          return;
        }
        setError(data?.error || "Could not start checkout.");
        setLoading(false);
        return;
      }
      window.location.href = data.url as string;
    } catch {
      setError("Could not reach our servers. Try again.");
      setLoading(false);
    }
  }

  async function openPortal() {
    if (loading) return;
    setLoading(true);
    setError(null);
    track("billing.portal.opened");
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data?.url) {
        if (res.status === 401) {
          window.location.href = "/sign-in?next=/pricing";
          return;
        }
        setError(data?.error || "Could not open billing portal.");
        setLoading(false);
        return;
      }
      window.location.href = data.url as string;
    } catch {
      setError("Could not reach our servers. Try again.");
      setLoading(false);
    }
  }

  // Pre-launch fallback — mailto so we capture interest in the inbox
  // without standing up a separate signup form.
  if (!billingLive) {
    return (
      <a
        href="mailto:sam@twopointtechnologies.com?subject=Chedder%20Pro%20interest&body=Hi%20Sam%2C%20I%27m%20interested%20in%20Chedder%20Pro.%20Please%20let%20me%20know%20when%20it%27s%20live."
        className="relative mt-6 h-[52px] sm:h-11 rounded-2xl sm:rounded-xl bg-[var(--brand-coral)] hover:bg-[var(--brand-coral-dark)] active:scale-[0.99] text-white font-semibold text-[15px] sm:text-[14px] tracking-[-0.01em] transition-all duration-150 text-center leading-[52px] sm:leading-[44px]"
      >
        Notify me when Pro is live
      </a>
    );
  }

  // Already Pro → manage instead of upgrade.
  if (me?.plan === "pro") {
    return (
      <div className="relative mt-6 space-y-2">
        <button
          type="button"
          onClick={openPortal}
          disabled={loading}
          className="block w-full h-[52px] sm:h-11 rounded-2xl sm:rounded-xl bg-[var(--brand-coral)] hover:bg-[var(--brand-coral-dark)] active:scale-[0.99] disabled:opacity-60 text-white font-semibold text-[15px] sm:text-[14px] tracking-[-0.01em] transition-all duration-150 text-center"
        >
          {loading ? "Opening…" : "Manage your subscription"}
        </button>
        <p className="text-[12px] sm:text-[11.5px] text-background/60 text-center">
          You&apos;re on Pro. Manage card, plan, or cancel here.
        </p>
        {error && (
          <p className="text-[11.5px] text-[#fca5a5] text-center">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="relative mt-6 space-y-3">
      {/* Interval toggle — bigger on mobile (44px) so thumb taps land
          even when fingers are warm and imprecise. Save-17% pill grows
          a touch on mobile too. */}
      <div className="inline-flex w-full p-1 rounded-2xl sm:rounded-xl bg-white/[0.06] border border-white/[0.08]">
        <button
          type="button"
          onClick={() => setInterval("monthly")}
          className={`flex-1 h-11 sm:h-8 rounded-xl sm:rounded-lg text-[13.5px] sm:text-[12.5px] font-semibold tracking-[-0.01em] transition-all duration-200 ${
            interval === "monthly"
              ? "bg-white text-foreground shadow-sm"
              : "text-background/70 hover:text-background active:text-background"
          }`}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => setInterval("yearly")}
          className={`flex-1 h-11 sm:h-8 rounded-xl sm:rounded-lg text-[13.5px] sm:text-[12.5px] font-semibold tracking-[-0.01em] transition-all duration-200 inline-flex items-center justify-center gap-1.5 ${
            interval === "yearly"
              ? "bg-white text-foreground shadow-sm"
              : "text-background/70 hover:text-background active:text-background"
          }`}
        >
          Yearly
          <span className={`text-[10px] sm:text-[9.5px] font-bold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded ${
            interval === "yearly"
              ? "bg-[var(--brand-coral)]/15 text-[var(--brand-coral-dark)]"
              : "bg-white/[0.12] text-background/85"
          }`}>
            Save 17%
          </span>
        </button>
      </div>

      {/* Primary CTA — 52px tall on mobile for comfortable thumb reach,
          tactile press feedback via active:scale, sticky-friendly
          rounded-2xl. */}
      <button
        type="button"
        onClick={startCheckout}
        disabled={loading}
        className="block w-full h-[52px] sm:h-11 rounded-2xl sm:rounded-xl bg-[var(--brand-coral)] hover:bg-[var(--brand-coral-dark)] active:scale-[0.99] disabled:opacity-60 text-white font-semibold text-[15px] sm:text-[14px] tracking-[-0.01em] transition-all duration-150 text-center"
      >
        {loading
          ? "Opening Stripe…"
          : interval === "yearly"
            ? "Start Pro · $290/yr"
            : "Start Pro · $29/mo"}
      </button>

      <p className="text-[12px] sm:text-[11px] text-background/55 text-center leading-snug">
        Cancel anytime. Secure checkout by Stripe.
      </p>
      {error && (
        <p className="text-[11.5px] text-[#fca5a5] text-center">{error}</p>
      )}
    </div>
  );
}
