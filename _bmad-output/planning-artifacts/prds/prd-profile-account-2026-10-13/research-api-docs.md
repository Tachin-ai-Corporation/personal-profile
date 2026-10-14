# Research extract: API docs for the Profile / Account module (2026-10-13)

Scope: Personal Account (password change, MFA authenticator-app/TOTP), Individual Provider Registration (NPI lookup + Register), My Organizations (list/search/paginate + "Enter portal").
Extends `../prd-personal-profile-2026-10-13/research-api-docs.md` (profile read/edit, contact points, addresses, avatar, insurance). Those items are not repeated here.

Sources consulted:
- Live agents.md for dev, demo, and prod (`https://agents.1health.io/public/{env}/api/…`): the site guide, manifest, llms.txt, the auth quickstart, and about 35 per-route files in each environment. Dev source_version is `fd2badc`, generated 2026-10-13. Prod source_version is `9a73422`.
- Local `ai-agents-knowledge` (same tree plus `how-to.md`/`example.md`; these are thin and add nothing beyond agents.md).
- `1h-api-mcp-py/data/api-docs` and the live MCP server `https://mcp.dev.1hdev.io/mcp`.
- Cross-checked against `1h-ng-bo-core-be` source (the source of truth) and against `1health-fe` call sites.
- `1h-app-api-docs` and `mcp-generic` had no hits for these topics.

---

## 1. Can an external-app (LPL) token call these? Yes, with the same rights as the user

The LPL exchange is `POST /v2/public/external-application/auth/oauth2/user/token` (`ExternalAppOAuth2UserTokenIssuer`). It mints a normal user token for the launching user and tenant:
- It uses the shared public client, the same one the portal uses.
- The token carries one extra claim, `externalApplicationId`.

In bo-core, that claim is used only for:
- audit and trace logging,
- custom-data app scoping,
- binding API keys created through the app,
- bulk revocation when the app's access is removed.

No endpoint gating keys off this claim. There is no scope restriction either: the `scope` field is the standard one.

Endpoint authorization for this token is therefore the same as for a portal session (`PolicyEnforcerHandlerInterceptor` → `PolicyEnforcer`):
1. **Public routes** (`SecurityConfig.PUBLIC_RESOURCE_PATTERNS`, which includes `/v2/public/**` and `/v2/user/myself`) need no permission check.
2. **"Allowed by default" routes** are those with a method- or class-level `@PreAuthorize("isAuthenticated()")` or `permitAll()`. Any authenticated user can call them.
3. **All other routes** need an AC role whose functionality lists the endpoint. The seed for this is `bo-core/src/main/resources/access-control.json`. The live DB can differ per environment or tenant.

| Gate | Routes in this module |
|---|---|
| Public | `GET /v2/user/myself`, `GET /v2/public/npi/list`, `GET /v2/mfa/config`, `POST /v2/mfa/send-code` |
| Any authenticated user | `PUT /v2/user/update-password`, `GET /v2/user/switch-tenant/{tenantId}`, `POST /v2/user/time-zone`, `POST /v2/user/locale`, `GET /v2/user/roles` |
| **"Patient functionality"** (Patient AC role) | `POST /v2/mfa/enable`, `/disable`, `/enable/totp`, `/disable/totp`, `/validate`; `GET /v2/user/npi`; `POST /v2/user/register/npi`; `GET /v2/health/npi/{npi-id}/is-registered`; `GET /v2/user/organization/portal`; `PUT /v2/user/edit`; `GET /v2/user/contact-point/list`; `GET /v3/user-management/my-requests` |
| "Proctor functionality" (Proctor role) | the MFA routes above; `GET /v2/tenant/search` |
| Everything / System Admin / MTA | bypass the policy check |

Notes on the table:
- System Admin and MTA users skip the policy enforcer entirely.
- A user whose roles in the *launch tenant* lack Patient functionality (for example, a staff-only role set) gets a **403** from the NPI, org-list, and MFA routes. That user can still change their password.
- This needs a check per environment and tenant (see §6).
- `GET /v2/token/context/api-access` is documented as "restricted to third-party API key callers". It **cannot** be used to introspect an interactive or LPL user token.

The auth quickstart (`/authentication/agents.md`) covers the authorization_code+PKCE, refresh, and client_credentials grants. It is marked `[NEEDS SECURITY REVIEW]` throughout and does **not** mention the external-application LPL flow at all. The per-route "Authorization" lines (Bearer vs. public) are accurate for this module's routes.

---

## 2. Endpoint table

Base: `<base>/api`. All of these routes appear in the dev, demo, and prod manifests (see §4).

### Personal Account: password

| Op | Method & path | Body / params | Response | Notes |
|---|---|---|---|---|
| Change own password | `PUT /v2/user/update-password` | `UpdateUserPasswordDTO {password, newPassword, confirmNewPassword}` | 200, empty | `password` is the **current** password and is verified (bad value → "The provided credentials are incorrect."). New password needs ≥ **12** chars (`MIN_PASSWORD_LENGTH`), must equal the confirmation, and must not match any of the **last 5** passwords. Errors are ValidationException/BadRequest (envelope undocumented). |
| (n/a) Admin set / reset email | `POST /v2/user/{userId}/set-password` (MTA), `POST /v2/user/{userId}/send-update-password`, `POST /v2/public/reset-password` | | | Not for self-service in-app change. |

Things that differ from the docs:
- agents.md for **dev** marks all three password fields "Required: No". **Demo and prod** mark them "Yes". Backend asserts all three are present.
- The MCP doc `v2-user-update-password-put.md` is **wrong**: it shows `{currentPassword, newPassword}` and an 8-character minimum. Do not use it.
- 1health-fe never calls this route. Its Personal Account card shows the password as a read-only `********`. Password change is therefore **new UI** in this app.

### Personal Account: MFA authenticator app (TOTP)

| Op | Method & path | Params | Response | Backend state rules |
|---|---|---|---|---|
| Read status | `GET /v2/user/myself` | (none) | runtime `UserDTO` includes `mfaEnabled`, `totpEnabled` (plus `tenants[]`, `tenantContext`, `acceptedTerms`) | **agents.md omits these fields.** The OneHealthUserDTO table is incomplete. 1health-fe reads `mfaEnabled`/`totpEnabled` from myself. |
| Enable MFA (master switch) | `POST /v2/mfa/enable` | (none) | `QrCodeDTO {qrCode}` | Fails "Mfa already enabled." if already on. Creates a fresh MFA config. 1health-fe never calls it; it assumes `mfaEnabled` is already true. |
| Start TOTP enrollment | `POST /v2/mfa/enable/totp` | (none) | `QrCodeDTO {qrCode}` | Requires an MFA config, `mfaEnabled=true`, and `totpEnabled=false`. Otherwise it throws `IllegalStateException` (likely surfaces as 500). It generates a new secret on each call. |
| Confirm code | `POST /v2/mfa/validate?code=123456` | `code` query param, no body | `true` or `false` | `false` means wrong code. Already validated → "Totp is already validated." |
| Remove authenticator | `POST /v2/mfa/disable/totp` | (none) | 200 | Fails "Totp is already disabled." |
| Disable MFA entirely | `POST /v2/mfa/disable` | (none) | 200 | |
| Login-time only (do not use) | `GET /v2/mfa/config?code=`, `POST /v2/mfa/send-code?code=&contactPointId=`, `GET /auth/mfa/code` | login `code` | | These are public and pre-token, taking the login `code`. They cannot read the logged-in user's MFA status. |

`qrCode` format:
- It is a **`data:image/png;base64,…` data URI** (`Utils.getDataUriForImage`). The encoded content is an otpauth URI with issuer `1health`, label = user email, SHA1, 6 digits, 30-second period.
- Render it directly with `<img src>`.
- The **raw secret is not returned**, so a "can't scan? enter this key" fallback is impossible without a backend change.
- The MCP doc says `qrCode` is an `otpauth://` string. That is **wrong**.

Admin variants (`/v2/mfa/enable/{userId}`, `/disable/{userId}`, `GET /v2/mfa/validate/{userId}`) are MTA-only and out of scope.

### Individual Provider Registration (NPI)

| Op | Method & path | Params / body | Response |
|---|---|---|---|
| Current registration | `GET /v2/user/npi` | (none) | `PersonWithNpiDTO {providerNpi, practiceNpi, hieEndpoint}`, each nullable |
| Lookup (typeahead) | `GET /v2/public/npi/list` | `entityTypeCode` (1 = individual/personal, 2 = organization/practice; default 1), `searchText`, `page` (0-based), `limit` (default 10) | `Page {data: BaseNpiDTO[] {id, name, npiNumber}, totalElements, totalPages, …}` |
| Already taken? | `GET /v2/health/npi/{npi-id}/is-registered` | `npi-id` is the **NPI record id** (`BaseNpiDTO.id`), *not* the 10-digit number | `true` / `false`; 400 if no such record |
| Register | `POST /v2/user/register/npi` | `RegisterNpiDTO {providerNpiId (required in practice), practiceNpiId?}`, both **record ids** | 200, empty |
| (Not used) | `POST /v2/npi` (`NpiQueryDTO`: npi, names, city, state, …) | | `PageImpl<NpiDTO>` |

Details on these routes:
- **Lookup:** the route is public, so a Bearer token is harmless but not needed. 1health-fe uses `limit=10` and does a re-lookup of the practice with `entityTypeCode=2` and `searchText=<practice NPI number>` to display it.
- **Is-registered:** the agents.md and MCP docs call the parameter the "NPI number". Backend `NpiServiceImpl.isNpiRegistered` loads it by id, so the docs are misleading.
- **Register:** the provider id is mandatory (`PROVIDER_NPI_IS_MISSING`). It is **one-time only**: 400 if the person already has a provider NPI (`PERSON_ALREADY_HAS_PROVIDER_NPI`) or a practice NPI. It also returns 400 if the NPI is already registered by someone else. There is no update or unregister route.
- **`POST /v2/npi`:** a Bearer-protected search that is an alternative to `/v2/public/npi/list`.

The `PersonWithNpiDTO` sub-DTOs (from the backend):
- `ProviderNpiDTO`: id, npi, providerFirstName, providerLicenseNumber, address lines, taxonomy{id,name}, isVerified
- `PracticeNpiDTO`: id, npi, providerOrganizationName, isVerified, organization{id,name,tenantId}, address
- `HieEndpointDTO`: endpoint, affiliation address

1health-fe flow (to mirror):
1. Call `is-registered` for the chosen personal record and, if one was chosen, the practice record.
2. If either returns true, warn and stop.
3. Otherwise `POST register/npi`, then refetch `GET /v2/user/npi`.

### My Organizations

| Op | Method & path | Params | Response |
|---|---|---|---|
| List / search | `GET /v2/user/organization/portal` | `name` (partial), `page` (0-based), `size` (default 50) | agents.md says only `PageImpl {}`. Real shape (1health-fe reads it): `{data: OrganizationPortalResponseDTO[], totalElements, totalPages, …}` |
| Pending join requests (optional) | `GET /v3/user-management/my-requests` | `page`, `limit`, `status=Pending Approval` | Page of join requests. **Only works from the Default-tenant context**; otherwise 400. |
| Enter portal (tenant switch) | `GET /v2/user/switch-tenant/{tenantId}?revokeToken=true` | | `SwitchTenantResponseDTO {user, auth: {access_token, refresh_token, expires_in, …}}` |

`OrganizationPortalResponseDTO` (= `SysTenantConfigResponseDTO` + `enabledInTenant`) has these fields: boiId, tenantId, tenantName, subdomain, supportEmail, supportPhone(+Region), supportPageURL, applicationName, facilityName, tagLine, tenantLogo/DarkLogo/TitleIcon {file}, primaryColor, secondaryColor, hipaaCoveredEntity, allowedDomains, registrationFlowConfig, organization (OrganizationWithPersonContactDTO).

How 1health-fe uses the list:
- It filters out items without `organization`.
- It disables "Enter portal" when `!enabledInTenant` or when the org is the current tenant.
- The current tenant comes from `myself.tenantContext.id`.

The MCP doc's sample (`content[]`, `logoUrl`, `shortName`) is **invented**. Do not trust it.

Switch-tenant behavior and validation (backend `TenantService.switchTenant`):
- The user must belong to the target tenant and must not be disabled in it.
- System users cannot switch.
- Each call mints a new token. By default it **revokes the current one**.
- It persists the user's tenant context.
- It updates session timeout.
- It claims the org entity.

**Critical for an external app:** the new token is minted **without** `externalApplicationId`. It is a plain portal token. Calling switch-tenant from this app would:
- revoke the LPL token (by default),
- leave the app holding a non-app token for a tenant the app may not be allowed in (`external_application.allowed_tenant_ids` / allowed orgs),
- change the user's *persisted* tenant context for the portal too.

Recommendation: make "Enter portal" a **navigation to the portal** for that tenant (for example, the tenant `subdomain` on the env base host, or the portal's own switch flow). Do not have this app call switch-tenant itself. This needs a product and tech decision.

Related, out of scope for the UI:
- `GET /v2/tenant/search?name=` is Proctor-only. Dev marks it **deprecated since v2026.04.01** in favor of the paged form; demo and prod do not.
- `POST /v2/tenant/{tenantId}/join` creates a join request.

---

## 3. Platform conventions that apply
- Pagination is 0-based `page`. Page size is `size` (default 50), except NPI lookup and my-requests, which use `limit` (default 10). Responses use `{data, totalElements, totalPages, pageNumber, pageSize, …}`. The UI is 1-based, so subtract 1.
- Error envelope: the site guide says it is "not yet confirmed". Read `message` defensively (1health-fe uses `error.response.data.message`). Many backend MFA errors are `IllegalStateException` and arrive as 500 with a message. Treat both 400 and 500 as user-visible failures.
- `GET /v2/user/myself` is a public pattern. With a Bearer token it returns the full UserDTO, including MFA flags and `tenantContext`.

---

## 4. Environment differences (dev vs demo vs prod)
- **Route sets are identical across all three environments for this module.**
  - Dev publishes 455 routes in total, prod 474, and demo 481.
  - The routes missing from dev are admin-only (`access-control`, `user/{userId}/role`, `share`) and unrelated to this module.
- Per-route content differences are cosmetic except for these:
  - `PUT /v2/user/update-password`: fields are optional in dev and required in demo/prod. The backend requires all three.
  - `GET /v2/tenant/search`: deprecated in dev only. Demo/prod say `name` "Must not be blank" and drop the field table (prod names DTO `TenantSearchDTO`).
  - `GET /v2/user/myself`: `id` nullable in dev, non-null in demo/prod.
  - `qrCode` nullable flag differs; the remaining differences are response-heading text only.
- Prod docs come from a different commit (`9a73422`) than dev (`fd2badc`). Re-verify before release.

---

## 5. MCP server (`https://mcp.dev.1hdev.io/mcp`)
- No auth is needed for docs tools. `initialize` returns server `1health-mcp` v1.28.1 over SSE.
- Tools:
  - docs: `search_api_endpoints`, `list_endpoints`, `get_endpoint_details`, `get_api_doc`, `get_use_case`, `find_boc_relationships`, `get_workflow_guide`
  - session: `login`, `logout`, `call_1health_api`
  - library: `contribute_use_case`
- `call_1health_api` needs an interactive browser `login`, which was not attempted.
- It has no use cases for NPI, MFA, password, or org switching.
- Its `api-docs/*.md` (the same files as in `1h-api-mcp-py/data/api-docs`) contain **hallucinated shapes** for three routes covered above: update-password, enable/totp, and organization/portal. Prefer agents.md plus the backend.

---

## 6. Gaps and open questions
1. **Role coverage:** whether a typical provider or staff user in the launch tenant has "Patient functionality". If they don't, the NPI, MFA, and org-list routes return 403. Verify on demo with a non-patient account, or have 1health confirm that the Patient role is auto-assigned to every user.
2. **Enter portal:** switch-tenant from an external app revokes the LPL token and drops app binding. A portal deep-link convention per tenant is needed (subdomain URL? portal route with tenantId?). Neither docs nor the backend define a "launch portal in tenant X" URL.
3. **MFA preconditions:** `enable/totp` needs `mfaEnabled=true`. It is unclear whether every user already has an MFA config. If not, the app must call `POST /v2/mfa/enable` first. Also unclear: does that change login behavior (email/SMS MFA) as a side effect? 1health-fe never calls it.
4. **TOTP manual key:** the raw secret is not exposed. A manual-entry fallback needs a backend change.
5. **Password change side effects:** it is undocumented whether other sessions or tokens are revoked after a change. No revocation is visible in `UserService.updateUserPassword`.
6. **Undocumented response shapes:** `myself` MFA and tenant fields, the `organization/portal` item DTO, and the error envelope. All are taken from backend source and 1health-fe usage; none are in agents.md.
7. **Doc errors to report to the docs team:**
   - `is-registered` parameter semantics (it is the record id, not the number)
   - MCP docs for update-password, enable/totp, and organization/portal
   - the auth quickstart lacks the LPL/external-app flow
   - the auth quickstart cites `POST /tenant/switch-tenant` (auth service) rather than the bo-core `GET /v2/user/switch-tenant/{tenantId}` that clients call
