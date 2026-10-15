import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"
import { secretKeyVariable } from "@/lib/server/env"
import { setLogSink } from "@/lib/server/log"
import { TEST_DEMO_SECRET, TEST_DEV_ENV, TEST_DEV_SECRET, TEST_PROD_SECRET, testEnv } from "@/test/env-fixture"
import { encryptLpl, launchPayload } from "@/test/lpl-fixture"
import { server, trackAllRequests } from "@/test/msw-server"
import { fakeAccessToken, NOW } from "@/test/session-fixture"
import { DEMO, DEV, exchangeUrl, logoutAllUrl, myselfUrl, PROD, tokenResponse } from "@/test/upstream-fixture"
import { classifyExchangeError, exchangeCode, fetchMyselfIds, readTenantId } from "./exchange"
import { DETECTION_ORDER, detectEnvironment, keyVariants, launch, parseLaunchPayload, type LaunchCredentials } from "./launch"
import { signCode } from "./lpl-crypto"
import { sessionPayloadSchema } from "@/lib/server/session/types"

const ENV = testEnv(TEST_DEV_ENV)()
const DEMO_KEY = TEST_DEMO_SECRET
const PROD_KEY = TEST_PROD_SECRET
const DEV_KEY = TEST_DEV_SECRET

/** Demo and prod keys (overridable); dev only when `keys.dev` is given (D18). */
function credentials(keys: { demo?: string; prod?: string; dev?: string } = {}): LaunchCredentials {
  const stored = { demo: keys.demo ?? DEMO_KEY, prod: keys.prod ?? PROD_KEY, dev: keys.dev ?? "" }
  return {
    getSecretKey: (env) => stored[env],
    getAppId: (env) => ENV.getAppId(env),
    configuredEnvironments: keys.dev === undefined ? ["demo", "prod"] : ["demo", "prod", "dev"],
  }
}

const demoLpl = (overrides: Parameters<typeof launchPayload>[0] = {}) => encryptLpl(launchPayload(overrides), DEMO_KEY)

function upstream(apiRoot: string, options: { tenantId?: number; myselfId?: number; onExchange?: (body: unknown) => void } = {}) {
  server.use(
    http.post(exchangeUrl(apiRoot), async ({ request }) => {
      options.onExchange?.(await request.json())
      return HttpResponse.json(tokenResponse({ tenantId: options.tenantId }))
    }),
    http.get(myselfUrl(apiRoot), () => HttpResponse.json({ id: options.myselfId ?? 42, personId: 4242, firstName: "Ann" })),
  )
}

function captureWarnings(): { lines: string[]; restore: () => void } {
  const lines: string[] = []
  const push = (l: string) => void lines.push(l)
  return { lines, restore: setLogSink({ info: () => undefined, warn: push, error: () => undefined }) }
}

describe("parseLaunchPayload", () => {
  it("parses the required fields and rejects bad JSON or missing fields", () => {
    expect(parseLaunchPayload(launchPayload())?.required.user.id).toBe(42)
    expect(parseLaunchPayload("not json")).toBeNull()
    expect(parseLaunchPayload('{"required":{"apiKey":{"name":"x"}}}')).toBeNull()
  })
})

describe("environment detection by key (D2)", () => {
  it("tries prod then demo, each as stored then trimmed, skipping blank keys", () => {
    expect(keyVariants(credentials({ demo: " d ", prod: "p" })).map((v) => `${v.environment}:${v.key}:${v.trimmed}`)).toEqual([
      "prod:p:false",
      "demo: d :false",
      "demo:d:true",
    ])
    expect(keyVariants(credentials({ demo: "   ", prod: "p" })).map((v) => v.environment)).toEqual(["prod"])
  })

  it("tries dev last, and only when configured (D18)", () => {
    expect(DETECTION_ORDER).toEqual(["prod", "demo", "dev"])
    expect(keyVariants(credentials({ dev: DEV_KEY })).map((v) => v.environment)).toEqual(["prod", "demo", "dev"])
    expect(keyVariants(credentials()).map((v) => v.environment)).toEqual(["prod", "demo"])
    // A dev key the env did not configure is never tried.
    const unconfigured = { ...credentials({ dev: DEV_KEY }), configuredEnvironments: ["demo", "prod"] as const }
    expect(keyVariants(unconfigured).map((v) => v.environment)).toEqual(["prod", "demo"])
    expect(detectEnvironment(encryptLpl("{}", DEV_KEY), keyVariants(unconfigured))).toBeNull()
  })

  it("a prod-key payload → prod; a demo-key payload → demo; neither → null", () => {
    const variants = keyVariants(credentials())
    expect(detectEnvironment(encryptLpl("{}", PROD_KEY), variants)?.variant.environment).toBe("prod")
    expect(detectEnvironment(encryptLpl("{}", DEMO_KEY), variants)?.variant.environment).toBe("demo")
    expect(detectEnvironment(encryptLpl("{}", "other-key"), variants)).toBeNull()
  })
})

describe("launch", () => {
  it("detects demo by key, exchanges once with that key, checks myself, and seals a fresh session", async () => {
    const exchanges: unknown[] = []
    upstream(DEMO.apiRoot, { onExchange: (body) => exchanges.push(body) })
    const result = await launch(demoLpl(), credentials(), NOW)
    expect(exchanges).toEqual([{ securityCode: "one-time-code", signature: signCode("one-time-code", DEMO_KEY) }])
    expect(result.kind).toBe("ok")
    if (result.kind !== "ok") return
    expect(result.session).toMatchObject({
      refreshToken: "refresh-token",
      accessExpiresAt: NOW + 3_000_000,
      userId: 42,
      personId: 4242,
      tenantId: 1,
      gen: 0,
      iat: NOW,
      lastSeen: NOW,
      environment: "demo",
    })
    expect(JSON.stringify(result.session)).not.toContain("id-token")
    expect(Buffer.from(result.session.sid, "base64url").length).toBeGreaterThanOrEqual(16)
  })

  it.each([
    ["3600", NOW + 3_600_000],
    ["1e13", NOW + 300_000],
    [1e308, NOW + 300_000],
    [10, NOW + 300_000],
    ["0x10", NOW + 300_000],
    [undefined, NOW + 300_000],
  ])("expires_in %j from the exchange → a session (unusable values fall back to 300 s, tokens kept)", async (expiresIn, expected) => {
    server.use(
      http.post(exchangeUrl(DEMO.apiRoot), () => HttpResponse.json({ ...tokenResponse(), expires_in: expiresIn })),
      http.get(myselfUrl(DEMO.apiRoot), () => HttpResponse.json({ id: 42, personId: 4242 })),
    )
    const result = await launch(demoLpl(), credentials(), NOW)
    if (result.kind !== "ok") throw new Error("expected a session")
    expect(result.session.accessExpiresAt).toBe(expected)
    expect(sessionPayloadSchema.safeParse(result.session).success).toBe(true)
  })

  it.each([
    [3599.5, NOW + 3_599_500],
    [3599.0005, NOW + 3_599_000],
  ])("keeps whole milliseconds for expires_in %s, so the sealed session still validates", async (expiresIn, expected) => {
    server.use(
      http.post(exchangeUrl(DEMO.apiRoot), () => HttpResponse.json({ ...tokenResponse(), expires_in: expiresIn })),
      http.get(myselfUrl(DEMO.apiRoot), () => HttpResponse.json({ id: 42, personId: 4242 })),
    )
    const result = await launch(demoLpl(), credentials(), NOW)
    if (result.kind !== "ok") throw new Error("expected a session")
    expect(result.session.accessExpiresAt).toBe(expected)
    expect(sessionPayloadSchema.safeParse(result.session).success).toBe(true)
  })

  it("detects prod by key and talks to the prod root", async () => {
    upstream(PROD.apiRoot)
    const result = await launch(encryptLpl(launchPayload({ appId: ENV.getAppId("prod") }), PROD_KEY), credentials(), NOW)
    expect(result.kind === "ok" && result.session.environment).toBe("prod")
  })

  it("detects dev by key and talks to the dev root (D18)", async () => {
    const calls: string[] = []
    upstream(DEV.apiRoot, { onExchange: () => calls.push("exchange") })
    const result = await launch(encryptLpl(launchPayload({ appId: ENV.getAppId("dev") }), DEV_KEY), credentials({ dev: DEV_KEY }), NOW)
    expect(result.kind === "ok" && result.session.environment).toBe("dev")
    expect(calls).toEqual(["exchange"])
    expect(sessionPayloadSchema.safeParse(result.kind === "ok" && result.session).success).toBe(true)
  })

  it("rejects a dev payload carrying the demo app id", async () => {
    const result = await launch(encryptLpl(launchPayload({ appId: ENV.getAppId("demo") }), DEV_KEY), credentials({ dev: DEV_KEY }), NOW)
    expect(result).toEqual({ kind: "failed", errorCode: "LAUNCH_INVALID", status: 400, retryable: false, environment: "dev" })
  })

  it("accepts a key that only matches after trim, warning without the value, and signs with the trimmed key", async () => {
    const exchanges: unknown[] = []
    upstream(DEMO.apiRoot, { onExchange: (body) => exchanges.push(body) })
    const { lines, restore } = captureWarnings()
    const result = await launch(demoLpl(), credentials({ demo: `  ${DEMO_KEY}\n` }), NOW)
    restore()
    expect(result.kind).toBe("ok")
    expect(exchanges).toEqual([{ securityCode: "one-time-code", signature: signCode("one-time-code", DEMO_KEY) }])
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain(secretKeyVariable("demo"))
    expect(lines[0]).not.toContain(DEMO_KEY)
  })

  it("logs no warning when the padded key itself decrypts (signing with the key as stored)", async () => {
    const padded = `  ${DEMO_KEY}\n`
    const exchanges: unknown[] = []
    upstream(DEMO.apiRoot, { onExchange: (body) => exchanges.push(body) })
    const { lines, restore } = captureWarnings()
    const result = await launch(encryptLpl(launchPayload(), padded), credentials({ demo: padded }), NOW)
    restore()
    expect(result.kind).toBe("ok")
    expect(exchanges).toEqual([{ securityCode: "one-time-code", signature: signCode("one-time-code", padded) }])
    expect(lines).toEqual([])
  })

  it("answers 503 LAUNCH_CONFIG when no key is usable", async () => {
    const calls = trackAllRequests()
    expect(await launch(demoLpl(), credentials({ demo: " ", prod: "\t" }), NOW)).toEqual({
      kind: "failed",
      errorCode: "LAUNCH_CONFIG",
      status: 503,
      retryable: false,
    })
    expect(calls()).toBe(0)
  })

  it.each([
    ["undecodable payload", () => "%%%", undefined],
    ["payload neither key decrypts", () => encryptLpl(launchPayload(), "other-key"), undefined],
    ["too-short payload", () => Buffer.alloc(27).toString("base64"), undefined],
    ["cleartext JSON", () => Buffer.from(launchPayload()).toString("base64"), undefined],
    ["unparseable plaintext", () => encryptLpl("not json", DEMO_KEY), "demo"],
    ["missing fields", () => encryptLpl('{"required":{}}', DEMO_KEY), "demo"],
    ["foreign app id", () => demoLpl({ appId: "other-app" }), "demo"],
  ])("rejects a %s with 400 LAUNCH_INVALID, retryable:false and no upstream call", async (_label, lpl, environment) => {
    const calls = trackAllRequests()
    expect(await launch(lpl(), credentials(), NOW)).toEqual({ kind: "failed", errorCode: "LAUNCH_INVALID", status: 400, retryable: false, environment })
    expect(calls()).toBe(0)
  })

  it.each([
    ["External application security code: 'one-time-code' has already been redeemed.", 400, "LAUNCH_USED", 400],
    ["External application security code: 'one-time-code' has expired.", 400, "LAUNCH_EXPIRED", 400],
    ["Could not find external application security code: 'one-time-code'", 400, "LAUNCH_INVALID", 400],
    ["Invalid signature provided.", 400, "LAUNCH_INVALID", 400],
    ["boom", 500, "LAUNCH_INVALID", 502],
  ])("maps an exchange answer %j (%i) to %s %i, retryable", async (message, upstreamStatus, errorCode, status) => {
    server.use(http.post(exchangeUrl(DEMO.apiRoot), () => HttpResponse.json({ message }, { status: upstreamStatus })))
    expect(await launch(demoLpl(), credentials(), NOW)).toEqual({ kind: "failed", errorCode, status, retryable: true, environment: "demo" })
  })

  it("rejects a non-default tenant (AD-6) with 403 WRONG_TENANT, retryable:false, no further call", async () => {
    let myselfCalls = 0
    server.use(
      http.post(exchangeUrl(DEMO.apiRoot), () => HttpResponse.json(tokenResponse({ tenantId: 7 }))),
      http.get(myselfUrl(DEMO.apiRoot), () => {
        myselfCalls += 1
        return HttpResponse.json({})
      }),
    )
    expect(await launch(demoLpl(), credentials(), NOW)).toEqual({ kind: "failed", errorCode: "WRONG_TENANT", status: 403, retryable: false, environment: "demo" })
    expect(myselfCalls).toBe(0)
  })

  it("answers 502 LAUNCH_INVALID (retryable) for an unreadable tenant claim", async () => {
    server.use(http.post(exchangeUrl(DEMO.apiRoot), () => HttpResponse.json(tokenResponse({ accessToken: "opaque" }))))
    expect(await launch(demoLpl(), credentials(), NOW)).toEqual({ kind: "failed", errorCode: "LAUNCH_INVALID", status: 502, retryable: true, environment: "demo" })
  })

  it("answers 502 LAUNCH_INVALID (retryable) when myself's id differs or myself fails", async () => {
    upstream(DEMO.apiRoot, { myselfId: 99 })
    expect(await launch(demoLpl(), credentials(), NOW)).toMatchObject({ errorCode: "LAUNCH_INVALID", status: 502, retryable: true })
    server.use(http.get(myselfUrl(DEMO.apiRoot), () => new HttpResponse(null, { status: 500 })))
    expect(await launch(demoLpl(), credentials())).toMatchObject({ errorCode: "LAUNCH_INVALID", status: 502 })
  })
})

describe("launch: revocation of issued tokens after a post-exchange failure (A11)", () => {
  function trackRevocations(resolver: () => Response = () => new HttpResponse(null, { status: 200 })): string[] {
    const bearers: string[] = []
    server.use(
      http.post(logoutAllUrl(DEMO.apiRoot), ({ request }) => {
        bearers.push(request.headers.get("Authorization") ?? "")
        return resolver()
      }),
    )
    return bearers
  }

  it.each([
    ["an unreadable tenant claim", "opaque", () => HttpResponse.json({ id: 42, personId: 4242 })],
    ["a myself failure", undefined, () => new HttpResponse(null, { status: 500 })],
    ["a myself id mismatch", undefined, () => HttpResponse.json({ id: 99, personId: 1 })],
  ])("revokes once on %s and answers as before", async (_label, accessToken, myself) => {
    const token = accessToken ?? fakeAccessToken(1)
    server.use(
      http.post(exchangeUrl(DEMO.apiRoot), () => HttpResponse.json(tokenResponse({ accessToken: token }))),
      http.get(myselfUrl(DEMO.apiRoot), myself),
    )
    const bearers = trackRevocations()
    expect(await launch(demoLpl(), credentials(), NOW)).toEqual({
      kind: "failed",
      errorCode: "LAUNCH_INVALID",
      status: 502,
      retryable: true,
      environment: "demo",
    })
    expect(bearers).toEqual([`Bearer ${token}`])
  })

  it("does not revoke (or call anything else) on WRONG_TENANT", async () => {
    let calls = 0
    server.use(
      http.post(exchangeUrl(DEMO.apiRoot), () => HttpResponse.json(tokenResponse({ tenantId: 7 }))),
      http.all("*", () => {
        calls += 1
        return HttpResponse.error()
      }),
    )
    expect(await launch(demoLpl(), credentials(), NOW)).toMatchObject({ errorCode: "WRONG_TENANT" })
    expect(calls).toBe(0)
  })

  it("does not revoke on an exchange failure (no tokens were issued)", async () => {
    server.use(http.post(exchangeUrl(DEMO.apiRoot), () => HttpResponse.json({ message: "External application security code: 'c' has already been redeemed." }, { status: 400 })))
    const bearers = trackRevocations()
    expect(await launch(demoLpl(), credentials(), NOW)).toMatchObject({ errorCode: "LAUNCH_USED" })
    expect(bearers).toEqual([])
  })

  it("a failing revocation changes nothing in the answer and never logs the token", async () => {
    const token = fakeAccessToken(1)
    server.use(
      http.post(exchangeUrl(DEMO.apiRoot), () => HttpResponse.json(tokenResponse({ accessToken: token }))),
      http.get(myselfUrl(DEMO.apiRoot), () => new HttpResponse(null, { status: 500 })),
    )
    const bearers = trackRevocations(() => new HttpResponse(null, { status: 401 }))
    const lines: string[] = []
    const push = (l: string) => void lines.push(l)
    const restore = setLogSink({ info: push, warn: push, error: push })
    const result = await launch(demoLpl(), credentials(), NOW, "req-1")
    restore()
    expect(result).toMatchObject({ errorCode: "LAUNCH_INVALID", status: 502, retryable: true })
    expect(bearers).toHaveLength(1)
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0])).toMatchObject({ requestId: "req-1", routeTemplate: "/api/token", status: 401 })
    expect(lines[0]).not.toContain(token)
  })
})

describe("exchangeCode", () => {
  const exchange = () => exchangeCode(DEMO.apiRoot, "c", DEMO_KEY)

  it.each([
    ["5xx", () => new HttpResponse(null, { status: 502 }), "unavailable"],
    ["3xx", () => new HttpResponse(null, { status: 302, headers: { Location: "https://elsewhere.test" } }), "rejected"],
    ["network error", () => HttpResponse.error(), "unavailable"],
    ["non-JSON 200", () => new HttpResponse("nope", { status: 200 }), "unavailable"],
    ["incomplete 200", () => HttpResponse.json({ refresh_token: "r" }), "unavailable"],
    ["empty 4xx", () => new HttpResponse(null, { status: 410 }), "rejected"],
  ])("maps %s to %s", async (_label, resolver, reason) => {
    server.use(http.post(exchangeUrl(DEMO.apiRoot), resolver))
    expect(await exchange()).toEqual({ kind: "failed", reason })
  })

  it("maps an unreadable 4xx body to rejected", async () => {
    const broken = new ReadableStream({ start: (controller) => controller.error(new Error("reset")) })
    vi.stubGlobal("fetch", async () => new Response(broken, { status: 400 }))
    expect(await exchange()).toEqual({ kind: "failed", reason: "rejected" })
  })

  /** The backend's exact texts (`Messages.java`), as `ErrorMessageDTO` `{ message, code }` bodies. */
  const body = (message: string) => JSON.stringify({ message, code: 400 })

  it.each([
    [body("External application security code: 'abc123' has already been redeemed."), "used"],
    [body("External application security code: 'abc123' has expired."), "expired"],
    [body("Could not find external application security code: 'abc123'"), "rejected"],
    [body("Invalid signature provided."), "rejected"],
    [body("External application security code with ID: 7 could not be redeemed."), "rejected"],
    // The code value never decides: a code spelling "has expired." stays what its message says.
    [body("Could not find external application security code: 'x has expired.'"), "rejected"],
    [body("External application security code: 'has already been redeemed.' has expired."), "expired"],
    // A plain-text body is read as the message; anything else is rejected.
    ["External application security code: 'abc123' has already been redeemed.", "used"],
    [JSON.stringify({ message: 7 }), "rejected"],
    [JSON.stringify(null), "rejected"],
    ["Code already USED", "rejected"],
    ["", "rejected"],
  ])("classifies %s as %s", (text, reason) => {
    expect(classifyExchangeError(text)).toBe(reason)
  })

  it.each([
    ["has already been redeemed", "used"],
    ["has expired", "expired"],
  ])("a real 400 '%s' body → %s", async (suffix, reason) => {
    server.use(http.post(exchangeUrl(DEMO.apiRoot), () => HttpResponse.json({ message: `External application security code: 'c' ${suffix}.`, code: 400 }, { status: 400 })))
    expect(await exchange()).toEqual({ kind: "failed", reason })
  })
})

describe("readTenantId", () => {
  it("reads the plaintext tenantId claim (number or numeric string)", () => {
    expect(readTenantId(fakeAccessToken(1))).toBe(1)
    expect(readTenantId(fakeAccessToken("12"))).toBe(12)
    expect(readTenantId(fakeAccessToken("abc"))).toBeNull()
    expect(readTenantId("no-dots")).toBeNull()
    expect(readTenantId("a.%%%.c")).toBeNull()
  })
})

describe("fetchMyselfIds", () => {
  it("returns ids or null", async () => {
    const url = myselfUrl(DEMO.apiRoot)
    server.use(http.get(url, () => HttpResponse.json({ id: 1, personId: 2 })))
    expect(await fetchMyselfIds(DEMO.apiRoot, "t")).toEqual({ userId: 1, personId: 2 })
    server.use(http.get(url, () => HttpResponse.json({ id: 1 })))
    expect(await fetchMyselfIds(DEMO.apiRoot, "t")).toBeNull()
    server.use(http.get(url, () => new HttpResponse("x", { status: 200 })))
    expect(await fetchMyselfIds(DEMO.apiRoot, "t")).toBeNull()
    server.use(http.get(url, () => HttpResponse.error()))
    expect(await fetchMyselfIds(DEMO.apiRoot, "t")).toBeNull()
  })
})
