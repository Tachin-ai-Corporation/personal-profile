import { describe, expect, it, vi } from "vitest"
import { AuthScreen } from "@/features/shell"
import { rememberedEnvironment } from "@/lib/server/page-session"
import AuthPage, { dynamic } from "./page"

/**
 * `/auth` server wrapper (Story 1.2, D9; ported from main, spec R5-1):
 * force-dynamic, reads only the remembered `onehealth_environment` cookie and
 * hands it to the client screen (display only, D2).
 */

vi.mock("@/lib/server/page-session", () => ({ rememberedEnvironment: vi.fn() }))

describe("/auth page", () => {
  it("is force-dynamic", () => {
    expect(dynamic).toBe("force-dynamic")
  })

  it.each(["demo", "prod", null] as const)("passes the remembered environment (%s) to the client screen", async (remembered) => {
    vi.mocked(rememberedEnvironment).mockResolvedValue(remembered)
    const element = await AuthPage()
    expect(element.type).toBe(AuthScreen)
    expect(element.props).toEqual({ rememberedEnvironment: remembered })
    expect(rememberedEnvironment).toHaveBeenCalledOnce()
  })
})
