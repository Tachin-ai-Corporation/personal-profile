/**
 * =============================================================================
 * 1health API — public surface
 * =============================================================================
 *
 * One import site for the whole API layer:  import { callApi } from "@/lib/api"
 *
 * `callApi` is the only browser transport (AD-19). Reads go through SWR with
 * keys from `keys.ts` and the shared `fetcher` (AD-10).
 * =============================================================================
 */

// --- Core client -----------------------------------------------------------
export { callApi, configureClient, getPortalUrl, ok, err, ApiError, type ApiResponse } from "./client"
// `publish` is deliberately not re-exported: only `callApi` publishes (AD-19).
export { subscribe, type SessionEvent } from "./session-events"

// --- SWR -------------------------------------------------------------------
export { keys, type SwrKey } from "./keys"
export { fetcher } from "./fetcher"

// --- Resources -------------------------------------------------------------
export { fetchMyself, type Myself } from "./user"

// --- App config ------------------------------------------------------------
export { endpoints, RECORD_TYPES, TYPE_REST_PATH, ATTRIBUTES } from "./config"
