import "server-only"

import type { AllowlistEntry } from "../types"
import { IMAGE_UPLOAD_MAX_BYTES } from "./core"

/** The two card relations (`InsuranceConstants`): a card file's `fileRelKey`, and its upload relation. */
const CARD_RELATIONS = ["InsuranceHasFrontSideCardFile", "InsuranceHasBackSideCardFile"] as const

/** Insurance card image upload (Story 5.3): private, one `file` part, PNG/JPEG bytes, 4 MB, no client query. */
const cardUpload = (relation: string): AllowlistEntry => ({
  method: "POST",
  template: `v2/health/type/Insurance/{insuranceId}/relation/${relation}/file/upload`,
  fixedQuery: { isPublic: "false" },
  upload: { part: "file", types: ["png", "jpeg"] },
  maxBytes: IMAGE_UPLOAD_MAX_BYTES,
})

/** Insurance (Epic 5) entries; each lands with the story that calls it (card uploads: F2 for Story 5.3). */
export const entries: readonly AllowlistEntry[] = [
  ...CARD_RELATIONS.map(cardUpload),
  /** Insurance value lists (Story 5.2: type, precedence, relationship), read by the shared `type-key` loader (spec F6-3). */
  { method: "GET", template: "v2/type/key/Insurance" },
  /**
   * The caller's policies (Story 5.1, `keys.insurance()`): a Spring Page of
   * `ResponseInsuranceDTO`. The client always asks for one page of 100, so
   * the query is exactly `page=0&size=100` (both required); anything else is
   * 400 `BAD_QUERY`.
   */
  {
    method: "GET",
    template: "v2/health/patient/insurance",
    query: { page: { pattern: /^0$/, required: true }, size: { pattern: /^100$/, required: true } },
  },
  /**
   * A card image of one of the caller's policies (Story 5.1 thumbnails and
   * viewer, AD-13): numeric policy and file ids, `fileRelKey` (required) one
   * of the two card relations and nothing else. `asImage`: `preview=true` is
   * forced (the backend ignores it) and only PNG/JPEG/BMP leading bytes are
   * served `inline`.
   */
  {
    method: "GET",
    template: "v2/health/insurance/{insuranceId}/file/{fileId}/download",
    asImage: true,
    query: { fileRelKey: { pattern: new RegExp(`^(${CARD_RELATIONS.join("|")})$`), required: true } },
  },
]
