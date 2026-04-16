"use client";

import { useRouter } from "next/navigation";
import { AuditDashboard } from "@/components/audit-dashboard";
import type { AuditResult } from "@/lib/types";

export function SharedAuditView({ result }: { result: AuditResult }) {
  const router = useRouter();
  return (
    <AuditDashboard
      result={result}
      onBack={() => router.push("/")}
    />
  );
}
