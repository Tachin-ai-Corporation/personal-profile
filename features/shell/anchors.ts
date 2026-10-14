import { SHELL_MESSAGES } from "@/lib/shared/messages"
import type { SectionId } from "@/lib/shared/section-ids"

/**
 * Deep-link anchors of both pages (EXPERIENCE.md Information Architecture,
 * port of main's Story 1.8B `sections.ts`). The id is the URL hash, the
 * `<section id>` and the Section id (`lib/shared/section-ids`).
 */

/** The Contacts tab's Sections, in display order: the Section menu, Jump to, scroll-spy and deep links. */
export const PROFILE_SECTIONS = [
  { id: "personal", number: "01", label: SHELL_MESSAGES.sectionPersonal },
  { id: "phone", number: "02", label: SHELL_MESSAGES.sectionPhone },
  { id: "email", number: "03", label: SHELL_MESSAGES.sectionEmail },
  { id: "social", number: "04", label: SHELL_MESSAGES.sectionSocial },
  { id: "addresses", number: "05", label: SHELL_MESSAGES.sectionAddresses },
] as const satisfies readonly { readonly id: SectionId; readonly number: string; readonly label: string }[]

export type ProfileSectionId = (typeof PROFILE_SECTIONS)[number]["id"]

export const PROFILE_SECTION_IDS: readonly ProfileSectionId[] = PROFILE_SECTIONS.map((section) => section.id)

/** The Signature row inside Personal information (`#signature`). */
export const SIGNATURE_ANCHOR = "signature"

/** Sub-anchors → the Section that holds them. */
export const PROFILE_SUB_ANCHORS: Readonly<Record<string, ProfileSectionId>> = { [SIGNATURE_ANCHOR]: "personal" }

/** The `/account` Personal Account tab's anchors: Section `account` and the `authenticator` card (Story 7.1). */
export const ACCOUNT_ANCHORS = ["account", "authenticator"] as const

export type AccountAnchor = (typeof ACCOUNT_ANCHORS)[number]

/** Column headers per Section table; empty for the key/value table and the Insurance cards. */
export const SECTION_COLUMNS: Readonly<Record<ProfileSectionId | "insurance", readonly string[]>> = {
  personal: [],
  phone: [
    SHELL_MESSAGES.columnNumber,
    SHELL_MESSAGES.columnLabel,
    SHELL_MESSAGES.columnType,
    SHELL_MESSAGES.columnStatus,
    SHELL_MESSAGES.columnNotifications,
  ],
  email: [SHELL_MESSAGES.columnEmailAddress, SHELL_MESSAGES.columnLabel, SHELL_MESSAGES.columnStatus, SHELL_MESSAGES.columnNotifications],
  social: [SHELL_MESSAGES.columnLink],
  addresses: [SHELL_MESSAGES.columnAddress, SHELL_MESSAGES.columnLabel, SHELL_MESSAGES.columnType, SHELL_MESSAGES.columnStatus],
  insurance: [],
}

export function isProfileSectionId(value: unknown): value is ProfileSectionId {
  return typeof value === "string" && (PROFILE_SECTION_IDS as readonly string[]).includes(value)
}

/** The `h2` id of a Section or anchor container: one implementation, in `nav-types`. */
export { sectionHeadingId } from "./nav-types"
