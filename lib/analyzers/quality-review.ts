/**
 * Final LLM quality-review pass for an audit result.
 *
 * Runs after all analyzers complete, before we emit `done` to the user.
 * Catches the classes of problems we saw during dogfood but haven't hand-
 * patched into blocklists yet:
 *   - Publishers leaking into competitors (e.g. sporked.com for canned water)
 *   - Category-word resolutions (e.g. alkaline.com for "alkaline water")
 *   - Duplicate domains pointing at the same brand (nectar.com vs nectarsleep.com)
 *   - Wildly miscategorized brands (Glossier → "skincare" when it's makeup)
 *
 * The review calls gpt-4o-mini once with the brand/category/competitors
 * and gets a structured verdict we can apply before showing results.
 *
 * Cost: ~$0.0002 per audit. Latency: ~1–2s.
 */

import type { AICompetitor } from "../types";

export interface QualityReview {
  /** Kept competitors, in original order, with any suggested canonical domain. */
  competitors: AICompetitor[];
  /** Suggested category, if the LLM thinks the inferred one was wrong. */
  suggestedCategory?: string;
  /** Domains the LLM dropped and why (for debug/telemetry). */
  dropped: Array<{ domain: string; reason: string }>;
}

interface ReviewVerdict {
  category_correct: boolean;
  suggested_category?: string | null;
  competitors: Array<{
    domain: string;
    keep: boolean;
    reason?: string | null;
    /** If this is a duplicate of another competitor, the canonical one. */
    merge_into?: string | null;
  }>;
}

export async function reviewAuditQuality(
  brand: string,
  ownDomain: string,
  category: string | null,
  competitors: AICompetitor[]
): Promise<QualityReview> {
  const apiKey = process.env.OPENAI_API_KEY;
  // No key or nothing to review → pass through unchanged.
  if (!apiKey || competitors.length === 0) {
    return { competitors, dropped: [] };
  }

  const competitorLines = competitors
    .map((c) => `- ${c.domain} (seen in ${c.mentions} engine${c.mentions === 1 ? "" : "s"})`)
    .join("\n");

  const systemPrompt = `You are reviewing the results of an AI search-visibility audit for a direct-to-consumer (DTC) brand before they are shown to a non-technical customer. Your job is quality control: for each competitor the audit surfaced, decide whether it's actually a credible competing consumer brand in the stated category — not a publisher, not a retailer, not a generic category word, not a duplicate of a domain already in the list.

Rules:
- keep: true only if it is a real, recognizable consumer product brand that genuinely competes with the target brand in the stated category.
- keep: false if the domain is a publisher/review site (e.g. Wirecutter, Good Housekeeping, Sporked), a retailer (Amazon, Target, Walmart, Chewy), a generic category word that got misresolved (alkaline.com for "alkaline water"), a VC/news/jobs site, or a domain you don't recognize as a real brand.
- If two domains represent the same brand (e.g. "nectar.com" + "nectarsleep.com" are the same sleep brand), mark the less-canonical one with merge_into pointing at the canonical domain.
- If the audit's category is wildly wrong for the target brand, set category_correct=false and provide a suggested_category (2–5 words).

Return ONLY a JSON object with this exact shape:
{
  "category_correct": true,
  "suggested_category": null,
  "competitors": [
    { "domain": "...", "keep": true, "reason": null, "merge_into": null },
    ...
  ]
}`;

  const userPrompt = `TARGET BRAND: ${brand} (${ownDomain})
AUDIT-INFERRED CATEGORY: ${category || "(none inferred)"}

COMPETITORS SURFACED BY THE AUDIT:
${competitorLines}

Review each competitor against the rules. Return the JSON verdict.`;

  let verdict: ReviewVerdict | null = null;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 800,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      console.warn(
        `[quality-review] HTTP ${res.status} ${res.statusText} — passing through unchanged`
      );
      return { competitors, dropped: [] };
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content ?? "{}";
    verdict = JSON.parse(raw) as ReviewVerdict;
  } catch (e) {
    console.warn(
      "[quality-review] error:",
      e instanceof Error ? e.message : e
    );
    return { competitors, dropped: [] };
  }

  if (!verdict || !Array.isArray(verdict.competitors)) {
    return { competitors, dropped: [] };
  }

  // Index the verdict by domain for O(1) lookup.
  const byDomain = new Map<
    string,
    { keep: boolean; reason?: string | null; merge_into?: string | null }
  >();
  for (const c of verdict.competitors) {
    if (!c.domain) continue;
    byDomain.set(c.domain.toLowerCase(), {
      keep: !!c.keep,
      reason: c.reason ?? null,
      merge_into: c.merge_into ?? null,
    });
  }

  // Apply the verdict. Preserve original order so the highest-confidence
  // cross-engine candidates stay on top.
  const kept: AICompetitor[] = [];
  const dropped: Array<{ domain: string; reason: string }> = [];
  const mergedInto = new Set<string>();

  for (const comp of competitors) {
    const v = byDomain.get(comp.domain.toLowerCase());
    // Missing verdict entry → err on the side of keeping (don't silently
    // nuke things the LLM forgot to respond about).
    if (!v) {
      kept.push(comp);
      continue;
    }
    if (!v.keep) {
      dropped.push({
        domain: comp.domain,
        reason: v.reason || "dropped by quality review",
      });
      continue;
    }
    if (v.merge_into && v.merge_into !== comp.domain) {
      // This competitor is a duplicate of another one. Drop this entry;
      // the canonical record will keep its engines count as-is. (We could
      // merge engine counts, but that would require a second pass and
      // tends to over-inflate — cross-engine gate already filtered noise.)
      mergedInto.add(v.merge_into.toLowerCase());
      dropped.push({
        domain: comp.domain,
        reason: `merged into ${v.merge_into}`,
      });
      continue;
    }
    kept.push(comp);
  }

  const suggestedCategory =
    verdict.category_correct === false && verdict.suggested_category
      ? verdict.suggested_category.trim().toLowerCase().slice(0, 60)
      : undefined;

  return { competitors: kept, suggestedCategory, dropped };
}
