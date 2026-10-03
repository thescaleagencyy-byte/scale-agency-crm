// ============================================================
// Plan tiers + limits — pure config, no I/O.
//
// `subscriptions.plan_name` (migration 056) is free text, matched
// against this table; anything unrecognized falls back to `free`'s
// limits rather than defaulting to unlimited (fail restrictive on a
// typo'd plan name, not fail open).
//
// IMPORTANT — this only applies on Scale Agency's own deployment.
// Client deployments (AshWheelz, Sultan, Qissah — NEXT_PUBLIC_FEATURES
// set) run on a manual setup-fee + retainer arrangement, not a
// self-serve plan. Callers MUST gate on `!FEATURE_GATING_ENABLED`
// before consulting these limits — see the call sites in
// /api/whatsapp/send and /api/account/invitations for the pattern.
// ============================================================

export const UNLIMITED = Infinity;

export interface PlanLimits {
  seats: number;
  monthlyMessages: number;
}

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: { seats: 1, monthlyMessages: 100 },
  starter: { seats: 3, monthlyMessages: 1000 },
  growth: { seats: 10, monthlyMessages: 10000 },
  enterprise: { seats: UNLIMITED, monthlyMessages: UNLIMITED },
};

export function limitsForPlan(planName: string): PlanLimits {
  return PLAN_LIMITS[planName] ?? PLAN_LIMITS.free;
}

// ------------------------------------------------------------
// Public self-serve pricing (USD, monthly) + the Stripe Price ID
// env var each plan reads at checkout time. Only plans with a real
// stripe_secret_key AND a matching price ID set go through actual
// Stripe Checkout — see /api/billing/checkout. `enterprise` has no
// entry: it stays a manual "contact us" quote by design.
//
// Figures below are a placeholder anchored to comparable WhatsApp-
// CRM SaaS pricing for an international (UK/UAE/US) SMB buyer —
// confirm/adjust before relying on them publicly.
// ------------------------------------------------------------

export interface StripePlanConfig {
  amountUSD: number;
  priceEnvVar: string;
}

export const STRIPE_PLANS: Record<string, StripePlanConfig> = {
  starter: { amountUSD: 49, priceEnvVar: "STRIPE_PRICE_ID_STARTER" },
  growth: { amountUSD: 149, priceEnvVar: "STRIPE_PRICE_ID_GROWTH" },
};
