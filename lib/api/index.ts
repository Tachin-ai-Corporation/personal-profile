/**
 * =============================================================================
 * 1health API — public surface
 * =============================================================================
 *
 * One import site for the whole API layer:  import { callApi } from "@/lib/api"
 *
 * The generic template engines (query/grid/workflow/custom-data/…) and the
 * legacy auth client were removed in Story 1.1. Real resource modules and their
 * allowlisted paths return per story from 1.3 onward.
 * =============================================================================
 */

// --- Core client -----------------------------------------------------------
export { callApi, callApiRaw, ok, err, type ApiResponse } from "./client"

// --- App config ------------------------------------------------------------
export { endpoints, RECORD_TYPES, TYPE_REST_PATH, ATTRIBUTES } from "./config"
