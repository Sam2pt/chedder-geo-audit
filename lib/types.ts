export interface Finding {
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
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
}
