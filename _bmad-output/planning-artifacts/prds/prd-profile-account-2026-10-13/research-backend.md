# Backend research: Profile module (NG-9019)

Source repo: `/Users/idanielgarcia/Documents/DEV/oneHealth/1h-ng-bo-core-be` (branch at commit `9a7342252e`, read-only).
Test repo: `/Users/idanielgarcia/Documents/DEV/oneHealth/1h-ng-api-test-py`.
Date: 2026-10-13. Paths below are relative to the backend repo root unless absolute.

Abbreviations: `BC` = `bo-core/src/main/java/com/sirma/bocore`, `OA` = `oauth2/src/main/java/com/sirma/bocore/auth`, `CM` = `common/src/main/java/com/sirma/bocore/common`.

---

## 0. Cross-cutting facts

### Base paths
- bo-core context path is `/api` (`bo-core/src/main/resources/application.properties:7`). So `/v2/user/myself` is called as `<base>/api/v2/user/myself`.
- The oauth2 server's context path is `/auth`. The browser should never call its internal Feign endpoints; bo-core proxies to them.

### Authorization layers (`CLAUDE_DOCS/access-control.md`)
1. JWT validation.
2. **PolicyEnforcer** (`BC/v2/security/PolicyEnforcer.java:74-143`) matches method + URL pattern against the user's per-tenant role permissions from `bo-core/src/main/resources/access-control.json`.
   - MTA and System Admin skip it (`BC/v2/security/PolicyEnforcerHandlerInterceptor.java:34-41`).
   - Endpoints whose method `@PreAuthorize` is exactly `isAuthenticated()` or `permitAll()` are **allowed by default** for non-internal clients (`BC/v2/security/ApiEndpointAwareApplicationStartEventListener.java:63-85`). The `internalClient` JWT claim is set only for client-credentials tokens (`OA/config/BocoreJwtTokenCustomizer.java:65-66,193-195`), so it does not apply to our user tokens.
   - Otherwise the user's roles must include a functionality that lists the endpoint. Otherwise **403** `"There are no permissions allowing the access to this endpoint: ..."` (`PolicyEnforcer.java:138-142`).
3. `@PreAuthorize` method checks.
4. Role → functionality mapping (`access-control.json`, `permissions` block): Patient → "Patient functionality"; Proctor → "Proctor functionality"; Employee, Manager → their own; System Admin and Everything → `/*`; **Doctor → none**.

Practical rule: every Profile endpoint below is either `isAuthenticated()` (open to any logged-in user) or listed in **Patient functionality**. A user who only has a non-Patient role in the current tenant (for example only Doctor or Employee) gets 403 on the "Patient functionality" ones, unless they are System Admin or MTA.

### Error envelope
- All handled errors return JSON `{"message": string, "code": int}` (`CM/.../model/dto/ErrorMessageDTO`, built by `BadRequestResponseDTO`).
- Mapping in `BC/common/exception/RestExceptionHandler.java`:
  - `BadRequestException`, `ValidationException`, `IllegalArgumentException` → 400 (lines 49, 74, 121)
  - `IllegalStateException` → **409** in bo-core (line 161)
  - `AccessDeniedException` → 403 (line 154)
  - `OtpCooldownException` → 429 (line 202)
- Errors that come back from the oauth2 service through Feign with any 4xx are rethrown as `BadRequestException` → **400** with the original message (`BC/config/feign/FeignErrorDecoder.java`). So MFA and password errors raised in oauth2 (even `IllegalStateException`) reach the browser as 400.
- The UI should show `message` as is. There are no machine-readable error codes; branching must be done on HTTP status, or on message text (fragile).

### Audit
- There is no dedicated audit log for profile edits, password changes, MFA changes or tenant switches. Only row metadata (`updated_by_process`, `ts_updated`) and opt-in request/SQL tracing (`BC/config/http/trace/EndpointTraceInterceptor.java`) exist. If the PRD needs "who changed what", that is new backend work.

---

## 1. Tab: Personal Account Settings

### 1.1 Read current user: `GET /api/v2/user/myself`
- Handler: `BC/v2/rest/UserResource.java:399-404` → `UserServiceImpl.getMyUserInfo` (`BC/v2/service/user/UserServiceImpl.java:2638-2655`) → `getUserDTO` (`:2657-2700`).
- Security: `@PreAuthorize("isAuthenticated()")` (allowed by default). Also listed in Patient and Patient Vault functionality.
- Response: `UserDTO` (`BC/v2/dto/UserDTO.java`), which extends `OneHealthUserDTO` (`BC/v2/dto/OneHealthUserDTO.java`).

| Field | Type | Notes |
|---|---|---|
| `id` | Long | user id |
| `keycloakId` | String | legacy, null |
| `username` | String | read-only, no edit endpoint |
| `firstName`, `lastName`, `middleName` | String | |
| `email`, `phoneNumber` | String | **overwritten with the person's primary Email/Mobile contact point** (`UserServiceImpl.java:2769-2787`) |
| `enabled`, `emailVerified` | Boolean | `emailVerified` is forced to `true` (`:2672`) |
| `isMta` | Boolean | |
| `roles` | Set<String> | roles in the current tenant |
| `groups` | Set<GroupDTO> | |
| `timeZone` | String | IANA id, from the `bocore_user.time_zone` column |
| `locale` | String | from the `bocore_user.locale` column (see risk R2) |
| `preferredLanguage` | String | user attribute |
| `birthDate` | LocalDate `yyyy-MM-dd` | **null when the user hasn't accepted terms** in the current tenant (`:2676`) |
| `possibleEnglishCommunication`, `race`, `ethnicity`, `biologicalGender`, `genderIdentity`, `sexualOrientation`, `namePrefix`, `nameSuffix`, `otherNames`, `titles`, `cityOfBirth` | | personal-info fields (not this tab) |
| `personId` | Long | |
| `socialSecurityNumber` | String | preview / masked |
| `signature` | {id, name} | |
| `systemAdministrator`, `customerSupport` | Boolean | for the current tenant |
| `tenants` | [{id, name}] | every tenant the user belongs to (unpaged, no logo) |
| `tenantContext` | {id, name} | current tenant |
| `acceptedTerms` | Boolean | |
| `mfaEnabled`, `totpEnabled` | boolean | **MFA status lives here.** There is no separate status endpoint for self |

- Errors:
  - 403 `AUTH_MISSING` when no authentication.
  - 400 `"Login restricted. You will be able to do so once your pending tenant join request is approved."` when the join request is pending (`:2652-2653`).
  - 400 when the user is not found.
- Side effect: it syncs contact points from federated identities (Google etc.) on every call (`:2686`).

### 1.2 Contact points for the primary email/phone pickers: `GET /api/v2/user/contact-point/list?type=Email&type=Mobile`
- Handler: `UserResource.java:480-486` → `PersonServiceImpl.fetchAllCpByTypesInAndPersonId` (`BC/v2/service/PersonServiceImpl.java:886`).
- Security: no `@PreAuthorize`; Patient functionality.
- Query: `type` is a String[] using the contact point type *names*: `Email`, `Mobile`, `Landline`, ... (`BC/v2/misc/onehealth/contact_point/ContactPointConstants.java:151-160`). An empty value returns all types.
- Response: `ContactPointResponseDTO[]` (`BC/v2/dto/ContactPointResponseDTO.java`) with `id`, `name`, `value`, `type`, `label` (`Primary`, `Old`, `Work`, `Home`, ...), `isVerified`, `phoneNumberRegion`, `isNotificationEnabled`.
- UI rule: offer only rows where `isVerified === true`. The current primary is the row with `label === "Primary"`.
- Adding and verifying new contact points is a separate flow (not in this tab):
  - `POST /api/v2/health/contact-point` (`BC/v2/rest/onehealth/ContactPointResource.java:18-28`)
  - `POST /api/v2/health/contact-point/verify` (`BC/v2/rest/OneHealthResource.java:132-136`)
  - `PUT /api/v2/public/contact-point/verify` (`BC/v2/rest/OneHealthPublicResource.java:71`)
  - Max 20 contact points per type (`ContactPointConstants.java:32`).

### 1.3 Update profile: `PUT /api/v2/user/edit`
- Handler: `UserResource.java:282-286` → `UserServiceImpl.editUserProfile` (`UserServiceImpl.java:623-650`). Validation in `validateUserAttributes` (`:652-814`).
- Security: no `@PreAuthorize`; Patient functionality.
- Request: `PersonalInformationDTO` (`BC/v2/dto/PersonalInformationDTO.java`). **Partial update**: every field is optional and null means "leave unchanged". Fields relevant to this tab:

| Field | Validation (file:line) |
|---|---|
| `firstName` | trimmed/cleaned, length 1–24 (`:657-663`; `OneHealthConstants.java:15,20`) |
| `lastName` | 1–24 (`:673-679`) |
| `middleName` | 1–24 |
| `email` | `BoUtil.isValidEmail`. Must already exist on the person **and be verified** (see the primary switch below) |
| `phoneNumber` + `phoneNumberRegion` | `PhoneUtil.validateAndCleanForRegion`; region defaults to US and must be lowercase per the test repo (e.g. `us`). Must already exist **and be verified** |
| `birthDate` | `yyyy-MM-dd`; age must be **18–120** (`:691-701`; `OneHealthConstants.java:39,41`; `BC/v2/util/OneHealthUtil.java:96-104`) |
| `preferredLanguage` | must be an ISO-639 code, optionally with `-CC` (`en`, `en-US`). Full names like `english` are rejected with `"Invalid preferred language format. Example of correct format: [en]."` (`:702-715`; `BC/v2/util/StringUtil.java:170-194`) |
| `locale` | `lang` or `lang-CC` with hyphen (`:716-722`). **Stored as a user attribute, not the `locale` column that `/myself` returns** (risk R2) |
| `username` | `@Schema(READ_ONLY)`; ignored |
| others | race, ethnicity, genders, SSN, ... (not this tab) |

- Primary email/phone switch (`BC/v2/service/onehealth/ContactPointServiceImpl.java:775-842`):
  - Errors: `"In order to set '%s' as new primary contact point it should be added and verified first."` (value not on the person, `:796-798`); `"Contact point with value '%s' is added as %s but it's not verified yet. Please verify it."` (`:816-819`). Both are 400.
  - On success, the chosen contact point becomes `label=Primary` and the old primary becomes `label=Old`.
  - It then updates the oauth2 user (Feign `RevertibleEditUserFeignOperation`, `UserServiceImpl.java:639-644`), so the **login email changes too**.
- Errors: 400 with `message` (validation, `USER_ALREADY_EXISTS`, invalid DOB `REGISTER_PATIENT_INVALID_DOB_PROVIDED`, invalid language/locale). The test repo also saw 400 when the SSN collides with another person.
- Response: `200` with an empty body. Re-fetch `/myself` afterwards.
- **R1, important:** `editUserProfile` calls `getUserByEmail(dto.getEmail())` and throws `"User with email '%s' already exists."` if **any** user has that email, **including the caller** (`UserServiceImpl.java:629-632`; oauth2 lookup `OA/service/UserService.java:918-923` doesn't exclude self). So send `email` only when it actually changes, and the new email must not be any account's login email. The test repo strips `email` and `phoneNumber` from this payload for the same reason (`1h-ng-api-test-py/backend/app/services/test_runner_service.py:922-933`).

### 1.4 Default time zone: `POST /api/v2/user/time-zone?timeZone=America/New_York`
- Handler: `UserResource.java:426-433` → `UserServiceImpl.setTimeZone` (`:1421-1429`) → oauth2 `UserService.setTimeZone` (`OA/service/UserService.java:768-780`).
- Security: `isAuthenticated()` (allowed by default).
- Validation: `ZoneId.of(timeZone)`; invalid → `"Invalid time zone."` → 400.
- Stored per user (global, not per tenant). The response is empty.

### 1.5 Preferred locale: `POST /api/v2/user/locale?locale=en-US`
- Handler: `UserResource.java:435-442` → `UserServiceImpl.setLocale` (`:1431-1443`) → `OA/service/UserService.java:782-792`.
- Security: `isAuthenticated()`.
- Validation: `lang` or `lang-CC` (ISO language + ISO country, hyphen-separated) (`OA/service/UserService.java:1184-1192`). Invalid → `"Invalid locale specified."` → 400.
- This writes the `locale` column that `/myself.locale` reads. **Use this, not `PUT /edit` `locale`** (R2).
- There is **no separate date format / time format / currency setting** in the backend. The UI must derive date, time and currency formatting from `locale` (and time zone) with `Intl`. Separate format preferences would need new backend fields (open question Q1).

### 1.6 Option lists (languages, time zones, locales)
- **No backend endpoints exist** for language, time zone or locale lists (searched every `@*Mapping`; the test repo confirms this). The only reference list is `GET /api/v2/public/countries` (`BC/v2/rest/PublicResource.java:63-66`), which returns `IdNameDTO[]`.
- Recommendation: build the lists on the client:
  - time zones from `Intl.supportedValuesOf('timeZone')`
  - languages and locales from a curated list of ISO codes with `Intl.DisplayNames`
  - Every value must pass the server's Java checks: `ZoneId.of`, `Locale.getISOLanguages()` and `Locale.getISOCountries()`.
- Check `../1health-fe` for the current hard-coded lists to keep parity.

### 1.7 Change password: `PUT /api/v2/user/update-password`
- Handler: `UserResource.java:390-397` → `UserServiceImpl.updateCurrentUserPassword` (`:2293-2303`) → Feign → `OA/service/UserService.java:838-844,1137-1182`.
- Security: `isAuthenticated()` (allowed by default; not listed in access-control.json, so it relies on that default).
- Request: `UpdateUserPasswordDTO` (`CM/model/dto/UpdateUserPasswordDTO.java`, extends `ForgotPasswordDto`):
  ```json
  { "password": "<current>", "newPassword": "<new>", "confirmNewPassword": "<new>" }
  ```
- Rules, in order:
  1. `newPassword` and `confirmNewPassword` must be non-empty (`:1172-1173`).
  2. **Minimum 12 characters** (`MIN_PASSWORD_LENGTH = 12`, `OA/service/UserService.java:52,876-881`). There is **no** complexity rule (upper/lower/digit/symbol) and no maximum length.
  3. `newPassword` must equal `confirmNewPassword` (`:1177-1181`).
  4. **The current password is required** and must match: `"The provided credentials are incorrect. Please try again."` (`OA/service/impl/PasswordServiceImpl.java:25-31`).
  5. It must not be one of the **last 5** passwords: `"The new password cannot be the same as an old password."` (`PasswordServiceImpl.java:35-41`; `MAX_OLD_PASSWORDS = 5`, `UserService.java:53`).
- Errors arrive as 400 (through Feign). The response is empty.
- Sessions and tokens are **not** revoked after a change, and no email notification is sent from this path.
- **R3:** users who signed up with Google or another federated login and have no password hit `Assert.hasLength(encodedPassword, ...)` → 400 `"Encoded password cannot be null/empty string."`. The UI should hide or replace the form for them. There is an internal `hasUserPassword(userId)` Feign method (`OA/controller/UserController.java:386`), but it is **not exposed** to the browser (open question Q2).
- Related, not for self-service: `POST /v2/user/{userId}/set-password` (MTA only, `UserResource.java:381-388`); `POST /v2/user/{userId}/send-update-password` (email link, `:373-379`).

### 1.8 MFA: authenticator app (TOTP)
Controller: `BC/v2/rest/MfaResource.java` (prefix `/v2/mfa`). Implementation: `OA/service/impl/MfaServiceImpl.java`, `OA/service/impl/MfaTokenManagerImpl.java`.
Security for every self endpoint below: no `@PreAuthorize`; listed in Patient **and** Proctor functionality (`access-control.json:12-28, 677-693`).

The model has two levels: **MFA enabled** (the user has a `user_mfa_config` row, which turns on the email/SMS code at login) and **TOTP enabled** (an authenticator app on top of that).

| Step | Method + path | Handler | Behaviour / errors |
|---|---|---|---|
| Status | `GET /api/v2/user/myself` → `mfaEnabled`, `totpEnabled` | `UserServiceImpl.java:2664-2673` | `totpEnabled` is true only if MFA is enabled too (`MfaServiceImpl.java:207-211`) |
| Enable MFA (base) | `POST /api/v2/mfa/enable` | `MfaResource.java:55-59` → `MfaServiceImpl.enableMfa:74-87` | Creates the config with a new TOTP secret (`totpEnabled=false`). Returns `QrCodeDTO {qrCode}`. Error `"Mfa already enabled."` |
| Start TOTP enrolment | `POST /api/v2/mfa/enable/totp` | `MfaResource.java:67-71` → `MfaServiceImpl.enableTotp:136-154` | Generates a **new** secret and returns `QrCodeDTO {qrCode}`. Errors: `"Mfa config is missing."`, `"Mfa is not enabled for this user."`, `"Totp is already enabled."` |
| Verify code | `POST /api/v2/mfa/validate?code=123456` | `MfaResource.java:97-101` → `MfaServiceImpl.validateAndEnableTotp:102-122` | Returns a raw `boolean` (true means TOTP is now enabled). A wrong code returns **200 `false`**, not an error. Errors: `"Mfa config is missing."`, `"Mfa is not enabled for this user."`, `"Totp secret is missing from mfa config."`, `"Totp is already validated."` |
| Disable TOTP | `POST /api/v2/mfa/disable/totp` | `MfaResource.java:73-77` → `MfaServiceImpl.disableTotp:124-134` | Errors `"Mfa config is missing."`, `"Totp is already disabled."` **No code or password re-check** |
| Disable MFA | `POST /api/v2/mfa/disable` | `MfaResource.java:61-65` → `MfaServiceImpl.disableMfa:89-100` | No-op if there is no config; otherwise `"Mfa already disabled."`. **No re-authentication** |

- TOTP parameters (`MfaTokenManagerImpl.java:26-39`): issuer `1health`, label = user email, SHA1, 6 digits, 30 s period. The verifier allows a time discrepancy (`OA/config/mfa/MfaConfig.java:44-47`). These parameters work with Google Authenticator, Microsoft Authenticator, Authy, Duo Mobile and Android OTP apps; it is generic RFC 6238 TOTP.
- `qrCode` is a **`data:image/png;base64,...` data URI only**. The raw secret and the `otpauth://` URI are **not returned**, so the UI can't offer a "can't scan? enter this key" fallback without backend changes (open question Q3).
- **Recovery codes:** the `recovery_codes` column exists but is always set to `[]` (`MfaServiceImpl.java:252`). There is no generation, display or redemption endpoint. Not supported.
- Recommended UI sequence:
  1. If `!mfaEnabled`, call `/enable` (its QR can be used directly).
  2. Otherwise call `/enable/totp` to get a fresh QR.
  3. Show the QR, then `/validate?code=`, and branch on `true`/`false`.
  4. Re-fetch `/myself`.
  - Calling `/enable/totp` again before validating rotates the secret, so any QR scanned earlier stops working.
- Login-time endpoints (not for the Profile UI): `GET /v2/mfa/config?code=` and `POST /v2/mfa/send-code?code&contactPointId` (public, keyed by an OAuth auth code, `MfaResource.java:103-169`); `GET /auth/mfa/code` (oauth2).
- Admin variants: `/v2/mfa/enable/{userId}`, `/disable/{userId}`, `GET /validate/{userId}` (MTA only, `MfaResource.java:79-95`).
- Test repo: TOTP is used at login as the `totp_code` form field of `POST /auth/oauth2/token` (`1h-ng-api-test-py/backend/app/services/auth_token_service.py:252-266`). `/v2/mfa/enable` and `/validate` are skipped in automated runs because they would break the test login (`backend/app/services/test_generator_overrides.py:1524-1529`).

---

## 2. Tab: Individual Provider Registration

There is **no** dedicated "register as provider" workflow. The Profile flow links the logged-in user's Person record to NPI records **already present in the local NPI table** (a weekly NPPES bulk import). It creates no organization, role, tenant or join request, has **no approval step**, and sets `verified=true` immediately.

### 2.1 NPI lookup (personal and practice): `GET /api/v2/public/npi/list`
- Handler: `BC/v2/rest/OneHealthPublicResource.java:77` → `NpiQueryService.getNpiResults` (`BC/v2/service/npi/NpiQueryService.java:156`).
- Security: **public** (`/v2/public/**` skips JWT and the policy check).
- Query:
  - `entityTypeCode` (Long, default `1`): `1` = Individual (personal NPI), `2` = Organization (practice NPI) (`BC/v2/service/npi/NpiType.java`)
  - `searchText` (default `""`): split on spaces; every word must match as a case-insensitive substring of the record's search text, so the 10-digit number or names both work
  - `page` (default 0), `limit` (default 10)
- Response: a page of `BaseNpiDTO` (`BC/v2/dto/oneHealth/npi/BaseNpiDTO.java`): `id` (**database id; this is what registration needs**), `npi` (10-digit number), `providerFirstName`, `providerLastName`, `providerOrganizationName`, `providerBusinessMailingAddressCityName`, `providerBusinessMailingAddressStateName`, `providerFirstLineBusinessMailingAddress` (organizations only).
- Data source: local `Npi` business-object type loaded from `https://download.cms.gov/nppes/` weekly ZIPs (`BC/v2/service/onehealth/OneHealthServiceImpl.java:142-144`). It is **not a live NPPES proxy**, so very new NPIs may be missing (the test repo got "not found" for made-up numbers).
- Alternative: `POST /api/v2/npi` with `NpiQueryDTO` (`BC/v2/rest/NpiResource.java:40`). Its results have **no db `id`**, and its access-control entry is stale (`/npi` without `/v2`, `access-control.json:2394`), so in practice only admins can use it. Don't use it.

### 2.2 Is an NPI already taken: `GET /api/v2/health/npi/{npi-id}/is-registered`
- Handler: `BC/v2/rest/OneHealthResource.java:199` → `NpiServiceImpl.isNpiRegistered` (`BC/v2/service/onehealth/NpiServiceImpl.java:36`).
- Security: Patient functionality (`access-control.json:196`).
- `{npi-id}` is the **db id**. Returns a `Boolean`: for type 1, whether any Person is linked; for type 2, whether any Organization is linked. Unknown id → 400 `"Npi with id: %d not found."`.

### 2.3 Current registration: `GET /api/v2/user/npi`
- Handler: `UserResource.java:450-454` → `PersonServiceImpl.findLoggedPersonNpiRecords` (`PersonServiceImpl.java:648`).
- Security: Patient functionality (`access-control.json:240`).
- Response: `PersonWithNpiDTO` (`BC/v2/dto/oneHealth/PersonWithNpiDTO.java`):
  - `providerNpi`: `ProviderNpiDTO` {`id`, `npi`, `providerFirstLineBusinessPracticeLocationAddress`, `verified`, `providerFirstName`, `providerLicenseNumber`, `providerSecondLineBusinessPracticeLocationAddress`, `taxonomy` {id, name}}, or **null if not registered**
  - `practiceNpi`: `PracticeNpiDTO` {same base fields, `providerOrganizationName`, `verified`, `organization` {id, name, tenantId}}, or null
  - `hieEndpoint`: `HieEndpointDTO`
- UI states:
  - `providerNpi == null` → show the registration form
  - present → "Registered" (read-only; there is no edit or unregister endpoint)
  - `practiceNpi.organization` present → the practice is a claimed org on 1health

### 2.4 Register: `POST /api/v2/user/register/npi`
- Handler: `UserResource.java:444-448` → `PersonServiceImpl.registerNpi` (`PersonServiceImpl.java:596-645`), in one transaction.
- Security: no `@PreAuthorize`; Patient functionality (`access-control.json:236`).
- Request: `RegisterNpiDTO` (`BC/v2/service/npi/RegisterNpiDTO.java`):
  ```json
  { "providerNpiId": 123, "practiceNpiId": 456 }
  ```
  These are **db ids from `/v2/public/npi/list`**, not NPI numbers. `practiceNpiId` is optional.
- What it does:
  - sets the Person → NPI relation `HasRegistrationWithNpi` with `isVerified=true`
  - if a practice id is given, also sets the `PracticeNpi` relation with `isPracticeVerified=true`
  - all relations are stored in the **default tenant**
- Response: `200` with an empty body.
- Errors (all 400; texts in `bo-core/.../common/Messages.java`):

| Constant (line) | Message text |
|---|---|
| `PROVIDER_NPI_IS_MISSING` (1297) | "Operation failed. Person NPI Number is not provided." |
| `TYPE_INSTANCE_NOT_FOUND` (830) | unknown id |
| `PERSONAL_NPI_IS_ALREADY_REGISTERED` (1299) | "...The chosen Personal NPI Number: %d is already registered." |
| `PERSON_ALREADY_HAS_PROVIDER_NPI` (1301) | the caller already registered; re-registering is not possible |
| `PRACTICE_NPI_IS_ALREADY_REGISTERED` (1300) | |
| `PERSON_ALREADY_HAS_PRACTICE_NPI` (1302) | |

- **R4:** the server never checks that `providerNpiId` is type 1 and `practiceNpiId` is type 2, and the "already registered" uniqueness check only runs when the type matches. The UI must enforce the types by searching with `entityTypeCode=1` and `=2` respectively.
- **R5:** no name match is checked between the user and the NPI provider, and there is no approval step. Anyone with the Patient role can claim any free NPI. This is a product and compliance question (Q4).
- Test repo: `POST /v2/user/register/npi` returns 400 with placeholder data ("already registered" / "not found"; `1h-ng-api-test-py/docs/module-audit-notes/user.md:16-19`).

### 2.5 Related flows that do create membership or approvals (not used by the Profile tab)
- **Provider Practice self-registration:**
  - `POST /v3/public/user/register` (`BC/v3/rest/UserRegistrationPublicResource.java:137`)
  - `POST /v3/user/register` (`BC/v3/rest/UserRegistrationResource.java:109`, scope `user_registration`)
  - Strategy class: `BC/v3/service/ProviderPracticeRegistration.java:90-260`. It needs an invitation (`orgUuid` and a 6-digit `verificationCode`), creates an **Active** join request, claims the org, approves the partnership, and links the NPI when `practiceOwner` is true.
- **Attach an existing account:** `POST /v3/public/user/associate-if-registered` (`UserRegistrationPublicResource.java:187`).
- **Healthcare org plus physician:** `POST /v2/public/organization?key=HEALTHCARE` (`BC/v2/service/tenant/TenantServiceImpl.java:332,600`).
- **Join-request statuses:** `Pre-Approved`, `Pending Approval`, `Active`, `Denied`, `Inactive`, `Expired` (`CM/model/JoinRequestStatus.java`). The current user's requests are at `GET /api/v3/user-management/my-requests?page&limit&status` (`BC/v3/rest/UserManagementResource.java:126-149`, `isAuthenticated()`). This is useful if the PRD wants a "pending" state for anything.

---

## 3. Tab: My Organizations

### 3.1 List: `GET /api/v2/user/organization/portal?name=&page=0&size=50`
- Handler: `UserResource.java:214-222` (`@UseReadReplica`) → `UserServiceImpl.fetchUserTenantsByName` (`UserServiceImpl.java:1212-1246`).
- Security: no `@PreAuthorize`; Patient functionality (`access-control.json:300`).
- Params:
  - `name`: case-insensitive *contains* on org `name`, `shortOrganizationName` or `legalCompanyName`
  - `page`: zero-based, default 0
  - `size`: default 50; no maximum enforced
- Scope:
  - For an **MTA** user: **every** tenant except Default and the MTA group
  - Otherwise: the user's tenants minus Default and the MTA group
  - Only orgs with `isTenant=true` are included (`BC/v2/repository/bo_core/OrganizationRepository.java:3391-3436`)
- Response: `PageImpl<OrganizationPortalResponseDTO>` with fields `data[]`, `pageNumber`, `pageSize`, `offset`, `totalElements`, `totalPages`, `numberOfElements`, `firstPage`, `lastPage`, `emptyPage`.
- Item: `OrganizationPortalResponseDTO` (`BC/rest/dto/tenantConfig/OrganizationPortalResponseDTO.java`), which extends `SysTenantConfigResponseDTO`:
  - `enabledInTenant` (boolean): **false means the user is disabled there and "Enter portal" will fail**
  - `tenantId`, `boiId`, `tenantName`, `subdomain`, `applicationName`, `facilityName`, `tagLine`
  - `tenantLogo`, `tenantDarkLogo`, `tenantTitleIcon`, `tenantDarkTitleIcon`: each `{id, name, currentVersionId, publicUrl}`. **The logo is `tenantLogo.publicUrl`**
  - `primaryColor`, `secondaryColor`
  - `supportEmail`, `supportPhone`, `supportPhoneRegion`, `supportPageURL`
  - `hipaaCoveredEntity`, `allowedDomains[]`, `registrationFlowConfig` (raw JSON)
  - `organization` (`OrganizationWithPersonContactDTO`, may be null):
    - `id`, `name`, `shortOrganizationName`, **`type: String[]`**
    - `claimed`, `organizationTenantId`, `npi` {id, npiNumber}, `headquarterAddress`
    - `primaryCorporateEmail`, `primaryCorporatePhone(+Region)`, `corporateEmailDomain`
    - `companyTaxId`, `duns`, `labClia`, `labDirector`
    - `personContacts[]`, `partnershipStatus`, `direction`
- Org type values (`OrganizationRepository.java:500-511`): `Lab`, `Supplier`, `Manufacturer`, `Enterprise`, `Government Agency`, `Insurance`, `Health Provider`, `Healthcare`, `Go To Market`, `Carrier`, `n/a`. There is **no** "Store", "Shipping" or "Pharmacy" type (the closest are Supplier, Go To Market and Carrier). Tenant *capabilities* (`Proctoring`, `Stripe Integration`, `GetLab Integration`, `Cross-Tenant Analytics`, `Dry Test Probability Calculation`, `Branding Provider`, `External Application`; `BC/v2/repository/OneHealthConstants.java:3301-3309`) are **not returned** by this endpoint (Q5).
- **R6:** SQL sorts by `shortOrganizationName`, but the ids go through `Set.copyOf` and the config fetch has no ORDER BY (`UserServiceImpl.java:1234-1235`; `TenantServiceImpl.java:1727-1760`), so order **within a page is not guaranteed**. Sort again on the client.
- Lighter alternative: `/myself.tenants` gives `[{id, name}]` for all of the user's tenants (no logo, types or paging).

### 3.2 Org details
No "details of one of my orgs" endpoint is aimed at members. Options:
- Use the list item itself (it already carries branding, support contacts, address and types). **Recommended.**
- `GET /api/v2/tenant/sys-config?Tenant IDs=<id>&includeAllRelations=true` returns the same DTO for given ids (`BC/v2/rest/TenantResource.java:971-1069`, `isAuthenticated()`). Note the parameter name really contains a space. It does not check that the caller belongs to those tenants.
- `GET /api/v2/tenant` and `GET /api/v2/tenant/contextConfig` cover the **current** tenant only (`TenantResource.java:105-211`).
- `GET /api/v2/organization/{id}` only works for **partners of the context org** (400 `NOT_FOUND_PARTNER_WITH_ID` otherwise; `BC/v2/rest/OrganizationResource.java:422-429`), so it is not suitable.

### 3.3 Enter portal (tenant switch): `GET /api/v2/user/switch-tenant/{tenantId}?revokeToken=true`
- Handler: `UserResource.java:56-100` → `UserServiceImpl.java:1353-1367` → Feign `POST /auth/tenant/switch-tenant` (`OA/controller/TenantController.java:129-133`) → `OA/service/TenantService.java:229-268`.
- Security: `isAuthenticated()`; also Patient functionality (`access-control.json:516`). It is a **GET that changes state**.
- `revokeToken` (default **true**): revokes the caller's current token immediately.
- What it does:
  1. saves the user's tenant context (`user_tenant_context`)
  2. touches the join request's `lastActivity`
  3. optionally revokes the old token
  4. **issues a new token pair** scoped to the tenant (`OA/service/impl/ThirdPartyTokenServiceImpl.java:116-153`)
  5. bo-core then calls `organizationService.claimEntity` (`BC/v2/service/OrganizationServiceImpl.java:1981`)
  6. if anything fails, the switch is reverted
- Response: `SwitchTenantResponseDTO` (`CM/model/dto/SwitchTenantResponseDTO.java`):
  - `user`: `BocoreUserWithRoles` (id, username, email, names, `tenants[]`, `disabledInTenants[]`, roles, groups, timeZone, locale, ...)
  - `auth`: {`id`, `scope`, `token_type`, `access_token`, `expires_in`, `refresh_token`}
- Errors (400): system user; tenant not found; `"The user: %s doesn't belong to: %s."`; `"The user: %s is disabled in tenant: %s."`; missing person (`MISSING_PERSON_WITH_USER_ID`).
- JWT claims depend on the tenant (`OA/config/BocoreJwtTokenCustomizer.java:47-55,98-115,163-189`): `tenantId`, encrypted `organizationId`, per-tenant encrypted `roles`, `isMta`, `personId`. The access-token TTL is the tenant's validity ÷ 2. **The client must replace both stored tokens with `auth.*`.**
- Test repo usage: `GET /v2/user/switch-tenant/{id}?revokeToken=false`, reading `resp.json()["auth"]["access_token"]` (`1h-ng-api-test-py/backend/app/services/auth_token_service.py:231-250`; tests in `tests/test_auth_token_service.py:151-190`).
- **R7, app-architecture impact:** this starter app keeps tokens in cookies set by `app/api/token/route.tsx`, and the access token is bound to the app's OAuth client and launch. "Enter portal" probably means sending the user to the **1health portal** for that tenant, not switching this app's own token. Decide between:
  - (a) calling switch-tenant with `revokeToken=false` and handing off to the portal URL (`subdomain`), or
  - (b) switching in place and rewriting the cookies.
  - Check how `1health-fe` does it (Q6). Also: with the default `revokeToken=true` the app's current token dies immediately.

---

## 4. Endpoint quick reference

| Tab | Method | Path (prefix `/api`) | Auth gate | Body / params | Returns |
|---|---|---|---|---|---|
| 1 | GET | `/v2/user/myself` | isAuthenticated | – | `UserDTO` (incl. mfaEnabled/totpEnabled, tenants) |
| 1 | GET | `/v2/user/contact-point/list` | Patient fn | `type[]` | `ContactPointResponseDTO[]` |
| 1 | PUT | `/v2/user/edit` | Patient fn | `PersonalInformationDTO` (partial) | 200 empty |
| 1 | POST | `/v2/user/time-zone` | isAuthenticated | `?timeZone=` IANA | 200 empty |
| 1 | POST | `/v2/user/locale` | isAuthenticated | `?locale=en-US` | 200 empty |
| 1 | PUT | `/v2/user/update-password` | isAuthenticated | `{password,newPassword,confirmNewPassword}` | 200 empty |
| 1 | POST | `/v2/mfa/enable` | Patient/Proctor fn | – | `{qrCode}` data URI |
| 1 | POST | `/v2/mfa/enable/totp` | Patient/Proctor fn | – | `{qrCode}` |
| 1 | POST | `/v2/mfa/validate` | Patient/Proctor fn | `?code=` | `boolean` |
| 1 | POST | `/v2/mfa/disable/totp` | Patient/Proctor fn | – | 200 empty |
| 1 | POST | `/v2/mfa/disable` | Patient/Proctor fn | – | 200 empty |
| 1 | GET | `/v2/public/countries` | public | – | `IdNameDTO[]` |
| 2 | GET | `/v2/public/npi/list` | public | `entityTypeCode,searchText,page,limit` | Page<`BaseNpiDTO`> |
| 2 | GET | `/v2/health/npi/{npi-id}/is-registered` | Patient fn | db id | `boolean` |
| 2 | GET | `/v2/user/npi` | Patient fn | – | `PersonWithNpiDTO` |
| 2 | POST | `/v2/user/register/npi` | Patient fn | `{providerNpiId, practiceNpiId?}` | 200 empty |
| 3 | GET | `/v2/user/organization/portal` | Patient fn | `name,page,size` | PageImpl<`OrganizationPortalResponseDTO`> |
| 3 | GET | `/v2/tenant/sys-config` | isAuthenticated | `Tenant IDs`, `includeAllRelations` | `SysTenantConfigResponseDTO[]` |
| 3 | GET | `/v2/user/switch-tenant/{tenantId}` | isAuthenticated | `revokeToken` (default true) | `{user, auth}` |

## 5. Risks and constraints (summary)
- **R1:** `PUT /v2/user/edit` rejects an `email` equal to *any* existing user's email, including the caller's own. Send it only when it changes.
- **R2:** two places store "locale". `/edit` writes the attribute, while `/locale` writes the column that `/myself` returns. Use `POST /v2/user/locale`.
- **R3:** password change fails for accounts without a password (federated login), and the UI has no way to detect them.
- **R4/R5:** NPI registration doesn't validate the NPI type, doesn't match names, can't be undone, and has no approval. The UI must constrain the type itself.
- **R6:** order within an org-list page is not guaranteed; sort on the client.
- **R7:** switch-tenant mints new tokens and by default revokes the current one. This conflicts with the app's cookie and LPL token model.
- MFA disable needs no re-authentication. There are no recovery codes and no manual-entry secret, and a wrong TOTP code returns 200 `false`.
- Roles: users without the Patient role in the current tenant (and not System Admin or MTA) get 403 on edit, contact points, MFA, NPI and the org list. `isAuthenticated()` endpoints still work for them.
- No audit trail for any of these actions.
- No option-list endpoints. There are no date-format or currency preferences; only `locale` and `timeZone` exist.

## 6. Open questions
- **Q1:** do "preferred locale (date/time/currency)" need separate stored preferences, or is the single `locale` (`en-US`) enough? Separate preferences mean new backend fields.
- **Q2:** expose a "has password" flag (for example on `/myself`) so the UI can hide the password change for SSO users?
- **Q3:** return the TOTP secret or `otpauth://` URI for manual entry? Add recovery codes? Require a password or TOTP to disable MFA?
- **Q4:** is self-service NPI registration without approval or name matching acceptable? Is unregister or change needed?
- **Q5:** do the org cards need capabilities (Lab, Insurance, Shipping, Store)? `organization.type[]` covers only org types; capabilities need a new field. How do the PRD's category names map to the backend enum values?
- **Q6:** for "Enter portal", hand off to the 1health portal (subdomain) or switch this app's token in place? With which `revokeToken` value?
- **Q7:** should the org list exclude `enabledInTenant=false` orgs, or show them disabled?
- **Q8:** does Personal Account Settings need its own "add/verify email/phone" UI, or does it link to the Personal Information card that owns contact points?
