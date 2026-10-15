import { beforeEach, describe, expect, it, vi } from "vitest"
import { requirePageSession } from "@/lib/server/page-session"
import { SESSION_COOKIE, sealSession } from "@/lib/server/session/session"
import { environmentConfig } from "@/lib/shared/environments"
import { stubServerEnv } from "./env-fixture"
import { makeSession, NOW } from "./session-fixture"

/**
 * Ported from origin/main (spec R5-2): `requirePageSession` embeds the
 * session environment's portal URL, prod as well as demo (D4). Lives under
 * test/ because `lib/server/**` is frozen by spec R5-1 this round; move it
 * next to `lib/server/session/session.test.ts` once both land.
 */
const cookieJar = new Map<string, string>()
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined) }),
}))
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))

beforeEach(() => {
  cookieJar.clear()
  stubServerEnv()
})

describe("requirePageSession portal URL (D4)", () => {
  it.each([
    ["prod", "https://1health.app.1health.io"],
    ["demo", "https://1health.demo.1health.io"],
  ] as const)("a %s session embeds %s", async (environment, portalUrl) => {
    cookieJar.set(SESSION_COOKIE, await sealSession(makeSession({ environment, iat: NOW, lastSeen: NOW })))
    const { portalUrl: embedded } = await requirePageSession(NOW)
    expect(embedded).toBe(portalUrl)
    expect(embedded).toBe(environmentConfig(environment).portalUrl)
  })
})
