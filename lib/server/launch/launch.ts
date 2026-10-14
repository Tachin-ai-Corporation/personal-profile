import "server-only"

import { z } from "zod"
import type { BffErrorCode } from "@/lib/shared/bff-contract"
import { environmentConfig, type Environment } from "@/lib/shared/environments"
import { DEFAULT_TENANT_ID, secretKeyVariable, type ServerEnv } from "@/lib/server/env"
import { logWarning, newRequestId } from "@/lib/server/log"
import { revokeAllDevices } from "@/lib/server/session/revoke"
import { newSid } from "@/lib/server/session/session"
import type { SessionPayload } from "@/lib/server/session/types"
import { decryptLpl } from "./lpl-crypto"
import { exchangeCode, fetchMyselfIds, readTenantId, type ExchangeFailure } from "./exchange"

/** The route template used in launch log lines. */
export const LAUNCH_ROUTE = "/api/token"

/** The fields of the decrypted launch payload this app relies on. */
const launchPayloadSchema = z.object({
  required: z.object({
    apiKey: z.object({ name: z.string().min(1) }),
    tenant: z.object({ id: z.number().int().positive() }),
    user: z.object({ id: z.number().int().positive() }),
    oneTimeCode: z.object({ value: z.string().min(1), issuedAt: z.string().min(1) }),
  }),
})

export type LaunchPayload = z.infer<typeof launchPayloadSchema>

/** Decrypted plaintext → payload, or `null` when it is not JSON or lacks a required field. */
export function parseLaunchPayload(plaintext: string): LaunchPayload | null {
  let json: unknown
  try {
    json = JSON.parse(plaintext)
  } catch {
    return null
  }
  const parsed = launchPayloadSchema.safeParse(json)
  return parsed.success ? parsed.data : null
}

/** What the launch reads from the server env. */
export type LaunchCredentials = Pick<ServerEnv, "getSecretKey" | "getAppId">

/** Launch order (D2): prod before demo. */
const DETECTION_ORDER: readonly Environment[] = ["prod", "demo"]

export interface KeyVariant {
  readonly environment: Environment
  readonly key: string
  readonly trimmed: boolean
}

/** Each environment's key as stored, then trimmed when that differs. Blank keys are unusable. */
export function keyVariants(credentials: LaunchCredentials): KeyVariant[] {
  const variants: KeyVariant[] = []
  for (const environment of DETECTION_ORDER) {
    const raw = credentials.getSecretKey(environment)
    const trimmed = raw.trim()
    if (trimmed === "") continue
    variants.push({ environment, key: raw, trimmed: false })
    if (trimmed !== raw) variants.push({ environment, key: trimmed, trimmed: true })
  }
  return variants
}

export interface DetectedLaunch {
  readonly variant: KeyVariant
  readonly plaintext: string
}

/** The first key variant that authenticates the payload decides the environment (D2). */
export function detectEnvironment(lpl: string, variants: readonly KeyVariant[]): DetectedLaunch | null {
  for (const variant of variants) {
    const plaintext = decryptLpl(lpl, variant.key)
    if (plaintext !== null) return { variant, plaintext }
  }
  return null
}

export type LaunchResult =
  | { readonly kind: "ok"; readonly session: SessionPayload }
  | {
      readonly kind: "failed"
      readonly errorCode: BffErrorCode
      readonly status: number
      /** `false` stops the client's retries (D9). */
      readonly retryable: boolean
      readonly environment?: Environment
    }

const EXCHANGE_FAILURES: Readonly<Record<ExchangeFailure, { errorCode: BffErrorCode; status: number }>> = {
  used: { errorCode: "LAUNCH_USED", status: 400 },
  expired: { errorCode: "LAUNCH_EXPIRED", status: 400 },
  rejected: { errorCode: "LAUNCH_INVALID", status: 400 },
  unavailable: { errorCode: "LAUNCH_INVALID", status: 502 },
}

const permanent = (errorCode: BffErrorCode, status: number, environment?: Environment): LaunchResult => ({
  kind: "failed",
  errorCode,
  status,
  retryable: false,
  environment,
})
const transient = (errorCode: BffErrorCode, status: number, environment: Environment): LaunchResult => ({
  kind: "failed",
  errorCode,
  status,
  retryable: true,
  environment,
})

/**
 * The launch: detect environment by key → payload → app id → exchange once →
 * tenant → `myself` id check → new session. Decode failures make no upstream
 * call and are not retryable.
 */
export async function launch(
  lpl: string,
  credentials: LaunchCredentials,
  now: number = Date.now(),
  requestId: string = newRequestId(),
): Promise<LaunchResult> {
  const variants = keyVariants(credentials)
  if (variants.length === 0) return { kind: "failed", errorCode: "LAUNCH_CONFIG", status: 503, retryable: false }

  const detected = detectEnvironment(lpl, variants)
  if (detected === null) return permanent("LAUNCH_INVALID", 400)
  const { variant } = detected
  const { environment } = variant
  if (variant.trimmed) logWarning(`${secretKeyVariable(environment)} matched only after trimming whitespace`)

  const payload = parseLaunchPayload(detected.plaintext)
  if (payload === null) return permanent("LAUNCH_INVALID", 400, environment)
  if (payload.required.apiKey.name !== credentials.getAppId(environment)) {
    return permanent("LAUNCH_INVALID", 400, environment)
  }

  const { apiRoot } = environmentConfig(environment)
  const exchange = await exchangeCode(apiRoot, payload.required.oneTimeCode.value, variant.key)
  if (exchange.kind === "failed") {
    const failure = EXCHANGE_FAILURES[exchange.reason]
    return transient(failure.errorCode, failure.status, environment)
  }

  const { tokens } = exchange
  // A11: tokens issued for a launch that then fails are revoked (best effort)
  // before answering. The wrong-tenant path makes no further upstream call (Story 1.2).
  const revokeIssued = (): Promise<void> => revokeAllDevices(apiRoot, tokens.accessToken, { requestId, routeTemplate: LAUNCH_ROUTE })

  const tenantId = readTenantId(tokens.accessToken)
  if (tenantId === null) {
    await revokeIssued()
    return transient("LAUNCH_INVALID", 502, environment)
  }
  if (tenantId !== DEFAULT_TENANT_ID) return permanent("WRONG_TENANT", 403, environment)

  const ids = await fetchMyselfIds(apiRoot, tokens.accessToken)
  if (ids === null || ids.userId !== payload.required.user.id) {
    await revokeIssued()
    return transient("LAUNCH_INVALID", 502, environment)
  }

  return {
    kind: "ok",
    session: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      // Whole ms: a fractional `expires_in` would fail the session schema on every unseal.
      accessExpiresAt: now + Math.floor(tokens.expiresIn * 1000),
      userId: ids.userId,
      personId: ids.personId,
      tenantId,
      sid: newSid(),
      gen: 0,
      iat: now,
      lastSeen: now,
      environment,
    },
  }
}
