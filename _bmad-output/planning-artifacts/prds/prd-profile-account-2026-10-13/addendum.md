# Addendum: Profile module — technical notes

This addendum supports `prd.md` with implementation-level detail for architecture and stories. Sources: `research-1health-fe.md`, `research-backend.md`, `research-api-docs.md`.

All paths are `<base>/api/v2/...` and every call goes through the shared BFF proxy (`/api/1h/...`). Each path below must be added to the proxy allowlist (AM-6).

## A. Endpoint map

| FR | Method | Path | Request | Response / notes | Gate |
|---|---|---|---|---|---|
| 104, 110 | GET | `user/myself` | — | `UserDTO`: firstName, lastName, username, email, phoneNumber, birthDate (yyyy-MM-dd), timeZone, preferredLanguage, locale, roles (Proctor → 21+), tenants, mfaEnabled, totpEnabled, signature{id} | authenticated |
| 107 | GET | `user/contact-point/list?type=Email&type=Mobile&type=Landline` | — | `[{id,type,value,label,isVerified,…}]`. Keep `isVerified`. The current primary has `label==="Primary"` | Patient fn |
| 105, 107, 108 | PUT | `user/edit` | dirty subset `{firstName,lastName,birthDate,email,phoneNumber,phoneNumberRegion,preferredLanguage}` | 200 empty. **Never send an unchanged `email`** (R1: own email → 400 "already exists"). **Don't send `locale` here** (R2) | Patient fn |
| 108 | POST | `user/time-zone?timeZone=<IANA>` | empty | 200 empty | authenticated |
| 108 | POST | `user/locale?locale=en-US` | empty | 200 empty. Writes the column that `/myself.locale` reads | authenticated |
| 111 | POST | `mfa/enable/totp` | — | `{qrCode}` data URI, a new secret each call. 400 "Mfa is not enabled for this user." / "Mfa config is missing." means base MFA is off, so show the FR-111 message. 400 if TOTP is already enabled. **The app never calls `mfa/enable`** | Patient/Proctor fn |
| 111 | POST | `mfa/validate?code=NNNNNN` | — | raw `boolean`. A wrong code is **200 false** | Patient/Proctor fn |
| 112 | POST | `mfa/disable/totp` | — | 200 empty | Patient/Proctor fn |
| 113, 116 | GET | `user/npi` | — | `{providerNpi?, practiceNpi?{…, organization{id,name,tenantId}, verified}, hieEndpoint?}` | Patient fn |
| 114 | GET | `public/npi/list?entityTypeCode=1\|2&searchText=&page=&limit=10` | — | Page `{data:[{id,npi,providerFirstName,providerLastName,providerOrganizationName,…City,…State,…MailingAddress}], totalElements}`. Public, no auth | public |
| 115, 116 | GET | `health/npi/{npiRecordId}/is-registered` | — | `boolean`. The **record id**, not the 10-digit NPI. For the FR-116 CTA use `practiceNpi.id` from `user/npi`, falling back to today's lookup (`public/npi/list?entityTypeCode=2&searchText=<orgNpi>`) | Patient fn |
| 115 | POST | `user/register/npi` | `{providerNpiId, practiceNpiId?}` (record ids) | 200 empty. Irreversible | Patient fn |
| 116 | GET | `file/{id}/download` | — | signature blob | — |
| 116 | GET | `tenant/sys-config?Tenant%20IDs=<id>&includeAllRelations=true` | — | support contact for the Practice Name popover (the param name contains a space) | authenticated |
| 117–119 | GET | `user/organization/portal?name=&page=<0-based>&size=12` | — | `{data: OrganizationPortalResponseDTO[], totalElements, totalPages}`. Fields used: tenantId, subdomain, tenantLogo.publicUrl, enabledInTenant, organization{name, shortOrganizationName, type[], personContacts[]}. Keep items with `organization != null`; sort on the client | Patient fn |
| — | ~~GET~~ | ~~`user/switch-tenant/{id}`~~ | | **Not called by the app** (R7: revokes the app token, issues a portal token without `externalApplicationId`, changes the persisted tenant). Enter portal is a top-level navigation | |

The error envelope is `{message, code}`. Show `message` for any 4xx or 5xx that has one, and the generic error otherwise. Branch only on the HTTP status, plus the documented MFA messages above. The proxy redacts the `code` query parameter of `mfa/validate` in all logs (AM-6).

## B. Parity constants (from 1health-fe)
- **Time zones** (`AccountSettingsForms.ts:10-17`): Pacific/Honolulu "Hawaiian", America/Anchorage "Alaska", America/Los_Angeles "Pacific", America/Denver "Mountain", America/Chicago "Central", America/New_York "Eastern".
- **Locale:** `en-US` "English - United States". Today 1health-fe sends `en-us` through `/edit`; the new app sends `en-US` through `/locale`.
- **Language:** `en` "English".
- **Organization Type map:**

  | Type | Icon (today) | Label |
  |---|---|---|
  | Health Provider | HealthAndSafety | Healthcare |
  | Lab | Science | Lab |
  | Supplier | LocalShipping | Supplier |
  | Go To Market | Storefront | Go To Market |
  | n/a | Info | No types selected for this organization |

  New in UX: Population Health, Insurance, Carrier, Manufacturer, Enterprise, Government Agency, and "Healthcare" (a backend type separate from "Health Provider"), plus a fallback.
- **Internal domains** for "Create new organization": `@1health.io`, `@tachin.ai`.
- **Empty-state feature rows:** Lab "Add your tests offered and enable order management."; Healthcare "Order tests, get results, and manage your patients."; Supplier "Provide fulfillment and logistics for collection devices."; Go To Market "Create and sell test products."

## C. Implementation notes
- **MFA sequence (parity):**
  1. Call `enable/totp`. A "not enabled" or "config missing" 400 shows the FR-111 card message.
  2. Show the QR, then call `validate?code=`. A 200 `false` shows the inline "invalid code" message.
  3. On close, re-fetch `myself`.
  - Never call `mfa/enable` or `mfa/disable`.
  - Don't re-request a QR while the dialog is open: a new request rotates the secret.
- **Personal Account save:**
  1. `PUT edit` (only the dirty fields; `email` and `phoneNumber` only when changed, per AM-4).
  2. Then `time-zone` and `locale`, independently.
  3. Each successful call moves its fields into the baseline (FR-109), so a retry never re-sends an email that already succeeded.
- **Locale:** write it with `POST user/locale`, because `/edit`'s `locale` goes to an attribute that `/myself` doesn't read (R2). When `/myself.locale` is empty, display "English - United States" (FR-108).
- **Empty-state rule:** call the list and use `totalElements === 0` with no search text. Don't use today's `user.tenants.length <= 1` shortcut.
- **Portal hand-off:**
  - Build the URL from the env portal origin plus a numeric tenantId (A4).
  - The app is always top-level in its own tab (never framed), so every hand-off is a same-tab `location.assign(url)` after the leave guard. No `window.open` / framed branch.
  - Organization creation: `<portal origin>/organizations/create`.
- **MTA:** can't launch External Applications, so the MTA branches in 1health-fe (the forced tenant count, the different switch path) are dropped from the new app.
- **E2E fixtures:** `1health-fe/e2e/fixtures/account-settings-data.ts` has realistic payloads for `myself`, the organization portal, and NPI.
- **Known doc errors:** the MCP / `1h-api-mcp-py` api-docs show wrong shapes for update-password, enable/totp and organization/portal. Use agents.md and the backend source.

## D. Copy table (old → new; approved delta D3)
| Where | Today | New |
|---|---|---|
| First/Last name empty | "First Name cannot be empty" | "First name is required" / "Last name is required" |
| Name too long | "First name can be up to 24 symbols long" | "First name can be up to 24 characters" (same for last name) |
| Birth date empty | "Birth Date cannot be empty" | "Birth date is required" |
| Birth date format | "Invalid date format. The date format should be MM/DD/YYYY" | "Enter a date as MM/DD/YYYY" |
| Birth date age | "...between 18 and 120 years old.." / "...between 21 and 120 years old." | "You must be between 18 and 120 years old" / "You must be between 21 and 120 years old" |
| Primary phone empty | "Invalid phone number" | "Primary phone is required" |
| Primary email invalid | "Invalid email address" | unchanged |
| Language / TZ / Locale empty | "Preferred Language cannot be empty", … | "Select a preferred language", "Select a time zone", "Select a locale" |
| Save with no changes | "There are no changes!" | "There are no changes" |
| Save success | "Personal account updated successfully" | unchanged |
| Partial save | — | "{Part} was not saved. {platform message}" |
| Load error | "Something went wrong while loading profile information" (toast) | the same text, inline with Retry |
| MFA short code | "Please enter the code" (toast) | "Enter the 6-digit code" (inline) |
| MFA wrong code | "Invalid Code. Try again." (toast) | "Invalid code. Try again." (inline) |
| MFA linked | "{App} Authenticator is linked successfully" | "{App} authenticator linked" |
| MFA disabled | "Successfully disabled" | "Authenticator app disabled" |
| MFA base off | generic error toast | "Your account doesn't have multi-factor authentication turned on, so an authenticator app can't be linked yet. Contact support." |
| NPI required | "Personal Npi field is required field" | "Personal NPI is required" |
| Personal NPI taken | "Npi is already registered try to look again your own" | "This personal NPI is already registered. Check that you selected your own." |
| Practice NPI taken | "The practice Npi is already registered try to look again" | "This practice NPI is already registered. Check that you selected the right practice." |
| Register success | "Provider Npi is successfully registered" / "Your Provider Npi and Practice NPi are registered successfully!" | "Provider NPI registered" / "Provider and practice NPIs registered" |
| Register error | "There is error in the registration. Please call 1-888-555-1212 for assistance." | "There was an error in the registration. Please call 1-888-555-1212 for assistance." |
| NPI search failed | — (empty list) | "Couldn't load results. Try again." |
| NPI search, no results | — | "No matching NPI found" |
| Register error placement | toast | inline error banner in the Healthcare credentials Section, until the next Register |
| Section heading | "Personal Account Settings" | "Personal account settings" |
| Password (locked) help | — | "Password changes aren't available here." |
| MFA linked status | green check, no text | check + "Enabled" next to "Authenticator app" (PRD FR-110 wording "Authenticator app enabled" condensed) |
| Organization disabled | — (button disabled) | "You're disabled in this organization" |
| No access | — | "You don't have access to this in your current account" |

## E. Parity checklist (SM-101; the app runs top-level in its own tab)
1. Entry: the portal Apps tile "Personal Profile" lands on `/`; app bar **Account** opens `/account` (Personal Account) and **Personal Profile** returns, with the leave guard on unsaved changes; `/account?tab=…` by direct URL works with a session and shows the launch-error screen without one. The 1health-fe user menu still opens legacy `/personal-settings`.
2. Account view: all 10 fields in order; empty and unknown values.
3. Edit and save names and birth date; the age rule (Patient 18, Proctor 21); the "?" help.
4. Switch Primary Email and Phone (including a landline); disabled picker plus link; the notice on the first change; own-email not re-sent.
5. Language, time zone and locale: blank values force a pick; an unlisted value is kept.
6. Partial-save failure and retry.
7. MFA: link with a correct and a wrong code; base MFA off; inactive tiles when enabled; disable with confirmation.
8. NPI: search individual and organization; register personal only, and personal plus practice; already-registered checks; error fallback.
9. Registered view: all fields; the practice popover; "already exists" text; signature; the Register-your-practice CTA.
10. Organizations: search, pagination, sorting, logo fallback, 4 icons plus "+N", every type, the primary-contact popover, a disabled organization.
11. Empty states: no organizations (external and internal email), no results.
12. Enter portal and organization-create hand-offs navigate the same tab, after the leave guard.
13. 403 and load-error states per tab; skeletons.
