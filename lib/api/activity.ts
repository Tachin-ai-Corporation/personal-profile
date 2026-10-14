/**
 * =============================================================================
 * User activity — what the server last recorded, shared across tabs (Story 1.6)
 * =============================================================================
 *
 * The server echoes `X-PP-Activity-At: <lastSeen epoch ms>` on every response
 * that re-sealed `lastSeen` (ping, proxy). `callApi` hands that value to
 * `noteActivity`, which keeps the latest one, notifies local subscribers (the
 * idle warning) and posts `{ t }` on `BroadcastChannel("pp-activity")` so the
 * other tabs of this session move their deadlines too.
 *
 * The channel payload is exactly `{ t: number }` — no ids, tokens or PHI.
 * Incoming messages are validated, recorded and notified, never re-broadcast.
 * Without `BroadcastChannel` everything stays local to the tab.
 * =============================================================================
 */

const CHANNEL_NAME = "pp-activity"

type Listener = (t: number) => void

let current = 0
const listeners = new Set<Listener>()
let channel: BroadcastChannel | null | undefined

/** True only for an object with exactly one key, `t`, holding a finite number. */
function isActivityMessage(data: unknown): data is { t: number } {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false
  const keys = Object.keys(data)
  if (keys.length !== 1 || keys[0] !== "t") return false
  const t = (data as { t: unknown }).t
  return typeof t === "number" && Number.isFinite(t)
}

/** Record `t` (max semantics) and notify local subscribers. Never throws. */
function record(t: number): void {
  if (t > current) current = t
  const value = current
  for (const cb of Array.from(listeners)) {
    try {
      cb(value)
    } catch (error) {
      console.error("[pp activity] subscriber failed:", error instanceof Error ? error.name : "error")
    }
  }
}

/** The tab's channel, opened lazily; `null` when `BroadcastChannel` is unavailable. */
function getChannel(): BroadcastChannel | null {
  if (channel !== undefined) return channel
  if (typeof BroadcastChannel === "undefined") {
    channel = null
    return channel
  }
  try {
    channel = new BroadcastChannel(CHANNEL_NAME)
    channel.onmessage = (event: MessageEvent) => {
      if (isActivityMessage(event.data)) record(event.data.t)
    }
  } catch {
    channel = null
  }
  return channel
}

/**
 * Note activity the server recorded at `t` (epoch ms, server time): keep the
 * latest, notify subscribers and tell the other tabs. Non-finite values are ignored.
 */
export function noteActivity(t: number): void {
  if (typeof t !== "number" || !Number.isFinite(t)) return
  record(t)
  const ch = getChannel()
  if (!ch) return
  try {
    ch.postMessage({ t })
  } catch {
    // A closed or failing channel leaves activity local to this tab.
  }
}

/** Subscribe to activity (this tab's or another tab's); returns an unsubscribe function. */
export function subscribeActivity(cb: Listener): () => void {
  getChannel()
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/** The latest activity time seen in this tab (epoch ms, server time), or `0`. */
export function lastActivityAt(): number {
  getChannel()
  return current
}

/** Test-only: forget activity, drop subscribers and close the channel. */
export function __resetActivityForTests(): void {
  current = 0
  listeners.clear()
  try {
    channel?.close()
  } catch {
    // ignore
  }
  channel = undefined
}
