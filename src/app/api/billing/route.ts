// ============================================================
// /api/billing
//
//   GET — caller's account subscription + invoice history.
//         Any member can view (matches accounts/brand_config
//         read pattern); only the owner can change plan, via
//         POST /api/billing/checkout.
// ============================================================

import { NextResponse } from "next/server";

import { getCurrentAccount, toErrorResponse } from "@/lib/auth/account";
import { limitsForPlan, UNLIMITED } from "@/lib/billing/plans";
import { countAccountSeats, countMonthlyOutboundMessages } from "@/lib/billing/usage";

export async function GET() {
  try {
    const ctx = await getCurrentAccount();

    const { data: subscription, error: subErr } = await ctx.supabase
      .from("subscriptions")
      .select(
        "plan_name, amount, currency, billing_interval, status, current_period_end",
      )
      .eq("account_id", ctx.accountId)
      .maybeSingle();

    if (subErr) {
      console.error("[GET /api/billing] subscription fetch error:", subErr);
      return NextResponse.json(
        { error: "Failed to load subscription" },
        { status: 500 },
      );
    }

    const { data: invoices, error: invErr } = await ctx.supabase
      .from("invoices")
      .select("id, amount, currency, status, issued_at, paid_at")
      .eq("account_id", ctx.accountId)
      .order("issued_at", { ascending: false })
      .limit(25);

    if (invErr) {
      console.error("[GET /api/billing] invoices fetch error:", invErr);
      return NextResponse.json(
        { error: "Failed to load invoices" },
        { status: 500 },
      );
    }

    const planName = subscription?.plan_name ?? "free";
    const limits = limitsForPlan(planName);

    const [seatsUsed, messagesUsed] = await Promise.all([
      countAccountSeats(ctx.supabase, ctx.accountId).catch(() => null),
      countMonthlyOutboundMessages(ctx.supabase, ctx.accountId).catch(() => null),
    ]);

    return NextResponse.json({
      // No subscription row means this account predates migration 050
      // and the backfill hasn't reached it yet — read as free/unset
      // rather than erroring, same "gracefully degraded" contract as
      // OPENAI_API_KEY being unset for AI features.
      subscription: subscription ?? {
        plan_name: "free",
        amount: 0,
        currency: "USD",
        billing_interval: "monthly",
        status: "active",
        current_period_end: null,
      },
      invoices: invoices ?? [],
      usage: {
        seats: { used: seatsUsed, limit: limits.seats === UNLIMITED ? null : limits.seats },
        messages: { used: messagesUsed, limit: limits.monthlyMessages === UNLIMITED ? null : limits.monthlyMessages },
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
