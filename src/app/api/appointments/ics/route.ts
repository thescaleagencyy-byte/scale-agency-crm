// ============================================================
// GET /api/appointments/ics
//
//   Returns the caller's account ics_feed_token (any member — the
//   Appointments page shows the subscribe URL to anyone who can
//   view the page; only regenerate is admin-gated).
// ============================================================

import { NextResponse } from "next/server";

import { getCurrentAccount, toErrorResponse } from "@/lib/auth/account";

export async function GET() {
  try {
    const ctx = await getCurrentAccount();

    const { data, error } = await ctx.supabase
      .from("accounts")
      .select("ics_feed_token")
      .eq("id", ctx.accountId)
      .single();

    if (error) {
      console.error("[GET /api/appointments/ics] fetch error:", error);
      return NextResponse.json({ error: "Failed to load calendar feed" }, { status: 500 });
    }

    return NextResponse.json({ token: data.ics_feed_token });
  } catch (err) {
    return toErrorResponse(err);
  }
}
