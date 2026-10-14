# Epic 7 Context: Account page and personal account settings

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Add a second page, `/account`, reached from an app-bar "Account" item or a bookmark, with three deep-linkable tabs: Personal Account, Individual Provider Registration and My Organizations. Users keep their name, birth date, sign-in email and phone, language, time zone and locale correct there, and a partial save names each part that wasn't saved. The epic also lays the `/account` foundation that Epics 8–10 build on: the route, typed tabs, shell `navigate()`, per-tab loading, error and 403 states, test rows verifying the Story 1.3 deny list against Profile templates, the page/route-level `ACCOUNT_DISABLED` kill switch, and the session-less `/handoff/portal` route.

**Human decisions D1–D13 (2026-10-14) override the architecture spine wherever they differ:**
- **Launch (D1, D2, D9):** `/auth?lpl=…` → `POST /api/token` (body `{ lpl }` only) → `/`. There are no `/launch*` routes, no `/launch-error` and no `proxy.ts` `lpl` redirect. Only `demo` and `prod` exist, served by one deployment, and the environment is whichever secret key decrypts the payload. `/auth` follows the patient-vault UX (5 attempts 1.5 s apart, manual LPL entry, error Alert, hard redirect to `consumeLoginIntent("/")`). Amended 2026-10-14 (human): a launch always lands on `/` — the saved intent is used only when its pathname is `/` (e.g. `/?tab=insurance`); `/account…` intents fall back to `/`, so Story 7.1 holds. Spec 7.0b-1 (tokens, messages, `mapApiError`, `ConfirmDialog`, read states) is done; 7.0b-2 builds the shell navigation.
- **Environment (D4):** API roots, portal URLs and `publicFilesOrigin` are constants in `lib/shared/environments.ts`. There is no `APP_ENV`, `API_ORIGIN`, `APP_ORIGIN`, `PORTAL_URL` or `NEXT_PUBLIC_APP_ENV`. Session-less code resolves the environment from the session, then the `onehealth_environment` cookie, then `prod`, and never from a URL parameter.
- **Security and logout (D3, D5):** there is no CSRF, `Sec-Fetch-Site`/`Origin` check, `X-PP-Session`, `sessionBinding`, `CSRF` code, `SESSION_CHANGED` code or session-changed dialog. The 415 JSON check stays. Logout accepts POST and GET and first makes a best-effort platform `logout/all-devices` call.
- **Logging (D6):** the dev-only `logApiCall` in `callApi` logs redacted requests. Server logs never contain bodies.
- **Framing and wordmark (D10, D11):** the app runs in its own tab only and is never framed (`frame-ancestors 'none'`, `X-Frame-Options: DENY`, COOP `same-origin`). The "1health" wordmark is plain text: a `span` in `primary-text` that is never focusable.
- **Ownership (D12):** Story 1.3 owns the full deny list, the `profile: true` tag and the proxy-level `ACCOUNT_DISABLED` 503. Story 7.2 owns only the page/route-level kill switch and the Profile deny test rows.
- **Tokens (D13):** use `link-text`, `destructive-fill`, `primary-text` (#246b8f light, #6fb6d8 dark) and `scrim` (for every dialog and the drawer, replacing `bg-black/50`).

**Sequencing:** Epic 7 is being built before Epic 1, and each spec builds the minimal Epic 1 pieces Epic 7 needs:
- **Spec 7.0a is done:** Stories 1.1–1.5, plus the logout route and login intent from 1.7.
- **Spec 7.0b is next (the shell):** the 1.7 session-expired dialog, 1.8 (page shell, app bar, tabs and tokens), 1.9 (the header, if 7.1 needs it), 1.11 (the Section framework), 1.12 (errors, messages, toasts and Retry) and 1.13 (the leave guard).
- See "Epic 1 foundation required" below.

## Stories

- Story 7.1: Account page — route, tabs, deep links and states
- Story 7.2: Account page hardening — denies, kill switch, headers, mobile and accessibility
- Story 7.3: Portal hand-off route
- Story 7.4: View Personal account settings
- Story 7.5: Edit names, birth date and regional preferences
- Story 7.6: Switch Primary email and phone

## Requirements & Constraints

**Entry and navigation**
- Users reach `/account?tab=personal|provider|organizations` only from inside the app, or by a direct URL when a session already exists.
- A launch always lands on `/`, never on `/account`. `/account` ignores an `lpl` query parameter.
- With no session, the page redirects to `/auth`, which shows the D9 no-LPL screen (the manual-entry card, or the Choose Environment card). There is no login form.
- A missing or unknown `tab` opens Personal Account and normalizes the URL with a replace. Changing tabs also uses a replace and drops the hash.
- The hashes `#account` and `#authenticator` scroll to their Section and focus its `h2`. Any other hash leaves the page at the top.
- No 1health-fe change is made.

**Page states**
- Each tab and Section loads its own data only when it is opened. `/` and `/account` share one SWR cache, so switching pages never refetches fresh data.
- A non-403 failure shows "Something went wrong while loading profile information" with a Retry button, scoped to the tab or Section that failed. It never shows an empty form.
- An upstream 403 shows "You don't have access to this in your current account" with no action. Its scope follows the 403 owner table.
- A proxy-originated error (`NOT_ALLOWED`) is never shown as "no access".
- A failure in one tab or card never blocks the others.

**Account settings**
- **Read view:**
  - Field order: First name, Last name, Username, Password, Primary email address, Primary phone number, Birth date, Preferred language, Default time zone, Preferred locale for date, time, and currency.
  - Password always shows `********`.
  - Birth date displays as `MM/DD/YYYY`, and phone numbers use the Contacts display format.
  - Empty, `"n/a"`, withheld or out-of-range values show "Not provided". Locale is the exception: it defaults to "English - United States".
- **Edit rules:**
  - Names are 1–24 characters after trimming.
  - Birth date must be a valid date giving an age of 18–120, or 21–120 when `myself.roles` includes Proctor.
  - Username and Password are locked controls and are never sent.
- **Regional options are constants:**
  - Language: `en`.
  - Time zone, six values in this order: `Pacific/Honolulu`, `America/Anchorage`, `America/Los_Angeles`, `America/Denver`, `America/Chicago`, `America/New_York`.
  - Locale: `en-US`.
  - A stored value that isn't on the list stays selected and is sent only if the user changes it.
- **Primary pickers:**
  - Email options are Verified Email Contact Points. Phone options are Verified Mobile **and Landline** Contact Points.
  - The current Primary is always the selected value and is never counted as an option.
  - When there is no other option, the Select is aria-disabled and shows a helper with an in-app link to `/?tab=contacts#email` (or `#phone`).
  - The first time a Select changes, an info notice appears under it. There is no confirm dialog.
- **Save behavior:**
  - With no changes, Save shows "There are no changes". Otherwise only the changed fields are sent.
  - On full success, a toast appears and the Section returns to read view.
  - On a partial failure the Section stays in edit view and shows one "{Part} was not saved. {platform message}" line per failed part. The part labels are "Account details", "Time zone" and "Preferred locale".
  - The parts that succeeded become the new baseline, so the next Save re-sends only the failed parts. An email that already saved is never re-sent.
- **Copy:** all copy is verbatim English and comes from `lib/shared/messages.ts`, enforced by a verbatim test.
- **Quality bar:**
  - WCAG 2.1 AA, checked by axe in light and dark, at desktop size and at 360 px.
  - 44 px minimum targets.
  - No horizontal scroll at 360 × 740.
  - Each tab's first content renders within 1.5 s.

## Technical Decisions

- **Page:** `app/account/page.tsx` is a server component.
  - It calls `requirePageSession()` from `lib/server/page-session.ts`, as `app/page.tsx` does.
  - It passes `portalUrl` to the client through `PortalUrlProvider` / `usePortalUrl` from `features/shell`. There is no `sessionBinding`.
  - It exports `dynamic = "force-dynamic"`.
  - It renders `features/account/account-page.tsx` inside the single root `SWRConfig` (`features/shell/swr-provider.tsx`).
  - `proxy.ts` has no no-session redirect; each page enforces the session itself.
- **Navigation:** `features/shell/navigate.ts#navigate(target)` handles every cross-page and external move. It first runs the page's leave guard.
  - Moves between `/` and `/account` use `router.push`.
  - `external:"portal"` purges drafts, logs out, then calls `location.assign(portalUrl)`.
  - `external:"handoff"` only calls `location.assign(href)`: no logout, and drafts are kept.
  - `ProfileTab` (`contacts|insurance|medical`) and `AccountTab` (`personal|provider|organizations`) are exported typed enums.
  - The lint bans on `next/link` and on raw `href`s to `/`, `/account`, `/handoff/**` or a `portalUrl` outside `features/shell`, and the ban on `NextResponse.redirect` in `app/handoff/**`, **already exist (7.0a)**. Story 7.1 adds fixture tests for them.
- **Registry:** each page mounts its own `SectionRegistry`.
  - On `/account` the only registry Section is `account` (`displayOrder` 1).
  - Authenticator is an anchor, not a Section.
  - There is no Save all.
- **Proxy (built in 7.0a):** all 1health traffic goes through `/api/1h/<path>`.
  - The allowlist is `lib/server/proxy/allowlist.ts` and the deny list is `lib/server/proxy/deny-list.ts`. The deny list uses exact `METHOD + template` matching, and prefix matching only for `/**` patterns.
  - Entries already shipped:
    - `GET v2/user/myself`
    - `GET v2/user/contact-point/list` (`type` ∈ `Email|Mobile|Landline`)
    - `PUT v2/user/edit`, whose strict body schema already rejects `email`, `phoneNumber`, `phoneNumberRegion` and `locale`
  - The `profile: true` flag exists on the entry type. Stories 7.5 and 7.6 decide whether these entries get it.
  - Story 7.5 adds `POST v2/user/time-zone` (the six ids) and `POST v2/user/locale` (`en-US` only), both `profile: true`.
  - Story 7.6 opens `email`, `phoneNumber` and `phoneNumberRegion` on `PUT v2/user/edit`. `phoneNumberRegion` is accepted only together with `phoneNumber`.
- **Kill switch:**
  - The proxy-level 503 `{errorCode:"SERVICE_DISABLED", source:"proxy"}` for `profile: true` entries **is built**.
  - Story 7.2 adds the page/route-level part, centrally in `proxy.ts` and before any upstream call. It covers `/account`, `/handoff/**` and `/api/pp/{mfa,org-logo,practice-support}/**`.
  - Pages render the disabled screen with status 503. `/` and the Contacts endpoints keep working.
- **Hand-off:** `GET /handoff/portal?to=tenant&tenantId=<^\d{1,19}$>|to=create-org` answers with `seeOther()` from `lib/server/http/responses.ts`.
  - `lib/server/handoff.ts` holds `TENANT_HANDOFF_SHAPE`. The default `"root"` returns `portalUrl`; the alternative `"ctx"` returns `<portalUrl>/?ctx=<n>`.
  - `resolveHandoffEnvironment()` reads the session read-only, then falls back to the cookie, then to `prod`.
  - Invalid input gets a 303 to `portalUrl`. Other methods get a 405 (use the shared `methodNotAllowed()`).
  - The route needs no session, has no side effects, never builds a URL from response data, and never logs the query string.
  - Client side, use `features/shell/handoff.ts#handoffHref()`.
  - Nothing may reference `v2/user/switch-tenant`.
- **Data:**
  - `keys.myself()` already exists in `lib/api/keys.ts`. Add `keys.contactPoints(type)` = `["pp","contact-points",type]`, one key per type, shared with Contacts and the header. Inline SWR keys are a lint error.
  - `fetchMyself()` and the `Myself` type live in `lib/api/user.ts` (`personId` is nullable). Story 7.4 extends the mapping with `firstName`, `lastName`, `username`, `email`, `phoneNumber`, `phoneNumberRegion`, `birthDate`, `roles`, `preferredLanguage`, `timeZone` and `locale`.
  - `features/account/view-model.ts#toAccountView()` builds the read view.
- **Shared rules:**
  - `lib/shared/person-rules.ts` is the only home of the name and age rules. It exports `birthDateAgeRange(roles)` and `isBirthDateInRange()`.
  - `lib/shared/time-zones.ts` holds the time zones.
  - `formatPhoneDisplay(value, region)` uses libphonenumber-js.
  - `features/account/schema.ts` (zod 4, `zodResolver`) imports these rules and never redefines them.
- **Save sequence** (`save()` never throws):
  1. `updateAccount(diff)` in `lib/api/account.ts` sends `PUT v2/user/edit` with the dirty fields.
  2. `setTimeZone` sends `POST v2/user/time-zone?timeZone=`, if dirty.
  3. `setLocale` sends `POST v2/user/locale?locale=en-US`, if dirty.

  Steps 2 and 3 always run. Only `SESSION_EXPIRED` stops the sequence.
  - Result shape: `{ ok:false, error:{ failedParts:("details"|"timeZone"|"locale")[] } }`.
  - On success, mutate `myself` and the three contact-point keys.
  - A non-GET is replayed only after a proxy `TOKEN_EXPIRED` (7.0a enforces this).
- **Primary fields:**
  - `updateAccount()` is the only builder of `email`, `phoneNumber` and `phoneNumberRegion`.
  - It sends them only when they changed, and only values from the current Verified lists.
  - Lint `no-restricted-imports` limits imports of it to `features/account`.
- **Errors:**
  - The BFF body is `{errorCode, source:"proxy"}`. `callApi` already sets `upstreamCode` from upstream `{message, code}`.
  - `FORBIDDEN` means a 403 without `source:"proxy"`.
  - `lib/api/errors.ts` (7.0b) owns the mapping: the platform `message` for action errors, otherwise the generic error.
  - `features/account/forbidden-scope.ts` encodes the 403 owner table:

    | 403 on | What shows no access |
    | --- | --- |
    | `contact-point/list` | the Account email/phone pickers only |
    | `mfa/*` | the Authenticator card |
    | `user/npi`, `public/npi/list`, `user/register/npi` | the Provider tab |
    | `user/organization/portal` | the Organizations tab |
    | `practice-support` | the Practice-name popover only |
- **Drafts:**
  - The key is `pp:draft:v1:<userId>:account`.
  - `draftFields` are `firstName`, `lastName`, `birthDate`, `preferredLanguage`, `timeZone`, `locale`, plus `primaryEmail` and `primaryPhone` (added in 7.6).
  - `baseHash` hashes the server values of exactly those fields.
  - A draft never contains the username, password, MFA data or NPI data.
- **Headers:** 7.0a already sends the CSP nonce, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, COOP, HSTS, `nosniff`, `Referrer-Policy` and `Permissions-Policy` on every path. Story 7.2 asserts the full set plus `Cache-Control: private, no-store, max-age=0`, `Pragma: no-cache` and `Vary: Cookie` on `/account` and `/handoff/portal`, including on redirect and 503 responses.
- **Tests** (tooling built in 7.0a):
  - Vitest 5, Testing Library, and MSW 3 at the `/api` boundary. MSW 3 uses `onUnhandledFrame`, and `trackAllRequests()` asserts that no call was made.
  - Playwright runs against a mocked proxy, with a desktop project and a 360 px project.
  - Coverage must be 100% on `lib/**`. Run it with `pnpm vitest run --coverage`.
  - Axe runs through `@axe-core/playwright`.
  - `scripts/check-forbidden.sh` must stay green.

## Epic 1 foundation required (build minimally inside Epic 7)

| Epic 1 piece | Minimum Epic 7 needs | Status | First needed by |
| --- | --- | --- | --- |
| **1.1 Foundation** | `lib/server/env.ts`, `lib/shared/environments.ts`, `lib/shared/app-env.ts`, the nonce CSP and headers in `proxy.ts`, the layering, navigation and redirect lint bans, Vitest/MSW/Playwright, CI, `check-forbidden.sh`, removal of the legacy template auth | **Built (7.0a)** | 7.1–7.3 |
| **1.2 Launch** | The sealed `__Host-pp_s` cookie with `environment`; `requirePageSession()`; `/auth` + `/api/token` (D1, D2, D9) with the `WRONG_TENANT` copy; the `onehealth_environment` cookie; `seeOther()` | **Built (7.0a)** | 7.1, 7.3 |
| **1.3 Proxy** | `/api/1h/[...path]`, the allowlist and deny list, normalization, the 415 check, no-store, `{errorCode, source}`, the `profile: true` tag and proxy-level `ACCOUNT_DISABLED`, the entries `myself`, `contact-point/list` and `user/edit` | **Built (7.0a)** | 7.2, 7.4–7.6 |
| **1.4 callApi + SWR** | `callApi` (never throws, `upstreamCode`, `logApiCall`), `session-events.ts` (`session-expired` only), `keys.ts`, the root `SWRConfig`, `fetchMyself`, `useMyself` | **Built (7.0a)** | 7.1, 7.4 |
| **1.5 Token refresh** | One refresh and one replay, with a non-GET replayed only after a proxy `TOKEN_EXPIRED` | **Built (7.0a)** | 7.5 |
| **1.7 Logout + session dialog** | `/api/session/logout` (POST and GET, revokes all devices, always 204) and `lib/shared/login-intent.ts` are **built (7.0a)**. Still needed: the session-expired dialog that subscribes to `session-expired` and saves the login intent, and the `navigate({external:"portal"})` path | Dialog: **7.0b** | 7.1, 7.5, 7.6 |
| **1.8 Page shell** | The app bar (plain-text wordmark in `primary-text`, the "Pages" nav, "Return to 1health"), shadcn Tabs with the `tab` tokens, `navigate()` page targets, `ProfileTab`, and the D13 tokens in `app/globals.css` (`link-text`, `destructive-fill`, `primary-text`, `scrim`; this removes the `bg-black/50` exemption in `components/ui/dialog.tsx`) | **7.0b** | 7.1 |
| **1.9 Header view** | The shared profile header (name, picture, primaries) and `keys.contactPoints(type)` with a row type that carries `phoneNumberRegion` | **7.0b (if 7.1 needs it)** | 7.1 (layout), 7.6 |
| **1.11 Section framework** | `SectionRegistry` per page; `useRegisterSection({id,label,displayOrder,form,validate,save,discard,draftFields})`; a `SectionId` that includes `account`; the edit-mode primitives (`input-locked`, the footer with "Unsaved changes", Cancel and Save); a `save()` error shape that allows `failedParts` | **7.0b** | 7.1, 7.5 |
| **1.12 Errors, messages, toasts** | `lib/api/errors.ts` (`FORBIDDEN`, generic proxy errors, platform message, field mapping), the non-launch strings in `lib/shared/messages.ts` (today it holds only the launch and disabled draft copy) with the verbatim test, toasts, and a Retry pattern | **7.0b** | 7.1, 7.5, 7.6 |
| **1.13 Leave guard** | The three-way dialog ("You have unsaved changes": Keep editing, Discard, Save) that `navigate()` invokes, plus `beforeunload` | **7.0b** | 7.1, 7.3, 7.5 |
| **1.15 Drafts** | `pp:draft:v1:<userId>:<section>` with a 500 ms debounce and a write before the session-expired dialog; `baseHash` conflicts; the restore banner; `drafts.purgeUser(userId)` | **Not built; not in 7.0b.** Must land before 7.5. Until then, the portal path needs at least a `drafts.purgeUser` stub | 7.5, 7.6 |
| **1.16 Disabled screen** | `features/shell/disabled-screen.tsx` for page-level 503s (the copy already exists in `messages.ts`) | Not built | 7.2 |

**Not needed for Epic 7:** 1.6 Idle logoff, 1.10 Profile Picture, 1.14 Save all (`/account` must not mount one), and the 1.16 deployment work beyond the `ACCOUNT_DISABLED` env var.

**Brownfield note:** `/` currently renders `features/shell/profile-placeholder.tsx`. The app bar and header can be built against `/account` first and reused on `/`.

**Known deferral from 7.0a:** an upstream 401 on a token that is still fresh by the clock ends the session instead of refreshing it. Revisit this when 7.0b touches the session events.

## UX & Interaction Patterns

- **Frame at 768 px and above:**
  - From top to bottom: the app bar (Account marked active through `app-nav-item-active` and `aria-current="page"`), the same profile header as `/`, the tab strip, and a single-column main area with 24 px padding.
  - There is no Section menu, no Jump to and no Save all.
- **Frame below 768 px:**
  - The page nav becomes a segmented control, which wraps under the wordmark below 400 px.
  - The tab strip scrolls inside itself and keeps the selected tab in view.
  - The header shows only the avatar and name.
  - Gutters are 16 px.
- **Page nav:** selecting the current page's item does nothing. Selecting the other item goes through the leave guard. "Return to 1health" always shows.
- **Tabs:** they follow ARIA tab semantics. Left and Right move focus and wrap, Home and End jump to the ends, and Enter or Space activates a tab (manual activation).
- **Keyboard order:** page nav → Return to 1health → header → tabs → tab content. The wordmark is never focused.
- **Skeletons** (`features/account/account-state-frame.tsx`):
  - 4 key/value rows
  - five 112 px tiles
  - two input-height bars
  - 12 card placeholders
  - The shimmer is static under reduced motion.
- **Read table:**
  - At 768 px and above it has four columns (key | value | key | value), filled row by row.
  - Below 768 px it shows one Field | Value pair per row.
  - Each key is a `th scope="row"`.
- **Edit view:**
  - The Section switches in place, with a primary border, a 3 px accent halo, and a muted "Editing" label.
  - Focus starts on First name.
  - Controls are capped at 480 px.
  - Birth date is a masked `MM/DD/YYYY` input with a calendar button, and the picker range matches the age rule.
  - A "?" `info-icon-button` labelled "About birth date" opens a Tooltip, in edit view only. Story 7.5 creates the reusable `components/ui/info-icon-button.tsx`.
  - Enter doesn't submit the Section, and Escape doesn't cancel.
  - On an invalid Save, focus moves to the first invalid field, which carries `aria-invalid` and `aria-describedby`.
- **Saving:**
  - While saving, the button shows a spinner and "Saving…", the inputs become read-only, and Cancel is disabled. A double click sends only once.
  - After a successful save, focus moves to the Section `h2`.
  - Cancel reverts without a confirm and returns focus to "Edit".
- **Styling:** use semantic tokens only, including the D13 tokens and `scrim` for dialogs. No hex values or palette classes.

## Cross-Story Dependencies

- **Order:** 7.0b → 7.1 → 7.2 → 7.3 → 7.4 → 7.5 → 7.6.
  - 7.2 depends only on 7.1.
  - 7.3 is independent of 7.4–7.6.
  - Drafts (1.15) must exist before 7.5.
- **Created in Epic 7 and reused later:**
  - 7.4 creates `lib/shared/time-zones.ts`, `person-rules.ts` (unless Story 2.2 already has) and `formatPhoneDisplay()`, and extends the `Myself` mapping.
  - 7.5 creates `info-icon-button`, which Epics 9 and 10 reuse.
  - 7.6 extends the 7.5 save sequence and the draft fields.
- **Later epics:**
  - Epics 8–10 fill the authenticator anchor and the provider and organizations placeholders, using the 7.1 state frame and the 403 scopes.
  - They also tag their own allowlist entries `profile: true`.
  - Epic 10's "Enter portal" uses the 7.3 hand-off.
- **Shared with other epics:**
  - `person-rules.ts` with Epic 2.
  - The contact-point keys and `formatPhoneDisplay` with Epic 3.
  - A Personal-information save on `/` invalidates the account draft through `baseHash`.
- **Open questions:**
  - Which portal URL opens a given tenant (OQ1, due 2026-10-17). `TENANT_HANDOFF_SHAPE` stays `"root"` until it is answered.
  - The portal `login?openApp=<name>` deep link waits on Personal Profile's registered app name.
  - Whether tokens survive a login-email change through `PUT user/edit`. This must be verified on demo.
