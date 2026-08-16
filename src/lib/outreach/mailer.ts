import nodemailer from 'nodemailer'
import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptText } from '@/lib/crypto'

interface GmailCredentials {
  email: string
  app_password: string
}

export interface SendEmailResult {
  ok: boolean
  messageId?: string
  error?: string
}

// One connected Gmail account per account_id, stored in the shared
// `integrations` table (service='gmail') the same way every other
// pasted-credential integration is — see integration-verify.ts's
// verifyGmail for the same transport shape used to test-connect.
export async function getGmailCredentials(
  admin: SupabaseClient,
  accountId: string,
): Promise<GmailCredentials | null> {
  const { data } = await admin
    .from('integrations')
    .select('credentials_encrypted, status')
    .eq('account_id', accountId)
    .eq('service', 'gmail')
    .eq('status', 'connected')
    .maybeSingle()

  if (!data?.credentials_encrypted) return null
  try {
    return JSON.parse(decryptText(data.credentials_encrypted)) as GmailCredentials
  } catch {
    return null
  }
}

export async function sendEmail(
  creds: GmailCredentials,
  opts: { to: string; subject: string; text: string; unsubscribeUrl: string },
): Promise<SendEmailResult> {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: creds.email, pass: creds.app_password },
  })

  const body = `${opts.text}\n\n---\nDon't want these emails? Unsubscribe: ${opts.unsubscribeUrl}`

  try {
    const info = await transporter.sendMail({
      from: creds.email,
      to: opts.to,
      subject: opts.subject,
      text: body,
      headers: { 'List-Unsubscribe': `<${opts.unsubscribeUrl}>` },
    })
    return { ok: true, messageId: info.messageId }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
