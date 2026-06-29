import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function getKey(): Buffer {
  const hex = process.env.MESSAGE_ENCRYPTION_KEY;
  if (!hex) throw new Error("MESSAGE_ENCRYPTION_KEY env var not set");
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32)
    throw new Error("MESSAGE_ENCRYPTION_KEY must be 64 hex chars (32 bytes)");
  return key;
}

export function encryptText(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  // Format: base64(iv + tag + ciphertext)
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptText(ciphertext: string): string {
  const key = getKey();
  const buf = Buffer.from(ciphertext, "base64");
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const encrypted = buf.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final("utf8");
}

/** Encrypt content_text if present, else return null. */
export function encryptContent(text: string | null | undefined): string | null {
  if (!text) return null;
  return encryptText(text);
}

/** Decrypt content_text if present, else return null. */
export function decryptContent(text: string | null | undefined): string | null {
  if (!text) return null;
  try {
    return decryptText(text);
  } catch {
    // Not encrypted (legacy row) — return as-is
    return text;
  }
}

/** Decrypt content_text on an array of message rows in place. */
export function decryptMessages<T extends { content_text?: string | null }>(
  rows: T[]
): T[] {
  return rows.map((r) => ({
    ...r,
    content_text: decryptContent(r.content_text),
  }));
}
