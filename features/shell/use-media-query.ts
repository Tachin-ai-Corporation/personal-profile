"use client"

import { useCallback, useSyncExternalStore } from "react"

/** DESIGN.md `breakpoint-mobile`: the desktop layout starts here. */
export const DESKTOP_QUERY = "(min-width: 768px)"

/** Whether a media query matches; `false` on the server and before hydration. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener("change", onChange)
      return () => list.removeEventListener("change", onChange)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}
