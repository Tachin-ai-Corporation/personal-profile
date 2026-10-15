---
title: 'Shared foundation catalog (planning pointer)'
status: final
created: '2026-10-14'
project: personal-profile
jira: NG-9019
branch: feat/NG-9019-epic-7
authoritativeCatalog: docs/FOUNDATION.md
inputDocuments:
  - _bmad-output/implementation-artifacts/shared-foundation-plan.md
  - _bmad-output/implementation-artifacts/spec-7-0a-bff-foundation-and-tooling.md
  - _bmad-output/implementation-artifacts/spec-7-0b-1-tokens-messages-errors.md
  - _bmad-output/implementation-artifacts/spec-7-0b-2-shell-navigation.md
  - _bmad-output/implementation-artifacts/spec-7-0c-1-idle-logoff-and-activity.md
  - _bmad-output/implementation-artifacts/spec-f1-shared-contracts-and-data-layer.md
  - _bmad-output/implementation-artifacts/spec-f2-bff-extension-kit.md
  - _bmad-output/implementation-artifacts/spec-f3-1-ui-primitives-and-toasts.md
  - _bmad-output/implementation-artifacts/spec-f3-2-section-edit-model.md
  - _bmad-output/implementation-artifacts/spec-f3-3-states-and-section-navigation.md
  - _bmad-output/implementation-artifacts/spec-f4-drafts.md
  - _bmad-output/implementation-artifacts/spec-f5-1-select-date-input-popover.md
  - _bmad-output/implementation-artifacts/spec-f5-2-async-combobox.md
---

# Shared foundation catalog

**Authoritative catalog: [`docs/FOUNDATION.md`](../../docs/FOUNDATION.md).** It lists every module, component, hook and route, with its path, API, consuming stories and "do not" rules, and also holds the recipes and the story → foundation map. This file is the BMAD pointer and spec summary.

## Rules for agents and teams

1. **Check the catalog before implementing any story** (Team A, Epics 1–6 on `/`; Team B, Epics 7–10 on `/account`). Read `docs/FOUNDATION.md` and the story's *Foundation 2026-10-14* lines in `epics.md`.
2. **Never rebuild or bypass a foundation piece.** That covers transport, proxy, named ops, keys, the mapper, the catalog, Section kit, state frames, drafts, toasts and controls.
3. **If something you need is missing, extend the foundation module that owns it.** Do not create a parallel one. Add it to its area file:
   - allowlist: `lib/server/proxy/allowlist/<area>.ts`
   - copy: `lib/shared/messages/<area>.ts`
   - error rules: `lib/api/errors/<area>.ts`
   - SWR keys: `lib/api/keys.ts`
   - loaders: `registerFetcher` in `lib/api/<resource>.ts`
   - shared controls: `components/ui/*`
   - shell behaviour: `features/shell/*`

   Then add the piece to `docs/FOUNDATION.md` in the same change.
4. **Lint and gates enforce ownership:** layering, `updateAccount` only in `features/account`, toasts only through `features/shell/toasts.ts`, SWR keys only in `keys.ts`, zod messages from the catalog, semantic tokens only (`check-tokens.sh`), and no browser `fetch` to 1health.

## Specs (all done on `feat/NG-9019-epic-7`)

| Spec | Commits | Summary |
|---|---|---|
| 7.0a BFF foundation and tooling | `e6a973e` | Keeps the App Starter launch (`/auth` → `POST /api/token`, environment chosen by the key that decrypts the LPL) and seals the tokens in one `HttpOnly` cookie, `__Host-pp_s`. Adds the `/api/1h/[...path]` proxy (deny list, allowlist, `profile: true` tag, no-store, template-only logs), `callApi` (never throws, client-coordinated refresh + replay), SWR keys and fetcher, one root `SWRConfig`, `useMyself`, and logout with all-devices revoke. Also: AD-21 headers, lint layering, Vitest/MSW/Playwright/axe, CI, `check-forbidden.sh`. |
| 7.0b-1 Tokens, messages, errors | `e6a973e` | D13 tokens (`link-text`, `destructive-fill`, `primary-text`, `scrim`, `control-border`, `tooltip`) and the token gate. The message catalog with verbatim and voice tests, the first `mapApiError`, `ConfirmDialog`, and the `LoadError`/`NoAccess`/`ReadStateFor` read states. |
| 7.0b-2 Shell navigation | `e6a973e` | App bar, page nav, Return to 1health, ARIA tabs, `PageFrame`, and one `navigate()` (page, tab, portal, hand-off) with `requestLeave()` and exit hooks. Also the per-page Section registry, leave guard, session-expired dialog, and the initials-only profile header with primary contacts. |
| 7.0c-1 Idle logoff and activity | `5b72490` | 15 min idle and 8 h absolute limits, `POST /api/session/ping`, activity re-seal (`X-PP-Activity`), the `pp-activity` cross-tab channel, `IdleWarning`, and the navigation re-seal in root `proxy.ts`. |
| F1 Shared contracts and data layer | `b8e20ff` | Per-area files with aggregators for the allowlist, messages and error tables (every planned area pre-created); the complete `Myself` domain module; every SWR key, plus `mutateMyself` and `mutateContactPoints`; the full `PUT v2/user/edit` schema, `Social Media` contact type and image download entry. Error mapper v2: `mapApiError(scope, response)` → `field`/`coded` results with SSN, email-in-use, duplicate, MFA and NPI rules. Shared rules (`person-rules`, `dates`, `phone`, `safe-href`, `telemetry`, `initials`, `section-ids`) and ownership lint. |
| F2 BFF extension kit | `e72e968` | The `createNamedOp` wrapper and named ops: profile-picture-id, mfa/validate, practice-support, org-logo, Places autocomplete/details. Image download hardening (magic-byte inline, idle timeout, deny re-check), one kill-switch matcher in `proxy.ts` with the 503 disabled screen, streamed capped reads, and upload entries (picture, signature, signature version, insurance cards). |
| F3-1 UI primitives and toasts | `5b4ed14` | Tooltip + `TooltipProvider`, `DisabledAction`, `InfoIconButton`, `InlineBanner`, `StatusBadge`, busy `Button`, `FormField`/`FieldError`, restyled `Input`, `InputLocked`, the toast helpers (`toastSuccess`, `toastPartial`, `toastError` with Retry), the Select port and the `focus-ring` utility. |
| F3-2 Section edit model | `8ec3fe8` | Registry completion (`saveAll`, dirty count, invalid count, session code, draft hooks), `useSectionForm` (with `onNoChanges`, `successToast`, `cancelFocus`, `errorFields`, `describeError` options), `SectionHeader`/`SectionContainer`/`SectionFooter`, `KeyValueTable`/`KeyValueEditTable`, `runSaveSteps` (`stop`/`attemptAll`), `runSaveAll`, the leave guard on the runner, and the fixture Section page. |
| F3-3 States and Section navigation | `a95a7ec`, `b3f0801` | One `StateFrame` (skeleton variants, Section or page load-error copy, `NoAccess` levels) and the page-aware 403 owner table `forbiddenScopeFor(path, page)`. Also `SignatureThumb`, and the main 1.8B port: Section menu, Jump to, scroll-spy, deep links incl. `#signature`, and Contacts/Insurance panels. |
| F4 Drafts | `bd7aae8` | `localStorage` drafts keyed `pp:draft:v1:<environment>:<userId>:<sectionId>`: 500 ms debounce, sync flush on session expiry, `pagehide` and hidden, denylist, `baseHash`, a restore banner and conflict compare, 24 h purge, and portal-exit purge. Sections opt in through `useSectionForm` `draftFields`/`describeDraftDiff`/`dataStatus` and `SectionContainer sectionId`. |
| F5-1 Select, date input, popover | `a411145`, `18ccd2c` | `Select` with `ariaDisabled`, `helper`, `loading`, `placeholder` and `unlistedValue`; masked `DateInput` + `Calendar` (react-day-picker) with `birthDateBounds`; `Popover`; `InfoPopover` with loading, error and forbidden slots; `LinkTextButton`. |
| F5-2 Async combobox | `57d665a`, `687199e` | ARIA 1.2 `Combobox`/`useCombobox`: debounce, abort, stale discard, paging, retry, select-only or free-text, `Add "{name}"`, static options. The NPI, address, insurer and gender-identity variants are props. |

Review triage logs: commits `cfdf4ad` (F5-1) and `d40a9fc` (F5-2); for the others, see each spec's Review Triage Log. Stories 1.1–1.8 and 1.15 are covered entirely by the foundation (see `sprint-status.yaml`).
