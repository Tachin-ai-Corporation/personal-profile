import { act } from "@testing-library/react"
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

/**
 * Section navigation stubs (F3-3, ported from main's Story 1.8B): an
 * `IntersectionObserver` driven by hand, a recording `Element.scrollIntoView`,
 * and `matchMedia` with reduced motion on or off, plus the layout APIs Radix
 * Select needs. Call `installDomStubs()` in `beforeEach` and `uninstall()` in
 * `afterEach`.
 */
export class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []

  readonly callback: IntersectionObserverCallback
  readonly options: IntersectionObserverInit | undefined
  readonly targets = new Set<Element>()
  disconnected = false

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback
    this.options = options
    FakeIntersectionObserver.instances.push(this)
  }

  observe(el: Element): void {
    this.targets.add(el)
  }

  unobserve(el: Element): void {
    this.targets.delete(el)
  }

  disconnect(): void {
    this.disconnected = true
    this.targets.clear()
  }

  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}

/** Reports the given element ids as (not) intersecting to every live observer. */
export function reportIntersections(states: Record<string, boolean>): void {
  act(() => {
    for (const io of FakeIntersectionObserver.instances) {
      if (io.disconnected) continue
      const entries = Object.entries(states).flatMap(([id, isIntersecting]) => {
        const target = document.getElementById(id)
        return target ? [{ target, isIntersecting } as unknown as IntersectionObserverEntry] : []
      })
      io.callback(entries, io as unknown as IntersectionObserver)
    }
  })
}

export interface DomStubs {
  /** Every `scrollIntoView` call: the element and its options. */
  readonly scrolls: { el: Element; options: ScrollIntoViewOptions | boolean | undefined }[]
  setReducedMotion(on: boolean): void
  uninstall(): void
}

export function installDomStubs(): DomStubs {
  FakeIntersectionObserver.instances = []
  let reduced = false
  const scrolls: DomStubs["scrolls"] = []

  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver)
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  )
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: reduced && query.includes("prefers-reduced-motion: reduce"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    })),
  )

  const proto = Element.prototype as unknown as Record<string, unknown>
  const saved = {
    scrollIntoView: proto.scrollIntoView,
    hasPointerCapture: proto.hasPointerCapture,
    setPointerCapture: proto.setPointerCapture,
    releasePointerCapture: proto.releasePointerCapture,
  }
  proto.scrollIntoView = function (this: Element, options?: ScrollIntoViewOptions | boolean) {
    scrolls.push({ el: this, options })
  }
  proto.hasPointerCapture = () => false
  proto.setPointerCapture = () => {}
  proto.releasePointerCapture = () => {}

  return {
    scrolls,
    setReducedMotion(on) {
      reduced = on
    },
    uninstall() {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete proto[key]
        else proto[key] = value
      }
      vi.unstubAllGlobals()
    },
  }
}
