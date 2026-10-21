"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import useSWR from "swr"
import { keys, mapFetchError, sessionEvents, type MappedError, type UserNpi } from "@/lib/api"
import type { FrameState } from "@/features/shell"

const subscribeToExpiry = (listener: () => void) => sessionEvents.subscribe("session-expired", listener)
const expirySnapshot = () => sessionEvents.hasPublished("session-expired")
const serverExpirySnapshot = () => false

/** Only registration state enters SWR. Search state belongs to the mounted controls. */
export function useProviderController() {
  const expired = useSyncExternalStore(subscribeToExpiry, expirySnapshot, serverExpirySnapshot)
  const { mutate, ...read } = useSWR<UserNpi>(expired ? null : keys.npi(), { revalidateOnMount: false })
  const [opened, setOpened] = useState(false)
  useEffect(() => {
    if (expired || expirySnapshot()) return
    let active = true
    // A key-only mutate forces a fresh opening read; SWR owns its data and error.
    void mutate().then(() => { if (active) setOpened(true) })
    return () => { active = false }
  }, [expired, mutate])
  const [forbidden, setForbidden] = useState(false)
  const [failure, setFailure] = useState({ error: read.error, attempt: 0 })
  if (read.error && read.error !== failure.error) setFailure({ error: read.error, attempt: failure.attempt + 1 })
  const error = read.error ? mapFetchError("provider", read.error) : null
  const state: FrameState = expired ? { error: { kind: "session" } }
    : forbidden ? { error: { kind: "forbidden" } }
    : !opened ? "loading"
    : error ? { error }
    : read.isLoading || !read.data ? "loading" : "ready"
  const onSearchFailure = (mapped: MappedError): void => {
    if (mapped.kind === "forbidden") setForbidden(true)
  }
  return { state, data: read.data, attempt: failure.attempt, retry: () => { void mutate() }, onSearchFailure }
}
