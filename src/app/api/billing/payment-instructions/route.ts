// ============================================================
// GET /api/billing/payment-instructions
//
//   Any member. Returns whichever manual payment methods are
//   configured via env (see .env.local.example) — omits any that
//   are unset rather than showing a blank field. Stripe checkout
//   barely serves Pakistani card volume, so this is the real
//   payment path for local customers until a local gateway
//   (JazzCash/Easypaisa API) is integrated.
// ============================================================

import { NextResponse } from "next/server";

import { getCurrentAccount, toErrorResponse } from "@/lib/auth/account";

export async function GET() {
  try {
    await getCurrentAccount();

    return NextResponse.json({
      bankDetails: process.env.PAYMENT_BANK_DETAILS || null,
      jazzCashNumber: process.env.PAYMENT_JAZZCASH_NUMBER || null,
      easypaisaNumber: process.env.PAYMENT_EASYPAISA_NUMBER || null,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
