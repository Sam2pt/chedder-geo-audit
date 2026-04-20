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
import { generateCategoryRecommendationsLLM } from "@/lib/analyzers/tailored-recs";
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

  // Category-tailored recommendations that sit alongside the generic
  // module recs. Silent empty list on API failure. Skipped for
  // competitor audits since those skip AI citations entirely.
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, competitors, deviceId, leadEmail } = body as {
      url: string;
      competitors?: string[];
      deviceId?: string;
      leadEmail?: string;
    };

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Fan out primary and competitor audits concurrently so the whole
    // compare finishes in roughly max(audit time), not sum. The primary
    // runs the full set of modules including AI + external. Competitors
    // skip AI + external since we only need their on-site signals for
    // the side by side.
    const validCompetitors = Array.isArray(competitors)
      ? competitors
          .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
          .slice(0, 3)
      : [];

    const [primary, ...competitorOutcomes] = await Promise.all([
      auditSingleUrl(url),
      ...validCompetitors.map((c) =>
        auditSingleUrl(c, { skipAI: true, skipExternal: true })
      ),
    ]);

    if ("error" in primary) {
      return NextResponse.json({ error: primary.error }, { status: 422 });
    }

    const competitorResults: AuditResult[] = competitorOutcomes.filter(
      (r): r is AuditResult => !("error" in r)
    );

    // Persist + enrich with benchmarks and history.
    // These run in parallel; if blobs aren't available, we degrade silently.
    const slug = makeSlug(primary.domain);
    // Stamp identity on the primary audit so it shows up in the
    // requester's "your recent audits" view and can be linked back to
    // a lead once they've signed up. Competitor audits stay anonymous
    // since they were run for comparison, not for the requester.
    const primaryWithSlug: AuditResult = {
      ...primary,
      slug,
      deviceId: typeof deviceId === "string" ? deviceId : undefined,
      leadEmail: typeof leadEmail === "string" ? leadEmail : undefined,
    };
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
