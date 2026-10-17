---
title: 'Story 3.3: Verify phones'
type: 'feature'
created: '2026-10-16'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'bafaabbe8920a4056351ba50c5b462345ed2ca4f'
context:
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** New mobile numbers never get a verification link, and an unverified number can't be verified from the app (Story 3.3, FR17, NG-9023; acceptance source: `epics.md` "### Story 3.3: Verify phones").

**Approach:** Add `POST v2/health/contact-point/verify` (proxy entry plus `lib/api/contacts.ts`). The Phone `save()` auto-verifies the rows that `newUnverifiedContactPoints` returns after its refetch. The read view gets a Verify / Resend verification row action. The per-row send state lives in the Section, and the countdown, announcement and toasts use `useCountdown`, `useAnnounce`/`LiveStatus`, `StatusBadge status="pending"`, `RowActions` `disabledReason` and `toastError`.

## Boundaries & Constraints

**Always:**
- **API** (`lib/api/contacts.ts`):
  - `contactPointVerifyPath()`.
  - `verifyContactPoints(ids)`: one `POST` with `{ contactPointIds: ids }` through `callApi`. It returns `ApiResponse<{ success: boolean; contactPointIdsWithSendError: number[] }>`. An empty list sends nothing and resolves a success with no send errors.
  - `sendContactVerification(ids, scope = "phone")` never throws:
    - It de-duplicates the ids and sends them in chunks of at most 10 (`CONTACT_VERIFY_MAX_IDS`, the backend limit), one after another.
    - It resolves `{ sent, failed, cooldown, network, session }`:
      - `sent`: ids not in `contactPointIdsWithSendError`;
      - `failed`: the listed ids, plus every id of a chunk that failed in any other way;
      - `cooldown`: the ids of a chunk that the cooldown rule matched;
      - `network`: a chunk mapped `network`;
      - `session`: a chunk mapped `session`, which is left to the shell.
- **Proxy** (`allowlist/contacts.ts` + test):
  - `POST v2/health/contact-point/verify`: no query (400 `BAD_QUERY`), JSON only (415), `maxBytes` 1 KB, nothing forced.
  - Strict body `{ contactPointIds: unique positive ints, 1–10 }`.
  - Tests: happy path, 415, 405, a query, empty, 11 ids, a repeated id, a non-integer, an unknown key.
- **Errors** (`lib/api/errors/contacts.ts`): add `Field` `"verify"` and a `phone` rule for the backend cooldown `^There is already a pending verification for Contact '.*' submitted within the last \d+ minutes\.$` → field `verify`, `contacts.verifyCooldown`.
- **Auto-verify** (inside the Phone `save()`, after the manage POST succeeds):
  - Refetch both Phone keys through the hooks' bound `mutate()`, which returns the fresh lists in the Section's cache, along with `mutateMyself()`.
  - Call `newUnverifiedContactPoints(savedPoints, fresh rows typed by their list)` and run one `sendContactVerification` on a non-empty result. This replaces 3.2's `mutateContactPoints("Mobile","Landline")`; it is the same keys, so the header and `/account` still refresh.
  - A rejected refetch skips the verify. Nothing the verify does fails the save: it still resolves `{ ok: true }` and "Phone saved." shows.
  - This applies to Save all as well.
- **Verifiable row:** saved (id, not a repeated id), `Mobile`, label not Home, `isVerified !== true`. An unverified Primary counts.
- **Send state** (Section state keyed by id; cells read it and never own it):
  - `sent` holds a deadline 60 s ahead;
  - `failed` and `cooldown` hold no deadline;
  - the ids sent this session make the action read "Resend verification" instead of "Verify".
  - A row whose refetch shows `isVerified: true` shows "Verified" whatever its state.
- **Status cell** (read view and the saved rows of edit view):
  - during the countdown, `StatusBadge status="pending"` "Link sent · Resend in {n} s", updated each second;
  - afterwards, "Not verified";
  - `failed`: "Not verified" plus the help line "Couldn't send the link";
  - `cooldown`: "Not verified" plus "A link was already sent in the last hour. Check your texts.".
  - The seconds come from `useCountdown`, seeded from the Section-held deadline when it mounts, so the 768 px layout swap keeps the right time. A reload loses the countdown.
- **Row action** (read view only, `RowActions`):
  - An `inline` Verify / Resend verification action that also shows in the kebab. It sends `[id]` at once, with no confirm and no edit mode.
  - During the countdown it is aria-disabled with the reason "Link sent · Resend in {n} s".
  - A repeat press while a send is in flight does nothing.
  - No action on Verified, Landline, Home-labelled, id-less or repeated rows.
- **Outcomes:**
  - A sent id starts its countdown, and `useAnnounce` says "Link sent" once per send through one Section `LiveStatus`. It never announces each second.
  - A manual send that fails with `network` shows `toastError("Couldn't send the link. Check your connection.", { onRetry })`, where Retry resends the same id. The row stays "Not verified" with its state unchanged.
  - Auto-verify on `network` marks every id `failed`, with no toast.
  - `session` does nothing.
- **Focus revalidation:** SWR revalidate on focus (as configured) refreshes the badge. While editing, the new baseline rebases and keeps the user's edits (`useSectionForm`).
- **Copy** (new `CONTACT_MESSAGES` keys; grep the catalog first):
  - verbatim from Voice and Tone: "Link sent · Resend in {n} s" (`formatMessage`) and "Link sent";
  - DRAFT COPY: "Couldn't send the link", "Couldn't send the link. Check your connection." and the cooldown line;
  - reuse `COMMON_MESSAGES.verify`, `resendVerification`, `notVerified` and `verified`.

**Decisions (agent, 2026-10-16; no human input needed):**
- **10-id chunks:** the backend rejects more than 10 ids per request, and one save can add up to 20 Mobiles. With 10 or fewer ids, which is the usual case, this is still exactly one call, as the AC says.
- **Cooldown:** the backend refuses a resend within 60 minutes of a successful send. The AC's 60 s countdown stays. The refusal shows as row help in DRAFT COPY, and a `deferred-work.md` Team A entry asks the PM and backend to align. Also logged there: the backend reports only the last failed id (`OneHealthServiceImpl:2661`).
- **Other verify failures:** "Couldn't send the link" with Resend available at once. This covers the backend rejecting a number already verified elsewhere.
- **Spec size:** about 2,300 tokens, kept whole because it is one goal (self-approved per the user's instruction).

**Never:**
- Don't edit `features/shell/**`, `components/ui/*` (existing), `lib/api/{index,contact-points,keys}.ts`, `allowlist/index.ts`, foundation message files, `test/**` (except `test/page-handlers/profile.ts`), `e2e/fixtures/{core,index}.ts` or `app/page.tsx`.
- Make primary and notifications belong to Story 3.4; email verify belongs to Story 3.6.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Auto-verify | add Mobile Personal; Save; the refetch has new id 40 unverified | the manage POST, then verify `{contactPointIds:[40]}`; "Phone saved."; row 40 "Link sent · Resend in 60 s"; "Link sent" announced once | N/A |
| Excluded | add a Landline, or a Home Mobile; Save | no verify request | N/A |
| Send error | verify answers `{success:false, contactPointIdsWithSendError:[40]}` for [40, 41] | 40 "Couldn't send the link" + Resend now; 41 counts down | N/A |
| Verify fails | verify network or 500 after the save | the save is ok, toast shown, all ids "Couldn't send the link" | no error UI |
| Countdown | fake timers +60 s | "Not verified"; action "Resend verification" enabled | N/A |
| Manual | Verify on unverified Mobile 11 | `{contactPointIds:[11]}`, no edit mode; countdown; kebab item aria-disabled "Link sent · Resend in {n} s" | N/A |
| Manual network | network failure | toast with Retry (Retry resends [11]); row "Not verified" | toast persists |
| Cooldown | 400 with the pending-verification message | row help with the cooldown copy; Resend available | N/A |
| 12 new | 12 new unverified Mobiles saved | two verify calls (10 + 2) | per chunk |
| Verified on focus | refetch returns 11 `isVerified:true` | "Verified", no action | while editing, the edits are kept |

</frozen-after-approval>

## Code Map

- `features/contacts/phone-section.tsx` -- `statusOf` (both views), the read-view `RowActions` list (`editRow`/`removeRow`, `latestSaved` ref pattern), `save()` (3.2's refetch, swapped for the bound `mobile.mutate()`/`landline.mutate()`), `savedPoints`, `isRepeat`. Put the status cell and the action list in small components so they can call `useCountdown`.
- `lib/api/contacts.ts` -- `newUnverifiedContactPoints` (built, untouched), `saveContactPoints` (the `callApi` + `mapApiError` pattern), `ContactPointSaveResult`. Add the verify functions here, never in `contact-points.ts`.
- `lib/server/proxy/allowlist/contacts.ts` (+ `.test.ts`) -- copy the manage entry and `contactPointManageBodySchema` style.
- `lib/api/errors/contacts.ts` (+ `contacts.test.ts`) -- the `Field` union and the rules array; `classifyTransport` in `errors/core.ts` decides network/session.
- `features/shell/use-countdown.ts` (`start(seconds)`, `remaining`, `running`), `components/ui/live-status.tsx` (`useAnnounce`, `LiveStatus`), `components/ui/status-badge.tsx` (`pending`), `features/shell/row-actions.tsx` (`inline`, `disabledReason`), `features/shell/toasts.ts` (`toastError(text, { onRetry })`).
- Tests: a new `features/contacts/phone-section.verify.test.tsx` (`renderInPage`, MSW, let `myself` load before a write: the D-A safeguard re-reads it per POST); `e2e/fixtures/contacts.ts` gets `mockContactVerify` (records bodies, default `{success:true, contactPointIdsWithSendError:[]}`); `e2e/profile-phone.spec.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `lib/server/proxy/allowlist/contacts.ts` (+ test) -- the verify entry and its strict schema.
- [x] `lib/api/errors/contacts.ts` (+ test) -- `verify` field and the cooldown rule.
- [x] `lib/api/contacts.ts` (+ test) -- `contactPointVerifyPath`, `verifyContactPoints`, `sendContactVerification` (empty, chunks, send errors, network, session, cooldown, other failure, never throws); 100% coverage.
- [x] `lib/shared/messages/contacts.ts` -- the new keys.
- [x] `features/contacts/phone-section.tsx` (+ `phone-section.verify.test.tsx`) -- auto-verify in `save()`, send state, status cell, row action, announce, toast; every I/O row; axe light/dark.
- [x] `e2e/fixtures/contacts.ts`, `e2e/profile-phone.spec.ts` -- add → auto-verify → pending badge; manual Verify; send error row; 360 px; axe.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` (Team A) and `sprint-status.yaml` (`3-3` line only).

**Acceptance Criteria:**
- Given the full check (`pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh && pnpm vitest run --coverage && pnpm build && CI=1 pnpm test:e2e`) on Node 24, when it runs, then it is all green with 100% coverage on `lib/server`, `lib/api`, `lib/shared`.
- Given the diff against the baseline, when listed, then only Team A paths changed.

## Implementation Notes

- The bound `mutate()` resolves with the cached list even when the refetch fails (SWR returns `get().data`), so a failed list refetch yields no new ids and sends no verify; a rejected `Promise.all` (e.g. `mutateMyself()`) skips it too.
- `sendContactVerification` puts a `network` chunk's ids in `failed` and stops after a `session` chunk (those ids and later ones are in no list). A manual send that hits `network` leaves the row unchanged and toasts; the auto-verify marks the ids failed.
- The server keeps its own `CONTACT_POINT_VERIFY_MAX_IDS` (10) in `allowlist/contacts.ts`, since `lib/server` may not import `lib/api` (`CONTACT_VERIFY_MAX_IDS`).
- 3.2's "Add US" unit test now counts the Phone list refetch in the Section's cache (the bound mutate) instead of the default app cache; its kebab test expects Verify first on the unverified Mobile.
- After review pass 1: the toast's Retry goes through `verifyRow` (`sendVerification` reports an unreached manual send, `verifyRow` toasts). A send with no id sent announces the cooldown or "Couldn't send the link" line. The cooldown rule matches only the backend's 60 minutes.
- **Final verification (Node 24.22, after the review patches):**
  - lint, typecheck and `check-forbidden` are clean.
  - Vitest: 4615/4615 passed (182 files), coverage 100% on `lib/server`, `lib/api`, `lib/shared`.
  - `pnpm build`, then `CI=1 pnpm test:e2e`: 600 passed, 8 skipped (by design).

## Spec Change Log

## Review Triage Log

Pass 1. The layers were blind hunter (B), edge-case hunter (E) and verification gap (VG).

| # | Layer | Finding | Verdict | Evidence / route |
|---|---|---|---|---|
| 1 | VG | `verifyRow`'s guards (row gone, no longer verifiable, mid-countdown) are untested | medium | Real: `RowActions` already blocks the disabled item, so no test reaches the guards → **patch**: a stale-kebab test. |
| 2 | VG | The "(or failed)" refetch test never rejects | low | Real: the name overclaims → **patch**: rename. (A rejected refetch only skips a verify, which is harmless.) |
| 3 | VG, B, E | The network toast's Retry bypasses `verifyRow`'s guards | low | Real: a late Retry mid-countdown turns the row into cooldown → **patch**: Retry goes through `verifyRow`. |
| 4 | B | Failed and cooldown outcomes appear silently to screen readers | medium | Real (WCAG 4.1.3, the AA bar) → **patch**: announce the help line through the same `LiveStatus`. |
| 5 | B, E | The cooldown pattern accepts any number of minutes, but the copy says "hour" | low | Real, and a direct correction → **patch**: anchor it to 60 (`OneHealthConstants.java:54`). |
| 6 | B | The deferred note understates the backend bug | low | Real (`OneHealthServiceImpl:2650-2665` reassigns on each pass) → **patch**: rewrote the entry. |
| 7 | B | The "another failure" test uses a message the backend doesn't send | low | Real → **patch**: the real `EXISTING_VERIFIED_CONTACT_POINT_WITH_VALUE_ERROR` text. |
| 8 | B | The try/catch around `sendVerification` in `save()` is dead | low | Real; a deletion → **patch**. |
| 9 | B | The allowlist comment says "19-digit ids" | low | Real; the schema caps at 16 digits → **patch**: comment. |
| 10 | B, E | A cooldown on a multi-id chunk marks every id cooldown | false | Only auto-verify sends more than one id, and only for brand-new rows. The cooldown needs an earlier unused verification of the same contact point (`OneHealthServiceImpl:2621-2637`), so it can't hit them. Other whole-request rejections show "Couldn't send the link" with Resend per row. |
| 11 | B, E | `success:false` with an empty list counts as sent | false | The backend sends `failed(...)` only when the list is non-empty (`OneHealthServiceImpl:2529-2537`). |
| 12 | E | A new Mobile with `isVerified: null` gets no auto-verify | false | The backend creates rows with `isVerified = FALSE` (`ContactPointServiceImpl:904`). |
| 13 | B, E | The auto-verify blocks the save resolve | false | Required by the AC ("one `verifyContactPoints(ids)` before resolving") and F3-2 (Save all awaits each `save()`). |
| 14 | B | The matrix "Verify fails" row says "toast shown" | false | It means the "Phone saved." toast, which the test asserts. |
| 15 | B | A number verified on another account looks retryable | false | Spec decision: the other failures show "Couldn't send the link" with Resend. |
| 16 | E | Failed ids that were never sent read "Resend verification" | false | The AC requires "Resend verification" on rows in `contactPointIdsWithSendError`. |
| 17 | B | Failed and cooldown help never clear | low | Needs an hours-long session; the fix adds expiry state → rejected. |
| 18 | B | Two countdowns per counting row; ceil drift up to 1 s | low | Not visible to users; `RowActions` blocks the press → rejected. |
| 19 | E | Mobiles added elsewhere during the edit get a link | low | Needs a concurrent add, and the links go to the user's own numbers → rejected. |
| 20 | E | A toast Retry after the Section unmounts still sends | low | The user asked for it; the state update is a no-op → rejected. |
| 21 | B | Memoize the read columns; the `removeReason` → `removeDisabled` rename | low | Cosmetic, with no named harm → rejected. |
| 22 | B | No default verify e2e route; cooldown and network covered only by unit tests | low | Fail-fast on an unmocked write is intended; the unit tests cover both → rejected. |
| 23 | B | No busy state while a send is in flight | low | A repeat press is ignored by design; the round trip is short → rejected. |

## Verification

**Commands** (Node 24 first on `PATH`: `/private/tmp/claude-501/-Users-anjana-Documents-Dev-1health-personal-profile-personal-profile/6beca074-6290-42d0-ac22-e5ea4b90cf3e/scratchpad/node24/node-v24.22.0-darwin-arm64/bin`; `corepack pnpm` if `pnpm` isn't on `PATH`; no git commits, no push; never `CI=1` e2e without a fresh build; if `app/test-fixtures.test.ts` fails on the glob, delete `node_modules/.vitest-cache`):
- `pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh` -- expected: clean
- `pnpm vitest run --coverage` -- expected: all pass, thresholds met
- `pnpm build && CI=1 pnpm test:e2e` -- expected: all pass
