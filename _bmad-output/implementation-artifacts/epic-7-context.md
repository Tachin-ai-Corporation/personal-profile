# Epic 7 Context: Account page and personal account settings

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Add a second page, `/account`, that users reach from an app-bar "Account" item or a bookmark. It has three deep-linkable tabs: Personal Account, Individual Provider Registration and My Organizations. Users can keep their name, birth date, sign-in email and phone, language, time zone and locale correct there. When a save only partly succeeds, the page names each part that wasn't saved. The epic also lays the `/account` foundation that Epics 8–10 build on: the route, typed tabs, shell `navigate()`, per-tab loading, error and 403 states, test rows verifying the Story 1.3 proxy deny list against Profile templates, the page/route-level `ACCOUNT_DISABLED` kill switch, and the session-less `/handoff/portal` route.

**Launch and environment decisions (2026-10-14, D1–D4 in `epics.md`, override the spine):** the launch entry is `/auth?lpl=…` → `POST /api/token` → `/` (no `/launch*` routes, no `/launch-error`, no `proxy.ts` `lpl` redirect). Only `demo` and `prod` exist, and one deployment serves both. `/api/token` picks the environment by whichever of `ONEHEALTH_SECRET_KEY_PROD` / `ONEHEALTH_SECRET_KEY_DEMO` decrypts the payload, and seals it in `__Host-pp_s`. API roots and portal URLs are constants in `lib/shared/environments.ts`. There is no `APP_ENV`, `API_ORIGIN`, `APP_ORIGIN`, `PORTAL_URL`, `PUBLIC_FILES_ORIGIN` or `NEXT_PUBLIC_APP_ENV`. Logout also revokes on the platform (`POST <apiRoot>/auth/user/logout/all-devices`, best effort).

**Decisions D5–D9 (2026-10-14, modeled on `patient-vault-official`):** there are no CSRF or session-binding checks: no `Sec-Fetch-Site`/`Origin` check, no `sessionBinding`, no `X-PP-Session`, no `CSRF` or `SESSION_CHANGED` code, and no session-changed dialog. The 415 JSON content-type check stays, and logout also accepts GET (D5). `callApi` gets the dev-only `logApiCall` console logger, and server logs never contain bodies (D6). The org-logo route and CSP `img-src 'self' blob: data:` stay (D7). There is no blocked-cookie screen (D8). `/auth` follows the patient-vault launch UX: up to five attempts 1.5 s apart, manual LPL entry, a hard redirect to `consumeLoginIntent("/")`, and an error alert (D9).

**Sequencing:** Epic 1 (the foundation) is not implemented yet, and the team chose to build Epic 7 first anyway. Each Epic 7 story therefore builds the minimal Epic 1 pieces it needs. The "Epic 1 foundation required" section below lists them.

## Stories

- Story 7.1: Account page — route, tabs, deep links and states
- Story 7.2: Account page hardening — denies, kill switch, headers, mobile and accessibility
- Story 7.3: Portal hand-off route
- Story 7.4: View Personal account settings
- Story 7.5: Edit names, birth date and regional preferences
- Story 7.6: Switch Primary email and phone

## Requirements & Constraints

**Entry and navigation**
- `/account?tab=personal|provider|organizations` is reached only from inside the app or by a direct URL when a session already exists.
  - A launch always lands on `/`, never on `/account`.
  - With no session, the page redirects to `/auth`, which shows the no-LPL screen (the D9 manual-entry card). There is no login form.
- A missing or unknown `tab` opens Personal Account, and the URL is normalized with a replace.
- Changing tabs also uses a replace and drops the hash.
- Hash anchors `#account` and `#authenticator` scroll to their Section and focus its `h2`. Any other hash leaves the page at the top.
- No 1health-fe change is made. The app runs top-level only and is never framed.

**Page states**
- Each tab and Section loads its own data only when it is opened. `/` and `/account` share one cache, so switching pages never refetches fresh data.
- A non-403 failure shows "Something went wrong while loading profile information" with a Retry button, scoped to the tab or Section that failed. It never shows an empty form.
- An upstream 403 shows "You don't have access to this in your current account" with no action. Its scope follows the 403 owner table.
- Errors that the proxy itself returns (`NOT_ALLOWED`; there is no `CSRF`, D5) are never shown as "no access".
- A failure in one tab or card never blocks the others.

**Account settings**
- **Read view:**
  - The fields appear in this order: First name, Last name, Username, Password, Primary email address, Primary phone number, Birth date, Preferred language, Default time zone, Preferred locale for date, time, and currency.
  - Password always shows `********`.
  - Birth date displays as `MM/DD/YYYY`.
  - Phone numbers use the Contacts display format.
  - Empty, `"n/a"`, withheld or out-of-range values show "Not provided", except locale, which defaults to "English - United States".
- **Edit rules:**
  - Names are 1–24 characters after trimming.
  - Birth date must be a valid date and give an age of 18–120, or 21–120 when `myself.roles` includes Proctor.
  - Username and Password are locked controls and are never sent.
- **Regional options are constants:**
  - Language: `en`.
  - Time zone, six values in this order: `Pacific/Honolulu`, `America/Anchorage`, `America/Los_Angeles`, `America/Denver`, `America/Chicago`, `America/New_York`.
  - Locale: `en-US`.
  - A stored value that isn't on the list stays selected and is sent only if the user changes it.
- **Primary pickers:**
  - Email options are Verified Email Contact Points. Phone options are Verified Mobile **and Landline** Contact Points.
  - The current Primary is always the selected value and never counts as an option.
  - When there is no other option, the Select is aria-disabled and shows a helper with an in-app link to `/?tab=contacts#email` (or `#phone`).
  - The first time a Select changes, an info notice appears under it. There is no confirm dialog.
- **Save behavior:**
  - With no changes, Save shows "There are no changes".
  - Otherwise only changed fields are sent.
  - On full success, a toast appears and the Section returns to read view.
  - On a partial failure the Section stays in edit view and shows one "{Part} was not saved. {platform message}" line per failed part. The parts that succeeded become the new baseline, so the next Save re-sends only the parts that failed. An email that already saved is never re-sent.
- **Copy:** all copy is verbatim and English only, and comes from `lib/shared/messages.ts`. A verbatim test enforces it.
- **Quality bar:**
  - WCAG 2.1 AA, checked by axe in light and dark, at desktop size and at 360 px.
  - 44 px minimum targets.
  - No horizontal scroll at 360 × 740.
  - Each tab's first content renders within 1.5 s.

## Technical Decisions

- **Page:** `app/account/page.tsx` is a server component.
  - It calls `requireSession()` itself.
  - It embeds `portalUrl` for the session's environment, like `/`. There is no `sessionBinding` and no `X-PP-Session` header (D5).
  - It exports `dynamic = "force-dynamic"`.
  - It renders `features/account/account-page.tsx` inside the single root `SWRConfig` in `app/layout.tsx`.
- **Navigation:** `features/shell/navigate.ts#navigate(target)` handles every cross-page and external move.
  - It first runs the page's leave guard.
  - Moves between `/` and `/account` use `router.push`.
  - `external:"portal"` purges drafts, logs out, then calls `location.assign(portalUrl)`. `portalUrl` is embedded by the server for the session's environment (D4).
  - `external:"handoff"` calls `location.assign(href)` only: no logout, and drafts are kept.
  - `ProfileTab` and `AccountTab` are exported typed enums.
  - Lint bans `next/link` and raw `<a href>` that target `/`, `/account`, `/handoff/**` or a `portalUrl` from `lib/shared/environments.ts` outside `features/shell`.
- **Registry:** each page mounts its own `SectionRegistry`. On `/account` the only registry Section is `account` (`displayOrder` 1). Authenticator is an anchor, not a Section. `/account` has no Save all.
- **Proxy:** all 1health traffic goes through `/api/1h/<path>`, which applies the allowlist.
  - The exact `METHOD + template` deny list is owned by Story 1.3 (built in spec 7.0a); Story 7.2 only verifies it against the Profile templates. Prefix matching applies only to `/**` patterns.
    - `* /auth/**` and `* v2/public/external-application/**`
    - the admin prefixes
    - `POST v2/mfa/enable` and `POST v2/mfa/disable`
    - `* v2/mfa/{enable,disable,validate}/<n>`
    - `* v2/user/switch-tenant/**`
    - `* v2/user/update-password`
    - `* v2/tenant/sys-config`
  - The `profile: true` entry tag is also owned by Story 1.3. Each passthrough entry is added in the story that first uses it:
    - Story 7.5 adds `POST v2/user/time-zone` (the six ids) and `POST v2/user/locale` (`en-US` only), both tagged `profile: true`, and makes `PUT v2/user/edit` reject a `locale` field.
    - Story 7.6 makes `PUT v2/user/edit` accept `email`, `phoneNumber` and `phoneNumberRegion` (`phoneNumberRegion` only together with `phoneNumber`).
- **Kill switch:** with `ACCOUNT_DISABLED=1`, the app returns 503 `{errorCode:"SERVICE_DISABLED", source:"proxy"}` before any upstream call for:
  - `/account`
  - `/handoff/**`
  - `/api/pp/{mfa,org-logo,practice-support}/**`
  - every allowlist entry tagged `profile: true` (proxy-level part, owned by Story 1.3; the page/route part above is Story 7.2)

  `/` and the Contacts endpoints keep working. The check is central, so routes added later get it automatically.
- **Hand-off:** `GET /handoff/portal?to=tenant&tenantId=<^\d{1,19}$>|to=create-org` answers `seeOther()` (a 303 with an absolute `Location`).
  - The tenant URL shape sits behind the `TENANT_HANDOFF_SHAPE` constant in `lib/server/handoff.ts`. The default is `"root"`, which returns `portalUrl`. The alternative `"ctx"` returns `<portalUrl>/?ctx=<n>`.
  - `portalUrl` comes from `lib/shared/environments.ts`. The environment is taken from the session if it unseals, else from the `onehealth_environment` cookie, else `prod`. It never comes from a URL parameter, and there is no `PORTAL_URL` env var (D4).
  - Any invalid input gets a 303 to the resolved `portalUrl`. Other methods get a 405.
  - The route needs no session, has no side effects, never builds a URL from response data, and never logs the query string.
  - The client helper is `features/shell/handoff.ts#handoffHref()`.
  - Nothing may reference `v2/user/switch-tenant` (a CI grep checks this).
- **Data:**
  - SWR keys:
    - `keys.myself()` = `["pp","myself"]`
    - `keys.contactPoints(type)` = `["pp","contact-points",type]`, one key per type (`Email`, `Mobile`, `Landline`), shared with Contacts and the header
  - `lib/api/myself.ts` maps the `myself` fields this epic needs (`firstName`, `lastName`, `username`, `email`, `phoneNumber`, `phoneNumberRegion`, `birthDate`, `roles`, `preferredLanguage`, `timeZone`, `locale`).
  - `features/account/view-model.ts#toAccountView()` builds the read view.
- **Shared rules:**
  - `lib/shared/person-rules.ts` holds the name and age rules and is the only place they live. It exports `birthDateAgeRange(roles)` and `isBirthDateInRange()`.
  - `lib/shared/time-zones.ts` holds the six time zones.
  - `lib/shared/` provides `formatPhoneDisplay(value, region)` (libphonenumber-js).
  - `features/account/schema.ts` (zod 4, one `useForm` with `zodResolver`) imports these rules and never redefines them.
- **Save sequence** (`save()` never throws):
  1. `updateAccount(diff)` in `lib/api/account.ts` sends `PUT v2/user/edit` with the dirty fields among `firstName`, `lastName`, `birthDate`, `preferredLanguage`, plus the primaries.
  2. `setTimeZone` sends `POST v2/user/time-zone?timeZone=`, if dirty.
  3. `setLocale` sends `POST v2/user/locale?locale=en-US`, if dirty.

  Steps 2 and 3 always run, whatever the earlier results. `SESSION_EXPIRED` stops the sequence (there is no `SESSION_CHANGED`, D5).
  - Result shape: `{ ok:false, error:{ failedParts:("details"|"timeZone"|"locale")[] } }`.
  - On success, mutate `myself` and `contactPoints("Email"|"Mobile"|"Landline")`.
  - A non-GET is replayed only after a `TOKEN_EXPIRED` that the proxy returned, never after a 5xx or a timeout.
- **Primary fields:** `updateAccount()` is the only code that builds `email`, `phoneNumber` and `phoneNumberRegion`.
  - It sends them only when they changed, and only values from the current Verified lists.
  - Lint (`no-restricted-imports`) allows imports of it only from `features/account`.
  - The Personal-information payload type leaves out these fields.
- **Errors:** the BFF error body is `{errorCode, source:"proxy"}`. Upstream errors pass through as `{message, code:int}`, and `code` becomes `upstreamCode`.
  - `FORBIDDEN` means a 403 without `source:"proxy"`.
  - `lib/api/errors.ts` owns all mapping. For action errors it shows the platform `message` when one exists, otherwise the generic error.
  - `features/account/forbidden-scope.ts` encodes the 403 owner table:

    | 403 on | What shows no access |
    | --- | --- |
    | `contact-point/list` | the Account email/phone pickers only |
    | `mfa/*` | the Authenticator card |
    | `user/npi`, `public/npi/list`, `user/register/npi` | the Provider tab |
    | `user/organization/portal` | the Organizations tab |
    | `practice-support` | the Practice-name popover only |
- **Drafts:**
  - Key: `pp:draft:v1:<userId>:account`.
  - `draftFields` are `firstName`, `lastName`, `birthDate`, `preferredLanguage`, `timeZone`, `locale`, plus `primaryEmail` and `primaryPhone` (added in Story 7.6).
  - `baseHash` is a hash of the server values of exactly those fields.
  - A draft never contains the username, password, MFA data or NPI data.
- **Headers:** `/account` and `/handoff/portal` get the full header set, including on redirect and 503 responses:
  - CSP with a nonce and `frame-ancestors 'none'`
  - `X-Frame-Options: DENY`
  - `Cross-Origin-Opener-Policy: same-origin`
  - HSTS
  - `nosniff`
  - `Referrer-Policy: no-referrer`
  - `Permissions-Policy`
  - `Cache-Control: private, no-store, max-age=0`, `Pragma: no-cache`, `Vary: Cookie`
- **Tests:** Vitest, Testing Library and MSW at the `/api` boundary for units and components. Playwright runs against a mocked proxy, with a desktop project and a 360 px project, and covers parity rows 1–6 and 13 for this epic. Axe runs through `@axe-core/playwright`.

## Epic 1 foundation required (build minimally inside Epic 7)

| Epic 1 piece (story · AD) | Minimum Epic 7 needs | First needed by |
| --- | --- | --- |
| **1.1 Foundation** · AD-3, AD-5, AD-20, AD-21, AD-26 lint, AD-4 lint, AD-1 legacy removal | `lib/server/env.ts` (server-only, sole `process.env` reader apart from the shared app-env helper `lib/shared/app-env.ts`, D6) with `ONEHEALTH_SECRET_KEY_DEMO|PROD`, `APP_ID_DEMO|PROD`, `SESSION_SECRET` (≥ 32 chars), optional `SESSION_SECRET_PREVIOUS`, `PP_DISABLED`, `ACCOUNT_DISABLED`; `lib/shared/environments.ts` (API root, portal URL and public-files origin per environment, D4); `proxy.ts` that sets the nonce CSP and the AD-21 headers; ESLint rules for the navigation ban and the `NextResponse.redirect` ban; Vitest, MSW and Playwright set up with desktop and mobile projects. Removing the legacy auth (`lib/auth-client.ts` and the legacy `app/auth` and `app/api/token`) is needed once the sealed session replaces it; Story 1.2 rebuilds `/auth` and `/api/token` (D1). | 7.1 (lint, tests), 7.2 (headers), 7.3 (environment map) |
| **1.2 Launch** · AD-1, AD-6, D1, D2, D4 | The sealed `__Host-pp_s` cookie (with `environment`) and `requireSession()`; the no-session redirect to `/auth`; `/auth` + `POST /api/token`, with the module-neutral `WRONG_TENANT` copy and the `disabled` full-page message; the `onehealth_environment` cookie; the D9 `/auth` launch UX (client retry, manual LPL entry, login-intent redirect, error alert); `lib/server/http.ts#seeOther()` (for hand-offs) | 7.1, 7.3 |
| **1.3 Proxy** · AD-2, AD-17 (as superseded by D5), AD-18 | `app/api/1h/[...path]/route.ts`; `lib/server/proxy-allowlist.ts` with exact `METHOD + template` matching, query and body schemas, path normalization, and a table-test harness; the 415 JSON content-type check (no CSRF or `X-PP-Session` check, D5); no-store headers; `{errorCode, source:"proxy"}` bodies; entries `GET v2/user/myself`, `GET v2/user/contact-point/list` (type `Email\|Mobile\|Landline`) and `PUT v2/user/edit` | 7.2 (deny-list test rows only), 7.4, 7.5, 7.6 |
| **1.4 callApi + SWR** · AD-10, AD-19 | `callApi` that returns `ApiResponse` with `errorCode` and `upstreamCode`, publishes `lib/api/session-events.ts` and logs through the dev-only `logApiCall` (D6); `lib/api/keys.ts`; the root `SWRConfig` in `app/layout.tsx`; `fetchMyself()` and `useMyself` | 7.1, 7.4 |
| **1.5 Token refresh** · AD-16 | The `TOKEN_EXPIRED` → single refresh → replay-once path, with non-GETs replayed only after a proxy `TOKEN_EXPIRED`. Can be a thin version, but the replay rule must hold. | 7.5 |
| **1.7 Logout + session dialogs** · AD-16, AD-19, AD-12, D3 | `POST /api/session/logout`, also GET (best-effort platform `all-devices` logout, then always 204; D5); `navigate({external:"portal"})` that runs guard, `drafts.purgeUser`, logout, then assign; the session-expired dialog that subscribes to the session events (no session-changed dialog, D5) | 7.1, 7.5, 7.6 |
| **1.8 Page shell** · AD-7, AD-26 | An app bar with the wordmark (a non-interactive `span` in the `primary-text` token: no href, no click, no focus, not a tab stop), the "Pages" nav (Personal Profile and Account) and "Return to 1health"; the shadcn Tabs pattern with the `tab` tokens; `navigate()` page targets; the `ProfileTab` enum | 7.1 |
| **1.9 Header view** · AD-10 | The shared profile header component (name, picture, primaries) and per-type `keys.contactPoints(type)` with a row type that carries `phoneNumberRegion` | 7.1 (layout), 7.6 |
| **1.11 Section framework** · AD-7, AD-11 | `SectionRegistry` mounted per page; `useRegisterSection({id,label,displayOrder,form,validate,save,discard,draftFields})`; a `SectionId` that includes `account`; the edit-mode model and its primitives (`input-locked`, the footer with "Unsaved changes", Cancel and Save); a `save()` error shape that allows `failedParts` | 7.1, 7.5 |
| **1.12 Errors, messages, toasts** · AD-19, AD-11 | `lib/api/errors.ts` (`FORBIDDEN` mapping, the rule that proxy errors are generic, platform-message mapping, field mapping); `lib/shared/messages.ts` and the verbatim V&T test; toasts; a Retry pattern | 7.1, 7.5, 7.6 |
| **1.13 Leave guard** · AD-26 | The three-way dialog ("You have unsaved changes": Keep editing, Discard, Save) that `navigate()` invokes when the page registry is dirty, plus `beforeunload` for unloads the browser starts | 7.1, 7.3, 7.5 |
| **1.15 Drafts** · AD-12 | `pp:draft:v1:<userId>:<section>` storage with a 500 ms debounce and a write right before the session-expired dialog; `baseHash` conflict detection; the restore banner (Restore or Discard); `drafts.purgeUser(userId)` | 7.5, 7.6 |

**Not needed for Epic 7:**
- 1.6 Idle logoff. Its activity rules can wait.
- 1.10 Profile Picture.
- 1.14 Save all. `/account` must not mount one. Just keep the registry scoped to each page.
- 1.16 Deployments. For this epic it only adds the `ACCOUNT_DISABLED` Vercel env var and runbook steps. The portal URL and public-files origin are constants in `lib/shared/environments.ts`, not env vars (D4).

**Brownfield note:** the current template's `/` (`components/home-page-client.tsx`, `SettingsPage`) and the legacy cookie auth conflict with AD-1 and AD-2. Shell pieces that `/account` shares with `/` (the app bar and the header) can be built against `/account` first, then reused on `/` when Epic 1 lands.

## UX & Interaction Patterns

- **Frame at 768 px and above:**
  - The page stacks, top to bottom:
    - the app bar, with Account marked active through `app-nav-item-active` and `aria-current="page"`
    - the same profile header used on `/`
    - the tab strip
    - a single-column main area with 24 px padding
  - There is no Section menu, Jump to, or Save all.
- **Frame below 768 px:**
  - The page nav becomes a segmented control, which wraps under the wordmark below 400 px.
  - The tab strip scrolls inside itself and keeps the selected tab in view.
  - The header shows only the avatar and name.
  - Gutters are 16 px.
- **Page nav:** selecting the current page's item does nothing. Selecting the other item goes through the leave guard. "Return to 1health" always shows.
- **Tabs:** they follow ARIA tab semantics. Left and Right move focus and wrap, Home and End jump to the ends, and Enter or Space activates a tab (manual activation).
- **Keyboard order:** page nav → Return to 1health → header → tabs → tab content.
- **Skeletons** (`features/account/account-state-frame.tsx`):
  - 4 key/value rows
  - five 112 px tiles
  - two input-height bars
  - 12 card placeholders
  - The shimmer is static under reduced motion.
- **Read table:**
  - At 768 px and above it is four columns (key | value | key | value), filled row by row.
  - Below 768 px it shows one Field | Value pair per row.
  - Each key is a `th scope="row"`.
- **Edit view:**
  - The Section switches in place, with a primary border, a 3 px accent halo, and a muted "Editing" label.
  - Focus starts on First name.
  - Controls are capped at 480 px.
  - Birth date is a masked `MM/DD/YYYY` input with a calendar button. The picker range matches the age rule.
  - A "?" `info-icon-button` labelled "About birth date" opens a Tooltip, in edit view only. This story creates the reusable `components/ui/info-icon-button.tsx`.
  - Enter doesn't submit the Section, and Escape doesn't cancel.
  - On an invalid Save, focus moves to the first invalid field, which carries `aria-invalid` and `aria-describedby`.
- **Saving:**
  - While saving, the button shows a spinner and "Saving…", the inputs become read-only, and Cancel is disabled. A double click sends only once.
  - After a successful save, focus moves to the Section `h2`.
  - Cancel reverts without a confirm and returns focus to "Edit".
- **Styling:** use semantic tokens only, with the DESIGN.md Ledger overrides. No hex values or palette classes.

## Cross-Story Dependencies

- **Story order:** 7.1 → 7.2 → 7.3 → 7.4 → 7.5 → 7.6.
  - 7.2 depends only on 7.1.
  - 7.3 is independent of 7.4–7.6.
- **Created in Epic 7, reused later:**
  - 7.4 creates `lib/shared/time-zones.ts`, `lib/api/myself.ts` and `formatPhoneDisplay()`, and `person-rules.ts` if Story 2.2 hasn't already.
  - 7.5 reuses them and creates `info-icon-button`. Epics 9 and 10 reuse that component.
  - 7.6 extends the 7.5 save sequence and the draft fields.
- **Later epics building on Epic 7:**
  - Epics 8, 9 and 10 fill the Personal Account authenticator anchor and the provider and organizations placeholders, using the 7.1 state frame and 403 scopes.
  - They also add their own allowlist entries with the `profile: true` tag owned by Story 1.3.
  - Epic 10's "Enter portal" uses the 7.3 hand-off.
- **Shared with other Epics:**
  - `person-rules.ts` is shared with Epic 2 (Personal information).
  - The contact-point keys and `formatPhoneDisplay` are shared with Epic 3 (Contacts).
  - A Personal-information save on `/` invalidates the account draft through `baseHash`.
- **Open platform questions:**
  - Which portal URL opens a given tenant (OQ1, due 2026-10-17). It decides `TENANT_HANDOFF_SHAPE`, which stays `"root"` until it is answered.
  - Whether current tokens survive a login-email change through `PUT user/edit`. This must be verified on demo.
