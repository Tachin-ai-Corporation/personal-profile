/**
 * The shared SWR fetcher (AD-10). SWR needs a rejected promise to surface an
 * error, so a failed `ApiResponse` is thrown as `ApiResponseError` (carrying
 * the response, `errorCode` included). Session events were already published
 * by `callApi`; nothing here publishes them again (AD-19).
 */

import { fetchContactPoints, isContactPointType, type ContactPointType } from "./contact-points"
import { isSwrKey, type SwrKey } from "./keys"
import type { ApiResponse } from "./types"
import { fetchMyself } from "./user"

export class ApiResponseError extends Error {
  constructor(readonly response: ApiResponse<unknown>) {
    super(response.error ?? "Request failed")
    this.name = "ApiResponseError"
  }
}

/** Resolves a successful response to its data, or rejects with `ApiResponseError`. */
export async function unwrap<T>(pending: Promise<ApiResponse<T>>): Promise<T | undefined> {
  const response = await pending
  if (!response.success) throw new ApiResponseError(response)
  return response.data
}

/** Typed fetchers, one per key family. Hooks use these directly. */
export const fetchers = {
  myself: () => unwrap(fetchMyself()),
  contactPoints: (type: ContactPointType) => unwrap(fetchContactPoints(type)),
} as const

function contactPointsByKey(key: SwrKey): Promise<unknown> {
  const type = key[2]
  if (!isContactPointType(type)) return Promise.reject(new ApiResponseError({ success: false, error: `Unknown contact type ${String(type)}` }))
  return fetchers.contactPoints(type)
}

const byResource: ReadonlyMap<string, (key: SwrKey) => Promise<unknown>> = new Map<string, (key: SwrKey) => Promise<unknown>>([
  ["myself", fetchers.myself],
  ["contact-points", contactPointsByKey],
])

/** The root `SWRConfig` fetcher: dispatches on the key's resource. */
export async function swrFetcher(key: unknown): Promise<unknown> {
  if (!isSwrKey(key)) throw new ApiResponseError({ success: false, error: "Unknown SWR key" })
  const load = byResource.get(key[1])
  if (!load) throw new ApiResponseError({ success: false, error: `No fetcher for ${key[1]}` })
  return load(key)
}
