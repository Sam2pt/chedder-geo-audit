import Link from "next/link";
import { Logo } from "./logo";

/**
 * SiteFooter — minimalist footer used at the bottom of every page.
 *
 * Mirrors the TopNav's restraint: brand on the left, link group on the
 * right, hairline divider, soft muted text. No giant multi-column
 * sitemap — at our content size that would be filler. When we grow
 * to needing one (e.g. /resources, /api docs, /changelog), promote
 * this to a richer layout then.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-foreground/[0.06] mt-auto">
      <div className="max-w-[1180px] mx-auto px-5 sm:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-5">
        <div className="flex items-center gap-3">
          <Logo size="sm" />
          <span className="text-[12.5px] text-foreground/45">
            · Made by{" "}
            <a
              href="https://twopointtechnologies.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              Two Point Technologies
            </a>
          </span>
        </div>

        <nav className="flex items-center gap-5 text-[12.5px] text-foreground/45">
          <Link href="/brand" className="hover:text-foreground transition-colors">
            Brands
          </Link>
          <Link href="/blog" className="hover:text-foreground transition-colors">
            Blog
          </Link>
          <Link href="/pricing" className="hover:text-foreground transition-colors">
            Pricing
          </Link>
          <Link href="/sign-in" className="hover:text-foreground transition-colors">
            Sign in
          </Link>
          <Link href="/privacy" className="hover:text-foreground transition-colors">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-foreground transition-colors">
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}
