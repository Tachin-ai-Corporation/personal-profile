# Spine Pair Review — Personal Profile + Profile module (/account)

Scope: DESIGN.md + EXPERIENCE.md after the Profile-module update (PRD `prd-profile-account-2026-10-13`, FR-101..FR-120, UJ-101..UJ-105). Findings focus on the new `/account` content; pre-existing Personal Profile content was only checked for contradictions the update introduced.

## Overall verdict

The Profile-module update is usable. UJ-101..104 have proper Key Flows, the new frontmatter tokens resolve, and the three new key-screen mocks are linked inline. Two problems should be fixed before story-dev. First, the new icon tokens read Tier-1 `{colors.slate}`, which has no dark pair and fails contrast in dark mode. Second, the No-access panel has a behavioral spec but no visual spec. Beyond those, the update is uneven in three ways. Component names differ between the two spines. The sections that cut across the whole app (Responsive, Accessibility Floor, Shapes/Elevation, Foundation vocabulary) were not updated for `/account`. A few deliberate PRD deviations (mobile dialogs, popover triggers, landline primaries) are implied rather than stated.

## 1. Flow coverage — adequate

Checked UJ-101..UJ-105 against PRD §2.3. UJ-101..104 each have a protagonist, numbered steps, a **Climax** beat and a failure path, and link their key screen.

### Findings
- **low** UJ-105 has no Key Flow, only a one-line note, and its name is not verbatim ("session expires on `/account`" vs PRD "Session expires while editing") (EXPERIENCE.md Key Flows, line after UJ-104). *Fix:* give it a heading with the verbatim name and list only the `/account` deltas: draft key `account`, the leave guard on tab switch, and that MFA codes and NPI selections are dropped.
- **low** UJ-102 climax says status "Enabled", but PRD UJ-102/FR-110 says "Authenticator app enabled". PM5's rationale ("the platform doesn't record which app") doesn't explain dropping the words, since the PRD string names no app either (EXPERIENCE.md UJ-102 step 4, Component Patterns PM5). *Fix:* use the PRD string, or record PM5 as a deliberate copy delta against FR-110.
- **low** UJ-104 failure path covers the disabled org but not the no-results state (FR-119) (EXPERIENCE.md UJ-104). *Fix:* add "no match → 'Sorry, no results were found'".

## 2. Token completeness — adequate

Checked every token after `# --- Profile module (/account) ---` (mfa-tile, mfa-tile-inactive, qr-dialog, otp-input, combobox-option, org-card, org-card-disabled, org-logo, org-initials-tile, type-icon, overflow-chip, info-popover, pagination) and every `{…}` reference in the new prose table. All references resolve.

### Findings
- **high** `type-icon.color`, `org-initials-tile.foreground` and the Healthcare-credentials (i) icon use Tier-1 `{colors.slate}` (#566373), which has no `-dark` pair. In dark mode it measures 2.09:1 on card-dark and 1.86:1 on muted-dark, which fails WCAG 1.4.11 (3:1) for the Organization Type icons. Those icons are the only carrier of type information (DESIGN.md frontmatter `type-icon`, `org-initials-tile`; Profile module table "Organization card", "Healthcare credentials section"). *Fix:* use `{colors.muted-foreground}` (dark #aeb8c4, 6.4:1), or add a `slate-dark` pair and state the contrast.
- **medium** The "Load-bearing contrast" line wasn't extended for the new combinations: slate icons on card, initials on muted, the `pagination` active fill, the `overflow-chip` border, the `mfa-tile` label on hover (accent), and the inactive tile at opacity 0.55 (DESIGN.md Colors). *Fix:* add light and dark ratios for each, or mark the inactive tile as exempt under 1.4.3 because it is a disabled control.
- **medium** Several new values are raw and have no token: the QR's "white background in both themes", combobox width "capped at 720 px" (next to `control-max` 480), and the org-grid breakpoints 1280/1024/640. The only breakpoint token is `breakpoint-mobile` 768, and the grid has no step at 768 (DESIGN.md Profile module table: Link authenticator dialog, Healthcare credentials, Organization card). *Fix:* add `qr-surface: '#ffffff'`, `control-max-wide: 720px` and `breakpoint-sm/lg/xl`, or align the grid steps with 768.
- **low** New component tokens use different key names from the existing ones: `font` (otp-input, overflow-chip) and `color` (type-icon), where the rest of the file uses `type` and `foreground` (frontmatter). *Fix:* normalize the keys so the resolver and codegen see one vocabulary.

## 3. Component coverage — thin

Extracted the new component names from both spines. DESIGN has Account settings (key/value), Authenticator app section, Link authenticator dialog, Disable authenticator confirm, Base-MFA-off notice, Healthcare credentials section, Organization search, Organization card, Primary contact popover, Pagination, Organizations empty state and Skeletons (/account). EXPERIENCE has Account settings (key/value), Authenticator tiles, Link authenticator dialog, NPI combobox, Register, Info popover, Organization grid, Enter portal (hand-off) and No-access panel.

### Findings
- **high** **No-access panel** has an IA row, a Component Patterns row and a State row in EXPERIENCE, but no row or token in DESIGN.md. Its icon, surface, size and type are unspecified, and FR-103 applies it to every tab and card (EXPERIENCE.md Component Patterns "No-access panel"; DESIGN.md Profile module table). *Fix:* add a DESIGN row. It could reuse `{components.empty-card}` or `{components.full-page-message}` anatomy without the action, and it needs a card-level variant for org cards.
- **medium** The two spines name components differently, so neither has a 1:1 row for each component. "Authenticator app section" maps to "Authenticator tiles". "Healthcare credentials section" maps to "NPI combobox" + "Register". "Primary contact popover" maps to "Info popover ((i), Practice name, Primary contact)". "Organization search", "Organization card" and "Pagination" all map to "Organization grid". The Registered view has no behavioral row, and the info-popover visual covers three uses (DESIGN.md Profile module table vs EXPERIENCE.md Component Patterns). *Fix:* use the same component names in both tables, with one row each.
- **medium** The Authenticator "Disable" action is a `{components.button-outline}` with `{colors.error-strong}` text. No component token covers it, and it is a new destructive variant (DESIGN.md "Authenticator app section"). *Fix:* add `button-outline-destructive`, or use `button-destructive`, and add it to the Do's and Don'ts red rule.
- **medium** "Create new organization" and "Register organization" are missing their behavioral rules: who sees them (the internal `@1health.io`/`@tachin.ai` email rule, FR-119), and that Register opens the external checkout in a new tab for regular users but does a Portal hand-off for internal users. EXPERIENCE only mentions both buttons in the IA "Portal hand-off" row (EXPERIENCE.md IA and Component Patterns). *Fix:* add a row covering visibility and destination per user class, and whether the leave guard applies.

## 4. State coverage — adequate

Walked the `/account` surfaces. Covered: cold load, load error, 403, partial save, base MFA off, TOTP linked, QR loading, search loading/error/end, registered, no orgs, no results, disabled org, and framed host.

### Findings
- **medium** The wrong-tenant launch is missing. FR-102 and AM-3 require the AD-6 error with module-neutral copy ("Profile is available in your personal account…"). Also, the existing Invalid launch copy "Open Personal Profile again from 1health." is wrong when the launch targets `/account` (EXPERIENCE.md Voice and Tone "Invalid launch", State Patterns). *Fix:* add a tenant-error state row and copy, and make the invalid-launch copy module-aware.
- **low** "There are no changes" is listed as copy but has no state (FR-109: it stays in edit mode). The Preferred Locale default "English - United States" when nothing is stored (FR-108) also isn't stated (EXPERIENCE.md Account settings row). *Fix:* add both to the Account settings behavioral row.
- **low** The Organizations skeleton shows 8 card placeholders, but a page holds 12 cards (FR-117) (DESIGN.md "Skeletons (/account)"). *Fix:* use 12, or state that 8 is deliberate.

## 5. Visual reference coverage — adequate

`mockups/key-account.html`, `key-provider-registration.html` and `key-organizations.html` are in both spines' `key-screens` frontmatter and linked inline from the related components and flows. Spines-win-on-conflict is stated once in each spine.

### Findings
- **medium** `imports/profile-current-ui/1.png, 3.png, 4.png, 5.png` (the current `/personal-settings` UI) are orphans. Only `.memlog.md` mentions them, and neither spine links them (EXPERIENCE.md Inspiration & Anti-patterns cites only the legacy `/profile` screens). *Fix:* link them in Inspiration & Anti-patterns as "Replaced — legacy `/personal-settings` (parity reference only)", saying what each one shows.
- **low** The Foundation paragraph splits the key-screen list around a parenthetical, which makes it hard to see which mock settles which surface (EXPERIENCE.md Foundation, Visual identity). *Fix:* list the seven mocks plainly, grouped by module.

## 6. Bloat & overspecification — adequate

### Findings
- **low** "Profile-module layout choices PM1–PM11" is a decision log placed as a Component Patterns row. Most PM items are already stated in other rows, so it duplicates them (EXPERIENCE.md Component Patterns). *Fix:* move it to `.memlog.md` or Assumptions Index, and keep only the rules that aren't stated elsewhere (PM6, PM9, PM10).
- **low** The Account settings and Registered view label lists in Voice and Tone restate PRD FR-104/FR-116 and addendum §D (EXPERIENCE.md Voice and Tone). That is acceptable for copy extraction, so no action is needed unless the table becomes hard to scan.

## 7. Inheritance discipline — thin

### Findings
- **medium** The Profile-module glossary wasn't adopted. Foundation › Vocabulary lists only PP glossary terms. The spines call the Section "Account settings", but the PRD glossary term is "Personal Account Settings". Authenticator App, NPI / Personal NPI / Practice NPI, Provider Registration, Organization, Organization Type and Portal hand-off are used but not declared (EXPERIENCE.md Foundation). *Fix:* add the Profile glossary terms verbatim and pick one name for the Section.
- **medium** FR-107 parity isn't stated: the Primary **phone** picker lists Verified Mobile **and Landline**. EXPERIENCE says only "Selects listing Verified entries", and Contacts has the opposite rule ("Landlines can't be primary"), so a developer could reuse it (EXPERIENCE.md Account settings row). *Fix:* state the landline inclusion explicitly as a deliberate difference from Contacts, the same way the inline-notice difference is already called out.
- **medium** The update left stale "three confirms" wording. Confirm dialog now says "Only four", but Profile header says "not one of the three data confirms", Save all bar says "per the confirm-only-three rule", and Leave guard says "not one of the three data confirms" (EXPERIENCE.md Component Patterns). *Fix:* change all three to "four", or to "the named data confirms".
- **medium** The mobile dialog rule conflicts with the PRD. PRD §5.2 says "Dialogs become full-screen sheets on mobile", but DESIGN's Link authenticator dialog is "full width minus 16 px gutters", and EXPERIENCE Responsive says nothing (DESIGN.md "Link authenticator dialog"). *Fix:* either adopt full-screen for the `/account` dialogs, or record the deviation from the NFR, with a reason, in both spines.
- **low** The Info popover triggers differ from FR-116/FR-118 ("on hover or focus"). EXPERIENCE opens it on "keyboard focus + Enter". That is defensible, because a popover that opens on focus traps tab flow, but it isn't recorded as a deviation (EXPERIENCE.md Info popover row). *Fix:* add one line explaining why.
- **low** Copy differs from addendum §D: "Couldn't load results · Retry" vs "Couldn't load results. Try again.". The NPI field labels "Personal NPI number" / "Practice NPI number (optional)" also differ from FR-114's "Search for your personal NPI number…" (EXPERIENCE.md Voice and Tone "Provider registration"). *Fix:* mark these as approved UX copy deltas (PM1), so QA's parity checklist (SM-101) doesn't flag them.

## 8. Shape fit — adequate

Section order in DESIGN is canonical, and the Profile table sits correctly under Components. EXPERIENCE has all its required defaults. The problem is that the sections that cut across the app weren't updated for `/account`.

### Findings
- **medium** The Accessibility Floor has no Profile-module rules, though PRD §5.2/FR-111 require them. Missing: QR alt text ("QR code to link your authenticator app"), the OTP field's `autocomplete="one-time-code"` + `inputmode="numeric"`, combobox result announcements, the "+N" chip's accessible name listing the hidden types, and keyboard and touch access to the truncated org name's tooltip (the name isn't focusable). Also, `type-icon` has a 32 px target, which breaks the spine's own "44 × 44 for every control" floor if the icons are tooltip triggers (EXPERIENCE.md Accessibility Floor; DESIGN.md `type-icon.target`). *Fix:* add an `/account` bullet group, and make the type icons either 44 px targets or non-focusable, with their labels moved into the card's accessible description.
- **medium** Responsive & Platform has no `/account` rows: the org grid at 4/3/2/1 columns, the horizontally scrolling tab strip, MFA tiles in 3 columns, Create new organization stacking under search, and mobile dialogs. Interaction Primitives › Keyboard tab order still names the index and Save all, neither of which exists on `/account` (EXPERIENCE.md Responsive & Platform, Interaction Primitives). *Fix:* add `/account` rows and a per-page tab order.
- **low** DESIGN Shapes and Elevation weren't updated. `overflow-chip` uses `{rounded.full}`, which contradicts Shapes ("`rounded.full` only for avatar…" and the Ledger rule that chips use `{rounded.sm}`). `info-popover` (elevation-2) and `qr-dialog` aren't in the Elevation lists (DESIGN.md Shapes, Elevation & Depth). *Fix:* either make the chip `{rounded.sm}` or list it as an exception, and add both surfaces to Elevation.

## Mechanical notes

- Both spines' `sources` frontmatter resolves to the Profile PRD (EXPERIENCE also lists the addendum). DESIGN's `title`/`name` still say "Personal Profile"; consider "Personal Profile + Profile". EXPERIENCE lacks the `status-note` that DESIGN has.
- All `{…}` references in the new DESIGN rows and EXPERIENCE rows resolve to frontmatter tokens.
- There are no Mermaid blocks.
- FR coverage: FR-101..FR-120 are each cited at least once in IA, Component Patterns or Flows. FR-102's tenant-error copy and the internal-user part of FR-119 are only partly covered (see §4 and §3).
- Open Question 3 (icon set, PRD OQ4) is effectively answered by the DESIGN Organization card mapping. It can close once the design-system owners confirm.
- Severity counts: critical 0 · high 2 · medium 13 · low 12.
