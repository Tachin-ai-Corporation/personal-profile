# Epic 9 Context: Individual Provider Registration

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Build the "Individual Provider Registration" tab of the `/account` page (`/account?tab=provider`). It holds a single Section, "Healthcare credentials". An unregistered user searches the national NPI registry for a personal NPI (required) and a practice NPI (optional), then registers them. A registered user sees a read-only view of their credentials: the practice's support contact, their signature, and either an "already exists" notice or a "Register your practice" hand-off. The epic rebuilds the legacy `/personal-settings` provider screen with the new UI and closes legacy gaps: the old tab rendered nothing while loading, failed searches showed an empty list, and nothing checked whether an NPI was already taken. Registering is a one-time action. The app offers no way to edit or unregister.

## Stories

- Story 9.1: Registration state and NPI search
- Story 9.2: Register
- Story 9.3: Registered view

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
