import OpenAI from 'openai'

// ============================================================
// AI Employee's model — deliberately NOT the same OPENAI_API_KEY
// every other AI feature in this app uses. A live customer-facing
// chat agent lives or dies on reply latency, and open-weight models
// served on fast inference hardware beat closed-model APIs on
// speed-per-dollar — Groq's LPU inference is materially faster than
// a typical GPT-4o-mini round trip, at a fraction of the cost, while
// Llama 3.3 70B's quality and multilingual handling (Urdu/Arabic/
// Punjabi matter here — see dialect detection) are on par with or
// ahead of closed small models for a bounded ordering/FAQ task.
//
// Groq's API is OpenAI-SDK-compatible (same request/response shape,
// different baseURL) — this is a drop-in client, not a rewrite.
// Swap AI_EMPLOYEE_MODEL to try another open model Groq serves
// (e.g. "deepseek-r1-distill-llama-70b", "qwen2.5-72b-instruct" when
// available) without touching any calling code.
// ============================================================

let _client: OpenAI | null = null

export function getAIEmployeeModelClient(): { client: OpenAI; model: string } | null {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return null
  if (!_client) {
    _client = new OpenAI({ apiKey, baseURL: 'https://api.groq.com/openai/v1' })
  }
  return { client: _client, model: process.env.AI_EMPLOYEE_MODEL || 'llama-3.3-70b-versatile' }
}
