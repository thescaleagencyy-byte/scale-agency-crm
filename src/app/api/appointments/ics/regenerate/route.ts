// ============================================================
// POST /api/appointments/ics/regenerate
//
//   Admin+. Rotates the account's ics_feed_token — invalidates
//   any previously subscribed calendar URL immediately.
// ============================================================

import { NextResponse } from "next/server";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

export async function POST() {
  try {
    const ctx = await requireRole("admin");

    const limit = checkRateLimit(`ics:regenerate:${ctx.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const { data, error } = await ctx.supabase.rpc("regenerate_ics_feed_token", {
      p_account_id: ctx.accountId,
    });

    if (error) {
      console.error("[POST /api/appointments/ics/regenerate] rpc error:", error);
      return NextResponse.json({ error: "Failed to regenerate feed link" }, { status: 500 });
    }

    return NextResponse.json({ token: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}
