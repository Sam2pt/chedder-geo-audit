import type { CheerioAPI } from "cheerio";
import { Finding, ModuleResult, Recommendation } from "../types";

export function analyzeAuthority($: CheerioAPI, url: string): ModuleResult {
  const findings: Finding[] = [];
  const recommendations: Recommendation[] = [];
  let score = 0;

  // Social media links
  const socialPlatforms = [
    { name: "Twitter/X", patterns: ["twitter.com", "x.com"] },
    { name: "LinkedIn", patterns: ["linkedin.com"] },
    { name: "Facebook", patterns: ["facebook.com", "fb.com"] },
    { name: "Instagram", patterns: ["instagram.com"] },
    { name: "YouTube", patterns: ["youtube.com", "youtu.be"] },
    { name: "GitHub", patterns: ["github.com"] },
    { name: "TikTok", patterns: ["tiktok.com"] },
  ];

  const foundSocials: string[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    for (const platform of socialPlatforms) {
      if (
        platform.patterns.some((p) => href.includes(p)) &&
        !foundSocials.includes(platform.name)
      ) {
        foundSocials.push(platform.name);
      }
    }
  });

  if (foundSocials.length >= 3) {
    findings.push({
      label: "Social Media Presence",
      status: "pass",
      detail: `Links to: ${foundSocials.join(", ")}`,
    });
    score += 20;
  } else if (foundSocials.length >= 1) {
    findings.push({
      label: "Social Media Presence",
      status: "warn",
      detail: `Only links to: ${foundSocials.join(", ")}`,
    });
    score += 10;
    recommendations.push({
      priority: "medium",
      title: "Expand Social Media Links",
      description:
        "Link to more social profiles (Twitter, LinkedIn, YouTube). AI models use social presence as an authority signal.",
    });
  } else {
    findings.push({
      label: "Social Media Presence",
      status: "fail",
      detail: "No social media links found",
    });
    recommendations.push({
      priority: "high",
      title: "Add Social Media Links",
      description:
        "Add links to your brand's social media profiles. AI models cross-reference social presence to verify brand authority.",
      snippetTarget: "Add to footer + Organization schema",
      language: "html",
      fixSnippet: `<footer>
  <ul class="socials">
    <li><a href="https://twitter.com/yourbrand" rel="me">Twitter / X</a></li>
    <li><a href="https://www.linkedin.com/company/yourbrand" rel="me">LinkedIn</a></li>
    <li><a href="https://github.com/yourbrand" rel="me">GitHub</a></li>
    <li><a href="https://www.youtube.com/@yourbrand" rel="me">YouTube</a></li>
  </ul>
</footer>

<!-- Also add a "sameAs" array to your Organization JSON-LD: -->
<!--   "sameAs": ["https://twitter.com/yourbrand", ...] -->`,
    });
  }

  // Contact information
  const bodyText = $("body").text().toLowerCase();
  const hasEmail =
    bodyText.includes("@") &&
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(bodyText);
  const hasPhone = /(\+\d{1,3}[\s.-])?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/.test(bodyText);
  const hasAddress =
    bodyText.includes("address") ||
    bodyText.includes("street") ||
    bodyText.includes("suite") ||
    bodyText.includes("floor");

  const contactSignals = [hasEmail, hasPhone, hasAddress].filter(
    Boolean
  ).length;

  if (contactSignals >= 2) {
    findings.push({
      label: "Contact Information",
      status: "pass",
      detail: `Found: ${[hasEmail && "email", hasPhone && "phone", hasAddress && "address"].filter(Boolean).join(", ")}`,
    });
    score += 15;
  } else if (contactSignals === 1) {
    findings.push({
      label: "Contact Information",
      status: "warn",
      detail: "Limited contact information visible",
    });
    score += 8;
    recommendations.push({
      priority: "medium",
      title: "Add More Contact Details",
      description:
        "Display email, phone, and physical address. Contact information builds trust signals for AI models.",
    });
  } else {
    findings.push({
      label: "Contact Information",
      status: "fail",
      detail: "No visible contact information",
    });
    recommendations.push({
      priority: "high",
      title: "Add Contact Information",
      description:
        "Visible contact details are a strong trust signal. Add email, phone, and business address to your page.",
      snippetTarget: "Add to footer or /contact page",
      language: "html",
      fixSnippet: `<address>
  <strong>Your Company</strong><br />
  123 Main Street, Suite 400<br />
  San Francisco, CA 94102<br />
  <a href="mailto:hello@yourdomain.com">hello@yourdomain.com</a><br />
  <a href="tel:+14155551234">+1 (415) 555-1234</a>
</address>`,
    });
  }

  // About / Team / Company pages
  const navLinks: string[] = [];
  $("nav a, header a, footer a").each((_, el) => {
    navLinks.push(($(el).text().toLowerCase().trim()));
  });

  const hasAbout = navLinks.some(
    (l) => l.includes("about") || l.includes("company") || l.includes("team")
  );
  const hasPrivacy = navLinks.some(
    (l) => l.includes("privacy") || l.includes("legal")
  );
  const hasTerms = navLinks.some(
    (l) => l.includes("terms") || l.includes("conditions")
  );

  if (hasAbout) {
    findings.push({
      label: "About / Company Page",
      status: "pass",
      detail: "About/Company page linked",
    });
    score += 15;
  } else {
    findings.push({
      label: "About / Company Page",
      status: "warn",
      detail: "No About or Company page detected in navigation",
    });
    recommendations.push({
      priority: "medium",
      title: "Create an About Page",
      description:
        "An About page establishes E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness), key factors AI models use to evaluate sources.",
      snippetTarget: "Outline for /about",
      language: "markdown",
      fixSnippet: `# About [Your Brand]

## What we do
One clear paragraph AI can quote directly.

## Why we started
Founding story in 2-3 sentences. Specific year, specific problem.

## Who we serve
Describe your ideal customer in their language.

## The team
- **Jane Doe**, CEO. 10 years in X, previously at Y.
- **John Smith**, CTO. Built Z at $BIGCO.

## Trust signals
- Founded in 2020
- SOC 2 Type II certified
- Backed by [notable investors]
- Featured in [TechCrunch, Forbes, etc.]`,
    });
  }

  // Legal pages (trust signals)
  const legalCount = [hasPrivacy, hasTerms].filter(Boolean).length;
  if (legalCount === 2) {
    findings.push({
      label: "Legal Pages",
      status: "pass",
      detail: "Privacy policy and terms linked",
    });
    score += 10;
  } else if (legalCount === 1) {
    findings.push({
      label: "Legal Pages",
      status: "warn",
      detail: "Partial legal page coverage",
    });
    score += 5;
  } else {
    findings.push({
      label: "Legal Pages",
      status: "warn",
      detail: "No legal pages detected",
    });
    recommendations.push({
      priority: "low",
      title: "Add Privacy Policy & Terms",
      description:
        "Legal pages signal a legitimate, trustworthy business. AI models factor this into source credibility.",
    });
  }

  // Author / Authorship signals
  const hasAuthor =
    $('meta[name="author"]').attr("content") ||
    $('[rel="author"]').length > 0 ||
    $("[class*='author']").length > 0 ||
    $("[itemprop='author']").length > 0;

  if (hasAuthor) {
    findings.push({
      label: "Authorship Signal",
      status: "pass",
      detail: "Author attribution found",
    });
    score += 15;
  } else {
    findings.push({
      label: "Authorship Signal",
      status: "warn",
      detail: "No author attribution detected",
    });
    recommendations.push({
      priority: "medium",
      title: "Add Author Attribution",
      description:
        "Author information strengthens E-E-A-T signals. Add author meta tags, bylines, and author bios to your content.",
      snippetTarget: "Add to article pages",
      language: "html",
      fixSnippet: `<meta name="author" content="Jane Doe" />

<article>
  <header>
    <h1>Article Title</h1>
    <p class="byline">
      By <a rel="author" href="/authors/jane-doe">Jane Doe</a>
      · Published <time datetime="2026-04-16">April 16, 2026</time>
    </p>
  </header>
  <!-- article body -->
</article>

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Article Title",
  "author": {
    "@type": "Person",
    "name": "Jane Doe",
    "url": "https://yourdomain.com/authors/jane-doe"
  },
  "datePublished": "2026-04-16"
}
</script>`,
    });
  }

  // Brand name consistency
  const domain = new URL(url).hostname.replace("www.", "");
  const brandName = domain.split(".")[0];
  const titleText = $("title").text().toLowerCase();
  const brandInTitle = titleText.includes(brandName.toLowerCase());

  if (brandInTitle) {
    findings.push({
      label: "Brand Consistency",
      status: "pass",
      detail: "Brand name appears in page title",
    });
    score += 10;
  } else {
    findings.push({
      label: "Brand Consistency",
      status: "warn",
      detail: "Brand name not found in page title",
    });
    recommendations.push({
      priority: "low",
      title: "Include Brand Name in Title",
      description:
        "Include your brand name in the page title for consistent brand recognition by AI models.",
    });
  }

  // Copyright / year
  const currentYear = new Date().getFullYear().toString();
  const hasCopyright =
    bodyText.includes(`© ${currentYear}`) ||
    bodyText.includes(`copyright ${currentYear}`) ||
    bodyText.includes(`©${currentYear}`);

  if (hasCopyright) {
    findings.push({
      label: "Current Copyright",
      status: "pass",
      detail: `© ${currentYear} found, site appears maintained`,
    });
    score += 5;
  }

  return {
    name: "Why you're worth trusting",
    slug: "authority",
    score: Math.min(score, 100),
    icon: "🛡️",
    description:
      "The little signals that tell AI you're a real business: social links, contact info, about page, legal pages.",
    findings,
    recommendations,
  };
}
