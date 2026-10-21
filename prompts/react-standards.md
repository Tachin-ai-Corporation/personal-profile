# Prompt: react-standards (React + TypeScript)

**Paste this into any AI chat tool that doesn't have Claude Code's skills** (ChatGPT, Gemini web/CLI, a Cursor/Windsurf chat, etc.). Claude Code users: use the real `react-standards` skill instead — this is a portable translation of it, kept only for tools that can't run it natively. If this file and `.claude/skills/react-standards/SKILL.md` ever disagree, the Claude Code version wins.

---

```
Read CLAUDE.md at the root of this repository first — if you can't access files, ask me to paste it. It is the standing standard for this project (architecture, style, security, testing rules); everything below assumes it and does not re-derive those rules independently.

You are applying an operational standard for React + TypeScript projects. Use it both when developing new code and when reviewing or refactoring existing code.

If this task is really scaffolding a brand-new project or a new feature module from scratch, use the react-scaffolder prompt (prompts/react-scaffolder.md) instead of this one. For a deep standalone audit, prefer prompts/react-auditor.md; for a focused incremental refactor, prompts/react-refactorer.md; for performance-specific work, prompts/react-perf-optimizer.md; for test-writing, prompts/react-test-writer.md. This prompt is the general-purpose standard that all of those specialize.

Use this standard whenever the task involves: creating new components, hooks, or feature modules; reviewing React/TypeScript code quality; auditing architecture or technical debt; refactoring existing code; standardizing project structure; or improving typing, testing, accessibility, security, or maintainability.

Resolve the task while preserving these priorities, in order: 1) clarity, 2) security, 3) maintainability, 4) testability, 5) consistency, 6) justified performance.

Base philosophy: explicit is better than implicit; simple is better than complex; flat is better than nested (avoid deeply nested ternaries/conditional JSX); readability counts; errors should never pass silently; if an implementation is hard to explain, it's a bad idea.

## Mandatory rules

Architecture:
- Keep components thin; move business/data logic to hooks or services. Encapsulate data fetching in services/query hooks, not inline in components.
- Follow the feature-based layout (app, components/ui|layout, features/<name>/{api,components,hooks,types,utils,index.ts}, pages, hooks, services, store, types, utils) — see CLAUDE.md § Module / folder layout.
- Enforce the unidirectional import flow (shared → features → pages/app) as an ESLint rule (eslint-plugin-boundaries / import/no-restricted-paths), not just a convention.
- A feature's only import surface is its index.ts public API; never import a feature's internal components/, hooks/, types/, or utils/ directly from outside that feature.
- A feature must never import another feature's internals; if two features need to share something, promote it to a global components/, hooks/, or utils/, or compose them together at the pages/ level instead.
- Do not let shared components/hooks/services/utils depend on a specific feature module — dependencies flow from features into shared code, never the other way.
- Colocate: a helper/type/sub-component used by only one thing lives next to it, not hoisted to a shared folder pre-emptively — promote it only once a second real consumer needs it.
- Do not leak raw API response shapes into UI components — map/normalize at the service boundary.
- When an OpenAPI spec exists for the backend, generate types with openapi-typescript and map them to domain types in services/ instead of hand-writing API types; tRPC is a valid alternative only when the same team controls both codebases.

State management:
- Do not duplicate server state (query/API data) into local useState unless it is a genuine editable draft kept as a clearly distinct variable from the server value — a copied server value drifts the moment the real one changes underneath it (a refetch, another tab's mutation, an optimistic-update rollback), producing the classic stale-data / silently-overwritten-edit bug class. This is a hard rule.
- Mutations and their loading/error state go through the data-fetching layer, not a hand-rolled parallel state.

Forms:
- Default stack is React Hook Form + Zod — the current industry standard. Use it unless the project already has a different established convention; never mix two form stacks in one codebase.
- Forms beyond ~2 fields use a form library + a typed validation schema, not per-field manual useState.
- Derive the form's TypeScript type from the Zod schema (z.infer) instead of declaring the shape twice; wire it in via the resolver (zodResolver).
- Validation messages come from the schema (formState.errors), not scattered ad hoc checks; server-side validation errors are set via setError, not a disconnected error block.

Styling: exactly one styling approach per project (Tailwind, CSS Modules, or styled-components) — see CLAUDE.md § Styling approach. Reusable components with multiple visual variants use the approach-appropriate variant mechanism (cva for Tailwind, a typed prop → module-class map for CSS Modules, a typed prop → lookup for styled-components) — never hand-built class-string ternaries.

Error handling:
- Every top-level route/page and independent feature module is wrapped in an Error Boundary with a real fallback UI.
- Async errors are handled explicitly at the call site / data layer — an Error Boundary does not catch them.
- An Error Boundary must report the caught error to whatever monitoring is configured (e.g. Sentry), not just render a fallback.

React: use function components and hooks (no class components in new code); respect the Rules of Hooks; use useEffect only for real synchronization with an external system, not for derivable state; define props types explicitly, avoid any; keep accessibility basics in place (semantic elements, labeled inputs, keyboard operability).

TypeScript: follow strict typing, avoid unnecessary any; prefer discriminated unions over boolean-flag state; do not use `as` to silence a type mismatch — use `satisfies` when a literal needs validating against a type without widening it.

Tooling: respect ESLint (flat config, eslint.config.js), Prettier, TypeScript strict mode, and Vitest + React Testing Library (Jest + RTL only if the project already standardized on it).

Security:
- No hardcoded secrets, and never embed them in client-exposed env vars.
- Do not use dangerouslySetInnerHTML without sanitization; treat CSP/Trusted Types as defense-in-depth around it.
- Validate/escape data crossing trust boundaries (URL/query params, storage).
- Auth/session tokens belong in httpOnly + Secure + SameSite cookies, never localStorage/sessionStorage.
- Lockfile must be committed; a dependency audit (npm audit/pnpm audit) must run in CI.

## Development mode (creating new code)

1. Identify the correct layer for each change (component, hook, service, store). 2. Propose the structure before writing if there is ambiguity. 3. Keep props/state/API contracts typed and clear. 4. Write simple, modular, testable code. 5. Run the test suite and coverage report; close any gaps until the changed/new code hits 100% coverage (or is justified with /* v8 ignore next -- reason */, or /* istanbul ignore next -- reason */ on a Jest/Istanbul project) — see CLAUDE.md § Test coverage requirement; the change is not done until this passes. 6. Respect the project's existing style unless it contradicts a critical rule above.

## Audit mode

1. Analyze the current structure, layers, and patterns. 2. Detect code smells and deviations from the standard. 3. Group findings by severity. 4. Explain the technical impact of each finding. 5. Propose quick wins before large rewrites.

## Refactor mode

1. Identify the risk of the change first. 2. Preserve observable behavior unless I explicitly instruct otherwise. 3. Prefer small, sequential refactors. 4. Avoid moving too many pieces at once. 5. If the change affects a component's public props/exported API, warn about it beforehand. 6. Update or extend tests as part of the refactor — it is not done until the suite passes and the touched code is back at 100% coverage.

## Findings you must report

Business/data logic inline in components; data fetching from presentational components; absence of typed props/API contracts; hardcoded configuration; logic duplication; circular imports; excessive use of any; lack of validation; inconsistent error handling; console.log in application code; lack of tests in critical flows; changed/new code left below 100% coverage without a justified ignore pragma; accessibility gaps (missing labels, non-semantic interactive elements); server state duplicated into local useState without being a genuine draft; forms beyond trivial size with manual per-field state instead of React Hook Form + Zod; a form's TypeScript type hand-declared separately from its Zod schema instead of derived via z.infer; routes/features with no Error Boundary, or an Error Boundary with no real fallback UI; unnecessary re-renders, render cascades from broad contexts, or missing code-splitting on large routes/features; more than one styling approach in use in the same codebase, or hand-built variant class-string ternaries; a feature imported from outside via anything other than its index.ts; one feature importing another feature's internals directly instead of going through a shared module or being composed at the page level; no ESLint rule actually enforcing the unidirectional import flow.

## Severities

- Critical: security (XSS, exposed secrets), data loss or corruption, incorrect auth handling on the client.
- High: severe coupling, broken accessibility on core flows, insecure contracts, absence of tests in core logic.
- Medium: duplication, incomplete typing, moderate architectural debt, weak documentation.
- Low: style, minor naming, superficial consistency.

## Response format

When auditing or proposing a refactor, use this structure per finding:

### Finding: [title]
- Severity:
- Location:
- Rule violated:
- Problem:
- Impact:
- Recommendation:
- Justification:

Then group into: Main risks / Quick wins / Medium refactors / Structural refactors / Suggested implementation order.

## Safety rules for automatic changes

You may apply automatically, without asking first: formatting, import ordering, obvious local renames, minor typing improvements, extraction of trivial constants, removing console.log when the context is clear.

You must NOT apply automatically, and must warn me first: changes to a component's public props/exported API, routing structure changes, global state/store shape changes, massive architecture changes, or any refactor that alters observable behavior.

If a decision is a genuine open architecture or business trade-off rather than a clear rule violation above, say so explicitly and ask, instead of deciding unilaterally.

Current-standard additions (per CLAUDE.md): detect the profile first — Vite SPA (default), Framework app (Next.js App Router / React Router v7 framework mode / TanStack Start: Server Components and server actions) or Library — and apply each directory's own profile; say which one you applied. TypeScript/JS core: strict plus noUncheckedIndexedAccess, exactOptionalPropertyTypes, verbatimModuleSyntax and erasableSyntaxOnly for new code (ratchet legacy); ES modules only; no enum/namespace; named exports; curated index.ts barrels, never `export *`; every external boundary (HTTP, storage, URL params, postMessage, JSON.parse, env) is `unknown` until a Zod schema parses it once at the api/lib edge — `as` on a payload is not validation; env vars only read in lib/env.ts; discriminated unions with exhaustive switches; no floating promises; every request has a timeout/AbortSignal; never swallow errors; no side effects at import; no console.* (use lib/logger); never PHI/PII in URLs, storage, logs, analytics or error reports. State: server, client, URL and form state are different things (URL-shaped state lives in the URL); TanStack Query with a queryOptions factory per query, key factories, deliberate staleTime, invalidate rather than patch; Zustand only through selectors. Forms: React Hook Form + Zod 4 (React 19 form actions for server-action/optimistic flows), accessible by construction. React: target React 19+ (ref as a prop, <Context value>, use, useActionState/useOptimistic/useFormStatus, useTransition/useDeferredValue, useEffectEvent; no forwardRef/defaultProps/PropTypes/class components in new code); keep render pure so it is StrictMode- and React Compiler-compatible — on a compiler project write plain code with no default useMemo/useCallback/React.memo; exhaustive-deps is an error and is never silenced; "You Might Not Need an Effect"; Suspense paired with an Error Boundary and transitions instead of spinners over visible UI. Accessibility: WCAG 2.2 AA, semantic HTML, accessible headless primitives (Radix/React Aria/Base UI) for dialogs/menus/comboboxes, focus management, labels, contrast, reduced motion; jsx-a11y + vitest-axe + axe in e2e. Styling: exactly one approach (Tailwind v4, CSS Modules or zero-runtime CSS-in-JS; no runtime CSS-in-JS in new code). Security: DOMPurify inside one SafeHtml component, validate URL schemes and ?next= redirects, check postMessage origins, rel="noopener noreferrer", httpOnly cookie sessions (never web storage), frozen lockfile + release-age cooldown + lifecycle-script allow-list + audit in CI, a justification for every new dependency. Framework apps: Server Components by default, "use client" only on leaves, parallel server fetching, server actions/route handlers are public endpoints (authenticate, authorize per resource, validate), import 'server-only', pass only needed fields to client components. Tooling: ESLint flat config with type-checked typescript-eslint, react-hooks recommended (with compiler rules), jsx-a11y, boundaries/import-x; Prettier; Vitest + RTL + user-event + MSW; Playwright + axe for e2e; knip, cycle checks, coverage thresholds, a bundle budget and gitleaks in CI; one package manager, Node pinned. Also flag as findings: impure render, suppressed exhaustive-deps, legacy React APIs in new code, boundary payloads cast with `as`, import.meta.env outside lib/env.ts, floating promises, empty catch, PHI/PII in URLs/storage/logs/analytics, auth tokens in web storage, open redirects, unsanitized HTML, server actions without authn/authz/validation. For a security-only pass use the react-security-auditor prompt; for dependency majors and tooling migrations use the react-migration-specialist prompt.
```
