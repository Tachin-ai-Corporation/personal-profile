/**
 * Authenticator app (Team B, Epic 8: Stories 8.1–8.3). Pre-created by spec
 * F6-3 (re-exported from `lib/api/index.ts` with `export *`).
 *
 * Endpoints this module will own (`profile: true` entries land with their
 * stories in `lib/server/proxy/allowlist/mfa.ts`):
 * - `POST v2/mfa/enable/totp` (QR code, 8.2);
 * - `POST /api/pp/mfa/validate` `{ code }` (named op, built in F2);
 * - `POST v2/mfa/disable/totp` (8.3).
 * Status comes from `myself.mfaEnabled` / `totpEnabled`.
 */

import { BFF_PATHS } from "@/lib/shared/bff-contract"
import { proxyPath } from "./config"
import { callApi } from "./client"
import type { ApiResponse } from "./types"

export function mfaEnableTotpPath(): string {
  return proxyPath("v2/mfa/enable/totp")
}

export function mfaDisableTotpPath(): string {
  return proxyPath("v2/mfa/disable/totp")
}

export function mfaValidatePath(): string {
  return BFF_PATHS.mfaValidate
}

/** Imperative enrollment: never cache or retry a rotating secret. */
export async function enableTotp(): Promise<ApiResponse<{ qrCode: string }>> {
  const response = await callApi<unknown>("mfa/enableTotp", mfaEnableTotpPath(), { method: "POST" })
  if (!response.success) return { ...response, data: undefined }
  const data = response.data
  if (typeof data !== "object" || data === null || !("qrCode" in data) || typeof data.qrCode !== "string" || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(data.qrCode)) {
    return { success: false, statusCode: response.statusCode }
  }
  return { success: true, statusCode: response.statusCode, data: { qrCode: data.qrCode } }
}

/** The code is a JSON body; only the authenticated named op translates it upstream. */
export async function validateTotp(code: string): Promise<ApiResponse<boolean>> {
  const response = await callApi<unknown>("mfa/validateTotp", mfaValidatePath(), { method: "POST", body: JSON.stringify({ code }) })
  if (!response.success) return { ...response, data: undefined }
  if (typeof response.data !== "boolean") return { success: false, statusCode: response.statusCode }
  return { success: true, statusCode: response.statusCode, data: response.data }
}

/** Imperative TOTP-only removal; an empty 200 is a successful result. */
export async function disableTotp(): Promise<ApiResponse<void>> {
  const response = await callApi<void>("mfa/disableTotp", mfaDisableTotpPath(), { method: "POST" })
  return { ...response, data: undefined }
}
