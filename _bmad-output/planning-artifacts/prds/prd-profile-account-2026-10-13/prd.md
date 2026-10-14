---
title: "PRD: Profile — Personal Account, Individual Provider Registration, My Organizations (1health)"
status: final
created: 2026-10-13
updated: 2026-10-13
jira: NG-9019
---

# PRD: Profile (1health)
*Working title. Jira parent: NG-9019. Target release: 2026.07.01 "Conduit", 2026-10-29 (code freeze 2026-10-22, demo QA sign-off by 2026-10-24).*

## 0. Document Purpose
This PRD defines the **Profile module**, the second module of the Personal Profile External Application. It rebuilds the `/personal-settings` screen of `1health-fe` (today reached from the user menu: **Profile**, **Provider registration**, **My organizations**) with the new 1health Tailwind UI, as the app's **Account** page.

*Change 2026-10-13 (user overrides): no 1health-fe changes. Users reach Account from the portal "Apps" tile "Personal Profile" plus the app-bar **Account** item, or by direct URL; the 1health-fe user menu stays on legacy `/personal-settings`. The app always runs top-level in its own tab, never framed.*

It is written for the team building and reviewing the module (PM, UX, engineering, QA) and for the downstream BMAD steps: UX, architecture, and epics and stories. The stories will be created in Jira under **NG-9019**.

This PRD **builds on** two documents:
- the Personal Profile PRD (`../prd-personal-profile-2026-10-13/prd.md`), referenced here as **PP-FR-n**;
- its architecture spine (`../../architecture/architecture-personal-profile-2026-10-13/ARCHITECTURE-SPINE.md`), referenced as **AD-n**.

The app shell is shared: launch, session, refresh, session expiry, the BFF proxy, and the Section edit model. Where this module needs the spine to change, §5.1 lists the amendments. The architect must accept them before stories are written.

How it is organized:
- Vocabulary is fixed by the §3 Glossary.
- FRs are numbered **FR-101 and up**, so they never collide with PP's FR-1 to FR-32.
- Assumptions are tagged inline and indexed in §11.
- Every change from today's behavior is listed in §6.3, **Deltas from today**. Anything not listed there is parity.

Evidence lives next to this file:
- `research-1health-fe.md`, `research-backend.md`, `research-api-docs.md`: the research.
- `reconcile-inputs.md`, `review-rubric.md`, `review-adversarial.md`: the review record.

Endpoints, payloads, the copy table and the parity checklist are in `addendum.md`.

## 1. Vision
The Profile screen is where a 1health user manages their **account**, as opposed to their personal record. That covers the name and login identifiers, regional preferences, authenticator-app MFA, registering as an individual healthcare provider by NPI, and getting into the organization portals they belong to.

This module moves the screen out of `1health-fe` and into the Personal Profile app with **functional parity**. Every capability that exists today keeps working under the same platform rules, and nothing new is added beyond the deltas in §6.3. Those are clearer copy, an explicit confirmation before turning off the authenticator, real loading, error and no-access states, and a few small fixes. The legacy screen stays in `1health-fe` untouched; the app offers the new version alongside it.

## 2. Target User

### 2.1 Jobs To Be Done
- **Keep my account details correct:** my name, which verified email and phone I log in with, my birth date, language, time zone and locale. *(functional)*
- **Protect my account with an authenticator app,** and turn it off when I change phones. *(functional; emotional: security)*
- **Prove I'm a healthcare provider** by linking my personal NPI, and optionally my practice's NPI. *(functional, professional)*
- **Get into the organization portals I belong to** quickly, and tell them apart. *(functional)*

### 2.2 Users and Non-Users (v1)
- **Users:** any authenticated 1health user managing their **own** account in the **default (personal) tenant**. That includes patients, providers and organization staff.
- **Non-users:** administrators managing *other* users' accounts, MFA or NPIs. Those flows stay in the back office.
- **Kept on legacy:** MTA and Customer Support accounts can't launch External Applications. Nothing to do for them: the 1health-fe user menu is untouched and keeps opening the legacy `/personal-settings` for everyone (FR-102).
- `[ASSUMPTION A1: in the default tenant, every user who can launch the app holds Patient functionality, which is required for the edit, contact-point, MFA, NPI and organization-list endpoints. To be verified on demo with a staff-only account (OQ2). FR-103 covers the case where they don't.]`

### 2.3 Key User Journeys

- **UJ-101. Daniel switches his login email to his work address.**
  - **Persona + context:** Daniel has already added and verified his work email in Personal Profile → Contacts.
  - **Entry state:** signed in to the 1health portal. He opens the **Apps** launcher and clicks the **Personal Profile** tile; the app opens in its own tab on Personal Profile. He clicks **Account** in the app bar, which opens the **Personal Account** tab.
  - **Path:**
    1. He clicks **Edit** on Personal Account Settings.
    2. He opens **Primary Email Address**, which lists his Verified emails, and picks the work email.
    3. A notice says this changes his login email.
    4. He clicks **Save**.
  - **Climax:** a success toast appears, and the read view shows the new Primary Email.
  - **Edge case:** with only one verified email, the picker is disabled. The helper text links him to Contacts in Personal Profile to add and verify another.

- **UJ-102. Ana turns on an authenticator app.**
  - **Persona + context:** Ana, a lab manager with MFA already on for her account, is told to use an authenticator app.
  - **Path:**
    1. On Personal Account she clicks the **Microsoft** tile.
    2. A dialog shows a QR code and instructions that name Microsoft Authenticator.
    3. She scans it, types the 6-digit code, and clicks **Submit**.
  - **Climax:** a toast confirms the app is linked. The card shows "Authenticator app enabled" and a **Disable** action.
  - **Edge cases:**
    - A wrong code shows an inline "invalid code" message and clears the input; the dialog stays open.
    - A user whose account doesn't have MFA turned on is told the authenticator can't be linked yet and who to contact (FR-111).

- **UJ-103. Dr. Ruiz registers as an individual provider.**
  - **Path:**
    1. Portal **Apps** → **Personal Profile** tile, then app bar **Account** → **Individual Provider Registration** tab (or a bookmarked `/account?tab=provider` while his session is live).
    2. He searches for his name in **Search for your personal NPI number** and picks "1234567890, Luis Ruiz, Miami, FL".
    3. He searches for his clinic's NPI and picks it.
    4. He clicks **Register**.
  - **Climax:** the tab switches to the registered view, showing his NPI, taxonomy, practice and signature.
  - **Edge case:** the personal NPI is already claimed. The app says so and nothing is sent.

- **UJ-104. Mónica jumps into one of her organizations.**
  - **Path:**
    1. Portal **Apps** → **Personal Profile** tile, then app bar **Account** → **My Organizations** tab shows a card grid.
    2. She types "dnn" in **Search organizations**.
    3. She checks the primary contact through the (i).
    4. She clicks **Enter portal**.
  - **Climax:** the app's tab navigates to the 1health portal in DNN Healthcare's context (the app always runs in its own browser tab).
  - **Edge case:** she is disabled in one organization. That card's **Enter portal** is disabled and explains why.

- **UJ-105. Session expires while editing.** Same as PP UJ-5 (PP-FR-2). The unsaved Personal Account edit is kept as a local draft; MFA codes and NPI selections are not.

## 3. Glossary
*Terms from the PP glossary (External Application, Launching user, Section, Contact Point, Contact Label, Primary, Verified) apply unchanged.*
- **Profile module** — this module. Three tabs: Personal Account, Individual Provider Registration, My Organizations.
- **Personal Account Settings** — the Section with the account fields: first and last name, username, password (masked), Primary Email, Primary Phone, birth date, Preferred Language, Default Time Zone, Preferred Locale. Section id `account`.
- **Primary Email / Primary Phone** — the user's login identifiers: the Contact Point labeled "Primary" of type Email, or of type Mobile or Landline. Here they can only be switched to another **Verified** Contact Point. See FR-107 for how this module's rules differ on purpose from PP-FR-18 and PP-FR-22.
- **Preferred Language** — an ISO-639 code (e.g. `en`).
- **Default Time Zone** — an IANA zone id (e.g. `America/New_York`).
- **Preferred Locale** — a `lang-CC` code (e.g. `en-US`) for date, time and currency formatting. It is one value.
- **Authenticator App (TOTP)** — a standard RFC 6238 authenticator (Google, Microsoft, Authy, Duo, Android OTP, …). The tiles are presentational; every tile links the same TOTP factor.
- **MFA** — multi-factor authentication. **MFA enabled** means the account's base factor is on (an email or SMS code at login), managed outside this app. **TOTP enabled** means an Authenticator App is linked on top of it.
- **NPI** — a National Provider Identifier from the 1health NPI registry, a weekly copy of NPPES. **Personal NPI** is entity type 1; **Practice NPI** is entity type 2.
- **Provider Registration** — the one-time link between the user's person record and a Personal NPI, plus an optional Practice NPI. There is no edit or unregister.
- **Organization** — a 1health tenant organization the Launching user belongs to, other than the default tenant. It has a logo, a short name, **Organization Types**, a primary contact, and an **enabled** flag for this user.
- **Organization Type** — a platform organization type, shown as an icon: Health Provider ("Healthcare"), Lab, Supplier, Go To Market, Population Health, Insurance, Carrier, Manufacturer, Enterprise, Government Agency, or n/a.
- **Portal hand-off** — leaving this app to open the 1health portal, for a given Organization (Enter portal) or for organization creation.

## 4. Features
*"Today" means the current `1health-fe` `/personal-settings`, deployed. FRs keep today's behavior except where §6.3 lists a delta. Endpoints are in `addendum.md` §A, and copy is in addendum §D.*

### 4.1 Module shell: route, tabs, entry points, states
**Description:** the module is a second page in the Personal Profile app (**Account**), with three tabs. It is reached through the app-bar **Account** item or by direct URL; 1health-fe is not changed. The shared shell applies: launch (PP-FR-1), session and drafts (PP-FR-2), feedback (PP-FR-7), responsive layout (PP-FR-8) and leave protection (PP-FR-6). Realizes UJ-101 to UJ-105.

#### FR-101: Route and deep-linkable tabs
**Consequences (testable):**
- The route is `/account?tab=personal|provider|organizations`. A missing or unknown value opens Personal Account. Launch always lands on `/`; `/account` is reached in-app or by URL with an existing session (amendment AM-1).
- The active tab is in the URL and survives a refresh. Tabs use ARIA tab semantics and work with the arrow keys.
- Switching tabs while Personal Account Settings has unsaved changes asks the user to keep editing, discard, or save (as in PP-FR-3).
- The page has no "Save all" bar; Personal Account Settings is its only editable Section.

#### FR-102: Entry: portal Apps tile, app-bar navigation, direct URL
**Consequences:**
- **No 1health-fe changes.** The user opens the app from the 1health portal **Apps** launcher tile **Personal Profile**; launch lands on `/` (Personal Profile), always top-level in its own browser tab.
- The app bar has two destinations, **Personal Profile** (`/`) and **Account** (`/account`). The current one is marked `aria-current="page"`. Moving between them runs leave protection (PP-FR-6) when the current page has unsaved changes.
- A direct URL `/account?tab=personal|provider|organizations` (bookmark, refresh, typed) works only when a session already exists; otherwise the app shows the existing launch-error screen.
- A launch that arrives in a non-default tenant shows the AD-6 error with module-neutral copy ("Profile is available in your personal account…"). The app never switches tenant itself.
- The 1health-fe user menu (**Profile**, **Provider registration**, **My organizations**) is **not rewired**: it keeps opening legacy `/personal-settings` for every user, including MTA and Customer Support. No 1health-fe flag.

#### FR-103: Loading, load-error and no-access states
**Consequences:**
- Each tab and card shows a skeleton while loading. Today the provider tab renders nothing.
- A non-403 load failure shows "Something went wrong while loading profile information" inline with **Retry**. It never shows an empty form.
- A 403 shows "You don't have access to this in your current account" on the affected tab or card, with no raw error. The other tabs keep working.
- Error rule: show the platform `message` for any 4xx or 5xx response that has one; otherwise show the generic error.

---

### 4.2 Personal Account Settings *(tab: Personal Account)*
**Description:** one Section with a read view and an edit view (**Edit** → **Cancel** / **Save**), following PP-FR-4 and PP-FR-6. Realizes UJ-101.

#### FR-104: View account settings
**Consequences:**
- Fields, in today's order:
  - First Name, Last Name, Username, Password (always `********`)
  - Primary Email Address, Primary Phone Number, Birth Date (MM/DD/YYYY), Preferred Language
  - Default Time Zone, Preferred locale for date, time, and currency
- Empty values show "Not provided". That includes a birth date the platform withholds, a time zone or language that was never set, and a birth date that fails the age rule (today this one shows "Unknown").
- Primary Email and Primary Phone show the user's current Primary values from the user record.

#### FR-105: Edit names and birth date
**Consequences:**
- First and last name are required, 1–24 characters after trimming.
- Birth date is required, as a valid MM/DD/YYYY date. The user must be 18–120 years old, or 21–120 with the Proctor role. The picker's range enforces the same rule.
- In edit mode, Birth Date has a "?" help: "Your date of birth is an important identifying factor throughout the healthcare industry. Additionally, 1health requires all users to be over the age of 18."
- Validation runs on blur and before save. Messages follow the addendum §D copy table: typos fixed, and "required" shown for an empty field instead of "invalid".

#### FR-106: Read-only username and password
**Consequences:**
- Username and Password appear in edit mode as disabled fields and are never sent.
- There is no password change (parity; see §6.2).

#### FR-107: Switch Primary Email and Primary Phone (parity transport)
The user can choose another **Verified** Contact Point as Primary Email or Primary Phone. **This keeps today's mechanism and rules on purpose** (decision 2026-10-13). It differs from PP-FR-18 and PP-FR-22, and it needs amendment AM-4.
**Consequences:**
- The email picker lists Verified Email Contact Points. The phone picker lists Verified Mobile **and Landline** Contact Points (parity).
- The current Primary always appears as the selected value, even when it isn't Verified. It isn't sent unless the user changes it, and it doesn't count toward the disabled rule.
- With no other Verified option, the picker is disabled. The helper text reads "Please add additional verified email(s) in your personal profile to change your current primary contact email" (or "phone(s)"), and "personal profile" links to Personal Profile → Contacts.
- On the **first** change, an inline notice appears below the picker. Email: "Changing your primary email will result in updating your login credentials. The next time you login you will have to use the new email." Phone: "Changing your primary phone will result in updating your notification preferences." Today it shows only on the second change.
- The value goes in the profile update (`PUT /user/edit`) **only when it changed**. The platform rejects the user's own current email (backend R1) and relabels the old Primary "Old".

#### FR-108: Regional preferences
**Consequences:**
- Options are today's, kept as constants:
  - Language: English (`en`)
  - Time zone: Hawaiian, Alaska, Pacific, Mountain, Central, Eastern (IANA ids in addendum §B)
  - Locale: English - United States
- A stored value that isn't on the list is shown by its label when known, otherwise as the raw code. It passes the required check, and it is sent only if the user picks a new value.
- A **blank** language or time zone must be chosen before Save, as today. The field shows "Select a value" and the error appears at the field.
- The Preferred Locale shows "English - United States" when nothing is stored, matching what today's screen always shows. It is sent only when changed.

#### FR-109: Save and partial failure
**Consequences:**
- **Save** with no changes shows "There are no changes" and stays in edit mode.
- Only changed fields are sent. Names, birth date, language, email and phone go in the profile update. Time zone and locale each go in their own call.
- If all calls succeed, the app shows the toast "Personal account updated successfully", returns to the read view, and re-fetches the user and Contact Points.
- If any call fails, the Section stays in edit mode and names what wasn't saved (e.g. "Time zone was not saved"). The parts that succeeded become the new baseline, so **Save** again re-sends only what failed. The Section never reports success for a partial save.

---

### 4.3 Authenticator App (MFA) *(tab: Personal Account)*
**Description:** the card **Enable authenticator app for MFA**, with five tiles: Google, Microsoft, Authy, DUO, Android OTP. Realizes UJ-102.

#### FR-110: MFA status
**Consequences:**
- When TOTP is enabled, the title shows a check and "Authenticator app enabled", and the header shows **Disable**.
- When TOTP is enabled, the tiles are visibly inactive, with the hint "Disable the current authenticator to link another". Today a click silently does nothing.

#### FR-111: Link an authenticator app
**Consequences:**
- Clicking a tile starts linking. This app never turns on base MFA (parity).
  - If the platform answers that MFA isn't enabled for the user, the app shows an inline message in the card: "Your account doesn't have multi-factor authentication turned on, so an authenticator app can't be linked yet. Contact support." No dialog opens.
- Otherwise, the dialog **"Link your {App} authenticator"** opens and shows:
  - the instructions ("Use the {App} authenticator app installed on your device to scan this QR, then provide the code generated by the app in the field below.")
  - the QR code, with alt text "QR code to link your authenticator app"
  - a single labeled 6-digit numeric input with `autocomplete="one-time-code"`
- **Submit** with fewer than 6 digits shows an inline "Enter the 6-digit code".
- Correct code: the dialog closes, the toast "{App} authenticator linked" appears, and the status refreshes.
- Wrong code: an inline "Invalid code. Try again.", the input clears, and the dialog stays open.
- Closing without a correct code leaves TOTP off and refreshes the status.
- Each new dialog gets a fresh QR, and earlier QRs stop working. The app doesn't request a new QR while the dialog is open. There is no manual secret key.

#### FR-112: Disable the authenticator app
**Consequences:**
- **Disable** opens a confirmation: "Turn off authenticator app? You'll no longer be asked for a code from your authenticator app when you sign in." with **Cancel** and a destructive-styled **Turn off**.
- Confirming disables TOTP, shows "Authenticator app disabled", and refreshes the status. Base MFA is unchanged (parity).

---

### 4.4 Individual Provider Registration *(tab: Individual Provider Registration)*
**Description:** the **Healthcare credentials** card. Unregistered users see the search-and-register form; registered users see the read-only registered view. Realizes UJ-103.

#### FR-113: Registration state
**Consequences:** on load the app reads the current Provider Registration. With no Personal NPI it shows the form (FR-114); otherwise it shows the registered view (FR-116). A skeleton shows while loading.

#### FR-114: Search NPIs
**Consequences:**
- The instruction reads "Please find your provider and NPI information to continue…".
- **Search for your personal NPI number** is required and searches type 1 (individual) only. **Search for your practice's (hospital, clinic, lab, etc.) NPI Number** is optional and searches type 2 (organization) only. The app enforces the type, because the platform doesn't.
- Search matches the 10-digit number or names. It runs after a pause in typing (~600 ms), returns 10 results per page, and loads more on scroll. Opening an empty field shows the first page.
- Option format:
  - individual: `"<NPI>, <First> <Last>, <City>, <State>"`
  - organization: `"<NPI>, <Organization name>, <Address line 1>, <City>, <State>"`
- A failed search shows "Couldn't load results. Try again." in the dropdown. Today it shows an empty list.
- The header (i) opens a popover explaining that registration links the user's account to their NPI from the national registry, that the Practice NPI is optional, and that a registration can't be changed afterwards. Final copy is set in UX.

#### FR-115: Register
**Consequences:**
- A missing Personal NPI shows "Personal NPI is required" at the field, on blur and on **Register**.
- Before sending, the app checks whether each selected NPI is already registered. If either is taken, it shows the matching message (addendum §D) and sends nothing.
- Otherwise it registers straight away, with no confirmation dialog (parity; decision 2026-10-13).
- Success shows the toast "Provider NPI registered" or "Provider and practice NPIs registered", then the registered view.
- An error shows the platform message, or "There was an error in the registration. Please call 1-888-555-1212 for assistance." when there is none.
- **Register** is disabled while the request is in flight, so a double click sends once.

#### FR-116: Registered view
**Consequences:**
- Fields, in today's order:
  - NPI, Taxonomy, Health Information Exchange
  - Practice Name, practice address, "NPI: <practice NPI>"
  - Licenses, Address of practice (lines 1–2), Signature
- "n/a" or -1 shows as "Not provided".
- **Practice Name** shows the practice tenant's support contact on hover or focus, when the practice is a 1health Organization.
- If the practice is a 1health Organization the user doesn't belong to: "This organization already exists - please contact their support to be added to their portal."
- Signature: the image, or "No signature available". A "?" says "The signature can be changed from the Personal Profile", with a link to Personal Profile → Personal Information.
- **Register your practice to enable ordering** shows only when the Practice NPI is verified and not yet claimed by an Organization. It is a **Portal hand-off** (FR-120 rules: same-tab navigation after leave protection) to the portal's organization creation.
- There is no edit or unregister action.

---

### 4.5 My Organizations *(tab: My Organizations)*
**Description:** a searchable, paginated grid of the user's Organizations, each with a way into its portal. Realizes UJ-104.

#### FR-117: List and search
**Consequences:**
- **Search organizations** filters on the server: name, short name or legal name contains the text, case-insensitive. It runs after a ~500 ms pause and resets to page 1.
- 12 cards per page, sorted by name on the client within a page. Pagination shows whenever there are results, as today.
- A skeleton grid shows while loading. A failure shows an inline error with **Retry**.

#### FR-118: Organization card
**Consequences:**
- The card shows:
  - the logo, or the Organization's initials on a neutral tile when there is none
  - the short name (falling back to the name), on one line with an ellipsis and the full name in a tooltip
  - Organization Type icons
  - an (i) button
  - **Enter portal**
- **Type icons:** at most **4** icons, then a "+N" chip, as deployed today. The chip's tooltip and accessible name list the remaining types.
  - Order: Lab, Health Provider, Supplier, Go To Market, then the rest alphabetically.
  - Every Organization Type has an icon and a tooltip label. An unknown type gets a generic icon and never breaks the card (today, Population Health crashes it).
- **(i)** opens the **Primary contact** popover: full name, phone and email, or "-" when there is none. It opens on hover, focus or click and closes with Escape.

#### FR-119: Empty states
**Consequences:**
- **No organizations:**
  - The card reads "You aren't managing any organizations yet" / "Register an organization with 1health to unlock the platform features listed below", followed by today's four feature rows (Lab, Healthcare, Supplier, Go To Market).
  - **Register organization** opens `https://learnmore.1health.io/product-checkout` in a new tab.
  - Users with `@1health.io` or `@tachin.ai` emails get a Portal hand-off (same tab, FR-120) to organization creation instead, plus a **Create new organization** button next to search, as today.
- **No search results:** "Sorry, no results were found".

#### FR-120: Enter portal (Portal hand-off)
**Consequences:**
- **Enter portal** opens the 1health portal in that Organization's context. The app never calls the platform tenant switch (backend R7).
- The URL is built only from the configured portal origin plus a numeric tenant id, never from response data such as `subdomain`. `[ASSUMPTION A4: <portal origin>/?ctx=<tenantId>; see OQ1]`
- The app always runs top-level in its own tab, so the hand-off **navigates the same tab** to the portal. If there are unsaved changes, leave protection (PP-FR-6) asks first. There is no framed / new-tab branch.
- **Enter portal** is disabled, with "You're disabled in this organization", when the user isn't enabled there.

---

## 5. Cross-Cutting NFRs and Dependencies

### 5.1 Required spine amendments (architect to accept before stories)
- **AM-1 (AD-4):** launch stays on `/`; no `view`/route launch parameter is needed. `/account?tab=personal|provider|organizations` is reached via the app-bar **Account** item or by direct URL with an existing session (no session → existing launch-error screen). The app bar gains the two-item page nav (FR-102). The structural seed gains `app/account/page.tsx` and `features/account`, `features/mfa`, `features/provider`, `features/organizations`.
- **AM-2 (AD-7, AD-8, AD-12):** the Section registry and Save-all are scoped per page. The new Section id is `account`, so it doesn't collide with PP's `personal`. Draft keys use `pp:draft:v1:<userId>:account`.
- **AM-3 (AD-6):** the tenant-error copy is module-neutral.
- **AM-4 (AD-9):** a scoped exception. Personal Account Settings may send `email` and `phoneNumber` in `PUT /v2/user/edit`, only when changed (FR-107). Everywhere else AD-9 still applies.
- **AM-5 (AD-21, AD-13):** Organization logos (`tenantLogo.publicUrl`) and the NPI signature are served through the proxy's image path, or the logo host is added to `img-src`. The architect chooses.
- **AM-6 (AD-2):** the proxy allowlist gains the module's endpoints (addendum §A). The proxy and logs **redact the `code` query parameter** of `mfa/validate`.
- **AM-7 (spine binds):** the spine's `binds` covers FR-101 to FR-120.

### 5.2 NFRs
- **Security:**
  - MFA QR codes, MFA verification codes and NPI selections are never stored in drafts, logs or telemetry.
  - The QR image is dropped when the dialog closes.
  - Turning off the authenticator always asks for confirmation.
  - `tenant/sys-config` is called only with the practice tenant id from the user's own registration. This endpoint is already open to any signed-in user, so the app adds no new exposure.
- **Accessibility:** WCAG 2.1 AA. Tabs, comboboxes, popovers and dialogs work with the keyboard. Focus is trapped in dialogs and returned on close. Icon-only controls have accessible names. Reduced motion is respected.
- **Performance:** each tab's first content renders within 1.5 s on demo over broadband. Search and typeahead return within 1 s at p75.
- **Responsive:** works from 360 px. The organization grid shows 1, 2, 3 or 4 columns. MFA tiles wrap. On mobile the Link authenticator (QR) dialog is full-screen; confirm dialogs stay centered with 16 px gutters (UX decision 2026-10-13).
- **Design system:** semantic tokens only (`docs/DESIGN-SYSTEM.md` and the PP UX docs). Third-party authenticator logos are the only non-token colors.
- **Copy:** English only, per addendum §D.

### 5.3 Rollout and dependencies
- **No 1health-fe dependency.** Entry is the existing portal Apps tile; the user menu is untouched and keeps opening legacy `/personal-settings`.
- **Platform answers:** OQ1 (portal URL) by **2026-10-17**, OQ2 (Patient functionality) by **2026-10-20**. Fallbacks are in §9 and §10.
- **Rollback:** the app's own kill switch (`PP_DISABLED`) or a Vercel rollback. The legacy screen stays available in 1health-fe regardless.

## 6. Scope

### 6.1 In Scope (2026-10-29)
- FR-101 to FR-120: all three tabs at parity, plus the deltas in §6.3.
- App-bar navigation between Personal Profile and Account (FR-102). No 1health-fe changes.
- Spine amendments AM-1 to AM-7.

### 6.2 Out of Scope
- **Change password.** Not parity. The backend supports it, but SSO users can't be detected (backend R3). `[NOTE FOR PM: candidate for the next release.]`
- Turning base MFA on or off. MFA recovery codes, a manual-entry secret, and re-authentication before disabling. None of these is supported by the platform.
- Separate date, time and currency preferences, and option lists beyond today's.
- Editing or unregistering a Provider Registration, NPI name matching or approval, and an audit trail. These are platform decisions.
- Organization capabilities on cards (the list endpoint doesn't return them).
- Admin flows for other users.
- The app header and user menu (Privacy, Terms, Dark mode, Sign out, session indicator). These stay in 1health-fe.

### 6.3 Deltas from today (approved 2026-10-13)
| # | Delta | FR |
|---|---|---|
| D1 | The provider (i) has real content | FR-114 |
| D2 | Confirmation before turning off the authenticator | FR-112 |
| D3 | Copy rewritten and typos fixed, per addendum §D | all |
| D4 | Skeleton, load-error-with-Retry and 403 no-access states | FR-103, FR-113, FR-117 |
| D5 | The primary-change notice shows on the first change | FR-107 |
| D6 | Logo fallback with initials; every Organization Type mapped, with a fallback icon | FR-118 |
| D7 | MFA code errors inline in the dialog; inactive tiles explained while TOTP is on; a clear message when base MFA is off | FR-110, FR-111 |
| D8 | "Not provided" for empty values | FR-104, FR-116 |
| D9 | NPI search failure shown instead of an empty list; Register disabled in flight | FR-114, FR-115 |
| D10 | App-bar navigation between Personal Profile and Account | FR-102 |

Rejected: a confirmation dialog before Register NPI.

## 7. Non-Goals (Explicit)
- Not an organization-management screen. Creating and administering organizations stays in the 1health portal.
- Not a tenant switcher for this app. The app always runs in the personal tenant.
- Not adding or verifying Contact Points. That is Personal Profile → Contacts.

## 8. Success Metrics
**Primary**
- **SM-101: parity.** Every row of the addendum §E parity checklist passes on demo by 2026-10-24, with the app top-level in its own tab. This is the go/no-go for 2026-10-29. Validates FR-101 to FR-120.
- **SM-102: login-identifier safety.** Zero support tickets in the first two weeks about a Primary email or phone change locking a user out. Validates FR-107.

**Secondary**
- **SM-103:** authenticator linking succeeds within 2 code attempts in at least 90% of linking attempts, if telemetry is available. Validates FR-111.
- **SM-104:** Enter portal opens the right tenant in 100% of QA runs. Validates FR-120.

**Counter-metric**
- **SM-C101: Provider Registrations count.** Don't drive it up by weakening the already-registered checks or the type enforcement.

## 9. Risks
- **R-A:** the portal URL isn't confirmed in time. Fallback: Enter portal opens the portal root and the user switches organization there. Graceful, but a known degradation.
- **R-B:** some users lack Patient functionality and see no-access states (FR-103). This is visible in QA and does no data harm.
- **R-C:** Primary-switch rules differ between this module and Contacts (FR-107, accepted on purpose). Mitigation: the copy in both places names the effect on login.

## 10. Open Questions
- **OQ1. Portal URL per tenant.** Candidate: `<portal origin>/?ctx=<tenantId>` (NG-8055). Asked on NG-9019, comment 66578. Owner: platform. Deadline: 2026-10-17. Fallback: R-A.
- **OQ2. Patient functionality in the default tenant for every user, and whether all users have base MFA.** Owner: platform, plus a demo check by Daniel Garcia. Deadline: 2026-10-20. Fallback: the FR-103 and FR-111 messages.
- ~~**OQ3. Can the launch carry route and tab** to `/account?tab=…`? (A2)~~ **Resolved 2026-10-13:** not needed. Launch lands on `/`; Account is reached in-app (FR-102).
- **OQ4. The Organization Type icon set** for the types with no icon today. Owner: UX step.

## 11. Assumptions Index
- **A1** (§2.2): Patient functionality in the default tenant for every Launching user; see OQ2.
- ~~**A2** (FR-102): the launch can target `/account?tab=…`~~ Retired 2026-10-13 (OQ3 resolved; launch lands on `/`).
- **A4** (FR-120): `<portal origin>/?ctx=<tenantId>` opens the portal in that tenant; see OQ1.
