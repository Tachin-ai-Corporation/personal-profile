---
title: "DESIGN: Personal Profile (1health)"
status: final
created: 2026-10-13
updated: 2026-10-13
status-note: 'Updated 2026-10-13 for the Profile module (/account); app-bar page nav (Personal Profile | Account) and never-framed host per user overrides 2026-10-13'
name: 1health Personal Profile (Ledger)
description: "Personal Profile on the 1health design system, Ledger direction. shadcn/ui + Tailwind v4 on 1health tokens (app/globals.css); this file names the tokens the app reads and specifies only the Ledger deltas."
sources:
  - ../../../../docs/DESIGN-SYSTEM.md
  - ../../../../app/globals.css
  - ../../prds/prd-profile-account-2026-10-13/prd.md
  - ../../prds/prd-personal-profile-2026-10-13/prd.md
visual-reference: mockups/direction-c-ledger.html
key-screens:
  - mockups/key-personal-info-edit.html
  - mockups/key-addresses-edit.html
  - mockups/key-insurance.html
  - mockups/key-profile-picture.html
  - mockups/key-account.html
  - mockups/key-provider-registration.html
  - mockups/key-organizations.html
colors:
  # Token names mirror app/globals.css exactly. Light is default; `-dark` keys
  # are the `.dark` values. Tier 1 (reference palette), used directly only
  # where noted; components read Tier 3.
  graphite: '#202833'
  charcoal: '#313b47'
  slate: '#566373'
  mist: '#aeb8c4'
  cloud: '#e6ebf0'
  trust-blue: '#246b8f'
  clinical-ice: '#e8f7fa'
  signal-aqua: '#8fd8e6'
  status-success: '#3baa78'
  status-info: '#2f80a8'
  status-warning: '#d6a83a'
  status-error: '#d84f45'
  status-neutral: '#7a8696'
  # Tier 2 brand layer (1health brand as-is, no re-skin)
  brand-primary: '#246b8f'
  brand-highlight: '#8fd8e6'
  # Tier 3 semantic, light
  background: '#f4f7fa'
  foreground: '#202833'
  card: '#ffffff'
  card-foreground: '#202833'
  popover: '#ffffff'
  popover-foreground: '#202833'
  primary: '#246b8f'
  primary-foreground: '#ffffff'
  secondary: '#eaeff4'
  secondary-foreground: '#313b47'
  muted: '#edf1f5'
  muted-foreground: '#566373'
  accent: '#e8f7fa'
  accent-foreground: '#202833'
  destructive: '#d84f45'
  destructive-foreground: '#ffffff'
  border: '#e1e8ef'
  input: '#e1e8ef'
  ring: '#246b8f'
  link: '#2f80a8'
  success: '#3baa78'
  success-strong: '#1b7a4f'
  info: '#2f80a8'
  info-strong: '#256a8c'
  warning: '#d6a83a'
  warning-strong: '#8a6511'
  error: '#d84f45'
  error-strong: '#b23a31'
  neutral: '#7a8696'
  # Ledger delta: link text reads info-strong, not --link (AA; see Colors)
  link-text: '#256a8c'
  # Ledger delta: destructive button fill reads error-strong, not --destructive
  # (white text AA; see Colors)
  destructive-fill: '#b23a31'
  # Ledger delta: input/control boundary reads status-neutral #7a8696 (light) /
  # mist (dark), not --input (see Colors)
  control-border: '#7a8696'
  # Ledger delta: primary-colored text (wordmark, text in the primary hue) — same as primary in light
  primary-text: '#246b8f'
  # Ledger delta: dialog/drawer scrim — graphite at 45 % in light
  scrim: 'rgba(32, 40, 51, 0.45)'
  # Ledger delta: tooltip surface
  tooltip: '#202833'
  tooltip-foreground: '#ffffff'
  # Profile module: the QR code sits on white in both themes so scanners read it
  qr-surface: '#ffffff'
  # Tier 3 semantic, dark (.dark)
  background-dark: '#202833'
  foreground-dark: '#e6ebf0'
  card-dark: '#29333f'
  card-foreground-dark: '#e6ebf0'
  popover-dark: '#29333f'
  popover-foreground-dark: '#e6ebf0'
  primary-dark: '#246b8f'
  primary-foreground-dark: '#ffffff'
  secondary-dark: '#313b47'
  secondary-foreground-dark: '#e6ebf0'
  muted-dark: '#313b47'
  muted-foreground-dark: '#aeb8c4'
  accent-dark: '#2a3c46'
  accent-foreground-dark: '#e8f7fa'
  destructive-dark: '#d84f45'
  border-dark: '#3a4552'
  input-dark: '#3a4552'
  ring-dark: '#8fd8e6'
  link-dark: '#8fd8e6'
  link-text-dark: '#8fd8e6'
  success-strong-dark: '#5fcb98'
  info-strong-dark: '#6fb6d8'
  warning-strong-dark: '#e6c264'
  error-strong-dark: '#f08a80'
  # destructive fill stays #b23a31 in dark: white on error-strong-dark is 2.4:1
  destructive-fill-dark: '#b23a31'
  # primary-dark #246b8f as text is 2.18:1 on card-dark; text in the primary hue reads info-strong-dark (5.71:1)
  primary-text-dark: '#6fb6d8'
  # graphite is the dark background (#202833), so a graphite scrim is invisible; dark scrim is black at 60 %
  scrim-dark: 'rgba(0, 0, 0, 0.6)'
  control-border-dark: '#aeb8c4'
  # Dark tooltip inverts to cloud/graphite (Ledger mock is light-only)
  tooltip-dark: '#e6ebf0'
  tooltip-foreground-dark: '#202833'
typography:
  # Inter via next/font (font-sans). Roles map onto the 1health scale
  # (text-h4 … text-caption); deltas are weight/case only.
  profile-name:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    note: 'text-h4 — the page h1 is the user name, styled at h4 size'
  section-title:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    note: 'text-body at 600 (Ledger delta: flat register, no h2 size)'
  body:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    note: 'text-body; all inputs use this size (no iOS zoom)'
  cell:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    note: 'text-body-sm; table cells, buttons, meta lines, help text'
  cell-strong:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    note: 'key/value values, status text, button labels'
  cell-number:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    note: 'phone numbers; tabular-nums'
  column-header:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.06em
    note: 'text-caption, uppercase — the only all-caps in the app (metadata labels)'
  caption:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    note: 'text-caption; tooltips, Coming soon tag'
  chip:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
  mono-value:
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    note: 'font-mono; Masked SSN and revealed SSN'
  mono-index:
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    note: 'section index numbers (01–05) and entry counts'
rounded:
  # 1health scale (globals.css --radius-*)
  sm: 6px
  md: 10px
  lg: 16px
  xl: 24px
  full: 9999px
spacing:
  # 1health 8px grid (DESIGN-SYSTEM.md §6)
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 24px
  '6': 32px
  '7': 48px
  '8': 64px
  # Ledger named tokens
  touch-target: 44px
  row-read: 44px
  row-header: 36px
  chip-height: 22px
  cell-x: 12px
  cell-edit-y: 16px
  page-gutter: 24px
  page-gutter-mobile: 16px
  section-gap: 32px
  index-width: 200px
  kv-key-edit: 240px
  control-max: 480px
  address-grid-gap: 16px
  control-max-wide: 720px
  breakpoint-sm: 640px
  breakpoint-mobile: 768px
  breakpoint-lg: 1024px
  breakpoint-xl: 1280px
  min-viewport: 360px
components:
  app-bar:
    background: '{colors.card}'
    border-bottom: '{colors.border}'
    height: 52px
    title: '{typography.section-title}'
    wordmark: '{colors.primary-text}'  # plain text span, not focusable
    return-link: '{colors.link-text}'
  app-nav-item:
    height: '{spacing.touch-target}'
    padding: '0 {spacing.3}'
    typography: '{typography.section-title}'
    foreground: '{colors.muted-foreground}'
    background: transparent
    hover: '{colors.accent}'
    radius: '{rounded.md}'
    indicator: transparent
  app-nav-item-active:
    foreground: '{colors.foreground}'
    fontWeight: '600'
    indicator: '{colors.primary}'
    indicator-width: 2px
  profile-header:
    background: '{colors.background}'
    border-bottom: '{colors.border}'
    padding: '{spacing.4} {spacing.page-gutter}'
    name: '{typography.profile-name}'
    meta: '{colors.muted-foreground}'
  avatar:
    size: 40px
    radius: '{rounded.full}'
    background: '{colors.card}'
    border: '{colors.border}'
    initials: '{colors.primary-text}'
  avatar-button:
    hit-area: '{spacing.touch-target}'
    radius: '{rounded.full}'
    focus: '{components.focus-ring}'
  camera-badge:
    size: 18px
    radius: '{rounded.full}'
    background: '{colors.primary}'
    foreground: '{colors.primary-foreground}'
    ring: '2px {colors.card}'
    icon-size: 11px
    position: bottom-right
  picture-dialog:
    width: 440px
    background: '{colors.card}'
    radius: '{rounded.lg}'
    shadow: elevation-2
    preview-size: 96px
    preview-radius: '{rounded.full}'
  tab:
    height: '{spacing.touch-target}'
    foreground: '{colors.muted-foreground}'
    indicator: transparent
  tab-active:
    foreground: '{colors.foreground}'
    fontWeight: '600'
    indicator: '{colors.primary}'
    indicator-width: 2px
  tag-coming-soon:
    background: '{colors.muted}'
    foreground: '{colors.muted-foreground}'
    radius: '{rounded.sm}'
    type: '{typography.caption}'
  section-index-item:
    height: '{spacing.touch-target}'
    foreground: '{colors.charcoal}'
    number: '{typography.mono-index}'
    hover: '{colors.accent}'
  section-index-item-active:
    background: '{colors.accent}'
    foreground: '{colors.primary-text}'
    fontWeight: '600'
    marker: 'inset 3px {colors.primary}'
  jump-to:
    height: '{spacing.touch-target}'
    radius: '{rounded.md}'
    border: '{colors.control-border}'
  table-container:
    background: '{colors.card}'
    border: '{colors.border}'
    radius: '{rounded.md}'
    shadow: none
  table-container-editing:
    border: '{colors.primary}'
    halo: '0 0 0 3px {colors.accent}'
  table-header-cell:
    background: '{colors.muted}'
    foreground: '{colors.muted-foreground}'
    height: '{spacing.row-header}'
    type: '{typography.column-header}'
  table-row:
    height: '{spacing.row-read}'
    divider: '{colors.border}'
    type: '{typography.cell}'
  table-row-hover:
    background: '{colors.accent}'
  table-row-edit:
    padding: '{spacing.cell-edit-y} {spacing.cell-x}'
    vertical-align: top
  table-row-new:
    background: '{colors.background}'
  table-row-removed:
    text-decoration: line-through
    foreground: '{colors.muted-foreground}'
    restore: '{colors.link-text}'
  kv-key:
    foreground: '{colors.muted-foreground}'
    type: '{typography.cell}'
  kv-value:
    foreground: '{colors.foreground}'
    type: '{typography.cell-strong}'
  kv-value-empty:
    foreground: '{colors.muted-foreground}'
    type: '{typography.cell}'
  chip-label:
    background: '{colors.muted}'
    foreground: '{colors.charcoal}'
    radius: '{rounded.sm}'
    height: '{spacing.chip-height}'
    type: '{typography.chip}'
  chip-primary:
    background: '{colors.primary}'
    foreground: '{colors.primary-foreground}'
    radius: '{rounded.sm}'
    height: '{spacing.chip-height}'
    type: '{typography.chip}'
  status-verified:
    foreground: '{colors.success-strong}'
    icon: check-circle
    type: '{typography.cell-strong}'
  status-not-verified:
    foreground: '{colors.warning-strong}'
    icon: alert-circle
    type: '{typography.cell-strong}'
  status-pending:
    foreground: '{colors.muted-foreground}'
    type: '{typography.cell}'
  notifications-indicator:
    on: '{colors.foreground}'
    off: '{colors.muted-foreground}'
  chip-deleted:
    background: '{colors.muted}'
    foreground: '{colors.muted-foreground}'
    radius: '{rounded.sm}'
  button-primary:
    background: '{colors.primary}'
    foreground: '{colors.primary-foreground}'
    radius: '{rounded.md}'
    height: '{spacing.touch-target}'
  button-outline:
    background: '{colors.card}'
    border: '{colors.border}'
    foreground: '{colors.foreground}'
    hover: '{colors.accent}'
    radius: '{rounded.md}'
    height: '{spacing.touch-target}'
  button-secondary:
    background: '{colors.secondary}'
    foreground: '{colors.secondary-foreground}'
    radius: '{rounded.md}'
    height: '{spacing.touch-target}'
  button-ghost:
    background: transparent
    foreground: '{colors.primary-text}'
    hover: '{colors.accent}'
    radius: '{rounded.md}'
    height: '{spacing.touch-target}'
  button-aria-disabled:
    background: '{colors.muted}'
    foreground: '{colors.muted-foreground}'
    border: '{colors.border}'
    cursor: not-allowed
  button-destructive:
    background: '{colors.destructive-fill}'
    foreground: '{colors.destructive-foreground}'
    radius: '{rounded.md}'
  button-outline-destructive:
    background: '{colors.card}'
    border: '{colors.border}'
    foreground: '{colors.error-strong}'
    hover: '{colors.muted}'
    radius: '{rounded.md}'
    height: '{spacing.touch-target}'
  kebab-button:
    size: '{spacing.touch-target}'
    foreground: '{colors.charcoal}'
    hover: '{colors.muted}'
    radius: '{rounded.md}'
  row-menu:
    background: '{colors.popover}'
    radius: '{rounded.md}'
    shadow: elevation-1
  tooltip:
    background: '{colors.tooltip}'
    foreground: '{colors.tooltip-foreground}'
    radius: '{rounded.sm}'
    padding: '6px 10px'
    type: '{typography.caption}'
    shadow: elevation-1
  input:
    height: '{spacing.touch-target}'
    background: '{colors.card}'
    border: '{colors.control-border}'
    radius: '{rounded.md}'
    type: '{typography.body}'
    focus: '{colors.ring}'
  input-locked:
    background: '{colors.muted}'
    foreground: '{colors.charcoal}'
    icon: lock
  input-error:
    border: '2px {colors.error}'
  help-text:
    foreground: '{colors.muted-foreground}'
    type: '{typography.cell}'
  help-text-error:
    foreground: '{colors.error-strong}'
    type: '{typography.cell-strong}'
  unsaved-indicator:
    dot: '{colors.warning}'
    foreground: '{colors.warning-strong}'
    type: '{typography.cell-strong}'
  save-all-bar:
    background: '{colors.card}'
    border-top: '{colors.border}'
    padding: '6px {spacing.page-gutter}'
    position: sticky-bottom
  save-all-pill:
    background: '{colors.primary}'
    foreground: '{colors.primary-foreground}'
    radius: '{rounded.full}'
    height: '{spacing.touch-target}'
    shadow: elevation-1
  inline-banner-error:
    background: '{colors.card}'
    foreground: '{colors.error-strong}'
    icon: alert-circle
    action: '{colors.link-text}'
  inline-banner-info:
    background: '{colors.accent}'
    foreground: '{colors.foreground}'
    icon: info-circle
  skeleton-row:
    background: '{colors.muted}'
    height: '{spacing.row-read}'
    shimmer: 900–1400ms loop
  empty-row:
    foreground: '{colors.muted-foreground}'
    action: '{colors.link-text}'
  empty-card:
    background: '{colors.card}'
    border: 'dashed {colors.border}'
    radius: '{rounded.md}'
  confirm-dialog:
    background: '{colors.popover}'
    radius: '{rounded.lg}'
    shadow: elevation-2
    overlay: '{colors.scrim}'
  toast:
    background: '{colors.popover}'
    radius: '{rounded.md}'
    shadow: elevation-2
  insurance-card:
    background: '{colors.card}'
    border: '{colors.border}'
    radius: '{rounded.md}'
    shadow: none
  card-thumbnail:
    width: 120px
    height: 76px
    background: '{colors.background}'
    border: '{colors.border}'
    radius: '{rounded.sm}'
  card-thumbnail-missing:
    width: 120px
    height: 76px
    background: '{colors.background}'
    border: '1.5px dashed {colors.mist}'
    radius: '{rounded.sm}'
    foreground: '{colors.muted-foreground}'
  insurance-drawer:
    width: 480px
    background: '{colors.card}'
    shadow: elevation-2
    side: right
    height: full
    header: 'sticky, min 60px, bottom {colors.border}'
    footer: 'sticky, top {colors.border}'
    body-padding: '20px {spacing.5} {spacing.5}'
  drawer-scrim:
    background: '{colors.scrim}'
  address-expanded-grid:
    columns: 4
    gap: '{spacing.address-grid-gap}'
  signature-pad:
    height: 160px
    max-width: '{spacing.control-max}'
    background: '{colors.background}'
    border: '{colors.control-border}'
    radius: '{rounded.md}'
    ink: '{colors.foreground}'
  signature-thumb:
    width: 112px
    height: 32px
    background: '{colors.background}'
    border: '{colors.border}'
    radius: '{rounded.sm}'
  ssn-reveal:
    value: '{typography.mono-value}'
    action: '{colors.link-text}'
    height: '{spacing.touch-target}'
  countdown-ring:
    size: 16px
    track: '{colors.border}'
    progress: '{colors.primary}'
  stacked-row-card:
    divider: '{colors.border}'
    padding: '{spacing.3}'
    line-1: '{typography.cell-number}'
    line-2: '{typography.cell}'
  # 2026-10-14: launch errors use the /auth Alert (D9); this block now serves only the kill-switch disabled screen
  full-page-message:
    background: '{colors.background}'
    panel: '{colors.card}'
    radius: '{rounded.lg}'
  focus-ring:
    outline: '2px {colors.ring}'
    offset: 2px
    glow: shadow-glow
  # --- Profile module (/account) ---
  mfa-tile:
    size: 112px
    background: '{colors.card}'
    border: '{colors.border}'
    radius: '{rounded.md}'
    logo: 48px
    label: '{typography.cell-strong}'
  mfa-tile-inactive:
    opacity: '0.55'
    cursor: not-allowed
  qr-dialog:
    width: 440px
    background: '{colors.popover}'
    radius: '{rounded.lg}'
    shadow: elevation-2
    qr-size: 184px
    qr-surface: '{colors.qr-surface}'
    qr-frame: '1px {colors.border}'
    mobile: full-screen below '{spacing.breakpoint-mobile}'
  otp-input:
    height: '{spacing.touch-target}'
    width: 200px
    type: '{typography.mono-value}'
    letter-spacing: 0.3em
  combobox-option:
    height: 52px
    line-1: '{typography.cell-strong}'
    line-2: '{typography.caption}'
  org-card:
    background: '{colors.card}'
    border: '{colors.border}'
    radius: '{rounded.md}'
    padding: '{spacing.4}'
    min-height: 248px
    shadow: none
  org-card-disabled:
    foreground: '{colors.muted-foreground}'
  org-logo:
    height: 72px
    fit: contain
  org-initials-tile:
    size: 72px
    background: '{colors.muted}'
    foreground: '{colors.muted-foreground}'
    radius: '{rounded.md}'
  type-icon:
    size: 20px
    foreground: '{colors.muted-foreground}'
    target: '{spacing.touch-target}'
  overflow-chip:
    height: '{spacing.chip-height}'
    border: '{colors.border}'
    foreground: '{colors.secondary-foreground}'
    radius: '{rounded.sm}'
    type: '{typography.chip}'
  info-popover:
    background: '{colors.popover}'
    foreground: '{colors.popover-foreground}'
    radius: '{rounded.md}'
    shadow: elevation-2
    width: 280px
    placement: below trigger
  info-icon-button:
    size: '{spacing.touch-target}'
    icon: 18px
    foreground: '{colors.muted-foreground}'
    hover: '{colors.muted}'
    radius: '{rounded.md}'
  pagination:
    item: '{spacing.touch-target}'
    active: '{colors.muted}'
    active-foreground: '{colors.foreground}'
  no-access-panel:
    background: '{colors.card}'
    border: '{colors.border}'
    radius: '{rounded.md}'
    icon: lock
    icon-color: '{colors.muted-foreground}'
    foreground: '{colors.muted-foreground}'
    type: '{typography.cell}'
    padding: '{spacing.6} {spacing.4}'
---

# DESIGN: Personal Profile (1health)

Visual reference: [`mockups/direction-c-ledger.html`](mockups/direction-c-ledger.html) — the chosen **Ledger** direction (desktop 1280 px Contacts tab scrolled to Phone, plus mobile 390 px top of page). Key-screen mocks (approved 2026-10-13), each linked from the Component it settles. Personal Profile: [`mockups/key-personal-info-edit.html`](mockups/key-personal-info-edit.html), [`mockups/key-addresses-edit.html`](mockups/key-addresses-edit.html), [`mockups/key-insurance.html`](mockups/key-insurance.html), [`mockups/key-profile-picture.html`](mockups/key-profile-picture.html). Profile module (`/account`): [`mockups/key-account.html`](mockups/key-account.html), [`mockups/key-provider-registration.html`](mockups/key-provider-registration.html), [`mockups/key-organizations.html`](mockups/key-organizations.html). **The spines (this file and EXPERIENCE.md) win over every mock on conflict.** Behavior lives in [EXPERIENCE.md](EXPERIENCE.md).

## Brand & Style

Personal Profile is a precise clinical dashboard for one person's own record. It is used equally by patients and by providers managing their own record, so it speaks to both in the same calm, exact register. It inherits the 1health "healthcare command center" posture as-is: 1health brand, no customer re-skin, 70 % neutral / 20 % healthcare accent / 5 % action / 5 % status.

The Ledger direction renders every Section as a plain, flat table. A profile with ten phone numbers reads the same as one with two: columns line up and nothing reflows. Row actions stay out of the way until a row is hovered or focused, and a kebab on every row gives touch and keyboard users the same actions. It is the quietest, most spreadsheet-like option, and editing happens in place inside the table.

The UI system is **shadcn/ui + Tailwind v4 on 1health tokens** (`components/ui/`, `app/globals.css`, `docs/DESIGN-SYSTEM.md`). Everything not listed here inherits the design system unchanged. This file specifies only the Ledger deltas and the components the profile needs.

## Colors

All values are the exact `app/globals.css` tokens; light is default, dark is supported (NFR-3) via the `.dark` class and the `-dark` keys above. Components read only Tier 3 tokens through Tailwind utilities (`bg-card`, `text-muted-foreground`, …); no hex in components.

- **Neutrals carry the page.** `{colors.background}` page canvas and profile header band; `{colors.card}` tables, app bar, Save all bar; `{colors.muted}` table header fill, locked inputs, label chips; `{colors.border}` every hairline and table rule.
- **Trust Blue (`{colors.primary}` #246b8f)** is identity and the one action color: primary buttons, the active tab indicator, the active section index item, the editing-table outline, the Primary chip, focus rings. Never decorative.
- **Clinical Ice (`{colors.accent}` #e8f7fa)** is the only hover/selected surface: row hover and focus-within, the active index item, the 3 px halo around an editing table.
- **Status hues mean status.** Text uses the `-strong` variants (`{colors.success-strong}` Verified, `{colors.warning-strong}` Not verified and Unsaved changes, `{colors.error-strong}` validation and load errors). Base hues (`{colors.warning}` dot, `{colors.error}` 2 px invalid-input border) are for fills, borders and icons only. Status is never color alone: always icon + word.
- **Red is errors and destructive actions only** (`{colors.destructive-fill}`, `{colors.error-strong}`, `{colors.error}`; the outline destructive button `{components.button-outline-destructive}` uses `{colors.error-strong}` text).
- **Link text delta.** Text links use `{colors.link-text}` = info-strong #256a8c (5.97:1 on card) instead of `--link` #2f80a8 (4.40:1, just under AA). Dark mode keeps `--link` (signal-aqua, 8.0:1 on card-dark). The app maps link text to the dedicated `text-link-text` utility, never `text-info-strong` directly.
- **Destructive button delta.** Destructive buttons fill with `{colors.destructive-fill}` = error-strong #b23a31 (white text 5.93:1) instead of `--destructive` #d84f45 (white text 4.10:1). The fill stays #b23a31 in dark mode, because white on error-strong-dark #f08a80 is 2.4:1. The app maps the destructive button to the dedicated `bg-destructive-fill` utility, never `bg-error-strong` directly.
- **Primary text delta.** Text in the primary hue (the wordmark, any text styled as primary) uses `{colors.primary-text}`: #246b8f in light, info-strong-dark #6fb6d8 in dark (5.71:1 on card-dark), because `primary-dark` #246b8f as text measures 2.18:1 on card-dark. Primary *fills* (buttons, active tab indicator, Primary chip) keep `{colors.primary}`. Decided 2026-10-14.
- **Scrim delta.** Dialogs and the drawer sit over `{colors.scrim}`: graphite at 45 % in light, black at 60 % in dark, because the dark background is graphite (#202833) and a graphite scrim would not dim it. Decided 2026-10-14.
- **Input border delta.** Input and control boundaries (inputs, selects, Jump to, Signature pad) use `{colors.control-border}` = #7a8696 (the existing `--status-neutral` value) (3.7:1 on card, passing WCAG 1.4.11) instead of `--input` #e1e8ef (1.24:1 on card). Dark mode keeps mist #aeb8c4 on card-dark (6.38:1). Table rules and card hairlines keep `{colors.border}`; only controls change.
- **Signal Aqua (`{colors.brand-highlight}`)** appears only as the focus glow (`shadow-glow`) and dark-mode ring.

Load-bearing contrast (light): foreground/card 14.9:1 · muted-foreground/card 6.1:1 · muted-foreground/muted 5.4:1 · muted-foreground/accent 5.6:1 · link-text/card 5.97:1 · link-text/accent 5.4:1 · success-strong/accent 4.9:1 · warning-strong/accent 4.8:1 · error-strong/card 5.9:1 · white/destructive-fill 5.93:1 · control-border/card 3.7:1 · primary-foreground/primary 5.9:1 · tooltip 14.9:1. Dark: muted-foreground-dark/card-dark 6.4:1 · control-border-dark/card-dark 6.38:1 · all `-strong-dark` ≥ 5.3:1 on card-dark.

Profile module (`/account`) contrast, measured from the hex values above. Organization Type icons, the initials tile and the (i) icon buttons read `{colors.muted-foreground}`, never Tier-1 `{colors.slate}`: slate has no dark value and measures 2.09:1 on card-dark, which fails WCAG 1.4.11 for icons that carry meaning.

| Pair | Light | Dark | Criterion |
|---|---|---|---|
| Type icon, (i) icon on card (`{colors.muted-foreground}`) | 6.1:1 | 6.4:1 | 1.4.11, 3:1 |
| Initials on initials tile (muted-foreground on muted) | 5.4:1 | 5.7:1 | 1.4.3, 4.5:1 |
| Pagination current page (foreground on muted) | 13.1:1 | 9.5:1 | 1.4.3 |
| MFA tile label on hover (foreground on accent) | 13.5:1 | 9.6:1 | 1.4.3 |
| "+N" chip text (secondary-foreground on card) | 11.4:1 | 10.7:1 | 1.4.3 (the chip border is decorative; the text identifies it) |
| "Disable" text (error-strong on card) | 5.9:1 | 5.3:1 | 1.4.3 |
| Inactive MFA tile at 0.55 opacity | 3.5:1 | 4.4:1 | Exempt under 1.4.3: an aria-disabled control whose reason is given as text in the caption |

### Design-system deviations to report upstream

Four Ledger deltas override 1health tokens for contrast (the scrim delta is a new token, not an override). Report them to the design-system owners. The app keeps each override until `app/globals.css` changes.

| Token | 1health value (measured) | Ledger value (measured) | Criterion |
|---|---|---|---|
| Link text (`--link`) | #2f80a8 on card: 4.40:1 | info-strong #256a8c on card: 5.97:1 | WCAG 1.4.3, 4.5:1 text |
| Destructive button (`--destructive`) | white on #d84f45: 4.10:1 | white on error-strong #b23a31: 5.93:1 | WCAG 1.4.3, 4.5:1 text |
| Input border (`--input`) | #e1e8ef on card: 1.24:1 | #7a8696 on card: 3.7:1 | WCAG 1.4.11, 3:1 boundary |
| Primary as text, dark (`--primary` in `.dark`) | #246b8f on card-dark: 2.18:1 | info-strong-dark #6fb6d8 on card-dark: 5.71:1 | WCAG 1.4.3, 4.5:1 text |

Mist #aeb8c4 was tried first and measured only 2.01:1, so the light control border uses #7a8696 (`--status-neutral`, 3.7:1) instead; decided 2026-10-13.

## Typography

Inter throughout, on the 1health scale. Ledger uses a **flat register**: the page is a ledger, not a document, so sizes stay small and hierarchy comes from weight and rules.

| Role | Token | Scale utility | Where |
|---|---|---|---|
| User name (page `h1`) | `{typography.profile-name}` | `text-h4` | Profile header |
| Section title (`h2`) | `{typography.section-title}` | `text-body` + `font-semibold` | Section header, app-bar nav items |
| Cell | `{typography.cell}` | `text-body-sm` | Table cells, buttons, meta, help text |
| Value / status | `{typography.cell-strong}` | `text-body-sm font-medium` | Key/value values, status text |
| Phone number | `{typography.cell-number}` | `text-body-sm font-semibold tabular-nums` | Phone column |
| Column header | `{typography.column-header}` | `text-caption uppercase tracking-[0.06em] font-semibold` | Table `th` |
| Chip / caption | `{typography.chip}`, `{typography.caption}` | `text-caption` | Chips, tooltip, Coming soon tag |
| Input | `{typography.body}` | `text-body` | Every input and select (16 px avoids iOS zoom) |
| SSN | `{typography.mono-value}` | `font-mono` | Masked and revealed SSN |
| Index number / count | `{typography.mono-index}` | `font-mono text-caption` | Section index 01–05, counts |

Rules: `tabular-nums` on every table. Uppercase only on column headers (short metadata labels). One `h1` per page: the user name. The mock's off-scale 13 px meta/help text and 15 px app title are normalized to text-body-sm 14 px and text-body 16 px.

## Layout & Spacing

1health 8 px grid (`{spacing.1}`–`{spacing.8}`). Ledger density: read rows `{spacing.row-read}` 44 px, header rows `{spacing.row-header}` 36 px, cell padding `{spacing.cell-x}` horizontally; edit rows grow (inputs `{spacing.touch-target}` high, cell padding `{spacing.cell-edit-y}` top/bottom, help text below). Two densities by design: dense read, roomier edit. Touch targets are 44 px everywhere, including in-cell buttons and the kebab.

**Desktop (≥ `{spacing.breakpoint-mobile}` 768 px):** app bar (52 px) → profile header band → tab strip → two-column body: sticky numbered section index (`{spacing.index-width}` 200 px, right hairline) + main column with `{spacing.page-gutter}` padding and `{spacing.section-gap}` between Sections. Sticky Save all bar at the bottom edge. The main column is fluid with no max width.

The Personal information edit view uses a `{spacing.kv-key-edit}` 240 px key column, and every value control (inputs, selects, SSN, Signature pad) is capped at `{spacing.control-max}` 480 px so inputs don't stretch across the main column.

**Mobile (< 768 px, down to `{spacing.min-viewport}` 360 px, no horizontal scroll):** gutters `{spacing.page-gutter-mobile}`; the index becomes a full-width Jump to select under the tabs; four-column key/value tables fold to one Field | Value pair per row in read view, and in edit view each field stacks its label above a full-width control; multi-column Section tables reflow into stacked row cards; the profile header drops the primary phone/email line; Save all becomes a page-anchored pill. Confirm dialogs stay centered with `{spacing.page-gutter-mobile}` gutters; on `/account` only the Link authenticator dialog goes full-screen.

## Elevation & Depth

Flat. No surface in the page has a shadow: tables, the profile header, Insurance cards and the Save all bar sit on tone and hairlines (the bar separates with a top border). Elevation is reserved for things that float above the page:

- `shadow-md` (elevation-1): tooltip, row menu, Jump to and NPI combobox listboxes, Save all pill.
- `shadow-lg` (elevation-2): confirm dialog, Profile Picture dialog, Link authenticator dialog (`{components.qr-dialog}`), Info popover (`{components.info-popover}`), toast, Insurance drawer. The drawer and dialogs sit over `{colors.scrim}` (graphite at 45 % in light, black at 60 % in dark); popovers have no scrim.
- `shadow-glow`: focus only, never ambient.

The editing state is shown by the `{colors.primary}` outline + `{colors.accent}` halo, not by lifting the table.

## Shapes

1health radius scale. `{rounded.md}` 10 px for table containers, buttons, inputs, Insurance cards, Organization cards, MFA tiles, the initials tile, popovers, the No-access panel and menus. `{rounded.lg}` 16 px for dialogs and the full-page message panel. `{rounded.sm}` 6 px for chips inside cells, the "+N" chip, tooltips, the Coming soon tag, the signature thumbnail and card thumbnails. `{rounded.full}` only for the avatar, its camera badge, the 96 px picture preview, the Save all pill and the countdown ring.

Ledger delta: chips in table cells use `{rounded.sm}` rather than the design system's pill badge, so they sit square in a ruled grid.

## Components

shadcn primitives used as-is on 1health tokens: Button, Input, Label, Dialog, Toast, Skeleton, Alert (in `components/ui/`), plus Tabs, Tooltip, DropdownMenu, Select, Sheet to be added from shadcn unchanged. Profile-specific visual specs:

| Component | Visual spec |
|---|---|
| **App bar** | `{components.app-bar}`, identical on `/` and `/account`. Left: "1health" wordmark in `{colors.primary-text}` bold (plain text, not a link), 1 px vertical rule, then a `nav` ("Pages") with two items, **Personal Profile** (`/`) and **Account** (`/account`): `{components.app-nav-item}` text tabs (ghost-style hover in `{colors.accent}`), the current page `{components.app-nav-item-active}` (foreground, 600, 2 px `{colors.primary}` bottom indicator) with `aria-current="page"`. Right: "Return to 1health" link in `{colors.link-text}` with external-link icon, 44 px target, underline on hover. Mobile (< 768 px): the two items render as a compact segmented control in the bar (same tokens, 44 px targets); below 400 px they wrap onto a second row under the wordmark. Replaces the earlier "same app bar, no switcher" decision (user override 2026-10-13). |
| **Profile header** | `{components.profile-header}`. Avatar (`{components.avatar}`: 40 px circle, initials in `{colors.primary-text}` 600 when no Profile Picture) · name `{typography.profile-name}` · meta "Last updated …" in `{colors.muted-foreground}` · right-aligned primary phone and primary email (label `{colors.muted-foreground}`, value `{colors.foreground}` 500, tabular). Mobile: avatar + name only. Change Profile Picture ([`mockups/key-profile-picture.html`](mockups/key-profile-picture.html)): the whole avatar is a button (`{components.avatar-button}`): avatar stays 40 px, hit area padded to 44 × 44, 2 px focus ring + glow. `{components.camera-badge}` sits bottom-right: 18 px circle, `{colors.primary}` fill, white camera icon, 2 px `{colors.card}` ring; shown with and without a picture. |
| **Profile Picture dialog** | [`mockups/key-profile-picture.html`](mockups/key-profile-picture.html). `{components.picture-dialog}`: 440 px wide, Confirm dialog anatomy. Title "Change profile picture" · preview row: 96 px circle preview + file name (500, ellipsis) and type · size in muted text + "Choose another file" (outline) · rules line (info icon, muted) "JPG, PNG or BMP, up to 6 MB." · footer right-aligned Cancel (secondary) + Save (primary). Error state: the preview keeps the current picture with "Current picture · Not changed", the error line uses `{components.help-text-error}`, and Save is `{components.button-aria-disabled}`. Mobile: same dialog, full width minus 16 px gutters. |
| **Tabs** | `{components.tab}` / `{components.tab-active}`: 44 px, 12 px side padding, 2 px `{colors.primary}` underline overlapping the strip's bottom border. Medical carries `{components.tag-coming-soon}` ("Coming soon", mobile "Soon"). |
| **Section index (desktop)** | `{components.section-index-item}`: three-column grid — mono number (01–05), label, mono count of entries (blank for Personal information). Active (`aria-current=location`): `{components.section-index-item-active}`, 3 px inset left bar, number and count turn `{colors.primary-text}`. Sticky top. |
| **Jump to (mobile)** | `{components.jump-to}`: "Jump to" label (muted) + select showing the mono number and section name, chevron right; listbox uses `{components.row-menu}` styling. |
| **Section header** | 44 px row: `h2` `{typography.section-title}` · count or "Editing" in `{colors.muted-foreground}` · right-aligned tools (`{components.button-outline}` "Edit" or "Add phone/email/link/address" with plus icon). |
| **Section table — read** | `{components.table-container}` around a full-width table. `{components.table-header-cell}` header row; `{components.table-row}` body rows with 1 px dividers, last row none. Hover and focus-within: `{components.table-row-hover}`. Columns — Phone: Number · Label · Type · Status · Notifications · actions; Email: Email address · Label · Status · Notifications · actions; Social media: Link · actions; Addresses: Address · Label (Primary) · Type · Status · actions. The mock's "Network" and "Visibility" columns have no PRD backing and are dropped. |
| **Section table — edit** | Container switches to `{components.table-container-editing}`. Rows take `{components.table-row-edit}` padding, no hover fill. Saved values that can't change render as `{components.input-locked}` (muted fill, lock icon, help line beneath). New rows use `{components.table-row-new}` with status text "New · not saved". Draft-removed rows: `{components.table-row-removed}` (strikethrough value, muted) with "Removed on save" in the status cell and a "Restore" link in the actions cell. **Addresses** ([`mockups/key-addresses-edit.html`](mockups/key-addresses-edit.html)): a collapsed address (FR-26) reuses the read-view columns inside the edit table, 56 px tall: a 44 px expand/collapse chevron button · one-line address in `{typography.cell-strong}` (line 1, line 2, city, state zip; country omitted when it is the user's default US, appended otherwise) · Primary chip · Address Type · Status · Remove. An expanded address is one full-width row (colspan) with a header (chevron, "New address" 600, muted "· New · not saved") over `{components.address-expanded-grid}`, a 4-column field grid with 16 px gaps: [Address Type][Country][Set as primary checkbox, 2 columns] / [Address line 1, 2 columns][Address line 2, 2 columns] / [City][County][State/Province][Zip]. Address line 1 suggestions open in a listbox (`{components.row-menu}` styling) directly under the field, matched text in 600. Mobile: stacked row cards inside the same outlined container (collapsed: address on line 1, Primary chip + type + Verified on line 2, kebab right); the expanded card stacks every field full width on `{colors.background}`. A `tfoot` row holds: `{components.unsaved-indicator}` ("Unsaved changes" with 8 px warning dot, left), then "Add row" (ghost, plus), "Cancel" (secondary), "Save" (primary) right-aligned. |
| **Key/value table (Personal information)** | Read, desktop: four columns key | value | key | value; keys `{components.kv-key}` ~16 % width, values `{components.kv-value}` ~34 %, a vertical hairline between the two pairs; no row hover. Empty values: "Not provided" in `{components.kv-value-empty}`. Mobile read: two columns Field | Value (key 44 %). Edit, desktop ([`mockups/key-personal-info-edit.html`](mockups/key-personal-info-edit.html)): two columns Field | Value, key column `{spacing.kv-key-edit}` 240 px (label `{colors.charcoal}` 500, top-aligned to the control), value controls capped at `{spacing.control-max}` 480 px with help or error text under the control. Edit, mobile: each field stacks its label above a full-width control inside the same container, hairline between fields (replaces the 44 % split, which is too narrow for the Signature pad and SSN + Reveal). Labels of optional fields carry a muted "(optional)" suffix (400 weight); required fields carry no marker. Signature row shows `{components.signature-thumb}` + "Added {date}" meta. SSN row shows `{components.ssn-reveal}`. Field order is defined in EXPERIENCE.md Component Patterns (Key/value table) and is the same in read and edit. |
| **Row status badges** | Contact Label: `{components.chip-label}` (e.g. "Old", "Work"). Primary: `{components.chip-primary}` — the only filled chip. Verified: `{components.status-verified}` check-circle 14 px + "Verified". Not verified: `{components.status-not-verified}` alert-circle + "Not verified". Verify pending: `{components.status-pending}` "Link sent · Resend in 60 s". Home-labeled entries: no verification badge. Notifications: `{components.notifications-indicator}`: plain "On" (`{colors.foreground}`) / "Off" (`{colors.muted-foreground}`). Insurance precedence: Primary → `{components.chip-primary}`; Secondary/Supplemental/Other → `{components.chip-label}`. Deleted policy: `{components.chip-deleted}` "Deleted". Address Verified uses `{components.status-verified}`. |
| **Row actions + kebab** | Right-aligned actions cell. Inline actions (ghost `button-cell`, 44 px, 14 px text: Verify, Make primary, Edit) fade in (opacity 150 ms `ease-standard`) on row hover/focus-within on desktop only. The `{components.kebab-button}` (44 × 44, three dots) is always visible and opens `{components.row-menu}`, which repeats every row action; destructive item ("Remove") uses `{colors.error-strong}` text. Verify and Make primary act directly from the read view (no edit mode). Remove always switches the Section to edit mode with that row shown as `{components.table-row-removed}` + "Restore". |
| **Tooltip** | `{components.tooltip}`: graphite surface, white caption text, 6 px radius, 6 px arrow, above the control, elevation-1, max one line on desktop (wraps on mobile). Used for disabled-action reasons ("Verify this number first"). |
| **Disabled action** | `{components.button-aria-disabled}`: muted fill, `{colors.muted-foreground}` text, border, not-allowed cursor; stays in the tab order (aria-disabled). |
| **Inputs** | `{components.input}` 44 px, 16 px text, `{rounded.md}`, 1 px `{colors.control-border}` boundary; error `{components.input-error}` (2 px error border) with `{components.help-text-error}` line (alert icon + message) below; default help in `{components.help-text}`. Selects use the same box with a chevron. Phone input: country flag + dial code rendered as a leading segment inside the input, and as a flag before the number in read cells. |
| **Save all bar (desktop)** | `{components.save-all-bar}`: one line — warning dot, "{N} unsaved section(s)" (600), muted sub-line (e.g. "Email has 1 field to fix"), right: "Discard all" (secondary) + "Save all (N)" (primary). |
| **Save all pill (mobile)** | `{components.save-all-pill}`: centered floating pill "Save all (N)" above the bottom edge, elevation-1. The pill carries only Save all; Discard stays per Section. |
| **Inline banner** | Inside the table container, replacing rows: `{components.inline-banner-error}` alert icon + "Couldn't load phones" + "Retry" link. Info variant `{components.inline-banner-info}` for draft restore and draft conflict. |
| **Skeleton** | `{components.skeleton-row}`: three placeholder rows inside the real table container with real column headers; bars in `{colors.muted}` with the design-system shimmer (static under reduced motion). |
| **Empty state** | Contact Sections: `{components.empty-row}` single row spanning all columns — one line + action link ("No social links yet · Add link"). Insurance: `{components.empty-card}` larger dashed card with one line of copy and a primary "Add insurance" button. Medical: quiet centered panel, `{colors.muted-foreground}` text, no action. |
| **Confirm dialog** | shadcn Dialog: `{components.confirm-dialog}`, `ease-premium` 220–280 ms entrance. Title, one or two lines of body, right-aligned Cancel (secondary) + confirm. Mobile (< `{spacing.breakpoint-mobile}`): stays centered, full width minus `{spacing.page-gutter-mobile}` gutters; confirm dialogs never go full-screen. Confirm is `{components.button-primary}` for a primary change and `{components.button-destructive}` (`{colors.destructive-fill}` fill, white text) for removing the Signature, deleting insurance and turning off the authenticator app. |
| **Session expired dialog** | Confirm dialog anatomy, non-dismissable: no close button, no overlay dismiss. Title, one paragraph, one `{components.button-primary}` "Return to 1health". The page and the user's edits stay visible behind the dimmed overlay. |
| **Draft conflict compare** | Inside the conflicted Section, under the `{components.inline-banner-info}` banner: one row per changed field, the field name in `{components.kv-key}` and two value columns side by side, "Your version" and "Current" (`{typography.column-header}` headers, values in `{components.kv-value}`). Below them, right-aligned "Use current" (secondary) and "Keep mine" (primary). Mobile: the two values stack under the field name, "Your version" first. |
| **Leave guard** | Same anatomy as Confirm dialog with three buttons: "Keep editing" (secondary, initial focus), "Discard" (outline), "Save" (primary). |
| **Card image viewer** | shadcn Dialog at `{rounded.lg}`, image fit to viewport on `{colors.card}`, Front/Back segmented toggle, close button; mobile full-screen. |
| **Toast** | shadcn Toast `{components.toast}`, bottom-right desktop / bottom-center mobile above the pill. Success: check icon `{colors.success-strong}`. Partial failure: alert icon `{colors.warning-strong}`. |
| **Insurance card** | [`mockups/key-insurance.html`](mockups/key-insurance.html). `{components.insurance-card}`: flat bordered card. Title row (min 52 px, bottom hairline): "{Type} Insurance" in `{typography.section-title}` + precedence chip, kebab right. Body: a compact key/value grid (Insurer, Member ID, Group ID, Subscriber, Effective, Expiration, Cancellation; two pairs per row, 40 px rows, `{components.kv-key}`/`{components.kv-value}` styling) on the left, and on the right, behind a left hairline, two `{components.card-thumbnail}` front/back at 120 × 76 px with a "Front"/"Back" caption (caption type, muted) under each; mobile: thumbnails drop below the key/value grid. Missing image: `{components.card-thumbnail-missing}` (dashed 120 × 76 placeholder, "Image not uploaded") with a "Retry upload" link under it. Deleted policy: whole card text `{colors.muted-foreground}`, Deleted chip, no kebab. Cards stack in a single column at full main-column width on all widths, 16 px apart. |
| **Insurance editor** | [`mockups/key-insurance.html`](mockups/key-insurance.html). Desktop: shadcn Sheet from the right, `{components.insurance-drawer}` 480 px wide, full height, over a `{components.drawer-scrim}`; sticky header (title + close, bottom hairline), scrolling form body, sticky footer right-aligned Cancel (secondary) + Save (primary). Paired fields share a two-column row (Type + Precedence, Member ID + Group ID, Effective + Expiration dates, subscriber first + last name). The Subscriber group opens with a top hairline and a `{typography.section-title}` heading. The primary-demotion notice is an `{components.inline-banner-info}` with an outline "Make {insurer} secondary" button and a muted note under it. Card images sit side by side (front | back): a chosen file shows as a 120:76 preview with file name · size and "Replace" / "Remove" ghost buttons; an empty slot is a dashed 120:76 drop tile with "No image chosen" and a "Choose {side} image" button. Insurer search uses the `{components.row-menu}` listbox. Mobile: full-screen page with the same anatomy and order, a back control in place of close, paired fields stacked one per row, Cancel + Save pinned to the bottom edge. |
| **Signature pad** | Edit view of the Signature row: `{components.signature-pad}` full value-column width capped at `{spacing.control-max}` 480 px, 160 px tall, baseline rule in `{colors.border}`, ink `{colors.foreground}`; below it "Clear" (ghost) and "Upload image instead" (ghost, upload icon). Upload shows the chosen PNG/JPEG in the pad area. |
| **SSN reveal** | Masked value in `{typography.mono-value}` + "Reveal" text button (eye icon, `{colors.link-text}`, underlined, 44 px target). Revealed: full value + `{components.countdown-ring}` (16 px circle depleting clockwise over 30 s) + "Hide" button. Reduced motion: ring is replaced by static text "Hides in 30 s". |
| **Stacked row card (mobile)** | `{components.stacked-row-card}`: each table row becomes a block separated by hairlines inside the same container. Line 1: value (number/email/address) + status. Line 2: Contact Label chip + type + notifications, muted. Kebab right, vertically centered. No hover actions; in edit mode the same card holds the inputs stacked full-width. |
| **Full-page message** | `{components.full-page-message}`: centered card on `{colors.background}`, icon, title, one paragraph, one primary action ("Return to 1health"). Not used for launch errors (superseded 2026-10-14: launch failures, incl. wrong tenant, are the /auth destructive Alert, D9). Used only for the kill-switch disabled screen. |
| **Focus** | `{components.focus-ring}`: 2 px `{colors.ring}` outline, 2 px offset, plus `shadow-glow`, on every interactive element. |

### Profile module (/account) components

`/account` uses the same app bar and profile header as Personal Profile; in the app bar **Account** is the active nav item (no separate page title). The app is never framed: it always runs top-level in its own tab, so "Return to 1health" always shows. The tab strip uses `{components.tab}` with three labels: "Personal Account", "Individual Provider Registration" and "My Organizations". On mobile the strip scrolls horizontally and carries no "Soon" tag. `/account` has no section index, because each tab is short. Key screens: [`mockups/key-account.html`](mockups/key-account.html), [`mockups/key-provider-registration.html`](mockups/key-provider-registration.html), [`mockups/key-organizations.html`](mockups/key-organizations.html). Each component below has a behavioral row of the same name in EXPERIENCE.md Component Patterns.

| Component | Visual spec |
|---|---|
| **Account settings (key/value)** | The Section heading reads "Personal account settings". Same **Key/value table** as Personal information. Read, desktop: four columns (key \| value \| key \| value), filled row by row in this order: First name · Last name / Username · Password / Primary email address · Primary phone number / Birth date · Preferred language / Default time zone · Preferred locale for date, time, and currency. Password shows `********` in `{typography.mono-value}`. Primary phone number uses the same display format as the Contacts Phone column (e.g. "+1 (415) 551-2125"). Edit: Field \| Value, controls capped at `{spacing.control-max}`. Username and Password render as `{components.input-locked}` with the help lines from Voice and Tone. Primary email address and Primary phone number are Selects. Birth date is a masked MM/DD/YYYY `{components.input}` with a trailing calendar button that opens a date picker. The FR-105 help is a "?" `{components.info-icon-button}` (circle-help icon) right after the Birth date label, edit view only; its `{components.tooltip}` holds the Birth date help from Voice and Tone and wraps (max 320 px) because the text runs past one line. The first-change notice is an `{components.inline-banner-info}` under its Select. The "add verified … in your personal profile" helper is `{components.help-text}` with an in-app link in `{colors.link-text}`. Footer (tfoot): `{components.unsaved-indicator}` on the left, Cancel (secondary) + Save (primary) on the right; no Save all bar. |
| **Authenticator app section** | Section header "Authenticator app" (`{typography.section-title}`) with the status on the right. Linked: `{components.status-verified}` "Enabled" + "Disable" (`{components.button-outline-destructive}`). Not linked: muted "Not set up". Body: one line of muted copy, then a row of five `{components.mfa-tile}` buttons (Google, Microsoft, Authy, DUO, Android OTP): 112 px square, vendor logo 48 px centered, name under it in `{typography.cell-strong}`; hover uses the `{components.table-row-hover}` fill, focus `{components.focus-ring}`. Linked: tiles take `{components.mfa-tile-inactive}`, with the caption "Disable the current authenticator to link another" under the row. Mobile: 3-column grid, tiles fill the cell (min 96 px). Vendor logos are the only non-token colors in the app. |
| **Link authenticator dialog** | `{components.qr-dialog}`, Confirm dialog anatomy. Title "Link your {App} authenticator" · instruction paragraph · QR at 184 px on `{colors.qr-surface}` (white in both themes) inside a 1 px `{colors.border}` frame, centered, alt text "QR code to link your authenticator app" · label "6-digit code" + `{components.otp-input}` (single field, mono, wide tracking, no placeholder) · inline error `{components.help-text-error}` under the field · footer Cancel (secondary) + Submit (primary, spinner while validating). Loading QR: a 184 px skeleton square. Mobile (< `{spacing.breakpoint-mobile}`): full-screen sheet per the PRD responsive NFR, the only `/account` dialog that goes full-screen. The header holds the title and a 44 px close button; the body scrolls; Cancel + Submit are pinned to the bottom edge. |
| **Disable authenticator confirm** | Confirm dialog; the confirm button is `{components.button-destructive}` "Turn off". Mobile: stays centered, full width minus `{spacing.page-gutter-mobile}` gutters, like every confirm dialog. |
| **Base-MFA-off notice** | `{components.inline-banner-info}` inside the Authenticator app section, above the tiles. Tiles stay enabled; activating one shows the notice. |
| **Healthcare credentials section** | Section header "Healthcare credentials" + an (i) `{components.info-icon-button}` that opens the provider `{components.info-popover}`. Unregistered body: instruction line (`{typography.body}`, 500) · two NPI comboboxes stacked, full main-column width capped at `{spacing.control-max-wide}` 720 px, 16 px apart · right-aligned primary "Register" under them. Registration error (platform message or the 1-888 fallback): `{components.inline-banner-error}` inside the Section, under the instruction line and above the comboboxes; not a toast. Registered body: see Registered view. |
| **NPI combobox** | Labels "Search for your personal NPI number" (required, no marker) and "Search for your practice's (hospital, clinic, lab, etc.) NPI Number (optional)"; placeholder "Search by NPI or name". `{components.input}` with a leading search icon and a trailing clear (×). Listbox in `{components.row-menu}` styling; each option is a `{components.combobox-option}`: line 1 NPI in `{typography.mono-value}` + name, line 2 city, state (with address line 1 for practices) in muted caption. Loading row: spinner + "Searching…". Error row: alert icon + "Couldn't load results." + a "Try again." link-styled button in `{colors.link-text}`. End of list: muted "No more results". Zero results: a single non-selectable muted row "No matching NPI found". Field errors use `{components.help-text-error}` under their own field. |
| **Register** | `{components.button-primary}` "Register", right-aligned under the comboboxes. In flight: spinner + "Registering…", disabled. |
| **Registered view** | Read-only key/value table in FR-116 order, using the Account settings read layout: four columns, filled row by row; mobile one Field \| Value pair per row. Signature row: `{components.signature-thumb}` (or "No signature available"), then a "?" `{components.info-icon-button}` (circle-help icon) whose `{components.tooltip}` reads "The signature can be changed from the Personal Profile", then an in-app link "Personal Profile" in `{colors.link-text}` to `/?tab=contacts#signature`. Practice name: when the practice is a 1health Organization it is a `{colors.link-text}`-styled button that opens the support-contact `{components.info-popover}`; otherwise plain `{components.kv-value}` text. Below the table, at most one of: the "already exists" text as `{components.inline-banner-info}`, or "Register your practice to enable ordering" as `{components.button-outline}` with an external-arrow icon. |
| **Info popover** | `{components.info-popover}`: 280 px, `{rounded.md}`, elevation-2, opens below its trigger with its left edge aligned to it (flips above only when there is no room below). Three content variants: provider (i), one paragraph; Practice name, organization name (600), support phone (tabular), support email (`{colors.link-text}` mailto); Primary contact, title "Primary contact" (600), then name, phone (tabular) and email (mailto), each with a muted leading icon, or "-" when there is none. |
| **Organization search** | Full-width `{components.input}` with a leading search icon and the placeholder "Search organizations". Internal users get "Create new organization" (`{components.button-outline}`, plus icon) to its right; it stacks below the search on mobile. |
| **Organization card** | `{components.org-card}`, flat and bordered. Grid: 4 / 3 / 2 / 1 columns at ≥ `{spacing.breakpoint-xl}` / ≥ `{spacing.breakpoint-lg}` / ≥ `{spacing.breakpoint-sm}` / below, 16 px gaps. Top row: logo (`{components.org-logo}`, 72 px tall, contain, left-aligned) or `{components.org-initials-tile}` (two initials, 600), with an (i) `{components.info-icon-button}` top-right. Name: the short name, falling back to the name, in `{typography.section-title}` on one line with an ellipsis; the full name shows in a Tooltip. Type row: up to four `{components.type-icon}` (20 px lucide outline, 44 px target, each with a Tooltip label), then `{components.overflow-chip}` "+N". Icon order: Lab, Health Provider, Supplier, Go To Market, then the rest alphabetically. Bottom: `{components.button-primary}` "Enter portal" (see Portal hand-off). Disabled organization: `{components.org-card-disabled}` text, "Enter portal" as `{components.button-aria-disabled}` with the Tooltip "You're disabled in this organization". |
| **Pagination** | Centered under the grid: previous / page numbers / next, each 44 px. Current page: `{components.pagination}` active fill + `aria-current="page"`. |
| **Organizations empty state** | `{components.empty-card}` with the title "You aren't managing any organizations yet" (`{typography.section-title}`), the sub-line, four feature rows (24 px `{colors.muted-foreground}` icon · name 600 · description muted) and a primary "Register organization" (with an external-arrow icon when it opens the checkout site in a new tab). No results: an `{components.empty-row}`-style single line "Sorry, no results were found", with no pagination. |
| **Portal hand-off** | Enter portal, Register your practice to enable ordering, Create new organization and Register organization (internal users) keep their own button style, with no external-arrow icon and no "(opens in a new tab)": they navigate the same tab (after the leave guard). Accessible name e.g. "Enter portal for {name}". |
| **No-access panel** | `{components.no-access-panel}`: replaces the content of the affected tab or Section. Tab level: centered inside a bordered `{rounded.md}` panel on `{colors.card}`, 20 px lock icon in `{colors.muted-foreground}` above one line "You don't have access to this in your current account" in `{typography.cell}`; no action. Section level (Account settings, Authenticator app, Healthcare credentials): the same icon + line as a single row inside the Section's table container, in `{components.empty-row}` layout. |
| **Skeletons (/account)** | `{components.skeleton-row}` bars. Account settings: key/value skeleton (4 rows). Authenticator app: five 112 px tile placeholders. Healthcare credentials: two input-height bars. My Organizations: 12 card placeholders (one page) with logo, title and button bars, in the grid's column count. |

**Organization Type map.** Every type has an icon and a Tooltip label (addendum §B). Icons are lucide outline at 20 px in `{colors.muted-foreground}`; no type is color-coded.

| Type | Icon | Tooltip label |
|---|---|---|
| Lab | FlaskConical | Lab |
| Health Provider | HeartPulse | Healthcare |
| Supplier | Truck | Supplier |
| Go To Market | Store | Go To Market |
| Healthcare (backend type) | HeartPulse | Healthcare |
| Population Health | Users | Population Health |
| Insurance | Umbrella | Insurance |
| Carrier | Package | Carrier |
| Manufacturer | Factory | Manufacturer |
| Enterprise | Building2 | Enterprise |
| Government Agency | Landmark | Government Agency |
| n/a | CircleHelp | No types selected for this organization |

Insurance uses Umbrella rather than ShieldCheck, because today's 1health-fe uses a shield for Health Provider and the two would be confused.
| Any other (unknown) type | CircleHelp | The platform's type name; the card never breaks |

## Do's and Don'ts

| Do | Don't |
|---|---|
| Read every color from a 1health Tier 3 token (`bg-card`, `text-link-text`, `bg-destructive-fill`) | Hardcode hex or Tailwind palette classes (`bg-blue-600`) |
| Use `{colors.link-text}` (info-strong #256a8c) for text links in light mode | Use `--link` #2f80a8 for text on white (4.40:1) |
| Fill destructive buttons with `{colors.destructive-fill}` (error-strong #b23a31, 5.93:1 with white) | Use `--destructive` #d84f45 under white text (4.10:1) |
| Outline inputs, selects, Jump to and the Signature pad with `{colors.control-border}` (#7a8696 light, mist dark) | Use `--input` #e1e8ef as a control boundary (1.24:1) |
| Keep every Section a flat bordered table on `{rounded.md}` | Add shadows to tables, cards or the header |
| Pair every status with an icon and a word | Signal Verified/Not verified by color alone |
| Use the filled `{components.chip-primary}` only for Primary | Fill other labels or use trust-blue decoratively |
| Keep 44 px targets for in-cell buttons, kebab, tabs, index items | Shrink row actions to fit dense rows |
| Show row actions on hover/focus and always keep the kebab | Hide any action behind hover only |
| Use uppercase only for column headers | All-caps buttons, labels or sentences |
| Red only for errors and destructive actions | Red for Not verified (that is warning) or decoration |
| Respect reduced motion (no shimmer, no ring sweep, no fades) | Ambient glow or animated attention-getters |
| Show vendor authenticator logos at their own colors inside neutral tiles | Tint tiles or icons with brand colors elsewhere |
| Use lucide outline icons for Organization Types, all in `{colors.muted-foreground}` | Color-code organization types, or use Tier-1 `{colors.slate}` for icons (no dark value) |
| Use `{components.button-outline-destructive}` (error-strong text) only for an action that leads to a destructive confirm ("Disable") | Red outline or text on non-destructive actions |
