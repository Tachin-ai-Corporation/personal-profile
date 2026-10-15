/**
 * The page user and the save safeguard (D-A, spec NG-9027; approved
 * 2026-10-14, batch check decided 2026-10-15).
 *
 * There is no session binding (D5): when user B launches in this browser,
 * user A's open tab sends B's session cookie. So the id of the first `myself`
 * this page loads is pinned as the page user (`fetchMyself` pins it; the first
 * one wins and it resets only on a full page load), and before every write to
 * 1health data `callApi` reads a fresh `/myself` (`checkPageUser`). On another
 * id nothing is sent and the page ends through the existing `session-expired`
 * path; the drafts stay keyed to the pinned user (`PageFrame`). With no page
 * user pinned (no `myself` ever loaded) the write is blocked like a failed
 * check: nothing is sent and the Section shows the network error with Retry
 * (human decision 2026-10-15).
 *
 * Save all and the leave guard's Save (`runSaveAll`) check once per batch and
 * run their saves inside `pageUser.runVerified(fn)`, during which `callApi`
 * skips its per-write check.
 *
 * Accepted limits (`deferred-work.md`, Foundation): reads are never checked;
 * an id that happens to match across demo and prod is not caught; the check
 * and the write (or the whole batch) are not atomic. While a batch runs, its
 * single check also covers any other write the page sends meanwhile (part of
 * accepted limit 3: there is no async context to scope the flag to the batch).
 *
 * `client` is imported as a type only: `client.ts` imports this module.
 */

import type { CallApi } from "./client"
import { proxyPath } from "./config"
import { sessionEvents as defaultSessionEvents, type SessionEvents } from "./session-events"
import type { ApiResponse } from "./types"

export interface PageUser {
  /** Pins the page user. The first call wins: a later id never replaces it. */
  pin(id: number): void
  /** The pinned user id, or `undefined` before the first `myself` loaded. */
  id(): number | undefined
  /** Runs one verified batch: while it runs, `callApi` skips its per-write check. */
  runVerified<T>(fn: () => Promise<T>): Promise<T>
  /** `true` while a verified batch runs. */
  isVerified(): boolean
  /** Test hook: forgets the pin and any running batch (a full page load does the same). */
  reset(): void
}

export function createPageUser(): PageUser {
  let pinned: number | undefined
  let batches = 0
  /** Bumped by `reset`: a batch started before it never decrements the new count. */
  let generation = 0
  return {
    pin(id) {
      pinned ??= id
    },
    id() {
      return pinned
    },
    async runVerified(fn) {
      const started = generation
      batches += 1
      try {
        return await fn()
      } finally {
        if (generation === started) batches -= 1
      }
    },
    isVerified() {
      return batches > 0
    },
    reset() {
      pinned = undefined
      batches = 0
      generation += 1
    },
  }
}

/** The page-lifetime instance. */
export const pageUser: PageUser = createPageUser()

export type PageUserCheck =
  /** Nothing pinned yet (no `myself` loaded): no request; `callApi` blocks the write like a failed check (network error). */
  | { readonly kind: "unpinned" }
  /** The fresh `myself` is the page user. */
  | { readonly kind: "same" }
  /** Another user's session: `session-expired` was published; send nothing (`callApi` answers `SESSION_EXPIRED`). */
  | { readonly kind: "other" }
  /** The check failed or answered no numeric id: fail closed, return `response` and send nothing. */
  | { readonly kind: "failed"; readonly response: ApiResponse<never> }

export interface PageUserCheckDeps {
  readonly pageUser?: PageUser
  readonly events?: SessionEvents
}

/**
 * Reads a fresh `/myself` with `call` (a `callApi` GET, so its refresh, replay
 * and `session-expired` handling apply; never cached) and compares its id with
 * the pinned page user. Publishes `session-expired` on another id.
 */
export async function checkPageUser(call: CallApi, deps: PageUserCheckDeps = {}): Promise<PageUserCheck> {
  const pinned = (deps.pageUser ?? pageUser).id()
  if (pinned === undefined) return { kind: "unpinned" }
  const res = await call<unknown>("page-user/check", proxyPath("v2/user/myself"), { cache: "no-store" })
  if (!res.success) return { kind: "failed", response: { ...res, data: undefined } }
  const id = typeof res.data === "object" && res.data !== null ? (res.data as { readonly id?: unknown }).id : undefined
  if (typeof id !== "number") {
    return { kind: "failed", response: { success: false, statusCode: res.statusCode, error: "page-user/check returned an unexpected shape" } }
  }
  if (id === pinned) return { kind: "same" }
  ;(deps.events ?? defaultSessionEvents).publish("session-expired")
  return { kind: "other" }
}
