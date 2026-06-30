import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getBrand,
  getCategory,
  listBrands,
  siblingBrands,
} from "@/lib/brands";
import { TopNav } from "@/components/top-nav";
import { SiteFooter } from "@/components/site-footer";
import { MobileCtaBar } from "@/components/mobile-cta-bar";

/**
 * Programmatic SEO landing page per CPG brand.
 *
 *   /brand/<slug>
 *
 * Each page targets the long-tail query "[Brand] AI search visibility"
 * and gives genuinely useful content: a real category-specific prompt
 * list, a brand-specific blurb, a strong CTA to run a fresh Chedder
 * audit on that brand's domain, and internal links to siblings in the
 * same category so crawlers see topical clustering.
 *
 * Pages are pre-rendered at build time via generateStaticParams so
 * they're served as static HTML with no per-request cost.
 */

interface Params {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return listBrands().map((b) => ({ slug: b.slug }));
}

export async function generateMetadata({
  params,
}: Params): Promise<Metadata> {
  const { slug } = await params;
  const brand = getBrand(slug);
  if (!brand) return { title: "Brand not found" };
  const cat = getCategory(brand.category);
  const catLabel = cat?.label ?? "AI search";
  return {
    title: `${brand.name} in AI search: how it shows up · Chedder`,
    description: `Does ${brand.name} show up when shoppers ask ChatGPT, Perplexity, and Brave for ${catLabel.toLowerCase()} recommendations? Run a free AI visibility audit on ${brand.domain}.`,
    openGraph: {
      title: `${brand.name} in AI search`,
      description: `How ${brand.name} appears when shoppers ask AI for ${catLabel.toLowerCase()} recommendations.`,
      type: "article",
    },
  };
}

export default async function BrandPage({ params }: Params) {
  const { slug } = await params;
  const brand = getBrand(slug);
  if (!brand) notFound();

  const category = getCategory(brand.category);
  const siblings = siblingBrands(slug);
  const auditHref = `/?url=${encodeURIComponent(`https://${brand.domain}`)}`;

  return (
    <div className="min-h-screen flex flex-col">
    <TopNav variant="solid" />
    <main className="flex-1 px-6 py-16">
      <article className="max-w-[760px] mx-auto">
        <header className="mb-10 space-y-4">
          <Link
            href="/brand"
            className="text-[13px] text-muted-foreground hover:text-foreground transition-colors"
          >
            ← All brands
          </Link>
          {category && (
            <Link
              href={`/brand#${category.key}`}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-foreground/[0.04] text-[12px] font-medium text-foreground/70 hover:bg-foreground/[0.08] transition-colors"
            >
              {category.label}
            </Link>
          )}
          <h1 className="text-[40px] sm:text-[48px] font-semibold tracking-[-0.025em] text-foreground leading-[1.05]">
            How does <span className="bg-gradient-to-r from-[var(--brand-coral)] to-[var(--brand-accent-2)] bg-clip-text text-transparent">{brand.name}</span> show up in AI search?
          </h1>
          <p className="text-[18px] text-muted-foreground leading-[1.55]">
            {brand.blurb} When shoppers ask ChatGPT or Perplexity for a recommendation
            {category ? ` in ${category.label.toLowerCase()}` : ""}, here&apos;s what we can check.
          </p>
        </header>

        <section className="mt-10 p-6 rounded-2xl bg-gradient-to-br from-[var(--brand-coral)]/8 via-[var(--brand-accent-2)]/4 to-transparent border border-foreground/[0.06]">
          <p className="text-[15px] font-semibold text-foreground mb-2">
            Run a free AI visibility audit on {brand.domain}
          </p>
          <p className="text-[14px] text-muted-foreground leading-[1.6] mb-4">
            Chedder runs real shopper prompts against ChatGPT, Perplexity, and
            Brave Search, then reports who got recommended and where{" "}
            {brand.name} ranks. Audits take under a minute. Free for your first one.
          </p>
          <Link
            href={auditHref}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-foreground text-background text-[14px] font-semibold tracking-[-0.01em] hover:bg-foreground/90 transition-colors"
          >
            Audit {brand.name}
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
        </section>

        {category && (
          <section className="mt-12">
            <h2 className="text-[24px] font-semibold tracking-[-0.015em] text-foreground mb-3">
              What shoppers ask AI about {category.label.toLowerCase()}
            </h2>
            <p className="text-[15px] text-muted-foreground leading-[1.6] mb-5">
              {category.questionsLeadIn}
            </p>
            <ul className="space-y-2">
              {category.prompts.map((prompt) => (
                <li
                  key={prompt}
                  className="flex items-start gap-3 p-3.5 rounded-xl bg-white border border-foreground/[0.06] text-[14.5px] text-foreground/85 leading-[1.5]"
                >
                  <svg
                    className="w-4 h-4 mt-0.5 text-foreground/30 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                  </svg>
                  <span>{prompt}</span>
                </li>
              ))}
            </ul>
            <p className="text-[13px] text-muted-foreground mt-4">
              Chedder runs prompts like these and shows you exactly which brands
              get named in the answers, plus what {brand.name} would need to fix
              to be on the list.
            </p>
          </section>
        )}

        <section className="mt-12">
          <h2 className="text-[24px] font-semibold tracking-[-0.015em] text-foreground mb-4">
            What a Chedder audit checks on {brand.name}
          </h2>
          <ul className="space-y-3">
            <li className="flex items-start gap-3 text-[15px] text-foreground/85 leading-[1.6]">
              <span className="mt-1 text-[var(--brand-coral)] font-semibold">·</span>
              <span>
                <strong className="text-foreground">Real AI answers.</strong>{" "}
                We run category-specific shopper prompts on ChatGPT and AI
                search, then report who got recommended and who didn&apos;t.
              </span>
            </li>
            <li className="flex items-start gap-3 text-[15px] text-foreground/85 leading-[1.6]">
              <span className="mt-1 text-[var(--brand-coral)] font-semibold">·</span>
              <span>
                <strong className="text-foreground">
                  The structured data AI reads first.
                </strong>{" "}
                Schema, JSON-LD, OpenGraph — the metadata wrapper AI engines
                unwrap before they read the page itself.
              </span>
            </li>
            <li className="flex items-start gap-3 text-[15px] text-foreground/85 leading-[1.6]">
              <span className="mt-1 text-[var(--brand-coral)] font-semibold">·</span>
              <span>
                <strong className="text-foreground">
                  External brand signals.
                </strong>{" "}
                Wikipedia, Reddit, review citations — the corroborating voices
                AI engines quietly lean on when forming a recommendation.
              </span>
            </li>
            <li className="flex items-start gap-3 text-[15px] text-foreground/85 leading-[1.6]">
              <span className="mt-1 text-[var(--brand-coral)] font-semibold">·</span>
              <span>
                <strong className="text-foreground">Crawler access.</strong> Is
                GPTBot welcome on {brand.domain}? ClaudeBot? PerplexityBot?
                Blocked crawlers mean invisible brand.
              </span>
            </li>
            <li className="flex items-start gap-3 text-[15px] text-foreground/85 leading-[1.6]">
              <span className="mt-1 text-[var(--brand-coral)] font-semibold">·</span>
              <span>
                <strong className="text-foreground">A scored action plan.</strong>{" "}
                Prioritized fixes written for brand marketers, not server
                administrators.
              </span>
            </li>
          </ul>
        </section>

        {siblings.length > 0 && category && (
          <section className="mt-14 pt-10 border-t border-foreground/[0.06]">
            <h2 className="text-[20px] font-semibold tracking-[-0.015em] text-foreground mb-4">
              Other {category.label.toLowerCase()} brands
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {siblings.map((s) => (
                <Link
                  key={s.slug}
                  href={`/brand/${s.slug}`}
                  className="px-4 py-3 rounded-xl bg-white border border-foreground/[0.06] hover:border-foreground/[0.15] hover:shadow-sm transition-all text-[14px] font-medium text-foreground"
                >
                  {s.name}
                </Link>
              ))}
            </div>
          </section>
        )}

        <footer className="mt-14 pt-10 border-t border-foreground/[0.06]">
          <div className="p-6 rounded-2xl bg-gradient-to-br from-[var(--brand-coral)]/10 via-[var(--brand-accent-2)]/5 to-transparent border border-foreground/[0.06]">
            <p className="text-[15px] font-semibold text-foreground mb-2">
              See where {brand.name} actually ranks
            </p>
            <p className="text-[14px] text-muted-foreground leading-[1.6] mb-4">
              The numbers update every time the audit runs. Try it on your own
              brand next.
            </p>
            <Link
              href={auditHref}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-foreground text-background text-[14px] font-semibold tracking-[-0.01em] hover:bg-foreground/90 transition-colors"
            >
              Run the audit
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
          <p className="text-[13px] text-muted-foreground mt-4">
            Chedder is built by{" "}
            <a
              href="https://twopointtechnologies.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--brand-coral)] hover:underline"
            >
              Two Point Technologies
            </a>
            , a small team helping consumer brands win the next era of search.
          </p>
        </footer>
      </article>
    </main>
    <SiteFooter />
    {/* Mobile-only sticky CTA — routes to the homepage audit form
        with this brand's domain prefilled via ?url=. */}
    <MobileCtaBar label={`Audit ${brand.name}`} href={auditHref} />
    </div>
  );
}
