// ============================================================
// /api/ai-alerts/settings
//
//   GET   — current settings + this account's approved templates
//           (any member can view).
//   PATCH — update settings. Admin+, same gate as every other
//           settings-class table in this app.
//
//   One row covers all 5 AI Alert features (staff audit, complaint
//   warning, cash flow, no-show, price-objection) — see
//   082_ai_insight_alerts.sql for why they share one settings shape.
// ============================================================

import { NextResponse } from "next/server";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import { sanitizePhoneForMeta, isValidE164 } from "@/lib/whatsapp/phone-utils";

const SELECT_COLUMNS =
  "owner_whatsapp_number, template_language, " +
  "staff_audit_enabled, staff_audit_template, staff_audit_min_score, " +
  "complaint_alert_enabled, complaint_alert_template, " +
  "cashflow_alert_enabled, cashflow_alert_template, cashflow_danger_days, " +
  "noshow_alert_enabled, noshow_alert_template, " +
  "price_objection_enabled, price_objection_template, price_objection_discount_cap, " +
  "dialect_detection_enabled";

const DEFAULT_SETTINGS = {
  owner_whatsapp_number: null,
  template_language: "en_US",
  staff_audit_enabled: false,
  staff_audit_template: null,
  staff_audit_min_score: 40,
  complaint_alert_enabled: false,
  complaint_alert_template: null,
  cashflow_alert_enabled: false,
  cashflow_alert_template: null,
  cashflow_danger_days: 14,
  noshow_alert_enabled: false,
  noshow_alert_template: null,
  price_objection_enabled: false,
  price_objection_template: null,
  price_objection_discount_cap: 10,
  dialect_detection_enabled: false,
};

export async function GET() {
  try {
    const ctx = await requireRole("viewer");

    const [{ data: settings, error: settingsErr }, { data: templates, error: templatesErr }] = await Promise.all([
      ctx.supabase.from("ai_alert_settings").select(SELECT_COLUMNS).eq("account_id", ctx.accountId).maybeSingle(),
      ctx.supabase.from("message_templates").select("name, language").eq("account_id", ctx.accountId).eq("status", "APPROVED"),
    ]);

    if (settingsErr || templatesErr) {
      console.error("[GET /api/ai-alerts/settings] fetch error:", settingsErr ?? templatesErr);
      return NextResponse.json({ error: "Failed to load AI alert settings" }, { status: 500 });
    }

    return NextResponse.json({
      settings: settings ?? DEFAULT_SETTINGS,
      approvedTemplates: templates ?? [],
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

type Body = Partial<{
  owner_whatsapp_number: unknown;
  template_language: unknown;
  staff_audit_enabled: unknown;
  staff_audit_template: unknown;
  staff_audit_min_score: unknown;
  complaint_alert_enabled: unknown;
  complaint_alert_template: unknown;
  cashflow_alert_enabled: unknown;
  cashflow_alert_template: unknown;
  cashflow_danger_days: unknown;
  noshow_alert_enabled: unknown;
  noshow_alert_template: unknown;
  price_objection_enabled: unknown;
  price_objection_template: unknown;
  price_objection_discount_cap: unknown;
  dialect_detection_enabled: unknown;
}>;

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? Math.round(value) : fallback;
  return Math.min(max, Math.max(min, n));
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireRole("admin");

    const limit = checkRateLimit(`ai-alerts:settings:${ctx.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as Body | null;
    if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    let ownerNumber: string | null = null;
    if (typeof body.owner_whatsapp_number === "string" && body.owner_whatsapp_number.trim()) {
      const sanitized = sanitizePhoneForMeta(body.owner_whatsapp_number.trim());
      if (!isValidE164(sanitized)) {
        return NextResponse.json({ error: "owner_whatsapp_number must be a valid phone number" }, { status: 400 });
      }
      ownerNumber = sanitized;
    }

    const anyEnabled =
      Boolean(body.staff_audit_enabled) ||
      Boolean(body.complaint_alert_enabled) ||
      Boolean(body.cashflow_alert_enabled) ||
      Boolean(body.noshow_alert_enabled) ||
      Boolean(body.price_objection_enabled);
    if (anyEnabled && !ownerNumber) {
      return NextResponse.json({ error: "owner_whatsapp_number is required to enable any WhatsApp alert" }, { status: 400 });
    }

    const row = {
      account_id: ctx.accountId,
      owner_whatsapp_number: ownerNumber,
      template_language: typeof body.template_language === "string" ? body.template_language : "en_US",

      staff_audit_enabled: Boolean(body.staff_audit_enabled),
      staff_audit_template: typeof body.staff_audit_template === "string" ? body.staff_audit_template : null,
      staff_audit_min_score: clampInt(body.staff_audit_min_score, 40, 0, 100),

      complaint_alert_enabled: Boolean(body.complaint_alert_enabled),
      complaint_alert_template: typeof body.complaint_alert_template === "string" ? body.complaint_alert_template : null,

      cashflow_alert_enabled: Boolean(body.cashflow_alert_enabled),
      cashflow_alert_template: typeof body.cashflow_alert_template === "string" ? body.cashflow_alert_template : null,
      cashflow_danger_days: clampInt(body.cashflow_danger_days, 14, 1, 90),

      noshow_alert_enabled: Boolean(body.noshow_alert_enabled),
      noshow_alert_template: typeof body.noshow_alert_template === "string" ? body.noshow_alert_template : null,

      price_objection_enabled: Boolean(body.price_objection_enabled),
      price_objection_template: typeof body.price_objection_template === "string" ? body.price_objection_template : null,
      price_objection_discount_cap: clampInt(body.price_objection_discount_cap, 10, 0, 50),

      dialect_detection_enabled: Boolean(body.dialect_detection_enabled),

      updated_at: new Date().toISOString(),
    };

    for (const [flag, template, label] of [
      [row.staff_audit_enabled, row.staff_audit_template, "staff audit"],
      [row.complaint_alert_enabled, row.complaint_alert_template, "complaint alert"],
      [row.cashflow_alert_enabled, row.cashflow_alert_template, "cash flow alert"],
      [row.noshow_alert_enabled, row.noshow_alert_template, "no-show alert"],
      [row.price_objection_enabled, row.price_objection_template, "price-objection alert"],
    ] as const) {
      if (flag && !template) {
        return NextResponse.json({ error: `A template is required to enable ${label}` }, { status: 400 });
      }
    }

    const { data, error } = await ctx.supabase
      .from("ai_alert_settings")
      .upsert(row, { onConflict: "account_id" })
      .select(SELECT_COLUMNS)
      .single();

    if (error) {
      console.error("[PATCH /api/ai-alerts/settings] upsert error:", error);
      return NextResponse.json({ error: "Failed to save AI alert settings" }, { status: 500 });
    }

    return NextResponse.json({ settings: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}
