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
