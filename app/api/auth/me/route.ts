import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns the currently signed-in user's email, or null.
 * Called by the client-side nav to decide between "Sign in" and
 * "My audits".
 */
export async function GET() {
  const email = await getCurrentUser();
  return NextResponse.json(
    { email },
    {
      headers: {
        // Never cached — the answer depends on the request's cookies.
        "Cache-Control": "private, no-store",
      },
    }
  );
}
