# Integrated work review — 2026-10-21

Status: complete; the development dependency advisory is mitigated locally, with upstream release tracking still open. Branch: `chore/integrated-work-status-and-code-review`.
Baseline: `ec0f45048bd7ac95dafdb399e26f6df2cf49e427` (merged PR34).

## Authorized scope and method

Reconcile implemented stories still marked review; review current integrated Team A, Team B and foundation code against BMAD and the shared React/TypeScript standards; apply necessary verified fixes/refactors. User selected grouped review first, then a second complete integration review. No new backlog stories are implemented by this maintenance work.

Snapshot: 625 tracked application/test/tooling files, 98,160 unified-diff lines (full current contents against an empty tree). Groups: Team A38 runtime files, Team B22, server65, API/shared81, UI/shell123, tests/tooling296. Diff, manifests, reviewer outputs and validation logs are under `/tmp/personal-profile-integrated-review-20261021/`.

BMAD spec context: `_bmad-output/planning-artifacts/epics.md`, implemented stories1.1–1.15,2.1–2.4,3.1–3.7,4.1–4.4,7.1–7.6,8.1–8.3,9.1. Review local approved story amendments and foundation decisions before reporting a generic-standard disagreement. Backlog1.16,5.*,9.2/9.3,10.* and Medical placeholder are outside implementation scope.

## Tracking reconciliation

-13 stories review→done, each checked against a done spec and an integrated PR:3.1–3.7 (PR19),4.1–4.4 (PR26),7.6 (PR17),8.3 (PR25).
- Epic2/3/4/7/8→done; Epic9→in-progress after Story9.1 (PR34).
-51 ordinary stories:40 done,11 backlog. Tracking header and all backlog states preserved. This is implementation/integration status, not a production-release acceptance claim.

## Standards and toolchain

Framework app profile: Next16.4, React19.3, TypeScript6.0.3, Tailwind4.3, SWR2.5, RHF7.90, Zod4.6, Vitest5.0, ESLint10.12, pnpm12.11 via corepack, Node24. Project-specific ownership, per-area export registries, SWR and approved draft/auth decisions take precedence over generic template defaults.

Sources: project `CLAUDE.md`, `docs/FOUNDATION.md`, `docs/AUTH-ARCHITECTURE.md`; sibling `dev-std-ai-agents-and-skills/stacks/react/CLAUDE.md`, `AGENTS.md`, `react-standards/SKILL.md` and React auditor instructions. Shared standards template version2 had27 missing managed assets; installed via its project-level updater (agents, skills, portable prompts, hook scripts and version marker). Hook activation is separate from copying scripts: existing project-owned settings and CI remain the source of the active gates.

## Initial validation

-6,364 tests /219 files pass;100% enforced statements, branches, functions and lines.
- Lint, typecheck, forbidden/token checks pass.
- Tracking reconciliation verified: exactly13 ordinary-story lines changed,11 backlog stories retained, header unchanged.
- Exploratory compiler ratchet: noImplicitOverride/noFallthroughCasesInSwitch work; erasableSyntaxOnly identifies four constructor parameter-property sites. No broad strictness migration or dependency upgrade has been applied.

## Grouped review

Four independent BMAD layers: blind-hunter, edge-case-hunter, verification-gap, acceptance-auditor. Grouped review completed before triage. Relevant consumer tests were traced rather than assuming file/coverage presence proves integration. Reviewer coverage ledgers distinguish actual reads from searches.

## Complete integration review

Second pass completed as one unified 627-file current source/test/tooling block, with a supplemental maintenance diff. Four fresh BMAD layers returned before triage. Inspected cross-boundary integration and all maintenance surfaces; this pass was targeted rather than an exhaustive reread of every source/test line. The blind reviewer established two reproducible findings, below its requested artificial floor of ten; this limitation is recorded instead of manufacturing findings.


## Grouped triage (all four layers returned before verdicts)

No failed review layers. Runtime source coverage:329/329 each for blind, edge and acceptance; verification traced representative real consumers/tests and reported no gaps. The625-file manifest includes tests that were searched and selectively read; this is not a claim of exhaustive dynamic acceptance or live-upstream QA. Raw findings and exact coverage ledgers are in `integrated-review-2026-10-21/`.

| ID/source | Verified finding and location | Verdict | Evidence / route |
| --- | --- | --- | --- |
| B1 blind | Ping/refresh thresholds, session-routes.ts:65 | high | Ping requires>55s but refresh no-ops above30s, so31–55s pings replay TOKEN_EXPIRED and end valid sessions. PatchP1. |
| B2 blind | Named-op activity, named-op.ts:266 | medium | Marked POST/DELETE responses never renew/echo activity; proxy handles it only for allowlisted calls. PatchP2. |
| B3 blind | Preflight false success, client.ts:235 and Profile wrappers | high | Failed HTTP200 identity reads return before any mutation; resource wrappers promote status200 and clear edits. Also reaches sendContactVerification's2xx fallback. PatchP3. |
| B4 blind | Picture confirmation, change-picture-dialog.tsx:156 | false | Story1.10's approved change log explicitly retains saved/toast after acknowledged upload with best-effort relation read/revalidation. An unchanged read is not proof the acknowledged upload failed; forcing a second upload would change that contract and can duplicate files. Rejected. |
| B5 blind | Signature resize clipping, signature-pad.tsx:81 | medium | Original CSS coordinates are replayed into narrower canvas; off-canvas strokes disappear from export. PatchP4. |
| B6 blind | Late details overwrite edits, addresses-section.tsx:996 | high | Pick token survives Country changes and only line1 is checked before overwriting all parts/Verified. PatchP5. |
| B7 blind | Late auth redirect, auth-screen.tsx:93 | medium | Unmount clears only an existing timer; in-flight success can create a new timer after disposal. PatchP6. |
| B8 blind | Pending-hash draft unmount, drafts.ts:526 | medium | Unregister deletes state and clears waiting write before pending hash resolves. Detached dirty snapshots need lifecycle-safe persistence. PatchP7. |
| B9 blind | Idle abort while refresh waits, client.ts:243 | medium | Caller signal aborts fetch but not coordinator await, defeating10s Stay-signed-in budget and holding expiry suppression. PatchP8. |
| B10 blind | Required-name sentinels, account/schema.ts:40 | medium | Edited n/a/-1 passes nameIssue but read mapping treats it absent; Personal already rejects via isNotProvided. PatchP9. |
| B11 blind | Partial Birth date draft, personal-section.tsx:162 | medium | DateInput receives invalid wire value empty and no textValue, hiding restored partial/impossible form text; shared controlled API already exists. PatchP10. |
| E1 edge | Ping/refresh mismatch | high | Independently traced same55/30s replay path. PatchP1. |
| E2 edge | Late Places details | high | Country/City/ZIP changes do not invalidate existing pick. PatchP5. |
| E3 edge | Failed200 identity preflight | high | Source of status is preflight GET rather than mutation acknowledgement. PatchP3. |
| E4 edge | Raw invalid registered save, use-section-form.ts:559 | medium | Save-all validation can precede user edits while waiting; registeredSave deliberately sends raw values on parse failure. PatchP11. |
| A1 acceptance | Failed preflight becomes saved | high | Violates D-A fail-closed and draft-preservation contract. PatchP3. |
| A2 acceptance | Places country-edit race | high | Violates4.3 lookup ending/manual-edit Verified rules. PatchP5. |
| A3 acceptance | Named-op activity omission | medium | Violates1.6 marked-request activity across MFA and file operations. PatchP2. |
| R1 React/root | Places payload logging, log-api-call.ts | medium | Real callApi logger prints typed address/lookup input and details in local dev, despite Places privacy contract; metadata-only handling is already established for NPI. PatchP12. |
| R2 React/root | Listener error logging, activity.ts:50 | medium | Raw thrown Error messages/objects can contain sensitive values and are logged even outside local dev; sibling session/exit listeners already restrict logs to error type. Direct correctionP13. |

Result:13 unambiguous patches,1 rejected finding,0 decision-needed,0 deferred. Applied patches under the user's explicit instruction to update/refactor what the standards require; preserve public APIs and existing approved product decisions. No policy changes, dependency upgrades or new backlog implementation.

### Patch checklist

- [x] P1 Align refresh with the activity race guard.
- [x] P2 Record named-op activity with token-race safety.
- [x] P3 Preserve failed write preflights across resource wrappers.
- [x] P4 Preserve complete Signature strokes on resize/remount.
- [x] P5 Reject stale Places details after manual edits.
- [x] P6 Prevent disposed auth flow redirects/retries.
- [x] P7 Preserve detached dirty drafts with pending hashes and cancellation safeguards.
- [x] P8 Respect caller abort while independently waiting on shared refresh.
- [x] P9 Reject missing-value sentinels as required Account names.
- [x] P10 Use controlled DateInput text in Personal and remove redundant mirrored state.
- [x] P11 Revalidate registered saves before sending current values.
- [x] P12 Extend metadata-only logger policy to Places calls.
- [x] P13 Log listener error type without its raw payload.

### Rejected appendix

B4 — false: saved upload acknowledgement and best-effort metadata refresh are deliberate Story1.10 behavior, recorded in its approved change log; this review preserves that contract.

## Complete-block triage and follow-up

All four layers returned non-empty reports; no failed layers. Every filed finding retains its verdict here before grouping. Acceptance reported no additional confirmed AC violation. Verification reported the same proxy race under Other findings, rather than a standalone verification gap.

| ID / source | Finding | Verdict and evidence | Route |
| --- | --- | --- | --- |
| FB1 blind | Proxy omits completion clock | high: refresh now starts within55s; a request accepted at56s and completing at53s can re-seal old tokens. MSW regression reproduced old Set-Cookie before the fix. | P14 |
| FB2 blind | Acknowledged address create missing from recovery baseline | high: create succeeds, later step and list refetch fail; converted saved row has no baseline, so edits are excluded from validation/write queue. Pure queue reproduction confirmed empty writes. | P15 |
| FE1 edge | Proxy late cookie overwrites rotation | high: independently traced55s refresh and defaulted completion clock. Same root as FB1. | P14 |
| FV1 verification / Other | Delayed proxy reseal path | high: existing31/55/56s tests hold clock fixed; named-op coverage does not protect proxy caller. | P14 |
| FR1 root / React standards | Vulnerable transitive source-map-js and no CI audit | medium: pnpm audit reports GHSA-68fv-2mgg-jv7q through Next/PostCSS. pnpm-generated update resolves1.2.2; CI gains production high/critical audit. | P16 |
| FR2 root / React standards | Three exhaustive-deps suppressions | medium: suppressed deps hide combobox listbox-id changes and hook lifecycle drift. Explicit active-option id, direct schema derivation from the same date as the calendar and validation dependency retain intended behavior. | P17 |
| FR3 root / dependency audit | Development-only braces advisory | medium, pre-existing: full audit reports GHSA-vfj7-8cjw-p6xm in the ESLint glob chain; advisory lists no patched version. No production path found. | defer; deferred-work.md |

P14: fixed; proxy passes completion time, helper requires it at compile time, delayed real-handler regression fails before and passes after. P15: fixed with a shared acknowledged baseline for schema and retry diff; the user-level invalid-edit/no-write then corrected-edit/PUT regression passes with all 211 address tests. P16: fixed by package-manager-generated transitive patch/deduplication; no direct dependency or major version changed; production audit passes. P17: fixed, 279 focused tests pass across proxy, useMyself, Personal and Combobox. Independent fix verification found no remaining issue in these changes.

Initial full post-fix run exposed seven outdated assertions in two consumer tests: six Account expectations attached identity-read200 to a blocked mutation and one Signature fake used a zero-size canvas. Expectations now preserve failure with no misleading2xx; fake canvas has realistic CSS dimensions. All112 cases in those consumer files pass. Final complete unit/coverage and production-browser suites passed after the block corrections; the last memoization cleanup was also covered by its 97 Personal consumer tests and the final browser build/run.

Sources for dependency findings: [source-map-js advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q), [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

## Final validation results

- Final library-enforced coverage run: 6,449 tests pass in 220 files; 132 nonempty library modules at 100% statements (2,746), branches (1,885), functions (623), lines (2,280).
- React compiler lint rejected memoizing a constructed Date; final Personal schema is derived directly using the same date as its calendar. Its97 tests pass after that last cleanup. Full lint, typecheck, forbidden/token checks and diff whitespace checks pass.
- Standards updater dry run:27 managed files up to date,0 changed,0 missing; template version2. No copied hook has been silently enabled.
- Production dependency audit passes. Full dependency audit confirms exactly one remaining high advisory: the documented development braces dependency. No global suppression added.
- Full production E2E desktop/mobile: **1,072 passed,12 expected skips,0 failed** (1,084 cases, two workers,8.5min), including keyboard/axe, short-height/enlarged-text confirmations, shared fixtures and actual Signature PNG edge ink on both projects. Build succeeded and isolated servers3520–3522 shut down after completion. The earlier partial run was intentionally interrupted to rebuild the final Personal schema cleanup and is not counted as completed validation.

### Practical limits

Reviews establish inspected behavior and regression evidence, not a guarantee that all future runtime cases are defect-free. The full-block pass targeted integrated paths and changed surfaces; it did not re-read every one of roughly 98,000 source/test lines exhaustively. Browser checks use synthetic fixtures and real app/BFF code, not live1health acceptance or a manual assistive-technology audit. Pending draft hashing can complete after React unmount only while its browsing context survives; full browser termination cannot guarantee asynchronous completion.

This is a cross-team maintenance/integrator branch; no backlog story was implemented, no frozen story/spec intent changed and commit/push was authorized in the subsequent mitigation follow-up; PR creation was not requested.

## Completion

17 patch groups applied (P1–P17); one grouped-review finding rejected with its approved-contract refutation; one pre-existing development dependency advisory deferred with upstream evidence. No unresolved application high/medium finding remains from these review passes. No single story status or frozen epic specification was rewritten by the cross-cutting BMAD completion step; the 13 requested tracking reconciliations remain the separately verified changes above.

The subsequent user-authorized mitigation and publication follow-up is recorded below.

## User-requested braces mitigation and publication follow-up

The user requested a mitigation followed by commit/push of the maintenance branch. Added a version-specific pnpm patch (P18) that caps active brace/parenthesis AST nesting at100 before allocation. Existing literal syntax, length limits and ordinary globs remain supported; caller-constructed ASTs and unrelated regex complexity are outside scope. No audit-ignore setting was introduced. The registry still reports vulnerable package version3.0.3; upstream release tracking therefore remains open despite the local mitigation.

The initial25 regression cases produced20 failures against the original dependency and all25 passed with the patch. Extended to47 cases across callable/create/parse/compile/expand/stringify APIs, brace/parenthesis/mixed exact boundaries, hostile balanced/unclosed input, literals and real fast-glob behavior. Tests resolve the actual Next ESLint dependency chain. Independent security review found no confirmed issue in the supported string paths.

Frozen install, clean frozen offline installation, lint/typecheck/forbidden checks, full unit coverage and build are validated again for this tooling patch; results are recorded in the mitigation validation artifact. Prior complete production E2E results remain1,072 passes and12 expected skips; no application runtime code changed in this follow-up.

Mitigation follow-up validation: **47/47 cases pass locally and after a clean frozen offline install**. The full unit run with the initial25-case matrix passes6,474 tests in221 files with100% enforced library coverage; the expanded47-case matrix was rerun separately. Lint, typecheck, forbidden/token gates, frozen install and production build pass. The independent review's optional callable/create and mixed/parenthesis boundary cases are included in the expanded tests. The prior1,072 production E2E passes remain the app validation; the follow-up changes only development dependency behavior. Detailed results are in `integrated-review-2026-10-21/braces-mitigation-validation.json`.
