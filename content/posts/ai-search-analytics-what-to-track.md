---
title: "AI search analytics: the 7 metrics CPG brands should actually track"
excerpt: "Most brands either track too much or track the wrong things. Here are the 7 metrics that matter for measuring AI search visibility, with how to pull each one and what a healthy trajectory looks like."
date: 2026-06-14
readTime: 7 min
---

The hardest part of building an AI search measurement program isn't the absence of tools (those are improving). It's avoiding metric overload. The temptation is to track everything that can be tracked, which produces a 40-row dashboard nobody looks at.

This is the short list of metrics that actually matter for a CPG brand's AI search visibility program, with how to pull each, what good looks like, and what's worth ignoring.

## The seven metrics that matter

In rough order of importance:

### 1. AI citation rate (your brand named in AI answers, by platform)

The single most important metric. For each major AI platform (ChatGPT, Perplexity, Brave, Google AI Overviews), what percentage of relevant category prompts result in your brand being named?

**How to pull:** Run a fixed set of 10-20 category prompts each month across each platform. Count how often your brand appears in the answer. Track as a percentage per platform.

**What good looks like:** the baseline varies by category. A leading mattress brand might be cited in 40-60% of category prompts. A challenger brand might be in 10-15%. The metric to watch is trajectory — is your citation rate going up or down quarter-over-quarter?

**Why it matters:** this is the closest thing to direct measurement of AI search visibility. Everything else is proxy.

### 2. AI referral traffic to your site

Sessions on your site that came from an AI platform.

**How to pull:** Google Analytics 4. Set up segment filters for referrers including `perplexity.ai`, `chat.openai.com`, `you.com`, `phind.com`, `vertexaisearch.cloud.google.com`. Note: ChatGPT direct referrals are limited because OpenAI obscures referrer data; most ChatGPT-driven traffic shows as direct.

**What good looks like:** for a brand with active GEO work, 1-5% of total traffic from AI platforms is achievable in year 1, growing to 5-15% by year 2.

**Why it matters:** unlike citations (impression-equivalent), this is actual visitors. The conversion rate of AI referral traffic tends to be higher than organic search because of higher intent.

### 3. Branded search volume

How often people search your brand name directly on Google.

**How to pull:** Google Search Console, filter to branded queries (anything containing your brand name or domain).

**What good looks like:** branded search should grow faster than your other marketing channels. A sustained 15-30% YoY lift in branded volume that doesn't match your marketing spend pattern is often AI search recommendation kicking in.

**Why it matters:** when shoppers learn about you from AI, many follow up with a brand-name Google search. Branded volume is the indirect-but-reliable signal that AI search is delivering.

### 4. AI crawler activity to your site

Server-log visits from AI crawler user agents.

**How to pull:** raw server logs or CDN analytics. Filter for `GPTBot`, `ClaudeBot`, `PerplexityBot`, `Google-Extended`, `Applebot-Extended`, `OAI-SearchBot`, `Perplexity-User`, `Claude-User`, `CCBot`.

**What good looks like:** rising crawler activity is good. Visits from "live retrieval" bots (`OAI-SearchBot`, `Perplexity-User`, `Claude-User`) often correlate with real user queries about your brand happening at that moment.

**Why it matters:** this is your earliest indicator. AI crawlers visit your site before AI engines start citing you. A growing crawler footprint is a leading indicator of future citation lift.

### 5. Citation diversity (number of distinct sources mentioning your brand)

How many independent web sources mention your brand in a category-relevant context.

**How to pull:** a mix of Google searches for `"yourbrand" -site:yourdomain.com`, mention-tracking tools (Mention.com, Brand24), and audit tools like Chedder that explicitly count and categorize external citations.

**What good looks like:** more diverse is better. A brand with 10 citation sources across 8 different domains beats a brand with 50 citations all from one PR distribution wire.

**Why it matters:** AI engines weight citation diversity. Lots of mentions from one source is treated as marginal additional evidence. Mentions from many independent sources is treated as multiplicative evidence.

### 6. Comparison frequency (how often you appear in head-to-head AI answers)

When shoppers ask AI "X vs Y" type questions, how often does your brand appear as one of the compared options?

**How to pull:** run "X vs Y vs Z" prompts in your category across AI platforms. Note when your brand appears in the comparison set.

**What good looks like:** being in the comparison set is itself a signal of category authority. A brand that AI engines compare to leading competitors (even if your brand "loses" the comparison) is in better shape than a brand that doesn't get compared at all.

**Why it matters:** comparison prompts are extremely high-intent. Shoppers running them are close to purchase. Being in the comparison set is half the battle.

### 7. Audit score (a composite or rank from a third-party tool)

A unified score that combines multiple signals into a single number you can track over time.

**How to pull:** [Chedder](/) produces this as a composite score across schema, content, external signals, crawler access, and AI citations. Other tools do similar.

**What good looks like:** absolute scores matter less than trajectory. A brand going from 45 to 55 to 65 over three quarters is winning, even if 65 isn't "great" yet.

**Why it matters:** the composite score is your single rollup metric for executive reporting. Everything else is a leading or lagging indicator that contributes to this.

## What NOT to track

Three metrics that look useful but waste time:

**AI engine "rank position"** — AI answers don't have stable positions. The same prompt run twice can produce different orderings. Tracking position as a metric leads to false signals.

**AI engine "impressions"** — none of the platforms publish reliable impression data. Third-party estimates are extrapolations from sampled prompts with huge margins of error.

**Overall AI engine market share** — interesting industry data, not actionable for your brand. You can't move it. Focus on your own citation rate.

## Building the dashboard

Realistic monthly cadence for a CPG marketing team:

**Week 1:** Run the monthly Chedder audit. Snapshot scores per platform.

**Week 2:** Pull AI referral traffic and branded search lift from analytics.

**Week 3:** Manual prompt sampling — run 5 prompts in each platform, note mentions.

**Week 4:** Roll up into a one-page dashboard with month-over-month trajectories.

The dashboard should fit on a single screen. Seven metrics, one row each, three columns: current month, 3-month trend arrow, 12-month trend arrow. That's the whole dashboard.

If you don't have time for monthly cadence, do this quarterly. Better quarterly tracking than no tracking.

## The honest expectation

Most CPG marketing teams haven't measured AI search visibility before. The first month's dashboard will look surprising. Some platforms will be better than expected, some worse. The instinct will be to celebrate or panic. Resist both.

Three consecutive months of improvement is a real win. Three consecutive months of decline is a real warning. Single-month spikes (good or bad) are noise.

The brands serious about AI search in 2026 will have 12-24 months of trajectory data by the time it becomes essential for CPG marketing. The ones that don't measure will be guessing in 2027 when AI traffic is mainstream.

[Run a free audit at Chedder](/) to set your baseline. The output is structured exactly for this kind of monthly tracking and includes the composite score, citation rates per platform, and a breakdown of what's contributing to each.

Start measuring now. The trajectory matters more than today's number.
