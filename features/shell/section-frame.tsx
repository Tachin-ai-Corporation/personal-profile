"use client"

import { createContext, useCallback, useContext, type ReactNode } from "react"

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

/** The ready signal of the frame `id` (a Section id or `/account` anchor, e.g. `phone`, `authenticator`). */
export function useSectionFrame(id: string): SectionFrame {
  const sink = useContext(SectionFrameContext)
  const onReady = useCallback(() => sink?.(id), [sink, id])
  return { onReady }
}
