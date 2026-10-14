/**
 * =============================================================================
 * E2E upstream mock (test-only)
 * =============================================================================
 *
 * The launch exchange and `/myself` happen SERVER-SIDE inside the Next route
 * handler, so Playwright's browser-level mocking can't reach them. When
 * `PP_E2E_MOCK=1`, `instrumentation.ts` installs this patch over the server's
 * global `fetch`, intercepting only the 1health launch exchange, `/myself` and
 * the logout revoke (`/auth/user/logout`), and delegating
 * everything else to the real `fetch`.
 *
 * It models the single-use code: a second exchange of the same code returns the
 * recorded "already redeemed" body, so the launch spec can prove no-replay.
 *
 * NEVER wired into dev/demo/prod (gated on `PP_E2E_MOCK`); this file is test tooling.
 */

const TOKEN_PATH = "/api/v2/public/external-application/auth/oauth2/user/token"
const MYSELF_PATH = "/api/v2/user/myself"
/** The logout route's deferred access-token revoke (Story 1.7). */
const REVOKE_PATH = "/auth/user/logout"

/** The user id the mock `/myself` returns; the e2e lpl fixture must use the same. */
export const MOCK_USER_ID = 42
export const MOCK_PERSON_ID = 7
/** The tenant the mock access token claims (must be the default tenant, 1). */
export const MOCK_TENANT_ID = 1

/** A fake access-token JWT whose plaintext payload carries the tenant claim. */
function mockAccessToken(): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256" })).toString("base64url")
  const payload = Buffer.from(JSON.stringify({ tenantId: MOCK_TENANT_ID })).toString("base64url")
  return `${header}.${payload}.signature`
}

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input
  if (input instanceof URL) return input.href
  return (input as Request).url
}

let installed = false

export function installUpstreamMock(): void {
  if (installed) return
  installed = true

  const realFetch = globalThis.fetch.bind(globalThis)
  const consumedCodes = new Set<string>()

  globalThis.fetch = async (input, init) => {
    const url = urlOf(input)

    if (url.endsWith(TOKEN_PATH)) {
      let code = ""
      try {
        code = JSON.parse(String(init?.body ?? "{}")).securityCode ?? ""
      } catch {
        code = ""
      }
      if (consumedCodes.has(code)) {
        return new Response(
          JSON.stringify({
            message: `External application security code: '${code}' has already been redeemed.`,
            code: 400,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        )
      }
      consumedCodes.add(code)
      return new Response(
        JSON.stringify({
          id: String(MOCK_USER_ID),
          token_type: "Bearer",
          access_token: mockAccessToken(),
          refresh_token: "mock-refresh-token",
          expires_in: 3000,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    }

    if (url.endsWith(MYSELF_PATH)) {
      return new Response(
        JSON.stringify({ id: MOCK_USER_ID, personId: MOCK_PERSON_ID, firstName: "Test", lastName: "User" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    }

    if (url.endsWith(REVOKE_PATH)) {
      return new Response(null, { status: 200 })
    }

    return realFetch(input, init)
  }
}
