# 1health App Starter

A greenfield starter template for building front-end applications on top of the 1health platform using Next.js and v0.

## What's Included

- **Backend-for-Frontend auth** -- the portal opens `/auth?lpl=…`; `/api/token` decrypts the launch payload, exchanges the code and seals the tokens into one `HttpOnly` cookie (`__Host-pp_s`). The browser never sees a token. See `docs/AUTH-ARCHITECTURE.md`
- **Allowlisted 1health proxy** -- `/api/1h/<path>`: path normalization, deny list, per-entry query/body schemas, 415 content-type check, kill switches, no-store headers, PHI-free logs
- **Client transport** -- `callApi()` (same-origin only, never throws) with client-coordinated token refresh, session events, SWR keys and `useMyself()`
- **Security headers** -- per-request nonce CSP and the AD-21 header set on every response (`proxy.ts`)
- **Design System** -- 1health design tokens (color, type, spacing, motion) with a brandable three-tier structure and light/dark themes
- **Tests and CI** -- Vitest + Testing Library + MSW, Playwright (desktop and 360 px), forbidden-pattern check, GitHub Actions

## Project Structure

```
proxy.ts               # AD-21 security headers + CSP nonce on every response
instrumentation.ts     # validates the server env at boot
app/
  auth/                # launch entry wrapper (renders features/shell/auth-screen.tsx)
  api/token/           # launch: decrypt + exchange + seal the session cookie
  api/1h/[...path]/    # the allowlisted 1health proxy
  api/session/         # refresh + logout
  page.tsx             # requires a session; embeds the portal URL
  layout.tsx           # root layout, the one SWRConfig
features/shell/        # auth screen + launch flow, PortalUrlProvider, SwrProvider, useMyself
lib/
  server/              # server-only: env, session, launch, proxy, security, http, log
  api/                 # client: callApi, session events, keys, fetcher, typed modules
  shared/              # pure, isomorphic: environments, BFF contract
components/ui/         # shadcn/ui components
test/  e2e/            # Vitest setup (MSW) and fixtures; Playwright specs
scripts/check-forbidden.sh  # CI forbidden-pattern gate
```

## Environment Variables

Copy `.env.example` to `.env.local`. Only `lib/server/env.ts` reads them, and
boot fails (naming the variable, never its value) when one is invalid.

| Variable | Description |
|---|---|
| `ONEHEALTH_SECRET_KEY_DEMO` / `_PROD` | External Application secret key per environment (LPL decryption + code signature) |
| `APP_ID_DEMO` / `APP_ID_PROD` | External Application id the launch payload must name |
| `SESSION_SECRET` | Seals the session cookie (at least 32 characters) |
| `SESSION_SECRET_PREVIOUS` | Optional, accepted for unseal only during a rotation |
| `PP_DISABLED`, `ACCOUNT_DISABLED` | Kill switches, on only for `"1"` |

Base URLs are hardcoded per environment (`lib/shared/environments.ts`):
`https://1health.demo.1health.io` (demo) and `https://1health.app.1health.io` (prod).
The launch detects the environment by the key that decrypts the payload, and
the session remembers it.

## Commands

```bash
pnpm dev          # https://localhost:3000 (next dev --experimental-https)
pnpm lint         # eslint, including the layering rules
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest run (add --coverage for the 100% gate)
pnpm test:e2e     # playwright test (builds and starts the app with dummy env)
pnpm build
bash scripts/check-forbidden.sh
```

## Adding an endpoint

Add an allowlist entry in `lib/server/proxy/allowlist.ts`, then a module in
`lib/api/` built on `callApi`. See `docs/api/CONVENTIONS.md`.

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

- `docs/AUTH-ARCHITECTURE.md` -- launch, session, proxy, refresh and logout
- `docs/api/CONVENTIONS.md` -- how to add an API module
- `docs/api/` -- 1health platform reference (the template engines it describes were removed)
- `docs/DESIGN-SYSTEM.md` -- Design tokens, rebranding, typography, motion, and component guidelines
