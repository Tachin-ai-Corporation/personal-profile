import "server-only"

import { createDecipheriv, createHmac, hkdfSync } from "node:crypto"
import { ENVIRONMENTS, type Environment } from "@/lib/shared/environments"
import { getSecretKey, getSecretKeyVarName } from "./env"

/**
 * =============================================================================
 * Launch crypto, environment detection + one-shot exchange (AD-1, AD-6, D2)
 * =============================================================================
 *
 * Pure, injectable helpers for the `POST /api/token` launch. Byte-identical to
 * the platform (`KeyDerivationUtil` / `HmacSha256Util` / `JwtFieldEncryptor` in
 * `1h-ng-bo-core-be`):
 *   - AES key: HKDF-SHA256, IKM = raw secret (utf8), salt = 32 zero bytes,
 *     empty info, 32-byte output.
 *   - LPL wire format: base64( IV(12) ++ ciphertext ++ GCM tag(16) ).
 *   - exchange signature: base64 HMAC-SHA256 of the one-time code keyed by the
 *     RAW (un-derived) secret (utf8).
 *
 * Environment detection (D2): the payload is tried against the PROD key, then
 * the DEMO key, each first as stored and then `.trim()`-ed. The first variant
 * whose GCM tag authenticates decides the environment, and that same variant
 * keys the exchange signature. Every upstream origin is passed in by the caller
 * from `lib/shared/environments.ts`; nothing here has a default origin.
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

/**
 * An exchange failure, mapped to the launch error the user should see, and the
 * HTTP status `/api/token` answers with: 502 for an upstream 5xx, a timeout, a
 * network error or an unusable 2xx; 400 otherwise.
 */
export class ExchangeError extends Error {
  constructor(
    public readonly reason: "used" | "expired" | "invalid",
    public readonly status: 400 | 502 = 400,
  ) {
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

/** Base64 (standard or URL-safe alphabet, optional padding) — anything else is not a payload. */
const BASE64 = /^[A-Za-z0-9+/_-]+={0,2}$/

/**
 * Decode the wire payload into its raw bytes, or throw `LaunchError('invalid')`
 * for a non-base64 or too-short (< 28 bytes) value. Platform quirk: `+` in the
 * base64 lpl can arrive as a space through the URL, so spaces become `+`.
 */
function decodeLpl(lpl: string): Buffer {
  if (typeof lpl !== "string" || lpl.length === 0) {
    throw new LaunchError("invalid")
  }
  const normalized = lpl.replace(/ /g, "+")
  if (!BASE64.test(normalized)) {
    throw new LaunchError("invalid")
  }
  const buf = Buffer.from(normalized, "base64")
  if (buf.length < MIN_LPL_BYTES) {
    throw new LaunchError("invalid")
  }
  return buf
}

/** AES-256-GCM open: the plaintext, or `null` when the tag does not authenticate under `key`. */
function open(buf: Buffer, key: Buffer): string | null {
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(buf.length - 16)
  const ciphertext = buf.subarray(12, buf.length - 16)
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")
  } catch {
    return null
  }
}

/** Parse + validate an authenticated plaintext; any fault is `invalid`. */
function parsePayload(plaintext: string): LaunchPayload {
  let json: unknown
  try {
    json = JSON.parse(plaintext)
  } catch {
    throw new LaunchError("invalid")
  }
  return validatePayload(json)
}

/**
 * Decrypt and validate the launch payload with ONE secret. Throws
 * `LaunchError('config')` when the secret cannot form a key, and
 * `LaunchError('invalid')` for any malformed, tampered, cleartext, or
 * field-missing payload.
 */
export function decryptLaunchPayload(lpl: string, secret: string): LaunchPayload {
  // `config` (bad key) is distinct from `invalid` (bad payload): derive first.
  const key = deriveAesKey(secret)
  const plaintext = open(decodeLpl(lpl), key)
  if (plaintext === null) throw new LaunchError("invalid")
  return parsePayload(plaintext)
}

/** The outcome of environment detection. */
export interface DetectedLaunch {
  /** The environment whose key decrypted the payload (D2). */
  environment: Environment
  /** The key variant that decrypted it (as stored, or trimmed): keys the exchange signature. */
  secret: string
  /** Whether only the trimmed variant decrypted (a warning was logged). */
  trimmed: boolean
  payload: LaunchPayload
}

/**
 * Detect the environment by key (D2): try PROD then DEMO, each first as stored
 * and then `.trim()`-ed. The first variant that authenticates wins.
 *
 * - Every key must be able to form an AES key, else `LaunchError('config')`
 *   (checked up front, before the payload is looked at).
 * - A payload that is missing, not base64, too short, decrypted by no variant,
 *   not JSON, or missing a required field is `LaunchError('invalid')`.
 * - When only a trimmed variant decrypts, ONE warning names the variable (never
 *   its value) and detection continues with that variant.
 *
 * @param keyOf the stored secret per environment (defaults to `env.ts`).
 */
export function detectEnvironment(
  lpl: string,
  keyOf: (env: Environment) => string = getSecretKey,
  varNameOf: (env: Environment) => string = getSecretKeyVarName,
): DetectedLaunch {
  // Config first: a key that cannot become an AES key is a deployment fault.
  const variants: { environment: Environment; secret: string; trimmed: boolean; key: Buffer }[] = []
  for (const environment of ENVIRONMENTS) {
    const stored = keyOf(environment)
    variants.push({ environment, secret: stored, trimmed: false, key: deriveAesKey(stored) })
    const trimmed = typeof stored === "string" ? stored.trim() : stored
    if (trimmed !== stored) {
      variants.push({ environment, secret: trimmed, trimmed: true, key: deriveAesKey(trimmed) })
    }
  }

  const buf = decodeLpl(lpl)
  for (const variant of variants) {
    const plaintext = open(buf, variant.key)
    if (plaintext === null) continue
    // The tag authenticated: this is the payload's environment. A JSON or field
    // fault from here on is an invalid payload, not a reason to try other keys.
    const payload = parsePayload(plaintext)
    if (variant.trimmed) {
      console.warn(
        JSON.stringify({
          routeTemplate: "/api/token",
          warning: "LAUNCH_KEY_TRIMMED",
          variable: varNameOf(variant.environment),
        }),
      )
    }
    return { environment: variant.environment, secret: variant.secret, trimmed: variant.trimmed, payload }
  }
  throw new LaunchError("invalid")
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
 * Map an upstream exchange failure to a launch error reason. Keyed off the
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
 * Exchange the one-time code exactly once (no retry) at `<apiRoot>/api/...`.
 * A 4xx/3xx maps through `mapUpstreamError` to a 400 `ExchangeError`; a 5xx, a
 * network error, a timeout or an unusable 2xx is a 502 `ExchangeError('invalid')`.
 *
 * @param secret the key variant that decrypted the payload (keys the signature).
 * @param apiRoot the detected environment's `apiRoot`.
 */
export async function exchangeCode(payload: LaunchPayload, secret: string, apiRoot: string): Promise<ExchangeResult> {
  const signature = buildSignature(payload.code, secret)
  const url = `${apiRoot}/api/v2/public/external-application/auth/oauth2/user/token`

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
    // Network error or timeout/abort.
    throw new ExchangeError("invalid", 502)
  } finally {
    clearTimeout(timer)
  }

  if (res.status >= 500) {
    await discard(res)
    throw new ExchangeError("invalid", 502)
  }
  if (res.type === "opaqueredirect" || res.status < 200 || res.status >= 300) {
    let body = ""
    try {
      body = await res.text()
    } catch {
      body = ""
    }
    // The body only selects a reason; it is never logged or returned.
    throw new ExchangeError(mapUpstreamError(res.status, body), 400)
  }

  let data: { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown }
  try {
    data = (await res.json()) as typeof data
  } catch {
    throw new ExchangeError("invalid", 502)
  }

  const accessToken = data?.access_token
  const refreshToken = data?.refresh_token
  const expiresIn = data?.expires_in
  if (typeof accessToken !== "string" || typeof refreshToken !== "string") {
    throw new ExchangeError("invalid", 502)
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

/** Drop an unread response body. Never throws. */
async function discard(res: Response): Promise<void> {
  try {
    await res.body?.cancel()
  } catch {
    // ignore
  }
}

/**
 * Derive the ids from one `GET <apiRoot>/api/v2/user/myself` with the new
 * Bearer (AD-1). Returns `null` on any failure, so the caller answers
 * `LAUNCH_INVALID` without leaking detail.
 *
 * @param apiRoot the detected environment's `apiRoot`.
 */
export async function fetchIds(
  accessToken: string,
  apiRoot: string,
): Promise<{ userId: number; personId: number } | null> {
  const url = `${apiRoot}/api/v2/user/myself`

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
