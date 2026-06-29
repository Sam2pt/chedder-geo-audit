---
title: "How to track brand mentions in AI answers (without losing your mind)"
excerpt: "There's no Google Search Console for AI answers. Here's the honest landscape of tools, manual methods, and what actually works for tracking how your brand shows up in ChatGPT, Perplexity, and friends."
date: 2026-06-17
readTime: 7 min
---

If you're a brand marketer trying to measure AI search visibility, you've discovered the elephant in the room: there's no equivalent of Google Search Console for AI engines. ChatGPT doesn't tell you when your brand was mentioned. Perplexity doesn't expose impression data. Google AI Overviews has limited reporting and only for some queries.

This is the practical landscape of what's available, what works, and how to build a reliable measurement program despite the gaps.

## The fundamental measurement problem

Traditional SEO measurement works because Google publishes Search Console data: impressions, clicks, queries, page positions. You know roughly what shoppers are searching and how often they see your site.

AI engines don't expose any of this. When ChatGPT recommends your brand in an answer to a shopper, you don't know it happened. You don't know how many shoppers asked the prompt. You don't know whether you were named or skipped. The only signal that reliably reaches you is downstream attribution — a referral click from Perplexity, or someone typing your brand name into Google after seeing it in ChatGPT.

Closing this measurement gap requires synthesizing from multiple imperfect sources rather than reading one canonical report.

## What you can actually measure (and how)

Five measurement approaches, ranked by reliability:

### 1. Direct prompt sampling (manual or via tools)

The most reliable signal: run the actual prompts shoppers are asking in your category and observe what each AI engine says.

Manual: pick 10-20 prompts your customers would ask, run them through ChatGPT, Perplexity, Brave, and Google AI Overviews. Note which brands appear, where you fall in the list, and what's said about you. Do this monthly.

Tooled: this is what Chedder does automatically. We curate category-specific prompts, run them against multiple AI engines, parse brand mentions, and report your rank versus competitors. The audit takes under a minute and gives you a baseline you can re-run on a cadence.

This is the only method that gives you direct, repeatable measurement of "did our brand get named." Everything else is proxy data.

### 2. Referral traffic from AI platforms

Perplexity, Google AI Overviews, and (occasionally) Brave Search pass referrer information when users click through citations. Set up specific filters in your analytics:

- `perplexity.ai` referrer (and `r.search.brave.com`)
- Look for `vertexaisearch.cloud.google.com` and other Google AI subdomains
- Direct traffic spikes correlated with AI launch events

A reasonable monthly view: total referral sessions from AI platforms, segmented by landing page. You won't capture everything (ChatGPT doesn't pass referrer), but you'll get a directional signal.

### 3. Brand name search volume changes

This is the indirect-but-reliable signal that something is happening in AI engines: shoppers who learn about your brand from ChatGPT often follow up by Googling your name directly.

Track in Google Search Console:

- Branded query volume (people searching "yourbrand" or "yourbrand.com")
- Compare month-over-month, year-over-year
- Look for unusual spikes that don't correlate with marketing campaigns

A sustained 15-30% lift in branded search volume with no marketing change explaining it is often AI search recommendation kicking in.

### 4. Server log analysis for AI crawler activity

Less direct but useful: look at your server logs for visits from AI crawler user agents.

A surge in `OAI-SearchBot`, `Perplexity-User`, or `Claude-User` traffic to a specific URL often indicates that a real user query was being answered by referencing that page. Spikes here are an early indicator of AI engine retrieval activity related to your brand.

You need a tool that processes raw server logs to see this clearly (Cloudflare Analytics, Datadog, custom Splunk dashboards). Some bot detection products will surface this if you ask.

### 5. Customer-conducted research

If you have customer service or sales conversations, start asking new customers a single question: "How did you first hear about us?"

Look specifically for answers that mention "ChatGPT recommended you," "I asked AI for [category] and your name came up," etc. The frequency of these answers, even informally, is a real-world signal.

We've seen brands go from 0% to 12% of new customers citing AI search as their discovery channel within 18 months of starting a focused GEO program. That number is becoming a reasonable line in your brand health dashboard.

## What NOT to bother measuring

A few things people try to measure that aren't worth the time:

**"Impressions" in any AI engine.** None of them publish reliable impression data. Estimates from third-party tools are extrapolations from sampled prompts, and the margin of error is huge.

**"Position" in an AI answer.** AI answers don't have stable positions. The same prompt run twice can produce different orderings of brand names. Tracking position as a metric leads to false signals.

**"Citation rate" without context.** A brand cited in 1 of 10 prompts might be doing better than a brand cited in 5 of 10, if the first brand operates in a competitive 200-brand category and the second in a 5-brand niche. Always benchmark against your competitive set.

## Building a monthly AI search measurement dashboard

The realistic monthly rhythm we recommend:

1. **Re-run your Chedder audit on the first of each month.** Snapshot the report.
2. **Pull AI referral traffic from Google Analytics.** Sessions, landing pages, time-on-site.
3. **Pull branded search volume from Google Search Console.** Compare to baseline.
4. **Sample 3 prompts manually in each major AI engine.** Eyeball whether your brand mention rate is moving.
5. **Note any customer-conversation feedback about AI discovery.**

Roll this up into a one-page dashboard. The trend matters more than any single month's number. Three consecutive months of improvement is a win even if the absolute numbers are still small.

## The honest expectation setting

Most CPG marketing teams have not measured AI search visibility before. The first audit is going to look surprising — usually worse than expected on some platforms, better on others. The instinct will be to either celebrate the wins or panic about the gaps.

Resist both. The baseline is a baseline. What matters is whether the trajectory is improving month over month.

A reasonable expectation: a serious GEO program shows measurable improvement (more brand mentions, more AI referral traffic, more branded search lift) within 3-6 months. Programs that don't see improvement in that window usually have a single fixable issue (blocked crawlers, missing schema, no Wikipedia presence) that the audit will surface.

If you want a starting point for measurement, [run a free audit at Chedder](/). The output is a structured baseline you can re-run monthly to track exactly what's moving.

The brands measuring this seriously in 2026 will have 18 months of trajectory data by the time it becomes table stakes for CPG marketing. The ones that don't will be guessing.
