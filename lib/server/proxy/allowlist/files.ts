import "server-only"

import type { AllowlistEntry } from "../types"

/**
 * File and picture image entries (AD-13), all `asImage`: `preview=true` is
 * forced server-side and only PNG/JPEG/BMP leading bytes are served `inline`.
 *
 * - `GET v2/file/{fileId}/download`: the numeric id, no client query
 *   (`fromSKid` is never needed here), so `?x=1` is 400 `BAD_QUERY`.
 * - `GET v2/user/profile-picture/preview` (spec F7-2 review, for Story 1.9,
 *   so the story edits no foundation file): the logged user's own picture
 *   (agents.md: no parameters upstream). Only `v` (`^\d{1,19}$`: the picture's
 *   file id as a cache-buster, `<img src="…/preview?v={fileId}">`) is
 *   accepted; any other param is 400.
 *
 * There is no delete entry: the backend's `DELETE v2/file/{id}` checks only
 * the tenant, so `deny-list.ts` denies it and deletes go through the named op
 * `DELETE /api/pp/file/{fileId}`, which proves ownership first.
 */
export const entries: readonly AllowlistEntry[] = [
  { method: "GET", template: "v2/file/{fileId}/download", asImage: true },
  { method: "GET", template: "v2/user/profile-picture/preview", asImage: true, query: { v: { pattern: /^\d{1,19}$/ } } },
]
