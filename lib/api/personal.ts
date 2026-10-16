/**
 * Personal information (Team A, Epic 2: Stories 2.1–2.4). Pre-created by spec
 * F6-3 so the story adds code here without editing `lib/api/index.ts`
 * (re-exported with `export *`).
 *
 * Endpoints this module will own (each allowlist entry lands with its story in
 * `lib/server/proxy/allowlist/personal.ts`):
 * - `PUT v2/user/edit` (entry exists; shared with `account.ts`: import
 *   `userEditPath` from `./user-edit-path.internal`, never re-export it):
 *   `savePersonalInformation` (Story 2.2);
 * - `GET v2/type/key/Person` (entry exists; read through `type-keys.ts`);
 * - `GET v2/person/{personId}/ssn/expose`: `revealSsn` (Story 2.3);
 * - Signature upload / new version / `DELETE v2/file/{id}` (Story 2.4).
 * Reads `myself` through `myself.ts`; never re-map it here.
 */

import { callApi } from "./client"
import { proxyPath } from "./config"
import { mapApiError, mappedErrorCode, type MappedError } from "./errors"
import { mutateMyself } from "./keys"
import type { TypeKey } from "./type-keys"
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

/**
 * A Personal-information save outcome, in the shape of the shell's
 * `SaveResult` (`useSectionForm`'s `save()` returns it as is): ok, or the
 * mapped failure with its PHI-free code.
 */
export type PersonalSaveResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: { readonly code: ReturnType<typeof mappedErrorCode>; readonly mapped: MappedError } }

/**
 * Story 2.2: `PUT /api/1h/v2/user/edit` with the changed fields only (`diff`,
 * built by the Section; a cleared optional field is already `"n/a"`). An
 * empty diff sends nothing and resolves ok. On success `myself` is
 * revalidated (the header name, both pages) before it resolves; a failure is
 * mapped with `mapApiError("personal", …)`. Never throws. The D-A save
 * safeguard inside `callApi` re-reads `myself` before the PUT.
 */
export async function savePersonalInformation(diff: PersonalInformationPayload): Promise<PersonalSaveResult> {
  if (Object.keys(diff).length === 0) return { ok: true }
  const res = await callApi<unknown>("personal/savePersonalInformation", userEditPath(), { method: "PUT", body: JSON.stringify(diff) })
  // A 2xx whose body can't be read still saved (as `uploadProfilePicture` counts it).
  const saved = res.success || (res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300)
  if (!saved) {
    const mapped = mapApiError("personal", res)
    return { ok: false, error: { code: mappedErrorCode(mapped), mapped } }
  }
  await mutateMyself()
  return { ok: true }
}
