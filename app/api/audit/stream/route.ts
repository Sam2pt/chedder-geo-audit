import { NextRequest } from "next/server";
import * as cheerio from "cheerio";
import { analyzeSchema } from "@/lib/analyzers/schema";
import { analyzeMeta } from "@/lib/analyzers/meta";
import { analyzeContent } from "@/lib/analyzers/content";
import { analyzeTechnical } from "@/lib/analyzers/technical";
import { analyzeAuthority } from "@/lib/analyzers/authority";
import { analyzeExternal, extractBrandName } from "@/lib/analyzers/external";
import { analyzeAICitations } from "@/lib/analyzers/ai-citations";
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

const FETCH_TIMEOUT = 10000;

async function fetchPage(url: string) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; ChedderBot/1.0; +https://chedder.app)",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });
  if (!res.ok) return null;
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });
  return { html: await res.text(), headers };
}

type StreamEvent =
  | { type: "stage"; name: string; detail?: string }
  | { type: "module"; slug: string; name: string; score: number }
  | { type: "error"; message: string }
  | { type: "done"; result: AuditResult };

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { url } = body as { url?: string };

  if (!url || typeof url !== "string") {
    return new Response(JSON.stringify({ error: "URL is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: StreamEvent) => {
        const frame = `data: ${JSON.stringify(e)}\n\n`;
        controller.enqueue(encoder.encode(frame));
      };

      try {
        await runAudit(url, emit);
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

async function runAudit(rawUrl: string, emit: (e: StreamEvent) => void) {
  let normalizedUrl = rawUrl.trim();
  if (!normalizedUrl.startsWith("http")) normalizedUrl = "https://" + normalizedUrl;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalizedUrl);
  } catch {
    emit({ type: "error", message: `Invalid URL: ${rawUrl}` });
    return;
  }

  emit({ type: "stage", name: "fetch", detail: `Fetching ${parsedUrl.hostname}` });
  const homePage = await fetchPage(normalizedUrl).catch(() => null);
  if (!homePage) {
    emit({ type: "error", message: `Could not reach ${parsedUrl.hostname}` });
    return;
  }

  emit({ type: "stage", name: "robots", detail: "Checking robots.txt + sitemap" });
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

  const emitModule = (m: ModuleResult) => {
    modules.push(m);
    emit({ type: "module", slug: m.slug, name: m.name, score: m.score });
  };

  // Fast on-page analyzers — run sequentially so the client sees them appear
  emit({ type: "stage", name: "schema", detail: "Parsing structured data" });
  emitModule(analyzeSchema($home));

  emit({ type: "stage", name: "meta", detail: "Reading meta tags" });
  emitModule(analyzeMeta($home));

  emit({ type: "stage", name: "content", detail: "Analyzing content structure" });
  emitModule(analyzeContent($home));

  emit({ type: "stage", name: "technical", detail: "Evaluating AI crawlability" });
  emitModule(analyzeTechnical($home, technicalCtx));

  emit({ type: "stage", name: "authority", detail: "Assessing trust signals" });
  emitModule(analyzeAuthority($home, normalizedUrl));

  // External + AI run in parallel (slow — Wikipedia/Reddit/Perplexity)
  emit({ type: "stage", name: "external", detail: "Checking Wikipedia, Reddit, Google" });
  const externalPromise = analyzeExternal($home, parsedUrl.hostname);

  const brand = extractBrandName($home, parsedUrl.hostname);
  const metaDescription = $home('meta[name="description"]').attr("content")?.trim() || null;

  emit({ type: "stage", name: "ai", detail: "Testing AI citations across engines" });
  const aiPromise = analyzeAICitations(brand, parsedUrl.hostname, metaDescription);

  const externalResult = await externalPromise;
  emitModule(externalResult);

  const aiResult = await aiPromise;
  let aiCompetitors: AICompetitor[] | undefined;
  if (aiResult) {
    emitModule(aiResult.module);
    if (aiResult.competitors.length > 0) aiCompetitors = aiResult.competitors;
  }

  const overallScore = calculateOverallScore(modules);
  const slug = makeSlug(parsedUrl.hostname);

  emit({ type: "stage", name: "finalizing", detail: "Saving + computing benchmarks" });

  const base: AuditResult = {
    url: normalizedUrl,
    domain: parsedUrl.hostname,
    overallScore,
    grade: getGrade(overallScore),
    modules,
    topRecommendations: getTopRecommendations(modules),
    pagesAudited: [normalizedUrl],
    timestamp: new Date().toISOString(),
    aiCompetitors,
    slug,
  };

  const [benchmarks, history] = await Promise.all([
    getBenchmarks(base).catch(() => undefined),
    getDomainHistory(parsedUrl.hostname, slug).catch(() => []),
  ]);

  const enriched: AuditResult = {
    ...base,
    benchmarks,
    history,
  };

  await saveAudit(enriched).catch(() => {});

  emit({ type: "done", result: enriched });
}
