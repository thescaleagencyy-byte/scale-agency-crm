import { createHmac, timingSafeEqual } from 'crypto'

// Opaque per-recipient unsubscribe token — reuses MESSAGE_ENCRYPTION_KEY
// (already required for the app to run at all, see src/lib/crypto.ts)
// instead of adding a new env var just for this.
function getSecret(): string {
  const key = process.env.MESSAGE_ENCRYPTION_KEY
  if (!key) throw new Error('MESSAGE_ENCRYPTION_KEY env var not set')
  return key
}

export function signUnsubscribeToken(prospectId: string, email: string): string {
  return createHmac('sha256', getSecret())
    .update(`${prospectId}:${email.toLowerCase()}`)
    .digest('hex')
}

export function verifyUnsubscribeToken(prospectId: string, email: string, token: string): boolean {
  const expected = signUnsubscribeToken(prospectId, email)
  const a = Buffer.from(expected)
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function buildUnsubscribeUrl(baseUrl: string, prospectId: string, email: string): string {
  const token = signUnsubscribeToken(prospectId, email)
  return `${baseUrl}/api/outreach/unsubscribe?p=${encodeURIComponent(prospectId)}&e=${encodeURIComponent(email)}&t=${token}`
}
