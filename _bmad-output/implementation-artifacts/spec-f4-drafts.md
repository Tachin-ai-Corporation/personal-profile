---
title: 'F4 Drafts: keep unsaved edits across an expired session (Story 1.15)'
type: 'feature'
created: '2026-10-14'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
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
- [ ] `features/shell/drafts.ts` (+tests) -- storage, debounce, hash, denylist, purge.
- [ ] `features/shell/section-registry.tsx`, `use-section-form.ts` (+tests) -- wiring, delete on save/discard, flush.
- [ ] `features/shell/draft-banner.tsx`, `draft-compare.tsx`, `lib/shared/messages/drafts.ts` (+tests, axe) -- restore and conflict UI.
- [ ] `e2e/drafts.spec.ts` + fixture extensions -- UJ-5 runs.

**Acceptance Criteria:**
- Given a dirty fixture Section and an expired session, when the user relaunches as the same user, then the restore banner appears and Restore brings the edits back.
- Given `pnpm lint && pnpm typecheck && pnpm vitest run --coverage && pnpm test:e2e && pnpm build && bash scripts/check-forbidden.sh`, then all pass.

## Verification

**Commands:**
- `corepack pnpm lint && corepack pnpm typecheck` -- expected: clean
- `corepack pnpm vitest run --coverage` -- expected: green
- `corepack pnpm test:e2e && corepack pnpm build && bash scripts/check-forbidden.sh` -- expected: green

## Implementation Notes

## Spec Change Log

## Review Triage Log
