# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Next.js App Router + Tailwind v4 + shadcn/ui front end built from the **1health App Starter** (v0-generated) and rebuilt as a **Backend-for-Frontend** (spec 7.0a). The 1health portal launches it with an encrypted Launch Payload (LPL); the Next.js server keeps the tokens in one sealed `HttpOnly` cookie and is the only thing that talks to 1health. The browser calls only this app's own `/api/*` routes.

## Use the shared foundation first

- **Before implementing any story, read [`docs/FOUNDATION.md`](docs/FOUNDATION.md).** It catalogs everything already built in specs 7.0a–7.0c-1 and F1–F7: modules, components, hooks, routes, recipes, and a story → foundation map. Also read the story's *Foundation 2026-10-14* lines in `_bmad-output/planning-artifacts/epics.md`.
- **Don't rebuild or bypass a foundation piece.** If something is missing, extend the module that owns it and add it to `docs/FOUNDATION.md` in the same change.
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
pnpm dev        # https://localhost:3000 (next dev --experimental-https; also the "dev" config in .claude/launch.json)
pnpm build
pnpm lint       # eslint . (flat config in eslint.config.mjs, eslint-config-next + layering rules)
pnpm typecheck  # tsc --noEmit
pnpm test       # vitest run; `pnpm vitest run --coverage` enforces 100% on lib/server, lib/api, lib/shared
pnpm test:e2e   # playwright test (desktop + 360 px); builds and starts the app on :3100 (PP_E2E_PORT overrides; kill-switch servers on the next two ports) with dummy env
pnpm check:forbidden  # bash scripts/check-forbidden.sh, the CI forbidden-pattern gate (runs check-tokens.sh)
pnpm check:tokens     # bash scripts/check-tokens.sh, design-token gate only
```

- Stack: Next.js 16 (App Router), React 19, Tailwind v4, zod 4, Node 24.
- TypeScript is pinned to 6.x, because typescript-eslint doesn't support TS 7 yet.
- Tests: Vitest (`*.test.ts(x)` colocated; `lib/server` in node, client code in jsdom), Testing Library, MSW at the `/api` boundary (`test/msw-server.ts`, unhandled requests error), Playwright in `e2e/`. CI: `.github/workflows/ci.yml`.
- `typescript.ignoreBuildErrors` is gone: `pnpm build` type-checks.
- Env vars (see `.env.example`; `.env*` is gitignored): `ONEHEALTH_SECRET_KEY_DEMO`, `ONEHEALTH_SECRET_KEY_PROD`, `APP_ID_DEMO`, `APP_ID_PROD`, `SESSION_SECRET` (≥ 32 chars), optional `SESSION_SECRET_PREVIOUS`, `PP_DISABLED`, `ACCOUNT_DISABLED`, `PP_E2E_FIXTURES` (test only: serves `/test-fixtures/**`), `PLACES_ENABLED` (on only for `"1"`; `GOOGLE_PLACES_KEY` required with Places). Only `lib/server/env.ts` reads `process.env` (lint-enforced); it validates at boot via `instrumentation.ts`. Base URLs are hardcoded per environment in `lib/shared/environments.ts` (`https://1health.demo.1health.io`, `https://1health.app.1health.io`) and chosen per request from the session's `environment`.

## Architecture

Read `docs/AUTH-ARCHITECTURE.md` and the architecture spine (`_bmad-output/planning-artifacts/architecture/architecture-personal-profile-2026-10-13/ARCHITECTURE-SPINE.md`) before changing auth, the proxy or the API layer.

### Layers (lint-enforced in `eslint.config.mjs`)
- `lib/server/` — server-only (`import "server-only"`): `env.ts`, `session/`, `launch/`, `proxy/`, `security/`, `http/`, `log.ts`, `page-session.ts`, `named-op.ts` + `named-ops/`, `kill-switch.ts`, `disabled-screen.ts`. The only code that calls `fetch` upstream.
- `lib/api/` — client transport and typed modules; same-origin `/api/*` only. `fetch(` is allowed only in `lib/api/client.ts`.
- `lib/shared/` — pure and isomorphic helpers, copy (`messages/<area>.ts`) and contracts; the module list is [`docs/FOUNDATION.md` §3.3](docs/FOUNDATION.md#33-shared-utilities-libshared). Imports nothing else from the app.
- `features/<id>/` — Section features; may import `lib/api`, `lib/shared`, `components/ui` and `features/shell` only. `features/shell` is the shell.
- `components/ui/` — shadcn/ui on the 1health tokens (`components.json`).

### Auth flow
- The portal opens `/auth?lpl=…`. `app/auth/page.tsx` (server wrapper, reads only the `onehealth_environment` cookie) renders `features/shell/auth-screen.tsx`, which strips `lpl` from the URL and POSTs `{ lpl }` to `/api/token` (up to 5 attempts, 1.5 s apart, `retryable: false` stops). The environment is detected server-side by the key that decrypts (`_PROD` then `_DEMO`); referrer/cookie only pick display labels and links.
- `app/api/token/route.ts` → `lib/server/launch/{token-handler,launch}.ts`: decrypt, app-id check, one code exchange, tenant check (403 `WRONG_TENANT`), `myself` id check, then seals the session into `__Host-pp_s`, sets `onehealth_environment` and answers `{ ok: true, environment }`. Errors carry a user-safe `message` and maybe `retryable: false`. No token ever reaches the browser or a response body.
- Pages call `requirePageSession()` (`lib/server/page-session.ts`; no session → redirect `/auth`) and pass the portal URL to `PortalUrlProvider`. There is no CSRF check and no session binding (D5).
- Refresh is client-coordinated: the proxy answers `401 TOKEN_EXPIRED`; `callApi` calls `/api/session/refresh` once (single-flight + `navigator.locks`) and replays. `POST`/`GET /api/session/logout` revokes best-effort (`<apiRoot>/auth/user/logout/all-devices`) and clears the cookie.

### Proxy and API layer (always import from `"@/lib/api"`)
- All 1health traffic goes through `/api/1h/<path relative to upstream /api>`. Adding an endpoint = adding an entry to its area file `lib/server/proxy/allowlist/<area>.ts` (with that area's tests) in the same change. Owner ids are the literal `me`.
- Each `lib/api/<resource>.ts` owns its paths (`proxyPath()`) and registers its SWR loader (`registerFetcher`); `lib/api/myself.ts` is the `Myself` domain module. Errors: `mapApiError(sectionId, response)`; upstream message text is matched only in `lib/api/errors/<area>.ts`. Copy: `lib/shared/messages/<area>.ts`.
- `callApi(context, path, init)` never throws and returns `ApiResponse<T> = { success, data?, error?, statusCode?, errorCode?, source?, upstreamCode?, platformMessage?, details?, retryable?, userMessage? }`. BFF errors are `{ errorCode, source: "proxy" }`; upstream errors pass through as `{ message, code }`.
- SWR keys come only from `lib/api/keys.ts` (`["pp", ...]`); one root `SWRConfig` (`features/shell/swr-provider.tsx`). `useMyself()` reads `["pp","myself"]`.
- Session signal: `lib/api/session-events.ts` (`session-expired` only), published once by `callApi`.
- Logging: server logs never contain bodies; the client `logApiCall` logs (redacted) only under `next dev`. `lib/shared/app-env.ts` is the one other `process.env` (`NODE_ENV`) reader.
- The template's generic engines (query, schema, grid, custom data, workflows, provisioning) were removed; `docs/api/` remains as platform reference. Platform quirks still apply (`docs/api/GOTCHAS.md`).

### Design system (`docs/DESIGN-SYSTEM.md`)
- All tokens live in `app/globals.css` in three tiers. To rebrand, change only the four `--brand-*` variables in the `TIER 2 · Brand layer` block.
- Components must use semantic tokens. Don't use hardcoded hex values or palette classes like `bg-red-500`.
- Red is reserved for errors and destructive actions, and glow only for focus or active states.
- Respect reduced motion and meet WCAG 2.1 AA.
- Dark mode is class-based (add `dark` to `<html>`) and is off by default.
- shadcn/ui components live in `components/ui/` (`components.json`).

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
