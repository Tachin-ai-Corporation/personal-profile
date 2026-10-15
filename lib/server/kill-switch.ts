import "server-only"

import type { ServerEnv } from "@/lib/server/env"

/**
 * The kill switches (AD-20, Stories 1.16 and 7.2), matched once in root
 * `proxy.ts` so every route added later under these paths inherits them.
 * Route handlers keep their own check as a second layer.
 *
 * - `"pp"`: off with `PP_DISABLED=1`.
 * - `"account"`: off with `PP_DISABLED=1` or `ACCOUNT_DISABLED=1`.
 *
 * Never switched here: `/api/session/logout` (users can always sign out) and
 * `/api/token` (it answers `PP_DISABLED` in its own launch envelope).
 */
export type KillSwitch = "pp" | "account"

/** Segment-prefix matches: `/account` covers `/account` and `/account/x`, never `/accounts`. */
const ACCOUNT_PREFIXES = ["/account", "/handoff", "/api/pp/mfa", "/api/pp/org-logo", "/api/pp/practice-support"]
const PP_PREFIXES = ["/auth", "/account", "/handoff", "/api/1h", "/api/pp", "/api/places", "/api/session/refresh", "/api/session/ping"]

/** Decoded (when decodable), duplicate slashes collapsed, trailing slashes stripped. Used for matching and for the JSON-vs-page choice. */
export function normalizePath(pathname: string): string {
  let path = pathname
  try {
    path = decodeURIComponent(pathname)
  } catch {
    // Not decodable: matched as sent (Next would not route it to a page either).
  }
  path = path.replace(/\/{2,}/g, "/")
  return path.length > 1 ? path.replace(/\/+$/, "") : path
}

function under(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

/** The switch that governs `pathname`, or `null`. `/` is an exact match (it is a page, not a prefix). */
export function killSwitchFor(pathname: string): KillSwitch | null {
  const path = normalizePath(pathname)
  if (under(path, ACCOUNT_PREFIXES)) return "account"
  if (path === "/" || under(path, PP_PREFIXES)) return "pp"
  return null
}

/** Whether `killSwitch` is currently on. */
export function isSwitchedOff(killSwitch: KillSwitch, env: Pick<ServerEnv, "PP_DISABLED" | "ACCOUNT_DISABLED">): boolean {
  return env.PP_DISABLED || (killSwitch === "account" && env.ACCOUNT_DISABLED)
}
