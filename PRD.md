# Chedder — Product Requirements

This is a living document. It captures what Chedder is, who it serves, and what we're building. Sharpens with every session.

> Paired doc: `AGENTS.md` — how we build (conventions, copy rules, engineering patterns). This one is what we're building and why.

---

## What Chedder is

Chedder is Two Point Technologies' Generative Engine Optimization audit tool, and the first release in a cheese-named GEO product line (Chedder, then Brie, then Slices, and so on as the GEO product matures). Non-GEO tools TPT builds later get their own names — the cheese theme is specifically for this line, not a forever pattern.

Chedder answers one vague but increasingly important question for a consumer brand: **do you show up when someone asks a chat or an AI search for a recommendation in your category?**

It's free to try. It's intentionally inclusive and inviting in tone. It doubles as TPT's working tool and as a conversation-opener for TPT's sales flow.

## Mission

Make "am I visible in AI?" answerable in thirty seconds, for any consumer brand, in plain English, without requiring technical literacy to read the result.

That's it. One question, one clear answer, one short path to what to do next.

## Who it serves

**Two Point Technologies — the team.** Chedder is an internal tool for running audits before sales calls, baselining new client engagements, and tracking progress during the work. The "beta" branding means we can iterate openly while TPT is the first power user. This is the audience the product optimizes for.

**TPT's paying clients.** Clients get access to Chedder as part of their engagement. It makes the work tangible. They can run audits, share permalinks, and see the signals we're improving for them. The software cost blends into TPT's services pricing rather than being sold as a separate SaaS subscription.

**The public (as sales funnel, not a retention target).** A free public beta positions TPT as a technology partner that drives revenue, not just a marketing agency. Public users are inbound leads in waiting — someone curious enough to audit their brand is someone who might benefit from TPT doing the work. The tool is a conversation-opener, not a consumer product we measure by retention.

## Core job to be done

Right now Chedder nails one job: **diagnose**. A user pastes a URL and, in thirty seconds, gets a clear picture of whether AI recommends them, what the AI actually says when asked about their category, and which competitors show up in their place.

Adjacent jobs that matter but come later:

- **Plan** — already partly shipped via the prioritized action items. Next sharpen is category-specific recommendations with copy paste templates.
- **Monitor** — track visibility over time. Shipped primitively via saved audit history; full monitoring (alerts, trends, change detection) is explicitly a later cheese, not Chedder.
- **Beat competitors** — shipped as the "Take land" view in compare mode. Gets sharpened as the audit itself gets more accurate.

## What "light touch" means

Light touch is about tone, not thinness. The UI is inclusive, playful, and human. Loading screens have cheese puns. Module names read like magazine sections. Findings narrate what's happening instead of listing what's missing.

The underlying analysis is substantive. We run real queries on real AI tools, crawl multiple pages, run quality review on the output. The tool is deep where it needs to be deep; the surface just doesn't flaunt it.

## Shipped (as of April 2026)

- Multi engine AI search visibility testing (ChatGPT, Perplexity, Brave Search, grouped in the UI as AI chats / AI search)
- Multi page site crawl (homepage plus top three high signal internal pages) with analyzers aggregating across pages
- Seven-category audit: structured data, meta tags, content, AI crawlability, trust signals, external presence (Wikipedia + Reddit via Brave), and AI search visibility itself
- LLM powered category inference, brand-to-domain resolution, prose extraction, and a final quality review pass before results render
- Competitor extraction from AI answers + side by side compare with Take Land / Quick Wins / You Lead insights
- Shareable permalink pages with rich OG images for social previews
- Persistent storage in Netlify Blobs (no auth yet)

## Near term roadmap

In order:

1. **Soft gate after first free audit (lead capture).** First search is free and anonymous — stays inviting. To run a second search, the user signs up with name, position, company, and email. This is the single highest leverage change right now: every person who cares enough to run a second audit enters TPT's funnel as a warm lead. Positioned as "save your audit and run more" not "pay a wall."
2. **Analytics / behavior tracking.** Observe how people use the tool: which brands they audit, how far they scroll, whether they share the permalink, whether they come back. Lightweight first (Plausible or similar), then event-level as we decide what matters. Complements the lead capture with aggregate signal.
3. **Login + database.** The "private vessel" step that the sign-up in step 1 implies. Once a user has an account they can see their saved audits, give their company a name, watch their trend over time. Turns the tool from single-shot to personal.
4. **Richer recommendations.** Category-specific action plans (apparel wants sizing guides, food wants nutrition schema, beauty wants ingredient lists). Copy paste templates for Reddit, Wirecutter pitches, product-page schema.
5. **More query variety.** Use-case queries ("best X for Y"), price-tier queries, attribute queries ("best organic X"). Surfaces where a brand is strong that today's three discovery queries miss.

## Later (explicitly not now)

- Change detection and visibility alerts (this is Brie, not Chedder)
- Full team workspaces, roles, permissions
- Competitor monitoring on a schedule
- Exports (PDF is there; CSV / deep data exports are not priority)
- Any B2B SaaS framing in copy or features

## Explicitly out of scope

Chedder does GEO. That's the whole claim to fame. We don't do:

- Traditional SEO (keyword rankings, backlink analysis, Core Web Vitals)
- Paid advertising performance
- Social media analytics beyond Reddit discovery
- Content generation ("here's the FAQ, write me one")
- B2B SaaS brands — this is a CPG tool. DTC and traditional retail only.

Discipline here keeps Chedder sharp. Tools that try to do everything tend to do none of it well.

## Monetization philosophy

Not yet. The operating cost is low and the learning return on keeping it free is high. When we monetize:

- **Free tier stays generous.** We're not trying to build a freemium squeeze.
- **Paid tier unlocks depth**, not basic access. Saved audit history, richer analysis, competitor monitoring, team features.
- **Pricing blends into TPT's services model**, not standalone SaaS sticker pricing. Clients who pay TPT for work get Chedder. Public power users get a paid tier when we decide it exists.
- **Decision precondition**: meaningful behavior data from the beta. Guessing from zero leads to the wrong pricing.

## What success looks like right now

We don't have a single KPI. The concept is proven when:

- TPT uses Chedder in real sales cycles and clients respond well to it
- The soft gate produces a steady trickle of qualified inbound leads (people who chose to hand over a name + email in exchange for a second audit — a real signal of interest)
- The tool produces insights the TPT team wouldn't have otherwise had about a given brand
- We learn enough from behavior patterns to know what a paid tier should actually be

## Open questions (parked)

- `?` What does the soft gate page look like in practice? Phrasing matters ("Save this audit and run another" vs. "Sign up to continue"). Stays on the inviting side of the line.
- `?` What happens to the first (anon) audit after the user signs up? Attach to the new account? Let them revisit from the link?
- `?` Do we want an agency flag on the sign-up (position = "marketing agency") to handle case where an agency is running audits on behalf of clients? Could be a future lead signal.
- `?` When does category-specific recommendation work justify its own sub-product vs. living inside Chedder?

---

_Last updated: end of session on 2026-04-20. Next refresh: whenever the shape of the product changes materially — new product line (Brie), monetization decision, or pivot in audience._
