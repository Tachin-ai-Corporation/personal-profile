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

/** Image kinds an upload entry may accept, recognised by their leading bytes. */
export type UploadImageType = "png" | "jpeg" | "bmp"

/**
 * Upload entry (AD-13): `multipart/form-data` with exactly one file part
 * named `part`, whose leading bytes are one of `types`. The file is capped at
 * the entry's `maxBytes`, the whole request at `maxBytes + 16 KiB`.
 */
export interface UploadSpec {
  readonly part: "file" | "fileNewVersion"
  readonly types: readonly UploadImageType[]
}

interface BaseAllowlistEntry {
  readonly method: ProxyMethod
  readonly template: string
  /** Allowed client query params. Anything else → 400 `BAD_QUERY`. */
  readonly query?: Readonly<Record<string, QueryParamRule>>
  /** Server-fixed params; client values for these names are ignored. */
  readonly fixedQuery?: Readonly<Record<string, string>>
  /** JSON body schema. Entries without one (and without `upload`) accept no body. */
  readonly body?: z.ZodType
  /** Image download entry: `preview=true` is forced server-side and the bytes decide `inline` (AD-13). */
  readonly asImage?: true
  /** Profile-module entry: switched off by `ACCOUNT_DISABLED` (Story 7.2 consumes the tag). */
  readonly profile?: true
}

/**
 * One allowlisted upstream endpoint, keyed by METHOD + template (AD-2).
 *
 * Template segments are literals, `{personId}`/`{userId}` (owner ids filled
 * from the session; the client sends `me`), or `{name}` (an id matching
 * `^\d{1,19}$`). Templates are relative to the upstream `/api`.
 * An upload entry must name its file cap (`maxBytes`).
 */
export type AllowlistEntry = BaseAllowlistEntry &
  (
    | {
        readonly upload?: undefined
        /** JSON body cap in bytes (default 64 KB). */
        readonly maxBytes?: number
      }
    | {
        readonly upload: UploadSpec
        /** File cap in bytes; the request may carry 16 KiB of multipart overhead on top. */
        readonly maxBytes: number
      }
  )

/** A deny rule: `*` = any method; a template ending in `/**` is a prefix match; `<n>` = `^\d{1,19}$`. */
export interface DenyRule {
  readonly method: ProxyMethod | "*"
  readonly template: string
}
