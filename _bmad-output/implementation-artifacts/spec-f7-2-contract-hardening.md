---
title: 'F7-2 Cross-team contract hardening'
type: 'feature'
created: '2026-10-14'
status: 'approved'
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
- [ ] Copy (labels, upload rejected).
- [ ] `PersonalInformationPayload` + type test.
- [ ] Forbidden owners + rows; upload codes, mapping, `isUploadRejected`, telemetry.
- [ ] `index.ts` `export *` switch, `contacts.ts` stub, per-module tests, generic-name rule.
- [ ] `DELETE v2/file/{fileId}` entry + `fileDeletePath` + tests.
- [ ] `entityTypeCode` lint rule, `switch-tenant` grep + tests.
- [ ] `FallbackImage` + fixture page + e2e; `orgInitials`.
- [ ] Scoped `requestLeave({ scope })` + tests.
- [ ] FOUNDATION.md, CLAUDE.md, AGENTS.md.

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
