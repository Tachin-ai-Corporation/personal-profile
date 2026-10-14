"use client"

import { useCallback, useEffect, useRef } from "react"
import { sectionHeadingId } from "./anchors"
import { onHandScroll } from "./hand-scroll"
import { HASH_NAVIGATE_EVENT } from "./nav-types"

/** `smooth`, or `auto` (instant) under `prefers-reduced-motion: reduce`. */
export function motionAwareScrollBehavior(): ScrollBehavior {
  const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  return reduce ? "auto" : "smooth"
}

export interface HashAnchorsOptions {
  /** Also move focus to the target frame's `h2` (`/account`, Story 7.1). Default `false`. */
  readonly focusHeading?: boolean
  /** Sub-anchors inside a frame → that frame's id (e.g. `signature` → `personal`). */
  readonly subAnchors?: Readonly<Record<string, string>>
  /** Called with the frame id each time a hash is followed (e.g. to pin the Section menu item). */
  readonly onFollow?: (frameId: string) => void
}

export interface HashAnchors {
  /**
   * Tell the hook a frame became ready (`StateFrame` `onReady`). When it holds
   * the followed target, the target is scrolled to once more, instantly, since
   * the content that arrived may have moved it.
   */
  frameReady(frameId: string): void
  /** Drop a pending re-scroll (a Section menu or Jump to activation took over). */
  cancelPending(): void
}

/** Whether the frame `frameId` (or the `StateFrame` inside it) is already showing its content; no frame counts as ready. */
function isFrameReady(frameId: string): boolean {
  const element = document.getElementById(frameId)
  if (!element) return true
  const selector = '[data-slot="state-frame"]'
  const frame = element.matches(selector) ? element : element.querySelector(selector)
  return frame === null || frame.getAttribute("data-state") === "ready"
}

/** The hash's anchor and its frame, or `null` for anything not listed (bad encodings included). */
function resolveHash(hash: string, ids: readonly string[], subAnchors: Readonly<Record<string, string>>): { target: string; frame: string } | null {
  let raw = hash.replace(/^#/, "")
  try {
    raw = decodeURIComponent(raw)
  } catch {
    return null
  }
  if (ids.includes(raw)) return { target: raw, frame: raw }
  if (Object.hasOwn(subAnchors, raw) && ids.includes(subAnchors[raw])) return { target: raw, frame: subAnchors[raw] }
  return null
}

/**
 * Deep links within one tab (F3-3, port of main's Story 1.8B): on mount
 * (instant) and on `hashchange` (motion-aware), a hash naming one of `ids`
 * (or a sub-anchor) scrolls its element into view, optionally focusing the
 * frame's `h2`; any other hash is ignored and the page stays where it is.
 * A same-page `navigate()` with a hash is followed too (`HASH_NAVIGATE_EVENT`).
 * Mount it only on the tab that owns the anchors. The one re-scroll is armed
 * only while the target frame is not ready; it is spent by the frame's first
 * ready and cancelled by a hand scroll (`onHandScroll`) or `cancelPending()`.
 */
export function useHashAnchors(ids: readonly string[], options: HashAnchorsOptions = {}): HashAnchors {
  const latest = useRef({ ids, options })
  useEffect(() => {
    latest.current = { ids, options }
  })
  /** The followed target awaiting its frame's ready state. */
  const pending = useRef<{ target: string; frame: string } | null>(null)

  useEffect(() => {
    const follow = (behavior: ScrollBehavior): void => {
      const { ids: anchors, options: opts } = latest.current
      const resolved = resolveHash(window.location.hash, anchors, opts.subAnchors ?? {})
      if (!resolved) return
      const element = document.getElementById(resolved.target)
      if (!element) return
      pending.current = isFrameReady(resolved.frame) ? null : resolved
      opts.onFollow?.(resolved.frame)
      element.scrollIntoView({ behavior, block: "start" })
      if (opts.focusHeading) document.getElementById(sectionHeadingId(resolved.frame))?.focus({ preventScroll: true })
    }
    const onHashChange = (): void => follow(motionAwareScrollBehavior())
    const cancel = (): void => {
      pending.current = null
    }
    follow("auto")
    window.addEventListener("hashchange", onHashChange)
    window.addEventListener(HASH_NAVIGATE_EVENT, onHashChange)
    const stopHandScroll = onHandScroll(cancel)
    return () => {
      window.removeEventListener("hashchange", onHashChange)
      window.removeEventListener(HASH_NAVIGATE_EVENT, onHashChange)
      stopHandScroll()
    }
  }, [])

  const frameReady = useCallback((frameId: string) => {
    const target = pending.current
    if (!target || target.frame !== frameId) return
    pending.current = null
    document.getElementById(target.target)?.scrollIntoView({ behavior: "auto", block: "start" })
  }, [])

  const cancelPending = useCallback(() => {
    pending.current = null
  }, [])

  return { frameReady, cancelPending }
}
