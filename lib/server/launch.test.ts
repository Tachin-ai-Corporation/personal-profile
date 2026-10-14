// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import { createCipheriv, randomBytes } from "node:crypto"

// `launch.ts` imports `API_ORIGIN` from env (validated at load); the tests always
// pass an explicit origin, so a lightweight stub is enough.
vi.mock("./env", () => ({ API_ORIGIN: "https://api.example" }))

import {
  ExchangeError,
  LaunchError,
  buildSignature,
  decryptLaunchPayload,
  deriveAesKey,
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
  it("returns the apiKeyName so the route can compare it to APP_ID", () => {
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

  it("maps a network error to ExchangeError(invalid)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")))
    await expect(exchangeCode(payload, SECRET, "https://api.example")).rejects.toBeInstanceOf(ExchangeError)
    await expect(exchangeCode(payload, SECRET, "https://api.example")).rejects.toMatchObject({ reason: "invalid" })
  })

  it("maps a 500 to ExchangeError(invalid)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("oops", { status: 500 })))
    await expect(exchangeCode(payload, SECRET, "https://api.example")).rejects.toMatchObject({ reason: "invalid" })
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
