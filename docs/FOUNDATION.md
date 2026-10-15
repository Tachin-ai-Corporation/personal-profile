# Shared foundation catalog

Everything the shared foundation already provides, for both teams and every coding agent:

- **Team A** builds Epics 1–6 on `/`.
- **Team B** builds Epics 7–10 on `/account`.

**Use what is listed here. Do not build a second one, and do not route around it.** If something you need is missing, extend the foundation module that owns that area. Do not create a parallel module.

| Spec | What it built | Commits (`feat/NG-9019-epic-7`) |
|---|---|---|
| 7.0a | BFF: launch, sealed session, proxy, `callApi`, refresh, logout, tooling, CI | `e6a973e` |
| 7.0b-1 | D13 tokens, message catalog, error mapper v1, `ConfirmDialog`, read states | `e6a973e` |
| 7.0b-2 | Shell: app bar, tabs, `navigate()`, leave guard, Section registry, session dialog, header | `e6a973e` |
| 7.0c-1 | Idle logoff, activity ping, cross-tab activity | `5b72490` |
| F1 | Per-area registries, `Myself`, SWR keys, error mapper v2, shared rules/formatters, ownership lint | `b8e20ff` |
| F2 | Named-op wrapper and routes, image hardening, kill switches and disabled screen, uploads | `e72e968` |
| F3-1 | UI primitives and toasts | `5b4ed14` |
| F3-2 | Section edit model: `useSectionForm`, chrome, `KeyValueTable`, save runners | `8ec3fe8` |
| F3-3 | `StateFrame`, 403 owner table, `SignatureThumb`, Section navigation | `a95a7ec`, `b3f0801` |
| F4 | Drafts (Story 1.15) | `bd7aae8` |
| F5-1 | Select (aria-disabled, helper), DateInput + Calendar, Popover, InfoPopover | `a411145`, `18ccd2c` |
| F5-2 | Async Combobox | `57d665a`, `687199e` |
| F6-1 | Page composition and shell extension points: prop-driven `PageTabs`, page presets with slots, feature entry stubs, `useSectionFrame`, hand-off helper, page no-store, `SAVE_ORDER`, `CANCELLED`, `revealField` | see `spec-f6-1-page-composition.md` |
| F6-3 | Planned `lib/api` modules + `type-key` loader, proxy `required` params, NPI-taken field rules, PM3 `isNotProvided`, profile constants, shared action copy, per-area e2e fixtures + fail-fast catch-all, fixture-page discovery, per-team tracking | see `spec-f6-3-data-server-tests.md` |
| F6-2 | Shared UI kit: DropdownMenu, Checkbox, Switch, Dialog sizes/full-screen, Sheet, chips, empty states, announcer, row kit, Section table, phone input, countdown | see spec F6-2 |

The specs live in `_bmad-output/implementation-artifacts/spec-*.md`. Where a spec's Boundaries and its Implementation Notes or review fixes disagree, the later notes and the code win. This catalog follows the code.

Related docs (not repeated here): [AUTH-ARCHITECTURE.md](AUTH-ARCHITECTURE.md) (launch, session, proxy, refresh, logout), [api/CONVENTIONS.md](api/CONVENTIONS.md) (adding a `lib/api` module), [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) (tokens and rules), [api/GOTCHAS.md](api/GOTCHAS.md) (platform quirks; reference only).

---

## 1. Golden rules

1. **Use it before you build it.** Search this file first. A story's "Foundation 2026-10-14" lines in `_bmad-output/planning-artifacts/epics.md` name the exact pieces it should use.
2. **Never call 1health from the browser.** The browser calls only this app's `/api/*` routes, and only through `callApi` (`@/lib/api`). `fetch(` is lint-banned outside `lib/api/client.ts` and `lib/server/**`.
   - 1health REST goes through the proxy: `proxyPath("v2/…")` → `/api/1h/v2/…`.
   - Server work the proxy can't express (multiple calls, GraphQL, external APIs) is a named op under `/api/pp/*` or `/api/places/*`.
3. **One allowlist entry per endpoint, in its area file.** Put it in `lib/server/proxy/allowlist/<area>.ts`, with tests in `<area>.test.ts`, in the same change as the caller. Never edit `allowlist/index.ts`, because every planned area is already aggregated.
   - Owner ids are the literal `me`; the proxy fills them from the session.
   - `/account`-only entries carry `profile: true`, so `ACCOUNT_DISABLED` turns them off.
4. **Copy comes only from `lib/shared/messages/<area>.ts`.**
   - Strings must be unique across the whole catalog: reuse `COMMON_MESSAGES`, `CONTROL_MESSAGES` and `COMBOBOX_MESSAGES` before adding a duplicate.
   - Every string must match the EXPERIENCE.md Voice and Tone table word for word, or be marked `// DRAFT COPY` (`messages.test.ts`).
   - Zod messages in `features/**/schema.ts` must be catalog constants; string literals are lint-banned.
5. **Errors only go through the mapper.** Use `mapApiError(scope, response)` / `mapFetchError(scope, error)` from `@/lib/api`.
   - Upstream message text is matched only in `lib/api/errors/<area>.ts`, with anchored `^…$` rules.
   - Only `lib/api/errors/*`, `client.ts` and `errors-codes.ts` read `errorCode`, `upstreamCode`, `platformMessage` or `source`.
   - A 403's owner (tab, Section, control or popover) comes from `forbiddenScopeFor(path, page)`.
6. **Use semantic tokens only.** No hex values and no palette classes (`bg-red-500`). `scripts/check-tokens.sh` (run by `check-forbidden.sh`) fails the build on them.
   - Use the `focus-ring` utility for focus.
   - Red is only for errors and destructive actions.
   - Meet WCAG 2.1 AA: 44 px targets, and respect reduced motion.
7. **Keep the layers** (lint-enforced in `eslint.config.mjs`, fixture `eslint.config.test.ts`):
   - `lib/shared` imports nothing from the app.
   - `lib/api` never imports `lib/server`, features, components or `app/`.
   - A feature imports only `lib/api`, `lib/shared`, `components/ui` and `features/shell`, never another feature.
   - `components/ui` never imports `lib/api`.
   - Only `lib/server/env.ts` reads `process.env`; `lib/shared/app-env.ts` may read `NODE_ENV`.
   - `features/shell` and `app/auth` are the only places that link to app pages or the portal; everyone else calls `navigate()`.
   - `next/link` and `NextResponse.redirect` are banned.
8. **Ownership lint:**
   - `updateAccount` can be imported only in `features/account/**` (AD-9; dynamic imports are banned too).
   - Only `features/shell/toasts.ts` imports `@/hooks/use-toast`.
   - SWR keys are built only in `lib/api/keys.ts`.
9. **Drafts belong to `features/shell/drafts.ts`.** Sections never touch `localStorage`. They declare `draftFields`, and those fields may never include SSN, signature, codes, NPI, username or password.
10. **Use one of each:**
    - One root `SWRConfig`, one `navigate()`, one leave guard, one session dialog and one idle warning.
    - One `StateFrame` for every read state.
    - One toast API (`toastSuccess`, `toastPartial`, `toastError`).
    - One `ConfirmDialog`.

### How to extend

| You need | Do this |
|---|---|
| A new 1health endpoint | Add an entry to `lib/server/proxy/allowlist/<area>.ts` (`{ method, template, query?, fixedQuery?, body?, asImage?, upload?, maxBytes?, profile? }`) and rows in `<area>.test.ts`. Add the path builder (`proxyPath`) and a `callApi` function in `lib/api/<resource>.ts`. Exports go through `lib/api/index.ts`. See [api/CONVENTIONS.md](api/CONVENTIONS.md). |
| A new read with SWR | The key already exists in `lib/api/keys.ts`; add one there only if it is truly missing. Call `registerFetcher("<resource>", loader)` at the bottom of your `lib/api/<resource>.ts`. Read it with `useSWR(keys.x())`: the root `SWRConfig` fetcher dispatches to your loader. |
| Server work across calls, GraphQL or an external API | Add a named op (recipe 5.6): `lib/server/named-ops/<op>.ts` on `createNamedOp`, a thin `app/api/pp/<op>/route.ts` exporting the handler for every method, and the path and types in `lib/shared/bff-contract.ts` (`BFF_PATHS`). An `/account`-only op also goes in `lib/server/kill-switch.ts` (`"account"` prefixes). |
| Copy | Add a key to the area's existing `lib/shared/messages/<area>.ts`, marked `// DRAFT COPY` unless it is verbatim from Voice and Tone. Every planned area file exists; a new area is a foundation change that also edits `messages/index.ts`. |
| Recognise an upstream error | Add a `MessageRule` to `lib/api/errors/<area>.ts` (`scopes`, anchored `pattern`, `result: field | coded`) and extend that file's `Field` union. Field copy goes in the area messages. A new derived code goes in `lib/api/errors-codes.ts` (`DerivedErrorCode`) and `lib/shared/telemetry.ts`. |
| A 403 that should hide a tab, Section or control | Add a row to `FORBIDDEN_SCOPE_TABLE` in `lib/api/errors/forbidden-scope.ts`, with a table test. |
| A Section | Use `useSectionForm` + `SectionLandmark`/`SectionHeader`/`SectionContainer`/`SectionFooter` + `KeyValueTable`/`KeyValueEditTable` + `StateFrame` (recipe 5.1). Put it in `features/<id>/` with its own `schema.ts`. |
| A shared UI control | Extend `components/ui/*` (semantic tokens, tests with axe) and add a fixture case on the matching `/test-fixtures/*` page. Never fork a control inside a feature. |

---

## 2. Architecture overview

```
Browser (features/*, components/ui)
   │  callApi(context, path, init)          (lib/api/client.ts: never throws, refresh + replay, activity header)
   ▼
Next.js server (same origin)
   proxy.ts (root)    AD-21 headers + CSP nonce, kill switches first, navigation re-seal / 307 /auth
   /auth + /api/token launch (LPL decrypt, env by key, one code exchange) → sealed cookie __Host-pp_s
   /api/1h/[...path]  proxy: normalize → deny list → allowlist (per area) → profile kill switch → session
                      → query/body/upload validation → token freshness → upstream (25 s, redirect manual)
   /api/pp/*          named ops (profile-picture-id, mfa/validate, practice-support, org-logo/[tenantId])
   /api/places/*      Google Places autocomplete/details (PLACES_ENABLED)
   /api/session/{refresh,ping,logout}
   /disabled          503 disabled screen (rewritten to by proxy.ts)
   ▼
1health (demo | prod, chosen per request from the session's environment)
```

- **Launch** (kept from the 1health App Starter): the portal opens `/auth?lpl=…`.
  - The screen strips `lpl` from the URL and POSTs `{ lpl }` to `/api/token`, up to 5 attempts 1.5 s apart.
  - The server picks the environment by the key that decrypts (`_PROD` first, then `_DEMO`). It checks the app id, exchanges the code once, checks the tenant and the `myself` id, then seals the session.
  - Details: [AUTH-ARCHITECTURE.md](AUTH-ARCHITECTURE.md).
- **Session:** one `HttpOnly; Secure; SameSite=Lax` cookie, `__Host-pp_s` (iron-session), plus a display-only `onehealth_environment` cookie. No token ever reaches the browser.
  - Idle limit is 15 min and the absolute limit is 8 h.
  - Activity re-seals `lastSeen`: the proxy does it for `X-PP-Activity: user` calls, and `POST /api/session/ping` does it too.
- **Refresh:** the proxy answers `401 TOKEN_EXPIRED`. `callApi` then runs one `/api/session/refresh` (single-flight, `navigator.locks`) and replays.
  - `SESSION_EXPIRED` publishes `session-expired` once, and the shell's `SessionDialog` takes over.
- **Kill switches:** `PP_DISABLED=1` turns off the whole app. `ACCOUNT_DISABLED=1` turns off `/account`, `/handoff`, the `/api/pp/{mfa,org-logo,practice-support}` routes and `profile: true` proxy entries.
  - APIs answer 503 `SERVICE_DISABLED`.
  - Pages are rewritten to the 503 disabled screen.
  - Logout and `/api/token` are never switched by `proxy.ts`. `/api/token` returns its own launch-envelope 503.
- **Uploads:** an `upload` allowlist entry accepts multipart with exactly one file part. The bytes are checked by magic number (PNG/JPEG/BMP). The file is capped at `maxBytes`, and the request at `maxBytes + 16 KiB`, read as a stream. The upstream body is rebuilt with a sanitized name.
- **Image downloads:** `asImage` entries force `preview=true`. Only PNG/JPEG/BMP leading bytes are served `inline`; anything else becomes an `attachment`. Responses are nosniff and no-store.

---

## 3. Catalog

Paths are relative to the repo root. "Stories" lists the main consumers (A = Team A, B = Team B).

### 3.1 Server / BFF (`lib/server`, `app/api`, root `proxy.ts`)

| Module | Path | What it gives (key API) | Use it for (stories) | Do not |
|---|---|---|---|---|
| Server env | `lib/server/env.ts` | `serverEnv()` (`PP_DISABLED`, `ACCOUNT_DISABLED`, `PLACES_ENABLED`, `GOOGLE_PLACES_KEY`, `PP_E2E_FIXTURES`, `IS_LOCAL_DEV`, `getSecretKey(env)`, `getAppId(env)`), `assertServerEnv()` (boot, via `instrumentation.ts`), `DEFAULT_TENANT_ID`, `secretKeyVariable()` | all server code | read `process.env` anywhere else |
| Environment map | `lib/shared/environments.ts` | `environmentConfig(env)` → `{ apiRoot, apiBase, portalUrl, publicFilesOrigin, label }`, `isEnvironment`, `environmentOfPortalUrl`, `environmentFromReferrer`, `ENVIRONMENTS` | 1.16, 7.2, 10.2 | hard-code a 1health origin (`check-forbidden.sh` fails) |
| Security headers | `lib/server/security/headers.ts`, `proxy.ts` | `securityHeaders(nonce)`, `buildCsp`, `generateNonce`, `STATIC_SECURITY_HEADERS`; `proxy.ts` sets them on every response | all | add per-route header code |
| Root interceptor | `proxy.ts` | kill switch first (`killSwitchFor`), AD-21 headers, top-level navigation to `/` or `/account`: aged/unsealable session → 307 `/auth`, valid → re-seal `lastSeen`; `NO_STORE_HEADERS` on every `/`, `/account`, `/handoff/**` response (`isNoStorePath`, F6-1; Next 16 replaces `Vary` on rendered pages and uses its own no-store value on a 404) | 1.6, 1.16, 7.2 | add a `middleware.ts` |
| HTTP helpers | `lib/server/http/responses.ts`, `cache-headers.ts`, `content-type.ts`, `guard-route.ts` | `jsonError(status, code)`, `jsonOk`, `jsonResponse`, `noContent`, `seeOther(url)`, `methodNotAllowed()`, `SERVICE_DISABLED_RETRY_AFTER`; `withNoStore`, `NO_STORE_HEADERS`; `isJsonRequest` (415 check); `guardRoute(route, handler)` (500 wrapper) | every route | hand-build error bodies; use `NextResponse.redirect` (banned) |
| Upstream fetch | `lib/server/http/fetch-with-timeout.ts`, `upstream-url.ts` | `fetchWithTimeout(url, init, { timeoutMs, bodyIdleMs })` (25 s to headers, 10 s idle per body chunk), `UpstreamBodyTimeoutError`, `discardBody`; `buildUpstreamUrl(apiRoot, segments, query)` | proxy, named ops | `new URL(input, base)` for upstream URLs; call `fetch` without a timeout |
| Capped reads | `lib/server/http/read-capped.ts` | `readCapped(request, maxBytes)` (413 `TOO_LARGE`, bad Content-Length), `readStreamCapped(stream, max)` | proxy, `/api/token`, named ops | `request.text()` / `request.json()` on untrusted bodies |
| Image sniffing | `lib/server/http/image-sniff.ts` | `sniffImage(bytes)` → `png|jpeg|bmp|webp|null`, `peekStream`, `IMAGE_CONTENT_TYPES` | `asImage` entries, uploads, org logo | trust `Content-Type` or a file name |
| Server log | `lib/server/log.ts` | `logRequest({ requestId, method, routeTemplate, status, durationMs })`, `logError`, `logWarning`, `newRequestId`, `setLogSink` (tests) | all server code | log bodies, tokens, codes or PHI |
| Session | `lib/server/session/session.ts`, `types.ts` | `SESSION_COOKIE` (`__Host-pp_s`), `getSession(request, now)`, `requireSession(now)`, `sealSession`, `unsealSession`, `buildSessionSetCookie`, `clearSessionSetCookie`, `renewLastSeen`, `isSessionAged`, `IDLE_TIMEOUT_MS` (15 min), `ABSOLUTE_TIMEOUT_MS` (8 h), `MAX_SET_COOKIE_BYTES`; `SessionPayload` | routes, named ops | store anything new in the cookie without checking the 3,800-byte budget |
| Refresh / revoke | `lib/server/session/refresh.ts`, `revoke.ts`, `session-routes.ts` | `isAccessTokenFresh`, `EXPIRY_SKEW_MS` (30 s), `canRenewLastSeen`, `refreshSession`; `revokeAllDevices(apiRoot, token, ctx)`; `createRefreshHandler`, `createPingHandler`, `createLogoutHandler`, `sessionExpiredResponse(request)` | 1.5–1.7 (done) | refresh inside the proxy (the client coordinates refresh) |
| Environment cookie | `lib/server/session/environment-cookie.ts` | `ENVIRONMENT_COOKIE` (`onehealth_environment`), `environmentSetCookie`, `parseEnvironmentCookie`, `resolveEnvironment` | `/auth`, disabled screen | treat it as authoritative (display only) |
| Page session | `lib/server/page-session.ts` | `requirePageSession(now)` → `{ portalUrl, idle }` (no session → redirect `/auth`); `rememberedEnvironment()` | every page (`/`, `/account` 7.1) | read cookies in pages yourself |
| Launch | `lib/server/launch/{lpl-crypto,exchange,launch,token-handler}.ts`, `app/api/token/route.ts`, `app/auth/page.tsx` | `createTokenHandler`, `launch`, `decryptLpl`, `exchangeCode`, `launchErrorMessage` | 1.2 (done) | add another launch path (`/launch` routes are banned) |
| Proxy | `app/api/1h/[...path]/route.ts`, `lib/server/proxy/{handler,normalize,match,forward,deny-list,types,upload}.ts` | `createProxyHandler`; `AllowlistEntry` (`method`, `template` with `{personId}`/`{userId}` owner slots and `{name}` numeric ids, `query` rules, `fixedQuery`, zod `body`, `asImage`, `upload` + `maxBytes`, `profile`); `DENY_RULES` + `isDenied` (checked before the allowlist and again after owner substitution); `readUpload`, `sanitizeFileName`, `UPLOAD_OVERHEAD_BYTES` | every feature read/write | add entries anywhere but the area file; widen the deny list's targets |
| Allowlist areas | `lib/server/proxy/allowlist/{core,personal,contacts,addresses,insurance,files,account,mfa,npi,orgs}.ts` (aggregated by `index.ts` → `ALLOWLIST`) | Shipped entries: `GET v2/user/myself`, picture upload (`core`, `IMAGE_UPLOAD_MAX_BYTES` 4 MB); `PUT v2/user/edit` with the full `userEditBodySchema` (`RACES`, `ETHNICITIES`, `BIOLOGICAL_GENDERS`; `email`; `phoneNumber` + `phoneNumberRegion` only together), signature upload + `v2/file/{fileId}/version` (`personal`, `SIGNATURE_MAX_BYTES` 1 MB); `GET v2/user/contact-point/list?type=Email|Mobile|Landline|Social Media` (`contacts`); `GET v2/file/{fileId}/download` `asImage` (`files`); insurance card front/back uploads (`insurance`). `addresses`, `account`, `mfa`, `npi`, `orgs` are empty, ready for their stories. | every story with an endpoint | edit `index.ts`; put `/account` single-story entries without `profile: true` |
| Named-op wrapper | `lib/server/named-op.ts` | `createNamedOp(config, deps)`: kill switch → method (405) → session → query (default none) → params → JSON body (415/400 `BAD_BODY`, 16 KiB) → token freshness → `handle(ctx)`. `ctx` = `{ request, requestId, session, env, now, query, params, body, upstream, setOutcome }`. `ctx.upstream.json({ method, segments, query?, body? })` → `ok` / `client-error` / `failed` (401→`TOKEN_EXPIRED`, 3xx→502 `UPSTREAM_REDIRECT`, 5xx→502, timeout→504). Also `failureResponse`, `relayClientError`, `NAMED_OP_MAX_BODY_BYTES`. | 1.9, 4.3, 8.2, 9.3, 10.2, new ops | write a bare `route.ts` with its own session/kill-switch logic; send named-op traffic through the allowlist |
| Named ops (server) | `lib/server/named-ops/{profile-picture-id,mfa-validate,practice-support,org-logo,places}.ts`, routes `app/api/pp/{profile-picture-id,mfa/validate,practice-support,org-logo/[tenantId]}`, `app/api/places/{autocomplete,details}` | `GET /api/pp/profile-picture-id` → `{ fileId: number \| null }` (`"pp"`); `POST /api/pp/mfa/validate` `{ code }` → boolean (`"account"`); `GET /api/pp/practice-support` → `{ name?, phone?, phoneRegion?, email? }`, 404 `NO_PRACTICE` (`"account"`); `GET /api/pp/org-logo/<tenantId>` image or 404 `NO_LOGO` (`"account"`); `POST /api/places/autocomplete` `{ input, countryCode, lookupId }`, `/details` `{ placeId, lookupId }` → `{ enabled:false }` unless `PLACES_ENABLED=1` (`"pp"`). Contract types in `lib/shared/bff-contract.ts`. | 1.9, 4.3, 8.2, 9.3, 10.2 | re-implement them in a feature; call Google from the browser. Client loaders for these ops are **not** built yet; each story adds its `lib/api/<op>.ts` |
| Kill switches | `lib/server/kill-switch.ts`, `lib/server/disabled-screen.ts`, `app/disabled/route.ts` | `killSwitchFor(pathname)` → `"pp" \| "account" \| null`, `isSwitchedOff`, `normalizePath`; disabled screen HTML (503, `Retry-After: 300`, light/dark, "Go to 1health" link); copy `DISABLED_MESSAGES` | 1.16, 7.2 | add per-page disabled UI; forget to add new `/account`-only route prefixes to the `"account"` list |
| BFF contract | `lib/shared/bff-contract.ts` | `BFF_ERROR_CODES` / `BffErrorCode`, `BFF_ERROR_SOURCE` (`"proxy"`), `BFF_PATHS` (proxy prefix, token, session refresh/logout/ping, every named op, `handoffPortal` `/handoff/portal`), request/response types for every named op, `ACTIVITY_HEADER`, `ACTIVITY_AT_HEADER`, `PageIdleTiming`, `LaunchOkBody`, `LaunchErrorBody` | client and server | duplicate a path string or code |

### 3.2 API client and data (`lib/api`, import from `@/lib/api`)

| Module | Path | What it gives (key API) | Use it for (stories) | Do not |
|---|---|---|---|---|
| Transport | `lib/api/client.ts`, `types.ts` | `callApi<T>(context, path, init?)` → `ApiResponse<T>` `{ success, data?, error?, statusCode?, errorCode?, source?, upstreamCode?, platformMessage?, details?, retryable?, userMessage? }`; never throws; JSON headers; `credentials: same-origin`; refresh + replay on `TOKEN_EXPIRED`; `X-PP-Activity: user` on writes and `init.userInitiated` reads; `configureApiClient`, `getPortalUrl`, `createCallApi` (tests) | every call | `fetch`; parse error bodies yourself; publish session events |
| Session events | `lib/api/session-events.ts` | `sessionEvents.subscribe("session-expired", fn)`, `hasPublished`, `publish` (only `callApi` and `IdleWarning` publish) | shell | add other event kinds (`session-changed` is banned, D5) |
| Refresh coordinator | `lib/api/refresh-coordinator.ts` | single-flight + `navigator.locks` (`REFRESH_LOCK` `pp-refresh`) | internal to `callApi` | call `/api/session/refresh` yourself |
| Activity | `lib/api/activity.ts`, `session.ts` | `activity` (`pp-activity` BroadcastChannel), `createActivity`; `recordUserActivity()` (ping), `startSession(lpl)`, `endSession()` | idle logoff; Retry and page moves already call `recordUserActivity` | mark polling reads as user activity |
| Paths | `lib/api/config.ts` | `proxyPath("v2/…")` → `/api/1h/v2/…` | every module | build absolute or environment-specific URLs |
| SWR keys (reads only; live searches use the Combobox `load`, never a key: §4.4) | `lib/api/keys.ts` | `keys.myself()`, `profilePictureId()`, `typeKey(type)`, `contactPoints(type)` (`ContactPointType` = `Email|Mobile|Landline|Social Media`), `addresses()`, `insurance()`, `npi()`, `practiceSupport()`, `orgs(name, page)`; `SWR_RESOURCES`, `isSwrKey`; `mutateMyself()`, `mutateContactPoints(...types)` | every read; revalidate after writes | inline `["pp", …]` tuples (lint-banned outside keys.ts); mount another `SWRConfig` |
| Fetcher registry | `lib/api/fetcher.ts`, `index.ts` | `registerFetcher(resource, loader)` (throws on a second loader except under `next dev`), `swrFetcher` (root fetcher), `unwrap(promise)`, `ApiResponseError`, `fetchers.{myself,contactPoints}` (frozen, F6-3: never add entries); planned modules `personal`, `profile-picture`, `addresses`, `places`, `insurance`, `account`, `mfa`, `npi`, `organizations`, `practice-support` (paths and constants) and the shared `type-keys` loader (`keys.typeKey("Person"\|"ContactPoint"\|"Insurance")`, `valueListOptions(info, attrKey)`), all re-exported with `export *` | each `lib/api/<resource>.ts` registers its own loader; never edit `index.ts` | a `switch` of resources; one module registering another's loader |
| `Myself` | `lib/api/myself.ts` | `Myself` (id, personId, username, names, `namePrefix`, `nameSuffix`, `otherNames`, `titles`, `birthDate` (`YYYY-MM-DD` or null), `cityOfBirth`, race, ethnicity, `biologicalGender`, `genderIdentity`, `sexualOrientation`, masked `socialSecurityNumber`, `signature {id,name}`, `email`, `phoneNumber`, roles, `preferredLanguage`, `timeZone`, `locale`, `tenants`, `mfaEnabled`, `totpEnabled`; all nullable except `id`), `toMyself`, `fetchMyself`, `loadMyself`, `myselfPath`, `isProctor(roles)`, `isTenantMember(myself, tenantId)` | 1.9, 2.x, 7.4–7.6, 8.1, 9.3 | extend or re-map `myself` in a feature; expect `phoneNumberRegion` on it (it isn't there; use `primaryPhoneRegion`) |
| Contact points | `lib/api/contact-points.ts` | `ContactPoint`, `fetchContactPoints(type)` (one type per call), `toContactPoints`, `findPrimary`, `PRIMARY_LABEL`, `primaryPhoneRegion(mobileRows, myself)`, `contactPointsPath`, `CONTACT_POINT_TYPES`, `isContactPointType` | header, 3.x, 7.6 | fetch several types in one call |
| Files | `lib/api/files.ts` | `fileDownloadPath(fileId)` (positive integer ids only, else `null`), `isFileId` | 2.1, 2.4, 5.1, 9.3 | build download URLs by hand |
| Error mapper | `lib/api/errors/{index,core}.ts` + areas `{personal,contacts,addresses,insurance,account,mfa,npi,orgs}.ts` | `mapApiError(scope, response)` / `mapFetchError(scope, error)` → `MappedError` = `forbidden` \| `network` \| `session` \| `generic { message? }` \| `field { field, messageKey }` \| `coded { code }`; `ErrorScope` = `SectionId` ∪ `authenticator|provider|organizations|page`; `mappedErrorCode()`; `ERROR_RULES`, `MessageRule`. Shipped rules: SSN taken → `personal`/`ssn`; email in use → `account`/`primaryEmail`; contact duplicates → `phone|email|social`/`value`; `MFA_NOT_ENABLED`, `TOTP_ALREADY_ENABLED`; NPI taken → `provider`/`personalNpi` or `practiceNpi` (F6-3; the `NPI_ALREADY_REGISTERED` code is kept but no rule emits it) | every write and read failure | match `error`/`platformMessage` text in a feature; show raw upstream text except `generic.message` |
| 403 owner table | `lib/api/errors/forbidden-scope.ts` | `forbiddenScopeFor(path, "profile" \| "account")` → `{ owner, level: tab|section|control|popover }` or `null`; `FORBIDDEN_SCOPE_TABLE`, `normalizeForbiddenPath` | 3.1, 3.5, 3.7, 7.1, 7.6, 8.x, 9.x, 10.1 | decide no-access scope ad hoc |
| Codes | `lib/api/errors-codes.ts` | `ApiErrorCode` = `BffErrorCode` ∪ `NETWORK_ERROR|FORBIDDEN|MFA_NOT_ENABLED|TOTP_ALREADY_ENABLED|NPI_ALREADY_REGISTERED`, `parseErrorBody` | mapper internals | read codes outside the mapper |
| Dev logging | `lib/api/log-api-call.ts` | `logApiCall`, `redact` (SSN-shaped, MFA `code`, `qrCode`, `lpl`, tokens); only under `next dev` | internal | log responses in features |

### 3.3 Shared utilities (`lib/shared`)

| Module | Path | What it gives (key API) | Use it for (stories) | Do not |
|---|---|---|---|---|
| App env | `lib/shared/app-env.ts` | `isLocalDev()`, `isProductionBuild()` | dev-only behaviour, dev throws | read `NODE_ENV` elsewhere |
| Section ids | `lib/shared/section-ids.ts` | `SECTION_IDS` = `personal, phone, email, social, addresses, insurance, account`; `SectionId` | registry, telemetry, mapper scopes | invent ids |
| Dates | `lib/shared/dates.ts` | wire `YYYY-MM-DD` ↔ display `MM/DD/YYYY` without timezone shift: `parseWireDate`, `parseDisplayDate`, `wireToDisplayDate`, `displayToWireDate`, `formatWireDate`, `formatDisplayDate`, `localCalendarDate`, `compareDates`, `minusYears`, `wholeYearsBetween`; bounds `DateBounds`, `parseDateBounds`, `isWireDateWithin`; mask helpers `maskDisplayDate`, `pastedDisplayDate`, `DISPLAY_DATE_LENGTH` | 2.1, 2.2, 5.2, 7.4, 7.5 | `new Date("YYYY-MM-DD")` (UTC shift); date-fns for wire parsing |
| Person rules | `lib/shared/person-rules.ts` | `NAME_MAX_LENGTH` 24, `PREFIX_SUFFIX_MAX_LENGTH` 10, `SHORT_TEXT_MAX_LENGTH` 128, `normalizeName`, `nameIssue`, `textIssue`, `hasProctorRole`, `birthDateAgeRange(roles)` (18–120, Proctor 21–120), `isBirthDateInRange(date, roles, today)`, `birthDateBounds(roles, today)` (same as the backend's `minusYears` rule) | 2.2, 7.5 (schemas and DateInput bounds) | re-code length or age rules (the proxy uses the same helpers) |
| Phone | `lib/shared/phone.ts` | `formatPhoneDisplay(value, region)` (US `+1 (415) 555-2125`, else international; unparsable → raw), `normalizeRegion` (empty/`n/a` → `us`), `DEFAULT_PHONE_REGION`; F6-2: `phoneRegions(locale)`, `regionFlag`, `dialCodeOf`, `isPhoneRegion`, `phoneDigits`, `isPhoneTooLong`, `clampPhoneInput`, `formatPhoneInput`, `parseInternationalPhone`, `phoneInputFrom(saved, region)`, `phoneIssue` (`required` \| `tenDigits` (+1 regions) \| `invalid`), `toE164`, `EMPTY_PHONE_INPUT` | header, 3.x, 7.4, 7.6, 9.3 | format phones by hand |
| Safe href | `lib/shared/safe-href.ts` | `safeHref(value, protocols?)` (`https:`/`mailto:`/`tel:` by default) → string or `undefined` | 3.7, 9.3, 10.2 | put user/org URLs in `href` unchecked |
| Telemetry | `lib/shared/telemetry.ts` | `telemetry.track(event, payload)` (no-op sink, never throws): `section_save`, `save_all`, `mfa_link`, `draft_fields_dropped`; `TelemetryErrorCode`; `setTelemetrySink` | `useSectionForm`, `runSaveAll` emit already; 8.2 `mfa_link` | send field values, ids or free text |
| Initials | `lib/shared/initials.ts` | `initials(...names)` (first letter of each, astral-safe) | header | the org-name rule of 10.1 (first two words; add it beside this one) |
| Deep equal | `lib/shared/deep-equal.ts` | `deepEqual(a, b)` (an undefined-valued key counts as absent) | dirty checks | a second dirty comparator |
| Login intent | `lib/shared/login-intent.ts` | `saveLoginIntent`, `consumeLoginIntent`, `consumeLaunchIntent` (only `/`) | session dialog, `/auth` | store arbitrary return URLs |
| Message catalog | `lib/shared/messages/index.ts` | `MESSAGE_CATALOG`, `MessageKey` (`"<group>.<key>"`), `messageFor(key)`, `formatMessage(template, values)`, `SECTION_LOAD_NOUNS`, `LoadNounSection`, `LAUNCH_MESSAGES`, `LAUNCH_ERROR_MESSAGES` | all UI copy | hard-code strings in components or schemas |

**Message areas** (`lib/shared/messages/<file>.ts` → constant → `MESSAGE_CATALOG.<group>`). Every planned area is pre-created. Some are empty `{}` until their story.

| File | Constant | Holds |
|---|---|---|
| `common.ts` | `COMMON_MESSAGES` | Cancel, Save, Retry, Discard, Restore, Not provided, "(optional)", toast close; F6-3: Close, Remove, Delete, Replace, Clear, Submit, Back, Previous, Next, "More actions for {name}", Primary, Make primary, Verified, Not verified, Verify, Resend verification |
| `controls.ts` | `CONTROL_MESSAGES` | Loading…, generic popover load error, Try again., Choose date, MM/DD/YYYY |
| `combobox.ts` | `COMBOBOX_MESSAGES` | Searching…, No more results, `Add “{name}”`, NPI placeholder/no matches, address/insurer/gender-identity help, result counts, Cleared, Clear {label} |
| `shell.ts` | `SHELL_MESSAGES` | app bar, tabs, Section labels, Jump to, Sections, column headers, signature, tab placeholders |
| `section.ts` | `SECTION_MESSAGES` | Edit, Editing, Unsaved changes, There are no changes, saveFailed, network save error, invalid counts, All saved., partial summary; F6-2: Removed on save, New · not saved, Actions, +{count}, Country code, Enter a valid phone number |
| `state.ts` | `STATE_MESSAGES` | page load error, "Couldn't load {section}", load nouns, frame loading label, no access |
| `drafts.ts` | `DRAFT_MESSAGES` | restore/conflict sentences, Your version, Current, Keep mine, Use current |
| `header.ts`, `leave-guard.ts`, `session.ts` (`SESSION_EXPIRED_MESSAGES`), `idle.ts`, `launch.ts`, `disabled.ts` | — | shell dialogs, header, launch, disabled screen |
| `person.ts` | `PERSON_MESSAGES` | name, birth-date and age-range validation, SSN taken |
| `contacts.ts` | `CONTACT_MESSAGES` | duplicate phone/email/social, `phoneTenDigits` |
| `account.ts` | `ACCOUNT_MESSAGES` | primary email in use (7.6) |
| `npi.ts` | `NPI_MESSAGES` | `personalNpiTaken`, `practiceNpiTaken` (9.2; field rules `personalNpi`/`practiceNpi` in `lib/api/errors/npi.ts`), `practiceSupportLoadError` (9.3) |
| `addresses.ts`, `insurance.ts`, `mfa.ts`, `orgs.ts`, `places.ts` | — | empty, ready for Epics 4, 5, 8, 10 and Story 4.3 |

### 3.4 Shell (`features/shell`, import from `@/features/shell`; header from `@/features/header`)

| Module | Path | What it gives (key API) | Use it for (stories) | Do not |
|---|---|---|---|---|
| Page frame | `page-frame.tsx` | `PageFrame({ page: "profile" \| "account", header, idle, saveOrder?, saveAllSlot? (profile only) })`: app bar, header, Section registry, drafts, leave guard, session dialog, idle warning, current page, and one page banner for a failed `myself`. A Section that shows its own `myself` load error (2.1, 7.4, 8.1) calls `useClaimMyselfError(Boolean(error))`; the page banner hides only while a mounted Section holds a claim, so a tab without one still shows it (F6-1 review) | `/` (built), `/account` (7.1) | mount any of these yourself; render a Save-all bar on `/account` |
| Page composition (F6-1) | `profile-tabs.tsx`, `account-tabs.tsx`, `contacts-panel.tsx`, `insurance-panel.tsx`, `anchored-panel.tsx`, `placeholders.tsx`, `section-frame.tsx`, `save-order.ts` | Composition happens only in `app/**`: `ProfileTabs({ contacts?, insurance?, medical? })`, `ContactsPanel({ sections?: Partial<Record<ProfileSectionId, ReactNode>> })`, `InsurancePanel({ section? })`, `AccountTabs({ personal?, provider?, organizations? })`, `AccountPersonalPanel({ account?, authenticator? })` (deep links `#account`/`#authenticator` with h2 focus), generic `AnchoredPanel({ anchors, focusHeading?, subAnchors? })`; missing slots show `ProfileSectionPlaceholder({ id })`, `AccountSectionPlaceholder({ id })`, `AccountTabPlaceholder({ tab })`. `useSectionFrame(id: SectionFrameId)` → `{ onReady }` for the Section's `StateFrame` (deep-link re-scroll; a ready also makes the scroll-spy re-observe its landmark). **A composed Section renders its `SectionLandmark id` on its first render (loading included) and never remounts it**; `ContactsPanel` and `AnchoredPanel` log a `console.error` outside production when an expected landmark is missing after mount (`useLandmarkCheck`). `SAVE_ORDER` (personal → email → phone → social → addresses) and the `features/save-all` stub `SaveAllBar` (renders nothing until 1.14) are wired into `PageFrame saveOrder` / `saveAllSlot` on `/`, one prop per line. Feature entry points (stubs until their story): `features/{personal,contacts,addresses,insurance}` (`PersonalSection`, `PhoneSection`, `EmailSection`, `SocialSection`, `AddressesSection`, `InsuranceSection`) composed in `app/page.tsx`; `features/{account,mfa,provider,organizations}` (`AccountSettingsSection`, `AuthenticatorSection`, `ProviderTab`, `OrganizationsTab`) for `app/account/page.tsx` (7.1) | every Section story: replace your stub's body, keep its export; 7.1: `app/account/page.tsx` composes `AccountTabs` + `AccountPersonalPanel` with the stubs | edit shell files or another feature's folder to plug a Section in; render a Section without its `SectionLandmark id` |
| Providers | `portal-url-provider.tsx`, `swr-provider.tsx`, `use-myself.ts` | `PortalUrlProvider`, `usePortalUrl`; `SwrProvider` (the one root `SWRConfig`, in `app/layout.tsx`); `useMyself()` → `{ myself, error, isLoading, retry }` | every page | a second `SWRConfig`; fetch `myself` another way |
| App bar | `app-bar.tsx`, `page-nav.tsx`, `return-link.tsx` | `AppBar`, `PageNav`, `ReturnLink` | 1.8 (done), 7.1 | a per-page app bar |
| Tabs | `page-tabs.tsx`, `page-tabs-config.ts`, `components/ui/tabs.tsx` | Generic, prop-driven (F6-1): `PageTabs({ page, tabs: PageTabDefinition[] ({ id, label, comingSoon?, bare?, skipInTabOrder? }), panels: Record<id, ReactNode>, defaultTab, "aria-label"? })`; the config is checked outside production (`assertPageTabsConfig`: unique ids, `defaultTab` among them, every id routable; throws) and clicks route by the configured ids; the query param is page config (`PAGE_TAB_PARAM[page]`, `tab` on both pages); a missing, unknown or repeated `?tab=` opens `defaultTab` and is normalized by replace; configs `PROFILE_TAB_DEFINITIONS`, `ACCOUNT_TAB_DEFINITIONS`, tablist names `PAGE_TAB_LIST_LABELS` ("Profile sections", "Account sections"); presets `ProfileTabs`, `AccountTabs`; `PROFILE_TABS`, `ACCOUNT_TABS`, `isProfileTab`, `isAccountTab`, `TAB_PARAM`, `pageTabTarget`, defaults | 1.8, 7.1 | change tabs with links (use `navigate`); hard-code a page's tabs inside `PageTabs` |
| Navigation | `navigate.ts`, `leave.ts`, `exit-hooks.ts`, `nav-types.ts` | `useNavigate()` → `(target: NavTarget) => Promise<boolean>`; `NavTarget` = `{ page, tab?, hash? }` (the tab goes in `PAGE_TAB_PARAM[page]`) \| `{ external: "portal" }` \| `{ external: "handoff", href }` (F6-1: only an `href` on `BFF_PATHS.handoffPortal` is followed, else `false`; build it with `handoffHref({ to: "tenant", tenantId } \| { to: "create-org" })` from `handoff.ts`, tenant id `^\d{1,19}$` and positive, a bad one throws outside production and gives the bare route in production); `requestLeave()`, `setLeaveGuard`; `onBeforeExit`, `onBeforeSessionExpired`; `PAGE_PATHS`, `CurrentPageProvider`, `useCurrentPage` | 1.7, 7.1, 7.3, 9.3, 10.1, 10.3 | `next/link`, raw `<a href>` to app pages or the portal, `router.push` (lint-banned outside the shell) |
| Leave guard | `leave-guard.tsx` | `LeaveGuard` (mounted by `PageFrame`): Keep editing / Discard / Save; validate-first; Save runs `runSaveAll({ includeGuardOnly: true })` in `saveOrder`; failure → summary toast + focus first failed `h2`; `beforeunload` while dirty | 1.13, 7.1 | a feature-level unsaved-changes dialog (a scoped Sheet guard is Team A, 1.13) |
| Session dialog / idle | `session-dialog.tsx`, `idle-warning.tsx` | `SessionDialog` ("Your session ended", runs `onBeforeSessionExpired`, saves login intent); `IdleWarning` (60 s warning, "Stay signed in" pings); `IDLE_*` constants | 1.6, 1.7 (done) | handle `SESSION_EXPIRED` in a feature (map it to `session` and render nothing) |
| Section registry | `section-registry.tsx`, `nav-types.ts` | `useRegisterSection(registration)`, `useSectionRegistry()` (`getDirty`, `getDirtyCount`, `isAnyDirty`, `subscribe`, `observe`, `get`), `useDirtyCount()`, `useIsAnyDirty()`; types `SectionRegistration`, `SaveResult`, `SaveError { code?, mapped?, failedParts? }`, `ValidateResult` (`invalidCount`, `focusFirstInvalid`), `SESSION_EXPIRED_CODE`, `isSessionExpired`, `sectionHeadingId(id)` (`<id>-heading`), `AccountSavePart`, `DraftValues`, `DraftDiffRow`, `SectionDataStatus` | every Section (via `useSectionForm`); guard-only participants (5.2 Insurance editor: `saveAll: false`) | a second registry; register a Section twice |
| Section form | `use-section-form.ts` | `useSectionForm({ id, label, displayOrder, schema, baseline, save(values, baseline), saveAll?, onNoChanges?: "close" \| "status", successToast?, cancelFocus?: "heading" \| "edit", fieldOrder?, errorFields?, describeError?, draftFields?, dataStatus?, describeDraftDiff?, revealField?(path) → boolean, confirmBeforeSave?(values) → Promise<boolean> })` (`confirmBeforeSave`: asked after validation and before the saving state on the own Save and the registered save; `false` → `CANCELLED`) → `{ form, mode, isEditing, isSaving, isDirty, baseline, startEdit({ focus? }), cancel, submit, rebase, field(name), errorFor(name), editButtonProps, footerProps }`. Includes react-hook-form + zod (`onBlur`), deep dirty check, `readOnly` while saving, single send, first-invalid focus (hidden fields revealed first through `revealField`, F6-1), a `save()` result `{ ok: false, error: { code: "CANCELLED" } }` (`CANCELLED_CODE`) stays in edit with no error, no focus move and no telemetry, mapped field and Section errors, network `toastError` with Retry, success toast + focus, `section_save` telemetry, registration and draft wiring. | 1.11, 2.2, 2.4, 3.2, 3.5, 3.7, 4.2, 5.2, 7.5, 7.6 | write your own edit/save state machine; toast from a registered `save()` (only the Section's own Save toasts) |
| Section chrome | `section-landmark.tsx`, `section-header.tsx`, `section-container.tsx`, `section-footer.tsx` | `SectionLandmark({ id, title, tools?, children })` (`<section>` + 44 px `h2`); `SectionHeader({ id, title, count?, editing, actions? })`; `SectionContainer({ editing, sectionId?, children })` (editing border + halo, **renders the draft notice when `sectionId` is set**); `SectionFooter` (spread `footerProps`; `addRow?: { label, onClick, disabledReason? }`) | every Section | hand-roll headings, editing borders or footers |
| Key/value tables | `key-value-table.tsx` | `KeyValueTable({ rows: { key, label, value?, rowId? }[], labelledBy })` (desktop four columns, mobile one pair per row, "Not provided"); `KeyValueEditTable({ rows: { key, label, render(control), optional?, required?, help?, error?, labelAddon?, rowId? }[] })` | 2.1, 2.2, 5.1, 7.4, 7.5, 9.1, 9.3 | CSS-hidden desktop/mobile twins |
| Save runners | `run-save-steps.ts`, `save-all.ts` | `runSaveSteps(steps: { part, skip?, run }[], { scope, mode: "stop" \| "attemptAll", refetch?, rebase?, applySucceeded? })` → `{ ok, succeeded, error?: { code, mapped, failedParts } }`; `runSaveAll(registry, { order?, includeGuardOnly?, trackTelemetry? })` → `clean \| invalid \| session \| done` (`saved`, `failed`, `cancelled`: a `CANCELLED` save is its own bucket, never in `failed` or the `save_all` failed count; the leave guard stays open quietly on a cancel), `saveAllSummary(outcome)` (no "failed" copy for cancels: "{Section} saved." / "{N} saved." / nothing) | multi-request saves (2.4, 3.x, 4.x, 5.4 `stop`; 7.5 `attemptAll`); Save all bar 1.14 | loop over requests by hand; build a second Save-all runner |
| Read states | `state-frame.tsx` (`read-state.tsx` re-exports) | `StateFrame({ state: "loading" \| "ready" \| { error }, skeleton: "table" \| "kv" \| "tiles" \| "bars" \| "cards", columns?, loadError: { kind: "section", sectionId } \| { kind: "page" }, level: "section" \| "tab", onRetry, attempt?, anchors?, onReady?, barWidth?: "control" \| "wide" })` (F6-1: `tiles` = one row of five 112 px squares from 768 px, 3-column grid below; `cards` min height 248 px; `bars` 480 px, `wide` 720 px for 9.1); `LoadError`, `NoAccess({ level })`, `ReadStateFor`, `FrameSkeleton`, `ORG_GRID_CLASSES`, `loadErrorMessage` | every read (2.1, 3.x, 4.1, 5.1, 7.1, 7.4, 8.1, 9.1, 10.1) | per-feature skeletons, spinners or error banners; forget `attempt` (re-announce) |
| Signature thumb | `signature-thumb.tsx` | `SignatureThumb({ fileId, fallback, alt? })` (112×32, skeleton, error → fallback) | 2.1, 2.4 ("Not provided"), 9.3 ("No signature available") | load the signature image another way |
| Section navigation | `anchors.ts`, `section-nav.tsx`, `use-hash-anchors.ts`, `hand-scroll.ts`, `section-counts.tsx`, `contacts-panel.tsx`, `insurance-panel.tsx` | `PROFILE_SECTIONS`, `PROFILE_SECTION_IDS`, `PROFILE_SUB_ANCHORS`, `SIGNATURE_ANCHOR`, `ACCOUNT_ANCHORS` (`account`, `authenticator`), `AccountSectionId` (anchors + `provider`, for `SectionLandmark`/`SectionHeader`; not an anchor), `SECTION_COLUMNS`; `SectionNav` + `useSectionNavigation()` (menu, Jump to, scroll-spy); `useHashAnchors(ids, { focusHeading, subAnchors, onFollow })` → `{ frameReady, cancelPending }`; `onHandScroll`; `SectionCountProvider`, `useReportSectionCount(id, n)`; `ContactsPanel`, `InsurancePanel` (slots, see Page composition) | 2.x–5.x fill the slots through their feature stubs; 7.1 uses `AccountPersonalPanel` (which mounts `useHashAnchors(ACCOUNT_ANCHORS, { focusHeading: true })`) | a second scroll-spy or hash handler; call `navigate()` for in-page jumps |
| Drafts | `drafts.ts`, `draft-provider.tsx`, `draft-banner.tsx`, `draft-compare.tsx` | Key `pp:draft:v1:<environment>:<userId>:<sectionId>` in `localStorage`, 500 ms debounce, flush on session expiry, `pagehide` and `visibilitychange`, 24 h purge, portal-exit purge, restore/conflict banner + compare. Exports: `DraftsProvider` (mounted by `PageFrame`), `useSectionDraft`, `SectionDraftNotice`, `DraftCompare`, `DRAFT_DEBOUNCE_MS`, `DRAFT_DENYLIST`, `DRAFT_MAX_AGE_MS`, `defaultDraftDiff`. A Section opts in with `useSectionForm` `draftFields` + `describeDraftDiff` + `dataStatus` and `SectionContainer sectionId`. | 2.2, 3.2, 3.5, 3.7, 4.2, 7.5 | touch `localStorage` (the store is deliberately not exported); draft denylisted fields; draft a guard-only participant |
| Toasts | `toasts.ts`, `components/ui/{toast,toaster}.tsx` | `toastSuccess(text)`, `toastPartial(text)`, `toastError(text, { onRetry })` → `{ id, dismiss }`; `SUCCESS_TOAST_MS`, `PARTIAL_TOAST_MS`; limit 3 (errors never evicted); `--toast-bottom-offset` CSS variable for the Save-all pill | every save outcome | import `@/hooks/use-toast` (lint-banned) |
| Row kit | `row-actions.tsx`, `row-removal.tsx`, `section-table.tsx` | `RowActions({ actions: { id, label, onSelect, inline?, destructive?, disabledReason? }[], name, showInline?, kebabRef? })` (desktop inline actions fade in on `group/row` hover/focus with a fine pointer, always visible on touch; 44 px kebab "More actions for {name}" repeating every action; a menu item runs after focus is back on the kebab, so its dialog returns there; renders nothing without a usable action); `RowRemoval({ state, onRemove, onRestore, disabledReason?, statusId? })` (Remove / "Restore", focus kept across the swap, Restore described by `RowEditStatus id`), `RowEditStatus({ state, id? })` ("New · not saved" / "Removed on save"), `RowEditState`, `ROW_EDIT_STATE_CLASSES`; `SectionTable<R>({ rows, columns: { key, header, cell(row, { layout, headerId }), className?, width?, mobileLine? }[], getRowKey, labelledBy?, actions?(row, "table" \| "card"), actionsWidth?, editing?, rowState?, renderExpanded?(row), empty?, getRowId? })` (fixed-layout table ≥ 768 px with wrapping cells; below, cards: read view line 1/line 2, edit view one labelled block per column; `renderExpanded` = one full-width cell / card body). **The layout swaps at 768 px by remounting the cells: keep per-row state (expanded, drafts) in the Section, not in cell components.** | 1.11, 3.1–3.7, 4.1, 4.2, 4.4 | per-Section tables, kebabs or removal state |
| Countdown | `use-countdown.ts` | `useCountdown({ onDone? })` → `{ remaining, running, start(seconds), stop() }` (deadline-based) | 3.3/3.6 resend 60 s, 2.3 SSN 30 s | `setInterval` counters in features |
| Media query | `use-media-query.ts` | `useMediaQuery(query)`, `DESKTOP_QUERY` (`(min-width: 768px)`) | layout switches | duplicate breakpoints |
| Launch UI | `auth-screen.tsx`, `launch-flow.ts` | `AuthScreen`, `runLaunchFlow`, `MAX_AUTH_ATTEMPTS`, `AUTH_RETRY_DELAY_MS` | 1.2 (done) | — |
| Profile header | `features/header/*` | `ProfileHeader` (initials avatar, name `h1`, primary phone and email ≥ 768 px), `displayName` | `/`, `/account` | a second header (1.9 adds the picture to this one) |

### 3.5 UI primitives (`components/ui`)

| Component | Path | What it gives (key API) | Use it for (stories) | Do not |
|---|---|---|---|---|
| Button | `button.tsx` | variants incl. `link`, `destructive` (on `destructive-fill`), size `touch` (44 px); `busy`, `busyLabel` (spinner, `aria-busy`, inert, focus kept, polite status); `aria-disabled` makes it inert | every action | `disabled` on focusable actions that need a reason (use `DisabledAction`) |
| DisabledAction | `disabled-action.tsx` | `DisabledAction({ reason, wideReason?, …buttonProps })` (aria-disabled, stays in the tab order, no-op, reason in a Tooltip + `aria-describedby`, always `type="button"`) | 1.11, 3.2–3.7, 4.4, 10.3 | a greyed button without a reason |
| Tooltip | `tooltip.tsx` | `Tooltip({ content, children, wide?, side?, contentId?, contentClassName?, keepOpenOnPress? })` (hover, focus, tap; Escape and outside tap close it); `TooltipProvider` (once, in `app/layout.tsx`) | 7.5, 8.1, 9.3, 10.2 | `title=` attributes; another provider |
| InfoIconButton | `info-icon-button.tsx` | `InfoIconButton({ "aria-label", icon?: "help" \| "info" })` (44 px, `forwardRef`, Tooltip or Popover trigger) | 7.5, 9.1, 9.3, 10.2 | small icon-only buttons |
| InfoPopover | `info-popover.tsx`, `link-text-button.tsx` | `InfoPopover({ trigger, title \| label, children, state?: "loading" \| "error" \| "forbidden", errorMessage?, onRetry?, onOpenChange?, contentId? })` (280 px; hover after 150 ms, focus, tap; Tab bridge into the content); `LinkTextButton` | 9.1, 9.3 (practice support), 10.2 (primary contact) | a second popover implementation |
| Popover | `popover.tsx` | `Popover`, `PopoverTrigger`, `PopoverAnchor`, `PopoverContent` (non-modal, below/start, flips), `POPOVER_CONTENT_STYLES` | menus, custom popups | raw Radix popover styling |
| InlineBanner | `inline-banner.tsx` | `InlineBanner({ variant: "error" \| "info", action?, focusable?, announceKey? })` (only the text is the live region) | 4.2, 5.4, 7.6, 8.2, 9.2, 9.3 | `Alert` for in-flow messages |
| StatusBadge | `status-badge.tsx` | `StatusBadge({ status: "verified" \| "notVerified" \| "pending", children })` (icon + word) | 3.1, 3.3, 3.5, 3.6, 4.1, 8.1 | color-only status |
| FormField / FieldError | `form-field.tsx` | `FormField({ label, optional?, required?, help?, error?, id?, labelAddon?, children: (control) => … })` (id, `aria-describedby`, `aria-invalid`, "(optional)" suffix, polite error line); `FieldError` | every form control | wire aria attributes by hand |
| Input / InputLocked | `input.tsx`, `input-locked.tsx` | `Input` (44 px, 16 px text, `control-border`, `focus-ring`, error border), `INPUT_STYLES`; `InputLocked({ value, help })` (`readOnly` + `aria-readonly`, focusable, lock icon) | all forms; 3.2, 3.5, 7.5 | `disabled` inputs for locked values |
| Select | `select.tsx` | Radix Select parts + root props `ariaDisabled`, `helper`, `loading`, `placeholder`, `unlistedValue: { value, label? }` (`SelectProps`) | 2.2, 3.2, 4.2, 5.2, 7.5, 7.6, Jump to | native `<select>` or another listbox |
| DateInput / Calendar | `date-input.tsx`, `calendar.tsx` | `DateInput({ value, onChange(value, { text }), min?, max?, calendar?, calendarLabel?, today?, resetKey? })` (wire `YYYY-MM-DD` \| `""`, masked `MM/DD/YYYY`, paste, modal calendar); `Calendar` (react-day-picker on tokens); `CALENDAR_YEARS_BACK`/`AHEAD` | 2.2, 5.2, 7.5 (bounds from `birthDateBounds`) | another date picker; parse dates in the component |
| Combobox | `combobox.tsx`, `use-combobox.ts` | `Combobox<T>(props)` (`inputRef` hands the input to a form field ref, F6-2) / `useCombobox<T>(options)`: `load(query, page, signal)` → `{ items, hasMore, exactMatch? }` \| `{ error: true }`, `getKey`, `getLabel`, `mode: "select-only" \| "free-text"`, `debounceMs`, `minChars`, `pageSize`, `maxResults`, `openOnFocus`, `allowAdd`, `staticOptions`, `searchDisabled`, `quiet`, `emptyMessage`, `endMessage`, `text`/`defaultText`/`onTextChange`, `selection`/`defaultSelection`, `onSelect`, `onClear`; view props `label`, `help`, `error`, `searchIcon`, `optionLayout`, `renderOption`, `highlightMatch`; `ComboboxOptionText`, `HighlightMatch` | 9.1 NPI, 4.3 address, 5.2 insurer, 2.2 gender identity | cmdk/downshift; cache results across sessions |
| ConfirmDialog | `confirm-dialog.tsx` | `ConfirmDialog({ open, title, body, confirmLabel, variant: "standard" \| "destructive", onConfirm, onCancel, extraAction?, busy?, busyLabel?, cancelLabel?, showConfirm?, onCloseFocus? })` (alertdialog, `scrim`, focus on Cancel; the busy confirm reads `busyLabel`, default "Saving…") | 2.4, 3.4, 3.6, 5.5, 8.3 | a second confirm dialog; `Dialog` for confirms |
| Dialog | `dialog.tsx` | `DialogContent({ size?: "default" (440 px) \| "lg" (640 px), fullScreenOnMobile?, dismissible?, initialFocus?, showCloseButton?, closeLabel? })` + `DialogHeader`/`DialogBody` (scrolls)/`DialogFooter` (pinned), popover surface, `rounded-lg`, `shadow-lg`, scrim, 44 px "Close"; focus returns to the opener; `useModalHandlers`, `ModalCloseButton` | 1.10 picture, 8.2 QR (full-screen below 768 px), 5.1 card viewer | a confirm (use `ConfirmDialog`) |
| Sheet | `sheet.tsx` | `Sheet`, `SheetContent({ dismissible?, initialFocus? })`, `SheetHeader` (sticky; Back below 768 px, Close above), `SheetBody`, `SheetFooter`, `SheetTitle`, `SheetDescription`: right, 480 px, full screen below 768 px; close/back/Escape/scrim call `onOpenChange(false)` (run the guard there) | 5.2 insurance editor | a bottom sheet editor |
| DropdownMenu | `dropdown-menu.tsx` | shadcn parts as `row-menu` (44 px items, `variant="destructive"` in `error-strong`) | via `RowActions`; 10.x menus | Popover menus |
| Checkbox / Switch | `checkbox.tsx`, `switch.tsx` | 44 px targets, `control-border`, primary when on, `ariaDisabled` (focusable, no change, disabled look); pair with `<label htmlFor>` | 4.2 "Set as primary", 3.4/3.6 notifications | native unstyled inputs |
| Chip | `chip.tsx` | `Chip({ variant: "label" \| "primary" \| "deleted" \| "overflow" })` (square `rounded-sm`, 22 px), `OverflowChip({ count, "aria-label" })` (44 px, Tooltip trigger) | 3.x labels, 5.1 precedence/Deleted, 10.2 "+N" | `Badge` (pill) in tables |
| EmptyState | `empty-state.tsx` | `EmptyState({ variant: "row", colSpan } \| { variant: "card", title?, titleAs?, children? }, message, action?: { label, onClick, disabledReason? })`, `EmptyStateLine` | 3.x/4.1 empty rows, 5.1 and 10.1 empty cards | ad-hoc empty copy blocks |
| LiveStatus | `live-status.tsx` | `useAnnounce({ clearAfterMs? })` → `{ message, announce, clear }` (identical text re-announced), `LiveStatus({ message, visible? })` (polite `role="status"`) | 3.3 "Link sent", 2.3 SSN shown, 10.1 counts | a second hand-rolled live region |
| PhoneInput | `phone-input.tsx` | `PhoneInput({ value: { region, national }, onChange, onBlur?, inputRef?, readOnly?, disabled?, …FormField control })`: country Select (flag + dial code, every region, default `us`), clamped typing, format on blur, `+…` paste switches the country; validate with `phoneIssue`, send `toE164` | 3.2, 5.2 (subscriber), 3.1 | a second phone field or regex |
| Focus helpers | `focus.ts` | `tabbables(root)` (visible tab stops) | Tab bridges in popups | — |
| Base shadcn | `alert`, `badge`, `card`, `dialog`, `label`, `skeleton`, `tabs` | shadcn parts on 1health tokens | as needed | palette classes |

### 3.6 Testing and tooling

| Piece | Path | What it gives | Do not |
|---|---|---|---|
| Vitest setup | `vitest.config.ts`, `test/setup.ts`, `test/setup-dom.ts`, `test/stubs/server-only.ts` | node for `lib/server`, jsdom for client code; navigation, session events and activity reset around every client test; 100% coverage on `lib/server`, `lib/api`, `lib/shared` (`pnpm vitest run --coverage`) | lower coverage thresholds |
| MSW | `test/msw-server.ts` | `server` (unhandled requests fail; ping answered 204), `trackAllRequests()` | stub `fetch` directly |
| Test providers | `test/providers.tsx` | `TestProviders`, `TEST_PORTAL_URL`, `testIdle()` | — |
| Axe | `test/axe.ts` | `axeViolations()`, `WCAG_21_AA` tags; e2e uses `@axe-core/playwright` | skip axe on new UI |
| DOM stubs | `test/dom-stubs.ts`, `test/media.ts`, `test/next-navigation.ts`, `test/fake-broadcast-channel.ts` | `installDomStubs`, `FakeIntersectionObserver`, `reportIntersections`, `stubLayoutApis`; `stubViewport(width)`; `testRouter`, `setTestUrl`, `resetTestNavigation`; `FakeBroadcastChannel` | — |
| Server fixtures | `test/{session-fixture,env-fixture,lpl-fixture,upstream-fixture,named-op-fixture,multipart-fixture,image-fixture,redaction-fixture}.ts` | `makeSession`, `fakeAccessToken`, `NOW`; `stubServerEnv`, `testEnv`; `encryptLpl`, `launchPayload`; upstream URLs + token responses; `callOp`, `expectBffError`, `expectNoStore`; `multipart`, `multipartInit`; `IMAGES`, `imageOfSize`; `SENSITIVE_SAMPLE` | put `access_token` strings outside these fixtures (`check-forbidden.sh`) |
| Fixture pages | `app/test-fixtures/{primitives,section,inputs,combobox,leave-guard,ui-kit}/page.tsx` → `features/shell/__fixtures__/*` | real-browser pages for the shared kit, served **only when `PP_E2E_FIXTURES=1`** (404 otherwise; gate test `app/test-fixtures.test.ts` discovers every `app/test-fixtures/*/page.tsx`, no list to edit) | ship app UI under `__fixtures__` |
| E2E helpers | `e2e/fixtures/{core,contacts,addresses,insurance,account,mfa,npi,orgs,defaults}.ts` (import `./fixtures`), `e2e/session-cookie.ts`, `e2e/server-env.ts` | `signIn(page)`, `mockProxy(page, glob, answer)`, `mockMyself`, `mockTypeKey`, `mockContacts` (incl. Social Media), `mockProfileDefaults` / `mockAccountDefaults`, `mockProfilePictureId`, `failOnUnmockedProxy` (context route on `/api/{1h,pp,places}/**`, popups included) and the fail-fast `test` (opt in: import `test` from `./fixtures`), `mockExit`, `setTheme`, `ANN`, `PORTAL_URL`; unit: `test/myself-fixture.ts` (`myselfWire`, `contactPointWire`, `myselfHandlers`); `sealedSessionCookie()`; `E2E_PORT` (`PP_E2E_PORT`, default 3100; kill-switch servers on the next two ports) | mock `/api/token` success in unit tests |
| Gates | `scripts/check-forbidden.sh` (`pnpm check:forbidden`), `scripts/check-tokens.sh` (`pnpm check:tokens`) | bans `document.cookie`/`access_token` outside `lib/server`, `NEXT_PUBLIC_*SECRET*`, `_DEMO`/`_PROD` names outside allowed files, removed concepts (CSRF, `X-PP-Session`, `/launch`, `bg-black/50`…), hard-coded 1health origins; token gate (hex, palette classes, `text-info-strong` links, `bg-error-strong`) | silence a hit instead of fixing it |
| CI | `.github/workflows/ci.yml` | lint, typecheck, coverage, build, e2e, forbidden check | — |

Full check before any PR: `pnpm lint && pnpm typecheck && pnpm vitest run --coverage && pnpm test:e2e && pnpm build && bash scripts/check-forbidden.sh`.

---

## 4. Recipes

### 4.1 A Section with `useSectionForm`, chrome and drafts

The real reference is `features/shell/__fixtures__/fixture-section.tsx`.

```tsx
// features/personal/schema.ts: messages from the catalog only (lint)
export const personalSchema = z.object({ firstName: z.string().trim().min(1, { message: PERSON_MESSAGES.firstNameRequired }) /* … */ })

// features/personal/personal-section.tsx
const { myself, error, isLoading, retry } = useMyself()
const section = useSectionForm<PersonalValues>({
  id: "personal",
  label: SHELL_MESSAGES.sectionPersonal,
  displayOrder: 1,
  schema: personalSchema,
  baseline: toPersonalValues(myself),
  save: (values, baseline) => savePersonal(values, baseline),   // recipe 4.3
  draftFields: ["firstName", "lastName" /* never ssn / signature */],
  describeDraftDiff: personalDraftDiff,                          // rows: { field, label, mine, current }
  dataStatus: error ? "error" : isLoading ? "loading" : "loaded",
})
const headingId = sectionHeadingId("personal")

<SectionLandmark id="personal" title={SHELL_MESSAGES.sectionPersonal} tools={!section.isEditing && <Button variant="outline" size="touch" {...section.editButtonProps}>{SECTION_MESSAGES.edit}</Button>}>
  <SectionContainer editing={section.isEditing} sectionId="personal">   {/* sectionId renders the draft restore/conflict notice */}
    {section.isEditing ? (
      <>
        <KeyValueEditTable labelledBy={headingId} rows={[{ key: "firstName", label: "First name", required: true,
          error: section.errorFor("firstName"), render: (c) => <Input {...c} {...section.field("firstName")} /> }]} />
        <SectionFooter {...section.footerProps} />
      </>
    ) : (
      <KeyValueTable labelledBy={headingId} rows={[{ key: "firstName", label: "First name", value: section.baseline.firstName }]} />
    )}
  </SectionContainer>
</SectionLandmark>
```

`useSectionForm` registers with the page registry, which makes the Section count toward the leave guard and Save all. It also handles toasts, focus, telemetry and draft hooks. The page's `PageFrame` already provides the registry and `DraftsProvider`. `SectionLandmark` and `SectionHeader` take the same `id`/`title`; use `SectionHeader` inside a landmark when you need `count`/`editing`.

### 4.2 A read with `StateFrame`

```tsx
const { data, error, isLoading, mutate } = useSWR(keys.addresses())   // loader registered in lib/api/addresses.ts
const [attempt, setAttempt] = useState(0)
useEffect(() => { if (error) setAttempt((n) => n + 1) }, [error])
const state = error ? { error: mapFetchError("addresses", error) } : isLoading ? "loading" : "ready"

<StateFrame state={state} skeleton="table" columns={SECTION_COLUMNS.addresses}
  loadError={{ kind: "section", sectionId: "addresses" }} level="section"
  onRetry={() => void mutate()} attempt={attempt} onReady={useSectionFrame("addresses").onReady}>   {/* the deep-link re-scroll (F6-1); call the hook at the top of the component */}
  <AddressTable rows={data} />
</StateFrame>
```

A `forbidden` error renders `NoAccess` and `session` renders nothing. To decide whether a 403 should hide the whole tab instead, call `forbiddenScopeFor(path, page)`. On `/account`, use `loadError={{ kind: "page" }}`.

### 4.3 A save with `runSaveSteps` and `mapApiError`

```ts
async function savePhones(values: PhoneValues, baseline: PhoneValues): Promise<SaveResult> {
  const result = await runSaveSteps(
    [
      { part: "remove", skip: removed(values, baseline).length === 0, run: () => callApi("phones/remove", removePath(…), { method: "DELETE" }) },
      { part: "add",    skip: added(values, baseline).length === 0,   run: () => callApi("phones/add", addPath(), { method: "POST", body: JSON.stringify(…) }) },
    ],
    { scope: "phone", mode: "stop", refetch: refetchPhones, rebase: section.rebase },   // `attemptAll` only for 7.5
  )
  if (result.ok) { await mutateContactPoints("Mobile", "Landline"); await mutateMyself(); return { ok: true } }
  return { ok: false, error: result.error }   // useSectionForm shows field / Section errors from error.mapped
}
```

A single request needs no runner. Map the failure yourself: `{ ok: false, error: { code: mappedErrorCode(m), mapped: m } }` with `m = mapApiError("personal", res)`.

### 4.4 A Combobox variant (NPI)

**Live searches do not use SWR** (spec F6-3 decision): the insurer search (5.2), NPI search (9.1) and address suggestions (4.3) load through the Combobox `load(query, page, signal)` callback with `callApi` and the module's path builder (`personalNpiSearchPath`, `practiceNpiSearchPath`, `placesAutocompletePath`, the insurer path of `insurance.ts`). Never add a search key to `lib/api/keys.ts`; nothing is cached across searches, and NPI results are never cached or drafted (PNFR1).

```tsx
<Combobox<NpiResult>
  label={…} required searchIcon optionLayout="two-line" mode="select-only"
  placeholder={COMBOBOX_MESSAGES.npiPlaceholder} emptyMessage={COMBOBOX_MESSAGES.npiNoMatches} endMessage={COMBOBOX_MESSAGES.noMoreResults}
  debounceMs={600} maxLength={100} pageSize={10} openOnFocus
  load={async (query, page, signal) => {
    const res = await callApi<NpiPage>("npi/search", npiSearchPath(query, page), { signal })
    return res.success && res.data ? { items: res.data.items, hasMore: res.data.hasMore } : { error: true }
  }}
  getKey={(n) => n.npi} getLabel={npiLabel}
  renderOption={(n) => <ComboboxOptionText line1={…} line2={…} />}
  onSelect={(s) => setNpi(s?.type === "option" ? s.item : null)}
/>
```

The other variants change only props. **Address:** `minChars={3}`, `debounceMs={250}`, `maxResults={5}`, `mode="free-text"`, `quiet`, `highlightMatch`, `searchDisabled` when Places is off. **Insurer:** `pageSize={20}`, `allowAdd={(q) => formatMessage(COMBOBOX_MESSAGES.addOption, { name: q })}`. **Gender identity:** `staticOptions`, `mode="free-text"`, no `load`. See `features/shell/__fixtures__/combobox-fixture.tsx`.

### 4.5 A proxy allowlist entry

```ts
// lib/server/proxy/allowlist/addresses.ts  (never edit allowlist/index.ts); illustrative entries, confirm each against agents.md
export const entries: readonly AllowlistEntry[] = [
  { method: "GET", template: "v2/person/location/list" },
  { method: "DELETE", template: "v2/person/location/{locationId}" },             // {name} = numeric id
  { method: "PUT", template: "v2/person/location/{locationId}", body: addressBodySchema, maxBytes: 16 * 1024 },
]
// /account single-story entry: add `profile: true`. Upload: `upload: { part: "file", types: ["png"] }, maxBytes`.
// lib/server/proxy/allowlist/addresses.test.ts: allowed, wrong method 405, bad query 400, bad body 400, owner `me`.
```

The client side goes in `lib/api/addresses.ts`: `proxyPath("v2/person/location/list")` + `callApi("addresses/list", …)` + `registerFetcher("addresses", load)`.

### 4.6 A named op

```ts
// lib/server/named-ops/npi-lookup.ts
export function createNpiLookupHandler(deps: NamedOpDeps = {}) {
  return createNamedOp({
    route: "/api/pp/npi-lookup", killSwitch: "account", method: "POST", upstream: "1health",
    body: z.strictObject({ query: z.string().trim().min(1).max(100) }),
    async handle({ body, upstream }) {
      const r = await upstream.json({ method: "GET", segments: ["v2", "public", "npi", "list"], query: new URLSearchParams({ q: body.query }) })
      if (r.kind === "failed") return failureResponse(r.failure)
      if (r.kind === "client-error") return relayClientError(r.status, r.data)
      return jsonOk(toNpiPage(r.data))           // answer only what the client needs
    },
  }, deps)
}
// app/api/pp/npi-lookup/route.ts: `const handler = createNpiLookupHandler()`; export it as GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS.
// Also: BFF_PATHS + body types in lib/shared/bff-contract.ts; "/api/pp/npi-lookup" in kill-switch.ts "account" prefixes;
// a FORBIDDEN_SCOPE_TABLE row if a 403 hides UI; tests with test/named-op-fixture.ts (callOp, expectBffError, expectNoStore).
```

This op is hypothetical: if a plain proxy entry can express the call, use the allowlist instead.

### 4.7 Catalog copy and an error rule

```ts
// lib/shared/messages/addresses.ts
export const ADDRESS_MESSAGES = {
  // illustrative keys: verbatim Voice and Tone strings carry no marker, everything else is marked
  zipInvalid: "Enter a valid ZIP code", // DRAFT COPY
  countriesLoadError: "Couldn't load countries", // DRAFT COPY
} as const

// lib/api/errors/addresses.ts
export type Field = "postalCode"
export const rules: readonly MessageRule<Field>[] = [
  { scopes: ["addresses"], pattern: /^Invalid postal code\.$/,   // illustrative: copy the exact backend text result: { kind: "field", field: "postalCode", messageKey: "addresses.zipInvalid" } },
]
```

Use the copy with `ADDRESS_MESSAGES.zipInvalid` or `messageFor("addresses.zipInvalid")`, and fill templates with `formatMessage(t, { name })`. `messages.test.ts` enforces the verbatim, voice and uniqueness rules.

---

## 5. Story → foundation map

The foundation status comes from `sprint-status.yaml` and the dated *Foundation 2026-10-14* lines in `epics.md`, which carry the full per-story detail. These stories are done and covered entirely by the foundation:

- 1.1–1.8
- 1.15 (except each Section's own draft wiring)
- the 1.xr reworks

| Story | Use these foundation pieces | Remaining for the team |
|---|---|---|
| 1.9 Header picture (A) | `ProfileHeader`, `keys.profilePictureId`, `/api/pp/profile-picture-id`, `files` download entry (`asImage`), `formatPhoneDisplay`, `initials` | profile-picture-id loader, preview entry, `<img>` avatar + fallback, tests |
| 1.10 Change picture (A) | picture upload entry (`allowlist/core.ts`), upload mechanism (413/415), `toastSuccess`, busy `Button`, `FieldError` | dialog, re-encode, avatar button, `DELETE v2/file` entry, EXIF decision |
| 1.11 Section framework (A) | registry, `useSectionForm`, chrome, `DisabledAction`, `Tooltip`, `FormField`, `InputLocked`, fixture Section | `RowActions`/`RowRemoval`/DropdownMenu, Add row entry, their e2e |
| 1.12 Errors / toasts (A) | mapper v2, catalog, toasts, `InlineBanner`, `StateFrame`, Section save-failure UI | e2e mapped-400 fixture case |
| 1.13 Leave guard (A) | `LeaveGuard`, `requestLeave`, `runSaveAll`, draft purge/delete | scoped `requestLeave({ scope })` with the Sheet |
| 1.14 Save all (A) | `runSaveAll`, `saveAllSummary`, `useDirtyCount`, `PageFrame saveAllSlot`/`saveOrder`, `SAVE_ORDER` and the `features/save-all` `SaveAllBar` stub (F6-1, both already passed to `PageFrame` in `app/page.tsx`), `toastPartial`, `--toast-bottom-offset` | replace the `SaveAllBar` body (bar, pill), post-run focus, specs; no `app/page.tsx` edit |
| 1.16 Ops (A) | environment map, kill switches + disabled screen, `.env.example` | Vercel project, promote workflow, runbooks, rehearsal, PM copy review |
| 2.1 View personal info (A) | `Myself` fields, `KeyValueTable` (`rowId: SIGNATURE_ANCHOR`), `StateFrame`, `SignatureThumb`, `wireToDisplayDate` | the Section |
| 2.2 Edit personal info (A) | `userEditBodySchema`, `person-rules`, `useSectionForm` (`onNoChanges: "close"`, `cancelFocus: "heading"`), `DateInput` + `birthDateBounds`, `Select`, gender-identity `Combobox`, drafts kit | schema, save, Section, draft wiring |
| 2.3 SSN (A) | SSN-taken rule (`person.ssnTaken`), SSN pattern on `user/edit`, masked SSN, SSN draft denylist | Reveal, `ssn/expose` entry, SSN input |
| 2.4 Signature (A) | signature upload + version entries, `SignatureThumb`, `runSaveSteps` (`stop`), `ConfirmDialog`, `#signature` deep link, signature denylist, `CANCELLED_CODE` (a declined "Remove your signature?" resolves `{ ok: false, error: { code: "CANCELLED" } }`: no error UI, no focus move, no telemetry; F6-1) | pad, save steps, `DELETE v2/file` entry, take the version id only from `myself.signature` |
| 3.1 Phone read (A) | `contact-points.ts`, `keys.contactPoints`, `StateFrame` (`SECTION_COLUMNS.phone`), `forbiddenScopeFor`, `StatusBadge`, `useReportSectionCount` | Contact Point engine, Phone Section |
| 3.2 Phones edit (A) | `useSectionForm`, `runSaveSteps` `stop`, duplicate rule, `InputLocked`, `DisabledAction`, `Select`, drafts kit | phone input, `phoneSchema`, write entries |
| 3.3 Verify phones (A) | `StatusBadge pending`, `DisabledAction`, toasts | verify entry and flow (auto-verify inside `save()`) |
| 3.4 Phone primary (A) | `ConfirmDialog`, `DisabledAction`, `mutateContactPoints` + `mutateMyself` | Make primary, notifications |
| 3.5 Emails (A) | same kit as phones (`SECTION_COLUMNS.email`, `contacts.duplicateEmail`) | Email Section |
| 3.6 Email verify / primary (A) | `ConfirmDialog`, `StatusBadge`, `DisabledAction` | its own `email`-scope email-in-use rule once the backend message is confirmed |
| 3.7 Social links (A) | `Social Media` type/key, `safeHref`, `contacts.duplicateSocial`, kit | Social Section |
| 4.1 View addresses (A) | `keys.addresses`, `StateFrame`, `StatusBadge` | list entry, loader, Section |
| 4.2 Edit addresses (A) | `useSectionForm` (`revealField` expands a collapsed row before focus, `startEdit({ focus })` for a row's kebab Edit; F6-1), `runSaveSteps`, `Select` (placeholder, loading), drafts kit | countries entry, schema, write entries |
| 4.3 Address suggestions (A) | `/api/places/*`, address `Combobox` variant, `COMBOBOX_MESSAGES.addressHelp` | `lib/api/places.ts`, fill/validated, throttle decision |
| 4.4 Primary / remove address (A) | `runSaveSteps`, `DisabledAction`, `Tooltip keepOpenOnPress` | entries and flow |
| 5.1 View policies (A) | `keys.insurance`, `StateFrame`, `KeyValueTable`, `asImage` hardening | list and card-download entries, UI |
| 5.2 Edit policy (A) | guard-only contract (`saveAll: false`), insurer `Combobox`, `DateInput`, `Select` | drawer, schema, entries |
| 5.3 Card upload (A) | card upload entries, `toastError({ onRetry })` | UI, re-encode, retry, replace-then-delete |
| 5.4 Primary per type (A) | `InlineBanner info` + action, `runSaveSteps` `stop` | demote flow |
| 5.5 Delete policy (A) | `ConfirmDialog destructive`, toasts | delete entry and flow |
| 7.1 Account page (B) | `requirePageSession`, `PageFrame page="account"`, `AccountTabs` (repeated/unknown `?tab=` normalized), `AccountPersonalPanel`, stubs `AccountSettingsSection`/`AuthenticatorSection`/`ProviderTab`/`OrganizationsTab`, `StateFrame`, `forbiddenScopeFor(…, "account")`, drafts provider (F6-1) | `app/account/page.tsx` composing those (no shell edits), lazy-key MSW tests, Playwright |
| 7.2 Account hardening (B) | `ACCOUNT_DISABLED` kill switch + disabled screen, deny list, headers, `proxy.ts` no-store on `/`, `/account`, `/handoff/**` (F6-1) | deny/traversal rows, header asserts on the real `/account`, mobile/axe |
| 7.3 Hand-off (B) | `navigate({ external: "handoff", href })` (hand-off route only), `handoffHref`, `BFF_PATHS.handoffPortal`, `seeOther`, no-store in `proxy.ts` (F6-1) | `app/handoff/portal/route.ts`, `lib/server/handoff.ts` |
| 7.4 View account settings (B) | `Myself`, `primaryPhoneRegion`, `formatPhoneDisplay`, `KeyValueTable`, `StateFrame kv` | the card |
| 7.5 Edit names, birth date, preferences (B) | `useSectionForm` (`cancelFocus: "edit"`, `onNoChanges: "status"`, `describeError`), `runSaveSteps attemptAll`, `InputLocked`, `InfoIconButton` + `Tooltip wide`, `DateInput` + `birthDateBounds`, `Select` (`unlistedValue`), drafts kit | time zones, profile constants, schema, save |
| 7.6 Primary email / phone (B) | `user/edit` email/phone fields, `updateAccount` lint, `account.primaryEmailInUse`, `Select ariaDisabled` + `helper` + `loading`, `InlineBanner` | `lib/api/account.ts#updateAccount`, the pickers |
| 8.1 Authenticator status (B) | `myself.mfaEnabled`/`totpEnabled`, `StatusBadge`, `Tooltip`, `StateFrame tiles`, `SectionLandmark id="authenticator"` | the card |
| 8.2 Link app (B) | `/api/pp/mfa/validate`, MFA rules, `mfa_link` telemetry, busy `Button`, `InlineBanner` | enable/TOTP entries (`allowlist/mfa.ts`), `lib/api/mfa.ts`, dialog, throttle decision |
| 8.3 Turn off (B) | `ConfirmDialog destructive`, `mutateMyself` | `POST v2/mfa/disable/totp` entry, flow |
| 9.1 NPI search (B) | NPI `Combobox` variant, `InfoPopover`, `StateFrame bars`, `keys.npi` | `lib/api/npi.ts`, entries, the tab |
| 9.2 Register (B) | `NPI_ALREADY_REGISTERED`, `Combobox selection`, busy `Button busyLabel` | register entry, flow |
| 9.3 Registered view (B) | `/api/pp/practice-support`, `InfoPopover` state slots, `SignatureThumb`, `KeyValueTable`, `safeHref` | `practiceSupport` loader, view |
| 10.1 Organizations list (B) | `keys.orgs`, `StateFrame cards` + `ORG_GRID_CLASSES`, `forbiddenScopeFor` | `lib/api/organizations.ts`, org initials rule, grid |
| 10.2 Org card (B) | `/api/pp/org-logo/[tenantId]`, `publicFilesOrigin`, `InfoPopover`, `Tooltip`, `safeHref` | card UI, membership caching, confirm `publicFilesOrigin` |
| 10.3 Enter portal (B) | `DisabledAction`, `navigate` hand-off | button and card state (needs 7.3) |

---

## 6. Known limitations and accepted risks

- **No CSRF check and no session binding (D5).** Cross-site write protection relies on `SameSite=Lax` and the 415 JSON check. `check-forbidden.sh` bans re-adding `X-PP-Session` and session-changed.
- **Login CSRF on `/auth` is accepted (D9).** Any `lpl` in the URL auto-launches, matching patient-vault behaviour. Recorded in `deferred-work.md`.
- **The Radix Select listbox hides the page with `aria-hidden` without `aria-modal`.** Axe `aria-hidden-focus` therefore flags the page while the list is open. The e2e scans only the listbox in that state.
- **`publicFilesOrigin` is unconfirmed.** It has to be checked on demo and prod before Story 10.2. A mismatch only falls back to initials.
- **No throttle on Places autocomplete or MFA validate** (Stories 4.3 and 8.2 decide).
- **Picture uploads keep EXIF.** Story 1.10 decides whether to strip it.
- **Signature-version and insurance upload ids come from the client.** Take ids only from `myself.signature` and from saved policies.
- **Org logo cost:** up to about 70 upstream calls per 12-card page (Story 10.2 caching).
- **Multi-tab drafts are last-writer-wins.** There is no `storage`-event sync.
- **Telemetry is a no-op sink** until a BAA-covered sink exists.
- **Deferred items:** the open list is in `_bmad-output/implementation-artifacts/deferred-work.md`. Read it before touching an area it names.
