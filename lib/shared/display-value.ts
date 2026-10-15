/**
 * The PM3 "Not provided" rule (UX-DR-P33, FR104, FR116), decided once for
 * every read view: Personal information (2.1), Account settings (7.4), the
 * NPI Registered view (9.3) and the organization cards (10.2). The platform
 * stores "no value" as null, a missing field, `""`, `"n/a"` (backend
 * `BO_CORE_DEFAULT_VALUE`, any case) or `-1`; all of them read "Not provided"
 * (`COMMON_MESSAGES.notProvided`). `KeyValueTable` applies it to every value.
 */

const PLACEHOLDER = /^(n\/a|-1)$/i

/**
 * `true` for a value that should read "Not provided": `null`, `undefined`, an
 * empty or whitespace-only string, `"n/a"` in any case (surrounding spaces
 * ignored), `-1` or `"-1"`, and an empty list. `0`, `false` and any other
 * value are real values.
 */
export function isNotProvided(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === "number") return value === -1
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed === "" || PLACEHOLDER.test(trimmed)
  }
  if (Array.isArray(value)) return value.length === 0
  return false
}

/** The value, or `null` when it is not provided (for `?? fallback` chains). */
export function providedOrNull<T>(value: T): T | null {
  return isNotProvided(value) ? null : value
}

/**
 * Joins the provided parts (trimmed) with `separator`, skipping every part
 * that is not provided: a full name keeps its middle name unless it is
 * `"n/a"` (Story 10.2 primary contact; also 2.1, 7.4). `""` when none is
 * provided, so the caller can fall back to "Not provided".
 */
export function joinProvided(parts: readonly (string | null | undefined)[], separator = " "): string {
  return parts
    .filter((part): part is string => !isNotProvided(part))
    .map((part) => part.trim())
    .join(separator)
}
