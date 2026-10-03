// ============================================================
// /api/lead-alerts/settings
//
//   GET   — current settings + this account's approved templates
//           (any member can view).
//   PATCH — update settings. Admin+ (settings-class table, same
//           gate as recovery settings / brand config).
// ============================================================

import { NextResponse } from "next/server";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import { sanitizePhoneForMeta, isValidE164 } from "@/lib/whatsapp/phone-utils";

export async function GET() {
  try {
    const ctx = await requireRole("viewer");

    const [{ data: settings, error: settingsErr }, { data: templates, error: templatesErr }] = await Promise.all([
      ctx.supabase
        .from("lead_alert_settings")
        .select("enabled, threshold_minutes, owner_whatsapp_number, template_name, template_language")
        .eq("account_id", ctx.accountId)
        .maybeSingle(),
      ctx.supabase
        .from("message_templates")
        .select("name, language")
        .eq("account_id", ctx.accountId)
        .eq("status", "APPROVED"),
    ]);

    if (settingsErr || templatesErr) {
      console.error("[GET /api/lead-alerts/settings] fetch error:", settingsErr ?? templatesErr);
      return NextResponse.json({ error: "Failed to load lead alert settings" }, { status: 500 });
    }

    return NextResponse.json({
      settings:
        settings ??
        { enabled: false, threshold_minutes: 10, owner_whatsapp_number: null, template_name: null, template_language: "en_US" },
      approvedTemplates: templates ?? [],
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

const MAX_THRESHOLD_MINUTES = 1440;

export async function PATCH(request: Request) {
  try {
    const ctx = await requireRole("admin");

    const limit = checkRateLimit(`lead-alerts:settings:${ctx.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as
      | {
          enabled?: unknown;
          threshold_minutes?: unknown;
          owner_whatsapp_number?: unknown;
          template_name?: unknown;
          template_language?: unknown;
        }
      | null;

    const thresholdMinutes = typeof body?.threshold_minutes === "number" ? Math.round(body.threshold_minutes) : 10;
    if (thresholdMinutes < 1 || thresholdMinutes > MAX_THRESHOLD_MINUTES) {
      return NextResponse.json({ error: `threshold_minutes must be between 1 and ${MAX_THRESHOLD_MINUTES}` }, { status: 400 });
    }

    const enabled = Boolean(body?.enabled);

    let ownerNumber: string | null = null;
    if (typeof body?.owner_whatsapp_number === "string" && body.owner_whatsapp_number.trim()) {
      const sanitized = sanitizePhoneForMeta(body.owner_whatsapp_number.trim());
      if (!isValidE164(sanitized)) {
        return NextResponse.json({ error: "owner_whatsapp_number must be a valid phone number" }, { status: 400 });
      }
      ownerNumber = sanitized;
    }

    if (enabled && typeof body?.template_name !== "string") {
      return NextResponse.json({ error: "template_name is required to enable hot-lead alerts" }, { status: 400 });
    }
    if (enabled && !ownerNumber) {
      return NextResponse.json({ error: "owner_whatsapp_number is required to enable hot-lead alerts" }, { status: 400 });
    }

    const { data, error } = await ctx.supabase
      .from("lead_alert_settings")
      .upsert(
        {
          account_id: ctx.accountId,
          enabled,
          threshold_minutes: thresholdMinutes,
          owner_whatsapp_number: ownerNumber,
          template_name: typeof body?.template_name === "string" ? body.template_name : null,
          template_language: typeof body?.template_language === "string" ? body.template_language : "en_US",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "account_id" },
      )
      .select("enabled, threshold_minutes, owner_whatsapp_number, template_name, template_language")
      .single();

    if (error) {
      console.error("[PATCH /api/lead-alerts/settings] upsert error:", error);
      return NextResponse.json({ error: "Failed to save lead alert settings" }, { status: 500 });
    }

    return NextResponse.json({ settings: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}
