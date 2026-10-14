// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * Orchestration-branch coverage for `app/launch/route.ts` (AD-4). The pure
 * helpers are unit-tested in `lib/server/launch.test.ts`; here the GET handler is
 * driven directly with mocked env/launch/session so each branch's redirect,
 * clear-first Set-Cookie, and no-store headers are asserted. `cache-headers` is
 * the real module.
 */

/** Error classes the route checks with `instanceof`; shared so the reference matches. */
class MockLaunchError extends Error {
  constructor(public reason: "config" | "invalid") {
    super(reason)
    this.name = "LaunchError"
  }
}
class MockExchangeError extends Error {
  constructor(public reason: "used" | "expired" | "invalid") {
    super(reason)
    this.name = "ExchangeError"
  }
}

const VALID_PAYLOAD = { apiKeyName: "app-1", tenantId: 1, userId: 42, code: "code-x", issuedAt: "x" }

type LaunchOverrides = Partial<{
  deriveAesKey: ReturnType<typeof vi.fn>
  decryptLaunchPayload: ReturnType<typeof vi.fn>
  exchangeCode: ReturnType<typeof vi.fn>
  readTokenTenantId: ReturnType<typeof vi.fn>
  fetchIds: ReturnType<typeof vi.fn>
}>

async function loadRoute(
  config: { env?: Record<string, unknown>; launch?: LaunchOverrides; session?: Record<string, unknown> } = {},
) {
  const env = {
    API_ORIGIN: "https://api.example",
    APP_ID: "app-1",
    DEFAULT_TENANT_ID: 1,
    ONEHEALTH_SECRET_KEY: "secret",
    PP_DISABLED: false,
    ...config.env,
  }
  const launch = {
    deriveAesKey: vi.fn(() => Buffer.alloc(32)),
    decryptLaunchPayload: vi.fn(() => ({ ...VALID_PAYLOAD })),
    exchangeCode: vi.fn(async () => ({ accessToken: "a", refreshToken: "r", expiresIn: 3000 })),
    readTokenTenantId: vi.fn(() => 1),
    fetchIds: vi.fn(async () => ({ userId: 42, personId: 7 })),
    ...config.launch,
    LaunchError: MockLaunchError,
    ExchangeError: MockExchangeError,
  }
  const session = {
    sealSession: vi.fn(async () => "__Host-pp_s=SEALED; HttpOnly; Secure; SameSite=None; Partitioned; Path=/"),
    clearSessionCookie: vi.fn(() => "__Host-pp_s=; HttpOnly; Secure; SameSite=None; Partitioned; Path=/; Max-Age=0"),
    ...config.session,
  }

  vi.resetModules()
  vi.doMock("@/lib/server/env", () => env)
  vi.doMock("@/lib/server/launch", () => launch)
  vi.doMock("@/lib/server/session", () => session)

  const mod = await import("./route")
  return { GET: mod.GET, launch, session }
}

function launchRequest(query = "lpl=abc&tab=contacts") {
  return new Request(`http://localhost:3000/launch?${query}`) as unknown as import("next/server").NextRequest
}

function assertNoStore(res: Response) {
  expect(res.headers.get("cache-control")).toBe("private, no-store, max-age=0")
  expect(res.headers.get("pragma")).toBe("no-cache")
  expect(res.headers.get("vary")).toBe("Cookie")
}

/** A failure response clears the prior session (clear-first), never seals one. */
function assertClearCookie(res: Response) {
  const cookie = res.headers.get("set-cookie") ?? ""
  expect(cookie.startsWith("__Host-pp_s=;")).toBe(true)
  expect(cookie).toMatch(/Max-Age=0/)
}

afterEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
})

describe("GET /launch — failure branches", () => {
  it("wrong app id → reason=invalid, no exchange", async () => {
    const { GET, launch } = await loadRoute({
      launch: { decryptLaunchPayload: vi.fn(() => ({ ...VALID_PAYLOAD, apiKeyName: "someone-else" })) },
    })
    const res = await GET(launchRequest())
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toBe("/launch-error?reason=invalid")
    expect(launch.exchangeCode).not.toHaveBeenCalled()
    assertClearCookie(res)
    assertNoStore(res)
  })

  it("wrong tenant (real value ≠ 1) → reason=tenant, no /myself call", async () => {
    const { GET, launch } = await loadRoute({ launch: { readTokenTenantId: vi.fn(() => 2) } })
    const res = await GET(launchRequest())
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toBe("/launch-error?reason=tenant")
    expect(launch.fetchIds).not.toHaveBeenCalled()
    assertClearCookie(res)
    assertNoStore(res)
  })

  it("missing/unparseable tenant claim (null) → reason=invalid, no /myself call", async () => {
    const { GET, launch } = await loadRoute({ launch: { readTokenTenantId: vi.fn(() => null) } })
    const res = await GET(launchRequest())
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toBe("/launch-error?reason=invalid")
    expect(launch.fetchIds).not.toHaveBeenCalled()
    assertClearCookie(res)
    assertNoStore(res)
  })

  it("id mismatch → reason=invalid, no session cookie sealed", async () => {
    const { GET, launch, session } = await loadRoute({
      launch: { fetchIds: vi.fn(async () => ({ userId: 999, personId: 7 })) },
    })
    const res = await GET(launchRequest())
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toBe("/launch-error?reason=invalid")
    expect(launch.fetchIds).toHaveBeenCalledOnce()
    expect(session.sealSession).not.toHaveBeenCalled()
    assertClearCookie(res)
    assertNoStore(res)
  })

  it("PP_DISABLED → reason=disabled, no decrypt/exchange", async () => {
    const { GET, launch } = await loadRoute({ env: { PP_DISABLED: true } })
    const res = await GET(launchRequest())
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toBe("/launch-error?reason=disabled")
    expect(launch.decryptLaunchPayload).not.toHaveBeenCalled()
    expect(launch.exchangeCode).not.toHaveBeenCalled()
    assertClearCookie(res)
    assertNoStore(res)
  })

  it("bad key (deriveAesKey throws) → reason=config", async () => {
    const { GET, launch } = await loadRoute({
      launch: {
        deriveAesKey: vi.fn(() => {
          throw new MockLaunchError("config")
        }),
      },
    })
    const res = await GET(launchRequest())
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toBe("/launch-error?reason=config")
    expect(launch.decryptLaunchPayload).not.toHaveBeenCalled()
    assertClearCookie(res)
    assertNoStore(res)
  })

  it("exchange says already-consumed → reason=used", async () => {
    const { GET } = await loadRoute({
      launch: {
        exchangeCode: vi.fn(async () => {
          throw new MockExchangeError("used")
        }),
      },
    })
    const res = await GET(launchRequest())
    expect(res.headers.get("location")).toBe("/launch-error?reason=used")
    assertClearCookie(res)
  })

  it("exchange says expired → reason=expired", async () => {
    const { GET } = await loadRoute({
      launch: {
        exchangeCode: vi.fn(async () => {
          throw new MockExchangeError("expired")
        }),
      },
    })
    const res = await GET(launchRequest())
    expect(res.headers.get("location")).toBe("/launch-error?reason=expired")
    assertClearCookie(res)
  })

  it("myself fetch returns null → reason=invalid, no session sealed", async () => {
    const { GET, session } = await loadRoute({ launch: { fetchIds: vi.fn(async () => null) } })
    const res = await GET(launchRequest())
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toBe("/launch-error?reason=invalid")
    expect(session.sealSession).not.toHaveBeenCalled()
    assertClearCookie(res)
    assertNoStore(res)
  })

  it("missing lpl → reason=invalid", async () => {
    const { GET, launch } = await loadRoute()
    const res = await GET(launchRequest("tab=contacts"))
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toBe("/launch-error?reason=invalid")
    expect(launch.decryptLaunchPayload).not.toHaveBeenCalled()
    assertClearCookie(res)
    assertNoStore(res)
  })
})

describe("GET /launch — success branch", () => {
  it("seals the cookie and redirects to verify with tab=contacts", async () => {
    const { GET, session } = await loadRoute()
    const res = await GET(launchRequest("lpl=abc&tab=contacts"))
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toBe("/launch/verify?tab=contacts")
    expect(session.sealSession).toHaveBeenCalledOnce()
    expect(res.headers.get("set-cookie")).toMatch(/^__Host-pp_s=SEALED;/)
    assertNoStore(res)
  })

  it("normalizes an unknown tab to contacts", async () => {
    const { GET } = await loadRoute()
    const res = await GET(launchRequest("lpl=abc&tab=bogus"))
    expect(res.headers.get("location")).toBe("/launch/verify?tab=contacts")
  })

  it("keeps a valid non-default tab", async () => {
    const { GET } = await loadRoute()
    const res = await GET(launchRequest("lpl=abc&tab=insurance"))
    expect(res.headers.get("location")).toBe("/launch/verify?tab=insurance")
  })
})
