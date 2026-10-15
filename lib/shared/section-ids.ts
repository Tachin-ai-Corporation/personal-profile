/**
 * Section ids (Story 1.11): URL hash = folder = draft key = telemetry id.
 * Shared by `features/shell` (registry), `lib/api/errors` (error scopes) and
 * `lib/shared/telemetry` (typed payloads). `authenticator` on `/account` is an
 * anchor, not a Section.
 */
export const SECTION_IDS = ["personal", "phone", "email", "social", "addresses", "insurance", "account"] as const

export type SectionId = (typeof SECTION_IDS)[number]
