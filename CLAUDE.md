# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Next.js App Router + Tailwind v4 + shadcn/ui front end built from the **1health App Starter** (v0-generated) and rebuilt as a **Backend-for-Frontend** (spec 7.0a). The 1health portal launches it with an encrypted Launch Payload (LPL); the Next.js server keeps the tokens in one sealed `HttpOnly` cookie and is the only thing that talks to 1health. The browser calls only this app's own `/api/*` routes.

## Use the shared foundation first

- **Before implementing any story, read [`docs/FOUNDATION.md`](docs/FOUNDATION.md).** It catalogs everything already built in specs 7.0a–7.0c-1 and F1–F7: modules, components, hooks, routes, recipes, and a story → foundation map. Also read the story's *Foundation 2026-10-14* lines in `_bmad-output/planning-artifacts/epics.md`.
- **Don't rebuild or bypass a foundation piece.** If something is missing, propose it in a foundation PR (extend the module that owns it); the integrator updates `docs/FOUNDATION.md` when it lands.
- **1health traffic:** the browser goes only through `callApi` (`@/lib/api`) to `/api/1h/*`. Add each endpoint to its area file `lib/server/proxy/allowlist/<area>.ts`, never to `index.ts`. Server work across calls goes in a named op (`createNamedOp` → `/api/pp/*`).
- **Copy and errors:** copy comes only from `lib/shared/messages/<area>.ts`. Errors go only through `mapApiError(scope, response)`, with upstream text matched only in `lib/api/errors/<area>.ts`.
- **UI:** Sections use `useSectionForm` with the Section chrome, `StateFrame` for every read, `runSaveSteps` for multi-request saves, the shell toasts, and the `components/ui` controls (Select, DateInput, Combobox, InfoPopover, DisabledAction…).
- **Tokens and lint:** use semantic tokens only. Layering and ownership lint (`eslint.config.mjs`) and `scripts/check-forbidden.sh` must stay green.

## Team ownership

Two teams merge in parallel: Team A (Epics 1–6, `/`) and Team B (Epics 7–10, `/account`). Who owns which folder, what a story PR may not edit, and how shared (foundation) changes ship are in [`docs/FOUNDATION.md` §1 "Team ownership and shared changes"](docs/FOUNDATION.md#team-ownership-and-shared-changes). In short: a story edits only its own team's folders; a change to anything shared is its own small foundation PR, reviewed by both teams and merged first; shared helpers, types and unions are added to, never changed.

## Commands

Package manager is **pnpm 12**, run through corepack. Use `corepack pnpm …` if `pnpm` isn't on PATH. Its settings (`allowBuilds`, release-age excludes) live in `pnpm-workspace.yaml`.

```bash
pnpm install
pnpm dev        # https://localhost:3000 (next dev --experimental-https; falls back to http when mkcert can't install its CA; also the "dev" config in .claude/launch.json)
pnpm build
pnpm lint       # eslint . (flat config in eslint.config.mjs, eslint-config-next + layering rules)
pnpm typecheck  # tsc --noEmit
pnpm test       # vitest run; `pnpm vitest run --coverage` enforces 100% on lib/server, lib/api, lib/shared
pnpm test:e2e   # playwright test (desktop + 360 px); builds and starts the app on :3100 (PP_E2E_PORT overrides; kill-switch servers on the next two ports) with dummy env
pnpm check:forbidden  # bash scripts/check-forbidden.sh, the CI forbidden-pattern gate (runs check-tokens.sh)
pnpm check:tokens     # bash scripts/check-tokens.sh, design-token gate only

pnpm vitest run app/account.test.tsx         # one unit test file (add -t "<name>" for one test)
pnpm vitest run --project server             # Vitest projects: "server" (node, lib/server + routes) and "client" (jsdom)
pnpm test:e2e e2e/account-page.spec.ts --project=desktop   # one e2e spec; Playwright projects: "desktop", "mobile-360"
pnpm exec playwright test -c playwright.live.config.ts      # opt-in live suite against 1health dev (e2e-live/README.md); never in CI
```

- **e2e layout:** per-story specs (`e2e/profile-*`, `e2e/account-*`, shell/foundation specs) plus `e2e/journey-*.spec.ts` (one real launch, then a stateful in-memory backend from `createJourneyBackend` in `e2e/fixtures/journey.ts`, so saves change later reads across `/` and `/account`) and `e2e/parity-1health-fe.spec.ts` (legacy labels/options/empty states; open gaps are `test.fixme`, tracked in `docs/PARITY-1health-fe.md`). Specs import from `./fixtures` and use its fail-fast `test` (any unmocked `/api/{1h,pp,places}` call fails); start from `mockProfileDefaults` / `mockAccountDefaults` and override. Helpers go in the owning area file under `e2e/fixtures/`, with one `export *` line in `index.ts` (`test/e2e-fixture-exports.test.ts` fails on a missing line or a name clash).
- **Live suite (`e2e-live/`):** reads `.env.live.local` (gitignored). `LIVE_PORTAL_LOGIN=1` signs in through the dev portal in a visible browser and reuses that session; token mode needs a plain patient user (dev refuses launches for admin/support users). Read-only by default; `LIVE_ALLOW_WRITES=1` / `LIVE_ALLOW_LOGOUT=1` add reversible writes and the exit test (it revokes the user's sessions on every device). Vitest skips this folder (`vitest.config.test.ts`).

- **Local preview without real credentials:** start `pnpm dev` with the e2e dummy env from `e2e/server-env.ts` (`ONEHEALTH_SECRET_KEY_*`/`APP_ID_*` starting with `e2e-`, a 32+ char `SESSION_SECRET`) plus `PP_E2E_MOCK=1`. The server then answers 1health's token exchange, `myself` and logout in-process (`test/e2e-upstream-mock.ts`) and blocks every other 1health call; boot fails if the mock is on with non-`e2e-` credentials. Sign in by opening `/auth?lpl=<payload>` built like `makeLpl()` in `e2e/fixtures/core.ts` (one-time code; open it directly, since pasting into Chrome's address bar can prerender and consume it).

- Stack: Next.js 16 (App Router), React 19, Tailwind v4, zod 4, Node 24.
- TypeScript is pinned to 6.x, because typescript-eslint doesn't support TS 7 yet.
- Tests: Vitest (`*.test.ts(x)` colocated; `lib/server` in node, client code in jsdom), Testing Library, MSW 3 at the `/api` boundary (`test/msw-server.ts`; handlers per test via `server.use`/`renderInPage`; an unmatched request is not blocked, it falls through to the network and surfaces as `NETWORK_ERROR`), Playwright in `e2e/`. Known intermittent tests are listed in `deferred-work.md` (Foundation). CI: `.github/workflows/ci.yml`.
- `typescript.ignoreBuildErrors` is gone: `pnpm build` type-checks.
- Env vars (see `.env.example`; `.env*` is gitignored): `ONEHEALTH_SECRET_KEY_DEMO`, `ONEHEALTH_SECRET_KEY_PROD`, `APP_ID_DEMO`, `APP_ID_PROD`, `SESSION_SECRET` (≥ 32 chars), optional pair `ONEHEALTH_SECRET_KEY_DEV` + `APP_ID_DEV` (both or neither; enables dev, D18), optional `SESSION_SECRET_PREVIOUS`, `PP_DISABLED`, `ACCOUNT_DISABLED`, `PP_E2E_FIXTURES` (test only: serves `/test-fixtures/**`), `PP_E2E_MOCK` (test only: in-process 1health mock, `e2e-` credentials only), `PLACES_ENABLED` (on only for `"1"`; `GOOGLE_PLACES_KEY` required with Places). Only `lib/server/env.ts` reads `process.env` (lint-enforced); it validates at boot via `instrumentation.ts`. Base URLs are hardcoded per environment in `lib/shared/environments.ts` (`https://1health.demo.1health.io`, `https://1health.app.1health.io`, and dev `https://dev.1hdev.io`) and chosen per request from the session's `environment`.

## Architecture

Read `docs/AUTH-ARCHITECTURE.md` and the architecture spine (`_bmad-output/planning-artifacts/architecture/architecture-personal-profile-2026-10-13/ARCHITECTURE-SPINE.md`) before changing auth, the proxy or the API layer. The human decisions **D1–D17** of 2026-10-14 (`_bmad-output/planning-artifacts/epics.md`, "Launch and environment decisions") override the spine wherever they differ (e.g. no CSRF check and no session binding, D5); code cites them as `D-n`.

### Layers (lint-enforced in `eslint.config.mjs`)
- `lib/server/` — server-only (`import "server-only"`): `env.ts`, `session/`, `launch/`, `proxy/`, `security/`, `http/`, `log.ts`, `page-session.ts`, `named-op.ts` + `named-ops/`, `kill-switch.ts`, `disabled-screen.ts`. The only code that calls `fetch` upstream.
- `lib/api/` — client transport and typed modules; same-origin `/api/*` only. `fetch(` is allowed only in `lib/api/client.ts`.
- `lib/shared/` — pure and isomorphic helpers, copy (`messages/<area>.ts`) and contracts; the module list is [`docs/FOUNDATION.md` §3.3](docs/FOUNDATION.md#33-shared-utilities-libshared). Imports nothing else from the app.
- `features/<id>/` — Section features; may import `lib/api`, `lib/shared`, `components/ui` and `features/shell` only. `features/shell` is the shell.
- `components/ui/` — shadcn/ui on the 1health tokens (`components.json`).

### Pages and composition
- Two pages: `/` (Personal Profile, Team A, Epics 1–6) and `/account` (Account, Team B, Epics 7–10). Each is a server component (`app/page.tsx`, `app/account/page.tsx`) that calls `requirePageSession()` and composes `PageFrame` with the prop-driven tab presets (`ProfileTabs` / `AccountTabs`, panels and Section slots) from `features/shell`.
- Features fill their slots from `features/<id>/index.ts` entry points (stubs until their story lands); the shell never imports a feature and features never import each other, so composition happens only in `app/**`. `?tab=` is normalized by replace; Section deep links (`#id`) focus the Section `h2`.

### Auth flow
- The portal opens `/auth?lpl=…`. `app/auth/page.tsx` (server wrapper, reads only the `onehealth_environment` cookie) renders `features/shell/auth-screen.tsx`, which strips `lpl` from the URL and POSTs `{ lpl }` to `/api/token` (up to 5 attempts, 1.5 s apart, `retryable: false` stops). The environment is detected server-side by the key that decrypts (`_PROD`, then `_DEMO`, then `_DEV` when configured); referrer/cookie only pick display labels and links, and the Choose Environment card lists only the configured environments.
- `app/api/token/route.ts` → `lib/server/launch/{token-handler,launch}.ts`: decrypt, app-id check, one code exchange, tenant check (403 `WRONG_TENANT`), `myself` id check, then seals the session into `__Host-pp_s`, sets `onehealth_environment` and answers `{ ok: true, environment }`. Errors carry a user-safe `message` and maybe `retryable: false`. No token ever reaches the browser or a response body.
- Pages call `requirePageSession()` (`lib/server/page-session.ts`; no session → redirect `/auth`) and pass the portal URL to `PortalUrlProvider`. There is no CSRF check and no session binding (D5).
- Refresh is client-coordinated: the proxy answers `401 TOKEN_EXPIRED`; `callApi` calls `/api/session/refresh` once (single-flight + `navigator.locks`) and replays. `POST`/`GET /api/session/logout` revokes best-effort (`<apiRoot>/auth/user/logout/all-devices`) and clears the cookie.

### Proxy and API layer (always import from `"@/lib/api"`)
- All 1health traffic goes through `/api/1h/<path relative to upstream /api>`. Adding an endpoint = adding an entry to its area file `lib/server/proxy/allowlist/<area>.ts` (with that area's tests) in the same change. Owner ids are the literal `me`.
- File deletes go only through the named op `DELETE /api/pp/file/{fileId}` (server-side ownership check); `DELETE v2/file/**` is denied in the proxy.
- Each `lib/api/<resource>.ts` owns its paths (`proxyPath()`) and registers its SWR loader (`registerFetcher`); `lib/api/myself.ts` is the `Myself` domain module. Errors: `mapApiError(scope, response)`; upstream message text is matched only in `lib/api/errors/<area>.ts`. Copy: `lib/shared/messages/<area>.ts`.
- `callApi(context, path, init)` never throws and returns `ApiResponse<T> = { success, data?, error?, statusCode?, errorCode?, source?, upstreamCode?, platformMessage?, details?, retryable?, userMessage? }`. BFF errors are `{ errorCode, source: "proxy" }`; upstream errors pass through as `{ message, code }`.
- SWR keys come only from `lib/api/keys.ts` (`["pp", ...]`; inline array/string/template keys are lint errors); one root `SWRConfig` (`features/shell/swr-provider.tsx`, `shouldRetryOnError: false`). `useMyself()` reads `["pp","myself"]` and is the one key that auto-retries: 5xx and network errors, with backoff, never a 4xx; its error (and the Retry UI) shows only once the retries are exhausted (human decision 2026-10-14).
- Session signal: `lib/api/session-events.ts` (`session-expired` only), published once by `callApi`.
- Logging: server logs never contain bodies; the client `logApiCall` logs (redacted) only under `next dev`. `lib/shared/app-env.ts` is the one other `process.env` (`NODE_ENV`) reader.
- The template's generic engines (query, schema, grid, custom data, workflows, provisioning) were removed; `docs/api/` remains as platform reference. Platform quirks still apply (`docs/api/GOTCHAS.md`).

### Design system (`docs/DESIGN-SYSTEM.md`)
- All tokens live in `app/globals.css` in three tiers. To rebrand, change only the four `--brand-*` variables in the `TIER 2 · Brand layer` block.
- Components must use semantic tokens. Don't use hardcoded hex values or palette classes like `bg-red-500` (`scripts/check-tokens.sh`, run by `check-forbidden.sh`, fails on them). Use the contrast-override tokens `link-text`, `destructive-fill` and `control-border` (the "Contrast overrides" table in `docs/DESIGN-SYSTEM.md`) and the added `tooltip` and `scrim` tokens (the "Semantic tokens (Tier 3)" table there).
- **Primary-colored text in dark mode:** `text-primary` (trust-blue) fails AA on the dark surfaces (2.18:1). Use `text-primary-text`, which is the primary hue in light and info-strong in dark (main's `text-primary dark:text-info-strong`); see "Primary-colored text" in `docs/DESIGN-SYSTEM.md`.
- Red is reserved for errors and destructive actions, and glow only for focus or active states.
- Respect reduced motion and meet WCAG 2.1 AA.
- Dark mode is class-based (add `dark` to `<html>`) and is off by default.
- shadcn/ui components live in `components/ui/` (`components.json`).

## Project & related context
This app rebuilds the **Personal Profile** and **Account** screens of `1health-fe` with a new Tailwind UI. It is tracked in Jira as **NG-9019** (1hio.atlassian.net); each story's Jira key is on its heading in `_bmad-output/planning-artifacts/epics.md` (e.g. Story 7.1 → NG-9030). Status (2026-10-23, `sprint-status.yaml`): every defined story is built and merged except 1.16 (Ops runbooks/promote workflow, backlog); Epic 6 (Medical) is an intentional placeholder until the PM defines it. Legacy-vs-new differences are tracked row by row in `docs/PARITY-1health-fe.md`.

Use these sibling repos in `../` as the source of truth:
- `1health-fe`: the current profile UI, including fields, option lists, and API calls
- `1h-ng-bo-core-be`: endpoints, DTOs, and permissions
- `1h-agents-docs`, `ai-agents-knowledge`, `1h-app-api-docs`: API docs

The live agents.md docs have one root per environment. Use the one for the target environment:
- `https://agents.1health.io/public/{dev|demo|prod}/api/agents.md`
- all three environments: `https://agents.1health.io/api/agents.md`
- also `…/public/dev/api/manifest.md` and `…/public/dev/llms.txt`

## Repo tooling
`_bmad/` and `.claude/skills/bmad-*` hold the BMAD planning and agent framework. Its outputs go to `_bmad-output/`: planning in `planning-artifacts/` (`epics.md` with decisions D1–D17 and per-story *Foundation* notes), and in `implementation-artifacts/` the per-story specs (`spec-*.md`), `sprint-status.yaml` (feature branches don't edit its header or `last_updated`) and `deferred-work.md` (Team A / Team B / Foundation sections). None of it is part of the app build.
