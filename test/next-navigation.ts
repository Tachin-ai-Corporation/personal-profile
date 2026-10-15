/**
 * A `next/navigation` stand-in for component tests (jsdom has no App Router):
 * `useSearchParams` follows `window.location` and re-renders on
 * `history.replaceState` / `pushState`, as Next does; `useRouter().push` is
 * a spy that also updates the URL.
 *
 *   vi.mock("next/navigation", async () => (await import("@/test/next-navigation")).nextNavigationMock)
 */

import { useSyncExternalStore } from "react"
import { vi } from "vitest"

const URL_CHANGE = "pp-test:urlchange"
let originals: Pick<History, "replaceState" | "pushState"> | null = null

function patchHistory(): void {
  if (originals) return
  originals = { replaceState: window.history.replaceState, pushState: window.history.pushState }
  for (const method of ["replaceState", "pushState"] as const) {
    const original = originals[method].bind(window.history)
    window.history[method] = (...args: Parameters<History["replaceState"]>) => {
      original(...args)
      window.dispatchEvent(new Event(URL_CHANGE))
    }
  }
}

function subscribe(onChange: () => void): () => void {
  patchHistory()
  window.addEventListener(URL_CHANGE, onChange)
  window.addEventListener("popstate", onChange)
  return () => {
    window.removeEventListener(URL_CHANGE, onChange)
    window.removeEventListener("popstate", onChange)
  }
}

const cache = new Map<string, URLSearchParams>()

function searchParams(search: string): URLSearchParams {
  let params = cache.get(search)
  if (!params) {
    params = new URLSearchParams(search)
    cache.set(search, params)
  }
  return params
}

/** The router every `useRouter()` returns; tests read its spies. */
export const testRouter = {
  push: vi.fn((href: string) => {
    patchHistory()
    window.history.pushState(null, "", href)
  }),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
}

export const nextNavigationMock = {
  useRouter: () => testRouter,
  useSearchParams: () =>
    searchParams(
      useSyncExternalStore(
        subscribe,
        () => window.location.search,
        () => "",
      ),
    ),
  usePathname: () => window.location.pathname,
}

/** Sets the URL without a navigation (and notifies `useSearchParams`). */
export function setTestUrl(url: string): void {
  patchHistory()
  window.history.replaceState(null, "", url)
}

/** Undoes the history patch and forgets cached params (run after every test, from test/setup-dom.ts). */
export function resetTestNavigation(): void {
  if (originals) {
    window.history.replaceState = originals.replaceState
    window.history.pushState = originals.pushState
    originals = null
  }
  cache.clear()
  for (const spy of Object.values(testRouter)) spy.mockClear()
}
