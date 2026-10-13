# Addendum: Personal Profile PRD (technical how)

This addendum holds the technical detail that belongs to architecture and stories rather than the PRD. Paths are relative to the API root (`https://{demo|app}.1health.io/api`). All calls go through `callApi`/`authFetch` in this repo. Sources: `research-1health-fe.md`, `research-backend.md`, `research-api-docs.md`.

## A. FR → endpoint map

| FR | Read | Write |
|---|---|---|
| FR-1 | — | Launch payload decrypted in `app/api/token/route.tsx`, then `POST /v2/public/external-application/auth/oauth2/user/token` `{securityCode, signature}` |
| FR-2 | — | Refresh: `POST <base>/auth/oauth2/token` (`grant_type=refresh_token`, in `lib/auth-client.ts`) |
| FR-9 | `GET /v2/user/myself` (names, `personId`, `signature`); `GET /v2/user/profile-picture/preview?v={imageId}` (blob, fetched with auth) | — |
| FR-10 | Current Profile Picture id: GraphQL `Person(userId){PersonHasProfilePictureFile}` (as today). `GET /v2/person/{id}` is **not** allowed for patients | `POST /v2/health/type/Person/{personId}/relation/PersonHasProfilePictureFile/file/upload?fileName=&isPublic=true` (multipart `file`), then `DELETE /v2/file/{oldId}?hardDelete=true` |
| FR-11/12 | `GET /v2/user/myself` (fields + Masked SSN) or GraphQL `Person` (as today; includes `socialSecurityNumberPreview`) | `PUT /v2/user/edit` with a partial `PersonalInformationDTO`; a cleared optional field is sent as `"n/a"` |
| FR-12 options | `GET /v2/type/key/Person`: VALUE_LIST attributes `race`, `ethnicity`, `biologicalGender` (drop `"n/a"`, sort) | — |
| FR-13 | `GET /v2/person/{personId}/ssn/expose` → `{id, socialSecurityNumber}` (a patient may call it for their own record) | SSN is sent via `PUT /v2/user/edit` only if changed and not masked; `"n/a"` clears it; a duplicate returns `SOCIAL_SECURITY_NUMBER_EXISTS` |
| FR-14 | Signature id from the `signature` field of `GET /v2/user/myself`; `GET /v2/file/{id}/download` | New: `POST /v2/health/type/Person/{personId}/relation/PersonHasSignatureFile/file/upload?isPublic=false`; replace: `POST /v2/file/{id}/version?current=true` (multipart `fileNewVersion`); clear: `DELETE /v2/file/{id}?hardDelete=true` |
| FR-15–19 | `GET /v2/user/contact-point/list?type=Mobile&type=Landline` | `POST /v2/health/contact-point` `{contactPointsToAdd[], contactPointsToUpdate[], contactPointsToRemove[]}`; verify via `POST /v2/health/contact-point/verify {contactPointIds}` |
| FR-16/20 options | `GET /v2/type/key/ContactPoint`, attribute `label` | — |
| FR-20–23 | `GET /v2/user/contact-point/list?type=Email` | Same as FR-15–19 (`POST /v2/health/contact-point`, verify via `POST /v2/health/contact-point/verify`) |
| FR-24 | `GET /v2/user/contact-point/list?type=Social Media` | `POST /v2/health/contact-point` with `type:"Social Media"`, `label:"Personal"` |
| FR-25–27 | `GET /v2/person/location/list?page=0&size=100` | `POST /v2/person/location`, `PUT /v2/person/location/{id}`, `DELETE /v2/person/location/{id}`; to switch the Primary Address, PUT the new Primary first, then the rest |
| FR-26 countries | `GET /v2/public/countries` | — |
| FR-28 | `GET /v2/health/patient/insurance?page=0&size=100`; card images: `GET /v2/health/insurance/{id}/file/{fileId}/download?fileRelKey=InsuranceHasFrontSideCardFile\|InsuranceHasBackSideCardFile` | — |
| FR-29 | Insurer search: `GET /v2/health/insurance/organizations?name=&page=&size=`; options: `GET /v2/type/key/Insurance` | `POST /v2/health/patient/insurance` / `PUT /v2/health/patient/insurance/{id}` (`InsuranceDTO`; types MEDICAL, DENTAL, HOSPICE, VISION, DRUG); then card uploads: `POST /v2/health/type/Insurance/{id}/relation/InsuranceHas{Front\|Back}SideCardFile/file/upload?isPublic=false` |
| FR-30 | — | `DELETE /v2/health/insurance/{id}` |

## B. Contact Point rules the UI must explain before save

Source: `ContactPointConstants` and the service's 400 responses.

- **Contact Types:** Email, Mobile, Landline, Social Media. The Contact Type can't change after creation.
- **Contact Labels:** Primary, Home, Main, Old, Personal, Mailing List, Work (backend enum). Intersect `/type/key/ContactPoint` with this list and always exclude "Partnership Organization"; any other label returns 400 `INVALID_ENUM_VALUE`.
- **Primary rules** (Primary is the Contact Label, not a flag):
  - At most one Primary per Contact Type.
  - Email and Mobile only: a Contact Point can't be *added* directly as Primary.
  - An Email must be Verified to become Primary.
  - A Mobile must be Verified to become Primary, unless the person has no Verified Mobile at all.
  - The new Primary and the old one, relabeled "Old", go in the **same** `contactPointsToUpdate` request.
  - A Primary Email or Mobile can't be removed until another one is promoted.
  - A new Primary Email can't belong to another user.
- **Limits:** at most 20 Contact Points per Contact Type, and no duplicates.

## C. Fixed option lists (not served by the platform)

- **Gender identity:** Asked but not answered, Female, Male, Other, plus free text.
- **Address Types:** Home, Main Work, Other Work, Vacation Home.
- **Fallback race and ethnicity values** from the backend seed (`external.json`), used if `/type/key/Person` fails:
  - **Race:** American Indian or Alaska Native, Asian, Black or African American, Hispanic or Latino, Middle Eastern or North African, Native Hawaiian or other Pacific Islander, White, Other Race, Unknown.
  - **Ethnicity:** Not Hispanic or Latino, Hispanic or Latino, Unknown.

## D. Implementation notes for architecture

### Saving
- **Save all (FR-5):** each Section exposes `validate()` and `save()`. The page calls `validate()` on every changed Section, then saves them. Saves are not atomic. The exact ordering is decided in architecture (see `review-adversarial.md` C3). `PUT /v2/user/edit` must **never** include `email` or `phoneNumber`, because that triggers `switchPrimaryContactPoint`.
- **Auto-verify after save (FR-17/21):** compare the Contact Point list before and after the save to find new unverified Mobile and Email ids whose Contact Label isn't Home, then call verify. Run it per Section, after that Section's save resolves.
- **Address fields:** the request DTO uses `primary` / `validated`; the response uses `isPrimary` / `isValidated`.

### Security (NFR-1)
- **Server proxy (decided 2026-10-13):** this reworks the template.
  - **Today:** `app/api/token/route.tsx` sets `access_token`/`refresh_token` cookies with `httpOnly:false` and returns the token in the body. `lib/auth-client.ts` refreshes in the browser, and `callApi` calls 1health directly.
  - **Target:**
    - A Next.js route handler, e.g. `app/api/1h/[...path]/route.ts`, reads the httpOnly cookie, attaches the Bearer token, forwards to `{baseUrl}/api/...`, and streams the response back (including multipart and binary for files and images).
    - Token refresh moves server-side.
    - `callApi` points at the proxy.
    - The environment and base URL come from a server cookie.
  - Architecture must keep `lib/api/*` signatures stable so modules don't change.
- **Images:** with the proxy, the preview and download endpoints can be used as `<img src="/api/1h/...">` without blob conversion. Set `Content-Type` from the upstream response, and add `Content-Disposition: attachment` for non-raster types.
- **Debug logger:** the template's `authFetch` logs full request/response bodies, including tokens. Disable it in production builds; in other builds, redact tokens and SSN.
- **SSN reveal (FR-13):** keep the revealed SSN in component state only, clear it on a timer and on visibility change, and exclude it from the `authFetch` debug logger.

### Libraries and providers
- **Address suggestions (FR-26):** today uses Google Places for US/CA/AU. This app needs its own Places API key. Decide in architecture whether the key is server-proxied or referrer-restricted.
- **Phone input:** today uses `mui-tel-input` + libphonenumber. Use a Tailwind-friendly equivalent, e.g. `libphonenumber-js` + a custom country picker.
- **Signature pad:** today uses `react-signature-canvas`. It works without MUI and can be reused.
- **Form stack:** today uses yup + react-hook-form. This repo already has `zod`, so react-hook-form + zod is the suggested pairing. Decide in architecture.

## E. Jira sync plan (Finalize handoff)

- **NG-9019:** update the description with the vision, scope, links to the PRD and this addendum, the feature-to-sub-task map, and dependencies. Mention that the PM will create Medical (Epic 2) later.
- **NG-9020 to NG-9026:** update each with its feature's description, FRs (as acceptance criteria), and endpoints from §A.
- **NG-9027:** note that the fork is done (this repo), plus External Application registration and env vars.
- **NG-9029 "Insurance tab":** created 2026-10-13 with FR-28 to FR-31.
