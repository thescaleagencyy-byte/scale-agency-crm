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
