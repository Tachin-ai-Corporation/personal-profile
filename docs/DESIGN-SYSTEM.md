# 1health Design System

How this app looks, feels, and stays consistent — and how to rebrand it for a
different customer without losing the 1health user experience.

> **Canonical spec (source of truth):**
> <https://tachin-website.web.app/public/1health_design_system.md>
>
> This document is the _implementation_ of that spec for this codebase. When the
> two disagree, the spec wins — update this doc and `app/globals.css` to match.
> See [Keeping in sync](#keeping-in-sync-with-the-spec).

---

## 1. Philosophy

1health is a **healthcare command center**: calm, trustworthy, clinically
precise, operationally reliable. Every design choice serves enterprise trust and
user efficiency over visual novelty.

- The brand is always written lowercase: **`1health`**.
- Composition budget — aim for roughly:
  - **70% neutral** structure (graphite / slate / cloud)
  - **20% healthcare accent** (trust blue / teal / mint)
  - **5% action** (buttons, key CTAs)
  - **5% status** (success / warning / error signals)
- If a screen feels colorful, it's wrong. Color earns its place by carrying
  meaning.

---

## 2. The big idea: same feel, different brand

Different apps (and different customers) may want to **brand differently** —
their own primary color, their own accents — while keeping the **same structure,
spacing, motion, and interaction feel**. The token system is built in three
tiers precisely so you can do that by editing one small block.

```
┌─ Tier 1 · Reference palette ────────────────────────────────┐
│  Raw 1health named colors: --trust-blue, --graphite, ...     │  rarely touched
└──────────────────────────────────────────────────────────────┘
              │  referenced by
┌─ Tier 2 · Brand layer ──────────────────────────────────────┐
│  --brand-primary / --brand-secondary / --brand-tertiary /    │  ◀── REBRAND HERE
│  --brand-highlight                                           │
└──────────────────────────────────────────────────────────────┘
              │  referenced by
┌─ Tier 3 · Semantic tokens ──────────────────────────────────┐
│  --background, --foreground, --primary, --ring, --muted, ... │  light + dark
│  (this is all the components ever read)                      │
└──────────────────────────────────────────────────────────────┘
              │  exposed to Tailwind via @theme inline
        bg-primary  text-muted-foreground  ring-ring  ...
```

**What changes per brand:** the four `--brand-*` hues.
**What stays fixed (the "feel"):** the neutral ramp, spacing grid, type scale,
radius scale, elevation, motion curves, and — importantly — the **functional
status colors** (success/warning/error carry meaning and must be consistent
across every 1health app).

All tokens live in [`app/globals.css`](../app/globals.css).

---

## 3. Rebranding — the 30-second version

Open [`app/globals.css`](../app/globals.css), find **`TIER 2 · Brand layer`**,
and repoint the four variables. Everything else follows.

```css
/* Example: rebrand to a violet-forward customer palette */
--brand-primary:   #6d5ae6; /* primary actions & identity   */
--brand-secondary: #4b39c4; /* secondary emphasis           */
--brand-tertiary:  #b7aef2; /* supporting accent            */
--brand-highlight: #c9c2f7; /* focus glow / highlight source */
```

That's it — buttons, links, focus rings, active-state badges, and chart series 1
all re-skin, while the layout, density, and motion stay identical.

### Going further (optional)

| You want to change… | Edit these tokens |
|---|---|
| Canvas / surface tone | `--background`, `--card`, `--muted` (light) and the same keys under `.dark` |
| Text ink | `--foreground`, `--muted-foreground` |
| The focus glow color | `--glow` (and `--brand-highlight`) |
| Corner roundness globally | `--radius-sm/md/lg/xl` in `@theme inline` |
| Status hues (rarely — they carry meaning) | `--status-success`, `--status-warning`, `--status-error`, … |

> **Do not** hardcode hex values or Tailwind palette classes (`bg-blue-600`,
> `text-green-500`) in components. Always go through a token so a rebrand stays a
> one-file change. Legacy `slate-*` / `green-*` classes have been removed from
> this template for exactly this reason.
>
> This is enforced: `scripts/check-forbidden.sh` (run by `pnpm lint` and CI)
> fails on any hex color or palette class (`bg-red-500`, `dark:text-white`,
> `bg-black/50`, ...) in `app/`, `components/` and `features/`, skipping
> `app/globals.css` and `*.test.*` files. `transparent`, `current`, `inherit`
> and the bare 1health `neutral` token are allowed.

### Per-customer theming at runtime (pattern)

The 1health platform exposes each tenant's brand colors (`tenant.primaryColor`,
`tenant.secondaryColor` — see the Settings page). To honor them dynamically,
set the brand tokens as inline CSS variables on a wrapper once the session
loads:

```tsx
<div
  style={{
    "--brand-primary": tenant.primaryColor ?? undefined,
    "--brand-secondary": tenant.secondaryColor ?? undefined,
  } as React.CSSProperties}
>
  {children}
</div>
```

Because Tier 3 reads Tier 2 through `var()`, the whole subtree re-skins with no
component changes. (Validate contrast when you do this — see
[Accessibility](#10-accessibility).)

---

## 4. Color

### Reference palette (Tier 1)

**Cool neutrals — structure (~70%)**

| Token | Hex | Role |
|---|---|---|
| `--graphite` | `#202833` | Primary ink; dark-mode canvas |
| `--charcoal` | `#313b47` | Secondary surfaces |
| `--slate` | `#566373` | Muted text |
| `--mist` | `#aeb8c4` | Muted text on dark |
| `--cloud` | `#e6ebf0` | Light borders; dark-mode ink |

**Healthcare / platform accents (~20%)**

| Token | Hex | Role |
|---|---|---|
| `--trust-blue` | `#246b8f` | Default `--brand-primary` |
| `--network-teal` | `#1f9a9b` | Default `--brand-secondary` |
| `--care-mint` | `#5fc7b2` | Default `--brand-tertiary` |
| `--signal-aqua` | `#8fd8e6` | Default `--brand-highlight`; glow |
| `--clinical-ice` | `#e8f7fa` | Light accent / hover surface |

**Action / emphasis (~5%, sparingly — never decorative)**

| Token | Hex | | Token | Hex |
|---|---|---|---|---|
| `--pulse` | `#d84f45` | | `--amber` | `#d6a83a` |
| `--coral` | `#e8786f` | | `--glow-amber` | `#f5e6b8` |
| `--blush` | `#f2c8c3` | | | |

**Functional status (~5%, consistent across all apps)**

| Token | Hex | Meaning |
|---|---|---|
| `--status-success` | `#3baa78` | Success / healthy / active |
| `--status-info` | `#2f80a8` | Informational / links |
| `--status-warning` | `#d6a83a` | Caution / attention |
| `--status-error` | `#d84f45` | Error / expired / destructive |
| `--status-neutral` | `#7a8696` | Inactive / n-a |

### Semantic tokens (Tier 3) → Tailwind utilities

These are what you actually use in components. Each maps to a utility such as
`bg-card`, `text-foreground`, `border-border`, `ring-ring`.

| Utility base | Light | Dark | Use for |
|---|---|---|---|
| `background` | `#f4f7fa` | graphite | Page canvas |
| `foreground` | graphite | cloud | Body text |
| `card` / `popover` | `#ffffff` | `#29333f` | Raised surfaces |
| `primary` | brand-primary | brand-primary | Primary buttons, key CTAs |
| `secondary` | `#eaeff4` | charcoal | Secondary buttons |
| `muted` / `muted-foreground` | `#edf1f5` / slate | charcoal / mist | Info panels, meta text |
| `accent` / `accent-foreground` | clinical-ice / graphite | `#2a3c46` / clinical-ice | Hover surfaces |
| `border` / `input` | `#e1e8ef` | `#3a4552` | Hairlines only: table rules, card edges (`dark:bg-input/30` field fill). Field borders use `control-border` |
| `ring` | brand-primary | signal-aqua | Focus rings |
| `destructive` | error | error | Destructive accents: borders, rings, invalid states. Not a fill behind text; use `destructive-fill` |
| `link` | info | signal-aqua | Upstream link color. Text links use `link-text` |
| `link-text` | info-strong `#256a8c` | signal-aqua | Text links (`text-link-text`, Button `link`) |
| `destructive-fill` | `#b23a31` | `#b23a31` | Destructive button fill behind white text |
| `control-border` | status-neutral `#7a8696` | mist | Input / select / Jump to / Signature pad boundaries |
| `tooltip` / `tooltip-foreground` | graphite / `#ffffff` | cloud / graphite | Tooltip surface and text |
| `scrim` | graphite at 45 % | black at 60 % | Dialog / drawer overlay (`bg-scrim`) |

### Contrast overrides (DESIGN.md deltas)

Three tokens override 1health values for WCAG AA. They are to be reported
upstream to the design-system owners, and each is kept until the upstream
1health tokens meet the same ratios (the same rule is in the comment above the
Tier 3 light tokens in `app/globals.css`).

| Token | Replaces | Ratio (was → now) | Criterion |
|---|---|---|---|
| `link-text` `#256a8c` | `--link` `#2f80a8` | 4.40:1 → 5.97:1 on card | WCAG 1.4.3 text |
| `destructive-fill` `#b23a31` | `--destructive` `#d84f45` | white text 4.10:1 → 5.93:1 | WCAG 1.4.3 text |
| `control-border` `#7a8696` | `--input` `#e1e8ef` | 1.24:1 → 3.7:1 on card | WCAG 1.4.11 boundary |

**Primary-colored text.** `text-primary` (trust-blue `#246b8f`) is fine on the
light surfaces but fails AA on the dark ones (2.18:1 on the dark card). Text in
the primary hue therefore uses `text-primary-text`: the brand primary in light,
info-strong `#6fb6d8` in dark, which is `text-primary dark:text-info-strong` as
one token (the wordmark and the active Section menu item use it). Never put
bare `text-primary` on text. Links use `text-link-text`, and a primary *fill*
(`bg-primary` with `text-primary-foreground`) needs no override.

The destructive fill stays `#b23a31` in dark mode because white on the dark
`--error-strong` (`#f08a80`) is 2.4:1. The dark `scrim` (black at 60 %, not
graphite) is a fourth delta pending PM/design review: graphite over the graphite
dark canvas barely dims it.

### Status utilities

For status chips, banners, and inline signals. Each status has a **base hue**
(for fills / borders / icons) and a **`-strong`** variant (AA-readable text,
auto-adjusted for light vs dark):

```
bg-success   text-success-strong   border-success/25
bg-warning   text-warning-strong
bg-info      text-info-strong
bg-error     text-error-strong
```

The **soft chip** recipe (default for status): soft translucent background +
strong text.

```html
<span class="rounded-full bg-success/12 px-2.5 py-0.5 text-caption text-success-strong">
  Active
</span>
```

The `<Badge>` component already ships `success` / `warning` / `info` variants
that do this — prefer those.

### Charts

Use `chart-1 … chart-5` (trust-blue → teal → mint → amber → coral). This ordered
healthcare palette keeps dashboards on-brand and avoids the rainbow effect.

---

## 5. Typography

**Typeface:** Inter (loaded via `next/font/google` in
[`app/layout.tsx`](../app/layout.tsx), wired to `font-sans`). Weights: Regular
400 · Medium 500 · SemiBold 600 · Bold 700.

**Type scale** — use the named utilities; size, line-height, and weight come
baked in:

| Utility | Size | Line height | Weight | Use |
|---|---|---|---|---|
| `text-display` | 56px | 64px | 700 | Hero / marketing only |
| `text-h1` | 40px | 48px | 700 | Page title |
| `text-h2` | 32px | 40px | 600 | Section title |
| `text-h3` | 24px | 32px | 600 | Subsection |
| `text-h4` | 20px | 28px | 600 | Card / group heading |
| `text-body-lg` | 18px | 28px | 400 | Lead paragraph |
| `text-body` | 16px | 24px | 400 | Default body |
| `text-body-sm` | 14px | 20px | 400 | Secondary text |
| `text-caption` | 12px | 16px | 400 | Metadata, labels |

```html
<h1 class="text-h1">Patients</h1>
<p class="text-body text-muted-foreground">Body copy in slate.</p>
<span class="text-caption uppercase tracking-wide text-muted-foreground">Tenant ID</span>
```

**Rules**

- One `h1` (page title) per screen.
- **No all-caps except short metadata labels** (like the `Tenant ID` example
  above). Never all-caps a sentence or a button.
- Numeric IDs, tokens, and codes use `font-mono`.

---

## 6. Spacing

An **8px grid**. Tailwind's spacing scale (1 unit = 4px) maps directly onto the
spec's steps — use the standard `p-*` / `gap-*` / `m-*` utilities:

| Spec step | px | Tailwind | Typical use |
|---|---|---|---|
| space-1 | 4 | `1` | Icon ↔ label |
| space-2 | 8 | `2` | Tight stacks |
| space-3 | 12 | `3` | Chip / small padding |
| space-4 | 16 | `4` | Default gap, control padding |
| space-5 | 24 | `6` | Card padding, group gap |
| space-6 | 32 | `8` | Section spacing |
| space-7 | 48 | `12` | Large section breaks |
| space-8 | 64 | `16` | Page rhythm |
| space-9 | 96 | `24` | Hero whitespace |

Whitespace is intentional — prefer breathing room over density.

---

## 7. Radius

| Utility | Value | Applied to |
|---|---|---|
| `rounded-sm` | 6px | Small inline elements; **Ledger chips in table cells** (`<Chip>`) |
| `rounded-md` | 10px | **Buttons, inputs** |
| `rounded-lg` | 16px | **Cards, dialogs** |
| `rounded-xl` | 24px | Large feature panels |
| `rounded-full` | pill | **Status badges** (`<Badge>`) outside tables |
| icon mask | 22% | App icons (`--radius: 22%` in the spec) |

---

## 8. Elevation & shadow

Two families, both theme-aware:

| Utility | Value | Use |
|---|---|---|
| `shadow-sm` | subtle 1–3px | **Resting cards** ("subtle shadows") |
| `shadow-md` | `0 4px 16px /.18` (elevation 1) | Raised / hovered surfaces |
| `shadow-lg` | `0 8px 28px /.24` (elevation 2) | **Dialogs, popovers, toasts** |
| `shadow-xl` | `0 16px 48px /.32` (elevation 3) | Peak overlays |
| `shadow-glow` | aqua glow | Focus / active emphasis only |

The `md`/`lg`/`xl` values are the spec's canonical elevation shadows. Cards rest
at `shadow-sm` and lift on interaction; keep shadows quiet on light surfaces.

---

## 9. Motion

Premium, purposeful, never bouncy-for-fun.

| Token / utility | Curve | Use |
|---|---|---|
| `ease-premium` | `cubic-bezier(0.16, 1, 0.3, 1)` | Entrances (panels, modals, pop-in) — the 1health signature |
| `ease-standard` | `cubic-bezier(0.4, 0, 0.2, 1)` | Hovers, color/opacity transitions, presses |

**Duration guide (from the spec):**

| Interaction | Duration |
|---|---|
| Button press | 80–120ms |
| Hover response | 120–180ms |
| Tooltip / menu | 120–160ms |
| Panel / card entrance | 180–240ms |
| Modal entrance | 220–280ms |
| Page transition | 240–360ms |
| Loading shimmer | 900–1400ms loop |

```html
<div class="transition-transform duration-200 ease-premium">…</div>
```

- Subtle **glow only on focus/active** — never ambient.
- **Reduced motion is respected globally**: `globals.css` collapses animations
  and transitions under `prefers-reduced-motion: reduce`. Don't fight it.

### Accent tints and motion (PROPOSAL, pending integrator review)

> Design refresh of 2026-10-29 (Personal Profile). Not yet accepted. It
> loosens §1's "if a screen feels colorful, it's wrong" for decorative icon
> tiles, Section accents (bars, table header rows, row hover, header
> actions), label chips, the Section menu, the page tabs and the profile header
> band only. Every piece below is **opt-in**, except the three shared effects
> listed next, so `/account` changes only by those until it opts in. Accept,
> amend or reject it here, and in DESIGN.md if accepted.

**Shared effects (not opt-in; every page, `/account` included).**

- **Outline and ghost button hover** (`components/ui/button.tsx`): the hover
  fill is the blue tint `bg-tint-blue` with `text-tint-blue-foreground` (AA in
  both themes, table below), instead of `bg-accent`. Dark mode uses the same
  tint instead of `bg-input/50` (outline) or `bg-accent/50` (ghost).
- **Press scale** (every `Button`): `active:scale-[0.98]` is now
  `motion-safe:active:scale-[0.98]`, so a press doesn't scale under reduced
  motion.
- **Toast check pop** (`components/ui/toast.tsx`): the success toast's
  `CheckCircle` pops in once (`animate-icon-pop`, 300 ms; none under reduced
  motion).

**Tints.** These are brand tints mixed from the brand layer, so a rebrand
flows through. The soft ones are for hovers; the strong ones only behind
decorative icons; the header pair only for the profile header band. Never use
them for status:

| Utility pair | Light | Dark |
|---|---|---|
| `bg-tint-blue` / `text-tint-blue-foreground` | primary 12 % on card / primary (4.94:1) | primary 22 % on card / primary-text (4.87:1) |
| `bg-tint-teal` / `text-tint-teal-foreground` | secondary 12 % / secondary + graphite (4.69:1) | secondary 22 % / secondary + cloud (4.47:1) |
| `bg-tint-mint` / `text-tint-mint-foreground` | tertiary 12 % / tertiary + graphite (4.50:1) | tertiary 22 % / tertiary (4.18:1) |
| `bg-tint-blue-strong` / `text-tint-blue-strong-foreground` | primary hue at oklch L 0.92 C 0.05 / `brand-primary` itself (4.67:1) | primary hue at L 0.38 C 0.06 / primary hue at L 0.82 (5.76:1) |
| `bg-tint-teal-strong` / `text-tint-teal-strong-foreground` | secondary hue at L 0.92 C 0.05 / secondary at full chroma, L 0.46 (5.27:1) | L 0.38 C 0.06 / L 0.82 (5.79:1) |
| `bg-tint-mint-strong` / `text-tint-mint-strong-foreground` | tertiary hue at L 0.92 C 0.05 / tertiary at full chroma, L 0.46 (5.29:1) | L 0.38 C 0.06 / L 0.82 (5.80:1) |
| `bg-tint-aqua-strong` / `text-tint-aqua-strong-foreground` (label chips only) | highlight hue at L 0.92 C 0.05 / L 0.46 (5.54:1) | L 0.38 C 0.06 / L 0.82 (5.74:1) |
| `bg-tint-*-tile` (icon tiles only, never under text) | brand hue at L 0.88 C 0.065; glyph blue 4.14, teal 4.68, mint 4.70 | L 0.40 C 0.07; glyph ≥ 5.2 |
| `bg-tint-*-surface` (light fills under text) | brand 10 % on card | brand 12 % on card |
| `from-tint-header-start` / `via-tint-header-mid` (40 %) / `to-tint-header-end` | primary 50 % → secondary 24 % → secondary 12 % on background | 58 % → 36 % → 24 % |

The strong tints use CSS relative color (`oklch(from var(--brand-*) L C h)`):
the brand hue at a set lightness and chroma, so the tiles read clearly blue,
teal or mint (a `color-mix` with white keeps trust-blue's low chroma and reads
grey-blue) and a rebrand still flows through. Each strong foreground also
meets 4.5:1 on background (≥ 5.46:1) and on `accent` (the menu hover, ≥ 5.35:1).
Solid `brand-secondary` and `brand-tertiary` are only 2.6:1 and 1.5:1 on their
tiles, so teal and mint glyphs are the same hue deepened, not the swatch.

The surface tints carry every text color that can sit on them at AA:
muted-foreground ≥ 5.46:1 (dark ≥ 5.14), success-strong ≥ 4.61 (dark ≥ 5.16),
link-text ≥ 5.17 (dark ≥ 6.46) and the strong foregrounds ≥ 5.1. The soft
`tint-*` (12 % / 22 %) is too strong for that in dark mode (mint: 3.8:1 for
link-text), which is why tables use the surface level.

The header band is strongest at the name. Its contact block (the primary
phone / email, ≥ 768 px, right-aligned) moves left with a long email, down to
the band's strongest part (38 % of the width at 768 px with a 46-character
address), where muted-foreground falls to 4.35:1 (2.66:1 at the start stop;
dark 4.43:1). So text on the band is foreground only: ≥ 6.45:1 over the whole
band (dark ≥ 7.42:1), the name and the contact labels included.

Outline and ghost buttons hover on `tint-blue`. Status keeps its own colors.

**Accents.** Decorative and opt-in, drawn on pseudo-elements so the layout
never moves:

- One tone per Section, `PROFILE_SECTION_TONES` (`features/shell/section-tones.ts`):
  Personal and Insurance blue, Phone / Email / Social media teal, Addresses mint.
- `SectionContainer accent={tone}`: a 4 px left border in the brand hue
  (`brand-primary` / `-secondary` / `-tertiary`). It is a real border, not an
  absolutely positioned bar: a positioned overlay that grows with the container
  makes Chrome suppress scroll anchoring, so content appearing above a control
  (a field error on blur) would move it mid-click. The saved ring is unmounted
  once its pulse ends for the same reason.
- The saved check and ring count the Section's saves with
  `useSectionSavedCount(id)`: only `id`'s saves while it is observed, `0` for
  `null`; another `id`, or observing again after `null`, starts over at `0`.
  Their windows, and `CopyButton`'s, share `useConfirmationWindow`
  (`components/ui/use-confirmation-window.ts`): each event restarts the window,
  and a counter back at `0` confirms its next event again.
- `SectionHeader icon`: besides the tile, a 24 × 2 px line in the brand hue
  under the title (all widths), and the header actions (Edit, Add …) with an
  outline in the brand hue, filling with the surface tint on hover (text stays
  foreground).
- The tone reaches the `SectionTable` inside an accented container
  (`SectionToneContext`): the column header row on the surface tint with its
  text in the strong foreground, and read-view rows hovering on the surface
  tint (no hover while editing, as before).
- `Chip tone="teal|mint|aqua"` (label chips only; Primary keeps its fill):
  `labelChipTone()` maps Home → mint, Work → teal, anything else → aqua.
- `CopyButton` (`components/ui/copy-button.tsx`) after each phone number and
  email address in the read tables: a 28 px icon (44 × 44 hit area) shown on
  row hover or keyboard focus (always where there is no hover), named "Copy
  {value}". A copy swaps it for a ✓ with a decorative "Copied" bubble in the
  tooltip colors (both pop in, 300 ms; static under reduced motion) for
  1.5 s, and announces "{value} copied" in its own polite region. If the
  clipboard refuses (or an insecure page has none), it announces "Couldn't
  copy {value}. Select it to copy it yourself." The strings are DRAFT COPY in
  `COMMON_MESSAGES`.
- `ProfileTabs accent` (→ `PageTabs accent`): the active tab's text in
  `primary-text` and a 3 px primary → secondary bar over its underline.
- The icon tile gets a 2 px ring in its brand hue that fades in on hover or
  keyboard focus in its row (a ring, not a glow: glow stays reserved for focus).
- `ContactsPanel accent` (→ `SectionNav accent`): the menu shows a 16 px
  Section icon (`PROFILE_SECTION_ICONS`, the header tile's) in its tone's
  strong foreground **instead of the 01–05 index number**, in the number's
  24 px column so the labels stay aligned; each count is a pill (`rounded-full`,
  20 px) on the tone's strong tint, and on `tint-*-emphasis` when the item is
  current (≥ 5.45:1); hover on the tone's surface tint, except on the current
  item, whose link paints over the indicator (a hover fill there would cover
  it); the current item on its
  tone's strong tint with a 3 px brand-hue bar, drawn by one sliding indicator
  (`useSlidingIndicator`): it moves to the new item by `translateY` on a click
  or a scroll-spy change (300 ms, `ease-premium`; it jumps under reduced
  motion, and never slides on load). Jump to (< 768 px) has no icons,
  so it keeps its numbers, in the tone.
  **Departs from the Ledger UX spec:** DESIGN.md "Section index (desktop)"
  (`section-index-item`: mono number 01–05, label, mono count; numbers and
  count turn `primary-text` when active), the `mono-index` type role, and
  EXPERIENCE.md "Section index" ("sticky numbered left index (01–05)") all
  call for the numbers. Accepting this proposal means amending those; without
  `accent` the menu still follows them.
- With `SectionHeader icon`, the Section heading's focus ring shows only on
  `:focus-visible`: focus still moves to the heading after a menu click, Save
  or Cancel, but a mouse action shows no box (keyboard use still does). Without
  the opt-in, the F3-2 rule stands (the ring on any `:focus`, because Chromium
  doesn't match `:focus-visible` after script focus that follows a click).
- Insurance policy cards: a 4 px `brand-primary` rule along the top
  (`border` when Deleted).
- `ProfileHeader accent`: the tinted band, a 3 px primary → secondary → tertiary
  rule over its bottom border and a `brand-secondary` ring on the avatar that
  scales in once (`.animate-avatar-ring-enter`, 450 ms; static under reduced
  motion).

**Motion.** All motion is one-shot and animates only transform and opacity.
None of it loops, and all of it is off under reduced motion
(`app/globals.css`, "Design refresh motion"):

| Class / component | What | Duration |
|---|---|---|
| `.animate-section-enter` (`SectionContainer animated`) | Fade + 14 px rise when a Section's content arrives, staggered 70 ms by display order (`sectionStagger`) | 320 ms, `ease-premium` |
| `.animate-icon-enter` (`AnimatedIcon entrance`) | Icon tile fades and scales 0.8 → 1.08 → 1 (a slight overshoot) | 380 ms |
| `AnimatedIcon` hover | Tile lifts 2 px and scales to 1.12 on hover of its `group/icon-host` row or keyboard focus in it (`:focus-visible`, not a click that moves focus there) | 200 ms, `ease-spring` (`cubic-bezier(0.34, 1.56, 0.64, 1)`) |
| `.animate-icon-success` (`AnimatedIcon success`) | A check pops over the tile after a Section saves, then fades | 300 ms in, 250 ms out after 1.2 s |
| `.animate-saved-flash` (`SectionContainer animated`) | Success ring fades in and out after a save | 400 ms |
| `.animate-icon-pop` (success toast) | The toast's check pops in | 300 ms |
| Section menu indicator (`SectionNav accent`) | Slides to the current item by `translateY` | 300 ms, `ease-premium` |
| `CopyButton` confirmation (`.animate-icon-pop`) | ✓ and the "Copied" bubble pop in, then go after 1.5 s | 300 ms |
| `.animate-avatar-ring-enter` (`ProfileHeader accent`) | The avatar ring scales 0.8 → 1.06 → 1 and fades in, once | 450 ms after 120 ms |

The Section header tile (`AnimatedIcon size="lg"`, 40 px with a 20 px glyph)
shows only from 640 px. At 360 px it would push
"Edit" / "Add …" onto a second row in Social media and Addresses. Lifts are
gated with `motion-safe:` rather than reset with `motion-reduce:`, because
the reset loses to the `group-hover` selectors' specificity.

Entrances fill `backwards` only, so no transform outlives them. A lingering
transform would make each Section a stacking context. Decorative icons are
`aria-hidden`; a save is still announced by its toast. E2e runs with
`reducedMotion: "reduce"`.

---

## 10. Accessibility

Target **WCAG 2.1 AA minimum**.

- Body/status text meets AA contrast. The `-strong` status variants exist so
  status text is readable on both themes — use them for text, reserve base hues
  for fills, borders, and icons.
- Never signal state with **color alone** — pair with an icon or label (e.g. the
  token badges read "Active" / "Expired", not just green/red).
- Focus is always visible: interactive controls use the `focus-ring` utility
  (`app/globals.css`), a 2px `--ring` outline with a 2px offset plus the
  `--glow` shadow on `:focus-visible`. Don't remove it.
- If you inject per-tenant brand colors at runtime, re-check that
  `--primary-foreground` (white by default) still contrasts against the new
  `--brand-primary`.

---

## 11. Component guidelines

**Buttons** — one primary action per view. Primary = `--primary` (brand). Use
`variant="secondary"` / `"outline"` / `"ghost"` for everything else. Never place
two competing primary buttons side by side.

**Cards** — `rounded-lg`, `shadow-sm` at rest, one clear purpose each. Group
related info; don't exceed ~5 content groups per screen.

**Inputs** — `rounded-md`, visible `control-border` boundary, brand focus ring.
Always pair with a `<Label>`.

**Badges / status chips** — pill-shaped. Solid `default`/`secondary` for
emphasis; soft `success`/`warning`/`info` for status.

**Chips in tables (Ledger delta, F6-2)** — the Personal Profile renders every
Section as a ruled table, so chips inside cells are square: `<Chip>`
(`components/ui/chip.tsx`) is `rounded-sm`, 22 px, 12 px / 600. Variants:
`label` (muted, e.g. "Work"), `primary` (the only filled chip), `deleted`, and
the bordered "+N" `overflow` chip (`<OverflowChip>` when it is focusable: a
44 px button named by the list it hides). `<Badge>` keeps the design system's
pill for status outside tables; row statuses use `StatusBadge` (icon + word).

**Dialogs** — `rounded-lg`, `shadow-lg`, `ease-premium` entrance, dimmed
`bg-scrim` overlay. One decision per dialog.

**Empty states** — every empty state needs three things: **what** it is, **why**
it's empty, and the **next action**.

---

## 12. Cognitive-load standards

The command-center feel comes as much from restraint as from styling:

- **One** primary goal per screen.
- **≤ 5** content groups per screen.
- **≤ 7** primary navigation items.
- **Progressive disclosure** for advanced/rare features — don't front-load them.

---

## 13. Critical constraints (the "never" list)

- ❌ No rainbow dashboards — stay in the healthcare palette.
- ❌ No all-caps except short metadata labels.
- ❌ No competing primary actions.
- ❌ No decorative red — red means error/destructive, nothing else.
- ❌ No ambient glow — glow is for focus/active only.
- ❌ No hardcoded hex or `bg-*-500` palette classes in components — use tokens
  (enforced by `scripts/check-forbidden.sh`).
- ✅ Respect reduced motion. ✅ Meet WCAG 2.1 AA. ✅ Keep the brand lowercase.

---

## 14. Dark mode

A full command-center dark theme ships with the system (graphite canvas, cloud
ink, aqua focus glow). It's **class-based and off by default**.

Enable it globally by adding `dark` to the root element in
[`app/layout.tsx`](../app/layout.tsx):

```tsx
<html lang="en" className={`${inter.variable} dark`} suppressHydrationWarning>
```

Or wire a toggle that adds/removes `dark` on `document.documentElement`. Because
every semantic token has a `.dark` value, components need no changes.

---

## 15. Keeping in sync with the spec

The canonical spec lives at
<https://tachin-website.web.app/public/1health_design_system.md> and is
referenced at the top of [`app/globals.css`](../app/globals.css).

When the spec changes:

1. Re-read the spec.
2. Update the **Tier 1 reference palette** and any changed scales in
   `app/globals.css` (keep the Tier 2 / Tier 3 structure intact).
3. Update the tables in this document.
4. Rebuild and eyeball the Settings + Auth pages in light and dark.

Keeping brand hues in Tier 2 means spec updates and customer rebrands never
collide: the spec owns Tier 1 and the scales; customers own Tier 2.

---

## Quick reference

```
Rebrand ............ edit --brand-primary/secondary/tertiary/highlight in globals.css
Surfaces ........... bg-background · bg-card · bg-muted
Text ............... text-foreground · text-muted-foreground
Type ............... text-h1 … text-caption
Primary action ..... bg-primary text-primary-foreground   (<Button>)
Status ............. <Badge variant="success|warning|info"> or bg-*/12 text-*-strong
Radius ............. buttons/inputs rounded-md · cards rounded-lg · badges rounded-full · table chips rounded-sm
Elevation .......... cards shadow-sm · dialogs shadow-lg · focus shadow-glow
Motion ............. entrances ease-premium · interactions ease-standard
Dark mode .......... add `dark` class to <html>
```
