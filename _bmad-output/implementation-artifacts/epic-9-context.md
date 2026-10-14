# Epic 9 Context: Individual Provider Registration

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Build the "Individual Provider Registration" tab of the `/account` page (`/account?tab=provider`). It holds a single Section, "Healthcare credentials". An unregistered user searches the national NPI registry for a personal NPI (required) and a practice NPI (optional), then registers them. A registered user sees a read-only view of their credentials: the practice's support contact, their signature, and either an "already exists" notice or a "Register your practice" hand-off. The epic rebuilds the legacy `/personal-settings` provider screen with the new UI and closes legacy gaps: the old tab rendered nothing while loading, failed searches showed an empty list, and nothing checked whether an NPI was already taken. Registering is a one-time action. The app offers no way to edit or unregister.

## Stories

- Story 9.1: Registration state and NPI search
- Story 9.2: Register
- Story 9.3: Registered view

## Foundation already built (2026-10-14)

Built on `feat/NG-9019-epic-7` by specs 7.0a, 7.0b-1, 7.0b-2, 7.0c-1, F1 and F2 (all `done`). Use these pieces; do not rebuild or fork them. The rest of the shared foundation comes from F3–F5 (`shared-foundation-plan.md`) before feature work by either team.

| Piece | Spec | Paths and public API |
|---|---|---|
| Env, environment map, app env | 7.0a | `lib/server/env.ts` (named vars, `IS_LOCAL_DEV`, `DEFAULT_TENANT_ID`, `getSecretKey`, `getAppId`, `PP_DISABLED`, `ACCOUNT_DISABLED`, `PP_E2E_FIXTURES`); `lib/shared/environments.ts` (`apiRoot`, `apiBase`, `portalUrl`, `publicFilesOrigin`); `lib/shared/app-env.ts` (`isLocalDev`, `isProductionBuild`) |
| Security headers, lint, tooling, CI | 7.0a, 7.0b-1 | root `proxy.ts` + `lib/server/security/headers.ts` (nonce CSP, AD-21); ESLint layering and AD-26 navigation bans; Vitest 5 + MSW 3 + Playwright + `@axe-core/playwright`; `.github/workflows/ci.yml`; `scripts/check-forbidden.sh`, `scripts/check-tokens.sh` |
| Server HTTP helpers | 7.0a | `lib/server/http/{responses,cache-headers,content-type,fetch-with-timeout,guard-route}.ts` (`seeOther`, `jsonError`, `methodNotAllowed`, no-store headers, 415 check, `guardRoute`); `lib/server/log.ts` |
| Launch and session | 7.0a | `/auth` (`features/shell/auth-screen.tsx`, `launch-flow.ts`), `POST /api/token` (`lib/server/launch/*`), `__Host-pp_s` (`lib/server/session/{session,types,environment-cookie,revoke}.ts`), `requirePageSession()` in `lib/server/page-session.ts` (returns `{ portalUrl, idle }`), `lib/shared/login-intent.ts` (`saveLoginIntent`, `consumeLoginIntent`, `consumeLaunchIntent`: relaunch lands only on `/`) |
| Proxy | 7.0a | `/api/1h/[...path]` (`lib/server/proxy/*`): allowlist, exact deny list, normalization, `me` owner substitution, `profile: true` tag + proxy-level `ACCOUNT_DISABLED` 503, `asImage` forces `preview=true`; `lib/shared/bff-contract.ts` (`BffErrorCode`, `BFF_PATHS`, activity headers). Entries: `GET v2/user/myself`, `GET v2/user/contact-point/list`, `PUT v2/user/edit` |
| Client transport | 7.0a | `@/lib/api`: `callApi` (never throws; `ApiResponse` with `errorCode`, `upstreamCode`, `platformMessage`, `source`), `configureApiClient`, `getPortalUrl`, `sessionEvents` (`session-expired` only), `keys` (every planned key since F1, see below), `swrFetcher`, `logApiCall`, `startSession`/`endSession`; one root `SWRConfig` (`features/shell/swr-provider.tsx`); `useMyself`; `usePortalUrl` |
| Token refresh | 7.0a | `/api/session/refresh`, `lib/api/refresh-coordinator.ts` (single-flight + `navigator.locks`; non-GET replayed only after a proxy `TOKEN_EXPIRED`) |
| Logout | 7.0a | `/api/session/logout` (POST/GET; best-effort `logout/all-devices`; always 204) |
| Idle logoff and activity | 7.0c-1 | 15 min / 8 h limits (`isSessionAged`), `POST /api/session/ping`, proxy and page-navigation `lastSeen` re-seal, `lib/api/activity.ts` (`pp-activity`), `recordUserActivity()`, `IdleWarning` (mounted once in `PageFrame`), `IDLE_MESSAGES` |
| Design tokens | 7.0b-1 | `app/globals.css`: `link-text`, `destructive-fill`, `primary-text`, `scrim`, `control-border`, `tooltip`, `tooltip-foreground`; `Button` `touch` size and `destructive` variant; `dialog.tsx` on `bg-scrim` |
| Copy and errors | 7.0b-1 | message catalog with verbatim + voice tests (split per area by F1, see below); `mapApiError`/`mapFetchError` (`forbidden`, `generic`, `network`, `session`; replaced by mapper v2 in `lib/api/errors/` by F1, see below) |
| Confirm dialog and read states | 7.0b-1 | `components/ui/confirm-dialog.tsx` (`ConfirmDialog`: `standard \| destructive`, `extraAction`, `busy`, `cancelLabel`, `showConfirm`, `onCloseFocus`); `features/shell/read-state.tsx` (`LoadError`, `NoAccess`, `ReadStateFor`) |
| Navigation | 7.0b-2 | `features/shell/navigate.ts` (`navigate`, `useNavigate`, `CurrentPageProvider`; targets `{page,tab?,hash?}`, `{external:"portal"}`, `{external:"handoff",href}`), `features/shell/leave.ts` (`requestLeave`, `setLeaveGuard`), `features/shell/exit-hooks.ts` (`onBeforeExit`, `onBeforeSessionExpired`), `features/shell/nav-types.ts` (`ProfileTab`, `AccountTab`, `PROFILE_TABS`, `ACCOUNT_TABS`, `PAGE_PATHS`, `SectionId`, `SectionRegistration`, `SaveResult` with `failedParts`, `ValidateResult`) |
| Shell UI | 7.0b-2 | `AppBar`, `PageNav`, `ReturnLink`, `PageTabs`/`ProfileTabs` + `components/ui/tabs.tsx`, `PageFrame` (registry, leave guard, session dialog, idle warning), `useMediaQuery`/`DESKTOP_QUERY` |
| Section registry | 7.0b-2 | `features/shell/section-registry.tsx` (`SectionRegistryProvider`, `useRegisterSection`, `useSectionRegistry`, `useIsAnyDirty`; dev throw on duplicate id; `UNEXPECTED` save wrapper; `canSave: false`) |
| Leave guard and session dialog | 7.0b-2 | `LeaveGuard` (Keep editing / Discard / Save on `ConfirmDialog`, validate-first, `beforeunload` while dirty); `SessionDialog` ("Your session ended", saves the login intent) |
| Header (initials only) | 7.0b-2 | `features/header` (`ProfileHeader`, `displayName`, `initials`), `lib/api/contact-points.ts` (`fetchContactPoints`, `findPrimary`, `ContactPoint`) |
| Per-area registries | F1 | Allowlist `lib/server/proxy/allowlist/{core,personal,contacts,files,addresses,insurance,account,mfa,npi,orgs}.ts` → `ALLOWLIST` (`index.ts`); copy `lib/shared/messages/{common,shell,section,state,header,leave-guard,session,idle,person,contacts,addresses,insurance,account,mfa,npi,orgs,places,disabled,launch}.ts` → `MESSAGE_CATALOG`, `MessageKey`, `messageFor`, `formatMessage` (`@/lib/shared/messages`); errors `lib/api/errors/{personal,contacts,addresses,insurance,account,mfa,npi,orgs}.ts` (`Field` + `rules`) → `ERROR_RULES`. Every planned area file exists and is aggregated once: a story edits only its own area file, never an `index.ts` |
| Cross-team allowlist entries | F1 | `PUT v2/user/edit` = full `PersonalInformationDTO` (`userEditBodySchema`, `RACES`, `ETHNICITIES`, `BIOLOGICAL_GENDERS` in `allowlist/personal.ts`; backend lengths/enums/patterns, trimmed names, rejects `locale`/`username`/`enabled`/`receiveNotifications`, accepts `email`, `phoneNumber` + `phoneNumberRegion` only together); `GET v2/user/contact-point/list` `type` incl. `Social Media` (`allowlist/contacts.ts`); `GET v2/file/{fileId}/download` `asImage`, numeric id, no client query, `preview=true` forced (`allowlist/files.ts`; inline/attachment hardening is F2). None is `profile: true` |
| `Myself` domain module | F1 | `lib/api/myself.ts` (replaces `user.ts`): `Myself` = `id`, `personId`, `username`, `firstName`, `middleName`, `lastName`, `namePrefix`, `nameSuffix`, `otherNames`, `titles`, `birthDate` (`YYYY-MM-DD`, null = withheld), `cityOfBirth`, `race`, `ethnicity`, `biologicalGender`, `genderIdentity`, `sexualOrientation`, `socialSecurityNumber` (masked), `signature {id,name}`, `email`, `phoneNumber`, `roles`, `preferredLanguage`, `timeZone`, `locale`, `tenants {id,name}[]`, `mfaEnabled`, `totpEnabled` (all nullable but `id`; no `phoneNumberRegion`); `toMyself`, `fetchMyself`, `loadMyself`, `myselfPath`, `isProctor(roles)`, `isTenantMember(myself, tenantId)`. No story extends it |
| SWR keys and fetchers | F1 | `lib/api/keys.ts`: `keys.{myself, profilePictureId, typeKey(type), contactPoints(type), addresses, insurance, npi, practiceSupport, orgs(name,page)}`, `ContactPointType` = `Email\|Mobile\|Landline\|Social Media`, `CONTACT_POINT_TYPES`, `SWR_RESOURCES`, `mutateMyself()`, `mutateContactPoints(...types)`; `lib/api/fetcher.ts` `registerFetcher(resource, loader)` (one loader per family; a module registers its own and is re-exported from `lib/api/index.ts`); modules own their paths via `proxyPath()`. Keys without a loader are declared only (`profilePictureId`, `typeKey`, `addresses`, `insurance`, `npi`, `practiceSupport`, `orgs`) |
| Contact points | F1 | `lib/api/contact-points.ts`: `primaryPhoneRegion(mobileRows, myself)` (Primary Mobile row, or the row equal to `myself.phoneNumber`; default `"us"`), `isContactPointType`, `contactPointsPath`, `loadContactPoints` |
| Error mapper v2 and codes | F1 | `mapApiError(scope, response)` / `mapFetchError(scope, error)` → `forbidden \| network \| session \| generic{message?} \| field{field, messageKey} \| coded{code}`; `ErrorScope` = `SectionId` ∪ `authenticator\|provider\|organizations\|page`; `mappedErrorCode()`. Rows (upstream 4xx, own scope only): SSN taken → `personal` `field ssn` `person.ssnTaken`; email in use → `account` `field primaryEmail` `account.primaryEmailInUse`; contact duplicates → `phone\|email\|social` `field value`; MFA → `coded MFA_NOT_ENABLED\|TOTP_ALREADY_ENABLED`; NPI taken (`Operation failed. The chosen (Personal\|Practice) NPI Number: <n> is already registered.`) → `coded NPI_ALREADY_REGISTERED` (does not say which NPI). BFF codes `NO_LOGO`, `NO_PRACTICE` (`lib/shared/bff-contract.ts`); client `FORBIDDEN` + derived codes (`lib/api/errors-codes.ts`). Only `lib/api/errors/*` matches upstream text (test-enforced) |
| Shared rules and formatters | F1 | `lib/shared/person-rules.ts` (`NAME_MAX_LENGTH` 24, `PREFIX_SUFFIX_MAX_LENGTH` 10, `SHORT_TEXT_MAX_LENGTH` 128, `normalizeName`, `nameIssue`, `textIssue`, `hasProctorRole`, `birthDateAgeRange(roles)`, `isBirthDateInRange(date, roles, today)`, backend `minusYears` semantics) + `PERSON_MESSAGES`; `lib/shared/dates.ts` (`parseWireDate`, `parseDisplayDate`, `wireToDisplayDate`, `displayToWireDate`, `formatDisplayDate`, `localCalendarDate`, `minusYears`, `wholeYearsBetween`; no timezone shift, impossible dates rejected); `lib/shared/phone.ts` (`formatPhoneDisplay(value, region)`, `normalizeRegion`, `DEFAULT_PHONE_REGION`; the header uses it); `lib/shared/safe-href.ts` (`safeHref(value, protocols?)`, default `https:`/`mailto:`/`tel:`); `lib/shared/telemetry.ts` (`telemetry.track`, no-op sink, `setTelemetrySink`, typed `section_save`/`save_all`/`mfa_link`); `lib/shared/initials.ts` (`initials(...names)`: first letter of each name); `lib/shared/section-ids.ts` (`SECTION_IDS`, `SectionId`) |
| Ownership lint | F1 | `eslint.config.mjs` (fixture `eslint.config.test.ts`): `updateAccount` importable only in `features/account/**` (static and dynamic); `@/hooks/use-toast` only in `features/shell/toasts.ts`; no string or template literals as zod messages in `features/**/schema.ts` |
| Named-op wrapper | F2 | `lib/server/named-op.ts#createNamedOp(config, deps)` for every `/api/pp/*` and `/api/places/*` route: fixed order kill switch (`killSwitch: "pp"` = `PP_DISABLED`; `"account"` = `PP_DISABLED \|\| ACCOUNT_DISABLED`) → method (others 405, explicit HEAD/OPTIONS) → session → query rules (default none → 400 `BAD_QUERY`) → `params` → JSON `body` zod schema (415 non-JSON, capped read `NAMED_OP_MAX_BODY_BYTES` 16 KiB, 400 `BAD_BODY`) → token freshness when `upstream: "1health"` (401 `TOKEN_EXPIRED`) → `handle(ctx)`; `ctx.upstream.json({method, segments, query?, body?})` → `ok` / `client-error` (route relays with `relayClientError` or masks) / `failed` (401 `TOKEN_EXPIRED`, 3xx 502 `UPSTREAM_REDIRECT`, 5xx/network 502, timeout 504); `ctx.setOutcome(code)` for PHI-free log reasons; always no-store + nosniff, template-only log line. Route logic in `lib/server/named-ops/*.ts`, thin `app/api/pp/**` / `app/api/places/**` route files. Named ops never go through the allowlist |
| Named ops | F2 | `GET /api/pp/profile-picture-id` (`"pp"`, `{fileId:number\|null}`), `POST /api/places/{autocomplete,details}` (`"pp"`, `PLACES_ENABLED`, requests carry a per-lookup UUID `lookupId`), `POST /api/pp/mfa/validate` (`"account"`, `{code}` 6 digits, boolean relayed, code never logged), `GET /api/pp/practice-support` (`"account"`, `{name?, phone?, phoneRegion?, email?}`, 404 `NO_PRACTICE`, 403 relayed), `GET /api/pp/org-logo/[tenantId]` (`"account"`, members only, `publicFilesOrigin`, PNG/JPEG/WebP ≤ 512 KB inline, every failure 404 `NO_LOGO`); request/response types and `BFF_PATHS.{profilePictureId, mfaValidate, practiceSupport, orgLogoPrefix, placesAutocomplete, placesDetails}` in `lib/shared/bff-contract.ts`. Client loaders and UIs stay with Stories 1.9, 4.3, 8.2, 9.3, 10.2 |
| Kill switches and disabled screen | F2 | `lib/server/kill-switch.ts` (`killSwitchFor(pathname)` segment-prefix match, `isSwitchedOff`, `normalizePath`; `"pp"`: `/`, `/auth`, `/account`, `/handoff`, `/api/1h`, `/api/pp`, `/api/places`, `/api/session/{refresh,ping}`; `"account"`: `/account`, `/handoff`, `/api/pp/{mfa,org-logo,practice-support}`; never logout or `/api/token`) applied first in root `proxy.ts`: API → 503 `SERVICE_DISABLED`; pages/RSC/prefetch → rewrite to `app/disabled/route.ts` (`lib/server/disabled-screen.ts`, 503 static HTML, AD-21 + no-store + `Retry-After: 300`, copy `lib/shared/messages/disabled.ts#DISABLED_MESSAGES` DRAFT, portal link from session → cookie → referrer → prod); `e2e/kill-switch.spec.ts` (builds on ports 3101/3102) |
| Image downloads, uploads, HTTP helpers | F2 | `asImage` responses sniffed (`lib/server/http/image-sniff.ts#sniffImage`/`peekStream`: inline + type from PNG/JPEG/BMP bytes, else `attachment`; upstream `Set-Cookie`/`Content-Disposition`/`Content-Length` dropped); `fetchWithTimeout(url, init, {timeoutMs, bodyIdleMs})` (10 s idle timer on streamed bodies, `UpstreamBodyTimeoutError`); `lib/server/http/upstream-url.ts#buildUpstreamUrl`; `lib/server/http/read-capped.ts#readCapped`/`readStreamCapped` (413 `TOO_LARGE`) for every proxy and `/api/token` body; deny list re-checked after `me` substitution; upload entries `AllowlistEntry.upload {part, types}` + `maxBytes` (`lib/server/proxy/upload.ts#readUpload`, `sanitizeFileName`): picture (`allowlist/core.ts`, 4 MB, PNG/JPEG/BMP, `isPublic=true`, no client query), signature + signature version (`allowlist/personal.ts`, 1 MB PNG), insurance front/back (`allowlist/insurance.ts`, 4 MB PNG/JPEG). Upload ids other than `me` are only regex-checked (backend has no ownership check: deferred-work) |
| `publicFilesOrigin` | F2 | `EnvironmentConfig.publicFilesOrigin` in `lib/shared/environments.ts` (demo/prod `bocore-public-files-{demo,prod}.s3.us-west-1.amazonaws.com`), unconfirmed until Story 10.2 checks a live `tenantLogo.publicUrl` (deferred-work) |

**Still to come (shared, before feature work):**
- **F3 Section edit kit:** final registry contract (`saveAll?: false`, `dirtyCount`, draft contract), edit primitives, `runSaveSteps` + Save-all runner, key/value table, toasts, Tooltip/`DisabledAction`/`info-icon-button`, `InlineBanner`, `StatusBadge`, one `StateFrame` + `forbidden-scope` in shell/lib, Section menu / Jump to / scroll-spy / deep links.
- **F4 Drafts:** `features/shell/drafts.ts` (plugs into `onBeforeSessionExpired` and `onBeforeExit`).
- **F5 Shared inputs:** Select, masked date input + calendar, async Combobox, Popover + `info-popover`.

**Epic 9 status:** use `navigate({ external: "handoff", href })` and `navigate({ page: "profile", tab: "contacts", hash: "signature" })` (built). From F1: `isTenantMember`, `myself.tenants`/`signature` (no type change in 9.3), the NPI-taken row in `lib/api/errors/npi.ts` (real backend text, `coded NPI_ALREADY_REGISTERED`; 9.2 picks the field from its own request), `keys.npi()`/`keys.practiceSupport()`, `NO_PRACTICE`, `safeHref`, `formatPhoneDisplay`, the `GET v2/file/{fileId}/download` image entry (9.3 does not add it). From F2: `GET /api/pp/practice-support` (`lib/server/named-ops/practice-support.ts`, kill switch `"account"`, 404 `NO_PRACTICE`, 403 relayed) with route tests; 9.3 still adds the `practiceSupport` loader and the popover. Still to come: `info-popover` (F5), `StateFrame`/`forbidden-scope` (F3). Epic 9 area files: `lib/server/proxy/allowlist/npi.ts`, `lib/shared/messages/npi.ts`, `lib/api/errors/npi.ts`. Epic 1 is no longer "not implemented".

## Requirements & Constraints

- **State detection:** `GET v2/user/npi` is fetched only when the tab opens, never prefetched. A skeleton (two input-height bars) shows until the state is known. With no `providerNpi`, the search form shows. Otherwise the registered view shows. An already-registered user never sees the form.
- **Search:** there are two type-locked comboboxes. The personal field always searches with `entityTypeCode=1` and the practice field with `entityTypeCode=2`. Both send `limit=10` and a 0-based `page`, search after a 600 ms debounce, trim the text and cap it at 100 characters, and drop stale responses (abort in-flight requests). Focusing an empty field loads the first page. Scrolling loads more (infinite scroll), and the list ends with "No more results". Zero results shows "No matching NPI found" as a non-selectable row. A failed search shows "Couldn't load results. Try again.", and Try again repeats the same query and page.
- **Option labels:** individual `"<NPI>, <First> <Last>, <City>, <State>"`; organization `"<NPI>, <Org name>, <Address line 1>, <City>, <State>"`.
- **Register:**
  - Personal NPI is required. If it is missing, "Personal NPI is required" shows on blur and on Register.
  - Before posting, the app calls `is-registered` for each selected NPI in parallel, using the **record id** and never the 10-digit NPI. If either is taken, its message shows under its own field and nothing is posted.
  - Otherwise the app sends `POST v2/user/register/npi {providerNpiId, practiceNpiId?}` with no confirm dialog. An in-flight guard ensures a double click sends exactly one POST.
  - On success: toast, revalidate `["pp","npi"]`, swap to the registered view, and focus the `h2`.
  - On error: an inline error banner shows the platform message, or the 1-888 fallback when there is none. It is never a toast, and it stays until the next Register.
  - The POST is never auto-replayed after a 5xx or timeout.
- **Registered view:**
  - Read-only key/value table in a fixed field order. The value mapping is in story 9.3.
  - null, empty, "n/a" in any case, `-1` or `"-1"` reads "Not provided".
  - Below the table shows at most one of: the "already exists" info banner, or the "Register your practice to enable ordering" button. Never both.
- **Privacy (PNFR1):** NPI selections and search results live only in component state. They never go to drafts, SWR, localStorage, the URL, logs or telemetry. Server logs never include `searchText`.
- **Errors:**
  - An upstream 403 (no `source:"proxy"`) on `user/npi`, `public/npi/list` or `register/npi` replaces the whole tab with the no-access panel. The other tabs keep working.
  - A proxy `NOT_ALLOWED` 403 shows the generic load error with Retry, never "no access" (there is no `CSRF`, D5).
  - A non-403 load failure shows "Something went wrong while loading profile information" with Retry, which refetches only `["pp","npi"]`.
- **Quality:** WCAG 2.1 AA and fully keyboard-operable, with an axe check on every state. 44 px targets. No horizontal scroll at 360 px. Every string is a `lib/shared/messages.ts` key, verbatim from the copy sources. Strings marked *(draft copy)* in the stories still need PM review.
- **Guardrail (SM-C101):** never weaken the already-registered checks or the type enforcement.

## Technical Decisions

- **Proxy allowlist (AD-2):** each entry is exact METHOD + template + allowed query/body, has proxy tests, and is tagged `profile: true` so `ACCOUNT_DISABLED=1` returns 503 `SERVICE_DISABLED`.
  - 9.1: `GET v2/user/npi` (no query params), and `GET v2/public/npi/list` (`entityTypeCode` 1 or 2, `searchText` ≤ 100 chars, `page` `^\d{1,4}$`, `limit` 1–10).
  - 9.2: `GET v2/health/npi/{n}/is-registered`, and `POST v2/user/register/npi`, which takes the strict body `{providerNpiId:int, practiceNpiId?:int}` and requires `Content-Type: application/json` (no CSRF or `X-PP-Session` check, D5).
  - 9.3: reuses the `GET v2/file/{n}/download` `asImage` entry (with `preview=true` forced). Create it if Story 2.1 has not.
- **`lib/api/npi.ts`:**
  - Exports `getUserNpi()` (key `["pp","npi"]` from `lib/api/keys.ts`), `searchPersonalNpi()`, `searchPracticeNpi()`, `isNpiRegistered(recordId)` and `registerNpi()`.
  - Every call goes through `callApi` with an `"npi/<fn>"` context.
  - Domain types: `UserNpi = {registered, provider?, practice?, hie?}` and `NpiOption = {id, npi, name, addressLine1?, city, state, label}`.
  - Components never pass the entity type. A grep/lint test asserts that no file under `features/provider` contains `entityTypeCode`.
- **Error mapping (AD-19):** `lib/api/errors.ts` maps POST messages that start with `PERSONAL_NPI_IS_ALREADY_REGISTERED` or `PRACTICE_NPI_IS_ALREADY_REGISTERED` to `NPI_ALREADY_REGISTERED`, which shows under the matching field. This is the only message-text matching for this epic.
- **Practice support (AD-25), named op `GET /api/pp/practice-support`:**
  - Exports `force-dynamic` and requires a session.
  - Reads `v2/user/npi` server-side to get `practiceNpi.organization.tenantId`. If that is absent, it answers 404 `NO_PRACTICE`.
  - Calls `v2/tenant/sys-config` with exactly `Tenant%20IDs=<id>&includeAllRelations=true` and returns only `{name?, phone?, phoneRegion?, email?}`.
  - A client query gets 400. Upstream 403 passes through. It answers 503 `SERVICE_DISABLED` when `PP_DISABLED=1` or `ACCOUNT_DISABLED=1` (route-level kill switch, Story 7.2). Responses use no-store, and logs carry no query strings.
  - `v2/tenant/sys-config` stays denied as a passthrough.
  - Fetched lazily on first popover open under `["pp","practice-support"]`. Its 403 is scoped to the popover only.
- **Membership (AD-23):** only `lib/api/myself.ts#isTenantMember(myself, tenantId)` decides membership, via `myself.tenants`. Story 9.3 adds it plus the `tenants` and `signature` fields to `myself.ts`. Never use the org list for membership.
- **"Register your practice" check:** runs `is-registered` on `practiceNpi.id` (record id), and only when there is no `organization` and `verified === true`. A failure shows nothing.
- **Navigation (AD-26):** use `navigate()` only, never `next/link` or a raw `<a>`.
  - CTA: `navigate({external:"handoff", href:"/handoff/portal?to=create-org"})`. Same tab, after the leave guard. No logout, and drafts are kept.
  - Signature link: `navigate({page:"profile", tab:"contacts", hash:"signature"})`.
- **Safe links:** `lib/shared/safe-href.ts#safeHref()` allows only `https:`, `mailto:` and `tel:`. Create it here if Story 3.7 or 10.2 has not.
- **File layout:**
  - `features/provider/registered-view.tsx` starts minimal in 9.1 (just the NPI row) and grows to the full view in 9.3.
  - `components/ui/info-popover.tsx` is shared with Epic 10. Whichever epic lands first creates it, with 3 variants.
- **Tests:** Vitest + MSW for the units and states, proxy and route tests for the allowlist entries and the named op, and Playwright against a mocked proxy for UJ-103 and parity rows 8–9.

## UX & Interaction Patterns

- **Section header:** `h2` "Healthcare credentials" (`tabIndex=-1`) + an (i) `info-icon-button` that opens the provider `info-popover` (280 px, non-modal). The popover opens below the trigger and flips only without room. It opens on 150 ms hover, focus or click, opening on focus does not move focus, and it closes on Escape, blur or outside click.
- **Unregistered layout:** instruction line, then two stacked comboboxes 16 px apart (max 720 px), then a right-aligned primary "Register". A registration error banner sits between the instruction line and the comboboxes.
- **Combobox:** follows the WAI-ARIA combobox pattern (`aria-expanded`, `aria-controls`, `aria-activedescendant`).
  - Options are 52 px. Line 1 is the NPI in mono plus the name; line 2 is a muted location caption.
  - Clear (×) clears the selection and keeps focus. Typing after a selection clears it.
  - Result counts, "Searching…", the error row and the zero-results row are announced politely.
- **Register button:** shows a spinner + "Registering…" and is `aria-disabled` while in flight.
- **Registered table:** 4 columns on desktop (key | value | key | value, filled row by row), one pair per row on mobile.
- **Practice name:** a `link-text`-styled popover trigger only when the practice is a 1health Organization. The popover shows the org name, a tabular phone (via `formatPhoneDisplay`) and a `mailto:` email, or "-" when none of these exist.
- **Signature row:** a 112×32 thumb (`<img src="/api/1h/v2/file/{id}/download">`, no blob) or "No signature available", then a "?" Tooltip "About the signature", then the in-app link "Personal Profile".
- **While `myself` loads:** the Signature value shows a thumb skeleton, and the banner/CTA area waits so neither flashes.
- **Hand-off button:** "Register your practice…" is a `button-outline` with no external-arrow icon and no "opens in a new tab".

## Cross-Story Dependencies

- **Within the epic:** 9.1 → 9.2 → 9.3. Each story ships on its own. In 9.1, Register renders inert (accepted, same release). 9.2 swaps to whatever registered body exists. 9.3 replaces the minimal body. 9.3 reuses 9.2's `is-registered` allowlist entry.
- **With Epic 10:** `info-popover`, and `safeHref` (also shared with Story 3.7). Whichever lands first creates them and the other reuses them.
- **With Epic 2:** the signature `asImage` download entry (Story 2.1).

### Foundation pieces Epic 9 relies on (Epic 1 is NOT implemented; Epic 7 is building a minimal foundation first)

*2026-10-14: superseded in part; see "Foundation already built" above. Test tooling, proxy, `callApi`, keys, root `SWRConfig`, refresh, session dialog, leave guard, `navigate()` (incl. `handoff`) and `requireSession`/`requirePageSession` exist; drafts are F4, `myself.ts`/`formatPhoneDisplay`/`safe-href` F1, `info-icon-button` F3, `info-popover` F5.*

Before starting each story, check which of these exist. If a piece is missing, build only the minimum this epic needs, in the shape the spine prescribes. Do not fork a parallel version.

**Expected from Epic 7's minimal foundation:**
- `/account` route (`app/account/page.tsx`, server guard, `force-dynamic`; no `sessionBinding`, D5), the tab strip with `AccountTab` (`personal|provider|organizations`), `?tab=provider` deep-linking, and a provider-tab placeholder container (7.1).
- Shared tab and Section states: the tab-level `no-access-panel`, the load-error `inline-banner-error` with Retry, skeleton conventions, and `features/account/forbidden-scope.ts` (the AD-23 403 owner table, which already lists the provider endpoints) (7.1).
- `features/shell/navigate.ts` with the `page` and `external:"handoff"` targets, and the leave guard hook-up (7.1).
- Proxy allowlist infrastructure with the `profile: true` tag and its proxy-level `ACCOUNT_DISABLED` 503 (1.3), and the route-level kill switch for `/api/pp/practice-support/**` (7.2). `/handoff/portal?to=create-org` (7.3).
- `lib/api/myself.ts` (Profile `myself` domain module) and `lib/shared/formatPhoneDisplay` (7.4). `components/ui/info-icon-button.tsx` and the Account settings key/value read layout (7.4/7.5).

**Epic 1 pieces Epic 9 uses directly (verify whether Epic 7 stubbed them):**
- Secure 1health proxy `/api/1h/**` with allowlist, the 415 JSON content-type check (no CSRF or `X-PP-Session`, D5), no-store and template-only logging without bodies (1.3, D6).
- `callApi` over the proxy, `ApiResponse` with `upstreamCode`, `lib/api/keys.ts` (`["pp",…]`), and a single root `SWRConfig` (1.4).
- `lib/api/errors.ts` (`FORBIDDEN` vs proxy `NOT_ALLOWED`, the platform-message rule, the exact-message table), `lib/shared/messages.ts` plus the verbatim copy test, and toasts (1.12).
- Non-GET replay only after a proxy `TOKEN_EXPIRED` (1.5). The `SESSION_EXPIRED` dialog (1.7; no session-changed dialog, D5). Leave guard (1.13). The drafts store, which NPI data must never reach (1.15). The `requireSession()` server helper (1.2).
- Test tooling: Vitest + MSW, Playwright against the mocked proxy, and CI (1.1). The repo has no test framework today.
