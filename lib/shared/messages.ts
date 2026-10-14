/**
 * =============================================================================
 * Copy catalog — launch-error screen (FR-1)
 * =============================================================================
 *
 * All launch-error strings live here (no copy in components). Strings that are
 * locked in EXPERIENCE.md are final; the rest are marked `// DRAFT COPY` for PM
 * review. The raw `reason` is never rendered — only the mapped copy below.
 * =============================================================================
 */

/** The launch-error reasons the screen understands. */
export type LaunchErrorReason = "expired" | "used" | "invalid" | "tenant" | "cookies" | "config" | "disabled"

/** How the primary action behaves. */
export type LaunchErrorAction =
  /** Opens `PORTAL_URL`; same-tab when top-level, new-tab when framed. */
  | "return"
  /** Always opens `PORTAL_URL` in a new tab (the framed-cookie fallback). */
  | "new-tab"

export interface LaunchErrorCopy {
  title: string
  body: string
  actionLabel: string
  action: LaunchErrorAction
}

/**
 * The reason → copy map. `expired`, `used` and `invalid` all render the same
 * "This link has expired" variant (unknown/missing reasons map to `invalid`).
 */
export const LAUNCH_ERROR_COPY: Record<LaunchErrorReason, LaunchErrorCopy> = {
  // Locked in EXPERIENCE.md.
  invalid: {
    title: "This link has expired",
    body: "Open Personal Profile again from 1health.",
    actionLabel: "Return to 1health",
    action: "return",
  },
  expired: {
    title: "This link has expired",
    body: "Open Personal Profile again from 1health.",
    actionLabel: "Return to 1health",
    action: "return",
  },
  used: {
    title: "This link has expired",
    body: "Open Personal Profile again from 1health.",
    actionLabel: "Return to 1health",
    action: "return",
  },
  tenant: {
    // DRAFT COPY — tenant title is not locked in EXPERIENCE.md (PM review).
    title: "Switch to your personal account",
    // Locked in AD-6 / epics.
    body: "Personal Profile is available in your personal account. Switch to it in 1health and open the app again.",
    actionLabel: "Return to 1health",
    action: "return",
  },
  cookies: {
    // DRAFT COPY — cookies title/body are not locked in EXPERIENCE.md (PM review).
    title: "Open Personal Profile in a new tab",
    // DRAFT COPY
    body: "Your browser blocked the sign-in inside 1health. Open Personal Profile in a new tab to continue.",
    actionLabel: "Open in a new tab",
    action: "new-tab",
  },
  config: {
    // DRAFT COPY — config/disabled copy is not locked in EXPERIENCE.md (PM review).
    title: "Personal Profile is unavailable right now",
    // DRAFT COPY
    body: "Use your profile in 1health for now.",
    actionLabel: "Return to 1health",
    action: "return",
  },
  disabled: {
    // DRAFT COPY — config/disabled copy is not locked in EXPERIENCE.md (PM review).
    title: "Personal Profile is unavailable right now",
    // DRAFT COPY
    body: "Use your profile in 1health for now.",
    actionLabel: "Return to 1health",
    action: "return",
  },
}

/** Map a raw `reason` query value to a known reason; unknown/missing → `invalid`. */
export function normalizeLaunchErrorReason(reason: string | undefined | null): LaunchErrorReason {
  // Own-property check only: `"__proto__" in obj` is true, so `in` would let
  // `?reason=__proto__` (or `constructor`) slip past and resolve to a non-copy.
  if (reason && Object.prototype.hasOwnProperty.call(LAUNCH_ERROR_COPY, reason)) {
    return reason as LaunchErrorReason
  }
  return "invalid"
}
