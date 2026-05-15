import * as cheerio from "cheerio";
import type { ModuleResult, Finding, Recommendation } from "../types";

/**
 * How AI sees your products.
 *
 * For a DTC brand, the most important AI signal isn't on the homepage —
 * it's on the product pages. When a shopper asks ChatGPT "is this in
 * stock?" or "what does it cost?" or "what do reviews say?", AI reads
 * the Product schema embedded in your PDPs.
 *
 * This module:
 *   1. Identifies which crawled pages are product detail pages (PDPs)
 *      via URL pattern matching (Shopify /products/, WooCommerce
 *      /product/, /shop/, /store/, /p/)
 *   2. Parses Product JSON-LD from those pages
 *   3. Scores against six DTC-critical signals: price, stock,
 *      reviews, images, brand, identifier
 *
 * Findings are written in plain English on purpose — no schema.org
 * jargon. A DTC founder shouldn't need to know what "aggregateRating"
 * means to read their audit. They just need to know "AI can't see your
 * reviews" and a clear next step.
 *
 * Returns null if no product pages were discovered (B2B SaaS sites
 * etc.). Skipping cleanly is better than reporting "no products" for
 * sites that don't have any.
 */

// URL patterns that look like a product detail page. Covers the major
// DTC platforms (Shopify, WooCommerce, BigCommerce, Magento, custom).
const PRODUCT_PATH_RE = /\/(?:products?|p|shop|store|item)\/[^/]+/i;

interface ProductSchema {
  name?: string;
  brand?: string;
  image?: string;
  price?: number;
  priceCurrency?: string;
  availability?: string;
  sku?: string;
  gtin?: string;
  mpn?: string;
  ratingValue?: number;
  ratingCount?: number;
  reviewCount?: number;
  sourceUrl: string;
}

/**
 * Extract every Product node from a page's JSON-LD blocks. Handles the
 * three common JSON-LD shapes:
 *   • A bare object: { "@type": "Product", ... }
 *   • An array of objects
 *   • A graph: { "@graph": [ ... ] }
 */
function extractProducts(
  $: cheerio.CheerioAPI,
  url: string
): ProductSchema[] {
  const out: ProductSchema[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    let raw = $(el).contents().text();
    if (!raw || raw.trim().length === 0) return;
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    const nodes: unknown[] = [];
    const collect = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(collect);
      else if (v && typeof v === "object") {
        nodes.push(v);
        const graph = (v as { "@graph"?: unknown })["@graph"];
        if (graph) collect(graph);
      }
    };
    collect(data);

    // schema.org Product family. Modern DTC sites often use ProductGroup
    // (a parent with variants — Casper, Allbirds, etc.) rather than the
    // bare Product type. They share the same offers + aggregateRating
    // shape so we treat them identically.
    const PRODUCT_TYPES = new Set([
      "Product",
      "ProductGroup",
      "ProductModel",
      "IndividualProduct",
      "SomeProducts",
    ]);

    for (const node of nodes) {
      const obj = node as Record<string, unknown>;
      const type = obj["@type"];
      const isProduct =
        (typeof type === "string" && PRODUCT_TYPES.has(type)) ||
        (Array.isArray(type) && type.some((t) => typeof t === "string" && PRODUCT_TYPES.has(t)));
      if (!isProduct) continue;

      // Offers can be a single Offer or an AggregateOffer or an array
      const offersRaw = obj.offers;
      const firstOffer = Array.isArray(offersRaw)
        ? (offersRaw[0] as Record<string, unknown> | undefined)
        : (offersRaw as Record<string, unknown> | undefined);
      const priceRaw = firstOffer?.price ?? firstOffer?.lowPrice;
      const priceNum =
        typeof priceRaw === "number"
          ? priceRaw
          : typeof priceRaw === "string"
            ? parseFloat(priceRaw)
            : undefined;

      const availability = (() => {
        const a = firstOffer?.availability;
        if (typeof a !== "string") return undefined;
        return a.replace(/^https?:\/\/schema\.org\//, "");
      })();

      // Brand can be a string or Brand/Organization object
      const brandRaw = obj.brand;
      const brandName =
        typeof brandRaw === "string"
          ? brandRaw
          : (brandRaw as Record<string, unknown> | undefined)?.name as
              | string
              | undefined;

      // Image can be a string, array of strings, or ImageObject
      const imageRaw = obj.image;
      const imageUrl =
        typeof imageRaw === "string"
          ? imageRaw
          : Array.isArray(imageRaw)
            ? (typeof imageRaw[0] === "string"
                ? (imageRaw[0] as string)
                : ((imageRaw[0] as Record<string, unknown>)?.url as
                    | string
                    | undefined))
            : ((imageRaw as Record<string, unknown> | undefined)?.url as
                | string
                | undefined);

      const aggRaw = obj.aggregateRating as
        | Record<string, unknown>
        | undefined;
      const parseNum = (v: unknown) =>
        typeof v === "number"
          ? v
          : typeof v === "string"
            ? parseFloat(v)
            : undefined;

      out.push({
        name: obj.name as string | undefined,
        brand: brandName,
        image: imageUrl,
        price: priceNum,
        priceCurrency: firstOffer?.priceCurrency as string | undefined,
        availability,
        sku: obj.sku as string | undefined,
        gtin:
          (obj.gtin as string | undefined) ||
          (obj.gtin13 as string | undefined) ||
          (obj.gtin12 as string | undefined) ||
          (obj.gtin8 as string | undefined),
        mpn: obj.mpn as string | undefined,
        ratingValue: parseNum(aggRaw?.ratingValue),
        ratingCount: parseNum(aggRaw?.ratingCount),
        reviewCount: parseNum(aggRaw?.reviewCount),
        sourceUrl: url,
      });
    }
  });

  return out;
}

/**
 * Aggregate analyzer. `pages` and `pageUrls` are paired by index —
 * pages[i] is the parsed DOM of pageUrls[i]. Same convention used by
 * the other multi-page analyzers in this folder.
 */
export function analyzeProducts(
  pages: cheerio.CheerioAPI[],
  pageUrls: string[]
): ModuleResult | null {
  // Pair pages with their URLs and keep only the ones that look like PDPs
  const productPages: Array<{ $: cheerio.CheerioAPI; url: string }> = [];
  for (let i = 0; i < pages.length; i++) {
    const url = pageUrls[i] || "";
    if (PRODUCT_PATH_RE.test(url)) {
      productPages.push({ $: pages[i], url });
    }
  }

  // No PDPs in the crawl: this brand probably isn't DTC-shaped. Skip
  // the whole module rather than scoring them down for being out of
  // scope.
  if (productPages.length === 0) {
    return null;
  }

  // Extract every Product schema across every PDP we crawled
  const products: ProductSchema[] = [];
  for (const p of productPages) {
    products.push(...extractProducts(p.$, p.url));
  }

  const findings: Finding[] = [];
  const recommendations: Recommendation[] = [];
  let score = 0;

  // ── Case 1: PDPs exist but no Product schema at all ─────────────
  if (products.length === 0) {
    findings.push({
      label: "Product detail markup",
      status: "fail",
      detail: `We found ${productPages.length} product page${
        productPages.length === 1 ? "" : "s"
      } but none of them describe what you sell in a way AI can read. When shoppers ask "is this in stock?" or "what does it cost?", you're invisible.`,
    });
    recommendations.push({
      priority: "high",
      title: "Add product structured data to your PDPs",
      description:
        "On Shopify, the Schema App or Aristotle apps add Product schema to every PDP in a few clicks. On WooCommerce, the Yoast SEO plugin handles it. Without this, AI tools can't answer price, stock, or review questions about your brand.",
      snippetTarget: "Add this JSON-LD inside each product page <head>",
      language: "json",
      fixSnippet: JSON.stringify(
        {
          "@context": "https://schema.org",
          "@type": "Product",
          name: "Your product name",
          brand: { "@type": "Brand", name: "Your brand" },
          image: "https://yourbrand.com/products/product-image.jpg",
          offers: {
            "@type": "Offer",
            price: "49.00",
            priceCurrency: "USD",
            availability: "https://schema.org/InStock",
          },
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: "4.7",
            reviewCount: "1240",
          },
        },
        null,
        2
      ),
    });
    return {
      name: "How AI sees your products",
      slug: "products",
      score: 0,
      icon: "🛍️",
      description:
        "When shoppers ask AI about prices, stock, or reviews, AI reads your product page markup. This module checks what AI can actually see.",
      findings,
      recommendations,
    };
  }

  // ── Case 2: Product schema present — score the completeness ─────
  score = 25; // base for having any Product schema
  findings.push({
    label: "Product markup found",
    status: "pass",
    detail: `${products.length} product${
      products.length === 1 ? "" : "s"
    } described in structured data across ${productPages.length} page${
      productPages.length === 1 ? "" : "s"
    }. AI tools can read what you sell.`,
  });

  // Price + currency
  const withPrice = products.filter(
    (p) =>
      typeof p.price === "number" &&
      !Number.isNaN(p.price) &&
      typeof p.priceCurrency === "string"
  );
  if (withPrice.length === products.length) {
    score += 20;
    findings.push({
      label: "Prices",
      status: "pass",
      detail: "AI can see your prices on every product page.",
    });
  } else if (withPrice.length > 0) {
    score += 10;
    findings.push({
      label: "Prices",
      status: "warn",
      detail: `${withPrice.length} of ${products.length} products expose price to AI. The rest don't — when shoppers ask "how much?", those products are invisible.`,
    });
  } else {
    findings.push({
      label: "Prices",
      status: "fail",
      detail:
        "AI can't see what your products cost. When shoppers ask price questions, you're absent from the answer.",
    });
    recommendations.push({
      priority: "high",
      title: "Show your prices to AI",
      description:
        "Add price and priceCurrency to your Product offer schema. Most Shopify themes already include this — check that yours hasn't disabled it.",
    });
  }

  // Stock / availability
  const withStock = products.filter((p) => p.availability);
  if (withStock.length === products.length) {
    score += 15;
    const inStock = withStock.filter((p) =>
      /InStock/i.test(p.availability!)
    ).length;
    findings.push({
      label: "Stock status",
      status: "pass",
      detail: `AI knows your stock status across all products${
        inStock > 0 ? ` (${inStock} in stock right now)` : ""
      }.`,
    });
  } else if (withStock.length > 0) {
    score += 8;
    findings.push({
      label: "Stock status",
      status: "warn",
      detail: `${withStock.length} of ${products.length} products tell AI whether they're in stock.`,
    });
  } else {
    findings.push({
      label: "Stock status",
      status: "fail",
      detail:
        'AI doesn\'t know if your products are in stock. "Where can I get this now?" queries miss you.',
    });
  }

  // Reviews — the heaviest weight
  const withRating = products.filter(
    (p) => typeof p.ratingValue === "number" && !Number.isNaN(p.ratingValue)
  );
  if (withRating.length === products.length) {
    score += 25;
    const avg =
      withRating.reduce((s, p) => s + p.ratingValue!, 0) / withRating.length;
    const totalReviews = withRating.reduce(
      (s, p) => s + (p.reviewCount ?? p.ratingCount ?? 0),
      0
    );
    findings.push({
      label: "Reviews",
      status: "pass",
      detail: `AI sees your reviews. Average rating ${avg.toFixed(1)}/5${
        totalReviews > 0 ? ` across ${totalReviews.toLocaleString()} reviews` : ""
      }. Reviews are one of the strongest signals AI uses to pick a brand to recommend — you're feeding it.`,
    });
  } else if (withRating.length > 0) {
    score += 12;
    findings.push({
      label: "Reviews",
      status: "warn",
      detail: `Only ${withRating.length} of ${products.length} products expose reviews to AI. The rest are missing one of the strongest signals AI uses to pick a brand.`,
    });
  } else {
    findings.push({
      label: "Reviews",
      status: "fail",
      detail:
        "AI can't see your reviews. Even if you have hundreds of 5-star reviews on your site, AI ignores them unless they're in structured data. This is the single biggest GEO miss most DTC brands make.",
    });
    recommendations.push({
      priority: "high",
      title: "Wire your reviews into product schema",
      description:
        "Loox, Yotpo, Judge.me, and Stamped all support aggregateRating in schema with one toggle. Once enabled, AI tools will quote your average rating when shoppers ask 'is this brand any good?' Without it, your social proof is invisible to AI.",
    });
  }

  // Images
  const withImage = products.filter((p) => p.image && p.image.length > 0);
  if (withImage.length === products.length) {
    score += 10;
    findings.push({
      label: "Product images",
      status: "pass",
      detail: "AI has access to your product images.",
    });
  } else if (withImage.length > 0) {
    score += 5;
    findings.push({
      label: "Product images",
      status: "warn",
      detail: `${withImage.length} of ${products.length} products expose images to AI.`,
    });
  } else {
    findings.push({
      label: "Product images",
      status: "fail",
      detail:
        "AI doesn't have your product images. Image-rich AI answers can't include you.",
    });
  }

  // Identifier (sku/gtin/mpn) — useful for matching across the web
  const withId = products.filter((p) => p.gtin || p.sku || p.mpn);
  if (withId.length === products.length) {
    score += 5;
    findings.push({
      label: "Product identifiers",
      status: "pass",
      detail:
        "SKUs and GTINs are in place. AI can match your products across the web.",
    });
  } else if (withId.length === 0) {
    findings.push({
      label: "Product identifiers",
      status: "warn",
      detail:
        "No SKU or GTIN in your product schema. AI has a harder time matching your products to mentions on review sites and forums.",
    });
  }

  return {
    name: "How AI sees your products",
    slug: "products",
    score: Math.min(100, score),
    icon: "🛍️",
    description:
      "When shoppers ask AI about prices, stock, or reviews, AI reads your product page markup. This module checks what AI can actually see.",
    findings,
    recommendations,
  };
}
