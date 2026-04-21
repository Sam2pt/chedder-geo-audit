import { NextRequest, NextResponse } from "next/server";
import { saveLead } from "@/lib/leads";
import { saveEvent } from "@/lib/events";
import { notifyNewLead } from "@/lib/email";

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

  const { name, role, company, email, sourceAuditSlug, deviceId } = body as {
    name?: unknown;
    role?: unknown;
    company?: unknown;
    email?: unknown;
    sourceAuditSlug?: unknown;
    deviceId?: unknown;
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

  // Server-side lead.signup event — always fires on a successful save,
  // so our event log captures signups even if the client-side
  // gate.submitted beacon was dropped.
  if (typeof deviceId === "string" && deviceId.length >= 6) {
    await saveEvent({
      deviceId,
      type: "lead.signup",
      leadEmail: result.lead.email,
      slug: result.lead.sourceAuditSlug,
      meta: { role: result.lead.role, company: result.lead.company },
      ua: req.headers.get("user-agent") ?? undefined,
      referrer: req.headers.get("referer") ?? undefined,
    });
  }

  // Fire-and-forget internal notification to sam@twopointtechnologies.com.
  // No-op if RESEND_API_KEY isn't set, so pre-launch deploys stay quiet.
  void notifyNewLead({
    name: result.lead.name,
    email: result.lead.email,
    role: result.lead.role,
    company: result.lead.company,
    sourceAuditSlug: result.lead.sourceAuditSlug,
  });

  return NextResponse.json({ ok: true });
}
