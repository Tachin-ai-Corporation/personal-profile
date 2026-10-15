/**
 * The header's Profile Picture (Team A, Stories 1.9 and 1.10). Pre-created by
 * spec F6-3 (re-exported from `lib/api/index.ts` with `export *`).
 *
 * Endpoints this module will own:
 * - `GET /api/pp/profile-picture-id` (named op, built in F2) under
 *   `keys.profilePictureId()`; Story 1.9 registers the loader here with
 *   `registerFetcher("profile-picture-id", …)`;
 * - the picture image `GET v2/user/profile-picture/preview?v={fileId}`
 *   (`asImage` entry in `allowlist/files.ts`, pre-added by spec F7-2 review):
 *   `profilePicturePreviewPath(fileId)` as the avatar's `<img src>`;
 * - the upload `POST v2/health/type/Person/{personId}/relation/PersonHasProfilePictureFile/file/upload`
 *   (entry exists in `allowlist/core.ts`);
 * - the old picture's delete after a replace (Story 1.10):
 *   `fileDeletePath(oldId)` (`files.ts`), the ownership-checked named op
 *   `DELETE /api/pp/file/{fileId}` (spec F7-2 review).
 */

import { BFF_PATHS } from "@/lib/shared/bff-contract"
import { proxyPath } from "./config"
import { isFileId } from "./files"

/** `GET /api/pp/profile-picture-id` → `{ fileId: number | null }` (`ProfilePictureIdBody`). */
export function profilePictureIdPath(): string {
  return BFF_PATHS.profilePictureId
}

/** The multipart upload (one `file` part; `isPublic=true` is forced by the proxy). */
export function profilePictureUploadPath(): string {
  return proxyPath("v2/health/type/Person/me/relation/PersonHasProfilePictureFile/file/upload")
}

/**
 * The avatar image: `/api/1h/v2/user/profile-picture/preview?v={fileId}` (the
 * current picture's file id busts the browser cache after a change), or
 * `null` for anything that isn't a file id (show the initials).
 */
export function profilePicturePreviewPath(fileId: number | string | null | undefined): string | null {
  return isFileId(fileId) ? proxyPath(`v2/user/profile-picture/preview?v=${fileId}`) : null
}
