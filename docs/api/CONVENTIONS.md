# API module conventions

How to add a new `lib/api/*.ts` module so it behaves like the rest. The full
module catalog and worked recipes are in [FOUNDATION.md](../FOUNDATION.md)
(§3.2, §4.3, §4.5, §4.7); server work the proxy can't express is a named
operation (§4.6, [AUTH-ARCHITECTURE.md](../AUTH-ARCHITECTURE.md#named-operations)).

## The building blocks

- [`callApi(context, path, init)`](../../lib/api/client.ts) — the only browser
  transport. Same-origin `/api/...` paths only; it coordinates token refresh,
  publishes `session-expired`, logs through the dev-only `logApiCall`, and
  **never throws**.
  `fetch(` anywhere else in client code is a lint error.
- [`ApiResponse<T>`](../../lib/api/types.ts) = `{ success, data?, error?, statusCode?,
  errorCode?, source?, upstreamCode?, platformMessage?, details?, retryable?, userMessage? }`.
  - BFF errors (body `{ errorCode, source: "proxy" }`) set `source: "proxy"`
    and `errorCode` (a string; absent if this client doesn't know the code).
    `/api/token` failures also carry `userMessage` (user-safe copy, D9) and,
    when not worth retrying, `retryable: false`.
  - Upstream errors (body `{ message, code }`) set `upstreamCode` (the backend
    integer), `platformMessage` and `error` (the platform message) and
    `details`.
  - A network failure sets `errorCode: "NETWORK_ERROR"` and no `statusCode`.
    `FORBIDDEN` and the derived codes are named only by `lib/api/errors`.
- [`proxyPath(path)`](../../lib/api/config.ts) — builds a same-origin proxy
  path (`/api/1h/<path relative to the upstream /api>`). Each module owns its
  own path builders (e.g. `myselfPath()`, `contactPointsPath(type)`). Owner ids
  are the literal `me`.
- [`keys`](../../lib/api/keys.ts) — every SWR key, shaped `["pp", resource, ...params]`
  (every planned key is already declared), plus `mutateMyself()` and
  `mutateContactPoints(...types)`.
- [`registerFetcher(resource, loader)`](../../lib/api/fetcher.ts) — each module
  registers the SWR loader of its own key family; `swrFetcher` dispatches on it.
- [`mapApiError(sectionId, response)`](../../lib/api/errors/index.ts) — the one
  error mapping (`sectionId` is an `ErrorScope`: a section id or `"page"`,
  `"authenticator"`, `"provider"`, `"organizations"`); upstream message text is
  matched only in `lib/api/errors/<area>.ts`.

## Adding an endpoint

1. In the same change, add an allowlist entry to its area file in
   `lib/server/proxy/allowlist/<area>.ts` (`{ method, template, query?,
   fixedQuery?, body?, upload? + maxBytes, asImage?, profile? }`) and rows in
   that area's test.
   Every planned area file exists and is aggregated once by `allowlist/index.ts`.
2. In the module `lib/api/<resource>.ts`, add the path builder with
   `proxyPath(...)`.
3. Write the module function on `callApi("<module>/<fn>", xPath(), init)`
   with a `"<module>/<fn>"` context string, and map the raw wire shape to a
   clean domain type (no `as` casts; one bad optional field degrades to
   `null`, not a failed read). See `lib/api/myself.ts`.
4. For reads, use the key already declared in `keys.ts` and call
   `registerFetcher("<resource>", loader)` in the module.
5. Every planned module (`personal`, `profile-picture`, `contacts`,
   `addresses`, `places`, `insurance`, `type-keys`, `account`, `mfa`, `npi`,
   `organizations`, `practice-support`) already exists and, like every other
   module except `client`, `fetcher` and `log-api-call`, is re-exported from
   `lib/api/index.ts` with `export *` (specs F6-3, F7-2): add code to your
   module, test it in your module's own `<module>.test.ts`, and never edit
   `index.ts` or `planned-modules.test.ts`. Import from `"@/lib/api"`
   everywhere. The `fetchers` object is frozen: read a new key with
   `useSWR(keys.x())` (the root fetcher dispatches to your registered
   loader). A helper shared by modules but not public is a `*.internal.ts`
   module (e.g. `user-edit-path.internal.ts`), never re-exported; export
   names must be unique across modules and generic ones carry the area's
   prefix (`addressesListPath`, not `listPath`; `planned-modules.test.ts`,
   FOUNDATION.md §1 team ownership rule 6).
6. Copy goes in `lib/shared/messages/<area>.ts`; upstream messages your
   feature must recognise go in `lib/api/errors/<area>.ts` (anchored `^…$`).
7. Test it with Vitest + MSW at the `/api` boundary (`test/msw-server.ts`).

## Rules

- Never build an absolute URL or read the environment in client code: the
  server decides the upstream origin from the session.
- Don't parse error bodies yourself; `callApi` does it once.
- Don't publish session events; `callApi` does.
- Non-GET calls are replayed only after a proxy `TOKEN_EXPIRED`.
