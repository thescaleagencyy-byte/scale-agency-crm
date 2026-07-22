import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import type OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getOpenAIClient } from '@/lib/openai/client';
import { decryptText } from '@/lib/crypto';
import { CLIENT_INDUSTRY, CLIENT_NAME } from '@/lib/features';
import { getEmployee } from '@/lib/ai-employees';

// ============================================================
// /api/ai/assistant — ad-hoc business Q&A chat.
//
// The floating header widget POSTs { question, history } and gets
// back a terse bullet answer grounded in live account data. All
// queries run through the caller's RLS-scoped client, so tenancy
// is enforced by the same policies the dashboard pages rely on.
// Message bodies are intentionally NOT included — they're
// encrypted at rest and the widget only needs aggregates.
// ============================================================

const IS_RENTAL_INDUSTRY = (() => {
  const ind = (CLIENT_INDUSTRY || CLIENT_NAME).toLowerCase();
  return ind.includes('logistic') || ind.includes('transport') || ind.includes('car') || ind.includes('wheel');
})();
const BUSINESS_LABEL = IS_RENTAL_INDUSTRY
  ? `${CLIENT_NAME || 'this business'}, a heavy equipment/vehicle rental business serving project sites`
  : CLIENT_INDUSTRY
    ? `${CLIENT_NAME || 'this business'}, a ${CLIENT_INDUSTRY.toLowerCase()} business`
    : CLIENT_NAME || 'this business';
const AI_LABEL = CLIENT_NAME ? `${CLIENT_NAME} AI` : 'Scale Agency AI';

interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ============================================================
// Tools — the "AI does the work" layer, not just Q&A.
//
// Every tool executes through the caller's own RLS-scoped Supabase
// client (the same `supabase` used for buildDataContext below), so
// a tool call can never touch another account's rows — RLS is the
// safety boundary, not prompt instructions. Scoped deliberately
// narrow for v1: one safe, reversible action (lead status), not a
// generic "run any SQL" tool. Ambiguous matches are refused rather
// than guessed — better to ask the user than update the wrong lead.
// ============================================================

const LEAD_STATUS_VALUES = ['new', 'called', 'won', 'lost'] as const;
const APPOINTMENT_STATUS_VALUES = ['confirmed', 'completed', 'cancelled'] as const;
const CONVERSATION_STATUS_VALUES = ['open', 'pending', 'closed'] as const;
const INVOICE_STATUS_VALUES = ['unpaid', 'paid', 'overdue', 'cancelled'] as const;
const CONTENT_POST_STATUS_VALUES = ['draft', 'scheduled', 'posted', 'cancelled'] as const;

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'update_lead_status',
    description:
      "Update a lead's status (new/called/won/lost). Use when the user asks to mark, close, or update a specific lead by name or phone. Do not guess which lead if the search matches more than one — the tool will tell you and you should ask the user to be more specific.",
    input_schema: {
      type: 'object',
      properties: {
        customer_search: {
          type: 'string',
          description: "The lead's customer name or phone number (or a fragment of either) to find the right row.",
        },
        status: { type: 'string', enum: [...LEAD_STATUS_VALUES] },
      },
      required: ['customer_search', 'status'],
    },
  },
  {
    name: 'update_appointment_status',
    description:
      "Update an appointment's status (confirmed/completed/cancelled) for a contact, found by name or phone. Use for 'cancel X's appointment', 'mark Y's appointment complete', etc. If the search matches more than one appointment, ask the user to be more specific instead of guessing.",
    input_schema: {
      type: 'object',
      properties: {
        customer_search: {
          type: 'string',
          description: "The contact's name or phone number (or a fragment of either) to find their appointment.",
        },
        status: { type: 'string', enum: [...APPOINTMENT_STATUS_VALUES] },
      },
      required: ['customer_search', 'status'],
    },
  },
  {
    name: 'update_conversation_status',
    description:
      "Update a WhatsApp conversation's internal status (open/pending/closed) for a contact, found by name or phone. This is internal bookkeeping only — it does NOT send any message to the customer. Use for 'close X's conversation', 'mark Y's chat as pending', etc. If the search matches more than one open conversation, ask the user to be more specific instead of guessing.",
    input_schema: {
      type: 'object',
      properties: {
        customer_search: {
          type: 'string',
          description: "The contact's name or phone number (or a fragment of either) to find their conversation.",
        },
        status: { type: 'string', enum: [...CONVERSATION_STATUS_VALUES] },
      },
      required: ['customer_search', 'status'],
    },
  },
  {
    name: 'update_invoice_status',
    description:
      "Update an invoice's status (unpaid/paid/overdue/cancelled) for a contact, found by name or phone. Use for 'mark X's invoice paid', 'X hasn't paid yet', etc. Setting status to 'paid' also records the payment time. If the search matches more than one unpaid invoice for that contact, ask the user to be more specific instead of guessing.",
    input_schema: {
      type: 'object',
      properties: {
        customer_search: {
          type: 'string',
          description: "The contact's name or phone number (or a fragment of either) to find their invoice.",
        },
        status: { type: 'string', enum: [...INVOICE_STATUS_VALUES] },
      },
      required: ['customer_search', 'status'],
    },
  },
  {
    name: 'update_content_post_status',
    description:
      "Update a content post's status (draft/scheduled/posted/cancelled), found by title. This is internal calendar tracking only — it does NOT actually post anything to Instagram/TikTok/LinkedIn/YouTube/Facebook, no social API is connected. Use for 'mark X post as scheduled', 'the Y video is posted now', etc. If the title matches more than one post, ask the user to be more specific instead of guessing.",
    input_schema: {
      type: 'object',
      properties: {
        title_search: {
          type: 'string',
          description: "The post's title (or a fragment of it) to find the right row.",
        },
        status: { type: 'string', enum: [...CONTENT_POST_STATUS_VALUES] },
      },
      required: ['title_search', 'status'],
    },
  },
  {
    name: 'create_deal',
    description:
      'Create a new deal in the sales pipeline for a contact, found by name or phone. Lands in the pipeline\'s first stage. Use for "add a deal for X worth Y", "create a deal", etc. If the contact search matches more than one person, ask which one instead of guessing.',
    input_schema: {
      type: 'object',
      properties: {
        contact_search: { type: 'string', description: "The contact's name or phone number (or a fragment) to link the deal to." },
        title: { type: 'string', description: 'Short deal title, e.g. "Ahmed Textiles — Automation Setup".' },
        value: { type: 'number', description: 'Deal value as a plain number, no currency symbol.' },
      },
      required: ['contact_search', 'title', 'value'],
    },
  },
  {
    name: 'create_reminder',
    description:
      'Create a follow-up reminder for a lead or contact, found by name or phone. Use for "remind me to follow up with X tomorrow", "set a reminder", etc. due_date must be an ISO date (YYYY-MM-DD) — compute it yourself from the user\'s wording ("tomorrow", "next Monday") using the current date given in your data context.',
    input_schema: {
      type: 'object',
      properties: {
        entity_search: { type: 'string', description: "The lead or contact's name or phone number (or a fragment) this reminder is about." },
        due_date: { type: 'string', description: 'ISO date YYYY-MM-DD.' },
        note: { type: 'string', description: 'What to do — e.g. "Follow up on pricing question".' },
      },
      required: ['entity_search', 'due_date', 'note'],
    },
  },
  {
    name: 'create_appointment',
    description:
      'Book an appointment for a contact with an existing service, found by name or phone. Fails honestly if no matching service or contact is found rather than guessing. start_at must be an ISO datetime — compute it from the user\'s wording using the current date/time in your data context.',
    input_schema: {
      type: 'object',
      properties: {
        contact_search: { type: 'string', description: "The contact's name or phone number (or a fragment)." },
        service_search: { type: 'string', description: 'The service name (or a fragment) — must match an existing booking service.' },
        start_at: { type: 'string', description: 'ISO datetime for the appointment start.' },
      },
      required: ['contact_search', 'service_search', 'start_at'],
    },
  },
  {
    name: 'analyze_competitor',
    description:
      'Scrape a tracked competitor\'s website and summarize pricing/offers/positioning, found by name. Fails honestly if the competitor isn\'t tracked yet, if Firecrawl isn\'t configured for this deployment, or if no Claude key is set. Use for "check on X competitor", "what is Y charging now", "analyze the competition", etc.',
    input_schema: {
      type: 'object',
      properties: {
        name_search: { type: 'string', description: "The tracked competitor's name (or a fragment) to find the right row." },
      },
      required: ['name_search'],
    },
  },
];

// Same tools, OpenAI's function-calling shape — kept as separate literals
// (rather than transformed from TOOLS) since the two SDKs' schemas diverge
// enough that a generic converter would be harder to read than this.
const OPENAI_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'update_lead_status',
      description:
        "Update a lead's status (new/called/won/lost). Use when the user asks to mark, close, or update a specific lead by name or phone. Do not guess which lead if the search matches more than one — the tool will tell you and you should ask the user to be more specific.",
      parameters: {
        type: 'object',
        properties: {
          customer_search: {
            type: 'string',
            description: "The lead's customer name or phone number (or a fragment of either) to find the right row.",
          },
          status: { type: 'string', enum: [...LEAD_STATUS_VALUES] },
        },
        required: ['customer_search', 'status'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_appointment_status',
      description:
        "Update an appointment's status (confirmed/completed/cancelled) for a contact, found by name or phone. Use for 'cancel X's appointment', 'mark Y's appointment complete', etc. If the search matches more than one appointment, ask the user to be more specific instead of guessing.",
      parameters: {
        type: 'object',
        properties: {
          customer_search: {
            type: 'string',
            description: "The contact's name or phone number (or a fragment of either) to find their appointment.",
          },
          status: { type: 'string', enum: [...APPOINTMENT_STATUS_VALUES] },
        },
        required: ['customer_search', 'status'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_conversation_status',
      description:
        "Update a WhatsApp conversation's internal status (open/pending/closed) for a contact, found by name or phone. This is internal bookkeeping only — it does NOT send any message to the customer. Use for 'close X's conversation', 'mark Y's chat as pending', etc. If the search matches more than one open conversation, ask the user to be more specific instead of guessing.",
      parameters: {
        type: 'object',
        properties: {
          customer_search: {
            type: 'string',
            description: "The contact's name or phone number (or a fragment of either) to find their conversation.",
          },
          status: { type: 'string', enum: [...CONVERSATION_STATUS_VALUES] },
        },
        required: ['customer_search', 'status'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_invoice_status',
      description:
        "Update an invoice's status (unpaid/paid/overdue/cancelled) for a contact, found by name or phone. Use for 'mark X's invoice paid', 'X hasn't paid yet', etc. Setting status to 'paid' also records the payment time. If the search matches more than one unpaid invoice for that contact, ask the user to be more specific instead of guessing.",
      parameters: {
        type: 'object',
        properties: {
          customer_search: {
            type: 'string',
            description: "The contact's name or phone number (or a fragment of either) to find their invoice.",
          },
          status: { type: 'string', enum: [...INVOICE_STATUS_VALUES] },
        },
        required: ['customer_search', 'status'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_content_post_status',
      description:
        "Update a content post's status (draft/scheduled/posted/cancelled), found by title. This is internal calendar tracking only — it does NOT actually post anything to Instagram/TikTok/LinkedIn/YouTube/Facebook, no social API is connected. Use for 'mark X post as scheduled', 'the Y video is posted now', etc. If the title matches more than one post, ask the user to be more specific instead of guessing.",
      parameters: {
        type: 'object',
        properties: {
          title_search: {
            type: 'string',
            description: "The post's title (or a fragment of it) to find the right row.",
          },
          status: { type: 'string', enum: [...CONTENT_POST_STATUS_VALUES] },
        },
        required: ['title_search', 'status'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_deal',
      description:
        'Create a new deal in the sales pipeline for a contact, found by name or phone. Lands in the pipeline\'s first stage. If the contact search matches more than one person, ask which one instead of guessing.',
      parameters: {
        type: 'object',
        properties: {
          contact_search: { type: 'string', description: "The contact's name or phone number (or a fragment) to link the deal to." },
          title: { type: 'string', description: 'Short deal title.' },
          value: { type: 'number', description: 'Deal value as a plain number.' },
        },
        required: ['contact_search', 'title', 'value'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_reminder',
      description:
        'Create a follow-up reminder for a lead or contact, found by name or phone. due_date must be ISO YYYY-MM-DD, computed from the user\'s wording using the current date in your data context.',
      parameters: {
        type: 'object',
        properties: {
          entity_search: { type: 'string', description: "The lead or contact's name or phone number (or a fragment)." },
          due_date: { type: 'string', description: 'ISO date YYYY-MM-DD.' },
          note: { type: 'string', description: 'What to do.' },
        },
        required: ['entity_search', 'due_date', 'note'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_appointment',
      description:
        'Book an appointment for a contact with an existing service, found by name or phone. Fails honestly if no matching service or contact is found. start_at must be an ISO datetime.',
      parameters: {
        type: 'object',
        properties: {
          contact_search: { type: 'string', description: "The contact's name or phone number (or a fragment)." },
          service_search: { type: 'string', description: 'The service name (or a fragment) — must match an existing booking service.' },
          start_at: { type: 'string', description: 'ISO datetime for the appointment start.' },
        },
        required: ['contact_search', 'service_search', 'start_at'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'analyze_competitor',
      description:
        'Scrape a tracked competitor\'s website and summarize pricing/offers/positioning, found by name. Fails honestly if not tracked yet, Firecrawl not configured, or no Claude key set.',
      parameters: {
        type: 'object',
        properties: {
          name_search: { type: 'string', description: "The tracked competitor's name (or a fragment)." },
        },
        required: ['name_search'],
      },
    },
  },
];

async function runTool(
  db: SupabaseClient,
  name: string,
  input: Record<string, unknown>,
  accountId: string,
  userId: string,
): Promise<string> {
  if (name === 'update_lead_status') {
    const search = String(input.customer_search ?? '').trim();
    const status = String(input.status ?? '');
    if (!search) return 'Error: no customer_search provided.';
    if (!(LEAD_STATUS_VALUES as readonly string[]).includes(status)) {
      return `Error: "${status}" is not a valid status. Valid: ${LEAD_STATUS_VALUES.join(', ')}.`;
    }

    const { data: matches, error } = await db
      .from('leads')
      .select('id, customer_name, customer_phone, status')
      .or(`customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%`)
      .limit(5);
    if (error) return `Error looking up lead: ${error.message}`;
    if (!matches || matches.length === 0) return `No lead found matching "${search}".`;
    if (matches.length > 1) {
      const list = matches.map((m) => `${m.customer_name ?? 'Unknown'} (${m.customer_phone})`).join(', ');
      return `Found ${matches.length} leads matching "${search}": ${list}. Ask the user which one they mean before updating.`;
    }

    const lead = matches[0];
    const { error: updateErr } = await db
      .from('leads')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', lead.id);
    if (updateErr) return `Error updating lead: ${updateErr.message}`;
    return `Updated ${lead.customer_name ?? lead.customer_phone}'s lead status from "${lead.status}" to "${status}".`;
  }

  if (name === 'update_appointment_status') {
    const search = String(input.customer_search ?? '').trim();
    const status = String(input.status ?? '');
    if (!search) return 'Error: no customer_search provided.';
    if (!(APPOINTMENT_STATUS_VALUES as readonly string[]).includes(status)) {
      return `Error: "${status}" is not a valid status. Valid: ${APPOINTMENT_STATUS_VALUES.join(', ')}.`;
    }

    const { data: matches, error } = await db
      .from('appointments')
      .select('id, status, contact:contacts!inner(name, phone), service:booking_services(name)')
      .or(`name.ilike.%${search}%,phone.ilike.%${search}%`, { referencedTable: 'contacts' })
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) return `Error looking up appointment: ${error.message}`;
    if (!matches || matches.length === 0) return `No appointment found for a contact matching "${search}".`;
    if (matches.length > 1) {
      const list = matches
        .map((m) => {
          const c = Array.isArray(m.contact) ? m.contact[0] : m.contact;
          const s = Array.isArray(m.service) ? m.service[0] : m.service;
          return `${c?.name ?? c?.phone ?? 'Unknown'}${s?.name ? ` (${s.name})` : ''} — currently ${m.status}`;
        })
        .join('; ');
      return `Found ${matches.length} appointments matching "${search}": ${list}. Ask the user which one they mean before updating.`;
    }

    const appt = matches[0];
    const contact = Array.isArray(appt.contact) ? appt.contact[0] : appt.contact;
    const { error: updateErr } = await db
      .from('appointments')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', appt.id);
    if (updateErr) return `Error updating appointment: ${updateErr.message}`;
    return `Updated ${contact?.name ?? contact?.phone ?? 'the'} appointment status from "${appt.status}" to "${status}".`;
  }

  if (name === 'update_conversation_status') {
    const search = String(input.customer_search ?? '').trim();
    const status = String(input.status ?? '');
    if (!search) return 'Error: no customer_search provided.';
    if (!(CONVERSATION_STATUS_VALUES as readonly string[]).includes(status)) {
      return `Error: "${status}" is not a valid status. Valid: ${CONVERSATION_STATUS_VALUES.join(', ')}.`;
    }

    const { data: matches, error } = await db
      .from('conversations')
      .select('id, status, contact:contacts!inner(name, phone)')
      .or(`name.ilike.%${search}%,phone.ilike.%${search}%`, { referencedTable: 'contacts' })
      .order('last_message_at', { ascending: false })
      .limit(5);
    if (error) return `Error looking up conversation: ${error.message}`;
    if (!matches || matches.length === 0) return `No conversation found for a contact matching "${search}".`;
    if (matches.length > 1) {
      const list = matches
        .map((m) => {
          const c = Array.isArray(m.contact) ? m.contact[0] : m.contact;
          return `${c?.name ?? c?.phone ?? 'Unknown'} — currently ${m.status}`;
        })
        .join('; ');
      return `Found ${matches.length} conversations matching "${search}": ${list}. Ask the user which one they mean before updating.`;
    }

    const convo = matches[0];
    const contact = Array.isArray(convo.contact) ? convo.contact[0] : convo.contact;
    const { error: updateErr } = await db
      .from('conversations')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', convo.id);
    if (updateErr) return `Error updating conversation: ${updateErr.message}`;
    return `Updated ${contact?.name ?? contact?.phone ?? 'the'} conversation status from "${convo.status}" to "${status}". No message was sent to the customer.`;
  }

  if (name === 'update_invoice_status') {
    const search = String(input.customer_search ?? '').trim();
    const status = String(input.status ?? '');
    if (!search) return 'Error: no customer_search provided.';
    if (!(INVOICE_STATUS_VALUES as readonly string[]).includes(status)) {
      return `Error: "${status}" is not a valid status. Valid: ${INVOICE_STATUS_VALUES.join(', ')}.`;
    }

    const { data: matches, error } = await db
      .from('client_invoices')
      .select('id, title, amount, currency, status, contact:contacts!inner(name, phone)')
      .or(`name.ilike.%${search}%,phone.ilike.%${search}%`, { referencedTable: 'contacts' })
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) return `Error looking up invoice: ${error.message}`;
    if (!matches || matches.length === 0) return `No invoice found for a contact matching "${search}".`;
    if (matches.length > 1) {
      const list = matches
        .map((m) => {
          const c = Array.isArray(m.contact) ? m.contact[0] : m.contact;
          return `${c?.name ?? c?.phone ?? 'Unknown'} — ${m.title} (${m.currency} ${m.amount}) — currently ${m.status}`;
        })
        .join('; ');
      return `Found ${matches.length} invoices matching "${search}": ${list}. Ask the user which one they mean before updating.`;
    }

    const invoice = matches[0];
    const contact = Array.isArray(invoice.contact) ? invoice.contact[0] : invoice.contact;
    const { error: updateErr } = await db
      .from('client_invoices')
      .update({
        status,
        updated_at: new Date().toISOString(),
        paid_at: status === 'paid' ? new Date().toISOString() : null,
      })
      .eq('id', invoice.id);
    if (updateErr) return `Error updating invoice: ${updateErr.message}`;
    return `Updated ${contact?.name ?? contact?.phone ?? 'the'}'s invoice "${invoice.title}" (${invoice.currency} ${invoice.amount}) status from "${invoice.status}" to "${status}".`;
  }

  if (name === 'update_content_post_status') {
    const search = String(input.title_search ?? '').trim();
    const status = String(input.status ?? '');
    if (!search) return 'Error: no title_search provided.';
    if (!(CONTENT_POST_STATUS_VALUES as readonly string[]).includes(status)) {
      return `Error: "${status}" is not a valid status. Valid: ${CONTENT_POST_STATUS_VALUES.join(', ')}.`;
    }

    const { data: matches, error } = await db
      .from('content_posts')
      .select('id, title, platform, status')
      .ilike('title', `%${search}%`)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) return `Error looking up content post: ${error.message}`;
    if (!matches || matches.length === 0) return `No content post found matching "${search}".`;
    if (matches.length > 1) {
      const list = matches.map((m) => `"${m.title}" (${m.platform}) — currently ${m.status}`).join('; ');
      return `Found ${matches.length} posts matching "${search}": ${list}. Ask the user which one they mean before updating.`;
    }

    const post = matches[0];
    const { error: updateErr } = await db
      .from('content_posts')
      .update({
        status,
        updated_at: new Date().toISOString(),
        posted_at: status === 'posted' ? new Date().toISOString() : null,
      })
      .eq('id', post.id);
    if (updateErr) return `Error updating content post: ${updateErr.message}`;
    return `Updated "${post.title}" (${post.platform}) status from "${post.status}" to "${status}". No post was actually published — this is calendar tracking only.`;
  }

  if (name === 'create_deal') {
    const search = String(input.contact_search ?? '').trim();
    const title = String(input.title ?? '').trim();
    const value = Number(input.value ?? 0);
    if (!search || !title) return 'Error: contact_search and title are required.';

    const { data: contacts, error: contactErr } = await db
      .from('contacts')
      .select('id, name, phone')
      .or(`name.ilike.%${search}%,phone.ilike.%${search}%`)
      .limit(5);
    if (contactErr) return `Error looking up contact: ${contactErr.message}`;
    if (!contacts || contacts.length === 0) return `No contact found matching "${search}".`;
    if (contacts.length > 1) {
      return `Found ${contacts.length} contacts matching "${search}": ${contacts.map((c) => `${c.name ?? c.phone}`).join(', ')}. Ask the user which one they mean before creating the deal.`;
    }

    const { data: pipeline, error: pipeErr } = await db
      .from('pipelines')
      .select('id')
      .eq('account_id', accountId)
      .limit(1)
      .maybeSingle();
    if (pipeErr || !pipeline) return 'Error: no pipeline exists for this account yet.';

    const { data: stage, error: stageErr } = await db
      .from('pipeline_stages')
      .select('id, name')
      .eq('pipeline_id', pipeline.id)
      .order('position', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (stageErr || !stage) return 'Error: no pipeline stage exists for this account yet.';

    const contact = contacts[0];
    const { error: insertErr } = await db.from('deals').insert({
      user_id: userId,
      account_id: accountId,
      pipeline_id: pipeline.id,
      stage_id: stage.id,
      contact_id: contact.id,
      title,
      value: isNaN(value) ? 0 : value,
      status: 'open',
    });
    if (insertErr) return `Error creating deal: ${insertErr.message}`;
    return `Created deal "${title}" for ${contact.name ?? contact.phone}, value ${value}, in stage "${stage.name}".`;
  }

  if (name === 'create_reminder') {
    const search = String(input.entity_search ?? '').trim();
    const dueDate = String(input.due_date ?? '').trim();
    const note = String(input.note ?? '').trim();
    if (!search || !dueDate) return 'Error: entity_search and due_date are required.';

    const [leadMatches, contactMatches] = await Promise.all([
      db.from('leads').select('id, customer_name, customer_phone').or(`customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%`).limit(5),
      db.from('contacts').select('id, name, phone').or(`name.ilike.%${search}%,phone.ilike.%${search}%`).limit(5),
    ]);
    const leads = leadMatches.data ?? [];
    const contacts = contactMatches.data ?? [];
    const totalMatches = leads.length + contacts.length;
    if (totalMatches === 0) return `No lead or contact found matching "${search}".`;
    if (totalMatches > 1) {
      const names = [...leads.map((l) => l.customer_name ?? l.customer_phone), ...contacts.map((c) => c.name ?? c.phone)];
      return `Found ${totalMatches} matches for "${search}": ${names.join(', ')}. Ask the user which one they mean before creating the reminder.`;
    }

    const entityType = leads.length === 1 ? 'lead' : 'contact';
    const entity = leads.length === 1 ? leads[0] : contacts[0];
    const entityLabel = leads.length === 1
      ? (leads[0].customer_name ?? leads[0].customer_phone)
      : (contacts[0].name ?? contacts[0].phone);

    const { error: insertErr } = await db.from('follow_up_reminders').insert({
      account_id: accountId,
      user_id: userId,
      entity_type: entityType,
      entity_id: entity.id,
      due_at: new Date(dueDate).toISOString(),
      note: note || null,
    });
    if (insertErr) return `Error creating reminder: ${insertErr.message}`;
    return `Created a reminder for ${entityLabel} on ${dueDate}${note ? `: "${note}"` : ''}.`;
  }

  if (name === 'create_appointment') {
    const contactSearch = String(input.contact_search ?? '').trim();
    const serviceSearch = String(input.service_search ?? '').trim();
    const startAt = String(input.start_at ?? '').trim();
    if (!contactSearch || !serviceSearch || !startAt) return 'Error: contact_search, service_search, and start_at are all required.';

    const [contactsRes, servicesRes] = await Promise.all([
      db.from('contacts').select('id, name, phone').or(`name.ilike.%${contactSearch}%,phone.ilike.%${contactSearch}%`).limit(5),
      db.from('booking_services').select('id, name, duration_minutes').eq('account_id', accountId).ilike('name', `%${serviceSearch}%`).limit(5),
    ]);
    const contacts = contactsRes.data ?? [];
    const services = servicesRes.data ?? [];
    if (contacts.length === 0) return `No contact found matching "${contactSearch}".`;
    if (contacts.length > 1) return `Found ${contacts.length} contacts matching "${contactSearch}": ${contacts.map((c) => c.name ?? c.phone).join(', ')}. Ask which one before booking.`;
    if (services.length === 0) return `No service found matching "${serviceSearch}". Ask the user to check the exact service name in Settings.`;
    if (services.length > 1) return `Found ${services.length} services matching "${serviceSearch}": ${services.map((s) => s.name).join(', ')}. Ask which one before booking.`;

    const contact = contacts[0];
    const service = services[0];
    const startDate = new Date(startAt);
    const endDate = new Date(startDate.getTime() + (service.duration_minutes ?? 30) * 60000);

    const { data: slot, error: slotErr } = await db
      .from('booking_slots')
      .insert({
        account_id: accountId,
        service_id: service.id,
        start_at: startDate.toISOString(),
        end_at: endDate.toISOString(),
        max_bookings: 1,
        booked_count: 1,
      })
      .select()
      .single();
    if (slotErr || !slot) return `Error creating time slot: ${slotErr?.message}`;

    const { error: apptErr } = await db.from('appointments').insert({
      account_id: accountId,
      slot_id: slot.id,
      contact_id: contact.id,
      service_id: service.id,
      status: 'confirmed',
    });
    if (apptErr) return `Error creating appointment: ${apptErr.message}`;
    return `Booked ${contact.name ?? contact.phone} for "${service.name}" on ${startDate.toLocaleString()}.`;
  }

  if (name === 'analyze_competitor') {
    const search = String(input.name_search ?? '').trim();
    if (!search) return 'Error: name_search is required.';

    const { data: matches } = await db
      .from('competitors')
      .select('id, name, url')
      .eq('account_id', accountId)
      .ilike('name', `%${search}%`)
      .limit(5);
    const competitors = matches ?? [];
    if (competitors.length === 0) return `No tracked competitor found matching "${search}". Add it in Competitor Intel first.`;
    if (competitors.length > 1) return `Found ${competitors.length} competitors matching "${search}": ${competitors.map((c) => c.name).join(', ')}. Ask which one before analyzing.`;

    const competitor = competitors[0];
    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    if (!firecrawlKey) return `Competitor tracked, but Firecrawl isn't configured for this deployment yet — add FIRECRAWL_API_KEY to enable scraping ${competitor.name}'s site.`;

    const scrapeRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: { Authorization: `Bearer ${firecrawlKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: competitor.url, formats: ['markdown'] }),
    });
    if (!scrapeRes.ok) return `Firecrawl scrape of ${competitor.url} failed: ${scrapeRes.status}.`;
    const scrapeData = await scrapeRes.json();
    const markdown: string = scrapeData?.data?.markdown ?? scrapeData?.markdown ?? '';
    if (!markdown) return `Firecrawl returned no content for ${competitor.url}.`;

    const { data: aiConfig } = await db.from('ai_config').select('claude_api_key').eq('account_id', accountId).maybeSingle();
    let claudeKey: string | null = null;
    if (aiConfig?.claude_api_key) {
      try { claudeKey = decryptText(aiConfig.claude_api_key); } catch { claudeKey = null; }
    }
    if (!claudeKey) return `Competitor tracked and scraped, but no Claude API key is configured to summarize it — add one in Settings → AI Insights.`;

    const anthropic = new Anthropic({ apiKey: claudeKey });
    const summaryRes = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 500,
      system: 'Summarize this competitor\'s website content in 5-8 bullet points: pricing (if visible), current offers/promotions, positioning, anything change-worthy. Bullets only, no intro/outro.',
      messages: [{ role: 'user', content: markdown.slice(0, 15000) }],
    });
    const summary = summaryRes.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('').trim();

    await db.from('competitors').update({ last_summary: summary, last_checked_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', competitor.id);
    return `Analyzed ${competitor.name}:\n${summary}`;
  }

  return `Error: unknown tool "${name}".`;
}

function count<T extends Record<string, unknown>>(rows: T[], key: keyof T): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const v = String(r[key] ?? 'unknown');
    out[v] = (out[v] ?? 0) + 1;
  }
  return out;
}

function since(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

async function buildDataContext(db: SupabaseClient, currency: string): Promise<string> {
  const d7 = since(7);
  const d30 = since(30);

  const [leadsRes, dealsRes, stagesRes, convsRes, contactsRes, apptsRes, broadcastsRes, invoicesRes, contentPostsRes] =
    await Promise.all([
      db
        .from('leads')
        .select('customer_name, company, service_type, project_site, duration, source, status, score, created_at')
        .order('created_at', { ascending: false })
        .limit(500),
      db
        .from('deals')
        .select('title, value, status, stage_id, created_at, updated_at')
        .order('updated_at', { ascending: false })
        .limit(500),
      db.from('pipeline_stages').select('id, name, position').order('position'),
      db
        .from('conversations')
        .select('status, created_at, resolved_at')
        .order('created_at', { ascending: false })
        .limit(500),
      db.from('contacts').select('id', { count: 'exact', head: true }),
      db
        .from('appointments')
        .select('status, created_at, slot:booking_slots(start_at), service:booking_services(name)')
        .order('created_at', { ascending: false })
        .limit(200),
      db
        .from('broadcasts')
        .select('name, status, total_recipients, sent_count, created_at')
        .order('created_at', { ascending: false })
        .limit(20),
      db
        .from('client_invoices')
        .select('title, amount, currency, status, due_date, contact:contacts(name, phone), created_at')
        .order('due_date', { ascending: true })
        .limit(200),
      db
        .from('content_posts')
        .select('title, platform, status, scheduled_for, posted_at, created_at')
        .neq('status', 'cancelled')
        .order('scheduled_for', { ascending: true })
        .limit(100),
    ]);

  const leads = (leadsRes.data ?? []) as {
    customer_name: string | null;
    company: string | null;
    service_type: string | null;
    project_site: string | null;
    duration: string | null;
    source: string | null;
    status: string;
    score: number;
    created_at: string;
  }[];
  const deals = (dealsRes.data ?? []) as {
    title: string;
    value: number | null;
    status: string;
    stage_id: string;
    created_at: string;
    updated_at: string;
  }[];
  const stages = (stagesRes.data ?? []) as { id: string; name: string }[];
  const convs = (convsRes.data ?? []) as { status: string; created_at: string }[];
  const appts = (apptsRes.data ?? []) as unknown as {
    status: string;
    created_at: string;
    slot: { start_at: string }[] | { start_at: string } | null;
    service: { name: string }[] | { name: string } | null;
  }[];
  const broadcasts = (broadcastsRes.data ?? []) as {
    name: string;
    status: string;
    total_recipients: number;
    sent_count: number | null;
    created_at: string;
  }[];
  const invoices = (invoicesRes.data ?? []) as unknown as {
    title: string;
    amount: number;
    currency: string;
    status: string;
    due_date: string | null;
    contact: { name: string | null; phone: string }[] | { name: string | null; phone: string } | null;
    created_at: string;
  }[];
  const contentPosts = (contentPostsRes.data ?? []) as {
    title: string;
    platform: string;
    status: string;
    scheduled_for: string | null;
    posted_at: string | null;
    created_at: string;
  }[];

  // --- Leads ---
  const leads7 = leads.filter((l) => l.created_at >= d7);
  const leads30 = leads.filter((l) => l.created_at >= d30);
  const hotLeads = leads
    .filter((l) => l.status === 'new' && l.score >= 60)
    .slice(0, 10)
    .map((l) => `${l.customer_name ?? 'Unknown'}${l.company ? ` (${l.company})` : ''} score ${l.score}${l.service_type ? ` — ${l.service_type}` : ''}`);
  const avgScore30 = leads30.length
    ? Math.round(leads30.reduce((s, l) => s + (l.score ?? 0), 0) / leads30.length)
    : 0;

  // --- Pipeline ---
  const stageName = new Map(stages.map((s) => [s.id, s.name]));
  const openDeals = deals.filter((d) => d.status === 'open');
  const byStage: Record<string, { count: number; value: number }> = {};
  for (const d of openDeals) {
    const name = stageName.get(d.stage_id) ?? 'Unknown';
    byStage[name] = byStage[name] ?? { count: 0, value: 0 };
    byStage[name].count += 1;
    byStage[name].value += d.value ?? 0;
  }
  const won30 = deals.filter((d) => d.status === 'won' && d.created_at >= d30);
  const lost30 = deals.filter((d) => d.status === 'lost' && d.created_at >= d30);

  // --- Appointments ---
  const apptRows = appts.map((a) => {
    const slot = Array.isArray(a.slot) ? a.slot[0] : a.slot;
    const service = Array.isArray(a.service) ? a.service[0] : a.service;
    return { status: a.status, start_at: slot?.start_at ?? null, service: service?.name ?? null };
  });
  const upcoming = apptRows.filter((a) => a.start_at && a.start_at >= new Date().toISOString());

  // --- Invoices (Finance OS) ---
  const todayStr = new Date().toISOString().slice(0, 10);
  const invoiceRows = invoices.map((inv) => {
    const c = Array.isArray(inv.contact) ? inv.contact[0] : inv.contact;
    const overdue = inv.status === 'unpaid' && !!inv.due_date && inv.due_date < todayStr;
    return { ...inv, contactLabel: c?.name ?? c?.phone ?? 'Unknown', overdue };
  });
  const unpaid = invoiceRows.filter((i) => i.status === 'unpaid' || i.status === 'overdue');
  const overdueNow = invoiceRows.filter((i) => i.overdue || i.status === 'overdue');
  const paid30 = invoiceRows.filter((i) => i.status === 'paid' && i.created_at >= d30);
  const unpaidTotal = unpaid.reduce((s, i) => s + (i.amount ?? 0), 0);

  // --- Revenue (Revenue OS) — won deals + paid invoices unified into
  // one number. Two different tables record "money in" for two
  // different reasons (a closed deal vs. a settled invoice); a real
  // owner asking "what's today's revenue" means the sum of both, not
  // either one alone. ---
  const wonDeals = deals.filter((d) => d.status === 'won');
  const paidInvoices = invoiceRows.filter((i) => i.status === 'paid');
  const revenueSince = (isoDate: string) =>
    wonDeals.filter((d) => d.updated_at >= isoDate).reduce((s, d) => s + (d.value ?? 0), 0) +
    paidInvoices.filter((i) => i.created_at >= isoDate).reduce((s, i) => s + (i.amount ?? 0), 0);
  const revenueToday = revenueSince(todayStr);
  const revenue7d = revenueSince(d7);
  const revenue30d = revenueSince(d30);
  const revenueTotal =
    wonDeals.reduce((s, d) => s + (d.value ?? 0), 0) + paidInvoices.reduce((s, i) => s + (i.amount ?? 0), 0);

  // --- Content calendar (Marketing OS — planning only, no live posting) ---
  const nowIso = new Date().toISOString();
  const drafts = contentPosts.filter((p) => p.status === 'draft');
  const scheduled = contentPosts.filter((p) => p.status === 'scheduled');
  const upcomingPosts = scheduled.filter((p) => p.scheduled_for && p.scheduled_for >= nowIso);
  const posted30 = contentPosts.filter((p) => p.status === 'posted' && (p.posted_at ?? '') >= d30);

  return `${(CLIENT_NAME || 'BUSINESS').toUpperCase()} — LIVE CRM DATA (currency: ${currency})
Now: ${new Date().toISOString()}

LEADS
• Total tracked: ${leads.length} | Last 7d: ${leads7.length} | Last 30d: ${leads30.length}
• By status: ${JSON.stringify(count(leads, 'status'))}
• 7d by source: ${JSON.stringify(count(leads7, 'source'))}
• 30d by service type: ${JSON.stringify(count(leads30, 'service_type'))}
• 30d by project site: ${JSON.stringify(count(leads30, 'project_site'))}
• Avg score (30d): ${avgScore30}/100
• Hot new leads (score ≥60): ${hotLeads.length ? hotLeads.join('; ') : 'none'}

PIPELINE
• Open deals: ${openDeals.length} worth ${currency} ${openDeals.reduce((s, d) => s + (d.value ?? 0), 0).toLocaleString()}
• By stage: ${JSON.stringify(byStage)}
• Won 30d: ${won30.length} (${currency} ${won30.reduce((s, d) => s + (d.value ?? 0), 0).toLocaleString()}) | Lost 30d: ${lost30.length}

CONVERSATIONS (WhatsApp)
• Open: ${convs.filter((c) => c.status === 'open').length} | Closed: ${convs.filter((c) => c.status === 'closed').length} | New 7d: ${convs.filter((c) => c.created_at >= d7).length}

CONTACTS: ${contactsRes.count ?? 0} total

APPOINTMENTS
• By status: ${JSON.stringify(count(apptRows, 'status'))}
• Upcoming: ${upcoming.length}${upcoming.length ? ` — next: ${upcoming.slice(0, 5).map((a) => `${a.service ?? 'appointment'} ${a.start_at}`).join('; ')}` : ''}

RECENT BROADCASTS
${broadcasts.length ? broadcasts.slice(0, 5).map((b) => `• "${b.name}" ${b.status}, ${b.sent_count ?? 0}/${b.total_recipients} sent (${b.created_at.slice(0, 10)})`).join('\n') : '• none'}

INVOICES (Finance OS)
• Unpaid (incl. overdue): ${unpaid.length} worth ${currency} ${unpaidTotal.toLocaleString()}
• Overdue right now: ${overdueNow.length}${overdueNow.length ? ' — ' + overdueNow.slice(0, 10).map((i) => `${i.contactLabel} (${i.currency} ${i.amount}, due ${i.due_date})`).join('; ') : ''}
• Paid in last 30d: ${paid30.length} (${currency} ${paid30.reduce((s, i) => s + (i.amount ?? 0), 0).toLocaleString()})

REVENUE (Revenue OS — won deals + paid invoices combined)
• Today: ${currency} ${revenueToday.toLocaleString()}
• Last 7d: ${currency} ${revenue7d.toLocaleString()}
• Last 30d: ${currency} ${revenue30d.toLocaleString()}
• All-time: ${currency} ${revenueTotal.toLocaleString()} (${wonDeals.length} won deals + ${paidInvoices.length} paid invoices)

CONTENT CALENDAR (Marketing OS — internal planning only, nothing here is actually posted to any platform, no social API is connected)
• Drafts: ${drafts.length}${drafts.length ? ' — ' + drafts.slice(0, 8).map((p) => `"${p.title}" (${p.platform})`).join('; ') : ''}
• Scheduled: ${scheduled.length}${upcomingPosts.length ? ' — next: ' + upcomingPosts.slice(0, 5).map((p) => `"${p.title}" (${p.platform}) on ${p.scheduled_for?.slice(0, 10)}`).join('; ') : ''}
• Posted in last 30d: ${posted30.length}`;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json().catch(() => null)) as {
      question?: unknown;
      history?: HistoryMessage[];
      employee?: unknown;
    } | null;
    const question = typeof body?.question === 'string' ? body.question.trim() : '';
    if (!question) return NextResponse.json({ error: 'question required' }, { status: 400 });
    const history = Array.isArray(body?.history) ? body.history.slice(-12) : [];
    const employee = getEmployee(typeof body?.employee === 'string' ? body.employee : undefined);
    // Universal Chat — every persona has every tool. Personas are tone
    // and framing only, not an access-control boundary: a real owner
    // switching to "Sales Rep" to talk pipeline shouldn't hit a wall
    // the moment they also ask about an overdue invoice. Access control
    // is RLS (account isolation), not which tab is selected.
    const scopedTools = TOOLS;
    const scopedOpenAITools = OPENAI_TOOLS;

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id, account:accounts(name, default_currency)')
      .eq('user_id', user.id)
      .maybeSingle();
    const account = Array.isArray(profile?.account) ? profile?.account[0] : profile?.account;
    const currency = (account as { default_currency?: string } | null)?.default_currency ?? 'PKR';

    // Engine selection: the workspace Claude key (Settings → AI
    // Insights) wins; the deployment-wide OpenAI env key is the
    // fallback so the widget keeps working before a key is saved.
    let claudeKey: string | null = null;
    if (profile?.account_id) {
      const { data: aiConfig } = await supabase
        .from('ai_config')
        .select('claude_api_key')
        .eq('account_id', profile.account_id)
        .maybeSingle();
      if (aiConfig?.claude_api_key) {
        try {
          claudeKey = decryptText(aiConfig.claude_api_key);
        } catch {
          claudeKey = null; // rotated encryption key — fall back
        }
      }
    }
    const openai = claudeKey ? null : getOpenAIClient();
    if (!claudeKey && !openai) {
      return NextResponse.json(
        { error: 'AI is not configured. Add your Claude API key in Settings → AI Insights.' },
        { status: 400 },
      );
    }

    const dataContext = await buildDataContext(supabase, currency);

    // AI Memory — durable business facts (pricing/SOPs/policies/tone),
    // small enough to paste verbatim into every system prompt rather
    // than semantically searched. Empty until the owner adds any via
    // Settings → Business Knowledge.
    let knowledgeContext = '';
    if (profile?.account_id) {
      const { data: knowledge } = await supabase
        .from('business_knowledge')
        .select('category, title, content')
        .eq('account_id', profile.account_id)
        .order('category');
      if (knowledge && knowledge.length > 0) {
        knowledgeContext = `\n\nBUSINESS KNOWLEDGE (permanent facts the owner has told you — treat as ground truth):\n${knowledge.map((k) => `• [${k.category}] ${k.title}: ${k.content}`).join('\n')}`;
      }
    }

    const TOOL_BLURBS: Record<string, string> = {
      update_lead_status: 'update_lead_status when the user asks to mark/close/update a specific lead',
      update_appointment_status: "update_appointment_status when they ask to cancel/confirm/complete a specific appointment",
      update_conversation_status: "update_conversation_status when they ask to close/reopen a specific WhatsApp conversation (this never sends a message to the customer, it's internal-only)",
      update_invoice_status: 'update_invoice_status when they ask to mark a specific invoice paid/unpaid/cancelled',
      update_content_post_status: "update_content_post_status when they ask to mark a specific content post draft/scheduled/posted/cancelled (this never actually publishes anything, no social API is connected — it's calendar tracking only)",
      create_deal: 'create_deal when they ask to add a new deal for a contact',
      create_reminder: 'create_reminder when they ask to set a follow-up reminder for a lead or contact',
      create_appointment: 'create_appointment when they ask to book a new appointment for a contact with an existing service',
      analyze_competitor: 'analyze_competitor when they ask to check on a tracked competitor\'s pricing/offers/positioning',
    };
    const toolInstructions = Object.values(TOOL_BLURBS).join(', and ');

    const systemPrompt = `You are ${AI_LABEL} — business data terminal for ${BUSINESS_LABEL}, using this WhatsApp CRM.

${employee.persona}${knowledgeContext}

REPLY FORMAT — non-negotiable:
• Bullet points only. NO paragraphs. Max 8 bullet lines.
• Lead each bullet with the number/fact in **bold**.
• No intro, no outro, no "based on the data".
• Money in ${currency}.
• If data can't answer the question, say so in one bullet and suggest the closest answerable metric.

You can also take action, not just report — use ${toolInstructions}. If a tool says multiple matches were found, ask the user to be more specific instead of picking one yourself.`;

    // Data context rides in the first user turn only; follow-ups lean
    // on chat history, mirroring how the widget resends the thread.
    const turns: { role: 'user' | 'assistant'; content: string }[] =
      history.length > 0
        ? [
            {
              role: 'user',
              content: `[BUSINESS DATA]\n${dataContext}\n[END DATA]\n\n${history[0].content}`,
            },
            ...history.slice(1).map((m) => ({ role: m.role, content: m.content })),
            { role: 'user', content: question },
          ]
        : [
            {
              role: 'user',
              content: `[BUSINESS DATA]\n${dataContext}\n[END DATA]\n\n${question}`,
            },
          ];

    let answer: string | undefined;
    let tokensUsed: number | null = null;

    if (claudeKey) {
      const anthropic = new Anthropic({ apiKey: claudeKey });
      let conversation: Anthropic.MessageParam[] = turns;
      let response = await anthropic.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 600,
        thinking: { type: 'adaptive' },
        system: systemPrompt,
        messages: conversation,
        tools: scopedTools,
      });
      tokensUsed = response.usage.input_tokens + response.usage.output_tokens;

      // Tool-use loop: execute any tool calls, feed results back, repeat
      // until Claude replies with plain text. Capped at 3 rounds so a
      // confused model can't loop forever burning tokens.
      let rounds = 0;
      while (response.stop_reason === 'tool_use' && rounds < 3) {
        rounds += 1;
        const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
        const toolResults = await Promise.all(
          toolUses.map(async (tu) => ({
            type: 'tool_result' as const,
            tool_use_id: tu.id,
            content: await runTool(supabase, tu.name, tu.input as Record<string, unknown>, profile?.account_id ?? '', user.id),
          })),
        );
        conversation = [
          ...conversation,
          { role: 'assistant', content: response.content },
          { role: 'user', content: toolResults },
        ];
        response = await anthropic.messages.create({
          model: 'claude-opus-4-8',
          max_tokens: 600,
          thinking: { type: 'adaptive' },
          system: systemPrompt,
          messages: conversation,
          tools: scopedTools,
        });
        tokensUsed += response.usage.input_tokens + response.usage.output_tokens;
      }

      answer = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();
    } else if (openai) {
      type Msg = OpenAI.Chat.ChatCompletionMessageParam;
      let conversation: Msg[] = [{ role: 'system', content: systemPrompt }, ...turns];
      let completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: conversation,
        max_tokens: 600,
        tools: scopedOpenAITools,
      });
      tokensUsed = completion.usage?.total_tokens ?? 0;

      let rounds = 0;
      let message = completion.choices[0]?.message;
      while (message?.tool_calls && message.tool_calls.length > 0 && rounds < 3) {
        rounds += 1;
        const funcCalls = message.tool_calls.filter(
          (tc): tc is OpenAI.Chat.ChatCompletionMessageFunctionToolCall => tc.type === 'function',
        );
        const toolResults: Msg[] = await Promise.all(
          funcCalls.map(async (tc) => ({
            role: 'tool' as const,
            tool_call_id: tc.id,
            content: await runTool(supabase, tc.function.name, JSON.parse(tc.function.arguments || '{}'), profile?.account_id ?? '', user.id),
          })),
        );
        conversation = [...conversation, message, ...toolResults];
        completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: conversation,
          max_tokens: 600,
          tools: scopedOpenAITools,
        });
        tokensUsed += completion.usage?.total_tokens ?? 0;
        message = completion.choices[0]?.message;
      }

      answer = message?.content?.trim() ?? undefined;
    }

    if (!answer) return NextResponse.json({ error: 'AI returned an empty answer' }, { status: 500 });

    return NextResponse.json({ answer, tokensUsed });
  } catch (err) {
    console.error('[ai/assistant POST]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
