// ============================================================
// /api/contracts/[id]
//
//   PATCH  — update status (draft → sent → signed/declined) or
//            signer info. Agent+.
//   DELETE — remove a contract + its stored file. Admin+.
// ============================================================

import { NextResponse } from "next/server";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

const VALID_STATUSES = ["draft", "sent", "signed", "declined"] as const;
type ContractStatus = (typeof VALID_STATUSES)[number];

function isContractStatus(value: unknown): value is ContractStatus {
  return typeof value === "string" && (VALID_STATUSES as readonly string[]).includes(value);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("agent");
    const { id } = await params;

    const limit = checkRateLimit(`contracts:update:${ctx.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as
      | { status?: unknown; signer_name?: unknown; signer_email?: unknown }
      | null;

    const update: Record<string, unknown> = {};

    if (body?.status !== undefined) {
      if (!isContractStatus(body.status)) {
        return NextResponse.json(
          { error: `'status' must be one of ${VALID_STATUSES.join(", ")}` },
          { status: 400 },
        );
      }
      update.status = body.status;
      if (body.status === "sent") update.sent_at = new Date().toISOString();
      if (body.status === "signed") update.signed_at = new Date().toISOString();
    }
    if (typeof body?.signer_name === "string") update.signer_name = body.signer_name.trim() || null;
    if (typeof body?.signer_email === "string") update.signer_email = body.signer_email.trim() || null;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    // RLS (is_account_member) scopes the row set; the explicit
    // account_id filter keeps the intent readable and defends in
    // depth if the policy is ever loosened.
    const { data, error } = await ctx.supabase
      .from("contracts")
      .update(update)
      .eq("id", id)
      .eq("account_id", ctx.accountId)
      .select("id, title, status, signer_name, signer_email, sent_at, signed_at")
      .maybeSingle();

    if (error) {
      console.error("[PATCH /api/contracts/[id]] update error:", error);
      return NextResponse.json({ error: "Failed to update contract" }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    return NextResponse.json({ contract: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("admin");
    const { id } = await params;

    const { data: contract, error: fetchErr } = await ctx.supabase
      .from("contracts")
      .select("file_path")
      .eq("id", id)
      .eq("account_id", ctx.accountId)
      .maybeSingle();

    if (fetchErr) {
      console.error("[DELETE /api/contracts/[id]] fetch error:", fetchErr);
      return NextResponse.json({ error: "Failed to delete contract" }, { status: 500 });
    }
    if (!contract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    const { error: deleteErr } = await ctx.supabase.from("contracts").delete().eq("id", id);
    if (deleteErr) {
      console.error("[DELETE /api/contracts/[id]] delete error:", deleteErr);
      return NextResponse.json({ error: "Failed to delete contract" }, { status: 500 });
    }

    // Best-effort: the DB row is already gone, which is the part that
    // matters for correctness. An orphaned storage object is a cleanup
    // nit, not something worth failing the request over.
    await ctx.supabase.storage.from("contracts").remove([contract.file_path]).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
