import { startSession, type LaunchAttempt } from "@/lib/api"
import type { Environment } from "@/lib/shared/environments"
import { LAUNCH_MESSAGES } from "@/lib/shared/messages"

/** D9, as patient-vault: at most 5 attempts, a fixed 1.5 s apart (no backoff). */
export const MAX_AUTH_ATTEMPTS = 5
export const AUTH_RETRY_DELAY_MS = 1500

export type LaunchFlowResult =
  | { readonly kind: "ok"; readonly environment: Environment }
  | { readonly kind: "error"; readonly title: string; readonly message: string }

export interface LaunchFlowDeps {
  readonly attempt?: (lpl: string) => Promise<LaunchAttempt>
  readonly sleep?: (ms: number) => Promise<void>
  /** Called before each attempt with its 1-based number. */
  readonly onAttempt?: (attempt: number) => void
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Space → `+` (a `+` in a query string arrives as a space). */
export function normalizeLpl(value: string): string {
  return value.trim().replace(/ /g, "+")
}

/**
 * Runs the launch: retries on a non-OK answer (unless `retryable: false`), on
 * an OK answer without success and on a network error. The error is the last
 * attempt's, never raw codes or upstream text.
 */
export async function runLaunchFlow(lpl: string, deps: LaunchFlowDeps = {}): Promise<LaunchFlowResult> {
  const attempt = deps.attempt ?? startSession
  const sleep = deps.sleep ?? wait
  let last: LaunchFlowResult = { kind: "error", title: LAUNCH_MESSAGES.failedTitle, message: LAUNCH_MESSAGES.failedFallback }

  for (let n = 1; n <= MAX_AUTH_ATTEMPTS; n++) {
    deps.onAttempt?.(n)
    const result = await attempt(lpl)
    if (result.kind === "ok") return result
    if (result.kind === "network") {
      last = { kind: "error", title: LAUNCH_MESSAGES.connectionTitle, message: LAUNCH_MESSAGES.connectionBody }
    } else {
      last = { kind: "error", title: LAUNCH_MESSAGES.failedTitle, message: result.message ?? LAUNCH_MESSAGES.failedFallback }
      if (!result.retryable) return last
    }
    if (n < MAX_AUTH_ATTEMPTS) await sleep(AUTH_RETRY_DELAY_MS)
  }
  return last
}
