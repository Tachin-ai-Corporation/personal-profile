---
title: 'Story 1.1: Foundation — env config, security headers, test tooling, CI, legacy removal'
type: 'chore'
created: '2026-10-13'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '155fae9a89df9dfbb8461c7a7841739e9c3d9b0e'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-personal-profile-2026-10-13/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The repo is the 1health App Starter: browser-held tokens, a manual environment chooser / referrer detection, no security headers, no tests or CI, and `typescript.ignoreBuildErrors` on. None of this is allowed by the Personal Profile spine, and the dead template code (generic `lib/api` engines, legacy auth) blocks a clean typecheck.

**Approach:** Stand up the deployment substrate every later story builds on — one validated server config per environment, per-request security headers, a Vitest/Playwright test stack, a GitHub Actions CI gate — and delete all legacy auth/template code, leaving a minimal placeholder app. This story implements no launch, proxy, refresh, or data fetch (those are Stories 1.2–1.5).

## Boundaries & Constraints

**Always:**
- `lib/server/env.ts` starts with `import "server-only"` and is the **only** reader of server `process.env`. The single client-side exception is `process.env.NEXT_PUBLIC_APP_ENV`, read only in `lib/shared/app-env.ts`.
- `env.ts` exports `APP_ENV`, `API_ORIGIN`, `APP_ORIGIN`, `PORTAL_ORIGIN`, `PORTAL_URL`, `APP_ID`, `DEFAULT_TENANT_ID`, `ONEHEALTH_SECRET_KEY`, `SESSION_SECRET`, `SESSION_SECRET_PREVIOUS` (optional), `PLACES_ENABLED`, `GOOGLE_PLACES_KEY`, `PP_DISABLED`. `API_ORIGIN`/`PORTAL_ORIGIN` are fixed by `APP_ENV` (dev→`https://dev.1hdev.io`, demo→`https://demo.1health.io`, prod→`https://app.1health.io`); `PORTAL_URL = ${PORTAL_ORIGIN}/applications`; `DEFAULT_TENANT_ID = 1`; `PLACES_ENABLED`/`PP_DISABLED` are `true` only for the exact string `"1"`.
- Validation runs at boot (imported from `instrumentation.ts` `register()`): a missing/invalid required var fails boot with a message that **names the var and never prints its value**.
- `proxy.ts` (Next 16 request interceptor, matcher over every path incl. 404s and static assets) sets, on every response, a fresh ≥128-bit per-request nonce CSP plus `Strict-Transport-Security: max-age=63072000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `Cross-Origin-Opener-Policy: same-origin-allow-popups`. `frame-ancestors` is exactly `PORTAL_ORIGIN` (never `'self'`/`*`); no `X-Frame-Options` is sent; the nonce reaches the App Router via the `x-nonce` request header so Next's scripts carry it.
- `callApi` keeps the `callApi(context, path, init)` signature and issues a plain same-origin `fetch(path, init)` to the given `/api/...` path; `ApiResponse<T>`, `ok`, `err` stay exported.
- CI runs only with dummy secret values; the forbidden-pattern grep runs in both `pnpm lint` tooling and CI and scopes to source dirs (`app`, `components`, `contexts`, `hooks`, `features`, `lib`), excluding `lib/server/`, `_bmad*`, `docs`, `.claude`, `.next`, `node_modules`, and `scripts/check-forbidden.sh` itself.
- Keep untouched: `components/ui/**`, `hooks/use-toast.ts`, `components/toaster-wrapper.tsx`, `lib/utils.ts`, and the design tokens in `app/globals.css`. Light theme stays default.

**Never:**
- No real 1health credentials in code, tests, or CI; never print a secret's value in a boot error.
- No manual environment chooser, `getOneHealthBaseUrl()` environment switch, or `document.referrer` environment detection anywhere in the repo.
- No `document.cookie` or `access_token` in any file under `app/`, `components/`, `contexts/`, `hooks/`, `features/`, or `lib/` outside `lib/server/`.
- No launch/token-exchange/refresh/proxy-forwarding logic in this story; `app/page.tsx` is a placeholder with no data load and no session check.
- Don't enable `cacheComponents`; no `s-maxage` anywhere in config; don't alter design tokens or add the `/api/1h` allowlist (Story 1.3).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Valid boot | `APP_ENV=demo` + all required vars set | `env.ts` resolves; `API_ORIGIN==="https://demo.1health.io"`, `DEFAULT_TENANT_ID===1` | N/A |
| Missing required var | `APP_ENV`, `APP_ORIGIN`, `APP_ID`, `ONEHEALTH_SECRET_KEY`, or `SESSION_SECRET` unset | Boot throws | Message names the var; value never printed |
| Bad `APP_ENV` | `APP_ENV=staging` | Boot throws | Names `APP_ENV` |
| Bad `APP_ORIGIN` | non-`https://` or has a path | Boot throws | Names `APP_ORIGIN` |
| Short session secret | `SESSION_SECRET` < 32 chars | Boot throws | Names `SESSION_SECRET`, not its value |
| Places misconfig | `PLACES_ENABLED=1` with no `GOOGLE_PLACES_KEY` | Boot throws | Names `GOOGLE_PLACES_KEY` |
| Boolean parse | `PLACES_ENABLED` is `"1"` vs `"true"`/`""`/unset | `true` only for `"1"`, else `false` | N/A |
| CSP freshness | Two GETs to `/` | The two responses' CSP nonces differ | N/A |
| Headers everywhere | GET `/`, an unknown 404 path, `/favicon.png`, a `/_next/static/*` asset | All carry the full AD-21 header set incl. a nonce CSP; none sends `X-Frame-Options` | N/A |

</frozen-after-approval>

## Code Map

- `lib/api/client.ts` — **modify.** Drop `@/lib/auth-client` import; `callApi` → `fetch(path, init)` same-origin returning `ApiResponse<T>`; `callApiRaw` → same-origin `fetch` returning `Response`; keep `ok`/`err`/`ApiResponse`.
- `lib/api/index.ts` — **modify.** Re-export only `callApi, callApiRaw, ok, err, ApiResponse` (client) and `endpoints, RECORD_TYPES, TYPE_REST_PATH, ATTRIBUTES` (config). Remove every deleted-module export and the `user`/`tenant`/`types` exports.
- `lib/api/config.ts` — **modify.** Keep `RECORD_TYPES`/`TYPE_REST_PATH`/`ATTRIBUTES`; remove the dead `endpoints` builders tied to deleted features (leave `endpoints = {}` — real paths return per story from 1.3).
- `lib/api/types.ts` — **delete.** Models only the deleted query/grid/workflow engines; nothing kept imports it.
- `lib/api/user.ts`, `lib/api/tenant.ts` — **delete.** Both import the deleted `auth-client`; `useMyself` is rebuilt in Story 1.4.
- `lib/api/{workflow-provisioning,workflow-template,campaign,journey,journey-step,grid,attachments,comments,custom-data,partnerships,query,schema,step-config}.ts` — **delete** (not allowlisted, AD-2).
- `lib/auth-client.ts` — **delete** (AD-1); nothing may import it afterward.
- `app/api/token/**`, `app/auth/**` — **delete** (AD-1, AD-4).
- `contexts/navigation-context.tsx` (reads `document.cookie`), `contexts/session-context.tsx`, `hooks/use-session-expired.ts`, `components/auth-exit-dialog.tsx`, `components/settings-page.tsx`, `components/home-page-client.tsx`, `components/workflow/**` — **delete.**
- `app/layout.tsx` — **modify.** Remove `NavigationProvider` import/wrapper; keep Inter font + `ToasterWrapper` + `Suspense`; update metadata to Personal Profile.
- `app/page.tsx` — **modify.** Reduce to a minimal placeholder `<main>` (no `cookies()`, no redirect, no client component).
- `next.config.mjs` — **modify.** Remove `typescript.ignoreBuildErrors`; keep `images.unoptimized`; ensure no `eslint.ignoreDuringBuilds`, no `cacheComponents`, no `s-maxage`.
- `eslint.config.mjs` — **modify.** Add a rule banning `process.env` outside `lib/server/env.ts` (allow `NEXT_PUBLIC_APP_ENV` in `lib/shared/app-env.ts`) and a rule banning `dangerouslySetInnerHTML` (AD-11). Keep existing ignores.
- `package.json` — **modify.** `engines.node="24.x"`, `packageManager="pnpm@12.x"`; scripts `test`=`vitest run`, `test:e2e`=`playwright test`, `dev`=`next dev --experimental-https`; add devDeps `vitest@5.0.4`, `@testing-library/react@16.3.3`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`, `@vitejs/plugin-react`, `msw@3.0.3`, `@playwright/test@1.64.0`, and dep `iron-session@9.0.1`.
- `tsconfig.json` — reference only; already strict and includes `**/*.ts(x)`. No change expected.

## Tasks & Acceptance

**Execution:**
- [x] `lib/server/env.ts` — create the `server-only` env reader/validator exporting the full var set, fixed origins per `APP_ENV`, `"1"`-only boolean parsing, and boot-fail errors that name but never print a var.
- [x] `lib/server/env.test.ts` — Vitest table (node env) covering every failure row in the I/O Matrix plus one valid boot per `APP_ENV`; assert error messages name the var and never contain the value.
- [x] `lib/shared/app-env.ts` — export the client-safe `APP_ENV` from `process.env.NEXT_PUBLIC_APP_ENV` (the sole client `process.env` access).
- [x] `instrumentation.ts` — `register()` imports `lib/server/env.ts` so validation runs at boot.
- [x] `proxy.ts` — Next 16 request interceptor over all paths: generate a ≥128-bit nonce, set the exact AD-21 CSP + security headers, `frame-ancestors` = `PORTAL_ORIGIN` only, no `X-Frame-Options`, forward the nonce as `x-nonce`.
- [x] `vitest.config.ts` + `vitest.setup.ts` — node env for `lib/server/**`, jsdom for component tests; shared setup loads `@testing-library/jest-dom` and starts an MSW server at the `/api` boundary with `onUnhandledRequest: "error"`.
- [x] `app/page.test.tsx` + `lib/api/client.test.ts` — a Testing Library component test of the placeholder page and an MSW-backed test that `callApi` resolves a same-origin `/api/...` fetch into `ApiResponse` (the three sample tests are these two plus the env table).
- [x] `playwright.config.ts` + `e2e/headers.spec.ts` — `webServer` with dummy env (`APP_ENV=dev`, dummy secrets); desktop Chromium + 360×740 mobile projects; spec asserts the full AD-21 header set on `/`, a 404 path, and one static asset.
- [x] `.github/workflows/ci.yml` — Node 24 + corepack pnpm + `pnpm install --frozen-lockfile`; run lint → typecheck → test → Playwright browser install + `test:e2e` → build, each failing step failing the check; dummy secrets only.
- [x] `scripts/check-forbidden.sh` — fail on `NEXT_PUBLIC_*SECRET*`, secret names ending `_DEMO`/`_PROD`, or `document.cookie`/`access_token` in client source; exclude itself and non-source dirs; wire it into CI (and runnable locally).
- [x] `lib/api/client.ts`, `lib/api/index.ts`, `lib/api/config.ts` — rewrite per Code Map so the API surface no longer touches `auth-client` or deleted modules.
- [x] `app/layout.tsx`, `app/page.tsx` — strip providers/guards to the placeholder shell per Code Map.
- [x] `next.config.mjs`, `eslint.config.mjs`, `package.json` — apply the config/lint/stack changes per Code Map; run `pnpm install` to refresh the lockfile.
- [x] Delete the legacy/template files listed in the Code Map (lib/api engines + `user`/`tenant`/`types`, `auth-client`, `app/api/token`, `app/auth`, the contexts/hooks/components), then grep to confirm no importer of a deleted module remains and no `document.cookie`/`access_token` survives in client source.

**Acceptance Criteria:**
- Given `APP_ENV` is `dev`/`demo`/`prod` with required vars set, when the server boots via `instrumentation.ts`, then `env.ts` exports the full resolved var set with origins fixed per environment; given any required var is missing/invalid, boot fails naming the var without printing its value, and `env.test.ts` covers each case plus a valid boot per environment.
- Given any request (`/`, a 404 path, or a static asset), when the response is produced, then it carries a fresh nonce CSP and the full AD-21 header set, `frame-ancestors` is exactly `PORTAL_ORIGIN`, no `X-Frame-Options` is sent, and two requests to `/` yield different nonces.
- Given the finished codebase, when `pnpm lint` runs, then `process.env` outside `lib/server/env.ts` (except `NEXT_PUBLIC_APP_ENV` in `lib/shared/app-env.ts`) and `dangerouslySetInnerHTML` both fail, and no chooser/`getOneHealthBaseUrl` switch/`document.referrer` detection remains.
- Given the deletions, when `pnpm typecheck` and `next build` run, then both pass with zero type errors, `typescript.ignoreBuildErrors` is gone, and `callApi` retains its signature issuing a plain same-origin fetch.
- Given the test stack, when `pnpm test` runs, then ≥3 sample tests pass (env table, a component test, an MSW-backed `/api` fetch) with MSW erroring on unhandled requests; when `pnpm test:e2e` runs, Playwright starts with dummy env and the header spec passes on all three target paths.
- Given a PR, when `ci.yml` runs on Node 24 with dummy secrets, then lint/typecheck/test/e2e/build run in order and any failure fails the check, and `check-forbidden.sh` fails the job on any forbidden pattern in source.

## Implementation Notes

- **MSW option rename.** `msw@3.0.3` renamed `onUnhandledRequest` → `onUnhandledFrame`; the installed package was verified to expose only `onUnhandledFrame` (no `onUnhandledRequest` in its dist). `vitest.setup.ts` uses `onUnhandledFrame: "error"`, preserving the spec's "error on unhandled requests" behavior.
- **`packageManager` exact pin.** corepack rejects a range, so `packageManager` is pinned to `pnpm@12.11.2` (within the 12.x line) rather than the literal `pnpm@12.x`.
- **Proxy runtime.** Next 16 runs `proxy.ts` on the Node.js runtime and forbids a route-segment `runtime` config there; this lets the proxy import the `server-only` env module. Nonce uses Web Crypto `getRandomValues` + `btoa` (Edge-safe anyway).
- **ESLint for `app-env.ts`.** The sole client `process.env.NEXT_PUBLIC_APP_ENV` read uses a single-line inline `eslint-disable-next-line` rather than a file-scoped override; `lib/server/env.ts` and test/config files have file-scoped overrides.
- **`AGENTS.md`** is auto-generated by `next dev` (Next 16), not hand-written; left untracked for the user to decide whether to commit.
- **Matrix coverage addition (during build verification).** The e2e header spec originally covered `/`, a 404 path, and `/favicon.png`, but not the matrix's distinct `/_next/static/*` asset target. Added an e2e test that discovers a real hashed `/_next/static/*` URL from the homepage and asserts the full AD-21 header set on it (both Chromium-desktop and mobile-360 projects). All 10 e2e tests pass.

## Spec Change Log

- Added one e2e test (`a /_next/static/* asset carries the full AD-21 header set`) to close a Matrix Test Audit gap on the "Headers everywhere" row; no spec/frozen content changed, test-only.

## Review Triage Log

### Iteration 1 — three layers (blind-hunter, edge-case, verification-gap)

**PATCH (auto-fix, applied this iteration):**
- **CSP nonce propagation untested** (verification-gap + blind-hunter) — `high`-if-regressed. Verified: within one response the CSP header nonce exactly equals the single nonce on all 23 script tags (dev-server check), so propagation works — but no test asserts it. A regression severing `x-nonce` forwarding would ship green while `'strict-dynamic'` blanks the page. Fix: add a Playwright browser test that `page.goto("/")`, asserts the script-tag nonce equals the CSP header nonce and no `securitypolicyviolation`/`pageerror` fires.
- **e2e CSP assertion checks only a subset of directives** (blind-hunter) — `medium`. Verified: `assertSecurityHeaders` checks `default-src`, `script-src` nonce, `frame-ancestors`, `object-src`, `base-uri`, `upgrade-insecure-requests` but never `connect-src`, `form-action`, `style-src`, `img-src`, `font-src`, which the spec pins exactly. A regression dropping one passes CI. Fix: assert the complete expected CSP string.
- **`check-forbidden.sh` over-prunes with `--exclude-dir=server`** (edge-case + blind-hunter) — `low`, spec deviation. Verified: `--exclude-dir=server` prunes any dir named `server` at any depth; the spec scopes the exclusion to `lib/server/` only. No live gap today (lib/server is the only such dir) but latent. Fix: anchor the exclusion to `lib/server` only. (Direct correction, not added complexity → patched.)

**PATCH OUTCOME (applied by the re-engaged implementation subagent; re-verified full suite green):**
- The nonce-reaches-scripts patch **uncovered a real production bug**: Next derives the nonce it stamps on scripts from the forwarded request `content-security-policy` header (not `x-nonce`), and only a dynamically-rendered page carries a per-request nonce. The placeholder page was statically prerendered and the proxy forwarded only `x-nonce`, so in a production build its scripts had **no** nonce and `'strict-dynamic'` would have blanked the page. (My earlier dev-server check was misleading — `next dev` always renders dynamically.) Fixes: `proxy.ts` now also sets `content-security-policy` on the forwarded request headers; `app/page.tsx` adds `export const dynamic = "force-dynamic"` (AD-18); `playwright.config.ts` e2e webServer switched to `next build && next start` so the suite exercises the production path (`next dev` HMR uses `eval`, which legitimately trips strict CSP and is not representative).
- CSP-directive assertion strengthened to pin the exact 11-directive string; `check-forbidden.sh` exclusion anchored to `lib/server` only. All patches verified: `lint`/`typecheck`/`test` (18/18)/`build`/`test:e2e` (12/12, production build) all pass.
- **Re-verification observation → deferred:** the production build shows `/_not-found` is still statically prerendered, so the 404 page's scripts carry no per-request nonce (a non-interactive 404 under strict-dynamic). Low harm for a placeholder 404 (HTML + headers are correct; only hydration is blocked), but same class as the fixed bug. Deferred for when real routes land.

**DEFER (not this story's problem / agent-context / can't verify here):**
- **`AGENTS.md` inclusion vs Implementation Note** (blind-hunter) — fix edits an agent-context file → defer. (It only appears in the diff because the review staged all untracked files with `git add -N`; it is auto-generated by `next dev`.)
- **No `.env.example` / documented env contract** (blind-hunter) — `low` developer-doc; adds new file surface, not a spec task → defer.
- **Stale docs (README, CLAUDE.md, docs/*)** (blind-hunter) — fix edits agent-context files and pre-existing docs → defer.
- **CI Node/pnpm cache ordering (`cache: pnpm` after `corepack enable`)** (blind-hunter) — `maybe-false`, `medium`-if-true. Cannot be verified without a GitHub Actions runner; local runs can't exercise it. Settle by watching the first CI run; if the cache step fails to find pnpm, add `pnpm/action-setup` before `setup-node`.

**REJECTED (verified low; fix adds guards/complexity or no real harm):**
- **`SESSION_SECRET_PREVIOUS` not length-validated** (edge-case) — `low`; optional rotation key, not spec-required to validate, misconfig surfaces later at unseal; fix adds a guard → reject.
- **Playwright webServer http vs `APP_ORIGIN=https`** (blind-hunter) — `low`; `APP_ORIGIN` is unused at runtime this story (origin/CSRF checks arrive in 1.2+); fix adds dev-cert complexity → reject (revisit in 1.2).
- **Forbidden gate runs twice in CI** (blind-hunter) — `low`/cosmetic; the explicit named step aids CI visibility and the spec wants the gate in both `pnpm lint` and CI → reject.
- **`resolveAppOrigin` accepts userinfo (`https://user:pass@host`)** (blind-hunter) — `low`; `url.origin` strips userinfo so the stored value is clean; fix adds a guard → reject.
- **`callApi`/`callApiRaw` don't enforce the same-origin `/api/...` contract** (blind-hunter) — `low`; the spec specifies a "plain same-origin fetch", enforcement is the proxy allowlist (Story 1.3), and there are no callers yet; fix adds a guard → reject.
- **`_DEMO`/`_PROD` regex is broad** (blind-hunter) — `low`; no current client constant trips it, over-matching errs safely toward blocking secrets, any false positive is caught in CI; fix adds complexity → reject.

## Design Notes

- **Boolean + boot error shape** (never leak values):
  ```ts
  const bool = (v: string | undefined) => v === "1"
  function required(name: string): string {
    const v = process.env[name]
    if (!v) throw new Error(`[env] Missing required variable: ${name}`) // name only
    return v
  }
  ```
- **CSP string** (interpolate the per-request nonce and `PORTAL_ORIGIN`):
  `default-src 'self'; script-src 'self' 'nonce-<n>' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors <PORTAL_ORIGIN>; upgrade-insecure-requests`
- **Next 16 `proxy.ts`:** this file is the Next 16 request interceptor that replaced `middleware.ts`. Confirm the current Next 16.4 API for the file name, the `config.matcher` (must include static assets and 404s), how to mutate forwarded request headers (`x-nonce`) and response headers, and nonce generation (`crypto.randomUUID()`/`crypto.getRandomValues`, Edge-safe) against the installed Next version before finalizing.
- **ESLint `no-process-env`:** apply `no-restricted-properties`/`no-process-env` globally with file-scoped overrides re-allowing it in `lib/server/env.ts` and the single `NEXT_PUBLIC_APP_ENV` member expression in `lib/shared/app-env.ts`.
- **External (not this story, owner Daniel Garcia):** real secret values, Vercel projects, and External Application registration (AD-20) — out of scope; this story only needs the reader, validator, and dummy test values.

## Verification

**Commands:**
- `corepack pnpm install` — expected: resolves and writes a clean lockfile with the new test deps.
- `corepack pnpm lint` — expected: passes; a deliberate `process.env` use outside `env.ts` or a `dangerouslySetInnerHTML` would fail.
- `corepack pnpm typecheck` — expected: zero errors with `ignoreBuildErrors` removed.
- `corepack pnpm test` — expected: env table + component + MSW sample tests pass; MSW errors on any unhandled request.
- `corepack pnpm build` — expected: production build succeeds.
- `corepack pnpm test:e2e` — expected: Playwright (Chromium + mobile) header spec passes on `/`, a 404, and a static asset.
- `bash scripts/check-forbidden.sh` — expected: exits 0 on the cleaned tree.
- `git grep -nE "document\.cookie|access_token" -- app components contexts hooks features 'lib/*' ':!lib/server'` — expected: no matches.
