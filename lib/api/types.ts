import type { ApiErrorCode } from "./errors-codes"

/**
 * The result envelope of every `lib/api` call (AD-19). `callApi` never throws:
 * failures are `success: false` with the parsed codes.
 */
export interface ApiResponse<T> {
  readonly success: boolean
  readonly data?: T
  /** Human-readable error (the platform `message` for upstream errors). */
  readonly error?: string
  /** HTTP status; absent for network failures. */
  readonly statusCode?: number
  /** BFF string code, or a client code like `NETWORK_ERROR`. */
  readonly errorCode?: ApiErrorCode
  /** The error body was the BFF's own envelope (`source: "proxy"`), known code or not. */
  readonly source?: "proxy"
  /** Backend integer `code` of an upstream error. */
  readonly upstreamCode?: number
  /** The upstream body's own `message`, when it had one (shown for action errors by `mapApiError`). */
  readonly platformMessage?: string
  /** Backend field details of an upstream error. */
  readonly details?: unknown
  /** A BFF error marked not worth retrying (`/api/token`, D9). */
  readonly retryable?: false
  /** A BFF error's user-safe `message` (`/api/token`, D9); never upstream text. */
  readonly userMessage?: string
}
