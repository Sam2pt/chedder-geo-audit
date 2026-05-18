import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getOrMigrateUser, FREE_AUDIT_LIMIT } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns the currently signed-in user's email and plan/audit-count
 * summary, or { email: null } for anonymous. The client uses the plan
 * payload to render the padlock states on Pro-gated UI without having
 * to re-derive the rules client-side.
 */
export async function GET() {
  const email = await getCurrentUser();
  if (!email) {
    return NextResponse.json(
      { email: null },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }

  const user = await getOrMigrateUser(email);
  // user might be null if the cookie outlived the lead record (shouldn't
  // happen in practice, but we degrade gracefully — anonymous-shaped).
  if (!user) {
    return NextResponse.json(
      { email, plan: "free", auditsUsed: 0, auditsRemaining: FREE_AUDIT_LIMIT },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }

  const auditsRemaining =
    user.plan === "pro" ? null : Math.max(0, FREE_AUDIT_LIMIT - user.auditsUsed);

  return NextResponse.json(
    {
      email: user.email,
      name: user.name,
      company: user.company,
      plan: user.plan,
      planStatus: user.planStatus ?? null,
      auditsUsed: user.auditsUsed,
      auditsRemaining,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
