---
name: react-scaffolder
description: Use this skill to scaffold a new React + TypeScript project (Vite), or add a new feature module to an existing one, following this repository's architecture standard — folder layout, ESLint/Prettier config, TypeScript strict mode, and Vitest + React Testing Library wiring.
---

# Skill: react-scaffolder

This skill initializes structure, not features. It exists so every project bootstrapped from this template starts from the same layered architecture instead of an ad hoc `src/`.

## When to use this skill

- starting a brand-new React + TypeScript project from scratch
- adding a new feature module to an existing project that doesn't yet follow the standard layout
- initializing tooling (ESLint, Prettier, TypeScript strict mode, Vitest + React Testing Library) for a project that doesn't have it yet

## Before creating anything

1. Confirm scope with the user: new project vs. new feature module inside an existing one.
2. If the target directory is non-empty, list what's already there and ask before creating or overwriting anything — never assume an empty slate.
3. Confirm the package manager in use (npm, pnpm, or yarn) rather than defaulting silently.
4. Confirm the data-fetching/state-management approach if the project doesn't already have one (e.g. TanStack Query + Context, or plain fetch + hooks) rather than picking one silently — this shapes `services/`/`store/` from day one.
5. Confirm the styling approach if the project doesn't already have one — Tailwind v4, CSS Modules, or a zero-runtime CSS-in-JS (see `CLAUDE.md` § Styling approach; runtime CSS-in-JS is not for new code). Default to Tailwind v4 + `cva` if the user has no preference and nothing is already established, but don't assume it silently if there's any existing styling code to detect first.
6. For a new project, the form stack defaults to React Hook Form + Zod (see `CLAUDE.md` § Forms and validation) unless the user specifies otherwise.
7. Confirm the routing approach if the project doesn't already have one. TanStack Router (typed routes + search params, route-level loaders and code-splitting) is the default for a new SPA; React Router v7 in library mode ≈ the v6 API is fine if the team knows it — only adopt framework mode deliberately, that's a materially different commitment, not a drop-in upgrade.
8. Confirm the profile: this skill scaffolds the **Vite SPA** profile (and a Library skeleton on request). For a Framework app (Next.js/React Router framework mode/TanStack Start) don't scaffold from this skill — use the framework's own generator, then add `features/`, the boundaries lint rule and tooling per `CLAUDE.md` § Framework apps.
9. Confirm the package manager (npm default), the Node LTS to pin (`.nvmrc`, `engines`, `packageManager`), and whether Playwright e2e and Storybook are wanted now or later.

## Target layout

```text
src/
├── app/                 # global app shell
│   ├── providers/       # React Query client, global Context providers, Router provider — composed once
│   ├── styles/          # global CSS/Tailwind entry, theme tokens
│   └── main.tsx
├── assets/              # global static assets (images, SVGs, fonts)
├── components/
│   ├── ui/               # generic, domain-agnostic primitives (Button, Modal, Input)
│   └── layout/            # Header, Sidebar, Footer, page shells
├── features/             # one folder per business domain, e.g. features/auth/
│   └── <feature>/
│       ├── api/           # this feature's typed API functions, queryOptions + query/mutation hooks
│       ├── schemas/       # Zod schemas (form + payload types derive from these)
│       ├── components/    # components private to this feature
│       ├── hooks/         # hooks private to this feature
│       ├── types/         # types private to this feature
│       ├── utils/         # helpers private to this feature
│       └── index.ts       # the feature's public API — the only import surface
├── pages/                # (or routes/ for file-based routing) route-level components
├── hooks/                # shared, cross-feature hooks
├── lib/                  # configured singletons: http client, queryClient, logger
│   └── env.ts             # the ONLY reader of import.meta.env, validated with Zod
├── store/                # global state, only if the project needs one
├── types/                # shared TypeScript types/interfaces
├── utils/                # pure, global helper functions
└── test-utils/           # shared test setup, custom render with providers
index.html
vite.config.ts          # test config lives in a `test` block here, or in a sibling vitest.config.ts
tsconfig.json / tsconfig.app.json / tsconfig.node.json   # strict + the extra flags from CLAUDE.md
eslint.config.js (flat config; only `.eslintrc.cjs` if matching an existing legacy project)
.prettierrc
setupTests.ts            # jest-dom, MSW server lifecycle, browser-API stubs
knip.json
husky/ → .husky/ (pre-commit, commit-msg, pre-push) + lint-staged.config.mjs
bitbucket-pipelines.yml
package.json             # packageManager, engines, scripts: dev build preview lint format format:check typecheck test test:ci knip size prepare
.nvmrc
.env.example
package-lock.json + .npmrc      # min-release-age, ignore-scripts=true (supply-chain defaults)
e2e/                     # Playwright + @axe-core/playwright (when confirmed)
```

## Steps

1. Create the folder skeleton above.
2. `vite.config.ts` (`build.sourcemap: 'hidden'`, `@vitejs/plugin-react`, the `@/` alias also in `tsconfig`; add the React Compiler preset only if the user wants it — see the `react-migration-specialist` playbook) + `tsconfig` with `strict: true` **and** `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `moduleResolution: "bundler"`, `noEmit`.
3. ESLint as an `eslint.config.js` flat config built with `defineConfig`: `typescript-eslint` **type-checked** presets (`strictTypeChecked` + `stylisticTypeChecked`, `projectService: true`), `eslint-plugin-react-hooks` (`recommended` flat preset — includes the React Compiler rules; `exhaustive-deps` as error), `eslint-plugin-react`/`jsx-key`/`no-danger`, `eslint-plugin-jsx-a11y`, `eslint-plugin-import-x` (`no-cycle`), `no-console`, `no-floating-promises`; Prettier (+ the Tailwind plugin); scripts `lint` (`--max-warnings=0`), `format`, `format:check`, `typecheck`.
4. **Configure `eslint-plugin-boundaries` (or `import/no-restricted-paths` from `eslint-plugin-import`) to enforce the unidirectional import flow** (`shared → features → pages/app`; a feature only importable via its `index.ts`; no feature-to-feature imports) — see `CLAUDE.md` § Unidirectional import flow for the exact rule. This is not optional polish: without it, the layout is a naming convention that erodes the first time someone is in a hurry.
5. Vitest (v4+) configured with `jsdom` environment, `v8` coverage with `thresholds` (100) and `include: ['src/**']`, MSW (`msw/node` server in `setupTests.ts`, `onUnhandledRequest: 'error'`, handlers in `test-utils/`); the config is a `test` block in `vite.config.ts`, or a sibling `vitest.config.ts` if the project prefers to keep build and test config separate; `@testing-library/react` and `@testing-library/user-event` + `@testing-library/jest-dom` set up, plus a `test-utils/render.tsx` that wraps components with the app's real providers (router, a fresh `QueryClient` with `retry: false`, theme, etc.) so tests don't hand-roll this per file. Add `vitest-axe` alongside it for DOM-level accessibility assertions.
6. Install the confirmed styling approach's dependencies (e.g. `tailwindcss` + `@tailwindcss/vite` + `class-variance-authority` + `clsx`/`tailwind-merge` and a `cn()` helper if Tailwind — Tailwind v4 uses CSS-first config, `@import "tailwindcss"` + `@theme` inside a CSS file, with no `tailwind.config.js` by default), an accessible headless primitive library if the project has dialogs/menus (Radix UI/React Aria/Base UI), the data stack (`@tanstack/react-query` v5, the router, `zod`), the form stack (`react-hook-form` + `@hookform/resolvers` by default), and `react-error-boundary` — don't leave them for the first feature slice to discover it's missing.
6b. Supply-chain defaults: commit the lockfile, set `min-release-age` (npm ≥ 11.10) and `ignore-scripts=true` in `.npmrc` (run the few install scripts that are really needed explicitly, e.g. `npm rebuild <pkg>`), pin Node via `.nvmrc` + `engines`, add `knip.json`, a `size-limit` budget, and husky + lint-staged as devDependencies (`"prepare": "husky"`).
7. `src/lib/env.ts` (Zod-validated `import.meta.env`, fails fast naming the variable), `src/lib/http.ts` (typed fetch wrapper: timeout via `AbortSignal.timeout`, `ApiError` with `kind`, no credentials in URLs), `src/lib/queryClient.ts`, `src/lib/logger.ts` (forwarding to monitoring, PHI-safe), a `SafeHtml` component if HTML rendering is anticipated, and the app-level Error Boundary + Suspense wiring in `app/providers`.
7b. A first vertical slice (one small feature under `features/`, with its `index.ts` public API) wired end to end — page → feature's public API → feature-internal component/hook → `api/` function (Zod-validated response) + `queryOptions` → http client — as a working, minimal reference for how the layers connect. If the slice includes a form, wire it with React Hook Form + Zod per the default; if it includes a reusable component with variants, use `cva` (or the approach-appropriate pattern) from the start. Keep it minimal; it is a template, not a feature.
8. A minimal test under the slice's own test file exercising it (render with the real providers, MSW handler, one `user-event` interaction, one assertion, one `vitest-axe` check), following the conventions in the `react-test-writer` agent.
9. `.env.example` documenting any client-exposed env vars, with a note that anything here is public in the shipped bundle.
10. CI: this stack's `install.sh` already installs `bitbucket-pipelines.yml` (frozen install → lint/format/typecheck/knip, tests + coverage, audit, gitleaks in parallel → build + bundle budget) and the `.husky/` hooks + `lint-staged.config.mjs`; make sure every script they call exists in `package.json`. Only add a `.github/workflows/ci.yml` if the project is actually hosted on GitHub.
11. Copy `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.claude/settings.json.example`, `.claude/hooks/`, `.claude/agents/`, and `.claude/skills/` into the new project via this stack's `install.sh` — everything installs at the **project level**; nothing is synced globally into `~/.claude/`. See this stack's README.

## Scaffolding a new feature module

When a new business domain needs its own feature (not just one component), create the full internal shape in one pass, then wire its public API:

```text
features/<name>/
├── api/            # API calls / query hooks for this feature
├── components/     # components used only by this feature
├── hooks/          # hooks used only by this feature
├── types/          # types used only by this feature
├── utils/          # helpers used only by this feature
└── index.ts        # re-exports exactly what other code is allowed to import
```

```typescript
// src/features/<name>/index.ts
export { SomeComponent } from './components/SomeComponent';
export { useSomeHook } from './hooks/useSomeHook';
export type { SomeType } from './types';
// Anything not re-exported here is private to this feature.
```

- Don't create empty placeholder subfolders the feature doesn't need yet (a feature with no feature-local types doesn't need an empty `types/`) — add a subfolder when the first real file for it exists, not preemptively.
- `index.ts` is not a "re-export everything" barrel — only export what other code genuinely needs to consume. Keeping something un-exported is a deliberate way to keep it private and refactorable without breaking callers.
- If this feature needs something from another existing feature, do not import that feature's internals — either the shared thing belongs in a global `components/`/`hooks/`/`utils/`, or the two features should be composed together at the `pages/` level instead of depending on each other directly.

## Scaffolding a single component or hook

This is the common case once a project already exists: adding one new component or hook, not a whole feature. Generate its companion files together, in one pass, matching the project's real conventions (don't invent a convention the project doesn't already use):

- `ComponentName.tsx` — the component itself (function component, named export, typed props, `ref` as a prop where it wraps a native element — no `forwardRef`), placed in shared `components/ui|layout/`, inside the owning `features/<feature>/components/`, or `pages/` per where it belongs. If it goes inside a feature and needs to be usable from outside that feature, also add it to that feature's `index.ts` export list — don't leave callers to deep-import it.
- `ComponentName.types.ts` — only if the prop/data types are non-trivial enough to warrant separation from the component file; for a couple of simple props, keep them inline instead of manufacturing a file.
- Styles — in whatever the project already uses (CSS Module, Tailwind classes inline, styled-components, etc.). Do not introduce a second styling approach.
- `ComponentName.test.tsx` — a real skeleton (imports, a render, one meaningful assertion for the default state), not an empty placeholder. Hand off to `react-test-writer` to bring it to full coverage per `CLAUDE.md` § Test coverage requirement — this skill scaffolds the shape, it does not chase coverage itself.

For a hook, the equivalent is `useSomething.ts` (+ `useSomething.types.ts` only if warranted) and `useSomething.test.ts` using `renderHook` — and, if it's feature-internal but meant to be consumed elsewhere, the same `index.ts` export rule applies.

## Restrictions

- Do not scaffold a runtime CSS-in-JS library, `enum`s, class components, `forwardRef`, default-export components, `export *` barrels, or token storage in `localStorage` — the standard forbids them. Do not read `import.meta.env` outside `lib/env.ts`.
- Do not pin versions from memory: install with the package manager and let it resolve current stable versions (then commit the lockfile); check peer-dependency support for React 19 before adding a library.
- Do not invent business logic beyond the minimal example slice — this skill scaffolds structure, not features.
- Do not scaffold auth flows with real-looking secrets left in place; use obvious placeholders (e.g. `CHANGE_ME`) and flag them explicitly to the user.
- Do not overwrite existing files without asking first.
- Do not pick a routing, state-management, or data-fetching library the user didn't confirm — ask if it's not already evident from the project.
- Do not manufacture a `.types.ts` file, a styles file, or a test file when the project's own convention doesn't call for one — match what's already there instead of adding ceremony.
- Do not place a new feature's component/hook/type/util file directly and skip updating `index.ts` if it's meant to be consumed from outside the feature — an unexported file that another module then deep-imports defeats the whole layout.
- Do not scaffold a project without wiring the ESLint boundaries/import-restriction rule from step 4 — a feature-based layout with no enforcement is not actually the architecture, just its shape.
