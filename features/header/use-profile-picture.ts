"use client"

import useSWR from "swr"
import { keys, profilePicturePreviewPath, type ApiResponseError } from "@/lib/api"
import type { ProfilePictureIdBody } from "@/lib/shared/bff-contract"

/**
 * The header avatar's image URL (Story 1.9): the preview path with the
 * current picture's file id as the cache-buster, read through the shared
 * `keys.profilePictureId()` (loader in `lib/api/profile-picture.ts`, so Story
 * 1.10 refreshes it with `mutate`). `null` while the id loads, when the first
 * read failed or when there is no picture: the header then shows the initials
 * and never an error. A failed refresh keeps the last known picture (SWR keeps
 * the last `data`).
 */
export function useProfilePictureSrc(): string | null {
  const { data } = useSWR<ProfilePictureIdBody | undefined, ApiResponseError>(keys.profilePictureId())
  return profilePicturePreviewPath(data?.fileId)
}
