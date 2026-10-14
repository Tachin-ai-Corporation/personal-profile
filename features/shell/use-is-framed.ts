import { useSyncExternalStore } from "react"

/**
 * Framed detection (AD-5): `window.self !== window.top`.
 *
 * Framing never changes during a page's life, so the store has no updates. A
 * cross-origin frame can throw on `window.top`, which counts as framed. The
 * server snapshot is `false`, so server and first client render agree.
 */

const noopSubscribe = () => () => {}

/** Client snapshot. */
function readFramed(): boolean {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

const serverSnapshot = () => false

/** `true` when the page runs inside a frame (e.g. the portal's `ExternalAppFrame`). */
export function useIsFramed(): boolean {
  return useSyncExternalStore(noopSubscribe, readFramed, serverSnapshot)
}
