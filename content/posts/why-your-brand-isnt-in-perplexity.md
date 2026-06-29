---
title: "Why your brand isn't showing up in Perplexity"
excerpt: "Perplexity rewards different signals than ChatGPT, which is why so many CPG brands rank well in one and not the other. Here's what's actually different about Perplexity's recommendation logic and what to do about it."
date: 2026-06-20
readTime: 7 min
---

A common pattern we see at Chedder: a brand will score reasonably well on ChatGPT recommendations and then get completely shut out on Perplexity. Or the reverse. The first reflex is to assume one of the engines is broken or biased. Neither is true. The two engines just reward different signals, in ways that are easy to debug once you understand the architecture.

This post is the practical breakdown of what Perplexity does differently, why your brand might be missing, and what specifically to fix.

## Perplexity vs ChatGPT: the core architectural difference

ChatGPT, at the moment of giving you a brand recommendation, is mostly drawing on its training data plus a thin layer of recent web context. Its recommendations skew toward brands it has strong, consistent information about from the full web (Wikipedia, Reddit, news, the full corpus). Long-term reputation matters more than fresh content.

Perplexity does something different. Every Perplexity query triggers a live web search at query time, then an LLM summarizes the results. The summary is biased heavily toward whatever Perplexity's web index surfaces in real time. Fresh content matters more than long-term reputation. Citation density matters more than entity recognition.

Concretely:

- A brand with a Wikipedia entry and 5 years of Reddit history will tend to do well on ChatGPT.
- A brand with a Wirecutter mention published last week and three review sites covering it last month will tend to do well on Perplexity.

Both engines reward similar fundamentals (clean schema, AI crawler access, real third-party citations). But the weighting differs in ways that matter.

## The three reasons brands miss Perplexity specifically

Across hundreds of audits, three patterns explain the majority of "we rank in ChatGPT but not Perplexity" cases.

### Reason 1: your fresh content footprint is thin

Perplexity heavily weights content published in the last 12-18 months. If your most recent press coverage was 2023, you'll get described accurately on ChatGPT but you'll disappear from Perplexity answers about the current state of your category.

Fix: get into the publishing rhythm of your category. Recent reviews, recent comparisons, recent founder interviews. Frequency matters more than prestige here — a steady drip of small mentions outperforms one big article from 18 months ago.

### Reason 2: your content has weak citation links

Perplexity expects to be able to follow citations. If a publisher writes about your brand but doesn't link to your site, Perplexity often can't connect the mention to your brand for the answer.

Fix: when working with editorial coverage, push for the link as a non-negotiable. Even a single nofollow link from a credible publisher dramatically improves whether Perplexity can resolve the brand-to-content connection.

### Reason 3: PerplexityBot is blocked

This is the most common single fix. Perplexity's crawler is a distinct user agent (`PerplexityBot`) and many CPG sites either explicitly block it or implicitly block it via aggressive bot-detection rules at the CDN level (Cloudflare, Akamai, DataDome).

Check your `robots.txt` for an explicit block. Then check whether your bot-protection settings at the CDN are blocking unfamiliar user agents by default. Many CPG sites we've audited have Cloudflare's "Bot Fight Mode" turned on, which blocks PerplexityBot and ClaudeBot indiscriminately while letting GPTBot through.

Fix: explicitly allow PerplexityBot in robots.txt AND add it to your CDN's bot allowlist if you have aggressive bot protection.

## The technical differences that show up in audits

A few smaller patterns that explain marginal cases:

**Perplexity weights structured data even more than ChatGPT.** If your product pages don't have proper Product schema with the `aggregateRating` field, you're penalized more by Perplexity than by ChatGPT.

**Perplexity respects subdomain boundaries more strictly.** If your blog lives at `blog.brandsite.com` and your product pages at `www.brandsite.com`, Perplexity sometimes treats these as different entities. ChatGPT's training data is more forgiving about this.

**Perplexity quotes more directly from source pages.** This means your owned pages need to be quotable. Clear, declarative sentences about your brand and category outperform marketing-speak. "We make merino wool runners using 90% recycled materials" is better than "Our shoes are crafted with intention from nature's finest renewable resources."

**Perplexity surfaces recency in source freshness.** A press release from 2024 gets less weight than the same information republished as a 2026 founder interview. The content doesn't need to be new — the source date does.

## The simple Perplexity-specific tactics

If you're optimizing for Perplexity specifically (which you should be, given the platform now has 80M+ monthly active users skewed toward research-and-shopping behavior):

1. **Republish your "about us" key facts at regular intervals.** Not the same page — write a fresh "year in review" post once per year that restates your brand's category position, mission, and key metrics. Gives Perplexity fresh-dated content to cite.

2. **Get on the small comparison sites.** Sites like ProductReview.com.au, Trustpilot's category roundups, and niche category review blogs are over-weighted in Perplexity's results because they update frequently. Get listed.

3. **Push for "best of [year]" listicle inclusions.** Wirecutter, NYT Wirecutter, Engadget, and category-specific publications all run "best mattresses 2026" style posts annually. Getting included once a year keeps you in Perplexity's freshness window indefinitely.

4. **Make sure your most recent press coverage is indexable.** A press mention in a publisher's print magazine doesn't help. A press mention on their website does. Confirm every mention you earn is actually online.

5. **Track Perplexity citations as a distinct metric from ChatGPT.** A monthly Chedder audit reports both, and you'll likely see them move differently. Treat them as two channels.

## How to debug your own Perplexity gap

The fastest way to figure out why Perplexity isn't naming you: 

1. Open Perplexity and search for "[your category] recommendations" 
2. Look at the citations Perplexity lists at the bottom of its answer
3. Check whether your brand is mentioned in any of those source pages
4. If you're not mentioned, that's a content gap (you need to get into those sources)
5. If you ARE mentioned but Perplexity didn't surface you, it's likely a crawler-access or freshness issue

[Run a free audit at Chedder](/) and we'll do all of this automatically. The audit explicitly reports Perplexity citations as a separate metric from ChatGPT, so you can see exactly where the gap is and what to do about it.

The brands winning Perplexity in 2026 aren't winning by accident. They've figured out that Perplexity is fundamentally a search engine wrapped in an LLM, and they're feeding it the inputs a search engine needs: fresh content, linked citations, accessible crawlers, structured data. Once you frame it that way, the work is concrete.
