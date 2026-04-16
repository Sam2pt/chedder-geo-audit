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

/* ── Engine abstraction ──────────────────────────────────────────── */

type EngineName = "perplexity" | "openai" | "brave";

interface EngineResponse {
  content: string;
  citations: string[];
}

interface Engine {
  name: EngineName;
  label: string;
  ask: (query: string) => Promise<EngineResponse | null>;
  /** True if calls must be serialized (free-tier rate limits, etc.) */
  sequential?: boolean;
}

function configuredEngines(): Engine[] {
  const engines: Engine[] = [];
  const ppx = process.env.PERPLEXITY_API_KEY;
  const oai = process.env.OPENAI_API_KEY;
  const brv = process.env.BRAVE_API_KEY;

  if (ppx) {
    engines.push({
      name: "perplexity",
      label: "Perplexity",
      ask: (q) => askPerplexity(q, ppx),
    });
  }
  if (oai) {
    engines.push({
      name: "openai",
      label: "ChatGPT",
      ask: (q) => askOpenAI(q, oai),
    });
  }
  if (brv) {
    engines.push({
      name: "brave",
      label: "Brave",
      ask: (q) => askBrave(q, brv),
      // Brave Answers plan caps at 2 req/sec — serialize to stay safely under.
      sequential: true,
    });
  }
  return engines;
}

/* ── Perplexity ──────────────────────────────────────────────────── */

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
): Promise<EngineResponse | null> {
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

/* ── OpenAI (Responses API + web_search_preview) ─────────────────── */

interface OpenAIResponse {
  output?: Array<{
    type: string;
    role?: string;
    content?: Array<{
      type: string;
      text?: string;
      annotations?: Array<{
        type: string;
        url?: string;
        title?: string;
        start_index?: number;
        end_index?: number;
      }>;
    }>;
  }>;
  output_text?: string; // convenience field some SDK variants emit
}

async function askOpenAI(
  query: string,
  apiKey: string
): Promise<EngineResponse | null> {
  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        tools: [{ type: "web_search_preview" }],
        input: query,
      }),
      // Web search can take a while
      signal: AbortSignal.timeout(45000),
    });

    if (!res.ok) {
      console.error(
        `OpenAI API error: ${res.status} ${await res.text().catch(() => "")}`
      );
      return null;
    }

    const data: OpenAIResponse = await res.json();

    // Collect text + url_citation annotations from each message output
    let content = "";
    const citations: string[] = [];

    if (Array.isArray(data.output)) {
      for (const item of data.output) {
        if (item.type !== "message" || !Array.isArray(item.content)) continue;
        for (const c of item.content) {
          if (c.type === "output_text" && typeof c.text === "string") {
            content += (content ? "\n" : "") + c.text;
          }
          if (Array.isArray(c.annotations)) {
            for (const ann of c.annotations) {
              if (ann.type === "url_citation" && ann.url) {
                citations.push(ann.url);
              }
            }
          }
        }
      }
    }

    // Fallback to convenience field
    if (!content && typeof data.output_text === "string") {
      content = data.output_text;
    }

    if (!content && citations.length === 0) {
      // Model returned nothing usable — treat as failure
      return null;
    }

    // Dedupe citations, preserve order
    const seen = new Set<string>();
    const dedupedCitations = citations.filter((u) => {
      if (seen.has(u)) return false;
      seen.add(u);
      return true;
    });

    return { content, citations: dedupedCitations };
  } catch (e) {
    console.error("OpenAI request failed:", e);
    return null;
  }
}

/* ── Brave Answers (OpenAI-compatible chat completions) ──────────── */

// Brave's Answers plan exposes an OpenAI-compatible endpoint at
//   POST https://api.search.brave.com/res/v1/chat/completions
// The model runs web search under the hood and returns a grounded answer.
// It does NOT return explicit citation URLs in the response, so we only
// measure mention/prominence — `cited` will always be false for Brave.

interface BraveChatResponse {
  choices?: Array<{
    message?: { role: string; content: string };
    finish_reason?: string;
  }>;
}

async function askBrave(
  query: string,
  apiKey: string
): Promise<EngineResponse | null> {
  try {
    const res = await fetch(
      "https://api.search.brave.com/res/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "brave-pro",
          stream: false,
          messages: [{ role: "user", content: query }],
        }),
        signal: AbortSignal.timeout(30000),
      }
    );

    if (!res.ok) {
      console.error(
        `Brave Answers API error: ${res.status} ${await res
          .text()
          .catch(() => "")}`
      );
      return null;
    }

    const data: BraveChatResponse = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim() || "";
    if (!content) return null;

    // Brave Answers doesn't expose per-response citation URLs today.
    return { content, citations: [] };
  } catch (e) {
    console.error("Brave request failed:", e);
    return null;
  }
}

/* ── Competitor extraction ───────────────────────────────────────── */

type TaggedResponse = {
  engine: EngineName;
  spec: { scenario: string; query: string };
  response: EngineResponse | null;
};

function extractCompetitorsFromResponses(
  responses: TaggedResponse[],
  ownDomain: string
): AICompetitor[] {
  const ownRoot = rootDomain(ownDomain);
  const counts = new Map<
    string,
    { domain: string; mentions: number; queries: Set<string> }
  >();

  for (const { spec, response } of responses) {
    if (!response) continue;

    for (const url of response.citations) {
      try {
        const u = new URL(url);
        const host = u.hostname.replace(/^www\./, "").toLowerCase();
        const root = rootDomain(host);

        if (NON_COMPETITOR_DOMAINS.has(root)) continue;
        if (NON_COMPETITOR_DOMAINS.has(host)) continue;
        if (root === ownRoot) continue;

        const key = root;
        if (!counts.has(key)) {
          counts.set(key, {
            domain: root,
            mentions: 0,
            queries: new Set(),
          });
        }
        const entry = counts.get(key)!;
        entry.queries.add(spec.scenario);
      } catch {
        // invalid URL
      }
    }
  }

  return Array.from(counts.values())
    .map((c) => ({
      domain: c.domain,
      mentions: c.queries.size,
      queries: Array.from(c.queries).slice(0, 3),
    }))
    .filter((c) => c.mentions >= 1)
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 6);
}

/* ── Query generation (unchanged from single-engine version) ────── */

interface QuerySpec {
  scenario: string;
  query: string;
}

function generateQueries(
  brand: string,
  domain: string,
  category: string | null
): QuerySpec[] {
  const queries: QuerySpec[] = [];

  queries.push({
    scenario: `When someone asks AI about ${brand}`,
    query: `Tell me about ${brand} (${domain}). What do they do and what are they known for?`,
  });

  if (category) {
    queries.push({
      scenario: `When someone asks for the best ${category}`,
      query: `What are the best ${category} available right now?`,
    });
  } else {
    queries.push({
      scenario: `When someone asks about companies similar to ${brand}`,
      query: `What are the top companies similar to ${brand}? Who are they and what do they offer?`,
    });
  }

  queries.push({
    scenario: `When someone asks for alternatives to ${brand}`,
    query: `What are the best alternatives to ${brand}? List the top options with pros and cons.`,
  });

  queries.push({
    scenario: `When someone asks if ${brand} is trustworthy`,
    query: `Is ${brand} a trusted and well-reviewed company? What do customers say about them?`,
  });

  if (category) {
    queries.push({
      scenario: `When someone asks which companies lead the ${category} market`,
      query: `Which companies lead the ${category} market and why are they recommended?`,
    });
  } else {
    queries.push({
      scenario: `When someone asks what makes ${brand} stand out`,
      query: `What makes ${brand} stand out from competitors? Should it be recommended?`,
    });
  }

  return queries;
}

/* ── Citation analysis ───────────────────────────────────────────── */

// Phrases that mean the engine is refusing / saying it doesn't know the brand.
// Matched case-insensitively anywhere in the response.
const REFUSAL_PHRASES = [
  "does not appear",
  "doesn't appear",
  "couldn't find",
  "could not find",
  "no direct information",
  "no information about",
  "don't have information",
  "do not have information",
  "don't have details",
  "do not have details",
  "no specific information",
  "not in the provided",
  "not in the search results",
  "not mentioned in",
  "unable to find",
  "no matches for",
  "no results for",
  "i'm not aware of",
  "i am not aware of",
  "i'm not familiar with",
  "i am not familiar with",
  "no direct match",
  "not found in",
  "doesn't exist in",
];

function isRefusalAboutBrand(
  content: string,
  brandTokens: string[]
): boolean {
  const lower = content.toLowerCase();
  // If any refusal phrase appears within 200 chars of a brand token, it's
  // almost certainly the engine saying it doesn't know the brand.
  for (const token of brandTokens) {
    let idx = lower.indexOf(token);
    while (idx !== -1) {
      const windowStart = Math.max(0, idx - 200);
      const windowEnd = Math.min(lower.length, idx + token.length + 200);
      const slice = lower.slice(windowStart, windowEnd);
      for (const phrase of REFUSAL_PHRASES) {
        if (slice.includes(phrase)) return true;
      }
      idx = lower.indexOf(token, idx + 1);
    }
  }
  return false;
}

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

  const brandTokens = [lowerBrand, domainBase, lowerDomain].filter(
    (t, i, a) => t && a.indexOf(t) === i
  );

  const substringHit =
    lowerContent.includes(lowerBrand) ||
    lowerContent.includes(domainBase) ||
    lowerContent.includes(lowerDomain);

  // If the engine is refusing/disclaiming about this brand near every mention,
  // treat it as absent regardless of substring presence. This avoids false
  // positives like "Chedder does not appear in the results" being scored as
  // a prominent mention just because the word "Chedder" is in the text.
  const refused = substringHit && isRefusalAboutBrand(content, brandTokens);
  const mentioned = substringHit && !refused;

  const cited = citations.some(
    (c) =>
      c.toLowerCase().includes(lowerDomain) ||
      c.toLowerCase().includes(domainBase)
  );

  let position: "prominent" | "mentioned" | "absent" = "absent";
  let excerpt: string | null = null;

  // Build an excerpt centred on the first brand mention whether or not we
  // counted it as a real mention — it's useful context either way.
  if (substringHit) {
    const firstMentionIdx = Math.max(
      lowerContent.indexOf(lowerBrand),
      lowerContent.indexOf(domainBase)
    );
    if (firstMentionIdx >= 0) {
      const start = Math.max(0, firstMentionIdx - 80);
      const end = Math.min(content.length, firstMentionIdx + 200);
      excerpt = content.slice(start, end).trim();
      if (start > 0) excerpt = "..." + excerpt;
      if (end < content.length) excerpt = excerpt + "...";
    }
  }

  if (mentioned) {
    const firstMentionIdx = Math.max(
      lowerContent.indexOf(lowerBrand),
      lowerContent.indexOf(domainBase)
    );
    position =
      firstMentionIdx >= 0 && firstMentionIdx < content.length * 0.3
        ? "prominent"
        : "mentioned";
  }

  return { mentioned, cited, position, excerpt };
}

/* ── Main analyzer ───────────────────────────────────────────────── */

export async function analyzeAICitations(
  brand: string,
  domain: string,
  metaDescription: string | null
): Promise<{ module: ModuleResult; competitors: AICompetitor[] } | null> {
  const engines = configuredEngines();
  if (engines.length === 0) return null; // no keys configured → skip module

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

  // Derive a category from meta description (cheap heuristic)
  let category: string | null = null;
  if (metaDescription) {
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

  // Distribute the daily query budget across engines. cap.remainingQueriesToday
  // is the total daily allowance; each engine runs up to perEngine queries.
  const perEngine = Math.max(
    1,
    Math.min(
      allQueries.length,
      Math.floor(cap.remainingQueriesToday / engines.length)
    )
  );
  const queries = allQueries.slice(0, perEngine);

  // Fan out across engines. Engines marked `sequential` (Brave Answers at
  // 2 req/sec) run their queries one at a time with a small delay to stay
  // under the rate limit.
  const runEngine = async (engine: Engine): Promise<TaggedResponse[]> => {
    const out: TaggedResponse[] = [];
    if (engine.sequential) {
      for (const q of queries) {
        const response = await engine.ask(q.query);
        out.push({ engine: engine.name, spec: q, response });
        // 600ms keeps us safely under 2 req/sec.
        await new Promise((r) => setTimeout(r, 600));
      }
      return out;
    }
    const settled = await Promise.all(
      queries.map(async (q) => ({
        engine: engine.name,
        spec: q,
        response: await engine.ask(q.query),
      }))
    );
    return settled;
  };

  const perEngineResults = await Promise.all(engines.map(runEngine));
  const results = perEngineResults.flat();

  const usedQueries = results.filter((r) => r.response !== null).length;
  await recordSpend(usedQueries);

  /* ── Build findings (tagged per engine) ────────────────────────── */

  const findings: Finding[] = [];
  const recommendations: Recommendation[] = [];

  // Per-engine aggregate counters (used for per-engine score + recs)
  const byEngine: Record<
    EngineName,
    { total: number; answered: number; mentioned: number; prominent: number; cited: number }
  > = {
    perplexity: { total: 0, answered: 0, mentioned: 0, prominent: 0, cited: 0 },
    openai: { total: 0, answered: 0, mentioned: 0, prominent: 0, cited: 0 },
    brave: { total: 0, answered: 0, mentioned: 0, prominent: 0, cited: 0 },
  };

  const engineLabelOf = (name: EngineName): string => {
    const e = engines.find((x) => x.name === name);
    return e?.label || name;
  };

  const firstSnippet = (content: string, maxLen = 260): string => {
    const cleaned = content
      .replace(/\[\d+\]/g, "")
      .replace(/^#+\s*/gm, "")
      .replace(/\*\*/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned.length <= maxLen) return cleaned;
    const sliced = cleaned.slice(0, maxLen);
    const lastStop = Math.max(
      sliced.lastIndexOf(". "),
      sliced.lastIndexOf("! "),
      sliced.lastIndexOf("? ")
    );
    if (lastStop > maxLen * 0.5) return sliced.slice(0, lastStop + 1);
    return sliced.trimEnd() + "...";
  };

  const cleanExcerpt = (raw: string | null): string | undefined => {
    if (!raw) return undefined;
    const cleaned = raw
      .replace(/\[\d+\]/g, "")
      .replace(/\*\*/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return cleaned || undefined;
  };

  const firstCitation = (citations: string[]): string | undefined => {
    for (const url of citations) {
      try {
        new URL(url);
        return url;
      } catch {
        // skip
      }
    }
    return undefined;
  };

  const pickTopCitedBrands = (citations: string[]): string[] => {
    const brands: string[] = [];
    for (const url of citations) {
      try {
        const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
        const root = rootDomain(host);
        if (NON_COMPETITOR_DOMAINS.has(root) || NON_COMPETITOR_DOMAINS.has(host))
          continue;
        if (root === rootDomain(domain.replace(/^www\./, ""))) continue;
        if (!brands.includes(root)) brands.push(root);
        if (brands.length >= 3) break;
      } catch {
        // skip
      }
    }
    return brands;
  };

  for (const { engine, spec, response } of results) {
    const engineLabel = engineLabelOf(engine);
    const scenarioLabel = `${engineLabel} · ${spec.scenario}`;
    const eb = byEngine[engine];
    eb.total++;

    if (!response) {
      findings.push({
        label: scenarioLabel,
        status: "warn",
        detail: `${engineLabel} query failed. We will retry next audit.`,
      });
      continue;
    }
    eb.answered++;

    const analysis = analyzeCitation(
      response.content,
      response.citations,
      brand,
      domain
    );

    if (analysis.position === "prominent") {
      eb.mentioned++;
      eb.prominent++;
      findings.push({
        label: scenarioLabel,
        status: "pass",
        detail: `${brand} is mentioned prominently in the ${engineLabel} answer.`,
        excerpt: cleanExcerpt(analysis.excerpt),
        highlight: brand,
        sourceUrl: firstCitation(response.citations),
      });
    } else if (analysis.position === "mentioned") {
      eb.mentioned++;
      findings.push({
        label: scenarioLabel,
        status: "warn",
        detail: `${brand} is mentioned, but not among the top recommendations in the ${engineLabel} answer.`,
        excerpt: cleanExcerpt(analysis.excerpt),
        highlight: brand,
        sourceUrl: firstCitation(response.citations),
      });
    } else {
      const recommended = pickTopCitedBrands(response.citations);
      // If analyzeCitation returned an excerpt, the brand name appeared in
      // the text but was refused (e.g. "X does not appear in results"). Use
      // that excerpt so the user sees exactly how the engine disclaimed it.
      const excerpt = analysis.excerpt
        ? cleanExcerpt(analysis.excerpt)
        : firstSnippet(response.content);
      const detail = analysis.excerpt
        ? `${engineLabel} did not recognize ${brand} in its answer.`
        : recommended.length > 0
          ? `${brand} is not mentioned by ${engineLabel}. It recommended ${recommended.join(
              ", "
            )} instead.`
          : `${brand} is not mentioned in the ${engineLabel} answer.`;
      findings.push({
        label: scenarioLabel,
        status: "fail",
        detail,
        excerpt,
        highlight: brand,
        sourceUrl: firstCitation(response.citations),
      });
    }

    if (analysis.cited) eb.cited++;
  }

  /* ── Score (averaged across engines that actually ran) ─────────── */

  const engineScores: number[] = [];
  const engineSummary: string[] = [];
  let totalMentioned = 0;
  let totalProminent = 0;
  let totalCited = 0;
  let totalAnswered = 0;

  for (const engine of engines) {
    const eb = byEngine[engine.name];
    if (eb.total === 0) continue;
    const denom = eb.total;
    const mentionRate = eb.mentioned / denom;
    const prominentRate = eb.prominent / denom;
    const citationRate = eb.cited / denom;
    const engineScore = Math.round(
      mentionRate * 40 + prominentRate * 40 + citationRate * 20
    );
    engineScores.push(engineScore);
    engineSummary.push(
      `${engine.label} ${eb.mentioned}/${eb.total}`
    );
    totalMentioned += eb.mentioned;
    totalProminent += eb.prominent;
    totalCited += eb.cited;
    totalAnswered += eb.answered;
  }

  const score =
    engineScores.length > 0
      ? Math.round(
          engineScores.reduce((a, b) => a + b, 0) / engineScores.length
        )
      : 0;

  /* ── Recommendations ───────────────────────────────────────────── */

  if (totalMentioned === 0 && totalAnswered > 0) {
    recommendations.push({
      priority: "high",
      title: "Your Brand Is Invisible to AI",
      description: `None of the AI engines we tested (${engines
        .map((e) => e.label)
        .join(", ")}) mentioned ${brand}. Focus on earning authoritative mentions on Wikipedia, Reddit, G2, news publications, and industry directories.`,
    });
  } else if (totalProminent === 0 && totalMentioned > 0) {
    recommendations.push({
      priority: "high",
      title: "Improve Prominence in AI Responses",
      description: `${brand} is mentioned but always toward the end of responses. AI models list "leading" brands first. Build topical authority through comprehensive content and third-party endorsements.`,
    });
  }

  if (totalCited === 0 && totalMentioned > 0) {
    recommendations.push({
      priority: "high",
      title: "Your Site Isn't Being Cited Directly",
      description: `AI mentions ${brand} but cites other sources (reviews, Wikipedia, news). Optimize your own content to become a direct citation source: add FAQs, structured data, and authoritative statistics.`,
    });
  }

  // Flag per-engine gaps so users see which engines they're weak on
  if (engines.length > 1) {
    const weakEngines = engines
      .map((e) => ({ label: e.label, eb: byEngine[e.name] }))
      .filter(({ eb }) => eb.total > 0 && eb.mentioned === 0);
    if (
      weakEngines.length > 0 &&
      weakEngines.length < engines.length // don't duplicate the "invisible everywhere" rec
    ) {
      recommendations.push({
        priority: "medium",
        title: `Missing from ${weakEngines.map((w) => w.label).join(", ")}`,
        description: `You appear in some AI engines but not others. Different engines weight different signals — ${weakEngines
          .map((w) => w.label)
          .join(
            ", "
          )} lean harder on recent web content, structured data, and high-authority backlinks. Publish fresh content that targets your core categories and earn links from industry publications.`,
      });
    }
  }

  /* ── Merge competitors across all engines ──────────────────────── */

  const aiCompetitors = extractCompetitorsFromResponses(results, domain);

  const engineList = engines.map((e) => e.label).join(", ");
  const description =
    engines.length > 1
      ? `Real queries tested across ${engineList} — ${engineSummary.join(
          " · "
        )}`
      : `Real queries tested on ${engineList} (${usedQueries}/${results.length} queries ran)`;

  return {
    module: {
      name: "AI Citation Testing",
      slug: "ai-citations",
      score,
      icon: "🤖",
      description,
      findings,
      recommendations,
    },
    competitors: aiCompetitors,
  };
}
