/**
 * The AD-23 403 owner table (FR103, UX-DR-P26, F3-3): which part of the UI
 * shows "no access" when an upstream 403 (`MappedError` `forbidden`) answers a
 * given endpoint. Everything else on the page keeps working. Encoded once,
 * here, so every feature reads it through `@/lib/api`; a feature decides
 * where to render the `NoAccess` panel from the owner's `level`.
 *
 * Adding an owner or a row is a foundation change (FOUNDATION.md §1, T3–T4): features
 * never `switch` exhaustively over `ForbiddenOwner`; they compare with their
 * own owner (`scope?.owner === "addresses"`).
 *
 * The lookup is page-aware: `contact-point/list` belongs to the `/account`
 * pickers there, but on `/` the Contacts Section that asked for that type.
 *
 * Only an upstream 403 counts: a proxy refusal (`NOT_ALLOWED`) is never "no
 * access" (`mapApiError` already maps it to the generic error).
 */

/** The page that made the request (`/` is `profile`). */
export type ForbiddenPage = "profile" | "account"

/** The UI part an endpoint's 403 belongs to. */
export type ForbiddenOwner =
  /** `/` Contacts Sections that read `contact-point/list` for their type (Epic 3). */
  | "phone"
  | "email"
  | "social"
  /** `/` Addresses Section: its list read (Story 4.1; spec F7-2). */
  | "addresses"
  /** `/` Insurance Section: its policy list read (Story 5.1; spec F7-2). */
  | "insurance"
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
  /** Only on this page; any page when absent. */
  readonly page?: ForbiddenPage
  /** Only when the request's `type` query parameter has this value. */
  readonly type?: string
}

const CONTACT_POINT_LIST = /^user\/contact-point\/list$/

/** The AD-23 table, in its published order (the `/` Contact Point rows first: one per `type`). */
export const FORBIDDEN_SCOPE_TABLE: readonly ForbiddenScopeRule[] = [
  { endpoint: "contact-point/list?type=Mobile", pattern: CONTACT_POINT_LIST, page: "profile", type: "Mobile", owner: "phone", level: "section" },
  { endpoint: "contact-point/list?type=Landline", pattern: CONTACT_POINT_LIST, page: "profile", type: "Landline", owner: "phone", level: "section" },
  { endpoint: "contact-point/list?type=Email", pattern: CONTACT_POINT_LIST, page: "profile", type: "Email", owner: "email", level: "section" },
  { endpoint: "contact-point/list?type=Social Media", pattern: CONTACT_POINT_LIST, page: "profile", type: "Social Media", owner: "social", level: "section" },
  { endpoint: "contact-point/list", pattern: CONTACT_POINT_LIST, page: "account", owner: "account-pickers", level: "control" },
  /*
   * The other `/` list reads (spec F7-2, pre-declared so Team A's Stories 4.1
   * and 5.1 add no union member): a 403 shows that Section's own no-access row
   * and the rest of the tab keeps working (AD-23 names no wider scope).
   */
  { endpoint: "person/location/list", pattern: /^person\/location\/list$/, page: "profile", owner: "addresses", level: "section" },
  { endpoint: "health/patient/insurance", pattern: /^health\/patient\/insurance$/, page: "profile", owner: "insurance", level: "section" },
  { endpoint: "mfa/*", pattern: /^mfa\/.+$/, owner: "authenticator", level: "section" },
  { endpoint: "/api/pp/mfa/validate", pattern: /^pp\/mfa\/validate$/, owner: "authenticator", level: "section" },
  { endpoint: "user/npi", pattern: /^user\/npi$/, owner: "provider", level: "tab" },
  { endpoint: "public/npi/list", pattern: /^public\/npi\/list$/, owner: "provider", level: "tab" },
  { endpoint: "user/register/npi", pattern: /^user\/register\/npi$/, owner: "provider", level: "tab" },
  /*
   * `health/npi/{n}/is-registered` (spec F6-3): Story 9.2 checks both NPIs
   * before Register, so a 403 there is the tab's no-access panel like the other
   * provider calls. Story 9.3 also calls it (the "Register your practice" CTA
   * on `practiceNpi.id`) but ignores every error of that call (no CTA, no
   * panel) without calling `forbiddenScopeFor`; this row does not apply there.
   */
  { endpoint: "health/npi/{n}/is-registered", pattern: /^health\/npi\/\d{1,19}\/is-registered$/, owner: "provider", level: "tab" },
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

/** The `type` query parameter of a request path, if any. */
function typeParam(path: string): string | null {
  const query = /\?([^#]*)/.exec(path)?.[1]
  return query === undefined ? null : new URLSearchParams(query).get("type")
}

/**
 * The owner of a 403 on `path` requested from `page`, or `null` when the table
 * names no owner (the surface that made the read then shows its own no-access
 * state).
 */
export function forbiddenScopeFor(path: string, page: ForbiddenPage): ForbiddenScope | null {
  const normalized = normalizeForbiddenPath(path)
  const type = typeParam(path)
  const rule = FORBIDDEN_SCOPE_TABLE.find(
    (candidate) =>
      (candidate.page === undefined || candidate.page === page) &&
      (candidate.type === undefined || candidate.type === type) &&
      candidate.pattern.test(normalized),
  )
  return rule ? { owner: rule.owner, level: rule.level } : null
}
