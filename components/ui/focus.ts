/**
 * Focus helpers shared by the portaled popups (InfoPopover, Combobox) that
 * bridge Tab between their trigger or field and their content.
 */

const TABBABLE = [
  "a[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "iframe",
  "audio[controls]",
  "video[controls]",
  '[contenteditable]:not([contenteditable="false"])',
  "[tabindex]",
].join(", ")

/** Rendered and visible: has boxes (not `display: none`) and isn't `visibility: hidden`. */
const isShown = (el: HTMLElement): boolean => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden"

/** In the tab order: no negative `tabindex` (read from the attribute, as some DOMs report -1 for `summary` or editing hosts). */
const inTabOrder = (el: HTMLElement): boolean => {
  const explicit = el.getAttribute("tabindex")
  return explicit === null || Number(explicit) >= 0
}

/** Keyboard-reachable elements under `root`, in document order (Radix's focus guards and hidden elements excluded). */
export function tabbables(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    (el) => inTabOrder(el) && !el.hasAttribute("data-radix-focus-guard") && !el.closest("[hidden], [inert]") && isShown(el),
  )
}
