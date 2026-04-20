import type { CheerioAPI } from "cheerio";
import { Finding, ModuleResult, Recommendation } from "../types";

/* ── Brand name extraction ────────────────────────────────────────── */

// Strip locale suffixes (pampers.com → og:site_name "Pampers en-us"),
// trademark symbols, and common corporate appendages so the brand name
// we feed downstream is clean — otherwise it contaminates every query
// and finding message.
function cleanBrandName(raw: string): string {
  let s = raw.trim();
  // Trademark / registered marks
  s = s.replace(/[®™©℠]/g, "");
  // Locale codes like "en-us", "en-gb", "fr-ca" at the end
  s = s.replace(/\s+[a-z]{2}-[a-z]{2}\s*$/i, "");
  // "| Official site", "— Official website", ": US", country suffix etc.
  s = s.replace(
    /\s*[—|:]\s*(Official\s+(Site|Website|Store)|US|UK|Global|Worldwide|Home)\s*$/i,
    ""
  );
  // Collapse internal whitespace
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

export function extractBrandName($: CheerioAPI, domain: string): string {
  // Try og:site_name first
  const ogSiteName = $('meta[property="og:site_name"]').attr("content")?.trim();
  if (ogSiteName) return cleanBrandName(ogSiteName);

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
  if (schemaName) return cleanBrandName(schemaName);

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
//
// Strict rules:
//   - Exact match on the pre-parenthetical base → accept.
//   - "Brand, Inc." / "Brand Inc." / "Brand Corp" etc. → accept only if the
//     word(s) after the brand are in a known corporate-suffix allowlist.
//   - Anything else ("Linear A", "Apple pie", "Orange Juice") → reject.
const CORPORATE_SUFFIX_WORDS = new Set([
  "inc",
  "inc.",
  "incorporated",
  "corp",
  "corp.",
  "corporation",
  "co",
  "co.",
  "company",
  "ltd",
  "ltd.",
  "limited",
  "llc",
  "llp",
  "lp",
  "plc",
  "gmbh",
  "ag",
  "sa",
  "s.a.",
  "bv",
  "group",
  "holdings",
  "holding",
  "technologies",
  "technology",
  "tech",
  "software",
  "systems",
  "labs",
  "studios",
]);

function titleMatchesBrand(title: string, brand: string): boolean {
  const brandLower = brand.toLowerCase().trim();
  if (!brandLower) return false;
  // Strip parenthetical disambiguator: "Foo (company)" → "foo"
  const base = title
    .toLowerCase()
    .replace(/\s*\([^)]+\)\s*$/, "")
    .trim();
  if (base === brandLower) return true;

  // Must start with the brand followed by a word boundary.
  const prefixSpace = brandLower + " ";
  const prefixComma = brandLower + ",";
  let remainder: string | null = null;
  if (base.startsWith(prefixSpace)) {
    remainder = base.slice(prefixSpace.length).trim();
  } else if (base.startsWith(prefixComma)) {
    remainder = base.slice(prefixComma.length).trim();
  }

  if (remainder !== null) {
    // Strip connector punctuation like "& Co."
    const cleaned = remainder.replace(/^&\s+/, "").trim();
    // Take up to the first 2 words as the qualifier phrase. If ANY of
    // those tokens is NOT a recognized corporate suffix word, reject.
    // "Linear A" → ["a"] → not in allowlist → reject.
    // "Foo Inc" → ["inc"] → accept.
    // "Foo Inc., Ltd." → ["inc.", "ltd."] → accept.
    const tokens = cleaned.split(/\s+/).slice(0, 2);
    if (tokens.length === 0) return false;
    const allCorporate = tokens.every((t) =>
      CORPORATE_SUFFIX_WORDS.has(t.replace(/[,;]$/, ""))
    );
    return allCorporate;
  }

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

/* ── Reddit check (via Brave Web Search) ───────────────────────────── */

interface RedditResult {
  totalMentions: number;
  recentMentions: number;
  topPost?: { title: string; subreddit: string; score: number; url: string };
  source: "brave" | "unavailable";
}

// Reddit blocks direct requests from shared datacenter IPs (Netlify, Vercel,
// AWS ranges), their official OAuth API gates commercial use behind a manual
// ticket with a long review, and scraping through proxies is fragile. So we
// piggy-back on Brave's index: `site:reddit.com "{domain}"` returns the same
// Reddit threads we care about, with titles + URLs + subreddit path, and
// Brave already fetches Reddit on our behalf from an unblocked crawler.
async function checkReddit(
  brand: string,
  domain: string
): Promise<RedditResult | null> {
  // Brave issues plan-scoped keys. BRAVE_SEARCH_API_KEY is the Search-plan
  // key (entitled for /res/v1/web/search); BRAVE_API_KEY is the Answers-plan
  // key used for /res/v1/chat/completions. Fall back to BRAVE_API_KEY for
  // backwards compatibility with older environments that only had one key.
  const apiKey =
    process.env.BRAVE_SEARCH_API_KEY || process.env.BRAVE_API_KEY;
  if (!apiKey) return null;

  try {
    const domainBase = domain.replace(/^www\./, "");
    // Exact-domain match to avoid spurious mentions of similar names.
    const q = `site:reddit.com "${domainBase}"`;
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(
      q
    )}&count=20`;

    const res = await fetch(url, {
      headers: {
        "X-Subscription-Token": apiKey,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.warn(
        `[external] Brave web search (reddit) HTTP ${res.status} ${res.statusText}`
      );
      return null;
    }

    type BraveResult = {
      title?: string;
      url?: string;
      description?: string;
      age?: string;
    };
    const data = (await res.json()) as {
      web?: { results?: BraveResult[] };
    };
    const results = data.web?.results ?? [];

    // If the Brave key doesn't have the Web Search entitlement on this plan,
    // the endpoint returns HTTP 200 with an empty response body (no `web`
    // key). Surface this distinctly from "no Reddit threads found" so the UI
    // can nudge the user to enable the free Data-for-Search tier.
    if (!data.web) {
      console.warn(
        "[external] Brave key lacks web-search entitlement — enable Data for Search"
      );
      return { totalMentions: 0, recentMentions: 0, source: "unavailable" };
    }

    if (results.length === 0) {
      return { totalMentions: 0, recentMentions: 0, source: "brave" };
    }

    // Extract subreddit from Reddit URL: https://www.reddit.com/r/<sub>/comments/...
    const subRegex = /reddit\.com\/r\/([^/]+)\//i;
    const top = results[0];
    const topSubMatch = top.url ? top.url.match(subRegex) : null;

    // Brave "age" looks like "1 month ago", "2 years ago", "3 days ago".
    // Count anything not explicitly older than a year as recent.
    const isRecent = (age?: string) => {
      if (!age) return true; // Brave sometimes omits; assume recent.
      return !/\b(year|years)\b/i.test(age) || /^1\s+year/i.test(age);
    };
    const recent = results.filter((r) => isRecent(r.age)).length;

    return {
      totalMentions: results.length,
      recentMentions: recent,
      topPost: top.title
        ? {
            title: top.title,
            subreddit: topSubMatch ? topSubMatch[1] : "",
            // Brave doesn't expose upvotes. Keep 0 rather than fabricate.
            score: 0,
            url: top.url || "",
          }
        : undefined,
      source: "brave",
    };
  } catch (e) {
    console.warn(
      "[external] Brave Reddit search error:",
      e instanceof Error ? e.message : e
    );
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
      priority: "medium",
      title: "Earn credible press coverage",
      description:
        "Wikipedia is one of the most-cited sources by AI models, but most DTC brands won't meet its notability bar until later. The path there is earned press: get reviewed in Wirecutter, NYT Strategist, Good Housekeeping, or your category's leading publication. Those placements also feed every other AI signal at once.",
    });
  }

  // Reddit findings — sourced via Brave (`site:reddit.com "{domain}"`).
  if (reddit === null) {
    findings.push({
      label: "Reddit Mentions",
      status: "warn",
      detail: "Reddit search unavailable (Brave key not configured)",
    });
  } else if (reddit.source === "unavailable") {
    findings.push({
      label: "Reddit Mentions",
      status: "warn",
      detail:
        "Reddit check requires Brave's Data-for-Search tier. Enable it in the Brave API dashboard (free plan available).",
    });
  } else if (reddit.totalMentions >= 10) {
    findings.push({
      label: "Reddit Mentions",
      status: "pass",
      detail: `${reddit.totalMentions}+ threads found (${reddit.recentMentions} likely recent)`,
    });
    score += 25;
    if (reddit.topPost) {
      const inSub = reddit.topPost.subreddit
        ? ` in r/${reddit.topPost.subreddit}`
        : "";
      findings.push({
        label: "Top Reddit Discussion",
        status: "pass",
        detail: `"${reddit.topPost.title.slice(0, 100)}"${inSub}`,
      });
    }
  } else if (reddit.totalMentions >= 1) {
    findings.push({
      label: "Reddit Mentions",
      status: "warn",
      detail: `Only ${reddit.totalMentions} thread${reddit.totalMentions === 1 ? "" : "s"} found`,
    });
    score += 10;
    recommendations.push({
      priority: "medium",
      title: "Grow Reddit discussion around your brand",
      description:
        "AI models weight organic Reddit discussions heavily for shopper intent. Subreddits like r/BuyItForLife and your category's own sub are gold. Seed genuine conversations by answering questions in your category honestly (even when it doesn't route to your product), and encourage happy customers to post reviews. Avoid astroturfing. It's detected and penalized.",
    });
  } else {
    findings.push({
      label: "Reddit Mentions",
      status: "fail",
      detail: "No Reddit threads mentioning this brand",
    });
    recommendations.push({
      priority: "high",
      title: "Build organic Reddit presence",
      description:
        "Reddit is a top tier source AI models cite for honest shopper opinions. Identify 2 or 3 subreddits where your target shopper hangs out (r/BuyItForLife and your category specific subs), and contribute genuinely helpful, non promotional comments. Ask happy customers to share their experience. Organic threads outrank any paid campaign here.",
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
        title: "Expand web presence",
        description:
          "Broaden where your brand shows up online. Pitch reviews to lifestyle and category publications, send product to creators in your niche for honest reviews, get on roundup lists, and pursue podcast mentions. AI tools learn from fresh, varied coverage.",
      });
    } else {
      findings.push({
        label: "Google Web Mentions",
        status: "fail",
        detail: `Only ~${google.totalResults.toLocaleString()} results found`,
      });
      recommendations.push({
        priority: "high",
        title: "Build web presence from scratch",
        description:
          "Low web presence means AI models have little to go on beyond your own site. Pitch the press that matters for your category (Wirecutter, Good Housekeeping, lifestyle outlets, niche reviewers), send product to creators, and appear in honest roundup articles. You need other people talking about you before AI can.",
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
    name: "What the web whispers about you",
    slug: "external",
    score: Math.min(score, 100),
    icon: "🌐",
    description:
      "When AI tools look you up on Wikipedia, Reddit, and across the open web, what do they actually find?",
    findings,
    recommendations,
  };
}
