/**
 * Personal information (Team A, Epic 2: Stories 2.1–2.4). Pre-created by spec
 * F6-3 so the story adds code here without editing `lib/api/index.ts`
 * (re-exported with `export *`).
 *
 * Endpoints this module will own (each allowlist entry lands with its story in
 * `lib/server/proxy/allowlist/personal.ts`):
 * - `PUT v2/user/edit` (entry exists; shared with `account.ts`: import
 *   `userEditPath` from `./user-edit-path.internal`, never re-export it);
 * - `GET v2/type/key/Person` (entry exists; read through `type-keys.ts`);
 * - `GET v2/person/{personId}/ssn/expose` (Story 2.3);
 * - Signature upload / new version / `DELETE v2/file/{id}` (Story 2.4).
 * Reads `myself` through `myself.ts`; never re-map it here.
 */

import { proxyPath } from "./config"
import type { TypeKey } from "./type-keys"

/** The type whose value lists Personal information reads (`keys.typeKey(PERSON_TYPE_KEY)`). */
export const PERSON_TYPE_KEY = "Person" satisfies TypeKey

/** The Person VALUE_LIST attributes the Section offers (`valueListOptions(info, attrKey)`). */
export const PERSON_VALUE_LISTS = ["race", "ethnicity", "biologicalGender"] as const

/** `GET /api/1h/v2/person/me/ssn/expose` (Story 2.3 adds the allowlist entry). */
export function ssnExposePath(): string {
  return proxyPath("v2/person/me/ssn/expose")
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
