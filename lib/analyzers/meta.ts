import type { CheerioAPI } from "cheerio";
import { Finding, ModuleResult, Recommendation } from "../types";

export function analyzeMeta($: CheerioAPI): ModuleResult {
  const findings: Finding[] = [];
  const recommendations: Recommendation[] = [];
  let score = 0;

  // Title
  const title = $("title").text().trim();
  if (title) {
    const len = title.length;
    if (len >= 30 && len <= 60) {
      findings.push({
        label: "Page Title",
        status: "pass",
        detail: `"${title}" (${len} chars, optimal)`,
      });
      score += 15;
    } else {
      findings.push({
        label: "Page Title",
        status: "warn",
        detail: `"${title}" (${len} chars. ${len < 30 ? "too short" : "too long"})`,
      });
      score += 8;
      recommendations.push({
        priority: "medium",
        title: "Optimize Page Title Length",
        description: `Your title is ${len} characters. Aim for 30-60 characters for optimal AI readability and citation.`,
        snippetTarget: "Replace in <head>",
        language: "html",
        fixSnippet: `<title>Brand Name · Clear Value Prop in 50-60 Chars</title>`,
      });
    }
  } else {
    findings.push({
      label: "Page Title",
      status: "fail",
      detail: "No page title found",
    });
    recommendations.push({
      priority: "high",
      title: "Add a Page Title",
      description:
        "A descriptive page title is essential for AI models to understand and reference your brand.",
      snippetTarget: "Add to <head>",
      language: "html",
      fixSnippet: `<title>Your Brand · The One-Line Value Proposition</title>`,
    });
  }

  // Meta description
  const description =
    $('meta[name="description"]').attr("content")?.trim() || "";
  if (description) {
    const len = description.length;
    if (len >= 120 && len <= 160) {
      findings.push({
        label: "Meta Description",
        status: "pass",
        detail: `${len} chars, optimal length`,
      });
      score += 15;
    } else {
      findings.push({
        label: "Meta Description",
        status: "warn",
        detail: `${len} chars. ${len < 120 ? "too short, add more detail" : "too long, may be truncated"}`,
      });
      score += 8;
      recommendations.push({
        priority: "medium",
        title: "Optimize Meta Description",
        description: `Your meta description is ${len} chars. Aim for 120-160 characters with a clear value proposition for AI to cite.`,
        snippetTarget: "Replace in <head>",
        language: "html",
        fixSnippet: `<meta name="description" content="Clear 120-160 char summary. Lead with what you do, who it's for, and the key differentiator AI should quote." />`,
      });
    }
  } else {
    findings.push({
      label: "Meta Description",
      status: "fail",
      detail: "No meta description found",
    });
    recommendations.push({
      priority: "high",
      title: "Add Meta Description",
      description:
        "Meta descriptions are often used by AI models as summary text. Include your brand value proposition and key offerings.",
      snippetTarget: "Add to <head>",
      language: "html",
      fixSnippet: `<meta name="description" content="Clear 120-160 char summary. Lead with what you do, who it's for, and the key differentiator AI should quote." />`,
    });
  }

  // OpenGraph tags
  const ogTitle = $('meta[property="og:title"]').attr("content");
  const ogDesc = $('meta[property="og:description"]').attr("content");
  const ogImage = $('meta[property="og:image"]').attr("content");
  const ogType = $('meta[property="og:type"]').attr("content");
  const ogUrl = $('meta[property="og:url"]').attr("content");

  const ogCount = [ogTitle, ogDesc, ogImage, ogType, ogUrl].filter(
    Boolean
  ).length;

  if (ogCount >= 4) {
    findings.push({
      label: "OpenGraph Tags",
      status: "pass",
      detail: `${ogCount}/5 essential OG tags present`,
    });
    score += 20;
  } else if (ogCount >= 2) {
    findings.push({
      label: "OpenGraph Tags",
      status: "warn",
      detail: `Only ${ogCount}/5 essential OG tags present`,
    });
    score += 10;
    recommendations.push({
      priority: "medium",
      title: "Complete OpenGraph Tags",
      description:
        "Add missing OG tags (title, description, image, type, url). These help AI models and social platforms understand your content.",
      snippetTarget: "Add to <head>",
      language: "html",
      fixSnippet: `<meta property="og:title" content="Your Brand — Page Title" />
<meta property="og:description" content="120-160 char summary of the page." />
<meta property="og:image" content="https://yourdomain.com/og-image.png" />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://yourdomain.com/this-page" />`,
    });
  } else {
    findings.push({
      label: "OpenGraph Tags",
      status: "fail",
      detail: "Missing OpenGraph tags",
    });
    recommendations.push({
      priority: "high",
      title: "Add OpenGraph Tags",
      description:
        "OpenGraph tags provide AI and social platforms with structured metadata about your pages. Add og:title, og:description, og:image, og:type, and og:url.",
      snippetTarget: "Add to <head>",
      language: "html",
      fixSnippet: `<meta property="og:title" content="Your Brand — Page Title" />
<meta property="og:description" content="120-160 char summary of the page." />
<meta property="og:image" content="https://yourdomain.com/og-image.png" />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://yourdomain.com/this-page" />`,
    });
  }

  // Twitter Card
  const twitterCard = $('meta[name="twitter:card"]').attr("content");
  const twitterTitle = $('meta[name="twitter:title"]').attr("content");
  if (twitterCard) {
    findings.push({
      label: "Twitter Card",
      status: "pass",
      detail: `Type: ${twitterCard}`,
    });
    score += 10;
  } else {
    findings.push({
      label: "Twitter Card",
      status: "warn",
      detail: "No Twitter Card meta tags",
    });
    recommendations.push({
      priority: "low",
      title: "Add Twitter Card Meta Tags",
      description:
        "Twitter Card tags improve how your content appears when shared and help AI aggregate your social presence.",
      snippetTarget: "Add to <head>",
      language: "html",
      fixSnippet: `<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:site" content="@yourbrand" />
<meta name="twitter:title" content="Your Brand — Page Title" />
<meta name="twitter:description" content="120-160 char summary." />
<meta name="twitter:image" content="https://yourdomain.com/og-image.png" />`,
    });
  }

  // Canonical URL
  const canonical = $('link[rel="canonical"]').attr("href");
  if (canonical) {
    findings.push({
      label: "Canonical URL",
      status: "pass",
      detail: canonical,
    });
    score += 10;
  } else {
    findings.push({
      label: "Canonical URL",
      status: "warn",
      detail: "No canonical URL set",
    });
    recommendations.push({
      priority: "medium",
      title: "Set Canonical URL",
      description:
        "A canonical URL prevents duplicate content issues and tells AI models which version of a page is authoritative.",
      snippetTarget: "Add to <head>",
      language: "html",
      fixSnippet: `<link rel="canonical" href="https://yourdomain.com/this-page" />`,
    });
  }

  // Language
  const lang = $("html").attr("lang");
  if (lang) {
    findings.push({
      label: "Language Declaration",
      status: "pass",
      detail: `lang="${lang}"`,
    });
    score += 10;
  } else {
    findings.push({
      label: "Language Declaration",
      status: "warn",
      detail: "No lang attribute on <html>",
    });
    recommendations.push({
      priority: "low",
      title: "Add Language Attribute",
      description:
        "Declare the page language to help AI models serve your content to the right audience.",
      snippetTarget: "On <html> element",
      language: "html",
      fixSnippet: `<html lang="en">`,
    });
  }

  // Favicon
  const favicon =
    $('link[rel="icon"]').attr("href") ||
    $('link[rel="shortcut icon"]').attr("href");
  if (favicon) {
    findings.push({
      label: "Favicon",
      status: "pass",
      detail: "Favicon found",
    });
    score += 5;
  }

  // Viewport
  const viewport = $('meta[name="viewport"]').attr("content");
  if (viewport) {
    findings.push({
      label: "Viewport Meta",
      status: "pass",
      detail: "Mobile viewport configured",
    });
    score += 5;
  }

  return {
    name: "Meta & OpenGraph Tags",
    slug: "meta",
    score: Math.min(score, 100),
    icon: "🏷️",
    description:
      "Meta tags help AI models understand your page purpose and brand identity",
    findings,
    recommendations,
  };
}
