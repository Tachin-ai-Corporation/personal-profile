import { SHELL_COPY } from "@/lib/shared/messages"

/**
 * The Contacts tab's Sections (Story 1.8, AD-7), in display order. The id is
 * also the Section's URL hash, `<section id>` and later its feature folder,
 * draft key and telemetry id. One definition shared by the Section menu, the
 * Jump to select, the scroll-spy and the deep links.
 */

export const SECTIONS = [
  { id: "personal", number: "01", label: SHELL_COPY.sections.personal },
  { id: "phone", number: "02", label: SHELL_COPY.sections.phone },
  { id: "email", number: "03", label: SHELL_COPY.sections.email },
  { id: "social", number: "04", label: SHELL_COPY.sections.social },
  { id: "addresses", number: "05", label: SHELL_COPY.sections.addresses },
] as const

export type SectionId = (typeof SECTIONS)[number]["id"]

/** The Signature row's sub-anchor inside Personal information (`#signature`). */
export const SIGNATURE_ANCHOR = "signature"

/** Column headers per Section's table; empty for the key/value table and cards. */
export const SECTION_COLUMNS: Record<SectionId | "insurance", readonly string[]> = {
  personal: [],
  phone: SHELL_COPY.columns.phone,
  email: SHELL_COPY.columns.email,
  social: SHELL_COPY.columns.social,
  addresses: SHELL_COPY.columns.addresses,
  insurance: [],
}

/** The tabs, in strip order. */
export const TAB_IDS = ["contacts", "insurance", "medical"] as const

export type TabId = (typeof TAB_IDS)[number]

/** `true` for `contacts|insurance|medical`. */
export function isTabId(value: unknown): value is TabId {
  return typeof value === "string" && (TAB_IDS as readonly string[]).includes(value)
}

/** A raw `?tab=` value → a known tab; unknown or missing → `contacts`. */
export function normalizeTab(value: unknown): TabId {
  return isTabId(value) ? value : "contacts"
}

/** `true` for one of the five Section ids. */
export function isSectionId(value: unknown): value is SectionId {
  return typeof value === "string" && SECTIONS.some((s) => s.id === value)
}

/** The `h2` id of a Section (its `aria-labelledby` target). */
export function sectionHeadingId(id: string): string {
  return `${id}-heading`
}
