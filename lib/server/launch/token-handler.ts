import "server-only"

import { z } from "zod"
import { BFF_ERROR_SOURCE, type BffErrorCode, type LaunchErrorBody, type LaunchOkBody } from "@/lib/shared/bff-contract"
import { environmentConfig, type Environment } from "@/lib/shared/environments"
import { LAUNCH_ERROR_MESSAGES } from "@/lib/shared/messages"
import { serverEnv, type ServerEnv } from "@/lib/server/env"
import { isJsonRequest } from "@/lib/server/http/content-type"
import { readCapped } from "@/lib/server/http/read-capped"
import { jsonResponse } from "@/lib/server/http/responses"
import { logRequest, newRequestId } from "@/lib/server/log"
import { environmentSetCookie } from "@/lib/server/session/environment-cookie"
import { buildSessionSetCookie, clearSessionSetCookie } from "@/lib/server/session/session"
import { revokeAllDevices } from "@/lib/server/session/revoke"
import { launch } from "./launch"

const ROUTE = "/api/token"
const MAX_BODY_BYTES = 16 * 1024

/** Only `lpl` is read; every other field (including `environment`) is ignored (D2). */
const bodySchema = z.object({ lpl: z.string().min(1).max(8 * 1024) })

/** Reads `{ lpl }` through the byte-capped reader; anything unusable is `null` (400 `LAUNCH_INVALID`). */
async function readLpl(request: Request): Promise<string | null> {
  const read = await readCapped(request, MAX_BODY_BYTES)
  if (!read.ok || read.bytes.byteLength === 0) return null
  try {
    const parsed = bodySchema.safeParse(JSON.parse(new TextDecoder().decode(read.bytes)))
    return parsed.success ? parsed.data.lpl : null
  } catch {
    return null
  }
}

/** The user-safe `message` for each launch error (D9). Never upstream text. */
export function launchErrorMessage(errorCode: BffErrorCode): string {
  if (errorCode === "WRONG_TENANT") return LAUNCH_ERROR_MESSAGES.wrongTenant
  if (errorCode === "LAUNCH_CONFIG" || errorCode === "SERVICE_DISABLED") return LAUNCH_ERROR_MESSAGES.unavailable
  return LAUNCH_ERROR_MESSAGES.expired
}

/**
 * A `/api/token` failure: `{ ok: false, errorCode, source, message, retryable? }`,
 * no-store, and any previous session cookie cleared.
 */
export function launchFailure(status: number, errorCode: BffErrorCode, retryable: boolean): Response {
  const body: LaunchErrorBody = {
    ok: false,
    errorCode,
    source: BFF_ERROR_SOURCE,
    message: launchErrorMessage(errorCode),
    ...(retryable ? {} : { retryable: false as const }),
  }
  return jsonResponse(status, body, new Headers({ "Set-Cookie": clearSessionSetCookie() }))
}

/** Every method but POST on `/api/token`: 405 in the launch envelope, never retried. */
export async function tokenMethodNotAllowed(): Promise<Response> {
  return launchFailure(405, "METHOD_NOT_ALLOWED", false)
}

export interface TokenHandlerDeps {
  readonly env?: () => ServerEnv
  readonly now?: () => number
}

/**
 * POST /api/token `{ lpl }` (Story 1.2, D1/D2/D9). Detects the environment by
 * the decrypting key, seals tokens + environment into `__Host-pp_s` and
 * answers `{ ok: true, environment }`. Every failure clears any previous
 * session and answers `{ ok: false, errorCode, source, message, retryable? }`.
 */
export function createTokenHandler(deps: TokenHandlerDeps = {}): (request: Request) => Promise<Response> {
  const getEnv = deps.env ?? serverEnv
  const now = deps.now ?? Date.now

  return async function handleToken(request: Request): Promise<Response> {
    const requestId = newRequestId()
    const started = now()
    const finish = (response: Response, outcome: string, environment?: Environment): Response => {
      logRequest({ requestId, method: "POST", routeTemplate: ROUTE, status: response.status, durationMs: now() - started, outcome, environment })
      return response
    }
    const fail = (status: number, errorCode: BffErrorCode, retryable: boolean, environment?: Environment): Response =>
      finish(launchFailure(status, errorCode, retryable), errorCode, environment)

    const env = getEnv()
    if (env.PP_DISABLED) return fail(503, "SERVICE_DISABLED", false)
    if (!isJsonRequest(request)) return fail(415, "UNSUPPORTED_MEDIA", false)

    const lpl = await readLpl(request)
    if (lpl === null) return fail(400, "LAUNCH_INVALID", false)

    const result = await launch(lpl, env, now(), requestId)
    if (result.kind === "failed") return fail(result.status, result.errorCode, result.retryable, result.environment)

    const { environment } = result.session
    const headers = new Headers()
    let sessionCookie: string
    try {
      sessionCookie = await buildSessionSetCookie(result.session)
    } catch {
      // A11: the cookie would exceed its budget. Revoke the just-issued tokens
      // (best effort), then fail like any configuration problem: not retryable.
      await revokeAllDevices(environmentConfig(environment).apiRoot, result.session.accessToken, { requestId, routeTemplate: ROUTE })
      return fail(500, "LAUNCH_CONFIG", false, environment)
    }
    headers.append("Set-Cookie", sessionCookie)
    headers.append("Set-Cookie", environmentSetCookie(environment))
    const body: LaunchOkBody = { ok: true, environment }
    return finish(jsonResponse(200, body, headers), "ok", environment)
  }
}
