import * as cheerio from "cheerio";
import {
  analyzeSchema,
} from "./analyzers/schema";
import { analyzeMeta } from "./analyzers/meta";
import { analyzeContent } from "./analyzers/content";
import { analyzeTechnical } from "./analyzers/technical";
import { analyzeAuthority } from "./analyzers/authority";
import { analyzeExternal, extractBrandName } from "./analyzers/external";
import { analyzeAICitations } from "./analyzers/ai-citations";
import { generateCategoryRecommendationsLLM } from "./analyzers/tailored-recs";
import { discoverInternalLinks } from "./crawler";
import {
  calculateOverallScore,
  getGrade,
  getTopRecommendations,
} from "./scoring";
import type {
  AICompetitor,
  AuditResult,
  ModuleResult,
  Recommendation,
} from "./types";

/**
 * Shared audit runner used by both /api/audit (non-streaming compare)
 * and /api/audit/stream (streaming primary + competitor fan-out).
 *
 * Lives in lib/ so both routes import it — previously /api/audit kept
 * auditSingleUrl private and the streaming route had to either
 * duplicate or RPC-call it to support compare. Neither was clean.
 *
 * Keep this file free of Next request/response primitives so it stays
 * usable from anywhere (background jobs, scripts, future workers).
 */

const FETCH_TIMEOUT = 10000;

export interface AuditSingleOptions {
  /** Skip the AI citation testing module entirely. Use for competitor
   *  audits in a compare flow — we only need their on-site signals. */
  skipAI?: boolean;
  /** Skip the external (Wikipedia + Reddit) check. Slow; only needed
   *  for the primary audit in a compare. */
  skipExternal?: boolean;
}

async function fetchPage(url: string) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; ChedderBot/1.0; +https://chedder.2pt.ai)",
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

/**
 * Runs the full audit pipeline for a single URL and returns the
 * assembled AuditResult (or an error object). Does not persist to
 * blob storage; caller decides whether to save.
 */
export async function auditSingleUrl(
  rawUrl: string,
  options: AuditSingleOptions = {}
): Promise<AuditResult | { error: string }> {
  let normalizedUrl = rawUrl.trim();
  if (!normalizedUrl.startsWith("http")) {
    normalizedUrl = "https://" + normalizedUrl;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalizedUrl);
  } catch {
    return { error: `Invalid URL: ${rawUrl}` };
  }

  const homePage = await fetchPage(normalizedUrl).catch(() => null);
  if (!homePage) {
    return { error: `Could not reach ${parsedUrl.hostname}` };
  }

  // robots.txt + sitemap
  let robotsTxt: string | null = null;
  let sitemapExists = false;
  try {
    const [robotsRes, sitemapRes] = await Promise.allSettled([
      fetch(`${parsedUrl.origin}/robots.txt`, {
        signal: AbortSignal.timeout(5000),
      }),
      fetch(`${parsedUrl.origin}/sitemap.xml`, {
        method: "HEAD",
        signal: AbortSignal.timeout(5000),
      }),
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
  const externalPromise = options.skipExternal
    ? null
    : analyzeExternal($home, parsedUrl.hostname);

  let aiCitationsPromise: ReturnType<typeof analyzeAICitations> | null = null;
  if (!options.skipAI) {
    const brand = extractBrandName($home, parsedUrl.hostname);
    const metaDescription =
      $home('meta[name="description"]').attr("content")?.trim() || null;
    aiCitationsPromise = analyzeAICitations(
      brand,
      parsedUrl.hostname,
      metaDescription
    );
  }

  const internalLinks = discoverInternalLinks(
    $home,
    parsedUrl.origin,
    normalizedUrl,
    3
  );
  const pagesAudited = [normalizedUrl];
  const extraPages: cheerio.CheerioAPI[] = [];
  const pageResults = await Promise.allSettled(
    internalLinks.map((l) => fetchPage(l.url))
  );
  for (let i = 0; i < pageResults.length; i++) {
    const r = pageResults[i];
    if (r.status !== "fulfilled" || !r.value) continue;
    try {
      extraPages.push(cheerio.load(r.value.html));
      pagesAudited.push(internalLinks[i].url);
    } catch {
      // skip
    }
  }
  const allPages = [$home, ...extraPages];

  const modules: ModuleResult[] = [
    analyzeSchema(allPages),
    analyzeMeta($home),
    analyzeContent(allPages),
    analyzeTechnical($home, technicalCtx),
    analyzeAuthority($home, normalizedUrl),
  ];
  if (externalPromise) {
    const externalResult = await externalPromise;
    modules.push(externalResult);
  }

  let aiCompetitors: AICompetitor[] | undefined;
  let inferredCategory: string | null = null;
  if (aiCitationsPromise) {
    const aiCitationsResult = await aiCitationsPromise;
    if (aiCitationsResult) {
      modules.push(aiCitationsResult.module);
      if (aiCitationsResult.competitors.length > 0) {
        aiCompetitors = aiCitationsResult.competitors;
      }
      inferredCategory = aiCitationsResult.category;
    }
  }

  const overallScore = calculateOverallScore(modules);

  const tailoredRecs = options.skipAI
    ? []
    : await generateCategoryRecommendationsLLM(
        extractBrandName($home, parsedUrl.hostname),
        inferredCategory,
        modules
      );

  return {
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
  };
}

/**
 * Dedupe LLM-generated tailored recs against generic module recs.
 * Tailored lead, generics fill up to 8 total. Matches by a coarse
 * first-4-words key so "Add FAQ schema" and "Add FAQ schema for
 * chocolate" don't both land.
 */
export function mergeRecommendations(
  generic: Recommendation[],
  tailored: Recommendation[]
): Recommendation[] {
  const seen = new Set<string>();
  const out: Recommendation[] = [];
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
