---
title: "How to optimize for ChatGPT recommendations"
excerpt: "ChatGPT recommends three brands. There are 300 in your category. Here's the practical playbook for being one of the three, ranked by what we see move the needle most across hundreds of CPG audits."
date: 2026-06-25
readTime: 8 min
---

A shopper opens ChatGPT, types "what's the best [your category] for [their use case]," and gets three brand names. There are 300 brands in your category. Three get the recommendation. The other 297 get nothing.

The single most common question we get at Chedder is: **how do we be one of the three?** This is the playbook, ranked by what we actually see move the needle across hundreds of CPG audits.

## Step 1: get your brand's "facts" consistent across the open web

ChatGPT (and every other LLM-based engine) was trained on a stew of public web content. When the model decides which brands to name in a category answer, it's largely surfacing the brands it has the most consistent, confident information about.

The fix isn't a single page. It's making sure the same factual claims about your brand appear across many independent sources. Specifically:

- A Wikipedia or Wikidata entry that names your category clearly
- A Crunchbase profile (free, anyone can claim)
- Consistent category descriptions in your own About page, your Shopify storefront descriptions, and any retailer pages
- Press citations that describe you the same way

If three different sources say "Casper is a direct-to-consumer mattress brand," the model treats "DTC mattress brand" as a high-confidence fact about Casper. If your brand has five different category descriptions floating around, you've made yourself ambiguous, and AI engines reward unambiguous more than they reward popular.

## Step 2: make sure GPTBot can actually read your site

It's astonishing how many CPG brands silently block GPTBot. We see it in roughly 15% of the audits we run. The block usually came from a 2023-era ad-tech recommendation to "starve AI of your content," advice that aged badly the moment AI tools became a meaningful source of shopper traffic.

Check your `robots.txt` (it's at `yourdomain.com/robots.txt`). Look for any of these user agents and make sure they're NOT under a `Disallow: /` line:

- `GPTBot` (OpenAI / ChatGPT)
- `ClaudeBot` (Anthropic / Claude)
- `PerplexityBot` (Perplexity)
- `Google-Extended` (Google's AI/Gemini training corpus)
- `CCBot` (Common Crawl, which many models still draw from)

Unblocking is a one-line change. The impact takes 4-12 weeks to show up (because models retrain on intervals, not in real time), but the upside is massive: every prompt your brand was previously invisible on becomes a possibility.

## Step 3: add Product, Organization, and FAQ schema everywhere they belong

Structured data is the most underrated GEO lever. AI engines read structured data BEFORE they parse visible content, because it's machine-readable, unambiguous, and standardized.

At minimum, every CPG site needs:

- `Organization` schema on the homepage (brand name, logo, social profiles, contact info)
- `Product` schema on every product page (name, image, price, availability, ratings)
- `FAQ` schema on top-traffic education pages
- `BreadcrumbList` on any deep-link page

Most CPG sites have zero structured data. The ones that do see meaningful gains in both AI engines AND traditional Google rank because Google's algorithm now leans on structured data too. It's the highest-leverage technical change you can ship this quarter.

## Step 4: get on Reddit in your category, authentically

AI engines lean disproportionately on Reddit because Reddit conversations are conversational, dense, and high-trust. When 200 different threads in r/mattress organically name three brands as "the cooling ones," that's a stronger signal to ChatGPT than 200 brand-controlled marketing pages saying the same thing.

How to do this WITHOUT getting banned (and without becoming a brand-mention smell):

- Identify the 3-5 subreddits where your category lives
- Spend real time there as the brand. Founder presence beats marketing-team presence by a wide margin
- Run an AMA when the moderators allow it
- Respond to genuine questions with genuine answers, including pointing people to competitors when competitors are the right answer
- Never seed posts. Reddit's culture detects this and you'll get banned

This is a 6-12 month commitment, not a one-quarter sprint. The brands that pull ahead are the ones who treat Reddit as a permanent channel, not a campaign.

## Step 5: get cited by people other than yourself

The mentions that move AI recommendations most are NOT on your own site. They're on third-party sites that AI engines treat as authoritative.

In order of leverage:

- A Wirecutter mention (if you can earn one, this is the gold standard)
- Wikipedia entries that mention you (less direct but high-trust)
- Independent reviewer YouTube videos with full transcripts
- Podcast appearances on category-specific shows (transcripts are gold)
- Trade-publication citations
- Independent comparison articles on niche sites

Most CPG marketing teams have no budget line for "be talked about by other people, in our category, in the language our customers use." That gap is the single biggest opportunity we see in 2026.

## What NOT to do

A few common reflexes that don't help:

- **Writing more blog posts on your own site.** Volume on your own domain doesn't move AI answers much. Volume of mentions on OTHER domains does.
- **Buying backlinks.** AI engines weight backlinks less than traditional Google, and Google is actively penalizing paid links. Not worth it.
- **Stuffing the keyword "ChatGPT recommends" into your meta descriptions.** Not a thing. AI engines don't look at meta this way.
- **Creating an "AI optimization" page on your site.** Self-referential, doesn't help.

## How to start

[Run a free audit at Chedder](/). You'll see in under a minute exactly which prompts your brand currently appears on, which competitors are getting recommended where you should be, and the prioritized fix list to close the gap.

The brands at the top of AI answers today aren't the ones with the most resources. They're the ones who started 6 months earlier than their competitors. Start now and you'll be on the list when shoppers ask.
