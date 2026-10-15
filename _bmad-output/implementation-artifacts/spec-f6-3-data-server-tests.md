---
title: 'F6-3 Data layer stubs, proxy rules, test scaffolding and shared copy'
type: 'feature'
created: '2026-10-14'
status: 'in-progress'
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
- [ ] lib/api stubs, `type-keys` loader, `keys.countries`, frozen `fetchers`, index lines (+tests).
- [ ] Proxy `required` + type-key allowlist entries (+tests).
- [ ] 403 row, NPI field rules, NPI copy (+tests).
- [ ] `isNotProvided`, `joinProvided`, `KeyValueTable`; `PLACES_COUNTRIES` move; profile constants + gate.
- [ ] `COMMON_MESSAGES` additions.
- [ ] e2e fixtures split, `mockProxy`, defaults, catch-all; `test/myself-fixture.ts`; gate test discovery.
- [ ] Tracking files split.

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

## Spec Change Log

## Review Triage Log
