import { NextRequest, NextResponse } from "next/server";
import { saveEvent } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Event capture endpoint. Called fire-and-forget from the client via
 * navigator.sendBeacon or fetch, and also from server-side flows that
 * want to record a behavioral signal (audit started/completed, etc).
 *
 * Intentionally tolerant — we never want a failing capture to break the
 * action that triggered it. A malformed payload still returns 200 so
 * client code can treat this as best-effort.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    // Fire and forget — don't penalize clients for flushing on unload.
    return NextResponse.json({ ok: true });
  }

  const { deviceId, type, slug, leadEmail, meta } = body as {
    deviceId?: unknown;
    type?: unknown;
    slug?: unknown;
    leadEmail?: unknown;
    meta?: unknown;
  };

  if (typeof deviceId !== "string" || typeof type !== "string") {
    // Silent discard — again, best-effort.
    return NextResponse.json({ ok: true });
  }

  await saveEvent({
    deviceId,
    type,
    slug: typeof slug === "string" ? slug : undefined,
    leadEmail: typeof leadEmail === "string" ? leadEmail : undefined,
    meta:
      meta && typeof meta === "object" && !Array.isArray(meta)
        ? (meta as Record<string, string | number | boolean | null>)
        : undefined,
    ua: req.headers.get("user-agent") ?? undefined,
    referrer: req.headers.get("referer") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
