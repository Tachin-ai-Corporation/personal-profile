/**
 * The only client-side session signal (AD-19): `session-expired`. `callApi`
 * publishes it; the shell (Story 7.0b) subscribes. It is published at most once
 * per page lifetime. There is no session-change event (D5).
 */

export type SessionEvent = "session-expired"

export type SessionEventListener = () => void

export interface SessionEvents {
  publish(event: SessionEvent): void
  subscribe(event: SessionEvent, listener: SessionEventListener): () => void
  hasPublished(event: SessionEvent): boolean
  /** Test hook: forgets what was published (listeners stay). */
  reset(): void
}

export function createSessionEvents(): SessionEvents {
  const listeners = new Map<SessionEvent, Set<SessionEventListener>>()
  const published = new Set<SessionEvent>()

  return {
    publish(event) {
      if (published.has(event)) return
      published.add(event)
      for (const listener of listeners.get(event) ?? []) {
        // A failing listener must not stop the others or make `callApi` throw.
        try {
          listener()
        } catch (error) {
          console.error("[session-events] listener failed", error)
        }
      }
    },
    subscribe(event, listener) {
      const set = listeners.get(event) ?? new Set<SessionEventListener>()
      set.add(listener)
      listeners.set(event, set)
      return () => {
        set.delete(listener)
      }
    },
    hasPublished(event) {
      return published.has(event)
    },
    reset() {
      published.clear()
    },
  }
}

/** The page-lifetime instance. */
export const sessionEvents: SessionEvents = createSessionEvents()
