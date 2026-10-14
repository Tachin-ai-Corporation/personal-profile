# Epic 8 Context: Authenticator app (MFA)

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Give users an "Authenticator app" card on the `/account` Personal Account tab where they can see whether a TOTP authenticator is linked, link one by scanning a QR code and entering a 6-digit code, and turn it off after confirming. This matches the legacy 1health-fe behavior exactly: the app only ever touches the TOTP factor and never turns base MFA on or off. The card is a standalone container below Personal account settings. It is not an editable registry Section, so it has no dirty state, draft or Save.

## Stories

- Story 8.1: Authenticator status and app tiles
- Story 8.2: Link an authenticator app
- Story 8.3: Turn off the authenticator app

## Foundation already built (2026-10-14)

Built on `feat/NG-9019-epic-7` by specs 7.0a, 7.0b-1, 7.0b-2, 7.0c-1 and F1 (all `done`). Use these pieces; do not rebuild or fork them. The rest of the shared foundation comes from F2–F5 (`shared-foundation-plan.md`) before feature work by either team.

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

**Still to come (shared, before feature work):**
- **F2 BFF extension kit:** `lib/server/named-op.ts` for `/api/pp/*` and `/api/places/*`, image download hardening, one kill-switch matcher in root `proxy.ts` + disabled screen, upload entries.
- **F3 Section edit kit:** final registry contract (`saveAll?: false`, `dirtyCount`, draft contract), edit primitives, `runSaveSteps` + Save-all runner, key/value table, toasts, Tooltip/`DisabledAction`/`info-icon-button`, `InlineBanner`, `StatusBadge`, one `StateFrame` + `forbidden-scope` in shell/lib, Section menu / Jump to / scroll-spy / deep links.
- **F4 Drafts:** `features/shell/drafts.ts` (plugs into `onBeforeSessionExpired` and `onBeforeExit`).
- **F5 Shared inputs:** Select, masked date input + calendar, async Combobox, Popover + `info-popover`.

**Epic 8 status:** use `ConfirmDialog` (destructive) for 8.3, the session dialog (built), `scrim` for the QR dialog. From F1: `myself.mfaEnabled`/`totpEnabled` (no type change in 8.1), the MFA rows in `lib/api/errors/mfa.ts` (`coded MFA_NOT_ENABLED`/`TOTP_ALREADY_ENABLED`, scope `authenticator`), `telemetry.track("mfa_link", { ok, attempt })`, `mutateMyself()`. Still to come: toasts and `StateFrame` (F3), the `/api/pp/mfa/validate` named op on the F2 wrapper. Epic 8 area files: `lib/server/proxy/allowlist/mfa.ts`, `lib/shared/messages/mfa.ts`, `lib/api/errors/mfa.ts`. Epic 1 is no longer "not implemented": the table under Cross-Story Dependencies lists where each piece now lives.

## Requirements & Constraints

- **Status:** derived only from `myself.totpEnabled`, read through the shared `["pp","myself"]` SWR key, with no extra fetch on mount. `mfaEnabled` is read but never shows "Enabled" on its own. Enabled shows a check, "Enabled" and a "Disable" button. Not enabled shows a muted "Not set up".
- **Tiles:** five tiles in this order: Google, Microsoft, Authy, DUO, Android OTP. They are presentational, and every tile links the same TOTP factor. While TOTP is enabled the tiles are `aria-disabled` (they stay focusable) and show the caption and Tooltip "Disable the current authenticator to link another". Activating one then does nothing.
- **Link flow:**
  - A tile click calls `enable/totp` exactly once (single-flight) and opens a QR dialog with one numeric code field.
  - Fewer than 6 digits shows an inline error and sends nothing.
  - Validate `true` closes the dialog, shows a toast, revalidates `myself` and focuses the card's `h2`. Validate 200 `false` means an invalid code (not an error): clear the field and keep the dialog open with the same QR.
  - Cancel or Escape revalidates `myself` and returns focus to the tile.
  - "Mfa is not enabled…" or "Mfa config is missing." shows a focused info notice and no dialog. "Totp is already enabled." refetches `myself`.
- **Disable flow:** a confirm dialog is always shown ("Turn off authenticator app?"). Confirming calls only `disable/totp`. Success shows a toast, revalidates `myself` and focuses the `h2`. Cancel sends nothing and returns focus to "Disable".
- **Errors:**
  - Show the platform `message` when present, otherwise the draft fallback copy.
  - Never auto-retry or replay after a 5xx or timeout, and there is no Retry that re-requests the QR.
  - `SESSION_EXPIRED` shows no card error, because the shell dialog handles it. There is no `SESSION_CHANGED` (D5).
  - A non-403 load error on `myself` shows the standard load-error banner with Retry, which revalidates only `myself`.
- **No access:** an upstream `FORBIDDEN` (a 403 without `source:"proxy"`) on any `mfa/*` call or `/api/pp/mfa/validate` replaces the card body with the Section-level no-access row. Other cards and tabs keep working. A proxy `NOT_ALLOWED` is never shown as no access (there is no `CSRF`, D5).
- **Privacy (hard rule):**
  - The QR data URI and the code live only in the dialog's React state, never in SWR, drafts, storage, URLs, logs or telemetry, and are cleared on close, unmount and `pagehide`.
  - The code travels only in a POST body.
  - Telemetry emits only `mfa_link { ok, attempt }`.
- **Copy:** every string is a key in `lib/shared/messages.ts`, verbatim from the EXPERIENCE.md Voice and Tone section and the Profile addendum copy table. Fallback error strings are marked `// DRAFT COPY`.
- **Quality:**
  - WCAG 2.1 AA with keyboard-only completion, focus trapped in dialogs and returned on close, and 44 px targets.
  - No horizontal scroll at 360 px.
  - Axe passes in light and dark.

## Technical Decisions

- **Files:**
  - `features/mfa/authenticator-card.tsx` and its dialogs
  - `lib/api/mfa.ts`, which exports `enableTotp()`, `validateTotp(code)` and `disableTotp()` via `callApi` with contexts `"mfa/enableTotp"`, `"mfa/validateTotp"` and `"mfa/disableTotp"`. These calls bypass the SWR fetcher.
  - Story 8.1 adds `totpEnabled` and `mfaEnabled` to the `lib/api/myself.ts` domain type.
- **Proxy allowlist:**
  - Story 8.2 adds `POST v2/mfa/enable/totp` and Story 8.3 adds `POST v2/mfa/disable/totp`. Both take no query and no body and are tagged `profile: true`, so the `ACCOUNT_DISABLED` kill switch covers them.
  - These denies must still hold: `POST v2/mfa/enable`, `POST v2/mfa/disable`, `* v2/mfa/{enable,disable,validate}/<n>`.
  - `v2/mfa/validate` is never a passthrough entry.
- **Named op `POST /api/pp/mfa/validate`:**
  - Lives in `app/api/pp/mfa/validate/route.ts` with `force-dynamic`.
  - Requires a session and `Content-Type: application/json` (else 415). There is no CSRF or `X-PP-Session` check (D5).
  - The body `{code}` must match `^\d{6}$`. Otherwise it returns 400 `BAD_BODY` and makes no upstream call.
  - The server calls upstream `v2/mfa/validate?code=`, returns the boolean, and sets `Cache-Control: private, no-store, max-age=0`.
- **Single-flight:** `enable/totp` fires from the tile's click handler, never from a mount or render effect, so it is safe under StrictMode. An in-flight ref makes double clicks a no-op. The dialog renders only the QR from the latest response, and each new dialog open gets a fresh QR.
- **Error mapping:** happens only in `lib/api/errors.ts`, through its exact-message table:
  - "Mfa is not enabled for this user." and "Mfa config is missing." map to `MFA_NOT_ENABLED`.
  - "Totp is already enabled." maps to `TOTP_ALREADY_ENABLED`.
  - An upstream 403 maps to `FORBIDDEN`.
- **Other changes:**
  - The dev-only `logApiCall` console logger (D6) already redacts `qrCode` and `code`; a test asserts it.
  - `app/globals.css` gains a `qr-surface` token that is white in both themes.
  - Vendor logos are same-origin PNGs in `public/mfa/` (copied from `1health-fe/src/assets/mfaAppsLogos/`) and are the only non-token colors.
- **Tests:** Vitest, RTL and MSW for the card and flows, proxy-table rows and route tests for the named op, and Playwright against a mocked proxy for parity row 7 (link, and disable with confirmation).

## UX & Interaction Patterns

- **Card:**
  - The `section#authenticator` has an `h2` "Authenticator app" with `tabIndex={-1}`, so it can receive focus. The deep link `#authenticator` scrolls to it.
  - Loading shows five 112 px tile skeletons, which are static under reduced motion.
- **Tiles (`mfa-tile`):**
  - Each tile is a native `button` (112 px square, 48 px logo, name below) with the accessible name "Link {App}" and `aria-haspopup="dialog"`.
  - Inactive tiles use opacity 0.55.
  - At 768 px and wider the tiles sit in one row. Below that they form a 3-column grid, with tiles at least 96 px.
- **QR dialog (`qr-dialog`):**
  - 440 px wide, with a 184 px QR on `qr-surface` inside a border frame.
  - The `otp-input` is 200 px, mono, `inputmode="numeric"`, `autocomplete="one-time-code"`, digits only, max 6.
  - Focus starts in the field. Enter submits.
  - Below 768 px the dialog is a full-screen sheet with Cancel and Submit pinned at the bottom. It is the only full-screen dialog on `/account`.
- **Disable confirm:** focus starts on Cancel, and "Turn off" uses `button-destructive`. It stays a centered dialog on mobile, with 16 px gutters. The "Disable" trigger is `button-outline-destructive`.
- **Spinners and banners:**
  - While a request is in flight the active tile shows a spinner with `aria-busy` and the other tiles become `aria-disabled`.
  - Notices and errors appear as an `inline-banner-info` or `inline-banner-error` above the tiles.

## Cross-Story Dependencies

- **Order:** 8.1 builds the card, the status, the tiles, and the no-access and loading states. 8.2 and 8.3 set the no-access state from their calls and rely on the 8.1 rendering. 8.2 and 8.3 are otherwise independent.
- **Status:** *(2026-10-14: superseded; specs 7.0a–7.0c-1 built the shell, see "Foundation already built"; `account-state-frame`/`forbidden-scope` become the F3 `StateFrame` + `forbidden-scope`; `lib/api/myself.ts`, `telemetry.ts` come from F1; toasts from F3.)* Epic 1 (foundation) is **not implemented**. Epic 7 is being built first and creates the minimal foundation Epic 8 needs. Before you start Epic 8, check that each piece below exists, and build any missing piece minimally inside Epic 8.

| Area | What Epic 8 needs | Where it comes from |
|---|---|---|
| Page | The `/account` route with Personal Account as a deep-linkable tab | Story 7.1 |
| Page | The `authenticator` container slot below the Account Section | Story 7.1 |
| Page | `#authenticator` hash-anchor scrolling | Story 7.1 |
| Page | The app bar | Story 7.1 |
| States | `features/account/account-state-frame.tsx`, with the five-tile skeleton variant, the load-error banner and Retry | Story 7.1 |
| States | The `no-access-panel` | Story 7.1 |
| States | `features/account/forbidden-scope.ts`, where the `mfa/*` row maps to the Authenticator card | Story 7.1 |
| Data | `lib/api/myself.ts` domain module on the shared `["pp","myself"]` key | Story 7.4, built on Epic 1 Story 1.4 `fetchMyself`, `lib/api/keys.ts` and the shared SWR fetcher |
| Transport | `callApi` going through the allowlisted `/api/1h/*` proxy | Epic 1 Stories 1.3 and 1.4, minimal version in Epic 7 |
| Transport | The proxy deny list, including all MFA denies (defined in Story 1.3; deny and traversal test rows against Profile templates in Story 7.2) | Stories 1.3, 7.2 |
| Transport | The 415 JSON content-type check (no CSRF or `X-PP-Session`, D5) and no-store headers | Epic 1 Stories 1.3 and 1.4, minimal version in Epic 7 |
| Transport | `ApiResponse` carrying `errorCode`, `upstreamCode` and `source` | Epic 1 Stories 1.3 and 1.4, minimal version in Epic 7 |
| Transport | Session events (`session-expired` only; no `session-changed`, D5) | Epic 1 Stories 1.3 and 1.4, minimal version in Epic 7 |
| Kill switch | `ACCOUNT_DISABLED` 503 for `/api/pp/mfa/**` (route level, Story 7.2) and for entries tagged `profile: true` (proxy level, Story 1.3) | Stories 1.3, 7.2 |
| Errors | `lib/api/errors.ts`, with upstream 403 → `FORBIDDEN` and the "platform message, else generic" rule | Story 7.1 (Epic 1 Story 1.12) |
| Errors | The MFA exact-message rows (`MFA_NOT_ENABLED` and `TOTP_ALREADY_ENABLED`) | Add them in Story 8.2 if Epic 7 didn't |
| Shared UI | The toast system | Epic 1 Story 1.12 |
| Shared UI | `lib/shared/messages.ts` and the V&T verbatim test | Epic 1, extended by Epic 7 |
| Shared UI | `lib/shared/telemetry.ts` (no-op sink) | Epic 1 (AD-15); create it if it is missing |
| Shared UI | The dev-only `logApiCall` redaction list (D6) | Epic 1 Story 1.4 |
| Shared UI | Tokens (`status-verified` and the destructive button variants) | Epic 1 Story 1.8 |
| Shared UI | shadcn Dialog and Tooltip | Existing UI library |
| Test tooling | Vitest, Testing Library, MSW, Playwright and `@axe-core/playwright` | Epic 1 Story 1.1. **The repo has no test framework today**, so confirm Epic 7 added them or add them. |
| Shell | Session-expired dialog, so MFA errors can skip that case (no session-changed dialog, D5) | Epic 1 Story 1.7. If it is missing, still suppress card errors for that code. |

- **Open platform question:** whether every user has base MFA (OQ2, which was due to be verified on demo by 2026-10-20). If they don't, the `MFA_NOT_ENABLED` notice covers it.
