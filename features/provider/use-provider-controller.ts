"use client"

import { useState, useSyncExternalStore } from "react"
import useSWR from "swr"
import { keys, mapFetchError, sessionEvents, type MappedError, type UserNpi } from "@/lib/api"
import type { FrameState } from "@/features/shell"

const subscribeToExpiry = (listener: () => void) => sessionEvents.subscribe("session-expired", listener)
const expirySnapshot = () => sessionEvents.hasPublished("session-expired")
const serverExpirySnapshot = () => false

/** Only registration state enters SWR. Search state belongs to the mounted controls. */
export function useProviderController() {
  const read = useSWR<UserNpi>(keys.npi())
  const expired = useSyncExternalStore(subscribeToExpiry, expirySnapshot, serverExpirySnapshot)
  const [forbidden, setForbidden] = useState(false)
  const [failure, setFailure] = useState({ error: read.error, attempt: 0 })
  if (read.error && read.error !== failure.error) setFailure({ error: read.error, attempt: failure.attempt + 1 })
  const error = read.error ? mapFetchError("provider", read.error) : null
  const state: FrameState = expired ? { error: { kind: "session" } }
    : forbidden ? { error: { kind: "forbidden" } }
    : error ? { error }
    : read.isLoading || !read.data ? "loading" : "ready"
  const onSearchFailure = (mapped: MappedError): void => {
    if (mapped.kind === "forbidden") setForbidden(true)
  }
  return { state, data: read.data, attempt: failure.attempt, retry: () => { void read.mutate() }, onSearchFailure }
}
