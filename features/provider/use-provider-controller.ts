"use client"

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import useSWR, { useSWRConfig } from "swr"
import { keys, mapFetchError, sessionEvents, type MappedError, type UserNpi } from "@/lib/api"
import type { FrameState } from "@/features/shell"

const subscribeToExpiry = (listener: () => void) => sessionEvents.subscribe("session-expired", listener)
const expirySnapshot = () => sessionEvents.hasPublished("session-expired")
const serverExpirySnapshot = () => false
// One non-sensitive completion fact per cache/page lifetime (D5: no session switch).
// A tab remount must not turn an acknowledged write back into another command.
const completedCaches = new WeakMap<object, { focusPending: boolean }>()

/** Only registration state enters SWR. Search state belongs to the mounted controls. */
export function useProviderController() {
  const { cache } = useSWRConfig()
  const expired = useSyncExternalStore(subscribeToExpiry, expirySnapshot, serverExpirySnapshot)
  const { mutate, ...read } = useSWR<UserNpi>(expired ? null : keys.npi(), { revalidateOnMount: false })
  const mounted = useRef(false)
  const running = useRef<Promise<void> | null>(null)
  const [refresh, setRefresh] = useState<{ status: "loading" | "settled" | "exception"; attempt: number }>({ status: "loading", attempt: 0 })
  const [acknowledged, setAcknowledged] = useState(() => completedCaches.has(cache))
  // Stable for the opening effect; a key-only mutate leaves server state in SWR.
  const refreshRegistration = useCallback((): Promise<void> => {
    if (!mounted.current || expirySnapshot()) return Promise.resolve()
    if (running.current) return running.current
    setRefresh((previous) => ({ ...previous, status: "loading" }))
    const request = Promise.resolve().then(() => {
      if (mounted.current && !expirySnapshot()) return mutate()
    }).then(() => {
      if (mounted.current && !expirySnapshot()) setRefresh((previous) => ({ status: "settled", attempt: previous.attempt + 1 }))
    }, () => {
      if (mounted.current && !expirySnapshot()) setRefresh((previous) => ({ status: "exception", attempt: previous.attempt + 1 }))
    }).finally(() => { running.current = null })
    running.current = request
    return request
  }, [mutate])
  useEffect(() => {
    mounted.current = true
    void refreshRegistration()
    const resume = (event: PageTransitionEvent): void => {
      // A pre-navigation read may contain an obsolete snapshot. Reconcile after
      // it settles; simultaneous restoration events share the next fresh read.
      if (event.persisted) void (running.current ?? Promise.resolve()).then(refreshRegistration)
    }
    window.addEventListener("pageshow", resume)
    return () => { mounted.current = false; window.removeEventListener("pageshow", resume) }
  }, [refreshRegistration])
  const [forbidden, setForbidden] = useState(false)
  const [failure, setFailure] = useState({ error: read.error, attempt: 0 })
  if (read.error && read.error !== failure.error) setFailure({ error: read.error, attempt: failure.attempt + 1 })
  const error = read.error ? mapFetchError("provider", read.error) : null
  const state: FrameState = expired ? { error: { kind: "session" } }
    : forbidden ? { error: { kind: "forbidden" } }
    : refresh.status === "loading" ? "loading"
    : error ? { error }
    : refresh.status === "exception" || (acknowledged && !read.data?.provider) ? { error: { kind: "generic" } }
    : read.isLoading || !read.data ? "loading" : "ready"
  const onSearchFailure = (mapped: MappedError): void => {
    if (mapped.kind === "forbidden") setForbidden(true)
  }
  const onRegistered = async (): Promise<void> => {
    if (!mounted.current || expirySnapshot()) return
    // Acknowledgement is monotonic: failed/stale reads cannot offer another POST.
    completedCaches.set(cache, { focusPending: true })
    setAcknowledged(true)
    await refreshRegistration()
  }
  const claimRegistrationFocus = useCallback((): boolean => {
    const completion = completedCaches.get(cache)
    if (!completion?.focusPending) return false
    completion.focusPending = false
    return true
  }, [cache])
  return { state, data: read.data, acknowledged, claimRegistrationFocus, attempt: failure.attempt + refresh.attempt, retry: () => { void refreshRegistration() }, onSearchFailure, onRegistered }
}
