/**
 * Vapi function tools do not POST their arguments flat.
 *
 * n8n posts:   { customer_phone: "+9665...", service_type: "SUV" }
 * Vapi posts:  { message: { toolCalls: [ { id, function: { name, arguments } } ], call: {...} } }
 *
 * Both hit the same /api/n8n/* routes, so every voice-facing route has to
 * accept either shape. Reading `body.customer_phone` on a Vapi request always
 * yields undefined — which is why every voice tool call returned
 * "customer_phone is required" and no lead was ever stored.
 */

type ToolCall = {
  id?: string
  function?: { name?: string; arguments?: unknown }
}

export type ParsedToolRequest = {
  /** Tool arguments, flattened from whichever shape arrived. */
  args: Record<string, unknown>
  /** Vapi tool-call id; null for a plain n8n POST. */
  toolCallId: string | null
  /** Real caller number from Vapi call metadata — trusted over any LLM-supplied value. */
  callerPhone: string | null
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  }
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

export function parseToolRequest(rawBody: unknown): ParsedToolRequest {
  const body = asRecord(rawBody)
  const message = asRecord(body.message)

  // Vapi has shipped both `toolCalls` and `toolCallList` over time; accept either.
  const calls = [
    ...(Array.isArray(message.toolCalls) ? (message.toolCalls as ToolCall[]) : []),
    ...(Array.isArray(message.toolCallList) ? (message.toolCallList as ToolCall[]) : []),
  ]

  if (calls.length === 0) {
    return { args: body, toolCallId: null, callerPhone: null }
  }

  const call = calls[0]
  const customer = asRecord(asRecord(message.call).customer)
  const number = typeof customer.number === 'string' ? customer.number.trim() : ''

  return {
    args: asRecord(call.function?.arguments),
    toolCallId: typeof call.id === 'string' ? call.id : null,
    callerPhone: number || null,
  }
}

/**
 * An unsubstituted liquid template ("{{customer.number}}") or a bare
 * placeholder is worse than an empty field: it gets stored and dialled.
 */
export function isUsablePhone(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const v = value.trim()
  if (!v) return false
  if (v.includes('{{') || v.includes('}}')) return false
  return /\d{6,}/.test(v)
}

export function str(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key]
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

/**
 * Vapi reads the tool result from `results[].result`; anything else shows up
 * to the model as an opaque blob. n8n just wants the plain JSON body.
 */
export function toolResponse(
  toolCallId: string | null,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (!toolCallId) return payload
  return {
    results: [
      {
        toolCallId,
        result: typeof payload.error === 'string' ? payload.error : JSON.stringify(payload),
      },
    ],
  }
}
