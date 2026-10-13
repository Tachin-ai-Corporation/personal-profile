# Reconciliation: PRD + addendum vs research extracts (2026-10-13)

Scope: `prd.md`, `addendum.md` vs `research-1health-fe.md` (parity baseline), `research-backend.md`, `research-api-docs.md`. Spot-checked in source where extracts were ambiguous:
- BE `bo-core/.../v2/misc/onehealth/contact_point/ContactPointConstants.java`, `v2/service/onehealth/ContactPointServiceImpl.java`, `v2/misc/onehealth/InsuranceConstants.java`, `v2/service/onehealth/factory/insurance/AbstractInsuranceDeleteFactory.java`, `bo-core/src/main/resources/access-control.json` (Patient functionality).
- FE `src/components/ContactPoint/{Email,MobileNumber}/*.tsx`, `src/views/privatePages/ProfilePage/components/ContactInfo/components/{Email,Phone,SocialMedia}Wrapper/*.tsx`, `src/components/FlyInComponents/FlyInInsurance/*`, `src/utils/appEnums/AppEnums.ts`.

Severity: **H** = will cause 400s or a broken flow; **M** = parity gap or wrong rule; **L** = wording/precision.

---

## A. Contact points: labels and Primary rules (highest risk)

### A1 [H] Primary switch must relabel the old Primary in the same request
- **Source:** BE `ContactPointServiceImpl` (`IN_ORDER_TO_DOWNGRADE_PRIMARY_...`, `PERSON_ALREADY_HAS_PRIMARY_CONTACT_POINT_FROM_TYPE_ERROR`, `IN_ORDER_TO_DELETE_PRIMARY_CONTACT_POINT_UPDATE_ANOTHER_ONE_AS_PRIMARY_ERROR`). "Primary" is a **Contact Label**, not a separate flag. Promoting X to Primary is rejected unless the current Primary of that type is relabeled in the same `contactPointsToUpdate`. Deleting a Primary Email/Mobile is rejected unless another one is updated to Primary in the same request. FE today: the Primary option is disabled while any other row is Primary (`Email.tsx` `checkOptionDisabled`), so the user must relabel the old one first by hand. BE's own switch (`switchPrimaryContactPoint`) relabels the old one to **"Old"**.
- **PRD location:** FR-18, FR-22, UJ-1 step 4–5, FR-16/FR-20 removal; Glossary "Primary"; addendum §B.
- **Issue:** The PRD implies a one-click "Make Primary", and UJ-1 step 5 has her relabel or delete the old number afterwards. That would 400 unless the app sends both changes in one request. Nothing defines what label the old Primary gets.
- **Fix:** Add to FR-18/FR-22: "Making an entry Primary relabels the previous Primary of the same type to 'Old' (user can change it) in the same save. A Primary Email/Mobile can't be deleted; the user must first promote another one." Update UJ-1 step 5 ("the old number is relabeled Old automatically; she may delete it"). Add both rules to addendum §B.

### A2 [H] Contact Label list is wrong in addendum §B, and "plus any extra" is unsafe
- **Source:** BE `ContactPointConstants.ContactPointLabel` enum: Primary, Work, Home, Personal, Old, Main, **Mailing List**, Partnership Organization. Any other label is a 400 `INVALID_ENUM_VALUE`. FE `AppEnums.ContactTypes` also has Main Work, Other Work, Vacation Home (address types reused); the api-docs extract omits Mailing List.
- **PRD location:** addendum §B "Contact Labels: Primary, Home, Main, Old, Personal, Work (plus any extra the platform returns from `/type/key/ContactPoint`)"; Glossary "Contact Label… list comes from the platform"; addendum §A FR-16/20 options.
- **Issue:** Mailing List is missing. "Plus any extra" would surface values the write endpoint rejects (Main Work, Other Work, Vacation Home, if the type metadata returns them) and "Partnership Organization" (an org-only label).
- **Fix:** In §B, set the list to: Primary, Home, Main, Old, Personal, Mailing List, Work. The `/type/key/ContactPoint` response must be **intersected** with this list, with Partnership Organization always excluded. State the same in the Glossary.

### A3 [M] "Can't be added directly as Primary" and "only Verified can be promoted" are over-generalized
- **Source:** BE `validateSupportedPrimaryContactPointsToAdd` blocks a Primary label on add **only for Email and Mobile**. `verifyConditionsInOrderToBeUpdatedAsPrimary`: Email must be verified; **an unverified Mobile may become Primary when the person has no verified Mobile at all**. FE `MobileNumber.tsx` mirrors this exception (`noneIsVerified && noneIsPrimary` → Primary allowed).
- **PRD location:** FR-18 "Only a Verified mobile number can be made Primary"; Glossary "Verified… Only a Verified Contact Point can become Primary"; addendum §B Primary rules.
- **Issue:** FR-18 drops a current behaviour (parity gap). Users with no verified mobile and no Primary mobile could set one today. §B misstates the platform rules.
- **Fix:** FR-18: add "Exception (today's behaviour): if no phone is Verified and none is Primary, an unverified mobile can be made Primary." In §B, scope "can't be added as Primary" and "must be Verified" to Email/Mobile. FE keeps Landline from being Primary (UI rule, not a platform rule); label it as such.

### A4 [M] FR-22 "Exactly one Primary email must exist" is not achievable for every user
- **Source:** FE `EmailWrapper.onValid` enforces "one primary" only when a Primary existed on load (`wasPrimaryProvidedOnLoad`). BE forbids adding an Email as Primary. A phone-registered user may have no Primary email.
- **PRD location:** FR-22 bullet 2.
- **Fix:** "At most one Primary email. If one existed, one must remain." (mirror FR-18). Describe how a user with none gets one: add, verify, then promote.

### A5 [M] Home-labelled contacts are excluded from verification for emails too
- **Source:** FE `EmailWrapper.getAddedEmailIdsToVerify` skips `label === Home`. `EmailRow.tsx` hides the verified icon for Home.
- **PRD location:** FR-21 ("New emails get a verification automatically"; "Unverified emails show Verify").
- **Fix:** FR-21: "New emails whose label isn't Home are sent a verification automatically. Verify/Resend shows only for unverified, non-Home emails." Mention it in the FR-15/FR-20 badge rules (Home entries show no Verified/Unverified badge). Fix addendum §D "Auto-verify" too, which applies the Home exclusion only to Mobile.

### A6 [M] Notification setting is only sent for Primary rows
- **Source:** FE `PhoneWrapper`/`EmailWrapper` send `isNotificationEnabled` only when label = Primary. They set it to true when Primary is chosen.
- **PRD location:** FR-15/FR-20 ("notification on/off indicator" on every entry); FR-19/FR-23.
- **Issue:** The indicator on non-Primary rows would show a value the user can't change, which may be stale.
- **Fix:** FR-15/FR-20: show the notification indicator only on the Primary row (or define what it means elsewhere).

### A7 [L] Social Media value is editable in place; the Non-Goal says otherwise
- **Source:** BE `validateContactPointAttributes` nulls `value` on update for every type **except Social Media**. FE `SocialMediaWrapper` sends edited links in `contactPointsToUpdate`.
- **PRD location:** §7 Non-Goals "Changing a saved Contact Point's value or type in place" vs FR-24 "add, edit and remove".
- **Fix:** §7: "…value of a saved phone or email…". Social links stay editable (FR-24).

### A8 [L] Contact types outside Mobile/Landline/Email/Social Media are invisible
- **Source:** BE `ContactPointType` also has Fax, Home, Work, Other (writable via the Patient Vault API). The list call filters by type.
- **PRD location:** Glossary "Contact Type"; addendum §A FR-15/20/24 reads.
- **Fix:** Note it as a known limitation, same as today (no action), or add an Open Question.

---

## B. Parity gaps (today's behaviour missing from FRs)

### B1 [M] Insurance type "Drug" missing
- **Source:** BE `InsuranceConstants.InsuranceType`: Dental, Medical, **Drug**, Vision, Hospice. The api-docs extract lists only four.
- **PRD location:** Glossary "Insurance Policy" (Medical, Dental, Hospice, Vision); FR-28 title.
- **Fix:** Add Drug. Options should come from `/type/key/Insurance` (already in the addendum), and the Glossary shouldn't hard-code a list.

### B2 [M] Cancellation date must be before expiration date
- **Source:** FE `flyInsuranceFormUtils.ts` "Cancellation date can not be after or the same as Expiration date". All dates use strict "after effective".
- **PRD location:** FR-29 optional fields.
- **Fix:** "Expiration and cancellation dates must be after the effective date. Cancellation must be before expiration."

### B3 [M] "Offer to demote the other Primary policy" is new behaviour, not parity
- **Source:** FE blocks it with a validation error ("There can be only one primary insurance of each type"). BE has no such rule (client-only). Demoting means an extra `PUT` on another policy (non-atomic).
- **PRD location:** FR-29 bullet, UJ-2 edge case and step 6.
- **Fix:** Mark it as a deliberate change (like FR-24). Define the order (demote first, then save) and the failure handling if the second write fails. Or fall back to today's blocking error.

### B4 [L] FR-30 / Open Question 2 can be closed
- **Source:** BE `AbstractInsuranceDeleteFactory`: when deletion is allowed for the person, the policy is **soft-deleted** (label `Deleted`). Otherwise the patient is unlinked (removed from the list). Deleting an already-Deleted policy returns 400 `INSURANCE_ALREADY_DELETED`.
- **PRD location:** FR-30, §9 Q2.
- **Fix:** Close Q2 with this behaviour. FR-28 already hides actions for Deleted.

### B5 [L] SSN reveal on own profile is new, not parity
- **Source:** FE extract: "No SSN reveal on own profile". BE allows self.
- **PRD location:** FR-13.
- **Fix:** Tag it as a new capability (helps QA scope SM-1).

### B6 [L] Personal Information: unstated validation details
- **Source:** FE: sexual orientation uses the printable (LGBT+) regex; SSN accepts the masked form `***-**-dddd` unchanged; race/ethnicity/biological-gender options drop "n/a" and are sorted.
- **PRD location:** FR-12/FR-13.
- **Fix:** Add "printable characters" to sexual orientation. Add "an unchanged masked SSN is not re-sent" to FR-13.

### B7 [L] Phone/email: saved row label "Primary" not selectable for new rows
- Covered by A1/A3. Also FR-16 should state "a new phone can't be saved as Primary" explicitly (BE rejects it for Mobile/Email).

---

## C. PRD vs backend permissions and endpoints

### C1 [M] Personal Information save must never send `email` / `phoneNumber`
- **Source:** BE `UserServiceImpl.editUserProfile` → `switchPrimaryContactPoint` runs whenever `email`/`phoneNumber` is present in `PersonalInformationDTO`. It needs an existing, verified contact point and relabels the old Primary to "Old". `getUserByEmail` rejects any email used by another user.
- **PRD location:** addendum §D "Save all… Personal Information goes first because a Primary email/phone switch may interact with `/user/edit`"; addendum §A FR-11/12.
- **Issue:** FR-12 doesn't edit email or phone, so the interaction only happens if the app sends them. Ordering Personal Information first is a workaround for a non-issue, and it could cause surprise primary switches.
- **Fix:** Addendum §A FR-11/12: "never include `email`, `phoneNumber`, `phoneNumberRegion` in `PUT /v2/user/edit`; Primary changes go only through `POST /v2/health/contact-point`." Drop the ordering rationale in §D.

### C2 [OK] Lookups and file endpoints are allowed for patients (resolves an extract conflict)
- `research-backend.md` says the generic lookups are admin-only and should be hardcoded. `access-control.json` → Patient functionality includes `GET /v2/type/key/{key}`, `POST /graphql`, `GET|DELETE /v2/file/{fileInstanceId}`, `POST /v2/file/{fileInstanceId}/version`, `POST /v2/health/type/{typeKey}/{instanceId}/relation/{relKey}/file/upload`, `GET /v2/person/{personId}/ssn/expose`, `GET /v2/health/insurance/{id}/file/{fileId}/download`. The addendum endpoints for FR-10/12/14/16/29 are therefore valid. `GET /v1/boc/{key}` is the admin one.
- **Fix:** none for the PRD. Add one line in the addendum noting that §C fallbacks are defensive only, and that `GET /v2/person/{id}` (Proctor-only) stays unused.

### C3 [L] Verification channel wording
- **Source:** api-docs: verify sends a link that the user completes via a public endpoint. OTP alternative `/v3/otp/*`.
- **PRD location:** UJ-1 step 3 "SMS link"; Glossary "Verified… through a verification link".
- **Fix:** Fine as written. Confirm on demo that mobile verify is SMS-link (not OTP) before UX copy.

---

## D. Addendum endpoint and detail errors

| # | Addendum location | Issue | Fix |
|---|---|---|---|
| D1 | §B Contact Labels | Missing Mailing List. "Plus any extra" is unsafe (BE enum-validates). | See A2. |
| D2 | §B Primary rules | "Can't be added as Primary" / "only Verified can be promoted" apply only to Email/Mobile, and the Mobile exception is missing. The same-request downgrade/replacement rule is missing. | See A1, A3. |
| D3 | §B last bullet | `primary`/`validated` vs `isPrimary`/`isValidated` is an **address** rule, listed under contact-point rules. | Move it to an Addresses note. |
| D4 | §C | Fixed lists lack the Contact Label allow-list and insurance enums. | Add the Contact Label allow-list (A2). Note insurance types include Drug (B1). |
| D5 | §D Auto-verify | Excludes Home only for Mobile; FE also excludes Home emails. | See A5. |
| D6 | §D Save all ordering | Rationale relies on `/user/edit` primary switching. | See C1. |
| D7 | §A FR-13 | Correct (`PersonPlainSsnDTO {id, socialSecurityNumber}`, allowed for self). | None. |
| D8 | §A FR-1 | `POST /v2/public/external-application/auth/oauth2/user/token` exists (`PublicResource.java:139`, public). | None. |
| D9 | §A FR-28 | `size=100` vs docs example `size=15`: fine. FR-30 delete may soft-delete (B4). | Optional note. |
