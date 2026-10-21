---
name: react-standards
description: Use this skill to develop, audit, or refactor React + TypeScript projects following a strict standard of architecture, typing, security, readability, and incremental refactoring.
---

# Skill: react-standards

This skill applies an operational standard for React + TypeScript projects. It must be used both when developing new code and when reviewing or refactoring existing projects.

**Detect the profile first** (`CLAUDE.md` § Project profiles): Vite SPA (default), Framework app (Next.js App Router / React Router v7 framework mode / TanStack Start — Server Components and server actions), or Library. Apply each directory's own profile and say which one you applied. Don't apply SPA data-fetching rules inside a Server Component, and don't impose `features/` on a library.

## When to use this skill

Use this skill when the task involves any of these scenarios:

- creating new components, hooks, or feature modules
- reviewing React/TypeScript code quality
- auditing architecture or technical debt
- refactoring existing code
- standardizing project structure
- improving typing, testing, accessibility, security, or maintainability

## Related agents

- Bootstrapping a new project or feature module: use the `react-scaffolder` skill.
- Deep, standalone audit without editing code: use the `react-auditor` agent.
- Applying incremental, safe refactors: use the `react-refactorer` agent.
- Writing or updating Vitest/React Testing Library coverage: use the `react-test-writer` agent.
- Diagnosing/fixing re-renders, render cascades, bundle/tree-shaking, Core Web Vitals or missing code-splitting: use the `react-perf-optimizer` agent.
- Security-only review (XSS, tokens, CSP, redirects, PHI exposure, server actions, supply chain): use the `react-security-auditor` agent.
- Dependency majors and tooling/pattern migrations (React 19, Compiler, flat ESLint, Vite, Vitest, TS strictness): use the `react-migration-specialist` agent.
- For architecture trade-offs, quality/test strategy, or business context beyond what this skill covers, escalate to the `bmad-arch`, `bmad-qa`, or `bmad-sm`/`bmad-pm` agents respectively (see `CLAUDE.md` § Multi-agent collaboration). When several independent tasks show up at once, prefer launching one agent per task in parallel over working through them one by one.

## Objectives

The task must be resolved while preserving these priorities:

1. clarity
2. security
3. maintainability
4. testability
5. consistency
6. justified performance

## Base philosophy

- Explicit is better than implicit.
- Simple is better than complex.
- Flat is better than nested — avoid deeply nested ternaries/conditional JSX.
- Readability counts.
- Errors should never pass silently.
- If an implementation is hard to explain, it's a bad idea.

## Mandatory rules

### Architecture
- Keep components thin.
- Move business/data logic to `hooks` or `services`.
- Encapsulate data fetching in `services`/query hooks, not inline in components.
- Follow the feature-based layout (`app`, `components/ui|layout`, `features/<name>/{api,components,hooks,types,utils,index.ts}`, `pages`, `hooks`, `services`, `store`, `types`, `utils`) — see `CLAUDE.md` § Module / folder layout.
- Enforce the unidirectional import flow (`shared → features → pages/app`) — this must be an ESLint rule (`eslint-plugin-boundaries`/`import/no-restricted-paths`), not just a convention.
- A feature's only import surface is its `index.ts` public API; do not import a feature's internal `components/`, `hooks/`, `types/`, or `utils/` directly from outside that feature.
- A feature must never import another feature's internals; if two features need to share something, promote it to a global `components/`, `hooks/`, or `utils/`, or compose them together at the `pages/` level instead.
- Do not let shared components/hooks/services/utils depend on a specific feature module — dependencies flow from features into shared code, never the other way.
- Colocate: a helper/type/sub-component used by only one thing lives next to it (or in that feature's own `utils/`/`types/`), not hoisted to a shared folder pre-emptively — promote it only once a second real consumer needs it.
- Do not leak raw API response shapes into UI components — map/normalize at the service boundary.
- When an OpenAPI spec exists for the backend, generate types with `openapi-typescript` and map them to domain types in `services/` instead of hand-writing API types; tRPC is a valid alternative only when the same team controls both codebases (it removes the mapping step but tightly couples them).

### TypeScript & JavaScript core
- `strict` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `erasableSyntaxOnly` for new code (ratchet legacy); ES modules only; no `enum`/`namespace`; named exports (default only where a tool requires it); curated `index.ts` barrels, never `export *`.
- Every external boundary (HTTP, storage, URL params, `postMessage`, `JSON.parse`, env) is `unknown` until a Zod schema parses it — once, at the `api/`/`lib/` edge. `as` on a payload is not validation. Env vars are read only in `lib/env.ts`.
- Discriminated unions with exhaustive `switch`; branded IDs where mix-ups are plausible; derive types from values (`z.infer`, `typeof`, `satisfies`).
- No floating promises; every request has a timeout/`AbortSignal`; never swallow errors (no empty `catch`), wrap with `{ cause }`.
- No side effects at import; no module-level mutable state; no `console.*` (use `lib/logger`); never PHI/PII in URLs, storage, logs, analytics or error reports.

### State management
- Server state, client state, URL state and form state are different things: URL-shaped state (filters, pagination, tabs) lives in the URL. TanStack Query: a `queryOptions` factory per query, key factories, deliberate `staleTime`, invalidate rather than patch; Zustand: small stores consumed only through selectors.
- Do not duplicate server state (query/API data) into local `useState` unless it is a genuine editable draft, kept as a clearly distinct variable from the server value. This is a hard rule, not a style preference: a copied server value drifts the moment the real one changes underneath it (a refetch, another tab's mutation, an optimistic-update rollback), producing the classic stale-data / silently-overwritten-edit bug class.
- Mutations and their loading/error state go through the data-fetching layer, not a hand-rolled parallel state.

### Forms
- Default stack is **React Hook Form + Zod** (Zod 4+) — the current industry standard for React + TypeScript; React 19 form actions (`useActionState`/`useFormStatus`/`useOptimistic`) for server-action/optimistic flows.
- Forms are accessible by construction: visible labels, `aria-describedby`/`aria-invalid` on errors, focus on the first invalid field, pending state on submit. Use it unless the project already has a different established convention; never mix two form stacks in one codebase.
- Forms beyond ~2 fields use a form library + a typed validation schema, not per-field manual `useState`.
- Derive the form's TypeScript type from the Zod schema (`z.infer`) instead of declaring the shape twice; wire it in via the resolver (`zodResolver`).
- Validation messages come from the schema (`formState.errors`), not scattered ad hoc checks; server-side validation errors are set via `setError`, not a disconnected error block.

### Styling
- Exactly one styling approach per project (Tailwind v4, CSS Modules, or a zero-runtime CSS-in-JS; runtime CSS-in-JS is not for new code) — see `CLAUDE.md` § Styling approach for which one and the per-approach variant pattern.
- Reusable components with multiple visual variants use the approach-appropriate variant mechanism (`cva`/`tailwind-variants` + `cn()` for Tailwind, a typed prop → module-class map for CSS Modules, the library's recipes for zero-runtime CSS-in-JS) — never hand-built class-string ternaries.

### Accessibility
- Target WCAG 2.2 AA: semantic HTML first, accessible headless primitives (Radix/React Aria/Base UI) for dialogs/menus/comboboxes, keyboard operability and visible focus, focus management on route change and dialog open/close, labels/names for every control, contrast and reduced motion. `jsx-a11y` + `vitest-axe` + axe in e2e, plus a manual keyboard/screen-reader pass on core flows.

### Error handling
- Every top-level route/page and independent feature module is wrapped in an Error Boundary with a real fallback UI.
- Async errors are handled explicitly at the call site / data layer — an Error Boundary does not catch them.
- An Error Boundary must report the caught error to whatever monitoring is configured (e.g. Sentry), not just render a fallback — otherwise production failures go unnoticed.

### React
- Target React 19+: `ref` as a prop (no `forwardRef`), `<Context value>`, `use`, `useActionState`/`useOptimistic`/`useFormStatus`, `useTransition`/`useDeferredValue` for non-urgent updates, `useEffectEvent` for non-reactive effect logic; no `defaultProps`/`PropTypes`/legacy context/class components in new code.
- Keep render pure (no mutation, no `Date.now()`/`Math.random()`/storage reads during render) so it is StrictMode-clean and React Compiler-compatible. On a project with the compiler, write plain code — no default `useMemo`/`useCallback`/`React.memo`; hand memoization needs a comment. Treat compiler bail-outs as findings.
- Respect the Rules of Hooks; `exhaustive-deps` is an error and is never silenced — restructure instead.
- "You Might Not Need an Effect": derive during render, reset with `key`, put event logic in handlers, fetch with the query layer, subscribe with `useSyncExternalStore`. `useEffect` only to synchronize with an external system, and it cleans up.
- Define `props` types explicitly; compose with `children`; extend native props with `ComponentPropsWithoutRef`; avoid `any`.
- Suspense boundaries go where loading UI should appear, always paired with an Error Boundary; use transitions so visible UI isn't replaced by a spinner.

### TypeScript
- Follow strict typing; avoid unnecessary `any`.
- Prefer discriminated unions over boolean-flag state.
- Do not use `as` to silence a type mismatch; use `satisfies` when a literal needs validating against a type without widening it.

### Framework apps (profile)
- Server Components by default, `"use client"` only on the leaves that need state/effects/browser APIs; fetch on the server in parallel; server actions/route handlers are public endpoints — authenticate, authorize per resource, validate with Zod; `import 'server-only'` for secrets/DB clients; pass only the fields a client component needs (never whole PHI records).

### Tooling
- Respect ESLint (flat config, `eslint.config.js`/`.ts`, type-checked `typescript-eslint` presets, `eslint-plugin-react-hooks` recommended with compiler rules, `jsx-a11y`, `boundaries`/`import-x`) for linting; Prettier for formatting; TypeScript strict for typing.
- Respect Vitest + React Testing Library + `user-event` + MSW for testing, Playwright (+ axe) for e2e on critical flows (Jest + RTL only if the project already standardized on it).
- Keep `knip`, cycle checks, coverage thresholds, a bundle budget and `gitleaks` green in CI; one package manager, frozen lockfile, Node pinned via `.nvmrc`/`packageManager`.

### Security
- Do not introduce hardcoded secrets or embed them in client-exposed env vars.
- Do not use `dangerouslySetInnerHTML` without sanitization (DOMPurify inside one `SafeHtml` component); treat CSP/Trusted Types as defense-in-depth around it. Validate URL schemes and `?next=` redirects; check `postMessage` origins; `rel="noopener noreferrer"` on `_blank` links.
- Validate/escape data crossing trust boundaries (URL/query params, storage).
- Auth/session tokens belong in httpOnly + Secure + SameSite cookies, never `localStorage`/`sessionStorage`.
- Lockfile must be committed and installed frozen; a dependency audit (`pnpm audit`/`npm audit`) must run in CI; use a release-age cooldown and a lifecycle-script allow-list; justify every new dependency in the PR.
- PHI/PII never in URLs, web storage, logs, analytics/replay or error reports; clear the query cache on logout; synthetic data only in fixtures/stories.

## Development mode

When the task is to create new code:

1. identify the correct layer for each change (component, hook, service, store)
2. propose the structure before writing if there is ambiguity
3. keep props/state/API contracts typed and clear
4. write simple, modular, testable code
5. run lint, `tsc --noEmit`, the test suite and coverage report; use `react-test-writer` to close any gaps until the changed/new code hits 100% coverage (or is justified with `/* v8 ignore next -- reason */`, or `/* istanbul ignore next -- reason */` on a Jest/Istanbul project) — see `CLAUDE.md` § Test coverage requirement. The change is not done until this passes.
6. respect the project's style, unless it contradicts critical rules

## Audit mode

When the task is to review an existing project:

1. analyze the current structure, layers, and patterns
2. detect code smells and deviations from the standard
3. group findings by severity
4. explain the technical impact of each finding
5. propose quick wins before large rewrites

## Refactor mode

When the task is to refactor:

1. identify the risk of the change first
2. preserve observable behavior unless explicitly instructed otherwise
3. prefer small, sequential refactors
4. avoid moving too many pieces at once
5. if the change affects a component's public props/exported API, warn about it beforehand
6. update or extend tests as part of the refactor, not as an afterthought — the refactor is not done until the suite passes and the touched code is back at 100% coverage (see `CLAUDE.md` § Test coverage requirement)

## Findings that must be reported

Flag as a finding, among others:

- business/data logic inline in components
- data fetching from presentational components
- absence of typed props/API contracts
- hardcoded configuration
- logic duplication
- circular imports
- excessive use of `any`
- lack of validation
- inconsistent error handling
- `console.log` in application code
- lack of tests in critical flows
- changed/new code left below 100% coverage without a justified `/* v8 ignore next -- reason */` (or `/* istanbul ignore next -- reason */` on Jest/Istanbul)
- accessibility gaps (missing labels, non-semantic interactive elements, no focus management, hand-built dialogs/menus)
- impure render, suppressed `exhaustive-deps`, legacy React APIs in new code, hand-written memoization on a React Compiler project
- boundary payloads cast with `as` instead of validated, `import.meta.env` read outside `lib/env.ts`, floating promises, empty `catch`, `console.*`
- PHI/PII in URLs, storage, logs or analytics; auth tokens in web storage; open redirects; unsanitized HTML
- server actions/route handlers without authn/authz/validation (Framework apps)
- server state duplicated into local `useState` without being a genuine draft
- forms beyond trivial size with manual per-field state instead of React Hook Form + Zod (or the project's justified alternative)
- a form's TypeScript type hand-declared separately from its Zod schema instead of derived via `z.infer`
- routes/features with no Error Boundary, or an Error Boundary with no real fallback UI
- unnecessary re-renders, render cascades from broad contexts, or missing code-splitting on large routes/features
- more than one styling approach in use in the same codebase, or hand-built variant class-string ternaries instead of the approach-appropriate variant pattern
- a feature imported from outside via anything other than its `index.ts` (deep-importing an internal path)
- one feature importing another feature's internals directly instead of going through a shared module or being composed at the page level
- no ESLint rule (`eslint-plugin-boundaries`/`import/no-restricted-paths`) actually enforcing the unidirectional import flow — a documented-only rule that nothing catches

## Severities

### Critical
- security (XSS, exposed secrets)
- data loss or corruption
- incorrect auth handling on the client

### High
- severe coupling
- broken accessibility on core flows
- insecure contracts
- absence of tests in core logic

### Medium
- duplication
- incomplete typing
- moderate architectural debt
- weak documentation

### Low
- style
- minor naming
- superficial consistency

## Response format

When auditing or proposing a refactor, use this structure:

### Finding: [title]
- Severity:
- Location:
- Rule violated:
- Problem:
- Impact:
- Recommendation:
- Justification:

Then group:

- Main risks
- Quick wins
- Medium refactors
- Structural refactors
- Suggested implementation order

## Safety rules for automatic changes

You may automatically apply only low-risk changes such as:

- formatting
- import ordering
- obvious local renames
- minor typing improvements
- extraction of trivial constants
- removing `console.log` when the context is clear

You must not apply automatically without warning:

- changes to a component's public props/exported API
- routing structure changes
- global state/store shape changes
- massive architecture changes
- refactors that alter observable behavior
