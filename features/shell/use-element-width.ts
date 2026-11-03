"use client"

import { createContext, useCallback, useState, useSyncExternalStore } from "react"

/**
 * The inner width of the nearest `SectionContainer` (0 until measured, and
 * outside one). A table mounted inside it (read ↔ edit) reads it on its first
 * render, so it picks its layout before mounting any cells.
 */
export const ContainerWidthContext = createContext(0)

/**
 * The inner width in px (`clientWidth`) of the element the returned callback
 * ref is on, or with `parent` the content width of its parent (for a table
 * whose own width its column widths could stretch), kept current with a
 * `ResizeObserver`; `null` until measured, and where there is no layout
 * (jsdom). It follows the ref to a new element (a table swapping `<table>`
 * for `<ul>`).
 */
export function useElementWidth(parent = false): readonly [number | null, (element: HTMLElement | null) => (() => void) | undefined] {
  const [width, setWidth] = useState<number | null>(null)
  const ref = useCallback(
    (element: HTMLElement | null) => {
      const target = parent ? element?.parentElement : element
      if (!target || typeof ResizeObserver === "undefined") return undefined
      const update = () => {
        const style = parent ? getComputedStyle(target) : null
        const padding = style ? (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0) : 0
        setWidth(target.clientWidth - padding || null)
      }
      update()
      const observer = new ResizeObserver(update)
      observer.observe(target)
      return () => observer.disconnect()
    },
    [parent],
  )
  return [width, ref]
}

/** Web font loads finished so far (`loadingdone` events seen). */
let fontLoads = 0

function subscribeFonts(onChange: () => void): () => void {
  const listener = () => {
    fontLoads += 1
    onChange()
  }
  document.fonts?.addEventListener("loadingdone", listener)
  return () => document.fonts?.removeEventListener("loadingdone", listener)
}

/**
 * Re-renders the caller each time a web font finishes loading, so a table
 * that measured its headers in the fallback font measures them again. The
 * status is part of the value, so a load that ends between the render and
 * the subscription is caught too.
 */
export function useFontLoads(): string {
  return useSyncExternalStore(
    subscribeFonts,
    () => `${fontLoads}:${document.fonts?.status ?? "loaded"}`,
    () => "0:loaded",
  )
}
