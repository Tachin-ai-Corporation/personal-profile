# Epic 7 Context: Account page and personal account settings

**Shared foundation (F1–F7) is built — before writing any code read `docs/FOUNDATION.md` (catalog: `_bmad-output/planning-artifacts/shared-foundation-catalog.md`). Use it; do not rebuild.**

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Add a second page, `/account`, reached from the app-bar "Account" item or a direct URL with a session, with three deep-linkable tabs: Personal Account, Individual Provider Registration and My Organizations. Users keep their names, birth date, Primary email and phone, language, time zone and locale correct, and a partial save names each part that wasn't saved. The epic also delivers the `/account` page that Epics 8–10 fill, its hardening (deny rows, kill switch, headers, mobile, a11y) and the session-less `/handoff/portal` route.

## Stories

- Story 7.1: Account page — route, tabs, deep links and states
- Story 7.2: Account page hardening — denies, kill switch, headers, mobile and accessibility
- Story 7.3: Portal hand-off route
- Story 7.4: View Personal account settings
- Story 7.5: Edit names, birth date and regional preferences
- Story 7.6: Switch Primary email and phone

## Requirements & Constraints

- A launch always lands on `/`, never `/account`; `/account` ignores `lpl`; no session → `/auth`. Missing/unknown/repeated `tab` opens Personal Account (URL replaced); tab changes replace and drop the hash. `#account` / `#authenticator` scroll to and focus that Section's `h2`.
- Each tab/Section loads lazily and fails alone. Non-403 failure: "Something went wrong while loading profile information" + Retry for that frame only. Upstream 403: "You don't have access to this in your current account", scoped by the 403 owner table; a proxy error is never "no access".
- Read view order: First name, Last name, Username, Password (`********`), Primary email, Primary phone, Birth date (`MM/DD/YYYY`), Preferred language, Default time zone, Preferred locale. Empty/withheld/out-of-range → "Not provided"; locale defaults to "English - United States".
- Edit: names 1–24 chars trimmed; age 18–120 (21–120 for Proctor); Username/Password locked, never sent. Options are constants: language `en`; time zones `Pacific/Honolulu`, `America/Anchorage`, `America/Los_Angeles`, `America/Denver`, `America/Chicago`, `America/New_York`; locale `en-US`. An unlisted stored value stays selected and is sent only if changed.
- Primary pickers: Verified Email rows / Verified **Mobile** rows only; phone region from the Primary Mobile row (default `"us"`). No other option → aria-disabled Select + helper linking to `/?tab=contacts#email` (`#phone`). First change shows an info notice; no confirm.
- Save: no changes → "There are no changes"; only changed fields are sent. Partial failure stays in edit with one "{Part} was not saved. {platform message}" line per part ("Account details", "Time zone", "Preferred locale"); succeeded parts become the baseline.
- WCAG 2.1 AA (axe light/dark, desktop + 360 px), 44 px targets, no horizontal scroll at 360 px, first tab content ≤ 1.5 s.

## Technical Decisions

**Foundation to reuse (do not rebuild or fork):**
- **Page:** `app/account/page.tsx` (7.1) is a server component with `dynamic = "force-dynamic"` and `requirePageSession()`, composing `PageFrame page="account"` (no `saveAllSlot`) → `AccountTabs` → `AccountPersonalPanel` with the feature stubs `AccountSettingsSection` (`features/account`), `AuthenticatorSection` (`features/mfa`), `ProviderTab` (`features/provider`), `OrganizationsTab` (`features/organizations`), exactly as `app/account.test.tsx` renders it. Keep stub exports; a Section renders `SectionLandmark` from its first render.
- **States:** `StateFrame` (`loadError: { kind: "page" }`, pass `attempt`), `forbiddenScopeFor(path, "account")` / `FORBIDDEN_SCOPE_TABLE`; `useClaimMyselfError` while a Section shows its own `myself` error; `useSectionFrame`, `useHashAnchors` with `ACCOUNT_ANCHORS`; `PAGE_TAB_PARAM` normalization is built.
- **Edit kit:** `useSectionForm` (`cancelFocus: "edit"`, `onNoChanges: "status"`, `describeError`, `draftFields`), `runSaveSteps` (`scope: "account"`, `mode: "attemptAll"`), `KeyValueTable` (`isNotProvided`), `InputLocked`, `InfoIconButton` + `Tooltip wide`, `DateInput` + `birthDateBounds`, `Select` (`unlistedValue`, `ariaDisabled`, `helper`, `loading`), `InlineBanner`, drafts via `DraftsProvider` in `PageFrame`.
- **Data:** `Myself` (`lib/api/myself.ts`) is complete — never extend it; `primaryPhoneRegion`, `formatPhoneDisplay`, `mutateMyself`, `mutateContactPoints`. `lib/api/account.ts` stub has `ACCOUNT_LOCALE`, `timeZonePath`, `localePath`; `userEditPath` in `lib/api/user-edit-path.internal.ts`; `updateAccount` (7.5/7.6) is lint-restricted to `features/account`. Mark the time-zone (and locale unless fixed) query param `required: true`. Profile constants live in `lib/shared/profile-constants.ts`; shared labels come from `FIELD_MESSAGES` (never duplicate copy); 7.6 type-tests against `PersonalInformationPayload`. To create: `lib/shared/time-zones.ts`, `toAccountView`, `lib/server/handoff.ts`.
- **Kill switch / headers:** `ACCOUNT_DISABLED` page/route switch (`killSwitchFor` in root `proxy.ts`, 503 disabled screen) and proxy-level 503 are built; `proxy.ts#isNoStorePath` adds `NO_STORE_HEADERS` to `/account` and `/handoff/**` (`Vary: Cookie` unit-asserted only; 7.2 decides on a deployment header). 7.2 adds deny/traversal rows and real-page header, mobile and axe runs.
- **Hand-off:** client `handoffHref`, `isTenantId`, `BFF_PATHS.handoffPortal` and the `navigate({ external: "handoff", href })` guard are built; 7.3 adds only the GET route (`seeOther`, `methodNotAllowed`, session-less, env from session → cookie → prod, never logs the query). Nothing references `switch-tenant` (CI grep).
- **Tests:** Team B's `accountReadHandlers` (`test/page-handlers/account.ts`) and e2e `mockAccountDefaults` (`e2e/fixtures/defaults-account.ts`) must stay complete — a story adding a read adds its default. Consumer contracts `lib/server/proxy/allowlist/user-edit.account.test.ts` and `lib/api/contact-points.contract.test.ts` freeze the Team A code we use. Header tab order via `expectHeaderTabOrder`.

**Decisions (human, override the spine):** D1/D2/D9 launch `/auth` → `/api/token` → `/`. D3/D5 no CSRF/session binding. D4 environments are constants (session → cookie → prod for session-less code). D6 no bodies in server logs. D10 never framed. D11 wordmark is plain text, not focusable. D12 Story 1.3 owns the deny list, `profile: true` tag and proxy 503; 7.2 owns page/route switch tests and Profile deny rows. D13 tokens `link-text`, `destructive-fill`, `primary-text`, `scrim`. D14 `TOKEN_EXPIRED` after one refresh + replay ends the session. D15 every `/api/token` failure clears the cookie. D16 only IdP 401 / 400 `invalid_grant` ends a refresh; other errors are 503 retryable. D17 `myself` auto-retries with backoff on 5xx/network, manual Retry after that. **The header avatar is not a button on `/account`** (only on `/`); `/account` tab order is page nav → Return → header (no avatar stop) → tabs.

**Ownership:** Team B owns `features/{account,mfa,provider,organizations}/**`, `app/account/**`, `app/account.test.tsx`, `app/handoff/**`, `test/page-handlers/account.ts`, `e2e/fixtures/{defaults-account,account,mfa,npi,orgs}.ts`, `e2e/account-*`, and area files `account`, `mfa`, `npi`, `orgs` (allowlist, errors, messages). The `personal` area (incl. `PUT v2/user/edit`) is Team A's — read only. Foundation changes (`features/shell/**`, `components/ui/*` edits, shared `lib/shared` helpers, foundation messages, `eslint.config.mjs`, `index.ts` aggregators) go in their own PR first; shared unions are add-only; no exhaustive switches over them; area-prefixed export names.

## UX & Interaction Patterns

- ≥ 768 px: app bar (Account active, `aria-current="page"`), same header as `/`, tab strip, single column. No Section menu, Jump to or Save all. < 768 px: page nav as segmented control, scrolling tab strip, 16 px gutters.
- Tabs: manual activation, arrows wrap, Home/End.
- Edit in place: focus starts on First name; Enter/Escape inert; invalid Save focuses first invalid field; success focuses `h2`; Cancel returns focus to "Edit". "About birth date" help only in edit view.
- Semantic tokens only; `scrim` for dialogs.

## Cross-Story Dependencies

- Order 7.1 → 7.2 → 7.3 → 7.4 → 7.5 → 7.6; 7.2 needs only 7.1; 7.3 is independent of 7.4–7.6; 7.6 extends the 7.5 save sequence and draft fields.
- Epics 8–10 fill the stubs 7.1 composes; Epic 10 "Enter portal" uses the 7.3 route. A Personal-information save on `/` invalidates the account draft via `baseHash`.
- Open: which portal URL opens a tenant (hand-off shape stays root until answered); the portal `openApp` deep-link name; whether tokens survive a login-email change (verify on demo).
