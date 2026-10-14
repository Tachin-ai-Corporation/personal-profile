"use client"

import useSWR from "swr"
import { fetchers, keys, type ApiResponseError, type Myself } from "@/lib/api"

export interface UseMyselfResult {
  readonly myself: Myself | undefined
  readonly error: ApiResponseError | undefined
  readonly isLoading: boolean
  /** Revalidates `["pp","myself"]` only. */
  readonly retry: () => void
}

/** The Launching user, from the shared SWR cache (`["pp","myself"]`). */
export function useMyself(): UseMyselfResult {
  const { data, error, isLoading, mutate } = useSWR<Myself | undefined, ApiResponseError>(keys.myself(), fetchers.myself)
  return { myself: data, error, isLoading, retry: () => void mutate() }
}
