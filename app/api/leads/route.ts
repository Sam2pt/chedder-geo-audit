import { NextRequest, NextResponse } from "next/server";
import { saveLead } from "@/lib/leads";
import { saveEvent } from "@/lib/events";
import { notifyNewLead, sendMagicLink } from "@/lib/email";
import {
  createMagicLinkToken,
  createSession,
  sessionCookieOptions,
} from "@/lib/auth";

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

  // Creating a session here is safe: the user just typed this email into
  // the form on our page, so they control it (or at least this browser
  // does). It spares them a round trip through a magic-link email for
  // the immediate next audit. We still email them a magic link for
  // future sign-ins from other devices.
  const { sessionId, expiresAt } = await createSession(
    result.lead.email,
    req.headers.get("user-agent") ?? undefined
  );

  // Fire off a magic-link email too, so the user has a bookmarkable
  // way to come back from another device. No-op if Resend isn't set.
  void (async () => {
    try {
      const { token, expiresAt: linkExpiresAt } = await createMagicLinkToken(
        result.lead.email
      );
      const origin =
        req.headers.get("origin") ||
        `https://${req.headers.get("host") || "chedder.2pt.ai"}`;
      const link = `${origin}/api/auth/verify?token=${encodeURIComponent(token)}`;
      await sendMagicLink({
        to: result.lead.email,
        link,
        expiresAt: linkExpiresAt,
      });
    } catch (e) {
      console.warn("[leads] magic-link send failed:", e);
    }
  })();

  const res = NextResponse.json({ ok: true, signedIn: true });
  const opts = sessionCookieOptions(expiresAt);
  res.cookies.set(opts.name, sessionId, {
    httpOnly: opts.httpOnly,
    secure: opts.secure,
    sameSite: opts.sameSite,
    path: opts.path,
    expires: opts.expires,
  });
  return res;
}
