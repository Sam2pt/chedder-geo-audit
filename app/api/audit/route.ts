import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { analyzeSchema } from "@/lib/analyzers/schema";
import { analyzeMeta } from "@/lib/analyzers/meta";
import { analyzeContent } from "@/lib/analyzers/content";
import { analyzeTechnical } from "@/lib/analyzers/technical";
import { analyzeAuthority } from "@/lib/analyzers/authority";
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

  // Sort so priority pages come first
  const urls = [...found];
  urls.sort((a, b) => {
    const aP = priority.findIndex((p) => a.toLowerCase().includes(p));
    const bP = priority.findIndex((p) => b.toLowerCase().includes(p));
    const aScore = aP >= 0 ? aP : 100;
    const bScore = bP >= 0 ? bP : 100;
    return aScore - bScore;
  });

  return urls.slice(0, MAX_PAGES - 1); // leave room for homepage
}

function mergeModules(all: ModuleResult[][]): ModuleResult[] {
  // Group by slug, pick the best score, and merge unique findings/recommendations
  const bySlug = new Map<string, ModuleResult[]>();
  for (const modules of all) {
    for (const m of modules) {
      if (!bySlug.has(m.slug)) bySlug.set(m.slug, []);
      bySlug.get(m.slug)!.push(m);
    }
  }

  const merged: ModuleResult[] = [];
  for (const [, instances] of bySlug) {
    // Use the best score (most optimized page)
    const best = instances.reduce((a, b) => (a.score >= b.score ? a : b));

    // Deduplicate findings by label
    const seenFindings = new Set<string>();
    const allFindings = instances.flatMap((i) => i.findings);
    const uniqueFindings = allFindings.filter((f) => {
      if (seenFindings.has(f.label)) return false;
      seenFindings.add(f.label);
      return true;
    });

    // Deduplicate recommendations by title
    const seenRecs = new Set<string>();
    const allRecs = instances.flatMap((i) => i.recommendations);
    const uniqueRecs = allRecs.filter((r) => {
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

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith("http")) {
      normalizedUrl = "https://" + normalizedUrl;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(normalizedUrl);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    // ── Fetch homepage ──────────────────────────────────────────────
    const homePage = await fetchPage(normalizedUrl).catch(() => null);
    if (!homePage) {
      return NextResponse.json(
        { error: "Could not reach site. Check the URL and try again." },
        { status: 422 }
      );
    }

    // ── Fetch robots.txt & sitemap ──────────────────────────────────
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

    // ── Analyze homepage ────────────────────────────────────────────
    const $home = cheerio.load(homePage.html);
    const homeModules = [
      analyzeSchema($home),
      analyzeMeta($home),
      analyzeContent($home),
      analyzeTechnical($home, technicalCtx),
      analyzeAuthority($home, normalizedUrl),
    ];

    // ── Discover & crawl internal pages ─────────────────────────────
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
      const pageUrl = internalLinks[i];
      pagesAudited.push(pageUrl);

      allModuleSets.push([
        analyzeSchema($),
        analyzeMeta($),
        analyzeContent($),
        // Technical & authority only need to run once (site-wide)
      ]);
    }

    // ── Merge results ───────────────────────────────────────────────
    const modules = mergeModules(allModuleSets);
    const overallScore = calculateOverallScore(modules);

    const result: AuditResult = {
      url: normalizedUrl,
      domain: parsedUrl.hostname,
      overallScore,
      grade: getGrade(overallScore),
      modules,
      topRecommendations: getTopRecommendations(modules),
      pagesAudited,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: `Audit failed: ${message}` },
      { status: 500 }
    );
  }
}
