---
title: 'F7-1 Cross-team test isolation'
type: 'chore'
created: '2026-10-14'
status: 'in-review'
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
- [x] Split the page test; `test/page-handlers.ts`.
- [x] `renderInPage` + tests.
- [x] e2e fixtures split, shared mocks, frozen `ANN`, exports test.
- [x] `shell.spec.ts` on the fail-fast `test`.
- [x] B-owned contract tests and pre-created allowlist area tests.
- [x] CI triggers.
- [x] FOUNDATION rules.

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

Implemented 2026-10-14 (worktree reset from `b005536` to the stated baseline `7ee4ca4` first; nothing of this spec was there).

- **Page tests:** `app/home.test.tsx` → `app/page.test.tsx` (git mv; Team A): the exact `app/page.tsx` tree incl. `saveAllSlot={<SaveAllBar />}` (the old test left it out); one `myself` request, tab order, one h1 + `main section[id]` equal to `PROFILE_SECTION_IDS` + the `SIGNATURE_ANCHOR` (both shell contracts: the Section menu and deep links need them), `?tab=insurance` selects the Insurance region, axe light/dark. The "5 loading frames" assertion is gone. `app/account.test.tsx` (Team B): `PageFrame page="account"` → `AccountTabs` with all four Team B entry points; no tab → `?tab=personal`, Account `aria-current`, one `myself` request, both `ACCOUNT_ANCHORS` landmarks + axe, tab order, provider/organizations → the selected tab's `aria-controls` panel is shown and non-empty (no placeholder `data-level`).
- **`test/page-handlers.ts`:** `shellReadHandlers` (foundation: `myselfHandlers` + `profile-picture-id` → `{ fileId: null }`), `profileReadHandlers` (A: + `type/key/:type`, `person/location/list`, `public/countries`, `health/patient/insurance`), `accountReadHandlers` (B: + `user/npi` 404, `/api/pp/practice-support` 404 `NO_PRACTICE`, `user/organization/portal` empty page; same placeholders as the e2e defaults), `pageReadHandlers(page)`. Each team's function is fenced by a comment saying who edits it.
- **`renderInPage`:** in `test/providers.tsx` (next to `TestProviders`). MSW `server.use(a, b)` puts `a` first (first match wins), so the page defaults and the test's `handlers` are two `use` calls, `handlers` last (they win); a `server.use` made before `renderInPage` is shadowed — documented. The registry is handed out by a tiny `CaptureRegistry` through `useLayoutEffect` (the React Compiler lint forbids writing an outer variable during render). Drafts: `DraftsProvider environment="demo"` (`TEST_DRAFT_ENVIRONMENT`) and the `myself` override's numeric `id`, else 42. `test/providers.test.tsx` covers both pages, the overrides, `handlers` winning, `url`, each page's defaults, and a draft written to `pp:draft:v1:demo:42:account`. `vitest.config.ts` now collects `test/**/*.test.ts` (node) and `test/**/*.test.tsx` (jsdom); coverage scope unchanged.
- **e2e fixtures:** `defaults.ts` removed → `defaults-profile.ts` (A) / `defaults-account.ts` (B), both starting with `mockShellDefaults` (core: `mockMyself`, `mockContacts`, `mockProfilePictureId`). `core.ts` imports `mockContacts` from `contacts.ts`, which imports `json` from `core.ts`: a function-only cycle, safe at runtime (used only inside function bodies; e2e green). Core also has `mockUserEdit(page, answer | responder)` (PUT only, other methods `route.fallback()`; default 200 `{ ...ANN, ...body }`; returns the bodies), `mockFileDownload(page, fileId = "*", { status, body, contentType })` (default `PNG_1X1`), `mockProfilePicturePreview(page, fileId = PROFILE_PICTURE_FILE_ID)` (picture id + that file's image; the header does not load a picture yet — Story 1.10 keeps it in step). `header.ts` (A): `mockHeaderPicture`, `APP_BAR_TAB_STOPS`, `HEADER_TAB_STOPS` (empty until Story 1.10), `expectHeaderTabOrder(page)` (Tab from page load: app bar → header stops → the selected tab; never the wordmark; returns the stops). `personal.ts` (A): documented, empty. `ANN` is `Object.freeze`d with a "never edit, override per test" doc; `e2e/fixtures.spec.ts` asserts it is frozen with its values and covers the new mocks and `expectHeaderTabOrder` on `/?tab=insurance`. `test/myself-fixture.test.ts` freezes the unit defaults (`myselfWire()`, `contactPointWire()`).
- **Clash test:** `test/e2e-fixture-exports.test.ts` (node): `index.ts` must be exactly one `export * from "./x"` per file in `e2e/fixtures/`; a TypeScript program over the area files lists every exported name (types included) with its resolved symbol and fails on a name bound to two different symbols, naming the files; it also asserts `index.ts` has no semantic diagnostics (TS2308). Probed: an extra `mockContacts` in `personal.ts` and an unlisted `zz.ts` both fail. Placed in `test/`, not `e2e/`, because Playwright's default `testMatch` would pick up an `e2e/**/*.test.ts`. Note: `tsc --noEmit` also reports TS2308 for such a clash (verified in a scratch project), so the F6-3 note "TypeScript does not report clashes" holds only for an explicit export shadowing an `export *`.
- **shell.spec.ts:** `test` from `./fixtures`; every test starts with `mockProfileDefaults` (the second tab too), overrides after it (`mockContacts(...)`, `mockMyself(401)`, `const myselfCalls = await mockMyself(page)`); assertions unchanged.
- **Contracts (Team B):** `lib/server/proxy/allowlist/user-edit.account.test.ts` matches `PUT v2/user/edit` through the shipped `ALLOWLIST` (so moving the entry between area files doesn't break it), checks no `profile` tag (ACCOUNT_DISABLED must not switch the shared PUT off), POST is 405, and the 7.5/7.6 accept/reject rows (names, `birthDate` `YYYY-MM-DD`, `preferredLanguage`, `email`, `phoneNumber` only with `phoneNumberRegion`; `locale`/`timeZone`/`username`/`password` rejected; names forwarded trimmed). `lib/api/contact-points.contract.test.ts`: `ContactPoint` and `ContactPointType` frozen with `expectTypeOf` (enforced by `pnpm typecheck`), `CONTACT_POINT_TYPES`, `PRIMARY_LABEL`, `isContactPointType`, `keys.contactPoints`, `contactPointsPath`, `toContactPoints`, `findPrimary`, `primaryPhoneRegion`, `loadContactPoints` over MSW. Pre-created `allowlist/{account,mfa,npi,orgs,addresses}.test.ts`: the area's entry list (`[]` now, updated with each entry) and the tag rule (B areas: every entry `profile: true`; addresses: none tagged).
- **CI:** `push: branches: [main, "feat/**"]` and `merge_group:`; jobs unchanged. The merge queue itself is a repository setting (not changed).
- **Docs:** FOUNDATION §1 rule 11 (test ownership, page-test scope, fail-fast + page defaults, complete defaults per team, frozen fixtures, shared mocks, clash test, consumer contracts, one fixture page + spec per new control, CI triggers); catalog row F7-1; §3.6 Test providers, E2E helpers and CI rows.
- **Not touched:** `lib/api/index.ts`, `lib/shared/messages/*`, `lib/api/errors/*`, `features/shell/*`, `components/ui/*`, ESLint config, `scripts/*`, other `_bmad-output` files.
- **Verification (2026-10-14):** `corepack pnpm install` OK; `pnpm lint`, `pnpm typecheck` clean; `pnpm vitest run --coverage` 142 files / 2934 tests green, 100 % statements/branches/functions/lines; `PP_E2E_PORT=3230 pnpm test:e2e` 268 passed, 2 skipped (the existing desktop-only tests on 360 px: `inputs.spec.ts` InfoPopover placement, `ui-kit.spec.ts` row hover actions); `pnpm build` OK; `bash scripts/check-forbidden.sh` OK.

## Spec Change Log

## Review Triage Log
