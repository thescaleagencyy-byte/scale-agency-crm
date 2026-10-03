import { getAIEmployeeModelClient } from '@/lib/ai-employee/model-client'
import { decryptMessages } from '@/lib/crypto'
import { engineSendText } from '@/lib/automations/meta-send'
import { supabaseAdmin } from '@/lib/automations/admin-client'

// ============================================================
// AI Employee — the self-serve version of the bespoke ordering/
// booking bots built per-client (Sultan, Qissah, AshWheelz). One
// model call per inbound message: read the conversation + catalog +
// saved business knowledge, decide a reply, and — only when the
// customer has actually confirmed — record a real order. Anything
// the model can't confidently handle gets escalated to a human
// instead of guessing.
//
// Deliberately NOT a multi-step tool-calling agent loop — single
// JSON-mode call, same pattern as every other AI feature in this
// app (triageLead, knowledge-gap, price-objection, ...). The model
// reconstructs cart state from the conversation transcript each
// turn rather than this reading/writing a separate persisted cart —
// simpler, and the transcript is the ground truth a human reading
// the same thread would use anyway.
//
// Only ever REPLIES to an inbound message — always inside the
// customer's active 24h window, so plain text is correct (no
// approved-template requirement, unlike every outbound-initiated
// alert built this week).
// ============================================================

interface RespondArgs {
  accountId: string
  userId: string
  contactId: string
  conversationId: string
}

export async function maybeRespondAsAIEmployee(args: RespondArgs): Promise<void> {
  const model = getAIEmployeeModelClient()
  if (!model) return

  const db = supabaseAdmin()

  const { data: config } = await db
    .from('ai_employee_config')
    .select('enabled, business_type, greeting_message, policies')
    .eq('account_id', args.accountId)
    .maybeSingle()
  if (!config?.enabled) return

  // Only ever acts on an OPEN conversation. A human closing it or an
  // earlier escalate() call setting it to 'pending' both stop the
  // agent from responding — no separate flag needed.
  const { data: conversation } = await db
    .from('conversations')
    .select('status')
    .eq('id', args.conversationId)
    .maybeSingle()
  if (conversation?.status !== 'open') return

  const { data: catalog } = await db
    .from('catalog_items')
    .select('name, description, price, currency, category')
    .eq('account_id', args.accountId)
    .eq('available', true)
    .limit(200)

  const { data: knowledge } = await db
    .from('business_knowledge')
    .select('title, content')
    .eq('account_id', args.accountId)
    .limit(100)

  const { data: messages } = await db
    .from('messages')
    .select('sender_type, content_text, created_at')
    .eq('conversation_id', args.conversationId)
    .order('created_at', { ascending: false })
    .limit(30)

  const transcript = decryptMessages((messages ?? []).slice().reverse())
    .filter((m) => m.content_text)
    .map((m) => `${m.sender_type === 'customer' ? 'Customer' : m.sender_type === 'bot' ? 'You' : 'Agent'}: ${m.content_text}`)
    .join('\n')
  if (!transcript.trim()) return

  const catalogText = (catalog ?? []).length
    ? catalog!.map((c) => `- ${c.name}${c.category ? ` (${c.category})` : ''}: ${c.currency} ${c.price}${c.description ? ` — ${c.description}` : ''}`).join('\n')
    : '(no catalog items configured yet — answer questions but say ordering isn\'t set up yet if asked to order)'

  const knowledgeText = (knowledge ?? []).length
    ? knowledge!.map((k) => `${k.title}: ${k.content}`).join('\n')
    : '(none saved)'

  const systemPrompt = `You are the WhatsApp assistant for a ${config.business_type} business. You handle the ENTIRE conversation — answer questions, help the customer order/book from the catalog below, and confirm only once they've clearly said yes to a specific order. Never invent prices or items not in the catalog. If the customer wants something not in your power (a complaint, a refund, a custom request, negotiating price, or they explicitly ask for a human), escalate instead of guessing.

${config.greeting_message ? `Greeting style: ${config.greeting_message}\n` : ''}${config.policies ? `Business policies: ${config.policies}\n` : ''}
Catalog:
${catalogText}

Saved business knowledge:
${knowledgeText}

Read the conversation below (ends with the customer's latest message) and respond. Return strict JSON:
{
  "reply": "the exact message to send back to the customer",
  "action": "none" | "confirm_order" | "escalate",
  "order_items": [{"name": "string", "qty": number, "price": number}] (only if action is confirm_order, must match catalog items/prices),
  "order_total": number (only if action is confirm_order),
  "escalate_reason": "string" (only if action is escalate)
}
Use "confirm_order" ONLY when the customer has just given a clear yes/confirmation to a specific, priced order — not when they're still browsing or asking questions.`

  let parsed: {
    reply?: string
    action?: string
    order_items?: { name: string; qty: number; price: number }[]
    order_total?: number
    escalate_reason?: string
  }
  try {
    const completion = await model.client.chat.completions.create({
      model: model.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: transcript.slice(0, 12000) },
      ],
      temperature: 0.4,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    })
    parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}')
  } catch (err) {
    console.error('[ai-employee] AI call failed:', args.conversationId, err)
    return
  }

  const reply = typeof parsed.reply === 'string' ? parsed.reply.trim() : ''
  if (!reply) return

  if (parsed.action === 'confirm_order' && Array.isArray(parsed.order_items) && parsed.order_items.length > 0) {
    const currency = catalog?.[0]?.currency ?? 'USD'
    const { error: orderErr } = await db.from('bot_orders').insert({
      account_id: args.accountId,
      contact_id: args.contactId,
      conversation_id: args.conversationId,
      items: parsed.order_items,
      total: typeof parsed.order_total === 'number' ? parsed.order_total : 0,
      currency,
    })
    if (orderErr) console.error('[ai-employee] order insert failed:', args.conversationId, orderErr)
  } else if (parsed.action === 'escalate') {
    const { error: escalateErr } = await db.from('conversations').update({ status: 'pending' }).eq('id', args.conversationId)
    if (escalateErr) console.error('[ai-employee] escalate update failed:', args.conversationId, escalateErr)
  }

  try {
    await engineSendText({
      accountId: args.accountId,
      userId: args.userId,
      conversationId: args.conversationId,
      contactId: args.contactId,
      text: reply,
    })
  } catch (sendErr) {
    console.error('[ai-employee] send failed:', args.conversationId, sendErr)
  }
}
