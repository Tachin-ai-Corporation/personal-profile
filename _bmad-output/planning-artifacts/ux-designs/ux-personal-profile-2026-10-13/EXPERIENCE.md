---
title: "EXPERIENCE: Personal Profile (1health)"
status: final
created: 2026-10-13
updated: 2026-10-13
sources:
  - ../../prds/prd-personal-profile-2026-10-13/prd.md
  - ../../prds/prd-personal-profile-2026-10-13/addendum.md
  - ../../../../docs/DESIGN-SYSTEM.md
  - ../../prds/prd-profile-account-2026-10-13/prd.md
  - ../../prds/prd-profile-account-2026-10-13/addendum.md
design: DESIGN.md
visual-reference: mockups/direction-c-ledger.html
key-screens:
  - mockups/key-personal-info-edit.html
  - mockups/key-addresses-edit.html
  - mockups/key-insurance.html
  - mockups/key-profile-picture.html
  - mockups/key-account.html
  - mockups/key-provider-registration.html
  - mockups/key-organizations.html
---

# EXPERIENCE: Personal Profile (1health)

## Foundation

- **Form factor:** responsive web, one surface, 360 px phone width up to desktop (FR-8, NFR-7). No native app.
- **UI system:** shadcn/ui + Tailwind v4 on 1health tokens (`components/ui/`, `app/globals.css`). This spine specifies only the behavioral delta; shadcn primitives keep their default behavior (Radix focus management, Escape to close, etc.).
- **Visual identity:** [DESIGN.md](DESIGN.md), Ledger direction. Composition reference: [`mockups/direction-c-ledger.html`](mockups/direction-c-ledger.html) (desktop Contacts tab with Phone read, Email edit, Social media empty; mobile top of page). Key-screen mocks, approved 2026-10-13 and linked from the patterns and flows they settle:
  - Personal Profile: [`mockups/key-personal-info-edit.html`](mockups/key-personal-info-edit.html), [`mockups/key-addresses-edit.html`](mockups/key-addresses-edit.html), [`mockups/key-insurance.html`](mockups/key-insurance.html), [`mockups/key-profile-picture.html`](mockups/key-profile-picture.html).
  - Profile module (`/account`): [`mockups/key-account.html`](mockups/key-account.html), [`mockups/key-provider-registration.html`](mockups/key-provider-registration.html), [`mockups/key-organizations.html`](mockups/key-organizations.html).
- **Spines win.** This file and DESIGN.md win over every mock on conflict. Known conflicts resolved here:
  - Direction mock: the Medical tab is selectable (mock shows it aria-disabled); empty values read "Not provided" (mock shows "—"); mobile Save all is a pill that hides with the keyboard (mock docks the bar); social empty copy follows Voice and Tone (mock copy differs).
  - Profile mocks: they don't draw the Base-MFA-off notice, the Disable confirm, a partial-save failure, QR loading, the full-screen mobile Link authenticator dialog, the registration error banner, the NPI zero-results row or the internal-user empty state, all of which are specified here.
- **Audience:** patients and providers equally; one register for both. Every read and write is the Launching user's own record.
- **Feel:** precise clinical dashboard: dense read view, roomier edit view, in-place editing.
- **Vocabulary:** PRD §3 Glossary terms are used verbatim (Section, Contact Point, Contact Type, Contact Label, Primary, Verified, Address, Signature, Profile Picture, Insurance Policy, Insurer, Masked SSN, Launching user). Profile-module glossary terms are used verbatim too: Profile module, Personal Account Settings (the Section; its heading reads "Personal account settings"), Primary Email / Primary Phone, Preferred Language, Default Time Zone, Preferred Locale, Authenticator App, MFA, NPI / Personal NPI / Practice NPI, Provider Registration, Organization, Organization Type, Portal hand-off. UI copy follows Voice and Tone (e.g. users never see "Contact Point").

## Information Architecture

One page per tab; each tab is one long page of Sections. No per-Section pages.

| Surface | Reached from | Contents / purpose | PRD |
|---|---|---|---|
| Launch | Portal **Apps** launcher tile **Personal Profile** (opens the app top-level in its own tab) | Exchanges launch payload, always lands on `/` (Personal Profile, Contacts tab) | FR-1, PRD FR-102 |
| Invalid launch | Bad / expired / reused / unencrypted payload, on `/` or `/account` | Full-page message + "Return to 1health" | FR-1 |
| Wrong tenant | Launch that arrives in a non-default tenant, on `/` or `/account` (`/launch-error?reason=tenant`, AD-6) | Full-page message with module-neutral copy + "Return to 1health" | FR-1, PRD FR-102, AM-3 |
| App bar | Always, on `/` and `/account` | Wordmark + page nav **Personal Profile** (`/`) · **Account** (`/account`), current one `aria-current="page"` + "Return to 1health" | FR-6, PRD FR-102 |
| Profile header | Above tabs, every tab | Profile Picture / initials, full name, primary phone + email (desktop), change picture | FR-9, FR-10 |
| Change profile picture dialog | Avatar button → file chosen | Preview of the chosen file, rules, Cancel / Save | FR-10 |
| Contacts tab `?tab=contacts` (default) | Tab strip, launch | Sections 01 Personal information `#personal` (incl. SSN, Signature row `#signature`) · 02 Phone `#phone` · 03 Email `#email` · 04 Social media `#social` · 05 Addresses `#addresses` | FR-11–FR-27 |
| Insurance tab `?tab=insurance` | Tab strip | One Section: Insurance Policy cards + Add insurance | FR-28–FR-31 |
| Insurance editor | Add insurance / card kebab Edit | Drawer (desktop) / full-screen page (mobile) | FR-29 |
| Card image viewer | Card thumbnail | Full-size front/back image | FR-31 |
| Medical tab `?tab=medical` | Tab strip | Quiet "Coming soon" panel, no API calls | FR-32 |
| Session expired | Failed refresh | Non-dismissable dialog + Return to 1health; draft kept | FR-2 |
| Draft restore | Relaunch with a stored draft | In-Section banner: restore or discard | FR-2 |
| **Account page `/account`** | App-bar **Account** item; or direct URL `/account?tab=…` with an existing session (no session → launch-error screen). The 1health-fe user menu is not wired here (it keeps opening legacy `/personal-settings`) | Same app bar (Account active) and profile header; tab strip of three; no section index | FR-101, FR-102 |
| Personal Account `?tab=personal` (default) | Menu "Profile", tab strip | Sections: Personal Account Settings (heading "Personal account settings") `#account` · Authenticator app `#authenticator` | FR-104–FR-112 |
| Link authenticator dialog | Authenticator tile | QR + 6-digit code | FR-111 |
| Disable authenticator confirm | "Disable" | Confirm dialog | FR-112 |
| Individual Provider Registration `?tab=provider` | Menu "Provider registration", tab strip | One Section "Healthcare credentials": search form (unregistered) or registered view | FR-113–FR-116 |
| My Organizations `?tab=organizations` | Menu "My organizations", tab strip | Search, card grid, pagination, empty states | FR-117–FR-119 |
| Info popovers | Provider (i), Practice name, (i) on an organization card | Registration explainer, practice support contact, Primary contact | FR-114, FR-116, FR-118 |
| Portal hand-off | Enter portal, Register your practice, Create new organization, Register organization (internal users) | Leaves the app: same tab, after the leave guard (the app is never framed) | FR-116, FR-119, FR-120 |
| Checkout site | Register organization (regular users) | `learnmore.1health.io/product-checkout` in a new tab | FR-119 |
| No-access panel | Any `/account` tab or Section on 403 | "You don't have access to this in your current account" | FR-103 |

**Section index.** Desktop: sticky numbered left index (01–05) with entry counts; clicking scrolls to the Section and updates the hash; the item for the Section in view is `aria-current="location"` (scroll-spy). Mobile: "Jump to" select with the same numbers and targets. The Insurance tab has a single Section and shows no index or Jump to; its cards use the full main-column width.

**Deep links.** `?tab={contacts|insurance|medical}#{section}` opens the tab and scrolls to the Section (e.g. `?tab=contacts#signature`). Direct URLs work only with an existing session; otherwise the launch-error screen shows. 1health-fe adds no deep links (no 1health-fe changes). Unknown tab → Contacts; unknown hash → top of tab. Tab and hash survive refresh (FR-3). Legacy `/profile?tab=N` links stay in 1health-fe (out of scope).

**`/account` deep links.** `/account?tab={personal|provider|organizations}#{account|authenticator}`; unknown tab → Personal Account. In-app links between pages: the Account settings helper "personal profile" → `/?tab=contacts#email` (or `#phone`); the registered-view signature help → `/?tab=contacts#signature`. These are plain in-app navigations (leave guard applies), not new launches. Pages are switched with the app-bar nav (**Personal Profile** / **Account**); each page keeps its own tabs. A direct `/account` URL needs an existing session; there are no 1health-fe user-menu deep links (the menu keeps opening legacy `/personal-settings`).

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
| Account settings — heading | "Personal account settings" |
| Account settings — locked | Username: "Your username can't be changed here." · Password: "Password changes aren't available here." |
| Account settings — primary picker disabled | "Please add additional verified email(s) in your personal profile to change your current primary contact email" (phone variant: "phone(s)" / "phone") |
| Account settings — first-change notice | Email: "Changing your primary email will result in updating your login credentials. The next time you login you will have to use the new email." · Phone: "Changing your primary phone will result in updating your notification preferences." |
| Account settings — validation | "First name is required" / "Last name is required" · "First name can be up to 24 characters" / "Last name can be up to 24 characters" · "Birth date is required" · "Enter a date as MM/DD/YYYY" · "You must be between 18 and 120 years old" (Proctor role: "You must be between 21 and 120 years old") · "Primary phone is required" · "Invalid email address" · "Select a preferred language" · "Select a time zone" · "Select a locale" |
| Account settings — save | "Personal account updated successfully" · "There are no changes" · partial: "{Part} was not saved. {platform message}" |
| Birth date help (account) | "Your date of birth is an important identifying factor throughout the healthcare industry. Additionally, 1health requires all users to be over the age of 18." (Tooltip of the "?" button beside the Birth date label, edit view only) · button name "About birth date" |
| Authenticator — intro | "Link an authenticator app to get sign-in codes on your phone." · status "Enabled" / "Not set up" · linked caption "Disable the current authenticator to link another" |
| Authenticator — dialog | Title "Link your {App} authenticator" · QR alt text "QR code to link your authenticator app" · "Use the {App} authenticator app installed on your device to scan this QR, then provide the code generated by the app in the field below." · label "6-digit code" · "Enter the 6-digit code" · "Invalid code. Try again." · "Cancel" / "Submit" · toast "{App} authenticator linked" |
| Authenticator — disable | Title "Turn off authenticator app?" · "You'll no longer be asked for a code from your authenticator app when you sign in." · "Cancel" / "Turn off" · toast "Authenticator app disabled" |
| Authenticator — base MFA off | "Your account doesn't have multi-factor authentication turned on, so an authenticator app can't be linked yet. Contact support." |
| Provider registration | Instruction "Please find your provider and NPI information to continue…" · labels "Search for your personal NPI number" / "Search for your practice's (hospital, clinic, lab, etc.) NPI Number (optional)" · placeholder "Search by NPI or name" · "Searching…" · "Couldn't load results. Try again." · "No more results" · zero results "No matching NPI found" · "Personal NPI is required" · taken: "This personal NPI is already registered. Check that you selected your own." / "This practice NPI is already registered. Check that you selected the right practice." · toast "Provider NPI registered" / "Provider and practice NPIs registered" · fallback "There was an error in the registration. Please call 1-888-555-1212 for assistance." (inline error banner, not a toast) |
| Provider (i) popover | "Registering links your 1health account to your NPI from the national provider registry. Adding your practice's NPI is optional. Once registered, it can't be changed here." |
| Account settings labels | "First name" · "Last name" · "Username" · "Password" · "Primary email address" · "Primary phone number" · "Birth date" · "Preferred language" · "Default time zone" · "Preferred locale for date, time, and currency" |
| Registered view labels | "NPI" · "Taxonomy" · "Health Information Exchange" · "Practice name" · "Practice address" · "Practice NPI" · "Licenses" · "Address of practice" · "Signature" |
| Registered view | "This organization already exists - please contact their support to be added to their portal." · Signature help Tooltip "The signature can be changed from the Personal Profile" ("?" button name "About the signature") · link "Personal Profile" · "No signature available" · "Register your practice to enable ordering" |
| My Organizations | Placeholder "Search organizations" · "Sorry, no results were found" · disabled "You're disabled in this organization" · popover title "Primary contact" · "Enter portal" · empty "You aren't managing any organizations yet" / "Register an organization with 1health to unlock the platform features listed below" · "Register organization" · "Create new organization" · type Tooltip labels per DESIGN.md Organization Type map (Health Provider → "Healthcare"; n/a → "No types selected for this organization") |
| My Organizations — feature rows | Lab "Add your tests offered and enable order management." · Healthcare "Order tests, get results, and manage your patients." · Supplier "Provide fulfillment and logistics for collection devices." · Go To Market "Create and sell test products." |
| No access (/account) | "You don't have access to this in your current account" |
| Load error (/account) | "Something went wrong while loading profile information · Retry" |
| Not provided | "Not provided" |
| Unsaved | "Unsaved changes" · "{N} unsaved sections" · "Email has 1 field to fix" · "Save all (N)" · "Discard all" |
| Save success toast | "Phone saved." (names the Section, FR-7); Account settings: "Personal account updated successfully" |
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
| Wrong tenant | "This is available in your personal account. Switch to it in 1health and open it again." (module-neutral, both pages; PRD AM-3) · "Return to 1health" |
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

Behavioral. Visual specs live in DESIGN.md Components under the same names. Key-screen mocks are linked per row; the spines win over the mocks on conflict.

| Component | Behavioral rules |
|---|---|
| **App bar** | Page nav: **Personal Profile** → `/`, **Account** → `/account` (default tab; each page keeps its own tab state in its URL). Selecting the other page runs the leave guard when the current page has a dirty Section; selecting the current page does nothing. Items are links in a `nav` labeled "Pages", current one `aria-current="page"`. "Return to 1health" triggers the leave guard when any Section is dirty (FR-6), clears drafts on confirm (FR-2), then navigates to the portal. |
| **Profile header** | Name updates immediately after Personal information saves (FR-9) and after Account settings saves (PRD FR-109). Avatar is a button ([`mockups/key-profile-picture.html`](mockups/key-profile-picture.html)): selecting it (click, Enter, Space) opens the file picker; the "Change profile picture" dialog opens once a file is chosen and previews it. Wrong type or size (JPG/PNG/BMP ≤ 6 MB) is caught before upload: the preview keeps the current picture, the error line names the file and its size, and Save is aria-disabled and points at the error (`aria-describedby`); "Choose another file" reopens the picker. "Save" uploads the picture; it replaces the avatar at once and focus returns to the avatar (FR-10). Escape or Cancel closes without changes. The dialog is the FR-10 preview step, not one of the four data confirms; focus and Escape behave as in Confirm dialog. On `/account` the header is the same component; it refreshes after an Account settings save. |
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
| **Save all bar / pill** | Present while N ≥ 1 dirty Sections, gone at N = 0 (FR-5). Save all validates every dirty Section first; any invalid → nothing sent, focus first invalid field, sub-line names it. Then saves Sections independently. Discard all reverts every dirty Section; it has no confirm (see Confirm dialog: only four confirms). The mobile pill offers Save all only. |
| **Inline banner** | Load error: replaces that Section's rows, "Retry" reloads only that Section; other Sections unaffected (NFR-5). Info variant hosts draft restore / conflict. |
| **Skeleton** | Three rows per table while that Section loads; page shell, tabs, header frame and index render immediately; Sections load in parallel (NFR-4). |
| **Empty state** | One line + action; action opens edit mode with a new row (contacts) or the Insurance editor. |
| **Confirm dialog** | Only four: primary email/phone change (Contacts), removing the Signature, deleting insurance, turning off the authenticator app (`/account`). Account settings' Primary email/phone change uses the inline notice instead (PRD FR-107, parity; deliberate difference from Contacts). Focus starts on Cancel; Escape cancels; focus returns to the trigger. Below 768 px confirm dialogs stay centered with 16 px gutters; they never go full-screen (only the Link authenticator dialog does). |
| **Leave guard** | Uses Confirm dialog visuals (`{components.confirm-dialog}`). On tab switch, app-bar page switch (Personal Profile ↔ Account) with dirty Sections, or "Return to 1health": dialog "Keep editing / Discard / Save". On close/reload: the browser's native `beforeunload` prompt (FR-6). It is a navigation guard, not one of the four data confirms. |
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

### Profile module (`/account`)

Same names as DESIGN.md Profile module (/account) components. Shared shell rules above (App bar, Profile header, Tabs, Tooltip, Confirm dialog, Leave guard, Toast, Focus) apply unchanged.

| Component | Behavioral rules |
|---|---|
| **Account settings (key/value)** | [`mockups/key-account.html`](mockups/key-account.html). The Personal Account Settings Section (heading "Personal account settings", Section id `account`, draft key `account`). Same Edit → Cancel/Save model as other Sections; no Save all bar on `/account`. **Names:** required, 1–24 characters after trimming. **Birth date:** required, a valid MM/DD/YYYY date; the user must be 18–120 years old, or 21–120 with the Proctor role; the picker's range enforces the same limits. A birth date that fails the age rule reads "Not provided" in the read view (PRD FR-104). **Birth date help:** in edit view only, a "?" icon button ("About birth date") right after the Birth date label opens a Tooltip with the Birth date help (hover, keyboard focus, tap; Escape closes); the read view shows no help (parity, PRD FR-105). **Primary email address / Primary phone number** are Selects. The email Select lists Verified Email entries. **The phone Select lists Verified Mobile and Verified Landline entries** (PRD FR-107, parity): this deliberately differs from Contacts, where landlines can't be primary, so don't reuse the Contacts filter. The current Primary is always the selected value, even if unverified; it isn't sent unless changed and doesn't count as an option. With no other Verified option the Select is aria-disabled and shows the helper link. On the first change of each Select, the inline notice appears under it and stays until Save or Cancel (no confirm dialog; see Confirm dialog). With no Primary phone at all, Save shows "Primary phone is required". **Regional preferences:** a blank language or time zone shows "Select a value" and must be picked before Save ("Select a preferred language" / "Select a time zone" / "Select a locale" at the field). A stored value that isn't on the list shows its label when known, otherwise the raw code; it passes the required check and is sent only if the user picks a new value. Preferred locale shows "English - United States" when nothing is stored, and is sent only when changed. **Save:** with no changes, "There are no changes" and the Section stays in edit mode. Otherwise only changed parts are sent; on full success the toast reads "Personal account updated successfully", the Section returns to the read view, and the profile header refreshes (name, primary phone, primary email). On partial failure the Section stays in edit mode and names the failed part; the parts that succeeded become the baseline, so Save again re-sends only what failed (PRD FR-109). |
| **Authenticator app section** | [`mockups/key-account.html`](mockups/key-account.html). Each tile is a button "Link {App}". Not linked: activating a tile requests a QR; while it loads the tile shows a spinner and the other tiles are aria-disabled. On success the Link authenticator dialog opens; on "MFA not enabled" the Base-MFA-off notice appears and focus moves to it. Linked: status "Enabled" and "Disable"; tiles are aria-disabled with the caption as their reason (Tooltip too). "Disable" opens the Disable authenticator confirm. |
| **Link authenticator dialog** | Focus starts on the code field. The QR image has the alt text "QR code to link your authenticator app". The code field is a single labeled input with `inputmode="numeric"`, `autocomplete="one-time-code"`, digits only, max 6, and no placeholder. Submit is always enabled; fewer than 6 digits → inline "Enter the 6-digit code", no request. Wrong code → inline "Invalid code. Try again.", field cleared, focus stays. Correct → dialog closes, toast, Section status refreshes, focus to the Section `h2`. Cancel / Escape / close → no change, status refreshes, focus returns to the tile. The QR is never re-requested while the dialog is open; reopening gets a fresh QR. The QR image is dropped when the dialog closes; the QR and the code are never stored in drafts, logs or telemetry. Below 768 px the dialog is full-screen (PRD responsive NFR); it is the only `/account` dialog that does. |
| **Disable authenticator confirm** | One of the four confirms (see Confirm dialog). "Turn off" disables TOTP, toast "Authenticator app disabled", status refreshes; focus returns to the Section `h2` (the Disable button is gone). Cancel or Escape changes nothing and returns focus to "Disable". Below 768 px it stays a centered dialog with 16 px gutters. |
| **Base-MFA-off notice** | Shown in the Authenticator app section when the platform reports MFA isn't enabled for the user; no dialog opens. Tiles stay enabled; each activation shows the notice again and moves focus to it. |
| **Healthcare credentials section** | [`mockups/key-provider-registration.html`](mockups/key-provider-registration.html). On load it reads the current Provider Registration and shows a skeleton until it knows which body to render: no Personal NPI → search form (NPI combobox ×2 + Register); otherwise the Registered view. The header (i) opens the provider Info popover. |
| **NPI combobox** | WAI-ARIA combobox with a listbox popup. Opens on focus or typing (empty → first page); debounced 600 ms; 10 per page, infinite scroll with a "Searching…" row; the result count is announced politely. Arrow keys move, Enter selects, Escape closes, × clears. Each option shows two lines, and its accessible name is the full PRD string (individual: "{NPI}, {First} {Last}, {City}, {State}"; practice: "{NPI}, {Organization name}, {Address line 1}, {City}, {State}"). The selected value shows that full string. Type-locked: the personal field searches individuals only, the practice field organizations only. A failed search shows the row "Couldn't load results. Try again."; "Try again." retries the same query. A search with zero results shows the single non-selectable row "No matching NPI found" (announced politely). NPI selections are never stored in drafts. |
| **Register** | Validates Personal NPI on blur and on click ("Personal NPI is required"). Then checks whether each selected NPI is already registered; a taken NPI shows its own message under its own field and nothing is sent. Then registers directly (no confirm). In flight the button shows "Registering…" and is disabled, so a double click sends once. On success: toast, the Section swaps to the Registered view and focus moves to its `h2`. On error: the platform message, or the phone-number fallback when there is none, in an inline error banner (`{components.inline-banner-error}`) inside the Healthcare credentials Section, not a toast; it stays until the next Register attempt, which clears it. |
| **Registered view** | Read-only; no edit or unregister. "n/a" or -1 reads "Not provided". **Practice name** is an Info popover trigger (support contact) only when the practice is a 1health Organization; otherwise it is plain text. Below the table, exactly one of these or neither: "This organization already exists…" when the practice is a 1health Organization the user doesn't belong to; or "Register your practice to enable ordering" when the Practice NPI is verified and not yet claimed by an Organization. That button is a Portal hand-off to organization creation. The Signature help is a "?" icon button ("About the signature") with the Tooltip "The signature can be changed from the Personal Profile" (hover, focus, tap), followed by the in-app link "Personal Profile" to `/?tab=contacts#signature` (leave guard applies). |
| **Info popover** | Used for the provider (i), Practice name (support contact) and the organization card (i) (Primary contact). A non-modal Popover (not a Tooltip, because it holds content and links). Opens on hover, keyboard focus or click/tap (PRD FR-116, FR-118); hover-open waits 150 ms so passing the pointer over doesn't flash it. Closes on Escape, blur (focus leaves both trigger and popover) or an outside click; Escape returns focus to the trigger. Opening on focus doesn't move focus: Tab from the trigger goes into the popover's links, then on through the page. Opens below its trigger. The trigger has `aria-expanded` and `aria-controls`; the content is reachable by screen readers. |
| **Organization search** | [`mockups/key-organizations.html`](mockups/key-organizations.html). Server search, debounced 500 ms, resets to page 1; results announce "{N} organizations" politely. "Create new organization" shows only for internal users (`@1health.io`, `@tachin.ai` emails) and is a Portal hand-off to organization creation. |
| **Organization card** | Shows the short name, falling back to the name; the full name is in the DOM (CSS ellipsis), so screen readers read it whole, and a Tooltip shows it on hover. Type icons: at most 4, ordered Lab, Health Provider, Supplier, Go To Market, then the rest alphabetically; each icon is focusable and opens its Tooltip label (DESIGN.md Organization Type map) on hover, focus or tap. The "+N" chip is focusable; its Tooltip and accessible name list the hidden types alphabetically (e.g. "2 more types: Insurance, Population Health"). An unknown type gets the generic icon and never breaks the card. (i) opens the Primary contact Info popover. Disabled organization: Enter portal is aria-disabled with "You're disabled in this organization". |
| **Pagination** | 12 cards per page, sorted by name within the page. Shown whenever there are results, even with a single page. "Previous" is aria-disabled on page 1 and "Next" on the last page (both on a single page). Changing page scrolls to the top of the grid and moves focus to the first card's name. |
| **Organizations empty state** | "No organizations" shows only when the list returns `totalElements === 0` with no search text. With search text, zero results show "Sorry, no results were found" with no pagination. Regular users: "Register organization" opens `https://learnmore.1health.io/product-checkout` in a new tab (no leave guard; the app stays open). Internal users: the same button is a Portal hand-off to organization creation, and "Create new organization" also shows next to search. |
| **Portal hand-off** | Applies to Enter portal, Register your practice to enable ordering, Create new organization and the internal Register organization. The app always runs top-level in its own tab: the leave guard runs if Account settings is dirty, then the same tab navigates. No new-tab branch. The URL is built from the configured portal origin plus a numeric tenant id. The app never calls the platform tenant switch. |
| **No-access panel** | On a 403, it replaces the content of the affected tab or Section with "You don't have access to this in your current account"; no action, no raw error. Other tabs and Sections keep working. |
| **Skeletons (/account)** | A tab loads only when it's opened; its skeletons show until its own data arrives. Shell, header and tab strip render immediately. |

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
| Saved | Section | Read view, toast "{Section} saved." (Account settings: "Personal account updated successfully"), draft cleared. |
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
| Wrong tenant | Page (`/` or `/account`) | Full-page message with the module-neutral copy; no session, no data fetched (AD-6, PRD AM-3). |
| Offline / network failure | Section save or load | Error with Retry (FR-7); no offline queue. |
| Focus | All interactive | 2 px ring + glow (DESIGN.md `{components.focus-ring}`). |
| Cold load | `/account` tab | Skeletons (/account); a tab loads only when opened. |
| Load error | `/account` tab or Section | Inline banner "Something went wrong while loading profile information · Retry"; never an empty form. |
| No access (403) | `/account` tab or Section | No-access panel; other tabs keep working. |
| No changes | Account settings | Save shows "There are no changes"; the Section stays in edit mode. |
| Partial save | Account settings | Edit mode kept; banner names the failed part ("{Part} was not saved. {platform message}"); succeeded parts become the baseline. |
| Base MFA off | Authenticator app | Base-MFA-off notice; no dialog. |
| TOTP linked | Authenticator app | "Enabled" status, Disable, tiles inactive with the caption. |
| QR loading | Tile, Link authenticator dialog | Tile spinner, other tiles aria-disabled; dialog QR skeleton. |
| Search loading / error / end / zero results | NPI combobox | "Searching…" / "Couldn't load results. Try again." / "No more results" / "No matching NPI found". |
| NPI taken | NPI combobox | The matching message under its own field; nothing sent. |
| Registration error | Healthcare credentials | `{components.inline-banner-error}` in the Section with the platform message, or the 1-888 fallback when there is none; stays until the next Register attempt; no toast. |
| Registered | Individual Provider Registration | Registered view; no edit. |
| No organizations | My Organizations | `totalElements === 0` with no search text: empty card with four feature rows + Register organization (checkout in a new tab; internal users: Portal hand-off to organization creation). |
| No results | My Organizations | Search text and zero results: "Sorry, no results were found", no pagination. |
| Disabled organization | Organization card | Muted text; Enter portal aria-disabled + Tooltip. |

## Interaction Primitives

- **Edit the whole table.** Section-level Edit; inputs appear in every editable cell; locked cells explain why. Save/Cancel per Section.
- **Draft row removal.** In edit mode, Remove on a saved row strikes it through (`{components.table-row-removed}`) and swaps the action for "Restore" until Save; no toast, no undo, no confirm. Removing a new unsaved row deletes it outright (nothing to restore). Remove from read view always switches the Section into edit mode first.
- **Act from read view.** Make primary and Verify act directly from the read view, each on its own; no Section edit mode.
- **Make primary with confirm.** Login identifiers (Primary email, Primary mobile) confirm with "This changes how you sign in". Addresses don't confirm.
- **Explain before failing.** Every unavailable action is aria-disabled with a tooltip reason (hover, focus, tap); never a hidden action and never an error after Save.
- **Save all.** One action across dirty Sections; validate all → send per Section → honest summary.
- **Leave protection.** beforeunload on close/reload; in-app guard on tab switch, app-bar page switch and Return to 1health.
- **Keyboard.** Tab order on `/`: app bar (wordmark, page nav Personal Profile → Account, Return to 1health) → header → tabs → index → Sections in order → Save all. On `/account` (no index, no Save all): app bar (same order) → header → tabs → the active tab's content in reading order (Personal Account: Account settings, then Authenticator app; My Organizations: search, cards row by row, pagination). Within a table, Tab moves through cells' controls in reading order; Escape in an edit table doesn't cancel (prevents accidental loss). Enter in an input doesn't submit the Section.
- **Pointer.** Hover reveals row actions on desktop only; touch relies on the kebab.
- **Banned:** hover-only affordances, bottom-sheet editors (edit stays in place), drag to reorder, toasts with undo for removals, confirm dialogs beyond the four named, auto-save.

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
- **Profile module (`/account`):**
  - Tabs follow the same tab semantics; the horizontally scrolling mobile strip keeps every tab reachable by arrow keys, and the selected tab scrolls into view.
  - Link authenticator dialog: QR alt text "QR code to link your authenticator app"; the code field is labeled "6-digit code" with `inputmode="numeric"` and `autocomplete="one-time-code"`; errors are linked with `aria-describedby` and announced. Focus is trapped in the dialog and returns on close.
  - NPI combobox: WAI-ARIA combobox pattern (`aria-expanded`, `aria-controls`, `aria-activedescendant`); the result count, "Searching…" and the error row are announced politely; each option's accessible name is the full PRD option string.
  - Info popovers open on hover, focus or click and close on Escape; their content is reachable by keyboard and screen readers.
  - Organization card: type icons are focusable 44 px Tooltip triggers named by their type label; the "+N" chip's accessible name lists the hidden types; the truncated name is read whole from the DOM; each card is an `article` labeled by its name; Enter portal and (i) names include the organization name ("Enter portal for {name}", "Primary contact for {name}").
  - Search and page changes announce "{N} organizations" politely.
  - Vendor logos in MFA tiles are decorative; each tile is named "Link {App}".

## Responsive & Platform

| Width | Behavior |
|---|---|
| ≥ 768 px | Sticky numbered index left; tables with columns; hover row actions + kebab; Save all sticky bottom bar; Insurance editor as right drawer; Personal information read as 4 columns. |
| < 768 px (to 360 px) | Index → "Jump to" select; Personal information read → one Field \| Value pair per row, edit → label above a full-width control per field; multi-column tables → stacked row cards (line 1 value + status, line 2 label + type, kebab right); editing stays in place in the same card (single row component, two layouts; no bottom sheet); header shows avatar + name only; Save all → page-anchored pill that hides while the on-screen keyboard is open; Insurance editor → full-screen page (back control, paired fields one per row, Cancel/Save pinned to the bottom); Insurance card thumbnails move below the key/value grid; Change profile picture dialog runs full width minus 16 px gutters. No horizontal scroll at 360 px (FR-8). |
| `/account` ≥ 768 px | Tab strip in one row; Account settings read in 4 columns; MFA tiles in one row of five; NPI comboboxes up to 720 px; organization grid 4 / 3 / 2 columns at ≥ 1280 / ≥ 1024 / ≥ 768 px; "Create new organization" beside the search; dialogs centered. |
| `/account` < 768 px (to 360 px) | App-bar page nav (Personal Profile · Account) is a compact segmented control in the bar, wrapping under the wordmark below 400 px (same on `/`); tab strip scrolls horizontally (no "Soon" tag); profile header shows avatar + name only; Account settings read → one Field \| Value pair per row, edit → label above a full-width control; MFA tiles in a 3-column grid; comboboxes full width with Register right-aligned; organization grid 2 columns from 640 px, 1 column below; "Create new organization" stacks under the search; the Link authenticator dialog is full-screen (PRD responsive NFR); confirm dialogs (incl. Disable authenticator) stay centered with 16 px gutters; popovers and tooltips open on tap. |

Browsers: latest two Chrome, Edge, Safari, Firefox, iOS Safari, Android Chrome (NFR-7). Light theme default; dark supported through tokens.

## Inspiration & Anti-patterns

- **Chosen — Direction C Ledger:** tables, numbered index, hover actions + kebab, in-place editing.
- **Rejected — Direction A Chart** (ruled label/value grid, small-caps, text tags) and **Direction B Console** (dark sticky rail with status dots, stat tiles). Not to be reintroduced.
- **Replaced — legacy `/profile` screens** (`docs/design/NG-9020…NG-9026*.png`): reference for parity only, not for layout.
- **Replaced — legacy `/personal-settings` screens** (parity reference only, not for layout): [`imports/profile-current-ui/1.png`](imports/profile-current-ui/1.png) Personal Account read view and user menu · [`3.png`](imports/profile-current-ui/3.png) Personal Account edit · [`4.png`](imports/profile-current-ui/4.png) Individual Provider Registration form · [`5.png`](imports/profile-current-ui/5.png) My Organizations grid.

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

Dr. Patel, a newly registered provider, opens a bookmarked `?tab=contacts#signature` link while his session is live. Key screen: [`mockups/key-personal-info-edit.html`](mockups/key-personal-info-edit.html).

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

### UJ-101. Daniel switches his login email to his work address

Daniel already verified his work email in Contacts. Key screen: [`mockups/key-account.html`](mockups/key-account.html).

1. In the 1health portal he opens **Apps** → **Personal Profile**; the app opens in its own tab on `/`. He selects **Account** in the app bar → `/account?tab=personal` (PRD FR-102).
2. Personal account settings reads in four columns; he clicks "Edit".
3. He opens "Primary email address" and picks the work address; the inline notice about login credentials appears under the Select.
4. Save. Toast "Personal account updated successfully"; read view.
5. **Climax:** Primary email address now shows the work address, in the read view and the profile header; next sign-in uses it.

Failure / edge: only one verified email → Select aria-disabled, helper links to `/?tab=contacts#email`. Time zone call fails after the email saved → "Time zone was not saved"; Save again sends only the time zone.

### UJ-102. Ana turns on an authenticator app

1. Personal Account → Authenticator app shows "Not set up" and five tiles.
2. She activates "Microsoft"; the dialog opens with the QR and the code field focused.
3. She scans, types the code, Submit.
4. **Climax:** dialog closes, toast "Microsoft authenticator linked"; the Authenticator app section shows the check and "Enabled" (PM5) with "Disable"; tiles inactive with "Disable the current authenticator to link another".

Failure / edge: wrong code → "Invalid code. Try again.", field cleared. Base MFA off → info banner in the Section, no dialog. Later "Disable" → "Turn off authenticator app?" → Turn off → "Authenticator app disabled".

### UJ-103. Dr. Ruiz registers as an individual provider

Key screen: [`mockups/key-provider-registration.html`](mockups/key-provider-registration.html).

1. Portal **Apps** → **Personal Profile**, then app bar **Account** → tab "Individual Provider Registration" (`?tab=provider`); "Healthcare credentials" shows two empty search fields.
2. He types "ruiz miami" in Personal NPI; options show NPI + name / city, state; he picks his.
3. He searches his clinic in Practice NPI and picks it.
4. Register → "Registering…".
5. **Climax:** the Section turns into the registered view: NPI, taxonomy, HIE, practice name/address/NPI, licenses, signature.

Failure / edge: Personal NPI already taken → inline message, nothing sent. A search with no match → "No matching NPI found". Registration fails → inline error banner in the Section (platform message or the 1-888 fallback) until he tries Register again. Practice is a 1health organization he isn't in → info banner "This organization already exists - please contact their support…".

### UJ-104. Mónica jumps into one of her organizations

Key screen: [`mockups/key-organizations.html`](mockups/key-organizations.html).

1. Portal **Apps** → **Personal Profile**, then app bar **Account** → tab "My Organizations"; three cards with logos and type icons.
2. She types "dnn"; the grid narrows to one card; "1 organization" is announced.
3. She opens (i) to see the primary contact.
4. "Enter portal".
5. **Climax:** the same tab navigates to the 1health portal in DNN Healthcare's context (leave guard first if anything is dirty).

Failure / edge: a card where she is disabled shows Enter portal aria-disabled with "You're disabled in this organization". A search with no match shows "Sorry, no results were found".

### UJ-105. Session expires while editing

Same as UJ-5, on `/account`. Only the deltas:

- Only Account settings has a draft (key `pp:draft:v1:<userId>:account`); it is restored with the same banner after relaunch.
- Switching tabs with Account settings dirty opens the leave guard.
- MFA codes, the QR and NPI selections are never kept.

## Open Questions

1. **Save all order** with Primary switches and auto-verify (PRD OQ 4, Architecture).
2. **"Last updated" meta** in the profile header: is it backed by data? It appears only in the direction mock; the key-screen mocks omit it.
3. **Profile-module icon set** (PRD OQ4) proposed in DESIGN.md Organization card (lucide); confirm with design-system owners.

## Assumptions Index

All former `[ASSUMPTION]` tags in this file and DESIGN.md (including the Profile-module provider (i) copy and layout choices PM1–PM11, approved 2026-10-13) were approved by the user as defaults (2026-10-13) and are now plain decided text. All former `[PENDING MOCK]` items (Address edit layout and collapsed row, Insurance tab layout, drawer and thumbnails, Profile Picture change UI, Personal information field order) were settled by the key-screen mocks, approved 2026-10-13 (layout choices F1–F4, L1–L4, I1–I6, P1–P3), and are now plain decided text.

### Profile-module layout choices (PM1–PM11, approved 2026-10-13)

Settled by the Profile key-screen mocks; the rules themselves live in the Component Patterns rows named.

- **PM1** Labels per Voice and Tone (today's long labels).
- **PM2** Account settings read view fills the 4-column grid row by row (DESIGN.md Account settings order).
- **PM3** Empty values read "Not provided".
- **PM4** Edit footer: "Unsaved changes" + Cancel/Save.
- **PM5** The linked status shows the check and "Enabled" next to the "Authenticator app" heading (PRD FR-110 reads "Authenticator app enabled"; the delta is recorded in PRD addendum §D; confirmed as D-UX2).
- **PM6** The Registered view shows either the "already exists" banner or "Register your practice to enable ordering" (practice NPI verified and not yet claimed), never both.
- **PM7** Registered-view rows "Practice address" and "Practice NPI".
- **PM8** Practice name popover: organization name, support phone, support email.
- **PM9** The "+N" Tooltip lists the hidden types alphabetically.
- **PM10** Popovers open below their trigger; "Previous" is aria-disabled on page 1, "Next" on the last page.
- **PM11** *(rewritten 2026-10-13)* The app is never framed: `/account`, like `/`, always runs top-level in its own tab, so "Return to 1health" always shows and portal hand-offs navigate the same tab.

### Profile-module decisions (D-UX1–D-UX9, approved 2026-10-13)

Decided text; the rules live in the Voice and Tone, Component Patterns, State Patterns and Responsive rows named, and in DESIGN.md.

- **D-UX1** Birth date help in Personal account settings is a "?" icon button with a Tooltip, edit view only (parity, PRD FR-105); the help text is unchanged.
- **D-UX2** The linked MFA status is "Enabled" next to the "Authenticator app" heading (PM5); the delta from PRD FR-110 is recorded in PRD addendum §D.
- **D-UX3** The Section heading reads "Personal account settings" (component name stays "Account settings (key/value)").
- **D-UX4** Locked Password help reads "Password changes aren't available here."
- **D-UX5** An NPI search with zero results shows the listbox row "No matching NPI found".
- **D-UX6** A registration error (platform message or the 1-888 fallback) is an inline error banner (`{components.inline-banner-error}`) in the Healthcare credentials Section, kept until the next Register attempt; not a toast.
- **D-UX7** The Registered-view Signature help is a "?" icon button with the Tooltip "The signature can be changed from the Personal Profile", plus an in-app link to `/?tab=contacts#signature`.
- **D-UX8** Below 768 px only the Link authenticator (QR) dialog goes full-screen; confirm dialogs, including Disable authenticator, stay centered with 16 px gutters like the rest of the app.
- **D-UX9** The Insurance Organization Type icon is lucide Umbrella (not ShieldCheck), so it isn't confused with today's shield for Health Provider.

## Architecture amendments (2026-10-13)
- **Inside the portal iframe**, the app-bar "Return to 1health" is hidden, because the portal's navigation is the exit. The session-expired dialog's action reads "Close and reopen from 1health". (Architecture AD-5) *Superseded 2026-10-13: the app is never framed.*
- **Automatic logoff:** the session ends after 15 minutes without activity or 8 hours after launch. A warning appears 60 s before the idle limit: "You'll be signed out in 1 minute" · **Stay signed in**. (Architecture AD-16)
