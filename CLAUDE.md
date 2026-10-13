# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Next.js 14 (App Router) + React 18 + Tailwind v4 + shadcn/ui front end built from the **1health App Starter** (v0-generated). It runs inside the 1health platform: the portal launches it with an encrypted Launch Payload (LPL), and from then on the browser calls the 1health REST APIs directly with a Bearer token.

## Commands

Package manager is **pnpm 12**, run through corepack. Use `corepack pnpm …` if `pnpm` isn't on PATH. Its settings (`allowBuilds`, release-age excludes) live in `pnpm-workspace.yaml`.

```bash
pnpm install
pnpm dev        # http://localhost:3000 (also the "dev" config in .claude/launch.json)
pnpm build
pnpm lint       # eslint . (flat config in eslint.config.mjs, eslint-config-next)
pnpm typecheck  # tsc --noEmit
```

- Stack: Next.js 16 (App Router), React 19, Tailwind v4, zod 4, Node 24.
- TypeScript is pinned to 6.x, because typescript-eslint doesn't support TS 7 yet.
- There is **no test framework** and no test script.
- `next.config.mjs` sets `typescript.ignoreBuildErrors`, so `pnpm build` passing does **not** mean the code type-checks. Run `pnpm typecheck`.
- Required env vars (in `.env*`, which is gitignored): `ONEHEALTH_SECRET_KEY_DEMO`, `ONEHEALTH_SECRET_KEY_PROD`, `APP_ID_DEMO`, `APP_ID_PROD`. Base URLs are hardcoded: `https://demo.1health.io` and `https://app.1health.io`.

## Architecture

### Auth flow (`docs/AUTH-ARCHITECTURE.md`)
- `app/auth/page.tsx` picks the environment (it auto-detects Demo or Prod from `document.referrer`, or the user picks one) and POSTs the LPL to `app/api/token/route.tsx`.
- That route is the **only server-side 1health code**. It decrypts the LPL with the environment's secret key, exchanges the code for OAuth tokens, and stores the tokens, base URL, org, and user IDs in **cookies**.
- `app/page.tsx` is a server component guard. With no access or refresh token cookie it redirects to `/auth`; otherwise it renders `components/home-page-client.tsx`.
- Token refresh happens **client-side** in `lib/auth-client.ts` (`refreshToken()` calls `<base>/auth/oauth2/token` directly and has a concurrency guard). The README and `docs/api/CONVENTIONS.md` mention an `/api/token/refresh` route, but that route does not exist.
- `authFetch()` attaches the Bearer token. On a 401 it refreshes and retries once, and if the refresh fails it throws `SessionExpiredError`, which `hooks/use-session-expired.ts` handles. It also logs every request and response to the browser console (see `docs/README-DEBUGGER.md`).

### Client app shell
- `HomePageClient` wraps everything in `SessionProvider` (`contexts/session-context.tsx`). `useSession()` returns `{ user, tenant, isLoading, error, refresh }`, fetched once through SWR.
- Routing is a single page: the home page currently renders `SettingsPage`. Add new pages by wiring them into `home-page-client.tsx`, either through a navigation context or as Next.js routes.

### API layer: `lib/api/` (always import from `"@/lib/api"`)
**Read `docs/api/README.md` before building features.** It explains the platform's mental model, and `docs/api/GOTCHAS.md` lists platform quirks that the helpers already work around.
- **Transport rule:** never call `fetch` directly for 1health endpoints. Use `callApi` or `callApiRaw` (`lib/api/client.ts`), which wrap `authFetch`. They resolve the base URL **per call** with `getOneHealthBaseUrl()`, so never cache it at module scope. They return `ApiResponse<T> = { success, data?, error?, statusCode? }`.
- **New module pattern** (`docs/api/CONVENTIONS.md`):
  - add the module as `lib/api/<feature>.ts`
  - put endpoint path builders in `config.ts`
  - export a clean domain type and map the raw wire shape inline
  - pass a `"<module>/<fn>"` context string as the first argument to `callApi`
  - re-export the module from `index.ts`
- **Per-app config:** fill in `RECORD_TYPES` and `ATTRIBUTES` in `lib/api/config.ts` with the PascalCase type keys and schema attribute names this app uses.
- **Generic engines are already built:**
  - schema discovery (`schema.ts`)
  - `/api/v2/query` with RSQL builders (`query.ts`) and grid endpoints (`grid.ts`)
  - `customData` (`custom-data.ts`)
  - workflows, built as Campaign → Template → Journey → Steps (`campaign.ts`, `workflow-template.ts`, `journey.ts`, `journey-step.ts`)
  - self-provisioning (`workflow-provisioning.ts`)
  - a data-driven step form renderer (`components/workflow/dynamic-step-form.tsx`)
- Quirks to keep in mind (full list in `GOTCHAS.md`):
  - **Step-field `fieldIdentifier` GUIDs differ between environments and tenants.** Resolve them by `label` at runtime and never hardcode them. Schema attributes are plain strings and are safe to hardcode.
  - **Query responses prefix attributes as `ROOT.<Type>.<attr>`.** Read them with `getRootAttr`, `findAttr`, or `getRelatedAttr`, and use `parseCustomData` because `customData` can come back as a JSON string.
  - **`appendCustomData` is a shallow merge.** For nested or namespaced keys use `mergeCustomData`, or the write will wipe sibling keys.
  - **Dynamic-field step submits must echo every field** (`buildStepMetadata` does this). Submitting the actionable step is what advances a journey; there is no "complete" call.
  - **There is no general HTTP DELETE.** Deletion is a flag in the request body, or omission followed by a REPLACE.

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
