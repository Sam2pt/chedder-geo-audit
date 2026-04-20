import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { analyzeSchema } from "@/lib/analyzers/schema";
import { analyzeMeta } from "@/lib/analyzers/meta";
import { analyzeContent } from "@/lib/analyzers/content";
import { analyzeTechnical } from "@/lib/analyzers/technical";
import { analyzeAuthority } from "@/lib/analyzers/authority";
import { analyzeExternal } from "@/lib/analyzers/external";
import { analyzeAICitations } from "@/lib/analyzers/ai-citations";
import { extractBrandName } from "@/lib/analyzers/external";
import { discoverInternalLinks } from "@/lib/crawler";
import {
  calculateOverallScore,
  getGrade,
  getTopRecommendations,
} from "@/lib/scoring";
import { AuditResult, ModuleResult } from "@/lib/types";
import {
  saveAudit,
  getBenchmarks,
  getDomainHistory,
  makeSlug,
} from "@/lib/audit-store";

// Compare audits fan out to multiple sites in parallel (primary + up to 3
// competitors), each running their own multi-page crawl. The default
// Netlify function timeout is too short to cover that. Bump it so the
// compare endpoint has room to finish.
export const maxDuration = 90;
export const runtime = "nodejs";

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

// discoverLinks + mergeModules removed — both audit routes now share
// lib/crawler.ts and the analyzers aggregate across pages internally.

async function auditSingleUrl(
  rawUrl: string,
  options: { skipAI?: boolean; skipExternal?: boolean } = {}
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
  // The external check hits Wikipedia + Reddit (via Brave) and is slow.
  // Skipped for competitor audits in a compare run — we only need their
  // on-site signals for the land-grab comparison.
  const externalPromise = options.skipExternal
    ? null
    : analyzeExternal($home, parsedUrl.hostname);

  // AI citation testing runs in parallel (skipped for competitors to save cost)
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

  // Crawl a few high-signal internal pages alongside the homepage so
  // the schema + content analyzers see the whole site, not just the
  // marketing splash. Shared crawler with the streaming route.
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

  let aiCompetitors: import("@/lib/types").AICompetitor[] | undefined;
  if (aiCitationsPromise) {
    const aiCitationsResult = await aiCitationsPromise;
    if (aiCitationsResult) {
      modules.push(aiCitationsResult.module);
      if (aiCitationsResult.competitors.length > 0) {
        aiCompetitors = aiCitationsResult.competitors;
      }
    }
  }

  const overallScore = calculateOverallScore(modules);

  return {
    url: normalizedUrl,
    domain: parsedUrl.hostname,
    overallScore,
    grade: getGrade(overallScore),
    modules,
    topRecommendations: getTopRecommendations(modules),
    pagesAudited,
    timestamp: new Date().toISOString(),
    aiCompetitors,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, competitors } = body as {
      url: string;
      competitors?: string[];
    };

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Primary audit (required)
    const primary = await auditSingleUrl(url);
    if ("error" in primary) {
      return NextResponse.json({ error: primary.error }, { status: 422 });
    }

    // Competitor audits (optional, up to 3)
    let competitorResults: AuditResult[] = [];
    if (Array.isArray(competitors) && competitors.length > 0) {
      const validCompetitors = competitors
        .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
        .slice(0, 3);

      const results = await Promise.all(
        validCompetitors.map((c) =>
          // Skip the slow AI + external checks on competitors — we only
          // need their on-site signals (schema, content, meta, technical,
          // authority) for the side by side comparison.
          auditSingleUrl(c, { skipAI: true, skipExternal: true })
        )
      );
      competitorResults = results.filter(
        (r): r is AuditResult => !("error" in r)
      );
    }

    // Persist + enrich with benchmarks and history.
    // These run in parallel; if blobs aren't available, we degrade silently.
    const slug = makeSlug(primary.domain);
    const primaryWithSlug: AuditResult = { ...primary, slug };
    const [benchmarks, history] = await Promise.all([
      getBenchmarks(primaryWithSlug),
      getDomainHistory(primary.domain, slug),
    ]);

    const enriched: AuditResult = {
      ...primaryWithSlug,
      benchmarks,
      history,
      competitors: competitorResults,
    };

    // Save (updates benchmarks + appends history) — don't block the response on failure
    await saveAudit(enriched).catch(() => {});

    return NextResponse.json(enriched);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: `Audit failed: ${message}` },
      { status: 500 }
    );
  }
}
