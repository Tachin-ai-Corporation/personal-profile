/**
 * Personal account settings (Team B, Epic 7) mocks. Reads come from `myself`
 * and the Contact Points (`core.ts`, `contacts.ts`); Stories 7.5 and 7.6 add
 * their write mocks (`PUT v2/user/edit`, `POST v2/user/time-zone`,
 * `POST v2/user/locale`) here with `mockProxy`.
 */
import { ANN, mockProxy, type ProxyResponder } from "./core"
import type { Page } from "@playwright/test"

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

/** Regional responses can fail independently to exercise Account recovery. */
export function mockAccountTimeZone(page: Page, answer: ProxyResponder = { status: 204 }) {
  return mockProxy(page, "v2/user/time-zone?**", answer)
}
export function mockAccountLocale(page: Page, answer: ProxyResponder = { status: 204 }) {
  return mockProxy(page, "v2/user/locale?**", answer)
}

/** Verified alternatives plus intentionally ineligible rows for Story 7.6. */
export const ACCOUNT_PRIMARY_CONTACTS = {
  Email: [
    { id: 10, type: "Email", value: "ann.lee@example.test", label: "Primary", isVerified: false },
    { id: 11, type: "Email", value: "ann.work@example.test", label: "Work", isVerified: true },
    { id: 12, type: "Email", value: "ANN.WORK@example.test", label: "Work", isVerified: true },
    { id: 13, type: "Email", value: "unverified@example.test", isVerified: false },
  ],
  Mobile: [
    { id: 20, type: "Mobile", value: "4155512125", label: "Primary", isVerified: false, phoneNumberRegion: "us" },
    { id: 21, type: "Mobile", value: "+442071838750", label: "Work", isVerified: true, phoneNumberRegion: "GB" },
    { id: 22, type: "Landline", value: "+14155551234", label: "Home", isVerified: true, phoneNumberRegion: "US" },
  ],
} as const
