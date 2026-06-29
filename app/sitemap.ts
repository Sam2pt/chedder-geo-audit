import type { MetadataRoute } from "next";
import { listPosts } from "@/lib/posts";
import { listBrands } from "@/lib/brands";

/**
 * Sitemap surfaced at /sitemap.xml.
 *
 * Includes the home/pricing/blog/brand/legal pages plus every
 * published markdown post under content/posts/ and every brand
 * landing page under /brand/[slug]. Audit detail pages at /a/[slug]
 * are deliberately NOT enumerated here — they're behind a "share"
 * action and we don't want every anonymous audit to leak into Google.
 *
 * Pushed to a high crawl priority on the home + blog index + brand
 * index since those are the pages we most want re-crawled when new
 * posts/brands ship.
 */

const SITE = "https://chedder.2pt.ai";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE}/brand`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  const postEntries: MetadataRoute.Sitemap = listPosts().map((p) => ({
    url: `${SITE}/blog/${p.slug}`,
    lastModified: p.date ? new Date(p.date) : now,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  const brandEntries: MetadataRoute.Sitemap = listBrands().map((b) => ({
    url: `${SITE}/brand/${b.slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  return [...staticEntries, ...postEntries, ...brandEntries];
}
