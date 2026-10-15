---
title: 'F6-3 Data layer stubs, proxy rules, test scaffolding and shared copy'
type: 'feature'
created: '2026-10-14'
status: 'in-review'
baseline_commit: '8547231'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/docs/AUTH-ARCHITECTURE.md'
  - '{project-root}/docs/api/CONVENTIONS.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-personal-profile-2026-10-13/EXPERIENCE.md'
  - '/Users/idanielgarcia/Documents/DEV/oneHealth/dev-std-ai-agents-and-skills/stacks/react/CLAUDE.md'
  - 'https://agents.1health.io/public/demo/api/agents.md (GET /v2/type/key/{key}: https://agents.1health.io/public/demo/api/v2/type/key/agents.md)'
  - 'https://agents.1health.io/public/dev/api/manifest.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A cross-team audit (Team A `/` Epics 1–6, Team B `/account` Epics 7–10) found central files both teams would append to (`lib/api/index.ts` exports and the `fetchers` object, `e2e/fixtures.ts`, the fixture gate test, `deferred-work.md`, `sprint-status.yaml`) and small shared rules nobody had built yet (the `type-key` loader, required proxy query params, the NPI-taken field rules, the PM3 "Not provided" rule, profile constants, shared action copy). Left alone, every story PR conflicts on the same lines and each team re-implements the same rule.

**Approach:** Pre-create every planned `lib/api/<resource>.ts` module and its `index.ts` export line now, build the shared `type-key` loader and the small shared rules, split the shared test fixtures per area with discovery instead of lists, and split the tracking files per team. Approved by the human in advance (2026-10-14): write the spec, then implement directly.

## Boundaries & Constraints

**Always:**
- **lib/api stubs:** one module per planned resource — Team A `personal`, `profile-picture`, `addresses`, `places`, `insurance`, `type-keys`; Team B `account`, `mfa`, `npi`, `organizations`, `practice-support` — each with a header doc (owner story/team, the endpoints it will own) and a minimal real piece where cheap (path builders, constants). One `export * from "./x"` line each in `lib/api/index.ts`, so stories never edit `index.ts`. `fetchers` is frozen: new loaders self-register with `registerFetcher` on import and are read with `useSWR(keys.x())` through the root fetcher.
- **type-key loader** (Stories 2.1, 3.1, 5.2): `registerFetcher("type-key")`, `GET v2/type/key/{Type}` for `Person`, `ContactPoint`, `Insurance` (agents.md `TypeInfo`; 1health-fe `useValueListOptions`: VALUE_LIST attribute values, `"n/a"` dropped, locale-sorted). Allowlist entries in their area files (`personal`, `contacts`, `insurance`) with tests; no query, no body. `keys.countries()` + `SWR_RESOURCES` entry (Story 4.2).
- **Proxy:** `QueryParamRule.required?: true`, checked in `validateQuery` (missing → 400 `BAD_QUERY`), with tests (Story 9.1 `entityTypeCode`, Story 7.5 `timeZone`/`locale`).
- **Errors:** 403 owner row for `health/npi/{n}/is-registered` (owner `provider`, level `tab`), documenting that Story 9.3 ignores its errors without calling `forbiddenScopeFor`. NPI-taken rules become two `field` rules (`personalNpi`, `practiceNpi`) keyed on the captured Personal/Practice text, copy verbatim from Voice and Tone in `lib/shared/messages/npi.ts`.
- **PM3:** `lib/shared/display-value.ts#isNotProvided(v)` (null, undefined, empty or whitespace string, `"n/a"` any case, `-1`, `"-1"`, empty list) + a helper joining name parts that skips not-provided ones (10.2 "middle name unless n/a"); `KeyValueTable` uses `isNotProvided`.
- **Places:** `PLACES_COUNTRIES` moves to `lib/shared/bff-contract.ts`; the server imports it from there.
- **Constants:** `lib/shared/profile-constants.ts` with `CHECKOUT_URL` (`https://learnmore.1health.io/product-checkout`, 10.1) and `INTERNAL_EMAIL_DOMAINS` (`["@1health.io", "@tachin.ai"]`, 10.1); `check-forbidden.sh` allows exactly that file for the 1health URL rule.
- **Shared copy:** generic actions both teams need go in `COMMON_MESSAGES`, verbatim from Voice and Tone where quoted there, else `// DRAFT COPY`; no duplicates across the catalog.
- **e2e:** `e2e/fixtures/` per area (`core`, `contacts`, `addresses`, `insurance`, `account`, `mfa`, `npi`, `orgs`) re-exported by `e2e/fixtures/index.ts` (existing `./fixtures` imports keep working), `mockProxy(page, glob, answer)`, `mockProfileDefaults(page)` / `mockAccountDefaults(page)` covering every planned read, and a fail-fast catch-all on `**/api/1h/**` that reports unmocked calls.
- **Unit fixtures:** `test/myself-fixture.ts` (full `Myself` wire payload builder + MSW handlers for myself and contact points). `app/test-fixtures.test.ts` discovers `app/test-fixtures/*/page.tsx` by glob.
- **Tracking:** `deferred-work.md` split into Team A / Team B / Foundation sections (content kept); a header comment in `sprint-status.yaml` says feature branches must not edit the header or `last_updated`.

**Never:**
- Touch `components/ui/*`, `features/shell/*` other than `key-value-table.tsx`, `proxy.ts` or `app/page.tsx` (specs F6-1/F6-2 run in parallel).
- Build story UI or story write calls; stubs hold only paths, constants and the shared loader.
- Lower coverage (100 % on `lib/server`, `lib/api`, `lib/shared`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Type key read | `useSWR(keys.typeKey("Person"))` | `GET /api/1h/v2/type/key/Person` → `TypeInfo` domain | 4xx/5xx → `ApiResponseError`; unknown type rejects without a request |
| Unknown type key | `GET /api/1h/v2/type/key/Organization` | proxy 404/`NOT_ALLOWED` | — |
| Required query | rule `required: true`, param missing | 400 `BAD_QUERY` | — |
| NPI taken | 400 "…chosen Practice NPI Number: 123 is already registered." on `provider` | `field practiceNpi` + `npi.practiceNpiTaken` | other scopes → generic |
| Not provided | `" N/A "`, `-1`, `"-1"`, `[]`, `""` | "Not provided" | `0`, `"0"`, `false` in rows stay values except `false` (kept as before) |
| Unmocked e2e call | page requests `/api/1h/v2/x` with no mock | test fails naming the call | — |

</frozen-after-approval>

## Code Map

- `lib/api/{index,fetcher,keys}.ts` -- exports, registry, keys.
- `lib/server/proxy/{types,match}.ts`, `allowlist/{personal,contacts,insurance}.ts` (+tests) -- required params, type-key entries.
- `lib/api/errors/{forbidden-scope,npi}.ts`, `lib/shared/messages/{common,npi}.ts` -- 403 row, NPI field rules, copy.
- `lib/shared/{display-value,profile-constants,bff-contract}.ts`, `lib/server/named-ops/places.ts`, `features/shell/key-value-table.tsx`, `scripts/check-forbidden.sh`.
- `e2e/fixtures/*`, `test/myself-fixture.ts`, `app/test-fixtures.test.ts`.
- `_bmad-output/implementation-artifacts/{deferred-work.md,sprint-status.yaml}`.

## Tasks & Acceptance

**Execution:**
- [x] lib/api stubs, `type-keys` loader, `keys.countries`, frozen `fetchers`, index lines (+tests).
- [x] Proxy `required` + type-key allowlist entries (+tests).
- [x] 403 row, NPI field rules, NPI copy (+tests).
- [x] `isNotProvided`, `joinProvided`, `KeyValueTable`; `PLACES_COUNTRIES` move; profile constants + gate.
- [x] `COMMON_MESSAGES` additions.
- [x] e2e fixtures split, `mockProxy`, defaults, catch-all; `test/myself-fixture.ts`; gate test discovery.
- [x] Tracking files split.

**Acceptance Criteria:**
- Given a new story adding `lib/api/addresses.ts` code, a loader, an e2e mock or a fixture page, then it edits no shared list (`index.ts`, `fetchers`, `e2e/fixtures/index.ts`, `app/test-fixtures.test.ts`).
- Given `pnpm lint && pnpm typecheck && pnpm vitest run --coverage && pnpm test:e2e && pnpm build && bash scripts/check-forbidden.sh`, then all pass.

## Verification

**Commands:**
- `corepack pnpm install` -- expected: OK
- `corepack pnpm lint && corepack pnpm typecheck` -- expected: clean
- `corepack pnpm vitest run --coverage` -- expected: green, thresholds met
- `PP_E2E_PORT=3220 corepack pnpm test:e2e` -- expected: green
- `corepack pnpm build && bash scripts/check-forbidden.sh` -- expected: green

## Implementation Notes

Implemented 2026-10-14 (worktree fast-forwarded from `b005536` to the stated baseline `8547231` first).

- **lib/api modules:** `personal.ts` (`PERSON_TYPE_KEY`, `PERSON_VALUE_LISTS`, `userEditPath`, `ssnExposePath`), `profile-picture.ts` (`profilePictureIdPath`, `profilePictureUploadPath`), `addresses.ts` (`ADDRESS_LIST_PAGE_SIZE`, `PINNED_COUNTRY_CODES`, `addressesListPath`, `countriesPath`), `places.ts` (`PLACES_COUNTRIES` re-export, `isPlacesCountry`, `placesAutocompletePath`, `placesDetailsPath`), `insurance.ts` (`INSURANCE_TYPE_KEY`, `INSURER_PAGE_SIZE`, `INSURANCE_CARD_RELATIONS`, `insuranceListPath`, `insuranceCardUploadPath`), `account.ts` (`ACCOUNT_LOCALE`, `timeZonePath`, `localePath`; `updateAccount` stays Story 7.5's), `mfa.ts` (enable/disable/validate paths), `npi.ts` (`NPI_PAGE_SIZE`, `NPI_SEARCH_MAX_LENGTH`, `personalNpiSearchPath`/`practiceNpiSearchPath` with the type fixed (AD-23), `userNpiPath`, `npiIsRegisteredPath(recordId)`, `registerNpiPath`), `organizations.ts` (`ORGS_PAGE_SIZE`, `organizationsPath`, `orgLogoPath`), `practice-support.ts` (`practiceSupportPath`). Each has a header naming owner team, stories and endpoints. Paths for endpoints without an allowlist entry yet are only builders; the entries still land with their stories. One `export * from "./x"` line each in `lib/api/index.ts`; `planned-modules.test.ts` fails if a module under `lib/api/` is not re-exported (except the internal `refresh-coordinator.ts`).
- **`fetchers`:** frozen (`Object.freeze`, typed readonly) with its two shell entries; documented: new reads use `useSWR(keys.x())` through the root fetcher, typed loaders are imported by name. Not removed because `features/shell/use-myself.ts` and `features/header` use it (out of bounds here).
- **`type-keys.ts`:** `TYPE_KEYS` (`Person`, `ContactPoint`, `Insurance`), `TypeInfo`/`TypeAttribute`/`TypeAttributeValue`, `toTypeInfo` (malformed attributes/values dropped, never a failed read), `valueListOptions(info, attrKey)` (VALUE_LIST only, `"n/a"` dropped via `isNotProvided`, `localeCompare` sort: 1health-fe `useValueListOptions` parity; deleted values are not filtered, as in 1health-fe), `typeKeyPath`, `fetchTypeKey`, `loadTypeKey`, `registerFetcher("type-key")` (an unknown type rejects without a request). Shape from agents.md `GET /v2/type/key/{key}` (`TypeInfo`) and 1health-fe `api.d.ts` (`AttributeInfo`, `IAttributeValue`).
- **Allowlist:** the proxy's `{name}` placeholder is numeric-only, so the type key is three literal entries, each in its own area file: `GET v2/type/key/Person` (`personal.ts`), `.../ContactPoint` (`contacts.ts`), `.../Insurance` (`insurance.ts`); no query, no body, not `profile`. Tests in `allowlist/type-keys.test.ts` (+ updated `personal.test.ts`, `contacts.test.ts` entry lists).
- **Required query params:** `QueryParamRule.required?: true`; `validateQuery` returns `null` (400 `BAD_QUERY`) when a required name is absent. A required name that is also a fixed param can never be satisfied (client values for fixed names are ignored) — tested as a misconfiguration guard. Named ops share `validateQuery`, so they get the rule too. Tests use the planned 9.1 NPI search and 7.5 time-zone shapes.
- **403 row:** `health/npi/{n}/is-registered` → `provider`/`tab` (`^health\/npi\/\d{1,19}\/is-registered$`), with the comment that Story 9.3 ignores errors of that call without calling `forbiddenScopeFor`.
- **NPI field rules:** two anchored rules on `provider` → `field personalNpi` / `practiceNpi` with `npi.personalNpiTaken` / `npi.practiceNpiTaken` (verbatim Voice and Tone). The `NPI_ALREADY_REGISTERED` derived code stays in `DerivedErrorCode`/telemetry (no rule emits it now); removing it would touch telemetry types for no gain.
- **PM3:** `lib/shared/display-value.ts`: `isNotProvided` (null, undefined, blank, `"n/a"` any case trimmed, `-1`, `"-1"`, empty array; `0`, `false`, objects are values), `providedOrNull`, `joinProvided(parts, sep)` (10.2 "middle name unless n/a"). `KeyValueTable` read values use `value === false || isNotProvided(value)`; the edit table's help/error emptiness check is unchanged. Story 7.4's birth-date-out-of-range rule stays with the story (it needs roles and today).
- **Places:** `PLACES_COUNTRIES` (+ `PlacesCountry`) in `lib/shared/bff-contract.ts`; `lib/server/named-ops/places.ts` imports it.
- **Constants:** `lib/shared/profile-constants.ts`: `CHECKOUT_URL`, `INTERNAL_EMAIL_DOMAINS` (10.1 has them, not 7.5), plus `isInternalEmail(email)` (case-insensitive, trimmed suffix, the bare domain is not internal). `check-forbidden.sh` allows exactly that file besides `environments.ts` (probe verified: another `lib/shared` file with a 1health.io URL still fails).
- **COMMON_MESSAGES added:** `close` "Close" (draft), `remove` "Remove" (verbatim), `delete` "Delete" (draft), `replace` "Replace" (verbatim), `clear` "Clear" (verbatim), `submit` "Submit" (verbatim), `back` "Back" (draft), `previous` "Previous" (draft), `next` "Next" (draft), `moreActionsFor` "More actions for {name}" (draft), `primary` "Primary" (draft), `makePrimary` "Make primary" (verbatim), `verified` "Verified" (draft), `notVerified` "Not verified" (draft), `verify` "Verify" (draft), `resendVerification` "Resend verification" (verbatim). No catalog duplicates existed to move. "Edit" stays `SECTION_MESSAGES.edit` (moving it would edit `features/shell/__fixtures__/fixture-section.tsx`, out of bounds; F6-2 may reconcile). `launch.ts` "Submit" is outside the catalog (D9 strings).
- **e2e:** `e2e/fixtures.ts` → `e2e/fixtures/core.ts` (git mv) + `contacts.ts` (`mockContacts`, now typed with Social Media), `addresses.ts` (`mockAddresses`, `mockCountries`), `insurance.ts` (`mockInsurance`), `npi.ts` (`mockUserNpi`, `mockPracticeSupport`), `orgs.ts` (`mockOrganizations`), `account.ts`/`mfa.ts` (empty, documented), `defaults.ts` (`mockProfileDefaults`, `mockAccountDefaults`), `index.ts` re-exporting all; existing `./fixtures` imports unchanged. Core adds `mockProxy(page, glob, answer | (request) => answer)` (returns the requests), `mockTypeKey`, `failOnUnmockedProxy(page)` (599 `E2E_UNMOCKED`, records `METHOD path?query`) and an extended `test` with an auto fixture that fails a test with unmocked `/api/1h` calls. The guard is opt-in (import `test` from `./fixtures`); existing specs keep `@playwright/test`. Default shapes for `user/npi` (404) and `organization/portal` (empty Spring page) are placeholders for 9.1/10.1 to confirm. `e2e/fixtures.spec.ts` covers defaults on `/`, `mockProxy` and the catch-all.
- **Unit fixture:** `test/myself-fixture.ts` (`myselfWire` with every mapped field filled, `contactPointWire`, `myselfHandlers({ myself?, contacts? })`), guarded by `lib/api/myself-fixture.test.ts` (every `Myself` field non-null).
- **Fixture gate test:** `app/test-fixtures.test.ts` discovers `app/test-fixtures/*/page.tsx` with `readdirSync` and runs the same three checks per page (force-dynamic + flag check in the source; 404 before any session check when off; renders when on, with `requirePageSession` called exactly when the page uses it). The per-fixture `vi.mock`s are gone: pages and their client trees import fine in the node project (only the gate runs; nothing renders), so F6-2's new pages need no edit.
- **Tracking:** `deferred-work.md` regrouped into Team A / Team B / Foundation sections with a tracking-rule comment (every item kept verbatim; the Places CSP bullet of the 7.0a review list became a Team A item); `sprint-status.yaml` got a header comment: feature branches don't edit the header, `last_updated` or other teams' lines.
- **Docs:** `docs/FOUNDATION.md` (F6-3 row, registry, error rules, message areas, fixtures, e2e helpers) and `docs/api/CONVENTIONS.md` step 5.
- **Verification (2026-10-14):** `corepack pnpm install` OK; `pnpm lint`, `pnpm typecheck` clean; `pnpm vitest run --coverage` 120 files / 2578 tests green, 100 % statements/branches/functions/lines; `PP_E2E_PORT=3220 pnpm test:e2e` 211 passed, 1 skipped (the existing desktop-only placement test on 360 px); `pnpm build` OK; `bash scripts/check-forbidden.sh` OK.
- **Deferred:** switching the existing specs to the fail-fast `test` (each needs its unmocked reads audited); removing `fetchers` once the shell hooks move to `useSWR(keys.x())` (shell is out of bounds here).

- **Review fixes (2026-10-14):** (1) `app/test-fixtures.test.ts` finds pages recursively (`readdirSync(…, { recursive: true })`, `page.{ts,tsx,js,jsx}`), imports them through a Vite `import.meta.glob` of the same pattern and asserts the checked set equals every page file found (and every globbed module). (2) The e2e catch-all is a `context.route` on `**/api/{1h,pp,places}/**` (popups covered; page mocks always win), tested for all three prefixes and a popup; new `mockProfilePictureId`, also called by `mockAccountDefaults` (shared header). (3) `planned-modules.test.ts`: internal modules are `*.internal.ts` (never re-exported); `refresh-coordinator.ts` stays as a frozen legacy internal name, and the 13 infrastructure modules exported by name are a frozen legacy list ("do not extend"); every other module must have exactly a `^export \* from "\./x"$` line. (4) The `index.ts` comment now says TypeScript does not report clashes (an explicit export silently shadows an `export *` name; two `export *` names become ambiguous); a test loads every lib/api module (Vite glob) and fails on one name bound to different values (identical re-exports such as `CONTACT_POINT_TYPES` are allowed). (5) `userEditPath()` moved to `lib/api/user-edit-path.internal.ts` (not re-exported); `personal.ts` and `account.ts` document the import but don't import it yet, because an unused import is a lint error — each story imports it with its first `PUT`. (6) `check-forbidden.sh` exempts only the exact `export const CHECKOUT_URL = "https://learnmore.1health.io/product-checkout"` line of `profile-constants.ts`; any other 1health URL there, a changed URL, or the line copied elsewhere fails (`scripts/check-forbidden.test.ts`, run in a scratch git repo). (7) `keys.typeKey<T extends TypeKey>` (`import type`). (8) `allowlist.test.ts`: no `required` query param is also fixed (`fixedQuery` or the forced `preview`). (9) The type-keys test and `valueListOptions` doc say "a superset of 1health-fe filtering" (`isNotProvided` also drops `"N/A"` in any case, blank and `"-1"`). (10) Decision recorded: live searches (insurer 5.2, NPI 9.1, Places 4.3) never use SWR; they load through the Combobox `load(query, page, signal)` and are never cached (NPI, PNFR1); written in `docs/FOUNDATION.md` §4.4 and the SWR keys row, and in the headers of `insurance.ts`, `npi.ts`, `places.ts`.
- **Review verification (2026-10-14):** see the Review Triage Log.

## Spec Change Log

## Review Triage Log

Review of `6aae04b` (coordinator, 2026-10-14).

- **Patched ("fix: F6-3 review findings"):** recursive fixture-page discovery with a completeness assertion; e2e catch-all on `/api/{1h,pp,places}` as a context route (popups) + `profile-picture-id` in `mockAccountDefaults`; `*.internal.ts` convention + frozen legacy lists + exact `export *` line match; `index.ts` clash comment + unique-export test; `userEditPath` → `user-edit-path.internal.ts`; `CHECKOUT_URL`-line-only forbidden-check exception + test; `keys.typeKey<T extends TypeKey>`; required-vs-fixed allowlist invariant; "superset of 1health-fe filtering" wording; live-search-without-SWR rule in FOUNDATION.md and the three module headers.
- **Deferred (`deferred-work.md`):** type-key values vs the `PUT v2/user/edit` enums as source of truth (Team A, Story 2.1); the gate test's `requirePageSession()` substring check (Foundation); the dead `NPI_ALREADY_REGISTERED` derived code (Foundation).
- **Rejected:** none.
- **Re-verified 2026-10-14:** `pnpm lint`, `pnpm typecheck` clean; `pnpm vitest run --coverage` 121 files / 2586 tests, 100 % on all four measures; `PP_E2E_PORT=3220 pnpm test:e2e` 211 passed, 1 skipped (desktop-only placement test on 360 px); `pnpm build` OK; `check-forbidden.sh` OK.
