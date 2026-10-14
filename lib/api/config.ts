/**
 * =============================================================================
 * 1health API — endpoint paths & app configuration
 * =============================================================================
 *
 * Two app-specific lookup tables plus the endpoint path registry.
 *
 * The dead template endpoint builders (query/grid/workflow/journey/…) were
 * removed in Story 1.1. Real `/api/1h/...` paths are added per story from 1.3
 * onward, each alongside its proxy allowlist entry (AD-2). `endpoints` is left
 * empty for now.
 * =============================================================================
 */

/**
 * Data-object-type name keys (PascalCase strings — NOT GUIDs) this app queries.
 * Fill in per app as Sections are built.
 */
export const RECORD_TYPES = {
  // person: "Person",
} as const

/**
 * The REST resource path for a type often differs from its query/GraphQL key.
 * Keep the mapping explicit rather than assuming `key === path segment`.
 */
export const TYPE_REST_PATH: Record<string, string> = {
  // WorkflowTemplate: "/api/v2/journey",
}

/**
 * Schema attribute-name registry. Attribute keys are plain strings and safe to
 * hardcode (unlike step-field GUIDs, which differ per environment/tenant). Fill
 * in per app as Sections are built.
 *
 * @example
 * export const ATTRIBUTES = {
 *   Person: { id: "id", firstName: "firstName", birthDate: "birthDate" },
 * } as const
 */
export const ATTRIBUTES: Record<string, Record<string, string>> = {
  // Fill in per app.
}

// ============================================================================
// Endpoint path builders
// ============================================================================

/**
 * Same-origin `/api/...` path builders. Real paths return per story from 1.3,
 * each added together with its proxy allowlist entry (AD-2).
 */
export const endpoints = {} as const
