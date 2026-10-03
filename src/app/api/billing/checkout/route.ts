// ============================================================
// POST /api/billing/checkout
//
//   Owner-only. Starts a real Stripe Checkout session for a paid
//   plan (card payment) — the self-serve path for international
//   customers Stripe actually serves well. Pakistani customers
//   mostly use /api/billing/request-upgrade (bank/JazzCash/Easypaisa)
//   instead; this route is additive, not a replacement.
//
//   Requires body `{ plan_name: "starter" | "growth" }`.
//
//   Gracefully degraded exactly like OPENAI_API_KEY/FIRECRAWL_API_KEY
//   elsewhere in this app: missing STRIPE_SECRET_KEY or a missing
//   price-id env var for the requested plan returns a clear 501 so
//   the UI can fall back to "card payment not connected yet"
//   instead of a silently broken button.
// ============================================================

import { NextResponse } from "next/server";
import Stripe from "stripe";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import { STRIPE_PLANS } from "@/lib/billing/plans";

export async function POST(request: Request) {
  try {
    const ctx = await requireRole("owner");

    const limit = checkRateLimit(
      `billing:checkout:${ctx.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as { plan_name?: unknown } | null;
    const planName = body?.plan_name;

    if (typeof planName !== "string" || !(planName in STRIPE_PLANS)) {
      return NextResponse.json(
        { error: `'plan_name' must be one of ${Object.keys(STRIPE_PLANS).join(", ")}` },
        { status: 400 },
      );
    }

    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      return NextResponse.json(
        {
          error:
            "Card payment isn't connected yet. Add a Stripe account and STRIPE_SECRET_KEY to enable it.",
        },
        { status: 501 },
      );
    }

    const plan = STRIPE_PLANS[planName];
    const priceId = process.env[plan.priceEnvVar];
    if (!priceId) {
      return NextResponse.json(
        {
          error: `Card payment for '${planName}' isn't connected yet. Set ${plan.priceEnvVar} in Stripe.`,
        },
        { status: 501 },
      );
    }

    const stripe = new Stripe(secretKey);

    const { data: sub } = await ctx.supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("account_id", ctx.accountId)
      .maybeSingle();

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      // Reuse the Stripe customer if this account has paid before,
      // so Stripe doesn't create a duplicate customer per upgrade.
      customer: sub?.stripe_customer_id ?? undefined,
      // Correlates the webhook back to this account without trusting
      // anything client-supplied — metadata only, never query params.
      client_reference_id: ctx.accountId,
      metadata: { account_id: ctx.accountId, plan_name: planName },
      subscription_data: { metadata: { account_id: ctx.accountId, plan_name: planName } },
      success_url: `${siteUrl}/settings?tab=billing&checkout=success`,
      cancel_url: `${siteUrl}/settings?tab=billing&checkout=cancelled`,
      allow_promotion_codes: true,
    });

    if (!session.url) {
      console.error("[POST /api/billing/checkout] Stripe session created with no url:", session.id);
      return NextResponse.json({ error: "Could not start checkout" }, { status: 502 });
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError) {
      console.error("[POST /api/billing/checkout] Stripe error:", err.message);
      return NextResponse.json({ error: "Could not start checkout" }, { status: 502 });
    }
    return toErrorResponse(err);
  }
}
