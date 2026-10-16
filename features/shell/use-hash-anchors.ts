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
   * Tell the hook a frame settled (`StateFrame` `onReady` / `onSettled`). The followed
   * target is scrolled to instantly when its own frame or an earlier loading
   * frame settles, since either can move it.
   */
  frameReady(frameId: string): void
  /** Drop a pending re-scroll (a Section menu or Jump to activation took over). */
  cancelPending(): void
}

/** Only a loading frame can cause a pending initial layout change. */
function isFrameLoading(frameId: string): boolean {
  const element = document.getElementById(frameId)
  if (!element) return false
  const selector = '[data-slot="state-frame"]'
  const frame = element.matches(selector) ? element : element.querySelector(selector)
  return frame?.getAttribute("data-state") === "loading"
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
 * Mount it only on the tab that owns the anchors. Re-scrolls are armed only for frames
 * loading at navigation, up to the target. Each is spent by its first completion;
 * a hand scroll (`onHandScroll`) or `cancelPending()` cancels the pending work.
 */
export function useHashAnchors(ids: readonly string[], options: HashAnchorsOptions = {}): HashAnchors {
  const latest = useRef({ ids, options })
  useEffect(() => {
    latest.current = { ids, options }
  })
  /** Only frames still loading at navigation can later move this target. */
  const pending = useRef<{ target: string; waiting: Set<string> } | null>(null)

  useEffect(() => {
    const follow = (behavior: ScrollBehavior): void => {
      const { ids: anchors, options: opts } = latest.current
      const resolved = resolveHash(window.location.hash, anchors, opts.subAnchors ?? {})
      if (!resolved) return
      const element = document.getElementById(resolved.target)
      if (!element) return
      const frame = document.getElementById(resolved.frame)
      const waiting = new Set(anchors.filter((id) => {
        const candidate = document.getElementById(id)
        const precedes = frame && candidate && Boolean(candidate.compareDocumentPosition(frame) & Node.DOCUMENT_POSITION_FOLLOWING)
        return (id === resolved.frame || precedes) && isFrameLoading(id)
      }))
      pending.current = waiting.size ? { target: resolved.target, waiting } : null
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
    if (!target || !target.waiting.has(frameId)) return
    // The caller's settled signal is authoritative, even if its frame marker
    // has not updated yet.
    target.waiting.delete(frameId)
    // Several frames can settle in one React commit. Spend that layout only
    // once, and keep waiting only for the frames that are still loading.
    for (const id of target.waiting) {
      if (!isFrameLoading(id)) target.waiting.delete(id)
    }
    if (!target.waiting.size) pending.current = null
    document.getElementById(target.target)?.scrollIntoView({ behavior: "auto", block: "start" })
  }, [])

  const cancelPending = useCallback(() => {
    pending.current = null
  }, [])

  return { frameReady, cancelPending }
}
