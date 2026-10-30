import { PROFILE_SECTION_IDS } from "./anchors"

/**
 * The design refresh's entrance order (PROPOSAL; DESIGN-SYSTEM.md "Accent
 * tints and motion"): a Contacts Section's display index (Personal 0 …
 * Addresses 4), 0 for any other landmark (Insurance, the `/account` ones).
 * Feeds `--stagger`, 70 ms per step.
 */
export function sectionStagger(id: string): number {
  const index = (PROFILE_SECTION_IDS as readonly string[]).indexOf(id)
  return index < 0 ? 0 : index
}
