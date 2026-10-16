---
title: 'Story 2.3: SSN entry and Reveal'
type: 'feature'
created: '2026-10-16'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '5e01411fc11da4c97a7469531c456d99168d8529'
context:
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The SSN row in Personal information is read-only (2.1/2.2). Users can't add, change or clear their SSN, or check it without it staying on screen (Story 2.3, FR13, NG-9022; acceptance source: `epics.md` "### Story 2.3: SSN entry and Reveal").

**Approach:** Add one Section-local SSN component in `features/personal`, used in both the read and the edit view, built on what already exists:
- `useCountdown` (30 s), `useAnnounce` + `LiveStatus`, `mono-value`, `section.control()`, and the drafts denylist;
- `ssnExposePath()` with a new `revealSsn()`, and the SSN-taken error rule;
- the SSN pattern on `user/edit`, plus a new `ssn/expose` allowlist entry.

The full SSN exists in the browser only in that component's React state, and only while it is revealed.

## Boundaries & Constraints

**Always:**
- **Display:**
  - A saved SSN shows the backend mask (`isMaskedSsn`, e.g. `***-**-1234`) in `mono-value` next to a "Reveal" link-text button. The button has an eye icon, is underlined, and has a 44 × 44 px target.
  - With no safe mask there is no Reveal button: read view shows "Not provided", edit view shows an empty input.
- **Reveal** (`revealSsn()` in `lib/api/personal.ts`):
  - It calls `callApi(GET ssnExposePath())` directly. There is no SWR key, no `registerFetcher` and no `mutate`.
  - On success it returns `{ ok: true, ssn: "XXX-XX-XXXX" }`. Only a 9-digit `socialSecurityNumber` counts: `"n/a"`, null or any other shape is `{ ok: false }`.
  - On failure it returns `{ ok: false, mapped }`. It never throws.
  - The component keeps the value in `useState` only and shows it in place of the mask.
  - Alongside it: a 16 px countdown ring (border track, primary progress, depleting clockwise over 30 s, `aria-hidden`) and a 44 px "Hide" button.
  - Under `prefers-reduced-motion` the ring is replaced by the static text "Hides in 30 s".
  - The polite `LiveStatus` announces "Social Security number shown, hides in 30 seconds", and focus moves to Hide.
- **Auto-hide:** the revealed value is cleared from state at once on any of these:
  - 30 s pass (`useCountdown` `onDone`), or the user presses Hide;
  - window `blur`, `visibilitychange` to `hidden`, or `pagehide`;
  - the Section's save or cancel (the edit view unmounts), or the component unmounts;
  - `sessionEvents` `session-expired`.

  If focus was on Hide, it moves to Reveal. Each trigger gets a fake-timer test.
- **Edit input** (the 15th form field `socialSecurityNumber`, through `section.control()`):
  - **Attributes:** `autoComplete="off"`, `spellCheck={false}`, `autoCapitalize="off"`, `autoCorrect="off"`, `inputMode="numeric"`. The `name` (`pp-ref-number`) and the control id (`personal-ref-number`) contain no "ssn" or "social", so password managers and browser autofill don't capture or suggest it. It also gets `data-1p-ignore`, `data-lpignore="true"` and `data-form-type="other"`.
  - **Value:** the form value is the saved mask, `""`, or the typed `XXX-XX-XXXX` text. While revealed and untouched, the input shows the component's revealed value, but the form value stays the mask. The revealed value never enters form state or defaults.
  - **Help text:** masked shows "Type a new number to replace it."; revealed shows "Format XXX-XX-XXXX. Hides in 30 s. Clear it to remove your SSN.".
  - **Typing:**
    - Input is auto-formatted to `XXX-XX-XXXX`: at most 9 digits, non-digits ignored. A paste of `123456789`, `123 45 6789` or `123-45-6789` gives `123-45-6789`.
    - The caret stays on the same digit (`caretAfterDigits`, `lib/shared/dates.ts`), and Backspace across a hyphen works.
    - Typing over the mask replaces it with the typed digits. Deleting from the mask clears the field.
    - The first edit of a revealed value makes it a new entry: the countdown stops, the revealed state is dropped, and the form holds the edited text, so it is not auto-hidden.
    - The Reveal button shows only while the form value is the untouched mask.
- **Validation** (`personalSchema`, on blur and Save): valid values are the untouched baseline mask, `^\d{3}-\d{2}-\d{4}$`, or `""`. Anything else shows "Enter all 9 digits of your SSN" and nothing is sent.
- **Diff:**
  - `socialSecurityNumber` is sent only when it differs from the baseline: a complete value as `XXX-XX-XXXX`, or a clear (`""` where a mask was saved) as exactly `"n/a"`, never `""`.
  - The untouched mask is never sent. A revealed but unedited value never reaches the form, so it is never sent either.
- **Errors:**
  - SSN taken maps to the field through `errorFields: { ssn: "socialSecurityNumber" }`, focuses the input, and no other field is marked.
  - A failed Reveal (network, 403, 4xx, 5xx, bad shape) keeps the mask and shows "Couldn't show your SSN. Try again." under the SSN. That line is polite, is not `aria-invalid`, and is cleared by the next Reveal. A `session` failure shows nothing, because the shell handles it.
- **After a save:** read view shows the new mask, or "Not provided" after a clear. On return to read view the Section calls `section.rebase(toPersonalValues(myself))`, so the typed SSN leaves form state and the hook's saved-values override.
- **Never stored:**
  - The SSN is never in `draftFields`, SWR, storage, the URL, telemetry or `console.*`.
  - Tests reveal, then assert that the SWR cache, both storages, `console` spies, `location.href` and the drafts store hold no 9-digit SSN.
  - A unit test checks that `logApiCall` redacts the expose response body (by key and by shape).
- **Proxy:**
  - `GET v2/person/{personId}/ssn/expose` goes in `allowlist/personal.ts`: owner `me` only, no query, no body, no forced params.
  - Tests cover `me` → upstream `/v2/person/{session personId}/ssn/expose`, a numeric id → 403 `NOT_ALLOWED`, and a query → 400 `BAD_QUERY`.
  - **No-store (human, 2026-10-16):** every proxy response already carries `Cache-Control: private, no-store, max-age=0` (`forward.ts` `withNoStore`). A handler-level test on the real expose entry asserts it on a 200 that carries an SSN, and on its 403 and 400. The same test asserts a log line with only method, template, status, duration and request id: no person id, no body, no SSN.
- **Copy:**
  - New `PERSON_MESSAGES` keys.
  - Verbatim from Voice and Tone: "Reveal", "Hide", "Hides in 30 s", the announcement and both help texts.
  - `// DRAFT COPY`: "Couldn't show your SSN. Try again.", "Enter all 9 digits of your SSN", the names "Reveal SSN" and "Hide SSN", and the screen-reader mask text (Open Question 1).

**Decisions (human, 2026-10-16):**
- **Q1 (a), the mask for screen readers:** the visible mask is `aria-hidden`, with a visually hidden "SSN ending in {last4}" (DRAFT COPY) in the read view and on the masked Reveal row. The edit input keeps its literal value; its help text explains it.
- **Q2 (a), button names:** "Reveal SSN" / "Hide SSN" (the AC; DRAFT COPY for Hide).
- **Q3 (a), SSN-taken message:** accepted. The backend's SSN-taken 400 message, which contains the typed SSN, passes through the proxy unchanged. A test asserts that after that response no 9-digit SSN is in the console spies, the rendered DOM, the SWR cache or the storages.
- **Spec size:** about 3,000 tokens, kept whole (human).

**Never:**
- Don't edit `features/shell/**`, `components/ui/*` (existing), `lib/api/{index,client,log-api-call,keys}.ts`, `lib/server/proxy/{handler,match,forward,deny-list}.ts`, `allowlist/index.ts`, foundation message files or the shared PA4 keys, `test/**` (except `test/page-handlers/profile.ts`), or `e2e/fixtures/{core,index}.ts`.
- Don't put the revealed value in a ref that outlives the reveal, a module variable, a context, an attribute (`data-*`, `title`, `aria-label`), or an error or log message.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Reveal (read) | mask `***-**-6789`; expose `{id, socialSecurityNumber:"123456789"}` | shows `123-45-6789` in mono, ring + Hide, announcement, focus on Hide | N/A |
| Hide paths | revealed; 30 s / Hide / blur / hidden / pagehide / cancel / save / unmount / session-expired | mask returns at once; focus on Reveal if it was on Hide | N/A |
| Reduced motion | `prefers-reduced-motion: reduce` | "Hides in 30 s" text, no ring | N/A |
| No SSN | `socialSecurityNumber: "n/a"` or null | read "Not provided", no Reveal; edit empty input | N/A |
| Reveal fails | expose 500 / 403 / network / `"n/a"` | mask stays; "Couldn't show your SSN. Try again." | session → shell only |
| Type new | edit, mask; type `123456789` | input `123-45-6789`; Save sends `{ socialSecurityNumber: "123-45-6789" }` | N/A |
| Paste | paste `123 45 6789` | `123-45-6789` | N/A |
| Partial | `123-45` then blur/Save | "Enter all 9 digits of your SSN"; nothing sent | N/A |
| Clear | saved mask; clear input; Save | sends `{ socialSecurityNumber: "n/a" }`; read "Not provided" | N/A |
| Untouched | mask (revealed or not); Save | no `socialSecurityNumber` in the body | N/A |
| Edit revealed | revealed in edit; change one digit | stays visible past 30 s; countdown gone; Save sends the edited value | N/A |
| Taken | PUT 400 SSN exists | "This SSN belongs to another person" under SSN, input focused, other fields unmarked | stays in edit |
| No leak | after reveal and after a typed save | no 9-digit SSN in SWR cache, storages, drafts, URL, console spies, form state after save | N/A |
| Proxy | `me` / `4242` / `?x=1` | upstream own personId / 403 `NOT_ALLOWED` / 400 `BAD_QUERY`; `no-store` | N/A |

</frozen-after-approval>

## Code Map

- `features/personal/personal-section.tsx` -- `isMaskedSsn`, `maskedSsn` (read row), `ReadOnlyValue` SSN edit row: replaced by the new SSN component; `personalEditRows`, `useSectionForm` options (`fieldOrder`, `errorFields`).
- `features/personal/schema.ts` -- add `socialSecurityNumber` to `PersonalValues`, `toPersonalValues` (safe mask or `""`), `personalSchema`, `personalDiff`; keep `PERSONAL_DRAFT_FIELDS` at 14 and add a separate field order that puts SSN last.
- New `features/personal/ssn.ts` (+ test) -- pure helpers: `formatSsnInput(raw)` (digits only, ≤ 9, hyphens), `isCompleteSsn`, `toSsnDisplay("123456789")`.
- New `features/personal/ssn-field.tsx` (+ test) -- the reveal component (read and edit variants) and the countdown ring.
- `features/shell/use-countdown.ts` (`useCountdown({ onDone }) → { remaining, running, start(s), stop() }`), `components/ui/live-status.tsx` (`useAnnounce`, `LiveStatus`), `lib/api/session-events.ts` (`sessionEvents.subscribe("session-expired", fn)`), `features/shell/drafts.ts` (`DRAFT_DENYLIST` throws on `ssn`/`socialSecurityNumber` in dev/test), `use-section-form.ts` (`control`, `rebase`, `errorFields`) — use, don't edit.
- `lib/api/personal.ts` -- `ssnExposePath()`; add `revealSsn()`. `lib/api/log-api-call.ts:21-29` already redacts `ssn|socialsecuritynumber` keys and `\d{3}-?\d{2}-?\d{4}` values (dev only).
- `lib/api/errors/personal.ts` -- SSN-taken rule (exists).
- `lib/server/proxy/allowlist/personal.ts` (+ `personal.test.ts:11-16` exact entry list, `:33-41` the `{personId}` pattern) -- add the entry. `match.ts:6-57` owner `me` → session `personId`; `forward.ts:98` `withNoStore` on every response; `handler.ts:111` logs the template only (`handler.test.ts:254-271` is the pattern for a log assertion).
- Backend (`../../1h-ng-bo-core-be`): expose returns `{id, socialSecurityNumber}` as 9 digits, `"n/a"` when cleared, 400 when none; `user/edit` clears only with lowercase `"n/a"` (`""` is a 400); the mask is `***-**-` + last 4.
- `lib/shared/messages/person.ts` -- new keys; `PERSON_MESSAGES.ssn`, `ssnTaken` exist.
- Tests: `test/myself-fixture.ts`, `renderInPage`, `test/axe.ts`; e2e `mockProfileDefaults`, `mockProxy`, `mockUserEdit`.

## Tasks & Acceptance

**Execution:**
- [x] `lib/server/proxy/allowlist/personal.ts` (+ test) -- the expose entry, entry-list update, `me`/numeric/query cases, the handler-level no-store and log test.
- [x] `lib/api/personal.ts` (+ test) -- `revealSsn()`: success formatting, `"n/a"`/bad shape/4xx/5xx/network → not ok, never throws, no SWR cache entry; a `logApiCall` redaction case for the expose body.
- [x] `lib/shared/messages/person.ts` -- the new keys.
- [x] `features/personal/ssn.ts` (+ test) -- formatting, paste, caret helpers, completeness.
- [x] `features/personal/schema.ts` (+ test) -- SSN value, rule, diff (`"n/a"` on clear, mask never sent), 14 draft fields unchanged.
- [x] `features/personal/ssn-field.tsx` (+ test) -- reveal, each auto-hide trigger (fake timers), focus, reduced motion, announcement, failure, edit typing/paste/over-mask/new-entry, the no-leak assertions, axe.
- [x] `features/personal/personal-section.tsx` (+ test) -- wire the component into both views, `errorFields`, field order, the post-save rebase; SSN-taken focus; no SSN in drafts after a session expiry.
- [x] `e2e/profile-personal.spec.ts` (+ `e2e/fixtures/personal.ts`) -- reveal → hide on Hide and on a hidden tab, reveal in edit, type/paste/save, clear → "n/a", taken, axe revealed light/dark, 360 px.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- the `2-3` line.

**Acceptance Criteria:**
- Given the full check (`pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh && pnpm vitest run --coverage && pnpm build && CI=1 pnpm test:e2e`) on Node 24, when it runs, then it is all green with 100% coverage on `lib/server`, `lib/api`, `lib/shared`.
- Given the diff against the baseline, when listed, then only Team A paths changed.

## Implementation Notes

- **Components:** `features/personal/ssn-field.tsx`: `SsnValue` (read view) and `SsnInput` (edit view) share `useSsnReveal`. Pure helpers are in `features/personal/ssn.ts` (`formatSsnInput`, `isCompleteSsn`, `replaceMask`, `insertedText`, `maskDigits`).
- **Uncontrolled input:** the edit input's value is written as a DOM property only, so React never copies a revealed or typed SSN into the `value` attribute ("Never … an attribute").
- **Typing over the mask:** the selection is recorded on keydown, paste, cut and drop, so an edit replaces the selected part of the mask (`replaceMask`). A paste or insert holding 9 or more digits replaces the whole value; a single tenth typed digit is ignored.
- **Hide triggers** also listen while a Reveal is in flight, so a late answer after blur, a hidden page, `pagehide` or `session-expired` is dropped.
- **Further guards:**
  - Reveal is refused once `session-expired` has been published on the page.
  - Saving hides a revealed value and removes Reveal and Hide (a failed save comes back masked).
  - A first edit drops any pending Reveal and the failure line.
  - Focus moves to Hide only from Reveal or `body`.
- **Copy:**
  - The announcement "Social Security number shown, hides in 30 seconds" is verbatim from EXPERIENCE.md's accessibility floor, not the Voice and Tone table that `messages.test.ts` checks, so it carries `// DRAFT COPY` with that note.
  - The ring's progress uses `stroke-primary-text`, which is primary in light mode and passes AA on dark surfaces.
- **Help line:** shown only for the masked and revealed states. An empty or typed value has no help, because the spec gives copy for those two only.
- **Mask source:** the Section passes one `ssnMask` (`toSsnFormValue(myself?.socialSecurityNumber)`) to both `personalSchema` and `SsnInput`.
- **Not added:** no default expose handler in `test/page-handlers/profile.ts` or the e2e defaults, because Reveal is user-triggered, not a page read.

- **Final verification (Node 24.22, after the review patches):**
  - lint, typecheck and `check-forbidden` are clean.
  - Vitest: 4103/4103 passed (172 files), coverage 100% on `lib/server`, `lib/api`, `lib/shared`.
  - `pnpm build`, then `CI=1 pnpm test:e2e`: 479 passed, 5 skipped (by design), none flaky.

## Spec Change Log

## Review Triage Log

Pass 1. The layers were blind hunter (B), edge-case hunter (E) and verification-gap (VG).

| # | Layer | Finding | Verdict | Evidence / route |
|---|---|---|---|---|
| 1 | E | Typing over the mask while a Reveal is in flight lets the late answer show the full SSN over the typed text | medium | Real: `commit()` dropped the reveal only when `revealed !== null`, so `pending` survived → **patch**: drop unconditionally, plus a test. |
| 2 | E, B | A failed Reveal line stays after typing removes the Reveal button | low | Real: `failed` cleared only on the next Reveal → **patch**: clear on the first edit. |
| 3 | E, VG | Reveal after `session-expired` was already published has no session auto-hide, and the session guard is untested | medium | Real: the event is latched once per page, so the listener never fires again → **patch**: refuse while `hasPublished`, plus a test with the event pre-published. |
| 4 | E, B | Reveal stays clickable while saving, and a value revealed before Save stays visible through a failed save | medium | Real: only a successful save unmounts the edit view → **patch**: hide on save start; no Reveal while read-only. |
| 5 | E | A late Reveal answer pulls focus to Hide after the user moved on | low | Real; a direct guard → **patch**: move focus only from Reveal or `body`. |
| 6 | E, B | A paste of a full SSN into a partial value keeps the combined first nine digits; a ≥ 10-digit paste over a full selection is dropped | low | Real: the tenth-digit rule ran on any paste → **patch**: a pasted 9+ digit run replaces the value. |
| 7 | B | `personalSchema`'s `ssnMask = ""` default makes a saved mask invalid when omitted; the mask has two sources | low | Real; direct → **patch**: required parameter, from the form baseline. |
| 8 | B | `toSsnDisplay` is unused and duplicates `revealSsn`'s formatting | low | Real; deletion → **patch**. |
| 9 | VG | No test drives the post-save rebase with an unchanged `myself` | medium | Real regression gap (removing the effect passes every test) → **patch**: a test. |
| 10 | B | Edit while the read-view SSN is revealed is untested | low | Real gap → **patch**: a test. |
| 11 | B | The SSN-taken test restores its spies on its last line | low | Real leak on failure → **patch**: `afterEach`. |
| 12 | B | `lib/api/personal.test.ts` leak regex has no digit boundaries | low | Real flake risk → **patch**: the bounded pattern. |
| 13 | B | No browser test of the 30 s auto-hide | low | Real gap → **patch**: e2e with `page.clock`. |
| 14 | E, B, VG | The post-save rebase replaces all 15 baseline values with `myself`, so a save whose refetch fails shows pre-save values on the next Edit | low | Real only when the GET fails right after a successful PUT. The read view already shows `myself` in that case, so edit matches what is shown, and the approved spec names this rebase → rejected. |
| 15 | E | A stale mask selection could be used by an IME or dictation edit | low | `inputMode="numeric"`, and an edit without a keydown is rare; the fix adds handlers → rejected. |
| 16 | B | Screen readers aren't told when the SSN hides | low | Not in the AC. A hide announcement on blur or a hidden tab would be heard out of context, and it needs new copy → rejected (UX/PM note). |
| 17 | B | A 403 on expose says "Try again" | low | The spec allows one failure line; a permanent 403 for one's own SSN is not expected (proxy owner `me`) → rejected. |
| 18 | B | The real paste path isn't driven in e2e | low | Unit tests cover `replaceMask` with selections; Playwright clipboard paste needs permissions per browser → rejected. |
| 19 | B | Leak-check helpers are copied into four test files | low | Duplication in tests only (row 12 fixes the one divergent copy) → rejected. |
| 20 | B | The spec says the announcement is Voice and Tone verbatim, but the copy file marks it DRAFT COPY | low | It is verbatim from EXPERIENCE.md's accessibility floor, not the V&T table, which the copy test checks. The marker is right; fixing the spec claim would edit this spec → rejected (noted in Implementation Notes). |
| 21 | B | The spec status was in-review with unticked tasks | false | Tasks are ticked after verification (step 3), as now. |
| 22 | B | The Verification section holds a local Node path | false | It is this machine's Node 24 for the build agent (as in 2.1 and 2.2). |
| 23 | B | `RevealButton` and `HideButton` are near-duplicates | low | Two short components with no drift harm named → rejected. |

## Design Notes

- **Audit of SSN reveals is not this app's job.** The architecture spine leaves open "Is the 1health backend audit the system of record for SSN expose and Signature changes, or must the proxy emit audit lines to a BAA sink?" (`ARCHITECTURE-SPINE.md` open questions; owner Daniel Garcia; security review SEC-17). That is a backend/BAA decision.
  - Investigation found that the backend `exposeSocialSecurityNumber` writes no audit record today; it only error-logs a 403 denial.
  - This story adds no audit line. The proxy log stays the AD-15 minimum: method, template, status, duration, request id.
  - If the decision lands on the proxy, it is a foundation change to the handler, not part of this Section.
- **Why the revealed value never enters the form:** `useSectionForm` keeps the saved values as an override after a save and passes form values to the registry. Keeping the revealed value in the SSN component's own state means only a typed entry ever reaches the form, and the post-save rebase removes that too.

## Verification

**Commands** (Node 24 first on `PATH`: `/private/tmp/claude-501/-Users-anjana-Documents-Dev-1health-personal-profile-personal-profile/6beca074-6290-42d0-ac22-e5ea4b90cf3e/scratchpad/node24/node-v24.22.0-darwin-arm64/bin`; `corepack pnpm` if `pnpm` isn't on `PATH`; no git commits, no push; never `CI=1` e2e without a fresh build):
- `pnpm lint && pnpm typecheck && bash scripts/check-forbidden.sh` -- expected: clean
- `pnpm vitest run --coverage` -- expected: all pass, thresholds met
- `pnpm build && CI=1 pnpm test:e2e` -- expected: all pass
