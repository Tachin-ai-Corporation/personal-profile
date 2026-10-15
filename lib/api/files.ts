/**
 * File paths (`lib/server/proxy/allowlist/files.ts`, AD-13). Downloads go
 * through the proxy's `asImage` entry, used directly as an `<img src>` (no
 * blob conversion, no token in the browser; the proxy forces `preview=true`
 * and accepts no client query). Deletes go through the named op
 * `/api/pp/file/{fileId}` (spec F7-2 review), never the proxy.
 */

import { BFF_PATHS } from "@/lib/shared/bff-contract"
import { proxyPath } from "./config"

/** `true` for a positive integer file id (number or digit string). */
export function isFileId(value: unknown): value is number | string {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0
  return typeof value === "string" && /^[1-9]\d*$/.test(value)
}

/** `/api/1h/v2/file/{fileId}/download`, or `null` for anything that isn't a file id. */
export function fileDownloadPath(fileId: number | string): string | null {
  return isFileId(fileId) ? proxyPath(`v2/file/${fileId}/download`) : null
}

/**
 * `DELETE /api/pp/file/{fileId}` (spec F7-2, for Stories 1.10, 2.4, 5.3): the
 * named op that hard-deletes one of the caller's own files (the profile
 * picture, the Signature or an insurance card of their own policies),
 * checked on the server; anything else answers 404 `NO_FILE`. No query, no
 * body; `null` for anything that isn't a file id.
 */
export function fileDeletePath(fileId: number | string): string | null {
  return isFileId(fileId) ? `${BFF_PATHS.fileDeletePrefix}${fileId}` : null
}
