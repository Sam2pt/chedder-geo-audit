export interface Finding {
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  /** Optional quoted excerpt (e.g., from an AI response). Rendered as a highlighted quote in the UI. */
  excerpt?: string;
  /** Optional brand name to highlight (bold) within the excerpt. */
  highlight?: string;
  /** Optional citation URL shown under the excerpt (e.g., Perplexity source). */
  sourceUrl?: string;
}

export type SnippetLanguage = "json" | "html" | "txt" | "markdown" | "bash";

export interface Recommendation {
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
  /** Optional copy-pasteable fix snippet shown in the Action Plan. */
  fixSnippet?: string;
  /** Language for syntax highlighting / file type hint. */
  language?: SnippetLanguage;
  /** Optional filename / placement hint shown above the snippet (e.g. "Add to <head>"). */
  snippetTarget?: string;
}

export interface ModuleResult {
  name: string;
  slug: string;
  score: number; // 0-100
  icon: string;
  description: string;
  findings: Finding[];
  recommendations: Recommendation[];
}

export interface AICompetitor {
  domain: string;
  mentions: number; // how many of our queries surfaced this domain
  queries: string[]; // sample queries where it appeared
}

/**
 * Aggregate stats for a given module slug, computed from all stored audits.
 * Allows us to show "you're in the top X%" style context.
 */
export interface BenchmarkStats {
  /** Number of audits that contributed */
  count: number;
  median: number;
  p25: number;
  p75: number;
  p90: number;
}

export interface BenchmarkData {
  /** Per-module percentile/median stats, keyed by module slug. */
  modules: Record<string, BenchmarkStats>;
  /** Overall score stats across all audits. */
  overall: BenchmarkStats;
  /** The audit's own percentile rank (0-100) among stored audits. */
  yourPercentile?: number;
}

/**
 * A compact history entry summarizing a past audit for trend display.
 * Full audits are stored separately under their slug.
 */
export interface HistoryEntry {
  slug: string;
  timestamp: string;
  overallScore: number;
  moduleScores: Record<string, number>;
}

export interface AuditResult {
  url: string;
  domain: string;
  overallScore: number;
  grade: string;
  modules: ModuleResult[];
  topRecommendations: Recommendation[];
  pagesAudited: string[];
  timestamp: string;
  competitors?: AuditResult[];
  aiCompetitors?: AICompetitor[];
  /** Short slug for shareable URL /a/[slug] — set after persistence. */
  slug?: string;
  /** Benchmark context populated when the audit is saved. */
  benchmarks?: BenchmarkData;
  /** Past audits of the same domain, most recent first (excluding this one). */
  history?: HistoryEntry[];
  /** Persistent per-browser identifier captured at audit time. Lets us
   *  stitch a user's activity together and power the "your recent audits"
   *  view without needing full auth yet. */
  deviceId?: string;
  /** Lead email when the audit was run by someone who has crossed the
   *  soft gate. Optional — first audits are anonymous. */
  leadEmail?: string;
}
