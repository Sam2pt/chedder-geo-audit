import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { destroySession, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Log out: destroy the server-side session record and clear the cookie.
 * POST so browsers don't follow links / prefetch it.
 */
export async function POST(_req: NextRequest) {
  const cookieStore = await cookies();
  const c = cookieStore.get(SESSION_COOKIE);
  if (c?.value) {
    await destroySession(c.value).catch(() => {});
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
  return res;
}
