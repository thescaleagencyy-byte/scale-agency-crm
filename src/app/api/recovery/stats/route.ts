// ============================================================
// GET /api/recovery/stats
//
//   This calendar month's recovery numbers for the dashboard
//   widget: conversations recovered + total value recovered.
//   Any member can view.
// ============================================================

import { NextResponse } from "next/server";

import { getCurrentAccount, toErrorResponse } from "@/lib/auth/account";

export async function GET() {
  try {
    const ctx = await getCurrentAccount();

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data, error } = await ctx.supabase
      .from("recovery_attempts")
      .select("recovered_at, recovered_value")
      .eq("account_id", ctx.accountId)
      .not("recovered_at", "is", null)
      .gte("recovered_at", startOfMonth.toISOString());

    if (error) {
      console.error("[GET /api/recovery/stats] fetch error:", error);
      return NextResponse.json({ error: "Failed to load recovery stats" }, { status: 500 });
    }

    const rows = data ?? [];
    const totalValue = rows.reduce((sum, r) => sum + (r.recovered_value ?? 0), 0);

    return NextResponse.json({
      recoveredCount: rows.length,
      recoveredValue: totalValue,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
