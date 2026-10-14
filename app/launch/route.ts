import "server-only"

import type { NextRequest } from "next/server"
import { randomBytes, randomUUID } from "node:crypto"
import {
  API_ORIGIN,
  APP_ID,
  DEFAULT_TENANT_ID,
  ONEHEALTH_SECRET_KEY,
  PP_DISABLED,
} from "@/lib/server/env"
import {
  ExchangeError,
  LaunchError,
  decryptLaunchPayload,
  deriveAesKey,
  exchangeCode,
  fetchIds,
  readTokenTenantId,
} from "@/lib/server/launch"
import { clearSessionCookie, sealSession, type SessionData } from "@/lib/server/session"
import { applyNoStore } from "@/lib/server/cache-headers"

/**
 * One-shot launch exchange (AD-4, AD-1, AD-6).
 *
 * clear-first → config/disabled guards → decrypt → app-id → exchange (once) →
 * tenant → ids → seal → 303 `/launch/verify?tab=`. Every failure answers 303
 * `/launch-error?reason=` and still clears any prior session. No token appears
 * in any response body. Logs carry only request id, route, outcome, duration.
 */
export const dynamic = "force-dynamic"

type Outcome = "invalid" | "used" | "expired" | "tenant" | "config" | "disabled" | "success"

/** The validated `tab` values; anything else or absent → `contacts`. */
const TABS = new Set(["contacts", "insurance", "medical"])

/** A 303 response with a RELATIVE, fragment-free Location, no-store headers, and one Set-Cookie. */
function see303(location: string, setCookie: string): Response {
  const headers = new Headers()
  headers.set("Location", location)
  headers.append("Set-Cookie", setCookie)
  applyNoStore(headers)
  return new Response(null, { status: 303, headers })
}

/** PHI-free launch log line (AD-15). */
function logOutcome(requestId: string, outcome: Outcome, startedAt: number): void {
  console.info(
    JSON.stringify({
      requestId,
      route: "/launch",
      outcome,
      durationMs: Date.now() - startedAt,
    }),
  )
}

export async function GET(request: NextRequest): Promise<Response> {
  const startedAt = Date.now()
  const requestId = request.headers.get("x-request-id") ?? randomUUID()

  // Clear-first: every response below replaces/clears the prior session cookie.
  const clear = clearSessionCookie()
  const fail = (outcome: Exclude<Outcome, "success">): Response => {
    logOutcome(requestId, outcome, startedAt)
    return see303(`/launch-error?reason=${outcome}`, clear)
  }

  const url = new URL(request.url)
  const tabParam = url.searchParams.get("tab")
  const tab = tabParam && TABS.has(tabParam) ? tabParam : "contacts"

  // Kill switch + bad-key guards (AD-20, AD-4).
  if (PP_DISABLED) return fail("disabled")
  try {
    deriveAesKey(ONEHEALTH_SECRET_KEY)
  } catch {
    return fail("config")
  }

  const lpl = url.searchParams.get("lpl")
  if (!lpl) return fail("invalid")

  // Decrypt + validate.
  let payload
  try {
    payload = decryptLaunchPayload(lpl, ONEHEALTH_SECRET_KEY)
  } catch (error) {
    if (error instanceof LaunchError && error.reason === "config") return fail("config")
    return fail("invalid")
  }

  // App-id gate — no upstream call on mismatch.
  if (payload.apiKeyName !== APP_ID) return fail("invalid")

  // Single exchange (no retry).
  let exchanged
  try {
    exchanged = await exchangeCode(payload, ONEHEALTH_SECRET_KEY, API_ORIGIN)
  } catch (error) {
    if (error instanceof ExchangeError) return fail(error.reason)
    return fail("invalid")
  }

  // Tenant gate (AD-6) — no cookie, no further upstream on mismatch. A missing/
  // unparseable claim is an invalid launch (malformed token), not a wrong account;
  // only a real tenant value other than DEFAULT_TENANT_ID is a tenant mismatch.
  const tenantId = readTokenTenantId(exchanged.accessToken)
  if (tenantId === null) return fail("invalid")
  if (tenantId !== DEFAULT_TENANT_ID) return fail("tenant")

  // Id derivation (AD-1) — ids come from `/myself`, and `id` must match the payload.
  const ids = await fetchIds(exchanged.accessToken, API_ORIGIN)
  if (!ids || ids.userId !== payload.userId) return fail("invalid")

  // Seal one cookie and redirect through verify.
  const now = Date.now()
  const session: SessionData = {
    accessToken: exchanged.accessToken,
    refreshToken: exchanged.refreshToken,
    accessTokenExpiresAt: now + exchanged.expiresIn * 1000,
    userId: ids.userId,
    personId: ids.personId,
    tenantId,
    sid: randomBytes(16).toString("hex"),
    gen: 0,
    iat: now,
    lastSeen: now,
  }

  const cookie = await sealSession(session)
  logOutcome(requestId, "success", startedAt)
  return see303(`/launch/verify?tab=${tab}`, cookie)
}
