import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { decrypt, isLegacyFormat } from '@/lib/whatsapp/encryption'
import { sendTemplateMessage } from '@/lib/whatsapp/meta-api'

/**
 * GET /api/drip/cron
 *
 * Drains drip_enrollments where next_send_at <= now() and status = 'active'.
 * For each due enrollment:
 *   1. Send the WhatsApp template for the current step
 *   2. Advance current_step and set next_send_at for the next step
 *   3. If no more steps, mark completed
 *
 * Protect with DRIP_CRON_SECRET header or query param.
 */
export async function GET(request: Request) {
  const secret = process.env.DRIP_CRON_SECRET
  const auth = request.headers.get('x-cron-secret') ?? new URL(request.url).searchParams.get('secret')
  if (secret && auth !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = supabaseAdmin()
  const now = new Date().toISOString()

  const { data: due, error } = await admin
    .from('drip_enrollments')
    .select('*, campaign:drip_campaigns(account_id, status), contact:contacts(phone, account_id)')
    .eq('status', 'active')
    .lte('next_send_at', now)
    .limit(50)

  if (error) {
    console.error('[drip/cron] fetch failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let sent = 0
  let failed = 0

  for (const enrollment of due ?? []) {
    if (enrollment.campaign?.status !== 'active') continue

    const accountId = enrollment.contact?.account_id
    if (!accountId) continue

    // Fetch the step for current position
    const { data: step } = await admin
      .from('drip_steps')
      .select('*')
      .eq('campaign_id', enrollment.campaign_id)
      .eq('position', enrollment.current_step)
      .single()

    if (!step) {
      // No step found — mark completed
      await admin.from('drip_enrollments').update({ status: 'completed', completed_at: now }).eq('id', enrollment.id)
      continue
    }

    // Get WhatsApp config for this account
    const { data: config } = await admin
      .from('whatsapp_config')
      .select('phone_number_id, access_token')
      .eq('account_id', accountId)
      .eq('status', 'connected')
      .maybeSingle()

    if (!config) continue

    const rawToken = config.access_token
    const token = isLegacyFormat(rawToken) ? rawToken : decrypt(rawToken)

    try {
      await sendTemplateMessage({
        phoneNumberId: config.phone_number_id,
        accessToken: token,
        to: enrollment.contact!.phone,
        templateName: step.template_name,
        language: step.template_language,
      })

      // Advance to next step
      const { data: nextStep } = await admin
        .from('drip_steps')
        .select('delay_days')
        .eq('campaign_id', enrollment.campaign_id)
        .eq('position', enrollment.current_step + 1)
        .maybeSingle()

      if (nextStep) {
        const nextSendAt = new Date()
        nextSendAt.setDate(nextSendAt.getDate() + nextStep.delay_days)
        await admin.from('drip_enrollments').update({
          current_step: enrollment.current_step + 1,
          next_send_at: nextSendAt.toISOString(),
        }).eq('id', enrollment.id)
      } else {
        await admin.from('drip_enrollments').update({ status: 'completed', completed_at: now }).eq('id', enrollment.id)
      }
      sent++
    } catch (err) {
      console.error(`[drip/cron] send failed for enrollment ${enrollment.id}:`, err)
      await admin.from('drip_enrollments').update({ status: 'failed' }).eq('id', enrollment.id)
      failed++
    }
  }

  return NextResponse.json({ sent, failed, processed: (due ?? []).length })
}
