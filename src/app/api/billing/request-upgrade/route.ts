// ============================================================
// POST /api/billing/request-upgrade
//
//   Owner-only. Creates a pending invoice for a plan upgrade paid
//   by bank transfer / JazzCash / Easypaisa (see
//   /api/billing/payment-instructions) rather than Stripe — the
//   real payment path for local customers today.
//
//   No fixed self-serve pricing exists yet (Umer prices deals
//   individually), so `amount` is left at 0/pending — this creates
//   a reference record for a manual conversation, not an automated
//   charge. Umer marks it paid (and updates the account's
//   subscription) via the Supabase table editor for now; a proper
//   cross-account admin view is a separate, bigger feature.
// ============================================================

import { NextResponse } from "next/server";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import { PLAN_LIMITS } from "@/lib/billing/plans";

const UPGRADE_PLANS = Object.keys(PLAN_LIMITS).filter((p) => p !== "free");

export async function POST(request: Request) {
  try {
    const ctx = await requireRole("owner");

    const limit = checkRateLimit(`billing:requestUpgrade:${ctx.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as { plan_name?: unknown } | null;
    const planName = body?.plan_name;

    if (typeof planName !== "string" || !UPGRADE_PLANS.includes(planName)) {
      return NextResponse.json(
        { error: `'plan_name' must be one of ${UPGRADE_PLANS.join(", ")}` },
        { status: 400 },
      );
    }

    const { data: sub } = await ctx.supabase
      .from("subscriptions")
      .select("id, currency")
      .eq("account_id", ctx.accountId)
      .maybeSingle();

    const { data, error } = await ctx.supabase
      .from("invoices")
      .insert({
        account_id: ctx.accountId,
        subscription_id: sub?.id ?? null,
        amount: 0,
        currency: sub?.currency ?? "USD",
        status: "pending",
      })
      .select("id, status, issued_at")
      .single();

    if (error || !data) {
      console.error("[POST /api/billing/request-upgrade] insert error:", error);
      return NextResponse.json({ error: "Failed to create upgrade request" }, { status: 500 });
    }

    return NextResponse.json(
      {
        invoice: data,
        // Short, human-shareable reference for a bank transfer memo /
        // JazzCash payment note, and for Umer to find the row.
        reference: `INV-${data.id.slice(0, 8).toUpperCase()}`,
        requestedPlan: planName,
      },
      { status: 201 },
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
