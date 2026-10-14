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
- [`endpoints`](../../lib/api/config.ts) — same-origin proxy paths
  (`/api/1h/<path relative to the upstream /api>`). Owner ids are the literal
  `me`.
- [`keys`](../../lib/api/keys.ts) — every SWR key, shaped `["pp", resource, ...params]`.

## Adding an endpoint

1. Add an allowlist entry in `lib/server/proxy/allowlist.ts`
   (`{ method, template, query?, body?, ... }`) and its table-test rows.
2. Add the path builder to `endpoints` in `lib/api/config.ts`.
3. Write the module function on `callApi("<module>/<fn>", endpoints.x(), init)`
   with a `"<module>/<fn>"` context string, and map the raw wire shape to a
   clean domain type (zod `safeParse`, no `as` casts). See `lib/api/user.ts`.
4. For reads, add a key to `keys.ts` and a typed fetcher to `fetchers` in
   `fetcher.ts`.
5. Re-export from `lib/api/index.ts`. Import from `"@/lib/api"` everywhere.
6. Test it with Vitest + MSW at the `/api` boundary (`test/msw-server.ts`).

## Rules

- Never build an absolute URL or read the environment in client code: the
  server decides the upstream origin from the session.
- Don't parse error bodies yourself; `callApi` does it once.
- Don't publish session events; `callApi` does.
- Non-GET calls are replayed only after a proxy `TOKEN_EXPIRED`.
