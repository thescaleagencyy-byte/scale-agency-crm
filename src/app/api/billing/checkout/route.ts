// ============================================================
// POST /api/billing/checkout
//
//   Owner-only. Starts an upgrade to a paid plan.
//
//   No live Stripe integration yet — the `stripe` package isn't
//   installed and there's no STRIPE_SECRET_KEY. Rather than fake a
//   checkout flow, this returns a clear 501 so the UI can show
//   "billing not connected yet" instead of a silently broken button.
//
//   To wire up real Stripe:
//     1. npm install stripe
//     2. Set STRIPE_SECRET_KEY + STRIPE_PRICE_ID_* env vars
//     3. Replace the 501 block below with:
//          const session = await stripe.checkout.sessions.create({
//            customer: ctx.account... (create/reuse stripe_customer_id),
//            line_items: [{ price: priceId, quantity: 1 }],
//            mode: "subscription",
//            success_url, cancel_url,
//          });
//          return NextResponse.json({ url: session.url });
//     4. Add /api/billing/webhook to handle
//        checkout.session.completed / invoice.paid / etc. and write
//        subscriptions/invoices rows — mirror the HMAC verification
//        pattern in src/lib/whatsapp/webhook-signature.ts.
// ============================================================

import { NextResponse } from "next/server";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

export async function POST() {
  try {
    const ctx = await requireRole("owner");

    const limit = checkRateLimit(
      `billing:checkout:${ctx.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        {
          error:
            "Billing isn't connected yet. Add a Stripe account and STRIPE_SECRET_KEY to enable upgrades.",
        },
        { status: 501 },
      );
    }

    // Unreachable until STRIPE_SECRET_KEY is set — see header comment.
    return NextResponse.json(
      { error: "Stripe integration not implemented" },
      { status: 501 },
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
