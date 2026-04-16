import type { CheerioAPI } from "cheerio";
import { Finding, ModuleResult, Recommendation } from "../types";

interface TechnicalContext {
  robotsTxt: string | null;
  sitemapExists: boolean;
  responseHeaders: Record<string, string>;
  url: string;
}

export function analyzeTechnical(
  $: CheerioAPI,
  context: TechnicalContext
): ModuleResult {
  const findings: Finding[] = [];
  const recommendations: Recommendation[] = [];
  let score = 0;

  // Robots.txt analysis
  if (context.robotsTxt !== null) {
    findings.push({
      label: "Robots.txt",
      status: "pass",
      detail: "robots.txt file found",
    });
    score += 10;

    // Check AI bot rules
    const robotsLower = context.robotsTxt.toLowerCase();
    const aiBots = [
      { name: "GPTBot", pattern: "gptbot" },
      { name: "Google-Extended", pattern: "google-extended" },
      { name: "CCBot", pattern: "ccbot" },
      { name: "anthropic-ai", pattern: "anthropic" },
      { name: "Bytespider", pattern: "bytespider" },
      { name: "ClaudeBot", pattern: "claudebot" },
      { name: "PerplexityBot", pattern: "perplexitybot" },
    ];

    const blockedBots: string[] = [];
    const allowedBots: string[] = [];

    for (const bot of aiBots) {
      if (robotsLower.includes(bot.pattern)) {
        // Check if it's disallowed
        const regex = new RegExp(
          `user-agent:\\s*${bot.pattern}[\\s\\S]*?disallow:\\s*/`,
          "i"
        );
        if (regex.test(context.robotsTxt)) {
          blockedBots.push(bot.name);
        } else {
          allowedBots.push(bot.name);
        }
      }
    }

    // Check for blanket disallow all
    const blanketBlock = /user-agent:\s*\*[\s\S]*?disallow:\s*\//i.test(
      context.robotsTxt
    );

    if (blockedBots.length > 0) {
      findings.push({
        label: "AI Bot Access",
        status: "fail",
        detail: `Blocked: ${blockedBots.join(", ")}`,
      });
      recommendations.push({
        priority: "high",
        title: "Unblock AI Crawlers",
        description: `Your robots.txt blocks ${blockedBots.join(", ")}. If you want to appear in AI-generated answers, allow these bots to crawl your site.`,
      });
    } else if (blanketBlock) {
      findings.push({
        label: "AI Bot Access",
        status: "fail",
        detail: "Blanket disallow for all bots — AI crawlers are blocked",
      });
      recommendations.push({
        priority: "high",
        title: "Allow AI Crawlers in Robots.txt",
        description:
          "Your robots.txt blocks all crawlers. Add specific allow rules for AI bots (GPTBot, Google-Extended, ClaudeBot) if you want AI visibility.",
      });
    } else {
      findings.push({
        label: "AI Bot Access",
        status: "pass",
        detail:
          allowedBots.length > 0
            ? `AI bots allowed: ${allowedBots.join(", ")}`
            : "No AI bots explicitly blocked",
      });
      score += 20;
    }
  } else {
    findings.push({
      label: "Robots.txt",
      status: "warn",
      detail: "No robots.txt found",
    });
    recommendations.push({
      priority: "medium",
      title: "Add Robots.txt",
      description:
        "Create a robots.txt file to control which AI crawlers can access your content. Explicitly allow GPTBot, ClaudeBot, and other AI crawlers.",
    });
  }

  // Sitemap
  if (context.sitemapExists) {
    findings.push({
      label: "XML Sitemap",
      status: "pass",
      detail: "sitemap.xml found",
    });
    score += 15;
  } else {
    findings.push({
      label: "XML Sitemap",
      status: "fail",
      detail: "No sitemap.xml found",
    });
    recommendations.push({
      priority: "high",
      title: "Add XML Sitemap",
      description:
        "An XML sitemap helps AI crawlers discover all your content. Submit it to search engines and reference it in robots.txt.",
    });
  }

  // HTTPS
  if (context.url.startsWith("https://")) {
    findings.push({
      label: "HTTPS",
      status: "pass",
      detail: "Site uses HTTPS — trusted connection",
    });
    score += 15;
  } else {
    findings.push({
      label: "HTTPS",
      status: "fail",
      detail: "Site does not use HTTPS",
    });
    recommendations.push({
      priority: "high",
      title: "Enable HTTPS",
      description:
        "HTTPS is a trust signal for AI models. Sites without HTTPS are less likely to be cited.",
    });
  }

  // Security headers (from response)
  const headers = context.responseHeaders;
  const securityHeaders = [
    "x-content-type-options",
    "x-frame-options",
    "strict-transport-security",
    "content-security-policy",
  ];
  const presentHeaders = securityHeaders.filter((h) => headers[h]);

  if (presentHeaders.length >= 3) {
    findings.push({
      label: "Security Headers",
      status: "pass",
      detail: `${presentHeaders.length}/4 security headers present`,
    });
    score += 10;
  } else if (presentHeaders.length >= 1) {
    findings.push({
      label: "Security Headers",
      status: "warn",
      detail: `Only ${presentHeaders.length}/4 security headers`,
    });
    score += 5;
  } else {
    findings.push({
      label: "Security Headers",
      status: "warn",
      detail: "No security headers detected",
    });
    recommendations.push({
      priority: "low",
      title: "Add Security Headers",
      description:
        "Security headers like HSTS, CSP, and X-Content-Type-Options signal a well-maintained site, increasing AI trust.",
    });
  }

  // Check for noindex
  const noindex =
    $('meta[name="robots"]')
      .attr("content")
      ?.toLowerCase()
      .includes("noindex") || false;
  if (noindex) {
    findings.push({
      label: "Indexing",
      status: "fail",
      detail: "Page has noindex directive — AI crawlers will skip this page",
    });
    recommendations.push({
      priority: "high",
      title: "Remove Noindex Directive",
      description:
        "The noindex meta tag prevents AI crawlers from indexing this page. Remove it if you want AI visibility.",
    });
  } else {
    findings.push({
      label: "Indexing",
      status: "pass",
      detail: "Page is indexable",
    });
    score += 15;
  }

  // Check for AI-specific meta tags
  const aiNoFollow =
    $('meta[name="robots"]')
      .attr("content")
      ?.toLowerCase()
      .includes("noai") ||
    $('meta[name="robots"]')
      .attr("content")
      ?.toLowerCase()
      .includes("noimageai");

  if (aiNoFollow) {
    findings.push({
      label: "AI-Specific Directives",
      status: "warn",
      detail: "Page has AI-restrictive meta directives",
    });
  }

  // Page speed indicators
  const scripts = $("script[src]").length;
  const stylesheets = $('link[rel="stylesheet"]').length;

  if (scripts <= 10 && stylesheets <= 5) {
    findings.push({
      label: "Resource Count",
      status: "pass",
      detail: `${scripts} scripts, ${stylesheets} stylesheets — lightweight`,
    });
    score += 10;
  } else {
    findings.push({
      label: "Resource Count",
      status: "warn",
      detail: `${scripts} scripts, ${stylesheets} stylesheets — may impact crawl speed`,
    });
    score += 5;
  }

  return {
    name: "Technical GEO Signals",
    slug: "technical",
    score: Math.min(score, 100),
    icon: "⚙️",
    description:
      "Technical setup determines whether AI crawlers can access and index your content",
    findings,
    recommendations,
  };
}
