// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import { createCipheriv, randomBytes } from "node:crypto"

// `launch.ts` imports the key getters from env (validated at load); a stub
// stands in, and detection tests pass their keys explicitly.
vi.mock("./env", () => ({
  getSecretKey: () => "unused",
  getSecretKeyVarName: (env: string) => `KEY_VAR_${env}`,
}))

import {
  ExchangeError,
  LaunchError,
  buildSignature,
  decryptLaunchPayload,
  deriveAesKey,
  detectEnvironment,
  exchangeCode,
  fetchIds,
  mapUpstreamError,
  readTokenTenantId,
} from "./launch"

const SECRET = "test-secret"

/** A complete, valid launch payload object. */
function validPayloadObject(overrides: Record<string, unknown> = {}) {
  return {
    required: {
      apiKey: { name: "app-1" },
      tenant: { id: 1 },
      user: { id: 42 },
      externalApplicationId: { id: 1 },
      oneTimeCode: { value: "code-abc", issuedAt: "2026-10-13T00:00:00" },
      ...overrides,
    },
  }
}

/** Encrypt a payload object into a base64 lpl, mirroring the platform wire format. */
function encryptLpl(payloadObject: unknown, secret = SECRET): string {
  const key = deriveAesKey(secret)
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const json = typeof payloadObject === "string" ? payloadObject : JSON.stringify(payloadObject)
  const ct = Buffer.concat([cipher.update(json, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, ct, tag]).toString("base64")
}

/** A fake access-token JWT whose plaintext payload carries the given tenantId. */
function jwtWithTenant(tenantId: number | string): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256" })).toString("base64url")
  const payload = Buffer.from(JSON.stringify({ tenantId })).toString("base64url")
  return `${header}.${payload}.signature`
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("deriveAesKey", () => {
  it("is a 32-byte key, byte-identical to the platform HKDF", () => {
    const key = deriveAesKey(SECRET)
    expect(key.length).toBe(32)
    expect(key.toString("hex")).toBe(
      "3f1696ee3ef4253e294957d1cf4f9b998c8a32741cede847bb751c3020f91205",
    )
  })

  it("throws config for a blank secret", () => {
    expect(() => deriveAesKey("")).toThrow(LaunchError)
    expect(() => deriveAesKey("   ")).toThrow(/config/)
  })
})

describe("buildSignature", () => {
  it("is base64 HMAC-SHA256 of the code keyed by the raw secret", () => {
    expect(buildSignature("abc123", SECRET)).toBe("Z7aPPn0OT3ARmifwmGJkMRec74H1AV+RwtpUqN8Ev2c=")
  })
})

describe("decryptLaunchPayload — valid", () => {
  it("decrypts and extracts the required fields, tolerating space-for-plus", () => {
    const lpl = encryptLpl(validPayloadObject())
    const withSpaces = lpl.replace(/\+/g, " ")
    const payload = decryptLaunchPayload(withSpaces, SECRET)
    expect(payload).toEqual({
      apiKeyName: "app-1",
      tenantId: 1,
      userId: 42,
      code: "code-abc",
      issuedAt: "2026-10-13T00:00:00",
    })
  })
})

describe("decryptLaunchPayload — malformed → invalid", () => {
  it("rejects a too-short payload (< 28 bytes)", () => {
    const short = Buffer.alloc(20).toString("base64")
    expect(() => decryptLaunchPayload(short, SECRET)).toThrow(/invalid/)
  })

  it("rejects an empty string", () => {
    expect(() => decryptLaunchPayload("", SECRET)).toThrow(/invalid/)
  })

  it("rejects a value that is not base64", () => {
    expect(() => decryptLaunchPayload("not a payload!!*&^%$#@" + "x".repeat(40), SECRET)).toThrow(/invalid/)
  })

  it("rejects cleartext JSON (not encrypted)", () => {
    const cleartext = Buffer.from(JSON.stringify(validPayloadObject())).toString("base64")
    expect(() => decryptLaunchPayload(cleartext, SECRET)).toThrow(/invalid/)
  })

  it("rejects a GCM auth failure (tampered tag)", () => {
    const buf = Buffer.from(encryptLpl(validPayloadObject()), "base64")
    buf[buf.length - 1] ^= 0xff // flip a tag byte
    expect(() => decryptLaunchPayload(buf.toString("base64"), SECRET)).toThrow(/invalid/)
  })

  it("rejects a payload decrypted under the wrong key", () => {
    const lpl = encryptLpl(validPayloadObject(), "other-secret")
    expect(() => decryptLaunchPayload(lpl, SECRET)).toThrow(/invalid/)
  })

  it("rejects valid ciphertext whose JSON is missing a required field", () => {
    const noUser = { required: { apiKey: { name: "a" }, tenant: { id: 1 }, oneTimeCode: { value: "c", issuedAt: "x" } } }
    expect(() => decryptLaunchPayload(encryptLpl(noUser), SECRET)).toThrow(/invalid/)
  })

  it("rejects non-JSON plaintext", () => {
    expect(() => decryptLaunchPayload(encryptLpl("not json"), SECRET)).toThrow(/invalid/)
  })
})

describe("decryptLaunchPayload — wrong app id is surfaced for the route gate", () => {
  it("returns the apiKeyName so the route can compare it to the detected environment's app id", () => {
    const lpl = encryptLpl(validPayloadObject({ apiKey: { name: "someone-elses-app" } }))
    expect(decryptLaunchPayload(lpl, SECRET).apiKeyName).toBe("someone-elses-app")
  })
})

describe("mapUpstreamError — recorded platform bodies", () => {
  const used = JSON.stringify({
    message: "External application security code: 'ABC' has already been redeemed.",
    code: 400,
  })
  const expired = JSON.stringify({
    message: "External application security code: 'ABC' has expired.",
    code: 400,
  })
  const notFound = JSON.stringify({ message: "Could not find external application security code: 'ABC'", code: 400 })
  const badSig = JSON.stringify({ message: "Invalid signature provided.", code: 400 })

  it("maps already-redeemed → used", () => {
    expect(mapUpstreamError(400, used)).toBe("used")
  })
  it("maps expired → expired", () => {
    expect(mapUpstreamError(400, expired)).toBe("expired")
  })
  it("maps not-found → invalid", () => {
    expect(mapUpstreamError(400, notFound)).toBe("invalid")
  })
  it("maps invalid-signature → invalid", () => {
    expect(mapUpstreamError(400, badSig)).toBe("invalid")
  })
  it("maps a 500 / empty body → invalid", () => {
    expect(mapUpstreamError(500, "")).toBe("invalid")
  })
})

describe("detectEnvironment (D2)", () => {
  const PROD_KEY = "prod-key-value"
  const DEMO_KEY = "demo-key-value"
  const keys = (overrides: Partial<Record<"demo" | "prod", string>> = {}) => {
    const map = { prod: PROD_KEY, demo: DEMO_KEY, ...overrides }
    return (env: "demo" | "prod") => map[env]
  }
  const varName = (env: "demo" | "prod") => `KEY_VAR_${env}`

  it("a prod-key payload → prod, keyed by the stored prod key, no warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const detected = detectEnvironment(encryptLpl(validPayloadObject(), PROD_KEY), keys(), varName)
    expect(detected.environment).toBe("prod")
    expect(detected.secret).toBe(PROD_KEY)
    expect(detected.trimmed).toBe(false)
    expect(detected.payload.userId).toBe(42)
    expect(warn).not.toHaveBeenCalled()
  })

  it("a demo-key payload → demo", () => {
    const detected = detectEnvironment(encryptLpl(validPayloadObject(), DEMO_KEY), keys(), varName)
    expect(detected.environment).toBe("demo")
    expect(detected.secret).toBe(DEMO_KEY)
  })

  it("tolerates spaces for '+'", () => {
    const lpl = encryptLpl(validPayloadObject(), DEMO_KEY)
    expect(detectEnvironment(lpl.replace(/\+/g, " "), keys(), varName).environment).toBe("demo")
  })

  it.each(["demo", "prod"] as const)(
    "only the trimmed variant of a padded %s key decrypts → that environment + one warning naming the variable, no value",
    (env) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
      const padded = `  ${env === "prod" ? PROD_KEY : DEMO_KEY}\n`
      // The platform encrypted with the clean key; the deployment stored it padded.
      const lpl = encryptLpl(validPayloadObject(), padded.trim())
      const detected = detectEnvironment(lpl, keys({ [env]: padded }), varName)
      expect(detected.environment).toBe(env)
      expect(detected.trimmed).toBe(true)
      expect(detected.secret).toBe(padded.trim())
      expect(warn).toHaveBeenCalledOnce()
      const line = String(warn.mock.calls[0][0])
      expect(line).toContain(`KEY_VAR_${env}`)
      expect(line).not.toContain(padded.trim())
    },
  )

  it("a payload sealed with the padded key itself decrypts as stored, without a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const padded = ` ${PROD_KEY} `
    const detected = detectEnvironment(encryptLpl(validPayloadObject(), padded), keys({ prod: padded }), varName)
    expect(detected).toMatchObject({ environment: "prod", trimmed: false, secret: padded })
    expect(warn).not.toHaveBeenCalled()
  })

  it.each([
    ["neither key", () => encryptLpl(validPayloadObject(), "some-other-key")],
    ["missing", () => ""],
    ["not base64", () => "%%%not-base64%%%".repeat(4)],
    ["shorter than 28 bytes", () => Buffer.alloc(27).toString("base64")],
    ["cleartext JSON", () => Buffer.from(JSON.stringify(validPayloadObject())).toString("base64")],
    ["not JSON", () => encryptLpl("not json", PROD_KEY)],
    ["missing a required field", () => encryptLpl({ required: { apiKey: { name: "a" } } }, DEMO_KEY)],
  ])("%s → invalid", (_label, make) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(() => detectEnvironment(make(), keys(), varName)).toThrow(LaunchError)
    expect(() => detectEnvironment(make(), keys(), varName)).toThrow(/invalid/)
    expect(warn).not.toHaveBeenCalled()
  })

  it.each(["required.apiKey.name", "required.tenant.id", "required.user.id", "required.oneTimeCode.value", "required.oneTimeCode.issuedAt"])(
    "a payload without %s → invalid",
    (path) => {
      const obj = validPayloadObject() as { required: Record<string, Record<string, unknown>> }
      const [, group, field] = path.split(".")
      delete obj.required[group][field]
      expect(() => detectEnvironment(encryptLpl(obj, PROD_KEY), keys(), varName)).toThrow(/invalid/)
    },
  )

  it("a key that cannot become an AES key → config, before the payload is looked at", () => {
    expect(() => detectEnvironment("", keys({ demo: "   " }), varName)).toThrow(/config/)
    expect(() => detectEnvironment(encryptLpl(validPayloadObject(), PROD_KEY), keys({ demo: "   " }), varName)).toThrow(
      /config/,
    )
  })
})

describe("exchangeCode", () => {
  const payload = { apiKeyName: "app-1", tenantId: 1, userId: 42, code: "code-abc", issuedAt: "x" }

  it("posts once and returns tokens on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "a", refresh_token: "r", expires_in: 3000, token_type: "Bearer" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await exchangeCode(payload, SECRET, "https://api.example")
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://api.example/api/v2/public/external-application/auth/oauth2/user/token")
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body)).toEqual({
      signature: buildSignature("code-abc", SECRET),
      securityCode: "code-abc",
    })
    expect(result).toEqual({ accessToken: "a", refreshToken: "r", expiresIn: 3000 })
  })

  it("maps an already-redeemed body to ExchangeError(used) without retry", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "code 'X' has already been redeemed.", code: 400 }), { status: 400 }),
    )
    vi.stubGlobal("fetch", fetchMock)
    await expect(exchangeCode(payload, SECRET, "https://api.example")).rejects.toMatchObject({ reason: "used" })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it("maps an expired body to ExchangeError(expired)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "code 'X' has expired." }), { status: 400 })),
    )
    await expect(exchangeCode(payload, SECRET, "https://api.example")).rejects.toMatchObject({ reason: "expired" })
  })

  it("maps a network error to a 502 ExchangeError(invalid)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")))
    await expect(exchangeCode(payload, SECRET, "https://api.example")).rejects.toBeInstanceOf(ExchangeError)
    await expect(exchangeCode(payload, SECRET, "https://api.example")).rejects.toMatchObject({
      reason: "invalid",
      status: 502,
    })
  })

  it("maps a timeout (abort) to a 502 ExchangeError(invalid)", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" })
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abort))
    await expect(exchangeCode(payload, SECRET, "https://api.example")).rejects.toMatchObject({
      reason: "invalid",
      status: 502,
    })
  })

  it("maps a 500 to a 502 ExchangeError(invalid)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("oops", { status: 500 })))
    await expect(exchangeCode(payload, SECRET, "https://api.example")).rejects.toMatchObject({
      reason: "invalid",
      status: 502,
    })
  })

  it("maps another 4xx and a 3xx to a 400 ExchangeError(invalid)", async () => {
    for (const status of [400, 404, 302]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Invalid signature provided." }), { status })))
      await expect(exchangeCode(payload, SECRET, "https://api.example")).rejects.toMatchObject({
        reason: "invalid",
        status: 400,
      })
    }
  })

  it("maps a 2xx without tokens to a 502 ExchangeError(invalid)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ token_type: "Bearer" }), { status: 200 })))
    await expect(exchangeCode(payload, SECRET, "https://api.example")).rejects.toMatchObject({ status: 502 })
  })

  it("used / expired bodies are 400", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "code 'X' has already been redeemed." }), { status: 400 })),
    )
    await expect(exchangeCode(payload, SECRET, "https://api.example")).rejects.toMatchObject({ reason: "used", status: 400 })
  })

  it("sends cache no-store, redirect manual and an abort signal to the given apiRoot", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: "a", refresh_token: "r", expires_in: 1 }), { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)
    await exchangeCode(payload, SECRET, "https://1health.demo.1health.io")
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://1health.demo.1health.io/api/v2/public/external-application/auth/oauth2/user/token")
    expect(init).toMatchObject({ cache: "no-store", redirect: "manual" })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })
})

describe("readTokenTenantId", () => {
  it("reads a numeric tenantId claim", () => {
    expect(readTokenTenantId(jwtWithTenant(1))).toBe(1)
    expect(readTokenTenantId(jwtWithTenant(7))).toBe(7)
  })
  it("reads a numeric-string tenantId claim", () => {
    expect(readTokenTenantId(jwtWithTenant("1"))).toBe(1)
  })
  it("returns null for a malformed token", () => {
    expect(readTokenTenantId("not-a-jwt")).toBeNull()
    expect(readTokenTenantId("")).toBeNull()
  })
})

describe("fetchIds", () => {
  it("returns userId/personId from /myself", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: 42, personId: 7, username: "x" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    )
    expect(await fetchIds("token", "https://api.example")).toEqual({ userId: 42, personId: 7 })
  })

  it("returns null on a non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 401 })))
    expect(await fetchIds("token", "https://api.example")).toBeNull()
  })

  it("returns null on a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")))
    expect(await fetchIds("token", "https://api.example")).toBeNull()
  })
})
