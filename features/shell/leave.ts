/**
 * `requestLeave()`: the single gate before any leaving action (Stories 1.7,
 * 1.13). Only `navigate()` calls it. It resolves `true` at once while no
 * leave guard is set; the leave guard registers itself with `setLeaveGuard`.
 */

export type LeaveGuard = () => Promise<boolean>

let guard: LeaveGuard | null = null
let unloadConfirmed = false
let exiting = false
let resetTimer: ReturnType<typeof setTimeout> | undefined

/**
 * How long a confirmed exit keeps `beforeunload` quiet (and the exit latch
 * shut). The browser fires `beforeunload` as soon as the navigation starts, so
 * this only matters when the navigation doesn't unload the page (blocked,
 * a 204 or a download).
 */
export const UNLOAD_CONFIRM_MS = 1000

/** Sets the guard; the returned function clears it (only if it is still the one set). */
export function setLeaveGuard(next: LeaveGuard): () => void {
  guard = next
  return () => {
    if (guard === next) guard = null
  }
}

/** `true` when the move may proceed. */
export function requestLeave(): Promise<boolean> {
  return guard ? guard() : Promise.resolve(true)
}

function resetExit(): void {
  unloadConfirmed = false
  exiting = false
  clearTimeout(resetTimer)
  resetTimer = undefined
  window.removeEventListener("pageshow", resetExit)
}

/**
 * Called right before an exit the app already confirmed, so `beforeunload`
 * stays quiet. Reset after `UNLOAD_CONFIRM_MS`, or on `pageshow` (a Back into
 * this page from the bfcache).
 */
export function confirmUnload(): void {
  unloadConfirmed = true
  clearTimeout(resetTimer)
  resetTimer = setTimeout(resetExit, UNLOAD_CONFIRM_MS)
  window.addEventListener("pageshow", resetExit)
}

/** The external-exit latch: `false` while another exit is already in flight. */
export function beginExit(): boolean {
  if (exiting) return false
  exiting = true
  return true
}

/** Releases the latch when an exit was refused. */
export function cancelExit(): void {
  exiting = false
}

export function isUnloadConfirmed(): boolean {
  return unloadConfirmed
}

/** Test hook. */
export function resetLeaveState(): void {
  guard = null
  resetExit()
}
