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
import { fileDeletePath, isFileId } from "./files"
import type { ApiResponse } from "./types"

/** `GET /api/pp/profile-picture-id` → `{ fileId: number | null }` (`ProfilePictureIdBody`). */
export function profilePictureIdPath(): string {
  return BFF_PATHS.profilePictureId
}

/** The multipart upload (one `file` part; `isPublic=true` is forced by the proxy). */
export function profilePictureUploadPath(): string {
  return proxyPath("v2/health/type/Person/me/relation/PersonHasProfilePictureFile/file/upload")
}

/** The longest upload file name the client builds (the proxy sanitizes it again). */
const PROFILE_PICTURE_NAME_MAX = 100

/**
 * The upload's `file` part name (Story 1.10, F2: no `?fileName=` query; the
 * proxy re-sanitizes it): the chosen file's base name without its extension,
 * every character outside `A-Z a-z 0-9 . _ -` as `_`, no leading `.` or `_`,
 * then `.jpg` (the picture is always re-encoded to JPEG, D-C). `picture.jpg`
 * when nothing usable is left.
 */
export function profilePictureUploadName(originalName: string): string {
  const base = originalName.slice(Math.max(originalName.lastIndexOf("/"), originalName.lastIndexOf("\\")) + 1)
  const stem = base
    .replace(/\.[^.]*$/, "")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/^[._]+/, "")
    .slice(0, PROFILE_PICTURE_NAME_MAX - ".jpg".length)
  return `${stem || "picture"}.jpg`
}

/**
 * `POST` the re-encoded picture (Story 1.10) as `multipart/form-data` with
 * exactly one part, `file`, named `profilePictureUploadName(originalName)`.
 * `callApi` sets no JSON `Content-Type` for a `FormData` body, so the browser
 * adds the multipart boundary. The body isn't used (the caller reads the new
 * id back), so a 2xx whose body isn't JSON is still a success.
 */
export async function uploadProfilePicture(blob: Blob, originalName: string): Promise<ApiResponse<unknown>> {
  const body = new FormData()
  body.append("file", blob, profilePictureUploadName(originalName))
  const res = await callApi<unknown>("profile-picture/uploadProfilePicture", profilePictureUploadPath(), { method: "POST", body })
  const ok2xx = res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300
  return !res.success && ok2xx ? { success: true, statusCode: res.statusCode } : res
}

/**
 * Deletes the replaced picture (Story 1.10): `DELETE /api/pp/file/{fileId}`,
 * the ownership-checked named op (`fileDeletePath`, F7-2). Best effort: the
 * caller ignores the outcome. A non-id sends nothing.
 */
export async function deleteProfilePictureFile(fileId: number): Promise<ApiResponse<unknown>> {
  const path = fileDeletePath(fileId)
  if (path === null) return { success: false, error: "profile-picture/deleteProfilePictureFile: not a file id" }
  return callApi<unknown>("profile-picture/deleteProfilePictureFile", path, { method: "DELETE" })
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
