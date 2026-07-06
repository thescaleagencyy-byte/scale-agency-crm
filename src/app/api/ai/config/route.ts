// ============================================================
// /api/ai/config
//
//   GET  — is a Claude key configured? Returns a masked hint
//          (last 4 chars), never the key itself.       Admin+.
//   POST — save or clear the Claude API key.           Admin+.
//
// The key is encrypted with the same AES-256-GCM helper used for
// message bodies before it touches the DB, and decrypted only
// inside the assistant route.
// ============================================================

import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { encryptText, decryptText } from '@/lib/crypto';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

export async function GET() {
  try {
    const ctx = await requireRole('admin');
    const { data } = await ctx.supabase
      .from('ai_config')
      .select('claude_api_key, updated_at')
      .eq('account_id', ctx.accountId)
      .maybeSingle();

    if (!data?.claude_api_key) {
      return NextResponse.json({ configured: false, hint: null });
    }

    let hint: string | null = null;
    try {
      const key = decryptText(data.claude_api_key);
      hint = `••••${key.slice(-4)}`;
    } catch {
      // Encryption key rotated or row predates encryption — treat
      // as unconfigured so the admin re-enters it.
      return NextResponse.json({ configured: false, hint: null });
    }

    return NextResponse.json({
      configured: true,
      hint,
      updated_at: data.updated_at,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');

    const limit = checkRateLimit(
      `admin:ai-config:${ctx.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as {
      claude_api_key?: unknown;
    } | null;
    const raw = body?.claude_api_key;

    // Empty string = clear the key.
    if (raw === '' || raw === null) {
      await ctx.supabase
        .from('ai_config')
        .upsert(
          { account_id: ctx.accountId, claude_api_key: null, updated_at: new Date().toISOString() },
          { onConflict: 'account_id' },
        );
      return NextResponse.json({ configured: false });
    }

    if (typeof raw !== 'string' || !raw.trim().startsWith('sk-ant-')) {
      return NextResponse.json(
        { error: "That doesn't look like a Claude API key (should start with sk-ant-)." },
        { status: 400 },
      );
    }

    const { error } = await ctx.supabase.from('ai_config').upsert(
      {
        account_id: ctx.accountId,
        claude_api_key: encryptText(raw.trim()),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'account_id' },
    );
    if (error) {
      console.error('[POST /api/ai/config] upsert error:', error);
      return NextResponse.json({ error: 'Failed to save key' }, { status: 500 });
    }

    return NextResponse.json({ configured: true, hint: `••••${raw.trim().slice(-4)}` });
  } catch (err) {
    return toErrorResponse(err);
  }
}
