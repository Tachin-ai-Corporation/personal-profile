/**
 * Session lifecycle calls: the `/auth` launch (`POST /api/token`, body `{ lpl }`
 * only, D2) and logout. Tokens never reach the browser.
 */

import { BFF_PATHS } from "@/lib/shared/bff-contract"
import { isEnvironment, type Environment } from "@/lib/shared/environments"
import { callApi } from "./client"
import type { ApiResponse } from "./types"

/** One launch attempt, as the `/auth` retry loop needs it (D9). */
export type LaunchAttempt =
  | { readonly kind: "ok"; readonly environment: Environment }
  /** The server answered non-OK, or OK without `ok: true`. `message` is user-safe copy. */
  | { readonly kind: "failed"; readonly message?: string; readonly retryable: boolean }
  | { readonly kind: "network" }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export async function startSession(lpl: string): Promise<LaunchAttempt> {
  const res = await callApi<unknown>("session/start", BFF_PATHS.token, { method: "POST", body: JSON.stringify({ lpl }) })
  if (res.success) {
    const body = res.data
    if (isRecord(body) && body.ok === true && isEnvironment(body.environment)) return { kind: "ok", environment: body.environment }
    return { kind: "failed", retryable: true }
  }
  // No HTTP status = the request never got an answer (lib/api/errors owns the codes).
  if (res.statusCode === undefined) return { kind: "network" }
  return { kind: "failed", message: res.userMessage, retryable: res.retryable !== false }
}

/**
 * Tells the server the user is active (Story 1.6): `POST /api/session/ping`
 * re-seals `lastSeen`, and `callApi` hands the echoed time to the idle timers
 * of every tab. Used by "Stay signed in", Retry and app-bar page/tab moves.
 * Never rejects.
 */
export function recordUserActivity(init: { readonly signal?: AbortSignal } = {}): Promise<ApiResponse<unknown>> {
  return callApi("session/ping", BFF_PATHS.sessionPing, { method: "POST", ...init })
}

/**
 * `POST /api/session/logout`. `keepalive` lets the request finish when the
 * page navigates away right after (Return to 1health, the expired dialog).
 */
export async function endSession(): Promise<ApiResponse<unknown>> {
  return callApi("session/end", BFF_PATHS.sessionLogout, { method: "POST", keepalive: true })
}
