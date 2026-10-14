/**
 * The client API layer's public surface. Import from `@/lib/api`.
 * Every call is same-origin through `callApi` (AD-19).
 */

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
export { parseErrorBody, type ApiErrorCode, type ClientErrorCode, type ParsedError } from "./errors-codes"
export { mapApiError, mapFetchError, type MappedError } from "./errors"
export {
  sessionEvents,
  createSessionEvents,
  type SessionEvent,
  type SessionEventListener,
  type SessionEvents,
} from "./session-events"
export { keys, isSwrKey, type SwrKey } from "./keys"
export { ApiResponseError, fetchers, swrFetcher, unwrap } from "./fetcher"
export { endpoints } from "./config"
export { fetchMyself, toMyself, type Myself } from "./user"
export {
  CONTACT_POINT_TYPES,
  PRIMARY_LABEL,
  fetchContactPoints,
  findPrimary,
  isContactPointType,
  toContactPoints,
  type ContactPoint,
  type ContactPointType,
} from "./contact-points"
export { startSession, endSession, recordUserActivity, type LaunchAttempt } from "./session"
export { logApiCall, redact, type ApiCallLog } from "./log-api-call"
