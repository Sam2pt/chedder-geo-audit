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

export interface Recommendation {
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
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
}
