/**
 * The header's Profile Picture (Team A, Stories 1.9 and 1.10). Pre-created by
 * spec F6-3 (re-exported from `lib/api/index.ts` with `export *`).
 *
 * Endpoints this module owns:
 * - `GET /api/pp/profile-picture-id` (named op, built in F2) under
 *   `keys.profilePictureId()`; Story 1.9 registered the loader here with
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

import { BFF_PATHS, type ProfilePictureIdBody } from "@/lib/shared/bff-contract"
import { callApi } from "./client"
import { proxyPath } from "./config"
import { registerFetcher, unwrap } from "./fetcher"
import { isFileId } from "./files"
import type { ApiResponse } from "./types"

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

/**
 * The named op's body, checked: `{ fileId }` with a positive safe integer or
 * `null` (no picture). Anything else (a missing `fileId`, `0`, a negative, a
 * float, a digit string, a non-object) is `null`: an unexpected shape.
 * `isFileId` accepts digit strings, so the number is checked here instead.
 */
export function toProfilePictureId(raw: unknown): ProfilePictureIdBody | null {
  if (typeof raw !== "object" || raw === null || !("fileId" in raw)) return null
  const { fileId } = raw as { readonly fileId: unknown }
  if (fileId === null) return { fileId: null }
  return typeof fileId === "number" && Number.isSafeInteger(fileId) && fileId > 0 ? { fileId } : null
}

/** `GET /api/pp/profile-picture-id` through `callApi`, mapped; a malformed body is a failure. */
export async function fetchProfilePictureId(): Promise<ApiResponse<ProfilePictureIdBody>> {
  const res = await callApi<unknown>("profile-picture/fetchProfilePictureId", profilePictureIdPath())
  if (!res.success) return { ...res, data: undefined }
  const body = toProfilePictureId(res.data)
  return body
    ? { success: true, data: body, statusCode: res.statusCode }
    : { success: false, statusCode: res.statusCode, error: "profile-picture/fetchProfilePictureId returned an unexpected shape" }
}

/**
 * The SWR loader of `keys.profilePictureId()` (Story 1.9). The header reads
 * the key; Story 1.10 mutates it after an upload so the avatar reloads.
 */
export function loadProfilePictureId(): Promise<ProfilePictureIdBody | undefined> {
  return unwrap(fetchProfilePictureId())
}

registerFetcher("profile-picture-id", loadProfilePictureId)
