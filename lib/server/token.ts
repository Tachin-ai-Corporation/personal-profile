import "server-only"

import { randomBytes, randomUUID } from "node:crypto"
import { environments, type Environment } from "@/lib/shared/environments"
import { LAUNCH_ERROR_MESSAGES, type LaunchErrorCode } from "@/lib/shared/messages"
import { DEFAULT_TENANT_ID, PP_DISABLED, getAppId } from "./env"
import {
  ExchangeError,
  LaunchError,
  detectEnvironment,
  exchangeCode,
  fetchIds,
  readTokenTenantId,
  type DetectedLaunch,
} from "./launch"
import { clearSessionCookie, sealSession, type SessionData } from "./session"
import { environmentCookie } from "./environment-cookie"
import { applyNoStore } from "./cache-headers"
import { logLaunch } from "./log"

/**
 * =============================================================================
 * `POST /api/token` — the launch exchange (Story 1.2; D1, D2, D5, D9)
 * =============================================================================
 *
 * `/auth` posts `{ lpl }` here, at most five times (D9). The route file
 * (`app/api/token/route.ts`) only wires these handlers. Pipeline, first match
 * wins:
 *
 *   PP_DISABLED → 503 SERVICE_DISABLED (no decrypt, cookie untouched)
 *   Content-Type not JSON → 415 UNSUPPORTED_MEDIA
 *   — from here every response clears any prior `__Host-pp_s` (clear-first) —
 *   body without a string `lpl` → 400 LAUNCH_INVALID, retryable:false
 *   a key that cannot form an AES key → 503 LAUNCH_CONFIG
 *   no key variant decrypts / bad payload → 400 LAUNCH_INVALID, retryable:false
 *   `apiKey.name` ≠ APP_ID_<ENV> → 400 LAUNCH_INVALID, retryable:false
 *   exchange (once, 25 s, no retry) → LAUNCH_USED / LAUNCH_EXPIRED (400) or
 *     LAUNCH_INVALID (400; 502 for 5xx, timeout, network)
 *   tenantId claim ≠ 1 → 403 WRONG_TENANT, retryable:false
 *   `/myself` fails or id ≠ payload user → 502 LAUNCH_INVALID
 *   → seal (environment + ids) → 200 { ok: true, environment } + the
 *     `onehealth_environment` cookie
 *
 * The 415 check runs before the clear so a cross-site form post (which can't
 * send `application/json` without a CORS preflight) can't sign a user out.
 * There is no CSRF or binding check (D5). Only `lpl` is read from the body;
 * the environment is detected by key, never taken from the request (D2).
 *
 * Every error body is `{ ok:false, errorCode, source:"proxy", message,
 * retryable? }` with `message` from `messages.ts`: never a token, code, id or
 * upstream text. Every response is no-store. The log line carries only
 * request id, route template, outcome, environment and duration.
 * =============================================================================
 */
type Outcome = LaunchErrorCode | "OK"

interface Failure {
  status: number
  errorCode: LaunchErrorCode
  retryable?: false
}

const NOT_RETRYABLE = false as const

function headers(setCookies: string[]): Headers {
  const h = new Headers()
  applyNoStore(h)
  h.set("Content-Type", "application/json")
  h.set("X-Content-Type-Options", "nosniff")
  for (const c of setCookies) h.append("Set-Cookie", c)
  return h
}

function failureResponse(failure: Failure, setCookies: string[], extra?: Record<string, string>): Response {
  const body: Record<string, unknown> = {
    ok: false,
    errorCode: failure.errorCode,
    source: "proxy",
    message: LAUNCH_ERROR_MESSAGES[failure.errorCode],
  }
  if (failure.retryable === false) body.retryable = false
  const h = headers(setCookies)
  for (const [name, value] of Object.entries(extra ?? {})) h.set(name, value)
  return new Response(JSON.stringify(body), { status: failure.status, headers: h })
}

/** `application/json`, with or without parameters (e.g. `; charset=utf-8`). */
function isJson(request: Request): boolean {
  const type = request.headers.get("Content-Type")
  return type !== null && type.split(";")[0].trim().toLowerCase() === "application/json"
}

/** A launch body is `{ lpl }` of a few hundred bytes; anything far larger is refused unparsed. */
const MAX_BODY_CHARS = 16_384

/** The `lpl` field of the JSON body, or `null`. Any other field is ignored. */
async function readLpl(request: Request): Promise<string | null> {
  // A declared oversize body is refused without reading it.
  const declared = Number(request.headers.get("Content-Length"))
  if (Number.isFinite(declared) && declared > MAX_BODY_CHARS) return null
  try {
    const text = await request.text()
    if (text.length > MAX_BODY_CHARS) return null
    const body = JSON.parse(text) as unknown
    if (!body || typeof body !== "object" || Array.isArray(body)) return null
    const lpl = (body as { lpl?: unknown }).lpl
    return typeof lpl === "string" && lpl.length > 0 ? lpl : null
  } catch {
    return null
  }
}

type Result = { response: Response; outcome: Outcome; environment?: Environment }

async function run(request: Request): Promise<Result> {
  // Kill switch: no decrypt, and the session cookie is left untouched.
  if (PP_DISABLED) {
    return { response: failureResponse({ status: 503, errorCode: "SERVICE_DISABLED" }, []), outcome: "SERVICE_DISABLED" }
  }

  if (!isJson(request)) {
    const failure: Failure = { status: 415, errorCode: "UNSUPPORTED_MEDIA", retryable: NOT_RETRYABLE }
    return { response: failureResponse(failure, []), outcome: failure.errorCode }
  }

  // Clear-first: every response from here on replaces any prior session.
  const clear = clearSessionCookie()
  const fail = (failure: Failure, environment?: Environment): Result => ({
    response: failureResponse(failure, [clear]),
    outcome: failure.errorCode,
    environment,
  })
  const invalid: Failure = { status: 400, errorCode: "LAUNCH_INVALID", retryable: NOT_RETRYABLE }

  const lpl = await readLpl(request)
  if (lpl === null) return fail(invalid)

  // Environment detection by key (D2).
  let detected: DetectedLaunch
  try {
    detected = detectEnvironment(lpl)
  } catch (error) {
    if (error instanceof LaunchError && error.reason === "config") {
      return fail({ status: 503, errorCode: "LAUNCH_CONFIG" })
    }
    return fail(invalid)
  }
  const { environment, payload, secret } = detected
  const { apiRoot } = environments[environment]

  // App-id gate — no upstream call on mismatch.
  if (payload.apiKeyName !== getAppId(environment)) return fail(invalid, environment)

  // Single exchange (no retry within the request).
  let exchanged
  try {
    exchanged = await exchangeCode(payload, secret, apiRoot)
  } catch (error) {
    if (error instanceof ExchangeError) {
      const errorCode: LaunchErrorCode =
        error.reason === "used" ? "LAUNCH_USED" : error.reason === "expired" ? "LAUNCH_EXPIRED" : "LAUNCH_INVALID"
      return fail({ status: error.status, errorCode }, environment)
    }
    return fail({ status: 502, errorCode: "LAUNCH_INVALID" }, environment)
  }

  // Tenant gate (AD-6): only the plaintext tenantId claim is read. A missing or
  // unparseable claim is a malformed upstream token, not a wrong account.
  const tenantId = readTokenTenantId(exchanged.accessToken)
  if (tenantId === null) return fail({ status: 502, errorCode: "LAUNCH_INVALID" }, environment)
  if (tenantId !== DEFAULT_TENANT_ID) {
    return fail({ status: 403, errorCode: "WRONG_TENANT", retryable: NOT_RETRYABLE }, environment)
  }

  // Ids from one `/myself` (AD-1); its id must match the payload's user.
  const ids = await fetchIds(exchanged.accessToken, apiRoot)
  if (!ids || ids.userId !== payload.userId) return fail({ status: 502, errorCode: "LAUNCH_INVALID" }, environment)

  const now = Date.now()
  const session: SessionData = {
    accessToken: exchanged.accessToken,
    refreshToken: exchanged.refreshToken,
    accessTokenExpiresAt: now + exchanged.expiresIn * 1000,
    environment,
    userId: ids.userId,
    personId: ids.personId,
    tenantId,
    sid: randomBytes(16).toString("hex"),
    gen: 0,
    iat: now,
    lastSeen: now,
  }
  const sealed = await sealSession(session)
  return {
    response: new Response(JSON.stringify({ ok: true, environment }), {
      status: 200,
      headers: headers([sealed, environmentCookie(environment)]),
    }),
    outcome: "OK",
    environment,
  }
}

/** `POST /api/token`. Never throws; an unexpected fault → 502 `LAUNCH_INVALID` (still clearing). */
export async function handleToken(request: Request): Promise<Response> {
  const startedAt = Date.now()
  const requestId = randomUUID()
  let result: Result
  try {
    result = await run(request)
  } catch {
    // Unexpected fault (e.g. sealing): fail closed, still clearing any session.
    result = {
      response: failureResponse({ status: 502, errorCode: "LAUNCH_INVALID" }, [clearSessionCookie()]),
      outcome: "LAUNCH_INVALID",
    }
  }
  logLaunch({ requestId, outcome: result.outcome, environment: result.environment, durationMs: Date.now() - startedAt })
  return result.response
}

/** Any other method → 405 with `Allow: POST`; the cookie is untouched. */
export function tokenMethodNotAllowed(): Response {
  return failureResponse({ status: 405, errorCode: "METHOD_NOT_ALLOWED", retryable: NOT_RETRYABLE }, [], {
    Allow: "POST",
  })
}
