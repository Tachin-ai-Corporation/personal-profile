---
title: '7.0b-1 Design tokens, message catalog, error mapping and shared dialogs/states'
type: 'feature'
created: '2026-10-14'
status: 'done'
baseline_commit: '51935edb2a188fdcb1324316338ad0c6360f63dd'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-personal-profile-2026-10-13/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-personal-profile-2026-10-13/EXPERIENCE.md'
  - '/Users/idanielgarcia/Documents/DEV/oneHealth/dev-std-ai-agents-and-skills/stacks/react/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The shell (7.0b-2) and Story 7.1 need a common visual and copy foundation that does not exist yet: the D13 design tokens, the message catalog beyond launch strings, the single upstream→app error mapping, the one confirm dialog, and the shared load-error / no-access states. Today `components/ui/dialog.tsx` still uses `bg-black/50` and nothing enforces semantic tokens.

**Approach:** Implement the token part of Story 1.8 (L1181–1192), the message catalog and read-side error mapping of Story 1.12 (L1503–1526), the `ConfirmDialog` of Story 1.11 (L1488–1495) and the generic read states used by Story 7.1 (L3267–3275), exactly as `epics.md` and DESIGN.md/EXPERIENCE.md specify and under decisions D1–D13. No navigation, app bar, tabs, header, registry, leave guard or session dialog here (7.0b-2).

## Boundaries & Constraints

**Always:**
- Layout from 7.0a: primitives in `components/ui/`, copy in `lib/shared/messages.ts`, mapping in `lib/api/errors.ts`, reusable states in `features/shell/` (exported through `features/shell/index.ts`). One `mapApiError()`, one `ConfirmDialog`, one message catalog; no duplicated strings or mapping.
- Tokens `link-text`, `destructive-fill`, `primary-text`, `scrim`, `control-border`, `tooltip`, `tooltip-foreground` with the DESIGN.md light/dark values, added in `:root`, `.dark` and `@theme inline` following the existing three-tier rules; a comment block lists the deviations/additions to report upstream. `--border` keeps table rules and hairlines.
- A token check (lint rule or script wired into `scripts/check-forbidden.sh`) fails on hex colors and Tailwind palette classes in `components/`, `features/`, `app/` (outside `app/globals.css`), on `text-info-strong` used for links and on `bg-error-strong` anywhere. Existing offenders (e.g. `components/ui/toast.tsx` red classes) are fixed in this change.
- `components/ui/dialog.tsx` overlay uses `bg-scrim`; the `components/ui/` exemption for `bg-black/50` is removed from `scripts/check-forbidden.sh`.
- Copy: every shell/state/dialog string Story 7.1 and 7.0b-2 need, verbatim from EXPERIENCE.md Voice & Tone; anything else marked `// DRAFT COPY`. Verbatim test against EXPERIENCE.md and a voice test (no "!", no "contact point"/"precedence" in sentences) that exempts the D9 launch strings. `LAUNCH_*` keys stay unchanged.
- `mapApiError(response: ApiResponse<unknown>): MappedError`, a discriminated union `forbidden | generic | network | session`, per Story 1.12 L1518–1526: upstream 403 (no `source:"proxy"`) → `forbidden`; proxy `NOT_ALLOWED` and any other proxy/BFF code → `generic` (never "no access"); no status, `UPSTREAM_ERROR`, `UPSTREAM_REDIRECT`, `REFRESH_UNAVAILABLE`, `SERVICE_DISABLED`, `UPSTREAM_TIMEOUT` → `network`; `SESSION_EXPIRED` → `session`; unknown → `generic`. `generic` carries the platform `message` when the upstream body had one. It is the only module outside `lib/api/client.ts`/`errors-codes.ts` that reads `errorCode`/`upstreamCode` (lint or test enforced).
- `ConfirmDialog` per L1488–1495: props `{ open, title, body, confirmLabel, variant: "standard" | "destructive", onConfirm, onCancel, extraAction?, busy? }`, `role="alertdialog"`, `rounded-lg`, `shadow-lg`, `scrim` overlay, entrance 220–280 ms with reduced-motion respected, footer Cancel → extraAction (outline) → confirm (primary or `bg-destructive-fill`), initial focus on Cancel, Escape/overlay = Cancel, focus returns to the trigger, `busy` blocks Cancel/Escape/overlay.
- `ReadState` components: `LoadError` ("Something went wrong while loading profile information" plus a separate "Retry" button calling `onRetry`) and `NoAccess` ("You don't have access to this in your current account", no action), plus a helper choosing between them from `mapApiError` (`session` renders nothing).
- WCAG 2.1 AA (axe clean in light and dark), 44 px targets, tests colocated for every new module.

**Never:**
- No app bar, page nav, tabs, header, `navigate()`, leave guard, Section registry, session dialog, toasts or edit-model primitives (7.0b-2 / 7.5).
- No new dependencies beyond pinned dev/test tooling if strictly needed; no new endpoints.
- Do not change launch copy, `/auth` behaviour or any 7.0a server code.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Upstream forbidden | `{statusCode:403, upstreamCode:…}` without `source:"proxy"` | `{kind:"forbidden"}` | — |
| Proxy refusal | `{statusCode:403, errorCode:"NOT_ALLOWED"}` | `{kind:"generic"}` (never forbidden) | — |
| Network-class | no status / 502 `UPSTREAM_ERROR` / 502 `UPSTREAM_REDIRECT` / 503 `REFRESH_UNAVAILABLE` / 503 `SERVICE_DISABLED` / 504 `UPSTREAM_TIMEOUT` | `{kind:"network"}` | — |
| Session | `SESSION_EXPIRED` | `{kind:"session"}`; `ReadState` renders nothing | — |
| Upstream message | 400 `{message:"X", code:N}` | `{kind:"generic", message:"X"}` | message absent → generic copy |
| Confirm busy | `busy` true, Escape / overlay / Cancel | nothing closes | — |
| Token check | a hex or `bg-red-500` in `features/x.tsx` | check fails naming the file | — |

</frozen-after-approval>

## Code Map

- `app/globals.css` -- three tiers; `:root` semantic 62–110, `.dark` 117–144, `@theme inline` 147–241 (`--color-x: var(--x)`). Add new tokens here only.
- `components/ui/dialog.tsx:46` -- overlay `bg-black/50` → `bg-scrim`. Base for `confirm-dialog.tsx` (reuse `@radix-ui/react-dialog`, no new dependency).
- `components/ui/toast.tsx:67` -- raw `red-*` classes; switch to semantic tokens so the token check passes. `button.tsx` -- add/adjust a `destructive` variant to `bg-destructive-fill`.
- `components/ui/badge.tsx:28` -- `text-info-strong` on a non-link badge; allowed (rule targets links only), keep.
- `lib/shared/messages.ts` -- extend; keep `LAUNCH_MESSAGES`/`LAUNCH_ERROR_MESSAGES` untouched.
- `lib/api/{types,errors-codes,index}.ts` -- `ApiResponse` has `statusCode`, `errorCode`, `upstreamCode`, `error`, `userMessage`; `parseErrorBody` already splits BFF vs upstream bodies. `errors-codes.ts:8` comment points here; export `mapApiError` from `lib/api/index.ts`.
- `features/shell/index.ts` -- export the read states.
- `scripts/check-forbidden.sh:74-76` -- remove the `components/ui/` `bg-black/50` exemption; add the token check.
- `eslint.config.mjs` -- if the token rule is a lint rule, scope it to `components/`, `features/`, `app/`.
- `vitest.config.ts` -- `features/**` and `components/**` tests run in the jsdom project; coverage threshold stays on `lib/**`.

## Tasks & Acceptance

**Execution:**
- [x] `app/globals.css` -- add the D13 + control-border + tooltip tokens (light/dark/@theme) and the upstream-deviation comment block.
- [x] `components/ui/dialog.tsx`, `components/ui/toast.tsx`, `components/ui/button.tsx` -- `bg-scrim` overlay; semantic tokens only; destructive button on `bg-destructive-fill`.
- [x] `scripts/check-tokens.sh` (or ESLint rule) + `scripts/check-forbidden.sh` + `.github/workflows/ci.yml` (+fixture test of the check) -- token check per Boundaries; drop the `bg-black/50` exemption.
- [x] `lib/shared/messages.ts` (+`messages.test.ts`) -- shell/state/dialog copy, verbatim + voice tests.
- [x] `lib/api/errors.ts` (+table test) + `lib/api/index.ts` -- `MappedError`, `mapApiError`; guard test that no other module reads `errorCode`/`upstreamCode`.
- [x] `components/ui/confirm-dialog.tsx` (+component and axe tests) -- per Boundaries.
- [x] `features/shell/read-state.tsx` (+tests) + `features/shell/index.ts` -- `LoadError`, `NoAccess`, `ReadStateFor({ error, onRetry })`.

**Acceptance Criteria:**
- Given dark mode, when a dialog opens, then its overlay is the `scrim` token (black 60 %), and in light mode graphite 45 %.
- Given the repo, when `bash scripts/check-forbidden.sh` runs, then it passes, and it fails if `bg-black/50`, a hex color or a palette class is added to `features/`.
- Given `pnpm lint && pnpm typecheck && pnpm vitest run --coverage && pnpm test:e2e && pnpm build`, then all pass.

## Design Notes

Load-error is the sentence plus a separate Retry button (the verbatim test checks the sentence; EXPERIENCE writes "· Retry" as the inline action). The voice test exempts the D9 launch strings ("Success!") because they are patient-vault verbatim. Toast restyling here is token-only; toast behaviour (`toastSuccess`/`toastError`, durations, position) lands with 7.5.

## Verification

**Commands:**
- `corepack pnpm lint && corepack pnpm typecheck` -- expected: clean
- `corepack pnpm vitest run --coverage` -- expected: green, 100% kept on `lib/**`
- `corepack pnpm test:e2e && corepack pnpm build` -- expected: green
- `bash scripts/check-forbidden.sh` -- expected: exit 0

## Implementation Notes

- `ApiResponse` gains `platformMessage` (the upstream body's own non-empty `message`, never a fallback or BFF copy) and `source: "proxy"` (set for any BFF envelope, including an unknown code, which `parseErrorBody` now reports as `fromProxy: true`). `mapApiError` needs both to tell "platform said X" from a fallback and to keep any proxy 403 out of `forbidden`.
- `lib/api/session.ts` no longer reads `errorCode`: a launch network failure is "no `statusCode`" (same behaviour; `BAD_PATH` cannot occur for the constant `/api/token` path).
- `mapFetchError(error)` maps an SWR error (`ApiResponseError` → its response, anything else → generic) for `ReadStateFor({ error, onRetry })`, which takes a `MappedError`.
- `ConfirmDialog` takes an optional `cancelLabel` (default "Cancel") so the leave guard can label it "Keep editing" (DESIGN.md Leave guard). Built on `@radix-ui/react-dialog` (no AlertDialog dependency); Cancel/extra/confirm use `aria-disabled` while busy so focus is never dropped.
- `Button` gains a `touch` size (44 px) and its `link` variant reads `text-link-text`; `destructive` and the destructive Badge/Toast use `destructive-fill`; `Input` uses `border-control-border`.
- Token check: `scripts/check-tokens.sh [root]`, called from `check-forbidden.sh`; fixture test `scripts/check-tokens.test.ts`. Token values are asserted in `app/globals.test.ts`. Test files are excluded from the check.
- Axe: `axe-core@4.14.0` pinned as a dev dependency (already in the lockfile transitively). Component axe runs in jsdom in light and dark (`.dark` on `<html>`) with `color-contrast` disabled, since jsdom has no stylesheet; contrast rests on the DESIGN.md token values asserted in `app/globals.test.ts`. A browser axe pass over a fixture page is left for the 7.0b-2 shell.

## Spec Change Log

## Review Triage Log

Review pass 1 (2026-10-14; Blind Hunter, Edge Case Hunter, Verification Gap).

| # | Finding | Verdict | Route |
|---|---|---|---|
| 1 | callApi `source:"proxy"` untested; unknown-code proxy 403 could map to forbidden | medium | patch (client test) |
| 2 | Unknown-code proxy body drops `message`/`retryable` | medium | patch |
| 3 | 5xx platform text passed to users | medium | patch (4xx only) |
| 4 | Ownership guard misses `platformMessage`/`source` and top-level lib, .js files | low | patch |
| 5 | ConfirmDialog busy not visible/announced | medium | patch |
| 6 | ConfirmDialog focus return to removed trigger | low | patch (`isConnected`) |
| 7 | Description `<p>` with block body | low | patch (`asChild` div) |
| 8 | Dialog overlay ignores reduced motion | low | patch |
| 9 | LoadError polite live region with button; NoAccess silent | low | patch |
| 10 | Destructive toast hover no-op, ring offset mismatch | low | patch |
| 11 | Button `touch` size radius, destructive dark ring | low | patch |
| 12 | `{Section}`/`{section}` placeholder casing | low | patch |
| 13 | messages test bare ENOENT on moved EXPERIENCE.md | low | patch |
| 14 | Upstream report test misses `tooltip` | low | patch |
| 15 | Dark `primary-text`/`link-text` rebrand drift | low | patch (comment) |
| 16 | Token check: missing dirs, masked grep errors, hex in comments | low | patch |
| 17 | No `check:tokens` script | low | patch |
| 18 | ProfilePlaceholder bypasses ReadStateFor | low | defer (replaced in 7.0b-2) |
| 19 | check-forbidden → check-tokens wiring untested | low | defer |
| 20 | Multi-line link / rgb()/hsl() / text-primary-as-text not gated | low | defer |
| 21 | Outline button and invalid Input boundaries below D13 contrast | low | defer |
| 22 | session.ts detects network inline (BAD_PATH impossible on a constant path) | false | reject |
| 23 | Raw 401 / 429 unhandled in mapApiError | low | reject (callApi turns 401 into refresh; no 429 source) |
| 24 | mapApiError on a success response | low | reject (caller contract) |
| 25 | SWR error without status maps to network | low | reject (only an unknown-key programming error) |

