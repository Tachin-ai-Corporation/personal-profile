/**
 * The AD-23 403 owner table (FR103, UX-DR-P26, F3-3): which part of the UI
 * shows "no access" when an upstream 403 (`MappedError` `forbidden`) answers a
 * given endpoint. Everything else on the page keeps working. Encoded once,
 * here, so every feature reads it through `@/lib/api`; a feature decides
 * where to render the `NoAccess` panel from the owner's `level`.
 *
 * Only an upstream 403 counts: a proxy refusal (`NOT_ALLOWED`) is never "no
 * access" (`mapApiError` already maps it to the generic error).
 */

/** The UI part an endpoint's 403 belongs to. */
export type ForbiddenOwner =
  /** `/account` Personal account settings: only the Primary email / phone pickers (Story 7.6). */
  | "account-pickers"
  /** `/account` Authenticator app card: a Section-level row (Epic 8). */
  | "authenticator"
  /** `/account` Individual Provider Registration tab: the tab-level panel (Epic 9). */
  | "provider"
  /** `/account` My Organizations tab: the tab-level panel (Epic 10). */
  | "organizations"
  /** The Practice-name support-contact popover only (Story 9.3). */
  | "practice-popover"

/** How the owner shows it: a tab-level panel, a Section row, the controls themselves, or inside a popover. */
export type ForbiddenLevel = "tab" | "section" | "control" | "popover"

export interface ForbiddenScope {
  readonly owner: ForbiddenOwner
  readonly level: ForbiddenLevel
}

export interface ForbiddenScopeRule extends ForbiddenScope {
  /** The endpoint as the AD-23 table names it, for documentation and tests. */
  readonly endpoint: string
  /** Anchored on the normalised path (no origin, prefix, version or query). */
  readonly pattern: RegExp
}

/** The AD-23 table, in its published order. */
export const FORBIDDEN_SCOPE_TABLE: readonly ForbiddenScopeRule[] = [
  { endpoint: "contact-point/list", pattern: /^user\/contact-point\/list$/, owner: "account-pickers", level: "control" },
  { endpoint: "mfa/*", pattern: /^mfa\/.+$/, owner: "authenticator", level: "section" },
  { endpoint: "/api/pp/mfa/validate", pattern: /^pp\/mfa\/validate$/, owner: "authenticator", level: "section" },
  { endpoint: "user/npi", pattern: /^user\/npi$/, owner: "provider", level: "tab" },
  { endpoint: "public/npi/list", pattern: /^public\/npi\/list$/, owner: "provider", level: "tab" },
  { endpoint: "user/register/npi", pattern: /^user\/register\/npi$/, owner: "provider", level: "tab" },
  { endpoint: "user/organization/portal", pattern: /^user\/organization\/portal$/, owner: "organizations", level: "tab" },
  { endpoint: "/api/pp/practice-support", pattern: /^pp\/practice-support$/, owner: "practice-popover", level: "popover" },
]

/**
 * A request path in any of the forms the app uses (`v2/user/npi`,
 * `/api/1h/v2/user/npi?x=1`, `/api/pp/mfa/validate`, an absolute URL) →
 * `user/npi` / `pp/mfa/validate`.
 */
export function normalizeForbiddenPath(path: string): string {
  let rest = path.trim()
  rest = rest.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, "")
  rest = rest.replace(/[?#].*$/, "")
  rest = rest.replace(/^\/+/, "")
  rest = rest.replace(/^api\/1h\//, "")
  rest = rest.replace(/^api\/pp\//, "pp/")
  rest = rest.replace(/^v\d+\//, "")
  return rest.replace(/\/+$/, "")
}

/**
 * The owner of a 403 on `path`, or `null` when the table names no owner (the
 * surface that made the read then shows its own no-access state).
 */
export function forbiddenScopeFor(path: string): ForbiddenScope | null {
  const normalized = normalizeForbiddenPath(path)
  const rule = FORBIDDEN_SCOPE_TABLE.find((candidate) => candidate.pattern.test(normalized))
  return rule ? { owner: rule.owner, level: rule.level } : null
}
