# AGENTS.md

Project instructions for coding agents are in [`CLAUDE.md`](CLAUDE.md): commands, layers, auth flow, the proxy and API layer, and the design system. Read it first.

## Use the shared foundation first

- **Before implementing any story, read [`docs/FOUNDATION.md`](docs/FOUNDATION.md).** It catalogs everything already built in specs 7.0a–7.0c-1 and F1–F5: modules, components, hooks, routes, recipes, and a story → foundation map. Also read the story's *Foundation 2026-10-14* lines in `_bmad-output/planning-artifacts/epics.md`.
- **Don't rebuild or bypass a foundation piece.** If something is missing, extend the module that owns it and add it to `docs/FOUNDATION.md` in the same change.
- **1health traffic:** the browser goes only through `callApi` (`@/lib/api`) to `/api/1h/*`. Add each endpoint to its area file `lib/server/proxy/allowlist/<area>.ts`, never to `index.ts`. Server work across calls goes in a named op (`createNamedOp` → `/api/pp/*`).
- **Copy and errors:** copy comes only from `lib/shared/messages/<area>.ts`. Errors go only through `mapApiError(scope, response)`, with upstream text matched only in `lib/api/errors/<area>.ts`.
- **UI:** Sections use `useSectionForm` with the Section chrome, `StateFrame` for every read, `runSaveSteps` for multi-request saves, the shell toasts, and the `components/ui` controls (Select, DateInput, Combobox, InfoPopover, DisabledAction…).
- **Tokens and lint:** use semantic tokens only. Layering and ownership lint (`eslint.config.mjs`) and `scripts/check-forbidden.sh` must stay green.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
