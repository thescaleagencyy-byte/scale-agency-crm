import { sendTemplateMessage } from '@/lib/whatsapp/meta-api'
import { decrypt } from '@/lib/whatsapp/encryption'
import { sanitizePhoneForMeta, isValidE164 } from '@/lib/whatsapp/phone-utils'
import { supabaseAdmin } from './admin-client'

// ------------------------------------------------------------
// Sends a WhatsApp template message to an arbitrary number (the
// account owner's own phone) rather than a CRM contact — the one
// thing meta-send.ts's engineSendTemplate can't do, since it requires
// an existing contactId/conversationId within the account. Used for
// admin notifications (hot-lead alerts, eventually daily-digest
// delivery) where the recipient isn't a customer in the pipeline.
//
// Sends through the account's own connected WhatsApp number
// (whatsapp_config) exactly like every other outbound message — the
// owner receives it as a message from their own business number.
// ------------------------------------------------------------

interface NotifyOwnerArgs {
  accountId: string
  to: string
  templateName: string
  language?: string
  params?: string[]
}

export async function notifyOwnerTemplate(args: NotifyOwnerArgs): Promise<{ whatsapp_message_id: string }> {
  const db = supabaseAdmin()

  const sanitized = sanitizePhoneForMeta(args.to)
  if (!isValidE164(sanitized)) {
    throw new Error(`owner number invalid: ${args.to}`)
  }

  const { data: config, error: configErr } = await db
    .from('whatsapp_config')
    .select('phone_number_id, access_token')
    .eq('account_id', args.accountId)
    .single()
  if (configErr || !config) {
    throw new Error('WhatsApp not configured for this account')
  }

  const accessToken = decrypt(config.access_token)

  const result = await sendTemplateMessage({
    phoneNumberId: config.phone_number_id,
    accessToken,
    to: sanitized,
    templateName: args.templateName,
    language: args.language,
    params: args.params,
  })

  return { whatsapp_message_id: result.messageId }
}
