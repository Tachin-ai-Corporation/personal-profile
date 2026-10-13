# Research extract — current UI in ../1health-fe (2026-10-13)

Paths relative to ../1health-fe/src.

## Route & access
- `/profile?tab=0|1|2` (ProfileTab CONTACTS=0, INSURANCE=1, MEDICAL=2); page `views/privatePages/ProfilePage/ProfileInfo.tsx`; route AppRoute.tsx:1216-1229.
- Gate: `tenant.id === DEFAULT_TENANT_ID` only (no role check) → any default-tenant user (patients; providers in personal context). Sidebar "Personal Profile" hidden in tenant context.
- "Profile" of another person = PatientChartView (provider/lab views) — separate screen; only reuses InsuranceInfoCard.
- Medical tab: hardcoded `disabled`, empty panel, no API. Insurance tab: cards + "Add New" fly-in.

## Per-section behaviour (each card saves independently: Edit → Cancel/Save)
### Header (avatar + name)
- Read: GraphQL `Person(userId)` → id, names, PersonHasProfilePictureFile id; image `GET /user/profile-picture/preview?v={imageId}` (blob).
- Upload on avatar click: JPG/PNG/BMP ≤ 6 MB → `POST /health/type/Person/{personId}/relation/PersonHasProfilePictureFile/file/upload?fileName&isPublic=true`; then `DELETE /file/{oldId}?hardDelete=true`.

### Personal Information
- Read: GraphQL Person (firstName, middleName, lastName, otherNames, cityOfBirth, birthDate, nameSuffix, namePrefix, titles, race[], ethnicity[], biologicalGender[], genderIdentity, sexualOrientation, socialSecurityNumberPreview, PersonHasSignatureFile).
- Defaults when unset: race/ethnicity "Unknown", biologicalGender "Asked but not answered".
- Validation: first/last required (printable regex); birthDate required, age 18–120 (21–120 if Proctor); cityOfBirth ≤128; race/ethnicity/biologicalGender required selects; genderIdentity required, freeSolo (Asked but not answered/Female/Male/Other + custom); sexualOrientation free text ≤128 (LGBT+ printable regex); SSN `^\d{3}-?\d{2}-?\d{4}$` or masked `***-**-dddd`, auto-format XXX-XX-XXXX.
- Options: race/ethnicity/biologicalGender from `GET /type/key/Person` VALUE_LIST attributeValues (drop "n/a", sort) — works for patients in current FE.
- Save: dirty fields only → `PUT /user/edit`; cleared optional → "n/a"; SSN sent only if dirty & not masked. Then `GET /user/myself` + re-query.
- **Unlabeled box = signature pad** (react-signature-canvas, PNG `signature{username}.png`): new → upload relation PersonHasSignatureFile (isPublic=false); replace → `POST /file/{id}/version?current=true`; clear → `DELETE /file/{id}?hardDelete=true`. Existing id from /user/myself `signature`; view `GET /file/{id}/download`.
- No SSN reveal on own profile (provider view has eye → /person/{id}/ssn/expose).

### Phone
- Read `GET /user/contact-point/list?type=Mobile&type=Landline`; Primary sorted first.
- Row: phone (mui-tel-input/libphonenumber; US 10 digits; unique), Type (label) select, Mobile checkbox (→ type Mobile/Landline). Saved rows: number + checkbox locked; only label/bell/delete editable.
- Label options: `GET /type/key/ContactPoint` label attr (enum ref: Primary, Home, Main, Old, Personal, Mailing List, Work, Main Work, Other Work, Vacation Home).
- Primary: not selectable for new or non-mobile rows; ≥1 primary kept if existed; confirm dialog on change. Bell only on Primary row, defaults true.
- Save `POST /health/contact-point` {contactPointsToAdd/Update/Remove}; then refetch; auto-verify new unverified mobile non-Home. Verify button on saved unverified mobile non-Home → `POST /health/contact-point/verify`.
- Delete disabled on last row.

### Email
- Same pattern; type Email; VALID_EMAIL_REGEX; unique (case-insensitive); saved rows locked; Primary only for saved+verified row; exactly one primary; confirm dialog warns login credentials change.

### Social Media
- type "Social Media", label hardcoded "Personal"; single Link field, SOCIAL_URL_REGEX, unique; no verify/bell; delete disabled on last row.

### Location Addresses
- Read `GET person/location/list?page=0&size=100`.
- Fields: Type (Home, Main Work, Other Work, Vacation Home — hardcoded), Set As Primary (radio), Country (`GET public/countries`, US/CA/AU pinned first), Address Line 1 (Google Places autocomplete for US/CA/AU), Line 2, City*, County, State/Province, Zip*.
- validated=true when picked from Google with full data; uniqueness = country+line1+city+zip+type.
- Save: primary first, then parallel POST/PUT/DELETE /person/location; first address auto-primary; delete disabled for primary and last row.

### Insurance
- Card: subscriber name, company, precedence, type, subscriber id, group id, front/back card images (`GET /health/insurance/{id}/file/{fileId}/download?fileRelKey=...`), Edit/Delete, "Deleted" label.
- Fly-in form: company (async autocomplete `GET health/insurance/organizations`, freeSolo create), precedence (one Primary per type), type, relationship, subscriber id (≥3), group id (opt ≥3), effective/cancel/expiration dates (effective < others), subscriber fields when relationship ≠ Self (email ≠ own username, age 18–120), front/back images PNG/SVG/JPEG ≤10 MB.
- Options from `GET /type/key/Insurance`. Save POST/PUT `health/patient/insurance`, then upload card images via relation InsuranceHas{Front|Back}SideCardFile (isPublic=false). Delete `DELETE health/insurance/{id}`.

## No feature flags; only Proctor min-age rule.
