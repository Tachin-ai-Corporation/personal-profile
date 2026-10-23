# Feature parity: `1health-fe` → Personal Profile rebuild

Audit date: 2026-10-22 (branch `test/NG-9019-e2e-full-journey`, at `3b102fe`). Source of truth: `../1health-fe/src` (legacy). Backend: `../1h-ng-bo-core-be`.

Scope covers the two replicated screens:

- **Personal Profile** (`/`, Team A, Epics 1–5)
- **Account** (`/account`, Team B, Epics 7–10)

Medical is out of scope on purpose (Epic 6 is on hold).

## How to read this

- **Paths.** `fe:` paths are relative to `1health-fe/src/` and `pp:` paths are relative to this repo. `epics.md` means `_bmad-output/planning-artifacts/epics.md`, and `spec-*` and `deferred-work.md` are in `_bmad-output/implementation-artifacts/`.
- **Statuses.**
  - **MATCH**: same behaviour or copy. The transport may have changed, for example a call now goes through the BFF.
  - **DIFF-INTENTIONAL**: different, and backed by a story AC, a decision (D-n, RC-n, PA-n, FR-n, AD-n) or a spec decision. The Notes column cites it.
  - **DIFF-GAP**: missing or different without a documented decision.
  - **NEW-ONLY**: only the new app has it.
- **Copy.** Much of the new copy is marked DRAFT in `lib/shared/messages/*`. A DIFF-INTENTIONAL on copy means the new wording was specified, not that PM signed it off.
- **Story status** (`sprint-status.yaml`): 9.2 and 9.3 were **backlog** at audit time; they merged in #48 (`cdde11c`, 2026-10-23) and their gaps below are marked resolved. 10.1–10.3 were in review. Every other in-scope story is done.

## 1. Summary

Counts come from the checklist rows in §2–§3.

| Screen | Section | Rows | MATCH | DIFF-INTENTIONAL | DIFF-GAP | NEW-ONLY |
|---|---|---|---|---|---|---|
| Personal Profile | 2.1 Page shell and tabs | 9 | 3 | 2 | 1 | 3 |
| Personal Profile | 2.2 Header and profile picture | 12 | 4 | 4 | 2 | 2 |
| Personal Profile | 2.3 Personal Information | 49 | 12 | 29 | 2 | 6 |
| Personal Profile | 2.4 Phone | 54 | 15 | 33 | 2 | 4 |
| Personal Profile | 2.5 Email | 21 | 7 | 12 | 1 | 1 |
| Personal Profile | 2.6 Social Media | 13 | 3 | 8 | 0 | 2 |
| Personal Profile | 2.7 Location Addresses | 40 | 7 | 27 | 3 | 3 |
| Personal Profile | 2.8 Insurance | 38 | 7 | 28 | 1 | 2 |
| Account | 3.1 Page and tabs | 9 | 2 | 4 | 0 | 3 |
| Account | 3.2 Personal Account Settings | 48 | 15 | 24 | 3 | 6 |
| Account | 3.3 Authenticator app (MFA) | 26 | 8 | 15 | 0 | 3 |
| Account | 3.4 Individual Provider Registration | 38 | 14 | 9 | 12 | 3 |
| Account | 3.5 My Organizations | 26 | 9 | 14 | 2 | 1 |
| **Total** | | **383** | **106** | **209** | **29** | **39** |

The rebuild reaches functional parity with the legacy app on the Personal Profile and on Account → Personal Account. Almost every difference traces back to a story or decision. The real gaps are:

1. ~~**Individual Provider Registration is only half built.**~~ Resolved 2026-10-23: Stories 9.2 (Register) and 9.3 (registered view) merged in #48. Remaining intentional differences from legacy (parallel availability checks, errors under the field, the practice-name fallback, the CTA handoff, DRAFT COPY) are listed in the story specs.
2. **Enter portal lands on the portal root instead of inside the organization.** This is a documented degradation (OQ1).
3. **A few small undocumented behaviour differences**:
   - ~~Changing the country doesn't clear the address fields.~~ Resolved 2026-10-23 (NG-9026).
   - ~~The insurance Relationship options are in a different order from the backend.~~ Resolved 2026-10-23 (NG-9029).
   - A locale written by the legacy app (`en-us`) shows as raw text.
   - The Maps link, Verify in edit view, the Privacy/Terms/Dark mode menu items and a few legacy MIME types are gone.

---

## 2. Personal Profile (`/`)

### 2.1 Page shell and tabs

| Item | Legacy (file:line) | New (file:line) | Status | Notes |
|---|---|---|---|---|
| Tab names "Contacts" / "Insurance" / "Medical" | fe:views/privatePages/ProfilePage/ProfileInfo.tsx:207-209 | pp:lib/shared/messages/shell.ts:8-10; pp:features/shell/page-tabs-config.ts:26-41 | MATCH | Same three tabs in the same order. |
| Medical tab state | fe:ProfileInfo.tsx:209 (`disabled`), :219 (empty panel) | pp:features/shell/page-tabs-config.ts:40; page-tabs.tsx:59-60; profile-tabs.tsx:37 | DIFF-INTENTIONAL | Now selectable, with a "Coming soon"/"Soon" tag and a quiet panel (epics.md:1259, 1308; RC9 epics.md:333). Epic 6 is on hold. |
| Tab URL / deep link | fe:ProfileInfo.tsx:73 (`useTabs`, numeric index) | pp:features/shell/nav-types.ts:10-12 | NEW-ONLY | `?tab=contacts\|insurance\|medical`, normalized with replace (epics.md:1263-1270). |
| Tablist name | none | pp:lib/shared/messages/shell.ts:16 ("Profile sections") | NEW-ONLY | |
| Section navigation | fe:…/ContactInfo/ContactInfo.tsx:23-51 (plain stack; h5 "Additional Contact Information" at :34) | pp:features/shell/anchors.ts:11-17; section-nav.tsx:251,292 | DIFF-INTENTIONAL | Numbered menu from "01 Personal information" to "05 Addresses", or "Jump to" below 768 px (epics.md:1276-1298). The group heading is gone. |
| Section order: Personal, Phone, Email, Social, Addresses | fe:…/ContactInfo/ContactInfo.tsx:38-49 | pp:features/shell/anchors.ts:11-16 | MATCH | |
| Page title | none (route fe:route/AppRoute.tsx:1225) | pp:app/layout.tsx:24 ("Personal Profile") | NEW-ONLY | |
| Access gate (default tenant only) | fe:route/AppRoute.tsx:1222 | pp:lib/server/launch/launch.ts:157 (403 `WRONG_TENANT`) | MATCH | Same rule, now enforced at launch. |
| Global user menu / context switcher | fe:components/AppHeaderV2/components/UserMenu.tsx:73-155 (My Account, Profile, Provider registration, My organizations, Privacy, Terms, Dark mode, Sign out); ContextSwitcherV2.tsx:195 | pp:features/shell/app-bar.tsx:16; page-nav.tsx:10-11,33; return-link.tsx:35 | DIFF-GAP | The app bar has the wordmark, a Pages nav (Personal Profile / Account) and "Return to 1health" (epics.md:1249-1254, D4/D11). **Privacy, Terms and Dark mode** have no decision. |

### 2.2 Header and profile picture

| Item | Legacy (file:line) | New (file:line) | Status | Notes |
|---|---|---|---|---|
| Header name | fe:…/ContactInfo/ProfileInfoCard/ProfileInfoCard.tsx:50,119,127 (`h3`, CSS `capitalize`) | pp:features/header/names.ts:4-7; profile-header.tsx:193 (`h1`) | DIFF-GAP | The CSS capitalization is gone (P3). Using `h1` is intended (epics.md:1353). The username fallback exists only in the new app. |
| Avatar source | fe:ProfilePageQueries.ts:38-57 (GraphQL); ProfilePicture.tsx:21 (`/user/profile-picture/preview?v=`) | pp:lib/api/profile-picture.ts:27-29,87-89; features/header/use-profile-picture.ts:16-19 | MATCH | GraphQL moved server-side into the named op `/api/pp/profile-picture-id` (epics.md:1365-1376). |
| Avatar with no picture | fe:ProfilePicture.tsx:54 (MUI default icon) | pp:features/header/profile-header.tsx:18-27 | NEW-ONLY | Initials, or a user icon (epics.md:1381). |
| Avatar control name "Change profile picture" | fe:ProfilePicture.tsx:54 (`title`, clickable Avatar) | pp:features/header/profile-header.tsx:98-113 | MATCH | Now a real `<button>` with a camera badge, shown only on `/` (epics.md:1391, 1408). |
| Picture accept list | fe:ProfilePicture.tsx:51; fe:utils/appEnums/AppEnums.ts:232-234 (includes `image/x-png`, `image/x-citrix-*`, `image/pjpeg`) | pp:features/header/picture-file.ts:10,25-46 | DIFF-GAP | The new app also requires a matching extension. Files typed `image/x-png` or `image/x-citrix-jpeg/png` are rejected (P3). |
| Picture size limit 6 MB | fe:utils/AppUtils.ts:37; ProfileInfoCard.tsx:80 | pp:features/header/picture-file.ts:13 | MATCH | |
| Picture change flow | fe:ProfileInfoCard.tsx:70-109 (uploads immediately, no preview) | pp:features/header/change-picture-dialog.tsx:219-328 | DIFF-INTENTIONAL | Preview dialog (epics.md:1417-1431). |
| Invalid picture copy | fe:ProfileInfoCard.tsx:81 (toast "Unsupported files and images larger than 6mb are not acceptable.") | pp:lib/shared/messages/header.ts:10,13 | DIFF-INTENTIONAL | epics.md:1420-1428. |
| Success copy | fe:ProfileInfoCard.tsx:101 ("Picture uploaded successfully") | pp:lib/shared/messages/header.ts:18 ("Profile picture saved.") | DIFF-INTENTIONAL | epics.md:1460. |
| Upload endpoint | fe:config/axios/apis/bocore/bocore.ts:65-90 (`?fileName=<orig>&isPublic=true`) | pp:lib/api/profile-picture.ts:33,63-69 (no query; re-encoded JPEG ≤4 MB) | DIFF-INTENTIONAL | spec-1-10:28; epics.md:1446. |
| Delete of the old picture | fe:ProfileInfoCard.tsx:92-93 → bocore.ts:45-46 (`?hardDelete=true`) | pp:lib/api/profile-picture.ts:76-80 (named op `DELETE /api/pp/file/{id}`) | MATCH | Ownership is now checked on the server (deferred-work.md:393). |
| Primary phone/email in the header | none | pp:features/header/profile-header.tsx:196-205; use-primary-contacts.ts:16-27 | NEW-ONLY | Desktop only (epics.md:1359). |

### 2.3 Personal Information

| Item | Legacy (file:line) | New (file:line) | Status | Notes |
|---|---|---|---|---|
| Section title | fe:…/PersonalInformationWrapper/PersonalInformationWrapper.tsx:550 ("Personal Information") | pp:lib/shared/messages/shell.ts:28 ("Personal information") | DIFF-INTENTIONAL | epics.md:1917. |
| Data source | fe:PersonalInformationWrapper.tsx:286-294; ProfilePageQueries.ts:1-36 (GraphQL Person) | pp:features/personal/personal-section.tsx:341 (`useMyself`) | DIFF-INTENTIONAL | epics.md:1918, "no GraphQL". |
| Read view field set and order | fe:…/PersonalInfoCard/PersonalInfoCard.tsx:39-237 (Full Name, Prefix, Suffix, Other Names, Titles, City of Birth, Birth Date, Race, Ethnicity, Biological Gender, Gender Identity, Sexual Orientation, SSN), signature at :250 | pp:features/personal/personal-section.tsx:74-92 | DIFF-INTENTIONAL | F1 order, with First, Middle and Last as separate rows (epics.md:1922). |
| Label casing | fe:PersonalInfoCard.tsx:39 "Full Name", :54 "Name Prefix", :134 "Birth Date", :184 "Biological Gender", :232 "Social Security Number" | pp:lib/shared/messages/person.ts:19-29; fields.ts:9-12 | DIFF-INTENTIONAL | Sentence case, and "SSN" (epics.md:1922). DRAFT copy. |
| Empty values | fe:PersonalInfoCard.tsx:48,64,…,226 (row hidden) | pp:features/shell/key-value-table.tsx:40; lib/shared/display-value.ts:18-27 | DIFF-INTENTIONAL | "Not provided" (epics.md:1927). |
| Unset Race / Ethnicity / Biological gender in read view | fe:PersonalInformationWrapper.tsx:319-321 (shows "Unknown" / "Asked but not answered") | pp:personal-section.tsx:85-87 | DIFF-INTENTIONAL | Shows "Not provided" (epics.md:1927). |
| Birth date display | fe:PersonalInfoCard.tsx:139 (MM/DD/YYYY; hidden when the age is out of range, Wrapper:318) | pp:personal-section.tsx:83 (`wireToDisplayDate`) | MATCH | The new app also shows an out-of-range date that is already saved. |
| Array values | GraphQL arrays, first value that isn't n/a (Wrapper:47-51) | pp:lib/api/myself.ts:70,110-112 | DIFF-INTENTIONAL | `myself` sends strings (spec-2-1:44). |
| SSN read | fe:PersonalInfoCard.tsx:236-237 (`socialSecurityNumberPreview`) | pp:personal-section.tsx:58-61; ssn-field.tsx:200-230 | MATCH | The mask matches. Reveal/Hide through `GET v2/person/me/ssn/expose` is new (epics.md:2126). |
| Signature read, "No signature available!" | fe:PersonalInfoCard.tsx:251 (img 300×100, alt "Signature"), :254 | pp:personal-section.tsx:64-67; shell.ts:33-34 | DIFF-INTENTIONAL | 112×32 thumbnail with alt "Your signature". A missing or broken image reads "Not provided" (epics.md:1954-1958). "Added {date}" is omitted (deferred-work.md:54). |
| Signature download | fe:bocore.ts:5-6 (blob) | pp:features/shell/signature-thumb.tsx:30 (`/api/1h/v2/file/{id}/download`) | MATCH | epics.md:1954. |
| Load error | fe:PersonalInformationWrapper.tsx:341 (toast) | pp:lib/shared/messages/state.ts:10,13 ("Couldn't load personal information" + Retry) | DIFF-INTENTIONAL | epics.md:1972-1975. |
| Edit/Cancel/Save placement | fe:PersonalInformationWrapper.tsx:517-537 (in the header) | pp:personal-section.tsx:483-487; features/shell/section-footer.tsx:76-89 | DIFF-INTENTIONAL | Footer with "Unsaved changes" and "Editing" (epics.md:2005-2008). |
| Edit field order | fe:…/PersonalInformationForm/PersonalInformationForm.tsx:55-461 | pp:personal-section.tsx:249-279,515-531 | DIFF-INTENTIONAL | F1 order, Prefix first (epics.md:2013). |
| "(optional)" marker | none | pp:features/personal/schema.ts:95-103; key-value-table.tsx:182 | NEW-ONLY | epics.md:2027. |
| Field placeholders | fe:PersonalInformationForm.tsx:63,79,96,115… ("Middle name", "Name prefix", "City of birth", …) | only Birth date "MM/DD/YYYY" (pp:lib/shared/messages/controls.ts:12) | DIFF-GAP | Nothing decides to drop them (P3). |
| First / Last name required | fe:PersonalInformationWrapper.tsx:163,174 ("First Name cannot be empty") | pp:lib/shared/messages/person.ts:9-10; schema.ts:184,186 | DIFF-INTENTIONAL | PA4 copy (epics.md:2038). |
| Name max length | none | pp:lib/shared/person-rules.ts:11,14; messages/person.ts:11-12,42,44 | DIFF-INTENTIONAL | ≤24, and ≤10 for Prefix and Suffix (epics.md:2038; spec-2-2:30). |
| Name character set | fe:Wrapper.tsx:165-167; validators/validatorConstants.ts:11 (allow-list; rejects `( ) , ? = _ $ +`) | pp:lib/shared/person-rules.ts:27; messages/person.ts:38 | DIFF-INTENTIONAL | A deny-list of control characters and emoji (epics.md:2040), so it accepts more than legacy. |
| Birth date required / format | fe:Wrapper.tsx:214-215 | pp:messages/person.ts:13-14; schema.ts:190-198 | DIFF-INTENTIONAL | epics.md:2045. |
| Birth date age rule 18 (21 for Proctor) to 120 | fe:Wrapper.tsx:221-231 | pp:lib/shared/person-rules.ts:62-81; messages/person.ts:15 | MATCH | Same rule. The copy is "You must be between {min} and {max} years old" (epics.md:2033, 2045). |
| Birth date calendar bounds | fe:PersonalInformationForm.tsx:180-181 | pp:person-rules.ts:95-99; personal-section.tsx:173-174 | MATCH | |
| City of birth ≤128 | fe:Wrapper.tsx:189 | pp:schema.ts:199; messages/person.ts:40 | DIFF-INTENTIONAL | New copy (epics.md:2062). |
| Sexual orientation | fe:Wrapper.tsx:198,207 (≤128 plus the LGBT regex) | pp:schema.ts:204; messages/person.ts:34 | DIFF-INTENTIONAL | epics.md:2062. |
| Race / Ethnicity / Biological gender required copy | fe:Wrapper.tsx:237,244,251 ("Race cannot be empty") | pp:schema.ts:160; messages/person.ts:36 ("Choose a value") | DIFF-INTENTIONAL | epics.md:2052. |
| Race / Ethnicity / Biological gender option source | fe:Hooks/useValueListOptions.ts:40-48 (`type/key/Person`, n/a dropped, localeCompare) | pp:features/personal/use-person-options.ts:54-91; lib/shared/person-options.ts:80-85 | DIFF-INTENTIONAL | Same source and sort, intersected with the `user/edit` enums (deferred-work.md:42). |
| Race fallback list | none | pp:lib/shared/person-options.ts:19-29 | NEW-ONLY | epics.md:1963. |
| Ethnicity fallback list | none | pp:person-options.ts:32 | NEW-ONLY | epics.md:1963. |
| Biological gender fallback | none | pp:person-options.ts:42-45 | NEW-ONLY | Only "Asked but not answered" plus the current value. |
| Unset picker defaults | fe:Wrapper.tsx:319-322 (preselected but not dirty, not sent) | pp:use-person-options.ts:43-48; personal-section.tsx:464-469 | DIFF-INTENTIONAL | Preselects count as changes and are sent (epics.md:2052, 2058). |
| Gender identity list | fe:…/ContactInfo/ContactInfoUtils.ts:12-17; ContactInfoEnums.ts:8-13 | pp:person-options.ts:35 | MATCH | Asked but not answered, Female, Male, Other. |
| Gender identity free text | fe:PersonalInformationForm.tsx:354-379 (freeSolo with an "Add {label}" row) | pp:personal-section.tsx:182-201 | DIFF-GAP | Free text is still accepted, but there is no "Add …" row (P3). |
| Gender identity required copy | fe:Wrapper.tsx:258 | pp:schema.ts:203 ("Choose a value") | DIFF-INTENTIONAL | |
| SSN validation | fe:Wrapper.tsx:264-266; validatorConstants.ts:82 | pp:schema.ts:205-207; messages/person.ts:65 | DIFF-INTENTIONAL | "Enter all 9 digits of your SSN" (epics.md:2167). |
| SSN input formatting | fe:PersonalInformationForm.tsx:448 (`formatSSN`) | pp:features/personal/ssn.ts; ssn-field.tsx:357 | MATCH | |
| SSN taken error | upstream toast | pp:lib/api/errors/personal.ts:10-11; messages/person.ts:16 | NEW-ONLY | Shown on the field (epics.md:2175). |
| Save endpoint `PUT v2/user/edit` | fe:config/axios/apis/user/user.ts:44-45 | pp:lib/api/personal.ts:113-116; lib/server/proxy/allowlist/personal.ts:101 | MATCH | |
| Diff: only changed fields, trimmed | fe:Wrapper.tsx:361-410 | pp:schema.ts:265-275 | MATCH | |
| Cleared optional field sends "n/a" | fe:Wrapper.tsx:370-406; AppUtils.ts:56 | pp:schema.ts:106,270 | MATCH | |
| birthDate wire format YYYY-MM-DD | fe:Wrapper.tsx:367 | pp:schema.ts:241-244 | MATCH | |
| SSN diff (masked skipped; empty → "n/a") | fe:Wrapper.tsx:405-406 | pp:schema.ts:252-256 | MATCH | |
| Save success | fe:Wrapper.tsx:413-418 ("Profile updated successfully") | pp:lib/shared/messages/section.ts:7 ("Personal information saved."); personal-section.tsx:389 | DIFF-INTENTIONAL | The refresh matches (epics.md:2082). |
| Save errors | fe:Wrapper.tsx:67,71 (toasts) | pp:section.ts:8-9; person.ts:84; features/shell/use-section-form.ts:454-458 | DIFF-INTENTIONAL | Inline with Retry (epics.md:2091). |
| Signature control | fe:components/Common/SignatureWidget/SignatureWidget.tsx:57-72 (draw only) | pp:features/personal/signature-pad.tsx:383-405; person.ts:68-74 | DIFF-INTENTIONAL | Adds "Clear" and "Upload image instead" (RC7 epics.md:331; :2212-2214). |
| Signature upload | fe:bocore.ts:65-90 (`?fileName=signature<username>.png&isPublic=false`) | pp:lib/api/personal.ts:123-143 | DIFF-INTENTIONAL | epics.md:2246-2247. |
| Signature replace | fe:Wrapper.tsx:59-64 → bocore.ts:17-21 (`/file/{id}/version`) | pp:features/personal/signature-save.ts:17-24 (upload, then an ownership-checked delete) | DIFF-INTENTIONAL | Human decision 2026-10-16 (spec-2-4:64-67; deferred-work.md:37). |
| Signature remove | fe:Wrapper.tsx:61 (no confirm) | pp:personal-section.tsx:406-409,542-550; person.ts:80-82 | DIFF-INTENTIONAL | "Remove your signature?" confirm (epics.md:2262). |
| Save order | fe:Wrapper.tsx:454-470 (parallel `allSettled`) | pp:signature-save.ts (PUT, then the signature) | DIFF-INTENTIONAL | epics.md:2240. |
| Proxy allowlist entries and enums | n/a | pp:lib/server/proxy/allowlist/personal.ts:33-47,101-124 | NEW-ONLY | The enums match the backend's PersonConstants.java:581-660. |

### 2.4 Phone

Abbreviations: PW = `fe:views/privatePages/ProfilePage/components/ContactInfo/components/PhoneWrapper/PhoneWrapper.tsx`, CPI = `…/ContactPointInfo/ContactPointInfo.tsx`, MN / MNR = `fe:components/ContactPoint/MobileNumber/MobileNumber.tsx` / `MobileNumberRow.tsx`, ABC = `fe:components/ProfileCard/components/ActionButtonsContactPoint/ActionButtonsContactPoint.tsx`. PS / PSC = `pp:features/contacts/phone-section.tsx` / `phone-schema.ts`, CV = `pp:features/contacts/contact-verify.tsx`, CP = `contact-primary.tsx`, CEK = `contact-edit-kit.tsx`, CM = `pp:lib/shared/messages/contacts.ts`, CL = `pp:lib/shared/contact-labels.ts`, API = `pp:lib/api/contacts.ts`.

| Item | Legacy (file:line) | New (file:line) | Status | Notes |
|---|---|---|---|---|
| Section heading "Phone" | PW:421 | pp:lib/shared/messages/shell.ts:29; PS:747 | MATCH | |
| Read layout | CPI:72-98 (icon, "Label:", number) | pp:features/shell/anchors.ts:44-50; PS:221-233 (table: Number · Label · Type · Status · Notifications) | DIFF-INTENTIONAL | Story 3.1 AC. |
| Number format | PW:397 (`+1 415 551-2125`) | PS:106-115 (flag plus `+1 (415) 551-2125`) | DIFF-INTENTIONAL | Story 3.1. |
| Type column (Mobile/Landline) | not shown | PS:229; PSC:150-154 | NEW-ONLY | Story 3.1. |
| Primary row first | PW:142-146 | PS:98-103 | MATCH | |
| Order of the other rows | one mixed list (PW:151-159) | PS:98-99 (Mobile, then Landline) | DIFF-INTENTIONAL | AD-10 (two reads, one per type). |
| A second Primary-labelled row | bell on every Primary row (CPI:108) | PS:100-102 (only the `findPrimary` row) | DIFF-INTENTIONAL | spec-3-1, review row 1. |
| Primary indicator | "Primary:" label text (CPI:81) | PS:227 (Primary chip) | DIFF-INTENTIONAL | Story 3.1. |
| Verified status | check icon with "Verified" tooltip (CPI:52-59) | CV:70 ("Verified" badge) | MATCH | |
| Unverified status | Verify button only (CPI:60-69) | CV:73; PS:182 ("Not verified" badge plus a Verify action) | DIFF-INTENTIONAL | Stories 3.1, 3.3. |
| Status hidden on | Home rows **and Landlines** (CPI:134) | CV:69 (Home rows only) | DIFF-INTENTIONAL | Story 3.1 AC. Landlines now show a "Not verified" badge they can never clear. Needs product confirmation (§4). |
| When Verify is offered (Mobile, not Home, unverified, saved) | CPI:134; MNR:120 | PS:123-124 | MATCH | |
| Verify request `POST v2/health/contact-point/verify {contactPointIds}` | fe:utils/verify.ts:5-8; fe:config/axios/apis/profile/profile.ts:25-27 | API:288-291,329 | MATCH | Sent in chunks of 10. |
| Verify feedback | success/error toasts (verify.ts:10-16) | CV:67-83,155-180 ("Link sent · Resend in {n} s") | DIFF-INTENTIONAL | Story 3.3. The 60 s countdown vs the 60 min backend cooldown is open (deferred-work.md:59-61). |
| Action text after a send | "Verify" | CV:93 ("Resend verification") | DIFF-INTENTIONAL | Story 3.3. |
| Verify in edit view | MNR:35-65,120 (Verify on saved unverified Mobiles) | PS:419-426 (status badge only) | DIFF-GAP | No decision found (P3). |
| OTP entry | none (link-based) | none | MATCH | |
| Auto-verify after save | PW:179-189,280-288 | API:228-233; PS:596 | MATCH | Matched by new id. |
| Notifications, read view | bell with tooltip (CPI:108-131) | PS:203-210; CEK:52-59 ("On" / "Off" / "—") | DIFF-INTENTIONAL | Story 3.1, RC3. |
| Notifications, edit control | IconButton `aria-label="toggle notifications"` (MNR:88-118) | CEK:170-186; PS:356-365 (Switch "Notifications for {number}") | DIFF-INTENTIONAL | Story 3.4. |
| Notifications on the Primary only | MNR:88 | PS:434 | MATCH | RC3. |
| Becoming Primary turns notifications on | MN:50-54 | API:202 | MATCH | |
| Update payload | PW:217,233-241 | API:54-60,121-123,205 | DIFF-INTENTIONAL | Story 3.1 DTO shape; only changed rows are sent. |
| How Make primary works | pick the "Primary" label in edit, then Save, then confirm (MN:57-88; PW:346-355) | PS:183-186; CP:84-177 (read-view action plus a confirm) | DIFF-INTENTIONAL | Story 3.4. |
| Primary eligibility | MN:57-88 | PS:140,151-157 | MATCH | RC2 (epics.md:326). |
| The old Primary | demoted by hand (PW:323-332) | API:193-206; CL:19 (relabelled "Old" automatically) | DIFF-INTENTIONAL | AD-9. |
| A Landline can't be Primary | MN:67-69 | PS:153 | MATCH | |
| Primary confirm copy | PW:94-98,458-459 | CM:37-39; CP:157-163 | DIFF-INTENTIONAL | Story 3.4. |
| Confirm Cancel | reverts the whole edit (PW:454-456) | closes, sends nothing | DIFF-INTENTIONAL | Story 3.4. |
| Client-side Primary rules | PW:323-344 (toasts) | CM:44-48; pp:lib/api/errors/contacts.ts:37-67 | DIFF-INTENTIONAL | Stories 3.2, 3.4. |
| Footnote "Changing your primary phone changes how you sign in." | none | PS:815-817 | NEW-ONLY | Story 3.4. |
| Header and footer actions | ABC:41-95 ("Edit"; in edit: "Add New" / "Cancel" / "Save") | PS:720-738,788 | DIFF-INTENTIONAL | Story 3.2. |
| Empty state | CPI:37-46 ("Not Provided") | CM:8,16; PS:771,796 ("No phones yet" + "Add phone") | DIFF-INTENTIONAL | Story 3.1. |
| Edit with no phones opens one empty row | PW:370-372 | PS:723 | MATCH | |
| Where a new row goes | PW:375-385 (top; only once the other rows are valid) | PS:633-640 (bottom, no validity check) | DIFF-GAP | Not documented (P3). |
| New number input | MN:111-149 | PS:315-343; CM:20 | DIFF-INTENTIONAL | Story 3.2. |
| Type control | MN:188-205 ("Mobile" checkbox, on by default) | PS:409-416; PSC:146 (Select Mobile/Landline, no default) | DIFF-INTENTIONAL | Story 3.2. |
| Label control | MN:156-186 (Autocomplete) | PS:399-407,549 (Select, Primary removed) | DIFF-INTENTIONAL | Story 3.2. |
| Label option list | fe:…/ContactInfo/ContactInfoUtils.ts:19-31 (every tenant `ContactPoint.label` except the default) | CL:11,36-40 (enum ∩ type key, enum order, minus Primary) | DIFF-INTENTIONAL | Story 3.1 AC. Legacy could also offer Main Work, Other Work, Vacation Home and Partnership Organization. |
| Type-key failure | PW:404-408 (phones never load) | CL:38 (falls back to the enum) | DIFF-INTENTIONAL | Story 3.1. |
| A saved number is locked | MN:147-148,198 | PS:347-350; CM:19 | MATCH | The help line is new. |
| The Primary's label | editable (PW:313-344) | PS:263,405-406 (locked chip) | DIFF-INTENTIONAL | Story 3.2. |
| Required messages | PW:52-58 | PSC:80-124 | DIFF-INTENTIONAL | Story 3.2. |
| Number format rule | fe:utils/phoneNumber/phoneNumberUtils.ts:54-70; validatorConstants.ts:56 | PSC:80-86 (libphonenumber) | DIFF-INTENTIONAL | Story 3.2. |
| Duplicate number | PW:62-72 | PSC:116 | DIFF-INTENTIONAL | Same rule, new copy. |
| Remove | MNR:121-123; PW:444 (immediate) | PS:301-305,777-785 (struck through until Save, with Restore) | DIFF-INTENTIONAL | Story 3.2. |
| Remove the Primary | allowed, then Save fails (PW:334-344) | PS:303 ("Make another phone primary first") | DIFF-INTENTIONAL | Story 3.4. |
| Row menu in read view | none | PS:179-201; pp:features/shell/row-actions.tsx:106 | NEW-ONLY | Stories 3.1–3.4. |
| Limit of 20 per type | backend only | PSC:17,66-78; CM:18 | NEW-ONLY | Story 3.2. |
| Save endpoint `POST v2/health/contact-point` | PW:201-261; profile.ts:32-34 | API:113-119,236-262 | MATCH | |
| Read endpoint | one GET `?type=Mobile&type=Landline` (PW:151-159) | PS:526-527; pp:lib/api/contact-points.ts:87-89 (two GETs) | DIFF-INTENTIONAL | AD-10. |
| Success | PW:274 ("Profile updated successfully") | PS:590; section.ts:7 ("Phone saved.") | DIFF-INTENTIONAL | Story 3.2. |
| Load and save errors | PW:171-174,290-293 (toasts) | PS:748-757; state.ts:10,14 | DIFF-INTENTIONAL | Stories 3.1, 3.2. |
| No changes closes; Cancel reverts | PW:191-194,307-310 | PS:607-608 | MATCH | |

### 2.5 Email

EW = `fe:…/EmailWrapper/EmailWrapper.tsx`, EM / ER = `fe:components/ContactPoint/Email/Email.tsx` / `EmailRow.tsx`, ES / ESC = `pp:features/contacts/email-section.tsx` / `email-schema.ts`. Other abbreviations as in §2.4.

| Item | Legacy (file:line) | New (file:line) | Status | Notes |
|---|---|---|---|---|
| Section heading "Email" | EW:368 | pp:lib/shared/messages/shell.ts:30; ES:670 | MATCH | |
| Read layout | CPI:180-245 | ES:123-137 (Email address · Label · Status · Notifications) | DIFF-INTENTIONAL | Story 3.5. |
| Primary row first | EW:133-137 | ES:78-85 | MATCH | |
| Status | CPI:161-178 (check icon, or a Verify button) | ES:109-111 ("Verified" / "Not verified") | DIFF-INTENTIONAL | Story 3.5. |
| Home rows show no status or Verify | CPI:240; ER:119 | ES:96; CV:69 | MATCH | |
| Verify, auto-verify and request | CPI:240; EW:170-180,265-274 | ES:96,490-493; API:228 | MATCH | |
| Verify in edit view | ER:33-63 | ES:342-347 (badge only) | DIFF-GAP | Same as Phone (P3). |
| Notifications | CPI:216-239; ER:87-117 | ES:114-121,357 | DIFF-INTENTIONAL | Story 3.6, RC3. |
| Primary eligibility | EM:50-63 | ES:166-170 | MATCH | Same rule, new mechanism (Story 3.6). |
| Primary confirm copy | EW:82-91,405-406 | CM:37,64-65 | DIFF-INTENTIONAL | Story 3.6. |
| Client-side Primary rules | EW:295-305 | CM:68-72 | DIFF-INTENTIONAL | Story 3.6. |
| Email used by another account | backend message through the interceptor | pp:lib/api/errors/contacts.ts:125; CM:66 | DIFF-INTENTIONAL | Story 3.6. |
| New row fields | EM:86-151 ("Email Address", "Type") | ES:275-295,333 | DIFF-INTENTIONAL | Story 3.5. |
| Validation | EW:44-58 (`VALID_EMAIL_REGEX`) | ESC:50-55,97-100 (zod email, ≤254) | DIFF-INTENTIONAL | Story 3.5. Zod rejects some characters legacy allowed (`&`, `*`). |
| Duplicate (trimmed, case-insensitive) | EW:59-69 | ESC:98 | DIFF-INTENTIONAL | Same rule, new copy. |
| A saved address is locked | EM:114 | ES:298-301 | MATCH | The help line is new. |
| Remove rules | ER:120; EW:391 | ES:146-150 | DIFF-INTENTIONAL | Stories 3.5, 3.6. |
| Empty state | CPI:146-155 ("Not Provided") | CM:51-52 ("No emails yet" + "Add email") | DIFF-INTENTIONAL | Story 3.5. |
| Save payload | EW:198-207 | ES:384-397; API:113-118 | MATCH | |
| Limit of 20 | none | ESC:16; CM:56 | NEW-ONLY | Story 3.5. |
| Success toast | EW:259 ("Profile updated successfully") | ES:529 ("Email saved.") | DIFF-INTENTIONAL | Story 3.5. |

### 2.6 Social Media

SW = `fe:…/SocialMediaWrapper/SocialMediaWrapper.tsx`, SM / SMR = `fe:components/ContactPoint/SocialMedia/SocialMedia.tsx` / `SocialMediaRow.tsx`, SS / SSC = `pp:features/contacts/social-section.tsx` / `social-schema.ts`.

| Item | Legacy (file:line) | New (file:line) | Status | Notes |
|---|---|---|---|---|
| Section heading | SW:261 ("Social Media") | pp:lib/shared/messages/shell.ts:31 ("Social media") | DIFF-INTENTIONAL | Locked EXPERIENCE IA. |
| Types and labels | SW:148-167 (always "Personal", notifications off) | SS:61-64,268-281 | MATCH | Neither side has a type select. |
| Link display | CPI:30-33,265-290 (any value → `window.open`) | SS:86-121 (anchor only for safe https links; plain text otherwise) | DIFF-INTENTIONAL | Story 3.7, AD-11, PA1. |
| Field name "Link" | SM:44-48 (placeholder "Social media link") | pp:features/shell/anchors.ts:52 | MATCH | No placeholder in the new app. |
| URL rule | fe:validators/validatorConstants.ts:58 (http/https/ftp) | SSC:52-64 (https only) | DIFF-INTENTIONAL | spec-3-7:70-71, human decision 2026-10-19. |
| Messages | SW:42-47 | CM:76-77 | DIFF-INTENTIONAL | Story 3.7. |
| Duplicate | SW:49-59; SM:31 (case-sensitive) | SSC:78,116 (case-insensitive) | DIFF-INTENTIONAL | Story 3.7. |
| Editing a saved link | SW:155-168 (updated in place) | API:183-189 (removed and re-added) | DIFF-INTENTIONAL | RC4. |
| Removing the last link | SMR:15; SW:282 (blocked) | SS:508 (allowed) | DIFF-INTENTIONAL | Story 3.7 AC. |
| Lock on a Primary-labelled legacy link | none | SS:83-84,141; SSC:66-69 | NEW-ONLY | spec-3-7:72. |
| Read-view menu and limit of 20 | none | SS:139-151; SSC:16-19 | NEW-ONLY | Story 3.7. |
| Which rows are validated | SW:39-48 (all rows) | SSC:112 (new or changed rows) | DIFF-INTENTIONAL | spec-3-7:124. |
| No verify; read endpoint | SW:106-114,195-208 | SS:318; pp:lib/api/contact-points.ts:87 | MATCH | |

### 2.7 Location Addresses

LAW = `fe:…/LocationAddressWrapper/LocationAddressWrapper.tsx`, LAC = `…/LocationAddressCard/LocationAddressCard.tsx`, UCO = `…/LocationAddressWrapper/useCountryOptions.tsx`, DSA = `fe:components/AddressComponent/DynamicSetOfAddresses/DynamicSetOfAddresses.tsx`, AC = `fe:components/AddressComponent/SingleAddress/AddressComponent.tsx`. AS = `pp:features/addresses/addresses-section.tsx`, AM = `pp:lib/shared/messages/addresses.ts`.

| Item | Legacy (file:line) | New (file:line) | Status | Notes |
|---|---|---|---|---|
| Section title | LAW:540 ("Location Addresses") | AS:1317; pp:lib/shared/messages/shell.ts:32 ("Addresses") | DIFF-INTENTIONAL | Story 4.1 (epics.md:2797). |
| List endpoint `GET person/location/list?page=0&size=100` | fe:config/axios/apis/profile/profile.ts:10 | pp:lib/api/addresses.ts:68-69; allowlist/addresses.ts:76 | MATCH | |
| Read row content | LAC:61-71 ("{type} Address" + `fullAddress`) | AS:131-143 (Address · Label · Type · Status); pp:features/addresses/format.ts:26-31 | DIFF-INTENTIONAL | Story 4.1. |
| Row order | platform order (usePersonalProfileLocations.tsx:38) | AS:105-113 (Primary first) | DIFF-INTENTIONAL | Story 4.1. |
| Primary marker in read view | none | AS:139 | NEW-ONLY | Story 4.1. |
| Verified indicator | LAC:80-97 ("Google verified" / "Verified" / "Unverified Address") | AS:142 ("Verified" badge; nothing when false) | DIFF-INTENTIONAL | Story 4.1. |
| Google Maps pin link | LAC:22-26,41-53 | none | DIFF-GAP | No story, spec or deferred item drops it (P3). |
| Empty state | LAC:28-35 ("Not Provided") | AS:1368; AM:3,5 ("No addresses yet" + "Add address") | DIFF-INTENTIONAL | Story 4.1. |
| Header actions, read view | LAW:543-551 ("Edit") | AS:1300-1311 ("Edit" + "Add address") | DIFF-INTENTIONAL | Story 4.1; spec 4.2 decision 1a. |
| Header actions, edit view | ABC:44-77 (in the header) | AS:1360 (footer) | DIFF-INTENTIONAL | Story 4.2. |
| Add row placement | LAW:328-356 (prepended; blocked until the others are valid) | AS `addAddress` (appended, expanded) | DIFF-INTENTIONAL | Story 4.2. |
| Edit with zero addresses | LAW:501-503 (adds a primary row) | empty row | DIFF-INTENTIONAL | Story 4.1. |
| Row kebab (Make primary / Edit / Remove) | none | AS:1370-1390 | NEW-ONLY | Stories 4.1, 4.2, 4.4. |
| New row header | DSA:146-153 ("New Address") | AS:680-688 ("New address" · "New · not saved") | DIFF-INTENTIONAL | Story 4.2. |
| Type label | AC:79 ("Type") | AM:9 ("Address Type") | DIFF-INTENTIONAL | DRAFT mock copy (spec 4.2). |
| Type options: Home, Main Work, Other Work, Vacation Home | fe:components/AddressComponent/addressUtils.ts:4-9 | pp:lib/api/addresses.ts:66; AS:204-210 | MATCH | Same strings and wire values. A saved Billing, Mailing or Temporary shows as an unlisted value (spec-4-1:46). |
| Country label | AC:153 | AM:10 | MATCH | |
| Country source and order | UCO:16-57 (`public/countries`; US, Canada, Australia pinned, the rest A–Z; n/a dropped) | pp:lib/api/addresses.ts:72-73,215-232 | MATCH | The new app also removes duplicate names. |
| Default country of a new row | fe:ProfilePageForms.ts:231 (`null`) | pp:features/addresses/schema.ts:85; addresses.ts:59 ("United States") | DIFF-INTENTIONAL | Story 4.2. |
| Countries load failure | UCO:60 (toast) | AS:666-675; schema.ts:202 (inline + Retry; Save blocked) | DIFF-INTENTIONAL | Story 4.2. |
| Changing the country clears the parts | AC:123-144 (clears line 1/2, city, county, state, zip, lat/lon) | AS:261-277,563-565 (`clearAddressParts`: line 1/2, city, county, state, zip and `validated`; Type and Primary kept; the same country is a no-op) | MATCH (was DIFF-GAP) | Not covered by specs 4.2 or 4.3. Stale parts can be saved under the new country (P2). **Resolved 2026-10-23 (NG-9026): a Country change to another value empties the parts, as in legacy, on a new and a saved row; the new app stores no lat/lon. Checked by `e2e/parity-1health-fe.spec.ts` "P2 · Changing an address's country…" and `e2e/profile-addresses.spec.ts`.** |
| Set-as-primary control | AC:95-108 (radio "Set As Primary") | AS:600-640; AM:11 (checkbox "Set as primary") | DIFF-INTENTIONAL | Story 4.4. |
| Line 1 label | AC:198 ("Address Line 1") | AM:12 ("Address line 1") | DIFF-INTENTIONAL | DRAFT. |
| Line 2 label | AC:228 ("Address Line 2 (optional)") | AM:13 plus "(optional)" | DIFF-INTENTIONAL | Only the case differs. |
| City label | AC:254 | AM:14 | MATCH | |
| County label | AC:279 (no marker) | AM:15 plus "(optional)" | DIFF-INTENTIONAL | Story 4.2. |
| State/Province (free text) | AC:293-317 | AS:721 | MATCH | Neither side has a state option list. |
| Zip label | AC:332 ("Zip Code") | AM:17 ("Zip") | DIFF-INTENTIONAL | DRAFT. |
| Required rules and messages | LAW:52-86 | pp:features/addresses/schema.ts:200-210; AM:24-28 | DIFF-INTENTIONAL | Same required set, new copy (Story 4.2). |
| US ZIP format | none | schema.ts:212-214 ("Enter a 5-digit ZIP code") | DIFF-INTENTIONAL | Story 4.2. ZIP+4 is refused on new or changed rows. |
| 255-character limit | none | schema.ts:203-204 | NEW-ONLY | spec 4.2. |
| Duplicate check | LAW:94-129; AC:54 (case-sensitive) | schema.ts:157-164,206-208 (case-insensitive) | DIFF-INTENTIONAL | Story 4.2. |
| Places suggestions | AC:169-179 (Google JS in the browser) | AS:440-505 (server `/api/places/*`, ≥3 characters, 250 ms, ≤5 results) | DIFF-INTENTIONAL | Story 4.3. `PLACES_ENABLED` stays off until the Google BAA (spec-4-3:54). |
| Fill on pick | LAW:271-325 (fills the parts and lat/lon; clears line 2) | pp:features/addresses/suggestion.ts:44-60 (keeps line 2; no lat/lon) | DIFF-GAP | The field mask that drops lat/lon is from Story 4.3. Keeping line 2 is undocumented (P3; Places is off). |
| Write payload | LAW:374-389 (`countryCode`, `fullAddress`, lat, lon) | pp:lib/api/addresses.ts:268-332 | DIFF-INTENTIONAL | spec 4.2 decisions 2a and 3a (spec-4-2:79). Stored lat/lon go stale after an edit. |
| Write endpoints (POST/PUT/DELETE `person/location`) | profile.ts:13-20 | addresses.ts:77-90; allowlist/addresses.ts:84-97 | MATCH | |
| Save order | LAW:464-486 | pp:features/addresses/save.ts:20-30 | DIFF-INTENTIONAL | Story 4.4; decision 1B (spec-4-4:57,142). |
| Remove | DSA:159-167 (trash icon, immediate, disabled with no reason) | AS:1284-1297 (Removed on save / Restore, with reasons) | DIFF-INTENTIONAL | Story 4.4. |
| Save toasts | LAW:484-488 (always a success, even after an error) | AS:1181,1237 | DIFF-INTENTIONAL | Story 4.2. Fixes the false success in legacy. |
| List load failure | usePersonalProfileLocations.tsx:59-61 (toast) | StateFrame (state.ts:10,17) | DIFF-INTENTIONAL | Story 4.1. |

### 2.8 Insurance

II = `fe:views/privatePages/ProfilePage/components/Insurance/InsuranceInfo.tsx`, IIC = `…/Insurance/components/InsuranceInfoCard/InsuranceInfoCard.tsx`, FII / IF / FIU = `fe:components/FlyInComponents/FlyInInsurance/FlyInInsurance.tsx` / `InsuranceForm.tsx` / `flyInsuranceFormUtils.ts`, PI = `fe:views/privatePages/ProfilePage/ProfileInfo.tsx`. IS = `pp:features/insurance/insurance-section.tsx`, PE = `pp:features/insurance/policy-editor.tsx`, IM = `pp:lib/shared/messages/insurance.ts`.

| Item | Legacy (file:line) | New (file:line) | Status | Notes |
|---|---|---|---|---|
| List endpoint `GET health/patient/insurance?page=0&size=100` | fe:config/axios/apis/insurance/insurance..ts:37-38 | pp:lib/api/insurance.ts:55-56 | MATCH | |
| Add entry point | PI:111-120 (tab-bar CTA "Add New") | IS:99-106; IM:21 ("Add insurance") | DIFF-INTENTIONAL | Story 5.1, EXPERIENCE V&T. |
| Header count | none | IS:95 | NEW-ONLY | Story 5.1. |
| Empty state | II:115-129 ("Not provided") | IS:119-122 ("No insurance on file. Add a policy before your next visit.") | DIFF-INTENTIONAL | Story 5.1. |
| Card order | II:108 (platform order) | pp:features/insurance/format.ts:117-119 (active first, then Deleted) | DIFF-INTENTIONAL | Story 5.1. |
| Card title "{Type} Insurance" | InsuranceCardHeader.tsx:21 | format.ts:64-67; IM:10 | MATCH | |
| Precedence display | IIC:97-102 (row) | format.ts:85-90 (chip) | DIFF-INTENTIONAL | Story 5.1. |
| Type display | IIC:103-108 (row) | in the title | DIFF-INTENTIONAL | Story 5.1. |
| Card fields | IIC:77-121 (Subscriber First/Last Name, Insurance Company, Precedence, Type, Subscriber Id, Group Id) | format.ts:104-114 (Insurer, Subscriber, Member ID, Effective, Group ID, Expiration, Cancellation) | DIFF-INTENTIONAL | Story 5.1 grid (epics.md:3111). |
| Missing values | II:34-38 ("Please Provide") | format.ts:19,40-49 ("Not provided"; 1970-01-01 also reads Not provided) | DIFF-INTENTIONAL | Story 5.1. |
| Self subscriber | II:34 | format.ts:97-101 (the user's own name) | DIFF-INTENTIONAL | Story 5.1. |
| Card actions | InsuranceCardHeader.tsx:30-35 ("Edit" + trash icon) | pp:features/insurance/policy-card.tsx:87-93,157 (kebab: Edit, Delete) | DIFF-INTENTIONAL | Stories 5.1, 5.5. |
| Deleted card | InsuranceCardHeader.tsx:24-27 | policy-card.tsx:150,156-157 | MATCH | Styling differs. |
| Card thumbnails | InsuranceCardImages.tsx:52-77 ("Front of card"/"Back of card"; "No Images! Upload") | policy-card.tsx:39-84 ("Front"/"Back"; "Image not uploaded") | DIFF-INTENTIONAL | Story 5.1. |
| Image download | insurance..ts:14-16 | pp:lib/api/insurance.ts:92-94 | MATCH | `preview=true` is forced on the server (AD-2). |
| Image viewer | SingleImageUpload view mode | pp:features/insurance/card-viewer.tsx:48-78 | DIFF-INTENTIONAL | Story 5.1. |
| Drawer title | FII:444-448 ("Add Insurance" / "Update Insurance") | PE:488 ("Add insurance" / "Edit insurance") | DIFF-INTENTIONAL | Story 5.2. |
| Drawer footer | FII:475-476 ("Cancel" / "Submit") | PE:508-511 ("Cancel" / "Save") | DIFF-INTENTIONAL | Story 5.2. |
| Field order | IF:300-575 | PE:431-452 | DIFF-INTENTIONAL | Story 5.2. |
| Insurer field | IF:309-327 ("Insurance Company:", freeSolo) | PE:52-91 ("Insurer", ≥2 characters, "Add “{name}”") | DIFF-INTENTIONAL | Story 5.2. Same search endpoint (insurance.ts:75-77). |
| Type / Precedence / Relationship labels | IF:389, 355, 466 ("The subscriber is my") | PE:432-436 ("Type", "Precedence", "Relationship") | DIFF-INTENTIONAL | Story 5.2 DRAFT. The epic says "Relationship to the insured" (§4). |
| Option source | FII:386-416 (`type/key/Insurance` order) | insurance.ts:232-236,269-276 (type key filtered by backend constants, in constant order; Relationship in type-key order, next row) | DIFF-INTENTIONAL | Story 5.2, RC10. |
| Relationship option order | type-key order | pp:lib/api/insurance.ts:240,277-296 (type-key order; fallback Self, Spouse, Child, Dependent, Parent) | MATCH (was DIFF-GAP) | Backend enum order is Self, Spouse, Child, Dependent, Parent (1h-ng-bo-core-be InsuranceConstants.java:224-230). No decision (P2). **Resolved 2026-10-23 (NG-9029): Relationship follows the type key's order; the fallback when the type key has no list is the backend enum order; checked by `e2e/parity-1health-fe.spec.ts` "Insurance Relationship options".** |
| Options load failure | FII:417 (silently empty) | PE:397-410 | NEW-ONLY | Story 5.2. |
| Member / Group ID 3–32 | FIU:42-60; IF:414,435 | pp:features/insurance/schema.ts:145-147 | MATCH | DRAFT copy. |
| Date ordering rules | FIU:61-118 | schema.ts:149-164; IM:37 | MATCH | DRAFT copy. |
| Subscriber group | IF:118-290 (editable on edit) | PE:270-326 (locked on edit) | DIFF-INTENTIONAL | spec 5.2 decisions 2C and 3A (spec-5-2:56-57,105). |
| Own-email check | FIU:169-175 (login username) | schema.ts:175 (`myself.email`) | DIFF-INTENTIONAL | spec-5-2:247. Conflicts with the epic AC's "login email" (§4). |
| Subscriber age 18–120 | FIU:210 | schema.ts:181 | DIFF-INTENTIONAL | V&T copy. |
| Primary per type | FII:221-245 (blocks the save) | pp:features/insurance/primary-conflict.ts; PE:360-385 (demote offer) | DIFF-INTENTIONAL | Story 5.4. |
| Save payload | FII:51-75 | insurance.ts:369-388 | MATCH | |
| Save toasts | FII:156,343 | pp:features/insurance/use-insurance-editor.ts:646 ("Insurance saved.") | DIFF-INTENTIONAL | Story 5.2. |
| Card upload formats | IF:588-593 (PNG, SVG, JPEG) | pp:features/insurance/card-file.ts:13-25 (PNG/JPEG) | DIFF-INTENTIONAL | Story 5.3, RC11 (SVG refused). |
| Upload timing and order | FII:314-337 (parallel; failures ignored) | pp:features/insurance/card-upload.ts (sequential, "Retry upload") | DIFF-INTENTIONAL | Story 5.3. |
| Remove a saved card image | IF:107-115 | pp:features/insurance/card-images.tsx:106-123 (Replace only) | DIFF-INTENTIONAL | Story 5.3. |
| Camera capture | IF:609-610 | none | DIFF-INTENTIONAL | AD-21 `camera=()` (epics.md:177). |
| Delete | IIC:123-133 (no confirm) | pp:features/insurance/use-policy-delete.ts:233-276 (confirm) | DIFF-INTENTIONAL | Story 5.5. Same endpoint. |
| Load failure | II:87-89 (toast) | StateFrame "Couldn't load insurance" + Retry | DIFF-INTENTIONAL | Story 5.1. |

---

## 3. Account (`/account`)

### 3.1 Page and tabs

| Item | Legacy (file:line) | New (file:line) | Status | Notes |
|---|---|---|---|---|
| Tab labels and order | fe:views/privatePages/AccountSettings/AccountSettingsManager.tsx:43-62 | pp:features/shell/page-tabs-config.ts:43-53; pp:lib/shared/messages/shell.ts:18-20 | MATCH | "Personal Account", "Individual Provider Registration", "My Organizations". |
| Tablist name | AccountSettingsManager.tsx:40 ("Account Settings tabs") | shell.ts:17 ("Account sections") | DIFF-INTENTIONAL | F6-1 draft copy, not in EXPERIENCE.md (§4). |
| URL / deep link | AccountSettingsManager.tsx:22 (numeric index) | pp:features/shell/nav-types.ts:14-16,28 | DIFF-INTENTIONAL | FR101 `?tab=personal\|provider\|organizations`. An unknown tab normalizes to personal. |
| Hash anchors `#account` / `#authenticator` | none | pp:features/shell/anchored-panel.tsx:49-55 | NEW-ONLY | FR101. |
| Leave guard on tab switch, no Save all | none | pp:app/account/page.tsx:16-22 | NEW-ONLY | FR101, AD-8. |
| Personal tab order: settings, then MFA | AccountSettingsManager.tsx:65-68 | pp:app/account/page.tsx:30; anchored-panel.tsx:52-53 | MATCH | |
| Non-default tenant gating | AccountSettingsManager.tsx:25-27 (renders null) | launch 403 `WRONG_TENANT` | DIFF-INTENTIONAL | FR102, AD-6. |
| Page title "Account" | none | pp:app/account/page.tsx:14; shell.ts:6 | NEW-ONLY | |
| Header org switcher | fe:components/SwitchOrganization/SwitchOrganization.tsx:125,192 | none | DIFF-INTENTIONAL | No switch-tenant (FR120, AD-2 deny). |

### 3.2 Personal Account Settings

PA = `fe:views/privatePages/AccountSettings/Components/PersonalAccount/`, ASF = `fe:views/privatePages/AccountSettings/AccountSettingsForms.ts`, AF = `pp:features/account/`, ACM = `pp:lib/shared/messages/account.ts`.

| Item | Legacy (file:line) | New (file:line) | Status | Notes |
|---|---|---|---|---|
| Card heading | PA/PersonalAccountWrapper.tsx:130 ("Personal Account Settings") | pp:lib/shared/messages/shell.ts:21 ("Personal account settings") | DIFF-INTENTIONAL | FR104, sentence case. |
| Read view field order (10 fields) | PA/PersonalAccountView.tsx:29-89 | AF/account-settings-section.tsx:23-36 | MATCH | |
| First / Last name labels | PersonalAccountView.tsx:31,37 | pp:lib/shared/messages/fields.ts:9,11 | DIFF-INTENTIONAL | FR104, Story 7.4 PM1. |
| Username / Password labels | PersonalAccountView.tsx:43,50 | ACM:12-13 | MATCH | |
| Primary email / phone labels | PersonalAccountView.tsx:56,62 ("Primary Email Address" / "Primary Phone Number") | ACM:14-15 | DIFF-INTENTIONAL | FR104. |
| Birth date / Preferred language / Default time zone labels | PersonalAccountView.tsx:68,74,80 | fields.ts:12; ACM:16-17 | DIFF-INTENTIONAL | FR104. |
| Preferred locale label | PersonalAccountView.tsx:86 | ACM:18 | MATCH | |
| Masked password, read view | PersonalAccountView.tsx:52 (`********`) | AF/view-model.ts:40 | MATCH | |
| Masked password, edit view | PA/PersonalAccountUpdateForm.tsx:186 (10 asterisks) | AF/account-edit-fields.tsx:44 (8) | DIFF-INTENTIONAL | FR104. |
| Change-password link | none | none | MATCH | PRC5/FR106. `update-password` is denied. |
| Empty values | PA/PersonalAccountUtils.ts:94-99 ("Unknown" for a bad birth date; others blank) | pp:features/shell/key-value-table.tsx:40 ("Not provided") | DIFF-INTENTIONAL | FR104 Δ D8. |
| Birth date display MM/DD/YYYY | PersonalAccountUtils.ts:94-99 | AF/view-model.ts:43 | MATCH | |
| Primary phone display | PersonalAccountView.tsx:64 (raw) | AF/view-model.ts:42 (`+1 (415) 551-2125`) | DIFF-INTENTIONAL | FR104. |
| Time zone display | PersonalAccountUtils.ts:123-129 | AF/view-model.ts:45 | DIFF-INTENTIONAL | FR108 / Story 7.4 (an unknown value shows the raw code). |
| Language display | PersonalAccountUtils.ts:130-133 (LOCALE_DETAILS, ~90 tags, fe:config/LocaleDetails.ts:1) | AF/view-model.ts:44 (only `en`→English, else the raw code) | DIFF-GAP | Story 7.4 says to show "its known label", but legacy knew `es`→"Spanish" (P3). |
| Locale display | PersonalAccountUtils.ts:134-135 (always "English - United States") | AF/view-model.ts:46 (only null or `en-US`) | DIFF-GAP | Legacy writes lowercase `en-us` (ASF:19, PersonalAccountUtils.ts:88-90). Those users see raw "en-us" in the read view, and it shows as an unlisted Select value (P2). |
| Edit / Cancel / Save | fe:components/ProfileCard/components/ActionButtonsContactPoint/ActionButtonsContactPoint.tsx:66,77,93 | AF/account-settings-section.tsx:212,228; section.ts:3; common.ts:8-9 | MATCH | |
| Edit field order | PersonalAccountUpdateForm.tsx:100-513 | AF/account-edit-fields.tsx:41-51 | MATCH | |
| Username in edit (locked) | PersonalAccountUpdateForm.tsx:156-170 | AF/account-edit-fields.tsx:43; ACM:27 | DIFF-INTENTIONAL | FR106 (help text added). |
| Password in edit (locked) | PersonalAccountUpdateForm.tsx:175-189 | AF/account-edit-fields.tsx:44; ACM:28 | DIFF-INTENTIONAL | FR106. |
| Name validation | ASF:29-48 | AF/schema.ts:39-42; pp:lib/shared/messages/person.ts:9-12 | DIFF-INTENTIONAL | FR105/PA4 copy. |
| Printable-only names | none | pp:lib/shared/person-rules.ts:27,40-45 | NEW-ONLY | |
| Name trimming | fe:validators/validators.ts:68-70 | AF/account-settings-section.tsx:148-150 | NEW-ONLY | |
| Birth date required / format | ASF:73-83 | AF/schema.ts:50-53; person.ts:13-14 | DIFF-INTENTIONAL | FR105. |
| Age rule 18 (21) to 120 | ASF:84-95 | person-rules.ts:62-81; person.ts:15 | MATCH | Same rule, new copy (FR105). |
| Date picker bounds | PersonalAccountUpdateForm.tsx:82-93 | person-rules.ts:95-99 | MATCH | |
| "About birth date" tooltip | none | AF/account-edit-fields.tsx:47; ACM:29-30 | NEW-ONLY | FR105. |
| Preferred language options `["English"]` | PersonalAccountWrapper.tsx:92-96 (`moment.locales()` = ["en"]) | AF/account-edit-fields.tsx:48 | MATCH | Legacy `PREFERRED_LANGUAGES_OPTIONS` (ASF:21-26) is unused. |
| Time zone options | ASF:10-17 ("Hawaiian Time" … "Eastern Time") | pp:lib/shared/time-zones.ts:4-11; ACM:21-26 | DIFF-INTENTIONAL | Same 6 IANA values in the same order, with " Time" dropped (FR108). |
| Locale options | ASF:19 (`en-us`) | AF/account-edit-fields.tsx:50 (`en-US`) | DIFF-INTENTIONAL | Same label. The wire value comes from FR108. |
| Select placeholder "Select a value" | none | ACM:31 | NEW-ONLY | |
| Required messages for language, time zone and locale | ASF:96-102 | AF/schema.ts:54-56; ACM:32-34 | DIFF-INTENTIONAL | FR108. |
| Email picker options (verified emails) | PersonalAccountUtils.ts:48-66,101-109 | AF/primary-contacts.ts:13-22 | MATCH | |
| Phone picker options | PersonalAccountWrapper.tsx:87 (Mobile + Landline) | AF/primary-contacts.ts:17 (Mobile only) | DIFF-INTENTIONAL | Story 7.6 amendment of 2026-10-14 (epics.md ~3822). |
| Picker disabled, with helper | PersonalAccountUpdateForm.tsx:37-62,206,267 | AF/account-primary-picker.tsx:27-28; ACM:6-8 | DIFF-INTENTIONAL | FR107 (in-app link to `/?tab=contacts#email` or `#phone`). |
| Change notice | PersonalAccountUpdateForm.tsx:208-219,269-280 (toast) | AF/account-primary-picker.tsx:33; ACM:9-10 (inline) | DIFF-INTENTIONAL | FR107 Δ D5. |
| Email required marker | PersonalAccountUpdateForm.tsx:229 (`required`) | AF/account-edit-fields.tsx:45 (none; the phone row at :46 has one) | DIFF-GAP | P3. |
| Email / phone validation | ASF:50-61 | AF/schema.ts:43-48; ACM:3-5 | DIFF-INTENTIONAL | FR107. |
| Save details `PUT v2/user/edit` | fe:config/axios/apis/user/user.ts:44-46; PersonalAccountUtils.ts:68-92 | pp:lib/api/account.ts:50-55; AF/schema.ts:60-67; account-save.ts:28-39 | DIFF-INTENTIONAL | Only changed fields; adds `phoneNumberRegion`; no `locale` (FR107/FR108). |
| Save time zone `POST v2/user/time-zone` | user.ts:40-42 | pp:lib/api/account.ts:25-27,57-59; allowlist/account.ts:14-15 | MATCH | |
| Save locale | PersonalAccountUtils.ts:88-90 (`locale` in `/edit`) | pp:lib/api/account.ts:29-31,61-63 (`POST v2/user/locale`) | DIFF-INTENTIONAL | FR108/PRC13. |
| Save order / partial failure | PersonalAccountWrapper.tsx:44-63 | AF/account-save.ts:40-61; ACM:36-39 | DIFF-INTENTIONAL | FR109 attemptAll. |
| Success toast "Personal account updated successfully" | PersonalAccountWrapper.tsx:53 | ACM:35 | MATCH | |
| No changes | PersonalAccountWrapper.tsx:70 (toast) | section.ts:13 (inline "There are no changes") | DIFF-INTENTIONAL | FR109. |
| Email already in use | PersonalAccountWrapper.tsx:59-61 (platform toast) | pp:lib/api/errors/account.ts:7-13; ACM:11 | NEW-ONLY | Field error. |
| Refresh after save | PersonalAccountWrapper.tsx:67-68 | AF/account-settings-section.tsx:122 | MATCH | |
| Load error | PersonalAccountWrapper.tsx:108-110 (toast) | state.ts:8-9 | DIFF-INTENTIONAL | FR103. |
| Drafts | none | AF/schema.ts:10 | NEW-ONLY | FR109. |

### 3.3 Authenticator app (MFA)

AAW = `fe:views/privatePages/PersonalAccountSettings/components/AuthenticationAppWrapper.tsx`, ASM = `…/AuthAppSetupModal.tsx`, MF = `pp:features/mfa/`, MM = `pp:lib/shared/messages/mfa.ts`.

| Item | Legacy (file:line) | New (file:line) | Status | Notes |
|---|---|---|---|---|
| Card heading | AAW:119-122 ("Enable authenticator app for MFA") | pp:lib/shared/messages/shell.ts:22 ("Authenticator app") | DIFF-INTENTIONAL | FR110 Δ D7. |
| Intro text | none | MM:3 | NEW-ONLY | FR110. |
| Status source | AAW:35-36,124 (`mfaEnabled && totpEnabled`) | MF/authenticator-section.tsx:55 (`totpEnabled`) | DIFF-INTENTIONAL | FR110. |
| Status indicator | AAW:124 (check icon) | MF/authenticator-card.tsx:39; MM:4-5 ("Enabled" / "Not set up") | DIFF-INTENTIONAL | FR110. |
| Tiles: Google, Microsoft, Authy, DUO, Android OTP | AAW:22-28,136-172 | MF/authenticator-card.tsx:11-17; MM:24-28 | MATCH | |
| Tile links | none (each tile starts enable) | none | MATCH | |
| Tile logos | fe:assets/mfaAppsLogos/*.png (alt "{title} logo") | pp:public/mfa/*.png (alt "") | DIFF-INTENTIONAL | PA7. The image is decorative; the button carries the name. |
| Tiles while linked | AAW:40 (silent no-op) | MF/authenticator-card.tsx:48-50,63-65; MM:6 | DIFF-INTENTIONAL | FR110. |
| Enable endpoint `POST v2/mfa/enable/totp` | fe:config/axios/apis/auth/auth.ts:30-32 | pp:lib/api/mfa.ts:18-20,31-39; allowlist/mfa.ts:7 | MATCH | |
| Enable loading | global spinner | MF/authenticator-card.tsx:50 | NEW-ONLY | FR111. |
| MFA not enabled for the user | AAW:49-53 (toast) | pp:lib/api/errors/mfa.ts:8-9; MM:16 | DIFF-INTENTIONAL | FR111 (inline notice). |
| Dialog title "Link your {App} authenticator" | ASM:82-86 | MM:9 | MATCH | |
| Dialog instruction | ASM:96-100 | MM:10 | MATCH | |
| QR image | ASM:104 (alt "qr code") | MF/authenticator-link-dialog.tsx:34; MM:12 | DIFF-INTENTIONAL | FR111. No manual secret on either side (PRC6). |
| Code entry | fe:components/OtpInput/CustomOtpInput.tsx:29 (6 boxes) | MF/authenticator-link-dialog.tsx:37-38; MM:13 (one input) | DIFF-INTENTIONAL | FR111. |
| Short code | ASM:64-66 (toast) | MF/use-authenticator-controller.ts:181-185; MM:14 | DIFF-INTENTIONAL | FR111. |
| Validate endpoint | auth.ts:26-28 (`?code=` in the URL) | pp:lib/server/named-ops/mfa-validate.ts:7-31 | DIFF-INTENTIONAL | PRC11 (`POST /api/pp/mfa/validate`). |
| Wrong code | ASM:54-57 (toast "Invalid Code. Try again.") | MF/use-authenticator-controller.ts:204-209; MM:15 | DIFF-INTENTIONAL | FR111 (inline). |
| Success | ASM:45-52 | MM:11 ("{App} authenticator linked") | DIFF-INTENTIONAL | FR111. |
| Cancel / Submit | ASM:134,139 | MF/authenticator-link-dialog.tsx:43-44 | MATCH | |
| Closing refreshes the status | AAW:100-103 | MF/use-authenticator-controller.ts:137-142 | MATCH | |
| TOTP already enabled | toast | pp:lib/api/errors/mfa.ts:10 | DIFF-INTENTIONAL | FR111 (refetches and shows linked). |
| Disable button | AAW:127-134 | MF/authenticator-card.tsx:40; MM:7 | MATCH | |
| Disable confirm | none | MF/authenticator-link-dialog.tsx:23; MM:19-21 | DIFF-INTENTIONAL | FR112 Δ D2. |
| Disable endpoint and toast | auth.ts:34-36; AAW:77-79 ("Successfully disabled") | pp:lib/api/mfa.ts:50-53; MM:22 ("Authenticator app disabled") | DIFF-INTENTIONAL | FR112. Same endpoint. |
| Fallback errors | platform toast | MM:17-18,23 | NEW-ONLY | PA7 draft. |

### 3.4 Individual Provider Registration

IPR = `fe:views/privatePages/AccountSettings/Components/IndividualProviderRegistration/`, NM = `pp:lib/shared/messages/npi.ts`, PV = `pp:features/provider/`.

| Item | Legacy (file:line) | New (file:line) | Status | Notes |
|---|---|---|---|---|
| Heading "Healthcare credentials" | IPR/IndividualProviderRegistrationWrapper.tsx:99,109 | NM:3; PV/provider-tab.tsx:16 | MATCH | |
| Header info icon | Wrapper.tsx:96 (decorative, no popover) | PV/provider-tab.tsx:16; NM:4-5 | DIFF-INTENTIONAL | Story 9.1 AC "Section header". |
| Info popover text | none | NM:5 | NEW-ONLY | FR114. |
| Loading state | Wrapper.tsx:87-89 (null) | PV/provider-tab.tsx:14 (skeleton) | DIFF-INTENTIONAL | Story 9.1. |
| `user/npi` load failure | Wrapper.tsx:81-84 (toast, then the form) | PV/use-provider-controller.ts:27-32 | DIFF-INTENTIONAL | Story 9.1 (inline error + Retry). |
| Upstream 403 | none | PV/provider-tab.tsx:15 | NEW-ONLY | FR103. |
| State detection `GET v2/user/npi` | fe:config/axios/apis/user/user.ts:7-8; WrapperUtils.ts:4-7 | pp:lib/api/npi.ts:48-50,108-120; allowlist/npi.ts:7 | MATCH | |
| Instruction line | IPR/IndividualProviderRegistration.tsx:200 | NM:6; PV/npi-search.tsx:32 | MATCH | Uses the "…" character. |
| Personal NPI label | IndividualProviderRegistration.tsx:209 | NM:7 | MATCH | |
| Personal NPI required marker | IndividualProviderRegistration.tsx:206 (shows " *") | PV/npi-search.tsx:33; pp:components/ui/form-field.tsx:44-45 | DIFF-INTENTIONAL | Story 9.1 AC: `aria-required`, no visible marker. |
| Practice NPI label | IndividualProviderRegistration.tsx:236-237 | NM:8, plus " (optional)" | DIFF-INTENTIONAL | FR114. |
| Placeholder | IndividualProviderRegistration.tsx:210,240-243 (repeats the label) | pp:lib/shared/messages/combobox.ts:17 ("Search by NPI or name") | DIFF-INTENTIONAL | Story 9.1. |
| Entity type filter (1 personal, 2 practice) | IndividualProviderRegistration.tsx:130,140 | pp:lib/api/npi.ts:33-46,126 | MATCH | AD-23. |
| Search endpoint and query | fe:config/axios/apis/miscellaneous/miscellaneous.ts:15-27 | pp:lib/api/npi.ts:34; allowlist/npi.ts:8-13 | MATCH | The proxy also bounds the params. |
| Debounce 600 ms | fe:components/GenericAutocomplete/GenericAutocomplete.tsx:255 | PV/npi-search.tsx:24 | MATCH | |
| Page size 10 / infinite scroll | GenericAutocomplete.tsx:254 | pp:lib/api/npi.ts:28,138 | MATCH | |
| Empty focus loads page 0 | GenericAutocomplete.tsx:658-668 | PV/npi-search.tsx:24 | MATCH | |
| Max input length 100 | none | pp:lib/api/npi.ts:31 | NEW-ONLY | |
| Personal option label | fe:components/Common/GenericNPISelect/GenericNPISelectUtils.ts:3-18 | pp:lib/api/npi.ts:131,136 | MATCH | Legacy adds the name only when both first and last exist; the new app joins whichever exists. |
| Practice option label | GenericNPISelectUtils.ts:20-35 | pp:lib/api/npi.ts:131-136 | MATCH | |
| Option layout | single line | PV/npi-search.tsx:8-10 (two lines) | DIFF-INTENTIONAL | Story 9.1. |
| Loading / empty rows | GenericAutocomplete.tsx:1015,1105 | combobox.ts:9,11,18 | DIFF-INTENTIONAL | D-UX5. |
| Search failure | IndividualProviderRegistration.tsx:132-136 (silent) | pp:components/ui/combobox.tsx:450,462 | DIFF-INTENTIONAL | FR114 Δ D9. |
| Register button label | IndividualProviderRegistration.tsx:277 | NM:9 | MATCH | |
| Register action | IndividualProviderRegistration.tsx:170-191 | PV/npi-search.tsx:35 (no handler) | MATCH (was DIFF-GAP) | **Story 9.2 is in the backlog.** The button does nothing; this is accepted as temporary in the Story 9.1 note (P1). **Resolved 2026-10-23: merged in #48 (`cdde11c`); checked by `e2e/parity-1health-fe.spec.ts` "Individual Provider Registration".** |
| Required validation | IPR/…Utils.ts:22-31 | not built | MATCH (was DIFF-GAP) | Story 9.2 (P1). **Resolved 2026-10-23: merged in #48 (`cdde11c`); checked by `e2e/parity-1health-fe.spec.ts` "Individual Provider Registration".** |
| Is-registered pre-check `GET v2/health/npi/{n}/is-registered` | IndividualProviderRegistration.tsx:84-118; miscellaneous.ts:54-55 | path only (pp:lib/api/npi.ts:53-55); no allowlist entry | MATCH (was DIFF-GAP) | Story 9.2 (P1). **Resolved 2026-10-23: merged in #48 (`cdde11c`); checked by `e2e/parity-1health-fe.spec.ts` "Individual Provider Registration".** |
| "NPI already registered" | IndividualProviderRegistration.tsx:74-82 (toasts) | NM:11-12; pp:lib/api/errors/npi.ts:14-25 (copy only) | MATCH (was DIFF-GAP) | The copy and mapping exist but nothing shows them (Story 9.2). **Resolved 2026-10-23: merged in #48 (`cdde11c`); checked by `e2e/parity-1health-fe.spec.ts` "Individual Provider Registration".** |
| Register `POST v2/user/register/npi` | user.ts:19-20 | path only (pp:lib/api/npi.ts:57-59); no allowlist entry | MATCH (was DIFF-GAP) | Story 9.2 (P1). **Resolved 2026-10-23: merged in #48 (`cdde11c`); checked by `e2e/parity-1health-fe.spec.ts` "Individual Provider Registration".** |
| Success toasts | IndividualProviderRegistration.tsx:96-100,115 | not built | MATCH (was DIFF-GAP) | Story 9.2. **Resolved 2026-10-23: merged in #48 (`cdde11c`); checked by `e2e/parity-1health-fe.spec.ts` "Individual Provider Registration".** |
| Failure message | IndividualProviderRegistration.tsx:184-188 | not built | MATCH (was DIFF-GAP) | Story 9.2. **Resolved 2026-10-23: merged in #48 (`cdde11c`); checked by `e2e/parity-1health-fe.spec.ts` "Individual Provider Registration".** |
| Registered view NPI row | IPR/IndividualProviderRegistrationView.tsx:58-60 | PV/registered-view.tsx:6 | MATCH | |
| Registered view: Taxonomy, HIE, Practice name, address, Practice NPI, Licenses, Address of practice | View.tsx:64-123 | absent; the `UserNpi` schema (pp:lib/api/npi.ts:63-75) drops these fields | MATCH (was DIFF-GAP) | **Story 9.3 is in the backlog** (P1). **Resolved 2026-10-23: merged in #48 (`cdde11c`); checked by `e2e/parity-1health-fe.spec.ts` "Individual Provider Registration".** |
| Practice name support popover | View.tsx:79-87 → fe:components/TenantInfoPopover/TenantInfoPopover.tsx:118,172-198 | named op exists (pp:lib/server/named-ops/practice-support.ts); client path only | MATCH (was DIFF-GAP) | Story 9.3. Trimming the content to name, phone and email is intended (FR116). **Resolved 2026-10-23: merged in #48 (`cdde11c`); checked by `e2e/parity-1health-fe.spec.ts` "Individual Provider Registration".** |
| "This organization already exists…" banner | View.tsx:94-101 | absent | MATCH (was DIFF-GAP) | Story 9.3. **Resolved 2026-10-23: merged in #48 (`cdde11c`); checked by `e2e/parity-1health-fe.spec.ts` "Individual Provider Registration".** |
| "Register your practice to enable ordering" | View.tsx:160-176 | absent (`handoffHref({to:"create-org"})` exists, pp:features/shell/handoff.ts:30) | MATCH (was DIFF-GAP) | Story 9.3. **Resolved 2026-10-23: merged in #48 (`cdde11c`); checked by `e2e/parity-1health-fe.spec.ts` "Individual Provider Registration".** |
| Signature, its "?" tooltip, "No signature available!" | View.tsx:128-152; Wrapper.tsx:41-64 | absent | MATCH (was DIFF-GAP) | Story 9.3 plans "No signature available" without the "!". **Resolved 2026-10-23: merged in #48 (`cdde11c`); checked by `e2e/parity-1health-fe.spec.ts` "Individual Provider Registration".** |
| Update/edit form | IPR/…UpdateForm.tsx (unreachable: Wrapper.tsx:22 hardcodes `false`) | none | MATCH | FR116 says there is no edit. |

### 3.5 My Organizations

MO = `fe:views/privatePages/AccountSettings/Components/MyOrganizations/`, OC = `MO/Components/OrganizationCard/OrganizationCard.tsx`, OF = `pp:features/organizations/`, OM = `pp:lib/shared/messages/orgs.ts`.

| Item | Legacy (file:line) | New (file:line) | Status | Notes |
|---|---|---|---|---|
| List endpoint `GET v2/user/organization/portal` | fe:config/axios/apis/user/user.ts:52-62; MO/OrganizationListPage.tsx:93 | pp:lib/api/organizations.ts:25-28; allowlist/orgs.ts:7-11 | MATCH | |
| Page size 12 | OrganizationListPage.tsx:54 | pp:lib/api/organizations.ts:23 | MATCH | |
| Drop items with a null organization | OrganizationListPage.tsx:103 | organizations.ts:97 | MATCH | |
| Client sort | none | organizations.ts:102-106 | DIFF-INTENTIONAL | FR117 / Story 10.1. |
| Total pages | OrganizationListPage.tsx:102 | organizations.ts:107 (server `totalPages`) | DIFF-INTENTIONAL | AD-23. |
| Search debounce 500 ms and page reset | OrganizationListPage.tsx:126-129 | OF/use-organizations.ts:59-67 | MATCH | |
| Search normalization | OrganizationListPage.tsx:127 (lowercase + trim) | OF/use-organizations.ts:61 (trim) | DIFF-INTENTIONAL | Story 10.1. The server search is case-insensitive. |
| Search field | OrganizationListPage.tsx:146-165 | OF/organizations-tab.tsx:74-76; OM:3 | DIFF-INTENTIONAL | Story 10.1. |
| "Create new organization" (internal email) | OrganizationListPage.tsx:60,166-170 | OF/organizations-tab.tsx:39,58,78; OM:6 | DIFF-INTENTIONAL | Story 10.1 (hand-off to create-org). |
| Empty-state trigger | OrganizationListPage.tsx:68-74,261 | OF/use-organizations.ts:76 | DIFF-INTENTIONAL | PA6 / FR119. |
| Empty card title, body and 4 feature rows | OrganizationListPage.tsx:23-52,188,192-193 | OF/organizations-tab.tsx:17-30; OM:9-10,22-25,32-35 | MATCH | Verbatim copy. |
| "Register organization" | OrganizationListPage.tsx:215-229 | OF/organizations-tab.tsx:31-32; OM:7-8 | DIFF-INTENTIONAL | PA1. |
| "Sorry, no results were found" | OrganizationListPage.tsx:250-256 | OF/organizations-tab.tsx:65; OM:11 | MATCH | Same copy, shown under different conditions. |
| Pager when a page has only null organizations | hidden when the list is empty | OF/organizations-tab.tsx:65-67 (shows "no results" plus the pager) | DIFF-GAP | Edge case (P3). |
| Loading | OrganizationListPage.tsx:284-286 | OF/organizations-tab.tsx:60 | DIFF-INTENTIONAL | Story 10.1. |
| Load error | OrganizationListPage.tsx:107-117 (toast) | OF/organizations-tab.tsx:60,81 | DIFF-INTENTIONAL | Story 10.1. |
| Pagination | OrganizationListPage.tsx:265-280 (arrow icons) | OF/organizations-pagination.tsx:13-22 | DIFF-INTENTIONAL | Text "Previous" / "Next". |
| Live count "{N} organizations"; focus on page change | none | OF/organizations-tab.tsx:47-57; OM:4-5 | NEW-ONLY | |
| Card logo | OC:111 (direct `publicUrl`) | OF/organization-card.tsx:20; named op org-logo | DIFF-INTENTIONAL | FR118 Δ D6/D7 (initials fallback). |
| Card name with tooltip | OC:187-191 | OF/organization-card.tsx:24-26 | MATCH | |
| Type icons, labels and order | OC:22-48,193 | OF/organization-types.tsx:8-14,35-37; OM:22-31 | DIFF-INTENTIONAL | FR118 / UX-DR-P21. |
| Primary contact popover | OC:114-185; OrganizationCardUtils.ts:6-12 | OF/organization-primary-contact.tsx:13-28; OM:14-15,21 | MATCH | The content matches. Accessibility and formatting differ on purpose. |
| "Enter portal" label | OC:208 | OF/enter-portal-button.tsx:27-33; OM:16-17 | MATCH | |
| Enter portal disabled when `!enabledInTenant` | OC:207 | OF/enter-portal-button.tsx:17-22; OM:18 | DIFF-INTENTIONAL | FR120 (aria-disabled with a reason). |
| Current-tenant card (grey, Enter portal disabled) | OC:61-65,89-92,207 | none | DIFF-GAP | No decision. Probably moot, since the app always runs in the default tenant (P3). |
| Enter portal behaviour | OC:91,207 → fe:Hooks/useTenantSwitching.ts (switch-tenant) | OF/enter-portal-button.tsx:31; pp:features/shell/handoff.ts:29-36; pp:lib/server/handoff.ts:15,45-50 | DIFF-INTENTIONAL | FR120 / R7. With `TENANT_HANDOFF_SHAPE="root"` (OQ1 open), the user lands on the portal root, **not inside the organization** (deferred-work.md:517-519). See §4. |

---

## 4. Gaps to fix (prioritized)

### P1: functional

1. ~~**Provider registration: Register does nothing** (Story 9.2, backlog).~~ **Resolved 2026-10-23 (#48).** Five pieces are missing:
   - wiring for Register and `onSelect` (pp:features/provider/npi-search.tsx:33-35)
   - allowlist entries for `GET v2/health/npi/{n}/is-registered` and `POST v2/user/register/npi` (pp:lib/server/proxy/allowlist/npi.ts)
   - required validation
   - showing the already-registered field errors
   - success toasts and the failure banner

   Their catalog strings are also missing from `pp:lib/shared/messages/npi.ts`:
   - "Personal NPI is required"
   - "Registering…"
   - the success toasts
   - the fallback banner
2. ~~**Provider registration: registered view shows only the NPI** (Story 9.3, backlog).~~ **Resolved 2026-10-23 (#48).** Missing:
   - the rows: Taxonomy, HIE, Practice name, Practice address, Practice NPI, Licenses, Address of practice
   - Signature, and its "No signature available" state
   - the practice support popover
   - the "This organization already exists…" banner
   - the "Register your practice to enable ordering" hand-off

   The `UserNpi` schema (pp:lib/api/npi.ts:63-75) also has to grow to hold taxonomy, license, addresses, `practiceNpi.organization` and `verified`.

### P2: behaviour or visible data mismatch

3. ~~**Address: changing the country doesn't clear the address parts** (fe AC:123-144 vs pp:features/addresses/addresses-section.tsx:549-550). Only "verified" is cleared, so a stale state or ZIP can be saved under the new country.~~ **Resolved 2026-10-23 (NG-9026):** a Country change empties line 1/2, city, county, state and zip and clears "Verified" (pp:features/addresses/addresses-section.tsx:261-277).
4. **Account: a locale written by the legacy app shows as raw "en-us".** Legacy writes lowercase `en-us` (fe ASF:19). The new read view and Select recognize only `en-US` (pp:features/account/view-model.ts:46; account-edit-fields.tsx:50). Fix by matching without regard to case, and check real `myself.locale` values on demo.
5. ~~**Insurance: Relationship option order** is Self, Spouse, Parent, Child, Dependent (pp:lib/api/insurance.ts:236). The backend enum and type key order is Self, Spouse, Child, Dependent, Parent. Use the backend order or record a decision.~~ **Resolved 2026-10-23 (NG-9029):** the options follow the type key's order, as legacy; without a type key list they fall back to the backend enum order (pp:lib/api/insurance.ts:240,277-296).
6. **App bar: Privacy, Terms and Dark mode** from the legacy user menu (fe:components/AppHeaderV2/components/UserMenu.tsx:113-131) have no counterpart and no decision.

### P3: cosmetic or edge

7. **Phone / Email: Verify is no longer offered in edit view** (fe MNR:35-65, ER:33-63 vs pp PS:419-426, ES:342-347).
8. **Phone (also Email and Social): new rows go to the bottom**, and can be added while other rows are invalid (fe PW:375-385 vs pp PS:633-640).
9. **Address: the Google Maps pin link is gone** (fe LAC:22-53).
10. **Address: a Places pick keeps line 2** where legacy cleared it (fe LAW:306 vs pp:features/addresses/suggestion.ts:44-60). Places is off for now.
11. **Profile picture: legacy MIME variants are rejected**: `image/x-png`, `image/x-citrix-jpeg` and `image/x-citrix-png` (pp:features/header/picture-file.ts:25-34).
12. **Header: the name is no longer capitalized** (fe ProfileInfoCard.tsx:127).
13. **Personal Information: no "Add {typed value}" row** in the Gender identity combobox, and the per-field placeholders are gone.
14. **Account: language labels.** Only `en` gets a label. Legacy mapped about 90 tags, for example `es` → "Spanish" (pp:features/account/view-model.ts:44).
15. **Account: Primary email has no required marker**, while the phone row has one (pp:features/account/account-edit-fields.tsx:45).
16. **Orgs: the legacy current-tenant card state has no counterpart.** It is probably moot.
17. **Orgs: pager on a page of only null organizations.** The "no results" text and the pager show together.

### Needs product confirmation (documented, but questionable against legacy)

These are documented in a story, spec or deferred item, but still differ from legacy in ways product should confirm:

- **Enter portal lands on the portal root, not inside the organization.** The cause is OQ1 and `TENANT_HANDOFF_SHAPE="root"` (pp:lib/server/handoff.ts:15; deferred-work.md:517). Legacy switched the tenant.
- **Landline rows show a "Not verified" badge with no way to clear it.** Legacy showed no status on Landlines. This is literal to Story 3.1's AC.
- **The insurance own-email check compares `myself.email`** (spec-5-2:247). The epic AC and legacy compare the login username.
- **The insurance "Relationship" label.** The epic says "Relationship to the insured" and legacy says "The subscriber is my".
- **Account tablist name "Account sections".** It is draft copy and isn't in EXPERIENCE.md.
- **Known open items in deferred-work.md:**
  - the verify cooldown shows 60 s but the backend uses 60 min (deferred-work.md:59-61)
  - a restored Phone draft can turn off a new Primary's notifications (deferred-work.md:71-73)
  - address PUTs drop lat/lon, so stored coordinates go stale
