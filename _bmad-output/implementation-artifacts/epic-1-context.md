# Epic 1 Context: Launch, session and profile shell

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 1 delivers the foundation and shell of Personal Profile. A user opens the app from the 1health portal and arrives signed in on the Contacts tab with no login screen. They see their name, picture and primary contacts, and can move between the Contacts, Insurance and Medical tabs. The epic builds the security and session spine: sealed cookie, allowlisted server proxy, client-coordinated token refresh, idle logoff, logout and session dialogs. It also builds the reusable shell that every later epic plugs into: Section registry, edit model, error and toast mapping, leave guard, Save all and drafts, plus design tokens. It ends with the operational envelope: three pinned Vercel deployments, the CI gate, test tooling and runbooks. Epics 2–5 depend only on this epic. The repo is brownfield, so the first story removes the legacy auth and template code.

## Stories

- Story 1.1: Foundation — env config, security headers, test tooling, CI and legacy removal
- Story 1.2: Launch from the portal and arrive signed in
- Story 1.3: Secure 1health proxy — allowlist, normalization, CSRF, no-store and logging
- Story 1.4: `callApi` transport, SWR keys and `useMyself`
- Story 1.5: Client-coordinated token refresh
- Story 1.6: Idle logoff, activity ping and cross-tab activity
- Story 1.7: Logout and session-expired / session-changed dialogs
- Story 1.8: Profile page shell — tokens, app bar, tabs and Section navigation
- Story 1.9: Profile header view — name, picture and primary contacts
- Story 1.10: Change Profile Picture
- Story 1.11: Section framework — registry, edit model, inline validation and shared primitives
- Story 1.12: Error mapping, message catalog, toasts and Retry
- Story 1.13: Leave guard
- Story 1.14: Save all
- Story 1.15: Drafts — keep unsaved edits across an expired session
- Story 1.16: Deployments, environments and operations runbooks

## Requirements & Constraints

- **One-shot launch, no login.** A valid payload lands on Contacts in one load. A bad, expired, used or wrong-tenant payload shows a full-page message, never a blank page or raw error. Each payload is exchanged exactly once, and `lpl` never stays in the URL or history.
- **Session safety.** Tokens never reach the browser. Refresh is silent. The session ends after 15 min without user activity or 8 h after launch, with a warning 60 s before the idle limit. On expiry, unsaved edits are kept as drafts (never SSN, Signature or Insurance) and offered back only to the same user on the same device. If the server data changed meanwhile, the user chooses which version to keep; drafts are never merged automatically.
- **Section editing.** Each Section has a read view and an edit view, and several can be edited at once. Each has its own Cancel and Save, an "Unsaved changes" indicator, and inline errors shown before any request. Nothing auto-saves. Save all validates every dirty Section first and then saves them one by one (not atomic). It reports "X saved, Y failed" and never says "All saved" unless every save worked. A failure in one Section never blocks the others. Network failures offer Retry, and success toasts name the Section.
- **Leave protection.** Switching tabs, using "Return to 1health" or closing the page with unsaved edits asks first.
- **Accessible and responsive.** Works from 360 px to desktop with no horizontal scroll at 360 px. WCAG 2.1 AA, keyboard-only completion, visible focus, reduced motion respected, and every target at least 44×44 px.
- **No PHI leaks.** Logs carry only method, route template, status, duration and request id. Telemetry is a no-op sink with only `section_save` and `save_all` events, carrying no field values or ids. Every server response is no-store. The Medical tab shows only "Coming soon: your medical information will appear here." and makes no API calls.
- **Design system.** Only 1health tokens: no hex values or palette classes, enforced by a lint/CI check. Light theme by default, dark theme via `class="dark"`. Red is only for errors and destructive actions. There are three overrides: link text `#256a8c`, destructive fill `#b23a31` and control border `#7a8696`.

## Technical Decisions

- **BFF + feature-sliced client.** Only the Next server holds tokens and talks to 1health. The browser calls only same-origin `/api/...` through `callApi`. Imports flow BFF → `lib/server`/`lib/shared`; `lib/api` → `lib/shared`; `features/<section>` → `lib/api`, `features/shell`, `components/ui`, `lib/shared`. `components/ui` imports nothing app-specific.
- **Stack.** Pin exact versions from the architecture Stack table. TypeScript stays on 6, not 7. `signature_pad` is wrapped directly. Tests use Vitest, Testing Library and MSW at the `/api` boundary, plus Playwright against a mocked proxy. The Vercel request body limit is 4.5 MB.
- **Environment and session.** Origins are fixed by `APP_ENV` (dev/demo/prod), with no chooser or referrer detection. One sealed `__Host-pp_s` cookie (≤ 3,800 bytes) holds the tokens, ids and session metadata. `userId` and `personId` come from `GET /v2/user/myself`, because those JWT claims are encrypted; only `tenantId` is plaintext. Only tenant `1` may launch.
- **Proxy.** Every upstream endpoint must be in the allowlist, and **each story adds its own entry in the same change as the code that calls it**. Owner ids are sent as the literal `me`. `isPublic` and `hardDelete` are forced by the server. GraphQL is never proxied; the only GraphQL path is the named server route `GET /api/pp/profile-picture-id`. The proxy never refreshes tokens. It answers `401 TOKEN_EXPIRED` instead.
- **Refresh and logout.** The backend has confirmed that 1health **rotates refresh tokens with no reuse detection**: a refresh that loses a race gets `invalid_grant`, which becomes `SESSION_EXPIRED`. That is why the in-tab and cross-tab single-flight is required. `client_id=public-client` is correct. Upstream logout revokes only the access token. This is accepted for v1, because the refresh token lives only in the cookie that logout clears. Full revocation has been requested from the backend and needs no app change when it ships. `/oauth2/revoke` can't be used because `public-client` has no client authentication.
- **CSRF and per-tab binding.** The page embeds `HMAC(SESSION_SECRET, sid)`, and `callApi` alone sends it as `X-PP-Session`. Non-GET requests need a same-origin request plus that header. A binding mismatch returns `409 SESSION_CHANGED`.
- **Section contract.** Sections register with `useRegisterSection({id, label, displayOrder, form, validate, save, discard, draftFields, saveAll?})`. The Section id is also its URL hash, feature folder, draft key and telemetry id: `personal` (with sub-anchor `#signature`), `phone`, `email`, `social`, `addresses`, plus `insurance`, which registers guard-only. `save()` never throws. Multi-step saves use `runSaveSteps`, which refetches and rebases on failure so a retry sends only the remaining diff. `SAVE_ORDER` is `personal → email → phone → social → addresses`, independent of display order. A `SESSION_EXPIRED` or `SESSION_CHANGED` result stops a Save-all run.
- **Single owners.** Each of these has exactly one owner:
  - `errorCode` mapping: `lib/api/errors.ts`
  - copy: `lib/shared/messages.ts` (EXPERIENCE text verbatim; anything else marked `// DRAFT COPY`)
  - toasts: `features/shell/toasts.ts`
  - confirm dialogs: `components/ui/confirm-dialog.tsx`
  - image re-encoding: `lib/shared/image-reencode.ts`
  - draft writes: the registry
  - session dialogs: `SessionDialogs`
- **Files.** Uploads are at most 4 MB after a canvas re-encode in the browser. The proxy checks the size, the multipart part name and the magic bytes of every upload, and serves images inline only when the declared type and leading bytes match. Order is replace-then-delete, and a failed delete never fails the save.

## UX & Interaction Patterns

- **Layout.** Top to bottom: app bar, header, tabs, then the body. From 768 px the body has a sticky numbered Section menu next to the main column. Below 768 px a "Jump to" select replaces the menu. Neither appears on Insurance or Medical.
- **Tabs and deep links.** Tabs follow the ARIA tablist pattern with manual activation. `?tab=` changes through a URL replace, and an unknown tab falls back to Contacts. `#<section>` and `#signature` deep links survive a refresh. Tab switches go through `requestLeave()`.
- **Framed mode.** When the app runs inside the portal iframe, "Return to 1health" is not rendered. The session-expired action becomes "Close and reopen from 1health" and doesn't navigate.
- **Dialogs and editing.**
  - Session dialogs can't be dismissed, and only one opens at a time.
  - The leave guard offers Keep editing, Discard and Save.
  - Confirm dialogs exist for exactly three cases plus the leave guard.
  - Unavailable actions are `aria-disabled` and show a tooltip reason.
  - In edit view, Escape doesn't cancel and Enter doesn't submit.
  - Save all is a sticky bar from 768 px and a pill below 768 px; the pill hides while the keyboard is open. It is last in the tab order.

## Cross-Story Dependencies

- Stories run in order (1.1 → 1.16); each depends only on earlier ones.
- Later epics reuse what this epic builds:
  - the allowlist pattern
  - `callApi`/`ApiResponse`
  - `lib/api/keys.ts`, including the header keys `myself()` and `contactPoints("Phone"|"Email")`, which Epic 3 must `mutate`
  - the registry, `runSaveSteps` and `SAVE_ORDER`
  - `SectionFrame`, `RowActions`, `RowRemoval` and `DisabledAction`
  - the confirm dialog, toasts, messages and error mapping
  - drafts and `image-reencode`
  - the proxy's `asImage`, upload and `DELETE /v2/file/{id}` mechanisms
- **External dependencies (owner Daniel Garcia):**
  - External Application registration in each environment
  - the 1health-fe cutover flag
  - BAAs with Vercel and with Google (the Google BAA must be in place before `PLACES_ENABLED=1`)
  - backend refresh-token revocation on logout, and confirmation that `public-client-id` isn't overridden in demo and prod
  - demo QA of UJ-1 to UJ-5 by 2026-10-24 and the production cutover on 2026-10-29
