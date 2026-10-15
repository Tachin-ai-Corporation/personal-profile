"use client"

import { createContext, useCallback, useContext, useEffect, type ReactNode } from "react"
import { isProductionBuild } from "@/lib/shared/app-env"
import type { AccountSectionId, ProfileSectionId } from "./anchors"

/**
 * The Section-ready signal (F6-1). A panel that follows deep links
 * (`ContactsPanel`, `AnchoredPanel` on `/account`) provides the sink, usually
 * `useHashAnchors(…).frameReady`; a Section composed into it from `app/**`
 * reads it with `useSectionFrame(id)` and passes `onReady` to its
 * `StateFrame`, so a deep-linked Section is scrolled to once more when its
 * content arrives. Outside a provider `onReady` does nothing.
 */
type FrameReadySink = (frameId: string) => void

const SectionFrameContext = createContext<FrameReadySink | null>(null)

export interface SectionFrameProviderProps {
  /** Called with a frame's id each time it becomes ready. */
  readonly onReady: FrameReadySink
  readonly children: ReactNode
}

export function SectionFrameProvider({ onReady, children }: SectionFrameProviderProps) {
  return <SectionFrameContext.Provider value={onReady}>{children}</SectionFrameContext.Provider>
}

export interface SectionFrame {
  /** Pass to the Section's `StateFrame onReady`. */
  readonly onReady: () => void
}

/**
 * Development check (F6-1 review M2): after the panel mounts, every landmark
 * it expects (`<section id>` from `SectionLandmark`) must exist, because the
 * Section menu, scroll-spy and deep links look them up by id. A composed
 * Section renders its `SectionLandmark id` on its first render (loading
 * included) and never remounts it. Logs `console.error` outside production.
 */
export function useLandmarkCheck(ids: readonly string[], where: string): void {
  const key = ids.join(" ")
  useEffect(() => {
    if (isProductionBuild()) return
    for (const id of key.split(" ")) {
      if (!document.getElementById(id)) {
        console.error(`${where}: no landmark #${id} after mount. Render SectionLandmark id="${id}" on the first render and never remount it.`)
      }
    }
  }, [key, where])
}

/** Every landmark that can report ready: the `/` Sections, Insurance, and the `/account` landmarks. */
export type SectionFrameId = ProfileSectionId | "insurance" | AccountSectionId

/** The ready signal of the frame `id` (e.g. `phone`, `authenticator`). */
export function useSectionFrame(id: SectionFrameId): SectionFrame {
  const sink = useContext(SectionFrameContext)
  const onReady = useCallback(() => sink?.(id), [sink, id])
  return { onReady }
}
