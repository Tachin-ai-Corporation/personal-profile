import { callApi, getPortalUrl } from "@/lib/api"

/**
 * =============================================================================
 * Leaving the app (AD-5, AD-16, Story 1.7)
 * =============================================================================
 *
 * - `requestLeave()` asks the single leave guard (Story 1.13) whether the user
 *   may leave; with no guard set it resolves `true` at once.
 * - `returnToPortal()` is the app-bar "Return to 1health" (Story 1.8): it asks
 *   the guard, then signs out (`POST /api/session/logout`, waited on for at most
 *   3 s, failures ignored) and navigates to the constant `PORTAL_URL`.
 *
 * There is no `returnUrl`/`next` parameter anywhere (AD-5). The session-expired
 * dialog never calls these: its "Return to 1health" is a plain link.
 * =============================================================================
 */

/** Resolves `true` when the user may leave. */
export type LeaveGuard = () => Promise<boolean>

/** The longest `returnToPortal()` waits for the logout call before navigating. */
export const LOGOUT_WAIT_MS = 3_000

let guard: LeaveGuard | null = null

/** Set the single leave guard, or clear it with `null`. */
export function setLeaveGuard(fn: LeaveGuard | null): void {
  guard = fn
}

/** `true` immediately when no guard is set; otherwise the guard's result. */
export function requestLeave(): Promise<boolean> {
  return guard ? guard() : Promise.resolve(true)
}

/**
 * Leave for 1health: guard → logout (≤ 3 s, failures ignored) → navigate to
 * `PORTAL_URL`. Does nothing when the guard says no; does not navigate when no
 * portal URL is registered.
 */
export async function returnToPortal(): Promise<void> {
  if (!(await requestLeave())) return

  let timer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([
    // `keepalive`: a logout still in flight when the timer wins survives the
    // navigation, so its cookie-clearing `Set-Cookie` is not lost.
    callApi("session/logout", "/api/session/logout", { method: "POST", keepalive: true }).then(
      () => undefined,
      () => undefined,
    ),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, LOGOUT_WAIT_MS)
    }),
  ])
  if (timer !== undefined) clearTimeout(timer)

  const url = getPortalUrl()
  if (url) window.location.assign(url)
}
