---
title: "EXPERIENCE: Personal Profile (1health)"
status: final
created: 2026-10-13
updated: 2026-10-13
sources:
  - ../../prds/prd-personal-profile-2026-10-13/prd.md
  - ../../prds/prd-personal-profile-2026-10-13/addendum.md
  - ../../../../docs/DESIGN-SYSTEM.md
design: DESIGN.md
visual-reference: mockups/direction-c-ledger.html
key-screens:
  - mockups/key-personal-info-edit.html
  - mockups/key-addresses-edit.html
  - mockups/key-insurance.html
  - mockups/key-profile-picture.html
---

# EXPERIENCE: Personal Profile (1health)

## Foundation

- **Form factor:** responsive web, one surface, 360 px phone width up to desktop (FR-8, NFR-7). No native app.
- **UI system:** shadcn/ui + Tailwind v4 on 1health tokens (`components/ui/`, `app/globals.css`). This spine specifies only the behavioral delta; shadcn primitives keep their default behavior (Radix focus management, Escape to close, etc.).
- **Visual identity:** [DESIGN.md](DESIGN.md), Ledger direction. Composition reference: [`mockups/direction-c-ledger.html`](mockups/direction-c-ledger.html) (desktop Contacts tab with Phone read, Email edit, Social media empty; mobile top of page). Key-screen mocks, approved 2026-10-13 and linked from the patterns and flows they settle: [`mockups/key-personal-info-edit.html`](mockups/key-personal-info-edit.html), [`mockups/key-addresses-edit.html`](mockups/key-addresses-edit.html), [`mockups/key-insurance.html`](mockups/key-insurance.html), [`mockups/key-profile-picture.html`](mockups/key-profile-picture.html). **The spines (this file and DESIGN.md) win over every mock on conflict.** Known conflicts resolved here: Medical tab is selectable (mock shows it aria-disabled); empty values read "Not provided" (mock shows "—"); mobile Save all is a pill that hides with the keyboard (mock docks the bar); social empty copy follows Voice and Tone (mock copy differs).
- **Audience:** patients and providers equally; one register for both. Every read and write is the Launching user's own record.
- **Feel:** precise clinical dashboard: dense read view, roomier edit view, in-place editing.
- **Vocabulary:** PRD §3 Glossary terms are used verbatim (Section, Contact Point, Contact Type, Contact Label, Primary, Verified, Address, Signature, Profile Picture, Insurance Policy, Insurer, Masked SSN, Launching user). UI copy follows Voice and Tone (e.g. users never see "Contact Point").

## Information Architecture

One page per tab; each tab is one long page of Sections. No per-Section pages.

| Surface | Reached from | Contents / purpose | PRD |
|---|---|---|---|
| Launch | Portal sidebar **Personal Profile** | Exchanges launch payload, lands on Contacts | FR-1 |
| Invalid launch | Bad / expired / reused / unencrypted payload | Full-page message + "Return to 1health" | FR-1 |
| App bar | Always | Title + "Return to 1health" | FR-6 |
| Profile header | Above tabs, every tab | Profile Picture / initials, full name, primary phone + email (desktop), change picture | FR-9, FR-10 |
| Change profile picture dialog | Avatar button → file chosen | Preview of the chosen file, rules, Cancel / Save | FR-10 |
| Contacts tab `?tab=contacts` (default) | Tab strip, launch | Sections 01 Personal information `#personal` (incl. SSN, Signature row `#signature`) · 02 Phone `#phone` · 03 Email `#email` · 04 Social media `#social` · 05 Addresses `#addresses` | FR-11–FR-27 |
| Insurance tab `?tab=insurance` | Tab strip | One Section: Insurance Policy cards + Add insurance | FR-28–FR-31 |
| Insurance editor | Add insurance / card kebab Edit | Drawer (desktop) / full-screen page (mobile) | FR-29 |
| Card image viewer | Card thumbnail | Full-size front/back image | FR-31 |
| Medical tab `?tab=medical` | Tab strip | Quiet "Coming soon" panel, no API calls | FR-32 |
| Session expired | Failed refresh | Non-dismissable dialog + Return to 1health; draft kept | FR-2 |
| Draft restore | Relaunch with a stored draft | In-Section banner: restore or discard | FR-2 |

**Section index.** Desktop: sticky numbered left index (01–05) with entry counts; clicking scrolls to the Section and updates the hash; the item for the Section in view is `aria-current="location"` (scroll-spy). Mobile: "Jump to" select with the same numbers and targets. The Insurance tab has a single Section and shows no index or Jump to; its cards use the full main-column width.

**Deep links.** `?tab={contacts|insurance|medical}#{section}` opens the tab and scrolls to the Section (e.g. `?tab=contacts#signature` for 1health-fe's "set your signature" copy, which should deep-link here). Unknown tab → Contacts; unknown hash → top of tab. Tab and hash survive refresh (FR-3). Legacy `/profile?tab=N` links stay in 1health-fe (out of scope).

**Modal depth.** One level: a confirm dialog may open over the Insurance drawer; nothing opens over a dialog.

## Voice and Tone

Plain, precise, second person ("your primary phone"). No exclamation marks. No platform jargon: "contact point" and "precedence" stay out of sentences (the field label "Precedence" is fine). Explain a rule before the user hits it. Brand posture lives in DESIGN.md Brand & Style.

| Moment | Copy |
|---|---|
| Disabled Make primary (unverified) | "Verify this number first" / "Verify this email first" |
| Disabled Make primary (landline) | "Landlines can't be primary" |
| Disabled Remove (Primary) | "Make another phone primary first" / "…email…" / "…address…" |
| Disabled Remove (last entry) | "You need at least one phone" / "…email" / "…address" |
| Disabled Add (limit) | "You've reached the limit of 20 phones" |
| Phone footnote | "Changing your primary phone changes how you sign in." |
| Primary change confirm | Title "This changes how you sign in" · body "+1 (415) 551-2125 becomes your primary phone and sign-in number. Your current primary is relabeled Old." · buttons "Cancel" / "Make primary" |
| Remove Signature confirm | Title "Remove your signature?" · body "Documents you sign will no longer carry it." · "Cancel" / "Remove signature" |
| Delete insurance confirm | Title "Delete this insurance policy?" · body "{Insurer} {Type} Insurance will be removed from your profile." · "Cancel" / "Delete policy" |
| Locked email | "Locked. This is the address you sign in with." (Primary) · "Saved addresses can't be changed. Remove it and add a new one." (others) |
| Verify pending | "Link sent · Resend in 60 s" → "Resend verification" |
| Validation | "Enter a valid email address" · "This number is already on your profile" · "Enter a 10-digit US number" · "You must be 18 to 120 years old" |
| Section load error | "Couldn't load phones · Retry" |
| Empty Section | "No social links yet · Add link" · "No phones yet · Add phone" |
| Empty Insurance | "No insurance on file. Add a policy before your next visit." + "Add insurance" |
| Medical | "Coming soon: medications, allergies and conditions will appear here" |
| Not provided | "Not provided" |
| Unsaved | "Unsaved changes" · "{N} unsaved sections" · "Email has 1 field to fix" · "Save all (N)" · "Discard all" |
| Save success toast | "Phone saved." (names the Section, FR-7) |
| Save all partial | "2 saved, 1 failed" — never "All saved" unless every save succeeded |
| Network failure | "Couldn't save phone. Check your connection." + "Retry" |
| SSN | "Reveal" · "Hide" · "Hides in 30 s" · "This SSN belongs to another person" |
| Signature | "Draw your signature" · "Clear" · "Upload image instead" |
| Card image failed | "Image not uploaded · Retry upload" |
| Leave guard | Title "You have unsaved changes" · "Keep editing" / "Discard" / "Save" |
| Session expired | Title "Your session ended" · body "Your changes are kept on this device. Relaunch from 1health to continue." · "Return to 1health" |
| Draft restore | "You have unsaved changes from your last visit." · "Restore" / "Discard" |
| Draft conflict | "This section changed since your draft. Choose which version to keep." · column headers "Your version" / "Current" · "Keep mine" / "Use current" |
| Invalid launch | Title "This link has expired" · body "Open Personal Profile again from 1health." · "Return to 1health" |
| Optional field label | "{Label} (optional)" — required fields carry no marker |
| Personal information help | Other names: "Former or other legal names." · Gender identity: "Choose from the list or type your own." · Sexual orientation: "Up to 128 characters." |
| SSN help (edit) | Revealed: "Format XXX-XX-XXXX. Hides in 30 s. Clear it to remove your SSN." · Masked: "Type a new number to replace it." |
| Signature help (edit) | "Draw with a mouse, finger or pen, or upload a PNG or JPEG. Saved {date}." · pad cue "Draw your signature" |
| Address line 1 help | "Pick a suggestion to fill the rest and verify the address." |
| Address validation | "Enter a 5-digit ZIP code" |
| Removed draft row | Status "Removed on save" beside "Restore" |
| New row status | "New · not saved" |
| Change profile picture | Title "Change profile picture" · "Choose another file" · rules "JPG, PNG or BMP, up to 6 MB." · "Cancel" / "Save" |
| Picture too large | "{file name} is {size}. Choose a file up to 6 MB." · preview caption "Current picture · Not changed" |
| Insurer search | Help "Search the list, or add your insurer by name if it isn't there." · not found "Add “{name}”" |
| Primary policy demotion | "Only one primary {Type} policy. Make {insurer} secondary?" · button "Make {insurer} secondary" · note "The change saves with this policy." |
| Insurance dates help | "Expiration and cancellation must be after the effective date. Cancellation must be before expiration." |
| Subscriber | Heading "Subscriber" · "The person who holds this policy. Needed because the relationship isn't Self." · email help "Use {subscriber first name}'s email, not the one you sign in with." |
| Card images | "PNG or JPEG, up to 10 MB. Images upload after the policy saves." · "No image chosen" · "Choose {side} image" (e.g. "Choose back image") · "Replace" · "Remove" |

Strings lifted from the key-screen mocks were approved 2026-10-13. Every other string not quoted in .memlog.md or the PRD is draft copy for PM review.

## Component Patterns

Behavioral. Visual specs live in DESIGN.md Components (same names). Key-screen mocks are linked per row; the spines win over the mocks on conflict.

| Component | Behavioral rules |
|---|---|
| **App bar** | "Return to 1health" triggers the leave guard when any Section is dirty (FR-6), clears drafts on confirm (FR-2), then navigates to the portal. |
| **Profile header** | Name updates immediately after Personal information saves (FR-9). Avatar is a button ([`mockups/key-profile-picture.html`](mockups/key-profile-picture.html)): selecting it (click, Enter, Space) opens the file picker; the "Change profile picture" dialog opens once a file is chosen and previews it. Wrong type or size (JPG/PNG/BMP ≤ 6 MB) is caught before upload: the preview keeps the current picture, the error line names the file and its size, and Save is aria-disabled and points at the error (`aria-describedby`); "Choose another file" reopens the picker. "Save" uploads the picture; it replaces the avatar at once and focus returns to the avatar (FR-10). Escape or Cancel closes without changes. The dialog is the FR-10 preview step, not one of the three data confirms; focus and Escape behave as in Confirm dialog. |
| **Tabs** | shadcn Tabs: arrow keys move, Enter/Space activates, `?tab=` updated (FR-3). Switching away from a tab with dirty Sections opens the leave guard. Medical is a normal selectable tab with a "Coming soon" tag. |
| **Section index / Jump to** | Activating an item scrolls (smooth unless reduced motion), moves focus to the Section `h2`, updates the hash. Counts reflect saved entries. |
| **Section header** | "Edit" puts the whole Section table into edit mode; "Add {thing}" enters edit mode with one new empty row focused. Several Sections may be in edit mode at once (FR-4). |
| **Section table** | Read view by default. Edit view: inputs in cells, per-Section Cancel (reverts only this Section, no confirm) and Save (validates inline first, sends nothing if invalid, FR-4). "Unsaved changes" appears on the first change. After save: read view, success toast, auto-verify new mobile/email entries not labeled Home (FR-17, FR-21). Primary entry is always listed first (FR-15, FR-25). |
| **Key/value table** | Personal information. Edit view becomes a two-column Field | Value table with every FR-11 field ([`mockups/key-personal-info-edit.html`](mockups/key-personal-info-edit.html)). Field order, identical in read and edit view, with no group headings: Name prefix · First name · Middle name · Last name · Name suffix · Other names · Titles → Birth date · City of birth → Race · Ethnicity · Biological gender · Gender identity · Sexual orientation → SSN → Signature. Optional fields are labeled "(optional)"; required fields carry no marker. Mobile edit stacks each label above a full-width control (instead of the read view's 44 % Field \| Value split). Birth date carries age-rule help (FR-12). Email and phone are never fields here. Signature row hosts the Signature pad; SSN row hosts SSN entry. |
| **Row status badges** | Read-only. Verified status refreshes when the Section reloads (FR-17). Home-labeled rows show no verification status. |
| **Row actions + kebab** | Desktop inline actions appear on hover or focus-within; the kebab is always present and lists every action for the row (Verify / Resend verification, Make primary, Edit, Remove). Verify and Make primary act directly from the read view, without entering edit mode. In read view, "Edit" from a row opens the Section in edit mode focused on that row. "Remove" always switches the Section into edit mode with that row struck through + "Restore" (draft removal); nothing is deleted until Save. |
| **Make primary** | Confirm dialog ("This changes how you sign in") → saves that one change immediately (new Primary + old relabeled Old in one request), toast, notifications default On (FR-18, FR-19, FR-22, FR-23). Addresses: Make primary saves without a confirm (not a login identifier). |
| **Verify** | No confirm. Sends the link; row shows "Link sent · Resend in 60 s" counting down, then "Resend verification". |
| **Disabled action** | Stays focusable (`aria-disabled`), activation is a no-op, reason via Tooltip. Used for Make primary, Remove, Add at limit. |
| **Tooltip** | Opens on hover, keyboard focus and tap; closes on Escape, blur, or tap outside. Every disabled action has one. |
| **Inputs** | Inline validation on blur and on Save; errors announced and linked via `aria-describedby`. Phone: country picker, US 10 digits, duplicates rejected before save (FR-16). Email: valid + unique case-insensitive (FR-20). Address line 1 for US/CA/AU offers suggestions directly under the field; picking a complete one fills the rest and marks Verified (FR-26). |
| **Address edit row** | [`mockups/key-addresses-edit.html`](mockups/key-addresses-edit.html). In edit mode each address is a row with an expand/collapse chevron (`aria-expanded`). Collapsed (FR-26 one-line summary): the read-view columns reused — one-line address (line 1, line 2, city, state zip; country omitted when it is the user's default US, appended otherwise) · Primary chip · Address Type · Status · Remove. Expanded: one full-width row with a 4-column field grid — Address Type, Country, Set as primary / Address line 1, Address line 2 / City, County, State/Province, Zip. A new address opens expanded. "Set as primary" is a checkbox in the expanded row and applies on Section save; from read view, Make primary stays in the kebab (no confirm). Removing the Primary address stays aria-disabled ("Make another address primary first"). Mobile: stacked cards in the same container, expanded fields stacked full width; while the on-screen keyboard is open the suggestions show under line 1 and the Save all pill is hidden, returning when the keyboard closes. |
| **Save all bar / pill** | Present while N ≥ 1 dirty Sections, gone at N = 0 (FR-5). Save all validates every dirty Section first; any invalid → nothing sent, focus first invalid field, sub-line names it. Then saves Sections independently. Discard all reverts every dirty Section; it has no confirm, per the confirm-only-three rule. The mobile pill offers Save all only. |
| **Inline banner** | Load error: replaces that Section's rows, "Retry" reloads only that Section; other Sections unaffected (NFR-5). Info variant hosts draft restore / conflict. |
| **Skeleton** | Three rows per table while that Section loads; page shell, tabs, header frame and index render immediately; Sections load in parallel (NFR-4). |
| **Empty state** | One line + action; action opens edit mode with a new row (contacts) or the Insurance editor. |
| **Confirm dialog** | Only three: primary email/phone change, removing the Signature, deleting insurance. Focus starts on Cancel; Escape cancels; focus returns to the trigger. |
| **Leave guard** | Uses Confirm dialog visuals (`{components.confirm-dialog}`). On tab switch with dirty Sections or "Return to 1health": dialog "Keep editing / Discard / Save". On close/reload: the browser's native `beforeunload` prompt (FR-6). It is a navigation guard, not one of the three data confirms. |
| **Toast** | Polite live region; 5 s auto-dismiss, paused on hover/focus; error toasts with Retry persist until dismissed. |
| **Insurance card** | [`mockups/key-insurance.html`](mockups/key-insurance.html). Cards stack in a single column at every width. Kebab: Edit, Delete. Thumbnail opens the Card image viewer (FR-31). Missing image → "Retry upload" retries only the upload (FR-29). Deleted policy: no actions (FR-28). |
| **Insurance editor** | [`mockups/key-insurance.html`](mockups/key-insurance.html). Field order (drawer and mobile page): Insurer → Type + Precedence → demotion notice (when shown) → Relationship to the insured → Member ID + Group ID → Effective + Expiration dates → Cancellation date → Subscriber group → Card images (front, back). Insurer combobox searches the platform list; "Add “{name}”" when not found. Picking Primary while another policy of that type is Primary shows the inline notice "Only one primary {Type} policy. Make {insurer} secondary?" with a one-click "Make {insurer} secondary" button; the demotion saves with this policy (FR-29, UJ-2). Subscriber fields appear when relationship ≠ Self. Card images preview before upload. Header and footer stay in place while the body scrolls. Save: policy first, then images; closing (or Back on mobile) with changes triggers the leave guard. |
| **Signature pad** | Mouse, touch, pen. "Clear" empties the pad (draft); saving an empty pad over a saved Signature triggers the remove confirm (FR-14). "Upload image instead" accepts PNG/JPEG and replaces the drawing. Never stored in drafts. |
| **SSN reveal** | Reveal fetches the full SSN; auto-hides after 30 s, on blur, or when the browser tab is hidden (FR-13). In edit, typing auto-formats `XXX-XX-XXXX`. Never in drafts, storage or logs. |
| **Stacked row card** | Mobile form of a Section table row; same actions via kebab; tap on the card body does nothing (no hidden affordance). |
| **Card image viewer** | Dialog with the full-size image (front/back toggle), fetched via the session only; Escape closes, focus returns to the thumbnail. |
| **Focus** | Every interactive element shows `{components.focus-ring}` on `:focus-visible`; focus is never removed or trapped outside dialogs. |
| **Full-page message** | Single action; no retry of a used launch payload. |
| **Session expired dialog** | Non-dismissable: no close button, Escape and overlay click do nothing. Focus starts on "Return to 1health". The draft is written before the dialog opens. |
| **Draft conflict compare** | Per Section. For each changed field, "Your version" and "Current" side by side; then one choice for the whole Section: "Keep mine" (edit view with the draft) or "Use current" (draft dropped for this Section). |

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| Cold load | Whole page | Shell, header frame, tabs, index render at once; each Section shows its 3-row skeleton (`{components.skeleton-row}`) until its own data arrives (NFR-4). |
| Empty | Social media, any contact Section | Empty row: "No social links yet · Add link". |
| Empty | Insurance | Empty card + "Add insurance" (FR-28). |
| Empty | Medical | "Coming soon" panel, no calls (FR-32). |
| Empty value | Personal information field | "Not provided" (FR-11). |
| Load error | Any Section | Inline banner (`{components.inline-banner-error}`) "Couldn't load {section} · Retry"; others unaffected (NFR-5). |
| Validation error | Field | `{components.input-error}` border + `{components.help-text-error}` message below, before any request (FR-4); platform errors mapped next to the field, else at Section level (FR-7). |
| Dirty / unsaved | Section | `{components.unsaved-indicator}` "Unsaved changes" in the table footer; table outlined `{components.table-container-editing}`; Save all bar/pill counts it; leave guard armed (FR-4–FR-6). |
| Saving | Section | Save button shows a spinner and "Saving…", inputs read-only, Cancel disabled; other Sections stay usable. |
| Saved | Section | Read view, toast "{Section} saved.", draft cleared. |
| Save failed | Section | Stays in edit with the error at field or Section level + Retry (FR-7). |
| Partial Save all failure | Page | Succeeded Sections → read view; failed stay in edit with errors; toast "X saved, Y failed"; bar remains with N = failed count (FR-5). |
| Session expired | Page | When the token refresh fails on Save (or any request): drafts are written to localStorage (keyed to the user, 24 h; architecture AD-12), then the non-dismissable Session expired dialog "Your session ended" opens over the page (edits stay visible behind it) with "Return to 1health" (FR-2, UJ-5). |
| Draft restore | Section after relaunch | Info banner "You have unsaved changes from your last visit · Restore / Discard"; Restore opens edit with the draft (same user only, < 24 h). |
| Draft restore conflict | Section | Server changed since draft: banner "This section changed since your draft" with the Draft conflict compare; the user picks "Keep mine" or "Use current" for the Section. Never silent overwrite (FR-2). |
| Verify pending | Contact row | `{components.status-pending}` "Link sent · Resend in 60 s"; status updates on next Section refresh (FR-17). |
| Unverified Primary | Contact row | Keeps Primary chip and shows Verify (FR-18). |
| Disabled action | Row / Add | `{components.button-aria-disabled}` + `{components.tooltip}` reason (FR-16, FR-18, FR-27). |
| Limit reached | Add button | Disabled with "You've reached the limit of 20 {things}". |
| SSN revealed | SSN cell | Full value + `{components.countdown-ring}`; hides at 30 s / blur / tab hidden. |
| Image upload failed | Insurance card | Policy saved; thumbnail placeholder "Image not uploaded · Retry upload" (FR-29). |
| Deleted insurance | Insurance card | Muted card, `{components.chip-deleted}` "Deleted" chip, no actions; or removed from list, whichever the platform returns (FR-30). |
| Invalid launch | Page | Full-page message, "Return to 1health" (FR-1). |
| Offline / network failure | Section save or load | Error with Retry (FR-7); no offline queue. |
| Focus | All interactive | 2 px ring + glow (DESIGN.md `{components.focus-ring}`). |

## Interaction Primitives

- **Edit the whole table.** Section-level Edit; inputs appear in every editable cell; locked cells explain why. Save/Cancel per Section.
- **Draft row removal.** In edit mode, Remove on a saved row strikes it through (`{components.table-row-removed}`) and swaps the action for "Restore" until Save; no toast, no undo, no confirm. Removing a new unsaved row deletes it outright (nothing to restore). Remove from read view always switches the Section into edit mode first.
- **Act from read view.** Make primary and Verify act directly from the read view, each on its own; no Section edit mode.
- **Make primary with confirm.** Login identifiers (Primary email, Primary mobile) confirm with "This changes how you sign in". Addresses don't confirm.
- **Explain before failing.** Every unavailable action is aria-disabled with a tooltip reason (hover, focus, tap); never a hidden action and never an error after Save.
- **Save all.** One action across dirty Sections; validate all → send per Section → honest summary.
- **Leave protection.** beforeunload on close/reload; in-app guard on tab switch and Return to 1health.
- **Keyboard.** Tab order: app bar → header → tabs → index → Sections in order → Save all. Within a table, Tab moves through cells' controls in reading order; Escape in an edit table doesn't cancel (prevents accidental loss). Enter in an input doesn't submit the Section.
- **Pointer.** Hover reveals row actions on desktop only; touch relies on the kebab.
- **Banned:** hover-only affordances, bottom-sheet editors (edit stays in place), drag to reorder, toasts with undo for removals, confirm dialogs beyond the three named, auto-save.

## Accessibility Floor

Behavioral. Contrast lives in DESIGN.md Colors.

- **WCAG 2.1 AA** across every flow (NFR-2); every flow completable keyboard-only.
- **Focus** always visible (`{components.focus-ring}`); after Save, focus moves to the Section `h2` with the toast announcing; after a dialog, focus returns to the trigger; Save all with errors focuses the first invalid field.
- **aria-disabled pattern:** disabled actions stay focusable, `aria-disabled="true"`, `aria-describedby` → tooltip id; activation does nothing. Tooltip opens on focus.
- **Tabs:** `role=tablist/tab/tabpanel`, arrow keys, `aria-selected`. Section index is a `nav` with `aria-current="location"`.
- **Tables:** real `<table>` with `th`; actions have row-specific names ("More actions for +1 (415) 551-2125"). Stacked cards keep the same names.
- **Live regions:** toasts and "Unsaved changes" count are polite; validation errors are linked to fields with `aria-invalid`.
- **Status not by color:** icon + word on every status.
- **Reduced motion:** no smooth scroll, shimmer, row-action fade or countdown sweep; SSN shows "Hides in 30 s" text.
- **Signature alternative:** "Upload image instead" (PNG/JPEG) beside the pad; the pad has an accessible name and instructions (FR-14). Resolves PRD open question 5. Amends FR-14's no-alternative assumption only by offering upload; a typed signature stays out.
- **Targets:** 44 × 44 px minimum for every control, including kebab, in-cell buttons, Reveal, tabs and index items.
- **SSN:** reveal announces "Social Security number shown, hides in 30 seconds".

## Responsive & Platform

| Width | Behavior |
|---|---|
| ≥ 768 px | Sticky numbered index left; tables with columns; hover row actions + kebab; Save all sticky bottom bar; Insurance editor as right drawer; Personal information read as 4 columns. |
| < 768 px (to 360 px) | Index → "Jump to" select; Personal information read → one Field \| Value pair per row, edit → label above a full-width control per field; multi-column tables → stacked row cards (line 1 value + status, line 2 label + type, kebab right); editing stays in place in the same card (single row component, two layouts; no bottom sheet); header shows avatar + name only; Save all → page-anchored pill that hides while the on-screen keyboard is open; Insurance editor → full-screen page (back control, paired fields one per row, Cancel/Save pinned to the bottom); Insurance card thumbnails move below the key/value grid; Change profile picture dialog runs full width minus 16 px gutters. No horizontal scroll at 360 px (FR-8). |

Browsers: latest two Chrome, Edge, Safari, Firefox, iOS Safari, Android Chrome (NFR-7). Light theme default; dark supported through tokens.

## Inspiration & Anti-patterns

- **Chosen — Direction C Ledger:** tables, numbered index, hover actions + kebab, in-place editing.
- **Rejected — Direction A Chart** (ruled label/value grid, small-caps, text tags) and **Direction B Console** (dark sticky rail with status dots, stat tiles). Not to be reintroduced.
- **Replaced — legacy `/profile` screens** (`docs/design/NG-9020…NG-9026*.png`): reference for parity only, not for layout.

## Key Flows

### UJ-1. Maria switches to a new phone number

Maria, a patient, has a new mobile and wants appointment texts on it.

1. From the 1health portal sidebar she opens Personal Profile and lands signed in on Contacts (FR-1).
2. She picks "02 Phone" in the index; the Phone table shows her current Primary, Verified number.
3. She clicks "Add phone"; the table enters edit mode with a new row. She picks the country, types the number, chooses the Contact Label "Personal" and type Mobile (FR-16).
4. Save. Toast "Phone saved."; the row shows Not verified and "Link sent · Resend in 60 s" (FR-17).
5. She taps the SMS link; back in the app, the Phone Section refreshes and the row shows Verified.
6. She opens the row's kebab → "Make primary". Dialog: "This changes how you sign in." She confirms (FR-18).
7. **Climax:** the new number moves to the top with the Primary chip, Verified, Notifications On (FR-19); the old one now reads "Old".
8. Optional: Remove from the old row's kebab (the Section switches to edit; strikethrough + Restore) → Save.

Failure / edge: before verifying, "Make primary" is aria-disabled; focus or tap shows "Verify this number first", and Verify sits next to it to resend. Duplicate number → inline "This number is already on your profile" before any request.

### UJ-2. Jordan adds their spouse's insurance before a visit

Jordan, a patient, moved to their spouse's plan. Key screen: [`mockups/key-insurance.html`](mockups/key-insurance.html).

1. Jordan opens `?tab=insurance`; their current Medical policy card shows the Primary chip.
2. "Add insurance" opens the drawer (full-screen on phone).
3. They search the Insurer; it isn't listed, so they pick "Add “{name}”" (FR-29).
4. They enter member ID, group ID, effective date; type Medical, precedence Primary, relationship Spouse.
5. The editor notes "Only one primary Medical policy. Make {old insurer} secondary?" and they click "Make {old insurer} secondary"; the demotion saves with the new policy.
6. Subscriber fields appear; they fill them and add front and back card photos, each previewed.
7. Save: policy saves, images upload, drawer closes, toast "Insurance saved."
8. **Climax:** the new card shows the Primary chip and both card thumbnails; the old policy reads Secondary.

Failure / edge: back image upload fails → policy stays saved, card shows "Image not uploaded · Retry upload". Subscriber email equal to Jordan's login email → inline error.

### UJ-3. Dr. Patel sets up their signature

Dr. Patel, a newly registered provider, follows the 1health-fe link `?tab=contacts#signature`. Key screen: [`mockups/key-personal-info-edit.html`](mockups/key-personal-info-edit.html).

1. The page opens scrolled to Personal information with the Signature row in view.
2. They click "Edit"; the table becomes a Field | Value form.
3. They check legal name and titles (FR-12).
4. In the Signature row they draw on the pad (or choose "Upload image instead").
5. Save. Toast "Personal information saved."
6. **Climax:** the Signature row shows the new thumbnail with "Added {today}"; documents they sign will carry it.

Failure / edge: pressing "Clear" and then Save over a saved Signature → "Remove your signature? Documents you sign will no longer carry it." Cancel keeps it; confirm removes it.

### UJ-4. Sam moves house

Sam, a patient, has a new home address. Key screen: [`mockups/key-addresses-edit.html`](mockups/key-addresses-edit.html).

1. Sam picks "05 Addresses" and clicks "Add address".
2. The new address row opens expanded; they choose Address Type Home and country United States, then start typing line 1; suggestions appear.
3. They pick a complete suggestion; city, state and zip fill in and the row is marked Verified (FR-26).
4. Save. Toast "Addresses saved."
5. From the new row's kebab they choose "Make primary" (no confirm; FR-27).
6. They Remove the old address from its kebab (the Section switches to edit; strikethrough + Restore), Save.
7. **Climax:** one address, Primary chip, Verified.

Failure / edge: if Sam tries to remove the current Primary first, Remove is aria-disabled with "Make another address primary first".

### UJ-5. The session expires mid-edit

Maria (from UJ-1) is editing Email, leaves for lunch, and comes back. Maria is the protagonist; the PRD names "any user".

1. She clicks "Save" on the Email Section.
2. The refresh fails; a non-dismissable dialog appears: "Your session ended. Your changes are kept on this device." Her draft is stored (no SSN or Signature) (FR-2).
3. She clicks "Return to 1health" and relaunches Personal Profile.
4. The Email Section shows "You have unsaved changes from your last visit · Restore / Discard".
5. She clicks Restore; the Section opens in edit with her new address filled in.
6. **Climax:** she saves; toast "Email saved."; draft cleared.

Failure / edge: the Email list changed on the server meanwhile → "This section changed since your draft"; each changed field shows "Your version" and "Current" side by side; she picks "Keep mine" or "Use current" for the Section.

## Open Questions

1. **Save all order** with Primary switches and auto-verify (PRD OQ 4, Architecture).
2. **"Last updated" meta** in the profile header: is it backed by data? It appears only in the direction mock; the key-screen mocks omit it.

## Assumptions Index

All former `[ASSUMPTION]` tags in this file and DESIGN.md were approved by the user as defaults (2026-10-13) and are now plain decided text. All former `[PENDING MOCK]` items (Address edit layout and collapsed row, Insurance tab layout, drawer and thumbnails, Profile Picture change UI, Personal information field order) were settled by the key-screen mocks, approved 2026-10-13 (layout choices F1–F4, L1–L4, I1–I6, P1–P3), and are now plain decided text.

## Architecture amendments (2026-10-13)
- **Inside the portal iframe**, the app-bar "Return to 1health" is hidden, because the portal's navigation is the exit. The session-expired dialog's action reads "Close and reopen from 1health". (Architecture AD-5)
- **Automatic logoff:** the session ends after 15 minutes without activity or 8 hours after launch. A warning appears 60 s before the idle limit: "You'll be signed out in 1 minute" · **Stay signed in**. (Architecture AD-16)
