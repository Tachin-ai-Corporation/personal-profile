import { vi } from "vitest"

/** Stubs `window.matchMedia` with a fixed viewport width (jsdom has none). Returns a resize helper. */
export function stubViewport(width: number): (next: number) => void {
  let current = width
  const listeners = new Set<() => void>()
  const matches = (query: string): boolean => {
    const min = /min-width:\s*(\d+)px/.exec(query)
    const max = /max-width:\s*(\d+)px/.exec(query)
    return (!min || current >= Number(min[1])) && (!max || current <= Number(max[1]))
  }
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return matches(query)
    },
    media: query,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  }))
  return (next: number) => {
    current = next
    for (const listener of [...listeners]) listener()
  }
}
