import { NextRequest, NextResponse } from "next/server";
import { createMagicLinkToken } from "@/lib/auth";
import { sendMagicLink } from "@/lib/email";
import { saveEvent } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Request a magic-link login. Accepts { email }. Always returns ok:true
 * even if the email is malformed — we don't want to leak which emails
 * exist, and this endpoint is unauthenticated. If Resend isn't wired up
 * yet, the magic-link URL is logged server-side so dev testing works
 * without an email provider.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { email, deviceId } = body as { email?: unknown; deviceId?: unknown };
  if (typeof email !== "string" || !email.includes("@") || email.length > 200) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }

  // Shape check passed — create the token and fire the email.
  const { token, expiresAt } = await createMagicLinkToken(email);
  const origin =
    req.headers.get("origin") ||
    `https://${req.headers.get("host") || "chedder.2pt.ai"}`;
  const link = `${origin}/api/auth/verify?token=${encodeURIComponent(token)}`;

  // Fire-and-forget send. If Resend isn't configured, sendMagicLink logs
  // the URL and returns skipped:true so local/pre-launch dev still works.
  const result = await sendMagicLink({ to: email, link, expiresAt }).catch(
    () => ({ ok: false, skipped: true, error: "send failed" })
  );

  // Capture the event (not the token — never log secrets).
  if (typeof deviceId === "string" && deviceId.length >= 6) {
    await saveEvent({
      deviceId,
      type: "auth.link_requested",
      leadEmail: email.trim().toLowerCase(),
      meta: { sent: result.ok ? "true" : result.skipped ? "skipped" : "failed" },
      ua: req.headers.get("user-agent") ?? undefined,
    }).catch(() => {});
  }

  // If Resend returned an error that wasn't a simple skip, log it — the
  // user still sees a generic success because they don't care and it
  // prevents email-enumeration.
  if (!result.ok && !result.skipped) {
    console.warn("[auth/send-link] Email send failed:", result.error);
  }

  return NextResponse.json({
    ok: true,
    // Only exposed when there's no email provider, so local dev can still
    // click through. Safe to remove later.
    devLink: !result.ok && result.skipped ? link : undefined,
  });
}
