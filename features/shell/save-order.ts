import type { SectionId } from "./nav-types"

/**
 * Save all's constant order on `/` (AD-8, Story 1.14): Personal information,
 * then Email (its auto-verify runs before Phone, Story 3.6), Phone, Social
 * media, Addresses, regardless of `displayOrder`. `app/page.tsx` passes it to
 * `PageFrame saveOrder` (leave guard Save) and Team A's Save all bar uses it
 * too. `/account` has no Save all and no order (AD-8).
 */
export const SAVE_ORDER = ["personal", "email", "phone", "social", "addresses"] as const satisfies readonly SectionId[]
