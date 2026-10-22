---
title: 'Enter organization portal through guarded handoff (NG-9044)'
type: 'feature'
created: '2026-10-21'
status: 'done'
route: 'dispatch'
baseline_commit: '0693a1b1c0268619e77f70264743565897fd9b8c'
review_loop_iteration: 0
context:
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

Add Enter portal to the organization cards and complete the integrated UJ-104 journey. Enabled memberships enter through the existing same-tab guarded handoff; disabled memberships get a focusable inert control with the exact reason while their contact/type hints remain usable.

## Boundaries & Constraints

**Always:** Use enabledInTenant strictly true, existing isTenantId/handoffHref and useNavigate, shared Button/DisabledAction and area catalog copy. Tenant ID comes only from validated list data. Keep all session/draft/leave-guard behavior in the shell. Reuse completed7.3 route; current TENANT_HANDOFF_SHAPE=root remains the approved behavior until backend portal contract confirmation.

**Never:** Use subdomain/response URLs, switch-tenant, window.open, logout, target blank, a second guard, direct location assignment in a feature, or current-tenant disabling inherited from legacy frontend. Do not edit shared handoff/session files, Team A files or publish during implementation.

## I/O & Edge-Case Matrix

| Scenario | Input/state | Expected behavior | Failure handling |
| --- | --- | --- | --- |
| Enabled | true and valid positive tenant ID |44px Enter portal; aria-label Enter portal for name | Click/Enter/Space use guarded handoff only |
| Disabled | false, missing or unusable identity | aria-disabled focusable action; exact reason You're disabled in this organization | No guard/navigation/request on activation; hints stay usable |
| IDs | Safe positive number or lossless1–19 digit nonzero string | Existing validated tenant handoff URL | Invalid input never navigates or reaches production fallback bare route |
| Dirty guard | Shared guard denies/discards/saves | Existing Keep editing/Discard/Save semantics | Save failure/expiry prevents navigation |
| Handoff | Same-tab request to existing route | Environment-specific303, accepted root fallback | Never switch tenant in BFF or purge drafts/logout |
| Keyboard | Full card | Contact trigger, type icons, overflow, portal action | Name tooltip reachable accessibly without stealing pager-change heading focus |

</frozen-after-approval>

## Code Map

- New `features/organizations/enter-portal-button.tsx`, tests: private action component consumed only by this feature.
- `features/organizations/organization-card.tsx`:10.2 card owns placement and disabled-text styling; root/list passes portalAction slot with normalized item.
- `features/shell/handoff.ts`: isTenantId/handoffHref; `navigate.tsx` owns leave guard/same-tab behavior. Existing `app/handoff/portal/route.ts` and `lib/server/handoff.ts` need no changes.
- `lib/shared/messages/orgs.ts`: root provides exact Enter portal/aria-label/reason copy after duplicate catalog search.
- New `e2e/account-organizations-portal.spec.ts`, owned `e2e/fixtures/orgs.ts`: synthetic enabled/disabled memberships, guarded destination fixtures and actual7.3 response assertions.

## Tasks & Acceptance

- [x] `features/organizations/enter-portal-button.tsx`, tests — enabled/disabled states, exact accessible copy, validated ID handoff, pointer/Enter/Space and no navigation for invalid/disabled values.
- [x] `features/organizations/organization-card.tsx` — card owner integrates action slot and disabled visual state; root coordinates rather than two writers editing it.
- [x] `e2e/account-organizations-portal.spec.ts` — UJ-104 search dnn,1 organization announcement, Primary contact and same-tab handoff; disabled reason; no logout/switch calls, draft retention.
- [x] Owned action/browser tests — real shared guard Keep editing/Discard/Save success/failure matrix. Account panel is unmounted when Organizations is selected; assert dirty-account navigation guard before entering the tab and use actual shared guard harness for destination-level decisions, rather than inventing simultaneously mounted panels.
- [x] `spec-10-3-enter-organization-portal.md` — record current portal-root fallback and separate tenant-target demo QA; preserve frozen7.3 decisions.

**Acceptance Criteria:**
- Given a valid enabled card, when activated by any supported input, then exactly the existing guarded same-tab tenant handoff is requested using only its ID.
- Given disabled membership or a rejected/shared save guard, when activated, then no navigation/logout/switch request occurs and context/drafts remain consistent with existing shell policy.
- Given integrated10.1/10.2, when running UJ-104 at desktop/360px and both themes, then count/contact/actions, keyboard targets and axe pass together.

## Implementation Notes

User explicitly requested all3 stories in parallel where possible. Action agent owns only enter-portal-button and its tests; card agent owns card subtree; root owns copy/common API/fixtures/list composition and final browser integration. Shared7.3 already implements the route, including the deliberate portal-root fallback; no speculative tenant URL format will be added. Keep remote publication outside implementation scope and do not disturb9.2/9.3 stash or Medical branch.

## Verification

Meaningful consumer tests against actual shared navigation/guard; no-mutation/no-logout/switch assertions; browser UJ-104, disabled tap/focus reason, same-tab303 and draft checks; full integrated lint/types/tests/build/browser and BMAD review. Tenant-context smoke confirmation on demo remains explicit QA while the root fallback contract is open.


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

Action worker owns only features/organizations/enter-portal-button.tsx, its colocated tests, and e2e/account-organizations-portal.spec.ts. Do not write card/list, API/messages/fixtures, or shared guard files. Consume actual shared guard in owned tests; root coordinates complete browser journey.

Prerequisite delivery: PR43 merged as85be9c79d59f152391a0c594f0f05c2c86a11be8 after both CI runs and Vercel passed; this commit is present in the integration branch. The original captured baseline remains unchanged.

Catalog constraint: MESSAGE_CATALOG values are flat strings. Build feature-local typed maps/registration rows from the flat ORG_MESSAGES labels/descriptions; do not add nested catalog objects or arrays.

Insurance type label reuses existing SHELL_MESSAGES.profileTabInsurance; do not duplicate it in ORG_MESSAGES.

## Tasks and Matrix Audit

- Matrix Enabled/Disabled/IDs:40 action tests cover strict true membership, lossless valid IDs, malformed/unsafe IDs, pointer/Enter/Space, exact reason, inert focusable disabled actions and normalized accessible labels matching card names.
- Matrix Dirty guard/Handoff: owned tests use actual shared navigate/LeaveGuard for Keep editing/Discard/Save success/failure/session expiry. Browser covers dirty Account→Organizations decisions and UJ104 same-tab actual303, no logout/switch, no cookie mutation and retained unrelated drafts.
- Matrix Keyboard: browser card sequence is contact→types→overflow→portal, and pagination focuses the heading Tooltip trigger. Existing approved TENANT_HANDOFF_SHAPE=root remains unchanged; intended-tenant demo smoke QA is recorded separately in deferred-work.md.

Integrated fresh production build and Playwright:100 passed,2 expected modality-specific skips; desktop/mobile, light/dark axe, Account and shared fixture regressions. Log: /tmp/epic10-final-browser.log. Root inspected the unified diff including new files; accepted source changes preserve foundation ownership. Formal final review remains pending.

Final integrated acceptance checks:241 test files /7,624 tests passed;100% statements/branches/functions/lines over all enforced libraries AND features/organizations (139 fully covered files, no coverage exclusions added). Report /tmp/epic10-acceptance-coverage and log /tmp/epic10-acceptance-tests.log. Production/browser100 passed,2 expected input-modality skips. Full lint, types, forbidden/token gates and whitespace pass. The three stories receive one integrated BMAD Build review with10.1 as coordination/triage log, and the requested standalone bmad-code-review subsequently reviews the complete story change. Original captured baseline and all frozen approval blocks are preserved.

### Integrated Build review completion

All three BMAD Build review layers completed. Per-finding verdicts and grouped fixes are recorded in spec-10-1-organizations-list.md; no unresolved implementation blocker remains. Accepted patches: prevent paging an obsolete filter during debounce, trim displayed-name sort keys, scan actual zero-result accessibility, exercise both internal creation handoffs, and prove UJ104 removes a nonmatching organization. Original implementers supplied owned patches; root inspected them.

Post-review verification:241 files /7,626 tests passed;100% statements/branches/functions/lines over the enforced libraries and features/organizations,139 fully covered files, no new exclusions. Production build and browser regressions:104 passed,2 expected modality skips, no retries/failures. Lint, typecheck, forbidden/tokens and whitespace checks pass. Logs: /tmp/epic10-reviewed-acceptance-tests.log and /tmp/epic10-reviewed-final-browser.log. Real-origin and intended-tenant QA remain explicitly pending under approved option1; these local checks do not claim them. Requested standalone bmad-code-review is running against the integrated story change before final delivery.

### Final standalone review and delivery verification

Requested bmad-code-review completed with all four independent layers: Blind Hunter, Edge Case Hunter, Verification Gap Reviewer and Acceptance Auditor. No layer failed. Six confirmed private corrections were applied and inspected; five findings were rejected with individual evidence in10.1's Review Findings. No unresolved high/medium implementation issue, decision-needed item or new deferred defect remains. Final corrections safely encode mailbox characters, align missing-name sort fallback, preserve complete Unicode, wait for IME composition, expose pending pager semantics, and recover removed memberships to a freshly validated page0. Recovery tests use the actual2s SWR dedup interval and held responses, including concurrent queries and expiry.

Final verification on the reviewed source:
- 241 Vitest files /7,644 tests passed with `--maxWorkers=4`. Enforced libraries plus features/organizations are100% covered:3,110 statements,2,256 branches,726 functions,2,574 lines;139 fully covered files, no new coverage exclusions.
- Production build includes all final source changes. Playwright:104 passed,2 expected modality skips,0 failures/retries,55.4s; desktop/mobile, light/dark axe, organization journeys, Account and shared fixture regressions. Existing compiled production build was reused for this final browser pass without code changes.
- Full ESLint, typecheck, forbidden/token checks and whitespace pass.
- Logs: /tmp/epic10-final-limited-tests.log, /tmp/epic10-final-limited-browser.log, /tmp/epic10-delivery-{lint,types,forbidden}.log; coverage /tmp/epic10-final-limited-coverage. Essential scopes/results are durable here; temporary raw logs are supplemental.

Earlier final-run attempts were invalidated by actual macOS sleep events (power log recorded Dark Wake Thermal Emergency), with simultaneous multi-minute unrelated-test timeouts. The clean final runs above used reduced concurrency and sequential suites; no application code or test timeout was changed to accommodate those interruptions.

Specifications are locally done; the three sprint story keys stay review pending remote delivery/merge, preserving the sprint header and last_updated as required for feature branches. Actual demo/prod logo origins and intended-tenant navigation remain the explicitly human-approved option1 QA follow-ups. Foundation PR43 is already merged; publication of the story integration branch is a separate final action.
