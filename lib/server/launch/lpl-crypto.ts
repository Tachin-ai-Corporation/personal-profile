import "server-only"

import { createDecipheriv, createHmac } from "node:crypto"

/**
 * Launch Payload (LPL) crypto, ported unchanged from the template's
 * `app/api/token/route.tsx`: HKDF-SHA256 key derivation matching the
 * platform's `KeyDerivationUtil.derive()`, AES-256-GCM with a 12-byte IV
 * prefix and a 16-byte tag suffix, and the HMAC signature for the code
 * exchange.
 */

const KEY_LENGTH_BYTES = 32
export const IV_LENGTH = 12
export const TAG_LENGTH = 16

/** HKDF-SHA256 with an all-zero 32-byte salt and empty info. */
export function deriveKey(secretKey: string): Buffer {
  const salt = Buffer.alloc(32, 0)
  const prk = createHmac("sha256", salt).update(Buffer.from(secretKey, "utf8")).digest()

  const okm = Buffer.alloc(KEY_LENGTH_BYTES)
  let previous = Buffer.alloc(0)
  let offset = 0
  for (let counter = 1; offset < KEY_LENGTH_BYTES; counter++) {
    previous = createHmac("sha256", prk)
      .update(previous)
      .update(Buffer.from([counter]))
      .digest()
    const take = Math.min(previous.length, KEY_LENGTH_BYTES - offset)
    previous.copy(okm, offset, 0, take)
    offset += take
  }
  return okm
}

/** Standard or URL-safe alphabet; Node decodes both, as the template did. */
const BASE64 = /^[A-Za-z0-9+/_-]+={0,2}$/

/**
 * Decrypts an LPL to its UTF-8 plaintext, or `null` when it is not base64,
 * too short, or fails GCM authentication. Spaces become `+` first (a `+` in a
 * query string arrives as a space).
 */
export function decryptLpl(lpl: string, secretKey: string): string | null {
  // A pasted LPL may be wrapped over lines: line breaks and tabs are dropped.
  const normalized = lpl.replace(/[\r\n\t]/g, "").replace(/ /g, "+")
  if (!BASE64.test(normalized)) return null

  const bytes = Buffer.from(normalized, "base64")
  if (bytes.length < IV_LENGTH + TAG_LENGTH) return null

  const iv = bytes.subarray(0, IV_LENGTH)
  const tag = bytes.subarray(bytes.length - TAG_LENGTH)
  const ciphertext = bytes.subarray(IV_LENGTH, bytes.length - TAG_LENGTH)
  try {
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(secretKey), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")
  } catch {
    return null
  }
}

/** Base64 HMAC-SHA256 of the one-time code, keyed with the raw secret key (not the derived one). */
export function signCode(code: string, secretKey: string): string {
  return createHmac("sha256", Buffer.from(secretKey, "utf8")).update(code, "utf8").digest("base64")
}
