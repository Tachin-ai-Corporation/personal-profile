/**
 * Personal information (Team A, Epic 2: Stories 2.1–2.4). Pre-created by spec
 * F6-3 so the story adds code here without editing `lib/api/index.ts`
 * (re-exported with `export *`).
 *
 * Endpoints this module will own (each allowlist entry lands with its story in
 * `lib/server/proxy/allowlist/personal.ts`):
 * - `PUT v2/user/edit` (entry exists; shared with `account.ts`: import
 *   `userEditPath` from `./user-edit-path.internal`, never re-export it):
 *   `sendPersonalInformation` (Stories 2.2–2.4: one step of the Section's
 *   `runSaveSteps` save in `features/personal/signature-save.ts`);
 * - `GET v2/type/key/Person` (entry exists; read through `type-keys.ts`);
 * - `GET v2/person/{personId}/ssn/expose`: `revealSsn` (Story 2.3);
 * - the Signature upload
 *   `POST v2/health/type/Person/{personId}/relation/PersonHasSignatureFile/file/upload`
 *   (`uploadSignature`, Story 2.4) and the old Signature's delete through the
 *   ownership-checked named op `DELETE /api/pp/file/{fileId}`
 *   (`deleteSignatureFile`); there is no `v2/file/{id}/version` call (human
 *   decision 2026-10-16: the backend checks only the tenant there).
 * Reads `myself` through `myself.ts`; never re-map it here.
 */

import { callApi } from "./client"
import { proxyPath } from "./config"
import { mapApiError, type MappedError } from "./errors"
import { fileDeletePath } from "./files"
import type { TypeKey } from "./type-keys"
import type { ApiResponse } from "./types"
import { userEditPath } from "./user-edit-path.internal"

/** The type whose value lists Personal information reads (`keys.typeKey(PERSON_TYPE_KEY)`). */
export const PERSON_TYPE_KEY = "Person" satisfies TypeKey

/** The Person VALUE_LIST attributes the Section offers (`valueListOptions(info, attrKey)`). */
export const PERSON_VALUE_LISTS = ["race", "ethnicity", "biologicalGender"] as const

/** `GET /api/1h/v2/person/me/ssn/expose` (Story 2.3: entry in `allowlist/personal.ts`). */
export function ssnExposePath(): string {
  return proxyPath("v2/person/me/ssn/expose")
}

/**
 * A Reveal outcome (Story 2.3): the full SSN as `XXX-XX-XXXX`, or not ok
 * (`mapped` for a failed request; none for an answer without a 9-digit SSN).
 */
export type SsnRevealResult =
  | { readonly ok: true; readonly ssn: string }
  | { readonly ok: false; readonly mapped?: MappedError }

/** The backend's full SSN: exactly nine digits (`"n/a"` when cleared). */
const NINE_DIGITS = /^\d{9}$/

/**
 * Story 2.3 (FR13): `GET /api/1h/v2/person/me/ssn/expose` straight through
 * `callApi`, never through SWR (no key, no loader, no `mutate`), so the full
 * SSN is held only by the caller (the SSN component's state, while
 * revealed). Only a 9-digit `socialSecurityNumber` counts, returned as
 * `XXX-XX-XXXX`; `"n/a"`, null or any other shape is `{ ok: false }`. A
 * failed request is `{ ok: false, mapped }` (`mapApiError("personal", …)`).
 * Never throws and logs nothing itself (`callApi`'s dev-only `logApiCall`
 * redacts the body by key and by shape).
 */
export async function revealSsn(): Promise<SsnRevealResult> {
  const res = await callApi<unknown>("personal/revealSsn", ssnExposePath())
  if (!res.success) return { ok: false, mapped: mapApiError("personal", res) }
  const value = typeof res.data === "object" && res.data !== null ? (res.data as { readonly socialSecurityNumber?: unknown }).socialSecurityNumber : undefined
  if (typeof value !== "string" || !NINE_DIGITS.test(value)) return { ok: false }
  return { ok: true, ssn: `${value.slice(0, 3)}-${value.slice(3, 5)}-${value.slice(5)}` }
}

/**
 * One changed-fields body of the Personal-information `PUT v2/user/edit`
 * (`PersonalInformationDTO`, Stories 2.2–2.3; spec F7-2 pre-declares it so
 * Story 7.6's type test needs no Team A code). Written out field by field,
 * not derived from the proxy schema (`lib/api` never imports `lib/server`).
 * Values are strings as the proxy schema accepts them (enum labels for race,
 * ethnicity and biological gender; `YYYY-MM-DD` birth date; `"n/a"` clears an
 * optional field). It never has `email`, `phoneNumber` or
 * `phoneNumberRegion`: only `account.ts#updateAccount` (AD-9) builds those.
 */
export interface PersonalInformationPayload {
  readonly firstName?: string
  readonly middleName?: string
  readonly lastName?: string
  readonly namePrefix?: string
  readonly nameSuffix?: string
  readonly otherNames?: string
  readonly titles?: string
  readonly birthDate?: string
  readonly cityOfBirth?: string
  readonly race?: string
  readonly ethnicity?: string
  readonly biologicalGender?: string
  readonly genderIdentity?: string
  readonly sexualOrientation?: string
  /** Story 2.3: `XXX-XX-XXXX`, nine digits, or `"n/a"` to remove it. */
  readonly socialSecurityNumber?: string
}

/** The fields a Personal-information save may send. */
export type PersonalInformationField = keyof PersonalInformationPayload

/** `true` for an answer that saved: a success, or a 2xx whose body can't be read (as `uploadProfilePicture` counts it). */
function isSaved(res: ApiResponse<unknown>): boolean {
  return res.success || (res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300)
}

/**
 * The Personal-information `PUT /api/1h/v2/user/edit` with `diff` as is
 * (Stories 2.2–2.4): the raw answer, for a `runSaveSteps` step. A 2xx whose
 * body can't be read counts as a success. Never throws; revalidates nothing.
 */
export async function sendPersonalInformation(diff: PersonalInformationPayload): Promise<ApiResponse<unknown>> {
  const res = await callApi<unknown>("personal/sendPersonalInformation", userEditPath(), { method: "PUT", body: JSON.stringify(diff) })
  return !res.success && isSaved(res) ? { success: true, statusCode: res.statusCode } : res
}

/**
 * `POST /api/1h/v2/health/type/Person/me/relation/PersonHasSignatureFile/file/upload`
 * (Story 2.4): the caller's own person (`me`), no query (the proxy forces
 * `isPublic=false`).
 */
export function signatureUploadPath(): string {
  return proxyPath("v2/health/type/Person/me/relation/PersonHasSignatureFile/file/upload")
}

/** The upload's `file` part name: every Signature is a re-encoded PNG. */
export const SIGNATURE_UPLOAD_NAME = "signature.png"

/**
 * Story 2.4: `POST` the re-encoded Signature PNG as `multipart/form-data`
 * with exactly one part, `file`, named `signature.png`, to
 * `signatureUploadPath()`. `callApi` sets no JSON `Content-Type` for a
 * `FormData` body, so the browser adds the boundary. The body isn't used
 * (the caller re-reads `myself` for the new id), so a 2xx whose body isn't
 * JSON is still a success. Never sends `isPublic`, `current` or `hardDelete`.
 */
export async function uploadSignature(blob: Blob): Promise<ApiResponse<unknown>> {
  const body = new FormData()
  body.append("file", blob, SIGNATURE_UPLOAD_NAME)
  const res = await callApi<unknown>("personal/uploadSignature", signatureUploadPath(), { method: "POST", body })
  return !res.success && isSaved(res) ? { success: true, statusCode: res.statusCode } : res
}

/**
 * Story 2.4: deletes one of the caller's Signature files through the
 * ownership-checked named op `DELETE /api/pp/file/{fileId}` (`fileDeletePath`;
 * the server hard-deletes it and answers 404 `NO_FILE` for a file that isn't
 * the caller's). Take `fileId` only from `myself.signature.id`. A non-id
 * sends nothing and fails.
 */
export async function deleteSignatureFile(fileId: number): Promise<ApiResponse<unknown>> {
  const path = fileDeletePath(fileId)
  if (path === null) return { success: false, error: "personal/deleteSignatureFile: not a file id" }
  return callApi<unknown>("personal/deleteSignatureFile", path, { method: "DELETE" })
}

/**
 * A `deleteSignatureFile` answer for a file that is already gone (or never
 * was the caller's): the named op's 404 `NO_FILE`, its only 404 (BFF
 * contract). A removal treats it as deleted and lets the re-read decide.
 */
export function isSignatureFileGone(res: ApiResponse<unknown>): boolean {
  return !res.success && res.statusCode === 404
}
