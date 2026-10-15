import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { E2E_MOCK_CREDENTIALS, resetServerEnvCache, ServerEnvError } from "@/lib/server/env"
import { E2E_MOCK_ENV, stubServerEnv } from "@/test/env-fixture"
import { uninstallUpstreamMock } from "@/test/e2e-upstream-mock"
import { register } from "./instrumentation"

/** The fetch in place before each test (MSW's interceptor, installed in beforeAll). */
let realFetch: typeof fetch
beforeEach(() => {
  realFetch = globalThis.fetch
})

afterEach(() => {
  uninstallUpstreamMock()
  resetServerEnvCache()
})

describe("instrumentation register()", () => {
  it("validates the server env at boot and leaves fetch alone without PP_E2E_MOCK", async () => {
    stubServerEnv()
    await expect(register()).resolves.toBeUndefined()
    expect(globalThis.fetch).toBe(realFetch)
  })

  it.each(["0", "true", ""])("PP_E2E_MOCK=%j is not the flag: fetch stays unpatched", async (value) => {
    stubServerEnv({ PP_E2E_MOCK: value })
    await register()
    expect(globalThis.fetch).toBe(realFetch)
  })

  it("installs the e2e upstream mock only with PP_E2E_MOCK=1", async () => {
    stubServerEnv(E2E_MOCK_ENV)
    await register()
    expect(globalThis.fetch).not.toBe(realFetch)
  })

  it("fails the boot (never patching fetch) when PP_E2E_MOCK=1 meets a real-looking credential", async () => {
    // The name comes from env.ts, so this file never spells a `_DEMO`/`_PROD` name (check-forbidden).
    const name = E2E_MOCK_CREDENTIALS[3]
    stubServerEnv({ ...E2E_MOCK_ENV, [name]: "real-app-prod" })
    await expect(register()).rejects.toThrow(`${name} must be an e2e dummy value`)
    expect(globalThis.fetch).toBe(realFetch)
  })

  it("fails the boot when a required variable is missing", async () => {
    stubServerEnv()
    vi.stubEnv("SESSION_SECRET", "")
    resetServerEnvCache()
    await expect(register()).rejects.toThrow(ServerEnvError)
  })
})
