---
title: 'Adversarial + reality-check review: Profile-module delta to ARCHITECTURE-SPINE'
target: ../ARCHITECTURE-SPINE.md (delta vs ../.ARCHITECTURE-SPINE.pre-profile.bak)
scope: 'AD-22, AD-23 and the Profile amendments to AD-2, 4, 5, 6, 7, 8, 9, 10, 12, 13, 15'
date: 2026-10-13
lenses: ['reality check (evidence in backend, 1health-fe, Next 16.4.0)', 'adversary (compatible-by-the-letter units that still clash)']
verdict: 'Revise before stories: 5 High, 10 Medium, 6 Low'
---

# Review: Profile module delta (AD-22, AD-23 and amendments)

## Verdict

**Revise before stories.** Most of the upstream contract is accurate. I checked the MFA paths, NPI params, org-list params, time-zone/locale, `Tenant IDs` and `?ctx` against source. Three committed decisions fail in reality, though:
- **Logos through `file/{id}/download`.** The download is scoped to the session tenant, and logo files live in the organization's tenant.
- **A session-requiring `/handoff/portal` opened in a new tab from the iframe.** The `Partitioned` cookie isn't there.
- **The framed new-tab hand-off.** The popup inherits the portal's iframe sandbox.

Two cross-unit holes would also let compliant stories build incompatibly:
- two owners of name and birth date
- per-page draft purge on exit

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 5 |
| Medium | 10 |
| Low | 6 |

---

## Lens 1: Reality check

### Confirmed against source (no action)

| Spine claim | Evidence |
|---|---|
| `POST v2/mfa/enable/totp`, `POST v2/mfa/validate?code=`, `POST v2/mfa/disable/totp` exist; admin variants are `enable/{userId}`, `disable/{userId}`, `GET validate/{userId}` | `bo-core/.../v2/rest/MfaResource.java:55-101` |
| All five self MFA endpoints are Patient functionality (also Proctor) | `bo-core/src/main/resources/access-control.json:10-28` |
| `public/npi/list` params `entityTypeCode` (default 1), `searchText`, `page`, `limit` (default 10) | `OneHealthPublicResource.java:77-85` |
| `health/npi/{npi-id}/is-registered` takes the db id | `OneHealthResource.java:199-203` |
| `user/organization/portal` params `name`, `page` (0-based), `size` (default 50, no server max, so the proxy cap of 12 is the only limit) | `UserResource.java:214-222` |
| `tenant/sys-config` param is literally `"Tenant IDs"`, `Set<Long>` (comma-separated), `isAuthenticated()` | `TenantResource.java:1053-1068` |
| `user/time-zone?timeZone=`, `user/locale?locale=` are `isAuthenticated()` POSTs with query params | `UserResource.java:426-442` |
| `user/npi`, `user/register/npi` paths | `UserResource.java:444-454` |
| `GET v2/file/{fileInstanceId}/download` is Patient functionality | `access-control.json:243-245`; `FileResource.java:35-47` |
| `?ctx=<tenantId>` is a real 1health-fe mechanism (NG-8055): it drains into per-tab sessionStorage before any authed call | `1health-fe/src/utils/navigation/tenantContext.ts`, `src/App.tsx:50-52` |
| Next 16 route handlers can answer 303 (`NextResponse.redirect` accepts 301/302/303/307/308) | `node_modules/next/dist/server/web/spec-extension/response.js:94-106` (16.4.0) |
| Both the contact-point manage path and `user/edit` sync the login email through Feign, so the two Primary-switch paths have the same side effect | `ContactPointServiceImpl.java:136-152`; research-backend §1.3 |

### R1 [High] Organization logos via `file/{id}/download` will almost certainly 400 for every organization (AD-13 / AM-5)
- **Evidence:**
  - `FileResource.getFileBusinessObjectInstanceContentById` → `FileServiceImpl.downloadFileBusinessObjectContent:871-888` takes `tenantId = AuthContextTemplate.getSecurityContextTenantId()`. For this app that is always the default tenant `1` (AD-6).
  - `getFileContent` → `FileRepository.findOneWithLatestCurrentVersionById(id, tenantId)` → `QueryRequest.fetchData(ctx, tenantId)`, which is a tenant-scoped query (`QueryRequestImpl.java:86-90`).
  - Tenant config files are created in the organization's own tenant: `fileService.createFileInstance(path, name, true, List.of(tenantId), true, tenantId)` (`TenantServiceImpl.java:~1160`). The sys-config list itself is read with `fetchDataAllTenants`, which is why `tenantLogo.id` is visible at all.
  - A tenant-1 lookup of a tenant-X file ends in `BadRequestException(INFER_TYPE_FILE_SPLITTER_FILE_DOESNT_EXIST)` → **400**.
  - **Result:** every card renders initials, which silently loses parity for parity-checklist row 10 ("logo fallback" turns into "no logos"). It also costs 12 failing upstream calls per page.
- **Second defect:** even when the call succeeds, `preview=false` (the default) makes upstream send `Content-Type: application/octet-stream` + `attachment`. AD-13 serves `inline` only for a declared `image/*`. The spine never says the logo or signature entries fix `preview=true` or sniff the type. The same applies to the Provider-tab Signature, which is a tenant-1 file and works otherwise.
- **The spine lists this as an Open Question, but AD-13 commits to it as the rendering path.** The fallback isn't designed.
- **Fix (AD-13):**
  - Choose the AM-5 alternative now. `tenantLogo.publicUrl` is an S3 public-object URL (`FileServiceImpl.java:562-569`, `amazonS3.utilities().getUrl`), and its host is fixed per environment.
  - Either add `PUBLIC_FILES_ORIGIN` to `lib/server/env.ts` and to `img-src` (AD-21), rendering `publicUrl` only when its origin equals that constant (otherwise initials).
  - Or add a named op `GET /api/pp/org-logo/{tenantId}` that streams `publicUrl` server-side under the same host check.
  - For the remaining `file/{id}/download` entries, fix `preview=true` server-side in the allowlist (AD-2 "security-relevant values are fixed server-side").

### R2 [High] `/handoff/portal` "requires a session", but in the framed case it is opened in a new top-level tab where the `Partitioned` session cookie does not exist (AD-22 × AD-1 × AD-5)
- AD-1 sets `__Host-pp_s` with `Partitioned`. When the app runs in the portal iframe, the cookie is keyed to the portal's top-level site.
- AD-22 makes the framed hand-off `target=_blank`, so the request to `/handoff/portal` is a top-level navigation on the app's own site. That is a different CHIPS partition, so no cookie is sent and `requireSession()` fails.
- AD-4 then says "a request with no session and no `lpl` shows the launch-error screen."
- So **FR-120 and FR-116's "Register your practice" fail 100% in the embedded host**, which is exactly the case AD-22 was written for (SM-104).
- **Fix (AD-22):** the route returns no PHI and its output is built only from env constants plus a validated numeric id, so a session adds nothing.
  - Drop the session requirement and keep the enum and regex validation.
  - Or, better, remove the route: have `app/account/page.tsx` (server) build the hrefs with a `lib/server/portal-links.ts` helper and pass them as props. That keeps "client never reads portal config" and needs no cookie.
  - Add a Playwright case that runs in the framed host with partitioned cookies on.

### R3 [High] The framed new-tab hand-off opens a **sandboxed** portal tab (AD-5, AD-22)
- 1health-fe `ExternalAppFrame.tsx:25`: `IFRAME_SANDBOX = "allow-scripts allow-forms allow-popups allow-same-origin"`. There is no `allow-popups-to-escape-sandbox`.
- Per the HTML sandbox rules, a popup opened from this frame **inherits the sandbox flags**. The portal tab opened by "Enter portal" runs without `allow-modals` (alert/confirm/print are blocked), without `allow-downloads` (result reports and file downloads are blocked) and without `allow-top-navigation-by-user-activation`.
- The same applies to the existing launch-error "Open in a new tab" (AD-5).
- SM-104 ("opens the right tenant") would pass while the portal tab is quietly broken.
- **Fix (AD-5/AD-22 + dependency):** pick one and record it.
  - (a) 1health-fe adds `allow-popups-to-escape-sandbox` to `IFRAME_SANDBOX`. This is a portal change; add it to Open Questions with an owner and date.
  - (b) When framed, the app `postMessage`s `{type:"pp:handoff", to, tenantId}` to `PORTAL_ORIGIN`, and the portal navigates itself. AD-5 already constrains `postMessage`.
  - Until then, the framed hand-off is not parity-safe.

### R4 [Medium] The MFA denylist syntax can deny the endpoints the feature needs (AD-2 / AM-6)
- `v2/mfa/enable` and `v2/mfa/disable` are written without `**`, but the neighbouring denies (`/auth/**`, `v2/user/switch-tenant/**`) are prefix globs. A matcher that treats denies as prefixes blocks `v2/mfa/enable/totp` and `v2/mfa/disable/totp`.
- `v2/mfa/*/{userId}`: AD-2 gives `{userId}` a special meaning in **allow** templates (session-filled, client sends `me`). As a deny pattern it is undefined. If it is read as "any segment," it matches `v2/mfa/enable/totp` and `v2/mfa/disable/totp`.
- **Fix (AD-2):** state that deny rules are exact `METHOD + template` matches unless they end in `/**`, and that a numeric-id placeholder in a deny is `^\d{1,19}$`. Add proxy-table test rows:
  - `POST v2/mfa/enable/totp` → allowed
  - `POST v2/mfa/enable` → 403
  - `POST v2/mfa/enable/123` → 403
  - `GET v2/mfa/validate/123` → 403 or 405

### R5 [Medium] The `tenant/sys-config` entry contradicts the addendum and leaks other tenants' contacts (AD-2 / AD-23)
- The addendum calls `tenant/sys-config?Tenant%20IDs=<id>&includeAllRelations=true`. AD-2 says the entry "accepts exactly one numeric `Tenant IDs` value", and unknown params → 400. As written, either the story omits `includeAllRelations` (and loses `personContacts`) or it gets 400.
- The endpoint is `isAuthenticated()` and **does not check membership** (research-backend §3.2; `fetchSysTenantConfigByTenantIdIn` uses `fetchDataAllTenants`). With `includeAllRelations=true` it returns person contacts (names, emails, phones) for **any** tenant id. AD-23's "called only with `practiceNpi.organization.tenantId`" is client discipline, not enforcement, so any XSS or curious client can enumerate.
- **Fix (AD-2/AD-23):**
  - Replace the passthrough with a named op `GET /api/pp/practice-support`.
  - Server-side, it reads `user/npi`, takes `practiceNpi.organization.tenantId`, calls sys-config with `includeAllRelations=true`, and returns only `{supportEmail, supportPhone, supportPhoneRegion}`.
  - Remove `tenant/sys-config` from the allowlist.

### R6 [Low] The `Tenant IDs` param name with a space needs a stated encoding rule (AD-2)
- Spring/Tomcat decode both `%20` and `+` in query names. The risk is on the proxy side: the matcher must compare the **decoded** name and rebuild with `encodeURIComponent` (`Tenant%20IDs`), the same way AD-2 rebuilds paths.
- This becomes moot if R5's named op is adopted. Otherwise, add one sentence plus a test row.

### R7 [Medium] AD-4 "all redirects are relative" is incompatible with `NextResponse.redirect` in Next 16.4.0
- `validateURL` does `new URL(String(url))` and throws "Please use only absolute URLs" (`node_modules/next/dist/server/web/utils.js:125-133`).
- `redirect()` from `next/navigation` in a route handler gives 307, not 303.
- The 303 itself is fine. The helper is not.
- **Fix (AD-4):** mandate one helper, `lib/server/http.ts#seeOther(path)`, returning `new Response(null, {status: 303, headers: {Location: path}})` with `path` from the enum builders. AD-22 uses `seeOther(absolutePortalUrl)`. Ban `NextResponse.redirect` in `app/launch/**` and `app/handoff/**` (lint rule).

### R8 [Medium] Error-envelope collision: backend `{message, code:int}` vs proxy `{code:string}` (AD-19, AD-23, Errors convention)
- Backend errors are `{message, code}` with an **integer** `code` (research-backend §0). bo-core maps `IllegalStateException` → **409**. MFA errors arrive as 400 through Feign.
- The proxy uses the same field name `code` for strings, and its own **403** (`NOT_ALLOWED`, `CSRF`) and **409** (`SESSION_CHANGED`).
- Consequences:
  - AD-23: "403 on any of these resources maps to `FORBIDDEN`". A proxy CSRF or allowlist mistake would render "You don't have access to this in your current account", which turns a bug into a permission message.
  - An implementer who branches on status 409 would fire the "opened by another account" dialog on a backend `IllegalStateException`.
  - `MFA_NOT_ENABLED` and "NPI already-registered" have no backend code. They can only come from **message text**, and the spine doesn't say where that matching lives or what the exact strings are.
- **Fix (AD-19):**
  - Proxy-originated errors carry `{code, source:"proxy"}`. `callApi` sets `errorCode` from the proxy only when `typeof code === "string"`.
  - `FORBIDDEN` = status 403 and not a proxy source.
  - `lib/api/errors.ts` owns an exact-message table, which nothing else may match: `"Mfa is not enabled for this user."`, `"Mfa config is missing."`, `"Totp is already enabled."`, and the `PERSONAL_/PRACTICE_NPI_IS_ALREADY_REGISTERED` prefixes from `Messages.java:1299-1302`.

### R9 [Low] "Query strings are never logged" can't be guaranteed by app code (AD-15 / AM-6)
- Vercel's platform request logs record the request URL of `/api/1h/v2/mfa/validate?code=NNNNNN` regardless of the app's logger. The code is single-use and short-lived, so the risk is small, but the spine states it as an invariant.
- **Fix:** expose `POST /api/pp/mfa/validate` with a JSON body `{code}` (regex `^\d{6}$`), and have the server move the code into the upstream query. Or reword AD-15 to "the app never logs query strings; platform logs may".

### R10 [Medium] Page-level invariants enumerate only `app/page.tsx`, so `/account` and `/handoff` are outside them (AD-17, AD-18, AD-21 not amended)
- AD-17: "`app/page.tsx` (server) embeds `sessionBinding`".
- AD-18: `force-dynamic` and the no-store header CI test list `app/api/**`, `app/launch/**`, `app/page.tsx`.
- AD-21: the header test covers `/`, `/launch-error` and one `/api/1h` route.
- The seed comment says `/account` embeds the binding, but the binding ADs don't. A story author following AD-18 to the letter leaves `/account` (PHI: names, DOB, contact points) and `/handoff/*` out of the cache-header test.
- **Fix:** reword these as "every page route and every route handler under `app/`", and add `/account` and `/handoff/portal` to the AD-18 and AD-21 test lists.

### R11 [Low] `?ctx` is plausible but not proven end-to-end for an unauthenticated or new tab (AD-22 Open Question)
- `readAndScrubTenantContextFromUrl` stores `ctx` in **sessionStorage** before auth. Two things are unconfirmed:
  - whether a new tab that must first go through login keeps it, given sessionStorage survives same-tab redirects but the OAuth round-trip may land on a fresh URL
  - whether a `ctx` for a tenant where the user is disabled is rejected gracefully
- Also note that the app must never emit `assume=1`, which the same function honours.
- **Fix:** extend the Open Question to "verify `?ctx` survives the portal login redirect, and the behaviour for disabled tenants". Have AD-22 forbid any param other than `ctx`.

---

## Lens 2: Adversary (units that obey every AD yet build incompatibly)

### A1 [High] `features/personal` (/) × `features/account` (/account): two owners of firstName, lastName and birthDate
- **Both legal:** AD-7 lists `PUT /v2/user/edit` as the first step of both Sections. AD-11 gives each Section its **own** `schema.ts`.
- **Clash:**
  - Story A codes PP's DOB rule. Story B codes FR-105: 18–120, or 21–120 for Proctor; names 1–24 after trim. The same person can save a birth date on one page that the other page then flags as invalid on Edit.
  - Both Sections may draft the same fields under different keys (`…:personal`, `…:account`). A stale `personal` draft restored after an `account` save is caught **only if** `baseHash` covers those fields. AD-12 defines `baseHash` as "the server data the edit started from", so a Section could hash only its own response slice and miss the change.
- **Fix:**
  - AD-11: name and DOB rules live once in `lib/shared/person-rules.ts`, imported by both schemas. Role-dependent minimum age comes from `myself.roles`.
  - AD-12: `baseHash` = hash of exactly the server fields named in that Section's `draftFields`, read from `myself` / contact-point keys.

### A2 [Medium] `features/account` × `features/email` / `features/phone`: contact-point cache-key collision and missed invalidation
- **Both legal:**
  - AD-10 shows per-type keys `["pp","contact-points","Email"]`.
  - The addendum fetches `contact-point/list?type=Email&type=Mobile&type=Landline` in one call.
  - AD-10 says an Account save "mutates … the contact-point keys" without saying which.
- **Clash:**
  - Story B invents `["pp","contact-points","Email|Mobile|Landline"]`. Saves on `/` never invalidate it.
  - Story B's `mutate` of the per-type keys doesn't refresh its own combined key, so the Primary picker shows the old Primary after a successful switch.
  - Whether the SWR cache is shared across pages depends on A5.
- **Fix (AD-10):** `lib/api/keys.ts` exposes only `contactPoints(type)`. Multi-type reads compose the per-type keys (three requests). An Account save mutates `contactPoints("Email" | "Mobile" | "Landline")` and `myself`.

### A3 [High] The per-page registry makes the exit draft purge per-page, which leaves PHI drafts on shared devices (AD-7 × AD-12 × AD-19)
- **Both legal:**
  - AD-7 (AM-2): "dirty count, leave guard and drafts are scoped to the page."
  - AD-12: drafts are deleted "on app-bar Return to 1health", and "Drafts are written by the registry only".
  - AD-19: session-changed clears "the registry".
- **Clash:**
  - A user edits Addresses on `/`. The session expires (the draft is kept, by design). They relaunch with `view=account` and click Return to 1health on `/account`. The `/account` registry purges only `…:account`, so `pp:draft:v1:<userId>:addresses` (home address) stays in localStorage for 24 h on a shared device.
  - On session-changed, the page that sees the 409 clears only its own registry.
- **Fix (AD-12):** the exit purge and session-changed purge are **user-wide**, deleting `pp:draft:v1:<userId>:*`. They are run by `features/shell` through a `drafts.purgeUser(userId)` helper, not by the page registry. Registries own only write and restore.

### A4 [Medium] Hand-off × leave guard × drafts × session lifetime (AD-22 × AD-7 × AD-12 × AD-16)
- **Both legal:**
  - AD-22: "the link navigates the tab after the leave guard."
  - The leave guard is the registry's.
  - Hand-off is an `<a href="/handoff/portal…">`, a full document navigation to a route handler.
- **Clash:**
  - A plain anchor bypasses any in-app confirm. Only the native `beforeunload` prompt can fire, and that isn't EXPERIENCE's three-way dialog.
  - Story O (organizations) wires the anchor. Story S (shell) assumes all exits go through `shell.leave()`.
  - The spine doesn't say whether hand-off **keeps** drafts (like session-expired) or **deletes** them (like Return to 1health).
  - It doesn't say whether the session is logged out. Unlike Return to 1health (AD-16, logout + revoke), hand-off leaves a live refresh token in the cookie for up to 8 h while the user works in the portal.
- **Fix (AD-22):** "Every portal hand-off and Return-to-1health goes through `shell.leaveTo(kind, href)`. It runs the leave guard and applies the draft rule for `kind`:
  - hand-off: delete drafts, call `POST /api/session/logout`, then navigate (top level) or open (framed)."

### A5 [Medium] `/` ↔ `/account` navigation is unspecified (soft vs hard) and decides guards and cache sharing (AD-7, AD-10)
- **Both legal:** the FR-107 helper link "personal profile → Contacts" and FR-116's "Personal Profile → Personal Information" link can each be `next/link`, which is a soft navigation.
- **Clash:**
  - App Router has no route-change blocking API. A soft nav unmounts `/`'s registry with **no** leave guard, and the dirty edits are lost.
  - The SWR cache survives (A2 matters). The `sessionBinding` prop is re-read per page.
  - With a hard nav, the guard is `beforeunload` only.
- **Fix (AD-7):** cross-page links are rendered by `features/shell` as `<ShellLink page="/account" tab=…>`. It runs the in-app guard, then does a hard navigation (`location.assign`). `next/link` between `/` and `/account` is banned by a lint rule.

### A6 [Medium] `features/mfa` × `callApi` replay or React StrictMode: "once per dialog open" is not enforceable as written (AD-23 × AD-16 × AD-19)
- **Both legal:**
  - Story M fires `POST mfa/enable/totp` in a `useEffect` on dialog mount.
  - Story T's `callApi` replays after refresh, and its error UI offers Retry on 504 or 503.
- **Clash:**
  - React 19 dev StrictMode double-invokes effects, so two calls rotate the secret twice. If the responses resolve out of order, the dialog shows the **first** QR, whose secret is already dead. Every code then returns `false`, which reads to the user as "Invalid code".
  - On a 504 the upstream may have rotated anyway.
- **Fix (AD-23):**
  - `enable/totp` is called from the tile **click handler**, not an effect.
  - It is single-flighted per dialog instance (an `AbortController` plus a request sequence number), and the dialog renders only the QR from the latest request.
  - AD-19: `callApi` replays a non-GET only after a proxy-originated `TOKEN_EXPIRED` (which guarantees the request never reached upstream). Never after a 5xx or a timeout.

### A7 [Medium] `features/provider` × `features/organizations`: two views of one entity (the practice organization's tenant) with no shared key or membership source (AD-10, AD-23)
- **Both legal:**
  - Provider needs the practice tenant's support contact (sys-config) and "is the user a member?" (FR-116).
  - Organizations already holds the same `SysTenantConfigResponseDTO` (support fields, logo) in `["pp","orgs",name,page]`.
  - AD-10 declares no key for sys-config, and AD-23 doesn't say where membership comes from.
- **Clash:**
  - Story P decides membership by scanning the paged and search-filtered org list. It gets the wrong answer when the org is on page 2, or when a search is active in the other tab's cache.
  - Story P keys sys-config ad hoc, for example `["sys-config",id]`, outside the `pp` namespace that session-changed clears.
- **Fix (AD-10/AD-23):** membership = `myself.tenants.some(t => t.id === tenantId)` only. Support data comes through R5's named op under key `["pp","practice-support"]`. Every key starts with `"pp"` (enforced in `keys.ts`).

### A8 [Low] 403 no-access ownership: tab panel vs card vs Section (AD-23 × AD-7)
- "Renders the no-access panel for that tab or card" leaves the choice to each implementer.
- On the Personal tab, `myself` (isAuthenticated) loads, but `contact-point/list` (Patient fn) 403s. The shell author renders a tab-level panel. The account author renders the Section with disabled pickers. Both read AD-23 correctly.
- **Fix:** add a resource → owner table to AD-23:
  - `contact-point/list` 403 → Account Section pickers only
  - `mfa/*` 403 → MFA card
  - `user/npi` 403 → Provider tab
  - `organization/portal` 403 → Organizations tab

### A9 [Low] The org-list filter for `organization != null` breaks the page math (AD-23)
- The addendum says "keep items with `organization != null`". `totalElements` and `totalPages` still count the dropped items, so a page can show fewer than 12 cards. The empty-state rule `totalElements === 0` can also be false while zero cards render.
- **Fix:** AD-23 states that the empty state = no renderable items on page 0 with no search text, and the pager uses the server's `totalPages` as is.

### A10 [Low] Id-namespace overlap: `/account` tab `personal` vs `/` Section `personal` (AD-7)
- AD-7 makes Section ids the URL hash, draft key and telemetry id. `/account?tab=personal` shares the token `personal` with the `/` Section. A generic shell helper that resolves `tab=personal` or `#personal` across pages (for example the FR-116 link to "Personal Profile → Personal Information") can land on the wrong page.
- **Fix:** keep tab ids and Section ids in separate typed enums per page (`ProfileTab`, `AccountTab`, `SectionId`), and build cross-page links only through A5's `ShellLink`.

---

## Top 5

1. **R2 (High):** `/handoff/portal` requires a session, but the framed new tab has no `Partitioned` cookie, so hand-off fails 100% when embedded. Fix in AD-22: render the hrefs server-side in `app/account/page.tsx`, or drop the session requirement.
2. **R1 (High):** logo `file/{id}/download` runs in the default-tenant context, while logo files live in the org tenant, so it returns 400 and every card shows initials. Fix in AD-13: render `publicUrl` against a per-environment `PUBLIC_FILES_ORIGIN` in `img-src`, or use a named op with a host check. Also fix `preview=true` server-side for the signature.
3. **R3 (High):** the framed `_blank` hand-off inherits the portal iframe sandbox (no `allow-popups-to-escape-sandbox`), so the portal tab can't download files or show alert/confirm dialogs. Fix in AD-5/AD-22: either 1health-fe adds the flag (new Open Question with owner and date), or the app hands off via `postMessage` and the portal navigates itself.
4. **A3 (High):** with per-page registries, the exit and session-changed draft purge only covers the current page, so PHI drafts from `/` survive an exit from `/account`. Fix in AD-12: purge `pp:draft:v1:<userId>:*` user-wide through a shell `drafts.purgeUser`, not through the registry.
5. **A1 (High):** `features/personal` and `features/account` both own name and DOB through per-Section zod schemas, so the rules diverge, and `baseHash` may not cover the shared fields. Fix in AD-11/AD-12: put the rules in shared `lib/shared/person-rules.ts`, and define `baseHash` over the `draftFields` server values.
