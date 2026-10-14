---
title: 'F1 Shared contracts and data layer'
type: 'refactor'
created: '2026-10-14'
status: 'done'
baseline_commit: '5f89aef3d3a9afb0bcc60332728889d92dbb9779'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/shared-foundation-plan.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '/Users/idanielgarcia/Documents/DEV/oneHealth/dev-std-ai-agents-and-skills/stacks/react/CLAUDE.md'
  - 'https://agents.1health.io/public/demo/api/v2/user/myself/agents.md'
  - 'https://agents.1health.io/public/demo/api/v2/user/edit/agents.md'
  - 'https://agents.1health.io/public/demo/api/v2/user/contact-point/list/agents.md'
  - 'https://agents.1health.io/public/dev/api/v2/file/_fileInstanceId_/download/agents.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Every feature story of both teams (Team A Epics 1–6 on `/`, Team B Epics 7–10 on `/account`) would append to the same few files — the proxy allowlist, the message catalog, the error mapper, the fetcher/endpoint maps, the `Myself` mapper and the SWR keys — and each would add its own date, phone, person-rule and href helpers. That guarantees merge conflicts and divergent rules. The current `mapApiError(response)` shape, the 7-field `Myself` and the incomplete `PUT v2/user/edit` schema are also wrong for the stories already planned.

**Approach:** Build the F1 part of `shared-foundation-plan.md` once: split the shared registries into one file per area with an aggregator, complete the `Myself` domain module and every SWR key, finish the cross-team allowlist entries, move to the planned error-mapper shape, add the shared `lib/shared` rules/formatters, and add the lint rules that keep ownership boundaries. Facts come from the backend (`1h-ng-bo-core-be`) and the agents.md pages in `context:`.

## Boundaries & Constraints

**Always:**
- **Per-area files + aggregator, no behaviour change for existing callers:** `lib/server/proxy/allowlist/{index,core,personal,contacts,files,account}.ts` (later areas add their own file), `lib/shared/messages/{index,common,launch,shell,section,state,header,leave-guard,session,idle,person}.ts` with `MESSAGE_CATALOG` and `formatMessage` re-exported from `lib/shared/messages`, `lib/api/errors/{index,core,personal,contacts,account,mfa,npi}.ts`, a fetcher registry where each `lib/api/<resource>.ts` registers its own fetcher, and endpoints owned per module. Existing import paths (`@/lib/shared/messages`, `@/lib/api`) keep working. `messages.test.ts` reads every per-area file (verbatim/voice/uniqueness rules unchanged).
- **`lib/api/myself.ts`** absorbs `lib/api/user.ts`: maps every field Epics 2, 7, 8, 9, 10 need (id, personId?, username, firstName, middleName, lastName, namePrefix, nameSuffix, otherNames, titles (strings, may be `"n/a"`), birthDate (`YYYY-MM-DD` or null = withheld), cityOfBirth, race, ethnicity, biologicalGender, genderIdentity, sexualOrientation, socialSecurityNumber (already masked), signature `{id,name}|null`, email, phoneNumber, roles, preferredLanguage, timeZone, locale, tenants `{id,name}[]`, mfaEnabled, totpEnabled), all nullable except `id`; helpers `isProctor(roles)` (`roles` includes `"Proctor"` only) and `isTenantMember(myself, tenantId)`. `myself` has no `phoneNumberRegion`.
- **`lib/api/keys.ts`** gains every planned key (`profilePictureId`, `typeKey(type)`, `contactPoints(type)` with `ContactPointType = "Email"|"Mobile"|"Landline"|"Social Media"`, `addresses`, `insurance`, `npi`, `practiceSupport`, `orgs(name,page)`) and revalidate helpers `mutateMyself()`, `mutateContactPoints(...types)`. Keys without a fetcher yet are declared but not registered.
- **Allowlist:** `PUT v2/user/edit` body schema = full `PersonalInformationDTO` per backend limits (names/otherNames/titles ≤24, prefix/suffix ≤10, cityOfBirth/sexualOrientation/genderIdentity ≤128, race/ethnicity/biologicalGender enums, SSN `^(\d{3}-\d{2}-\d{4}|\d{9}|n/a)$`, birthDate `YYYY-MM-DD`, preferredLanguage `^[a-z]{2,3}(-[A-Za-z]{2})?$`, `email`, `phoneNumber` + `phoneNumberRegion` only together; still rejects `locale`, `username`, `enabled`, `receiveNotifications`); contact-point list `type` pattern includes `Social Media`; new `GET v2/file/{n}/download` image entry (`asImage`, `preview=true` forced, no client query). No `profile: true` on these shared entries.
- **Errors:** `mapApiError(sectionId, response)` → `forbidden | network | session | generic{message?} | field{field, messageKey} | coded{code}`; per-area tables own the exact upstream message patterns (SSN taken → `personal.ssn`; email in use → `account.primaryEmail`; MFA `MFA_NOT_ENABLED`/`TOTP_ALREADY_ENABLED`; NPI `/The chosen (Personal|Practice) NPI Number: \d+ is already registered\./` → `NPI_ALREADY_REGISTERED`; contact duplicates). `errors/*` is the only place that matches upstream message text. New codes: BFF `NO_LOGO`, `NO_PRACTICE`; client `FORBIDDEN`, `MFA_NOT_ENABLED`, `TOTP_ALREADY_ENABLED`, `NPI_ALREADY_REGISTERED`. Existing callers migrate.
- **`lib/shared`:** `person-rules.ts` (names 1–24 after trim, printable only; `birthDateAgeRange(roles)` 18–120 / 21–120 Proctor; `isBirthDateInRange(date, roles, today)`; PA4 messages in `messages/person.ts`), `dates.ts` (wire ↔ `MM/DD/YYYY`, no timezone shift, impossible dates rejected), `phone.ts#formatPhoneDisplay(value, region)` (US `+1 (415) 551-2125`, else international, libphonenumber-js) and `normalizeRegion(region)` (empty or `"n/a"` → `"us"`), applied to the header using each contact-point row's own `phoneNumberRegion`; `lib/api/contact-points.ts#primaryPhoneRegion(rows, myself)` returns the region of the Primary Mobile row (or the row whose value equals `myself.phoneNumber`), default `"us"`, `safe-href.ts` (`https:`/`mailto:`/`tel:` only), `telemetry.ts` (no-op sink; `section_save`, `save_all`, `mfa_link` typed payloads), `initials.ts` (moved from `features/header/names.ts`).
- **Lint:** `updateAccount` importable only in `features/account/**`; `@/hooks/use-toast` importable only by `features/shell/toasts.ts`; string literals as zod messages banned in `features/**/schema.ts` (messages come from the catalog).
- Tests for every new/changed module; 100% coverage kept on `lib/**`.

**Never:**
- No feature UI, no new pages, no `/api/pp/*` routes (F2), no edit-model components (F3), no single-story `profile: true` entries (each lands with its story).
- No change to observable behaviour of `/`, `/auth` or existing routes beyond the header phone formatting.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Myself full | upstream `UserDTO` with nulls and `"n/a"` | typed `Myself`, nulls preserved, `isProctor` true only for `"Proctor"` | non-object / missing `id` → unexpected-shape error |
| user/edit body | each backend limit ±1, enum outside list, `locale` present, `phoneNumberRegion` without `phoneNumber` | proxy 400 `BAD_BODY` on invalid; valid passes | — |
| File download | `GET /api/1h/v2/file/123/download?x=1` / `/abc/download` | query rejected / id rejected; valid id forces `preview=true` | — |
| Error mapping | SSN-taken message in `personal`; email-in-use in `account`; MFA texts; NPI text | `field{personal.ssn}`, `field{account.primaryEmail}`, `coded{MFA_NOT_ENABLED|TOTP_ALREADY_ENABLED}`, `coded{NPI_ALREADY_REGISTERED}` | unknown → `generic` |
| Dates | `02/30/1990`, `13/01/1990`, `1990-02-28` | invalid, invalid, `02/28/1990` | — |
| Phone | `+14155552125`,`us` / `+442071838750`,`gb` | `+1 (415) 555-2125` / international format | unparsable → raw value |

</frozen-after-approval>

## Code Map

- `lib/server/proxy/allowlist.ts` (+ importers `handler.ts`, `handler.test.ts`, `match.test.ts`) -- split into `allowlist/*`; keep `ALLOWLIST` export.
- `lib/shared/messages.ts` + `messages.test.ts` -- split; test reads every per-area file; values unique across catalog.
- `lib/api/{errors,errors-codes,fetcher,config,keys,user,contact-points,index}.ts` -- refactor per Boundaries; `errors.test.ts` ALLOWED set must include `lib/api/errors/*`.
- `lib/shared/bff-contract.ts` -- new BFF codes.
- `features/header/{names,profile-header}.tsx` -- use `lib/shared/initials`, `formatPhoneDisplay`.
- `features/shell/{page-frame,read-state}.tsx` -- migrate to the new `mapApiError(sectionId, …)` signature.
- `eslint.config.mjs` -- `no-restricted-imports` path rules with overrides; syntax ban for zod literals.
- Backend facts: `1h-ng-bo-core-be` `UserResource.java`, `UserServiceImpl.java` (L652–806 validation), `PersonalInformationDTO.java`, `OneHealthConstants.java`, `PersonConstants.java` enums, `ContactPointConstants.java`, `Messages.java`, `MfaServiceImpl.java`, `FileResource.java`.

## Tasks & Acceptance

**Execution:**
- [x] `lib/server/proxy/allowlist/*` (+tests) -- split, full `user/edit` schema, contact-point `Social Media`, file download entry.
- [x] `lib/shared/messages/*` + `messages.test.ts` -- split catalog, person messages.
- [x] `lib/api/myself.ts` (replaces `user.ts`), `keys.ts`, `fetcher.ts`, `config.ts`, `contact-points.ts`, `index.ts` (+tests) -- domain module, keys, revalidate helpers, fetcher registry.
- [x] `lib/api/errors/*`, `errors-codes.ts`, `lib/shared/bff-contract.ts` (+table tests) -- mapper v2 and codes; migrate callers.
- [x] `lib/shared/{person-rules,dates,phone,safe-href,telemetry,initials}.ts` (+tests) -- shared rules and formatters; header uses `formatPhoneDisplay`.
- [x] `eslint.config.mjs` (+ a lint fixture test) -- ownership rules.

**Acceptance Criteria:**
- Given two stories adding an allowlist entry, a message group and an error table for different areas, when both land, then they touch different files only.
- Given `pnpm lint && pnpm typecheck && pnpm vitest run --coverage && pnpm test:e2e && pnpm build && bash scripts/check-forbidden.sh`, then all pass.

## Design Notes

The backend's error body is `{message, code:int}` where `code` is the HTTP status, so named cases (SSN taken, email in use, MFA, NPI) can only be recognised by message text; AD-19 is kept by confining every such match to `lib/api/errors/*`. Contact-point facts validated 2026-10-14 against agents.md (dev/demo/prod), the backend and 1health-fe: patients create and list `Social Media` links via `POST /v2/health/contact-point` (`type:"Social Media"`, `label:"Personal"`, valid URL) and `GET v2/user/contact-point/list?type=Social Media`; any type can be Primary, but only Email/Mobile primaries drive the login and `myself.email`/`myself.phoneNumber`, and `PUT v2/user/edit` `phoneNumber` always resolves to a verified Mobile (Story 7.6 amended to Mobile-only options); `myself` has no region — it comes from the contact-point list row, default `"us"`. `GET v2/type/key/ContactPoint` can supply label lists at runtime (Team A, Story 3.1).

## Verification

**Commands:**
- `corepack pnpm lint && corepack pnpm typecheck` -- expected: clean
- `corepack pnpm vitest run --coverage` -- expected: green, 100% on `lib/**`
- `corepack pnpm test:e2e && corepack pnpm build && bash scripts/check-forbidden.sh` -- expected: green

## Implementation Notes

- **Errors:** `MappedError` adds `field{field, messageKey}` (`messageKey` is a typed `"<group>.<key>"` catalog reference, resolved with `messageFor()`) and `coded{code}`. Field names: SSN taken → `personal` / `field:"ssn"` / `person.ssnTaken`; email in use → `account` / `field:"primaryEmail"` / `account.primaryEmailInUse`; contact duplicates (`PERSON_ALREADY_HAS_CONTACT_POINT_ERROR`, `CONTACT_POINTS_DUPLICATE_FOUND`) → `phone|email|social` / `field:"value"`. Rows match only for their own scope and only on an upstream 4xx (`MfaServiceImpl` throws `IllegalStateException` → 400/409). `ErrorScope` = shell `SectionId` ∪ `authenticator|provider|organizations|page` (lib/api can't import features). `mappedErrorCode()` gives the PHI-free `section_save` code (`FORBIDDEN`, …). `NPI_ALREADY_REGISTERED` doesn't say which NPI (Story 9.2 decides the field from its own request).
- **Messages:** besides the listed area files, `contacts.ts` and `account.ts` hold the copy the error tables reference (`duplicatePhone` verbatim; `duplicateEmail`, `duplicateSocial`, `primaryEmailInUse` DRAFT COPY). `PERSON_MESSAGES.ageRange` is one `{min}`/`{max}` template matching both verbatim strings.
- **Allowlist:** `PUT v2/user/edit` lives in `allowlist/personal.ts` (shared with Team B); `account.ts` is empty until single-story entries land. `phoneNumber` and `phoneNumberRegion` must come together in both directions. File entry template is `v2/file/{fileId}/download`.
- **Keys/fetchers:** each module calls `registerFetcher(resource, loader)` at load; `@/lib/api` still exports `fetchers` (now composed in `index.ts`) and drops the `endpoints` aggregate (modules own `myselfPath()`, `contactPointsPath()`, via `proxyPath()`). `mutateMyself`/`mutateContactPoints` load SWR's global `mutate` on call, because `lib/api` is also imported by Server Components where `swr`'s `react-server` build has no `mutate`.
- **Lint:** `components/ui/toaster.tsx` (the shadcn renderer) and `hooks/use-toast.ts` itself are exempt from the `use-toast` ban; fixture test is `eslint.config.test.ts`.
- **Review fixes (2026-10-14):** every planned area file is pre-created (allowlist, messages, errors) and aggregated once; aggregator tests derive from the folders. `toMyself` reads each field on its own (only an integer `id` is required). Proxy person text fields use `lib/shared/person-rules#textIssue` (trimmed, code points, printable incl. `\p{Cf}`) and forward trimmed values; `phoneNumber` is `^\+?[0-9 ()-]{4,32}$`. Age check follows the backend's actual `OneHealthUtil.validateDate` (`today.minusYears(max) ≤ birth ≤ today.minusYears(min)`, Java `minusYears`): Feb 29 birthdays match `Period.between` (new age on Mar 1), and exactly 120 passes while 120 y 364 d is rejected, as the backend does. `SectionId` moved to `lib/shared/section-ids.ts`; telemetry payloads use closed unions and swallow sink errors. `registerFetcher` throws on a second loader for a family except under `next dev` (Fast Refresh). Every +1 number gets the `+1 (NXX) NXX-XXXX` style.
- **Header:** the only behaviour change: the primary phone is shown through `formatPhoneDisplay(value, row.phoneNumberRegion)` (e2e expectation updated).

## Spec Change Log

## Review Triage Log

Review pass 1 (2026-10-14; Blind Hunter, Edge Case Hunter, Verification Gap).

| # | Finding | Verdict | Route |
|---|---|---|---|
| 1 | Aggregators/tests still force cross-story edits (hard-coded lists) | high | patch (pre-created area files, folder-derived tests) |
| 2 | One bad optional myself field drops the whole user | medium | patch (per-field degrade) |
| 3 | Client vs proxy name length counting differ; invisible chars accepted | medium | patch (shared trim + code points, \p{Cf}) |
| 4 | `phoneNumber` unvalidated in proxy | low | patch |
| 5 | `updateAccount` lint bypassable (relative / dynamic import) | medium | patch |
| 6 | Zod-literal lint misses and false positives | medium | patch |
| 7 | Telemetry payloads accept any string; sink can throw | low | patch (literal unions, shared SectionId) |
| 8 | `field` untyped, NPI regex unanchored, missing near-miss tests | low | patch |
| 9 | Fetcher registry silent overwrite / test leakage | low | patch |
| 10 | `primaryPhoneRegion` semantics (type null, raw compare) | low | patch |
| 11 | +1 numbers formatted inconsistently | low | patch |
| 12 | Missing 120-year and Feb 29 edge tests | low | patch (backend `minusYears` semantics) |
| 13 | `URL.canParse` unsupported in older browsers | low | patch |
| 14 | Header region test can't detect a dropped region | medium | patch (national-format case) |
| 15 | Docs point to removed modules | low | patch |
| 16 | `PUT user/edit` now accepts email/phone at the BFF | low | reject (Story 7.6 requires it; AD-9 ownership enforced by lint, bypasses closed) |
| 17 | Malformed birthDate collapses to null like "withheld" | low | reject (backend always sends YYYY-MM-DD) |
| 18 | Schema lint block replaces shell exemptions in a future shell schema.ts | low | reject (no such file planned) |

