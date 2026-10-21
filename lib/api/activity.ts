/**
 * User activity the server recorded, shared across tabs (Story 1.6, AD-16).
 *
 * `callApi` hands every echoed `X-PP-Activity-At` to `note(t)`, which keeps the
 * latest value, notifies local subscribers (the idle warning) and posts `{ t }`
 * on `BroadcastChannel("pp-activity")`, so the other tabs of this session move
 * their deadlines too. The payload is exactly `{ t }`: no ids, tokens or PHI.
 * Incoming messages are validated, recorded and notified, never re-broadcast.
 * Without `BroadcastChannel` everything stays local to the tab.
 */

export const ACTIVITY_CHANNEL = "pp-activity"

export type ActivityListener = (t: number) => void

export interface Activity {
  /** Records activity at `t` (epoch ms, server time) and tells the other tabs. Non-finite values are ignored. */
  note(t: number): void
  /** Activity from this tab or another; returns an unsubscribe function. */
  subscribe(listener: ActivityListener): () => void
  /** The latest activity seen in this tab (epoch ms, server time), or `0`. */
  lastAt(): number
  /** Test hook: forgets activity, drops listeners and closes the channel. */
  reset(): void
}

/** True only for an object with exactly one key, `t`, holding a finite number. */
function isActivityMessage(data: unknown): data is { t: number } {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return false
  const keys = Object.keys(data)
  if (keys.length !== 1 || keys[0] !== "t") return false
  const { t } = data as { t: unknown }
  return typeof t === "number" && Number.isFinite(t)
}

export function createActivity(): Activity {
  let current = 0
  const listeners = new Set<ActivityListener>()
  /** `undefined` = not opened yet; `null` = unavailable. */
  let channel: BroadcastChannel | null | undefined

  function record(t: number): void {
    if (t > current) current = t
    const value = current
    for (const listener of [...listeners]) {
      // A failing listener must not stop the others or make `callApi` throw.
      try {
        listener(value)
      } catch (error) {
        console.error("[activity] listener failed", error instanceof Error ? error.name : typeof error)
      }
    }
  }

  /** The tab's channel, opened lazily. */
  function getChannel(): BroadcastChannel | null {
    if (channel !== undefined) return channel
    if (typeof BroadcastChannel === "undefined") {
      channel = null
      return channel
    }
    let opened: BroadcastChannel
    try {
      opened = new BroadcastChannel(ACTIVITY_CHANNEL)
    } catch {
      channel = null
      return channel
    }
    opened.onmessage = (event: MessageEvent) => {
      if (isActivityMessage(event.data)) record(event.data.t)
    }
    channel = opened
    return channel
  }

  return {
    note(t) {
      if (!Number.isFinite(t)) return
      record(t)
      try {
        getChannel()?.postMessage({ t })
      } catch {
        // A closed or failing channel leaves the activity local to this tab.
      }
    },
    subscribe(listener) {
      getChannel()
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    lastAt() {
      getChannel()
      return current
    },
    reset() {
      current = 0
      listeners.clear()
      channel?.close()
      channel = undefined
    },
  }
}

/** The page-lifetime instance. */
export const activity: Activity = createActivity()
