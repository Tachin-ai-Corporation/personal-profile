import { readdirSync } from "node:fs"
import { describe, expect, it } from "vitest"
import type { AllowlistEntry } from "../types"
import { ALLOWLIST } from "."

/** Every area file in this folder (each story's entries live in its own area file and test). */
const AREA_FILES = readdirSync(new URL(".", import.meta.url)).filter(
  (name) => name.endsWith(".ts") && !name.endsWith(".test.ts") && name !== "index.ts",
)

describe("shipped allowlist", () => {
  it("aggregates every area file's entries exactly once", async () => {
    const areas = await Promise.all(
      AREA_FILES.map((name) => import(`./${name.replace(/\.ts$/, "")}`) as Promise<{ entries: readonly AllowlistEntry[] }>),
    )
    const all = areas.flatMap((area) => area.entries)
    expect(ALLOWLIST).toHaveLength(all.length)
    for (const entry of all) expect(ALLOWLIST).toContain(entry)
  })

  it("has no required query param that is also server-fixed (it could never be satisfied: client values for fixed names are ignored)", () => {
    for (const entry of ALLOWLIST) {
      const fixed = new Set([...Object.keys(entry.fixedQuery ?? {}), ...(entry.asImage ? ["preview"] : [])])
      const required = Object.entries(entry.query ?? {}).filter(([, rule]) => rule.required).map(([name]) => name)
      expect(required.filter((name) => fixed.has(name)), `${entry.method} ${entry.template}`).toEqual([])
    }
  })

  it("has no duplicate METHOD + template", () => {
    const keys = ALLOWLIST.map((entry) => `${entry.method} ${entry.template}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
