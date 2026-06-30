# Chedder brand system

The spec the next round of marketing work gets checked against. Rules
that don't appear in this doc don't exist. Rules that do are not
optional.

Last updated: 2026-06-29

---

## 1. Identity

### What Chedder is

A free AI search audit for DTC and CPG brands. Tells a brand whether
ChatGPT, Perplexity, Brave, and Google AI Overviews recommend them in
their category, and exactly what to fix when they don't.

### What Chedder is not

* Not an SEO tool. SEO is solved. This is the new problem.
* Not enterprise-only. Self-serve, 60 seconds, no signup for the first one.
* Not a dashboard for analysts. A guide for marketers.

### Personality

Two voices, deliberately separated.

**Brand voice.** The formal surface (nav, headers, marketing copy,
emails). Confident, precise, slightly understated. Linear, Notion,
Stripe energy. Never breathless. Never over-explaining.

**Chedder voice.** The character, when speaking in first person
(loaders, empty states, tooltips, walkthrough). Friendly, curious,
helpful. Never cute. Never uses cheese puns.

The split exists because the product is a serious solution. Chedder
the character carries the warmth so the brand doesn't have to
perform it.

---

## 2. Color

### Tokens

| Token | Hex | Used for |
|---|---|---|
| `--brand-coral` | `#FF5E47` | Primary CTAs, brand mark dot, Chedder body, accent dot in punch words |
| `--brand-coral-dark` | `#E04A35` | Hover/pressed states |
| `--brand-coral-light` | `#FFF1ED` | Soft backgrounds, halos, coral-tinted cards |
| `--brand-coral-tint` | `#FFD9CC` | Stronger tint, borders on coral cards |
| `--brand-accent-2` | `#F59E0B` | Warm gradient pair with coral (rare, hero only) |
| `--foreground` | `#0F172A` | Body text, headings, dark surfaces |
| `--muted-foreground` | `#475569` | Secondary text |
| `--background` | `#FAFAFA` | Default surface (warm-tinted off-white) |
| `--card` | `#FFFFFF` | Elevated cards |
| `--border` | `#E2E8F0` | Dividers, card borders |

### Usage rules

* **Coral is the punch word.** Never decoration. If something is
  coral, it's because it's the single most important thing on screen.
* **One coral element per layout.** Two coral elements compete and
  both lose. The brand mark dot doesn't count.
* **Backgrounds rotate across a campaign:** cream `#FAFAFA` →
  slate `#0F172A` → coral `#FF5E47` → white `#FFFFFF`. Pattern reads
  as a sequence, not random.
* **No gradients except on hero punch words.** "Meet **Chedder**.",
  "Show up when shoppers ask **AI**." The coral→amber gradient is the
  ONLY allowed gradient in marketing.
* **No drop shadows except on product mocks.** Marketing surfaces
  are flat.

---

## 3. Typography

### Stack

`-apple-system, BlinkMacSystemFont, 'Inter', 'Helvetica Neue', sans-serif`

Real Inter on web, system fallback otherwise. No web font dependency
for social images (everything is inline SVG).

### Scale

Discrete sizes only. No "medium". Pick one tier per text element.

| Tier | Size | Weight | Tracking | Use |
|---|---|---|---|---|
| **Display XL** | 200-260px | 700 | -0.04em | One-word posters: "60", "50%" |
| **Display L** | 60-80px | 700 | -0.03em | Hero poster headlines: "Show up when shoppers ask AI." |
| **Display M** | 40-52px | 700 | -0.025em | Standard poster headline: "Meet Chedder." |
| **H1** | 36-44px | 700 | -0.025em | In-product hero |
| **H2** | 24-32px | 700 | -0.02em | Section headings |
| **H3** | 18-22px | 600 | -0.01em | Card titles |
| **Eyebrow** | 11-12px | 700 | +0.14em (uppercase) | "LIVE TODAY", "INSIDE AN AUDIT" |
| **Body L** | 16-18px | 500 | -0.01em | Subheads, key body |
| **Body** | 14-15px | 400-500 | -0.005em | Default body text |
| **Body S** | 12-13px | 400-500 | 0 | URL line, footnotes, meta |
| **Caption** | 10-11px | 600-700 | +0.05em | Module labels, footer chips |

### Rules

* **Tracking gets tighter as text gets bigger.** Display sizes feel
  loose without it. Eyebrow size needs positive tracking (letter-
  spacing) because it's all caps.
* **Headlines never wrap mid-thought.** Break lines on phrase
  boundaries. "Show up / when shoppers / ask AI." not "Show up when /
  shoppers ask AI."
* **No two consecutive paragraphs at the same size.** Always step
  down (Display M → Body L → Body S).
* **Coral text only on hero punch words.** Body text is always slate.

---

## 4. Spacing

4/8/12/16/24/32/48/64/96/128 rhythm. Pick from this scale, never an
in-between value.

For 1080×1080 social posters:

| Element | Value |
|---|---|
| Outer padding (all sides) | 48px |
| Brand mark from top-left edge | 48px |
| URL line from bottom-left edge | 48px |
| Headline to subhead | 32px |
| Subhead to character | 48px |
| Eyebrow to headline | 24px |

The 48px outer padding is the *clearspace rule*. Nothing crosses it.

---

## 5. The character

Name: **Chedder**. (The component file is called `Spark` for legacy
reasons. The character is always called Chedder in user-facing copy.)

### Variants

| Variant | When |
|---|---|
| `idle` | Default, ambient. Hero posters, calm states |
| `auditing` | Has the magnifying glass. Loader, "scanning" frames |
| `thinking` | Eyes up-right, pursed mouth. Insight posts, "noticing" frames |
| `celebrating` | Closed-arc eyes, open smile. Success states, CTA frames |
| `error` | X eyes, worried mouth. 404 / errors only |
| `empty` | O-mouth. Empty states |
| `peeking` | Same as idle but framed for partial reveal |
| `resting` | Closed eyes, calm smile. Off-hours, sleep |

### Sizes in social posters

| Use | Pixel size on 1080×1080 |
|---|---|
| Hero (Chedder is the visual) | 220-300px |
| Co-star (next to a headline) | 140-200px |
| Accent (peeking at corner) | 80-120px |
| Mark only (favicon, OG) | 32-64px |

### Rules

* Chedder appears in every campaign poster. **No exceptions.**
* Chedder is **never** the formal brand mark. The mark is the coral
  dot + "Chedder" wordmark. The character is the personality layer.
* Chedder is **never** distorted, rotated more than 8°, or recolored.
  Body stays `#FF5E47`. Always.
* No props beyond the canon set: magnifying glass, clipboard,
  lightbulb, trophy, chart, question mark. Don't invent new ones.

---

## 6. Brand mark + clearspace

The brand mark is a **coral 4-5px dot + "Chedder" wordmark** in Inter
weight 700, tracking -0.025em.

### Variants

* **Full lockup** (dot + wordmark) — default for nav, headers, footers
* **Mark only** (dot) — favicon, social avatar, OG images at small sizes

### Clearspace

The brand mark always sits with at least 32px clear on all sides on
social posters. Nothing else lives in the top-left 96×48 region.

---

## 7. Layout systems for social

### 1080×1080 square

| Region | Owns |
|---|---|
| Top-left 48-200 | Brand mark |
| Center 80-960 wide | Hero content (character + headline) |
| Bottom-left 48 from edge | URL line (Body S, slate-600) |
| Bottom-right (free) | Optional Chedder accent |

### 1080×1350 portrait (LinkedIn-preferred)

Same rules. More vertical real estate for headlines that need to
breathe.

### What NEVER appears

* CTA pills/buttons (URL as plain text is more confident)
* Multiple text columns
* Stat strips (197 brands · 15 categories · 47 signals — pick ONE)
* Speech bubbles (Chedder speaks through the writing, not a comic
  bubble overlay)
* Drop shadows (except on product mocks)
* Decorative lines or dividers
* "Coming soon" badges or version chips

---

## 8. Voice rules

### Banned in user-facing text

* **Separator dashes** (em dash, en dash, hyphen as separator). Use
  periods, commas, colons, middle dot (·). Word-forming hyphens are
  fine ("low-code", "off-the-shelf").
* **Tool names in product UI.** "AI chats" / "AI search" categories
  instead of "ChatGPT" / "Perplexity" in the audit dashboard.
  Marketing copy can name the tools directly (recognition).
* **Marketing breathlessness.** "Revolutionary", "game-changing",
  "supercharge", "transform". Show, don't promise.

### Allowed and encouraged

* **Light cheese theme in copy** (about 1 in 5 strings). The product
  is called Chedder. Lean in occasionally, never always.
* **Magazine-section module names.** "The labels AI reads first" not
  "Schema & Structured Data". "What the web whispers about you" not
  "External Brand Signals".
* **First-person Chedder voice** in loaders, empty states, tooltips:
  "I check 47 signals across..." Reads as a guide, not a system.
* **Specific numbers.** 47 signals, 197 brands, 60 seconds — never
  "many" or "in seconds".

### The Chedder voice rules

* Always first person ("I", "I'll", "I check")
* Helpful, never sycophantic ("Want me to take a look?" not "Great
  question! I'd love to help with that!")
* Owns the work without bragging ("Here's what I found" not "After
  extensive analysis I have determined")
* Never apologizes for being a tool ("That domain didn't respond"
  not "I'm so sorry, I had trouble accessing that domain")

---

## 9. The hook

The single hook for the launch campaign:

> Your AI search problem can be solved in 60 seconds.
> Free audit, 47 signals checked, no signup.

Every campaign asset is allowed to vary the surrounding language
but must carry **two of these three elements verbatim**:

1. **60 seconds** (or "in 60 seconds")
2. **47 signals** (or "checks 47 signals")
3. **Free** (or "first one free")

The fourth element, **no signup**, is the relief beat — use when
there's room.

---

## 10. References

### Reference brands for SaaS launch posts

* **Linear** — restrained typography, generous space, single coral-
  equivalent accent. Look at their changelog posts.
* **Stripe** — confident URL-as-text, minimal CTAs, sequence design.
* **Vercel** — punch-word headlines, plain backgrounds, no decoration.
* **Notion** — character integrated tastefully (their illustrations
  appear once, never twice in the same frame).

### Anti-references

* SaaS landing pages from 2018-2022 with hero-image-plus-five-
  feature-grids. Not us.
* Anything with a gradient that isn't on a single punch word.
* Anything that reads as "AI-generated launch deck".
