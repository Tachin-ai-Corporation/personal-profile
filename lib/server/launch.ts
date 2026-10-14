import "server-only"

import { createDecipheriv, createHmac, hkdfSync } from "node:crypto"
import { API_ORIGIN } from "./env"

/**
 * =============================================================================
 * Launch crypto + one-shot exchange (AD-1, AD-4, AD-6)
 * =============================================================================
 *
 * Pure, injectable helpers for the `/launch` server exchange. Byte-identical to
 * the platform (`KeyDerivationUtil` / `HmacSha256Util` / `JwtFieldEncryptor` in
 * `1h-ng-bo-core-be`):
 *   - AES key: HKDF-SHA256, IKM = raw secret (utf8), salt = 32 zero bytes,
 *     empty info, 32-byte output.
 *   - LPL wire format: base64( IV(12) ++ ciphertext ++ GCM tag(16) ).
 *   - exchange signature: base64 HMAC-SHA256 of the one-time code keyed by the
 *     RAW (un-derived) secret (utf8).
 *
 * NOTHING here logs a secret, token, lpl, code, user id, or upstream body.
 * =============================================================================
 */

/** Minimum LPL byte length: 12-byte IV + 16-byte GCM tag (zero-length ciphertext). */
const MIN_LPL_BYTES = 28

/** The upstream timeout for both the exchange and `/myself` (AD-4: no retry). */
const UPSTREAM_TIMEOUT_MS = 25_000

/** A decrypt/validation failure is either a config (bad key) or an invalid-payload fault. */
export class LaunchError extends Error {
  constructor(public readonly reason: "config" | "invalid") {
    super(reason)
    this.name = "LaunchError"
  }
}

/** An exchange failure, mapped to the launch-error reason the user should see. */
export class ExchangeError extends Error {
  constructor(public readonly reason: "used" | "expired" | "invalid") {
    super(reason)
    this.name = "ExchangeError"
  }
}

/** The validated subset of the decrypted launch payload this story needs. */
export interface LaunchPayload {
  /** `required.apiKey.name` — the External Application id placeholder (app-id gate). */
  apiKeyName: string
  /** `required.tenant.id`. */
  tenantId: number
  /** `required.user.id` — must equal the `/myself` `id` (AD-1). */
  userId: number
  /** `required.oneTimeCode.value` — the single-use exchange code. */
  code: string
  /** `required.oneTimeCode.issuedAt` — presence is required; value is otherwise unused. */
  issuedAt: unknown
}

/** The token-exchange result. */
export interface ExchangeResult {
  accessToken: string
  refreshToken: string
  /** Access-token lifetime in seconds (0 when upstream omits it). */
  expiresIn: number
}

/**
 * Derive the 256-bit AES key from the raw secret via HKDF-SHA256 (32-zero salt,
 * empty info). A blank/unusable secret throws `LaunchError('config')`.
 */
export function deriveAesKey(secret: string): Buffer {
  if (typeof secret !== "string" || secret.trim().length === 0) {
    throw new LaunchError("config")
  }
  try {
    const derived = hkdfSync("sha256", Buffer.from(secret, "utf8"), Buffer.alloc(32, 0), Buffer.alloc(0), 32)
    return Buffer.from(derived)
  } catch {
    throw new LaunchError("config")
  }
}

/** Build the exchange signature: base64 HMAC-SHA256 of the code keyed by the RAW secret. */
export function buildSignature(code: string, secret: string): string {
  return createHmac("sha256", Buffer.from(secret, "utf8")).update(code, "utf8").digest("base64")
}

/**
 * Decrypt and validate the launch payload. Throws `LaunchError('config')` when
 * the secret cannot form a key, and `LaunchError('invalid')` for any malformed,
 * tampered, cleartext, or field-missing payload.
 */
export function decryptLaunchPayload(lpl: string, secret: string): LaunchPayload {
  // `config` (bad key) is distinct from `invalid` (bad payload): derive first.
  const key = deriveAesKey(secret)

  if (typeof lpl !== "string" || lpl.length === 0) {
    throw new LaunchError("invalid")
  }

  // Platform quirk: '+' in the base64 lpl can arrive as a space through the URL.
  const normalized = lpl.replace(/ /g, "+")
  const buf = Buffer.from(normalized, "base64")
  if (buf.length < MIN_LPL_BYTES) {
    throw new LaunchError("invalid")
  }

  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(buf.length - 16)
  const ciphertext = buf.subarray(12, buf.length - 16)

  let plaintext: string
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv)
    decipher.setAuthTag(tag)
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")
  } catch {
    throw new LaunchError("invalid")
  }

  let json: unknown
  try {
    json = JSON.parse(plaintext)
  } catch {
    throw new LaunchError("invalid")
  }

  return validatePayload(json)
}

/** Pull and type-check the required fields; any miss is `invalid`. */
function validatePayload(json: unknown): LaunchPayload {
  const required = (json as { required?: unknown })?.required as
    | {
        apiKey?: { name?: unknown }
        tenant?: { id?: unknown }
        user?: { id?: unknown }
        oneTimeCode?: { value?: unknown; issuedAt?: unknown }
      }
    | undefined

  const apiKeyName = required?.apiKey?.name
  const tenantId = required?.tenant?.id
  const userId = required?.user?.id
  const code = required?.oneTimeCode?.value
  const issuedAt = required?.oneTimeCode?.issuedAt

  if (typeof apiKeyName !== "string" || apiKeyName.length === 0) throw new LaunchError("invalid")
  if (typeof tenantId !== "number") throw new LaunchError("invalid")
  if (typeof userId !== "number") throw new LaunchError("invalid")
  if (typeof code !== "string" || code.length === 0) throw new LaunchError("invalid")
  if (issuedAt === undefined || issuedAt === null) throw new LaunchError("invalid")

  return { apiKeyName, tenantId, userId, code, issuedAt }
}

/**
 * Map an upstream exchange failure to a launch-error reason. Keyed off the
 * recorded platform error bodies (`ErrorMessageDTO`): "already been redeemed"
 * → `used`, "has expired" → `expired`, everything else (not-found, invalid
 * signature, other 4xx/5xx/3xx) → `invalid`.
 */
export function mapUpstreamError(_status: number, body: string): "used" | "expired" | "invalid" {
  const text = (body ?? "").toLowerCase()
  if (text.includes("already been redeemed")) return "used"
  if (text.includes("has expired")) return "expired"
  return "invalid"
}

/**
 * Exchange the one-time code exactly once (no retry). Network/timeout/parse
 * faults and any non-2xx map through `mapUpstreamError` to an `ExchangeError`.
 */
export async function exchangeCode(
  payload: LaunchPayload,
  secret: string,
  origin: string = API_ORIGIN,
): Promise<ExchangeResult> {
  const signature = buildSignature(payload.code, secret)
  const url = `${origin}/api/v2/public/external-application/auth/oauth2/user/token`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ signature, securityCode: payload.code }),
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    })
  } catch {
    // Network error, timeout/abort, or a `redirect: manual` opaque redirect.
    throw new ExchangeError("invalid")
  } finally {
    clearTimeout(timer)
  }

  if (res.status < 200 || res.status >= 300) {
    let body = ""
    try {
      body = await res.text()
    } catch {
      body = ""
    }
    throw new ExchangeError(mapUpstreamError(res.status, body))
  }

  let data: { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown }
  try {
    data = (await res.json()) as typeof data
  } catch {
    throw new ExchangeError("invalid")
  }

  const accessToken = data.access_token
  const refreshToken = data.refresh_token
  const expiresIn = data.expires_in
  if (typeof accessToken !== "string" || typeof refreshToken !== "string") {
    throw new ExchangeError("invalid")
  }

  return {
    accessToken,
    refreshToken,
    expiresIn: typeof expiresIn === "number" ? expiresIn : 0,
  }
}

/**
 * Read ONLY the plaintext `tenantId` claim from the access-token JWT payload
 * (AD-6). The other identity claims are encrypted and are never decoded here.
 * No signature verification: the token came straight from the TLS exchange.
 */
export function readTokenTenantId(accessToken: string): number | null {
  try {
    const parts = accessToken.split(".")
    if (parts.length < 2) return null
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      tenantId?: unknown
    }
    const t = claims.tenantId
    if (typeof t === "number") return t
    if (typeof t === "string" && /^\d+$/.test(t)) return Number(t)
    return null
  } catch {
    return null
  }
}

/**
 * Derive the ids from `/myself` with the new Bearer (AD-1). Returns `null` on
 * any failure, so the caller sends `reason=invalid` without leaking detail.
 */
export async function fetchIds(
  accessToken: string,
  origin: string = API_ORIGIN,
): Promise<{ userId: number; personId: number } | null> {
  const url = `${origin}/api/v2/user/myself`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    })
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) return null

  let data: { id?: unknown; personId?: unknown }
  try {
    data = (await res.json()) as typeof data
  } catch {
    return null
  }

  const userId = data.id
  const personId = data.personId
  if (typeof userId !== "number" || typeof personId !== "number") return null
  return { userId, personId }
}
