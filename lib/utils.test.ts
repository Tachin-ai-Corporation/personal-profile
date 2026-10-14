// @vitest-environment node
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { cn, TYPE_SCALE } from "./utils"

/**
 * `cn()` knows the 1health type scale, so a font-size utility and a text color
 * both survive, while two sizes still merge.
 */
describe("cn", () => {
  it("keeps a type-scale size next to a text color", () => {
    expect(cn("text-body", "text-muted-foreground")).toBe("text-body text-muted-foreground")
  })

  it("merges two type-scale sizes, keeping the last", () => {
    expect(cn("text-body", "text-caption")).toBe("text-caption")
  })

  it("lists every --text-* size token from app/globals.css", () => {
    const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8")
    const tokens = Array.from(css.matchAll(/--text-([a-z0-9]+(?:-[a-z0-9]+)*):/g), (m) => m[1])
    expect(tokens.length).toBeGreaterThan(0)
    expect([...new Set(tokens)].sort()).toEqual([...TYPE_SCALE].sort())
  })
})
