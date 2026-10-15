---
status: final
stepsCompleted: [1, 2, 3, 4]
profileModule:
  stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-personal-profile-2026-10-13/prd.md
  - _bmad-output/planning-artifacts/prds/prd-personal-profile-2026-10-13/addendum.md
  - _bmad-output/planning-artifacts/prds/prd-profile-account-2026-10-13/prd.md
  - _bmad-output/planning-artifacts/prds/prd-profile-account-2026-10-13/addendum.md
  - _bmad-output/planning-artifacts/architecture/architecture-personal-profile-2026-10-13/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-personal-profile-2026-10-13/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-personal-profile-2026-10-13/EXPERIENCE.md
---

# Personal Profile & Profile module (NG-9019) - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Personal Profile (NG-9019), decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

Epics 7 and later cover the Profile module (`/account`: Personal Account, Individual Provider Registration, My Organizations) from `prd-profile-account-2026-10-13`; its requirements are inventoried in "Profile module (/account) — Requirements Inventory" below.

## Requirements Inventory

### Functional Requirements

FR numbers match the PRD's FR-N ids. Endpoints per FR are in `addendum.md` §A.

**App Shell (PRD §4.1)**

FR1: Launch and sign-in. A Launching user opening the app from the 1health portal arrives signed in with no login screen: a valid launch payload lands on the Contacts tab within one page load; an invalid, expired, already-used or unencrypted payload ends, after the D9 retries, in the /auth error alert ("Authentication Failed" + user-safe message, with "Enter LPL Manually", "Switch Environment", "Go to 1health ({env})"); never a blank page or raw error; each payload is exchanged exactly once and `lpl` is removed from the URL and browser history so a reload never replays it. (Environment selection: see Ambiguities — architecture AD-3 pins one environment per deployment and removes the chooser/referrer detection the PRD describes.) *(Superseded 2026-10-14 by D1/D2: one deployment serves demo and prod; the server detects the environment from the key that decrypts the `lpl`; no chooser; referrer detection only picks the no-LPL screen's link. See "Launch and environment decisions" under the Epic List.)* *(Amended 2026-10-14 by D9: the server still exchanges each payload exactly once per request, but `/auth` retries a failed launch up to five times; with no `lpl`, `/auth` offers manual LPL entry.)*

FR2: Session continuity and expiry. The access token is refreshed silently before expiry and on a 401; when refresh fails the user sees a session-expired message with a "Return to 1health to relaunch" action; unsaved edits in open Sections are kept in `localStorage`, keyed to the Launching user's id, expire after 24 h, exclude SSN and Signature drawings, are cleared on save, discard and app-bar "Return to 1health" but kept when leaving via the session-expired dialog, are offered only to the same user after relaunch on the same device, and when the server data changed since the draft the app shows both versions and the user chooses (never a silent overwrite).

FR3: Tab navigation. The user can switch between Contacts, Insurance and Medical tabs; the active tab is reflected in `?tab=contacts|insurance|medical` (survives refresh, deep-linkable); tabs work with arrow keys and Enter with ARIA tab semantics; switching away from a tab with unsaved Sections first asks keep editing / discard / save.

FR4: Section edit model. Every Section shows a read view by default and can be opened in edit view independently; several Sections can be in edit mode at once; each has its own Cancel (reverts only that Section) and Save (saves only that Section); a Section with unsaved changes shows an "Unsaved changes" indicator; validation errors appear inline at the field before any request is sent.

FR5: Save all. A page-level "Save all (N)" bar appears while N >= 1 Sections are dirty and disappears at N = 0; it validates every changed Section first and sends nothing if any is invalid (focusing the first invalid field); Sections then save independently and non-atomically — succeeded Sections return to read view, failed ones stay in edit with their error, a toast reports "X saved, Y failed", and the page never claims "all saved" unless every save succeeded.

FR6: Leave protection. Closing or reloading the page, or using "Return to 1health", while any Section has unsaved changes triggers a confirmation.

FR7: Feedback and errors. Every save gives a success toast naming the Section; platform validation errors are mapped to human-readable messages next to the relevant field where possible, otherwise at Section level; network failures offer Retry.

FR8: Responsive and accessible layout. The app works from 360 px phone width to desktop with no horizontal scroll at 360 px; multi-column forms collapse to a single column on narrow screens; the insurance editor is a side drawer on desktop and a full-screen sheet on mobile.

**Profile Header (PRD §4.2, NG-9021)**

FR9: View header. The header shows first + last name from the profile (updated immediately after Personal Information is saved) and the Profile Picture, or a placeholder with initials when there is none.

FR10: Change Profile Picture. The user can upload a new Profile Picture: only JPG, PNG or BMP up to 6 MB is accepted (anything else rejected before upload with the reason shown); a preview is shown before the upload is confirmed; after a successful upload the new picture appears immediately and the previous picture file is deleted.

**Personal Information and Signature (PRD §4.3, NG-9022)**

FR11: View personal information. Shows first, middle and last name; name prefix and suffix, other names, titles; birth date, city of birth; race, ethnicity, biological gender, gender identity, sexual orientation; Masked SSN; Signature preview — with empty values shown as "Not provided".

FR12: Edit personal information. The user can edit every FR11 field with today's validation: first and last name required, printable characters only; birth date required and must make the user 18–120 years old (21–120 for the Proctor role), with inline help explaining the age rule; race, ethnicity and biological gender required from platform value lists (defaulting to "Unknown", "Unknown" and "Asked but not answered" when unset); gender identity required, from Asked but not answered / Female / Male / Other or free text; sexual orientation free text <= 128 chars; city of birth <= 128 chars; only changed fields are sent and clearing an optional field clears it on the platform; email and phone number are never sent from this Section.

FR13: SSN entry and reveal. The SSN shows as Masked SSN (`***-**-1234`) by default; the user can add, change or clear it, with typing auto-formatted to `XXX-XX-XXXX` and checked to be 9 digits; an SSN belonging to another person is rejected with a clear message; Reveal fetches and shows the full SSN of the Launching user's own record only, auto-hides after 30 s, on blur, or when the user leaves the tab, and the full SSN is never cached, logged or kept in client storage.

FR14: Signature. The user can draw, replace or clear their Signature on a pad that works with mouse, touch and pen and has an accessible name and instructions; clearing a saved Signature asks for confirmation; saving creates, versions or removes the user's signature file as needed; screen-reader users are told drawing is required. (UX amends: "Upload image instead" PNG/JPEG is offered as the non-drawing alternative; typed signature stays out.)

**Phone (PRD §4.4, NG-9023)**

FR15: View phones. The Primary phone is listed first; each entry shows the number with country flag and code, its Contact Label, Mobile or Landline, a Verified/Unverified badge (none for Home-labeled entries), and a notification on/off indicator.

FR16: Add, relabel and remove phones. A new phone requires an international number (country picker; US numbers must be 10 digits), a Contact Label and the Mobile flag; duplicate numbers are rejected; a saved phone's number and Mobile flag can't be edited (only its Contact Label or notification setting, or removal); removing the only phone is not allowed; at most 20 phones per Contact Type, with Add disabled at the limit with an explanation; the number field has inline help explaining format and verification.

FR17: Verify phones. New mobile numbers whose Contact Label isn't Home are sent a verification automatically after saving; saved unverified mobile numbers not labeled Home show Verify / Resend verification; the Verified badge updates the next time the Section is refreshed.

FR18: Primary phone. "Make primary" on a saved entry sets its Contact Label to Primary and relabels the previous Primary "Old" in the same save; only a saved, Verified mobile can be made Primary (exception: if no phone is Verified and none is Primary, an unverified mobile can); a new phone can't be added directly as Primary; landlines can't be Primary; disabled actions explain why ("Verify this number first", "Landlines can't be primary"); changing the Primary asks for confirmation that it changes the login identifier; the Primary phone can't be deleted until another phone is Primary; an existing unverified Primary keeps its Primary badge and shows Verify.

FR19: Phone notifications. The user can turn notifications on or off for the Primary phone; it defaults to on when a phone becomes Primary.

**Email (PRD §4.5, NG-9024)**

FR20: View, add, relabel and remove emails. Entries show the address, Contact Label, Verified badge and notification indicator; new entries must be valid emails and unique (case-insensitive); a saved address can't be edited; removing the only email is not allowed; at most 20 emails.

FR21: Verify emails. New emails whose Contact Label isn't Home get a verification automatically after save; unverified emails not labeled Home show Verify / Resend verification.

FR22: Primary email. "Make primary" sets the Contact Label to Primary and relabels the previous Primary "Old" in the same save; only a saved, Verified email can become Primary and a new email can't be added directly as Primary; at most one Primary email, which can't be removed until another is Primary; changing it asks for confirmation that the login email changes; an email already used by another account is rejected with a clear message.

FR23: Email notifications. The user can turn notifications on or off for the Primary email; it defaults to on when an email becomes Primary.

**Social Media (PRD §4.6, NG-9025)**

FR24: Manage social links. The user can add, edit and remove social-media links: each is a required, valid URL unique per user, stored with Contact Label "Personal", with no verification, primary or notification setting; at most 20 links; zero links are allowed (changes today's at-least-one rule); links open in a new tab from the read view.

**Addresses (PRD §4.7, NG-9026)**

FR25: View addresses. The Primary address is listed first; each shows its Address Type, full address, Primary badge and Verified badge.

FR26: Add and edit addresses. Required: Address Type (Home, Main Work, Other Work, Vacation Home), country, address line 1, city, zip/postal code; optional: address line 2, county, state/province; the country list comes from the platform with United States, Canada and Australia pinned first; for US/CA/AU, address line 1 offers suggestions and picking a complete suggestion fills the remaining fields and marks the address Verified; duplicates (same country, line 1, city, zip and type) are rejected; when editing several addresses each can collapse to a one-line summary.

FR27: Primary address and removal. Exactly one address is Primary and the first address added becomes Primary automatically; the user can set any address as Primary; the Primary address can't be deleted until another is Primary; the last address can't be deleted.

**Insurance (PRD §4.8, NG-9029)**

FR28: View insurance policies. Each Insurance Policy is a card showing the type as title (e.g. "Medical Insurance") with a precedence badge, the Insurer, member ID and group ID, the subscriber's name, effective/expiration/cancellation dates, and front and back card thumbnails; policies with status Deleted show a "Deleted" badge and no actions; with no policies an empty state shows an "Add insurance" call to action.

FR29: Add and edit an insurance policy. Required: Insurer (searchable, or new by name), precedence, type, relationship to the insured, member ID (>= 3 chars), effective date; optional: group ID (>= 3 chars), expiration and cancellation dates (both after the effective date; cancellation also before expiration); subscriber first/last name, email, phone and birth date are required when relationship isn't Self, the subscriber email can't be the user's own login email, and the subscriber must be 18–120; only one Primary policy per insurance type, and picking Primary when another policy of that type is Primary offers to demote the other; front/back card images are PNG or JPEG up to 10 MB and 6000x4000 px, previewed before upload, stored privately, SVG rejected; the policy saves first and then images upload, and if an upload fails the policy stays saved and the card shows the image as missing with "Retry upload".

FR30: Delete an insurance policy. Deletion asks for confirmation; the UI reflects whichever outcome the platform returns — the policy marked Deleted (shown with a Deleted badge) or removed from the list.

FR31: View card images. The user can open card images full-size; images are only ever fetched with the user's session.

**Medical (PRD §4.9, Epic 2 placeholder)**

FR32: Medical tab placeholder. The Medical tab is visible and shows a "Coming soon" empty state describing what will appear there, and makes no API calls until Epic 2 defines it.

### NonFunctional Requirements

NFR1: Security and privacy. Access and refresh tokens live only in `httpOnly`, `Secure`, `SameSite` cookies, are never readable by page JS and never returned in a response body; every 1health API call goes through the app's server-side proxy which attaches the token (the browser never sees the Bearer token); a Content Security Policy blocks inline and third-party scripts (address suggestions are server-proxied per AD-14, so no third-party script exception is needed); request/response debug logging is off in production and redacts tokens, SSN and secrets elsewhere; user-uploaded images are served only as raster images (PNG/JPEG/BMP), never rendered as documents; PHI/PII is never written to analytics or client storage, except FR2 drafts which exclude SSN and Signature. *(2026-10-14, D6: the only body logger is the client `logApiCall` console logger, active only in local development and redacting SSN-shaped values, MFA codes, QR codes and tokens; server logs never contain bodies.)*

NFR2: Accessibility. WCAG 2.1 AA, keyboard-only completion of every flow, visible focus, and reduced-motion support per 1health design-system rules.

NFR3: Design system. Only 1health design tokens, no hard-coded colors; red reserved for destructive actions and errors; light theme by default with dark theme supported.

NFR4: Performance. First meaningful content within 2.5 s on typical broadband after launch; Section reads load in parallel and each Section shows its own skeleton instead of blocking the page.

NFR5: Reliability. A failure in one Section's read or save never blocks the other Sections.

NFR6: Environments. Works against each 1health environment with the environment derived from the deployment/launch and API base URLs never hard-coded per call. (Architecture AD-3 amends to three deployments — dev, demo, prod — each pinned to one environment.) *(Superseded 2026-10-14 by D1/D2/D4: one deployment serves both `demo` and `prod` (no `dev`); the environment comes from the decrypting key and is sealed in the session; API roots come from `lib/shared/environments.ts`.)*

NFR7: Browser support. Latest two versions of Chrome, Edge, Safari and Firefox, plus iOS Safari and Android Chrome; the app must work both in a new tab and inside the portal iframe (AD-5). *(Superseded 2026-10-13: the app always runs top-level in its own tab and is never framed — `frame-ancestors 'none'`, `X-Frame-Options: DENY`, no framed branches (AD-5, PRC3); the browser list stands.)*

NFR8: External Application registration (release dependency). The app is registered in each environment (demo, then production; plus dev per AD-20) with launch URL `<APP_ORIGIN>/launch`, icon and launch secret, set **Active** and **allowed for patients** so patients can see it. Owner: Daniel Garcia. *(Amended 2026-10-14 by D1: demo then production only (no dev); both registrations use the one deployment's launch URL `<app origin>/auth`.)*

NFR9: 1health-fe cutover flag (external release dependency, separate repo). A flag in 1health-fe makes the sidebar "Personal Profile" item launch this app instead of routing to `/profile`; `/profile` stays reachable as the rollback path and for users who can't launch external apps (MTA, Customer Support); legacy `/profile?tab=N` links keep working; the flag ships independently. Owner: Daniel Garcia. *(Superseded 2026-10-13: no 1health-fe changes and no flag; entry is the portal Apps launcher tile "Personal Profile" or a direct URL; the 1health-fe sidebar, `/profile` and `/personal-settings` stay untouched as the fallback (AD-4, PRC1).)*

NFR10: Option-list sources. Person, ContactPoint and Insurance value lists come from platform type metadata (`/v2/type/key/*`); gender identity options and Address Types are fixed lists in the app (addendum §C), with backend-seed race/ethnicity fallbacks if `/type/key/Person` fails.

NFR11: Rollout. Demo first, with QA executing UJ-1 to UJ-5; then production behind the 1health-fe flag. *(Superseded 2026-10-13: no 1health-fe flag; production rollout is the External Application registration set Active and allowed for patients in prod after demo QA (NFR8, Story 1.16).)*

NFR12: Rollback. Turning the 1health-fe flag off returns the sidebar to `/profile`; ending live sessions requires setting `isAllowedForPatients=false` or platform token revocation (disabling the app alone does not revoke tokens); app-side: Vercel instant rollback and `PP_DISABLED=1` kill switch (AD-20). *(Superseded 2026-10-13: there is no 1health-fe flag to turn off; rollback is Vercel instant rollback, `ACCOUNT_DISABLED=1` for the Profile module only, `PP_DISABLED=1`, and `isAllowedForPatients=false` to end live sessions (AD-20, Story 1.16).)*

NFR13: Timeline. All scope ships in release 2026.07.01 "Conduit" on 2026-10-29; feature freeze 2026-10-22; demo QA complete by 2026-10-24, otherwise the production cutover is a no-go and moves to the next release.

NFR14: Success-metric instrumentation constraints. Save outcomes must be observable (SM-2 >= 98% first-attempt Section save success; SM-C1 "Save all with >= 1 failure" rate) without PHI, via the AD-15 telemetry events; validation must not be loosened to raise save success (SM-C2).

### Additional Requirements

**Brownfield starting point (impacts Epic 1 Story 1).** There is no greenfield starter template. The repo is an existing fork of a 1health External Application template, already upgraded to Next.js 16.4.0, React 19.3, TypeScript 6.0.3, Tailwind 4.3.3, zod 4, SWR 2.5, react-hook-form 7.90 + @hookform/resolvers 5.9, libphonenumber-js, signature_pad 5.1.4, lucide-react, ESLint 10 flat config (`pnpm lint` = `eslint .`). Not yet installed: `iron-session` 9.0.1, Vitest 5.0.4, @testing-library/react 16.3.3, MSW 3.0.3, @playwright/test 1.64.0. No `proxy.ts` exists yet. `next.config.mjs` still has `typescript.ignoreBuildErrors: true`. The first story must remove the legacy auth and template code:
- Delete `app/api/token/**` (sets non-httpOnly token cookies and returns tokens in the body), `app/auth/**`, `lib/auth-client.ts` (browser-side refresh), and `document.cookie` reads in `contexts/navigation-context.tsx` (AD-1, AD-4). *(2026-10-14, D1: the legacy versions are deleted, and Story 1.2 rebuilds `app/auth/page.tsx` and `app/api/token/route.ts` as the sealed-session launch entry.)*
- Replace `contexts/navigation-context.tsx`, `contexts/session-context.tsx`, `hooks/use-session-expired.ts`, `components/auth-exit-dialog.tsx` with `features/shell` + `lib/api/session-events.ts` (AD-10, AD-19).
- Replace `components/home-page-client.tsx`, `components/settings-page.tsx`, `components/workflow/` with the profile page and Sections.
- Keep `lib/api/client.ts` `callApi` signature, extend per AD-19.
- Delete non-allowlisted `lib/api/*` modules: workflow, campaign, journey, grid, attachments, comments, custom-data, partnerships, query, schema, step-config, tenant.
- Remove `ignoreBuildErrors` (and `eslint.ignoreDuringBuilds`) from `next.config.mjs` (AD-20).
- Note: several of these files currently have uncommitted local modifications in git.

**Architecture paradigm and layering.** BFF + feature-sliced client. Only the Next.js server holds tokens and talks to 1health; the browser calls only same-origin `/api/...` through `callApi`. Layers and import rules: BFF (`app/api/token/` and the `app/auth/` server wrapper (D1; replaces `app/launch/`), `app/api/1h/[...path]/`, `app/api/session/`, `app/api/places/`, `app/api/pp/`, `proxy.ts`, `lib/server/`) → `lib/server`, `lib/shared`; API client `lib/api/*` → `lib/shared`; Sections `features/<section-id>/` → `lib/api`, `features/shell`, `components/ui`, `lib/shared`; Shell `features/shell/` → `lib/api`, `components/ui`, `lib/shared`; UI kit `components/ui/` imports nothing app-specific. Target tree per Structural Seed (feature folders: shell, personal, phone, email, social, addresses, insurance, header, medical).

**Architecture decisions as implementable requirements**

- [AD-1] Implement one AEAD-sealed session cookie `__Host-pp_s` (iron-session, `SESSION_SECRET`) holding access token, refresh token, access expiry, `userId`, `personId`, `tenantId`, `sid` (random per launch), `gen` (refresh counter), plus `iat` and `lastSeen` (AD-16); attributes `HttpOnly; Secure; SameSite=Lax; Path=/`, no `Partitioned`, no `Domain`, no `Max-Age`. *(Corrected 2026-10-14: the app opens in its own tab, never framed, per spine AD-1/AD-5; with D5, `SameSite=Lax` is also the only cross-site write protection.)* The API root is never in the cookie (only `environment`, D1). Ids derived at launch from the token + `GET /v2/user/myself` (payload user id must equal token subject). Unsealable cookie = no session; never store `id_token`; unit test asserts `Set-Cookie` <= 3,800 bytes with the largest observed tokens. No response body contains a token. Every route handler and server component calls `requireSession()`; `proxy.ts` redirect is convenience only. *(Amended 2026-10-14, D1: the cookie also holds `environment` (`demo|prod`); the API root is derived from it through `lib/shared/environments.ts` and is never stored. No JS-readable cookies; the only other cookie is the non-secret httpOnly `onehealth_environment` (D4).)*
- [AD-2] Implement `app/api/1h/[...path]/route.ts` + `lib/server/proxy-allowlist.ts`: allowlist entries `{method, template, query, body, maxBytes?, asImage?}` for exactly the addendum §A endpoints; no match → 403 `NOT_ALLOWED`, wrong method → 405; never honor HEAD/OPTIONS/TRACE/`X-HTTP-Method-Override`/`_method`; explicitly deny `/auth/**`, `/v2/public/external-application/**`, admin prefixes. Owner ids `{personId}`/`{userId}` filled from the session; client sends literal `me`, anything else → 403; other ids must match `^\d{1,19}$`. Query params allowlisted per entry (unknown → 400); server-fixed `isPublic=false` (Signature, insurance cards), `isPublic=true` (Profile Picture only), `hardDelete=true` (file deletes only). Path normalization rejects `//`, `%2F`, `%5C`, `%25`, empty/`.`/`..` segments and segments containing `/ \ ; % @ :`, whitespace or control chars (400 `BAD_PATH`); upstream URL built by `apiBase + "/" + segments.map(encodeURIComponent).join("/")`, where `apiBase` = `<apiRoot>/api` of the session's `environment` from `lib/shared/environments.ts` (D4), re-asserted origin + template. Traversal test table (`..%2F`, `%2e%2e`, `%252F`, `//host`, `;x`, trailing `/`, mixed case) → 400/403. GraphQL never proxied: Profile Picture id via named server op `GET /api/pp/profile-picture-id`. Forward only allowlisted request/response headers; drop upstream `Set-Cookie`/CORS. `redirect: "manual"` (3xx → 502 `UPSTREAM_REDIRECT`), 25 s timeout (504 `UPSTREAM_TIMEOUT`), streaming bodies (except upload entries). On upstream 401 or token past expiry (30 s skew) return `401 {errorCode:"TOKEN_EXPIRED", source:"proxy"}` without refreshing (AD-19, amended 2026-10-13). Adding an endpoint = adding an allowlist entry in the same change.
- [AD-3] Implement `lib/server/env.ts` as the only reader of server `process.env`, exporting `API_ORIGIN`, `APP_ORIGIN`, `PORTAL_ORIGIN`, `PORTAL_URL`, `APP_ID`, `DEFAULT_TENANT_ID`, failing boot if any is missing. Origins fixed per `APP_ENV`: dev → `https://dev.1hdev.io`, demo → `https://demo.1health.io`, prod → `https://app.1health.io`. Each deployment holds only its own `ONEHEALTH_SECRET_KEY`/`APP_ID`. Remove the manual environment chooser and referrer detection. *(Superseded 2026-10-14 by D1/D2/D4: `lib/server/env.ts` stays the only `process.env` reader but exports `ONEHEALTH_SECRET_KEY_DEMO`, `ONEHEALTH_SECRET_KEY_PROD`, `APP_ID_DEMO`, `APP_ID_PROD`, `SESSION_SECRET` (+ optional `SESSION_SECRET_PREVIOUS`), `PP_DISABLED`, `ACCOUNT_DISABLED` and the Places vars; there is no `APP_ENV`, `API_ORIGIN`, `APP_ORIGIN`, `PORTAL_URL`, `APP_ID` or `ONEHEALTH_SECRET_KEY` env var. Per-environment API root (`https://1health.demo.1health.io` / `https://1health.app.1health.io`, upstream API = `<root>/api`) and portal URL (same root) are constants in `lib/shared/environments.ts`. No chooser; referrer detection survives only on the `/auth` no-LPL screen.)*
- [AD-4] Implement `app/launch/route.ts` as a one-shot exchange: clear any existing `__Host-pp_s`; normalize `' '`→`'+'` in `lpl`; AES-GCM decrypt (12-byte IV), reject cleartext/malformed; reject app id ≠ `APP_ID`; exchange code exactly once via `POST /v2/public/external-application/auth/oauth2/user/token` (no retry); derive ids and check tenant; set sealed cookie with new `sid`; 303 → `/launch/verify?tab=<tab>` which re-reads the cookie and 303 → `/?tab=<tab>` or `/launch-error?reason=cookies`. `proxy.ts` 307-redirects `/` carrying `lpl` to `/launch` preserving query; `app/page.tsx` never reads `lpl`. `tab` validated against `contacts|insurance|medical` (default contacts); redirects are relative and fragment-free so `#signature` survives. Failures → `/launch-error?reason=<expired|used|invalid|tenant|cookies|config|disabled>`; unknown reasons render `invalid`; raw value never rendered/logged. No session and no `lpl` → launch-error screen (no login page). *(Superseded 2026-10-14 by D1/D2: no `/launch`, `/launch/verify`, `/launch/dev`, `/launch-error` routes and no `proxy.ts` `?lpl` 307. The portal opens `/auth?lpl=…`; the client page POSTs only `{ lpl }` to `/api/token`, which detects the environment by key (prod, then demo, each also trimmed), runs the same one-shot exchange, answers `{ ok: true, environment }` and sets the sealed cookie; `/auth` then navigates to `/`. Failures render on `/auth`. No-session pages redirect to `/auth`. 2026-10-14, D8/D9: there is no `cookies` reason and no verify route; `/auth` retries a failed launch up to five times (the server still calls the exchange once per request) and offers manual LPL entry.)*
- [AD-5] *(Superseded 2026-10-14: the portal opens the app in its own tab; it is never framed. Per spine AD-5, every response carries CSP `frame-ancestors 'none'` and `X-Frame-Options: DENY`, and no iframe or `ExternalAppFrame` support is built. The original text follows for history.)* Support both new-tab and portal-iframe hosting: every response (incl. `/api/**`, `/launch-error`, static assets) carries CSP `frame-ancestors <PORTAL_ORIGIN>` (one origin, no `'self'`), no `X-Frame-Options`; supported host is `ExternalAppFrame` (sandbox `allow-scripts allow-forms allow-popups allow-same-origin`, no top navigation). On `reason=cookies` the launch-error screen offers "Open in a new tab" (opens `PORTAL_URL`, `target=_blank`). When framed (`window.self !== window.top`) hide the app-bar "Return to 1health" and make the session-expired action "Close and reopen from 1health" (no navigation). When not framed "Return to 1health" targets constant `PORTAL_URL`; no `returnUrl`/`next` params; any `postMessage` listener checks `event.origin === PORTAL_ORIGIN` and never posts to `'*'`.
- [AD-6] After exchange, compare the token tenant with `DEFAULT_TENANT_ID` (`1`); on mismatch set no cookie, fetch nothing, redirect to `/launch-error?reason=tenant` with copy "This is available in your personal account. Switch to it in 1health and open it again." (PA5) *(2026-10-14, D1: `/api/token` answers 403 `WRONG_TENANT` and `/auth` shows the same copy.)*
- [AD-7] Implement `SectionRegistry` + `useRegisterSection({id, label, displayOrder, form, validate(), save(), discard(), draftFields})`; Save all, leave guard, dirty count and drafts talk only to the registry. `save()` resolves `{ok:true} | {ok:false, error}` and never throws; multi-step saves run in fixed order and on step failure refetch their SWR keys and rebase the form baseline so retry sends only the remaining diff (Personal: `PUT /v2/user/edit` then Signature upload-then-delete; Addresses: PUT new Primary first, then other PUT/POST, then DELETE; Insurance: policy, then demoted policy, then card images). Section ids = URL hash = folder = draft key = telemetry id: `personal` (1, sub-anchor `#signature`), `phone` (2), `email` (3), `social` (4), `addresses` (5). Unknown tab → Contacts; unknown hash → top of tab. Insurance registers as guard-only (`saveAll:false, draftFields:[]`).
- [AD-8] Save all: validate every dirty Section first (any invalid → send nothing); then save sequentially in constant `SAVE_ORDER = personal → email → phone → social → addresses` (in `features/shell`, independent of displayOrder); a failure doesn't stop later Sections; `SESSION_EXPIRED`/`SESSION_CHANGED` stops the run (2026-10-14, D5: `SESSION_EXPIRED` only); each Contact Point Section runs auto-verify right after its own successful save; toast "X saved, Y failed".
- [AD-9] Implement one Contact Point engine in `lib/api/contact-points.ts` shared by Phone, Email, Social: `diffToManageDTO(before, after)` → `contactPointsToAdd/Update/Remove`; a Primary switch puts new Primary and old (relabeled `"Old"`) in the same `contactPointsToUpdate`; `newUnverified(before, after)` drives auto-verify (label ≠ Home) via `POST /v2/health/contact-point/verify`. Contact Label list defined once in `lib/shared/contact-labels.ts` = backend enum ∩ `/type/key/ContactPoint` minus "Partnership Organization". `PUT /v2/user/edit` never sends `email`/`phoneNumber`.
- [AD-10] All reads via SWR with keys from `lib/api/keys.ts` (e.g. `["pp","myself"]`, `["pp","contact-points","Email"]`) and a shared `callApi` fetcher; after save a Section `mutate`s its own keys and affected keys (Personal also refreshes `myself` → header). No global client store besides `SectionRegistry`; `session-context` replaced by the `myself` key. Revealed SSN never in SWR/cache: `revealSsn()` → component state, cleared after 30 s, blur, `visibilitychange`, `pagehide`.
- [AD-11] Each Section owns `features/<section-id>/schema.ts` (zod 4) + one `useForm` with `zodResolver`; error messages are keys into `lib/shared/messages.ts` whose copy is EXPERIENCE.md Voice and Tone verbatim; backend `errorCode` → field/message mapping only in `lib/api/errors.ts`; Social URL fields validate `^https://` or a handle pattern; data-derived links render only via `safeHref()` (allows only `https:`, `mailto:`, `tel:`); lint rule bans `dangerouslySetInnerHTML`.
- [AD-12] Drafts in `localStorage`, key `pp:draft:v1:<environment>:<userId>:<sectionId>` *(amended 2026-10-14, F4 review: `environment` = `demo|prod` added because both environments share one origin and user ids can collide; tenant is always 1)*, value `{savedAt, baseHash, values}` with only the Section's `draftFields` (never SSN, Signature, Insurance); written only by the registry (debounced 500 ms on change, and immediately before the session-expired dialog opens); kept on session-expired "Return to 1health"; deleted on that Section's save/discard, on app-bar "Return to 1health" (after leave-guard confirm), and when older than 24 h (purge all expired `pp:draft:*` at app start); none written on `SESSION_CHANGED`; offered only when key userId equals current `myself` id; `baseHash` mismatch → per-Section conflict UI, never auto-merge. *(2026-10-14, D5: there is no `SESSION_CHANGED`, so its no-draft and purge rules are dropped.)*
- [AD-13] Files/images via proxy URLs with uploads <= 4 MB: client downscales/re-encodes images on canvas to <= 4 MB while user-facing limits stay (Profile Picture JPG/PNG/BMP <= 6 MB; insurance cards PNG/JPEG <= 10 MB, 6000x4000; Signature drawn or uploaded PNG/JPEG always converted to PNG). Proxy upload entries: `maxBytes` 4 MB (Signature 1 MB) checked on `Content-Length` and while reading (413 `TOO_LARGE`); multipart with exactly one file part named `file` or `fileNewVersion`; leading bytes must match PNG/JPEG/BMP (Signature PNG only) else 415 `UNSUPPORTED_MEDIA`. Downloads stream; images render as `<img src="/api/1h/…">` on `asImage` entries; `inline` only for declared `image/png|jpeg|bmp` with matching magic bytes, else `Content-Disposition: attachment; filename="file"`; proxy always generates `Content-Disposition` and `X-Content-Type-Options: nosniff`. Replace-then-delete order; a failed delete doesn't fail the save.
- [AD-14] Address suggestions server-proxied: `POST /api/places/autocomplete` and `POST /api/places/details` call Google Places (New) with `GOOGLE_PLACES_KEY`, require a session and AD-17 checks (2026-10-14, D5: only the JSON `Content-Type` check remains); input <= 120 chars; `placeId` matches `^[A-Za-z0-9_-]{10,300}$`; region codes fixed server-side to US/CA/AU; field mask is a server constant; Places session token server-generated and bound to `sid`; GCP key restricted to Places API (New) with daily quota cap + budget alert; routes return empty suggestions unless `PLACES_ENABLED=1` (manual entry always works); no Google script in the browser; typed text never logged.
- [AD-15] Logging without PHI: server logs only method, upstream path template, status, duration, request id; global error wrapper logs `{requestId, routeTemplate, status, errorName}`; bodies never logged outside `APP_ENV=dev` (where the debug logger redacts tokens/SSN/secrets); 5xx to client never include upstream bodies; no PHI in any app URL except encrypted one-time `lpl` on `/launch`. *(2026-10-14, D1: there is no `APP_ENV`; the debug body logger runs only under local `next dev` (`NODE_ENV=development`, read through `env.ts`), and the encrypted `lpl` appears only on `/auth`. Superseded by D6: server logs never contain bodies, also under `next dev`; the only body logger is the client `logApiCall` in `callApi`, active only when `NODE_ENV === "development"` (read through the shared app-env helper) and redacting SSN-shaped values, MFA `code`, `qrCode` and token-like fields; there is no in-app API Inspector.)* Client telemetry only via `lib/shared/telemetry.ts` (no-op sink) with events `section_save {sectionId, ok, code}` and `save_all {saved, failed}` — no field values or user ids.
- [AD-16] Client-coordinated refresh: on `401 TOKEN_EXPIRED`, `callApi` runs one `POST /api/session/refresh`, single-flighted within the tab (shared promise) and across tabs (`navigator.locks.request("pp-refresh")`), queues and replays other failed calls once. Refresh route returns 200 without calling the IdP if the access token is already valid; otherwise refreshes (`POST <base>/auth/oauth2/token`, `grant_type=refresh_token`), increments `gen`, re-seals with same `sid`. Only IdP rejection (`invalid_grant`/401) → `401 SESSION_EXPIRED` + cookie cleared; network/5xx → 503 `REFRESH_UNAVAILABLE` keeping the session; a replayed call getting `TOKEN_EXPIRED` again = `SESSION_EXPIRED`. Test: 10 concurrent calls across a simulated expiry → exactly 1 upstream refresh. Automatic logoff: cookie carries `iat` and `lastSeen`; server rejects with `401 SESSION_EXPIRED` after 15 min without a user-initiated request or 8 h after launch; client warns 60 s before the idle limit with "Stay signed in"; background polling doesn't count as activity. App-bar "Return to 1health" calls `POST /api/session/logout`, which clears the cookie and revokes tokens upstream (best effort). *(2026-10-14, D3: revocation = server-to-server `POST <apiRoot>/auth/user/logout/all-devices` with the session's Bearer token, `no-store`, 5 s timeout, failures and 401 swallowed and logged without the token; then always 204 clearing `__Host-pp_s`. The refresh `<base>` is the session environment's root from `lib/shared/environments.ts`.)*
- [AD-17] CSRF + per-tab session binding: `app/page.tsx` embeds `sessionBinding = HMAC(SESSION_SECRET, sid)`; `callApi` sends it as `X-PP-Session` on every request (nothing else sets it). Every non-GET to `/api/1h/*`, `/api/places/*`, `/api/session/*`, `/api/pp/*` requires `Sec-Fetch-Site: same-origin` (or `Origin` = `APP_ORIGIN` when absent; 2026-10-14, D1: no `APP_ORIGIN` env var, so this is the request's own origin) and `X-PP-Session`, else 403 `CSRF`; requests with neither header rejected. `X-PP-Session` ≠ `HMAC(SESSION_SECRET, sid)` → 409 `SESSION_CHANGED`; GETs without the header allowed only on `asImage` entries. JSON entries reject non-`application/json` Content-Type; GET handlers have no side effects. *(Superseded 2026-10-14 by D5: no CSRF or session-binding checks — no `Sec-Fetch-Site`/`Origin` check, no `sessionBinding`, no `X-PP-Session`, no 403 `CSRF`, no 409 `SESSION_CHANGED`. Only the 415 JSON `Content-Type` check stays, and `POST /api/session/logout` also accepts GET. Cross-site write protection relies only on `SameSite=Lax`.)*
- [AD-18] PHI never cached: every server fetch to 1health/Google uses `cache: "no-store"`; `app/api/**`, `app/launch/**` (2026-10-14: `app/auth/**` instead, D1), `app/page.tsx` export `dynamic = "force-dynamic"`, `cacheComponents` off; proxy and every BFF route overwrite caching headers with `Cache-Control: private, no-store, max-age=0`, `Pragma: no-cache`, `Vary: Cookie` (incl. images and errors), dropping upstream `Cache-Control`, `Expires`, `ETag`, `Last-Modified`; CI test asserts headers on sample allowlisted routes; no `s-maxage` in config.
- [AD-19] `callApi(context, path, init)` (signature kept) is the only browser transport: adds `X-PP-Session`, runs refresh, returns `ApiResponse<T> = {success, data?, error?, statusCode?, errorCode?, details?}`, parses error bodies once (backend codes like `SOCIAL_SECURITY_NUMBER_EXISTS`, `INVALID_ENUM_VALUE`, or proxy codes). On `SESSION_EXPIRED`/`SESSION_CHANGED` publishes once on `lib/api/session-events.ts`; shell handles `session-expired` (registry writes drafts, then non-dismissable "Your session ended" dialog) and `session-changed` (clear SWR cache, registry and in-memory SSN, write no draft, show "This profile was opened by another account in another tab" + Reload). SWR fetcher/`onError` reuse the same events; no other module opens these dialogs. *(2026-10-14, D5: `callApi` sends no `X-PP-Session`; there is no `SESSION_CHANGED`, `session-changed` event or session-changed dialog; `session-expired` stays.)*
- [AD-20] Deployment/ops envelope (see dedicated block below).
- [AD-21] `proxy.ts` sets on every response a per-request nonce CSP: `default-src 'self'; script-src 'self' 'nonce-<n>' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests` (corrected 2026-10-14: own tab, never framed; plus `X-Frame-Options: DENY` and COOP `same-origin` per spine AD-21), plus `Strict-Transport-Security: max-age=63072000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `Cross-Origin-Opener-Policy: same-origin`; a test asserts them on `/`, `/launch-error` (2026-10-14: `/auth`, D1) and one `/api/1h` route.

**Deployment, CI and test framework setup (AD-20)** *(amended 2026-10-14 by D1/D2/D4)*
- One Vercel project `personal-profile` (replaces the three pinned `personal-profile-dev|demo|prod` projects), whose production deployment serves both `demo` and `prod` (no `dev` environment); its production domain (the app origin) + `/auth` is the launch URL registered in both 1health environments.
- Promotion: PR previews build from the same project; production deploys only by promoting a commit that passed CI.
- Secrets only in Vercel env vars: `ONEHEALTH_SECRET_KEY_DEMO`, `ONEHEALTH_SECRET_KEY_PROD`, `APP_ID_DEMO`, `APP_ID_PROD`, `SESSION_SECRET` (≥ 32 chars; + `SESSION_SECRET_PREVIOUS` during rotation), `GOOGLE_PLACES_KEY`, non-secret `PLACES_ENABLED`, `PP_DISABLED`, `ACCOUNT_DISABLED`; no `NEXT_PUBLIC_*` variables. No `APP_ENV`, `API_ORIGIN`, `APP_ORIGIN`, `PORTAL_URL`, `APP_ID` or `ONEHEALTH_SECRET_KEY`. `_DEMO`/`_PROD` names appear only in `lib/server/env.ts`, its tests, `.env.example` and CI/test fixtures.
- Rotation procedure for `SESSION_SECRET` (overlap unseal), `ONEHEALTH_SECRET_KEY_<ENV>`/`APP_ID_<ENV>` (that environment's registration + Vercel together, redeploy), `GOOGLE_PLACES_KEY` (GCP); rotate on exposure/team change, at least yearly.
- Preview deployments never receive `ONEHEALTH_SECRET_KEY_PROD`/`APP_ID_PROD` (Vercel Production scope only).
- Local dev: `pnpm dev` with `next dev --experimental-https`; open `https://localhost:3000/auth?lpl=<payload>` directly; there is no `/launch/dev` page. *(2026-10-14, D9: the `/auth` manual-entry card also accepts a pasted LPL, in every environment.)*
- CI on every PR: `pnpm lint`, `tsc --noEmit`, Vitest, Playwright (mocked proxy), `next build`; remove `typescript.ignoreBuildErrors`/`eslint.ignoreDuringBuilds`; CI grep fails on `document.cookie`, `access_token` in client files, `NEXT_PUBLIC_*SECRET*`, and `_DEMO`/`_PROD` secret names outside `lib/server/env.ts`, its tests, `.env.example` and CI/test fixtures.
- Test framework: install and configure Vitest + Testing Library + MSW at the `/api` boundary for unit/component tests; Playwright for UJ-1…UJ-5 end-to-end against a mocked proxy. Each Section ships tests for `validate`/`save`/diff; the proxy ships traversal, CSRF, cache-header and refresh-concurrency test tables (AD-2, AD-16–AD-18; 2026-10-14, D5: no CSRF table, a 415 content-type row instead); header test (AD-21); cookie-size test (AD-1).
- Rollback: Vercel instant rollback; incident stop `PP_DISABLED=1` + redeploy makes launch (`/auth`, `/api/token`) and proxy return 503 `SERVICE_DISABLED`; revoke live tokens via `isAllowedForPatients=false`.
- Tooling versions per Stack table: Node 24.x, pnpm 12.x via corepack, iron-session 9.0.1, Vitest 5.0.4, @testing-library/react 16.3.3, MSW 3.0.3, @playwright/test 1.64.0; shadcn/Radix (dialog 1.3.1, label 2.1.17, slot 1.5.0, toast 1.3.1); `signature_pad` wrapped directly (replaces `react-signature-canvas`); TypeScript 7 deferred.

**Conventions that affect every story**
- Naming: hooks `use<Section>`, schemas `<section>Schema`, `lib/api` functions verb-first (`fetchX`, `saveX`, `verifyContactPoints`); owner-id path segments are literal `me`.
- Data formats: dates on the wire `YYYY-MM-DD`, displayed `MM/DD/YYYY`; clearing an optional field sends `"n/a"`; ids are numbers; address request DTO uses `primary`/`validated` while responses use `isPrimary`/`isValidated`.
- Errors: proxy passes upstream 4xx status/body through; proxy-originated codes 400 `BAD_PATH`/`BAD_QUERY`, 403 `NOT_ALLOWED`, 405, 413 `TOO_LARGE`, 415 `UNSUPPORTED_MEDIA`, 401 `TOKEN_EXPIRED`/`SESSION_EXPIRED`, 502 `UPSTREAM_REDIRECT`/`UPSTREAM_ERROR`, 503 `REFRESH_UNAVAILABLE`/`SERVICE_DISABLED`, 504 `UPSTREAM_TIMEOUT`, all `{errorCode, source:"proxy"}` (PA2); unknown codes fall back to a generic Section error with Retry.
- Styling: Tailwind v4 utilities on 1health tokens in `app/globals.css` with DESIGN.md overrides; no hex in components.
- i18n: English only; all strings centralized in `lib/shared/messages.ts`.

**Integration endpoints (addendum §A) to allowlist and wrap in `lib/api` modules**
- `GET /v2/user/myself`; `GET /v2/user/profile-picture/preview?v=`; GraphQL Person→PersonHasProfilePictureFile (server op only); Profile Picture upload `POST /v2/health/type/Person/{personId}/relation/PersonHasProfilePictureFile/file/upload?fileName=&isPublic=true` then `DELETE /v2/file/{oldId}?hardDelete=true`.
- `PUT /v2/user/edit` (partial `PersonalInformationDTO`); `GET /v2/type/key/Person|ContactPoint|Insurance`; `GET /v2/person/{personId}/ssn/expose`.
- Signature: `GET /v2/file/{id}/download`; `POST …/PersonHasSignatureFile/file/upload?isPublic=false`; `POST /v2/file/{id}/version?current=true` (`fileNewVersion`); `DELETE /v2/file/{id}?hardDelete=true`.
- Contact Points: `GET /v2/user/contact-point/list?type=…`; `POST /v2/health/contact-point`; `POST /v2/health/contact-point/verify`.
- Addresses: `GET /v2/person/location/list?page=0&size=100`; `POST /v2/person/location`; `PUT|DELETE /v2/person/location/{id}`; `GET /v2/public/countries`.
- Insurance: `GET /v2/health/patient/insurance?page=0&size=100`; `GET /v2/health/insurance/organizations?name=&page=&size=`; `POST /v2/health/patient/insurance`; `PUT /v2/health/patient/insurance/{id}`; `DELETE /v2/health/insurance/{id}`; card upload `POST /v2/health/type/Insurance/{id}/relation/InsuranceHas{Front|Back}SideCardFile/file/upload?isPublic=false`; card download `GET /v2/health/insurance/{id}/file/{fileId}/download?fileRelKey=…`.

**Notes from measurement (2026-10-13)**
- A real access token is 1,224 bytes (RS256), lifetime 50 min; with an opaque refresh token the sealed cookie is ~2 KB (within the 3,800-byte budget).
- `userId`, `personId`, `username`, `roles` and `organizationId` JWT claims are encrypted; only `tenantId` is plaintext. The launch route must call `GET /v2/user/myself` to obtain `userId`/`personId` and must not decode them from the JWT; tenant check (AD-6) can use the plaintext `tenantId`.

**Go-live preconditions**
- BAA precondition (owner Daniel Garcia): no demo or prod deployment processes real PHI until BAAs are executed with Vercel (functions, logs, any log drain) and Google (Places). `PLACES_ENABLED=1` is set on demo/prod only after the Google BAA. Telemetry/log sinks are added only with a BAA.
- External Application registration per environment (NFR8) is the release dependency; there is no 1health-fe flag (PRC1).
- Demo QA go/no-go by 2026-10-24 (NFR13); minimum alerting (proxy 5xx rate, `SESSION_EXPIRED` after refresh) and log retention to be decided before go/no-go.

**Deferred (not in scope for stories unless re-opened)**
- TypeScript 7; "Last updated" header line (no backing field — dropped); Medical data model (Epic 2); telemetry sink (event shapes fixed, sink needs BAA); monitoring beyond Vercel defaults; server-side session store/distributed lock; rate limits on `ssn/expose` and Places; i18n; source-doc amendments (PRD FR-1, FR-2, NFR-6; EXPERIENCE drafts).

**Open questions that may affect stories**
- Does 1health rotate refresh tokens or detect reuse for `client_id=public-client`? (AD-16 assumes tolerated rotation.) — Daniel Garcia / backend.
- Launch-code replay (no row lock): accept the 60 s window or get a backend fix? — Daniel Garcia / backend.
- ~~Does 1health-fe `?tab=contacts#signature` reach `/launch` with `tab` and fragment intact via the portal?~~ Moot 2026-10-14 (D1: launch is `/auth?lpl=…` and always lands on `/`).
- Custom domain for the `personal-profile` project. — Daniel Garcia.
- ~~Is the dev 1health environment synthetic-data only?~~ Moot 2026-10-14 (D1: no `dev` environment). Is demo synthetic-data only (previews may then hold the `_DEMO` keys)? — Daniel Garcia.
- Registered 1health app name for Personal Profile, needed for the portal login deep link `<portal root>/login?openApp=<app name>` on the `/auth` no-LPL screen (D4); until answered the link opens the portal root. — Daniel Garcia.
- Minimum alerting before demo QA go/no-go; Vercel log retention. — Dev lead.
- Is the 1health backend audit the system of record for SSN expose and Signature changes, or must the proxy emit audit lines to a BAA sink? — Daniel Garcia.
- ~~Whether an upstream token-revoke endpoint exists for `POST /api/session/logout` (best effort otherwise).~~ Resolved 2026-10-14 (D3): `POST <apiRoot>/auth/user/logout/all-devices`, best effort.
- PRD OQ 1 Medical content (Epic 2, PM); PRD OQ 3 Google Places privacy is resolved by AD-14 server proxy + BAA gate.

### UX Design Requirements

**Design tokens and theme**

UX-DR1: Wire all components to 1health Tier 3 tokens from `app/globals.css` via Tailwind utilities (`bg-card`, `text-muted-foreground`, …); no hex or Tailwind palette classes in components (add a lint/CI check), light theme default.
UX-DR2: Link-text override: map all text links to the dedicated `link-text` token (`text-link-text`; #256a8c = info-strong, 5.97:1 on card) instead of `--link` #2f80a8 in light mode; dark mode keeps signal-aqua #8fd8e6.
UX-DR3: Destructive-fill override: destructive buttons fill with the dedicated `destructive-fill` token (`bg-destructive-fill`; #b23a31 = error-strong, white text 5.93:1) instead of `--destructive` #d84f45, in both light and dark mode.
UX-DR4: Control-border override: inputs, selects, Jump to and Signature pad boundaries use #7a8696 (`--status-neutral`, 3.7:1 on card) in light and mist #aeb8c4 in dark, instead of `--input` #e1e8ef; table rules and card hairlines keep `--border`.
UX-DR5: Add tooltip tokens: tooltip graphite #202833 / white text in light, inverted cloud #e6ebf0 / graphite in dark.
UX-DR6: Dark theme via `.dark` class using every `-dark` token in DESIGN.md (background #202833, card #29333f, ring #8fd8e6, `-strong-dark` status variants, control-border-dark #aeb8c4, destructive-fill stays #b23a31); verify listed contrast ratios in both themes.
UX-DR7: Status hues: status text uses `-strong` variants (success-strong Verified, warning-strong Not verified / Unsaved, error-strong errors); base hues only for fills/borders/icons; status always icon + word, never color alone; red only for errors and destructive actions.
UX-DR8: Typography roles on the 1health scale with Inter: profile-name (text-h4, the single page `h1`), section-title (`h2`, text-body 600), cell (14 px), cell-strong (14/500), cell-number (14/600 tabular-nums), column-header (12/600 uppercase 0.06em — the only uppercase), caption, chip, mono-value (SSN), mono-index (index numbers and counts); all inputs 16 px; `tabular-nums` on every table.
UX-DR9: Spacing/shape tokens: 8 px grid; touch-target 44 px, row-read 44, row-header 36, chip-height 22, cell-x 12, cell-edit-y 16, page-gutter 24 / mobile 16, section-gap 32, index-width 200, kv-key-edit 240, control-max 480, breakpoint 768, min-viewport 360; radius sm 6 / md 10 / lg 16 / full per DESIGN.md Shapes (chips square `rounded-sm`, not pill).
UX-DR10: Elevation: page surfaces flat (no shadows on tables, header, insurance cards, Save all bar); `shadow-md` only for tooltip, row menu, Jump to listbox, Save all pill; `shadow-lg` for confirm/picture dialogs, toast, insurance drawer over the `scrim` token (graphite 45 % light, black 60 % dark); `shadow-glow` only for focus.
UX-DR11: Add shadcn primitives Tabs, Tooltip, DropdownMenu, Select, Sheet unchanged, alongside existing Button, Input, Label, Dialog, Toast, Skeleton, Alert in `components/ui/`.
UX-DR12: Report the three design-system deviations (link, destructive, input border) upstream to design-system owners and keep overrides until `globals.css` changes.

**Reusable components (DESIGN.md Components + EXPERIENCE.md Component Patterns)**

UX-DR13: App bar — 52 px card bar with bottom border; "1health" wordmark (`primary-text`, bold; non-interactive `span`, not a tab stop), vertical rule, "Personal Profile" title; right "Return to 1health" link (link-text, external-link icon, 44 px target, underline on hover) that triggers the leave guard when dirty, clears drafts on confirm, calls logout, then navigates the same tab to the session environment's `portalUrl` (D4); always shown (D10).
UX-DR14: Profile header — background band with bottom border; 40 px avatar (initials in primary 600 when no picture), name as `h1` (profile-name), right-aligned primary phone and primary email on desktop only; mobile shows avatar + name only; name refreshes immediately after Personal information save. ("Last updated" meta dropped per architecture Deferred.)
UX-DR15: Avatar button + camera badge — whole avatar is a button with 44x44 hit area and focus ring; 18 px primary camera badge bottom-right with 2 px card ring, shown with and without a picture; click/Enter/Space opens the file picker.
UX-DR16: Change profile picture dialog — 440 px (mobile full width minus 16 px gutters); opens after a file is chosen; title "Change profile picture"; 96 px circular preview + file name (ellipsis) + type · size; "Choose another file" (outline, reopens picker); rules line "JPG, PNG or BMP, up to 6 MB."; Cancel/Save; error state keeps current picture captioned "Current picture · Not changed", error line "{file name} is {size}. Choose a file up to 6 MB.", Save aria-disabled with `aria-describedby` to the error; Save uploads, replaces avatar at once, focus returns to avatar; Escape/Cancel closes without changes.
UX-DR17: Tabs — 44 px tabs, 12 px side padding, active tab foreground 600 with 2 px primary underline overlapping the strip border; shadcn Tabs semantics (arrow keys, Enter/Space, `aria-selected`), updates `?tab=`; leave guard on switching away from dirty Sections; Medical is a normal selectable tab carrying a "Coming soon" tag ("Soon" on mobile).
UX-DR18: Section index (desktop) — sticky 200 px `nav` with three-column items (mono number 01–05, label, mono count of saved entries; blank count for Personal information); active item via scroll-spy with `aria-current="location"`, accent background, 3 px inset primary bar, number/count in primary; activating scrolls (smooth unless reduced motion), focuses the Section `h2`, updates the hash; not shown on Insurance tab.
UX-DR19: Jump to (mobile) — full-width select under the tabs with "Jump to" label, mono number + section name, chevron; listbox styled as row menu; same targets/behavior as the index.
UX-DR20: Section header — 44 px row: `h2` title · count or "Editing" (muted) · right tools: outline "Edit" or "Add phone/email/link/address" with plus icon; Edit puts whole Section into edit mode; Add enters edit mode with one new empty row focused.
UX-DR21: Section table (read) — bordered card container (`rounded-md`, no shadow), muted header row (36 px, column-header type), 44 px body rows with hairline dividers (none on last), accent hover/focus-within; real `<table>` with `th`; columns — Phone: Number · Label · Type · Status · Notifications · actions; Email: Email address · Label · Status · Notifications · actions; Social: Link · actions; Addresses: Address · Label (Primary) · Type · Status · actions; Primary always first; social links open in a new tab via `safeHref`.
UX-DR22: Section table (edit) — container gets primary border + 3 px accent halo; edit-row padding, no hover; immutable saved values render as locked inputs (muted fill, lock icon, help line — e.g. "Locked. This is the address you sign in with." / "Saved addresses can't be changed. Remove it and add a new one."); new rows on background with status "New · not saved"; draft-removed rows struck through, muted, status "Removed on save" + "Restore" link; `tfoot` with "Unsaved changes" indicator (8 px warning dot) left and "Add row" (ghost), Cancel (secondary), Save (primary) right; Escape doesn't cancel; Enter doesn't submit.
UX-DR23: Address edit row — chevron toggle with `aria-expanded`; collapsed 56 px row reusing read columns (one-line address: line 1, line 2, city, state zip, country omitted for default US) · Primary chip · Address Type · Status · Remove; expanded full-width row with header (chevron, "New address" 600, muted "· New · not saved") over a 4-column grid with 16 px gaps: [Address Type][Country][Set as primary checkbox ×2] / [Line 1 ×2][Line 2 ×2] / [City][County][State/Province][Zip]; new addresses open expanded; "Set as primary" checkbox applies on Section save; line 1 suggestions listbox directly under the field with matched text in 600; mobile stacked cards with fields full width; keyboard-open hides the Save all pill.
UX-DR24: Key/value table (Personal information) — read desktop 4 columns (key ~16 % / value ~34 % ×2 with a vertical hairline), no row hover, empty values "Not provided"; mobile read 2 columns (key 44 %); edit desktop 2 columns with 240 px key column (charcoal 500, top-aligned) and controls capped at 480 px with help/error below; edit mobile stacks label above full-width control with hairlines; optional labels "(optional)" suffix (muted 400), required unmarked; fixed field order identical in read and edit, no group headings: Name prefix · First name · Middle name · Last name · Name suffix · Other names · Titles → Birth date · City of birth → Race · Ethnicity · Biological gender · Gender identity · Sexual orientation → SSN → Signature; help copy per Voice and Tone; birth date age-rule help; no email/phone fields.
UX-DR25: Row status badges — Contact Label chip (muted, square); Primary chip (filled primary — the only filled chip); Verified (success-strong check-circle 14 px + "Verified"); Not verified (warning-strong alert-circle + "Not verified"); Verify pending ("Link sent · Resend in 60 s" muted); Home-labeled entries show no verification badge; Notifications plain "On"/"Off" (foreground/muted); insurance precedence Primary → primary chip, others → label chip; Deleted chip; Address Verified uses verified style.
UX-DR26: Row actions + kebab — right-aligned actions cell; desktop inline ghost actions (Verify, Make primary, Edit; 44 px, 14 px text) fade in (150 ms) on hover/focus-within; 44x44 kebab always visible opening a row menu that repeats every action (Verify / Resend verification, Make primary, Edit, Remove) with "Remove" in error-strong text; row-specific accessible names ("More actions for +1 (415) 551-2125"); row "Edit" from read view opens the Section in edit mode focused on that row; Remove from read view switches the Section to edit with the row struck through + Restore.
UX-DR27: Tooltip — graphite surface, white caption text, 6 px radius, 6 px arrow, above the control, elevation-1, one line on desktop (wraps on mobile); opens on hover, keyboard focus and tap; closes on Escape, blur, tap outside.
UX-DR28: Disabled action (aria-disabled pattern) — muted fill, slate text, border, not-allowed cursor; stays focusable with `aria-disabled="true"` and `aria-describedby` → tooltip id; activation is a no-op; used for Make primary, Remove (primary / last entry), Add at limit; every disabled action has a tooltip reason.
UX-DR29: Inputs — 44 px, 16 px text, `rounded-md`, 1 px control-border; error state 2 px error border + error-strong help line with alert icon below, `aria-invalid` and `aria-describedby`; default help text muted; selects same box with chevron; validation on blur and on Save.
UX-DR30: Phone input — country flag + dial code as a leading segment inside the input (libphonenumber-js + custom country picker), US 10-digit validation, duplicate detection before save; flag shown before the number in read cells; cell-number typography.
UX-DR31: Save all bar (desktop) — sticky bottom card bar with top border: warning dot, "{N} unsaved section(s)" (600), muted sub-line naming problems (e.g. "Email has 1 field to fix"), right "Discard all" (secondary, no confirm) + "Save all (N)" (primary); present only while N >= 1; after partial failure remains with N = failed count.
UX-DR32: Save all pill (mobile) — centered floating 44 px pill "Save all (N)" above the bottom edge, elevation-1, Save all only (Discard stays per Section), hidden while the on-screen keyboard is open.
UX-DR33: Inline banner — inside the table container replacing rows; error variant (alert icon, error-strong, "Couldn't load {section} · Retry" link that reloads only that Section); info variant (accent background, info icon) for draft restore and draft conflict.
UX-DR34: Skeleton — three placeholder rows inside the real table container with real column headers, muted bars with shimmer (static under reduced motion); page shell, header frame, tabs and index render immediately.
UX-DR35: Empty states — contact Sections: one row spanning all columns with copy + action link ("No phones yet · Add phone", "No social links yet · Add link") that opens edit with a new row; Insurance: dashed empty card "No insurance on file. Add a policy before your next visit." + primary "Add insurance" opening the editor; Medical: quiet centered muted panel "Coming soon: medications, allergies and conditions will appear here", no action, no API calls.
UX-DR36: Confirm dialog — shadcn Dialog, `rounded-lg`, elevation-2, the `scrim` overlay (D13), `ease-premium` 220–280 ms entrance; title, 1–2 lines body, right-aligned Cancel (secondary) + confirm; focus starts on Cancel, Escape cancels, focus returns to trigger; used for exactly four cases: primary phone/email change (primary button "Make primary"), Remove Signature (destructive "Remove signature"), Delete insurance (destructive "Delete policy"), Turn off authenticator (UX-DR-P12).
UX-DR37: Session expired dialog — confirm anatomy, non-dismissable (no close button, Escape and overlay click do nothing); title "Your session ended", body "Your changes are kept on this device. Relaunch from 1health to continue.", single primary "Return to 1health" with initial focus; edits visible behind the overlay; drafts written before it opens.
UX-DR38: Session changed dialog — "This profile was opened by another account in another tab" with Reload; clears SWR cache, registry and in-memory SSN; no draft written (AD-19). *(Superseded 2026-10-14 by D5: no session binding, so there is no session-changed dialog.)*
UX-DR39: Idle-logoff warning — 60 s before the 15-minute idle limit show "You'll be signed out in 1 minute" with "Stay signed in" (counts as user activity); session also ends 8 h after launch (AD-16 amendment).
UX-DR40: Draft restore banner — per Section info banner "You have unsaved changes from your last visit." with Restore (opens edit with draft) / Discard; only same user, < 24 h.
UX-DR41: Draft conflict compare — inside the conflicted Section under the info banner "This section changed since your draft. Choose which version to keep."; one row per changed field with field name (kv-key) and "Your version" / "Current" columns (column-header type); right-aligned "Use current" (secondary) and "Keep mine" (primary) applying to the whole Section; mobile stacks the two values under the field name, "Your version" first.
UX-DR42: Leave guard — confirm-dialog visuals with title "You have unsaved changes" and three buttons "Keep editing" (secondary, initial focus), "Discard" (outline), "Save" (primary); triggered on tab switch with dirty Sections, app-bar Return to 1health, and closing a dirty Insurance editor; native `beforeunload` prompt on close/reload.
UX-DR43: Card image viewer — shadcn Dialog `rounded-lg`, image fit to viewport on card surface, Front/Back segmented toggle, close button, full-screen on mobile; images via `/api/1h` session URLs; Escape closes and focus returns to the thumbnail.
UX-DR44: Toast — shadcn Toast, bottom-right desktop / bottom-center mobile above the pill; success check icon success-strong ("{Section} saved."); partial failure alert icon warning-strong ("X saved, Y failed"); polite live region; 5 s auto-dismiss paused on hover/focus; error toasts with Retry persist until dismissed; no undo toasts.
UX-DR45: Insurance card — flat bordered `rounded-md` card; title row (min 52 px, bottom hairline) "{Type} Insurance" + precedence chip + kebab (Edit, Delete); body key/value grid (Insurer, Member ID, Group ID, Subscriber, Effective, Expiration, Cancellation; two pairs per row, 40 px rows) left and, behind a left hairline, front/back 120x76 thumbnails with "Front"/"Back" captions (below the grid on mobile); thumbnail opens the viewer; missing image: dashed 120x76 placeholder "Image not uploaded" + "Retry upload" link retrying only the upload; Deleted policy: muted text, Deleted chip, no kebab; cards stack single-column, full width, 16 px apart at every width.
UX-DR46: Insurance editor — desktop right Sheet 480 px full height over scrim with sticky header (title + close) and sticky footer (Cancel + Save), scrolling body; mobile full-screen page with back control, paired fields stacked, Cancel/Save pinned bottom; field order: Insurer → Type + Precedence → demotion notice → Relationship → Member ID + Group ID → Effective + Expiration → Cancellation → Subscriber group (top hairline + section-title heading, shown when relationship ≠ Self, with explanatory copy and subscriber email help) → Card images (front | back); Insurer combobox with row-menu listbox and "Add “{name}”" when not found; demotion inline info banner "Only one primary {Type} policy. Make {insurer} secondary?" + outline button + note "The change saves with this policy."; card slots: chosen file 120:76 preview + name · size + Replace/Remove ghost buttons, empty dashed drop tile "No image chosen" + "Choose {side} image"; dates help copy; save order policy → demoted policy → images; one modal level (confirm may open over the drawer).
UX-DR47: Signature pad — `signature_pad` wrapper, full value-column width capped at 480 px, 160 px tall, background surface, control-border, baseline rule, foreground ink; mouse/touch/pen; accessible name + instructions ("Draw your signature", help "Draw with a mouse, finger or pen, or upload a PNG or JPEG. Saved {date}."); "Clear" (ghost) empties the pad as a draft; "Upload image instead" (ghost, upload icon) accepts PNG/JPEG shown in the pad area; saving an empty pad over a saved Signature triggers the Remove Signature confirm; never drafted; read view shows 112x32 signature thumbnail + "Added {date}".
UX-DR48: SSN reveal — masked value in mono + "Reveal" text button (eye icon, link-text, underlined, 44 px); revealed shows full value + 16 px countdown ring depleting over 30 s + "Hide"; reduced motion replaces the ring with "Hides in 30 s"; auto-hides at 30 s, blur, tab hidden; announces "Social Security number shown, hides in 30 seconds"; edit input auto-formats `XXX-XX-XXXX`, help copy for revealed vs masked states; "This SSN belongs to another person" error.
UX-DR49: Stacked row card (mobile) — each Section table row becomes a block separated by hairlines inside the same container: line 1 value + status, line 2 label chip + type + notifications (muted), kebab right vertically centered; no hover actions; tapping the card body does nothing; edit mode stacks inputs full width in the same card (no bottom sheet); same accessible names as rows.
UX-DR50: Full-page message — centered `rounded-lg` card on background with icon, title, one paragraph, one primary action; invalid launch copy "This link has expired" / "Open Personal Profile again from 1health." / "Return to 1health"; per-reason variants for tenant ("This is available in your personal account…", PA5) and cookies ("Open in a new tab"); no retry of a used payload. *(Superseded 2026-10-14 by D8/D9: no `cookies` variant; `/auth` follows the patient-vault launch UX — client retry, manual LPL entry, "Success!", and an error alert with "Enter LPL Manually", "Switch Environment" and "Go to 1health"; see Story 1.2.)*
UX-DR51: Focus ring — 2 px ring-color outline, 2 px offset, plus `shadow-glow`, on `:focus-visible` for every interactive element; never removed, never trapped outside dialogs.

**Interaction primitives and behaviors**

UX-DR52: Make primary flow — phone/email: read-view action → confirm "This changes how you sign in" (body names the number/email and states the current primary is relabeled Old) → saves that one change immediately (new Primary + old relabeled Old in one request) → toast → Primary listed first, notifications default On; Phone footnote "Changing your primary phone changes how you sign in."; addresses: Make primary from read view saves without confirm.
UX-DR53: Verify flow — read-view action, no confirm; sends link; row shows "Link sent · Resend in 60 s" countdown then "Resend verification"; status updates on next Section refresh; auto-verify of new non-Home mobile/email entries after Section save.
UX-DR54: Draft row removal — in edit mode Remove strikes a saved row and swaps to Restore until Save (no toast, undo or confirm); removing a new unsaved row deletes it outright.
UX-DR55: Explain before failing — every unavailable action is aria-disabled with a tooltip reason (hover, focus, tap): unverified, landline, primary removal, last-entry removal, limit of 20; never hidden, never an error after Save.
UX-DR56: Saving state — Save shows spinner + "Saving…", inputs read-only, Cancel disabled; other Sections stay usable; after save: read view, toast, focus to Section `h2`, draft cleared; failure keeps edit with field/Section error + Retry; network failure copy "Couldn't save {section}. Check your connection." + Retry; no offline queue.
UX-DR57: Keyboard model — tab order page nav (Personal Profile → Account) → Return to 1health → header → tabs → index → Sections in order → Save all; the wordmark is not a tab stop; Tab through cell controls in reading order; Escape in an edit table does not cancel; Enter in an input does not submit the Section.
UX-DR58: Deep links — `?tab={contacts|insurance|medical}#{personal|phone|email|social|addresses|signature}` opens the tab and scrolls to the Section/Signature row; unknown tab → Contacts, unknown hash → top; tab and hash survive refresh.
UX-DR59: Banned patterns enforced in review — no hover-only affordances, bottom-sheet editors, drag-to-reorder, undo toasts for removals, confirm dialogs beyond the four named, or auto-save; Directions A/B not reintroduced.

**Accessibility floor**

UX-DR60: WCAG 2.1 AA across every flow, each completable keyboard-only (automated axe checks + manual keyboard pass per flow).
UX-DR61: Focus management — after Save focus moves to the Section `h2` with toast announced; after a dialog focus returns to the trigger; Save all with errors focuses the first invalid field.
UX-DR62: ARIA semantics — `role=tablist/tab/tabpanel` with `aria-selected`; Section index as `nav` with `aria-current="location"`; real tables with `th`; row-specific action names; polite live regions for toasts and the "Unsaved changes" count; validation errors linked with `aria-invalid` + `aria-describedby`.
UX-DR63: Reduced motion — disables smooth scroll, shimmer, row-action fade and countdown sweep (SSN shows "Hides in 30 s" text).
UX-DR64: 44x44 px minimum targets for every control, including kebab, in-cell buttons, Reveal, tabs and index items.
UX-DR65: Signature accessibility — pad has accessible name and instructions; "Upload image instead" (PNG/JPEG) is the keyboard/screen-reader alternative (amends FR-14 assumption; no typed signature).

**Responsive rules**

UX-DR66: Desktop (>= 768 px) layout — app bar → header band → tab strip → two-column body (sticky 200 px index with right hairline + fluid main column, 24 px padding, 32 px between Sections), sticky Save all bar, Personal information 4-column read, hover actions + kebab, Insurance editor as right drawer.
UX-DR67: Mobile (< 768 px down to 360 px) layout — 16 px gutters; index → Jump to; Personal information read one Field | Value pair per row and edit label-above-control; multi-column tables → stacked row cards with in-place editing; header avatar + name only; Save all → pill hidden with keyboard; Insurance editor full-screen page; insurance thumbnails below grid; picture dialog full width minus 16 px; no horizontal scroll at 360 px (automated check).

**Microcopy**

UX-DR68: Implement `lib/shared/messages.ts` containing every EXPERIENCE.md Voice and Tone string verbatim (disabled-action reasons, footnotes, the three confirm dialogs, locked-email copy, verify pending, validation messages, load error, empty states, Medical, Not provided, unsaved/Save all copy, success and partial toasts, network failure, SSN, Signature, card image failed, leave guard, session expired, draft restore/conflict, invalid launch, optional label suffix, Personal information/SSN/Signature/Address line 1 help, ZIP validation, removed/new row status, profile picture dialog and too-large error, Insurer search and "Add “{name}”", demotion, insurance dates help, Subscriber copy, card image copy), plus architecture-added strings (tenant mismatch, session changed, idle warning, framed session-expired action, open in new tab; 2026-10-14: session changed dropped by D5; framed session-expired action and "Open in a new tab" dropped by D8/D10; `/auth` launch strings added by D9); voice rules: second person, no exclamation marks, no "contact point"/"precedence" in sentences; strings not from mocks/PRD flagged as draft copy for PM review.

**Architecture amendments to UX**

UX-DR69: Framed mode — *(Superseded 2026-10-13/14 by AD-5, D10: never framed; no detection; the original text follows.)* detect `window.self !== window.top`; hide the app-bar "Return to 1health"; session-expired action reads "Close and reopen from 1health" and performs no navigation; launch-error `reason=cookies` offers "Open in a new tab" to `PORTAL_URL`.
UX-DR70: Idle logoff — 15-minute idle / 8-hour absolute session limit surfaced via the UX-DR39 warning and then the session-expired dialog (with drafts written first).

### Resolved Clarifications (2026-10-13, approved by Daniel Garcia)

- **RC1 Environments:** the architecture wins (AD-3). Dev, demo and prod, one environment per deployment, with no referrer detection and no chooser. PRD FR-1/NFR-6 to be amended. *(Superseded 2026-10-14 by D1/D2: demo and prod only, one deployment, environment detected server-side by the decrypting key; still no chooser.)*
- **RC2 Unverified mobile as Primary:** allowed only when no phone is Verified **and** none is Primary (matches today's app).
- **RC3 Notifications toggle:** on the Primary phone and Primary email only. Other rows show "—".
- **RC4 Social "edit":** the value can't change in place, so edit = remove + add in the same save.
- **RC5 Logout:** add `app/api/session/logout`. Revoking upstream is best-effort. *(2026-10-14, D3: via `POST <apiRoot>/auth/user/logout/all-devices`.)*
- **RC6 Idle activity:** user-triggered requests count, plus "Stay signed in" (`POST /api/session/ping`). Background or automatic refetches don't.
- **RC7 Signature upload alternative:** adopted. Uploads are converted to PNG, at most 1 MB. Closes the PRD FR-14 assumption.
- **RC8 "Last updated" header line:** dropped.
- **RC9 Medical copy:** "Coming soon: your medical information will appear here." *(Superseded 2026-10-14, human: use the EXPERIENCE.md Voice & Tone string "Coming soon: medications, allergies and conditions will appear here".)*
- **RC10 Relationship-to-insured options:** from the `/type/key/Insurance` relationship attributes.
- **RC11 Image downscaling:** the browser re-encodes images through a canvas to JPEG (Signature to PNG), stepping quality and size down until the file is at most 4 MB. BMP is converted.
- **RC12 Legacy files:** the first story deletes the uncommitted legacy auth files.

### FR Coverage Map

FR1: Epic 1 - Launch and sign-in
FR2: Epic 1 - Session continuity, expiry, drafts
FR3: Epic 1 - Tab navigation
FR4: Epic 1 - Section edit model
FR5: Epic 1 - Save all
FR6: Epic 1 - Leave protection
FR7: Epic 1 - Feedback and errors
FR8: Epic 1 - Responsive and accessible layout
FR9: Epic 1 - Profile header view
FR10: Epic 1 - Change Profile Picture
FR11: Epic 2 - View personal information
FR12: Epic 2 - Edit personal information
FR13: Epic 2 - SSN entry and reveal
FR14: Epic 2 - Signature
FR15: Epic 3 - View phones
FR16: Epic 3 - Add, relabel, remove phones
FR17: Epic 3 - Verify phones
FR18: Epic 3 - Primary phone
FR19: Epic 3 - Phone notifications
FR20: Epic 3 - View, add, relabel, remove emails
FR21: Epic 3 - Verify emails
FR22: Epic 3 - Primary email
FR23: Epic 3 - Email notifications
FR24: Epic 3 - Social links
FR25: Epic 4 - View addresses
FR26: Epic 4 - Add and edit addresses
FR27: Epic 4 - Primary address and removal
FR28: Epic 5 - View insurance policies
FR29: Epic 5 - Add and edit an insurance policy
FR30: Epic 5 - Delete an insurance policy
FR31: Epic 5 - View card images
FR32: Epic 1 - Medical "Coming soon" placeholder (content: Epic 6, defined later)

FR101: Epic 7 - Route /account and deep-linkable tabs
FR102: Epic 7 - Entry: Apps tile, direct URL, app-bar nav
FR103: Epic 7 - Loading, load-error and no-access states
FR104: Epic 7 - View account settings
FR105: Epic 7 - Edit names and birth date
FR106: Epic 7 - Read-only username and password
FR107: Epic 7 - Switch Primary Email and Phone (parity)
FR108: Epic 7 - Regional preferences
FR109: Epic 7 - Save and partial failure
FR110: Epic 8 - MFA status
FR111: Epic 8 - Link an authenticator app
FR112: Epic 8 - Disable the authenticator app
FR113: Epic 9 - Registration state
FR114: Epic 9 - Search NPIs
FR115: Epic 9 - Register
FR116: Epic 9 - Registered view
FR117: Epic 10 - List and search
FR118: Epic 10 - Organization card
FR119: Epic 10 - Empty states
FR120: Epic 10 - Enter portal (hand-off)
Profile module cross-cutting: PNFR1–PNFR12 apply to Epics 7–10.

Cross-cutting NFRs (apply to every epic): NFR4, NFR10, NFR13, NFR14 (NFR9 superseded 2026-10-13).

## Profile module (/account) — Requirements Inventory

Sources: `prds/prd-profile-account-2026-10-13/prd.md` (FR-101..FR-120, §5 NFRs, §6.3 deltas D1–D10) and `addendum.md` (§A endpoints, §B parity constants, §C implementation notes, §D copy table, §E parity checklist); architecture spine AD-1..AD-26 as updated 2026-10-13; DESIGN.md / EXPERIENCE.md Profile module (/account) sections and mocks `key-account.html`, `key-provider-registration.html`, `key-organizations.html`. Where the PRD and the spine differ, the spine wins (spine "Deferred → Source updates"). "Copy §D" = addendum §D new copy, verbatim; "V&T" = EXPERIENCE.md Voice and Tone, verbatim.

### Functional Requirements

FR numbers match the Profile PRD's FR-1NN ids. Endpoints per FR are in the Profile addendum §A (as amended by AD-2, AD-22, AD-24, AD-25).

**Module shell (PRD §4.1)**

FR101: Route and deep-linkable tabs. The Profile module is the page `/account?tab=personal|provider|organizations`; a missing or unknown `tab` opens Personal Account and normalizes the URL; the active tab is in the URL and survives refresh; tabs use ARIA tab semantics (`tablist`/`tab`/`tabpanel`, `aria-selected`) and work with arrow keys; tab labels are "Personal Account", "Individual Provider Registration", "My Organizations"; switching tabs while Personal account settings is dirty opens the three-way leave guard (keep editing / discard / save, as PP-FR3); the page has no Save all bar or pill (Personal account settings is its only editable Section); hash anchors `#account` and `#authenticator` scroll to their Section, unknown hash → top of tab; launch never lands on `/account` (launch always lands on `/`, AM-1/AD-4) — `/account` is reached in-app or by direct URL with an existing session.

FR102: Entry: portal Apps tile, app-bar navigation, direct URL (Δ D10). No 1health-fe change is made or assumed: the user opens the app from the 1health portal Apps launcher tile "Personal Profile", launch lands on `/`, and the app always runs top-level in its own browser tab; the app bar on both pages carries two destinations, "Personal Profile" (`/`) and "Account" (`/account`), the current one marked `aria-current="page"`; moving between them runs leave protection (PP-FR6) when the current page has unsaved changes, and selecting the current page does nothing; a direct URL `/account?tab=…` (bookmark, refresh, typed) works only with an existing session, otherwise the page redirects to /auth (no login page); a launch arriving in a non-default tenant shows the AD-6 error with module-neutral copy and the app never switches tenant; the 1health-fe user menu (Profile, Provider registration, My organizations) is not rewired and keeps opening legacy `/personal-settings` for every user, including MTA and Customer Support; there is no 1health-fe flag.

FR103: Loading, load-error and no-access states (Δ D4). Each tab and card (Personal account settings, Authenticator app, Healthcare credentials, My Organizations) shows its own skeleton while loading (today the provider tab renders nothing); a non-403 load failure shows "Something went wrong while loading profile information" inline with "Retry" (copy §D) and never an empty form; an upstream 403 shows "You don't have access to this in your current account" (copy §D) on the affected tab or card only, with no raw error and no action, scoped per the AD-23 403 owner table, while other tabs and cards keep working; error rule: show the platform `message` for any 4xx/5xx that has one, otherwise the generic error; proxy-originated `NOT_ALLOWED`/`CSRF` are never shown as "no access" (generic error + Retry, AD-19; 2026-10-14, D5: there is no `CSRF` code).

**Personal account settings (PRD §4.2, tab Personal Account)**

FR104: View account settings (Δ D8). One Section with heading "Personal account settings" (Section id `account`) shows, in today's order, First name, Last name, Username, Password (always `********`), Primary email address, Primary phone number, Birth date (MM/DD/YYYY), Preferred language, Default time zone, Preferred locale for date, time, and currency; values come from `GET v2/user/myself`; Primary email/phone show the user's current Primary values from the user record (phone in the Contacts display format, e.g. "+1 (415) 551-2125"); empty values read "Not provided", including a birth date the platform withholds, a never-set language or time zone, and a birth date that fails the age rule (today "Unknown").

FR105: Edit names and birth date. In edit view (Edit → Cancel/Save, PP-FR4 model), first and last name are required and 1–24 characters after trimming; birth date is required, a valid MM/DD/YYYY date, and the user must be 18–120 years old, or 21–120 when `myself.roles` includes Proctor; the date picker's range enforces the same limits; in edit view only, a "?" icon button "About birth date" next to the Birth date label opens a Tooltip with "Your date of birth is an important identifying factor throughout the healthcare industry. Additionally, 1health requires all users to be over the age of 18."; validation runs on blur and before save; messages follow copy §D verbatim ("First name is required" / "Last name is required", "First name can be up to 24 characters" / "Last name can be up to 24 characters", "Birth date is required", "Enter a date as MM/DD/YYYY", "You must be between 18 and 120 years old" / "You must be between 21 and 120 years old"); the rules come from the shared `lib/shared/person-rules.ts` (AD-11).

FR106: Read-only username and password. In edit view Username and Password render as locked (disabled) fields with help "Your username can't be changed here." and "Password changes aren't available here." (copy §D / V&T); neither is ever sent; there is no password change (parity; `v2/user/update-password` is denied in the proxy).

FR107: Switch Primary Email and Primary Phone (parity transport, AM-4). Primary email address and Primary phone number are Selects: the email Select lists the user's Verified Email Contact Points and the phone Select lists Verified Mobile **and Landline** Contact Points (deliberately different from Contacts, PP-FR18/FR22); the current Primary is always the selected value even when unverified, isn't sent unless changed, and doesn't count as an option; with no other Verified option the Select is aria-disabled and the helper reads "Please add additional verified email(s) in your personal profile to change your current primary contact email" (phone variant "phone(s)"), with "personal profile" an in-app link to `/?tab=contacts#email` (or `#phone`) under the leave guard; on the first change of each Select an inline notice appears under it until Save or Cancel (Δ D5 — today only on the second change): email "Changing your primary email will result in updating your login credentials. The next time you login you will have to use the new email.", phone "Changing your primary phone will result in updating your notification preferences."; there is no confirm dialog; with no Primary phone at all Save shows "Primary phone is required"; the value goes in `PUT v2/user/edit` only when changed (`phoneNumberRegion` always with `phoneNumber`), so the user's own current email is never re-sent (backend R1); the platform relabels the old Primary "Old"; after success the Contact Point keys and header refresh.

FR108: Regional preferences. Options are constants: Language English (`en`); Time zone Hawaiian (`Pacific/Honolulu`), Alaska (`America/Anchorage`), Pacific (`America/Los_Angeles`), Mountain (`America/Denver`), Central (`America/Chicago`), Eastern (`America/New_York`) in `lib/shared/time-zones.ts`; Locale "English - United States" (`en-US`); a stored value not on the list shows its label when known, otherwise the raw code, passes the required check and is sent only if the user picks a new value; a blank language or time zone shows "Select a value" and must be picked before Save, with the field error "Select a preferred language" / "Select a time zone" / "Select a locale" (copy §D); Preferred locale shows "English - United States" when nothing is stored and is sent only when changed; language goes in `PUT user/edit`, time zone via `POST user/time-zone?timeZone=<IANA>`, locale via `POST user/locale?locale=en-US` (never `locale` in `/edit`, backend R2).

FR109: Save and partial failure. Save with no changes shows "There are no changes" and stays in edit view; otherwise only changed fields are sent: names, birth date, language, email and phone in `PUT user/edit` first, then time zone and locale each in their own call, both attempted whatever the other results (AD-7 exception); on full success the toast "Personal account updated successfully" shows, the Section returns to read view, and `myself` and the Email/Mobile/Landline Contact Point keys are refetched (profile header refreshes name, primary phone, primary email); if any call fails the Section stays in edit view and names each failed part ("{Part} was not saved. {platform message}", e.g. "Time zone was not saved."), the parts that succeeded become the new baseline so Save again re-sends only what failed (never an email that already succeeded), and the Section never reports success for a partial save; `SESSION_EXPIRED`/`SESSION_CHANGED` stops the sequence (2026-10-14, D5: `SESSION_EXPIRED` only); the Section's unsaved edits are drafted under `pp:draft:v1:<environment>:<userId>:account` (PP-FR2 rules, UJ-105).

**Authenticator app (PRD §4.3, tab Personal Account)**

FR110: MFA status (Δ D7). The Authenticator app Section (anchor `#authenticator`, heading "Authenticator app", intro "Link an authenticator app to get sign-in codes on your phone.") reads status from `myself.totpEnabled`; when TOTP is enabled the heading shows a check and "Enabled" (copy §D condensation of PRD "Authenticator app enabled", D-UX2) and a "Disable" action; when not, muted "Not set up"; it shows five tiles (Google, Microsoft, Authy, DUO, Android OTP), which are presentational (every tile links the same TOTP factor); while TOTP is enabled the tiles are aria-disabled with the caption and Tooltip "Disable the current authenticator to link another" (today a click silently does nothing).

FR111: Link an authenticator app (Δ D7). Activating a tile calls `POST mfa/enable/totp` exactly once (the app never calls `mfa/enable`/base MFA); while it loads the tile shows a spinner and the other tiles are aria-disabled; if the platform answers that MFA isn't enabled ("Mfa is not enabled for this user." / "Mfa config is missing."), no dialog opens and an inline notice in the Section reads "Your account doesn't have multi-factor authentication turned on, so an authenticator app can't be linked yet. Contact support." with focus moved to it (tiles stay enabled; each activation shows it again); otherwise the dialog "Link your {App} authenticator" opens with the instruction "Use the {App} authenticator app installed on your device to scan this QR, then provide the code generated by the app in the field below.", the QR (alt "QR code to link your authenticator app"), and one labeled "6-digit code" numeric input (`autocomplete="one-time-code"`, `inputmode="numeric"`, digits only, max 6), focus on the code field; Submit with fewer than 6 digits shows inline "Enter the 6-digit code" and sends nothing; the code is validated through `POST /api/pp/mfa/validate` (body `{code}`); a correct code (`true`) closes the dialog, toasts "{App} authenticator linked", refreshes status and focuses the Section `h2`; a wrong code (200 `false`) shows inline "Invalid code. Try again.", clears the input and keeps the dialog open; closing (Cancel/Escape/close) without a correct code leaves TOTP off, refreshes status and returns focus to the tile; each new dialog gets a fresh QR, the QR is never re-requested while the dialog is open, there is no manual secret key, and the QR image is dropped on close; a "Totp is already enabled." answer refetches `myself` and shows the linked state.

FR112: Disable the authenticator app (Δ D2). "Disable" opens a confirmation titled "Turn off authenticator app?" with body "You'll no longer be asked for a code from your authenticator app when you sign in." and buttons "Cancel" and destructive "Turn off"; confirming calls only `POST mfa/disable/totp`, toasts "Authenticator app disabled", refreshes status and focuses the Section `h2`; Cancel/Escape changes nothing and returns focus to "Disable"; base MFA is unchanged (parity).

**Individual Provider Registration (PRD §4.4, tab Individual Provider Registration)**

FR113: Registration state. The single Section "Healthcare credentials" reads the current Provider Registration from `GET v2/user/npi` on tab open, shows a skeleton until it knows which body to render, then shows the search-and-register form (FR114/FR115) when there is no Personal NPI and the read-only Registered view (FR116) otherwise.

FR114: Search NPIs (Δ D1, D9). The instruction reads "Please find your provider and NPI information to continue…"; "Search for your personal NPI number" is required and searches entity type 1 only; "Search for your practice's (hospital, clinic, lab, etc.) NPI Number (optional)" searches entity type 2 only — the app enforces the type (`searchPersonalNpi()`/`searchPracticeNpi()` fix `entityTypeCode`, the platform doesn't); search matches the 10-digit number or names, runs after ~600 ms without typing, returns 10 per page with infinite scroll, and opening an empty field shows the first page; options read individual `"<NPI>, <First> <Last>, <City>, <State>"` and organization `"<NPI>, <Organization name>, <Address line 1>, <City>, <State>"`; a failed search shows "Couldn't load results. Try again." in the dropdown with a retry of the same query (today an empty list); zero results shows the non-selectable row "No matching NPI found"; end of list "No more results"; the header (i) opens a popover: "Registering links your 1health account to your NPI from the national provider registry. Adding your practice's NPI is optional. Once registered, it can't be changed here."; NPI selections are never drafted.

FR115: Register (Δ D9). A missing Personal NPI shows "Personal NPI is required" at the field on blur and on Register; before sending, the app checks `GET health/npi/{npiRecordId}/is-registered` for each selected NPI (record id, not the 10-digit NPI) and, if either is taken, shows under its own field "This personal NPI is already registered. Check that you selected your own." / "This practice NPI is already registered. Check that you selected the right practice." and sends nothing; otherwise it registers straight away with `POST user/register/npi {providerNpiId, practiceNpiId?}` with no confirmation dialog (parity; a Register confirm was rejected); success toasts "Provider NPI registered" or "Provider and practice NPIs registered", swaps to the Registered view and focuses its `h2`; an error shows the platform message, or "There was an error in the registration. Please call 1-888-555-1212 for assistance." when there is none, as an inline error banner inside the Section (not a toast) until the next Register attempt; Register shows "Registering…" and is disabled in flight so a double click sends once; the irreversible POST is never automatically replayed after a 5xx or timeout (AD-16).

FR116: Registered view (Δ D8). Read-only key/value table in today's order: NPI, Taxonomy, Health Information Exchange, Practice name, Practice address, Practice NPI, Licenses, Address of practice (lines 1–2), Signature; "n/a" or -1 reads "Not provided"; Practice name, when the practice is a 1health Organization, is a button that opens an info popover with the practice tenant's support contact (organization name, support phone, support email) from `GET /api/pp/practice-support`, otherwise plain text; below the table exactly one or neither of: info banner "This organization already exists - please contact their support to be added to their portal." when the practice is a 1health Organization the user doesn't belong to (membership via `myself.tenants`), or "Register your practice to enable ordering" when the Practice NPI is verified and not yet claimed by an Organization (`is-registered` on `practiceNpi.id`), which is a Portal hand-off (same tab after the leave guard) to organization creation; Signature shows the image (`GET v2/file/{id}/download`) or "No signature available", followed by a "?" button "About the signature" with Tooltip "The signature can be changed from the Personal Profile" and an in-app link "Personal Profile" to `/?tab=contacts#signature` (leave guard applies); there is no edit or unregister.

**My Organizations (PRD §4.5, tab My Organizations)**

FR117: List and search. The tab lists the user's Organizations from `GET user/organization/portal?name=&page=<0-based>&size=12`; items with `organization == null` are dropped; "Search organizations" filters on the server (name, short name or legal name contains the text, case-insensitive) after a ~500 ms pause and resets to page 1; 12 cards per page sorted by short name (falling back to name) on the client within the page; pagination shows whenever there are results, even a single page, using the server `totalPages`; result changes announce "{N} organizations" politely; a skeleton grid shows while loading and a failure shows the inline load error with Retry.

FR118: Organization card (Δ D6). Each card shows the logo (`/api/pp/org-logo/<tenantId>`), or the Organization's two initials on a neutral tile when there is none or it fails to load; the short name (falling back to the name) on one line with ellipsis, full name in the DOM and a Tooltip; Organization Type icons — at most 4, ordered Lab, Health Provider, Supplier, Go To Market, then the rest alphabetically, then a "+N" chip whose Tooltip and accessible name list the remaining types alphabetically (e.g. "2 more types: Insurance, Population Health"); every type (Health Provider, Healthcare, Lab, Supplier, Go To Market, Population Health, Insurance, Carrier, Manufacturer, Enterprise, Government Agency, n/a) has an icon and Tooltip label, and an unknown type gets a generic icon and never breaks the card (today Population Health crashes it); an (i) button opens the "Primary contact" popover with full name, phone and email, or "-" when there is none, opening on hover, focus or click and closing with Escape; and "Enter portal".

FR119: Empty states. With no organizations (no renderable items on page 0 and no search text — not today's `user.tenants.length <= 1` shortcut) the tab shows an empty card "You aren't managing any organizations yet" / "Register an organization with 1health to unlock the platform features listed below" with today's four feature rows (Lab "Add your tests offered and enable order management."; Healthcare "Order tests, get results, and manage your patients."; Supplier "Provide fulfillment and logistics for collection devices."; Go To Market "Create and sell test products."); "Register organization" opens `https://learnmore.1health.io/product-checkout` (see Ambiguities: new tab vs AD-5); users whose email ends in `@1health.io` or `@tachin.ai` instead get a Portal hand-off to organization creation, plus a "Create new organization" button next to search; search text with zero results shows "Sorry, no results were found" with no pagination.

FR120: Enter portal (Portal hand-off). "Enter portal" ("Enter portal for {name}") opens the 1health portal in that Organization's context through `/handoff/portal?to=tenant&tenantId=<n>`; the URL is built only from the configured portal URL plus a numeric tenant id, never from response data such as `subdomain` (candidate `<portalUrl>/?ctx=<tenantId>`, OQ1; fallback the portal root); the app never calls `v2/user/switch-tenant` (backend R7); the app is top-level, so the hand-off navigates the same tab after leave protection (no framed or new-tab branch), does not log out and keeps drafts; "Enter portal" is aria-disabled with "You're disabled in this organization" when `enabledInTenant` is false.

### NonFunctional Requirements

PNFR1: Security and privacy. MFA QR codes, MFA verification codes and NPI selections are never stored in drafts, SWR or any cache, client storage, logs, URLs or telemetry; the QR data URI lives only in the dialog's component state and is dropped on close and `pagehide`; the MFA code travels only in a POST body to `/api/pp/mfa/validate` and the debug logger redacts `qrCode` and `code`; turning off the authenticator always asks for confirmation; `tenant/sys-config` is called only server-side with the practice tenant id from the user's own registration (AD-25); organization logos are fetched server-side without credentials and only from the session environment's `publicFilesOrigin` (`lib/shared/environments.ts`, D7; AD-24); the only app URLs carrying user-typed text are NPI/organization `searchText` (public directory names); all NFR1 rules (sealed cookie, proxy-only 1health access, CSP, no PHI in logs) apply unchanged to `/account`.

PNFR2: Accessibility. WCAG 2.1 AA on every `/account` flow, each completable keyboard-only (axe + manual keyboard pass per flow); tabs, comboboxes, popovers and dialogs work with the keyboard; focus is trapped in dialogs and returned on close; icon-only controls have accessible names; reduced motion is respected; 44 × 44 px minimum targets.

PNFR3: Performance. Each `/account` tab's first content renders within 1.5 s on demo over broadband; NPI search and organization search/typeahead return within 1 s at p75; a tab's data loads only when the tab is opened (no prefetch), and `/` and `/account` share one SWR cache so switching pages doesn't refetch fresh data.

PNFR4: Responsive. Works from 360 px with no horizontal scroll; the organization grid shows 4 / 3 / 2 / 1 columns (≥ 1280 / ≥ 1024 / ≥ 640 / below); MFA tiles wrap (one row of five ≥ 768 px, 3-column grid below); below 768 px the Link authenticator (QR) dialog is full-screen and is the only `/account` dialog that is; confirm dialogs (incl. Disable authenticator) stay centered with 16 px gutters.

PNFR5: Design system. Semantic 1health tokens only (`docs/DESIGN-SYSTEM.md`, DESIGN.md incl. the Ledger overrides); no hex or palette classes in components; third-party authenticator vendor logos are the only non-token colors; the QR sits on the `qr-surface` white token in both themes.

PNFR6: Copy. English only; every Profile-module string is a key in `lib/shared/messages.ts`, verbatim from addendum §D and EXPERIENCE.md Voice and Tone (Profile rows); copy not from those sources is flagged as draft copy for PM review.

PNFR7: Release and timeline. Same as NFR13: all Profile scope ships in release 2026.07.01 "Conduit" on 2026-10-29; code freeze 2026-10-22; demo QA sign-off by 2026-10-24, where SM-101 (every addendum §E parity-checklist row passes on demo, top-level in its own tab) is the go/no-go.

PNFR8: Rollout and rollback. No 1health-fe changes and no 1health-fe flag: entry is the existing portal Apps tile and the user menu keeps opening legacy `/personal-settings`, which stays untouched as the fallback; rollback is Vercel instant rollback, `PP_DISABLED=1` (whole app) or `ACCOUNT_DISABLED=1` (only `/account`, `/handoff/**`, `/api/pp/{mfa,org-logo,practice-support}/**` and the Profile allowlist entries return 503 `SERVICE_DISABLED`) + redeploy; live tokens are ended by `isAllowedForPatients=false`.

PNFR9: Entry, hosting and browsers. Users reach `/account` via the portal Apps tile → `/` → app-bar "Account", or by direct URL with a session; the app always runs top-level in its own tab and is never framed (no framed detection or branches); latest two Chrome, Edge, Safari, Firefox, plus iOS Safari and Android Chrome.

PNFR10: Platform dependencies. OQ1 (portal URL that opens tenant X, candidate `<portalUrl>/?ctx=<tenantId>`) answered by 2026-10-17, otherwise Enter portal opens the resolved environment's `portalUrl` root (D4) (R-A, known degradation); OQ2 (every launching user holds Patient functionality in the default tenant, and whether all users have base MFA) verified on demo by 2026-10-20, otherwise the FR103 no-access and FR111 base-MFA-off messages carry it; each environment's `publicFilesOrigin` (demo/prod origin of `tenantLogo.publicUrl`) is filled in `lib/shared/environments.ts`; until then logos 404 and cards show initials; verify on demo that changing the login email via `PUT user/edit` keeps current tokens valid (else the success path ends in `SESSION_EXPIRED`).

PNFR11: Reliability. A load or save failure in one `/account` tab or card never blocks the others (403 and load errors are scoped per FR103 / AD-23 owner table); Personal account settings partial failure is honest (FR109).

PNFR12: Success-metric and test constraints. SM-101 parity checklist (addendum §E rows 1–13) is automated in Playwright against a mocked proxy for UJ-101..UJ-105, top-level only; SM-103 is observable via the PHI-free telemetry event `mfa_link {ok, attempt}` (sink still deferred); SM-104 Enter portal opens the right tenant in 100% of QA runs; SM-C101: the already-registered checks and NPI type enforcement are never weakened.

### Additional Requirements (Architecture)

**Structural seed (AM-1).** Add `app/account/page.tsx` (server component: `requireSession()`, embeds `sessionBinding` (2026-10-14: dropped by D5), `dynamic = "force-dynamic"`), `app/handoff/portal/route.ts`, `app/api/pp/mfa/validate/route.ts`, `app/api/pp/org-logo/[tenantId]/route.ts`, `app/api/pp/practice-support/route.ts`; feature folders `features/account`, `features/mfa`, `features/provider`, `features/organizations`; client modules `lib/api/{account,mfa,npi,organizations,myself}.ts`; shared `lib/shared/{person-rules,time-zones,profile-constants}.ts`; `app/layout.tsx` holds the single root `SWRConfig` and the shared app bar.

- [AD-2 allowlist] Add passthrough entries (METHOD + template) exactly for: `GET v2/user/myself` (exists); `GET v2/user/contact-point/list` (exists; `type` repeatable, each ∈ `Email|Mobile|Landline` plus the PP types); `PUT v2/user/edit` (exists; body schema accepts `email`, `phoneNumber`, `phoneNumberRegion`, rejects `locale`); `POST v2/user/time-zone` (`timeZone` ∈ the six IANA ids in `lib/shared/time-zones.ts`); `POST v2/user/locale` (`locale` = `en-US` only); `POST v2/mfa/enable/totp`; `POST v2/mfa/disable/totp`; `GET v2/user/npi`; `GET v2/public/npi/list` (`entityTypeCode` `1|2`, `searchText` ≤ 100 chars, `page` `^\d{1,4}$`, `limit` ≤ 10); `GET v2/health/npi/{n}/is-registered`; `POST v2/user/register/npi` (JSON `{providerNpiId, practiceNpiId?}` numeric); `GET v2/user/organization/portal` (`name` ≤ 100 chars, `page` `^\d{1,4}$`, `size` ≤ 12); `GET v2/file/{n}/download` (exists, `asImage`, `preview=true` forced) for the registered-view signature. Each entry lands in the story that first uses it.
- [AD-2 denies] Exact `METHOD + template` denies (prefix only for `/**`; `<n>` = `^\d{1,19}$`; `*` = any method): `* /auth/**`, `* v2/public/external-application/**`, admin prefixes, `POST v2/mfa/enable`, `POST v2/mfa/disable`, `* v2/mfa/enable/<n>`, `* v2/mfa/disable/<n>`, `* v2/mfa/validate/<n>`, `* v2/user/switch-tenant/**`, `* v2/user/update-password`, `* v2/tenant/sys-config`; `v2/mfa/validate` and `tenant/sys-config` are not passthrough entries. Proxy test rows: `POST v2/mfa/enable/totp` and `POST v2/mfa/disable/totp` → allowed; `POST v2/mfa/enable` → 403; `POST v2/mfa/enable/123` → 403; `GET v2/mfa/validate/123` → 403.
- [AD-2 named op] `POST /api/pp/mfa/validate`: session required, AD-17 CSRF + `X-PP-Session` (2026-10-14, D5: dropped; only the JSON `Content-Type` check), JSON body `{ "code": "<6 digits>" }` matching `^\d{6}$` (else 400), server moves it into upstream `v2/mfa/validate?code=`; returns the upstream boolean; no code in any app URL or log.
- [AD-24 named op] `GET /api/pp/org-logo/{tenantId}`: session required, `tenantId` `^\d{1,19}$`; server reads the user's org list (`GET v2/user/organization/portal`, server paging, stop at match, ≤ 5 pages of 50), not a member → 404; requires `new URL(tenantLogo.publicUrl).origin` to equal the session environment's `publicFilesOrigin` (`lib/shared/environments.ts`, D7); fetch with no credentials/cookies, `redirect: "manual"` (3xx → 404), 5 s timeout, 512 KB cap (Content-Length and while reading), `cache: "no-store"`; serves only PNG/JPEG/WebP with matching magic bytes (SVG/other → 404), `Content-Type` from bytes, `Content-Disposition: inline`, `nosniff`, AD-18 headers; any failure → 404 `{errorCode:"NO_LOGO", source:"proxy"}`; `<img onError>` → initials tile; CSP `img-src` stays `'self' blob: data:` (the AD-21 value, unchanged; D7); `v2/file/{id}/download` never used for logos; GET without `X-PP-Session` allowed (2026-10-14, D5: no `X-PP-Session` exists). Tests: host, redirect, size and magic-byte rows.
- [AD-25 named op] `GET /api/pp/practice-support`: session required, reads `v2/user/npi` server-side, takes `practiceNpi.organization.tenantId` (absent → 404), calls `v2/tenant/sys-config` with exactly `Tenant%20IDs=<id>&includeAllRelations=true`, returns only `{ name?, phone?, phoneRegion?, email? }`; SWR key `["pp","practice-support"]`; its 403 scopes only the Practice-name popover.
- [AD-22 hand-off] `GET /handoff/portal?to=tenant&tenantId=<n>` | `?to=create-org`: validates `to` enum and `tenantId` `^\d{1,19}$` (else 303 to `portalUrl`, resolved per D4: the session's environment if it unseals, else the `onehealth_environment` cookie, else `prod`, from `lib/shared/environments.ts`, never an env var or URL parameter); answers `seeOther()` (303, absolute) to `<portalUrl>/?ctx=<n>` (candidate, OQ1) or `<portalUrl origin>/organizations/create`; no other query param ever (never `assume`); session-less by design (no `requireSession()`; `proxy.ts` exempts `/handoff/**` from the no-session redirect), no side effects; no logout, drafts kept; triggered only via the shell `navigate()`; Enter portal is a link only when `enabledInTenant = true`, else aria-disabled.
- [AD-3] `lib/server/env.ts` exports `PORTAL_URL` and `PUBLIC_FILES_ORIGIN` (per-environment env var; boot fails if missing); `PORTAL_ORIGIN` no longer exists; client code reads only `NEXT_PUBLIC_APP_ENV`. *(Superseded 2026-10-14 by D1/D4: no `PORTAL_URL` env var and no `NEXT_PUBLIC_APP_ENV`; the portal URL per environment is a constant in `lib/shared/environments.ts`. Because one deployment serves both environments, `PUBLIC_FILES_ORIGIN` also moves into that map as a per-environment `publicFilesOrigin` (values still open).)*
- [AD-4] Launch always lands on `/` (no `view` param); `proxy.ts` 307-redirects any path carrying `lpl` (incl. `/account`) to `/launch`; `/account` with no session renders the launch-error screen; redirects use `lib/server/http.ts#seeOther()` with absolute `Location` from `APP_ORIGIN` + enum path/query; `NextResponse.redirect` banned in `app/launch/**` and `app/handoff/**` (lint). *(Superseded 2026-10-14 by D1: the launch is `/auth?lpl=…` → `POST /api/token` → `/`; no `proxy.ts` `lpl` redirect, no `/launch*` routes; `/account` with no session redirects to `/auth`; `seeOther()` stays for `/handoff/**` (absolute portal `Location`), and the lint ban covers `app/handoff/**`.)*
- [AD-5] Top-level only: `frame-ancestors 'none'` + `X-Frame-Options: DENY` on every response incl. `/account` and `/handoff/portal`; no framed detection, no `postMessage`, no `target=_blank` anywhere; hand-offs and Return to 1health are same-tab.
- [AD-6] Tenant mismatch → `/launch-error?reason=tenant` with one module-neutral copy on both pages. *(2026-10-14, D1: shown on `/auth` after `/api/token` answers `WRONG_TENANT`.)*
- [AD-7] One `SectionRegistry` per page; `/account` registers only `account` (displayOrder 1); Authenticator app (anchor `authenticator`), Healthcare credentials and My Organizations are not registry Sections (no dirty state, no drafts); typed enums `ProfileTab` (`contacts|insurance|medical`), `AccountTab` (`personal|provider|organizations`), `SectionId`; account `save()` runs `PUT user/edit` (dirty only) then `POST user/time-zone` and `POST user/locale` (each only if dirty), both attempted regardless, resolving `{ ok:false, error:{ failedParts: ("details"|"timeZone"|"locale")[] } }` on any failure and re-baselining each succeeded part; `SESSION_EXPIRED`/`SESSION_CHANGED` stops the sequence (2026-10-14, D5: `SESSION_EXPIRED` only); `save()` never throws.
- [AD-8] Save all and `SAVE_ORDER` exist only on `/`; `/account` has no Save all bar/pill.
- [AD-9 exception] `lib/api/account.ts#updateAccount()` is the sole builder of `email`, `phoneNumber`, `phoneNumberRegion` for `PUT v2/user/edit`: only when changed, only values from Verified Email / Mobile / Landline Contact Points, `phoneNumberRegion` always with `phoneNumber`; the Personal-information payload type omits the three fields; ESLint `no-restricted-imports` allows `updateAccount` only in `features/account`.
- [AD-10] Keys from `lib/api/keys.ts`, all prefixed `"pp"`: `keys.myself()` = `["pp","myself"]`; `keys.contactPoints(type)` = `["pp","contact-points",type]` per single type (`Email`, `Mobile`, `Landline`, …), shared by Contacts and the `/account` pickers (multi-type reads compose per-type keys); `["pp","npi"]`, `["pp","orgs",name,page]`, `["pp","practice-support"]`; one root `SWRConfig` so `/` and `/account` share one cache; Account settings save mutates `myself` and `contactPoints("Email"|"Mobile"|"Landline")`; tab keys load only when the tab opens; MFA QR/codes never in SWR.
- [AD-11] `lib/shared/person-rules.ts` holds the shared first/last name (1–24 chars after trim) and birth-date age (18–120, 21–120 for Proctor via `myself.roles`) rules, imported by `features/personal` and `features/account`; no schema redefines them; `features/account/schema.ts` (zod 4) + one `useForm`; messages are `messages.ts` keys; backend error → field mapping only in `lib/api/errors.ts`.
- [AD-12] Draft key `pp:draft:v1:<environment>:<userId>:account`, `draftFields` = the account form fields only (never MFA codes, QR or NPI selections); `baseHash` = hash of the server values of exactly the Section's `draftFields` (from `myself` / contact-point keys), so an edit on either page invalidates the other page's draft of shared fields; purge is user-wide via `drafts.purgeUser(userId)` (`pp:draft:v1:<environment>:<userId>:*`) on app-bar Return to 1health (after guard) and on `SESSION_CHANGED` (2026-10-14: dropped by D5); drafts kept on session-expired Return and on portal hand-offs.
- [AD-15] Server logs carry method, upstream path template, status, duration, request id only — never query strings; debug logger (dev only) redacts at least `qrCode`, `code`, `ssn`, tokens, file bodies (2026-10-14, D6: this is the client `logApiCall`; server logs never contain bodies); telemetry adds `mfa_link {ok, attempt}` (no values, no ids).
- [AD-16] Non-GETs (`register/npi`, `mfa/*`, `user/edit`, `time-zone`, `locale`) are replayed only after a proxy-originated `TOKEN_EXPIRED`, never after a 5xx or timeout; hand-offs do not call logout.
- [AD-17] `app/account/page.tsx` embeds `sessionBinding`; all `/api/pp/*` non-GETs require same-origin + `X-PP-Session`; GETs without the header allowed only on `asImage` entries and `GET /api/pp/org-logo/*`; `/handoff/portal` GET has no side effects. *(Superseded 2026-10-14 by D5: no `sessionBinding`, same-origin or `X-PP-Session` checks; `/api/pp/*` JSON routes keep the 415 `Content-Type` check; `/handoff/portal` GET still has no side effects.)*
- [AD-18] `app/account/page.tsx`, `app/handoff/**`, `app/api/pp/**` export `force-dynamic`; every fetch to 1health and to the session environment's `publicFilesOrigin` (`lib/shared/environments.ts`, D7) is `no-store`; CI asserts no-store headers on `/account`, `/handoff/portal`, `/api/pp/org-logo/1`.
- [AD-19] `ApiResponse<T>` gains `upstreamCode`; BFF errors are `{errorCode:"<STRING>", source:"proxy"}`, upstream errors pass through as `{message, code:<int>}` (integer → `upstreamCode`, `errors.ts` derives `errorCode`); session signals branch on `errorCode` only; `FORBIDDEN` = status 403 without `source:"proxy"` (upstream only) → no-access panel; proxy `NOT_ALLOWED`/`CSRF` → generic error + Retry, never "no access" (2026-10-14, D5: no `CSRF` code); `errors.ts` exact-message table: "Mfa is not enabled for this user." / "Mfa config is missing." → `MFA_NOT_ENABLED`; "Totp is already enabled." → `TOTP_ALREADY_ENABLED` (refetch `myself`, linked state); `PERSONAL_NPI_IS_ALREADY_REGISTERED` / `PRACTICE_NPI_IS_ALREADY_REGISTERED` prefixes → `NPI_ALREADY_REGISTERED`; nothing else matches message text.
- [AD-20] `ACCOUNT_DISABLED=1` makes `/account`, `/handoff/**`, `/api/pp/{mfa,org-logo,practice-support}/**` and the Profile allowlist entries return 503 `SERVICE_DISABLED`; Vercel env per project adds non-secret `PORTAL_URL`, `PUBLIC_FILES_ORIGIN`, `ACCOUNT_DISABLED`. *(2026-10-14, D1/D4: only `ACCOUNT_DISABLED` is added; portal URL and public-files origin are per-environment constants in `lib/shared/environments.ts`.)*
- [AD-21] Header test also covers `/account` and `/handoff/portal`: CSP with `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin`, HSTS, nosniff, Referrer-Policy, Permissions-Policy.
- [AD-23 MFA] Linking calls only `POST mfa/enable/totp` then `POST /api/pp/mfa/validate`; disabling only `POST mfa/disable/totp`; validate 200 `false` = invalid code, not an error; status from `myself.mfaEnabled`/`totpEnabled`, refetched after close; `enable/totp` called once per dialog open from the tile's click handler (never a mount effect), guarded by an in-flight ref (double-click no-op), dialog renders only the latest QR, no automatic retry or Retry button re-issues it while open.
- [AD-23 NPI] `lib/api/npi.ts` exposes `searchPersonalNpi()` (`entityTypeCode=1`) and `searchPracticeNpi()` (`2`); components never pass the type; register sends record ids after `is-registered` on both; Register disabled in flight; "Register your practice" check uses `practiceNpi.id` from `user/npi`.
- [AD-23 membership] Practice membership single source = `myself.tenants`, computed only by `lib/api/myself.ts#isTenantMember(myself, tenantId)`; `features/provider` calls it with `practiceNpi.organization.tenantId`; the org list is never used for membership; support contact only from AD-25.
- [AD-23 organizations] Fetch `size=12`; drop `organization == null`; sort by `shortOrganizationName ?? name` within the page; empty state = no renderable items on page 0 with no search text; pager uses server `totalPages`; internal domains (`@1health.io`, `@tachin.ai`) and checkout URL in `lib/shared/profile-constants.ts`.
- [AD-23 403 owner table] Upstream `FORBIDDEN` only: `contact-point/list` → Account Section's email/phone pickers only; `mfa/*`, `/api/pp/mfa/validate` → Authenticator app card; `user/npi`, `public/npi/list`, `user/register/npi` → Provider tab; `user/organization/portal` → Organizations tab; `/api/pp/practice-support` → Practice-name popover only; other tabs and cards keep working.
- [AD-26] `features/shell/navigate.ts` exports `navigate(target)` with `target` = `{page:"profile", tab?, hash?} | {page:"account", tab?, hash?} | {external:"portal"|"handoff", href}`; runs the current page's leave guard (three-way dialog), then `/` ↔ `/account` via `router.push` (shared SWR cache kept) or external via same-tab `location.assign` (Return also does AD-12 purge + AD-16 logout); app bar has two destinations "Personal Profile" and "Account"; `next/link` and raw `<a href>` to `/`, `/account`, `/handoff/**` or `PORTAL_URL` (2026-10-14: any portal URL from `lib/shared/environments.ts`, D4) are banned outside `features/shell` (lint); `beforeunload` covers only browser-initiated unloads.
- [Testing] Vitest + MSW for `features/account` validate/save/diff (incl. partial-failure rebase and never re-sending a succeeded email), MFA single-flight, NPI type locking; proxy denylist table rows above; `/api/pp/org-logo` host/redirect/size/magic-byte rows; Playwright UJ-101..UJ-105 + addendum §E parity checklist against a mocked proxy, top-level only; E2E fixtures may reuse `1health-fe/e2e/fixtures/account-settings-data.ts` payloads.
- [Open questions] Portal URL per tenant (platform, 2026-10-17); Patient functionality in default tenant (2026-10-20); `publicFilesOrigin` values per environment for the `lib/shared/environments.ts` map (dev lead); token validity after login-email change (dev lead, verify on demo).

### UX Design Requirements

**Tokens and shared shell**

UX-DR-P1: Add token `qr-surface` = #ffffff in both themes (QR always on white so scanners read it); Organization Type icons, initials tile and (i) icon buttons use `muted-foreground`, never Tier-1 `slate` (2.09:1 on card-dark fails 1.4.11); verify the Profile contrast table in both themes: type/(i) icon on card 6.1:1 / 6.4:1; initials on tile 5.4:1 / 5.7:1; pagination current page 13.1:1 / 9.5:1; MFA tile label on hover 13.5:1 / 9.6:1; "+N" chip text 11.4:1 / 10.7:1; "Disable" error-strong on card 5.9:1 / 5.3:1; inactive MFA tile at 0.55 opacity exempt (aria-disabled with textual reason).
UX-DR-P2: App bar page nav (`app-nav-item` / `app-nav-item-active`), identical on `/` and `/account`: after the wordmark and a 1 px rule, a `nav` labeled "Pages" with "Personal Profile" (`/`) and "Account" (`/account`) as 44 px text items (section-title type, muted foreground, accent hover, `rounded-md`); active item foreground 600 with a 2 px primary bottom indicator and `aria-current="page"`; selecting the other page runs the leave guard when dirty, selecting the current page does nothing; items navigate via the shell `navigate()`; "Return to 1health" always shows (never framed); mobile < 768 px: compact segmented control in the bar with 44 px targets, wrapping onto a second row under the wordmark below 400 px. Replaces the bar title "Personal Profile".
UX-DR-P3: `/account` page frame: same app bar (Account active) and same profile header component (refreshes after an Account settings save); tab strip (`tab` tokens) with "Personal Account", "Individual Provider Registration", "My Organizations"; no section index or Jump to; single-column main; on mobile the strip scrolls horizontally, keeps every tab reachable by arrow keys, scrolls the selected tab into view, and carries no "Soon" tag.
UX-DR-P4: `button-outline-destructive` (card background, border, error-strong text, muted hover, `rounded-md`, 44 px) used for the Authenticator "Disable" action.
UX-DR-P5: `info-icon-button` (44 px target, 18 px icon, muted-foreground, muted hover, `rounded-md`): used for the provider (i), organization card (i), and the "?" help buttons (circle-help) for Birth date ("About birth date") and registered-view Signature ("About the signature"); each has an accessible name.

**Personal Account tab**

UX-DR-P6: Account settings read view (key/value table, PM2): heading "Personal account settings" (D-UX3); desktop four columns key | value | key | value filled row by row: First name · Last name / Username · Password / Primary email address · Primary phone number / Birth date · Preferred language / Default time zone · Preferred locale for date, time, and currency; Password `********` in mono-value; phone in the Contacts display format; empty values "Not provided" (PM3); labels per V&T (PM1); mobile one Field | Value pair per row.
UX-DR-P7: Account settings edit view: Field | Value, controls capped at 480 px; Username and Password as `input-locked` with help lines (D-UX4); Primary email/phone as Selects (aria-disabled + helper `help-text` with link-text in-app link when no other Verified option); Birth date a masked MM/DD/YYYY input with trailing calendar button; Birth date "?" `info-icon-button` right after the label, edit view only, Tooltip wraps (max 320 px), opens on hover, focus, tap, closes on Escape (D-UX1); first-change notice as `inline-banner-info` under its Select until Save/Cancel; tfoot with "Unsaved changes" indicator left and Cancel + Save right (PM4); no Save all; saving state spinner + "Saving…"; after save focus to the Section `h2`.
UX-DR-P8: `mfa-tile` (112 px square, card, border, `rounded-md`, 48 px vendor logo centered, name in cell-strong; hover `table-row-hover` fill; focus ring) and `mfa-tile-inactive` (opacity 0.55, not-allowed, aria-disabled): Authenticator app Section header "Authenticator app" with status right — linked: `status-verified` "Enabled" (PM5, D-UX2) + "Disable"; not linked: muted "Not set up"; body: one muted intro line then five tiles named "Link {App}" (vendor logos decorative); linked: tiles inactive with caption "Disable the current authenticator to link another" under the row and as each tile's Tooltip/`aria-describedby` reason.
UX-DR-P9: Tile behavior: activating a tile requests a QR once; while loading the tile shows a spinner and the other tiles are aria-disabled; base-MFA-off: `inline-banner-info` above the tiles with the V&T message, focus moves to it, tiles stay enabled, each activation re-shows it; no dialog.
UX-DR-P10: `qr-dialog` (440 px, popover bg, `rounded-lg`, elevation-2, Confirm dialog anatomy): title "Link your {App} authenticator", instruction paragraph, 184 px QR on `qr-surface` inside a 1 px border frame, centered, alt "QR code to link your authenticator app"; QR loading = 184 px skeleton square; label "6-digit code" + `otp-input` (44 px tall, 200 px wide, mono-value, 0.3em tracking, no placeholder); inline `help-text-error` under the field linked via `aria-describedby` and announced; footer Cancel (secondary) + Submit (primary, spinner while validating, always enabled); focus starts on the code field, trapped, returns to the tile on close (to the Section `h2` on success); below 768 px full-screen sheet with header title + 44 px close, scrolling body, Cancel + Submit pinned to the bottom.
UX-DR-P11: `otp-input` behavior: single field, `inputmode="numeric"`, `autocomplete="one-time-code"`, digits only, max 6; < 6 digits → "Enter the 6-digit code", no request; wrong → "Invalid code. Try again.", field cleared, focus stays.
UX-DR-P12: Disable authenticator confirm: Confirm dialog with destructive (`destructive-fill`) "Turn off" and secondary "Cancel", focus starts on Cancel; stays centered with 16 px gutters below 768 px (D-UX8); after Turn off focus moves to the Section `h2` (Disable is gone); Cancel/Escape returns focus to "Disable". The app's confirm set is now four: primary email/phone change (Contacts), Remove Signature, Delete insurance, Turn off authenticator; Account settings' primary change uses the inline notice, not a confirm.

**Individual Provider Registration tab**

UX-DR-P13: Healthcare credentials Section: header "Healthcare credentials" + (i) `info-icon-button` opening the provider `info-popover`; unregistered body: instruction line (body 500) · two NPI comboboxes stacked, full main-column width capped at 720 px, 16 px apart · right-aligned primary "Register"; registration error as `inline-banner-error` under the instruction line, above the comboboxes, kept until the next Register (D-UX6), not a toast; skeleton: two input-height bars.
UX-DR-P14: NPI combobox visual: labels per V&T (personal: required, no marker; practice: "(optional)"), placeholder "Search by NPI or name", `input` with leading search icon and trailing clear (×); listbox in `row-menu` styling; each option a `combobox-option` (52 px; line 1 NPI in mono-value + name in cell-strong; line 2 city, state — with address line 1 for practices — in muted caption); loading row spinner + "Searching…"; error row alert icon + "Couldn't load results." + link-styled button "Try again."; end of list muted "No more results"; zero results single non-selectable muted row "No matching NPI found" (D-UX5); field errors `help-text-error` under their own field.
UX-DR-P15: NPI combobox behavior/a11y: WAI-ARIA combobox (`aria-expanded`, `aria-controls`, `aria-activedescendant`) with listbox popup; opens on focus or typing (empty → first page); 600 ms debounce; 10 per page, infinite scroll; arrow keys move, Enter selects, Escape closes, × clears; each option's accessible name is the full PRD option string and the selected value shows it; result count, "Searching…", error row and zero-results row announced politely; type-locked per field.
UX-DR-P16: Register button: validates Personal NPI on blur and click; taken NPIs show their message under their own field and nothing is sent; no confirm; in flight spinner + "Registering…" and disabled (double click sends once); success → toast, Section swaps to Registered view, focus to its `h2`.
UX-DR-P17: Registered view: read-only key/value table in FR116 order with labels "NPI", "Taxonomy", "Health Information Exchange", "Practice name", "Practice address", "Practice NPI" (PM7), "Licenses", "Address of practice", "Signature", using the Account settings 4-column row-by-row read layout (mobile one pair per row); "Not provided" for n/a/-1; Practice name is a link-text-styled button opening the support-contact `info-popover` (organization name 600, support phone tabular, support email mailto — PM8) only when the practice is a 1health Organization, otherwise plain `kv-value`; Signature row `signature-thumb` or "No signature available", then the "?" button with Tooltip and in-app link "Personal Profile" to `/?tab=contacts#signature` (D-UX7); below the table at most one of the "already exists" `inline-banner-info` or the "Register your practice to enable ordering" `button-outline`, never both (PM6); no edit/unregister affordance.
UX-DR-P18: `info-popover` (280 px, popover bg/fg, `rounded-md`, elevation-2): non-modal Popover (not a Tooltip); opens below its trigger, left edge aligned, flipping above only without room (PM10); opens on hover (150 ms delay), keyboard focus or click/tap; closes on Escape (focus returns to trigger), blur (focus leaves trigger and popover) or outside click; opening on focus doesn't move focus, Tab goes from trigger into the popover's links then onward; trigger has `aria-expanded` + `aria-controls`; three variants: provider (i) paragraph; Practice name support contact; Primary contact (title "Primary contact" 600, then name, phone tabular, email mailto, each with muted leading icon, or "-").

**My Organizations tab**

UX-DR-P19: Organization search: full-width `input` with leading search icon and placeholder "Search organizations"; server search debounced 500 ms, resets to page 1; results announce "{N} organizations" politely; internal users (`@1health.io`, `@tachin.ai`) get "Create new organization" (`button-outline`, plus icon) to its right, stacking below the search on mobile; it is a Portal hand-off.
UX-DR-P20: `org-card` (card, border, `rounded-md`, 16 px padding, min-height 248 px, no shadow), grid 4 / 3 / 2 / 1 columns at ≥ 1280 / ≥ 1024 / ≥ 640 / below with 16 px gaps; top row `org-logo` (72 px tall, contain, left-aligned, `<img src="/api/pp/org-logo/<tenantId>">`) or `org-initials-tile` (72 px, muted bg, muted-foreground two initials 600, `rounded-md`) on missing or failed logo, with the (i) `info-icon-button` top-right ("Primary contact for {name}"); name (short name fallback name) in section-title on one line with CSS ellipsis, full name in the DOM and a Tooltip; type row; bottom primary "Enter portal" ("Enter portal for {name}"); each card is an `article` labeled by its name; `org-card-disabled`: muted text, Enter portal `button-aria-disabled` with Tooltip "You're disabled in this organization".
UX-DR-P21: Organization Type map (`type-icon` 20 px lucide outline, muted-foreground, 44 px focusable Tooltip trigger named by its label, never color-coded): Lab → FlaskConical "Lab"; Health Provider → HeartPulse "Healthcare"; Supplier → Truck "Supplier"; Go To Market → Store "Go To Market"; Healthcare (backend type) → HeartPulse "Healthcare"; Population Health → Users "Population Health"; Insurance → Umbrella "Insurance" (D-UX9, not ShieldCheck); Carrier → Package "Carrier"; Manufacturer → Factory "Manufacturer"; Enterprise → Building2 "Enterprise"; Government Agency → Landmark "Government Agency"; n/a → CircleHelp "No types selected for this organization"; any unknown type → CircleHelp with the platform type name, never breaking the card; at most 4 icons, order Lab, Health Provider, Supplier, Go To Market, then the rest alphabetically.
UX-DR-P22: `overflow-chip` "+N" (chip height, border, secondary-foreground, `rounded-sm`, chip type): focusable; Tooltip and accessible name list the hidden types alphabetically, e.g. "2 more types: Insurance, Population Health" (PM9); opens on hover, focus or tap.
UX-DR-P23: `pagination`: centered under the grid, previous / page numbers / next, each 44 px; current page muted fill + foreground + `aria-current="page"`; shown whenever there are results, even one page; "Previous" aria-disabled on page 1 and "Next" on the last page (both on a single page) (PM10); changing page scrolls to the top of the grid and focuses the first card's name.
UX-DR-P24: Organizations empty state: `empty-card` with title "You aren't managing any organizations yet" (section-title), sub-line, four feature rows (24 px muted icon · name 600 · muted description) and primary "Register organization" (checkout for regular users, Portal hand-off for internal users); no-results: `empty-row`-style single line "Sorry, no results were found", no pagination; skeleton: 12 card placeholders (logo, title, button bars) in the grid's column count.
UX-DR-P25: Portal hand-off presentation: Enter portal, Register your practice to enable ordering, Create new organization and internal Register organization keep their own button style with no external-arrow icon and no "(opens in a new tab)"; they run the leave guard if Account settings is dirty, then navigate the same tab via `navigate()`; never a new-tab branch.

**States, a11y, responsive**

UX-DR-P26: `no-access-panel` (card, border, `rounded-md`, 20 px lock icon muted-foreground, cell type, 24/16 px padding): tab level — centered bordered panel replacing the tab content with "You don't have access to this in your current account", no action; Section level (Account settings, Authenticator app, Healthcare credentials) — same icon + line as a single `empty-row`-layout row inside the Section's container; scoped per AD-23 owner table (e.g. a `contact-point/list` 403 disables only the pickers).
UX-DR-P27: Skeletons per tab: shell, header and tab strip render immediately; a tab loads only when opened; Account settings key/value skeleton (4 rows); Authenticator five 112 px tile placeholders; Healthcare credentials two input-height bars; My Organizations 12 card placeholders; shimmer static under reduced motion.
UX-DR-P28: Load error: `inline-banner-error` "Something went wrong while loading profile information · Retry" in the affected tab or Section, Retry reloads only it, never an empty form; Partial save (Account settings): edit mode kept, banner names each failed part ("{Part} was not saved. {platform message}"), succeeded parts rebased; No changes: "There are no changes", Section stays in edit.
UX-DR-P29: `/account` keyboard model: app bar (page nav Personal Profile → Account, Return to 1health; the wordmark is plain text, not a tab stop) → header → tabs → active tab content in reading order (Personal Account: Account settings then Authenticator app; Provider: (i), comboboxes, Register / registered view; My Organizations: search, Create new organization, cards row by row, pagination); same order on `/` with the page nav inserted after the wordmark.
UX-DR-P30: `/account` deep links: `/account?tab={personal|provider|organizations}#{account|authenticator}`; unknown tab → Personal Account; in-app links only via `navigate()` with leave guard: Account settings helper → `/?tab=contacts#email` (or `#phone`), registered-view Signature → `/?tab=contacts#signature`.
UX-DR-P31: Responsive `/account`: ≥ 768 px — tab strip one row, Account settings read 4 columns, MFA tiles one row of five, comboboxes up to 720 px, org grid 4/3/2, Create new organization beside search, dialogs centered; < 768 px to 360 px — page nav segmented control (wraps < 400 px), tab strip scrolls, header avatar + name only, Account settings one pair per row / label above control in edit, MFA tiles 3-column grid (min 96 px), comboboxes full width with Register right-aligned, org grid 2 columns from 640 px and 1 below, QR dialog full-screen, confirms centered with 16 px gutters, popovers/tooltips open on tap; no horizontal scroll at 360 px (automated check).
UX-DR-P32: Profile copy: add every EXPERIENCE.md Voice and Tone Profile row (Account settings heading/locked/picker/notice/validation/save, Birth date help + "About birth date", Authenticator intro/dialog/disable/base-MFA-off, Provider registration, Provider (i), Account settings labels, Registered view labels and copy, My Organizations, feature rows, No access, Load error, Account settings success toast, module-neutral wrong-tenant copy) and addendum §D new copy verbatim to `lib/shared/messages.ts`; the V&T verbatim test covers them.
UX-DR-P33: Layout choices PM1–PM11 (approved 2026-10-13) are binding: PM1 V&T labels; PM2 read grid row by row; PM3 "Not provided"; PM4 edit footer "Unsaved changes" + Cancel/Save; PM5 "Enabled" next to the heading; PM6 registered view shows "already exists" or "Register your practice", never both; PM7 rows "Practice address" / "Practice NPI"; PM8 practice popover = org name, support phone, support email; PM9 "+N" Tooltip alphabetical; PM10 popovers below trigger, Previous/Next aria-disabled at the ends; PM11 never framed, Return to 1health always shows, hand-offs same tab.
UX-DR-P34: Decisions D-UX1–D-UX9 (approved 2026-10-13) are binding: D-UX1 Birth date "?" Tooltip, edit only; D-UX2 linked status "Enabled"; D-UX3 heading "Personal account settings"; D-UX4 "Password changes aren't available here."; D-UX5 "No matching NPI found"; D-UX6 registration error inline banner until next Register; D-UX7 Signature "?" Tooltip + link to `/?tab=contacts#signature`; D-UX8 only the QR dialog goes full-screen < 768 px; D-UX9 Insurance type icon Umbrella.

### Amendments to Epics 1–5 from the 2026-10-13 architecture update

These existing stories carry acceptance criteria that the updated spine (and the 2026-10-13 user overrides: no 1health-fe changes, never framed, app-bar nav) now contradicts. The stories were amended in place on 2026-10-13 (each carries an "Amended 2026-10-13" note under its title); each line says what changed in its ACs. The spine wins on conflict. The existing NFR7 (iframe), NFR9 (1health-fe flag), NFR11/NFR12 (flag-based rollout/rollback), RC1-era UX-DR13 (hidden when framed), UX-DR36/UX-DR59 ("three" confirms → four), UX-DR37 (framed action), UX-DR50 (cookies "Open in a new tab") and UX-DR69 (framed mode) are superseded the same way.

- **Story 1.1 Foundation:** `env.ts` exports `PORTAL_URL` and `PUBLIC_FILES_ORIGIN` (no `PORTAL_ORIGIN`) plus `ACCOUNT_DISABLED`; CSP `frame-ancestors 'none'`, `X-Frame-Options: DENY` is sent (not omitted), COOP `same-origin` (not `same-origin-allow-popups`); header spec adds `/account`, `/handoff/portal`; lint bans `NextResponse.redirect` in `app/launch/**`/`app/handoff/**` and raw links/`next/link` to `/`, `/account`, `/handoff/**`, `PORTAL_URL` outside `features/shell` (AD-26). — applied *(2026-10-14: every item naming PORTAL_URL, PUBLIC_FILES_ORIGIN, APP_ORIGIN, /launch*, reason=cookies, X-PP-Session, sessionBinding or session-changed is superseded by D1/D4/D5/D7/D8; the story text is authoritative.)*
- **Story 1.2 Launch:** cookie `SameSite=Lax`, no `Partitioned` (AD-1); `proxy.ts` 307s any path carrying `lpl` (incl. `/account`) to `/launch`; redirects via `seeOther()` with absolute `Location` built from `APP_ORIGIN` (not relative); no `view` param; launch-error copy module-neutral (tenant "This is available in your personal account…", PA5); `reason=cookies` shows a plain message with Retry relaunching through `PORTAL_URL` same tab (no "Open in a new tab"/`target=_blank`); framed Return-to-1health AC removed; `/account` without session → launch-error. — applied *(2026-10-14: every item naming PORTAL_URL, PUBLIC_FILES_ORIGIN, APP_ORIGIN, /launch*, reason=cookies, X-PP-Session, sessionBinding or session-changed is superseded by D1/D4/D5/D7/D8; the story text is authoritative.)*
- **Story 1.3 Proxy:** BFF error bodies become `{errorCode, source:"proxy"}` (not `{code}`); denies are exact `METHOD + template` (prefix only for `/**`) and add `POST v2/mfa/enable|disable`, `* v2/mfa/{enable,disable,validate}/<n>`, `* v2/user/switch-tenant/**`, `* v2/user/update-password`, `* v2/tenant/sys-config` with the AD-2 test rows; `TOKEN_EXPIRED` body `{errorCode:"TOKEN_EXPIRED", source:"proxy"}`; `preview=true` server-forced on every `asImage` file-download entry; GET-without-`X-PP-Session` exemption extends to `GET /api/pp/org-logo/*`; `ACCOUNT_DISABLED` handling for Profile entries. — applied *(2026-10-14: every item naming PORTAL_URL, PUBLIC_FILES_ORIGIN, APP_ORIGIN, /launch*, reason=cookies, X-PP-Session, sessionBinding or session-changed is superseded by D1/D4/D5/D7/D8; the story text is authoritative.)*
- **Story 1.4 callApi/SWR:** `ApiResponse` adds `upstreamCode`; parse BFF `{errorCode, source}` vs upstream `{message, code:int}` (integer → `upstreamCode`, `errors.ts` derives `errorCode`), session events branch on `errorCode` only; one root `SWRConfig` in `app/layout.tsx` shared by `/` and `/account`; `app/account/page.tsx` also embeds `sessionBinding`. — applied *(2026-10-14: every item naming PORTAL_URL, PUBLIC_FILES_ORIGIN, APP_ORIGIN, /launch*, reason=cookies, X-PP-Session, sessionBinding or session-changed is superseded by D1/D4/D5/D7/D8; the story text is authoritative.)*
- **Story 1.5 Refresh:** a non-GET is replayed only after a proxy-originated `TOKEN_EXPIRED`, never after a 5xx or timeout (AD-16); error bodies use `{errorCode, source:"proxy"}`. — applied
- **Story 1.6 Idle logoff:** `SESSION_EXPIRED` and ping error bodies use `{errorCode, source:"proxy"}`; activity rules apply equally on `/account`. — applied
- **Story 1.7 Logout and session dialogs:** remove framed mode (`useIsFramed()`, "Close and reopen from 1health" and its Playwright case); `session-changed` also runs `drafts.purgeUser` for the in-memory user (AD-12/AD-19); `returnToPortal()` becomes the `navigate({external:"portal"})` path of AD-26 (guard → purge → logout → same-tab `location.assign`). — applied *(2026-10-14: every item naming PORTAL_URL, PUBLIC_FILES_ORIGIN, APP_ORIGIN, /launch*, reason=cookies, X-PP-Session, sessionBinding or session-changed is superseded by D1/D4/D5/D7/D8; the story text is authoritative.)*
- **Story 1.8 Page shell / app bar:** app bar replaces the "Personal Profile" title with the two-item page nav (Personal Profile | Account, `aria-current="page"`, mobile segmented control wrapping < 400 px) on both pages; "Return to 1health" always rendered (framed AC removed); tab changes and page switches go through `navigate()`/leave guard; tab ids typed as `ProfileTab`. — applied
- **Story 1.9 Header:** `keys.contactPoints(type)` is per single type (`Mobile`, `Landline`, `Email`) — the composite `["pp","contact-points","Phone"]` key becomes composed per-type keys; `/api/pp/profile-picture-id` errors use `{errorCode, source:"proxy"}`; header also refreshes after an Account settings save (it reads the shared keys). — applied
- **Story 1.10 Profile Picture:** upload-entry error bodies (`TOO_LARGE`, `UNSUPPORTED_MEDIA`) use `{errorCode, source:"proxy"}`. — applied
- **Story 1.11 Section framework:** one `SectionRegistry` per page (`/` and `/account` each mount their own); typed `ProfileTab`/`AccountTab`/`SectionId` enums; anchor table adds `account` and `authenticator`; `save()` error shape allows `{failedParts}` for the account Section. — applied
- **Story 1.12 Errors/messages:** `errors.ts` maps upstream 403 (no `source:"proxy"`) → `FORBIDDEN`, proxy `NOT_ALLOWED`/`CSRF` → generic error + Retry (never "no access"), integer `upstreamCode` handling, and the exact-message table (`MFA_NOT_ENABLED`, `TOTP_ALREADY_ENABLED`, `NPI_ALREADY_REGISTERED`) as the only message-text matching; the V&T verbatim test now spans the Profile rows. — applied *(2026-10-14, D5: no `CSRF` or `SESSION_CHANGED` codes.)*
- **Story 1.13 Leave guard:** guard is invoked by `navigate()` for tab switch, app-bar page switch (Personal Profile ↔ Account), Return to 1health and portal hand-offs; `beforeunload` only for browser-initiated unloads; Discard + Return path purges user-wide. — applied
- **Story 1.14 Save all:** Save all bar/pill and `SAVE_ORDER` exist only on `/` (per-page registry); `/account` mounts none. — applied
- **Story 1.15 Drafts:** purge on app-bar Return is user-wide via `drafts.purgeUser(userId)` (shell helper, not the registry) and also runs on `SESSION_CHANGED`; `baseHash` = hash of the server values of exactly the Section's `draftFields`; drafts kept on portal hand-offs; draft denylist adds MFA codes/QR and NPI selections; framed "Close and reopen" path removed. — applied *(2026-10-14, D5: no `SESSION_CHANGED` purge.)*
- **Story 1.16 Deployments/runbooks:** env/test asserts `PORTAL_URL`/`PUBLIC_FILES_ORIGIN` (no `PORTAL_ORIGIN`); Vercel env adds `PORTAL_URL`, `PUBLIC_FILES_ORIGIN`, `ACCOUNT_DISABLED`; runbook adds `ACCOUNT_DISABLED` partial stop; verification expects `frame-ancestors 'none'` + `X-Frame-Options: DENY` (not `frame-ancestors <PORTAL_ORIGIN>`); no 1health-fe flag step; disabled error bodies `{errorCode, source:"proxy"}`. — applied *(2026-10-14: every item naming PORTAL_URL, PUBLIC_FILES_ORIGIN, APP_ORIGIN, /launch*, reason=cookies, X-PP-Session, sessionBinding or session-changed is superseded by D1/D4/D5/D7/D8; the story text is authoritative.)*
- **Story 2.1 View Personal Information:** the Signature `GET v2/file/{id}/download` `asImage` entry gets server-forced `preview=true` (AD-2), not "no server-forced params". — applied
- **Story 2.2 Edit Personal Information:** first/last name and birth-date age rules come from shared `lib/shared/person-rules.ts` (names 1–24 chars after trim — a new max for Personal information; Proctor 21–120); the payload type omits `email`/`phoneNumber`/`phoneNumberRegion` and only `updateAccount()` may build them (lint); save mutates `myself`, which also invalidates an `/account` draft via `baseHash`. — applied
- **Stories 3.1, 3.2, 3.4, 3.5 Contact Points:** Phone reads/mutates per-type keys `contactPoints("Mobile")` + `contactPoints("Landline")` (not `["pp","contact-points","Phone"]`); Email keeps `contactPoints("Email")`; these keys are shared with the `/account` pickers, so Contacts saves refresh them. — applied
- **Story 3.7 Social links:** its "opens in a new tab with `target="_blank"`" AC is kept as the AD-5 exception for external non-1health links (PA1). — applied
- **Story 4.3 Places proxy:** error bodies use `{errorCode, source:"proxy"}`. — applied
- **Story 5.1 View policies:** the card-image download `asImage` entry gets server-forced `preview=true` (AD-2). — applied
- **Story 5.2 Policy editor:** the page-level guard also covers the app-bar page switch (Personal Profile → Account) via `navigate()`. — applied

### Profile module Resolved Clarifications

- **PRC1 (2026-10-13, user override) No 1health-fe changes.** The user menu (Profile, Provider registration, My organizations) keeps opening legacy `/personal-settings` for everyone; no menu rewiring, no default-tenant switch, no 1health-fe flag. Legacy screen is the fallback.
- **PRC2 (2026-10-13) Entry.** Portal Apps tile "Personal Profile" → launch lands on `/`; `/account` via app-bar "Account" or direct URL with a session; no `view` launch param (PRD OQ3 resolved, A2 retired).
- **PRC3 (2026-10-13, user override) Never framed.** Always top-level in its own tab; `frame-ancestors 'none'`; all framed-host behaviors dropped; hand-offs navigate the same tab (PM11).
- **PRC4 (2026-10-13) App-bar navigation.** Two destinations, Personal Profile and Account, each page keeps its tabs (replaces "same app bar, no switcher"); Δ D10.
- **PRC5 (2026-10-13) Password read-only.** No change-password (parity; SSO users can't be detected); `update-password` denied until a later story.
- **PRC6 (2026-10-13) MFA parity.** Only `enable/totp`, validate, `disable/totp`; never base MFA; no recovery codes, manual secret or re-auth; confirm before disable added (Δ D2); tiles presentational.
- **PRC7 (2026-10-13) No Register confirm.** Register NPI sends directly after the already-registered checks (confirm rejected in PRD §6.3).
- **PRC8 (2026-10-13) Primary switch 1:1 parity.** Verified Email / Mobile / Landline (landlines allowed, unlike Contacts), inline first-change notice, no confirm, sent only when changed via `PUT user/edit` (AM-4 / AD-9 exception).
- **PRC9 (2026-10-13) Org logos via named op.** `GET /api/pp/org-logo/{tenantId}` with a host check against the session environment's `publicFilesOrigin` (`lib/shared/environments.ts`, D7); CSP `img-src` unchanged; initials fallback (AM-5 resolved).
- **PRC10 (2026-10-13) Practice support via named op.** `GET /api/pp/practice-support`; `tenant/sys-config` denied in the proxy.
- **PRC11 (2026-10-13) MFA code in POST body.** `POST /api/pp/mfa/validate`; `mfa/validate` not passthrough (AM-6 redaction resolved by design).
- **PRC12 (2026-10-13) Portal hand-off.** Session-less `/handoff/portal` 303, same tab after leave guard, no logout and drafts kept (adversarial A4 "logout + purge on hand-off" rejected by the user).
- **PRC13 (2026-10-13) Account save sequence.** `PUT user/edit` then `time-zone` and `locale` both attempted; locale written via `POST user/locale` as `en-US`; partial failure rebases succeeded parts.
- **PRC14 (2026-10-13) Deltas D1–D10 approved;** everything else is parity with deployed `/personal-settings`.
- **PRC15 (2026-10-13) Shared person rules.** Name and birth-date rules live once in `lib/shared/person-rules.ts` for Personal information and Account settings.
- **PRC16 (2026-10-13) UX layout PM1–PM11 and D-UX1–D-UX9 approved;** Organization Type icon set (lucide, Umbrella for Insurance) proposed for PRD OQ4, still to be confirmed with design-system owners (EXPERIENCE Open Question 3).

### Profile module Ambiguities — resolved 2026-10-13 (approved by Daniel Garcia)

- **PA7 Story-level drafts accepted as defaults (2026-10-13):** MFA fallback copy (8.2/8.3), partial-save part labels "Account details" / "Time zone" / "Preferred locale" (7.5), `BAD_BODY` for malformed named-op bodies, QR loading = tile spinner (8.2), vendor logos copied from 1health-fe (licence check open), Epic 9 draft a11y/popover copy and `NO_PRACTICE`, `ACCOUNT_DISABLED` keeps the app-bar item visible.

- **PA1 External links:** `target=_blank rel="noopener noreferrer"` is allowed only for external non-1health links (the checkout site for "Register organization", social links in Story 3.7). Portal hand-offs stay same-tab through `/handoff/portal`. AD-5 is amended to match.
- **PA2 Error body:** proxy errors are `{errorCode, source:"proxy"}`, and the backend code moves to `upstreamCode` (AD-19). Epic 1 stories and Story 4.3 adopt this through the amendments list.
- **PA3 Contact-point keys:** one key per type (`Mobile`, `Landline`, `Email`), shared by Contacts and Account. Stories 1.9 and 3.x adopt this.
- **PA4 Person rules copy:** one message set for both pages, taken from Profile addendum §D ("You must be between 18 and 120 years old", "First name is required", "First name can be up to 24 characters"). The 24-character limit applies to Personal information too, because it is the backend rule.
- **PA5 Launch-error copy:** one module-neutral wording (AD-6), "This is available in your personal account. Switch to it in 1health and open it again." There is no `/account`-specific variant.
- **PA6 Empty organizations:** the AD-23 rule applies: no renderable items on page 0 with no search text.

## Epic List

### Launch and environment decisions (2026-10-14, human decisions — override the spine)

D1–D4 follow the sibling app `Tachin-ai-Corporation/patient-vault-official` (`app/api/token/route.tsx`, `app/auth/page.tsx`, `app/api/logout/route.tsx`). They override the launch and env details of architecture AD-1, AD-3, AD-4 and AD-20 (and the RC1 / AD-22 bits that depend on them). The spine itself is not edited; the stories below are.

- **D1 Launch entry kept from the 1health App Starter.** Env vars: `ONEHEALTH_SECRET_KEY_DEMO`, `ONEHEALTH_SECRET_KEY_PROD`, `APP_ID_DEMO`, `APP_ID_PROD`, required `SESSION_SECRET` (≥ 32 chars), optional `SESSION_SECRET_PREVIOUS`, `PP_DISABLED`, `ACCOUNT_DISABLED`. There is no `APP_ENV`, `API_ORIGIN`, `APP_ORIGIN`, `PORTAL_URL`, `APP_ID` or `ONEHEALTH_SECRET_KEY` env var, no `/launch`, `/launch/verify`, `/launch/dev` or `/launch-error` route, and no `proxy.ts` `?lpl` → `/launch` 307. The portal opens `/auth?lpl=…`; `/auth` (client page) POSTs to `/api/token`; on success it navigates to `/`. Only `demo` and `prod` exist (no `dev`); one deployment serves both. Tokens + `environment` are sealed in the httpOnly `__Host-pp_s`; no JS-readable cookies; no tokens in any response body. No-session pages redirect to `/auth`.
- **D2 Environment detected by key, never by the client.** `/auth` sends only `{ lpl }`. `/api/token` tries `ONEHEALTH_SECRET_KEY_PROD` then `ONEHEALTH_SECRET_KEY_DEMO`, each also `.trim()`-ed (a warning without the value is logged when only the trimmed variant matches); the key that decrypts sets `environment`; neither → invalid launch. Response `{ ok: true, environment }`. `/auth` keeps referrer detection (`demo.1health` → demo, `app.1health` → prod), falling back to the `onehealth_environment` cookie, only to pick the link shown on the no-LPL screen.
- **D3 Logout revokes on the platform.** `POST /api/session/logout` first calls, best effort and server-to-server, `POST <apiRoot>/auth/user/logout/all-devices` with the session's Bearer token, `cache: "no-store"`, 5 s timeout; any failure or 401 is swallowed and logged without the token; it always answers 204 clearing `__Host-pp_s`.
- **D4 Environment map and remembered environment.** `lib/shared/environments.ts` holds per environment the API root (`https://1health.demo.1health.io` / `https://1health.app.1health.io`; upstream API = `<root>/api`) and the portal URL (the same root; used by Return to 1health and hand-offs). `/api/token` also sets non-secret `onehealth_environment=<demo|prod>` (`HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`). Session-less routes (`/handoff/portal`) and post-expiry Return to 1health resolve the environment from the session if it unseals, else that cookie, else `prod`; never from a URL parameter. **Open:** the portal login deep link `<root>/login?openApp=<app name>` needs Personal Profile's registered app name (owner Daniel Garcia); until then links go to the portal root.

D5–D9 (human, 2026-10-14) also follow `patient-vault-official` (`app/auth/page.tsx`, `app/api/token/route.tsx`, `app/api/logout/route.tsx`, `lib/login-intent.ts`). They override AD-15 (body logging), AD-17, the `SESSION_CHANGED` parts of AD-8, AD-12 and AD-19, UX-DR38, and the launch-screen parts of AD-4 and UX-DR50.

- **D5 No CSRF or session-binding checks.** There is no `Sec-Fetch-Site`/`Origin` check, no `X-PP-Session` header, no HMAC session binding (`lib/server/csrf.ts`, `lib/server/session-binding.ts` and the `sessionBinding` embedded in pages are removed), no 403 `CSRF` and no 409 `SESSION_CHANGED`/`session-changed` event, so the Story 1.7 session-changed dialog is dropped; `SESSION_EXPIRED`/`session-expired` stays. The 415 `UNSUPPORTED_MEDIA` check on JSON entries stays. `POST /api/session/logout` also accepts GET. The cookie stays `__Host-pp_s` `HttpOnly; Secure; SameSite=Lax; Path=/`. Accepted knowingly: cross-site write protection relies only on `SameSite=Lax`, a cross-site GET can log the user out, and a launch by another account in another tab is no longer detected (open tabs keep showing the previous user's cached data until they reload).
- **D6 Dev-only client API logger.** `callApi` calls `logApiCall`, which writes one `console.groupCollapsed` per call (method, path, status, duration, request body, response body), only when `process.env.NODE_ENV === "development"`, read through the shared app-env helper `lib/shared/app-env.ts` (the only lint-allowed `process.env` read outside `lib/server/env.ts`). It redacts SSN-shaped values, MFA `code`, `qrCode` and any token-like field. There is no in-app API Inspector. Server logs never contain bodies, also under local `next dev` (replaces the earlier server-side dev body logging).
- **D7 Public files.** Story 10.2's hardened `GET /api/pp/org-logo/{tenantId}` route and the strict CSP `img-src 'self' blob: data:` stay. The public-files origin is the per-environment `publicFilesOrigin` in `lib/shared/environments.ts` (D4), never an env var.
- **D8 No blocked-cookie detection.** There is no blocked-cookie screen, no `cookies` reason and no verify route (already true since D1).
- **D9 `/auth` launch UX as patient-vault `app/auth/page.tsx`.** The client makes at most `MAX_AUTH_ATTEMPTS = 5` attempts with a fixed `AUTH_RETRY_DELAY_MS = 1500` (no backoff). It retries on any non-OK response unless the body has `retryable: false`, on an OK response without success, and on a network error. `/api/token` returns `retryable: false` for a missing `lpl`, bad base64, a payload too short, decryption failed with both keys, a non-JSON payload, missing required fields, an `APP_ID` mismatch and a tenant mismatch; it calls the exchange once per request (no server retry). Attempt 1 shows "Authenticating..." / "Connecting to {Demo|Production} environment"; from attempt 2 it shows "Confirming your login..." / "This can take a moment. Please wait while we finish confirming your login." Manual entry shows when there is no `lpl` but an environment is known (referrer or `onehealth_environment` cookie), and from the error screen through "Enter LPL Manually": card "Authentication Required", "Connected to {Demo|Production} environment. No launch payload detected.", one field "Launch Payload (LPL)" (placeholder "Paste encrypted LPL here..."), Submit disabled while empty, then under an "Or" divider "Go to 1health ({env})" and "Switch Environment". Submit runs the same flow with `trim()` and space → `+`. It is available in every environment (it replaces the dev-only paste page). Success shows "Success!" / "Loading app...", then after 1200 ms a hard `window.location.assign(target)`, where `target = consumeLoginIntent("/")` reads and removes sessionStorage `pp:login-intent` and accepts it only if it is a same-origin relative path not starting with `/auth` or `/api`. *(Amended 2026-10-14, human: a launch always lands on the Personal Profile page — the intent is used only when its pathname is `/` (e.g. `/?tab=insurance`); any other saved path, including `/account…`, falls back to `/`, so Story 7.1 "a launch always lands on `/`" holds.)* *(Accepted 2026-10-14, human: `/auth` auto-launches any `lpl` in the URL whatever the referrer, as patient-vault — accepted login-CSRF risk: a link to `/auth?lpl=<attacker payload>` signs the victim into the attacker's account; no "Continue" step.)* The error UI is a destructive Alert with the last attempt's title and message — "Authentication Failed" + the server's user-safe message, or the fallback "Unable to authenticate. Please return to 1health and try again."; or "Connection Error" / "Unable to connect to the authentication service. Please check your connection and try again." — and the buttons "Enter LPL Manually", "Switch Environment" and "Go to 1health ({Demo|Production})". "Switch Environment" opens patient-vault's "Choose Environment" card (Demo / Production), which, like the referrer, only picks the displayed labels and link; no request ever carries an environment (D2 stands). The server never returns upstream details or exception strings to the client.

D10–D13 (human, 2026-10-14) settle follow-up questions:

- **D10 Never framed.** The portal opens the app in its own tab; the app is never framed. `__Host-pp_s` is `HttpOnly; Secure; SameSite=Lax; Path=/`, with no `Partitioned`, no `Domain` and no `Max-Age`. Every response sends CSP `frame-ancestors 'none'`, `X-Frame-Options: DENY` and COOP `same-origin` (not `same-origin-allow-popups`). There is no iframe / `ExternalAppFrame` / framed-mode support, no "Close and reopen" framed copy and no `window.self !== window.top` detection.
- **D11 Non-interactive wordmark.** The "1health" wordmark is plain text (a `span`: no href, no click, no focus, not a tab stop) in the `primary-text` token. Tab order: page nav (Personal Profile → Account) → Return to 1health → header → tabs → content.
- **D12 Deny list and kill-switch ownership.** Story 1.3 is the single owner of the full deny list, the `profile: true` allowlist-entry tag and the proxy-level `ACCOUNT_DISABLED=1` 503 for tagged entries. Story 7.2 owns only the page/route-level kill switch (`/account`, `/handoff/**`, `/api/pp/{mfa,org-logo,practice-support}/**`) and the test rows verifying the 1.3 deny list against Profile templates. Stories 7.5–10.3 tag their Profile-only entries.
- **D13 Design tokens.** Dedicated `link-text` (`text-link-text`) and `destructive-fill` (`bg-destructive-fill`) tokens, never `text-info-strong` / `bg-error-strong` for those roles; a new `primary-text` token (#246b8f light, #6fb6d8 dark) for text in the primary hue; a new `scrim` token (graphite 45 % light, black 60 % dark) for every dialog and the drawer, replacing `bg-black/50`.

### Epic 1: Launch, session and profile shell
Users open Personal Profile from the 1health portal, arrive signed in and safe, see their name and picture, and move between tabs. Unsaved work is protected and the session expires safely. Includes the foundation: proxy, sealed session, CI and tests, one Vercel deployment serving demo and prod (D1), design tokens, and the shell building blocks (Section registry, Save all, drafts, leave guard, session-expired dialog, idle logoff).
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9, FR10, FR32
**NFRs:** NFR1, NFR2, NFR3, NFR5, NFR6, NFR7, NFR8, NFR11, NFR12 · **Jira:** NG-9027, NG-9020, NG-9021

### Epic 2: Identity — Personal Information, SSN and Signature
Users and providers keep their legal identity and demographics correct, reveal their own SSN safely, and draw or upload their Signature.
**FRs covered:** FR11, FR12, FR13, FR14 · **Jira:** NG-9022

### Epic 3: Contact methods — Phone, Email and Social Media
Users keep every way to reach them current, verify numbers and emails, switch their primary (sign-in) contact safely, and manage social links. These share the Contact Point engine (AD-9).
**FRs covered:** FR15, FR16, FR17, FR18, FR19, FR20, FR21, FR22, FR23, FR24 · **Jira:** NG-9023, NG-9024, NG-9025

### Epic 4: Addresses
Users keep their addresses current, using address suggestions, with exactly one primary.
**FRs covered:** FR25, FR26, FR27 · **Jira:** NG-9026

### Epic 5: Insurance
Users put their insurance policies on file, with subscriber details and card photos, and manage which is primary.
**FRs covered:** FR28, FR29, FR30, FR31 · **Jira:** NG-9029

### Epic 6: Medical (placeholder)
Defined later by the PM. No stories yet. Epic 1 delivers only the FR32 "Coming soon" panel.
**FRs covered:** none yet

### Epic 7: Account page and personal account settings
Users go to **Account** from the app bar and keep their name, sign-in email and phone, birth date, language, time zone and locale correct. A partial save tells them exactly which part wasn't saved. Includes the `/account` foundation: route and tabs, app-bar navigation through `navigate()` (AD-26), skeleton, load-error and 403 states, the `/handoff/portal` route (AD-22) and the page/route-level `ACCOUNT_DISABLED` kill switch (AD-20); the deny list, the `profile: true` tag and the proxy-level 503 belong to Story 1.3 (D12); each Profile allowlist entry lands in the story that first uses it.
**FRs covered:** FR101, FR102, FR103, FR104, FR105, FR106, FR107, FR108, FR109 · **Jira:** NG-9019 › NG-9030–NG-9035

### Epic 8: Authenticator app (MFA)
Users link an authenticator app by scanning a QR code and entering a code, see that it's enabled, and turn it off with a confirmation. MFA parity: base MFA is never turned on.
**FRs covered:** FR110, FR111, FR112 · **Jira:** NG-9019 › NG-9036–NG-9038

### Epic 9: Individual Provider Registration
Providers find their personal and practice NPIs, register them, and see their registered credentials: the practice's support contact, their signature and "Register your practice".
**FRs covered:** FR113, FR114, FR115, FR116 · **Jira:** NG-9019 › NG-9039–NG-9041

### Epic 10: My Organizations
Users search and page through their organizations, recognize them by logo and type, check the primary contact, and enter each organization's portal.
**FRs covered:** FR117, FR118, FR119, FR120 · **Jira:** NG-9019 › NG-9042–NG-9044

**Dependencies:** Epics 2–5 depend only on Epic 1 and can run in parallel after it. Epic 7 depends on Epic 1. Epics 8, 9 and 10 depend only on Epics 1 and 7 and can run in parallel after them. The 2026-10-13 architecture amendments are applied inside the existing Epic 1–5 stories, not as new stories.

## Epic 1: Launch, session and profile shell

Users open Personal Profile from the 1health portal, arrive signed in and safe, see their name and picture, and move between tabs. Unsaved work is protected and the session expires safely. Includes the foundation: proxy, sealed session, CI and tests, one Vercel deployment serving demo and prod (D1), design tokens, and the shell building blocks (Section registry, Save all, drafts, leave guard, session-expired dialog, idle logoff).

**Stories (dependency order):** 1.1 Foundation · 1.2 Launch · 1.3 Proxy · 1.4 `callApi` + SWR · 1.5 Token refresh · 1.6 Idle logoff · 1.7 Logout + session-expired dialog · 1.8 Page shell · 1.9 Header view · 1.10 Change picture · 1.11 Section framework · 1.12 Errors, messages and toasts · 1.13 Leave guard · 1.14 Save all · 1.15 Drafts · 1.16 Deployments. Each story depends only on earlier stories.

### Story 1.1: Foundation — environment config, security headers, test tooling, CI and legacy removal

*Amended 2026-10-13 (architecture update: AD-3, AD-4, AD-5, AD-20, AD-21, AD-26).*
*Amended 2026-10-14 (launch decisions D1, D2, D4: `_DEMO`/`_PROD` env vars, environment map, no `APP_ENV`/`PORTAL_URL`).*
*Amended 2026-10-14 (decisions D6, D7): the shared app-env helper is the one `process.env` exception; `publicFilesOrigin` stays in the environment map.*
*Foundation 2026-10-14: built in spec 7.0a — `lib/server/env.ts` (incl. `IS_LOCAL_DEV`, `DEFAULT_TENANT_ID`, `getSecretKey`, `getAppId`), `lib/shared/environments.ts`, `lib/shared/app-env.ts` (`isLocalDev`, `isProductionBuild`), root `proxy.ts` + `lib/server/security/headers.ts` (nonce CSP, AD-21), `lib/server/http/*` (`seeOther`, `jsonError`, no-store, `fetchWithTimeout`), ESLint layering/navigation bans, Vitest/MSW/Playwright, `.github/workflows/ci.yml`, `scripts/check-forbidden.sh` (+ `scripts/check-tokens.sh` from 7.0b-1), legacy template removed. Use it; do not rebuild. Remaining for this story: nothing.*

As a developer on the Personal Profile team,
I want one validated server config, a constant per-environment map, security headers on every response, a working test stack, a CI gate on every PR, and the legacy auth code gone,
So that every later story builds on a deployment that serves demo and prod without trusting the client for the environment, cannot be framed or script-injected, holds no token in browser code, and cannot merge untested or untyped code.

**Acceptance Criteria:**

**Given** the server boots
**When** `lib/server/env.ts` is first imported (it is imported from `instrumentation.ts` `register()` so the check runs at boot)
**Then** it exports `ONEHEALTH_SECRET_KEY_DEMO`, `ONEHEALTH_SECRET_KEY_PROD`, `APP_ID_DEMO`, `APP_ID_PROD`, `SESSION_SECRET`, `SESSION_SECRET_PREVIOUS` (optional), `PLACES_ENABLED`, `GOOGLE_PLACES_KEY`, `PP_DISABLED`, `ACCOUNT_DISABLED`, `IS_LOCAL_DEV` (`NODE_ENV === "development"`) and the constant `DEFAULT_TENANT_ID` = `1`, plus `getSecretKey(env)` and `getAppId(env)` for `env` ∈ `demo|prod`
**And** there is no `APP_ENV`, `API_ORIGIN`, `APP_ORIGIN`, `PORTAL_URL`, `PORTAL_ORIGIN`, `PUBLIC_FILES_ORIGIN`, `APP_ID`, `ONEHEALTH_SECRET_KEY` or `NEXT_PUBLIC_*` variable (D1)
**And** `PLACES_ENABLED`, `PP_DISABLED` and `ACCOUNT_DISABLED` are booleans that are `true` only for the exact string `"1"`. *(built: spec 7.0a)*

**Given** `lib/shared/environments.ts` (no secrets; importable by server and client)
**When** it is read
**Then** it exports `type Environment = "demo" | "prod"` and a constant map with, per environment, `apiRoot` (`demo` → `https://1health.demo.1health.io`, `prod` → `https://1health.app.1health.io`), `apiBase` = `<apiRoot>/api`, `portalUrl` = the same root, and `publicFilesOrigin` (the origin of organization `tenantLogo.publicUrl`, AD-24; values open, unset = logos 404)
**And** no other module hard-codes a 1health origin, and a Vitest asserts the map values (D4). *(built: spec 7.0a)*

**Given** a deployment is missing `ONEHEALTH_SECRET_KEY_DEMO`, `ONEHEALTH_SECRET_KEY_PROD`, `APP_ID_DEMO`, `APP_ID_PROD` or `SESSION_SECRET`, or `SESSION_SECRET` is shorter than 32 characters, or `PLACES_ENABLED=1` without `GOOGLE_PLACES_KEY`
**When** the server boots
**Then** boot fails with an error that names the offending variable and never prints its value
**And** surrounding whitespace in a secret key is not a boot error (Story 1.2 tries the trimmed variant and warns)
**And** a Vitest table test in `lib/server/env.test.ts` covers each of these cases plus one valid case. *(built: spec 7.0a)*

**Given** the codebase after this story
**When** `pnpm lint` runs
**Then** an ESLint rule fails any `process.env` access outside `lib/server/env.ts`, with one exception: `lib/shared/app-env.ts`, which reads only `process.env.NODE_ENV` and exports `isLocalDev()` for the client `logApiCall` (D6)
**And** `lib/server/env.ts` starts with `import "server-only"` so importing it from a client component fails the build
**And** an ESLint rule bans `dangerouslySetInnerHTML` everywhere (AD-11)
**And** an ESLint rule bans `NextResponse.redirect` in `app/handoff/**` (redirects use `lib/server/http.ts#seeOther()`, AD-4)
**And** an ESLint rule bans `next/link` and raw `<a href>` targeting `/`, `/account`, `/handoff/**` or a `portalUrl` from `lib/shared/environments.ts` outside `features/shell` and the `/auth` screen (cross-page and external navigation go through `navigate()`, AD-26)
**And** no manual environment chooser or `getOneHealthBaseUrl()` environment switch is referenced by any file in the repo, and `document.referrer` environment detection appears only in `app/auth/**` (D2: it picks the no-LPL screen's link, never a request's environment). *(built: spec 7.0a)*

**Given** any request to the app, including `/`, an unknown path that returns 404, and a static asset such as `/favicon.png` or a `/_next/static/*` file
**When** the response is produced
**Then** `proxy.ts` (the Next 16 request interceptor, matcher covering every path) generates a fresh random nonce of at least 128 bits per request and sets `Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-<n>' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests`
**And** `frame-ancestors` is exactly `'none'`: the app always runs top-level and is never framed, including by the portal (AD-5)
**And** the response also carries `X-Frame-Options: DENY`, `Strict-Transport-Security: max-age=63072000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy: camera=(), microphone=(), geolocation=()` and `Cross-Origin-Opener-Policy: same-origin`
**And** the nonce is passed to the App Router (request header `x-nonce`) so Next's own scripts carry it, and the rendered page contains no inline `<script>` without that nonce. *(built: spec 7.0a)*

**Given** two consecutive requests to `/`
**When** their CSP headers are compared
**Then** the nonces differ. *(built: spec 7.0a)*

**Given** the repo's `next.config.mjs`
**When** this story is done
**Then** `typescript.ignoreBuildErrors` is removed and `eslint.ignoreDuringBuilds` is absent, `cacheComponents` is not enabled, and no `s-maxage` appears anywhere in config
**And** `pnpm typecheck` (`tsc --noEmit`) and `next build` pass with zero type errors. *(built: spec 7.0a)*

**Given** the brownfield template code that is not allowlisted (AD-2) and blocks a clean typecheck
**When** this story is done
**Then** these files are deleted even if they carry uncommitted local modifications (RC12): `lib/api/` modules workflow-provisioning, workflow-template, campaign, journey, journey-step, grid, attachments, comments, custom-data, partnerships, query, schema, step-config, tenant; `components/workflow/`, `components/settings-page.tsx`, `components/home-page-client.tsx`
**And** `lib/api/index.ts` and `lib/api/config.ts` no longer reference deleted modules. *(built: spec 7.0a)*

**Given** the legacy auth code (AD-1, RC12)
**When** this story is done
**Then** `app/api/token/**`, `app/auth/**`, `lib/auth-client.ts`, `contexts/navigation-context.tsx`, `contexts/session-context.tsx`, `hooks/use-session-expired.ts` and `components/auth-exit-dialog.tsx` are deleted (Story 1.2 rebuilds `app/auth/page.tsx` and `app/api/token/route.ts` under D1/D2), even with uncommitted local modifications, and `app/layout.tsx` no longer wraps children in `NavigationProvider` or a session provider
**And** every remaining importer of a deleted module is deleted or updated so `pnpm typecheck` stays green; `hooks/use-toast.ts` and `components/ui/*` are kept
**And** `lib/api/client.ts` no longer imports `lib/auth-client` and keeps the `callApi(context, path, init)` signature, issuing a plain same-origin `fetch` to the given `/api/...` path
**And** `app/page.tsx` renders a minimal placeholder `<main>` (no data and no session check)
**And** no file in `app/`, `components/`, `contexts/`, `hooks/`, `features/` or `lib/` (outside `lib/server/`) contains `document.cookie` or `access_token`. *(built: spec 7.0a)*

**Given** the test stack from the Stack table
**When** dependencies are installed
**Then** `package.json` pins `vitest` 5.0.4, `@testing-library/react` 16.3.3, `msw` 3.0.3 and `@playwright/test` 1.64.0 (plus `iron-session` 9.0.1), declares `"engines": { "node": "24.x" }` and a `packageManager` of pnpm 12.x for corepack
**And** scripts exist: `lint` (`eslint .`), `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `test:e2e` (`playwright test`), `build`, and `dev` = `next dev --experimental-https`
**And** `vitest.config.ts` runs `lib/server/**` tests in the `node` environment and component tests in `jsdom`, with a shared setup file that starts an MSW server at the `/api` boundary with `onUnhandledRequest: "error"`
**And** at least three passing sample tests exist: a pure unit test (env table), a Testing Library component test, and an MSW-backed test of a same-origin `/api/...` fetch. *(built: spec 7.0a)*

**Given** `playwright.config.ts`
**When** `pnpm test:e2e` runs
**Then** Playwright starts the app with a `webServer` using test values for every required env var (dummy `ONEHEALTH_SECRET_KEY_DEMO|PROD`, `APP_ID_DEMO|PROD`, `SESSION_SECRET`) and runs a desktop Chromium project and a 360 × 740 mobile project
**And** a header spec asserts every AD-21 header above (exact CSP directive list with `frame-ancestors 'none'`, `X-Frame-Options: DENY`, HSTS, nosniff, Referrer-Policy, Permissions-Policy, COOP `same-origin`) on `/`, `/auth`, `/account`, `/handoff/portal`, on a 404 path and on one static asset (paths not built yet are asserted on whatever they return). *(built: spec 7.0a)*

**Given** a pull request is opened or updated
**When** `.github/workflows/ci.yml` runs on Node 24 with pnpm via corepack and `pnpm install --frozen-lockfile`
**Then** the job runs, in order, `pnpm lint`, `pnpm typecheck`, `pnpm test`, Playwright browser install + `pnpm test:e2e`, and `pnpm build`, and any failing step fails the check
**And** a forbidden-pattern step (`scripts/check-forbidden.sh`) fails the job when any file other than the script itself contains a `NEXT_PUBLIC_*SECRET*` name, or when a secret name ending in `_DEMO` or `_PROD` appears anywhere other than `lib/server/env.ts`, its tests, `.env.example` and CI/test fixtures (`.github/workflows/ci.yml`, `playwright.config.ts`, test setup files) (D1), or when any client file (outside `lib/server/`) contains `document.cookie` or `access_token`
**And** the forbidden-pattern step also fails on `APP_ENV`, `API_ORIGIN`, `APP_ORIGIN`, `PORTAL_URL`, `PORTAL_ORIGIN`, `PUBLIC_FILES_ORIGIN`, `X-PP-Session`, `sessionBinding`, `SameSite=None`, `Partitioned`, `window.top` and `bg-black/50` in app code (D1, D5, D10, D13)
**And** CI never needs real 1health credentials (every secret is a dummy value scoped to the workflow). *(built: spec 7.0a)*

**Covers:** NFR1, NFR6, AD-1 (legacy auth deleted), AD-3, AD-4 (`seeOther` lint), AD-5 (`frame-ancestors 'none'`, `X-Frame-Options: DENY`), AD-11 (lint rule), AD-18 (config), AD-20 (CI, CI grep, test framework, local dev, remove ignoreBuildErrors), AD-21, AD-26 (navigation lint), RC1 (as superseded), RC12, D1, D2 (referrer scope), D4 (environment map) · **Jira:** NG-9027

### Story 1.2: Launch from the portal and arrive signed in

*Amended 2026-10-13 (architecture update: AD-1, AD-4, AD-5, AD-6, AD-21).*
*Amended 2026-10-14 (launch decisions D1, D2, D4): `/auth` + `POST /api/token` replace `/launch`, `/launch/verify`, `/launch/dev`, `/launch-error` and the `proxy.ts` `lpl` 307; the environment is detected by the decrypting key and sealed in the session.*
*Amended 2026-10-14 (decisions D5, D8, D9): no CSRF check on `/api/token`; no blocked-cookie screen; `/auth` follows the patient-vault launch UX (client retry, manual LPL entry, login-intent redirect, error alert).*
*Foundation 2026-10-14: built in spec 7.0a — `app/auth/page.tsx` + `features/shell/{auth-screen.tsx,launch-flow.ts}` (`runLaunchFlow`, `MAX_AUTH_ATTEMPTS`, `AUTH_RETRY_DELAY_MS`), `app/api/token/route.ts` + `lib/server/launch/{lpl-crypto,exchange,launch,token-handler}.ts`, `lib/server/session/{session,types,environment-cookie,revoke}.ts` (`__Host-pp_s`, `onehealth_environment`), `lib/server/page-session.ts#requirePageSession`, `lib/api/session.ts#startSession`; relaunch lands only on `/` via `consumeLaunchIntent()` (7.0b-2). Use it; do not rebuild. Remaining for this story: nothing.*

As a Launching user (patient or provider) in the 1health portal,
I want clicking the Personal Profile tile in the portal Apps launcher to open the app, in its own tab, already signed in on my Contacts tab,
So that I can manage my profile without a login screen and without my launch link ever being reusable.

**Acceptance Criteria:**

**Given** the portal opens the registered launch URL `<app origin>/auth?lpl=<payload>`
**When** `app/auth/page.tsx` renders (a server component exporting `dynamic = "force-dynamic"` that reads only the `onehealth_environment` cookie and passes it to the client screen `features/shell/auth-screen.tsx`)
**Then** the client reads `lpl`, replaces every `' '` with `'+'`, removes `lpl` from the address bar with `history.replaceState` before sending anything, and runs the launch flow below, where each attempt is one `POST /api/token` with `Content-Type: application/json` and body `{ "lpl": "<payload>" }` and nothing else (no environment)
**And** on `200 { ok: true, environment }` it shows "Success!" / "Loading app..." and after 1200 ms does a hard `window.location.assign(target)`, where `target = consumeLoginIntent("/")` (`lib/shared/login-intent.ts`, written by Story 1.7) reads and removes sessionStorage key `pp:login-intent` and returns it only if it is a same-origin relative path (starts with `/`, not `//`) that does not start with `/auth` or `/api`, else `/` (D9); because `lpl` was already removed with `replaceState`, no history entry holds the payload; there is no `view` or `tab` launch param
**And** no other page (`app/page.tsx`, `app/account/page.tsx` or any other) ever reads `lpl`; there is no `/launch`, `/launch/verify`, `/launch/dev` or `/launch-error` route and `proxy.ts` does not redirect or rewrite requests that carry `lpl` (D1). *(built: spec 7.0a)*

**Given** the launch flow in `features/shell/auth-screen.tsx` (D9, as patient-vault `app/auth/page.tsx`)
**When** an attempt does not succeed
**Then** it makes at most `MAX_AUTH_ATTEMPTS = 5` attempts with a fixed `AUTH_RETRY_DELAY_MS = 1500` between them (no backoff), retrying on any non-OK response unless its body has `retryable: false`, on an OK response without `ok: true`, and on a network error
**And** attempt 1 shows "Authenticating..." / "Connecting to {Demo|Production} environment" (the shown environment below); from attempt 2 it shows "Confirming your login..." / "This can take a moment. Please wait while we finish confirming your login."
**And** a Vitest (fake timers, MSW) covers: success on attempt 1 → one POST; two 502s then success → three POSTs 1,500 ms apart; a `retryable: false` body → one POST, then the error state; five failures → five POSTs, then the error state with the last attempt's title and message. *(built: spec 7.0a)*

**Given** a request to `/api/token`
**When** `app/api/token/route.ts` (POST only, other methods 405; `dynamic = "force-dynamic"`) runs
**Then** it requires `Content-Type: application/json` (else 415 `UNSUPPORTED_MEDIA`); there is no `Sec-Fetch-Site`/`Origin` or `X-PP-Session` check (D5)
**And** before anything else it schedules clearing of any existing `__Host-pp_s` cookie, so a failed launch never leaves the previous user's session
**And** it reads only `lpl` from the body; any other field, including `environment`, is ignored. *(built: spec 7.0a)*

**Given** the `lpl`
**When** `lib/server/launch.ts` detects the environment (D2)
**Then** it base64-decodes the payload and tries AES-256-GCM decryption (first 12 bytes IV, last 16 bytes tag, key = HKDF-SHA256 of the secret, matching the platform's `KeyDerivationUtil`) with `ONEHEALTH_SECRET_KEY_PROD`, then `ONEHEALTH_SECRET_KEY_DEMO`, each first as stored and then `.trim()`-ed; the first key that authenticates decides `environment` (`prod` or `demo`)
**And** when only the trimmed variant decrypts, it logs one warning naming the environment variable (never its value) and continues with that variant
**And** a Vitest covers: a prod-key payload → `prod`; a demo-key payload → `demo`; a payload that only a whitespace-padded key's trimmed variant decrypts → that environment plus one warning without the value; a payload neither key decrypts → invalid. *(built: spec 7.0a)*

**Given** the payload is missing, not base64, shorter than 28 bytes, decrypted by neither key, cleartext JSON (unencrypted), not valid JSON, or lacks a required field (`required.apiKey.name`, `required.tenant.id`, `required.user.id`, `required.oneTimeCode.value`, `required.oneTimeCode.issuedAt`)
**When** the route runs
**Then** it makes no upstream call, sets no session cookie, and answers 400 `{ "ok": false, "errorCode": "LAUNCH_INVALID", "source": "proxy", "retryable": false }` (D9). *(built: spec 7.0a)*

**Given** a decrypted payload whose app identifier (`required.apiKey.name`) is not equal to `APP_ID_<ENV>` of the detected environment (`APP_ID_PROD` for `prod`, `APP_ID_DEMO` for `demo`)
**When** the route runs
**Then** it makes no upstream call and answers 400 `LAUNCH_INVALID` with `retryable: false` (D9). *(built: spec 7.0a)*

**Given** a valid payload
**When** the route exchanges the code
**Then** it calls `POST <apiRoot>/api/v2/public/external-application/auth/oauth2/user/token` (`apiRoot` of the detected environment from `lib/shared/environments.ts`) exactly once with `{ securityCode, signature }` (signature = base64 HMAC-SHA256 of the code keyed with the key variant that decrypted the payload), `cache: "no-store"`, `redirect: "manual"` and a 25 s timeout, and never retries within the request (the client may send up to five requests, D9); exchange failures carry no `retryable: false`
**And** an upstream rejection identifying an already-consumed code maps to 400 `LAUNCH_USED`, an expired code maps to 400 `LAUNCH_EXPIRED`, and any other failure (other 4xx, 5xx, 3xx, timeout, network error) maps to `LAUNCH_INVALID` (502 for 5xx/timeout/network); the mapping lives in `lib/server/launch.ts` and is unit-tested against recorded upstream error bodies. *(built: spec 7.0a)*

**Given** a successful exchange
**When** the route checks the tenant (AD-6)
**Then** it reads only the plaintext `tenantId` claim of the access token (other identity claims are encrypted and are never decoded)
**And** if `tenantId` ≠ `DEFAULT_TENANT_ID` (`1`), it sets no session cookie, calls no other upstream endpoint, and answers 403 `{ "ok": false, "errorCode": "WRONG_TENANT", "source": "proxy", "retryable": false }` (D9). *(built: spec 7.0a)*

**Given** the tenant is `1`
**When** the route derives ids
**Then** it calls `GET <apiRoot>/api/v2/user/myself` once with the new Bearer token and takes `userId` and `personId` from that response (never from the JWT, never from the payload alone)
**And** if the call fails or its user id ≠ the payload's `required.user.id`, it sets no cookie and answers 502 `{ "ok": false, "errorCode": "LAUNCH_INVALID", "source": "proxy" }` (no `retryable: false`; D9). *(built: spec 7.0a)*

**Given** ids are derived
**When** the route creates the session
**Then** `lib/server/session.ts` seals one cookie `__Host-pp_s` with iron-session (password map: `SESSION_SECRET` current, `SESSION_SECRET_PREVIOUS` accepted for unseal only) holding access token, refresh token, access expiry, `environment` (`demo|prod`), `userId`, `personId`, `tenantId`, a new random `sid` (≥ 128 bits), `gen = 0`, `iat = now` and `lastSeen = now`
**And** the cookie attributes are exactly `HttpOnly; Secure; SameSite=Lax; Path=/` with no `Partitioned` (the app is top-level only, AD-5), no `Domain`, no `Max-Age` and no `Expires`
**And** `id_token` and the API root are never stored in the cookie (the API root is always derived from `environment` through `lib/shared/environments.ts`)
**And** a Vitest test asserts the serialized `Set-Cookie` is ≤ 3,800 bytes using the largest observed token fixtures (≥ 1,224-byte access token)
**And** a Vitest proves a cookie sealed under the previous secret is unsealed while `SESSION_SECRET_PREVIOUS` is set, that new cookies are always sealed with `SESSION_SECRET`, and that the old cookie is rejected (no session) once the variable is removed (AD-20 rotation). *(built: spec 7.0a)*

**Given** the session cookie is set
**When** the route responds
**Then** it answers 200 `{ "ok": true, "environment": "<demo|prod>" }` and nothing else
**And** it also sets the non-secret `onehealth_environment=<demo|prod>` cookie with `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000` (30 days; D4); a failed launch leaves it unchanged
**And** no `/api/token` response body, success or failure, contains a token, the one-time code, a user id or any payload field, and every response carries `Cache-Control: private, no-store, max-age=0`, `Pragma: no-cache` and `Vary: Cookie` (from `lib/server/cache-headers.ts`); a Vitest asserts both
**And** every error body also carries `message`, a user-safe string from `lib/shared/messages.ts` chosen by `errorCode` (`WRONG_TENANT` → the module-neutral tenant copy; `LAUNCH_CONFIG` and `SERVICE_DISABLED` → "Personal Profile is unavailable right now. Use your profile in 1health for now."; `LAUNCH_EXPIRED`, `LAUNCH_USED`, `LAUNCH_INVALID` → "This link has expired. Open Personal Profile again from 1health."), and never upstream bodies, upstream messages or exception strings (D9). *(built: spec 7.0a)*

**Given** the browser opened `/auth?lpl=…`
**When** the launch completes (Playwright, mocked upstream)
**Then** the final URL is `/`
**And** `lpl` appears neither in the final URL nor in any reachable history entry, and reloading `/` performs no second exchange (on a first-attempt success the mocked endpoint is called exactly once; a `retryable: false` failure is also called exactly once, D9). *(built: spec 7.0a)*

**Given** a secret key cannot be turned into a valid AES key at request time
**When** `/api/token` is called
**Then** it answers 503 `{ "ok": false, "errorCode": "LAUNCH_CONFIG", "source": "proxy" }`. *(built: spec 7.0a)*

**Given** any launch outcome
**When** the server logs it
**Then** the log line holds only request id, route template `/api/token`, outcome code, detected environment (if any) and duration; `lpl`, the code, tokens, user ids, secret values and upstream bodies are never logged. *(built: spec 7.0a)*

**Given** a request to `/` or `/account` with no valid session (no cookie, or a cookie that fails to unseal)
**When** the page (`app/page.tsx`, or `app/account/page.tsx` once Epic 7 builds it; both export `dynamic = "force-dynamic"`) calls `requireSession()`
**Then** it redirects to `/auth` (no query); there is no login form
**And** `/account` is reached only by in-app navigation or a direct URL with an existing session; launch never lands on it (AD-4). *(built: spec 7.0a)*

**Given** `/auth` without `lpl` (the no-LPL screen)
**When** an environment is known for display: `document.referrer` hostname containing `demo.1health` → demo, `app.1health` → prod, else the `onehealth_environment` value passed by the server wrapper (the cookie is httpOnly; the client never reads `document.cookie`)
**Then** it shows the manual-entry card (D9): title "Authentication Required", description "Connected to {Demo|Production} environment. No launch payload detected.", one text field labelled "Launch Payload (LPL)" with placeholder "Paste encrypted LPL here...", and Submit, disabled while the trimmed value is empty; then, under an "Or" divider, "Go to 1health ({Demo|Production})" (same tab, to that environment's `portalUrl` from `lib/shared/environments.ts`) and "Switch Environment"
**And** Submit runs the same launch flow with the value `trim()`-ed and every `' '` replaced by `'+'`; the field is available in every environment, including production (it replaces the dev-only paste page), and its value is never stored, logged or put in a URL
**And** with no known environment, and after "Switch Environment", it shows the patient-vault "Choose Environment" card ("Select which 1health environment to connect to.", Demo / Production); like the referrer, the choice only picks the displayed labels and link and is never sent with a request: `/api/token` still detects the environment by key (D2)
**And** the login deep link `<portalUrl>/login?openApp=<app name>` is used only once the registered app name is confirmed (open question, D4). *(built: spec 7.0a)*

**Given** the launch flow ended without success (after the fifth attempt, or at once on `retryable: false`)
**When** `/auth` renders the error state (D9)
**Then** it shows a destructive Alert whose title and message come from the last attempt: an HTTP failure → "Authentication Failed" + the body's `message` (e.g. the module-neutral `WRONG_TENANT` copy, AD-6, PA5), or the fallback "Unable to authenticate. Please return to 1health and try again." when there is none; a network error → "Connection Error" / "Unable to connect to the authentication service. Please check your connection and try again."
**And** below it the buttons "Enter LPL Manually" (opens the manual-entry card), "Switch Environment" and "Go to 1health ({Demo|Production})" (same tab, the shown environment's `portalUrl`, else the environment resolved per D4)
**And** the raw `errorCode`, upstream text and exception strings are never rendered
**And** every string lives in `lib/shared/messages.ts`; strings not quoted in EXPERIENCE.md (the patient-vault launch strings, tenant title, config/disabled copy) are marked as draft copy for PM review. *(built: spec 7.0a)*

**Given** `/auth` or `/api/token` is requested
**When** the response is produced
**Then** it carries the AD-21 headers, including `frame-ancestors 'none'` and `X-Frame-Options: DENY` (the Story 1.1 header spec covers `/auth`)
**And** the screen has no framed detection, no `postMessage` and no framed-only branch; every action navigates the same tab (AD-5). *(built: spec 7.0a)*

**Given** local development
**When** a developer has a launch payload
**Then** they open `https://localhost:3000/auth?lpl=<payload>` directly or paste it into the manual-entry card (D9); there is no dev-only launch page. *(built: spec 7.0a)*

**Given** the story is done
**When** CI runs
**Then** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` and `pnpm build` pass, and the Story 1.1 forbidden-pattern step stays green. *(built: spec 7.0a)*

**Covers:** FR1, NFR1, NFR6 (as superseded), NFR7 (browsers; iframe clause superseded), AD-1 (+ `environment` in the seal), AD-3/AD-4 (as superseded by D1/D2), AD-5 (top-level only), AD-6 (module-neutral copy), AD-15, AD-18 (launch routes), AD-20 (`SESSION_SECRET_PREVIOUS` unseal), AD-21, D1, D2, D4, D5, D8, D9, PA5 · UX-DR50 (as amended; the `cookies` variant is dropped, D8; launch screens per D9), UX-DR68 (launch strings) · **Jira:** NG-9027

### Story 1.3: Secure 1health proxy — allowlist, deny list, normalization, content-type check, kill switches, no-store and logging

*Amended 2026-10-13 (architecture update: AD-2, AD-17, AD-19, AD-20).*
*Amended 2026-10-14 (decisions D5, D6): no CSRF or `X-PP-Session` checks (the 415 check stays); server logs never contain bodies.*
*Foundation 2026-10-14: built in spec 7.0a — `app/api/1h/[...path]/route.ts` + `lib/server/proxy/{normalize,deny-list,match,forward,handler,types}.ts`, allowlist with the `profile: true` tag and proxy-level `ACCOUNT_DISABLED` 503 (split per area into `lib/server/proxy/allowlist/*` by F1), `lib/server/http/content-type.ts` (415), `lib/server/log.ts`, `lib/shared/bff-contract.ts` (`BffErrorCode`, `BFF_PATHS`); entries `GET v2/user/myself`, `GET v2/user/contact-point/list`, `PUT v2/user/edit`. Use it; do not rebuild. Remaining for this story: nothing (new entries land with the story that first uses them; cross-team entries in F1, upload/image hardening in F2).*
*Foundation 2026-10-14: built in spec F2 — the deny list re-checked on the upstream segments after `me` owner substitution (`lib/server/proxy/handler.ts`, 403 `NOT_ALLOWED`); the upload entry kind (`AllowlistEntry.upload {part: "file"|"fileNewVersion", types}` + required `maxBytes`, request cap `maxBytes + 16 KiB`; `lib/server/proxy/upload.ts#readUpload`, `UPLOAD_OVERHEAD_BYTES`, `sanitizeFileName`; 413 `TOO_LARGE`, 415 `UNSUPPORTED_MEDIA`); every proxy and `/api/token` body read through `lib/server/http/read-capped.ts#readCapped` / `readStreamCapped` (non-numeric `Content-Length` → 400 `BAD_BODY`); `asImage` responses sniffed (`lib/server/http/image-sniff.ts#sniffImage`, `peekStream`: inline only for PNG/JPEG/BMP bytes, else `attachment`); `fetchWithTimeout(url, init, {timeoutMs, bodyIdleMs})` with a 10 s idle timer while an upstream body read is pending (`UPSTREAM_BODY_IDLE_MS`, `UpstreamBodyTimeoutError`); `buildUpstreamUrl` moved to `lib/server/http/upstream-url.ts`; every 503 `SERVICE_DISABLED` sends `Retry-After: 300`; the root `proxy.ts` kill switch now runs before the handler (the handler's `PP_DISABLED` and `profile: true` checks stay as the second layer). Use it; do not rebuild. Remaining for this story: nothing (each upload/image entry lands with the story that calls it; the named ops `/api/pp/*` and `/api/places/*` never go through the allowlist).*

As a Launching user,
I want every request the app makes on my behalf to go through a locked-down server proxy that acts only on my own record,
So that my token never reaches the browser and no page bug or malicious site can use my session to reach other endpoints, other people's records or cached PHI.

**Acceptance Criteria:**

**Given** `lib/server/proxy-allowlist.ts`
**When** this story is done
**Then** each entry has the shape `{ method, template, query, body, maxBytes?, asImage? }`, keyed by METHOD + template
**And** the shipped allowlist contains `GET /v2/user/myself` (no query params, no body); later stories add their own entries in the same change as the code that uses them
**And** the proxy handler is built by a factory that accepts an allowlist, so tests can inject fixture entries (e.g. `GET /v2/person/{personId}/ssn/expose`, `PUT /v2/person/location/{id}`, an entry with an allowlisted `page` query param, an entry with a server-fixed param). *(built: spec 7.0a)*

**Given** a browser request to `/api/1h/<path>`
**When** `app/api/1h/[...path]/route.ts` (exporting `dynamic = "force-dynamic"`) handles it
**Then** it forwards to `apiBase + "/" + segments.map(encodeURIComponent).join("/")`, where `apiBase` = `<apiRoot>/api` of the session's `environment` from `lib/shared/environments.ts` (D4; never `new URL(input, base)`, never a client-supplied environment), asserts the built URL's origin equals that `apiRoot` and that it re-matches the same template, and uses `cache: "no-store"`, `redirect: "manual"` and a 25 s timeout. *(built: spec 7.0a)*

**Given** a path that is not allowlisted, or that matches a deny
**When** the proxy handles it
**Then** it answers 403 `{ "errorCode": "NOT_ALLOWED", "source": "proxy" }` without calling upstream
**And** denies are exact `METHOD + template` matches, except a template ending in `/**`, which is a prefix match; `<n>` in a deny matches `^\d{1,19}$` and `*` as the method means any method
**And** the deny list is exactly: `* /auth/**`, `* v2/public/external-application/**`, any admin prefix, any GraphQL path, `POST v2/mfa/enable`, `POST v2/mfa/disable`, `* v2/mfa/enable/<n>`, `* v2/mfa/disable/<n>`, `* v2/mfa/validate/<n>`, `* v2/user/switch-tenant/**`, `* v2/user/update-password`, `* v2/tenant/sys-config`
**And** a table test with injected fixture entries for `POST v2/mfa/enable/totp` and `POST v2/mfa/disable/totp` asserts: `POST v2/mfa/enable/totp` and `POST v2/mfa/disable/totp` → allowed; `POST v2/mfa/enable` → 403; `POST v2/mfa/enable/123` → 403; `GET v2/mfa/validate/123` → 403; `POST v2/user/switch-tenant/5` → 403; `PUT v2/user/update-password` → 403; `GET v2/tenant/sys-config` → 403 (AD-2)
**And** every BFF-originated error in this story uses the body `{ "errorCode": "<STRING>", "source": "proxy" }`; upstream 4xx bodies (`{ message, code: <int> }`) pass through unchanged and are never rewritten into that shape (AD-19)
**And** a known template with a different method answers 405
**And** `HEAD`, `OPTIONS` and `TRACE` answer 405 (explicit handlers so Next does not auto-implement them), an `X-HTTP-Method-Override` header is dropped and never changes the method, and a `_method` query param is an unknown param. *(built: spec 7.0a)*

**Given** a raw path containing `//`, `%2F`, `%5C` or `%25`, or a raw or decoded segment that is empty, `.`, `..`, or contains `/ \ ; % @ :`, whitespace or a control character
**When** the proxy normalizes it before matching
**Then** it answers 400 `{ "errorCode": "BAD_PATH", "source": "proxy" }` without calling upstream
**And** a table test covers at least `..%2F`, `%2e%2e`, `%252F`, `//host`, `;x`, a trailing `/` and mixed-case segments (`V2/User/Myself`), each answering 400 or 403. *(built: spec 7.0a)*

**Given** a template containing `{personId}` or `{userId}`
**When** the client sends the literal segment `me` in that position
**Then** the proxy substitutes the id from the sealed session
**And** any other value in an owner position (including a numeric id equal to the user's own) answers 403 `{ "errorCode": "NOT_ALLOWED", "source": "proxy" }`
**And** any other id segment must match `^\d{1,19}$` or the request answers 403, and literal segments compare exactly. *(built: spec 7.0a)*

**Given** a query string
**When** the proxy checks it against the entry's query allowlist (name + value regex)
**Then** an unknown param or a value failing its regex answers 400 `{ "errorCode": "BAD_QUERY", "source": "proxy" }`
**And** server-fixed params defined by an entry (e.g. `isPublic`, `hardDelete`) are set by the server and any client-sent value for them is ignored (fixture-entry test)
**And** every `asImage` file-download entry has `preview=true` forced server-side on the upstream request, whatever the client sends (fixture-entry test, AD-2/AD-13). *(built: spec 7.0a)*

**Given** a non-GET request to `/api/1h/*` (or to `/api/session/*`, `/api/places/*`, `/api/pp/*`)
**When** the route checks it
**Then** there is no CSRF or session-binding check: no `Sec-Fetch-Site`/`Origin` check, no `X-PP-Session` header, no `lib/server/csrf.ts` or `lib/server/session-binding.ts`, and no 403 `CSRF` or 409 `SESSION_CHANGED` code (D5; cross-site write protection relies only on the `SameSite=Lax` cookie)
**And** a JSON entry receiving a `Content-Type` other than `application/json` answers 415 `{ "errorCode": "UNSUPPORTED_MEDIA", "source": "proxy" }`. *(built: spec 7.0a)*

**Given** no session cookie, or one that fails to unseal
**When** any `/api/1h` request arrives
**Then** the proxy answers 401 `{ "errorCode": "SESSION_EXPIRED", "source": "proxy" }`. *(built: spec 7.0a)*

**Given** a session whose access token expires within 30 s, or an upstream 401
**When** the proxy handles the request
**Then** it answers 401 `{ "errorCode": "TOKEN_EXPIRED", "source": "proxy" }`, does not refresh, and writes no cookie. *(built: spec 7.0a)*

**Given** an upstream response
**When** the proxy returns it
**Then** 2xx and 4xx (other than 401) pass through with their status and body, streamed without buffering
**And** an upstream 3xx answers 502 `{ "errorCode": "UPSTREAM_REDIRECT", "source": "proxy" }`, a 5xx or network error answers 502 `{ "errorCode": "UPSTREAM_ERROR", "source": "proxy" }` without the upstream body, and a timeout answers 504 `{ "errorCode": "UPSTREAM_TIMEOUT", "source": "proxy" }`
**And** `PP_DISABLED=1` makes every proxy request answer 503 `{ "errorCode": "SERVICE_DISABLED", "source": "proxy" }`
**And** the allowlist entry type carries an optional `profile: true` tag (Stories 7.5–10.3 set it on each Profile-only entry); this story is the single owner of the deny list, the tag and the proxy-level kill switch *(ownership decided 2026-10-14)*
**And** `ACCOUNT_DISABLED=1` makes requests matching an allowlist entry tagged `profile: true` (added by Epics 7–10) answer 503 `{ "errorCode": "SERVICE_DISABLED", "source": "proxy" }` without calling upstream, while every other entry keeps working; a fixture-entry test covers both (AD-20). *(built: spec 7.0a)*

**Given** headers in either direction
**When** the proxy forwards a request
**Then** only `Content-Type`, `Content-Length`, `Accept`, `Accept-Language` are forwarded, plus server-added `Authorization: Bearer <token>` and a generated `X-Request-Id`; the browser's `Cookie` is never forwarded
**And** only upstream `Content-Type`, `Content-Length` and `X-Request-Id` are returned; upstream `Set-Cookie`, `Access-Control-*`, `Cache-Control`, `Expires`, `ETag` and `Last-Modified` are dropped
**And** every proxy response, including errors, carries `Cache-Control: private, no-store, max-age=0`, `Pragma: no-cache`, `Vary: Cookie` and `X-Content-Type-Options: nosniff`
**And** a CI test asserts these headers on `GET /api/1h/v2/user/myself` and on a 403 error response, and the Story 1.1 AD-21 header spec is extended to one `/api/1h` route. *(built: spec 7.0a)*

**Given** any proxied request
**When** it is logged
**Then** the log line (`lib/server/log.ts`) contains only `{ requestId, method, template, status, durationMs }` with the template (e.g. `/v2/person/{personId}/ssn/expose`), never the concrete path, ids, query values, tokens or bodies
**And** request and response bodies are never logged on the server, also under local `next dev` (D6; the only body logger is the client `logApiCall`, Story 1.4)
**And** an unhandled error answers 500 with no upstream data and logs only `{ requestId, routeTemplate, status, errorName }`
**And** a unit test asserts a proxied call for `me` logs the template and not the substituted `personId`. *(built: spec 7.0a)*

**Covers:** NFR1, NFR6, AD-2 (exact denies, `preview=true`), AD-15 (as amended by D6), AD-17 (as superseded by D5: 415 check only), AD-18, AD-19 (error envelope), AD-20 (`PP_DISABLED`, `ACCOUNT_DISABLED`), D5, D6, PA2, D12 (single owner of deny list, profile tag, proxy-level ACCOUNT_DISABLED) · **Jira:** NG-9027

### Story 1.4: `callApi` transport, SWR keys and `useMyself`

*Amended 2026-10-13 (architecture update: AD-10, AD-17, AD-19).*
*Amended 2026-10-14 (decisions D5, D6): no `sessionBinding`/`X-PP-Session` and no `session-changed`; dev-only `logApiCall` console logger.*
*Foundation 2026-10-14: built in spec 7.0a — `lib/api/client.ts` (`callApi`, `configureApiClient`, `getPortalUrl`), `lib/api/{types,errors-codes,session-events,keys,fetcher,log-api-call}.ts`, `fetchMyself`/`Myself` (moved from `lib/api/user.ts` to `lib/api/myself.ts` by F1), `features/shell/{use-myself,swr-provider,portal-url-provider}.tsx` (one root `SWRConfig`, `usePortalUrl`). Use it; do not rebuild. Remaining for this story: nothing.*

As a Launching user,
I want every screen to load and save my data through one transport that detects session problems the same way everywhere,
So that a session that ended is noticed on any read or save, and no part of the page talks to anything but the app's own server.

**Acceptance Criteria:**

**Given** `app/page.tsx` (and, once Epic 7 builds it, `app/account/page.tsx`) renders for a valid session
**When** the server component builds the page
**Then** it embeds `portalUrl` (from `lib/shared/environments.ts` for the session's `environment`, D4; there is no `PORTAL_URL` env var) in the page and registers it with `lib/api/client.ts` on the client; the embedding lives in one shared server helper so both pages use it; there is no `sessionBinding` and no `X-PP-Session` header (D5). *(built: spec 7.0a)*

**Given** any browser code needs data
**When** it calls `callApi(context, path, init)`
**Then** `callApi` is the only browser transport (lint rule: `fetch(` is banned in `features/`, `components/` and `lib/api/` outside `client.ts`)
**And** a `path` that does not start with `/api/` (absolute URLs included) resolves `{ success: false, errorCode: "BAD_PATH" }` without a network call
**And** it sends `credentials: "same-origin"` (no `X-PP-Session`, D5), and resolves `ApiResponse<T> = { success, data?, error?, statusCode?, errorCode?, upstreamCode?, details? }` — it never throws
**And** on a non-2xx it parses the body once, recognizing two envelopes that are never mixed: a BFF body `{ errorCode: "<STRING>", source: "proxy" }` sets `errorCode` to that string; an upstream body `{ message, code }` sets `upstreamCode` to an integer `code`, keeps `message` as `error`, and `lib/api/errors.ts` derives `errorCode` from it (e.g. `SOCIAL_SECURITY_NUMBER_EXISTS`, `INVALID_ENUM_VALUE`); `details` carries backend field details; a non-JSON or empty body yields `errorCode: undefined` with a generic `error`
**And** an empty 2xx body yields `success: true` with `data: undefined`
**And** a network failure resolves `{ success: false, errorCode: "NETWORK_ERROR" }` with no `statusCode`
**And** `callApi` writes to the console only through `logApiCall` (`lib/api/log-api-call.ts`, D6): active only when `isLocalDev()` from `lib/shared/app-env.ts` (`process.env.NODE_ENV === "development"`) is true, so never in a Vercel build or under test; one `console.groupCollapsed` per call with method, path, status, duration, request body and response body, with SSN-shaped values, MFA `code`, `qrCode` and any token-like field (e.g. `access_token`, `refresh_token`, `authorization`, `*token*`) redacted
**And** a Vitest proves `logApiCall` is silent outside development and redacts each listed value; there is no in-app API Inspector. *(built: spec 7.0a)*

**Given** `callApi` receives `401 SESSION_EXPIRED`
**When** it resolves
**Then** it branches on `errorCode` only, never on status alone (there is no `SESSION_CHANGED`, D5), and publishes `session-expired` on `lib/api/session-events.ts` exactly once per page lifetime (repeat occurrences are not republished) and still returns the error `ApiResponse`
**And** `TOKEN_EXPIRED` is returned to the caller unchanged (refresh is outside this story)
**And** `session-events.ts` exposes `publish(event)` (idempotent per page lifetime) and `subscribe(event, cb)` returning an unsubscribe function. *(built: spec 7.0a)*

**Given** `lib/api/keys.ts` and the shared SWR fetcher (`lib/api/fetcher.ts`) built on `callApi`
**When** a component calls `useMyself()` (`features/shell/use-myself.ts`, key `keys.myself()` = `["pp","myself"]`, fetching `/api/1h/v2/user/myself` via `fetchMyself()` in `lib/api/user.ts`)
**Then** the data is typed, duplicate mounts share one request, and a failed fetch surfaces the `ApiResponse` error (with `errorCode`) to SWR
**And** the fetcher passes a failed `ApiResponse` to SWR `onError` without publishing session events a second time (AD-19: same event, one publisher)
**And** every SWR key in the app is built by a function in `lib/api/keys.ts` with the shape `["pp", resource, ...params]`; a lint rule or test fails on inline array keys passed to `useSWR`/`mutate` outside `keys.ts`
**And** exactly one `SWRConfig` (with the shared fetcher) sits in the root `app/layout.tsx`, so `/` and `/account` share one cache; no page or feature mounts its own `SWRConfig` provider (AD-10)
**And** the placeholder page renders the Launching user's first and last name from `useMyself()`
**And** a Testing Library + MSW test covers success, a 502 `UPSTREAM_ERROR`, a proxy 401 `{ errorCode: "SESSION_EXPIRED", source: "proxy" }` that publishes `session-expired` once, and an upstream 409 `{ message, code: <int> }` that sets `upstreamCode` and publishes nothing. *(built: spec 7.0a)*

**Covers:** NFR4, NFR5, AD-10 (keys, fetcher, one root SWR cache), AD-17 (as superseded by D5: no session binding header), AD-19 (`errorCode`/`upstreamCode`/`source`), D5, D6, PA2 · **Jira:** NG-9027

### Story 1.5: Client-coordinated token refresh

*Amended 2026-10-13 (architecture update: AD-16, AD-19).*
*Amended 2026-10-14 (decision D5): no CSRF or `X-PP-Session` check on the refresh route.*
*Foundation 2026-10-14: built in spec 7.0a — `app/api/session/refresh/route.ts` + `lib/server/session/{refresh,session-routes}.ts`, `lib/api/refresh-coordinator.ts` (single-flight + `navigator.locks`), replay rules in `callApi`. Use it; do not rebuild. Remaining for this story: nothing.*

As a Launching user,
I want my session to stay alive silently while I work, even with several tabs open,
So that I never lose work to a silent logout caused by an expired access token.

**Acceptance Criteria:**

**Given** `POST /api/session/refresh` (exporting `dynamic = "force-dynamic"`, no CSRF or session-binding check (D5), AD-18 no-store headers)
**When** the cookie's access token is still valid for more than 30 s (another tab already refreshed)
**Then** it answers 200 without calling the IdP and without changing the cookie
**And** no response body ever contains a token. *(built: spec 7.0a)*

**Given** the access token is expired or within 30 s of expiry
**When** the refresh route runs
**Then** it calls `POST <base>/auth/oauth2/token` (`<base>` from `lib/shared/environments.ts` for the session's `environment`, D4) once with `grant_type=refresh_token` and the stored refresh token, `cache: "no-store"`, 25 s timeout
**And** on success it stores the new access token, refresh token (if returned) and expiry, increments `gen`, keeps the same `sid`, re-seals `__Host-pp_s`, and answers 200
**And** on an IdP rejection (`invalid_grant` or 401) it clears the cookie and answers 401 `{ "errorCode": "SESSION_EXPIRED", "source": "proxy" }`
**And** on a network error, timeout or upstream 5xx it keeps the cookie unchanged and answers 503 `{ "errorCode": "REFRESH_UNAVAILABLE", "source": "proxy" }`
**And** with `PP_DISABLED=1` it answers 503 `{ "errorCode": "SERVICE_DISABLED", "source": "proxy" }` without calling the IdP
**And** the log line holds only `{ requestId, routeTemplate, status, durationMs }`. *(built: spec 7.0a)*

**Given** `callApi` receives `401 TOKEN_EXPIRED`
**When** it handles the response
**Then** it runs one `POST /api/session/refresh`, single-flighted within the tab (shared promise) and across tabs (`navigator.locks.request("pp-refresh", …)`; when `navigator.locks` is unavailable, in-tab single-flight only)
**And** other calls failing with `TOKEN_EXPIRED` while the refresh runs wait for it, and each failed call is replayed exactly once after a 200
**And** only a proxy-originated `TOKEN_EXPIRED` (`errorCode` with `source: "proxy"`) triggers refresh and replay; a non-GET is never replayed after a 5xx, a timeout, a network error or any other error, because it may already have reached upstream (AD-16)
**And** a replayed call that gets `TOKEN_EXPIRED` again is treated as `SESSION_EXPIRED` (event published, error returned)
**And** a refresh answering 401 `SESSION_EXPIRED` publishes `session-expired` once and returns that error to every waiting call
**And** a refresh answering 503 `REFRESH_UNAVAILABLE` returns `{ success: false, statusCode: 503, errorCode: "REFRESH_UNAVAILABLE" }` to the waiting calls, publishes no event and keeps the session, and the next `TOKEN_EXPIRED` tries a new refresh. *(built: spec 7.0a)*

**Given** the concurrency requirement (AD-16)
**When** a Vitest + MSW test fires 10 concurrent `callApi` calls across a simulated expiry
**Then** exactly 1 upstream refresh happens and all 10 calls succeed on replay
**And** a second test with two simulated tabs sharing a mocked `navigator.locks` also produces exactly 1 refresh
**And** a third test proves a `PUT` answered by 502 `UPSTREAM_ERROR` or 504 `UPSTREAM_TIMEOUT` is sent exactly once (no replay), while a `PUT` answered by proxy `TOKEN_EXPIRED` is replayed once after refresh. *(built: spec 7.0a)*

**Covers:** FR2 (silent refresh), NFR1, NFR4, AD-16 (refresh, non-GET replay rule), AD-17 (as superseded by D5), AD-18, AD-19, D5 · **Jira:** NG-9027

### Story 1.6: Idle logoff, activity ping and cross-tab activity

*Amended 2026-10-13 (architecture update: AD-16, AD-19, AD-26).*
*Amended 2026-10-14 (decision D5): no CSRF or `X-PP-Session` check on the ping; no `sessionBinding`.*
*Foundation 2026-10-14: built in spec 7.0c-1 — `IDLE_TIMEOUT_MS`, `ABSOLUTE_TIMEOUT_MS`, `isSessionAged`, `canRenewLastSeen` in `lib/server/session/session.ts`, `app/api/session/ping/route.ts` (`createPingHandler`), proxy activity re-seal (`X-PP-Activity`, `ACTIVITY_*` in `lib/shared/bff-contract.ts`), navigation re-seal in root `proxy.ts`, `lib/api/activity.ts` (`createActivity`, `pp-activity`), `recordUserActivity()` in `lib/api/session.ts`, `features/shell/idle-warning.tsx` (`IdleWarning`, mounted once in `PageFrame`), `IDLE_MESSAGES`. Use it; do not rebuild. Remaining for this story: nothing.*

As a Launching user on a shared or unattended device,
I want my session to end after 15 minutes without activity or 8 hours after launch, with a one-minute warning I can dismiss,
So that nobody can pick up my session, while I am never signed out in the middle of active work.

**Acceptance Criteria:**

**Given** the sealed cookie's `iat` and `lastSeen` (set at launch in Story 1.2)
**When** `requireSession()` runs for the page, the proxy, `/api/session/*` or any BFF route
**Then** if `now − lastSeen > 15 min` or `now − iat > 8 h`, it clears the cookie and the route answers 401 `{ "errorCode": "SESSION_EXPIRED", "source": "proxy" }` (`app/page.tsx` redirects to `/auth`, D1)
**And** unit tests cover 14:59 (allowed), 15:01 idle (rejected), and 8 h + 1 s since launch with recent activity (rejected). *(built: spec 7.0c-1)*

**Given** the RC6 activity rule
**When** a request reaches the server
**Then** `lastSeen` is updated (cookie re-sealed) only for user-initiated requests: a top-level load of `/` or `/account`, `POST /api/session/ping`, and `callApi` requests sent with the `X-PP-Activity: user` header
**And** `callApi` adds `X-PP-Activity: user` to every non-GET call and to GETs made with `{ userInitiated: true }`; the SWR fetcher (background and automatic refetches) never sends it, and `/api/session/refresh` never counts as activity
**And** a test proves 15 min of SWR revalidations alone still expire the session. *(built: spec 7.0c-1)*

**Given** `POST /api/session/ping`
**When** it is called with a valid session (AD-18 headers; no CSRF or session-binding check, D5)
**Then** it answers 204 and updates `lastSeen`; without a valid session it answers 401 `{ "errorCode": "SESSION_EXPIRED", "source": "proxy" }`. *(built: spec 7.0c-1)*

**Given** the page is open
**When** 14 min have passed since the last user-initiated request (the page receives `idleTimeoutSec = 900` and the server's `lastSeen` with `portalUrl`; the same idle timer and warning run on `/` and `/account`, mounted once in the shared shell)
**Then** a warning dialog (`features/shell/idle-warning.tsx`, shadcn Dialog, `role="alertdialog"`) shows "You'll be signed out in 1 minute" with a primary "Stay signed in" button that has initial focus
**And** activating "Stay signed in" calls `POST /api/session/ping`, closes the warning and restarts the timer
**And** if the ping answers 401 `SESSION_EXPIRED`, the warning closes and `session-expired` is published on `lib/api/session-events.ts`
**And** if no action is taken before the 15-min deadline, the warning closes and the client publishes `session-expired`
**And** the 8 h absolute limit also publishes `session-expired` at its deadline. *(built: spec 7.0c-1)*

**Given** two tabs of the same session
**When** user-initiated activity happens in one tab
**Then** it resets the other tab's timer via a `BroadcastChannel("pp-activity")` message that carries only a timestamp (no ids, no PHI), and a test asserts the message payload shape. *(built: spec 7.0c-1)*

**Given** the idle copy
**When** the warning renders
**Then** "You'll be signed out in 1 minute" and "Stay signed in" come from `lib/shared/messages.ts`, marked as architecture-added copy for PM review
**And** the dialog shows the focus ring on its button and passes an axe check in a component test. *(built: spec 7.0c-1)*

**Covers:** FR2 (expiry), NFR1, AD-16 (automatic logoff), AD-19 (error envelope), RC6, PA2 · UX-DR39, UX-DR68 (idle strings), UX-DR70 · **Jira:** NG-9027

### Story 1.7: Logout, platform revocation and the session-expired dialog

*Amended 2026-10-13 (architecture update: AD-5, AD-12, AD-16, AD-19, AD-26).*
*Amended 2026-10-14 (decisions D3, D4: platform logout `all-devices`; portal URL from the environment map).*
*Amended 2026-10-14 (decision D5): the session-changed dialog is dropped (no session binding, so `session-changed` never exists); logout has no CSRF check and also accepts GET.*
*Foundation 2026-10-14: built in spec 7.0a + 7.0b-2 — 7.0a: `app/api/session/logout/route.ts` (POST/GET, best-effort `logout/all-devices` via `lib/server/session/revoke.ts#revokeAllDevices`), `lib/shared/login-intent.ts` (`saveLoginIntent`, `consumeLoginIntent`); 7.0b-2: `features/shell/session-dialog.tsx` (`SessionDialog`), `features/shell/exit-hooks.ts` (`onBeforeSessionExpired`, `onBeforeExit`), `features/shell/navigate.ts` (`navigate`, `useNavigate`, `{external:"portal"}`), `features/shell/leave.ts` (`requestLeave`, `setLeaveGuard`), `consumeLaunchIntent()` (relaunch only to `/`). Use it; do not rebuild. Remaining for this story: nothing (the draft flush/purge that plugs into `onBeforeSessionExpired`/`onBeforeExit` is Story 1.15 → F4).*

As a Launching user,
I want a clear, safe ending when my session expires or when I go back to 1health,
So that I know what happened, my edits are not silently lost, and leaving really signs me out.

**Acceptance Criteria:**

**Given** `session-expired` is published (by `callApi`, the refresh flow, the SWR fetcher, the idle timer or the ping)
**When** the shell's `SessionDialogs` (`features/shell/session-dialogs.tsx`, the only module that opens these dialogs) handles it
**Then** it first runs every callback registered through `onBeforeSessionExpired(cb)` synchronously (errors caught, so a failing callback never blocks the dialog), which is where the draft writer will hook in
**And** then opens a non-dismissable dialog — no close button; Escape and overlay click do nothing — titled "Your session ended" with body "Your changes are kept on this device. Relaunch from 1health to continue." and a single primary "Return to 1health" with initial focus
**And** "Return to 1health" navigates the same tab to the `portalUrl` embedded by the server page (Story 1.4; the server page always embeds a `portalUrl`, resolved from the session's `environment`, else the `onehealth_environment` cookie, else `prod` (D4); the client never reads cookies) without calling logout and without deleting drafts
**And** page content stays visible behind the overlay
**And** there is no framed mode: no `useIsFramed()`, no "Close and reopen from 1health" variant and no `postMessage`; the app is always top-level (AD-5). *(built: spec 7.0b-2)*

**Given** the session-expired dialog is already open
**When** `session-expired` is published again
**Then** the dialog stays and no second dialog opens; there is no session-changed dialog, `session-changed` event or `onSessionChanged` hook (D5). *(built: spec 7.0b-2)*

**Given** the session-expired path (the session-expired dialog's action, or a client-detected `SESSION_EXPIRED`)
**When** the app sends the user back to sign in
**Then** it first saves `lib/shared/login-intent.ts#saveLoginIntent(location.pathname + location.search)` in sessionStorage `pp:login-intent`, validated like patient-vault: must start with `/` and not `//`, pathname not `/auth` or `/api` (or under them), stored as pathname + search only; `consumeLoginIntent(fallback)` reads and removes it and falls back when invalid (D9). *(built: spec 7.0a + 7.0b-2)*

**Given** `POST /api/session/logout` (also accepts `GET`, as patient-vault; no CSRF check, D5; AD-18 headers)
**When** it is called
**Then** when a session unseals it first calls, server-to-server and best effort, `POST <apiRoot>/auth/user/logout/all-devices` (`apiRoot` of the session's `environment`, D4) with `Authorization: Bearer <access token from the session>`, `cache: "no-store"` and a 5 s timeout (D3, RC5)
**And** any failure, timeout or 401 from that call is swallowed and logged only as `{ requestId, routeTemplate, status | errorName }`, never with the token
**And** it then always answers 204 with a `Set-Cookie` that clears `__Host-pp_s` (same attributes, `Max-Age=0`), whether or not a session existed or the platform call succeeded; with no session it makes no upstream call
**And** a Vitest (MSW) covers: platform 200 → 204 + cleared cookie; platform 401, 500 and timeout → still 204 + cleared cookie; no session → no upstream call, 204; the logged line never contains the token; a GET to /api/session/logout behaves identically (same 204, cleared cookie, same upstream call)
**And** `features/shell/navigate.ts` exports `navigate(target)` (AD-26); this story implements its `{ external: "portal" }` path used by app-bar "Return to 1health": `requestLeave()` → if it resolves `true`, run the registered before-exit callbacks (where Story 1.15 hooks `drafts.purgeUser`) → `POST /api/session/logout` (waiting at most 3 s, ignoring failures) → same-tab `location.assign(portalUrl)`; there is no separate `returnToPortal()` and no `returnUrl` or `next` parameter is read anywhere
**And** `requestLeave()` in `features/shell/leave.ts` exists as the single entry point for leaving actions, is called only by `navigate()` and `beforeunload`, and resolves `true` immediately while no leave guard is registered (`setLeaveGuard(fn)` lets a later guard intercept it). *(built: spec 7.0a + 7.0b-2)*

**Given** the session copy
**When** the dialog renders
**Then** every string comes from `lib/shared/messages.ts`
**And** the dialog uses the confirm-dialog anatomy (shadcn Dialog, `rounded-lg`, elevation-2, `scrim` overlay, D13), shows the focus ring on its button, and passes an axe check in a component test
**And** a Playwright spec (mocked proxy, top-level only) covers: a mocked `401 {errorCode:"SESSION_EXPIRED", source:"proxy"}` → dialog with initial focus on "Return to 1health" → same-tab navigation to the embedded `portalUrl`; app-bar Return path → logout called then same-tab navigation. *(built: spec 7.0b-2)*

**Covers:** FR2 (session-expired message), NFR1, AD-5 (no framed mode), AD-12 (`SESSION_CHANGED` purge dropped by D5), AD-16 (logout), AD-17 (as superseded by D5), AD-19, AD-26 (`navigate({external:"portal"})`), RC5, D3, D4, D5 · UX-DR37 (framed action superseded), UX-DR38 (superseded by D5), UX-DR68 (session strings) · **Jira:** NG-9027

### Story 1.8: Profile page shell — tokens, app bar, tabs and Section navigation

*Amended 2026-10-13 (architecture update: AD-5, AD-7, AD-26).*
*Amended 2026-10-14 (decisions D11, D13): non-interactive wordmark; link-text, destructive-fill, primary-text and scrim tokens.*
*Foundation 2026-10-14: built in spec 7.0b-1 + 7.0b-2 — 7.0b-1: D13 tokens in `app/globals.css` (`link-text`, `destructive-fill`, `primary-text`, `scrim`, `control-border`, `tooltip`), `scripts/check-tokens.sh`, `components/ui/{dialog,button,toast}.tsx` on tokens; 7.0b-2: `features/shell/{app-bar,page-nav,return-link,page-tabs,page-frame}.tsx` (`AppBar`, `PageNav`, `ReturnLink`, `PageTabs`/`ProfileTabs`, `PageFrame`), `components/ui/tabs.tsx`, `navigate()` page/tab targets, `ProfileTab`/`PROFILE_TABS` in `features/shell/nav-types.ts`, Medical panel. Use it; do not rebuild. Remaining for this story: Section menu, Jump to (`components/ui/select.tsx`, F5 Select), scroll-spy, hash deep links, `SectionFrame` skeleton/error and the Contacts/Insurance Section containers → F3 (port of main Story 1.8B).*
*Foundation 2026-10-14: built in spec F3-1 — `components/ui/select.tsx` ported from main `b005536` (`Select`, `SelectTrigger` with `size` `sm|default`, `SelectContent`, `SelectItem`, `SelectValue`, `SelectGroup`, `SelectLabel`, `SelectSeparator`, scroll buttons; `@radix-ui/react-select@2.3.7` pinned, `control-border`), the `@utility focus-ring` in `app/globals.css` (2 px ring outline, 2 px offset, `shadow-glow` on `:focus-visible`) adopted by Button, Input, Select, toast action/close, dialog close, page nav and Return to 1health (tabs keep their inset ring, which the scrolling strip would clip), `LoadError` moved onto `InlineBanner` (copy and behaviour unchanged, new `attempt` prop). Use it; do not rebuild. Remaining for this story: Section menu, Jump to (on this Select), scroll-spy, hash deep links, `SectionFrame` skeleton/error and the Contacts/Insurance containers → F3-3 (port of main Story 1.8B). Callers of `LoadError`/`ReadStateFor` pass `attempt` (failure count) so a repeated failure is re-announced.*
*Foundation 2026-10-14: built in spec F3-3 — `features/shell/anchors.ts` (`PROFILE_SECTIONS` 01–05, `PROFILE_SECTION_IDS`, `SIGNATURE_ANCHOR`, `PROFILE_SUB_ANCHORS`, `SECTION_COLUMNS`), `SectionNav` + `useSectionNavigation()` (sticky 200 px `<nav aria-label="Sections">` with number/label/count and `aria-current="location"`; below 768 px "Jump to" on the F3-1 Select with focus to the `h2` on close; smooth or instant scroll per reduced motion; scroll-spy `rootMargin "0px 0px -60% 0px"` pinned to the activated item until a hand scroll (`hand-scroll.ts#onHandScroll`), last Section current at the page end; the hash is replaced with `history.replaceState` keeping other params and never calls `navigate()`/`requestLeave()`, so a dirty Section opens no dialog), `useHashAnchors(ids, { focusHeading?, subAnchors?, onFollow? })` → `{ frameReady(id), cancelPending() }` (load, `hashchange` and `HASH_NAVIGATE_EVENT`; `#signature` → the Signature row; unknown hashes ignored; one re-scroll when the target `StateFrame` becomes ready), `SectionLandmark` (`<section id aria-labelledby>` + 44 px `h2#<id>-heading` `tabIndex=-1`), `SectionCountProvider` + `useReportSectionCount(id, n)` (menu counts, blank until reported), `ContactsPanel`/`InsurancePanel` wired into `ProfileTabs` (`PageTabs` `panelOptions`: Contacts bare and out of the Tab order), and `StateFrame` (`features/shell/state-frame.tsx`) in place of the planned `section-frame.tsx` (`skeleton="table"` with `columns`: 36 px header + three 44 px rows, "Couldn't load {noun}" + Retry from `SECTION_LOAD_NOUNS`, Retry isolated per frame, `onReady`); copy in `SHELL_MESSAGES`/`STATE_MESSAGES`; e2e in `e2e/shell.spec.ts` ("Section navigation"). Use it; do not rebuild. Remaining for this story: nothing. Epics 2–5 replace each placeholder `StateFrame` in `features/shell/contacts-panel.tsx` / `insurance-panel.tsx` with their Section (keep `onReady={() => nav.frameReady(id)}` and the `signature` anchor) and report counts with `useReportSectionCount`.*

As a Launching user on any device,
I want a profile page with an app bar, Contacts / Insurance / Medical tabs and a numbered Section menu I can deep-link into,
So that I can find any part of my profile quickly, by mouse, touch or keyboard, from 360 px phones to desktop.

**Acceptance Criteria:**

**Given** `app/globals.css`
**When** the 1health tokens are wired with the DESIGN.md overrides
**Then** text links use the `link-text` token (`text-link-text`: #256a8c in light, signal-aqua #8fd8e6 in dark)
**And** the destructive button variant fills with the `destructive-fill` token (`bg-destructive-fill`: #b23a31, white text, in both light and dark mode)
**And** a `primary-text` token (#246b8f light, #6fb6d8 dark) styles text in the primary hue, including the wordmark, while primary fills keep `primary` *(2026-10-14)*
**And** a `scrim` token (graphite at 45 % light, black at 60 % dark) is the overlay of every dialog and the drawer, replacing the template's `bg-black/50` *(2026-10-14)*
**And** a `control-border` token is #7a8696 in light and mist #aeb8c4 in dark, used by Input, Select and the Jump to control, while table rules and card hairlines keep `--border`
**And** tooltip tokens are graphite #202833 / white in light and #e6ebf0 / #202833 in dark
**And** adding `class="dark"` to `<html>` switches every token to its DESIGN.md `-dark` value (background #202833, card #29333f, ring #8fd8e6); light is the default
**And** a comment block in `globals.css` lists the design-system deviations and additions (link-text, destructive-fill, control-border, primary-text, scrim) to be reported upstream and kept until globals.css changes
**And** a lint/CI check fails on hex colors or Tailwind palette color classes (e.g. `bg-red-500`) in `components/`, `features/` and `app/` outside `globals.css`
**And** the same check fails on `text-info-strong` in links and on `bg-error-strong` anywhere (use `text-link-text` / `bg-destructive-fill`, D13). *(built: spec 7.0b-1)*

**Given** the page at ≥ 768 px
**When** it renders
**Then** the order is app bar → header slot → tab strip → two-column body (sticky 200 px Section menu with right hairline + fluid main column, 24 px padding, 32 px between Sections)
**And** the app bar is a 52 px card bar with bottom border showing the "1health" wordmark (`primary-text`, bold), a vertical rule, and, in place of a page title, a two-item page nav (`<nav aria-label="Pages">`) with the destinations "Personal Profile" (`/`) and "Account" (`/account`); the item for the current page carries `aria-current="page"` and the active styling, and the same app bar is used on both pages *(built: spec 7.0b-2)*
**And** the "1health" wordmark is non-interactive text (a `span`, not a link or button): it receives no focus, has no `href` and no click handler *(2026-10-14)* *(built: spec 7.0b-2)*
**And** activating a page-nav item calls the shell's `navigate({ page: "profile" })` or `navigate({ page: "account" })` (AD-26), which runs the current page's leave guard (`requestLeave()`) and then does a client navigation (`router.push`) that keeps the shared SWR cache; activating the current page's item does nothing; the `/account` page itself is built in Epic 7 *(built: spec 7.0b-2)*
**And** `navigate()` in `features/shell/navigate.ts` gains the page targets `{ page: "profile" | "account", tab?, hash? }` in this story (the external portal target is from Story 1.7); `next/link` and raw `<a href>` to `/` or `/account` are not used anywhere outside `features/shell` (Story 1.1 lint rule) *(built: spec 7.0b-2)*
**And** below 768 px the page nav renders as a segmented control that wraps onto its own row under the wordmark below 400 px, with every item keeping a 44 px hit area *(built: spec 7.0b-2)*
**And** the right side always shows a "Return to 1health" link (link-text color, external-link icon, 44 px target, underline on hover) that calls `navigate({ external: "portal" })` (Story 1.7: leave guard, then logout, then same-tab navigation to the embedded `portalUrl`, D4); there is no framed variant and it is never hidden (AD-5). *(built: spec 7.0b-2)*

**Given** the tab strip (shadcn Tabs added to `components/ui/tabs.tsx`, plus shadcn Select in `components/ui/select.tsx`, each at a pinned exact version) *(built: Tabs spec 7.0b-2; Select spec F3-1, `@radix-ui/react-select@2.3.7`)*
**When** it renders
**Then** it has three tabs, "Contacts", "Insurance" and "Medical", 44 px tall with 12 px side padding; the active tab is foreground 600 with a 2 px primary underline overlapping the strip border *(built: spec 7.0b-2)*
**And** Medical is a normal selectable tab carrying a "Coming soon" tag ("Soon" below 768 px) *(built: spec 7.0b-2)*
**And** it uses `role="tablist"`, `role="tab"` with `aria-selected`, and `role="tabpanel"` linked by `aria-controls`/`aria-labelledby` *(built: spec 7.0b-2)*
**And** Left/Right arrow keys move focus between tabs (wrapping), Home/End jump to first/last, and Enter or Space activates the focused tab (manual activation). *(built: spec 7.0b-2)*

**Given** the user activates a tab
**When** the tab changes
**Then** the URL becomes `?tab=contacts|insurance|medical` via a replace (no extra history entry, no scroll jump) and the hash is dropped *(built: spec 7.0b-2)*
**And** the tab change goes through `navigate({ page: "profile", tab })` so the leave guard can intercept it *(built: spec 7.0b-2)*
**And** tab ids are the typed enum `ProfileTab` (`contacts|insurance|medical`) exported from `features/shell`; no component passes a bare tab string (AD-7). *(built: spec 7.0b-2)*

**Given** a URL with `?tab=` missing or not in `contacts|insurance|medical`
**When** the page loads
**Then** the Contacts tab is shown and the URL is normalized to `?tab=contacts` *(built: spec 7.0b-2)*
**And** a refresh of `?tab=insurance` or `?tab=medical` reopens that tab. *(built: spec 7.0b-2)*

**Given** the Contacts tab at ≥ 768 px
**When** it renders
**Then** a sticky 200 px `<nav aria-label="Sections">` lists five items, each with a mono number, label and count slot: "01 Personal information", "02 Phone", "03 Email", "04 Social media", "05 Addresses" (count blank until Sections supply one) *(built: spec F3-3)*
**And** the main column holds five Section containers in that order with ids `personal`, `phone`, `email`, `social`, `addresses`, each an `aria-labelledby` region with an `h2` title focusable via `tabIndex={-1}` *(built: spec F3-3, `SectionLandmark`)*
**And** the Personal information container includes a placeholder row with id `signature`. *(built: spec F3-3)*

**Given** a Section menu item is activated by click, Enter or Space
**When** the action runs
**Then** the page scrolls to that Section (smooth, or instant under `prefers-reduced-motion: reduce`), focus moves to the Section `h2`, and the hash updates to `#<id>` without adding a history entry *(built: spec F3-3)*
**And** while scrolling, a scroll-spy (IntersectionObserver) sets `aria-current="location"` on exactly one item — the Section in view — styled with accent background, a 3 px inset primary bar and primary number/count. *(built: spec F3-3)*

**Given** the Contacts tab below 768 px
**When** it renders
**Then** the menu is replaced by a full-width "Jump to" select under the tabs with the same five options (mono number + name) and the same scroll, focus and hash behavior *(built: spec F3-3)*
**And** the Insurance and Medical tabs show neither the menu nor Jump to, and Insurance content uses the full main-column width. *(built: spec F3-3)*

**Given** a deep link `?tab=contacts#<hash>`
**When** the page loads or `hashchange` fires
**Then** `#personal`, `#phone`, `#email`, `#social` or `#addresses` scrolls to that Section and `#signature` scrolls to the Signature row inside Personal information *(built: spec F3-3)*
**And** an unknown hash, or any hash on the Insurance or Medical tab, leaves the page at the top of the tab without error *(built: spec F3-3)*
**And** tab and hash survive a refresh (Playwright test for `?tab=contacts#signature`). *(built: spec F3-3)*

**Given** a Section placeholder
**When** it is in its loading state
**Then** `SectionFrame` (`features/shell/section-frame.tsx`) renders three skeleton rows inside the real table container with column headers (shimmer, static under reduced motion), while the app bar, header slot, tabs and menu render immediately *(built: spec F3-3 as `StateFrame skeleton="table"` in `features/shell/state-frame.tsx`; there is no `section-frame.tsx`)*
**And** in its error state it replaces the rows with an inline error banner (alert icon, error-strong text) "Couldn't load {section} · Retry" whose Retry calls that Section's retry handler only, leaving other Sections untouched *(built: spec F3-3)*
**And** a component test proves an error in one `SectionFrame` does not change the state of the others. *(built: spec F3-3, `state-frame.test.tsx`)*

**Given** the Insurance tab
**When** it renders
**Then** it shows one Section container with id `insurance` in its loading placeholder state and no menu. *(built: spec F3-3, `InsurancePanel`)*

**Given** the Medical tab
**When** it renders
**Then** it shows a quiet centered muted panel with exactly "Coming soon: medications, allergies and conditions will appear here" *(EXPERIENCE.md copy, human decision 2026-10-14; was RC9 "Coming soon: your medical information will appear here.")*" (RC9), no action *(built: spec 7.0b-2)*
**And** an MSW test asserts that switching to Medical issues no network request. *(built: spec 7.0c-1, `page-tabs.test.tsx`)*

**Given** a 360 × 740 viewport (Playwright mobile project)
**When** each tab is opened
**Then** `document.documentElement.scrollWidth <= clientWidth` (no horizontal scroll), page gutters are 16 px, and every interactive control (page nav items, tabs, menu items, Jump to, Return to 1health, Retry) has a hit area of at least 44 × 44 px. *(built: spec 7.0b-2 + F3-3, `e2e/shell.spec.ts`)*

**Given** keyboard-only use
**When** the user tabs through the page
**Then** the order is app bar (page nav Personal Profile → Account, Return to 1health) → header slot → tabs → Section menu (or Jump to) → Sections in order *(built: spec 7.0b-2 + F3-3; the header slot content is Story 1.9)*
**And** every interactive element shows the focus ring (2 px ring-color outline, 2 px offset, `shadow-glow`) on `:focus-visible`, and focus is never removed or trapped *(built: spec 7.0b-2)*
**And** an `@axe-core/playwright` scan (pinned version) of each tab in light and dark themes, at desktop and 360 px, reports no WCAG 2.1 AA violations. *(built: spec 7.0b-2 + F3-3, `e2e/shell.spec.ts`)*

**Given** shell copy
**When** it renders
**Then** page-nav labels ("Personal Profile", "Account"), tab names, "Coming soon", "Soon", "Jump to", Section labels, the Medical text and the load-error template come from `lib/shared/messages.ts`, and `h2` titles use the section-title role (text-body 600) with mono-index numbers. *(built: spec 7.0b-2 + F3-3; the catalog is `lib/shared/messages/{shell,state}.ts`)*

**Note:** Accepted 2026-10-13: the Account item may point to /account before Epic 7 lands (same release).

**Covers:** FR3, FR8, FR32, FR101 (app-bar entry to `/account`), NFR2, NFR3, NFR4, NFR5, NFR7 (browsers; iframe clause superseded), AD-5 (Return always rendered, same tab), AD-7 (Section ids, typed `ProfileTab`, unknown tab/hash), AD-26 (app-bar page nav, `navigate()`), RC9, PRC4, D10 (never framed), D11 (wordmark, tab order), D13 (tokens) · UX-DR1, UX-DR2, UX-DR3, UX-DR4, UX-DR5, UX-DR6, UX-DR8, UX-DR9, UX-DR11, UX-DR12, UX-DR13 (framed-hide clause superseded), UX-DR17, UX-DR18, UX-DR19, UX-DR33, UX-DR34, UX-DR35, UX-DR51, UX-DR57, UX-DR58, UX-DR60, UX-DR62, UX-DR63, UX-DR64, UX-DR66, UX-DR67, UX-DR68 · **Jira:** NG-9020

### Story 1.9: Profile header view — name, picture and primary contacts

*Amended 2026-10-13 (architecture update: AD-10, AD-19).*
*Foundation 2026-10-14: built in spec 7.0b-2 — `features/header/*` (`ProfileHeader`, `displayName`, `initials`; initials-only avatar, name `h1`, skeleton, primary phone/email ≥ 768 px via `use-primary-contacts.ts`), `lib/api/contact-points.ts` (`fetchContactPoints`, `findPrimary`, `ContactPoint`), `keys.myself()`, `keys.contactPoints(type)`. Use it; do not rebuild. Remaining for this story: F1: `keys.profilePictureId()`, `Social Media` in the `contact-point/list` entry, `formatPhoneDisplay` for the header phone, `lib/shared/initials`; F2: named-op wrapper for `GET /api/pp/profile-picture-id` and `asImage` download hardening; Team A: the picture route, the `profile-picture/preview` entry and the `<img>` avatar with `onerror` fallback.*
*Foundation 2026-10-14: built in spec F1 — `keys.profilePictureId()` = `["pp","profile-picture-id"]` (declared, no loader yet), `Social Media` in the `GET v2/user/contact-point/list` entry (`lib/server/proxy/allowlist/contacts.ts` + `contacts.test.ts`), the header phone formatted with `formatPhoneDisplay(value, row.phoneNumberRegion)` (`lib/shared/phone.ts`), `initials()` moved to `lib/shared/initials.ts`, every key tuple asserted in `lib/api/keys.test.ts`, `mutateMyself()` / `mutateContactPoints(...types)`. Use it; do not rebuild. Remaining for this story: F2: named-op wrapper for `GET /api/pp/profile-picture-id` and `asImage` inline/attachment hardening; Team A: the picture route and its `profile-picture-id` loader, the `profile-picture/preview` entry in `lib/server/proxy/allowlist/files.ts`, the `<img>` avatar with `onerror` fallback, the mutate-refresh component test. Header copy goes in `lib/shared/messages/header.ts`.*
*Foundation 2026-10-14: built in spec F2 — `GET /api/pp/profile-picture-id` (`app/api/pp/profile-picture-id/route.ts` → `lib/server/named-ops/profile-picture-id.ts#createProfilePictureIdHandler` on `lib/server/named-op.ts#createNamedOp`; server-stored `PROFILE_PICTURE_QUERY` with the id taken only from `session.userId`; `200 {fileId:number|null}` typed `ProfilePictureIdBody`, `BFF_PATHS.profilePictureId` in `lib/shared/bff-contract.ts`; kill switch `"pp"`; a decimal-string id is accepted; upstream 401 → `TOKEN_EXPIRED`, timeout → 504, other upstream errors or GraphQL `errors` → 502) and the generic `asImage` hardening (`lib/server/proxy/forward.ts` + `lib/server/http/image-sniff.ts`): inline with `Content-Type` taken from the leading bytes for PNG/JPEG/BMP (the declared type is ignored because `profile-picture/preview` always declares `image/jpeg`), otherwise `attachment; filename="file"` + `application/octet-stream`; upstream `Set-Cookie`/`Content-Disposition`/`Content-Length` never forwarded. Use it; do not rebuild. Remaining for this story: Team A: the `profile-picture-id` loader (`registerFetcher` for `keys.profilePictureId()`, via `callApi`), the `GET v2/user/profile-picture/preview` `asImage` entry (query `v` `^\d{1,19}$`) in `lib/server/proxy/allowlist/files.ts`, the `<img>` avatar with `onerror` fallback, the mutate-refresh component test and the axe run.*

As a Launching user,
I want to see my name, Profile Picture and primary contacts in the profile header,
So that I can confirm whose profile I am editing at a glance.

**Acceptance Criteria:**

**Given** `lib/api/keys.ts`
**When** this story is done
**Then** it defines exactly these header keys, which every later story (Contacts and the `/account` pickers) reuses instead of defining its own: `keys.myself()` = `["pp","myself"]` (from Story 1.4), `keys.contactPoints(type)` = `["pp","contact-points",type]` with exactly one Contact Type per key — `contactPoints("Mobile")` (fetches `type=Mobile`), `contactPoints("Landline")` (fetches `type=Landline`), `contactPoints("Email")` (fetches `type=Email`) — and `keys.profilePictureId()` = `["pp","profile-picture-id"]` (AD-10, PA3) *(built: spec F1)*
**And** there is no combined key such as `["pp","contact-points","Phone"]`; a multi-type read (the header's primary phone) composes the `Mobile` and `Landline` keys *(built: spec 7.0b-2)*
**And** `fetchContactPoints(type)` in `lib/api/contact-points.ts` issues one `callApi` `GET /api/1h/v2/user/contact-point/list?type=<type>` per key and returns typed rows `{id, value, type, label, isVerified, isNotificationEnabled, phoneNumberRegion}` *(built: spec 7.0b-2)*
**And** the proxy allowlist entry for `GET /v2/user/contact-point/list` is added in this change (no body; allowed query: repeated `type` matching `^(Mobile|Landline|Email|Social Media)$`, any other param → 400 `BAD_QUERY`), with a proxy test *(built: spec F1)*
**And** a unit test asserts the per-type key tuples above so Epic 3 Sections and the `/account` Account settings save (Epic 7) that `mutate` them refresh the header. *(built: spec F1)*

**Given** a signed-in user whose `["pp","myself"]` key (Story 1.4 `useMyself`) has resolved
**When** the profile page renders
**Then** `features/header` renders a header band (background, bottom border, page-gutter padding 24 px desktop / 16 px mobile) with the 40 px avatar and `{firstName} {lastName}` from `myself` as the page's single `h1` in the profile-name type role *(built: spec 7.0b-2)*
**And** while `myself` is loading the header frame renders immediately with a skeleton for the name and avatar (no layout shift larger than the 40 px avatar box) *(built: spec 7.0b-2)*
**And** no "Last updated" line is rendered (RC8). *(built: spec 7.0b-2)*

**Given** the viewport is >= 768 px
**When** the header renders
**Then** the primary phone and primary email (the row labelled Primary) are right-aligned (muted label, foreground 500 tabular value) read from `contactPoints("Mobile")` + `contactPoints("Landline")` (primary phone) and `contactPoints("Email")`, and a missing primary or a failed request renders nothing for that item (the header never shows an error) *(built: spec 7.0b-2)*
**And** below 768 px only the avatar and name render, and the contact-point keys are not fetched by the header (UX-DR14, UX-DR67). *(built: spec 7.0b-2)*

**Given** any `mutate` of `["pp","myself"]`, `contactPoints("Mobile")`, `contactPoints("Landline")` or `contactPoints("Email")`, whether from a Contacts save or an `/account` Account settings save (one root SWR cache, AD-10)
**When** the new data arrives
**Then** the header name and primary phone/email update without a page reload (FR9; component test mutates each key).

**Given** a signed-in session
**When** the client calls `GET /api/pp/profile-picture-id` (via `callApi`, key `["pp","profile-picture-id"]`)
**Then** `app/api/pp/profile-picture-id/route.ts` (exporting `dynamic = "force-dynamic"`) calls `requireSession()`, runs a GraphQL query document stored on the server (`Person(userId){PersonHasProfilePictureFile}`) with variables taken only from the session (no client-supplied ids or query text), with `cache: "no-store"` *(built: spec F2)*
**And** it responds `200 {"fileId": <number>}` or `200 {"fileId": null}` with `Cache-Control: private, no-store, max-age=0`, `Pragma: no-cache`, `Vary: Cookie` *(built: spec F2)*
**And** without a session it responds `401 {"errorCode":"SESSION_EXPIRED","source":"proxy"}`, it has no `X-PP-Session` or session-binding check (D5), with `PP_DISABLED=1` it answers 503 `{"errorCode":"SERVICE_DISABLED","source":"proxy"}`, and it is the only GraphQL path in the app (`/api/1h/**` still returns 403 `NOT_ALLOWED` for any GraphQL path) *(built: spec F2)*
**And** an upstream error returns `502 {"errorCode":"UPSTREAM_ERROR","source":"proxy"}` without the upstream body, and the server log line carries only `{requestId, routeTemplate, status, errorName}`. *(built: spec F2)*

**Given** `profile-picture-id` returns a `fileId`
**When** the avatar renders
**Then** it is an `<img src="/api/1h/v2/user/profile-picture/preview?v={fileId}" alt="">`, and the proxy allowlist entry `GET /v2/user/profile-picture/preview` is added in this change as the first `asImage` entry (allowed query: `v` matching `^\d{1,19}$`; there is no `X-PP-Session` header, D5)
**And** this story implements the proxy's `asImage` handling used by every later image entry: the response carries `Content-Disposition: inline` only when the declared type is `image/png|jpeg|bmp` and the leading bytes match, otherwise `attachment; filename="file"`, plus `X-Content-Type-Options: nosniff` and `Cache-Control: private, no-store, max-age=0` (upstream `ETag`, `Last-Modified`, `Expires`, `Cache-Control` dropped); a table test covers PNG, JPEG, BMP, SVG and HTML bodies *(built: spec F2; inline and `Content-Type` are decided from the leading bytes alone, because `profile-picture/preview` always declares `image/jpeg`)*
**And** if the image fails to load (`onerror`) the avatar falls back to the initials placeholder.

**Given** `fileId` is `null`, or `myself` has a first and last name but no picture
**When** the avatar renders
**Then** it shows the initials (first letter of first name + first letter of last name, uppercase, primary color, weight 600) on a card-background circle with a border; a user with only one name shows one initial; no name shows a user icon.

**Given** the header in light and dark theme at 360 px and 1280 px
**When** axe runs (Playwright, mocked proxy)
**Then** there are no axe violations and there is no horizontal scroll at 360 px.

**Covers:** FR9, NFR1, NFR2, NFR4, AD-2, AD-10 (per-type contact-point keys, shared cache), AD-13 (asImage downloads), AD-17 (as superseded by D5), AD-18, AD-19 (error envelope), PA2, PA3 · UX-DR8, UX-DR9, UX-DR14, UX-DR67, UX-DR68 · **Jira:** NG-9021

### Story 1.10: Change Profile Picture

*Amended 2026-10-13 (architecture update: AD-19).*
*Foundation 2026-10-14: nothing built yet by specs 7.0a–7.0c-1. Remaining for this story: everything: F2 adds the generic upload-entry mechanism (multipart, magic bytes, `maxBytes`, streaming cap) and image hardening; Team A builds the dialog, `image-reencode`, the upload/`DELETE v2/file` entries and the avatar button. Reuse `ConfirmDialog`-style anatomy, `scrim` and `Button` from 7.0b-1.*
*Foundation 2026-10-14: built in spec F1 — `keys.profilePictureId()` (revalidate it after upload or removal), `lib/server/proxy/allowlist/files.ts` (the file-entry area file, with the `GET v2/file/{fileId}/download` image entry). Use it; do not rebuild. Remaining for this story: unchanged (F2 upload mechanism; Team A dialog, upload/`DELETE v2/file` entries in `allowlist/files.ts`, copy in `lib/shared/messages/header.ts`).*
*Foundation 2026-10-14: built in spec F2 — the generic upload-entry mechanism (`AllowlistEntry.upload {part, types}` + required `maxBytes` in `lib/server/proxy/types.ts`; `lib/server/proxy/upload.ts#readUpload` streams through `lib/server/http/read-capped.ts#readCapped`, needs `multipart/form-data` with a boundary and exactly one form entry (a File part with the entry's name), checks magic bytes, and rebuilds the upstream body as a new `FormData` with one Blob typed from the sniffed bytes and a `sanitizeFileName` name) with the Story 1.10 table test (`upload.test.ts`, `handler.test.ts`), and the picture upload entry in `lib/server/proxy/allowlist/core.ts` (`IMAGE_UPLOAD_MAX_BYTES` 4 MB, `isPublic=true` forced, part `file`, PNG/JPEG/BMP). **Deviation:** the picture entry accepts **no client query** (`?fileName=` → 400 `BAD_QUERY`); the upstream file name is the server-sanitized multipart filename, so the client sets `{sanitized name}.jpg` as the `file` part's filename. Use it; do not rebuild. Remaining for this story: Team A: the dialog, `lib/shared/image-reencode.ts`, the avatar button, the `DELETE v2/file/{id}` entry (`hardDelete=true` forced) in `allowlist/files.ts`, the client upload/delete flow and its tests; decide a server-side re-encode / EXIF strip for the public picture (e.g. sharp) or record it as an accepted AD-13 risk (deferred-work: public picture uploads keep EXIF incl. GPS and trailing payloads; the BFF only sniffs magic bytes).*
*Foundation 2026-10-14: built in spec F3-1 — `toastSuccess(text)` in `features/shell/toasts.ts` (for "Profile picture saved."), `Button` `busy` + `busyLabel` (Save → spinner + "Saving…", inert, focus kept), `FieldError` (alert icon + error-strong line), `focus-ring` for the avatar button. Use it; do not rebuild. Remaining for this story: unchanged (Team A dialog, re-encode, avatar button, `DELETE v2/file` entry, EXIF decision); call `toastSuccess` directly (Story 1.12's "moved to `toastSuccess`" clause is met when this story lands).*

As a Launching user,
I want to replace my Profile Picture from the header, with a preview before I save,
So that I can keep my photo current without leaving the app.

**Acceptance Criteria:**

**Given** the header from Story 1.9, with or without a picture
**When** the user inspects the avatar
**Then** the whole avatar is a `<button>` whose hit area is 44 x 44 px around the 40 px circle, with accessible name "Change profile picture", the 2 px focus ring + glow on `:focus-visible`, and an 18 px primary camera badge bottom-right (white 11 px camera icon, 2 px card ring) shown in both states
**And** click, Enter or Space opens the native file picker with `accept="image/jpeg,image/png,image/bmp,.jpg,.jpeg,.png,.bmp"` (UX-DR15).

**Given** the file picker is open
**When** the user cancels it without choosing a file
**Then** no dialog opens and focus returns to the avatar button.

**Given** the user chose a JPG, PNG or BMP file of at most 6 MB (6 x 1024 x 1024 bytes), type checked by MIME type and extension
**When** the file is chosen
**Then** the "Change profile picture" dialog opens: 440 px wide (full width minus 16 px gutters below 768 px), `rounded-lg`, `shadow-lg`, over the scrim; title "Change profile picture"; a 96 px circular preview of the chosen file (object URL, revoked when the dialog closes); the file name (500, ellipsis) with "{TYPE} · {size}" muted (e.g. "JPG · 2.4 MB"); outline button "Choose another file"; rules line with info icon "JPG, PNG or BMP, up to 6 MB."; footer Cancel (secondary) and Save (primary)
**And** focus starts on Cancel, Escape or Cancel closes the dialog with no request sent and focus returns to the avatar button.

**Given** the user chose a file larger than 6 MB
**When** the dialog opens
**Then** the preview keeps the current picture (or initials) captioned "Current picture · Not changed", the error line (alert icon, error-strong) reads "{file name} is {size}. Choose a file up to 6 MB." (e.g. "maria-portrait.bmp is 9.2 MB. Choose a file up to 6 MB."), and Save has `aria-disabled="true"` with `aria-describedby` pointing to the error line id; activating Save does nothing and no request is sent.

**Given** the user chose a file that is not JPG, PNG or BMP (e.g. `.gif`, `.svg`, `.heic`, `.pdf`), or a file with an accepted extension that the browser cannot decode as an image
**When** the dialog opens
**Then** it shows the same error state with the line "{file name} isn't a JPG, PNG or BMP. Choose another file." (draft copy, flagged in `messages.ts` for PM review) and Save is aria-disabled as above; no request is sent.

**Given** the dialog is in any state
**When** the user activates "Choose another file" and picks a new file
**Then** the picker reopens, and the dialog re-evaluates the new file (valid preview or error state); cancelling the picker keeps the dialog state unchanged.

**Given** the shared helper `lib/shared/image-reencode.ts` created in this story
**When** `reencodeImage(file, { format: 'jpeg' | 'png', maxBytes, maxDims })` is called
**Then** it decodes the image (PNG, JPEG or BMP), scales it to fit `maxDims` (`{ width, height }`, either orientation) without upscaling, and re-encodes it through a canvas: for `'jpeg'` transparency is flattened onto white and quality steps down (0.92, 0.85, 0.75, 0.6) before dimensions scale by 0.8 per step; for `'png'` dimensions scale by 0.8 per step; it stops at the first blob `<= maxBytes` (RC11, AD-13)
**And** it resolves `{ ok: true, blob, width, height }`, or `{ ok: false, reason: "UNDECODABLE" | "TOO_LARGE" }` when the image cannot be decoded or cannot reach `maxBytes` before its shorter side drops below 64 px; it never throws and has no network or storage side effects
**And** unit tests (Vitest with a pinned canvas implementation for jsdom, or a Playwright component test) prove: a 5.9 MB PNG and a 5.5 MB BMP each produce a JPEG `<= 4 MB` with `{format:'jpeg', maxBytes: 4 MB}`; a 300 KB JPEG passes with dimensions unchanged; a large drawing PNG produces a PNG `<= 1 MB` with `{format:'png', maxBytes: 1 MB}`; a corrupt file yields `UNDECODABLE`
**And** this is the only image re-encode code in the app; every later image upload reuses it instead of adding its own.

**Given** a valid file is previewed
**When** the user activates Save
**Then** the client calls `reencodeImage(file, { format: 'jpeg', maxBytes: 4 * 1024 * 1024, maxDims: { width: 4096, height: 4096 } })`
**And** Save shows a spinner with "Saving…", Cancel and "Choose another file" are disabled, and the dialog cannot be dismissed with Escape while saving.

**Given** the re-encoded blob is ready
**When** the upload runs
**Then** the client first reads the current `fileId` from `GET /api/pp/profile-picture-id`, then sends `POST /api/1h/v2/health/type/Person/me/relation/PersonHasProfilePictureFile/file/upload?fileName={sanitized name}.jpg` as `multipart/form-data` with exactly one part named `file`, via `callApi` (the client sends no `isPublic`)
**And** the proxy allowlist entry for that upload is added in this change: `{personId}` filled from the session (`me` only), allowed query `fileName` matching `^[A-Za-z0-9._-]{1,100}$`, `isPublic=true` forced server-side (a client-sent `isPublic` value is ignored), `maxBytes` 4 MB, part name `file`, magic bytes PNG/JPEG/BMP.

**Given** the generic upload-entry mechanism this story adds to `lib/server/proxy-allowlist.ts` (`maxBytes`, part name and allowed magic bytes per entry; upload bodies buffered up to `maxBytes`, nothing else buffered)
**When** a request arrives on an upload entry
**Then** a `Content-Length` over `maxBytes`, or a body exceeding `maxBytes` while reading, returns `413 {"errorCode":"TOO_LARGE","source":"proxy"}` without calling upstream *(built: spec F2)*
**And** a body that is not `multipart/form-data` with exactly one file part named as the entry expects returns `415 {"errorCode":"UNSUPPORTED_MEDIA","source":"proxy"}` without calling upstream *(built: spec F2)*
**And** a file part whose leading bytes are not one of the entry's allowed types — PNG (`89 50 4E 47 0D 0A 1A 0A`), JPEG (`FF D8 FF`), BMP (`42 4D`) — returns `415 {"errorCode":"UNSUPPORTED_MEDIA","source":"proxy"}` without calling upstream *(built: spec F2)*
**And** a table-driven Vitest covers: 4 MB exactly (accepted), 4 MB + 1 byte (413 via header and via a chunked body without `Content-Length`), SVG/HTML/GIF payloads renamed `.png` (415), two file parts (415), part named `image` (415), a JSON body (415), and a PNG-only fixture entry rejecting a JPEG (415). *(built: spec F2)*

**Given** the upload succeeded and an old `fileId` existed
**When** the client continues
**Then** it sends `DELETE /api/1h/v2/file/{oldId}` with no query, and the proxy allowlist entry `DELETE /v2/file/{id}` is added in this change with `hardDelete=true` forced server-side (any client-sent `hardDelete` ignored; no other query allowed)
**And** if that delete fails (any status or network error) the save is still reported as successful and nothing is shown to the user
**And** after the upload (whether or not the delete succeeded) the client `mutate`s `["pp","profile-picture-id"]` so the avatar shows the new picture immediately, closes the dialog, shows the success toast "Profile picture saved." (draft copy) through the existing `hooks/use-toast`, and returns focus to the avatar button (FR10, AD-13).

**Given** the upload fails
**When** the response is `413 TOO_LARGE`, `415 UNSUPPORTED_MEDIA`, another 4xx/5xx, or a network failure
**Then** the dialog stays open with the chosen preview, the current avatar is unchanged, no delete is sent, and an error line appears above the footer: for 413/415 "{file name} couldn't be used. Choose another file." (draft copy); for network failure or 5xx "Couldn't save your profile picture. Check your connection." with a "Retry" button that re-runs the upload with the same re-encoded blob (draft copy)
**And** on `SESSION_EXPIRED` the dialog closes and the Story 1.7 session dialog takes over (no error line, no toast; there is no `SESSION_CHANGED`, D5).

**Given** the dialog and header in light and dark theme at 360 px and 1280 px
**When** axe and the keyboard pass run (Playwright, mocked proxy)
**Then** there are no axe violations, the full flow (open picker via keyboard, preview, Save, focus back to avatar) is keyboard-only completable, and there is no horizontal scroll at 360 px.

**Covers:** FR10, NFR1, NFR2, AD-2, AD-13, AD-17 (as superseded by D5), AD-19 (upload-entry errors `{errorCode, source:"proxy"}`), RC11, PA2 · UX-DR10, UX-DR15, UX-DR16, UX-DR51, UX-DR61, UX-DR64, UX-DR67, UX-DR68 · **Jira:** NG-9021

### Story 1.11: Section framework — registry, edit model, inline validation and shared primitives

*Amended 2026-10-13 (architecture update: AD-7, AD-8, AD-12).*
*Foundation 2026-10-14: built in spec 7.0b-1 + 7.0b-2 — 7.0b-2: `features/shell/section-registry.tsx` (`SectionRegistryProvider` per page inside `PageFrame`, `useRegisterSection`, `useSectionRegistry`, `useIsAnyDirty`; dev throw on duplicate id; `save` wrapper → `UNEXPECTED`; `canSave: false`), `SectionId`, `SectionRegistration`, `SaveResult` (with `failedParts`), `ValidateResult`, `ProfileTab`/`AccountTab` in `features/shell/nav-types.ts`; 7.0b-1: `components/ui/confirm-dialog.tsx` (`ConfirmDialog`, incl. `cancelLabel`, `showConfirm`, `onCloseFocus`). Use it; do not rebuild. Remaining for this story: F3: final registry contract (`saveAll?: false`, `dirtyCount`, draft contract), anchor table, `runSaveSteps`, edit primitives (`useSectionForm`, `SectionHeader`, `SectionFooter`, `FormField`/`FieldError`, `input-locked`), `DisabledAction` + Tooltip, fixture Section; F1: zod message-key lint, `lib/shared/telemetry.ts`; Team A: `RowActions`, `RowRemoval`, DropdownMenu.*
*Foundation 2026-10-14: built in spec F1 — the zod-message lint (string or template literals as zod messages in `features/**/schema.ts` fail `pnpm lint`; fixture `eslint.config.test.ts`), `lib/shared/telemetry.ts` (`telemetry.track`, no-op sink, `setTelemetrySink`, typed `section_save { sectionId, ok, code }` with the closed `TelemetryErrorCode` union), `mappedErrorCode()` for the `code`, `SectionId`/`SECTION_IDS` in `lib/shared/section-ids.ts`, `MessageKey`/`messageFor()` for schema message keys. Use it; do not rebuild. Remaining for this story: the F3 items above (the edit kit fires `section_save`); Team A: `RowActions`, `RowRemoval`, DropdownMenu.*
*Foundation 2026-10-14: built in spec F3-1 — `DisabledAction({ reason, wideReason? })` (`components/ui/disabled-action.tsx`: Button look, `aria-disabled`, stays in tab order, always `type="button"`, click/Enter/Space are no-ops, reason in a Tooltip that a press keeps open and in an always-rendered visually hidden `aria-describedby` line), `Tooltip({ content, wide?, side?, contentId?, contentClassName?, keepOpenOnPress? })` + `TooltipProvider` (`components/ui/tooltip.tsx`, `@radix-ui/react-tooltip@1.2.16`; provider mounted once in `app/layout.tsx`, 300 ms delay/skip-delay; opens on hover, focus, touch/pen tap; closes on Escape, blur, outside tap; empty content renders only the trigger), `FormField({ label, optional?, required?, help?, error?, id?, labelAddon?, children: (control) => … })` + `FieldError` (`components/ui/form-field.tsx`: label `for`, `aria-describedby` help then error, `aria-invalid`, `required` + `aria-required`, polite error region, muted "(optional)" from `COMMON_MESSAGES.optionalSuffix`), `Input` restyled to DESIGN.md (44 px, `text-body`, `bg-card`, `control-border`, `focus-ring`, 2 px `error` border on `aria-invalid`; `INPUT_STYLES`), `InputLocked({ value, help })` (`components/ui/input-locked.tsx`: muted fill, lock icon, `readOnly` + `aria-readonly`, focusable, help first in `aria-describedby`), `Button` `busy`/`busyLabel` (spinner + label, `aria-busy`, inert also when `aria-disabled` or `asChild`, focus kept, visually hidden polite status) with `ConfirmDialog` (busy confirm reads "Saving…") and `IdleWarning` refactored onto it. Use it; do not rebuild. Remaining for this story: F3-2: final registry contract, `useSectionForm` (validation on blur/Save, focus on first invalid, read-only inputs while saving), `SectionHeader`/container/`SectionFooter`, `runSaveSteps`, the fixture Section and its Playwright spec (incl. the Add-at-20 `DisabledAction` case); Team A: `RowActions`, `RowRemoval`, DropdownMenu.*
*Foundation 2026-10-14: built in spec F3-2 / F3-3 — F3-2: registry completion in `features/shell/{nav-types,section-registry}.tsx` (`RegisteredSection.saveAll`, `getDirty()`, `getDirtyCount()` + `useDirtyCount()` (only `saveAll !== false` with a `save`), `isAnyDirty()`, `subscribe()`; `ValidateResult` `{ valid: false, invalidCount, focusFirstInvalid }`; `SaveError { code?, mapped?, failedParts? }`, `SESSION_EXPIRED_CODE`, `isSessionExpired()`, `sectionHeadingId(id)` = `<id>-heading`; typed F4 hooks `getDraftValues`/`getDraftBase`/`applyDraft`/`describeDraftDiff`; a registration without `save` counts as guard-only), `useSectionForm(options)` in `features/shell/use-section-form.ts` (options `id, label, displayOrder, schema, baseline, save(values, baseline), saveAll?, onNoChanges?: "close" | "status", successToast?: string | false, cancelFocus?: "heading" | "edit", fieldOrder?, errorFields?, describeError?, draftFields?, describeDraftDiff?`; returns `form, mode, isEditing, isSaving, isDirty, baseline, startEdit, cancel, submit, rebase, field(name), errorFor(name), editButtonProps, footerProps`; RHF + zodResolver on blur, no `<form>` so Enter/Escape do nothing, dirty = `deepEqual` with the baseline, `readOnly` while saving, one send, `section_save` telemetry), `SectionHeader`/`SectionContainer`/`SectionFooter` (`addRow?: { label, onClick, disabledReason? }`), `KeyValueTable`/`KeyValueEditTable`, `runSaveSteps(steps, { scope, mode, refetch?, rebase?, applySucceeded? })`, `runSaveAll`/`saveAllSummary`, `lib/shared/deep-equal.ts`, the fixture `features/shell/__fixtures__/fixture-section.tsx` + `app/test-fixtures/section` (`PP_E2E_FIXTURES=1`) + `e2e/section.spec.ts`; F3-3: the anchor table `features/shell/anchors.ts` (incl. `ACCOUNT_ANCHORS`), `SectionLandmark`. Use it; do not rebuild. Remaining for this story: Team A: `RowActions` (+ DropdownMenu), `RowRemoval`, the "Add {thing}" new-row entry with "New · not saved", and the Playwright cases for Remove → Restore, the kebab menu and a ConfirmDialog opened from a fixture button (the F3-2 fixture holds a number and a note, not a row list; the Add-at-20 `DisabledAction` case is covered by `e2e/primitives.spec.ts` and `section-chrome.test.tsx`).*

As a user editing my profile,
I want every Section to have a predictable read view and edit view with inline validation and consistent controls,
So that I can edit several parts of my profile with confidence that nothing is saved by accident.

**Acceptance Criteria:**

**Given** `features/shell/section-registry.tsx`
**When** a Section component calls `useRegisterSection({ id, label, displayOrder, form, validate, save, discard, draftFields, saveAll? })`
**Then** the registry stores it under `id` (typed enum `SectionId = "personal" | "phone" | "email" | "social" | "addresses" | "insurance" | "account"`), unregisters it on unmount, and throws in development if the same `id` registers twice *(built: spec 7.0b-2)*
**And** there is one `SectionRegistry` per page: `/` and `/account` each mount their own provider (the `/account` one is mounted in Epic 7), so dirty count, leave guard and draft write/restore are scoped to the page; draft purge is not a registry function (it is user-wide, Story 1.15) (AD-7) *(built: spec 7.0b-2)*
**And** `features/shell` exports the typed tab enums `ProfileTab` (`contacts|insurance|medical`) and `AccountTab` (`personal|provider|organizations`), and the anchor table maps `personal`, `phone`, `email`, `social`, `addresses` on `/` and `account`, `authenticator` (anchor only, not a Section) on `/account` *(built: enums spec 7.0b-2; anchor table spec F3-3, `features/shell/anchors.ts`)*
**And** the registry exposes `getDirty()`, `dirtyCount` (only Sections with `saveAll !== false`), `isAnyDirty` (all Sections, including guard-only), `subscribe()`, and per-Section `validate()`, `save()` and `discard()`; no other module keeps dirty, save or draft state (AD-7) *(built: spec F3-2 — `getDirtyCount()` / `useDirtyCount()`)*
**And** a guard-only participant (`saveAll: false`, e.g. Insurance) may register `save` and `validate` for the leave guard to call; when it omits `save` the registry records `canSave: false` for it. *(built: spec 7.0b-2 + F3-2)*

**Given** a Section's `save()` implementation throws or rejects
**When** the registry (or the Section's own Save button) calls it
**Then** the registry's wrapper resolves `{ ok: false, error: { code: "UNEXPECTED" } }` and never propagates the exception; a unit test asserts this for a throwing and a rejecting `save()` *(built: spec 7.0b-2)*
**And** the `save()` result type allows `{ ok: false, error: { failedParts: ("details"|"timeZone"|"locale")[] } }` for the `/account` Account settings Section (Epic 7), whose save attempts every dirty part instead of stopping at the first failure (AD-7 exception). *(built: spec 7.0b-2)*

**Given** the helper `runSaveSteps(steps, { refetch, rebase })` in `features/shell`
**When** step 2 of 3 fails
**Then** step 3 is not run, `refetch()` revalidates the Section's SWR keys, `rebase()` resets the form baseline to the refetched server data while keeping the user's remaining edits, and the helper resolves `{ ok: false, error }`; a retry sends only the remaining diff (unit test with a 3-step fixture asserts the requests sent on first attempt and on retry). *(built: spec F3-2, `runSaveSteps(steps, { scope, mode: "stop", refetch, rebase })`)*

**Given** the test fixture Section `features/shell/__fixtures__/fixture-section.tsx` (registered only in tests and the Playwright mock page, id `phone`, label "Phone") with a zod 4 schema in its own `schema.ts`, one `useForm` with `zodResolver`, a required text field and a list of rows
**When** it renders with loaded data
**Then** it shows the read view by default inside the Story 1.8 `SectionFrame`: a Section header row 44 px tall with the `h2` title, the count of saved entries, and an outline "Edit" button on the right (UX-DR20) *(built: spec F3-2; the fixture holds a number and a note, no row list)*
**And** all the behaviors below are proven against this fixture with Vitest + Testing Library + MSW and one Playwright spec.

**Given** a Section in read view
**When** the user activates "Edit"
**Then** the Section switches to edit view: the table container gets a primary border and 3 px accent halo, inputs appear in editable cells, focus moves to the first input, and the header shows muted "Editing" in place of the count *(built: spec F3-2)*
**And** activating "Add {thing}" instead enters edit view with one new empty row focused and status "New · not saved"
**And** a second Section can be opened in edit view at the same time without affecting the first (FR4).

**Given** a Section in edit view
**When** the user changes a value
**Then** the table footer shows the 8 px warning dot and "Unsaved changes" (warning-strong text, polite live region) on the first change; reverting every field to its baseline value removes the indicator and the Section is no longer counted as dirty (dirty = deep inequality with the baseline, not "touched") *(built: spec F3-2)*
**And** footer actions are "Add row" (ghost, when the Section supports rows), Cancel (secondary) and Save (primary). *(built: spec F3-2, `SectionFooter`)*

**Given** a dirty Section in edit view
**When** the user activates Cancel
**Then** only that Section reverts to its baseline and returns to read view with no confirm, its errors clear, other Sections keep their edits, and focus moves to the Section `h2`. *(built: spec F3-2, `cancelFocus: "heading"`)*

**Given** a Section in edit view
**When** the user presses Escape inside the table or Enter inside a text input
**Then** Escape does not cancel and Enter does not submit the Section (UX-DR57). *(built: spec F3-2)*

**Given** a field with an invalid value
**When** the field blurs, or the user activates Save
**Then** the input (44 px, 16 px text, `rounded-md`, 1 px control-border) shows the 2 px error border, `aria-invalid="true"` and `aria-describedby` linking an error-strong help line with an alert icon whose text is the `lib/shared/messages.ts` entry for the zod issue (e.g. "Enter a valid email address") *(input look and aria wiring built: spec F3-1 — `Input`, `FormField`/`FieldError`; blur/Save validation → F3-2)* *(built: spec F3-2)*
**And** zod schemas reference message keys only (a lint rule or test fails on string literals passed as zod messages in `features/**/schema.ts`) (AD-11) *(built: spec F1)*
**And** on Save with any invalid field no request is sent and focus moves to the first invalid field (FR4). *(built: spec F3-2)*

**Given** a valid dirty Section
**When** the user activates Save
**Then** Save shows a spinner and "Saving…", inputs become read-only, Cancel is disabled, and other Sections stay usable *(built: spec F3-2)*
**And** on `{ ok: true }` the Section returns to read view, focus moves to the Section `h2`, and `telemetry.track("section_save", { sectionId, ok: true, code: null })` (via `lib/shared/telemetry.ts`, no-op sink) fires with no other keys (AD-15) *(built: spec F3-2)*
**And** on `{ ok: false }` the Section stays in edit view with the user's edits kept and `section_save { sectionId, ok: false, code }` fires. *(built: spec F3-2)*

**Given** the `RowActions` primitive (`features/shell/row-actions.tsx`, shadcn DropdownMenu added to `components/ui/` at a pinned version)
**When** a read-view row renders with actions
**Then** desktop inline ghost actions (44 px, 14 px text) fade in (150 ms, none under reduced motion) on row hover or focus-within, and a 44 × 44 kebab is always visible with a row-specific accessible name supplied by the Section (e.g. "More actions for +1 (415) 551-2125")
**And** the kebab menu repeats every row action, shows "Remove" in error-strong text, and never shows an item without a handler (UX-DR26).

**Given** the `RowRemoval` primitive in edit view
**When** the user activates Remove on a saved row
**Then** the row is struck through and muted, its status reads "Removed on save" with a "Restore" link in place of Remove (no toast, no confirm, no undo), the Section becomes dirty, and nothing is deleted until Save; "Restore" returns the row to its prior state
**And** Remove on a new unsaved row deletes it outright
**And** Remove from a row's menu in read view switches the Section to edit view with that row already struck through and focus on its "Restore" link (UX-DR54).

**Given** the `DisabledAction` primitive (`components/ui` Button + shadcn Tooltip at a pinned version, with UX-DR5 tooltip tokens)
**When** it renders with `disabledReason`
**Then** it has muted fill, slate text, border and not-allowed cursor, stays in the tab order with `aria-disabled="true"` and `aria-describedby` to the tooltip id, activation by click, Enter or Space is a no-op, and the tooltip (graphite, 6 px radius, arrow, above the control) opens on hover, keyboard focus and tap, and closes on Escape, blur and tap outside; the fixture's Add at 20 rows shows "You've reached the limit of 20 phones" (UX-DR28, UX-DR55). *(primitive built: spec F3-1 as `DisabledAction({ reason })` + `Tooltip`; the fixture's Add-at-20 case comes with the F3-2 fixture Section)*

**Given** `components/ui/confirm-dialog.tsx` created in this story
**When** it is opened with `{ title, body, confirmLabel, variant: "standard" | "destructive", onConfirm, onCancel, extraAction?, busy? }`
**Then** it is a shadcn Dialog with `role="alertdialog"`, `aria-labelledby` (title) and `aria-describedby` (body), `rounded-lg`, elevation-2 (`shadow-lg`) over the `scrim` token overlay (D13; never `bg-black/50`), and an `ease-premium` 220–280 ms entrance (none under reduced motion)
**And** the footer is right-aligned: Cancel (secondary) then the confirm button — primary fill for `standard`, `bg-destructive-fill` fill with white text for `destructive`; an optional `extraAction` renders as an outline button between them (used by the leave guard)
**And** focus starts on Cancel; Escape and an overlay click behave exactly like Cancel (call `onCancel`, never `onConfirm`); on close, focus returns to the element that was focused when the dialog opened
**And** while `busy` is true the confirm button shows a spinner and Cancel, Escape and overlay click do nothing
**And** a component test covers both variants, focus start and return, Escape/overlay = Cancel semantics and `busy`, with an axe check
**And** it is the only confirm dialog component; the four named confirms (primary phone/email change, Remove signature, Delete insurance, and Disable authenticator app in Epic 8) and the leave guard reuse it, and no other confirm dialog may be added (UX-DR36, UX-DR59 as amended: four confirms). *(built: spec 7.0b-1)*

**Given** the framework components
**When** the Playwright spec runs axe and a keyboard-only pass over the fixture (read → Edit → invalid → fix → Save; Remove → Restore; kebab menu; disabled Add tooltip; a ConfirmDialog opened from a fixture button)
**Then** there are no axe violations, every control is >= 44 x 44 px, the footer indicator is announced via a polite live region, and no auto-save occurs (nothing is sent until Save) (UX-DR59).

**Covers:** FR4, NFR2, NFR3, AD-7 (per-page registry, typed ids, `failedParts`), AD-11, AD-15 · UX-DR5, UX-DR7, UX-DR10, UX-DR11, UX-DR20, UX-DR22, UX-DR26, UX-DR27, UX-DR28, UX-DR29, UX-DR36, UX-DR51, UX-DR54, UX-DR55, UX-DR56, UX-DR57, UX-DR59, UX-DR60, UX-DR61, UX-DR62, UX-DR63, UX-DR64 · **Jira:** NG-9020

### Story 1.12: Error mapping, message catalog, toasts and Retry

*Amended 2026-10-13 (architecture update: AD-11, AD-19, AD-23).*
*Foundation 2026-10-14: built in spec 7.0b-1 — message catalog with verbatim + voice tests (was `lib/shared/messages.ts`; split into `lib/shared/messages/*` with `MESSAGE_CATALOG`, `messageFor`, `formatMessage` by F1), `lib/api/errors.ts` (moving to `lib/api/errors/` in F1; `mapApiError(response)` → `forbidden | generic | network | session`, `mapFetchError`), `ApiResponse.platformMessage`/`source`, `features/shell/read-state.tsx` (`LoadError`, `NoAccess`, `ReadStateFor`). Use it; do not rebuild. Remaining for this story: F1: error mapper v2 `mapApiError(sectionId, response)` with per-Section field maps and the MFA/NPI exact-message table; F3: `features/shell/toasts.ts` (`toastSuccess`, `toastPartial`, `toastError({onRetry})`, `TOAST_LIMIT` fix, `hooks/use-toast` lint), Section save-failure UI, `SectionFrame` per-Section load error, fixture Playwright spec.*
*Foundation 2026-10-14: built in spec F1 — error mapper v2 in `lib/api/errors/` (`mapApiError(sectionId, response)` and `mapFetchError(sectionId, error)` → `forbidden | network | session | generic{message?} | field{field, messageKey} | coded{code}`; `ErrorScope` = `SectionId` ∪ `authenticator|provider|organizations|page`; `mappedErrorCode()`; `ERROR_RULES` aggregated from the per-area tables `{personal,contacts,addresses,insurance,account,mfa,npi,orgs}.ts`), the exact-message rows (MFA: `Mfa is not enabled for this user.` / `Mfa config is missing.` → `MFA_NOT_ENABLED`, `Totp is already enabled.` → `TOTP_ALREADY_ENABLED`; NPI: the real `Messages.*_NPI_IS_ALREADY_REGISTERED` text `Operation failed. The chosen (Personal|Practice) NPI Number: <n> is already registered.` → `NPI_ALREADY_REGISTERED`; SSN taken → `field ssn` / `person.ssnTaken`), tests that only `lib/api/errors/*` matches upstream text, migrated callers (`page-frame`, `read-state`), client codes `FORBIDDEN` + derived codes (`lib/api/errors-codes.ts`), the catalog split into `lib/shared/messages/*` (`MESSAGE_CATALOG`, `MessageKey`, `messageFor`, `formatMessage`, every area file pre-created), and the `@/hooks/use-toast` lint (only `features/shell/toasts.ts`). Use it; do not rebuild. Remaining for this story: F3: `features/shell/toasts.ts`, the Section save-failure UI (incl. the generic "Couldn't save {section}." copy and Retry), `SectionFrame` load error, fixture Playwright spec. New error rows go in the area table of the Section that needs them.*
*Foundation 2026-10-14: built in spec F3-1 — `features/shell/toasts.ts` (`toastSuccess(text)` 5 s paused on hover/focus, `toastPartial(text)` 5 s, `toastError(text, { onRetry })` persistent with "Retry" that runs `onRetry` once and always closes; each returns `{ id, dismiss }`; `SUCCESS_TOAST_MS`, `PARTIAL_TOAST_MS`), `components/ui/{toast,toaster}.tsx` (tones `default|success|partial|error`, polite, bottom-center < 768 px and bottom-right from `md`, `bottom-[var(--toast-bottom-offset)]` for the Save all pill, `rounded-md` DESIGN.md `toast` token + `shadow-lg`, 44 px "Dismiss notification" close; `TOAST_DURATION_MS`, `TOAST_EXIT_MS`), `hooks/use-toast` (`TOAST_LIMIT` 3, oldest non-error toast evicted first, error toasts never dropped, remove delay = 200 ms exit animation, `resetToasts()` for tests), `InlineBanner({ variant: "error" | "info", action?, focusable?, announceKey? })` (`components/ui/inline-banner.tsx`: only the sentence is the live region, the action sits outside it), `LoadError`/`ReadStateFor` on `InlineBanner` with a new `attempt` prop; copy `SECTION_MESSAGES.saveFailed` "Couldn't save {section}." (DRAFT), `allSaved` "All saved." (DRAFT), `partialSaved` "{saved} saved, {failed} failed", `COMMON_MESSAGES.optionalSuffix` and `dismissNotification` (DRAFT). Use it; do not rebuild. Remaining for this story: F3-2: the Section save-failure UI (field or Section-level error, focus on the first error, network error with Retry + error toast, "{Section label} saved." on success, generic "Couldn't save {section}." for unknown codes) and the fixture Playwright spec; F3-3: the `SectionFrame` per-Section load error. Callers of `LoadError`/`ReadStateFor` pass `attempt` (failure count) so a repeated failure is re-announced.*
*Foundation 2026-10-14: built in spec F3-2 / F3-3 — F3-2: the Section save-failure UI inside `useSectionForm` (a mapped `field` error at its field, mapped by name or through `errorFields`, with focus on the first error; Section-level errors in `SectionFooter`'s InlineBanner + Retry above the footer; `network` → "Couldn't save {section}. Check your connection." + Retry (focused) + `toastError` with Retry, dismissed on success or Cancel; unknown/`UNEXPECTED` → "Couldn't save {section}." + Retry, no toast; `session` → nothing; success → "{label} saved." via `toastSuccess`, only from the Section's own Save; `describeError` overrides the Section copy; Retry re-runs the latest submit against the rebased baseline), fixture Playwright `e2e/section.spec.ts` (success, network failure → Retry, axe, 360 px); F3-3: the per-Section load error in `StateFrame` (`STATE_MESSAGES.sectionLoadError` "Couldn't load {section}" + `SECTION_LOAD_NOUNS`; Retry calls only that frame's `onRetry`; `attempt` re-announces) and the AD-23 table `forbiddenScopeFor(path, page)` in `lib/api/errors/forbidden-scope.ts`. Use it; do not rebuild. Remaining for this story: the fixture Playwright case for a mocked 400 with a mapped `errorCode` (proven in Vitest by `features/shell/use-section-form.test.tsx`, not yet in e2e). The "Profile picture saved." toast move stays with Story 1.10.*

As a user saving or loading my profile,
I want clear, consistent messages when something works or fails, with a way to retry,
So that I always know what happened and can recover without reloading the page.

**Acceptance Criteria:**

**Given** `lib/shared/messages.ts`
**When** the unit test compares it with the EXPERIENCE.md Voice and Tone table
**Then** every Voice and Tone string exists verbatim as a message key (including "Unsaved changes", "{N} unsaved sections", "Save all (N)", "Discard all", "{Section} saved.", "{X} saved, {Y} failed", "Couldn't save {section}. Check your connection.", "Retry", "You have unsaved changes", "Keep editing", "Discard", "Save", "Removed on save", "Restore", "New · not saved", "Couldn't load {section} · Retry", "Not provided", disabled-action reasons, draft restore/conflict copy) plus architecture-added strings; the verbatim comparison also spans the Profile-module rows of the Voice and Tone table, so `/account` copy added in Epics 7–10 is checked by the same test
**And** every string not from EXPERIENCE.md or the PRD carries a `// DRAFT COPY` marker, and the voice rules are checked by a test (no exclamation marks; no "contact point" or "precedence" in sentences) (AD-11, UX-DR68). *(built: spec 7.0b-1)*

**Given** `lib/api/errors.ts`
**When** `mapApiError(sectionId, response)` receives an `ApiResponse`
**Then** `errors.ts` derives `errorCode` for upstream errors (`{ message, code: <int> }`, integer kept as `upstreamCode`) and never confuses it with a BFF `errorCode` (`source: "proxy"`) (AD-19)
**And** an upstream 403 (no `source: "proxy"`) maps to `FORBIDDEN`, which drives the no-access panel scoped per the AD-23 owner table; a proxy `NOT_ALLOWED` maps to the generic Section error with Retry (logged by request id) and never to "no access" (there is no `CSRF` code, D5) *(built: spec 7.0b-1)*
**And** the exact-message table is the only place that matches message text: `"Mfa is not enabled for this user."` and `"Mfa config is missing."` → `MFA_NOT_ENABLED`; `"Totp is already enabled."` → `TOTP_ALREADY_ENABLED`; messages starting `PERSONAL_NPI_IS_ALREADY_REGISTERED` or `PRACTICE_NPI_IS_ALREADY_REGISTERED` → `NPI_ALREADY_REGISTERED`; a unit test covers each row and asserts no other module matches message text *(built: spec F1)*
**And** known backend codes map to `{ field, messageKey }` from a per-Section table (unit-tested with `SOCIAL_SECURITY_NUMBER_EXISTS` → field `ssn`, "This SSN belongs to another person", and `INVALID_ENUM_VALUE` → Section level), the message is shown at the field when a field is mapped and at Section level otherwise *(built: spec F1)*
**And** network failures (no `statusCode`), `502 UPSTREAM_ERROR|UPSTREAM_REDIRECT`, `503 REFRESH_UNAVAILABLE|SERVICE_DISABLED` and `504 UPSTREAM_TIMEOUT` map to `{ kind: "network" }` *(built: spec 7.0b-1)*
**And** any unknown code maps to a generic Section-level error "Couldn't save {section}." (draft copy) with Retry *(built: spec F3-2, `useSectionForm`)*
**And** `SESSION_EXPIRED` (proxy-originated only) maps to `{ kind: "session" }` and the Section shows no error or toast (the Story 1.7 dialog handles it; there is no `SESSION_CHANGED`, D5); no module other than `errors.ts` (and the `callApi` session branch) inspects `errorCode` or `upstreamCode`. *(built: spec 7.0b-1)*

**Given** `features/shell/toasts.ts`, the single toast API built on the existing `hooks/use-toast` and shadcn Toast
**When** a toast is shown
**Then** it renders bottom-right on desktop and bottom-center on mobile (above the Save all pill when present), `rounded-lg`, `shadow-lg`, in a polite live region *(built: spec F3-1; radius is the DESIGN.md `toast` token `rounded-md` per the F3 split decision; Story 1.14 raises `--toast-bottom-offset` above the pill)*
**And** `toastSuccess(text)` shows a success-strong check icon and auto-dismisses after 5 s, paused on hover or focus; `toastPartial(text)` shows a warning-strong alert icon; `toastError(text, { onRetry })` shows an error-strong alert icon and a "Retry" button and persists until dismissed; there is no undo toast *(built: spec F3-1)*
**And** the Story 1.10 "Profile picture saved." toast is moved to `toastSuccess` with no visible change, and no other module calls `hooks/use-toast` directly (lint rule). *(lint built: spec F1; Story 1.10 calls `toastSuccess` when it lands)*

**Given** a Section save resolves `{ ok: true }` outside Save all
**When** the result returns
**Then** a success toast "{Section label} saved." appears (e.g. "Phone saved.") in addition to the Story 1.11 read-view, focus and telemetry behavior. *(built: spec F3-2)*

**Given** a Section save fails with a mapped validation error
**When** the result returns
**Then** the Section stays in edit view with the error at the field (or Section level, above the table footer), the user's edits are kept, and focus moves to the first field showing an error. *(built: spec F3-2)*

**Given** a Section save fails with `{ kind: "network" }`
**When** the result returns
**Then** the Section stays in edit view with a Section-level error "Couldn't save {section lowercase}. Check your connection." (e.g. "Couldn't save phone. Check your connection.") and a "Retry" button, and an error toast with the same copy and "Retry" persists until dismissed; Retry re-runs that Section's `save()`; there is no offline queue (FR7). *(built: spec F3-2)*

**Given** a Section's read fails
**When** it renders
**Then** the Story 1.8 `SectionFrame` error banner shows "Couldn't load {section lowercase} · Retry" (e.g. "Couldn't load phones · Retry") from `messages.ts`, "Retry" revalidates only that Section's SWR keys, and other Sections are unaffected (NFR5). *(built: spec F3-3, `StateFrame`)*

**Given** the fixture Section from Story 1.11
**When** the Playwright spec runs Save success, a mocked 400 with a mapped `errorCode`, and a mocked network failure → Retry → success
**Then** the toasts and errors above appear with the exact copy, toasts are announced via a polite live region, and there are no axe violations.

**Covers:** FR7, NFR2, NFR5, NFR14, AD-11, AD-19 (error mapping, `upstreamCode`, `FORBIDDEN`, exact-message table), AD-23 (403 owner table), PA2 · UX-DR33, UX-DR44, UX-DR56, UX-DR61, UX-DR62, UX-DR68 · **Jira:** NG-9020

### Story 1.13: Leave guard

*Amended 2026-10-13 (architecture update: AD-12, AD-22, AD-26).*
*Foundation 2026-10-14: built in spec 7.0b-2 — `features/shell/leave-guard.tsx` (`LeaveGuard`, on `ConfirmDialog`: Keep editing / Discard / Save, validate-first, Save hidden for `canSave: false`, `beforeunload` only while dirty and suppressed after confirmed exits), `requestLeave`/`setLeaveGuard` in `features/shell/leave.ts`, fixture participant `features/shell/__fixtures__/fixture-participant.tsx` + `app/test-fixtures/leave-guard` (`PP_E2E_FIXTURES=1`). Use it; do not rebuild. Remaining for this story: F4: `drafts.purgeUser` on Discard → Return to 1health (via `onBeforeExit`); F3: Save through the Save-all runner (`runSaveSteps`) instead of plain `displayOrder`; Team A: scoped `requestLeave({ scope })` with the Sheet, and the two-guard-only-fixture spec.*
*Foundation 2026-10-14: built in spec F3-2 — the leave guard's Save runs `runSaveAll(registry, { order, includeGuardOnly: true, trackTelemetry: false })` (`features/shell/save-all.ts`): every dirty Section and guard-only participant is validated first and nothing is sent if any is invalid; then the dirty Save-all Sections in `PageFrame saveOrder` (default `displayOrder`), then the guard-only participants; it stops on `SESSION_EXPIRED`; after a failure the page stays, the `saveAllSummary` partial toast shows and focus moves to the first failed Section's `h2`. A participant without `save` defaults to `saveAll: false`. Use it; do not rebuild. Remaining for this story: F4: `drafts.purgeUser` on Discard → Return to 1health (via `onBeforeExit`); Team A: scoped `requestLeave({ scope })` with the Sheet, the two-guard-only-fixture Vitest/Playwright spec, and passing `SAVE_ORDER` as `PageFrame saveOrder` on `/` (Story 1.14).*

As a user with unsaved changes,
I want to be asked before I lose them by switching tabs, switching between Personal Profile and Account, going back to 1health or to the portal, closing an editor or closing the page,
So that I never lose edits by accident and can save them on the way out.

**Acceptance Criteria:**

**Given** at least one registered Section (including a guard-only `saveAll: false` participant) is dirty
**When** the user closes or reloads the page
**Then** a `beforeunload` handler triggers the browser's native prompt; with no dirty Section no handler is attached (FR6) *(built: spec 7.0b-2)*
**And** `beforeunload` covers only browser-initiated unloads (close, reload, typed URL, browser back out of the app); every in-app navigation goes through `navigate()` and the in-app dialog, and the handler is suppressed for navigations the app has already confirmed (`navigate()` after the leave guard, session-expired "Return to 1health") (AD-26). *(built: spec 7.0b-2)*

**Given** the leave guard (`features/shell/leave-guard.tsx`) registered through `setLeaveGuard` on the Story 1.7 `requestLeave()`
**When** `navigate()` (AD-26) is called while any Section on the current page is dirty, for: a tab switch (Story 1.8 tabs, and the `/account` tabs in Epic 7), an app-bar page switch (Personal Profile ↔ Account), the app-bar "Return to 1health" (`navigate({ external: "portal" })`, Story 1.7), or a portal hand-off (`navigate({ external: "handoff", href })` to `/handoff/portal`, Epic 10)
**Then** the leave guard opens using `components/ui/confirm-dialog.tsx` (Story 1.11): title "You have unsaved changes", buttons "Keep editing" (secondary, initial focus), "Discard" (outline, the `extraAction`), "Save" (primary); Escape equals "Keep editing" and focus returns to the trigger *(built: spec 7.0b-2)*
**And** "Keep editing" cancels the navigation *(built: spec 7.0b-2)*
**And** "Discard" calls `discard()` on every dirty Section and guard-only participant, then completes the navigation: tab or page switch by client navigation; Return to 1health by the user-wide draft purge `drafts.purgeUser(userId)` (Story 1.15), logout and same-tab navigation to `portalUrl` (D4); a portal hand-off by same-tab navigation to `/handoff/portal` with no logout and drafts of other Sections kept (AD-12, AD-22)
**And** with no dirty Section, every `navigate()` target proceeds with no dialog (FR6, UX-DR42) *(built: spec 7.0b-2)*
**And** no feature wires its own leave guard for these navigations; `navigate()` is the single entry point (AD-26). *(built: spec 7.0b-2)*

**Given** the leave guard is open and every dirty participant can save
**When** the user activates "Save"
**Then** it validates every dirty Section and guard-only participant first; if any is invalid nothing is sent, the dialog closes, the navigation is cancelled and focus moves to the first invalid field *(built: spec 7.0b-2)*
**And** otherwise it saves the dirty Save-all Sections one at a time, then calls each dirty guard-only participant's own `save()` (e.g. the Insurance editor's policy save), and completes the navigation only if every call returned `{ ok: true }`; otherwise it stays, with the failed Sections' or participant's errors shown. *(built: spec F3-2, `runSaveAll(…, { includeGuardOnly: true })`)*

**Given** a dirty guard-only participant registered without `save` (`canSave: false`)
**When** the leave guard opens
**Then** the "Save" button is not rendered; the dialog offers only "Keep editing" and "Discard", and its body states that the changes can't be saved from here *(draft copy)*. *(built: spec 7.0b-2)*

**Given** a guard-only participant asks to close itself (e.g. an editor drawer's close, Cancel, Escape, scrim or mobile Back) via `requestLeave({ scope: participantId })`
**When** that participant is dirty
**Then** the same dialog opens scoped to that participant only: "Discard" calls only its `discard()`, "Save" (shown only when it can save) calls only its `validate()` then `save()` and closes it on `{ ok: true }`, and "Keep editing" keeps it open
**And** when it is clean, `requestLeave` resolves `true` immediately with no dialog.

**Given** the fixture Section from Story 1.11 plus two guard-only fixtures (one with `save`, one without)
**When** Vitest and one Playwright spec run (tab switch with each dirty combination; app-bar switch to Account; Return to 1health with Discard → drafts purged user-wide; a fixture hand-off target → drafts kept, no logout; scoped close; Save with an invalid field; Save with a failing participant)
**Then** each case behaves as above, there are no axe violations, and the dialog is keyboard-operable with focus returning to the trigger.

**Covers:** FR3 (leave guard on tab switch), FR6, FR101 (leave guard on page switch), NFR2, AD-7 (guard-only participants), AD-12 (purge on Return), AD-22 (hand-off keeps drafts), AD-26 (`navigate()`) · UX-DR13, UX-DR17, UX-DR36, UX-DR42, UX-DR61, UX-DR62 · **Jira:** NG-9020

### Story 1.14: Save all

*Amended 2026-10-13 (architecture update: AD-7, AD-8).*
*Foundation 2026-10-14: nothing built yet by specs 7.0a–7.0c-1. Remaining for this story: everything: F3 builds the registry `dirtyCount` and the Save-all runner (`runSaveSteps(steps, {mode})`); Team A builds the bar, pill and `SAVE_ORDER`. Reuse `useRegisterSection`/`useSectionRegistry` (7.0b-2) and the leave guard (7.0b-2).*
*Foundation 2026-10-14: built in spec F1 — `telemetry.track("save_all", { saved, failed })` with a numbers-only payload type (`lib/shared/telemetry.ts`). Use it; do not rebuild. Remaining for this story: unchanged (F3 runner + `dirtyCount`; Team A bar, pill, `SAVE_ORDER`).*
*Foundation 2026-10-14: built in spec F3-1 — `toastSuccess`/`toastPartial` with "All saved." and "{saved} saved, {failed} failed" in `SECTION_MESSAGES`, `Button` `busy` + `busyLabel` ("Save all (N)" → "Saving…"), the `--toast-bottom-offset` CSS variable (`:root` default `0px`) that the pill raises so toasts sit above it. Use it; do not rebuild. Remaining for this story: unchanged (F3-2 runner + `dirtyCount`; Team A bar, pill, `SAVE_ORDER`, and setting `--toast-bottom-offset` while the pill shows).*
*Foundation 2026-10-14: built in spec F3-2 — `useDirtyCount()` / `registry.getDirtyCount()` (only `saveAll !== false` with a `save`); `runSaveAll(registry, { order?, includeGuardOnly?, trackTelemetry? })` in `features/shell/save-all.ts` (validates every dirty Save-all Section first → `{ kind: "invalid", invalid: [{ id, label, invalidCount }] (page order), focusFirstInvalid }` with nothing sent; then saves one at a time in `order` (unlisted Sections follow `displayOrder`), skips clean ones, continues after ordinary failures, stops on `SESSION_EXPIRED` → `{ kind: "session" }` with no summary; `save_all { saved, failed }` once when anything was sent) → `clean | invalid | session | done`; `saveAllSummary(outcome)` ("{Section} saved." / "All saved." / "{S} saved, {F} failed" with tone); copy `SECTION_MESSAGES.invalidOne`/`invalidMany`; a Section's registered `save()` shows its saving state, errors and `section_save` but never toasts, so the run shows one summary; `PageFrame` `saveAllSlot` (accepted only with `page: "profile"`, rendered after `main`, so last in the tab order) and `saveOrder`; the leave guard uses the same runner. Use it; do not rebuild. Remaining for this story: Team A: `features/shell/save-order.ts` (`SAVE_ORDER`, passed as `order` and as `PageFrame saveOrder`), the bar and pill in `saveAllSlot` (counts from `useDirtyCount()`, sub-line from the `invalid` outcome, Discard all, busy "Save all (N)", the keyboard-hidden pill, `--toast-bottom-offset`), focus after the run (first failed Section's error / first saved `h2`), the `/account` no-Save-all component test and the Playwright spec.*

As a user who has edited several Sections,
I want one "Save all" action that validates everything first and then tells me honestly what saved and what didn't,
So that I can finish a multi-Section update in one step without being misled about partial failures.

**Acceptance Criteria:**

**Given** the registry `dirtyCount` (Sections with `saveAll !== false`; Insurance guard-only participants never counted)
**When** `dirtyCount` goes from 0 to N >= 1 at viewport >= 768 px
**Then** a sticky bottom card bar with a top border appears (flat, no shadow): 8 px warning dot, "{N} unsaved section" / "{N} unsaved sections" (600, polite live region), a muted sub-line (empty until validation finds problems), and on the right "Discard all" (secondary) and "Save all (N)" (primary)
**And** at `dirtyCount` = 0 the bar is removed from the DOM (FR5, UX-DR31)
**And** the Save all bar, pill and `SAVE_ORDER` exist only on `/`: they read the `/` page registry, and `/account` mounts no Save all bar or pill (its one Section saves on its own); a component test mounts the shell on `/account` with a dirty `account` Section and asserts no Save all UI (AD-8).

**Given** `dirtyCount` = N >= 1 at viewport < 768 px
**When** the page renders
**Then** a centered floating 44 px pill "Save all (N)" (`rounded-full`, `shadow-md`) sits above the bottom edge with no Discard action, and toasts render above it
**And** while the on-screen keyboard is open (a text input, select or textarea is focused and `visualViewport.height` is at least 150 px smaller than `window.innerHeight`) the pill is hidden, and it reappears when the keyboard closes (UX-DR32).

**Given** the bar or pill is visible
**When** the user tabs through the page
**Then** "Save all (N)" is last in the tab order after all Sections (UX-DR57).

**Given** N dirty Sections
**When** the user activates "Discard all"
**Then** every dirty Save-all Section's `discard()` runs with no confirm, each returns to read view, and the bar disappears.

**Given** N dirty Sections of which at least one has an invalid field
**When** the user activates "Save all (N)"
**Then** `validate()` runs on every dirty Section first, no request is sent, every invalid field shows its inline error, the sub-line names each problem Section ("{Section} has 1 field to fix" / "{Section} has {n} fields to fix", e.g. "Email has 1 field to fix"), and focus moves to the first invalid field in page (`displayOrder`) order, scrolling it into view (smooth unless reduced motion). *(runner part built: spec F3-2 — `invalid` outcome with counts, `focusFirstInvalid()`, `invalidOne`/`invalidMany` copy; the sub-line and scroll stay Team A)*

**Given** every dirty Section is valid
**When** the Save-all run starts
**Then** "Save all (N)" shows a spinner and "Saving…" and cannot be activated again until the run ends
**And** dirty Sections are saved one at a time, each awaited fully (including any auto-verify inside that Section's `save()`), in `SAVE_ORDER = ["personal", "email", "phone", "social", "addresses"]` exported from `features/shell/save-order.ts`, regardless of `displayOrder`; clean Sections are skipped (AD-8) *(runner built: spec F3-2 with `order`; `SAVE_ORDER` stays Team A)*
**And** per-Section success toasts are suppressed during the run (one summary toast only), while each Section still shows its own saving state and emits its `section_save` event. *(built: spec F3-2)*

**Given** a Section's save returns `{ ok: false }` with a non-session error mid-run
**When** the runner continues
**Then** later Sections in `SAVE_ORDER` are still saved; the failed Section stays in edit view with its field/Section error and Retry. *(built: spec F3-2)*

**Given** a Section's save returns `SESSION_EXPIRED` (there is no `SESSION_CHANGED`, D5)
**When** the runner receives it
**Then** the run stops, no later Section is attempted, no summary toast is shown, and the Story 1.7 session dialog takes over. *(built: spec F3-2)*

**Given** a completed run with S succeeded and F failed
**When** the run ends
**Then** succeeded Sections are in read view; if F = 0 the toast is "{Section} saved." when one Section was saved and "All saved." (draft copy) when more than one; if F >= 1 the toast is "{S} saved, {F} failed" with the warning-strong alert icon (e.g. "2 saved, 1 failed", also "0 saved, 2 failed"), and the text "All saved" never appears unless F = 0 (unit test over the run outcomes) *(summary copy built: spec F3-2, `saveAllSummary`; showing it is Team A)*
**And** after a partial failure the bar remains with N = F and focus moves to the first failed Section's error; after full success focus moves to the `h2` of the first saved Section in page order.

**Given** a completed or stopped run that sent at least one save
**When** it ends
**Then** `telemetry.track("save_all", { saved: S, failed: F })` fires exactly once with exactly those two numeric keys (test asserts the payload has no other keys and contains no field values or user ids) (AD-15, NFR14). *(built: spec F3-2)*

**Given** the leave guard from Story 1.13
**When** the user chooses "Save" in it
**Then** it saves the dirty Save-all Sections with this same runner (validation first, `SAVE_ORDER`, stop on session events), then calls each dirty guard-only participant's own `save()` as defined in Story 1.13, and completes the navigation only when every save succeeded. *(built: spec F3-2; `SAVE_ORDER` via `PageFrame saveOrder` is Team A)*

**Given** a Playwright spec against the mocked proxy with two fixture Sections dirty and the second mocked to fail
**When** Save all runs at 1280 px and at 360 px
**Then** the request order follows `SAVE_ORDER`, the toast reads "1 saved, 1 failed", the bar/pill shows "Save all (1)", there are no axe violations, and there is no horizontal scroll at 360 px.

**Covers:** FR5, AD-7 (per-page registry), AD-8 (Save all only on `/`), AD-15, NFR5, NFR14, UX-DR10, UX-DR31, UX-DR32, UX-DR44, UX-DR57, UX-DR61, UX-DR62, UX-DR63, UX-DR67 · **Jira:** NG-9020

### Story 1.15: Drafts — keep unsaved edits across an expired session

*Amended 2026-10-13 (architecture update: AD-5, AD-12, AD-19, AD-22, AD-26).*
*Foundation 2026-10-14: nothing built yet by specs 7.0a–7.0c-1. Remaining for this story: everything → F4 (`features/shell/drafts.ts`). The seams already exist: `onBeforeSessionExpired` and `onBeforeExit` in `features/shell/exit-hooks.ts` (7.0b-2); do not add other hooks.*
*Foundation 2026-10-14: built in spec F3-1 — `InlineBanner variant="info"` with `action` (Restore/Discard outside the live region) and `focusable` for the restore and conflict notices; `toastSuccess` for the save after a restore. Use it; do not rebuild. Remaining for this story: everything else → F4.*
*Foundation 2026-10-14: built in spec F3-2 — the typed draft contract on registration (`draftFields`, `getDraftValues`, `getDraftBase`, `applyDraft`, `describeDraftDiff` in `features/shell/nav-types.ts`, delegated to the latest render by the registry); `useSectionForm` registers them when `draftFields` is set (`applyDraft` opens edit view like Edit, validates the values, is ignored while saving); `lib/shared/deep-equal.ts#deepEqual` (undefined-valued keys = absent) for `baseHash` inputs. Use it; do not rebuild. Remaining for this story: everything else → F4 (`features/shell/drafts.ts`, restore banner and conflict compare).*

As a user whose session expires mid-edit,
I want my unsaved changes kept on this device and offered back when I relaunch, with a clear choice if the data changed meanwhile,
So that I never lose work to a timeout and never silently overwrite newer data.

**Acceptance Criteria:**

**Given** `features/shell/drafts.ts` and a Section registered with non-empty `draftFields`
**When** the user changes a value in that Section's edit view and `myself` has loaded
**Then** after 500 ms without further changes the registry writes `localStorage["pp:draft:v1:<environment>:<userId>:<sectionId>"] = JSON.stringify({ savedAt: <epoch ms>, baseHash, values })`, where `userId` is the `myself` id, `baseHash` is a stable hash (sorted-key JSON, SHA-256 hex) of the server values of exactly the Section's `draftFields` (read from `myself` and the contact-point keys) the edit started from, so an edit of a shared field on either page (`/` or `/account`) invalidates the other page's draft, and `values` contains only the keys listed in `draftFields`
**And** if the Section becomes clean again (every field back to baseline) its draft key is deleted
**And** only the registry writes and restores draft keys, and only `features/shell/drafts.ts` deletes them; no Section touches `localStorage` (AD-12).

**Given** a Section registers `draftFields` containing a denylisted key (`ssn`, `socialSecurityNumber`, `signature`, `signatureFile`, MFA codes and QR data such as `code`, `mfaCode`, `qrCode`, and NPI selections such as `providerNpiId`, `practiceNpiId`, `npi`) or a Section with `saveAll: false`
**When** it registers
**Then** the registry throws in development and drops those keys in production; a test asserts a draft written while SSN and Signature are dirty contains neither, and that Insurance never writes a draft key (FR2, NFR1).

**Given** `localStorage` is unavailable, full or throws
**When** a draft read or write is attempted
**Then** the error is caught, nothing is shown to the user, and editing and saving work normally.

**Given** the `session-expired` event (Story 1.4) and the `onBeforeSessionExpired` hook of the Story 1.7 dialog
**When** the shell receives it
**Then** pending debounced writes are flushed and a draft is written for every dirty draftable Section before the "Your session ended" dialog opens (test asserts write-before-open order)
**And** choosing "Return to 1health" in that dialog keeps the drafts (UJ-5, UX-DR70); there is no framed variant (AD-5).

**Given** a dirty Section with a draft
**When** the Section saves with `{ ok: true }` (alone, via Save all or via the leave guard), or is discarded (Cancel, "Discard all", leave-guard "Discard")
**Then** that Section's draft key is deleted
**And** when the user confirms the app-bar "Return to 1health" (directly when clean, or after the leave guard), the shell helper `drafts.purgeUser(userId)` (never a registry) deletes every `pp:draft:v1:<environment>:<userId>:*` key for the current user, on both pages' Sections, before logout (hooked into `navigate({ external: "portal" })`, Story 1.7)
**And** a portal hand-off (`navigate({ external: "handoff" })`, AD-22) and the session-expired dialog's "Return to 1health" delete no draft; no other path deletes drafts.

**Given** the app starts
**When** the shell mounts
**Then** every `pp:draft:*` key whose `savedAt` is older than 24 h, or whose value cannot be parsed, or whose version segment isn't `v1`, is deleted; a draft older than 24 h is also ignored if read later in the same session.

**Given** a non-expired draft whose key `userId` equals the current `myself` id
**When** that Section's data has loaded and the current server data hashes to the draft's `baseHash`
**Then** the Section shows the info inline banner (accent background, info icon) "You have unsaved changes from your last visit." with "Restore" and "Discard"
**And** "Restore" opens the Section in edit view with the draft values applied (Section dirty, "Unsaved changes" shown, Save all count updated) and removes the banner
**And** "Discard" deletes the draft and removes the banner, leaving the read view (UX-DR40).

**Given** drafts exist under a different `userId` on this device
**When** the current user's page loads
**Then** they are not offered, not parsed into any Section, and not deleted except by the 24 h purge (FR2).

**Given** a non-expired draft for the current user whose `baseHash` differs from the hash of the current server data
**When** that Section's data has loaded
**Then** the Section shows the info banner "This section changed since your draft. Choose which version to keep." with the conflict compare: one row per field whose draft value differs from the current server value (rows supplied by the Section's `describeDraftDiff(draftValues, current)`), with the field name in kv-key style and columns "Your version" and "Current" (column-header type), empty values shown as "Not provided"; below 768 px each row stacks the two values under the field name, "Your version" first
**And** "Keep mine" (primary) opens edit view with the draft values over a baseline of the current server data (so Save sends the diff against current) and deletes the conflict banner
**And** "Use current" (secondary) deletes the draft and leaves the Section in read view with current data
**And** the app never merges or applies a conflicted draft without one of these choices (UX-DR41).

**Given** a Section's read fails while a draft exists
**When** it renders
**Then** no restore or conflict banner is shown and the draft is kept until the read succeeds.

**Given** a Playwright run of UJ-5 against the mocked proxy using the fixture Section
**When** the user edits, the mocked refresh returns `401 SESSION_EXPIRED`, the user returns, relaunches as the same user, and restores
**Then** the draft key exists after the dialog, the restore banner appears, Restore puts the edit back, Save succeeds with toast "Phone saved." and the draft key is gone; a second run with changed server data shows the conflict compare, and a third run relaunching as a different user shows no banner.

**Covers:** FR2, AD-12 (user-wide purge, `baseHash` over `draftFields`, extended denylist), AD-19, AD-22 (drafts kept on hand-off), AD-26, NFR1, UX-DR33, UX-DR37 (framed variant superseded), UX-DR40, UX-DR41, UX-DR62, UX-DR67, UX-DR70 · **Jira:** NG-9020

### Story 1.16: Deployments, environments and operations runbooks

*Amended 2026-10-13 (architecture update: AD-3, AD-5, AD-19, AD-20, AD-21).*
*Amended 2026-10-14 (decisions D1, D4): one Vercel deployment serves demo and prod; `_DEMO`/`_PROD` secrets; no `APP_ENV`, `APP_ORIGIN`, `PORTAL_URL` or `PUBLIC_FILES_ORIGIN` env vars; launch URL `/auth`.*
*Amended 2026-10-14 (decisions D5, D9): logout also answers GET; a failed launch shows the D9 error alert.*
*Foundation 2026-10-14: built in spec 7.0a — `lib/shared/environments.ts` + its values test, `PP_DISABLED`/`ACCOUNT_DISABLED` in `lib/server/env.ts`, 503 `SERVICE_DISABLED` on `/api/token`, `/api/1h/**`, `/api/session/refresh` and `/api/session/ping` (7.0c-1), logout still working, `.env.example`, `check-forbidden.sh` name rules. Use it; do not rebuild. Remaining for this story: F2: the one kill-switch matcher in root `proxy.ts` for `PP_DISABLED`/`ACCOUNT_DISABLED` + `features/shell/disabled-screen.tsx` (503 on `/auth`, `/`); Team A: Vercel project, `promote` workflow and the `docs/ops/*` runbooks.*
*Foundation 2026-10-14: built in spec F2 — `lib/server/kill-switch.ts` (`killSwitchFor(pathname)`, `isSwitchedOff`, `normalizePath`: `"pp"` for `/`, `/auth`, `/account`, `/handoff`, `/api/1h`, `/api/pp`, `/api/places`, `/api/session/refresh`, `/api/session/ping`; `"account"` for `/account`, `/handoff`, `/api/pp/{mfa,org-logo,practice-support}`; never `/api/session/logout` or `/api/token`, which keeps its own launch-envelope 503) applied first in root `proxy.ts`: API paths → 503 `SERVICE_DISABLED`; page, RSC and prefetch requests are rewritten to `app/disabled/route.ts` → `lib/server/disabled-screen.ts#createDisabledScreenHandler` (503 static HTML, AD-21 + no-store + `Retry-After: 300`, inline token styles with a dark block, no script; copy `lib/shared/messages/disabled.ts#DISABLED_MESSAGES` DRAFT COPY; "Go to 1health" → portal of the session environment, else the `onehealth_environment` cookie, else the referrer on `/auth`, else prod; `/disabled` is 404 when no switch is on); tests `kill-switch.test.ts`, `disabled-screen.test.ts`, `app/disabled/route.test.ts` and `e2e/kill-switch.spec.ts` (builds with `PP_DISABLED=1` on port 3101 and `ACCOUNT_DISABLED=1` on 3102). The screen is a route handler, not `features/shell/disabled-screen.tsx`: Next 16 keeps a 503 only for responses returned by `proxy.ts` or a route handler. Use it; do not rebuild. Remaining for this story: Team A: the Vercel project and scopes, the `promote` workflow, `docs/ops/{deployments,secrets-rotation,rollback,external-application-registration,go-live-checklist}.md` (the environment table records the `publicFilesOrigin` values once confirmed, see deferred-work), the demo rehearsal of rollback and both kill switches, and PM review of the DRAFT disabled copy.*

As a release owner (Daniel Garcia),
I want one Vercel deployment with per-environment secrets, a kill switch, and written registration and go-live runbooks,
So that both 1health environments reach the same verified build, releases are promoted from verified builds, and a bad release can be stopped in minutes.

**Acceptance Criteria:**

**Given** the Vercel team
**When** the project is configured
**Then** one project `personal-profile` exists, linked to this repo, with Node 24.x and pnpm via corepack; its production deployment serves both `demo` and `prod` (there is no `dev` environment and no per-environment project)
**And** its production domain (the app origin) is recorded in `docs/ops/deployments.md`
**And** a Vitest asserts the `lib/shared/environments.ts` map: `apiRoot` `https://1health.demo.1health.io` / `https://1health.app.1health.io`, `apiBase` = `<apiRoot>/api`, `portalUrl` = the same root, and that no `APP_ENV`, `API_ORIGIN`, `APP_ORIGIN`, `PORTAL_URL`, `PORTAL_ORIGIN` or `PUBLIC_FILES_ORIGIN` env var is read (D1, D4). *(built: spec 7.0a)*

**Given** the project's environment variables
**When** they are reviewed against `docs/ops/deployments.md` and `.env.example`
**Then** the Production scope holds `ONEHEALTH_SECRET_KEY_DEMO`, `ONEHEALTH_SECRET_KEY_PROD`, `APP_ID_DEMO`, `APP_ID_PROD`, `SESSION_SECRET` (>= 32 random characters), `GOOGLE_PLACES_KEY`, and non-secret `PLACES_ENABLED` (default `0`), `PP_DISABLED` (default unset), `ACCOUNT_DISABLED` (default unset); `SESSION_SECRET_PREVIOUS` exists only during a rotation
**And** no variable is named `NEXT_PUBLIC_*`, and `_DEMO`/`_PROD` names appear in the repo only where the Story 1.1 forbidden-pattern step allows them (`lib/server/env.ts`, its tests, `.env.example`, CI/test fixtures)
**And** `docs/ops/deployments.md` contains an environment table (environment, API root, portal URL, `publicFilesOrigin`, registration status, owner) with no secret values.

**Given** a pull request
**When** Vercel builds its preview deployment
**Then** the preview never receives `ONEHEALTH_SECRET_KEY_PROD` or `APP_ID_PROD` (Production scope only) and uses its own `SESSION_SECRET`; whether previews may hold the `_DEMO` pair depends on the open demo-data question
**And** Git auto-deploy to production is disabled, so production is never deployed except through the `promote` workflow.

**Given** a commit SHA that passed CI and was smoke-tested on its preview
**When** the release owner runs the `promote` GitHub Actions workflow (`workflow_dispatch` input `sha`)
**Then** the workflow refuses a SHA that is not on `main` or whose CI checks did not pass, deploys that exact SHA to production with `vercel deploy --prod`, requires the `production` GitHub environment approval, and prints the deployment URL; production is never deployed any other way (AD-20)
**And** because one deployment serves both environments, the demo-first rollout (NFR11) is enforced by registration order: demo QA runs against the production deployment through the demo registration before the prod registration is set Active.

**Given** `docs/ops/secrets-rotation.md`
**When** the release owner reads it
**Then** it gives step-by-step procedures: `SESSION_SECRET` (set `SESSION_SECRET_PREVIOUS` = old, new `SESSION_SECRET`, redeploy, wait >= 8 h absolute session limit, remove previous, redeploy); `ONEHEALTH_SECRET_KEY_<ENV>`/`APP_ID_<ENV>` (change in that environment's External Application registration and Vercel together, redeploy immediately, expect in-flight launches of that environment to fail on `/auth` with the "Authentication Failed" error alert (D9); the other environment is unaffected); `GOOGLE_PLACES_KEY` (new key in GCP restricted to Places API (New) with daily quota cap and budget alert, update Vercel, redeploy, delete old key)
**And** states rotation triggers: suspected exposure, team change, and at least yearly, with owner Daniel Garcia.

**Given** `PP_DISABLED=1` on the deployment (then redeployed)
**When** any request reaches `/auth`, `/api/token`, `/api/1h/**`, `/api/pp/**`, `/api/session/refresh`, `/api/session/ping` or `/`
**Then** API routes (incl. `/api/token`) return `503 {"errorCode":"SERVICE_DISABLED","source":"proxy"}` with the AD-18 no-store headers and make no upstream call; `/api/token` neither decrypts nor exchanges the `lpl` and does not touch the session cookie (AD-20) *(built: spec F2)*
**And** `/auth` and `/` answer status 503 and render a full-page disabled message (`features/shell/disabled-screen.tsx`; title "Personal Profile is unavailable right now", body "Use your profile in 1health for now.", action "Go to 1health" to the D4-resolved `portalUrl`; draft copy) directly, with no redirect *(built: spec F2, as the `app/disabled/route.ts` route handler + `lib/server/disabled-screen.ts` instead of `features/shell/disabled-screen.tsx`)*
**And** `/api/session/logout` (POST or GET, D5) keeps working so users can still sign out *(built: spec 7.0a)*
**And** with `PP_DISABLED` unset or any value other than `1` behavior is unchanged *(built: spec F2)*
**And** a Vitest table covers each route family with the flag on and off (AD-20). *(built: spec F2, `kill-switch.test.ts` + `e2e/kill-switch.spec.ts`)*

**Given** `ACCOUNT_DISABLED=1`
**When** the rollback runbook is followed
**Then** `docs/ops/rollback.md` records that Story 1.3 owns the proxy-level 503 for `profile: true` entries and Story 7.2 owns the page/route-level 503 (`/account`, `/handoff/**`, `/api/pp/{mfa,org-logo,practice-support}/**`) (D12), and that `/`, `/auth`, `/api/token` and every Personal Profile route keep working.

**Given** a bad production release
**When** the release owner follows `docs/ops/rollback.md`
**Then** the runbook lists, in order: (1) Vercel instant rollback to the previous production deployment (affects demo and prod together); (2) partial stop of the Profile module only with `ACCOUNT_DISABLED=1` + redeploy; (3) incident stop with `PP_DISABLED=1` + redeploy; (4) ending live sessions by setting `isAllowedForPatients=false` on the affected environment's External Application (disabling the app alone does not revoke tokens); there is no 1health-fe flag step (no 1health-fe changes; the legacy `/profile` and `/personal-settings` screens stay reachable in 1health as the fallback); each step names who runs it and how to verify it (e.g. `curl -si -X POST <app origin>/api/token` shows 503)
**And** the rollback and kill switch are rehearsed once through the demo registration before the go/no-go, with the date recorded in the checklist.

**Given** `docs/ops/external-application-registration.md`
**When** an environment (demo, then prod) is registered
**Then** the runbook specifies: application name "Personal Profile" (record the exact registered name; it is the `openApp` value for the portal login deep link, D4 open question), launch URL exactly `<app origin>/auth` (the same for both environments), icon file path, launch secret generated in 1health and copied into `ONEHEALTH_SECRET_KEY_DEMO`/`APP_ID_DEMO` or `ONEHEALTH_SECRET_KEY_PROD`/`APP_ID_PROD`, status **Active**, **isAllowedForPatients = true**
**And** verification steps: `curl -sI <app origin>/auth` shows `Content-Security-Policy` containing `frame-ancestors 'none'` and `X-Frame-Options: DENY`; a test patient sees the "Personal Profile" tile in the portal Apps launcher and launching lands signed in on Contacts in the app's own tab (top-level; the app is never framed), and the `/api/token` log line shows the expected environment
**And** owner Daniel Garcia and the per-environment registration date are recorded (NFR8).

**Given** `docs/ops/go-live-checklist.md`
**When** the release owner prepares demo and then prod
**Then** the checklist includes, each with owner and status: BAA executed with Vercel (functions, logs, any log drain) before the deployment processes real PHI (it serves prod, so this gates the prod registration); BAA executed with Google before `PLACES_ENABLED=1` is set; no telemetry or log sink added without a BAA; External Application registered and Active per environment; CI green on the promoted SHA; demo QA of UJ-1 to UJ-5 passed by 2026-10-24 (otherwise production cutover is no-go and moves to the next release); rollback, `ACCOUNT_DISABLED` partial stop and `PP_DISABLED` kill switch rehearsed through demo; minimum alerting (proxy 5xx rate, `SESSION_EXPIRED` after refresh) and Vercel log retention decided; production go-live (External Application Active and allowed for patients in prod) on 2026-10-29 (release 2026.07.01 "Conduit"); no 1health-fe flag item (NFR11 as amended, NFR13).

**Covers:** AD-3 (as superseded: environment map), AD-5, AD-19 (error envelope), AD-20 (as amended: one project, secrets, promotion, `PP_DISABLED`, `ACCOUNT_DISABLED`, runbooks), AD-21, D1, D4, D10 (verification of frame headers), D12 (runbook references only), NFR6, NFR8, NFR11 and NFR12 (as amended: no 1health-fe flag), NFR13 · UX-DR50 (as amended) · **Jira:** NG-9027

## Epic 2: Identity — Personal Information, SSN and Signature

Users and providers keep their legal identity and demographics correct, reveal their own SSN safely, and draw or upload their Signature.

**FRs covered:** FR11, FR12, FR13, FR14 · **Jira:** NG-9022

**Depends on:** Epic 1 only (launch/session, allowlisted `/api/1h` proxy + `callApi` with literal `me` owner ids, `["pp","myself"]` SWR key, page shell with Section index/Jump to and `#signature` anchor, `SectionRegistry`/`useRegisterSection`, Section edit model and table footer, react-hook-form + zod + `lib/shared/messages.ts` + `lib/api/errors.ts`, aria-disabled tooltip pattern, Save all, drafts with per-Section `draftFields` allowlist, `components/ui/confirm-dialog.tsx` (Story 1.11), toasts (Story 1.12), `lib/shared/image-reencode.ts` (Story 1.10), the proxy `asImage` and upload-entry mechanisms (Stories 1.9 and 1.10) and the `DELETE /v2/file/{id}` entry with server-forced `hardDelete=true` (Story 1.10)). Each story adds the allowlist entries for the endpoints it uses. Stories 2.2–2.4 build on the earlier Epic 2 stories.

**Copy rule (all stories):** every user-facing string goes into `lib/shared/messages.ts`. Strings quoted from EXPERIENCE.md Voice and Tone or the approved `key-personal-info-edit.html` mock are verbatim. Strings marked *(draft copy)* are not in EXPERIENCE.md. They are flagged in `messages.ts` for PM review (UX-DR68).

---

### Story 2.1: View Personal Information

*Amended 2026-10-13 (architecture update: AD-2, AD-13).*
*Foundation 2026-10-14: built in spec F1 — every `myself` field this Section reads (`lib/api/myself.ts`: names, `namePrefix`, `nameSuffix`, `otherNames`, `titles`, `birthDate` (`YYYY-MM-DD`, null = withheld), `cityOfBirth`, `race`, `ethnicity`, `biologicalGender`, `genderIdentity`, `sexualOrientation`, masked `socialSecurityNumber`, `signature {id,name}`), `keys.myself()`, `keys.typeKey("Person")` (declared), `lib/shared/dates.ts#wireToDisplayDate` (no timezone shift), the `GET v2/file/{fileId}/download` image entry (`lib/server/proxy/allowlist/files.ts`: numeric id, no client query, `preview=true` forced; `files.test.ts`). Use it; do not rebuild. Remaining for this story: F2 inline/attachment hardening of `asImage`; F3 key/value table, `StateFrame`, `SignatureThumb`; Team A: `lib/api/personal.ts`, the one `type-key` loader (shared with Story 3.1: `registerFetcher` allows one loader per key family, whichever story lands first adds it), `lib/shared/person-options.ts`, the `GET v2/type/key/Person` entry, the Section. Area files (edit only these, never the `index.ts` aggregators): allowlist `lib/server/proxy/allowlist/personal.ts`, copy `lib/shared/messages/person.ts`, errors `lib/api/errors/personal.ts`. A new `lib/api/<resource>.ts` registers its own loader with `registerFetcher()` and is re-exported from `lib/api/index.ts`.*
*Foundation 2026-10-14: built in spec F2 — the `asImage` inline/attachment hardening used by the `GET v2/file/{fileId}/download` entry (`lib/server/proxy/forward.ts` + `lib/server/http/image-sniff.ts`: inline with `Content-Type` from PNG/JPEG/BMP leading bytes, otherwise `attachment; filename="file"`; nosniff, no-store; 10 s upstream idle timer; deny re-check after owner substitution). Use it; do not rebuild. Remaining for this story: unchanged otherwise (F3 key/value table, `StateFrame`, `SignatureThumb`; Team A: `lib/api/personal.ts`, the type-key loader, `lib/shared/person-options.ts`, the `GET v2/type/key/Person` entry, the Section and its tests).*
*Foundation 2026-10-14: built in spec F3-1 — `LoadError` on `InlineBanner` for "Couldn't load personal information · Retry", `focus-ring`. Callers of `LoadError`/`ReadStateFor` pass `attempt` (failure count) so a repeated failure is re-announced. Use it; do not rebuild. Remaining for this story: unchanged (F3-2 key/value table, F3-3 `StateFrame`/`SignatureThumb`; Team A).*
*Foundation 2026-10-14: built in spec F3-2 / F3-3 — `KeyValueTable({ rows: { key, label, value?, rowId? }[], labelledBy })` (desktop four columns row by row with the vertical hairline, mobile one pair per row, "Not provided" for empty values; give the Signature row `rowId: SIGNATURE_ANCHOR`), `SectionLandmark`/`SectionHeader`/`SectionContainer`, `StateFrame` (`skeleton="table"` or `"kv"`, `loadError: { kind: "section", sectionId: "personal" }` → "Couldn't load personal information", `level="section"`, `onRetry` revalidating only `keys.myself()`, `attempt`, `anchors` keeping the `signature` row while loading, `onReady` → `useSectionNavigation().frameReady("personal")`), `SignatureThumb({ fileId: myself.signature?.id, fallback: "Not provided" })` (112 × 32, proxy `asImage` src via `lib/api/files.ts#fileDownloadPath`, skeleton, error → fallback). Use it; do not rebuild. Remaining for this story: Team A: the Personal information read Section in place of the placeholder frame in `features/shell/contacts-panel.tsx`, its row mapping and copy.*

As a Launching user (patient or provider),
I want to see my legal name, birth details, demographics, Masked SSN and Signature in one table,
So that I can check that my identity record is correct at a glance.

**Acceptance Criteria:**

**Given** the Contacts tab has loaded
**When** the Personal information Section (`features/personal`, Section id `personal`, display order 1, anchor `#personal`) renders
**Then** it shows a Section header `h2` "Personal information" with an outline "Edit" button (the button is wired in Story 2.2)
**And** the data comes from the shared `["pp","myself"]` SWR key (`GET /api/1h/v2/user/myself`); no GraphQL and no `GET /v2/person/{id}` call is made.

**Given** `myself` has loaded
**When** the read view renders
**Then** the fields appear in exactly this order (F1), with no group headings: Name prefix · First name · Middle name · Last name · Name suffix · Other names · Titles · Birth date · City of birth · Race · Ethnicity · Biological gender · Gender identity · Sexual orientation · SSN · Signature
**And** no email or phone number field appears in this Section.

**Given** a field is empty, null, an empty array or `"n/a"`
**When** it is shown in the read view
**Then** the value reads "Not provided" in `kv-value-empty` style (muted, 400), never "—" or blank.

**Given** a viewport ≥ 768 px
**When** the read view renders
**Then** it is a key/value table with four columns (key ~16 % | value ~34 % | key ~16 % | value ~34 %), a vertical hairline between the two pairs, fields filled row by row in F1 order, and no row hover
**And** keys use `kv-key` (muted, 14 px) and values use `kv-value` (foreground, 14/500), on 1health tokens only (no hex, no Tailwind palette classes).

**Given** a viewport < 768 px (down to 360 px)
**When** the read view renders
**Then** each row is one Field | Value pair with the key column at 44 %
**And** there is no horizontal scroll at 360 px.

**Given** `birthDate` is `YYYY-MM-DD` on the wire
**When** it is shown
**Then** it displays as `MM/DD/YYYY` (e.g. `1987-03-09` → `03/09/1987`), parsed as a calendar date with no timezone shift.

**Given** `race`, `ethnicity` or `biologicalGender` arrive as an array
**When** they are shown
**Then** the values are joined with ", ". A single string is shown as is.

**Given** `myself.socialSecurityNumber` holds a Masked SSN (e.g. `***-**-1234`)
**When** the SSN row renders
**Then** it shows the Masked SSN in `mono-value` typography and never a full SSN
**And** when no SSN is set it reads "Not provided". The Reveal control is added in Story 2.3.

**Given** `myself.signature` holds a file id
**When** the Signature row renders
**Then** it shows a 112 × 32 px signature thumbnail (`signature-thumb`: background surface, `--border`, `rounded-sm`, image `object-contain`) loaded as `<img src="/api/1h/v2/file/{id}/download" alt="Your signature">` through the proxy's `asImage` entry (no blob conversion, no token in the browser)
**And** the meta text "Added {date}" (`MM/DD/YYYY`) appears beside it when the platform returns a file date. If it doesn't, the thumbnail appears without meta
**And** the Signature row has `id="signature"` so the shell's `#signature` deep link can target it
**And** when `signature` is empty the row reads "Not provided"
**And** when the image fails to load, the row shows "Not provided" in place of a broken image *(behavior; no new copy)*.

**Given** the Section is mounted
**When** option lists are needed (for display normalization now and for editing in Story 2.2)
**Then** `fetchPersonTypeKeys()` in `lib/api/personal.ts` calls `GET /api/1h/v2/type/key/Person` under SWR key `["pp","type-key","Person"]` and returns the VALUE_LIST attribute values for `race`, `ethnicity` and `biologicalGender`, with `"n/a"` dropped and each list sorted alphabetically (locale compare)
**And** if that request fails, race and ethnicity use the addendum §C fallback lists from `lib/shared/person-options.ts` (Race: American Indian or Alaska Native, Asian, Black or African American, Hispanic or Latino, Middle Eastern or North African, Native Hawaiian or other Pacific Islander, White, Other Race, Unknown. Ethnicity: Not Hispanic or Latino, Hispanic or Latino, Unknown), and biological gender falls back to a list holding "Asked but not answered" plus the user's current value
**And** a failed option-list request never blocks or errors the read view
**And** the fixed gender identity list (Asked but not answered, Female, Male, Other) lives in `lib/shared/person-options.ts`.

**Given** `myself` is still loading
**When** the Section renders
**Then** it shows the real table container with three skeleton rows (muted bars with shimmer, static under `prefers-reduced-motion`) while the page shell, header frame, tabs and index are already visible.

**Given** `myself` fails to load
**When** the Section renders
**Then** an inline error banner replaces the rows inside the table container: alert icon, error-strong text "Couldn't load personal information · Retry"
**And** "Retry" re-fetches only `["pp","myself"]`, and other Sections are unaffected.

**Given** the Section index or Jump to lists "01 Personal information"
**When** it renders
**Then** its count column is blank.

**Given** the endpoints this story reads
**When** it is done
**Then** the proxy allowlist entries for these exact endpoints are added in this change (method + path template + allowed query; server-forced params), each with a proxy test:
- `GET /v2/type/key/Person` — no query params allowed (any → 400 `BAD_QUERY`), no body, JSON response, no `X-PP-Session` (D5); no server-forced params;
- `GET /v2/file/{id}/download` as an `asImage` entry for the Signature preview (reused unchanged if Story 9.3 already added it) — `{id}` matching `^\d{1,19}$`, no client query params allowed, `preview=true` forced server-side on the upstream request (client value ignored, AD-2); served `inline` only for PNG/JPEG/BMP with matching leading bytes, otherwise `attachment`, with the Story 1.9 `asImage` headers (`nosniff`, `Cache-Control: private, no-store, max-age=0`) *(built: specs F1 + F2)*
**And** another method on either template answers 405.

**Given** the component tests (Vitest + Testing Library + MSW at `/api`)
**When** they run
**Then** they cover: the F1 order, "Not provided" for null/empty/`"n/a"`/`[]`, the date format, array joining, Masked SSN only, signature present/absent/broken, option-list sort and `"n/a"` removal, fallback on a 500 from `/type/key/Person`, skeleton, and the error banner plus Retry
**And** an axe check passes on the read view in light and dark themes.

**Covers:** FR11, NFR1, NFR4, NFR5, NFR10, AD-2 (`preview=true` on `asImage`), AD-10, AD-13 (image via proxy URL), AD-17 (as superseded by D5: 415 JSON check only), AD-18 · UX-DR8, UX-DR24, UX-DR33, UX-DR34, UX-DR58 (anchor target), UX-DR67 · **Jira:** NG-9022

---

### Story 2.2: Edit and save Personal Information

*Amended 2026-10-13 (architecture update: AD-9, AD-11, AD-12; PA4).*
*Foundation 2026-10-14: built in spec F1 — the full `PUT v2/user/edit` entry (`userEditBodySchema`, `RACES`, `ETHNICITIES`, `BIOLOGICAL_GENDERS` in `lib/server/proxy/allowlist/personal.ts`: backend lengths, enums, SSN/birth-date/language patterns, names forwarded trimmed, rejects `locale`/`username`/`enabled`/`receiveNotifications`, `phoneNumber` + `phoneNumberRegion` only together; table tests), `lib/shared/person-rules.ts` (`normalizeName`, `nameIssue`, `textIssue`, `NAME_MAX_LENGTH`, `PREFIX_SUFFIX_MAX_LENGTH`, `SHORT_TEXT_MAX_LENGTH`, `hasProctorRole`, `birthDateAgeRange`, `isBirthDateInRange` with the backend `minusYears` semantics), PA4 copy in `lib/shared/messages/person.ts` (`PERSON_MESSAGES`: required and too-long names, `birthDateRequired`, `birthDateFormat`, `ageRange` `{min}`/`{max}` template), `lib/shared/dates.ts` (`parseDisplayDate`, `displayToWireDate`, `localCalendarDate`), the `updateAccount` and zod-literal lint rules, `mutateMyself()`, `mapApiError("personal", …)`. Use it; do not rebuild. Remaining for this story: `personalSchema` on the shared rules (the printable-only copy goes in `messages/person.ts`), `savePersonalInformation` in `lib/api/personal.ts`, the payload type without email/phone and its test, the Section on the F3 kit, Select/Combobox/date input (F5), drafts (F4). Area files (edit only these, never the `index.ts` aggregators): allowlist `lib/server/proxy/allowlist/personal.ts`, copy `lib/shared/messages/person.ts`, errors `lib/api/errors/personal.ts`.*
*Foundation 2026-10-14: built in spec F3-1 — `FormField`/`FieldError` + the restyled `Input` (muted "(optional)" suffix, `required`), `Select` (`components/ui/select.tsx`) for Race, Ethnicity and Biological gender, `Button` `busy` ("Saving…") for the footer Save, `toastSuccess("Personal information saved.")` copy from the catalog. Use it; do not rebuild. Remaining for this story: unchanged otherwise (the Section on the F3-2 kit, Combobox/date input F5, drafts F4, Team A schema and save).*
*Foundation 2026-10-14: built in spec F3-2 — `useSectionForm` with `id: "personal"`, label "Personal information" (default `successToast` → "Personal information saved."), `cancelFocus: "heading"` (default), `onNoChanges: "close"` (default: nothing sent, read view, no toast), `errorFields` for a server field not named like the form path (`ssn` maps by name), `fieldOrder` (Name prefix first), `draftFields` (never SSN or Signature); `save(values, baseline)` sends the diff through `callApi` (or one-step `runSaveSteps(steps, { scope: "personal", mode: "stop" })`) and returns a `SaveResult`; `KeyValueEditTable` (240 px key column, controls ≤ 480 px, label above control on mobile), `SectionContainer`/`SectionHeader` ("Editing")/`SectionFooter {...footerProps}`; network Retry re-sends the same diff. Use it; do not rebuild. Remaining for this story: unchanged otherwise (Team A schema, diff and Section; Combobox/date input F5; drafts F4).*

As a Launching user,
I want to edit my name, birth details and demographics in place, with the rules explained before I save,
So that my legal identity is correct on the platform without guessing what is accepted.

**Acceptance Criteria:**

**Given** the read view from Story 2.1
**When** I activate "Edit"
**Then** the whole Section switches to edit view in place: the table container gets the primary border and the 3 px accent halo, the header shows muted "Editing", and focus moves to the first control (Name prefix)
**And** the table footer shows "Unsaved changes" (8 px warning dot, polite live region) after the first change, plus Cancel (secondary) and Save (primary).

**Given** edit view on a viewport ≥ 768 px
**When** it renders
**Then** it is a two-column Field | Value table with a 240 px key column (label charcoal, weight 500, top-aligned to the control) and value controls capped at 480 px, with help or error text under each control
**And** the field order is the same F1 order as the read view.

**Given** edit view on a viewport < 768 px
**When** it renders
**Then** each field stacks its label above a full-width control, with a hairline between fields, and there is no horizontal scroll at 360 px.

**Given** the edit view
**When** labels render
**Then** optional fields read "{Label} (optional)" with the suffix muted at weight 400: Name prefix, Middle name, Name suffix, Other names, Titles, City of birth, Sexual orientation, SSN, Signature
**And** required fields (First name, Last name, Birth date, Race, Ethnicity, Biological gender, Gender identity) carry no marker
**And** every control is 44 px tall with 16 px text, a 1 px `control-border` outline, and a `<label for>` association.

**Given** the help text rules
**When** the edit view renders
**Then** Other names shows "Former or other legal names.", Gender identity shows "Choose from the list or type your own.", and Sexual orientation shows "Up to 128 characters."
**And** Birth date shows age-rule help before any error: "You must be between 18 and 120 years old" (or "You must be between 21 and 120 years old" for a user whose `myself.roles` includes Proctor), the unified Profile addendum §D copy shared with `/account` Account settings (PA4).

**Given** a name field (First, Middle, Last, prefix, suffix, Other names, Titles)
**When** I leave it or press Save
**Then** First name and Last name are required ("First name is required" / "Last name is required") and are 1–24 characters after trimming ("First name can be up to 24 characters" / "Last name can be up to 24 characters"); the 24-character maximum is new for Personal information and matches the backend rule (PA4)
**And** the name and birth-date rules (required, 1–24 chars after trim, age 18–120 or 21–120 for Proctor) are imported from the shared `lib/shared/person-rules.ts` (created by whichever of Story 2.2 / Stories 7.4–7.5 lands first; the other adds only what is missing), which `features/account` (Epic 7) also imports; `personalSchema` does not redefine them, and the messages are the unified §D keys in `lib/shared/messages.ts` used by both pages (AD-11, PA4)
**And** every name field accepts printable characters only, including accented letters, apostrophes, hyphens, periods and spaces; control characters and emoji are rejected with "Use letters, spaces and standard punctuation only" *(draft copy)*
**And** leading and trailing whitespace is trimmed before validation and diffing.

**Given** the Birth date control (a date input shown as `MM/DD/YYYY`, sent as `YYYY-MM-DD`)
**When** I leave it or press Save
**Then** it is required ("Birth date is required"), and it is invalid when the date is unparsable ("Enter a date as MM/DD/YYYY"), in the future, or gives an age (whole years at today's local date) outside 18–120 (or 21–120 for Proctor), per `lib/shared/person-rules.ts`
**And** the age error reads "You must be between 18 and 120 years old" (or "You must be between 21 and 120 years old" for Proctor) in error-strong with an alert icon, a 2 px error border, `aria-invalid="true"` and `aria-describedby` pointing at the message
**And** boundary tests pass: 18th birthday today is valid, one day short of 18 is invalid, age 120 is valid, age 121 is invalid. The same boundaries apply at 21 for Proctor.

**Given** the Race, Ethnicity and Biological gender selects
**When** they render
**Then** their options come from Story 2.1's option lists (platform list, else fallback)
**And** an unset value preselects "Unknown" (Race), "Unknown" (Ethnicity) or "Asked but not answered" (Biological gender). A default preselected by the app counts as a change, so it is sent on Save
**And** each is required. An empty choice reads "Choose a value" *(draft copy)*.

**Given** the Gender identity control
**When** I use it
**Then** it is a combobox (free text allowed) offering Asked but not answered, Female, Male, Other, and it accepts typed free text
**And** it is required, with printable characters only. An unset value preselects "Asked but not answered".

**Given** Sexual orientation and City of birth
**When** I type more than 128 characters, or non-printable characters
**Then** the field shows an inline error: Sexual orientation "Up to 128 characters." and City of birth "Up to 128 characters" *(draft copy for City)*.

**Given** validation runs on blur and on Save
**When** any field is invalid and I press Save
**Then** no request is sent, the first invalid field receives focus, and every error is announced via `aria-describedby`
**And** Enter in an input does not submit the Section, and Escape does not cancel edit mode.

**Given** I changed some fields and the form is valid
**When** I press Save
**Then** Save shows a spinner and "Saving…", inputs become read-only, Cancel is disabled, and other Sections stay usable
**And** `savePersonalInformation(diff)` in `lib/api/personal.ts` sends `PUT /api/1h/v2/user/edit` with only the changed fields of `PersonalInformationDTO` (`firstName, middleName, lastName, namePrefix, nameSuffix, otherNames, titles, birthDate, cityOfBirth, race, ethnicity, biologicalGender, genderIdentity, sexualOrientation`, plus `socialSecurityNumber` per Story 2.3), in the shape the platform returns them (array vs string kept per field)
**And** a cleared optional field is sent as `"n/a"`
**And** with no changed fields, Save sends nothing and returns to read view without a toast.

**Given** any save of this Section
**When** the request body is built
**Then** it never contains `email`, `phoneNumber` or `phoneNumberRegion`, even when present in `myself`: the Personal-information payload type omits the three fields, and only `lib/api/account.ts#updateAccount()` (Epic 7) may build them (ESLint `no-restricted-imports` allows `updateAccount` only in `features/account`). A unit test asserts this for a full diff (AD-9).

**Given** the PUT succeeds
**When** the save resolves
**Then** the Section `mutate`s `["pp","myself"]`, the profile header name updates at once without a reload, the Section returns to read view, the toast "Personal information saved." appears, focus moves to the Section `h2`, and the Section's draft is cleared
**And** because the `/account` draft's `baseHash` covers the server values of its `draftFields` (names, birth date) read from `myself`, this save makes any stored `/account` draft of those fields show the conflict UI instead of restoring silently (AD-12).

**Given** the PUT fails with a 4xx carrying an `errorCode`
**When** the error is mapped in `lib/api/errors.ts`
**Then** a field-specific code is shown under that field (e.g. `SOCIAL_SECURITY_NUMBER_EXISTS` → SSN, Story 2.3), `INVALID_ENUM_VALUE` and unknown codes show a Section-level error with Retry, and the Section stays in edit with my values.

**Given** a network failure or 5xx
**When** the save fails
**Then** the Section stays in edit and shows "Couldn't save personal information. Check your connection." with "Retry". Retry resends the same diff.

**Given** the Section is registered with `useRegisterSection`
**When** it registers
**Then** it uses `{ id: "personal", label: "Personal information", displayOrder: 1 }`, saves first in Save all's `SAVE_ORDER`, and its `save()` resolves `{ok:true} | {ok:false, error}` without throwing
**And** `draftFields` is exactly `firstName, middleName, lastName, namePrefix, nameSuffix, otherNames, titles, birthDate, cityOfBirth, race, ethnicity, biologicalGender, genderIdentity, sexualOrientation`. SSN and Signature are never in it, and a test asserts no `pp:draft:v1:*:personal` value contains `socialSecurityNumber` or signature data
**And** Cancel reverts only this Section (no confirm), and dirty state feeds the Save all count and the leave guard.

**Given** the endpoint this story writes
**When** it is done
**Then** the proxy allowlist entry for `PUT /v2/user/edit` is added in this change (method + path template + allowed query; server-forced params): no query params allowed (any → 400 `BAD_QUERY`), JSON body only (`Content-Type` other than `application/json` → 415 `UNSUPPORTED_MEDIA`), body schema rejects `locale` (accepts `email`, `phoneNumber`, `phoneNumberRegion` only because `updateAccount()` needs them; AD-9 restricts the caller), no CSRF or `X-PP-Session` check (D5), no server-forced params *(built: spec F1)*
**And** a proxy test covers the happy path, a foreign `Content-Type` (415) and another method (405). *(built: spec F1)*

**Given** the zod schema `personalSchema` in `features/personal/schema.ts`
**When** unit tests run
**Then** they cover each rule above, including 24 and 25 characters after trimming for First and Last name, the diff builder (changed-only, `"n/a"` on clear, no email/phone), the Proctor branch, defaults counted as changes, and `save()` result shapes for 200 / 400 with `errorCode` / network error.

**Covers:** FR12, FR4, FR7, FR9 (header refresh), NFR2, NFR10, NFR14, AD-7, AD-8, AD-9 (sole `updateAccount()` builder), AD-10, AD-11 (`lib/shared/person-rules.ts`), AD-12 (`baseHash` over `draftFields`), AD-19, PA4, PRC15 · UX-DR9, UX-DR22, UX-DR24, UX-DR29, UX-DR56, UX-DR57, UX-DR61, UX-DR62, UX-DR67, UX-DR68 · **Jira:** NG-9022

---

### Story 2.3: SSN entry and Reveal

*Foundation 2026-10-14: built in spec F1 — the SSN-taken row in `lib/api/errors/personal.ts` (`Messages.SOCIAL_SECURITY_NUMBER_EXISTS` text → `mapApiError("personal", …)` = `{kind:"field", field:"ssn", messageKey:"person.ssnTaken"}`, "This SSN belongs to another person"), the SSN pattern `^(\d{3}-\d{2}-\d{4}|\d{9}|n/a)$` on `PUT v2/user/edit`, masked `myself.socialSecurityNumber`. Use it; do not rebuild. Remaining for this story: everything else (Team A): Reveal, the `ssn/expose` entry, the SSN input, focus on the mapped field. Area files (edit only these, never the `index.ts` aggregators): allowlist `lib/server/proxy/allowlist/personal.ts`, copy `lib/shared/messages/person.ts`, errors `lib/api/errors/personal.ts`.*

As a Launching user,
I want to add, change or clear my SSN and briefly reveal it on demand,
So that my SSN is correct while it stays hidden from anyone looking at my screen.

**Acceptance Criteria:**

**Given** a saved SSN
**When** the SSN row renders in read or edit view
**Then** it shows the Masked SSN (`***-**-1234`) in `mono-value` and a "Reveal" text button (eye icon, link-text color, underlined, 44 × 44 px target, accessible name "Reveal SSN")
**And** with no saved SSN there is no Reveal button (read: "Not provided"; edit: empty input).

**Given** I activate "Reveal"
**When** `revealSsn()` in `lib/api/personal.ts` calls `GET /api/1h/v2/person/me/ssn/expose` through `callApi` (the proxy fills `{personId}` from the session; any id other than `me` gets 403)
**Then** the full SSN (`socialSecurityNumber` from `{id, socialSecurityNumber}`) is shown formatted `XXX-XX-XXXX` in place of the mask
**And** a 16 px countdown ring (border track, primary progress) depletes clockwise over 30 s beside a "Hide" button (44 px)
**And** under `prefers-reduced-motion` the ring is replaced by the static text "Hides in 30 s"
**And** a polite live region announces "Social Security number shown, hides in 30 seconds"
**And** focus moves to "Hide".

**Given** the SSN is revealed
**When** 30 s pass, I press "Hide", the window loses focus (`blur`), `document.visibilityState` becomes `hidden`, `pagehide` fires, the Section saves or cancels, the component unmounts, or the shell publishes `session-expired` (there is no `session-changed`, D5)
**Then** the full value is removed from component state at once and the Masked SSN returns
**And** if focus was on "Hide", it moves to "Reveal"
**And** a fake-timer test covers each trigger.

**Given** the revealed SSN
**When** it is fetched and held
**Then** it lives only in React component state of the SSN component: never in SWR or any cache, `localStorage`, `sessionStorage`, IndexedDB, URL, draft, form default values, telemetry, `console.*` or the dev debug logger
**And** the fetch bypasses the SWR fetcher
**And** tests assert, after a reveal, that the SWR cache, both storages and the `console` spies contain no 9-digit SSN.

**Given** Reveal fails (network, 403, 5xx)
**When** the error returns
**Then** the mask stays and an inline error under the SSN reads "Couldn't show your SSN. Try again." *(draft copy)*. A session error is handled by the shell (AD-19).

**Given** edit view with a saved SSN
**When** the SSN input renders masked
**Then** it shows `***-**-1234` with help "Type a new number to replace it."
**And** when revealed in edit view, the input shows the full value with help "Format XXX-XX-XXXX. Hides in 30 s. Clear it to remove your SSN."
**And** an auto-hide restores the mask only if I have not changed the revealed value. Once I type, the value counts as a new entry and is not auto-hidden.

**Given** I type in the SSN input
**When** digits are entered or pasted (e.g. `123456789`, `123 45 6789`, `123-45-6789`)
**Then** the value auto-formats to `XXX-XX-XXXX`, accepts at most 9 digits, and ignores non-digits
**And** typing over a masked value replaces the whole mask with the typed digits
**And** the caret stays usable for deletion across hyphens.

**Given** the SSN field is validated on blur and on Save
**When** the value is neither the untouched mask, a complete `^\d{3}-\d{2}-\d{4}$` value, nor empty
**Then** it shows "Enter all 9 digits of your SSN" *(draft copy)* with the standard error treatment, and nothing is sent.

**Given** the Section is saved
**When** the diff is built
**Then** `socialSecurityNumber` is included only if it changed and is not masked: a new 9-digit value is sent as `XXX-XX-XXXX`, a cleared field (empty, where an SSN was saved) is sent as `"n/a"`, and the untouched mask or an unchanged revealed value is never sent.

**Given** the platform returns `SOCIAL_SECURITY_NUMBER_EXISTS`
**When** `lib/api/errors.ts` maps it
**Then** the SSN field shows "This SSN belongs to another person", focus moves to the SSN input, and the Section stays in edit with no other field marked.

**Given** a successful save that changed the SSN
**When** `["pp","myself"]` refreshes
**Then** the read view shows the new Masked SSN (or "Not provided" after a clear), and the typed SSN is dropped from form state.

**Given** the endpoint this story reads
**When** it is done
**Then** the proxy allowlist entry for `GET /v2/person/{personId}/ssn/expose` is added in this change (method + path template + allowed query; server-forced params): `{personId}` accepts only the literal `me`, which the proxy substitutes with the session's `personId` (any other value, including the user's own numeric id → 403 `NOT_ALLOWED`); no query params allowed (any → 400 `BAD_QUERY`); no `X-PP-Session` (D5); no server-forced params
**And** proxy tests cover `me`, a numeric id and an extra query param.

**Given** drafts and logging
**When** the Section is dirty or the session expires
**Then** the SSN is never written to a draft (not in `draftFields`), and the server/proxy logs of `ssn/expose` and `user/edit` contain only method, path template, status, duration and request id (AD-15). A proxy test asserts that the `ssn/expose` response carries `Cache-Control: private, no-store, max-age=0`.

**Covers:** FR13, NFR1, NFR2, AD-2, AD-10, AD-17 (as superseded by D5: 415 JSON check only), AD-11, AD-12, AD-15, AD-18, AD-19 · UX-DR48, UX-DR29, UX-DR63, UX-DR64, UX-DR62, UX-DR68 · **Jira:** NG-9022

---

### Story 2.4: Signature

*Foundation 2026-10-14: built in spec 7.0b-1 — `components/ui/confirm-dialog.tsx` (`ConfirmDialog`, `variant: "destructive"`) for "Remove your signature?". Use it; do not rebuild. Remaining for this story: everything else (Team A; F3 edit kit, F2 upload entries).*
*Foundation 2026-10-14: built in spec F1 — `myself.signature` (`{id,name}|null`), the `GET v2/file/{fileId}/download` image entry, `mutateMyself()`. Use it; do not rebuild. Remaining for this story: unchanged (Team A; F2 upload entries and hardening, F3 edit kit). Upload and `DELETE v2/file` entries go in `lib/server/proxy/allowlist/files.ts`; copy in `lib/shared/messages/person.ts`.*
*Foundation 2026-10-14: built in spec F2 — the two Signature upload entries in `lib/server/proxy/allowlist/personal.ts` (`SIGNATURE_MAX_BYTES` 1 MB, PNG only, no client query): `POST v2/health/type/Person/{personId}/relation/PersonHasSignatureFile/file/upload` (`me` only, part `file`, `isPublic=false` forced) and `POST v2/file/{fileId}/version` (part `fileNewVersion`, `current=true` forced), on the F2 upload mechanism (`lib/server/proxy/upload.ts`, 413/415), plus `asImage` download hardening for the thumbnail. **Id ownership:** the version entry checks `{fileId}` only against `^\d{1,19}$`, and the backend has no ownership check on uploads, so the client must take the id only from `myself.signature.id`, never from user input or the URL. Use it; do not rebuild. Remaining for this story: Team A: `signature-pad.tsx`, the save steps, the `DELETE v2/file/{id}` entry (Story 1.10, `hardDelete=true` forced) and its `?hardDelete=false` test, the client-URL test, the remove confirm, the drafts exclusion, the deep link and the Playwright run; resolve or accept the signature-version ownership gap (deferred-work: ids trusted from the client, a named op could verify ownership) and note that hard delete may leave private S3 objects (deferred-work backend follow-up).*
*Foundation 2026-10-14: built in spec F3-1 — `Button` `busy`/`busyLabel` for Save, `ConfirmDialog` for Remove signature (its busy confirm now reads "Saving…"), `toastSuccess` / `toastError(text, { onRetry })`, `focus-ring` on every control. Use it; do not rebuild. Remaining for this story: unchanged (Team A; F3-2 edit kit, F3-3 `SignatureThumb`).*
*Foundation 2026-10-14: built in spec F3-2 / F3-3 — `SignatureThumb({ fileId, fallback: "Not provided" })` (a new `fileId` gets a fresh image, never the previous version), `runSaveSteps(steps, { scope: "personal", mode: "stop", refetch, rebase })` for the upload → link steps (Retry sends only what is left), `useSectionForm` `describeError` for "Couldn't save your signature. Try again.", and the `#signature` deep link with one re-scroll after data loads (`useHashAnchors` with `PROFILE_SUB_ANCHORS` + the Personal information `StateFrame` `onReady`, instant under reduced motion). Use it; do not rebuild. Remaining for this story: unchanged (Team A pad, upload/remove flow, Signature row edit UI).*

As a provider (or any Launching user),
I want to draw or upload my Signature, replace it, or remove it with a confirmation,
So that the documents I sign carry the right signature.

**Acceptance Criteria:**

**Given** the Personal information Section in edit view
**When** the Signature row renders
**Then** it hosts `features/personal/signature-pad.tsx`, a direct wrapper of `signature_pad` 5.1.4 (no `react-signature-canvas`): full value-column width capped at 480 px, 160 px tall, background surface, 1 px `control-border`, `rounded-md`, a baseline rule in `--border`, and ink in `--foreground` (works in dark theme)
**And** the pad shows the cue "Draw your signature" while empty
**And** below the pad are "Clear" (ghost) and "Upload image instead" (ghost, upload icon), each 44 px tall
**And** the help line reads "Draw with a mouse, finger or pen, or upload a PNG or JPEG. Saved {date}.", with "Saved {date}." omitted when there is no saved Signature or no file date.

**Given** a saved Signature
**When** edit view opens
**Then** the saved image is loaded into the pad from `/api/1h/v2/file/{id}/download`, and the Section is not dirty until I draw, clear or upload.

**Given** the pad
**When** I draw with a mouse, a finger (touch) or a pen (pointer events)
**Then** strokes render smoothly with no page scroll while drawing on touch devices (`touch-action: none` on the canvas only)
**And** the canvas is sized for `devicePixelRatio` and keeps its strokes when the viewport resizes or rotates
**And** the first stroke marks the Section dirty.

**Given** the pad has content
**When** I press "Clear"
**Then** the pad empties as a draft change (no request, no confirm yet), and the Section is dirty if a Signature was saved.

**Given** I choose "Upload image instead"
**When** I pick a file
**Then** only PNG or JPEG (checked by MIME type and leading bytes) is accepted. Anything else shows "Choose a PNG or JPEG image." *(draft copy)* under the pad and leaves the pad unchanged
**And** an accepted file is converted with `reencodeImage(file, { format: 'png', maxBytes: 1 * 1024 * 1024, maxDims: <2× the pad's CSS size> })` from `lib/shared/image-reencode.ts` (Story 1.10), which scales it to fit the pad and steps it down until it is at most 1 MB, and the result is shown in the pad area in place of any drawing
**And** if the helper resolves `{ ok: false }` (it can't be brought to 1 MB or less, or can't be decoded), the pad shows "This image is too large. Choose a smaller one." *(draft copy)* and leaves the pad unchanged
**And** the upload control is reachable and operable by keyboard alone.

**Given** accessibility requirements
**When** a screen reader or keyboard user reaches the pad
**Then** the canvas has the accessible name "Draw your signature" and `aria-describedby` pointing at the help line plus a visually hidden instruction "Drawing needs a mouse, finger or pen. To add your signature with a keyboard, use Upload image instead." *(draft copy)*
**And** every control shows the focus ring, and an axe check passes for the Signature row.

**Given** I save the Section with a changed Signature
**When** `save()` runs
**Then** the steps run in fixed order: first the Story 2.2 `PUT /v2/user/edit` (only if other fields changed), then the Signature step
**And** a drawn pad is exported as PNG and passed through the same `reencodeImage(…, { format: 'png', maxBytes: 1 MB, … })` call, so every uploaded Signature is a PNG of at most 1 MB
**And** with no saved Signature and a non-empty pad, it uploads the PNG as multipart part `file` (filename `signature.png`) to `POST /api/1h/v2/health/type/Person/me/relation/PersonHasSignatureFile/file/upload` with no query params (the proxy forces `isPublic=false`; the client never sends `isPublic`)
**And** with a saved Signature and a new drawing or upload, it posts the PNG as multipart part `fileNewVersion` to `POST /api/1h/v2/file/{id}/version` with no query params (the proxy forces `current=true`)
**And** with a saved Signature and an empty pad, it calls `DELETE /api/1h/v2/file/{id}` with no query params (the proxy forces `hardDelete=true`; the client never sends `hardDelete`) only after the confirm below
**And** the uploaded body is PNG and at most 1 MB, so the proxy never returns 413 `TOO_LARGE` or 415 `UNSUPPORTED_MEDIA` for a valid pad. A unit test covers each branch.

**Given** the Signature endpoints
**When** this story is done
**Then** the proxy allowlist entries for these exact endpoints are added in this change (method + path template + allowed query; server-forced params), each with proxy tests:
- `POST /v2/health/type/Person/{personId}/relation/PersonHasSignatureFile/file/upload` — `{personId}` accepts only `me` (substituted from the session); no client query params allowed (any other → 400 `BAD_QUERY`); `isPublic=false` forced server-side (a client-sent `isPublic` is ignored); upload entry with `maxBytes` 1 MB (larger → 413 `TOO_LARGE`), exactly one part named `file`, PNG leading bytes only (JPEG, BMP, SVG or HTML → 415 `UNSUPPORTED_MEDIA`); *(built: spec F2)*
- `POST /v2/file/{id}/version` — `{id}` matching `^\d{1,19}$`; `current=true` forced server-side (client value ignored, no other query allowed); upload entry with `maxBytes` 1 MB, exactly one part named `fileNewVersion`, PNG leading bytes only; *(built: spec F2)*
- `DELETE /v2/file/{id}` — `hardDelete=true` forced server-side and any client-sent `hardDelete` ignored; this is the entry Story 1.10 added for picture replacement, reused unchanged, and a proxy test in this change asserts that `?hardDelete=false` from the client still reaches upstream as `hardDelete=true`
**And** a unit test asserts the client's Signature request URLs carry no `isPublic`, `current` or `hardDelete` param.

**Given** a saved Signature and an empty pad
**When** I press Save (on the Section or via Save all)
**Then** the shared `components/ui/confirm-dialog.tsx` (Story 1.11) opens in its destructive variant: title "Remove your signature?", body "Documents you sign will no longer carry it.", buttons "Cancel" (secondary, initial focus) and "Remove signature" (destructive, `bg-destructive-fill`, white text)
**And** "Remove signature" deletes the file, and the Section saves
**And** "Cancel" or Escape sends nothing for this Section, returns focus to the trigger, keeps the Section in edit with the pad empty, and resolves `save()` as `{ok:false, error:{code:"CANCELLED"}}` (Save all counts it as not saved and continues with the other Sections).

**Given** all steps succeed
**When** the save resolves
**Then** `["pp","myself"]` is mutated, the read view shows the new thumbnail (never the previous version) with "Added {date}" (or "Not provided" after removal), the toast "Personal information saved." appears, and focus moves to the Section `h2`.

**Given** the PUT succeeds but the Signature step fails
**When** the save resolves
**Then** `save()` returns `{ok:false}`, refetches `["pp","myself"]`, and rebases the form baseline so the saved fields are no longer dirty
**And** the Section stays in edit with the pad content kept and a Section-level error "Couldn't save your signature. Try again." *(draft copy)* with Retry
**And** Retry sends only the Signature step.

**Given** drafts
**When** the Section is dirty, the session expires, or a draft is restored
**Then** no Signature data (drawing, uploaded image, data URL or file id change) is ever written to a draft, and a test asserts this. After a draft restore the pad shows the saved Signature.

**Given** the deep link `?tab=contacts#signature` (UJ-3)
**When** the page loads and Personal information finishes loading (skeleton replaced)
**Then** the page is scrolled so the Signature row (`id="signature"`) is in view, re-scrolling once after data loads so the skeleton-to-content height change doesn't leave it off screen (no smooth scroll under reduced motion)
**And** a Playwright test against the mocked proxy covers UJ-3: deep link → Edit → draw → Save → toast → thumbnail with "Added {today}", plus the Clear → Save → "Remove your signature?" → Cancel and confirm branches.

**Covers:** FR14, NFR1, NFR2, AD-2, AD-7, AD-12, AD-13, AD-17 (as superseded by D5: 415 JSON check only), AD-18, RC7, RC11 · UX-DR4, UX-DR36, UX-DR47, UX-DR58, UX-DR61, UX-DR64, UX-DR65, UX-DR68 · **Jira:** NG-9022

## Epic 3: Contact methods — Phone, Email and Social Media

Users keep every way to reach them current, verify numbers and emails, switch their primary (sign-in) contact safely, and manage social links. These share the Contact Point engine (AD-9).

**Depends on:** Epic 1 only (session + `/api/1h` proxy with the `GET /v2/user/contact-point/list` entry, `fetchContactPoints` and the per-type header SWR keys `contactPoints("Mobile")`, `contactPoints("Landline")` and `contactPoints("Email")` from Story 1.9 (shared with the `/account` pickers, AD-10), `callApi` + `ApiResponse.errorCode`, page shell + `#phone`/`#email`/`#social` anchors and index, `SectionRegistry`/`useRegisterSection`, Section edit model, `lib/shared/messages.ts`, `lib/api/errors.ts`, aria-disabled + Tooltip pattern, draft row removal (strikethrough + Restore), `components/ui/confirm-dialog.tsx` (Story 1.11), toasts (Story 1.12), Save all with `SAVE_ORDER` email → phone → social, drafts). Each Epic 3 story adds the Contact Point allowlist entries it uses: Story 3.1 `GET /v2/type/key/ContactPoint` (and reuses the list entry), Story 3.2 `POST /v2/health/contact-point`, Story 3.3 `POST /v2/health/contact-point/verify`. Stories in this epic depend only on earlier stories in this epic.

**Copy rule for every story:** every user-facing string is a key in `lib/shared/messages.ts`. Strings quoted from EXPERIENCE.md Voice and Tone are verbatim. Strings marked *(draft copy)* are not in EXPERIENCE.md and are flagged in `messages.ts` with a `// draft copy: PM review` comment (UX-DR68).

---

### Story 3.1: Contact Point engine and Phone read view

*Amended 2026-10-13 (architecture update: AD-10; PA3).*
*Foundation 2026-10-14: built in spec 7.0b-2 — `lib/api/contact-points.ts` (`fetchContactPoints`, `toContactPoints`, `findPrimary`, `ContactPoint`, `PRIMARY_LABEL`), `keys.contactPoints(type)`, the `contact-point/list` allowlist entry (7.0a). Use it; do not rebuild. Remaining for this story: Social Media in the entry and `mutateContactPoints` (F1), the Contact Point write engine and Phone Section (Team A), Section frame/edit kit (F3).*
*Foundation 2026-10-14: built in spec F1 — `ContactPointType = "Email"|"Mobile"|"Landline"|"Social Media"`, `CONTACT_POINT_TYPES`, `isContactPointType`, `keys.contactPoints("Social Media")` (the Social key is `["pp","contact-points","Social Media"]`, not `"Social"`), `keys.typeKey("ContactPoint")` (declared), `mutateContactPoints(...types)`, `primaryPhoneRegion(rows, myself)`, `Social Media` in the `contact-point/list` entry (`contacts.test.ts`), `lib/shared/phone.ts` (`formatPhoneDisplay(value, region)`, `normalizeRegion`, `DEFAULT_PHONE_REGION`; US `+1 (415) 551-2125`, else international; already used by the header), the duplicate-value rows in `lib/api/errors/contacts.ts` (scopes `phone|email|social` → `field "value"` with `contacts.duplicatePhone|duplicateEmail|duplicateSocial`). Use it; do not rebuild. Remaining for this story: the `GET v2/type/key/ContactPoint` entry and the one `type-key` loader (shared with Story 2.1; whichever lands first adds it), `diffToManageDTO` and the write engine, the Phone Section (Team A), F3 kit. Area files (edit only these, never the `index.ts` aggregators): allowlist `lib/server/proxy/allowlist/contacts.ts`, copy `lib/shared/messages/contacts.ts`, errors `lib/api/errors/contacts.ts`.*
*Foundation 2026-10-14: built in spec F3-1 — `StatusBadge({ status: "verified" | "notVerified", children })` (`components/ui/status-badge.tsx`: icon + the word passed as children, never color alone; Home rows render no badge), `LoadError` on `InlineBanner` for "Couldn't load phones · Retry". Callers of `LoadError`/`ReadStateFor` pass `attempt` (failure count) so a repeated failure is re-announced. Use it; do not rebuild. Remaining for this story: unchanged (Team A engine and Section; F3-2 edit kit, F3-3 `StateFrame`).*
*Foundation 2026-10-14: built in spec F3-3 (+ F3-2) — `StateFrame` (`skeleton="table"`, `columns={SECTION_COLUMNS.phone}`, `loadError: { kind: "section", sectionId: "phone" }` → "Couldn't load phones", `level="section"`, `onRetry` revalidating only `contactPoints("Mobile")` + `("Landline")`, `attempt`, `onReady`), `forbiddenScopeFor(path, "profile")` (a 403 on `contact-point/list?type=Mobile|Landline` → owner `phone`, Section-level `NoAccess`), `SectionLandmark`, `SectionHeader` `count`, `useReportSectionCount("phone", n)` for the menu count; F3-2 `SectionContainer`. Use it; do not rebuild. Remaining for this story: Team A engine and Phone read Section (replacing the placeholder in `features/shell/contacts-panel.tsx`).*

As a patient or provider,
I want to see all my phone numbers with their label, type, verification and notification status, with my primary number first,
So that I can check at a glance how 1health reaches me and which number I sign in with.

**Acceptance Criteria:**

**Given** the Contact Point API module `lib/api/contact-points.ts` and its `fetchContactPoints(type)` from Story 1.9
**When** the Contact Point Sections read their lists
**Then** Phone composes `fetchContactPoints("Mobile")` and `fetchContactPoints("Landline")` (two per-type reads merged in the Section, primary first), Email uses `fetchContactPoints("Email")` and Social `fetchContactPoints("Social Media")`, each one `callApi` `GET /api/1h/v2/user/contact-point/list?type=<type>`, returning typed rows `{id, value, type, label, isVerified, isNotificationEnabled, phoneNumberRegion}` with `id` as a number
**And** SWR keys come only from `lib/api/keys.ts`: Phone reads exactly the Story 1.9 per-type keys `contactPoints("Mobile")` + `contactPoints("Landline")` and Email reads `contactPoints("Email")` (there is no combined `["pp","contact-points","Phone"]` key); these keys are shared with the profile header and the `/account` Account settings pickers through the one root SWR cache, so every later `mutate` after a Contacts save or Primary change refreshes both, and an `/account` save refreshes the Contacts lists (AD-10, PA3); this story adds `keys.contactPoints("Social")` = `["pp","contact-points","Social"]`; all use the shared `callApi` fetcher (AD-10) *(F1: built as `keys.contactPoints("Social Media")` = `["pp","contact-points","Social Media"]`)*
**And** the proxy allowlist entries this story relies on are `GET /v2/user/contact-point/list` (the Story 1.9 entry, `type` allowlisted to `Mobile|Landline|Email|Social Media`, reused unchanged and covered by a proxy test here) and `GET /v2/type/key/ContactPoint`, which is added in this change (method + path template + allowed query: no query params, no body, no server-forced params) with a proxy test (AD-2); this story adds no POST entry

**Given** a `before` list and an edited `after` list of rows
**When** `diffToManageDTO(before, after)` runs
**Then** rows without an `id` go to `contactPointsToAdd` as `{value, type, label, isNotificationEnabled, phoneNumberRegion?}`
**And** ids present in `before` but marked removed or absent in `after` go to `contactPointsToRemove` as numbers
**And** saved rows whose `label` or `isNotificationEnabled` changed go to `contactPointsToUpdate` with their `id`; unchanged rows are not sent
**And** a saved row whose `value` or `type` changed throws a programmer error (values and types are immutable for Phone and Email; Story 3.7 adds Social's replace mode)
**And** an empty diff returns `null` so the caller sends no request

**Given** `after` makes a different saved row Primary than `before`
**When** `diffToManageDTO` runs
**Then** `contactPointsToUpdate` contains both the new Primary (`label: "Primary"`, `isNotificationEnabled: true`) and the previous Primary relabeled `label: "Old"` (other fields unchanged), in the same DTO (AD-9)
**And** the DTO never contains two rows labeled Primary of the same Contact Type, and never puts a Primary label in `contactPointsToAdd` (unit-tested)

**Given** the list before a save and the refetched list after it
**When** `newUnverified(before, after)` runs
**Then** it returns ids that are in `after` but not in `before`, have `isVerified === false`, `type` `Mobile` or `Email`, and `label !== "Home"`
**And** Landline and Social Media rows are never returned (unit-tested)

**Given** `lib/shared/contact-labels.ts`
**When** the label list is built
**Then** it is the backend enum `Primary, Home, Main, Old, Personal, Mailing List, Work` intersected with the `label` attribute values of `GET /v2/type/key/ContactPoint`, minus "Partnership Organization", in backend-enum order (AD-9, NFR10)
**And** values from the type metadata that are not in the backend enum (e.g. "Main Work", "Other Work", "Vacation Home") are dropped, so no request can carry a label that returns `INVALID_ENUM_VALUE`
**And** if `/type/key/ContactPoint` fails, the backend enum (minus Partnership Organization) is used so the Section still works
**And** this is the only place Contact Labels are defined (Phone, Email and Social import it)

**Given** the Contacts tab loads
**When** the Phone Section (`features/phone`, `h2` "Phone", anchor `#phone`) fetches
**Then** it shows its own 3-row skeleton inside the real table container with real column headers while loading, without blocking other Sections (NFR4, UX-DR34)
**And** the loaded table is a real `<table>` with `th` columns Number · Label · Type · Status · Notifications · actions
**And** the Primary phone is the first row; other rows keep the API order
**And** the Section header shows the count of saved phones, and the desktop index item "02 Phone" shows the same count

**Given** a loaded phone row
**When** it renders in read view
**Then** Number shows the country flag (decorative, `aria-hidden`) followed by the number in `cell-number` type; US numbers render as `+1 (415) 551-2125`, other countries in libphonenumber-js international format, using `phoneNumberRegion` when present, through the shared `formatPhoneDisplay(value, region)` in `lib/shared/` (created here unless Story 7.4 already did)
**And** Label shows the Contact Label as a muted square chip, except Primary, which is the filled primary chip
**And** Type shows "Mobile" or "Landline"
**And** Status shows "Verified" (check-circle icon, success-strong) or "Not verified" (alert-circle icon, warning-strong), icon + word, never color alone; Home-labeled rows show an empty Status cell
**And** Notifications shows "On" (foreground) or "Off" (muted) for the Primary row only; every other row shows "—" (RC3)

**Given** a row in read view on desktop
**When** the user hovers it or focuses inside it
**Then** inline row actions fade in (no fade under reduced motion) and a 44×44 kebab is always visible with accessible name "More actions for {formatted number}" (UX-DR26, UX-DR62, UX-DR64)
**And** the kebab opens a row menu that takes its items from a per-row action list; Stories 3.2–3.4 add Edit, Remove, Verify / Resend verification and Make primary to it, and the menu never shows an item with no handler

**Given** a viewport under 768 px down to 360 px
**When** the Phone Section renders
**Then** each row is a stacked card inside the same container: line 1 number + status, line 2 label chip + type + notifications (muted), kebab on the right, vertically centered; tapping the card body does nothing
**And** there is no horizontal scroll at 360 px (automated check) (UX-DR49, UX-DR67)

**Given** the user has no phones
**When** the Section loads
**Then** a single row spanning all columns reads "No phones yet · Add phone", where "Add phone" is a `link-text` action (it opens edit mode with one new row once Story 3.2 lands)

**Given** the list request fails (network, 5xx, or unknown error code)
**When** the Section renders
**Then** an inline error banner replaces the rows: "Couldn't load phones · Retry"; Retry re-fetches only the Phone keys (`Mobile` and `Landline`)
**And** Email, Social media and every other Section load and work normally (NFR5)
**And** a `SESSION_EXPIRED` result (there is no `SESSION_CHANGED`, D5) is left to the Epic 1 session-events handler (no Section-level banner)

**Given** the engine and Phone read view
**When** CI runs
**Then** Vitest covers `diffToManageDTO` (add, update label, update notifications, remove, Primary switch, empty diff, immutable-value guard), `newUnverified` (Home, Landline, Social, already-verified, pre-existing), the label intersection, and the read view (Primary first, "—" on non-Primary notifications, no status on Home, empty and error states) with MSW at the `/api` boundary

**Covers:** FR15, AD-2, AD-9, AD-10 (per-type keys shared with `/account`), AD-19, PA3, NFR4, NFR5, NFR10, UX-DR7, UX-DR8, UX-DR21, UX-DR25, UX-DR26, UX-DR30, UX-DR33, UX-DR34, UX-DR35, UX-DR49, UX-DR62, UX-DR64, UX-DR67 · **Jira:** NG-9023

---

### Story 3.2: Add, relabel and remove phones

*Amended 2026-10-13 (architecture update: AD-10; PA3).*
*Foundation 2026-10-14: built in spec F1 — the duplicate rows (`Messages.PERSON_ALREADY_HAS_CONTACT_POINT_ERROR`, `CONTACT_POINTS_DUPLICATE_FOUND`) → `mapApiError("phone", …)` = `field "value"` / `contacts.duplicatePhone` ("This number is already on your profile"), `mutateContactPoints("Mobile","Landline")` + `mutateMyself()`, `formatPhoneDisplay`, `normalizeRegion`, zod-literal lint. Use it; do not rebuild. Remaining for this story: everything else (Team A): phone input, `phoneSchema`, the `POST v2/health/contact-point` entry, limit and Primary-rule rows. Area files (edit only these, never the `index.ts` aggregators): allowlist `lib/server/proxy/allowlist/contacts.ts`, copy `lib/shared/messages/contacts.ts`, errors `lib/api/errors/contacts.ts`.*
*Foundation 2026-10-14: built in spec F3-1 — `InputLocked({ value, help })` for the saved Number and Type (and the locked Primary chip value), `DisabledAction({ reason })` for the last-phone Remove ("You need at least one phone") and "Add phone"/"Add row" at the limit ("You've reached the limit of 20 phones"), `FormField`/`FieldError` + `Input`, `Select` for Label and Type, `Button` `busy` via the F3-2 footer, `toastSuccess("Phone saved.")`. Use it; do not rebuild. Remaining for this story: unchanged (Team A phone input, `phoneSchema`, entries, rows and `RowRemoval`; F3-2 kit).*
*Foundation 2026-10-14: built in spec F3-2 — `useSectionForm` (`id: "phone"`, label "Phone" → default toast "Phone saved.", `cancelFocus: "heading"`, `onNoChanges: "close"`, `errorFields` for row fields, `fieldOrder` for list paths), `SectionFooter` `addRow: { label, onClick, disabledReason }` ("You've reached the limit of 20 phones"), `runSaveSteps(steps, { scope: "phone", mode: "stop", refetch, rebase })` (first failure skips the rest, refetch + rebase so Retry sends only the remaining diff), `field(name)` read-only while saving; `CONTACT_MESSAGES.phoneTenDigits` ("Enter a 10-digit US number") already in the catalog. Use it; do not rebuild. Remaining for this story: unchanged (Team A phone input, `phoneSchema`, entries, rows, `RowRemoval`).*

As a patient or provider,
I want to add new phone numbers, change their labels and remove old ones in one edit of the Phone table,
So that my phone list stays current without calling support.

**Acceptance Criteria:**

**Given** the Phone Section in read view
**When** the user activates "Edit" in the Section header
**Then** the whole table enters edit mode (container gets the primary border + accent halo, header shows "Editing"), inputs appear in every editable cell, and a `tfoot` shows "Unsaved changes" (only after the first change) left and "Add row", "Cancel", "Save" right
**And** activating "Add phone" (header) or the empty-state "Add phone" enters edit mode with one new empty row whose first control is focused
**And** a row's "Edit" from the read-view kebab opens edit mode with focus on that row's first editable control
**And** the Phone Section registers with `useRegisterSection({id: "phone", label: "Phone", displayOrder: 2, form, validate, save, discard, draftFields})`, so it counts in "Save all (N)", arms the leave guard and is drafted by the Epic 1 registry (AD-7)

**Given** a saved row in edit mode
**When** it renders
**Then** Number and Type render as locked inputs (muted fill, lock icon) with help line "Saved numbers can't be changed. Remove it and add a new one." *(draft copy, mirrors the locked-email string)*
**And** Label is a select of the `contact-labels.ts` list without "Primary"; a row whose label is Primary shows the Primary chip as a locked value (Primary changes only via Make primary, Story 3.4)

**Given** a new row
**When** the user fills it
**Then** Number uses the phone input: a country picker rendered as a leading flag + dial-code segment inside the input (libphonenumber-js + custom picker, default United States), 44 px, 16 px text
**And** the field shows inline help "Include the area code. Mobile numbers get a verification link by text after you save." *(draft copy)*, linked via `aria-describedby`
**And** Label is a required select from the `contact-labels.ts` list without "Primary"
**And** Type is a required choice Mobile / Landline with no preselected value
**And** the row status cell shows "New · not saved"

**Given** a new row with invalid input
**When** the field blurs or the user activates Save (or Save all)
**Then** a US number that is not exactly 10 national digits shows "Enter a 10-digit US number"
**And** a non-US number that libphonenumber-js reports invalid for the chosen country shows "Enter a valid phone number" *(draft copy)*
**And** a number equal (compared as E.164) to any other row in the table — saved, struck through, or new — shows "This number is already on your profile"
**And** an empty Label shows "Choose a label" and an empty Type shows "Choose Mobile or Landline" *(draft copy)*
**And** each error uses the 2 px error border + error-strong help line with alert icon, `aria-invalid="true"` and `aria-describedby`; nothing is sent while any error remains and focus moves to the first invalid field (FR4, UX-DR29)

**Given** the user removes rows in edit mode
**When** they activate Remove on a saved row (row kebab or inline action)
**Then** the row is struck through and muted, its status reads "Removed on save" and the action becomes "Restore"; no toast, no confirm, nothing is deleted until Save (UX-DR54)
**And** Remove on a new unsaved row deletes the row outright
**And** "Remove" from the read-view kebab switches the Section to edit mode with that row already struck through + "Restore"
**And** when exactly one non-removed phone would remain, its Remove is aria-disabled (focusable, activation is a no-op) with tooltip "You need at least one phone" on hover, focus and tap
**And** Remove on the Primary row is handled by Story 3.4 (until then the backend rejection is mapped as below)

**Given** the user already has 20 Mobile or 20 Landline phones (Contact Type limit is per type)
**When** both types are at 20 (counting saved non-removed + new rows)
**Then** "Add phone" and "Add row" are aria-disabled with tooltip "You've reached the limit of 20 phones"
**And** when only one type is at 20, a new row's Type option for that type is disabled and choosing it is blocked with "You've reached the limit of 20 phones" at the field

**Given** the endpoint this story writes
**When** it is done
**Then** the proxy allowlist entry for `POST /v2/health/contact-point` is added in this change (method + path template + allowed query; server-forced params): no query params allowed, JSON body (`ContactPointManageDTO`) only (`Content-Type` other than `application/json` → 415 `UNSUPPORTED_MEDIA`), no CSRF or `X-PP-Session` check (D5), no server-forced params; a proxy test covers it (AD-2).

**Given** valid edits
**When** the user activates Save (or Save all reaches Phone)
**Then** `save()` builds the DTO with `diffToManageDTO`, sending new numbers as E.164 `value` with `phoneNumberRegion` = the picked country's ISO code and `type` `Mobile` or `Landline`, in exactly one `POST /api/1h/v2/health/contact-point`
**And** while saving, Save shows a spinner + "Saving…", inputs are read-only, Cancel is disabled, other Sections stay usable
**And** on success the Section mutates its Phone keys `contactPoints("Mobile")` and `contactPoints("Landline")` (and `["pp","myself"]`), which also refreshes the header and the `/account` phone picker (AD-10), returns to read view, shows toast "Phone saved.", moves focus to the Phone `h2`, clears its draft, and `save()` resolves `{ok: true}`
**And** `save()` never throws; on failure it resolves `{ok: false, error}`

**Given** the platform rejects the save
**When** the response has a known `errorCode` (duplicate, limit, `INVALID_ENUM_VALUE`, Primary rules)
**Then** `lib/api/errors.ts` maps it to a `messages.ts` key shown next to the field when the row can be identified, else at Section level; the Section stays in edit with the user's input
**And** an unknown code shows a generic Section error with "Retry"
**And** a network failure shows "Couldn't save phone. Check your connection." with "Retry" (FR7)

**Given** the Section is in edit mode
**When** the user activates Cancel
**Then** only the Phone Section reverts to read view without a confirm and its draft is deleted; other dirty Sections are untouched
**And** Escape inside the table does not cancel and Enter in an input does not submit (UX-DR57)

**Given** a viewport under 768 px
**When** the Section is in edit mode
**Then** each stacked card holds its inputs stacked full width in place (no bottom sheet) and all controls are at least 44×44 px

**Given** the story is done
**When** CI runs
**Then** tests cover `phoneSchema` (US 10 digits, invalid non-US, duplicate incl. struck rows, required label/type), last-phone Remove disabled, per-type limit, Restore, one POST with the right DTO, error mapping, network Retry, and `{ok:false}` without throwing

**Covers:** FR16, FR4, FR7, AD-2, AD-7, AD-9, AD-10 (per-type keys), AD-11, PA3, NFR2, UX-DR20, UX-DR22, UX-DR26, UX-DR27, UX-DR28, UX-DR29, UX-DR30, UX-DR49, UX-DR54, UX-DR55, UX-DR56, UX-DR57, UX-DR61 · **Jira:** NG-9023

---

### Story 3.3: Verify phones

*Foundation 2026-10-14: built in spec F1 — `mutateContactPoints(...types)`, `formatPhoneDisplay`. Use it; do not rebuild. Remaining for this story: everything else (Team A); the `contact-point/verify` entry goes in `allowlist/contacts.ts`. Area files (edit only these, never the `index.ts` aggregators): allowlist `lib/server/proxy/allowlist/contacts.ts`, copy `lib/shared/messages/contacts.ts`, errors `lib/api/errors/contacts.ts`.*
*Foundation 2026-10-14: built in spec F3-1 — `StatusBadge status="pending"` for "Link sent · Resend in {n} s" (muted, no icon), `DisabledAction` for an inline "Resend verification" during the countdown (a kebab menu item follows the same `aria-disabled` + Tooltip + `aria-describedby` pattern), `toastError(text, { onRetry })` for "Couldn't send the link. Check your connection.", `toastSuccess("Phone saved.")`. Use it; do not rebuild. Remaining for this story: unchanged (Team A).*
*Foundation 2026-10-14: built in spec F3-2 — Save all and the leave guard await each Section `save()` fully, so the auto-verify belongs inside the Phone `save()` after `runSaveSteps` succeeds, with its result ignored for the `SaveResult` (the save still resolves `{ ok: true }`). Use it; do not rebuild. Remaining for this story: unchanged (Team A).*

As a patient or provider,
I want new mobile numbers to get a verification link automatically and to resend it when needed,
So that my numbers become Verified and can be used for sign-in and notifications.

**Acceptance Criteria:**

**Given** `verifyContactPoints(ids)` added to `lib/api/contact-points.ts` in this story
**When** it is called
**Then** it sends `POST /api/1h/v2/health/contact-point/verify` `{contactPointIds: ids}` through `callApi` and returns `ApiResponse<{success, contactPointIdsWithSendError: number[]}>`; it sends nothing for an empty list
**And** the proxy allowlist entry for `POST /v2/health/contact-point/verify` is added in this change (method + path template + allowed query; server-forced params): no query params allowed, JSON body `{contactPointIds: number[]}` only (`Content-Type` other than `application/json` → 415 `UNSUPPORTED_MEDIA`), no CSRF or `X-PP-Session` check (D5), no server-forced params; a proxy test covers it (AD-2).

**Given** the Phone Section saved successfully (its own Save or as part of Save all)
**When** the Section refetches its list
**Then** `save()` calls `newUnverified(before, after)` and, if it returns ids, one `verifyContactPoints(ids)` before resolving (AD-8: auto-verify runs right after this Section's own successful save)
**And** only new unverified Mobile rows whose label isn't Home are sent; Landlines and Home-labeled rows are never sent
**And** the save still resolves `{ok: true}` and toast "Phone saved." shows even if the verify call fails

**Given** auto-verify or a manual Verify sent a link successfully for a row
**When** the row renders
**Then** its Status shows "Link sent · Resend in 60 s" in muted pending style, counting down each second, then switches to "Not verified" with the "Resend verification" action available
**And** a polite live region announces "Link sent" once (not every second)
**And** the countdown lives in component state only; a reload shows the row as "Not verified" with "Verify"

**Given** the verify response lists ids in `contactPointIdsWithSendError`, or the verify request fails entirely
**When** the rows render
**Then** each affected row shows "Not verified" with help "Couldn't send the link" *(draft copy)* and "Resend verification" is available immediately (no countdown)
**And** rows not in the list get the 60 s countdown

**Given** a saved, unverified Mobile row whose label isn't Home (including an unverified Primary)
**When** it shows in read view
**Then** "Verify" appears as an inline row action (desktop hover/focus) and in the kebab; after a send in this session the action reads "Resend verification"
**And** activating it sends `verifyContactPoints([id])` without a confirm and without entering edit mode
**And** during the 60 s countdown the kebab's "Resend verification" is aria-disabled with tooltip "Link sent · Resend in {n} s"
**And** Verified rows, Landlines and Home-labeled rows show no Verify action

**Given** a manual Verify fails with a network error
**When** the response arrives
**Then** an error toast "Couldn't send the link. Check your connection." *(draft copy)* with "Retry" persists until dismissed; the row stays "Not verified"

**Given** the user verified a number from the SMS link and returns to the app tab
**When** the window regains focus
**Then** the Phone key revalidates (SWR revalidate on focus, which does not count as user activity per RC6) and the row shows "Verified" with no Verify action
**And** revalidation while the Section is in edit mode does not overwrite the user's edits

**Given** the story is done
**When** CI runs
**Then** tests cover auto-verify only after a successful save, Home/Landline exclusion, `contactPointIdsWithSendError` rows, verify failure not failing the save, countdown to "Resend verification" (fake timers), and badge update on refetch

**Covers:** FR17, AD-2, AD-8, AD-9, UX-DR25, UX-DR27, UX-DR28, UX-DR44, UX-DR53, UX-DR63 · **Jira:** NG-9023

---

### Story 3.4: Make a phone primary and manage notifications

*Amended 2026-10-13 (architecture update: AD-10; PA3).*
*Foundation 2026-10-14: built in spec 7.0b-1 — `ConfirmDialog` (standard variant) for "This changes how you sign in"; `keys.contactPoints` (7.0b-2). Use it; do not rebuild. Remaining for this story: everything else (Team A).*
*Foundation 2026-10-14: built in spec F1 — `mutateContactPoints("Mobile","Landline")` + `mutateMyself()` (refresh the header and the `/account` phone picker), `formatPhoneDisplay` for row names. Use it; do not rebuild. Remaining for this story: unchanged (Team A); Primary-rule rows go in `lib/api/errors/contacts.ts`. Area files (edit only these, never the `index.ts` aggregators): allowlist `lib/server/proxy/allowlist/contacts.ts`, copy `lib/shared/messages/contacts.ts`, errors `lib/api/errors/contacts.ts`.*
*Foundation 2026-10-14: built in spec F3-1 — `DisabledAction({ reason })` for "Make primary" (each eligibility reason) and Remove ("Make another phone primary first"), `ConfirmDialog` (busy confirm), `toastError(text, { onRetry })` for the mapped or generic failure, `toastSuccess`. Use it; do not rebuild. Remaining for this story: unchanged (Team A).*
*Foundation 2026-10-14: built in spec F3-2 — nothing new beyond the Phone Section's `useSectionForm`: Make primary is an immediate action outside edit view; after it the Phone keys refetch and an open edit view rebases through the new `baseline`, keeping the user's edits. Use it; do not rebuild. Remaining for this story: unchanged (Team A).*

As a patient or provider,
I want to make a verified mobile my primary phone with a clear warning, and turn its notifications on or off,
So that I can switch my sign-in number safely and control how 1health contacts me.

**Acceptance Criteria:**

**Given** a saved, Verified Mobile row that isn't Primary
**When** it shows in read view
**Then** "Make primary" is an inline row action (desktop) and a kebab item, and acts from read view without entering edit mode
**And** the Section shows the footnote "Changing your primary phone changes how you sign in." below the table

**Given** no phone is Verified **and** no phone is Primary (RC2)
**When** a saved unverified Mobile row renders
**Then** its "Make primary" is enabled

**Given** a row that can't be made Primary
**When** it renders
**Then** "Make primary" stays visible and focusable with `aria-disabled="true"`, activation does nothing, and a tooltip (hover, focus, tap; closes on Escape, blur, tap outside) gives the reason:
- Landline: "Landlines can't be primary"
- unverified Mobile (outside the RC2 exception): "Verify this number first", with Verify (Story 3.3) next to it
- unverified Home-labeled Mobile (can't be verified while labeled Home): "Change the label from Home, then verify this number" *(draft copy)*
**And** new unsaved rows never offer Primary (Label select excludes it, Story 3.2)

**Given** an eligible row
**When** the user activates "Make primary"
**Then** the shared `components/ui/confirm-dialog.tsx` (Story 1.11, standard variant) opens with focus on Cancel: title "This changes how you sign in", body "{formatted number} becomes your primary phone and sign-in number. Your current primary is relabeled Old.", buttons "Cancel" / "Make primary"
**And** when there is no current Primary (RC2 case), the second sentence is omitted *(draft copy variant)*
**And** Escape or Cancel closes with no request and focus returns to the trigger

**Given** the user confirms
**When** the change saves
**Then** exactly one `POST /api/1h/v2/health/contact-point` is sent whose `contactPointsToUpdate` holds the new Primary (`label "Primary"`, `isNotificationEnabled true`) and the previous Primary (`label "Old"`) (AD-9)
**And** on success the Phone keys `contactPoints("Mobile")` and `contactPoints("Landline")` and `["pp","myself"]` are mutated (refreshing the header and the `/account` phone picker), the new Primary moves to the first row with the Primary chip and Notifications "On", the old row reads "Old", toast "Phone saved." shows, and focus returns to the Phone `h2`
**And** the profile header's primary phone (desktop) shows the new number
**And** on failure the read view is unchanged, the mapped error (or the generic error) shows as an error toast with "Retry", and no partial change is shown
**And** Make primary is not offered while the Phone Section is in edit mode

**Given** the Primary phone
**When** the user tries to remove it (read-view kebab or edit mode)
**Then** Remove is aria-disabled with tooltip "Make another phone primary first"
**And** an existing unverified Primary keeps its Primary chip, sorts first, shows "Not verified" and offers Verify (FR18)

**Given** the Phone Section in edit mode
**When** the Primary row renders
**Then** its Notifications cell is a switch with accessible name "Notifications for {formatted number}", reflecting `isNotificationEnabled`
**And** every non-Primary row shows "—" and no control (RC3)
**And** toggling marks the Section dirty and saving sends only that row in `contactPointsToUpdate`; read view then shows "On" or "Off"

**Given** the story is done
**When** CI runs
**Then** tests cover eligibility (Verified Mobile, RC2 exception, Landline, unverified, Home, new row), each tooltip reason, the confirm copy and focus, the single-request DTO with old relabeled Old and notifications On, Primary Remove disabled, and the Primary-only notification switch

**Covers:** FR18, FR19, AD-9, AD-10 (per-type keys), PA3, UX-DR25, UX-DR27, UX-DR28, UX-DR36, UX-DR44, UX-DR52, UX-DR55, UX-DR61 · **Jira:** NG-9023

---

### Story 3.5: View, add, relabel and remove emails

*Amended 2026-10-13 (architecture update: AD-10; PA3).*
*Foundation 2026-10-14: built in spec F1 — `mutateContactPoints("Email")` + `mutateMyself()`, the duplicate rows → `mapApiError("email", …)` = `field "value"` / `contacts.duplicateEmail` (DRAFT COPY), zod-literal lint. Use it; do not rebuild. Remaining for this story: everything else (Team A). Area files (edit only these, never the `index.ts` aggregators): allowlist `lib/server/proxy/allowlist/contacts.ts`, copy `lib/shared/messages/contacts.ts`, errors `lib/api/errors/contacts.ts`.*
*Foundation 2026-10-14: built in spec F3-1 — `InputLocked({ value, help })` for saved addresses ("Locked. This is the address you sign in with." on the Primary row, the other help elsewhere), `StatusBadge` `verified`/`notVerified`, `DisabledAction({ reason })` for the last-email Remove and Add at 20, `FormField`/`FieldError` + `Input`, `Select` for Label, `toastSuccess`. Use it; do not rebuild. Remaining for this story: unchanged (Team A).*
*Foundation 2026-10-14: built in spec F3-2 / F3-3 — `StateFrame` (`columns={SECTION_COLUMNS.email}`, `loadError: { kind: "section", sectionId: "email" }` → "Couldn't load emails", `onRetry` revalidating only `contactPoints("Email")`), `forbiddenScopeFor(path, "profile")` (`type=Email` → owner `email`, Section-level `NoAccess`), `useReportSectionCount("email", n)`, `useSectionForm` (`id: "email"`, default toast "Email saved.", `cancelFocus: "heading"`, `onNoChanges: "close"`, `errorFields` for the duplicate row), `runSaveSteps(steps, { scope: "email", mode: "stop", refetch, rebase })`, `SectionFooter` `addRow`. Use it; do not rebuild. Remaining for this story: unchanged (Team A).*

As a patient or provider,
I want to see my email addresses and add, relabel or remove them in one edit of the Email table,
So that my emails on file are current.

**Acceptance Criteria:**

**Given** the Contacts tab loads
**When** the Email Section (`features/email`, `h2` "Email", anchor `#email`) fetches `fetchContactPoints("Email")` under the Story 1.9 per-type key `contactPoints("Email")` = `["pp","contact-points","Email"]`, shared with the header and the `/account` email picker
**Then** it shows its own 3-row skeleton, then a real table with columns Email address · Label · Status · Notifications · actions, Primary first
**And** Label uses the label/Primary chips, Status shows "Verified" or "Not verified" (icon + word) and nothing for Home-labeled rows, Notifications shows "On"/"Off" for the Primary only and "—" elsewhere (RC3)
**And** the header and index item "03 Email" show the saved count; the kebab is named "More actions for {email}"
**And** under 768 px rows become stacked cards (line 1 email + status, line 2 label chip + notifications) with no horizontal scroll at 360 px; long addresses wrap or ellipsize without overflow
**And** with no emails the row reads "No emails yet · Add email" *(draft copy, follows the phone pattern)*; a failed load shows "Couldn't load emails · Retry" that reloads only Email (NFR5)

**Given** the Email Section
**When** it mounts
**Then** it registers with `useRegisterSection({id: "email", label: "Email", displayOrder: 3, …})` and uses Section header "Edit" / "Add email", the same whole-table edit, Cancel, Save, "Unsaved changes" and draft behavior as Phone (Story 3.2)

**Given** a saved row in edit mode
**When** it renders
**Then** the address is a locked input with help "Locked. This is the address you sign in with." on the Primary row and "Saved addresses can't be changed. Remove it and add a new one." on every other row
**And** Label is a select from `contact-labels.ts` without "Primary"; the Primary row's label is locked

**Given** a new row
**When** the field blurs or the user saves
**Then** an invalid address (zod email, trimmed) shows "Enter a valid email address"
**And** an address equal, case-insensitively, to any other row (saved, struck through or new) shows "This email is already on your profile" *(draft copy)*
**And** an empty Label shows "Choose a label" *(draft copy)*
**And** the row status reads "New · not saved"; nothing is sent while any error remains and focus goes to the first invalid field

**Given** Remove in edit mode or from the read-view kebab
**When** the user activates it
**Then** saved rows strike through with "Removed on save" + "Restore"; new rows disappear
**And** when exactly one non-removed email would remain, its Remove is aria-disabled with tooltip "You need at least one email"
**And** with 20 emails (saved non-removed + new), "Add email" and "Add row" are aria-disabled with tooltip "You've reached the limit of 20 emails"

**Given** valid edits
**When** the user saves (or Save all reaches Email, which runs before Phone per `SAVE_ORDER`)
**Then** one `POST /api/1h/v2/health/contact-point` is sent with `type: "Email"` adds, label updates and removals from `diffToManageDTO`
**And** on success: Email key `contactPoints("Email")` and `["pp","myself"]` mutated (the header's primary email and the `/account` email picker refresh), read view, toast "Email saved.", focus to the Email `h2`, draft cleared, `{ok: true}`
**And** known `errorCode`s map via `lib/api/errors.ts` to the field or Section; unknown → generic Section error with "Retry"; network → "Couldn't save email. Check your connection." + "Retry"; `save()` never throws

**Given** the story is done
**When** CI runs
**Then** tests cover `emailSchema` (invalid, case-insensitive duplicate incl. struck rows), locked-row copy for Primary vs others, last-email Remove disabled, limit 20, Home rows without status, "—" notifications on non-Primary, and the save DTO

**Covers:** FR20, FR4, FR7, AD-7, AD-9, AD-10 (per-type key shared with `/account`), AD-11, PA3, NFR5, UX-DR21, UX-DR22, UX-DR25, UX-DR26, UX-DR28, UX-DR29, UX-DR33, UX-DR34, UX-DR35, UX-DR49, UX-DR54, UX-DR55, UX-DR56, UX-DR67 · **Jira:** NG-9024

---

### Story 3.6: Verify emails, make an email primary and manage notifications

*Foundation 2026-10-14: built in spec 7.0b-1 — `ConfirmDialog` (standard variant) for the primary-email confirm; `keys.contactPoints("Email")` (7.0b-2). Use it; do not rebuild. Remaining for this story: everything else (Team A).*
*Foundation 2026-10-14: built in spec F1 — `mutateContactPoints("Email")` + `mutateMyself()`. The "email used by another account" Primary rejection is not mapped yet: the F1 email-in-use row (`User with email '…' already exists.` → `account.primaryEmailInUse`) is scoped to `account` (Story 7.6) only. Use it; do not rebuild. Remaining for this story: unchanged (Team A); add this story's own row for scope `email` in `lib/api/errors/contacts.ts` once the backend message is confirmed. Area files (edit only these, never the `index.ts` aggregators): allowlist `lib/server/proxy/allowlist/contacts.ts`, copy `lib/shared/messages/contacts.ts`, errors `lib/api/errors/contacts.ts`.*
*Foundation 2026-10-14: built in spec F3-1 — `StatusBadge` (incl. `pending` for the countdown), `DisabledAction({ reason })` for "Make primary" ("Verify this email first") and Remove ("Make another email primary first"), `ConfirmDialog` (busy confirm), `toastError(text, { onRetry })` for email-in-use and other failures, `toastSuccess("Email saved.")`. Use it; do not rebuild. Remaining for this story: unchanged (Team A).*
*Foundation 2026-10-14: built in spec F3-2 — nothing new beyond the Email Section's `useSectionForm`: verify and Make primary are immediate actions; after them the Email key refetches and an open edit view rebases through the new `baseline`. Use it; do not rebuild. Remaining for this story: unchanged (Team A).*

As a patient or provider,
I want new emails verified automatically, and to make a verified email my primary sign-in email with a clear warning,
So that I can change my login email safely and control email notifications.

**Acceptance Criteria:**

**Given** the Email Section saved successfully (own Save or Save all)
**When** it refetches
**Then** it auto-verifies ids from `newUnverified(before, after)` (new, unverified, label ≠ Home) with one `verifyContactPoints` call before `save()` resolves; verify failure never fails the save (AD-8)
**And** rows sent successfully show "Link sent · Resend in 60 s" counting down to "Resend verification"; ids in `contactPointIdsWithSendError` (or all ids if the call fails) show "Couldn't send the link" *(draft copy)* with "Resend verification" available at once (same behavior as Story 3.3)

**Given** a saved unverified email whose label isn't Home (including an unverified Primary)
**When** it shows in read view
**Then** "Verify" / "Resend verification" acts from read view without a confirm, follows the 60 s countdown rule, and the badge turns "Verified" when the Email key revalidates on window focus
**And** Verified and Home-labeled rows show no Verify action

**Given** a saved, Verified, non-Primary email
**When** the user activates "Make primary"
**Then** the shared `components/ui/confirm-dialog.tsx` (Story 1.11, standard variant) opens with focus on Cancel: title "This changes how you sign in", body "{email} becomes your primary email and sign-in email. Your current primary is relabeled Old." *(draft copy adapted from the phone string)*, buttons "Cancel" / "Make primary"
**And** on confirm, exactly one `POST /api/1h/v2/health/contact-point` sends the new Primary (`label "Primary"`, `isNotificationEnabled true`) and the old Primary (`label "Old"`) in the same `contactPointsToUpdate`
**And** on success: Email key and `["pp","myself"]` mutated, new Primary first with Notifications "On", old reads "Old", toast "Email saved.", focus to the Email `h2`, and the header's primary email (desktop) updates

**Given** an email that can't become Primary
**When** it renders
**Then** "Make primary" is aria-disabled with tooltip "Verify this email first" for unverified emails (there is no unverified exception for email)
**And** unverified Home-labeled emails show "Change the label from Home, then verify this email" *(draft copy)*
**And** new unsaved rows never offer Primary

**Given** the platform rejects the Primary change because the email is used by another account
**When** the error returns
**Then** `lib/api/errors.ts` maps that backend code to "This email is used by another account. Choose a different one." *(draft copy)*, shown as an error toast with the row unchanged; no partial change is shown
**And** other rejections use their mapped message or the generic error with "Retry"

**Given** the Primary email
**When** the user tries to remove it (kebab or edit mode)
**Then** Remove is aria-disabled with tooltip "Make another email primary first"
**And** there is never more than one Primary email in the table or in any DTO (unit-tested)
**And** an unverified Primary keeps its Primary chip and shows Verify

**Given** the Email Section in edit mode
**When** the Primary row renders
**Then** its Notifications cell is a switch named "Notifications for {email}"; other rows show "—" (RC3); toggling sends only that row in `contactPointsToUpdate`

**Given** both Email and Phone are dirty
**When** the user activates "Save all (N)"
**Then** Email saves and runs its auto-verify before Phone starts (Epic 1 `SAVE_ORDER`), verified by a Save all integration test with MSW asserting request order

**Given** the story is done
**When** CI runs
**Then** tests cover auto-verify incl. send errors, Make primary eligibility and tooltips, confirm copy/focus, single-request Primary switch, email-in-use mapping, Primary Remove disabled, notification switch, and Save all ordering

**Covers:** FR21, FR22, FR23, AD-8, AD-9, UX-DR25, UX-DR27, UX-DR28, UX-DR36, UX-DR44, UX-DR52, UX-DR53, UX-DR55, UX-DR61 · **Jira:** NG-9024

---

### Story 3.7: Manage social media links

*Amended 2026-10-13 (architecture update: AD-5 external-link exception; PA1).*
*Foundation 2026-10-14: built in spec F1 — `lib/shared/safe-href.ts#safeHref(value, ["https:"])` (Stories 9.3 and 10.2 reuse it with the default `https:`/`mailto:`/`tel:`), `keys.contactPoints("Social Media")`, `fetchContactPoints("Social Media")` (one type per call, not an array), `Social Media` in the list entry, `mutateContactPoints("Social Media")`, the duplicate rows → `contacts.duplicateSocial` (DRAFT COPY). Use it; do not rebuild. Remaining for this story: everything else (Team A). Area files (edit only these, never the `index.ts` aggregators): allowlist `lib/server/proxy/allowlist/contacts.ts`, copy `lib/shared/messages/contacts.ts`, errors `lib/api/errors/contacts.ts`.*
*Foundation 2026-10-14: built in spec F3-1 — `DisabledAction({ reason })` for "Add link"/"Add row" at 20 ("You've reached the limit of 20 links"), `FormField`/`FieldError` + `Input`, `toastSuccess("Social media saved.")`. Use it; do not rebuild. Remaining for this story: unchanged (Team A).*
*Foundation 2026-10-14: built in spec F3-2 / F3-3 — `StateFrame` (`columns={SECTION_COLUMNS.social}`, `loadError: { kind: "section", sectionId: "social" }` → "Couldn't load social links", `onRetry` revalidating only the `Social Media` key), `forbiddenScopeFor(path, "profile")` (`type=Social Media` → owner `social`), `useReportSectionCount("social", n)`, `useSectionForm` (`id: "social"`, label "Social media" → default toast "Social media saved.", `cancelFocus: "heading"`, `onNoChanges: "close"`), `runSaveSteps(steps, { scope: "social", mode: "stop", refetch, rebase })`, `SectionFooter` `addRow` with `disabledReason` at 20. Use it; do not rebuild. Remaining for this story: unchanged (Team A).*

As a patient or provider,
I want to add, change and remove links to my social media profiles, and open them from my profile,
So that the people I work with can find me, without being forced to keep any link.

**Acceptance Criteria:**

**Given** the Contacts tab loads
**When** the Social media Section (`features/social`, `h2` "Social media", anchor `#social`) fetches `fetchContactPoints(["Social Media"])`
**Then** it shows its own 3-row skeleton, then a real table with columns Link · actions (no label, status, primary or notifications)
**And** the header and index item "04 Social media" show the saved count
**And** with no links the row reads "No social links yet · Add link"; "Add link" opens edit mode with one new row focused
**And** a failed load shows "Couldn't load social links · Retry" that reloads only this Section (NFR5)

**Given** a saved link in read view
**When** its value passes `safeHref()` (`lib/shared/safe-href.ts`, created here unless Story 9.3 or 10.2 already did; it accepts `https:`, `mailto:`, `tel:` per the spine, and social links additionally require `https:`)
**Then** it renders as an anchor in link-text color with `target="_blank"` and `rel="noopener noreferrer"`, opening in a new tab (AD-11); this is allowed only because a social link is an external, non-1health site (AD-5 exception, PA1), and it is not routed through `navigate()`
**And** a component test asserts every rendered social link carries exactly `target="_blank"` and `rel="noopener noreferrer"`; no portal or 1health destination anywhere in the app uses `target="_blank"` (AD-5)
**And** a value `safeHref()` rejects (a handle like `@maria`, or a legacy non-https value) renders as plain text, never as a link
**And** no `dangerouslySetInnerHTML` is used (lint rule)
**And** the kebab is named "More actions for {link}" and lists only "Edit" and "Remove"; there is no Verify or Make primary

**Given** the Section
**When** it mounts
**Then** it registers with `useRegisterSection({id: "social", label: "Social media", displayOrder: 4, …})` with the Story 3.2 edit/Cancel/Save/draft behavior, header actions "Edit" / "Add link"

**Given** a new or edited link field
**When** it blurs or the user saves
**Then** the value (trimmed) must be an `https://` URL that parses with a host containing a dot, or a handle matching `^@[A-Za-z0-9._]{1,30}$`; otherwise it shows "Enter a link that starts with https:// or a handle like @name" *(draft copy)*
**And** an empty field shows "Enter a link" *(draft copy)*
**And** a value equal, case-insensitively, to any other row shows "This link is already on your profile" *(draft copy)*
**And** errors use `aria-invalid` + `aria-describedby`; nothing is sent while any error remains

**Given** a saved link in edit mode
**When** the user changes its value (RC4)
**Then** the input is editable (not locked) and `diffToManageDTO` in replace mode (added to the engine in this story via an option such as `{valueChange: "replace"}`, enabled only for Social) puts the old id in `contactPointsToRemove` and the new value in `contactPointsToAdd` in the same request
**And** Phone and Email keep the immutable-value guard (unit-tested)

**Given** Remove
**When** the user removes links
**Then** saved rows strike through with "Removed on save" + "Restore", new rows disappear
**And** Remove is never disabled for the last link: zero links is allowed, and saving with every link removed returns the empty state
**And** with 20 links, "Add link" and "Add row" are aria-disabled with tooltip "You've reached the limit of 20 links" *(draft copy, follows the phone pattern)*

**Given** valid edits
**When** the user saves (or Save all reaches Social after Email and Phone)
**Then** one `POST /api/1h/v2/health/contact-point` is sent; every added link has `type: "Social Media"` and `label: "Personal"`
**And** no verify call is made after save
**And** on success: Social key mutated, read view, toast "Social media saved.", focus to the `h2`, draft cleared, `{ok: true}`
**And** mapped errors show at the field or Section; unknown → generic Section error with "Retry"; network → "Couldn't save social media. Check your connection." + "Retry"; `save()` never throws

**Given** a viewport under 768 px
**When** the Section renders
**Then** each link is a stacked card (link on line 1, kebab right), links wrap without horizontal scroll at 360 px, and edit inputs stack full width in place

**Given** the story is done
**When** CI runs
**Then** tests cover `socialSchema` (https URL, handle, `http:`/`javascript:` rejected, duplicates), `safeHref` rendering (anchor vs text, `rel`, `target`), replace mode remove+add in one DTO, zero links allowed, limit 20, fixed type/label, and no auto-verify

**Covers:** FR24, AD-5 (external-link exception), AD-9, AD-11, NFR1, NFR5, PA1, UX-DR2, UX-DR20, UX-DR21, UX-DR22, UX-DR28, UX-DR33, UX-DR34, UX-DR35, UX-DR49, UX-DR54, UX-DR55, UX-DR56, UX-DR67 · **Jira:** NG-9025

## Epic 4: Addresses

Users keep their addresses current, using address suggestions, with exactly one primary.

### Story 4.1: View addresses

*Foundation 2026-10-14: built in spec F1 — `keys.addresses()` = `["pp","addresses"]` (declared; this story's `lib/api/addresses.ts` registers the `addresses` loader), the empty Addresses area files. Use it; do not rebuild. Remaining for this story: everything else (Team A). The `GET v2/person/location/list` entry goes in `lib/server/proxy/allowlist/addresses.ts`, not `lib/server/proxy-allowlist.ts`. Area files (edit only these, never the `index.ts` aggregators): allowlist `lib/server/proxy/allowlist/addresses.ts`, copy `lib/shared/messages/addresses.ts`, errors `lib/api/errors/addresses.ts`. A new `lib/api/<resource>.ts` registers its own loader with `registerFetcher()` and is re-exported from `lib/api/index.ts`.*
*Foundation 2026-10-14: built in spec F3-1 — `StatusBadge status="verified"` ("Verified"; nothing when not validated), `LoadError` on `InlineBanner` for "Couldn't load addresses · Retry". Callers of `LoadError`/`ReadStateFor` pass `attempt` (failure count) so a repeated failure is re-announced. Use it; do not rebuild. Remaining for this story: unchanged (Team A).*
*Foundation 2026-10-14: built in spec F3-3 (+ F3-2) — `StateFrame` (`columns={SECTION_COLUMNS.addresses}`, `loadError: { kind: "section", sectionId: "addresses" }` → "Couldn't load addresses", `onRetry` revalidating only `keys.addresses()`, `attempt`, `onReady`), `SectionLandmark`, `SectionHeader` `count`, `useReportSectionCount("addresses", n)`, `SectionContainer`. Use it; do not rebuild. Remaining for this story: unchanged (Team A; replaces the placeholder in `features/shell/contacts-panel.tsx`).*

As a patient or provider,
I want to see every address on my profile with the Primary one first,
So that I can check at a glance which address 1health uses and whether each one is verified.

**Acceptance Criteria:**

**Given** a signed-in user opens `?tab=contacts`
**When** the Addresses Section (id `addresses`, label "Addresses", displayOrder 5, folder `features/addresses`) mounts
**Then** it registers with `SectionRegistry` via `useRegisterSection` and loads `GET /v2/person/location/list?page=0&size=100` through `callApi` with an SWR key from `lib/api/keys.ts` (e.g. `["pp","addresses"]`)
**And** `lib/server/proxy-allowlist.ts` gains exactly that `GET` entry in the same change (only `page`/`size` query params allowed; any other param → 400)
**And** `lib/api/addresses.ts` exposes `fetchAddresses()` mapping the response's `isPrimary`/`isValidated` to the client model.

**Given** the request is in flight
**When** the Section renders
**Then** it shows three skeleton rows inside the real table container with the real column headers (static under reduced motion)
**And** the page shell, header, tabs and index render without waiting for it, and other Sections load in parallel.

**Given** the list returns addresses
**When** the read view renders
**Then** it is a real `<table>` with `th` headers Address · Label · Type · Status · actions, 44 px rows, hairline dividers (none on the last row) and accent hover/focus-within
**And** the address with `isPrimary=true` is the first row, the rest keep platform order
**And** the Address cell shows a one-line summary: line 1, line 2 (if any), city, state zip; the country is omitted when it is United States and appended otherwise (e.g. "12 King St W, Toronto, ON M5H 1A1, Canada")
**And** the Label cell shows the filled Primary chip only on the Primary row (empty otherwise)
**And** the Type cell shows the Address Type (Home, Main Work, Other Work or Vacation Home)
**And** the Status cell shows success-strong check-circle + "Verified" when `isValidated=true`, and nothing when it is false (no colour-only status).

**Given** the list loads
**When** the Section index / Jump to renders
**Then** item "05 Addresses" shows the count of saved addresses in mono type.

**Given** the list returns zero addresses
**When** the Section renders
**Then** one row spanning all columns reads "No addresses yet · Add address" (draft copy, mirrors the Voice and Tone empty pattern), and "Add address" opens the Section in edit mode with one new expanded row (Story 4.2).

**Given** the list request fails (network or non-auth error)
**When** the Section renders
**Then** an inline error banner replaces the rows: alert icon + "Couldn't load addresses · Retry"
**And** Retry reloads only the Addresses key; Phone, Email, Social and Personal information keep working (NFR5).

**Given** the Section header renders in read view
**When** the user looks at it
**Then** it shows `h2` "Addresses" · count · outline "Add address" button with plus icon (44 px target)
**And** each row's actions cell has an always-visible 44×44 kebab named "More actions for {one-line address}" (menu items are added by Stories 4.2 and 4.4).

**Given** a viewport under 768 px
**When** the read view renders
**Then** each address is a stacked row card inside the same container: line 1 the one-line address, line 2 Primary chip + Address Type + Verified (muted), kebab right, vertically centred; tapping the card body does nothing; no horizontal scroll at 360 px.

**Given** the Section is implemented
**When** CI runs
**Then** Vitest + MSW tests cover Primary-first ordering, the one-line formatter (US vs non-US, with/without line 2/state), Verified mapping from `isValidated`, empty and error states.

**Covers:** FR25, NFR4, NFR5, AD-2, AD-7, AD-10, UX-DR8, UX-DR18, UX-DR19, UX-DR20, UX-DR21, UX-DR25, UX-DR26, UX-DR33, UX-DR34, UX-DR35, UX-DR49, UX-DR62, UX-DR67 · **Jira:** NG-9026

### Story 4.2: Add and edit addresses

*Foundation 2026-10-14: built in spec F1 — `keys.addresses()` (mutate after save), `telemetry.track("section_save", …)` (`lib/shared/telemetry.ts`), `mapApiError("addresses", …)` (field rows go in `lib/api/errors/addresses.ts`, extending its `Field` type), zod-literal lint. Use it; do not rebuild. Remaining for this story: everything else (Team A; countries entry, `addressesSchema`, write entries). Area files (edit only these, never the `index.ts` aggregators): allowlist `lib/server/proxy/allowlist/addresses.ts`, copy `lib/shared/messages/addresses.ts`, errors `lib/api/errors/addresses.ts`.*
*Foundation 2026-10-14: built in spec F3-1 — `Select` for Address Type and Country, `InlineBanner variant="error"` with a Retry `action` for "Couldn't load countries · Retry" (change `announceKey` per failure), `FormField`/`FieldError` + `Input`, `Button` `busy` via the F3-2 footer, `toastSuccess("Addresses saved.")`. Use it; do not rebuild. Remaining for this story: unchanged (Team A).*
*Foundation 2026-10-14: built in spec F3-2 — `useSectionForm` (`id: "addresses"`, label "Addresses" → default toast "Addresses saved.", `cancelFocus: "heading"`, `onNoChanges: "close"`, `errorFields` for row fields, `fieldOrder`), `runSaveSteps(steps, { scope: "addresses", mode: "stop", refetch, rebase })`, `SectionFooter` `addRow`, `KeyValueEditTable` if a row editor uses label/control pairs. Use it; do not rebuild. Remaining for this story: unchanged (Team A).*

As a patient or provider,
I want to add new addresses and correct existing ones in place,
So that my addresses on file are complete and accurate.

**Acceptance Criteria:**

**Given** the Addresses read view
**When** the user activates "Edit" (Section header), a row's kebab "Edit", or "Add address"
**Then** the Section enters edit mode (primary border + 3 px accent halo, header shows "Editing") and the table footer shows "Unsaved changes" indicator (after first change), "Add address" (ghost, plus), "Cancel" (secondary) and "Save" (primary)
**And** "Add address" (header or footer) appends one new row, opened expanded, with focus on its Address Type field
**And** kebab "Edit" opens edit mode with that row expanded and focused; other saved rows start collapsed.

**Given** an address row in edit mode
**When** it is collapsed
**Then** it is a 56 px row with a 44 px chevron button (`aria-expanded="false"`, accessible name "Expand {one-line address}"), the one-line address (cell-strong), Primary chip, Address Type and Status, reusing the read-view columns (the Remove action is added by Story 4.4)
**And** activating the chevron expands it; several rows can be collapsed/expanded independently so the user can edit several addresses with only one open at a time if they wish.

**Given** an address row is expanded
**When** it renders on desktop
**Then** it is one full-width row (colspan) with a header (chevron `aria-expanded="true"`, "New address" in 600 + muted "· New · not saved" for new rows, the one-line address for saved rows) over a 4-column grid with 16 px gaps: [Address Type][Country][Set as primary checkbox ×2] / [Address line 1 ×2][Address line 2 ×2] / [City][County][State/Province][Zip]
**And** optional fields are labelled "Address line 2 (optional)", "County (optional)", "State/Province (optional)"; required fields carry no marker
**And** all inputs are 44 px tall, 16 px text, control-border, validation on blur and on Save
**And** on mobile the fields stack full width inside the same stacked card, in the same order.

**Given** the Address Type select
**When** it opens
**Then** it lists exactly Home, Main Work, Other Work, Vacation Home (fixed list in the app, not fetched).

**Given** the Country select
**When** the Section enters edit mode
**Then** countries load from `GET /v2/public/countries` (allowlist entry added in this change) via SWR, with United States, Canada and Australia pinned first in that order, the rest alphabetical, and any "n/a" entry dropped
**And** a new row defaults to United States
**And** if countries fail to load, the select shows an inline error "Couldn't load countries · Retry" (draft copy) and Save is blocked for rows needing a country while saved rows keep their current country.

**Given** the user saves with an invalid row
**When** validation runs (zod 4 `addressesSchema` in `features/addresses/schema.ts`, messages from `lib/shared/messages.ts`)
**Then** nothing is sent, the invalid row is expanded and the first invalid field focused, with a 2 px error border, error-strong help line with alert icon, `aria-invalid` and `aria-describedby`
**And** Address Type, Country, Address line 1, City and Zip are required (required-field message is draft copy for PM review)
**And** when the country is United States, Zip must be exactly 5 digits, otherwise "Enter a 5-digit ZIP code"
**And** a row whose country + line 1 + city + zip + Address Type equals another row in the Section (case-insensitive, trimmed) shows "This address is already on your profile" (draft copy) on Address line 1.

**Given** valid changes
**When** the user activates Save (or Save all includes `addresses`, which runs last per `SAVE_ORDER`)
**Then** Save shows spinner + "Saving…", inputs are read-only and Cancel disabled; other Sections stay usable
**And** each changed saved row is sent as `PUT /v2/person/location/{id}` and each new row as `POST /v2/person/location` (allowlist entries added in this change), with the request DTO using `primary`/`validated` (never `isPrimary`/`isValidated`), `personLocationType`, `addressLine1`, `addressLine2`, `cityName`, `county`, `stateName`, `country`, `countryCode`, `postalCode`
**And** unchanged rows are not sent; cleared optional fields send `"n/a"`
**And** a manually entered new address is sent with `validated=false`; an edited saved address keeps `validated` only if none of country/line 1/line 2/city/county/state/zip changed, otherwise `validated=false`
**And** `save()` resolves `{ok:true}` or `{ok:false, error}` and never throws.

**Given** the save succeeds
**When** it resolves
**Then** the Section mutates its addresses key, returns to read view, shows toast "Addresses saved.", moves focus to the Section `h2`, clears its draft and emits telemetry `section_save {sectionId:"addresses", ok:true}`.

**Given** a request in the save fails
**When** it resolves
**Then** the Section stays in edit with the platform error mapped (via `lib/api/errors.ts`) to the field where possible, otherwise at Section level with Retry
**And** the addresses key is refetched and the form baseline rebased so Retry sends only the remaining diff (rows already saved are not re-sent)
**And** a network failure shows "Couldn't save addresses. Check your connection." + Retry.

**Given** the user activates Cancel
**When** the Section is in edit mode
**Then** only the Addresses Section reverts to the last saved values, without confirm; Escape never cancels and Enter in an input never submits.

**Given** the Section is dirty
**When** 500 ms pass after a change
**Then** the registry writes a draft under `pp:draft:v1:<environment>:<userId>:addresses` containing only the declared `draftFields` (the address rows), restorable per Epic 1 draft rules.

**Given** a "Set as primary" checkbox in an expanded row
**When** it renders
**Then** it is present and its value is sent as `primary` on Section save (exclusivity and auto-Primary rules are delivered in Story 4.4).

**Given** the Section is implemented
**When** CI runs
**Then** Vitest tests cover schema (required fields, US ZIP, duplicate key), diff (only changed rows, `"n/a"` for cleared optionals, `validated` reset on manual change), country ordering (US/CA/AU pinned, "n/a" dropped) and `save()` partial-failure rebase.

**Covers:** FR26, FR4, FR7, NFR10, AD-2, AD-7, AD-8, AD-10, AD-11, AD-12, AD-15, UX-DR20, UX-DR22, UX-DR23, UX-DR29, UX-DR44, UX-DR56, UX-DR57, UX-DR61, UX-DR67, UX-DR68 · **Jira:** NG-9026

### Story 4.3: Address suggestions via server

*Amended 2026-10-13 (architecture update: AD-19; PA2).*
*Foundation 2026-10-14: built in spec F1 — the empty Places copy file `lib/shared/messages/places.ts`. Use it; do not rebuild. Remaining for this story: everything (F2 named-op wrapper for `/api/places/*`; Team A). Copy goes in `lib/shared/messages/places.ts`; address-field copy in `lib/shared/messages/addresses.ts`.*
*Foundation 2026-10-14: built in spec F2 — `POST /api/places/autocomplete` and `POST /api/places/details` (`app/api/places/{autocomplete,details}/route.ts` → `lib/server/named-ops/places.ts#createPlacesAutocompleteHandler` / `createPlacesDetailsHandler` on `createNamedOp`; kill switch `"pp"`; `PLACES_ENABLED≠1` → `{enabled:false…}`; `input` 1–120 chars, trimmed, at least one non-space; `countryCode` outside `PLACES_COUNTRIES` (US/CA/AU) → empty without Google; `placeId` regex; `DETAILS_FIELD_MASK`; Google 5 s timeout (`PLACES_TIMEOUT_MS`), `MAX_SUGGESTIONS` 5; autocomplete failure → empty, details timeout → 504, other failure → 502; PHI-free `outcome` codes in the log line). **Contract (`lib/shared/bff-contract.ts`):** both requests also carry `lookupId`, a client UUID v4 made per address lookup and reused until its details call; the Places session token is `placesSessionToken(sid, lookupId, SESSION_SECRET)` (HMAC), so it is bound to the session and new for every lookup. Types `PlacesAutocompleteRequest`/`Body`, `PlacesDetailsRequest`/`Body`, `PlaceSuggestion`, `PlaceAddress`; `BFF_PATHS.placesAutocomplete`/`placesDetails`. Use it; do not rebuild. Remaining for this story: Team A: `lib/api/places.ts` (250 ms debounce, stale discard, a new `lookupId` per lookup), the ARIA combobox, fill and `validated` rules, mobile pill hiding and the client tests; decide a per-session throttle on autocomplete (deferred-work: no throttle on `/api/places/autocomplete` (paid Google calls) or `/api/pp/mfa/validate`); `PLACES_ENABLED` is off everywhere until the Google BAA (Story 1.16).*
*Foundation 2026-10-14: built in spec F3-1 — `FormField` + `Input` for the address search field (the ARIA combobox stays Team A, on the F5 Combobox if it fits), `StatusBadge status="verified"` after save. Use it; do not rebuild. Remaining for this story: unchanged (Team A).*
*Foundation 2026-10-14: built in spec F3-2 — nothing new: a picked suggestion fills the row through `form.setValue(…, { shouldDirty: true })` so dirty tracking and validation follow `useSectionForm`. Use it; do not rebuild. Remaining for this story: unchanged (Team A; Combobox F5).*

As a patient or provider in the US, Canada or Australia,
I want address line 1 to suggest complete addresses as I type,
So that I can fill an address quickly and have it marked Verified.

**Acceptance Criteria:**

**Given** the server is deployed
**When** `app/api/places/autocomplete/route.ts` and `app/api/places/details/route.ts` are added
**Then** both accept only `POST` with `Content-Type: application/json` (other methods 405, other content types 415 `{"errorCode":"UNSUPPORTED_MEDIA","source":"proxy"}`), export `dynamic = "force-dynamic"`, call `requireSession()` (no session → 401 `{"errorCode":"SESSION_EXPIRED","source":"proxy"}`) and run no CSRF or session-binding check (D5: no `Sec-Fetch-Site`/`Origin`, no `X-PP-Session`, no `CSRF` or `SESSION_CHANGED` code) *(built: spec F2)*
**And** every error these routes originate (including 400 for bad input and 502/504 for Google failures) uses the BFF body `{"errorCode":"<STRING>","source":"proxy"}`, never `{code}` (AD-19) *(built: spec F2)*
**And** every response carries `Cache-Control: private, no-store, max-age=0`, `Pragma: no-cache`, `Vary: Cookie`, and every Google fetch uses `cache: "no-store"`. *(built: spec F2)*

**Given** a call to `/api/places/autocomplete` with `{input, countryCode}`
**When** it is handled
**Then** `input` longer than 120 chars or empty → 400; `countryCode` not one of US/CA/AU → `{enabled:true, suggestions:[]}` without calling Google *(built: spec F2; the request also carries `lookupId`)*
**And** otherwise the server calls Google Places (New) autocomplete with `GOOGLE_PLACES_KEY` (read only via `lib/server/env.ts`), region codes fixed server-side to US/CA/AU, and a server-generated Places session token bound to the cookie `sid` *(built: spec F2)*
**And** it returns `{enabled:true, suggestions:[{placeId, mainText, secondaryText, matches}]}` (max 5). *(built: spec F2)*

**Given** a call to `/api/places/details` with `{placeId}`
**When** it is handled
**Then** `placeId` not matching `^[A-Za-z0-9_-]{10,300}$` → 400 *(built: spec F2)*
**And** otherwise the server calls Place Details with the server-constant field mask (address components + formatted address only), closes the Places session token, and returns normalized `{addressLine1, cityName, county, stateName, postalCode, countryCode, country, fullAddress, complete}` where `complete` is true only when street number + route, city, postal code and country are all present. *(built: spec F2)*

**Given** `PLACES_ENABLED` is not `1` for the deployment
**When** either route is called
**Then** it returns `200 {enabled:false, suggestions:[]}` (details: `{enabled:false}`) without calling Google *(built: spec F2)*
**And** the client shows no suggestions listbox and hides the help line, while manual entry and Save still work.

**Given** `PP_DISABLED=1` on the deployment (AD-20 kill switch)
**When** either `/api/places/*` route is called
**Then** it answers `503 {"errorCode":"SERVICE_DISABLED","source":"proxy"}` with the AD-18 no-store headers before any session or Google work (there is no CSRF check, D5), and makes no Google call *(built: spec F2)*
**And** a Vitest covers both routes with the flag on and off. *(built: spec F2)*

**Given** Google errors, times out or the quota cap is hit
**When** the route handles it
**Then** it returns `{enabled:true, suggestions:[]}` (or 502 for details) and the client silently falls back to manual entry with no error banner.

**Given** any request to these routes
**When** the server logs it
**Then** only method, route template, status, duration and request id are logged; the typed text, `placeId` and returned address are never logged (no exception in local development) *(built: spec F2)*
**And** no Google script, key or Places URL is ever sent to the browser; CSP `connect-src 'self'` and `script-src` stay unchanged. *(built: spec F2)*

**Given** an expanded address row whose country is United States, Canada or Australia and `enabled=true`
**When** the user types 3+ characters in Address line 1
**Then** after a 250 ms debounce `lib/api/places.ts` calls `/api/places/autocomplete` through `callApi`, and stale responses are discarded
**And** Address line 1 is an ARIA combobox (`role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`) with a listbox in row-menu style directly under the field, matched text in 600
**And** the help line under the field reads "Pick a suggestion to fill the rest and verify the address."
**And** Arrow Up/Down moves the active option, Enter picks it, Escape closes only the listbox (never cancels the Section), Tab leaves the field with the typed text kept.

**Given** the country is any other country
**When** the user types in Address line 1
**Then** no suggestion call is made, no listbox and no suggestion help line appear.

**Given** the user picks a suggestion
**When** `/api/places/details` returns `complete:true`
**Then** Address line 1, City, County, State/Province, Zip and Country are filled from the result, the row is marked `validated=true` and its collapsed/read Status shows "Verified" after save
**And** when `complete:false`, the returned fields are filled but `validated` stays false and the missing required fields show their errors on Save.

**Given** a row filled from a suggestion
**When** the user later edits Address line 1, City, County, State/Province, Zip or Country by hand
**Then** `validated` resets to false for that row.

**Given** a mobile viewport with the on-screen keyboard open
**When** suggestions show
**Then** they appear directly under line 1 and the Save all pill is hidden, returning when the keyboard closes.

**Given** the routes and client are implemented
**When** CI runs
**Then** tests cover: 401 without session, 415 for a non-JSON content type, 503 with `PP_DISABLED=1`, 400 for input > 120 chars and bad `placeId`, `PLACES_ENABLED` off → empty without upstream call, cache headers, no typed text in logs, and client fill/`validated` behaviour with MSW.

**Covers:** FR26, NFR1, AD-3, AD-14, AD-15, AD-17 (as superseded by D5: 415 JSON check only), AD-18, AD-19 (error envelope), AD-20 (kill switch), AD-21, PA2, UX-DR23, UX-DR29, UX-DR32, UX-DR57, UX-DR62, UX-DR68 · **Jira:** NG-9026

### Story 4.4: Primary address and removal

*Foundation 2026-10-14: built in spec F1 — `keys.addresses()` (mutate after save), `mapApiError("addresses", …)`. Use it; do not rebuild. Remaining for this story: everything else (Team A); the `DELETE v2/person/location/{id}` entry goes in `allowlist/addresses.ts`. Area files (edit only these, never the `index.ts` aggregators): allowlist `lib/server/proxy/allowlist/addresses.ts`, copy `lib/shared/messages/addresses.ts`, errors `lib/api/errors/addresses.ts`.*
*Foundation 2026-10-14: built in spec F3-1 — `DisabledAction({ reason })` for Remove ("Make another address primary first", "You need at least one address"); the current Primary checkbox uses the same pattern with `Tooltip keepOpenOnPress` + `aria-disabled` ("Set another address as primary first"); `toastSuccess` / `toastError(text, { onRetry })` for Make primary. Use it; do not rebuild. Remaining for this story: unchanged (Team A).*
*Foundation 2026-10-14: built in spec F3-2 — `runSaveSteps(steps, { scope: "addresses", mode: "stop", refetch, rebase })` is the "later steps not sent, refetch, rebase, Retry sends only the remaining diff" behaviour of Make primary and removal (`applySucceeded` when no refetch is used). Use it; do not rebuild. Remaining for this story: unchanged (Team A).*

As a patient or provider,
I want exactly one Primary address that I can change, and to remove addresses safely,
So that 1health always has one main address for me and I can't leave my profile without one.

**Acceptance Criteria:**

**Given** the user has no saved addresses
**When** they add their first address and save
**Then** it is sent with `primary=true` regardless of the checkbox, and its "Set as primary" checkbox is shown checked
**And** whenever the edited Section would end with exactly one non-removed address, that address is sent as Primary.

**Given** the Section is in edit mode
**When** the user checks "Set as primary" on one row
**Then** it becomes unchecked on every other row (one Primary across the Section), and the Primary chip in collapsed rows follows the draft
**And** the checked box on the current Primary can't be unchecked directly: it is `aria-disabled` with tooltip "Set another address as primary first" (draft copy); the user moves Primary by checking another row
**And** the change applies only on Section save.

**Given** a non-Primary saved address in read view
**When** the user opens its kebab
**Then** it lists "Make primary", "Edit" and "Remove"; the Primary row's kebab lists "Edit" and "Remove" only
**And** "Make primary" saves immediately without a confirm dialog: `PUT /v2/person/location/{id}` with `primary=true`, then `PUT` the old Primary with `primary=false`; on success the list refetches, the new Primary moves to the top with the Primary chip, and toast "Addresses saved." appears.

**Given** a Section save that changes the Primary
**When** `save()` runs
**Then** requests run in fixed order: write the new Primary first (`PUT`, or `POST` if it is a new address), then other `PUT`/`POST`, then `DELETE /v2/person/location/{id}` for removed rows (allowlist entry for `DELETE` added in this change)
**And** if any step fails, later steps are not sent, the addresses key is refetched, the baseline is rebased so Retry sends only the remaining diff, and the Section stays in edit with the error + Retry.

**Given** the Primary address (in read or edit view)
**When** the user focuses, hovers or taps its Remove action (kebab item or edit-row Remove)
**Then** Remove is `aria-disabled="true"`, stays focusable, activation is a no-op, and a tooltip with `aria-describedby` reads "Make another address primary first".

**Given** only one non-removed address remains in the Section draft
**When** the user focuses its Remove
**Then** Remove is `aria-disabled` with tooltip "You need at least one address".

**Given** a removable saved address
**When** the user activates Remove from the read-view kebab or in edit mode
**Then** the Section switches to (or stays in) edit mode, the row is struck through and muted, its Status reads "Removed on save" and its action becomes "Restore"; no confirm, toast or undo
**And** "Restore" brings it back unchanged
**And** removing a new unsaved row deletes it outright
**And** the rules above are evaluated against the draft (e.g. after checking "Set as primary" on another row, the old Primary's Remove becomes available).

**Given** the Section is implemented
**When** CI runs
**Then** Vitest tests cover: auto-Primary for a single address, checkbox exclusivity, request order (new Primary → other PUT/POST → DELETE), failure on step 2 refetches and retries only the remainder, and disabled-reason logic for Primary/last address.

**Covers:** FR27, AD-7, AD-10, UX-DR22, UX-DR25, UX-DR26, UX-DR27, UX-DR28, UX-DR52, UX-DR54, UX-DR55, UX-DR62 · **Jira:** NG-9026

## Epic 5: Insurance

Users put their insurance policies on file, with subscriber details and card photos, and manage which is primary.

### Story 5.1: View policies and card images

*Amended 2026-10-13 (architecture update: AD-2, AD-13).*
*Foundation 2026-10-14: built in spec F1 — `keys.insurance()` = `["pp","insurance"]` (declared; this story's `lib/api/insurance.ts` registers the `insurance` loader), the empty Insurance area files. Use it; do not rebuild. Remaining for this story: everything else (Team A; card-image `asImage` hardening is F2). The policy list and card-image entries go in `lib/server/proxy/allowlist/insurance.ts`. Area files (edit only these, never the `index.ts` aggregators): allowlist `lib/server/proxy/allowlist/insurance.ts`, copy `lib/shared/messages/insurance.ts`, errors `lib/api/errors/insurance.ts`. A new `lib/api/<resource>.ts` registers its own loader with `registerFetcher()` and is re-exported from `lib/api/index.ts`.*
*Foundation 2026-10-14: built in spec F2 — the generic `asImage` hardening (`lib/server/proxy/forward.ts` + `lib/server/http/image-sniff.ts`: inline with `Content-Type` from PNG/JPEG/BMP leading bytes, otherwise `attachment`; nosniff, no-store; upstream `Set-Cookie`/`Content-Disposition`/`Content-Length` dropped; 10 s upstream idle timer). Use it; do not rebuild. Remaining for this story: unchanged — Team A adds the `v2/health/insurance/{id}/file/{fileId}/download` entry with `asImage: true` (`preview=true` forced, query `fileRelKey` limited to the two relations) in `allowlist/insurance.ts`; the sniffing then applies with no extra code.*
*Foundation 2026-10-14: built in spec F3-1 — `LoadError` on `InlineBanner` for "Couldn't load insurance · Retry". Callers of `LoadError`/`ReadStateFor` pass `attempt` (failure count) so a repeated failure is re-announced. Use it; do not rebuild. Remaining for this story: unchanged (Team A).*
*Foundation 2026-10-14: built in spec F3-3 (+ F3-2) — `StateFrame` (`skeleton="table"`, `columns={SECTION_COLUMNS.insurance}` (none), `loadError: { kind: "section", sectionId: "insurance" }` → "Couldn't load insurance", `onRetry` revalidating only `keys.insurance()`), `SectionLandmark` `insurance`, `KeyValueTable` for the card's key/value grid (two pairs per row); the guard-only registration is `useRegisterSection({ id: "insurance", saveAll: false, draftFields: [], … })` (never counted by `getDirtyCount()` nor saved by `runSaveAll` unless the leave guard includes guard-only participants). Use it; do not rebuild. Remaining for this story: unchanged (Team A; replaces the placeholder in `features/shell/insurance-panel.tsx`).*

As a patient,
I want to see each insurance policy on file as a card with its card images,
So that I can confirm my coverage is current before a visit.

**Acceptance Criteria:**

**Given** a signed-in user opens `?tab=insurance`
**When** the Insurance Section (folder `features/insurance`, id `insurance`) mounts
**Then** it loads `GET /v2/health/patient/insurance?page=0&size=100` via `callApi` and an SWR key (e.g. `["pp","insurance"]`) with the allowlist entry added in this change
**And** it registers with `SectionRegistry` as guard-only (`saveAll:false, draftFields:[]`): it never appears in Save all or the dirty count and is never written to drafts (its `validate`, `save` and `discard` are supplied by the editor in Story 5.2)
**And** the tab shows no Section index or Jump to; cards use the full main-column width.

**Given** the request is in flight
**When** the tab renders
**Then** placeholder cards (skeleton, static under reduced motion) show while the rest of the page stays usable.

**Given** policies are returned
**When** the tab renders
**Then** a Section header shows `h2` "Insurance" · count of non-Deleted policies · outline "Add insurance" (plus icon)
**And** each policy is a flat bordered `rounded-md` card (no shadow), single column at every width, 16 px apart; active policies before Deleted ones, otherwise platform order
**And** the title row (min 52 px, bottom hairline) shows "{Type} Insurance" (Medical, Dental, Hospice, Vision, Drug) + precedence chip (Primary → filled primary chip; Secondary/Supplemental/Other → label chip) + a 44×44 kebab named "More actions for {Insurer} {Type} Insurance" (items added by Stories 5.2 and 5.5)
**And** the body is a key/value grid, two pairs per row, 40 px rows: Insurer, Subscriber, Member ID, Effective, Group ID, Expiration, Cancellation
**And** dates display `MM/DD/YYYY`; empty values read "Not provided"; Subscriber is the subscriber's first + last name, or the user's own name when the relationship is Self.

**Given** a policy has front and/or back card files
**When** the card renders
**Then** behind a left hairline it shows 120×76 `rounded-sm` thumbnails captioned "Front" / "Back", each an `<img src="/api/1h/v2/health/insurance/{id}/file/{fileId}/download?fileRelKey=InsuranceHasFrontSideCardFile|InsuranceHasBackSideCardFile">`
**And** that download is an `asImage` allowlist entry with `preview=true` forced server-side on the upstream request (client value ignored; `fileRelKey` is the only client query param, limited to the two values above) (AD-2): served inline only for declared `image/png|jpeg|bmp` with matching magic bytes, otherwise `Content-Disposition: attachment`; always `X-Content-Type-Options: nosniff` and `Cache-Control: private, no-store, max-age=0`; the image is never fetched without the session cookie
**And** a side with no file, or whose image fails to load, shows a dashed 120×76 placeholder "Image not uploaded"
**And** on mobile the thumbnails move below the key/value grid.

**Given** a thumbnail is shown
**When** the user activates it (click, Enter, Space)
**Then** the card image viewer opens: shadcn Dialog `rounded-lg`, image fit to the viewport on a card surface, a Front/Back segmented toggle (a missing side is disabled), a close button; full-screen on mobile
**And** Escape or close returns focus to the thumbnail that opened it.

**Given** a policy whose status is Deleted
**When** its card renders
**Then** all card text is muted, a "Deleted" chip replaces the precedence chip, and there is no kebab, no thumbnail action and no other action.

**Given** the list returns zero policies
**When** the tab renders
**Then** a dashed empty card reads "No insurance on file. Add a policy before your next visit." with a primary "Add insurance" button (opens the editor from Story 5.2).

**Given** the list request fails
**When** the tab renders
**Then** an inline error banner reads "Couldn't load insurance · Retry" and Retry reloads only this list.

**Given** the Section is implemented
**When** CI runs
**Then** tests cover card mapping (title, chips, Self subscriber name, "Not provided"), Deleted card without actions, empty and error states, the image proxy headers on the download entry, and viewer focus return.

**Covers:** FR28, FR31, NFR1, NFR5, AD-2 (`preview=true` on `asImage`), AD-7, AD-10, AD-13, AD-18, UX-DR10, UX-DR25, UX-DR33, UX-DR34, UX-DR35, UX-DR43, UX-DR45, UX-DR62, UX-DR67 · **Jira:** NG-9029

### Story 5.2: Add and edit a policy

*Amended 2026-10-13 (architecture update: AD-26).*
*Foundation 2026-10-14: built in spec F1 — `keys.insurance()` (mutate after save), `telemetry.track("section_save", …)`, `mapApiError("insurance", …)` (field rows such as `INVALID_ENUM_VALUE` go in `lib/api/errors/insurance.ts`), `lib/shared/dates.ts` (`YYYY-MM-DD` ↔ `MM/DD/YYYY`), zod-literal lint. Use it; do not rebuild. Remaining for this story: everything else (Team A; Combobox/date input F5). Area files (edit only these, never the `index.ts` aggregators): allowlist `lib/server/proxy/allowlist/insurance.ts`, copy `lib/shared/messages/insurance.ts`, errors `lib/api/errors/insurance.ts`.*
*Foundation 2026-10-14: built in spec F3-1 — `FormField`/`FieldError` + `Input`, `Select` for the fixed lists, `InlineBanner variant="error"` with a Retry `action` for the organizations lookup failure, `Button` `busy` for Save, `toastSuccess("Insurance saved.")`. Use it; do not rebuild. Remaining for this story: unchanged (Team A; Combobox/date input F5).*
*Foundation 2026-10-14: built in spec F3-2 — the guard-only contract (`saveAll: false`; `validate` returns `{ valid: false, invalidCount, focusFirstInvalid }`; the leave guard saves it after the Save-all Sections), `useSectionForm` usable with `saveAll: false` and `successToast: "Insurance saved."` when its focus rules fit the drawer (success focuses the Section `h2`; the drawer must return focus to its trigger, so the editor may register through `useRegisterSection` and own focus instead), `KeyValueEditTable`, `SectionFooter`, `runSaveSteps(steps, { scope: "insurance", mode: "stop" })`. Use it; do not rebuild. Remaining for this story: unchanged (Team A; Combobox/date input F5).*

As a patient,
I want to add a new insurance policy or correct an existing one in a focused editor,
So that my coverage details, including who holds the policy, are right on file.

**Acceptance Criteria:**

**Given** the Insurance tab
**When** the user activates "Add insurance" (header or empty state) or a non-Deleted card's kebab "Edit"
**Then** on desktop a shadcn Sheet opens from the right, 480 px wide, full height over the `scrim` token (graphite 45 % light, black 60 % dark; never `bg-black/50`), with a sticky header (title "Add insurance" or "Edit insurance" (draft copy) + close button), a scrolling body and a sticky footer with "Cancel" (secondary) + "Save" (primary)
**And** on mobile (< 768 px) it is a full-screen page with a back control in place of close, paired fields stacked one per row, Cancel/Save pinned to the bottom
**And** Edit pre-fills every field from the policy.

**Given** the editor body
**When** it renders
**Then** fields appear in this order: Insurer → Type + Precedence → (demotion notice slot, Story 5.4) → Relationship to the insured → Member ID + Group ID → Effective date + Expiration date → Cancellation date → Subscriber group → (Card images slot, Story 5.3)
**And** optional fields are labelled "Group ID (optional)", "Expiration date (optional)", "Cancellation date (optional)"; required fields carry no marker.

**Given** the Insurer combobox
**When** the user types 2+ characters
**Then** after a debounce it calls `GET /v2/health/insurance/organizations?name={text}&page=0&size=20` (allowlist entry added) and lists matches in a row-menu listbox (ARIA combobox, keyboard selectable)
**And** help text reads "Search the list, or add your insurer by name if it isn't there."
**And** when no result matches the text exactly (case-insensitive), the last option is "Add “{name}”"; choosing it stores a new Insurer by name (no id) in the DTO.

**Given** the editor opens
**When** options load from `GET /v2/type/key/Insurance` (allowlist entry added if not present)
**Then** Type, Precedence and Relationship to the insured options come from that response's attributes (Relationship per RC10), shown in title case
**And** if the request fails, an inline error with Retry shows in the editor and Save is blocked until options load.

**Given** the user changes Relationship to anything other than Self
**When** the Subscriber group appears
**Then** it has a top hairline, heading "Subscriber", copy "The person who holds this policy. Needed because the relationship isn't Self.", and required fields First name + Last name, Email, Phone, Birth date
**And** email help reads "Use {subscriber first name}'s email, not the one you sign in with."
**And** the Phone field uses a dial-code prefix with libphonenumber-js validation (US 10 digits), without depending on Epic 3
**And** switching back to Self hides the group and the subscriber is not sent.

**Given** the user activates Save
**When** validation runs (`features/insurance/schema.ts`, zod 4, messages in `lib/shared/messages.ts`)
**Then** nothing is sent if invalid; the first invalid field is focused with error border, error-strong line, `aria-invalid`, `aria-describedby`
**And** Insurer, Type, Precedence, Relationship, Member ID and Effective date are required
**And** Member ID must be ≥ 3 characters; Group ID, when present, ≥ 3 characters
**And** Expiration and Cancellation, when present, must be after Effective; Cancellation must be before Expiration when both are present; the date fields carry help "Expiration and cancellation must be after the effective date. Cancellation must be before expiration."
**And** when Relationship ≠ Self: subscriber first name, last name, email (valid), phone and birth date are required; an email equal (case-insensitive) to the user's own login email shows an inline error (draft copy) on Email; a birth date outside 18–120 years shows "You must be 18 to 120 years old"
**And** validation-message strings not in EXPERIENCE.md are flagged as draft copy for PM review.

**Given** a valid form
**When** Save runs
**Then** Save shows spinner + "Saving…", inputs are read-only and Cancel disabled
**And** a new policy is sent as `POST /v2/health/patient/insurance`, an edited one as `PUT /v2/health/patient/insurance/{id}` (allowlist entries added), with `InsuranceDTO` using uppercase enums: `insuranceType` MEDICAL|DENTAL|HOSPICE|VISION|DRUG, `insurancePrecedence` PRIMARY|SECONDARY|SUPPLEMENTAL|OTHER, `relationshipToInsured` uppercase, dates `YYYY-MM-DD`, `memberIdNumber`, `insuranceGroupId`, `insuranceOrganizationDTO`, and `subscriber` only when Relationship ≠ Self.

**Given** the save succeeds
**When** it resolves
**Then** the drawer closes, the insurance key is mutated, toast "Insurance saved." appears, focus returns to the trigger (the "Add insurance" button or the card's kebab), and telemetry `section_save {sectionId:"insurance", ok:true}` is emitted.

**Given** the save fails
**When** it resolves
**Then** the editor stays open with platform errors mapped via `lib/api/errors.ts` (e.g. `INVALID_ENUM_VALUE` → that field) or at editor level with Retry; a network failure shows "Couldn't save insurance. Check your connection." + Retry.

**Given** the open editor
**When** it registers as the guard-only participant `insurance` (Story 1.13 contract)
**Then** it supplies `validate()` (the editor schema), `save()` (the same flow as its own Save button: policy, then demoted policy, then card images; resolves `{ok:true} | {ok:false, error}`, never throws) and `discard()` (drop the edits and close the editor), so it registers with `canSave: true`
**And** it reports dirty only while the editor's values differ from the policy it opened with.

**Given** the editor has unsaved changes
**When** the user activates close, Cancel, Escape, the scrim or mobile Back (the editor calls `requestLeave({ scope: "insurance" })`), or any `navigate()` call — a tab switch, the app-bar page switch (Personal Profile → Account) or app-bar "Return to 1health" (page-level guard, AD-26)
**Then** the Story 1.13 leave guard opens: "You have unsaved changes" with "Keep editing" (initial focus) / "Discard" / "Save"
**And** "Keep editing" keeps the editor open with the edits
**And** "Discard" drops the edits, closes the editor, returns focus to the trigger and completes any pending navigation
**And** "Save" calls the editor's own `validate()` then `save()`: if invalid, nothing is sent, the guard closes, the editor stays open and focus moves to the first invalid field; on `{ok:true}` the editor closes, toast "Insurance saved." appears and any pending navigation completes; on `{ok:false}` the editor stays open with its error and Retry and the navigation is cancelled
**And** with no changes, the editor closes immediately and focus returns to the trigger
**And** nothing from the editor is written to `localStorage`.

**Given** the editor is implemented
**When** CI runs
**Then** tests cover schema rules (member/group length, date ordering, subscriber requirement, own-email rejection, age 18–120), DTO enum mapping incl. DRUG, insurer "Add “{name}”" path, leave guard on dirty close (Keep editing, Discard, and Save calling the editor's own `save()` with success, invalid and failure outcomes), the page-level guard on an app-bar switch to Account with the editor dirty, and keyboard-only completion.

**Covers:** FR29, FR6, FR8, NFR2, NFR10, AD-2, AD-7, AD-10, AD-11, AD-15, AD-26 (page switch via `navigate()`), UX-DR29, UX-DR42, UX-DR44, UX-DR46, UX-DR56, UX-DR57, UX-DR61, UX-DR62, UX-DR66, UX-DR67, UX-DR68 · **Jira:** NG-9029

### Story 5.3: Card image upload with retry

*Foundation 2026-10-14: built in spec F1 — `keys.insurance()` (revalidate after upload). Use it; do not rebuild. Remaining for this story: everything else (F2 upload mechanism; Team A). Upload entries go in `allowlist/insurance.ts`. Area files (edit only these, never the `index.ts` aggregators): allowlist `lib/server/proxy/allowlist/insurance.ts`, copy `lib/shared/messages/insurance.ts`, errors `lib/api/errors/insurance.ts`.*
*Foundation 2026-10-14: built in spec F2 — both card upload entries in `lib/server/proxy/allowlist/insurance.ts` (`POST v2/health/type/Insurance/{insuranceId}/relation/InsuranceHas{Front,Back}SideCardFile/file/upload`: numeric id, no client query, `isPublic=false` forced, part `file`, PNG/JPEG bytes, `IMAGE_UPLOAD_MAX_BYTES` 4 MB; 413/415 via `lib/server/proxy/upload.ts`; forced-`isPublic` row in `insurance.test.ts`). **Id ownership:** `{insuranceId}` is checked only against `^\d{1,19}$` and the backend has no ownership check on uploads, so the client must take the id only from the policy it just saved or the user's own `keys.insurance()` list. Use it; do not rebuild. Remaining for this story: Team A: the Card images UI, re-encode, the policy → images order, in-memory retry, replace-then-delete with the Story 1.10 `DELETE v2/file` entry and the client tests; resolve or accept the ownership gap (deferred-work: insurance upload ids trusted from the client, a named op could verify ownership; hard delete may leave private S3 objects).*
*Foundation 2026-10-14: built in spec F3-1 — `toastError(text, { onRetry })` for a failed upload retry, `toastSuccess("Insurance saved.")`, `Button` `busy`. Use it; do not rebuild. Remaining for this story: unchanged (Team A).*
*Foundation 2026-10-14: built in spec F3-2 — nothing new: the policy save resolves its `SaveResult` before the card uploads, so an upload failure never fails the save (Retry upload uses `toastError(…, { onRetry })`). Use it; do not rebuild. Remaining for this story: unchanged (Team A).*

As a patient,
I want to add photos of the front and back of my insurance card, and retry if an upload fails,
So that my clinic has my card on file without me losing the policy I just saved.

**Acceptance Criteria:**

**Given** the insurance editor
**When** the Card images group renders
**Then** it shows the rules line "PNG or JPEG, up to 10 MB. Images upload after the policy saves." and two slots side by side (front | back; stacked on mobile)
**And** an empty slot is a dashed 120:76 tile "No image chosen" with a "Choose front image" / "Choose back image" button
**And** a slot with a saved image shows its thumbnail with "Replace".

**Given** the user chooses a file
**When** it is a PNG or JPEG (checked by MIME type and leading bytes), at most 10 MB and at most 6000×4000 px (either orientation)
**Then** the slot shows a 120:76 preview with "{file name} · {size}" and "Replace" / "Remove" ghost buttons
**And** "Remove" clears the unsaved choice only.

**Given** the user chooses an SVG or any other type, a file over 10 MB, or one larger than 6000×4000 px
**When** it is checked
**Then** it is rejected before any upload with an inline error naming the file and the reason (e.g. "{file name} is {size}. Choose a file up to 10 MB." — draft copy) and the slot keeps its previous state.

**Given** an accepted file
**When** it is prepared for upload
**Then** `reencodeImage(file, { format: 'jpeg', maxBytes: 4 * 1024 * 1024, maxDims: { width: 6000, height: 6000 } })` from `lib/shared/image-reencode.ts` (Story 1.10) re-encodes it in the browser via canvas to JPEG, stepping quality and size down until it is ≤ 4 MB (RC11)
**And** an `{ ok: false }` result rejects the file with the inline error "{file name} couldn't be used. Choose another file." (draft copy) and the slot keeps its previous state.

**Given** the user saves the editor with chosen images
**When** the policy `POST`/`PUT` succeeds
**Then** images upload only afterwards, front then back, as multipart with one part `file` to `POST /api/1h/v2/health/type/Insurance/{id}/relation/InsuranceHasFrontSideCardFile/file/upload` or `…/InsuranceHasBackSideCardFile/…` with no query params (the client never sends `isPublic`)
**And** the two proxy allowlist upload entries are added in this change (method + path template + allowed query; server-forced params): `{id}` matching `^\d{1,19}$`, no client query params allowed, `isPublic=false` forced server-side whatever the client sends, `maxBytes` 4 MB (413 `TOO_LARGE`), one part named `file`, PNG/JPEG magic bytes only (415 `UNSUPPORTED_MEDIA`) *(built: spec F2)*
**And** on success the card shows the new thumbnail and toast "Insurance saved." appears.

**Given** the policy saved but an image upload fails
**When** the save flow ends
**Then** the policy stays saved, the drawer closes, the card shows that side as a dashed placeholder "Image not uploaded" with a "Retry upload" button in `link-text`, and a warning toast names the problem (e.g. "Insurance saved. Back image not uploaded." — draft copy)
**And** the re-encoded image is kept only in memory (never in storage) keyed by policy id + side.

**Given** the "Retry upload" button (`link-text`)
**When** the user activates it and the image is still in memory
**Then** only that upload is retried; success replaces the placeholder with the thumbnail; failure keeps the placeholder and shows an error toast with Retry
**And** when the image is no longer in memory (e.g. after reload), "Retry upload" opens the file picker for that side and uploads the chosen file directly after the same checks.

**Given** an existing policy with a saved image
**When** the user replaces it and saves
**Then** the new file uploads to the same relation; if the previous file remains attached, it is deleted afterwards with `DELETE /api/1h/v2/file/{oldId}` with no query params (the Story 1.10 entry forces `hardDelete=true`; the client never sends `hardDelete`) (replace-then-delete), and a failed delete does not fail the save.

**Given** the feature is implemented
**When** CI runs
**Then** tests cover type/size/dimension rejection (incl. SVG), the order policy → images, upload failure leaving the policy saved with "Retry upload", retry sending only the upload, the proxy 413/415 cases, a client-sent `isPublic=true` still reaching upstream as `isPublic=false`, and that the client's upload and delete URLs carry no `isPublic` or `hardDelete` param.

**Covers:** FR29, NFR1, AD-2, AD-7, AD-13, RC11, UX-DR44, UX-DR45, UX-DR46, UX-DR68 · **Jira:** NG-9029

### Story 5.4: Primary per type with demote offer

*Foundation 2026-10-14: built in spec F1 — `keys.insurance()` (mutate after save), `mapApiError("insurance", …)`. Use it; do not rebuild. Remaining for this story: everything else (Team A). Area files (edit only these, never the `index.ts` aggregators): allowlist `lib/server/proxy/allowlist/insurance.ts`, copy `lib/shared/messages/insurance.ts`, errors `lib/api/errors/insurance.ts`.*
*Foundation 2026-10-14: built in spec F3-1 — `InlineBanner variant="info"` with the "Make {insurer} secondary" outline Button as `action` (outside the live region), `FieldError` for the line under the banner. Use it; do not rebuild. Remaining for this story: unchanged (Team A).*
*Foundation 2026-10-14: built in spec F3-2 — `runSaveSteps(steps, { scope: "insurance", mode: "stop" })` for demote-then-save (the save is skipped if the demote fails); invalid-before-send focus via the editor's `validate()`. Use it; do not rebuild. Remaining for this story: unchanged (Team A).*

As a patient,
I want the editor to offer to make my current primary policy secondary when I add a new primary of the same type,
So that I never end up with two primary policies of one type.

**Acceptance Criteria:**

**Given** the editor has Precedence = Primary and Type = T
**When** another non-Deleted policy (not the one being edited) of type T is Primary
**Then** an inline info banner appears right after Type + Precedence: "Only one primary {Type} policy. Make {insurer} secondary?" with an outline button "Make {insurer} secondary"
**And** if legacy data has more than one such policy, all are named and all will be demoted.

**Given** the banner
**When** the user activates "Make {insurer} secondary"
**Then** the demotion is accepted (button shows a pressed state with `aria-pressed="true"`) and the muted note "The change saves with this policy." shows under it
**And** changing Type or Precedence re-evaluates the condition and clears the acceptance.

**Given** the conflict exists and the demotion has not been accepted
**When** the user activates Save
**Then** nothing is sent, focus moves to the "Make {insurer} secondary" button and an error line under the banner explains that only one primary {Type} policy is allowed and to make {insurer} secondary or choose another precedence (draft copy).

**Given** the demotion is accepted
**When** Save runs
**Then** requests run in fixed order: the policy `POST`/`PUT`, then `PUT /v2/health/patient/insurance/{otherId}` with the other policy's current values and `insurancePrecedence: "SECONDARY"`, then card images (Story 5.3)
**And** on success the list refetches: the new card shows the Primary chip and the old policy reads Secondary.

**Given** the policy saved but the demotion `PUT` fails
**When** the flow stops
**Then** images are not uploaded yet, the insurance key is refetched, the editor stays open now editing the saved policy (baseline rebased so Retry sends only the demotion and pending images), with an editor-level error + Retry.

**Given** the backend does not enforce one Primary per type
**When** the policy is edited without Precedence = Primary or with no conflicting policy
**Then** no banner shows and no demotion request is sent.

**Given** the feature is implemented
**When** CI runs
**Then** tests cover banner trigger (same type only, Deleted ignored, editing the current Primary shows none), save blocked without acceptance, request order policy → demotion → images, and demotion-failure retry.

**Covers:** FR29, AD-7, AD-10, UX-DR33, UX-DR46, UX-DR61, UX-DR68 · **Jira:** NG-9029

### Story 5.5: Delete a policy

*Foundation 2026-10-14: built in spec 7.0b-1 — `ConfirmDialog` (`variant: "destructive"`, `bg-destructive-fill`) for "Delete this insurance policy?". Use it; do not rebuild. Remaining for this story: everything else (Team A).*
*Foundation 2026-10-14: built in spec F1 — `keys.insurance()` (mutate after delete), `mapApiError("insurance", …)`. Use it; do not rebuild. Remaining for this story: unchanged (Team A); the `DELETE v2/health/insurance/{id}` entry goes in `allowlist/insurance.ts`. Area files (edit only these, never the `index.ts` aggregators): allowlist `lib/server/proxy/allowlist/insurance.ts`, copy `lib/shared/messages/insurance.ts`, errors `lib/api/errors/insurance.ts`.*
*Foundation 2026-10-14: built in spec F3-1 — `ConfirmDialog` on `Button busy` (the busy confirm reads "Saving…"; add a `busyLabel` prop to `ConfirmDialog` if delete copy is needed), `toastSuccess` and `toastError(text, { onRetry })` for the delete outcomes. Use it; do not rebuild. Remaining for this story: unchanged (Team A).*
*Foundation 2026-10-14: built in spec F3-2 / F3-3 — nothing new (delete is a confirm action outside the edit model). Use it; do not rebuild. Remaining for this story: unchanged (Team A).*

As a patient,
I want to delete an insurance policy I no longer have, after confirming,
So that outdated coverage doesn't stay on my profile.

**Acceptance Criteria:**

**Given** a non-Deleted policy card
**When** the user opens its kebab
**Then** it lists "Edit" and "Delete" ("Delete" in error-strong text).

**Given** the user activates "Delete"
**When** the shared `components/ui/confirm-dialog.tsx` (Story 1.11) opens in its destructive variant
**Then** it shows title "Delete this insurance policy?", body "{Insurer} {Type} Insurance will be removed from your profile.", and right-aligned "Cancel" (secondary) + "Delete policy" (destructive fill `bg-destructive-fill`, white text)
**And** focus starts on Cancel; Escape or Cancel closes with no request and focus returns to the kebab.

**Given** the user confirms "Delete policy"
**When** the request runs
**Then** `DELETE /v2/health/insurance/{id}` is sent (allowlist entry added), the button shows a spinner and the dialog can't be dismissed meanwhile
**And** on success the dialog closes, the insurance key is refetched and the UI reflects the platform result: the card shows the muted Deleted state with the "Deleted" chip and no actions, or the card is gone
**And** a success toast confirms (e.g. "Insurance policy deleted." — draft copy) and focus moves to the next card's kebab, or to "Add insurance" if none remain
**And** any in-memory pending card image for that policy is dropped.

**Given** the delete fails
**When** it resolves
**Then** the dialog closes, the card is unchanged, and an error toast with Retry persists until dismissed ("Couldn't delete insurance policy. Check your connection." for network failure — draft copy; platform errors mapped via `lib/api/errors.ts`)
**And** a 404 is treated as already removed: the list refetches with no error.

**Given** the feature is implemented
**When** CI runs
**Then** tests cover confirm copy and focus, both platform outcomes (Deleted status vs removed), failure toast with Retry, and that Deleted cards offer no Delete.

**Covers:** FR30, AD-2, AD-10, UX-DR3, UX-DR36, UX-DR44, UX-DR45, UX-DR61 · **Jira:** NG-9029

## Epic 6: Medical (placeholder)

Defined later by the PM. No stories yet. Story 1.8 delivers the FR32 "Coming soon" panel.

## Epic 7: Account page and personal account settings

Users go to **Account** from the app bar and keep their name, sign-in email and phone, birth date, language, time zone and locale correct. A partial save tells them exactly which part wasn't saved. Includes the `/account` foundation: route and tabs, app-bar navigation through `navigate()` (AD-26), skeleton, load-error and 403 states, the `/handoff/portal` route (AD-22), the page/route-level `ACCOUNT_DISABLED` kill switch (AD-20) and test rows verifying the Story 1.3 deny list against Profile templates (AD-2); each Profile allowlist entry lands in the story that first uses it.

**FRs covered:** FR101, FR102, FR103, FR104, FR105, FR106, FR107, FR108, FR109 · **Jira:** NG-9019

**Dependencies:** Epic 1 only (with the 2026-10-13 amendments to Stories 1.1–1.16 applied). Stories run in order: 7.1 → 7.2 → 7.3 (independent of 7.4–7.6) → 7.4 → 7.5 → 7.6; 7.2 depends only on 7.1.

---

### Story 7.1: Account page — route, tabs, deep links and states

**Jira:** [NG-9030](https://1hio.atlassian.net/browse/NG-9030)

*Amended 2026-10-14 (decisions D1, D4): no-session redirect goes to `/auth`; no `proxy.ts` `lpl` redirect; portal URL from the environment map.*
*Amended 2026-10-14 (decisions D5, D9): no session-binding embed and no `CSRF` code; the no-session screen is the `/auth` manual-entry card.*
*Foundation 2026-10-14: built in spec 7.0a + 7.0b-1 + 7.0b-2 — `requirePageSession()` (`lib/server/page-session.ts`), relaunch only to `/` (`consumeLaunchIntent`), `navigate()` with `{page}`, `{external:"portal"}` and `{external:"handoff",href}` + `useNavigate`/`CurrentPageProvider`, `AccountTab`/`ACCOUNT_TABS`/`isAccountTab`, `AppBar`/`PageNav`/`ReturnLink`, `ProfileHeader` (`features/header`), `PageTabs` + `components/ui/tabs.tsx`, `PageFrame` (own `SectionRegistryProvider`, `LeaveGuard`, `SessionDialog`, `IdleWarning`), `mapApiError`/`mapFetchError` (`@/lib/api`), `ReadStateFor`/`LoadError`/`NoAccess`, AD-26 lint bans. Use it; do not rebuild. Remaining for this story: `app/account/page.tsx` and `features/account/account-page.tsx` on `PageFrame` with `AccountTab` tabs and anchors (Team B); `StateFrame` skeleton variants and `forbidden-scope` in `features/shell`/`lib/api` (F3, replaces the planned `features/account/account-state-frame.tsx` and `features/account/forbidden-scope.ts`); account copy in `lib/shared/messages/account.ts` (F1).*
*Foundation 2026-10-14: built in spec F1 — the `/account` area files (`lib/server/proxy/allowlist/account.ts`, empty, for single-story `profile: true` entries; `lib/shared/messages/account.ts`; `lib/api/errors/account.ts`), `ErrorScope` incl. `authenticator|provider|organizations|page` for `mapApiError(scope, …)`, the complete `Myself` behind `keys.myself()`. Use it; do not rebuild. Remaining for this story: unchanged; page and tab copy goes in `lib/shared/messages/account.ts`. Area files (edit only these, never the `index.ts` aggregators): allowlist `lib/server/proxy/allowlist/account.ts`, copy `lib/shared/messages/account.ts`, errors `lib/api/errors/account.ts`.*
*Foundation 2026-10-14: built in spec F3-1 — `LoadError`/`ReadStateFor` on `InlineBanner` (copy unchanged, `inline-banner-error` + separate Retry), `TooltipProvider` in `app/layout.tsx` (covers `/account`), `focus-ring`. Callers of `LoadError`/`ReadStateFor` pass `attempt` (failure count) so a repeated failure is re-announced. Use it; do not rebuild. Remaining for this story: unchanged (Team B page; F3-3 `StateFrame` + `forbidden-scope`).*
*Foundation 2026-10-14: built in spec F3-3 — `StateFrame` in `features/shell/state-frame.tsx` replaces the planned `features/account/account-state-frame.tsx` (`level: "tab" | "section"`, `loadError: { kind: "page" }` → "Something went wrong while loading profile information", skeletons `kv` (4 rows), `tiles` (5 × 112 px), `bars` (2), `cards` (12, `ORG_GRID_CLASSES`), static under reduced motion; `session` → nothing; `forbidden` → `NoAccess({ level })` (tab = centred bordered panel, Section = one row); Retry calls only that frame's `onRetry`; pass `attempt` (`LoadError` re-announces per attempt)); `lib/api/errors/forbidden-scope.ts` replaces `features/account/forbidden-scope.ts`: `forbiddenScopeFor(path, "account")` → `{ owner, level } | null` (`contact-point/list` → `account-pickers` control; `mfa/*` + `pp/mfa/validate` → `authenticator` Section; `user/npi`, `public/npi/list`, `user/register/npi` → `provider` tab; `user/organization/portal` → `organizations` tab; `pp/practice-support` → `practice-popover`), table-tested, from `@/lib/api`; `ACCOUNT_ANCHORS` (`account`, `authenticator`) + `AccountAnchor` in `features/shell/anchors.ts`; `useHashAnchors(ACCOUNT_ANCHORS, { focusHeading: true })` (load, `hashchange`, same-page `navigate()` with a hash; unknown hashes ignored; `frameReady(id)` from each frame's `onReady`); `SectionLandmark({ id: "account" | "authenticator", title })` (`h2#<id>-heading`, `tabIndex=-1`); `PageTabs` `panelOptions`. Use it; do not rebuild. Remaining for this story: Team B: `app/account/page.tsx`, `features/account/account-page.tsx` on `PageFrame` with the three tabs, the two landmarks and placeholder frames, `useHashAnchors` only on the personal tab, per-tab lazy keys, page copy in `lib/shared/messages/account.ts`, and the tests (MSW lazy-load, organizations-key 403 leaves Personal Account working, Playwright).*

As a Launching user who wants to manage my account, provider registration or organizations,
I want an **Account** page I can reach from the app bar or a bookmark, with three deep-linkable tabs that each load only when opened and show loading, error and no-access states on their own,
So that I can find account settings without leaving the app, and one failing part never blocks the rest.

**Acceptance Criteria:**

**Given** `app/account/page.tsx` (server component)
**When** it is requested
**Then** it calls `requireSession()` itself and renders the client page `features/account/account-page.tsx` inside the root layout's single `SWRConfig` (AD-10); the no-store export is added by Story 7.2 (there is no session-binding embed, D5)
**And** with no session (no cookie, or a cookie that fails to unseal) it redirects to `/auth` exactly as `/` does (Story 1.2); there is no login form (FR102, AD-4, D1)
**And** a Playwright test opens `/account?tab=organizations` with a session and lands on that tab, and opens the same URL without a cookie and sees the `/auth` no-LPL screen (the D9 manual-entry card, or the Choose Environment card when no environment is known) (parity row 1).

**Given** a request to `/account` (any `tab`, any hash) whose query carries `lpl`
**When** the page handles it
**Then** `app/account/page.tsx` ignores `lpl` (no page but `/auth` reads it), `proxy.ts` does not redirect it, and no exchange happens (D1)
**And** a launch always lands on `/` (`/auth?lpl=…` → `POST /api/token` → `/`), never on `/account`; a launch in a non-default tenant ends on the `/auth` `WRONG_TENANT` screen with "This is available in your personal account. Switch to it in 1health and open it again." (AD-6, PA5) *(built: spec 7.0a + 7.0b-2)*
**And** a test covers `/account?lpl=x` with a session (renders the account page, no `/api/token` call) and without one (redirects to `/auth` with no query, so the `lpl` is dropped).

**Given** the shell module `features/shell/navigate.ts` (portal path from Story 1.7, page targets from Story 1.8; this story adds `AccountTab` typing and the `external: "handoff"` target)
**When** a caller runs `navigate(target)` with `target` = `{ page: "profile", tab?: ProfileTab, hash? } | { page: "account", tab?: AccountTab, hash? } | { external: "portal" | "handoff", href }`
**Then** it first runs the current page's leave guard (Story 1.13 three-way dialog "You have unsaved changes" · "Keep editing" / "Discard" / "Save") when the page's registry is dirty, and does nothing more if the user keeps editing *(built: spec 7.0b-2)*
**And** then `/` ↔ `/account` uses `router.push` with the URL built from the typed target (shared SWR cache kept, no full reload), `external: "portal"` runs the Return-to-1health path (AD-12 `drafts.purgeUser`, AD-16/D3 logout, same-tab `location.assign(portalUrl)` with the `portalUrl` embedded for the session's environment, D4), and `external: "handoff"` runs only same-tab `location.assign(href)` (no logout, drafts kept; Story 7.3)
**And** `ProfileTab` = `contacts|insurance|medical` and `AccountTab` = `personal|provider|organizations` are exported typed enums (AD-7) *(built: spec 7.0b-2)*
**And** the Story 1.1 ESLint rules fail on `next/link` or a raw `<a href>` targeting `/`, `/account`, `/handoff/**` or a `portalUrl` from `lib/shared/environments.ts` outside `features/shell`, and on `NextResponse.redirect` in `app/handoff/**` (AD-26, AD-4, D1); a lint fixture test proves each rule fires for the `/account` and `/handoff/**` targets *(built: spec 7.0a)*
**And** unit tests cover: guard cancel stops navigation, Discard then navigate, Save then navigate, Save with `{ok:false}` stays on the page, and `external:"handoff"` never calls `/api/session/logout` or `drafts.purgeUser`.

**Given** the app bar page nav built in Story 1.8, on `/` and on `/account` (this story verifies it against the real `/account` page)
**When** it renders
**Then** after the wordmark and a 1 px rule it shows `<nav aria-label="Pages">` with two 44 px text items "Personal Profile" and "Account" (`app-nav-item`, section-title type, muted foreground, accent hover, `rounded-md`); the current page's item is `app-nav-item-active` (foreground 600, 2 px primary bottom indicator) with `aria-current="page"`; the old bar title "Personal Profile" is gone (UX-DR-P2, FR102)
**And** "Return to 1health" always renders (never framed, PRC3) and calls `navigate({ external: "portal" })` *(built: spec 7.0b-2)*
**And** selecting the current page's item does nothing (no navigation, no guard, no request); selecting the other item calls `navigate({ page })`, which opens `/account?tab=personal` or `/?tab=contacts` *(built: spec 7.0b-2)*
**And** with a dirty Section on the current page, selecting the other item opens the leave guard first (Playwright: dirty Personal information on `/` → Account → "Keep editing" stays, "Discard" moves)
**And** below 768 px the two items render as a compact segmented control in the bar with 44 px targets, wrapping onto a second row under the wordmark below 400 px *(built: spec 7.0b-2)*
**And** an MSW test proves `/` → Account → Personal Profile issues no second `GET v2/user/myself` while the cached value is fresh (one cache, PNFR3).

**Given** `/account` at ≥ 768 px
**When** it renders
**Then** the order is app bar (Account active) → the same profile header component as `/` (Story 1.9) → tab strip → single-column main with 24 px padding; there is no Section menu, no Jump to, and no Save all bar or pill (AD-8, UX-DR-P3)
**And** `/account` mounts its own `SectionRegistry` (AD-7); the leave guard, dirty state and draft restore are scoped to it.

**Given** the tab strip (shadcn Tabs from Story 1.8)
**When** it renders
**Then** it shows three tabs "Personal Account", "Individual Provider Registration", "My Organizations" with `role="tablist"`, `role="tab"` + `aria-selected`, and `role="tabpanel"` linked by `aria-controls`/`aria-labelledby`, styled with the `tab` tokens and no "Soon" tag
**And** Left/Right move focus (wrapping), Home/End jump to first/last, Enter or Space activates (manual activation) (FR101). *(built: spec 7.0b-2)*

**Given** a URL `/account?tab=<value>`
**When** the page loads
**Then** `personal`, `provider` and `organizations` open that tab; a missing or unknown value (e.g. `?tab=PERSONAL`, `?tab=mfa`, repeated `tab`) opens Personal Account and the URL is normalized to `?tab=personal` with a replace (AD-7)
**And** activating a tab updates `?tab=` via replace (no extra history entry, no scroll jump), drops the hash, and goes through the leave guard when the `account` Section is dirty
**And** a refresh of `/account?tab=provider` reopens Individual Provider Registration (Playwright).

**Given** a deep link `/account?tab=personal#account` or `#authenticator`
**When** the page loads or `hashchange` fires
**Then** the page scrolls to that Section container (smooth, instant under `prefers-reduced-motion`) and focus moves to its `h2` (`tabIndex={-1}`) *(hook built: spec F3-3, `useHashAnchors(ACCOUNT_ANCHORS, { focusHeading: true })`; wiring Team B)*
**And** an unknown hash, or `#account`/`#authenticator` on the provider or organizations tab, leaves the page at the top of the tab without error (UX-DR-P30). *(hook built: spec F3-3; wiring Team B)*

**Given** the Personal Account tab before Stories 7.4 and Epic 8 fill it
**When** it renders
**Then** it holds two containers in order: Section `account` (an `aria-labelledby` region, `h2` "Personal account settings") and anchor `authenticator` (`h2` "Authenticator app", not a registry Section)
**And** the provider and organizations tabs each hold one placeholder container with the shared states below, ready for Epics 9 and 10.

**Given** a tab is opened
**When** its content is loading
**Then** app bar, header and tab strip render immediately and only the opened tab's SWR keys load; an MSW test proves opening `?tab=personal` issues no `v2/user/npi` or `v2/user/organization/portal` request and that the other tabs' keys load only when their tab is first opened (PNFR3, AD-10)
**And** `features/account/account-state-frame.tsx` provides the skeleton variants from UX-DR-P27: key/value (4 rows), five 112 px tile placeholders, two input-height bars, 12 card placeholders in the grid's column count; shimmer is static under reduced motion. *(built: spec F3-3 as `StateFrame` in `features/shell/state-frame.tsx`; no `features/account/account-state-frame.tsx`)*

**Given** a tab or Section read fails with anything other than an upstream 403
**When** the state frame renders the error
**Then** it shows `inline-banner-error` "Something went wrong while loading profile information" with a "Retry" button in that tab or Section only, never an empty form (copy §D, FR103) *(built: spec F3-3, `loadError: { kind: "page" }`)*
**And** Retry revalidates only that tab's or Section's keys; a component test proves an error in one frame leaves the others unchanged (PNFR11) *(built: spec F3-3, `state-frame.test.tsx`)*
**And** proxy-originated `NOT_ALLOWED` (body `source:"proxy"`) shows this generic error with Retry, never "no access" (AD-19; there is no `CSRF` code, D5) *(built: spec 7.0b-1)*
**And** for action errors (saves) `lib/api/errors.ts` exposes the error rule: show the platform `message` for any 4xx/5xx that has one, otherwise the generic error. *(built: spec 7.0b-1)*

**Given** a read answers an upstream 403 (status 403 without `source:"proxy"`, mapped to `FORBIDDEN`)
**When** the state frame renders it
**Then** it shows the `no-access-panel` with a 20 px lock icon and "You don't have access to this in your current account", no action, no raw error (UX-DR-P26) *(built: spec 7.0b-1)*
**And** the scope follows the AD-23 owner table, encoded once in `features/account/forbidden-scope.ts`: `contact-point/list` → the Account Section's email/phone pickers only; `mfa/*`, `/api/pp/mfa/validate` → Authenticator app card (Section-level row); `user/npi`, `public/npi/list`, `user/register/npi` → Provider tab (tab-level panel); `user/organization/portal` → Organizations tab (tab-level panel); `/api/pp/practice-support` → Practice-name popover only *(built: spec F3-3 in `lib/api/errors/forbidden-scope.ts#forbiddenScopeFor(path, "account")`, not `features/account`)*
**And** a table-driven unit test asserts each row's scope, and a component test proves a 403 on the organizations key leaves Personal Account working. *(table test built: spec F3-3; the organizations-key component test stays Team B)*

**Given** page copy
**When** it renders
**Then** tab labels, "Pages", "Personal Profile", "Account", the load-error text, "Retry" and the no-access text come from `lib/shared/messages.ts` verbatim (copy §D, V&T), and the V&T verbatim test covers them (PNFR6).

**Covers:** FR101, FR102, FR103, PNFR3, PNFR6, PNFR11, AD-4, AD-5, AD-6, AD-7, AD-8, AD-10, AD-19, AD-23 (403 owner table), AD-26, PRC1, PRC2, PRC4, PA5 · UX-DR-P2, UX-DR-P3 (layout), UX-DR-P26, UX-DR-P27, UX-DR-P28 (load error), UX-DR-P30 · Parity §E rows 1, 13 · **Jira:** NG-9019

---

### Story 7.2: Account page hardening — denies, kill switch, headers, mobile and accessibility

**Jira:** [NG-9031](https://1hio.atlassian.net/browse/NG-9031)

As a Launching user who relies on the Account page for sensitive settings,
I want the page to block every unsafe platform call, be switchable off in an emergency, be served with strict security headers, and work on a phone and with a keyboard or screen reader,
So that my account stays safe and I can use the page whatever device or assistive technology I use.

**Depends on:** Story 7.1 only.

*Amended 2026-10-14 (decision D5): no session-binding embed.*
*Foundation 2026-10-14: built in spec 7.0a + 7.0b-2 — deny list, `profile: true` tag and proxy-level `ACCOUNT_DISABLED` 503 (`lib/server/proxy/*`), AD-21/AD-18 headers and the header e2e that already requests `/account`, `requirePageSession()` for the `portalUrl` embed, app-bar tab order and axe harness (`e2e/shell.spec.ts`). Use it; do not rebuild. Remaining for this story: F2: the page/route-level kill switch in root `proxy.ts` + disabled screen; Team B: Profile-template deny/traversal rows, `/account` no-store test, mobile and keyboard/axe runs on the real `/account`.*
*Foundation 2026-10-14: built in spec F2 — the page/route-level `ACCOUNT_DISABLED` kill switch: `lib/server/kill-switch.ts#killSwitchFor` (`"account"` for `/account`, `/handoff`, `/api/pp/mfa`, `/api/pp/org-logo`, `/api/pp/practice-support`) applied first in root `proxy.ts` (API → 503 `SERVICE_DISABLED`; pages/RSC/prefetch → `app/disabled/route.ts` 503 disabled screen with AD-21 + no-store + `Retry-After`), with the named ops' own `"account"` switch as a second layer, and the matrix in `kill-switch.test.ts` + `e2e/kill-switch.spec.ts` (`/account`, `/account?tab=provider`, `/handoff/portal` and the three `/api/pp/*` families → 503; `/auth`, `/` and the Personal Profile named ops keep working; switch off → `/disabled` 404). Use it; do not rebuild. Remaining for this story: Team B: the `/account` no-store test (after Story 7.1 adds the page), the Profile-template deny and traversal rows, the AD-21/AD-18 header assertions on the real `/account` (its 503 headers are already asserted in the kill-switch e2e), the 360 px mobile run and the keyboard/axe pass on every `/account` tab.*

**Acceptance Criteria:**

**Given** `app/account/page.tsx` from Story 7.1
**When** it is requested
**Then** it embeds `portalUrl` exactly like `app/page.tsx` (Story 1.4; no `sessionBinding`, D5) and exports `dynamic = "force-dynamic"` (AD-18)
**And** a test asserts that the page response is never cached (AD-18).

**Given** the deny list, the `profile: true` tag and the proxy-level `ACCOUNT_DISABLED` rule owned by Story 1.3 *(ownership decided 2026-10-14; this story does not redefine them)*
**When** the proxy table test runs against the Profile templates
**Then** the Story 1.3 deny list blocks the AD-2 deny rows and traversal rows listed below
**And** the Profile passthrough entries are **not** added here: each lands, with its query/body rules and proxy table rows, in the story that first uses it (AD-2): `POST v2/user/time-zone`, `POST v2/user/locale` and the `PUT v2/user/edit` `locale` rejection in Story 7.5; the `PUT v2/user/edit` `email`/`phoneNumber`/`phoneNumberRegion` acceptance in Story 7.6 (`contact-point/list` with `type` `Email|Mobile|Landline` already exists from Story 1.9); `POST v2/mfa/enable/totp` in Story 8.2; `POST v2/mfa/disable/totp` in Story 8.3; `GET v2/user/npi` and `GET v2/public/npi/list` in Story 9.1; `GET v2/health/npi/<n>/is-registered` and `POST v2/user/register/npi` in Story 9.2; `GET v2/user/organization/portal` in Story 10.1; the existing `GET v2/file/<n>/download` `asImage` entry is reused as is (Story 1.3 forces `preview=true`)
**And** the proxy table test includes the AD-2 deny rows (`POST v2/mfa/enable` → 403; `POST v2/mfa/enable/123` → 403; `GET v2/mfa/validate/123` → 403), plus: `GET v2/mfa/validate?code=123456` → 403 `NOT_ALLOWED`; `GET v2/user/switch-tenant/5` → 403; `POST v2/user/update-password` → 403; `GET v2/tenant/sys-config` → 403 (the allow rows for `POST v2/mfa/enable/totp` and `POST v2/mfa/disable/totp` land in Stories 8.2 and 8.3)
**And** the traversal rows run against the Profile templates and all return 400/403: `v2/user/..%2Fmfa/enable`, `v2/mfa/enable/totp/..`, `v2/mfa/%2e%2e/validate/1`, `v2/user/%252Fswitch-tenant/1`, `//evil.example/v2/user/npi`, `v2/user/npi;x`, `v2/user/npi/`, `v2/MFA/enable/totp`.

**Given** `ACCOUNT_DISABLED=1` in the deployment env (read only via `lib/server/env.ts`)
**When** a request hits `/account`, `/handoff/**`, `/api/pp/mfa/**`, `/api/pp/org-logo/**` or `/api/pp/practice-support/**` (the page- and route-level part of the kill switch; the proxy-level part for `profile: true` entries is Story 1.3's)
**Then** it answers 503 `{errorCode:"SERVICE_DISABLED", source:"proxy"}` (pages render the Story 1.16 disabled screen (`features/shell/disabled-screen.tsx`) with status 503; there is no `/launch-error`, D1) before any upstream call, enforced centrally in `proxy.ts` so routes added later inherit it (AD-20, PNFR8) *(built: spec F2; the screen is `app/disabled/route.ts`)*
**And** `/`, `GET v2/user/myself`, `contact-point/list`, `user/edit` and the Contacts entries keep working *(built: spec F2)*
**And** a test runs the matrix with the flag on and off. *(built: spec F2)*

**Given** the header and cache test suites (Story 1.1/1.3)
**When** they run
**Then** `/account` carries the AD-21 set (nonce CSP with `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin`, HSTS, `nosniff`, `Referrer-Policy: no-referrer`, Permissions-Policy) and the AD-18 set (`Cache-Control: private, no-store, max-age=0`, `Pragma: no-cache`, `Vary: Cookie`), including on its redirect and 503 responses.

**Given** a 360 × 740 viewport (Playwright mobile project)
**When** each `/account` tab opens
**Then** `scrollWidth <= clientWidth` (no horizontal page scroll), gutters are 16 px, the header shows avatar + name only, the tab strip scrolls horizontally inside itself, the selected tab is scrolled into view, every tab stays reachable by arrow keys, and every control (page nav, tabs, Retry, Return to 1health) is at least 44 × 44 px (UX-DR-P3, UX-DR-P31).

**Given** keyboard-only use
**When** the user tabs through `/account`
**Then** the order is page nav (Personal Profile, Account) → Return to 1health → header → tabs → active tab content in reading order (UX-DR-P29); the "1health" wordmark is a non-interactive `span` in `primary-text` and is never focused (the Playwright Tab-sequence test asserts it is skipped); every control shows the focus ring, and an `@axe-core/playwright` scan of each tab and of the error and no-access states, light and dark, desktop and 360 px, reports no WCAG 2.1 AA violations (PNFR2).

**Covers:** PNFR1, PNFR2, PNFR4, PNFR8, PNFR9, AD-2 (deny rows verified against Profile templates; definition in Story 1.3), AD-17 (as superseded by D5: 415 JSON check only), AD-18, AD-20, AD-21, PRC3 · UX-DR-P3 (mobile), UX-DR-P29, UX-DR-P31 · **Jira:** NG-9019

---

### Story 7.3: Portal hand-off route

**Jira:** [NG-9032](https://1hio.atlassian.net/browse/NG-9032)

*Amended 2026-10-14 (decision D4): the portal URL comes from `lib/shared/environments.ts` for an environment resolved from the session, else the `onehealth_environment` cookie, else `prod`; there is no `PORTAL_URL` env var.*
*Foundation 2026-10-14: built in spec 7.0b-2 — `navigate({ external: "handoff", href })` in `features/shell/navigate.ts` (leave guard, then same-tab `location.assign`, no logout, no before-exit callbacks; unit-tested), `seeOther()` (7.0a, `lib/server/http/responses.ts`). Use it; do not rebuild. Remaining for this story: `app/handoff/portal/route.ts`, `lib/server/handoff.ts`, `features/shell/handoff.ts#handoffHref` (Team B, before Epics 9/10); `ACCOUNT_DISABLED` 503 via the F2 matcher.*

As a 1health user who works in several organizations,
I want every "go to the portal" action in the app to go through one safe server route,
So that leaving to an organization's portal always works the same way and safely.

**Acceptance Criteria:**

**Given** `app/handoff/portal/route.ts` (GET only, `dynamic = "force-dynamic"`)
**When** it receives `?to=tenant&tenantId=<n>` with `n` matching `^\d{1,19}$`
**Then** it answers `seeOther()` (303, absolute `Location`, from `lib/server/http.ts`) to the tenant URL built by `buildTenantPortalUrl(env, n)` in `lib/server/handoff.ts`, from the resolved environment's `portalUrl` (`lib/shared/environments.ts`) plus the numeric id only (AD-22)
**And** `lib/server/handoff.ts#resolveHandoffEnvironment(request)` picks the environment from the session's `environment` when `__Host-pp_s` unseals (read-only: no refresh, no `lastSeen` update, no `Set-Cookie`), else the `onehealth_environment` cookie when it is exactly `demo` or `prod`, else `prod`; it never reads the environment from a query parameter or header (D4)
**And** the tenant URL shape lives only in that module behind the constant `TENANT_HANDOFF_SHAPE`: `"root"` → `portalUrl` and `"ctx"` → `<portalUrl>/?ctx=<n>` (candidate A4). Decided 2026-10-13: the default is `"root"` (tenant hand-off goes to the `portalUrl` root, fallback R-A) until OQ1 is answered; switching to `?ctx=<tenantId>` changes only this one constant, and both shapes are unit tested (PNFR10)
**And** the URL is never built from response data (`subdomain`, `tenantLogo`, org names) or from any other request input.

**Given** `?to=create-org`
**When** the route handles it
**Then** it answers 303 to `<portalUrl origin>/organizations/create` for the resolved environment (addendum §C).

**Given** invalid input
**When** the request is any of: no `to`; `to` not in `tenant|create-org` (case-sensitive); `to=tenant` with `tenantId` missing, empty, non-digit, negative, signed (`+5`), decimal, 20+ digits, percent-encoded or repeated; `tenantId=1@evil.example`, `tenantId=//evil.example`, CR/LF in a value; or a repeated `to`
**Then** it answers 303 to the resolved environment's `portalUrl` and nothing else (no error page, no echo of the input)
**And** extra query params are ignored and never forwarded; the emitted `Location` carries no query other than the shape's own `ctx`, never `assume`, and no fragment (AD-22).

**Given** the route is session-less by design
**When** it is called with no cookie, an expired cookie or a valid one
**Then** it behaves the same apart from the environment resolution above, does not call `requireSession()`, makes no upstream or `/api/session/*` call, sets no cookie and leaves `__Host-pp_s` untouched (no logout, AD-16; drafts kept, AD-12)
**And** `proxy.ts` exempts `/handoff/**` from the no-session redirect, and a test proves a cookie-less request gets the 303 and not a redirect to `/auth`.

**Given** other methods
**When** `POST`, `PUT`, `DELETE` or `HEAD` hits `/handoff/portal`
**Then** the answer is 405 with no `Location`; GET has no side effects (AD-17).

**Given** any `/handoff/portal` response (303 or 405)
**When** the header test runs
**Then** it carries the AD-21 headers (incl. `frame-ancestors 'none'`, `X-Frame-Options: DENY`) and the AD-18 no-store headers, and `ACCOUNT_DISABLED=1` makes it 503 `{errorCode:"SERVICE_DISABLED", source:"proxy"}` (Story 7.2 kill switch)
**And** server logs record only method, route template, status, duration and request id, never the query string (AD-15).

**Given** the client helper `features/shell/handoff.ts`
**When** a feature calls `handoffHref({ to: "tenant", tenantId })` or `handoffHref({ to: "create-org" })`
**Then** it returns `/handoff/portal?to=tenant&tenantId=<n>` (tenantId must be a safe positive integer, else it throws in development and returns plain `/handoff/portal` in production, which the route sends to the resolved `portalUrl`) or `/handoff/portal?to=create-org`
**And** callers pass the result to `navigate({ external: "handoff", href })`, which runs the leave guard and then a same-tab `location.assign(href)`; there is no `window.open`, `target=_blank` or framed branch (AD-5, AD-26, PM11) *(built: spec 7.0b-2)*
**And** a component test with a dirty `account` Section shows the leave guard before navigating, and "Keep editing" cancels the hand-off.

**Given** the switch-tenant rule
**When** the codebase is checked
**Then** no module references `v2/user/switch-tenant` (CI grep), and the Story 1.3 proxy deny (verified by the Story 7.2 test rows) stays in place (AD-22, R7).

**Given** route unit tests (Vitest, request objects against the handler)
**When** they run
**Then** they cover both tenant shapes, create-org, every invalid row above, open-redirect attempts, cookie-less and cookied requests, 405, and that `NextResponse.redirect` is not used (lint)
**And** environment rows: demo session → demo portal; prod session → prod portal; no session + `onehealth_environment=demo` → demo portal; no session + no cookie or an invalid cookie value → prod portal; a `?env=demo` (or any) query param never changes the target (D4).

**Covers:** FR120 (route), FR116/FR119 (hand-off transport), PNFR8, PNFR10, AD-4 (`seeOther`), AD-5, AD-15, AD-16, AD-17 (as superseded by D5: 415 JSON check only), AD-18, AD-20, AD-21, AD-22, AD-26, PRC12, D4 · UX-DR-P25 (transport) · **Jira:** NG-9019

---

### Story 7.4: View Personal account settings

**Jira:** [NG-9033](https://1hio.atlassian.net/browse/NG-9033)
*Foundation 2026-10-14: built in spec F1 — `lib/api/myself.ts` complete (every field incl. `username`, `email`, `phoneNumber`, `birthDate`, `roles`, `preferredLanguage`, `timeZone`, `locale`; `toMyself`, `fetchMyself`, `loadMyself`, `isProctor`; no `phoneNumberRegion`), so this story neither creates nor extends it; `lib/api/contact-points.ts#primaryPhoneRegion(mobileRows, myself)` (Primary Mobile row, or the row equal to `myself.phoneNumber`; default `"us"`), `lib/shared/phone.ts#formatPhoneDisplay(value, region)`, `lib/shared/person-rules.ts` (`birthDateAgeRange`, `isBirthDateInRange`), `lib/shared/dates.ts` (`wireToDisplayDate`, `parseWireDate`, `localCalendarDate`). Use it; do not rebuild. Remaining for this story: `lib/shared/time-zones.ts`, `features/account/view-model.ts#toAccountView`, the read Section (F3 key/value table and `StateFrame`). Area files (edit only these, never the `index.ts` aggregators): allowlist `lib/server/proxy/allowlist/account.ts`, copy `lib/shared/messages/account.ts`, errors `lib/api/errors/account.ts`.*
*Foundation 2026-10-14: built in spec F3-2 / F3-3 — `KeyValueTable` (four columns desktop / one pair per row mobile, "Not provided"), `SectionLandmark({ id: "account", title: "Personal account settings" })` + `SectionContainer`, `StateFrame` (`skeleton="kv"`, `loadError: { kind: "page" }`, `level="section"`, `onRetry` revalidating only `keys.myself()`, `attempt`; a 403 on `myself` → Section-level `NoAccess`). Use it; do not rebuild. Remaining for this story: unchanged (`lib/shared/time-zones.ts`, `features/account/view-model.ts#toAccountView`, the read Section; area files as above).*

As a Launching user checking my account,
I want to see my name, username, sign-in email and phone, birth date and regional preferences in one table,
So that I can confirm at a glance what 1health has on file and spot what's missing.

**Acceptance Criteria:**

**Given** the Personal Account tab (Story 7.1) and the `account` Section container
**When** it renders
**Then** the Section header shows `h2` "Personal account settings" (D-UX3) in the section-title role, focusable via `tabIndex={-1}`, and the body is a key/value table in the shared table container (FR104, UX-DR-P6)
**And** the data comes only from `keys.myself()` = `["pp","myself"]` through the shared fetcher; when `/` already loaded a fresh `myself`, no new request is made (MSW test, AD-10, PNFR3)
**And** this read view makes no `contact-point/list` request.

**Given** the read view at ≥ 768 px
**When** it renders
**Then** it is four columns, key | value | key | value, filled row by row in this order: First name · Last name / Username · Password / Primary email address · Primary phone number / Birth date · Preferred language / Default time zone · Preferred locale for date, time, and currency (PM2)
**And** labels are verbatim V&T: "First name", "Last name", "Username", "Password", "Primary email address", "Primary phone number", "Birth date", "Preferred language", "Default time zone", "Preferred locale for date, time, and currency" (PM1)
**And** each key is a `th scope="row"` paired with its value `td`, so a screen reader announces label then value; the long locale label wraps inside its key cell without widening the table.

**Given** the read view below 768 px
**When** it renders
**Then** each row holds one Field | Value pair in the same order, and there is no horizontal scroll at 360 px (UX-DR-P31).

**Given** `lib/shared/time-zones.ts`, created in this story (first use)
**When** it is imported
**Then** it exports the six time zones in this order with labels: `Pacific/Honolulu` "Hawaiian", `America/Anchorage` "Alaska", `America/Los_Angeles` "Pacific", `America/Denver` "Mountain", `America/Chicago` "Central", `America/New_York` "Eastern" (addendum §B); Story 7.5 reuses it for the Select options and the `POST v2/user/time-zone` allowlist rule.

**Given** `lib/api/myself.ts`, created in this story as the Profile module's `myself` domain module on top of Story 1.4's `fetchMyself()` (same `["pp","myself"]` key, no second fetcher)
**When** it maps the payload
**Then** it exposes the fields this story reads (`firstName`, `lastName`, `username`, `email`, `phoneNumber`, `birthDate`, `roles`, `preferredLanguage`, `timeZone`, `locale`); Stories 8.1 and 9.3 extend it with the fields they need. *(Amended 2026-10-14, validated against agents.md + backend: `myself` has no `phoneNumberRegion`; the region comes from the `GET v2/user/contact-point/list` row of type `Mobile` labelled `Primary` (or whose `value` equals `myself.phoneNumber`), falling back to `"us"` when empty or `"n/a"`.)* *(built: spec F1)*

**Given** a `myself` payload
**When** values are mapped by `toAccountView(myself)` in `features/account/view-model.ts`
**Then** First name, Last name and Username show as stored (trimmed); Password always shows `********` in mono-value, whatever the payload (FR106)
**And** Primary email address is `myself.email` and Primary phone number is `myself.phoneNumber` with the region of its Primary Mobile contact-point row (default `"us"`), formatted with the shared Contacts display formatter `formatPhoneDisplay(value, region)` in `lib/shared/` (US `+1 (415) 551-2125`, other countries libphonenumber-js international format), created here if Story 3.1 hasn't already; Story 3.1 reuses it
**And** Birth date `yyyy-MM-dd` displays as `MM/DD/YYYY`
**And** Preferred language `en` shows "English"; Default time zone shows its `lib/shared/time-zones.ts` label (e.g. `America/Chicago` → "Central"); Preferred locale `en-US` shows "English - United States"
**And** a stored language, time zone or locale not on the lists shows its known label, else the raw code (e.g. `Europe/Paris` → "Europe/Paris") (FR108).

**Given** empty or unusable values
**When** they map
**Then** "Not provided" (muted) shows for: `null`, missing, empty string or `"n/a"` in any field; a birth date the platform withholds; an unparsable birth date; and a birth date whose age (whole years at today's local date) is outside 18–120, or 21–120 when `myself.roles` includes Proctor (PM3, FR104)
**And** the age check uses `lib/shared/person-rules.ts` (`birthDateAgeRange(roles)` and `isBirthDateInRange(date, roles, today)`), created here if Story 2.2 hasn't already; no other module re-implements it (AD-11)
**And** Preferred locale never shows "Not provided": empty shows "English - United States" (FR108).

**Given** the Section is loading or fails
**When** the state frame (Story 7.1) renders
**Then** loading shows the key/value skeleton with 4 rows inside the real container; a non-403 failure shows "Something went wrong while loading profile information" + Retry, which revalidates only `myself`; an upstream 403 on `myself` shows the Section-level no-access row; none of these affect the Authenticator app container (FR103, PNFR11).

**Given** shared keys
**When** `myself` changes elsewhere (e.g. a Personal information save on `/` mutates `["pp","myself"]`)
**Then** the read view shows the new values on its next render without a reload.

**Given** tests
**When** they run
**Then** Vitest covers `toAccountView` for every field, each "Not provided" case, the Proctor branch at the 18/21 boundaries, unknown regional codes, and the phone format; a component test checks row-major order and `th`/`td` pairing; Playwright parity row 2 checks all 10 fields in order with empty and unknown values at desktop and 360 px, and axe reports no violations.

**Covers:** FR104, FR106 (read), FR108 (display), FR103 (Section states), PNFR2, PNFR3, PNFR4, PNFR6, AD-10, AD-11 · UX-DR-P6, UX-DR-P27, UX-DR-P33 (PM1–PM3), UX-DR-P34 (D-UX3) · Parity §E row 2 (also creates `lib/shared/time-zones.ts`, `lib/api/myself.ts`) · **Jira:** NG-9019

---

### Story 7.5: Edit names, birth date and regional preferences

**Jira:** [NG-9034](https://1hio.atlassian.net/browse/NG-9034)

*Foundation 2026-10-14: built in spec 7.0b-2 — `useRegisterSection` with `SectionId` `account`, `SaveResult` with `failedParts` (`AccountSavePart`), the per-page registry and leave guard in `PageFrame`. Use it; do not rebuild. Remaining for this story: edit primitives, `runSaveSteps({mode:"attemptAll"})` and toasts (F3), `lib/shared/{person-rules,dates}` and the full `PUT v2/user/edit` schema (F1), drafts (F4), Select/date inputs (F5), the Section itself (Team B).*
*Foundation 2026-10-14: built in spec F1 — `lib/shared/person-rules.ts` (names 1–24 after trim, printable only; age range incl. Proctor) + `PERSON_MESSAGES` ("Birth date is required", "Enter a date as MM/DD/YYYY", the `ageRange` template), `lib/shared/dates.ts` (`parseDisplayDate` rejects `02/30/1990` and `13/01/1990`; `displayToWireDate`; `minusYears` for the calendar bounds), the full `PUT v2/user/edit` schema (already rejects `locale`, with a table row), the `updateAccount` and zod-literal lint rules, `mutateMyself()` / `mutateContactPoints(...)`, `mapApiError("account", …)`. Use it; do not rebuild. Remaining for this story: `lib/api/account.ts` (`updateAccount`, `setTimeZone`, `setLocale`), the `POST v2/user/time-zone` and `POST v2/user/locale` entries (`profile: true`) in `lib/server/proxy/allowlist/account.ts`, the Section (F3 kit, F4 drafts, F5 inputs). Area files (edit only these, never the `index.ts` aggregators): allowlist `lib/server/proxy/allowlist/account.ts`, copy `lib/shared/messages/account.ts`, errors `lib/api/errors/account.ts`.*
*Foundation 2026-10-14: built in spec F3-1 — `InputLocked({ value, help })` for Username and `********` Password (`readOnly` + `aria-readonly` and focusable rather than `disabled`, the F3 split decision), `InfoIconButton({ "aria-label": "About birth date" })` (`components/ui/info-icon-button.tsx`, 44 px, 18 px `CircleHelp`, `forwardRef`; built here, not in this story) as the `FormField` `labelAddon`, opening `Tooltip wide` (max 320 px, wraps), `FormField`/`FieldError` + `Input`, `Select` for language, time zone and locale (placeholder and unlisted-value handling stay with the story), `Button` `busy`/`busyLabel` for Save, `toastSuccess("Personal account updated successfully")`, `InlineBanner variant="error" focusable` for the per-part failure lines. Use it; do not rebuild. Remaining for this story: unchanged (F3-2 kit + `runSaveSteps({mode:"attemptAll"})`, F4 drafts, F5 date input; Team B `lib/api/account.ts`, the two entries, the Section; copy in `lib/shared/messages/account.ts`).*
*Foundation 2026-10-14: built in spec F3-2 — `useSectionForm` with `id: "account"`, `cancelFocus: "edit"` (Cancel returns focus to "Edit" via `editButtonProps`), `onNoChanges: "status"` ("There are no changes" polite status in the footer, stays in edit), `successToast: "Personal account updated successfully"` (success focuses the `h2`), `describeError` building one line per `failedParts` entry ("{Part} was not saved. {platform message}"), `errorFields` for field-mapped upstream errors, `draftFields` (never `username`/`password`); `save` runs `runSaveSteps([details, timeZone, locale], { scope: "account", mode: "attemptAll", refetch, rebase })` and returns `{ ok: false, error: { code, mapped, failedParts } }` on failure (a session error stops at once); `KeyValueEditTable`, `SectionFooter`; `saveAll` stays default (there is no Save all on `/account`). Use it; do not rebuild. Remaining for this story: unchanged (F4 drafts, F5 date input; Team B `lib/api/account.ts`, the two entries, the Section; copy in `lib/shared/messages/account.ts`).*

As a Launching user whose account details are wrong or incomplete,
I want to edit my name, birth date, language, time zone and locale in place and be told exactly which part failed if a save goes wrong,
So that my account is correct without guessing what was saved.

**Acceptance Criteria:**

**Given** the endpoints this story first uses
**When** it is done
**Then** the proxy allowlist gains, tagged `profile: true` (Story 1.3 tag and proxy-level `ACCOUNT_DISABLED` 503), `POST v2/user/time-zone` (`timeZone` ∈ the six ids of `lib/shared/time-zones.ts`, required) and `POST v2/user/locale` (`locale` = `en-US` only, required), and the existing `PUT v2/user/edit` body schema rejects `locale` → 400 (AD-2, backend R2)
**And** the proxy table test adds: `POST v2/user/time-zone?timeZone=Europe/Paris` → 400; `POST v2/user/locale?locale=en-us` → 400; `PUT v2/user/edit` with `locale` in the body → 400; both new entries → 503 with `ACCOUNT_DISABLED=1`.

**Given** the read view from Story 7.4
**When** the Section mounts
**Then** it registers through `useRegisterSection({ id: "account", label: "Personal account settings", displayOrder: 1, form, validate, save, discard, draftFields })` in `/account`'s registry (`SectionId` gains `account`); it is the only registry Section on `/account` (AD-7)
**And** the header shows an "Edit" button.

**Given** I activate "Edit"
**When** edit view opens
**Then** the Section switches in place: primary border with the 3 px accent halo, header muted "Editing", focus on First name
**And** it is a Field | Value table (controls capped at 480 px; label above a full-width control below 768 px) in the read order: First name, Last name, Username, Password, Primary email address, Primary phone number, Birth date, Preferred language, Default time zone, Preferred locale for date, time, and currency
**And** in this story Primary email address and Primary phone number render as read-only values (Story 7.6 turns them into Selects)
**And** the table footer shows "Unsaved changes" (warning dot, polite live region) after the first change, with Cancel (secondary) and Save (primary); there is no Save all (UX-DR-P7, PM4).

**Given** Username and Password in edit view
**When** they render
**Then** they are `input-locked` (disabled) controls showing the username and `********`, with help "Your username can't be changed here." and "Password changes aren't available here." (D-UX4; no "yet") *(component built: spec F3-1 as `InputLocked`, `readOnly` + `aria-readonly` and focusable instead of `disabled`, per the F3 split decision)*
**And** neither is ever in a request body; `v2/user/update-password` stays denied (FR106, PRC5).

**Given** First name and Last name
**When** I leave the field or press Save
**Then** values are trimmed, then validated with the shared rule from `lib/shared/person-rules.ts` (1–24 characters after trim, AD-11, PA4), added to that file here if Story 2.2 hasn't already
**And** empty shows "First name is required" / "Last name is required"; over 24 shows "First name can be up to 24 characters" / "Last name can be up to 24 characters" (copy §D)
**And** `features/account/schema.ts` (zod 4, one `useForm` with `zodResolver`) imports the rule; it doesn't redefine it.

**Given** the Birth date control (masked `MM/DD/YYYY` input with a trailing calendar button, sent as `YYYY-MM-DD`)
**When** I leave it or press Save
**Then** empty shows "Birth date is required"; an incomplete or impossible date (e.g. `02/30/1990`, `13/01/1990`) shows "Enter a date as MM/DD/YYYY"; a date giving an age outside 18–120 (21–120 when `myself.roles` includes Proctor), including any future date, shows "You must be between 18 and 120 years old" / "You must be between 21 and 120 years old"
**And** the calendar picker only allows dates from today − 120 years to today − 18 (or − 21) years
**And** a stored birth date that fails the rule is prefilled as stored and must be fixed before Save; a withheld one starts empty
**And** boundary tests pass: 18th birthday today valid, one day short invalid, age 120 valid, 121 invalid, same at 21 for Proctor, a Feb 29 birthday on non-leap years (FR105).

**Given** edit view only
**When** the Birth date label renders
**Then** an `info-icon-button` "?" named "About birth date" (`components/ui/info-icon-button.tsx`, created in this story per UX-DR-P5: 44 px target, 18 px icon, `muted-foreground`, muted hover, `rounded-md`; Epics 9 and 10 reuse it) sits right after it and opens a Tooltip (max 320 px, wraps) on hover, keyboard focus or tap, closing on Escape, with "Your date of birth is an important identifying factor throughout the healthcare industry. Additionally, 1health requires all users to be over the age of 18." *(component built: spec F3-1 — `InfoIconButton` + `Tooltip wide`; this story places it and adds the copy)*
**And** the read view has no help button (D-UX1, UX-DR-P5).

**Given** Preferred language, Default time zone and Preferred locale Selects
**When** they render
**Then** options are constants: language English (`en`); time zone the six entries of `lib/shared/time-zones.ts` in order; locale "English - United States" (`en-US`) (addendum §B, FR108)
**And** a blank stored language or time zone shows the placeholder "Select a value"; Save with it still blank shows "Select a preferred language" / "Select a time zone" at the field; the schema also carries "Select a locale" for a cleared locale
**And** a stored value not on the list stays selected (shown by known label, else raw code), passes the required check and is not sent unless I pick another value
**And** an empty stored locale shows "English - United States" as the value and is not sent unless I change it; picking "English - United States" when it was only the display default is not a change.

**Given** validation runs on blur and on Save
**When** any field is invalid and I press Save
**Then** nothing is sent, the first invalid field gets focus, each error has `aria-invalid="true"` and `aria-describedby`, and is announced
**And** Enter in an input does not submit the Section, and Escape does not cancel edit view.

**Given** a valid form with no changed fields
**When** I press Save
**Then** nothing is sent and "There are no changes" shows as a polite status in the Section footer *(placement draft)*; the Section stays in edit view (FR109, copy §D).

**Given** a valid form with changes
**When** I press Save
**Then** Save shows a spinner and "Saving…", is disabled (a double click sends once), inputs become read-only and Cancel is disabled
**And** `save()` runs in this order (AD-7 exception): (1) `updateAccount(diff)` in `lib/api/account.ts` sends `PUT /api/1h/v2/user/edit` with only the changed fields among `firstName`, `lastName`, `birthDate`, `preferredLanguage`, and only when any is dirty; (2) `setTimeZone(id)` sends `POST v2/user/time-zone?timeZone=<IANA>` only if time zone is dirty; (3) `setLocale()` sends `POST v2/user/locale?locale=en-US` only if locale is dirty
**And** (2) and (3) are both attempted whatever the earlier results; `locale`, `timeZone`, `username` and `password` never appear in the `/edit` body (backend R2)
**And** a `SESSION_EXPIRED` from any step stops the sequence (no later call), and the session flow from Story 1.7/1.15 takes over (there is no `SESSION_CHANGED`, D5)
**And** a non-GET is replayed only after a proxy-originated `TOKEN_EXPIRED`, never after a 5xx or timeout (AD-16).

**Given** every step succeeds
**When** `save()` resolves `{ ok: true }`
**Then** the toast "Personal account updated successfully" shows, the Section returns to read view, focus moves to its `h2`, the draft is deleted, and it `mutate`s `keys.myself()` and `keys.contactPoints("Email")`, `("Mobile")`, `("Landline")`, so the profile header name updates without a reload (FR109, AD-10).

**Given** any step fails
**When** `save()` resolves
**Then** it resolves `{ ok: false, error: { failedParts } }` with `failedParts` ⊆ `"details" | "timeZone" | "locale"` and never throws or reports success
**And** the Section stays in edit view with an `inline-banner-error` listing one line per failed part: "{Part} was not saved. {platform message}" (platform message omitted when there is none), with Part "Time zone", "Preferred locale" and, for the `/edit` step, "Account details" *(draft copy for the last two labels)*
**And** each succeeded part's fields become the new form baseline, so the next Save re-sends only what failed (UJ-101 edge: `/edit` OK + time zone 500 → second Save sends only `POST user/time-zone`)
**And** `myself` is revalidated so the read and header reflect the parts that did save
**And** a field-specific upstream error mapped by `lib/api/errors.ts` shows under its field as well.

**Given** Cancel
**When** I press it
**Then** all fields revert to the baseline with no confirm, the draft is deleted, edit view closes and focus returns to "Edit".

**Given** drafts (AD-12, UJ-105)
**When** the Section is dirty
**Then** values are written (debounced 500 ms, and immediately before the session-expired dialog) to `pp:draft:v1:<environment>:<userId>:account` with `draftFields` exactly `firstName, lastName, birthDate, preferredLanguage, timeZone, locale` (Story 7.6 adds the two primaries); a test asserts no draft ever contains `username`, password, MFA codes, QR or NPI data
**And** `baseHash` is the hash of the server values of exactly those fields from `myself`, so a Personal information save on `/` that changes the name invalidates the account draft and shows the conflict UI on restore
**And** after relaunch, the draft restore banner offers "Restore" / "Discard", restoring into edit view (Playwright UJ-105 on `/account`).

**Given** the leave guard
**When** the Section is dirty and I switch tab, select "Personal Profile" in the app bar, or press "Return to 1health"
**Then** the three-way guard opens; "Save" runs `save()` and navigates only on `{ ok: true }`; a partial failure keeps me on the Section with the banner.

**Given** tests
**When** they run
**Then** Vitest + MSW cover: the schema rules and copy, the Proctor branch and date boundaries, the diff (changed-only, unlisted values not sent, default locale not sent), step order and both-attempted behavior for every combination of failing steps, rebase so a retry sends only failed parts, session events stopping the sequence, `save()` result shapes for 200 / 400 with message / 5xx / network, and the draft allowlist
**And** Playwright covers parity rows 3, 5 and 6 (edit names and birth date with the "?" help, Patient 18 and Proctor 21; blank language/time zone forcing a pick and an unlisted value kept; partial failure then retry) and axe on edit view and the partial-failure banner.

**Covers:** FR105, FR106 (edit), FR108, FR109, PNFR1, PNFR2, PNFR6, PNFR8, PNFR11, AD-2 (time-zone, locale, `/edit` locale rejection), AD-7, AD-10, AD-11, AD-12, AD-16, AD-19, AD-26 (guard), PRC5, PRC13, PRC15, PA4 · UX-DR-P5, UX-DR-P7, UX-DR-P28 (partial, no changes), UX-DR-P32, UX-DR-P33 (PM4), UX-DR-P34 (D-UX1, D-UX4) · Parity §E rows 3, 5, 6 · **Jira:** NG-9019

---

### Story 7.6: Switch Primary email and phone

**Jira:** [NG-9035](https://1hio.atlassian.net/browse/NG-9035)

*Foundation 2026-10-14: built in spec 7.0b-2 — `keys.contactPoints(type)` + `fetchContactPoints` (shared with the header and Contacts), `navigate({ page: "profile", tab: "contacts", hash })`. Use it; do not rebuild. Remaining for this story: opening `email`/`phoneNumber`/`phoneNumberRegion` in `PUT v2/user/edit`, `mutateMyself`/`mutateContactPoints` and mapper v2 (F1); the pickers (Team B).*
*Foundation 2026-10-14: built in spec F1 — `PUT v2/user/edit` accepts `email`, `phoneNumber` and `phoneNumberRegion` (the two phone fields only together; rows in `allowlist/personal.test.ts`), the `updateAccount` import lint incl. dynamic imports (fixture `eslint.config.test.ts`), the email-in-use row (`User with email '…' already exists.` → `mapApiError("account", …)` = `field "primaryEmail"` / `account.primaryEmailInUse`, DRAFT COPY), `mutateMyself()` + `mutateContactPoints("Email","Mobile","Landline")`, `primaryPhoneRegion`, `formatPhoneDisplay`. Use it; do not rebuild. Remaining for this story: the email/phone diff in `updateAccount()`, the pickers, the Personal-information payload type test (needs Story 2.2's type). Do not edit `allowlist/personal.ts` (shared with Team A). Area files (edit only these, never the `index.ts` aggregators): allowlist `lib/server/proxy/allowlist/account.ts`, copy `lib/shared/messages/account.ts`, errors `lib/api/errors/account.ts`.*
*Foundation 2026-10-14: built in spec F3-1 — `Select` for the Primary email and phone pickers (the story sets `aria-busy` while loading; the `aria-disabled` + helper variant is F5), `InlineBanner variant="info"` for the first-change notice under each Select, `InlineBanner variant="error"` for the partial-failure banner, `FieldError` for the email-in-use error under the email Select, `toastSuccess`. Use it; do not rebuild. Remaining for this story: unchanged (Team B pickers and the email/phone diff in `updateAccount()`; F5 aria-disabled Select helper).*
*Foundation 2026-10-14: built in spec F3-2 / F3-3 — the pickers live in the 7.5 Section form (their part is `details` in the `attemptAll` run; a duplicate email maps to the picker through `errorFields`); `forbiddenScopeFor(path, "account")` → `account-pickers` (`level: "control"`) shows `NoAccess`/read-only text only at the pickers; a non-403 picker load error uses `LoadError` (page copy) or a Section `StateFrame` with `skeleton="bars"` around the pickers only, Retry revalidating only the contact-point keys. Use it; do not rebuild. Remaining for this story: unchanged (Team B pickers and the email/phone diff in `updateAccount()`; F5 aria-disabled Select helper).*

As a Launching user who has verified a new email or phone in Contacts,
I want to pick it as my Primary email or Primary phone from Personal account settings,
So that I sign in and get notifications with the address and number I use now.

**Acceptance Criteria:**

**Given** the `PUT v2/user/edit` allowlist entry
**When** this story is done
**Then** its body schema also accepts `email`, `phoneNumber` and `phoneNumberRegion` (strings; `phoneNumberRegion` only together with `phoneNumber`, else 400), with proxy table rows for each (AD-2, AD-9 exception). *(built: spec F1)*

**Given** edit view from Story 7.5
**When** it opens
**Then** Primary email address and Primary phone number become Selects fed by `keys.contactPoints("Email")` and `keys.contactPoints("Mobile")` (one key per type, shared with Contacts and the header; no new request when fresh, PA3, AD-10), via `GET v2/user/contact-point/list?type=…`
**And** while those keys load, each Select shows the current Primary and is `aria-busy`.

**Given** the email Select
**When** it lists options
**Then** the selected value is always the current Primary (`myself.email`), even when it isn't Verified; the options are the Verified Email Contact Points other than it (case-insensitive value match), each shown by its address
**And** the phone Select lists Verified **Mobile** Contact Points only, each formatted by `formatPhoneDisplay()` (Story 7.4); its selected value is always `myself.phoneNumber` *(Amended 2026-10-14, validated against agents.md `POST /v2/health/contact-point` and the backend: `PUT v2/user/edit` `phoneNumber` always resolves to a verified Mobile (`ContactPointServiceImpl` maps it to MOBILE) and only Email/Mobile primaries drive the login, so a Landline is rejected with 400; Landlines stay "Primary Landline" on the Contacts phone card. Current 1health-fe offers Landlines here — a latent bug not to copy.)*  (FR107, PRC8)
**And** the current Primary never counts as an option.

**Given** a Select has no option other than the current Primary
**When** it renders
**Then** it is `aria-disabled` (still focusable) with the helper "Please add additional verified email(s) in your personal profile to change your current primary contact email" (phone: "Please add additional verified phone(s) in your personal profile to change your current primary contact phone")
**And** "personal profile" is a `link-text` in-app link that calls `navigate({ page: "profile", tab: "contacts", hash: "email" })` (or `"phone"`), so the leave guard runs when the Section is dirty; it is never `next/link` or a raw `<a href>` (AD-26, UX-DR-P30).

**Given** I pick a different value in a Select for the first time in this edit session
**When** the value changes
**Then** an `inline-banner-info` appears under that Select and stays until Save or Cancel, even if I switch back: email "Changing your primary email will result in updating your login credentials. The next time you login you will have to use the new email."; phone "Changing your primary phone will result in updating your notification preferences." (Δ D5)
**And** no confirm dialog opens (UX-DR-P12).

**Given** there is no Primary phone at all (`myself.phoneNumber` empty)
**When** I press Save
**Then** the phone Select shows "Primary phone is required" and nothing is sent until a phone is picked; the schema also keeps "Invalid email address" for an email value that fails format (copy §D).

**Given** a changed Primary
**When** Save runs the Story 7.5 sequence
**Then** `lib/api/account.ts#updateAccount()` (the sole builder, AD-9 exception) adds `email` only when the email Select changed, and `phoneNumber` with `phoneNumberRegion` (the chosen row's region, default `"us"`, sent unchanged) only when the phone Select changed (region = the chosen Contact Point's `phoneNumberRegion`, from the Story 1.9 row type), in the same `PUT v2/user/edit` as the other dirty details
**And** it accepts only values present in the current Verified Email / Mobile lists; any other value returns `{ ok:false }` without a request
**And** the user's own current email is never sent: changing A → B → A is not a change, and after a partial failure where `/edit` succeeded, Save again does not re-send the email (backend R1, FR109)
**And** a type-level test proves the Personal-information payload type has no `email`, `phoneNumber` or `phoneNumberRegion`, and ESLint `no-restricted-imports` fails when `updateAccount` is imported outside `features/account` (lint fixture).

**Given** the save succeeds
**When** the Section returns to read view
**Then** `myself` and the Email, Mobile and Landline keys are revalidated, so the read view, the profile header and (on `/`) the Contacts tables show the new Primary and the old one relabeled "Old" by the platform; the notices disappear.

**Given** the `/edit` step fails
**When** the error is mapped by `lib/api/errors.ts`
**Then** a duplicate / "already exists" upstream error (by backend code) shows under the email Select; any other error shows in the partial-failure banner as "Account details was not saved. {platform message}" and the chosen values stay selected for retry.

**Given** the contact-point read answers an upstream 403
**When** the pickers render
**Then** only the pickers show the no-access line "You don't have access to this in your current account" with their current Primary as read-only text; names, birth date and regional fields stay editable and savable (AD-23 owner table)
**And** a non-403 failure shows "Something went wrong while loading profile information" + Retry under the pickers only.

**Given** the login email changes
**When** a later request answers `SESSION_EXPIRED`
**Then** the normal session-expired dialog shows (no special case); this is the PNFR10 demo check, mocked in Playwright.

**Given** drafts
**When** the Section is dirty
**Then** `draftFields` adds `primaryEmail` and `primaryPhone` (values only) and `baseHash` includes `myself.email` and `myself.phoneNumber`; on restore, a drafted value that is no longer a Verified option falls back to the current Primary *(draft rule)*.

**Given** tests
**When** they run
**Then** Vitest + MSW cover option building (unverified current Primary selected, Mobile only, landlines excluded *(amended 2026-10-14)*, current not counted, dedupe), the disabled rule and link target, first-change notice lifecycle, payload building (changed-only, region with phone, own email never sent, unknown value refused), the R1 retry case, the 403 scope, and the lint/type guards
**And** Playwright UJ-101 (parity row 4) switches Primary email to the work address and Primary phone to another verified Mobile *(amended 2026-10-14: landlines are rejected by `PUT v2/user/edit`)*, checks the notices, the disabled picker with its link to `/?tab=contacts#email` under the leave guard, the toast "Personal account updated successfully" and the header update; axe passes on the Selects, helper and notices.

**Covers:** FR107, FR109 (email retry), PNFR2, PNFR10, AD-2 (`/edit` primary fields), AD-9 (exception), AD-10, AD-12, AD-19, AD-23 (403 scope), AD-26, PRC8, PA3 · UX-DR-P7 (Selects, notice), UX-DR-P12 (no confirm), UX-DR-P30 · Parity §E row 4 · **Jira:** NG-9019

## Epic 8: Authenticator app (MFA)

Users link an authenticator app by scanning a QR code and entering a code, see that it's enabled, and turn it off with a confirmation. MFA parity: base MFA is never turned on.

**FRs covered:** FR110, FR111, FR112 · **Depends on:** Epics 1 and 7 (the `/account` page, Personal Account tab, `#authenticator` anchor, `lib/api/errors.ts` exact-message table and `FORBIDDEN` mapping, no-access panel, load-error banner, toasts, the Story 1.3 AD-2 deny list as verified against Profile templates in Story 7.2) · **Jira:** NG-9019

---

### Story 8.1: Authenticator status and app tiles

**Jira:** [NG-9036](https://1hio.atlassian.net/browse/NG-9036)
*Foundation 2026-10-14: built in spec F1 — `myself.mfaEnabled` and `myself.totpEnabled` in `lib/api/myself.ts` (this story does not extend the type), `keys.myself()`, `ErrorScope "authenticator"`. Use it; do not rebuild. Remaining for this story: the card (Team B), `StateFrame` (F3). Area files (edit only these, never the `index.ts` aggregators): allowlist `lib/server/proxy/allowlist/mfa.ts`, copy `lib/shared/messages/mfa.ts`, errors `lib/api/errors/mfa.ts`.*
*Foundation 2026-10-14: built in spec F3-1 — `StatusBadge status="verified"` with "Enabled" (`status-verified`), `Tooltip` (hover, focus, tap; `keepOpenOnPress`) for the inactive tiles, which stay custom `aria-disabled` buttons (`Button` with `aria-disabled` is inert since F3-1) pointing `aria-describedby` at the visible caption, `LoadError` on `InlineBanner`, `focus-ring`. Callers of `LoadError`/`ReadStateFor` pass `attempt` (failure count) so a repeated failure is re-announced. Use it; do not rebuild. Remaining for this story: unchanged (Team B card; F3-3 `StateFrame`).*
*Foundation 2026-10-14: built in spec F3-3 — `SectionLandmark({ id: "authenticator", title: "Authenticator app", tools })` (`AccountAnchor`, `h2#authenticator-heading`, `tabIndex=-1`; the `#authenticator` deep link comes from Story 7.1's `useHashAnchors`), `StateFrame` (`skeleton="tiles"` (five 112 px), `loadError: { kind: "page" }`, `level="section"`, `onRetry` revalidating only `keys.myself()`, `attempt`), `NoAccess({ level: "section" })` for `mfaForbidden`, set when `forbiddenScopeFor(path, "account")` returns owner `authenticator`. Use it; do not rebuild. Remaining for this story: unchanged (Team B card).*

As a Launching user on the Personal Account tab,
I want to see whether an authenticator app is linked to my account and which apps I can link,
So that I know if my sign-in is protected by a code and where to start if it isn't.

**Acceptance Criteria:**

**Given** `/account?tab=personal`
**When** the tab renders
**Then** below the Personal account settings Section there is a `section` with id `authenticator`, `aria-labelledby` its `h2` "Authenticator app" (section-title type, `tabIndex={-1}`), rendered by `features/mfa/authenticator-card.tsx`
**And** it is not a `SectionRegistry` Section: it has no dirty state, no edit view, no draft and no Save (AD-7)
**And** `/account?tab=personal#authenticator` scrolls to it and focuses nothing else, using the Epic 7 anchor handling (FR101, UX-DR-P30).

**Given** `myself` from `keys.myself()` (`["pp","myself"]`, the shared SWR key, no new fetch) with `totpEnabled: false` (or absent)
**When** the card renders
**Then** the header shows, on the right of the `h2`, the muted text "Not set up" and no "Disable" button
**And** the body shows one muted intro line "Link an authenticator app to get sign-in codes on your phone." followed by five tiles in this order: Google, Microsoft, Authy, DUO, Android OTP (FR110, UX-DR-P8).

**Given** `myself.totpEnabled: true`
**When** the card renders
**Then** the header shows `status-verified` (check icon + "Enabled") next to the heading (PM5, D-UX2) and a "Disable" button styled `button-outline-destructive` (card background, border, error-strong text, muted hover, `rounded-md`, 44 px tall) (UX-DR-P4)
**And** "Not set up" is not rendered
**And** the linked status is derived only from `myself.totpEnabled` (this story adds `totpEnabled` and `mfaEnabled` to the Story 7.4 `lib/api/myself.ts` domain type; `myself.mfaEnabled` is read there but never turns the status to "Enabled" on its own) (AD-23 MFA).

**Given** a tile
**When** it renders
**Then** it is a native `button` (`mfa-tile`: 112 px square, card, border, `rounded-md`, 48 px vendor logo centered, app name under it in cell-strong) whose accessible name is "Link {App}" (e.g. "Link Android OTP") with `aria-haspopup="dialog"`
**And** the vendor logo is an `<img alt="" aria-hidden="true">` served from `public/mfa/{google,microsoft,authy,duo,android-otp}.png` (copied from `1health-fe/src/assets/mfaAppsLogos/`, same-origin so CSP `img-src 'self'` holds); vendor logos are the only non-token colors in the app (PNFR5)
**And** hover uses the `table-row-hover` fill and `:focus-visible` shows the standard focus ring.

**Given** `totpEnabled: true`
**When** the tiles render
**Then** every tile takes `mfa-tile-inactive` (opacity 0.55, `cursor: not-allowed`) with `aria-disabled="true"` (not the `disabled` attribute, so it stays focusable)
**And** a caption with an info icon "Disable the current authenticator to link another" shows under the tile row, and each tile has `aria-describedby` pointing at it
**And** each tile shows the same text as a Tooltip on hover, focus or tap
**And** activating an inactive tile (click, Enter, Space) does nothing: no request, no dialog (FR110, UX-DR-P8).

**Given** `myself` is loading
**When** the card renders
**Then** the `h2` renders immediately and the body shows five 112 px tile placeholders (shimmer, static under `prefers-reduced-motion`), and neither status text nor "Disable" shows (UX-DR-P27).

**Given** `myself` fails with a non-403 error
**When** the card renders
**Then** it shows the `inline-banner-error` "Something went wrong while loading profile information" with "Retry", which revalidates `["pp","myself"]` only; no tiles and no status are shown (never an empty card) (FR103, UX-DR-P28).

**Given** the card's no-access state (`mfaForbidden`), set when any `mfa/*` call or `/api/pp/mfa/validate` returns upstream `FORBIDDEN` (403 without `source:"proxy"`, AD-19)
**When** the card renders
**Then** its body is replaced by the Section-level `no-access-panel` row (20 px lock icon, muted-foreground, "You don't have access to this in your current account"), with no status, no "Disable", no tiles and no action
**And** the Personal account settings Section and the other tabs keep working (AD-23 403 owner table, PNFR11)
**And** a proxy-originated 403 (`NOT_ALLOWED`; there is no `CSRF`, D5) never sets this state.
*(This story builds the state and its rendering; Stories 8.2 and 8.3 set it from their calls.)*

**Given** the viewport
**When** it is ≥ 768 px
**Then** the five tiles sit in one row with 16 px gaps
**And** below 768 px down to 360 px they form a 3-column grid (12 px gaps, square tiles, min 96 px), the caption wraps under the grid, and there is no horizontal scroll at 360 px (PNFR4, UX-DR-P31).

**Given** copy
**When** the card renders
**Then** "Authenticator app", the intro, "Enabled", "Not set up", "Disable", "Link {App}" and the caption come from `lib/shared/messages.ts`, verbatim from EXPERIENCE.md V&T (Authenticator — intro) and the V&T verbatim test covers them (PNFR6, UX-DR-P32).

**Tests:**
- Vitest + RTL: not-set-up vs enabled rendering from `totpEnabled`; `mfaEnabled: true, totpEnabled: false` → "Not set up"; inactive tiles have `aria-disabled`, `aria-describedby` and fire no handler; skeleton; load error Retry revalidates only `myself`; upstream 403 → no-access row, proxy `NOT_ALLOWED` → not no-access.
- MSW: rendering the card issues no request beyond the shared `myself` (no `mfa/*` call on mount).
- Playwright: axe (light and dark, 1280 and 360 px) in both states; no horizontal scroll at 360 px; keyboard order Account settings → `h2` region → Disable (when linked) → tiles.

**Covers:** FR110, FR101 (`#authenticator`), FR103, PNFR2, PNFR4, PNFR5, PNFR6, AD-7, AD-10, AD-19, AD-23 (status, 403 owner) · UX-DR-P1, UX-DR-P4, UX-DR-P8, UX-DR-P26, UX-DR-P27, UX-DR-P28, UX-DR-P29, UX-DR-P31, UX-DR-P32, UX-DR-P33 (PM5), UX-DR-P34 (D-UX2) · **Jira:** NG-9019

---

### Story 8.2: Link an authenticator app

**Jira:** [NG-9037](https://1hio.atlassian.net/browse/NG-9037)
*Foundation 2026-10-14: built in spec F1 — the MFA rows in `lib/api/errors/mfa.ts` (scope `authenticator`, upstream 4xx only: `Mfa is not enabled for this user.` / `Mfa config is missing.` → `{kind:"coded", code:"MFA_NOT_ENABLED"}`; `Totp is already enabled.` → `TOTP_ALREADY_ENABLED`), `telemetry.track("mfa_link", { ok, attempt })` typed in `lib/shared/telemetry.ts`, `mutateMyself()`. Use it; do not rebuild. Remaining for this story: the `POST v2/mfa/enable/totp` entry, the `/api/pp/mfa/validate` named op (F2 wrapper), `lib/api/mfa.ts`, the dialog. Area files (edit only these, never the `index.ts` aggregators): allowlist `lib/server/proxy/allowlist/mfa.ts`, copy `lib/shared/messages/mfa.ts`, errors `lib/api/errors/mfa.ts`.*
*Foundation 2026-10-14: built in spec F2 — `POST /api/pp/mfa/validate` (`app/api/pp/mfa/validate/route.ts` → `lib/server/named-ops/mfa-validate.ts#createMfaValidateHandler`; `mfaValidateBodySchema` strict `{code: /^\d{6}$/}`; kill switch `"account"`; 415 for non-JSON, 400 `BAD_BODY`; upstream `POST v2/mfa/validate?code=` with the boolean and upstream 4xx relayed; the code is never logged; `MfaValidateRequest` + `BFF_PATHS.mfaValidate` in `lib/shared/bff-contract.ts`) with its route tests. Use it; do not rebuild. Remaining for this story: Team B: the `POST v2/mfa/enable/totp` entry (`profile: true`) in `allowlist/mfa.ts` with its allow/deny rows, `lib/api/mfa.ts` (`enableTotp`, `validateTotp`), the `qr-surface` token, the dialog and its tests; confirm the upstream TOTP lockout on demo and, if there is none, add a sealed-session attempt counter or edge rate limit (deferred-work: no throttle on `/api/pp/mfa/validate` or Places autocomplete).*
*Foundation 2026-10-14: built in spec F3-1 — `Button` `busy` for the in-flight tile and Submit (`aria-busy`, inert, accessible name kept), `InlineBanner variant="info"` for the base-MFA-off notice and `variant="error"` for enable failures, `FormField`/`FieldError` + `Input` for the 6-digit code, `toastSuccess("Microsoft authenticator linked")`. Use it; do not rebuild. Remaining for this story: unchanged (Team B entry, `lib/api/mfa.ts`, `qr-surface`, dialog; lockout/throttle decision).*

As a Launching user without an authenticator linked (e.g. Ana, UJ-102),
I want to pick my authenticator app, scan a QR code and enter the code it shows,
So that my account asks for a code from my phone when I sign in.

**Acceptance Criteria:**

**Given** the endpoints this story uses
**When** it is done
**Then** the proxy allowlist gains `POST v2/mfa/enable/totp` (no query, no body, no server-forced params, tagged `profile: true`) and the named op `POST /api/pp/mfa/validate` exists in `app/api/pp/mfa/validate/route.ts` (`force-dynamic`): session required, `Content-Type: application/json` (else 415), no CSRF or `X-PP-Session` check (D5), JSON body `{ "code": "<6 digits>" }` matching `^\d{6}$` (else 400 `{errorCode:"BAD_BODY", source:"proxy"}` without calling upstream), the server calls upstream `POST v2/mfa/validate?code=<code>` and returns the upstream boolean as JSON with `Cache-Control: private, no-store, max-age=0` (AD-2, AD-18)
**And** `v2/mfa/validate` is not a passthrough entry, and the AD-2 deny rows still pass (`POST v2/mfa/enable` → 403, `POST v2/mfa/enable/123` → 403, `GET v2/mfa/validate/123` → 403) with the new allow row `POST v2/mfa/enable/totp` → allowed
**And** the dev-only `logApiCall` (Story 1.4, D6) already redacts `qrCode`, `code`, tokens and SSN-shaped values, and a test asserts it for these responses (AD-15), and `app/globals.css` gains the `qr-surface` token = #ffffff in both light and dark (UX-DR-P1).
**And** `lib/api/mfa.ts` exports `enableTotp(): Promise<ApiResponse<{ qrCode: string }>>` and `validateTotp(code): Promise<ApiResponse<boolean>>`, both through `callApi` with contexts `"mfa/enableTotp"` / `"mfa/validateTotp"`, bypassing the SWR fetcher; nothing in the app calls `mfa/enable` (base MFA) (AD-23 MFA, PRC6).

**Given** the card shows "Not set up" (Story 8.1)
**When** I activate the "Link Microsoft" tile (click, Enter or Space)
**Then** the tile's click handler calls `enableTotp()` exactly once, guarded by an in-flight ref; the request is never started from a mount or render effect
**And** while it is in flight the activated tile shows a spinner (its name kept as accessible name, `aria-busy="true"`) and the other four tiles are `aria-disabled`
**And** a second click or key press on any tile while in flight sends nothing (AD-23 single-flight, UX-DR-P9).

**Given** `enable/totp` returns `{ qrCode }`
**When** the response arrives
**Then** the dialog "Link your Microsoft authenticator" opens (shadcn Dialog, `qr-dialog`: 440 px, popover background, `rounded-lg`, elevation-2, over the `scrim` token) with the instruction "Use the Microsoft authenticator app installed on your device to scan this QR, then provide the code generated by the app in the field below."
**And** the QR is a 184 px `<img src={qrCode} alt="QR code to link your authenticator app">` on the `qr-surface` white token inside a 1 px border frame, centered (white in both themes)
**And** below it the label "6-digit code" and one `otp-input` (44 px tall, 200 px wide, mono-value, 0.3em tracking, no placeholder, `inputmode="numeric"`, `autocomplete="one-time-code"`, digits only, max 6 — non-digits typed or pasted are dropped)
**And** the footer has "Cancel" (secondary) and "Submit" (primary, always enabled)
**And** focus starts on the code field and is trapped in the dialog; there is no manual secret key and no Retry that re-requests the QR (FR111, UX-DR-P10, UX-DR-P11).

**Given** the platform answers `enable/totp` with "Mfa is not enabled for this user." or "Mfa config is missing." (mapped to `MFA_NOT_ENABLED` by `lib/api/errors.ts`)
**When** the response arrives
**Then** no dialog opens; an `inline-banner-info` above the tiles reads "Your account doesn't have multi-factor authentication turned on, so an authenticator app can't be linked yet. Contact support." and receives focus (`tabIndex={-1}`, announced)
**And** the tiles stay enabled, and each later activation sends `enable/totp` again and re-shows and re-focuses the notice (FR111, UX-DR-P9).

**Given** the platform answers "Totp is already enabled." (`TOTP_ALREADY_ENABLED`)
**When** the response arrives
**Then** no dialog opens, `["pp","myself"]` is revalidated and the card shows the linked state (Story 8.1) (AD-19).

**Given** `enable/totp` fails otherwise
**When** the response arrives
**Then** an upstream `FORBIDDEN` sets the card's no-access state (Story 8.1); any other error shows an `inline-banner-error` above the tiles with the platform `message` when present, otherwise "Couldn't start linking your authenticator app. Try again." *(DRAFT COPY)*; the spinner stops and tiles are enabled again; nothing is retried automatically (AD-16, AD-19)
**And** `SESSION_EXPIRED` shows no card error (the shell dialog handles it; there is no `SESSION_CHANGED`, D5).

**Given** the dialog is open
**When** I press Submit with fewer than 6 digits (including empty)
**Then** "Enter the 6-digit code" shows inline under the field as `help-text-error`, linked by `aria-describedby` and announced, focus stays in the field, and no request is sent (UX-DR-P11).

**Given** 6 digits in the field
**When** I press Submit (or Enter in the field)
**Then** `validateTotp(code)` sends `POST /api/pp/mfa/validate` with body `{ "code": "123456" }` once; Submit shows a spinner and a second Submit while in flight sends nothing
**And** the code never appears in any app URL, query string, SWR key, `console.*` or the dev debug logger (which redacts `code` and `qrCode`) (AD-2, AD-15).

**Given** validate returns 200 `false`
**When** the response arrives
**Then** "Invalid code. Try again." shows inline under the field (announced), the field is cleared, focus stays in it, the dialog stays open with the same QR, and `enable/totp` is not called again (FR111, UX-DR-P11).

**Given** validate returns 200 `true`
**When** the response arrives
**Then** the dialog closes, the success toast "Microsoft authenticator linked" shows, `["pp","myself"]` is revalidated, focus moves to the card `h2`, and the card shows "Enabled", "Disable" and inactive tiles once `myself` returns (UJ-102).

**Given** validate fails (upstream 403 → card no-access state and the dialog closes; network/5xx/other)
**When** the response arrives
**Then** for non-403 errors an inline error under the field shows the platform `message` when present, otherwise "Couldn't check the code. Try again." *(DRAFT COPY)*; the typed code is kept, the QR is kept and no request is replayed automatically (AD-16).

**Given** the dialog is open
**When** I press Cancel, Escape or the close button
**Then** the dialog closes with no further request to `mfa/*`, TOTP stays off, `["pp","myself"]` is revalidated and focus returns to the tile that opened it (addendum §C step 3).

**Given** the QR data URI and the typed code
**When** the dialog is open or closed
**Then** they live only in the dialog component's React state: never in SWR or any cache, a draft, `localStorage`, `sessionStorage`, IndexedDB, a URL, telemetry or logs (PNFR1, AD-10, AD-12, AD-15)
**And** on close, unmount and `pagehide` the QR and code are cleared from state
**And** each new dialog open (a new tile activation) gets a fresh QR, and the dialog only renders the QR of the latest `enable/totp` response (AD-23).

**Given** each validate result
**When** it returns `true` or `false`
**Then** `lib/shared/telemetry.ts` emits `mfa_link { ok, attempt }`, where `attempt` is the 1-based count of validate calls in this dialog open, with no code, QR, app name or user id (AD-15, SM-103).

**Given** a viewport below 768 px
**When** the dialog opens
**Then** it is a full-screen sheet: header with the title and a 44 px close button ("Close"), scrolling body, Cancel + Submit pinned to the bottom edge, no horizontal scroll at 360 px; it is the only `/account` dialog that goes full-screen (D-UX8, PNFR4)
**And** while the QR loads the dialog is not yet open, so the tile spinner is the loading state (a 184 px skeleton square is shown only if the dialog renders before the image decodes).

**Given** copy
**When** the flow renders
**Then** the dialog title, instruction, alt text, label, both inline errors, "Cancel", "Submit", the toast and the base-MFA-off notice come from `lib/shared/messages.ts` verbatim from EXPERIENCE.md V&T / addendum §D; the two draft strings carry `// DRAFT COPY` (PNFR6).

**Tests:**
- Vitest + MSW (`features/mfa`): double-click and Enter+click on a tile → one `enable/totp` call; rendering the dialog under `<React.StrictMode>` → one call; reopening after Cancel → a second call with a new QR; no `enable/totp` call while the dialog is open (including after a wrong code); short code → no request; wrong code → cleared + message + focus; correct code → toast, `myself` revalidated, focus to `h2`; `MFA_NOT_ENABLED` → notice focused, no dialog, tiles enabled; `TOTP_ALREADY_ENABLED` → refetch; upstream 403 → no-access; `mfa_link` payload has only `ok` and `attempt`.
- Privacy: after a full link flow, the SWR cache, both storages and `console` spies contain neither the `qrCode` value nor the 6-digit code.
- Route tests (`/api/pp/mfa/validate`): valid body → upstream `?code=` and boolean passthrough; `12345`, `abcdef`, missing body → 400 with no upstream call; non-JSON `Content-Type` → 415 `UNSUPPORTED_MEDIA`; no session → 401; logs contain method, path template, status, duration, request id and no code; `no-store` header. *(built: spec F2)*
- Playwright (mocked proxy, UJ-102 / addendum §E row 7): link with a wrong then a correct code; base MFA off; dialog full-screen at 360 px; axe clean in light and dark.

**Covers:** FR111, PNFR1, PNFR2, PNFR4, PNFR6, PNFR12 (SM-103), AD-2 (allowlist, named op, denies), AD-10, AD-12, AD-15, AD-16, AD-17 (as superseded by D5: 415 JSON check only), AD-18, AD-19, AD-23 (MFA parity, single-flight, 403 owner) · UX-DR-P1, UX-DR-P9, UX-DR-P10, UX-DR-P11, UX-DR-P31, UX-DR-P32, UX-DR-P34 (D-UX8) · PRC6, PRC11 · **Jira:** NG-9019

---

### Story 8.3: Turn off the authenticator app

**Jira:** [NG-9038](https://1hio.atlassian.net/browse/NG-9038)

*Foundation 2026-10-14: built in spec 7.0b-1 — `ConfirmDialog` (`variant: "destructive"`, `scrim`) for "Turn off authenticator app?". Use it; do not rebuild. Remaining for this story: everything else (Team B; MFA exact messages in F1 mapper v2).*
*Foundation 2026-10-14: built in spec F1 — `mutateMyself()`, `mapApiError("authenticator", …)`. Use it; do not rebuild. Remaining for this story: unchanged (Team B); the `POST v2/mfa/disable/totp` entry goes in `allowlist/mfa.ts`. Area files (edit only these, never the `index.ts` aggregators): allowlist `lib/server/proxy/allowlist/mfa.ts`, copy `lib/shared/messages/mfa.ts`, errors `lib/api/errors/mfa.ts`.*
*Foundation 2026-10-14: built in spec F3-1 — `ConfirmDialog` on `Button busy` (the busy confirm reads "Saving…"; add a `busyLabel` prop to `ConfirmDialog` if "Turn off" needs other busy copy), `toastSuccess("Authenticator app disabled")`, `InlineBanner variant="error"` for other errors. Use it; do not rebuild. Remaining for this story: unchanged (Team B).*

As a Launching user with an authenticator app linked,
I want to turn it off after confirming,
So that I can stop using that app (for example after changing phones) without accidentally weakening my sign-in.

**Acceptance Criteria:**

**Given** the endpoint this story uses
**When** it is done
**Then** the proxy allowlist gains `POST v2/mfa/disable/totp` (no query, no body, no server-forced params, tagged `profile: true`), `lib/api/mfa.ts` exports `disableTotp()` through `callApi` (context `"mfa/disableTotp"`), and the deny rows `POST v2/mfa/disable` → 403 and `POST v2/mfa/disable/123` → 403 pass (AD-2).

**Given** the card shows "Enabled" (Story 8.1)
**When** I activate "Disable"
**Then** a confirm dialog opens over the `scrim` token, titled "Turn off authenticator app?" with body "You'll no longer be asked for a code from your authenticator app when you sign in." and buttons "Cancel" (secondary) and "Turn off" (`button-destructive`, `destructive-fill`, white text)
**And** focus starts on "Cancel" and is trapped in the dialog; no request has been sent yet (FR112, UX-DR-P12).

**Given** the confirm is open
**When** I press "Cancel", Escape or close
**Then** the dialog closes, nothing is sent, the card is unchanged, and focus returns to "Disable".

**Given** the confirm is open
**When** I press "Turn off"
**Then** `disableTotp()` sends `POST v2/mfa/disable/totp` exactly once; "Turn off" shows a spinner and further presses send nothing
**And** no other `mfa/*` endpoint is called: never `mfa/disable` (base MFA stays as it was, PRC6).

**Given** the call succeeds (200)
**When** the response arrives
**Then** the dialog closes, the success toast "Authenticator app disabled" shows, `["pp","myself"]` is revalidated, and focus moves to the card `h2` (the "Disable" button is gone)
**And** once `myself` returns the card shows "Not set up" and active tiles (Story 8.1).

**Given** the call fails
**When** the response arrives
**Then** an upstream `FORBIDDEN` closes the dialog and sets the card's no-access state (Story 8.1)
**And** any other error closes the dialog, shows an `inline-banner-error` in the card with the platform `message` when present, otherwise "Couldn't turn off the authenticator app. Try again." *(DRAFT COPY)*, revalidates `["pp","myself"]`, and returns focus to "Disable" if it is still shown (else the `h2`); the card keeps showing the status from `myself`
**And** the request is never replayed automatically after a 5xx or timeout (AD-16); `SESSION_EXPIRED` shows no card error (there is no `SESSION_CHANGED`, D5).

**Given** a viewport below 768 px
**When** the confirm opens
**Then** it stays a centered dialog, full width minus 16 px gutters, never full-screen, with 44 px targets and no horizontal scroll at 360 px (D-UX8, PNFR4).

**Given** copy
**When** the confirm and results render
**Then** the title, body, "Cancel", "Turn off" and the toast come from `lib/shared/messages.ts` verbatim from EXPERIENCE.md V&T (Authenticator — disable); the error fallback carries `// DRAFT COPY` (PNFR6).

**Tests:**
- Vitest + MSW: Disable opens the confirm with focus on Cancel; Cancel and Escape send nothing and return focus to Disable; Turn off double-press → one `disable/totp`; success → toast, `myself` revalidated, focus on `h2`, card shows "Not set up"; 5xx → banner, no replay; upstream 403 → no-access; an MSW handler for `POST v2/mfa/disable` fails the test if called.
- Proxy table rows: `POST v2/mfa/disable/totp` allowed, `POST v2/mfa/disable` and `POST v2/mfa/disable/123` → 403 `NOT_ALLOWED`.
- Playwright (addendum §E row 7, disable with confirmation): enabled → Disable → Turn off → "Authenticator app disabled" → "Not set up"; confirm centered at 360 px; axe clean in light and dark.

**Covers:** FR112, PNFR1 (confirm before disable), PNFR2, PNFR4, PNFR6, AD-2 (allowlist, denies), AD-16, AD-19, AD-23 (MFA parity, 403 owner) · UX-DR-P4, UX-DR-P12, UX-DR-P31, UX-DR-P32, UX-DR-P34 (D-UX8) · PRC6 · **Jira:** NG-9019

## Epic 9: Individual Provider Registration

Providers find their personal and practice NPIs, register them, and see their registered credentials: the practice's support contact, their signature and "Register your practice".

**FRs covered:** FR113, FR114, FR115, FR116 · **Depends on:** Epics 1 and 7 (the `/account` page, its tab strip and `AccountTab` routing, the `no-access-panel` and load-error banner, `navigate()` (AD-26), `/handoff/portal` (AD-22), and the Profile allowlist pattern) · **Jira:** NG-9019

**How the stories split (no forward dependencies):** Story 9.1 owns the Healthcare credentials Section, the state detection from `GET v2/user/npi` and the search form. For a user who is already registered, 9.1 renders a minimal read-only registered body, `features/provider/registered-view.tsx`, holding a single key/value row "NPI" with the Personal NPI. It never shows the form. Story 9.2 adds Register and swaps to whatever registered body exists. Story 9.3 replaces the minimal body with the full Registered view. Each story ships on its own and leaves the tab usable: an already-registered user is never offered the form.

### Story 9.1: Registration state and NPI search

**Jira:** [NG-9039](https://1hio.atlassian.net/browse/NG-9039)
*Foundation 2026-10-14: built in spec F1 — `keys.npi()` = `["pp","npi"]` (declared; this story's `lib/api/npi.ts` registers the `npi` loader), `ErrorScope "provider"`. Use it; do not rebuild. Remaining for this story: everything else (Team B). Area files (edit only these, never the `index.ts` aggregators): allowlist `lib/server/proxy/allowlist/npi.ts`, copy `lib/shared/messages/npi.ts`, errors `lib/api/errors/npi.ts`. A new `lib/api/<resource>.ts` registers its own loader with `registerFetcher()` and is re-exported from `lib/api/index.ts`.*
*Foundation 2026-10-14: built in spec F3-1 — `InfoIconButton({ "aria-label": "About provider registration", icon: "info" })` after the `h2` (the trigger for the F5 `info-popover`), `LoadError` on `InlineBanner`, `FormField`/`FieldError` around the comboboxes, `focus-ring`. Callers of `LoadError`/`ReadStateFor` pass `attempt` (failure count) so a repeated failure is re-announced. Use it; do not rebuild. Remaining for this story: unchanged (Team B; Combobox and Popover F5, F3-3 `StateFrame`).*
*Foundation 2026-10-14: built in spec F3-2 / F3-3 — `StateFrame` (`skeleton="bars"` for Healthcare credentials, `loadError: { kind: "page" }`, `onRetry` revalidating only `keys.npi()`, `attempt`), a tab-level `NoAccess` when `forbiddenScopeFor(path, "account")` returns owner `provider` (frame `level="tab"`), `SectionLandmark`/`SectionHeader` for the `h2` + (i) button, `KeyValueTable` for the minimal registered view. Use it; do not rebuild. Remaining for this story: unchanged (Team B; Combobox and Popover F5).*

As Dr. Ruiz, a family physician who has not yet registered as a provider on 1health,
I want the Individual Provider Registration tab to show whether I'm registered and, if I'm not, to let me search the national registry for my personal NPI and my clinic's NPI,
So that I can find the right NPI records before I register.

**Acceptance Criteria:**

**Given** the Provider tab endpoints
**When** this story is done
**Then** the proxy allowlist gains these exact entries (METHOD + template + allowed query), each with proxy tests (AD-2):
- `GET v2/user/npi`: no query params (any → 400 `BAD_QUERY`);
- `GET v2/public/npi/list`: `entityTypeCode` exactly `1` or `2`, `searchText` ≤ 100 chars (may be empty), `page` matching `^\d{1,4}$`, `limit` an integer 1–10. Any other param, a missing `entityTypeCode`, `entityTypeCode=3`, `limit=11` or `page=12345` → 400 `BAD_QUERY`
**And** both entries are tagged `profile: true`, so they return 503 `SERVICE_DISABLED` when `ACCOUNT_DISABLED=1` (Story 1.3 proxy-level kill switch, AD-20)
**And** server logs for both carry only method, path template, status, duration and request id, never `searchText` (AD-15).

**Given** `lib/api/npi.ts`
**When** it is implemented
**Then** it exports `getUserNpi()` (SWR key `["pp","npi"]` from `lib/api/keys.ts`, AD-10), mapping the raw `PersonWithNpiDTO` to a domain type `UserNpi = { registered: boolean, provider?, practice?, hie? }`, where `registered` is `providerNpi != null`
**And** it exports `searchPersonalNpi({ searchText, page })`, which always sends `entityTypeCode=1&limit=10`, and `searchPracticeNpi({ searchText, page })`, which always sends `entityTypeCode=2&limit=10`. Neither takes a type argument, so components never pass the type (AD-23, SM-C101)
**And** search results map to `NpiOption = { id, npi, name, addressLine1?, city, state, label }`. `id` is the record id. `label` is the full PRD string: individual `"<NPI>, <First> <Last>, <City>, <State>"`, organization `"<NPI>, <Organization name>, <Address line 1>, <City>, <State>"` (FR114)
**And** every call goes through `callApi` with a `"npi/<fn>"` context string, and `page` is 0-based.

**Given** I open `/account?tab=provider` (or select "Individual Provider Registration")
**When** the tab mounts
**Then** `GET v2/user/npi` is requested only now, never prefetched while another tab is open (PNFR3)
**And** until it resolves, the Section "Healthcare credentials" shows its header and a skeleton of two input-height bars (UX-DR-P13, UX-DR-P27), with the shimmer static under reduced motion.

**Given** `user/npi` returns `providerNpi: null`
**When** the Section renders
**Then** it shows the unregistered body: the instruction line "Please find your provider and NPI information to continue…" (body, 500), then two stacked NPI comboboxes 16 px apart, full main-column width capped at 720 px (`control-max-wide`), then a right-aligned primary "Register" button (FR113, UX-DR-P13). Register is wired in Story 9.2. In this story it renders but sends nothing.

**Given** `user/npi` returns a `providerNpi`
**When** the Section renders
**Then** it renders `features/provider/registered-view.tsx` in its minimal form: a read-only key/value table (Account settings read layout) with the single row "NPI" showing `providerNpi.npi` in `mono-value`
**And** no combobox, no Register button and no edit or unregister affordance is shown. Story 9.3 extends this component into the full Registered view.

**Given** `user/npi` fails with an upstream 403 (`FORBIDDEN`, no `source:"proxy"`)
**When** the tab renders
**Then** the whole Provider tab content is replaced by the tab-level `no-access-panel` "You don't have access to this in your current account" with no action, and the Personal Account and My Organizations tabs keep working (FR103, AD-23 owner table, UX-DR-P26)
**And** a proxy `NOT_ALLOWED` 403 is not shown as no access (there is no `CSRF`, D5). It shows the generic load error with Retry (AD-19).

**Given** `user/npi` fails with any other error
**When** the Section renders
**Then** it shows `inline-banner-error` "Something went wrong while loading profile information" with "Retry" in the Section and never an empty form. Retry refetches only `["pp","npi"]` (FR103, UX-DR-P28).

**Given** the Section header
**When** it renders
**Then** the `h2` "Healthcare credentials" (`tabIndex=-1`, so later stories can focus it) is followed by an (i) `info-icon-button` (the Story 7.5 component: 44 px target, 18 px icon, `muted-foreground`, accessible name "About provider registration" *(draft copy)*)
**And** the button opens the provider `info-popover` with exactly "Registering links your 1health account to your NPI from the national provider registry. Adding your practice's NPI is optional. Once registered, it can't be changed here." (FR114, UX-DR-P5).

**Given** the provider (i) popover
**When** I hover the trigger for 150 ms, focus it with the keyboard, or click/tap it
**Then** a non-modal 280 px popover opens below the trigger with its left edge aligned, flipping above only when there is no room below (PM10). Opening on focus does not move focus. The trigger has `aria-expanded` and `aria-controls`
**And** it closes on Escape (focus returns to the trigger), when focus leaves both trigger and popover, or on an outside click (UX-DR-P18)
**And** the popover is `components/ui/info-popover.tsx`. If Epic 10 has not already added it, this story adds it with the three-variant contract of UX-DR-P18. Whichever story lands second reuses it and adds no second popover component.

**Given** the two NPI comboboxes
**When** they render
**Then** the personal field is labeled "Search for your personal NPI number" (required, no marker, `aria-required="true"`) and is bound to `searchPersonalNpi()`
**And** the practice field is labeled "Search for your practice's (hospital, clinic, lab, etc.) NPI Number" with a muted "(optional)" suffix and is bound to `searchPracticeNpi()`
**And** both show the placeholder "Search by NPI or name", a leading search icon and a trailing clear (×) button named "Clear {label}" *(draft copy)* (UX-DR-P14).

**Given** a combobox
**When** I focus it or type in it
**Then** it follows the WAI-ARIA combobox pattern: `role="combobox"`, `aria-expanded`, `aria-controls` pointing at a `role="listbox"` popup in `row-menu` styling, and `aria-activedescendant` for the active option (UX-DR-P15)
**And** focusing an empty field opens the listbox and loads the first page (`searchText=` empty, `page=0`)
**And** typing triggers a search only after 600 ms without typing. The text is trimmed, and the input caps at 100 characters (`maxLength=100`), so the proxy limit is never hit
**And** a response for an older query is discarded, so only the latest query's results show (in-flight requests are aborted).

**Given** results arrive
**When** the listbox renders
**Then** each option is a 52 px `combobox-option`. Line 1 is the NPI in `mono-value` plus the name in `cell-strong` (individual "First Last", organization name). Line 2 is a muted caption: "City, State" for individuals, "Address line 1, City, State" for practices
**And** each option's accessible name is its full PRD `label` string, and the selected value shows that string in the input (FR114)
**And** the result count is announced politely ("{N} results" *(draft copy)*).

**Given** I scroll to the end of the loaded options
**When** fewer options are loaded than `totalElements`
**Then** the next page (`page+1`, 10 per page) is requested, a loading row with spinner + "Searching…" shows at the bottom, and new options append
**And** when all `totalElements` are loaded, a muted non-selectable row "No more results" ends the list and no further request is made.

**Given** a search is in flight
**When** the listbox is open
**Then** it shows the row spinner + "Searching…", announced politely.

**Given** a search request fails (network error, 5xx, timeout, or a 4xx other than an upstream 403)
**When** the listbox renders
**Then** it shows the error row: alert icon + "Couldn't load results." + a link-styled button "Try again." (`link-text`), announced politely (FR114, Δ D9)
**And** "Try again." repeats exactly the same query and page. An infinite-scroll page failure keeps the options already loaded and shows the error row at the bottom
**And** an upstream 403 from `public/npi/list` shows the tab-level no-access panel (AD-23 owner table).

**Given** a search returns zero results
**When** the listbox renders
**Then** it shows the single muted non-selectable row "No matching NPI found" (`aria-disabled`, never selectable), announced politely (D-UX5).

**Given** the keyboard
**When** I use a combobox
**Then** Arrow Down/Up move the active option (non-selectable rows are skipped), Enter selects the active option and closes the listbox, Escape closes only the listbox (focus stays in the field), and Tab leaves the field
**And** × clears both the selection and the text, keeps focus in the field, and announces "Cleared" *(draft copy)*
**And** typing after a selection clears the selection and starts a new search
**And** the whole form is completable keyboard-only, every control shows the focus ring, and an axe check of the open listbox, its error row and the popover passes (PNFR2).

**Given** type locking
**When** the personal and practice fields search
**Then** a unit test asserts that the personal field's request has `entityTypeCode=1` and the practice field's has `entityTypeCode=2`, whatever the user types (including a 10-digit organization NPI typed into the personal field)
**And** a lint or grep test asserts that no file under `features/provider` contains `entityTypeCode` (AD-23).

**Given** a selection
**When** I select an NPI, the session expires, or the page reloads
**Then** the selection lives only in component state. It is never written to drafts, `localStorage`, SWR, the URL, logs or telemetry, and a test asserts this (PNFR1, AD-12). Search results are also held in component state, not SWR.

**Given** a mobile viewport (360–767 px)
**When** the tab renders
**Then** the comboboxes are full width, Register stays right-aligned, the popover opens on tap below its trigger, and there is no horizontal scroll at 360 px (UX-DR-P31).

**Given** the story is implemented
**When** CI runs
**Then** Vitest + MSW cover: unregistered vs registered body selection, skeleton, upstream 403 → tab no-access (vs proxy `NOT_ALLOWED` → load error), load error + Retry, debounce timing (no request before 600 ms), stale-response discard, option label mapping for both types, paging to "No more results", the error row + same-query retry, zero results, keyboard selection and clear, and the no-draft rule
**And** the proxy tests cover the two allowlist entries' allowed and rejected query rows
**And** a Playwright test against the mocked proxy covers UJ-103 steps 1–3 (open tab, search "ruiz miami", pick a personal NPI, pick a practice) and parity checklist row 8 (search individual and organization).

**Note:** Accepted 2026-10-13: the Register button may render inert (sends nothing) until Story 9.2 lands (same release).

**Covers:** FR113, FR114, FR103 (Provider tab), PNFR1, PNFR2, PNFR3, PNFR4, PNFR6, PNFR12 (type enforcement), AD-2, AD-10, AD-12, AD-15, AD-19, AD-20, AD-23 · UX-DR-P5, UX-DR-P13, UX-DR-P14, UX-DR-P15, UX-DR-P18, UX-DR-P26, UX-DR-P27, UX-DR-P28, UX-DR-P29, UX-DR-P31, UX-DR-P32, UX-DR-P34 (D-UX5) · **Jira:** NG-9019

### Story 9.2: Register

**Jira:** [NG-9040](https://1hio.atlassian.net/browse/NG-9040)
*Foundation 2026-10-14: built in spec F1 — the NPI-taken row in `lib/api/errors/npi.ts`: the real backend text `Operation failed. The chosen (Personal|Practice) NPI Number: <n> is already registered.` (not a `PERSONAL_NPI_…` prefix) → `mapApiError("provider", …)` = `{kind:"coded", code:"NPI_ALREADY_REGISTERED"}`; the result does not say which NPI, so this story picks the field from its own request; `keys.npi()` (mutate after register). Use it; do not rebuild. Remaining for this story: everything else (Team B). Area files (edit only these, never the `index.ts` aggregators): allowlist `lib/server/proxy/allowlist/npi.ts`, copy `lib/shared/messages/npi.ts`, errors `lib/api/errors/npi.ts`.*
*Foundation 2026-10-14: built in spec F3-1 — `Button` `busy` + `busyLabel="Registering…"` for Register (inert, polite status), `InlineBanner variant="error"` (`role="alert"`; change `announceKey` per attempt) for the registration error, `FieldError` for the taken messages, `toastSuccess` for "Provider NPI registered" / "Provider and practice NPIs registered". Use it; do not rebuild. Remaining for this story: unchanged (Team B).*

As Dr. Ruiz, having picked my personal NPI and my clinic's NPI,
I want to press Register and have my 1health account linked to them, with a clear message if either is already taken or the registration fails,
So that I'm recognized as a provider without accidentally claiming someone else's NPI.

**Acceptance Criteria:**

**Given** the Register endpoints
**When** this story is done
**Then** the proxy allowlist gains these exact entries, each with proxy tests (AD-2):
- `GET v2/health/npi/{n}/is-registered`: `{n}` matching `^\d{1,19}$`, no query params;
- `POST v2/user/register/npi`: JSON body schema `{ providerNpiId: integer, practiceNpiId?: integer }`, no other keys (an extra key or a non-integer value → 400), no query params; non-JSON `Content-Type` → 415; no CSRF or `X-PP-Session` check (D5)
**And** both entries are tagged `profile: true`, so they return 503 `SERVICE_DISABLED` when `ACCOUNT_DISABLED=1` (Story 1.3 proxy-level kill switch, AD-20)
**And** `lib/api/npi.ts` adds `isNpiRegistered(recordId)` and `registerNpi({ providerNpiId, practiceNpiId? })`, both through `callApi`.

**Given** the personal combobox has no selection (empty, or text typed but no option picked)
**When** focus leaves it, or I press Register
**Then** "Personal NPI is required" shows under the field as `help-text-error`, linked with `aria-describedby` and `aria-invalid="true"`
**And** on Register, focus moves to the personal field and no request is sent (FR115, UX-DR-P16)
**And** selecting a personal NPI clears the error.

**Given** a personal NPI is selected (and optionally a practice NPI)
**When** I press Register
**Then** Register immediately shows a spinner + "Registering…", becomes disabled (`aria-disabled` and click no-op), and any registration error banner from a previous attempt is removed
**And** the app calls `GET v2/health/npi/{id}/is-registered` with the **record id** (`NpiOption.id`, never the 10-digit NPI) for the personal selection and, when chosen, the practice selection, in parallel (AD-23).

**Given** either check returns `true`
**When** the checks resolve
**Then** nothing is posted
**And** a taken personal NPI shows "This personal NPI is already registered. Check that you selected your own." under the personal field, and a taken practice NPI shows "This practice NPI is already registered. Check that you selected the right practice." under the practice field. Both show when both are taken
**And** focus moves to the first field with an error, and Register returns to its idle state
**And** changing the selection in a field clears that field's taken message.

**Given** both checks return `false` (or only the personal check ran)
**When** the checks resolve
**Then** `POST v2/user/register/npi` is sent once with `{ providerNpiId }`, or `{ providerNpiId, practiceNpiId }` when a practice is selected, using record ids
**And** no confirmation dialog is shown at any point (PRC7).

**Given** I double-click Register, or press Enter twice quickly
**When** the clicks land during the checks or the POST
**Then** an in-flight ref guards the handler, so the checks run once and the POST is sent exactly once. A test asserts one POST for two rapid clicks (FR115).

**Given** the POST succeeds (200)
**When** it resolves
**Then** the toast reads "Provider NPI registered" (personal only) or "Provider and practice NPIs registered" (personal + practice)
**And** `["pp","npi"]` is revalidated, the Section swaps to the registered body that `features/provider/registered-view.tsx` renders, and focus moves to the Section `h2` "Healthcare credentials"
**And** the form selections are discarded from component state.

**Given** a check or the POST fails with a platform message (4xx/5xx carrying `message`)
**When** it resolves
**Then** an `inline-banner-error` (`role="alert"`) appears inside the Section, under the instruction line and above the comboboxes, showing that message (D-UX6, UX-DR-P13)
**And** with no platform message it shows "There was an error in the registration. Please call 1-888-555-1212 for assistance."
**And** it is never a toast. The banner stays while I edit the fields and is removed only when I press Register again
**And** Register returns to its idle state and the selections are kept.

**Given** the POST answers with an error whose message starts with `PERSONAL_NPI_IS_ALREADY_REGISTERED` or `PRACTICE_NPI_IS_ALREADY_REGISTERED` (a race after the checks)
**When** `lib/api/errors.ts` maps it to `NPI_ALREADY_REGISTERED` (AD-19)
**Then** the matching taken message shows under its own field (personal or practice by prefix) instead of the banner.

**Given** the POST gets a 5xx or a timeout
**When** the error is handled
**Then** the request is never automatically replayed. Only a proxy-originated `TOKEN_EXPIRED` may replay it once after refresh (AD-16)
**And** a test asserts a single POST after a 502 and after a 504.

**Given** any Register call returns an upstream 403 (`FORBIDDEN`)
**When** it is handled
**Then** the Provider tab shows the tab-level `no-access-panel` (AD-23 owner table)
**And** `SESSION_EXPIRED` hands off to the session dialog (Epic 1; there is no `SESSION_CHANGED`, D5). The selections are not drafted and are gone after re-launch (PNFR1, UJ-105).

**Given** accessibility
**When** a keyboard or screen-reader user registers
**Then** the field errors are announced, "Registering…" is announced politely, the banner is announced as an alert, and an axe check of the error states passes (PNFR2).

**Given** the story is implemented
**When** CI runs
**Then** Vitest + MSW cover: required on blur and on Register; is-registered called with record ids (never the NPI); personal-taken, practice-taken and both-taken, each sending no POST; personal-only and personal+practice bodies and toasts; double click → one POST; platform-message banner and 1-888 fallback banner, cleared only on the next Register; race `NPI_ALREADY_REGISTERED` mapping to the field; no replay after 5xx; 403 → tab no-access; focus to `h2` on success
**And** the proxy tests cover the two entries (bad id, extra body key, non-integer id, non-JSON `Content-Type` → 415)
**And** Playwright (mocked proxy) covers UJ-103 steps 4–5 (Register → "Registering…" → registered body with focus on the `h2`), the "personal NPI already taken" edge, and parity checklist row 8 (register personal only, personal + practice, the already-registered checks, the error fallback).

**Covers:** FR115, PNFR1, PNFR2, PNFR6, PNFR12 (SM-C101), AD-2, AD-16, AD-17 (as superseded by D5: 415 JSON check only), AD-19, AD-23, PRC7 · UX-DR-P13, UX-DR-P16, UX-DR-P26, UX-DR-P32, UX-DR-P34 (D-UX6) · **Jira:** NG-9019

### Story 9.3: Registered view

**Jira:** [NG-9041](https://1hio.atlassian.net/browse/NG-9041)

*Foundation 2026-10-14: built in spec 7.0b-2 — `navigate({ external: "handoff", href })` and `navigate({ page: "profile", tab: "contacts", hash: "signature" })`. Use it; do not rebuild. Remaining for this story: everything else (Team B; `/api/pp/practice-support` on the F2 named-op wrapper; `#signature` scrolling is F3).*
*Foundation 2026-10-14: built in spec F1 — `isTenantMember(myself, tenantId)`, `myself.tenants` and `myself.signature` in `lib/api/myself.ts` (this story does not extend it), `keys.practiceSupport()` (declared), `NO_PRACTICE` in `lib/shared/bff-contract.ts`, `lib/shared/safe-href.ts#safeHref`, `formatPhoneDisplay(value, phoneRegion)`, the `GET v2/file/{fileId}/download` image entry in `lib/server/proxy/allowlist/files.ts` (this story does not add it). Use it; do not rebuild. Remaining for this story: `/api/pp/practice-support` (F2 named-op wrapper) and its loader, `info-popover` (F5), the view (Team B). Area files (edit only these, never the `index.ts` aggregators): allowlist `lib/server/proxy/allowlist/npi.ts`, copy `lib/shared/messages/npi.ts`, errors `lib/api/errors/npi.ts`.*
*Foundation 2026-10-14: built in spec F2 — `GET /api/pp/practice-support` (`app/api/pp/practice-support/route.ts` → `lib/server/named-ops/practice-support.ts#createPracticeSupportHandler`, `supportContact`; kill switch `"account"`; `GET v2/user/npi` → `practiceNpi.organization.tenantId` (absent, `user/npi` 404 or not a safe integer → 404 `NO_PRACTICE`) → `GET v2/tenant/sys-config?Tenant%20IDs=<id>&includeAllRelations=true`; answers only `PracticeSupportBody {name?, phone?, phoneRegion?, email?}` (name = `shortOrganizationName` → `name` → `tenantName`; `{}` when sys-config has no matching tenant); upstream 403 relayed (→ `FORBIDDEN`), other upstream errors 502; `BFF_PATHS.practiceSupport`) with its route tests. Use it; do not rebuild. Remaining for this story: Team B: the `practiceSupport` loader (`registerFetcher` for `keys.practiceSupport()`, fetched on popover open only), the practice popover on `info-popover` (F5), the registered view and its component/Playwright tests.*
*Foundation 2026-10-14: built in spec F3-1 — `InfoIconButton({ "aria-label": "About the signature" })` + `Tooltip` for the signature hint, `InlineBanner variant="info"` for "This organization already exists…", `focus-ring`. Use it; do not rebuild. Remaining for this story: unchanged (Team B; F5 `info-popover`, F3-3 `SignatureThumb`).*
*Foundation 2026-10-14: built in spec F3-2 / F3-3 — `KeyValueTable` (four columns row by row on desktop, one pair per row on mobile), `SignatureThumb({ fileId: myself.signature?.id, fallback: "No signature available" })` (thumb skeleton while loading, error → fallback), `forbiddenScopeFor(path, "account")` → `practice-popover` for a 403 on `pp/practice-support`. Use it; do not rebuild. Remaining for this story: unchanged (Team B; F5 `info-popover`).*

As Dr. Ruiz, now registered as a provider,
I want to see my registered credentials, my practice's support contact, my signature and, when it applies, a way to register my practice,
So that I can confirm what 1health has on file and know my next step for my practice.

**Acceptance Criteria:**

**Given** `user/npi` has a `providerNpi`
**When** the Section renders
**Then** `features/provider/registered-view.tsx` (the minimal body from Story 9.1) becomes the full read-only key/value table in FR116 order, using the Account settings read layout. On desktop it has four columns (key | value | key | value), filled row by row: NPI · Taxonomy / Health Information Exchange · Practice name / Practice address · Practice NPI / Licenses · Address of practice / Signature. On mobile it shows one Field | Value pair per row (UX-DR-P17, PM2, PM7)
**And** the values map as: NPI ← `providerNpi.npi` (`mono-value`); Taxonomy ← `providerNpi.taxonomy.name`; Health Information Exchange ← `hieEndpoint.endpoint`; Practice name ← `practiceNpi.providerOrganizationName`; Practice address ← `practiceNpi.providerFirstLineBusinessPracticeLocationAddress`; Practice NPI ← `practiceNpi.npi` (`mono-value`); Licenses ← `providerNpi.providerLicenseNumber`; Address of practice ← `providerNpi.providerFirstLineBusinessPracticeLocationAddress` and `…SecondLine…` on two lines (an empty line 2 is omitted); Signature ← `myself.signature.id`
**And** there is no edit, unregister or other mutating affordance in the Section.

**Given** a value is null, empty, `"n/a"` (any case), `-1` or `"-1"`
**When** it renders
**Then** it reads "Not provided" in `kv-value-empty` (FR116, PM3)
**And** with no `practiceNpi`, Practice name, Practice address and Practice NPI all read "Not provided", and no popover, banner or CTA renders
**And** a unit test covers each mapping and each "Not provided" case.

**Given** `practiceNpi.organization` is present (the practice is a 1health Organization)
**When** the Practice name value renders
**Then** it is a `link-text`-styled button with `aria-expanded` and `aria-controls` that opens the Practice-name support `info-popover` on hover (150 ms), keyboard focus or click/tap. It opens below the trigger (flipping above only without room), does not move focus on open, and closes on Escape (focus back to trigger), blur or outside click (UX-DR-P18, PM10)
**And** when `practiceNpi.organization` is absent, Practice name is plain `kv-value` text with no popover and no request.

**Given** the Practice-name popover opens for the first time
**When** its content loads
**Then** the client calls `GET /api/pp/practice-support` through `callApi` under SWR key `["pp","practice-support"]`, and only then (never on tab mount)
**And** while it loads, the popover shows a spinner + "Loading…" *(draft copy)*
**And** on success the popover shows the organization name (600), the support phone (tabular, via `formatPhoneDisplay()` from Story 7.4 using `phoneRegion`) and the support email as a `mailto:` link in `link-text`, built only through `safeHref()` (plain text when it returns `undefined`). Missing fields are omitted, and with none of the three it shows "-" (PM8)
**And** on an upstream 403 only the popover shows "You don't have access to this in your current account". The rest of the view is unaffected (AD-23 owner table)
**And** on any other failure the popover shows "Couldn't load the support contact." *(draft copy)* with a "Try again." button in `link-text` that refetches only that key.

**Given** `lib/shared/safe-href.ts`
**When** this story needs it for the support email
**Then** it exports `safeHref(value)` returning the value only when its protocol is `https:`, `mailto:` or `tel:`, else `undefined` (spine AD-11); it is created here if Story 3.7 or Story 10.2 hasn't already, and whichever lands later reuses it. *(built: spec F1)*

**Given** the named operation `GET /api/pp/practice-support` (AD-25)
**When** `app/api/pp/practice-support/route.ts` is added
**Then** it exports `dynamic = "force-dynamic"`, calls `requireSession()` (no session → 401), reads `GET v2/user/npi` server-side, and takes `practiceNpi.organization.tenantId`. When that is absent → 404 `{errorCode:"NO_PRACTICE", source:"proxy"}` *(error code name: draft)* *(built: spec F2)*
**And** it calls upstream `v2/tenant/sys-config` with exactly `Tenant%20IDs=<tenantId>&includeAllRelations=true` and no client-supplied parameter (any client query → 400 `BAD_QUERY`), so the tenant id never comes from the browser *(built: spec F2)*
**And** it returns only `{ name?, phone?, phoneRegion?, email? }` of the support contact. Nothing else from the upstream body reaches the client *(built: spec F2)*
**And** it passes upstream 403 through as `FORBIDDEN`, answers 503 `SERVICE_DISABLED` when `PP_DISABLED=1` or `ACCOUNT_DISABLED=1`, sends AD-18 no-store headers with `cache: "no-store"` upstream, and logs only method, route template, status, duration and request id *(built: spec F2)*
**And** `v2/tenant/sys-config` stays denied as a passthrough (a proxy test asserts `GET /api/1h/v2/tenant/sys-config` → 403 `NOT_ALLOWED`). *(built: spec F2)*

**Given** `practiceNpi.organization` is present
**When** the area below the table renders
**Then** `lib/api/myself.ts#isTenantMember(myself, practiceNpi.organization.tenantId)` (`myself.tenants.some(t => t.id === tenantId)`) decides membership. This story adds `isTenantMember` and the `tenants` and `signature` fields to the Story 7.4 `lib/api/myself.ts`, with unit tests. No other code computes membership, and the org list is never used for it (AD-23)
**And** when it returns `false`, an `inline-banner-info` reads "This organization already exists - please contact their support to be added to their portal."
**And** when it returns `true`, nothing renders below the table
**And** in both cases the "Register your practice" check is not run, so the banner and the button never show together (PM6).

**Given** a `practiceNpi` with no `organization`, `practiceNpi.verified === true` and a `practiceNpi.id`
**When** the area below the table renders
**Then** the app calls `GET v2/health/npi/{practiceNpi.id}/is-registered` (the allowlist entry from Story 9.2) with the record id from `user/npi`, never the 10-digit NPI and never the legacy `public/npi/list` lookup (AD-23)
**And** only when it returns `false` does a `button-outline` "Register your practice to enable ordering" render (no external-arrow icon, no "(opens in a new tab)", UX-DR-P25)
**And** when it returns `true`, fails, or `verified` is not `true`, nothing renders below the table and no error is shown.

**Given** "Register your practice to enable ordering"
**When** I activate it
**Then** it calls `navigate({ external: "handoff", href: "/handoff/portal?to=create-org" })` (AD-26). The leave guard runs first if Personal account settings is dirty, then the same tab navigates. Drafts are kept and logout is not called (AD-22, PM11)
**And** it is a `button`, not a raw `<a href>` or `next/link`, so the AD-26 lint rule passes.

**Given** the Signature row and `myself.signature.id` present
**When** it renders
**Then** it shows the 112 × 32 px `signature-thumb` as `<img src="/api/1h/v2/file/{id}/download" alt="Your signature">` through the `GET v2/file/<n>/download` `asImage` entry (`preview=true` server-forced by Story 1.3, AD-13); if Story 2.1 has not landed yet, this story adds that entry exactly as Story 2.1 specifies it, and whichever lands second reuses it. There is no blob conversion and no token in the browser
**And** if the image fails to load, the value falls back to "No signature available".

**Given** the Signature row with no `myself.signature`
**When** it renders
**Then** it reads "No signature available".

**Given** the Signature row, either way
**When** it renders
**Then** the value is followed by a "?" `info-icon-button` (circle-help) named "About the signature", whose Tooltip "The signature can be changed from the Personal Profile" opens on hover, focus or tap and closes on Escape (D-UX7, UX-DR-P5)
**And** it is followed by the in-app link "Personal Profile" in `link-text`, which calls `navigate({ page: "profile", tab: "contacts", hash: "signature" })`. That runs the leave guard if Personal account settings is dirty, then lands on `/?tab=contacts#signature` with the shared SWR cache kept (AD-26, UX-DR-P30).

**Given** `myself` is still loading
**When** the Registered view renders
**Then** the table renders from `user/npi`, the Signature value shows a thumb-sized skeleton, and the banner-or-CTA area waits for `myself`. Neither the banner nor the CTA flashes before membership is known.

**Given** the Registered view after a Story 9.2 registration
**When** the Section swaps
**Then** the full view renders with focus on the Section `h2` (Story 9.2 behaviour, unchanged).

**Given** accessibility and responsive rules
**When** the view is checked
**Then** the Practice-name trigger, the "?" button, the link and the CTA are 44 px targets with focus rings and accessible names
**And** keyboard order is (i), table in reading order (Practice name trigger → popover links → … → "?" → "Personal Profile"), then banner or CTA (UX-DR-P29)
**And** an axe check passes in both themes, with no horizontal scroll at 360 px (PNFR2, PNFR4).

**Given** the story is implemented
**When** CI runs
**Then** Vitest + MSW cover: field mapping and every "Not provided" case; Practice name as button vs plain text; popover lazy fetch, success content, "-", 403-in-popover and error + retry; `isTenantMember` true/false; banner vs CTA vs neither for each `organization`/`verified`/`is-registered` combination (never both); is-registered called with `practiceNpi.id`; the CTA and the Signature link call `navigate()` with the exact targets; signature image, failed image and missing signature
**And** route tests for `/api/pp/practice-support` cover 401 without session, 404 with no practice organization, the exact upstream query, response field whitelisting, client query → 400, upstream 403 passthrough, 503 with `ACCOUNT_DISABLED=1`, no-store headers and logs without query strings *(built: spec F2)*
**And** Playwright (mocked proxy) covers UJ-103 step 5 (full registered view after Register) and parity checklist row 9 (all fields, the practice popover, the "already exists" text, the signature with "?" and link, and the Register-your-practice CTA → `/handoff/portal?to=create-org` same tab).

**Covers:** FR116, FR103 (popover scope), PNFR1, PNFR2, PNFR4, PNFR6, AD-2, AD-13, AD-18, AD-19, AD-20, AD-22, AD-23, AD-25, AD-26, PRC10, PRC12 · UX-DR-P5, UX-DR-P17, UX-DR-P18, UX-DR-P25, UX-DR-P26, UX-DR-P29, UX-DR-P30, UX-DR-P31, UX-DR-P32, UX-DR-P33 (PM6, PM7, PM8, PM10), UX-DR-P34 (D-UX7) · **Jira:** NG-9019

## Epic 10: My Organizations

Users search and page through their organizations, recognize them by logo and type, check the primary contact, and enter each organization's portal.

**FRs covered:** FR117, FR118, FR119, FR120 · **Depends on:** Epic 1 (proxy, `callApi`, keys, messages, leave guard) and Epic 7 (`/account` route and tabs, `navigate()` AD-26, `no-access-panel`, load-error banner, `/handoff/portal` route AD-22) · **Jira:** NG-9019

### Story 10.1: List, search and pagination of my organizations

**Jira:** [NG-9042](https://1hio.atlassian.net/browse/NG-9042)

*Foundation 2026-10-14: built in spec 7.0b-2 — `navigate({ external: "handoff", href: "/handoff/portal?to=create-org" })` with the leave guard. Use it; do not rebuild. Remaining for this story: everything else (Team B; `keys.orgs` in F1).*
*Foundation 2026-10-14: built in spec F1 — `keys.orgs(name, page)` = `["pp","orgs",name,page]` (declared; `lib/api/organizations.ts` registers the `orgs` loader), `ErrorScope "organizations"`. `lib/shared/initials.ts#initials(...names)` takes the first letter of each name; it does not implement the org rule (first two words, one word → its first two letters, non-letters skipped, `"?"`), so add that rule as a second export of `lib/shared/initials.ts`, not a new module. Use it; do not rebuild. Remaining for this story: everything else (Team B). Area files (edit only these, never the `index.ts` aggregators): allowlist `lib/server/proxy/allowlist/orgs.ts`, copy `lib/shared/messages/orgs.ts`, errors `lib/api/errors/orgs.ts`. A new `lib/api/<resource>.ts` registers its own loader with `registerFetcher()` and is re-exported from `lib/api/index.ts`.*
*Foundation 2026-10-14: built in spec F3-1 — `LoadError` on `InlineBanner` for the grid error, `Button` with `aria-disabled` (inert, focusable) for Previous/Next at the ends, `focus-ring`. Callers of `LoadError`/`ReadStateFor` pass `attempt` (failure count) so a repeated failure is re-announced. Use it; do not rebuild. Remaining for this story: unchanged (Team B).*
*Foundation 2026-10-14: built in spec F3-3 — `StateFrame` (`skeleton="cards"`: 12 placeholders in `ORG_GRID_CLASSES` with 72 px logo bars, static under reduced motion; `loadError: { kind: "page" }`; `onRetry` reloading only the current `keys.orgs(name, page)`; `attempt`), the tab-level `NoAccess` when `forbiddenScopeFor(path, "account")` returns owner `organizations` (frame `level="tab"`, replaces search, grid and pager); `ORG_GRID_CLASSES` for the real grid. Use it; do not rebuild. Remaining for this story: unchanged (Team B).*

As Mónica, a lab owner who belongs to several 1health organizations,
I want the My Organizations tab to list my organizations, let me search them by name and page through them,
So that I can find the organization I need in a few keystrokes, or learn how to register one when I have none.

**Acceptance Criteria:**

**Given** the allowlist (AD-2) and the client module
**When** this story lands
**Then** the passthrough entry `GET v2/user/organization/portal` is added (tagged `profile: true`; Story 1.3 proxy-level `ACCOUNT_DISABLED` 503) with exactly `name` (string ≤ 100 chars, may be empty), `page` (`^\d{1,4}$`) and `size` (≤ 12); a request outside those bounds gets 400 from the proxy and is never forwarded (proxy table rows: `size=13` → 400, `page=12345` → 400, 101-char `name` → 400, valid request → forwarded)
**And** `lib/api/organizations.ts#listOrganizations({name, page})` calls it through `callApi("organizations/list", …)` with `size=12` and 0-based `page`, maps the wire DTO to a domain type `{ tenantId, enabledInTenant, name, shortName, types: string[], personContacts }`, drops items whose `organization` is `null`, and sorts the rest by `shortOrganizationName ?? name` (case-insensitive, `localeCompare`) within the page (AD-23, R6)
**And** the SWR key is `keys.orgs(name, page)` = `["pp","orgs",name,page]` (AD-10), where `name` is the trimmed search text *(built: spec F1)*
**And** `features/organizations` is the only consumer; `subdomain`, `tenantLogo.publicUrl` and every other unused DTO field are not exposed by the domain type.

**Given** a signed-in user opens `/account?tab=organizations`
**When** the tab mounts
**Then** the organization list loads only now (no prefetch from other tabs, PNFR3) and, while in flight, the grid shows 12 card placeholders (logo, title and button bars, `skeleton-row` bars, shimmer static under `prefers-reduced-motion: reduce`) in the grid's current column count (UX-DR-P24, UX-DR-P27), while app bar, header and tab strip render immediately.

**Given** the list returns renderable items
**When** the grid renders
**Then** it shows one card per item in a grid of 4 / 3 / 2 / 1 columns at ≥ 1280 / ≥ 1024 / ≥ 640 / below with 16 px gaps (PNFR4, UX-DR-P20)
**And** in this story each card is a basic `org-card` (card, border, `rounded-md`, 16 px padding, no shadow) that is an `article` labeled by its name heading and shows only the `org-initials-tile` (72 px, muted bg, muted-foreground two initials 600) and the name (`shortName ?? name`); Story 10.2 enriches the same component with logo, types and the (i) popover, and Story 10.3 adds Enter portal; nothing in this story renders a placeholder button
**And** initials are the first letters of the first two words of the displayed name, uppercased (one word → its first two letters; non-letters skipped; nothing usable → "?"), unit-tested.

**Given** the search field above the grid
**When** it renders
**Then** it is a full-width `input` with a leading search icon, placeholder and visible-or-`sr-only` label "Search organizations" (V&T), `maxLength=100` (AD-2)
**And** typing triggers a server search 500 ms after the last keystroke (debounced, trimmed; whitespace-only = empty), with `page` reset to 0 (shown as page 1) (FR117, UX-DR-P19)
**And** a change that leaves the trimmed text unchanged issues no new request
**And** after each completed load (search or page change) a polite live region announces "{N} organizations" where N is the server `totalElements` ("1 organization" when N = 1) (UX-DR-P19, PNFR2).

**Given** results exist
**When** the pagination renders
**Then** it is centered under the grid with Previous, page numbers and Next, each a 44 px target, using the server `totalPages` as is (AD-23)
**And** the current page has the muted fill, foreground text and `aria-current="page"`
**And** Previous is `aria-disabled="true"` on page 1 and Next on the last page (both on a single page) and activating them does nothing (PM10, UX-DR-P23)
**And** pagination shows whenever there are results, even with one page (FR117).

**Given** the user changes page
**When** the new page loads
**Then** the page scrolls to the top of the grid (smooth, instant under reduced motion) and focus moves to the first card's name heading (`tabIndex={-1}`), and the count is announced.

**Given** page 0 with no search text returns no renderable items (`totalElements === 0`, or every item had `organization == null`)
**When** the tab renders (PA6, AD-23 empty rule; not the legacy `user.tenants.length <= 1` shortcut)
**Then** an `empty-card` shows the title "You aren't managing any organizations yet" (section-title), the sub-line "Register an organization with 1health to unlock the platform features listed below", and four feature rows (24 px muted-foreground icon · name 600 · muted description): Lab (FlaskConical) "Add your tests offered and enable order management."; Healthcare (HeartPulse) "Order tests, get results, and manage your patients."; Supplier (Truck) "Provide fulfillment and logistics for collection devices."; Go To Market (Store) "Create and sell test products." (FR119, UX-DR-P24, addendum §B)
**And** there is no search field and no pagination in this state.

**Given** a regular user (login email from `myself.email` not ending in an internal domain)
**When** the empty state renders
**Then** the primary "Register organization" is an anchor to the `CHECKOUT_URL` constant (`https://learnmore.1health.io/product-checkout`, `lib/shared/profile-constants.ts`) with `target="_blank" rel="noopener noreferrer"`, an external-arrow icon and accessible name "Register organization (opens in a new tab)" (PA1, AD-5 exception)
**And** it runs no leave guard and the app stays open in its own tab.

**Given** an internal user, whose login email ends (case-insensitive) in one of `INTERNAL_EMAIL_DOMAINS` = `["@1health.io", "@tachin.ai"]` (`lib/shared/profile-constants.ts`, AD-23)
**When** the tab renders
**Then** a `button-outline` "Create new organization" (plus icon) shows to the right of the search field (stacking below it under 768 px) whenever the search field shows (UX-DR-P19, UX-DR-P31)
**And** in the empty state "Register organization" is a primary button with no external-arrow icon and no "(opens in a new tab)" (UX-DR-P25)
**And** both call `navigate({external:"handoff", href:"/handoff/portal?to=create-org"})` (AD-26, AD-22): leave guard first, then the same tab navigates; no logout, drafts kept
**And** `foo@1health.io.evil.com` and `foo@not1health.io` are treated as regular users (unit test).

**Given** search text with zero results
**When** the tab renders
**Then** an `empty-row`-style single line "Sorry, no results were found" shows instead of the grid, with no pagination, the search field keeps its text and focus, and "0 organizations" is announced (FR119).

**Given** the list request fails with anything other than an upstream 403
**When** the tab renders
**Then** an `inline-banner-error` "Something went wrong while loading profile information · Retry" replaces the grid; Retry reloads only this list for the current search and page (FR103, UX-DR-P28); a platform `message`, when present, is shown per the AD-19 error rule; proxy `NOT_ALLOWED` shows this generic banner, never "no access" (there is no `CSRF`, D5).

**Given** the list request returns an upstream 403 (`FORBIDDEN`, no `source:"proxy"`)
**When** the tab renders
**Then** the tab-level `no-access-panel` "You don't have access to this in your current account" replaces the whole tab content (search, grid, pager) with no action, and the Personal Account and Provider tabs keep working (AD-23 403 owner table, PNFR11).

**Given** a 360 × 740 viewport
**When** the tab renders with results, empty, no-results and error states
**Then** there is no horizontal scroll, the grid is one column (two from 640 px), and search, Create new organization, pager items and Retry have ≥ 44 × 44 px targets
**And** keyboard order is search → Create new organization (internal) → cards row by row → pagination (UX-DR-P29).

**Given** the story is implemented
**When** CI runs
**Then** Vitest + MSW cover: null-organization drop and client sort (including an unsorted server page), empty rule (page 0 + no text vs. text + zero), debounce (one request after rapid typing, page reset), trim, internal-domain detection, pager aria-disabled ends and single-page pager, announcement text, error + Retry scoping, 403 → no-access panel
**And** Playwright (mocked proxy) covers addendum §E rows 10 (search, pagination, sorting) and 11 (no organizations for external and internal email, no results), plus an `@axe-core/playwright` scan of the tab in light and dark at desktop and 360 px with no WCAG 2.1 AA violations.

**Covers:** FR103 (Organizations tab), FR117, FR119, PNFR2, PNFR3, PNFR4, PNFR6, PNFR11, AD-2, AD-5 exception (PA1), AD-10, AD-19, AD-22, AD-23, AD-26, PA6 · UX-DR-P19, UX-DR-P20 (grid, basic card), UX-DR-P23, UX-DR-P24, UX-DR-P25, UX-DR-P26, UX-DR-P27, UX-DR-P28, UX-DR-P29, UX-DR-P31, UX-DR-P32 · **Jira:** NG-9019

### Story 10.2: Organization card — logo, name, types and primary contact

**Jira:** [NG-9043](https://1hio.atlassian.net/browse/NG-9043)

*Amended 2026-10-14 (decisions D1, D4): the logo host check uses the per-environment `publicFilesOrigin` from `lib/shared/environments.ts`, not a `PUBLIC_FILES_ORIGIN` env var.*
*Amended 2026-10-14 (decisions D5, D7): no `X-PP-Session` exists; the hardened route and CSP `img-src 'self' blob: data:` stay.*
*Foundation 2026-10-14: built in spec F1 — `NO_LOGO` in `lib/shared/bff-contract.ts`, `lib/shared/safe-href.ts#safeHref`, the initials helper (see Story 10.1). Use it; do not rebuild. Remaining for this story: `/api/pp/org-logo` on the F2 named-op wrapper with image hardening, `info-popover` (F5), the card enrichment (Team B). Area files (edit only these, never the `index.ts` aggregators): allowlist `lib/server/proxy/allowlist/orgs.ts`, copy `lib/shared/messages/orgs.ts`, errors `lib/api/errors/orgs.ts`.*
*Foundation 2026-10-14: built in spec F2 — `GET /api/pp/org-logo/[tenantId]` (`app/api/pp/org-logo/[tenantId]/route.ts` → `lib/server/named-ops/org-logo.ts#createOrgLogoHandler`; kill switch `"account"`; membership via `GET v2/user/organization/portal`, `ORG_PAGE_SIZE` 50 × `ORG_MAX_PAGES` 5, ids above 2^53 skipped; `tenantLogo.publicUrl` origin must equal `publicFilesOrigin` of the session environment (new `EnvironmentConfig.publicFilesOrigin` in `lib/shared/environments.ts`); no credentials, `redirect: manual`, `LOGO_TIMEOUT_MS` 5 s, `LOGO_MAX_BYTES` 512 KB; PNG/JPEG/WebP by magic bytes, `inline`; every failure incl. a stale token → 404 `NO_LOGO`; `BFF_PATHS.orgLogoPrefix`) with the route test rows. Use it; do not rebuild. Remaining for this story: Team B: the card (logo `<img src="/api/pp/org-logo/{tenantId}">` with the initials `onError` fallback, types, primary contact, `info-popover` from F5) and its component/Playwright tests; cache the membership lookup per session (or pass the list's tenant ids) and consider a short private max-age for successful logos (deferred-work: up to 5 membership calls plus an S3 fetch per `<img>`, ~70 upstream calls for 12 cards); confirm `publicFilesOrigin` (`bocore-public-files-{demo,prod}.s3.us-west-1.amazonaws.com`) against a live `tenantLogo.publicUrl` on demo and prod (deferred-work; a mismatch only shows initials, SVG logos always do).*
*Foundation 2026-10-14: built in spec F3-1 — `Tooltip` for the truncated name, type icons and the "+N" chip (tap opens, outside tap closes), `InfoIconButton({ "aria-label": "Primary contact for {name}", icon: "info" })` as the trigger of the F5 `info-popover`. Use it; do not rebuild. Remaining for this story: unchanged (Team B card; F5 `info-popover`).*

As Mónica, who manages a lab and a supplier on 1health,
I want each organization card to show its logo, name, what kind of organization it is and who its primary contact is,
So that I recognize the right organization at a glance and know whom to call.

**Acceptance Criteria:**

**Given** the named operation `GET /api/pp/org-logo/{tenantId}` (`app/api/pp/org-logo/[tenantId]/route.ts`, AD-24)
**When** it is called
**Then** it requires a session (`requireSession()`), has no `X-PP-Session` or CSRF check (D5), exports `force-dynamic` (AD-18) and returns 503 `SERVICE_DISABLED` when `ACCOUNT_DISABLED=1` (AD-20) *(built: spec F2)*
**And** it validates `tenantId` against `^\d{1,19}$` *(built: spec F2)*
**And** it finds the tenant by reading `GET v2/user/organization/portal` server-side with the session token (`size=50`, page 0 upward, stop at the match, at most 5 pages); not found → not a member *(built: spec F2)*
**And** it requires `new URL(item.tenantLogo.publicUrl).origin === publicFilesOrigin` of the session's `environment` from `lib/shared/environments.ts` (AD-3 as superseded by D1/D4; one deployment serves both environments, so this is not an env var; unset, null or unparsable URL fails) *(built: spec F2)*
**And** it fetches the logo with no credentials or cookies, `redirect: "manual"` (any 3xx fails), a 5 s timeout, `cache: "no-store"` and a 512 KB cap checked on `Content-Length` and while streaming *(built: spec F2)*
**And** it serves only PNG, JPEG or WebP whose leading bytes match (`89 50 4E 47`, `FF D8 FF`, `RIFF….WEBP`), with `Content-Type` from the matched bytes, `Content-Disposition: inline`, `X-Content-Type-Options: nosniff` and the AD-18 no-store headers; SVG and any other type fail *(built: spec F2)*
**And** every failure (bad id, not a member, host mismatch, redirect, timeout, too large, wrong bytes, upstream error) returns 404 `{errorCode:"NO_LOGO", source:"proxy"}` and is logged per AD-15 (no URL or query string) *(built: spec F2)*
**And** `v2/file/{id}/download` is never used for logos, and CSP `img-src` stays `'self' blob: data:` (the AD-21 value, unchanged; D7). *(built: spec F2)*

**Given** a card renders (the component from Story 10.1)
**When** the logo slot renders
**Then** it is `<img src="/api/pp/org-logo/{tenantId}" alt="">` (decorative; the card name labels the article) in `org-logo` (72 px tall, `object-contain`, left-aligned)
**And** while loading or on `onError` it shows the `org-initials-tile` from Story 10.1 instead, with no broken-image icon and no error message (FR118, UX-DR-P20).

**Given** the card name
**When** it renders
**Then** it shows `shortName ?? name` in section-title type on one line with CSS ellipsis; the full name is in the DOM (read whole by screen readers) and a Tooltip shows the full name on hover, keyboard focus or tap (FR118).

**Given** an organization with types
**When** the type row renders
**Then** it is a group labeled "Organization types" with at most 4 `type-icon`s (20 px lucide outline, `muted-foreground`, never color-coded), each a focusable 44 px Tooltip trigger whose accessible name is its label (UX-DR-P21)
**And** order is Lab, Health Provider, Supplier, Go To Market, then the remaining types alphabetically by label; duplicates are shown once
**And** the map is exactly: Lab → FlaskConical "Lab"; Health Provider → HeartPulse "Healthcare"; Supplier → Truck "Supplier"; Go To Market → Store "Go To Market"; Healthcare → HeartPulse "Healthcare"; Population Health → Users "Population Health"; Insurance → Umbrella "Insurance" (D-UX9); Carrier → Package "Carrier"; Manufacturer → Factory "Manufacturer"; Enterprise → Building2 "Enterprise"; Government Agency → Landmark "Government Agency"; n/a → CircleHelp "No types selected for this organization" (addendum §B)
**And** an empty `type` array shows the n/a icon; an unknown type string shows CircleHelp labeled with the platform type name and never throws (today Population Health crashes the card).

**Given** an organization with more than 4 types
**When** the type row renders
**Then** after the 4 icons an `overflow-chip` "+N" (chip height, border, secondary-foreground, `rounded-sm`) is focusable, and its Tooltip and accessible name list the hidden types alphabetically, e.g. "2 more types: Insurance, Population Health" ("1 more type: …" for one) (PM9, UX-DR-P22)
**And** it opens on hover, focus or tap and closes on Escape or blur.

**Given** the (i) `info-icon-button` (Story 7.5 component) at the card's top right (44 px target, 18 px icon, `muted-foreground`, accessible name "Primary contact for {name}", `aria-expanded`, `aria-controls`)
**When** it is hovered (150 ms delay), focused or clicked/tapped
**Then** a non-modal `info-popover` (`components/ui/info-popover.tsx`; if Epic 9 has not already added it, this story adds it with the three-variant contract of UX-DR-P18, and whichever story lands second reuses it; 280 px, popover tokens, `rounded-md`, elevation-2) opens below the trigger, left edge aligned, flipping above only without room (PM10), titled "Primary contact" (600)
**And** it shows the person contact whose `contactTypes` include "Primary": full name (with middle name unless it is "n/a"), phone (tabular) and email, each with a muted leading icon; the email is a `mailto:` link built only through `safeHref()` (`lib/shared/safe-href.ts`, spine contract `https:`/`mailto:`/`tel:`; created here if Story 3.7 or Story 9.3 hasn't already), rendered as plain text when `safeHref` returns `undefined`
**And** with no Primary contact, or a missing field, it shows "-" in that place
**And** opening on focus doesn't move focus; Tab goes from the trigger into the popover's link and onward; Escape closes and returns focus to the trigger; blur out of trigger and popover or an outside click closes it (UX-DR-P18).

**Given** the card in light and dark themes
**When** contrast is measured
**Then** type icons and (i) use `muted-foreground` (6.1:1 / 6.4:1 on card), initials 5.4:1 / 5.7:1, "+N" chip text 11.4:1 / 10.7:1, never Tier-1 `slate` (UX-DR-P1); no hex or palette classes in components (PNFR5).

**Given** a 360 px viewport or touch device
**When** the user taps a type icon, the "+N" chip, the name or (i)
**Then** the Tooltip or popover opens on tap and closes on outside tap, with no horizontal scroll (UX-DR-P31).

**Given** the story is implemented
**When** CI runs
**Then** route tests (MSW for upstream and files host) cover rows: non-numeric id → 404; not a member after 5 pages → 404; member found on page 3 → served; host mismatch → 404; `publicFilesOrigin` unset for the session's environment → 404; a demo-environment logo URL on a prod session → 404; 302 → 404; timeout → 404; `Content-Length` 600 KB → 404; streamed body over 512 KB → 404; SVG declared and SVG bytes → 404; PNG declared with JPEG bytes → served as `image/jpeg`; no cookie or `Authorization` sent to the files host; response headers asserted (nosniff, inline, no-store) *(built: spec F2)*
**And** component tests cover icon ordering and capping, "+N" accessible name, every mapped type, unknown type no-crash, n/a and empty types, initials fallback on `onError`, Primary contact selection and "-" fallback, `safeHref` rejecting `javascript:` emails, and popover Escape focus return
**And** Playwright covers addendum §E row 10 (logo fallback, 4 icons plus "+N", every type, primary-contact popover) with an axe scan in light and dark.

**Covers:** FR118, PNFR1 (logos server-side, no credentials), PNFR2, PNFR5, AD-3, AD-15, AD-17 (as superseded by D5: 415 JSON check only), AD-18, AD-20, AD-24, PRC9 · UX-DR-P1, UX-DR-P5, UX-DR-P18, UX-DR-P20, UX-DR-P21, UX-DR-P22, UX-DR-P31, UX-DR-P33 (PM9, PM10), UX-DR-P34 (D-UX9) · **Jira:** NG-9019

### Story 10.3: Enter portal

**Jira:** [NG-9044](https://1hio.atlassian.net/browse/NG-9044)

*Amended 2026-10-14 (decision D4): the hand-off target is the session environment's `portalUrl`, not `PORTAL_URL`.*
*Foundation 2026-10-14: built in spec 7.0b-2 — `navigate({ external: "handoff", href })` (leave guard, then same-tab assign, drafts kept, no logout). Use it; do not rebuild. Remaining for this story: the Enter portal button and disabled-card state (Team B), `/handoff/portal` (Story 7.3).*
*Foundation 2026-10-14: built in spec F3-1 — `DisabledAction({ reason: "You're disabled in this organization" })` for the disabled Enter portal (`aria-disabled`, focusable, accessible name kept, no-op, reason in Tooltip + `aria-describedby`), `focus-ring`, `InfoIconButton` (Story 10.2). Use it; do not rebuild. Remaining for this story: unchanged (Team B button and card state; `/handoff/portal` from Story 7.3).*

As Mónica, who needs to work inside one of her organizations,
I want an "Enter portal" button on each organization card,
So that I land in the 1health portal in that organization's context without losing anything I left unsaved.

**Acceptance Criteria:**

**Given** a card whose item has `enabledInTenant = true`
**When** the card renders
**Then** its bottom row shows a small `button-primary` "Enter portal" with accessible name "Enter portal for {name}", no external-arrow icon and no "(opens in a new tab)" (FR120, UX-DR-P20, UX-DR-P25)
**And** activating it (click, Enter, Space) calls `navigate({external:"handoff", href:"/handoff/portal?to=tenant&tenantId=<tenantId>"})` (AD-26), where `tenantId` is the numeric id from the list item checked against `^\d{1,19}$` on the client too; the href is built only from that id, never from `subdomain` or any other response field.

**Given** Personal account settings has unsaved edits
**When** the user activates Enter portal
**Then** the three-way leave guard opens first: Keep editing stays on the page with nothing navigated; Discard drops the edits and navigates; Save saves and navigates only on success (FR101 leave guard, AD-26)
**And** with nothing dirty the same tab navigates immediately via `location.assign`.

**Given** the hand-off navigates
**When** `/handoff/portal?to=tenant&tenantId=<n>` answers
**Then** the browser follows the 303 in the same tab to `<portalUrl>/?ctx=<n>` (or the `portalUrl` root while OQ1 is open, PNFR10) of the environment resolved by Story 7.3 (session if it unseals, else the `onehealth_environment` cookie, else `prod`; AD-22, D4)
**And** no `/api/session/logout` call is made, drafts in `pp:draft:v1:<environment>:<userId>:*` are kept, and no `window.open` or `target=_blank` is used (AD-5, PRC12)
**And** no request to `v2/user/switch-tenant/**` is ever made by the app (an MSW assertion fails the test on any such request; the proxy denies it per AD-2).

**Given** a card whose item has `enabledInTenant = false`
**When** the card renders
**Then** the card text uses `org-card-disabled` (`muted-foreground`), and Enter portal is a `button-aria-disabled` (`aria-disabled="true"`, still focusable, keeps the accessible name "Enter portal for {name}") with the Tooltip and `aria-describedby` text "You're disabled in this organization" on hover, focus or tap (addendum §D, UX-DR-P20)
**And** activating it does nothing: no guard, no navigation, no request
**And** the logo, types and (i) popover from Story 10.2 still work.

**Given** keyboard-only use
**When** the user tabs through a card
**Then** the order inside a card is (i) → type icons → "+N" → Enter portal, all with the `:focus-visible` ring, and Enter portal meets 44 × 44 px (PNFR2).

**Given** the story is implemented
**When** CI runs
**Then** component tests cover the hand-off href built from the id, the leave guard invocation through a mocked `navigate()`, the aria-disabled card (no navigation, Tooltip text) and the absence of any `switch-tenant` call
**And** Playwright UJ-104 runs against a mocked proxy: open Account → My Organizations, type "dnn", the grid narrows to one card and "1 organization" is announced, open (i) and see the Primary contact, activate Enter portal, assert the same tab requests `/handoff/portal?to=tenant&tenantId=<n>` and lands on the mocked portal URL with drafts untouched; edge: a disabled card's Enter portal is aria-disabled with "You're disabled in this organization"; a dirty Account settings form shows the leave guard before navigating
**And** addendum §E row 12 (Enter portal and organization-create hand-offs navigate the same tab after the leave guard) is automated in the parity checklist suite; SM-104 is verified in demo QA.

**Covers:** FR120, PNFR2, PNFR10, PNFR12 (SM-104, UJ-104), AD-2 (switch-tenant deny), AD-5, AD-12, AD-22, AD-26, PRC12 · UX-DR-P20 (disabled card), UX-DR-P25, UX-DR-P29, UX-DR-P33 (PM11) · **Jira:** NG-9019
