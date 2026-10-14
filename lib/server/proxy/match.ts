import "server-only"

import type { AllowlistEntry, ProxyMethod, QueryParamRule } from "./types"

/** Owner placeholders are filled from the session; the client must send `me`. */
const OWNER_PLACEHOLDERS: Readonly<Record<string, "personId" | "userId">> = {
  "{personId}": "personId",
  "{userId}": "userId",
}
export const OWNER_SEGMENT = "me"
const NUMERIC_ID = /^\d{1,19}$/

export interface OwnerIds {
  readonly personId: number
  readonly userId: number
}

export type MatchResult =
  | { readonly kind: "matched"; readonly entry: AllowlistEntry }
  /** A known template, another method → 405. */
  | { readonly kind: "method-not-allowed" }
  | { readonly kind: "not-allowed" }

function isPlaceholder(part: string): boolean {
  return part.startsWith("{") && part.endsWith("}")
}

function shapeMatches(template: string, segments: readonly string[]): boolean {
  const parts = template.split("/")
  if (parts.length !== segments.length) return false
  return parts.every((part, i) => {
    const segment = segments[i]
    if (part in OWNER_PLACEHOLDERS) return segment === OWNER_SEGMENT
    if (isPlaceholder(part)) return NUMERIC_ID.test(segment)
    return part === segment
  })
}

/** Exact METHOD + template match; literals compare case-sensitively. */
export function matchEntry(
  allowlist: readonly AllowlistEntry[],
  method: ProxyMethod,
  segments: readonly string[],
): MatchResult {
  const shaped = allowlist.filter((entry) => shapeMatches(entry.template, segments))
  const entry = shaped.find((candidate) => candidate.method === method)
  if (entry) return { kind: "matched", entry }
  return shaped.length > 0 ? { kind: "method-not-allowed" } : { kind: "not-allowed" }
}

/** The upstream segments, with `me` replaced by the session's ids. */
export function upstreamSegments(entry: AllowlistEntry, segments: readonly string[], owner: OwnerIds): string[] {
  return entry.template.split("/").map((part, i) => {
    const ownerKey = OWNER_PLACEHOLDERS[part]
    return ownerKey ? String(owner[ownerKey]) : segments[i]
  })
}

/**
 * Validates a client query against per-name rules (decoded name + value
 * regex; own properties only) and applies the server-fixed params, whose
 * client values are ignored. Returns the rebuilt query, or `null` for 400
 * `BAD_QUERY`. With no rules every client param is rejected.
 */
export function validateQuery(
  rules: Readonly<Record<string, QueryParamRule>> | undefined,
  fixed: Readonly<Record<string, string>>,
  clientQuery: URLSearchParams,
): URLSearchParams | null {
  const out = new URLSearchParams()
  const seen = new Set<string>()

  for (const [key, value] of clientQuery) {
    // Own-property lookups only: `constructor`, `toString`, `__proto__` are unknown params.
    if (Object.hasOwn(fixed, key)) continue
    const rule = rules && Object.hasOwn(rules, key) ? rules[key] : undefined
    if (!rule || !rule.pattern.test(value)) return null
    if (seen.has(key) && !rule.repeatable) return null
    seen.add(key)
    out.append(key, value)
  }
  for (const [key, value] of Object.entries(fixed)) out.set(key, value)
  return out
}

/**
 * The upstream query of an allowlist entry: its rules, its server-fixed
 * params and `preview=true` on image entries.
 */
export function buildUpstreamQuery(entry: AllowlistEntry, clientQuery: URLSearchParams): URLSearchParams | null {
  return validateQuery(entry.query, { ...entry.fixedQuery, ...(entry.asImage ? { preview: "true" } : {}) }, clientQuery)
}

/** Template string for logs, e.g. `/v2/person/{personId}/ssn/expose`. */
export function logTemplate(entry: AllowlistEntry): string {
  return `/${entry.template}`
}
