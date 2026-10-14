# Research: 1health-fe "Profile" (Account Settings) screen

- Source repo: `../1health-fe` at commit `b44d7aedf`. Backend cross-checks are from `../1h-ng-bo-core-be`.
- Scope: the user-menu **Profile** screen at `/personal-settings`, which has three tabs: Personal Account, Individual Provider Registration, and My Organizations. This is **not** the Personal Profile screen at `/profile` (Contacts/Insurance/Medical).
- Paths below are relative to `1health-fe/src/` unless they say otherwise.
- `AS/` is short for `views/privatePages/AccountSettings/`.

---

## 0. Routing, entry points, gating

| Item | Detail | Ref |
|---|---|---|
| Route | `PrivateRoutes.PERSONAL_SETTINGS = "/personal-settings"` | `utils/appEnums/AppEnums.ts:127` |
| Route element | `<PrivateRoute activeTabName="Personal / Settings" forceDefaultContext>` → lazy `AccountSettingsManager`. It sets **no `roles`** and no `isPermitted`. | `route/AppRoute.tsx:45,1264-1276` |
| Old route | A commented-out `/account-settings` route (`roles=[Patient]`) | `route/AppRoute.tsx:1306-1320`, `AppEnums.ts:126` |
| `forceDefaultContext` | If the user is in an org tenant, PrivateRoute calls `switchContext()` back to tenant 1 (DEFAULT_TENANT_ID) before it renders | `route/PrivateRoute.tsx:142-154`, `config/app.config.ts:37` |
| Page guard | `AccountSettingsManager` returns `null` when `userReducer.tenant.id !== 1` | `AS/AccountSettingsManager.tsx:23-27` |
| Tabs | MUI `Tabs`, scrollable. The tab index comes from the `?tab=` query param through `useTabs`, which uses `useSearchParams`. The enum is `AccountSettingsTabs {PERSONAL_ACCOUNT=0, INDIVIDUAL_PROVIDER_REGISTRATION=1, MY_ORGANIZATIONS=2}`. Invalid, NaN, or out-of-range values fall back to tab 0, and clicking a tab updates the URL. | `AS/AccountSettingsManager.tsx:22,31-74`; `Hooks/useTabs.ts:47-57`; `AppEnums.ts:511-515` |
| Tab 0 content | `<PersonalAccountWrapper/>` + `<AuthenticationAppWrapper/>` (two cards) | `AS/AccountSettingsManager.tsx:65-68` |
| Tab 1 content | `<IndividualProviderRegistrationWrapper/>` | `:69-71` |
| Tab 2 content | lazy `<OrganizationListPage/>` | `:15,72-74` |
| User menu | Three items: "Profile" → `/personal-settings?tab=0`, "Provider registration" → `?tab=1`, "My organizations" → `?tab=2`. All use `navigate()`. Every user sees them; nothing gates them. | `components/AppHeaderV2/components/UserMenu.tsx:103-111` |
| Feature flags | **None** on this screen or its tabs | — |
| Tab i18n keys | `account-settings-manager.tab-label.personal-account` / `.individual-provider-registration` / `.my-organizations`; menu: `app-header-v2.menu.profile`, `sidebar-navigation.label-provider-registeration`, `sidebar-navigation.label-myorganizations` | |

All API calls go through the axios `V2` instance (`${API_BASE_URL}/v2`). In practice that is `<host>/api/v2/...`; the e2e fixture regexes match `/api/v2/...` (`e2e/fixtures/account-settings-data.ts:486-519`).
- Global error convention: when the server returns `response.data.message`, the global axios handler shows the toast. Components toast only when `!isHttpErrorMessageAvailable(error)` (`config/axios/Axios.ts:308-310`).

---

## 1. Tab "Personal Account"

### 1.1 Card "Personal Account Settings": data load
- `PersonalAccountWrapper` (`AS/Components/PersonalAccount/PersonalAccountWrapper.tsx`).
- On mount, and again after each save, it calls `GET /v2/user/contact-point/list?type=Email&type=Mobile&type=Landline` (`:85-110`; API at `config/axios/apis/user/user.ts:85-87`). The BE returns `List<ContactPointResponseDTO>` (`UserResource.java:480-487`).
  - `splitContactPoints` keeps **only `isVerified` contact points**. Emails become email options and everything else (Mobile and Landline) becomes phone options. Each option is `{id, label: value}` (`PersonalAccountUtils.ts:48-66`).
  - The rest of the form values come from the Redux user (the `/v2/user/myself` payload), not from this call: `mapStoreUserToFormValues` (`PersonalAccountUtils.ts:101-137`).
    - If the current `user.email` or `user.phoneNumber` is not among the verified options, it is appended with `id=-1` (`addIfNotThere`).
    - `"n/a"` (BO_CORE_DEFAULT_VALUE) maps to empty or null.
    - Time zone label comes from the fixed TZ list. Language label comes from `LOCALE_DETAILS[preferredLanguage]`. Locale label is always the constant "English - United States".
    - Birth date is shown only when it passes the age check. Otherwise view mode shows `null` / "Unknown".
- Load error toast: `profile.error.loading-information` "Something went wrong while loading profile information" (`:108-110`).

### 1.2 Header actions (view ↔ edit)
- `MenuActionButtons` = `components/ProfileCard/components/ActionButtonsContactPoint/ActionButtonsContactPoint.tsx`.
  - View mode shows **Edit**.
  - Edit mode shows **Cancel** (Close icon) and **Save** (Save icon).
- In edit mode, Save submits only if the form is dirty (`PersonalAccountWrapper.tsx:65-75`). Otherwise it shows the warning toast `label.no-changes` "There are no changes!".
- Cancel calls `reset(defaultFormValues)` and leaves edit mode (`:77-80`).
- The Edit button has **no permission gating**.

### 1.3 Fields

The yup schema is in `AS/AccountSettingsForms.ts:28-103`. RHF runs with `mode:"onBlur"`, `reValidateMode:"onBlur"`, `criteriaMode:"all"` (`PersonalAccountWrapper.tsx:36-42`).

| Field | View (`PersonalAccountView.tsx`) | Edit control (`PersonalAccountUpdateForm.tsx`) | Required / validation | Wire field |
|---|---|---|---|---|
| First Name | `:29-34` | TextField, required (`:99-124`) | required "First Name cannot be empty"; max 24 chars after trim: "First name can be up to 24 symbols long" (`Forms.ts:29-38`). Error id `error.first-name-field-{type}` | `firstName` |
| Last Name | `:35-40` | TextField, required (`:125-150`) | required "Last Name cannot be empty"; max 24 (`:39-48`) | `lastName` |
| Username | `:41-47` | TextField **disabled** (`:155-175`) | required (schema only) | never sent (BE DTO marks it READ_ONLY) |
| Password | `********` (`:48-53`) | TextField **disabled**, defaultValue `**********` (`:176-190`) | — | **No password change on this screen.** There is no modal and no old/new/confirm fields. The only password flows in the app are the public forgot/reset pages (`POST /v2/public/reset-password` and `POST /v2/public/user/{id}/verify-password-update/{code}`), in `views/publicPages/ForgotPassword`, `UpdatePassword`, and `config/axios/apis/auth/auth.ts:94`, `user.ts:48-50`. |
| Primary Email Address | `primaryEmail.label` (`:54-59`) | Autocomplete over the **verified emails** (`:195-255`). No clear icon. **Disabled when there is only one option.** In that case the helper text reads "Please add additional verified email(s) in your [personal profile] to change your current primary contact email" and the link goes to `/profile?tab=0` (`:37-49,248`). | required, regex `VALID_EMAIL_REGEX` → "Invalid email address" (`Forms.ts:50-60`) | `email` = option label |
| Primary Phone Number | `:60-65` | Same pattern over verified Mobile and Landline numbers (`:256-316`). Helper: `account-settings.add-additional-verified-phones` (`:51-63,309`) | not null: "Primary cannot be empty" (`Forms.ts:61`). The UI error text is a static "Invalid phone number". | `phoneNumber` = option label |
| Birth Date | Formatted date, or "Unknown" when the age check fails (`:21-25,66-71`; `PersonalAccountUtils.ts:94-99`) | `DesktopDatePickerEnhanced` with a `GenericTextFieldSlot` text field (`:322-362`). minDate = today−120y. maxDate and the reference date = today−18y (Patient) or today−21y (Proctor) (`:82-93`). | not null: "Birth Date cannot be empty". Valid date: "Invalid date format. The date format should be MM/DD/YYYY". Proctor must be 21–120: "...between 21 and 120 years old." Patient must be 18–120: "...between 18 and 120 years old.." (`Forms.ts:73-95`). Constants: `validators/validatorConstants.ts:66-68`. | `birthDate` formatted `YYYY-MM-DD` (`DatesFormat.defaultFormat`) |
| Birth Date "?" tooltip | — | A `HelpSharp` "?" icon from `TooltipWrapper` wraps the date field, **edit mode only**. Text (`tooltips.common.dob`): *"Your date of birth is an important identifying factor throughout the healthcare industry. Additionally, 1health requires all users to be over the age of 18."* (`components/Common/GenericTextFieldSlot/GenericTextFieldSlot.tsx:9-22`) | | |
| Preferred Language | `preferredLanguage.label` (`:72-77`) | Autocomplete (`:363-413`). Options come from `getLocales()` = `moment.locales()` mapped through `getLocaleNameByTag` (`PersonalAccountWrapper.tsx:92-96`; `utils/DateTimeUtils.ts:243-245`; `utils/AppUtils.ts:155-158`). The app imports no moment locales, so in practice there is **one option: `en` → "English"**. The constant `PREFERRED_LANGUAGES_OPTIONS` (`Forms.ts:21-26`) is unused here. | not null: "Preferred Language cannot be empty" | `preferredLanguage` = value |
| Default Time Zone | label (`:78-83`) | Autocomplete over the hardcoded `PERSONAL_ACCOUNT_TIME_ZONE_OPTIONS` (`Forms.ts:10-17`): Hawaiian (Pacific/Honolulu), Alaska (America/Anchorage), Pacific (America/Los_Angeles), Mountain (America/Denver), Central (America/Chicago), Eastern (America/New_York) | not null: "Default Time Zone cannot be empty" | **separate call**, see below |
| Preferred locale for date, time, and currency | label (`:84-89`) | Autocomplete over the hardcoded `[{label:"English - United States", value:"en-us"}]` (`Forms.ts:19`) | not null | `locale` = value |

Primary-change warnings appear in edit mode (`PersonalAccountUpdateForm.tsx:208-219,269-280`):
- Email: `profile.primary-contact.email-text`: *"Changing your primary email will result in updating your login credentials. The next time you login you will have to use the new email."*
- Phone: `profile.primary-contact.phone-text-warning`: *"Changing your primary phone will result in updating your notification preferences..."*
- Quirk: the warning checks the stale `dirtyFields` prop, so it fires only on the **second** change, not the first.

### 1.4 Save flow (`PersonalAccountWrapper.tsx:44-63`)
1. `createFormData` builds a payload from **dirty fields only** (`PersonalAccountUtils.ts:68-92`):
   - `{firstName?, lastName?, birthDate?(YYYY-MM-DD), phoneNumber?, email?, preferredLanguage?, locale?}`
2. If the payload is non-empty: `PUT /v2/user/edit` with it (`user.ts:44-46`). On the BE this is `PersonalInformationDTO`, which returns `void` (`UserResource.java:282-286`; DTO `dto/PersonalInformationDTO.java`).
3. If the time zone is dirty: `POST /v2/user/time-zone?timeZone=<IANA>` with an empty body (`user.ts:40-42`; `UserResource.java:426-433`).
4. Success toast `account-settings.personal-account-updated`: "Personal account updated successfully". Leave edit mode.
5. `mySelfRequest({locale})` → `GET /v2/user/myself` refreshes Redux (`utils/AuthUtils/AuthUtils.ts:78,371-379`). Then the contact points are re-fetched.
6. Error: the BE message or the generic error is toasted, and the form stays in edit mode.
- Note: the two calls are not atomic. If the edit succeeds and the time-zone call fails, the result is a partial save. A BE `POST /v2/user/locale` exists but the FE doesn't use it; locale goes through `/user/edit`.

### 1.5 Card "Enable authenticator app for MFA"
Files: `views/privatePages/PersonalAccountSettings/components/AuthenticationAppWrapper.tsx`, `AuthAppSetupModal.tsx`.

- State comes from Redux `user.mfaEnabled` and `user.totpEnabled` (`Wrapper:35-36`).
- Title: `account-settings-manager.authentication-app-section-title` (`:119-122`).
  - When `mfaEnabled && totpEnabled`, a green `CompleteCheck` icon shows next to the title (`:124`).
  - The card header action then shows a **"Disable"** text button with an Edit icon (`:127-134`).
- Five tiles (`TileComponent`, a 100×100 white logo chip; `components/Common/Tile/TileComponent.tsx`): Google, Microsoft, Authy, DUO, Android OTP. Logos are in `assets/mfaAppsLogos/*.png` (`Wrapper:22-28,136-172`).
  - **The app choice is cosmetic.** Every tile triggers the same generic TOTP enrolment. The name only fills the modal and toast text.
  - The tile's per-app `tick` prop is never set, and no per-app enrolment status exists.
- Clicking a tile (`:39-55`):
  - If TOTP is already enabled, the click does nothing (no feedback).
  - Otherwise it calls `POST /v2/mfa/enable/totp` with no body (`config/axios/apis/auth/auth.ts:30-32`; BE `MfaResource.java:67`). The response `{ qrCode: "data:image/png;base64,..." }` opens the modal.
  - Error: toast. The modal does not open.
- Modal "Link your {app} authenticator" (`AuthAppSetupModal.tsx:75-146`):
  - Info alert: *"Use the {app} authenticator app installed on your device to scan this QR, then provide the code generated by the app in the field below."*
  - A QR `<img>` at 11.375rem.
  - A 6-digit numeric OTP input (`components/OtpInput/CustomOtpInput.tsx`, `numInputs=6`).
  - Buttons: Cancel and Submit.
  - It shows no manual secret key (only the QR).
  - Submit (`:38-67`):
    - Fewer than 6 digits: toast "Please enter the code".
    - Otherwise it calls `POST /v2/mfa/validate?code=<otp>` with a null body (`auth.ts:26-28`; BE `MfaResource.java:97`), which returns a **boolean**.
    - `true`: toast "{app} Authenticator is linked successfully", then the modal closes.
    - `false`: toast "Invalid Code. Try again." The OTP clears and the modal stays open.
  - Close or Cancel triggers `getPersonData()` (`GET /v2/user/myself`), which refreshes `mfaEnabled` and `totpEnabled` (`Wrapper:57-71,100-103`).
- Disable (`:73-88`): `POST /v2/mfa/disable/totp` (`auth.ts:34-36`; BE `MfaResource.java:73`).
  - There is **no confirmation dialog and no OTP re-check**.
  - 200: toast "Successfully disabled", then myself is refreshed.
- No permission gating.

---

## 2. Tab "Individual Provider Registration"

Files are in `AS/Components/IndividualProviderRegistration/`.

### 2.1 Load and state machine (`IndividualProviderRegistrationWrapper.tsx`)
- `GET /v2/user/npi` (`user.ts:7-9`; BE `UserResource.java:450-454` → `PersonWithNpiDTO`). It runs in a `useLayoutEffect` keyed on `hasUserNpiNumberRelated`, so it re-fetches after a registration.
- While loading the component renders **`null`**: no skeleton or spinner (`:87-89`). Error: toast.
- `mapNpiResponseToUserNpiData` (`IndividualProviderRegistrationWrapperUtils.ts:4-22`):
  - If `providerNpi` is absent, the state is **unregistered**. Otherwise it maps:
    - `npi ← providerNpi.npi`
    - `taxonomy ← providerNpi.taxonomy.name`
    - `providerLicenseNumber1 ← providerNpi.providerLicenseNumber`
    - `personalAddress1/2 ← providerNpi.providerFirst/SecondLineBusinessPracticeLocationAddress`
    - `organizationNpi ← practiceNpi.npi`
    - `organizationName ← practiceNpi.providerOrganizationName`
    - `organizationAddress ← practiceNpi.providerFirstLineBusinessPracticeLocationAddress`
    - `tenantId ← practiceNpi.organization.tenantId`
    - `isVerified ← practiceNpi.verified`
    - `email ← hieEndpoint.endpoint`
- Signature: when `user.signature.id` exists it is downloaded (`downloadFileById`) into an object URL. Error: toast, then a fallback (`:41-64`).
- There are two branches:
  - **Unregistered**: the card "Healthcare credentials", an `InfoIcon` in the header action, and the registration form (`:94-104`).
  - **Registered**: the same title with **no info icon**, plus a read-only view. Edit mode is hardcoded off (`inEditModeIndividualProviderRegistration = false`, `:22`), so `IndividualProviderRegistrationUpdateForm.tsx` is dead code (`:105-123`).

### 2.2 Info (i) icon
- `action={<InfoIcon sx={{color:"ink.soft"}}/>}` (`Wrapper:96`). It is purely decorative: **no tooltip, popover, or click handler**.

### 2.3 Registration form (`IndividualProviderRegistration.tsx`)
- Instruction text: `account-settings.find-and-register-npi`, "Please find your provider and NPI information to continue..." (`:199-201`).
- **Personal NPI**: `GenericAutocomplete`, `required` (`:203-228`).
  - Label and placeholder: "Search for your personal NPI number".
  - The required asterisk comes from MUI `required`.
- **Practice NPI**: the same component, **optional** (`error={false}` is hardcoded and there is no validation) (`:229-261`).
  - Label: "Search for your practice's (hospital, clinic, lab, etc.) NPI Number".
- Typeahead backend: `GET /v2/public/npi/list?entityTypeCode={1|2}&limit=&page=&searchText=`, sent `withCredentials:false` (`config/axios/apis/miscellaneous/miscellaneous.ts:15-31`).
  - Entity type 1 is individuals and type 2 is organizations (`IndividualProviderRegistration.tsx:129-147`).
  - This is the 1health server-side NPI registry (NPPES-derived data), not a direct NPPES call.
  - Response: `{data:[...], totalElements, numberOfElements, pageNumber, pageSize,...}`.
  - Failures resolve to an empty list without a toast.
- `GenericAutocomplete` behaviour (`components/GenericAutocomplete/GenericAutocomplete.tsx`):
  - Page size defaults to **10** (`:254`), starting at page 0 (`:105`).
  - Typing debounce defaults to **600 ms** (`:255,651-656,684-692`).
  - **No minimum character count.** Opening the dropdown with empty text already fetches the first page (`:658-669`).
  - Infinite scroll pages more in as you scroll (`:107-110,582-636`).
- Option labels (`components/Common/GenericNPISelect/GenericNPISelectUtils.tsx:3-38`):
  - Person: `"<npi>, <First> <Last>, <City>, <State>"`
  - Org: `"<npi>, <OrgName>, <MailingAddressLine1>, <City>, <State>"`
- Validation (`IndividualProviderRegistrationUtils.ts:18-48`): the only rule is that the personal NPI is required. On blur or submit, the error text is "Personal Npi field is required field".
- Register button "Register" (`label.register`), merigold background (`:262-279`). The flow (`:84-118,170-191`):
  1. Personal only: `GET /v2/health/npi/{personalNpiRecordId}/is-registered` returns a boolean (`miscellaneous.ts:53-55`).
     - If true: warning "Npi is already registered try to look again your own".
     - Else: `POST /v2/user/register/npi {providerNpiId}`. Success: "Provider Npi is successfully registered".
  2. With a practice: `is-registered` is checked for **both** IDs. If either is already registered, the matching warning(s) show and nothing is sent. Practice warning: "The practice Npi is already registered try to look again".
     - Else: `POST /v2/user/register/npi {providerNpiId, practiceNpiId}`. Success: "Your Provider Npi and Practice NPi are registered successfully!"
  3. The IDs are the NPI **record ids** (`option.id`), not the 10-digit NPI. BE: `RegisterNpiDTO {Long providerNpiId; Long practiceNpiId}` → `personService.registerNpi` (`UserResource.java:444-448`).
  4. On success `npiRegistered()` flips the state, which re-fetches `/user/npi` and shows the registered view. **There is no pending state and no org creation** here.
  5. Any exception shows the toast `message.call-for-assistance`: "There is error in the registration. Please call 1-888-555-1212 for assistance."

### 2.4 Registered view (`IndividualProviderRegistrationView.tsx`)
- Fields: NPI, Taxonomy, Health Information Exchange (`hieEndpoint`), Practice Name, the practice address, "NPI:<orgNpi>", Licenses, "Address of practice" (personal lines 1–2), and Signature (`:55-150`).
  - `"n/a"` and `-1` render as blank.
- **Practice Name** is wrapped in `TenantInfoPopover` when `tenantId` is known. Hovering it calls `GET /v2/tenant/sys-config?Tenant%20IDs=<id>&includeAllRelations=true` and shows the tenant's support or customer-service info (`components/TenantInfoPopover/TenantInfoPopover.tsx:103-126`; `config/axios/apis/tenant/tenant.ts:21-24`).
- If the practice org's tenant is **not** in `user.tenants`, the view shows *"This organization already exists - please contact their support to be added to their portal."* (`:94-103`)
- **Signature** has a "?" tooltip: "The signature can be changed from the Personal Profile" (`:128-143`). With no signature it shows "No signature available!".
- **"Register your practice to enable ordering"** button. Before showing it, the view looks up the practice NPI record id with `GET public/npi/list?entityTypeCode=2&limit=10&page=0&searchText=<orgNpi>` and then calls `GET health/npi/{id}/is-registered` (`:28-50`).
  - It shows when `isVerified && organizationNpi && is-registered === false`.
  - It navigates to `/organizations/create` (`:160-177`; `AppEnums.ts:168`).
- No edit button in this state.
- `IndividualProviderRegistrationQueries.ts` (a `PersonHasRegistrationWithNpi` query) is **unused**.

---

## 3. Tab "My Organizations"

Files are in `AS/Components/MyOrganizations/`.

### 3.1 List page (`OrganizationListPage.tsx`)
- `tenants` count = `user.tenants.length`, forced to 2 for MTA users (`:68-74`).
  - **If the count is ≤ 1, no API call is made** and the empty state renders (the default tenant counts as one).
- API: `GET /v2/user/organization/portal?page=<0-based>&size=12&name=<search>` (`user.ts:52-67`; BE `UserResource.java:214-222`). The BE default size is 50, so the FE sends `ITEMS_PER_PAGE = 12` (`:54`).
  - Response: Spring `PageImpl<OrganizationPortalResponseDTO>` → `{data: SysTenantConfiguration[], totalElements, totalPages, ...}`.
  - The FE keeps only `data.filter(e => e.organization)` (`:93-104`).
  - Shape: `utils/appInterfaces/AppInterfaces.ts:467-488`; example in `e2e/fixtures/account-settings-data.ts:340-412`.
- **Search is server-side.**
  - TextField placeholder "Search organizations", decorative search icon.
  - 500 ms debounce, value lowercased and trimmed, sent as `name`. Each search resets to page 1 (`:126-129,146-165`).
- **"Create new organization"** CTA appears next to search only for users whose email ends with `@1health.io` or `@tachin.ai` (`:56-60,82,166-170`). It navigates to `/organizations/create` with the previous path in state (`:131-133`).
- Pagination: MUI `Pagination`, `count = ceil(totalElements/12)`, `boundaryCount=1`. It shows only when there are results (`:265-281`).
- States:
  - **Loading**: `PropagateLoader` (react-spinners), 10rem tall (`:283-286`).
  - **No orgs** (tenants ≤ 1): card "You aren't managing any organizations yet" / "Register an organization with 1health to unlock the platform features listed below", followed by four feature rows (`:23-52,176-234`):
    - Lab: Science icon, "Add your tests offered and enable order management."
    - Healthcare: HealthAndSafety icon, "Order tests, get results, and manage your patients."
    - Supplier: LocalShipping icon, "Provide fulfillment and logistics for collection devices."
    - Go To Market: Storefront icon, "Create and sell test products."
    - Then a "Register organization" button. Internal domains go to `/organizations/create`; everyone else opens `https://learnmore.1health.io/product-checkout` in a new tab.
  - **No search results**: "Sorry, no results were found" (`:250-256`).
  - **Error**: toast, empty list, no pages (`:107-117`).

### 3.2 Org card (`Components/OrganizationCard/OrganizationCard.tsx`)
- Fixed size 18.75rem × 18.75rem. The current tenant gets a flat, silver background (`:54-76`). This never happens here in practice, because `forceDefaultContext` keeps you in tenant 1.
- **Logo**: `CardMedia` with background `contain`, 120px tall, from `tenantLogo.publicUrl`. No dark-logo variant and no fallback when it is null (`:111`).
- **Info (i)** in the header: hover or click opens a Popover (pointer-events none) titled "Primary contact" (`:113-185`).
  - It shows the contact with `contactTypes` containing `"Primary"`: full name (with middle name unless it is "n/a"), phone, and email (`OrganizationCardUtils.ts:6-12`).
  - With no such contact it shows "-".
  - Data comes from `organization.personContacts` in the same list payload. No extra call.
- **Name**: `shortOrganizationName`, 20px/900. Single line with ellipsis at 80% width, and a Tooltip shows the full name (`:78-86,187-191`).
- **Type icons**: `organization.type` (string[]) is sorted alphabetically with `toSorted()` and **all** of them render. There is **no "+N" overflow logic** in the current code (`:193-204`). Each icon has a Tooltip and an aria-label. The map is in `:22-48`:

  | `OrganizationRole` value | Icon (MUI) | Tooltip |
  |---|---|---|
  | `"Health Provider"` | HealthAndSafety | Healthcare |
  | `"Lab"` | Science | Lab |
  | `"Supplier"` | LocalShipping | Supplier |
  | `"Go To Market"` | Storefront | Go To Market |
  | `"n/a"` | Info | No types selected for this organization |
  | `"Population Health"` (exists in enum `AppEnums.ts:397-403`) | **not mapped**. `iconSelector[type].id` would throw. | — |

- **"Enter portal"** button (CTA, small). It is disabled when `!enabledInTenant` or when this is the current tenant (`:206-210`). It calls `useTenantSwitching(tenantId, "/").switchContext` (`Hooks/useTenantSwitching.tsx:29-97`):
  - MTA user: `GET /v2/user/switch-tenant/{id}`, then clear the active tokens and navigate to `/`.
  - Everyone else, using the per-tenant token store:
    - If the cached access token for the target tenant is valid, set the active tenant and stop there.
    - Else, if the refresh token is valid, `POST <auth>/oauth2/token grant_type=refresh_token`. If the new token's tenant claim doesn't match, fall back to the switch-tenant API.
    - Else call `GET /v2/user/switch-tenant/{id}?revokeToken=false`. It returns `{auth:{access_token,refresh_token,expires_in,...}, user}` and the tokens are stored (`config/axios/apis/tenant/tenant.ts:55-72`).
  - Then it clears the Redux user and tenant plus the react-query cache, and navigates to `/` (the org portal home in that tenant context).
  - On any failure: `GET /v2/user/switch-tenant/1` ("logOut" back to the default tenant), then navigate to `/`.
  - BE: `UserResource.java:56` (`@PreAuthorize("isAuthenticated()")`).

---

## 4. Endpoint table

| # | Method | Path (`<host>/api/v2/...`) | Used by | Request | Response / mapping | FE ref |
|---|---|---|---|---|---|---|
| 1 | GET | `user/myself` | user hydrate; refresh after save, MFA | — | AuthUserData (firstName, lastName, username, email, phoneNumber, birthDate, timeZone, preferredLanguage, locale, roles, tenants, tenantContext, mfaEnabled, totpEnabled, signature, isMta) | `utils/AuthUtils/AuthUtils.ts:78,371` |
| 2 | GET | `user/contact-point/list?type=Email&type=Mobile&type=Landline` | email/phone options | — | `[{id,type,value,isVerified,label,name,isNotificationEnabled}]`, filtered to verified | `user.ts:85` |
| 3 | PUT | `user/edit` | save Personal Account | dirty subset of `{firstName,lastName,email,phoneNumber,birthDate(YYYY-MM-DD),preferredLanguage,locale}` | void | `user.ts:44` |
| 4 | POST | `user/time-zone?timeZone=<IANA>` | save TZ | empty | void | `user.ts:40` |
| 5 | POST | `mfa/enable/totp` | MFA tile click | — | `{qrCode: dataURI}` | `auth/auth.ts:30` |
| 6 | POST | `mfa/validate?code=<6 digits>` | MFA modal submit | — | `boolean` | `auth/auth.ts:26` |
| 7 | POST | `mfa/disable/totp` | MFA Disable | — | 200 void | `auth/auth.ts:34` |
| 8 | GET | `user/npi` | IPR load | — | `{providerNpi?, practiceNpi?, hieEndpoint?}` (mapping in §2.1) | `user.ts:7` |
| 9 | GET | `public/npi/list?entityTypeCode=1\|2&limit=10&page=&searchText=` | NPI typeaheads; practice id lookup | — (no credentials) | `{data:[{id,npi,providerFirstName,providerLastName,providerOrganizationName,providerFirstLineBusinessMailingAddress,providerBusinessMailingAddressCityName,...StateName}], totalElements, numberOfElements}` | `miscellaneous.ts:15` |
| 10 | GET | `health/npi/{npiRecordId}/is-registered` | pre-register check; registered-view CTA | — | `boolean` | `miscellaneous.ts:53` |
| 11 | POST | `user/register/npi` | Register | `{providerNpiId, practiceNpiId?}` (record ids) | 200 void | `user.ts:19` |
| 12 | GET | `file/{id}/download` | signature image | — | blob | `apis/bocore/bocore` `downloadFileById` |
| 13 | GET | `tenant/sys-config?Tenant%20IDs=<id>&includeAllRelations=true` | Practice Name hover popover | — | SysTenantConfiguration[] | `tenant/tenant.ts:21` |
| 14 | GET | `user/organization/portal?page=&size=12&name=` | My Orgs list | — | Page of SysTenantConfiguration (`data`, `totalElements`) | `user.ts:52` |
| 15 | GET | `user/switch-tenant/{tenantId}?revokeToken=false` | Enter portal | — | `{auth:{access_token,refresh_token,expires_in,...}, user}` | `tenant/tenant.ts:55` |
| 16 | POST | `<OAUTH_BASE>/auth/oauth2/token` (x-www-form-urlencoded refresh) | Enter portal with a cached refresh token | grant_type=refresh_token | tokens | `auth/auth.ts:50` |

---

## 5. Permissions / roles summary
- The whole screen requires authentication only. There is no `roles` or permission gating on the route, the tabs, or the buttons.
- It is forced into the default tenant (1).
- Role-dependent behaviour:
  - **Proctor** role: the birth-date minimum age is 21 instead of 18 (Patient).
  - **MTA**: always treated as having more than one org; tenant switching takes a different path.
  - **Internal email domain** (`@1health.io`, `@tachin.ai`): sees "Create new organization" and gets the in-app create route.
- BE: switch-tenant and time-zone are `isAuthenticated()`. `/edit`, `/npi`, `/register/npi`, and `/organization/portal` have no explicit `@PreAuthorize` in `UserResource`, so they inherit the default authenticated filter.

## 6. Notable quirks / bugs to decide on for the rebuild
1. **There is no password change UI.** The field is masked and disabled.
2. The primary-email/phone warning toast fires only on the second change (stale `dirtyFields`).
3. The Preferred Language options effectively contain only `en` ("English"). A stored value like `en-us` shows as "English - United States" and doesn't match any option.
4. The locale and time-zone lists are hardcoded: one locale and six US time zones.
5. The Save path makes two non-atomic calls (edit, then time-zone).
6. Validation messages contain typos and duplicate periods ("..between 18 and 120 years old..", "Personal Npi field is required field").
7. The phone validation message says "Invalid phone number" even when the field is empty.
8. MFA: the app tile choice is cosmetic. Clicking while TOTP is enabled does nothing. Disable has no confirmation. Each tile click calls `enable/totp`, which presumably rotates the secret.
9. IPR: the info icon has no content. The loading state renders nothing. The edit form is dead code.
10. My Orgs: no "+N" overflow. `Population Health` is unmapped and would crash. An org card with a null logo shows an empty area. The empty-state rule depends on the `user.tenants` count, not on the API.

## 7. i18n
- Strings come from `react-intl` `FormattedMessage` with inline `defaultMessage`. The catalog is `public/lang/en.json`.
- The en.json values checked match the default messages. Keys are cited inline above.
