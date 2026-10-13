---
reviewOf: ../ARCHITECTURE-SPINE.md
lens: security / HIPAA compliance (PHI)
reviewer: security-compliance review agent
date: 2026-10-13
verdict: NOT READY. Approve once the 9 High findings are folded into the ADs.
counts: { critical: 0, high: 9, medium: 12, low: 6 }
inputs:
  - ../ARCHITECTURE-SPINE.md
  - ../../../prds/prd-personal-profile-2026-10-13/reconcile-jira-confluence.md (G3–G6)
  - ../../../prds/prd-personal-profile-2026-10-13/research-backend.md
  - ../../../prds/prd-personal-profile-2026-10-13/addendum.md §A
  - app/api/token/route.tsx, lib/auth-client.ts, next.config.mjs (template)
---

# Security Review: Architecture Spine, Personal Profile (NG-9019)

## Verdict

**Not ready.** The BFF direction is right: tokens are server-only, there is one proxy, and launch is a one-shot server exchange. But the ADs leave the proxy itself as the main attack surface:

- the allowlist is path-only and doesn't pin params;
- there is no CSRF defence even though cookies are `SameSite=None`;
- the base URL and identity are trusted from cookies;
- there is no rule that stops PHI being cached;
- the refresh lock can't work on serverless;
- uploads are larger than the Vercel body limit;
- nothing detects a cross-user session switch between tabs.

There are also unresolved compliance prerequisites: BAAs, automatic logoff, and a kill switch. None of these needs a paradigm change. Each one becomes an enforceable rule inside an existing AD.

Backend facts these findings rely on:

- External-app tokens act as the launching user, with that user's full role permissions (research-backend.md).
- One-time-code redemption is not row-locked (G5).
- The platform does not revoke tokens when the app is disabled (G4).

## Findings

Severity: **High** = an exploitable PHI disclosure or integrity loss, or a blocking compliance gap. **Medium** = needs a precondition (XSS, a shared device, misconfiguration) or is a significant availability problem. **Low** = hardening or defence in depth.

### SEC-1 (High), AD-2: Proxy path canonicalization: traversal, encoded slashes, host swap

**Exploit.** Next's `[...path]` decodes `%2F` and `%2E` inside a segment. So `/api/1h/v2/person/1%2F..%2F..%2Fadmin%2Fx/ssn/expose` gives `params.path = ["v2","person","1/../../admin/x","ssn","expose"]`.

- A template matcher where `{id}` means "any segment" accepts it.
- Then `fetch(base + "/" + path.join("/"))` resolves the dot segments upstream, reaching a non-allowlisted endpoint with the user's Bearer.
- If the code builds the URL with `new URL(userPath, base)`, a leading empty segment (`/api/1h//evil.com/x`) turns into a protocol-relative URL. The Bearer then goes to an attacker host.
- Spring also tolerates `;matrix` params and trailing slashes, which a naive string matcher handles differently.

**Rule fix (AD-2):**
- Each allowlist entry is `{ method, template, params: { name: regex } }`. Numeric ids must match `^\d{1,19}$`. Literal segments are compared exactly.
- Reject a request with 400 before matching if any raw or decoded segment is empty, is `.` or `..`, or contains `/ \ ; % @ :`, a control character or whitespace.
- Build the upstream URL as `ENV.API_ORIGIN + "/" + segments.map(encodeURIComponent).join("/")`. Never use `new URL(userInput, base)`.
- Assert `new URL(built).origin === ENV.API_ORIGIN`, and assert that its pathname re-matches the same template.
- Add a test table of traversal payloads (`..%2F`, `%2e%2e`, `%252F`, `//host`, `;x`, trailing `/`, mixed case) that must all return 400 or 403.

### SEC-2 (High), AD-2: The allowlist is path-only and doesn't pin method, owner ids, query or GraphQL

**Exploit.** Any script on the origin (XSS, a malicious dependency) or the user themselves can do the following through the allowlist as it stands:

- (a) call `GET /v2/person/{anyId}/ssn/expose`. A provider (in scope per UJ-3) may hold a role that allows exposing other people's SSNs. The template only says "a patient may call it for their own record".
- (b) flip `isPublic=true` on a Signature or insurance-card upload, making the file public.
- (c) send `hardDelete=true` against any `fileId` the role can reach.
- (d) if the GraphQL endpoint is allowlisted to read the Profile Picture id (addendum FR-10), run **any** GraphQL query, which defeats the allowlist completely.

The method isn't part of the allowlist, so `DELETE` on a GET-only path, `HEAD`, `OPTIONS` and `TRACE` are all unconstrained.

**Rule fix (AD-2):**
- The allowlist key is method plus template. Anything not listed returns 405 or 403.
- Template params named `personId` and `userId` are **not taken from the client**. The proxy substitutes them from the sealed session, and a mismatch returns 403.
- Query strings are allowlisted per entry, with name and value regex. Security-relevant values are fixed server-side: `isPublic=false` for Signature and Insurance, `isPublic=true` only for Profile Picture, and `hardDelete=true` only on the delete entries. Unknown query params return 400.
- GraphQL is never proxied raw. Use a named server operation, e.g. `GET /api/pp/profile-picture-id`, whose query document lives on the server and whose variables come from the session.
- `/auth/**`, `/v2/public/external-application/**` and any `/v2/admin`-like prefix are denied explicitly.
- Strip `X-HTTP-Method-Override` and `_method`.

### SEC-3 (High), AD-1/AD-2: CSRF against the same-origin proxy (`SameSite=None` cookies)

**Exploit.** Because the cookies are `SameSite=None`, any site the user visits can submit a cross-site `<form method=POST enctype=multipart/form-data action="https://pp.app/api/1h/v2/health/type/Person/123/relation/PersonHasSignatureFile/file/upload">`. The browser attaches the session cookie, and AD-2 "streams the body through unchanged".

The result is a forged **legal Signature** or Profile Picture, or a replaced file version. `personId` is not a secret. A `text/plain` form can also target any JSON endpoint the backend content-negotiates. `Partitioned` doesn't help in new-tab mode, where the cookie is first-party.

**Rule fix (AD-2, new sub-rule "CSRF"):**
- Every non-GET/HEAD request to `/api/1h/*`, `/api/places/*` and `/api/session/*` must pass **both** of these checks, or the server returns 403 `CSRF`:
  - `Sec-Fetch-Site: same-origin`, or `Origin` equal to the app's own origin. Requests with neither header are rejected.
  - a custom header `X-PP-CSRF`, whose value equals an HMAC of the session id. The value is delivered in the server-rendered page, not in a cookie.
- `lib/api` adds the header centrally.
- GET handlers must have no side effects.
- `Content-Type` is checked against the allowlist entry: JSON entries reject anything other than `application/json`.

### SEC-4 (High), AD-1/AD-2/AD-3: Base URL and identity are trusted from plaintext cookies

**Exploit.** AD-2 says "resolves the base URL from the session cookie, never from the request", but the cookie **is** part of the request. AD-1 stores the environment, base URL, `userId`, `personId` and `tenantId` as separate plaintext cookies. `HttpOnly` stops JS from reading them, but not:

- the user editing them;
- cookie-jar overflow followed by re-set;
- cookie tossing from a sibling subdomain on the custom domain.

So a modified `base_url` sends the Bearer token to an attacker host (SSRF and token exfiltration). A modified `personId` bypasses the param pinning in SEC-2, and a modified `tenantId` bypasses AD-6.

**Rule fix (AD-1, AD-3):**
- The API origin comes **only** from `lib/server/env.ts`, which is a constant per deployment under AD-3. No environment or base URL is stored client-side.
- All session state lives in **one** AEAD-sealed cookie (iron-session or JWE A256GCM, key `SESSION_SEAL_KEY` per env) named `__Host-pp_s`. The `__Host-` prefix blocks Domain attributes and subdomain tossing.
- `userId`, `personId` and `tenantId` are derived from the token or `/v2/user/myself` at launch, never from the launch payload alone. The server cross-checks the payload's `user.id` against the token subject.
- A cookie that fails to unseal is treated as no session.

### SEC-5 (High), AD-2/AD-13: Caching of PHI responses (Next Data Cache, Vercel CDN, browser)

**Exploit.**
- In Next 14, server `fetch()` caches GETs by default (`force-cache`). Whether a route opts out depends on dynamic-API ordering and the `Authorization` header heuristics. One proxy-route refactor could serve user A's `/v2/user/myself` or SSN response to user B from the Data Cache.
- AD-13 only sets `no-store` for non-raster files. Insurance-card images, which are raster and PHI, have no cache rule.
- Upstream `Cache-Control` headers pass through, so `public, max-age` would let the Vercel edge cache PHI.
- The `page.tsx` server guard could become static.

**Rule fix (AD-2, AD-13):**
- Every upstream `fetch` uses `{ cache: "no-store" }`.
- `app/api/**` and `app/page.tsx` export `dynamic = "force-dynamic"` and `revalidate = 0`.
- The proxy **overwrites** every response with `Cache-Control: private, no-store, max-age=0`, `Pragma: no-cache` and `Vary: Cookie`. This includes raster images and error responses.
- Upstream `Cache-Control`, `Expires`, `ETag` and `Last-Modified` are dropped.
- A CI test asserts these headers on a sample of allowlisted routes. A Vercel config check confirms no `s-maxage` anywhere.

### SEC-6 (High), AD-2: The refresh single-flight lock can't work across serverless instances, and cookie writes are last-write-wins

**Exploit and failure.**
- On Vercel, each request may land on a different instance, so an in-memory per-session lock does nothing.
- On page load, SWR fires about 6 parallel reads. Inside the 60 s pre-expiry window, each one refreshes independently.
- If the IdP rotates refresh tokens with reuse detection, the second refresh revokes the whole token family. If it rotates without detection, N−1 refreshes fail.
- Either way the proxy "clears the session cookies". The user is logged out mid-Save-all, and Section saves after the first one fail.
- Even without rotation, responses arrive out of order. A late response carrying the older `Set-Cookie` overwrites newer tokens.
- Whether 1health rotates refresh tokens (`client_id=public-client`) is unverified.

**Rule fix (AD-2). Pick one and write it down:**
- (a) **Preferred:** use a server-side session store (Upstash/Vercel KV, encrypted at rest, BAA-covered). The cookie holds only an opaque `sid`. Refresh takes a distributed lock (`SET lock:<sid> NX PX 10000`). Waiters poll the store for the new token. Cookie races disappear. This also fixes SEC-7, the logout half of SEC-11 and the kill switch.
- (b) If the design stays cookie-only:
  - the proxy never refreshes on its own;
  - a 401 or a near-expiry response returns `401 {code:"TOKEN_STALE"}`;
  - the client runs one `POST /api/session/refresh`, single-flighted in the tab and across tabs with `BroadcastChannel` or Web Locks, then retries;
  - the sealed cookie carries a monotonic `gen`, and the refresh route refuses to write a lower `gen`;
  - a failed refresh clears the session only when the IdP says `invalid_grant`, never on a network error or 5xx.
- In both cases, add a test: 10 concurrent proxied GETs across simulated expiry produce exactly 1 upstream refresh.

### SEC-7 (High), AD-13: Upload sizes exceed the Vercel function body limit, and there are no server-side limits

**Failure and abuse.**
- Vercel Functions reject request bodies over **4.5 MB** with 413. The 6 MB Profile Picture and 10 MB insurance card in AD-13 cannot pass through `/api/1h`, so FR-10 and FR-29 break in production.
- All size and type checks are client-side only. Any script can stream unbounded or non-image bodies upstream with the user's token, and upstream then stores HTML or SVG labelled as `image/png`.

**Rule fix (AD-13):**
- Set the upload limit to ≤ 4 MB, downscaling client-side with canvas re-encode to JPEG/PNG. Or route uploads through a dedicated upload path that is not a serverless body: a presigned upstream URL, if 1health offers one, recorded as an `[ASSUMPTION]` to verify.
- The proxy enforces per-entry `maxBytes`, rejecting on `Content-Length` and counting bytes while streaming, with 413 when exceeded.
- Upload entries require `multipart/form-data` with exactly one file part, named as the endpoint expects (`file` or `fileNewVersion`), with a declared type in the entry's allowlist.
- The server sniffs the first bytes against PNG, JPEG or BMP signatures. A mismatch returns 415.
- Signature is PNG only, ≤ 1 MB.

### SEC-8 (High), AD-1/AD-7/AD-12: A cross-tab user switch writes one user's edits into another user's profile

**Exploit (shared device, the risk AD-12 itself names).**
1. User A leaves the app open in tab 1 with dirty Sections.
2. User B launches in tab 2 from the same browser, or the same portal partition.
3. The session cookie, shared by both tabs, now belongs to B.
4. Tab 1 still holds A's in-memory form, SWR cache and possibly a revealed SSN.
5. A's next Save all, or an SWR revalidate, runs **against B's session**:
   - A's address, phone or SSN edits are written to B's record;
   - B's data is displayed under A's header.

**Rule fix (AD-1, AD-7):**
- The server-rendered page embeds `sessionBinding = HMAC(sid)`, which reuses the `X-PP-CSRF` value from SEC-3.
- The proxy rejects a request with **409 `SESSION_CHANGED`** when the header doesn't match the current session.
- The client treats 409 as terminal:
  - clear the SWR cache, the registry and in-memory SSN;
  - do not write drafts;
  - show "This profile was opened by another account in another tab" with a Reload button.
- A launch always issues a new `sid` (see also SEC-9).

### SEC-9 (Medium), AD-4: Login CSRF / session swap at launch, and failed launches keep the old session

**Exploit.**
- An attacker who is also a 1health user generates their own `lpl` and gets the victim to open `https://pp.app/?lpl=<attacker>` within 60 s. The victim is now signed into the **attacker's** profile and may type an SSN, upload an insurance card or sign. The attacker then reads that PHI.
- Separately, a failed launch (expired or used code) redirects to `/launch-error` but leaves the previous user's cookies in place. On a shared device, the next person to click "Open in a new tab" or reload `/` lands in the previous user's session.

**Rule fix (AD-4):**
- Step 0 of every launch attempt clears all session cookies, whatever the outcome.
- If a valid session for a **different** `userId` existed, the 303 goes to an interstitial: "You were signed in as X. Continue as Y?" Never switch silently.
- The header always shows the signed-in person's full name, which FR-9 requires to be visible on every tab.
- Log launch `Sec-Fetch-Site` and `Referer` origin. If the portal origin is reliably present, enforce `Referer` origin ∈ {portal origin for env} when the header exists.

### SEC-10 (Medium), AD-4: Launch-code replay and double redemption are not prevented

**Exploit.** The platform's redemption is check-then-update with no row lock (G5). An `lpl` that leaks within its 60 s window can be raced and redeemed a second time, creating a parallel session for the victim. Leak routes include Vercel request logs (the query string is logged, see SEC-17), the browser history of a shared device before the 303, and a proxy or extension. AD-4 says "exchanges the code exactly once", but an in-memory guard on serverless enforces nothing.

**Rule fix (AD-4):**
- Before exchanging, `SET used:<sha256(oneTimeCode.value)> NX EX 300` in the shared store. If the key already exists, go to `launch-error?reason=used`.
- Reject a payload whose `apiKey.name` or app id ≠ `ENV.APP_ID`.
- Reject a cleartext-JSON `lpl` (already in AD-4) and any IV ≠ 12 bytes.
- `/` with `lpl` must reach the launch route **server-side**, through middleware or a server `redirect()` to `/launch`. The spine has the portal open `/?lpl=` but the handler is at `app/launch/route.ts`, and that seam is unspecified (see SEC-22).

### SEC-11 (High), compliance (NFR-1; no AD): BAAs and PHI processors are not stated

**Gap.** PHI transits or rests in:
- Vercel function memory and request logs (query strings, error traces);
- the session store, if adopted;
- Google Places, which receives typed street addresses;
- the "telemetry sink", which is deferred.

The spine never requires a BAA. Vercel signs BAAs only on specific plans, and the Google Maps Platform is not covered by Google's Cloud BAA. Without BAAs this is a HIPAA impermissible disclosure, whatever the code does.

**Rule fix (new AD or AD-15 extension "PHI processors"):**
- Each deployment that touches demo or prod PHI runs only on vendors with an executed BAA: Vercel (Enterprise/HIPAA add-on), the KV store and the log drain. The list lives in `docs/compliance/phi-processors.md`.
- Places stays behind the AD-14 boundary and is **disabled in prod** until the privacy decision is recorded (PRD OQ3). The route returns an empty suggestion list, and the form still works with manual entry.
- Telemetry sinks receive only the AD-15 event shapes, with no user ids.

### SEC-12 (Medium), AD-5/new: No CSP beyond frame-ancestors, and no baseline security headers

**Exploit.** Once XSS exists, the BFF only hides the token. The attacker drives `/api/1h` as the user: exposing the SSN, rewriting contact points, deleting insurance. AD-5 defines only `frame-ancestors`.

**Rule fix (new AD-16 "Security headers", set in `middleware.ts` and verified by test):**
- CSP:
  - `default-src 'self'`
  - `script-src 'self' 'nonce-<per-request>' 'strict-dynamic'`
  - `style-src 'self' 'unsafe-inline'`, a Tailwind v4 / Radix concession that is documented
  - `img-src 'self' blob: data:`
  - `connect-src 'self'`
  - `font-src 'self'`
  - `object-src 'none'`
  - `base-uri 'none'`
  - `form-action 'self'`
  - `frame-ancestors <portal origin>`
  - `upgrade-insecure-requests`
- Other headers:
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: no-referrer`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - `Cross-Origin-Opener-Policy: same-origin-allow-popups`
- The nonce comes from middleware. No `dangerouslySetInnerHTML` (lint rule).

### SEC-13 (Medium), AD-9/AD-11: Stored-XSS sink in Social Media and other URL-like values

**Exploit.** Social Media contact points (FR-24) are user-entered strings, often shown as links. A value of `javascript:fetch('/api/1h/v2/person/…/ssn/expose')…` stored in one user's profile runs when that profile is viewed in any 1health surface that links it. In this app, the user can only XSS themselves, but the data is shared platform-wide.

**Rule fix (AD-11):**
- Every zod schema for a URL-ish field validates `^https://` (or a handle pattern) at input.
- The render helper `safeHref()` returns `undefined` unless the protocol ∈ {https:, mailto:, tel:}.
- An ESLint rule bans raw `href={value}` from data.

### SEC-14 (Medium), AD-1/AD-5: Cookie size and the CHIPS per-partition limit

**Failure.** Access and refresh tokens are JWTs, likely 1–2.5 KB each. With the identity fields, AEAD and base64 overhead, the sealed cookie can exceed **4096 bytes**, and browsers drop it silently. Chrome also caps partitioned cookies at about **10 KiB per embedded site per partition**. In the iframe this looks exactly like "third-party cookies blocked" and sends users to the AD-5 fallback for the wrong reason.

**Rule fix (AD-1):**
- Measure real dev, demo and prod token sizes now and record them.
- If the sealed cookie is > 3,800 bytes, use the server-side session store from SEC-6(a).
- If not, a unit test asserts the serialized `Set-Cookie` ≤ 3,800 bytes using the largest observed tokens.
- Don't store `id_token`.
- After setting the cookie, the launch route does a read-back check (303 to `/launch/verify`) to tell "cookie dropped" apart from "cookie blocked".

### SEC-15 (Medium), AD-2/AD-4/new: No idle timeout, logout or server-side session end

**Gap.** HIPAA §164.312(a)(2)(iii) requires automatic logoff.
- Cookie lifetime follows the refresh token, and the template uses 2× the access TTL with a 30-day environment cookie.
- "Return to 1health" deletes drafts but doesn't end the session.
- In new-tab mode, a portal logout leaves this app fully usable on a shared device.

**Rule fix (AD-1):**
- The session carries `lastSeen` and `iat`. The proxy enforces **15 min idle** and **8 h absolute**, then returns 401 `SESSION_EXPIRED` and clears the session.
- Cookies are session cookies with no `Max-Age`, or `Max-Age` ≤ absolute lifetime.
- `POST /api/session/logout` (CSRF-checked) clears cookies, calls `POST /auth/jwt/revoke-tokens…` or the token revoke endpoint where one exists, and runs on "Return to 1health" and on the session-expired dialog's exit.
- On `pagehide`, the client sends a best-effort `navigator.sendBeacon` logout **only** when the tab was opened standalone.

### SEC-16 (Medium), AD-15/ops: No kill switch for live sessions

**Gap.** The platform does not revoke tokens on Disable or Delete (G4). An incident (data-corrupting bug, compromise) can't be stopped quickly.

**Rule fix (AD-2):**
- An env flag `PP_KILL=1`, settable without a deploy (Vercel Edge Config), makes the proxy and launch return 503 `SERVICE_DISABLED` and clear cookies.
- The runbook adds `isAllowedForPatients=false` as the token-revoking step.

### SEC-17 (Medium), AD-15: Logging gaps: request URLs, error traces, audit

**Gap.** AD-15 governs only what app code logs. But:
- Vercel request logs record the full URL. That includes `?lpl=…`, `/api/places/autocomplete?input=<street address>` if GET is used, insurer `?name=`, and upload `?fileName=`.
- Unhandled errors log `err` objects, which can include upstream bodies (the template echoes `details: authData`).
- There is no audit record of who exposed an SSN or changed a Signature from this app.

**Rule fix (AD-15):**
- Places endpoints are `POST` with a JSON body. No PHI-bearing data goes in any app URL. The launch is the one exception, as a one-time encrypted value.
- Set the Vercel log retention and drain to a BAA-covered sink.
- A global error wrapper logs `{requestId, routeTemplate, status, errorName}` only. Error responses to the client never include upstream bodies on 5xx.
- The proxy logs an audit line for sensitive templates (`ssn/expose`, Signature upload, version or delete, file delete, insurance delete): `{requestId, userId, template, status, ts}`, to the BAA sink with a 6-year retention.
- The 1health backend audit is confirmed as the system of record. `[ASSUMPTION to verify]`

### SEC-18 (Medium), AD-14: Places proxy abuse and cost

**Exploit.** Any authenticated session, or an XSS, can loop on `/api/places/*` and burn the Places quota and budget, or use the server key as a free geocoder. Session tokens supplied by the client can be reused to dodge per-session billing. An unconstrained `fields` value escalates to Places Details Enterprise SKUs.

**Rule fix (AD-14):**
- Rate limit per session: 30/min and 500/day, sharing the KV store from SEC-6(a).
- Input ≤ 120 characters, `placeId` matches `^[A-Za-z0-9_-]{10,300}$`, and `includedRegionCodes` is fixed server-side to US/CA/AU.
- The field mask is a server constant: address components and formatted address only.
- The session token is a server-generated UUIDv4, bound to the app session, and expires after the first details call.
- Restrict the GCP key to the Places API (New) only, with a hard daily quota cap and budget alerts.
- CSRF rule from SEC-3 applies.

### SEC-19 (Medium), AD-2: Request and response header forwarding isn't specified

**Exploit.** Forwarding client headers sends `Cookie`, a client-supplied `Authorization` (precedence bugs), `X-Forwarded-For/Host` (upstream trust and audit spoofing) or `Origin` upstream. Passing response headers back can carry `Access-Control-Allow-*`, `Content-Security-Policy` overrides or `Location` redirects to upstream hosts. On fetch, a 3xx is followed automatically, possibly to another host, with the Bearer attached.

**Rule fix (AD-2):**
- Allowlist of forwarded request headers: `Content-Type`, `Content-Length`, `Accept`, `Accept-Language`, plus server-added `Authorization` and `X-Request-Id`.
- Allowlist of forwarded response headers: `Content-Type`, `Content-Length`, `Content-Disposition` (re-generated, see SEC-20) and `X-Request-Id`. All others are dropped, including `Set-Cookie` and CORS headers.
- Upstream fetch uses `redirect: "manual"`. A 3xx becomes 502.

### SEC-20 (Low), AD-13: Image passthrough trusts the upstream Content-Type

**Rule fix (AD-13):**
- Set `X-Content-Type-Options: nosniff` on every proxy response.
- Raster passthrough also requires the first bytes to match the declared type. Otherwise send an attachment.
- `Content-Disposition` is generated by the proxy (`inline` for raster, `attachment; filename="file"` otherwise), never copied from upstream.

### SEC-21 (Medium), Layers/AD-4: The legacy `/api/token` route and `/auth` page stay reachable

**Exploit.** The layer table still lists `app/api/token/` as BFF, while AD-4 introduces `app/launch/route.ts`. If the template route survives, it:
- returns `access_token` and `refresh_token` in the JSON body;
- sets non-`HttpOnly` cookies;
- selects the environment secret from the request body;
- echoes upstream error details.

That undoes AD-1, AD-3 and AD-15.

**Rule fix (AD-1):**
- `app/api/token/**`, `app/auth/**` and `lib/auth-client.ts` are **deleted** in the first story.
- The layer table replaces `app/api/token/` with `app/launch/`.
- A CI grep fails the build on `document.cookie`, `access_token` in `app/**` client files, `NEXT_PUBLIC_*SECRET*`, or `_DEMO`/`_PROD` secret names.
- Remove `typescript.ignoreBuildErrors` and `eslint.ignoreDuringBuilds` from `next.config.mjs`, so that security lint rules actually gate the build.

### SEC-22 (Medium), AD-4: The `/?lpl=` entry is unspecified, so `lpl` may reach client JS

**Gap.** The portal opens `/?lpl=…`, but the launch handler is `/launch`. If `app/page.tsx` (a client tree) handles `lpl`, as the template's `/auth` page does, the payload is exposed to client JS, extensions and RSC payloads.

**Rule fix (AD-4):**
- Either register the launch URL as `/launch` in each env's External Application, or have `middleware.ts` issue a 307 from `/?lpl=` to `/launch?lpl=` before any render.
- `page.tsx` never reads `lpl`.
- Normalize `' '` to `'+'` server-side (the G6 standard-Base64 rule).

### SEC-23 (Low), AD-4/AD-5: Open-redirect and reflection surfaces

**Rule fix:**
- `launch-error?reason=` is an enum (`expired|used|invalid|tenant|cookies|config|kill`). Unknown values render `invalid`, and the raw value is never rendered or logged.
- `?tab=` is an enum.
- "Open in a new tab" and "Return to 1health" targets are the constant `ENV.PORTAL_URL`. There is no `returnUrl` or `next` param anywhere.
- All redirects are relative paths.
- Any `postMessage` listener checks `event.origin === ENV.PORTAL_ORIGIN`, and the spine forbids `'*'` as a target.

### SEC-24 (Low), AD-5: Framing policy details

**Rule fix (AD-5):**
- `frame-ancestors` lists exactly one exact origin per env, the portal origin. Drop `'self'`, since the app never frames itself.
- Send it on **all** responses, including `/launch-error`, `/api/**` and static assets via `headers()` in `next.config`. Do not also send `X-Frame-Options`, which can't express an allowlist.
- Record that the sandbox lacks `allow-top-navigation`, so "Return to 1health" will always take the fallback inside the frame. Build the frame UX for that path first.

### SEC-25 (Low), AD-12: Drafts are unencrypted PHI in sessionStorage

**Rule fix (AD-12):**
- Drafts are cleared on 401, on 409 `SESSION_CHANGED` and on logout, not only on save, discard or Return.
- The draft writer uses an explicit allowlist of fields per Section, not "drop ssn/signature". New sensitive fields are then excluded by default.
- Insurance (member ids) is never drafted, consistent with AD-7.

### SEC-26 (Low), AD-10: SSN expose is not throttled

**Rule fix (AD-2/AD-10):**
- The proxy limits `ssn/expose` to 5 per session per 10 min, then returns 429.
- Responses are `no-store` (SEC-5).
- The audit line comes from SEC-17.
- The client clears the value on `pagehide` as well as `visibilitychange`.

### SEC-27 (Low), Stack: Auth must not rely only on middleware

**Rule fix:** session validation runs inside every route handler and server component (`requireSession()` in `lib/server/session.ts`). Middleware only redirects as a convenience. This is defence against the `x-middleware-subrequest` class of bypass (CVE-2025-29927, fixed in 14.2.25; keep at ≥ 14.2.35 and track 14.x advisories until the upgrade).

## Severity summary

| Severity | Count | IDs |
|---|---|---|
| Critical | 0 | none |
| High | 9 | SEC-1, 2, 3, 4, 5, 6, 7, 8, 11 |
| Medium | 12 | SEC-9, 10, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22 |
| Low | 6 | SEC-20, 23, 24, 25, 26, 27 |

## Suggested AD edits (summary for the architect)

- **AD-1:**
  - one sealed `__Host-` cookie, or an opaque `sid` plus a server store;
  - identity is derived server-side;
  - idle and absolute timeouts, and a logout route;
  - delete the legacy auth code;
  - a cookie-size test.
- **AD-2:**
  - canonicalization;
  - method+template+param allowlist with session-pinned owner ids and query allowlists;
  - no raw GraphQL;
  - CSRF (`Sec-Fetch-Site`/`Origin` plus a custom header);
  - session-binding 409;
  - header allowlists and `redirect: manual`;
  - forced `no-store`;
  - a distributed refresh lock or client-coordinated refresh;
  - kill switch;
  - rate limits.
- **AD-4:**
  - clear any prior session first;
  - interstitial when the user changes;
  - distributed used-code guard;
  - app-id check;
  - a server-side `/?lpl` → `/launch` route.
- **AD-5:** the exact portal origin only, on all responses. New **AD-16** for CSP and security headers.
- **AD-13:** a ≤ 4 MB limit, or a non-function upload path; server-side size, type and magic-byte checks; proxy-generated disposition; `nosniff`.
- **AD-14:** rate limits, server field mask and session token, POST only, key restrictions, disabled in prod pending the BAA and privacy decision.
- **AD-15:** URL hygiene, an error wrapper, an audit trail for sensitive operations, BAA-covered sinks. New **PHI processors** rule (BAA list).
