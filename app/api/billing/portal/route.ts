import { NextRequest, NextResponse } from "next/server";
import { getStripe, isBillingConfigured } from "@/lib/stripe";
import { getCurrentUser } from "@/lib/auth";
import { getOrMigrateUser } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Create a Stripe Customer Portal session and redirect the user there.
 *
 * GET  /api/billing/portal  → 302 to portal (or 302 to /pricing if not Pro)
 * POST /api/billing/portal  → { url } JSON for client-side redirect
 *
 * The portal lets users update card details, change interval, download
 * invoices, and cancel. Stripe handles everything; we just hand off.
 *
 * Activate the portal config once in Stripe Dashboard:
 *   Settings → Billing → Customer portal → Activate
 * Then enable "Customers can switch plans" with the Pro monthly + yearly
 * prices so up/downgrade between billing intervals works.
 */
async function createSession(
  req: NextRequest
): Promise<NextResponse | { url: string }> {
  if (!isBillingConfigured()) {
    return NextResponse.json(
      { error: "Billing isn't switched on yet." },
      { status: 503 }
    );
  }

  const email = await getCurrentUser();
  if (!email) {
    return NextResponse.json(
      { error: "Sign in first." },
      { status: 401 }
    );
  }

  const user = await getOrMigrateUser(email);
  if (!user?.stripeCustomerId) {
    // No customer record yet — they haven't checked out. Send them to
    // pricing so they can subscribe instead of staring at an error.
    return NextResponse.json(
      {
        error: "No subscription found. Subscribe first.",
        redirect: "/pricing",
      },
      { status: 404 }
    );
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe client unavailable." },
      { status: 503 }
    );
  }

  const origin =
    req.headers.get("origin") ||
    `https://${req.headers.get("host") || "chedder.2pt.ai"}`;

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${origin}/my-audits`,
    });
    return { url: session.url };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown Stripe error";
    console.error("[billing/portal] failed:", message);
    return NextResponse.json(
      { error: `Could not open billing portal: ${message}` },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const result = await createSession(req);
  if (result instanceof NextResponse) return result;
  return NextResponse.redirect(result.url, { status: 303 });
}

export async function POST(req: NextRequest) {
  const result = await createSession(req);
  if (result instanceof NextResponse) return result;
  return NextResponse.json(result);
}
