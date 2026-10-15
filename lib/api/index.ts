/**
 * The client API layer's public surface. Import from `@/lib/api`.
 * Every call is same-origin through `callApi` (AD-19). Each resource module
 * (`myself.ts`, `contact-points.ts`, …) owns its paths and registers its SWR
 * fetcher; importing it from here is what registers it.
 *
 * Every module is re-exported below with one `export * from "./x"` line
 * (specs F6-3, F7-2), except the three infrastructure modules exported by
 * name, so a story adds code to its own module (and its own test) and never
 * edits this file. A new export name must be unique across modules and, when
 * generic, carry its area's prefix (`addressesListPath`, not `listPath`):
 * TypeScript does not always report a clash. Two `export *` modules exporting
 * one name make it ambiguous (silently not exported), and a name exported by
 * name below silently shadows the `export *` one. `planned-modules.test.ts`
 * checks both rules.
 */

import { loadContactPoints } from "./contact-points"
import { loadMyself } from "./myself"

// Infrastructure modules with test seams or internals: exported by name (frozen list, spec F7-2).
export {
  callApi,
  configureApiClient,
  createCallApi,
  getPortalUrl,
  type ApiClientConfig,
  type CallApi,
  type CallApiInit,
} from "./client"
export { ApiResponseError, registerFetcher, swrFetcher, unwrap, type SwrLoader } from "./fetcher"
export { logApiCall, redact, type ApiCallLog } from "./log-api-call"

// Every other module: one `export *` line each (spec F7-2), so a story adds code to its module and never edits this file.
export * from "./activity"
export * from "./types"
export * from "./errors-codes"
export * from "./errors"
export * from "./files"
export * from "./session-events"
export * from "./keys"
export * from "./config"
export * from "./myself"
export * from "./contact-points"
export * from "./session"

// Planned resource modules (spec F6-3, F7-2): Team A, then Team B. Importing them registers their loaders.
export * from "./type-keys"
export * from "./personal"
export * from "./profile-picture"
export * from "./contacts"
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
