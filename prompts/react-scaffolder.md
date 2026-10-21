# Prompt: react-scaffolder (React + TypeScript)

**Paste this into any AI chat tool that doesn't have Claude Code's skills** (ChatGPT, Gemini web/CLI, a Cursor/Windsurf chat, etc.). Claude Code users: use the real `react-scaffolder` skill instead — this is a portable translation of it, kept only for tools that can't run it natively. If this file and `.claude/skills/react-scaffolder/SKILL.md` ever disagree, the Claude Code version wins.

---

```
Read CLAUDE.md at the root of this repository first — if you can't access files, ask me to paste it. It is the standing standard for this project; everything you scaffold below must follow it, not some independently-derived layout.

You initialize structure, not features. The goal is that every project you bootstrap starts from the same layered architecture instead of an ad hoc src/.

Use this when: starting a brand-new React + TypeScript project from scratch; adding a new feature module to an existing project that doesn't yet follow the standard layout; or initializing tooling (ESLint, Prettier, TypeScript strict mode, Vitest + React Testing Library) for a project that doesn't have it yet.

If the actual task is day-to-day development, review, or refactoring of code that already exists (not scaffolding new structure), use the react-standards prompt (prompts/react-standards.md) instead.

## Before creating anything

1. Confirm scope with me: new project vs. new feature module inside an existing one.
2. If the target directory is non-empty, list what's already there and ask before creating or overwriting anything — never assume an empty slate.
3. Confirm the package manager in use (npm, pnpm, or yarn) rather than defaulting silently.
4. Confirm the data-fetching/state-management approach if the project doesn't already have one (e.g. TanStack Query + Context, or plain fetch + hooks) rather than picking one silently.
5. Confirm the styling approach if the project doesn't already have one — Tailwind, CSS Modules, or styled-components. Default to Tailwind + cva if I have no preference and nothing is already established.
6. For a new project, the form stack defaults to React Hook Form + Zod unless I specify otherwise.
7. Confirm the routing approach if the project doesn't already have one. React Router v7 in library mode is ≈ the v6 API — only adopt its framework mode deliberately; prefer TanStack Router if typed routes/typed search-params are a priority.

## Target layout

```
src/ (app/{providers,styles,main.tsx}, assets/, components/{ui,layout}, features/<feature>/{api,components,hooks,types,utils,index.ts}, pages/, hooks/, services/, store/, types/, utils/, test-utils/)
index.html, vite.config.ts, tsconfig.json, eslint.config.js, .prettierrc, setupTests.ts, package.json, .env.example, .github/workflows/ci.yml
```

## Steps

1. Create the folder skeleton above.
2. vite.config.ts + tsconfig.json with strict mode enabled ("strict": true).
3. ESLint (TypeScript + React Hooks + eslint-plugin-jsx-a11y) as eslint.config.js flat config, and Prettier, wired into package.json scripts (lint, format, typecheck).
4. Configure eslint-plugin-boundaries (or import/no-restricted-paths from eslint-plugin-import) to enforce the unidirectional import flow (shared → features → pages/app; a feature only importable via its index.ts; no feature-to-feature imports) — this is not optional polish.
5. Vitest configured with jsdom environment, @testing-library/react and @testing-library/user-event set up, plus a test-utils/render.tsx that wraps components with the app's real providers. Add vitest-axe alongside it for DOM-level accessibility assertions.
6. Install the confirmed styling approach's dependencies and the form stack's (react-hook-form + zod + @hookform/resolvers by default) — don't leave them for the first feature slice to discover missing.
7. A first vertical slice (one small feature under features/, with its index.ts public API) wired end to end — page → feature's public API → feature-internal component/hook → shared component/hook → service (API call). If it includes a form, wire it with React Hook Form + Zod; if it includes a reusable component with variants, use cva. Keep it minimal; it is a template, not a feature.
8. A minimal test under the slice's own test file (render + one interaction + one assertion).
9. .env.example documenting any client-exposed env vars, with a note that anything here is public in the shipped bundle.
10. A reference .github/workflows/ci.yml: an install job with dependency caching, then lint, typecheck, and test jobs running in parallel off that install, and a build job that depends on all three passing.
11. Copy CLAUDE.md, AGENTS.md, .claude/settings.json.example, .claude/agents/, and .claude/skills/ into the new project — install at the project level, never globally.

## Scaffolding a new feature module

features/<name>/ (api/, components/, hooks/, types/, utils/, index.ts re-exporting exactly what other code is allowed to import)

- Don't create empty placeholder subfolders the feature doesn't need yet.
- index.ts is not a "re-export everything" barrel — only export what other code genuinely needs to consume.
- If this feature needs something from another existing feature, do not import that feature's internals — either the shared thing belongs in a global components/hooks/utils/, or the two features should be composed together at the pages/ level instead.

## Scaffolding a single component or hook

- ComponentName.tsx — typed props, placed in shared components/ui|layout/, inside the owning features/<feature>/components/, or pages/. If it goes inside a feature and needs to be usable from outside that feature, also add it to that feature's index.ts export list.
- ComponentName.types.ts — only if the prop/data types are non-trivial enough to warrant separation.
- Styles — in whatever the project already uses. Do not introduce a second styling approach.
- ComponentName.test.tsx — a real skeleton (imports, a render, one meaningful assertion), not an empty placeholder.
- For a hook, the equivalent is useSomething.ts (+ useSomething.types.ts only if warranted) and useSomething.test.ts using renderHook.

## Restrictions

- Do not invent business logic beyond the minimal example slice — you are scaffolding structure, not features.
- Do not scaffold auth flows with real-looking secrets left in place; use obvious placeholders (e.g. CHANGE_ME) and flag them explicitly to me.
- Do not overwrite existing files without asking first.
- Do not pick a routing, state-management, or data-fetching library I didn't confirm — ask if it's not already evident from the project.
- Do not manufacture a .types.ts file, a styles file, or a test file when the project's own convention doesn't call for one.
- Do not add a new feature's component/hook/type/util file directly and skip updating index.ts if it's meant to be consumed from outside the feature.
- Do not scaffold a project without wiring the ESLint boundaries/import-restriction rule from step 4.

If a choice here is a genuine open architecture or business trade-off rather than a clear rule above, say so explicitly and ask me, instead of deciding unilaterally.

Current-standard additions (per CLAUDE.md): this scaffolds the Vite SPA profile (a Library skeleton on request); for a Framework app use the framework's own generator and then add features/, the boundaries rule and tooling. Confirm the package manager (npm default), the Node LTS to pin (.nvmrc, engines), and whether Playwright and Storybook are wanted now. Layout additions: features/<name>/schemas/ (Zod schemas that form and payload types derive from); src/lib/ (http client, queryClient, logger) with lib/env.ts as the ONLY reader of import.meta.env, validated with Zod; knip.json, .husky/ hooks + lint-staged.config.mjs, bitbucket-pipelines.yml, .nvmrc, .npmrc with min-release-age and ignore-scripts=true, e2e/ (when confirmed). Tooling: tsconfig strict plus noUncheckedIndexedAccess, exactOptionalPropertyTypes, noImplicitOverride, noFallthroughCasesInSwitch, verbatimModuleSyntax, erasableSyntaxOnly, moduleResolution bundler, noEmit; Vite with build.sourcemap 'hidden'; ESLint flat config via defineConfig with type-checked typescript-eslint presets (projectService), react-hooks recommended (compiler rules, exhaustive-deps as error), react/no-danger, jsx-a11y, import-x no-cycle, no-console, no-floating-promises, plus eslint-plugin-boundaries; Prettier; Vitest 4+ with jsdom, v8 coverage thresholds at 100, MSW (onUnhandledRequest: 'error'), a test-utils render with real providers and a fresh QueryClient (retry: false), vitest-axe; Tailwind v4 CSS-first (@tailwindcss/vite, @theme, cva + cn(), no tailwind.config.js); an accessible headless primitive library if dialogs/menus exist; TanStack Query v5, the router (TanStack Router default for new SPAs), zod, react-hook-form + @hookform/resolvers, react-error-boundary. Add lib/http.ts (typed fetch wrapper: AbortSignal.timeout, ApiError with kind), lib/logger.ts (PHI-safe, forwards to monitoring), a SafeHtml component if HTML rendering is anticipated, and app-level Error Boundary + Suspense wiring. The first vertical slice goes page → feature public API → component/hook → api/ function (Zod-validated response) + queryOptions → http client, with a test using the real providers, an MSW handler, one user-event interaction and one vitest-axe check. CI comes from bitbucket-pipelines.yml and git hooks from the .husky/ hooks (husky + lint-staged, `prepare` script) (every script they call must exist in package.json); add GitHub Actions only if the project is on GitHub. Components are function components with named exports and `ref` as a prop (no forwardRef). Do not scaffold runtime CSS-in-JS, enums, class components, default-export components, `export *` barrels or token storage in localStorage; do not pin versions from memory — install with the package manager and commit the lockfile.
```
