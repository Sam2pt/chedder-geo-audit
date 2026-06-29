---
title: "The complete robots.txt for AI crawlers (with the 12 user agents that matter)"
excerpt: "Most CPG robots.txt files were written before AI engines mattered. Here's the current-state correct robots.txt for any consumer brand site, with all the crawlers that actually drive shopper traffic in 2026."
date: 2026-06-19
readTime: 6 min
---

Your `robots.txt` is the most overlooked five lines on your website. Most CPG sites have a robots.txt that was written by their original site builder in 2021 and hasn't been touched since. In 2026, that file is probably costing you measurable AI-driven traffic.

This post is the practical reference: which AI crawlers to allow, which to think about, what to actually put in your file, and the common mistakes.

## The 12 AI crawler user agents that matter for CPG brands

Sorted by impact on shopper-facing AI traffic, highest first:

| User agent | Owner | Purpose | Allow? |
|---|---|---|---|
| `GPTBot` | OpenAI | Training corpus for GPT models | **Yes** |
| `OAI-SearchBot` | OpenAI | Live retrieval for ChatGPT search | **Yes** |
| `ChatGPT-User` | OpenAI | When a ChatGPT user clicks a link via tool use | **Yes** |
| `Google-Extended` | Google | Training corpus for Gemini and Search Generative Experience | **Yes** |
| `PerplexityBot` | Perplexity | Indexing for Perplexity AI search | **Yes** |
| `Perplexity-User` | Perplexity | Live retrieval triggered by user query | **Yes** |
| `ClaudeBot` | Anthropic | Training corpus for Claude models | **Yes** |
| `Claude-User` | Anthropic | Live retrieval for Claude with web search | **Yes** |
| `CCBot` | Common Crawl | Public dataset used by many smaller models | **Yes** |
| `Bingbot` | Microsoft | Bing index (feeds Copilot answers) | **Yes** |
| `Applebot-Extended` | Apple | Training corpus for Apple Intelligence | **Yes** |
| `DuckAssistBot` | DuckDuckGo | DuckDuckGo's AI summarization | **Yes** |

For 99% of CPG brands, the answer to "allow?" is yes for all twelve. The exceptions are paid content businesses with active licensing deals, which is not most CPG brands.

## The complete robots.txt

This is the file we recommend dropping in:

```
# Allow all standard search crawlers
User-agent: *
Allow: /

# Explicit AI training crawlers
User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: CCBot
Allow: /

# Live retrieval / answer engines
User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Perplexity-User
Allow: /

User-agent: Claude-User
Allow: /

User-agent: DuckAssistBot
Allow: /

# Sitemap
Sitemap: https://yourdomain.com/sitemap.xml
```

That's it. Replace `yourdomain.com` with your actual domain. Save the file as `robots.txt` in your site's root.

## What to disallow (selectively)

You probably DO want to disallow some paths from all crawlers:

```
User-agent: *
Disallow: /api/
Disallow: /admin/
Disallow: /account/
Disallow: /cart/
Disallow: /checkout/
Disallow: /search?
```

This keeps crawlers out of paths that aren't useful to index (your internal API, the admin panel, user-specific URLs). It applies to AI crawlers too because the `User-agent: *` wildcard catches all of them.

The full combined file:

```
User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin/
Disallow: /account/
Disallow: /cart/
Disallow: /checkout/
Disallow: /search?

# Explicit allows for AI crawlers (redundant with wildcard, but unambiguous)
User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: CCBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: Perplexity-User
Allow: /

User-agent: Claude-User
Allow: /

User-agent: DuckAssistBot
Allow: /

Sitemap: https://yourdomain.com/sitemap.xml
```

## The common mistakes

A few patterns we see repeatedly:

**Mistake 1: blocking AI crawlers as a "safety" measure.** This is the 2023 advice that aged badly. Costs you real shopper traffic with no upside.

**Mistake 2: relying on robots.txt to block scraping.** Robots.txt is a politeness convention, not a security measure. Adversarial scrapers ignore it entirely. If you have a scraping problem, address it with rate limiting and bot detection at the CDN level, not robots.txt.

**Mistake 3: blocking GPTBot but not OAI-SearchBot.** GPTBot affects future training. OAI-SearchBot affects live answers right now. The retrieval bot is the one that matters most for shopper traffic; blocking it while allowing the trainer is the worst of both worlds.

**Mistake 4: not updating robots.txt for years.** New crawler user agents appear every quarter. Without a process to update, your robots.txt drifts further out of date over time, and the AI crawlers you implicitly didn't allow (because they didn't exist when you wrote the file) get blocked by your CDN's "unknown bot" rules.

**Mistake 5: blocking AI crawlers at the CDN level.** Cloudflare's "Bot Fight Mode" and similar features block many AI crawlers by default. Robots.txt says "yes" but the CDN says "no" and the AI crawler never reaches your site. Audit your CDN settings, not just your robots.txt.

## How to validate

Three quick checks:

1. **Pull your robots.txt directly:** open `https://yourdomain.com/robots.txt` in a browser and confirm it matches what you intended.

2. **Test crawler access:** Google Search Console has a robots.txt tester. So does Bing Webmaster Tools. Both will show you whether a specific user agent can access a specific URL.

3. **Run a full audit:** at [Chedder](/) we explicitly test each of the 12 AI crawlers above against your site and report which ones are getting blocked by either robots.txt OR your CDN. The full audit takes under a minute.

## What changes from here

Robots.txt is a one-time fix that compounds for years. The next time a new AI engine launches and starts naming brands in answers, the brands that already had a permissive robots.txt will be on the list. The ones that didn't will spend the next 12 months wondering why they're not.

Five lines. Maximum five minutes to write. Decade of compounding upside. This is the easiest GEO win on your list.
