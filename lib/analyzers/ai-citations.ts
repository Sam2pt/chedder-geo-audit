import { AICompetitor, Finding, ModuleResult, Recommendation } from "../types";
import { checkSpendCap, recordSpend } from "../spend-cap";

// Domains we never want to count as competitors. Populated from real
// dogfood noise — every addition represents a false positive we saw.
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
  "dev.to",
  "hashnode.dev",
  // Code / Q&A
  "github.com",
  "gitlab.com",
  "bitbucket.org",
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
  "economist.com",
  "ft.com",
  "fastcompany.com",
  // Review / directory sites (they list every vendor — not competitors)
  "g2.com",
  "capterra.com",
  "trustpilot.com",
  "gartner.com",
  "trustradius.com",
  "getapp.com",
  "softwareadvice.com",
  "producthunt.com",
  "alternativeto.net",
  "saashub.com",
  "slashdot.org",
  // Listicle/publisher sites we saw repeatedly in dogfood
  "techradar.com",
  "nerdwallet.com",
  "zdnet.com",
  "pcmag.com",
  "cnet.com",
  "tomsguide.com",
  "tomshardware.com",
  "thedigitalprojectmanager.com",
  "paymentnerds.com",
  "swipesum.com",
  "investopedia.com",
  "wirecutter.com",
  "engadget.com",
  "mashable.com",
  "makeuseof.com",
  "howtogeek.com",
  "digitaltrends.com",
  "lifehacker.com",
  // Funding / employer / salary directories
  "crunchbase.com",
  "pitchbook.com",
  "dealroom.co",
  "ycombinator.com",
  "news.ycombinator.com",
  "contrary.com",
  "vault.com",
  "glassdoor.com",
  "levels.fyi",
  "builtin.com",
  "comparably.com",
  "owler.com",
  "zoominfo.com",
  // Integration / automation platforms (cited on every SaaS integration page)
  "zapier.com",
  "make.com",
  "n8n.io",
  "ifttt.com",
  "pipedream.com",
  "workato.com",
  "tray.io",
  "integromat.com",
  // AI model providers (Linear.app audits kept citing openai.com)
  "openai.com",
  "anthropic.com",
  "cohere.com",
  "mistral.ai",
  "perplexity.ai",
  // Search / general
  "google.com",
  "bing.com",
  "yahoo.com",
  "duckduckgo.com",
  "brave.com",
  // Big tech / infra defaults
  "amazon.com",
  "aws.amazon.com",
  "apple.com",
  "microsoft.com",
  "azure.com",
  "cloudflare.com",
  "vercel.com",
  "netlify.com",
  // App stores
  "apps.apple.com",
  "play.google.com",
  "chromewebstore.google.com",
  // Retailers / marketplaces (NOT competitors to DTC brands — they resell)
  "walmart.com",
  "target.com",
  "ebay.com",
  "bestbuy.com",
  "costco.com",
  "costcowholesale.com",
  "samsclub.com",
  "wayfair.com",
  "overstock.com",
  "etsy.com",
  "macys.com",
  "nordstrom.com",
  "bloomingdales.com",
  "kohls.com",
  "jcpenney.com",
  "homedepot.com",
  "lowes.com",
  "petco.com",
  "petsmart.com",
  "chewy.com",
  "sephora.com",
  "ulta.com",
  "rei.com",
  "dickssportinggoods.com",
  "shein.com",
  "temu.com",
  "aliexpress.com",
  "alibaba.com",
  // Consumer review/lifestyle publishers
  "goodhousekeeping.com",
  "consumerreports.org",
  "wirecutter.com",
  "nytimes.com",
  "nymag.com",
  "thestrategist.nymag.com",
  "realsimple.com",
  "bonappetit.com",
  "epicurious.com",
  "foodandwine.com",
  "bhg.com",
  "apartmenttherapy.com",
  "architecturaldigest.com",
  "elle.com",
  "vogue.com",
  "cosmopolitan.com",
  "allure.com",
  "harpersbazaar.com",
  "glamour.com",
  "self.com",
  "shape.com",
  "menshealth.com",
  "womenshealthmag.com",
  "runnersworld.com",
  "mensjournal.com",
  "gq.com",
  "esquire.com",
  "rollingstone.com",
  "thespruce.com",
  "thespruceeats.com",
  "thespruepets.com",
  "dogster.com",
  "cattime.com",
  "americankennelclub.org",
  "akc.org",
  "buzzfeed.com",
  "parade.com",
  "people.com",
  "usmagazine.com",
  "popsugar.com",
  "housebeautiful.com",
  "elledecor.com",
  "marthastewart.com",
  "countryliving.com",
  "pianobuyer.com",
  "pianoworld.com",
  "reviewed.com",
  "usatoday.com",
  "today.com",
  "cnn.com",
  // Aggregators / deal sites
  "dealnews.com",
  "slickdeals.net",
  "rakuten.com",
  "retailmenot.com",
  "honey.com",
  "capitaloneshopping.com",
]);

// Well-known product → domain overrides for names whose brand doesn't
// follow the "firstword.com" default. Populated from dogfood where we
// saw a brand named in prose but couldn't resolve the domain correctly.
const PRODUCT_DOMAIN_OVERRIDES: Record<string, string> = {
  // --- DTC: mattresses / sleep -----------------------------------------
  casper: "casper.com",
  purple: "purple.com",
  saatva: "saatva.com",
  nectar: "nectarsleep.com",
  helix: "helix.com",
  "helix sleep": "helix.com",
  tempurpedic: "tempurpedic.com",
  "tempur-pedic": "tempurpedic.com",
  "bear mattress": "bearmattress.com",
  avocado: "avocadogreenmattress.com",
  brooklinen: "brooklinen.com",
  "tuft & needle": "tuftandneedle.com",
  tuftandneedle: "tuftandneedle.com",
  leesa: "leesa.com",
  "layla sleep": "laylasleep.com",
  layla: "laylasleep.com",
  awara: "awarasleep.com",
  // --- DTC: pet -----------------------------------------
  barkbox: "barkbox.com",
  superchewer: "superchewer.com",
  "super chewer": "superchewer.com",
  pupbox: "pupbox.com",
  pupjoy: "pupjoy.com",
  kong: "kongcompany.com",
  "west paw": "westpaw.com",
  "big barker": "bigbarker.com",
  "pet fusion": "petfusion.com",
  petfusion: "petfusion.com",
  "brentwood home": "brentwoodhome.com",
  // --- DTC: apparel / footwear -----------------------------------------
  allbirds: "allbirds.com",
  rothy: "rothys.com",
  rothys: "rothys.com",
  warby: "warbyparker.com",
  "warby parker": "warbyparker.com",
  bonobos: "bonobos.com",
  everlane: "everlane.com",
  lululemon: "lululemon.com",
  nike: "nike.com",
  adidas: "adidas.com",
  "new balance": "newbalance.com",
  hoka: "hoka.com",
  brooks: "brooksrunning.com",
  asics: "asics.com",
  "on running": "on.com",
  vuori: "vuoriclothing.com",
  "outdoor voices": "outdoorvoices.com",
  // --- DTC: food / candy / snacks --------------------------------------
  sugarfina: "sugarfina.com",
  vosges: "vosgeschocolate.com",
  "vosges haut-chocolat": "vosgeschocolate.com",
  theochocolate: "theochocolate.com",
  "theo chocolate": "theochocolate.com",
  hu: "hukitchen.com",
  "hu kitchen": "hukitchen.com",
  "hu chocolate": "hukitchen.com",
  godiva: "godiva.com",
  ghirardelli: "ghirardelli.com",
  lindt: "lindt.com",
  see: "sees.com",
  "see's candies": "sees.com",
  jeni: "jenis.com",
  "jeni's": "jenis.com",
  magnum: "magnumicecream.com",
  halotop: "halotop.com",
  "halo top": "halotop.com",
  // --- DTC: beauty / personal care -------------------------------------
  glossier: "glossier.com",
  harry: "harrys.com",
  harrys: "harrys.com",
  dollar: "dollarshaveclub.com",
  dollarshaveclub: "dollarshaveclub.com",
  native: "nativecos.com",
  "native deodorant": "nativecos.com",
  billie: "mybillie.com",
  flamingo: "shopflamingo.com",
  lola: "mylola.com",
  ritual: "ritual.com",
  oura: "ouraring.com",
  "oura ring": "ouraring.com",
  // --- DTC: home / kitchen ---------------------------------------------
  "parachute home": "parachutehome.com",
  parachute: "parachutehome.com",
  boll: "bollandbranch.com",
  bollandbranch: "bollandbranch.com",
  "boll & branch": "bollandbranch.com",
  yeti: "yeti.com",
  hydroflask: "hydroflask.com",
  "hydro flask": "hydroflask.com",
  stanley: "stanley1913.com",
  owala: "owalalife.com",
  liquiddeath: "liquiddeath.com",
  "liquid death": "liquiddeath.com",
  // --- Pianos / instruments --------------------------------------------
  steinway: "steinway.com",
  yamaha: "yamaha.com",
  kawai: "kawai-global.com",
  roland: "roland.com",
  casio: "casio.com",
  korg: "korg.com",
  bechstein: "bechstein.com",
  bluthner: "bluethner.com",
  "blüthner": "bluethner.com",
  fazioli: "fazioli.com",
  // --- SaaS overrides kept for non-DTC spillover -----------------------
  jira: "atlassian.com",
  confluence: "atlassian.com",
  trello: "atlassian.com",
  notion: "notion.so",
  "monday.com": "monday.com",
  "monday": "monday.com",
  asana: "asana.com",
  clickup: "clickup.com",
  smartsheet: "smartsheet.com",
  linear: "linear.app",
  basecamp: "basecamp.com",
  airtable: "airtable.com",
  paypal: "paypal.com",
  square: "squareup.com",
  braintree: "braintreepayments.com",
  adyen: "adyen.com",
  stripe: "stripe.com",
  shopify: "shopify.com",
};

// Extract product names from an AI answer. AI listicles predictably use:
//   - Markdown bold:  **Asana**, **Monday.com**
//   - Numbered lists with bold:  "1. **Asana** - ..."
//   - Bare domains:  "asana.com", "stripe.com"
// We skip the enclosing prose parsing and just mine these structural
// signals — cheap and high-precision.
function extractProductMentionsFromText(content: string): string[] {
  const names = new Set<string>();

  // Markdown bold:  **Name** — must start with a capital letter so we
  // don't catch emphasis on common words.
  for (const m of content.matchAll(
    /\*\*([A-Z][A-Za-z0-9.\s&'\-]{1,40})\*\*/g
  )) {
    const cleaned = m[1].trim();
    if (cleaned.length >= 2 && cleaned.length <= 40) names.add(cleaned);
  }

  // Bare domain mentions:  asana.com, stripe.com, coda.io
  for (const m of content.matchAll(
    /\b([a-z][a-z0-9-]{1,30}\.(?:com|io|app|ai|co|dev|so|net|org))\b/gi
  )) {
    names.add(m[1].toLowerCase());
  }

  return Array.from(names);
}

// Resolve a batch of brand/product names to their canonical domains using
// an LLM. The model already knows thousands of DTC brand-to-domain
// mappings — this is dramatically more reliable than firstword.com
// guessing, and scales to any consumer vertical without a hand-curated
// dictionary. Returns a Map from lowercased name → domain; unknown names
// are omitted (not returned) so the caller can fall back to the local
// resolver for those.
async function resolveBrandDomainsLLM(
  names: string[],
  category: string | null
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || names.length === 0) return out;

  // Dedupe + clamp — no need to pay for repeats or absurdly long names.
  const unique = Array.from(
    new Set(
      names
        .map((n) => n.trim())
        .filter((n) => n.length >= 2 && n.length <= 60)
    )
  ).slice(0, 40);
  if (unique.length === 0) return out;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 600,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You resolve consumer brand names to their official website domains. For each input name, return its canonical domain ONLY if you are confident it is a real direct-to-consumer or consumer-goods brand (e.g. Casper → casper.com, Bear Mattress → bearmattress.com, Nectar → nectarsleep.com, Allbirds → allbirds.com). Skip names you are unsure about, names that are generic words, retailers (Amazon, Target), publishers (Wirecutter), or anything that isn't a product brand. Return JSON in the exact shape {\"brands\": [{\"name\": <input verbatim>, \"domain\": <lowercase domain, no www, no path>}]}.",
          },
          {
            role: "user",
            content: `Category context: ${category || "consumer products"}\n\nNames to resolve:\n${unique.map((n) => `- ${n}`).join("\n")}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.warn(
        `[ai-citations] brand resolver HTTP ${res.status} ${res.statusText}`
      );
      return out;
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as {
      brands?: Array<{ name?: string; domain?: string }>;
    };
    for (const b of parsed.brands ?? []) {
      if (!b.name || !b.domain) continue;
      const name = b.name.trim().toLowerCase();
      const domain = b.domain
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .replace(/\/.*$/, "");
      if (!/^[a-z0-9-]+\.[a-z]{2,}(\.[a-z]{2,})?$/.test(domain)) continue;
      out.set(name, domain);
    }
  } catch (e) {
    console.warn(
      "[ai-citations] brand resolver error:",
      e instanceof Error ? e.message : e
    );
  }
  return out;
}

// Map a product name (or a bare domain) to a registrable domain we can
// count as a competitor. Returns null if the name can't be resolved or
// looks like a false positive.
function productNameToDomain(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;

  // Already looks like a domain → normalize.
  if (/^[a-z][a-z0-9-]*\.[a-z]{2,}/i.test(trimmed)) {
    return trimmed.toLowerCase().replace(/^www\./, "");
  }

  // Override lookup (handles Jira → atlassian.com, Notion → notion.so etc).
  const key = trimmed.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  if (PRODUCT_DOMAIN_OVERRIDES[key]) return PRODUCT_DOMAIN_OVERRIDES[key];

  // Default guess:  firstword.com. Covers the 80% case (Asana → asana.com,
  // Square → square.com, Shopify → shopify.com).
  const firstWord = trimmed
    .split(/\s+/)[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (firstWord.length < 3 || firstWord.length > 30) return null;
  return firstWord + ".com";
}

// Extract competing brand names from AI-generated shopping answer prose,
// and resolve them to canonical domains — in a single LLM pass. This is
// the primary competitor signal path: regex can only catch **bold** names
// and bare domains, but AI answers often name peers in plain text
// ("Back to Nature Classic Creme Cookies..."). An LLM that reads the
// whole answer catches those, handles name-to-domain mapping, and filters
// retailers/publishers via the system prompt in one shot.
//
// Input: array of {engine, scenario, content} tuples from the engines.
// Output: Map<root-domain, Set<EngineName>> — which engines mentioned each
// competitor. Cross-engine agreement is applied downstream.
//
// Cost: one gpt-4o-mini call per audit regardless of engine count.
// ~$0.0003 at typical answer lengths. Returns an empty map on any failure
// so the regex-based fallback can still populate competitors.
interface ExtractedBrandRef {
  name: string;
  domain: string;
  engines: Array<"perplexity" | "openai" | "brave">;
}

async function extractBrandsFromAnswersLLM(
  responses: Array<{
    engine: "perplexity" | "openai" | "brave";
    content: string;
  }>,
  ownBrand: string,
  ownDomain: string,
  category: string | null
): Promise<ExtractedBrandRef[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || responses.length === 0) return [];

  // Cap the prose we send so we don't blow the context window for long
  // answers — 1500 chars per answer is plenty for brand name extraction.
  const corpus = responses
    .map(
      (r) =>
        `--- ${r.engine} ---\n${r.content.slice(0, 1500).replace(/\s+/g, " ").trim()}`
    )
    .join("\n\n");

  const systemPrompt = `You extract consumer product BRAND mentions from AI-generated shopping answers, for a competitor analysis.

Rules — include a brand only if:
- It is a real, recognizable consumer product brand (not a product line, variant, or SKU).
- It competes in or is adjacent to the given category.
- It is NOT the target brand (exclude variants like "Brand Sleep", "Brand Co", "Brand, Inc.").
- It is NOT a retailer (Amazon, Walmart, Target, Best Buy, Costco, Chewy, Petco, Sephora, etc.).
- It is NOT a publisher/review site (Wirecutter, NYT Strategist, Good Housekeeping, Consumer Reports, TechRadar, Sporked, etc.).
- It is NOT a generic category word (e.g. "alkaline water", "dark chocolate").

For each qualifying brand, return:
  name: as it appears in the text
  domain: canonical official website, lowercase, no www/path/protocol
  engines: which of the provided engine sections mentioned it — use the engine keys exactly as in the source ("perplexity", "openai", "brave")

Return ONLY valid JSON in this exact shape:
{ "brands": [ { "name": "...", "domain": "...", "engines": ["perplexity","openai"] } ] }

Only include brands you are CONFIDENT about. Skip if you are unsure.`;

  const userPrompt = `TARGET BRAND: ${ownBrand} (${ownDomain})
CATEGORY: ${category || "(unknown)"}

ANSWERS:
${corpus}`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 900,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      console.warn(
        `[ai-citations] brand extractor HTTP ${res.status} ${res.statusText}`
      );
      return [];
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as {
      brands?: Array<{
        name?: string;
        domain?: string;
        engines?: string[];
      }>;
    };
    const out: ExtractedBrandRef[] = [];
    for (const b of parsed.brands ?? []) {
      if (!b.name || !b.domain) continue;
      const name = b.name.trim();
      const domain = b.domain
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .replace(/\/.*$/, "");
      if (!/^[a-z0-9-]+\.[a-z]{2,}(\.[a-z]{2,})?$/.test(domain)) continue;
      const engines = (b.engines ?? [])
        .map((e) => e.toLowerCase())
        .filter((e): e is "perplexity" | "openai" | "brave" =>
          e === "perplexity" || e === "openai" || e === "brave"
        );
      if (engines.length === 0) continue;
      out.push({ name, domain, engines });
    }
    return out;
  } catch (e) {
    console.warn(
      "[ai-citations] brand extractor error:",
      e instanceof Error ? e.message : e
    );
    return [];
  }
}

// Only pull competitor candidates from scenarios that explicitly ask the AI
// to list competing products. Citations from "tell me about X" or "is X
// trustworthy" are primarily sources about the brand itself (integration
// partners, VC pages, press), not competitors — they polluted ~100% of
// early results with garbage.
const COMPETITOR_SCENARIO_KEYWORDS = [
  "best ",
  "alternative",
  "alternatives",
  "similar to",
  "companies similar",
  "tools similar",
  "brands similar",
  "lead the",
  "lead the market",
  "needs to pick",
  "needs to choose",
  "is choosing",
  "most recommended",
  "stand out",
];

function isCompetitorScenario(scenario: string): boolean {
  const s = scenario.toLowerCase();
  return COMPETITOR_SCENARIO_KEYWORDS.some((k) => s.includes(k));
}

// Extract a "brand token" from a domain root so we can check if it's
// actually referenced in the answer text. e.g. "asana.com" → "asana".
function domainToToken(root: string): string {
  return root.split(".")[0];
}

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

/**
 * User-facing category for each engine. We intentionally hide the
 * specific tool names from the audit output because the typical CPG
 * customer doesn't know what Perplexity or Brave Search are — "AI chats"
 * and "AI search" are the conceptual buckets they already think in.
 */
type EngineCategory = "AI chats" | "AI search";
const ENGINE_CATEGORIES: Record<EngineName, EngineCategory> = {
  openai: "AI chats",
  perplexity: "AI search",
  brave: "AI search",
};

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
      label: "Brave Search",
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

// Infer what category of product/service this brand competes in. Returns a
// 2–5 word phrase like "project management software", "payment processing",
// "email marketing platforms". Returns null if OPENAI_API_KEY is absent or
// the call fails — caller should then fall back to the regex heuristic.
//
// Uses chat/completions (not Responses API) because we don't want web
// search and don't need streaming; ~100 input / ~10 output tokens per call
// on gpt-4o-mini = roughly $0.00002 per audit.
async function inferCategoryLLM(
  brand: string,
  domain: string,
  metaDescription: string | null
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  if (!metaDescription) return null;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 30,
        messages: [
          {
            role: "system",
            content:
              "You identify the specific consumer product category a brand competes in, so a shopper can ask AI tools like ChatGPT for recommendations in that category without naming the brand. This covers the full consumer packaged goods (CPG) range — both direct-to-consumer startups and traditional retail brands. Reply with ONLY a 2–5 word consumer product category. Good examples: 'sandwich cookies' (not 'snacks'), 'laundry detergent', 'toothpaste', 'dog beds', 'memory foam mattresses', 'running shoes for women', 'dark chocolate bars', 'digital pianos', 'meal kit subscriptions', 'camera bags', 'insulated drinkware'. Prefer the most specific product category you are confident about — 'sandwich cookies' is better than 'cookies', 'laundry detergent' better than 'cleaning products'. Avoid retail/service framing ('mattress retail', 'grocery store') — use the product itself. No preamble, no quotes, no punctuation.",
          },
          {
            role: "user",
            content: `Brand: ${brand}\nDomain: ${domain}\nDescription: ${metaDescription.slice(0, 400)}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.warn(
        `[ai-citations] category inference HTTP ${res.status} ${res.statusText}`
      );
      return null;
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
    // Sanity check: reject anything with punctuation the prompt forbade,
    // anything that mentions the brand itself (would leak brand-awareness
    // back into our "discovery-intent" queries), and anything silly long.
    // Allow 1-word categories — "cola", "diapers", "toothpaste" are all
    // perfectly valid and produce great discovery queries.
    const cleaned = raw.replace(/["'.]/g, "").trim().toLowerCase();
    if (!cleaned) return null;
    if (cleaned.length > 60) return null;
    if (cleaned.length < 3) return null;
    if (cleaned.includes(brand.toLowerCase())) return null;
    const wordCount = cleaned.split(/\s+/).length;
    if (wordCount < 1 || wordCount > 6) return null;
    return cleaned;
  } catch (e) {
    console.warn(
      "[ai-citations] category inference error:",
      e instanceof Error ? e.message : e
    );
    return null;
  }
}

/**
 * Ask the LLM to suggest two category-tailored shopper queries for this
 * specific brand. The baseline discovery set ("best X", "pick X",
 * "market leaders X") is generic enough to miss niche strengths — a
 * premium chocolate maker gets ignored in "best chocolate" but
 * dominates "best single-origin dark chocolate." These extra queries
 * probe the specific shopper intents most relevant to the brand's
 * positioning.
 *
 * Returns [] on any failure — the audit still runs its baseline set.
 * Costs roughly $0.00005 per audit on gpt-4o-mini with JSON mode.
 */
async function generateTailoredQueriesLLM(
  brand: string,
  domain: string,
  category: string | null,
  metaDescription: string | null
): Promise<QuerySpec[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !category) return [];

  const systemPrompt = `You write realistic shopper questions to test whether a consumer brand gets recommended by AI. Given a brand, its category, and a short description, propose TWO discovery queries a real shopper might type into ChatGPT. The queries must:
- NOT name the brand (we're testing whether AI recommends them unprompted)
- Probe a specific shopper intent the brand might actually win: a use case ("for marathon training"), an attribute ("organic", "sustainable", "hypoallergenic"), a price tier ("budget", "premium"), a persona ("for older dogs", "for beginners"), or a quality signal
- Be distinct from these generic baseline queries we already run:
    "best {category}"
    "I'm looking to buy {category}, which brands should I consider"
    "which {category} brands are the most recommended"
- Read naturally, like a shopper typing, not like a search engine query

Return JSON in exactly this shape:
{
  "queries": [
    { "scenario": "<short noun-phrase title for the finding card>", "query": "<the exact question a shopper would ask>" },
    { "scenario": "...", "query": "..." }
  ]
}

Scenario examples:
  "When a shopper asks for the best budget {category}"
  "When a shopper asks for organic {category}"
  "When a shopper asks for {category} for sensitive skin"
  "When a shopper asks which {category} last the longest"`;

  const userPrompt = `Brand: ${brand}
Domain: ${domain}
Category: ${category}
Description: ${(metaDescription ?? "").slice(0, 400)}`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        max_tokens: 250,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.warn(
        `[ai-citations] tailored query gen HTTP ${res.status} ${res.statusText}`
      );
      return [];
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as {
      queries?: Array<{ scenario?: string; query?: string }>;
    };
    const out: QuerySpec[] = [];
    for (const q of parsed.queries ?? []) {
      if (typeof q.scenario !== "string" || typeof q.query !== "string") continue;
      const scenario = q.scenario.trim().slice(0, 120);
      const query = q.query.trim().slice(0, 500);
      if (scenario.length < 6 || query.length < 10) continue;
      // Guard: the LLM must not leak the brand name into the query
      // (that defeats the whole "brand-unaware" point of discovery).
      if (query.toLowerCase().includes(brand.toLowerCase())) continue;
      out.push({ scenario, query });
      if (out.length >= 2) break;
    }
    return out;
  } catch (e) {
    console.warn(
      "[ai-citations] tailored query gen error:",
      e instanceof Error ? e.message : e
    );
    return [];
  }
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

async function extractCompetitorsFromResponses(
  responses: TaggedResponse[],
  ownBrand: string,
  ownDomain: string,
  category: string | null
): Promise<AICompetitor[]> {
  const ownRoot = rootDomain(ownDomain);
  const ownToken = domainToToken(ownRoot);
  // Track candidates by registrable domain. We count how many distinct
  // ENGINES mentioned the candidate — cross-engine agreement is our main
  // relevance signal. A single-engine, single-query mention (the long tail
  // of listicle noise: laneapp.co, guideflow.com, melp.us) almost never
  // represents a real competitor.
  const counts = new Map<
    string,
    {
      domain: string;
      engines: Set<EngineName>;
      queries: Set<string>;
    }
  >();

  // Helper: add a candidate root domain under a specific engine + scenario.
  const addCandidate = (
    root: string,
    engine: EngineName,
    scenario: string
  ) => {
    if (!root) return;
    if (NON_COMPETITOR_DOMAINS.has(root)) return;
    if (root === ownRoot) return;
    const token = domainToToken(root);
    if (token.length < 3) return;
    if (token === ownToken) return;
    if (!counts.has(root)) {
      counts.set(root, {
        domain: root,
        engines: new Set(),
        queries: new Set(),
      });
    }
    const entry = counts.get(root)!;
    entry.engines.add(engine);
    entry.queries.add(scenario);
  };

  // ── Source 1: LLM prose extractor ──────────────────────────────────
  // Single call reads full answer text across all competitor-scenario
  // responses and returns structured {name, domain, engines} tuples.
  // Catches plain-text brand mentions that the regex misses ("Back to
  // Nature", "Newman-O's") and resolves them to canonical domains in
  // the same step.
  const competitorResponses = responses.filter(
    (r) => r.response && isCompetitorScenario(r.spec.scenario)
  );
  const proseInput = competitorResponses.map((r) => ({
    engine: r.engine,
    content: r.response!.content,
  }));
  const llmBrands = await extractBrandsFromAnswersLLM(
    proseInput,
    ownBrand,
    ownDomain,
    category
  );
  for (const b of llmBrands) {
    const root = rootDomain(b.domain);
    // Attribute to every engine the LLM said mentioned this brand, under
    // the matching scenario for that engine's response. If we can't find
    // a matching scenario, use the first-seen competitor scenario.
    for (const engine of b.engines) {
      const r = competitorResponses.find((x) => x.engine === engine);
      const scenario = r?.spec.scenario ?? competitorResponses[0]?.spec.scenario;
      if (!scenario) continue;
      addCandidate(root, engine, scenario);
    }
  }

  // ── Source 2: regex-based prose extraction + overrides (safety net)
  //   Catches **bold** names and bare domains even if the LLM pass fails.
  const allNames = Array.from(
    new Set(
      competitorResponses.flatMap((r) =>
        extractProductMentionsFromText(r.response!.content)
      )
    )
  );
  const llmResolved = await resolveBrandDomainsLLM(allNames, category);
  const resolveName = (name: string): string | null => {
    const key = name.toLowerCase();
    const llm = llmResolved.get(key);
    if (llm) return llm;
    return productNameToDomain(name);
  };

  // ── Source 3: direct citation URLs from engine responses ────────────
  for (const { engine, spec, response } of competitorResponses) {
    for (const url of response!.citations) {
      try {
        const u = new URL(url);
        const host = u.hostname.replace(/^www\./, "").toLowerCase();
        addCandidate(rootDomain(host), engine, spec.scenario);
      } catch {
        // invalid URL
      }
    }
    for (const name of extractProductMentionsFromText(response!.content)) {
      const resolved = resolveName(name);
      if (resolved) addCandidate(rootDomain(resolved), engine, spec.scenario);
    }
  }

  // Count how many engines are configured this audit so we can scale the
  // threshold: with 1 engine, demand just that one mentioned it; with 2+,
  // demand at least 2-engine agreement.
  const distinctEngines = new Set(responses.map((r) => r.engine)).size;
  const minEngines = distinctEngines >= 2 ? 2 : 1;

  return Array.from(counts.values())
    .map((c) => ({
      domain: c.domain,
      // Public shape: `mentions` is the engine-agreement count (how many
      // distinct engines surfaced this competitor).
      mentions: c.engines.size,
      queries: Array.from(c.queries).slice(0, 3),
    }))
    .filter((c) => c.mentions >= minEngines)
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

  // --- Discovery intent (brand-unaware) -----------------------------------
  // The valuable signal: does the brand show up when a shopper who's never
  // heard of them asks AI for help shopping in the brand's category? Queries
  // use consumer-buying voice — "best X to buy", "which brand should I try"
  // — because Chedder serves DTC consumer brands.
  if (category) {
    queries.push({
      scenario: `When a shopper asks for the best ${category}`,
      query: `What are the best ${category} to buy right now? Give me your top brand recommendations with brief reasons.`,
    });
    queries.push({
      scenario: `When a shopper is choosing a ${category} brand`,
      query: `I'm looking to buy ${category}. Which brands should I consider and why?`,
    });
    queries.push({
      scenario: `When a shopper asks which ${category} brands are most recommended`,
      query: `Which ${category} brands are the most recommended in 2026, and what are they known for?`,
    });
  } else {
    // Fallback if we can't infer a category — ask AI for peer brands.
    queries.push({
      scenario: `When a shopper asks for brands similar to ${brand}`,
      query: `What are the top brands similar to ${brand}? Who are they and what do they make?`,
    });
    queries.push({
      scenario: `When a shopper asks for alternatives to ${brand}`,
      query: `What are the best alternatives to ${brand}? List the top options with pros and cons.`,
    });
  }

  // --- Brand-aware (verification) -----------------------------------------
  // Confirms the engine actually knows the brand and isn't confusing it
  // with a different entity (we use this for collision + refusal detection).
  queries.push({
    scenario: `When someone asks AI directly about ${brand}`,
    query: `Tell me about ${brand} (${domain}). What do they do and what are they known for?`,
  });

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
  "cannot find",
  "can't find",
  "unable to find",
  "no direct information",
  "no information about",
  "no information available",
  "no information was provided",
  "no reliable information",
  "no specific information",
  "no content about",
  "no data about",
  "no details about",
  "no results found",
  "no results for",
  "no matches for",
  "no direct match",
  "don't have information",
  "do not have information",
  "don't have details",
  "do not have details",
  "don't have specific",
  "do not have specific",
  "doesn't provide information",
  "not in the provided",
  "not in the search results",
  "not mentioned in",
  "not found in",
  "not listed in",
  "not referenced in",
  "not described in",
  "no mention of",
  "not present in",
  "doesn't exist in",
  "i'm not aware of",
  "i am not aware of",
  "i'm not familiar with",
  "i am not familiar with",
  "i have no information",
  "i do not have information",
  "without more context",
  "without additional context",
  "there is no information",
  "there's no information",
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

// Detect if the engine's citations point to a DIFFERENT site that happens
// to share the brand name (e.g. we asked about chedder.2pt.ai but the AI's
// top citation is chedder.io or getcheddar.com). This is a "name collision"
// where the engine is describing a different entity entirely.
function collidingCitations(
  citations: string[],
  brand: string,
  domain: string
): string[] {
  const brandLower = brand.toLowerCase();
  const ourHost = domain.toLowerCase().replace(/^www\./, "");
  const ourRoot = rootDomain(ourHost);
  const colliders = new Set<string>();
  for (const c of citations) {
    try {
      const host = new URL(c).hostname.replace(/^www\./, "").toLowerCase();
      if (host === ourHost || rootDomain(host) === ourRoot) continue;
      // Any label containing the brand name suggests a same-name collision.
      const labels = host.split(".");
      if (labels.some((l) => l.includes(brandLower))) {
        colliders.add(host);
      }
    } catch {
      // skip unparseable URLs
    }
  }
  return [...colliders];
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
  refused: boolean;
  collisionHosts: string[];
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

  // Detect when the engine's cited sources belong to a different, same-named
  // entity. We'll still report this (name collisions are actionable intel)
  // but downgrade it from "prominent" so it doesn't inflate the score.
  const collisionHosts = collidingCitations(citations, brand, domain);
  const hasCollision = collisionHosts.length > 0;

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
    // Name collisions cap at "mentioned" — we don't want a competing
    // same-name entity to count as a prominent mention of YOUR brand.
    position =
      !hasCollision && firstMentionIdx >= 0 && firstMentionIdx < content.length * 0.3
        ? "prominent"
        : "mentioned";
  }

  return { mentioned, cited, position, excerpt, refused, collisionHosts };
}

/* ── Main analyzer ───────────────────────────────────────────────── */

export async function analyzeAICitations(
  brand: string,
  domain: string,
  metaDescription: string | null
): Promise<{
  module: ModuleResult;
  competitors: AICompetitor[];
  /** The category the LLM (or regex fallback) inferred for the brand.
   *  Exposed so downstream quality-review can use it. */
  category: string | null;
  /** Flat list of every URL any engine cited across all probe queries.
   *  The destinations analyzer classifies these into own / marketplace /
   *  competitor / publisher / community / etc. */
  citations: string[];
  /** Distinct prices AI quoted for the audited brand across all probe
   *  queries (e.g. ["$1,099", "$1,299"]). Powers the competitive
   *  picture panel's "your price vs. theirs" view. */
  ownPrices: string[];
} | null> {
  const engines = configuredEngines();
  if (engines.length === 0) return null; // no keys configured → skip module

  const cap = await checkSpendCap();
  if (!cap.allowed || cap.remainingQueriesToday <= 0) {
    return {
      module: {
        name: "AI Search Visibility",
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
      category: null,
      citations: [],
      ownPrices: [],
    };
  }

  // Infer the brand's competitive category — this drives every
  // discovery-intent query. Prefer an LLM pass (accurate, ~$0.00001 per
  // audit) with a regex heuristic as a last-resort fallback when OPENAI_API_KEY
  // is missing or the call fails.
  let category: string | null = await inferCategoryLLM(
    brand,
    domain,
    metaDescription
  );
  if (!category && metaDescription) {
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

  const baselineQueries = generateQueries(brand, domain, category);

  // Fetch two category-tailored shopper queries in parallel with the
  // category prompt. Merged into the full query list so the niche-
  // strength probes get the same engine coverage as the baseline.
  const tailoredQueries = await generateTailoredQueriesLLM(
    brand,
    domain,
    category,
    metaDescription
  );
  const allQueries = [...baselineQueries, ...tailoredQueries];

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
  // 2 req/sec) stagger their starts by 600ms so we stay under the rate
  // limit but all queries run concurrently once started. Previously we
  // awaited each response before firing the next, which for 5 queries
  // turned a ~10s wall-clock bottleneck into ~50s and kept tailored
  // queries from shipping. Staggered concurrent keeps us under the
  // rate cap while finishing in max(startDelay, slowestQuery).
  const runEngine = async (engine: Engine): Promise<TaggedResponse[]> => {
    if (engine.sequential) {
      const promises: Promise<TaggedResponse>[] = [];
      for (let i = 0; i < queries.length; i++) {
        const q = queries[i];
        if (i > 0) await new Promise((r) => setTimeout(r, 600));
        promises.push(
          engine.ask(q.query).then((response) => ({
            engine: engine.name,
            spec: q,
            response,
          }))
        );
      }
      return Promise.all(promises);
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

  // Flat, dedup'd list of every URL any engine cited across all queries.
  // The destinations analyzer reads this to classify where AI is
  // actually sending people (own site, marketplaces, competitors, etc).
  const allCitations: string[] = [];
  const seenCitations = new Set<string>();
  for (const r of results) {
    if (!r.response?.citations) continue;
    for (const u of r.response.citations) {
      if (!u || seenCitations.has(u)) continue;
      seenCitations.add(u);
      allCitations.push(u);
    }
  }

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

  // First pass: bucket results by (scenario, engine category) so we can
  // surface ONE finding per scenario per category ("AI chats", "AI search")
  // instead of spamming three lines per scenario with tool names.
  type Bucket = {
    scenario: string;
    category: EngineCategory;
    engineCount: number;
    prominentCount: number;
    mentionedCount: number;
    answeredCount: number;
    failedCount: number;
    refusedCount: number;
    collisionHosts: string[];
    bestExcerpt: string | null;
    bestSourceUrl: string | undefined;
    bestRecommended: string[];
    /** Track engines with no response so we can warn if the whole
     *  category failed to answer. */
    unreachableCount: number;
  };
  const buckets = new Map<string, Bucket>();

  for (const { engine, spec, response } of results) {
    // Per-engine aggregates for the score (unchanged — we still score
    // the audit on raw engine pass rates, since that's the most honest
    // signal even though we don't show engine names to the user).
    const eb = byEngine[engine];
    eb.total++;

    const category = ENGINE_CATEGORIES[engine];
    const key = `${category}|${spec.scenario}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        scenario: spec.scenario,
        category,
        engineCount: 0,
        prominentCount: 0,
        mentionedCount: 0,
        answeredCount: 0,
        failedCount: 0,
        refusedCount: 0,
        collisionHosts: [],
        bestExcerpt: null,
        bestSourceUrl: undefined,
        bestRecommended: [],
        unreachableCount: 0,
      };
      buckets.set(key, bucket);
    }
    bucket.engineCount++;

    if (!response) {
      bucket.unreachableCount++;
      continue;
    }
    eb.answered++;
    bucket.answeredCount++;

    const analysis = analyzeCitation(
      response.content,
      response.citations,
      brand,
      domain
    );

    if (analysis.position === "prominent") {
      eb.mentioned++;
      eb.prominent++;
      bucket.prominentCount++;
      bucket.mentionedCount++;
      if (!bucket.bestExcerpt && analysis.excerpt) {
        bucket.bestExcerpt = cleanExcerpt(analysis.excerpt) ?? null;
        bucket.bestSourceUrl = firstCitation(response.citations);
      }
    } else if (analysis.position === "mentioned") {
      eb.mentioned++;
      bucket.mentionedCount++;
      for (const h of analysis.collisionHosts) {
        if (!bucket.collisionHosts.includes(h)) bucket.collisionHosts.push(h);
      }
      // Only keep the "mentioned" excerpt if we don't have a better
      // prominent excerpt yet.
      if (!bucket.bestExcerpt && analysis.excerpt) {
        bucket.bestExcerpt = cleanExcerpt(analysis.excerpt) ?? null;
        bucket.bestSourceUrl = firstCitation(response.citations);
      }
    } else {
      bucket.failedCount++;
      if (analysis.refused) bucket.refusedCount++;
      const recommended = pickTopCitedBrands(response.citations);
      for (const r of recommended) {
        if (!bucket.bestRecommended.includes(r)) {
          bucket.bestRecommended.push(r);
        }
      }
      if (!bucket.bestExcerpt) {
        const excerpt = analysis.excerpt
          ? cleanExcerpt(analysis.excerpt)
          : firstSnippet(response.content);
        bucket.bestExcerpt = excerpt ?? null;
        bucket.bestSourceUrl = firstCitation(response.citations);
      }
    }

    if (analysis.cited) eb.cited++;
  }

  // Second pass: emit one finding per (scenario, category) bucket.
  // Status follows best-case logic: if ANY engine in the category listed
  // the brand prominently, the whole category passes. Mixed or all-warn
  // becomes warn; all-fail is fail.
  const sortedBuckets = Array.from(buckets.values()).sort((a, b) => {
    // Group same scenario together, AI chats before AI search for
    // consistent reading order.
    if (a.scenario === b.scenario) {
      return a.category < b.category ? -1 : 1;
    }
    return 0;
  });

  for (const b of sortedBuckets) {
    const scenarioLabel = `${b.scenario} · ${b.category}`;
    // All engines in this category failed to reach us at all — surface
    // as a warn so the user knows we retried and got nothing.
    if (b.answeredCount === 0) {
      findings.push({
        label: scenarioLabel,
        status: "warn",
        detail: `${b.category} tools didn't respond this time. We'll try again on your next audit.`,
      });
      continue;
    }

    if (b.prominentCount > 0) {
      // Any prominent hit → pass. If more than one engine ran in this
      // category, include the strength fraction for extra intel.
      const cov =
        b.engineCount > 1
          ? ` (${b.prominentCount} of ${b.answeredCount} ${b.category} tools listed you up top)`
          : "";
      findings.push({
        label: scenarioLabel,
        status: "pass",
        detail: `${b.category} lists ${brand} among the top picks${cov}. This is exactly where you want to be.`,
        excerpt: b.bestExcerpt ?? undefined,
        highlight: brand,
        sourceUrl: b.bestSourceUrl,
      });
    } else if (b.mentionedCount > 0) {
      const detail =
        b.collisionHosts.length > 0
          ? `${b.category} is thinking of a different company with the name "${brand}" (${b.collisionHosts.slice(0, 2).join(", ")}). You were not the subject of the answer.`
          : `${b.category} mentions ${brand} but buries it below other recommendations. Customers who scan the top picks will miss you.`;
      findings.push({
        label: scenarioLabel,
        status: "warn",
        detail,
        excerpt: b.bestExcerpt ?? undefined,
        highlight: brand,
        sourceUrl: b.bestSourceUrl,
      });
    } else {
      const detail =
        b.refusedCount >= b.answeredCount
          ? `${b.category} doesn't recognize ${brand}. It told the user it didn't know the company.`
          : b.bestRecommended.length > 0
            ? `${brand} doesn't come up in ${b.category}. It recommends ${b.bestRecommended
                .slice(0, 3)
                .join(", ")} instead.`
            : `${brand} doesn't come up in ${b.category} at all. You're invisible for this question.`;
      findings.push({
        label: scenarioLabel,
        status: "fail",
        detail,
        excerpt: b.bestExcerpt ?? undefined,
        highlight: brand,
        sourceUrl: b.bestSourceUrl,
      });
    }
  }

  /* ── Score (averaged across engines that actually ran) ─────────── */

  const engineScores: number[] = [];
  let totalMentioned = 0;
  let totalProminent = 0;
  let totalCited = 0;
  let totalAnswered = 0;

  // Roll per-engine stats into per-category stats for the user-facing
  // description (we score the audit internally on raw engine rates, but
  // the headline display hides engine names).
  const categoryStats: Record<
    EngineCategory,
    { total: number; answered: number; mentioned: number; prominent: number; cited: number }
  > = {
    "AI chats": { total: 0, answered: 0, mentioned: 0, prominent: 0, cited: 0 },
    "AI search": { total: 0, answered: 0, mentioned: 0, prominent: 0, cited: 0 },
  };

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
    totalMentioned += eb.mentioned;
    totalProminent += eb.prominent;
    totalCited += eb.cited;
    totalAnswered += eb.answered;

    const cat = ENGINE_CATEGORIES[engine.name];
    categoryStats[cat].total += eb.total;
    categoryStats[cat].answered += eb.answered;
    categoryStats[cat].mentioned += eb.mentioned;
    categoryStats[cat].prominent += eb.prominent;
    categoryStats[cat].cited += eb.cited;
  }

  const engineSummary: string[] = [];
  for (const cat of ["AI chats", "AI search"] as const) {
    const s = categoryStats[cat];
    if (s.total === 0) continue;
    engineSummary.push(`${cat} ${s.mentioned}/${s.total}`);
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
      title: "AI doesn't know you yet",
      description: `When shoppers ask AI for recommendations in your category, neither AI chats nor AI search surface ${brand}. The fix is earning mentions in the places AI learns from about consumer brands: Wirecutter and NYT Strategist roundups, Good Housekeeping and Consumer Reports reviews, active Reddit discussion (r/BuyItForLife and category specific subs), and credible press in lifestyle or category publications.`,
    });
  } else if (totalProminent === 0 && totalMentioned > 0) {
    recommendations.push({
      priority: "high",
      title: "Move up in AI answers",
      description: `${brand} shows up, but always near the bottom of the list. AI tools rank the brands they see discussed most often. Push into top-of-list territory with "best ${brand.toLowerCase()} [category]" roundup placements, creator/influencer coverage on YouTube and TikTok, and review-rich product pages that AI can quote verbatim.`,
    });
  }

  if (totalCited === 0 && totalMentioned > 0) {
    recommendations.push({
      priority: "high",
      title: "AI talks about you but doesn't link to you",
      description: `AI mentions ${brand}, but sends shoppers to other sites (Wirecutter, Reddit threads, retailer pages) for the details. Give AI tools a reason to link back to you directly: add detailed FAQs, ingredient/spec tables, sizing guides, and sourcing stories that make your own pages the most quotable source.`,
    });
  }

  // Flag per-category gaps so users see whether AI chats or AI search
  // is where they're weakest (talk in categories, not tool names).
  const weakCategories = (["AI chats", "AI search"] as const).filter((c) => {
    const s = categoryStats[c];
    return s.total > 0 && s.mentioned === 0;
  });
  const activeCategories = (["AI chats", "AI search"] as const).filter(
    (c) => categoryStats[c].total > 0
  );
  if (
    weakCategories.length > 0 &&
    weakCategories.length < activeCategories.length
  ) {
    const weakList = weakCategories.join(" and ");
    recommendations.push({
      priority: "medium",
      title: `Not showing up in ${weakList}`,
      description: `You're visible in some AI surfaces but not ${weakList}. AI search tools lean on fresh web content and links from well known lifestyle or category publications, while AI chats lean on conversational authority and broad cultural mentions. Earned press from the right outlets closes this gap fastest.`,
    });
  }

  /* ── Merge competitors across all engines ──────────────────────── */

  const aiCompetitors = await extractCompetitorsFromResponses(
    results,
    brand,
    domain,
    category
  );

  /* ── Pull prices AI quoted, matched per brand ─────────────────── */
  // For each AI response, walk the prose and pair price tokens with the
  // nearest brand mention before them. Builds:
  //   • ownPrices: distinct prices AI quoted for the audited brand
  //   • pricesByDomain: same for each competitor we already detected
  // Used by the "competitive picture" panel to show "AI quotes you at
  // $X, your top rival at $Y." The downstream side of the GEO question:
  // not just "does AI mention you" but "at what price?"
  const { ownPrices, pricesByDomain } = extractPricesByBrand(
    results,
    brand,
    domain,
    aiCompetitors
  );
  // Attach prices to each competitor record
  for (const c of aiCompetitors) {
    const prices = pricesByDomain.get(c.domain);
    if (prices && prices.length > 0) c.prices = prices;
  }

  // User-facing description speaks in categories (AI chats, AI search)
  // instead of naming the specific tools (ChatGPT, Perplexity, Brave).
  const activeCategoryList = (["AI chats", "AI search"] as const)
    .filter((c) => categoryStats[c].total > 0)
    .join(" and ");
  const description =
    engineSummary.length > 0
      ? `We asked real shopper questions to ${activeCategoryList} and checked whether ${brand} came up · ${engineSummary.join(
          " · "
        )}`
      : `We asked real shopper questions to ${activeCategoryList} and checked whether ${brand} came up (${usedQueries}/${results.length} questions answered).`;

  return {
    module: {
      name: "AI Search Visibility",
      slug: "ai-citations",
      score,
      icon: "🤖",
      description,
      findings,
      recommendations,
    },
    competitors: aiCompetitors,
    category,
    citations: allCitations,
    ownPrices,
  };
}

/**
 * Walk AI response prose and pair price tokens with the nearest brand
 * mention before each. Cheap regex-only pass — no LLM call — because:
 *   • AI answers quote prices in stable formats ($1,299 / £499 / €89)
 *   • Cost-per-audit matters
 *   • The "nearest preceding brand" heuristic gets >90% accuracy on
 *     real dogfood (Casper, Liquid Death, Oreo)
 *
 * Returns:
 *   • ownPrices: distinct prices AI quoted for the audited brand
 *   • pricesByDomain: distinct prices per competitor domain we already
 *     identified
 */
function extractPricesByBrand(
  responses: TaggedResponse[],
  ownBrand: string,
  ownDomain: string,
  competitors: AICompetitor[]
): { ownPrices: string[]; pricesByDomain: Map<string, string[]> } {
  // Build {brandName: domain} index. domain="__own__" is a sentinel for
  // the audited brand so we can write its prices to a separate bucket.
  const brandIndex: Array<{ name: string; domain: string }> = [];
  brandIndex.push({ name: ownBrand, domain: "__own__" });
  // Also accept the bare domain tokens (e.g. "casper.com" mentioned
  // directly in prose) and the brand "token" before the TLD
  // ("casper" from "casper.com").
  const ownRoot = rootDomain(ownDomain);
  brandIndex.push({ name: ownRoot, domain: "__own__" });
  const ownToken = domainToToken(ownRoot);
  if (ownToken && ownToken.length >= 3 && ownToken !== ownBrand.toLowerCase()) {
    brandIndex.push({ name: ownToken, domain: "__own__" });
  }
  for (const c of competitors) {
    const root = rootDomain(c.domain);
    const token = domainToToken(root);
    brandIndex.push({ name: root, domain: c.domain });
    if (token && token.length >= 3) {
      brandIndex.push({ name: token, domain: c.domain });
    }
  }

  // Price regex. Captures common currencies + (optionally) comma-thousand
  // separators + optional decimal. Two number-shape alternatives:
  //   1) 1-3 digits then 1+ comma-thousand groups (e.g. "1,299")
  //   2) bare digit runs (e.g. "1099", "999", "49.99")
  // Word-boundary lookbehind/lookahead so we don't match inside SKUs.
  const PRICE_RE =
    /(?<![A-Za-z0-9])(\$|US\$|USD\s|£|GBP\s|€|EUR\s|¥|JPY\s|A\$|CA\$|C\$)\s?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?![A-Za-z0-9])/g;

  // Build a single regex that matches any known brand name. Case-
  // insensitive, word-boundaried. Brands with spaces work because we
  // escape the names and rely on word boundaries on the outside.
  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const brandRe = new RegExp(
    `\\b(${brandIndex.map((b) => escapeRe(b.name)).join("|")})\\b`,
    "gi"
  );

  const ownPrices = new Set<string>();
  const pricesByDomain = new Map<string, Set<string>>();

  for (const r of responses) {
    const text = r.response?.content;
    if (!text || text.length === 0) continue;

    // Find every brand mention position
    const brandHits: Array<{ pos: number; domain: string }> = [];
    let mb: RegExpExecArray | null;
    brandRe.lastIndex = 0;
    while ((mb = brandRe.exec(text)) !== null) {
      const matched = mb[1].toLowerCase();
      const entry = brandIndex.find((b) => b.name.toLowerCase() === matched);
      if (entry) brandHits.push({ pos: mb.index, domain: entry.domain });
    }
    if (brandHits.length === 0) continue;

    // Find every price token and attribute to nearest preceding brand
    // mention within 140 chars. 140 ~= one sentence; keeps the pairing
    // tight while still allowing "The Casper Original Mattress, which
    // sleeps cool and has zoned support, retails for $1,299."
    let mp: RegExpExecArray | null;
    PRICE_RE.lastIndex = 0;
    while ((mp = PRICE_RE.exec(text)) !== null) {
      const pricePos = mp.index;
      const pricedAtAmount = mp[2];
      const symbolRaw = mp[1].trim();
      // Normalize currency symbol to a single display token
      const display =
        (symbolRaw === "USD" || symbolRaw === "US$" || symbolRaw === "$"
          ? "$"
          : symbolRaw === "GBP" || symbolRaw === "£"
            ? "£"
            : symbolRaw === "EUR" || symbolRaw === "€"
              ? "€"
              : symbolRaw === "JPY" || symbolRaw === "¥"
                ? "¥"
                : symbolRaw === "CA$" || symbolRaw === "C$"
                  ? "C$"
                  : symbolRaw === "A$"
                    ? "A$"
                    : symbolRaw) + pricedAtAmount;

      // Skip prices that look like years ($2023) or absurdly small/large
      const numeric = parseFloat(pricedAtAmount.replace(/,/g, ""));
      if (Number.isNaN(numeric) || numeric < 1 || numeric > 1_000_000) continue;

      // Find nearest brand mention before this price within 140 chars
      let best: { domain: string; dist: number } | null = null;
      for (const h of brandHits) {
        if (h.pos > pricePos) break;
        const dist = pricePos - h.pos;
        if (dist <= 140 && (!best || dist < best.dist)) {
          best = { domain: h.domain, dist };
        }
      }
      if (!best) continue;

      if (best.domain === "__own__") {
        ownPrices.add(display);
      } else {
        let set = pricesByDomain.get(best.domain);
        if (!set) {
          set = new Set();
          pricesByDomain.set(best.domain, set);
        }
        set.add(display);
      }
    }
  }

  // Sort prices ascending so the UI can show low → high naturally
  const sortPrices = (set: Set<string>): string[] => {
    const arr = Array.from(set);
    arr.sort((a, b) => {
      const na = parseFloat(a.replace(/[^\d.]/g, ""));
      const nb = parseFloat(b.replace(/[^\d.]/g, ""));
      return na - nb;
    });
    return arr.slice(0, 5); // cap at 5 distinct prices per brand
  };

  return {
    ownPrices: sortPrices(ownPrices),
    pricesByDomain: new Map(
      Array.from(pricesByDomain.entries()).map(([k, v]) => [k, sortPrices(v)])
    ),
  };
}
