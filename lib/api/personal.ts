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
