---
title: 'Story 1.8 (part B): Profile page shell — app bar, tabs and Section navigation'
type: 'feature'
created: '2026-10-13'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '5981db77a98aeaf12b7994386e7db448adc9d438'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/docs/DESIGN-SYSTEM.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `app/page.tsx` is still a centred placeholder. There is no app bar, no Contacts / Insurance / Medical tabs, and no Section navigation, so no later story has a place to put its Section.

**Approach:** Build the page shell from DESIGN.md / EXPERIENCE.md and the Story 1.8 ACs (epics.md lines 832-914, minus the token ACs done in part A). From top to bottom:
- an app bar;
- a header slot;
- an ARIA tab strip with a `?tab=` URL;
- on Contacts, a numbered Section menu (≥ 768 px) or "Jump to" select (< 768 px) with scroll-spy and deep links;
- `SectionFrame` placeholders in their loading state;
- the Insurance placeholder and the Medical panel.

All of it must work at 360 px, by keyboard, and pass axe in both themes.

## Boundaries & Constraints

**Always:**
- **Structure (`app/page.tsx`):** `ClientConfig` children are, in order, `SessionDialogs` (still first), `AppBar`, `<main>` with the header slot and the tabbed shell, then `IdleWarning`. The server reads `searchParams.tab`, and an unknown or missing value renders Contacts. Inside `<main>`:
  - **Header slot:** a placeholder for Story 1.9 (`<section aria-label="Profile">`, `background` + bottom `border`, 16 × 24 px padding, 12 × 16 below 768 px). It holds the page's single `<h1>`, "Personal Profile", plus `<MyselfName />`.
- **App bar (`features/shell/app-bar.tsx`, `<header>`):**
  - 52 px, `bg-card`, bottom `border`, side padding 24 px (16 px below 768 px).
  - Left: "1health" wordmark (`text-primary font-bold`), a 1 × 18 px vertical rule, and "Personal Profile" in section-title type (text-body 600). The title is not a heading.
  - Right: "Return to 1health", an `<a href={portalUrl}>` in `text-link-text` with a lucide `ExternalLink` icon, a 44 px target and underline on hover. A click calls `preventDefault()`, then `returnToPortal()`, which already runs `requestLeave()`.
  - When `useIsFramed()` is true, the link is not rendered at all.
- **Tabs (`features/shell/profile-tabs.tsx` on `components/ui/tabs.tsx`):**
  - shadcn/Radix Tabs, `activationMode="manual"`. Three tabs: Contacts, Insurance, Medical. Each is 44 px tall with 12 px side padding.
  - Inactive tabs: `muted-foreground`. Active tab: `foreground` 600 with a 2 px `primary` underline overlapping the strip's bottom border.
  - Medical carries a `tag-coming-soon` chip (`bg-muted text-muted-foreground rounded-sm text-caption`, 0 × 6 px). It reads "Coming soon" at ≥ 768 px and "Soon" below.
  - Radix provides the roles and `aria-controls` / `aria-labelledby`, plus wrapping arrow keys, Home/End and Enter/Space. Tests must prove these.
  - **Activation:** `await requestLeave()`. If it resolves `false`, nothing changes. Otherwise switch the panel and call `history.replaceState(null, "", "?tab=<id>")`, which drops the hash, adds no history entry and doesn't scroll.
  - **On mount:** if the URL's tab isn't `contacts|insurance|medical`, replace it with `?tab=contacts` and keep any hash.
- **Contacts body:**
  - **≥ 768 px:** a two-column grid.
    - Left: `<nav aria-label="Sections">`, 200 px wide, sticky `top-0`, right hairline. It holds five links `href="#<id>"`, each a 44 px grid row (`24px 1fr auto`): mono number (`font-mono text-caption`), label, and a mono count slot (blank).
    - Main column: 24 px padding, 32 px between Sections, fluid.
  - **< 768 px:** the nav is hidden, and a full-width "Jump to" select (`components/ui/select.tsx`, shadcn/Radix) sits under the tabs. It is 44 px tall, `rounded-md`, `border-control-border`, with a visible muted "Jump to" label linked to the trigger. Its five options show the mono number and the name. Page gutters are 16 px.
  - **Sections** (one shared definition, `features/shell/sections.ts`, in this order):

    | Number | Label | id |
    | --- | --- | --- |
    | 01 | Personal information | `personal` |
    | 02 | Phone | `phone` |
    | 03 | Email | `email` |
    | 04 | Social media | `social` |
    | 05 | Addresses | `addresses` |

    Each is a `<section id aria-labelledby>` with a 44 px header row and an `h2` (`tabIndex={-1}`, text-body 600). Personal information contains a placeholder row `id="signature"`, labelled "Signature".
  - **Activation** (menu click, Enter or Space; or a Jump to choice): `scrollIntoView` with `behavior` `"smooth"`, or `"auto"` under `prefers-reduced-motion: reduce`. Then `h2.focus({ preventScroll: true })` and `history.replaceState` to `?tab=contacts#<id>`, with no history entry.
  - **Scroll-spy:** an `IntersectionObserver` over the five Sections sets `aria-current="location"` on exactly one menu item: the top-most Section in view, defaulting to the first. That item gets `bg-accent`, `text-primary` 600, a 3 px inset left `primary` bar, and a primary number and count.
  - **Deep links:** on mount and on `hashchange`, only on Contacts: `#personal|phone|email|social|addresses` scrolls to that Section, and `#signature` scrolls to the Signature row. Any other hash, or any hash on Insurance or Medical, leaves the page at the top of the tab without error.
- **`features/shell/section-frame.tsx`:** `SectionFrame({ id, title, columns, state: "loading" | "error" | "ready", onRetry, children })`.
  - **Container:** `bg-card`, 1 px `border`, `rounded-md`. When `columns` is non-empty, a header row (36 px, `bg-muted text-muted-foreground`, uppercase caption 600, `tracking-[0.06em]`).
  - **Loading:** three 44 px skeleton rows (`bg-muted`, shimmer, static under reduced motion), with the container marked `aria-busy="true"`.
  - **Error:** replaces the rows with an inline banner: lucide `AlertCircle` plus `text-error-strong` "Couldn't load {title lower-cased} · " and a "Retry" button (`text-link-text`, ≥ 44 × 44 hit area) that calls only that Section's `onRetry`.
  - **Ready:** renders `children`.
  - **Columns per Section:**

    | Section | Columns |
    | --- | --- |
    | Phone | Number · Label · Type · Status · Notifications |
    | Email | Email address · Label · Status · Notifications |
    | Social media | Link |
    | Addresses | Address · Label · Type · Status |
    | Personal information | none (key/value table) |
    | Insurance | none (cards) |

  - The shell renders every Section, and the Insurance one, in its loading state. The app bar, header slot, tabs and menu render at once.
- **Insurance tab:** one `SectionFrame` `id="insurance"` (title "Insurance") in loading state, at full main-column width, with no menu or Jump to.
- **Medical tab:** a quiet centred `text-muted-foreground` panel with exactly "Coming soon: your medical information will appear here." (RC9), no action and no network request.
- **Focus ring:** a `focus-ring` utility in `globals.css` (`@utility`): on `:focus-visible`, a 2 px `--ring` outline, 2 px offset and `box-shadow: var(--glow)`. Apply it to the Return link, tabs, menu items, the Jump to trigger and the Retry button. Also apply it to `components/ui/button.tsx`'s base, replacing its `focus-visible:ring-*` classes, including the destructive variant's `ring-destructive/20` (deferred from part A). Focus is never removed or trapped.
- **Tab order:** app bar → header slot → active tab → menu items (or Jump to) → Sections.
- **Copy:** add `SHELL_COPY` to `lib/shared/messages.ts`: app title, Return link, tab names, "Coming soon", "Soon", "Jump to", "Sections", the five Section labels, "Signature", "Insurance", the Medical text, `loadError(section)` and "Retry". "Return to 1health", the tab names, Section labels, "Jump to", the Medical text (RC9) and the load-error template are locked. Mark the rest `// DRAFT COPY`.
- **Dependencies:** exact pins: `@radix-ui/react-tabs@1.1.21`, `@radix-ui/react-select@2.3.7` and the dev dependency `@axe-core/playwright@4.13.0`. Each was published at least two weeks ago, and the axe one matches `axe-core`. Respect `pnpm-workspace.yaml`. If release-age blocks a transitive dependency, pick an older top-level version; don't add an exclude.

**Never:**
- No Section content, data fetching, registry or edit model (Stories 1.9 and 1.11). No new proxy allowlist entry and no `callApi` call from the shell.
- No `useRouter`/`router.replace` for tab or hash changes: they would re-render the server page. No hash on a tab switch.
- No hex or palette classes (the part A gate). No new tokens except the `focus-ring` utility.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Default | `/?tab=contacts` | Contacts panel; menu (≥ 768) or Jump to (< 768); five loading Sections | N/A |
| Bad tab | `/?tab=foo` or `/` | Contacts; URL replaced to `?tab=contacts` (hash kept) | N/A |
| Refresh | `/?tab=insurance` or `/?tab=medical` | that tab reopens | N/A |
| Switch tab | click Medical | `?tab=medical`, hash dropped, history length unchanged, no request | N/A |
| Guarded switch | `requestLeave` resolves `false` | tab and URL unchanged | N/A |
| Keys | Right on Medical; Left on Contacts; Home; End; Enter/Space | focus wraps to Contacts / Medical; first / last; activates focused tab only | N/A |
| Menu activation | click / Enter / Space on "03 Email" | scroll (smooth; instant under reduced motion), focus on Email `h2`, `#email` replaced, no history entry | N/A |
| Jump to | choose "05 Addresses" < 768 px | same as menu activation | N/A |
| Scroll-spy | Phone Section in view | only "02 Phone" has `aria-current="location"` | N/A |
| Deep link | `?tab=contacts#signature`, load or refresh | Signature row scrolled into view | N/A |
| Bad hash | `#nope` on Contacts, or `#phone` on Insurance | page at top, no error | N/A |
| Framed | `useIsFramed()` true | no "Return to 1health" element | N/A |
| Return | click "Return to 1health" | `returnToPortal()` called once; default navigation prevented | N/A |
| Frame error | one `SectionFrame` in error, Retry clicked | only that frame's `onRetry` runs; other frames' state unchanged | N/A |
| Medical | open Medical | exact RC9 text, no action, zero network requests (MSW) | N/A |
| 360 px | each tab at 360 × 740 | `scrollWidth <= clientWidth`; 16 px gutters; tabs, Jump to, Return ≥ 44 × 44 | N/A |
| axe | each tab, light + dark, desktop + 360 | zero WCAG 2.1 AA violations | N/A |

</frozen-after-approval>

## Code Map

- `app/page.tsx` -- **edit**: async `searchParams` (Next 16 Promise), and the new structure. Keep the guard order (kill switch → key → `requireSession`), `SessionDialogs` first and the `IdleWarning` props. `app/page.test.tsx` asserts the `ClientConfig` children order. Update it to `SessionDialogs`, `AppBar`, `main`, `IdleWarning`, and assert the initial tab from `searchParams`.
- `features/shell/leave.ts` (`requestLeave`, `returnToPortal`), `features/shell/use-is-framed.ts`, `features/shell/myself-name.tsx` -- **reuse** as they are.
- `components/ui/button.tsx` -- base and destructive focus classes → `focus-ring`. `features/shell/idle-warning.tsx` and `session-dialogs.tsx` add their own `focus:ring-*` classes; leave them.
- `components/ui/skeleton.tsx` (`bg-accent animate-pulse`) -- the skeleton rows use `bg-muted` instead. The `@layer base` reduced-motion rule in `app/globals.css` already stops animations.
- `app/globals.css` -- add the `focus-ring` `@utility`. The tokens `--ring`, `--glow`, `link-text`, `control-border`, `accent`, `primary` and `muted` exist (part A).
- New `components/ui/tabs.tsx` and `components/ui/select.tsx`: shadcn new-york sources for the pinned Radix versions. Use token classes only, and `border-control-border` on the Select trigger, so the color gate stays clean. `components/ui` imports nothing app-specific.
- UX sources:
  - DESIGN.md (`_bmad-output/planning-artifacts/ux-designs/ux-personal-profile-2026-10-13/DESIGN.md`):
    - components: app-bar 213-218, header 219-224, tabs 250-263, index 264-273, jump-to 274-277, table 278-290, error banner 427-431, skeleton 436-439;
    - layout: 587-591;
    - focus: 518-521 and 647;
    - shell table: 615-634.
  - EXPERIENCE.md: lines 36-51, 116-117, 130-131, 151-156, 186, 197-211.
  - Mock: `mockups/direction-c-ledger.html` lines 60-90 and 169-174.
- Tests (jsdom + Testing Library; stub `IntersectionObserver`, `scrollIntoView` and `matchMedia` in the test files):
  - `features/shell/app-bar.test.tsx`: framed → no link; a click calls `returnToPortal` and prevents default.
  - `features/shell/profile-tabs.test.tsx`: roles and ARIA wiring, every key row, guarded switch, `replaceState` URL and hash drop, bad-tab normalisation, and a Medical switch with zero MSW requests.
  - `features/shell/section-nav.test.tsx`: menu activation (smooth vs reduced motion, `h2` focus, hash), Jump to, scroll-spy exactly-one, deep links and bad hash.
  - `features/shell/section-frame.test.tsx`: loading rows and headers, the error banner copy, Retry isolation across two frames, and the Retry hit-area classes.
  - axe-core checks on the shell in jsdom.
- E2E:
  - `e2e/shell.spec.ts`:
    - `?tab=contacts#signature` survives a refresh, with the Signature row in view;
    - tab URL replace and refresh;
    - the Tab-key order;
    - 360 px no horizontal scroll, with tabs, Jump to and Return ≥ 44 × 44;
    - `@axe-core/playwright` per tab × light/dark (`document.documentElement.classList.add("dark")`) × both projects.
  - Existing specs depend on `heading /personal profile/`, `main h1` and "Test User"; keep them passing.

## Tasks & Acceptance

**Execution:**
- [x] `package.json`, `pnpm-lock.yaml` -- add the three pinned dependencies.
- [x] `components/ui/tabs.tsx`, `components/ui/select.tsx`, `components/ui/button.tsx`, `app/globals.css` -- the primitives and `focus-ring`.
- [x] `lib/shared/messages.ts`, `features/shell/sections.ts` -- copy and the Section definitions.
- [x] `features/shell/app-bar.tsx`, `profile-tabs.tsx`, `section-nav.tsx` (menu, Jump to, scroll-spy, deep links), `section-frame.tsx`, `contacts-panel.tsx`, `insurance-panel.tsx`, `medical-panel.tsx` -- the shell.
- [x] `app/page.tsx`, `app/page.test.tsx` -- wire the shell.
- [x] The unit and e2e tests in the Code Map, covering every matrix row; update `CLAUDE.md` (shell structure, `focus-ring`).

**Acceptance Criteria:**
- Given keyboard-only use, when tabbing through any tab, then every interactive element shows the `focus-ring` on `:focus-visible` and focus is never trapped.
- Given the story is done, when CI runs, then `pnpm lint` (including the color gate), `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` and `pnpm build` pass.

## Implementation Notes

- **`cn()` knows the type scale:** `lib/utils.ts` uses `extendTailwindMerge` with the `--text-*` sizes (`TYPE_SCALE`). Without it, `cn("text-body", "text-muted-foreground")` silently dropped the font size. `lib/utils.test.ts` keeps the list in step with `globals.css`.
- **Dark primary text:** the wordmark and the current menu item's text, number and count add `dark:text-info-strong`. Plain `text-primary` (#246b8f) is about 2.2:1 on the dark surfaces, and axe fails the dark scans without it. This is a DESIGN.md delta for PM/design review.
- **App bar below 768 px:** the wordmark and rule are hidden, as in the mobile mock. At 360 px the full left side plus "Return to 1health" would overflow.
- **`SectionFrame` has an extra `anchors` prop:** it keeps `#signature` present while Personal information is loading.
- **Section menu:**
  - Deep links scroll instantly on load and use the motion-aware behaviour on `hashchange`.
  - The Contacts `TabsContent` is `tabIndex={-1}`, so Tab goes from the active tab straight to the menu.
  - Insurance and Medical keep Radix's focusable panel, now with `focus-ring`.
- **Pin rule:** an activated or deep-linked Section stays current until it first enters view, then while it stays in view. Wheel, touch and keyboard scrolling outside the menu end the pin.
- **Small additions:** the scroll-spy uses `rootMargin: "0px 0px -60% 0px"`; the error banner has `role="alert"`; modified and non-primary clicks on Return and the menu links fall through to the browser.
- **e2e:** the dark-theme axe scans wait for CSS transitions to finish, because mid-transition colours failed intermittently.
- **Copy:** `SHELL_COPY.profileRegion` ("Profile") and `SHELL_COPY.columns` are `// DRAFT COPY`.

## Spec Change Log

## Review Triage Log

### Iteration 1 — three layers (blind-hunter, edge-case, verification-gap)

**PATCH:**
- **Insurance and Medical `TabsContent` are Tab stops with no ring** (all three layers) — `medium`. Radix gives the panel `tabIndex=0`, and `components/ui/tabs.tsx` has `outline-none`, against WCAG 2.4.7. Fix: add `focus-ring`.
- **`focus-ring`'s `box-shadow` replaces the current menu item's inset bar while it is focused** (blind-hunter) — `low`. Fix: draw the bar with a pseudo-element.
- **Menu and Jump to names read "01Personal information"** (blind-hunter) — `low`, a11y. Fix: `aria-hidden` on the number spans.
- **A repeated `?tab=` makes server and client disagree** (all three layers) — `low`. The server renders Contacts, but `get("tab")` keeps the URL. Fix: `getAll`.
- **Modified or non-primary clicks are hijacked** (blind-hunter + edge-case) — `medium` for Return: a Cmd-click logs out the current tab instead of opening a new one. Fix: an early return for modifiers and non-primary buttons.
- **The error banner isn't announced** (blind-hunter) — `low`. Fix: `role="alert"`.
- **Column headers bypass `SHELL_COPY`** (blind-hunter) — `medium` for developers: it breaks the single copy owner (AD-11). Fix: move them to `messages.ts`.
- **The `cn()` type-scale extension is untested** (blind-hunter) — `low`, gap.
- **The scroll-spy uses default `IntersectionObserver` options** (blind-hunter) — `low`. A Section with one pixel still showing stays current. Fix: a top-weighted `rootMargin`.
- **`aria-current` flickers through intermediate Sections during a smooth activation scroll** (edge-case) — `low`. Fix: hold the pin until it is first reached.
- **Keyboard and touch unpin paths are untested; the Space test never checks `aria-current`** (verification-gap) — `medium`, gap.

**DEFER (`deferred-work.md`):**
- **`SectionFrame` loading has no screen-reader announcement** (blind-hunter) — `medium`. `aria-busy` is poorly supported, but five simultaneous "Loading…" announcements would be noisy. Story 1.11 designs the Section framework.
- **`Input`, `Badge` and the session-dialog/idle-warning buttons still add `ring-*` focus styles**, so CLAUDE.md and DESIGN-SYSTEM.md say more than is true (blind-hunter + edge-case claim) — `low`. Migrate and align the docs; it touches an agent-context file.
- **Deep links run once at mount, and the observer sees only the Sections present at start** (blind-hunter + edge-case) — `medium` once content loads. `MyselfName` appearing, or real Section content (1.9/1.11), shifts the layout after the scroll. Re-follow the hash when Sections become ready.
- **The load-error template lower-cases the Section label ("Couldn't load phone")**, but the EXPERIENCE example reads "Couldn't load phones" (implementer note) — `low`, PM copy. Story 1.12 owns the message catalog.

**REJECTED:**
- **Rapid tab clicks or repeated Return clicks call the guard twice; a guard that rejects gives an unhandled rejection** — `low`: there is no guard until Story 1.13, which owns re-entrancy, and the 1.7 contract says the guard resolves rather than throws. The Return re-entrancy is carried from Story 1.7 (rejected).
- **`onRetry` is optional in the error state** — `low`: no error caller exists; Story 1.11 defines the contract.
- **Scrollbar drag or find-in-page doesn't unpin** — `low`: the pin only holds while its Section is in view, then falls back.
- **Picking the already-current Jump to option does nothing; typeahead on the closed trigger leaves a stale pending jump** — `low`: Jump to shows only below 768 px, where a hardware keyboard is rare. The fix needs extra Select state.
- **Other query parameters are dropped on a tab switch** — `false` as a defect: the frozen behaviour is `?tab=<id>`, and no other parameter exists.
- **Before hydration, the framed app bar briefly renders the Return link** — `low`: the server can't know about framing, the link is removed at hydration, and hiding it until mount would delay it for every top-level user.
- **`SelectItem` has no `focus-ring`** — `false`: listbox options show the active option with the `bg-accent` highlight, the standard listbox pattern.
- **The e2e "stays at top" check is weak; the 52 px height is duplicated** — `low`: cosmetic, or a test-strength nit.

## Design Notes

- **`history.replaceState`, not the router:** a router navigation re-renders the server page. That could re-run `requireSession` and churn the RSC tree for a purely client-side change. Next 16 keeps `useSearchParams` in sync with `replaceState`.
- **`returnToPortal()` alone:** it already awaits `requestLeave()`. Calling `requestLeave()` first as well would ask the Story 1.13 guard twice.
- **Medical copy:** RC9 ("…your medical information will appear here.") supersedes EXPERIENCE.md line 76; the epic AC requires it exactly.
- **Retry hit area in unit tests:** an error frame never appears in the shell, so Playwright can't measure it. The component test pins its `min-h-11 min-w-11` classes instead.
- **Personal information has no column headers:** DESIGN.md defines it as a key/value table with no header row, so its skeleton has none.

## Verification

**Commands:**
- `pnpm lint` -- expected: passes; `check-forbidden: clean.`
- `pnpm typecheck` -- expected: zero errors.
- `pnpm test` -- expected: all pass.
- `CI=1 pnpm test:e2e` -- expected: all pass on both projects, including the shell and axe specs.
- `APP_ENV=dev APP_ORIGIN=https://localhost:3100 APP_ID=dummy-app-id ONEHEALTH_SECRET_KEY=dummy-onehealth-secret SESSION_SECRET=dummy-session-secret-0123456789abcdef pnpm build` -- expected: succeeds.
