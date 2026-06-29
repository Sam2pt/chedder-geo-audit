import type { Metadata } from "next";
import Link from "next/link";
import { brandsByCategory } from "@/lib/brands";
import { TopNav } from "@/components/top-nav";
import { SiteFooter } from "@/components/site-footer";

/**
 * /brand — directory of every brand we have a programmatic page for.
 * Grouped by category with anchor links so /brand#beauty deep-links
 * into a category section. Crawlers see the full taxonomy on one
 * page, which helps Google's understanding of the site's topical
 * structure and accelerates indexing of the individual brand pages.
 */

export const metadata: Metadata = {
  title: "CPG brands in AI search · Chedder",
  description:
    "Explore how leading consumer brands show up when shoppers ask ChatGPT, Perplexity, and Brave for recommendations. Run a free AI visibility audit on any of them.",
};

export default function BrandIndex() {
  const groups = brandsByCategory();
  const total = groups.reduce((sum, g) => sum + g.brands.length, 0);

  return (
    <div className="min-h-screen flex flex-col">
    <TopNav variant="solid" />
    <main className="flex-1 px-6 py-16">
      <article className="max-w-[860px] mx-auto">
        <header className="mb-12 space-y-3">
          <h1 className="text-[40px] sm:text-[48px] font-semibold tracking-[-0.025em] text-foreground leading-[1.05]">
            CPG brands in <span className="bg-gradient-to-r from-[var(--brand-coral)] to-[var(--brand-accent-2)] bg-clip-text text-transparent">AI search</span>
          </h1>
          <p className="text-[16px] text-muted-foreground leading-[1.55] max-w-[600px]">
            {total} consumer brands across {groups.length} categories. Each page
            shows how shoppers ask AI for recommendations in that category, plus
            a one-click audit to see where the brand actually ranks.
          </p>
        </header>

        {groups.length > 0 && (
          <nav className="mb-12 flex flex-wrap gap-2">
            {groups.map(({ category }) => (
              <a
                key={category.key}
                href={`#${category.key}`}
                className="px-3 py-1.5 rounded-full bg-foreground/[0.04] hover:bg-foreground/[0.08] text-[12.5px] font-medium text-foreground/75 hover:text-foreground transition-colors"
              >
                {category.label}
              </a>
            ))}
          </nav>
        )}

        <div className="space-y-12">
          {groups.map(({ category, brands }) => (
            <section
              key={category.key}
              id={category.key}
              className="scroll-mt-20"
            >
              <h2 className="text-[24px] font-semibold tracking-[-0.015em] text-foreground mb-1">
                {category.label}
              </h2>
              <p className="text-[14px] text-muted-foreground mb-5">
                {brands.length} {brands.length === 1 ? "brand" : "brands"}
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {brands.map((b) => (
                  <li key={b.slug}>
                    <Link
                      href={`/brand/${b.slug}`}
                      className="group block p-5 rounded-2xl bg-white border border-foreground/[0.06] hover:border-foreground/[0.15] hover:shadow-[0_4px_16px_rgba(0,0,0,0.04)] transition-all"
                    >
                      <p className="text-[16px] font-semibold tracking-[-0.01em] text-foreground group-hover:text-[var(--brand-coral)] transition-colors">
                        {b.name}
                      </p>
                      <p className="text-[12.5px] text-muted-foreground mt-1">
                        {b.domain}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <footer className="mt-16 pt-10 border-t border-foreground/[0.06]">
          <div className="p-6 rounded-2xl bg-gradient-to-br from-[var(--brand-coral)]/10 via-[var(--brand-accent-2)]/5 to-transparent border border-foreground/[0.06]">
            <p className="text-[15px] font-semibold text-foreground mb-2">
              Don&apos;t see your brand?
            </p>
            <p className="text-[14px] text-muted-foreground leading-[1.6] mb-4">
              Run a free audit on any consumer brand URL. Chedder works for
              every CPG site, even ones we haven&apos;t profiled yet.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-foreground text-background text-[14px] font-semibold tracking-[-0.01em] hover:bg-foreground/90 transition-colors"
            >
              Audit your brand
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
            </Link>
          </div>
        </footer>
      </article>
    </main>
    <SiteFooter />
    </div>
  );
}
