/**
 * The shared SWR fetcher (AD-10). Each `lib/api/<resource>.ts` registers the
 * loader of its own key family with `registerFetcher`, so adding a resource
 * never edits this file. SWR needs a rejected promise to surface an error, so
 * a failed `ApiResponse` is thrown as `ApiResponseError` (carrying the
 * response, `errorCode` included). Session events were already published by
 * `callApi`; nothing here publishes them again (AD-19).
 */

import { isLocalDev } from "@/lib/shared/app-env"
import { isSwrKey, type SwrKey, type SwrResource } from "./keys"
import type { ApiResponse } from "./types"

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

/** Loads the data of one key of a family. */
export type SwrLoader = (key: SwrKey) => Promise<unknown>

const registry = new Map<string, SwrLoader>()

/**
 * Registers the loader of a key family; its module calls this once, at load.
 * A second, different loader for the same family throws (two modules
 * claiming one family), except under `next dev`, where Fast Refresh
 * re-evaluates the module with a new loader.
 */
export function registerFetcher(resource: SwrResource, load: SwrLoader): void {
  const existing = registry.get(resource)
  if (existing && existing !== load && !isLocalDev()) throw new Error(`A fetcher is already registered for ${resource}`)
  registry.set(resource, load)
}

/** Test hook: forgets a family's loader (so a test's registration doesn't leak). */
export function unregisterFetcher(resource: SwrResource): void {
  registry.delete(resource)
}

/** The root `SWRConfig` fetcher: dispatches on the key's resource. */
export async function swrFetcher(key: unknown): Promise<unknown> {
  if (!isSwrKey(key)) throw new ApiResponseError({ success: false, error: "Unknown SWR key" })
  const load = registry.get(key[1])
  if (!load) throw new ApiResponseError({ success: false, error: `No fetcher for ${key[1]}` })
  return load(key)
}
