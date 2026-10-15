---
title: 'F7-1 Cross-team test isolation'
type: 'chore'
created: '2026-10-14'
status: 'draft'
baseline_commit: '7ee4ca4'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-f6-3-data-server-tests.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md (Stories 7.4, 7.5, 7.6)'
  - 'https://agents.1health.io/public/demo/api/agents.md (PUT /v2/user/edit, GET /v2/user/contact-point/list)'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Team A (`/`, Epics 1–6) and Team B (`/account`, Epics 7–10) will merge in parallel. A cross-team audit found tests and fixtures both teams lean on that each branch passes alone but that fail once both are merged: one `app/home.test.tsx` composing both pages and asserting on feature-stub internals ("5 loading frames"), one `e2e/fixtures/defaults.ts` holding both pages' defaults, `e2e/shell.spec.ts` opting out of the fail-fast guard, no owned place for new unit-test reads, no contract tests Team B owns over shared code Team A edits (`PUT v2/user/edit` schema, Contact Points read API), and a CI that only runs on PRs to `main`.

**Approach:** Split every shared test artifact by owner, give both teams one Section test harness and one owned place per page for reads (unit and e2e), add consumer contract tests owned by Team B so a breaking Team A change fails in Team A's PR, run CI on `feat/**` pushes and the merge queue, and write the ownership rules into FOUNDATION §1. Approved by the human in advance (2026-10-14): write the spec, then implement directly.

Ownership: A owns `features/{personal,contacts,addresses,insurance,header,save-all}`, `app/page.tsx`, `e2e/profile-*.spec.ts`; B owns `features/{account,mfa,provider,organizations}`, `app/account/**`, `app/handoff/**`, `e2e/account-*.spec.ts`. Foundation owns the rest.

## Boundaries & Constraints

**Always:**
- **Page tests:** `app/home.test.tsx` → `app/page.test.tsx` (A, the `/` composition of `app/page.tsx` incl. `saveAllSlot`) and `app/account.test.tsx` (B, the `/account` composition through `AccountTabs` that Story 7.1's page will use). Assert shell-level behaviour only: landmarks the panels require, slots rendered, one shared `myself` request, tab order, axe; never stub internals (no loading-frame counts, no placeholder `data-level`).
- **Unit read handlers:** `test/page-handlers.ts`: `shellReadHandlers` (foundation: `myself`, Contact Points, `profile-picture-id`), `profileReadHandlers()` (A-owned section) and `accountReadHandlers()` (B-owned section), each answering every planned read of its page with an empty, valid default; the page tests use them.
- **Section harness:** `renderInPage(ui, { page, myself?, contacts?, url? })` in `test/providers.tsx`: `TestProviders` (SWR), `CurrentPageProvider`, `SectionRegistryProvider`, `DraftsProvider` (demo environment, the fixture user's id), a `SectionFrameProvider` spy, and that page's read handlers; returns the render result + `registry` + `frameReady`. Tested in `test/providers.test.tsx`.
- **e2e fixtures:** `defaults.ts` → `defaults-profile.ts` (A, `mockProfileDefaults`) and `defaults-account.ts` (B, `mockAccountDefaults`), both starting with `mockShellDefaults` (header reads incl. `profile-picture-id`) in `core.ts`; `header.ts` (A: `mockHeaderPicture`, `expectHeaderTabOrder(page)` for B's Story 7.2) and `personal.ts` (A, empty, documented); shared mocks in `core.ts`: `mockUserEdit`, `mockFileDownload`, `mockProfilePicturePreview`; `ANN` frozen (override per test). A test fails on an ambiguous `export *` name in `e2e/fixtures/index.ts` and on an area file missing from it.
- **shell.spec.ts:** fail-fast `test` from `./fixtures` + `mockProfileDefaults` in every test; assertions kept.
- **B-owned contract tests:** `lib/server/proxy/allowlist/user-edit.account.test.ts` (the 7.5/7.6 accept/reject rows of `PUT v2/user/edit` on the current schema) and `lib/api/contact-points.contract.test.ts` (frozen `ContactPoint` shape, `toContactPoints`, `findPrimary`, `primaryPhoneRegion`, `contactPointsPath`, `CONTACT_POINT_TYPES`). Pre-created `allowlist/{account,mfa,npi,orgs,addresses}.test.ts` with one meaningful assertion each.
- **CI:** `ci.yml` also runs on `push` to `feat/**` and on `merge_group:`; existing triggers and jobs kept.
- **Docs:** FOUNDATION §1 gains the test-ownership rule; §3.6 lists the new pieces.

**Never:**
- Touch `lib/api/index.ts`, `lib/shared/messages/*`, `lib/api/errors/*`, `features/shell/*`, `components/ui/*`, ESLint config or `scripts/*` (spec F7-2 runs in parallel), or other `_bmad-output` files.
- Change GitHub settings (branch protection, merge queue).
- Lower coverage (100 % on `lib/server`, `lib/api`, `lib/shared`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| A replaces a stub | `PersonalSection` renders real content | `app/page.test.tsx` still passes (landmarks, slots) | — |
| A narrows `PUT v2/user/edit` | e.g. drops `email` | `user-edit.account.test.ts` fails in A's PR | — |
| A changes Contact Points API | renames `findPrimary` / changes `ContactPoint` | `contact-points.contract.test.ts` fails (type + runtime) | — |
| Fixture name clash | two area files export `mockFoo` | exports test (and typecheck TS2308) fails naming it | — |
| New area file | `e2e/fixtures/x.ts` without `export *` line | exports test fails | — |
| Unmocked read on `/` | shell.spec visits `/` | fail-fast guard names the call | — |

</frozen-after-approval>

## Code Map

- `app/home.test.tsx` → `app/page.test.tsx`, `app/account.test.tsx`.
- `test/page-handlers.ts`, `test/providers.tsx` (+ `test/providers.test.tsx`, `test/e2e-fixture-exports.test.ts`), `vitest.config.ts` (collect `test/**/*.test.*`).
- `e2e/fixtures/{core,defaults-profile,defaults-account,header,personal,index}.ts`, `e2e/fixtures.spec.ts`, `e2e/shell.spec.ts`.
- `lib/server/proxy/allowlist/{user-edit.account,account,mfa,npi,orgs,addresses}.test.ts`, `lib/api/contact-points.contract.test.ts`.
- `.github/workflows/ci.yml`, `docs/FOUNDATION.md`.

## Tasks & Acceptance

**Execution:**
- [ ] Split the page test; `test/page-handlers.ts`.
- [ ] `renderInPage` + tests.
- [ ] e2e fixtures split, shared mocks, frozen `ANN`, exports test.
- [ ] `shell.spec.ts` on the fail-fast `test`.
- [ ] B-owned contract tests and pre-created allowlist area tests.
- [ ] CI triggers.
- [ ] FOUNDATION rules.

**Acceptance Criteria:**
- Given a Team A story replacing a Section stub, when it runs the page tests, then no Team B test changes are needed (and vice versa).
- Given `pnpm lint && pnpm typecheck && pnpm vitest run --coverage && pnpm test:e2e && pnpm build && bash scripts/check-forbidden.sh`, then all pass.

## Verification

**Commands:**
- `corepack pnpm install` -- expected: OK
- `corepack pnpm lint && corepack pnpm typecheck` -- expected: clean
- `corepack pnpm vitest run --coverage` -- expected: green, thresholds met
- `PP_E2E_PORT=3230 corepack pnpm test:e2e` -- expected: green
- `corepack pnpm build && bash scripts/check-forbidden.sh` -- expected: green

## Implementation Notes

## Spec Change Log

## Review Triage Log
