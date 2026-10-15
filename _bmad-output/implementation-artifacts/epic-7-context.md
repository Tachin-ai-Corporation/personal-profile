# Epic 7 Context: Account page and personal account settings

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

**Shared foundation (F1–F5) is built — before writing any code read `docs/FOUNDATION.md` (catalog: `_bmad-output/planning-artifacts/shared-foundation-catalog.md`). Use it; do not rebuild.**

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

## Foundation already built (2026-10-14)

Built on `feat/NG-9019-epic-7` by specs 7.0a, 7.0b-1, 7.0b-2, 7.0c-1, F1, F2, F3-1, F3-2, F3-3, F4, F5-1 and F5-2 (all `done`). Use these pieces; do not rebuild or fork them. The shared foundation is complete; the full catalog is `docs/FOUNDATION.md`.

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
| Section registry (final) | F3-2 | `features/shell/{nav-types,section-registry}.tsx`: `RegisteredSection.saveAll`, `getDirty()`, `getDirtyCount()` + `useDirtyCount()` (only `saveAll !== false` with a `save`), `isAnyDirty()`, `subscribe()`; `ValidateResult` invalid branch `{ invalidCount, focusFirstInvalid }` (a throwing `validate` = 1); `SaveError { code?, mapped?, failedParts? }`, `SESSION_EXPIRED_CODE`, `isSessionExpired()`, `sectionHeadingId(id)` (`<id>-heading`); typed F4 hooks `getDraftValues`, `getDraftBase`, `applyDraft`, `describeDraftDiff`; a registration without `save` is guard-only (`saveAll: false`) |
| Section edit model | F3-2 | `features/shell/use-section-form.ts`: `useSectionForm({ id, label, displayOrder, schema, baseline, save(values, baseline), saveAll?, onNoChanges?: "close" \| "status", successToast?: string \| false, cancelFocus?: "heading" \| "edit", fieldOrder?, errorFields?, describeError?, draftFields?, describeDraftDiff? })` → `{ form, mode, isEditing, isSaving, isDirty, baseline, startEdit, cancel, submit, rebase, field(name), errorFor(name), editButtonProps, footerProps }`. RHF + zodResolver on blur, no `<form>` (Enter/Escape inert); dirty = `deepEqual` with the baseline (`lib/shared/deep-equal.ts`); invalid Save sends nothing and focuses the first invalid field; saving = `readOnly` inputs, inert Cancel, one send; success → read view, focus (`h2`), `section_save`, "{label} saved." toast only from the Section's own Save; network → Section error + Retry + error toast; generic → "Couldn't save {section}."; session → nothing; registers itself (registered `save()` never toasts or moves focus) |
| Section chrome | F3-2, F3-3 | `SectionHeader({ id, title, count?, editing, actions? })` (44 px, `h2#<id>-heading` `tabIndex=-1`, "Editing"), `SectionContainer({ editing })` (primary border + 3 px accent halo), `SectionFooter` (spread `footerProps`; polite "Unsaved changes", error InlineBanner + Retry, polite status, `addRow?: { label, onClick, disabledReason? }`, Cancel, busy Save), `SectionLandmark({ id: SectionId \| AccountAnchor, title, tools? })` (`<section id aria-labelledby>` + header) |
| Key/value table | F3-2 | `features/shell/key-value-table.tsx`: `KeyValueTable({ rows: { key, label, value?, rowId? }[], labelledBy? })` (desktop 4 columns row by row with a vertical hairline, `th scope="row"`; mobile one pair per row; "Not provided" for empty; `rowId` anchor), `KeyValueEditTable({ rows: { key, label, optional?, required?, help?, error?, labelAddon?, controlId?, rowId?, render(control) }[], labelledBy? })` (240 px key column, controls ≤ 480 px, label above control on mobile); layout via `useMediaQuery`, no CSS twins |
| Save runners | F3-2 | `features/shell/run-save-steps.ts`: `runSaveSteps(steps: { part, skip?, run }[], { scope, mode: "stop" \| "attemptAll", refetch?, rebase?, applySucceeded? })` → `{ ok, succeeded, error?: { code, mapped, failedParts } }` (never throws; refetch + rebase after a non-session failure; a session error stops at once); `features/shell/save-all.ts`: `runSaveAll(registry, { order?, includeGuardOnly?, trackTelemetry? })` → `clean \| invalid \| session \| done`, `saveAllSummary(outcome)`; `LeaveGuard` Save runs it (`includeGuardOnly`, `PageFrame saveOrder`); `PageFrame saveAllSlot` (profile page only); copy `SECTION_MESSAGES.{noChanges,invalidOne,invalidMany}` |
| State frames | F3-3 | `features/shell/state-frame.tsx`: `StateFrame({ state: "loading" \| "ready" \| { error: MappedError }, skeleton: "table" \| "kv" \| "tiles" \| "bars" \| "cards", columns?, loadError: { kind: "section", sectionId } \| { kind: "page" }, level: "section" \| "tab", onRetry, attempt?, anchors?, onReady? })`: session → nothing; forbidden → `NoAccess({ level })` (tab = centred bordered panel, Section = one row); else InlineBanner + Retry for that frame only; `/` copy "Couldn't load {noun}" (`SECTION_LOAD_NOUNS`), `/account` copy "Something went wrong while loading profile information"; sr-only "Loading {noun}"; static under reduced motion. Also `FrameSkeleton`, `ORG_GRID_CLASSES`, `loadErrorMessage`, `loadingLabel`; `LoadError` (+ `message`, `attempt`), `NoAccess`, `ReadStateFor` (+ `loadError`, `level`) still importable from `read-state.tsx` |
| 403 owner table | F3-3 | `lib/api/errors/forbidden-scope.ts` (from `@/lib/api`): `forbiddenScopeFor(path, page: "profile" \| "account")` → `{ owner, level: "tab" \| "section" \| "control" \| "popover" } \| null`, `FORBIDDEN_SCOPE_TABLE`, `normalizeForbiddenPath`. `/account`: `contact-point/list` → `account-pickers` (control); `mfa/*`, `pp/mfa/validate` → `authenticator` (section); `user/npi`, `public/npi/list`, `user/register/npi` → `provider` (tab); `user/organization/portal` → `organizations` (tab); `pp/practice-support` → `practice-popover`. `/`: `contact-point/list` by `type` → `phone`/`email`/`social` (section) |
| Signature thumbnail | F3-3 | `features/shell/signature-thumb.tsx`: `SignatureThumb({ fileId, fallback, alt? })` (112 × 32, `object-contain`, src from `lib/api/files.ts#fileDownloadPath` (`isFileId`), skeleton while loading, error or no file → `fallback` text: "Not provided" (2.1) / "No signature available" (9.3), `key={fileId}`) |
| Section navigation and anchors | F3-3 | `features/shell/anchors.ts` (`PROFILE_SECTIONS`, `PROFILE_SECTION_IDS`, `SIGNATURE_ANCHOR`, `PROFILE_SUB_ANCHORS`, `ACCOUNT_ANCHORS` = `account`, `authenticator`, `AccountAnchor`, `SECTION_COLUMNS`); `SectionNav` + `useSectionNavigation()` (menu, Jump to, scroll-spy; hash via `history.replaceState`, never `navigate()`/`requestLeave()`); `useHashAnchors(ids, { focusHeading?, subAnchors?, onFollow? })` → `{ frameReady(id), cancelPending() }` (load, `hashchange`, `HASH_NAVIGATE_EVENT`; unknown hashes ignored; one re-scroll on the target `StateFrame` `onReady`); `hand-scroll.ts#onHandScroll`; `SectionCountProvider` + `useReportSectionCount(id, n)`; `ContactsPanel`, `InsurancePanel`; `PageTabs` `panelOptions` (`bare`, `skipInTabOrder`) |
| Drafts | F4 | `features/shell/drafts.ts` (key `pp:draft:v1:<environment>:<userId>:<sectionId>`, environment from `lib/shared/environments.ts#environmentOfPortalUrl`; 500 ms debounce; SHA-256 `baseHash`; denylist in any case and at any depth incl. `ssn`, `signature`, MFA `code`/`qrCode`, NPI ids, `username`, `password` (dev throw, prod drop + `draft_fields_dropped` telemetry); 24 h purge; storage failures swallowed; store not exported; `DRAFT_DEBOUNCE_MS`, `DRAFT_DENYLIST`, `DRAFT_MAX_AGE_MS`, `defaultDraftDiff`), `draft-provider.tsx` (`DraftsProvider` mounted by `PageFrame`: flush on `onBeforeSessionExpired`/`pagehide`/`visibilitychange: hidden`, purge on `onBeforeExit` only; `useSectionDraft(id)` → `none \| restore \| conflict`), `SectionDraftNotice` (rendered by `SectionContainer sectionId`), `DraftCompare`; registry `observe`/`report`/`get`; `useSectionForm` `dataStatus` + `userChanged` (values set with `form.setValue` never count as a user change; change values through registered inputs or `Controller`s); `applyDraft` returns a boolean; `describeDraftDiff` required with `draftFields`; copy `DRAFT_MESSAGES`, `COMMON_MESSAGES.discard`/`.restore` |
| Select (extended), Popover, InfoPopover | F5-1 | `components/ui/select.tsx` root props `ariaDisabled` (focusable, opening and typeahead blocked), `helper` (ReactNode, joins `aria-describedby`), `loading` (`aria-busy`, spinner, "Loading…" row), `placeholder`, `unlistedValue: { value, label? }`; `components/ui/popover.tsx` (`Popover`, `PopoverTrigger`, `PopoverAnchor`, `PopoverContent`, `POPOVER_CONTENT_STYLES`); `components/ui/info-popover.tsx` `InfoPopover({ trigger, title \| label (one required), children, state?: "loading" \| "error" \| "forbidden", errorMessage?, onRetry?, onOpenChange? })` (280 px, hover 150 ms / focus / tap, Escape → trigger, Tab bridged into its links), `LinkTextButton` (`components/ui/link-text-button.tsx`); copy `CONTROL_MESSAGES` (`loading`, `loadError`, `tryAgain`, `chooseDate`, `datePlaceholder`), `NPI_MESSAGES.practiceSupportLoadError` (9.3) |
| DateInput + Calendar | F5-1 | `components/ui/date-input.tsx` `DateInput({ value, onChange(value, { text }), min?, max?, calendar?, calendarLabel?, today?, resetKey? })` (masked `MM/DD/YYYY`, wire `YYYY-MM-DD \| ""`; forms bump `resetKey` on reset/Cancel), `components/ui/calendar.tsx` (modal Popover calendar, month/year dropdowns, `CALENDAR_YEARS_BACK` 120 / `CALENDAR_YEARS_AHEAD` 20); `lib/shared/person-rules.ts#birthDateBounds(roles, today)`, `lib/shared/dates.ts` (`isWireDateWithin`, `parseDateBounds`, mask helpers); messages from the caller's schema (`PERSON_MESSAGES`); e2e port override `PP_E2E_PORT` |
| Async Combobox | F5-2 | `components/ui/use-combobox.ts` `useCombobox<T>({ load?, getKey, getLabel, debounceMs, minChars, pageSize?, maxResults?, openOnFocus?, mode: "select-only" \| "free-text", allowAdd?, staticOptions?, searchDisabled?, quiet?, emptyMessage?, endMessage?, text?/defaultText?/onTextChange?, selection?/defaultSelection?, onSelect?, onClear? })` (loader may return `exactMatch: false`), `components/ui/combobox.tsx` `Combobox` (+ `label`, `placeholder`, `maxLength`, `searchIcon`, `optionLayout: "one-line" \| "two-line"`, `renderOption`, `highlightMatch`), `ComboboxOptionText`, `HighlightMatch`; variants NPI (9.1), address (4.3), insurer (5.2), gender identity (2.2); copy `COMBOBOX_MESSAGES`; `components/ui/focus.ts#tabbables` |

**Epic 7 status:** 7.1–7.3 consume the shell above. Still owned by Team B: `app/account/page.tsx` on `PageFrame` with `AccountTab` tabs and anchors (7.1), Profile deny/traversal test rows, the `/account` no-store and header asserts, and real-`/account` mobile/axe runs (7.2; its page/route-level `ACCOUNT_DISABLED` kill switch, 503 disabled screen and on/off e2e matrix are built in F2), `/handoff/portal` + `handoffHref` (7.3), and the Account settings Section (7.4–7.6). From F1: 7.4 does not create or extend `lib/api/myself.ts` (complete) and uses `primaryPhoneRegion`, `formatPhoneDisplay`, `person-rules`, `dates`; 7.5 uses `person-rules`/`PERSON_MESSAGES`/`dates` and only adds `lib/api/account.ts` + the time-zone/locale entries; 7.6's `PUT v2/user/edit` email/phone schema, `updateAccount` lint and email-in-use row are built. Team B area files: `lib/server/proxy/allowlist/account.ts` (single-story `profile: true` entries; never edit the shared `allowlist/personal.ts`), `lib/shared/messages/account.ts` (+ shared `person.ts` read-only), `lib/api/errors/account.ts`. `features/account/account-state-frame.tsx` and `features/account/forbidden-scope.ts` are no longer built in Epic 7: F3 provides one `StateFrame` and `forbidden-scope` in `features/shell`/`lib/api`. From F3-1: 7.5 uses `InputLocked` for Username/Password (`readOnly` + `aria-readonly`, focusable, not `disabled`), `InfoIconButton` "About birth date" + `Tooltip wide` (built in F3-1, no longer created in 7.5), `FormField`, `Select`, busy `Button`, `toastSuccess` and `InlineBanner` error; 7.6 uses `Select` and `InlineBanner` info notices (the `aria-disabled` + helper Select is F5); 7.1 uses `LoadError`/`ReadStateFor` and passes `attempt`. From F3-2 / F3-3: 7.1 uses `StateFrame` (tab and Section level, `loadError: { kind: "page" }`, `attempt`), `NoAccess`, `forbiddenScopeFor(path, "account")`, `useHashAnchors(ACCOUNT_ANCHORS, { focusHeading: true })` and `SectionLandmark` for `account`/`authenticator`; 7.4 uses `KeyValueTable` + `StateFrame skeleton="kv"`; 7.5 uses `useSectionForm` with `cancelFocus: "edit"`, `onNoChanges: "status"`, `successToast: "Personal account updated successfully"`, `describeError` (one line per failed part) and `runSaveSteps(…, { scope: "account", mode: "attemptAll" })` returning `failedParts`; 7.6's pickers share that form (`details` part, `errorFields` for the duplicate email) and show `NoAccess` only for owner `account-pickers`. From F4 / F5 (2026-10-14): 7.1 gets the per-page `DraftsProvider` from `PageFrame` (portal purge, hand-off keep); 7.5 uses `DateInput calendar` with `birthDateBounds(myself.roles, today)` and `resetKey`, `Select` `placeholder` + `unlistedValue`, and drafts through `useSectionForm` (`draftFields`, `describeDraftDiff`, `dataStatus`, `SectionContainer sectionId`); 7.6 uses `Select` `ariaDisabled` + `helper` + `loading` (the F5 variant is built) and adds `primaryEmail`/`primaryPhone` to the draft fields (fallback in its `applyDraft`).

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
  - Email options are Verified Email Contact Points. Phone options are Verified **Mobile** Contact Points only (amended 2026-10-14: `PUT v2/user/edit` `phoneNumber` resolves to a verified Mobile; a Landline is rejected). The phone region comes from the Primary Mobile contact-point row, default `"us"` (`myself` has no `phoneNumberRegion`).
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
  - The key is `pp:draft:v1:<environment>:<userId>:account`.
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

*2026-10-14: statuses refreshed; see "Foundation already built" above for paths and exports.*

| Epic 1 piece | Minimum Epic 7 needs | Status | First needed by |
| --- | --- | --- | --- |
| **1.1 Foundation** | `lib/server/env.ts`, `lib/shared/environments.ts`, `lib/shared/app-env.ts`, the nonce CSP and headers in `proxy.ts`, the layering, navigation and redirect lint bans, Vitest/MSW/Playwright, CI, `check-forbidden.sh`, removal of the legacy template auth | **Built (7.0a)** | 7.1–7.3 |
| **1.2 Launch** | The sealed `__Host-pp_s` cookie with `environment`; `requirePageSession()`; `/auth` + `/api/token` (D1, D2, D9) with the `WRONG_TENANT` copy; the `onehealth_environment` cookie; `seeOther()` | **Built (7.0a)** | 7.1, 7.3 |
| **1.3 Proxy** | `/api/1h/[...path]`, the allowlist and deny list, normalization, the 415 check, no-store, `{errorCode, source}`, the `profile: true` tag and proxy-level `ACCOUNT_DISABLED`, the entries `myself`, `contact-point/list` and `user/edit` | **Built (7.0a)** | 7.2, 7.4–7.6 |
| **1.4 callApi + SWR** | `callApi` (never throws, `upstreamCode`, `logApiCall`), `session-events.ts` (`session-expired` only), `keys.ts`, the root `SWRConfig`, `fetchMyself`, `useMyself` | **Built (7.0a)** | 7.1, 7.4 |
| **1.5 Token refresh** | One refresh and one replay, with a non-GET replayed only after a proxy `TOKEN_EXPIRED` | **Built (7.0a)** | 7.5 |
| **1.7 Logout + session dialog** | `/api/session/logout` (POST and GET, revokes all devices, always 204) and `lib/shared/login-intent.ts` are **built (7.0a)**. Still needed: the session-expired dialog that subscribes to `session-expired` and saves the login intent, and the `navigate({external:"portal"})` path | **Built (7.0a + 7.0b-2)**: `SessionDialog`, `navigate({external:"portal"})` | 7.1, 7.5, 7.6 |
| **1.8 Page shell** | The app bar (plain-text wordmark in `primary-text`, the "Pages" nav, "Return to 1health"), shadcn Tabs with the `tab` tokens, `navigate()` page targets, `ProfileTab`, and the D13 tokens in `app/globals.css` (`link-text`, `destructive-fill`, `primary-text`, `scrim`; this removes the `bg-black/50` exemption in `components/ui/dialog.tsx`) | **Built (7.0b-1 + 7.0b-2)** | 7.1 |
| **1.9 Header view** | The shared profile header (name, picture, primaries) and `keys.contactPoints(type)` with a row type that carries `phoneNumberRegion` | **Built (7.0b-2)**, initials only (picture: F1/F2/Team A) | 7.1 (layout), 7.6 |
| **1.11 Section framework** | `SectionRegistry` per page; `useRegisterSection({id,label,displayOrder,form,validate,save,discard,draftFields})`; a `SectionId` that includes `account`; the edit-mode primitives (`input-locked`, the footer with "Unsaved changes", Cancel and Save); a `save()` error shape that allows `failedParts` | Registry + `failedParts` **built (7.0b-2)**; `InputLocked`, `FormField`, busy `Button`, `DisabledAction`/`Tooltip` **built (F3-1)**; footer and edit model **F3-2** | 7.1, 7.5 |
| **1.12 Errors, messages, toasts** | `lib/api/errors.ts` (`FORBIDDEN`, generic proxy errors, platform message, field mapping), the non-launch strings in `lib/shared/messages.ts` (today it holds only the launch and disabled draft copy) with the verbatim test, toasts, and a Retry pattern | Catalog, `mapApiError(response)`, read states **built (7.0b-1)**; mapper v2 **F1**; toasts + `InlineBanner` (`LoadError` takes `attempt`) **built (F3-1)**; save-failure UI **F3-2** | 7.1, 7.5, 7.6 |
| **1.13 Leave guard** | The three-way dialog ("You have unsaved changes": Keep editing, Discard, Save) that `navigate()` invokes, plus `beforeunload` | **Built (7.0b-2)**; Save-all runner F3, drafts purge F4 | 7.1, 7.3, 7.5 |
| **1.15 Drafts** | `pp:draft:v1:<environment>:<userId>:<section>` with a 500 ms debounce and a write before the session-expired dialog; `baseHash` conflicts; the restore banner; `drafts.purgeUser(userId)` | **F4** (before 7.5); plugs into `onBeforeExit`/`onBeforeSessionExpired` (7.0b-2) | 7.5, 7.6 |
| **1.16 Disabled screen** | `features/shell/disabled-screen.tsx` for page-level 503s (the copy already exists in `messages.ts`) | **Built (F2)** as `app/disabled/route.ts` + `lib/server/disabled-screen.ts` (503 route handler; a page would render 200), with the kill-switch matcher in `proxy.ts` | 7.2 |

**Not needed for Epic 7:** 1.6 Idle logoff (built anyway in 7.0c-1; `IdleWarning` runs on `/account` through `PageFrame`), 1.10 Profile Picture, 1.14 Save all (`/account` must not mount one), and the 1.16 deployment work beyond the `ACCOUNT_DISABLED` env var.

**Brownfield note:** *(superseded 2026-10-14)* `/` now renders `PageFrame` with the app bar, header and tabs (7.0b-2); `/account` reuses the same frame.

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
