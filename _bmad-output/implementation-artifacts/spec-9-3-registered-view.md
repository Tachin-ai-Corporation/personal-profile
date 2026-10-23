---
title: 'Complete registered provider view (NG-9041)'
type: 'feature'
created: '2026-10-21'
status: 'done'
baseline_commit: '0001fdd03b28ba25f83c19fa6d24218e0e42f4b8'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

Implement Story 9.3: replace the minimal registered NPI row with complete read-only credentials, lazy practice support, signature and the appropriate membership notice or practice-registration action. Reuse 9.2 availability and exact Story 9.3 order/copy/foundation decisions in `epics.md`.

## Boundaries & Constraints

**Always:** Reuse KeyValueTable, SectionContainer, InfoPopover/LinkTextButton, SignatureThumb, shared placeholders/formatters/safeHref, isTenantMember and guarded navigation. Preserve UserNpi public fields and add only needed display fields. Verify backend DTOs; normalize display sentinels separately from strict search/record-id schemas. Foundation privacy prerequisite merges first.

**Never:** Edit/register/unregister controls in this view, raw links to app routes, blob signature conversion, new named operations, sys-config passthrough, browser-selected tenant, shared helper/UI/aggregator changes, Team A edits or cached search selections. Only explicit false from eligibility permits CTA; errors never become availability.

## I/O & Edge-Case Matrix

| Scenario | Input/state | Expected behavior | Failure handling |
| --- | --- | --- | --- |
| Table | providerNpi present | Nine rows in FR116 order; desktop paired columns, mobile one pair | All specified absent/null/blank/n/a/-1 values become Not provided before wrapping elements |
| Fields | Provider/practice/HIE DTO | NPI,taxonomy,HIE,practice name/address/NPI,licenses,personal two-line practice address,signature | Preserve organization presence even with unusable tenant id; strict ids remain separate |
| Support | Practice organization present | Name button; fetch support key on first open only; name/phone/safe mailto or dash | Loading; local403; mapped error and key-only Retry; no tab-wide denial |
| Membership | Organization and known identity | Shared membership helper: member neither; nonmember info notice; no eligibility request | Unknown tenant/identity/error: suppress actions; never qualify CTA |
| Eligibility | No org, verified strictly true, known identity | Uncached abortable check using practice record id; false gives CTA | True/failure/malformed/403 quiet; session stays global |
| Signature | Myself pending/present/missing | Thumb-sized skeleton; existing image thumb or No signature available; help and Profile link | Image failure fallback; identity failure uses existing PageFrame Retry, table stays |
| Navigation | CTA or Profile link | Existing same-tab handoff or contacts#signature through navigate | Existing Account dirty leave guard; no logout or draft purge |
| Registration completion |9.2 acknowledged/fresh read | Full view and h2 focus | Root controller owns completion/error latch |

</frozen-after-approval>

## Code Map

- `features/provider/registered-view.tsx`: current one-row stub; proposed prop `registration: UserNpi`; root updates sole ProviderTab call site.
- `lib/api/npi.ts`: root adds validated optional taxonomy/license/location lines/practice organization/verified fields. Backend `v2/dto/oneHealth/{PersonWithNpiDTO,BaseProviderNpiDTO,ProviderNpiDTO,PracticeNpiDTO,HieEndpointDTO}.java` confirms wire names.
- `lib/api/practice-support.ts`: existing path; add loader/registerFetcher for existing keys.practiceSupport; named op and whitelist already built/tested.
- `lib/api/myself.ts`: signature, tenants and isTenantMember already exist; no changes.
- `features/shell/{key-value-table,signature-thumb,use-myself}.tsx/ts`, `components/ui/info-popover.tsx`, `lib/shared/{display-value,safe-href,phone}.ts`: reuse semantics, not copies.
- `features/shell/page-frame.tsx`: owns exhausted identity error/Retry; do not hide without replacement.

## Tasks & Acceptance

- [x] `spec-foundation-tooltip-keyboard-scroll.md` — integrate the separate shared focus-scroll correction, then repeat the original registered-view keyboard/browser check before completion.

**Execution:**
- [x] `lib/api/npi.ts`, `npi.test.ts` — root extends read mapping additively; sentinel/malformed/whitelist tests; preserve strict search contract and public npi:string.
- [x] `lib/api/practice-support.ts`, `practice-support.test.ts` — validated whitelisted support loader with failure metadata and existing fetcher key.
- [x] `lib/shared/messages/npi.ts`, `e2e/fixtures/npi.ts` — root supplies unique labels/notice/action/help and full synthetic fixtures; reuse existing signature/Profile strings.
- [x] `features/provider/registered-view.tsx`, `practice-support-popover.tsx`, `registered-practice-action.tsx`, `use-registered-practice.ts` — presentation, lazy read, private eligibility lifecycle; no external feature dependency.
- [x] `features/provider/registered-view.test.tsx` — every field/sentinel, support lazy/error/retry, membership/CTA exclusivity, identity loading/failure, signature and exact navigation matrix.
- [x] `features/provider/provider-tab.tsx` — root composes new prop alongside 9.2 completion; one file owner.
- [x] `e2e/account-provider-registered.spec.ts` — complete table, support, signature hints, guarded Profile navigation, membership notice and same-tab CTA; both themes/360px.

**Acceptance Criteria:**
- Given valid backend credentials, when read, then all nine values appear in FR116 order and every required missing-value case stays readable.
- Given organization/member/verified/availability combinations, when settled, then notice and CTA never coexist; support403 never hides the tab and failed eligibility never offers registration.
- Given delayed identity or support reads, when using real consumers, then no action flashes, support stays lazy, Retry touches only its key and old answers cannot affect another practice.
- Given keyboard/mobile users in either theme, when traversing the table/popover/hints/navigation, then focus order/44px targets/axe/overflow checks pass.

## Implementation Notes

- Human approved this specification on2026-10-21. Implement9.2/9.3 in parallel only after the separate foundation privacy PR is merged; this explicit user instruction overrides the workflow's sequential-only default. Root owns common API/copy/fixtures and composition. Story publication remains outside implementation scope.

## Spec Change Log

- 2026-10-21: Foundation privacy PR38 merged after complete CI passed. Baseline includes the independently merged Phone-theme test fix (PR36); no changes to that work.

## Review Triage Log

### Integrated9.2/9.3 review triage

All three layers completed before triage (blind10, edge2, verification1). Each finding is graded separately before grouping.

| Finding | Verdict | Evidence and route |
| --- | --- | --- |
| Blind1: same practice, changed organization retains support | medium | PracticeSupportPopover keys only practice.id and fetches once per mount. A new registration object with unchanged practice id but new tenant retains ready/contact data. The read contract permits changed organization data. Patch the existing lifecycle key with organization tenant identity and cover held old answers. |
| Blind2: rejected support mutate leaves permanent loading | low | Rejection requires a throwing consumer SWR callback; ordinary API/network/malformed responses are contained by SWR and current support tests pass. Production SwrProvider supplies no such callbacks. Containing this uncommon extension would add exceptional-state/retry branches beyond a direct correction. Reject under the low/rare complexity rule; no production failure is claimed. |
| Blind3: acknowledged latch disappears across tab remount | medium | PageTabs explicitly mounts only the selected panel. After acknowledged POST then valid-unregistered read, unmount/remount resets acknowledged=false and a second valid-unregistered read exposes the form. Patch the existing monotonic fact to survive within the same SWR cache/page lifetime, retaining no picks or disk data. Add actual command/remount/read-only-retry coverage. |
| Blind4: BFCache return after abandoned POST lacks reconciliation | medium | pagehide clears/aborts the command but the still-mounted controller has no pageshow listener. An upstream-accepted write with an abandoned response can return to an idle cached form. Patch the existing controller to refresh on persisted pageshow and verify a committed-but-abandoned write resolves to the registered read without replay. |
| Blind5: fallback overwrites useful parallel-check message | low | Results are visited personal then practice, and each generic error replaces the single banner. A later masked/malformed failure can hide an earlier approved4xx platform message. Direct patch: keep an existing useful message when the next text is only registrationFailed; cover both personal/practice orderings. |
| Blind6: arbitrary10ms eligibility-negative wait | low | calls increments in the request handler before JSON parsing and hook state settle; sleeping10ms is not a completion boundary. Patch tests to await the actual availability promise and flush React before absence assertions, without changing production UI for testing. |
| Blind7: registration browser fixture ignores entity type | low | Browser fixture supplies both records to either query and selects the second practice option; the wrong practice query could pass this browser flow, although API/command units cover the contract. Direct fixture patch: per-query results and explicit fixed entity assertions. |
| Blind8: dirty Account edits before Provider destinations untested | false | Current PageTabs mounts only the selected panel; dirty Account navigation is stopped before Provider becomes available. Existing account-settings-edit browser test exercises that exact Provider-tab guard, and registered-view units use the actual shared leave guard for both Profile and handoff. A simultaneously dirty mounted Account form and visible Provider destinations is not a reachable product state. |
| Blind9: consumer hover/tap lazy-read timings not repeated | low | Consumer receives only onOpenChange(boolean), with no device branch. Foundation InfoPopover tests execute delayed hover, cancelled hover, focus and touch through the same callback; feature tests prove first-open gating/reuse. Repeating that timing cross-product adds fixture/timer complexity for negligible new consumer risk. Reject. |
| Blind10: Tooltip candidate not yet integrated into delivery revision | medium | Real pre-existing shared race remains on the unpatched story branch; reviewed local foundation ab04792 fixes it and unchanged combined-candidate browser checks pass20/20. Separate prerequisite publication/integration needs the final human checkpoint already requested. Defer the pre-existing shared defect to that foundation delivery; final story completion remains gated and is not claimed. |
| Edge1: same practice/new tenant support stale | medium | Verified independently: opening stays ready across tenant change because the key contains only practice.id. Same root cause as Blind1; group only after this separate verdict and use the same lifecycle-key patch/regression. |
| Edge2: short practice-name trigger under44px wide | medium | Shared LinkTextButton guarantees min-h-11 but no minimum width. A short name or '-' support trigger can be narrower than the design's44px touch target. Direct local min-w-11 class and real short-name browser geometry regression; no shared component edit. |
| Verification1: form retry does not prove fresh availability | low | Filed regression gap is trusted: existing repeated failed POST test always responds false, so caching a previous availability answer could pass it. Patch command test with false→true between submissions and assert the taken field error, fresh checks and no second POST. |

Survivor groups: Blind1+Edge1 share the support lifecycle key; the other patches are independent. Blind10 is tracked as a separate shared prerequisite delivery, not a story source patch. No captured-intent change or public API change is required.


## Design Notes

### Parallel integration contract

Root implements `isNpiRegistered(recordId, options?: { signal?: AbortSignal; userInitiated?: boolean })`, defaulting to passive activity, and `registerNpi({providerNpiId, practiceNpiId?}, signal?)`. Availability returns only validated booleans; malformed200 is failure. Search schemas remain strict. `UserNpi` retains registered/provider/practice/hie, id:number and npi:string, adding optional backend-named registered display fields only. Read display sentinels are normalized without weakening search validation.

`NpiSearch` receives `{onFailure: (mapped: MappedError) => void, onRegistered: () => Promise<void>}`. `RegisteredView` receives `{registration: UserNpi}`. Root owns `use-provider-controller.ts`, `provider-tab.tsx`, existing `provider-tab.test.tsx`, NPI API/allowlist/copy and `e2e/fixtures/npi.ts`. The9.2 agent owns the command component/hook and its new unit/browser tests; the9.3 agent owns the registered subtree, private hooks/components, practice-support API/tests and its new browser spec. Agents run only focused tests; root runs integrated coverage/build/browser checks after writers stop. No branch changes by workers.

Work on 9.3 presentation/support can run alongside 9.2 command implementation after root freezes common types and availability API. Root owns npi API/copy/fixtures/composition;9.3 agent owns the registered-view subtree and practice-support module. Existing page-level identity errors remain visible; unknown organization identity fails closed without a speculative membership notice. Provider registration remains based on provider-object presence, not whether its display NPI is populated.

### Confirmed boundary details

The backend registration response is empty200; `callApi<void>` already acknowledges it. Return its result unchanged: never reinterpret a failed identity preflight or unreadable response as a successful write. Availability is uncached and validates an actual boolean. Existing numeric ten-digit search validation remains unchanged.

Registered display mapping separately accepts missing/null/blank/n/a/-1 sentinels, retaining `npi:string` and positive safe record ids. Practice `verified` is the actual DTO flag. Preserve a present organization object even when its tenant is missing/unusable; usable tenant ids are non-negative safe integers (including0 and numeric strings). Do not turn unknown organization identity into absent organization.

Root also owns adjustments to existing `e2e/account-provider.spec.ts` assertions/names when the old inert Register assumption becomes obsolete. Acknowledged completion uses a mounted monotonic latch and read-only retries; SWR key-only mutate may resolve stale data after failure, so current read error/provider presence and explicit completion loading govern readiness and heading focus.

### Frozen common implementation interfaces

Root common API/types/copy/fixture implementation is now available. Use the actual exports, without editing their files. New copy keys in `NPI_MESSAGES`: personalNpiRequired, registering, registrationFailed, providerRegistered, providerPracticeRegistered, taxonomy, healthInformationExchange, practiceName, practiceAddress, practiceNpi, licenses, addressOfPractice, organizationExists, registerPractice, signatureUnavailable, aboutSignature, signatureHelp. Reuse SHELL_MESSAGES.signature/pageProfile/signatureAlt and existing common copy.

Browser helpers exported through existing fixtures: `mockNpiAvailability(page, recordId, answer?)`, `mockRegisterNpi(page, answer?)` (default empty200), and `REGISTERED_PROVIDER_NPI` (complete synthetic wire object). Workers own ONLY their listed feature files and their new story-specific tests; root owns these common interfaces, current provider composition/controller, existing provider tests and story tracking/spec completion. Workers do not edit specs/sprint tracking, commit, push, switch branches, run broad suites or build; report any required common-contract change to root. All work is on the current story branch, after PR38 merged. Read CLAUDE.md and installed `.claude/skills/react-standards/SKILL.md`; use the Framework app profile with the project's SWR/per-area decisions overriding generic defaults. Read relevant installed Next guides before component work.


### Integrated verification evidence before final BMAD review

- Foundation privacy PR38 merged as0001fdd03b28ba25f83c19fa6d24218e0e42f4b8, after both complete CI runs and preview passed. No story publication performed.
- Full unit suite:6,756 tests in223 files passed; enforced library coverage100% (2,780 statements,1,903 branches,629 functions,2,307 lines).
- Provider feature suite:106 tests passed; eight implementation files100% statements (283), branches (250), functions (64), lines (212).
- Lint, typecheck, forbidden/token checks and whitespace checks passed. Production build and Provider browser suite passed45 tests with one desktop skip for a mobile-only case.
- Repeat validation exposed a pre-existing shared Tooltip native focus-scroll race:6/10mobile failures versus0/10desktop; the unchanged assertion still requires exact help text and focused trigger. A separate foundation prerequisite is being prepared on `feat/foundation-tooltip-keyboard-scroll`; no shared source is edited in this story branch. Final keyboard verification/review awaits its correction. The existing shared primitives browser spec also documented pre-scrolling to avoid this issue.

## Verification

Targeted support/NPI/registered-view tests and meaningful changed-code coverage; full enforced coverage and static gates; production registered-view and 9.2-to9.3 browser flows with keyboard/axe; integrated BMAD review. Update only 9.3 story tracking, preserving header.

Matrix audit: Table/Fields/Support/Membership/Eligibility/Signature/Navigation are covered by `registered-view.test.tsx` and `practice-support.test.ts` (47 focused cases), including real shared navigation guards, real malformed mailto validation and held old-support answers across practices. Registration completion is covered by the actual command→ProviderTab tests. Production browser coverage passes normally; the repeated shared Tooltip race remains a required foundation dependency, not a weakened or skipped assertion.

### Candidate dependency and integrated review

The separately reviewed shared Tooltip correction is prepared locally as ab04792 on feat/foundation-tooltip-keyboard-scroll. Publication/integration approval is pending; the story branch contains no shared changes. An isolated combined candidate using its actual pinned-package patch passes6,763 tests/223 files with enforced library coverage100%, all static gates, and20/20 repetitions of the unchanged original registered-view keyboard browser case. Full story production browser previously passed45 with one intentional desktop skip for a mobile-only case. Implementation acceptance is verified against that combined candidate; delivery integration remains pending and is not claimed complete. Proceed with read-only integrated review of both story implementations while the separate delivery checkpoint is pending.

### Integrated review patch verification

- All thirteen findings received individual verdicts before grouping; same-practice/changed-tenant support findings share one lifecycle fix. Required patches are implemented and the same original workers verified their own changes.
- Root reproduced acknowledgement loss on tab remount (two variants) and an abandoned server-committed POST on persisted page return before fixing them:3 failures with an ordinary-pageshow passing control. A private WeakMap keyed by the existing SWR cache retains only acknowledgement/focus-consumption metadata for the page lifetime (D5), never picks or storage. The heading focus is consumed once, including after remount/read Retry; ordinary future tab visits do not steal focus. Persisted pageshow invokes existing read-only refresh and never replays a command. All50 controller/composition tests pass with100% changed-controller/entry coverage.
- Integrated feature tests:118/3 files passed; all eight implementation files100% (299 statements,259 branches,68 functions,223 lines). Full combined candidate:6,777/223 files passed; enforced libraries100% (2780 statements,1903 branches,629 functions,2307 lines). Logs: /tmp/provider-review-feature.log and /tmp/provider-integrated-reviewed-coverage.log.
- Updated shared touch targets locally, tenant-only support replacement with held old response, deterministic eligibility completion, mixed-check banner precedence, fresh availability on retry, and per-entity browser fixtures. A root fixture correction preserves explicit null availability as malformed data rather than converting it to false.
- Production Provider browser:41 cases passed with one intentional mobile-only desktop skip; six additional short/missing-name target cases passed after making their successful support mock explicitly200 (its shared helper intentionally defaults404). No production expectation was weakened. Full combined browser suite is running separately.
- Current lint, typecheck, forbidden/token and whitespace gates pass. A follow-up independent review traced completion caches, focus consumption, persisted restoration and tenant-keyed support; it found no new regressions and its86 focused tests passed.
- Human explicitly authorized publishing and merging the separate Tooltip foundation prerequisite. PR40 is open at https://github.com/Tachin-ai-Corporation/personal-profile/pull/40, preview passed, both complete CI runs pending. Final actual-branch integration and keyboard/browser acceptance remain gated on its successful merge. No story publication is authorized or performed.

### Final integrated delivery verification (2026-10-21)

- Human authorized prerequisite publication/merge; foundation PR40 merged after both complete CI runs passed (14m36s/21m46s), without a bypass. Its merge commit is faf0dfe5311285259c138c1037670b1745a76d0b. Foundation privacy PR38 was already merged before implementation. Current main also includes the independent file-delete foundation PR39; that source is not changed by these stories.
- This story branch fast-forwarded to current origin/main and restored all implementation work. The only stash-apply conflict was the append-only deferred-work log; both entries were preserved, with no source conflict. Captured baseline remains0001fdd03b28ba25f83c19fa6d24218e0e42f4b8. The actual story diff against origin/main contains only Team B implementation/area contracts and its tracking artifacts; upstream foundation changes belong to their own reviewed PRs.
- Frozen offline install and actual-branch production build pass. Actual-branch full units:6,792 passed/223 files; enforced libraries100% (2805 statements,1919 branches,636 functions,2325 lines). Actual-branch Provider browser:47 passed,1 intentional desktop skip for a mobile-only case. Original registered-view keyboard assertion then passed10/10 additional actual-branch repetitions across desktop/mobile and both themes, without pre-scrolling or weakening it. Logs: /tmp/provider-delivery-unit.log, /tmp/provider-delivery-browser.log, /tmp/provider-delivery-keyboard-repeat.log.
- Full combined browser suite previously passed1,106 cases with12 intentional skips and no retries. All22 story source/test files matched that tested combined candidate byte-for-byte. Feature tests118 passed with100% all metrics across eight implementation files. Actual-branch lint, standalone typecheck, forbidden/token and whitespace gates pass.
- Every implementation/matrix task is complete, including the separate Tooltip integration. BMAD review patches are resolved; the shared pre-existing focus-scroll defect is now resolved by PR40. The independent baseline DisabledAction Escape-after-protected-press intermittency remains documented for foundation follow-up; it was not suppressed or claimed fixed. All current complete browser runs pass.
- Final story specs are done and their sprint keys are review, preserving the tracking header and other teams' lines. Root prepares the local conventional implementation commit; no story push or PR publication is performed.

### Review Findings — standalone bmad-code-review (2026-10-21)

The specific `bmad-code-review` workflow was run separately from the earlier Build review. Target: eb264d7 against origin/main faf0dfe (26 files,2200 insertions,59 deletions;2583 diff lines). Both approved specs plus Foundation/Epic9 context were loaded. All four independent layers completed before triage: blind hunter10, edge hunter1, acceptance auditor1; verification-gap reviewer reported no gaps. The fourth reviewer started when a concurrency slot became available. No layer failed. Each finding below has its own verdict before grouping; none was silently dropped.

| ID / source | Finding and verdict | Verified evidence / disposition |
| --- | --- | --- |
| 1 / blind-hunter | Restoration reuses a pre-navigation read — **medium** | `use-provider-controller.ts:27,43` returns the existing running promise. Held initial GET → persisted pagehide/pageshow → release stale unregistered response produces only one GET and a visible form. Reproduced deterministically. **Patch:** queue one fresh reconciliation after the in-flight read, preserving single-flight and expiry/unmount guards. |
| 2 / blind-hunter | Abandoned POST commits after tab-remount reconciliation — **low** | A deterministic delayed-commit ordering exposes the form and permits an unnecessary second manual attempt. Backend `PersonServiceImpl.java:607–615` rejects an already claimed personal NPI or already registered person; the repro demonstrates stale UI/rejected extra command, not two successful registrations. **Reject:** uncommon leave/remount-before-commit ordering; retaining uncertain writes needs new lifecycle state and recovery policy beyond a direct correction. Current approved failure policy permits manual retries after unacknowledged failures. |
| 3 / blind-hunter | Same-practice eligibility snapshot survives focus revalidation — **low** | Persisted restoration explicitly unmounts the view and rechecks. SWR focus/reconnect can keep the mounted view and its last availability answer if eligibility inputs are unchanged. CTA can therefore reflect an earlier snapshot if availability changes independently. **Reject:** passive CTA leads only to guarded portal handoff, not a registration write; eliminating this uncommon snapshot drift requires additional invalidation/subscription policy and still cannot guarantee continuous freshness. |
| 4 / blind-hunter | Short support email target is narrower than44px — **low** | Actual production browser at360px: `a@b.c` yields42×44px. The new email anchor supplies minimum height only. **Patch:** add minimum width locally and retain meaningful browser geometry coverage. |
| 5 / blind-hunter | Unbroken support email overflows popover — **medium** | Actual production browser at360px: synthetic140-character email creates a1149.17px-wide link inside a280px popover; its right edge is1230.17 while the popover ends at344. Page-level scrollWidth alone still passes, so the existing overflow check misses clipped/inaccessible content. **Patch:** constrain link width and allow its text to wrap; verify link/content bounds, not only document overflow. |
| 6 / blind-hunter | Held identity/verified eligibility transitions lack dedicated cases — **false** | No stale-action defect demonstrated. `RegisteredPracticeAction` key includes identity/readiness/verified/organization presence; transitions remount the hook, abort the old request and clear its answer. Hook also checks abort and exact IDs. Existing tests cover prerequisites and held obsolete practice responses. Additional cross-product cases are optional, not evidence of broken protection. |
| 7 / blind-hunter | Browser no-replay cases omit actual connection failure — **low** | Browser cases cover502/504; consumer failure mapping and the shared transport's network/no-replay behavior are covered in lower-layer tests. **Reject:** repeating a normalized transport outcome through another browser fixture adds setup/maintenance without a demonstrated consumer-specific branch or everyday defect. |
| 8 / blind-hunter | No separately held asynchronous-validation double-submit case — **false** | `submit` sets `pending.current=true` synchronously before calling asynchronous `handleSubmit`; the next activation returns before validation. Existing duplicate-activation coverage and validation-abandonment tests exercise this boundary. No early unlock or unguarded validation path exists at the cited location. |
| 9 / blind-hunter | Restoration read can precede abandoned POST commit — **low** | Complementary deterministic repro confirms the same stale-form/rejected-extra-command outcome as finding2, with persisted restoration instead of tab remount. **Reject separately:** uncommon delayed-commit ordering and new uncertain-write/recovery state would be required; backend existing-registration checks limit the demonstrated harm. No duplicate successful registration was established. |
| 10 / blind-hunter | Organization-backed placeholder uses link-text appearance — **false** | FR116/UX-DR-P17 explicitly requires a link-text-styled practice-name button when an organization exists. The implementation normalizes sentinels to `COMMON_MESSAGES.notProvided` before wrapping and preserves that support trigger; the unknown-name/tenant test verifies it. The cited specs do not require overriding an actionable button with the static empty-cell color. |
| 11 / edge-case-hunter | Throwing SWR error callback strands support loading — **false** | The reported condition requires a configured callback that throws. The production `SwrProvider` config has no such callback, and API/network/schema failures go through the contained SWR error path already exercised by support error/Retry tests. No reachable production rejection of this kind was established. |
| 12 / acceptance-auditor | Availability proxy accepts IDs outside positive-safe contract — **medium** | `allowlist/npi.ts:15` uses `{n}`; existing `proxy/match.ts:12,36` accepts any1–19 digits, including0 and9007199254740992. The new helper rejects them but direct proxy requests are broader. The POST body remains strict. **Defer:** pre-existing shared matcher capability gap; T2 requires a separate foundation PR for additive per-entry parameter validation, not a story-local bypass or globally narrowed matcher. |

Survivors are independent root causes:3 patch entries and1 foundation defer. No intent decision is needed for the local patches. Every rejected finding retains its verdict/evidence above and in the appendix below.

- [x] [Review][Patch] Queue a fresh persisted-restoration read after an already-running pre-navigation read settles [features/provider/use-provider-controller.ts:27] — Story9.2, finding1, medium.
- [x] [Review][Patch] Guarantee a44px-wide support-email target [features/provider/practice-support-popover.tsx:39] — Story9.3, finding4, low.
- [x] [Review][Patch] Constrain and wrap long support emails within the popover [features/provider/practice-support-popover.tsx:39] — Story9.3, finding5, medium.
- [x] [Review][Defer] Add opt-in positive-safe path-ID validation through a separate foundation change [lib/server/proxy/allowlist/npi.ts:15] — finding12, medium; existing shared matcher supplies no per-entry numeric bounds. Typed caller/POST validation already reject these IDs. Foundation follow-up recorded in deferred-work.md.

Verification evidence: `/tmp/provider-blind-lifecycle-repro-20261021.log` has3 passing deterministic counterexamples (source retained beside it as `.test.tsx`); `/tmp/provider-code-review-probe.log` has2 intentionally failing360px geometry assertions proving findings4/5, with traces in `/tmp/provider-code-review-probe-results/` and probe source `/tmp/provider-code-review-browser-probe-20261021.spec.ts`. Temporary probe files were removed from the repository; no production source was changed. Existing passing full-suite evidence remains recorded above and is not misrepresented as covering these newly identified cases. No commit, push or PR action performed in this review run.

#### Rejected

- Finding2 — **low:** delayed commit after abandoned tab command can cause an unnecessary rejected manual attempt; uncertain-write state/recovery complexity is disproportionate to the uncommon demonstrated outcome. Backend rejects existing registration.
- Finding3 — **low:** passive availability snapshot can age independently; a new invalidation/subscription policy adds complexity without guaranteeing continuous freshness or protecting a local write.
- Finding6 — **false:** identity/verified changes remount the keyed action, abort old requests and clear answers; no stale CTA path demonstrated.
- Finding7 — **low:** additional network-failure browser setup repeats normalized transport and consumer behavior already covered below the browser layer.
- Finding8 — **false:** synchronous pending ref guards before asynchronous validation; a second submit cannot enter validation concurrently.
- Finding9 — **low:** separately verified restoration variant of finding2, with the same uncommon harmlessly rejected second-command outcome and disproportionate recovery state.
- Finding10 — **false:** exact spec requires organization-backed practice names to remain link-text buttons; sentinel text is already normalized and readable.
- Finding11 — **false:** throwing configured SWR callback is absent in the production provider; ordinary failures are contained and display Retry.


#### Approved patch execution (2026-10-21)

The human selected option1, apply all3 local patches. All are fixed on the same feature branch. Finding1 queues a fresh read after a pre-navigation read settles, using the existing lifecycle guards and single-flight refresh. Findings4/5 add local min-w-11/max-w-full/overflow-wrap:anywhere to the existing support email link; no shared UI/API surface changed.

The added real-browser regressions exercise5-character and140-character emails in desktop/360px and both themes. They assert44px targets, actual text Range rectangles within content/link bounds, popover viewport bounds, safe mailto destination, keyboard entry/Escape and axe. They do not rely solely on document scrollWidth, which missed the original clipped content. The unchanged registered-view keyboard/navigation cases also pass.

Final actual-branch evidence:6796 unit tests/223 files,100% enforced library coverage;122 Provider tests, all8 implementation files100% (299 statements,261 branches,68 functions,223 lines). Fresh production build and51 Provider browser cases passed,1 intentional desktop skip for a mobile-only case, no retries. Lint/typecheck/forbidden/tokens/diff checks pass. Logs: /tmp/provider-code-review-fixed-units.log, /tmp/provider-code-review-fixed-feature.log, /tmp/provider-code-review-fixed-browser.log; browser traces directory /tmp/provider-code-review-fixed-browser-results/.

Standalone review actions:0 decisions,3 patches resolved,1 foundation defer unchanged,8 rejected. Story9.3's own implementation/acceptance is done. Story9.2 separately records in-progress because finding12 remains an unresolved medium contract requirement in shared proxy validation; no unapproved foundation patch is included here. Sprint status was not synced because this combined branch-target review did not set a single workflow story_key; existing review entries and the protected header/last_updated are preserved. Changes remain local and uncommitted; no push or PR action.
