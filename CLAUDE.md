# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Next.js (App Router) + React + Tailwind v4 + shadcn/ui app that runs inside the 1health platform. The portal launches it with an encrypted Launch Payload (LPL). From then on the **browser never talks to 1health**: it calls only this app's own same-origin `/api/...` routes through `callApi`, and the Next server (a BFF) holds the tokens and proxies to 1health.

The design of record is the architecture spine: `_bmad-output/planning-artifacts/architecture/architecture-personal-profile-2026-10-13/ARCHITECTURE-SPINE.md` (decisions are cited as `AD-n` in code comments).

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
- Env vars are read **only** in `lib/server/env.ts` (lint-enforced; client code may read `NEXT_PUBLIC_APP_ENV` only in `lib/shared/app-env.ts`), and the boot fails if one is missing or invalid. Required: `APP_ENV` (`dev|demo|prod`), `APP_ORIGIN`, `APP_ID`, `ONEHEALTH_SECRET_KEY`, `SESSION_SECRET` (≥ 32 chars). Optional: `SESSION_SECRET_PREVIOUS`, `PLACES_ENABLED` + `GOOGLE_PLACES_KEY`, `PP_DISABLED` (kill switch). One deployment per environment, so there are no `_DEMO`/`_PROD` names. The 1health origin is fixed by `APP_ENV`, never by an env var. `pnpm build` needs these set too; CI uses dummy values.

## Architecture

### Launch and session (server only)
- `app/launch/route.ts` exchanges the LPL once and seals tokens and ids into one `HttpOnly` cookie, `__Host-pp_s` (`lib/server/session.ts`). Tokens never reach the browser. Failures go to `app/launch-error` (`?reason=`). There is no login page.
- `app/page.tsx` is the server guard (`requireSession()`). It embeds `sessionBinding` (`lib/server/session-binding.ts`) and `PORTAL_URL` in the page via `features/shell/client-config.tsx`.
- `app/api/1h/[...path]/route.ts` is the only path to 1health (`lib/server/proxy.ts`). Every endpoint must be listed in `lib/server/proxy-allowlist.ts`, so **add an allowlist entry in the same change as the code that calls it**. Owner ids are sent as the literal `me` and filled in from the session. The proxy enforces CSRF + session binding (`lib/server/csrf.ts`) and no-store headers.
- Token refresh is not built yet (Story 1.5). The proxy answers `401 TOKEN_EXPIRED` when the token is near expiry.

### Client transport: `lib/api/` (always import from `"@/lib/api"`)
- **`callApi(context, path, init)` (`lib/api/client.ts`) is the only browser→server transport.** `fetch` is lint-banned in `features/`, `components/` and `lib/api/` outside `client.ts`. Never call 1health origins from the browser.
  - `path` must be a same-origin `/api/...` path; anything else resolves `errorCode: "BAD_PATH"` with no request.
  - It alone sets the `X-PP-Session` binding header and sends `credentials: "same-origin"`.
  - It never throws. It returns `ApiResponse<T> = { success, data?, error?, errorCode?, details?, statusCode? }`, where `errorCode` is the proxy's or backend's code and a network failure is `NETWORK_ERROR`.
  - On `401 SESSION_EXPIRED` / `409 SESSION_CHANGED` it publishes `session-expired` / `session-changed` once per page on `lib/api/session-events.ts`. Nothing else publishes them.
- **Reads go through SWR.** Build every key with `lib/api/keys.ts` (`["pp", resource, ...params]`); inline keys passed to `useSWR`/`mutate`/etc. are lint-banned. Use the shared `fetcher` (`lib/api/fetcher.ts`), which throws an `ApiError` carrying the `ApiResponse`; add a resolver there for each new key. Example: `features/shell/use-myself.ts`.
- **New module pattern:** add `lib/api/<feature>.ts`, export a clean domain type and map the wire shape inline (see `lib/api/user.ts`), pass a `"<module>/<fn>"` context to `callApi`, re-export from `index.ts`, and add the proxy allowlist entry.
- Feature code lives in `features/<section>/` (shell, header, personal, phone, email, social, addresses, insurance, medical).
- `docs/api/` describes the 1health platform itself (data model, query, quirks) and is useful background. Its "generic engine" helpers were deleted in Story 1.1. `docs/AUTH-ARCHITECTURE.md`, `docs/ACTION-PATTERNS.md` and `docs/README-DEBUGGER.md` describe the removed `authFetch`/client-token design and are **outdated**; don't follow them.

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
