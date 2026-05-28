"use client";

import { useEffect, useState } from "react";
import { track } from "@/lib/track";

/**
 * Upgrade modal — shown when a free user hits a Pro-gated action
 * (running a 2nd+ audit, opening competitor compare, exporting PDF).
 *
 * Layout adapts to viewport:
 *   • Mobile (< sm): renders as a bottom sheet that slides up from the
 *     bottom of the viewport, with a grab handle and a sticky CTA at
 *     the bottom — the same pattern an app like Cash or Linear uses.
 *     This puts the action in thumb-reach instead of forcing a stretch
 *     to the middle of the screen.
 *   • Desktop (sm+): centered card, the same shape as before.
 *
 * The contextual headline picks based on `reason`:
 *   • audit_limit / competitors / pdf / generic.
 */

export type UpgradeReason = "audit_limit" | "competitors" | "pdf" | "generic";

const COPY: Record<UpgradeReason, { headline: string; sub: string }> = {
  audit_limit: {
    headline: "You've used your free audit.",
    sub: "Upgrade to Pro to run unlimited audits and keep watching your AI visibility move.",
  },
  competitors: {
    headline: "See their playbook.",
    sub: "Pro audits every competitor side-by-side and tells you exactly what they're doing that you aren't.",
  },
  pdf: {
    headline: "Take this report home.",
    sub: "Pro unlocks a downloadable PDF you can share with your team or hand to an agency.",
  },
  generic: {
    headline: "Unlock Chedder Pro.",
    sub: "Unlimited audits, competitor compare, PDF export, and your full history saved forever.",
  },
};

const PERKS = [
  "Unlimited audits",
  "Compare up to 3 competitors per audit",
  "Downloadable PDF reports",
  "Full audit history saved forever",
  "Weekly auto-audits + score-change alerts (coming soon)",
];

export function UpgradeModal({
  open,
  reason = "generic",
  onClose,
}: {
  open: boolean;
  reason?: UpgradeReason;
  onClose: () => void;
}) {
  // Track open events so we can measure which gates convert.
  useEffect(() => {
    if (open) track("upgrade.modal.shown", { reason });
  }, [open, reason]);

  // Lock body scroll while open — important on mobile so the page
  // behind the sheet doesn't scroll with thumb gestures on the sheet.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // ESC to close.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const copy = COPY[reason];

  return (
    <div
      // items-end on mobile (sheet at bottom), items-center on desktop.
      // No horizontal padding on mobile so the sheet hugs the edges.
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:px-4 bg-foreground/40 backdrop-blur-sm animate-[fadeIn_180ms_ease-out]"
      onClick={onClose}
    >
      <div
        className={[
          // Shape: bottom-rounded sheet on mobile, full card on desktop.
          "relative w-full sm:max-w-[460px]",
          "rounded-t-[28px] sm:rounded-[22px] bg-white",
          "shadow-[0_-12px_40px_rgba(15,23,42,0.18)] sm:shadow-[0_24px_60px_rgba(15,23,42,0.22)]",
          // Mobile gets a slide-up entrance; desktop already has fade.
          "animate-[slideUpSheet_280ms_cubic-bezier(0.22,1,0.36,1)] sm:animate-none",
          // Padding: more breathing room top on mobile (under grab handle),
          // plus iOS safe-area bottom inset so the sticky CTA doesn't hide.
          "pt-3 sm:pt-7 px-5 sm:px-8 pb-[calc(env(safe-area-inset-bottom)+20px)] sm:pb-8",
          "space-y-5",
          // Cap height on mobile so it never covers the whole viewport.
          "max-h-[92vh] sm:max-h-none overflow-y-auto",
        ].join(" ")}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Mobile-only grab handle */}
        <div className="sm:hidden flex justify-center pb-1">
          <div className="w-10 h-1 rounded-full bg-foreground/15" />
        </div>

        {/* Close button — top-right on desktop, hidden on mobile (the
            grab handle + "Maybe later" button do the dismiss work). */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="hidden sm:flex absolute top-4 right-4 w-7 h-7 rounded-lg text-foreground/50 hover:text-foreground hover:bg-foreground/[0.05] transition-colors items-center justify-center"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {/* Indigo→cyan halo icon */}
        <div className="flex items-center justify-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[var(--brand-coral)] to-[var(--brand-accent-2)] flex items-center justify-center shadow-[0_4px_12px_rgba(79,70,229,0.25)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
              <path d="M2 17l10 5 10-5M2 12l10 5 10-5M12 2L2 7l10 5 10-5-10-5z" />
            </svg>
          </div>
        </div>

        <div className="text-center space-y-1.5">
          <h2 className="text-[22px] sm:text-[22px] font-semibold tracking-[-0.025em] text-foreground">
            {copy.headline}
          </h2>
          <p className="text-[14.5px] sm:text-[14px] text-muted-foreground leading-snug max-w-[360px] mx-auto">
            {copy.sub}
          </p>
        </div>

        <ul className="space-y-2.5 sm:space-y-2 pt-1">
          {PERKS.map((perk) => (
            <li
              key={perk}
              className="flex items-start gap-2.5 text-[14px] sm:text-[13.5px] text-foreground/85 leading-snug"
            >
              <svg className="w-4 h-4 mt-0.5 text-[var(--brand-coral)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              {perk}
            </li>
          ))}
        </ul>

        <div className="pt-2 space-y-2.5 sm:space-y-2">
          <UpgradeCta reason={reason} />
          <button
            type="button"
            onClick={onClose}
            // Bigger tap target on mobile — full-width minimum 44px.
            className="block w-full py-2 text-[13px] sm:text-[12px] text-muted-foreground/70 hover:text-muted-foreground active:text-foreground transition-colors"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Primary CTA inside the upgrade modal. Tries to start Stripe Checkout
 * directly. If billing isn't configured yet, the endpoint responds 503
 * and we fall through to the /pricing page. 401 bounces through
 * /sign-in with next=/pricing.
 */
function UpgradeCta({ reason }: { reason: UpgradeReason }) {
  const [loading, setLoading] = useState(false);

  async function go() {
    if (loading) return;
    setLoading(true);
    track("upgrade.modal.cta", { reason });
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval: "monthly" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.url) {
        window.location.href = data.url as string;
        return;
      }
      if (res.status === 401) {
        window.location.href = "/sign-in?next=/pricing";
        return;
      }
      window.location.href = "/pricing";
    } catch {
      window.location.href = "/pricing";
    }
  }

  return (
    <button
      type="button"
      onClick={go}
      disabled={loading}
      // 52px on mobile (Apple HIG comfortable tap target), 44 on desktop.
      className="block w-full h-[52px] sm:h-11 rounded-2xl sm:rounded-xl bg-foreground text-background font-semibold text-[15px] sm:text-[14px] tracking-[-0.01em] disabled:opacity-60 hover:bg-foreground/90 active:scale-[0.98] transition-all duration-150 text-center"
    >
      {loading ? "Opening Stripe…" : "Upgrade to Pro"}
    </button>
  );
}
