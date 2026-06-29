---
title: "Should you block GPTBot? The honest answer for CPG brands"
excerpt: "In 2023, half the internet rushed to block GPTBot. In 2026, most of them quietly unblocked it. Here's the honest cost-benefit analysis for consumer brands, and the one nuance most posts miss."
date: 2026-06-23
readTime: 6 min
---

Late 2023 was a strange time on the open web. OpenAI had just published the GPTBot user agent. Twitter (still Twitter at the time) lit up with "we should block this" energy. The New York Times sued. Major publishers shut their doors. A wave of ad-tech consultants told every CPG brand they advised to add `User-agent: GPTBot` `Disallow: /` to robots.txt as a "protective" measure.

Three years later, almost all of those same publishers and brands have quietly unblocked.

Here's why, and the honest answer to the question we still get every week at Chedder.

## The 2023 case for blocking, and why it doesn't hold up anymore

The original argument was a defensible one: "OpenAI is using our content to train a competitor to our traffic without paying us." If you ran a publisher whose business model was Google referral traffic, the threat felt existential. Block GPTBot, the logic went, and you starve the model.

What actually happened:

1. **GPTBot blocks don't block ChatGPT recommendations.** Blocking the crawler stops your content from being used in *future* training runs. It doesn't remove what's already been ingested, and it doesn't stop ChatGPT from naming your brand based on context the model already has.

2. **Blocking made you invisible while competitors stayed indexed.** ChatGPT now had your brand info from old training data only, while your competitors had fresh, ongoing content updates feeding into the next model. You aged out of the conversation.

3. **AI search engines (Perplexity, Brave, Google's AI Overviews) became real shopper traffic sources.** These engines treat your robots.txt the same way Googlebot does. Block the crawler, lose the citation. Lose the citation, lose the click.

4. **Publishers who held out (NYT, Reuters) cut licensing deals.** They negotiated, didn't disappear. Brands that mimicked publishers without the negotiating leverage just disappeared.

## What blocking actually costs a CPG brand in 2026

We've audited brands with and without GPTBot blocks. The pattern is consistent.

A brand that's been blocking GPTBot for 18+ months gets named in AI answers at roughly half the rate of a comparable brand that's been crawler-friendly. That's a ~50% reduction in AI-driven brand recommendations across a category that's grown to ~25% of consumer product discovery.

The math is simple: if your category sees roughly 100,000 AI prompts a month and your unblocked competitor gets named in 8% of them, you're losing roughly 4,000 brand impressions per month relative to staying unblocked. Multiply by the customer LTV in your category and the cost adds up fast.

## The one nuance most posts miss

There IS one legitimate case for blocking, and it's not about training. It's about RAG (retrieval-augmented generation).

ChatGPT and Perplexity now perform live retrieval — they fetch fresh content from the web when answering a query, not just from training data. The user agents involved are sometimes different from the training crawler. For OpenAI, the live retrieval bot is `OAI-SearchBot`. Blocking `GPTBot` doesn't block live retrieval. To stop your content from being included in live AI answers, you'd need to block BOTH.

For most CPG brands, this distinction strengthens the case for unblocking everything. Live retrieval IS the channel that turns into shopper recommendations. Training contributes background knowledge; retrieval contributes the active answer. Block retrieval, lose the recommendation entirely. Block training, lose future improvements.

## The recommended robots.txt for CPG brands in 2026

Unless you're running a paid content business with a licensing deal in negotiation, the answer is simple. Welcome everyone:

```
User-agent: *
Allow: /

User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-User
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Perplexity-User
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: CCBot
Allow: /

Sitemap: https://yourdomain.com/sitemap.xml
```

The verbose `Allow: /` for each agent is technically redundant when the wildcard at the top already permits everything, but it makes intent unambiguous when other tools inspect the file. Some AI engines treat the explicit allow as a stronger positive signal.

## Edge cases

- **You're a subscription/paywalled business**: blocking makes some sense, but understand you're trading AI visibility for content protection. If your AI-discoverability matters more than syndication of full articles, leave a public preview unblocked.
- **You're worried about scraping abuse**: AI crawlers aren't your scraping problem. Adversarial scrapers don't respect robots.txt anyway. Block crawlers selectively if you have a real scraping incident, but don't block AI crawlers for general scraping fear.
- **You have legal/IP concerns**: talk to counsel. Robots.txt isn't a substitute for a real licensing posture.

## What to do this week

1. Read your current `yourdomain.com/robots.txt` 
2. Look for any `Disallow` line under `GPTBot`, `OAI-SearchBot`, `ClaudeBot`, `PerplexityBot`, `Google-Extended`, or `CCBot`
3. If you find any, remove them and add explicit `Allow: /` lines for each
4. Re-run your AI visibility audit in 6-8 weeks. The crawler change won't show effects immediately because models update on intervals, but the trajectory should improve

If you want to know which AI crawlers your site is currently blocking and what it's costing you, [run a free audit at Chedder](/). The crawler module reports exactly what's open and what's closed, plus the recommended robots.txt for your specific setup.

The decision should be obvious: in 2026, blocking AI crawlers is paying to be invisible in the channel that's growing fastest. Don't pay that bill.
