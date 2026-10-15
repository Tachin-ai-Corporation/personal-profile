---
title: 'F7-2 Cross-team contract hardening'
type: 'feature'
created: '2026-10-14'
status: 'in-review'
baseline_commit: '7ee4ca4'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/FOUNDATION.md'
  - '{project-root}/CLAUDE.md'
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md (Stories 1.9, 1.10, 1.13, 2.1–2.4, 3.1, 4.1, 5.1–5.3, 7.2–7.6, 9.1, 10.1, 10.2)'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-personal-profile-2026-10-13/EXPERIENCE.md (Voice and Tone)'
  - '/Users/idanielgarcia/Documents/DEV/oneHealth/dev-std-ai-agents-and-skills/stacks/react/CLAUDE.md'
  - 'https://agents.1health.io/public/demo/api/agents.md (DELETE /v2/file/{fileInstanceIds}: https://agents.1health.io/public/demo/api/v2/file/agents.md)'
  - '../1health-fe/src/config/axios/apis/bocore/bocore.ts (`/file/${fileId}?hardDelete=true`)'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Team A (`/`, Epics 1–6) and Team B (`/account`, Epics 7–10) now merge in parallel. An audit found shared contracts that each team would add or change on its own: the same field labels (2.1 and 7.4), the Personal-information payload type (2.2 builds it, 7.6 type-tests it), the 403 owner union and the error-code unions, the `lib/api/index.ts` export lines and the shared `planned-modules.test.ts`, the `DELETE v2/file/{id}` entry (1.10, 2.4 and 5.3 each "add" it), the 9.1 and 7.3 lint/grep rules, the image `onError` fallback (1.9 avatar, 10.2 org logo), the org initials rule (10.1) and the scoped leave guard (1.13, 5.2). Two branches touching one of these give a textual conflict, or worse a logical one (both green alone, red after the merge: a duplicate catalog string, an ambiguous `export *`, an exhaustive `switch` missing the other team's union member).

**Approach:** Build every one of those shared pieces once, now, in the foundation, and write the ownership rules into `docs/FOUNDATION.md` §1 so later shared changes ship as their own small foundation PR. Approved by the human in advance (2026-10-14): write the spec, then implement directly.

## Boundaries & Constraints

**Always:**
- **Copy:** the field labels both Personal information (2.1/2.2) and Personal account settings (7.4/7.5) show go in `PERSON_MESSAGES` (`lib/shared/messages/person.ts`): "First name", "Last name", "Birth date" (verbatim V&T "Account settings labels"), "Middle name" (DRAFT COPY; 2.1 F1 order). The upload-rejected line both 1.10 and 5.3 show ("{file name} couldn't be used. Choose another file.", draft in both ACs) goes in `COMMON_MESSAGES` as a `{fileName}` template, DRAFT COPY.
- **Types:** `PersonalInformationPayload` (+ `PersonalInformationField`) in `lib/api/personal.ts`, written out field by field from `PersonalInformationDTO` (2.2 AC list + Story 2.3 SSN), without `email`, `phoneNumber`, `phoneNumberRegion`; no `lib/server` import. A type-level test in `lib/api/personal.test.ts` proves the three keys are absent.
- **Unions:** `ForbiddenOwner` gains `addresses` and `insurance`, each with one `/` Section-level row for its list read (`person/location/list`, `health/patient/insurance`; AD-23 names no other scope). `DerivedErrorCode` / `TelemetryErrorCode` gain `UPLOAD_TOO_LARGE` and `UPLOAD_UNSUPPORTED_MEDIA`; `classifyTransport` maps the proxy's 413 `TOO_LARGE` / 415 `UNSUPPORTED_MEDIA` to those `coded` results; `isUploadRejected(mapped)` lets a feature test it without a `switch`.
- **`lib/api/index.ts`:** every module whose whole export list is public uses one `export * from "./x"` line (`myself`, `contact-points`, `files`, `keys`, `config`, `types`, `activity`, `session-events`, `session`, `errors-codes`, `errors`); only `client`, `fetcher`, `log-api-call` stay named (they hold test seams). New stub `lib/api/contacts.ts` (Team A's Contact Point write engine, Epic 3) with its `export *` line. `planned-modules.test.ts` keeps the structural rules (one `export *` line, no internal re-export, unique names) plus a documented generic-name rule; each module's paths/constants move to that module's own `<module>.test.ts`.
- **Allowlist:** `DELETE v2/file/{fileId}` in `allowlist/files.ts`, `fixedQuery { hardDelete: "true" }`, no client query (`?hardDelete=false` still reaches upstream as `true`; any other → 400), not `profile`, no body; `fileDeletePath(fileId)` in `lib/api/files.ts` (same id rule as `fileDownloadPath`).
- **Lint/grep:** ESLint bans `entityTypeCode` (identifier, string, template, JSX) in non-test `features/provider/**` (AD-23, Story 9.1), schema files included; `check-forbidden.sh` bans `switch-tenant` in app code except `lib/server/proxy/deny-list.ts` (Story 7.3, tests excluded). Both with fixture tests.
- **UI:** `components/ui/fallback-image.tsx#FallbackImage` (`src` or nothing → `fallback`; `onError` or an already-failed image → `fallback`; a new `src` retries), unit tests with axe, fixture page `app/test-fixtures/fallback-image/page.tsx` (`PP_E2E_FIXTURES`) and an e2e spec. `orgInitials(name)` in `lib/shared/initials.ts` (10.1: first letters of the first two words, one word → its first two letters, non-letters skipped, nothing usable → "?").
- **Scoped leave guard:** `requestLeave({ scope })` (`LeaveOptions`): only that participant's dirtiness counts; Discard discards only it; Save validates and saves only it (no toast, no focus move; the participant shows its own errors); clean → `true` with no dialog. `requestLeave()` without options is unchanged, so `navigate()` and every caller keep working.
- **Docs:** FOUNDATION.md: §1 ownership rules (8 rules as given by the human), F7-2 row, catalog rows for every piece above, "(planned, Story X)" rows (image re-encode in `components/ui`, person options 2.1, contact labels 3.1, time zones 7.4, one shared throttle), §5 split into Team A / Team B tables, §6 split into Foundation / Team A / Team B. CLAUDE.md: `lib/shared` list → pointer to FOUNDATION §3.3, plus a "Team ownership" block → FOUNDATION §1. AGENTS.md: same pointers.

**Ask First:** none (pre-approved).

**Never:**
- Edit `app/home.test.tsx`, `test/*`, `e2e/fixtures/*`, `e2e/shell.spec.ts`, `.github/*` (spec F7-1 runs in parallel on those) or any `_bmad-output` file other than this spec.
- Build story UI or story calls (the delete path is a builder; no caller).
- Change the behaviour of an existing caller of `requestLeave`, `mapApiError` (other than 413/415 becoming `coded`), or the existing allowlist entries.
- Lower coverage (100 % on `lib/server`, `lib/api`, `lib/shared`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Upload too large | proxy 413 `{errorCode:"TOO_LARGE",source:"proxy"}` | `{ kind: "coded", code: "UPLOAD_TOO_LARGE" }`, telemetry code `UPLOAD_TOO_LARGE`, `isUploadRejected` true | — |
| Upload rejected type | proxy 415 `UNSUPPORTED_MEDIA` | `coded UPLOAD_UNSUPPORTED_MEDIA` | — |
| File delete | `DELETE /api/1h/v2/file/42?hardDelete=false` | upstream `DELETE …/v2/file/42?hardDelete=true` | `?x=1` → 400 `BAD_QUERY`; `/v2/file/abc` → not allowed; `GET v2/file/42` → 405 |
| 403 on addresses | `forbiddenScopeFor("/api/1h/v2/person/location/list?page=0", "profile")` | `{ owner: "addresses", level: "section" }` | on `account` → `null` |
| Scoped leave, scope clean | insurance clean, phone dirty, `requestLeave({ scope: "insurance" })` | `true`, no dialog | — |
| Scoped leave, Discard | insurance + phone dirty, scope insurance | only insurance discarded, `true` | — |
| Scoped leave, Save fails | scope participant save `{ ok:false }` | `false`, dialog closes, no toast | — |
| Image fails | `<FallbackImage src="/missing.png" fallback={tile} />` | the tile, no broken image | an image that failed before hydration also falls back |
| Org initials | `"1health Labs"`, `"Acme"`, `"  & 42 "`, `"A"` | `"HL"`, `"AC"`, `"?"`, `"A"` | — |
| entityTypeCode | `features/provider/search.ts` with `"entityTypeCode"` | lint error | `features/provider/x.test.tsx` allowed |
| switch-tenant | `lib/api/x.ts` with `v2/user/switch-tenant` | `check-forbidden.sh` exit 1 | `deny-list.ts` and tests allowed |

</frozen-after-approval>

## Code Map

- `lib/shared/messages/{person,common}.ts` -- shared labels, upload-rejected copy.
- `lib/api/{personal,files,contacts,index}.ts`, `lib/api/*.test.ts` (per module), `lib/api/planned-modules.test.ts` -- payload type, delete path, stub, exports, tests.
- `lib/api/errors/{core,forbidden-scope,index}.ts`, `lib/api/errors-codes.ts`, `lib/shared/telemetry.ts` -- unions and upload mapping.
- `lib/server/proxy/allowlist/files.ts` (+test) -- delete entry.
- `eslint.config.mjs`, `eslint.config.test.ts`, `scripts/check-forbidden.{sh,test.ts}` -- rules.
- `components/ui/fallback-image.tsx` (+test), `app/test-fixtures/fallback-image/page.tsx`, `e2e/fallback-image.spec.ts`, `lib/shared/initials.ts` (+test).
- `features/shell/{leave,leave-guard,navigate,index}.ts(x)`, `features/shell/leave-guard.test.tsx` -- scoped guard.
- `docs/FOUNDATION.md`, `CLAUDE.md`, `AGENTS.md`.

## Tasks & Acceptance

**Execution:**
- [x] Copy (labels, upload rejected).
- [x] `PersonalInformationPayload` + type test.
- [x] Forbidden owners + rows; upload codes, mapping, `isUploadRejected`, telemetry.
- [x] `index.ts` `export *` switch, `contacts.ts` stub, per-module tests, generic-name rule.
- [x] `DELETE v2/file/{fileId}` entry + `fileDeletePath` + tests.
- [x] `entityTypeCode` lint rule, `switch-tenant` grep + tests.
- [x] `FallbackImage` + fixture page + e2e; `orgInitials`.
- [x] Scoped `requestLeave({ scope })` + tests.
- [x] FOUNDATION.md, CLAUDE.md, AGENTS.md.

**Acceptance Criteria:**
- Given Story 2.1 and Story 7.4 both landing, then neither adds a "First name", "Last name" or "Birth date" catalog string.
- Given Story 7.6's type test, then it imports `PersonalInformationPayload` from `@/lib/api` without waiting for Story 2.2.
- Given Stories 1.10, 2.4 and 5.3, then none edits `allowlist/files.ts` for the delete entry and none adds an upload-rejected code.
- Given a story adding code to its own `lib/api/<module>.ts`, then it edits only that module and its own test (never `index.ts` or `planned-modules.test.ts`).
- Given `pnpm lint && pnpm typecheck && pnpm vitest run --coverage && pnpm test:e2e && pnpm build && bash scripts/check-forbidden.sh`, then all pass.

## Verification

**Commands:**
- `corepack pnpm install` -- expected: OK
- `corepack pnpm lint && corepack pnpm typecheck` -- expected: clean
- `corepack pnpm vitest run --coverage` -- expected: green, thresholds met
- `PP_E2E_PORT=3240 corepack pnpm test:e2e` -- expected: green
- `corepack pnpm build && bash scripts/check-forbidden.sh` -- expected: green

## Implementation Notes

Implemented 2026-10-14 on baseline `7ee4ca4` (the worktree was reset from `b005536` first).

- **Copy:** `PERSON_MESSAGES.firstNameLabel` "First name", `lastNameLabel` "Last name", `birthDateLabel` "Birth date" (verbatim V&T "Account settings labels"; `messages.test.ts` asserts them), `middleNameLabel` "Middle name" (DRAFT COPY). 2.1 and 7.4 share no other label: Account's other labels (Username, Password, Primary email/phone, language, time zone, locale) and Personal's others (prefix, suffix, other names, titles, city of birth, race, ethnicity, genders, SSN) are each one team's; "Signature" already existed in `SHELL_MESSAGES`. `COMMON_MESSAGES.uploadRejected` "{fileName} couldn't be used. Choose another file." (DRAFT COPY, the line of 1.10 for 413/415 and of 5.3).
- **Payload type:** `PersonalInformationPayload` (15 optional readonly string fields: the 2.2 `PersonalInformationDTO` list + `socialSecurityNumber`) and `PersonalInformationField`; strings because the proxy's `userEditBodySchema` accepts only strings. `lib/api/personal.test.ts` proves the key set with `expectTypeOf` and a `@ts-expect-error` on `email` (typecheck-enforced).
- **403 owners:** `addresses` (`person/location/list`) and `insurance` (`health/patient/insurance`), both `/` only, `section` level (AD-23 names no wider scope; the paths are the ones `addresses.ts`/`insurance.ts` already build). Table order test and no-owner rows updated.
- **Upload codes:** `DerivedErrorCode` and `TelemetryErrorCode` + `UPLOAD_TOO_LARGE`, `UPLOAD_UNSUPPORTED_MEDIA`; `classifyTransport` maps the BFF `TOO_LARGE`/`UNSUPPORTED_MEDIA` codes to `coded` (before the generic proxy branch); `isUploadRejected(mapped)` exported. Existing UI treats `coded` like generic, so no caller changes. Decision: mapped on every request (the mapper has no path); a JSON 413/415 is a client bug, documented in FOUNDATION §6.
- **`lib/api/index.ts`:** `export *` for `activity`, `types`, `errors-codes`, `errors`, `files`, `session-events`, `keys`, `config`, `myself`, `contact-points`, `session` (all their exports were already public, so the public surface only gains `fileDeletePath`, `isUploadRejected` and the new types); named exports kept only for `client` (`ApiClientDeps`), `fetcher` (`unregisterFetcher`) and `log-api-call` (`bodyForLog`), a frozen list. `CONTACT_POINT_TYPES`/`ContactPointType` reach the index from both `keys` and `contact-points` as the same binding (no TS ambiguity; the unique-value test allows identical bindings). New `lib/api/contacts.ts` stub (`export {}`, header: Epic 3 write engine, reads stay in `contact-points.ts`, `contact` prefix) with `contacts.test.ts`.
- **Tests split:** `planned-modules.test.ts` keeps only structure (one `export *` line per module except the frozen named three and internals, no internal re-export, unique value names, generic-name rule, frozen `fetchers`). Each module's paths/constants moved to `{personal,profile-picture,contacts,addresses,places,insurance,account,mfa,npi,organizations,practice-support}.test.ts`, `userEditPath` to `user-edit-path.internal.test.ts`. Generic-name rule: a name whose camel/snake words are all in a small generic vocabulary (verbs like load/fetch/save/to, nouns like list/path/page/size/view/payload) fails; frozen legacy exceptions `keys`, `mapFetchError`, `parseErrorBody`, `valueListOptions`; the rule has its own example table.
- **Allowlist:** `DELETE v2/file/{fileId}`, `fixedQuery { hardDelete: "true" }` in `allowlist/files.ts` (agents.md `DELETE /v2/file/{fileInstanceIds}`, `hardDelete` boolean default false; 1health-fe `bocore.ts` sends `/file/${fileId}?hardDelete=true`). One numeric id only (a comma list is refused by `{fileId}`), not `profile`, no body. Tests: forced `true`, client `false` ignored, other query 400, bad id / list / `me` not allowed, GET/PUT 405. `fileDeletePath(id)` (same `isFileId` rule, no query) in `lib/api/files.ts`.
- **Lint/grep:** ESLint `no-restricted-syntax` selectors (Identifier, JSXIdentifier, Literal, TemplateElement, JSXText containing `entityTypeCode`) on non-test `features/provider/**`, plus a `features/provider/**/schema.ts` block that keeps the zod-literal bans (later blocks replace earlier ones); fixtures in `eslint.config.test.ts`. `check-forbidden.sh` rule 6: `switch-tenant` in app code (tests excluded) except `lib/server/proxy/deny-list.ts`; scratch-repo tests in `scripts/check-forbidden.test.ts`.
- **FallbackImage:** `components/ui/fallback-image.tsx` (empty `src` → fallback; `onError` or a `complete` image with `naturalWidth === 0` at attach → fallback, `onFallback` once; keyed by `src` so a new one retries; `alt` required; `next/image` lint exception as in `SignatureThumb`). Unit tests incl. axe; fixture page `app/test-fixtures/fallback-image/page.tsx` renders inline (no new `features/shell/__fixtures__` file) with `/1h-icon.png` and a 404 path; `e2e/fallback-image.spec.ts` (behaviour + axe light/dark, desktop and 360 px). `SignatureThumb` is unchanged (it adds a skeleton and fixed size; not refactored to avoid shell churn).
- **orgInitials:** words split on whitespace, letters by `\p{L}` (code-point aware), words without letters dropped; two words → first letter of each, one word → first two letters, none → `NO_ORG_INITIALS` "?"; uppercase.
- **Scoped leave:** `LeaveOptions { scope?: SectionId }`, `requestLeave(options?)` / `LeaveGuard = (options?) => Promise<boolean>`; `LeaveGuard` filters through a scoped registry view (`getDirty` filtered by id) for the open check, Discard and `runSaveAll`, so validation/save order logic is reused; a scoped failure skips the partial toast and the heading focus. `navigate()` and every existing caller call it without options (behaviour unchanged; doc line added). `LeaveOptions` exported from `features/shell/index.ts`. Seven new cases in `leave-guard.test.tsx`.
- **Docs:** FOUNDATION.md §1 "Team ownership and shared changes" (8 rules; ownership map with per-area files; Team A owns the `personal` area files and `messages/header.ts`, Team B reads them), F7-2 row, catalog rows (allowlist, registry, Files, Personal payload, mapper, 403 table, codes, telemetry, initials, message areas, navigation, leave guard, `FallbackImage`, fixture pages, gates, ownership lint), planned rows (person options 2.1, contact labels 3.1, time zones 7.4, `lib/server/throttle.ts` 4.3/8.2, `components/ui/image-reencode.ts` 1.10), §5 split into Team A / Team B tables with F7-2 pieces, §6 split Foundation / Team A / Team B (+ file-delete trust and 413/415 notes). "How to extend" marks new 403 rows and derived codes as foundation PRs. CLAUDE.md: `lib/shared` list → FOUNDATION §3.3 pointer, "Team ownership" block; AGENTS.md: same pointers; both say F1–F7. `docs/api/CONVENTIONS.md` step 5 updated.
- **Not touched:** `app/home.test.tsx`, `test/*`, `e2e/fixtures/*`, `e2e/shell.spec.ts`, `.github/*`, other `_bmad-output` files.
- **Verification (2026-10-14):** `corepack pnpm install` OK; `pnpm lint`, `pnpm typecheck` clean; `pnpm vitest run --coverage` 144 files / 2976 tests green, 100 % statements/branches/functions/lines; `PP_E2E_PORT=3240 pnpm test:e2e` 264 passed, 2 skipped (the existing desktop-only InfoPopover placement and row-hover tests on 360 px); `pnpm build` OK; `bash scripts/check-forbidden.sh` OK.

## Spec Change Log

- Review (coordinator, 2026-10-14): the generic `DELETE v2/file/{fileId}` proxy entry is replaced by the ownership-checked named op `DELETE /api/pp/file/{fileId}` (the backend's `FileServiceImpl.checkIfTheIdsAreLegal` checks only the tenant). The Boundaries line "Allowlist: `DELETE v2/file/{fileId}` …" and the matrix row "File delete" are superseded by Review fixes 1.

## Review Triage Log

Review of `0daf206` (coordinator, 2026-10-14; integrated with F7-1 on `feat/NG-9019-epic-7`).

- **Patched ("fix: F7-2 review findings"):**
  1. *Security (high):* tenant-wide hard delete through the generic proxy entry → removed; named op + deny rule (Review fixes 1).
  2. `FallbackImage` `fallbackWhileLoading` + accessible-name contract for the fallback (Review fixes 2).
  3. Upload structural multipart errors → 400 `BAD_BODY`, 415 only for media type / bytes (Review fixes 3).
  4. `entityTypeCode` lint and `switch-tenant` grep made case- and spelling-insensitive (Review fixes 4).
  5. Dev warning for `requestLeave({ scope })` with an unregistered scope (Review fixes 5).
  6. `planned-modules.test.ts` clash scan: internals excluded, equal primitives declared twice flagged (Review fixes 6).
  7. Shared field labels moved out of Team A's `messages/person.ts` into foundation `messages/fields.ts` (Review fixes 7).
  8. Story 1.9's `GET v2/user/profile-picture/preview` entry + path builder pre-added; stale "(Story 1.10)" delete comment fixed (Review fixes 8).
- **Deferred:** none new. Doc lines for `docs/FOUNDATION.md`, `CLAUDE.md` and `deferred-work.md` are handed to the integrator (not edited here: the F7-1 agent edits those files in parallel).
- **Rejected:** none. One reading recorded: a non-`multipart/form-data` body (JSON, none, `multipart/mixed`) stays 415 (a wrong media type, not a malformed multipart); everything malformed inside `multipart/form-data` is 400.

## Review fixes

Applied 2026-10-14 on `0daf206` (the worktree was reset to it first).

1. **File delete named op.** `lib/server/named-ops/file-delete.ts#createFileDeleteHandler` + `app/api/pp/file/[fileId]/route.ts` (every method exported; force-dynamic): kill switch `"pp"`, `DELETE` only (405 otherwise), session, request id, no-store/nosniff via `createNamedOp` (`NamedOpMethod` gains `"DELETE"`, used for the op and its upstream calls). `BFF_PATHS.fileDeletePrefix` `/api/pp/file/`, new BFF code `NO_FILE`. Ownership, with the session's token, stopping at the first match: (a) `GET v2/user/myself` → `signature.id` (`OneHealthUserDTO.signature` is an `IdNameDTO`, as `lib/api/myself.ts` maps it); (b) the `profile-picture-id` GraphQL document (`profilePictureRequest(userId)`, every `PersonHasProfilePictureFile` relation id via the new `pictureFileIds`); (c) `GET v2/health/patient/insurance?page=N&size=100` (`PageImpl<ResponseInsuranceDTO>`, `frontSideCardFile.id` / `backSideCardFile.id`, `PublicFileDTO`; agents.md + backend DTO + 1health-fe `api.d.ts`), pages until `last`, at most 5 (beyond → fail closed). Only then `DELETE v2/file/{id}?hardDelete=true` → 204; an upstream 4xx is relayed, 5xx → 502. Not owned, or a malformed id (`0`, `abc`, `1,2`, > 2^53) → 404 `NO_FILE` (same answer, no oracle; a bad id makes no upstream call). A failed or unusable lookup fails closed with nothing deleted: 401 → `TOKEN_EXPIRED` (client refresh + replay), 403/other 4xx/5xx/bad shape → 502 `UPSTREAM_ERROR`, timeout → 504; the log line carries `outcome` `not_owned` / `ownership_lookup_failed`. The proxy: the `files.ts` delete entry is gone and `deny-list.ts` adds `DELETE v2/file/**` (so a later allowlist mistake can't reopen it; the `handler.test.ts` fixedQuery fixture moved to `v2/fixture/{id}`). `lib/api/files.ts#fileDeletePath` → `/api/pp/file/{id}`. Tests: `file-delete.test.ts` (owned signature after one read, owned picture with the session Bearer, owned card on page 2, foreign ids, malformed ids, eleven fail-closed cases, page cap, delete relays, session/method/kill switch), `route.test.ts`, deny and allowlist rows.
2. **FallbackImage:** `fallbackWhileLoading` (fallback rendered and the `<img>` `hidden` until `load`; an error keeps only the fallback; an image already loaded before hydration shows at once; a caller's `hidden` is kept). The `fallback` doc now requires the same accessible name as `alt` (`role="img"` + `aria-label`, or `aria-hidden` for `alt=""`); the fixture page follows it and adds a `fallbackWhileLoading` case (the e2e spec is unchanged: e2e/** is out of bounds this round).
3. **Uploads:** `readUpload` → 415 only when the Content-Type isn't `multipart/form-data` or the file's bytes aren't an accepted image; 400 `BAD_BODY` for `multipart/form-data` without a boundary, an unparsable body, not exactly one entry, a wrong part name or a text field. `upload.test.ts` and `handler.test.ts` rows split accordingly. The client mapping (413/415 → `isUploadRejected`) is unchanged; a 400 is generic (a client bug).
4. **Lint/grep:** ESLint selectors use `/entity_?type_?code/i` (`entity_type_code`, `ENTITY_TYPE_CODE`, `EntityTypeCode` rows added); `check-forbidden.sh` rule 6 uses the ERE `[Ss][Ww][Ii][Tt][Cc][Hh][-_]?[Tt][Ee][Nn][Aa][Nn][Tt]` (the shared `grep -E` helper has no `-i`), deny-list exemption and test exclusion kept; spelling rows added.
5. **Scoped leave:** `LeaveGuard` warns (`console.warn`, outside production builds) when `requestLeave({ scope })` names an id with no registered participant; behaviour unchanged (resolves `true`). Two tests.
6. **planned-modules.test.ts:** scans only public modules (`*.internal.ts` and the legacy internal excluded); `findClashes` allows a duplicate name only as an identity re-export (every holder but one lists it in an `export { … }` and the value is `===`), so two equal primitives declared twice are flagged; five synthetic cases test it. Generic-name rule also on public modules only.
7. **Labels:** `lib/shared/messages/fields.ts` (`FIELD_MESSAGES.firstName`, `middleName` (DRAFT COPY), `lastName`, `birthDate`), aggregated as `MESSAGE_CATALOG.fields` (`MessageKey` `"fields.firstName"`); removed from `PERSON_MESSAGES`.
8. **Story 1.9 picture:** `GET v2/user/profile-picture/preview` (`asImage`, only `v` `^\d{1,19}$`, agents.md: no upstream params) in `allowlist/files.ts` + tests; `profilePicturePreviewPath(fileId)` (`…/preview?v={id}`, `null` without an id) in `lib/api/profile-picture.ts` + test; its header now points the 1.10 delete at `fileDeletePath` / the named op.

- **Not touched:** `docs/FOUNDATION.md`, `CLAUDE.md`, `AGENTS.md`, `e2e/**`, `test/**`, other `_bmad-output` files.
- **Review verification (2026-10-14):** `corepack pnpm install` OK; `pnpm lint`, `pnpm typecheck` clean; `pnpm vitest run --coverage` 157 files / 3110 tests green, 100 % statements/branches/functions/lines; `PP_E2E_PORT=3240 pnpm test:e2e` 272 passed, 2 skipped (the existing desktop-only InfoPopover placement and row-hover tests on 360 px); `pnpm build` OK (`/api/pp/file/[fileId]` listed); `bash scripts/check-forbidden.sh` OK.
