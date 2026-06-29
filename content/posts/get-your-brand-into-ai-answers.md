---
title: "How to get your brand into ChatGPT, Perplexity, and Brave answers"
excerpt: "A step-by-step checklist for CPG brand teams who want to start showing up when shoppers ask AI for a recommendation. Ranked by leverage, written for marketers."
date: 2026-06-27
readTime: 9 min
---

Every brand we talk to wants the same thing: when a shopper asks an AI tool for a recommendation in our category, we want to be on the list.

Most teams don't know what to actually *do* about that. The advice on the internet is either pure SEO theory dressed up in AI language, or it's "have a great brand and great products." Neither helps you ship anything by Friday.

This is the actual checklist, ranked by what we see move the needle in real Chedder audits. Read top to bottom. Stop when you run out of time.

## The 30-minute fix list

These are the things you can do today, by yourself, with no engineering ticket.

### 1. Unblock the AI crawlers

Open your `robots.txt` (it's at `yourdomain.com/robots.txt`). Look for any of these user-agents and make sure they're NOT under a `Disallow: /` line:

- `GPTBot` (OpenAI / ChatGPT)
- `ClaudeBot` (Anthropic / Claude)
- `PerplexityBot` (Perplexity)
- `Google-Extended` (Google's AI/Gemini training corpus, separate from search)
- `CCBot` (Common Crawl — the public dataset most models still draw from)

If any are blocked, talk to whoever owns the robots file. The most common reason these are blocked is a 2023-era ad-tech recommendation to "starve AI of your content." That advice aged badly. You're not winning a war by hiding from the engine your customers use.

### 2. Audit your existing AI footprint

Run a free Chedder audit. Or run yourself through ChatGPT and Perplexity manually:

- "What's the best [your category] for [your typical customer]?"
- "Recommend a [your product type] under $50."
- "What's similar to [your most well-known competitor]?"

Note which brands are named. Note where you do and don't appear. Note the specific language used to describe the brands that do get named. That language is the language you need to be described in elsewhere.

### 3. Check whether your Wikipedia entry exists

Search Wikipedia for your brand name. If you have an entry, click through and check that it's accurate, neutrally written, and has at least 3-5 citations to independent sources. If you don't have an entry but you've been around 5+ years with media coverage, you almost certainly qualify. The path to creating one is gentle but specific — find a Wikipedia editor in your category to coach you. Don't self-write; you'll get reverted.

## The 30-day fix list

These need engineering and content investment, but the payoff is structural.

### 4. Add structured data to high-value pages

At minimum, you want:

- `Organization` schema on your homepage (brand name, logo, social links, contact)
- `Product` schema on every product page (name, image, price, availability, aggregateRating if you have reviews)
- `FAQ` schema on your top-traffic education pages
- `BreadcrumbList` on any deep-link page

This is the most underrated lever in CPG. Most brands have none of it. AI engines read structured data first when deciding what your page is about. Adding schema is the single highest-leverage technical change you can ship this quarter.

### 5. Build the "described by" surfaces

The mentions that move AI answers come from places other than your own site. Plan a real budget for:

- **Reddit category presence.** Find the 3-5 subreddits where your category gets discussed. Spend time there. Run an AMA when the moderators allow. Don't seed posts; you'll get caught and banned. Be helpful and honest.
- **Niche review site outreach.** Not Wirecutter, not at first. The small independent reviewer with 5,000 highly engaged YouTube subscribers in your specific niche matters more to AI engines than you'd think, because their content is dense, specific, and high-trust.
- **Podcast appearances.** Founder interviews on category podcasts. AI engines ingest podcast transcripts. A 60-minute conversation that mentions your brand 40 times is gold.

### 6. Write reference-grade content, not blog volume

The era of writing 500-word listicles to chase long-tail keywords is over for AI engines (it's still alive in Google traditional, but declining). What works now is fewer, deeper pages that AI engines will cite by name. Examples:

- A "definitive guide to [category]" that genuinely is the most thorough page on the internet for that topic
- An original research piece with first-party data ("we surveyed 2,000 shoppers about X")
- A comparison page that fairly compares yourself to your top 3 competitors with specifics

The test: would an AI engine paraphrase this page into an answer because it's the best source it has? If yes, you have a citable asset. If no, it's just SEO inventory.

## The 90-day fix list

These are the strategic moves. Most brands won't do them. The ones that do will pull away from the pack.

### 7. Get a Knowledge Graph entry

When AI engines describe a brand "with confidence," they're usually leaning on a knowledge graph entry — Google's KG, Wikidata, Crunchbase, or similar. Getting yours filled out and verified takes time but is high-leverage. Start with Wikidata (free and editor-driven) and Crunchbase (free if you have any media coverage at all).

### 8. Make your audits public

If you have positive third-party testing data, third-party certifications, or third-party comparisons, get them on a page you control AND syndicated to at least three independent sources. AI engines love corroboration. One source saying you're the best is marketing. Five independent sources saying it is a fact.

### 9. Measure with cohorts, not impressions

The CPG marketing dashboard for AI search is not impressions or rank. It's: when an AI engine names brands in our category, what percentage of the time are we on the list? Track that monthly. Watch it move. [Chedder's compare audits](/) give you the comparative number against your top three competitors automatically.

## The honest ending

None of this is magic. It's the same thing brands have always done — be talked about, be described accurately, be discoverable — adapted to a new audience that happens to be a language model.

The good news: the brands at the top of the AI answer today are not the brands with the biggest ad budgets. They're the brands that figured out the playbook above six months earlier than the next cohort. That window is still open. Probably for another 12-18 months.

[Run a free audit](/) to see where you actually stand. Then pick the top one or two things from this list and ship them this month. You'll be ahead of 80% of your category.
