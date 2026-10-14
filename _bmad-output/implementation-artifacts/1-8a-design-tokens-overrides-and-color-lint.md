---
title: 'Story 1.8 (part A): Design tokens, DESIGN.md overrides and color lint gate'
type: 'feature'
created: '2026-10-13'
status: 'done'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: 'a1be7bdfe0b65107f58d8ae544c28ba4aa87c0d8'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/docs/DESIGN-SYSTEM.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `app/globals.css` carries the 1health tokens but not the three DESIGN.md contrast overrides (link text, destructive fill, control border) or the tooltip tokens. Nothing stops components from using hex values or Tailwind palette classes, and a few shadcn primitives already do (`bg-black/50`, `text-white`, `text-red-*`).

**Approach:** Add the override and tooltip tokens (light and dark) in Tier 3, point the affected primitives at them, document the three deviations in `globals.css`, and add a CI gate in `scripts/check-forbidden.sh` that fails on hex colors or palette classes in `app/`, `components/` and `features/` outside `globals.css`. This is part A of Story 1.8. Part B, the page shell, is deferred in `deferred-work.md`.

## Boundaries & Constraints

**Always:**
- **New Tier 3 tokens** (`:root` / `.dark`), each mapped in `@theme inline` as `--color-<name>`:
  - `--link-text`: light `var(--info-strong)` (#256a8c), dark `var(--signal-aqua)` (#8fd8e6).
  - `--destructive-fill`: `#b23a31` in both themes. Dark must not inherit `--error-strong`, which is #f08a80 there.
  - `--control-border`: light `var(--status-neutral)` (#7a8696), dark `var(--mist)` (#aeb8c4).
  - `--tooltip` / `--tooltip-foreground`: light `var(--graphite)` / #ffffff, dark `var(--cloud)` / `var(--graphite)`.
  - `--scrim`: light graphite at 45 % (DESIGN `drawer-scrim`); dark black at 60 %. **Decision (2026-10-13, review loop 1):** graphite over the graphite dark background gives almost no dimming (about 1.07:1 over a card), so dark uses black at 60 %. This is a fourth DESIGN.md delta, flagged for PM/design review.
- **Dark theme:** with `class="dark"` on `<html>`, every Tier 3 token resolves to its DESIGN.md `-dark` value (e.g. background #202833, card #29333f, ring #8fd8e6). Light stays the default. Existing values that already match are left alone.
- **Deviation comment:** a comment block above the Tier 3 light tokens lists the three deviations (link text, destructive fill, control border), each with its value, the token it replaces and its contrast ratio from DESIGN.md. It says they are to be reported upstream and kept until `globals.css` changes. A separate line notes the dark scrim (black at 60 %, not graphite) as a delta for PM/design review.
- **Primitives:**
  - `components/ui/button.tsx`: `destructive` uses `bg-destructive-fill text-destructive-foreground` with a hover on the same token. Drop `dark:bg-destructive/60`. `link` uses `text-link-text`.
  - `components/ui/input.tsx`: `border-input` → `border-control-border`. Keep the `dark:bg-input/30` fill.
  - `components/ui/dialog.tsx`: overlay `bg-black/50` → `bg-scrim`.
  - `components/ui/badge.tsx`: `text-white` → `text-destructive-foreground`.
  - `components/ui/toast.tsx`: the close button's `red-*` classes → `destructive-foreground` / `destructive` token equivalents.
  - Table rules and card hairlines keep `--border`.
- **Color gate (`scripts/check-forbidden.sh`, already run by `pnpm lint` and CI):** two new checks over `app/`, `components/` and `features/`, skipping `app/globals.css` and `*.test.*` files. Each failure prints file:line, like the existing checks.
  - **Hex:** `#[0-9a-fA-F]{3,8}\b`, in any file type.
  - **Palette:** a color-utility prefix (`bg`, `text`, `border` with an optional side, `ring`, `ring-offset`, `outline`, `fill`, `stroke`, `from`, `via`, `to`, `divide`, `placeholder`, `decoration`, `accent`, `caret`, `shadow`) followed by a Tailwind palette name (`black`, `white`, `slate` … `rose`), an optional `-<shade>` and an optional `/<opacity>`. Variant prefixes such as `dark:` and `hover:` must still match.
  - `transparent`, `current` and `inherit` are allowed. Section anchors such as `#personal` and `#addresses` must not match.

**Never:**
- No changes to the Tier 1 palette or the four `--brand-*` variables.
- No page shell work: no app bar, tabs, Section menu, Select, Tooltip component or `SectionFrame` (part B).
- No ESLint plugin for colors; the gate is the shell script.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Light tokens | `:root` | `link-text` #256a8c, `destructive-fill` #b23a31, `control-border` #7a8696, `tooltip` #202833 / #ffffff | N/A |
| Dark tokens | `.dark` | `link-text` #8fd8e6, `destructive-fill` #b23a31, `control-border` #aeb8c4, `tooltip` #e6ebf0 / #202833, `scrim` black at 60 % (light: graphite at 45 %); every other Tier 3 token at its DESIGN `-dark` value | N/A |
| Gate: hex | `bg-[#fff]` or `"#256a8c"` in `features/x.tsx` | script exits 1 and prints file:line | N/A |
| Gate: palette | `bg-red-500`, `dark:text-white`, `bg-black/50`, `border-t-slate-200/40` in `components/` | exits 1 | N/A |
| Gate: allowed | `bg-transparent`, `text-current`, `href="#personal"`, `#addresses`, a hex in `app/globals.css` or a `*.test.tsx` | exits 0 | N/A |
| Gate: repo | the current tree after this change | exits 0 | N/A |

</frozen-after-approval>

## Code Map

- `app/globals.css` -- **edit**. Tier 3 light tokens are at lines 61-111 (`:root`) and dark at lines 113-145 (`.dark`); the `@theme inline` color map starts at line 147. Dark already matches DESIGN.md for every existing token, so only the new tokens need dark values. Tier 1 holds `--graphite`, `--mist`, `--cloud`, `--signal-aqua` and `--status-neutral`.
- DESIGN.md source of truth for values and ratios: `_bmad-output/planning-artifacts/ux-designs/ux-personal-profile-2026-10-13/DESIGN.md` frontmatter lines 18-109, plus prose lines 544-556 ("Design-system deviations to report upstream").
- `components/ui/button.tsx:8-15` (variants), `components/ui/input.tsx:11`, `components/ui/dialog.tsx:46`, `components/ui/badge.tsx:20`, `components/ui/toast.tsx:67` -- the only current hex or palette hits in scope.
- `scripts/check-forbidden.sh` -- **edit**. Reuse the `run_grep` shape, but with its own directory scope and exclusions. The existing four checks keep their current scope.
  - The palette list is every palette in the installed Tailwind (`node_modules/tailwindcss/theme.css`). Tailwind 4.3.3 also ships `mauve`, `olive`, `mist` and `taupe`, which the first pass missed.
  - Bare `neutral` is allowed, because `--color-neutral` is a 1health token; `neutral-<shade>` fails.
- `docs/DESIGN-SYSTEM.md` -- **edit**: list the new tokens and the gate.
  - The `border / input` row says hairlines only, since fields now use `control-border`.
  - Don't describe `destructive` as a fill behind text.
  - The removal condition matches the CSS comment: keep the deltas until the upstream 1health tokens meet the same ratios.
- `CLAUDE.md` "Design system" -- one line saying the gate enforces the no-hex / no-palette rule.
- Tests:
  - `app/globals.test.ts` (node env): read `globals.css`, resolve `var()` chains within the light and dark blocks, and assert the light and dark hex of every Tier 3 token against an explicit DESIGN.md map in the test. Include the scrim's light and dark values.
  - `scripts/check-forbidden.test.ts`: copy the script into a temp dir with fixture `app/`, `components/` and `features/` files, run it with `bash`, and assert the exit code and output for every gate row. Cover every color-utility prefix in the list, the `placeholder:` variant and one class per added palette (`mauve`, `olive`, `mist`, `taupe`).
  - `components/ui/primitives.test.tsx` (jsdom): render `Button` (`destructive`, `link`), `Input` and an open `Dialog`, and assert the token classes with `toHaveClass` / `not.toHaveClass`:
    - destructive has `bg-destructive-fill` and `text-destructive-foreground`, and not `bg-destructive` or `dark:bg-destructive/60`;
    - link has `text-link-text`;
    - Input has `border-control-border`;
    - the overlay `[data-slot="dialog-overlay"]` has `bg-scrim`.

    The color gate can't catch a fallback to another valid token, so this test does.

## Tasks & Acceptance

**Execution:**
- [x] `app/globals.css` -- new tokens (light and dark), `@theme inline` mappings, deviation comment.
- [x] `components/ui/{button,input,dialog,badge,toast}.tsx` -- move to the token classes.
- [x] `scripts/check-forbidden.sh` -- hex and palette checks.
- [x] `docs/DESIGN-SYSTEM.md`, `CLAUDE.md` -- document the tokens and the gate.
- [x] `app/globals.test.ts`, `scripts/check-forbidden.test.ts`, `components/ui/primitives.test.tsx` -- cover every matrix row and the primitive token classes.

**Acceptance Criteria:**
- Given the destructive Button in dark mode, when it renders, then its fill is #b23a31 with white text, not #f08a80 and not 60 % opacity.
- Given the story is done, when CI runs, then `pnpm lint` (including the new gate), `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` and `pnpm build` pass.

## Implementation Notes

- Palette gate: bare `neutral` (no shade) is allowed, because `--color-neutral` is an existing 1health token (`text-neutral`); `neutral-<shade>` still fails. Every other palette name fails with or without a shade.
- Palette gate: the prefix may follow `-` as well as a variant `:`, so `drop-shadow-red-500` / `inset-ring-black` are caught via `shadow-` / `ring-`.
- `--scrim` is `color-mix(in srgb, var(--graphite) 45%, transparent)`. Lightning CSS emits an opaque `var(--graphite)` fallback under `@supports not color-mix`; every browser Tailwind v4 supports has `color-mix`, so the fallback is dead in practice.
- The colour greps send stderr to /dev/null like the existing checks; a pattern GNU grep rejected would pass silently, so `scripts/check-forbidden.test.ts` (run in CI on GNU grep) is the guard.
- (Loop 1) The notes above are from the first implementation, which was reverted for the dark-scrim intent gap. Keep the choices they record: bare `neutral` allowed, a prefix may follow `-` or a variant `:`, the scrim built with `color-mix`, and the CI test as the grep guard.

## Spec Change Log

## Review Triage Log

### Iteration 1 — three layers (blind-hunter, edge-case, verification-gap) → intent_gap loopback

**INTENT_GAP (code reverted, human decided):**
- **The dark scrim does nothing** (blind-hunter) — `medium`. Graphite at 45 % over the graphite dark background is about 1.07:1 over a card, where `bg-black/50` used to dim it clearly. The frozen value came from DESIGN.md, so the human decided: dark black at 60 %, recorded in the frozen block.

**PATCH (folded into the re-planned Code Map; re-check on the next pass):**
- **The gate misses Tailwind 4.3.3's `mauve`, `olive`, `mist` and `taupe` palettes** (blind-hunter + edge-case) — `medium`. Confirmed in `node_modules/tailwindcss/theme.css`: `bg-mist-500` passed.
- **No test pins the primitives' token classes** (verification-gap + blind-hunter) — `medium`, gap. Falling back to `bg-destructive`, `text-primary` or `border-input` passes every check, because those are valid token classes.
- **The gate test covers only some of the prefixes** (blind-hunter) — `low`, gap. It's a test-only addition.
- **Stale `docs/DESIGN-SYSTEM.md` rows** (blind-hunter) — `low`. The `border / input` row still says "field borders", the `destructive` row says "toasts", and the removal condition differs from the CSS comment. All direct corrections.

**DEFER (pre-existing; record on the next pass):**
- **The destructive Badge and Toast fill white text on `bg-destructive` #d84f45** (blind-hunter + edge-case + verification-gap) — `medium` when used. The text is 4.10:1, and the toast close icon at 70 % is about 2.75:1. This is not caused by this change: the old `text-red-300` was worse, and neither variant has an in-app caller yet.
- **The destructive Button's focus ring is `ring-destructive/20`**, below 3:1 (blind-hunter) — `medium`. It is pre-existing; Story 1.8 part B's focus-ring criterion covers every interactive element.

**REJECTED:**
- **The gate ignores `rgb()`/`hsl()`/named colors, inline styles and `bg-(--color-red-500)`** — `false` as a defect: the intent covers hex values and palette classes only, and CLAUDE.md says exactly that.
- **Hex false positives (`&#160;`, `// #1234`, `#cafe`) and no escape hatch** — `low`: the repo has none of these, an author can reword them, and the fix would change the frozen regex.
- **Grep exit 2 is swallowed** — `low`: the gate test runs in CI on GNU grep, and its exit-1 fixtures fail if grep can't run. It matches the existing checks.
- **Comments are in scope** — `false`: that is by design.
- **The outline Button keeps `border` / `dark:border-input`** — `false`: DESIGN.md's control-border delta lists inputs, selects, Jump to and the Signature pad, not buttons.
- **`lib/` isn't scanned** — `false`: the scope is the frozen `app/`, `components/` and `features/`.
- **The test's DESIGN map is hand-copied, a rebrand breaks the test, the `var()` parser is naive, the ratios are not computed, and `#b23a31` is repeated in `.dark`** — `low` or `false`: the explicit map is spec-mandated, and a rebrand changes DESIGN.md too. The parser handles the file as written.

### Iteration 2 — three layers (blind-hunter, edge-case, verification-gap; verification-gap found no gaps)

**PATCH:**
- **The `globals.test.ts` header says every value comes from DESIGN.md's `colors:` frontmatter, but the scrim's don't** (blind-hunter) — `low`. Direct correction: name `drawer-scrim` and the loop-1 decision as the scrim's sources.

**DEFER (`deferred-work.md`):**
- **DESIGN.md prose is stale against the app** (blind-hunter) — `low`. It still maps links to `text-info-strong` and the destructive button to `bg-error-strong`, and has no dark scrim. The fix edits a planning/UX document after PM review.
- **No owner or ticket for the upstream deviation report or the PM review of the dark scrim** (blind-hunter) — `medium` (process): otherwise both promises get lost.
- **The CLAUDE.md line names "DESIGN.md" without a path** (blind-hunter) — `low`. The fix edits an agent-context file.
- carried: **the destructive Badge and Toast fill white text on #d84f45** (edge-case, plus the DESIGN-SYSTEM.md "not a fill behind text" claim) — the docs state the intended rule, and the primitives are the deferred item.
- carried: **the destructive Button focus ring**.

**REJECTED:**
- carried: **hex false positives (`#1234`, `&#8212;`, `#face`)**; **`rgb()`/named colors/inline styles**; **`lib/`, `hooks/` and `contexts/` not scanned** (frozen scope); **naive `var()` and brace parsing in the test**.
- **Interpolated `bg-${c}-500` passes the gate** — `false`: Tailwind can't generate a class from an interpolated name, so no palette color can ship that way.
- **The `globals.css` exemption also covers the palette check (`@apply bg-red-500` would pass)** — `low`: the frozen scope exempts the file for both checks, and it is the reviewed token home.
- **Replaced tokens (`text-link`, `border-input`, `bg-destructive`) are still usable** — `low`: they stay valid for their non-text uses, and the primitives test pins the overridden ones.
- **Docs claim more enforcement than the gate gives** — `false`: CLAUDE.md and DESIGN-SYSTEM.md both scope it to hex and palette classes in the three directories.
- **The removal condition refers to its own file; dark ratios are not in the comment; `*.test.*` is broader than test files; the repo-tree test runs the whole script** — `low` or `false`: the "i.e." clause names the upstream trigger, `*.test.*` is the frozen exclusion, and the whole-script run is a deliberate smoke test.

## Design Notes

- **Why dedicated tokens, not `text-info-strong` / `bg-error-strong`:** the epic names those classes, but their dark values (#6fb6d8 and #f08a80) contradict DESIGN.md. Links must be signal-aqua in dark, and the destructive fill must stay #b23a31 because white on #f08a80 is 2.4:1. `link-text` and `destructive-fill` match DESIGN.md's own token names and keep both themes right.
- **Why a shell gate:** class names are built with `cn()`, template literals and variant maps, which an ESLint AST rule would miss. A grep over the source sees every string, and it already runs in `pnpm lint` and CI.

## Verification

**Commands:**
- `pnpm lint` -- expected: passes; `check-forbidden: clean.`
- `pnpm typecheck` -- expected: zero errors.
- `pnpm test` -- expected: all pass, including the token and gate tests.
- `CI=1 pnpm test:e2e` -- expected: all pass (no visual regressions in the session dialogs).
- `APP_ENV=dev APP_ORIGIN=https://localhost:3100 APP_ID=dummy-app-id ONEHEALTH_SECRET_KEY=dummy-onehealth-secret SESSION_SECRET=dummy-session-secret-0123456789abcdef pnpm build` -- expected: succeeds.
