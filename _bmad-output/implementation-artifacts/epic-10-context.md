# Epic 10 Context: My Organizations

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Build the **My Organizations** tab of the `/account` page (`/account?tab=organizations`, Jira NG-9019, sub-tasks NG-9042 to NG-9044). Users can search and page through the 1health organizations they belong to. They recognize each one by logo, name and organization types, can check its primary contact, and use "Enter portal" to open the 1health portal in that organization's context, in the same tab, without losing unsaved work. The epic replaces legacy behavior that had bugs: Population Health crashed the card, the empty state used a `user.tenants.length <= 1` shortcut, and logos were fetched directly. The replacements are a security-hardened logo route and a session-less portal hand-off. **Project note:** Epic 1 (foundation) is not implemented yet. Epic 7 is being built first and creates the minimal foundation this epic needs (see the last section).

## Stories

- Story 10.1: List, search and pagination of my organizations
- Story 10.2: Organization card (logo, name, types and primary contact)
- Story 10.3: Enter portal

## Foundation already built (2026-10-14)

Built on `feat/NG-9019-epic-7` by specs 7.0a, 7.0b-1, 7.0b-2 and 7.0c-1 (all `done`). Use these pieces; do not rebuild or fork them. The rest of the shared foundation comes from F1–F5 (`shared-foundation-plan.md`) before feature work by either team.

| Piece | Spec | Paths and public API |
|---|---|---|
| Env, environment map, app env | 7.0a | `lib/server/env.ts` (named vars, `IS_LOCAL_DEV`, `DEFAULT_TENANT_ID`, `getSecretKey`, `getAppId`, `PP_DISABLED`, `ACCOUNT_DISABLED`, `PP_E2E_FIXTURES`); `lib/shared/environments.ts` (`apiRoot`, `apiBase`, `portalUrl`, `publicFilesOrigin`); `lib/shared/app-env.ts` (`isLocalDev`, `isProductionBuild`) |
| Security headers, lint, tooling, CI | 7.0a, 7.0b-1 | root `proxy.ts` + `lib/server/security/headers.ts` (nonce CSP, AD-21); ESLint layering and AD-26 navigation bans; Vitest 5 + MSW 3 + Playwright + `@axe-core/playwright`; `.github/workflows/ci.yml`; `scripts/check-forbidden.sh`, `scripts/check-tokens.sh` |
| Server HTTP helpers | 7.0a | `lib/server/http/{responses,cache-headers,content-type,fetch-with-timeout,guard-route}.ts` (`seeOther`, `jsonError`, `methodNotAllowed`, no-store headers, 415 check, `guardRoute`); `lib/server/log.ts` |
| Launch and session | 7.0a | `/auth` (`features/shell/auth-screen.tsx`, `launch-flow.ts`), `POST /api/token` (`lib/server/launch/*`), `__Host-pp_s` (`lib/server/session/{session,types,environment-cookie,revoke}.ts`), `requirePageSession()` in `lib/server/page-session.ts` (returns `{ portalUrl, idle }`), `lib/shared/login-intent.ts` (`saveLoginIntent`, `consumeLoginIntent`, `consumeLaunchIntent`: relaunch lands only on `/`) |
| Proxy | 7.0a | `/api/1h/[...path]` (`lib/server/proxy/*`): allowlist, exact deny list, normalization, `me` owner substitution, `profile: true` tag + proxy-level `ACCOUNT_DISABLED` 503, `asImage` forces `preview=true`; `lib/shared/bff-contract.ts` (`BffErrorCode`, `BFF_PATHS`, activity headers). Entries: `GET v2/user/myself`, `GET v2/user/contact-point/list`, `PUT v2/user/edit` |
| Client transport | 7.0a | `@/lib/api`: `callApi` (never throws; `ApiResponse` with `errorCode`, `upstreamCode`, `platformMessage`, `source`), `configureApiClient`, `getPortalUrl`, `sessionEvents` (`session-expired` only), `keys` (`myself`, `contactPoints(type)`), `swrFetcher`, `logApiCall`, `startSession`/`endSession`; one root `SWRConfig` (`features/shell/swr-provider.tsx`); `useMyself`; `usePortalUrl` |
| Token refresh | 7.0a | `/api/session/refresh`, `lib/api/refresh-coordinator.ts` (single-flight + `navigator.locks`; non-GET replayed only after a proxy `TOKEN_EXPIRED`) |
| Logout | 7.0a | `/api/session/logout` (POST/GET; best-effort `logout/all-devices`; always 204) |
| Idle logoff and activity | 7.0c-1 | 15 min / 8 h limits (`isSessionAged`), `POST /api/session/ping`, proxy and page-navigation `lastSeen` re-seal, `lib/api/activity.ts` (`pp-activity`), `recordUserActivity()`, `IdleWarning` (mounted once in `PageFrame`), `IDLE_MESSAGES` |
| Design tokens | 7.0b-1 | `app/globals.css`: `link-text`, `destructive-fill`, `primary-text`, `scrim`, `control-border`, `tooltip`, `tooltip-foreground`; `Button` `touch` size and `destructive` variant; `dialog.tsx` on `bg-scrim` |
| Copy and errors | 7.0b-1 | message catalog with verbatim + voice tests (`lib/shared/messages.ts`, being split into `lib/shared/messages/*` with `MESSAGE_CATALOG` by F1); `mapApiError(response)` → `forbidden \| generic \| network \| session` and `mapFetchError` (`lib/api/errors.ts`, moving to `lib/api/errors/` in F1) |
| Confirm dialog and read states | 7.0b-1 | `components/ui/confirm-dialog.tsx` (`ConfirmDialog`: `standard \| destructive`, `extraAction`, `busy`, `cancelLabel`, `showConfirm`, `onCloseFocus`); `features/shell/read-state.tsx` (`LoadError`, `NoAccess`, `ReadStateFor`) |
| Navigation | 7.0b-2 | `features/shell/navigate.ts` (`navigate`, `useNavigate`, `CurrentPageProvider`; targets `{page,tab?,hash?}`, `{external:"portal"}`, `{external:"handoff",href}`), `features/shell/leave.ts` (`requestLeave`, `setLeaveGuard`), `features/shell/exit-hooks.ts` (`onBeforeExit`, `onBeforeSessionExpired`), `features/shell/nav-types.ts` (`ProfileTab`, `AccountTab`, `PROFILE_TABS`, `ACCOUNT_TABS`, `PAGE_PATHS`, `SectionId`, `SectionRegistration`, `SaveResult` with `failedParts`, `ValidateResult`) |
| Shell UI | 7.0b-2 | `AppBar`, `PageNav`, `ReturnLink`, `PageTabs`/`ProfileTabs` + `components/ui/tabs.tsx`, `PageFrame` (registry, leave guard, session dialog, idle warning), `useMediaQuery`/`DESKTOP_QUERY` |
| Section registry | 7.0b-2 | `features/shell/section-registry.tsx` (`SectionRegistryProvider`, `useRegisterSection`, `useSectionRegistry`, `useIsAnyDirty`; dev throw on duplicate id; `UNEXPECTED` save wrapper; `canSave: false`) |
| Leave guard and session dialog | 7.0b-2 | `LeaveGuard` (Keep editing / Discard / Save on `ConfirmDialog`, validate-first, `beforeunload` while dirty); `SessionDialog` ("Your session ended", saves the login intent) |
| Header (initials only) | 7.0b-2 | `features/header` (`ProfileHeader`, `displayName`, `initials`), `lib/api/contact-points.ts` (`fetchContactPoints`, `findPrimary`, `ContactPoint`) |

**Still to come (shared, before feature work):**
- **F1 shared contracts and data layer (in progress):** per-area allowlist/messages/errors, `lib/api/myself.ts` with every field and `isTenantMember`/`isProctor`, all SWR keys + `mutateMyself`/`mutateContactPoints`, full `PUT v2/user/edit` schema, `Social Media` contact type, new BFF codes, error mapper v2 (`mapApiError(sectionId, response)`, field maps, MFA/NPI exact-message table), `lib/shared/{person-rules,dates,phone,safe-href,telemetry,initials}.ts`, lint rules.
- **F2 BFF extension kit:** `lib/server/named-op.ts` for `/api/pp/*` and `/api/places/*`, image download hardening, one kill-switch matcher in root `proxy.ts` + disabled screen, upload entries.
- **F3 Section edit kit:** final registry contract (`saveAll?: false`, `dirtyCount`, draft contract), edit primitives, `runSaveSteps` + Save-all runner, key/value table, toasts, Tooltip/`DisabledAction`/`info-icon-button`, `InlineBanner`, `StatusBadge`, one `StateFrame` + `forbidden-scope` in shell/lib, Section menu / Jump to / scroll-spy / deep links.
- **F4 Drafts:** `features/shell/drafts.ts` (plugs into `onBeforeSessionExpired` and `onBeforeExit`).
- **F5 Shared inputs:** Select, masked date input + calendar, async Combobox, Popover + `info-popover`.

**Epic 10 status:** use `navigate({ external: "handoff", href })` with the leave guard (built), `keys.orgs` (F1), `safe-href` (F1), `/api/pp/org-logo` on the F2 named-op wrapper with image hardening, `info-popover` (F5), `StateFrame` (F3). `/handoff/portal` and `handoffHref` still come from Story 7.3. Epic 1 is no longer "not implemented".

## Requirements & Constraints

- **List:** `GET v2/user/organization/portal?name=&page=<0-based>&size=12`. Drop items whose `organization` is null. Sort the page on the client by `shortOrganizationName ?? name` (case-insensitive `localeCompare`). The pager uses the server `totalPages` as is and shows whenever there are results, even a single page.
- **Search:** server-side, debounced 500 ms, trimmed. Whitespace-only input counts as empty. Each search resets to page 0. If the trimmed text is unchanged, no new request is made. After each load, a polite live region announces "{N} organizations" ("1 organization"), where N is `totalElements`.
- **Empty rule:** the empty state shows only when page 0 with no search text has no renderable items. When search text returns zero results, show "Sorry, no results were found" with no pager.
- **Internal users:** a user is internal when the login email ends, case-insensitively, in `@1health.io` or `@tachin.ai`. A suffix check must reject `foo@1health.io.evil.com` and `foo@not1health.io`. Internal users get "Create new organization" next to search, and their "Register organization" is a portal hand-off (`to=create-org`). Regular users' "Register organization" is an external link to the checkout URL and opens in a new tab (this is the only allowed `_blank`). Keep the constants in `lib/shared/profile-constants.ts`.
- **Error states:**
  - a non-403 failure shows the inline load-error banner with a Retry that reloads only this list
  - an upstream 403 (no `source:"proxy"`) shows the tab-level no-access panel, and the other tabs keep working
  - the proxy error `NOT_ALLOWED` always shows the generic error, never "no access" (there is no `CSRF`, D5)
- **Loading:** the list loads only when the tab opens (no prefetch). The skeleton is 12 card placeholders in the current column count.
- **Types:** show at most 4 type icons, in the order Lab, Health Provider, Supplier, Go To Market, then the rest alphabetically. Show duplicates once, then a "+N" chip that lists the hidden types alphabetically ("2 more types: …"). An unknown type gets CircleHelp with the platform name and never throws. An empty array shows the n/a icon.
- **Primary contact popover:** shows the contact whose `contactTypes` include "Primary". Full name includes the middle name unless it is "n/a". Show "-" for any missing field. Build the email `mailto:` only through `safeHref()`.
- **Enter portal:** aria-disabled with the tooltip "You're disabled in this organization" when `enabledInTenant` is false. Build the href only from a numeric `tenantId` (`^\d{1,19}$`), never from `subdomain`. The app must **never** call `v2/user/switch-tenant/**`.
- **Non-functional requirements:**
  - WCAG 2.1 AA, keyboard-complete, 44 px targets, reduced motion respected
  - no horizontal scroll at 360 px
  - grid of 4 / 3 / 2 / 1 columns at ≥1280 / ≥1024 / ≥640 / below, with 16 px gaps
  - semantic tokens only; type icons and (i) use `muted-foreground`
  - every string comes verbatim from `lib/shared/messages.ts`
  - search returns within 1 s at p75
- **Tests:**
  - Vitest + MSW for logic and route rows
  - Playwright with a mocked proxy for parity checklist rows 10 to 12 and the UJ-104 journey
  - `@axe-core/playwright` in light and dark, at desktop and 360 px
  - an MSW assertion that fails if any `switch-tenant` request is made

## Technical Decisions

- **Allowlist:** add the passthrough entry `GET v2/user/organization/portal`, tagged `profile: true` so the kill switch applies. Allowed params are `name` ≤100 chars, `page` `^\d{1,4}$` and `size` ≤12. Anything else gets a 400 from the proxy and is never forwarded.
- **Client module:** `lib/api/organizations.ts#listOrganizations({name, page})` uses `callApi("organizations/list", …)`. The domain type is `{ tenantId, enabledInTenant, name, shortName, types, personContacts }`. Don't expose `subdomain` or `tenantLogo.publicUrl`. The SWR key is `keys.orgs(name, page)` = `["pp","orgs",name,page]`. `features/organizations` is the only consumer. Never use the org list for membership checks.
- **Logo named operation:** `app/api/pp/org-logo/[tenantId]/route.ts`.
  - **Access:** requires `requireSession()`. There is no `X-PP-Session` or CSRF check (D5). Exports `force-dynamic`. `ACCOUNT_DISABLED=1` returns 503 `SERVICE_DISABLED`.
  - **Membership:** the server pages the org list (size 50, at most 5 pages, stops at the match).
  - **Origin check:** `tenantLogo.publicUrl`'s origin must equal `publicFilesOrigin` for the session's environment in `lib/shared/environments.ts`. It is not an env var, because one deployment serves both demo and prod (D1, D4 in `epics.md`).
  - **Fetch:** no credentials or cookies, `redirect:"manual"` (any 3xx fails), 5 s timeout, `no-store`, and a 512 KB cap checked on both the header and the stream.
  - **Output:** only PNG, JPEG or WebP confirmed by magic bytes. `Content-Type` comes from the bytes, plus `inline`, `nosniff` and no-store headers.
  - **Failure:** every failure is 404 `{errorCode:"NO_LOGO", source:"proxy"}`, logged without the URL. Never use `v2/file/{id}/download` for logos. CSP `img-src` stays `'self' blob: data:` (D7).
- **Hand-off:** `navigate({external:"handoff", href: handoffHref({to:"tenant", tenantId})})`. The `/handoff/portal` route answers 303. It is session-less and has no side effects: no logout, drafts are kept, and there is no `window.open` or `target=_blank`. While OQ1 is open (portal URL format for a specific tenant, due 2026-10-17), the tenant URL shape defaults to the `portalUrl` root. `portalUrl` comes from `lib/shared/environments.ts`; the route takes the environment from the session if it unseals, else from the `onehealth_environment` cookie, else `prod`, and never from a URL parameter (D4). Switching to `?ctx=<id>` is a one-constant change in Epic 7's `lib/server/handoff.ts`.
- **Shared components:**
  - `info-popover` (`components/ui/info-popover.tsx`, three variants) and `safeHref()` (`lib/shared/safe-href.ts`) are created by whichever story lands first (Epic 9, Story 3.7 or Story 10.2) and reused by the others
  - `info-icon-button` comes from Story 7.5
- **Lint rule (AD-26):** raw `<a href>` or `next/link` to `/handoff/**` is banned outside `features/shell`. The checkout link is an external non-1health URL, so it is allowed.

## UX & Interaction Patterns

- **Card:** `org-card` is an `article` labeled by its name heading. It has a border, `rounded-md` corners, 16 px padding, a minimum height of 248 px and no shadow.
  - Top row: 72 px `org-logo`, or the `org-initials-tile` while the logo loads or when it fails. Initials are the first letters of the first two words. A single word gives its first two letters. If nothing usable is left, show "?".
  - The (i) button sits at the top right.
  - The name is on one line with an ellipsis, and a tooltip shows the full name.
  - Below the name are the type row and the bottom "Enter portal" button.
  - Keyboard order inside a card is (i) → type icons → "+N" → Enter portal.
- **Popover and tooltips:** the popover is non-modal and opens below its trigger, flipping above only when there is no room. It opens on hover (150 ms delay), focus or tap. Escape closes it and returns focus to the trigger. Tooltips and popovers open on tap on touch devices.
- **Page change:** scroll smoothly to the top of the grid (instant under reduced motion) and focus the first card's name (`tabIndex={-1}`).
- **Pager:** Previous and Next use `aria-disabled` at the ends. The current page has `aria-current="page"`.
- **Tab keyboard order:** search → Create new organization (internal users only) → cards row by row → pagination. Under 768 px, "Create new organization" stacks below search.
- **Empty card:** four feature rows (Lab, Healthcare, Supplier, Go To Market) with the fixed copy. No search field and no pager.
- **Open item:** the organization type icon set (lucide, with Umbrella for Insurance) still needs confirmation from the design-system owners.

## Cross-Story Dependencies

- 10.1 creates the list, the grid and a basic card. 10.2 enriches the same card with logo, types and popover. 10.3 adds Enter portal and the disabled-card state. Run them in order.
- Platform dependencies:
  - `publicFilesOrigin` must be filled in for each environment in `lib/shared/environments.ts`. Until it is, logos return 404 and cards show initials.
  - OQ1 decides the tenant hand-off URL. Until it is answered, Enter portal opens the portal root.
  - SM-104 (Enter portal opens the right tenant in 100% of runs) is verified in demo QA.

### Foundation pieces Epic 10 relies on (Epic 1 is not implemented; Epic 7 builds a minimal version)

*2026-10-14: superseded in part; see "Foundation already built" above. Rows for Stories 1.1–1.4, 1.8 (tokens, app bar), 1.13 and the `navigate()` part of 7.1 are built; `keys.orgs` and `safe-href` are F1, drafts F4, the route-level kill switch F2, `StateFrame` F3, `info-icon-button` F3, `info-popover` F5.*

Confirm that each of these exists after Epic 7 before starting Epic 10. Anything missing has to be stubbed or built minimally.

| Piece | Planned in | Used by |
|---|---|---|
| `lib/server/env.ts` exporting `ACCOUNT_DISABLED`, plus `lib/shared/environments.ts` with `portalUrl` and `publicFilesOrigin` per environment (D4; no `PORTAL_URL` or `PUBLIC_FILES_ORIGIN` env vars) | Story 1.1 | 10.2, 10.3 |
| Security headers (CSP `img-src 'self' blob: data:`, `frame-ancestors 'none'`) and the AD-26 lint rules | Stories 1.1, 7.1 | all |
| Vitest, MSW, Playwright and `@axe-core/playwright` tooling | Story 1.1 | all |
| Sealed session (with `environment`) and `requireSession()` | Story 1.2 | 10.2, 10.3 |
| BFF proxy: allowlist with param validation, exact denies (incl. `switch-tenant/**`), the 415 JSON content-type check (no CSRF or `X-PP-Session`, D5), no-store, PHI-free logging without bodies (D6) | Story 1.3 | 10.1, 10.2, 10.3 |
| `callApi` through the proxy, `lib/api/keys.ts` (`keys.orgs`), `useMyself` (login email), one root `SWRConfig` | Story 1.4 | 10.1 |
| Design tokens and the app bar | Story 1.8 | all |
| Error mapping (`errors.ts`, `upstreamCode`, `FORBIDDEN` vs. proxy `NOT_ALLOWED`) and `lib/shared/messages.ts` with the verbatim copy test | Story 1.12 | 10.1 |
| Three-way leave guard | Story 1.13 | 10.1, 10.3 |
| Drafts store (must survive the hand-off) | Story 1.15 | 10.3 |
| `/account` route, tabs and deep links; `navigate()` with `external:"handoff"`; per-tab skeleton, `inline-banner-error`, `no-access-panel` | Story 7.1 | 10.1, 10.3 |
| `profile: true` allowlist tag and proxy-level `ACCOUNT_DISABLED` 503 (Story 1.3); route-level kill switch covering `/api/pp/org-logo/**` (Story 7.2) | Stories 1.3, 7.2 | 10.1, 10.2 |
| `/handoff/portal` route (303), `buildTenantPortalUrl`, `TENANT_HANDOFF_SHAPE`, `features/shell/handoff.ts#handoffHref`, `proxy.ts` exemption for `/handoff/**` | Story 7.3 | 10.1 (create-org), 10.3 |
| `info-icon-button` | Story 7.5 | 10.2 |
| `info-popover` and `safeHref()` (or Story 10.2 creates them) | Epic 9, Story 3.7 | 10.2 |
