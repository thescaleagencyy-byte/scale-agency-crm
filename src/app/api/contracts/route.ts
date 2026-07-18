// ============================================================
// /api/contracts
//
//   GET  — list contracts for the caller's account. Any member.
//   POST — create a contract row after the file has already been
//          uploaded client-side to the private `contracts` bucket
//          (see uploadAccountMedia in src/lib/storage). Agent+.
// ============================================================

import { NextResponse } from "next/server";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

const MAX_TITLE_LEN = 200;

export async function GET() {
  try {
    const ctx = await requireRole("viewer");

    const { data, error } = await ctx.supabase
      .from("contracts")
      .select(
        "id, title, status, signer_name, signer_email, deal_id, contact_id, sent_at, signed_at, created_at",
      )
      .eq("account_id", ctx.accountId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[GET /api/contracts] fetch error:", error);
      return NextResponse.json({ error: "Failed to load contracts" }, { status: 500 });
    }

    return NextResponse.json({ contracts: data ?? [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole("agent");

    const limit = checkRateLimit(`contracts:create:${ctx.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as
      | {
          title?: unknown;
          file_path?: unknown;
          deal_id?: unknown;
          contact_id?: unknown;
          signer_name?: unknown;
          signer_email?: unknown;
        }
      | null;

    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const filePath = typeof body?.file_path === "string" ? body.file_path : "";

    if (!title || title.length > MAX_TITLE_LEN) {
      return NextResponse.json(
        { error: `'title' is required and must be ${MAX_TITLE_LEN} characters or fewer` },
        { status: 400 },
      );
    }
    if (!filePath) {
      return NextResponse.json(
        { error: "'file_path' is required — upload the file first" },
        { status: 400 },
      );
    }
    // The upload RLS policy only accepts paths under this account's own
    // folder, but double-check here too so a malformed/foreign path
    // can't be attached to this account's contract row.
    if (!filePath.startsWith(`account-${ctx.accountId}/`)) {
      return NextResponse.json({ error: "file_path does not belong to your account" }, { status: 400 });
    }

    const { data, error } = await ctx.supabase
      .from("contracts")
      .insert({
        account_id: ctx.accountId,
        title,
        file_path: filePath,
        deal_id: typeof body?.deal_id === "string" ? body.deal_id : null,
        contact_id: typeof body?.contact_id === "string" ? body.contact_id : null,
        signer_name: typeof body?.signer_name === "string" ? body.signer_name.trim() || null : null,
        signer_email: typeof body?.signer_email === "string" ? body.signer_email.trim() || null : null,
        created_by: ctx.userId,
      })
      .select("id, title, status, created_at")
      .single();

    if (error) {
      console.error("[POST /api/contracts] insert error:", error);
      return NextResponse.json({ error: "Failed to create contract" }, { status: 500 });
    }

    return NextResponse.json({ contract: data }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
