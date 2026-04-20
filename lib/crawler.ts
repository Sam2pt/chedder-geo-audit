/**
 * Light internal-link discovery for multi-page audits.
 *
 * We only audit the homepage today, which under-scores any CPG brand whose
 * product/FAQ/about pages carry the richer schema, reviews, and FAQ content.
 * This module picks a small set of high-value internal paths to fetch
 * alongside the homepage so the Schema and Content analyzers can aggregate
 * a realistic picture of the site.
 *
 * Returns absolute URLs, same-origin only, deduped, with the homepage
 * always first. Capped at a small budget so total audit latency stays
 * under ~5s extra even at 4 concurrent fetches.
 */
import type { CheerioAPI } from "cheerio";

/** URL paths we actively prefer when ranking internal links. */
const PREFERRED_PATH_PATTERNS: Array<{ pattern: RegExp; score: number }> = [
  // Product and catalog pages carry the richest schema + content
  { pattern: /\/products?\/[\w-]+/i, score: 10 },
  { pattern: /\/shop\/[\w-]+/i, score: 9 },
  { pattern: /\/collections?\/[\w-]+/i, score: 8 },
  // Answer-heavy informational pages
  { pattern: /\/faq\b|\/help\b|\/support\b|\/questions?\b/i, score: 9 },
  // Brand story / authority signals
  { pattern: /\/about\b|\/our-story\b|\/company\b|\/story\b/i, score: 7 },
  // Detail pages that tend to host AggregateRating / Review schema
  { pattern: /\/reviews?\b|\/testimonials?\b/i, score: 8 },
  // Ingredient / spec pages common in food + beauty CPG
  { pattern: /\/ingredients?\b|\/nutrition\b|\/specs?\b|\/materials?\b/i, score: 7 },
  // Contact pages count as mild authority signal
  { pattern: /\/contact\b/i, score: 5 },
];

/** URL paths we skip outright (transactional, legal, or low-signal). */
const SKIP_PATH_PATTERNS: RegExp[] = [
  /\/cart\b|\/checkout\b|\/basket\b/i,
  /\/account\b|\/login\b|\/signin\b|\/signup\b|\/register\b/i,
  /\/privacy\b|\/terms\b|\/tos\b|\/legal\b|\/cookie/i,
  /\/search\b/i,
  // Heavy deboost on deep blog posts — there are too many and each is noisy.
  /\/blog\/[\w-]+\/[\w-]+/i,
  // Asset/feed paths
  /\.(xml|json|rss|atom|pdf|zip|tar|gz)(\?|$)/i,
  // Common locale-duplicate patterns like /en-us/cart
  /\/(cart|checkout|account)/i,
];

/** Path must match this regex loosely to be considered an HTML page. */
const HTML_PATH = /^\/(?!.*\.[a-z]{2,5}(\?|$))[^#?]*$/i;

export interface DiscoveredLink {
  url: string;
  path: string;
  score: number;
  anchorText: string;
}

/**
 * Rank internal links on the homepage so we can pick the most informative
 * set to crawl. `limit` is the number of non-homepage URLs to return.
 */
export function discoverInternalLinks(
  $: CheerioAPI,
  origin: string,
  homepageUrl: string,
  limit = 3
): DiscoveredLink[] {
  const home = new URL(homepageUrl);
  const originHost = home.host;
  const seen = new Set<string>();
  const ranked: DiscoveredLink[] = [];

  $("a[href]").each((_, el) => {
    const rawHref = $(el).attr("href");
    if (!rawHref) return;
    let absolute: URL;
    try {
      absolute = new URL(rawHref, origin);
    } catch {
      return;
    }
    if (absolute.host !== originHost) return;
    if (absolute.pathname === "/" || absolute.pathname === home.pathname) return;

    const normalized = `${absolute.origin}${absolute.pathname}`.replace(/\/$/, "");
    if (seen.has(normalized)) return;
    if (!HTML_PATH.test(absolute.pathname)) return;
    if (SKIP_PATH_PATTERNS.some((re) => re.test(absolute.pathname))) return;

    seen.add(normalized);

    // Score by preferred path match, plus a small bonus for anchor text
    // that looks informative rather than "Click here".
    let score = 0;
    for (const { pattern, score: s } of PREFERRED_PATH_PATTERNS) {
      if (pattern.test(absolute.pathname)) {
        score = Math.max(score, s);
      }
    }
    // Depth penalty — shallow paths usually more canonical.
    const depth = absolute.pathname.split("/").filter(Boolean).length;
    score -= Math.max(0, depth - 2);

    const anchorText = $(el).text().trim().slice(0, 60);
    if (score <= 0 && anchorText.length < 4) return;

    ranked.push({
      url: normalized,
      path: absolute.pathname,
      score,
      anchorText,
    });
  });

  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, limit);
}
