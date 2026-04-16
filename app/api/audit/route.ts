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
import {
  calculateOverallScore,
  getGrade,
  getTopRecommendations,
} from "@/lib/scoring";
import { AuditResult, ModuleResult } from "@/lib/types";

const MAX_PAGES = 5;
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

function discoverLinks($: cheerio.CheerioAPI, origin: string): string[] {
  const found = new Set<string>();
  const priority = [
    "/about",
    "/faq",
    "/pricing",
    "/blog",
    "/contact",
    "/products",
    "/services",
    "/features",
    "/help",
    "/support",
  ];

  $("a[href]").each((_, el) => {
    let href = $(el).attr("href") || "";
    if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:"))
      return;
    try {
      const resolved = new URL(href, origin);
      if (resolved.origin === origin && resolved.pathname !== "/") {
        found.add(resolved.origin + resolved.pathname.replace(/\/$/, ""));
      }
    } catch {
      // invalid URL
    }
  });

  const urls = [...found];
  urls.sort((a, b) => {
    const aP = priority.findIndex((p) => a.toLowerCase().includes(p));
    const bP = priority.findIndex((p) => b.toLowerCase().includes(p));
    const aScore = aP >= 0 ? aP : 100;
    const bScore = bP >= 0 ? bP : 100;
    return aScore - bScore;
  });

  return urls.slice(0, MAX_PAGES - 1);
}

function mergeModules(all: ModuleResult[][]): ModuleResult[] {
  const bySlug = new Map<string, ModuleResult[]>();
  for (const modules of all) {
    for (const m of modules) {
      if (!bySlug.has(m.slug)) bySlug.set(m.slug, []);
      bySlug.get(m.slug)!.push(m);
    }
  }

  const merged: ModuleResult[] = [];
  for (const [, instances] of bySlug) {
    const best = instances.reduce((a, b) => (a.score >= b.score ? a : b));
    const seenFindings = new Set<string>();
    const uniqueFindings = instances
      .flatMap((i) => i.findings)
      .filter((f) => {
        if (seenFindings.has(f.label)) return false;
        seenFindings.add(f.label);
        return true;
      });
    const seenRecs = new Set<string>();
    const uniqueRecs = instances
      .flatMap((i) => i.recommendations)
      .filter((r) => {
        if (seenRecs.has(r.title)) return false;
        seenRecs.add(r.title);
        return true;
      });
    merged.push({
      ...best,
      findings: uniqueFindings,
      recommendations: uniqueRecs,
    });
  }
  return merged;
}

async function auditSingleUrl(
  rawUrl: string,
  options: { skipAI?: boolean } = {}
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
  const externalPromise = analyzeExternal($home, parsedUrl.hostname);

  // AI citation testing runs in parallel (skipped for competitors to save cost)
  let aiCitationsPromise: Promise<ModuleResult | null> | null = null;
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

  const homeModules = [
    analyzeSchema($home),
    analyzeMeta($home),
    analyzeContent($home),
    analyzeTechnical($home, technicalCtx),
    analyzeAuthority($home, normalizedUrl),
  ];

  const internalLinks = discoverLinks($home, parsedUrl.origin);
  const pagesAudited = [normalizedUrl];
  const allModuleSets: ModuleResult[][] = [homeModules];

  const pageResults = await Promise.allSettled(
    internalLinks.map((link) => fetchPage(link))
  );

  for (let i = 0; i < pageResults.length; i++) {
    const r = pageResults[i];
    if (r.status !== "fulfilled" || !r.value) continue;
    const $ = cheerio.load(r.value.html);
    pagesAudited.push(internalLinks[i]);
    allModuleSets.push([
      analyzeSchema($),
      analyzeMeta($),
      analyzeContent($),
    ]);
  }

  const modules = mergeModules(allModuleSets);
  const externalResult = await externalPromise;
  modules.push(externalResult);

  if (aiCitationsPromise) {
    const aiCitationsResult = await aiCitationsPromise;
    if (aiCitationsResult) {
      modules.push(aiCitationsResult);
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
        validCompetitors.map((c) => auditSingleUrl(c, { skipAI: true }))
      );
      competitorResults = results.filter(
        (r): r is AuditResult => !("error" in r)
      );
    }

    return NextResponse.json({
      ...primary,
      competitors: competitorResults,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: `Audit failed: ${message}` },
      { status: 500 }
    );
  }
}
