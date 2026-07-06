// ============================================================
// /api/account/members
//
//   GET  — roster of the caller's account.       Any member.
//   POST — create a member directly (no invite). Admin+.
//
// GET field visibility
//   Sensitive fields (email) are returned only when the caller is
//   admin+. Agents and viewers see name + avatar + role + joined
//   date only. This mirrors the design decision from the planning
//   phase: "agent/viewer sees names only".
//
// POST exists alongside invitations for the agency-managed case:
// the admin sets the teammate's email + password and hands the
// credentials over directly — no email round trip. The service
// role client creates the auth user (the signup trigger seeds a
// personal account) and we immediately move the profile into the
// admin's account with the chosen role.
// ============================================================

import { NextResponse } from "next/server";

import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from "@/lib/auth/account";
import { canManageMembers, isAccountRole } from "@/lib/auth/roles";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import type { AccountMember } from "@/types";

interface ProfileRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  account_role: string;
  created_at: string;
}

export async function GET() {
  try {
    const ctx = await getCurrentAccount();

    // RLS on profiles allows reading any row whose account matches
    // the caller's, so this query is naturally account-scoped.
    const { data, error } = await ctx.supabase
      .from("profiles")
      .select("user_id, full_name, email, avatar_url, account_role, created_at")
      .eq("account_id", ctx.accountId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[GET /api/account/members] fetch error:", error);
      return NextResponse.json(
        { error: "Failed to load members" },
        { status: 500 },
      );
    }

    const canSeeEmails = canManageMembers(ctx.role);

    const members: AccountMember[] = (data as ProfileRow[]).flatMap((row) => {
      // Defensive: the DB enum should never let an unknown role
      // through, but if a migration ever broadens the enum without
      // updating TS, skip the row rather than crash the page.
      if (!isAccountRole(row.account_role)) return [];
      return [
        {
          user_id: row.user_id,
          full_name: row.full_name ?? "",
          email: canSeeEmails ? row.email : null,
          avatar_url: row.avatar_url,
          role: row.account_role,
          joined_at: row.created_at,
        },
      ];
    });

    return NextResponse.json({ members });
  } catch (err) {
    return toErrorResponse(err);
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
const CREATABLE_ROLES = ["admin", "agent", "viewer"] as const;

export async function POST(request: Request) {
  try {
    const ctx = await requireRole("admin");

    const limit = checkRateLimit(
      `admin:add-member:${ctx.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as {
      email?: unknown;
      password?: unknown;
      full_name?: unknown;
      role?: unknown;
    } | null;

    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const fullName = typeof body?.full_name === "string" ? body.full_name.trim() : "";
    const role = body?.role;

    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
    }
    if (password.length < MIN_PASSWORD) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD} characters` },
        { status: 400 },
      );
    }
    if (!fullName) {
      return NextResponse.json({ error: "Full name is required" }, { status: 400 });
    }
    if (
      typeof role !== "string" ||
      !(CREATABLE_ROLES as readonly string[]).includes(role)
    ) {
      return NextResponse.json(
        { error: "Role must be admin, agent, or viewer" },
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();

    // email_confirm: the admin is vouching for the address — no
    // confirmation round trip, credentials work immediately.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (createErr || !created?.user) {
      const msg = createErr?.message ?? "Failed to create user";
      const isDuplicate = /already|registered|exists/i.test(msg);
      return NextResponse.json(
        { error: isDuplicate ? "A user with this email already exists" : msg },
        { status: isDuplicate ? 409 : 500 },
      );
    }

    // The signup trigger seeded a profile + personal account. Move
    // the profile into the caller's account with the chosen role;
    // the empty personal account is left orphaned (memberless →
    // invisible everywhere).
    const { error: moveErr } = await admin
      .from("profiles")
      .update({
        account_id: ctx.accountId,
        account_role: role,
        full_name: fullName,
      })
      .eq("user_id", created.user.id);
    if (moveErr) {
      // Don't leave a stray login that lands in an empty workspace.
      await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
      console.error("[POST /api/account/members] profile move error:", moveErr);
      return NextResponse.json(
        { error: "Failed to attach the new member to this workspace" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      member: { user_id: created.user.id, email, full_name: fullName, role },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
