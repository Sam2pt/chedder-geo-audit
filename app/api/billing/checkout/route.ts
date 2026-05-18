import { NextRequest, NextResponse } from "next/server";
import {
  getStripe,
  isBillingConfigured,
  priceIdFor,
  type BillingInterval,
} from "@/lib/stripe";
import { getCurrentUser } from "@/lib/auth";
import { getOrMigrateUser, linkStripeCustomer } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Create a Stripe Checkout session and return its URL.
 *
 * POST /api/billing/checkout
 *   body: { interval: "monthly" | "yearly" }
 *   200: { url: "https://checkout.stripe.com/..." }
 *   401: not signed in
 *   503: billing not configured yet (env vars missing)
 *
 * The client redirects window.location.href = url. We don't redirect
 * here because the browser would lose POST semantics on a third-party
 * redirect.
 *
 * Success flow:
 *   1. User clicks "Upgrade to Pro" on /pricing or in upgrade modal
 *   2. Client POSTs here, receives Checkout URL, redirects
 *   3. User completes payment on Stripe-hosted page
 *   4. Stripe redirects back to /billing/success?session_id=...
 *   5. Meanwhile, Stripe sends a webhook to /api/billing/webhook which
 *      flips the User's plan to "pro" — that's the source of truth.
 *      /billing/success just renders a thank-you; it doesn't trust the
 *      session_id query param for entitlement.
 */
export async function POST(req: NextRequest) {
  if (!isBillingConfigured()) {
    return NextResponse.json(
      {
        error: "Billing isn't switched on yet. We'll email you when Pro launches.",
        code: "billing_not_configured",
      },
      { status: 503 }
    );
  }

  const email = await getCurrentUser();
  if (!email) {
    return NextResponse.json(
      { error: "Sign in first.", code: "not_authenticated" },
      { status: 401 }
    );
  }

  const user = await getOrMigrateUser(email);
  if (!user) {
    return NextResponse.json(
      { error: "Account not found. Sign in again." },
      { status: 401 }
    );
  }

  // Already Pro? Bounce them to the Customer Portal instead so they
  // can manage the existing subscription rather than start a duplicate.
  if (user.plan === "pro") {
    return NextResponse.json(
      {
        error: "You're already on Pro. Use the billing portal to change plan.",
        code: "already_pro",
        manageUrl: "/api/billing/portal",
      },
      { status: 409 }
    );
  }

  let interval: BillingInterval = "monthly";
  try {
    const body = await req.json();
    if (body?.interval === "yearly") interval = "yearly";
  } catch {
    // Default to monthly on missing/invalid body.
  }

  const priceId = priceIdFor(interval);
  if (!priceId) {
    return NextResponse.json(
      {
        error: `No ${interval} price configured. Set STRIPE_PRICE_ID_PRO_${interval.toUpperCase()} env var.`,
        code: "missing_price_id",
      },
      { status: 503 }
    );
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe client unavailable." },
      { status: 503 }
    );
  }

  // Origin used for redirect URLs — falls back to the canonical host if
  // the Origin header is missing (uncommon but happens on some clients).
  const origin =
    req.headers.get("origin") ||
    `https://${req.headers.get("host") || "chedder.2pt.ai"}`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      // Use existing customer if we already have one; otherwise Stripe
      // creates a new Customer and the webhook will link it back.
      ...(user.stripeCustomerId
        ? { customer: user.stripeCustomerId }
        : {
            customer_email: user.email,
            // Persist email-on-customer so the webhook can fall back to
            // lookup-by-email when the reverse index hasn't been
            // populated yet (e.g. race against checkout.session.completed).
            customer_creation: "always",
          }),
      // Stamp the user's email into client_reference_id so we can
      // resolve the customer even when the webhook arrives before we've
      // had a chance to write the reverse index. Belt + suspenders.
      client_reference_id: user.email,
      // Echo the interval back into metadata for analytics / debugging.
      metadata: { plan: "pro", interval },
      subscription_data: {
        metadata: { plan: "pro", interval, email: user.email },
      },
      // Where the browser lands after success / cancel.
      success_url: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing?canceled=1`,
      // Let Stripe collect the tax / postal code where required (US,
      // UK, EU). Avoids surprise tax-invoice errors later.
      automatic_tax: { enabled: true },
      billing_address_collection: "auto",
      allow_promotion_codes: true,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe didn't return a Checkout URL." },
        { status: 500 }
      );
    }

    // Eager-link the customer if Stripe gave us one synchronously
    // (typical for sessions with `customer` set). Webhook does this too;
    // doing it here removes the small race window.
    if (typeof session.customer === "string") {
      void linkStripeCustomer(user.email, session.customer);
    }

    return NextResponse.json({ url: session.url });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown Stripe error";
    console.error("[billing/checkout] failed:", message);
    return NextResponse.json(
      { error: `Could not start checkout: ${message}` },
      { status: 500 }
    );
  }
}
