import { NextRequest, NextResponse } from "next/server";
import { saveLead } from "@/lib/leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lead capture endpoint for the soft gate. Called when a user wants to
 * run a second audit. First audit is free + anonymous; this captures
 * the name + role + company + email so every returning user becomes a
 * warm TPT inbound lead.
 *
 * No auth yet — this is intentionally a post-only "thanks for your
 * details" endpoint. Future work wraps this in real session auth.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Could not read your details." },
      { status: 400 }
    );
  }

  const { name, role, company, email, sourceAuditSlug } = body as {
    name?: unknown;
    role?: unknown;
    company?: unknown;
    email?: unknown;
    sourceAuditSlug?: unknown;
  };

  // Shape-check (saveLead does deep validation).
  if (typeof name !== "string" || typeof role !== "string" || typeof company !== "string" || typeof email !== "string") {
    return NextResponse.json(
      { error: "Name, role, company, and email are all required." },
      { status: 400 }
    );
  }

  const result = await saveLead({
    name,
    role,
    company,
    email,
    sourceAuditSlug:
      typeof sourceAuditSlug === "string" ? sourceAuditSlug : undefined,
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
