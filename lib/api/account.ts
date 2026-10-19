/**
 * Personal account settings (Team B, Epic 7: Stories 7.4–7.6). Pre-created by
 * spec F6-3 (re-exported from `lib/api/index.ts` with `export *`).
 *
 * Endpoints this module will own (`profile: true` entries land with their
 * stories in `lib/server/proxy/allowlist/account.ts`):
 * - `PUT v2/user/edit` through `updateAccount(diff)` (Story 7.5; the
 *   ownership lint lets only `features/account/**` import `updateAccount`);
 *   the path is `userEditPath()` from `./user-edit-path.internal` (shared
 *   with `personal.ts`, never re-exported);
 * - `POST v2/user/time-zone?timeZone=<IANA>` (`setTimeZone`, 7.5; the
 *   `timeZone` query rule is `required: true`);
 * - `POST v2/user/locale?locale=en-US` (`setLocale`, 7.5; `required: true`).
 * Reads `myself` (`myself.ts`) and the Contact Points (`contact-points.ts`).
 */

import { proxyPath } from "./config"
import { callApi } from "./client"
import type { ApiResponse } from "./types"
import { userEditPath } from "./user-edit-path.internal"

/** The only locale the app writes (FR108; never `locale` in `/edit`, backend R2). */
export const ACCOUNT_LOCALE = "en-US"

export function timeZonePath(timeZone: string): string {
  return proxyPath(`v2/user/time-zone?timeZone=${encodeURIComponent(timeZone)}`)
}

export function localePath(): string {
  return proxyPath(`v2/user/locale?locale=${ACCOUNT_LOCALE}`)
}

/** Account's changed details only; credentials and regional writes are excluded. */
export interface AccountDetailsPayload {
  readonly firstName?: string
  readonly lastName?: string
  readonly birthDate?: string
  readonly preferredLanguage?: string
}

async function accountWrite(path: string, method: "PUT" | "POST", body?: AccountDetailsPayload): Promise<ApiResponse<void>> {
  const response = await callApi<void>("account/write", path, { method, ...(body ? { body: JSON.stringify(body) } : {}) })
  // These upstream endpoints may return an empty or non-JSON 2xx response.
  return response.statusCode !== undefined && response.statusCode >= 200 && response.statusCode < 300
    ? { success: true, statusCode: response.statusCode }
    : response
}

export function updateAccount(diff: AccountDetailsPayload): Promise<ApiResponse<void>> {
  // Pick explicitly so even a structurally wider object cannot send credentials.
  const body = Object.fromEntries((["firstName", "lastName", "birthDate", "preferredLanguage"] as const)
    .filter((field) => diff[field] !== undefined).map((field) => [field, diff[field]]))
  return accountWrite(userEditPath(), "PUT", body)
}

export function setTimeZone(timeZone: string): Promise<ApiResponse<void>> {
  return accountWrite(timeZonePath(timeZone), "POST")
}

export function setLocale(): Promise<ApiResponse<void>> {
  return accountWrite(localePath(), "POST")
}
