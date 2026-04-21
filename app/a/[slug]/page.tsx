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
    return { title: { absolute: "Audit not found · Chedder" } };
  }
  // Bare base; the root layout's title template appends " · Chedder".
  // Use `absolute` only on OG/Twitter (social scrapers ignore templates).
  const baseTitle = `${result.domain} · AI Search Visibility`;
  const title = baseTitle;
  const socialTitle = `${baseTitle} · Chedder`;
  const description = `${result.domain} scored ${result.overallScore}/100 (${result.grade}) on Chedder's AI search visibility audit. See how the brand shows up in ChatGPT, Perplexity, and Brave Search.`;
  const permalink = `https://chedder.2pt.ai/a/${slug}`;
  return {
    title,
    description,
    // og:image is auto-wired by the opengraph-image.tsx file in this
    // segment — here we just set the rest of the OG/Twitter metadata so
    // Slack/Twitter/LinkedIn render a rich card.
    alternates: { canonical: permalink },
    openGraph: {
      title: socialTitle,
      description,
      url: permalink,
      siteName: "Chedder",
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
    },
  };
}
