import "server-only"

import type { AllowlistEntry } from "../types"

/** A page number: 0 to 9999, no leading zero (the client sends `page=0`). */
const PAGE = /^(?:0|[1-9]\d{0,3})$/

/** A page size: 1 to 100, no leading zero (`size=0` makes the backend's `PageRequest` throw; the client sends `size=100`). */
const SIZE = /^(?:[1-9]\d?|100)$/

/** Addresses (Epic 4) entries; each lands with the story that calls it. */
export const entries: readonly AllowlistEntry[] = [
  /**
   * The caller's own addresses (Story 4.1), a Spring Page sorted newest
   * updated first. Only `page` (0–9999) and `size` (1–100), each once, without leading zeros; any
   * other or repeated param is 400 `BAD_QUERY`. No body.
   */
  { method: "GET", template: "v2/person/location/list", query: { page: { pattern: PAGE }, size: { pattern: SIZE } } },
]
