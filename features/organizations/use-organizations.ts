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
  const [isComposing, setIsComposing] = useState(false)
  const [query, setQuery] = useState({ name: "", page: 0 })
  const [openingComplete, setOpeningComplete] = useState(false)
  const [recoveryQuery, setRecoveryQuery] = useState<typeof query | null>(null)
  const [pageFocus, setPageFocus] = useState<typeof query | null>(null)
  const [showControls, setShowControls] = useState(false)
  const opened = useRef(false)
  const { data, error, mutate } = useSWR<OrganizationPortalPage>(expired ? null : keys.orgs(query.name, query.page), {
    revalidateOnMount: false, keepPreviousData: false,
    onSuccess: (page) => {
      // Only this active key's successful response can recover an emptied result set.
      if (query.page > 0 && page.totalElements === 0 && !expirySnapshot()) {
        setPageFocus(null)
        const firstPage = { name: query.name, page: 0 }
        setRecoveryQuery(firstPage)
        setQuery(firstPage)
      }
    },
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
    if (recoveryQuery !== query || expired || expirySnapshot()) return
    // Membership removal invalidates any recent page-zero cache. A no-argument
    // mutate forces this recovery read while normal key changes retain SWR deduplication.
    void mutate().then(() => {
      if (!expirySnapshot()) setRecoveryQuery((current) => current === query ? null : current)
    })
  }, [recoveryQuery, query, expired, mutate])

  useEffect(() => {
    if (expired || isComposing) return
    const name = text.trim()
    if (name === query.name) return
    const timer = setTimeout(() => {
      if (!expirySnapshot()) setQuery({ name, page: 0 })
    }, 500)
    return () => clearTimeout(timer)
  }, [text, query.name, expired, isComposing])

  const mapped = error ? mapFetchError("organizations", error) : null
  const state: FrameState = expired ? { error: { kind: "session" } }
    : !openingComplete || recoveryQuery === query ? "loading"
    : mapped ? { error: mapped }
    : !data ? "loading" : "ready"
  // SWR can reuse a recent key without running onSuccess again. Its current-key
  // data/error owns query readiness after the fresh opening read has completed.
  const initialEmpty = state === "ready" && query.page === 0 && query.name === "" && data?.items.length === 0
  if (state === "ready" && !initialEmpty && !showControls) setShowControls(true)

  const pendingSearch = isComposing || text.trim() !== query.name
  const updateText = (value: string) => {
    const bounded = value.slice(0, 100)
    // Keep the UTF-16 transport bound without sending half of a surrogate pair.
    setText(/[\uD800-\uDBFF]$/.test(bounded) ? bounded.slice(0, -1) : bounded)
    setPageFocus(null)
  }

  return {
    state, data, query, text, initialEmpty, showControls, pendingSearch, attempt: failure.attempt,
    beginComposition: () => { setPageFocus(null); setIsComposing(true) },
    endComposition: (value: string) => { updateText(value); setIsComposing(false) },
    pageFocus: state === "ready" && pageFocus === query,
    clearPageFocus: () => setPageFocus(null),
    setText: updateText,
    setPage: (page: number) => {
      if (expired || expirySnapshot() || pendingSearch || page === query.page || !Number.isInteger(page) || page < 0 || page > 9999 || !data || page >= data.totalPages) return
      const next = { name: query.name, page }
      setPageFocus(next)
      setQuery(next)
    },
    retry: () => { if (!expired && !expirySnapshot()) void mutate() },
  }
}
