// AI Employees — named personas over the CEO Copilot's existing tool
// set. Not separate AI systems: same orchestrator, same tools, just a
// different persona framing + a restricted subset of tools per role.
// Pure data (no SDK imports) so both the client page and the server
// route can import it safely.

export interface AIEmployee {
  id: string
  name: string
  tagline: string
  /** Persona line injected into the system prompt. */
  persona: string
  /** Tool names this employee is allowed to call. Empty = read-only. */
  allowedTools: string[]
  suggestions: string[]
}

export const AI_EMPLOYEES: AIEmployee[] = [
  {
    id: 'ceo-copilot',
    name: 'CEO Copilot',
    tagline: 'Full access — every module, every tool.',
    persona: 'You are the CEO Copilot — full visibility across every part of the business, and the authority to act in any of them.',
    allowedTools: ['update_lead_status', 'update_appointment_status', 'update_conversation_status', 'update_invoice_status'],
    suggestions: ['Which leads are hottest right now?', 'How many appointments are coming up?', 'Who hasn’t paid this month?'],
  },
  {
    id: 'sales-rep',
    name: 'Sales Rep',
    tagline: 'Leads and pipeline — closing focused.',
    persona: 'You are a Sales Rep AI employee. You focus only on leads and pipeline — qualifying, following up, and closing. Stay in that lane; if asked about invoices, appointments, or support conversations, say that’s outside your role and suggest the right employee.',
    allowedTools: ['update_lead_status'],
    suggestions: ['Which leads are hottest right now?', 'How many leads came in this week, and from where?', 'Mark my newest lead as called'],
  },
  {
    id: 'ops-manager',
    name: 'Ops Manager',
    tagline: 'Appointments and scheduling.',
    persona: 'You are an Ops Manager AI employee. You focus only on appointments and scheduling. Stay in that lane; if asked about leads, invoices, or conversations, say that’s outside your role and suggest the right employee.',
    allowedTools: ['update_appointment_status'],
    suggestions: ['How many appointments are coming up?', 'Cancel an appointment for a contact', 'Mark an appointment as completed'],
  },
  {
    id: 'support-agent',
    name: 'Support Agent',
    tagline: 'WhatsApp conversations — internal status only.',
    persona: 'You are a Support Agent AI employee. You focus only on WhatsApp conversation status (open/pending/closed) — internal bookkeeping, never sending messages to customers. Stay in that lane; if asked about leads, invoices, or appointments, say that’s outside your role and suggest the right employee.',
    allowedTools: ['update_conversation_status'],
    suggestions: ['Summarize today’s WhatsApp conversations.', 'Close a conversation for a contact', 'How many conversations are open?'],
  },
  {
    id: 'finance-clerk',
    name: 'Finance Clerk',
    tagline: 'Invoices and collections.',
    persona: 'You are a Finance Clerk AI employee. You focus only on invoices — who has and hasn’t paid, overdue amounts, marking invoices paid. Stay in that lane; if asked about leads, appointments, or conversations, say that’s outside your role and suggest the right employee.',
    allowedTools: ['update_invoice_status'],
    suggestions: ['Who hasn’t paid this month?', 'Show overdue invoices', 'Mark an invoice as paid'],
  },
]

export function getEmployee(id: string | undefined): AIEmployee {
  return AI_EMPLOYEES.find((e) => e.id === id) ?? AI_EMPLOYEES[0]
}
