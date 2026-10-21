---
title: 'List, search and page through my organizations (NG-9042)'
type: 'feature'
created: '2026-10-21'
status: 'done'
route: 'dispatch'
baseline_commit: '0693a1b1c0268619e77f70264743565897fd9b8c'
review_loop_iteration: 0
context:
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-10-2-organization-card.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-10-3-enter-organization-portal.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

Implement10.1 at `/account?tab=organizations`: lazy membership list, server search, page navigation, contextual empty state and internal-user creation. Reuse existing Account composition and shared UI/data contracts;10.2 enriches the card and10.3 supplies its portal action.

## Boundaries & Constraints

**Always:** Foundation prerequisite merges first. Use callApi, keys.orgs(trimmedName,page), registerFetcher, area allowlist/copy/errors, StateFrame cards, ORG_GRID_CLASSES, shared initials/constants/navigation. Parse the backend's actual PageImpl data/lastPage envelope, not content/last. Retain server totalElements/totalPages, drop only null organization rows, sort each page case-insensitively by provided shortOrganizationName then name. Tenant IDs are safe positive numbers or lossless1–19 digit nonzero strings. Validate/whitelist external data once at the API boundary; expose only fields used by10.1–10.3.

**Never:** Use tenant-count empty heuristics, expose subdomains/raw logo URLs/config, inline SWR keys, prefetch from other tabs, edit shared files/other teams, invent page totals, draft searches, or publish during implementation. Shared errors keep approved4xx text only; proxy denial remains generic.

## I/O & Edge-Case Matrix

| Scenario | Input/state | Expected behavior | Failure handling |
| --- | --- | --- | --- |
| List | Mount, name≤100, page0..9999, size12 | Lazy validated read;12 skeletons, exact4/3/2/1 grid | Current-key Retry; repeat failures reannounced |
| Search |500ms debounce, trimmed text | Reset page0 atomically; unchanged trimmed text no new request | Ignore obsolete key results; keep field/focus on zero results |
| Pager | Results and server totals |44px Previous/numbers/Next, aria-current; disabled ends inert | Single page still has pager; bounded presentation for many pages |
| Focus | Deliberate page change completes | Scroll grid and focus first card heading | Reduced motion instant; search never steals focus |
| Initial empty | Page0, blank search, zero renderable rows | Registration card/four exact feature rows; no search/pager | Do not confuse null organizations with network failure |
| Identity | Internal suffix or regular email | Internal create/register via guarded same-tab handoff; regular checkout anchor/new-tab warning | Unknown/failed identity cannot qualify as internal |
| Read failure |403 upstream vs proxy/network/session | Tab no-access only upstream403; mapped Retry otherwise; global session flow | No stale grid/controls underneath denied state |

</frozen-after-approval>

## Code Map

- `lib/api/organizations.ts`, `.test.ts`: existing paths/page-size stub; add OrganizationPortalItem/Page, listOrganizations and registerFetcher. Wire nesting confirmed by OrganizationPortalResponseDTO/SysTenantConfigResponseDTO and UserResource.java:214.
- `lib/server/proxy/allowlist/orgs.ts`, tests: exact GET and name/page/size rules, profile:true. Existing keys/error-owner mappings need no shared edits.
- `features/organizations/organizations-tab.tsx`, new `use-organizations.ts`, `organizations-pagination.tsx`, tests: replace stub; list/query/focus state and page controls.
- `features/organizations/organization-card.tsx`: owned by10.2; consumes one normalized item and portalAction slot. Root freezes interface before parallel work.
- `lib/shared/messages/orgs.ts`, `e2e/fixtures/orgs.ts`: root owns exact copy and synthetic page builders across all3 stories. Team B read default is `test/page-handlers/account.ts`.

## Tasks & Acceptance

- [x] `lib/api/organizations.ts`, tests — strict input/page/row validation, nested whitelist, null drop, sorting/totals, strings/unsafe IDs, SWR loader and error preservation.
- [x] `lib/server/proxy/allowlist/orgs.ts`, tests — query boundaries, no extra/repeated params, wrong method, kill-switch, no-store and privacy.
- [x] `test/page-handlers/account.ts`, `e2e/fixtures/orgs.ts` — real empty PageImpl data shape after shared contract prerequisite; no fake content alias.
- [x] `features/organizations/organizations-tab.tsx`, private hook/pager and tests — all matrix states; cancellation/expiry, rapid search and pagination focus.
- [x] `e2e/account-organizations-list.spec.ts` — desktop/360px, both themes, keyboard, all empty/error states and axe.

**Acceptance Criteria:**
- Given real MSW consumers, when searches/pages/errors race, then only the active query appears and Retry touches only its key; counts/totals and focus follow the matrix.
- Given internal/regular/unknown identities, when initial emptiness renders, then exact approved registration behavior appears without speculative internal privileges.
- Given desktop/mobile in both themes, when using keyboard or touch, then no overflow occurs, targets are44px and axe passes.

## Implementation Notes

User explicitly requested all3 stories and multiagent work. Keep3 specs on one integration branch. Root owns common API/messages/fixtures and final composition; list agent owns list/hook/pager; card agent owns card subtree; action agent owns portal action. All writers receive frozen contracts and disjoint files. No story source work starts before prerequisite delivery. Preserve unrelated Provider stash/branch and sprint header; only own story key may change.

## Verification

Vitest/MSW matrix plus100% changed library/meaningful feature coverage; production browser search/page/null/empty/403/Retry/internal checkout flows, keyboard/axe at360px/both themes; full integrated checks and BMAD review. Portal root fallback from7.3 remains intentional.


### Approval record

Human selected Approve and continue on2026-10-21 for this prerequisite and all3 stories. Frozen intent and captured baseline are preserved. Explicit multiagent authorization overrides the default sequential-only implementation rule after prerequisite integration. Remote publication remains a separate final delivery action.

### Parallel implementation contract

Implementation checkout is `/Users/idanielgarcia/Documents/DEV/oneHealth/personal-profile`, integration branch `feat/NG-9042-NG-9044-organizations`. No story implementation may start until prerequisite PR43 is actually merged and that merge is present here. Read CLAUDE.md and the installed Next.js server/client component guide before writing framework code. Root owns Git, builds, final verification, common API, messages and fixture files; workers must not commit, push, switch branches or start production builds. Preserve unrelated branches and the Provider stash.

Root supplies these public API contracts from `@/lib/api`:
- `OrganizationPortalContact`: readonly optional nullable string fields `firstName`, `middleName`, `lastName`, `email`, `phoneNumber`, `phoneNumberRegion`; readonly `contactTypes: readonly string[]`.
- `OrganizationPortalItem`: readonly `tenantId: string` (losslessly validated/normalized), `enabledInTenant: boolean`, `name: string`, optional nullable `shortName: string`, `types: readonly string[]`, `personContacts: readonly OrganizationPortalContact[]`.
- `OrganizationPortalPage`: readonly `items: readonly OrganizationPortalItem[]`, `totalElements: number`, `totalPages: number`, `pageNumber: number`.
- `listOrganizations({name: string, page: number})` returns `Promise<ApiResponse<OrganizationPortalPage>>`; registered `orgs` SWR loader reads existing keys.orgs(name,page). `orgLogoPath` accepts number or string additively.

Root supplies ORG_MESSAGES from `@/lib/shared/messages`: searchLabel, countOne, countMany (count template), create, register, registerExternal, emptyTitle, emptyDescription, noResults, paginationLabel, typesLabel, primaryContact, primaryContactFor (name template), enterPortal, enterPortalFor (name template), disabledReason, moreType/moreTypes (count/types templates), flat type label keys typeLab/typeHealthcare/typeSupplier/typeGoToMarket/typePopulationHealth/typeCarrier/typeManufacturer/typeEnterprise/typeGovernmentAgency/typeNone; registrationLabDescription/registrationHealthcareDescription/registrationSupplierDescription/registrationGoToMarketDescription; missingContactValue (dash). Reuse existing COMMON_MESSAGES and other exact shared copy where applicable. All unknown platform labels remain safe text, not new hardcoded UI copy.

Card interface: `OrganizationCard({ organization: OrganizationPortalItem, portalAction?: ReactNode, headingRef?: Ref<HTMLHeadingElement> })`; action interface: `EnterPortalButton({ organization: OrganizationPortalItem })`. List owner composes both. Card owner's headingRef attaches to the actual h3, tabIndex=-1. Shared OverflowChip is in `components/ui/chip.tsx` (not a separate overflow-chip file). No worker edits another worker's files or common API/messages/fixtures; request changes from root.

Root fixture helper will expose `organizationWire(overrides?)` and `organizationsPage(data?, {pageNumber?,totalElements?,totalPages?}?)` in `e2e/fixtures/orgs.ts`, retaining existing mockOrganizations override API. No shared fixture aggregator edits. Focused tests only during parallel work; unique temporary coverage directory per worker. Root runs broad suites after all writers finish. Record verification honestly; real-logo origins and tenant-target demo QA remain deferred.

List worker owns only features/organizations/organizations-tab.tsx, use-organizations.ts, organizations-pagination.tsx, colocated tests, and e2e/account-organizations-list.spec.ts. It may add small list-only subcomponents in this feature. Root owns API/allowlist/messages/fixtures. Do not write card or action components.

Prerequisite delivery: PR43 merged as85be9c79d59f152391a0c594f0f05c2c86a11be8 after both CI runs and Vercel passed; this commit is present in the integration branch. The original captured baseline remains unchanged.

Catalog constraint: MESSAGE_CATALOG values are flat strings. Build feature-local typed maps/registration rows from the flat ORG_MESSAGES labels/descriptions; do not add nested catalog objects or arrays.

Insurance type label reuses existing SHELL_MESSAGES.profileTabInsurance; do not duplicate it in ORG_MESSAGES.

Common implementation verification: organization API, query allowlist and flat catalog coverage100%; platform PageImpl defaults supplied in account page handlers and e2e fixtures. Team B e2e/fixtures/defaults-account.ts now registers mockOrganizationLogoFallback so card logo failures default to supported initials, with later per-test image overrides. Initial integrated lint/types/forbidden gates passed; complete library run240 files /7,608 tests passed with100% enforced coverage. Logs under /tmp/epic10-*.

## Tasks and Matrix Audit

- Matrix List/Search: organizations API and allowlist tests validate DTO whitelist, IDs, sorting, totals and bounds; tab/hook tests cover twelve skeletons, exact 500ms debounce, trim, current-key races, SWR2s A→B→A reuse, rejected paging, expiry and repeated Retry. Browser list journey covers lazy loading, search/page focus and all four actual grid breakpoints.
- Matrix Pager/Focus: pager/tab tests cover single page, disabled endpoints, bounded huge totals, current page, smooth/reduced scrolling, canceled pending focus, and null-only later-page recovery using original server totals. Browser keyboard tests focus actual h3 via pagination.
- Matrix Initial empty/Identity/Read failure: unit/browser tests cover null-only initial pages, exact four registration rows, external/internal/unknown/failed identities, approved4xx copy, upstream403 versus proxy/network/5xx and global session expiry.

Integrated fresh production build and Playwright:100 passed,2 expected modality-specific skips; desktop/mobile, light/dark axe, Account and shared fixture regressions. Log: /tmp/epic10-final-browser.log. Root inspected the unified diff including new files; accepted source changes preserve foundation ownership. Formal final review remains pending.

Final integrated acceptance checks:241 test files /7,624 tests passed;100% statements/branches/functions/lines over all enforced libraries AND features/organizations (139 fully covered files, no coverage exclusions added). Report /tmp/epic10-acceptance-coverage and log /tmp/epic10-acceptance-tests.log. Production/browser100 passed,2 expected input-modality skips. Full lint, types, forbidden/token gates and whitespace pass. The three stories receive one integrated BMAD Build review with10.1 as coordination/triage log, and the requested standalone bmad-code-review subsequently reviews the complete story change. Original captured baseline and all frozen approval blocks are preserved.

## Review Triage Log

Integrated BMAD Build review of all three stories, including the previously merged prerequisite because the original captured baseline is preserved. All three layers completed before triage; verification-gap reported no gaps. Each finding is classified separately before root-cause grouping.

| ID / layer | Verdict | Evidence and disposition |
| --- | --- | --- |
| B1 / blind | medium | While text differs from the active query during debounce, setPage still requests the old query and sets pageFocus. Confirmed reachable by typing then clicking Next; patch the private callback and add a regression. |
| B2 / blind | low | API sorting uses untrimmed names while card names are trimmed, so a spaced Zebra sorts before Alpha. Direct correction: trim sort keys and cover both full/short names. |
| B3 / blind | false | FR118 and UX-DR-P21 prioritize the platform type Health Provider, while standalone Healthcare belongs to the alphabetical remainder. Existing alias-dedup tests preserve the best rank when both occur; changing standalone Healthcare priority would violate the specified order. |
| B4 / blind | false | Full text is in the heading/accessibility tree, the pager keyboard path focuses that actual heading and opens its Tooltip, and the explicit keyboard order in the approved Epic context excludes an additional name stop. This is not an inaccessible name; ordinary Tab is deliberately contact/types/overflow/portal. |
| B5 / blind | false | Inspected backend UserServiceImpl.fetchUserTenantsByName and PageImpl: Page.of receives the exact requested page and PageImpl assigns it unchanged. The claimed clamped response is not produced by this endpoint; no speculative reconciliation guard is added. |
| B6 / blind | low | Existing axe scans occur after clearing the no-results state. Add direct light/dark scans of that visible state in the existing desktop/mobile journey. |
| B7 / blind | low | Internal create/register controls are unit-tested but browser tests stop at presence. Add actual same-tab create-org handoff assertions for both controls with retained draft and no logout/switch. |
| B8 / blind | false | The action consumer tests already exercise actual useNavigate/LeaveGuard for all four decisions plus expiry, not a mocked navigate. Account unmounts on tab change, so a dirty Account participant cannot coexist with this action in the real browser composition; browser tests cover the real tab guard. An invented mounted participant would not improve integration fidelity. |
| B9 / blind | low | UJ104 used one identical card before/after filtering. Strengthen the existing browser fixture to two initial cards and assert the nonmatching card disappears. |
| B10 / blind | false | Both specifications and append-only deferred entries already identify mocked origins, accepted portal-root fallback, and pending real demo/prod QA. No live-origin or intended-tenant acceptance is claimed. These are the explicit approved option-1 QA exceptions. |
| E1 / edge | false | Initial-empty is explicitly defined in the approved matrix and Epic context as blank page0 with no renderable organizations, including null-only rows, without search/pager. The suggested totalPages heuristic contradicts that accepted behavior. Later null-only pages already retain the pager for recovery. |
| E2 / edge | low | Same independently confirmed whitespace sort mismatch as B2; retain a separate verdict, then group its direct correction with B2. |

### Grouped disposition

- Patch P1: B1, list owner adds a private pending-search paging guard and regression.
- Patch P2: B2/E2, root trims only API sort keys and adds a regression; no domain/public-surface change.
- Patch P3: B6/B7, list owner strengthens browser state/creation assertions.
- Patch P4: B9, action owner strengthens UJ104 filtering assertions.
- No intent-gap/bad-spec loopback or additional deferred issue. Existing human-approved QA exceptions remain open.

### Integrated Build review completion

All three BMAD Build review layers completed. Per-finding verdicts and grouped fixes are recorded in spec-10-1-organizations-list.md; no unresolved implementation blocker remains. Accepted patches: prevent paging an obsolete filter during debounce, trim displayed-name sort keys, scan actual zero-result accessibility, exercise both internal creation handoffs, and prove UJ104 removes a nonmatching organization. Original implementers supplied owned patches; root inspected them.

Post-review verification:241 files /7,626 tests passed;100% statements/branches/functions/lines over the enforced libraries and features/organizations,139 fully covered files, no new exclusions. Production build and browser regressions:104 passed,2 expected modality skips, no retries/failures. Lint, typecheck, forbidden/tokens and whitespace checks pass. Logs: /tmp/epic10-reviewed-acceptance-tests.log and /tmp/epic10-reviewed-final-browser.log. Real-origin and intended-tenant QA remain explicitly pending under approved option1; these local checks do not claim them. Requested standalone bmad-code-review is running against the integrated story change before final delivery.
