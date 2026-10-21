# Epic 10 Context: My Organizations

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Deliver the My Organizations tab at `/account?tab=organizations`, letting users find their organizations, recognize them by name, logo and type, inspect the primary contact, and enter the portal through a protected hand-off. The shared foundation and Account page are already built; current foundation guidance and dated amendments supersede older planning prose about rebuilding them.

## Stories

- Story 10.1: List, search and pagination of my organizations
- Story 10.2: Organization card — logo, name, types and primary contact
- Story 10.3: Enter portal

## Requirements & Constraints

- Load organization data only when this tab opens. Search runs on the server after 500 ms, trims text, caps it at 100 characters and resets the zero-based page to 0. Return 12 items per page, drop null organizations, and sort within each page case-insensitively by short name falling back to name. Preserve server totals; show pagination even for one page of results and announce the server result count politely.
- Distinguish no renderable organizations on page 0 without search from zero search results. The former shows the registration card and four feature rows, without search or pagination; the latter retains search and its focus. Never infer emptiness from the user's tenant count.
- Internal users receive portal organization-creation actions. Other users receive the checkout link in a new tab with an accessible warning and `noopener noreferrer`. Reuse existing email-domain detection and checkout constants.
- Every read uses `StateFrame`. An upstream list 403 replaces this tab with no access while other tabs remain usable. Other failures provide an inline error and Retry for the current query/page; proxy denial is a generic error. Map errors centrally; repeated failures must be announced again.
- Meet WCAG 2.1 AA with keyboard access, 44 px targets, semantic tokens, light/dark support and reduced motion. No horizontal overflow at 360 px. Tab content should render within 1.5 s on demo broadband; search should return within 1 s at p75.
- Validate behavior with area-owned Vitest/MSW and Playwright coverage, including desktop/mobile and light/dark accessibility. Demo QA must verify that Enter portal reaches the intended tenant.

## Technical Decisions

- This is Team B work. Story changes stay in its feature, area and test files. Shared changes require a separate foundation PR reviewed by both teams and merged first; extend existing helpers/contracts rather than replacing them. Read current foundation guidance and story foundation notes before implementation, and installed Next.js guides before writing framework code.
- Browser REST traffic uses `callApi` through `/api/1h/*`. The organization endpoint is `GET v2/user/organization/portal`, with `name` at most 100 characters, a one-to-four-digit page and size at most 12; tagged `profile: true` in its area allowlist. Register the organization loader with shared SWR; keys come only from `keys.orgs(name, page)`. Use orgs catalog copy, shared generic actions and area error rules.
- Parse the backend's page envelope as `data` plus its pagination metadata, including `lastPage`, `totalElements` and `totalPages`; it is not Spring's `content`/`last` shape. Expose only the organization domain fields needed by the UI, excluding raw logo URLs and subdomains. Practice membership remains based on `myself.tenants`, never this list.
- Reuse the completed logo named operation, organization initials helper and fallback-image control. Logos are same-origin, membership-checked server reads restricted to the session environment's configured public-files origin. Preserve credential-free fetching, redirect rejection, timeout/size/magic-byte checks, PNG/JPEG/WebP-only output and private no-store protection. Failure falls back silently to initials; do not widen CSP or use file-download routes for logos. No CSRF header or session binding.
- Reuse shell navigation and portal hand-off. Build tenant hand-offs only from a validated numeric tenant id, never response URLs. Navigation runs the leave guard, then uses the same tab without logout or draft purge. Never call `switch-tenant`. The route resolves environment from session, then environment cookie, then prod; tenant hand-offs currently default to the portal root until the tenant URL contract is confirmed.

## UX & Interaction Patterns

- Use the shared organization grid: 4/3/2/1 columns at 1280/1024/640/below, 16 px gaps, flat bordered cards and a 12-card loading skeleton. Cards are articles labeled by their headings; names are ellipsized visually with the full text accessible. Logos are decorative, 72 px tall, with initials while loading or on failure.
- Deduplicate type icons; show four, ordered Lab, Health Provider, Supplier, Go To Market, then alphabetically. Overflow names are alphabetical; unknown and absent types use the generic fallback. Reuse Tooltip and OverflowChip rather than creating new interaction controls.
- The primary-contact InfoPopover selects the contact marked Primary, includes a provided middle name, and uses missing-value fallbacks and safe email links. Reuse its hover/focus/tap behavior and Escape focus return.
- Keyboard order is search, internal creation action, cards, pager; within cards it is contact trigger, type icons, overflow, Enter portal. Page changes scroll to the grid and focus the first heading, respecting reduced motion. Disabled membership uses a focusable `DisabledAction` with its reason; activation does nothing while other card interactions remain available.

## Cross-Story Dependencies

- Build 10.1, then enrich its card in 10.2, then add 10.3. The Account page and Story 7.3 hand-off route are completed dependencies, not new foundation work.
- Correct organization fixtures using `content`/`last` before implementing the list parser. Team B owns its page handlers and org fixtures; shared provider/fixture-contract corrections require a foundation PR first.
- Confirm demo/prod public-files origins against live logo URLs before relying on logos. Dev's origin remains unconfirmed and null, so initials are expected there.
- Address logo membership cost through foundation work: an uncached 12-card page can cause roughly 70 upstream calls. Any caching proposal must preserve session membership isolation and explicitly reconcile the existing no-store contract.
- Platform confirmation of the tenant hand-off URL remains outstanding; root navigation is the accepted fallback, so correct-tenant QA cannot be assumed from mocked navigation tests. Default-tenant Patient permissions also need demo verification; tab-level no-access is the supported fallback.
