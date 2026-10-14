/**
 * Seams that run before the app is left (Story 1.7). Story 1.15 plugs
 * `drafts.purgeUser` into `onBeforeExit` and the draft writer into
 * `onBeforeSessionExpired`; until then both lists are empty.
 */

export type ExitCallback = () => void

const beforeExit = new Set<ExitCallback>()
const beforeSessionExpired = new Set<ExitCallback>()

function add(set: Set<ExitCallback>, callback: ExitCallback): () => void {
  set.add(callback)
  return () => {
    set.delete(callback)
  }
}

/** Runs every callback; a failing one never blocks the others or the caller. */
function runAll(set: Set<ExitCallback>): void {
  for (const callback of [...set]) {
    try {
      callback()
    } catch (error) {
      console.error("[shell] exit callback failed", error)
    }
  }
}

/** Runs before "Return to 1health" logs out (not before a hand-off). */
export function onBeforeExit(callback: ExitCallback): () => void {
  return add(beforeExit, callback)
}

/** Runs, synchronously, before the session-expired dialog opens. */
export function onBeforeSessionExpired(callback: ExitCallback): () => void {
  return add(beforeSessionExpired, callback)
}

export function runBeforeExit(): void {
  runAll(beforeExit)
}

export function runBeforeSessionExpired(): void {
  runAll(beforeSessionExpired)
}
