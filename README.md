# Personal Profile

The 1health **Personal Profile** and **Account** screens, rebuilt from
`1health-fe` as a Next.js App Router + Tailwind v4 + shadcn/ui app (Jira
NG-9019). It is a **Backend-for-Frontend**: the 1health portal launches it with
an encrypted launch payload (`/auth?lpl=…`), the Next.js server keeps the
tokens in one sealed `HttpOnly` cookie (`__Host-pp_s`) and is the only thing
that talks to 1health. The browser calls only this app's own `/api/*` routes and
never sees a token. See `docs/AUTH-ARCHITECTURE.md`.

## Pages

| Path | Page | Tabs |
|---|---|---|
| `/` | Personal Profile (`app/page.tsx`, Team A, Epics 1–6) | Contacts, Insurance, Medical |
| `/account` | Account (`app/account/page.tsx`, Team B, Epics 7–10) | Personal Account, Individual Provider Registration, My Organizations |

Both require a session (no session → `/auth`) and select their tab with
`?tab=`. Each feature is a stub in `features/<id>/` until its story fills it.

## Project structure

```
proxy.ts                 # request interceptor: kill switches, AD-21 headers + CSP nonce, page activity, no-store
instrumentation.ts       # validates the server env at boot; installs the e2e upstream mock when PP_E2E_MOCK=1
instrumentation-client.ts  # client boot: zod jitless (no eval under the strict CSP)
app/
  page.tsx               # /  (Personal Profile)
  account/page.tsx       # /account  (Account)
  auth/                  # launch entry (renders features/shell/auth-screen.tsx)
  api/token/             # launch: decrypt + exchange + seal the session cookie
  api/1h/[...path]/      # the allowlisted 1health proxy
  api/pp/                # named ops (profile-picture-id, mfa/validate, practice-support, org-logo, file delete)
  api/places/            # Google Places named ops (off unless PLACES_ENABLED=1)
  api/session/           # refresh, ping, logout
  disabled/              # kill-switch screen (503)
  test-fixtures/         # Playwright fixture pages, served only with PP_E2E_FIXTURES=1
  layout.tsx             # root layout, the one SWRConfig
features/
  shell/                 # app bar, page frame, tabs, navigation, leave guard, drafts, read states, auth screen
  header/                # profile header (avatar, name, primary contacts)
  personal/ contacts/ addresses/ insurance/ save-all/   # Team A entry points
  account/ mfa/ provider/ organizations/                # Team B entry points
lib/
  server/                # server-only: env, session, launch, proxy (+ allowlist/<area>.ts), named ops, kill switch, security, http, log
  api/                   # client: callApi, keys, fetcher registry, one module per resource, errors/<area>.ts
  shared/                # pure, isomorphic: environments, BFF contract, messages/<area>.ts, rules, formatters
components/ui/           # shadcn/ui on the 1health tokens
test/                    # Vitest setup, MSW server, fixtures, page read handlers, e2e upstream mock
e2e/                     # Playwright specs, fixtures/, server-env.ts
scripts/                 # check-forbidden.sh, check-tokens.sh (CI gates)
```

## Environment variables

Copy `.env.example` to `.env.local`. Only `lib/server/env.ts` reads them, and
boot fails (naming the variable, never its value) when one is invalid.

| Variable | Description |
|---|---|
| `ONEHEALTH_SECRET_KEY_DEMO` / `_PROD` | External Application secret key per environment (LPL decryption + code signature) |
| `APP_ID_DEMO` / `APP_ID_PROD` | External Application id the launch payload must name |
| `SESSION_SECRET` | Seals the session cookie (at least 32 characters) |
| `SESSION_SECRET_PREVIOUS` | Optional, accepted for unseal only during a rotation |
| `PP_DISABLED`, `ACCOUNT_DISABLED` | Kill switches, on only for `"1"`: the whole app, or `/account` and its routes |
| `PLACES_ENABLED`, `GOOGLE_PLACES_KEY` | Address suggestions, on only for `"1"`; the key is then required |
| `PP_E2E_FIXTURES` | Test only: `"1"` serves `/test-fixtures/**`. Never set in a deployment |
| `PP_E2E_MOCK` | Test only: `"1"` installs the server-side upstream mock (`test/e2e-upstream-mock.ts`); boot requires `e2e-` dummy credentials. Never set in a deployment |

Base URLs are hardcoded per environment (`lib/shared/environments.ts`):
`https://1health.demo.1health.io` (demo) and `https://1health.app.1health.io` (prod).
The launch detects the environment by the key that decrypts the payload, and
the session remembers it.

## Commands

Package manager is pnpm (via corepack: `corepack pnpm …` if `pnpm` is not on PATH).

```bash
pnpm install
pnpm dev                                  # https://localhost:3000 (next dev --experimental-https)
pnpm lint                                 # eslint, including the layering rules
pnpm typecheck                            # tsc --noEmit
pnpm test                                 # vitest run
pnpm vitest run --coverage                # with the 100% gate on lib/server, lib/api, lib/shared
pnpm vitest run app/account.test.tsx      # one unit test file (add -t "<name>" for one test)
pnpm test:e2e                             # playwright (builds and starts the app on :3100 with dummy env)
pnpm test:e2e --project=desktop e2e/account-page.spec.ts   # one e2e project and spec (projects: desktop, mobile-360)
pnpm build
bash scripts/check-forbidden.sh
```

To try the pages locally without 1health credentials, use the e2e mock (see
`docs/FOUNDATION.md` §3.6).

## Adding an endpoint

1. Add the entry to its area file `lib/server/proxy/allowlist/<area>.ts`, with
   rows in that area's test, in the same change. Owner ids are the literal `me`.
   `/account`-only entries carry `profile: true`.
2. Add the path builder (`proxyPath()`) and the function on `callApi` to the
   resource's module `lib/api/<module>.ts`. Every planned module already
   exists and is re-exported from `lib/api/index.ts` with `export *`: never
   edit `index.ts`. Reads register their loader with `registerFetcher` and use
   a key from `lib/api/keys.ts`. Test it in the module's own `<module>.test.ts`.
3. Copy goes in `lib/shared/messages/<area>.ts`; upstream-message matching in
   `lib/api/errors/<area>.ts`.
4. Work the proxy can't express (several calls, GraphQL, an external API) is a
   named op instead: `lib/server/named-ops/<op>.ts` on `createNamedOp`, a thin
   `app/api/pp/<op>/route.ts`, and its path in `lib/shared/bff-contract.ts`.

See `docs/api/CONVENTIONS.md` and `docs/FOUNDATION.md` (recipes, team ownership).

## Design System

The UI follows the **1health design system** (healthcare command-center: calm,
trustworthy, clinically precise). All tokens live in `app/globals.css` in a
three-tier structure so a single edit rebrands the app without changing its
structure, spacing, motion, or feel:

- **Rebrand** by repointing four `--brand-*` variables (see the `TIER 2` block).
- **Status colors, spacing, type scale, radius, motion** stay fixed to preserve
  the shared 1health experience across apps.
- A full **dark theme** ships and is class-based (off by default).

Read `docs/DESIGN-SYSTEM.md` before building UI. The canonical spec is
[1health_design_system.md](https://tachin-website.web.app/public/1health_design_system.md),
referenced at the top of `app/globals.css`.

## Documentation

- `docs/FOUNDATION.md` -- start here: everything the shared foundation provides, team ownership, recipes, per-story checklist
- `docs/AUTH-ARCHITECTURE.md` -- launch, session, proxy, named ops, refresh, idle logoff, logout, kill switches
- `docs/api/CONVENTIONS.md` -- how to add an API module
- `docs/DESIGN-SYSTEM.md` -- design tokens, rebranding, typography, motion, and component guidelines
- `docs/api/` -- 1health platform reference (the template engines it describes were removed); `docs/api/GOTCHAS.md` for platform quirks
- `_bmad-output/` -- planning (PRD, epics, architecture) and implementation specs (`implementation-artifacts/spec-*.md`)
