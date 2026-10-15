import "server-only"

import type { AllowlistEntry } from "../types"

/** AD-13 upload cap for images re-encoded on the client (Story 1.10). */
export const IMAGE_UPLOAD_MAX_BYTES = 4 * 1024 * 1024

/**
 * Shell entries used by every page: the Launching user (Stories 1.4, 1.9) and
 * the header's Profile Picture upload (Story 1.10: `isPublic=true` forced,
 * one `file` part, PNG/JPEG/BMP bytes, 4 MB). No client query: the file name
 * is the server-sanitized multipart name (`upload.ts#sanitizeFileName`).
 */
export const entries: readonly AllowlistEntry[] = [
  { method: "GET", template: "v2/user/myself" },
  {
    method: "POST",
    template: "v2/health/type/Person/{personId}/relation/PersonHasProfilePictureFile/file/upload",
    fixedQuery: { isPublic: "true" },
    upload: { part: "file", types: ["png", "jpeg", "bmp"] },
    maxBytes: IMAGE_UPLOAD_MAX_BYTES,
  },
]
