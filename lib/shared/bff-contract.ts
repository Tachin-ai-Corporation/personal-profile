/**
 * The wire contract between the browser (`lib/api`) and the BFF (`lib/server`,
 * `app/api`). Both sides import these names so they can never drift.
 */

import type { Environment } from "./environments"

/** Every error the BFF itself produces (never an upstream error). No CSRF or session-change codes (D5). */
export const BFF_ERROR_CODES = [
  "BAD_PATH",
  "BAD_QUERY",
  "BAD_BODY",
  "NOT_ALLOWED",
  "METHOD_NOT_ALLOWED",
  "TOO_LARGE",
  "UNSUPPORTED_MEDIA",
  "TOKEN_EXPIRED",
  "SESSION_EXPIRED",
  "UPSTREAM_REDIRECT",
  "UPSTREAM_ERROR",
  "UPSTREAM_TIMEOUT",
  "REFRESH_UNAVAILABLE",
  "SERVICE_DISABLED",
  "INTERNAL_ERROR",
  "LAUNCH_INVALID",
  "LAUNCH_EXPIRED",
  "LAUNCH_USED",
  "LAUNCH_CONFIG",
  "WRONG_TENANT",
  /** Organization logo route (Story 10.2): any failure → 404. */
  "NO_LOGO",
  /** Practice support route (Story 9.3): no practice NPI organization → 404. */
  "NO_PRACTICE",
] as const

export type BffErrorCode = (typeof BFF_ERROR_CODES)[number]

/** Marks a BFF-originated error body, so it is never confused with an upstream one. */
export const BFF_ERROR_SOURCE = "proxy"

export interface BffErrorBody {
  readonly errorCode: BffErrorCode
  readonly source: typeof BFF_ERROR_SOURCE
}

export function isBffErrorCode(value: unknown): value is BffErrorCode {
  return typeof value === "string" && (BFF_ERROR_CODES as readonly string[]).includes(value)
}

/** Same-origin paths of the BFF. */
export const BFF_PATHS = {
  proxyPrefix: "/api/1h/",
  token: "/api/token",
  sessionRefresh: "/api/session/refresh",
  sessionLogout: "/api/session/logout",
  sessionPing: "/api/session/ping",
  /** Named operations (F2): session-scoped server work the proxy cannot express. */
  profilePictureId: "/api/pp/profile-picture-id",
  mfaValidate: "/api/pp/mfa/validate",
  practiceSupport: "/api/pp/practice-support",
  /** `GET <orgLogoPrefix><tenantId>`, used as an `<img src>`. */
  orgLogoPrefix: "/api/pp/org-logo/",
  placesAutocomplete: "/api/places/autocomplete",
  placesDetails: "/api/places/details",
} as const

/** `GET /api/pp/profile-picture-id` (Story 1.9). */
export interface ProfilePictureIdBody {
  readonly fileId: number | null
}

/** `POST /api/pp/mfa/validate` request (Story 8.2); the answer is the upstream boolean. */
export interface MfaValidateRequest {
  readonly code: string
}

/** `GET /api/pp/practice-support` (Story 9.3, AD-25): the practice's support contact, nothing else. */
export interface PracticeSupportBody {
  readonly name?: string
  readonly phone?: string
  readonly phoneRegion?: string
  readonly email?: string
}

/** `POST /api/places/autocomplete` request (Story 4.3). */
export interface PlacesAutocompleteRequest {
  readonly input: string
  readonly countryCode: string
  /** A UUID v4 the client makes per address lookup and reuses until its details call (Places session). */
  readonly lookupId: string
}

export interface PlaceSuggestion {
  readonly placeId: string
  readonly mainText: string
  readonly secondaryText: string
  /** Matched ranges of `mainText` (UTF-16 offsets, end exclusive). */
  readonly matches: readonly { readonly start: number; readonly end: number }[]
}

export type PlacesAutocompleteBody =
  | { readonly enabled: false; readonly suggestions: readonly [] }
  | { readonly enabled: true; readonly suggestions: readonly PlaceSuggestion[] }

/** `POST /api/places/details` request. */
export interface PlacesDetailsRequest {
  readonly placeId: string
  /** The `lookupId` of the autocomplete calls this pick ends. */
  readonly lookupId: string
}

/** A normalized address; a part Google did not return is `""`. */
export interface PlaceAddress {
  readonly addressLine1: string
  readonly cityName: string
  readonly county: string
  readonly stateName: string
  readonly postalCode: string
  readonly countryCode: string
  readonly country: string
  readonly fullAddress: string
  /** Street number + route, city, postal code and country are all present. */
  readonly complete: boolean
}

export type PlacesDetailsBody = { readonly enabled: false } | ({ readonly enabled: true } & PlaceAddress)

/**
 * User activity (AD-16, RC6). `callApi` sends `X-PP-Activity: user` on
 * user-initiated calls; a response that re-sealed `lastSeen` echoes it as
 * `X-PP-Activity-At: <epoch ms>`.
 */
export const ACTIVITY_HEADER = "X-PP-Activity"
export const ACTIVITY_USER = "user"
export const ACTIVITY_AT_HEADER = "X-PP-Activity-At"

/** What a page embeds for the idle warning (Story 1.6). Times are epoch ms, server time. */
export interface PageIdleTiming {
  /** The server idle limit in seconds (900). */
  readonly idleTimeoutSec: number
  /** The session's `lastSeen` when the page rendered. */
  readonly lastSeen: number
  /** `iat + ABSOLUTE_TIMEOUT_MS`. */
  readonly absoluteExpiresAt: number
  /** The server's clock when the page rendered. */
  readonly serverNow: number
}

/** `POST /api/token` success: the session cookie is set. Nothing else is in the body (D2). */
export interface LaunchOkBody {
  readonly ok: true
  readonly environment: Environment
}

/** `POST /api/token` failure (D9): a user-safe `message`, never upstream text. */
export interface LaunchErrorBody extends BffErrorBody {
  readonly ok: false
  readonly message: string
  /** `false` stops the client's retries at once. Absent = retryable. */
  readonly retryable?: false
}
