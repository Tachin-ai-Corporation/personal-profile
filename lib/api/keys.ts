/**
 * Every SWR key in the app is built here (AD-10): `["pp", resource, ...params]`.
 * Inline array keys passed to `useSWR`/`mutate` are a lint error elsewhere.
 */

import type { ContactPointType } from "./contact-points"

export type SwrKey = readonly ["pp", string, ...(string | number)[]]

export const keys = {
  myself: (): readonly ["pp", "myself"] => ["pp", "myself"],
  /** One key per Contact Type, shared by the header, Contacts and `/account` (Story 1.9). */
  contactPoints: <T extends ContactPointType>(type: T): readonly ["pp", "contact-points", T] => ["pp", "contact-points", type],
} as const satisfies Record<string, (...args: never[]) => SwrKey>

export function isSwrKey(value: unknown): value is SwrKey {
  return Array.isArray(value) && value[0] === "pp" && typeof value[1] === "string"
}
