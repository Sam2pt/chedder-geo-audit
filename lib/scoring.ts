import { ModuleResult, Recommendation } from "./types";

export function calculateOverallScore(modules: ModuleResult[]): number {
  const weights: Record<string, number> = {
    schema: 0.2,
    meta: 0.1,
    content: 0.2,
    technical: 0.15,
    authority: 0.1,
    external: 0.25,
  };

  let totalWeight = 0;
  let weightedSum = 0;

  for (const mod of modules) {
    const weight = weights[mod.slug] || 0.2;
    weightedSum += mod.score * weight;
    totalWeight += weight;
  }

  return Math.round(weightedSum / totalWeight);
}

export function getGrade(score: number): string {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B+";
  if (score >= 60) return "B";
  if (score >= 50) return "C+";
  if (score >= 40) return "C";
  if (score >= 30) return "D";
  return "F";
}

export function getTopRecommendations(
  modules: ModuleResult[]
): Recommendation[] {
  const all: Recommendation[] = [];
  for (const mod of modules) {
    all.push(...mod.recommendations);
  }

  const priorityOrder = { high: 0, medium: 1, low: 2 };
  all.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return all.slice(0, 8);
}
