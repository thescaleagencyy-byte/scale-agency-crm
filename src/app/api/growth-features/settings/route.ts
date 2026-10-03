// ============================================================
// /api/growth-features/settings
//
//   GET   — current settings + this account's approved templates.
//   PATCH — update settings. Admin+, same gate as every other
//           settings-class table in this app.
//
//   One row covers all 5 growth features — same consolidation
//   rationale as ai_alert_settings (082).
// ============================================================

import { NextResponse } from "next/server";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import { sanitizePhoneForMeta, isValidE164 } from "@/lib/whatsapp/phone-utils";

const SELECT_COLUMNS =
  "owner_whatsapp_number, template_language, " +
  "review_request_enabled, review_request_template, review_request_link, " +
  "reactivation_enabled, reactivation_template, reactivation_min_days, " +
  "knowledge_gap_enabled, " +
  "referral_detection_enabled, referral_alert_template, " +
  "upsell_detector_enabled, upsell_detector_template";

const DEFAULT_SETTINGS = {
  owner_whatsapp_number: null,
  template_language: "en_US",
  review_request_enabled: false,
  review_request_template: null,
  review_request_link: null,
  reactivation_enabled: false,
  reactivation_template: null,
  reactivation_min_days: 90,
  knowledge_gap_enabled: false,
  referral_detection_enabled: false,
  referral_alert_template: null,
  upsell_detector_enabled: false,
  upsell_detector_template: null,
};

export async function GET() {
  try {
    const ctx = await requireRole("viewer");

    const [{ data: settings, error: settingsErr }, { data: templates, error: templatesErr }] = await Promise.all([
      ctx.supabase.from("growth_feature_settings").select(SELECT_COLUMNS).eq("account_id", ctx.accountId).maybeSingle(),
      ctx.supabase.from("message_templates").select("name, language").eq("account_id", ctx.accountId).eq("status", "APPROVED"),
    ]);

    if (settingsErr || templatesErr) {
      console.error("[GET /api/growth-features/settings] fetch error:", settingsErr ?? templatesErr);
      return NextResponse.json({ error: "Failed to load growth feature settings" }, { status: 500 });
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
  review_request_enabled: unknown;
  review_request_template: unknown;
  review_request_link: unknown;
  reactivation_enabled: unknown;
  reactivation_template: unknown;
  reactivation_min_days: unknown;
  knowledge_gap_enabled: unknown;
  referral_detection_enabled: unknown;
  referral_alert_template: unknown;
  upsell_detector_enabled: unknown;
  upsell_detector_template: unknown;
}>;

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? Math.round(value) : fallback;
  return Math.min(max, Math.max(min, n));
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireRole("admin");

    const limit = checkRateLimit(`growth-features:settings:${ctx.userId}`, RATE_LIMITS.adminAction);
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

    // review_request and reactivation message the CUSTOMER (through
    // their existing conversation), not the owner — only referral and
    // upsell alerts go to the owner's own number.
    const ownerFacingEnabled = Boolean(body.referral_detection_enabled) || Boolean(body.upsell_detector_enabled);
    if (ownerFacingEnabled && !ownerNumber) {
      return NextResponse.json({ error: "owner_whatsapp_number is required to enable referral or upsell alerts" }, { status: 400 });
    }

    if (Boolean(body.review_request_enabled) && typeof body.review_request_link !== "string") {
      return NextResponse.json({ error: "review_request_link is required to enable review requests" }, { status: 400 });
    }

    const row = {
      account_id: ctx.accountId,
      owner_whatsapp_number: ownerNumber,
      template_language: typeof body.template_language === "string" ? body.template_language : "en_US",

      review_request_enabled: Boolean(body.review_request_enabled),
      review_request_template: typeof body.review_request_template === "string" ? body.review_request_template : null,
      review_request_link: typeof body.review_request_link === "string" ? body.review_request_link : null,

      reactivation_enabled: Boolean(body.reactivation_enabled),
      reactivation_template: typeof body.reactivation_template === "string" ? body.reactivation_template : null,
      reactivation_min_days: clampInt(body.reactivation_min_days, 90, 7, 365),

      knowledge_gap_enabled: Boolean(body.knowledge_gap_enabled),

      referral_detection_enabled: Boolean(body.referral_detection_enabled),
      referral_alert_template: typeof body.referral_alert_template === "string" ? body.referral_alert_template : null,

      upsell_detector_enabled: Boolean(body.upsell_detector_enabled),
      upsell_detector_template: typeof body.upsell_detector_template === "string" ? body.upsell_detector_template : null,

      updated_at: new Date().toISOString(),
    };

    for (const [flag, template, label] of [
      [row.review_request_enabled, row.review_request_template, "review request"],
      [row.reactivation_enabled, row.reactivation_template, "dead-lead reactivation"],
      [row.referral_detection_enabled, row.referral_alert_template, "referral alert"],
      [row.upsell_detector_enabled, row.upsell_detector_template, "upsell suggestion"],
    ] as const) {
      if (flag && !template) {
        return NextResponse.json({ error: `A template is required to enable ${label}` }, { status: 400 });
      }
    }

    const { data, error } = await ctx.supabase
      .from("growth_feature_settings")
      .upsert(row, { onConflict: "account_id" })
      .select(SELECT_COLUMNS)
      .single();

    if (error) {
      console.error("[PATCH /api/growth-features/settings] upsert error:", error);
      return NextResponse.json({ error: "Failed to save growth feature settings" }, { status: 500 });
    }

    return NextResponse.json({ settings: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}
