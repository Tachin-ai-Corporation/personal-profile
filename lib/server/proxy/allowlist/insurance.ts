import "server-only"

import type { AllowlistEntry } from "../types"
import { IMAGE_UPLOAD_MAX_BYTES } from "./core"

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
  cardUpload("InsuranceHasFrontSideCardFile"),
  cardUpload("InsuranceHasBackSideCardFile"),
  /** Insurance value lists (Story 5.2: type, precedence, relationship), read by the shared `type-key` loader (spec F6-3). */
  { method: "GET", template: "v2/type/key/Insurance" },
]
