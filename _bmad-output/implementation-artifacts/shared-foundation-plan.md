# Shared foundation plan (approved by the human 2026-10-14)

Goal: build once, before feature work by either team, every cross-cutting piece used by more than one story (Team A = Epics 1–6 on `/`, Team B = Epics 7–10 on `/account`), so feature stories only add their own components and no merge conflicts arise. Push / PR to `main` only after F1–F5. Line refs = `planning-artifacts/epics.md`.

## Plan problems the foundation settles
1. ESLint lets a feature import only `features/shell`, but `forbidden-scope` and `account-state-frame` are planned in `features/account` and used by mfa/provider/organizations → move to `features/shell` or `lib/api`.
2. `Myself` maps 7 fields; Epic 2 (A) and 7/8/9 (B) would extend it in parallel.
3. `PUT v2/user/edit` schema lacks `namePrefix`, `nameSuffix`, `otherNames`, `titles`, `cityOfBirth` (2.2, L1973); 7.6 must open `email`/`phoneNumber`/`phoneNumberRegion`.
4. No lint rule restricting `updateAccount` to `features/account` (AD-9, L497).
5. `mapApiError(response)` must become `mapApiError(sectionId, response)` with field maps and the MFA/NPI exact-message table (L1518–1526) before callers multiply.

## F1 Shared contracts and data layer
- Split per area: `lib/server/proxy/allowlist/*`, `lib/shared/messages/*` (aggregated `MESSAGE_CATALOG`), `lib/api/errors` tables, fetcher per-module registration, endpoints owned per module.
- `lib/api/myself.ts` (absorbs `user.ts`): every field Epics 2, 7, 8, 9, 10 need; `isTenantMember`, `isProctor`.
- `lib/api/keys.ts`: every resource key + revalidate helpers (`mutateMyself`, `mutateContactPoints`); decide Social contact type.
- Cross-team allowlist entries: full `PUT v2/user/edit` schema, `GET v2/file/{n}/download` image entry, contact-point list incl. social.
- `bff-contract.ts` codes: `NO_LOGO`, `NO_PRACTICE`, client codes `FORBIDDEN`, `MFA_NOT_ENABLED`, `TOTP_ALREADY_ENABLED`, `NPI_ALREADY_REGISTERED`.
- Error mapper v2 (field maps, exact-message table).
- `lib/shared`: `person-rules`, `dates`, `phone#formatPhoneDisplay` (retrofit header), `safe-href`, `telemetry` (no-op), `initials`.
- Lint: `updateAccount` only in `features/account`; only `features/shell/toasts.ts` imports `hooks/use-toast`; no string literals as zod messages.

## F2 BFF extension kit (absorbs 7.0c-3)
- `lib/server/named-op.ts` wrapper for `/api/pp/*` and `/api/places/*` (session, kill switches, no-store, 415/BAD_BODY, Bearer upstream, TOKEN_EXPIRED parity, template-only logs).
- Image download hardening (inline only for PNG/JPEG/BMP magic, idle timeout for streams, deny re-check after owner substitution).
- One kill-switch matcher in root `proxy.ts` for `PP_DISABLED` and `ACCOUNT_DISABLED` + disabled screen (503 if Next 16 allows).
- Upload entries (multipart, single file part, magic bytes, `maxBytes`, streaming byte cap).

## F3 Section edit kit (absorbs 7.0c-2)
- Registry contract final: `saveAll?: false`, `dirtyCount`, draft contract (`draftFields`, `getDraftBase`, `applyDraft`, `describeDraftDiff`).
- Edit primitives: `useSectionForm`, `SectionHeader`, edit container, `SectionFooter`, `FormField`/`FieldError`, `input-locked`, focus/keyboard rules.
- `runSaveSteps(steps, {mode: "stop" | "attemptAll"})` + Save-all runner (UI bar/pill stays Team A).
- Key/value table (read + edit, mobile one pair per row).
- Toasts (`toastSuccess`, `toastPartial`, `toastError({onRetry})`), fix `TOAST_LIMIT`/remove delay.
- Tooltip, `DisabledAction`, `info-icon-button`; `InlineBanner`, `StatusBadge`, busy Button, `SignatureThumb`.
- One `StateFrame` for both pages (skeleton variants, load error with section noun, no access) + `forbidden-scope` in shell/lib.
- Port of main Story 1.8B: Section menu, Jump to (Select), scroll-spy, deep links, Contacts/Insurance panels.

## F4 Drafts (Story 1.15)
- `features/shell/drafts.ts`: `pp:draft:v1:<userId>:<sectionId>`, 500 ms debounce, flush on `onBeforeSessionExpired`, `baseHash`, denylisted fields, 24 h purge, `purgeUser` via `onBeforeExit`, restore banner and conflict compare.

## F5 Shared input controls
- Select (aria-disabled + helper), masked date input with calendar Popover, async Combobox, Popover + `info-popover`.

## Not in the foundation (single team)
- Team A: Places, phone input, contact labels, person options, type/key lookups, RowActions/RowRemoval/DropdownMenu, Sheet + scoped `requestLeave`, uploads UI, `DELETE v2/file`, profile picture, Contact Point write engine, Save-all bar/pill.
- Team B: time zones, profile constants, MFA UI, NPI, org cards, hand-off route (before Epics 9/10), single-use `profile: true` entries, 403 owner table contents.

## Planning sync (required, human 2026-10-14)
After each foundation spec (7.0a–7.0c-1 already done, then F1–F5) is committed, update the BMAD planning so neither team re-builds it:
- `epics.md`: in every story that consumed a piece, add a dated note "*Built in <spec> (<files/exports>); use it, do not rebuild*" and strike or adjust ACs that the foundation already satisfies; keep the story's remaining feature work explicit.
- `epic-N-context.md` (1–10): mark the foundation pieces as built with paths and public APIs.
- `sprint-status.yaml`: foundation keys done; Epic 1 stories fully covered by the foundation marked done with a comment naming the spec; partially covered stories keep backlog with a comment listing what remains.
- A final summary table (piece → spec → files → consuming stories) appended to this plan before the PR to `main`.

## Built so far (2026-10-14)

Specs 7.0a, 7.0b-1, 7.0b-2, 7.0c-1 and F1 are done. `epics.md` carries dated *Foundation 2026-10-14* lines on every consuming story (F1 lines also name the story's own area files), the context files (`epic-1`, `epic-7`…`epic-10`) have a "Foundation already built" section, and `sprint-status.yaml` marks Stories 1.1–1.7 done.

| Piece | Spec | Files / exports | Consuming stories (A = Epics 1–6, B = Epics 7–10) |
|---|---|---|---|
| Env, environment map, app env | 7.0a | `lib/server/env.ts`, `lib/shared/environments.ts`, `lib/shared/app-env.ts` (`isLocalDev`, `isProductionBuild`) | A: 1.1, 1.16, 4.3 · B: 7.2, 7.3, 10.2 |
| Security headers, lint bans, test tooling, CI | 7.0a (+ token check 7.0b-1) | root `proxy.ts`, `lib/server/security/headers.ts`, `eslint.config.mjs`, Vitest/MSW/Playwright/axe, `ci.yml`, `scripts/check-forbidden.sh`, `scripts/check-tokens.sh` | all |
| Launch and sealed session | 7.0a | `app/auth/page.tsx`, `features/shell/{auth-screen,launch-flow}`, `app/api/token/route.ts`, `lib/server/launch/*`, `lib/server/session/*`, `requirePageSession()`, `lib/shared/login-intent.ts` | A: 1.2 · B: 7.1, 7.3 |
| Proxy (allowlist, deny list, `profile: true`, proxy-level `ACCOUNT_DISABLED`) | 7.0a | `app/api/1h/[...path]`, `lib/server/proxy/*`, `lib/shared/bff-contract.ts` | A: 1.3, 2.x–5.x entries · B: 7.2, 7.5, 7.6, 8.2, 8.3, 9.1, 9.2, 10.1 |
| `callApi`, session events, keys, fetcher, root `SWRConfig`, `useMyself`, `logApiCall` | 7.0a | `@/lib/api` (`callApi`, `sessionEvents`, `keys`, `swrFetcher`, `logApiCall`), `features/shell/{swr-provider,use-myself,portal-url-provider}` | all |
| Token refresh | 7.0a | `/api/session/refresh`, `lib/api/refresh-coordinator.ts` | all writes |
| Logout + all-devices revoke | 7.0a | `/api/session/logout`, `lib/server/session/revoke.ts` | A: 1.7 · B: 7.1 |
| Idle logoff and activity | 7.0c-1 | `isSessionAged`, `/api/session/ping`, `lib/api/activity.ts`, `recordUserActivity`, `IdleWarning` | A: 1.6 · B: 7.1 (via `PageFrame`) |
| D13 tokens | 7.0b-1 | `app/globals.css` (`link-text`, `destructive-fill`, `primary-text`, `scrim`, `control-border`, `tooltip`) | all UI |
| Message catalog + verbatim/voice tests | 7.0b-1 | `lib/shared/messages` (split by F1) | all |
| `mapApiError(response)`, `mapFetchError` | 7.0b-1 | `lib/api/errors.ts` (v2 + split in F1) | A: 1.12, 2.2, 3.x · B: 7.1, 7.5, 7.6, 8.2, 9.2 |
| `ConfirmDialog` | 7.0b-1 | `components/ui/confirm-dialog.tsx` | A: 1.11, 1.13, 2.4, 3.4, 3.6, 5.5 · B: 8.3 |
| Read states | 7.0b-1 | `features/shell/read-state.tsx` (`LoadError`, `NoAccess`, `ReadStateFor`) | A: 1.8, 1.12 · B: 7.1, 8.1, 9.1, 10.1 (wrapped by the F3 `StateFrame`) |
| `navigate()`, `requestLeave`, exit hooks, nav types | 7.0b-2 | `features/shell/{navigate,leave,exit-hooks,nav-types}.ts` | A: 1.7, 1.8, 1.13, 1.15, 5.2 · B: 7.1, 7.3, 7.6, 9.3, 10.1, 10.3 |
| App bar, page nav, Return, tabs, `PageFrame` | 7.0b-2 | `features/shell/{app-bar,page-nav,return-link,page-tabs,page-frame}.tsx`, `components/ui/tabs.tsx` | A: 1.8 · B: 7.1, 7.2 |
| Section registry | 7.0b-2 | `features/shell/section-registry.tsx` (`useRegisterSection`, `SaveResult` with `failedParts`) | A: 1.11, 1.14, 2.2, 3.2, 3.5, 3.7, 4.1, 5.2 · B: 7.5 |
| Leave guard | 7.0b-2 | `features/shell/leave-guard.tsx` | A: 1.13, 1.14 · B: 7.1, 7.3, 7.5, 10.3 |
| Session-expired dialog | 7.0b-2 | `features/shell/session-dialog.tsx` | A: 1.7, 1.15 · B: 7.1, 8.x |
| Profile header (initials only), contact-point reads | 7.0b-2 | `features/header/*`, `lib/api/contact-points.ts`, `keys.contactPoints(type)` | A: 1.9, 3.1, 3.4, 3.5 · B: 7.1, 7.6 |
| Per-area allowlist / messages / errors files + aggregators | F1 | `lib/server/proxy/allowlist/*` (`ALLOWLIST`), `lib/shared/messages/*` (`MESSAGE_CATALOG`, `MessageKey`, `messageFor`, `formatMessage`), `lib/api/errors/*` (`ERROR_RULES`); every planned area file pre-created | all feature stories (each edits only its own area file) |
| Full `PUT v2/user/edit` schema | F1 | `allowlist/personal.ts` (`userEditBodySchema`, `RACES`, `ETHNICITIES`, `BIOLOGICAL_GENDERS`; `email`, `phoneNumber` + `phoneNumberRegion` together) | A: 2.2, 2.3 · B: 7.5, 7.6 |
| `Social Media` contact type, file download image entry | F1 | `allowlist/contacts.ts`, `allowlist/files.ts` (`v2/file/{fileId}/download`, `asImage`, `preview=true` forced) | A: 1.9, 2.1, 2.4, 3.1, 3.7 · B: 9.3 |
| `Myself` domain module | F1 | `lib/api/myself.ts` (`Myself` with every planned field, `toMyself`, `fetchMyself`, `loadMyself`, `isProctor`, `isTenantMember`) | A: 2.1–2.4 · B: 7.4–7.6, 8.1, 9.3 |
| SWR keys, revalidate helpers, fetcher registry | F1 | `lib/api/keys.ts` (`profilePictureId`, `typeKey`, `contactPoints` incl. `Social Media`, `addresses`, `insurance`, `npi`, `practiceSupport`, `orgs`; `mutateMyself`, `mutateContactPoints`), `lib/api/fetcher.ts#registerFetcher`, `primaryPhoneRegion` | A: 1.9, 1.10, 2.1, 3.x, 4.x, 5.x · B: 7.4, 7.6, 9.1, 9.3, 10.1 |
| Error mapper v2 + codes | F1 | `mapApiError(scope, response)` → `field` / `coded` results; SSN, email-in-use, contact-duplicate, MFA, NPI rows; `mappedErrorCode`; BFF `NO_LOGO`, `NO_PRACTICE`; client `FORBIDDEN`, `MFA_NOT_ENABLED`, `TOTP_ALREADY_ENABLED`, `NPI_ALREADY_REGISTERED` | A: 1.12, 2.2, 2.3, 3.2, 3.5, 3.7, 4.x, 5.x · B: 7.5, 7.6, 8.2, 8.3, 9.2, 9.3, 10.2 |
| Shared rules and formatters | F1 | `lib/shared/{person-rules,dates,phone,safe-href,telemetry,initials,section-ids}.ts` (header phone now via `formatPhoneDisplay`) | A: 1.9, 1.11, 1.14, 2.1, 2.2, 3.1–3.7, 5.2 · B: 7.4, 7.5, 7.6, 8.2, 9.3, 10.1, 10.2 |
| Ownership lint | F1 | `eslint.config.mjs` + `eslint.config.test.ts` (`updateAccount` only in `features/account`, `hooks/use-toast` only in `features/shell/toasts.ts`, no zod message literals) | A: 1.11, 1.12, 2.2 · B: 7.5, 7.6 |

**Epic 1 coverage:** 1.1–1.7 done; 1.8, 1.9, 1.11, 1.12, 1.13 partly (F1 closed its parts of 1.9, 1.11 and 1.12; none is fully covered yet) (remaining work assigned to F1/F2/F3/F4/F5 or Team A in each story's Foundation line); 1.10, 1.14, 1.15, 1.16 not built. F1–F5 rows are added to this table as each spec is committed.

## F3 split (2026-10-14)
F3 is delivered as three specs: F3-1 UI primitives and toasts → (F3-2 section edit model ∥ F3-3 states and section navigation) → F4. Story-specific variations are parameters, not decisions: cancel focus (`heading` for Profile Sections per 1.11, `edit` for 7.5), no-changes Save (`close` for 2.2, `status` "There are no changes" for 7.5), success toast text, signature fallback text ("Not provided" 2.1 / "No signature available" 9.3). Defaults chosen: toast radius per DESIGN.md token (`rounded-md`), partial toast 5 s, locked inputs `readOnly` + `aria-readonly` (focusable, with help line).
