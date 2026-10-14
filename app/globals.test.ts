// @vitest-environment node
//
// Story 1.8a: every Tier 3 token in app/globals.css resolves to its DESIGN.md
// value in both themes. The map below is copied by hand from DESIGN.md's
// `colors:` frontmatter (`-dark` keys are the `.dark` values; a token with no
// `-dark` key keeps its light value). The scrim is not in that frontmatter: its
// light value comes from DESIGN.md `components.drawer-scrim` (graphite at 45 %)
// and its dark value from the Story 1.8a spec's loop-1 decision (black at 60 %).
// `.dark` sits on <html>, the same element as `:root`, so dark resolution is
// the light declarations overlaid with `.dark`.
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "globals.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
)

function block(selector: string): string {
  const start = css.search(new RegExp(`(^|\\n)${selector.replace(".", "\\.")}\\s*\\{`))
  if (start < 0) throw new Error(`no ${selector} block`)
  const open = css.indexOf("{", start)
  const close = css.indexOf("}", open)
  return css.slice(open + 1, close)
}

function decls(body: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  return out
}

const light = decls(block(":root"))
const dark = { ...light, ...decls(block(".dark")) }
const themeInline = block("@theme inline")

function resolve(name: string, env: Record<string, string>, depth = 0): string {
  if (depth > 20) throw new Error(`var() cycle at --${name}`)
  const raw = env[name]
  if (raw === undefined) throw new Error(`--${name} is not declared`)
  return raw
    .replace(/var\(--([a-z0-9-]+)\)/g, (_m, ref: string) => resolve(ref, env, depth + 1))
    .toLowerCase()
}

// DESIGN.md colors (Tier 3), light → dark.
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

describe("globals.css Tier 3 tokens match DESIGN.md", () => {
  it.each(Object.entries(DESIGN))("--%s resolves to its light and dark value", (name, [l, d]) => {
    expect(resolve(name, light)).toBe(l)
    expect(resolve(name, dark)).toBe(d)
  })

  it("--neutral utility maps to status-neutral #7a8696", () => {
    expect(themeInline).toMatch(/--color-neutral:\s*var\(--status-neutral\)/)
    expect(resolve("status-neutral", light)).toBe("#7a8696")
  })

  it("--scrim is graphite at 45 % in light and black at 60 % in dark", () => {
    expect(resolve("scrim", light)).toBe("color-mix(in srgb, #202833 45%, transparent)")
    expect(resolve("scrim", dark)).toBe("color-mix(in srgb, #000000 60%, transparent)")
  })

  it("the dark destructive fill does not follow --error-strong", () => {
    expect(resolve("destructive-fill", dark)).not.toBe(resolve("error-strong", dark))
  })

  it.each(["link-text", "destructive-fill", "control-border", "tooltip", "tooltip-foreground", "scrim"])(
    "--%s is declared in both themes and exposed as --color-%s",
    (name) => {
      expect(decls(block(":root"))[name]).toBeDefined()
      expect(decls(block(".dark"))[name]).toBeDefined()
      expect(themeInline).toMatch(new RegExp(`--color-${name}:\\s*var\\(--${name}\\);`))
    },
  )
})
