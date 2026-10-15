/**
 * File paths (`lib/server/proxy/allowlist/files.ts`, AD-13). Downloads go
 * through the proxy's `asImage` entry, used directly as an `<img src>` (no
 * blob conversion, no token in the browser; the proxy forces `preview=true`
 * and accepts no client query). Deletes go through the hard-delete entry
 * (spec F7-2).
 */

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
 * `DELETE /api/1h/v2/file/{fileId}` (spec F7-2, for Stories 1.10, 2.4, 5.3):
 * no query; the proxy forces `hardDelete=true`, so the client never sends
 * `hardDelete`. `null` for anything that isn't a file id. Take the id only
 * from the app's own data (`profile-picture-id`, `myself.signature`, a saved
 * policy), never from user input or the URL.
 */
export function fileDeletePath(fileId: number | string): string | null {
  return isFileId(fileId) ? proxyPath(`v2/file/${fileId}`) : null
}
