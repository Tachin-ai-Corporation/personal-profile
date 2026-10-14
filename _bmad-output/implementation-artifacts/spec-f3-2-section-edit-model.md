---
title: 'F3-2 Section edit model: registry completion, useSectionForm, section chrome, key/value table, save runners'
type: 'feature'
created: '2026-10-14'
status: 'in-progress'
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
- [ ] `features/shell/{nav-types,section-registry}.tsx` (+tests) -- registry completion.
- [ ] `features/shell/use-section-form.ts`, `section-{header,container,footer}.tsx` (+tests, axe) -- edit model and chrome.
- [ ] `features/shell/key-value-table.tsx` (+tests) -- read/edit table.
- [ ] `features/shell/{run-save-steps,save-all}.ts`, `leave-guard.tsx`, `page-frame.tsx` (+tests) -- runners and guard refactor.
- [ ] `features/shell/__fixtures__/fixture-section.tsx`, `app/test-fixtures/section/page.tsx`, `e2e/section.spec.ts` -- fixture and e2e.

**Acceptance Criteria:**
- Given the fixture Section on `/test-fixtures/section`, when a keyboard user edits, validates and saves, then focus, live regions and axe pass on desktop and 360 px.
- Given `pnpm lint && pnpm typecheck && pnpm vitest run --coverage && pnpm test:e2e && pnpm build && bash scripts/check-forbidden.sh`, then all pass.

## Verification

**Commands:**
- `corepack pnpm lint && corepack pnpm typecheck` -- expected: clean
- `corepack pnpm vitest run --coverage` -- expected: green
- `corepack pnpm test:e2e && corepack pnpm build && bash scripts/check-forbidden.sh` -- expected: green

## Implementation Notes

## Spec Change Log

## Review Triage Log
