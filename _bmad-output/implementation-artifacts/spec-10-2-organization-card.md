---
title: 'Organization logo, types and primary contact card (NG-9043)'
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

Enrich10.1's organization card with protected logos, name help, robust type icons and a Primary-contact popover, retaining10.3's portal-action slot and disabled-card semantics. Reuse the existing image/initials/Tooltip/InfoPopover controls rather than rebuilding them.

## Boundaries & Constraints

**Always:** Foundation membership/fixture/privacy prerequisite merges first. Use FallbackImage fallbackWhileLoading, orgLogoPath and orgInitials; logo is decorative alt empty and72px/object-contain. Names remain fully accessible with one-line ellipsis/Tooltip. Contacts/types come only from the normalized area API domain, never raw DTOs. Semantic tokens,44px interaction targets, source catalog copy and safe links only.

**Never:** Fetch public logo URLs directly in browser, loosen host/CSP/no-store checks, use file-download logos, cache image bytes, hide all disabled-card interactions, change shared primitives, or call another feature. No live-account mutation or story publication.

**Human decision2026-10-21:** Complete code and automated tests now; verifying actual demo/prod tenantLogo.publicUrl origins remains an explicit QA follow-up. Keep current exact-host restriction and silent initials fallback; dev remains null/initials. Do not claim live origin or tenant-target acceptance from mocks.

## I/O & Edge-Case Matrix

| Scenario | Input/state | Expected behavior | Failure handling |
| --- | --- | --- | --- |
| Logo | Current item's tenant ID | Same-origin protected image; initials during load/error | No broken icon/message; identity changes replace image lifecycle |
| Name | Short name else name | Full accessible text, ellipsis; Tooltip hover/focus/tap | Provided-value normalization before wrapping |
| Types | Exact map, duplicate/unknown/empty values | Deduplicate; Lab/Health Provider/Supplier/Go To Market then alphabetical;4icons | Unknown CircleHelp; no types use exact n/a reason |
| Overflow | More than4 types | Existing +N chip; hidden labels alphabetical and singular/plural copy | Focus/tap/Escape behavior retained |
| Contact | First contactTypes includes Primary | Name with non-sentinel middle, formatted phone, email; muted leading icons | Each missing field dash; no Primary gives3 dashes |
| Email | Plain email vs existing URL/protocol-shaped input | Construct validated mailto through safeHref | javascript/unsafe protocol input stays plain text; long values wrap inside280px popover |
| Disabled | enabledInTenant not true | Muted card text; logo/contact/types still interactive |10.3 owns inert portal control and reason |

</frozen-after-approval>

## Code Map

- `features/organizations/organization-card.tsx`, tests: new article labeled by its heading, reusable portalAction ReactNode slot; no list-fetch logic.
- New owned `organization-types.tsx`, `organization-primary-contact.tsx`, tests: exact type map and Primary contact presentation.
- `lib/api/organizations.ts`: root maps nested organization.type/personContacts from verified backend DTO; private UI consumes only domain fields.
- Existing `components/ui/{fallback-image,tooltip,info-popover,info-icon-button,overflow-chip}.tsx`, shared initials/display-value/phone/safeHref: reuse unchanged.
- `lib/server/named-ops/org-logo.ts`: foundation owns hardening and membership reuse, never story edits. Real-origin evidence remains QA under the explicit human decision.

## Tasks & Acceptance

- [x] `features/organizations/organization-card.tsx`, tests — article/name/help/72px protected logo/fallback/disabled text and portalAction slot.
- [x] `features/organizations/organization-types.tsx`, tests — every mapped type including Population Health, aliases/duplicates, unknowns, ordering, four-icon cap and overflow labels.
- [x] `features/organizations/organization-primary-contact.tsx`, tests — exact Primary selection, middle-name sentinels, dash/phone/email safety,44px and wrapping.
- [x] `e2e/account-organizations-card.spec.ts` — actual image failure/success, all Tooltip/InfoPopover input modes, both themes,360px, keyboard and axe.
- [x] `spec-10-2-organization-card.md` — record completed code checks separately from outstanding demo/prod origin QA; append follow-up without editing old deferred entries.

**Acceptance Criteria:**
- Given all platform types or unknown/empty strings, when cards render, then no crash occurs and labels/order/overflow exactly match10.2.
- Given missing/unsafe/very long contact fields, when popover opens, then placeholders and safe links remain readable within real bounds and keyboard focus follows the shared contract.
- Given disabled membership, when using card hints/contact/logo, then those interactions work while10.3's portal action remains inert.

## Implementation Notes

User chose option1 for real-logo validation: complete code/tests and leave real demo/prod verification to QA. Full exact icon mapping/copy comes from10.2 epics. Root supplies frozen OrganizationPortalItem/copy; card worker owns its subtree only. Coordinate card integration through action slot to avoid overlapping writers. No finished earlier story in Epic10 exists to reuse; preserve inherited handoff/image behavior.

## Verification

MSW/component coverage, every icon and sentinel, actual protected-image fallback semantics, real browser text/image geometry and keyboard/axe/touch in both themes and360px. Shared route tests prove cache isolation/image hardening. Mocked success never closes actual-host QA. Full integrated checks and BMAD review before local completion.


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

Card worker owns only features/organizations/organization-card.tsx, organization-types.tsx, organization-primary-contact.tsx, colocated tests, and e2e/account-organizations-card.spec.ts. Do not write list, action, common API/messages/fixtures. Report QA follow-up text to root; root appends the shared deferred artifact.

Prerequisite delivery: PR43 merged as85be9c79d59f152391a0c594f0f05c2c86a11be8 after both CI runs and Vercel passed; this commit is present in the integration branch. The original captured baseline remains unchanged.

Catalog constraint: MESSAGE_CATALOG values are flat strings. Build feature-local typed maps/registration rows from the flat ORG_MESSAGES labels/descriptions; do not add nested catalog objects or arrays.

Insurance type label reuses existing SHELL_MESSAGES.profileTabInsurance; do not duplicate it in ORG_MESSAGES.

## Tasks and Matrix Audit

- Matrix Logo/Name: card unit/browser tests cover held/success/error images, source identity changes, decorative72px images, full accessible name, missing-name fallback, ellipsis and heading hover/focus/touch without an extra sequential Tab stop.
- Matrix Types/Overflow: all mapped icons, unknown/blank/empty, duplicate aliases and both alias arrival orders, originating-platform priority, alphabetical remainder, four-icon limit and singular/plural overflow tested; browser covers pointer, keyboard and touch.
- Matrix Contact/Email/Disabled: component/browser tests select first exact Primary, normalize name sentinels, format phone, show three dashes, reject unsafe protocol-shaped email links, wrap long email within280px with44px targets, preserve hint/contact access on disabled cards, and scan light/dark axe atdesktop/360px.
- Actual demo/prod logo origin verification remains human-approved QA work; appended follow-up to deferred-work.md without changing old entries.

Integrated fresh production build and Playwright:100 passed,2 expected modality-specific skips; desktop/mobile, light/dark axe, Account and shared fixture regressions. Log: /tmp/epic10-final-browser.log. Root inspected the unified diff including new files; accepted source changes preserve foundation ownership. Formal final review remains pending.

Final integrated acceptance checks:241 test files /7,624 tests passed;100% statements/branches/functions/lines over all enforced libraries AND features/organizations (139 fully covered files, no coverage exclusions added). Report /tmp/epic10-acceptance-coverage and log /tmp/epic10-acceptance-tests.log. Production/browser100 passed,2 expected input-modality skips. Full lint, types, forbidden/token gates and whitespace pass. The three stories receive one integrated BMAD Build review with10.1 as coordination/triage log, and the requested standalone bmad-code-review subsequently reviews the complete story change. Original captured baseline and all frozen approval blocks are preserved.

### Integrated Build review completion

All three BMAD Build review layers completed. Per-finding verdicts and grouped fixes are recorded in spec-10-1-organizations-list.md; no unresolved implementation blocker remains. Accepted patches: prevent paging an obsolete filter during debounce, trim displayed-name sort keys, scan actual zero-result accessibility, exercise both internal creation handoffs, and prove UJ104 removes a nonmatching organization. Original implementers supplied owned patches; root inspected them.

Post-review verification:241 files /7,626 tests passed;100% statements/branches/functions/lines over the enforced libraries and features/organizations,139 fully covered files, no new exclusions. Production build and browser regressions:104 passed,2 expected modality skips, no retries/failures. Lint, typecheck, forbidden/tokens and whitespace checks pass. Logs: /tmp/epic10-reviewed-acceptance-tests.log and /tmp/epic10-reviewed-final-browser.log. Real-origin and intended-tenant QA remain explicitly pending under approved option1; these local checks do not claim them. Requested standalone bmad-code-review is running against the integrated story change before final delivery.
