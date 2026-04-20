"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuditDashboard } from "@/components/audit-dashboard";
import { track, getDeviceId } from "@/lib/track";
import type { AuditResult } from "@/lib/types";

export function SharedAuditView({ result }: { result: AuditResult }) {
  const router = useRouter();

  // Permalink view event. Fires once on mount — lets us attribute
  // audit opens from shared links (TPT sales emails, social previews,
  // organic word of mouth) back to the device that opened them.
  useEffect(() => {
    getDeviceId();
    track(
      "audit.viewed",
      {
        domain: result.domain,
        overallScore: result.overallScore,
        grade: result.grade,
      },
      { slug: result.slug }
    );
  }, [result.slug, result.domain, result.overallScore, result.grade]);

  return <AuditDashboard result={result} onBack={() => router.push("/")} />;
}
