---
title: 'Story 1.3: Secure 1health proxy — allowlist, normalization, CSRF, no-store, logging'
type: 'feature'
created: '2026-10-13'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '86b8c6947d35c1c31f8f968740d38f51895d88bd'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-personal-profile-2026-10-13/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** After Story 1.2 a user is signed in via a sealed server cookie, but the browser has no safe way to reach 1health: there is no proxy, no allowlist, no CSRF/session-binding defence, and tokens would have to leave the server to make any call. Any ad-hoc fetch would expose the token, allow path traversal or acting on another person's record, and could cache PHI.

**Approach:** Build the single locked-down BFF proxy at `/api/1h/[...path]` — an injectable factory over an allowlist — that authenticates via the sealed cookie, canonicalizes and allowlist-matches the path, substitutes owner ids from the session, enforces CSRF + per-tab session binding, forwards only whitelisted headers with a server-added Bearer token, maps upstream outcomes to typed error codes, and marks every response no-store. It ships one allowlist entry (`GET /v2/user/myself`); later stories add entries beside the code that uses them. No token refresh (Story 1.5), no `callApi` wiring of `X-PP-Session` (Story 1.4), no feature endpoints.

## Boundaries & Constraints

**Always:**
- **Factory + allowlist.** `lib/server/proxy-allowlist.ts` defines `AllowlistEntry = { method, template, query, body, maxBytes?, asImage? }` keyed by `METHOD + template`, and the shipped allowlist with exactly one entry: `GET /v2/user/myself` (no query params, no body). `app/api/1h/[...path]/route.ts` is built by a factory `createProxy(allowlist)` so tests can inject fixture entries (e.g. `GET /v2/person/{personId}/ssn/expose`, `PUT /v2/person/location/{id}`, an entry with an allowlisted `page` query param, an entry with a server-fixed param). The route file exports `dynamic = "force-dynamic"` and wires the real allowlist.
- **Templates are relative to upstream `/api`.** Browser calls `/api/1h/<path>`; upstream URL is built as `API_ORIGIN + "/api/" + segments.map(encodeURIComponent).join("/")` (never `new URL(input, base)`), then asserted to have origin exactly `API_ORIGIN` and to re-match the same template before fetching.
- **Method handling.** `GET/POST/PUT/PATCH/DELETE` are handled; `HEAD/OPTIONS/TRACE` have explicit handlers answering 405 (so Next does not auto-implement them); an `X-HTTP-Method-Override` header is dropped and never changes the method; `_method` is treated as an unknown query param.
- **Path normalization before matching** → 400 `{ "code": "BAD_PATH" }`, no upstream call, when the raw path contains `//`, `%2F`, `%5C`, or `%25`, or any raw-or-decoded segment is empty, `.`, `..`, or contains `/ \ ; % @ :`, whitespace, or a control character.
- **Allowlist match.** No matching `METHOD + template` → 403 `{ "code": "NOT_ALLOWED" }`, no upstream. A known template with a different method → 405. `/auth/**`, `/v2/public/external-application/**`, any GraphQL path, and any admin prefix are denied (→ NOT_ALLOWED), never proxied.
- **Owner-id substitution.** In a template position `{personId}` or `{userId}`, the client must send the literal segment `me`; the proxy substitutes the id from the sealed session. Any other value in an owner position (including a numeric id equal to the user's own) → 403 `NOT_ALLOWED`. Any non-owner id segment must match `^\d{1,19}$` (else 403); literal segments compare exactly.
- **Query allowlist.** Each entry allowlists query params by name + value regex; an unknown param or a value failing its regex → 400 `{ "code": "BAD_QUERY" }`. Server-fixed params declared by an entry (e.g. `isPublic`, `hardDelete`) are set by the server and any client-sent value for them is ignored.
- **Session required.** No session cookie, or one that fails to unseal → 401 `{ "code": "SESSION_EXPIRED" }`. A session whose access token expires within 30 s, or an upstream 401, → 401 `{ "code": "TOKEN_EXPIRED" }`, with no refresh and no cookie written.
- **CSRF (`lib/server/csrf.ts`, reused by `/api/session/*`, `/api/places/*`, `/api/pp/*`).** Every non-GET must have `Sec-Fetch-Site: same-origin` (or, when `Sec-Fetch-Site` is absent, `Origin` equal to `APP_ORIGIN`) **and** `X-PP-Session`; missing either, or having neither `Sec-Fetch-Site` nor `Origin`, → 403 `{ "code": "CSRF" }`, no upstream. A JSON (`body: "json"`) entry receiving a `Content-Type` other than `application/json` → 415 `{ "code": "UNSUPPORTED_MEDIA" }`.
- **Session binding (`lib/server/session-binding.ts`).** Any request carrying `X-PP-Session` whose value does not equal `base64url(HMAC-SHA256(SESSION_SECRET, sid))` of the current cookie, compared constant-time, → 409 `{ "code": "SESSION_CHANGED" }`, no upstream. A GET without `X-PP-Session` is allowed only on `asImage` entries; on any other entry it → 403 `CSRF`.
- **Header forwarding.** Forward only `Content-Type`, `Content-Length`, `Accept`, `Accept-Language`, plus a server-added `Authorization: Bearer <access token>` and a generated `X-Request-Id`. The browser's `Cookie` and `X-PP-Session` are never forwarded. Upstream `fetch` uses `cache: "no-store"`, `redirect: "manual"`, and a 25 s timeout; bodies stream (not buffered).
- **Response mapping.** 2xx and 4xx (other than 401) pass through with their status and body, streamed. Upstream 3xx → 502 `{ "code": "UPSTREAM_REDIRECT" }`; 5xx or network error → 502 `{ "code": "UPSTREAM_ERROR" }` (never the upstream body); timeout → 504 `{ "code": "UPSTREAM_TIMEOUT" }`; upstream 401 → 401 `TOKEN_EXPIRED`. `PP_DISABLED=1` → every proxy request answers 503 `{ "code": "SERVICE_DISABLED" }`.
- **Response headers.** Return only upstream `Content-Type`, `Content-Length`, and `X-Request-Id`; drop upstream `Set-Cookie`, `Access-Control-*`, `Cache-Control`, `Expires`, `ETag`, `Last-Modified`. Every proxy response, including errors, carries `Cache-Control: private, no-store, max-age=0`, `Pragma: no-cache`, `Vary: Cookie` (from `lib/server/cache-headers.ts`) and `X-Content-Type-Options: nosniff`.
- **Logging (`lib/server/log.ts`).** Each proxied request logs only `{ requestId, method, template, status, durationMs }` with the template (e.g. `/v2/person/{personId}/ssn/expose`), never the concrete path, ids, query values, tokens, or bodies. Request/response bodies are logged only when `APP_ENV=dev`, with tokens, SSN-shaped values, and secrets redacted. An unhandled error → 500 (no upstream data) logging only `{ requestId, routeTemplate, status, errorName }`.

**Never:**
- Never forward the browser `Cookie` or `X-PP-Session` upstream; never return the upstream `Set-Cookie`/CORS/caching headers; never put a token, id, query value, or body in a log line (outside the dev redacting debug logger); never return an upstream body on a 5xx.
- Never build the upstream URL with `new URL(input, base)`; never proxy GraphQL, `/auth/**`, `/v2/public/external-application/**`, or an admin prefix; never honor `HEAD/OPTIONS/TRACE`, `X-HTTP-Method-Override`, or `_method`.
- No token refresh in the proxy (Story 1.5); no `callApi`/`X-PP-Session` client wiring or `sessionBinding` page embed (Stories 1.4/1.8); no feature allowlist entries beyond `GET /v2/user/myself`; no named GraphQL op `/api/pp/profile-picture-id` (later story).
- Don't change Story 1.1/1.2 behavior: the `proxy.ts` request interceptor (headers + `/?lpl=` redirect), the launch flow, `callApi`'s signature, or the design tokens.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path | `GET /api/1h/v2/user/myself`, valid session, valid `X-PP-Session`, same-origin | 200, upstream body streamed; response has no-store trio + `nosniff`; only CT/CL/X-Request-Id from upstream | N/A |
| Kill switch | `PP_DISABLED=1`, any request | 503 `SERVICE_DISABLED`, no upstream | SERVICE_DISABLED |
| Not allowlisted | `GET /api/1h/v2/admin/thing` | 403 `NOT_ALLOWED`, no upstream | NOT_ALLOWED |
| Denied prefix | `GET /api/1h/auth/x`, `/v2/public/external-application/..`, a GraphQL path, admin prefix | 403 `NOT_ALLOWED`, no upstream | NOT_ALLOWED |
| Wrong method | `POST /api/1h/v2/user/myself` (template is GET-only) | 405, no upstream | 405 |
| HEAD/OPTIONS/TRACE | any of them to a known path | 405 (explicit handler) | 405 |
| Method override | `POST` with `X-HTTP-Method-Override: GET`, or `?_method=GET` | override ignored (stays POST → fails its own checks); `_method` is an unknown param | — |
| Bad path | raw path with `//`, `%2F`, `%5C`, `%25`, or a segment `.`/`..`/empty/`;`/control/space | 400 `BAD_PATH`, no upstream (table: `..%2F`, `%2e%2e`, `%252F`, `//host`, `;x`, trailing `/`, `V2/User/Myself`) | BAD_PATH |
| Owner `me` | template `{personId}`, client sends `me` | proxy substitutes session id; upstream URL uses the real id | N/A |
| Owner spoof | owner position has any value other than `me` (incl. own numeric id) | 403 `NOT_ALLOWED`, no upstream | NOT_ALLOWED |
| Bad id segment | non-owner id not matching `^\d{1,19}$` | 403 `NOT_ALLOWED` | NOT_ALLOWED |
| Unknown query | query param not in entry's allowlist, or value fails its regex | 400 `BAD_QUERY`, no upstream | BAD_QUERY |
| Server-fixed param | client sends `isPublic=true`/`hardDelete=true` on an entry that fixes them | client value ignored; server value used | N/A |
| No session | no cookie, or cookie fails to unseal | 401 `SESSION_EXPIRED`, no upstream | SESSION_EXPIRED |
| Token near expiry | access token expires within 30 s | 401 `TOKEN_EXPIRED`, no refresh, no cookie | TOKEN_EXPIRED |
| Upstream 401 | upstream returns 401 | 401 `TOKEN_EXPIRED`, no cookie | TOKEN_EXPIRED |
| CSRF non-GET | non-GET lacking `Sec-Fetch-Site: same-origin` (and `Origin`≠`APP_ORIGIN`), or lacking `X-PP-Session`, or neither header | 403 `CSRF`, no upstream | CSRF |
| Wrong media | JSON entry, `Content-Type` ≠ `application/json` | 415 `UNSUPPORTED_MEDIA` | UNSUPPORTED_MEDIA |
| Binding mismatch | `X-PP-Session` ≠ `base64url(HMAC(SESSION_SECRET, sid))` | 409 `SESSION_CHANGED`, no upstream | SESSION_CHANGED |
| GET w/o binding (non-image) | GET, no `X-PP-Session`, entry not `asImage` | 403 `CSRF` | CSRF |
| GET w/o binding (image) | GET, no `X-PP-Session`, entry `asImage` | allowed (proceeds) | N/A |
| Upstream 3xx | upstream responds 3xx | 502 `UPSTREAM_REDIRECT` | UPSTREAM_REDIRECT |
| Upstream 5xx / network | upstream 5xx or fetch throws | 502 `UPSTREAM_ERROR`, no upstream body | UPSTREAM_ERROR |
| Upstream timeout | upstream exceeds 25 s | 504 `UPSTREAM_TIMEOUT` | UPSTREAM_TIMEOUT |
| Header filter | upstream sends `Set-Cookie`, CORS, `ETag`, `Cache-Control` | none returned; only CT/CL/X-Request-Id returned + no-store + nosniff | N/A |
| Logging `me` | proxied `GET /v2/person/me/...` fixture | log line has the template, status, duration, requestId — not the substituted id/path/query | N/A |
| Unhandled error | an internal throw | 500, no upstream data, log `{requestId, routeTemplate, status, errorName}` | 500 |

</frozen-after-approval>

## Code Map

- `lib/server/env.ts` — **reuse, no change.** `API_ORIGIN`, `APP_ORIGIN`, `SESSION_SECRET`, `PP_DISABLED`, `APP_ENV`.
- `lib/server/session.ts` — **reuse, no change.** `getSession()`/`unsealSession()` → `SessionData` (`sid`, `accessToken`, `accessTokenExpiresAt`, `userId`, `personId`). No cookie is written by the proxy.
- `lib/server/cache-headers.ts` — **reuse.** `applyNoStore()`/`NO_STORE_HEADERS`; the proxy adds `X-Content-Type-Options: nosniff` alongside.
- `lib/server/proxy-allowlist.ts` — **create.** `AllowlistEntry` type, owner-placeholder + query-regex model, and `ALLOWLIST` with the single `GET /v2/user/myself` entry; a lookup by `METHOD + template`.
- `lib/server/session-binding.ts` — **create.** `computeBinding(sid)` = `base64url(HMAC-SHA256(SESSION_SECRET, sid))`; `verifyBinding(header, sid)` constant-time compare.
- `lib/server/csrf.ts` — **create.** `checkCsrf(request, { requireBinding })` implementing the `Sec-Fetch-Site`/`Origin`/`X-PP-Session` rules; reusable by later `/api/session|places|pp` routes.
- `lib/server/log.ts` — **create.** `logProxy({ requestId, method, template, status, durationMs })`; dev-only redacting body logger; `logError({ requestId, routeTemplate, status, errorName })`.
- `lib/server/proxy.ts` — **create.** `createProxy(allowlist)` returning `{ GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, TRACE }` handlers implementing the full pipeline (normalize → session → match → owner → query → CSRF → binding → token-expiry → forward → map → headers → log). Named distinctly from the root `proxy.ts` interceptor. *(Note: use `lib/server/proxy-core.ts` if `proxy.ts` basename collides in tooling.)*
- `app/api/1h/[...path]/route.ts` — **create** (`export const dynamic = "force-dynamic"`). Wires `createProxy(ALLOWLIST)` and re-exports its method handlers.
- Tests: `lib/server/proxy.test.ts` (pipeline, fixture-injected allowlist, every matrix row), `lib/server/session-binding.test.ts`, `lib/server/csrf.test.ts`, `lib/server/proxy-allowlist.test.ts` (shipped entry shape), `e2e/headers.spec.ts` — **extend** to assert the AD-21 + no-store header set on one `/api/1h` route.

## Tasks & Acceptance

**Execution:**
- [x] `lib/server/proxy-allowlist.ts` — define `AllowlistEntry`, the owner/query model, the shipped `GET /v2/user/myself` entry, and `METHOD + template` lookup.
- [x] `lib/server/session-binding.ts` — `computeBinding`/`verifyBinding` (base64url HMAC-SHA256, constant-time).
- [x] `lib/server/csrf.ts` — the `Sec-Fetch-Site`/`Origin`/`X-PP-Session` CSRF check, reusable across BFF route groups.
- [x] `lib/server/log.ts` — PHI-free proxy/error logging + dev-only redacting body logger.
- [x] `lib/server/proxy.ts` (or `proxy-core.ts`) — `createProxy(allowlist)` implementing the full pipeline and error-code mapping, streaming bodies, header filtering, 25 s timeout, `redirect:"manual"`, origin + re-match assertions.
- [x] `app/api/1h/[...path]/route.ts` — wire the real allowlist, `dynamic="force-dynamic"`, export method handlers incl. explicit `HEAD/OPTIONS/TRACE` → 405.
- [x] `lib/server/proxy.test.ts` — Vitest (node) over every I/O-matrix row using fixture-injected entries, with `fetch` mocked; assert status, `code`, no-upstream-call on rejects, streamed pass-through, header filtering, and the normalization table (`..%2F`, `%2e%2e`, `%252F`, `//host`, `;x`, trailing `/`, `V2/User/Myself`).
- [x] `lib/server/session-binding.test.ts`, `lib/server/csrf.test.ts`, `lib/server/proxy-allowlist.test.ts` — unit-cover the binding math, CSRF rules, and shipped-entry shape.
- [x] `lib/server/log.test.ts` — assert a proxied `me` call logs the template, not the substituted `personId`, and no token/body outside dev.
- [x] `e2e/headers.spec.ts` — extend to assert the no-store + AD-21 + `nosniff` header set on one `/api/1h` route (and on a 403/409 error response).

**Acceptance Criteria:**
- Given the shipped allowlist, when the story is done, then it holds exactly `GET /v2/user/myself` (no query/body) and the handler is produced by a factory accepting an injectable allowlist.
- Given a browser `/api/1h/<path>`, when the proxy forwards it, then the upstream URL is `API_ORIGIN + "/api/" + segments.map(encodeURIComponent).join("/")`, its origin equals `API_ORIGIN`, it re-matches the template, and the fetch uses `no-store` + `redirect:"manual"` + 25 s timeout.
- Given an unmatched path/method/prefix, a traversal/encoding payload, an owner spoof, a bad id, or an unknown/bad query, then the proxy answers (respectively) `NOT_ALLOWED`/405/`BAD_PATH`/`NOT_ALLOWED`/`BAD_QUERY` with the right status and makes no upstream call; server-fixed query params override client values.
- Given missing/unsealable session → 401 `SESSION_EXPIRED`; token within 30 s of expiry or upstream 401 → 401 `TOKEN_EXPIRED` with no refresh/cookie.
- Given CSRF/binding rules, then a non-GET missing `Sec-Fetch-Site`/`Origin`+`X-PP-Session` → 403 `CSRF`; a JSON entry with wrong `Content-Type` → 415; a mismatched `X-PP-Session` → 409 `SESSION_CHANGED`; a GET without the header is allowed only on `asImage` entries.
- Given upstream outcomes, then 2xx/4xx(≠401) stream through, 3xx → 502 `UPSTREAM_REDIRECT`, 5xx/network → 502 `UPSTREAM_ERROR` (no body), timeout → 504 `UPSTREAM_TIMEOUT`, and `PP_DISABLED=1` → 503 `SERVICE_DISABLED`.
- Given any response, then only CT/CL/X-Request-Id are returned from upstream, `Set-Cookie`/CORS/caching headers are dropped, and the no-store trio + `nosniff` are present (asserted in CI incl. an error response); logs carry only `{requestId, method, template, status, durationMs}` and never the substituted id.
- Given the story is done, when CI runs, then `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` and `pnpm build` pass and the forbidden-pattern step stays green.

## Implementation Notes

- **Pipeline** implemented in the pinned order in `lib/server/proxy.ts`; `createProxy(allowlist)` returns the method handlers, wired to the real `ALLOWLIST` in `app/api/1h/[...path]/route.ts`.
- **405 body:** method-not-allowed responses carry `{ code: "METHOD_NOT_ALLOWED" }` (the AC pinned the 405 status but not a code; added for consistency); no `Allow` header is sent.
- **Response `X-Request-Id`** is the proxy's own generated id (used for log correlation and forwarded upstream), not a trusted upstream echo.
- **`isDeniedPath`** denies `auth` (first segment), any `admin`/`graphql` segment, and `v2/public/external-application` — intentionally broader than a strict prefix, as defence-in-depth (these also miss the allowlist).
- **Normalization vs the URL parser:** `normalizePath` works off the raw sub-path after the `/api/1h/` marker and rejects `//`, `%2F`, `%5C`, `%25` at the raw level plus `.`/`..`/forbidden-char segments at both raw and decoded levels. In the real runtime some traversal encodings never reach the handler (Next routes `%2e%2e` elsewhere); either way there is no upstream call and no traversal.
- **e2e `Vary`:** Next merges RSC negotiation tokens onto the handler's `Vary: Cookie`, so the e2e asserts `Vary` *contains* `Cookie` while unit tests assert the exact handler value `Cookie`; `Cache-Control`/`Pragma`/`nosniff` pass through exactly.
- **Cross-story (expected):** the proxy requires `X-PP-Session` on non-`asImage` requests, so a real in-app `GET /api/1h/v2/user/myself` returns `CSRF` until Story 1.4 wires `callApi` to send the header and the shell embeds `sessionBinding`. Built/tested in isolation here.

## Spec Change Log

## Review Triage Log

### Iteration 1 — three layers (blind-hunter, edge-case, verification-gap)

**PATCH (auto-fix this iteration):**
- **Forwarded upstream `Content-Length` corrupts a compressed response** (blind-hunter) — `high`. Verified empirically (Node 26 `fetch`): on a gzip upstream, `fetch` decompresses the body but leaves the stale compressed `Content-Length` (and `Content-Encoding`) in `response.headers`; the proxy forwards `Content-Length` but not `Content-Encoding`, so a gzipped `/myself` reaches the browser with a too-small `Content-Length` and the full decompressed body → truncation/corruption. Fix: drop `Content-Length` from `FORWARDED_RESPONSE_HEADERS` (keep `Content-Type`), let the streamed `Response` frame itself. Within the frozen "only these" cap (returning a subset is allowed). Add a stale-`Content-Length` upstream test.
- **`opaqueredirect` branch untested; status-range branch is dead in production** (verification-gap) — `medium`-if-regressed. Verified: with `redirect:"manual"`, a real upstream 3xx arrives as `{type:"opaqueredirect", status:0}`, so only the `type==="opaqueredirect"` sub-condition fires in prod; the sole 3xx test uses a hand-built `status:302` Response (hits only the dead status-range branch). Fix: add a test with an opaqueredirect-shaped mock → 502 `UPSTREAM_REDIRECT`.
- **Request-body forwarding untested + not gated on body mode** (blind-hunter + edge-case + verification-gap) — `medium`-if-regressed. Verified: `forward` streams `request.body` for any non-GET regardless of `entry.body`, and no test asserts the body/`duplex:"half"` reaches `fetch`. Fix: gate body forwarding on `entry.body === "json"` (a `body:"none"` non-GET must not forward a client body) and assert `init.body`/`duplex` on a json entry (and no body on a `none` entry).
- **HEAD/OPTIONS/TRACE bypass the kill switch** (edge-case) — `low`, spec deviation. Verified: `methodNotAllowed` returns 405 unconditionally, so under `PP_DISABLED=1` these answer 405 not 503, contradicting "every proxy request → 503 `SERVICE_DISABLED`". Fix: return `SERVICE_DISABLED` from those handlers when `PP_DISABLED`; add a test.

**DEFER (real, fix is non-trivial / future-scoped):**
- **Upstream timeout covers only time-to-headers, not the body stream** (blind-hunter + edge-case) — `low`/`maybe-false`, `medium`-if-true. A stalled body after headers has no deadline; the fix needs a streamed-body deadline (TransformStream/abort plumbing). Defer with a note.
- **Dev-only `redactBody` under-redacts some secret field names** (blind-hunter) — `low`. Dev-only debug logger; misses `code`/`oneTimeCode`/`apiKey`/`authorization`. Defer (expand the field list when the debug logger is next touched).

**REJECTED (verified low / spec-mandated / not reachable):**
- **CSRF/same-origin gate runs after allowlist checks, leaking shape to off-origin probes** (blind-hunter) — `low`. CORS blocks a browser from reading cross-origin responses; a server-side probe has no session (→ `SESSION_EXPIRED` early); and `asImage` GETs must work cross-origin, so a blanket early same-origin gate would be wrong. Theoretical. Reject.
- **405 omits `Allow` header** (blind-hunter) — `low`. Not required by the spec; the blanket HEAD/OPTIONS/TRACE handler has no template to enumerate. Reject.
- **`maxBytes` declared but unenforced; unbounded request body** (blind-hunter) — `low`. The spec explicitly defers upload/`maxBytes` enforcement (AD-13) and ships no non-GET body entry, so it is unreachable in 1.3. Reject (spec-deferred).
- **`normalizePath` bans all `%`-encoding; dual raw/decoded loop partly dead** (blind-hunter) — `low`. Banning `%` in a segment is spec-mandated (BAD_PATH forbidden chars include `%`); the redundancy is cosmetic defence-in-depth. Reject.
- **E2E `makeLpl` hardcodes `issuedAt`** (blind-hunter) — `low`. The launch route checks only `issuedAt` presence (no freshness), so it is not a time-bomb today. Reject.
- **Internal 500 logs via `logError` only, not `logProxy`** (blind-hunter) — AC 653 pins the 500 log shape as `{requestId, routeTemplate, status, errorName}` (= `logError`). Spec-compliant. Reject.
- **Upstream 4xx (≠401) bodies forwarded verbatim** (blind-hunter) — AC 638 mandates passing 2xx/4xx bodies through (the client needs them for error mapping, Story 1.12); only 5xx are masked. Spec-mandated. Reject.

## Design Notes

- **Pipeline order** (first match wins; chosen so the safest/cheapest rejections precede any work, and no upstream call happens on any reject): `PP_DISABLED` → method/override → path-normalize (`BAD_PATH`) → session unseal (`SESSION_EXPIRED`) → allowlist match (`NOT_ALLOWED`/405) → owner-id + id-shape → query (`BAD_QUERY`) + server-fixed params → CSRF (`CSRF`/`UNSUPPORTED_MEDIA`) → session binding (`SESSION_CHANGED`, and GET-without-binding gate) → token-expiry (`TOKEN_EXPIRED`) → build+assert URL → forward → map upstream → filter headers → log. The AC does not pin precedence when several conditions fail at once; this order is the decision.
- **Session binding:** `base64url(createHmac("sha256", SESSION_SECRET).update(sid).digest())`; compare with `crypto.timingSafeEqual` on equal-length buffers (length-check first to avoid throwing).
- **Streaming:** pass `upstream.body` straight into the `Response` (no `await .text()`/`.json()`), so bodies are never buffered except future upload entries (AD-13, later story).
- **Cross-story note (not a bug):** the proxy requires `X-PP-Session` on non-`asImage` requests, but `callApi` doesn't send it until Story 1.4 and `app/page.tsx` doesn't embed `sessionBinding` until the shell story — so a real in-app `/api/1h/v2/user/myself` GET returns `CSRF` until 1.4 wires the header. Story 1.3 builds and tests the proxy in isolation.
- **Naming:** keep the root `proxy.ts` (Next request interceptor from Stories 1.1/1.2) untouched; the BFF proxy lives under `lib/server/` and `app/api/1h/`.

## Verification

**Commands:**
- `corepack pnpm lint` — expected: passes; forbidden-pattern gate clean.
- `corepack pnpm typecheck` — expected: zero errors.
- `corepack pnpm test` — expected: proxy/binding/csrf/log suites pass, covering every I/O-matrix row and the normalization table; `fetch` mocked; MSW/unhandled requests error.
- `corepack pnpm build` — expected: production build succeeds; `/api/1h/[...path]` is dynamic.
- `corepack pnpm test:e2e` — expected: the extended header spec passes on an `/api/1h` route and an error response.
