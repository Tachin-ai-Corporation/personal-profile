/**
 * The one "the user scrolled by hand" detector (F3-3) shared by the Section
 * menu pin (`useSectionNavigation`) and the deep-link re-scroll
 * (`useHashAnchors`): a wheel, a touch move, a scroll key, or a press on the
 * page scrollbar.
 *
 * A scroll key does not count when it is typed in an editable target (input,
 * textarea, select, contenteditable) or inside an element marked
 * `HAND_SCROLL_IGNORE_ATTR` (the Section menu, the Jump to trigger and its
 * listbox), where it moves focus or a caret, not the page.
 */

/** Keys that scroll the page. */
export const SCROLL_KEYS: ReadonlySet<string> = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "])

/** Put on an element whose keys never count as a hand scroll. */
export const HAND_SCROLL_IGNORE_ATTR = "data-hand-scroll-ignore"

function isEditableTarget(target: Element): boolean {
  if (target instanceof HTMLElement && target.isContentEditable) return true
  return target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])") !== null
}

/** Whether a keydown scrolls the page by hand. */
export function isHandScrollKey(event: KeyboardEvent): boolean {
  if (!SCROLL_KEYS.has(event.key)) return false
  const target = event.target
  if (!(target instanceof Element)) return true
  if (isEditableTarget(target)) return false
  return target.closest(`[${HAND_SCROLL_IGNORE_ATTR}]`) === null
}

/** A press on the viewport scrollbar: it lands on `<html>`, or beyond the layout viewport's client box. */
function isScrollbarPointerDown(event: PointerEvent): boolean {
  const root = document.documentElement
  if (event.target === root) return true
  return (root.clientWidth > 0 && event.clientX >= root.clientWidth) || (root.clientHeight > 0 && event.clientY >= root.clientHeight)
}

/** Calls `listener` on every hand scroll until the returned cleanup runs. */
export function onHandScroll(listener: () => void): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (isHandScrollKey(event)) listener()
  }
  const onPointerDown = (event: PointerEvent): void => {
    if (isScrollbarPointerDown(event)) listener()
  }
  window.addEventListener("wheel", listener, { passive: true })
  window.addEventListener("touchmove", listener, { passive: true })
  window.addEventListener("keydown", onKeyDown)
  window.addEventListener("pointerdown", onPointerDown)
  return () => {
    window.removeEventListener("wheel", listener)
    window.removeEventListener("touchmove", listener)
    window.removeEventListener("keydown", onKeyDown)
    window.removeEventListener("pointerdown", onPointerDown)
  }
}
