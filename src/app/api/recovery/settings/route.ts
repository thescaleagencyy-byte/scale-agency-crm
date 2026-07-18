// ============================================================
// /api/recovery/settings
//
//   GET   — current settings + this account's approved templates
//           (any member can view).
//   PATCH — update settings. Admin+ (settings-class table, same
//           gate as brand config / webhooks).
// ============================================================

import { NextResponse } from "next/server";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

export async function GET() {
  try {
    const ctx = await requireRole("viewer");

    const [{ data: settings, error: settingsErr }, { data: templates, error: templatesErr }] = await Promise.all([
      ctx.supabase
        .from("recovery_settings")
        .select("enabled, idle_days, template_name, template_language")
        .eq("account_id", ctx.accountId)
        .maybeSingle(),
      ctx.supabase
        .from("message_templates")
        .select("name, language")
        .eq("account_id", ctx.accountId)
        .eq("status", "approved"),
    ]);

    if (settingsErr || templatesErr) {
      console.error("[GET /api/recovery/settings] fetch error:", settingsErr ?? templatesErr);
      return NextResponse.json({ error: "Failed to load recovery settings" }, { status: 500 });
    }

    return NextResponse.json({
      settings: settings ?? { enabled: false, idle_days: 3, template_name: null, template_language: "en_US" },
      approvedTemplates: templates ?? [],
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

const MAX_IDLE_DAYS = 90;

export async function PATCH(request: Request) {
  try {
    const ctx = await requireRole("admin");

    const limit = checkRateLimit(`recovery:settings:${ctx.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as
      | { enabled?: unknown; idle_days?: unknown; template_name?: unknown; template_language?: unknown }
      | null;

    const idleDays = typeof body?.idle_days === "number" ? Math.round(body.idle_days) : 3;
    if (idleDays < 1 || idleDays > MAX_IDLE_DAYS) {
      return NextResponse.json({ error: `idle_days must be between 1 and ${MAX_IDLE_DAYS}` }, { status: 400 });
    }

    const enabled = Boolean(body?.enabled);
    if (enabled && typeof body?.template_name !== "string") {
      return NextResponse.json({ error: "template_name is required to enable recovery" }, { status: 400 });
    }

    const { data, error } = await ctx.supabase
      .from("recovery_settings")
      .upsert(
        {
          account_id: ctx.accountId,
          enabled,
          idle_days: idleDays,
          template_name: typeof body?.template_name === "string" ? body.template_name : null,
          template_language: typeof body?.template_language === "string" ? body.template_language : "en_US",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "account_id" },
      )
      .select("enabled, idle_days, template_name, template_language")
      .single();

    if (error) {
      console.error("[PATCH /api/recovery/settings] upsert error:", error);
      return NextResponse.json({ error: "Failed to save recovery settings" }, { status: 500 });
    }

    return NextResponse.json({ settings: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}
