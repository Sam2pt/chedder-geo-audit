# Stripe setup checklist

All the code for Checkout + webhook + Customer Portal is shipped and
sits dormant until these env vars are set. Follow the steps below in
order; nothing is destructive and you can pause at any step.

## 1. Create the Stripe account

Sign up at <https://dashboard.stripe.com/register>. Use the same email
you want to receive payout notifications and webhook alerts at.

After signup you'll land in the dashboard. Make sure the toggle in the
top-right is set to **Test mode** (it reads "Viewing test data" in
yellow). Everything in this checklist happens in test mode — we'll
flip to live mode only once a real charge succeeds end-to-end.

## 2. Create the Pro product + prices

Dashboard → **Catalog → Product catalog → + Add product**.

- **Name:** Chedder Pro
- **Description:** Unlimited audits, competitor compare, PDF export.
- **Tax behavior:** Inclusive (or per your jurisdiction).

Add **two recurring prices** under the same product:

| Price | Amount | Billing period |
|---|---|---|
| Monthly | $29.00 USD | Monthly |
| Yearly  | $290.00 USD | Yearly |

After saving, click each price and copy its `price_…` ID. You'll
paste these in step 4.

## 3. Get your API keys

Dashboard → **Developers → API keys**. Copy:

- `Publishable key` — `pk_test_…` (we don't use this server-side yet,
  but keep it handy in case we add Stripe Elements later)
- `Secret key` — `sk_test_…` — click "Reveal" to see it

## 4. Set Netlify env vars

Netlify dashboard → your site → **Site settings → Environment
variables → Add a variable** (or **Add a single variable**).

Required:

```
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxx
STRIPE_PRICE_ID_PRO_MONTHLY=price_xxxxxxxxxx
STRIPE_PRICE_ID_PRO_YEARLY=price_xxxxxxxxxx
```

Webhook secret comes in step 5 — leave it for now.

Mark all of these as available to **Production** and **Deploy
previews**. After adding, trigger a redeploy so the new env reaches
the function runtime (the simplest way: push any commit, or click
Deploys → Trigger deploy → Deploy site).

## 5. Add the webhook endpoint

Dashboard → **Developers → Webhooks → + Add an endpoint**.

- **Endpoint URL:** `https://chedder.2pt.ai/api/billing/webhook`
- **Listen to:** Events on your account
- **Select events:**
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`

After creating, click into the endpoint and copy the **Signing secret**
(`whsec_…`). Add it to Netlify:

```
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxx
```

Trigger another deploy so the secret is available.

## 6. Activate the Customer Portal

Dashboard → **Settings → Billing → Customer portal**.

Click **Activate test link** at the top. Then in the configuration:

- **Functionality** — enable: Invoice history, Payment method updates,
  Cancel subscriptions, Switch plans.
- **Switch plans → Products** — add Chedder Pro and check both prices
  (monthly + yearly). This lets users move between billing intervals
  without re-checking-out.
- **Cancellation → Cancellation reason** — "Optional" or "Required",
  your call.
- **Business info** — your support email + privacy/terms URLs
  (`https://chedder.2pt.ai/privacy`, `https://chedder.2pt.ai/terms`).

Save.

## 7. Test end-to-end with a Stripe test card

Visit <https://chedder.2pt.ai/pricing>. The Pro CTA should now read
"Start Pro · $29/mo" (or "Manage your subscription" if you're already
Pro). Click it. You'll be redirected to Checkout.

Use the test card `4242 4242 4242 4242`, any future date, any CVC, any
postal code. Complete the payment.

You should land on `/billing/success`. Within a couple of seconds the
webhook fires and flips your User record to `plan: "pro"`. Reload any
page — the padlocks should be gone, and the Pro pill should disappear
from the "Steal their playbook" button.

Also verify:

- Dashboard → Developers → Webhooks → your endpoint → **Recent
  deliveries** shows `checkout.session.completed` with a `200` response.
- Dashboard → Catalog → Customers shows your new customer with the
  Chedder Pro subscription attached.
- Hitting `/api/billing/portal` redirects you to the Stripe-hosted
  portal where you can change interval or cancel.

## 8. Switch to live mode

Once test mode works end-to-end:

1. Toggle the dashboard from Test to **Live mode**.
2. Recreate the product + two prices in live mode (they don't carry
   over from test).
3. Get the **live** API keys + price IDs and replace the test values
   in Netlify env vars (the var names stay the same).
4. Create a new webhook endpoint in live mode with the same events,
   copy the new `whsec_…`, replace the test webhook secret.
5. Activate the Customer Portal in live mode (separate from test).
6. Redeploy.
7. Run one real charge ($29) on your own card to verify the full
   live-mode flow. You can immediately refund it from the dashboard.

## Useful Stripe references

- **Test cards:** <https://docs.stripe.com/testing#cards>
- **Webhook signing:** <https://docs.stripe.com/webhooks/signature>
- **Customer Portal:** <https://docs.stripe.com/customer-management>
- **Stripe CLI (for local webhook testing):**
  `stripe listen --forward-to localhost:3000/api/billing/webhook`

## Code surface area

If you ever need to touch the billing code:

| Concern | File |
|---|---|
| Env config + Stripe client | `lib/stripe.ts` |
| User record + plan helpers | `lib/users.ts` |
| Checkout session creation | `app/api/billing/checkout/route.ts` |
| Webhook (source of truth) | `app/api/billing/webhook/route.ts` |
| Customer Portal redirect | `app/api/billing/portal/route.ts` |
| Pricing page | `app/pricing/page.tsx` + `pricing-ctas.tsx` |
| Upgrade modal | `components/upgrade-modal.tsx` |
| Post-checkout landing | `app/billing/success/page.tsx` |
| Audit gate (server) | `app/api/audit/route.ts` + `audit/stream/route.ts` |
| Audit gate (client) | `app/page.tsx` (402 handler) |
| Competitor compare gate | `components/audit-dashboard.tsx` (AICompetitors) |
