# Deferred work

<!-- Tracking rule (spec F6-3): add a new item under the section of the team that owns it.
     Team A = `/` (Epics 1-6), Team B = `/account` (Epics 7-10), Foundation = shared code
     (lib/server, lib/api, lib/shared, components/ui, features/shell, tooling) or cross-team.
     Feature branches append only at the end of their own team's section, so merges don't conflict. -->

## Team A (`/`, Epics 1-6)

- source_spec: `_bmad-output/implementation-artifacts/spec-7-0a-bff-foundation-and-tooling.md`
  summary: PUT v2/user/edit body schema lacks namePrefix, nameSuffix, otherNames, titles, cityOfBirth and accepts birthDate "n/a" although the backend type is LocalDate.
  evidence: backend UserServiceImpl.validateUserAttributes applies only non-null fields (partial update, no wipe); the Personal information card story must add the fields and confirm how a birth date is cleared on demo (unverified).
- source_spec: `_bmad-output/implementation-artifacts/spec-7-0b-2-shell-navigation.md`
  summary: Header shows primary phone numbers raw (e.g. +12125550100) although phoneNumberRegion is mapped.
  evidence: features/header ContactItem prints value; formatPhoneDisplay() arrives with Story 7.4 and should be applied to the header then.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-0b-2-shell-navigation.md`
  summary: A failed save inside the leave guard closes the dialog with no Section-level feedback.
  evidence: Story 1.13 only requires staying on the page; per-Section save error UI lands with the edit model (7.5).
- source_spec: `_bmad-output/implementation-artifacts/1-8b-profile-page-shell-app-bar-tabs-and-section-navigation.md`
  summary: PM copy question: the load-error template lower-cases the Section label ("Couldn't load phone", "Couldn't load personal information"), while EXPERIENCE.md's example reads "Couldn't load phones".
  evidence: EXPERIENCE.md lines 73 and 156. Story 1.12 owns the message catalog and error copy.
- source_spec: `_bmad-output/implementation-artifacts/spec-f1-shared-contracts-and-data-layer.md`
  summary: Product questions found in the backend while planning F1 — (1) the backend's patient-supported contact types omit "Social Media" (Story 3.7, Team A); (2) backend primary contact types are Email and Mobile only and myself.phoneNumber comes from the primary Mobile, but Story 7.6 lets a Landline be the primary phone (Team B); (3) myself has no phoneNumberRegion (Story 7.4 must take it from the matching contact point row or default to US).
  evidence: 1h-ng-bo-core-be ContactPointConstants.java:37,151-160; UserServiceImpl.java:2769-2786. Verify on demo before Stories 3.7 / 7.4 / 7.6.
- source_spec: `_bmad-output/implementation-artifacts/spec-f1-shared-contracts-and-data-layer.md`
  summary: RESOLVED 2026-10-14 — the three contact-point product questions were validated against agents.md (dev/demo/prod), the backend and 1health-fe: (1) Social Media is a valid patient type via POST /v2/health/contact-point; (2) Story 7.6 primary phone = verified Mobile only (Landline rejected by PUT v2/user/edit; 1health-fe's Landline option is a latent bug); (3) phone region comes from the contact-point list row, default "us". Stories 7.4/7.6 and the F1 spec are amended.
  evidence: agents.md v2/health/contact-point (demo), v2/user/contact-point/list, v2/user/myself; ContactPointServiceImpl.java:196-253,528-546,583-618,796-860; UserServiceImpl.java:625-648,2769-2786; 1health-fe PersonalAccountUtils.ts:53-62.
- source_spec: `_bmad-output/implementation-artifacts/spec-f2-bff-extension-kit.md`
  summary: Backend follow-ups found while planning F2 — (1) hard DELETE v2/file targets the public bucket only, so private signature/insurance-card objects may stay in S3 (still open after F7-2: the BFF now ownership-checks every delete in the named op `DELETE /api/pp/file/{fileId}`, but the hard delete itself is unchanged); (2) file uploads have no server-side ownership check on the person/insurance id (the BFF's `me` substitution and id regex are the only guard).
  evidence: 1h-ng-bo-core-be FileServiceImpl.java:797-816; OneHealthServiceImpl.java:4552-4562. Report to the backend team.
- source_spec: `_bmad-output/implementation-artifacts/spec-f2-bff-extension-kit.md`
  summary: Public profile picture uploads pass the original bytes (EXIF incl. GPS, trailing payloads) — the BFF only sniffs magic bytes; client-side reencodeImage (Story 1.10) is not a server guarantee.
  evidence: lib/server/proxy/upload.ts; isPublic=true entry in allowlist/core.ts. Story 1.10 (Team A) must decide server-side re-encode/metadata strip (e.g. sharp) or record it as an accepted AD-13 risk.
- source_spec: `_bmad-output/implementation-artifacts/spec-f2-bff-extension-kit.md`
  summary: Signature-version (`v2/file/{fileId}/version`) and insurance uploads trust client-supplied ids, checked only as numeric ids; ownership is enforced only upstream (and the backend has no ownership check). File deletes are no longer in this item: since F7-2 they are ownership-checked on the server (`DELETE /api/pp/file/{fileId}`, 404 `NO_FILE`), and `DELETE v2/file/**` is denied in the proxy.
  evidence: allowlist/personal.ts, allowlist/insurance.ts; backend follow-up already recorded (OneHealthServiceImpl.java:4552-4562). Stories 2.4 / 5.3 should resolve ids from myself / the user's own insurance list, or a named op should verify ownership.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-0a-bff-foundation-and-tooling.md` (code review, 2026-10-14)
  summary: CSP has no Google Maps hosts for `PLACES_ENABLED=1`; decide with the Places epic (AD-14 proxies Places through `/api/places`).
  evidence: moved from the spec-7-0a code-review list by spec F6-3; Story 4.3 decides.
- source_spec: `_bmad-output/implementation-artifacts/spec-f6-3-data-server-tests.md` (review, 2026-10-14)
  summary: Two sources of truth for Person options: the `GET v2/type/key/Person` VALUE_LIST values (what the Section offers) vs the fixed `RACES` / `ETHNICITIES` / `BIOLOGICAL_GENDERS` enums the proxy's `PUT v2/user/edit` schema accepts. A value the platform adds to the type would show in the picker and then fail with 400 `BAD_BODY`.
  evidence: lib/api/type-keys.ts#valueListOptions, lib/server/proxy/allowlist/personal.ts; Story 2.1/2.2 decide which list wins (intersect in the UI, or widen the schema).
- source_spec: `_bmad-output/implementation-artifacts/spec-f6-2-shared-ui-kit.md` (review, 2026-10-14)
  summary: Phone input country picker has no type-to-search: Radix Select typeahead in the 245-item list only matched the last key under Playwright (first letter + arrows work). No AC requires search; revisit if PM asks (e.g. the F5-2 Combobox with `staticOptions` as the picker).
  evidence: components/ui/phone-input.tsx; e2e/ui-kit.spec.ts "country picker" case (first-letter typeahead + arrows); spec F6-2 Implementation Notes.
- source_spec: `_bmad-output/implementation-artifacts/spec-f6-2-shared-ui-kit.md` (review, 2026-10-14)
  summary: The phone input re-renders all 245 country `SelectItem`s on every keystroke; memoize the item list per locale if a phone-heavy Section (3.2 with many rows, 5.2) shows input lag.
  evidence: components/ui/phone-input.tsx maps `phoneRegions(locale)` (the data is cached, the elements are not).

## Team B (`/account`, Epics 7-10)

- source_spec: none
  summary: Story 7.1 Account page — route, tabs, deep links and states, built on 7.0a + 7.0b.
  evidence: Split from the Epic 7 start (user-approved 2026-10-14); depends on the 7.0a/7.0b foundation specs.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-0b-2-shell-navigation.md`
  summary: The e2e "page switch (clean)" journey goes to a 404 because /account does not exist yet, so its "myself not refetched" assertion proves nothing about the shared SWR cache.
  evidence: PageNav targets /account; Story 7.1 adds app/account/page.tsx and must assert the shared cache (one /myself request) and Account aria-current on the real page.
- source_spec: `_bmad-output/implementation-artifacts/spec-f2-bff-extension-kit.md`
  summary: Confirm publicFilesOrigin (bocore-public-files-{demo,prod}.s3.us-west-1.amazonaws.com, found only in 2022–2023 backend git history) against a live tenantLogo.publicUrl on demo and prod before Story 10.2; SVG tenant logos will always show initials.
  evidence: 1h-ng-bo-core-be history (test-product.ftl, test.html); SimpleStorageService.java:346-353; TenantServiceImpl.java:738.
- source_spec: `_bmad-output/implementation-artifacts/spec-f2-bff-extension-kit.md`
  summary: /api/pp/org-logo makes up to 5 membership calls plus an S3 fetch per <img>, with no-store, so a 12-card page can cost ~70 upstream calls per render.
  evidence: lib/server/named-ops/org-logo.ts. Story 10.2 should cache the membership lookup per session (or pass the list's tenant ids) and consider a short private max-age for successful logos.

- source_spec: `_bmad-output/implementation-artifacts/spec-f6-1-page-composition.md`
  summary: (Team B, Story 7.2) e2e no-store assertion for RSC and prefetch requests to `/`, `/account` and `/handoff/**`; and whether pages need `Vary: Cookie` (Next 16 replaces `Vary` on rendered pages with its RSC list).
  evidence: `proxy.ts#isNoStorePath` + `proxy.test.ts` (unit matrix covers navigation, RSC and prefetch); `e2e/headers.spec.ts` asserts navigations only. F6-1 Review Triage Log "Deferred".

## Foundation (shared or cross-team)

- source_spec: `_bmad-output/implementation-artifacts/spec-f6-3-data-server-tests.md` (review, 2026-10-14)
  summary: The fixture-page gate test decides whether a page needs a session by a `requirePageSession()` substring in its source, so a page that calls it indirectly (or mentions it in a comment) is checked wrongly.
  evidence: app/test-fixtures.test.ts; replace with an explicit per-page export (e.g. `export const needsSession = true`) or a mock-call count without the source check.
- source_spec: `_bmad-output/implementation-artifacts/spec-f6-3-data-server-tests.md` (review, 2026-10-14)
  summary: The `NPI_ALREADY_REGISTERED` derived error code is dead: since F6-3 the NPI-taken rules map to the `personalNpi` / `practiceNpi` fields, and no rule emits it.
  evidence: lib/api/errors-codes.ts (`DerivedErrorCode`), lib/shared/telemetry.ts; remove it with its telemetry entry once Story 9.2 confirms the field mapping.
- source_spec: none
  summary: 7.0b Shell foundation — features/shell (app bar with non-interactive `primary-text` wordmark, tabs, navigate, leave guard, SectionRegistry, session-expired dialog on the `scrim` token — no session-changed dialog), lib/api/errors.ts, lib/shared/messages.ts, toasts, Retry.
  evidence: Split from the Epic 7 start (user-approved 2026-10-14); Story 7.1 needs Epic 1 pieces 1.7/1.8/1.11/1.12/1.13, too large for one spec. Runs after 7.0a.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-0a-bff-foundation-and-tooling.md`
  summary: Proxy request bodies are buffered before the size check when no Content-Length is sent; needs a streaming byte-capped reader.
  evidence: lib/server/proxy/handler.ts readEntryBody uses request.text(); bounded today by Next/Vercel body limits and no upload entries ship yet (AD-13 upload stories must add the streaming reader).
- source_spec: `_bmad-output/implementation-artifacts/spec-7-0a-bff-foundation-and-tooling.md`
  summary: Launch exchange errors are classified by substring ("used"/"expired"), so words like "refused" map to LAUNCH_USED.
  evidence: lib/server/launch/exchange.ts classifyExchangeError; same status, retry behavior and user message either way, only the logged errorCode differs; switch to word/structured matching once real upstream error bodies are recorded.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-0a-bff-foundation-and-tooling.md`
  summary: Error logs from guardRoute use a new requestId, so a 500 cannot be correlated with its request line.
  evidence: lib/server/http/guard-route.ts generates its own newRequestId(); fix by creating the id once in guardRoute and passing it into handlers.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-0a-bff-foundation-and-tooling.md`
  summary: Browser refresh call has no client-side timeout; a hung refresh holding the pp-refresh Web Lock would stall waiting callApi calls (unverified, medium if real).
  evidence: lib/api/client.ts runRefresh has no AbortSignal; server side is bounded by fetchWithTimeout and locks release on tab close, so it needs a hung same-origin request to bite. Settle by testing a never-resolving refresh with a mocked lock.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-0a-bff-foundation-and-tooling.md`
  summary: Token lifetimes of 30 s or less would make every proxy call TOKEN_EXPIRED and end the session (unverified, medium if real).
  evidence: lib/server/session/refresh.ts EXPIRY_SKEW_MS = 30 s; real IdP lifetimes are minutes. Settle by recording expires_in from demo/prod; fix by clamping the skew to min(30 s, expires_in/2).
- source_spec: `_bmad-output/implementation-artifacts/spec-7-0b-1-tokens-messages-errors.md`
  summary: 7.0b-2 Shell navigation — app bar (non-interactive wordmark, page nav, Return to 1health), ARIA tabs pattern, minimal header (initials only, primary phone/email ≥768 px), navigate() + requestLeave/leave guard + SectionRegistry, session-expired dialog with login-intent save, `/` page frame with placeholder tabs.
  evidence: Split from spec 7.0b at the human's request (2026-10-14, size gate); builds on 7.0b-1 (tokens, messages, errors.ts, ConfirmDialog, read states). Decisions already taken: relaunch after expiry always lands on `/` (intent used only for `/` paths); header shows initials only until Story 1.10.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-0b-1-tokens-messages-errors.md`
  summary: ProfilePlaceholder renders its own inline load-error copy for every failure (incl. SESSION_EXPIRED and 403) instead of mapFetchError + ReadStateFor.
  evidence: features/shell/profile-placeholder.tsx is replaced by the page frame in 7.0b-2; its test pins the old behaviour (shell.test.tsx:56-66) and must go with it.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-0b-1-tokens-messages-errors.md`
  summary: No test proves check-forbidden.sh actually invokes check-tokens.sh, so the token gate could be disabled silently.
  evidence: check-forbidden.sh takes no root argument; add one (as check-tokens.sh has) and a fixture test.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-0b-1-tokens-messages-errors.md`
  summary: Token gate misses multi-line JSX links using text-info-strong and rgb()/hsl()/oklch()/named colors in inline styles; nothing forbids text-primary used as text (dark 2.18:1).
  evidence: scripts/check-tokens.sh is line-based; extend with an ESLint rule on className/style when the shell components land (7.0b-2).
- source_spec: `_bmad-output/implementation-artifacts/spec-7-0b-1-tokens-messages-errors.md`
  summary: Outline button keeps dark:border-input (1.24:1) and Input's invalid border uses --destructive (4.10:1) instead of the D13 control-border / error-strong boundary.
  evidence: components/ui/button.tsx, input.tsx; DESIGN.md control-border covers Input, Select and Jump to — decide the button boundary with the 7.0b-2/7.5 controls.
- source_spec: `_bmad-output/implementation-artifacts/1-1-foundation-environment-config-security-headers-test-tooling.md`
  summary: AGENTS.md is auto-generated by `next dev` (Next 16) (resolved 2026-10-14: AGENTS.md is tracked and carries the shared-foundation pointer outside the `nextjs-agent-rules` markers).
  evidence: Appears in the review diff only because staging used `git add -N` on all untracked files; the Implementation Note says it was left untracked. Fix touches an agent-context file, so deferred.
- source_spec: `_bmad-output/implementation-artifacts/1-1-foundation-environment-config-security-headers-test-tooling.md`
  summary: Add a `.env.example` documenting the new required/optional env var contract (APP_ENV, APP_ORIGIN, APP_ID, ONEHEALTH_SECRET_KEY, SESSION_SECRET, SESSION_SECRET_PREVIOUS, PLACES_ENABLED, GOOGLE_PLACES_KEY, PP_DISABLED).
  evidence: The old *_DEMO/*_PROD vars were removed from code but nothing documents what a developer must now set. Real developer-onboarding gap; not a spec task for Story 1.1.
- source_spec: `_bmad-output/implementation-artifacts/1-1-foundation-environment-config-security-headers-test-tooling.md`
  summary: Update stale docs (README.md, CLAUDE.md, docs/AUTH-ARCHITECTURE.md, docs/api/CONVENTIONS.md, docs/README-DEBUGGER.md, docs/ACTION-PATTERNS.md) that still describe the deleted auth-client, /api/token, /auth, legacy lib/api engines, and *_DEMO/*_PROD env vars.
  evidence: These docs now describe code that no longer exists after the Story 1.1 legacy removal. Fix edits agent-context files (CLAUDE.md) and broad docs; deferred.
- source_spec: `_bmad-output/implementation-artifacts/1-1-foundation-environment-config-security-headers-test-tooling.md`
  summary: Verify the CI pnpm cache ordering (actions/setup-node `cache: pnpm` immediately after `corepack enable`) actually resolves pnpm on the first GitHub Actions run; if not, add pnpm/action-setup before setup-node.
  evidence: maybe-false, medium-if-true (would break the CI gate AC). Cannot be verified without a GitHub Actions runner; local runs don't exercise setup-node caching. Settle by watching the first CI run.
- source_spec: `_bmad-output/implementation-artifacts/1-1-foundation-environment-config-security-headers-test-tooling.md`
  summary: Make the 404 page carry the per-request CSP nonce — `/_not-found` is statically prerendered so under `'strict-dynamic'` its scripts are un-nonced and won't hydrate.
  evidence: Observed in the Story 1.1 production build (`/_not-found` shown as static). Low harm for a placeholder 404 (HTML + security headers are correct; only JS hydration is blocked), same class as the home-page bug fixed in 1.1. Revisit when real routes are added (e.g. force the root layout/not-found dynamic or supply a custom not-found).
- source_spec: `_bmad-output/implementation-artifacts/1-2-launch-from-the-portal-and-arrive-signed-in.md`
  summary: Story 1.5 (token refresh) must consult `accessTokenExpiresAt` in the session guard and reject/replace a non-positive `expires_in` from the exchange (currently a missing `expires_in` seals an already-expired token, harmless in 1.2 since expiry is never read).
  evidence: Raised by blind-hunter + edge-case review of Story 1.2; expiry consumption is explicitly out of scope for 1.2 (refresh = Story 1.5).
- source_spec: `_bmad-output/implementation-artifacts/1-2-launch-from-the-portal-and-arrive-signed-in.md`
  summary: Consider a shared deadline for the launch exchange — `exchangeCode` and `fetchIds` each use a 25s timeout, so a double-slow upstream can take ~50s and may exceed the serverless function's maxDuration, never rendering the error screen.
  evidence: blind-hunter review of Story 1.2. Low/maybe-false; settle against the deployed function's maxDuration.
- source_spec: `_bmad-output/implementation-artifacts/1-3-secure-1health-proxy-allowlist-normalization-csrf-no-store-a.md`
  summary: Proxy upstream timeout covers only time-to-headers; a stalled body stream after headers has no deadline. Add a streamed-body deadline (TransformStream/abort) so a hung upstream body can't tie up the function.
  evidence: blind-hunter + edge-case review of Story 1.3. Low/maybe-false, medium-if-true; fix needs streaming-deadline plumbing beyond a trivial change.
- source_spec: `_bmad-output/implementation-artifacts/1-3-secure-1health-proxy-allowlist-normalization-csrf-no-store-a.md`
  summary: Dev-only redactBody (lib/server/log.ts) misses some secret field names (code, oneTimeCode, apiKey, authorization). Expand the field list when the debug logger is next touched.
  evidence: blind-hunter review of Story 1.3. Dev-only logging; low severity.
- source_spec: `_bmad-output/implementation-artifacts/1-4-callapi-transport-swr-keys-and-usemyself.md`
  summary: CLAUDE.md still describes `callApiRaw`, `authFetch` and the legacy client-side auth design; update it to the AD-19 `callApi` transport.
  evidence: Story 1.4 removed `callApiRaw`; CLAUDE.md is an agent-context file, so its edit is deferred rather than patched.
- source_spec: `_bmad-output/implementation-artifacts/1-4-callapi-transport-swr-keys-and-usemyself.md`
  summary: Decide in Story 1.7 whether `session-events.subscribe` should replay an event already published before the subscriber registered.
  evidence: Unverified (medium if true) — `publish` is once-per-lifetime, so a subscriber added after the first publish never hears it; today responses arrive after commit, so effect-time subscription likely wins. Settle with a test where a 409 resolves before SessionDialogs mounts.
- source_spec: `_bmad-output/implementation-artifacts/1-5-client-coordinated-token-refresh.md`
  summary: Verify `client_id=public-client` against the real IdP with one refresh on demo; a wrong client id makes every refresh end the session (IdP 401 `invalid_client` maps to `SESSION_EXPIRED`).
  evidence: maybe-false, high if wrong. The refresh request shape comes from the pre-Story-1.1 client code; the launch exchange uses a different (external-application) endpoint, so the pairing is unproven.
- source_spec: `_bmad-output/implementation-artifacts/1-5-client-coordinated-token-refresh.md`
  summary: Concurrent IdP refreshes (no `navigator.locks`, lock fallback, overlapping normal/forced slots) or a relaunch mid-refresh can let a stale `Set-Cookie` (clear or re-seal) overwrite a newer cookie.
  evidence: maybe-false, medium if true — needs IdP refresh-token rotation with reuse detection and a browser path without Web Locks. Settle by confirming the IdP's rotation policy.
- source_spec: `_bmad-output/implementation-artifacts/1-5-client-coordinated-token-refresh.md`
  summary: Make `lib/server/proxy.test.ts` use the real `ACCESS_TOKEN_SKEW_MS` instead of mocking it, so proxy/refresh-route agreement on the skew is tested.
  evidence: The proxy test mocks `@/lib/server/session` with a literal 30_000; a drifted proxy constant would pass and force an IdP refresh on every call in the drift window.
- source_spec: `_bmad-output/implementation-artifacts/1-5-client-coordinated-token-refresh.md`
  summary: CLAUDE.md still says "Token refresh is not built yet (Story 1.5)"; describe `/api/session/refresh` and callApi's refresh/replay.
  evidence: Agent-context file, deferred per workflow.
- source_spec: `_bmad-output/implementation-artifacts/1-6-idle-logoff-activity-ping-and-cross-tab-activity.md`
  summary: A refresh re-seal writes back the `lastSeen` it read, so activity recorded during the IdP call (≤ 25 s) can be rolled back; the server may expire up to ~25 s before the client deadline.
  evidence: Single-cookie last-write-wins (AD-1/AD-16); the client warning still shows first. Fix needs a merge-on-write design (e.g. separate activity cookie or max-merge).
- source_spec: `_bmad-output/implementation-artifacts/1-6-idle-logoff-activity-ping-and-cross-tab-activity.md`
  summary: `callApi` marks every non-GET as user activity; any future POST-based read polled by SWR (query/grid endpoints) would keep the session alive forever.
  evidence: Spec/epic-mandated today and only `GET /myself` is allowlisted; stories adding POST reads must make them non-activity (e.g. a `userInitiated: false` override).
- source_spec: `_bmad-output/implementation-artifacts/1-6-idle-logoff-activity-ping-and-cross-tab-activity.md`
  summary: PM copy question — an idle/absolute logoff found on reload redirects to `/launch-error?reason=expired`, which reads "This link has expired".
  evidence: `reason=expired` copy is locked in EXPERIENCE.md and launch-oriented; while the page is open Story 1.7's "Your session ended" dialog covers the case.
- source_spec: none
  summary: Story 1.8 part B — profile page shell: app bar with framed-aware "Return to 1health", Contacts/Insurance/Medical tabs with `?tab=` replace + `requestLeave()`, numbered Section menu / "Jump to" with scroll-spy and `#<section>`/`#signature` deep links, `SectionFrame` loading/error states, Insurance and Medical placeholders, 360 px and axe (light/dark) checks.
  evidence: Split from Story 1.8 at the multi-goal check (user chose "tokens first"); part A (design tokens, DESIGN.md overrides, dark values, hex/palette lint gate) ships first because B's light/dark axe contrast scans depend on A's colors.
- source_spec: `_bmad-output/implementation-artifacts/1-8a-design-tokens-overrides-and-color-lint.md`
  summary: The destructive Badge and destructive Toast put white text on `bg-destructive` #d84f45 (4.10:1, below AA); the toast close icon at 70 % is about 2.75:1. Move them to `destructive-fill` (or a soft recipe) when a caller first uses them.
  evidence: Pre-existing (the old `text-red-300` close icon was worse); neither variant has an in-app caller yet. Medium when used.
- source_spec: `_bmad-output/implementation-artifacts/1-8a-design-tokens-overrides-and-color-lint.md`
  summary: The destructive Button's focus ring is `focus-visible:ring-destructive/20` (dark `/40`), below the 3:1 non-text contrast a focus indicator needs.
  evidence: Pre-existing, medium. Story 1.8 part B's focus-ring criterion covers every interactive element, so fix it there.
- source_spec: `_bmad-output/implementation-artifacts/1-8a-design-tokens-overrides-and-color-lint.md`
  summary: DESIGN.md is stale against Story 1.8a. Its prose says links map to `text-info-strong` and the destructive button to `bg-error-strong` (the app uses `link-text` / `destructive-fill`), and `drawer-scrim` has no dark value (the app uses black at 60 %). Update it after PM/design review of the dark scrim.
  evidence: DESIGN.md lines 483-484, 545-546 and 598. It is a planning/UX document, so it is deferred rather than edited in a code story.
- source_spec: `_bmad-output/implementation-artifacts/1-8a-design-tokens-overrides-and-color-lint.md`
  summary: Nothing tracks the follow-ups that `globals.css` promises: reporting the three contrast deviations upstream to the 1health design-system owners, and PM/design review of the dark scrim (black at 60 %). Give each an owner and a ticket.
  evidence: The only record is the comment in `app/globals.css` and `docs/DESIGN-SYSTEM.md`; there is no Jira ticket or owner.
- source_spec: `_bmad-output/implementation-artifacts/1-8a-design-tokens-overrides-and-color-lint.md`
  summary: The new CLAUDE.md design-system line says to use the override tokens "where DESIGN.md calls for them" without locating DESIGN.md. Point it at the "Contrast overrides" table in `docs/DESIGN-SYSTEM.md` instead.
  evidence: The section links `docs/DESIGN-SYSTEM.md`, but DESIGN.md lives under `_bmad-output/planning-artifacts/ux-designs/…`. Agent-context file, deferred per workflow.
- source_spec: `_bmad-output/implementation-artifacts/1-8b-profile-page-shell-app-bar-tabs-and-section-navigation.md`
  summary: `SectionFrame`'s loading state isn't announced to screen readers (only `aria-busy`, and the skeleton rows are `aria-hidden`). Design a non-noisy announcement (e.g. one polite page-level status) in the Section framework.
  evidence: `aria-busy` support is poor; five Sections loading at once means one per-Section announcement each is too noisy. Story 1.11 owns `SectionFrame`'s full contract.
- source_spec: `_bmad-output/implementation-artifacts/1-8b-profile-page-shell-app-bar-tabs-and-section-navigation.md`
  summary: `Input`, `Badge`, and the session-dialog / idle-warning action buttons still use `ring-*` focus styles, the latter on top of Button's `focus-ring`. Migrate them to `focus-ring` and make the CLAUDE.md / DESIGN-SYSTEM.md wording ("every interactive control") true.
  evidence: The part B spec told the implementer to leave the dialog classes alone. The doc claim covers more than the code, and one fix edits an agent-context file.
- source_spec: `_bmad-output/implementation-artifacts/1-8b-profile-page-shell-app-bar-tabs-and-section-navigation.md`
  summary: The deep-link scroll runs once at mount, and the scroll-spy observes only the Sections present when it starts. When header data (`MyselfName`, Story 1.9) or Section content (1.11) changes the layout, re-follow the hash and observe late Sections.
  evidence: The layout shifts after the initial scroll and moves `#signature`/`#<section>` targets. It is harmless while every Section is a fixed-height skeleton.
- source_spec: `_bmad-output/implementation-artifacts/1-1r-foundation-and-launch-rework.md`
  summary: "Owner question (D9 / Story 1.2): a lost success response followed by a retry wipes the just-created session. Attempt 2 gets LAUNCH_USED, and the mandated clear-first deletes the new cookie, so the user sees 'This link has expired'. Option: on LAUNCH_USED, keep an existing valid session for the same user and environment."
  evidence: Conflicts with Story 1.2's frozen clear-first and used→400 rules. The user chose to defer it to the epic owner on 2026-10-14. Rare (needs a dropped response) and recoverable by relaunching.
- source_spec: `_bmad-output/implementation-artifacts/1-1r-foundation-and-launch-rework.md`
  summary: "Owner security question (D9): login CSRF. Any site can link to /auth?lpl=<attacker's own payload>; the screen auto-launches and signs the victim into the attacker's account, where they may enter health data. Option: require a 'Continue' click when the referrer isn't a 1health portal host."
  evidence: D9 mandates auto-start, and D5 already accepts no CSRF checks. The one-time code's short validity narrows the window but doesn't close it. The user chose to defer it to the epic owner on 2026-10-14; record it next to the D5 trade-offs.
- source_spec: `_bmad-output/implementation-artifacts/1-1r-foundation-and-launch-rework.md`
  summary: "Owner question (Story 1.2): LAUNCH_USED, LAUNCH_EXPIRED, LAUNCH_CONFIG and SERVICE_DISABLED carry no retryable:false, so /auth makes four more doomed attempts (~6 s) before showing the error. Option: mark them retryable:false."
  evidence: Story 1.2 says exchange failures carry no retryable:false. The user chose to defer it to the epic owner on 2026-10-14.
- source_spec: `_bmad-output/implementation-artifacts/1-1r-foundation-and-launch-rework.md`
  summary: After a successful exchange, a failed launch (WRONG_TENANT, a /myself failure or mismatch, a seal fault) drops live tokens without revoking them. Design a single-token best-effort revoke; all-devices (D3) would sign the user out everywhere.
  evidence: The pre-R1 /launch had the same gap. It needs a revoke endpoint choice, which is a backend question alongside the earlier refresh-token request.
- source_spec: `_bmad-output/implementation-artifacts/1-1r-foundation-and-launch-rework.md`
  summary: /api/token error bodies omit the detected environment, so a demo user with no referrer or onehealth_environment cookie gets "Go to 1health (Production)" on the error screen. Consider adding environment to post-detection error bodies.
  evidence: Story 1.2 fixes the error-body fields, and the environment is not secret.
- source_spec: `_bmad-output/implementation-artifacts/1-1r-foundation-and-launch-rework.md`
  summary: CLAUDE.md lists ACCOUNT_DISABLED as a kill switch; add that it is parsed only until the Story 1.3 rework (R2) enforces it.
  evidence: .env.example and README were patched; CLAUDE.md is an agent-context file, deferred per workflow.
- source_spec: `_bmad-output/implementation-artifacts/1-1r-foundation-and-launch-rework.md`
  summary: "For R3: saveLoginIntent has no caller yet; requireSession() and the root proxy.ts expiry redirect drop ?tab= until R3 saves the intent; saveLoginIntent should store pathname + search without the hash (epics.md:1151)."
  evidence: The R1 spec assigns saving the intent to Story 1.7 (R3).
- source_spec: none
  summary: Login CSRF on /auth (auto-launch of any lpl in the URL) — resolved as accepted risk.
  evidence: Human decision 2026-10-14 (recorded on D9 in epics.md): keep patient-vault behaviour, no "Continue" step for non-1health referrers.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-0c-1-idle-logoff-and-activity.md`
  summary: 7.0c-2 Section navigation — port main Story 1.8B (Section menu, Jump to on components/ui/select.tsx @radix-ui/react-select 2.3.7, scroll-spy, deep links incl. #signature, SectionFrame with MappedError-driven states, Contacts/Insurance panels) into PageTabs; section jumps bypass requestLeave; load-error copy "Couldn't load {section}" with the EXPERIENCE plural nouns.
  evidence: Split from 7.0c at the human's request (2026-10-14, three specs); main code at commit b005536.
- source_spec: `_bmad-output/implementation-artifacts/spec-7-0c-1-idle-logoff-and-activity.md`
  summary: 7.0c-3 Disabled screen — port main's DisabledScreen for PP_DISABLED on / and /auth (and ACCOUNT_DISABLED on /account later, Story 7.2), environment from session/cookie/referrer, DISABLED_MESSAGES draft copy, 503 via root proxy.ts if Next 16 allows (else 200, deferred).
  evidence: Split from 7.0c at the human's request (2026-10-14, three specs); main code at commit b005536.
- source_spec: none
  summary: Former queued specs 7.0c-2 (section navigation) and 7.0c-3 (disabled screen) are absorbed into the shared foundation F3 and F2.
  evidence: Human approved shared-foundation-plan.md on 2026-10-14.
- source_spec: `_bmad-output/implementation-artifacts/spec-f2-bff-extension-kit.md`
  summary: No per-session throttle on /api/places/autocomplete (paid Google calls) or /api/pp/mfa/validate (6-digit code guessing relies on upstream lockout, not confirmed in MfaResource).
  evidence: Serverless in-memory limits are per instance; decide with Stories 4.3 (Team A) and 8.2 (Team B): confirm upstream TOTP lockout on demo, add a sealed-session attempt counter or edge rate limit if absent.
- source_spec: `_bmad-output/implementation-artifacts/spec-f5-1-select-date-input-popover.md`
  summary: With a Radix Select listbox open, axe `aria-hidden-focus` flags the page: Radix Select (the F3-1 port, `@radix-ui/react-select` 2.3.7) hides the rest of the page with `aria-hidden` while trapping focus, without `aria-modal`. Library behaviour; the e2e scans only the listbox in that state.
  evidence: `e2e/inputs.spec.ts` (comment at the open-listbox axe scan); F5-1 Review Triage Log "Deferred". Revisit on a Radix Select upgrade, or patch the content with `aria-modal="true"` if axe still flags it; feature e2e that scan with an open Select (2.2, 4.2, 5.2, 7.5, 7.6) scan only the listbox too.
- source_spec: `_bmad-output/implementation-artifacts/spec-f6-2-shared-ui-kit.md` (review, 2026-10-14)
  summary: Full-screen dialog (8.2 QR) and Sheet (5.2 mobile page) pin their footer to the layout viewport; with the on-screen keyboard open the footer may sit under it on iOS. Decide `interactive-widget=resizes-content` in the viewport meta or a visual-viewport offset.
  evidence: components/ui/dialog.tsx (`fullScreenOnMobile`, `h-dvh`), components/ui/sheet.tsx; e2e checks the pinned footer without a keyboard only.
- source_spec: `_bmad-output/implementation-artifacts/spec-f6-2-shared-ui-kit.md` (review, 2026-10-14)
  summary: `useAnnounce` re-announces identical text by toggling a trailing no-break space (the F5-2 combobox rule); verify with VoiceOver and NVDA that the repeat is read.
  evidence: components/ui/live-status.tsx; unit test asserts the DOM change only.
- source_spec: `_bmad-output/implementation-artifacts/spec-f7-2-contract-hardening.md` (review, 2026-10-14)
  summary: CLOSED — file deletes no longer trust the client's id. The backend's `DELETE v2/file/{id}` checks only the tenant, so the proxy denies `DELETE v2/file/**` and Stories 1.10, 2.4 and 5.3 delete through the named op `DELETE /api/pp/file/{fileId}` (`fileDeletePath`), which proves with the session's token that the id is the caller's profile picture, Signature or one of their insurance cards before hard-deleting; anything else is 404 `NO_FILE`. Still open (backend follow-up, Team A item above): hard delete may leave private S3 objects.
  evidence: lib/server/named-ops/file-delete.ts, app/api/pp/file/[fileId]/route.ts, lib/server/proxy/deny-list.ts, lib/api/files.ts#fileDeletePath.

### Deferred from: code review of spec-7-0a-bff-foundation-and-tooling (2026-10-14)

- Upstream 401 on a clock-fresh access token ends the session instead of forcing a refresh (Story 1.5 L1050/L1067 behaviour); revisit with a force-refresh flag when 1.6/7.0b touch refresh.
- `/api/token` (and the proxy) buffer chunked request bodies without Content-Length before the size cap; bounded by Next/Vercel limits, add a streaming byte-capped reader with the AD-13 upload stories.
- `fetchWithTimeout` now caps body streaming at 25 s, which would cut future large `asImage` downloads; switch to an idle timeout when the first `asImage` entry ships.
- Proxy deny check runs on client segments before owner-id substitution; re-run it on upstream segments when the first `{userId}`/`{personId}` entry is added.
- A relaunch over an existing session drops the previous tokens without revoking them; add a best-effort `revokeAllDevices` for the replaced session.

### Deferred from: code review of spec-r5-1-main-parity-server-e2e (2026-10-14)

- `/api/token` fail-closed path: a throw after the exchange (e.g. in the seal or `environmentSetCookie`) answers 502 but does not revoke the just-issued tokens (the over-budget seal path does). Revoke best effort there too, and align the R5-1 matrix wording for seal throws.
- `test/e2e-upstream-mock.ts` matches a 1health root by string prefix (`<root>/`); match by parsed origin instead.
- `isOpaqueRedirect()` treats any status 0 as an opaque redirect; narrow it to `type === "opaqueredirect"` if another status-0 shape ever appears.
- Refresh: a 400 body is read with `response.json()` without a byte cap; read it through the capped reader.
- The e2e mock revokes per Bearer token (intentional: parallel e2e runs share one server); revisit only if a test needs all-devices semantics.
- `playwright.config.ts` `reuseExistingServer` is on locally, so a stale server (other env, e.g. without `PP_E2E_MOCK`) can be reused; consider a port/env check.
- The 360 px shell test reads gutters through structural selectors (`body header > :first-child`, `#personal` parent, the combobox parent); give those containers test-stable hooks.
