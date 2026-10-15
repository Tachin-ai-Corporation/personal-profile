import { readdirSync, readFileSync } from "node:fs"
import { beforeEach, describe, expect, it, vi } from "vitest"

const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND")
})
const requirePageSession = vi.fn(async () => ({ portalUrl: "https://portal.test", idle: { idleTimeoutMs: 1, absoluteDeadline: 1 } }))
let fixturesOn = false

vi.mock("next/navigation", () => ({ notFound }))
vi.mock("@/lib/server/page-session", () => ({ requirePageSession }))
vi.mock("@/lib/server/env", () => ({ serverEnv: () => ({ PP_E2E_FIXTURES: fixturesOn }) }))

/**
 * Every fixture page under `app/test-fixtures/*` (spec F6-3: discovered, not
 * listed, so a new fixture page is gated without editing this file). Each
 * page's client tree is imported but never rendered: only its server gate is
 * under test.
 */
const FIXTURES_DIR = new URL("./test-fixtures/", import.meta.url)
const PAGES = readdirSync(FIXTURES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => readdirSync(new URL(`${name}/`, FIXTURES_DIR)).includes("page.tsx"))
  .toSorted()

const source = (name: string): string => readFileSync(new URL(`${name}/page.tsx`, FIXTURES_DIR), "utf8")
const load = async (name: string): Promise<() => Promise<unknown>> =>
  ((await import(`./test-fixtures/${name}/page.tsx`)) as { default: () => Promise<unknown> }).default

beforeEach(() => {
  notFound.mockClear()
  requirePageSession.mockClear()
})

describe("fixture pages are discovered", () => {
  it("finds the known fixture pages (and any added later)", () => {
    expect(PAGES).toEqual(expect.arrayContaining(["combobox", "inputs", "leave-guard", "primitives", "section"]))
  })
})

describe.each(PAGES)("/test-fixtures/%s gate", (name) => {
  it("is force-dynamic and checks PP_E2E_FIXTURES", () => {
    expect(source(name)).toContain('export const dynamic = "force-dynamic"')
    expect(source(name)).toContain("serverEnv().PP_E2E_FIXTURES")
  })

  it("is a 404 unless PP_E2E_FIXTURES=1, before any session check", async () => {
    fixturesOn = false
    const page = await load(name)
    await expect(page()).rejects.toThrow("NEXT_NOT_FOUND")
    expect(notFound).toHaveBeenCalledTimes(1)
    expect(requirePageSession).not.toHaveBeenCalled()
  })

  it("renders when the flag is on (with a session when the page needs one)", async () => {
    fixturesOn = true
    const page = await load(name)
    await expect(page()).resolves.toBeTruthy()
    expect(notFound).not.toHaveBeenCalled()
    expect(requirePageSession).toHaveBeenCalledTimes(source(name).includes("requirePageSession()") ? 1 : 0)
  })
})
