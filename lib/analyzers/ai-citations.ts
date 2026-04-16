import { AICompetitor, Finding, ModuleResult, Recommendation } from "../types";
import { checkSpendCap, recordSpend } from "../spend-cap";

// Domains we never want to count as competitors
const NON_COMPETITOR_DOMAINS = new Set([
  // Encyclopedias / knowledge
  "wikipedia.org",
  "wikimedia.org",
  "britannica.com",
  // Social / forums
  "reddit.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "tiktok.com",
  "quora.com",
  "medium.com",
  "substack.com",
  // Code / Q&A
  "github.com",
  "stackoverflow.com",
  "stackexchange.com",
  // Press / news
  "techcrunch.com",
  "forbes.com",
  "wired.com",
  "theverge.com",
  "businessinsider.com",
  "cnbc.com",
  "reuters.com",
  "bloomberg.com",
  "nytimes.com",
  "wsj.com",
  "bbc.com",
  "bbc.co.uk",
  // Review sites
  "g2.com",
  "capterra.com",
  "trustpilot.com",
  "gartner.com",
  "trustradius.com",
  "getapp.com",
  "softwareadvice.com",
  // Search / general
  "google.com",
  "bing.com",
  "yahoo.com",
  // Docs / generic
  "amazon.com",
  "apple.com",
  "microsoft.com",
]);

/**
 * Pull the "registrable" domain (e.g., stripe.com from api.stripe.com).
 */
function rootDomain(host: string): string {
  const parts = host.replace(/^www\./, "").split(".");
  if (parts.length <= 2) return parts.join(".");
  // Simple heuristic: keep last 2 labels (good enough for most TLDs we'll see)
  return parts.slice(-2).join(".");
}

function extractCompetitorsFromResponses(
  responses: Array<{
    query: string;
    response: { content: string; citations: string[] } | null;
  }>,
  ownDomain: string
): AICompetitor[] {
  const ownRoot = rootDomain(ownDomain);
  const counts = new Map<
    string,
    { domain: string; mentions: number; queries: Set<string> }
  >();

  for (const { query, response } of responses) {
    if (!response) continue;

    for (const url of response.citations) {
      try {
        const u = new URL(url);
        const host = u.hostname.replace(/^www\./, "").toLowerCase();
        const root = rootDomain(host);

        // Skip excluded domains (check both root and full hostname)
        if (NON_COMPETITOR_DOMAINS.has(root)) continue;
        if (NON_COMPETITOR_DOMAINS.has(host)) continue;

        // Skip the user's own domain
        if (root === ownRoot) continue;

        // Skip obvious non-brand domains (ccTLDs for country sites, etc.)
        if (/^(www|blog|docs|help|support|api)\./.test(host)) {
          // use root domain instead
        }

        const key = root;
        if (!counts.has(key)) {
          counts.set(key, {
            domain: root,
            mentions: 0,
            queries: new Set(),
          });
        }
        const entry = counts.get(key)!;
        entry.queries.add(query);
      } catch {
        // invalid URL
      }
    }
  }

  // Convert to AICompetitor[] with mentions = distinct queries
  return Array.from(counts.values())
    .map((c) => ({
      domain: c.domain,
      mentions: c.queries.size,
      queries: Array.from(c.queries).slice(0, 3),
    }))
    .filter((c) => c.mentions >= 1) // must appear in at least 1 query
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 6);
}

interface PerplexityResponse {
  id: string;
  choices?: Array<{
    message?: {
      role: string;
      content: string;
    };
  }>;
  citations?: string[];
  search_results?: Array<{ title: string; url: string; snippet?: string }>;
}

async function askPerplexity(
  query: string,
  apiKey: string
): Promise<{ content: string; citations: string[] } | null> {
  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [{ role: "user", content: query }],
        max_tokens: 500,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      console.error(
        `Perplexity API error: ${res.status} ${await res.text().catch(() => "")}`
      );
      return null;
    }

    const data: PerplexityResponse = await res.json();
    const content = data.choices?.[0]?.message?.content || "";
    const citations =
      data.citations ||
      data.search_results?.map((r) => r.url).filter(Boolean) ||
      [];

    return { content, citations };
  } catch (e) {
    console.error("Perplexity request failed:", e);
    return null;
  }
}

/**
 * Generate category-relevant queries based on domain & brand.
 * These are designed to test whether AI would recommend this brand.
 */
function generateQueries(
  brand: string,
  domain: string,
  category: string | null
): string[] {
  const queries: string[] = [];

  // Query 1: Direct brand query (tests if AI knows about them)
  queries.push(
    `Tell me about ${brand} (${domain}). What do they do and what are they known for?`
  );

  // Query 2: Category "best" query (tests if they surface organically)
  if (category) {
    queries.push(`What are the best ${category} available right now?`);
  } else {
    queries.push(
      `What are the top companies similar to ${brand}? Who are they and what do they offer?`
    );
  }

  // Query 3: Alternatives query (tests competitive positioning)
  queries.push(
    `What are the best alternatives to ${brand}? List the top options with pros and cons.`
  );

  // Query 4: Trust/review query
  queries.push(
    `Is ${brand} a trusted and well-reviewed company? What do customers say about them?`
  );

  // Query 5: Specific category leadership
  if (category) {
    queries.push(
      `Which companies lead the ${category} market and why are they recommended?`
    );
  } else {
    queries.push(
      `What makes ${brand} stand out from competitors? Should it be recommended?`
    );
  }

  return queries;
}

/**
 * Check whether the brand appears in the AI response.
 */
function analyzeCitation(
  content: string,
  citations: string[],
  brand: string,
  domain: string
): {
  mentioned: boolean;
  cited: boolean;
  position: "prominent" | "mentioned" | "absent";
  excerpt: string | null;
} {
  const lowerContent = content.toLowerCase();
  const lowerBrand = brand.toLowerCase();
  const lowerDomain = domain.toLowerCase();
  const domainBase = lowerDomain.replace(/^www\./, "").split(".")[0];

  const mentioned =
    lowerContent.includes(lowerBrand) ||
    lowerContent.includes(domainBase) ||
    lowerContent.includes(lowerDomain);

  const cited = citations.some(
    (c) => c.toLowerCase().includes(lowerDomain) || c.toLowerCase().includes(domainBase)
  );

  // Check if brand appears in first 30% of response (prominent) or later
  let position: "prominent" | "mentioned" | "absent" = "absent";
  let excerpt: string | null = null;

  if (mentioned) {
    const firstMentionIdx = Math.max(
      lowerContent.indexOf(lowerBrand),
      lowerContent.indexOf(domainBase)
    );
    position =
      firstMentionIdx >= 0 && firstMentionIdx < content.length * 0.3
        ? "prominent"
        : "mentioned";

    // Extract ~200 char window around first mention
    const start = Math.max(0, firstMentionIdx - 80);
    const end = Math.min(content.length, firstMentionIdx + 200);
    excerpt = content.slice(start, end).trim();
    if (start > 0) excerpt = "..." + excerpt;
    if (end < content.length) excerpt = excerpt + "...";
  }

  return { mentioned, cited, position, excerpt };
}

export async function analyzeAICitations(
  brand: string,
  domain: string,
  metaDescription: string | null
): Promise<{ module: ModuleResult; competitors: AICompetitor[] } | null> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    return null; // gracefully skip if not configured
  }

  // Spend cap check
  const cap = await checkSpendCap();
  if (!cap.allowed || cap.remainingQueriesToday <= 0) {
    return {
      module: {
        name: "AI Citation Testing",
        slug: "ai-citations",
        score: 0,
        icon: "🤖",
        description:
          "Tests whether AI models actually mention your brand when asked relevant questions",
        findings: [
          {
            label: "Spend Cap Reached",
            status: "warn",
            detail:
              cap.reason ||
              "AI testing is paused until the daily/monthly budget resets.",
          },
        ],
        recommendations: [],
      },
      competitors: [],
    };
  }

  // Try to derive category from meta description (cheap heuristic)
  let category: string | null = null;
  if (metaDescription) {
    // Look for common category words
    const categoryPatterns = [
      /(\w+) (platform|software|tool|service|solution|app|api)/i,
      /(best|leading|top) (\w+ ?\w*)/i,
      /for (\w+ ?\w*)/i,
    ];
    for (const pat of categoryPatterns) {
      const m = metaDescription.match(pat);
      if (m) {
        category = (m[2] || m[1]).toLowerCase().slice(0, 40);
        break;
      }
    }
  }

  const allQueries = generateQueries(brand, domain, category);
  const queries = allQueries.slice(0, cap.remainingQueriesToday);

  // Run queries in parallel
  const responses = await Promise.all(
    queries.map(async (q) => {
      const r = await askPerplexity(q, apiKey);
      return { query: q, response: r };
    })
  );

  const usedQueries = responses.filter((r) => r.response !== null).length;
  await recordSpend(usedQueries);

  // Analyze each response
  const findings: Finding[] = [];
  const recommendations: Recommendation[] = [];
  let score = 0;
  let mentionCount = 0;
  let prominentCount = 0;
  let citedCount = 0;

  for (const { query, response } of responses) {
    if (!response) {
      findings.push({
        label: "Query Failed",
        status: "warn",
        detail: `"${query.slice(0, 60)}...". API error`,
      });
      continue;
    }

    const analysis = analyzeCitation(
      response.content,
      response.citations,
      brand,
      domain
    );

    if (analysis.position === "prominent") {
      prominentCount++;
      mentionCount++;
      findings.push({
        label: query.slice(0, 80) + (query.length > 80 ? "..." : ""),
        status: "pass",
        detail: `✨ Prominently mentioned. Excerpt: "${analysis.excerpt?.slice(0, 180)}..."`,
      });
    } else if (analysis.position === "mentioned") {
      mentionCount++;
      findings.push({
        label: query.slice(0, 80) + (query.length > 80 ? "..." : ""),
        status: "warn",
        detail: `Mentioned but not prominently. Excerpt: "${analysis.excerpt?.slice(0, 180)}..."`,
      });
    } else {
      findings.push({
        label: query.slice(0, 80) + (query.length > 80 ? "..." : ""),
        status: "fail",
        detail: `Not mentioned in Perplexity's response. First citations: ${response.citations.slice(0, 3).join(", ") || "(none)"}`,
      });
    }

    if (analysis.cited) citedCount++;
  }

  // Calculate score
  if (responses.length > 0) {
    const mentionRate = mentionCount / responses.length;
    const prominentRate = prominentCount / responses.length;
    const citationRate = citedCount / responses.length;

    score = Math.round(
      mentionRate * 40 + prominentRate * 40 + citationRate * 20
    );
  }

  // Recommendations based on results
  if (mentionCount === 0) {
    recommendations.push({
      priority: "high",
      title: "Your Brand Is Invisible to AI",
      description: `Perplexity did not mention ${brand} in any response. This is a critical GEO issue. Focus on earning authoritative mentions on Wikipedia, Reddit, G2, news publications, and industry directories.`,
    });
  } else if (prominentCount === 0) {
    recommendations.push({
      priority: "high",
      title: "Improve Prominence in AI Responses",
      description: `${brand} is mentioned but always toward the end of responses. AI models list "leading" brands first. Build topical authority through comprehensive content and third-party endorsements.`,
    });
  }

  if (citedCount === 0 && mentionCount > 0) {
    recommendations.push({
      priority: "high",
      title: "Your Site Isn't Being Cited Directly",
      description: `AI mentions ${brand} but cites other sources (reviews, Wikipedia, news). Optimize your own content to become a direct citation source: add FAQs, structured data, and authoritative statistics.`,
    });
  }

  // Extract AI-perceived competitors from the citations
  const aiCompetitors = extractCompetitorsFromResponses(responses, domain);

  return {
    module: {
      name: "AI Citation Testing",
      slug: "ai-citations",
      score,
      icon: "🤖",
      description: `Real queries tested on Perplexity (${usedQueries}/${queries.length} queries ran)`,
      findings,
      recommendations,
    },
    competitors: aiCompetitors,
  };
}
