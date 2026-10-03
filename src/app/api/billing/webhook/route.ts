// ============================================================
// POST /api/billing/webhook
//
//   Stripe webhook. Verifies the signature (STRIPE_WEBHOOK_SECRET)
//   against the raw body before touching anything — never trust an
//   unsigned POST claiming to be Stripe.
//
//   Handles:
//     - checkout.session.completed — first payment on a new/renewed
//       subscription. Upserts `subscriptions` (plan_name, amount,
//       status, stripe_customer_id, stripe_subscription_id,
//       current_period_end) keyed by the account_id we put in
//       metadata at checkout time, and records a paid `invoices` row.
//     - customer.subscription.updated — plan/status/renewal changes
//       (upgrade, downgrade, past_due, etc). Keyed by
//       stripe_subscription_id since there's no request-time account
//       context on a background Stripe event.
//     - customer.subscription.deleted — subscription cancelled/ended.
//     - invoice.paid — records each renewal as its own invoices row
//       (checkout.session.completed already recorded the first one).
//
//   Runs on the service-role client (src/lib/billing/admin-client.ts)
//   since there's no logged-in user on a webhook — same pattern as
//   every other cron/webhook route in this app.
// ============================================================

import { NextResponse } from "next/server";
import Stripe from "stripe";

import { supabaseAdmin } from "@/lib/billing/admin-client";

function mapStripeStatus(
  status: Stripe.Subscription.Status,
): "trialing" | "active" | "past_due" | "canceled" {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "incomplete":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
    case "paused":
    default:
      return "canceled";
  }
}

function periodEndIso(sub: Stripe.Subscription): string | null {
  const item = sub.items.data[0];
  return item?.current_period_end
    ? new Date(item.current_period_end * 1000).toISOString()
    : null;
}

export async function POST(request: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey || !webhookSecret) {
    // Not configured yet — same "cron not configured" convention as
    // checkCronAuth, fail closed rather than silently 200-ing an
    // unverifiable request.
    return NextResponse.json({ error: "Stripe webhook not configured" }, { status: 503 });
  }

  const stripe = new Stripe(secretKey);
  const signature = request.headers.get("stripe-signature");
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    if (!signature) throw new Error("missing stripe-signature header");
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("[POST /api/billing/webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = supabaseAdmin();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const accountId = session.metadata?.account_id ?? session.client_reference_id;
        const planName = session.metadata?.plan_name;
        if (!accountId || !session.subscription || typeof session.subscription !== "string") {
          console.error("[billing/webhook] checkout.session.completed missing account_id/subscription", session.id);
          break;
        }

        const stripeSub = await stripe.subscriptions.retrieve(session.subscription);
        const amount = (stripeSub.items.data[0]?.price.unit_amount ?? 0) / 100;
        const currency = (stripeSub.items.data[0]?.price.currency ?? "usd").toUpperCase();

        const { data: subRow, error: upsertErr } = await admin
          .from("subscriptions")
          .update({
            plan_name: planName ?? undefined,
            amount,
            currency,
            billing_interval: stripeSub.items.data[0]?.price.recurring?.interval === "year" ? "yearly" : "monthly",
            status: mapStripeStatus(stripeSub.status),
            current_period_end: periodEndIso(stripeSub),
            stripe_customer_id: typeof session.customer === "string" ? session.customer : null,
            stripe_subscription_id: stripeSub.id,
            updated_at: new Date().toISOString(),
          })
          .eq("account_id", accountId)
          .select("id")
          .maybeSingle();

        if (upsertErr || !subRow) {
          console.error("[billing/webhook] subscriptions update failed:", upsertErr);
          break;
        }

        await admin.from("invoices").insert({
          account_id: accountId,
          subscription_id: subRow.id,
          amount,
          currency,
          status: "paid",
          stripe_invoice_id: typeof session.invoice === "string" ? session.invoice : null,
          paid_at: new Date().toISOString(),
        });
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await admin
          .from("subscriptions")
          .update({
            status: mapStripeStatus(sub.status),
            current_period_end: periodEndIso(sub),
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", sub.id);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await admin
          .from("subscriptions")
          .update({ status: "canceled", updated_at: new Date().toISOString() })
          .eq("stripe_subscription_id", sub.id);
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId =
          typeof invoice.parent?.subscription_details?.subscription === "string"
            ? invoice.parent.subscription_details.subscription
            : null;
        // The first invoice per subscription is already recorded by
        // checkout.session.completed above — skip it here so renewals
        // don't collide with that row. Renewal invoices have a
        // billing_reason of 'subscription_cycle', the initial one
        // 'subscription_create'.
        if (invoice.billing_reason !== "subscription_cycle" || !subId) break;

        const { data: subRow } = await admin
          .from("subscriptions")
          .select("id, account_id")
          .eq("stripe_subscription_id", subId)
          .maybeSingle();
        if (!subRow) break;

        await admin.from("invoices").insert({
          account_id: subRow.account_id,
          subscription_id: subRow.id,
          amount: (invoice.amount_paid ?? 0) / 100,
          currency: (invoice.currency ?? "usd").toUpperCase(),
          status: "paid",
          stripe_invoice_id: invoice.id,
          paid_at: new Date().toISOString(),
        });
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error("[POST /api/billing/webhook] handler error:", event.type, err);
    // Still 200 — Stripe retries on non-2xx, and a transient DB error
    // shouldn't trigger Stripe's retry/backoff storm. The event is
    // logged above for manual reconciliation.
  }

  return NextResponse.json({ received: true });
}
