import type { MetadataRoute } from "next";

/**
 * /robots.txt
 *
 * Allow crawlers everywhere by default. Block:
 *   • /api  — request handlers, nothing useful to index
 *   • /admin — internal-only dashboards
 *   • /my-audits — per-user audit history; private to the signed-in user
 *   • /billing — Stripe success/cancel landing pages; transient state
 *
 * Audit detail pages at /a/<slug> stay crawlable: they're public share
 * links and useful long-tail SEO surfaces.
 */

const SITE = "https://chedder.2pt.ai";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin/", "/my-audits", "/billing/"],
    },
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
