"use client"

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react"
import type { Environment } from "@/lib/shared/environments"
import { createDraftController, drafts as defaultStore, type DraftController, type DraftOffer, type DraftStore } from "./drafts"
import { onBeforeExit, onBeforeSessionExpired } from "./exit-hooks"
import type { DraftDiffRow, SectionId } from "./nav-types"
import { useSectionRegistry } from "./section-registry"

const DraftContext = createContext<DraftController | null>(null)

export interface DraftsProviderProps {
  /** The Launching user's id (`myself.id`); `undefined` until it loads (nothing is read or written before). */
  readonly userId: number | undefined
  /** The session's environment (part of every key); `null` when unknown (nothing is read or written). */
  readonly environment: Environment | null
  readonly children: ReactNode
  /** Test seams. */
  readonly store?: DraftStore
  readonly debounceMs?: number
}

/**
 * The page's drafts (Story 1.15, F4), inside its `SectionRegistryProvider`:
 * purges stale drafts on mount, follows the registry (debounced writes,
 * deletes on save / discard / clean), flushes every dirty draftable Section
 * before the session-expired dialog opens, on `pagehide` and when the page
 * turns hidden (mobile browsers may kill a hidden tab), and purges this
 * user's drafts before the portal exit (`onBeforeExit`; never on a hand-off
 * or the session dialog's Return).
 */
export function DraftsProvider({ userId, environment, children, store = defaultStore, debounceMs }: DraftsProviderProps) {
  const registry = useSectionRegistry()
  const [controller] = useState(() => createDraftController({ store, registry, debounceMs }))

  useEffect(() => store.purgeStale(), [store])

  useEffect(() => {
    const stop = registry.observe((event) => controller.handle(event))
    // Sections registered (in their own, earlier effects) before this subscription.
    controller.sync()
    return stop
  }, [registry, controller])

  useEffect(
    () => controller.setOwner(userId === undefined || environment === null ? null : { environment, userId }),
    [controller, userId, environment],
  )

  useEffect(() => {
    const flush = (): void => controller.flush()
    const flushWhenHidden = (): void => {
      if (document.visibilityState === "hidden") controller.flush()
    }
    const stopSession = onBeforeSessionExpired(flush)
    const stopExit = onBeforeExit(() => controller.purgeUser())
    window.addEventListener("pagehide", flush)
    document.addEventListener("visibilitychange", flushWhenHidden)
    return () => {
      stopSession()
      stopExit()
      window.removeEventListener("pagehide", flush)
      document.removeEventListener("visibilitychange", flushWhenHidden)
    }
  }, [controller])

  // Reversible: StrictMode runs this cleanup and the setup again on the same controller.
  // The page unmounting with it (its cleanup runs before the Sections') keeps their latest edits.
  useEffect(() => {
    controller.revive()
    return () => {
      controller.flush()
      controller.dispose()
    }
  }, [controller])

  return <DraftContext.Provider value={controller}>{children}</DraftContext.Provider>
}

/** What a Section's draft slot shows, with its choices. */
export type SectionDraft =
  | { readonly kind: "none" }
  | { readonly kind: "restore"; readonly restore: () => void; readonly discard: () => void }
  | {
      readonly kind: "conflict"
      readonly rows: readonly DraftDiffRow[]
      readonly keepMine: () => void
      readonly useCurrent: () => void
    }

const NONE: SectionDraft = { kind: "none" }
const NO_OFFER: DraftOffer = { kind: "none" }
const noSubscription = (): (() => void) => () => undefined

/** A Section's stored draft offer (none outside a `DraftsProvider`, e.g. in unit tests). */
export function useSectionDraft(sectionId: SectionId): SectionDraft {
  const controller = useContext(DraftContext)
  const offer = useSyncExternalStore(
    controller?.subscribe ?? noSubscription,
    () => controller?.offerFor(sectionId) ?? NO_OFFER,
    /* v8 ignore next -- server snapshot: drafts live in the browser only */
    () => NO_OFFER,
  )
  if (!controller || offer.kind === "none") return NONE
  const apply = (): void => controller.apply(sectionId)
  const drop = (): void => controller.drop(sectionId)
  if (offer.kind === "restore") return { kind: "restore", restore: apply, discard: drop }
  return { kind: "conflict", rows: offer.rows, keepMine: apply, useCurrent: drop }
}
