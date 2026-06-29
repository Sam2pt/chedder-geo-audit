"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "./logo";

/**
 * TopNav — sticky site navigation.
 *
 *   <TopNav />                 // default
 *   <TopNav variant="solid" /> // immediately solid (use on /pricing, /blog, etc.)
 *
 * Two visual states:
 *   • "auto"  (default) — transparent on the homepage hero, solidifies
 *                         after the user scrolls past ~40px. Avoids
 *                         the "stripe under the hero" look on landing.
 *   • "solid"           — always solid white with a hairline divider.
 *                         Use on every non-hero page so the nav reads
 *                         as a chrome layer, not part of the content.
 *
 * Nav order is deliberate: marketing → product surfaces → conversion.
 * Pricing and the primary CTA sit closest to the right edge where the
 * thumb / cursor naturally lands. Sign-in stays adjacent for return
 * visitors so it isn't buried in a menu.
 *
 * The primary CTA stays "Run a free audit" not "Sign up" because the
 * audit IS the activation event — users don't sign up to use Chedder,
 * they get a result first and convert during it.
 */

interface TopNavProps {
  variant?: "auto" | "solid";
}

const NAV_LINKS = [
  { label: "Brands", href: "/brand" },
  { label: "Blog", href: "/blog" },
  { label: "Pricing", href: "/pricing" },
];

export function TopNav({ variant = "auto" }: TopNavProps) {
  const [scrolled, setScrolled] = useState(variant === "solid");

  useEffect(() => {
    if (variant === "solid") return;
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [variant]);

  const solid = scrolled;

  return (
    <header
      className={`sticky top-0 z-40 transition-[background-color,border-color,backdrop-filter] duration-200 ${
        solid
          ? "bg-white/85 backdrop-blur-md border-b border-foreground/[0.06]"
          : "bg-transparent border-b border-transparent"
      }`}
    >
      <nav className="max-w-[1180px] mx-auto px-5 sm:px-8 h-[60px] flex items-center justify-between">
        {/* Brand */}
        <Logo size="md" />

        {/* Center nav — hidden on small screens, simplified mobile menu */}
        <ul className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="text-[14px] font-medium text-foreground/65 hover:text-foreground transition-colors"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        {/* Right CTAs */}
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/sign-in"
            className="hidden sm:inline-flex items-center h-9 px-3 text-[13px] font-medium text-foreground/70 hover:text-foreground transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/"
            className="inline-flex items-center h-9 px-4 rounded-full bg-foreground text-background text-[13px] font-semibold tracking-[-0.005em] hover:bg-foreground/90 transition-colors"
          >
            Free audit
          </Link>
        </div>
      </nav>
    </header>
  );
}
