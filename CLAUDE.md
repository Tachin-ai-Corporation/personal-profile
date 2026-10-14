# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Next.js (App Router) + React + Tailwind v4 + shadcn/ui app for the 1health platform. The portal opens it **in its own tab** (it is never framed) at `/auth?lpl=…` with an encrypted Launch Payload (LPL). From then on the **browser never talks to 1health**: it calls only this app's own same-origin `/api/...` routes through `callApi`, and the Next server (a BFF) holds the tokens and proxies to 1health.

The design of record is the architecture spine: `_bmad-output/planning-artifacts/architecture/architecture-personal-profile-2026-10-13/ARCHITECTURE-SPINE.md` (decisions are cited as `AD-n` in code comments). The human decisions **D1–D13** of 2026-10-14 (`_bmad-output/planning-artifacts/epics.md`, "Launch and environment decisions") override the spine wherever they differ; code cites them as `D-n`.

## Commands

Package manager is **pnpm 12**, run through corepack. Use `corepack pnpm …` if `pnpm` isn't on PATH. Its settings (`allowBuilds`, release-age excludes) live in `pnpm-workspace.yaml`.

```bash
pnpm install
pnpm dev        # https://localhost:3000 (also the "dev" config in .claude/launch.json)
pnpm build
pnpm lint       # eslint . + scripts/check-forbidden.sh (forbidden-pattern gate)
pnpm typecheck  # tsc --noEmit
pnpm test       # Vitest (jsdom default; MSW mocks the same-origin /api boundary)
pnpm test:e2e   # Playwright against `next build && next start` on :3100
```

- Stack: Next.js 16 (App Router), React 19, Tailwind v4, SWR 2, zod 4, iron-session, Node 24.
- TypeScript is pinned to 6.x, because typescript-eslint doesn't support TS 7 yet.
- CI (`.github/workflows/ci.yml`) runs forbidden-pattern gate → lint → typecheck → test → e2e → build. Builds no longer ignore type errors.
- **Env (D1):** vars are read **only** in `lib/server/env.ts` (lint-enforced). The one other `process.env` reader is `lib/shared/app-env.ts#isLocalDev()`, which may read only `NODE_ENV` (D6, lint-enforced). The boot fails, naming the variable and never its value, if one is missing or invalid.
  - **Required:** `ONEHEALTH_SECRET_KEY_DEMO`, `ONEHEALTH_SECRET_KEY_PROD`, `APP_ID_DEMO`, `APP_ID_PROD`, `SESSION_SECRET` (≥ 32 chars).
  - **Optional:** `SESSION_SECRET_PREVIOUS`, `PLACES_ENABLED` + `GOOGLE_PLACES_KEY`, `PP_DISABLED` and `ACCOUNT_DISABLED` (kill switches; flags are `true` only for `"1"`).
  - `env.ts` also exports `IS_LOCAL_DEV`, `DEFAULT_TENANT_ID = 1`, `getSecretKey(env)`, `getAppId(env)` and `getSecretKeyVarName(env)`. Keys are returned as stored; whitespace around one is not a boot error.
  - **One deployment serves demo and prod.** There is no `APP_ENV`, `APP_ORIGIN`, `API_ORIGIN`, `PORTAL_URL`, `APP_ID`, `ONEHEALTH_SECRET_KEY` or `NEXT_PUBLIC_*` variable, and no `dev` environment.
  - **Origins:** `lib/shared/environments.ts` is the only module that knows a 1health origin: `Environment = "demo" | "prod"` → `apiRoot` (`https://1health.demo.1health.io` / `https://1health.app.1health.io`), `apiBase` (`<apiRoot>/api`), `portalUrl` (same root) and `publicFilesOrigin` (unset for now).
  - `.env.example` lists the set with dummy values. `pnpm build` needs them set too; CI and Playwright use dummy values.
- **Forbidden-pattern gate (`scripts/check-forbidden.sh`, in `pnpm lint` and CI):**
  - In client code (outside `lib/server/`) it fails on `NEXT_PUBLIC_*SECRET*`, `document.cookie` and `access_token`.
  - A `_DEMO`/`_PROD` name is allowed only in `lib/server/env.ts`, its tests, `.env.example`, `.github/workflows/ci.yml`, `playwright.config.ts`, `vitest.setup.ts`, `test/` and `e2e/fixtures.ts`. Unit tests that load the real env spread `test/env-fixture.ts`.
  - In app code (incl. `lib/server/`, the root `proxy.ts` and `instrumentation.ts`; `*.test.*` and `e2e/` skipped) it fails on `APP_ENV`, `API_ORIGIN`, `APP_ORIGIN`, `PORTAL_URL`, `PORTAL_ORIGIN`, `PUBLIC_FILES_ORIGIN`, `SameSite=None`, `Partitioned`, `window.top` and `bg-black/50`, **comments included**.
  - `scripts/check-forbidden.test.ts` proves each rule.
- **ESLint** also bans `dangerouslySetInnerHTML` everywhere, inline SWR keys, `fetch` outside `lib/api/client.ts` in client dirs, and `NextResponse.redirect` in `app/handoff/**` (use `seeOther()`, Epic 7).

## Architecture

### Launch (Story 1.2; D1, D2, D9)
- **`/auth` (`app/auth/page.tsx`)** is a force-dynamic server wrapper that reads only the remembered `onehealth_environment` cookie (`lib/server/environment-cookie.ts`) and renders `features/shell/auth-screen.tsx`.
  - The client screen reads `lpl` (spaces → `+`) and removes it with `history.replaceState` before sending anything.
  - It POSTs `{ lpl }` to `/api/token` through `callApi("auth/token", …)`: at most 5 attempts, a fixed 1,500 ms apart, stopping early on a body with `retryable: false`.
  - On `{ ok: true }` it shows "Success!" and after 1,200 ms calls `window.location.assign(consumeLoginIntent("/"))` (`lib/shared/login-intent.ts`, sessionStorage `pp:login-intent`, same-origin paths not under `/auth` or `/api`).
  - Otherwise it shows the destructive error Alert (body `message`, or the fallback / "Connection Error") with "Enter LPL Manually", "Switch Environment" and "Go to 1health ({env})".
  - Without `lpl` it shows the manual-entry card, or "Choose Environment" when no environment is known.
  - **The shown environment is display only:** the referrer (`features/shell/display-environment.ts`), then the cookie, then a choice, else prod. It is never sent and never read from `document.cookie`.
- **`POST /api/token`** (`app/api/token/route.ts` → `lib/server/token.ts`; other methods 405) has no CSRF or binding check. Its pipeline:
  1. `PP_DISABLED` → 503 `SERVICE_DISABLED` (no decrypt, cookie untouched).
  2. Non-JSON → 415. From here every response clears `__Host-pp_s` first.
  3. Only `lpl` is read. **Environment detection** (`detectEnvironment` in `lib/server/launch.ts`) tries the PROD key, then DEMO, each as stored and then `.trim()`-ed (one warning names the variable when only the trimmed variant decrypts). The key that decrypts sets `environment`.
  4. `LAUNCH_INVALID` (400, `retryable: false`) for a bad payload or `apiKey.name` ≠ `APP_ID_<ENV>`; `LAUNCH_CONFIG` (503) for a key that can't form an AES key.
  5. One exchange at `<apiRoot>/api/v2/public/external-application/auth/oauth2/user/token` (25 s, `redirect: "manual"`, signature keyed with the variant that decrypted). Failures map to `LAUNCH_USED` / `LAUNCH_EXPIRED` / `LAUNCH_INVALID` (400; 502 for 5xx, timeout or network).
  6. Plaintext `tenantId` ≠ 1 → 403 `WRONG_TENANT` (`retryable: false`). Then one `/myself` whose id must equal the payload user, else 502 `LAUNCH_INVALID`.
  7. Seal → 200 `{ ok: true, environment }` plus `onehealth_environment` (`HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`).
  - Error bodies are `{ ok: false, errorCode, source: "proxy", message, retryable? }`, with `message` from `LAUNCH_ERROR_MESSAGES`. No token, code, id or upstream text in any body; no-store headers; one `logLaunch` line (request id, route, outcome, environment, duration).
  - `callApi` keeps a `source: "proxy"` body's `message`/`retryable` in `details`.
- There is no `/launch`, `/launch/verify`, `/launch/dev` or `/launch-error` route, no `?lpl` handling in `proxy.ts`, no blocked-cookie screen and no dev paste page. Locally, open `https://localhost:3000/auth?lpl=<payload>` or paste it into the manual card.
- **Kill switch on pages:** with `PP_DISABLED`, `/` and `/auth` render `features/shell/disabled-screen.tsx` directly (no redirect). Its "Go to 1health" goes to the shown environment's portal (on `/`: session → cookie → prod; on `/auth` the referrer may win). Story 1.16 owns the 503 status.

### Session (server only)
- `lib/server/session.ts` seals one cookie, `__Host-pp_s` (iron-session), exactly `HttpOnly; Secure; SameSite=Lax; Path=/` (no `Partitioned`, `Domain`, `Max-Age` or `Expires`; ≤ 3,800 bytes).
  - It holds access/refresh tokens, `accessTokenExpiresAt`, **`environment`** (`demo|prod`), user/person/tenant ids, a per-launch `sid`, the refresh generation `gen`, `refreshedAt`, `iat` and `lastSeen`. The API root and `id_token` are never stored.
  - **A cookie that unseals without a valid `environment` counts as no session** (pre-D1 seals go through `/auth` once).
  - Tokens never reach the browser and no response body carries one. Server code reads it with `getSession()`/`requireSession()`; `requireSession()` redirects to `/auth` (no query). `SESSION_SECRET_PREVIOUS` is accepted for unsealing only. There is no login form.
- **Every upstream call uses the session's environment** (`environments[session.environment]`): the proxy's `apiBase` and its origin assertion, refresh (`<apiRoot>/auth/oauth2/token`) and the logout revoke (`<apiRoot>/auth/user/logout`). Never take an environment from a request, URL, referrer or cookie for an API call.
- **Session limits (Story 1.6, AD-16):** a session ends after `IDLE_TIMEOUT_MS` (15 min) without user activity or `ABSOLUTE_TIMEOUT_MS` (8 h) after launch (`isSessionAged` in `lib/server/session.ts`). `getSession()` returns `null` for an aged session, the same as for no cookie. Routes answering `401 SESSION_EXPIRED` also clear the cookie when one was sent (`hasSessionCookie()`).
- **Activity (RC6):** `lastSeen` is re-sealed only for user activity. Each update echoes `X-PP-Activity-At: <epoch ms>`.
  - **`/` navigation:** a top-level `GET /` with `Sec-Fetch-Mode: navigate` (not prefetch/RSC), handled in the root `proxy.ts` because server components can't set cookies. An aged, unsealable or environment-less cookie there is cleared and redirected 307 to `/auth`.
  - **Ping:** `POST /api/session/ping` (`lib/server/ping.ts`), which returns 204.
  - **Proxy calls** with `X-PP-Activity: user` and a verified binding. The proxy re-seals only when the token has more than 55 s left (30 s skew + 25 s upstream timeout). Otherwise a late `Set-Cookie` could overwrite tokens a concurrent refresh just wrote. `X-PP-Activity` is never forwarded upstream.
  - SWR/background reads and `/api/session/refresh` never count as activity.
- `app/page.tsx` is the server guard (kill switch, then `requireSession()`). Its `portalUrl` is `environments[session.environment].portalUrl`. Inside `features/shell/client-config.tsx` it embeds `sessionBinding` (`lib/server/session-binding.ts`) and that `portalUrl`. It also renders `features/shell/idle-warning.tsx` with `idleTimeoutSec`, `lastSeen`, `absoluteExpiresAt` and `serverNow`, and `<SessionDialogs portalUrl={portalUrl} />`.
- `app/api/1h/[...path]/route.ts` is the only path to 1health (`lib/server/proxy.ts`). Every endpoint must be listed in `lib/server/proxy-allowlist.ts`, so **add an allowlist entry in the same change as the code that calls it**. Owner ids are sent as the literal `me` and filled in from the session. The proxy enforces CSRF + session binding (`lib/server/csrf.ts`) and no-store headers. **Interim until R2 removes them (D5):** CSRF's `Origin` fallback compares with the request's own origin (`new URL(request.url).origin`).
- **The proxy never refreshes.** It answers `401 TOKEN_EXPIRED` when the token is within `ACCESS_TOKEN_SKEW_MS` (30 s) of expiry or upstream returns 401.
- **Token refresh is `POST /api/session/refresh`** (`app/api/session/refresh/route.ts` → `lib/server/refresh.ts`, AD-16). Guards run in order: kill switch, CSRF, session, binding. If the token still has more than 30 s it answers 200 without calling the IdP, which is how a second tab skips a duplicate refresh. Otherwise it makes one call to `<apiRoot>/auth/oauth2/token` of the session's environment (`grant_type=refresh_token`), re-seals the cookie with `gen + 1`, the same `sid` and a new `refreshedAt`, and answers 200.
  - An IdP 401 or `invalid_grant` clears the cookie and returns `401 SESSION_EXPIRED`.
  - Other IdP failures keep the cookie and return `503 REFRESH_UNAVAILABLE`.
  - `?force=1` skips the "still valid" check (used when upstream rejected a token that looks valid), but within 10 s of `refreshedAt` it answers 200 without calling the IdP.
  - Log lines carry only `{ requestId, routeTemplate, status, durationMs }` (`logRoute` in `lib/server/log.ts`).
- **Logout is `POST /api/session/logout`** (`app/api/session/logout/route.ts` → `lib/server/logout.ts`, Story 1.7). CSRF fails → 403 `CSRF` with the cookie untouched. Otherwise it unseals the raw cookie **ignoring idle/absolute age**: if it unsealed and `X-PP-Session` doesn't match its `sid`, it answers 204 with no `Set-Cookie` and no revoke (a stale tab never signs out the account now in the browser); in every other case 204 + cleared cookie.
  - The revoke runs **after** the response (`after()` from `next/server`), only when a session unsealed, its access token hasn't expired, `PP_DISABLED` is off and `REVOKE_PATH` (`/auth/user/logout`) is non-null: `POST <apiRoot><REVOKE_PATH>` (the session's environment) with the Bearer token, aborted at 5 s. Failures are swallowed and logged by `errorName` only; they never change the 204. It revokes the access token only.

### Client transport: `lib/api/` (always import from `"@/lib/api"`)
- **`callApi(context, path, init)` (`lib/api/client.ts`) is the only browser→server transport.** `fetch` is lint-banned in `features/`, `components/` and `lib/api/` outside `client.ts`. Never call 1health origins from the browser.
  - `path` must be a same-origin `/api/...` path; anything else resolves `errorCode: "BAD_PATH"` with no request.
  - It alone sets the `X-PP-Session` binding header and sends `credentials: "same-origin"`.
  - It never throws. It returns `ApiResponse<T> = { success, data?, error?, errorCode?, details?, statusCode? }`, where `errorCode` is the proxy's or backend's code and a network failure is `NETWORK_ERROR`.
  - On `401 TOKEN_EXPIRED` it runs **one** refresh, single-flighted in the tab (a shared promise) and across tabs (`navigator.locks` `"pp-refresh"`), then replays the call. If the replay is `TOKEN_EXPIRED` again, it runs one forced refresh and replays a second, last time; a third `TOKEN_EXPIRED` becomes `SESSION_EXPIRED`. A failed refresh returns its error to every waiting call: `SESSION_EXPIRED`, `SESSION_CHANGED`, or `503 REFRESH_UNAVAILABLE` (no event; the next `TOKEN_EXPIRED` tries again). Replays reuse `init` verbatim, so don't pass `ReadableStream` bodies.
  - On `401 SESSION_EXPIRED` / `409 SESSION_CHANGED` (from a call, a replay or a refresh) it publishes `session-expired` / `session-changed` once per page on `lib/api/session-events.ts`. The only other publisher is the idle warning (`session-expired` at a deadline).
  - **Activity:** `init` may carry `userInitiated: true` (stripped before `fetch`). `callApi` sends `X-PP-Activity: user` on every non-GET and on `userInitiated` GETs, and never on the refresh POST or SWR reads. On an `X-PP-Activity-At` echo it calls `noteActivity` (`lib/api/activity.ts`), which shares `{ t }` with other tabs over `BroadcastChannel("pp-activity")`. Don't add POST-based reads that SWR polls: they would count as activity and keep the session alive.
  - Tests that return `TOKEN_EXPIRED` must also mock `POST /api/session/refresh`; unmocked requests fail the test.
- **Reads go through SWR.** Build every key with `lib/api/keys.ts` (`["pp", resource, ...params]`); inline keys passed to `useSWR`/`mutate`/etc. are lint-banned. Use the shared `fetcher` (`lib/api/fetcher.ts`), which throws an `ApiError` carrying the `ApiResponse`; add a resolver there for each new key. Example: `features/shell/use-myself.ts`.
- **New module pattern:** add `lib/api/<feature>.ts`, export a clean domain type and map the wire shape inline (see `lib/api/user.ts`), pass a `"<module>/<fn>"` context to `callApi`, re-export from `index.ts`, and add the proxy allowlist entry.
- **Idle warning (`features/shell/idle-warning.tsx`):**
  - **Timing:** it computes deadlines in server time (`serverNow` offset) from the latest `lastSeen` or tab activity.
  - **Warning:** at 14 min it opens a non-dismissable `alertdialog` (`IDLE_COPY` in `lib/shared/messages.ts`). "Stay signed in" pings and restarts the timer.
  - **Expiry:** it publishes `session-expired` at the idle or 8 h deadline, but not while a ping is in flight.
  - **Stopping:** it stops for good on any `session-expired`/`session-changed` event.
- **Session dialogs (`features/shell/session-dialogs.tsx`, Story 1.7)** is the only module that opens the session-expired / session-changed dialogs, and the shell's single listener for both events. **First event wins**: a later event of either kind is ignored entirely.
  - **`session-expired`:** runs every `onBeforeSessionExpired(cb)` callback (drafts, Story 1.15), then opens "Your session ended". Its action is a plain link to `portalUrl` (no logout, no `requestLeave`, no draft deletion).
  - **`session-changed`:** runs every `onSessionChanged(cb)` callback, clears the whole SWR cache with `mutate(() => true, undefined, { revalidate: false })`, and opens a dialog whose "Reload" calls `window.location.reload()`. No expired callback runs.
  - Both registries return an unsubscribe function, and each callback is isolated (a throw is logged by error name only). Both dialogs are non-dismissable `alertdialog`s; copy is `SESSION_EXPIRED_COPY` / `SESSION_CHANGED_COPY` in `lib/shared/messages.ts`.
- **Leaving (`features/shell/leave.ts`):** `setLeaveGuard(fn | null)` sets the single leave guard (Story 1.13); `requestLeave()` resolves `true` with no guard, else the guard's result. `returnToPortal()` (the app-bar "Return to 1health", Story 1.8) calls `requestLeave()`, then `POST /api/session/logout` raced against 3 s (failures ignored), then `window.location.assign(getPortalUrl())`. No `returnUrl`/`next` parameter exists anywhere.
- **Never framed (D10):** the root `proxy.ts` sends CSP `frame-ancestors 'none'`, `X-Frame-Options: DENY` and COOP `same-origin` on every response (with the nonce CSP, HSTS, nosniff, `Referrer-Policy: no-referrer` and the Permissions-Policy). There is no framed detection, framed branch or `postMessage`; every action navigates the same tab.
- **Page shell (Story 1.8):** inside `ClientConfig`, `app/page.tsx` renders `SessionDialogs` (first), `AppBar`, `<main>`, then `IdleWarning`. `<main>` holds the header slot (`<section aria-label="Profile">` with the page's single `h1`; Story 1.9 fills it) and `ProfileTabs`. The server reads `searchParams.tab`, and an unknown or missing value renders Contacts.
  - **App bar (`features/shell/app-bar.tsx`):** "Return to 1health" is always rendered: an `<a href={portalUrl}>` whose click calls `preventDefault()` and `returnToPortal()` (which asks `requestLeave()` itself, so don't call it first).
  - **Tabs (`features/shell/profile-tabs.tsx`):** Radix Tabs with manual activation. A switch awaits `requestLeave()`, then calls `history.replaceState(null, "", "?tab=<id>")`, which drops the hash. On mount a bad `?tab=` becomes `?tab=contacts` and the hash is kept. **Never use `useRouter`/`router.replace` for tab or hash changes**, because they re-render the server page.
  - **Sections (`features/shell/sections.ts`):** the one definition of the Contacts Sections (`personal`, `phone`, `email`, `social`, `addresses`; sub-anchor `#signature`), their column headers and the tab ids.
  - **Section navigation (`features/shell/section-nav.tsx`, Contacts only):** a sticky `<nav aria-label="Sections">` at ≥ 768 px, or a "Jump to" Select below 768 px. Activation scrolls (smooth, or instant under reduced motion), focuses the Section `h2` and calls `replaceState` with `#<id>`. The scroll-spy (IntersectionObserver) sets `aria-current="location"` on exactly one item. Deep links run on mount and on `hashchange`.
  - **`SectionFrame` (`features/shell/section-frame.tsx`):** `<section id aria-labelledby>` + `h2` (`tabIndex={-1}`) + the card container in a `loading` (3 skeleton rows, `aria-busy`), `error` (banner + per-frame Retry) or `ready` (`children`) state. `anchors` holds deep-link targets that must exist before the frame is ready.
  - Shell copy is `SHELL_COPY` in `lib/shared/messages.ts`.
  - Tests stub `IntersectionObserver`, `scrollIntoView`, `matchMedia` and the APIs Radix Select needs with `test/dom-stubs.ts`. Component axe checks use `test/axe.ts`, which skips `color-contrast` because jsdom has no layout. `e2e/shell.spec.ts` covers contrast with `@axe-core/playwright` in both themes.
- Feature code lives in `features/<section>/` (shell, header, personal, phone, email, social, addresses, insurance, medical).
- `docs/api/` describes the 1health platform itself (data model, query, quirks) and is useful background. Its "generic engine" helpers were deleted in Story 1.1. `docs/AUTH-ARCHITECTURE.md`, `docs/ACTION-PATTERNS.md` and `docs/README-DEBUGGER.md` describe the removed `authFetch`/client-token design and are **outdated**; don't follow them.

### Design system (`docs/DESIGN-SYSTEM.md`)
- All tokens live in `app/globals.css` in three tiers. To rebrand, change only the four `--brand-*` variables in the `TIER 2 · Brand layer` block.
- Components must use semantic tokens. Don't use hardcoded hex values or palette classes like `bg-red-500`.
- `scripts/check-forbidden.sh` (in `pnpm lint` and CI) enforces this: it fails on any hex or palette class in `app/`, `components/` and `features/`, outside `app/globals.css` and `*.test.*`. Use the override tokens `link-text`, `destructive-fill`, `control-border`, `tooltip` and `scrim` as listed in the "Contrast overrides" table in `docs/DESIGN-SYSTEM.md`.
- Red is reserved for errors and destructive actions, and glow only for focus or active states.
- Respect reduced motion and meet WCAG 2.1 AA.
- Dark mode is class-based (add `dark` to `<html>`) and is off by default.
- **Focus ring:** use the `focus-ring` utility (`@utility` in `app/globals.css`). On `:focus-visible` it draws a 2 px `--ring` outline with a 2 px offset and `box-shadow: var(--glow)`. Every interactive control uses it, including the `Button` base, `TabsTrigger` and `SelectTrigger`. Never remove focus or trap it.
- **`cn()` (`lib/utils.ts`)** uses a tailwind-merge that knows the type scale (`text-body`, `text-caption`, …). With the stock version, `cn("text-body", "text-muted-foreground")` would drop the font size.
- **Primary-colored text in dark mode:** `text-primary` (trust-blue) fails AA on the dark surfaces, so pair it with `dark:text-info-strong`, as the wordmark and the active Section menu item do.
- shadcn/ui components live in `components/ui/` (`components.json`), including Tabs (`@radix-ui/react-tabs`) and Select (`@radix-ui/react-select`).

## Project & related context
This app rebuilds the **Personal Profile / Profile** screens of `1health-fe` with a new Tailwind UI. It is tracked in Jira as **NG-9019** (1hio.atlassian.net), and its sub-tasks NG-9020 to NG-9027 cover the tabs and each card.

Use these sibling repos in `../` as the source of truth:
- `1health-fe`: the current profile UI, including fields, option lists, and API calls
- `1h-ng-bo-core-be`: endpoints, DTOs, and permissions
- `1h-agents-docs`, `ai-agents-knowledge`, `1h-app-api-docs`: API docs

The live agents.md docs have one root per environment. Use the one for the target environment:
- `https://agents.1health.io/public/{dev|demo|prod}/api/agents.md`
- all three environments: `https://agents.1health.io/api/agents.md`
- also `…/public/dev/api/manifest.md` and `…/public/dev/llms.txt`

## Repo tooling
`_bmad/` and `.claude/skills/bmad-*` hold the BMAD planning and agent framework. Its outputs go to `_bmad-output/`. None of it is part of the app build.
