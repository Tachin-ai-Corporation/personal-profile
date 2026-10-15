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

/**
 * Ported from origin/main (Story 1.8a, spec R5-2): every Tier 3 token
 * resolves to its DESIGN.md value in both themes. Copied by hand from
 * DESIGN.md's `colors:` frontmatter (`-dark` keys are the `.dark` values; a
 * token with no `-dark` key keeps its light value). The scrim is checked above.
 */
const DESIGN: Record<string, [light: string, dark: string]> = {
  background: ["#f4f7fa", "#202833"],
  foreground: ["#202833", "#e6ebf0"],
  card: ["#ffffff", "#29333f"],
  "card-foreground": ["#202833", "#e6ebf0"],
  popover: ["#ffffff", "#29333f"],
  "popover-foreground": ["#202833", "#e6ebf0"],
  primary: ["#246b8f", "#246b8f"],
  "primary-foreground": ["#ffffff", "#ffffff"],
  secondary: ["#eaeff4", "#313b47"],
  "secondary-foreground": ["#313b47", "#e6ebf0"],
  muted: ["#edf1f5", "#313b47"],
  "muted-foreground": ["#566373", "#aeb8c4"],
  accent: ["#e8f7fa", "#2a3c46"],
  "accent-foreground": ["#202833", "#e8f7fa"],
  destructive: ["#d84f45", "#d84f45"],
  "destructive-foreground": ["#ffffff", "#ffffff"],
  border: ["#e1e8ef", "#3a4552"],
  input: ["#e1e8ef", "#3a4552"],
  ring: ["#246b8f", "#8fd8e6"],
  link: ["#2f80a8", "#8fd8e6"],
  success: ["#3baa78", "#3baa78"],
  "success-strong": ["#1b7a4f", "#5fcb98"],
  info: ["#2f80a8", "#2f80a8"],
  "info-strong": ["#256a8c", "#6fb6d8"],
  warning: ["#d6a83a", "#d6a83a"],
  "warning-strong": ["#8a6511", "#e6c264"],
  error: ["#d84f45", "#d84f45"],
  "error-strong": ["#b23a31", "#f08a80"],
  "link-text": ["#256a8c", "#8fd8e6"],
  "destructive-fill": ["#b23a31", "#b23a31"],
  "control-border": ["#7a8696", "#aeb8c4"],
  tooltip: ["#202833", "#e6ebf0"],
  "tooltip-foreground": ["#ffffff", "#202833"],
}

describe("globals.css Tier 3 tokens match DESIGN.md (33-token map, spec R5-2)", () => {
  it("covers 33 tokens", () => {
    expect(Object.keys(DESIGN)).toHaveLength(33)
  })

  it.each(Object.entries(DESIGN))("--%s resolves to its light and dark value", (name, [lightValue, darkValue]) => {
    expect(resolve(light.get(`--${name}`) ?? "", light)).toBe(lightValue)
    expect(resolve(dark.get(`--${name}`) ?? light.get(`--${name}`) ?? "", dark)).toBe(darkValue)
  })

  it("the --color-neutral utility maps to status-neutral #7a8696", () => {
    expect(theme.get("--color-neutral")).toBe("var(--status-neutral)")
    expect(resolve(light.get("--status-neutral") ?? "", light)).toBe("#7a8696")
  })

  it("the dark destructive fill does not follow --error-strong", () => {
    expect(resolve(dark.get("--destructive-fill") ?? "", dark)).not.toBe(resolve(dark.get("--error-strong") ?? "", dark))
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
