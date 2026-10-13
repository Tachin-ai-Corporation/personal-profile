---
title: 'Rubric review: ARCHITECTURE-SPINE.md (Personal Profile, NG-9019)'
reviewed: ../ARCHITECTURE-SPINE.md
date: 2026-10-13
lens: good-spine checklist (divergence coverage, enforceable rules, safe deferrals, verified tech, brownfield ratification, PRD/UX coverage, operational envelope)
severity: impact on downstream builders (epics/stories built by independent devs and agents)
---

# Rubric review: Architecture Spine, Personal Profile

## Verdict

The spine is well shaped. The paradigm is clear, most ADs name a real divergence and give an enforceable rule, and the named library versions all check out. It is **not build-ready yet**:
- one hosting decision breaks two FRs outright (Vercel's 4.5 MB request-body limit);
- the BFF has no CSRF defense;
- server-side refresh relies on an in-memory lock that serverless can't honor;
- drafts as specified can't deliver UJ-5;
- several identifiers contradict the UX spine and the portal: launch URL, hash anchors, framed navigation;
- the operational envelope is mostly undecided.

**Counts:** Critical 1 · High 8 · Medium 11 · Low 8

## Checklist summary

| Criterion | Result |
|---|---|
| Fixes the real divergence points | Mostly. Misses: CSRF, error-code contract, the session-expiry signal on writes, intra-Section multi-request saves, and the split between save order and display order. |
| Every Rule enforceable and prevents its divergence | Mostly. AD-2's single-flight lock can't be enforced on serverless. AD-7 hash ids contradict EXPERIENCE. AD-12's "delete on Return to 1health" defeats its own purpose. |
| Nothing under Deferred lets units diverge | Mostly safe. The telemetry sink has no single emitter module named, and the monitoring deferral leaves the go/no-go window blind. |
| Named tech verified-current | Yes, verified on npm 2026-10-13: zod 4.6.7, react-hook-form 7.90.0, @hookform/resolvers 5.9.1 (peer `zod ^3.25 \|\| ^4`), libphonenumber-js 1.13.15 and signature_pad 5.1.4 are each the current latest. react-signature-canvas is still `1.1.0-alpha.2`. Next 14.2.35 is the last 14.x release; latest is 16.4.0. Two caveats: the platform limits of the chosen host (Vercel) weren't checked against the FRs, and Next 14's support status isn't stated. |
| Ratifies the brownfield codebase | Partly. The spine reworks auth deliberately (as the addendum asks). There is no keep/replace/delete map for `app/auth`, `app/api/token`, `contexts/*`, `hooks/use-session-expired.ts`, `components/home-page-client.tsx`, `components/settings-page.tsx`, the workflow engines in `lib/api`, or `next.config.mjs`. The `ApiResponse` error shape can't carry backend codes. |
| Covers PRD FR-1..32, NFR-1..7, addendum | FRs are mapped. NFR-2, 3, 4, 5 and 7 are absent from the capability map. Addendum items with no decision: GraphQL read for the FR-10 picture id, address primary-first PUT order, insurance demotion ordering. |
| Covers the UX spine (EXPERIENCE.md) | Gaps: hash anchors, Signature upload types, Insurance drawer leave guard, session-expired dialog vs draft deletion, deep link `?tab=contacts#signature` through launch. |
| Altitude dimensions decided, deferred or open | Operational envelope is largely missing: domains, secrets store/rotation, CI, preview policy, local-dev launch, PHI hosting compliance, rollback, alerting. |

Verified while reviewing (these strengthen the spine):
- `https://dev.1hdev.io` is the dev API host, used throughout sibling repos.
- `DEFAULT_TENANT_ID = 1` in `1health-fe/src/config/app.config.ts`, so the AD-6 assumption can be closed.
- The portal's `ExternalAppFrame` sandbox is exactly as AD-5 states.
- The portal appends `lpl` as a query param to the registered URL (`externalAppFrameUtils.ts`).

---

## Findings

### Critical

**C1. The Vercel function body limit breaks Profile Picture and insurance card uploads (AD-2, AD-13, Stack: Hosting).**
- **What's wrong:** AD-2 routes every upload through `app/api/1h/[...path]` and AD-13 allows 6 MB Profile Pictures (FR-10) and 10 MB card images (FR-29). Vercel Functions reject request bodies over **4.5 MB** (`413 FUNCTION_PAYLOAD_TOO_LARGE`). Large non-streamed responses hit the same limit.
- **Impact:** every story built to the stated limits fails on real phone photos, and nobody finds out until demo QA. That is 9 days before the 2026-10-29 release, and missing demo QA by 2026-10-24 is a no-go.
- **Fix:** add a rule to AD-13 that the client downscales or re-encodes images to ≤ 4 MB before upload, with the user-facing limits unchanged, and that the proxy streams downloads (no buffering). Otherwise, choose a host with a configurable body limit. Record the limit next to Hosting in the Stack table.

### High

**H1. The BFF has no CSRF defense (AD-1, AD-2).**
- **What's wrong:** session cookies are `SameSite=None`, and the proxy forwards every method and streams `multipart/form-data` unchanged. Multipart and `text/plain` POSTs are "simple" requests: a cross-site top-level form POST to `/api/1h/v2/health/type/Person/{id}/relation/PersonHasSignatureFile/file/upload` carries the cookie. In new-tab mode the CHIPS partition key is the app's own site, so `Partitioned` doesn't block it. The attacker could replace a provider's Signature.
- **Fix:** add to AD-2: for non-GET/HEAD requests the proxy requires `Sec-Fetch-Site: same-origin` (fallback: `Origin` equals the app origin) **and** a custom header such as `X-PP-Client: 1` set only by `callApi`. Otherwise it returns 403. Apply the same rule to `/api/places/*`.

**H2. The refresh single-flight lock can't be enforced on serverless (AD-2).**
- **What's wrong:** "per-session single-flight lock" implies process memory. On Vercel, parallel Section reads (NFR-4: five or more at once on cold load) land on different instances. Near expiry, each one refreshes with the same refresh token, and each response sets different cookies (last write wins). If 1health rotates refresh tokens or detects reuse, the session dies, which is exactly what UJ-5 tries to avoid.
- **Fix:** pick one approach and write it into AD-2.
  - (a) **Client-coordinated refresh.** The proxy never refreshes inline. It returns `401 {code:"TOKEN_EXPIRED"}`. `callApi` single-flights one `POST /api/session/refresh` and replays the queued calls. `SESSION_EXPIRED` is returned only when that refresh fails.
  - (b) A shared session store (opaque session-id cookie, tokens in Redis/KV) with a distributed lock.
- Also confirm 1health's refresh-token rotation behavior and record it.

**H3. Drafts as specified can't deliver UJ-5 (AD-12 vs FR-2, EXPERIENCE "Session expired").**
- **What's wrong:** there are two problems.
  - AD-12 deletes drafts on "Return to 1health", but that is the **only** action in the session-expired dialog. EXPERIENCE says the app-bar Return clears drafts and the session-expired Return keeps them; the spine doesn't distinguish them.
  - `sessionStorage` is per tab. In new-tab mode the portal relaunches with `window.open`, which opens a new tab with empty `sessionStorage`, so the draft is never offered back. It only survives in framed mode, where the iframe reloads in the same top-level tab.
- **Fix:** split the rule. App-bar Return clears drafts; session-expired Return keeps them. Then decide storage. Either:
  - (a) move to `localStorage` with the same user key, 24 h TTL and SSN/Signature exclusion. This is a PRD amendment to FR-2, so record it;
  - (b) or accept that UJ-5 restore only works in framed mode and say so in FR-2.

**H4. The launch URL and route files contradict each other and the codebase (AD-4, Design Paradigm table, Structural Seed).**
- **What's wrong:**
  - AD-4 says "the portal opens `/?lpl=…`", but the exchange lives in `app/launch/route.ts`, and `app/page.tsx` is a session-guard page that never sees `lpl`.
  - The layer table still lists `app/api/token/` as BFF, while the seed tree has no token route.
  - The brownfield `app/auth/page.tsx` replaces spaces with `+` in `lpl`. The spine doesn't say whether that quirk carries over.
- **Impact:** the launch story and the registration story will pick different URLs.
- **Fix:**
  - State that the registered launch URL is `https://<host>/launch` in each environment.
  - Say what `/` does when it gets an `lpl`: a 307 to `/launch` with the query preserved.
  - Delete `app/auth` and `app/api/token` in the same change, and fix the layer table.
  - Keep the `+` normalization.

**H5. Section ids and hash anchors contradict EXPERIENCE.md and break the 1health-fe deep link (AD-7, AD-4).**
- **What's wrong:**
  - AD-7 makes `personal-info|phones|emails|social|addresses` the URL hash anchors. EXPERIENCE fixes `#personal`, `#phone`, `#email`, `#social`, `#addresses`, plus `#signature`, which 1health-fe will link to as `?tab=contacts#signature`.
  - AD-4 always 303s to `/?tab=contacts`, so a deep-link target can't pass through launch.
- **Fix:**
  - Adopt the EXPERIENCE anchors as the hash and keep AD-7 ids as internal registry and draft keys, or rename the ids to match. Either way, publish one table.
  - In AD-4, say the 303 has no fragment so the browser inherits the original one (RFC 9110). Also allow an optional validated `tab` parameter to pass through.

**H6. The session-expired signal never fires on Save (Consistency: Auth/session).**
- **What's wrong:** the only client signal is "a global SWR `onError` handler", but saves are `lib/api` calls, not SWR reads. UJ-5's trigger is clicking **Save**.
- **Fix:** `callApi`/`callApiRaw` publish a `session-expired` event from one module (e.g. `lib/api/session-events.ts`). The shell subscribes, writes drafts, then opens the dialog. SWR `onError` reuses the same event.

**H7. The operational envelope is largely undecided (Stack: Hosting, AD-3, Deferred).**
- **What's missing:**
  - "Vercel: 3 projects or environments" is not a decision.
  - No production hostnames per environment. They are needed for the External Application registration, CSP `frame-ancestors`, cookie scope and the "Return to 1health" target.
  - No secrets store, ownership or rotation for `ONEHEALTH_SECRET_KEY`, `APP_ID`, `GOOGLE_PLACES_KEY` and `DEFAULT_TENANT_ID`.
  - No branch → environment mapping.
  - No preview-deployment policy: which secrets previews get, given their URLs aren't registered.
  - No local-dev launch path now that AD-3 removes the manual chooser and LPL paste.
  - No statement on PHI hosting compliance (a BAA with the host; the proxy transits PHI).
  - No app-side rollback (only the PRD's flag rollback).
- **Fix:** add an AD for deployment and operations that covers each item. For local dev, choose between a registered `localhost` app in dev and a dev-only `/launch/dev` behind `APP_ENV=dev`.

**H8. `ApiResponse` can't carry the backend error codes AD-11 and Errors depend on (brownfield `lib/api/client.ts`).**
- **What's wrong:** `callApi` collapses every failure to `` `${context} failed (${status})` `` and throws the body away. `lib/api/errors.ts` must map `SOCIAL_SECURITY_NUMBER_EXISTS`, `INVALID_ENUM_VALUE`, duplicates and Primary rules, but nothing defines where the code comes from. Each Section dev will add their own field or re-parse.
- **Fix:** extend `ApiResponse<T>` with `code?: string` and `details?: unknown`, keeping the existing fields. `callApi` parses error bodies once. `errors.ts` maps `code` to a message key. Keep the `callApi(context, path, init)` signature, as the addendum requires.

### Medium

**M1. There are two sources of truth for the base URL (AD-1, AD-2 vs AD-3).** AD-1 stores environment and base URL in cookies and AD-2 "resolves the base URL from the session cookie", while AD-3 says environment config comes only from `lib/server/env.ts`. *Fix:* the base URL comes from `env.ts` only. Drop the environment and base-URL cookies.

**M2. AD-5's framed behavior contradicts the portal sandbox.**
- **What's wrong:**
  - `ExternalAppFrame` deliberately withholds `allow-top-navigation`, so "navigate `window.top`" always fails, and the fallback "Close this tab" makes no sense inside a frame.
  - The "Open in a new tab" fallback can't get a fresh `lpl` from inside the frame, and without `allow-popups-to-escape-sandbox` the popup inherits the sandbox.
  - "Cookie blocked" can't be told apart from "no session".
- **Fix:**
  - When framed, hide "Return to 1health" or make it a no-op with a hint, since the portal shell is visible around the app.
  - The fallback opens the portal's Applications page in a new tab.
  - The launch route redirects with a one-time marker, so the guard can show the "cookie blocked" reason.

**M3. Multi-request Section saves have no rule for order, partial failure or retry.**
- **What's wrong:** Addresses use POST, PUT and DELETE per row and must PUT the new Primary first. Personal Information is `PUT /v2/user/edit` plus Signature file operations. Insurance is the policy, then the demoted policy, then images. A naive retry after a partial failure re-POSTs rows that were already created, which the backend rejects as duplicates.
- **Fix:** add a rule to AD-7/AD-8. `save()` runs its steps in a documented order. On any step failure it refetches its keys and rebases the form baseline before returning `{ok:false}`, so a retry sends only the remaining diff. Record the per-Section step order.

**M4. Insurance is outside the registry, so the leave guard ignores it (AD-7 vs FR-6, EXPERIENCE Insurance editor).** "The leave guard talks only to the registry", and Insurance never registers, so a dirty drawer doesn't arm `beforeunload`, tab switch or Return. *Fix:* the registry accepts guard-only participants (`saveAll:false, draftable:false`). Also state that Insurance drafts are out of scope for FR-2.

**M5. Registry `order` conflates display order with save order (AD-7, AD-8).** Display is 01 Personal, 02 Phone, 03 Email. Save order is personal → emails → phones. *Fix:* the save order is a constant in `features/shell` and is not part of a Section's registration. `order` means display only.

**M6. CSP is undecided beyond `frame-ancestors` (AD-5 vs NFR-1).** NFR-1 requires blocking inline scripts. The Next 14 App Router needs a per-request nonce, via middleware, for that. *Fix:* add a rule saying `middleware.ts` owns all security headers, and list the full directive set with the nonce approach.

**M7. Allowlist granularity and path form aren't specified (AD-2).**
- **What's wrong:**
  - Entries are path-only, with no methods.
  - `/api/graphql` (needed for the FR-10 picture id per the addendum) is one path that accepts any query, so allowlisting it bypasses the allowlist.
  - It's ambiguous whether the upstream path includes `/api`: `/api/1h/v2/...` or `/api/1h/api/v2/...`.
- **Fix:** entries are `(METHOD, path template relative to /api)`. GraphQL is allowed only as server-held named queries (or replaced by a REST read). Show one worked example.

**M8. Proxy cache headers for raster images are unspecified (AD-13).** Only non-raster responses get `private, no-store`. Passing upstream headers through "unchanged" could let a shared cache or CDN store card images and avatars. *Fix:* every proxy response gets `Cache-Control: private, no-store`, which overrides the upstream header, and the route is `dynamic = 'force-dynamic'`.

**M9. Signature upload types conflict (AD-13 vs EXPERIENCE).** AD-13 says Signature is PNG. EXPERIENCE's "Upload image instead" accepts PNG or JPEG. *Fix:* align. Either accept both, or convert uploads to PNG on the client before upload.

**M10. There's no brownfield migration map.** Missing:
- `contexts/session-context.tsx` (SWR key `session:user`, against the AD-10 keys);
- `contexts/navigation-context.tsx` (reads `document.cookie` for the base URL, which breaks under HttpOnly);
- `hooks/use-session-expired.ts`;
- `components/home-page-client.tsx` and `settings-page.tsx`;
- the workflow, campaign and other `lib/api` engines the allowlist will block.

*Fix:* add a keep/replace/delete table, plus where the shell's session state lives.

**M11. There are no CI or quality gates.**
- **What's wrong:**
  - No CI is defined and there is no test script.
  - `next.config.mjs` has `typescript.ignoreBuildErrors` and `eslint.ignoreDuringBuilds` set, so builds pass on type errors.
  - Test tool versions are "current at setup".
- **Fix:**
  - On every PR, CI runs `tsc --noEmit`, lint, Vitest and Playwright.
  - Turn both ignore flags off.
  - Pin the test tooling.

### Low

- **L1.** Telemetry has no single emitter module named, and the deferred sink means SM-2 and SM-C1 can't be measured at launch. *Fix:* add `lib/shared/telemetry.ts` with a no-op sink, and decide the sink before cutover.
- **L2.** NFR-2, 3, 4, 5 and 7 are missing from the capability map. *Fix:* add rows (NFR-5 → AD-8 and per-Section SWR keys, NFR-7 → AD-5, and so on).
- **L3.** `userId` and `personId` live only in HttpOnly cookies, but the client needs them (draft key, SSN expose path). *Fix:* state that the client gets them from `myself`.
- **L4.** Monitoring is deferred, but the demo QA go/no-go needs at least alerting on proxy 5xx and refresh failures. *Fix:* set a minimum alert set, and check the host's log retention.
- **L5.** Next 14.2 is past upstream support (latest 16.4.0). *Fix:* give the deferral a date, and write AD-2 so it survives Next 15's async `cookies()` and the uncached-GET default.
- **L6.** The spine deviates from the PRD without saying so. FR-1 wants referrer detection and a non-prod chooser; NFR-6 names only demo and prod. *Fix:* list these as PRD amendments.
- **L7.** The refresh window drops from the brownfield's recent 30 minutes (commit `5f2cc89`) to 60 seconds without a reason. *Fix:* state why, or keep 30 minutes.
- **L8.** Error shapes for proxy-originated failures (403 not allowlisted, 413, 502 or 504 when upstream is unreachable) and the upstream timeout / `maxDuration` aren't defined. *Fix:* add them to the Errors convention.
