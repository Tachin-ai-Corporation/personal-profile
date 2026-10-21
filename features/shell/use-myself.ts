"use client"

import { useEffect, useMemo, useSyncExternalStore } from "react"
import useSWR, { useSWRConfig, type SWRConfiguration } from "swr"
import { fetchers, isTransientReadFailure, keys, type ApiResponseError, type Myself } from "@/lib/api"

export interface UseMyselfResult {
  readonly myself: Myself | undefined
  /** Set only once the automatic retries are over (never while one is pending). */
  readonly error: ApiResponseError | undefined
  /** No user yet: the first load, or an automatic retry of a failed one. */
  readonly isLoading: boolean
  /** Revalidates `["pp","myself"]` only (a fresh retry budget). */
  readonly retry: () => void
}

/** At most this many automatic retries when the SWR config sets no `errorRetryCount`. */
export const MYSELF_RETRY_COUNT = 3

/**
 * How long a retry may take once its backoff timer fired (the request itself).
 * After that a pending retry is treated as over, so a retry that never reports
 * back (its hook unmounted, a deduped request whose starter unmounted) can
 * never hide the error for good.
 */
export const MYSELF_RETRY_REQUEST_MS = 30_000

/**
 * Per SWR cache: until when an automatic `myself` retry is pending (epoch ms),
 * and how many backoff timers are live. While a retry is pending the hook
 * reports loading instead of the error, so the manual Retry UI shows only
 * once the retries are exhausted (human decision 2026-10-14).
 */
const pendingUntil = new WeakMap<object, number>()
const liveTimers = new WeakMap<object, number>()
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

function isPending(cache: object, now: number = Date.now()): boolean {
  return (pendingUntil.get(cache) ?? 0) > now
}

function setPendingUntil(cache: object, deadline: number): void {
  if (pendingUntil.get(cache) === deadline) return
  pendingUntil.set(cache, deadline)
  notify()
  // Re-render once the deadline passes, so an expired retry stops hiding the error.
  if (deadline > Date.now()) setTimeout(notify, deadline - Date.now() + 1)
}

function clearPending(cache: object): void {
  if (!pendingUntil.has(cache)) return
  pendingUntil.delete(cache)
  notify()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Exponential backoff with jitter, as SWR's own default: floor((0.5–1.5) × 2^n) × interval. */
function backoffMs(retryCount: number, intervalMs: number): number {
  return Math.floor((Math.random() + 0.5) * (1 << Math.min(retryCount, 8))) * intervalMs
}

/**
 * The `myself` key's retry policy (main's `shouldRetryMyself`): only 5xx and
 * network failures (`isTransientReadFailure`), with backoff, at most
 * `errorRetryCount` times. SWR skips `onErrorRetry` on a hidden or offline
 * page. Every other key keeps the root `SwrProvider`'s `shouldRetryOnError: false`.
 */
function myselfOptions(cache: object): SWRConfiguration<Myself | undefined, ApiResponseError> {
  return {
    shouldRetryOnError: true,
    // SWR calls onError, then onErrorRetry (page active only), before it commits the error.
    onError: () => clearPending(cache),
    onErrorRetry: (error, _key, config, revalidate, options) => {
      const maxRetries = config.errorRetryCount ?? MYSELF_RETRY_COUNT
      if (!isTransientReadFailure(error) || options.retryCount > maxRetries) return
      const wait = backoffMs(options.retryCount, config.errorRetryInterval)
      setPendingUntil(cache, Date.now() + wait + MYSELF_RETRY_REQUEST_MS)
      liveTimers.set(cache, (liveTimers.get(cache) ?? 0) + 1)
      setTimeout(() => {
        liveTimers.set(cache, (liveTimers.get(cache) ?? 1) - 1)
        void revalidate(options)
      }, wait)
    },
    onSuccess: () => clearPending(cache),
    onDiscarded: () => clearPending(cache),
  }
}

/** The Launching user, from the shared SWR cache (`["pp","myself"]`). */
export function useMyself(): UseMyselfResult {
  const { cache } = useSWRConfig()
  const options = useMemo(() => myselfOptions(cache), [cache])
  const { data, error, isLoading, isValidating, mutate } = useSWR<Myself | undefined, ApiResponseError>(keys.myself(), fetchers.myself, options)
  const pending = useSyncExternalStore(
    subscribe,
    () => isPending(cache),
    () => false,
  )
  // A retry whose timer already fired while no hook was mounted never reports
  // back: on mount, with no live timer and no request running, it is over.
  useEffect(() => {
    if ((liveTimers.get(cache) ?? 0) === 0 && !isValidating) clearPending(cache)
  }, [cache, isValidating])
  return {
    myself: data,
    error: pending ? undefined : error,
    isLoading: isLoading || (pending && data === undefined),
    retry: () => void mutate(),
  }
}
