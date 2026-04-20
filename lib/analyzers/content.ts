import type { CheerioAPI } from "cheerio";
import { Finding, ModuleResult, Recommendation } from "../types";

/**
 * Analyze content quality across one or more pages.
 *
 * Accepts an array of loaded Cheerio instances (homepage first, then any
 * crawled sub-pages). Most signals are best-case aggregated across pages
 * — a site gets credit if /faq has FAQ content even if the homepage doesn't.
 * The H1 and internal-linking findings stay homepage-centric because those
 * are what AI tools see first when asked about the brand directly.
 */
export function analyzeContent(pages: CheerioAPI[]): ModuleResult {
  const findings: Finding[] = [];
  const recommendations: Recommendation[] = [];
  let score = 0;

  const $home = pages[0];

  // Heading hierarchy (homepage-primary — this is the landing page's job)
  const h1s = $home("h1");
  const h2s = $home("h2");
  // (h3s unused; kept in original for possible future signals)

  if (h1s.length === 1) {
    findings.push({
      label: "H1 Heading",
      status: "pass",
      detail: `Single H1: "${h1s.first().text().trim().slice(0, 80)}"`,
    });
    score += 15;
  } else if (h1s.length === 0) {
    findings.push({
      label: "H1 Heading",
      status: "fail",
      detail: "No H1 heading found",
    });
    recommendations.push({
      priority: "high",
      title: "Add a Single H1 Heading",
      description:
        "Every page should have exactly one H1 that clearly describes the page topic. AI models use H1 as the primary content signal.",
      snippetTarget: "Add near top of page body",
      language: "html",
      fixSnippet: `<h1>Clear, Descriptive Topic of This Page</h1>`,
    });
  } else {
    findings.push({
      label: "H1 Heading",
      status: "warn",
      detail: `Found ${h1s.length} H1 headings, should be exactly 1`,
    });
    score += 5;
    recommendations.push({
      priority: "medium",
      title: "Use Single H1",
      description: `You have ${h1s.length} H1 tags. Use exactly one H1 per page as the main topic identifier for AI.`,
    });
  }

  if (h2s.length >= 2) {
    findings.push({
      label: "Content Structure (H2s)",
      status: "pass",
      detail: `${h2s.length} H2 subheadings, good content structure`,
    });
    score += 10;
  } else if (h2s.length === 1) {
    findings.push({
      label: "Content Structure (H2s)",
      status: "warn",
      detail: "Only 1 H2, consider adding more sections",
    });
    score += 5;
  } else {
    findings.push({
      label: "Content Structure (H2s)",
      status: "fail",
      detail: "No H2 headings found",
    });
    recommendations.push({
      priority: "medium",
      title: "Add H2 Subheadings",
      description:
        "Break content into clear sections with H2 headings. AI models use heading hierarchy to understand content topics.",
    });
  }

  // Content length (aggregated across crawled pages)
  let wordCount = 0;
  for (const $p of pages) {
    const text = $p("body").text().replace(/\s+/g, " ").trim();
    wordCount += text ? text.split(/\s+/).length : 0;
  }

  if (wordCount >= 800) {
    findings.push({
      label: "Content Length",
      status: "pass",
      detail: `~${wordCount} words, comprehensive content`,
    });
    score += 15;
  } else if (wordCount >= 300) {
    findings.push({
      label: "Content Length",
      status: "warn",
      detail: `~${wordCount} words, could be more comprehensive`,
    });
    score += 8;
    recommendations.push({
      priority: "medium",
      title: "Expand Content Depth",
      description:
        "Pages with 800+ words of quality content are more likely to be cited by AI. Add more detailed, expert-level content.",
    });
  } else {
    findings.push({
      label: "Content Length",
      status: "fail",
      detail: `~${wordCount} words, very thin content`,
    });
    recommendations.push({
      priority: "high",
      title: "Add Substantial Content",
      description:
        "AI models need sufficient content to extract meaningful information. Aim for 800+ words of valuable, expert content.",
    });
  }

  // Lists (summed across pages so a product page's spec list counts)
  let listsTotal = 0;
  for (const $p of pages) listsTotal += $p("ul, ol").length;
  const lists = { length: listsTotal } as { length: number };
  if (lists.length >= 2) {
    findings.push({
      label: "Lists",
      status: "pass",
      detail: `${lists.length} lists found. AI-friendly format`,
    });
    score += 10;
  } else if (lists.length === 1) {
    findings.push({
      label: "Lists",
      status: "warn",
      detail: "1 list found, add more structured content",
    });
    score += 5;
  } else {
    findings.push({
      label: "Lists",
      status: "warn",
      detail: "No lists found",
    });
    recommendations.push({
      priority: "low",
      title: "Add Structured Lists",
      description:
        "Bullet points and numbered lists are preferred by AI models for extracting and presenting information.",
      snippetTarget: "Example: key features list",
      language: "html",
      fixSnippet: `<h2>Key features</h2>
<ul>
  <li><strong>Fast setup:</strong> live in under 10 minutes.</li>
  <li><strong>No vendor lock-in:</strong> export your data anytime.</li>
  <li><strong>SOC 2 certified:</strong> enterprise-ready security.</li>
</ul>`,
    });
  }

  // Tables (summed across pages)
  let tablesTotal = 0;
  for (const $p of pages) tablesTotal += $p("table").length;
  if (tablesTotal > 0) {
    findings.push({
      label: "Data Tables",
      status: "pass",
      detail: `${tablesTotal} table${tablesTotal === 1 ? "" : "s"} found, great for AI data extraction`,
    });
    score += 10;
  }

  // FAQ sections — pass if ANY crawled page has an FAQ region.
  let faqIndicators = 0;
  for (const $p of pages) {
    faqIndicators += $p("*")
      .filter(function () {
        const text = $p(this).text().toLowerCase();
        return (
          (text.includes("frequently asked") ||
            text.includes("faq") ||
            text.includes("common questions")) &&
          $p(this).is("h1, h2, h3, h4, [class*='faq'], [id*='faq']")
        );
      })
      .length;
  }

  if (faqIndicators > 0) {
    findings.push({
      label: "FAQ Content",
      status: "pass",
      detail: "FAQ section detected, excellent for AI citations",
    });
    score += 15;
  } else {
    findings.push({
      label: "FAQ Content",
      status: "warn",
      detail: "No FAQ section detected",
    });
    recommendations.push({
      priority: "high",
      title: "Add an FAQ Section",
      description:
        "FAQ content is one of the top signals for AI citation. Add a frequently asked questions section with clear question-answer pairs.",
      snippetTarget: "Add HTML + JSON-LD together",
      language: "html",
      fixSnippet: `<section id="faq">
  <h2>Frequently Asked Questions</h2>
  <div>
    <h3>What does [Brand] do?</h3>
    <p>Direct answer AI can quote in 1-2 sentences.</p>
  </div>
  <div>
    <h3>How is [Brand] different from alternatives?</h3>
    <p>Concrete differentiator, e.g. "We're the only X that does Y."</p>
  </div>
  <div>
    <h3>Who is [Brand] built for?</h3>
    <p>Describe the ideal customer in their words.</p>
  </div>
</section>

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    { "@type": "Question", "name": "What does [Brand] do?",
      "acceptedAnswer": { "@type": "Answer", "text": "Direct answer." } },
    { "@type": "Question", "name": "How is [Brand] different?",
      "acceptedAnswer": { "@type": "Answer", "text": "Concrete differentiator." } }
  ]
}
</script>`,
    });
  }

  // Internal linking — measure on the homepage since that's the entry
  // point AI crawlers discover the site through.
  const internalLinks = $home("a[href^='/'], a[href^='#']").length;
  if (internalLinks >= 5) {
    findings.push({
      label: "Internal Linking",
      status: "pass",
      detail: `${internalLinks} internal links, helps AI crawl and understand site structure`,
    });
    score += 10;
  } else {
    findings.push({
      label: "Internal Linking",
      status: "warn",
      detail: `Only ${internalLinks} internal links`,
    });
    recommendations.push({
      priority: "medium",
      title: "Improve Internal Linking",
      description:
        "Add more internal links to help AI crawlers discover and understand relationships between your content.",
    });
  }

  // Images with alt text (aggregated across pages)
  let imagesTotal = 0;
  let imagesWithAltTotal = 0;
  for (const $p of pages) {
    imagesTotal += $p("img").length;
    imagesWithAltTotal += $p("img[alt]").filter(
      (_, el) => ($p(el).attr("alt") || "").trim().length > 0
    ).length;
  }
  const images = { length: imagesTotal } as { length: number };
  const imagesWithAlt = { length: imagesWithAltTotal } as { length: number };

  if (images.length > 0) {
    const ratio = imagesWithAlt.length / images.length;
    if (ratio >= 0.8) {
      findings.push({
        label: "Image Alt Text",
        status: "pass",
        detail: `${imagesWithAlt.length}/${images.length} images have alt text`,
      });
      score += 10;
    } else {
      findings.push({
        label: "Image Alt Text",
        status: "warn",
        detail: `Only ${imagesWithAlt.length}/${images.length} images have alt text`,
      });
      recommendations.push({
        priority: "medium",
        title: "Add Alt Text to Images",
        description:
          "Descriptive alt text helps AI models understand visual content and improves accessibility.",
      });
      score += 3;
    }
  }

  return {
    name: "The words on your page",
    slug: "content",
    score: Math.min(score, 100),
    icon: "📝",
    description:
      "Clear headings, lists, and FAQs make it easy for AI to lift your answers verbatim.",
    findings,
    recommendations,
  };
}
