// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * `/auth` server wrapper (Story 1.2): force-dynamic, reads only the remembered
 * environment cookie, and renders the disabled screen directly under the kill
 * switch (no redirect).
 */

async function loadPage(config: { PP_DISABLED?: boolean; remembered?: "demo" | "prod" | null } = {}) {
  vi.resetModules()
  const readEnvironmentCookie = vi.fn().mockResolvedValue(config.remembered ?? null)
  vi.doMock("@/lib/server/env", () => ({ PP_DISABLED: config.PP_DISABLED ?? false }))
  vi.doMock("@/lib/server/environment-cookie", () => ({ readEnvironmentCookie }))
  const mod = await import("./page")
  return { mod, readEnvironmentCookie }
}

afterEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

describe("/auth page", () => {
  it("is force-dynamic", async () => {
    const { mod } = await loadPage()
    expect(mod.dynamic).toBe("force-dynamic")
  })

  it("passes the remembered environment to the client screen", async () => {
    const { AuthScreen } = await import("@/features/shell/auth-screen")
    const { mod, readEnvironmentCookie } = await loadPage({ remembered: "demo" })
    const element = (await mod.default()) as { type: unknown; props: Record<string, unknown> }
    expect((element.type as { name?: string }).name).toBe(AuthScreen.name)
    expect(element.props).toEqual({ rememberedEnvironment: "demo" })
    expect(readEnvironmentCookie).toHaveBeenCalledOnce()
  })

  it("PP_DISABLED renders the disabled screen with the referrer allowed to win", async () => {
    const { DisabledScreen } = await import("@/features/shell/disabled-screen")
    const { mod } = await loadPage({ PP_DISABLED: true, remembered: "prod" })
    const element = (await mod.default()) as { type: unknown; props: Record<string, unknown> }
    expect((element.type as { name?: string }).name).toBe(DisabledScreen.name)
    expect(element.props).toEqual({ environment: "prod", useReferrer: true })
  })
})
