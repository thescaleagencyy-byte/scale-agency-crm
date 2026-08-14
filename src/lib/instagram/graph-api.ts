/**
 * Instagram Graph API send helper.
 *
 * Mirrors `src/lib/whatsapp/meta-api.ts`'s `sendTextMessage` — same
 * named-params style, same error-throwing convention (throws a plain
 * `Error` built from Meta's `error.message`, falling back to an
 * HTTP-status message when the response body isn't JSON or has no
 * `error.message`) — so callers can share a single catch block.
 */

const GRAPH_API_VERSION = 'v21.0'
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`

export interface InstagramSendResult {
  messageId: string
}

interface GraphErrorResponse {
  error?: { message?: string; code?: number; type?: string }
}

async function throwGraphError(response: Response, fallback: string): Promise<never> {
  let message = fallback
  try {
    const data = (await response.json()) as GraphErrorResponse
    if (data.error?.message) message = data.error.message
  } catch {
    // response body wasn't JSON — keep the fallback
  }
  throw new Error(message)
}

export interface SendInstagramTextMessageArgs {
  igUserId: string
  accessToken: string
  to: string
  text: string
}

/**
 * Send a plain-text Instagram DM via the Graph API, using the Page
 * access token already verified and stored by the Integration Hub.
 * Text-only for v1 — media sends are out of scope
 * (see docs/superpowers/specs/2026-08-14-instagram-dm-automation-design.md).
 */
export async function sendInstagramTextMessage(
  args: SendInstagramTextMessageArgs,
): Promise<InstagramSendResult> {
  const { igUserId, accessToken, to, text } = args
  const url = `${GRAPH_API_BASE}/${igUserId}/messages`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      recipient: { id: to },
      message: { text },
    }),
  })
  if (!response.ok) {
    await throwGraphError(response, `Instagram API error: ${response.status}`)
  }
  const data = await response.json()
  return { messageId: data.message_id }
}
