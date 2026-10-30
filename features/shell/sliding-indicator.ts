import { useLayoutEffect, type RefObject } from "react"

/**
 * Places a sliding highlight (design refresh, PROPOSAL) over the list's
 * `aria-current` item: `translateY` to the item's `offsetTop` and its
 * height, so a CSS transform transition slides it. The indicator and the
 * items must share their offset parent (a positioned ancestor). Runs on every
 * `activeKey` change (a click, a scroll-spy change) and again when the list
 * resizes (a label wraps, the menu appears at 768 px). `data-ready` is set one
 * frame after the first placement: gate the transition on it, so the page
 * never opens with a slide. Writes the style directly (no state, no re-render).
 */
export function useSlidingIndicator(
  listRef: RefObject<HTMLElement | null>,
  indicatorRef: RefObject<HTMLElement | null>,
  activeKey: string,
  enabled: boolean,
): void {
  useLayoutEffect(() => {
    const list = listRef.current
    const indicator = indicatorRef.current
    if (!enabled || !list || !indicator) return
    const place = (): void => {
      const target = list.querySelector<HTMLElement>('[aria-current="location"]')
      if (!target) return
      indicator.style.transform = `translateY(${target.offsetTop}px)`
      indicator.style.height = `${target.offsetHeight}px`
    }
    place()
    const frame = requestAnimationFrame(() => {
      indicator.dataset.ready = "true"
    })
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place)
    observer?.observe(list)
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
    }
  }, [listRef, indicatorRef, activeKey, enabled])
}
