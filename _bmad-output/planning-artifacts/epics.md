---
status: final
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-personal-profile-2026-10-13/prd.md
  - _bmad-output/planning-artifacts/prds/prd-personal-profile-2026-10-13/addendum.md
  - _bmad-output/planning-artifacts/architecture/architecture-personal-profile-2026-10-13/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-personal-profile-2026-10-13/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-personal-profile-2026-10-13/EXPERIENCE.md
---

# Personal Profile (NG-9019) - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Personal Profile (NG-9019), decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR numbers match the PRD's FR-N ids. Endpoints per FR are in `addendum.md` §A.

**App Shell (PRD §4.1)**

FR1: Launch and sign-in. A Launching user opening the app from the 1health portal arrives signed in with no login screen: a valid launch payload lands on the Contacts tab within one page load; an invalid, expired, already-used or unencrypted payload shows an explanatory full-page screen with "Return to 1health" (never a blank page or raw error); each payload is exchanged exactly once and `lpl` is removed from the URL and browser history so a reload never replays it. (Environment selection: see Ambiguities — architecture AD-3 pins one environment per deployment and removes the chooser/referrer detection the PRD describes.)

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

NFR1: Security and privacy. Access and refresh tokens live only in `httpOnly`, `Secure`, `SameSite` cookies, are never readable by page JS and never returned in a response body; every 1health API call goes through the app's server-side proxy which attaches the token (the browser never sees the Bearer token); a Content Security Policy blocks inline and third-party scripts (address suggestions are server-proxied per AD-14, so no third-party script exception is needed); request/response debug logging is off in production and redacts tokens, SSN and secrets elsewhere; user-uploaded images are served only as raster images (PNG/JPEG/BMP), never rendered as documents; PHI/PII is never written to analytics or client storage, except FR2 drafts which exclude SSN and Signature.

NFR2: Accessibility. WCAG 2.1 AA, keyboard-only completion of every flow, visible focus, and reduced-motion support per 1health design-system rules.

NFR3: Design system. Only 1health design tokens, no hard-coded colors; red reserved for destructive actions and errors; light theme by default with dark theme supported.

NFR4: Performance. First meaningful content within 2.5 s on typical broadband after launch; Section reads load in parallel and each Section shows its own skeleton instead of blocking the page.

NFR5: Reliability. A failure in one Section's read or save never blocks the other Sections.

NFR6: Environments. Works against each 1health environment with the environment derived from the deployment/launch and API base URLs never hard-coded per call. (Architecture AD-3 amends to three deployments — dev, demo, prod — each pinned to one environment.)

NFR7: Browser support. Latest two versions of Chrome, Edge, Safari and Firefox, plus iOS Safari and Android Chrome; the app must work both in a new tab and inside the portal iframe (AD-5).

NFR8: External Application registration (release dependency). The app is registered in each environment (demo, then production; plus dev per AD-20) with launch URL `<APP_ORIGIN>/launch`, icon and launch secret, set **Active** and **allowed for patients** so patients can see it. Owner: Daniel Garcia.

NFR9: 1health-fe cutover flag (external release dependency, separate repo). A flag in 1health-fe makes the sidebar "Personal Profile" item launch this app instead of routing to `/profile`; `/profile` stays reachable as the rollback path and for users who can't launch external apps (MTA, Customer Support); legacy `/profile?tab=N` links keep working; the flag ships independently. Owner: Daniel Garcia.

NFR10: Option-list sources. Person, ContactPoint and Insurance value lists come from platform type metadata (`/v2/type/key/*`); gender identity options and Address Types are fixed lists in the app (addendum §C), with backend-seed race/ethnicity fallbacks if `/type/key/Person` fails.

NFR11: Rollout. Demo first, with QA executing UJ-1 to UJ-5; then production behind the 1health-fe flag.

NFR12: Rollback. Turning the 1health-fe flag off returns the sidebar to `/profile`; ending live sessions requires setting `isAllowedForPatients=false` or platform token revocation (disabling the app alone does not revoke tokens); app-side: Vercel instant rollback and `PP_DISABLED=1` kill switch (AD-20).

NFR13: Timeline. All scope ships in release 2026.07.01 "Conduit" on 2026-10-29; feature freeze 2026-10-22; demo QA complete by 2026-10-24, otherwise the production cutover is a no-go and moves to the next release.

NFR14: Success-metric instrumentation constraints. Save outcomes must be observable (SM-2 >= 98% first-attempt Section save success; SM-C1 "Save all with >= 1 failure" rate) without PHI, via the AD-15 telemetry events; validation must not be loosened to raise save success (SM-C2).

### Additional Requirements

**Brownfield starting point (impacts Epic 1 Story 1).** There is no greenfield starter template. The repo is an existing fork of a 1health External Application template, already upgraded to Next.js 16.4.0, React 19.3, TypeScript 6.0.3, Tailwind 4.3.3, zod 4, SWR 2.5, react-hook-form 7.90 + @hookform/resolvers 5.9, libphonenumber-js, signature_pad 5.1.4, lucide-react, ESLint 10 flat config (`pnpm lint` = `eslint .`). Not yet installed: `iron-session` 9.0.1, Vitest 5.0.4, @testing-library/react 16.3.3, MSW 3.0.3, @playwright/test 1.64.0. No `proxy.ts` exists yet. `next.config.mjs` still has `typescript.ignoreBuildErrors: true`. The first story must remove the legacy auth and template code:
- Delete `app/api/token/**` (sets non-httpOnly token cookies and returns tokens in the body), `app/auth/**`, `lib/auth-client.ts` (browser-side refresh), and `document.cookie` reads in `contexts/navigation-context.tsx` (AD-1, AD-4).
- Replace `contexts/navigation-context.tsx`, `contexts/session-context.tsx`, `hooks/use-session-expired.ts`, `components/auth-exit-dialog.tsx` with `features/shell` + `lib/api/session-events.ts` (AD-10, AD-19).
- Replace `components/home-page-client.tsx`, `components/settings-page.tsx`, `components/workflow/` with the profile page and Sections.
- Keep `lib/api/client.ts` `callApi` signature, extend per AD-19.
- Delete non-allowlisted `lib/api/*` modules: workflow, campaign, journey, grid, attachments, comments, custom-data, partnerships, query, schema, step-config, tenant.
- Remove `ignoreBuildErrors` (and `eslint.ignoreDuringBuilds`) from `next.config.mjs` (AD-20).
- Note: several of these files currently have uncommitted local modifications in git.

**Architecture paradigm and layering.** BFF + feature-sliced client. Only the Next.js server holds tokens and talks to 1health; the browser calls only same-origin `/api/...` through `callApi`. Layers and import rules: BFF (`app/launch/`, `app/api/1h/[...path]/`, `app/api/session/`, `app/api/places/`, `app/api/pp/`, `proxy.ts`, `lib/server/`) → `lib/server`, `lib/shared`; API client `lib/api/*` → `lib/shared`; Sections `features/<section-id>/` → `lib/api`, `features/shell`, `components/ui`, `lib/shared`; Shell `features/shell/` → `lib/api`, `components/ui`, `lib/shared`; UI kit `components/ui/` imports nothing app-specific. Target tree per Structural Seed (feature folders: shell, personal, phone, email, social, addresses, insurance, header, medical).

**Architecture decisions as implementable requirements**

- [AD-1] Implement one AEAD-sealed session cookie `__Host-pp_s` (iron-session, `SESSION_SECRET`) holding access token, refresh token, access expiry, `userId`, `personId`, `tenantId`, `sid` (random per launch), `gen` (refresh counter), plus `iat` and `lastSeen` (AD-16); attributes `HttpOnly; Secure; SameSite=None; Partitioned; Path=/`, no `Domain`, no `Max-Age`. Environment/API origin never in the cookie. Ids derived at launch from the token + `GET /v2/user/myself` (payload user id must equal token subject). Unsealable cookie = no session; never store `id_token`; unit test asserts `Set-Cookie` <= 3,800 bytes with the largest observed tokens. No response body contains a token. Every route handler and server component calls `requireSession()`; `proxy.ts` redirect is convenience only.
- [AD-2] Implement `app/api/1h/[...path]/route.ts` + `lib/server/proxy-allowlist.ts`: allowlist entries `{method, template, query, body, maxBytes?, asImage?}` for exactly the addendum §A endpoints; no match → 403 `NOT_ALLOWED`, wrong method → 405; never honor HEAD/OPTIONS/TRACE/`X-HTTP-Method-Override`/`_method`; explicitly deny `/auth/**`, `/v2/public/external-application/**`, admin prefixes. Owner ids `{personId}`/`{userId}` filled from the session; client sends literal `me`, anything else → 403; other ids must match `^\d{1,19}$`. Query params allowlisted per entry (unknown → 400); server-fixed `isPublic=false` (Signature, insurance cards), `isPublic=true` (Profile Picture only), `hardDelete=true` (file deletes only). Path normalization rejects `//`, `%2F`, `%5C`, `%25`, empty/`.`/`..` segments and segments containing `/ \ ; % @ :`, whitespace or control chars (400 `BAD_PATH`); upstream URL built by `API_ORIGIN + "/api/" + segments.map(encodeURIComponent).join("/")`, re-asserted origin + template. Traversal test table (`..%2F`, `%2e%2e`, `%252F`, `//host`, `;x`, trailing `/`, mixed case) → 400/403. GraphQL never proxied: Profile Picture id via named server op `GET /api/pp/profile-picture-id`. Forward only allowlisted request/response headers; drop upstream `Set-Cookie`/CORS. `redirect: "manual"` (3xx → 502 `UPSTREAM_REDIRECT`), 25 s timeout (504 `UPSTREAM_TIMEOUT`), streaming bodies (except upload entries). On upstream 401 or token past expiry (30 s skew) return `401 {code:"TOKEN_EXPIRED"}` without refreshing. Adding an endpoint = adding an allowlist entry in the same change.
- [AD-3] Implement `lib/server/env.ts` as the only reader of server `process.env`, exporting `API_ORIGIN`, `APP_ORIGIN`, `PORTAL_ORIGIN`, `PORTAL_URL`, `APP_ID`, `DEFAULT_TENANT_ID`, failing boot if any is missing. Origins fixed per `APP_ENV`: dev → `https://dev.1hdev.io`, demo → `https://demo.1health.io`, prod → `https://app.1health.io`. Each deployment holds only its own `ONEHEALTH_SECRET_KEY`/`APP_ID`. Remove the manual environment chooser and referrer detection.
- [AD-4] Implement `app/launch/route.ts` as a one-shot exchange: clear any existing `__Host-pp_s`; normalize `' '`→`'+'` in `lpl`; AES-GCM decrypt (12-byte IV), reject cleartext/malformed; reject app id ≠ `APP_ID`; exchange code exactly once via `POST /v2/public/external-application/auth/oauth2/user/token` (no retry); derive ids and check tenant; set sealed cookie with new `sid`; 303 → `/launch/verify?tab=<tab>` which re-reads the cookie and 303 → `/?tab=<tab>` or `/launch-error?reason=cookies`. `proxy.ts` 307-redirects `/` carrying `lpl` to `/launch` preserving query; `app/page.tsx` never reads `lpl`. `tab` validated against `contacts|insurance|medical` (default contacts); redirects are relative and fragment-free so `#signature` survives. Failures → `/launch-error?reason=<expired|used|invalid|tenant|cookies|config|disabled>`; unknown reasons render `invalid`; raw value never rendered/logged. No session and no `lpl` → launch-error screen (no login page).
- [AD-5] Support both new-tab and portal-iframe hosting: every response (incl. `/api/**`, `/launch-error`, static assets) carries CSP `frame-ancestors <PORTAL_ORIGIN>` (one origin, no `'self'`), no `X-Frame-Options`; supported host is `ExternalAppFrame` (sandbox `allow-scripts allow-forms allow-popups allow-same-origin`, no top navigation). On `reason=cookies` the launch-error screen offers "Open in a new tab" (opens `PORTAL_URL`, `target=_blank`). When framed (`window.self !== window.top`) hide the app-bar "Return to 1health" and make the session-expired action "Close and reopen from 1health" (no navigation). When not framed "Return to 1health" targets constant `PORTAL_URL`; no `returnUrl`/`next` params; any `postMessage` listener checks `event.origin === PORTAL_ORIGIN` and never posts to `'*'`.
- [AD-6] After exchange, compare the token tenant with `DEFAULT_TENANT_ID` (`1`); on mismatch set no cookie, fetch nothing, redirect to `/launch-error?reason=tenant` with copy "Personal Profile is available in your personal account. Switch to it in 1health and open the app again."
- [AD-7] Implement `SectionRegistry` + `useRegisterSection({id, label, displayOrder, form, validate(), save(), discard(), draftFields})`; Save all, leave guard, dirty count and drafts talk only to the registry. `save()` resolves `{ok:true} | {ok:false, error}` and never throws; multi-step saves run in fixed order and on step failure refetch their SWR keys and rebase the form baseline so retry sends only the remaining diff (Personal: `PUT /v2/user/edit` then Signature upload-then-delete; Addresses: PUT new Primary first, then other PUT/POST, then DELETE; Insurance: policy, then demoted policy, then card images). Section ids = URL hash = folder = draft key = telemetry id: `personal` (1, sub-anchor `#signature`), `phone` (2), `email` (3), `social` (4), `addresses` (5). Unknown tab → Contacts; unknown hash → top of tab. Insurance registers as guard-only (`saveAll:false, draftFields:[]`).
- [AD-8] Save all: validate every dirty Section first (any invalid → send nothing); then save sequentially in constant `SAVE_ORDER = personal → email → phone → social → addresses` (in `features/shell`, independent of displayOrder); a failure doesn't stop later Sections; `SESSION_EXPIRED`/`SESSION_CHANGED` stops the run; each Contact Point Section runs auto-verify right after its own successful save; toast "X saved, Y failed".
- [AD-9] Implement one Contact Point engine in `lib/api/contact-points.ts` shared by Phone, Email, Social: `diffToManageDTO(before, after)` → `contactPointsToAdd/Update/Remove`; a Primary switch puts new Primary and old (relabeled `"Old"`) in the same `contactPointsToUpdate`; `newUnverified(before, after)` drives auto-verify (label ≠ Home) via `POST /v2/health/contact-point/verify`. Contact Label list defined once in `lib/shared/contact-labels.ts` = backend enum ∩ `/type/key/ContactPoint` minus "Partnership Organization". `PUT /v2/user/edit` never sends `email`/`phoneNumber`.
- [AD-10] All reads via SWR with keys from `lib/api/keys.ts` (e.g. `["pp","myself"]`, `["pp","contact-points","Email"]`) and a shared `callApi` fetcher; after save a Section `mutate`s its own keys and affected keys (Personal also refreshes `myself` → header). No global client store besides `SectionRegistry`; `session-context` replaced by the `myself` key. Revealed SSN never in SWR/cache: `revealSsn()` → component state, cleared after 30 s, blur, `visibilitychange`, `pagehide`.
- [AD-11] Each Section owns `features/<section-id>/schema.ts` (zod 4) + one `useForm` with `zodResolver`; error messages are keys into `lib/shared/messages.ts` whose copy is EXPERIENCE.md Voice and Tone verbatim; backend `errorCode` → field/message mapping only in `lib/api/errors.ts`; Social URL fields validate `^https://` or a handle pattern; data-derived links render only via `safeHref()` (allows only `https:`, `mailto:`, `tel:`); lint rule bans `dangerouslySetInnerHTML`.
- [AD-12] Drafts in `localStorage`, key `pp:draft:v1:<userId>:<sectionId>`, value `{savedAt, baseHash, values}` with only the Section's `draftFields` (never SSN, Signature, Insurance); written only by the registry (debounced 500 ms on change, and immediately before the session-expired dialog opens); kept on session-expired "Return to 1health"; deleted on that Section's save/discard, on app-bar "Return to 1health" (after leave-guard confirm), and when older than 24 h (purge all expired `pp:draft:*` at app start); none written on `SESSION_CHANGED`; offered only when key userId equals current `myself` id; `baseHash` mismatch → per-Section conflict UI, never auto-merge.
- [AD-13] Files/images via proxy URLs with uploads <= 4 MB: client downscales/re-encodes images on canvas to <= 4 MB while user-facing limits stay (Profile Picture JPG/PNG/BMP <= 6 MB; insurance cards PNG/JPEG <= 10 MB, 6000x4000; Signature drawn or uploaded PNG/JPEG always converted to PNG). Proxy upload entries: `maxBytes` 4 MB (Signature 1 MB) checked on `Content-Length` and while reading (413 `TOO_LARGE`); multipart with exactly one file part named `file` or `fileNewVersion`; leading bytes must match PNG/JPEG/BMP (Signature PNG only) else 415 `UNSUPPORTED_MEDIA`. Downloads stream; images render as `<img src="/api/1h/…">` on `asImage` entries; `inline` only for declared `image/png|jpeg|bmp` with matching magic bytes, else `Content-Disposition: attachment; filename="file"`; proxy always generates `Content-Disposition` and `X-Content-Type-Options: nosniff`. Replace-then-delete order; a failed delete doesn't fail the save.
- [AD-14] Address suggestions server-proxied: `POST /api/places/autocomplete` and `POST /api/places/details` call Google Places (New) with `GOOGLE_PLACES_KEY`, require a session and AD-17 checks; input <= 120 chars; `placeId` matches `^[A-Za-z0-9_-]{10,300}$`; region codes fixed server-side to US/CA/AU; field mask is a server constant; Places session token server-generated and bound to `sid`; GCP key restricted to Places API (New) with daily quota cap + budget alert; routes return empty suggestions unless `PLACES_ENABLED=1` (manual entry always works); no Google script in the browser; typed text never logged.
- [AD-15] Logging without PHI: server logs only method, upstream path template, status, duration, request id; global error wrapper logs `{requestId, routeTemplate, status, errorName}`; bodies never logged outside `APP_ENV=dev` (where the debug logger redacts tokens/SSN/secrets); 5xx to client never include upstream bodies; no PHI in any app URL except encrypted one-time `lpl` on `/launch`. Client telemetry only via `lib/shared/telemetry.ts` (no-op sink) with events `section_save {sectionId, ok, code}` and `save_all {saved, failed}` — no field values or user ids.
- [AD-16] Client-coordinated refresh: on `401 TOKEN_EXPIRED`, `callApi` runs one `POST /api/session/refresh`, single-flighted within the tab (shared promise) and across tabs (`navigator.locks.request("pp-refresh")`), queues and replays other failed calls once. Refresh route returns 200 without calling the IdP if the access token is already valid; otherwise refreshes (`POST <base>/auth/oauth2/token`, `grant_type=refresh_token`), increments `gen`, re-seals with same `sid`. Only IdP rejection (`invalid_grant`/401) → `401 SESSION_EXPIRED` + cookie cleared; network/5xx → 503 `REFRESH_UNAVAILABLE` keeping the session; a replayed call getting `TOKEN_EXPIRED` again = `SESSION_EXPIRED`. Test: 10 concurrent calls across a simulated expiry → exactly 1 upstream refresh. Automatic logoff: cookie carries `iat` and `lastSeen`; server rejects with `401 SESSION_EXPIRED` after 15 min without a user-initiated request or 8 h after launch; client warns 60 s before the idle limit with "Stay signed in"; background polling doesn't count as activity. App-bar "Return to 1health" calls `POST /api/session/logout`, which clears the cookie and revokes tokens upstream (best effort).
- [AD-17] CSRF + per-tab session binding: `app/page.tsx` embeds `sessionBinding = HMAC(SESSION_SECRET, sid)`; `callApi` sends it as `X-PP-Session` on every request (nothing else sets it). Every non-GET to `/api/1h/*`, `/api/places/*`, `/api/session/*`, `/api/pp/*` requires `Sec-Fetch-Site: same-origin` (or `Origin` = `APP_ORIGIN` when absent) and `X-PP-Session`, else 403 `CSRF`; requests with neither header rejected. `X-PP-Session` ≠ `HMAC(SESSION_SECRET, sid)` → 409 `SESSION_CHANGED`; GETs without the header allowed only on `asImage` entries. JSON entries reject non-`application/json` Content-Type; GET handlers have no side effects.
- [AD-18] PHI never cached: every server fetch to 1health/Google uses `cache: "no-store"`; `app/api/**`, `app/launch/**`, `app/page.tsx` export `dynamic = "force-dynamic"`, `cacheComponents` off; proxy and every BFF route overwrite caching headers with `Cache-Control: private, no-store, max-age=0`, `Pragma: no-cache`, `Vary: Cookie` (incl. images and errors), dropping upstream `Cache-Control`, `Expires`, `ETag`, `Last-Modified`; CI test asserts headers on sample allowlisted routes; no `s-maxage` in config.
- [AD-19] `callApi(context, path, init)` (signature kept) is the only browser transport: adds `X-PP-Session`, runs refresh, returns `ApiResponse<T> = {success, data?, error?, statusCode?, errorCode?, details?}`, parses error bodies once (backend codes like `SOCIAL_SECURITY_NUMBER_EXISTS`, `INVALID_ENUM_VALUE`, or proxy codes). On `SESSION_EXPIRED`/`SESSION_CHANGED` publishes once on `lib/api/session-events.ts`; shell handles `session-expired` (registry writes drafts, then non-dismissable "Your session ended" dialog) and `session-changed` (clear SWR cache, registry and in-memory SSN, write no draft, show "This profile was opened by another account in another tab" + Reload). SWR fetcher/`onError` reuse the same events; no other module opens these dialogs.
- [AD-20] Deployment/ops envelope (see dedicated block below).
- [AD-21] `proxy.ts` sets on every response a per-request nonce CSP: `default-src 'self'; script-src 'self' 'nonce-<n>' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors <PORTAL_ORIGIN>; upgrade-insecure-requests`, plus `Strict-Transport-Security: max-age=63072000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `Cross-Origin-Opener-Policy: same-origin-allow-popups`; a test asserts them on `/`, `/launch-error` and one `/api/1h` route.

**Deployment, CI and test framework setup (AD-20)**
- Three Vercel projects `personal-profile-dev`, `personal-profile-demo`, `personal-profile-prod`; each production domain is its `APP_ORIGIN` (default `https://personal-profile-<env>.vercel.app`), and `<APP_ORIGIN>/launch` is that environment's registered launch URL.
- Promotion: dev auto-deploys `main`; demo and prod deploy only by promoting a commit verified on dev.
- Secrets only in each project's Vercel env vars: `ONEHEALTH_SECRET_KEY`, `APP_ID`, `GOOGLE_PLACES_KEY`, `SESSION_SECRET` (+ `SESSION_SECRET_PREVIOUS` during rotation), non-secret `APP_ENV`, `PLACES_ENABLED`, `PP_DISABLED`; no `NEXT_PUBLIC_*` secrets, no `_DEMO`/`_PROD`-suffixed names. Client reads only `NEXT_PUBLIC_APP_ENV`.
- Rotation procedure for `SESSION_SECRET` (overlap unseal), `ONEHEALTH_SECRET_KEY`/`APP_ID` (registration + Vercel together, redeploy), `GOOGLE_PLACES_KEY` (GCP); rotate on exposure/team change, at least yearly.
- Previews only in the dev project with dev secrets; previews disabled on demo and prod.
- Local dev: `pnpm dev` with `next dev --experimental-https`, `APP_ENV=dev`; dev-only `app/launch/dev/page.tsx` accepts a pasted `lpl` and submits to `/launch`, 404 unless `APP_ENV=dev`.
- CI on every PR: `pnpm lint`, `tsc --noEmit`, Vitest, Playwright (mocked proxy), `next build`; remove `typescript.ignoreBuildErrors`/`eslint.ignoreDuringBuilds`; CI grep fails on `document.cookie`, `access_token` in client files, `NEXT_PUBLIC_*SECRET*`, `_DEMO`/`_PROD` secret names.
- Test framework: install and configure Vitest + Testing Library + MSW at the `/api` boundary for unit/component tests; Playwright for UJ-1…UJ-5 end-to-end against a mocked proxy. Each Section ships tests for `validate`/`save`/diff; the proxy ships traversal, CSRF, cache-header and refresh-concurrency test tables (AD-2, AD-16–AD-18); header test (AD-21); cookie-size test (AD-1).
- Rollback: Vercel instant rollback; incident stop `PP_DISABLED=1` + redeploy makes launch and proxy return 503 `SERVICE_DISABLED`; revoke live tokens via `isAllowedForPatients=false`.
- Tooling versions per Stack table: Node 24.x, pnpm 12.x via corepack, iron-session 9.0.1, Vitest 5.0.4, @testing-library/react 16.3.3, MSW 3.0.3, @playwright/test 1.64.0; shadcn/Radix (dialog 1.3.1, label 2.1.17, slot 1.5.0, toast 1.3.1); `signature_pad` wrapped directly (replaces `react-signature-canvas`); TypeScript 7 deferred.

**Conventions that affect every story**
- Naming: hooks `use<Section>`, schemas `<section>Schema`, `lib/api` functions verb-first (`fetchX`, `saveX`, `verifyContactPoints`); owner-id path segments are literal `me`.
- Data formats: dates on the wire `YYYY-MM-DD`, displayed `MM/DD/YYYY`; clearing an optional field sends `"n/a"`; ids are numbers; address request DTO uses `primary`/`validated` while responses use `isPrimary`/`isValidated`.
- Errors: proxy passes upstream 4xx status/body through; proxy-originated codes 400 `BAD_PATH`/`BAD_QUERY`, 403 `NOT_ALLOWED`/`CSRF`, 405, 409 `SESSION_CHANGED`, 413 `TOO_LARGE`, 415 `UNSUPPORTED_MEDIA`, 401 `TOKEN_EXPIRED`/`SESSION_EXPIRED`, 502 `UPSTREAM_REDIRECT`/`UPSTREAM_ERROR`, 503 `REFRESH_UNAVAILABLE`/`SERVICE_DISABLED`, 504 `UPSTREAM_TIMEOUT`, all `{code}`; unknown codes fall back to a generic Section error with Retry.
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
- External Application registration per environment (NFR8) and 1health-fe flag (NFR9) are release dependencies.
- Demo QA go/no-go by 2026-10-24 (NFR13); minimum alerting (proxy 5xx rate, `SESSION_EXPIRED` after refresh) and log retention to be decided before go/no-go.

**Deferred (not in scope for stories unless re-opened)**
- TypeScript 7; "Last updated" header line (no backing field — dropped); Medical data model (Epic 2); telemetry sink (event shapes fixed, sink needs BAA); monitoring beyond Vercel defaults; server-side session store/distributed lock; rate limits on `ssn/expose` and Places; i18n; source-doc amendments (PRD FR-1, FR-2, NFR-6; EXPERIENCE drafts).

**Open questions that may affect stories**
- Does 1health rotate refresh tokens or detect reuse for `client_id=public-client`? (AD-16 assumes tolerated rotation.) — Daniel Garcia / backend.
- Launch-code replay (no row lock): accept the 60 s window or get a backend fix? — Daniel Garcia / backend.
- Does 1health-fe `?tab=contacts#signature` reach `/launch` with `tab` and fragment intact via the portal? — Daniel Garcia / 1health-fe.
- Custom domains for the three projects. — Daniel Garcia.
- Is the dev 1health environment synthetic-data only (no BAA needed for dev/previews)? — Daniel Garcia.
- Minimum alerting before demo QA go/no-go; Vercel log retention. — Dev lead.
- Is the 1health backend audit the system of record for SSN expose and Signature changes, or must the proxy emit audit lines to a BAA sink? — Daniel Garcia.
- Whether an upstream token-revoke endpoint exists for `POST /api/session/logout` (best effort otherwise).
- PRD OQ 1 Medical content (Epic 2, PM); PRD OQ 3 Google Places privacy is resolved by AD-14 server proxy + BAA gate.

### UX Design Requirements

**Design tokens and theme**

UX-DR1: Wire all components to 1health Tier 3 tokens from `app/globals.css` via Tailwind utilities (`bg-card`, `text-muted-foreground`, …); no hex or Tailwind palette classes in components (add a lint/CI check), light theme default.
UX-DR2: Link-text override: map all text links to `text-info-strong` (#256a8c, 5.97:1 on card) instead of `--link` #2f80a8 in light mode; dark mode keeps signal-aqua #8fd8e6.
UX-DR3: Destructive-fill override: destructive buttons fill with `bg-error-strong` (#b23a31, white text 5.93:1) instead of `--destructive` #d84f45, in both light and dark mode.
UX-DR4: Control-border override: inputs, selects, Jump to and Signature pad boundaries use #7a8696 (`--status-neutral`, 3.7:1 on card) in light and mist #aeb8c4 in dark, instead of `--input` #e1e8ef; table rules and card hairlines keep `--border`.
UX-DR5: Add tooltip tokens: tooltip graphite #202833 / white text in light, inverted cloud #e6ebf0 / graphite in dark.
UX-DR6: Dark theme via `.dark` class using every `-dark` token in DESIGN.md (background #202833, card #29333f, ring #8fd8e6, `-strong-dark` status variants, control-border-dark #aeb8c4, destructive-fill stays #b23a31); verify listed contrast ratios in both themes.
UX-DR7: Status hues: status text uses `-strong` variants (success-strong Verified, warning-strong Not verified / Unsaved, error-strong errors); base hues only for fills/borders/icons; status always icon + word, never color alone; red only for errors and destructive actions.
UX-DR8: Typography roles on the 1health scale with Inter: profile-name (text-h4, the single page `h1`), section-title (`h2`, text-body 600), cell (14 px), cell-strong (14/500), cell-number (14/600 tabular-nums), column-header (12/600 uppercase 0.06em — the only uppercase), caption, chip, mono-value (SSN), mono-index (index numbers and counts); all inputs 16 px; `tabular-nums` on every table.
UX-DR9: Spacing/shape tokens: 8 px grid; touch-target 44 px, row-read 44, row-header 36, chip-height 22, cell-x 12, cell-edit-y 16, page-gutter 24 / mobile 16, section-gap 32, index-width 200, kv-key-edit 240, control-max 480, breakpoint 768, min-viewport 360; radius sm 6 / md 10 / lg 16 / full per DESIGN.md Shapes (chips square `rounded-sm`, not pill).
UX-DR10: Elevation: page surfaces flat (no shadows on tables, header, insurance cards, Save all bar); `shadow-md` only for tooltip, row menu, Jump to listbox, Save all pill; `shadow-lg` for confirm/picture dialogs, toast, insurance drawer over a graphite 45 % scrim; `shadow-glow` only for focus.
UX-DR11: Add shadcn primitives Tabs, Tooltip, DropdownMenu, Select, Sheet unchanged, alongside existing Button, Input, Label, Dialog, Toast, Skeleton, Alert in `components/ui/`.
UX-DR12: Report the three design-system deviations (link, destructive, input border) upstream to design-system owners and keep overrides until `globals.css` changes.

**Reusable components (DESIGN.md Components + EXPERIENCE.md Component Patterns)**

UX-DR13: App bar — 52 px card bar with bottom border; "1health" wordmark (primary, bold), vertical rule, "Personal Profile" title; right "Return to 1health" link (link-text, external-link icon, 44 px target, underline on hover) that triggers the leave guard when dirty, clears drafts on confirm, calls logout, then navigates to `PORTAL_URL`; hidden when framed.
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
UX-DR36: Confirm dialog — shadcn Dialog, `rounded-lg`, elevation-2, dimmed overlay, `ease-premium` 220–280 ms entrance; title, 1–2 lines body, right-aligned Cancel (secondary) + confirm; focus starts on Cancel, Escape cancels, focus returns to trigger; used for exactly three cases: primary phone/email change (primary button "Make primary"), Remove Signature (destructive "Remove signature"), Delete insurance (destructive "Delete policy").
UX-DR37: Session expired dialog — confirm anatomy, non-dismissable (no close button, Escape and overlay click do nothing); title "Your session ended", body "Your changes are kept on this device. Relaunch from 1health to continue.", single primary "Return to 1health" with initial focus (framed: "Close and reopen from 1health", no navigation); edits visible behind the overlay; drafts written before it opens.
UX-DR38: Session changed dialog — "This profile was opened by another account in another tab" with Reload; clears SWR cache, registry and in-memory SSN; no draft written (AD-19).
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
UX-DR50: Full-page message — centered `rounded-lg` card on background with icon, title, one paragraph, one primary action; invalid launch copy "This link has expired" / "Open Personal Profile again from 1health." / "Return to 1health"; per-reason variants for tenant ("Personal Profile is available in your personal account…") and cookies ("Open in a new tab"); no retry of a used payload.
UX-DR51: Focus ring — 2 px ring-color outline, 2 px offset, plus `shadow-glow`, on `:focus-visible` for every interactive element; never removed, never trapped outside dialogs.

**Interaction primitives and behaviors**

UX-DR52: Make primary flow — phone/email: read-view action → confirm "This changes how you sign in" (body names the number/email and states the current primary is relabeled Old) → saves that one change immediately (new Primary + old relabeled Old in one request) → toast → Primary listed first, notifications default On; Phone footnote "Changing your primary phone changes how you sign in."; addresses: Make primary from read view saves without confirm.
UX-DR53: Verify flow — read-view action, no confirm; sends link; row shows "Link sent · Resend in 60 s" countdown then "Resend verification"; status updates on next Section refresh; auto-verify of new non-Home mobile/email entries after Section save.
UX-DR54: Draft row removal — in edit mode Remove strikes a saved row and swaps to Restore until Save (no toast, undo or confirm); removing a new unsaved row deletes it outright.
UX-DR55: Explain before failing — every unavailable action is aria-disabled with a tooltip reason (hover, focus, tap): unverified, landline, primary removal, last-entry removal, limit of 20; never hidden, never an error after Save.
UX-DR56: Saving state — Save shows spinner + "Saving…", inputs read-only, Cancel disabled; other Sections stay usable; after save: read view, toast, focus to Section `h2`, draft cleared; failure keeps edit with field/Section error + Retry; network failure copy "Couldn't save {section}. Check your connection." + Retry; no offline queue.
UX-DR57: Keyboard model — tab order app bar → header → tabs → index → Sections in order → Save all; Tab through cell controls in reading order; Escape in an edit table does not cancel; Enter in an input does not submit the Section.
UX-DR58: Deep links — `?tab={contacts|insurance|medical}#{personal|phone|email|social|addresses|signature}` opens the tab and scrolls to the Section/Signature row; unknown tab → Contacts, unknown hash → top; tab and hash survive refresh.
UX-DR59: Banned patterns enforced in review — no hover-only affordances, bottom-sheet editors, drag-to-reorder, undo toasts for removals, confirm dialogs beyond the three named, or auto-save; Directions A/B not reintroduced.

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

UX-DR68: Implement `lib/shared/messages.ts` containing every EXPERIENCE.md Voice and Tone string verbatim (disabled-action reasons, footnotes, the three confirm dialogs, locked-email copy, verify pending, validation messages, load error, empty states, Medical, Not provided, unsaved/Save all copy, success and partial toasts, network failure, SSN, Signature, card image failed, leave guard, session expired, draft restore/conflict, invalid launch, optional label suffix, Personal information/SSN/Signature/Address line 1 help, ZIP validation, removed/new row status, profile picture dialog and too-large error, Insurer search and "Add “{name}”", demotion, insurance dates help, Subscriber copy, card image copy), plus architecture-added strings (tenant mismatch, session changed, idle warning, framed session-expired action, open in new tab); voice rules: second person, no exclamation marks, no "contact point"/"precedence" in sentences; strings not from mocks/PRD flagged as draft copy for PM review.

**Architecture amendments to UX**

UX-DR69: Framed mode — detect `window.self !== window.top`; hide the app-bar "Return to 1health"; session-expired action reads "Close and reopen from 1health" and performs no navigation; launch-error `reason=cookies` offers "Open in a new tab" to `PORTAL_URL`.
UX-DR70: Idle logoff — 15-minute idle / 8-hour absolute session limit surfaced via the UX-DR39 warning and then the session-expired dialog (with drafts written first).

### Resolved Clarifications (2026-10-13, approved by Daniel Garcia)

- **RC1 Environments:** the architecture wins (AD-3). Dev, demo and prod, one environment per deployment, with no referrer detection and no chooser. PRD FR-1/NFR-6 to be amended.
- **RC2 Unverified mobile as Primary:** allowed only when no phone is Verified **and** none is Primary (matches today's app).
- **RC3 Notifications toggle:** on the Primary phone and Primary email only. Other rows show "—".
- **RC4 Social "edit":** the value can't change in place, so edit = remove + add in the same save.
- **RC5 Logout:** add `app/api/session/logout`. Revoking upstream is best-effort.
- **RC6 Idle activity:** user-triggered requests count, plus "Stay signed in" (`POST /api/session/ping`). Background or automatic refetches don't.
- **RC7 Signature upload alternative:** adopted. Uploads are converted to PNG, at most 1 MB. Closes the PRD FR-14 assumption.
- **RC8 "Last updated" header line:** dropped.
- **RC9 Medical copy:** "Coming soon: your medical information will appear here."
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

Cross-cutting NFRs (apply to every epic): NFR4, NFR9, NFR10, NFR13, NFR14.

## Epic List

### Epic 1: Launch, session and profile shell
Users open Personal Profile from the 1health portal, arrive signed in and safe, see their name and picture, and move between tabs. Unsaved work is protected and the session expires safely. Includes the foundation: proxy, sealed session, CI and tests, three Vercel projects, design tokens, and the shell building blocks (Section registry, Save all, drafts, leave guard, session dialogs, idle logoff).
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

**Dependencies:** Epics 2–5 depend only on Epic 1 and can run in parallel after it.

## Epic 1: Launch, session and profile shell

Users open Personal Profile from the 1health portal, arrive signed in and safe, see their name and picture, and move between tabs. Unsaved work is protected and the session expires safely. Includes the foundation: proxy, sealed session, CI and tests, three Vercel projects, design tokens, and the shell building blocks (Section registry, Save all, drafts, leave guard, session dialogs, idle logoff).

**Stories (dependency order):** 1.1 Foundation · 1.2 Launch · 1.3 Proxy · 1.4 `callApi` + SWR · 1.5 Token refresh · 1.6 Idle logoff · 1.7 Logout + session dialogs · 1.8 Page shell · 1.9 Header view · 1.10 Change picture · 1.11 Section framework · 1.12 Errors, messages and toasts · 1.13 Leave guard · 1.14 Save all · 1.15 Drafts · 1.16 Deployments. Each story depends only on earlier stories.

### Story 1.1: Foundation — environment config, security headers, test tooling, CI and legacy removal

As a developer on the Personal Profile team,
I want one validated server config per deployment, security headers on every response, a working test stack, a CI gate on every PR, and the legacy auth code gone,
So that every later story builds on a deployment that is pinned to one 1health environment, cannot be framed or script-injected, holds no token in browser code, and cannot merge untested or untyped code.

**Acceptance Criteria:**

**Given** the server boots with `APP_ENV` set to `dev`, `demo` or `prod`
**When** `lib/server/env.ts` is first imported (it is imported from `instrumentation.ts` `register()` so the check runs at boot)
**Then** it exports `APP_ENV`, `API_ORIGIN`, `APP_ORIGIN`, `PORTAL_ORIGIN`, `PORTAL_URL`, `APP_ID`, `DEFAULT_TENANT_ID`, `ONEHEALTH_SECRET_KEY`, `SESSION_SECRET`, `SESSION_SECRET_PREVIOUS` (optional), `PLACES_ENABLED`, `GOOGLE_PLACES_KEY` and `PP_DISABLED`
**And** `API_ORIGIN` is a constant fixed by `APP_ENV`: `dev` → `https://dev.1hdev.io`, `demo` → `https://demo.1health.io`, `prod` → `https://app.1health.io`; `PORTAL_ORIGIN` is the same environment origin and `PORTAL_URL` is a constant URL on that origin; `DEFAULT_TENANT_ID` is `1`
**And** `PLACES_ENABLED` and `PP_DISABLED` are booleans that are `true` only for the exact string `"1"`.

**Given** a deployment is missing `APP_ENV`, `APP_ORIGIN`, `APP_ID`, `ONEHEALTH_SECRET_KEY` or `SESSION_SECRET`, or `APP_ENV` is not one of `dev|demo|prod`, or `APP_ORIGIN` is not an `https://` origin without a path, or `SESSION_SECRET` is shorter than 32 characters, or `PLACES_ENABLED=1` without `GOOGLE_PLACES_KEY`
**When** the server boots
**Then** boot fails with an error that names the offending variable and never prints its value
**And** a Vitest table test in `lib/server/env.test.ts` covers each of these cases plus one valid case per `APP_ENV`.

**Given** the codebase after this story
**When** `pnpm lint` runs
**Then** an ESLint rule fails any `process.env` access outside `lib/server/env.ts`, except `process.env.NEXT_PUBLIC_APP_ENV` in `lib/shared/app-env.ts`
**And** `lib/server/env.ts` starts with `import "server-only"` so importing it from a client component fails the build
**And** an ESLint rule bans `dangerouslySetInnerHTML` everywhere (AD-11)
**And** no manual environment chooser, `getOneHealthBaseUrl()` environment switch or `document.referrer` environment detection is referenced by any file in the repo.

**Given** any request to the app, including `/`, an unknown path that returns 404, and a static asset such as `/favicon.png` or a `/_next/static/*` file
**When** the response is produced
**Then** `proxy.ts` (the Next 16 request interceptor, matcher covering every path) generates a fresh random nonce of at least 128 bits per request and sets `Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-<n>' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors <PORTAL_ORIGIN>; upgrade-insecure-requests`
**And** `frame-ancestors` lists exactly one origin (`PORTAL_ORIGIN`) and never `'self'` or `*`
**And** the response also carries `Strict-Transport-Security: max-age=63072000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy: camera=(), microphone=(), geolocation=()` and `Cross-Origin-Opener-Policy: same-origin-allow-popups`
**And** no `X-Frame-Options` header is sent
**And** the nonce is passed to the App Router (request header `x-nonce`) so Next's own scripts carry it, and the rendered page contains no inline `<script>` without that nonce.

**Given** two consecutive requests to `/`
**When** their CSP headers are compared
**Then** the nonces differ.

**Given** the repo's `next.config.mjs`
**When** this story is done
**Then** `typescript.ignoreBuildErrors` is removed and `eslint.ignoreDuringBuilds` is absent, `cacheComponents` is not enabled, and no `s-maxage` appears anywhere in config
**And** `pnpm typecheck` (`tsc --noEmit`) and `next build` pass with zero type errors.

**Given** the brownfield template code that is not allowlisted (AD-2) and blocks a clean typecheck
**When** this story is done
**Then** these files are deleted even if they carry uncommitted local modifications (RC12): `lib/api/` modules workflow-provisioning, workflow-template, campaign, journey, journey-step, grid, attachments, comments, custom-data, partnerships, query, schema, step-config, tenant; `components/workflow/`, `components/settings-page.tsx`, `components/home-page-client.tsx`
**And** `lib/api/index.ts` and `lib/api/config.ts` no longer reference deleted modules.

**Given** the legacy auth code (AD-1, RC12)
**When** this story is done
**Then** `app/api/token/**`, `app/auth/**`, `lib/auth-client.ts`, `contexts/navigation-context.tsx`, `contexts/session-context.tsx`, `hooks/use-session-expired.ts` and `components/auth-exit-dialog.tsx` are deleted, even with uncommitted local modifications, and `app/layout.tsx` no longer wraps children in `NavigationProvider` or a session provider
**And** every remaining importer of a deleted module is deleted or updated so `pnpm typecheck` stays green; `hooks/use-toast.ts` and `components/ui/*` are kept
**And** `lib/api/client.ts` no longer imports `lib/auth-client` and keeps the `callApi(context, path, init)` signature, issuing a plain same-origin `fetch` to the given `/api/...` path
**And** `app/page.tsx` renders a minimal placeholder `<main>` (no data and no session check)
**And** no file in `app/`, `components/`, `contexts/`, `hooks/`, `features/` or `lib/` (outside `lib/server/`) contains `document.cookie` or `access_token`.

**Given** the test stack from the Stack table
**When** dependencies are installed
**Then** `package.json` pins `vitest` 5.0.4, `@testing-library/react` 16.3.3, `msw` 3.0.3 and `@playwright/test` 1.64.0 (plus `iron-session` 9.0.1), declares `"engines": { "node": "24.x" }` and a `packageManager` of pnpm 12.x for corepack
**And** scripts exist: `lint` (`eslint .`), `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `test:e2e` (`playwright test`), `build`, and `dev` = `next dev --experimental-https`
**And** `vitest.config.ts` runs `lib/server/**` tests in the `node` environment and component tests in `jsdom`, with a shared setup file that starts an MSW server at the `/api` boundary with `onUnhandledRequest: "error"`
**And** at least three passing sample tests exist: a pure unit test (env table), a Testing Library component test, and an MSW-backed test of a same-origin `/api/...` fetch.

**Given** `playwright.config.ts`
**When** `pnpm test:e2e` runs
**Then** Playwright starts the app with a `webServer` using test values for every required env var (`APP_ENV=dev`, dummy secrets) and runs a desktop Chromium project and a 360 × 740 mobile project
**And** a header spec asserts every AD-21 header above (exact CSP directive list, HSTS, nosniff, Referrer-Policy, Permissions-Policy, COOP, no `X-Frame-Options`) on `/`, on a 404 path and on one static asset.

**Given** a pull request is opened or updated
**When** `.github/workflows/ci.yml` runs on Node 24 with pnpm via corepack and `pnpm install --frozen-lockfile`
**Then** the job runs, in order, `pnpm lint`, `pnpm typecheck`, `pnpm test`, Playwright browser install + `pnpm test:e2e`, and `pnpm build`, and any failing step fails the check
**And** a forbidden-pattern step (`scripts/check-forbidden.sh`) fails the job when any file other than the script itself contains a `NEXT_PUBLIC_*SECRET*` name or a secret name ending in `_DEMO` or `_PROD`, or when any client file (outside `lib/server/`) contains `document.cookie` or `access_token`
**And** CI never needs real 1health credentials (every secret is a dummy value scoped to the workflow).

**Covers:** NFR1, NFR6, AD-1 (legacy auth deleted), AD-3, AD-5 (frame-ancestors), AD-11 (lint rule), AD-18 (config), AD-20 (CI, CI grep, test framework, local dev, remove ignoreBuildErrors), AD-21, RC1, RC12 · **Jira:** NG-9027

### Story 1.2: Launch from the portal and arrive signed in

As a Launching user (patient or provider) in the 1health portal,
I want clicking Personal Profile to open the app already signed in on my Contacts tab,
So that I can manage my profile without a login screen and without my launch link ever being reusable.

**Acceptance Criteria:**

**Given** the portal opens `<APP_ORIGIN>/?lpl=<payload>&tab=<tab>` (old or misconfigured launch URL)
**When** `proxy.ts` handles the request
**Then** it answers 307 to `/launch` with the full query string preserved and the response carries the AD-21 headers
**And** `app/page.tsx` never reads `lpl`.

**Given** a GET to `/launch?lpl=<payload>` with an optional `tab`
**When** `app/launch/route.ts` (exporting `dynamic = "force-dynamic"`) runs
**Then** before anything else it schedules clearing of any existing `__Host-pp_s` cookie, so a failed launch never leaves the previous user's session
**And** it replaces every `' '` in `lpl` with `'+'`, base64-decodes it, and decrypts it as AES-256-GCM with the first 12 bytes as IV and the last 16 bytes as tag, using the key derived from `ONEHEALTH_SECRET_KEY` (HKDF-SHA256, matching the platform's `KeyDerivationUtil`)
**And** it parses the plaintext as the launch payload (`required.apiKey.name`, `required.tenant.id`, `required.user.id`, `required.oneTimeCode.value`, `required.oneTimeCode.issuedAt`).

**Given** the payload is missing, not base64, shorter than 28 bytes, fails GCM authentication, is cleartext JSON (unencrypted), is not valid JSON, or lacks a required field
**When** the launch route runs
**Then** it makes no upstream call, sets no session cookie, and answers 303 to `/launch-error?reason=invalid`.

**Given** a decrypted payload whose app identifier (`required.apiKey.name`) is not equal to `APP_ID`
**When** the launch route runs
**Then** it makes no upstream call and answers 303 to `/launch-error?reason=invalid`.

**Given** a valid payload
**When** the route exchanges the code
**Then** it calls `POST <API_ORIGIN>/api/v2/public/external-application/auth/oauth2/user/token` exactly once with `{ securityCode, signature }` (signature = base64 HMAC-SHA256 of the code keyed with `ONEHEALTH_SECRET_KEY`), `cache: "no-store"`, `redirect: "manual"` and a 25 s timeout, and never retries
**And** an upstream rejection identifying an already-consumed code maps to `reason=used`, an expired code maps to `reason=expired`, and any other failure (other 4xx, 5xx, 3xx, timeout, network error) maps to `reason=invalid`; the mapping lives in `lib/server/launch.ts` and is unit-tested against recorded upstream error bodies.

**Given** a successful exchange
**When** the route checks the tenant (AD-6)
**Then** it reads only the plaintext `tenantId` claim of the access token (other identity claims are encrypted and are never decoded)
**And** if `tenantId` ≠ `DEFAULT_TENANT_ID` (`1`), it sets no session cookie, calls no other upstream endpoint, and answers 303 to `/launch-error?reason=tenant`.

**Given** the tenant is `1`
**When** the route derives ids
**Then** it calls `GET <API_ORIGIN>/api/v2/user/myself` once with the new Bearer token and takes `userId` and `personId` from that response (never from the JWT, never from the payload alone)
**And** if the call fails or its user id ≠ the payload's `required.user.id`, it sets no cookie and answers 303 to `/launch-error?reason=invalid`.

**Given** ids are derived
**When** the route creates the session
**Then** `lib/server/session.ts` seals one cookie `__Host-pp_s` with iron-session (password map: `SESSION_SECRET` current, `SESSION_SECRET_PREVIOUS` accepted for unseal only) holding access token, refresh token, access expiry, `userId`, `personId`, `tenantId`, a new random `sid` (≥ 128 bits), `gen = 0`, `iat = now` and `lastSeen = now`
**And** the cookie attributes are exactly `HttpOnly; Secure; SameSite=None; Partitioned; Path=/` with no `Domain`, no `Max-Age` and no `Expires`
**And** `id_token`, the environment and the API origin are never stored in the cookie
**And** a Vitest test asserts the serialized `Set-Cookie` is ≤ 3,800 bytes using the largest observed token fixtures (≥ 1,224-byte access token)
**And** a Vitest proves a cookie sealed under the previous secret is unsealed while `SESSION_SECRET_PREVIOUS` is set, that new cookies are always sealed with `SESSION_SECRET`, and that the old cookie is rejected (no session) once the variable is removed (AD-20 rotation).

**Given** the session cookie is set
**When** the launch route responds
**Then** it answers 303 with a relative, fragment-free `Location: /launch/verify?tab=<tab>`, where `tab` is `contacts|insurance|medical` and anything else (or absent) becomes `contacts`
**And** `GET /launch/verify` unseals the cookie and answers 303 to `/?tab=<tab>` when it is present, or 303 to `/launch-error?reason=cookies` when it is missing or fails to unseal
**And** no response body from `/launch` or `/launch/verify` contains a token, and both carry `Cache-Control: private, no-store, max-age=0`, `Pragma: no-cache` and `Vary: Cookie` (from `lib/server/cache-headers.ts`).

**Given** the browser opened `/launch?lpl=…&tab=contacts#signature`
**When** the redirect chain completes (Playwright, mocked upstream)
**Then** the final URL is `/?tab=contacts#signature` with the fragment intact
**And** `lpl` appears neither in the final URL nor in any reachable history entry, and reloading the page performs no second exchange (the mocked exchange endpoint is called exactly once).

**Given** `ONEHEALTH_SECRET_KEY` cannot be turned into a valid AES key at request time
**When** `/launch` is requested
**Then** the route answers 303 to `/launch-error?reason=config`.

**Given** any launch outcome
**When** the server logs it
**Then** the log line holds only request id, route template `/launch`, outcome reason and duration; `lpl`, the code, tokens, user ids and upstream bodies are never logged.

**Given** a request to `/` with no valid session and no `lpl`
**When** `app/page.tsx` (exporting `dynamic = "force-dynamic"`) calls `requireSession()`
**Then** it redirects to `/launch-error?reason=expired`; there is no login page and no `/auth` route.

**Given** `/launch-error?reason=<r>`
**When** the page renders the full-page message (centered `rounded-lg` card on the background, icon, title, one paragraph, one primary action)
**Then** `expired`, `used` and `invalid` show title "This link has expired", body "Open Personal Profile again from 1health." and action "Return to 1health" linking to `PORTAL_URL`
**And** `tenant` shows the body "Personal Profile is available in your personal account. Switch to it in 1health and open the app again." with action "Return to 1health"
**And** `cookies` shows the action "Open in a new tab", a link to `PORTAL_URL` with `target="_blank"` and `rel="noopener noreferrer"`
**And** `config` and `disabled` show title "Personal Profile is unavailable right now", body "Use your profile in 1health for now." and "Return to 1health"
**And** any other or missing value renders exactly the `invalid` variant, and the raw `reason` value is never rendered or logged
**And** there is no retry button and no way to resubmit a launch payload
**And** every string lives in `lib/shared/messages.ts`; titles/bodies not quoted in EXPERIENCE.md (tenant title, cookies title and body, config/disabled copy) are marked as draft copy for PM review.

**Given** `/launch-error` is shown inside the portal iframe (`window.self !== window.top`)
**When** the user activates "Return to 1health"
**Then** it opens `PORTAL_URL` in a new tab (`target="_blank"`), because the sandboxed frame cannot navigate the top window
**And** the `/launch-error` response carries the AD-21 headers (the Story 1.1 header spec is extended to cover it).

**Given** `APP_ENV=dev`
**When** a developer opens `/launch/dev`
**Then** `app/launch/dev/page.tsx` shows a labelled textarea "Launch payload (lpl)" and a tab select (`contacts|insurance|medical`), and submits them with a GET form to `/launch`; the page never logs, stores or echoes the payload
**And** with `APP_ENV` = `demo` or `prod` the route calls `notFound()` before rendering anything and responds 404; a Vitest asserts 404 for `demo` and `prod`.

**Given** the story is done
**When** CI runs
**Then** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` and `pnpm build` pass, and the Story 1.1 forbidden-pattern step stays green.

**Covers:** FR1, NFR1, NFR6, NFR7, AD-1, AD-3, AD-4, AD-5, AD-6, AD-15, AD-18 (launch routes), AD-20 (dev launch page, `SESSION_SECRET_PREVIOUS` unseal), RC1 · UX-DR50, UX-DR68 (launch strings), UX-DR69 (cookies fallback) · **Jira:** NG-9027

### Story 1.3: Secure 1health proxy — allowlist, normalization, CSRF, no-store and logging

As a Launching user,
I want every request the app makes on my behalf to go through a locked-down server proxy that acts only on my own record,
So that my token never reaches the browser and no page bug or malicious site can use my session to reach other endpoints, other people's records or cached PHI.

**Acceptance Criteria:**

**Given** `lib/server/proxy-allowlist.ts`
**When** this story is done
**Then** each entry has the shape `{ method, template, query, body, maxBytes?, asImage? }`, keyed by METHOD + template
**And** the shipped allowlist contains `GET /v2/user/myself` (no query params, no body); later stories add their own entries in the same change as the code that uses them
**And** the proxy handler is built by a factory that accepts an allowlist, so tests can inject fixture entries (e.g. `GET /v2/person/{personId}/ssn/expose`, `PUT /v2/person/location/{id}`, an entry with an allowlisted `page` query param, an entry with a server-fixed param).

**Given** a browser request to `/api/1h/<path>`
**When** `app/api/1h/[...path]/route.ts` (exporting `dynamic = "force-dynamic"`) handles it
**Then** it forwards to `API_ORIGIN + "/api/" + segments.map(encodeURIComponent).join("/")` (never `new URL(input, base)`), asserts the built URL's origin equals `API_ORIGIN` and that it re-matches the same template, and uses `cache: "no-store"`, `redirect: "manual"` and a 25 s timeout.

**Given** a path that is not allowlisted, or that hits `/auth/**`, `/v2/public/external-application/**`, a GraphQL path or an admin prefix
**When** the proxy handles it
**Then** it answers 403 `{ "code": "NOT_ALLOWED" }` without calling upstream
**And** a known template with a different method answers 405
**And** `HEAD`, `OPTIONS` and `TRACE` answer 405 (explicit handlers so Next does not auto-implement them), an `X-HTTP-Method-Override` header is dropped and never changes the method, and a `_method` query param is an unknown param.

**Given** a raw path containing `//`, `%2F`, `%5C` or `%25`, or a raw or decoded segment that is empty, `.`, `..`, or contains `/ \ ; % @ :`, whitespace or a control character
**When** the proxy normalizes it before matching
**Then** it answers 400 `{ "code": "BAD_PATH" }` without calling upstream
**And** a table test covers at least `..%2F`, `%2e%2e`, `%252F`, `//host`, `;x`, a trailing `/` and mixed-case segments (`V2/User/Myself`), each answering 400 or 403.

**Given** a template containing `{personId}` or `{userId}`
**When** the client sends the literal segment `me` in that position
**Then** the proxy substitutes the id from the sealed session
**And** any other value in an owner position (including a numeric id equal to the user's own) answers 403 `{ "code": "NOT_ALLOWED" }`
**And** any other id segment must match `^\d{1,19}$` or the request answers 403, and literal segments compare exactly.

**Given** a query string
**When** the proxy checks it against the entry's query allowlist (name + value regex)
**Then** an unknown param or a value failing its regex answers 400 `{ "code": "BAD_QUERY" }`
**And** server-fixed params defined by an entry (e.g. `isPublic`, `hardDelete`) are set by the server and any client-sent value for them is ignored (fixture-entry test).

**Given** a non-GET request to `/api/1h/*` (CSRF helper in `lib/server/csrf.ts`, reused by `/api/session/*`, `/api/places/*`, `/api/pp/*`)
**When** it lacks `Sec-Fetch-Site: same-origin` (or, when `Sec-Fetch-Site` is absent, `Origin` equal to `APP_ORIGIN`), or lacks `X-PP-Session`, or has neither `Sec-Fetch-Site` nor `Origin`
**Then** the proxy answers 403 `{ "code": "CSRF" }` without calling upstream
**And** a JSON entry receiving a `Content-Type` other than `application/json` answers 415 `{ "code": "UNSUPPORTED_MEDIA" }`.

**Given** any request carrying `X-PP-Session`
**When** the header does not equal `HMAC-SHA256(SESSION_SECRET, sid)` (base64url, computed by `lib/server/session-binding.ts`) of the current cookie (constant-time compare)
**Then** the proxy answers 409 `{ "code": "SESSION_CHANGED" }` without calling upstream
**And** a GET without `X-PP-Session` is allowed only on `asImage` entries; on any other entry it answers 403 `{ "code": "CSRF" }`.

**Given** no session cookie, or one that fails to unseal
**When** any `/api/1h` request arrives
**Then** the proxy answers 401 `{ "code": "SESSION_EXPIRED" }`.

**Given** a session whose access token expires within 30 s, or an upstream 401
**When** the proxy handles the request
**Then** it answers 401 `{ "code": "TOKEN_EXPIRED" }`, does not refresh, and writes no cookie.

**Given** an upstream response
**When** the proxy returns it
**Then** 2xx and 4xx (other than 401) pass through with their status and body, streamed without buffering
**And** an upstream 3xx answers 502 `{ "code": "UPSTREAM_REDIRECT" }`, a 5xx or network error answers 502 `{ "code": "UPSTREAM_ERROR" }` without the upstream body, and a timeout answers 504 `{ "code": "UPSTREAM_TIMEOUT" }`
**And** `PP_DISABLED=1` makes every proxy request answer 503 `{ "code": "SERVICE_DISABLED" }`.

**Given** headers in either direction
**When** the proxy forwards a request
**Then** only `Content-Type`, `Content-Length`, `Accept`, `Accept-Language` are forwarded, plus server-added `Authorization: Bearer <token>` and a generated `X-Request-Id`; the browser's `Cookie` and `X-PP-Session` are never forwarded
**And** only upstream `Content-Type`, `Content-Length` and `X-Request-Id` are returned; upstream `Set-Cookie`, `Access-Control-*`, `Cache-Control`, `Expires`, `ETag` and `Last-Modified` are dropped
**And** every proxy response, including errors, carries `Cache-Control: private, no-store, max-age=0`, `Pragma: no-cache`, `Vary: Cookie` and `X-Content-Type-Options: nosniff`
**And** a CI test asserts these headers on `GET /api/1h/v2/user/myself` and on a 403/409 error response, and the Story 1.1 AD-21 header spec is extended to one `/api/1h` route.

**Given** any proxied request
**When** it is logged
**Then** the log line (`lib/server/log.ts`) contains only `{ requestId, method, template, status, durationMs }` with the template (e.g. `/v2/person/{personId}/ssn/expose`), never the concrete path, ids, query values, tokens or bodies
**And** request/response bodies are logged only when `APP_ENV=dev`, with tokens, SSN-shaped values and secrets redacted
**And** an unhandled error answers 500 with no upstream data and logs only `{ requestId, routeTemplate, status, errorName }`
**And** a unit test asserts a proxied call for `me` logs the template and not the substituted `personId`.

**Covers:** NFR1, NFR6, AD-2, AD-15, AD-17, AD-18, AD-20 (proxy kill switch) · **Jira:** NG-9027

### Story 1.4: `callApi` transport, SWR keys and `useMyself`

As a Launching user,
I want every screen to load and save my data through one transport that detects session problems the same way everywhere,
So that a session that ended or changed in another tab is noticed on any read or save, and no part of the page talks to anything but the app's own server.

**Acceptance Criteria:**

**Given** `app/page.tsx` renders for a valid session
**When** the server component builds the page
**Then** it embeds `sessionBinding` (from `lib/server/session-binding.ts`, Story 1.3) and the constant `PORTAL_URL` in the page and registers them with `lib/api/client.ts` on the client; nothing but `callApi` ever sets `X-PP-Session`.

**Given** any browser code needs data
**When** it calls `callApi(context, path, init)`
**Then** `callApi` is the only browser transport (lint rule: `fetch(` is banned in `features/`, `components/` and `lib/api/` outside `client.ts`)
**And** a `path` that does not start with `/api/` (absolute URLs included) resolves `{ success: false, errorCode: "BAD_PATH" }` without a network call
**And** it sends `credentials: "same-origin"` and `X-PP-Session`, and resolves `ApiResponse<T> = { success, data?, error?, errorCode?, details?, statusCode? }` — it never throws
**And** on a non-2xx it parses the body once: `errorCode` is the proxy `code` or the backend error code (e.g. `SOCIAL_SECURITY_NUMBER_EXISTS`, `INVALID_ENUM_VALUE`), `details` carries backend field details, and a non-JSON or empty body yields `errorCode: undefined` with a generic `error`
**And** an empty 2xx body yields `success: true` with `data: undefined`
**And** a network failure resolves `{ success: false, errorCode: "NETWORK_ERROR" }` with no `statusCode`
**And** `callApi` never logs response bodies to the console.

**Given** `callApi` receives `401 SESSION_EXPIRED` or `409 SESSION_CHANGED`
**When** it resolves
**Then** it publishes `session-expired` or `session-changed` on `lib/api/session-events.ts` exactly once per page lifetime (repeat occurrences are not republished) and still returns the error `ApiResponse`
**And** `TOKEN_EXPIRED` is returned to the caller unchanged (refresh is outside this story)
**And** `session-events.ts` exposes `publish(event)` (idempotent per page lifetime) and `subscribe(event, cb)` returning an unsubscribe function.

**Given** `lib/api/keys.ts` and the shared SWR fetcher (`lib/api/fetcher.ts`) built on `callApi`
**When** a component calls `useMyself()` (`features/shell/use-myself.ts`, key `keys.myself()` = `["pp","myself"]`, fetching `/api/1h/v2/user/myself` via `fetchMyself()` in `lib/api/user.ts`)
**Then** the data is typed, duplicate mounts share one request, and a failed fetch surfaces the `ApiResponse` error (with `errorCode`) to SWR
**And** the fetcher passes a failed `ApiResponse` to SWR `onError` without publishing session events a second time (AD-19: same event, one publisher)
**And** every SWR key in the app is built by a function in `lib/api/keys.ts` with the shape `["pp", resource, ...params]`; a lint rule or test fails on inline array keys passed to `useSWR`/`mutate` outside `keys.ts`
**And** the placeholder page renders the Launching user's first and last name from `useMyself()`
**And** a Testing Library + MSW test covers success, a 502 `UPSTREAM_ERROR`, and a 409 that publishes `session-changed` once.

**Covers:** NFR4, NFR5, AD-10 (keys, fetcher), AD-17 (session binding header), AD-19 · **Jira:** NG-9027

### Story 1.5: Client-coordinated token refresh

As a Launching user,
I want my session to stay alive silently while I work, even with several tabs open,
So that I never lose work to a silent logout caused by an expired access token.

**Acceptance Criteria:**

**Given** `POST /api/session/refresh` (exporting `dynamic = "force-dynamic"`, CSRF and `X-PP-Session` checks from `lib/server/csrf.ts`, AD-18 no-store headers)
**When** the cookie's access token is still valid for more than 30 s (another tab already refreshed)
**Then** it answers 200 without calling the IdP and without changing the cookie
**And** no response body ever contains a token.

**Given** the access token is expired or within 30 s of expiry
**When** the refresh route runs
**Then** it calls `POST <base>/auth/oauth2/token` once with `grant_type=refresh_token` and the stored refresh token, `cache: "no-store"`, 25 s timeout
**And** on success it stores the new access token, refresh token (if returned) and expiry, increments `gen`, keeps the same `sid`, re-seals `__Host-pp_s`, and answers 200
**And** on an IdP rejection (`invalid_grant` or 401) it clears the cookie and answers 401 `{ "code": "SESSION_EXPIRED" }`
**And** on a network error, timeout or upstream 5xx it keeps the cookie unchanged and answers 503 `{ "code": "REFRESH_UNAVAILABLE" }`
**And** with `PP_DISABLED=1` it answers 503 `{ "code": "SERVICE_DISABLED" }` without calling the IdP
**And** the log line holds only `{ requestId, routeTemplate, status, durationMs }`.

**Given** `callApi` receives `401 TOKEN_EXPIRED`
**When** it handles the response
**Then** it runs one `POST /api/session/refresh`, single-flighted within the tab (shared promise) and across tabs (`navigator.locks.request("pp-refresh", …)`; when `navigator.locks` is unavailable, in-tab single-flight only)
**And** other calls failing with `TOKEN_EXPIRED` while the refresh runs wait for it, and each failed call is replayed exactly once after a 200
**And** a replayed call that gets `TOKEN_EXPIRED` again is treated as `SESSION_EXPIRED` (event published, error returned)
**And** a refresh answering 401 `SESSION_EXPIRED` publishes `session-expired` once and returns that error to every waiting call
**And** a refresh answering 503 `REFRESH_UNAVAILABLE` returns `{ success: false, statusCode: 503, errorCode: "REFRESH_UNAVAILABLE" }` to the waiting calls, publishes no event and keeps the session, and the next `TOKEN_EXPIRED` tries a new refresh.

**Given** the concurrency requirement (AD-16)
**When** a Vitest + MSW test fires 10 concurrent `callApi` calls across a simulated expiry
**Then** exactly 1 upstream refresh happens and all 10 calls succeed on replay
**And** a second test with two simulated tabs sharing a mocked `navigator.locks` also produces exactly 1 refresh.

**Covers:** FR2 (silent refresh), NFR1, NFR4, AD-16 (refresh), AD-17, AD-18, AD-19 · **Jira:** NG-9027

### Story 1.6: Idle logoff, activity ping and cross-tab activity

As a Launching user on a shared or unattended device,
I want my session to end after 15 minutes without activity or 8 hours after launch, with a one-minute warning I can dismiss,
So that nobody can pick up my session, while I am never signed out in the middle of active work.

**Acceptance Criteria:**

**Given** the sealed cookie's `iat` and `lastSeen` (set at launch in Story 1.2)
**When** `requireSession()` runs for the page, the proxy, `/api/session/*` or any BFF route
**Then** if `now − lastSeen > 15 min` or `now − iat > 8 h`, it clears the cookie and the route answers 401 `{ "code": "SESSION_EXPIRED" }` (`app/page.tsx` redirects to `/launch-error?reason=expired`)
**And** unit tests cover 14:59 (allowed), 15:01 idle (rejected), and 8 h + 1 s since launch with recent activity (rejected).

**Given** the RC6 activity rule
**When** a request reaches the server
**Then** `lastSeen` is updated (cookie re-sealed) only for user-initiated requests: a top-level load of `/`, `POST /api/session/ping`, and `callApi` requests sent with the `X-PP-Activity: user` header
**And** `callApi` adds `X-PP-Activity: user` to every non-GET call and to GETs made with `{ userInitiated: true }`; the SWR fetcher (background and automatic refetches) never sends it, and `/api/session/refresh` never counts as activity
**And** a test proves 15 min of SWR revalidations alone still expire the session.

**Given** `POST /api/session/ping`
**When** it is called with a valid session (CSRF and `X-PP-Session` checked, AD-18 headers)
**Then** it answers 204 and updates `lastSeen`; without a valid session it answers 401 `{ "code": "SESSION_EXPIRED" }`.

**Given** the page is open
**When** 14 min have passed since the last user-initiated request (the page receives `idleTimeoutSec = 900` and the server's `lastSeen` with `sessionBinding`)
**Then** a warning dialog (`features/shell/idle-warning.tsx`, shadcn Dialog, `role="alertdialog"`) shows "You'll be signed out in 1 minute" with a primary "Stay signed in" button that has initial focus
**And** activating "Stay signed in" calls `POST /api/session/ping`, closes the warning and restarts the timer
**And** if the ping answers 401 `SESSION_EXPIRED`, the warning closes and `session-expired` is published on `lib/api/session-events.ts`
**And** if no action is taken before the 15-min deadline, the warning closes and the client publishes `session-expired`
**And** the 8 h absolute limit also publishes `session-expired` at its deadline.

**Given** two tabs of the same session
**When** user-initiated activity happens in one tab
**Then** it resets the other tab's timer via a `BroadcastChannel("pp-activity")` message that carries only a timestamp (no ids, no PHI), and a test asserts the message payload shape.

**Given** the idle copy
**When** the warning renders
**Then** "You'll be signed out in 1 minute" and "Stay signed in" come from `lib/shared/messages.ts`, marked as architecture-added copy for PM review
**And** the dialog shows the focus ring on its button and passes an axe check in a component test.

**Covers:** FR2 (expiry), NFR1, AD-16 (automatic logoff), RC6 · UX-DR39, UX-DR68 (idle strings), UX-DR70 · **Jira:** NG-9027

### Story 1.7: Logout and session-expired / session-changed dialogs

As a Launching user,
I want a clear, safe ending when my session expires, when another account opens in another tab, or when I go back to 1health,
So that I know what happened, my edits are not silently lost, and leaving really signs me out.

**Acceptance Criteria:**

**Given** `session-expired` is published (by `callApi`, the refresh flow, the SWR fetcher, the idle timer or the ping)
**When** the shell's `SessionDialogs` (`features/shell/session-dialogs.tsx`, the only module that opens these dialogs) handles it
**Then** it first runs every callback registered through `onBeforeSessionExpired(cb)` synchronously (errors caught, so a failing callback never blocks the dialog), which is where the draft writer will hook in
**And** then opens a non-dismissable dialog — no close button; Escape and overlay click do nothing — titled "Your session ended" with body "Your changes are kept on this device. Relaunch from 1health to continue." and a single primary "Return to 1health" with initial focus
**And** "Return to 1health" navigates to `PORTAL_URL` (received from the server with `sessionBinding`) without calling logout and without deleting drafts
**And** page content stays visible behind the overlay.

**Given** the app runs inside the portal iframe (`useIsFramed()` in `features/shell` returns `window.self !== window.top`)
**When** the session-expired dialog opens
**Then** its action reads "Close and reopen from 1health" and activating it performs no navigation (the dialog stays open).

**Given** `session-changed` is published
**When** the shell handles it
**Then** it runs every callback registered through `onSessionChanged(cb)` (where in-memory SSN and the registry will be cleared), clears the SWR cache without revalidating, runs no `onBeforeSessionExpired` callback (no draft is written)
**And** opens a non-dismissable dialog "This profile was opened by another account in another tab" with a primary "Reload" that reloads the page.

**Given** one session dialog is already open
**When** the other event is published
**Then** the first dialog stays and no second dialog opens.

**Given** `POST /api/session/logout` (CSRF-checked, AD-18 headers)
**When** it is called
**Then** it answers 204 with a `Set-Cookie` that clears `__Host-pp_s` (same attributes, `Max-Age=0`) whether or not a session exists
**And** it attempts upstream token revocation best-effort (RC5): when no revoke endpoint is configured it skips the call, and a revoke failure or 5 s timeout never changes the 204
**And** `returnToPortal()` in `features/shell` calls logout (waiting at most 3 s, ignoring failures) and then navigates to the constant `PORTAL_URL`; no `returnUrl` or `next` parameter is read anywhere
**And** `requestLeave()` in `features/shell/leave.ts` exists as the single entry point for leaving actions and resolves `true` immediately while no leave guard is registered (`setLeaveGuard(fn)` lets a later guard intercept it).

**Given** the session copy
**When** the dialogs render
**Then** every string comes from `lib/shared/messages.ts`, and "This profile was opened by another account in another tab", "Reload" and "Close and reopen from 1health" are marked as architecture-added copy for PM review
**And** each dialog uses the confirm-dialog anatomy (shadcn Dialog, `rounded-lg`, elevation-2, dimmed overlay), shows the focus ring on its button, and passes an axe check in a component test
**And** a Playwright spec (mocked proxy) covers: a mocked `401 SESSION_EXPIRED` → dialog with initial focus on "Return to 1health"; framed mode → "Close and reopen from 1health"; a 409 → session-changed dialog → Reload.

**Covers:** FR2 (session-expired message), NFR1, NFR7, AD-5 (framed action), AD-16 (logout), AD-17, AD-19, RC5 · UX-DR37, UX-DR38, UX-DR68 (session strings), UX-DR69 · **Jira:** NG-9027

### Story 1.8: Profile page shell — tokens, app bar, tabs and Section navigation

As a Launching user on any device,
I want a profile page with an app bar, Contacts / Insurance / Medical tabs and a numbered Section menu I can deep-link into,
So that I can find any part of my profile quickly, by mouse, touch or keyboard, from 360 px phones to desktop.

**Acceptance Criteria:**

**Given** `app/globals.css`
**When** the 1health tokens are wired with the DESIGN.md overrides
**Then** text links use `text-info-strong` (#256a8c) in light mode and signal-aqua #8fd8e6 in dark mode
**And** the destructive button variant fills with `bg-error-strong` (#b23a31, white text) in both light and dark mode
**And** a `control-border` token is #7a8696 in light and mist #aeb8c4 in dark, used by Input, Select and the Jump to control, while table rules and card hairlines keep `--border`
**And** tooltip tokens are graphite #202833 / white in light and #e6ebf0 / #202833 in dark
**And** adding `class="dark"` to `<html>` switches every token to its DESIGN.md `-dark` value (background #202833, card #29333f, ring #8fd8e6); light is the default
**And** a comment block in `globals.css` lists the three design-system deviations (link, destructive fill, control border) to be reported upstream and kept until `globals.css` changes
**And** a lint/CI check fails on hex colors or Tailwind palette color classes (e.g. `bg-red-500`) in `components/`, `features/` and `app/` outside `globals.css`.

**Given** the page at ≥ 768 px
**When** it renders
**Then** the order is app bar → header slot → tab strip → two-column body (sticky 200 px Section menu with right hairline + fluid main column, 24 px padding, 32 px between Sections)
**And** the app bar is a 52 px card bar with bottom border showing the "1health" wordmark (primary, bold), a vertical rule, and the title "Personal Profile"
**And** the right side shows a "Return to 1health" link (link-text color, external-link icon, 44 px target, underline on hover) that calls the shell's `requestLeave()` and then `returnToPortal()` (both from Story 1.7).

**Given** the app is framed (`useIsFramed()` true)
**When** the app bar renders
**Then** "Return to 1health" is not rendered at all (not just hidden visually).

**Given** the tab strip (shadcn Tabs added to `components/ui/tabs.tsx`, plus shadcn Select in `components/ui/select.tsx`, each at a pinned exact version)
**When** it renders
**Then** it has three tabs, "Contacts", "Insurance" and "Medical", 44 px tall with 12 px side padding; the active tab is foreground 600 with a 2 px primary underline overlapping the strip border
**And** Medical is a normal selectable tab carrying a "Coming soon" tag ("Soon" below 768 px)
**And** it uses `role="tablist"`, `role="tab"` with `aria-selected`, and `role="tabpanel"` linked by `aria-controls`/`aria-labelledby`
**And** Left/Right arrow keys move focus between tabs (wrapping), Home/End jump to first/last, and Enter or Space activates the focused tab (manual activation).

**Given** the user activates a tab
**When** the tab changes
**Then** the URL becomes `?tab=contacts|insurance|medical` via a replace (no extra history entry, no scroll jump) and the hash is dropped
**And** the tab change goes through `requestLeave()` so the later leave guard can intercept it.

**Given** a URL with `?tab=` missing or not in `contacts|insurance|medical`
**When** the page loads
**Then** the Contacts tab is shown and the URL is normalized to `?tab=contacts`
**And** a refresh of `?tab=insurance` or `?tab=medical` reopens that tab.

**Given** the Contacts tab at ≥ 768 px
**When** it renders
**Then** a sticky 200 px `<nav aria-label="Sections">` lists five items, each with a mono number, label and count slot: "01 Personal information", "02 Phone", "03 Email", "04 Social media", "05 Addresses" (count blank until Sections supply one)
**And** the main column holds five Section containers in that order with ids `personal`, `phone`, `email`, `social`, `addresses`, each an `aria-labelledby` region with an `h2` title focusable via `tabIndex={-1}`
**And** the Personal information container includes a placeholder row with id `signature`.

**Given** a Section menu item is activated by click, Enter or Space
**When** the action runs
**Then** the page scrolls to that Section (smooth, or instant under `prefers-reduced-motion: reduce`), focus moves to the Section `h2`, and the hash updates to `#<id>` without adding a history entry
**And** while scrolling, a scroll-spy (IntersectionObserver) sets `aria-current="location"` on exactly one item — the Section in view — styled with accent background, a 3 px inset primary bar and primary number/count.

**Given** the Contacts tab below 768 px
**When** it renders
**Then** the menu is replaced by a full-width "Jump to" select under the tabs with the same five options (mono number + name) and the same scroll, focus and hash behavior
**And** the Insurance and Medical tabs show neither the menu nor Jump to, and Insurance content uses the full main-column width.

**Given** a deep link `?tab=contacts#<hash>`
**When** the page loads or `hashchange` fires
**Then** `#personal`, `#phone`, `#email`, `#social` or `#addresses` scrolls to that Section and `#signature` scrolls to the Signature row inside Personal information
**And** an unknown hash, or any hash on the Insurance or Medical tab, leaves the page at the top of the tab without error
**And** tab and hash survive a refresh (Playwright test for `?tab=contacts#signature`).

**Given** a Section placeholder
**When** it is in its loading state
**Then** `SectionFrame` (`features/shell/section-frame.tsx`) renders three skeleton rows inside the real table container with column headers (shimmer, static under reduced motion), while the app bar, header slot, tabs and menu render immediately
**And** in its error state it replaces the rows with an inline error banner (alert icon, error-strong text) "Couldn't load {section} · Retry" whose Retry calls that Section's retry handler only, leaving other Sections untouched
**And** a component test proves an error in one `SectionFrame` does not change the state of the others.

**Given** the Insurance tab
**When** it renders
**Then** it shows one Section container with id `insurance` in its loading placeholder state and no menu.

**Given** the Medical tab
**When** it renders
**Then** it shows a quiet centered muted panel with exactly "Coming soon: your medical information will appear here." (RC9), no action
**And** an MSW test asserts that switching to Medical issues no network request.

**Given** a 360 × 740 viewport (Playwright mobile project)
**When** each tab is opened
**Then** `document.documentElement.scrollWidth <= clientWidth` (no horizontal scroll), page gutters are 16 px, and every interactive control (tabs, menu items, Jump to, Return to 1health, Retry) has a hit area of at least 44 × 44 px.

**Given** keyboard-only use
**When** the user tabs through the page
**Then** the order is app bar → header slot → tabs → Section menu (or Jump to) → Sections in order
**And** every interactive element shows the focus ring (2 px ring-color outline, 2 px offset, `shadow-glow`) on `:focus-visible`, and focus is never removed or trapped
**And** an `@axe-core/playwright` scan (pinned version) of each tab in light and dark themes, at desktop and 360 px, reports no WCAG 2.1 AA violations.

**Given** shell copy
**When** it renders
**Then** tab names, "Coming soon", "Soon", "Jump to", Section labels, the Medical text and the load-error template come from `lib/shared/messages.ts`, and `h2` titles use the section-title role (text-body 600) with mono-index numbers.

**Covers:** FR3, FR8, FR32, NFR2, NFR3, NFR4, NFR5, NFR7, AD-5 (framed app bar), AD-7 (Section ids, unknown tab/hash), RC9 · UX-DR1, UX-DR2, UX-DR3, UX-DR4, UX-DR5, UX-DR6, UX-DR8, UX-DR9, UX-DR11, UX-DR12, UX-DR13, UX-DR17, UX-DR18, UX-DR19, UX-DR33, UX-DR34, UX-DR35, UX-DR51, UX-DR57, UX-DR58, UX-DR60, UX-DR62, UX-DR63, UX-DR64, UX-DR66, UX-DR67, UX-DR68, UX-DR69 · **Jira:** NG-9020

### Story 1.9: Profile header view — name, picture and primary contacts

As a Launching user,
I want to see my name, Profile Picture and primary contacts in the profile header,
So that I can confirm whose profile I am editing at a glance.

**Acceptance Criteria:**

**Given** `lib/api/keys.ts`
**When** this story is done
**Then** it defines exactly these header keys, which every later story reuses instead of defining its own: `keys.myself()` = `["pp","myself"]` (from Story 1.4), `keys.contactPoints("Phone")` = `["pp","contact-points","Phone"]` (fetches `type=Mobile&type=Landline`), `keys.contactPoints("Email")` = `["pp","contact-points","Email"]` (fetches `type=Email`), and `keys.profilePictureId()` = `["pp","profile-picture-id"]` (AD-10)
**And** `fetchContactPoints(types)` in `lib/api/contact-points.ts` issues one `callApi` `GET /api/1h/v2/user/contact-point/list` with repeated `type` params and returns typed rows `{id, value, type, label, isVerified, isNotificationEnabled, phoneNumberRegion}`
**And** the proxy allowlist entry for `GET /v2/user/contact-point/list` is added in this change (no body; allowed query: repeated `type` matching `^(Mobile|Landline|Email|Social Media)$`, any other param → 400 `BAD_QUERY`), with a proxy test
**And** a unit test asserts the three key tuples above so Epic 3 Sections that `mutate` them refresh the header.

**Given** a signed-in user whose `["pp","myself"]` key (Story 1.4 `useMyself`) has resolved
**When** the profile page renders
**Then** `features/header` renders a header band (background, bottom border, page-gutter padding 24 px desktop / 16 px mobile) with the 40 px avatar and `{firstName} {lastName}` from `myself` as the page's single `h1` in the profile-name type role
**And** while `myself` is loading the header frame renders immediately with a skeleton for the name and avatar (no layout shift larger than the 40 px avatar box)
**And** no "Last updated" line is rendered (RC8).

**Given** the viewport is >= 768 px
**When** the header renders
**Then** the primary phone and primary email (the row labelled Primary) are right-aligned (muted label, foreground 500 tabular value) read from `["pp","contact-points","Phone"]` and `["pp","contact-points","Email"]`, and a missing primary or a failed request renders nothing for that item (the header never shows an error)
**And** below 768 px only the avatar and name render, and the contact-point keys are not fetched by the header (UX-DR14, UX-DR67).

**Given** any `mutate` of `["pp","myself"]`, `["pp","contact-points","Phone"]` or `["pp","contact-points","Email"]`
**When** the new data arrives
**Then** the header name and primary phone/email update without a page reload (FR9; component test mutates each key).

**Given** a signed-in session
**When** the client calls `GET /api/pp/profile-picture-id` (via `callApi`, key `["pp","profile-picture-id"]`)
**Then** `app/api/pp/profile-picture-id/route.ts` (exporting `dynamic = "force-dynamic"`) calls `requireSession()`, runs a GraphQL query document stored on the server (`Person(userId){PersonHasProfilePictureFile}`) with variables taken only from the session (no client-supplied ids or query text), with `cache: "no-store"`
**And** it responds `200 {"fileId": <number>}` or `200 {"fileId": null}` with `Cache-Control: private, no-store, max-age=0`, `Pragma: no-cache`, `Vary: Cookie`
**And** without a session it responds `401 {"code":"SESSION_EXPIRED"}`, it checks `X-PP-Session` like the proxy (409 `SESSION_CHANGED` on mismatch), with `PP_DISABLED=1` it answers 503 `SERVICE_DISABLED`, and it is the only GraphQL path in the app (`/api/1h/**` still returns 403 `NOT_ALLOWED` for any GraphQL path)
**And** an upstream error returns `502 {"code":"UPSTREAM_ERROR"}` without the upstream body, and the server log line carries only `{requestId, routeTemplate, status, errorName}`.

**Given** `profile-picture-id` returns a `fileId`
**When** the avatar renders
**Then** it is an `<img src="/api/1h/v2/user/profile-picture/preview?v={fileId}" alt="">`, and the proxy allowlist entry `GET /v2/user/profile-picture/preview` is added in this change as the first `asImage` entry (allowed query: `v` matching `^\d{1,19}$`; GET without `X-PP-Session` allowed only on `asImage` entries, AD-17)
**And** this story implements the proxy's `asImage` handling used by every later image entry: the response carries `Content-Disposition: inline` only when the declared type is `image/png|jpeg|bmp` and the leading bytes match, otherwise `attachment; filename="file"`, plus `X-Content-Type-Options: nosniff` and `Cache-Control: private, no-store, max-age=0` (upstream `ETag`, `Last-Modified`, `Expires`, `Cache-Control` dropped); a table test covers PNG, JPEG, BMP, SVG and HTML bodies
**And** if the image fails to load (`onerror`) the avatar falls back to the initials placeholder.

**Given** `fileId` is `null`, or `myself` has a first and last name but no picture
**When** the avatar renders
**Then** it shows the initials (first letter of first name + first letter of last name, uppercase, primary color, weight 600) on a card-background circle with a border; a user with only one name shows one initial; no name shows a user icon.

**Given** the header in light and dark theme at 360 px and 1280 px
**When** axe runs (Playwright, mocked proxy)
**Then** there are no axe violations and there is no horizontal scroll at 360 px.

**Covers:** FR9, NFR1, NFR2, NFR4, AD-2, AD-10, AD-13 (asImage downloads), AD-17, AD-18 · UX-DR8, UX-DR9, UX-DR14, UX-DR67, UX-DR68 · **Jira:** NG-9021

### Story 1.10: Change Profile Picture

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
**Then** a `Content-Length` over `maxBytes`, or a body exceeding `maxBytes` while reading, returns `413 {"code":"TOO_LARGE"}` without calling upstream
**And** a body that is not `multipart/form-data` with exactly one file part named as the entry expects returns `415 {"code":"UNSUPPORTED_MEDIA"}` without calling upstream
**And** a file part whose leading bytes are not one of the entry's allowed types — PNG (`89 50 4E 47 0D 0A 1A 0A`), JPEG (`FF D8 FF`), BMP (`42 4D`) — returns `415 {"code":"UNSUPPORTED_MEDIA"}` without calling upstream
**And** a table-driven Vitest covers: 4 MB exactly (accepted), 4 MB + 1 byte (413 via header and via a chunked body without `Content-Length`), SVG/HTML/GIF payloads renamed `.png` (415), two file parts (415), part named `image` (415), a JSON body (415), and a PNG-only fixture entry rejecting a JPEG (415).

**Given** the upload succeeded and an old `fileId` existed
**When** the client continues
**Then** it sends `DELETE /api/1h/v2/file/{oldId}` with no query, and the proxy allowlist entry `DELETE /v2/file/{id}` is added in this change with `hardDelete=true` forced server-side (any client-sent `hardDelete` ignored; no other query allowed)
**And** if that delete fails (any status or network error) the save is still reported as successful and nothing is shown to the user
**And** after the upload (whether or not the delete succeeded) the client `mutate`s `["pp","profile-picture-id"]` so the avatar shows the new picture immediately, closes the dialog, shows the success toast "Profile picture saved." (draft copy) through the existing `hooks/use-toast`, and returns focus to the avatar button (FR10, AD-13).

**Given** the upload fails
**When** the response is `413 TOO_LARGE`, `415 UNSUPPORTED_MEDIA`, another 4xx/5xx, or a network failure
**Then** the dialog stays open with the chosen preview, the current avatar is unchanged, no delete is sent, and an error line appears above the footer: for 413/415 "{file name} couldn't be used. Choose another file." (draft copy); for network failure or 5xx "Couldn't save your profile picture. Check your connection." with a "Retry" button that re-runs the upload with the same re-encoded blob (draft copy)
**And** on `SESSION_EXPIRED` or `SESSION_CHANGED` the dialog closes and the Story 1.7 session dialog takes over (no error line, no toast).

**Given** the dialog and header in light and dark theme at 360 px and 1280 px
**When** axe and the keyboard pass run (Playwright, mocked proxy)
**Then** there are no axe violations, the full flow (open picker via keyboard, preview, Save, focus back to avatar) is keyboard-only completable, and there is no horizontal scroll at 360 px.

**Covers:** FR10, NFR1, NFR2, AD-2, AD-13, AD-17, RC11 · UX-DR10, UX-DR15, UX-DR16, UX-DR51, UX-DR61, UX-DR64, UX-DR67, UX-DR68 · **Jira:** NG-9021

### Story 1.11: Section framework — registry, edit model, inline validation and shared primitives

As a user editing my profile,
I want every Section to have a predictable read view and edit view with inline validation and consistent controls,
So that I can edit several parts of my profile with confidence that nothing is saved by accident.

**Acceptance Criteria:**

**Given** `features/shell/section-registry.tsx`
**When** a Section component calls `useRegisterSection({ id, label, displayOrder, form, validate, save, discard, draftFields, saveAll? })`
**Then** the registry stores it under `id` (type `SectionId = "personal" | "phone" | "email" | "social" | "addresses" | "insurance"`), unregisters it on unmount, and throws in development if the same `id` registers twice
**And** the registry exposes `getDirty()`, `dirtyCount` (only Sections with `saveAll !== false`), `isAnyDirty` (all Sections, including guard-only), `subscribe()`, and per-Section `validate()`, `save()` and `discard()`; no other module keeps dirty, save or draft state (AD-7)
**And** a guard-only participant (`saveAll: false`, e.g. Insurance) may register `save` and `validate` for the leave guard to call; when it omits `save` the registry records `canSave: false` for it.

**Given** a Section's `save()` implementation throws or rejects
**When** the registry (or the Section's own Save button) calls it
**Then** the registry's wrapper resolves `{ ok: false, error: { code: "UNEXPECTED" } }` and never propagates the exception; a unit test asserts this for a throwing and a rejecting `save()`.

**Given** the helper `runSaveSteps(steps, { refetch, rebase })` in `features/shell`
**When** step 2 of 3 fails
**Then** step 3 is not run, `refetch()` revalidates the Section's SWR keys, `rebase()` resets the form baseline to the refetched server data while keeping the user's remaining edits, and the helper resolves `{ ok: false, error }`; a retry sends only the remaining diff (unit test with a 3-step fixture asserts the requests sent on first attempt and on retry).

**Given** the test fixture Section `features/shell/__fixtures__/fixture-section.tsx` (registered only in tests and the Playwright mock page, id `phone`, label "Phone") with a zod 4 schema in its own `schema.ts`, one `useForm` with `zodResolver`, a required text field and a list of rows
**When** it renders with loaded data
**Then** it shows the read view by default inside the Story 1.8 `SectionFrame`: a Section header row 44 px tall with the `h2` title, the count of saved entries, and an outline "Edit" button on the right (UX-DR20)
**And** all the behaviors below are proven against this fixture with Vitest + Testing Library + MSW and one Playwright spec.

**Given** a Section in read view
**When** the user activates "Edit"
**Then** the Section switches to edit view: the table container gets a primary border and 3 px accent halo, inputs appear in editable cells, focus moves to the first input, and the header shows muted "Editing" in place of the count
**And** activating "Add {thing}" instead enters edit view with one new empty row focused and status "New · not saved"
**And** a second Section can be opened in edit view at the same time without affecting the first (FR4).

**Given** a Section in edit view
**When** the user changes a value
**Then** the table footer shows the 8 px warning dot and "Unsaved changes" (warning-strong text, polite live region) on the first change; reverting every field to its baseline value removes the indicator and the Section is no longer counted as dirty (dirty = deep inequality with the baseline, not "touched")
**And** footer actions are "Add row" (ghost, when the Section supports rows), Cancel (secondary) and Save (primary).

**Given** a dirty Section in edit view
**When** the user activates Cancel
**Then** only that Section reverts to its baseline and returns to read view with no confirm, its errors clear, other Sections keep their edits, and focus moves to the Section `h2`.

**Given** a Section in edit view
**When** the user presses Escape inside the table or Enter inside a text input
**Then** Escape does not cancel and Enter does not submit the Section (UX-DR57).

**Given** a field with an invalid value
**When** the field blurs, or the user activates Save
**Then** the input (44 px, 16 px text, `rounded-md`, 1 px control-border) shows the 2 px error border, `aria-invalid="true"` and `aria-describedby` linking an error-strong help line with an alert icon whose text is the `lib/shared/messages.ts` entry for the zod issue (e.g. "Enter a valid email address")
**And** zod schemas reference message keys only (a lint rule or test fails on string literals passed as zod messages in `features/**/schema.ts`) (AD-11)
**And** on Save with any invalid field no request is sent and focus moves to the first invalid field (FR4).

**Given** a valid dirty Section
**When** the user activates Save
**Then** Save shows a spinner and "Saving…", inputs become read-only, Cancel is disabled, and other Sections stay usable
**And** on `{ ok: true }` the Section returns to read view, focus moves to the Section `h2`, and `telemetry.track("section_save", { sectionId, ok: true, code: null })` (via `lib/shared/telemetry.ts`, no-op sink) fires with no other keys (AD-15)
**And** on `{ ok: false }` the Section stays in edit view with the user's edits kept and `section_save { sectionId, ok: false, code }` fires.

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
**Then** it has muted fill, slate text, border and not-allowed cursor, stays in the tab order with `aria-disabled="true"` and `aria-describedby` to the tooltip id, activation by click, Enter or Space is a no-op, and the tooltip (graphite, 6 px radius, arrow, above the control) opens on hover, keyboard focus and tap, and closes on Escape, blur and tap outside; the fixture's Add at 20 rows shows "You've reached the limit of 20 phones" (UX-DR28, UX-DR55).

**Given** `components/ui/confirm-dialog.tsx` created in this story
**When** it is opened with `{ title, body, confirmLabel, variant: "standard" | "destructive", onConfirm, onCancel, extraAction?, busy? }`
**Then** it is a shadcn Dialog with `role="alertdialog"`, `aria-labelledby` (title) and `aria-describedby` (body), `rounded-lg`, elevation-2 (`shadow-lg`) over a dimmed overlay, and an `ease-premium` 220–280 ms entrance (none under reduced motion)
**And** the footer is right-aligned: Cancel (secondary) then the confirm button — primary fill for `standard`, `bg-error-strong` fill with white text for `destructive`; an optional `extraAction` renders as an outline button between them (used by the leave guard)
**And** focus starts on Cancel; Escape and an overlay click behave exactly like Cancel (call `onCancel`, never `onConfirm`); on close, focus returns to the element that was focused when the dialog opened
**And** while `busy` is true the confirm button shows a spinner and Cancel, Escape and overlay click do nothing
**And** a component test covers both variants, focus start and return, Escape/overlay = Cancel semantics and `busy`, with an axe check
**And** it is the only confirm dialog component; the three named confirms (primary phone/email change, Remove signature, Delete insurance) and the leave guard reuse it, and no other confirm dialog may be added (UX-DR36, UX-DR59).

**Given** the framework components
**When** the Playwright spec runs axe and a keyboard-only pass over the fixture (read → Edit → invalid → fix → Save; Remove → Restore; kebab menu; disabled Add tooltip; a ConfirmDialog opened from a fixture button)
**Then** there are no axe violations, every control is >= 44 x 44 px, the footer indicator is announced via a polite live region, and no auto-save occurs (nothing is sent until Save) (UX-DR59).

**Covers:** FR4, NFR2, NFR3, AD-7, AD-11, AD-15 · UX-DR5, UX-DR7, UX-DR10, UX-DR11, UX-DR20, UX-DR22, UX-DR26, UX-DR27, UX-DR28, UX-DR29, UX-DR36, UX-DR51, UX-DR54, UX-DR55, UX-DR56, UX-DR57, UX-DR59, UX-DR60, UX-DR61, UX-DR62, UX-DR63, UX-DR64 · **Jira:** NG-9020

### Story 1.12: Error mapping, message catalog, toasts and Retry

As a user saving or loading my profile,
I want clear, consistent messages when something works or fails, with a way to retry,
So that I always know what happened and can recover without reloading the page.

**Acceptance Criteria:**

**Given** `lib/shared/messages.ts`
**When** the unit test compares it with the EXPERIENCE.md Voice and Tone table
**Then** every Voice and Tone string exists verbatim as a message key (including "Unsaved changes", "{N} unsaved sections", "Save all (N)", "Discard all", "{Section} saved.", "{X} saved, {Y} failed", "Couldn't save {section}. Check your connection.", "Retry", "You have unsaved changes", "Keep editing", "Discard", "Save", "Removed on save", "Restore", "New · not saved", "Couldn't load {section} · Retry", "Not provided", disabled-action reasons, draft restore/conflict copy) plus architecture-added strings
**And** every string not from EXPERIENCE.md or the PRD carries a `// DRAFT COPY` marker, and the voice rules are checked by a test (no exclamation marks; no "contact point" or "precedence" in sentences) (AD-11, UX-DR68).

**Given** `lib/api/errors.ts`
**When** `mapApiError(sectionId, response)` receives an `ApiResponse` with `errorCode`
**Then** known backend codes map to `{ field, messageKey }` from a per-Section table (unit-tested with `SOCIAL_SECURITY_NUMBER_EXISTS` → field `ssn`, "This SSN belongs to another person", and `INVALID_ENUM_VALUE` → Section level), the message is shown at the field when a field is mapped and at Section level otherwise
**And** network failures (no `statusCode`), `502 UPSTREAM_ERROR|UPSTREAM_REDIRECT`, `503 REFRESH_UNAVAILABLE|SERVICE_DISABLED` and `504 UPSTREAM_TIMEOUT` map to `{ kind: "network" }`
**And** any unknown code maps to a generic Section-level error "Couldn't save {section}." (draft copy) with Retry
**And** `SESSION_EXPIRED` and `SESSION_CHANGED` map to `{ kind: "session" }` and the Section shows no error or toast (the Story 1.7 dialogs handle them); no module other than `errors.ts` inspects `errorCode`.

**Given** `features/shell/toasts.ts`, the single toast API built on the existing `hooks/use-toast` and shadcn Toast
**When** a toast is shown
**Then** it renders bottom-right on desktop and bottom-center on mobile (above the Save all pill when present), `rounded-lg`, `shadow-lg`, in a polite live region
**And** `toastSuccess(text)` shows a success-strong check icon and auto-dismisses after 5 s, paused on hover or focus; `toastPartial(text)` shows a warning-strong alert icon; `toastError(text, { onRetry })` shows an error-strong alert icon and a "Retry" button and persists until dismissed; there is no undo toast
**And** the Story 1.10 "Profile picture saved." toast is moved to `toastSuccess` with no visible change, and no other module calls `hooks/use-toast` directly (lint rule).

**Given** a Section save resolves `{ ok: true }` outside Save all
**When** the result returns
**Then** a success toast "{Section label} saved." appears (e.g. "Phone saved.") in addition to the Story 1.11 read-view, focus and telemetry behavior.

**Given** a Section save fails with a mapped validation error
**When** the result returns
**Then** the Section stays in edit view with the error at the field (or Section level, above the table footer), the user's edits are kept, and focus moves to the first field showing an error.

**Given** a Section save fails with `{ kind: "network" }`
**When** the result returns
**Then** the Section stays in edit view with a Section-level error "Couldn't save {section lowercase}. Check your connection." (e.g. "Couldn't save phone. Check your connection.") and a "Retry" button, and an error toast with the same copy and "Retry" persists until dismissed; Retry re-runs that Section's `save()`; there is no offline queue (FR7).

**Given** a Section's read fails
**When** it renders
**Then** the Story 1.8 `SectionFrame` error banner shows "Couldn't load {section lowercase} · Retry" (e.g. "Couldn't load phones · Retry") from `messages.ts`, "Retry" revalidates only that Section's SWR keys, and other Sections are unaffected (NFR5).

**Given** the fixture Section from Story 1.11
**When** the Playwright spec runs Save success, a mocked 400 with a mapped `errorCode`, and a mocked network failure → Retry → success
**Then** the toasts and errors above appear with the exact copy, toasts are announced via a polite live region, and there are no axe violations.

**Covers:** FR7, NFR2, NFR5, NFR14, AD-11, AD-19 (error mapping) · UX-DR33, UX-DR44, UX-DR56, UX-DR61, UX-DR62, UX-DR68 · **Jira:** NG-9020

### Story 1.13: Leave guard

As a user with unsaved changes,
I want to be asked before I lose them by switching tabs, going back to 1health, closing an editor or closing the page,
So that I never lose edits by accident and can save them on the way out.

**Acceptance Criteria:**

**Given** at least one registered Section (including a guard-only `saveAll: false` participant) is dirty
**When** the user closes or reloads the page
**Then** a `beforeunload` handler triggers the browser's native prompt; with no dirty Section no handler is attached (FR6)
**And** the handler is suppressed for navigations the app has already confirmed (leave-guard confirm, session-expired "Return to 1health").

**Given** the leave guard (`features/shell/leave-guard.tsx`) registered through `setLeaveGuard` on the Story 1.7 `requestLeave()`
**When** the user activates another tab (Story 1.8 tabs) or the app-bar "Return to 1health" (Story 1.8, which calls `returnToPortal()` from Story 1.7) while any Section on the page is dirty
**Then** the leave guard opens using `components/ui/confirm-dialog.tsx` (Story 1.11): title "You have unsaved changes", buttons "Keep editing" (secondary, initial focus), "Discard" (outline, the `extraAction`), "Save" (primary); Escape equals "Keep editing" and focus returns to the trigger
**And** "Keep editing" cancels the navigation
**And** "Discard" calls `discard()` on every dirty Section and guard-only participant, then completes the navigation (tab switch, or logout + navigate to `PORTAL_URL`)
**And** with no dirty Section, tab switch and "Return to 1health" proceed with no dialog (FR6, UX-DR42).

**Given** the leave guard is open and every dirty participant can save
**When** the user activates "Save"
**Then** it validates every dirty Section and guard-only participant first; if any is invalid nothing is sent, the dialog closes, the navigation is cancelled and focus moves to the first invalid field
**And** otherwise it saves the dirty Save-all Sections one at a time, then calls each dirty guard-only participant's own `save()` (e.g. the Insurance editor's policy save), and completes the navigation only if every call returned `{ ok: true }`; otherwise it stays, with the failed Sections' or participant's errors shown.

**Given** a dirty guard-only participant registered without `save` (`canSave: false`)
**When** the leave guard opens
**Then** the "Save" button is not rendered; the dialog offers only "Keep editing" and "Discard", and its body states that the changes can't be saved from here *(draft copy)*.

**Given** a guard-only participant asks to close itself (e.g. an editor drawer's close, Cancel, Escape, scrim or mobile Back) via `requestLeave({ scope: participantId })`
**When** that participant is dirty
**Then** the same dialog opens scoped to that participant only: "Discard" calls only its `discard()`, "Save" (shown only when it can save) calls only its `validate()` then `save()` and closes it on `{ ok: true }`, and "Keep editing" keeps it open
**And** when it is clean, `requestLeave` resolves `true` immediately with no dialog.

**Given** the fixture Section from Story 1.11 plus two guard-only fixtures (one with `save`, one without)
**When** Vitest and one Playwright spec run (tab switch with each dirty combination; Return to 1health; scoped close; Save with an invalid field; Save with a failing participant)
**Then** each case behaves as above, there are no axe violations, and the dialog is keyboard-operable with focus returning to the trigger.

**Covers:** FR3 (leave guard on tab switch), FR6, NFR2, AD-7 (guard-only participants) · UX-DR13, UX-DR17, UX-DR36, UX-DR42, UX-DR61, UX-DR62 · **Jira:** NG-9020

### Story 1.14: Save all

As a user who has edited several Sections,
I want one "Save all" action that validates everything first and then tells me honestly what saved and what didn't,
So that I can finish a multi-Section update in one step without being misled about partial failures.

**Acceptance Criteria:**

**Given** the registry `dirtyCount` (Sections with `saveAll !== false`; Insurance guard-only participants never counted)
**When** `dirtyCount` goes from 0 to N >= 1 at viewport >= 768 px
**Then** a sticky bottom card bar with a top border appears (flat, no shadow): 8 px warning dot, "{N} unsaved section" / "{N} unsaved sections" (600, polite live region), a muted sub-line (empty until validation finds problems), and on the right "Discard all" (secondary) and "Save all (N)" (primary)
**And** at `dirtyCount` = 0 the bar is removed from the DOM (FR5, UX-DR31).

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
**Then** `validate()` runs on every dirty Section first, no request is sent, every invalid field shows its inline error, the sub-line names each problem Section ("{Section} has 1 field to fix" / "{Section} has {n} fields to fix", e.g. "Email has 1 field to fix"), and focus moves to the first invalid field in page (`displayOrder`) order, scrolling it into view (smooth unless reduced motion).

**Given** every dirty Section is valid
**When** the Save-all run starts
**Then** "Save all (N)" shows a spinner and "Saving…" and cannot be activated again until the run ends
**And** dirty Sections are saved one at a time, each awaited fully (including any auto-verify inside that Section's `save()`), in `SAVE_ORDER = ["personal", "email", "phone", "social", "addresses"]` exported from `features/shell/save-order.ts`, regardless of `displayOrder`; clean Sections are skipped (AD-8)
**And** per-Section success toasts are suppressed during the run (one summary toast only), while each Section still shows its own saving state and emits its `section_save` event.

**Given** a Section's save returns `{ ok: false }` with a non-session error mid-run
**When** the runner continues
**Then** later Sections in `SAVE_ORDER` are still saved; the failed Section stays in edit view with its field/Section error and Retry.

**Given** a Section's save returns `SESSION_EXPIRED` or `SESSION_CHANGED`
**When** the runner receives it
**Then** the run stops, no later Section is attempted, no summary toast is shown, and the Story 1.7 session dialog takes over.

**Given** a completed run with S succeeded and F failed
**When** the run ends
**Then** succeeded Sections are in read view; if F = 0 the toast is "{Section} saved." when one Section was saved and "All saved." (draft copy) when more than one; if F >= 1 the toast is "{S} saved, {F} failed" with the warning-strong alert icon (e.g. "2 saved, 1 failed", also "0 saved, 2 failed"), and the text "All saved" never appears unless F = 0 (unit test over the run outcomes)
**And** after a partial failure the bar remains with N = F and focus moves to the first failed Section's error; after full success focus moves to the `h2` of the first saved Section in page order.

**Given** a completed or stopped run that sent at least one save
**When** it ends
**Then** `telemetry.track("save_all", { saved: S, failed: F })` fires exactly once with exactly those two numeric keys (test asserts the payload has no other keys and contains no field values or user ids) (AD-15, NFR14).

**Given** the leave guard from Story 1.13
**When** the user chooses "Save" in it
**Then** it saves the dirty Save-all Sections with this same runner (validation first, `SAVE_ORDER`, stop on session events), then calls each dirty guard-only participant's own `save()` as defined in Story 1.13, and completes the navigation only when every save succeeded.

**Given** a Playwright spec against the mocked proxy with two fixture Sections dirty and the second mocked to fail
**When** Save all runs at 1280 px and at 360 px
**Then** the request order follows `SAVE_ORDER`, the toast reads "1 saved, 1 failed", the bar/pill shows "Save all (1)", there are no axe violations, and there is no horizontal scroll at 360 px.

**Covers:** FR5, AD-7, AD-8, AD-15, NFR5, NFR14, UX-DR10, UX-DR31, UX-DR32, UX-DR44, UX-DR57, UX-DR61, UX-DR62, UX-DR63, UX-DR67 · **Jira:** NG-9020

### Story 1.15: Drafts — keep unsaved edits across an expired session

As a user whose session expires mid-edit,
I want my unsaved changes kept on this device and offered back when I relaunch, with a clear choice if the data changed meanwhile,
So that I never lose work to a timeout and never silently overwrite newer data.

**Acceptance Criteria:**

**Given** `features/shell/drafts.ts` and a Section registered with non-empty `draftFields`
**When** the user changes a value in that Section's edit view and `myself` has loaded
**Then** after 500 ms without further changes the registry writes `localStorage["pp:draft:v1:<userId>:<sectionId>"] = JSON.stringify({ savedAt: <epoch ms>, baseHash, values })`, where `userId` is the `myself` id, `baseHash` is a stable hash (sorted-key JSON, SHA-256 hex) of the server data the edit started from, and `values` contains only the keys listed in `draftFields`
**And** if the Section becomes clean again (every field back to baseline) its draft key is deleted
**And** only the registry writes draft keys; no Section touches `localStorage` (AD-12).

**Given** a Section registers `draftFields` containing a denylisted key (`ssn`, `socialSecurityNumber`, `signature`, `signatureFile`) or a Section with `saveAll: false`
**When** it registers
**Then** the registry throws in development and drops those keys in production; a test asserts a draft written while SSN and Signature are dirty contains neither, and that Insurance never writes a draft key (FR2, NFR1).

**Given** `localStorage` is unavailable, full or throws
**When** a draft read or write is attempted
**Then** the error is caught, nothing is shown to the user, and editing and saving work normally.

**Given** the `session-expired` event (Story 1.4) and the `onBeforeSessionExpired` hook of the Story 1.7 dialog
**When** the shell receives it
**Then** pending debounced writes are flushed and a draft is written for every dirty draftable Section before the "Your session ended" dialog opens (test asserts write-before-open order)
**And** choosing "Return to 1health" (or "Close and reopen from 1health" when framed) in that dialog keeps the drafts (UJ-5, UX-DR37, UX-DR70).

**Given** the `session-changed` event
**When** the shell receives it
**Then** pending debounced writes are cancelled and no draft key is written or updated.

**Given** a dirty Section with a draft
**When** the Section saves with `{ ok: true }` (alone, via Save all or via the leave guard), or is discarded (Cancel, "Discard all", leave-guard "Discard")
**Then** that Section's draft key is deleted
**And** when the user confirms the app-bar "Return to 1health" (directly when clean, or after the leave guard), every `pp:draft:v1:<userId>:*` key for the current user is deleted before logout.

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

**Covers:** FR2, AD-12, AD-19, NFR1, UX-DR33, UX-DR37, UX-DR40, UX-DR41, UX-DR62, UX-DR67, UX-DR70 · **Jira:** NG-9020

### Story 1.16: Deployments, environments and operations runbooks

As a release owner (Daniel Garcia),
I want three pinned Vercel deployments with per-environment secrets, a kill switch, and written registration and go-live runbooks,
So that each 1health environment reaches only its own deployment, releases are promoted from verified builds, and a bad release can be stopped in minutes.

**Acceptance Criteria:**

**Given** the Vercel team
**When** the projects are configured
**Then** three projects exist, `personal-profile-dev`, `personal-profile-demo`, `personal-profile-prod`, each linked to this repo, each with `APP_ENV` set to `dev`, `demo` and `prod` respectively in its Production scope, Node 24.x, and pnpm via corepack
**And** each project's production domain is its `APP_ORIGIN` (default `https://personal-profile-<env>.vercel.app`), recorded in `docs/ops/deployments.md`
**And** `lib/server/env.ts` fails the build and boot when `APP_ENV` is missing or not one of `dev|demo|prod`, and a Vitest asserts `API_ORIGIN`/`PORTAL_ORIGIN` resolve to `https://dev.1hdev.io`, `https://demo.1health.io`, `https://app.1health.io` per `APP_ENV` (AD-3).

**Given** each project's environment variables
**When** they are reviewed against `docs/ops/deployments.md`
**Then** each project holds its own `ONEHEALTH_SECRET_KEY`, `APP_ID`, `SESSION_SECRET` (>= 32 random bytes, distinct per project), `GOOGLE_PLACES_KEY`, and non-secret `APP_ENV`, `PLACES_ENABLED` (default `0`), `PP_DISABLED` (default unset)
**And** no variable is named `NEXT_PUBLIC_*` except `NEXT_PUBLIC_APP_ENV`, and no name carries a `_DEMO`/`_PROD` suffix (Story 1.1 CI grep stays green)
**And** `docs/ops/deployments.md` contains an environment table (project, `APP_ENV`, `APP_ORIGIN`, API origin, portal origin, owner) with no secret values.

**Given** the dev project
**When** a commit lands on `main`
**Then** it auto-deploys to `personal-profile-dev`, and PR preview deployments are built only in the dev project using only dev-scoped secrets
**And** on the demo and prod projects Git auto-deploy and preview deployments are disabled (`git.deploymentEnabled: false` / project setting), so no preview build ever receives demo or prod secrets.

**Given** a commit SHA that passed CI and was smoke-tested on dev
**When** the release owner runs the `promote` GitHub Actions workflow (`workflow_dispatch` inputs `env: demo|prod`, `sha`)
**Then** the workflow refuses a SHA that is not on `main` or whose CI checks did not pass, deploys that exact SHA to the target project with `vercel deploy --prod`, requires the `production` GitHub environment approval for `prod`, and prints the deployment URL; demo and prod are never deployed any other way (AD-20, NFR11).

**Given** `docs/ops/secrets-rotation.md`
**When** the release owner reads it
**Then** it gives step-by-step procedures: `SESSION_SECRET` (set `SESSION_SECRET_PREVIOUS` = old, new `SESSION_SECRET`, redeploy, wait >= 8 h absolute session limit, remove previous, redeploy); `ONEHEALTH_SECRET_KEY`/`APP_ID` (change in the External Application registration and Vercel together, redeploy immediately, expect in-flight launches to fail with `/launch-error`); `GOOGLE_PLACES_KEY` (new key in GCP restricted to Places API (New) with daily quota cap and budget alert, update Vercel, redeploy, delete old key)
**And** states rotation triggers: suspected exposure, team change, and at least yearly, with owner Daniel Garcia.

**Given** `PP_DISABLED=1` on a deployment (then redeployed)
**When** any request reaches `/launch`, `/api/1h/**`, `/api/pp/**`, `/api/session/refresh`, `/api/session/ping` or `/`
**Then** API routes return `503 {"code":"SERVICE_DISABLED"}` with the AD-18 no-store headers and make no upstream call (AD-20)
**And** `/launch` answers status 503 and renders the Story 1.2 `disabled` full-page message (title "Personal Profile is unavailable right now", body "Use your profile in 1health for now.", action "Return to 1health"; draft copy) directly, with no redirect, without decrypting or exchanging the `lpl` and without touching the session cookie; `/` renders the same page with status 503
**And** with `PP_DISABLED` unset or any value other than `1` behavior is unchanged
**And** a Vitest table covers each route family with the flag on and off (NFR12).

**Given** a bad production release
**When** the release owner follows `docs/ops/rollback.md`
**Then** the runbook lists, in order: (1) Vercel instant rollback to the previous production deployment of the affected project; (2) incident stop with `PP_DISABLED=1` + redeploy; (3) ending live sessions by setting `isAllowedForPatients=false` on the External Application (disabling the app alone does not revoke tokens); (4) turning the 1health-fe cutover flag off so the sidebar returns to `/profile` (NFR9 owner Daniel Garcia); each step names who runs it and how to verify it (e.g. `curl -sI <APP_ORIGIN>/launch` shows 503)
**And** the rollback and kill switch are rehearsed once on demo before the go/no-go, with the date recorded in the checklist.

**Given** `docs/ops/external-application-registration.md`
**When** an environment (dev, demo, then prod) is registered
**Then** the runbook specifies: application name "Personal Profile", launch URL exactly `<APP_ORIGIN>/launch` for that environment, icon file path, launch secret generated in 1health and copied into that project's `ONEHEALTH_SECRET_KEY` and `APP_ID`, status **Active**, **isAllowedForPatients = true**
**And** verification steps: `curl -sI <APP_ORIGIN>/` shows `Content-Security-Policy` containing `frame-ancestors <PORTAL_ORIGIN>` for that environment and no `X-Frame-Options`; a test patient sees "Personal Profile" in the portal and launching lands signed in on Contacts, both in a new tab and inside the portal frame
**And** owner Daniel Garcia and the per-environment registration date are recorded (NFR8).

**Given** `docs/ops/go-live-checklist.md`
**When** the release owner prepares demo and then prod
**Then** the checklist includes, each with owner and status: BAA executed with Vercel (functions, logs, any log drain) before any demo or prod deployment processes real PHI; BAA executed with Google before `PLACES_ENABLED=1` is set on demo/prod; no telemetry or log sink added without a BAA; External Application registered and Active per environment; CI green on the promoted SHA; demo QA of UJ-1 to UJ-5 passed by 2026-10-24 (otherwise production cutover is no-go and moves to the next release); rollback and kill switch rehearsed on demo; minimum alerting (proxy 5xx rate, `SESSION_EXPIRED` after refresh) and Vercel log retention decided; 1health-fe flag ready and off; production cutover on 2026-10-29 (release 2026.07.01 "Conduit") (NFR11, NFR13).

**Covers:** AD-3, AD-20 (projects, secrets, promotion, kill switch, runbooks), NFR6, NFR8, NFR11, NFR12, NFR13, UX-DR50 · **Jira:** NG-9027

## Epic 2: Identity — Personal Information, SSN and Signature

Users and providers keep their legal identity and demographics correct, reveal their own SSN safely, and draw or upload their Signature.

**FRs covered:** FR11, FR12, FR13, FR14 · **Jira:** NG-9022

**Depends on:** Epic 1 only (launch/session, allowlisted `/api/1h` proxy + `callApi` with literal `me` owner ids, `["pp","myself"]` SWR key, page shell with Section index/Jump to and `#signature` anchor, `SectionRegistry`/`useRegisterSection`, Section edit model and table footer, react-hook-form + zod + `lib/shared/messages.ts` + `lib/api/errors.ts`, aria-disabled tooltip pattern, Save all, drafts with per-Section `draftFields` allowlist, `components/ui/confirm-dialog.tsx` (Story 1.11), toasts (Story 1.12), `lib/shared/image-reencode.ts` (Story 1.10), the proxy `asImage` and upload-entry mechanisms (Stories 1.9 and 1.10) and the `DELETE /v2/file/{id}` entry with server-forced `hardDelete=true` (Story 1.10)). Each story adds the allowlist entries for the endpoints it uses. Stories 2.2–2.4 build on the earlier Epic 2 stories.

**Copy rule (all stories):** every user-facing string goes into `lib/shared/messages.ts`. Strings quoted from EXPERIENCE.md Voice and Tone or the approved `key-personal-info-edit.html` mock are verbatim. Strings marked *(draft copy)* are not in EXPERIENCE.md. They are flagged in `messages.ts` for PM review (UX-DR68).

---

### Story 2.1: View Personal Information

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
- `GET /v2/type/key/Person` — no query params allowed (any → 400 `BAD_QUERY`), no body, JSON response, `X-PP-Session` required; no server-forced params;
- `GET /v2/file/{id}/download` as an `asImage` entry for the Signature preview — `{id}` matching `^\d{1,19}$`, no query params allowed, no server-forced params; served `inline` only for PNG/JPEG/BMP with matching leading bytes, otherwise `attachment`, with the Story 1.9 `asImage` headers (`nosniff`, `Cache-Control: private, no-store, max-age=0`)
**And** another method on either template answers 405.

**Given** the component tests (Vitest + Testing Library + MSW at `/api`)
**When** they run
**Then** they cover: the F1 order, "Not provided" for null/empty/`"n/a"`/`[]`, the date format, array joining, Masked SSN only, signature present/absent/broken, option-list sort and `"n/a"` removal, fallback on a 500 from `/type/key/Person`, skeleton, and the error banner plus Retry
**And** an axe check passes on the read view in light and dark themes.

**Covers:** FR11, NFR1, NFR4, NFR5, NFR10, AD-2, AD-10, AD-13 (image via proxy URL), AD-17, AD-18 · UX-DR8, UX-DR24, UX-DR33, UX-DR34, UX-DR58 (anchor target), UX-DR67 · **Jira:** NG-9022

---

### Story 2.2: Edit and save Personal Information

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
**And** Birth date shows age-rule help before any error: "You must be 18 to 120 years old" (or "You must be 21 to 120 years old" for a user whose `myself.roles` includes Proctor) *(the Proctor variant is draft copy)*.

**Given** a name field (First, Middle, Last, prefix, suffix, Other names, Titles)
**When** I leave it or press Save
**Then** First name and Last name are required ("Enter your first name" / "Enter your last name" *(draft copy)*)
**And** every name field accepts printable characters only, including accented letters, apostrophes, hyphens, periods and spaces; control characters and emoji are rejected with "Use letters, spaces and standard punctuation only" *(draft copy)*
**And** leading and trailing whitespace is trimmed before validation and diffing.

**Given** the Birth date control (a date input shown as `MM/DD/YYYY`, sent as `YYYY-MM-DD`)
**When** I leave it or press Save
**Then** it is required, and it is invalid when the date is unparsable, in the future, or gives an age (whole years at today's local date) outside 18–120 (or 21–120 for Proctor)
**And** the error reads "You must be 18 to 120 years old" (or the Proctor variant) in error-strong with an alert icon, a 2 px error border, `aria-invalid="true"` and `aria-describedby` pointing at the message
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
**Then** it never contains `email`, `phoneNumber` or `phoneNumberRegion`, even when present in `myself`. A unit test asserts this for a full diff (AD-9).

**Given** the PUT succeeds
**When** the save resolves
**Then** the Section `mutate`s `["pp","myself"]`, the profile header name updates at once without a reload, the Section returns to read view, the toast "Personal information saved." appears, focus moves to the Section `h2`, and the Section's draft is cleared.

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
**Then** the proxy allowlist entry for `PUT /v2/user/edit` is added in this change (method + path template + allowed query; server-forced params): no query params allowed (any → 400 `BAD_QUERY`), JSON body only (`Content-Type` other than `application/json` → 415 `UNSUPPORTED_MEDIA`), CSRF and `X-PP-Session` required as a non-GET, no server-forced params
**And** a proxy test covers the happy path, a foreign `Content-Type`, a missing `X-PP-Session` (403 `CSRF`) and another method (405).

**Given** the zod schema `personalSchema` in `features/personal/schema.ts`
**When** unit tests run
**Then** they cover each rule above, the diff builder (changed-only, `"n/a"` on clear, no email/phone), the Proctor branch, defaults counted as changes, and `save()` result shapes for 200 / 400 with `errorCode` / network error.

**Covers:** FR12, FR4, FR7, FR9 (header refresh), NFR2, NFR10, NFR14, AD-7, AD-8, AD-9, AD-10, AD-11, AD-12, AD-19 · UX-DR9, UX-DR22, UX-DR24, UX-DR29, UX-DR56, UX-DR57, UX-DR61, UX-DR62, UX-DR67, UX-DR68 · **Jira:** NG-9022

---

### Story 2.3: SSN entry and Reveal

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
**When** 30 s pass, I press "Hide", the window loses focus (`blur`), `document.visibilityState` becomes `hidden`, `pagehide` fires, the Section saves or cancels, the component unmounts, or the shell publishes `session-changed`
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
**Then** the proxy allowlist entry for `GET /v2/person/{personId}/ssn/expose` is added in this change (method + path template + allowed query; server-forced params): `{personId}` accepts only the literal `me`, which the proxy substitutes with the session's `personId` (any other value, including the user's own numeric id → 403 `NOT_ALLOWED`); no query params allowed (any → 400 `BAD_QUERY`); not an `asImage` entry, so `X-PP-Session` is required; no server-forced params
**And** proxy tests cover `me`, a numeric id, an extra query param and a missing `X-PP-Session`.

**Given** drafts and logging
**When** the Section is dirty or the session expires
**Then** the SSN is never written to a draft (not in `draftFields`), and the server/proxy logs of `ssn/expose` and `user/edit` contain only method, path template, status, duration and request id (AD-15). A proxy test asserts that the `ssn/expose` response carries `Cache-Control: private, no-store, max-age=0`.

**Covers:** FR13, NFR1, NFR2, AD-2, AD-10, AD-17, AD-11, AD-12, AD-15, AD-18, AD-19 · UX-DR48, UX-DR29, UX-DR63, UX-DR64, UX-DR62, UX-DR68 · **Jira:** NG-9022

---

### Story 2.4: Signature

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
- `POST /v2/health/type/Person/{personId}/relation/PersonHasSignatureFile/file/upload` — `{personId}` accepts only `me` (substituted from the session); no client query params allowed (any other → 400 `BAD_QUERY`); `isPublic=false` forced server-side (a client-sent `isPublic` is ignored); upload entry with `maxBytes` 1 MB (larger → 413 `TOO_LARGE`), exactly one part named `file`, PNG leading bytes only (JPEG, BMP, SVG or HTML → 415 `UNSUPPORTED_MEDIA`);
- `POST /v2/file/{id}/version` — `{id}` matching `^\d{1,19}$`; `current=true` forced server-side (client value ignored, no other query allowed); upload entry with `maxBytes` 1 MB, exactly one part named `fileNewVersion`, PNG leading bytes only;
- `DELETE /v2/file/{id}` — `hardDelete=true` forced server-side and any client-sent `hardDelete` ignored; this is the entry Story 1.10 added for picture replacement, reused unchanged, and a proxy test in this change asserts that `?hardDelete=false` from the client still reaches upstream as `hardDelete=true`
**And** a unit test asserts the client's Signature request URLs carry no `isPublic`, `current` or `hardDelete` param.

**Given** a saved Signature and an empty pad
**When** I press Save (on the Section or via Save all)
**Then** the shared `components/ui/confirm-dialog.tsx` (Story 1.11) opens in its destructive variant: title "Remove your signature?", body "Documents you sign will no longer carry it.", buttons "Cancel" (secondary, initial focus) and "Remove signature" (destructive, `error-strong` fill)
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

**Covers:** FR14, NFR1, NFR2, AD-2, AD-7, AD-12, AD-13, AD-17, AD-18, RC7, RC11 · UX-DR4, UX-DR36, UX-DR47, UX-DR58, UX-DR61, UX-DR64, UX-DR65, UX-DR68 · **Jira:** NG-9022

## Epic 3: Contact methods — Phone, Email and Social Media

Users keep every way to reach them current, verify numbers and emails, switch their primary (sign-in) contact safely, and manage social links. These share the Contact Point engine (AD-9).

**Depends on:** Epic 1 only (session + `/api/1h` proxy with the `GET /v2/user/contact-point/list` entry, `fetchContactPoints` and the header SWR keys `["pp","contact-points","Phone"]` / `["pp","contact-points","Email"]` from Story 1.9, `callApi` + `ApiResponse.errorCode`, page shell + `#phone`/`#email`/`#social` anchors and index, `SectionRegistry`/`useRegisterSection`, Section edit model, `lib/shared/messages.ts`, `lib/api/errors.ts`, aria-disabled + Tooltip pattern, draft row removal (strikethrough + Restore), `components/ui/confirm-dialog.tsx` (Story 1.11), toasts (Story 1.12), Save all with `SAVE_ORDER` email → phone → social, drafts). Each Epic 3 story adds the Contact Point allowlist entries it uses: Story 3.1 `GET /v2/type/key/ContactPoint` (and reuses the list entry), Story 3.2 `POST /v2/health/contact-point`, Story 3.3 `POST /v2/health/contact-point/verify`. Stories in this epic depend only on earlier stories in this epic.

**Copy rule for every story:** every user-facing string is a key in `lib/shared/messages.ts`. Strings quoted from EXPERIENCE.md Voice and Tone are verbatim. Strings marked *(draft copy)* are not in EXPERIENCE.md and are flagged in `messages.ts` with a `// draft copy: PM review` comment (UX-DR68).

---

### Story 3.1: Contact Point engine and Phone read view

As a patient or provider,
I want to see all my phone numbers with their label, type, verification and notification status, with my primary number first,
So that I can check at a glance how 1health reaches me and which number I sign in with.

**Acceptance Criteria:**

**Given** the Contact Point API module `lib/api/contact-points.ts` and its `fetchContactPoints(types)` from Story 1.9
**When** the Contact Point Sections read their lists
**Then** Phone uses `fetchContactPoints(["Mobile","Landline"])`, Email `fetchContactPoints(["Email"])` and Social `fetchContactPoints(["Social Media"])`, each one `callApi` `GET /api/1h/v2/user/contact-point/list` with repeated `type` params, returning typed rows `{id, value, type, label, isVerified, isNotificationEnabled, phoneNumberRegion}` with `id` as a number
**And** SWR keys come only from `lib/api/keys.ts`: Phone and Email reuse exactly the Story 1.9 keys `["pp","contact-points","Phone"]` and `["pp","contact-points","Email"]` (so every later `mutate` after a save or Primary change also refreshes the profile header), and this story adds `keys.contactPoints("Social")` = `["pp","contact-points","Social"]`; all use the shared `callApi` fetcher (AD-10)
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
**Then** Number shows the country flag (decorative, `aria-hidden`) followed by the number in `cell-number` type; US numbers render as `+1 (415) 551-2125`, other countries in libphonenumber-js international format, using `phoneNumberRegion` when present
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
**Then** a single row spanning all columns reads "No phones yet · Add phone", where "Add phone" is a link-styled action (it opens edit mode with one new row once Story 3.2 lands)

**Given** the list request fails (network, 5xx, or unknown error code)
**When** the Section renders
**Then** an inline error banner replaces the rows: "Couldn't load phones · Retry"; Retry re-fetches only the Phone key
**And** Email, Social media and every other Section load and work normally (NFR5)
**And** a `SESSION_EXPIRED`/`SESSION_CHANGED` result is left to the Epic 1 session-events handler (no Section-level banner)

**Given** the engine and Phone read view
**When** CI runs
**Then** Vitest covers `diffToManageDTO` (add, update label, update notifications, remove, Primary switch, empty diff, immutable-value guard), `newUnverified` (Home, Landline, Social, already-verified, pre-existing), the label intersection, and the read view (Primary first, "—" on non-Primary notifications, no status on Home, empty and error states) with MSW at the `/api` boundary

**Covers:** FR15, AD-2, AD-9, AD-10, AD-19, NFR4, NFR5, NFR10, UX-DR7, UX-DR8, UX-DR21, UX-DR25, UX-DR26, UX-DR30, UX-DR33, UX-DR34, UX-DR35, UX-DR49, UX-DR62, UX-DR64, UX-DR67 · **Jira:** NG-9023

---

### Story 3.2: Add, relabel and remove phones

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
**Then** the proxy allowlist entry for `POST /v2/health/contact-point` is added in this change (method + path template + allowed query; server-forced params): no query params allowed, JSON body (`ContactPointManageDTO`) only (`Content-Type` other than `application/json` → 415 `UNSUPPORTED_MEDIA`), CSRF and `X-PP-Session` required, no server-forced params; a proxy test covers it (AD-2).

**Given** valid edits
**When** the user activates Save (or Save all reaches Phone)
**Then** `save()` builds the DTO with `diffToManageDTO`, sending new numbers as E.164 `value` with `phoneNumberRegion` = the picked country's ISO code and `type` `Mobile` or `Landline`, in exactly one `POST /api/1h/v2/health/contact-point`
**And** while saving, Save shows a spinner + "Saving…", inputs are read-only, Cancel is disabled, other Sections stay usable
**And** on success the Section mutates its Phone key `["pp","contact-points","Phone"]` (and `["pp","myself"]`), returns to read view, shows toast "Phone saved.", moves focus to the Phone `h2`, clears its draft, and `save()` resolves `{ok: true}`
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

**Covers:** FR16, FR4, FR7, AD-2, AD-7, AD-9, AD-11, NFR2, UX-DR20, UX-DR22, UX-DR26, UX-DR27, UX-DR28, UX-DR29, UX-DR30, UX-DR49, UX-DR54, UX-DR55, UX-DR56, UX-DR57, UX-DR61 · **Jira:** NG-9023

---

### Story 3.3: Verify phones

As a patient or provider,
I want new mobile numbers to get a verification link automatically and to resend it when needed,
So that my numbers become Verified and can be used for sign-in and notifications.

**Acceptance Criteria:**

**Given** `verifyContactPoints(ids)` added to `lib/api/contact-points.ts` in this story
**When** it is called
**Then** it sends `POST /api/1h/v2/health/contact-point/verify` `{contactPointIds: ids}` through `callApi` and returns `ApiResponse<{success, contactPointIdsWithSendError: number[]}>`; it sends nothing for an empty list
**And** the proxy allowlist entry for `POST /v2/health/contact-point/verify` is added in this change (method + path template + allowed query; server-forced params): no query params allowed, JSON body `{contactPointIds: number[]}` only (`Content-Type` other than `application/json` → 415 `UNSUPPORTED_MEDIA`), CSRF and `X-PP-Session` required, no server-forced params; a proxy test covers it (AD-2).

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
**And** on success the Phone key `["pp","contact-points","Phone"]` and `["pp","myself"]` are mutated, the new Primary moves to the first row with the Primary chip and Notifications "On", the old row reads "Old", toast "Phone saved." shows, and focus returns to the Phone `h2`
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

**Covers:** FR18, FR19, AD-9, UX-DR25, UX-DR27, UX-DR28, UX-DR36, UX-DR44, UX-DR52, UX-DR55, UX-DR61 · **Jira:** NG-9023

---

### Story 3.5: View, add, relabel and remove emails

As a patient or provider,
I want to see my email addresses and add, relabel or remove them in one edit of the Email table,
So that my emails on file are current.

**Acceptance Criteria:**

**Given** the Contacts tab loads
**When** the Email Section (`features/email`, `h2` "Email", anchor `#email`) fetches `fetchContactPoints(["Email"])` under the Story 1.9 key `["pp","contact-points","Email"]`
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
**And** on success: Email key `["pp","contact-points","Email"]` and `["pp","myself"]` mutated (the header's primary email refreshes), read view, toast "Email saved.", focus to the Email `h2`, draft cleared, `{ok: true}`
**And** known `errorCode`s map via `lib/api/errors.ts` to the field or Section; unknown → generic Section error with "Retry"; network → "Couldn't save email. Check your connection." + "Retry"; `save()` never throws

**Given** the story is done
**When** CI runs
**Then** tests cover `emailSchema` (invalid, case-insensitive duplicate incl. struck rows), locked-row copy for Primary vs others, last-email Remove disabled, limit 20, Home rows without status, "—" notifications on non-Primary, and the save DTO

**Covers:** FR20, FR4, FR7, AD-7, AD-9, AD-11, NFR5, UX-DR21, UX-DR22, UX-DR25, UX-DR26, UX-DR28, UX-DR29, UX-DR33, UX-DR34, UX-DR35, UX-DR49, UX-DR54, UX-DR55, UX-DR56, UX-DR67 · **Jira:** NG-9024

---

### Story 3.6: Verify emails, make an email primary and manage notifications

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
**When** its value passes `safeHref()` (protocol `https:`)
**Then** it renders as an anchor in link-text color with `target="_blank"` and `rel="noopener noreferrer"`, opening in a new tab (AD-11)
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

**Covers:** FR24, AD-9, AD-11, NFR1, NFR5, UX-DR2, UX-DR20, UX-DR21, UX-DR22, UX-DR28, UX-DR33, UX-DR34, UX-DR35, UX-DR49, UX-DR54, UX-DR55, UX-DR56, UX-DR67 · **Jira:** NG-9025

## Epic 4: Addresses

Users keep their addresses current, using address suggestions, with exactly one primary.

### Story 4.1: View addresses

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
**Then** the registry writes a draft under `pp:draft:v1:<userId>:addresses` containing only the declared `draftFields` (the address rows), restorable per Epic 1 draft rules.

**Given** a "Set as primary" checkbox in an expanded row
**When** it renders
**Then** it is present and its value is sent as `primary` on Section save (exclusivity and auto-Primary rules are delivered in Story 4.4).

**Given** the Section is implemented
**When** CI runs
**Then** Vitest tests cover schema (required fields, US ZIP, duplicate key), diff (only changed rows, `"n/a"` for cleared optionals, `validated` reset on manual change), country ordering (US/CA/AU pinned, "n/a" dropped) and `save()` partial-failure rebase.

**Covers:** FR26, FR4, FR7, NFR10, AD-2, AD-7, AD-8, AD-10, AD-11, AD-12, AD-15, UX-DR20, UX-DR22, UX-DR23, UX-DR29, UX-DR44, UX-DR56, UX-DR57, UX-DR61, UX-DR67, UX-DR68 · **Jira:** NG-9026

### Story 4.3: Address suggestions via server

As a patient or provider in the US, Canada or Australia,
I want address line 1 to suggest complete addresses as I type,
So that I can fill an address quickly and have it marked Verified.

**Acceptance Criteria:**

**Given** the server is deployed
**When** `app/api/places/autocomplete/route.ts` and `app/api/places/details/route.ts` are added
**Then** both accept only `POST` with `Content-Type: application/json` (other methods 405, other content types 415 `{"code":"UNSUPPORTED_MEDIA"}`), export `dynamic = "force-dynamic"`, call `requireSession()` (no session → 401) and pass the AD-17 checks (`Sec-Fetch-Site: same-origin` or `Origin = APP_ORIGIN`, plus `X-PP-Session`; else 403 `CSRF`; `X-PP-Session` ≠ `HMAC-SHA256(SESSION_SECRET, sid)` via `lib/server/session-binding.ts` from Story 1.3 → 409 `SESSION_CHANGED`)
**And** every response carries `Cache-Control: private, no-store, max-age=0`, `Pragma: no-cache`, `Vary: Cookie`, and every Google fetch uses `cache: "no-store"`.

**Given** a call to `/api/places/autocomplete` with `{input, countryCode}`
**When** it is handled
**Then** `input` longer than 120 chars or empty → 400; `countryCode` not one of US/CA/AU → `{enabled:true, suggestions:[]}` without calling Google
**And** otherwise the server calls Google Places (New) autocomplete with `GOOGLE_PLACES_KEY` (read only via `lib/server/env.ts`), region codes fixed server-side to US/CA/AU, and a server-generated Places session token bound to the cookie `sid`
**And** it returns `{enabled:true, suggestions:[{placeId, mainText, secondaryText, matches}]}` (max 5).

**Given** a call to `/api/places/details` with `{placeId}`
**When** it is handled
**Then** `placeId` not matching `^[A-Za-z0-9_-]{10,300}$` → 400
**And** otherwise the server calls Place Details with the server-constant field mask (address components + formatted address only), closes the Places session token, and returns normalized `{addressLine1, cityName, county, stateName, postalCode, countryCode, country, fullAddress, complete}` where `complete` is true only when street number + route, city, postal code and country are all present.

**Given** `PLACES_ENABLED` is not `1` for the deployment
**When** either route is called
**Then** it returns `200 {enabled:false, suggestions:[]}` (details: `{enabled:false}`) without calling Google
**And** the client shows no suggestions listbox and hides the help line, while manual entry and Save still work.

**Given** `PP_DISABLED=1` on the deployment (AD-20 kill switch)
**When** either `/api/places/*` route is called
**Then** it answers `503 {"code":"SERVICE_DISABLED"}` with the AD-18 no-store headers before any session, CSRF or Google work, and makes no Google call
**And** a Vitest covers both routes with the flag on and off.

**Given** Google errors, times out or the quota cap is hit
**When** the route handles it
**Then** it returns `{enabled:true, suggestions:[]}` (or 502 for details) and the client silently falls back to manual entry with no error banner.

**Given** any request to these routes
**When** the server logs it
**Then** only method, route template, status, duration and request id are logged; the typed text, `placeId` and returned address are never logged (no exception in `APP_ENV=dev`)
**And** no Google script, key or Places URL is ever sent to the browser; CSP `connect-src 'self'` and `script-src` stay unchanged.

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
**Then** tests cover: 401 without session, 403 `CSRF`, 415 for a non-JSON content type, 503 with `PP_DISABLED=1`, 400 for input > 120 chars and bad `placeId`, `PLACES_ENABLED` off → empty without upstream call, cache headers, no typed text in logs, and client fill/`validated` behaviour with MSW.

**Covers:** FR26, NFR1, NFR12, AD-3, AD-14, AD-15, AD-17, AD-18, AD-20 (kill switch), AD-21, UX-DR23, UX-DR29, UX-DR32, UX-DR57, UX-DR62, UX-DR68 · **Jira:** NG-9026

### Story 4.4: Primary address and removal

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
**And** that download is an `asImage` allowlist entry: served inline only for declared `image/png|jpeg|bmp` with matching magic bytes, otherwise `Content-Disposition: attachment`; always `X-Content-Type-Options: nosniff` and `Cache-Control: private, no-store, max-age=0`; the image is never fetched without the session cookie
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

**Covers:** FR28, FR31, NFR1, NFR5, AD-2, AD-7, AD-10, AD-13, AD-18, UX-DR10, UX-DR25, UX-DR33, UX-DR34, UX-DR35, UX-DR43, UX-DR45, UX-DR62, UX-DR67 · **Jira:** NG-9029

### Story 5.2: Add and edit a policy

As a patient,
I want to add a new insurance policy or correct an existing one in a focused editor,
So that my coverage details, including who holds the policy, are right on file.

**Acceptance Criteria:**

**Given** the Insurance tab
**When** the user activates "Add insurance" (header or empty state) or a non-Deleted card's kebab "Edit"
**Then** on desktop a shadcn Sheet opens from the right, 480 px wide, full height over a graphite 45 % scrim, with a sticky header (title "Add insurance" or "Edit insurance" (draft copy) + close button), a scrolling body and a sticky footer with "Cancel" (secondary) + "Save" (primary)
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
**When** the user activates close, Cancel, Escape, the scrim or mobile Back (the editor calls `requestLeave({ scope: "insurance" })`), or a tab switch or app-bar "Return to 1health" (page-level guard)
**Then** the Story 1.13 leave guard opens: "You have unsaved changes" with "Keep editing" (initial focus) / "Discard" / "Save"
**And** "Keep editing" keeps the editor open with the edits
**And** "Discard" drops the edits, closes the editor, returns focus to the trigger and completes any pending navigation
**And** "Save" calls the editor's own `validate()` then `save()`: if invalid, nothing is sent, the guard closes, the editor stays open and focus moves to the first invalid field; on `{ok:true}` the editor closes, toast "Insurance saved." appears and any pending navigation completes; on `{ok:false}` the editor stays open with its error and Retry and the navigation is cancelled
**And** with no changes, the editor closes immediately and focus returns to the trigger
**And** nothing from the editor is written to `localStorage`.

**Given** the editor is implemented
**When** CI runs
**Then** tests cover schema rules (member/group length, date ordering, subscriber requirement, own-email rejection, age 18–120), DTO enum mapping incl. DRUG, insurer "Add “{name}”" path, leave guard on dirty close (Keep editing, Discard, and Save calling the editor's own `save()` with success, invalid and failure outcomes), and keyboard-only completion.

**Covers:** FR29, FR6, FR8, NFR2, NFR10, AD-2, AD-7, AD-10, AD-11, AD-15, UX-DR29, UX-DR42, UX-DR44, UX-DR46, UX-DR56, UX-DR57, UX-DR61, UX-DR62, UX-DR66, UX-DR67, UX-DR68 · **Jira:** NG-9029

### Story 5.3: Card image upload with retry

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
**And** the two proxy allowlist upload entries are added in this change (method + path template + allowed query; server-forced params): `{id}` matching `^\d{1,19}$`, no client query params allowed, `isPublic=false` forced server-side whatever the client sends, `maxBytes` 4 MB (413 `TOO_LARGE`), one part named `file`, PNG/JPEG magic bytes only (415 `UNSUPPORTED_MEDIA`)
**And** on success the card shows the new thumbnail and toast "Insurance saved." appears.

**Given** the policy saved but an image upload fails
**When** the save flow ends
**Then** the policy stays saved, the drawer closes, the card shows that side as a dashed placeholder "Image not uploaded" with a "Retry upload" link, and a warning toast names the problem (e.g. "Insurance saved. Back image not uploaded." — draft copy)
**And** the re-encoded image is kept only in memory (never in storage) keyed by policy id + side.

**Given** a "Retry upload" link
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

As a patient,
I want to delete an insurance policy I no longer have, after confirming,
So that outdated coverage doesn't stay on my profile.

**Acceptance Criteria:**

**Given** a non-Deleted policy card
**When** the user opens its kebab
**Then** it lists "Edit" and "Delete" ("Delete" in error-strong text).

**Given** the user activates "Delete"
**When** the shared `components/ui/confirm-dialog.tsx` (Story 1.11) opens in its destructive variant
**Then** it shows title "Delete this insurance policy?", body "{Insurer} {Type} Insurance will be removed from your profile.", and right-aligned "Cancel" (secondary) + "Delete policy" (destructive fill `bg-error-strong`, white text)
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
