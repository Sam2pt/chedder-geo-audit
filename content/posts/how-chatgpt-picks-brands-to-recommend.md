---
title: "How ChatGPT decides which brands to recommend"
excerpt: "When a shopper asks ChatGPT for the best mattress or the best dog food, three brands get named and the rest get nothing. Here's what actually goes into that choice, and what you can change."
date: 2026-06-29
readTime: 7 min
---

A shopper opens ChatGPT and types: "what's the best non-toxic mattress for back pain?" Three seconds later, three brands are named. Maybe four. The rest of the category — including most of the brands that buy the most Google ads — gets nothing.

If that's not your category yet, give it six months.

Marketers keep asking us the same thing: **what does ChatGPT actually use to decide who makes the list?** This post is the honest answer, based on what we see across hundreds of CPG audits at [Chedder](/).

## It is not what your customers say. It's what the open web says about you.

The first reflex when a brand sees their name missing from an AI answer is to assume it's a reputation problem. "We must have bad reviews." "Reddit is brutal to us." "Trustpilot has the haters."

Sometimes. Mostly not.

Large language models like the ones behind ChatGPT and Perplexity were trained on roughly 15-20 trillion words of public web content. Your customers' opinions are in there, but so is Wikipedia, every product review on the open web, every podcast transcript, every press release that got picked up, every Reddit thread about your category, every news article that quotes a founder, and every store-locator page that mentions your brand.

The model doesn't read your customer's specific review. It reads the **patterns**. When 47 different sources independently say a brand is "the gold standard for cooling sleep," that becomes a fact-like claim the model is willing to repeat. When 47 different sources say nothing about you at all, you don't get repeated.

The fix isn't to ask for more reviews. The fix is to be **described, by other people, in the language your customers use to search**.

## The five signals that move the needle

When we audit a brand, the model that fills its answers cleanly tends to have all five of these:

1. **Schema and structured data on the brand site itself.** Product schema, Organization schema, FAQ schema. The wrapper an AI reads first when crawling your domain. Most CPG sites have zero. Most CPG sites should fix this in an afternoon.

2. **A Wikipedia or Wikidata entry.** Even a small one. Wikipedia has outsized weight in LLM training because it's well-edited, well-linked, and machine-readable. If your brand has been around for more than five years and isn't on Wikipedia, that's a strategic gap, not a vanity gap.

3. **Authentic mentions in category Reddit threads and forums.** Not seeded. Not promoted. Real conversations where real people compare you to alternatives. AI models lean heavily on Reddit because the answers are conversational and direct.

4. **Press citations from publishers with strong domain authority.** A single mention in NYT Wirecutter, Wired, or a major trade pub is worth a thousand mentions on syndicated press release sites the model has learned to discount.

5. **Your AI crawlers are welcome.** GPTBot, ClaudeBot, Google-Extended, PerplexityBot, CCBot. If any of them are blocked in your robots.txt — and a surprising number are, often by accident from a 2023 ad-tech recommendation that aged badly — you're invisible. Worse than invisible: actively absent.

## What ChatGPT doesn't actually care about

A few things marketing teams obsess over, that don't move AI answers as much as you'd think:

- **Meta descriptions.** AI models don't really crawl your meta. They sample your visible content.
- **Backlinks for ranking purposes.** They matter for traditional SEO. AI engines lean more on citation quality and topical co-occurrence than on PageRank-style link counting.
- **Keyword density.** Writing "best non-toxic mattress" 12 times on your page doesn't help. Being the brand other people describe that way does.
- **Page speed.** Important for users. Not a meaningful AI ranking signal yet.

This list will change. AI engines are six months old as a meaningful traffic source. The list above is what we see *today*. We'll update this post as it shifts.

## How to find out where you stand

We built Chedder for this exact question. Paste your URL, wait under a minute, and you get:

- The real prompts ChatGPT and Perplexity were asked in your category, and which brands they named
- A scored audit across schema, content depth, external citations, and crawler access
- A prioritized fix list, written for a brand marketer, not a server administrator

[Run a free audit](/) and see where you actually rank in the conversation. If you're not on the list, you can be, and the gap is smaller than you think.
