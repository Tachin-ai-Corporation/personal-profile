/**
 * Single-flight token refresh (AD-16): one shared promise within the tab, and
 * `navigator.locks.request("pp-refresh")` across tabs when available. A tab
 * that waited on the lock finds the cookie already refreshed and the route
 * answers 200 without calling the IdP.
 */

export type RefreshOutcome =
  | { readonly kind: "refreshed" }
  /** 401 `SESSION_EXPIRED`: the session is over. */
  | { readonly kind: "expired" }
  /** 503 `REFRESH_UNAVAILABLE`, other failures, or a network error: keep the session. */
  | { readonly kind: "unavailable" }

/** The part of the Web Locks API this needs. */
export interface LockManagerLike {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>
}

export interface RefreshCoordinator {
  refresh(): Promise<RefreshOutcome>
}

export const REFRESH_LOCK = "pp-refresh"

/**
 * Runs `run` under the lock. If the lock itself fails (`request` rejects):
 * before the callback ran → refresh unlocked; after it produced an outcome →
 * that outcome; after it started without an outcome → `unavailable` (never a
 * second, concurrent refresh). Spec R5-2, main's fallback.
 */
async function runLocked(locks: LockManagerLike, run: () => Promise<RefreshOutcome>): Promise<RefreshOutcome> {
  let ran = false
  let outcome: RefreshOutcome | undefined
  try {
    return await locks.request(REFRESH_LOCK, async () => {
      ran = true
      outcome = await run()
      return outcome
    })
  } catch {
    if (!ran) return run()
    return outcome ?? { kind: "unavailable" }
  }
}

export function createRefreshCoordinator(
  run: () => Promise<RefreshOutcome>,
  getLocks: () => LockManagerLike | undefined,
): RefreshCoordinator {
  let inFlight: Promise<RefreshOutcome> | null = null

  return {
    refresh() {
      if (inFlight) return inFlight
      const locks = getLocks()
      const attempt = locks ? runLocked(locks, run) : run()
      inFlight = attempt
        .catch((): RefreshOutcome => ({ kind: "unavailable" }))
        .finally(() => {
          inFlight = null
        })
      return inFlight
    },
  }
}

/** `navigator.locks`, when the browser has it. */
export function browserLocks(): LockManagerLike | undefined {
  if (typeof navigator === "undefined" || !("locks" in navigator)) return undefined
  const locks = navigator.locks
  return {
    request: <T>(name: string, callback: () => Promise<T>): Promise<T> => locks.request(name, callback),
  }
}
