"use client"

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react"
import type { ProfileSectionId } from "./anchors"

/**
 * The Section menu's entry counts (EXPERIENCE.md: "Counts reflect saved
 * entries"; F3-3). A Section reports its saved-entry count with
 * `useReportSectionCount`; the menu reads them. Optional: a Section that
 * reports nothing (Personal information) shows a blank count.
 */

export type SectionCounts = Readonly<Partial<Record<ProfileSectionId, number>>>

export interface SectionCountStore {
  get(): SectionCounts
  set(id: ProfileSectionId, count: number | undefined): void
  subscribe(listener: () => void): () => void
}

export function createSectionCountStore(): SectionCountStore {
  let counts: SectionCounts = {}
  const listeners = new Set<() => void>()
  return {
    get: () => counts,
    set(id, count) {
      if (counts[id] === count) return
      const next: Partial<Record<ProfileSectionId, number>> = { ...counts }
      if (count === undefined) delete next[id]
      else next[id] = count
      counts = next
      for (const listener of [...listeners]) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

const SectionCountContext = createContext<SectionCountStore | null>(null)

/** Mounted by the Contacts panel around the menu and its Sections. */
export function SectionCountProvider({ children }: { readonly children: ReactNode }) {
  const [store] = useState(createSectionCountStore)
  return <SectionCountContext.Provider value={store}>{children}</SectionCountContext.Provider>
}

const NO_COUNTS: SectionCounts = {}
const noop = (): (() => void) => () => undefined

/** The reported counts (none outside a provider). */
export function useSectionCounts(): SectionCounts {
  const store = useContext(SectionCountContext)
  return useSyncExternalStore(store?.subscribe ?? noop, store?.get ?? (() => NO_COUNTS), () => NO_COUNTS)
}

/** Reports a Section's saved-entry count (`undefined` clears it); cleared on unmount. No-op outside a provider. */
export function useReportSectionCount(id: ProfileSectionId, count: number | undefined): void {
  const store = useContext(SectionCountContext)
  useEffect(() => {
    store?.set(id, count)
  }, [store, id, count])
  useEffect(() => () => store?.set(id, undefined), [store, id])
}
