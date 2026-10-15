---
title: 'F2 BFF extension kit: named-op routes, image hardening, kill switches + disabled screen, uploads'
type: 'feature'
created: '2026-10-14'
status: 'done'
baseline_commit: 'b8e20ff9683d1fec6cf7bccc452c73fbd688026b'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/shared-foundation-plan.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-personal-profile-2026-10-13/ARCHITECTURE-SPINE.md'
  - '/Users/idanielgarcia/Documents/DEV/oneHealth/dev-std-ai-agents-and-skills/stacks/react/CLAUDE.md'
  - 'https://agents.1health.io/public/dev/api/v2/file/_fileInstanceId_/download/agents.md'
  - 'https://agents.1health.io/public/dev/api/manifest.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Five server routes planned across both teams (`/api/pp/profile-picture-id` 1.9, `/api/places/*` 4.3, `/api/pp/mfa/validate` 8.2, `/api/pp/practice-support` 9.3, `/api/pp/org-logo/[tenantId]` 10.2) would each re-implement session, kill-switch, caching, body and upstream rules differently. Image downloads are not sniffed or idle-timed, the deny list is not re-checked after `me` substitution, uploads (1.10, 2.4, 5.3) have no entry kind or byte-capped reader, and there is no kill switch for pages nor a disabled screen.

**Approach:** Build the F2 part of `shared-foundation-plan.md` once, following `epics.md` (AD-2, AD-13, AD-14, AD-20, AD-24, AD-25; Stories 1.9, 1.10, 1.16, 2.4, 4.3, 5.3, 7.2, 8.2, 9.3, 10.2) and the agents.md/backend facts in the Design Notes. Deliver the shared wrapper and plumbing plus the five routes' server side where the upstream contract is known; feature UIs stay with their stories.

## Boundaries & Constraints

**Always:**
- **`lib/server/named-op.ts`** wrapper with a fixed order — kill switch (`"pp"` = `PP_DISABLED`; `"account"` = `PP_DISABLED || ACCOUNT_DISABLED`) → method (others 405, explicit HEAD/OPTIONS) → session (`sessionExpiredResponse`) → query rules (default none → 400 `BAD_QUERY`) → params → JSON body (415 non-JSON, capped read, zod → 400 `BAD_BODY`) → token freshness (401 `TOKEN_EXPIRED` when `upstream: "1health"`) → `handle(ctx)`. Always no-store + nosniff, one request id, template-only log line, errors caught. `ctx.upstream.json(...)` reuses the proxy's URL builder, `fetchWithTimeout`, Bearer and `X-Request-Id`, mapping 401 → `TOKEN_EXPIRED`, 3xx → 502 `UPSTREAM_REDIRECT`, 5xx/network → 502, timeout → 504; each route decides to relay or mask 4xx. Named ops never go through the allowlist/deny list.
- **Routes (server only):** `GET /api/pp/profile-picture-id` (server-side GraphQL `Person … PersonHasProfilePictureFile` filtered by `session.userId`; `200 {fileId:number|null}`; any upstream error or GraphQL `errors` → 502); `POST /api/pp/mfa/validate` (`{code}` `^\d{6}$`, upstream `POST v2/mfa/validate?code=` , relays the boolean and 4xx, never logs the code); `GET /api/pp/practice-support` (`GET v2/user/npi` then `GET v2/tenant/sys-config?Tenant%20IDs=<id>&includeAllRelations=true`; returns only `{name?, phone?, phoneRegion?, email?}`; no practice → 404 `NO_PRACTICE`; upstream 403 → `FORBIDDEN`); `GET /api/pp/org-logo/[tenantId]` (membership via `GET v2/user/organization/portal` pages ≤5; `tenantLogo.publicUrl` origin must equal the environment's `publicFilesOrigin`; no credentials, `redirect: manual`, 5 s, 512 KB cap; PNG/JPEG/WebP by magic bytes, `inline`; every failure incl. stale token → 404 `NO_LOGO`); `POST /api/places/{autocomplete,details}` (AD-14: `PLACES_ENABLED≠1` → `200 {enabled:false}`, input 1–120, country US/CA/AU, `placeId` regex, server session token bound to `sid`, Google failure → empty / 502). Kill switch: profile-picture-id and places `"pp"`; mfa, practice-support, org-logo `"account"`.
- **`publicFilesOrigin`** in `lib/shared/environments.ts`: demo `https://bocore-public-files-demo.s3.us-west-1.amazonaws.com`, prod `https://bocore-public-files-prod.s3.us-west-1.amazonaws.com`, commented "to confirm against a live `tenantLogo.publicUrl` before Story 10.2" (a mismatch only falls back to initials).
- **Image hardening** for `asImage` entries: peek the first bytes; PNG/JPEG/BMP → `inline` with Content-Type from the bytes, otherwise `attachment; filename="file"` + `application/octet-stream`; nosniff, no-store; upstream `Set-Cookie`/`Content-Disposition`/`Content-Length` never forwarded (test). `fetchWithTimeout(url, init, {timeoutMs, bodyIdleMs})`: the 25 s deadline covers headers, then an idle timer re-armed per chunk for streamed bodies (refresh/revoke keep the total cap). Deny list re-checked on the upstream segments after owner substitution (403 `NOT_ALLOWED`).
- **Kill switches:** `lib/server/kill-switch.ts#killSwitchFor(pathname)` (segment-prefix match, trailing slash stripped): `"pp"` for `/`, `/auth`, `/account`, `/handoff`, `/api/1h`, `/api/pp`, `/api/places`, `/api/session/refresh`, `/api/session/ping`; `"account"` for `/account`, `/handoff`, `/api/pp/mfa`, `/api/pp/org-logo`, `/api/pp/practice-support`; never `/api/session/logout` or `/api/token` (the token route keeps its own launch envelope). Root `proxy.ts` applies it first: API paths → `jsonError(503,"SERVICE_DISABLED")`; page/RSC/prefetch requests → rewrite to a route handler `app/disabled/route.ts` that answers **503** HTML (static markup, inline styles from token values, no script; title/body/action from `DISABLED_MESSAGES` DRAFT COPY; "Go to 1health" link to the portal of the session environment, else `onehealth_environment` cookie, else referrer on `/auth`, else prod). AD-21 headers + no-store on every 503. Per-route checks stay as a second layer.
- **Uploads:** `AllowlistEntry.upload?: {part: "file"|"fileNewVersion", types: ("png"|"jpeg"|"bmp")[]}` with required `maxBytes` (file cap; request cap `maxBytes + 16 KiB`); `lib/server/http/read-capped.ts#readCapped(request, maxBytes)` streams with a byte counter (413 `TOO_LARGE` on overflow, declared NaN/over-cap Content-Length rejected) and replaces the buffered JSON reads in the proxy and `/api/token`; multipart validation (boundary, exactly one File part with the right name, magic bytes in `types`, else 415); upstream body rebuilt as new `FormData` with one Blob typed from the sniffed bytes and a sanitized filename. Upload entries for picture (`…/Person/{personId}/relation/PersonHasProfilePictureFile/file/upload`, `isPublic=true`, 4 MB, png/jpeg/bmp), signature (`…/PersonHasSignatureFile/file/upload`, `isPublic=false`, 1 MB, png), signature version (`v2/file/{id}/version`, `current=true`, `fileNewVersion`, 1 MB, png), insurance front/back (`…/Insurance/{id}/relation/InsuranceHas{Front,Back}SideCardFile/file/upload`, `isPublic=false`, 4 MB, png/jpeg), each in its area allowlist file.
- Tests for every module/route (incl. the Story 1.10 upload table: exact cap accepted, cap+1 rejected with header and chunked, renamed SVG/HTML/GIF, two parts, wrong part name, JSON body, PNG-only entry rejecting JPEG); 100% coverage kept on `lib/**`.

**Never:**
- No feature UI (picture upload dialog, MFA dialog, practice popover, org card, address autocomplete UI) — they belong to their stories.
- No CSRF/`X-PP-Session`/session-changed (D5). No client-side Google Maps script.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Named op disabled | `PP_DISABLED=1` / `ACCOUNT_DISABLED=1` on an `"account"` route | 503 `SERVICE_DISABLED`, no upstream | — |
| Named op bad input | query param on a no-query route / non-JSON POST / bad body | 400 `BAD_QUERY` / 415 / 400 `BAD_BODY` | no upstream call |
| MFA validate | `{code:"123456"}` / `{code:"12345"}` | upstream `?code=123456`, boolean relayed / 400 | code never logged |
| Org logo | non-member, foreign origin, SVG, > 512 KB, redirect, stale token | 404 `NO_LOGO` | — |
| Image download | PNG bytes declared `image/jpeg` / HTML bytes | `inline` `image/png` / `attachment` octet-stream | — |
| Upload | file = cap / cap+1 (header or chunked) / SVG renamed `.png` / two parts | accepted / 413 / 415 / 415 | — |
| Page disabled | `GET /` navigate with `PP_DISABLED=1` | 503 HTML disabled screen + security headers | logout still works |

</frozen-after-approval>

## Code Map

- `lib/server/proxy/{handler,forward,match,types}.ts`, `lib/server/proxy/allowlist/*` (from F1) -- upload kind, image sniffing, deny re-check, readCapped; per-area upload entries.
- `lib/server/http/{fetch-with-timeout,responses,cache-headers,guard-route,content-type}.ts` -- body idle timer; move `buildUpstreamUrl` to `http/upstream-url.ts`.
- `lib/server/session/*`, `lib/server/env.ts`, `lib/server/log.ts`, `lib/shared/bff-contract.ts` (BFF paths for pp/places; `NO_LOGO`, `NO_PRACTICE` from F1) -- reuse.
- `lib/server/launch/token-handler.ts` -- switch to `readCapped`.
- `proxy.ts` (root) -- kill switch first, then CSP/activity as today.
- `lib/shared/environments.ts`, `lib/shared/messages/*` (new `disabled.ts`) -- origins, copy.
- Main's disabled screen at `git show b005536:features/shell/disabled-screen.tsx` -- reference for copy/environment order only.

## Tasks & Acceptance

**Execution:**
- [x] `lib/server/named-op.ts` + `lib/server/http/upstream-url.ts` (+tests) -- wrapper.
- [x] `app/api/pp/{profile-picture-id,mfa/validate,practice-support,org-logo/[tenantId]}/route.ts`, `app/api/places/{autocomplete,details}/route.ts` + server modules (+tests) -- five routes.
- [x] `lib/server/proxy/forward.ts`, `handler.ts`, `http/fetch-with-timeout.ts` (+tests) -- image sniffing, idle timer, deny re-check.
- [x] `lib/server/kill-switch.ts`, `proxy.ts`, `app/disabled/route.ts`, `lib/shared/messages/disabled.ts` (+tests, e2e) -- kill switches and disabled screen.
- [x] `lib/server/http/read-capped.ts`, upload entry kind, area upload entries, `token-handler.ts` (+tests) -- uploads and capped reads.
- [x] `lib/shared/environments.ts` (+test) -- `publicFilesOrigin` values.

**Acceptance Criteria:**
- Given any of the five routes, when called without a session, with a disabled switch or with an unexpected query, then it answers 401 / 503 / 400 with no-store and makes no upstream call.
- Given `pnpm lint && pnpm typecheck && pnpm vitest run --coverage && pnpm test:e2e && pnpm build && bash scripts/check-forbidden.sh`, then all pass.

## Design Notes

Next 16 keeps a status only for responses returned directly from `proxy.ts` or a route handler (a page rewrite renders 200), hence the `app/disabled` route handler for the 503 screen. Backend facts: `profile-picture/preview` always declares `image/jpeg`, so inline is decided from bytes; GraphQL ignores `operationName`; `v2/mfa/validate` takes the code as a query param (the BFF keeps it in the client POST body and never logs it); tenant logos may be SVG (shown as initials). Backend follow-ups recorded in `deferred-work.md`: hard delete may leave private S3 objects; uploads have no server-side ownership check (our `me` substitution and id regex are the guard).

## Verification

**Commands:**
- `corepack pnpm lint && corepack pnpm typecheck` -- expected: clean
- `corepack pnpm vitest run --coverage` -- expected: green, 100% on `lib/**`
- `corepack pnpm test:e2e && corepack pnpm build && bash scripts/check-forbidden.sh` -- expected: green

## Implementation Notes

- Implemented 2026-10-14 (implementer report): `lib/server/named-op.ts` (+ `lib/server/named-ops/*` route logic, thin `app/api/pp/**` and `app/api/places/**` files), `lib/server/http/{upstream-url,read-capped}.ts`, `lib/server/proxy/upload.ts`, `lib/server/kill-switch.ts`, `lib/server/disabled-screen.ts`, `app/disabled/route.ts`, root `proxy.ts` kill switch first, `e2e/kill-switch.spec.ts` (Playwright also starts the build on ports 3101 `PP_DISABLED=1` and 3102 `ACCOUNT_DISABLED=1`).
- Choices where the spec was open: non-numeric `Content-Length` → 400 `BAD_BODY`; an upload must contain exactly one form entry (extra text field → 415); streamed proxy body idle timeout 10 s; Google calls 5 s; `profile-picture-id` keeps upstream 401 as `TOKEN_EXPIRED` and timeout as 504, other upstream errors 502; `practice-support` name = `shortOrganizationName` → `name` → `tenantName`, `{}` when sys-config has no matching tenant; Places session token derived from the session id (stable for the session); one disabled-screen copy set for both switches; `/disabled` returns 404 when no switch is on.
- Risks: RSC e2e imports a Next internal to build `_rsc`; `publicFilesOrigin` unconfirmed; `PLACES_ENABLED` not yet on anywhere (address form falls back to manual entry).
- Review fixes 2026-10-14:
  - **Body timeouts.** The streamed-body idle timer now runs only while an upstream read is pending, so a slow browser no longer aborts a healthy download. A guarded body cut off by its timer raises `UpstreamBodyTimeoutError`, which `readStreamCapped` reports as `timeout`, so named ops and Places answer 504 `UPSTREAM_TIMEOUT` (not 502) for a mid-body timeout.
  - **Places.**
    - The session token is now HMAC(`places:${sid}:${lookupId}`), with a client UUID v4 `lookupId` per lookup on both routes (added to the bff-contract request types).
    - Google failures and a missing key log a PHI-free `outcome` code via the new `ctx.setOutcome`.
    - `input` is trimmed and must keep a non-space character.
    - Match ranges outside the main text are dropped.
  - **IDs.**
    - `practice-support`: `user/npi` 404 → 404 `NO_PRACTICE` (the backend returns nulls for "no NPI", so there is no 400 case to map); a tenant id that is not a safe integer → `NO_PRACTICE`.
    - `org-logo`: skips numeric tenant ids above 2^53.
    - `profile-picture-id`: accepts a decimal-string id; a non-safe id → 502.
  - **Proxy.** `proxy.ts` picks JSON vs page from the same normalized path the matcher uses.
  - **503s.** Every `SERVICE_DISABLED` (via `jsonError`) and the disabled screen send `Retry-After: 300`.
  - **Disabled screen.** It has a `prefers-color-scheme: dark` block, synced to the `.dark` tokens by test.
  - **URLs and config.**
    - `buildUpstreamUrl` uses only the root's origin and never throws.
    - The `publicFilesOrigin` TODO references the deferred-work item.
    - The picture upload no longer accepts a client `fileName` (the name is the server-sanitized multipart name).
  - **Tests.** Added for each fix, plus `forward` trickle/stall rows and a `/api/token` `Content-Length: abc` row.


## Spec Change Log

## Review Triage Log

Review pass 1 (2026-10-14; Blind Hunter, Edge Case Hunter, Verification Gap).

| # | Finding | Verdict | Route |
|---|---|---|---|
| 1 | Idle timer measures client backpressure, not upstream silence | high | patch |
| 2 | Body-stage timeout answers 502 instead of 504 (named-op, places) | medium | patch |
| 3 | Places session token reused after details ends the session | medium | patch (per-lookup HMAC of sid + lookupId) |
| 4 | Google failures invisible in logs | medium | patch (PHI-free outcome codes) |
| 5 | Whitespace-only autocomplete input; unchecked match offsets | low | patch |
| 6 | No practice NPI → 502 instead of 404 NO_PRACTICE; unsafe tenant ids | medium | patch |
| 7 | Org-logo tenant ids > 2^53 lose precision | low | patch |
| 8 | GraphQL Long id as string → 502 | medium | patch |
| 9 | Kill switch JSON/HTML decision on raw vs normalized path | low | patch |
| 10 | No Retry-After on 503 | low | patch |
| 11 | Disabled page light-only | low | patch |
| 12 | `buildUpstreamUrl` fragile with trailing-slash apiRoot | low | patch |
| 13 | Unconfirmed publicFilesOrigin untracked in code | low | patch (TODO → deferred item) |
| 14 | Client fileName query on picture upload | low | patch (removed) |
| 15 | No forward-level idle tests; no token NaN Content-Length test | medium | patch (tests) |
| 16 | No throttle on Places autocomplete / MFA validate | medium | defer (Stories 4.3, 8.2) |
| 17 | Public picture keeps EXIF / trailing payload | medium | defer (Story 1.10) |
| 18 | Signature-version / insurance ids trusted from client | medium | defer (Stories 2.4, 5.3; backend follow-up) |
| 19 | Org-logo upstream cost per render | low | defer (Story 10.2) |
| 20 | Env failure leaves page kill switch off | low | reject (invalid env fails boot) |
| 21 | Upload buffered three times | low | reject (4 MB cap; acceptable) |

