import "server-only"

import { z } from "zod"
import { fetchWithTimeout } from "@/lib/server/http/fetch-with-timeout"
import { expiresInSchema } from "@/lib/server/session/expires-in"
import { signCode } from "./lpl-crypto"

/** Upstream calls made by a launch: the one-time code exchange and the `myself` id check. */

const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: expiresInSchema,
})

export interface ExchangedTokens {
  readonly accessToken: string
  readonly refreshToken: string
  /** Seconds until the access token expires. */
  readonly expiresIn: number
}

/**
 * Why an exchange failed: `used`/`expired`/`rejected` are upstream rejections
 * (400); `unavailable` is a 5xx, timeout, network error or unreadable answer (502).
 */
export type ExchangeFailure = "used" | "expired" | "rejected" | "unavailable"

export type ExchangeResult =
  | { readonly kind: "ok"; readonly tokens: ExchangedTokens }
  | { readonly kind: "failed"; readonly reason: ExchangeFailure }

/** The upstream error text: `message` of a JSON `{ message }` body, else the raw body. */
function upstreamMessage(body: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return body
  }
  if (typeof parsed === "object" && parsed !== null && "message" in parsed && typeof parsed.message === "string") return parsed.message
  return body
}

/**
 * Maps a rejected exchange to a reason by the backend's texts
 * (`Messages.java`, `EXTERNAL_APPLICATION_SECURITY_CODE_*`; spec R5-1):
 * "External application security code: '<code>' has already been redeemed."
 * → `used`; "… has expired." → `expired`; everything else ("Could not find
 * external application security code: …", "Invalid signature provided.",
 * "… could not be redeemed.", an unreadable body) → `rejected`. The quoted
 * code is dropped first, so its value can never change the result.
 */
export function classifyExchangeError(body: string): "used" | "expired" | "rejected" {
  const text = upstreamMessage(body).replace(/'[^']*'/g, "''").trim().toLowerCase()
  if (/ has already been redeemed\.?$/.test(text)) return "used"
  if (/ has expired\.?$/.test(text)) return "expired"
  return "rejected"
}

/**
 * Exchanges the one-time code exactly once (no retry), signing it with the key
 * variant that decrypted the payload.
 */
export async function exchangeCode(apiRoot: string, code: string, secretKey: string): Promise<ExchangeResult> {
  const outcome = await fetchWithTimeout(`${apiRoot}/api/v2/public/external-application/auth/oauth2/user/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ securityCode: code, signature: signCode(code, secretKey) }),
  })
  if (outcome.kind !== "response") return { kind: "failed", reason: "unavailable" }

  const { response } = outcome
  if (response.status >= 400 && response.status < 500) {
    return { kind: "failed", reason: classifyExchangeError(await response.text().catch(() => "")) }
  }
  if (response.status >= 300 && response.status < 400) return { kind: "failed", reason: "rejected" }
  if (!response.ok) return { kind: "failed", reason: "unavailable" }

  const parsed = tokenSchema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) return { kind: "failed", reason: "unavailable" }
  return {
    kind: "ok",
    tokens: {
      accessToken: parsed.data.access_token,
      refreshToken: parsed.data.refresh_token,
      expiresIn: parsed.data.expires_in,
    },
  }
}

const tenantClaimSchema = z.object({ tenantId: z.union([z.number().int(), z.string().regex(/^\d{1,19}$/)]) })

/**
 * Reads the plaintext `tenantId` claim of an access token (AD-6). The other
 * identity claims are encrypted and are never decoded.
 */
export function readTenantId(accessToken: string): number | null {
  const payload = accessToken.split(".")[1]
  if (!payload) return null
  let claims: unknown
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
  } catch {
    return null
  }
  const parsed = tenantClaimSchema.safeParse(claims)
  return parsed.success ? Number(parsed.data.tenantId) : null
}

const myselfIdsSchema = z.object({
  id: z.number().int().positive(),
  personId: z.number().int().positive(),
})

export interface MyselfIds {
  readonly userId: number
  readonly personId: number
}

/** `GET /api/v2/user/myself` with the new token; ids never come from the JWT (AD-1). */
export async function fetchMyselfIds(apiRoot: string, accessToken: string): Promise<MyselfIds | null> {
  const outcome = await fetchWithTimeout(`${apiRoot}/api/v2/user/myself`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  })
  if (outcome.kind !== "response" || !outcome.response.ok) return null
  const parsed = myselfIdsSchema.safeParse(await outcome.response.json().catch(() => null))
  return parsed.success ? { userId: parsed.data.id, personId: parsed.data.personId } : null
}
