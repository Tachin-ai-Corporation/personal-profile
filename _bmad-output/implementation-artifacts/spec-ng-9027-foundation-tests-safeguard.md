---
title: 'Epic 1 foundation PR: D-A save safeguard, Stories 1.12/1.13 test coverage, Save-all fixture page'
type: 'feature'
created: '2026-10-15'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '78647d6a53900d4e07def52f841c8472c2263308'
context:
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** D5 dropped session binding. If user A's tab stays open after user B launches in the same browser, A's saves are written into B's profile, because owner ids come from the session. A's unsaved edits are also drafted under B's key, since the draft owner follows the live `myself.id`.

The epic owner approved a client-side safeguard (D-A, 2026-10-14). Separately, Stories 1.12 and 1.13 are code-complete but some of their ACs have no tests (D-B), and Story 1.14 needs a page that mounts the Save all bar. The epic owner approved editing shared foundation code for all three.

**Approach:**
1. **Pin the page user.** The id of the first `myself` this page loads is the page user.
2. **Check before every write.** Before any write to 1health data, `callApi` reads a fresh `/myself`. On a different id it sends nothing and ends the page through the existing `session-expired` path. The drafts are keyed by the pinned user, so A's edits stay on the device under A's key.
3. **Batch check (human decision 2026-10-15).** Save all, and the leave-guard Save that runs `runSaveAll`, checks once per batch instead of once per Section.
4. **Add the missing tests.** Cover every 1.12 and 1.13 AC clause that can be tested, on the existing fixtures, and add a Save-all fixture page.

## Boundaries & Constraints

**Always:**
- **Writes:** methods other than GET/HEAD/OPTIONS to paths under `BFF_PATHS.proxyPrefix` (`/api/1h/`) or `/api/pp/`.
  - Never check `/api/session/*`, `/api/token` or `/api/places/*`.
  - With no pinned user (no `myself` ever loaded), block the write like a failed check: send nothing and return the network failure, so the Section shows the network error with Retry. A Retry after `myself` loads goes through (human decision 2026-10-15, closing review #14).
- **The check is a `callApi` GET of the `myself` proxy path**, so its own refresh, replay and `session-expired` handling apply. It runs fresh for every write, with no cache.
  - Success with the same `id` → send the write.
  - A different `id` → don't send; publish `session-expired` (once, via the existing events); return `{ success: false, statusCode: 401, errorCode: "SESSION_EXPIRED" }`.
  - A failed check, or a body without a numeric `id` → don't send (fail closed); return the check's failure, so a network failure maps to the network error and Retry.
- **Batch check (human decision 2026-10-15):**
  - `runSaveAll` checks once after validation and before any save.
    - **Match:** its saves run inside `pageUser.runVerified(fn)`. While a verified batch runs, `callApi` skips the per-write check.
    - **Mismatch:** no Section is saved; the run returns the existing `session` outcome, and `session-expired` is published once.
    - **The batch check itself fails:** the run continues without the batch flag, so every write does its own check (still fail closed).
  - The check logic is one exported `checkPageUser(call)` in `lib/api/page-user.ts`, used by both `callApi` and `runSaveAll`. It publishes `session-expired` on a mismatch.
  - `page-user.ts` imports `client` only as a type, so there's no runtime cycle.
- **The pin:**
  - The first successful `fetchMyself` wins and later values never replace it.
  - It resets only on a full page load.
  - It lives in a new `lib/api/page-user.ts` (`pageUser.pin/id/reset`, the same shape as `sessionEvents`/`activity`), re-exported with one `export *` line. `callApi` gets it through `ApiClientDeps` for tests.
- **Drafts:** `PageFrame` passes `pageUser.id() ?? myself?.id` as the drafts owner.
- **Tests:**
  - `test/setup-dom.ts` resets the pin per test.
  - Keep 100% coverage on `lib/api`.
  - Every changed test file stays green.
- **D5 stands.** No new header, cookie or server check. `X-PP-Session`, `sessionBinding` and `SESSION_CHANGED` / `session-changed` stay banned, and `check-forbidden` stays green.
- **No new copy:** the mismatch reuses the "Your session ended" dialog.
- **Reuse:** `FixtureSection`, `FixtureParticipant`, `SectionFixturePage`, `StateFrame`, `useNavigate`/`requestLeave`, `SAVE_ORDER`, the `SaveAllBar` stub and the e2e helpers (`mockUserEdit`, `mockMyself`, `mockExit`, `signIn`).

**Never:**
- Don't revalidate the user on reads, and don't end the page on a mere `myself` change without a write.
- Don't log out, which would end B's legitimate session.
- Don't edit Team A or Team B feature folders, `app/page.tsx`, `app/account/**`, `docs/FOUNDATION.md`, `CLAUDE.md` or `AGENTS.md`. The integrator documents the change.
- Don't fill the `SaveAllBar` body (Story 1.14).
- Don't change runtime behaviour beyond the safeguard and the draft owner.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Same user | pinned 42; check → `{ id: 42 }` | the write is sent once, after one myself GET | N/A |
| Save all, same user | pinned 42; five dirty Sections | exactly one myself GET, then the five Sections' writes with no further checks | N/A |
| Save all, other user | pinned 42; batch check → 43 | no write; outcome `session`; `session-expired` once | N/A |
| Save all, check fails | the batch check → network error | the batch runs unflagged; each write checks itself | per-write fail closed |
| Other user | pinned 42; check → `{ id: 43 }` | no write; `session-expired` published once; Section stays in edit, no error UI; the session dialog shows; the dirty Section's draft is under user 42's key | returns `SESSION_EXPIRED` |
| Check fails | check → network / 502 | no write; the Section shows the network or generic save error | returns the check's failure |
| Check malformed | check → `{}` | no write | failure, no publish |
| Check expired | check refresh → expired | no write | `SESSION_EXPIRED` (published by the check) |
| Not a 1health write | GET, `/api/session/*`, `/api/token`, `/api/places/*` | no check | N/A |
| No pin | a write before any `myself` loaded | nothing sent; the network error with Retry | returns the network failure (`NETWORK_ERROR`) |
| Draft owner | `myself` revalidates from 42 to 43 | the drafts owner stays 42 | N/A |

</frozen-after-approval>

## Code Map

- `lib/api/client.ts`: the `callApi` flow (`isApiPath` → `buildInit` → `send` → refresh/replay → `publishFor`), `SESSION_EXPIRED`, `ApiClientDeps`, `READ_METHODS`. Insert the check after `buildInit`, before the first `send`. `proxyPath` is in `config.ts`; `BFF_PATHS` is in `lib/shared/bff-contract.ts`.
- `lib/api/myself.ts:142-156`: pin in `fetchMyself` on success. Don't import `client` into `page-user` (no cycle).
- `lib/api/index.ts`: add one `export *` line. `planned-modules.test.ts` checks the line and the name rules (`pageUser` is not generic).
- `features/shell/page-frame.tsx:33-36`: the drafts owner. `draft-provider.tsx` / `drafts.ts` `setOwner` move drafts on an owner change; don't edit them.
- `test/setup-dom.ts`: the `sessionEvents.reset()` / `activity.reset()` pattern.
- `features/shell/__fixtures__/section-fixture-page.tsx`: the "End the session on the next save" branch makes the only real `callApi` PUT (`/api/1h/v2/user/edit`).
- `app/test-fixtures/leave-guard/page.tsx` and `fixture-participant.tsx` (`canSave`, `saveAll`, `saveBehavior`).
- Gate test: `app/test-fixtures.test.ts`. Existing specs: `e2e/section.spec.ts`, `e2e/shell.spec.ts` "leave guard", `e2e/drafts.spec.ts` (seeding drafts).
- Unit tests: `lib/api/errors/errors.test.ts`, `lib/shared/messages/messages.test.ts`, `features/shell/leave-guard.test.tsx`.
- Phone-duplicate rule: `lib/api/errors/contacts.ts` (message → field `value`).

## Tasks & Acceptance

**Execution:**
- [x] `lib/api/page-user.ts` (+ `page-user.test.ts`), `index.ts`, `myself.ts` (+ test): the pin, as above.
- [x] `lib/api/client.ts` (+ `client.test.ts`): the write check, every matrix row; a pinned user is injected through deps.
- [x] `features/shell/save-all.ts` (+ `save-all.test.ts`): the batch check per the matrix rows; the leave-guard Save inherits it through `runSaveAll`.
- [x] `features/shell/page-frame.tsx` (+ test): the drafts owner stays pinned when `myself` changes id.
- [x] `test/setup-dom.ts`: reset the pin.
- [x] `features/shell/__fixtures__/section-fixture-page.tsx`:
  - a "Send the next save to the server" toggle reusing the real-PUT branch, with `errorFields={{ value: "number" }}`;
  - `StateFrame` (`kv`, section `phone`) around the Section, driven by `useMyself` (with `useClaimMyselfError`).
- [x] `e2e/section.spec.ts`:
  - a mapped 400 (the phone-duplicate message) → the field error at the input, focus there, edits kept, no toast, axe;
  - a generic 400 → "Couldn't save phone.";
  - the toast region is `aria-live="polite"`;
  - the network toast's own Retry → "Phone saved.";
  - the Section load error "Couldn't load phones" + Retry (myself answers 404 once, then 200);
  - D-A: myself answers 42, then 43 on the check → no PUT, "Your session ended" dialog, the draft stored under user 42.
- [x] `app/test-fixtures/leave-guard/page.tsx` + a new `features/shell/__fixtures__/leave-guard-controls.tsx`:
  - add a guard-only participant with `save` (`saveAll={false}`);
  - `?fail=<id>` sets that participant's `saveBehavior="fail"`;
  - buttons for a hand-off (`navigate({ external: "handoff", href: BFF_PATHS.handoffPortal })`) and a scoped close (`requestLeave({ scope: "insurance" })`).
- [x] `e2e/shell.spec.ts` "leave guard", every 1.13 case still missing:
  - each dirty combination on a tab switch;
  - Save with "invalid" → nothing sent, focus on the input;
  - a failing Save → stays;
  - the cannot-save body text;
  - hand-off → Discard → `/handoff/portal`, no logout, a seeded draft kept;
  - Return → Discard with a seeded draft → purged;
  - the scoped close (Discard and Keep editing);
  - focus back on the trigger after Escape;
  - beforeunload with only the guard-only participant dirty.
- [x] `features/shell/leave-guard.test.tsx`: guard-only beforeunload; a source-scan test that only `features/shell/{leave,leave-guard}.ts(x)` add `beforeunload`.
- [x] `lib/api/errors/errors.test.ts`: an `INVALID_ENUM_VALUE` upstream 400 → `generic` (Section level).
- [x] `lib/shared/messages/messages.test.ts`: add to the verbatim list every Epic 1 V&T string already in the catalog. List the ones not yet present (the Save-all bar copy) in Implementation Notes for 1.14; don't add copy.
- [x] `app/test-fixtures/save-all/page.tsx` (+ a fixture body in `__fixtures__`):
  - `PageFrame page="profile"` with `saveOrder={SAVE_ORDER}` and `saveAllSlot={<SaveAllBar />}`;
  - participants `personal`, `email`, `phone` and a guard-only `insurance`;
  - `?fail=<id>`.
  
  Plus one smoke case in `e2e/fixtures.spec.ts`: it renders, registers the participants and passes axe.

**Acceptance Criteria:**
- Given the full check, when it runs on Node 24, then lint, typecheck, `check-forbidden`, Vitest with coverage (100% on `lib/server`/`lib/api`/`lib/shared`), the build and e2e are all green.
- Given the PR, when its shared files are listed in Implementation Notes, then every changed foundation file is named with one line on why.

## Spec Change Log

- **2026-10-15, human renegotiation after review (finding #14, gap 3):** the frozen "no pin → send unchecked" rule becomes "no pin → block like a failed check (send nothing, network error with Retry)". The Boundaries bullet and the matrix row "No pin" were amended. **Known-bad state avoided:** a page whose `myself` never loaded could write into another user's profile unchecked. **KEEP:** everything else in the safeguard (the batch check, fail closed, the pinned drafts owner, no logout, D5 bans).

## Review Triage Log

Pass 1 (blind hunter, edge-case hunter, verification gap; the verification-gap layer found no gaps, only two other findings):

| # | Layer | Finding | Verdict | Evidence / route |
|---|---|---|---|---|
| 1 | VG, blind, edge | `pageUser.reset()` during a running batch leaves the counter at -1, so the next batch isn't verified | low | Real (the `finally` decrements after reset). Reachable via the per-test reset. It fails safe, but breaks batch semantics and can flake tests → **patch** (a generation guard, plus a test). |
| 2 | VG, blind, edge | The verified-batch bypass is page-wide: unrelated writes during a batch skip the check | low | Real, and inherent to the approved design (no async context in the browser; scoping would mean threading a token through every Section save). Its exposure equals the batch's own writes, since all rely on the batch-start check of the same cookie. That is accepted limit 3. The wording is incomplete → **patch** the page-user doc and the `deferred-work.md` entry to say "any write sent while the batch runs". |
| 3 | blind | The batch check fails with `SESSION_EXPIRED` (refresh failed), yet `runSaveAll` still runs the queue | low | Real: one extra myself GET and refresh before the first write gives up; `session-expired` was already published → **patch**: return `session` at once, plus a test. |
| 4 | blind | A Section's own multi-step save checks every step | low | Matches the approved design: the human decision batched only Save all and the leave guard. Rejected. |
| 5 | blind | `fetchMyself` ignores a different user it already detected (B's data shown in A's tab) | low | Accepted limit 1 (reads are not checked; human decision 2026-10-15). Rejected. |
| 6 | blind, edge | The source-scan `SKIP` misses `.claude` and `playwright-report` | low | Real: agent worktrees under `.claude/worktrees` hold copies of `leave-guard.tsx` → **patch**. |
| 7 | blind | Cannot-save combinations don't assert that the savable participants were not saved | low | Real test weakness; a direct assertion → **patch**. |
| 8 | blind | beforeunload e2e hangs instead of failing; no negative case | low | The global timeout still fails it, and the negative case exists in "beforeunload fires only while something is dirty". Rejected. |
| 9 | blind | Keyboard activation of a tab while dirty has no test | low | It is a pre-existing shell bug (Enter/Space on a tab opens the guard and the same key activates "Keep editing"), not caused by this change → **defer**. |
| 10 | blind | A failed check carries the context `page-user/check`; a bad shape reports statusCode 200 | low | The mapper reads it as generic ("Couldn't save …"); the context only shows in the dev-only log. Rejected. |
| 11 | blind | FOUNDATION / AUTH-ARCHITECTURE don't mention the safeguard (`checkPageUser` also publishes `session-expired`) | low | Real, but only the integrator edits these agent-context docs (T8) → **defer** with the list of updates. |
| 12 | blind | `page-frame.test.tsx` clears `localStorage` only on success | low | A direct fix → **patch** (clear in `finally`). |
| 13 | blind | The Save-all fixture never asserts the save order | low | It's scaffolding for 1.14, which asserts order with the real bar. Rejected. |
| 14 | edge | Unpinned (myself never loaded) → writes unchecked | low | It matches the frozen intent ("with no pinned user yet, send unchecked"), and is rare (myself must fail after retries, and B must launch). Pinning on demand would pin whoever is current. Rejected; flagged to the human. |
| 15 | edge | `/api//1h/...` passes `isApiPath` but misses the prefix test; a 308 slash normalisation could deliver the write unchecked | low | Paths are code-built (`proxyPath`), but the hardening is a one-line normalisation → **patch**: collapse repeated slashes before the prefix test, plus a test. |
| 16 | edge | The fixture `requestLeave(...).then` has no rejection handler | false | `requestLeave` resolves a boolean and never rejects (`features/shell/leave.ts:46`). |
| 17 | edge | Claim: "every write is checked" | low | Same root causes as #2 and #14. Rejected. |

## Design Notes

- **Why `callApi`:** every write (Section saves, Save all, the leave guard, and later the 1.10 upload, SSN reveal and MFA) passes through it. A save-level hook would miss non-Section writes.
- **Cost:** a single save checks every write. Save all and the leave-guard Save check once per batch, so five Sections cost one extra GET, not five.
- **Pinning:** the pin avoids touching the page server components (both teams' `app/**`) or `requirePageSession`.
- **Accepted limits (human decision 2026-10-15; also in `deferred-work.md`, Foundation section):**
  1. **Reads aren't checked.** A's tab can show B's data until A tries to save. Only writes are stopped.
  2. **demo/prod:** a launch in the other environment whose user id happens to match isn't caught, because ids aren't scoped by environment.
  3. **The check and the write aren't atomic.** There is a short window between them: per write, or across a whole Save-all or leave-guard batch, which checks once.

## Verification

**Commands** (Node 24, `/private/tmp/claude-501/-Users-anjana-Documents-Dev-1health-personal-profile-personal-profile/6beca074-6290-42d0-ac22-e5ea4b90cf3e/scratchpad/node24/node-v24.22.0-darwin-arm64/bin` first on PATH; never `CI=1` e2e without a fresh build):
- `pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh` -- expected: clean
- `pnpm vitest run --coverage` -- expected: all pass, thresholds met, exit 0
- `pnpm build && CI=1 pnpm test:e2e` -- expected: all pass

## Implementation Notes

**Changed foundation files (one line each):**
- `lib/api/page-user.ts` (new): `pageUser` (`pin`/`id`/`runVerified`/`isVerified`/`reset`), `createPageUser`, `checkPageUser(call, deps?)` → `unpinned | same | other | failed`; imports `client` as a type only.
- `lib/api/client.ts`: the per-write check after `buildInit`, before the first send (`isDataWrite`: non-GET/HEAD/OPTIONS under `/api/1h/` or `/api/pp/`), skipped inside a verified batch; `ApiClientDeps.pageUser`. Another user returns the existing `SESSION_EXPIRED` constant (kept in `client.ts`, because only `client.ts`/`errors/*` may name `errorCode`: `errors.test.ts` ownership rule).
- `lib/api/client.ts` (Spec Change Log 2026-10-15): with no page user pinned, a write is blocked like a failed check and answers `networkError(context)` (`NETWORK_ERROR`, so the Section shows the network error with Retry); the batch flag skip is unchanged.
- `lib/api/myself.ts`: `fetchMyself` pins the first successful user.
- `lib/api/index.ts`: one `export * from "./page-user"` line.
- `features/shell/save-all.ts`: one batch check after validation (only when something is queued); same user → `pageUser.runVerified`; other user → `session` outcome with nothing saved and no `save_all` telemetry (nothing was sent); failed check → unflagged run.
- `features/shell/page-frame.tsx`: drafts owner `pageUser.id() ?? myself?.id`.
- `test/setup-dom.ts`: `pageUser.reset()` before each client test.
- `features/shell/__fixtures__/section-fixture-page.tsx`: "Send the next save to the server" toggle (shares the real-PUT branch), `errorFields={{ value: "number" }}`, `StateFrame` (`kv`, `phone`) on `useMyself` + `useClaimMyselfError`; the controls row now wraps (`flex-wrap`) so 360 px has no horizontal scroll.
- `features/shell/__fixtures__/leave-guard-controls.tsx` (new) + `app/test-fixtures/leave-guard/page.tsx`: phone (Save all), `social` "Fixture editor" (guard-only with `save`), insurance (guard-only, can't save), `?fail=<id>` (read with `useSearchParams`, since the gate test calls pages without props), "Hand off", "Close insurance" (`requestLeave({ scope: "insurance" })`, answer in `data-testid="scoped-close"`). The guard-only-with-save participant uses id `social` because `insurance` is already the can't-save one.
- `features/shell/__fixtures__/save-all-fixture.tsx` (new) + `app/test-fixtures/save-all/page.tsx` (new): personal/phone/email + guard-only insurance, dirty count output, `?fail=<id>`; the page passes `SAVE_ORDER` and `<SaveAllBar />` like `app/page.tsx`.
- Tests: `lib/api/page-user.test.ts` (new), `client.test.ts`, `myself.test.ts`, `errors/errors.test.ts`, `lib/shared/messages/messages.test.ts`, `features/shell/{save-all,page-frame,leave-guard}.test.*`, `e2e/{section,shell,fixtures}.spec.ts`.

**For Story 1.14:** Epic 1 Voice and Tone strings not yet in the catalog (no copy added): "{N} unsaved sections" (and its singular "{N} unsaved section" from the AC), "Save all (N)", "Discard all". Also not present, owned by Story 1.10: "Change profile picture", "Choose another file", "JPG, PNG or BMP, up to 6 MB.", "{file name} is {size}. Choose a file up to 6 MB.", "Current picture · Not changed"; and "{Label} (optional)" exists only as the "(optional)" suffix.

- Review patches (pass 1):
  - `page-user.ts`: a generation guard so `reset()` during a batch can't drive the counter negative, plus a doc sentence on the page-wide batch bypass.
  - `save-all.ts`: a batch check that ended the session returns `session` at once, detected with `mapApiError("page", …).kind === "session"`, because only the mapper may read `errorCode` (`errors.test.ts` ownership).
  - `client.ts`: `isDataWrite` collapses repeated slashes.
  - Test fixes: the source-scan `SKIP` (`.claude`, `playwright-report`), the cannot-save e2e asserting nothing was saved, and `localStorage` cleared in a `finally`.
- Deferred to `deferred-work.md` (Foundation): the integrator doc updates (FOUNDATION §3.2/§6, AUTH-ARCHITECTURE, CLAUDE.md/AGENTS.md) and the pre-existing keyboard tab bug.
- Final verification (Node 24.22):
  - lint, typecheck and `check-forbidden` clean;
  - Vitest 3510/3510 with 100% coverage on `lib/server`/`lib/api`/`lib/shared`;
  - `pnpm build`, then `CI=1 pnpm test:e2e`: 377 passed, 3 skipped by design.

- Gap 3 closed (human, 2026-10-15): verification after the change on Node 24 was lint, typecheck and `check-forbidden` clean; Vitest 3510/3510 at 100% coverage; build, then e2e 376 passed and 3 skipped. There was 1 flaky retry in the untouched `e2e/launch.spec.ts` ("an unencoded lpl whose '+' arrives as a space"), which passed 42/42 when repeated 3 times with no retries; the same flake was seen once during Story 1.9. The e2e for "no pin → blocked" is not feasible without changing fixture behaviour (the fixture Section renders only once `myself` loads), so it is covered by unit tests (`client.test.ts`, `save-all.test.ts`).

**Findings (not fixed: out of scope, runtime behaviour must not change):**
- Keyboard activation of a tab while the page is dirty does not open the leave guard: Enter/Space on a `PageTabs` trigger opens the dialog on keydown, which focuses "Keep editing", and the same key's activation then lands on it, so the dialog closes at once and the tab doesn't change (reproduced in Playwright on `/test-fixtures/leave-guard`; a clean page switches normally). The e2e Escape/focus case therefore presses the tab with the pointer and the hand-off button with Enter. Needs a shell fix (e.g. defer the leave dialog past the key event, or activate on keyup).
- Locally, Vitest's file module cache (`node_modules/.vitest-cache`) kept the old `import.meta.glob` result of `app/test-fixtures.test.ts`, so the new `save-all` page failed the gate test until the cache was deleted. CI starts with no cache.
