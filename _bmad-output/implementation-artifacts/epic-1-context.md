# Epic 1 Context: Launch, session and profile shell

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->
<!-- Recompiled 2026-10-15 on feat/NG-9027-epic1-continue from origin/main 78647d6 (PRs #4–#6: foundation 7.0a–7.0c-1, F1–F7, R5-1/R5-2, Story 7.1). Sources: epics.md (D1–D17, "Foundation F6 and path corrections", per-story Foundation lines), ARCHITECTURE-SPINE.md, docs/FOUNDATION.md, CLAUDE.md, sprint-status.yaml, deferred-work.md, sprint-change-proposal-2026-10-14.md. -->

**Read `docs/FOUNDATION.md` before writing any code.** It is the catalog of everything already built (7.0a–7.0c-1, F1–F7, R5). This file doesn't repeat it. It names the pieces Epic 1's remaining stories use, the rules a Team A story PR must follow, and what is still open. Where this file and FOUNDATION disagree, FOUNDATION and the code win.

## Goal

Epic 1 delivers the foundation and shell of Personal Profile (Jira NG-9027, NG-9020, NG-9021). The portal opens the app in its own tab at `/auth?lpl=…`. The user arrives signed in on the Contacts tab with no login form, sees their name, picture and primary contacts, and moves between tabs and to Account. Unsaved work is protected and the session expires safely. Epics 2–5 and 7 depend only on this epic.

**State on 2026-10-15:** the shared foundation built the security and session spine and the reusable shell. Stories 1.1–1.8, 1.11 and 1.15 and the reworks 1-3r, 1-7r and 1-8r are done. Story 1.12 and Story 1.13 are covered except for test cases that live in foundation-owned files. Only the Team A work in Stories 1.9, 1.10, 1.14 and 1.16 is left.

## Stories and status

| Story | Status | What is left (Team A) |
|---|---|---|
| 1.1 Foundation | done (7.0a) | nothing |
| 1.2 Launch | done (7.0a, 7.0b-2) | nothing |
| 1.3 Proxy | done (7.0a, F1, F2, F7-2) | nothing; each story adds its own allowlist entries |
| 1.4 `callApi` + SWR | done (7.0a, F1, R5-2) | nothing |
| 1.5 Token refresh | done (7.0a, R5-1: D14, D16) | nothing |
| 1.6 Idle logoff | done (7.0c-1) | nothing |
| 1.7 Logout + session dialog | done (7.0a, 7.0b-2, F4) | nothing |
| 1.8 Page shell | done (7.0b-1, 7.0b-2, F3-1, F3-3, F6-1) | nothing |
| 1-1r / 1-3r / 1-7r / 1-8r reworks | done (R1 merged in PR #4; R2–R4 superseded by 7.0a / 7.0b) | nothing; the WIP is archived as tag `archive/NG-9027-r2-transport` (branch deleted 2026-10-15) |
| **1.9 Header picture** | backlog | the `profile-picture-id` loader, the avatar on `FallbackImage`, the mutate-refresh component test, axe |
| **1.10 Change picture** | backlog | the dialog, `components/ui/image-reencode.ts`, the avatar button (only on `/`), the client upload → delete flow, the EXIF decision |
| 1.11 Section framework | done (F3-2, F6-1, F6-2) | per-Section wiring only, owned by 3.2, 3.5, 3.7, 4.4 |
| **1.12 Errors / toasts** | backlog (code complete) | one Playwright case: a mocked 400 with a mapped `errorCode` on the fixture Section (foundation-owned files, see "Open decisions") |
| **1.13 Leave guard** | backlog (code complete) | Playwright cases for the scoped close and for the two guard-only fixtures (foundation-owned files, see "Open decisions"); the Sheet wiring belongs to 5.2 |
| **1.14 Save all** | backlog | replace the `SaveAllBar` body (bar, pill, Discard all, `--toast-bottom-offset`), focus after the run, the Playwright spec; **plus the D-A save safeguard** (approved 2026-10-14), built in a foundation PR merged first |
| 1.15 Drafts | done (F4) | per-Section wiring only |
| **1.16 Deployments / ops** | backlog | Vercel project, the `promote` workflow, `docs/ops/*` runbooks, the rollback and kill-switch rehearsal, PM review of the DRAFT disabled copy (owner and ownership decisions, see "Open decisions") |

**Suggested order:** 1.9 → 1.10 (it builds on 1.9's avatar) → 1.14 → close 1.12/1.13 once decided → 1.16 (blocked on the owner).

## Rules for a Team A story PR (FOUNDATION §1, T1–T8, R1–R11)

- **Edit only Team A paths** (T1):
  - `features/{personal,contacts,addresses,insurance,header,save-all}/**`
  - `app/page.tsx`, `app/page.test.tsx`
  - `test/page-handlers/profile.ts`
  - `e2e/fixtures/{defaults-profile,header,personal,contacts,addresses,insurance}.ts`, `e2e/profile-*`
  - Team A area files inside foundation folders:
    - `lib/api/{profile-picture,personal,contacts,addresses,places,insurance}.ts` with their own tests
    - `lib/server/proxy/allowlist/<area>.ts` and `<area>.test.ts` for `personal`, `contacts`, `addresses` and `insurance`
    - `lib/api/errors/<area>.ts`
    - `lib/shared/messages/{person,header,contacts,addresses,insurance,places}.ts`
  - A brand-new `components/ui/*` file is allowed.
- **Never edit in a story PR** (T2): `features/shell/**`, existing `components/ui/*`, existing `lib/shared` helpers, foundation message files, `test/**` (except `test/page-handlers/profile.ts`), `e2e/fixtures/{core,index}.ts`, `e2e/shell.spec.ts` and the shared-control specs, `app/test-fixtures/**`, `features/shell/__fixtures__/**`, `eslint.config.mjs`, `scripts/**`, `.github/**`, `docs/FOUNDATION.md`, `CLAUDE.md`, `AGENTS.md`, `lib/api/index.ts`, `allowlist/index.ts`, the `sprint-status.yaml` header.
  - A missing shared piece ships first as its own small foundation PR, reviewed by both teams.
- **Add, never change** shared unions and helpers (T3). Compare with your own member instead of switching exhaustively over a shared union (T4).
- **Copy:** grep the whole catalog first (T5, `messages.test.ts` rejects duplicates). Shared words are in `COMMON_MESSAGES`, shared labels in `FIELD_MESSAGES`. New strings are marked `// DRAFT COPY` unless they are verbatim from Voice and Tone.
- **Prefix generic export names with the area** (T6; `planned-modules.test.ts`).
- **Before merging** (T7): rebase, regenerate `pnpm-lock.yaml`, then run the full check: `pnpm lint && pnpm typecheck && pnpm vitest run --coverage && pnpm test:e2e && pnpm build && bash scripts/check-forbidden.sh`.
- **Tracking:** in `sprint-status.yaml` change only your own story's line. Append deferred items at the end of the Team A section of `deferred-work.md`.
- **Tests** (R11):
  - A Section test renders with `renderInPage(ui, { page: "profile" })`.
  - A spec that visits `/` imports the fail-fast `test` from `./fixtures`, uses `mockProfileDefaults`, then overrides.
  - A story that adds a read on `/` adds its default to `profileReadHandlers` and `defaults-profile.ts` in the same change.
  - `ANN` and `myselfWire()` are frozen; override per test.

## Pieces the remaining stories use

Everything below is built. Use it as is (FOUNDATION §3–§5 has the full API).

- **1.9:**
  - Components and modules:
    - `features/header` (`ProfileHeader`, `displayName`, `use-primary-contacts.ts`)
    - `lib/api/profile-picture.ts` (`profilePictureIdPath`, `profilePicturePreviewPath(fileId)` → `/api/1h/v2/user/profile-picture/preview?v={id}` or `null`)
    - `keys.profilePictureId()`
    - `registerFetcher("profile-picture-id", …)`, which goes at the bottom of `profile-picture.ts`
  - Server pieces already in place:
    - the named op `GET /api/pp/profile-picture-id` → `{ fileId: number | null }`
    - the `preview` `asImage` entry in `allowlist/files.ts` (F7-2 review; **do not add it again**)
  - Avatar and formatting helpers:
    - `FallbackImage` (initials as `fallback`, which must carry the same accessible name)
    - `initials`, `formatPhoneDisplay`
  - Tests:
    - `mockProfilePictureId` / `mockProfilePicture` / `mockProfilePicturePreview` (core)
    - `mockHeaderPicture` and `expectHeaderTabOrder` in `e2e/fixtures/header.ts` (Team A)
- **1.10:**
  - Upload path:
    - the picture upload entry in `allowlist/core.ts` (4 MB, PNG/JPEG/BMP, `isPublic=true` forced, **no client `?fileName=`**: the name comes from the multipart part)
    - `profilePictureUploadPath()`
  - Deleting the old picture: `fileDeletePath(oldId)`, which calls the ownership-checked named op `DELETE /api/pp/file/{fileId}`. `DELETE v2/file/**` is denied in the proxy, so **no allowlist entry is added**.
  - Upload errors: `isUploadRejected(mapped)` + `COMMON_MESSAGES.uploadRejected` for 413/415.
  - Dialog and feedback:
    - `Dialog` (`size` default 440 px, `dismissible={false}` while busy, `initialFocus`, `DialogBody`), busy `Button busyLabel`
    - `FieldError` / `InlineBanner`
    - `toastSuccess`, `toastError({ onRetry })`
  - Messages: copy goes in `lib/shared/messages/header.ts`.
  - The avatar is a button **only on `/`**. The header decides with `useCurrentPage()` (FOUNDATION R11 decision 2026-10-14), so Team B files never change. This replaces the story's "`pictureEditable` prop" suggestion.
  - The re-encode helper is a brand-new `components/ui/image-reencode.ts` (FOUNDATION §3.5, browser-only). 2.4 and 5.3 reuse it.
- **1.14:**
  - Save-all runner and summary:
    - `runSaveAll(registry, { order: SAVE_ORDER })`
    - `saveAllSummary`, which returns no "failed" copy for cancels
  - Counts and toasts:
    - `useDirtyCount()`, `useSectionRegistry()`
    - `toastPartial`, `--toast-bottom-offset`
  - Copy: `SECTION_MESSAGES` (`allSaved`, `partialSaved`, `savedCount`, `invalidOne` / `invalidMany`).
  - Layout: `useMediaQuery(DESKTOP_QUERY)`.
  - Wiring is already done: `SAVE_ORDER` and the `features/save-all` `SaveAllBar` stub are passed to `PageFrame` in `app/page.tsx`, so 1.14 **edits no `app/page.tsx` or shell file**.
  - Already tested: the `/account` no-Save-all case, in `app/account.test.tsx` and `features/shell/page-frame.test.tsx`.
- **1.12 / 1.13:**
  - Fixture pages: `app/test-fixtures/{section,leave-guard}`, built on `features/shell/__fixtures__/{fixture-section,fixture-participant}.tsx`.
  - Existing specs: `e2e/section.spec.ts`, `e2e/shell.spec.ts`, `features/shell/leave-guard.test.tsx` (scoped `requestLeave({ scope })` unit cases, F7-2).
- **1.16:**
  - Already in place:
    - `lib/shared/environments.ts`
    - kill switches (`lib/server/kill-switch.ts`, `app/disabled/route.ts`, `DISABLED_MESSAGES` DRAFT)
    - `.env.example`
    - `.github/workflows/ci.yml`
    - `e2e/kill-switch.spec.ts`

## Requirements and constraints (still binding)

- **Launch (D1, D2, D9):**
  - A valid payload lands on `/`. A relaunch lands only on `/` (`consumeLaunchIntent`).
  - Failures end in the `/auth` error alert.
  - `lpl` is stripped before the first request.
  - Only tenant `1` may launch.
  - A page without a session redirects to `/auth`.
- **Session:**
  - One sealed cookie, `__Host-pp_s` (`SameSite=Lax`, never framed: D10).
  - Limits: 15 min idle with a warning at 14 min, and 8 h absolute.
  - Only user-initiated requests count as activity.
  - Refresh is client-coordinated:
    - The proxy answers `401 TOKEN_EXPIRED`, and `callApi` refreshes once and replays.
    - A replayed `TOKEN_EXPIRED` ends the session (D14).
    - Only an IdP 401 or a 400 `invalid_grant` ends the session; other IdP errors answer 503 and keep the cookie (D16).
  - `myself` auto-retries on 5xx and network errors (D17).
- **D5 accepted risks:**
  - There is no CSRF check and no session binding, so `SameSite=Lax` plus the 415 JSON check are the only cross-site write protection.
  - Logout also accepts GET.
  - Another account launching in another tab isn't detected. Its write consequence is **not** accepted: the D-A save safeguard (approved 2026-10-14, under Story 1.14) stops those saves.
- **Section editing:**
  - Every Section uses `useSectionForm` with the Section chrome and `StateFrame`.
  - Nothing auto-saves.
  - Save all is not atomic. It never says "All saved" unless nothing failed, and a failure in one Section never blocks the others.
- **Leave protection:** a tab switch, a page switch, Return to 1health, a hand-off or closing the page with unsaved edits asks first (`navigate()` + `LeaveGuard`).
- **Accessibility:**
  - WCAG 2.1 AA, 44 px targets, the `focus-ring` utility, reduced motion.
  - 360 px with no horizontal scroll.
  - axe in light and dark, at desktop and 360 px.
- **No PHI leaks:**
  - Server logs never contain bodies.
  - Telemetry is a no-op sink.
  - Every page and route is no-store.
  - Drafts never hold SSN, Signature, codes, NPI, username or password.
- **Tokens:** semantic tokens only (`check-tokens.sh`), and `text-primary-text` for primary-coloured text.

## UX for the remaining stories

- **Header (1.9):**
  - A 40 px avatar and `{first} {last}` as the single `h1`.
  - From 768 px, the primary phone and email; a missing or failed contact renders nothing.
  - Initials when there is no picture or the image fails to load; a user icon when there is no name.
- **Change picture (1.10):**
  - The avatar button has a 44 px hit area, the accessible name "Change profile picture" and a camera badge, on `/` only.
  - It opens the native picker. JPG, PNG or BMP files up to 6 MB are accepted.
  - The dialog (440 px) shows a 96 px preview, "Choose another file", Cancel and Save.
  - Errors for an oversized or unsupported file disable Save with `aria-disabled` and a reason.
  - Save:
    1. Re-encodes the file to JPEG ≤ 4 MB.
    2. Uploads it, then deletes the old file best-effort.
    3. Mutates `keys.profilePictureId()`.
    4. Shows the toast "Profile picture saved.".
    5. Returns focus to the avatar.
  - A 413/415 shows the `uploadRejected` line. Network or 5xx shows Retry with the same blob. `SESSION_EXPIRED` closes the dialog.
- **Save all (1.14):**
  - From 768 px, a sticky bottom bar with "{N} unsaved sections", Discard all and "Save all (N)".
  - Below 768 px, a floating pill, hidden while the on-screen keyboard is open.
  - Neither appears on `/account`.
  - The pill raises `--toast-bottom-offset`.
  - After a run, focus moves to the first failed Section's error, or to the first saved `h2`.

## Decisions and conflicts (owner: Daniel Garcia / integrator)

1. **D-A save safeguard: APPROVED** by the epic owner on 2026-10-14 (recorded 2026-10-15). It replaces the accepted D5 point 3 risk.
   - **Rule:** before any save, compare the page's loaded `myself.id` with a fresh `GET /myself`. On a mismatch, send nothing, end the page like an expired session, and keep the edits on the device.
   - **Scope:** every save path: a Section's own Save, Save all and the leave-guard Save.
   - **Ownership:** assigned to **Story 1.14** and delivered as a **foundation PR merged before 1.14**, because the save path is `features/shell` / `lib/api` and T2 bars a Team A story PR from editing it.
   - **D5 limits:** there is no session binding. `X-PP-Session`, `sessionBinding` and `SESSION_CHANGED` / `session-changed` stay banned by `check-forbidden.sh`.
   - **Integrator:** record the approval next to D5 in `epics.md` and FOUNDATION §6.
2. **The remaining 1.12 and 1.13 tests live in foundation-owned files** (`e2e/section.spec.ts`, `e2e/shell.spec.ts`, `app/test-fixtures/**`, `features/shell/__fixtures__/**`; T1, T2, R11). Options:
   - (a) a small foundation PR adds the mapped-400 case and the scoped-close and two-guard-only cases, and then 1.12 and 1.13 close;
   - (b) the owner accepts the existing Vitest coverage and marks both done.
3. **1.16 touches foundation-owned paths:**
   - the `promote` workflow lives in `.github/**`;
   - `docs/ops/**` is unowned, which makes it foundation by T1;
   - the Vercel project, the registrations and preview secrets need the owner.
   
   1.16 should be split: an integrator or foundation PR for the workflow and docs, plus owner tasks.
4. **1.10 EXIF:** strip the metadata on the server (for example with sharp, as a foundation change to `lib/server/proxy/upload.ts`), or record public pictures keeping EXIF as an accepted AD-13 risk.
5. **Stale planning text that the code or FOUNDATION supersedes** (to be fixed by the integrator; `epics.md` is shared planning):
   - The `epics.md` "Not built" list (Foundation F6 section):
     - It still has 1.10 adding a `DELETE v2/file/{id}` entry; F7-2 replaced that with the named op, and the proxy denies it.
     - It says 1.13 builds scoped `requestLeave`; F7-2 built it.
     - It places the re-encode helper at `features/shell/image-reencode.ts`. FOUNDATION §3.5 puts it at `components/ui/image-reencode.ts`, and `features/shell` is foundation, so a story can't add it there.
   - The Story 1.9 and 1.10 AC text: the `preview` entry is already added; `?fileName=`, `hooks/use-toast` and `pictureEditable` are superseded as noted above.

## Cross-story dependencies

- Epics 2–5 reuse:
  - `image-reencode` (2.4, 5.3)
  - `fileDeletePath` (2.4, 5.3)
  - the 1.14 bar, through `SAVE_ORDER` and the registry
- Epic 7 already reuses the shell.
- 1.9's `mutate` contract: Contacts saves (Epic 3) and Account saves (7.5, 7.6) refresh the header through `mutateMyself()` / `mutateContactPoints(...)`.
- External items for the owner:
  - the External Application registration (demo, then prod; launch URL `<origin>/auth`)
  - the `openApp` deep-link name (D4)
  - whether previews may hold the `_DEMO` secrets
  - `public-client` id overrides
  - BAAs (Vercel; Google before Places)
  - dates: feature freeze 2026-10-22, demo QA of UJ-1 to UJ-5 by 2026-10-24, go-live 2026-10-29
