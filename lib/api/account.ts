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

/** The only locale the app writes (FR108; never `locale` in `/edit`, backend R2). */
export const ACCOUNT_LOCALE = "en-US"

export function timeZonePath(timeZone: string): string {
  return proxyPath(`v2/user/time-zone?timeZone=${encodeURIComponent(timeZone)}`)
}

export function localePath(): string {
  return proxyPath(`v2/user/locale?locale=${ACCOUNT_LOCALE}`)
}
