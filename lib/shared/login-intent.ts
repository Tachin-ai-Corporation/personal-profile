/**
 * Where to land after a (re)launch (D9, Story 1.7): one sessionStorage key,
 * read-and-remove. Only same-origin relative paths outside `/auth` and `/api`
 * are accepted (as patient-vault `lib/login-intent.ts`).
 */

export const LOGIN_INTENT_KEY = "pp:login-intent"

/** The part of `Storage` this needs (injectable for tests). */
export interface IntentStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function under(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

/** A placeholder origin: only relative paths that stay on it are accepted. */
const BASE = "https://intent.invalid"
const CONTROL = /[\u0000-\u001f\u007f]/

/**
 * The normalized intent (`pathname + search` of the parsed URL), or `null`
 * when it is not a same-origin relative path, contains a control character or
 * backslash, or resolves (after `..` handling) under `/auth` or `/api`.
 */
export function normalizeIntent(path: string): string | null {
  // The URL parser silently drops tabs and newlines, so control characters are rejected first.
  if (!path.startsWith("/") || path.startsWith("//") || CONTROL.test(path)) return null
  // A leading "/" against a valid base always parses; "/\\host" resolves to another origin.
  const url = new URL(path, BASE)
  if (url.origin !== BASE || under(url.pathname, "/auth") || under(url.pathname, "/api")) return null
  return `${url.pathname}${url.search}`
}

export function isValidIntent(path: string): boolean {
  return normalizeIntent(path) !== null
}

function browserStorage(): IntentStorage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.sessionStorage
  } catch {
    return undefined
  }
}

/** Saves `pathname + search` (no fragment) when valid. */
export function saveLoginIntent(path: string, storage: IntentStorage | undefined = browserStorage()): void {
  const clean = normalizeIntent(path)
  if (!storage || clean === null) return
  try {
    storage.setItem(LOGIN_INTENT_KEY, clean)
  } catch {
    // Storage full or blocked: landing on the fallback is fine.
  }
}

/** Reads and removes the intent; returns it only when valid, else `fallback`. */
export function consumeLoginIntent(fallback: string, storage: IntentStorage | undefined = browserStorage()): string {
  if (!storage) return fallback
  let value: string | null = null
  try {
    value = storage.getItem(LOGIN_INTENT_KEY)
    storage.removeItem(LOGIN_INTENT_KEY)
  } catch {
    return fallback
  }
  return (value === null ? null : normalizeIntent(value)) ?? fallback
}

/** Where every (re)launch lands (D9 as amended 2026-10-14). */
export const LAUNCH_LANDING_PATH = "/"

/**
 * Reads and removes the intent for a launch: it is used only when its
 * pathname is `/` (e.g. `/?tab=insurance`); anything else, `/account…`
 * included, lands on `/`.
 */
export function consumeLaunchIntent(storage: IntentStorage | undefined = browserStorage()): string {
  const intent = consumeLoginIntent(LAUNCH_LANDING_PATH, storage)
  return new URL(intent, BASE).pathname === LAUNCH_LANDING_PATH ? intent : LAUNCH_LANDING_PATH
}
