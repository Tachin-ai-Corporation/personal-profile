/**
 * =============================================================================
 * Login intent (D9)
 * =============================================================================
 *
 * The in-app path a user should land on after the next successful launch. It
 * lives in `sessionStorage` under `pp:login-intent` (per tab, never sent to the
 * server). Story 1.7 saves it when a session expires; `/auth` consumes it once
 * after a successful `POST /api/token`.
 *
 * A stored value is used only if it is a same-origin relative path: it starts
 * with `/` (not `//` or `/\`), has no scheme, control character or backslash,
 * and is not under the `/auth` or `/api` path segment. Anything else falls back.
 * Storage faults (private mode, blocked storage) are swallowed.
 * =============================================================================
 */

export const LOGIN_INTENT_KEY = "pp:login-intent"

/** Upper bound on a stored path, so a corrupt value can't grow unbounded. */
const MAX_LENGTH = 2048

/** `true` for a safe same-origin relative path that is not a launch or API path. */
export function isSafeIntent(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_LENGTH) return false
  if (!value.startsWith("/") || value.startsWith("//")) return false
  // Backslashes are treated as slashes by browsers (`/\evil` → `//evil`); control
  // characters can smuggle a scheme past naive checks.
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return false
  let url: URL
  try {
    url = new URL(value, "https://pp.invalid")
  } catch {
    return false
  }
  if (url.origin !== "https://pp.invalid") return false
  // Whole path segments, checked on the normalized path: `/auth`, `/auth/…`,
  // `/api`, `/api/…` (also via `/./auth` or `/x/../api`) are refused, while
  // `/authors` or `/apiary` are not.
  const path = url.pathname.toLowerCase()
  return !/^\/(auth|api)(\/|$)/.test(path)
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage
  } catch {
    return null
  }
}

/** Remember `path` as the post-launch target. An unsafe path is not stored. */
export function saveLoginIntent(path: string): void {
  if (!isSafeIntent(path)) return
  try {
    storage()?.setItem(LOGIN_INTENT_KEY, path)
  } catch {
    // Storage blocked or full: the launch simply lands on the fallback.
  }
}

/**
 * Read and remove the stored intent. Returns it only when it is safe, else
 * `fallback`. The key is removed either way, so an intent is used at most once.
 */
export function consumeLoginIntent(fallback: string): string {
  const store = storage()
  let value: string | null = null
  try {
    value = store?.getItem(LOGIN_INTENT_KEY) ?? null
    store?.removeItem(LOGIN_INTENT_KEY)
  } catch {
    value = null
  }
  return isSafeIntent(value) ? value : fallback
}
