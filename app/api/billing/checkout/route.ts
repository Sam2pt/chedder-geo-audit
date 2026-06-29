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

  // Anonymous checkout is allowed: the audit page's pay-for-more flow
  // sends users straight to Stripe without a signup form, and Stripe
  // Checkout itself collects the email + cardholder name. The webhook
  // then creates the Pro user record from session.customer_email when
  // checkout.session.completed fires. We still resolve the signed-in
  // user when one exists, so returning Free users skip the email
  // prompt and already-Pro users are bounced to the portal instead of
  // duplicate-subscribing themselves.
  const email = await getCurrentUser();
  const user = email ? await getOrMigrateUser(email) : null;

  // Already Pro? Bounce them to the Customer Portal instead so they
  // can manage the existing subscription rather than start a duplicate.
  if (user?.plan === "pro") {
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
      // Three customer paths:
      //   • Existing Stripe customer → use it (avoids duplicate customers)
      //   • Signed-in user without a Stripe customer yet → prefill email
      //   • Anonymous → omit, Stripe collects email during Checkout
      // In subscription mode Stripe ALWAYS auto-creates a Customer when
      // one isn't passed, so we don't need customer_creation: 'always'
      // (which is also payment-mode-only and was rejected previously).
      ...(user?.stripeCustomerId
        ? { customer: user.stripeCustomerId }
        : user?.email
          ? { customer_email: user.email }
          : {}),
      // Stamp the email into client_reference_id when we have one so
      // the webhook can resolve the customer immediately. For anon
      // checkouts this stays undefined and the webhook falls back to
      // session.customer_email (which Stripe populates from the email
      // collected on the Checkout page).
      ...(user?.email ? { client_reference_id: user.email } : {}),
      // Echo the interval back into metadata for analytics / debugging.
      metadata: { plan: "pro", interval },
      subscription_data: {
        metadata: {
          plan: "pro",
          interval,
          // Only stamp email when we know it; anon checkouts get the
          // email through session.customer_email at webhook time.
          ...(user?.email ? { email: user.email } : {}),
        },
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

    // Eager-link the customer if Stripe gave us one synchronously AND
    // we have a known email for the user. Webhook does this too (with
    // the email Stripe collects during anon checkout); doing it here
    // removes the small race window for signed-in flows.
    if (typeof session.customer === "string" && user?.email) {
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
