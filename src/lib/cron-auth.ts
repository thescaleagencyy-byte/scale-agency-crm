import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'

/**
 * Shared fail-closed auth check for cron/webhook routes gated by a
 * shared-secret env var. Two failure modes this specifically guards
 * against (both previously present in drip/recovery/digest/meta-ads
 * cron routes):
 *
 *   1. Fail-open when the env var is unset — `if (secret && auth !==
 *      secret)` silently lets every request through if `secret` is
 *      falsy. This must 503, not pass.
 *   2. Timing side-channel on the string comparison — use
 *      timingSafeEqual, matching the pattern already correct in
 *      /api/flows/cron and /api/automations/cron.
 *
 * Accepts the secret via the `x-cron-secret` header or a `secret`
 * query param, matching what each route already sent.
 */
export function checkCronAuth(
  request: Request,
  envVarName: string,
): NextResponse | null {
  const expected = process.env[envVarName]
  if (!expected) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 })
  }
  const supplied =
    request.headers.get('x-cron-secret') ??
    new URL(request.url).searchParams.get('secret') ??
    ''
  const suppliedBuf = Buffer.from(supplied)
  const expectedBuf = Buffer.from(expected)
  if (
    suppliedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(suppliedBuf, expectedBuf)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}
