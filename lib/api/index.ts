/**
 * The client API layer's public surface. Import from `@/lib/api`.
 * Every call is same-origin through `callApi` (AD-19). Each resource module
 * (`myself.ts`, `contact-points.ts`, …) owns its paths and registers its SWR
 * fetcher; importing it from here is what registers it.
 *
 * Every planned resource module already exists and is re-exported below with
 * one `export *` line (spec F6-3), so a story adds code to its own module and
 * never edits this file. A new export name must be unique across modules:
 * TypeScript does not report it. Two `export *` modules exporting one name
 * make it ambiguous (silently not exported), and a name exported explicitly
 * below silently shadows the `export *` one. `planned-modules.test.ts`
 * checks the names are unique.
 */

import { loadContactPoints } from "./contact-points"
import { loadMyself } from "./myself"

export {
  callApi,
  configureApiClient,
  createCallApi,
  getPortalUrl,
  type ApiClientConfig,
  type CallApi,
  type CallApiInit,
} from "./client"
export { activity, createActivity, ACTIVITY_CHANNEL, type Activity, type ActivityListener } from "./activity"
export type { ApiResponse } from "./types"
export {
  parseErrorBody,
  type ApiErrorCode,
  type ClientErrorCode,
  type DerivedErrorCode,
  type ParsedError,
} from "./errors-codes"
export {
  ERROR_RULES,
  FORBIDDEN_SCOPE_TABLE,
  forbiddenScopeFor,
  mapApiError,
  mapFetchError,
  mappedErrorCode,
  normalizeForbiddenPath,
  type ErrorField,
  type ErrorScope,
  type ForbiddenLevel,
  type ForbiddenOwner,
  type ForbiddenPage,
  type ForbiddenScope,
  type ForbiddenScopeRule,
  type MappedError,
  type MessageRule,
} from "./errors"
export { fileDownloadPath, isFileId } from "./files"
export {
  sessionEvents,
  createSessionEvents,
  type SessionEvent,
  type SessionEventListener,
  type SessionEvents,
} from "./session-events"
export {
  keys,
  isSwrKey,
  mutateContactPoints,
  mutateMyself,
  SWR_RESOURCES,
  type SwrKey,
  type SwrResource,
} from "./keys"
export { ApiResponseError, registerFetcher, swrFetcher, unwrap, type SwrLoader } from "./fetcher"
export { proxyPath } from "./config"
export {
  fetchMyself,
  isProctor,
  isTenantMember,
  loadMyself,
  myselfPath,
  toMyself,
  type Myself,
  type MyselfSignature,
  type MyselfTenant,
} from "./myself"
export {
  CONTACT_POINT_TYPES,
  PRIMARY_LABEL,
  contactPointsPath,
  fetchContactPoints,
  findPrimary,
  isContactPointType,
  loadContactPoints,
  primaryPhoneRegion,
  toContactPoints,
  type ContactPoint,
  type ContactPointType,
} from "./contact-points"
export { startSession, endSession, recordUserActivity, type LaunchAttempt } from "./session"
export { logApiCall, redact, type ApiCallLog } from "./log-api-call"

// Planned resource modules (spec F6-3): Team A, then Team B. Importing them registers their loaders.
export * from "./type-keys"
export * from "./personal"
export * from "./profile-picture"
export * from "./addresses"
export * from "./places"
export * from "./insurance"
export * from "./account"
export * from "./mfa"
export * from "./npi"
export * from "./organizations"
export * from "./practice-support"

/**
 * Frozen (spec F6-3): the two loaders the shell already passes to `useSWR`.
 * Do not add entries. A new read registers its loader in its own module
 * (`registerFetcher`) and is read with `useSWR(keys.x())`, which the root
 * `SWRConfig` fetcher dispatches; a typed loader is imported by name
 * (e.g. `loadTypeKey`).
 */
export const fetchers: Readonly<{ myself: typeof loadMyself; contactPoints: typeof loadContactPoints }> = Object.freeze({
  myself: loadMyself,
  contactPoints: loadContactPoints,
})
