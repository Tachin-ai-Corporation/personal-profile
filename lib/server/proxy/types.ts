import "server-only"

import type { z } from "zod"

/** Methods the proxy can forward. HEAD, OPTIONS and TRACE are never honored. */
export type ProxyMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

export const PROXY_METHODS: readonly ProxyMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"]

/** One allowed query parameter: decoded name → value pattern. */
export interface QueryParamRule {
  readonly pattern: RegExp
  /** The parameter may appear more than once (e.g. `type=Email&type=Mobile`). */
  readonly repeatable?: true
}

/**
 * One allowlisted upstream endpoint, keyed by METHOD + template (AD-2).
 *
 * Template segments are literals, `{personId}`/`{userId}` (owner ids filled
 * from the session; the client sends `me`), or `{name}` (an id matching
 * `^\d{1,19}$`). Templates are relative to the upstream `/api`.
 */
export interface AllowlistEntry {
  readonly method: ProxyMethod
  readonly template: string
  /** Allowed client query params. Anything else → 400 `BAD_QUERY`. */
  readonly query?: Readonly<Record<string, QueryParamRule>>
  /** Server-fixed params; client values for these names are ignored. */
  readonly fixedQuery?: Readonly<Record<string, string>>
  /** JSON body schema. Entries without one accept no body. */
  readonly body?: z.ZodType
  /** Body size cap in bytes (default 64 KB). */
  readonly maxBytes?: number
  /** Image download entry: `preview=true` is forced server-side. */
  readonly asImage?: true
  /** Profile-module entry: switched off by `ACCOUNT_DISABLED` (Story 7.2 consumes the tag). */
  readonly profile?: true
}

/** A deny rule: `*` = any method; a template ending in `/**` is a prefix match; `<n>` = `^\d{1,19}$`. */
export interface DenyRule {
  readonly method: ProxyMethod | "*"
  readonly template: string
}
