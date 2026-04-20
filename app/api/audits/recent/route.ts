import { NextRequest, NextResponse } from "next/server";
import { getAuditsForDevice, getAuditsForLead } from "@/lib/audit-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns the audits this user has run, keyed by either their device id
 * (anonymous visitor) or their lead email (signed up). When both are
 * present, we merge and dedupe by slug — the lead list takes precedence
 * since it spans devices.
 *
 * Powers the "your recent audits" dropdown in the dashboard. Not auth-
 * protected yet (part of the "private vessel" evolution) because today
 * the deviceId is itself a secret you need to know.
 */
export async function GET(req: NextRequest) {
  const deviceId = req.nextUrl.searchParams.get("deviceId");
  const leadEmail = req.nextUrl.searchParams.get("leadEmail");

  if (!deviceId && !leadEmail) {
    return NextResponse.json({ audits: [] });
  }

  const [byLead, byDevice] = await Promise.all([
    leadEmail ? getAuditsForLead(leadEmail) : Promise.resolve([]),
    deviceId ? getAuditsForDevice(deviceId) : Promise.resolve([]),
  ]);

  // Merge, lead entries first (they're the authoritative per-user set),
  // then any device-only entries we haven't already seen.
  const seen = new Set<string>();
  const merged: typeof byLead = [];
  for (const entry of [...byLead, ...byDevice]) {
    if (seen.has(entry.slug)) continue;
    seen.add(entry.slug);
    merged.push(entry);
  }
  // Trust the stored order (already newest-first), but cap just in case.
  return NextResponse.json({ audits: merged.slice(0, 50) });
}
