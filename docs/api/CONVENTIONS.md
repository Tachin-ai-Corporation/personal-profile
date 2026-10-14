# API module conventions

How to add a new `lib/api/*.ts` module so it behaves like the rest.

## The building blocks

- [`callApi(context, path, init)`](../../lib/api/client.ts) — the only browser
  transport. Same-origin `/api/...` paths only; it coordinates token refresh,
  publishes `session-expired`, logs through the dev-only `logApiCall`, and
  **never throws**.
  `fetch(` anywhere else in client code is a lint error.
- `ApiResponse<T>` = `{ success, data?, error?, statusCode?, errorCode?, upstreamCode?, details? }`.
  BFF errors set `errorCode` (a string); upstream errors set `upstreamCode`
  (the backend integer) and `error` (the platform message).
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
  error mapping; upstream message text is matched only in `lib/api/errors/<area>.ts`.

## Adding an endpoint

1. Add an allowlist entry to its area file in `lib/server/proxy/allowlist/<area>.ts`
   (`{ method, template, query?, body?, ... }`) and rows in that area's test.
   Every planned area file exists and is aggregated once by `allowlist/index.ts`.
2. In the module `lib/api/<resource>.ts`, add the path builder with
   `proxyPath(...)`.
3. Write the module function on `callApi("<module>/<fn>", xPath(), init)`
   with a `"<module>/<fn>"` context string, and map the raw wire shape to a
   clean domain type (no `as` casts; one bad optional field degrades to
   `null`, not a failed read). See `lib/api/myself.ts`.
4. For reads, use the key already declared in `keys.ts` and call
   `registerFetcher("<resource>", loader)` in the module.
5. Re-export from `lib/api/index.ts`. Import from `"@/lib/api"` everywhere.
6. Copy goes in `lib/shared/messages/<area>.ts`; upstream messages your
   feature must recognise go in `lib/api/errors/<area>.ts` (anchored `^…$`).
7. Test it with Vitest + MSW at the `/api` boundary (`test/msw-server.ts`).

## Rules

- Never build an absolute URL or read the environment in client code: the
  server decides the upstream origin from the session.
- Don't parse error bodies yourself; `callApi` does it once.
- Don't publish session events; `callApi` does.
- Non-GET calls are replayed only after a proxy `TOKEN_EXPIRED`.
