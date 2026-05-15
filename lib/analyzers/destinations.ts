/**
 * Where AI sends people.
 *
 * Every AI engine that mentions a brand cites a list of URLs. We
 * already capture those (`response.citations` from each engine query).
 * This module classifies them and tells the brand owner where AI is
 * actually pointing customers:
 *
 *   • Their own site
 *   • Marketplaces (Amazon, Walmart, Target, etc.)
 *   • Competitor brands
 *   • Publishers and review sites (Wirecutter, Forbes, RTINGS, etc.)
 *   • Community (Reddit, Quora, YouTube, social)
 *   • Knowledge (Wikipedia)
 *
 * The insight: a brand can be "mentioned" by AI and still lose the
 * direct customer relationship because the citation goes to Amazon,
 * not to their .com. This is GEO's marketplace shadow problem.
 */

export type DestinationKind =
  | "own"
  | "marketplace"
  | "competitor"
  | "publisher"
  | "community"
  | "review"
  | "knowledge"
  | "other";

export interface DestinationBucket {
  kind: DestinationKind;
  /** Canonical host (e.g. "amazon.com", "casper.com"). */
  domain: string;
  count: number;
  /** Fraction of total citations (0..1). */
  share: number;
  /** Up to 3 full URLs seen in this bucket, for spot-checking. */
  examples: string[];
}

export interface DestinationKindRow {
  kind: DestinationKind;
  count: number;
  share: number;
}

export interface DestinationAnalysis {
  /** Total citation URLs analyzed across all AI queries. */
  totalCitations: number;
  /** Counts and shares grouped by destination kind, sorted desc. */
  byKind: DestinationKindRow[];
  /** Top individual destinations (host-level), sorted desc, capped at 12. */
  topDomains: DestinationBucket[];
  ownShare: number;
  marketplaceShare: number;
  competitorShare: number;
  /** Single most actionable framing of what the breakdown means. */
  headline: string;
}

// Hand-curated host lists. Conservative on purpose so we mis-classify
// less. Hosts not in any list fall through to "other" rather than
// being shoehorned into a bucket they don't really belong in.

const MARKETPLACES: ReadonlySet<string> = new Set([
  // Amazon (regional storefronts)
  "amazon.com",
  "amazon.co.uk",
  "amazon.ca",
  "amazon.de",
  "amazon.fr",
  "amazon.es",
  "amazon.it",
  "amazon.com.au",
  "amazon.in",
  "amazon.co.jp",
  "amazon.com.mx",
  "amazon.com.br",
  // Big-box and generalist
  "walmart.com",
  "target.com",
  "costco.com",
  "samsclub.com",
  "bestbuy.com",
  "homedepot.com",
  "lowes.com",
  "kohls.com",
  "macys.com",
  "nordstrom.com",
  "saksfifthavenue.com",
  // Marketplaces
  "etsy.com",
  "ebay.com",
  "ebay.co.uk",
  "wayfair.com",
  "overstock.com",
  "wish.com",
  "aliexpress.com",
  "alibaba.com",
  "temu.com",
  "shein.com",
  // Beauty / personal care
  "sephora.com",
  "ulta.com",
  // Grocery and health
  "instacart.com",
  "thrivemarket.com",
  "iherb.com",
  "vitacost.com",
  "wholefoodsmarket.com",
  // Pet
  "chewy.com",
  "petco.com",
  "petsmart.com",
  // Outdoor / sport
  "rei.com",
  "backcountry.com",
  "dickssportinggoods.com",
  // Generic Shopify-hosted stores
  "myshopify.com",
]);

const PUBLISHERS: ReadonlySet<string> = new Set([
  // Tech / reviews
  "wirecutter.com",
  "nytimes.com",
  "thewirecutter.com",
  "rtings.com",
  "cnet.com",
  "tomsguide.com",
  "tomshardware.com",
  "theverge.com",
  "wired.com",
  "engadget.com",
  "techcrunch.com",
  "techradar.com",
  "pcmag.com",
  "digitaltrends.com",
  "androidcentral.com",
  "9to5mac.com",
  "9to5google.com",
  // Consumer reports / shopping reviews
  "consumerreports.org",
  "consumer-reports.org",
  "thespruce.com",
  "thespruceeats.com",
  "thespruceforpets.com",
  "thespruceshop.com",
  "goodhousekeeping.com",
  "thekitchn.com",
  "seriouseats.com",
  "epicurious.com",
  "bonappetit.com",
  "foodnetwork.com",
  "delish.com",
  "tasteofhome.com",
  // Business / lifestyle / men's / women's
  "forbes.com",
  "wsj.com",
  "businessinsider.com",
  "fastcompany.com",
  "marketwatch.com",
  "fortune.com",
  "gq.com",
  "esquire.com",
  "menshealth.com",
  "mensjournal.com",
  "vogue.com",
  "elle.com",
  "glamour.com",
  "allure.com",
  "marieclaire.com",
  "thecut.com",
  "intothegloss.com",
  "byrdie.com",
  // Outdoor / sports
  "outdoorlife.com",
  "fieldandstream.com",
  "outsideonline.com",
  "runnersworld.com",
  "bicycling.com",
  // News
  "cnn.com",
  "nbcnews.com",
  "abcnews.com",
  "cbsnews.com",
  "today.com",
  "huffpost.com",
  "bbc.com",
  "rollingstone.com",
  "people.com",
  // Pet
  "thedrake.com",
  "petfinder.com",
  "thesprucepets.com",
  "rover.com",
]);

const COMMUNITY: ReadonlySet<string> = new Set([
  "reddit.com",
  "old.reddit.com",
  "redd.it",
  "quora.com",
  "stackexchange.com",
  "stackoverflow.com",
  "tiktok.com",
  "youtube.com",
  "youtu.be",
  "facebook.com",
  "instagram.com",
  "x.com",
  "twitter.com",
  "t.co",
  "linkedin.com",
  "pinterest.com",
  "medium.com",
  "substack.com",
]);

const REVIEWS: ReadonlySet<string> = new Set([
  "trustpilot.com",
  "sitejabber.com",
  "yelp.com",
  "bbb.org",
  "consumeraffairs.com",
  "influenster.com",
  "makeupalley.com",
  "tripadvisor.com",
  "google.com/maps",
]);

const KNOWLEDGE: ReadonlySet<string> = new Set([
  "wikipedia.org",
  "en.wikipedia.org",
  "wikidata.org",
  "britannica.com",
]);

function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    let h = u.hostname.toLowerCase();
    if (h.startsWith("www.")) h = h.slice(4);
    return h;
  } catch {
    return null;
  }
}

/**
 * Returns the canonical match if `host` is in `set` OR is a subdomain
 * of any host in `set`. So `smile.amazon.co.uk` returns `amazon.co.uk`.
 */
function matchSet(host: string, set: ReadonlySet<string>): string | null {
  if (set.has(host)) return host;
  for (const s of set) {
    if (host.endsWith("." + s)) return s;
  }
  return null;
}

function classify(
  host: string,
  brandHost: string,
  competitorSet: Set<string>
): { kind: DestinationKind; domain: string } {
  // Own brand (and subdomains thereof)
  if (host === brandHost || host.endsWith("." + brandHost)) {
    return { kind: "own", domain: brandHost };
  }
  // Competitor brand
  for (const c of competitorSet) {
    if (host === c || host.endsWith("." + c)) {
      return { kind: "competitor", domain: c };
    }
  }
  // Marketplaces / publishers / community / reviews / knowledge
  const mp = matchSet(host, MARKETPLACES);
  if (mp) return { kind: "marketplace", domain: mp };
  const pb = matchSet(host, PUBLISHERS);
  if (pb) return { kind: "publisher", domain: pb };
  const co = matchSet(host, COMMUNITY);
  if (co) return { kind: "community", domain: co };
  const rv = matchSet(host, REVIEWS);
  if (rv) return { kind: "review", domain: rv };
  const kn = matchSet(host, KNOWLEDGE);
  if (kn) return { kind: "knowledge", domain: kn };
  return { kind: "other", domain: host };
}

export function analyzeDestinations(
  citations: ReadonlyArray<string>,
  brandDomain: string,
  competitorDomains: ReadonlyArray<string> = []
): DestinationAnalysis | null {
  if (!citations || citations.length === 0) return null;

  const brandHost = brandDomain.toLowerCase().replace(/^www\./, "");
  const competitorSet = new Set(
    competitorDomains.map((d) => d.toLowerCase().replace(/^www\./, ""))
  );

  const buckets = new Map<string, DestinationBucket>();
  let total = 0;

  for (const url of citations) {
    const host = hostOf(url);
    if (!host) continue;
    total++;
    const { kind, domain } = classify(host, brandHost, competitorSet);
    const key = `${kind}|${domain}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { kind, domain, count: 0, share: 0, examples: [] };
      buckets.set(key, bucket);
    }
    bucket.count++;
    if (bucket.examples.length < 3) bucket.examples.push(url);
  }

  if (total === 0) return null;

  for (const b of buckets.values()) b.share = b.count / total;

  const topDomains = [...buckets.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  // Aggregate by kind
  const kindCounts = new Map<DestinationKind, number>();
  for (const b of buckets.values()) {
    kindCounts.set(b.kind, (kindCounts.get(b.kind) || 0) + b.count);
  }
  const byKind: DestinationKindRow[] = [...kindCounts.entries()]
    .map(([kind, count]) => ({ kind, count, share: count / total }))
    .sort((a, b) => b.count - a.count);

  const ownShare = (kindCounts.get("own") || 0) / total;
  const marketplaceShare = (kindCounts.get("marketplace") || 0) / total;
  const competitorShare = (kindCounts.get("competitor") || 0) / total;

  // Pick the most actionable framing. We escalate from "marketplace
  // shadow" (the most damaging, most fixable) → "competitor
  // recommended instead" → "you're the source of truth" → fallbacks.
  const pct = (s: number) => Math.round(s * 100);
  let headline: string;
  if (marketplaceShare >= 0.4) {
    headline = `${pct(marketplaceShare)}% of AI citations point at marketplaces (Amazon, etc.), not your own site. You're losing the direct customer relationship and the margin that comes with it.`;
  } else if (competitorShare >= 0.3) {
    headline = `${pct(competitorShare)}% of AI citations point at competitor brands instead of you. AI is treating them as the answer.`;
  } else if (ownShare >= 0.5) {
    headline = `${pct(ownShare)}% of AI citations link directly to your site. AI treats you as the source of truth for your category. Defend it.`;
  } else if (ownShare === 0 && total >= 5) {
    headline = `Zero AI citations point at your own site. AI is talking about you, but never sending people to you.`;
  } else if (total < 5) {
    headline = `Only ${total} AI citation${total === 1 ? "" : "s"} captured so far. Build content AI can quote (FAQ schema, comparison pages) before worrying where it links.`;
  } else {
    headline = `Citations spread across ${topDomains.length} destinations. No single source dominates.`;
  }

  return {
    totalCitations: total,
    byKind,
    topDomains,
    ownShare,
    marketplaceShare,
    competitorShare,
    headline,
  };
}

/**
 * Human-readable label for a destination kind. Used by the dashboard
 * and PDF report.
 */
export function destinationKindLabel(kind: DestinationKind): string {
  switch (kind) {
    case "own":
      return "Your own site";
    case "marketplace":
      return "Marketplaces";
    case "competitor":
      return "Competitor brands";
    case "publisher":
      return "Publishers and review sites";
    case "community":
      return "Reddit, YouTube, social";
    case "review":
      return "Review aggregators";
    case "knowledge":
      return "Wikipedia and reference";
    case "other":
      return "Other sources";
  }
}

/**
 * Color hex for a destination kind. Matches the Chedder palette in
 * the audit dashboard so the breakdown bar is consistent with the
 * rest of the surface.
 */
export function destinationKindColor(kind: DestinationKind): string {
  switch (kind) {
    case "own":
      return "#7a8b6b"; // green — you own this
    case "marketplace":
      return "#c99b66"; // amber — at-risk, fixable
    case "competitor":
      return "#b5443b"; // red — losing
    case "publisher":
      return "#6f8aab"; // blue — neutral signal
    case "community":
      return "#9a7aa0"; // violet
    case "review":
      return "#c2745f"; // pink
    case "knowledge":
      return "#7a8b6b"; // teal
    case "other":
      return "#8b8b90"; // grey
  }
}
