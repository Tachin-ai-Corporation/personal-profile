"use client"

import { useSyncExternalStore } from "react"
import useSWR, { useSWRConfig, type Cache, type SWRConfiguration } from "swr"
import { fetchers, isTransientReadFailure, keys, type ApiResponseError, type Myself } from "@/lib/api"

export interface UseMyselfResult {
  readonly myself: Myself | undefined
  /** Set only once the automatic retries are over (never while one is pending). */
  readonly error: ApiResponseError | undefined
  /** No user yet: the first load, or an automatic retry of a failed one. */
  readonly isLoading: boolean
  /** Revalidates `["pp","myself"]` only. */
  readonly retry: () => void
}

/** At most this many automatic retries when the SWR config sets no `errorRetryCount`. */
export const MYSELF_RETRY_COUNT = 3

/**
 * Per SWR cache: is an automatic `myself` retry scheduled? While it is, the
 * hook reports loading instead of the error, so the manual Retry UI shows
 * only once the retries are exhausted (human decision 2026-10-14).
 */
const retryPending = new WeakMap<object, boolean>()
const listeners = new Set<() => void>()

function setRetryPending(cache: object, pending: boolean): void {
  if ((retryPending.get(cache) ?? false) === pending) return
  retryPending.set(cache, pending)
  for (const listener of listeners) listener()
}

/** The callbacks' config is SWR's full config at runtime; its public type omits the cache. */
function cacheOf(config: object): object {
  return (config as { readonly cache: Cache }).cache
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Exponential backoff with jitter, as SWR's own default: (0.5–1.5) × 2^n × interval. */
function backoffMs(retryCount: number, intervalMs: number): number {
  return Math.floor((Math.random() + 0.5) * (1 << Math.min(retryCount, 8))) * intervalMs
}

/**
 * The `myself` key's retry policy (main's `shouldRetryMyself`): only 5xx and
 * network failures (`isTransientReadFailure`), with backoff, at most
 * `errorRetryCount` times. Every other key keeps the root `SwrProvider`'s
 * `shouldRetryOnError: false`.
 */
const MYSELF_SWR_OPTIONS: SWRConfiguration<Myself | undefined, ApiResponseError> = {
  shouldRetryOnError: true,
  // SWR calls onError, then onErrorRetry (when the page is active), before it commits the error.
  onError: (_error, _key, config) => setRetryPending(cacheOf(config), false),
  onErrorRetry: (error, _key, config, revalidate, options) => {
    const maxRetries = config.errorRetryCount ?? MYSELF_RETRY_COUNT
    if (!isTransientReadFailure(error) || options.retryCount > maxRetries) return
    setRetryPending(cacheOf(config), true)
    setTimeout(() => void revalidate(options), backoffMs(options.retryCount, config.errorRetryInterval))
  },
  onSuccess: (_data, _key, config) => setRetryPending(cacheOf(config), false),
}

/** The Launching user, from the shared SWR cache (`["pp","myself"]`). */
export function useMyself(): UseMyselfResult {
  const { cache } = useSWRConfig()
  const { data, error, isLoading, mutate } = useSWR<Myself | undefined, ApiResponseError>(keys.myself(), fetchers.myself, MYSELF_SWR_OPTIONS)
  const pending = useSyncExternalStore(
    subscribe,
    () => retryPending.get(cache) ?? false,
    () => false,
  )
  return {
    myself: data,
    error: pending ? undefined : error,
    isLoading: isLoading || (pending && data === undefined),
    retry: () => void mutate(),
  }
}
