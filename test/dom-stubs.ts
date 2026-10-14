import { vi } from "vitest"

/**
 * jsdom has no layout: Radix Popper (Tooltip, Select) needs `ResizeObserver`,
 * and Select calls `scrollIntoView` and the pointer-capture methods. Call in a
 * `beforeEach` (globals are unstubbed after every test).
 */
export function stubLayoutApis(): void {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  )
  const proto = Element.prototype as Element & {
    scrollIntoView?: () => void
    hasPointerCapture?: () => boolean
    releasePointerCapture?: () => void
  }
  proto.scrollIntoView ??= () => {}
  proto.hasPointerCapture ??= () => false
  proto.releasePointerCapture ??= () => {}
}
