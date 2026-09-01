// Deterministic, rule-based "is this a real lead or noise?" signal —
// no LLM call, per the same preference already set on Predictive
// Intelligence ("calculations based on available data, not live AI").
// Pure functions, no DB/crypto imports, so they're unit-testable
// without env vars — decrypting stored content_text and fetching the
// preceding message are the caller's job (see webhook/route.ts and
// n8n/log/route.ts for the two call sites).

const EMOJI_REGEX = /\p{Extended_Pictographic}/gu;
const LETTER_REGEX = /\p{L}/u;

export interface ReplyContent {
  content_type: string;
  content_text: string | null;
}

/**
 * True only for a real text/button-tap reply with actual content —
 * not emoji-only, not a sticker, not a bare voice note/image/document
 * (regardless of any caption on those, since we can't verify media
 * content). Supports non-Latin scripts (Urdu/Arabic customers already
 * seen in this inbox) via a Unicode letter check rather than [a-zA-Z].
 */
export function isSubstantiveReply(message: ReplyContent): boolean {
  if (message.content_type !== "text" && message.content_type !== "interactive") {
    return false;
  }
  if (!message.content_text) return false;
  const stripped = message.content_text.replace(EMOJI_REGEX, "").trim();
  return stripped.length >= 2 && LETTER_REGEX.test(stripped);
}

/** True if the (already-decrypted) text ends in "?" once right-trimmed. */
export function endsWithQuestion(text: string | null | undefined): boolean {
  if (!text) return false;
  return text.trimEnd().endsWith("?");
}

export interface PrecedingMessage {
  sender_type: string;
  content_text: string | null;
}

/**
 * A conversation qualifies when the message immediately before this
 * new inbound customer message was sent by the bot/agent, ended in a
 * question, and this new message is a substantive reply to it.
 * Script-agnostic — doesn't hardcode any specific qualifying question,
 * so it keeps working if the bot script changes.
 */
export function detectsQualifyingReply(params: {
  precedingMessage: PrecedingMessage | null;
  newMessage: ReplyContent;
}): boolean {
  const { precedingMessage, newMessage } = params;
  if (!precedingMessage) return false;
  if (precedingMessage.sender_type !== "agent" && precedingMessage.sender_type !== "bot") {
    return false;
  }
  if (!endsWithQuestion(precedingMessage.content_text)) return false;
  return isSubstantiveReply(newMessage);
}
