---
title: 'F2 BFF extension kit: named-op routes, image hardening, kill switches + disabled screen, uploads'
type: 'feature'
created: '2026-10-14'
status: 'draft'
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
- [ ] `lib/server/named-op.ts` + `lib/server/http/upstream-url.ts` (+tests) -- wrapper.
- [ ] `app/api/pp/{profile-picture-id,mfa/validate,practice-support,org-logo/[tenantId]}/route.ts`, `app/api/places/{autocomplete,details}/route.ts` + server modules (+tests) -- five routes.
- [ ] `lib/server/proxy/forward.ts`, `handler.ts`, `http/fetch-with-timeout.ts` (+tests) -- image sniffing, idle timer, deny re-check.
- [ ] `lib/server/kill-switch.ts`, `proxy.ts`, `app/disabled/route.ts`, `lib/shared/messages/disabled.ts` (+tests, e2e) -- kill switches and disabled screen.
- [ ] `lib/server/http/read-capped.ts`, upload entry kind, area upload entries, `token-handler.ts` (+tests) -- uploads and capped reads.
- [ ] `lib/shared/environments.ts` (+test) -- `publicFilesOrigin` values.

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

## Spec Change Log

## Review Triage Log
