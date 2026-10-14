/**
 * =============================================================================
 * Session events — the only client-side session signals (AD-19)
 * =============================================================================
 *
 * Exactly two modules publish:
 *   - `callApi` publishes `session-expired` (401 `SESSION_EXPIRED`) or
 *     `session-changed` (409 `SESSION_CHANGED`);
 *   - the idle warning (`features/shell/idle-warning.tsx`) publishes
 *     `session-expired` when the client-side idle or absolute deadline passes
 *     (Story 1.6).
 * Nothing else publishes; `lib/api/index.ts` deliberately does not re-export
 * `publish`.
 *
 * Each event reaches subscribers only the FIRST time it is published in a
 * page's lifetime: a session that ended stays ended until the page reloads, so
 * later failures must not re-open dialogs. The shell subscribes (Story 1.7).
 *
 * A throwing subscriber is isolated: it never breaks `callApi` or the other
 * subscribers.
 * =============================================================================
 */

export type SessionEvent = "session-expired" | "session-changed"

type Listener = () => void

const listeners: Record<SessionEvent, Set<Listener>> = {
  "session-expired": new Set(),
  "session-changed": new Set(),
}

const published = new Set<SessionEvent>()

/**
 * Notify subscribers of `event`, only the first time per page lifetime. Later
 * calls for the same event are no-ops. Never throws.
 */
export function publish(event: SessionEvent): void {
  if (published.has(event)) return
  published.add(event)
  // Snapshot so a subscriber that unsubscribes during dispatch is safe.
  for (const cb of Array.from(listeners[event])) {
    try {
      cb()
    } catch (error) {
      console.error(`[pp session-events] ${event} subscriber failed:`, error instanceof Error ? error.name : "error")
    }
  }
}

/** Subscribe to `event`; returns an unsubscribe function. */
export function subscribe(event: SessionEvent, cb: Listener): () => void {
  listeners[event].add(cb)
  return () => {
    listeners[event].delete(cb)
  }
}

/** Test-only: forget published events and drop all subscribers. */
export function __resetSessionEventsForTests(): void {
  published.clear()
  listeners["session-expired"].clear()
  listeners["session-changed"].clear()
}
