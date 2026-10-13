# Epic 1 Context: Launch, session and profile shell

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 1 delivers the foundation and shell for Personal Profile. A user opens the app from the 1health portal, arrives already signed in on the Contacts tab with no login screen, sees their name, picture and primary contacts, and moves between Contacts / Insurance / Medical tabs. It builds the full security and session spine (sealed cookie, server proxy, token refresh, idle logoff, session dialogs) and the reusable shell every later epic depends on (Section registry, edit model, Save all, leave guard, drafts, error/toast mapping, design tokens), plus the operational envelope (three pinned Vercel deployments, CI gate, test tooling, runbooks). Every other epic depends only on Epic 1. This is a brownfield repo: Story 1.1 must delete the legacy auth/template code before building the new spine.

## Stories

- Story 1.1: Foundation — env config, security headers, test tooling, CI, legacy removal
- Story 1.2: Launch from the portal and arrive signed in
- Story 1.3: Secure 1health proxy (allowlist, normalization, CSRF, no-store, logging)
- Story 1.4: `callApi` transport, SWR keys and `useMyself`
- Story 1.5: Client-coordinated token refresh
- Story 1.6: Idle logoff, activity ping and cross-tab activity
- Story 1.7: Logout and session-expired / session-changed dialogs
- Story 1.8: Profile page shell — tokens, app bar, tabs, Section navigation
- Story 1.9: Profile header view — name, picture, primary contacts
- Story 1.10: Change Profile Picture
- Story 1.11: Section framework — registry, edit model, validation, shared primitives
- Story 1.12: Error mapping, message catalog, toasts and Retry
- Story 1.13: Leave guard
- Story 1.14: Save all
- Story 1.15: Drafts — keep unsaved edits across an expired session
- Story 1.16: Deployments, environments and operations runbooks

## Requirements & Constraints

- **Launch once, no login.** A valid encrypted payload lands on Contacts in one load; bad/expired/used/wrong-tenant payloads show an explanatory full-page screen (never blank/raw). Each payload exchanges exactly once; `lpl` is stripped from URL and history.
- **Session safety.** Tokens live only server-side; refresh is silent; idle logoff after 15 min inactivity, hard 8 h cap after launch, 60 s warning. On expiry, unsaved work is kept as drafts (excluding SSN/Signature) and offered back to the same user on the same device, with a conflict choice when server data changed.
- **Section editing.** Read view plus an independently openable edit view; several editable at once; per-Section Cancel/Save; inline "Unsaved changes" and field-level errors before any request; nothing auto-saves. Save all validates all first, saves non-atomically, reports "X saved, Y failed", never claims "all saved" unless all did. Confirm before losing unsaved work; one Section's failure never blocks others; network failures offer Retry; success toasts name the Section.
- **Accessible & responsive:** 360 px → desktop, no horizontal scroll at 360 px, 44×44 px targets, WCAG 2.1 AA, keyboard-only, visible focus, reduced-motion.
- **No PHI in logs/telemetry/URLs/cache:** logs carry only method/template/status/duration/request-id; telemetry is a no-op sink with only `section_save` and `save_all`; no-store on every server response. Medical tab shows only "Coming soon…" (RC9) and makes no API calls.
- **Design system:** only 1health tokens (no hex/palette classes, lint-enforced), light default + dark via `class="dark"`, red reserved for errors/destructive. Three DESIGN overrides — link text `#256a8c`, destructive fill `#b23a31`, control border `#7a8696`.

## Technical Decisions

- **BFF + feature-sliced client.** Only the Next server holds tokens / talks to 1health; the browser calls only same-origin `/api/...` via `callApi`. Import layers: BFF (`app/launch`, `app/api/*`, `proxy.ts`, `lib/server`) → `lib/server`/`lib/shared`; `lib/api/*` → `lib/shared`; `features/<section>` → `lib/api`, `features/shell`, `components/ui`, `lib/shared`; `components/ui` imports nothing app-specific. Feature folders: shell, header, personal, phone, email, social, addresses, insurance, medical.
- **Stack — pin exact versions** (full table in the architecture Stack section): Next 16, React 19, TypeScript 6 (not 7), Tailwind 4, SWR 2.5, react-hook-form + zod 4, iron-session 9, signature_pad (wrapped directly), shadcn/Radix; tests Vitest + Testing Library + MSW (mocked at the `/api` boundary) + Playwright; Node 24, pnpm 12 via corepack; Vercel body limit 4.5 MB.
- **Env + cookie.** `lib/server/env.ts` (`import "server-only"`) is the only reader of server `process.env` (client reads only `NEXT_PUBLIC_APP_ENV`); origins are fixed per `APP_ENV` (dev/demo/prod), boot fails on any bad var, no chooser/referrer detection. One sealed cookie `__Host-pp_s` (iron-session, rotation-aware) holds tokens + ids + session metadata; ids are derived at launch from `GET /v2/user/myself`; every route/server component calls `requireSession()`.
- **Proxy `app/api/1h/[...path]` + `lib/server/proxy-allowlist.ts`** (injectable factory): allowlist entries `{method, template, query, body, maxBytes?, asImage?}`, owner ids filled from the session (client sends literal `me`), everything not allowlisted rejected, `isPublic`/`hardDelete` forced server-side, no-store + manual redirect + timeout. **Each later story adds its own allowlist entry with the code that uses it.** GraphQL is never proxied except the named op `GET /api/pp/profile-picture-id`.
- **CSRF + per-tab binding.** The page embeds `sessionBinding = HMAC(SESSION_SECRET, sid)`; `callApi` is the sole sender of `X-PP-Session`; non-GETs require same-origin + that header; a binding mismatch yields `SESSION_CHANGED`.
- **`callApi`** (signature kept) is the only browser transport (`fetch` lint-banned elsewhere), resolving `ApiResponse<T> = {success, data?, error?, errorCode?, details?, statusCode?}` (never throws) and publishing `session-expired`/`session-changed` once per page lifetime on `lib/api/session-events.ts`. Refresh is single-flighted per tab and across tabs (`navigator.locks`). Reads use SWR with keys from `lib/api/keys.ts` shaped `["pp", resource, ...]` (lint-enforced); fixed header keys `myself()`, `contactPoints("Phone"|"Email")`, `profilePictureId()`.
- **Section registry + Save all.** `useRegisterSection({id, label, displayOrder, form, validate, save, discard, draftFields, saveAll?})`; `SectionId = personal|phone|email|social|addresses|insurance`; id = hash = folder = draft key = telemetry id; the registry is the only holder of dirty/save/draft state; `save()` resolves `{ok}|{ok:false,error}` and never throws; Insurance registers guard-only; `SAVE_ORDER = personal → email → phone → social → addresses` (constant, independent of displayOrder).
- **Images, drafts.** Uploads ≤ 4 MB after client canvas re-encode via the single `lib/shared/image-reencode.ts` (JPEG for pictures, PNG for Signature; BMP converted); proxy upload/`asImage` entries validate size, part and magic bytes and force safe disposition; replace-then-delete, a failed delete never fails the save. Drafts: key `pp:draft:v1:<userId>:<sectionId>`, only `draftFields` (never SSN/Signature/Insurance), written only by the registry; `baseHash` mismatch → conflict UI, never auto-merge.
- **Shared primitives (Story 1.11).** `components/ui/confirm-dialog.tsx` is the only confirm dialog; also `RowActions`, `RowRemoval` (strike-through + Restore, nothing deleted until Save), `DisabledAction` (aria-disabled + tooltip), `SectionFrame` (per-Section skeleton/error isolation). Error mapping only in `lib/api/errors.ts`; copy in `lib/shared/messages.ts` (EXPERIENCE Voice & Tone verbatim; drafts marked `// DRAFT COPY`); toasts via `features/shell/toasts.ts`.
- **Deployments & CI + brownfield (AD-20, RC12).** Three Vercel projects `personal-profile-{dev,demo,prod}`, each `APP_ENV`-pinned with its own secrets (no `NEXT_PUBLIC_*` secrets, no `_DEMO`/`_PROD` names); dev auto-deploys `main` + dev-only previews, demo/prod only by promoting a verified SHA (prod needs approval); kill switch `PP_DISABLED=1`. CI runs lint → typecheck → test → Playwright → build plus a forbidden-pattern grep; `ignoreBuildErrors`/`ignoreDuringBuilds` removed. Story 1.1 deletes legacy auth/template files (even with uncommitted mods), keeps `callApi`'s signature and `components/ui/*`, and reduces `app/page.tsx` to a placeholder.

## UX & Interaction Patterns

- **Shell:** app bar (wordmark + "Personal Profile"; "Return to 1health" hidden when framed) → header slot → tab strip → two-column body with a sticky numbered Section menu + fluid main column at ≥768 px; below 768 px a full-width "Jump to" select, menu only on Contacts.
- **Tabs & section nav:** Contacts / Insurance / Medical with ARIA tablist semantics, arrow/Home/End, manual activation, `?tab=` via replace (unknown → Contacts; Medical tagged "Coming soon"); tab switch routes through `requestLeave()`. Five Contacts sections, `personal` carrying a `#signature` sub-anchor; menu activation smooth-scrolls (instant under reduced motion), focuses the `h2`, updates the hash; a scroll-spy marks the in-view item; deep links survive refresh.
- **Framed vs new-tab:** `useIsFramed()` = `window.self !== window.top`; when framed, "Return to 1health" is hidden and the session-expired action becomes "Close and reopen from 1health" (no navigation); `reason=cookies` offers "Open in a new tab".
- **Dialogs & editing:** session dialogs are non-dismissable, one at a time, opened only by `SessionDialogs`; leave guard uses `confirm-dialog` (Keep editing / Discard / Save), scoped for guard-only participants. Header is the single `h1` + avatar button (camera badge → Change Profile Picture, initials fallback), updating live on `mutate`, no "Last updated" (RC8). Edit view gets a primary border + accent halo; Cancel reverts only that Section; Escape doesn't cancel, Enter doesn't submit. Save all is a sticky bar (≥768 px) or floating pill (<768 px, hidden with the keyboard open), last in the tab order.

## Cross-Story Dependencies

- Stories are strictly ordered; each depends only on earlier ones (1.1 → … → 1.16, per the Stories list).
- Artifacts introduced here that all later epics reuse: the `/api/1h` proxy + allowlist pattern, `callApi` + `ApiResponse`, `lib/api/keys.ts` (esp. the fixed header keys), `SectionRegistry`/`useRegisterSection`, `SAVE_ORDER`, the Section edit model + footer, `confirm-dialog`, toasts, `lib/shared/messages.ts`, `lib/api/errors.ts`, drafts, the aria-disabled tooltip pattern, `lib/shared/image-reencode.ts`, and the proxy `asImage`/upload/`DELETE` mechanisms.
- External release dependencies (owner Daniel Garcia): External Application registration per environment (`<APP_ORIGIN>/launch`, Active, allowed for patients); the 1health-fe cutover flag (rollback path `/profile`); BAAs with Vercel (demo/prod PHI) and Google (`PLACES_ENABLED=1`); demo QA of UJ-1..UJ-5 by 2026-10-24; prod cutover 2026-10-29.
