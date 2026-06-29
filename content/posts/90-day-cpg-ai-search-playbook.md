---
title: "From zero to AI-cited: the 90-day CPG brand playbook"
excerpt: "If you're starting from zero AI search visibility today, here's the week-by-week playbook for the first 90 days. Realistic effort, sequenced for compounding wins, with measurable milestones."
date: 2026-06-12
readTime: 9 min
---

A common question after a Chedder audit returns a low score: "okay, what do we actually do, in what order, starting Monday?"

This is that answer. The 90-day playbook for a CPG brand starting from zero AI search visibility. Realistic effort levels, sequenced for compounding wins, with measurable milestones at the end of each phase.

This assumes you have access to a developer (or developer hours), one marketing person to drive content, and a budget of zero-to-modest for outside services. It works for brands with annual revenue from $1M to $500M.

## Week 1: baseline and triage

Goal: know where you stand and unblock the easy wins.

**Day 1**: Run your audit. [Free at Chedder](/), or any equivalent tool. Snapshot the report. You now have a baseline.

**Day 2-3**: Read your `robots.txt`. Fix any AI crawler blocks. The complete recommended robots.txt is in [our crawler post](/blog/robots-txt-for-ai-crawlers). This is a one-line change that compounds for years.

**Day 4-5**: Check your CDN settings (Cloudflare, Akamai, DataDome). Many CPG sites have aggressive bot protection that blocks AI crawlers even when robots.txt allows them. Add the AI crawler user agents to your allowlist.

**Milestone**: by end of week 1, all major AI crawlers can access your site.

## Week 2-3: technical SEO foundation

Goal: ship the structured data baseline.

**Day 6-10**: Add Organization schema to your homepage. The template is in [our schema post](/blog/schema-markup-for-dtc-brands-2026). This is a 30-minute job for a developer.

**Day 11-15**: Add Product schema to your top 20 product pages. Include name, image, price, brand, availability, aggregateRating if you have it. Most Shopify themes have this partially in place; you may just need to enrich existing tags rather than build from scratch.

**Day 16-21**: Add FAQ schema to your top 5 education/help pages. If you don't have FAQ-style content, this is also the right week to create one or two FAQ pages targeting category-relevant questions.

**Milestone**: by end of week 3, your top 25 commercial pages have proper structured data. Validate with [Google's Rich Results Test](https://search.google.com/test/rich-results).

## Week 4-5: high-value content rewrites

Goal: make your most-trafficked pages quotable by AI engines.

**Day 22-28**: Identify your top 10 trafficked product pages. Rewrite each one using the template from [our product description post](/blog/product-descriptions-ai-engines-love). Specifically: lead with a direct one-sentence definition, add 5-6 specific spec bullets, add "Best for / Not ideal for" callouts, add a brief honest comparison section.

**Day 29-35**: Rewrite your homepage. The hero should make your brand's category position unambiguous in plain language ("X is a direct-to-consumer mattress brand..." rather than "Sleep deeply with our award-winning..."). The first paragraph below the hero should give AI engines extractable facts about who you are, who you serve, and what makes you specific.

**Milestone**: end of week 5, your homepage and top 10 product pages read as if written for both humans and AI engines, with clear quotable content.

## Week 6-7: Wikipedia and Wikidata

Goal: establish your brand in the open-web knowledge graph.

**Day 36-42**: Create your Wikidata entry. Lower notability bar than Wikipedia, free, takes about 30 minutes to set up properly. Include category, founders, year founded, headquarters, and at least 3 reliable source citations. Wikidata feeds directly into AI engine training data.

**Day 43-49**: Assess your Wikipedia notability. Do you have 3-5 substantive mentions in reliable sources? If yes, this is the week to either hire a professional Wikipedia editor ([details here](/blog/how-to-get-your-brand-on-wikipedia)) or politely pitch a Wikipedia editor active in your category. If no, this is the week to start a focused PR push to earn those mentions over the next 60-90 days.

**Milestone**: end of week 7, you have a Wikidata entry. Wikipedia is either underway or you have a clear plan for getting there.

## Week 8-9: Reddit presence (long game starts now)

Goal: start the slow-build that will pay off in months 4-12.

**Day 50-56**: Identify your 3-5 most active category subreddits. Read their rules carefully. Create a real-name account, clearly identified as your founder or a specific employee. Put your role in the bio.

**Day 57-63**: Start contributing. 30 minutes a day. Comment helpfully on existing posts. Answer questions. Recommend competitors when they're the better fit. Don't post anything brand-related yet. You're building karma and trust.

**Milestone**: end of week 9, you have an active Reddit presence with growing karma in your category subs. Brand mentions are coming later — for now you're building credibility.

## Week 10-11: third-party citation push

Goal: earn the mentions on independent sites that AI engines weight most heavily.

**Day 64-70**: Make a list of 20 publishers and reviewers that consistently get cited in your category's AI Overviews. Wirecutter, NYT Wirecutter, Consumer Reports, Engadget, category-specific magazines and YouTube reviewers.

**Day 71-77**: Pitch the top 5. Have a clear, short pitch focused on what's distinctive about your brand (the same positioning that makes you AI-friendly makes you press-friendly). Send samples. Be patient.

**Milestone**: end of week 11, you have 5 active outreach conversations in flight with priority publishers. Don't expect them to all land, but you have a pipeline.

## Week 12: measurement and next-quarter planning

Goal: know what's working and plan the next 90 days.

**Day 78-84**: Re-run your Chedder audit. Compare to week 1 baseline. Specifically look at:
- Did your composite score improve? By how much?
- Did your AI citation rates per platform move?
- Did AI crawler activity on your site increase?
- Are you starting to appear in any prompts you weren't appearing in before?

**Day 85-90**: Build your dashboard (the 7-metric dashboard from [our analytics post](/blog/ai-search-analytics-what-to-track)). Snapshot today's numbers. Set a target for end of next quarter (typically: 30-50% improvement in composite score, 2x increase in citation rate on your weakest platform, AI referral traffic ticking up from zero).

**Day 90**: write a one-page summary of what worked, what didn't, and what to prioritize next quarter. Pin it on your wall. This is your reference document.

**Milestone**: end of 90 days, you have measurable AI search visibility progress, an active program with momentum, and a clear plan for the next quarter.

## What you should expect at the 90-day mark

Realistic expectations based on the brands we've worked with:

**Composite audit score**: usually up 15-40 points from baseline. Brands that started near 30 often reach 50-60. Brands that started near 50 often reach 65-75.

**Citation rate per platform**: usually doubles on at least one platform (typically Google AI Overviews, which responds fastest to structured data changes). Other platforms (ChatGPT, Perplexity) move more slowly because of training cycles.

**AI crawler activity on your site**: should be visibly elevated in your server logs. Specifically, `OAI-SearchBot`, `Perplexity-User`, and `Claude-User` activity should rise as you become more discoverable.

**AI referral traffic to your site**: small but non-zero. Maybe 0.5-2% of total traffic from AI sources by day 90. The growth curve from here gets steeper.

**Branded search lift**: usually visible by day 90, especially if you've executed the Wikipedia/Wikidata steps. A 5-15% YoY lift in branded search is common when the program is working.

## What NOT to do in the first 90 days

A few things people try that don't work:

- **Mass-publishing AI-generated blog content** to "feed" AI engines. Google specifically penalizes mass AI content. Skip this.
- **Paying for backlinks.** AI engines weight backlinks less than Google does, and Google is actively penalizing paid links. Not worth the risk.
- **Creating an "AI optimization" page on your own site.** Self-referential, doesn't help.
- **Switching platforms** (changing your CMS, your Shopify theme, your headless setup). Major platform changes during a 90-day GEO push will distract from the work that matters.

## What happens after day 90

The 90-day playbook builds the technical and content foundation. The next 90 days are about sustaining momentum:

- Continue Reddit presence (still building)
- Continue publisher outreach (still building)
- Add structured data to the next 50 product pages
- Rewrite the next 20 product pages
- Re-audit monthly and track trajectory
- Pitch a podcast appearance per month
- Get into 1-2 "best of [year]" listicles per quarter

The compounding curve starts here. The brands that stay disciplined through months 4-12 see real, measurable AI search market share gains. The brands that lose focus after the initial sprint plateau and get overtaken.

If you're ready to start, [run your free audit](/) and get your baseline. The audit takes under a minute. The 90-day playbook above turns it into measurable AI search visibility by the end of the quarter.

The shoppers asking ChatGPT about your category right now aren't waiting. The earlier you start the 90 days, the more weeks of compounding you get.
