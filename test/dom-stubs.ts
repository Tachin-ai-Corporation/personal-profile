import { act } from "@testing-library/react"
import { vi } from "vitest"

/**
 * jsdom stubs for the profile shell tests (Story 1.8): `IntersectionObserver`
 * (driven by hand), `Element.scrollIntoView` (recorded), `matchMedia` (reduced
 * motion on or off), plus the pointer-capture and `ResizeObserver` APIs that
 * Radix Select needs. Call `installDomStubs()` in `beforeEach`; everything is
 * undone by `vi.unstubAllGlobals()` / `vi.restoreAllMocks()` and `uninstall()`.
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

/** Report the given Section ids as (not) intersecting to every live observer. */
export function reportIntersections(states: Record<string, boolean>): void {
  act(() => {
    for (const io of FakeIntersectionObserver.instances) {
      if (io.disconnected) continue
      const entries = Object.entries(states)
        .map(([id, isIntersecting]) => {
          const target = document.getElementById(id)
          return target ? ({ target, isIntersecting } as unknown as IntersectionObserverEntry) : null
        })
        .filter((e): e is IntersectionObserverEntry => e !== null)
      io.callback(entries, io as unknown as IntersectionObserver)
    }
  })
}

class FakeResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

export interface DomStubs {
  /** Every `scrollIntoView` call: the element and its options. */
  scrolls: { el: Element; options: ScrollIntoViewOptions | boolean | undefined }[]
  setReducedMotion(on: boolean): void
  uninstall(): void
}

export function installDomStubs(): DomStubs {
  FakeIntersectionObserver.instances = []
  let reduced = false
  const scrolls: DomStubs["scrolls"] = []

  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver)
  vi.stubGlobal("ResizeObserver", FakeResizeObserver)
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
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete proto[k]
        else proto[k] = v
      }
      vi.unstubAllGlobals()
    },
  }
}
