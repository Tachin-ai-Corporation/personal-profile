/**
 * File downloads through the proxy's `asImage` entry
 * (`lib/server/proxy/allowlist/files.ts`, AD-13): used directly as an
 * `<img src>` (no blob conversion, no token in the browser). The proxy forces
 * `preview=true` and accepts no client query.
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
