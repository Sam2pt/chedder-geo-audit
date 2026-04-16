import type { CheerioAPI } from "cheerio";
import { Finding, ModuleResult, Recommendation } from "../types";

/* ── Brand name extraction ────────────────────────────────────────── */

export function extractBrandName($: CheerioAPI, domain: string): string {
  // Try og:site_name first
  const ogSiteName = $('meta[property="og:site_name"]').attr("content")?.trim();
  if (ogSiteName) return ogSiteName;

  // Try Organization schema name
  const jsonLdScripts = $('script[type="application/ld+json"]');
  let schemaName: string | null = null;
  jsonLdScripts.each((_, el) => {
    if (schemaName) return;
    try {
      const content = $(el).html();
      if (!content) return;
      const data = JSON.parse(content);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const nodes = item["@graph"] || [item];
        for (const node of nodes) {
          const type = node["@type"];
          const types = Array.isArray(type) ? type : [type];
          if (
            types.includes("Organization") ||
            types.includes("LocalBusiness") ||
            types.includes("WebSite")
          ) {
            if (typeof node.name === "string") {
              schemaName = node.name.trim();
              return;
            }
          }
        }
      }
    } catch {
      // skip
    }
  });
  if (schemaName) return schemaName;

  // Fallback: derive from domain
  const host = domain.replace(/^www\./, "");
  const base = host.split(".")[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/* ── Wikipedia check ───────────────────────────────────────────────── */

interface WikipediaResult {
  exists: boolean;
  title?: string;
  extract?: string;
  url?: string;
}

async function fetchWikiSummary(title: string) {
  const encoded = encodeURIComponent(title.replace(/\s+/g, "_"));
  const res = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`,
    {
      headers: { "User-Agent": "ChedderBot/1.0 (https://chedder.2pt.ai)" },
      signal: AbortSignal.timeout(5000),
    }
  );
  if (!res.ok) return null;
  return res.json();
}

// Reject candidate titles whose base (the part before any disambiguator
// like " (company)") doesn't obviously correspond to the brand. Prevents
// Wikipedia search fallbacks returning unrelated pages just because they
// mention the brand name somewhere in the article body.
function titleMatchesBrand(title: string, brand: string): boolean {
  const brandLower = brand.toLowerCase().trim();
  if (!brandLower) return false;
  // Strip parenthetical disambiguator: "Foo (company)" → "foo"
  const base = title
    .toLowerCase()
    .replace(/\s*\([^)]+\)\s*$/, "")
    .trim();
  if (base === brandLower) return true;
  // Allow "Foo, Inc.", "Foo Corp", etc.
  if (base.startsWith(brandLower + " ") || base.startsWith(brandLower + ",")) {
    return true;
  }
  // Allow brand as last word too — e.g. "The Foo" → match "Foo" brands.
  if (base.endsWith(" " + brandLower)) return true;
  return false;
}

async function checkWikipedia(
  brand: string,
  domain: string
): Promise<WikipediaResult> {
  try {
    // First try direct title lookup — accept only if the returned title
    // still looks like it's about our brand (Wikipedia redirects liberally).
    const direct = await fetchWikiSummary(brand);
    if (
      direct &&
      direct.type !== "disambiguation" &&
      direct.extract &&
      direct.title &&
      titleMatchesBrand(direct.title, brand)
    ) {
      return {
        exists: true,
        title: direct.title,
        extract: direct.extract,
        url: direct.content_urls?.desktop?.page,
      };
    }

    // If ambiguous or not found, try "{brand} (company)" first (common Wikipedia pattern)
    const companyAttempt = await fetchWikiSummary(`${brand} (company)`);
    if (
      companyAttempt &&
      companyAttempt.type !== "disambiguation" &&
      companyAttempt.extract &&
      companyAttempt.title &&
      titleMatchesBrand(companyAttempt.title, brand)
    ) {
      return {
        exists: true,
        title: companyAttempt.title,
        extract: companyAttempt.extract,
        url: companyAttempt.content_urls?.desktop?.page,
      };
    }

    // Fallback to search API
    const query = encodeURIComponent(brand);
    const searchRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${query}&format=json&origin=*&srlimit=5`,
      {
        headers: { "User-Agent": "ChedderBot/1.0 (https://chedder.2pt.ai)" },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!searchRes.ok) return { exists: false };
    const searchData = await searchRes.json();
    const candidates: Array<{ title: string; snippet: string }> =
      searchData?.query?.search || [];

    if (candidates.length === 0) return { exists: false };

    // HARD FILTER: drop candidates whose title doesn't look like our brand.
    const relevant = candidates.filter((c) => titleMatchesBrand(c.title, brand));
    if (relevant.length === 0) return { exists: false };

    // Score candidates: prefer ones where title starts with brand name
    // and snippet mentions the domain or typical company words
    const domainBase = domain.replace(/^www\./, "").split(".")[0].toLowerCase();
    const companyKeywords = [
      "company",
      "corporation",
      "inc",
      "ltd",
      "founded",
      "headquartered",
      "software",
      "technology",
      "service",
      "brand",
    ];

    let bestMatch: { title: string; snippet: string } | null = null;
    let bestScore = -1;

    for (const cand of relevant) {
      let score = 0;
      const titleLower = cand.title.toLowerCase();
      const snippet = cand.snippet.toLowerCase();

      // Exact brand match in title
      if (titleLower === brand.toLowerCase()) score += 10;
      // Brand is first word of title
      if (titleLower.startsWith(brand.toLowerCase())) score += 5;
      // Snippet mentions domain
      if (snippet.includes(domainBase)) score += 8;
      // Snippet mentions company keywords
      for (const kw of companyKeywords) {
        if (snippet.includes(kw)) score += 1;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = cand;
      }
    }

    // Only accept if we have meaningful match signals
    if (!bestMatch || bestScore < 4) return { exists: false };

    // Fetch full summary for the best match
    const summary = await fetchWikiSummary(bestMatch.title);
    if (
      !summary ||
      !summary.extract ||
      summary.type === "disambiguation" ||
      !summary.title ||
      !titleMatchesBrand(summary.title, brand)
    ) {
      return { exists: false };
    }

    return {
      exists: true,
      title: summary.title,
      extract: summary.extract,
      url: summary.content_urls?.desktop?.page,
    };
  } catch {
    return { exists: false };
  }
}

/* ── Reddit check ──────────────────────────────────────────────────── */

interface RedditResult {
  totalMentions: number;
  recentMentions: number;
  topPost?: { title: string; subreddit: string; score: number; url: string };
}

async function checkReddit(
  brand: string,
  domain: string
): Promise<RedditResult | null> {
  try {
    // Search for posts mentioning the domain, much more precise than brand name alone
    const domainBase = domain.replace(/^www\./, "");
    const query = encodeURIComponent(`"${domainBase}"`);
    const res = await fetch(
      `https://www.reddit.com/search.json?q=${query}&limit=25&sort=relevance`,
      {
        headers: { "User-Agent": "ChedderBot/1.0 (https://chedder.2pt.ai)" },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const posts = data?.data?.children || [];

    // Filter posts to only those that actually mention the brand/domain in title or body
    const domainLower = domainBase.toLowerCase();
    const brandLower = brand.toLowerCase();
    type RedditPost = {
      data: {
        title?: string;
        selftext?: string;
        url?: string;
        score?: number;
        created_utc?: number;
        subreddit?: string;
        permalink?: string;
      };
    };
    const filtered = (posts as RedditPost[]).filter((p) => {
      const title = (p.data.title || "").toLowerCase();
      const body = (p.data.selftext || "").toLowerCase();
      const url = (p.data.url || "").toLowerCase();
      return (
        title.includes(domainLower) ||
        body.includes(domainLower) ||
        url.includes(domainLower) ||
        title.includes(brandLower)
      );
    });

    if (filtered.length === 0) {
      return { totalMentions: 0, recentMentions: 0 };
    }

    const oneYearAgo = Math.floor(Date.now() / 1000) - 365 * 24 * 60 * 60;
    const recent = filtered.filter(
      (p) => (p.data.created_utc || 0) > oneYearAgo
    );

    const top = filtered.reduce<RedditPost | null>(
      (best, p) =>
        !best || (p.data.score || 0) > (best.data.score || 0) ? p : best,
      null
    );

    return {
      totalMentions: filtered.length,
      recentMentions: recent.length,
      topPost: top
        ? {
            title: top.data.title || "",
            subreddit: top.data.subreddit || "",
            score: top.data.score || 0,
            url: "https://reddit.com" + (top.data.permalink || ""),
          }
        : undefined,
    };
  } catch {
    return null;
  }
}

/* ── Google Programmable Search (optional) ────────────────────────── */

interface GoogleResult {
  configured: boolean;
  totalResults?: number;
  error?: string;
}

async function checkGoogle(brand: string, domain: string): Promise<GoogleResult> {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

  if (!apiKey || !searchEngineId) {
    return { configured: false };
  }

  try {
    const query = encodeURIComponent(`"${brand}" -site:${domain}`);
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchEngineId}&q=${query}&num=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      return { configured: true, error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    const total = parseInt(data?.searchInformation?.totalResults || "0", 10);
    return { configured: true, totalResults: total };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { configured: true, error: msg };
  }
}

/* ── Main analyzer ─────────────────────────────────────────────────── */

export async function analyzeExternal(
  $: CheerioAPI,
  domain: string
): Promise<ModuleResult> {
  const findings: Finding[] = [];
  const recommendations: Recommendation[] = [];
  let score = 0;

  const brand = extractBrandName($, domain);

  findings.push({
    label: "Brand Name Detected",
    status: "pass",
    detail: `"${brand}" (searched across sources)`,
  });

  // Run checks in parallel
  const [wiki, reddit, google] = await Promise.all([
    checkWikipedia(brand, domain),
    checkReddit(brand, domain),
    checkGoogle(brand, domain),
  ]);

  // Wikipedia findings
  if (wiki.exists) {
    const preview = wiki.extract
      ? `. "${wiki.extract.slice(0, 120)}${wiki.extract.length > 120 ? "..." : ""}"`
      : "";
    findings.push({
      label: "Wikipedia Article",
      status: "pass",
      detail: `Found: "${wiki.title}"${preview}`,
    });
    score += 35;
  } else {
    findings.push({
      label: "Wikipedia Article",
      status: "fail",
      detail: "No Wikipedia article found for this brand",
    });
    recommendations.push({
      priority: "high",
      title: "Build Toward a Wikipedia Presence",
      description:
        "Wikipedia is one of the most-cited sources by AI models. Earn notability through press coverage, then have an independent editor create an article (Wikipedia policy discourages self-authored pages).",
    });
  }

  // Reddit findings
  if (reddit === null) {
    findings.push({
      label: "Reddit Mentions",
      status: "warn",
      detail: "Could not reach Reddit search API",
    });
  } else if (reddit.totalMentions >= 10) {
    findings.push({
      label: "Reddit Mentions",
      status: "pass",
      detail: `${reddit.totalMentions}+ posts found (${reddit.recentMentions} in the last year)`,
    });
    score += 25;
    if (reddit.topPost) {
      findings.push({
        label: "Top Reddit Discussion",
        status: "pass",
        detail: `"${reddit.topPost.title.slice(0, 80)}" in r/${reddit.topPost.subreddit} (${reddit.topPost.score} upvotes)`,
      });
    }
  } else if (reddit.totalMentions >= 1) {
    findings.push({
      label: "Reddit Mentions",
      status: "warn",
      detail: `Only ${reddit.totalMentions} posts found`,
    });
    score += 10;
    recommendations.push({
      priority: "medium",
      title: "Grow Reddit Discussion",
      description:
        "AI models weight organic Reddit discussions highly. Engage authentically in relevant subreddits, do not astroturf, which is detected and penalized.",
    });
  } else {
    findings.push({
      label: "Reddit Mentions",
      status: "fail",
      detail: "No Reddit posts mentioning this brand",
    });
    recommendations.push({
      priority: "high",
      title: "Build Organic Reddit Presence",
      description:
        "Reddit is a top-tier source AI models cite for authentic user opinions. Identify 2-3 subreddits where your audience gathers and contribute valuable, non-promotional content.",
    });
  }

  // Google findings
  if (google.configured && google.totalResults !== undefined) {
    if (google.totalResults >= 1000) {
      findings.push({
        label: "Google Web Mentions",
        status: "pass",
        detail: `~${google.totalResults.toLocaleString()} results across the web`,
      });
      score += 25;
    } else if (google.totalResults >= 100) {
      findings.push({
        label: "Google Web Mentions",
        status: "warn",
        detail: `~${google.totalResults.toLocaleString()} results, moderate presence`,
      });
      score += 15;
      recommendations.push({
        priority: "medium",
        title: "Expand Web Mentions",
        description:
          "Increase PR, guest posts, podcast appearances, and directory listings to build broader web presence that AI crawlers can find.",
      });
    } else {
      findings.push({
        label: "Google Web Mentions",
        status: "fail",
        detail: `Only ~${google.totalResults.toLocaleString()} results found`,
      });
      recommendations.push({
        priority: "high",
        title: "Build Web Mentions",
        description:
          "Low web presence means AI models have little signal beyond your own site. Prioritize PR, partnerships, and earned media.",
      });
    }
  } else if (google.configured && google.error) {
    findings.push({
      label: "Google Web Mentions",
      status: "warn",
      detail: `Google Search API error: ${google.error}`,
    });
  } else {
    findings.push({
      label: "Google Web Mentions",
      status: "warn",
      detail: "Google Search API not configured (optional)",
    });
  }

  // Give baseline if Google not configured
  if (!google.configured) {
    const wikiScore = wiki.exists ? 35 : 0;
    const redditScore =
      reddit && reddit.totalMentions >= 10
        ? 25
        : reddit && reddit.totalMentions >= 1
          ? 10
          : 0;
    // Scale up to 100 since Google is missing (35 + 25 = 60 max → scale to 100)
    score = Math.round(((wikiScore + redditScore) / 60) * 100);
  }

  return {
    name: "External Brand Signals",
    slug: "external",
    score: Math.min(score, 100),
    icon: "🌐",
    description:
      "AI models cross-reference your brand against Wikipedia, Reddit, and the broader web",
    findings,
    recommendations,
  };
}
