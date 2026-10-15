import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const CSS = readFileSync(new URL("./globals.css", import.meta.url), "utf8")

/** The declarations of the first top-level block opened by `selector {`. */
function block(selector: string): Map<string, string> {
  const start = CSS.indexOf(`\n${selector} {`)
  expect(start).toBeGreaterThanOrEqual(0)
  const body = CSS.slice(CSS.indexOf("{", start) + 1, CSS.indexOf("\n}", start))
  const declarations = new Map<string, string>()
  for (const match of body.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    declarations.set(match[1], match[2].trim())
  }
  return declarations
}

const light = block(":root")
const dark = block(".dark")
const theme = block("@theme inline")

/** Resolves `var(--x)` against the light palette, then the given theme block. */
function resolve(value: string, scope: Map<string, string>): string {
  const ref = /^var\((--[\w-]+)\)$/.exec(value)
  if (!ref) return value.toLowerCase()
  return resolve(scope.get(ref[1]) ?? light.get(ref[1]) ?? "", scope)
}

describe("D13 + Ledger tokens (DESIGN.md colors)", () => {
  it.each([
    ["--link-text", "#256a8c", "#8fd8e6"],
    ["--destructive-fill", "#b23a31", "#b23a31"],
    ["--primary-text", "#246b8f", "#6fb6d8"],
    ["--scrim", "rgba(32, 40, 51, 0.45)", "rgba(0, 0, 0, 0.6)"],
    ["--control-border", "#7a8696", "#aeb8c4"],
    ["--tooltip", "#202833", "#e6ebf0"],
    ["--tooltip-foreground", "#ffffff", "#202833"],
    ["--qr-surface", "#ffffff", "#ffffff"],
  ])("%s is %s in light and %s in dark, with a utility", (token, lightValue, darkValue) => {
    expect(resolve(light.get(token) ?? "", light)).toBe(lightValue)
    expect(resolve(dark.get(token) ?? "", dark)).toBe(darkValue)
    expect(theme.get(`--color-${token.slice(2)}`)).toBe(`var(${token})`)
  })

  it("keeps --border for table rules and hairlines", () => {
    expect(light.get("--border")).toBe("#e1e8ef")
    expect(dark.get("--border")).toBe("#3a4552")
  })

  it("lists the deviations and additions to report upstream", () => {
    const report = CSS.slice(CSS.indexOf("REPORT UPSTREAM"))
    for (const token of ["link-text", "destructive-fill", "control-border", "primary-text", "scrim", "tooltip", "qr-surface"]) {
      expect(report).toContain(token)
    }
  })
})

describe("Ledger typography and width utilities (F6-2)", () => {
  /** The body of `@utility <name> { … }`, comments removed. */
  function utility(name: string): string {
    const start = CSS.indexOf(`@utility ${name} {`)
    expect(start, name).toBeGreaterThanOrEqual(0)
    return CSS.slice(CSS.indexOf("{", start) + 1, CSS.indexOf("\n}", start)).replace(/\/\*[\s\S]*?\*\//g, "").trim()
  }

  it.each([
    ["mono-value", "@apply font-mono text-body-sm font-medium;"],
    ["cell-strong", "@apply text-body-sm font-medium;"],
    ["section-title", "@apply text-body font-semibold;"],
    ["kv-value-empty", "@apply text-body-sm font-normal text-muted-foreground;"],
    ["control-max-wide", "max-width: 720px;"],
  ])("%s is defined as DESIGN.md says", (name, body) => {
    expect(utility(name)).toBe(body)
  })
})
