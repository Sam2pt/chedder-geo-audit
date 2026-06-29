---
title: "Schema markup for DTC brands: the 2026 guide"
excerpt: "Structured data is the highest-leverage technical change most CPG brands can make. Here's exactly which schema types to add, what each one signals to AI engines, and how to avoid the common mistakes."
date: 2026-06-24
readTime: 9 min
---

If you can do one technical change to improve your brand's AI search visibility this quarter, it's adding structured data. We've audited hundreds of CPG sites at Chedder and the pattern is consistent: brands with proper schema get cited noticeably more often in AI answers than otherwise-similar brands without it.

Structured data is the JSON-LD wrapper that lives in your `<head>` and tells search engines (and AI engines) exactly what your page is about. It's the machine-readable label on a human-readable page. AI engines read the label first.

## Why structured data matters disproportionately for AI

A human shopper reads your page top to bottom, parses the visual hierarchy, and forms an opinion. An AI engine that's processing thousands of pages per second doesn't do that. It looks for shortcuts. Structured data is the biggest shortcut on the internet.

When a Product schema block tells the AI engine "this page is a product called X, priced at $Y, available in Z," the model doesn't have to infer any of that from prose. It's a labeled fact. Labeled facts get cited.

Two practical consequences:

1. Pages with structured data show up more reliably in AI answers because the model can confidently extract specific claims about your brand.
2. Brands with a consistent schema strategy across their catalog get described more consistently by AI engines, which compounds over time.

## The schema types that matter for CPG brands

Not every Schema.org type is worth your time. These are the five that move the needle for consumer brands.

### 1. Organization (homepage, About page)

The brand-level identity card. Every CPG site should have this on the homepage.

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Casper",
  "url": "https://casper.com",
  "logo": "https://casper.com/logo.png",
  "description": "Direct-to-consumer mattress brand pioneering the bed-in-a-box category.",
  "sameAs": [
    "https://en.wikipedia.org/wiki/Casper_(company)",
    "https://www.instagram.com/casper",
    "https://twitter.com/casper"
  ]
}
```

The `sameAs` array is critical. It explicitly tells AI engines "this entity is the same as the entity at these other URLs." Strong signal for entity recognition.

### 2. Product (every product page)

The single most-cited schema type for CPG sites. Bare minimum:

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Casper Original Mattress",
  "image": "https://casper.com/images/original-queen.jpg",
  "description": "Memory foam mattress with zoned support construction.",
  "brand": { "@type": "Brand", "name": "Casper" },
  "offers": {
    "@type": "Offer",
    "price": "1295.00",
    "priceCurrency": "USD",
    "availability": "https://schema.org/InStock"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.6",
    "reviewCount": "12847"
  }
}
```

Include `aggregateRating` if you have it. AI engines lean heavily on rating signals when comparing brands in a category.

### 3. FAQPage (education and explainer pages)

If you have any page that answers questions ("how to clean silk pajamas," "what is muslin gauze"), wrap it in FAQPage schema. AI engines love direct Q&A pairs.

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [{
    "@type": "Question",
    "name": "How often should you replace your mattress?",
    "acceptedAnswer": {
      "@type": "Answer",
      "text": "Most mattresses should be replaced every 7-10 years..."
    }
  }]
}
```

### 4. BreadcrumbList (deep-link pages)

Helps AI engines understand your site's taxonomy. Underrated.

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Mattresses", "item": "https://casper.com/mattresses" },
    { "@type": "ListItem", "position": 2, "name": "Original", "item": "https://casper.com/mattresses/original" }
  ]
}
```

### 5. Article (blog posts and editorial content)

For any reference-grade content you want AI engines to cite.

```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Schema markup for DTC brands: the 2026 guide",
  "author": { "@type": "Person", "name": "Sam Gormley" },
  "datePublished": "2026-06-24",
  "publisher": { "@type": "Organization", "name": "Chedder" }
}
```

## What NOT to do with schema

A few mistakes we see regularly:

- **Don't fake aggregateRating.** Google penalizes this and AI engines deprioritize sources that have been flagged for review manipulation. Use real review counts.
- **Don't add schema for content that isn't on the page.** "Hidden" schema (markup for things not visible to users) gets you flagged for spam.
- **Don't use the same schema block on every product page.** Each product needs its own unique schema with that product's actual data.
- **Don't skip the `image` field.** It's the single biggest reason structured data gets ignored by AI engines.

## How to ship this

If you're on Shopify, most premium themes include basic Product schema out of the box. Audit what's already there with Google's [Rich Results Test](https://search.google.com/test/rich-results) and fill in the gaps.

If you're on a custom stack, write a single template helper that generates JSON-LD from your product/page data and inject it server-side. Don't generate schema client-side via JavaScript — many AI crawlers don't execute JS and you'll get nothing.

If you want to know how your structured data currently looks to AI engines, [run a free audit at Chedder](/). The schema module reports exactly what's present, what's missing, and which types would have the biggest impact for your specific brand.

Schema isn't glamorous. It's the most boring win in your AI search playbook. It's also the one most brands haven't done yet, which is exactly why it's the highest leverage move on the list.
