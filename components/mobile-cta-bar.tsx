"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * MobileCtaBar — floating action bar pinned to the bottom of the
 * viewport on small screens. Catches users who scrolled past the
 * primary CTA in the hero and would otherwise have to scroll all the
 * way back up to act.
 *
 * Two modes:
 *
 *   <MobileCtaBar targetSelector="#audit-input" />
 *     Scrolls to the in-page selector and focuses the first input.
 *     Use on pages where the audit form is on the same page.
 *
 *   <MobileCtaBar href="/?url=casper.com" />
 *     Navigates to a URL. Use on pages where the audit lives elsewhere
 *     (e.g. brand detail pages routing users to the homepage form).
 *
 *   • Hidden until the user scrolls past `showAfter` pixels (default
 *     500). Avoids covering the hero on initial load.
 *   • Hides on md+ so desktop is unaffected.
 *   • Bottom-safe-area aware so the pill never hides behind the iOS
 *     home indicator.
 *   • Bold dark background — this is the "you came here to audit
 *     something, here's the button" moment.
 */

interface MobileCtaBarProps {
  /** Button label. Keep short — ideally 2-3 words. */
  label?: string;
  /** Anchor / input selector to scroll to (and focus if it's an input). */
  targetSelector?: string;
  /** URL to navigate to. Takes precedence over targetSelector. */
  href?: string;
  /** Show only once the user has scrolled past this many pixels. */
  showAfter?: number;
}

export function MobileCtaBar({
  label = "Audit my brand",
  targetSelector,
  href,
  showAfter = 500,
}: MobileCtaBarProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > showAfter);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [showAfter]);

  const handleTap = () => {
    if (targetSelector) {
      const target = document.querySelector(targetSelector);
      if (target instanceof HTMLElement) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        // After the scroll lands, focus the first input so the
        // mobile keyboard pops up automatically.
        setTimeout(() => {
          const input =
            target instanceof HTMLInputElement
              ? target
              : target.querySelector<HTMLInputElement>("input, textarea");
          input?.focus();
        }, 450);
        return;
      }
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const baseClass =
    "pointer-events-auto w-full inline-flex items-center justify-center gap-2 h-12 rounded-full bg-foreground text-background text-[15px] font-semibold tracking-[-0.01em] shadow-[0_10px_30px_-8px_rgba(15,23,42,0.4)] active:scale-[0.98] transition-transform";

  const arrow = (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );

  return (
    <div
      className={`md:hidden fixed inset-x-0 bottom-0 z-30 px-4 transition-all duration-300 ease-out pointer-events-none ${
        visible ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
      }`}
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 16px)" }}
      aria-hidden={!visible}
    >
      {href ? (
        <Link href={href} className={baseClass}>
          {label}
          {arrow}
        </Link>
      ) : (
        <button type="button" onClick={handleTap} className={baseClass}>
          {label}
          {arrow}
        </button>
      )}
    </div>
  );
}
