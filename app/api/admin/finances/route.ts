import { NextRequest, NextResponse } from "next/server";
import { getFinancialSnapshot, setAdSpend } from "@/lib/finances";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Financial snapshot endpoint, protected by CHEDDER_ADMIN_TOKEN.
 *
 *   GET  /api/admin/finances?token=…           → JSON snapshot
 *   POST /api/admin/finances?token=…           → update ad spend
 *     body: { period: "today" | "month", usd: number }
 *
 * Same shared-token auth as /admin so anyone with that env var on hand
 * (currently just you) can hit it from a script, the dashboard page,
 * or a curl one-liner.
 */

function isAuthorized(req: NextRequest, token?: string | null): boolean {
  const expected = process.env.CHEDDER_ADMIN_TOKEN;
  if (!expected) return false;
  const supplied =
    token ??
    new URL(req.url).searchParams.get("token") ??
    req.headers.get("x-admin-token");
  return !!supplied && supplied === expected;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const snapshot = await getFinancialSnapshot();
  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  const { period, usd } = body as { period?: string; usd?: number };
  if (period !== "today" && period !== "month") {
    return NextResponse.json(
      { error: "period must be 'today' or 'month'" },
      { status: 400 }
    );
  }
  if (typeof usd !== "number" || !Number.isFinite(usd) || usd < 0) {
    return NextResponse.json(
      { error: "usd must be a non-negative number" },
      { status: 400 }
    );
  }
  await setAdSpend(period, usd);
  const snapshot = await getFinancialSnapshot();
  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
