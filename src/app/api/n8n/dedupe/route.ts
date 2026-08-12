import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'

/**
 * POST /api/n8n/dedupe
 *
 * Atomic "have we processed this message_id before?" gate for n8n bot
 * workflows. Backed by a unique constraint (migration 071), so the
 * INSERT itself is the check — no separate check-then-insert race.
 *
 * Auth: x-n8n-api-key header must match N8N_SEND_API_KEY env var.
 *
 * Body:
 *   message_id  string — WhatsApp message id to dedupe on
 *
 * Response: { new: true } if this is the first time this message_id has
 * been seen (caller should proceed), { new: false } if it's a duplicate
 * (caller should stop).
 */
export async function POST(request: Request) {
  const apiKey = request.headers.get('x-n8n-api-key')
  const expectedKey = process.env.N8N_SEND_API_KEY

  if (!expectedKey) {
    return NextResponse.json({ error: 'Not configured.' }, { status: 503 })
  }
  if (!apiKey || apiKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { message_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const messageId = body.message_id?.trim()
  if (!messageId) {
    return NextResponse.json({ error: 'message_id is required' }, { status: 400 })
  }

  const admin = supabaseAdmin()
  const { error } = await admin.from('n8n_message_dedupe').insert({ message_id: messageId })

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ new: false })
    }
    console.error('[n8n/dedupe] insert failed:', error)
    return NextResponse.json({ error: 'Failed to check dedupe.' }, { status: 500 })
  }

  return NextResponse.json({ new: true })
}
