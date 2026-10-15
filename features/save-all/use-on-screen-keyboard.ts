"use client"

import { useSyncExternalStore } from "react"

/** How far the visual viewport must shrink below the layout viewport to count as an open on-screen keyboard. */
export const KEYBOARD_MIN_SHRINK_PX = 150

const TEXT_ENTRY = new Set(["INPUT", "SELECT", "TEXTAREA"])

/**
 * Whether the on-screen keyboard looks open (Story 1.14, the Save all pill):
 * an input, select or textarea has focus and the visual viewport is at least
 * `KEYBOARD_MIN_SHRINK_PX` shorter than the window. `false` without
 * `visualViewport`, on the server and before hydration.
 */
export function isOnScreenKeyboardOpen(): boolean {
  const viewport = window.visualViewport
  if (!viewport) return false
  const focused = document.activeElement
  if (!focused || !TEXT_ENTRY.has(focused.tagName)) return false
  return window.innerHeight - viewport.height >= KEYBOARD_MIN_SHRINK_PX
}

function subscribe(onChange: () => void): () => void {
  const viewport = window.visualViewport
  // Focus may still sit on the leaving element during `focusout`: check again once the move is done.
  const onFocusOut = (): void => queueMicrotask(onChange)
  document.addEventListener("focusin", onChange)
  document.addEventListener("focusout", onFocusOut)
  window.addEventListener("resize", onChange)
  viewport?.addEventListener("resize", onChange)
  return () => {
    document.removeEventListener("focusin", onChange)
    document.removeEventListener("focusout", onFocusOut)
    window.removeEventListener("resize", onChange)
    viewport?.removeEventListener("resize", onChange)
  }
}

/** Re-renders when focus or the viewport size changes the answer of `isOnScreenKeyboardOpen`. */
export function useOnScreenKeyboard(): boolean {
  return useSyncExternalStore(subscribe, isOnScreenKeyboardOpen, () => false)
}
