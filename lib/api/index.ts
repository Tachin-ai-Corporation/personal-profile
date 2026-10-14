/**
 * The client API layer's public surface. Import from `@/lib/api`.
 * Every call is same-origin through `callApi` (AD-19). Each resource module
 * (`myself.ts`, `contact-points.ts`, …) owns its paths and registers its SWR
 * fetcher; importing it from here is what registers it.
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
  type ForbiddenScope,
  type ForbiddenScopeRule,
  type MappedError,
  type MessageRule,
} from "./errors"
export { fileDownloadPath } from "./files"
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

/** Typed loaders, one per registered key family. Hooks pass these to `useSWR`. */
export const fetchers = {
  myself: loadMyself,
  contactPoints: loadContactPoints,
} as const
