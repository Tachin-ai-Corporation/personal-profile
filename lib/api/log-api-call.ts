/**
 * Dev-only client API logger (D6): one `console.groupCollapsed` per call,
 * silent unless `isLocalDev()` (never in a Vercel build or under test).
 * Redacts SSN-shaped values, MFA `code`, `qrCode`, `lpl`, token-like keys and
 * `authorization`. There is no in-app API Inspector.
 * Provider NPI reads/search, availability, registration, practice support and
 * Places calls log metadata only: queries, record ids and all request/response
 * payloads stay out of the console, including errors.
 */

import { BFF_PATHS } from "@/lib/shared/bff-contract"
import { isLocalDev } from "@/lib/shared/app-env"

export interface ApiCallLog {
  readonly method: string
  readonly path: string
  /** Absent for network failures. */
  readonly status?: number
  readonly durationMs: number
  readonly requestBody?: unknown
  readonly responseBody?: unknown
}

const REDACTED = "[redacted]"
const SENSITIVE_KEY = /token|^code$|qrcode|^lpl$|authorization|ssn|socialsecuritynumber|secret|password/i
const SSN_SHAPE = /\b\d{3}-?\d{2}-?\d{4}\b/g
const JWT_SHAPE = /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g
const MAX_DEPTH = 8

/** Deep-redacts sensitive keys and token/SSN-shaped strings. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return REDACTED
  if (typeof value === "string") return value.replace(JWT_SHAPE, REDACTED).replace(SSN_SHAPE, REDACTED)
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1))
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(item, depth + 1)
    return out
  }
  return value
}

/** Parses a JSON text body for display; non-JSON text is shown (redacted) as is. */
export function bodyForLog(text: string | undefined): unknown {
  if (text === undefined || text === "") return undefined
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export function logApiCall(entry: ApiCallLog): void {
  if (!isLocalDev()) return
  // Use fetch's WHATWG parser before proxy segment decoding: controls can
  // hide dot segments that are resolved by the browser before the request.
  let pathname: string
  try {
    pathname = new URL(entry.path, "http://pp.invalid").pathname
  } catch {
    // Preserve the existing raw-path/body logging for malformed, unrelated URLs.
    pathname = ""
  }
  pathname = pathname
    .replace(/%([0-9a-f]{2})/gi, (_match, byte: string) => String.fromCharCode(Number.parseInt(byte, 16)))
    .replace(/\/{2,}/g, "/")
    .replace(/\/$/, "")
  // Decoding a malformed id can introduce slashes, even collapse it to empty.
  // Template the entire id region conservatively, including rejected requests.
  const availability = /^\/api\/1h\/v2\/health\/npi\/(?:[\s\S]*\/)?is-registered$/
  const safePath = pathname.replace(availability, "/api/1h/v2/health/npi/{npiRecordId}/is-registered")
  const metadataOnly = availability.test(pathname) || pathname === "/api/1h/v2/user/npi" || pathname === "/api/1h/v2/public/npi/list" || pathname === "/api/1h/v2/user/register/npi" || pathname === BFF_PATHS.practiceSupport || pathname === BFF_PATHS.placesAutocomplete || pathname === BFF_PATHS.placesDetails
  console.groupCollapsed(`[api] ${entry.method} ${metadataOnly ? safePath : entry.path} → ${entry.status ?? "network error"} (${entry.durationMs} ms)`)
  if (metadataOnly) {
    console.groupEnd()
    return
  }
  console.log("request", redact(entry.requestBody))
  console.log("response", redact(entry.responseBody))
  console.groupEnd()
}
