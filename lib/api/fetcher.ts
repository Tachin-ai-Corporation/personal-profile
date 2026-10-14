/**
 * =============================================================================
 * Shared SWR fetcher (AD-10, AD-19)
 * =============================================================================
 *
 * Given a key from `lib/api/keys.ts`, runs the matching `lib/api` function. A
 * failed `ApiResponse` is thrown as an `ApiError` so SWR surfaces it through
 * `error` / `onError`. The fetcher NEVER publishes session events — `callApi`
 * already did, once.
 * =============================================================================
 */

import { ApiError, type ApiResponse } from "./client"
import type { SwrKey } from "./keys"
import { fetchMyself } from "./user"

type Resolver = (key: readonly unknown[]) => Promise<ApiResponse<unknown>>

const resolvers: Record<string, Resolver> = {
  myself: () => fetchMyself(),
}

export async function fetcher<T = unknown>(key: SwrKey | readonly unknown[]): Promise<T> {
  const resource = Array.isArray(key) && key[0] === "pp" ? key[1] : undefined
  const resolve = typeof resource === "string" && Object.hasOwn(resolvers, resource) ? resolvers[resource] : undefined
  if (!resolve) {
    throw new ApiError({ success: false, error: "Unknown SWR key", errorCode: "UNKNOWN_KEY" })
  }
  const res = await resolve(key)
  if (!res.success) throw new ApiError(res)
  return res.data as T
}
