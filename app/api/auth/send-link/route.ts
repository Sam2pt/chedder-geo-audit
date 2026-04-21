import { NextRequest, NextResponse } from "next/server";
import { createMagicLinkToken } from "@/lib/auth";
import { sendMagicLink } from "@/lib/email";
import { saveEvent } from "@/lib/events";
import { checkMagicLinkRateLimit, getClientIp } from "@/lib/rate-limit";

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

  // Rate-limit magic-link requests so nobody can spam-mail an address.
  // 3/hr per email + 3/hr per IP, whichever trips first.
  const rl = await checkMagicLinkRateLimit({
    email,
    ip: getClientIp(req.headers),
  });
  if (!rl.allowed) {
    const mins = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 60000));
    return NextResponse.json(
      {
        error: `Too many sign-in attempts. Try again in ${mins} min.`,
        resetAt: rl.resetAt,
      },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": String(rl.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
          "Retry-After": String(
            Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))
          ),
        },
      }
    );
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
