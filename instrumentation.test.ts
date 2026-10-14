import { afterEach, describe, expect, it, vi } from "vitest"
import { resetServerEnvCache, ServerEnvError } from "@/lib/server/env"
import { stubServerEnv } from "@/test/env-fixture"
import { register } from "./instrumentation"

afterEach(() => resetServerEnvCache())

describe("instrumentation register()", () => {
  it("validates the server env at boot", async () => {
    stubServerEnv()
    await expect(register()).resolves.toBeUndefined()
  })

  it("fails the boot when a required variable is missing", async () => {
    stubServerEnv()
    vi.stubEnv("SESSION_SECRET", "")
    resetServerEnvCache()
    await expect(register()).rejects.toThrow(ServerEnvError)
  })
})
