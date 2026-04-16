import type { CheerioAPI } from "cheerio";
import { Finding, ModuleResult, Recommendation } from "../types";

export function analyzeContent($: CheerioAPI): ModuleResult {
  const findings: Finding[] = [];
  const recommendations: Recommendation[] = [];
  let score = 0;

  // Heading hierarchy
  const h1s = $("h1");
  const h2s = $("h2");
  const h3s = $("h3");

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

  // Content length
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const wordCount = bodyText.split(/\s+/).length;

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

  // Lists (AI-friendly format)
  const lists = $("ul, ol");
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
    });
  }

  // Tables
  const tables = $("table");
  if (tables.length > 0) {
    findings.push({
      label: "Data Tables",
      status: "pass",
      detail: `${tables.length} table(s) found, great for AI data extraction`,
    });
    score += 10;
  }

  // FAQ sections (even without schema)
  const faqIndicators = $("*")
    .filter(function () {
      const text = $(this).text().toLowerCase();
      return (
        (text.includes("frequently asked") ||
          text.includes("faq") ||
          text.includes("common questions")) &&
        $(this).is("h1, h2, h3, h4, [class*='faq'], [id*='faq']")
      );
    })
    .length;

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
    });
  }

  // Internal links
  const internalLinks = $("a[href^='/'], a[href^='#']").length;
  const allLinks = $("a[href]").length;
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

  // Images with alt text
  const images = $("img");
  const imagesWithAlt = $("img[alt]").filter(
    (_, el) => ($(el).attr("alt") || "").trim().length > 0
  );

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
    name: "Content Structure & Quality",
    slug: "content",
    score: Math.min(score, 100),
    icon: "📝",
    description:
      "Well-structured content is more likely to be cited by AI models",
    findings,
    recommendations,
  };
}
