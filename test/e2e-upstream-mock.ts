import { E2E_CREDENTIAL_PREFIX, E2E_MOCK_CREDENTIALS, serverEnv, type ServerEnv } from "@/lib/server/env"
import { ENVIRONMENTS, environmentConfig } from "@/lib/shared/environments"

/**
 * E2E upstream mock (test tooling, ported from main's Story 1.1 mock; spec R5-1).
 *
 * The launch exchange, the launch's `myself` check, the proxy and the logout
 * revoke all call 1health SERVER-side, where Playwright's browser routes can't
 * reach. With `PP_E2E_MOCK=1` (read only through `lib/server/env.ts`; set only
 * by `e2e/server-env.ts`, never in a deployment) `instrumentation.ts` installs
 * this patch over the server's global `fetch`. It answers, on the two 1health
 * roots only:
 *
 * - the one-time-code exchange: single-use codes (a second exchange of a code
 *   answers the platform's recorded 400 "…has already been redeemed." body);
 *   each exchange issues a distinct access token whose plaintext payload
 *   carries `tenantId: 1`;
 * - `GET /api/v2/user/myself`: the frozen e2e `ANN` (id 42, personId 4242), or
 *   401 for a revoked access token;
 * - `POST /auth/user/logout/all-devices`: 200, revoking the Bearer token, so an
 *   e2e can prove a logout reached the platform.
 *
 * Any other call to a 1health root fails closed (599 `E2E_UNMOCKED`, logged),
 * so no e2e ever reaches real 1health; mock it in the page instead (the
 * browser-side fail-fast guard names it). Other hosts go to the real `fetch`.
 */

const TOKEN_PATH = "/api/v2/public/external-application/auth/oauth2/user/token"
const MYSELF_PATH = "/api/v2/user/myself"
const REVOKE_PATH = "/auth/user/logout/all-devices"

/** What the mock `myself` answers: the frozen e2e `ANN` (`e2e/fixtures/core.ts`). */
export const MOCK_MYSELF = Object.freeze({ id: 42, personId: 4242, firstName: "Ann", lastName: "Lee", username: "ann.lee" })
/** The tenant the mock access token claims (the default tenant, AD-6). */
export const MOCK_TENANT_ID = 1

const ROOTS: readonly string[] = ENVIRONMENTS.map((environment) => environmentConfig(environment).apiRoot)

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input
  if (input instanceof URL) return input.href
  return input.url
}

const base64url = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString("base64url")

/** A fake JWT whose plaintext payload carries the tenant claim and a unique id. */
function mockAccessToken(serial: number): string {
  return `${base64url({ alg: "RS256" })}.${base64url({ tenantId: MOCK_TENANT_ID, jti: `e2e-${serial}` })}.signature`
}

const jsonAnswer = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

function bearerOf(init: RequestInit | undefined): string {
  return (new Headers(init?.headers).get("Authorization") ?? "").replace(/^Bearer /, "")
}

function securityCodeOf(init: RequestInit | undefined): string {
  try {
    const code: unknown = JSON.parse(String(init?.body ?? "{}")).securityCode
    return typeof code === "string" ? code : ""
  } catch {
    return ""
  }
}

let restore: (() => void) | undefined

/**
 * Patches `globalThis.fetch` (once). Throws unless `PP_E2E_MOCK=1` and every
 * launch credential is an `e2e-` dummy, so a deployment can never run it.
 */
export function installUpstreamMock(env: ServerEnv = serverEnv()): void {
  if (!env.PP_E2E_MOCK) throw new Error("The e2e upstream mock needs PP_E2E_MOCK=1")
  // Re-checked here (the boot already fails): never fake 1health next to real credentials.
  const real = E2E_MOCK_CREDENTIALS.filter((name) => !env[name].startsWith(E2E_CREDENTIAL_PREFIX))
  if (real.length > 0) throw new Error(`The e2e upstream mock needs e2e dummy credentials: ${real.join(", ")}`)
  if (restore) return

  const realFetch = globalThis.fetch
  const consumedCodes = new Set<string>()
  const revokedTokens = new Set<string>()
  let serial = 0

  const mockFetch: typeof fetch = async (input, init) => {
    const url = urlOf(input)
    const root = ROOTS.find((candidate) => url.startsWith(`${candidate}/`))
    const path = root === undefined ? "" : new URL(url).pathname

    if (path === TOKEN_PATH) {
      const code = securityCodeOf(init)
      if (consumedCodes.has(code)) {
        return jsonAnswer(400, { message: `External application security code: '${code}' has already been redeemed.`, code: 400 })
      }
      consumedCodes.add(code)
      serial += 1
      return jsonAnswer(200, {
        id: String(MOCK_MYSELF.id),
        token_type: "Bearer",
        access_token: mockAccessToken(serial),
        refresh_token: `e2e-refresh-${serial}`,
        expires_in: 3000,
      })
    }
    if (path === MYSELF_PATH) {
      if (revokedTokens.has(bearerOf(init))) return jsonAnswer(401, { message: "Unauthorized", code: 401 })
      return jsonAnswer(200, MOCK_MYSELF)
    }
    if (path === REVOKE_PATH) {
      revokedTokens.add(bearerOf(init))
      return new Response(null, { status: 200 })
    }
    if (root !== undefined) {
      // Fail closed: no e2e ever reaches real 1health. Mock the call in the page instead.
      console.error(`e2e upstream mock: unmocked 1health call ${init?.method ?? "GET"} ${path}`)
      return jsonAnswer(599, { message: "E2E_UNMOCKED", code: 599 })
    }
    return realFetch(input, init)
  }

  globalThis.fetch = mockFetch
  restore = () => {
    globalThis.fetch = realFetch
  }
}

/** Test hook: puts the real `fetch` back and forgets every code and token. */
export function uninstallUpstreamMock(): void {
  restore?.()
  restore = undefined
}
