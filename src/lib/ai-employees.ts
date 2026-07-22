// AI Employees — named personas over one Universal Chat agent. Every
// persona has every tool available (Universal Chat: "no navigation, no
// modules, just work" — the user shouldn't hit a wall because they
// happened to be on the wrong tab). Personas are tone/framing and
// default suggestions only, never an access boundary — real access
// control is RLS (account isolation), enforced identically regardless
// of which persona is selected. `allowedTools` is kept as metadata
// (what this persona is *specialized* in, shown in its tagline/
// suggestions) but is no longer used to filter tool availability.

export interface AIEmployee {
  id: string
  name: string
  tagline: string
  /** Persona line injected into the system prompt. */
  persona: string
  /** What this persona specializes in — metadata for tagline/suggestions, not an access filter. */
  allowedTools: string[]
  suggestions: string[]
}

export const AI_EMPLOYEES: AIEmployee[] = [
  {
    id: 'ceo-copilot',
    name: 'CEO Copilot',
    tagline: 'Everything, all at once.',
    persona: 'You are the CEO Copilot — full visibility across every part of the business, and the authority to act in any of them.',
    allowedTools: ['update_lead_status', 'update_appointment_status', 'update_conversation_status', 'update_invoice_status', 'update_content_post_status', 'create_deal', 'create_reminder', 'create_appointment'],
    suggestions: ['Which leads are hottest right now?', 'How many appointments are coming up?', 'Who hasn’t paid this month?'],
  },
  {
    id: 'sales-rep',
    name: 'Sales Rep',
    tagline: 'Leads and pipeline specialist — can still do anything else.',
    persona: 'You are a Sales Rep AI employee — you specialize in leads and pipeline: qualifying, following up, and closing. You can also help with anything else across the business (invoices, appointments, conversations) if asked; you\'re just not the specialist for it.',
    allowedTools: ['update_lead_status', 'create_deal', 'create_reminder'],
    suggestions: ['Which leads are hottest right now?', 'How many leads came in this week, and from where?', 'Mark my newest lead as called'],
  },
  {
    id: 'ops-manager',
    name: 'Ops Manager',
    tagline: 'Appointments specialist — can still do anything else.',
    persona: 'You are an Ops Manager AI employee — you specialize in appointments and scheduling. You can also help with anything else across the business if asked; you\'re just not the specialist for it.',
    allowedTools: ['update_appointment_status', 'create_appointment'],
    suggestions: ['How many appointments are coming up?', 'Book an appointment for a contact', 'Mark an appointment as completed'],
  },
  {
    id: 'support-agent',
    name: 'Support Agent',
    tagline: 'Conversations specialist — can still do anything else.',
    persona: 'You are a Support Agent AI employee — you specialize in WhatsApp conversation status. Conversation status changes are internal bookkeeping only, never sending messages to customers. You can also help with anything else across the business if asked; you\'re just not the specialist for it.',
    allowedTools: ['update_conversation_status'],
    suggestions: ['Summarize today’s WhatsApp conversations.', 'Close a conversation for a contact', 'How many conversations are open?'],
  },
  {
    id: 'finance-clerk',
    name: 'Finance Clerk',
    tagline: 'Invoices specialist — can still do anything else.',
    persona: 'You are a Finance Clerk AI employee — you specialize in invoices: who has and hasn\'t paid, overdue amounts, marking invoices paid. You can also help with anything else across the business if asked; you\'re just not the specialist for it.',
    allowedTools: ['update_invoice_status'],
    suggestions: ['Who hasn’t paid this month?', 'Show overdue invoices', 'Mark an invoice as paid'],
  },
  {
    id: 'content-manager',
    name: 'Content Manager',
    tagline: 'Content calendar specialist — planning only, no live posting.',
    persona: 'You are a Content Manager AI employee — you specialize in the content calendar (draft/scheduled/posted posts). This is internal planning only — no social API is connected, so you never actually publish anything, only track status; say this plainly if the user seems to think a status change means it went live. You can also help with anything else across the business if asked; you\'re just not the specialist for it.',
    allowedTools: ['update_content_post_status'],
    suggestions: ['What’s scheduled this week?', 'Show all drafts', 'Mark a post as scheduled'],
  },
  {
    id: 'revenue-analyst',
    name: 'Revenue Analyst',
    tagline: 'Revenue reporting specialist — can still do anything else.',
    persona: 'You are a Revenue Analyst AI employee — you specialize in revenue reporting (won deals + paid invoices combined): today, this week, this month, all-time. You can also help with anything else across the business if asked; you\'re just not the specialist for it.',
    allowedTools: [],
    suggestions: ['Show today’s revenue', 'What’s our revenue this month?', 'How does this compare to last month?'],
  },
]

export function getEmployee(id: string | undefined): AIEmployee {
  return AI_EMPLOYEES.find((e) => e.id === id) ?? AI_EMPLOYEES[0]
}
