import type { Page } from "@playwright/test"
import { json, type ProxyResponder } from "./core"

/**
 * Contacts (Team A, Epic 3, incl. Social Media) helpers. Write mocks for
 * Stories 3.2–3.7 go here (manage POST, verify) with `mockProxy`, prefixed
 * with the area where they could clash (`mockContactManage`, not
 * `mockSave`). The read mock `mockContacts` (`GET v2/user/contact-point/list`,
 * used by the header on both pages and by the `/account` pickers) is
 * foundation-owned and lives in `core.ts` (spec F7-1): pass it rows built here.
 */

/** One `ContactPointResponseDTO` row as the list answers it (Story 3.1): a verified US Mobile labelled Work by default. */
export function contactPointRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    name: null,
    value: "+14155550101",
    type: "Mobile",
    label: "Work",
    isVerified: true,
    isNotificationEnabled: false,
    phoneNumberRegion: "us",
    ...overrides,
  }
}

/**
 * The Phone read view's sample (spec 3.1 I/O matrix "Read" and "Format"):
 * Mobile [Work 11 (unverified), Primary 12 (notifications on)], Landline
 * [Home 21, a GB number]. Shown as 12, 11, 21.
 */
export const CONTACT_PHONES = Object.freeze({
  Mobile: [
    contactPointRow({ id: 11, value: "+14155550111", label: "Work", isVerified: false }),
    contactPointRow({ id: 12, value: "+14155512125", label: "Primary", isNotificationEnabled: true }),
  ],
  Landline: [contactPointRow({ id: 21, value: "+442071838750", type: "Landline", label: "Home", isVerified: false, phoneNumberRegion: "gb" })],
})

/** One `POST v2/health/contact-point` body (backend `ManageContactPointDTO`, Story 3.2). */
export interface ContactManageBody {
  readonly contactPointsToAdd: readonly Record<string, unknown>[]
  readonly contactPointsToUpdate: readonly Record<string, unknown>[]
  readonly contactPointsToRemove: readonly number[]
}

/**
 * Mocks the one Contact Point manage call, `POST v2/health/contact-point`
 * (Story 3.2): 200 with no body by default, as the backend answers. Returns
 * the bodies it answered, in order. Pair it with a fresh `mockContacts` for
 * the refetch that follows a save.
 */
export async function mockContactManage(page: Page, answer: ProxyResponder = {}): Promise<() => ContactManageBody[]> {
  const bodies: ContactManageBody[] = []
  await page.route("**/api/1h/v2/health/contact-point", (route) => {
    const request = route.request()
    if (request.method() !== "POST") return route.fallback()
    bodies.push(request.postDataJSON() as ContactManageBody)
    const { status = 200, body } = typeof answer === "function" ? answer(request) : answer
    return body === undefined ? route.fulfill({ status }) : json(route, status, body)
  })
  return () => [...bodies]
}
