/**
 * Error mapping core (Story 1.12, AD-19, D5): the `MappedError` shape, the
 * transport classification shared by every area, and the rule type the area
 * tables use. The UI decides what to show from the `MappedError` kind alone.
 */

import type { MessageKey } from "@/lib/shared/messages"
import type { SectionId } from "@/lib/shared/section-ids"
import type { TelemetryErrorCode } from "@/lib/shared/telemetry"
import type { ApiErrorCode, DerivedErrorCode } from "../errors-codes"
import type { ApiResponse } from "../types"
import type { Field as AccountField } from "./account"
import type { Field as AddressField } from "./addresses"
import type { Field as ContactField } from "./contacts"
import type { Field as InsuranceField } from "./insurance"
import type { Field as MfaField } from "./mfa"
import type { Field as NpiField } from "./npi"
import type { Field as OrgField } from "./orgs"
import type { Field as PersonalField } from "./personal"

/**
 * Where an error is shown: a Section (`lib/shared/section-ids`), an `/account`
 * card or tab, or `page` for page-level reads (e.g. `myself` under the header).
 * Area tables match only for their own scopes.
 */
export type ErrorScope = SectionId | "authenticator" | "provider" | "organizations" | "page"

/** Every field an area table can name; each area declares its own `Field` union. */
export type ErrorField = PersonalField | ContactField | AddressField | InsuranceField | AccountField | MfaField | NpiField | OrgField

export type MappedError =
  /** An upstream 403: the no-access panel (scope per the AD-23 owner table). */
  | { readonly kind: "forbidden" }
  /** Anything else: the generic error with Retry; `message` is the platform's own, only for a 4xx that sent one. */
  | { readonly kind: "generic"; readonly message?: string }
  /** No answer, or the proxy couldn't reach or refresh upstream. */
  | { readonly kind: "network" }
  /** The session ended: the session-expired dialog handles it, the surface shows nothing. */
  | { readonly kind: "session" }
  /** A known upstream rejection of one field: shown at that field with catalog copy. */
  | { readonly kind: "field"; readonly field: ErrorField; readonly messageKey: MessageKey }
  /** A known upstream case the surface handles itself (e.g. refetch, inline notice). */
  | { readonly kind: "coded"; readonly code: DerivedErrorCode }

/** One row of an area's exact-message table: the only way upstream text is matched (AD-19). */
export interface MessageRule<F extends ErrorField = ErrorField> {
  readonly scopes: readonly ErrorScope[]
  /** Anchored (`^…$`): the whole platform message. */
  readonly pattern: RegExp
  readonly result:
    | { readonly kind: "field"; readonly field: F; readonly messageKey: MessageKey }
    | { readonly kind: "coded"; readonly code: DerivedErrorCode }
}

/** Proxy and client codes that mean "couldn't get through", not "the platform said no". */
const NETWORK_CODES: ReadonlySet<ApiErrorCode> = new Set<ApiErrorCode>([
  "NETWORK_ERROR",
  "UPSTREAM_ERROR",
  "UPSTREAM_REDIRECT",
  "REFRESH_UNAVAILABLE",
  "SERVICE_DISABLED",
  "UPSTREAM_TIMEOUT",
])

const FORBIDDEN_STATUS = 403

const isClientErrorStatus = (status: number): boolean => status >= 400 && status < 500

/**
 * The area-independent part of the mapping. A proxy-originated code
 * (`NOT_ALLOWED` included) is never "no access"; only an upstream 403 is.
 * An upstream 4xx with a platform message comes back as `upstream`, for the
 * area tables to recognise.
 */
export function classifyTransport(response: ApiResponse<unknown>): MappedError | { readonly kind: "upstream"; readonly message: string } {
  const { errorCode } = response
  if (errorCode === "SESSION_EXPIRED") return { kind: "session" }
  if (errorCode !== undefined && NETWORK_CODES.has(errorCode)) return { kind: "network" }
  if (errorCode !== undefined || response.source === "proxy") return { kind: "generic" }
  if (response.statusCode === undefined) return { kind: "network" }
  if (response.statusCode === FORBIDDEN_STATUS) return { kind: "forbidden" }
  // Only a 4xx message is meant for the user; 5xx text is raw server output.
  return isClientErrorStatus(response.statusCode) && response.platformMessage !== undefined
    ? { kind: "upstream", message: response.platformMessage }
    : { kind: "generic" }
}

/** A short, PHI-free code for a mapped error (the `section_save` telemetry `code`). */
export function mappedErrorCode(error: MappedError): Exclude<TelemetryErrorCode, "UNEXPECTED"> {
  switch (error.kind) {
    case "forbidden":
      return "FORBIDDEN"
    case "network":
      return "NETWORK_ERROR"
    case "session":
      return "SESSION_EXPIRED"
    case "generic":
      return "GENERIC"
    case "field":
      return "FIELD"
    case "coded":
      return error.code
  }
}
