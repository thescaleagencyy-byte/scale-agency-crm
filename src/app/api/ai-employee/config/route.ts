// ============================================================
// /api/ai-employee/config
//
//   GET   — current config (any member can view).
//   PATCH — update config. Admin+, same gate as every other
//           settings-class table in this app.
// ============================================================

import { NextResponse } from "next/server";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

const BUSINESS_TYPES = ["restaurant", "clinic", "retail", "services", "general"] as const;

const DEFAULT_CONFIG = {
  enabled: false,
  business_type: "general",
  greeting_message: null,
  policies: null,
};

export async function GET() {
  try {
    const ctx = await requireRole("viewer");

    const { data, error } = await ctx.supabase
      .from("ai_employee_config")
      .select("enabled, business_type, greeting_message, policies")
      .eq("account_id", ctx.accountId)
      .maybeSingle();

    if (error) {
      console.error("[GET /api/ai-employee/config] fetch error:", error);
      return NextResponse.json({ error: "Failed to load AI Employee config" }, { status: 500 });
    }

    return NextResponse.json({ config: data ?? DEFAULT_CONFIG });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireRole("admin");

    const limit = checkRateLimit(`ai-employee:config:${ctx.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as
      | { enabled?: unknown; business_type?: unknown; greeting_message?: unknown; policies?: unknown }
      | null;
    if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    const businessType = typeof body.business_type === "string" && (BUSINESS_TYPES as readonly string[]).includes(body.business_type)
      ? body.business_type
      : "general";

    const { data, error } = await ctx.supabase
      .from("ai_employee_config")
      .upsert(
        {
          account_id: ctx.accountId,
          enabled: Boolean(body.enabled),
          business_type: businessType,
          greeting_message: typeof body.greeting_message === "string" ? body.greeting_message : null,
          policies: typeof body.policies === "string" ? body.policies : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "account_id" },
      )
      .select("enabled, business_type, greeting_message, policies")
      .single();

    if (error) {
      console.error("[PATCH /api/ai-employee/config] upsert error:", error);
      return NextResponse.json({ error: "Failed to save AI Employee config" }, { status: 500 });
    }

    return NextResponse.json({ config: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}
