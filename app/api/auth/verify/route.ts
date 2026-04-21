import { NextRequest, NextResponse } from "next/server";
import { consumeMagicLinkToken, createSession, sessionCookieOptions } from "@/lib/auth";
import { saveEvent } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Verify a magic-link token. On success: consume the token, create a
 * session, set the cookie, redirect to /my-audits (or the `next` param
 * if present and safely relative).
 *
 * GET so it can be opened directly from an email link.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";
  const rawNext = url.searchParams.get("next") || "/my-audits";
  // Guard against open-redirect: only allow relative paths starting with "/"
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/my-audits";

  const email = await consumeMagicLinkToken(token);
  if (!email) {
    // Redirect to a friendly error screen, not a raw 400.
    return NextResponse.redirect(
      new URL("/sign-in?error=expired", req.url),
      302
    );
  }

  const { sessionId, expiresAt } = await createSession(
    email,
    req.headers.get("user-agent") ?? undefined
  );

  const res = NextResponse.redirect(new URL(next, req.url), 302);
  const opts = sessionCookieOptions(expiresAt);
  res.cookies.set(opts.name, sessionId, {
    httpOnly: opts.httpOnly,
    secure: opts.secure,
    sameSite: opts.sameSite,
    path: opts.path,
    expires: opts.expires,
  });

  // Capture the signin. Anonymous deviceId isn't available in a GET
  // redirect; just log the email + UA.
  await saveEvent({
    deviceId: "server",
    type: "auth.signed_in",
    leadEmail: email,
    ua: req.headers.get("user-agent") ?? undefined,
  }).catch(() => {});

  return res;
}
