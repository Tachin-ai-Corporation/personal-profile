/**
 * The header's Profile Picture (Team A, Stories 1.9 and 1.10). Pre-created by
 * spec F6-3 (re-exported from `lib/api/index.ts` with `export *`).
 *
 * Endpoints this module will own:
 * - `GET /api/pp/profile-picture-id` (named op, built in F2) under
 *   `keys.profilePictureId()`; Story 1.9 registers the loader here with
 *   `registerFetcher("profile-picture-id", …)`;
 * - the picture image through `fileDownloadPath(fileId)` (`files.ts`) or the
 *   `v2/user/profile-picture/preview` entry Story 1.9 adds;
 * - the upload `POST v2/health/type/Person/{personId}/relation/PersonHasProfilePictureFile/file/upload`
 *   (entry exists in `allowlist/core.ts`) and `DELETE v2/file/{id}` (Story 1.10).
 */

import { BFF_PATHS } from "@/lib/shared/bff-contract"
import { proxyPath } from "./config"

/** `GET /api/pp/profile-picture-id` → `{ fileId: number | null }` (`ProfilePictureIdBody`). */
export function profilePictureIdPath(): string {
  return BFF_PATHS.profilePictureId
}

/** The multipart upload (one `file` part; `isPublic=true` is forced by the proxy). */
export function profilePictureUploadPath(): string {
  return proxyPath("v2/health/type/Person/me/relation/PersonHasProfilePictureFile/file/upload")
}
