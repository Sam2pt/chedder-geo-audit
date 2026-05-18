"use client";

import { useEffect } from "react";
import { track } from "@/lib/track";

/**
 * Upgrade modal — shown when a free user hits a Pro-gated action
 * (running a 2nd+ audit, opening competitor compare, exporting PDF).
 *
 * Today this is a soft prompt: lists the Pro perks and points the user
 * at a "Notify me when Pro is live" CTA. When Stripe is wired the
 * primary button swaps to "Upgrade to Pro" and routes to /pricing or
 * directly to Checkout.
 *
 * Renders nothing when `open` is false. Parent owns open/close state.
 *
 * The `reason` controls the headline so the modal feels contextual:
 *   • audit_limit    — "You've used your free audit"
 *   • competitors    — "Compare against competitors"
 *   • pdf            — "Take this report home"
 *   • generic        — "Unlock unlimited Chedder"
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
  // Track when the modal opens so we know which gates are converting.
  useEffect(() => {
    if (open) track("upgrade.modal.shown", { reason });
  }, [open, reason]);

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
      className="fixed inset-0 z-[60] flex items-center justify-center px-4 bg-foreground/40 backdrop-blur-sm animate-[fadeIn_180ms_ease-out]"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[460px] rounded-[22px] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.22)] p-7 sm:p-8 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 w-7 h-7 rounded-lg text-foreground/50 hover:text-foreground hover:bg-foreground/[0.05] transition-colors flex items-center justify-center"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {/* Indigo/cyan halo icon */}
        <div className="flex items-center justify-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[var(--brand-coral)] to-[var(--brand-accent-2)] flex items-center justify-center shadow-[0_4px_12px_rgba(79,70,229,0.25)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
              <path d="M2 17l10 5 10-5M2 12l10 5 10-5M12 2L2 7l10 5 10-5-10-5z" />
            </svg>
          </div>
        </div>

        <div className="text-center space-y-1.5">
          <h2 className="text-[22px] font-semibold tracking-[-0.025em] text-foreground">
            {copy.headline}
          </h2>
          <p className="text-[14px] text-muted-foreground leading-snug max-w-[360px] mx-auto">
            {copy.sub}
          </p>
        </div>

        <ul className="space-y-2 pt-1">
          {PERKS.map((perk) => (
            <li key={perk} className="flex items-start gap-2.5 text-[13.5px] text-foreground/85">
              <svg className="w-4 h-4 mt-0.5 text-[var(--brand-coral)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              {perk}
            </li>
          ))}
        </ul>

        <div className="pt-2 space-y-2">
          {/* Until Stripe is wired this routes to a coming-soon page that
              captures interest. Once Checkout is live this becomes a
              direct redirect to the Checkout session. */}
          <a
            href="/pricing"
            onClick={() => track("upgrade.modal.cta", { reason })}
            className="block w-full h-11 rounded-xl bg-foreground text-background font-semibold text-[14px] tracking-[-0.01em] hover:bg-foreground/90 transition-colors text-center leading-[44px]"
          >
            See Pro pricing
          </a>
          <button
            type="button"
            onClick={onClose}
            className="block w-full text-[12px] text-muted-foreground/70 hover:text-muted-foreground transition-colors"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
