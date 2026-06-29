import type { MetadataRoute } from "next";
import { listPosts } from "@/lib/posts";

/**
 * Sitemap surfaced at /sitemap.xml.
 *
 * Includes the home/pricing/blog/legal pages plus every published
 * markdown post under content/posts/. Audit detail pages at /a/[slug]
 * are deliberately NOT enumerated here — they're behind a "share"
 * action and we don't want every anonymous audit to leak into Google.
 *
 * Pushed to a high crawl priority on the home + blog index since
 * those are the pages we most want to be re-crawled when fresh blog
 * posts ship.
 */

const SITE = "https://chedder.2pt.ai";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  const postEntries: MetadataRoute.Sitemap = listPosts().map((p) => ({
    url: `${SITE}/blog/${p.slug}`,
    lastModified: p.date ? new Date(p.date) : now,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  return [...staticEntries, ...postEntries];
}
