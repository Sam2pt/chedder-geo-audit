import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, WEBHOOK_SECRET } from "@/lib/stripe";
import {
  applyBillingUpdate,
  getUserByStripeCustomerId,
  linkStripeCustomer,
} from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook receiver — the SOURCE OF TRUTH for a user's plan.
 *
 * We deliberately don't trust the success_url query params or the
 * Checkout session redirect to flip the user to Pro; we only trust this
 * endpoint, which:
 *   1. Verifies the signature using STRIPE_WEBHOOK_SECRET
 *   2. Resolves the User (by customer id or email)
 *   3. Applies the patch to the User record in Netlify Blobs
 *
 * Setup:
 *   stripe listen --forward-to localhost:3000/api/billing/webhook   (dev)
 *   Dashboard → Developers → Webhooks → Add endpoint                (prod)
 *     URL:    https://chedder.2pt.ai/api/billing/webhook
 *     Events: checkout.session.completed
 *             customer.subscription.created
 *             customer.subscription.updated
 *             customer.subscription.deleted
 *             invoice.payment_failed
 *
 * Always returns 200 to Stripe unless the signature is bad. Internal
 * errors are logged but don't cause Stripe to retry — we'd rather lose
 * the occasional event and reconcile later than risk infinite retries.
 */

// Stripe requires the raw bytes for signature verification. Next's
// `req.text()` gives us exactly that for application/json bodies.
async function readRawBody(req: NextRequest): Promise<string> {
  return await req.text();
}

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const secret = WEBHOOK_SECRET();
  if (!stripe || !secret) {
    // Don't 500 — Stripe will retry forever. 200 + log.
    console.warn("[billing/webhook] not configured, ignoring event");
    return NextResponse.json({ received: true, configured: false });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json(
      { error: "Missing stripe-signature header." },
      { status: 400 }
    );
  }

  const raw = await readRawBody(req);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Signature check failed";
    console.error("[billing/webhook] sig invalid:", message);
    return NextResponse.json(
      { error: `Invalid signature: ${message}` },
      { status: 400 }
    );
  }

  try {
    await handleEvent(event);
  } catch (e) {
    console.error(
      `[billing/webhook] handler failed for ${event.type}:`,
      e instanceof Error ? e.message : e
    );
    // Still return 200 — see header comment.
  }

  return NextResponse.json({ received: true });
}

async function handleEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      // First completion: link customer→email and (if subscription is
      // immediately active in the session payload) flip plan to pro.
      const session = event.data.object as Stripe.Checkout.Session;
      const email =
        (typeof session.client_reference_id === "string" &&
          session.client_reference_id) ||
        session.customer_email ||
        session.customer_details?.email;
      const customerId =
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id;
      if (!email) {
        console.warn(
          "[billing/webhook] checkout.session.completed with no email"
        );
        return;
      }
      if (customerId) {
        await linkStripeCustomer(email, customerId);
      }
      // Activate immediately so the user doesn't have to wait for the
      // subscription.updated event to fire (it usually does within a
      // second, but the UX win is real).
      await applyBillingUpdate(email, {
        plan: "pro",
        planStatus: "active",
        stripeCustomerId: customerId,
        stripeSubscriptionId:
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id,
      });
      return;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      await syncSubscription(sub);
      return;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const email = await resolveEmailForCustomer(sub.customer);
      if (!email) return;
      await applyBillingUpdate(email, {
        plan: "free",
        planStatus: "canceled",
        stripeSubscriptionId: sub.id,
      });
      return;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const email = await resolveEmailForCustomer(invoice.customer);
      if (!email) return;
      // Don't downgrade yet — Stripe retries the invoice and may
      // recover. Just mark the status so the UI can warn the user.
      await applyBillingUpdate(email, { planStatus: "past_due" });
      return;
    }

    default:
      // Many event types we don't care about. Ignore quietly.
      return;
  }
}

async function syncSubscription(sub: Stripe.Subscription): Promise<void> {
  const email = await resolveEmailForCustomer(sub.customer, sub);
  if (!email) {
    console.warn(`[billing/webhook] could not resolve email for sub ${sub.id}`);
    return;
  }

  // Map Stripe status → our plan + planStatus. Active/trialing = pro
  // entitlement; everything else degrades to free entitlement but we
  // keep the customer id so the user can reactivate via the portal.
  const stripeStatus = sub.status;
  const isEntitled = stripeStatus === "active" || stripeStatus === "trialing";

  // Stripe's TS types lag the API a bit; cast the renew timestamp
  // through a permissive shape.
  const rawRenew =
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    null;
  const planRenewsAt =
    typeof rawRenew === "number"
      ? new Date(rawRenew * 1000).toISOString()
      : undefined;

  await applyBillingUpdate(email, {
    plan: isEntitled ? "pro" : "free",
    planStatus: stripeStatus as
      | "active"
      | "trialing"
      | "past_due"
      | "canceled"
      | "incomplete",
    stripeSubscriptionId: sub.id,
    stripeCustomerId:
      typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    planRenewsAt,
  });
}

/**
 * Resolve the email for a Stripe customer. Tries (in order):
 *   1. The user store reverse index (customer:<id> → email)
 *   2. The subscription's metadata.email (set during Checkout creation)
 *   3. The Stripe Customer object's email field
 */
async function resolveEmailForCustomer(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined,
  sub?: Stripe.Subscription
): Promise<string | null> {
  const customerId =
    typeof customer === "string" ? customer : customer?.id || null;
  if (customerId) {
    const user = await getUserByStripeCustomerId(customerId);
    if (user) return user.email;
  }
  if (sub?.metadata?.email) {
    // metadata.email was set when we created the Checkout session.
    return sub.metadata.email;
  }
  if (customer && typeof customer !== "string" && "email" in customer) {
    return customer.email ?? null;
  }
  // Last resort — fetch the Customer from Stripe to read its email.
  if (customerId) {
    const stripe = getStripe();
    if (!stripe) return null;
    try {
      const cust = await stripe.customers.retrieve(customerId);
      if (!cust.deleted && cust.email) {
        // Backfill the reverse index for next time.
        await linkStripeCustomer(cust.email, customerId);
        return cust.email;
      }
    } catch {
      // ignore
    }
  }
  return null;
}
