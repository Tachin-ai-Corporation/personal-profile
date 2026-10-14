// @vitest-environment node
import { createCipheriv, hkdfSync, randomBytes } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * `POST /api/token` (Story 1.2), through the real route module
 * (`app/api/token/route.ts` → `lib/server/token.ts`): the real launch helpers and session seal run
 * over a stubbed env module and a stubbed upstream `fetch`, so every matrix row
 * is asserted end to end: status, body, Set-Cookie, upstream calls, no-store
 * headers and the log line.
 */

const PROD_KEY = "prod-secret-key-value"
const DEMO_KEY = "demo-secret-key-value"
const PROD_APP = "pp-app-prod"
const DEMO_APP = "pp-app-demo"
const SESSION_SECRET = "token-route-session-secret-0123456789abcdef"
const USER_ID = 918273645
const PERSON_ID = 564738291
const CODE = "one-time-code-xyz"

const PROD_ROOT = "https://1health.app.1health.io"
const DEMO_ROOT = "https://1health.demo.1health.io"
const TOKEN_PATH = "/api/v2/public/external-application/auth/oauth2/user/token"
const MYSELF_PATH = "/api/v2/user/myself"

type EnvConfig = {
  PP_DISABLED?: boolean
  prodKey?: string
  demoKey?: string
  prodApp?: string
  demoApp?: string
  /** Mock the session module with the real `clearSessionCookie` and a rejecting `sealSession`. */
  failSeal?: boolean
}

function deriveKey(secret: string): Buffer {
  // Same HKDF as the platform (asserted byte-for-byte in lib/server/launch.test.ts).
  return Buffer.from(hkdfSync("sha256", Buffer.from(secret, "utf8"), Buffer.alloc(32, 0), Buffer.alloc(0), 32))
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    required: {
      apiKey: { name: PROD_APP },
      tenant: { id: 1 },
      user: { id: USER_ID },
      externalApplicationId: { id: 1 },
      oneTimeCode: { value: CODE, issuedAt: "2026-10-14T00:00:00" },
      ...overrides,
    },
  }
}

function encrypt(obj: unknown, secret: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv)
  const json = typeof obj === "string" ? obj : JSON.stringify(obj)
  const ct = Buffer.concat([cipher.update(json, "utf8"), cipher.final()])
  return Buffer.concat([iv, ct, cipher.getAuthTag()]).toString("base64")
}

function jwt(tenantId: unknown): string {
  const h = Buffer.from(JSON.stringify({ alg: "RS256" })).toString("base64url")
  const p = Buffer.from(JSON.stringify({ tenantId })).toString("base64url")
  return `${h}.${p}.sig`
}

const ACCESS_TOKEN = jwt(1)
const REFRESH_TOKEN = "refresh-token-secret-value"

type Upstream = {
  exchange?: () => Response | Promise<Response>
  myself?: () => Response | Promise<Response>
}

let fetchMock: ReturnType<typeof vi.fn>
let infoSpy: ReturnType<typeof vi.spyOn>
let warnSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

function stubUpstream(upstream: Upstream = {}) {
  fetchMock = vi.fn(async (input: string) => {
    const url = String(input)
    if (url.endsWith(TOKEN_PATH)) {
      return upstream.exchange
        ? upstream.exchange()
        : json({ access_token: ACCESS_TOKEN, refresh_token: REFRESH_TOKEN, expires_in: 3000, token_type: "Bearer" })
    }
    if (url.endsWith(MYSELF_PATH)) {
      return upstream.myself ? upstream.myself() : json({ id: USER_ID, personId: PERSON_ID, firstName: "A" })
    }
    throw new Error(`unexpected upstream ${url}`)
  })
  vi.stubGlobal("fetch", fetchMock)
}

async function loadRoute(config: EnvConfig = {}) {
  vi.resetModules()
  const keys = { prod: config.prodKey ?? PROD_KEY, demo: config.demoKey ?? DEMO_KEY }
  const apps = { prod: config.prodApp ?? PROD_APP, demo: config.demoApp ?? DEMO_APP }
  vi.doMock("@/lib/server/env", () => ({
    DEFAULT_TENANT_ID: 1,
    PP_DISABLED: config.PP_DISABLED ?? false,
    SESSION_SECRET,
    SESSION_SECRET_PREVIOUS: undefined,
    getSecretKey: (env: "demo" | "prod") => keys[env],
    getAppId: (env: "demo" | "prod") => apps[env],
    getSecretKeyVarName: (env: "demo" | "prod") => `SECRET_VAR_FOR_${env}`,
  }))
  vi.doMock("next/headers", () => ({ cookies: vi.fn() }))
  vi.doMock("next/navigation", () => ({ redirect: vi.fn() }))
  if (config.failSeal) {
    vi.doMock("@/lib/server/session", async (importOriginal) => {
      const real = await importOriginal<typeof import("@/lib/server/session")>()
      return { ...real, clearSessionCookie: real.clearSessionCookie, sealSession: vi.fn().mockRejectedValue(new Error("seal failed")) }
    })
  } else {
    vi.doUnmock("@/lib/server/session")
  }
  const route = await import("@/app/api/token/route")
  const session = await import("@/lib/server/session")
  return { route, session }
}

function post(body: unknown, contentType: string | null = "application/json"): Request {
  const headers: Record<string, string> = {}
  if (contentType) headers["Content-Type"] = contentType
  return new Request("http://localhost:3000/api/token", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

async function call(config: EnvConfig, body: unknown, upstream?: Upstream, contentType?: string | null) {
  stubUpstream(upstream)
  const { route, session } = await loadRoute(config)
  const res = await route.POST(post(body, contentType))
  const text = await res.text()
  return { res, text, body: JSON.parse(text) as Record<string, unknown>, cookies: res.headers.getSetCookie(), session }
}

const CLEAR = "__Host-pp_s=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"
const EXPIRED_MSG = "This link has expired. Open Personal Profile again from 1health."

function assertNoStore(res: Response) {
  expect(res.headers.get("cache-control")).toBe("private, no-store, max-age=0")
  expect(res.headers.get("pragma")).toBe("no-cache")
  expect(res.headers.get("vary")).toBe("Cookie")
}

/** No token, code, id, secret or payload in the body or any log line. */
function assertNothingLeaked(text: string, lpl?: string) {
  const logs = [...infoSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls].map((c) => c.map(String).join(" "))
  const secrets = [ACCESS_TOKEN, REFRESH_TOKEN, CODE, String(USER_ID), String(PERSON_ID), PROD_KEY, DEMO_KEY, PROD_APP, DEMO_APP]
  if (lpl) secrets.push(lpl)
  for (const s of secrets) {
    expect(text).not.toContain(s)
    for (const line of logs) expect(line).not.toContain(s)
  }
}

function logLine(): Record<string, unknown> {
  const lines = (infoSpy.mock.calls as unknown[][]).map((c) => JSON.parse(String(c[0])) as Record<string, unknown>)
  const launch = lines.filter((l) => l.routeTemplate === "/api/token")
  expect(launch).toHaveLength(1)
  return launch[0]
}

beforeEach(() => {
  infoSpy = vi.spyOn(console, "info").mockImplementation(() => {})
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe("POST /api/token — success", () => {
  it("prod launch → 200 {ok, environment:prod}, Lax session sealed for prod, remembered environment, one exchange at the prod root", async () => {
    const lpl = encrypt(payload(), PROD_KEY)
    const { res, text, body, cookies, session } = await call({}, { lpl })
    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true, environment: "prod" })
    assertNoStore(res)

    expect(cookies).toHaveLength(2)
    const sealed = cookies.find((c) => c.startsWith("__Host-pp_s="))!
    expect(sealed.endsWith("; HttpOnly; Secure; SameSite=Lax; Path=/")).toBe(true)
    expect(sealed).not.toMatch(/Partitioned|SameSite=None|Domain|Max-Age|Expires/i)
    const data = await session.unsealSession(sealed.slice("__Host-pp_s=".length, sealed.indexOf(";")))
    expect(data).toMatchObject({
      environment: "prod",
      userId: USER_ID,
      personId: PERSON_ID,
      tenantId: 1,
      accessToken: ACCESS_TOKEN,
      refreshToken: REFRESH_TOKEN,
      gen: 0,
    })
    expect(data!.sid).toMatch(/^[0-9a-f]{32}$/)
    expect(data!.iat).toBe(data!.lastSeen)
    expect(cookies).toContain("onehealth_environment=prod; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000")

    const urls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(urls).toEqual([`${PROD_ROOT}${TOKEN_PATH}`, `${PROD_ROOT}${MYSELF_PATH}`])
    const exchangeInit = fetchMock.mock.calls[0][1] as RequestInit
    expect(exchangeInit).toMatchObject({ method: "POST", cache: "no-store", redirect: "manual" })
    const { buildSignature } = await import("@/lib/server/launch")
    expect(JSON.parse(String(exchangeInit.body))).toEqual({ securityCode: CODE, signature: buildSignature(CODE, PROD_KEY) })
    const myselfInit = fetchMock.mock.calls[1][1] as RequestInit
    expect(new Headers(myselfInit.headers).get("authorization")).toBe(`Bearer ${ACCESS_TOKEN}`)

    expect(logLine()).toEqual({
      requestId: expect.any(String),
      routeTemplate: "/api/token",
      outcome: "OK",
      environment: "prod",
      durationMs: expect.any(Number),
    })
    assertNothingLeaked(text, lpl)
  })

  it("demo launch → environment:demo at the demo root, demo app id", async () => {
    const lpl = encrypt(payload({ apiKey: { name: DEMO_APP } }), DEMO_KEY)
    const { res, body, cookies, session } = await call({}, { lpl })
    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true, environment: "demo" })
    const sealed = cookies.find((c) => c.startsWith("__Host-pp_s="))!
    const data = await session.unsealSession(sealed.slice("__Host-pp_s=".length, sealed.indexOf(";")))
    expect(data?.environment).toBe("demo")
    expect(cookies).toContain("onehealth_environment=demo; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000")
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([`${DEMO_ROOT}${TOKEN_PATH}`, `${DEMO_ROOT}${MYSELF_PATH}`])
  })

  it("ignores any client-sent environment and extra fields (D2)", async () => {
    const lpl = encrypt(payload(), PROD_KEY)
    const { body } = await call({}, { lpl, environment: "demo", apiRoot: "https://evil.example" })
    expect(body).toEqual({ ok: true, environment: "prod" })
    expect(fetchMock.mock.calls.every((c) => String(c[0]).startsWith(PROD_ROOT))).toBe(true)
  })

  it("tolerates spaces for '+' in the lpl", async () => {
    let lpl = encrypt(payload(), PROD_KEY)
    while (!lpl.includes("+")) lpl = encrypt(payload(), PROD_KEY)
    const { res } = await call({}, { lpl: lpl.replace(/\+/g, " ") })
    expect(res.status).toBe(200)
  })

  it("trimmed key: only key.trim() decrypts → succeeds, one warning naming the variable, signature keyed by the trimmed variant", async () => {
    const lpl = encrypt(payload(), PROD_KEY)
    const { res, text } = await call({ prodKey: `  ${PROD_KEY}\n` }, { lpl })
    expect(res.status).toBe(200)
    expect(warnSpy).toHaveBeenCalledOnce()
    expect(String(warnSpy.mock.calls[0][0])).toContain("SECRET_VAR_FOR_prod")
    const { buildSignature } = await import("@/lib/server/launch")
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)).signature).toBe(
      buildSignature(CODE, PROD_KEY),
    )
    assertNothingLeaked(text, lpl)
  })
})

describe("POST /api/token — invalid payloads (400, retryable:false, no upstream)", () => {
  const cases: [string, () => unknown][] = [
    ["missing lpl", () => ({})],
    ["empty lpl", () => ({ lpl: "" })],
    ["non-string lpl", () => ({ lpl: 123 })],
    ["a JSON array body", () => [encrypt(payload(), PROD_KEY)]],
    ["a non-JSON body", () => "lpl=abc"],
    ["an oversized body", () => ({ lpl: "A".repeat(20_000) })],
    ["not base64", () => ({ lpl: "***not base64***".repeat(3) })],
    ["< 28 bytes", () => ({ lpl: Buffer.alloc(27).toString("base64") })],
    ["neither key", () => ({ lpl: encrypt(payload(), "some-other-key") })],
    ["cleartext JSON", () => ({ lpl: Buffer.from(JSON.stringify(payload())).toString("base64") })],
    ["bad JSON plaintext", () => ({ lpl: encrypt("{not json", PROD_KEY) })],
    ["missing a required field", () => ({ lpl: encrypt({ required: { apiKey: { name: PROD_APP } } }, PROD_KEY) })],
    ["app id ≠ the prod app id", () => ({ lpl: encrypt(payload({ apiKey: { name: DEMO_APP } }), PROD_KEY) })],
    ["app id ≠ the demo app id", () => ({ lpl: encrypt(payload(), DEMO_KEY) })],
  ]

  it.each(cases)("%s", async (_label, makeBody) => {
    const sent = makeBody()
    const { res, text, body, cookies } = await call({}, sent)
    expect(res.status).toBe(400)
    expect(body).toEqual({ ok: false, errorCode: "LAUNCH_INVALID", source: "proxy", message: EXPIRED_MSG, retryable: false })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(cookies).toEqual([CLEAR])
    assertNoStore(res)
    expect(logLine().outcome).toBe("LAUNCH_INVALID")
    assertNothingLeaked(text, typeof sent === "object" && sent && "lpl" in sent ? String((sent as { lpl: unknown }).lpl) : undefined)
  })
})

describe("POST /api/token — exchange failures (retryable)", () => {
  it.each([
    ["already redeemed", () => json({ message: "External application security code: 'X' has already been redeemed.", code: 400 }, 400), 400, "LAUNCH_USED"],
    ["expired", () => json({ message: "External application security code: 'X' has expired.", code: 400 }, 400), 400, "LAUNCH_EXPIRED"],
    ["other 4xx", () => json({ message: "Invalid signature provided.", code: 400 }, 400), 400, "LAUNCH_INVALID"],
    ["5xx", () => new Response("boom upstream detail", { status: 503 }), 502, "LAUNCH_INVALID"],
    ["network error", () => Promise.reject(new TypeError("fetch failed")), 502, "LAUNCH_INVALID"],
    ["timeout", () => Promise.reject(Object.assign(new Error("aborted"), { name: "AbortError" })), 502, "LAUNCH_INVALID"],
  ] as const)("%s → %i %s, no retryable:false, no cookie, exchanged once", async (_label, exchange, status, errorCode) => {
    const lpl = encrypt(payload(), PROD_KEY)
    const { res, text, body, cookies } = await call({}, { lpl }, { exchange })
    expect(res.status).toBe(status)
    expect(body).toEqual({
      ok: false,
      errorCode,
      source: "proxy",
      message: EXPIRED_MSG,
    })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(cookies).toEqual([CLEAR])
    expect(text).not.toContain("redeemed")
    expect(text).not.toContain("boom upstream detail")
    expect(logLine()).toMatchObject({ outcome: errorCode, environment: "prod" })
  })
})

describe("POST /api/token — tenant and /myself", () => {
  it("tenantId ≠ 1 → 403 WRONG_TENANT, retryable:false, no /myself, no cookie", async () => {
    const lpl = encrypt(payload(), PROD_KEY)
    const exchange = () => json({ access_token: jwt(7), refresh_token: "r", expires_in: 3000 })
    const { res, body, cookies } = await call({}, { lpl }, { exchange })
    expect(res.status).toBe(403)
    expect(body).toEqual({
      ok: false,
      errorCode: "WRONG_TENANT",
      source: "proxy",
      message: "This is available in your personal account. Switch to it in 1health and open it again.",
      retryable: false,
    })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(cookies).toEqual([CLEAR])
  })

  it("an unparseable tenant claim → 502 LAUNCH_INVALID", async () => {
    const lpl = encrypt(payload(), PROD_KEY)
    const exchange = () => json({ access_token: "not-a-jwt", refresh_token: "r", expires_in: 3000 })
    const { res, body } = await call({}, { lpl }, { exchange })
    expect(res.status).toBe(502)
    expect(body.errorCode).toBe("LAUNCH_INVALID")
    expect(body.retryable).toBeUndefined()
  })

  it.each([
    ["/myself fails", () => new Response("nope", { status: 500 })],
    ["/myself id ≠ payload user", () => json({ id: USER_ID + 1, personId: PERSON_ID })],
    ["/myself without personId", () => json({ id: USER_ID })],
  ])("%s → 502 LAUNCH_INVALID, no session cookie", async (_label, myself) => {
    const lpl = encrypt(payload(), PROD_KEY)
    const { res, body, cookies } = await call({}, { lpl }, { myself })
    expect(res.status).toBe(502)
    expect(body).toEqual({ ok: false, errorCode: "LAUNCH_INVALID", source: "proxy", message: EXPIRED_MSG })
    expect(cookies).toEqual([CLEAR])
  })
})

describe("POST /api/token — oversized body and fail-closed", () => {
  it("a declared Content-Length over 16 KB → 400 LAUNCH_INVALID without reading the body", async () => {
    stubUpstream()
    const { route } = await loadRoute()
    const pull = vi.fn()
    // highWaterMark 0: the stream is pulled only when someone reads it.
    const body = new ReadableStream({ pull }, { highWaterMark: 0 })
    const req = new Request("http://localhost:3000/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": "1000000" },
      body,
      duplex: "half",
    } as RequestInit)
    const res = await route.POST(req)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ ok: false, errorCode: "LAUNCH_INVALID", source: "proxy", message: EXPIRED_MSG, retryable: false })
    expect(pull).not.toHaveBeenCalled()
    expect(req.bodyUsed).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(res.headers.getSetCookie()).toEqual([CLEAR])
  })

  it("an unexpected fault (sealing rejects) fails closed: 502 LAUNCH_INVALID, clear cookie only, one log line", async () => {
    stubUpstream()
    const { route } = await loadRoute({ failSeal: true })
    const res = await route.POST(post({ lpl: encrypt(payload(), PROD_KEY) }))
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ ok: false, errorCode: "LAUNCH_INVALID", source: "proxy", message: EXPIRED_MSG })
    expect(res.headers.getSetCookie()).toEqual([CLEAR])
    assertNoStore(res)
    expect(logLine().outcome).toBe("LAUNCH_INVALID")
  })
})

describe("POST /api/token — method, media type, kill switch, config", () => {
  it("is force-dynamic and exports POST plus explicit 405 handlers", async () => {
    const { route } = await loadRoute()
    expect(route.dynamic).toBe("force-dynamic")
    expect(Object.keys(route).sort()).toEqual(["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT", "dynamic"])
  })

  it("GET and other methods → 405 with Allow: POST", async () => {
    const { route } = await loadRoute()
    for (const handler of [route.GET, route.PUT, route.PATCH, route.DELETE, route.HEAD, route.OPTIONS]) {
      const res = handler()
      expect(res.status).toBe(405)
      expect(res.headers.get("allow")).toBe("POST")
      expect(res.headers.getSetCookie()).toEqual([])
      assertNoStore(res)
    }
  })

  it.each([null, "text/plain", "application/x-www-form-urlencoded", "multipart/form-data"])(
    "Content-Type %s → 415 UNSUPPORTED_MEDIA, no decrypt, cookie untouched",
    async (type) => {
      const lpl = encrypt(payload(), PROD_KEY)
      const { res, body, cookies } = await call({}, { lpl }, undefined, type)
      expect(res.status).toBe(415)
      expect(body).toMatchObject({ ok: false, errorCode: "UNSUPPORTED_MEDIA", source: "proxy", retryable: false })
      expect(typeof body.message).toBe("string")
      expect(fetchMock).not.toHaveBeenCalled()
      expect(cookies).toEqual([])
    },
  )

  it("accepts application/json with a charset", async () => {
    const lpl = encrypt(payload(), PROD_KEY)
    const { res } = await call({}, { lpl }, undefined, "application/json; charset=utf-8")
    expect(res.status).toBe(200)
  })

  it("PP_DISABLED → 503 SERVICE_DISABLED, no decrypt, no upstream, cookie untouched", async () => {
    const lpl = encrypt(payload(), PROD_KEY)
    const { res, body, cookies } = await call({ PP_DISABLED: true }, { lpl })
    expect(res.status).toBe(503)
    expect(body).toEqual({
      ok: false,
      errorCode: "SERVICE_DISABLED",
      source: "proxy",
      message: "Personal Profile is unavailable right now. Use your profile in 1health for now.",
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(cookies).toEqual([])
    assertNoStore(res)
  })

  it("a key that cannot become an AES key → 503 LAUNCH_CONFIG", async () => {
    const lpl = encrypt(payload(), PROD_KEY)
    const { res, body, cookies } = await call({ demoKey: "   " }, { lpl })
    expect(res.status).toBe(503)
    expect(body).toEqual({
      ok: false,
      errorCode: "LAUNCH_CONFIG",
      source: "proxy",
      message: "Personal Profile is unavailable right now. Use your profile in 1health for now.",
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(cookies).toEqual([CLEAR])
  })
})
