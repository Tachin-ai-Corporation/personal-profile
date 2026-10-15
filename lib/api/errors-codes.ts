import { BFF_ERROR_SOURCE, isBffErrorCode, type BffErrorCode } from "@/lib/shared/bff-contract"

/**
 * Error codes `callApi` can report, and the one parser of non-2xx bodies.
 * Two envelopes, never mixed (AD-19):
 *   - BFF: `{ errorCode: "<STRING>", source: "proxy" }` → `errorCode`
 *   - upstream: `{ message, code: <int> }` → `upstreamCode` + `error`
 * Mapping a response to what the UI shows is `lib/api/errors#mapApiError`,
 * the only reader of these codes outside this file and `client.ts`.
 */

/**
 * Codes `mapApiError` derives (`coded` results, AD-19): from an upstream
 * message (area tables), or from a proxy upload refusal (spec F7-2:
 * `UPLOAD_TOO_LARGE` = 413 `TOO_LARGE`, `UPLOAD_UNSUPPORTED_MEDIA` = 415
 * `UNSUPPORTED_MEDIA`; test with `isUploadRejected`). A new member is a
 * foundation change (FOUNDATION.md §1, team ownership rules 3–4): add it here and to
 * `TelemetryErrorCode`, never `switch` exhaustively over it in a feature.
 */
export type DerivedErrorCode =
  | "MFA_NOT_ENABLED"
  | "TOTP_ALREADY_ENABLED"
  | "NPI_ALREADY_REGISTERED"
  | "UPLOAD_TOO_LARGE"
  | "UPLOAD_UNSUPPORTED_MEDIA"

/**
 * Client-side codes on top of the BFF ones: `NETWORK_ERROR` (set by
 * `callApi`), `FORBIDDEN` (an upstream 403) and the derived codes, both named
 * only by `lib/api/errors` (e.g. for the `section_save` telemetry code).
 */
export type ClientErrorCode = "NETWORK_ERROR" | "FORBIDDEN" | DerivedErrorCode

export type ApiErrorCode = BffErrorCode | ClientErrorCode

export interface ParsedError {
  readonly errorCode?: ApiErrorCode
  /** A BFF body's `retryable: false` (launch, D9). */
  readonly retryable?: false
  /** A BFF body's user-safe `message` (launch, D9). */
  readonly userMessage?: string
  readonly upstreamCode?: number
  /** An upstream body's own non-empty `message` (never a fallback, never BFF copy). */
  readonly platformMessage?: string
  readonly error: string
  readonly details?: unknown
  /** The body was a BFF envelope (`source: "proxy"`). */
  readonly fromProxy: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function parseErrorBody(text: string, fallback: string): ParsedError {
  let body: unknown
  try {
    body = text ? JSON.parse(text) : undefined
  } catch {
    return { error: fallback, fromProxy: false }
  }
  if (!isRecord(body)) return { error: fallback, fromProxy: false }

  // A proxy body is the proxy's even with a code this client doesn't know (so an
  // unknown proxy 403 is never "no access"); its `message` is user-safe copy (D9).
  if (body.source === BFF_ERROR_SOURCE) {
    return {
      ...(isBffErrorCode(body.errorCode) ? { errorCode: body.errorCode } : {}),
      error: fallback,
      fromProxy: true,
      ...(typeof body.message === "string" && body.message !== "" ? { userMessage: body.message } : {}),
      ...(body.retryable === false ? { retryable: false } : {}),
    }
  }

  const code = body.code
  const message = typeof body.message === "string" && body.message !== "" ? body.message : undefined
  return {
    upstreamCode: typeof code === "number" && Number.isInteger(code) ? code : undefined,
    ...(message === undefined ? {} : { platformMessage: message }),
    error: message ?? fallback,
    details: body.details,
    fromProxy: false,
  }
}
