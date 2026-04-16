import { notFound } from "next/navigation";
import { getAudit, getBenchmarks, getDomainHistory } from "@/lib/audit-store";
import { SharedAuditView } from "./shared-audit-view";

export const dynamic = "force-dynamic";

export default async function SharedAuditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await getAudit(slug);
  if (!result) notFound();

  // Refresh benchmarks + history on load so the percentile/timeline is accurate
  // even when the audit was saved before many others came in.
  const [benchmarks, history] = await Promise.all([
    getBenchmarks(result),
    getDomainHistory(result.domain, slug),
  ]);

  const enriched = { ...result, slug, benchmarks, history };

  return <SharedAuditView result={enriched} />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await getAudit(slug);
  if (!result) {
    return { title: "Audit not found · Chedder" };
  }
  return {
    title: `${result.domain} — GEO Audit · Chedder`,
    description: `${result.domain} scored ${result.overallScore}/100 (${result.grade}) on Chedder's Generative Engine Optimization audit.`,
  };
}
