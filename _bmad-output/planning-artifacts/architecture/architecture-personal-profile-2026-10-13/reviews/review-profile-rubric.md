---
title: 'Rubric review (delta): ARCHITECTURE-SPINE.md, Profile module /account'
reviewed: ../ARCHITECTURE-SPINE.md
baseline: ../.ARCHITECTURE-SPINE.pre-profile.bak
date: 2026-10-13
inputs:
  - ../../../prds/prd-profile-account-2026-10-13/prd.md (FR-101..FR-120, §5.1 AM-1..AM-7, §5.2 NFRs)
  - ../../../prds/prd-profile-account-2026-10-13/addendum.md (§A endpoints, §C notes, §D copy)
  - ../../../ux-designs/ux-personal-profile-2026-10-13/EXPERIENCE.md (Profile-module rows)
  - ../.memlog.md (last ~15 entries)
lens: good-spine checklist, focused on the delta (Profile module added; AD-2/4/5/6/7/8/9/10/12/13/15 amended; AD-22/AD-23 new)
severity: impact on downstream builders (stories built independently for /account)
---

# Rubric review (delta): Profile module in the Architecture Spine

## Verdict

The update is mostly sound. It is well scoped: every AM-1 to AM-7 has a home, and AD-22 and AD-23 aim at the right divergences (portal URL building, base-MFA side effects, NPI type, organization ordering). It is **not build-ready yet**, for these reasons:
- **The portal hand-off fails when the app is framed.** AD-22's session-gated route is opened in a new top-level tab. That tab never receives the `Partitioned` session cookie, so it can't work there.
- **The `FORBIDDEN` mapping has a gap.** It doesn't separate upstream 403s from the proxy's own 403s, so a missing allowlist entry would look like "no access".
- **The rules that protect PHI on pages don't name `/account` or `/handoff`.** AD-17, AD-18 and AD-21 still name only `app/page.tsx` and `/`.
- **The account save contradicts PRD FR-109.** The spine stops at the first failed step, while FR-109 runs time-zone and locale independently.
- **The module's entry path isn't closed.** The spine has no fallback if the portal can't carry `view`/`tab`, and `proxy.ts` doesn't handle `/account?lpl=`.

**Counts:** Critical 1 · High 4 · Medium 7 · Low 11 (23 findings)

## (A) Checklist summary (delta)

| Criterion | Result |
|---|---|
| Fixes the real divergence points for the `/account` stories, missing none | **Mostly.** AD-22 and AD-23 cover the big ones. Still missing: a leave-guard API for programmatic and external navigation (shared by provider, organizations and account), `/launch-error` page context, per-step semantics for the account save, the SWR provider scope across the two pages, and query regexes for the new allowlist entries. |
| Every new or amended Rule is enforceable and prevents its divergence | **Partly.** AD-22 isn't workable in the framed host (C1). AD-9's exception relies on review, because the proxy can't tell callers apart (M3). AD-15's "query strings never logged" can't reach Vercel's own request logs (M4). AD-13's logo rule only covers non-200 responses (M7). The 403 → `FORBIDDEN` convention collides with proxy 403s (H1). |
| Nothing under Deferred could let two units diverge | **Mostly.** The new "Change password denied" entry is safe. But "Source updates" doesn't list the Profile addendum and UX passages that the spine now overrides: the client-built portal URL with `location.assign`, `tenantLogo.publicUrl`, the tenant-error copy, and the practice is-registered fallback lookup. Builders reading the addendum will diverge (M6). |
| Every AM-1..AM-7 landed | **Yes, with gaps.** AM-1 landed as `view` on `/launch` rather than as a route, which is fine, but it has no `/account?lpl` handling and no fallback (H4). AM-2 ✓. AM-3 landed, but its copy contradicts the UX and PRD verbatim text (M1). AM-4 ✓, but it can't be enforced (M3). AM-5 ✓ for logos; the signature was already covered. AM-6 ✓ for the allowlist, but redaction misses platform logs (M4) and the sys-config param (M2). AM-7 ✓ for FRs and UJs, but the Profile §5.2 NFRs aren't bound (L5). |
| No amendment contradicts or weakens an existing AD unintentionally | **Two do.** (1) The AD-9 exception widens the `PUT user/edit` body allowlist for **all** callers, which weakens the old blanket rule more than intended (M3). (2) The amended AD-23 403 convention reuses the HTTP status that AD-2 and AD-17 use for `NOT_ALLOWED`/`CSRF` (H1). AD-5's framed rule plus AD-1's `Partitioned` cookie make AD-22 contradict itself (C1). |
| Operational envelope still covered | **Mostly.** Env, secrets, CI and rollback are unchanged, and `PORTAL_URL` already exists. Gaps: the CI header and no-cache tests don't sample `/account` or `/handoff` (H2), and there is no app-side kill switch per module. The PRD's rollback is a 1health-fe flag only, and `PP_DISABLED` kills both modules (L7). |

## Findings

### Critical

**C1. The framed portal hand-off can't get a session (AD-22 × AD-1 × AD-5).**
- **Problem:**
  - AD-22 makes `/handoff/portal` require a session.
  - When the app is framed, the link opens `target=_blank` in a **new top-level tab** on the app origin.
  - The session cookie is `Partitioned` (CHIPS), and it was set while the app was embedded under the portal's top-level site. A top-level tab on the app origin has a different partition key, so the cookie isn't sent.
  - `requireSession()` therefore fails, and the user gets the launch-error screen instead of the portal.
- **Impact:** this breaks FR-116, FR-119 and FR-120 in the embedded host, UJ-104, SM-104, and addendum §E rows 12–13. Mocked-proxy Playwright tests won't catch it.
- **Fix:** drop the session requirement from `/handoff/portal`. Its inputs are an enum, a numeric id and a server constant, and it returns no data, so an open redirect is still impossible. Alternatively, have the framed client build the URL from a page-embedded `portalUrl` value. Either way, state the behavior explicitly and add a real-browser framed test.

### High

**H1. 403 → `FORBIDDEN` swallows the proxy's own 403s (AD-23, Errors convention vs AD-2/AD-17).**
- **Problem:** "403 on any of these resources maps to `FORBIDDEN`". But the proxy also returns 403 with `NOT_ALLOWED` (no allowlist match) and `CSRF`.
- **Impact:** a forgotten allowlist entry, or a broken `X-PP-Session`, would render "You don't have access…" and could pass QA as an expected R-B/A1 outcome.
- **Fix:** map to `FORBIDDEN` only when the status is 403 **and** the body carries no proxy `code`. Let `NOT_ALLOWED`/`CSRF` fall through to the generic error, and log them.

**H2. The PHI and session guarantees aren't extended to the new routes (AD-17, AD-18, AD-21).**
- **Problem:**
  - AD-18 lists only `app/page.tsx` for `force-dynamic` and the no-store header overwrite.
  - AD-17 binds `app/page.tsx` as the place that embeds `sessionBinding`. The seed comment mentions `account/page.tsx`, but the Rule doesn't.
  - The AD-21 and AD-18 CI tests sample only `/`, `/launch-error` and one `/api/1h` route.
- **Impact:** a statically optimized `/account` could cache one user's `sessionBinding` and serve it to other users. That causes 409 storms, or worse.
- **Fix:** name `app/account/page.tsx` and `app/handoff/**` in AD-17, AD-18 and AD-21. Add both routes to the header test tables.

**H3. The account save's step semantics contradict PRD FR-109 and addendum §C (AD-7).**
- **Problem:**
  - The generic AD-7 rule is: on any step failure, refetch, rebase and return `{ok:false}`. That means stop at the first failure.
  - The PRD and addendum say `time-zone` and `locale` run **independently**, and the error names each part that wasn't saved ("{Part} was not saved").
- **Impact:** one story will stop after a failed `PUT edit` and another will continue. The partial-save copy and the parity row (§E 6) diverge.
- **Fix:** state it for `account`. Either continue through all three steps and collect the failed parts, or stop and name the parts that were never attempted. Say which, and what the banner lists.

**H4. The module's entry path isn't closed (AD-4, `proxy.ts`, Open Questions).**
- **Problem:**
  - Only `/` with `lpl` is redirected to `/launch`.
  - The PRD says the launch "can target `/account`". 1health-fe may send `/account?tab=…&lpl=` or `/launch?view=account…`, and nothing pins which one.
  - The portal appends `?lpl=` to the **registered** launch URL. The open question "does the portal carry `view=account&tab=…`" has no fallback and no deadline before code freeze (10-22).
- **Impact:** the 1health-fe story and the launch story can't be built against each other.
- **Fix:**
  - Pin the contract: the 1health-fe launch URL is `<APP_ORIGIN>/launch?view=account&tab=<t>`.
  - Add `/account?lpl` → 307 `/launch?view=account&<query>`.
  - Give the open question an owner date and a fallback. One candidate: a second registered launch path, `/launch/account`, which implies `view=account`.

### Medium

**M1. The tenant and invalid-launch copy conflict with UX and the PRD, and `/launch-error` has no page context (AD-4, AD-6 vs EXPERIENCE).**
- **Problem:**
  - The spine's tenant copy is "This is available in your personal account. Switch to it in 1health and open it again."
  - EXPERIENCE (Voice and Tone, labeled module-neutral) and PRD FR-102 say "Profile is available in your personal account. Switch to it in 1health and open the app again."
  - EXPERIENCE also needs page-specific invalid-launch copy ("Open Profile again from 1health." on `/account`). But `/launch-error?reason=` carries no `view`.
- **Impact:** AD-11 says copy is EXPERIENCE verbatim, so the launch-error story can't satisfy both documents.
- **Fix:** carry the validated `view` enum on `/launch-error?reason=&view=`, or choose one copy and record a UX correction.

**M2. The new allowlist entries are under-specified, and one is wrong (AD-2 AM-6 bullet).**
- **Problem:**
  - `tenant/sys-config` "accepts exactly one numeric `Tenant IDs` value", but addendum §A also sends `includeAllRelations=true`. Under AD-2's unknown-param rule that returns a 400, or a story drops the param and loses the support contact.
  - No value regex is given for `user/time-zone?timeZone` (the six IANA ids), `user/locale?locale` (`en-US`), or the repeated `type` on `contact-point/list` (`Email|Mobile|Landline`, multi-valued).
  - The `PUT user/edit` body schema isn't stated: it must reject `locale` (backend R2).
- **Fix:** list those params and regexes in the AM-6 bullet.

**M3. The AD-9 exception can't be enforced at the proxy, which weakens the old rule (AD-9 / AM-4).**
- **Problem:**
  - The proxy can't tell `features/account` from `features/personal`. The `PUT user/edit` body allowlist must now admit `email`, `phoneNumber` and `phoneNumberRegion` for every caller.
  - "No other module may" and "only Verified values" are review-only.
- **Fix:**
  - Make `lib/api/account.ts#updateAccount()` the sole builder of the email and phone fields.
  - Have the Personal-information payload type omit them.
  - Add an ESLint `no-restricted-imports` rule so only `features/account` imports `updateAccount`.
  - State that `phoneNumberRegion` travels with `phoneNumber`, and fix the phone format.

**M4. The MFA `code` will still reach logs: Vercel's request log records the incoming URL (AD-15 / AM-6).**
- **Problem:** the browser calls `/api/1h/v2/mfa/validate?code=NNNNNN`. The app logger can omit query strings, but Vercel's platform request and runtime logs show the request path with its query string.
- **Impact:** AM-6 ("the proxy and logs redact the `code`") isn't met.
- **Fix:** the browser sends the code in a POST JSON body (or through a named op, `/api/pp/mfa/validate`), and the proxy moves it into the upstream query string server-side. The same concern applies, more mildly, to NPI and organization `searchText` (names).

**M5. There is no shared leave-guard API for hand-offs and cross-page links (AD-7, AD-22, EXPERIENCE).**
- **Problem:**
  - "Navigates the tab after the leave guard" is used by `features/provider` (Register your practice, the signature link to `/`), `features/organizations` (Enter portal, Create/Register organization) and `features/account` (the helper link to `/?tab=contacts#email`).
  - AD-7 only says the guard "talks to the registry". It doesn't say how a feature *invokes* the guard for an external or cross-page navigation.
- **Impact:** each story will wire its own guard.
- **Fix:** have `features/shell` export one `GuardedLink` / `useGuardedNavigate(href, { external })`. It skips the guard when framed and external, and handles client-side transitions between `/` and `/account`.

**M6. The spine's overrides of the Profile addendum and UX aren't recorded (Deferred → Source updates).**
- **Problem:** addendum §C says to build the portal URL on the client and use `location.assign` / `window.open`, and §A uses `tenantLogo.publicUrl` and a practice is-registered fallback lookup. The UX tenant copy also differs (M1). AD-22, AD-13 and AD-23 supersede all of these, but "Source updates" lists only the PP PRD and UX items.
- **Impact:** story authors read the addendum.
- **Fix:** add the Profile addendum §A/§C items and the EXPERIENCE copy to Source updates, or state "spine supersedes addendum §C Portal hand-off / §A tenantLogo" inline in AD-22, AD-13 and AD-23.

**M7. The logo rule assumes `tenantLogo.id` and covers only non-200 responses (AD-13 / AM-5).**
- **Problem:**
  - Addendum §A lists only `tenantLogo.publicUrl` among the fields used. Nothing confirms that `OrganizationPortalResponseDTO.tenantLogo` carries `id`; the open question asks only about download permission.
  - Logos are often SVG or WebP. AD-13 serves `inline` only for png/jpeg/bmp, so a 200 with another type yields a broken image, not the initials tile.
- **Fix:** add "`tenantLogo.id` present in the DTO" to the open question. Specify `<img onError>` → initials tile, and decide whether the logo entry accepts `image/webp|svg+xml` (SVG only via `<img>`, with `nosniff`).

### Low

- **L1. The MFA "once per dialog open" trigger isn't pinned (AD-23).** The QR request must come from the tile's click handler, not a mount effect. React 19 StrictMode double-invokes effects in dev and would rotate the secret. UX also puts the request before the dialog opens (tile spinner).
- **L2. Telemetry for the new flows is undefined (AD-15).** SM-103 (MFA success within 2 attempts) needs an event. AD-15 still lists only `section_save` and `save_all`, so stories may invent events. Add `mfa_link {ok, attempt}`, or defer it explicitly with SM-103 marked unmeasured.
- **L3. The `/account` anchors aren't declared (AD-7).** EXPERIENCE uses `#account|#authenticator`. AD-7 says ids are the anchors but lists only `account`. Declare `authenticator` as a non-registry anchor, and say whether Healthcare credentials has one.
- **L4. The organization details are left to the story (AD-23):**
  - filter out items with `organization == null` (addendum §A);
  - the source of the internal-user check (`myself.email` domain in `@1health.io|@tachin.ai`) and where that constant lives;
  - the checkout URL constant (`learnmore.1health.io/product-checkout`).

  Each sits within one unit, but they're quiet parity requirements.
- **L5. The Profile PRD §5.2 NFRs aren't in `binds`.** Those NFRs cover security (QR, codes and NPI selections never in telemetry), the 1.5 s first content per tab, and 1 s typeahead. UX also requires "a tab loads only when it's opened". The spine doesn't fix lazy per-tab fetching. Prefetching every tab would multiply 403s and miss the performance target.
- **L6. The dev debug logger must redact the `qrCode` response body and the `code`.** AD-15 allows bodies in `APP_ENV=dev` "redacted" but doesn't name these fields.
- **L7. There's no app-side per-module kill switch (AD-20).** Rollback relies on the 1health-fe flag. An incident limited to `/account` (for example, an MFA misuse) can only be stopped app-side with `PP_DISABLED`, which takes down Personal Profile too. Consider `ACCOUNT_DISABLED` → 503 on `view=account`, `/account` and the Profile allowlist entries.
- **L8. AD-22 doesn't pin the create-org target path.** Addendum: `<portal origin>/organizations/create`. AD-22 pins only the tenant shape.
- **L9. `MFA_NOT_ENABLED` relies on matching message strings.** The rule is fragile; prefer the HTTP status plus a documented message prefix. Also, the 400 "TOTP already enabled" (a stale status, say two tabs) has no mapping. It should refetch `myself` and show the linked state.
- **L10. The effect of a login-email change on the live session isn't verified.** After `PUT user/edit` changes the Primary email, it's unknown whether the current access and refresh tokens stay valid. If they don't, the success path ends in `SESSION_EXPIRED`. Add this to the Open Questions (verify on demo).
- **L11. The SWR provider scope across `/` and `/account` isn't fixed (AD-10).** The spine doesn't say whether `SWRConfig` sits in the root layout, which would share the cache across client navigation between pages, or in each page. It matters for "an Account settings save mutates contact-point keys" and for AD-19's cache clear on `session-changed`.

## (B) Input reconciliation: Profile-module requirements the spine should fix but doesn't

| # | Source | Requirement (load-bearing / quiet) | Spine status | Finding |
|---|---|---|---|---|
| 1 | PRD FR-120, UX Portal hand-off, AD-1 cookie | The framed hand-off opens the portal in a new tab | AD-22 route requires a session the new tab lacks | C1 |
| 2 | PRD FR-103, addendum §A error rule | 403 → no-access panel; other errors → message/generic | Collides with the proxy's own 403 codes | H1 |
| 3 | PRD FR-109, addendum §C | time-zone and locale independent; name each failed part | AD-7 generic stop-on-failure | H3 |
| 4 | PRD FR-101/FR-102, A2, OQ3 | Launch targets `/account?tab=` | `view` on `/launch` only; no `/account?lpl`; no fallback | H4 |
| 5 | PRD FR-102, EXPERIENCE Voice and Tone | Tenant copy "Profile is available…"; invalid-launch copy per page | Different copy; no view on `/launch-error` | M1 |
| 6 | Addendum §A sys-config, time-zone, locale, contact-point list, edit (R2) | `includeAllRelations=true`; enum values; repeated `type`; no `locale` in edit | Not in the allowlist spec | M2 |
| 7 | PRD AM-4, FR-107 | Only the account Section sends email and phone | Not enforceable | M3 |
| 8 | PRD AM-6, §5.2 Security | `code` redacted in all logs | Vercel request logs not covered | M4 |
| 9 | PRD FR-101, FR-120; UX in-app links | Leave guard on tab switch, cross-page links and top-level hand-offs | No shared navigation API | M5 |
| 10 | Addendum §C, §A | Client-built URL, `publicUrl`, practice fallback lookup | Overridden silently | M6 |
| 11 | PRD FR-118 D6, AM-5 | Logo or initials fallback | Only on non-200 or missing id; DTO id unverified | M7 |
| 12 | PRD FR-111, addendum §C | No QR re-request while open; fresh QR per open | Trigger point not pinned | L1 |
| 13 | PRD SM-103 | MFA linking within 2 attempts | No event defined | L2 |
| 14 | EXPERIENCE `/account` deep links | `#authenticator` anchor | Not declared | L3 |
| 15 | Addendum §A/§B, PRD FR-119 | `organization != null`, internal domains, checkout URL | Not fixed | L4 |
| 16 | PRD §5.2 Performance; EXPERIENCE Skeletons | Tab loads only when opened; 1.5 s / 1 s | Not bound | L5 |
| 17 | PRD §5.2 Security | QR and code not in logs, including the dev debug logger | Dev logger redaction unspecified | L6 |
| 18 | PRD FR-102, §5.3 Rollback | Each module can be rolled back alone | App side: only an all-or-nothing `PP_DISABLED` | L7 |
| 19 | Addendum §C | create-org → `/organizations/create` | Not in AD-22 | L8 |
| 20 | Addendum §A enable/totp | 400 when TOTP is already enabled | Unmapped | L9 |
| 21 | PRD FR-107 (login email change) | User signs in with the new email next time | Effect on the current session unverified | L10 |
| 22 | EXPERIENCE Profile header | Header refreshes after the account save on `/account` | Covered (AD-10 mutates `myself`) | — |
| 23 | PRD UJ-105, EXPERIENCE | Account draft only; no MFA or NPI drafts | Covered (AD-7, AD-12) | — |
| 24 | PRD FR-114 | NPI type enforced by the app | Covered (AD-23 typed functions, AD-2 `1\|2`) | — |
| 25 | PRD FR-120, backend R7 | Never call switch-tenant | Covered (AD-2 deny, AD-22) | — |
| 26 | PRD FR-115 D9 | Register disabled in flight; is-registered checks first | Covered (AD-23) | — |
| 27 | Memlog: Patient functionality, portal URL, tenantLogo download | Open questions with owners and dates | Covered; only the portal-URL row has a fallback, and the `view` carry-through row has none (H4) | H4 |

## Memlog consistency

The memlog's last ~15 entries match the spine text (AM-1 to AM-7, AD-22, AD-23, Errors convention, open questions). There are two exceptions:
- The memlog's AD-23 entry says the QR and code live "in component state only, never SWR/drafts/logs". The spine puts that sentence in AD-10 rather than AD-23, which is fine.
- The memlog doesn't record any decision on the framed-session behavior of `/handoff/portal` (C1) or on the account save's step semantics (H3). Both need a decision entry once they're resolved.
