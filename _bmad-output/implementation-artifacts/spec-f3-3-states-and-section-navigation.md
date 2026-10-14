---
title: 'F3-3 State frames and section navigation'
type: 'feature'
created: '2026-10-14'
status: 'review'
baseline_commit: '5b4ed143dde8f204c66c2aef623311be2e3b8798'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/shared-foundation-plan.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-personal-profile-2026-10-13/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-personal-profile-2026-10-13/EXPERIENCE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/1-8b-profile-page-shell-app-bar-tabs-and-section-navigation.md'
  - '/Users/idanielgarcia/Documents/DEV/oneHealth/dev-std-ai-agents-and-skills/stacks/react/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Both pages need one way to show a Section's or tab's loading, error and no-access states (today only a page-level `ReadStateFor` exists), the 403 owner table that decides which part shows "no access" lives in a feature folder other features cannot import, the signature thumbnail is needed by Team A (2.1, 2.4) and Team B (9.3), and the Profile page has no Section menu, Jump to, scroll-spy or deep links — main built these (Story 1.8B, commit `b005536`) on code that was not kept in the rebase.

**Approach:** Build the F3-3 slice of `shared-foundation-plan.md`: a unified `StateFrame` with skeleton variants and the correct per-Section load-error nouns, the AD-23 forbidden-scope table in `lib/api`, `SignatureThumb`, and the port of main's Story 1.8B section navigation and Contacts/Insurance panels adapted to our `PageTabs`, `navigate()` and F3-1 `select.tsx` (main code via `git show b005536:<path>`; main spec in `context:`).

## Boundaries & Constraints

**Always:**
- **`features/shell/state-frame.tsx`**: `StateFrame({ state: "loading" | "ready" | { error: MappedError }, skeleton, loadError: { kind: "section"; sectionId } | { kind: "page" }, level: "section" | "tab", onRetry, anchors?, onReady?, children })`; skeleton variants `table` (36 px header + 3×44 px rows), `kv` (4 rows), `tiles` (5×112 px), `bars` (2, input height), `cards` (12 in the org grid classes) with `aria-busy` and `aria-hidden` bars, static under reduced motion; errors: `session` → nothing, `forbidden` → `NoAccess` (tab = centred bordered panel, section = single line), otherwise InlineBanner + Retry that revalidates only that frame's keys; copy: `/` "Couldn't load {noun}" with plural nouns from `SECTION_LOAD_NOUNS` (phones, emails, social links, addresses, personal information, insurance), `/account` "Something went wrong while loading profile information". `ReadStateFor` and `LoadError` become thin wrappers/aliases so existing callers keep working.
- **`lib/api/errors/forbidden-scope.ts`**: the AD-23 owner table (`contact-point/list` → account pickers; `mfa/*` and `/api/pp/mfa/validate` → authenticator section; `user/npi`, `public/npi/list`, `user/register/npi` → provider tab; `user/organization/portal` → organizations tab; `/api/pp/practice-support` → practice popover), table-tested; usable by every feature through `@/lib/api`.
- **`features/shell/signature-thumb.tsx`**: `SignatureThumb({ fileId, fallback, alt })` 112×32, `object-contain`, src = proxy file download path, `onError` → fallback text (callers pass "Not provided" or "No signature available"), thumb skeleton, `key={fileId}`.
- **Section navigation port** (main 1.8B): `features/shell/anchors.ts` (`PROFILE_SECTIONS` 01–05 with labels, `SIGNATURE_ANCHOR`, `ACCOUNT_ANCHORS` `account`/`authenticator`, column headers), `features/shell/section-nav.tsx` (desktop sticky 200 px menu with number/label/count, `aria-current="location"`; mobile "Jump to" Select with focus to the `h2` on close; smooth/instant scroll per reduced motion; scroll-spy IntersectionObserver `rootMargin "0px 0px -60% 0px"` pinned to the activated item until the user scrolls; modifier clicks pass through), `useHashAnchors(ids, { focusHeading })` (deep links on mount and `hashchange`, `#signature` → Signature row, unknown hashes ignored, re-scroll once when the target frame becomes ready), Contacts and Insurance panels wired into `ProfileTabs` (Medical unchanged). Section jumps update the hash with `history.replaceState` keeping other params and **never** call `requestLeave()`/`navigate()`. Counts come from an optional registry/store value ("counts reflect saved entries"). Copy: "Jump to" and section labels locked, "Sections" and column headers DRAFT.
- Tests: StateFrame (each variant, both copies, nouns, NoAccess levels, Retry isolation across frames, axe), forbidden-scope table, SignatureThumb (load, error fallback, skeleton), section-nav port (main's 22 cases adapted), Playwright `/?tab=contacts#signature` on load, 360 px no overflow, 44 px targets, axe light/dark.

**Never:**
- No edit-model/registry changes beyond an optional count (F3-2), no drafts (F4), no feature Sections' real data/forms (Epics 2–5), no Popover/Combobox (F5).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Section load error | phone frame fails with 502 | "Couldn't load phones" + Retry; other frames unaffected | Retry revalidates only phone keys |
| Tab forbidden | provider tab upstream 403 | centred "You don't have access to this in your current account" | — |
| Session | any frame `SESSION_EXPIRED` | frame renders nothing (session dialog handles it) | — |
| Deep link | `/?tab=contacts#signature` | scrolls to Signature row, re-scrolls once when ready | unknown hash ignored |
| Jump | click "03 Email" with a dirty Section | scrolls and focuses `#email-heading`, no leave dialog | — |
| Mobile | <768 px | "Jump to" Select instead of menu, no horizontal scroll | — |

</frozen-after-approval>

## Code Map

- `features/shell/{read-state,page-tabs,page-frame,index}.tsx`, `nav-types.ts` -- wrappers, panels in `ProfileTabs`, exports.
- `components/ui/{select,inline-banner,skeleton}.tsx` (F3-1/existing) -- reuse.
- `lib/api/errors/*` (`MappedError`), `lib/shared/messages/{section,shell,state}.ts` -- nouns and copy.
- Main reference: `git show b005536:features/shell/{section-nav,section-frame,sections,contacts-panel,insurance-panel}.tsx` and their tests.

## Tasks & Acceptance

**Execution:**
- [x] `features/shell/state-frame.tsx`, `read-state.tsx`, `lib/shared/messages/*` (+tests) -- state frame and copy.
- [x] `lib/api/errors/forbidden-scope.ts`, `lib/api/index.ts` (+tests) -- owner table.
- [x] `features/shell/signature-thumb.tsx` (+tests) -- thumbnail.
- [x] `features/shell/{anchors,section-nav,use-hash-anchors,contacts-panel,insurance-panel}.tsx`, `page-tabs.tsx` (+tests, e2e) -- navigation port.

**Acceptance Criteria:**
- Given `/?tab=contacts`, when a keyboard user uses the Section menu or Jump to, then focus lands on the Section heading and no leave dialog opens.
- Given `pnpm lint && pnpm typecheck && pnpm vitest run --coverage && pnpm test:e2e && pnpm build && bash scripts/check-forbidden.sh`, then all pass.

## Verification

**Commands:**
- `corepack pnpm lint && corepack pnpm typecheck` -- expected: clean
- `corepack pnpm vitest run --coverage` -- expected: green
- `corepack pnpm test:e2e && corepack pnpm build && bash scripts/check-forbidden.sh` -- expected: green

## Implementation Notes

- **`StateFrame`** (`features/shell/state-frame.tsx`) now owns `LoadError`, `NoAccess` and `ReadStateFor`; `read-state.tsx` only re-exports them, so 7.0b-1 callers are unchanged. `ReadStateFor` gains optional `loadError` (default page copy) and `level` (default `tab`); `LoadError` gains `message`; `NoAccess` gains `level` (tab panel padding is now DESIGN.md's 24/16 px). Extra props: `columns` (table header), `attempt` (re-announce), `className`. A Section-level frame is the bordered table container; a tab-level frame has none. `session` renders nothing, anchors included. The `table` variant shows the 36 px header only when `columns` is non-empty (Personal information and Insurance have none, as on main). `ORG_GRID_CLASSES` and `loadErrorMessage()` are exported for Team B.
- **Copy:** `STATE_MESSAGES.sectionLoadError` "Couldn't load {section}" (verbatim V&T template) plus six `loadNoun*` keys (DRAFT; nouns from the epics' load-error ACs), gathered as `SECTION_LOAD_NOUNS` (keyed by `LoadNounSection` = Section ids minus `account`) in `lib/shared/messages/index.ts`, because each area file may export only its one catalog group. `SHELL_MESSAGES` gains `sectionsNavLabel`, `jumpTo`, the five Section labels, `signature` (verbatim), `signatureAlt` "Your signature" and eight column headers. "Jump to" and the Section labels are locked by EXPERIENCE.md but not quoted in its V&T table, so they carry the `DRAFT COPY` marker with a "locked" note (the verbatim test allows nothing else). The catalog is flat strings, so column headers are keys, not arrays.
- **Forbidden scope** (`lib/api/errors/forbidden-scope.ts`, exported from `@/lib/api`): `forbiddenScopeFor(path)` → `{ owner, level }` or `null`, after `normalizeForbiddenPath` (strips origin, query/hash, `/api/1h/`, version; `/api/pp/x` → `pp/x`). `mfa/*` matches the platform's `v2/mfa/...` paths (checked against 1health-fe). It is not an area rule table: `errors.test.ts`'s area scan now skips it.
- **`SignatureThumb`** uses the new `lib/api/files.ts#fileDownloadPath(fileId)` (positive integer ids only, else the fallback). An image that finished before hydration is read from `img.complete`/`naturalWidth`. The `<img>` carries an eslint-disable for `no-img-element` (a session-bound proxy image must not go through the Next optimizer).
- **Section navigation:** `useSectionNavigation()` holds scroll-spy, pin, activation and Jump to state; `SectionNav` renders it; `useHashAnchors(ids, { focusHeading, subAnchors, onFollow })` returns `{ frameReady }`, which `ContactsPanel` passes to each `StateFrame` `onReady` for the one re-scroll (a wheel/touch scroll before ready cancels it). Activation replaces the hash with `pathname + search + #id`, so other params (and the e2e fixture path) are kept; it never calls `navigate()`/`requestLeave()` (unit + e2e prove no dialog with a dirty Section). Counts: `SectionCountProvider` (mounted by `ContactsPanel`) + `useReportSectionCount(id, n)`; the menu shows them `aria-hidden` (the Section header carries its own count), blank when unreported. `SectionContainer` is the `<section id aria-labelledby>` + 44 px `h2` (`tabIndex={-1}`) row.
- **Tabs:** `PageTabs` gains `panelOptions(tab)` (`bare`, `skipInTabOrder`) and every panel gets `focus-ring`; Contacts is bare and out of the Tab order, so Tab goes from the tab to the Section menu (or Jump to). Contacts and Insurance render their loading frames; Medical is unchanged.
- **Tests:** ported `test/dom-stubs.ts` helpers (`installDomStubs`, `FakeIntersectionObserver`, `reportIntersections`); no `user-event`/`jest-dom` in this repo, so the ported cases use `fireEvent` and plain assertions. A modified-click test stops jsdom's own hash navigation, whose queued `hashchange` leaked into later tests. `page-tabs.test.tsx`'s fixture label is now "Fixture phone" (the Phone region shares the name). `lib/server/named-ops/profile-picture-id.test.ts` "logs the route template only" is flaky upstream of this spec (it fails when the random request id contains "555").

## Spec Change Log

## Review Triage Log
