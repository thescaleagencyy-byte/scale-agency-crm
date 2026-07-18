// ============================================================
// GET /api/contracts/[id]/signed-url
//
//   Returns a short-lived signed URL for the contract's stored
//   file. The `contracts` bucket is private (migration 057) —
//   this is the only sanctioned way to read a contract's file,
//   never a public URL.
// ============================================================

import { NextResponse } from "next/server";

import { requireRole, toErrorResponse } from "@/lib/auth/account";

const SIGNED_URL_TTL_SECONDS = 300;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("viewer");
    const { id } = await params;

    const { data: contract, error: fetchErr } = await ctx.supabase
      .from("contracts")
      .select("file_path")
      .eq("id", id)
      .eq("account_id", ctx.accountId)
      .maybeSingle();

    if (fetchErr) {
      console.error("[GET /api/contracts/[id]/signed-url] fetch error:", fetchErr);
      return NextResponse.json({ error: "Failed to load contract" }, { status: 500 });
    }
    if (!contract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    const { data, error } = await ctx.supabase.storage
      .from("contracts")
      .createSignedUrl(contract.file_path, SIGNED_URL_TTL_SECONDS);

    if (error || !data) {
      console.error("[GET /api/contracts/[id]/signed-url] sign error:", error);
      return NextResponse.json({ error: "Failed to generate download link" }, { status: 500 });
    }

    return NextResponse.json({ url: data.signedUrl, expiresIn: SIGNED_URL_TTL_SECONDS });
  } catch (err) {
    return toErrorResponse(err);
  }
}
