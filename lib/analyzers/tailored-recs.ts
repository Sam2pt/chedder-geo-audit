import type { ModuleResult, Recommendation } from "../types";

/**
 * LLM-generated recommendations that are specific to the brand's
 * category. Generic advice ("add FAQ schema") lands the same for a
 * chocolate brand and a mattress brand; this helper turns it into
 * "add FAQ schema covering cacao percentages, gluten-free status, and
 * sourcing" for chocolate, or "…mattress firmness, trial period,
 * return policy" for mattresses.
 *
 * Returns 1-2 high-priority recs to merge into topRecommendations.
 * Silent empty return on any API failure — the generic recs still
 * land.
 *
 * Cost: one gpt-4o-mini call per audit, ~$0.0001 at typical response
 * length. Runs in parallel with other finalization steps.
 */
export async function generateCategoryRecommendationsLLM(
  brand: string,
  category: string | null,
  modules: ModuleResult[]
): Promise<Recommendation[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !category) return [];

  // Snapshot of what's failing or weak, trimmed for the prompt.
  const weakFindings: Array<{ module: string; label: string; detail: string }> = [];
  for (const m of modules) {
    for (const f of m.findings) {
      if (f.status === "fail" || f.status === "warn") {
        weakFindings.push({
          module: m.name,
          label: f.label,
          detail: f.detail.slice(0, 160),
        });
      }
    }
  }
  if (weakFindings.length === 0) return [];

  const systemPrompt = `You write specific, category-tailored AI visibility recommendations for consumer brands. Given a brand, its product category, and a list of things its Chedder audit flagged as weak, propose ONE or TWO recommendations that are unmistakably specific to the category — NOT generic ("add FAQ schema") but concrete ("add FAQ schema covering the three questions shoppers always ask about dark chocolate: cacao %, allergens, sourcing").

Each recommendation must:
- Be actionable in a few hours of work by a small marketing team
- Reference things unique to this category (specific ingredients, specs, use cases, regulatory considerations, shopper anxieties)
- Fit naturally alongside generic recs — don't duplicate them, enrich them
- Avoid naming the brand in the description (describe the action, not the actor)

Tone: warm, specific, practical. No jargon. No separator dashes (use commas or periods).

Return JSON in EXACTLY this shape:
{
  "recommendations": [
    {
      "priority": "high" | "medium",
      "title": "<short imperative title, 4-8 words>",
      "description": "<2-3 sentences, concrete, specific to the category>"
    }
  ]
}

If the findings don't suggest a strong category-specific win, return "recommendations": [].`;

  const findingsList = weakFindings
    .slice(0, 10)
    .map((f) => `- [${f.module}] ${f.label}: ${f.detail}`)
    .join("\n");

  const userPrompt = `BRAND: ${brand}
CATEGORY: ${category}

WEAK AUDIT FINDINGS:
${findingsList}`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        max_tokens: 500,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.warn(
        `[tailored-recs] HTTP ${res.status} ${res.statusText}`
      );
      return [];
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as {
      recommendations?: Array<{
        priority?: string;
        title?: string;
        description?: string;
      }>;
    };
    const out: Recommendation[] = [];
    for (const r of parsed.recommendations ?? []) {
      if (typeof r.title !== "string" || typeof r.description !== "string") continue;
      const priority: Recommendation["priority"] =
        r.priority === "high" ? "high" : "medium";
      const title = r.title.trim().slice(0, 80);
      const description = r.description.trim().slice(0, 600);
      if (title.length < 5 || description.length < 20) continue;
      if (title.toLowerCase().includes(brand.toLowerCase())) continue;
      out.push({ priority, title, description });
      if (out.length >= 2) break;
    }
    return out;
  } catch (e) {
    console.warn(
      "[tailored-recs] error:",
      e instanceof Error ? e.message : e
    );
    return [];
  }
}
