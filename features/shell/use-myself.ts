"use client"

import useSWR from "swr"
import { ApiError, fetcher, keys, type Myself } from "@/lib/api"

/**
 * Retry only transient failures. A 4xx (SESSION_CHANGED, SESSION_EXPIRED,
 * CSRF, …) or a client-side BAD_PATH / UNKNOWN_KEY is terminal.
 */
export function shouldRetryMyself(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true
  const status = err.statusCode
  if (status !== undefined) return status < 400 || status >= 500
  return err.errorCode !== "BAD_PATH" && err.errorCode !== "UNKNOWN_KEY"
}

/** The signed-in user via SWR (key `["pp","myself"]`); duplicate mounts share one request. */
export function useMyself(): { data: Myself | undefined; error: ApiError | undefined; isLoading: boolean } {
  const { data, error, isLoading } = useSWR<Myself, ApiError>(keys.myself(), fetcher, {
    shouldRetryOnError: shouldRetryMyself,
  })
  return { data, error, isLoading }
}
