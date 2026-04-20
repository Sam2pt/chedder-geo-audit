import type { CheerioAPI } from "cheerio";
import { Finding, ModuleResult, Recommendation } from "../types";

const IMPORTANT_SCHEMAS = [
  "Organization",
  "WebSite",
  "WebPage",
  "Article",
  "Product",
  "FAQPage",
  "HowTo",
  "BreadcrumbList",
  "LocalBusiness",
  "Person",
  "Review",
  "Event",
  "Recipe",
  "VideoObject",
  "ImageObject",
];

export function analyzeSchema($: CheerioAPI): ModuleResult {
  const findings: Finding[] = [];
  const recommendations: Recommendation[] = [];
  let score = 0;

  // Parse JSON-LD
  const jsonLdScripts = $('script[type="application/ld+json"]');
  const schemas: string[] = [];

  jsonLdScripts.each((_, el) => {
    try {
      const content = $(el).html();
      if (!content) return;
      const data = JSON.parse(content);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item["@graph"]) {
          for (const node of item["@graph"]) {
            if (node["@type"]) {
              const types = Array.isArray(node["@type"])
                ? node["@type"]
                : [node["@type"]];
              schemas.push(...types);
            }
          }
        } else if (item["@type"]) {
          const types = Array.isArray(item["@type"])
            ? item["@type"]
            : [item["@type"]];
          schemas.push(...types);
        }
      }
    } catch {
      // invalid JSON-LD
    }
  });

  // Check for microdata
  const microdataElements = $("[itemtype]");
  microdataElements.each((_, el) => {
    const itemtype = $(el).attr("itemtype") || "";
    const type = itemtype.split("/").pop();
    if (type) schemas.push(type);
  });

  const uniqueSchemas = [...new Set(schemas)];

  // JSON-LD presence
  if (jsonLdScripts.length > 0) {
    findings.push({
      label: "JSON-LD Structured Data",
      status: "pass",
      detail: `Found ${jsonLdScripts.length} JSON-LD block(s)`,
    });
    score += 25;
  } else {
    findings.push({
      label: "JSON-LD Structured Data",
      status: "fail",
      detail: "No JSON-LD structured data found",
    });
    recommendations.push({
      priority: "high",
      title: "Add JSON-LD Structured Data",
      description:
        "JSON-LD is the preferred format for structured data. Add Organization, WebSite, and page-specific schemas to help AI models understand your content.",
      snippetTarget: "Add to <head>",
      language: "html",
      fixSnippet: `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Your Brand Name",
  "url": "https://yourdomain.com",
  "logo": "https://yourdomain.com/logo.png",
  "description": "What your company does in one sentence.",
  "sameAs": [
    "https://twitter.com/yourbrand",
    "https://www.linkedin.com/company/yourbrand"
  ]
}
</script>`,
    });
  }

  // Schema types found
  if (uniqueSchemas.length > 0) {
    findings.push({
      label: "Schema Types Detected",
      status: "pass",
      detail: uniqueSchemas.join(", "),
    });
    score += 15;
  }

  // Check important schemas
  const hasOrg =
    uniqueSchemas.some((s) => s === "Organization" || s === "LocalBusiness");
  const hasWebSite = uniqueSchemas.includes("WebSite");
  const hasFAQ = uniqueSchemas.includes("FAQPage");
  const hasArticle =
    uniqueSchemas.includes("Article") ||
    uniqueSchemas.includes("BlogPosting") ||
    uniqueSchemas.includes("NewsArticle");
  const hasBreadcrumb = uniqueSchemas.includes("BreadcrumbList");
  const hasProduct = uniqueSchemas.includes("Product");

  if (hasOrg) {
    findings.push({
      label: "Organization Schema",
      status: "pass",
      detail: "Organization or LocalBusiness schema found",
    });
    score += 15;
  } else {
    findings.push({
      label: "Organization Schema",
      status: "fail",
      detail: "No Organization schema found",
    });
    recommendations.push({
      priority: "high",
      title: "Add Organization Schema",
      description:
        "Organization schema helps AI models identify your brand, logo, social profiles, and contact info. This is critical for brand recognition in AI answers.",
      snippetTarget: "Add to <head>",
      language: "html",
      fixSnippet: `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Your Brand",
  "alternateName": "Short Brand",
  "url": "https://yourdomain.com",
  "logo": "https://yourdomain.com/logo.png",
  "description": "One-sentence description of what you do.",
  "foundingDate": "2015",
  "contactPoint": {
    "@type": "ContactPoint",
    "contactType": "customer support",
    "email": "support@yourdomain.com"
  },
  "sameAs": [
    "https://twitter.com/yourbrand",
    "https://www.linkedin.com/company/yourbrand",
    "https://github.com/yourbrand"
  ]
}
</script>`,
    });
  }

  if (hasWebSite) {
    findings.push({
      label: "WebSite Schema",
      status: "pass",
      detail: "WebSite schema with potential sitelinks search",
    });
    score += 10;
  } else {
    findings.push({
      label: "WebSite Schema",
      status: "warn",
      detail: "No WebSite schema found",
    });
    recommendations.push({
      priority: "medium",
      title: "Add WebSite Schema",
      description:
        "WebSite schema helps AI understand your site structure and enables sitelinks search functionality.",
      snippetTarget: "Add to <head>",
      language: "html",
      fixSnippet: `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Your Site Name",
  "url": "https://yourdomain.com",
  "potentialAction": {
    "@type": "SearchAction",
    "target": "https://yourdomain.com/search?q={search_term_string}",
    "query-input": "required name=search_term_string"
  }
}
</script>`,
    });
  }

  if (hasFAQ) {
    findings.push({
      label: "FAQ Schema",
      status: "pass",
      detail: "FAQPage schema found, excellent for AI citation",
    });
    score += 15;
  } else {
    findings.push({
      label: "FAQ Schema",
      status: "warn",
      detail: "No FAQ schema found",
    });
    recommendations.push({
      priority: "medium",
      title: "Add FAQ Schema",
      description:
        "FAQ schema is one of the most effective ways to get cited by AI. Add structured FAQ content to increase chances of appearing in AI-generated answers.",
      snippetTarget: "Add to FAQ pages",
      language: "html",
      fixSnippet: `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What does [Your Brand] do?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Clear, direct, AI-citable answer in 1-2 sentences."
      }
    },
    {
      "@type": "Question",
      "name": "How is [Your Brand] different from competitors?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Concrete differentiator AI can quote verbatim."
      }
    }
  ]
}
</script>`,
    });
  }

  if (hasBreadcrumb) {
    findings.push({
      label: "Breadcrumb Schema",
      status: "pass",
      detail: "BreadcrumbList schema found",
    });
    score += 10;
  }

  if (hasArticle || hasProduct) {
    findings.push({
      label: "Content Schema",
      status: "pass",
      detail: `${hasArticle ? "Article" : ""}${hasArticle && hasProduct ? " & " : ""}${hasProduct ? "Product" : ""} schema found`,
    });
    score += 10;
  }

  return {
    name: "The labels AI reads first",
    slug: "schema",
    score: Math.min(score, 100),
    icon: "🏗️",
    description:
      "Structured data tags give AI tools a clean summary of your brand, products, and answers.",
    findings,
    recommendations,
  };
}
