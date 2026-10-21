"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import useSWR from "swr"
import { keys, mapFetchError, sessionEvents, type OrganizationPortalPage } from "@/lib/api"
import type { FrameState } from "@/features/shell"

const subscribeToExpiry = (listener: () => void) => sessionEvents.subscribe("session-expired", listener)
const expirySnapshot = () => sessionEvents.hasPublished("session-expired")
const serverExpirySnapshot = () => false

/** Query and page change together, so a search never requests the old page. */
export function useOrganizations() {
  const expired = useSyncExternalStore(subscribeToExpiry, expirySnapshot, serverExpirySnapshot)
  const [text, setText] = useState("")
  const [query, setQuery] = useState({ name: "", page: 0 })
  const [openingComplete, setOpeningComplete] = useState(false)
  const [pageFocus, setPageFocus] = useState<typeof query | null>(null)
  const [showControls, setShowControls] = useState(false)
  const opened = useRef(false)
  const { data, error, mutate } = useSWR<OrganizationPortalPage>(expired ? null : keys.orgs(query.name, query.page), {
    revalidateOnMount: false, keepPreviousData: false,
  })
  const [failure, setFailure] = useState({ error, attempt: 0 })
  if (error && error !== failure.error) setFailure({ error, attempt: failure.attempt + 1 })

  useEffect(() => {
    if (expired || expirySnapshot() || opened.current) return
    opened.current = true
    // Mount is explicit to hide cached results until a fresh tab-opening read settles.
    // SWR itself revalidates subsequent key changes; doing both would request twice.
    // SWR 2.5.1 internalMutate/startRevalidate delegates to revalidate, which catches
    // loader failures and stores them as error (dist/use-swr-emll9s78.mjs:435–473).
    void mutate().then(() => {
      if (!expirySnapshot()) setOpeningComplete(true)
    })
  }, [expired, mutate])

  useEffect(() => {
    if (expired) return
    const name = text.trim()
    if (name === query.name) return
    const timer = setTimeout(() => {
      if (!expirySnapshot()) setQuery({ name, page: 0 })
    }, 500)
    return () => clearTimeout(timer)
  }, [text, query.name, expired])

  const mapped = error ? mapFetchError("organizations", error) : null
  const state: FrameState = expired ? { error: { kind: "session" } }
    : !openingComplete ? "loading"
    : mapped ? { error: mapped }
    : !data ? "loading" : "ready"
  // SWR can reuse a recent key without running onSuccess again. Its current-key
  // data/error owns query readiness after the fresh opening read has completed.
  const initialEmpty = state === "ready" && query.page === 0 && query.name === "" && data?.items.length === 0
  if (state === "ready" && !initialEmpty && !showControls) setShowControls(true)

  return {
    state, data, query, text, initialEmpty, showControls, attempt: failure.attempt,
    pageFocus: state === "ready" && pageFocus === query,
    clearPageFocus: () => setPageFocus(null),
    setText: (value: string) => { setPageFocus(null); setText(value.slice(0, 100)) },
    setPage: (page: number) => {
      if (expired || expirySnapshot() || text.trim() !== query.name || page === query.page || !Number.isInteger(page) || page < 0 || page > 9999 || !data || page >= data.totalPages) return
      const next = { name: query.name, page }
      setPageFocus(next)
      setQuery(next)
    },
    retry: () => { if (!expired && !expirySnapshot()) void mutate() },
  }
}
