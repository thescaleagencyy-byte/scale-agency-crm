// ============================================================
// GET /api/status/[accountId]
//
// Public — no auth required. Backs the /status/<accountId> page:
// a shareable "is this business's WhatsApp bot up?" page a client
// owner can point their own customers or stakeholders at.
//
// Security model (mirrors /api/invitations/[token]/peek)
//   - get_public_status() is SECURITY DEFINER so it bypasses the
//     RLS that would otherwise block an anonymous SELECT, but it
//     returns a FIXED shape — account name, connected boolean,
//     quality rating, last activity timestamp. Never access
//     tokens, error detail, contacts, or messages.
//   - account_id is a UUID (unguessable) but rate-limited per-IP
//     anyway as cheap insurance against scraping.
// ============================================================

import { NextResponse } from "next/server";

import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const xri = request.headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  const ip = getClientIp(request);
  const limit = checkRateLimit(`status:${ip}`, RATE_LIMITS.statusPeek);
  if (!limit.success) return rateLimitResponse(limit);

  const { accountId } = await params;
  if (!UUID_RE.test(accountId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_status", {
    p_account_id: accountId,
  });

  if (error) {
    console.error("[GET /api/status/[accountId]] rpc error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
  if (!data || !data.account_name) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}
