# Adversarial Review: PRD "Profile" (Personal Account, Provider Registration, My Organizations)

- **Reviewed:** `prd.md` and `addendum.md` (2026-10-13 draft).
- **Evidence:** `research-1health-fe.md` (FE), `research-backend.md` (BE), `research-api-docs.md` (DOCS), the sibling PRD `../prd-personal-profile-2026-10-13/prd.md` (PP), and `../../architecture/architecture-personal-profile-2026-10-13/ARCHITECTURE-SPINE.md` (SPINE).
- **Lenses:** skeptical senior engineer, QA lead, security reviewer.
- **Agreed scope baseline:** 1:1 parity, plus four agreed deltas: the "+N" org-type overflow, the IPR (i) content, the Disable MFA confirmation, and typo fixes. Password change is explicitly out.
- **Citations:** `file:line` uses the line numbers of the files as they are in this folder.

## Verdict

**Not ready for architecture or stories. It needs one revision pass.**

The PRD is well grounded in evidence for field rules and copy. But it has three problems that block a build:
1. It asks for behavior that the agreed shell architecture cannot deliver: top-window navigation from inside the portal iframe, and email or phone sent through `PUT /edit`.
2. It turns on a platform security feature (base MFA) as a hidden side effect, which goes beyond parity.
3. It never says which spine amendments it depends on: route, tab enum, Section ids, draft keys, tenant gate, and CSP.

Several "parity" claims are actually behavior changes: the locale endpoint, base-MFA enable, the Register confirmation, and the 403 states. Each needs explicit sign-off against the agreed deltas.

| Severity | Count |
|---|---|
| Critical | 3 |
| High | 9 |
| Medium | 13 |
| Low | 9 |

---

## Critical

### C1. "Enter portal", "Register your practice" and internal "Create organization" cannot navigate the top window from inside the portal iframe
- **PRD:**
  - FR-120 (`prd.md:302`): "sends the browser's top window to the 1health portal".
  - FR-116 CTA (`prd.md:268`) and FR-119 internal create (`prd.md:297`) reuse the same hand-off (A3).
- **Evidence:** the architecture spine says the portal's `ExternalAppFrame` is a supported host with sandbox `allow-scripts allow-forms allow-popups allow-same-origin`, and **no `allow-top-navigation`** (SPINE:114). Inside that frame, `window.top.location = …` throws or is blocked.
- **Impact:**
  - Every portal hand-off in the module fails silently when the app is framed.
  - SM-104 (`prd.md:347`) can't pass in the framed host.
  - FR-120's "leave protection asks first" (`prd.md:304`) assumes the app is unloaded, which never happens.
- **Fix:**
  - Specify the hand-off per host. Not framed: same-tab navigation to `PORTAL_URL`-derived URLs. Framed: `target=_blank` (allowed by `allow-popups`), or a `postMessage` contract with the portal. A `postMessage` contract needs a 1health-fe change and an owner.
  - Add both hosts to the FR-120 test matrix.
  - Build the portal URL only from `lib/server/env.ts` `PORTAL_ORIGIN` (SPINE:89) plus a numeric tenantId, never from `subdomain` in the response. That closes off an open redirect.

### C2. FR-111 silently turns on base MFA (email/SMS codes at login). This is not parity, it isn't undone on cancel, and it can't be turned off in the app
- **PRD:**
  - FR-111 (`prd.md:214`): "If base MFA is not enabled yet, the app enables it first … The user sees one flow."
  - FR-112 (`prd.md:226`): base MFA is left unchanged on disable.
  - §6.2 has no `mfa/disable` in scope, and the addendum allowlist has no `mfa/disable` row (`addendum.md:16-19`).
- **Evidence:**
  - 1health-fe **never** calls `/mfa/enable`. A tile click calls `enable/totp` only (FE:98; DOCS:73 "1health-fe never calls it; it assumes mfaEnabled is already true").
  - Base MFA "turns on the email/SMS code at login" (BE:162).
  - DOCS:187 explicitly flags this side effect as unknown.
- **Problems:**
  1. **Parity:** today, a user without base MFA gets an error toast ("Mfa is not enabled for this user", BE:168). The PRD replaces that with a new account-security state change that is not one of the four agreed deltas.
  2. **Irreversible side effect:** the user opens the dialog and then cancels, or the session expires mid-enrolment (UJ-105). TOTP stays off (`prd.md:218`), but base MFA stays **on**. From then on they get email/SMS codes at every login, with no in-app way to turn them off. A user with no deliverable contact point at login could be locked out.
  3. **Internal contradiction:** FR-111 says "enable, then enable TOTP". `addendum.md:51-52` says call `enable` only and use its QR. Calling both rotates the secret twice (BE:167-168). Engineers will build one or the other.
- **Fix:**
  - Choose one of these:
    - (a) Strict parity: when `!mfaEnabled`, tiles are disabled with an explanation, and nothing is called.
    - (b) Make base-MFA enable an explicit, disclosed step with its own consent copy, plus a compensating `POST /mfa/disable` when the user cancels before validating, and a PM + security sign-off as a new delta.
  - Either way, fix the FR and the addendum to say the same thing.

### C3. FR-107 sends `email`/`phoneNumber` through `PUT /v2/user/edit`. The spine forbids this, and the PP module switches Primary by a different mechanism with different rules
- **PRD:** FR-107 (`prd.md:175-182`). Addendum row FR-105/107/108 sends the dirty subset including `email` and `phoneNumber` (`addendum.md:13`).
- **Evidence:**
  - SPINE AD-9 (SPINE:166): "`PUT /v2/user/edit` is never sent `email` or `phoneNumber`."
  - PP FR-12: "Email and phone number are **never** sent from this Section".
  - PP FR-18 and FR-22 switch Primary through the Contact Point manage DTO (relabel to Primary, and the old one to "Old", in one update; SPINE:163).
- **Divergent rules for the same login identifier in the same app:**

  | Rule | Profile (this PRD) | Personal Profile → Contacts |
  |---|---|---|
  | Landline as Primary | allowed (`prd.md:178`, parity with FE:64) | forbidden (PP FR-18 "Landlines can't be Primary") |
  | Before a login-email change | inline notice only (`prd.md:180`) | confirmation dialog (PP FR-22) |
  | Transport | `/user/edit`, which goes through the R1 "already exists" trap (BE:117) | contact-point manage |
  | Unverified current Primary | dropped from the picker (`prd.md:178`) | keeps its badge, shows Verify (PP FR-18) |

- **Impact:**
  - A story that follows the PRD breaks a spine invariant.
  - A story that follows the spine breaks FR-107.
  - SM-102 (no login lockouts, `prd.md:343`) is measured against two inconsistent code paths.
- **Fix:**
  - Pick one mechanism for the whole app. Either amend AD-9 with an explicit exception for this Section and a justification, or route FR-107 through the shared `lib/api/contact-points.ts` engine.
  - Settle the landline and confirmation rules once, and cite the decision in both PRDs.

---

## High

### H1. The PRD depends on spine amendments it never lists (route, tab enum, Section ids, draft keys, binds)
- FR-101 sets the route `/account?tab=personal|provider|organizations` (`prd.md:132`). The spine has a different design:
  - AD-4 validates `tab` against `contacts|insurance|medical` (default `contacts`) and redirects only to `/?tab=` (SPINE:104-105). A launch with `tab=provider` lands on **Contacts**.
  - The structural seed has no `/account` page (SPINE:362-379).
  - SPINE `binds: [FR-1..FR-32]` (SPINE:11). FR-101 to FR-120 are not governed at all.
- **Section-id collision:** the obvious id for "Personal Account Settings" (`tab=personal`) collides with the PP Section id `personal`, which is also the draft key and hash anchor (SPINE:138, 190). Two Sections writing `pp:draft:v1:<userId>:personal` would restore each other's drafts.
- The PRD's §0 claim "references those requirements … and does not restate them" (`prd.md:17`) hides the fact that the requirements **don't fit as written**.
- **Fix:** add a "Required spine amendments" list (AD-4 tab and route allowlist, AD-7 Section ids and registry scope per route, AD-8 Save-all scope, AD-12 key namespace, AD-6 copy, AD-21 CSP; see H6) and have the architect accept it before stories.

### H2. Launching from an org tenant becomes an error page. Today it switches automatically (a parity regression)
- **Evidence:** today `forceDefaultContext` calls `switchContext()` back to tenant 1 before rendering (FE:17). The user-menu items are visible to everyone in every tenant (FE:23).
- **Spine:** AD-6 rejects any non-default-tenant launch with `reason=tenant` and the copy "Personal Profile is available in your personal account…" (SPINE:122). That copy names the wrong module.
- **PRD:** A1 (`prd.md:59`) simply assumes the app is launched in the default tenant. FR-102 doesn't say what happens when the menu is clicked while the user is in an org portal, which is the **common** case for providers and staff.
- **Fix:**
  - FR-102 must require one of two things: 1health-fe switches to the default tenant before launching, or the launch uses a default-tenant LPL.
  - Add a test case for "user in org tenant clicks Profile".
  - Make the AD-6 copy module-aware.

### H3. MTA and Customer Support users lose `/personal-settings`, and rollback is coupled to the PP flag
- **PRD:** §2.2 (`prd.md:58`) says MTA and Customer Support cannot launch, and `addendum.md:58` drops the MTA branches. FR-102 (`prd.md:139`) reuses "the same 1health-fe flag that keeps legacy `/profile`".
- **Evidence:** PP §6 keeps `/profile` precisely because it "serves users who can't launch external apps (MTA, Customer Support)". FE:23 shows the menu items are ungated, so with the flag on, MTA and Customer Support users get launch failures for their own MFA and NPI settings.
- **Coupling:** with one flag, a Profile defect forces rolling back Personal Profile too, and the reverse.
- **Fix:**
  - The menu items must keep routing MTA and Customer Support users to legacy `/personal-settings`, with an explicit rule.
  - Use a separate flag, or at least separate per-item gating, for this module.

### H4. FR-109 partial-failure retry can lock the user out of saving (R1 trap)
- **PRD:** FR-109 (`prd.md:197-199`) sends `edit`, then `time-zone` and `locale`. On any failure it stays in edit mode. It does not say what a retry sends.
- **Evidence:**
  - R1 (BE:117): sending the caller's **own** current email gives 400 "already exists".
  - If `edit` succeeded with a new email and `time-zone` failed, a naive retry resends `email`. That email is now the user's own, so the request fails, and keeps failing.
- The spine's AD-7 rebase rule (SPINE:130) exists for this case, but the PRD doesn't bind to it. The addendum (`addendum.md:56`) only says "collect the per-call results".
- **Fix:** add a consequence: "After a partial failure the form baseline is rebased to the refetched server state, and a retry sends only the calls that failed." Add a QA case: email change plus a forced time-zone failure, then retry.

### H5. The locale field will be empty for most users, and "required" will block every save. The endpoint switch also changes behavior
- **Evidence:**
  - Today 1health-fe writes locale through `/edit` as a **user attribute**, and always *displays* the constant "English - United States" (FE:41, 69).
  - `/myself.locale` reads a **different column**, which only `POST /user/locale` writes, and 1health-fe never calls that (BE:107, 129; FE:84).
- **PRD:** FR-108 (`prd.md:191-192`) says to show the stored value or the raw code, never blank, and that all three fields are required. It also switches to `/locale` (`addendum.md:33`).
- **Consequences:**
  - For every user whose column was never written, the read view shows "Not provided" instead of today's label.
  - In edit mode the field is empty and "required", so a user who only wants to fix a typo in their last name must also set the locale. That fires an extra `/locale` call and adds a new failure point to FR-109.
  - Writing the column (which `/myself`, and possibly server-side formatting, reads) and no longer writing the attribute changes platform behavior. That is not parity, and its downstream consumers are unknown.
- **Fix:**
  - Define the null-locale behavior explicitly: for example, default to `en-US` for display, and don't require it unless it's dirty.
  - Get backend confirmation of who reads the attribute and who reads the column.
  - Record the switch as an agreed delta or revert to parity.

### H6. The spine CSP blocks organization logos
- **PRD:** FR-118 (`prd.md:286`) renders the logo from `tenantLogo.publicUrl` (`addendum.md:26`; BE:276).
- **Spine:** AD-21 sets `img-src 'self' blob: data:` (SPINE:286). A `publicUrl` on a 1health file or CDN host is blocked, so every card falls back to initials and FR-118 fails QA.
- **Fix:** choose one:
  - add the exact file-host origin per environment to `img-src` in `env.ts`
  - serve logos through an `asImage` proxy entry (AD-13)

  Either way, record it as a spine amendment. Authenticator tile logos must be bundled locally for the same reason.

### H7. NPI registration is irreversible, has no identity check and no audit, and lacks a remediation path. The confirmation copy misleads
- **Evidence:**
  - No name match and no approval: "Anyone with the Patient role can claim any free NPI" (BE:245, R5).
  - No unregister or edit endpoint exists anywhere (BE:217; DOCS:101).
  - No audit trail (BE:39).
  - The server doesn't enforce entity type, and the uniqueness check runs only when the type matches (BE:244, R4).
- **PRD:**
  - FR-115 confirmation: "can't be undone **here**" (`prd.md:253`) implies it can be undone somewhere else. It can't.
  - §6.2 defers identity checks as "platform-level" (`prd.md:331`). There is no owner, no risk-acceptance record, and no support runbook for a mistaken or fraudulent claim, which blocks the real NPI holder (UJ-103's own edge case, `prd.md:93`).
  - "Because the platform doesn't check the type, the app must" (`prd.md:241`) is enforced only in the client. With the BFF as the trust boundary, a crafted `POST /api/1h/v2/user/register/npi` with a type-2 id as `providerNpiId` skips the uniqueness check.
- **Fix:**
  - Copy: "This can't be undone. Contact 1health support if you selected the wrong NPI."
  - Add an attestation checkbox ("I am the provider identified by this NPI").
  - Record R5 as an accepted risk with a named owner and a support procedure.
  - Either validate the type in the proxy, with a server-side lookup on a named `/api/pp` operation, or file a backend bug for R4 and reference it.

### H8. Release-blocking open questions have no fallback and no deadline. QA can't test the provider persona
- OQ1, the portal URL per tenant (`prd.md:353`), gates FR-120, the FR-116 CTA, FR-119 internal create, and SM-104. A4 is unconfirmed (`prd.md:305`), and the release has a 10-22 code freeze.
- OQ2, staff-only 403 (`prd.md:354`): Doctor maps to **no** functionality (BE:24), and the MFA, NPI, org-list, edit and contact-point endpoints all need Patient functionality (BE:26; DOCS:44). UJ-103's persona (a physician) is the user most at risk. SM-101 (`prd.md:342`) doesn't include a staff-only test account.
- **Fix:**
  - Give each OQ a decision date before freeze and a fallback. For OQ1, the fallback could be opening the portal home in a new tab with the copy "Choose {Org} from the organization switcher".
  - Add a staff-only (no Patient role) account to the SM-101 demo QA matrix.

### H9. Allowlisting `tenant/sys-config` exposes any tenant's configuration
- **PRD and addendum:** `GET tenant/sys-config?Tenant%20IDs=<id>&includeAllRelations=true` is used for the Practice Name popover (`addendum.md:25`; FR-116 `prd.md:265`).
- **Evidence:** "It does not check that the caller belongs to those tenants" (BE:293). Under AD-2, other ids only need to match `^\d{1,19}$` (SPINE:74), so any session can enumerate every tenant's support contacts, allowed domains and `registrationFlowConfig`.
- **Fix:** have the proxy fill the tenant id server-side from the caller's `GET /user/npi` `practiceNpi.organization.tenantId` (a named `/api/pp` operation), or drop the popover. Also confirm that a query-parameter name containing a space survives AD-2's query allowlisting.

---

## Medium

### M1. The Primary Phone read view can show the wrong number
- FR-104 says Primary Email and Primary Phone "come from the user's Primary Contact Points" (`prd.md:161`). The addendum sources them from `/myself` (`addendum.md:11`).
- `/myself.phoneNumber` is overwritten with the primary **Mobile** (BE:56). A Landline made Primary through FR-107 is therefore never reflected if the view reads `/myself`.
- **Fix:** specify the source as the contact-point list where `label === "Primary"`.

### M2. Primary picker edge cases where the current Primary is unverified
- FR-107 lists only Verified points (`prd.md:178`). The FE appended the current value with `id=-1` when it wasn't in the list (FE:39). The PRD drops that behavior silently.
- With an unverified current Primary and one verified alternative there is exactly "one option", so the picker is disabled (`prd.md:179`), even though a switch is possible and desirable.
- **Fix:** define the counting rule as "verified options other than the current Primary", and say how an unverified current value is displayed.

### M3. The same fields are edited by two Sections with different rules and no cross-module invalidation
- Names and birth date are editable both in PP FR-12 ("printable characters only") and in FR-105 ("1–24 characters").
- Nothing specifies that saving in one module invalidates the other's SWR keys or makes its drafts conflict (AD-10, AD-12 `baseHash`).
- **Fix:** use one shared zod schema for names and birth date, a shared `myself` key, and state that a draft conflict is expected across modules.

### M4. The platform error message will be lost on 5xx, and the spine's error mapping assumption doesn't hold
- FR-111, FR-112 and FR-115 (`prd.md:255`) say to "show the platform message".
- The evidence conflicts on MFA errors: they arrive as 400 through Feign (BE:35), or as 500 (DOCS:74, 154). AD-15 strips upstream bodies on 5xx (SPINE:223).
- AD-19 and the conventions map string `errorCode`s (SPINE:262, 296), but these endpoints return `{message, code:int}` (BE:29; `addendum.md:29`).
- **Fix:** define per-endpoint fallback copy and confirm the MFA status codes on demo.

### M5. The 403 copy conflates allowlist misses with real permission denials
- FR-103 (`prd.md:144`) shows "You don't have access…" for any 403.
- The proxy's `403 NOT_ALLOWED` and `403 CSRF` (SPINE:73, 244) would show the same text and hide deploy bugs as "permissions".
- "In the current account" isn't actionable, because the app can't switch accounts (§7).
- **Fix:** branch on the proxy `code`, and give a "contact support" line for the upstream 403.

### M6. MFA concurrency and stale-state errors are unspecified
- These cases aren't covered:
  - double-click Submit, which returns "Totp is already validated" (BE:169)
  - Disable when already disabled in another tab, which returns "Totp is already disabled" (BE:170)
  - a tile click when TOTP was enabled elsewhere, which returns `enable/totp` 400 (`addendum.md:17`)
  - session expiry between QR issue and validate
- **Fix:** add consequences: Submit is single-flight, and every MFA 400 triggers a `myself` refetch and a status re-render instead of a raw error.

### M7. The fallback support number is a placeholder
- FR-115 keeps "Please call 1-888-555-1212" (`prd.md:255`; FE:175). 555-1212 is a directory-assistance/fictional pattern.
- Keeping a non-working number in production is a defect, not parity.
- **Fix:** get the real support number from the tenant support config or from 1health support ops, or say "Contact 1health support".

### M8. Scope creep beyond the four agreed deltas, presented in §6.1 as "agreed"
- §6.1 (`prd.md:324`) lists these as agreed deltas, but they are not in the agreed set:
  - Register confirmation (FR-115)
  - the first-change notice bug fix (FR-107)
  - skeleton, error and 403 states (FR-103, FR-113, FR-117)
- The FRs also add these without listing them as deltas:
  - the tile-inactive hint (FR-110)
  - "Couldn't load results" copy (FR-114)
  - an initials logo fallback (FR-118)
  - six new org-type icons (FR-118)
  - per-call partial-failure naming (FR-109)
  - Retry on the org list (FR-117)
  - (i) click and Escape behavior (FR-118)
- Plus the behavior changes in C2 (base MFA) and H5 (locale endpoint).
- Several are defensible as defect fixes, such as the unmapped type crash (FE:235), or as security positives, such as the Register confirmation. They still need explicit PM sign-off, and a tag on each: *defect fix*, *agreed delta* or *new*.

### M9. Login-email change safety
- FR-107 relies on an inline notice (`prd.md:180`), while PP FR-22 uses a confirmation dialog.
- Unverified risks:
  - Does changing the login email through `/edit` (which triggers the oauth2 user update, BE:114) invalidate the current refresh token? This matters for AD-16.
  - Does `/myself`'s federated-identity sync (BE:79) relabel a Google user's chosen Primary back?
- **Fix:** add both as demo QA cases under SM-102, and align on one confirmation pattern.

### M10. Filtering out `organization == null` breaks pagination and the empty state
- Items with `organization == null` are filtered on the client (`addendum.md:26`; FE:200). `totalElements` and `totalPages` still count them, so pages can show fewer than 12 cards, or none, with pagination still visible.
- The preferred empty-state rule, `totalElements === 0` (`addendum.md:57`), misses a user whose only memberships have no organization.
- **Fix:** define the empty state after filtering, and hide an empty trailing page.

### M11. Birth date that is null or "Unknown" blocks unrelated saves
- `birthDate` is null when terms aren't accepted (BE:64). A value that fails the age rule shows "Unknown" (`prd.md:160`).
- FR-105 makes it required with an 18–120 rule (`prd.md:166`), and the whole form validates, so the user can't save a name change without fixing the birth date. A minor or a legacy record can't fix it at all.
- **Fix:** validate only dirty fields, or explicitly accept and document this parity behavior.

### M12. The FR-116 "Register your practice" CTA has unmapped calls and no states
- The FE does a second `public/npi/list?entityTypeCode=2&searchText=<orgNpi>` lookup, then `is-registered` (FE:183). Addendum §A maps `public/npi/list` only to FR-114 (`addendum.md:21`).
- The PRD gives no loading or failure behavior for the CTA, and doesn't say how to pick a match when the search returns more than one record.
- **Fix:** add the call chain to the addendum and specify an exact `npi` match.

### M13. Stuck registration states are unhandled
- `PERSON_ALREADY_HAS_PRACTICE_NPI` and `PERSON_ALREADY_HAS_PROVIDER_NPI` (BE:240-242; DOCS:101) can occur:
  - from a stale tab, after registering elsewhere
  - for a person whose practice NPI was linked by the Provider Practice self-registration flow without a provider NPI (BE:252)
- FR-113 shows the form whenever `providerNpi` is null (`prd.md:235`), so that user can never register.
- **Fix:** on these 400s, refetch `/user/npi` and show the registered view. Define the "practice only" state.

---

## Low

- **L1. Untestable security wording.**
  - "The QR image is dropped from memory" (`prd.md:313`) can't be tested. Rephrase as "not kept in SWR, state is cleared, and the `<img>` is unmounted on close".
  - Require the dev debug logger's redaction list to include `qrCode` and the `code` query parameter (SPINE:223).
  - The TOTP code travels in a query string (`addendum.md:18`). Constrain it in the allowlist with `^\d{6}$`.
- **L2. Metrics and NFRs that can't be measured.**
  - SM-103 (`prd.md:346`) needs MFA telemetry. AD-15 only allows `section_save` and `save_all` events and has a no-op sink (SPINE:225).
  - "Typeahead returns within 1 s at p75" (`prd.md:316`) depends on the backend and isn't owned by the app.
  - 1.5 s first content conflicts with PP NFR-4's 2.5 s.
- **L3. Disabled "Enter portal" hides its reason from keyboard users.** A disabled button with a tooltip isn't focusable (`prd.md:303`). Use `aria-disabled` plus visible text.
- **L4. Proctor role scope.** The Proctor 21+ rule reads default-tenant `roles` (BE:59). Proctor is usually an org-tenant role, so the rule may never apply. This is the same as today, but document it. The backend enforces only 18+ (BE:105).
- **L5. Phone region not specified.** `phoneNumberRegion` must be lowercase (BE:104), and non-US primaries aren't addressed in FR-107.
- **L6. Internal-domain check underspecified.** The `@1health.io` / `@tachin.ai` check (FR-119) should define which email it uses (Primary) and that the match is case-insensitive. It is a UX gate only.
- **L7. NPI search text needs allowlist limits.** `searchText` is free text on a public route proxied with a Bearer token. It needs a length cap and an allowlist value regex. Don't forward the token to `/v2/public/**`.
- **L8. Tab-switch guard ignores NPI selections.** FR-101 guards only Personal Account. Unsaved NPI selections are discarded silently when switching tabs. That may be intended, but it should be stated.
- **L9. Response over-exposure.** The org-portal list returns `companyTaxId`, `duns`, `registrationFlowConfig` and full `personContacts` (BE:280-285). This is parity with today, but consider projecting the response in the BFF to the fields in `addendum.md:26`.

---

## Suggested PRD edits (summary)
1. **C1:** rewrite FR-120, the FR-116 CTA and FR-119 internal create as host-aware hand-offs: new tab when framed.
2. **C2:** decide between strict MFA parity and a disclosed base-MFA step with a compensating disable. Align FR-111 with addendum §C.
3. **C3 and M1–M2:** pick one Primary-switch mechanism and one set of rules across both modules. Amend AD-9 or FR-107.
4. Add §11 "Required spine amendments": AD-4, AD-6, AD-7, AD-8, AD-12, AD-21, plus allowlist entries with server-filled ids for `sys-config`.
5. **H4–H5:** add rebase-on-partial-failure and null-locale rules.
6. **H3:** add MTA and Customer Support routing plus a separate flag.
7. **H7 and M13:** fix the NPI copy, add an attestation, define stuck states, and record R5 risk acceptance with an owner.
8. **H8:** give OQ1 and OQ2 dates and fallbacks, and add a staff-only account to the QA matrix.
9. **M8:** tag every non-parity delta and get PM sign-off.
