<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Chedder house rules

This project is a CPG-focused (direct to consumer and traditional retail) AI search visibility audit tool. These rules codify decisions we kept relearning. Read before writing any user-facing copy or shipping UX.

## Who this tool is for
- **CPG brands only.** Dog beds, pianos, candy, mattresses, beauty, pet food, laundry detergent. Never B2B SaaS framing. LLM prompts and example copy should always reference consumer product categories.
- The typical user is a non-technical marketer or brand owner. Copy should read like a lifestyle magazine, not a server log.

## User-facing copy rules
- **No separator dashes.** Em dash (`—`), en dash (`–`), and plain hyphen used as a sentence separator (` - `) are banned in any string the user will see. Use commas, periods, colons, or middle dot (`·`). Word-forming hyphens (`low-code`, `off-the-shelf`) are fine when they're standard English.
- **Module names read like magazine sections.** "The labels AI reads first", "What the web whispers about you". Never "Schema & Structured Data" or "External Brand Signals".
- **Never name the specific AI tool in user-facing text.** We categorize: `openai` → "AI chats", `perplexity` + `brave` → "AI search". Tool names stay in internal data for scoring and competitor extraction. The homepage hero and marketing copy may still name-drop ChatGPT/Perplexity for recognition, but the audit UI shows only categories.
- **Light cheese theme is welcome.** Cheesy puns are on-brand (the product is called Chedder). Keep them to about 1 in 5 strings so the tone stays playful, not corny.

## Engineering conventions

### When to use an LLM call over regex
Default to an LLM pass for any fuzzy NLP task: category inference, brand name to domain resolution, brand extraction from prose, competitor quality review. Costs pennies and is dramatically more accurate. Pattern:
- `gpt-4o-mini`, `temperature: 0`
- `response_format: { type: "json_object" }` for structured output
- Sanity-check the response (regex for domain shape, length bounds, word count, blocklist hits)
- Fail soft: on HTTP error or parse failure, return empty/null so the regex fallback kicks in

### Netlify + Next.js caching
Root HTML on this site **must not be cached at the Netlify edge at all**, and must revalidate in the browser. Chunk hashes rotate per deploy and a stale cached HTML will reference JS chunks that no longer exist, producing a browser-only `ChunkLoadError` while `curl` returns 200. Browser headers alone are not enough because Netlify's Durable cache has its own stale-while-revalidate semantics and ignores browser `must-revalidate`. You must set both:

- Browser: `Cache-Control: public, max-age=0, must-revalidate`
- Netlify edge: `Netlify-CDN-Cache-Control: no-store`

This is the combo in `netlify.toml` for `/*`. Do not remove either side. For hashed static assets (`/_next/static/*`) both layers can cache aggressively since the content is immutable. If you see `cache-status: ...; fwd=stale` in a response header, the edge is still caching HTML and you need to re-check the headers.

### Compare endpoint timeouts
`/api/audit` has `maxDuration = 90`. Primary and competitor audits fan out in parallel with `Promise.all`. Competitor audits skip AI citations and external checks (`skipAI: true, skipExternal: true`). If you add a module that calls a slow external service, gate it behind a `skipExternal`-style flag for the compare path.

### Multi-page crawling
Schema and Content analyzers accept `pages: CheerioAPI[]` (homepage first) and aggregate across pages. `lib/crawler.ts/discoverInternalLinks` picks the top 3 high-signal internal URLs (products, FAQ, reviews, about). Site-level analyzers (meta, technical, authority, external) stay homepage-only.

### Competitor extraction gates
Three filters stacked in this order catch nearly all noise:
1. **Scenario filter.** Only harvest from "best X", "alternatives", "similar to" scenarios. Never from "tell me about X".
2. **Cross-engine agreement.** Require ≥2 engines to name a candidate when 2+ engines ran. Single-engine single-mention is noise.
3. **LLM quality review.** Final pass via `lib/analyzers/quality-review.ts` that drops publishers, retailers, category words, and duplicate-brand domains.

When a new class of noise leaks through, prefer adding to the quality review system prompt over hand-curating `NON_COMPETITOR_DOMAINS`. The prompt scales to unseen cases; the blocklist doesn't.

### Known-blocked sites
Some CPG sites (Sugarfina, Hoka, Dove, parts of Casper) are behind DataDome, Cloudflare, or Akamai bot protection. `fetchPage` detects these via response headers and returns a friendly error naming the protection vendor. This is expected, not a bug. Don't chase "better user agents" to bypass them.

## Process rules

### Dogfood before shipping, dogfood across categories
Backend changes that touch any analyzer must be dogfooded against at least 3 CPG brands from different segments before commit: one DTC (e.g. `casper.com`), one traditional CPG (e.g. `oreo.com`), one known baseline (a brand with stable history). Category-specific bugs (Oreo's missing category prompt was one) only surface with category-specific dogfood.

### Always browser-verify UI changes
Any copy or UI change must be verified in Chrome MCP against the live site, not just curl. Use the `browser-verify` skill. A ChunkLoadError or hydration bug is invisible in API output but breaks the page. Curl green does not mean user green.

### Ship small, ship often
This codebase ships roughly 20 deploys in a productive session. Prefer small commits with a focused scope and dogfood verification over large batched changes. Failed hooks or typechecks are not blockers; they're a signal to split into smaller pieces.

### Financial and account creation actions are always user-driven
Subscribing to APIs (Brave, Perplexity, etc.), accepting Terms of Use, completing CAPTCHAs, entering payment info: all require explicit user confirmation in chat even inside an autonomous session. Walk the user up to the button; never click it yourself.
