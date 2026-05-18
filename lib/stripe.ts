import Stripe from "stripe";

/**
 * Stripe client + env-config helpers.
 *
 * Env vars (set in Netlify → Site settings → Environment variables):
 *   STRIPE_SECRET_KEY            — sk_test_… or sk_live_…
 *   STRIPE_WEBHOOK_SECRET        — whsec_… (from Developers → Webhooks)
 *   STRIPE_PRICE_ID_PRO_MONTHLY  — price_… for the $29/mo recurring price
 *   STRIPE_PRICE_ID_PRO_YEARLY   — price_… for the $290/yr recurring price
 *
 * Until these are set, getStripe() returns null and the billing routes
 * return 503 with a friendly "Pro is launching soon" message. This lets
 * Pass 1 (gates + padlock + pricing page) stay live in production
 * without exposing a half-wired checkout flow.
 */

let cached: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !key.startsWith("sk_")) return null;
  cached = new Stripe(key, {
    // Pin the API version so a Stripe dashboard upgrade doesn't silently
    // change behavior on our backend. Bump intentionally when needed.
    apiVersion: "2026-04-22.dahlia",
    typescript: true,
  });
  return cached;
}

/** Whether billing is fully configured. Used to short-circuit routes
 *  and to render the right CTA on the pricing page. */
export function isBillingConfigured(): boolean {
  return (
    !!process.env.STRIPE_SECRET_KEY &&
    !!process.env.STRIPE_WEBHOOK_SECRET &&
    !!process.env.STRIPE_PRICE_ID_PRO_MONTHLY
  );
}

export type BillingInterval = "monthly" | "yearly";

export function priceIdFor(interval: BillingInterval): string | null {
  if (interval === "yearly") {
    return process.env.STRIPE_PRICE_ID_PRO_YEARLY || null;
  }
  return process.env.STRIPE_PRICE_ID_PRO_MONTHLY || null;
}

export const WEBHOOK_SECRET = () => process.env.STRIPE_WEBHOOK_SECRET || "";
