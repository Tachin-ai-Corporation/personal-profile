import { readdirSync, readFileSync } from "node:fs"
import { join, sep } from "node:path"
import { fileURLToPath } from "node:url"
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
 * Every fixture page under `app/test-fixtures/` at any depth (spec F6-3:
 * discovered, not listed, so a new fixture page is gated without editing this
 * file). Each page's client tree is imported but never rendered: only its
 * server gate is under test.
 */
const FIXTURES_DIR = fileURLToPath(new URL("./test-fixtures/", import.meta.url))
const PAGE_FILE = /(^|\/)page\.(ts|tsx|js|jsx)$/
/** Every page file found, as a path relative to `app/test-fixtures/` (e.g. `combobox/page.tsx`). */
const FOUND = readdirSync(FIXTURES_DIR, { recursive: true, encoding: "utf8" })
  .map((path) => path.split(sep).join("/"))
  .filter((path) => PAGE_FILE.test(path))
  .toSorted()
/** The checked set: route → page file. */
const PAGES = new Map(FOUND.map((file) => [file.replace(PAGE_FILE, "") || ".", file]))
const ROUTES = [...PAGES.keys()]

const fileOf = (route: string): string => PAGES.get(route) ?? ""
const source = (route: string): string => readFileSync(join(FIXTURES_DIR, fileOf(route)), "utf8")
/** Vite's static glob: every candidate page module, so a dynamic path needs no extension guessing. */
const MODULES = import.meta.glob<{ default: () => Promise<unknown> }>("./test-fixtures/**/page.{ts,tsx,js,jsx}")
const load = async (route: string): Promise<() => Promise<unknown>> => {
  const importer = MODULES[`./test-fixtures/${fileOf(route)}`]
  if (!importer) throw new Error(`fixture page ${fileOf(route)} is not importable`)
  return (await importer()).default
}

beforeEach(() => {
  notFound.mockClear()
  requirePageSession.mockClear()
})

describe("fixture pages are discovered", () => {
  it("finds the known fixture pages (and any added later)", () => {
    expect(ROUTES).toEqual(expect.arrayContaining(["combobox", "inputs", "leave-guard", "primitives", "section"]))
  })

  it("checks every page file found, at any depth and with any page extension", () => {
    expect([...PAGES.values()].toSorted()).toEqual(FOUND)
    expect(Object.keys(MODULES).map((path) => path.replace("./test-fixtures/", "")).toSorted()).toEqual(FOUND)
  })
})

describe.each(ROUTES)("/test-fixtures/%s gate", (name) => {
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
