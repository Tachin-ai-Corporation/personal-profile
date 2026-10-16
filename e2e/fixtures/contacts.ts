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
