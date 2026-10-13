---
title: "Adversarial review: PRD Personal Profile (NG-9019)"
reviewed: prd.md, addendum.md (2026-10-13 draft)
date: 2026-10-13
---

# Adversarial review: Personal Profile PRD

## Verdict
**Not ready to build against for a 2026-10-29 production release.** The parity core (FR-9 to FR-31) is well mapped to endpoints, but the PRD adds new, risky capabilities on top of parity (local PHI drafts, own-SSN reveal, cross-section Save all, draft restore after relaunch). It leaves three things undefined: the security posture of the starter template it inherits, how primary contact switching is modelled, and the cutover/rollback mechanism. Fix the 5 critical items and cut scope before epics are written.

Code references below were checked against the repo as of commit `64a9749`.

Counts: **Critical 5 · High 11 · Medium 14 · Low 7** (37 total)

---

## Critical

### C1. Unsaved PHI drafts in client storage, with no owner scoping, TTL or field list
- **Where:** prd.md L104 (UJ-5), L148 (FR-2), L413 (NFR-1), L457.
- **Problem:**
  - FR-2 keeps "unsaved edits in any open Section" locally and restores them after relaunch "on the same device". It excludes only the SSN and the Signature drawing.
  - That still means DOB, legal name, race, ethnicity, sexual orientation, gender identity, addresses, insurance member/group IDs, subscriber DOB and email, and possibly card image files all sit at rest in browser storage.
  - The PRD does not say which storage (localStorage, sessionStorage or IndexedDB), whether it is encrypted, how long it lives, or whose draft it is.
  - On a shared or family device (a common patient setup), user B's relaunch would be "offered" user A's draft. That is a PHI disclosure.
  - Drafts are cleared only on save or discard (L413), so abandoned drafts live forever.
  - Two devs will build this differently: one keys drafts by section, the other by user. One includes the insurance drawer and image files, the other doesn't.
- **Fix:** Preferred: drop draft-restore-after-relaunch from v1 and keep in-memory state across silent refresh only (FR-2 bullets 1–2). If it must stay:
  - Store drafts in `sessionStorage` (or IndexedDB encrypted with a per-session key held in memory).
  - Key them by `hash(env + userId)` and drop them on any user mismatch at launch.
  - Use a hard TTL of 24 h or less.
  - Add an explicit allow-list of draftable fields that excludes SSN, signature, images and insurance subscriber data.
  - Purge on "Return to 1health" and on logout.
  - Get a compliance sign-off line in §6.

### C2. The template logs tokens and PHI to the console, and cookies are JS-readable; NFR-1 lets "redact" stand in for "remove"
- **Where:**
  - prd.md L412 (NFR-1) and addendum.md L50–51.
  - Code: `lib/auth-client.ts` L141–211 `logApiCall`, which runs unconditionally with no `NODE_ENV` gate and logs full headers, including `Authorization`, plus request and response bodies. Also L314 and L447 onward.
  - `app/api/token/route.tsx` L50–55 sets `httpOnly: false` on `access_token` and `refresh_token`.
- **Problem:**
  - NFR-1 only talks about *tokens*. The logger also prints every response body. That includes `GET /v2/person/{id}/ssn/expose`, which returns the **plaintext SSN** (addendum L15), plus the full profile, insurance and contact data.
  - FR-13 ("never logged") is violated by default unless someone remembers to fix it.
  - "Off, or redact tokens" (L412) allows a build where tokens are redacted but PHI bodies are still logged.
  - Because the cookies are not httpOnly, any XSS (see C5, SVG) means full account takeover through the refresh token.
  - The PRD has no CSP, XSS or dependency requirement.
- **Fix:**
  - Rewrite NFR-1 to require that production builds emit **no** request/response logging: compile it out behind `process.env.NODE_ENV !== "production"`, plus a lint rule banning `console.*` in `lib/`.
  - Add an acceptance test that a prod build calling `ssn/expose` produces zero console output.
  - Add NFR-1b: a strict CSP (`script-src 'self'`, `connect-src` limited to the 1health API origins plus the Places endpoint, `frame-ancestors` limited to the portal origins), and an explicit decision on httpOnly cookies. That may mean a small refresh proxy route, which CLAUDE.md notes does not exist.

### C3. Save all is under-specified and racy around primary switching, `/user/edit` and auto-verify
- **Where:** prd.md L166–175 (FR-5), L283–288, L311–316; addendum.md L21, L46–47.
- **Problems:**
  1. **Self-contradiction.** Addendum D says "Personal Information goes first" and also "runs `Promise.allSettled(save())`", which is parallel. Two devs will build serial and parallel versions.
  2. **The `/user/edit` interaction is speculative.** FR-11/12 don't include email or phone, so a dirty-fields-only `PUT /user/edit` should never touch `switchPrimaryContactPoint`. Either the form sends email/phone (undocumented) or the ordering rationale is wrong. Nobody knows which.
  3. **The auto-verify diff breaks under concurrency.** Addendum L47 finds "new" ids by diffing the list before and after the save. If Phone, Email and Social save in parallel to the same `POST /v2/health/contact-point`, each section's after-list contains the others' new ids. The result is duplicate verification sends, or none.
  4. **A login-identifier change mid-batch.** Changing the Primary Email/Mobile changes the login identifier (L114). If the platform revokes or rotates tokens on that change (unknown), later saves in the batch 401, refresh fails, and the user gets "session expired" with half the batch applied. That collides with C1 drafts.
  5. **Primary address switch is non-atomic.** "PUT new primary first, then the rest" (addendum L21). If a later PUT fails, the server may hold two primaries, or zero if the platform auto-demotes. FR-27 says "exactly one", and nothing defines recovery.
  6. **Insurance "demote the other" (FR-29 L388)** is two writes with no ordering and no rollback.
  7. **The user's second session isn't covered.** The legacy `/profile` (until SM-4) or a second tab can write concurrently. There is no ETag or version check, so the last write wins silently.
- **Fix:**
  - Specify a **serial** Save all order: Personal Info → Contact points → Addresses → Insurance. Put Phone, Email and Social in **one** combined `ManageContactPointDTO` call.
  - Take the auto-verify diff only from that call's response.
  - Exclude primary changes (contact, address, insurance demotion) from Save all. They need their own confirm-and-commit-immediately flow, which FR-18/22 already require.
  - Add a demo spike task: "does a primary email/mobile switch invalidate the access or refresh token?" Its result blocks FR-5.
  - Define the recovery state for a partial primary switch: refetch, then show a banner.

### C4. Cutover and rollback rely on a code deploy in another repo, and SM-4 removes the rollback path
- **Where:** prd.md L424–427 (§6), L443 (SM-4); research-1health-fe.md "No feature flags".
- **Problem:**
  - Rollback means "pointing the sidebar back to `/profile`". That is a 1health-fe code change and release, not a switch. 1health-fe has no feature flags.
  - SM-4 deletes `/profile` "within one release after cutover", which removes the only rollback.
  - Production External Application registration ("Active", "allowed for patients") is a manual step owned by one person.
  - Providers editing their own signature (UJ-3) need the app allowed for *their* role too, not only patients. If it isn't, providers lose signature management, which is a parity regression on signed documents.
  - Existing deep links (`/profile?tab=0|1|2` in emails, notifications and bookmarks) have no redirect requirement.
  - Today `/profile` works for any default-tenant user. The PRD says MTA and Customer Support "cannot launch" (L54), so any such account that currently uses `/profile` loses it. That is unstated parity loss.
- **Fix:**
  - Gate the sidebar item behind a runtime config or tenant setting (no deploy needed to roll back), and make that a release dependency.
  - Keep `/profile` until at least 2 releases plus N days with no P1 incidents.
  - Add a redirect requirement from `/profile?tab=N` to the app launch with the mapped tab.
  - Name the roles the registration must allow (Patient, Provider, Proctor, …), check them on prod before 10-29, and name a backup owner.

### C5. Insurance card SVG uploads combined with "open full-size" give an XSS path to token theft
- **Where:** prd.md L389 (FR-29: "PNG, SVG or JPEG"), L394–395 (FR-31); addendum.md L49.
- **Problem:**
  - SVG can carry script. The app fetches card images as blobs and turns them into object URLs.
  - If "open full-size" is built as `window.open(blobUrl)` or an `<a href>` to the blob (a natural implementation), a `image/svg+xml` blob opens as a same-origin document and runs its script. With `httpOnly:false` tokens (C2), that script can read the access and refresh tokens.
  - The SVG can come from any earlier upload, including the legacy app or a malicious caregiver.
  - Uploads also keep EXIF metadata. Phone photos carry GPS.
- **Fix:**
  - Drop SVG from accepted upload types. Parity doesn't justify it for card photos.
  - Render existing SVGs only through `<img>`, never by navigating to the blob URL, and show full-size in an in-page lightbox.
  - Set the blob type explicitly to a raster type or refuse SVG content types.
  - Strip EXIF client-side before upload, for both card and avatar.

---

## High

### H1. Own-SSN reveal is a new capability presented as parity, and its hide rules are ambiguous
- **Where:** prd.md L240–248 (FR-13); addendum.md L15, L50; research-1health-fe.md "No SSN reveal on own profile".
- **Problem:**
  - Today patients cannot reveal their own SSN, so this feature adds attack surface.
  - "Hides on blur": blur of what? The field, the button, or the window? Two devs will differ.
  - Nothing says the expose call must bypass SWR. `SessionProvider` uses SWR, so a natural implementation caches the response in memory and violates "never cached".
  - There is no audit, rate-limit or re-auth requirement.
  - The SSN *typed* into the edit field is also plaintext in form state, and browser autofill may save it.
- **Fix:**
  - Decide whether reveal is needed for v1. Recommend cutting it.
  - If kept: specify a direct `callApi` with `cache: "no-store"`, never SWR or a hook cache; hide on window `visibilitychange`/`blur` and on any route or tab change; no copy-to-clipboard; `autocomplete="off"` and `type=password`-style masking while typing; and confirm backend audit logging of `ssn/expose` with the backend team.

### H2. "Primary" for contact points is modelled two incompatible ways
- **Where:**
  - prd.md L111–114 (Glossary): Primary is presented as separate from Contact Label, while the label list includes "Primary".
  - L283–288, L311–316, and UJ-1 step 5 (L66).
  - addendum.md L29–35, where `primary`/`validated` is described as a request field "(addresses)".
- **Problem:**
  - For contact points, primary appears to *be* the label `Primary` (research: "label: Primary", "Primary not selectable for new rows"). The glossary reads as if it were a flag.
  - One dev builds a "Make primary" toggle. Another builds a label dropdown that includes Primary.
  - Nothing says what label the **demoted** primary receives at switch time. The platform needs one in the same request. UJ-1 has the user relabel it "Old" *afterwards*, which may be impossible if the request is rejected.
- **Fix:**
  - State it plainly: for contact points, Primary is the label `Primary`. It is excluded from the label picker and set only through "Make primary".
  - Define the demoted label: default `Old`, or prompt inside the confirm dialog.
  - Make the switch one `contactPointsToUpdate` request.

### H3. The notification setting scope contradicts itself
- **Where:** FR-15 L267 (indicator on every entry), FR-16 L273 (any saved phone's "notification setting" can be changed), FR-19 L291 ("for the Primary phone"), FR-23.
- **Fix:** Pick one. Parity is "bell only on Primary row" (research). State that non-primary rows show no toggle, and say what happens to `isNotificationEnabled` on demotion.

### H4. Keyboard-only users cannot complete the signature flow, which contradicts NFR-2
- **Where:** FR-14 L256–257 (no typed alternative) vs NFR-2 L414 ("keyboard-only use of every flow").
- **Problem:** UJ-3 cannot be done by keyboard or screen-reader users, and the PRD contradicts itself. For providers, the signature is a job requirement.
- **Fix:** Either add a typed signature rendered to PNG through a script font, or an uploaded image (cheap, since the upload path already exists), or record a WCAG exception with a named approver. Don't leave an `[ASSUMPTION]` in conflict with an NFR.

### H5. The 16-day timeline is not credible for this scope
- **Where:** prd.md L10 (release 2026-10-29), status `draft` (L3).
- **Problem:** As of 10-13:
  - There is no UX spec, no architecture, and no epics.
  - The repo has **no test framework**, and `ignoreBuildErrors` hides type errors (`next.config.mjs`).
  - The Places API key decision is open (addendum L48).
  - Production registration and a 1health-fe release are dependencies in another repo, on another release train.
  - 32 FRs, including Insurance, which is a full CRUD drawer with uploads.
  - New non-parity features (Save all, drafts, SSN reveal, insurance demotion offer, deep-linkable tabs, verify-resend inside the primary flow) each add a week of edge cases.
- **Fix:** Publish a cut line now.
  - **Must ship 10-29:** FR-1–4, 6–7 (basic), 9–12, 14–18, 20–22, 24–29 (no demote offer), 30–32.
  - **Defer:** FR-5 Save all, FR-2 draft restore, FR-13 reveal, FR-29 demote offer.
  - **Dates:** feature freeze 10-22 and demo QA 10-22 to 10-27. If demo QA slips past 10-24, the cutover is no-go and the sidebar stays on `/profile`.

### H6. Embedding model, cookies and Safari: the PRD never says iframe or new tab
- **Where:** FR-1 L136–141, FR-6 L179, UJ-5 L104; `route.tsx` L53 `sameSite: "none"`, which implies a cross-site iframe.
- **Problem:**
  - If the portal iframes the app, Safari ITP and Firefox ETP block third-party cookies. The whole auth model then fails on Safari and iOS Safari, which NFR-7 requires.
  - "Return to 1health" and `beforeunload` (FR-6) behave differently in an iframe than in a tab.
  - The PRD never states which model applies.
- **Fix:** State the launch model in §6. If it's an iframe, require a cookie-less token strategy (memory plus a partitioned `CHIPS` cookie, or `postMessage` handoff) and add Safari to the demo QA matrix as a blocker.

### H7. Environment detection and the launch payload in the URL
- **Where:** FR-1 L141; `app/auth/page.tsx` L29–33 (referrer sniffing), the `searchParams.get("lpl")` handling, and the manual-entry state; `route.tsx` L157 (`environment` defaults to `"demo"`).
- **Problem:**
  - A `Referrer-Policy: no-referrer` on the portal, or a portal-domain change, drops patients onto a raw "choose Demo/Production" screen.
  - A prod patient who picks Demo gets a confusing failure.
  - The launch payload sits in the query string, so it stays in browser history and host access logs.
  - The manual-LPL entry screen ships in production.
- **Fix:**
  - Register separate launch URLs per environment (`/auth?env=prod`) and stop relying on the referrer.
  - Remove the manual chooser and LPL entry from prod builds.
  - Call `history.replaceState` to strip `lpl` right after reading it.
  - Make the payload single-use, matching FR-1's "already-used" wording, and confirm that with the backend.

### H8. Address autocomplete sends a patient's home address to Google, and the key strategy is undecided
- **Where:** FR-26 L349; addendum.md L48.
- **Problem:**
  - Patients' typed home addresses go to a third party. The PRD has no BAA or privacy-review note, and the key is either exposed (referrer-restricted) or needs a proxy route (new server code).
  - If the key or quota fails, can the user still save? FR-26 doesn't say whether suggestions are optional.
- **Fix:**
  - Make it explicit: suggestions are an enhancement; manual entry always works and is saved with `validated=false`.
  - Decide proxy vs referrer-restricted key by 10-16.
  - Get a compliance OK on sending typed addresses to Google, as the legacy app already does, and record it.

### H9. Many FRs are untestable as written, and there is no test harness
- **Where and problem:**
  - FR-1 "within one page load" (L139) is not measurable.
  - FR-7 "where possible" (L185) has no error-code → message table.
  - NFR-4 "typical broadband" (L417) has no throttling profile.
  - NFR-2 names no audit method.
  - FR-32 "describes what will appear" (L405), but the content is undefined.
  - SM-2's 98% and SM-C1 need telemetry, yet NFR-1 bans PHI in analytics and no analytics or error-monitoring stack is named. SM-3 needs a support-ticket baseline that nobody owns.
  - CLAUDE.md: no test framework.
- **Fix:**
  - Add an error-code mapping table in the addendum. It must cover at least `SOCIAL_SECURITY_NUMBER_EXISTS`, primary-not-verified, max-20, duplicate, email-in-use, and generic 4xx/5xx.
  - Define NFR-4 as Lighthouse with "Fast 4G" throttling, LCP ≤ 2.5 s on `/` after launch.
  - Name an axe-core automated pass plus a manual keyboard and VoiceOver/NVDA script per UJ.
  - Name a PHI-free telemetry tool (event names plus section ids only) and an error monitor.
  - Add Playwright and Vitest to the plan as a story.

### H10. Save all across tabs contradicts FR-3
- **Where:** FR-3 L155 (switching a tab with unsaved changes forces keep, discard or save) vs FR-5 L169 ("Save all (N)" page-level).
- **Problem:** If the user can't leave a tab dirty, Save all only ever covers the current tab, so is it page-level or tab-level? If they *can* leave it dirty, "focus the first invalid field" (L170) may point into a hidden tab.
- **Fix:** Pick one. Recommend: dirty state may span tabs, the tab-switch prompt is removed, tabs show a dirty dot, and Save all switches to the tab of the first invalid field before focusing it.

### H11. Silent session death on long edits: the refresh token lifetime is 2x the access token
- **Where:** FR-2 L146; `route.tsx` ~L271–282 (`refreshTokenMaxAge = accessTokenMaxAge * 2`); commit `5f2cc89` (30-minute refresh).
- **Problem:**
  - Expiry is set by the template, not the platform. A user filling the insurance drawer while away from the keyboard past the cookie lifetime loses the session.
  - With C1 cut, they lose their work, and the PRD's promise of keeping them "alive while active" is not defined. Does typing count as activity?
- **Fix:**
  - Define activity: any input event triggers a proactive refresh when within 5 min of expiry.
  - Align the refresh cookie max-age with the platform's refresh-token lifetime rather than 2x access.
  - Show a "session expires in 2 min" warning (also needed for WCAG 2.2.1).

---

## Medium

### M1. The `"n/a"` sentinel and defaults confuse dirty detection
- **Where:** FR-12 L234, L238; addendum.md L13.
- **Problem:** On read, is `"n/a"` shown as "Not provided"? Does the "Unknown" default for race/ethnicity count as a change on first edit, so it is sent? Two devs will differ, and one will send "Unknown" without the user touching it. A user who literally types "n/a" as sexual orientation clears it.
- **Fix:** Specify: read `"n/a"`/null → "Not provided"; defaults are display-only and are sent only if the user saves the section; reject the literal "n/a" as input.

### M2. Birth date is required, so users without a DOB can't edit their name
- **Where:** FR-12 L232.
- **Fix:** Say whether the requirement applies only when the field is touched, or whether such users must add a DOB to save anything.

### M3. The source of the Proctor role is unspecified
- **Where:** FR-12 L232.
- **Fix:** Specify `/v2/user/myself.roles` and the exact role key, and say whether a multi-role user gets 21+.

### M4. Two read sources for the same data
- **Where:** addendum.md L11–13.
- **Problem:** Addendum A offers "`/v2/user/myself` *or* GraphQL `Person`" for the fields and masked SSN, and GraphQL for the picture id. The repo's API layer has no GraphQL client, and patient GraphQL permissions are unverified. research-api-docs says the preview works without an id.
- **Fix:** Use `/v2/user/myself` only. Use `preview?v=<timestamp>` for the avatar cache-bust. For the old-file delete, take the id from the upload response chain, or confirm GraphQL patient access on demo first.

### M5. Social link "edit" conflicts with the non-goal
- **Where:** FR-24 L326 (add, **edit**, remove) vs §7 L432 (no in-place value change) and addendum B L28.
- **Fix:** State whether a saved social URL is editable (update vs remove+add), and confirm the backend allows zero social links (L331) before promising it.

### M6. Option lists have fallbacks only for race and ethnicity
- **Where:** addendum.md L14, L18, L41–43.
- **Problem:** If `/type/key/ContactPoint` or `/type/key/Insurance` fails, Phone, Email or Insurance can't be edited. NFR-5 says one failure must never block the others, but here it blocks the whole section. The label lists also disagree: research lists Mailing List, Main Work and others, while addendum B lists 6 labels.
- **Fix:** Add fallback lists for all three, and an explicit allow-list filter on labels shown for phone and email.

### M7. "Badge updates on next refresh" won't satisfy UJ-1
- **Where:** FR-17 L281 vs UJ-1 L64–65.
- **Problem:** Maria taps the SMS link (another app or tab), returns, and still sees Unverified.
- **Fix:** Refetch contact points on `visibilitychange` to visible and on window focus. Also confirm that phone verification is actually SMS: research says the verification link is emailed and OTP is an alternative.

### M8. The insurance save chain is non-atomic
- **Where:** FR-29; addendum.md L24.
- **Problem:** The policy POST succeeds, then the front-card upload fails, leaving a policy with no images. A retry re-POSTs and creates a duplicate.
- **Fix:** After a successful POST, switch the drawer into "edit existing id" mode so a retry only re-uploads the cards. Show per-image error and retry.

### M9. FR-30 shows deleted policies
- **Where:** FR-30 L392 and Open Question 2.
- **Problem:** Showing "Deleted" policies keeps stale PHI in view and confuses the "one Primary per type" check: do deleted policies count?
- **Fix:** Exclude Deleted from the primary-uniqueness check, and collapse deleted policies under a "Show deleted" toggle.

### M10. Toasts are the only save-result feedback
- **Where:** FR-5 L174, FR-7 L184.
- **Problem:** Auto-dismissing toasts fail WCAG 2.2.1 and 4.1.3 for errors.
- **Fix:** Use `aria-live="polite"` for success. Errors persist inline in the section with `role="alert"`, and the toast is supplementary.

### M11. SSN auto-hide and screen readers
- **Where:** FR-13 L247.
- **Problem:** The 30 s auto-hide is a timing limit (WCAG 2.2.1), and a screen-reader user may still be listening.
- **Fix:** Announce "SSN hidden". Hide on explicit action plus visibility change, and treat 30 s as the minimum with the option to reveal again.

### M12. Custom pickers need specified ARIA patterns
- **Where:** addendum.md L52; FR-29 L378.
- **Problem:** The custom phone country picker and the insurer async search combobox are hand-built. Card thumbnails need alt text, and Verified/Primary badges must not be color-only.
- **Fix:** Name the APG combobox pattern and a test per widget. Badges carry text plus an icon.

### M13. Leave protection is unreliable
- **Where:** FR-6 L179.
- **Problem:** `beforeunload` is unreliable on iOS Safari and when the portal closes or navigates the frame.
- **Fix:** Acknowledge best-effort on iOS. This is another reason to keep sections small or save per section.

### M14. No error monitoring or production observability requirement
- **Where:** §5.
- **Problem:** With Save all partial failures and a new external-app pattern, production breakage will be invisible.
- **Fix:** Add NFR-8: client error monitoring with PHI scrubbing (no request bodies, no URL query strings), plus alerting on save-failure rate.

---

## Low

### L1. The release label is confusing
- **Where:** L10.
- **Problem:** "2026.07.01 Conduit, 2026-10-29" mixes a July-looking version with an October date.
- **Fix:** Clarify the release-train name.

### L2. The Profile Picture is uploaded with `isPublic=true`
- **Where:** addendum.md L12.
- **Problem:** A patient photo becomes publicly reachable. This is parity, but it is identifying data.
- **Fix:** Record it as an accepted risk, or switch to `false` since the preview is fetched with auth anyway.

### L3. A failed old-avatar delete leaves orphan files
- **Where:** FR-10 L210.
- **Problem:** If deleting the old avatar fails, orphan files accumulate. There is also no "remove picture" action (parity, but users will ask).
- **Fix:** Treat delete failure as non-blocking but logged.

### L4. The Medical tab ships as an empty "Coming soon" in production
- **Where:** FR-32.
- **Problem:** It describes content that isn't defined.
- **Fix:** Either hide the tab until Epic 2 or give the PM a deadline for the copy.

### L5. Single owner for all release dependencies
- **Where:** §6 L424–425.
- **Problem:** Registration and cutover both depend on one person (bus factor).
- **Fix:** Add a backup owner.

### L6. Dark-theme toggle source is unspecified
- **Where:** NFR-3 L415.
- **Problem:** "Dark theme supported" with no toggle source: the portal, the OS, or the app?
- **Fix:** Specify `prefers-color-scheme`, or a launch-payload hint.

### L7. Large lists are fetched in one page
- **Where:** addendum.md L21, L23.
- **Problem:** Addresses and insurance are fetched with `size=100` in a single page and not paged. The behaviour if there are more than 100 is unstated.
- **Fix:** State the cap, or page through results.

---

## Suggested order of fixes
1. Cut scope (H5): Save all, draft restore, SSN reveal and the demote offer move to after 10-29. This alone removes most of C1, C3 and H1.
2. Security baseline (C2, C5, H7): remove logging in prod, add a CSP, drop SVG, strip `lpl` from the URL, and remove the manual chooser.
3. Rollout (C4, H6): a runtime sidebar flag, registered roles verified in prod, the embedding model stated, and Safari in QA.
4. Resolve the ambiguities (H2, H3, H10, M1, M5) in the PRD before writing epics.
