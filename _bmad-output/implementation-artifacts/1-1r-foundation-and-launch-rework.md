---
title: 'R1: Foundation and launch rework (Stories 1.1 + 1.2 against D1–D13)'
type: 'refactor'
created: '2026-10-14'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '6974a8f077a57a902db701ff5ecf9a1c01085a5b'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-14.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Stories 1.1 and 1.2 were built for one deployment per environment: `APP_ENV`, `APP_ORIGIN`, a single `ONEHEALTH_SECRET_KEY`/`APP_ID`, and a `/launch` → `/launch/verify` → `/launch-error` chain. That chain could run inside the portal iframe, with a `SameSite=None; Partitioned` cookie. Decisions D1, D2, D4, D8, D9 and D10 (`epics.md` lines 628–650, overriding the spine) replace this. One deployment serves demo and prod; the environment is detected by whichever key decrypts the LPL and is sealed in the session; launch goes through `/auth` + `POST /api/token`; and the app is never framed.

**Approach:** Rework the code to the amended Story 1.1 and 1.2 text in `epics.md` (lines 701–909), which is authoritative. Rework story R1 of the approved Sprint Change Proposal (2026-10-14) does this; Q1 combined 1.1 + 1.2 into it. Keep every reusable piece: `lib/server/launch.ts` helpers, the session seal and rotation, the proxy core, headers machinery, tokens and the shell. Delete what D1/D8/D10 remove. Per Q2, add forbidden-gate bans for the symbols this story removes. R2–R4 remove CSRF and binding, the logout changes and `navigate()`; don't touch those here except where noted.

## Boundaries & Constraints

**Always:**
- **Env (`lib/server/env.ts`, Story 1.1 lines 712–725):**
  - Exactly the D1 set: `ONEHEALTH_SECRET_KEY_DEMO`, `ONEHEALTH_SECRET_KEY_PROD`, `APP_ID_DEMO`, `APP_ID_PROD`, `SESSION_SECRET` (≥ 32), `SESSION_SECRET_PREVIOUS`?, `PLACES_ENABLED`, `GOOGLE_PLACES_KEY`, `PP_DISABLED`, `ACCOUNT_DISABLED` (boolean only for `"1"`), `IS_LOCAL_DEV`, `DEFAULT_TENANT_ID = 1`, plus `getSecretKey(env)` and `getAppId(env)`.
  - No `APP_ENV`, `API_ORIGIN`, `APP_ORIGIN`, `PORTAL_URL`, `PORTAL_ORIGIN`, `PUBLIC_FILES_ORIGIN`, `APP_ID`, `ONEHEALTH_SECRET_KEY` or `NEXT_PUBLIC_*`.
  - Boot fails, naming the variable and never printing its value, for each case in the story; whitespace around a key is not a boot error. Use a Vitest table.
- **`lib/shared/environments.ts`** (no secrets): `type Environment = "demo" | "prod"` and a map of `apiRoot` (`https://1health.demo.1health.io` / `https://1health.app.1health.io`), `apiBase = <apiRoot>/api`, `portalUrl = apiRoot`, and `publicFilesOrigin` (unset), with a Vitest of the values. No other module hard-codes a 1health origin.
- **`lib/shared/app-env.ts`** is rewritten to read only `process.env.NODE_ENV` and export `isLocalDev()`, as the single lint exception (D6). Server body logging in `lib/server/log.ts` that was gated on `APP_ENV` is removed: server logs never contain bodies (D6).
- **Session (`lib/server/session.ts`):**
  - `SessionData` gains `environment: Environment`. A cookie that unseals without a valid `environment` counts as no session.
  - Attributes are exactly `HttpOnly; Secure; SameSite=Lax; Path=/`, with no `Partitioned`, `Domain`, `Max-Age` or `Expires` (seal and clear).
  - `requireSession()` and the root `proxy.ts` aged-cookie branch redirect to `/auth`, with no query.
  - Keep the `SESSION_SECRET_PREVIOUS` rotation and add the ≤ 3,800-byte `Set-Cookie` test with a ≥ 1,224-byte access token.
- **Every upstream caller uses the session's environment:** the proxy `apiBase` and its origin assertion, refresh (`<apiRoot>/auth/oauth2/token`) and logout (`<apiRoot>/auth/user/logout`, unchanged until R3).
- **`csrf.ts` interim:** compare `Origin` with `new URL(request.url).origin` instead of `APP_ORIGIN`. R2 deletes the file.
- **Launch (Story 1.2 lines 789–909):**
  - `app/auth/page.tsx`: a server wrapper, `dynamic = "force-dynamic"`, reading only the `onehealth_environment` cookie.
  - `features/shell/auth-screen.tsx`: the D9 client flow. It reads `lpl`, turns spaces into `+`, and removes `lpl` with `replaceState` before sending. It makes ≤ 5 attempts at a fixed 1,500 ms and honours `retryable: false`, using the attempt-1 and attempt-2+ copy. On success it waits 1,200 ms, then `window.location.assign(consumeLoginIntent("/"))`. It also provides the manual-entry card, the Choose Environment card, the error Alert and its three buttons, and the referrer → cookie display environment. It never sends an environment and never reads `document.cookie`.
  - `lib/shared/login-intent.ts`: `saveLoginIntent()` and `consumeLoginIntent()` with the story's validation. Story 1.7 (R3) calls save.
  - `app/api/token/route.ts`: POST only (405 otherwise), `dynamic`, 415 without JSON, no CSRF or binding.
    - It clears any `__Host-pp_s` first and reads only `lpl`.
    - Detection is PROD then DEMO, each as stored and then `.trim()`-ed, with a warning naming the variable when only the trim matched.
    - It applies the `LAUNCH_INVALID` table, an `APP_ID_<ENV>` check and the exchange: once, 25 s, `redirect: "manual"`, signature keyed with the variant that decrypted. Upstream errors map to `LAUNCH_USED` / `LAUNCH_EXPIRED` / `LAUNCH_INVALID` (502 for 5xx, timeout or network).
    - It reads the plaintext `tenantId`; a tenant other than 1 → 403 `WRONG_TENANT`. `/myself` with an id match → seal.
    - On success: 200 `{ ok: true, environment }`, plus the `onehealth_environment` cookie (`HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`).
    - Every error body is `{ ok: false, errorCode, source: "proxy", message, retryable? }`, with `message` from `messages.ts`. No token, code, id or upstream text in any body. No-store headers. The log line holds only request id, template, outcome, environment and duration.
    - Config failure → 503 `LAUNCH_CONFIG`. `PP_DISABLED` → 503 `SERVICE_DISABLED` without decrypting or touching the cookie.
  - Reuse the `lib/server/launch.ts` helpers, made per-environment by passing the secret and `apiRoot`.
- **Kill switch on pages:** with `PP_DISABLED`, `/` and `/auth` render `features/shell/disabled-screen.tsx` directly (the story's draft copy; "Go to 1health" to the shown or remembered environment's `portalUrl`, else prod), with no redirect. Story 1.16 owns the 503 status code.
- **Never framed (D10):** CSP `frame-ancestors 'none'`, `X-Frame-Options: DENY`, COOP `same-origin` on every response. Delete `useIsFramed` and every framed branch, including the app bar's `!framed`, the session dialog's framed button and `framedAction` copy, and the framed Playwright case.
- **`portalUrl` for the shell:** `app/page.tsx` derives it from `environments[session.environment].portalUrl`; the `ClientConfig`/`getPortalUrl` chain stays until R3.
- **Copy (`lib/shared/messages.ts`):** remove `LAUNCH_ERROR_COPY` and its reason types. Add the `/auth` strings and the `errorCode` → `message` map from Story 1.2. Mark strings not quoted in EXPERIENCE.md `// DRAFT COPY`. The tenant copy is the module-neutral PA5 text.
- **Lint and gate:**
  - **ESLint:** keep the `process.env` rule with exceptions for `env.ts`, `app-env.ts` (`NODE_ENV` only), tests and configs. Add a `NextResponse.redirect` ban for `app/handoff/**` (no files yet).
  - **`check-forbidden.sh`:**
    - `_DEMO`/`_PROD` names are allowed only in `lib/server/env.ts`, its tests, `.env.example`, `.github/workflows/ci.yml`, `playwright.config.ts` and test setup or fixtures.
    - Ban in app code (excluding `*.test.*` and `e2e/`) `APP_ENV`, `API_ORIGIN`, `APP_ORIGIN`, `PORTAL_URL`, `PORTAL_ORIGIN`, `PUBLIC_FILES_ORIGIN`, `SameSite=None`, `Partitioned`, `window.top` and `bg-black/50`.
    - Scan root `proxy.ts` and `instrumentation.ts` too. Extend the gate test.
- **Tooling and docs:**
  - Add `.env.example` with the D1 set and dummy values.
  - Update CI and Playwright dummy env to the D1 set.
  - `test/e2e-upstream-mock.ts` stays path-based.
  - `e2e/fixtures.ts`: `makeLpl(code, env)` with demo and prod keys.
  - Every e2e that launched via `/launch?lpl=` now uses `/auth?lpl=` and waits for `/`.
  - Rewrite `CLAUDE.md` for the new env, launch, session and framing model.

**Never:**
- **Out of scope:**
  - removing CSRF or binding, `X-PP-Session`, `sessionBinding`, the session-changed dialog or the error-envelope change in other routes (R2/R3);
  - logout `all-devices`, `navigate()`, the page nav or the D13 `primary-text` token (R3/R4);
  - `lib/server/http.ts#seeOther()` and `/handoff/**` (Epic 7.3);
  - the AD-26 navigation lint (R4).
- No `/launch`, `/launch/verify`, `/launch/dev` or `/launch-error` route, no `?lpl` handling in `proxy.ts`, no `reason=cookies`, no new-tab fallback, no `view`/`tab` launch param, no dev-only paste page.
- No environment taken from a request, a URL, the referrer or a cookie for any API call. Display only.
- No secret value, `lpl`, code, token or user id in logs or response bodies.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Prod launch | `lpl` sealed with the PROD key, tenant 1, `/myself` id matches | 200 `{ok:true, environment:"prod"}`; `__Host-pp_s` (`Lax`, no `Partitioned`) with `environment:"prod"`; `onehealth_environment=prod`; exchange called once at the prod `apiRoot` | N/A |
| Demo launch | `lpl` sealed with the DEMO key | `environment:"demo"`, demo `apiRoot` | N/A |
| Trimmed key | only `key.trim()` decrypts | succeeds; one warning naming the variable, no value | N/A |
| Bad payload | missing, not base64, < 28 bytes, neither key, cleartext JSON, bad JSON, missing field | 400 `LAUNCH_INVALID`, `retryable:false`; no upstream call, no cookie | N/A |
| App id mismatch | `apiKey.name` ≠ `APP_ID_<ENV>` | 400 `LAUNCH_INVALID`, `retryable:false`, no upstream call | N/A |
| Used / expired code | upstream "already redeemed" / expired body | 400 `LAUNCH_USED` / `LAUNCH_EXPIRED` | retryable |
| Upstream 5xx / timeout | exchange fails | 502 `LAUNCH_INVALID` | retryable |
| Wrong tenant | `tenantId` ≠ 1 | 403 `WRONG_TENANT`, `retryable:false`, no cookie | N/A |
| Myself mismatch | `/myself` fails or id ≠ payload user | 502 `LAUNCH_INVALID`, no cookie | retryable |
| Wrong method / type | GET, or non-JSON POST | 405 / 415 | N/A |
| Disabled | `PP_DISABLED=1` | `/api/token` 503 `SERVICE_DISABLED`, no decrypt, cookie untouched; `/` and `/auth` render the disabled screen | N/A |
| Config | a key can't become an AES key | 503 `LAUNCH_CONFIG` | N/A |
| Client retry | two 502s then success | three POSTs 1,500 ms apart, then "Success!" and `assign("/")` after 1,200 ms | N/A |
| Client stop | `retryable:false` body | one POST, then the error Alert with the body `message` | N/A |
| Client exhaust | five failures, or a network error | five POSTs, then "Authentication Failed" + message, or "Connection Error" | N/A |
| No `lpl` | `/auth` with a referrer `demo.1health…`, the cookie, or neither | manual-entry card for that environment, or the Choose Environment card; Submit trims and replaces spaces | N/A |
| Login intent | `pp:login-intent="/?tab=insurance"`, `"//evil"` or `"/auth"` | assign `/?tab=insurance`; otherwise `/` | N/A |
| No session | `/` with no or bad cookie, an aged cookie, or a cookie without `environment` | redirect (page) / 307 (root proxy, aged) to `/auth` | N/A |
| Headers | `/`, `/auth`, `/api/token`, 404, static asset | CSP with `frame-ancestors 'none'`, `X-Frame-Options: DENY`, COOP `same-origin`, plus the rest of AD-21 | N/A |
| Gate | `APP_ENV`, `PORTAL_URL`, `window.top`, `Partitioned` or a `_DEMO` name in `features/x.ts` | `check-forbidden.sh` exits 1; allowed in `env.ts`, its tests and fixtures | N/A |
| Upstream origin | proxied call in a `demo` session | goes to `https://1health.demo.1health.io/api/...`; the origin assertion passes only for that root | N/A |

</frozen-after-approval>

## Code Map

- `lib/server/env.ts` -- rewrite. The current exports at :94–130 are `ORIGIN_BY_ENV`, `resolveAppEnv` and `resolveAppOrigin`, which go. Keep the `SESSION_SECRET`, `PLACES_*` and `PP_DISABLED` resolvers; add `ACCOUNT_DISABLED`, `IS_LOCAL_DEV`, `getSecretKey` and `getAppId`. `lib/server/env.test.ts` is rewritten as a table.
- `lib/server/launch.ts` -- **reuse** `deriveAesKey` :72, `buildSignature` :85, `decryptLaunchPayload` :94, `validatePayload` :133, `mapUpstreamError` :164, `exchangeCode` :175 and `readTokenTenantId` :239. `fetchIds` is at :259. Remove the `API_ORIGIN` defaults (:4, :178, :261), add `detectEnvironment(lpl)` (PROD → DEMO, raw then trimmed), and keep `lib/server/launch.test.ts` and extend it.
- `app/launch/route.ts` -- the flow to port: clear-first → `PP_DISABLED` → decrypt → app-id gate :96 → exchange → tenant :110 → myself :115 → seal :120. Then **delete** `app/launch/**` (route, verify, dev and tests) and `app/launch-error/**` (page, `return-action` and test).
  - Before the rewrite, the legacy `/auth` + `/api/token` existed at commit `d32f615` (`git show d32f615:app/api/token/route.tsx`, `app/auth/page.tsx`). Use it **only** for its UX shape (referrer detection, Choose Environment, manual entry, 1,200 ms success). Its security is wrong: JS-readable token cookies, tokens in the body, no app-id check.
- `lib/server/session.ts` -- attributes :45, doc :16, `SessionData` :48–69, seal :90, clear :95, `requireSession` redirect :155. Cookie-attribute assertions to update: `session.test.ts:72,82`, `logout.test.ts:19`, `ping.test.ts:17,158`, `refresh.test.ts:114,227,392`, `proxy.test.ts:615,647`, root `proxy.test.ts:15,142`.
- `proxy.ts` (root):
  - CSP :54, COOP :66, XFO comment :67–68;
  - `NO_STORE_PATHS` :77 (add `/auth`, `/api/token`; drop the `/launch*` entries);
  - `lpl` redirect :127–137 (delete);
  - aged redirect :141–149 (→ `/auth`);
  - and update its test.
- `lib/server/proxy.ts` -- `:5` import, `:217` upstream URL and `:373` origin assertion → `environments[session.environment]`. `lib/server/refresh.ts` :4 and :105, and `lib/server/logout.ts` :6, :31 and :76, change the same way.
- `lib/server/csrf.ts` -- `:3`, `:46` interim. `lib/server/log.ts` -- remove the `APP_ENV` body log (:3, :13, :105, :109) and update `log.test.ts`.
- `app/page.tsx`:
  - drop the `deriveAesKey` config check (:11, :65);
  - replace the `reason=disabled` redirect (:61) with the disabled screen;
  - `portalUrl` comes from the session environment (:75–78);
  - and update `app/page.test.tsx`.
- **Framing deletions:**
  - `features/shell/use-is-framed.ts` and its test;
  - `app-bar.tsx` :7, :22, :36 and its test;
  - `session-dialogs.tsx` :9, :89, :127–130 and its test;
  - `messages.ts` :103;
  - `e2e/session-dialogs.spec.ts` :77–111.
- `lib/shared/messages.ts` -- launch copy :13–85 and `normalizeLaunchErrorReason` :160 out; `/auth` + error-message copy in; update `messages.test.ts`.
- `lib/api/client.ts` -- the auth screen calls `callApi("auth/token", "/api/token", …)`, since `fetch` is lint-banned in `features/`. If `ApiResponse` can't surface `retryable` and `message`, extend `parseErrorBody` minimally to keep them in `details`. Don't change the refresh logic.
- `scripts/check-forbidden.sh` and its test; `eslint.config.mjs` :9–14, :70, :81, :85–97.
- **Config and tests:**
  - `.github/workflows/ci.yml` :11–14;
  - `playwright.config.ts` :44–47;
  - `e2e/fixtures.ts` :8–9, :13–29;
  - `e2e/launch.spec.ts` (rewrite for `/auth`);
  - the `/launch?lpl=` starts in `e2e/headers.spec.ts:138`, `e2e/shell.spec.ts:16` and `e2e/session-dialogs.spec.ts:29`;
  - `e2e/headers.spec.ts` targets and expected values;
  - `test/e2e-upstream-mock.ts`, which stays path-based.
  - With no launch tab param, a launch lands on `/`, and `ProfileTabs` then normalises it to `?tab=contacts`. Deep links are tested by navigating `/?tab=contacts#signature` after launch.
- **Docs:** `CLAUDE.md` lines 28, 33, 40, 43, 49, 68, 71–74 and the launch/session sections. `README.md` :81–88 already lists the `_DEMO`/`_PROD` keys; check it matches.

## Tasks & Acceptance

**Execution:**
- [x] `lib/server/env.ts`, `lib/shared/environments.ts`, `lib/shared/app-env.ts`, `.env.example` -- env model.
- [x] `lib/server/session.ts`, root `proxy.ts`, `lib/server/{proxy,refresh,logout,csrf,log}.ts` -- environment in the session, cookie and headers, per-environment upstreams.
- [x] `lib/server/launch.ts`, `app/api/token/route.ts`, `app/auth/page.tsx`, `features/shell/auth-screen.tsx`, `features/shell/disabled-screen.tsx`, `lib/shared/login-intent.ts`, `lib/shared/messages.ts` -- the new launch.
- [x] Delete `app/launch/**`, `app/launch-error/**`, `features/shell/use-is-framed*` and the framed branches. Update `app/page.tsx`.
- [x] `scripts/check-forbidden.sh`, `eslint.config.mjs`, CI, Playwright, e2e specs and fixtures, `CLAUDE.md`.
- [x] Unit and e2e tests covering every matrix row, including the Story 1.2 Vitest lists (detection, client retry with fake timers + MSW, cookie size, rotation, no secrets in bodies or logs).

**Acceptance Criteria:**
- Given the Playwright mocked upstream, when a browser opens `/auth?lpl=<demo payload>`, then it lands on `/` signed in, `lpl` is in neither the final URL nor history, a reload performs no second exchange, and the sealed environment is `demo`.
- Given the story is done, when CI runs, then `pnpm lint` (with the new gate bans), `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` and `pnpm build` pass.

## Implementation Notes

- **`/api/token` logic lives in `lib/server/token.ts`** (`handleToken`, `tokenMethodNotAllowed`); `app/api/token/route.ts` only wires it, like the session routes. Reason: the route's integration test needs upstream `access_token` fixtures, which the forbidden gate bans outside `lib/server/` (the test is `lib/server/token.test.ts`, driving the real route module).
- **Order: kill switch → 415 → clear-first.** The content-type check runs before the clear, so a cross-site form post (which can't send `application/json` without a preflight) can't sign a user out. Everything after it clears `__Host-pp_s` first. 405 and 415 bodies use the `LAUNCH_INVALID` copy with `retryable: false`; bodies over 16 KB are refused unparsed as `LAUNCH_INVALID`.
- **Status mapping details not fixed by the story:** a missing/unparseable `tenantId` claim and a 2xx exchange without tokens are 502 `LAUNCH_INVALID` (retryable: upstream faults); an upstream 3xx is 400 `LAUNCH_INVALID`.
- **Env var names in warnings:** `env.ts` exports `getSecretKeyVarName(env)` so the trimmed-key warning can name the variable without any other module spelling a `_DEMO`/`_PROD` name. Unit tests that load the real env spread `test/env-fixture.ts`.
- **Display environment:** `features/shell/display-environment.ts` (referrer → environment, `useReferrerEnvironment`) is shared by the auth screen and the disabled screen. `lib/server/environment-cookie.ts` owns the `onehealth_environment` cookie (set + read).
- **Disabled screen on `/`:** session environment → remembered cookie → prod; on `/auth` the referrer may win (same order as the auth screen).
- **Gate scope:** the `_DEMO`/`_PROD` rule also scans `e2e/`, `test/`, `scripts/`, `.github/` and root tooling configs, with the story's allowlist; the removed-symbol bans cover comments too. `.gitignore` now un-ignores `.env.example`.
- `lib/server/log.ts` lost `logBody`/`redactBody` (no server body logging, D6) and gained `logLaunch`.

## Spec Change Log

## Review Triage Log

### Iteration 1

- **Full review (three layers):** the launch/token flow, env, session, headers and gate.
- **Light check for pure deletions:** `app/launch/**`, `app/launch-error/**`, `use-is-framed*`. No dangling references; gate and build green.

**INTENT_GAP → human decided "defer to the epic owner" (no revert; recorded in `deferred-work.md`):**
- **Lost-response retry wipes the fresh session** (blind-hunter + edge-case) — `medium`. Attempt 1 seals; its response is lost; attempt 2 gets `LAUNCH_USED`, and the mandated clear-first deletes the new session. This conflicts with Story 1.2's frozen clear-first and used→400 rules.
- **Login CSRF** (edge-case) — `medium`, security. A cross-site link to `/auth?lpl=<attacker payload>` auto-launches (D9) and signs the victim into the attacker's account. Mitigating it changes D9's auto-start.
- **Hopeless retries** (blind-hunter + edge-case) — `low`. `LAUNCH_USED`, `LAUNCH_EXPIRED`, `LAUNCH_CONFIG` and `SERVICE_DISABLED` lack `retryable:false`, so the user waits about 6 s and four more upstream calls are made. This is mandated by Story 1.2 ("exchange failures carry no `retryable: false`").

**PATCH:**
- **A whitespace-only key passes boot** and then 503s both environments; **identical DEMO/PROD keys** detect everything as prod (blind-hunter + edge-case) — `medium`. Fix: boot checks.
- **`request.text()` buffers an unbounded body** before the 16 KB check (blind-hunter + edge-case) — `low`. Fix: `Content-Length` precheck.
- **An empty `?lpl=` sends a doomed POST and clears the session** (edge-case) — `low`.
- **`isSafeIntent` prefix also rejects `/authors` and `/apiary`** (blind-hunter + edge-case) — `low`. Fix: match path segments.
- **`headers.spec` hard-codes 404 for `/account` and `/handoff/portal`** (blind-hunter) — `low`. It breaks when Epic 7 adds those routes.
- **`ACCOUNT_DISABLED` is documented as working but isn't enforced yet** (blind-hunter) — `medium` for operators during an incident. Fix: a docs note in `.env.example` and README.
- **The new ESLint rules are untested** (verification-gap) — `medium`, gap: `no-restricted-properties` is off in `app-env.ts`, so the selector is the only guard.
- **`handleToken`'s fail-closed catch is untested** (verification-gap) — `medium`, gap.

**DEFER (`deferred-work.md`):**
- **No token revoke after a failed post-exchange launch** (`WRONG_TENANT`, a `/myself` mismatch, a seal fault; blind-hunter) — `medium`. The old `/launch` had the same gap. `all-devices` (D3) would be wrong for a wrong-tenant launch, so this needs a single-token revoke design.
- **Error bodies omit the detected environment**, so a demo user with no referrer or cookie gets a Production link on the error screen (blind-hunter) — `low`. The story fixes the error-body fields.
- **CLAUDE.md should also say `ACCOUNT_DISABLED` is not yet enforced** (blind-hunter) — `low`; agent-context file.
- **R3 notes** (verification-gap + blind-hunter):
  - `saveLoginIntent` has no caller until R3;
  - the expiry redirects (`requireSession`, the root proxy) drop `?tab=` until R3 saves the intent;
  - `saveLoginIntent` should store pathname + search without the hash (`epics.md:1151`).

**REJECTED:**
- **Loose referrer match (`includes("demo.1health")`)** — `false` as a defect: Story 1.2 specifies "hostname containing", and the referrer only picks displayed labels and links (D2).
- **The `/?lpl=` legacy redirect was removed; `PORTAL_URL` lost `/applications`** — `false`: D1 removes the `lpl` redirect, and D4 sets `portalUrl` to the API root.
- **Interim CSRF fallback behind a proxy** — `low`: Vercel's `request.url` carries the public host, `Sec-Fetch-Site` covers modern browsers, and R2 deletes CSRF.
- **Missing or NaN `expires_in`** — `low`: it fails safe, because the token counts as expired and the first call refreshes using refresh.ts's fallback.
- **`IS_LOCAL_DEV` and `isLocalDev()` duplicate each other** — `false`: Story 1.1 mandates both, one server-side and one client-side.
- **Transport-error copy reads "link expired"; init status region empty; Strict Mode double-mount untested; percent-encoded intent paths; `waitForTimeout` in e2e; the e2e mock is origin-agnostic** — `low` or `false`: transient or cosmetic, harmless (`/auth` without `lpl` only shows the manual card), and the spec makes the mock path-based.

## Design Notes

- **Why 1.1 + 1.2 together (Q1):** removing `APP_ENV` and the single key breaks the existing `/launch` the moment it lands. Combining the stories avoids a throwaway two-key bridge.
- **Why the old cookie counts as no session:** a pre-R1 seal has no `environment`, so its upstream root is unknown. Treating it as no session sends the user through `/auth` once, rather than guessing an environment.
- **Why interim CSRF uses the request origin:** `APP_ORIGIN` is gone, and R2 deletes CSRF under D5. Behind Vercel, `request.url` carries the deployment host, and modern browsers send `Sec-Fetch-Site`, so the `Origin` fallback rarely runs.
- **Review depth (user instruction):** the launch, token, env, session and header changes get the full three-layer review. Pure deletions (`app/launch/**`, `app/launch-error/**`, the framing files) get a light check instead: no dangling imports or references, the gate is clean, and the build passes.

## Verification

**Commands:**
- `pnpm lint` -- expected: passes; `check-forbidden: clean.`
- `pnpm typecheck` -- expected: zero errors.
- `pnpm test` -- expected: all pass.
- `CI=1 pnpm test:e2e` -- expected: all pass on both projects.
- `ONEHEALTH_SECRET_KEY_DEMO=dummy-demo-secret ONEHEALTH_SECRET_KEY_PROD=dummy-prod-secret APP_ID_DEMO=dummy-app-demo APP_ID_PROD=dummy-app-prod SESSION_SECRET=dummy-session-secret-0123456789abcdef pnpm build` -- expected: succeeds; `/auth` and `/api/token` present; no `/launch*` route.
