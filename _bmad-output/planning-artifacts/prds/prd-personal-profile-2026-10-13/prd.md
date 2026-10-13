---
title: "PRD: Personal Profile (1health) — NG-9019"
status: final
created: 2026-10-13
updated: 2026-10-13
jira: NG-9019
---

# PRD: Personal Profile (1health)
*Working title. Jira: NG-9019. Target release: 2026.07.01 "Conduit", 2026-10-29.*

## 0. Document Purpose
This PRD defines the **Personal Profile** app. It is a standalone External Application on the 1health platform. It replaces the `/profile` screen in `1health-fe` and gives it a new UI/UX built on the 1health design system.

It is written for the team building and reviewing the app (PM, UX, engineering, QA) and for the downstream BMAD steps: UX, architecture, epics and stories. Jira NG-9019 and its sub-tasks NG-9020 to NG-9027 mirror its features.

How it is organized:
- Vocabulary is fixed by the §3 Glossary.
- Features are grouped, with globally numbered FRs nested under each one.
- Assumptions are tagged inline and indexed in §10.

Evidence that already exists lives next to this file and is not repeated here:
- `research-1health-fe.md`: how today's screens work.
- `research-backend.md`: backend endpoints and permissions.
- `research-api-docs.md`: the agents.md API docs.
- `../../../../docs/design/`: screenshots of today's UI.

Technical details (endpoints, payloads, which component does what) go in `addendum.md`, not in this PRD.

## 1. Vision
Every 1health user has one personal record. It holds who they are, how to reach them, where they live, and how their care is paid for. Today that record is edited in a dated, dense screen inside `1health-fe`, which the platform is retiring.

**Personal Profile** moves that experience into a dedicated app that opens from the 1health portal. Users arrive already signed in. They see their whole profile at a glance, and they can fix any part of it in seconds, with no guessing about the rules.

The app keeps **functional parity** with today's screen: users can do everything they do now, and the same platform rules apply. What changes is the experience:
- The state of each record is visible: verified or not, primary or not, notifications on or off.
- Constraints are explained before the user runs into them, not after an error.
- Every section looks and behaves the same way, following the 1health design system.

The app also proves the External Application model. It is one of the first core-platform experiences shipped as a separately deployed app on the 1health APIs, and it sets the pattern for others.

## 2. Target User

### 2.1 Jobs To Be Done
- **Keep my contact details current** so that care teams, notifications and login reach the right phone and email. *(functional)*
- **Trust that my identity data is correct and private.** This covers legal name, birth date, demographics and SSN. *(functional, emotional)*
- **Get my insurance on file before I need it,** including the card photos, so visits and billing go smoothly. *(functional, contextual)*
- **Maintain my signature** so that documents I sign as a provider carry it. *(functional, professional)*
- **Understand what each change does** before making it, for example "this will change how I log in". *(emotional)*

### 2.2 Users and Non-Users (v1)
- **Users:** any authenticated 1health user acting in the **default (patient) tenant**. That includes patients, and providers or other staff managing their *own* personal record. The app only ever edits the record of the user who launched it.
- **Non-users:** providers or staff viewing or editing *another person's* profile. That remains the Patient Chart in `1health-fe` and is out of scope.
- **Cannot launch:** MTA and Customer Support accounts. The platform blocks them from launching external apps.

### 2.3 Key User Journeys

- **UJ-1. Maria switches to a new phone number.**
  - **Persona + context:** Maria, a patient, has a new mobile number and wants appointment texts to reach it.
  - **Entry state:** signed in to the 1health portal. She clicks **Personal Profile** in the sidebar, the app launches, and she lands signed in on the **Contacts** tab.
  - **Path:**
    1. She adds a **Phone** entry and marks it mobile.
    2. On save, a verification is sent automatically.
    3. She confirms it from the SMS link, and the entry shows as **Verified**.
    4. She makes it **Primary**. The app warns her that this changes her login identifier, and she confirms.
    5. She relabels the old number "Old", or deletes it.
  - **Climax:** the new number shows Primary + Verified, with notifications on.
  - **Edge case:** she tries to make the new number primary before verifying it. The app shows *why* that isn't possible yet and offers to resend the verification, instead of failing on save.

- **UJ-2. Jordan adds their spouse's insurance before a visit.**
  - **Persona + context:** Jordan, a patient, moved to their spouse's plan.
  - **Entry state:** Personal Profile, **Insurance** tab.
  - **Path:**
    1. **Add insurance.**
    2. They search for the **Insurer**, or add a new one if it isn't listed.
    3. They enter the member ID, group ID and effective date.
    4. They set precedence to Primary and the relationship to Spouse.
    5. They fill in the subscriber's details and add photos of the front and back of the card.
    6. They mark the old policy as no longer primary.
  - **Climax:** the new **Insurance Policy** card shows the Primary badge and both card images.
  - **Edge case:** they pick Primary while another policy of the same type is already Primary. The app explains that only one Primary is allowed per type and offers to demote the other.

- **UJ-3. Dr. Patel sets up their signature.**
  - **Persona + context:** Dr. Patel, a newly registered provider, was told to set a signature in Personal Profile.
  - **Path:**
    1. They open **Personal Information** and edit it.
    2. They check their legal name and titles.
    3. They draw a **Signature** and save.
  - **Climax:** the signature preview shows on their profile, and the platform uses it on signed documents.
  - **Edge case:** they clear the signature and save. The app confirms the removal, because documents will no longer carry it.

- **UJ-4. Sam moves house.**
  - **Persona + context:** Sam, a patient, moved and needs a new home address on file.
  - **Path:**
    1. They add an **Address** and pick it from the suggestions, so it counts as verified.
    2. They set it as **Primary**.
    3. They delete the old address.
  - **Climax:** one primary, verified address.
  - **Edge case:** they try to delete the current primary address. The app asks them to set another address as primary first.

- **UJ-5. The session expires mid-edit.**
  - **Persona + context:** any user editing a section who walks away, or whose refresh token runs out.
  - **Path:** they return and click **Save**. The app detects that the session has expired.
  - **Climax:** a clear message, the unsaved changes kept locally, and a one-click way back to the portal to launch again. After relaunch the app offers to restore the draft.

## 3. Glossary
- **Personal Profile** — this app. A 1health External Application that edits the launching user's own record.
- **External Application** — an app registered on the 1health platform. It is opened from the portal through a launch payload and acts with the launching user's permissions.
- **Launching user** — the authenticated user who opened the app. Every read and write is scoped to their record.
- **Section** — one card on a tab (e.g. Personal Information, Phone). Each section is viewed, edited and saved independently.
- **Contact Point** — one phone, email or social-media entry. It has a value, a **Contact Type** and a **Contact Label**, a verified state, and a notification setting.
- **Contact Type** — the kind of Contact Point: Email, Mobile, Landline or Social Media. It is fixed once created. "Mobile" vs "Landline" is the phone's mobile flag.
- **Contact Label** — the role of a Contact Point. Allowed values are Primary, Home, Main, Old, Personal, Mailing List and Work. The platform's list is limited to these; the org-only "Partnership Organization" label is never shown.
- **Primary** — for a Contact Point, Primary is the **Contact Label "Primary"**, not a separate flag. There is at most one per Contact Type. Making another entry Primary relabels the old Primary as "Old" in the same save. For an Address, Primary is the `primary` flag, with exactly one per user. The Primary Email and Primary Mobile are the user's **login identifiers**.
- **Verified** — a Contact Point the user has confirmed through a verification link. Entries labeled Home are never verified and show no verification badge.
- **Address** — a physical location on the user's record, with an **Address Type** (Home, Main Work, Other Work, Vacation Home). It is Verified when chosen from address suggestions.
- **Signature** — a drawn signature image stored on the user's record and used on documents they sign.
- **Profile Picture** — the user's avatar image.
- **Insurance Policy** — one insurance coverage record. It has an **Insurer**, a member (subscriber) ID, an optional group ID, a type (Medical, Dental, Hospice, Vision, Drug), a precedence (Primary, Secondary, Supplemental, Other), a relationship to the insured, dates, optional subscriber details, and front and back card images.
- **Insurer** — an insurance organization, chosen from the platform list or created by name.
- **Masked SSN** — the SSN shown as `***-**-1234`. The full value is never displayed by default.

## 4. Features
*FRs are numbered globally. "Today" means the current `1health-fe` `/profile` behavior, which these FRs keep unless they say otherwise. The endpoint for each FR is listed in `addendum.md` §A.*

### 4.1 App Shell: launch, session, navigation, editing model
**Description:**
- Personal Profile opens from the **Personal Profile** item in the 1health portal sidebar. The portal sends the user to the app with a launch payload, and the app exchanges it for a session as the **Launching user**.
- The page has a **profile header** (§4.2) above three tabs: **Contacts**, **Insurance** and **Medical**.
- Every **Section** has a read view and an edit view. The user saves each Section on its own, or every changed Section at once with **Save all** (FR-4, FR-5).

Realizes UJ-1 to UJ-5.

**Functional Requirements:**

#### FR-1: Launch and sign-in
The Launching user arrives signed in, with no login screen, when opening the app from the portal.
**Consequences:**
- A valid launch payload lands the user on the Contacts tab within one page load.
- An invalid, expired or already-used launch payload shows an explanatory screen with a "Return to 1health" action. It never shows a blank page or a raw error.
- The demo or production environment is detected automatically from where the user came from. The manual environment chooser is shown only in non-production builds.
- Each launch payload is exchanged exactly once. After sign-in, the launch payload parameter (`lpl`) is removed from the URL and browser history, so a reload never replays a used launch payload.
- A launch payload that isn't encrypted is rejected, because the platform can fail open.

#### FR-2: Session continuity and expiry
The app keeps the session alive while the user is active and handles expiry gracefully. Realizes UJ-5.
**Consequences:**
- The access token is refreshed silently before it expires and when a request returns 401.
- When refresh fails, the user sees a session-expired message with a "Return to 1health to relaunch" action.
- Unsaved edits in any open Section are kept locally and offered back after relaunch on the same device. SSN and Signature drawings are never kept.
- Drafts are stored in `localStorage`, keyed to the Launching user's id, so they survive the relaunch in a new tab. They expire after 24 h. They are cleared on save, on discard, and on the app-bar "Return to 1health", but kept when leaving through the session-expired dialog. They are only ever offered to the same user. *(Amended 2026-10-13 by architecture: was `sessionStorage`, which does not survive a new-tab relaunch.)*
- If the server data for a Section changed after the draft was made, the app shows both versions and the user chooses. It never silently overwrites.

#### FR-3: Tab navigation
The user can switch between the Contacts, Insurance and Medical tabs.
**Consequences:**
- The active tab is reflected in the URL (`?tab=contacts|insurance|medical`), so it survives a refresh and can be deep-linked.
- Tabs work with the keyboard: arrow keys and Enter, with ARIA tab semantics.
- Switching tabs with unsaved changes in that tab's Sections first asks the user to keep editing, discard, or save.

#### FR-4: Section edit model
The user can open any Section in edit mode, independently of the others.
**Consequences:**
- Each Section shows a read view by default. **Edit** switches it to the edit view.
- Several Sections can be in edit mode at the same time.
- Each Section in edit mode has its own **Cancel**, which reverts only that Section, and its own **Save**, which saves only that Section.
- A Section with unsaved changes shows an "Unsaved changes" indicator.
- Validation errors appear inline at the field, and before any request is sent.

#### FR-5: Save all
When one or more Sections have unsaved changes, the user can save all of them in one action.
**Consequences:**
- A page-level **Save all (N)** bar appears while N ≥ 1 Sections have unsaved changes. It disappears at N = 0.
- Save all first validates every changed Section. If any Section is invalid, nothing is sent, and the page focuses the first invalid field.
- Sections are then saved independently. On partial failure:
  - Sections that succeeded return to read view.
  - Sections that failed stay in edit mode with their error.
  - A summary toast reports "X saved, Y failed".
- Saves are not atomic across Sections. The page never claims "all saved" unless every save succeeded.

#### FR-6: Leave protection
The user is warned before losing unsaved work.
**Consequences:** closing or reloading the page, or using "Return to 1health", while any Section has unsaved changes triggers a confirmation.

#### FR-7: Feedback and errors
Every save gives clear feedback.
**Consequences:**
- A success toast names the Section.
- Platform validation errors are mapped to human-readable messages next to the relevant field where possible, and in the Section otherwise.
- Network failures offer **Retry**.

#### FR-8: Responsive and accessible layout
The app works from 360 px phone width up to desktop.
**Consequences:**
- There is no horizontal scrolling at 360 px.
- Multi-column forms collapse to a single column on narrow screens.
- The insurance editor is a side drawer on desktop and a full-screen sheet on mobile.

---

### 4.2 Profile Header: avatar and name *(NG-9021)*
**Description:** a card at the top of the page. It shows the user's **Profile Picture**, or initials or a placeholder when there is none, and their full name. The user can change the picture.

#### FR-9: View header
**Consequences:**
- It shows first + last name from the profile, updated straight after Personal Information is saved.
- It shows the Profile Picture, or a placeholder with initials.

#### FR-10: Change Profile Picture
The user can upload a new Profile Picture.
**Consequences:**
- Accepts JPG, PNG or BMP up to 6 MB. Anything else is rejected before upload, with the reason shown.
- A preview is shown before the upload is confirmed.
- After a successful upload the new picture appears straight away, and the previous picture file is deleted.

---

### 4.3 Personal Information and Signature *(NG-9022)*
**Description:** identity and demographic data plus the **Signature**. Realizes UJ-3.

#### FR-11: View personal information
**Consequences:**
- Shows these fields:
  - first, middle and last name
  - name prefix and suffix, other names, titles
  - birth date, city of birth
  - race, ethnicity, biological gender, gender identity, sexual orientation
  - Masked SSN
  - Signature preview
- Empty values show "Not provided".

#### FR-12: Edit personal information
The user can edit every field listed in FR-11.
**Consequences (validation kept from today):**
- First and last name are required, printable characters only.
- Birth date is required and must make the user 18–120 years old, or 21–120 for users with the Proctor role.
- Race, ethnicity and biological gender are required, chosen from the platform value lists.
  - When nothing is set, race and ethnicity default to "Unknown" and biological gender to "Asked but not answered".
- Gender identity is required. It is chosen from Asked but not answered, Female, Male or Other, or the user can type their own value.
- Sexual orientation is free text, at most 128 characters.
- City of birth is at most 128 characters.
- Only changed fields are sent. Clearing an optional field clears it on the platform.
- Email and phone number are **never** sent from this Section; they are managed only through Contact Points (§4.4–4.5).
- Birth date has inline help explaining the age rule.

#### FR-13: SSN entry and reveal
The user can add, change or clear their SSN, and reveal it on demand.
**Consequences:**
- The SSN is shown as a Masked SSN by default.
- While typing, it is auto-formatted to `XXX-XX-XXXX` and checked to be 9 digits.
- An SSN that belongs to another person is rejected with a clear message.
- **Reveal** fetches and shows the full SSN for the Launching user's own record only.
  - It hides again automatically after 30 seconds, on blur, or when the user leaves the tab.
  - The full SSN is never cached, logged, or kept in client storage.

#### FR-14: Signature
The user can draw, replace or clear their Signature.
**Consequences:**
- The signature pad works with mouse, touch and pen.
- Clearing a saved Signature asks for confirmation.
- Saving keeps the Signature as a new version of the user's signature file, or creates or removes it as needed.
- The pad has an accessible name and instructions.
- Screen-reader users are told that drawing is required. `[ASSUMPTION: no typed-signature alternative in v1]`

---

### 4.4 Phone *(NG-9023)*
**Description:** the user's phone **Contact Points** (Contact Type Mobile or Landline). Realizes UJ-1.

#### FR-15: View phones
**Consequences:**
- The Primary phone is listed first.
- Each entry shows the number with its country flag and code, its Contact Label, Mobile or Landline, a Verified/Unverified badge, and a notification on/off indicator.

#### FR-16: Add, relabel and remove phones
**Consequences:**
- A new phone requires an international number (country picker; US numbers must be 10 digits), a Contact Label, and the Mobile flag.
- Duplicate numbers are rejected.
- A saved phone's number and Mobile flag can't be edited (platform rule). The user can change its Contact Label or notification setting, or remove it.
- Removing the only phone is not allowed.
- At most 20 Contact Points per Contact Type (platform limit). Add is disabled at the limit, with an explanation.
- The phone number field has inline help explaining the format and verification.

#### FR-17: Verify phones
**Consequences:**
- New mobile numbers whose Contact Label isn't Home are sent a verification automatically after saving.
- Saved, unverified mobile numbers whose Contact Label isn't Home show **Verify** / **Resend verification**.
- After verification, the badge updates the next time the Section is refreshed.

#### FR-18: Primary phone
The user makes a phone Primary with a **Make primary** action on a saved entry. It sets the Contact Label to Primary and relabels the previous Primary "Old" in the same save.
**Consequences:**
- Only a saved, Verified mobile number can be made Primary.
  - Exception, matching today: if no phone is Verified and none is Primary, an unverified mobile can be made Primary.
- A new phone can't be added directly as Primary.
- Landlines can't be Primary. This is an app rule, matching today.
- The disabled action explains why, e.g. "Verify this number first" or "Landlines can't be primary".
- Changing the Primary asks for confirmation that it changes the login identifier.
- The Primary phone can't be deleted until another phone is Primary.
- An existing unverified Primary keeps its Primary badge and shows **Verify**.

#### FR-19: Phone notifications
The user can turn notifications on or off for the Primary phone.
**Consequences:** it defaults to on when a phone becomes Primary.

---

### 4.5 Email *(NG-9024)*
**Description:** the user's email Contact Points. Same model as Phone. Realizes UJ-1.

#### FR-20: View, add, relabel and remove emails
**Consequences:**
- Entries show the address, Contact Label, Verified badge and notification indicator.
- New entries must be valid emails and unique (case-insensitive).
- A saved address can't be edited.
- Removing the only email is not allowed.
- At most 20 emails (platform limit).

#### FR-21: Verify emails
**Consequences:**
- New emails whose Contact Label isn't Home get a verification automatically.
- Unverified emails whose Contact Label isn't Home show **Verify** / **Resend verification**.

#### FR-22: Primary email
**Consequences:**
- The user makes an email Primary with **Make primary**. It sets the Contact Label to Primary and relabels the previous Primary "Old" in the same save.
- Only a saved, Verified email can become Primary. A new email can't be added directly as Primary.
- At most one Primary email. If one exists, it can't be removed until another is Primary.
- Changing it asks for confirmation that the login email changes.
- An email already used by another account is rejected with a clear message.

#### FR-23: Email notifications
The user can turn notifications on or off for the Primary email.
**Consequences:** it defaults to on when an email becomes Primary (same as FR-19).

---

### 4.6 Social Media *(NG-9025)*
**Description:** the user's social-media Contact Points.

#### FR-24: Manage social links
The user can add, edit and remove social-media links.
**Consequences:**
- Each link is a required, valid URL, unique per user.
- Links are stored with Contact Label "Personal".
- No verification, primary or notification setting.
- At most 20 links (platform limit).
- The user may remove every link (zero links allowed). This changes today's behavior, which kept at least one.
- Links open in a new tab from the read view.

---

### 4.7 Addresses *(NG-9026)*
**Description:** the user's **Addresses**. Realizes UJ-4.

#### FR-25: View addresses
**Consequences:**
- The Primary address is first.
- Each address shows its Address Type, full address, a Primary badge, and a Verified badge.

#### FR-26: Add and edit addresses
**Consequences:**
- Required fields: Address Type (Home, Main Work, Other Work, Vacation Home), country, address line 1, city, zip/postal code.
- Optional fields: address line 2, county, state/province.
- The country list comes from the platform, with United States, Canada and Australia pinned first.
- For US, CA and AU, address line 1 offers address suggestions. Picking a complete suggestion fills the remaining fields and marks the address Verified.
- Duplicates are rejected: same country, line 1, city, zip and type.
- When editing several addresses, each one can be collapsed to a one-line summary.

#### FR-27: Primary address and removal
**Consequences:**
- Exactly one address is Primary. The first address added becomes Primary automatically.
- The user can set any address as Primary.
- The Primary address can't be deleted until another one is Primary.
- The last address can't be deleted.

---

### 4.8 Insurance *(NG-9029)*
**Description:** the user's **Insurance Policies**. Realizes UJ-2.

#### FR-28: View insurance policies
**Consequences:**
- Each **Insurance Policy** is a card showing:
  - the type as the title (e.g. "Medical Insurance") and a precedence badge
  - the Insurer, member ID and group ID
  - the subscriber's name
  - effective, expiration and cancellation dates
  - front and back card thumbnails
- Policies whose status is Deleted show a "Deleted" badge and no actions.
- With no policies, an empty state shows an **Add insurance** call to action.

#### FR-29: Add and edit an insurance policy
**Consequences:**
- **Required fields:**
  - Insurer: searchable, or new by name
  - precedence, type, and relationship to the insured
  - member ID (at least 3 characters)
  - effective date
- **Optional fields:**
  - group ID (at least 3 characters)
  - expiration date and cancellation date, which must be after the effective date; the cancellation date must also be before the expiration date
- **Subscriber details** (first and last name, email, phone, birth date) are required when the relationship isn't Self.
  - The subscriber's email can't be the user's own login email.
  - The subscriber must be 18–120 years old.
- Only one Primary policy is allowed per insurance type. If the user picks Primary while another policy of that type is Primary, the app offers to demote the other one.
- Front and back card images: PNG or JPEG, up to 10 MB and 6000×4000 px. They are previewed before upload and stored privately. SVG is not accepted, because it can carry script.
- The policy saves first, then the card images upload. If an upload fails, the policy stays saved and the card shows the image as missing with **Retry upload**.

#### FR-30: Delete an insurance policy
**Consequences:** asks for confirmation. The platform either marks the policy Deleted (it then shows a Deleted badge) or removes it from the user's list. The UI reflects whichever comes back.

#### FR-31: View card images
**Consequences:** the user can open the card images full-size. Images are only ever fetched with the user's session.

---

### 4.9 Medical *(Epic 2, placeholder)*
**Description:** the Medical tab is part of this product, but its content will be defined in a separate epic. The PM will provide the description.

#### FR-32: Medical tab placeholder
**Consequences:**
- The Medical tab is visible.
- It shows a "Coming soon" empty state that describes what will appear there.
- It makes no API calls until Epic 2 defines it.

**Notes:** `[NOTE FOR PM]` Epic 2 must define the data model. Today the platform has no structured medical-profile endpoint; the candidates are encounters, uploaded medical records and questionnaire answers.

## 5. Cross-Cutting Non-Functional Requirements
- **NFR-1 Security and privacy:**
  - Access and refresh tokens are stored only in `httpOnly`, `Secure`, `SameSite` cookies. Page JavaScript can never read them, and they are never returned in a response body.
  - Every 1health API call goes through the app's server-side proxy, which attaches the token. The browser never sees the Bearer token (matching Confluence: "no token is ever handed to the browser").
  - A Content Security Policy blocks inline and third-party scripts, except the address-suggestion provider.
  - Request/response debug logging is off in production builds. In other builds it redacts tokens, SSN and secrets.
  - User-uploaded images are served only as raster images (PNG/JPEG/BMP), never rendered as documents.
  - Health data (PHI/PII) is never written to analytics or to client storage, except the unsaved drafts allowed by FR-2, which exclude the SSN and Signature.
- **NFR-2 Accessibility:** WCAG 2.1 AA, keyboard-only use of every flow, visible focus, and reduced-motion support (1health design system rules).
- **NFR-3 Design system:** only 1health design tokens, no hard-coded colors. Red is reserved for destructive actions and errors. Light theme by default, with dark theme supported.
- **NFR-4 Performance:**
  - First meaningful content within 2.5 s on a typical broadband connection after launch.
  - Section reads load in parallel, and each Section shows its own skeleton instead of blocking the page.
- **NFR-5 Reliability:** a failure in one Section's read or save never blocks the other Sections.
- **NFR-6 Environments:** works against demo and production. The environment comes from the launch, and API base URLs are never hard-coded per call.
- **NFR-7 Browser support:** the latest two versions of Chrome, Edge, Safari and Firefox, plus iOS Safari and Android Chrome.

## 6. Integration, Dependencies and Rollout
- **External Application registration:** the app is registered in each environment (demo, then production) with a launch URL, icon and launch secret. It must be **Active**, and **allowed for patients**, or patients can't see it. Owner: Daniel Garcia.
- **1health-fe cutover:** a flag in 1health-fe makes the sidebar's **Personal Profile** item launch this app instead of routing to `/profile`. This change lives in the 1health-fe repository and is a release dependency. Owner: Daniel Garcia.
  - `/profile` stays reachable. It is the rollback path, and it serves users who can't launch external apps (MTA, Customer Support). Old `/profile?tab=N` links keep working.
  - `/profile` is removed in a later release, once usage of the new app is confirmed and those users have an alternative.
- **Option lists:** Person, ContactPoint and Insurance value lists come from the platform type metadata. Gender identity options and Address Types are fixed lists in the app, matching today.
- **Rollout:** demo first, with QA following UJ-1 to UJ-5. Then production, behind the 1health-fe flag.
- **Rollback:** turn the flag off, so the sidebar returns to `/profile`. If sessions must also end, set the app's `isAllowedForPatients` to false or call the platform's token revocation for the app. Disabling the app alone does **not** revoke tokens.
- **Timeline (all scope on 2026-10-29):**
  - feature freeze on 2026-10-22
  - demo QA complete by 2026-10-24, otherwise the production cutover is a **no-go** and moves to the next release
  - the 1health-fe flag ships independently

## 7. Non-Goals
- Editing *another* person's profile (the provider Patient Chart).
- Account settings (password, locale, time zone) and tenant or organization settings.
- Changing a saved Contact Point's value or type in place (platform rule: remove and re-add).
- Defining Medical content (Epic 2).
- Native mobile apps. The app is a responsive web app.

## 8. Success Metrics
**Primary**
- **SM-1: Parity.** Every task in UJ-1 to UJ-4 can be completed in the new app on demo and production before cutover. 100% of today's capabilities are mapped to FRs. Validates FR-9 to FR-31.
- **SM-2: Save success rate.** At least 98% of Section saves succeed on the first attempt. Validation errors are caught on the client, not by the platform. Validates FR-4, FR-5, FR-7.

**Secondary**
- **SM-3: Fewer profile support tickets.** Fewer contact-verification and primary-change support tickets than in the 30 days before cutover. Validates FR-17, FR-18, FR-21, FR-22.
- **SM-4: Legacy retired.** `/profile` in 1health-fe is removed once the flag has been on in production for one full release with no rollback, and MTA/Customer Support have an alternative.

**Counter-metrics**
- **SM-C1: Don't inflate Save all usage.** Save all must not hide partial failures. Track the "Save all with ≥1 failure" rate, and don't optimize the number of Save all clicks. Counterbalances SM-2.
- **SM-C2: Don't relax validation.** Don't loosen platform validation to raise the save success rate. Counterbalances SM-2.

## 9. Open Questions
1. What is the Medical tab's content and data source? Owner: PM. Revisit when Epic 2 is defined.
2. Does the portal embed the app (iframe) or open it in a new tab? An embedded app needs third-party cookies, which Safari blocks. Owner: Daniel Garcia (architecture decision).
3. Address suggestions send typed home addresses to Google Places. Is that acceptable for privacy and compliance, or do we need a different provider or server-side proxying? Owner: Daniel Garcia. Resolve before go-live.
4. What order does Save all use, given Primary contact switches and automatic verification? Owner: Architecture.
5. Keyboard-only users can't draw a Signature (NFR-2). Should there be an alternative, such as uploading a signature image? Owner: UX.
6. Providers and staff launching from an organization tenant get a token pinned to that tenant. Does the app require the default tenant (as today) and explain that when launched elsewhere? Owner: Architecture.

## 10. Assumptions Index
**Open**
- FR-14: no typed-signature alternative in v1.

**Confirmed 2026-10-13**
- FR-2: drafts are restored after relaunch.
- FR-13: a revealed SSN hides after 30 s.
- FR-24: zero social links are allowed.
