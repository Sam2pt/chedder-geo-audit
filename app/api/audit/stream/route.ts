import { NextRequest } from "next/server";
import * as cheerio from "cheerio";
import { analyzeSchema } from "@/lib/analyzers/schema";
import { analyzeMeta } from "@/lib/analyzers/meta";
import { analyzeContent } from "@/lib/analyzers/content";
import { analyzeTechnical } from "@/lib/analyzers/technical";
import { analyzeAuthority } from "@/lib/analyzers/authority";
import { analyzeExternal, extractBrandName } from "@/lib/analyzers/external";
import { analyzeAICitations } from "@/lib/analyzers/ai-citations";
import { reviewAuditQuality } from "@/lib/analyzers/quality-review";
import { generateCategoryRecommendationsLLM } from "@/lib/analyzers/tailored-recs";
import { discoverInternalLinks } from "@/lib/crawler";
import {
  calculateOverallScore,
  getGrade,
  getTopRecommendations,
} from "@/lib/scoring";
import type { AuditResult, ModuleResult, AICompetitor } from "@/lib/types";
import {
  saveAudit,
  getBenchmarks,
  getDomainHistory,
  makeSlug,
} from "@/lib/audit-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The streaming audit now runs up to 5 scenarios across 3 engines,
// plus a multi-page crawl and a quality-review pass. With Brave's
// Answers tier capped at 2 req/sec (serialized client-side) the
// AI stage alone can take 60-80s. Set maxDuration generously; the
// stream keeps the connection alive so Netlify's edge won't bail.
export const maxDuration = 120;

const FETCH_TIMEOUT = 10000;

type FetchResult =
  | { ok: true; html: string; headers: Record<string, string> }
  | { ok: false; status: number; protectedBy?: string };

async function fetchPage(url: string): Promise<FetchResult | null> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ChedderBot/1.0; +https://chedder.2pt.ai)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
  } catch {
    return null;
  }
  if (!res.ok) {
    // Detect common bot-protection services so we can tell the user why.
    const headerDump: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headerDump[k.toLowerCase()] = v;
    });
    let protectedBy: string | undefined;
    if (headerDump["x-datadome"]) protectedBy = "DataDome";
    else if (headerDump["cf-ray"] || headerDump["server"]?.toLowerCase().includes("cloudflare"))
      protectedBy = "Cloudflare";
    else if (headerDump["x-akamai-transformed"]) protectedBy = "Akamai";
    else if (headerDump["server"]?.toLowerCase().includes("perimeterx"))
      protectedBy = "PerimeterX";
    return { ok: false, status: res.status, protectedBy };
  }
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });
  return { ok: true, html: await res.text(), headers };
}

/**
 * Merge LLM-generated tailored recommendations with the generic set
 * from the analyzers. Tailored recs lead (they're more specific), then
 * generics fill up to 8 total. Dedupes by title so a tailored rec
 * about "FAQ schema for dark chocolate" doesn't double up with a
 * generic "Add FAQ Schema" that says the same thing from a lower angle.
 */
function mergeRecommendations(
  generic: import("@/lib/types").Recommendation[],
  tailored: import("@/lib/types").Recommendation[]
): import("@/lib/types").Recommendation[] {
  const seen = new Set<string>();
  const out: import("@/lib/types").Recommendation[] = [];
  const keyOf = (t: string) =>
    t
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .split(/\s+/)
      .slice(0, 4)
      .join(" ");
  for (const r of [...tailored, ...generic]) {
    const k = keyOf(r.title);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
    if (out.length >= 8) break;
  }
  return out;
}

type StreamEvent =
  | { type: "stage"; name: string; detail?: string }
  | { type: "module"; slug: string; name: string; score: number }
  | { type: "error"; message: string }
  | { type: "done"; result: AuditResult };

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { url, deviceId, leadEmail } = body as {
    url?: string;
    deviceId?: string;
    leadEmail?: string;
  };

  if (!url || typeof url !== "string") {
    return new Response(JSON.stringify({ error: "URL is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const identity = {
    deviceId: typeof deviceId === "string" ? deviceId : undefined,
    leadEmail: typeof leadEmail === "string" ? leadEmail : undefined,
  };

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: StreamEvent) => {
        const frame = `data: ${JSON.stringify(e)}\n\n`;
        controller.enqueue(encoder.encode(frame));
      };

      try {
        await runAudit(url, emit, identity);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Unknown error";
        emit({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

async function runAudit(
  rawUrl: string,
  emit: (e: StreamEvent) => void,
  identity: { deviceId?: string; leadEmail?: string } = {}
) {
  let normalizedUrl = rawUrl.trim();
  if (!normalizedUrl.startsWith("http")) normalizedUrl = "https://" + normalizedUrl;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalizedUrl);
  } catch {
    emit({ type: "error", message: `Invalid URL: ${rawUrl}` });
    return;
  }

  emit({ type: "stage", name: "fetch", detail: `Slicing into ${parsedUrl.hostname}…` });
  const homePage = await fetchPage(normalizedUrl).catch(() => null);
  if (!homePage || !homePage.ok) {
    let message: string;
    if (homePage && !homePage.ok && homePage.protectedBy) {
      // e.g. "sugarfina.com blocks automated audits (DataDome bot protection).
      // This is a limit of the site, not Chedder. If it's your own site,
      // allow requests from Chedder's user-agent. Otherwise try a different URL."
      message = `${parsedUrl.hostname} blocks automated audits (${homePage.protectedBy} bot protection, HTTP ${homePage.status}). If this is your site, ask your team to allow the Chedder user-agent. Otherwise try a different URL.`;
    } else if (homePage && !homePage.ok) {
      message = `${parsedUrl.hostname} returned HTTP ${homePage.status}. The site may be down or blocking automated requests.`;
    } else {
      message = `Could not reach ${parsedUrl.hostname}. Check the URL and try again.`;
    }
    emit({ type: "error", message });
    return;
  }

  emit({ type: "stage", name: "robots", detail: "Peeking at the house rules (robots.txt + sitemap)…" });
  let robotsTxt: string | null = null;
  let sitemapExists = false;
  try {
    const [robotsRes, sitemapRes] = await Promise.allSettled([
      fetch(`${parsedUrl.origin}/robots.txt`, { signal: AbortSignal.timeout(5000) }),
      fetch(`${parsedUrl.origin}/sitemap.xml`, { method: "HEAD", signal: AbortSignal.timeout(5000) }),
    ]);
    if (robotsRes.status === "fulfilled" && robotsRes.value.ok) {
      robotsTxt = await robotsRes.value.text();
    }
    if (sitemapRes.status === "fulfilled" && sitemapRes.value.ok) {
      sitemapExists = true;
    }
  } catch {
    // ignore
  }

  const technicalCtx = {
    robotsTxt,
    sitemapExists,
    responseHeaders: homePage.headers,
    url: normalizedUrl,
  };

  const $home = cheerio.load(homePage.html);
  const modules: ModuleResult[] = [];
  const pagesAudited: string[] = [normalizedUrl];

  const emitModule = (m: ModuleResult) => {
    modules.push(m);
    emit({ type: "module", slug: m.slug, name: m.name, score: m.score });
  };

  // Discover a handful of high-signal internal pages (product pages, FAQ,
  // about, reviews) and fetch them in parallel. Schema and content
  // analyzers then aggregate across all of them so a brand isn't
  // penalized for marketing-focused homepage content when their real
  // product detail lives on /products/*.
  emit({ type: "stage", name: "crawl", detail: "Peeking at a few more pages on your site…" });
  const internalLinks = discoverInternalLinks(
    $home,
    parsedUrl.origin,
    normalizedUrl,
    3
  );
  const extraPageResults = await Promise.allSettled(
    internalLinks.map((l) => fetchPage(l.url))
  );
  const extraPages: import("cheerio").CheerioAPI[] = [];
  for (let i = 0; i < extraPageResults.length; i++) {
    const r = extraPageResults[i];
    if (r.status !== "fulfilled" || !r.value || !r.value.ok) continue;
    try {
      extraPages.push(cheerio.load(r.value.html));
      pagesAudited.push(internalLinks[i].url);
    } catch {
      // skip pages we can't parse
    }
  }
  const allPages = [$home, ...extraPages];

  // Fast on-page analyzers — run sequentially so the client sees them appear
  emit({ type: "stage", name: "schema", detail: "Reading your schema labels…" });
  emitModule(analyzeSchema(allPages));

  emit({ type: "stage", name: "meta", detail: "Scanning your meta tags…" });
  emitModule(analyzeMeta($home));

  emit({ type: "stage", name: "content", detail: "Measuring your content structure…" });
  emitModule(analyzeContent(allPages));

  emit({ type: "stage", name: "technical", detail: "Checking whether AI crawlers can get in…" });
  emitModule(analyzeTechnical($home, technicalCtx));

  emit({ type: "stage", name: "authority", detail: "Looking for trust signals…" });
  emitModule(analyzeAuthority($home, normalizedUrl));

  // External + AI run in parallel (slow — Wikipedia/Reddit/Perplexity)
  emit({ type: "stage", name: "external", detail: "Asking around Wikipedia, Reddit, and the wider web…" });
  const externalPromise = analyzeExternal($home, parsedUrl.hostname);

  const brand = extractBrandName($home, parsedUrl.hostname);
  const metaDescription = $home('meta[name="description"]').attr("content")?.trim() || null;

  emit({ type: "stage", name: "ai", detail: "Putting you to the test across AI chats and AI search…" });
  const aiPromise = analyzeAICitations(brand, parsedUrl.hostname, metaDescription);

  const externalResult = await externalPromise;
  emitModule(externalResult);

  const aiResult = await aiPromise;
  let aiCompetitors: AICompetitor[] | undefined;
  let inferredCategory: string | null = null;
  if (aiResult) {
    emitModule(aiResult.module);
    if (aiResult.competitors.length > 0) aiCompetitors = aiResult.competitors;
    inferredCategory = aiResult.category;
  }

  // ── Quality check ───────────────────────────────────────────────
  // Before showing the audit, run a final LLM review of the surfaced
  // competitors: catches publishers, category-word false-positives, and
  // duplicate domains for the same brand. Visible to the user as a
  // distinct stage so they know Chedder is sanity-checking its own work.
  if (aiCompetitors && aiCompetitors.length > 0) {
    emit({
      type: "stage",
      name: "quality",
      detail: "Tasting the results for quality…",
    });
    try {
      const review = await reviewAuditQuality(
        brand,
        parsedUrl.hostname,
        inferredCategory,
        aiCompetitors
      );
      aiCompetitors =
        review.competitors.length > 0 ? review.competitors : undefined;
      if (review.dropped.length > 0) {
        console.log(
          `[quality-review] dropped ${review.dropped.length} competitor(s):`,
          review.dropped
            .map((d) => `${d.domain} (${d.reason})`)
            .join(", ")
        );
      }
      if (review.suggestedCategory) {
        console.log(
          `[quality-review] category correction: "${inferredCategory}" → "${review.suggestedCategory}"`
        );
      }
    } catch (e) {
      console.warn(
        "[quality-review] failed, keeping original competitors:",
        e instanceof Error ? e.message : e
      );
    }
  }

  const overallScore = calculateOverallScore(modules);
  const slug = makeSlug(parsedUrl.hostname);

  emit({ type: "stage", name: "finalizing", detail: "Wrapping it all up and saving your audit…" });

  // Run category-tailored recommendations in parallel with final
  // enrichment. Fetches 1-2 specific action items keyed to the brand's
  // category (e.g. "add nutrition schema covering X, Y, Z" for a food
  // brand vs "add sizing schema..." for apparel).
  const [benchmarksResult, historyResult, tailoredRecs] = await Promise.all([
    (async () => {
      const baseForBench: AuditResult = {
        url: normalizedUrl,
        domain: parsedUrl.hostname,
        overallScore,
        grade: getGrade(overallScore),
        modules,
        topRecommendations: [],
        pagesAudited,
        timestamp: new Date().toISOString(),
        slug,
      };
      return getBenchmarks(baseForBench).catch(() => undefined);
    })(),
    getDomainHistory(parsedUrl.hostname, slug).catch(() => []),
    generateCategoryRecommendationsLLM(brand, inferredCategory, modules),
  ]);

  const base: AuditResult = {
    url: normalizedUrl,
    domain: parsedUrl.hostname,
    overallScore,
    grade: getGrade(overallScore),
    modules,
    topRecommendations: mergeRecommendations(
      getTopRecommendations(modules),
      tailoredRecs
    ),
    pagesAudited,
    timestamp: new Date().toISOString(),
    aiCompetitors,
    slug,
    deviceId: identity.deviceId,
    leadEmail: identity.leadEmail,
  };

  const enriched: AuditResult = {
    ...base,
    benchmarks: benchmarksResult,
    history: historyResult,
  };

  await saveAudit(enriched).catch(() => {});

  emit({ type: "done", result: enriched });
}
