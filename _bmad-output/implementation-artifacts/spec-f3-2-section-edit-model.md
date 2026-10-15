---
title: 'F3-2 Section edit model: registry completion, useSectionForm, section chrome, key/value table, save runners'
type: 'feature'
created: '2026-10-14'
status: 'done'
baseline_commit: '5b4ed143dde8f204c66c2aef623311be2e3b8798'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/shared-foundation-plan.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-personal-profile-2026-10-13/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-personal-profile-2026-10-13/EXPERIENCE.md'
  - '/Users/idanielgarcia/Documents/DEV/oneHealth/dev-std-ai-agents-and-skills/stacks/react/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Every editable Section of both teams (Team A: 2.2, 2.4, 3.x, 4.2, 5.x; Team B: 7.5, 7.6) needs the same edit model — read/edit/saving modes, dirty tracking against a baseline, the "Unsaved changes" footer, field validation and focus rules, a key/value table, multi-step saves and the Save-all runner the leave guard reuses — and none of it exists; the registry also lacks `saveAll`, a dirty count, an invalid count and the hooks F4 drafts need.

**Approach:** Build the F3-2 slice of `shared-foundation-plan.md` per Story 1.11 (L~1410–1501), 1.13 (leave guard Save), 1.14 runner (L~1642–1669) and the consuming stories, on top of F3-1 primitives (FormField, InputLocked, busy Button, InlineBanner, toasts). Story-specific behaviour is parameterised (see the plan's "F3 split" section), not hard-coded.

## Boundaries & Constraints

**Always:**
- **Registry completion** (`features/shell/{nav-types,section-registry}.tsx`): `saveAll?: false`, `getDirtyCount()`/`useDirtyCount()` counting only `saveAll !== false`, `ValidateResult` invalid branch carries `invalidCount`, `SaveError` carries `code: "SESSION_EXPIRED"` for session errors, optional draft hooks typed for F4 (`getDraftValues`, `getDraftBase`, `applyDraft`, `describeDraftDiff`), `sectionHeadingId(id)` helper.
- **`features/shell/use-section-form.ts`**: react-hook-form + zodResolver (`mode: "onBlur"`), registers via `useRegisterSection`; dirty = deep inequality with the baseline; `startEdit`, `cancel` (no confirm), `submit`, `rebase(next)` (keeps dirty values); saving makes inputs `readOnly` (never `disabled`), disables Cancel, busy Save "Saving…", one send on double click; invalid Save sends nothing and focuses the first invalid field; success → read view, focus per `cancelFocus`/success rule, `telemetry.track("section_save", …)`, toast only from the Section's own Save (never from the registered `save()`, so leave guard / Save all never toast per Section). Options: `onNoChanges: "close" | "status"` ("There are no changes" polite status), `successToast: string | false`, `cancelFocus: "heading" | "edit"`. Enter in an input never submits; Escape never cancels.
- **Section chrome** (`features/shell/{section-header,section-container,section-footer}.tsx`): header 44 px row with `h2 id=sectionHeadingId tabIndex=-1`, count or "Editing", actions; container with the editing primary border + 3 px accent halo; footer with the polite "Unsaved changes" indicator from the first change, Section-level error slot (InlineBanner + Retry) above it, "Add row" (optional), Cancel, Save (busy).
- **`features/shell/key-value-table.tsx`**: read (`th scope="row"` keys; desktop 4 columns row-by-row with a vertical hairline; mobile one pair per row; "Not provided" for empty; optional `rowId` anchor) and edit (`KeyValueEditTable`: 240 px key column, controls ≤480 px, help/error under the control; mobile label above control); layout chosen with `useMediaQuery`, never CSS-hidden twins.
- **`features/shell/run-save-steps.ts`**: `runSaveSteps(steps, { scope, mode: "stop" | "attemptAll", refetch?, rebase? })` mapping failures through `mapApiError(scope, …)`; `stop` skips later steps, refetches and rebases so a retry sends only the remaining diff; `attemptAll` runs every non-skipped step and returns `failedParts`; a session error stops at once in either mode.
- **`features/shell/save-all.ts`**: `runSaveAll(registry, { order })` (validate all dirty `saveAll` Sections first and send nothing if any is invalid; then save sequentially in order, skip clean, continue after non-session failures, stop on `SESSION_EXPIRED` without a summary; `save_all` telemetry once if anything was sent) + `saveAllSummary(outcome)` copy; LeaveGuard's Save refactored to use it, then guard-only participants. No Save-all bar/pill/`SAVE_ORDER` here (Team A); `PageFrame` gets an optional `saveAllSlot` typed so it is only allowed on the profile page.
- **Fixture + tests**: `features/shell/__fixtures__/fixture-section.tsx` (id `phone`, own `schema.ts`, required text field) exercised by Vitest/RTL (read→edit focus, dirty on/off, Cancel, Enter/Escape, blur and Save validation, saving state, telemetry payload, both `onNoChanges` modes, both `cancelFocus` modes, axe) and a Playwright page `app/test-fixtures/section` behind `PP_E2E_FIXTURES=1`; runner tests (3-step stop/retry diff, attemptAll failedParts, session stop, Save-all invalid/partial/all/zero, "0 saved, 2 failed").
- Copy only from the message catalog (Section area files); semantic tokens; WCAG 2.1 AA.

**Never:**
- No StateFrame/skeletons/section navigation (F3-3), no drafts storage or restore UI (F4), no feature Sections, no Save-all bar/pill.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Edit cycle | Edit → change → revert | "Unsaved changes" appears then clears | — |
| Invalid Save | a required field empty | nothing sent; focus first invalid field; aria-invalid | — |
| No changes | Save with nothing dirty | `close` → read view / `status` → "There are no changes" | — |
| Stop mode | step 2 of 3 fails | step 3 skipped, refetch + rebase; retry sends steps 2–3 only | session error → stop |
| attemptAll | steps 1 and 3 fail | all run; `failedParts` = [1,3]; step 2 becomes baseline | session error → stop |
| Save all | two dirty, one invalid | nothing sent; invalid list with counts | — |
| Save all partial | A ok, B 500 | both attempted; summary "1 saved, 1 failed" | — |

</frozen-after-approval>

## Code Map

- `features/shell/{section-registry,nav-types,leave-guard,page-frame,index}.tsx` -- registry completion, LeaveGuard Save via runner, `saveAllSlot`.
- `components/ui/{form-field,input-locked,button,inline-banner}.tsx`, `features/shell/toasts.ts` (F3-1) -- reuse.
- `lib/api/errors/*` (`mapApiError`, `mappedErrorCode`), `lib/shared/{telemetry,section-ids}.ts`, `lib/shared/messages/section.ts` -- reuse/extend copy.
- `app/test-fixtures/leave-guard/page.tsx` -- pattern for the new fixture page.

## Tasks & Acceptance

**Execution:**
- [x] `features/shell/{nav-types,section-registry}.tsx` (+tests) -- registry completion.
- [x] `features/shell/use-section-form.ts`, `section-{header,container,footer}.tsx` (+tests, axe) -- edit model and chrome.
- [x] `features/shell/key-value-table.tsx` (+tests) -- read/edit table.
- [x] `features/shell/{run-save-steps,save-all}.ts`, `leave-guard.tsx`, `page-frame.tsx` (+tests) -- runners and guard refactor.
- [x] `features/shell/__fixtures__/fixture-section.tsx`, `app/test-fixtures/section/page.tsx`, `e2e/section.spec.ts` -- fixture and e2e.

**Acceptance Criteria:**
- Given the fixture Section on `/test-fixtures/section`, when a keyboard user edits, validates and saves, then focus, live regions and axe pass on desktop and 360 px.
- Given `pnpm lint && pnpm typecheck && pnpm vitest run --coverage && pnpm test:e2e && pnpm build && bash scripts/check-forbidden.sh`, then all pass.

## Verification

**Commands:**
- `corepack pnpm lint && corepack pnpm typecheck` -- expected: clean
- `corepack pnpm vitest run --coverage` -- expected: green
- `corepack pnpm test:e2e && corepack pnpm build && bash scripts/check-forbidden.sh` -- expected: green

## Implementation Notes

- **Registry:** `RegisteredSection` gains `saveAll` and the four optional draft hooks (delegated to the latest render). A throwing `validate()` counts as `invalidCount: 1`. `SaveError` is now `{ code?: SaveErrorCode (= TelemetryErrorCode), mapped?: MappedError, failedParts? }`; `SESSION_EXPIRED_CODE`, `isSessionExpired()`, `sectionHeadingId(id)` (`<id>-heading`, matches F3-3's `#email-heading`) live in `nav-types.ts`.
- **`useSectionForm`:** no `<form>` element (Enter/Escape do nothing natively; all footer buttons are `type="button"`). The baseline is the `baseline` prop, overridden after a successful save or an explicit `rebase(next)` until the prop changes; an effect re-syncs RHF values (read view: reset; edit view: merge keeping fields that differ from the previous baseline). Focus moves synchronously through the controls registered by `field(name)` (RHF's `setFocus` defers with `setTimeout`). The registered `save()` shows the saving state and errors and fires `section_save` but never toasts or moves focus. Network failures from the Section's own Save also raise `toastError` with Retry (Story 1.12). Retry (banner and toast) always runs the latest render's submit, so it diffs against the rebased baseline. Options added beyond the spec: `fieldOrder`, `errorFields` (server field → form path), `describeError` (e.g. 7.5's "{Part} was not saved."), `describeDraftDiff`.
- **`runSaveSteps`:** steps are `{ part, skip?, run }`; result `{ ok, succeeded, error?: { code, mapped, failedParts } }`. In `stop` mode `failedParts` = the failing step plus the never-run ones. Refetch + rebase run after any non-session failure (both modes); a failing refetch is swallowed.
- **`runSaveAll`:** `{ order?, includeGuardOnly? }`; outcomes `clean | invalid | session | done`. The leave guard uses `includeGuardOnly: true` (guard-only participants validated up front, saved after the Save-all Sections). `save_all` telemetry counts every Section the run sent.
- **Copy:** `SECTION_MESSAGES.noChanges` ("There are no changes"), `invalidOne` ("{section} has 1 field to fix"), `invalidMany` (DRAFT). The fixture schema needed a catalog validation string: `CONTACT_MESSAGES.phoneTenDigits` ("Enter a 10-digit US number", verbatim Voice and Tone; Epic 3 will reuse it).
- **Shared helper:** `lib/shared/deep-equal.ts` (100 % covered; F4's `baseHash` can reuse it).
- **Fixture:** `FixtureSection` (number + optional note, `save(values, baseline, rebase)`), `SectionFixturePage` (fail-next-save switch, saves counter), `app/test-fixtures/section`.
- **Review fixes (round 1):** `runSaveAll` takes `trackTelemetry` (the leave guard passes `false`), and a participant without `save` defaults to `saveAll: false` (it isn't counted or queued). The leave guard takes an `order` (`PageFrame` `saveOrder`, default `displayOrder`); when a save fails it shows the `saveAllSummary` partial toast and focuses the first failed Section's `h2`. In `runSaveSteps`, `applySucceeded(parts)` rebases locally when there is no `refetch`, so a retry never re-sends a step that succeeded. `deepEqual` treats an `undefined`-valued key as absent. `useSectionForm` changes:
  - One dirty predicate is shared by the footer, the registry and the no-changes check.
  - Invalid count and first-invalid focus come from `schema.safeParse` issues: nested and list paths are focused by exact name or `name.` prefix, in page order. RHF's `formState` is a render snapshot and `trigger()` drops unmounted paths, so it can't be used here. A refine or root issue with no control shows as the Section error.
  - The registered `save()` joins an in-flight save and sends schema-parsed values (raw values when they don't parse).
  - The override baseline is cleared whenever the `baseline` prop changes (state adjusted during render).
  - `applyDraft` is ignored while saving. Read → edit runs the same setup as Edit, and values are set with `shouldValidate`.
  - Retry focuses Save (`<id>-save`) before re-running.
  - The network error toast is dismissed on success or on return to read view.
  - The literal session code in `showFailure` is replaced by `SESSION_EXPIRED_CODE`.

  `KeyValueTable` pairs each value with its own key through `headers`/`id`; the row anchor doubles as the key id. The edit table drops native `required` (no `<form>`) and keeps `aria-required`. Other changes: a `/test-fixtures/section` gate test, e2e checks at 360 px for the stacked layout and for 44 px on Edit, Add row and Retry, `import type` moved to the top of `nav-types.ts`, and provenance comments on the new copy (all three strings are verbatim in EXPERIENCE.md).

## Spec Change Log

## Review Triage Log

Review pass 1 (2026-10-14; Blind Hunter, Edge Case Hunter, Verification Gap).

| # | Finding | Verdict | Route |
|---|---|---|---|
| 1 | Leave-guard Save fires save_all telemetry | low | patch (`trackTelemetry`) |
| 2 | Failed leave-guard save gives no feedback | medium | patch (summary toast + focus first failed heading) |
| 3 | Leave guard ignores page save order | low | patch (`saveOrder` prop) |
| 4 | Participants without save always fail / counted dirty | high | patch (default `saveAll:false`) |
| 5 | stop mode without refetch re-sends succeeded steps | medium | patch (`applySucceeded`) |
| 6 | isDirty vs submit predicates differ; undefined keys dirty | medium | patch |
| 7 | Nested/list invalid count and focus; root errors silent | medium | patch (schema issues, root error banner) |
| 8 | Registered save: in-flight shape, raw vs parsed, untested failure path | medium | patch |
| 9 | Stale override after server baseline change / A→B→A | medium | patch |
| 10 | applyDraft during saving and without edit setup | low | patch |
| 11 | Retry drops focus; stale error toast | low | patch |
| 12 | KV read table header ambiguity; duplicate helper; native required | low | patch |
| 13 | Section fixture gate untested; e2e desktop only; 44 px gaps | medium | patch |
| 14 | Import order, copy provenance | low | patch |
| 15 | KV table mobile-first hydration shift; remount on resize | low | reject (spec forbids CSS twins; minor impact) |

