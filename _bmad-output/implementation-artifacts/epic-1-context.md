# Epic 1 Context: Launch, session and profile shell

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 1 delivers the foundation and shell of Personal Profile (Jira NG-9027, NG-9020, NG-9021). The portal opens the app in its own tab at `/auth?lpl=…`. The user arrives signed in on the Contacts tab with no login form, sees their name, picture and primary contacts, and moves between the Contacts, Insurance and Medical tabs and to Account. The epic builds the security and session spine: one Vercel deployment serving demo and prod, a sealed cookie, an allowlisted server proxy, client-coordinated token refresh, idle logoff, and logout with platform revocation. It also builds the reusable shell that every later epic plugs into: the Section registry and edit model, error, message and toast mapping, the leave guard and `navigate()`, Save all, drafts and design tokens. It ends with the deployment runbooks. Epics 2–5 and 7 depend only on this epic. **Project note:** the launch and environment decisions of 2026-10-14 (D1–D13) override the architecture spine, CLAUDE.md and the existing code wherever they differ. Stories 1.1–1.8 were built and put in review before those decisions, so they still contain `/launch`, `/launch-error`, `APP_ENV`, `csrf.ts`, `session-binding.ts`, `sessionBinding` and `use-is-framed`. They must be reworked to the amended story text. *(2026-10-14: done; specs 7.0a, 7.0b-1, 7.0b-2 and 7.0c-1 rebuilt this foundation under D1–D13, see "Foundation already built".)*

## Stories

- Story 1.1: Foundation (environment config, security headers, test tooling, CI and legacy removal)
- Story 1.2: Launch from the portal and arrive signed in
- Story 1.3: Secure 1health proxy (allowlist, deny list, normalization, content-type check, kill switches, no-store and logging)
- Story 1.4: `callApi` transport, SWR keys and `useMyself`
- Story 1.5: Client-coordinated token refresh
- Story 1.6: Idle logoff, activity ping and cross-tab activity
- Story 1.7: Logout, platform revocation and the session-expired dialog
- Story 1.8: Profile page shell (tokens, app bar, tabs and Section navigation)
- Story 1.9: Profile header view (name, picture and primary contacts)
- Story 1.10: Change Profile Picture
- Story 1.11: Section framework (registry, edit model, inline validation and shared primitives)
- Story 1.12: Error mapping, message catalog, toasts and Retry
- Story 1.13: Leave guard
- Story 1.14: Save all
- Story 1.15: Drafts (keep unsaved edits across an expired session)
- Story 1.16: Deployments, environments and operations runbooks

## Foundation already built (2026-10-14)

Built on `feat/NG-9019-epic-7` by specs 7.0a, 7.0b-1, 7.0b-2, 7.0c-1, F1, F2 and F3-1 (all `done`). Use these pieces; do not rebuild or fork them. The rest of the shared foundation comes from F3-2, F3-3, F4 and F5 (`shared-foundation-plan.md`) before feature work by either team.

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
| Tooltip and DisabledAction | F3-1 | `components/ui/tooltip.tsx`: `Tooltip({ content, wide?, side?, contentId?, contentClassName?, keepOpenOnPress? })` (`@radix-ui/react-tooltip@1.2.16`; `tooltip` tokens, caption type, arrow, side top; opens on hover, focus, touch/pen tap; closes on Escape, blur, outside tap; empty content renders only the trigger; `wide` wraps at 320 px), `TooltipProvider` mounted once in `app/layout.tsx` (300 ms delay/skip-delay); `components/ui/disabled-action.tsx`: `DisabledAction({ reason, wideReason? })` (Button look, `aria-disabled`, in tab order, always `type="button"`, click/Enter/Space no-ops, reason in a Tooltip a press keeps open and in a visually hidden `aria-describedby` line) |
| InfoIconButton | F3-1 | `components/ui/info-icon-button.tsx`: `InfoIconButton({ "aria-label", icon?: "help" \| "info" })` (44 px target, 18 px `CircleHelp`/`Info`, `muted-foreground`, `forwardRef`: a Tooltip trigger now, a Popover trigger in F5) |
| Form controls | F3-1 | `components/ui/form-field.tsx`: `FormField({ label, optional?, required?, help?, error?, id?, labelAddon?, children: (control) => … })` (render prop gets `id`, `aria-describedby` help then error, `aria-invalid`, `required`/`aria-required`; polite error region; muted "(optional)") + `FieldError({ id, children })`; `components/ui/input.tsx` restyled (44 px, `text-body`, `control-border`, `focus-ring`, 2 px `error` border on `aria-invalid`; `INPUT_STYLES`); `components/ui/input-locked.tsx`: `InputLocked({ value, help })` (muted fill, lock icon, `readOnly` + `aria-readonly`, focusable, help first in `aria-describedby`); `components/ui/select.tsx` ported from main `b005536` (`Select`, `SelectTrigger`, `SelectContent`, `SelectItem`, `SelectValue`, `SelectGroup`, `SelectLabel`, `SelectSeparator`, scroll buttons; `@radix-ui/react-select@2.3.7`; no `aria-disabled` + helper yet → F5) |
| Busy Button | F3-1 | `components/ui/button.tsx`: `busy`, `busyLabel` (spinner + label, `aria-busy`, inert, focus kept, visually hidden polite status); `busy` or `aria-disabled` makes any Button inert (also `asChild`); `ConfirmDialog` confirm and `IdleWarning` use it (the `ConfirmDialog` busy confirm reads "Saving…") |
| Inline banner and read states | F3-1 | `components/ui/inline-banner.tsx`: `InlineBanner({ variant: "error" \| "info", action?, focusable?, announceKey? })` (only the sentence is the live region, `alert`/`status`; the action sits outside it; `announceKey` remounts it to re-announce); `features/shell/read-state.tsx` `LoadError` and `ReadStateFor` now render on it and take `attempt`: **callers must pass `attempt` (failure count) so a repeated failure is announced again** |
| StatusBadge | F3-1 | `components/ui/status-badge.tsx`: `StatusBadge({ status: "verified" \| "notVerified" \| "pending", children })` (CheckCircle `success-strong`, AlertCircle `warning-strong`, muted no icon; the word is the children, e.g. "Verified", "Enabled", "Link sent · Resend in 60 s") |
| Toasts | F3-1 | `features/shell/toasts.ts` (only importer of `hooks/use-toast`): `toastSuccess(text)` 5 s paused on hover/focus, `toastPartial(text)` 5 s, `toastError(text, { onRetry })` persistent with "Retry" (runs `onRetry` once, always closes); each returns `{ id, dismiss }`. `components/ui/{toast,toaster}.tsx`: tones, polite, bottom-center < 768 px / bottom-right from `md`, `--toast-bottom-offset` (`:root` `0px`; the Save all pill raises it), `rounded-md`, 44 px "Dismiss notification" close. `TOAST_LIMIT` 3 (oldest non-error evicted first; error toasts never dropped). Copy: `SECTION_MESSAGES.saveFailed`/`allSaved`/`partialSaved`, `COMMON_MESSAGES.optionalSuffix`/`dismissNotification` |
| Focus ring | F3-1 | `@utility focus-ring` in `app/globals.css` (2 px ring outline, 2 px offset, `shadow-glow` on `:focus-visible`); used by Button, Input, Select, toast action/close, dialog close, page nav, Return to 1health (tabs keep their inset ring). New interactive elements use `focus-ring`, not a hand-rolled rule |

**Still to come (shared, before feature work):**
- **F3-2 Section edit model:** final registry contract (`saveAll?: false`, `dirtyCount`, draft contract), `useSectionForm`, `SectionHeader`/container/`SectionFooter`, key/value table, `runSaveSteps` + Save-all runner, Section save-failure UI, fixture Section.
- **F3-3 States and Section navigation:** one `StateFrame` (skeletons, load error with section noun, no access) + `forbidden-scope` in shell/lib, `SignatureThumb`, Section menu / Jump to / scroll-spy / deep links, Contacts/Insurance panels.
- **F4 Drafts:** `features/shell/drafts.ts` (plugs into `onBeforeSessionExpired` and `onBeforeExit`).
- **F5 Shared inputs:** `aria-disabled` + helper for the Select (base Select ported in F3-1), masked date input + calendar, async Combobox, Popover + `info-popover`.

**Epic 1 status:** Stories 1.1–1.7 are fully covered (done). Partly covered: 1.8 (Section menu, Jump to, `SectionFrame` → F3), 1.9 (`keys.profilePictureId`, `Social Media` entry, `formatPhoneDisplay`, `lib/shared/initials` built in F1; `/api/pp/profile-picture-id` and `asImage` sniffing built in F2; left: Team A loader, `profile-picture/preview` entry, `<img>` avatar), 1.10 (upload mechanism and picture entry built in F2, with no client `?fileName=`; left: Team A dialog, `image-reencode`, `DELETE v2/file` entry, server-side EXIF decision), 1.16 (kill-switch matcher + 503 disabled screen `app/disabled/route.ts` built in F2; left: Team A Vercel, `promote`, `docs/ops/*` runbooks, rehearsal), 1.11 (zod-message lint and `telemetry` built in F1; edit model → F3), 1.12 (mapper v2, catalog split and `use-toast` lint built in F1; toasts → F3), 1.13 (drafts purge → F4, Save-all runner → F3, scoped `requestLeave` → Team A). Not built: 1.14 (F3 runner + Team A bar/pill; `save_all` telemetry type built in F1), 1.15 (F4). Each story in `epics.md` carries dated *Foundation 2026-10-14* lines naming what is built, what remains and which area files it edits. From F3-1: the 1.11 primitives (`DisabledAction`, `Tooltip`, `FormField`/`FieldError`, `Input`, `InputLocked`, busy `Button`), the 1.12 toasts and `InlineBanner` (with `LoadError` on it) and the 1.8 Select port + `focus-ring` are built; 1.8, 1.11 and 1.12 stay partly covered (F3-2: edit model, save-failure UI, fixture Section and spec; F3-3: Section navigation and `SectionFrame`).

## Requirements & Constraints

- **Launch:**
  - A valid payload lands on `/` (Contacts) in one flow, with no `view` or `tab` launch param.
  - A failure ends, after the client retries, in the `/auth` error alert, never a blank page or raw error.
  - The server exchanges each payload exactly once per request. `lpl` is removed with `replaceState` before the first request, so no history entry holds it.
  - Only tenant `1` may launch.
  - Pages without a session redirect to `/auth`, and there is no login form.
- **Session:**
  - Refresh is silent.
  - The session ends after 15 min without user activity or 8 h after launch. A warning appears at 14 min.
  - Only user-initiated requests count as activity: a top-level page load, the ping, and `callApi` calls that send `X-PP-Activity: user`. Background SWR revalidation and refresh never count.
  - Activity in one tab resets the others through `BroadcastChannel("pp-activity")`, carrying a timestamp only.
- **Drafts:**
  - Unsaved edits are kept in `localStorage`, keyed by `userId`, for 24 h. They are offered back only to the same user on the same device.
  - Drafts never contain SSN, Signature, MFA codes or QR data, or NPI selections, and Insurance never writes one.
  - If the server data changed meanwhile, the user chooses "Keep mine" or "Use current". Drafts are never merged automatically.
  - Drafts are deleted on save, on discard and on the app-bar "Return to 1health" (user-wide). They are kept on the session-expired "Return to 1health" and on portal hand-offs.
- **Section editing:**
  - Each Section has a read view and an edit view, and several can be open at once. Each has its own Cancel and Save, and "Unsaved changes" means deep inequality with the baseline.
  - Inline errors show before any request is sent. Nothing auto-saves. In edit view, Escape doesn't cancel and Enter doesn't submit.
  - Save all validates every dirty Section first, then saves them one at a time (not atomic). It reports "X saved, Y failed" and never says "All saved" unless F = 0.
  - A failure in one Section never blocks the others. Network failures offer Retry, and there is no offline queue.
- **Leave protection:** a tab switch, an app-bar page switch, Return to 1health, a portal hand-off, or closing the page with unsaved edits asks first.
- **Accessibility and layout:**
  - WCAG 2.1 AA, keyboard-only completion, visible focus ring, reduced motion respected and 44 × 44 px targets.
  - 360 px to desktop with no horizontal scroll at 360 px (automated check).
  - axe runs in light and dark, at desktop and 360 px.
- **No PHI leaks:**
  - Server logs never contain bodies, also under `next dev`. Proxy log lines are `{requestId, method, template, status, durationMs}`. Other routes log only `{requestId, routeTemplate, status, …}`.
  - Telemetry is a no-op sink with only `section_save {sectionId, ok, code}` and `save_all {saved, failed}`.
  - Every server response is no-store.
  - The Medical tab shows only "Coming soon: your medical information will appear here." and makes no request.
- **Copy:** every string lives in `lib/shared/messages.ts`. EXPERIENCE.md Voice and Tone strings are verbatim and checked by a test, which also covers the Profile-module rows. Anything else is marked `// DRAFT COPY`. There are no exclamation marks.
- **Kill switches:**
  - `PP_DISABLED=1`: API routes, including `/api/token`, answer 503 `SERVICE_DISABLED` with no upstream call. `/auth` and `/` render a 503 disabled screen. Logout keeps working.
  - `ACCOUNT_DISABLED=1`: proxy entries tagged `profile: true` answer 503, and all other entries keep working.
- **CI:** forbidden-pattern gate → lint → typecheck → test → e2e → build, on Node 24 with pnpm 12 via corepack, using dummy secrets only.

## Technical Decisions

- **Config (D1, D4):**
  - `lib/server/env.ts` is `server-only` and is checked at boot from `instrumentation.ts`.
    - It exports `ONEHEALTH_SECRET_KEY_DEMO|PROD`, `APP_ID_DEMO|PROD`, `SESSION_SECRET` (≥ 32 chars), optional `SESSION_SECRET_PREVIOUS`, `PLACES_ENABLED`, `GOOGLE_PLACES_KEY`, `PP_DISABLED`, `ACCOUNT_DISABLED`, `IS_LOCAL_DEV`, `DEFAULT_TENANT_ID = 1`, `getSecretKey(env)` and `getAppId(env)`.
    - The flags are `true` only for the exact string `"1"`.
  - There is **no** `APP_ENV`, `API_ORIGIN`, `APP_ORIGIN`, `PORTAL_URL`, `PORTAL_ORIGIN`, `PUBLIC_FILES_ORIGIN`, `APP_ID`, `ONEHEALTH_SECRET_KEY` or `NEXT_PUBLIC_*` variable, and no `dev` environment. The forbidden-pattern gate fails on these names, as well as on `X-PP-Session`, `sessionBinding`, `SameSite=None`, `Partitioned`, `window.top` and `bg-black/50`.
  - `lib/shared/environments.ts` holds `Environment = "demo"|"prod"`. Per environment it holds `apiRoot` (`https://1health.demo.1health.io` / `https://1health.app.1health.io`), `apiBase` (`<apiRoot>/api`), `portalUrl` (the same root) and `publicFilesOrigin`. It is the only place that knows a 1health origin.
  - The only `process.env` read outside `env.ts` is `lib/shared/app-env.ts#isLocalDev()`.
- **Launch (D2, D9):**
  - `/auth` is a force-dynamic server wrapper that passes the `onehealth_environment` cookie to the client screen `features/shell/auth-screen.tsx`.
  - Each attempt is `POST /api/token {lpl}`, with spaces turned into `+`.
  - Retries: up to 5 attempts, 1500 ms apart with no backoff. The client stops early when a body says `retryable: false`.
  - **Environment detection:** the server tries `ONEHEALTH_SECRET_KEY_PROD` and then `_DEMO`, each first as stored and then trimmed. The trimmed variant logs a warning without the value. The AES-256-GCM decryption uses an HKDF key, the first 12 bytes as IV and the last 16 bytes as tag. The key that decrypts sets `environment`. The client never sends an environment.
  - **Checks and exchange:**
    1. `APP_ID_<ENV>` must equal `required.apiKey.name`.
    2. The server makes one exchange to `<apiRoot>/api/v2/public/external-application/auth/oauth2/user/token`, with a 25 s timeout and no server retry.
    3. It reads only the plaintext `tenantId` claim, which must be `1`, or the launch answers `WRONG_TENANT`.
    4. `userId` and `personId` come from one `GET v2/user/myself`.
  - **Error codes:** `LAUNCH_INVALID`, `LAUNCH_USED`, `LAUNCH_EXPIRED`, `WRONG_TENANT`, `LAUNCH_CONFIG` and `UNSUPPORTED_MEDIA`. Each error body carries a user-safe `message` and never upstream text.
  - **Success:** the response is `{ok:true, environment}`. It also sets `onehealth_environment` (`HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`).
  - **After success:** the client waits 1200 ms, then calls `location.assign(consumeLoginIntent("/"))`. `lib/shared/login-intent.ts` validates the stored path: it must be same-origin relative and must not start with `/auth` or `/api`.
  - **Removed routes:** there is no `/launch*` or `/launch-error` route, no `lpl` handling in `proxy.ts`, no dev-only launch page and no blocked-cookie screen.
- **Session cookie:**
  - One iron-session cookie, `__Host-pp_s`, set `HttpOnly; Secure; SameSite=Lax; Path=/`, with no `Partitioned`, `Domain`, `Max-Age` or `Expires`. It must be ≤ 3,800 bytes.
  - It holds the tokens, the expiry, `environment`, `userId`, `personId`, `tenantId`, `sid`, `gen`, `iat` and `lastSeen`.
  - It never stores `id_token` or the API root.
  - `SESSION_SECRET_PREVIOUS` is accepted for unsealing only.
- **Headers and framing (D10):**
  - `proxy.ts` sets a per-request CSP nonce on every path: `script-src 'self' 'nonce-…' 'strict-dynamic'`, `img-src 'self' blob: data:`, `connect-src 'self'` and `frame-ancestors 'none'`.
  - Every response also carries `X-Frame-Options: DENY`, HSTS, nosniff, `Referrer-Policy: no-referrer`, a Permissions-Policy and COOP `same-origin`.
  - The app is never framed. There is no framed branch and no `postMessage`.
  - Lint bans `dangerouslySetInnerHTML` and `NextResponse.redirect` in `app/handoff/**` (use `seeOther()`). It also bans raw links and `next/link` to `/`, `/account`, `/handoff/**` or a `portalUrl` outside `features/shell` and `/auth`.
- **Proxy (`/api/1h/[...path]`, the only path to 1health):**
  - **Allowlist:** entries are `{method, template, query, body, maxBytes?, asImage?, profile?}`, and **each story adds its entry in the same change as the caller**.
  - **Owner ids:** `me` is the only accepted owner segment, filled in from the session. Other ids must match `^\d{1,19}$`.
  - **Exact denies (D12, owned here):** `* /auth/**`, `* v2/public/external-application/**`, admin, GraphQL, `POST v2/mfa/enable|disable`, `* v2/mfa/{enable,disable,validate}/<n>`, `* v2/user/switch-tenant/**`, `* v2/user/update-password` and `* v2/tenant/sys-config`.
  - **Normalization:** a malformed path answers `BAD_PATH`, and an unknown query param answers `BAD_QUERY`. Server-fixed params (`isPublic`, `hardDelete`, `preview=true` on `asImage` entries) ignore client values.
  - **Error envelope:** every BFF error body is `{errorCode, source:"proxy"}`. Upstream 4xx `{message, code:int}` passes through untouched.
  - **Status codes:** `NOT_ALLOWED` 403, 405 for a wrong method or for HEAD/OPTIONS/TRACE, `UNSUPPORTED_MEDIA` 415, `SESSION_EXPIRED` 401, `TOKEN_EXPIRED` 401 (within 30 s of expiry or on an upstream 401), `UPSTREAM_REDIRECT` and `UPSTREAM_ERROR` 502, `UPSTREAM_TIMEOUT` 504 and `SERVICE_DISABLED` 503.
  - **No CSRF or binding (D5):** there is no `Sec-Fetch-Site` or `Origin` check, no `X-PP-Session`, no 403 `CSRF` and no 409 `SESSION_CHANGED`. Only the 415 JSON content-type check remains, and SameSite=Lax is the sole cross-site write protection.
  - **Headers:** an allowlist of request and response headers is forwarded, and `Cookie` is never forwarded. The proxy never refreshes.
- **Transport:**
  - **`callApi`:** it is the only browser transport (`fetch` is lint-banned elsewhere). It never throws and returns `ApiResponse {success, data?, error?, statusCode?, errorCode?, upstreamCode?, details?}`.
  - **Envelopes:** a BFF body sets `errorCode`. An upstream body sets `upstreamCode` (an integer), and `errors.ts` derives `errorCode` from it.
  - **Session events:** `callApi` branches on `errorCode` only. The only session event is `session-expired`, published once per page; there is no `session-changed`.
  - **Dev logging (D6):** `logApiCall` is the only console logger. It runs in local development only and redacts SSN-shaped values, MFA `code`, `qrCode` and token-like fields.
  - **Page config:** the server pages embed `portalUrl` through one shared server helper. It resolves the session environment first, then the `onehealth_environment` cookie, then `prod`. The pages embed no binding.
  - **SWR:** every key comes from `lib/api/keys.ts` (`["pp", resource, ...]`). There is one root `SWRConfig` in `app/layout.tsx`, shared by `/` and `/account`.
  - **Header keys:**
    - `myself()`, `profilePictureId()` and `contactPoints(type)`, with exactly one type per key (`Mobile`, `Landline`, `Email`).
    - There is no composite `"Phone"` key.
    - Epics 3 and 7 must `mutate` these keys.
- **Refresh:**
  - `POST /api/session/refresh` answers 200 with no IdP call when the token still has more than 30 s. Otherwise it calls `<apiRoot>/auth/oauth2/token` once.
  - On success it re-seals the cookie with `gen + 1` and the same `sid`. An IdP 401 or `invalid_grant` clears the cookie and answers `SESSION_EXPIRED`. Other failures keep the cookie and answer 503 `REFRESH_UNAVAILABLE`.
  - The backend confirmed that 1health **rotates refresh tokens with no reuse detection**, so a refresh that loses a race fails. That is why single-flight is mandatory, both in the tab (a shared promise) and across tabs (`navigator.locks` `"pp-refresh"`).
  - **Replay rules:**
    - Only a proxy-originated `TOKEN_EXPIRED` triggers a refresh, and each failed call is replayed once.
    - A non-GET is never replayed after a 5xx, a timeout or a network error.
    - A second `TOKEN_EXPIRED` becomes `SESSION_EXPIRED`.
- **Logout (D3):** `POST` (or `GET`) `/api/session/logout` first makes a best-effort call to `POST <apiRoot>/auth/user/logout/all-devices` with the Bearer token and a 5 s timeout. Failures are swallowed and logged without the token. The route always answers 204 and clears the cookie.
- **Navigation (AD-26):**
  - `features/shell/navigate.ts#navigate()` is the single entry point for cross-page and external navigation. Its targets are:
    - `{page:"profile"|"account", tab?, hash?}`, which runs the leave guard, then `router.push`
    - `{external:"portal"}`, which runs the leave guard → before-exit callbacks (`drafts.purgeUser`) → logout (wait at most 3 s) → same-tab `location.assign(portalUrl)`
    - `{external:"handoff", href}`, used in Epic 10
  - `requestLeave()` / `setLeaveGuard()` live in `features/shell/leave.ts`.
- **Section contract:**
  - **Registration:** `useRegisterSection({id, label, displayOrder, form, validate, save, discard, draftFields, saveAll?})` registers a Section. There is one registry per page: `/` and `/account` each mount their own.
  - **Typed ids:**
    - `SectionId` is `personal|phone|email|social|addresses|insurance|account`, and `insurance` registers guard-only (`saveAll:false`).
    - The tab enums are `ProfileTab` (`contacts|insurance|medical`) and `AccountTab` (`personal|provider|organizations`).
  - **Save rules:**
    - `save()` never throws: the wrapper turns a throw into `UNEXPECTED`. The result shape also allows `{failedParts}` for the Account Section.
    - `runSaveSteps` refetches and rebases on failure, so a retry sends only the remaining diff.
    - `SAVE_ORDER` is `personal → email → phone → social → addresses` and exists only on `/`.
    - A `SESSION_EXPIRED` result stops a Save-all run.
- **Single owners:**

  | Concern | Owner |
  |---|---|
  | `errorCode` / `upstreamCode` inspection | `lib/api/errors.ts` (plus the `callApi` session branch) |
  | Message-text matching (the exact-message table: `MFA_NOT_ENABLED`, `TOTP_ALREADY_ENABLED`, `NPI_ALREADY_REGISTERED`) | `errors.ts` |
  | Copy | `messages.ts` |
  | Toasts | `features/shell/toasts.ts` (lint bans direct `use-toast`) |
  | Confirm dialogs | `components/ui/confirm-dialog.tsx`: four named confirms plus the leave guard, no others |
  | Image re-encoding | `lib/shared/image-reencode.ts` |
  | Draft writes and restores | the registry |
  | Draft deletes | `features/shell/drafts.ts` |
  | Session dialog | `SessionDialogs` |

  Error mapping: upstream 403 (no `source`) → `FORBIDDEN`, proxy `NOT_ALLOWED` → generic error with Retry (never "no access"), and network or 5xx → `{kind:"network"}`.
- **Files:**
  - Uploads are re-encoded in the browser to JPEG ≤ 4 MB (Signature to PNG ≤ 1 MB).
  - Upload entries check `maxBytes` (413), exactly one part named `file`, and PNG/JPEG/BMP magic bytes (415).
  - `asImage` responses are inline only when the type and leading bytes match, and `attachment` otherwise.
  - Order is replace-then-`DELETE v2/file/{id}` (`hardDelete=true` forced). A failed delete never fails the save.
  - `GET /api/pp/profile-picture-id` is the only GraphQL path, with the query stored on the server and variables taken from the session.
- **Deploy (D1):**
  - **Project:** one Vercel project, `personal-profile`, serves both environments. Production is deployed only through the `promote` workflow, which takes a SHA that is on `main` and passed CI, and needs `production` environment approval.
  - **Previews:** previews never get `_PROD` secrets.
  - **Runbooks:** `docs/ops/` holds deployments, secrets rotation, rollback (Vercel rollback → `ACCOUNT_DISABLED` → `PP_DISABLED` → `isAllowedForPatients=false`), External Application registration (launch URL `<app origin>/auth`) and the go-live checklist.

## UX & Interaction Patterns

- **`/auth` screen (D9, patient-vault parity):**
  - **Progress:** attempt 1 shows "Authenticating..." / "Connecting to {Demo|Production} environment". From attempt 2 it shows "Confirming your login...". Success shows "Success!" / "Loading app...".
  - **Error state:** a destructive Alert shows "Authentication Failed" with the server message (or the fallback text), or "Connection Error". Its buttons are "Enter LPL Manually", "Switch Environment" and "Go to 1health ({env})".
  - **Manual entry:** the card "Authentication Required" has one field, "Launch Payload (LPL)", and its Submit is disabled while the field is empty. It is available in every environment.
  - **Environment for display:** the referrer, the cookie or the "Choose Environment" card only pick the labels and the link shown. They never change a request.
- **Layout:** top to bottom, the page shows the app bar, the header, the tab strip and the body. From 768 px the body adds a sticky 200 px numbered Section menu (`aria-current="location"` scroll-spy). Below 768 px a "Jump to" select replaces it. Neither appears on Insurance or Medical.
- **App bar:**
  - It is 52 px tall. The "1health" wordmark is a plain `span` in `primary-text`: it is not focusable and has no href or handler (D11).
  - A two-item page nav, Personal Profile | Account, carries `aria-current="page"`. Below 768 px it becomes a segmented control, which wraps onto its own row below 400 px.
  - "Return to 1health" is always rendered and goes through `navigate({external:"portal"})`.
- **Tab order:** page nav → Return to 1health → header → tabs → menu or Jump to → Sections → Save all last.
- **Tabs and deep links:** the tabs follow the ARIA tablist pattern with manual activation. `?tab=` changes through a URL replace, and an unknown value normalizes to `contacts`. `#personal|phone|email|social|addresses|signature` deep links survive a refresh, and an unknown hash leaves the page at the top.
- **Header:**
  - It shows a 40 px avatar button ("Change profile picture", camera badge) and `{first} {last}` as the single `h1`.
  - From 768 px it also shows the primary phone and email. A missing primary contact or a failed read renders nothing.
  - When there is no picture, the avatar falls back to initials.
- **Dialogs:**
  - The session-expired dialog is non-dismissable. It reads "Your session ended" / "Your changes are kept on this device. Relaunch from 1health to continue." with one button, "Return to 1health", which navigates the same tab, keeps drafts and doesn't log out. Only one dialog opens at a time, and there is no session-changed dialog.
  - The idle warning is an `alertdialog`: "You'll be signed out in 1 minute" / "Stay signed in".
  - Confirm dialogs use `role="alertdialog"` over the `scrim` overlay. Focus starts on Cancel, and Escape or an overlay click equals Cancel.
  - The leave guard offers "Keep editing" (initial focus), "Discard" and "Save". Save is hidden when a participant can't save.
- **Editing primitives:**
  - Edit view adds a primary border and an accent halo.
  - The footer shows a warning dot and "Unsaved changes" in a polite live region.
  - `RowActions`: inline actions on hover, plus a kebab that is always visible.
  - `RowRemoval`: "Removed on save" plus "Restore".
  - `DisabledAction`: `aria-disabled` plus a tooltip that opens on hover, focus or tap.
- **Save all:** from 768 px it is a sticky bottom bar ("{N} unsaved sections", Discard all, "Save all (N)"). Below 768 px it is a floating pill, hidden while the on-screen keyboard is open. Neither appears on `/account`.
- **Toasts:** bottom-right on desktop and bottom-center on mobile. Success auto-dismisses after 5 s. An error persists and offers Retry. There is no undo toast.
- **Drafts:** the restore banner reads "You have unsaved changes from your last visit." with Restore and Discard. The conflict banner shows a per-field compare ("Your version" / "Current") with "Keep mine" and "Use current".
- **Tokens (D13):**
  - Text tokens: `link-text` (#256a8c / #8fd8e6) and `primary-text` (#246b8f / #6fb6d8).
  - Fill and border tokens: `destructive-fill` (#b23a31) and `control-border` (#7a8696 / #aeb8c4).
  - Overlay: `scrim` (graphite 45 % / black 60 %).
  - Rules: no hex values or palette classes, no `text-info-strong` on links and no `bg-error-strong`. Red is for errors and destructive actions only. Light is the default, and dark is enabled by `class="dark"`.

## Cross-Story Dependencies

- Stories run in order 1.1 → 1.16, and each depends only on earlier ones.
- **Rework first:** bring 1.1–1.8 (in review) in line with D1–D13 before building 1.9 and later. *(2026-10-14: done by specs 7.0a–7.0c-1; remaining shared work is F1–F5.)* The rework covers the env vars and environment map, `/auth` + `/api/token`, removing CSRF/binding/`session-changed`/framed code, platform logout, the D13 tokens and the D11 wordmark.
- **Reused by later epics:**
  - the allowlist pattern, the `profile: true` tag and the deny list
  - `callApi`/`ApiResponse` with `upstreamCode`, `errors.ts` and `messages.ts`
  - the keys `myself` and `contactPoints(type)`, which Epics 3 and 7 must mutate
  - the registry, `runSaveSteps` and `SAVE_ORDER`
  - `SectionFrame`, `RowActions`, `RowRemoval`, `DisabledAction` and the confirm dialog
  - toasts, drafts (`purgeUser`, denylist) and `image-reencode`
  - the proxy's `asImage`, upload and file-delete mechanisms
- **What Epic 7 relies on:** `navigate()` and the leave guard, the per-page registry, `AccountTab`, the shared `portalUrl` helper, the root `SWRConfig` and the 1.3 proxy-level `ACCOUNT_DISABLED` 503. Story 7.2 owns only the page- and route-level kill switch. The app-bar "Account" item may point at `/account` before Epic 7 lands.
- **Open items and external dependencies (owner Daniel Garcia):**
  - **Registrations:** External Application registration for demo, then prod (launch URL `<app origin>/auth`, Active, allowed for patients).
  - **Login deep link:** the registered app name for the portal deep link `<portalUrl>/login?openApp=…`. Until it is confirmed, links go to the portal root.
  - **Public files:** the `publicFilesOrigin` values for each environment.
  - **Previews:** whether previews may hold the `_DEMO` secrets.
  - **Client id:** confirmation that `public-client` isn't overridden in demo or prod.
  - **BAAs:** with Vercel before real PHI, and with Google before `PLACES_ENABLED=1`.
  - **Dates:** demo QA of UJ-1 to UJ-5 by 2026-10-24, feature freeze on 2026-10-22, and production go-live on 2026-10-29 (release "Conduit"). There is no 1health-fe change or flag: the legacy `/profile` and `/personal-settings` screens stay as the fallback.
