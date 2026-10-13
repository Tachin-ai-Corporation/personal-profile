# Reconciliation: Jira NG-9019 (+ NG-9020..NG-9027) and Confluence 471302146 vs PRD/addendum

Checked 2026-10-13, read-only. Sources:
- Jira NG-9019 "Rebuild Personal Profile + Profile as a Vercel App" and sub-tasks NG-9020..NG-9027 (all Open, no comments).
- Confluence SE/471302146 "External 3rd-party App integration" (implemented behaviour, verified against release/v2026.06.01, last modified 2026-10-05).
- Targets: `prd.md`, `addendum.md` in this folder. Repo code was spot-checked only where a gap needed it.

Severity: **High** = contradiction or a likely production or security problem. **Med** = under-specified, will cause rework or test ambiguity. **Low** = wording or traceability.

---

## G1 (High): MTA and Customer Support lose profile editing at cutover
- **Source (Confluence §1):** "MTA and Customer Support cannot generate a launch payload. … Note the bar covers the launch-payload endpoint only — those users can still list applications through the grid."
- **PRD location:** §2.2 "Cannot launch: MTA and Customer Support accounts." §6 cutover ("sidebar … launches this app instead of routing to `/profile`. Then `/profile` is deprecated"). SM-4 ("`/profile` … removed within one release").
- **Gap:** the PRD records the block but not what follows from it. After cutover and the SM-4 removal, MTA and CS users have no way to edit their own profile. The sidebar item may also still show for them, because the launchable grid is not filtered by role, so clicking it fails at payload generation.
- **Suggested fix:** add to §6 and §2.2: "For MTA and Customer Support users, 1health-fe hides the Personal Profile launch item and keeps routing to `/profile`, or a decision is recorded that they lose self-service profile editing." Make SM-4 depend on that decision. Add an FR-1 consequence: a launch-payload rejection is shown in 1health-fe as a readable message, not a silent failure.

## G2 (High): Tenant scope and tenant pinning do not match the launch model
- **Source (Confluence §6.2, §9.1, §10, §11.3):** "`tenant.id` is the caller's current tenant." "the explicitly requested tenant is **pinned** into the token rather than taken from the user's stored current-tenant context, and it also drives the access-token TTL." For non-patients, the launchable grid uses "`is_public = true` or owner tenant … or grant". For patients, `isAllowedForPatients` is "the sole visibility gate".
- **PRD location:** §2.2 ("any authenticated 1health user acting in the **default (patient) tenant**", which explicitly includes providers). UJ-3 (Dr. Patel). §6 ("must be Active, and allowed for patients").
- **Gap:** a provider usually works in an organization tenant. If they launch from there, the token is pinned to that org tenant, not the default tenant. The PRD does not say whether:
  - the app must also be `isPublic` (the default is true) or granted to org tenants, so that providers see it at all;
  - personal-record endpoints behave the same under an org-tenant token;
  - the app should refuse non-default-tenant launches, or switch tenant (`GET /v2/external-application/tenants` is MTA/SYS_ADMIN-only);
  - the TTL differs by tenant (FR-2 assumes one refresh cadence).
- **Suggested fix:** in §6, state the full registration policy: `state=Active`, `isAllowedForPatients=true`, and an explicit `isPublic` value with its reason. Add an FR-1 consequence covering a launch from a non-default tenant: either supported, with the endpoints verified under that tenant, or shown as an explanatory screen. In the addendum, state that the token's tenant is fixed for the whole session.

## G3 (High): The token reaches the browser, against the platform's stated model
- **Source (Confluence §1):** "The user arrives at the vendor already signed in, and **no token is ever handed to the browser**."
- **PRD location:** NFR-1 ("Bearer tokens are sent only to the 1health API…"). Addendum §A FR-1/FR-2 (refresh in `lib/auth-client.ts`, calls via `authFetch`). The current code (`app/api/token/route.tsx`) sets token cookies with `httpOnly: false` and returns `access_token` in the JSON body to `app/auth/page.tsx`.
- **Gap:** neither the PRD nor the addendum says where tokens live. The template puts them in JS-readable cookies and the response body. That is an XSS exposure for a PHI app and contradicts the platform concept. NFR-1 does not cover it.
- **Suggested fix:** add to NFR-1: "Access and refresh tokens are held server-side or in `httpOnly`, `Secure`, `SameSite` cookies. They are never readable by page JavaScript or returned in a response body. API calls go through a server proxy (BFF)." Record this as an architecture decision in addendum §D.

## G4 (High): Kill switch and rollback rely on actions that do not revoke tokens
- **Source (Confluence §2.2, §5, §9.2):** "A state change triggers **no token revocation**." "delete revokes **no tokens or pending security codes**." Revocation table: `isAllowedForPatients` true→false = "Yes, all tokens". State → Disabled/Deprecated = "No". Soft delete = "No". "Revocation is best-effort."
- **PRD location:** §6 Rollout ("Rollback means pointing the sidebar back to `/profile`").
- **Gap:** rollback only stops *new* launches. Sessions already open keep valid access and refresh tokens, so they can keep writing PHI. The PRD has no emergency stop. Disabling the app does not end sessions.
- **Suggested fix:** add a §6 rollback/incident step: "To end live sessions, set `isAllowedForPatients=false` (revokes all tokens for the app) and/or call `POST /auth/jwt/revoke-tokens/external-application/{id}`. Disabling or deleting the app does not revoke." Add an FR-2 consequence: a revoked token (refresh fails) goes to the session-expired screen, same as UJ-5.

## G5 (Med): Single-use, 60-second launch code: refresh, back button and double exchange not specified
- **Source (Confluence §6.4, §8, §13):** "**60 seconds** from issue". "Single-use". "Timestamps … in **server local time** — no `T` separator, no timezone offset." "Code redemption is a read-check-then-update without row locking … concurrent redemptions of the same code are not structurally prevented."
- **PRD location:** FR-1 ("invalid, expired or already-used launch payload shows an explanatory screen"). FR-3 (deep-linkable `?tab=`).
- **Gap:** FR-1 does not say:
  - the code lasts 60 s;
  - the `lpl` parameter must be removed from the URL and history after exchange, or a reload or Back on `/auth?lpl=…` replays a used code and shows an error;
  - the exchange must run exactly once (a React effect can run twice, and the server does not prevent double redemption);
  - the app must not check `expiresAt` itself, since server-local time has no offset.

  The FR-3 deep link only works within an existing session, because a fresh launch always comes through the fixed launch URL.
- **Suggested fix:** add FR-1 consequences:
  - the exchange runs once per payload (idempotent guard);
  - after the exchange, the app replaces the URL so `lpl` is not in history;
  - reloading after a successful launch keeps the existing session instead of re-exchanging;
  - expiry is left to the server.

  Add the 60 s window to the §3 Glossary. In FR-3, note that a deep link applies within a session only.

## G6 (Med): Launch secret handling, rotation and fail-open payloads
- **Source (Confluence §7, §6.3, §13):**
  - "The plaintext is returned **once**…"
  - "Rotation … Immediate, with no grace period — in-flight launches break."
  - "Vault client caches secrets … up to 24 hours" (other nodes may keep the old secret).
  - "**Standard** Base64 … `+`, `/` and `=` must be URL-escaped."
  - "Payload encryption **fails open**: … returns the *cleartext* JSON."
- **PRD location:** §6 ("registered … with a launch URL, icon and launch secret"). Addendum has no secret-handling section. (Code reads `ONEHEALTH_SECRET_KEY_DEMO/PROD`.)
- **Gap:** the PRD does not say:
  - where the secret is stored (server-only env vars per environment, never `NEXT_PUBLIC_`), or who captures it at creation;
  - how to rotate it: the platform-side Vault cache can keep the old secret on some nodes for up to 24 h, so the app may need to accept both old and new;
  - how to handle `+` turning into a space in the query string (the code already does `.replace(/ /g,"+")`, but nothing requires it);
  - that the app must reject a payload that arrives as cleartext JSON (the platform's fail-open case).
- **Suggested fix:** add an addendum §D "Launch secret" note covering the four points above. Add an FR-1 consequence: "A payload that is not valid AES-GCM ciphertext is rejected, even if it parses as JSON."

## G7 (Med): Lifecycle: Active state, activation gate and pre-activation testing
- **Source (Confluence §2.1–2.3, §4):**
  - "Create … State is forced to `Draft`."
  - "`Draft`/`Pending` only for the owner tenant."
  - Activation "requires the **caller's current tenant** organization [to] hold the `EXTERNAL_APPLICATION` capability."
  - "the default tenant can never own an application" (so patients see only `Active` + `is_allowed_for_patients`).
  - Deactivation needs a reason (5–2000 chars).
- **PRD location:** §6 ("It must be **Active**…"). Rollout ("demo first, with QA following UJ-1 to UJ-5").
- **Gap:** patients can never launch a Draft app, so QA of UJ-1, UJ-2 and UJ-4 as a patient needs the app to be Active on demo. The PRD does not name who activates it (someone in an `EXTERNAL_APPLICATION`-capable tenant, not just the owner) or how to test before activation.
- **Suggested fix:** in §6, add a registration checklist per environment:
  1. Create (Draft) in owner tenant X.
  2. Test as an owner-tenant user.
  3. Activate (actor: SYS_ADMIN in an `EXTERNAL_APPLICATION` tenant).
  4. Set `isAllowedForPatients=true`.
  5. Run patient QA.

  Also name the actor for Disable/Deprecate and the required reason.

## G8 (Med): Ticket intent: "Personal Profile + Profile" and "modernize and unify"
- **Source (NG-9019):** title "Rebuild Personal Profile **+ Profile** as a Vercel App". Description: "We want to **modernize and unify** the Platform UI for managing personal profile information."
- **PRD location:** §0 and §1 (frame the app as replacing `/profile` only). §7 Non-Goals (account settings and tenant/organization settings excluded).
- **Gap:** "+ Profile" and "unify" suggest more than one profile surface (for example a provider or organization profile, or account settings) brought into one UI. The PRD reads it as one screen and does not say so. Readers of the ticket and the PRD may expect different scope.
- **Suggested fix:** add to §0 or §1 one sentence giving the ticket title's meaning and naming which other profile surfaces, if any, "unify" covers in v1 versus later. Mirror it in §7 so the exclusions read as deliberate.

## G9 (Low): "Using our agents.md infrastructure as an aid" is not carried into the PRD
- **Source (NG-9019):** "Recreate the functionality as a Vercel APP, using our agents.md infrastructure as an aid."
- **PRD location:** §0 lists `research-api-docs.md` as evidence only. No NFR or process requirement.
- **Gap:** the ticket gives a delivery intent: build with the agents.md API docs and agent tooling. The PRD has no requirement or success criterion for it, for example that endpoints are taken from the agents.md docs, or that gaps found in them are fed back.
- **Suggested fix:** add a line to §6: "Endpoint contracts are taken from the agents.md API docs. Discrepancies found during the build (for example `GET /v2/person/{id}` being forbidden for patients) are reported back to the agents.md owners." Optionally add a secondary success metric.

## G10 (Low): Audit attribution of edits made through the app
- **Source (Confluence §9.3):** "attribution is **creation-only**. There is no `updated_by_external_app_id`, so an update made through an external app is not distinguishable at the row level." Trace events do carry `externalApplicationId`.
- **PRD location:** not addressed. The app edits SSN, identity and login identifiers.
- **Gap:** compliance or support may need to know that an SSN or primary-email change came through Personal Profile. Row-level updates will not show it, only NATS traces will.
- **Suggested fix:** add an NFR or §6 note recording the dependency: audit of updates relies on trace events (`authContextData.externalApplicationId`). State whether that is enough or whether a platform ticket for `updated_by_external_app_id` is needed.

## G11 (Low): Sub-task naming and traceability
- **Source (Jira):**
  - NG-9023 is titled "Additional Contact Information", but PRD §4.4 maps it to Phone.
  - NG-9020 "Menu Tabs (Contacts, insurance, medical)" says "a tab bar or any other design options".
  - NG-9022 and NG-9023 say "all the items that we have on the image" (screenshots attached to Jira).
  - NG-9027 is "Fork the v0-1h-app-template".
  - Insurance has no sub-task.
- **PRD location:** §4.1 and FR-3 (NG-9020 is not tagged on the App Shell feature). §4.4 (NG-9023). §4.8 ("new sub-task"). Addendum §E.
- **Gap:**
  - NG-9020 is not cited next to §4.1 or FR-3.
  - The NG-9023 rename to "Phone" is implicit.
  - FR-11 and the screenshots in Jira are not cross-checked field by field (the PRD points to `docs/design/` instead).
  - NG-9027 (template fork) is not mentioned in the PRD body.
- **Suggested fix:**
  - Tag §4.1 / FR-3 with *(NG-9020)*.
  - Note in §4.4 "NG-9023, titled 'Additional Contact Information' in Jira".
  - Confirm that the `docs/design/` screenshots match the Jira attachments.
  - Reference NG-9027 in §6.
  - Addendum §E already plans the Jira updates; add the NG-9023 retitle to it.

---

### Checked, no gap found
- 30-min / 401-driven refresh (FR-2) is consistent with `expires_in: 3599` and standard refresh.
- The single-use, expired and invalid launch error screen exists (FR-1). G5 only adds detail.
- Contact, address and insurance FRs do not conflict with Confluence, which does not cover profile endpoints.
