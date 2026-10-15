---
title: 'F4 Drafts: keep unsaved edits across an expired session (Story 1.15)'
type: 'feature'
created: '2026-10-14'
status: 'done'
baseline_commit: 'b3f08011366507231947334d01e90bc145b38fef'
route: 'dispatch'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/implementation-artifacts/shared-foundation-plan.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-personal-profile-2026-10-13/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-personal-profile-2026-10-13/EXPERIENCE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-f3-2-section-edit-model.md'
  - '/Users/idanielgarcia/Documents/DEV/oneHealth/dev-std-ai-agents-and-skills/stacks/react/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** When a session ends (idle, absolute cap, expiry) or the tab closes, a user's unsaved Section edits are lost. Story 1.15 (both teams' editable Sections: 2.2, 3.x, 4.x on `/`; 7.5, 7.6 on `/account`) requires them to survive a relaunch, to be offered back, and to be compared when the server data changed meanwhile. F3-2 typed the registry hooks for this; nothing stores, restores or purges drafts yet.

**Approach:** Implement Story 1.15 (`epics.md`, AD-12) as `features/shell/drafts.ts` plus the restore/conflict UI, wired through the F3-2 registry and `useSectionForm` draft hooks, following the decisions in `shared-foundation-plan.md` ("F4 / F5 decisions"). Approved by the human in advance (2026-10-14).

## Boundaries & Constraints

**Always:**
- **Storage:** `localStorage`, key `pp:draft:v1:<userId>:<sectionId>` (`userId` = `myself.id`; nothing is written before `myself` loads), value `JSON.stringify({ savedAt, baseHash, values })`. Only `drafts.ts` reads, writes and deletes; Sections never touch storage. Any storage failure (unavailable, quota, throw) is swallowed silently and editing/saving keep working.
- **Writing:** debounced 500 ms after the last user change while a draftable Section is dirty; key deleted when the Section becomes clean; synchronous flush of every dirty draftable Section on `onBeforeSessionExpired` (before the dialog opens) and on `pagehide`. A Section dirty only through app-preselected defaults writes nothing until a user change.
- **Fields:** only the Section's `draftFields`; denylist (`ssn`, `socialSecurityNumber`, `signature`, `signatureFile`, `code`, `mfaCode`, `qrCode`, `providerNpiId`, `practiceNpiId`, `npi`, `username`, `password`) — registering any of them, or non-empty `draftFields` with `saveAll:false`, throws in development and is dropped in production. Insurance (guard-only) never writes.
- **baseHash:** SHA-256 hex of sorted-key JSON of `getDraftBase(server)`; computed and cached when edit starts or the base changes (the flush is synchronous and never hashes).
- **Deleting / purging:** a Section's key is deleted on its save `{ok:true}` (own Save, Save all, leave-guard Save) and on discard (Cancel, leave-guard Discard). `drafts.purgeUser(userId)` deletes all `pp:draft:v1:<userId>:*` via `onBeforeExit` (portal exit only); drafts are kept on hand-off and on the session dialog's "Return to 1health". On shell mount every `pp:draft:*` key older than 24 h, unparsable or not `v1` is deleted; other users' drafts are never offered or parsed.
- **Restore:** when a non-expired draft exists for this user, the Section's data has loaded and the current base hash equals `baseHash` → InlineBanner info "You have unsaved changes from your last visit." with "Restore" (edit view with the draft applied via `applyDraft`, dirty, counted by Save all) and "Discard" (delete, stay in read view).
- **Conflict:** when the hash differs → banner "This section changed since your draft. Choose which version to keep." with a compare of `describeDraftDiff(draft, current)` rows (field label in `kv-key`; "Your version" / "Current" columns; empty → "Not provided"; stacked below 768 px) and buttons "Use current" (secondary: delete, read view) and "Keep mine" (primary: edit view with the draft over the current-server baseline so Save sends the diff against current). Never merge automatically. If the Section's read failed: no banner, draft kept.
- **Integration:** `useSectionDraft(sectionId)` hook / slot rendered by the F3-2 Section chrome; registry wraps `save`/`discard` to delete; provider registers the flush; copy in a new `lib/shared/messages/drafts.ts` area file; multi-tab is last-writer-wins (documented).
- **Tests:** key/value shape, 499 vs 500 ms debounce, delete when clean, hash stability across key order, denylist dev/prod, Insurance never drafted, throwing storage, flush-before-dialog ordering, delete on save/discard via own Save / Save all / leave guard, `purgeUser` only for the current user and never on hand-off or session-dialog Return, 24 h / unparsable / wrong-version purge, other user untouched, restore vs conflict branch, Keep mine diff against current, read error → no banner, cross-page invalidation through `myself`, Playwright on the fixture Section (same-user restore; server changed → conflict; different user → no banner), axe on banner and compare at 360 px.

**Never:**
- No sessionStorage, no `storage`-event cross-tab sync, no automatic merge, no draft of denylisted fields, no feature Sections.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Expire while editing | dirty fixture Section, session expires | draft written before the dialog opens | storage throws → nothing shown |
| Relaunch, same data | same user, same server values | restore banner; Restore → edit view dirty | — |
| Relaunch, data changed | server value changed | conflict compare; Keep mine → Save sends diff vs current | — |
| Other user | draft under another userId | no banner, key untouched | — |
| Portal exit | Return to 1health from app bar | `purgeUser` deletes this user's drafts | session-dialog Return keeps them |
| Old draft | savedAt > 24 h | deleted on mount, never offered | — |

</frozen-after-approval>

## Code Map

- `features/shell/{section-registry,use-section-form,nav-types,leave-guard,session-dialog,exit-hooks,navigate,page-frame,index}.ts(x)` (F3-2/7.0b-2/7.0c-1) -- draft hooks, flush/purge seams.
- `features/shell/__fixtures__/fixture-section.tsx`, `app/test-fixtures/section/page.tsx`, `e2e/section.spec.ts` (F3-2) -- extend for draft e2e.
- `components/ui/inline-banner.tsx` (F3-1), `features/shell/key-value-table.tsx` (F3-2) -- banner and compare layout.
- `lib/shared/deep-equal.ts`, `lib/api/myself.ts` -- reuse.

## Tasks & Acceptance

**Execution:**
- [x] `features/shell/drafts.ts` (+tests) -- storage, debounce, hash, denylist, purge.
- [x] `features/shell/section-registry.tsx`, `use-section-form.ts` (+tests) -- wiring, delete on save/discard, flush.
- [x] `features/shell/draft-banner.tsx`, `draft-compare.tsx`, `lib/shared/messages/drafts.ts` (+tests, axe) -- restore and conflict UI.
- [x] `e2e/drafts.spec.ts` + fixture extensions -- UJ-5 runs.

**Acceptance Criteria:**
- Given a dirty fixture Section and an expired session, when the user relaunches as the same user, then the restore banner appears and Restore brings the edits back.
- Given `pnpm lint && pnpm typecheck && pnpm vitest run --coverage && pnpm test:e2e && pnpm build && bash scripts/check-forbidden.sh`, then all pass.

## Verification

**Commands:**
- `corepack pnpm lint && corepack pnpm typecheck` -- expected: clean
- `corepack pnpm vitest run --coverage` -- expected: green
- `corepack pnpm test:e2e && corepack pnpm build && bash scripts/check-forbidden.sh` -- expected: green

## Implementation Notes

- **`features/shell/drafts.ts`:** `createDraftStore({ storage?, now? })` / `drafts` (read ignores expired or malformed values; `write`, `remove`, `purgeUser(userId)`, `purgeStale()`; every storage access wrapped, so missing, throwing or full storage does nothing), `draftKey`, `stableStringify`, `hashDraftBase` (`crypto.subtle` SHA-256 hex), `allowedDraftFields(id, fields, savesAll)` (denylist plus the guard-only rule: throws in development, drops in production), `defaultDraftDiff` (the fallback compare when a Section has no `describeDraftDiff`), and `createDraftController({ sections, store?, hash?, debounceMs? })`. Per Section, the controller caches `{ json, values, hash }` of `getDraftBase()` and re-hashes only when that JSON changes, so `flush()` never hashes. If the hash is still pending, the flush skips that Section and a debounced write waits for the hash. The 500 ms timer restarts only when the draft values' JSON changes. A dirty→clean transition deletes the key. Offers are computed once `myself.id` is known and `dataStatus === "loaded"`, and the offer object stays the same while its rows are equal.
- **Decision (not in the spec):** a user change in a Section before choosing Restore/Discard (or Keep mine/Use current) supersedes the offer. The banner goes away and the new edits become the draft (last writer wins, as with multi-tab). We chose this over freezing the old draft because freezing would lose the newer edits on the next expiry.
- **Registry (`section-registry.tsx`, `nav-types.ts`):** `SectionRegistration` gains `userChanged?` (defaults to `isDirty`) and `dataStatus?: "loading" | "loaded" | "error"` (defaults to `loaded`). `RegisteredSection.draftFields` holds the allowed fields, and `register()` runs the denylist check. A new `observe(listener)` channel emits `registered | updated | unregistered | saved | discarded`, where `updated` fires on every registration update, not only dirty changes. `report(event)` lets `useSectionForm` report its own Save and Cancel. The registry's `save()` emits `saved` only on `{ ok: true }`, and `discard()` emits `discarded`, which covers Save all, Discard all and both leave-guard buttons.
- **`useSectionForm`:** new `dataStatus` option. `userChanged` is set by RHF `subscribe` events of type `change` (registered inputs and `Controller`s) and by `applyDraft`. A preset applied with `form.setValue` never counts. It resets on entering edit, returning to read, and after a save. Own Save success reports `saved`, and Cancel reports `discarded`.
- **UI:** `SectionContainer sectionId` renders `SectionDraftNotice` (`draft-banner.tsx`) at the top of the container:
  - Restore: info `InlineBanner` with link buttons "Restore" and "Discard".
  - Conflict: info banner, then `DraftCompare` (`draft-compare.tsx`), then "Use current" (secondary) and "Keep mine" (primary), right-aligned.
  - After any choice, focus moves to the Section `h2`.
  - The compare is named "{Section} {conflict sentence}" (heading id + banner id), so it differs from the Section's own table. On desktop it is a table: corner `td`, column headers `th scope="col"` in column-header type, row keys `th scope="row"` in kv-key style. Below 768 px it uses one `role="group"` per field with a `dl` ("Your version" first). The layout is picked with `useMediaQuery`.
- **Provider (`draft-provider.tsx`, a file the Code Map didn't list):** `DraftsProvider({ userId })` runs `purgeStale()` on mount, subscribes the controller to `registry.observe`, registers the flush on `onBeforeSessionExpired` and `pagehide`, and calls `purgeUser` from `onBeforeExit` (portal exit only). `useSectionDraft(id)` returns `none | restore{restore,discard} | conflict{rows,keepMine,useCurrent}`, or `none` outside a provider. `PageFrame` wraps the page in `PageDrafts` (`myself?.id`).
- **Public API:** the shell exports `DRAFT_*` constants, `defaultDraftDiff`, the provider, hook and components, and `SectionDataStatus`/`SectionEvent`. The store (`drafts`) is **not** exported, so only drafts.ts touches the keys.
- **Copy:** `lib/shared/messages/drafts.ts` (`DRAFT_MESSAGES`: `restoreBody`, `conflictBody`, `yourVersion`, `current`, `keepMine`, `useCurrent`), all verbatim from Voice and Tone. Because the catalog must have unique strings, "Discard" moved from `LEAVE_GUARD_MESSAGES` to `COMMON_MESSAGES.discard` (leave guard updated), and "Restore" went to `COMMON_MESSAGES.restore` (Team A's removed draft row reuses it).
- **Fixture:** `FixtureSection` takes `dataStatus` and `describeDraftDiff` and renders the draft slot. `FIXTURE_DRAFT_FIELDS` and `fixtureDraftDiff` are exported. `SectionFixturePage` now:
  - takes its number from `myself.phoneNumber` (default `4155512125`), so a mocked `myself` changes the server data;
  - takes `dataStatus` from `useMyself`;
  - adds an "End the session on the next save" switch: a real `callApi` PUT `v2/user/edit`, which e2e answers with `TOKEN_EXPIRED`, then refresh `SESSION_EXPIRED`, mapped through `mapApiError`.
- **Tests:**
  - `drafts.test.ts` (51) covers key/value shape, hash vector and key order, denylist dev/prod, every storage-failure mode, purgeUser and purgeStale, 499 vs 500 ms, clean delete, presets, the null user, flush/hash-pending, guard-only, save/discard/drop, restore vs conflict, read error, other user, supersede, and cross-page invalidation.
  - `drafts-ui.test.tsx` (20) covers banners and compare with axe at 1280 and 360, Restore/Discard/Keep mine (Save gets the current baseline)/Use current, read error, other user, purge on mount, deletes via own Save/Cancel/Save all/leave-guard Save and Discard, Insurance-like participant, throwing storage, write-before-dialog order plus the dialog's Return keeping the draft, portal purge vs hand-off, and no user.
  - Registry and `useSectionForm` tests cover the new contract.
  - `e2e/drafts.spec.ts` (5 × 2 projects) runs UJ-5 same-user restore + save, the conflict with Keep mine and with Use current, a different user, and the app-bar Return purge, with axe in light and dark at desktop and 360 px.
  - The new files have 100 % statement/branch/function coverage. One `v8 ignore` covers the `useSyncExternalStore` server snapshot.
- **Verification (2026-10-14):** `pnpm lint`, `pnpm typecheck`, `pnpm vitest run --coverage` (110 files, 2245 tests, thresholds met), `pnpm test:e2e` (164 passed), `pnpm build` and `bash scripts/check-forbidden.sh` are all green.
- **Not done here (planning sync):** `epics.md` Story 1.15, the `epic-*-context.md` files and `sprint-status.yaml` were left to the planning-sync agent.

- **Review fixes (round 1, 2026-10-14):** This round supersedes the key format, the `setUserId` API and the `userChanged` rule described above.
  - The key is now `pp:draft:v1:<environment>:<userId>:<sectionId>`. `DraftOwner = { environment, userId }`. `PageFrame` gets the environment from the portal URL (`environmentOfPortalUrl`, new in `lib/shared/environments.ts`; an unknown URL means no drafts). `purgeUser` uses the owner prefix, and `purgeStale` also deletes keys whose environment is unknown. `read()` deletes an expired or unparsable value.
  - The controller takes `{ registry }`, which now has an O(1) `get(id)` and a cached view per entry. `setOwner` replaces `setUserId`. The registry still emits `updated` on every render, because draft values change without any registration field changing; the cached views and `get()` keep each event cheap.
  - Lifecycle:
    - `dispose()` can be undone with `revive()`, and the provider's cleanup flushes before it disposes. This fixes StrictMode and covers a whole-page unmount, where the provider's cleanup runs before the Sections'.
    - `flush()` and a debounced write wait for a pending hash instead of dropping the edit.
    - `applyDraft` returns a boolean. The offer is cleared only after a successful apply, and a Section without `applyDraft` keeps no draft.
    - A conflict whose compare has no rows deletes the draft.
    - `discarded` is reported only for a dirty Section (Cancel and the registry's `discard`).
    - `dataStatus` defaults to `loading` when the Section has draft fields.
    - `purgeUser` clears every timer and blocks later writes.
    - `saved` and `discarded` suppress writes until the Section reports clean, and they don't create state for Sections the controller doesn't track.
    - `unregistered` is emitted while the Section is still readable and writes a dirty user-changed Section at once.
    - The provider also flushes when `visibilitychange` reports `hidden`.
  - `useSectionForm`'s `userChanged` now compares the current values with the values just before the user's first change. Those values include presets and are captured by the RHF `subscribe` callback. So reverting the user's edits clears it even while presets keep the Section dirty, which deletes the key, and it resets once the Section is clean.
  - Denylist:
    - Field names are matched in any case.
    - A field whose value holds a denylisted key at any depth is dropped at write.
    - `update()` re-validates the contract, but only when it changed.
    - Draft fields without `describeDraftDiff` throw in development.
    - Production drops send `draft_fields_dropped { sectionId, count, reason }` (new telemetry event, no names or values).
    - `defaultDraftDiff` is a production-only fallback with humanized labels and readable values.
  - Banner and fixture:
    - The banner sentences stay `role="status"`. Every choice button has `aria-describedby` set to the Section heading, and the doc comments for the compare's `labelledBy` and for `SectionEvent` are fixed.
    - With the session switch set, the fixture page reports a non-session PUT failure as a failure and resets the switch after use.
  - Verified: lint and typecheck are clean. The Vitest files covering the edited files pass (14 files, 558 tests), and the draft files and `environments.ts` have 100 % coverage (one `v8 ignore` for an unreachable owner branch). `e2e/drafts.spec.ts` passes 10 of 10, with its keys updated to the `demo` segment.

## Spec Change Log

- 2026-10-14: AD-12 draft key amended to `pp:draft:v1:<environment>:<userId>:<sectionId>` (a review finding: the same user id in Demo and Prod could restore across environments). Synced in `epics.md`, `EXPERIENCE.md`, epic contexts and the foundation plan.

## Review Triage Log

Three parallel reviewers (Blind Hunter, Edge Case Hunter, Verification Gap) on the diff vs `b3f0801`.

- **Patched (round 1):** StrictMode dispose/revive and flush-before-dispose on whole-page unmount; flush and debounced write wait for a pending hash; `applyDraft` returns a boolean and the offer clears only after success; empty-row conflict deletes the draft; environment segment in the key; `purgeStale` removes unknown environments and `read` removes expired/malformed values; case-insensitive and nested denylist, `update()` re-validation, `draft_fields_dropped` telemetry, `describeDraftDiff` required in development; `userChanged` compares with the pre-edit snapshot so a revert deletes the key; `discarded` only for dirty Sections; `saved`/`discarded` suppress writes until clean; `purgeUser` clears timers and blocks writes; flush on `visibilitychange: hidden`; banner `aria-describedby` on choice buttons; fixture session switch resets after use; O(1) registry `get`.
- **Deferred:** none new.
- **Rejected:** emit `updated` only on registration-field changes (draft values change without them; cached views keep events cheap).
- **Re-verified 2026-10-14:** lint, typecheck, `vitest run --coverage` (110 files, 2266 tests), `test:e2e` (164 passed), build and `check-forbidden.sh` all green.
