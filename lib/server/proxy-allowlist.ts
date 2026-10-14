import "server-only"

/**
 * =============================================================================
 * Proxy allowlist (AD-2)
 * =============================================================================
 *
 * Every endpoint the browser may reach through `/api/1h/*` is one entry here.
 * Nothing that is not listed is ever proxied. Each later story adds its own entry
 * BESIDE the code that uses it; this story ships exactly one: `GET /v2/user/myself`.
 *
 * Templates are relative to the upstream `/api` prefix, so the browser's
 * `/api/1h/v2/user/myself` maps to `<API_ORIGIN>/api/v2/user/myself`.
 *
 * A template segment is one of:
 *   - a literal (compared exactly, case-sensitively);
 *   - `{personId}` / `{userId}` — an OWNER position: the client must send the
 *     literal segment `me` and the proxy substitutes the id from the session;
 *   - any other `{name}` — an ID position: must match `^\d{1,19}$`.
 * =============================================================================
 */

/** HTTP methods the proxy handles (owner/body rules differ per method via entries). */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

/**
 * A query-parameter rule. `client` params are optional and, when present, their
 * value must match `pattern`. `server` params are fixed by the server and any
 * client-sent value is ignored (e.g. `isPublic`, `hardDelete`).
 */
export type QueryRule =
  | { kind: "client"; pattern: RegExp }
  | { kind: "server"; value: string }

/** How the request body is treated for this entry. */
export type BodyMode = "none" | "json"

/** One allowlisted endpoint (AD-2). Keyed by `METHOD + template`. */
export interface AllowlistEntry {
  method: HttpMethod
  /** Path template relative to upstream `/api`, e.g. `/v2/person/{personId}/ssn/expose`. */
  template: string
  /** Allowed query params by name; everything else → `BAD_QUERY`. */
  query: Record<string, QueryRule>
  /** Request-body handling; a `json` entry rejects a non-JSON `Content-Type` (415). */
  body: BodyMode
  /** Upload byte cap (later stories); unused by this story's entries. */
  maxBytes?: number
  /** When true, a GET without `X-PP-Session` is allowed (image `<img src>` loads). */
  asImage?: boolean
}

/** A parsed template segment. */
export type TemplateSegment =
  | { type: "literal"; value: string }
  | { type: "owner"; key: "personId" | "userId" }
  | { type: "id"; name: string }

/** A non-owner id segment must be 1–19 digits (fits a 64-bit id). */
export const ID_SEGMENT = /^\d{1,19}$/

/** Split a template into typed segments. Leading slash is dropped. */
export function parseTemplate(template: string): TemplateSegment[] {
  const parts = template.split("/").filter((s) => s.length > 0)
  return parts.map((part) => {
    if (part === "{personId}") return { type: "owner", key: "personId" }
    if (part === "{userId}") return { type: "owner", key: "userId" }
    if (part.startsWith("{") && part.endsWith("}")) {
      return { type: "id", name: part.slice(1, -1) }
    }
    return { type: "literal", value: part }
  })
}

/**
 * Does a template STRUCTURALLY match a concrete path? Segment counts must be
 * equal, every literal must match exactly, and placeholder positions accept any
 * value here — owner `me` and id-shape are validated separately, AFTER the entry
 * is selected, so that owner spoofs and bad ids map to `NOT_ALLOWED` rather than
 * changing which entry (or method) matched.
 */
function structurallyMatches(segments: TemplateSegment[], pathSegments: string[]): boolean {
  if (segments.length !== pathSegments.length) return false
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (seg.type === "literal" && seg.value !== pathSegments[i]) return false
  }
  return true
}

export type MatchResult =
  | { kind: "match"; entry: AllowlistEntry; segments: TemplateSegment[] }
  | { kind: "wrong-method" }
  | { kind: "none" }

/**
 * Find the allowlist entry for `method` + `pathSegments`.
 *   - `match`         — a template structurally matches under this method.
 *   - `wrong-method`  — a template matches the path shape but under other methods only (→ 405).
 *   - `none`          — no template matches the shape at all (→ 403 NOT_ALLOWED).
 */
export function findMatch(
  allowlist: readonly AllowlistEntry[],
  method: string,
  pathSegments: string[],
): MatchResult {
  let shapeMatchedOtherMethod = false
  for (const entry of allowlist) {
    const segments = parseTemplate(entry.template)
    if (!structurallyMatches(segments, pathSegments)) continue
    if (entry.method === method) return { kind: "match", entry, segments }
    shapeMatchedOtherMethod = true
  }
  return shapeMatchedOtherMethod ? { kind: "wrong-method" } : { kind: "none" }
}

/**
 * Prefixes that are NEVER proxied, independent of the allowlist (AD-2): the OAuth
 * surface, the public External Application endpoints, any GraphQL path, and any
 * admin prefix. They would miss the allowlist anyway; denying them explicitly
 * documents the intent and keeps them `NOT_ALLOWED` even if an entry is ever
 * mis-added.
 */
export function isDeniedPath(pathSegments: string[]): boolean {
  if (pathSegments.length === 0) return true
  const lower = pathSegments.map((s) => s.toLowerCase())
  if (lower[0] === "auth") return true
  if (lower.includes("admin")) return true
  if (lower.some((s) => s.includes("graphql"))) return true
  if (lower[0] === "v2" && lower[1] === "public" && lower[2] === "external-application") return true
  return false
}

/** The shipped allowlist — exactly one entry this story (AD-2). */
export const ALLOWLIST: readonly AllowlistEntry[] = [
  { method: "GET", template: "/v2/user/myself", query: {}, body: "none" },
]
