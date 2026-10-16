/**
 * Personal account settings (Team B, Epic 7) mocks. Reads come from `myself`
 * and the Contact Points (`core.ts`, `contacts.ts`); Stories 7.5 and 7.6 add
 * their write mocks (`PUT v2/user/edit`, `POST v2/user/time-zone`,
 * `POST v2/user/locale`) here with `mockProxy`.
 */
import { ANN } from "./core"

/** Synthetic Story 7.4 data; the shared ANN fixture stays frozen. */
export const ACCOUNT_SETTINGS_MYSELF = Object.freeze({
  ...ANN,
  firstName: " Ann ",
  lastName: " Lee ",
  username: " ann.lee ",
  email: " ann.lee@example.test ",
  phoneNumber: "4155512125",
  birthDate: "1987-03-09",
  roles: ["Patient"],
  preferredLanguage: "en",
  timeZone: "America/Chicago",
  locale: "en-US",
  password: "must-never-be-rendered",
})
