// @vitest-environment node
//
// Story 1.8a: the design-system color gate in scripts/check-forbidden.sh.
// The script runs from a temp copy of the repo layout (scripts/ + fixture
// app/, components/, features/), so each case sees only its own fixtures. The
// greps swallow their own errors, so this test (run in CI on GNU grep) is what
// proves the patterns still match.
import { spawnSync } from "node:child_process"
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "check-forbidden.sh")

const roots: string[] = []

afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true })
})

function runGate(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "pp-gate-"))
  roots.push(root)
  mkdirSync(join(root, "scripts"))
  copyFileSync(SCRIPT, join(root, "scripts", "check-forbidden.sh"))
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), body)
  }
  const res = spawnSync("bash", [join(root, "scripts", "check-forbidden.sh")], { encoding: "utf8" })
  return { code: res.status, out: `${res.stdout}${res.stderr}` }
}

const tsx = (cls: string) => `export const X = () => <div className="${cls}" />\n`

describe("check-forbidden color gate: hex", () => {
  it.each([
    ["arbitrary hex class", tsx("bg-[#fff]")],
    ["hex string literal", `export const c = "#256a8c"\n`],
    ["8-digit hex", `const c = '#256a8cff'\n`],
    ["uppercase hex", `const c = "#ABC"\n`],
  ])("fails on %s in features/ and prints file:line", (_name, body) => {
    const { code, out } = runGate({ "features/x.tsx": `// line 1\n${body}` })
    expect(code).toBe(1)
    expect(out).toContain("FORBIDDEN [hex color]")
    expect(out).toMatch(/features\/x\.tsx:2:/)
  })

  it("fails on hex in any file type (CSS module, JSON) under app/ and components/", () => {
    const { code, out } = runGate({
      "app/page.module.css": ".a { color: #fff; }\n",
      "components/theme.json": `{ "c": "#000000" }\n`,
    })
    expect(code).toBe(1)
    expect(out).toMatch(/app\/page\.module\.css:1:/)
    expect(out).toMatch(/components\/theme\.json:1:/)
  })

  it("fails on a globals.css that is not exactly app/globals.css", () => {
    const { code, out } = runGate({ "app/nested/globals.css": ":root { --x: #fff; }\n" })
    expect(code).toBe(1)
    expect(out).toMatch(/app\/nested\/globals\.css:1:/)
  })
})

describe("check-forbidden color gate: Tailwind palette classes", () => {
  it.each([
    "bg-red-500",
    "dark:text-white",
    "bg-black/50",
    "border-t-slate-200/40",
    "hover:bg-blue-600",
    "group-[.destructive]:text-red-300",
  ])("fails on %s in components/", (cls) => {
    const { code, out } = runGate({ "components/x.tsx": tsx(cls) })
    expect(code).toBe(1)
    expect(out).toContain("FORBIDDEN [Tailwind palette]")
    expect(out).toMatch(/components\/x\.tsx:1:/)
  })

  // Every color-utility prefix in the spec's list, and every border side.
  it.each([
    "bg-red-500",
    "text-sky-700",
    "border-gray-200",
    "border-x-zinc-300",
    "border-y-stone-300",
    "border-t-slate-200",
    "border-r-red-200",
    "border-b-lime-200",
    "border-l-green-200",
    "border-s-teal-200",
    "border-e-cyan-200",
    "ring-indigo-500",
    "ring-offset-red-600",
    "outline-violet-400",
    "fill-purple-500",
    "stroke-fuchsia-500",
    "from-pink-500",
    "via-rose-500",
    "to-emerald-500",
    "divide-amber-200",
    "placeholder-orange-400",
    "decoration-yellow-400",
    "accent-blue-500",
    "caret-white",
    "shadow-black/20",
    "drop-shadow-red-500",
    "inset-ring-black",
    "placeholder:text-gray-400",
    "bg-neutral-100",
  ])("fails on %s", (cls) => {
    const { code } = runGate({ "features/x.tsx": tsx(cls) })
    expect(code).toBe(1)
  })

  // The Tailwind 4.3 palettes the first pass missed.
  it.each(["bg-mauve-500", "text-olive-700", "border-mist-300", "ring-taupe-400"])(
    "fails on the added palette %s",
    (cls) => {
      const { code } = runGate({ "components/x.tsx": tsx(cls) })
      expect(code).toBe(1)
    },
  )
})

describe("check-forbidden color gate: allowed", () => {
  it("passes on transparent/current/inherit, tokens, section anchors, globals.css and test files", () => {
    const { code, out } = runGate({
      "features/ok.tsx": [
        tsx("bg-transparent text-current fill-current stroke-current border-inherit text-inherit"),
        tsx("bg-destructive-fill text-destructive-foreground text-link-text border-control-border bg-scrim"),
        tsx("text-neutral bg-neutral/10 bg-card text-muted-foreground ring-ring ring-offset-background"),
        `export const a = <a href="#personal">Personal</a>\n`,
        `export const b = "#addresses"\n`,
        `export const c = "#signature"\n`,
      ].join(""),
      "app/globals.css": ":root { --card: #ffffff; --x: #000; }\n",
      "components/x.test.tsx": `${tsx("bg-red-500 text-white")}const c = "#256a8c"\n`,
      "features/y.test.ts": `const c = "#fff"\n`,
    })
    expect(out).not.toContain("FORBIDDEN")
    expect(code).toBe(0)
    expect(out).toContain("check-forbidden: clean.")
  })

  it("does not scan lib/ (outside the color scope)", () => {
    const { code } = runGate({ "lib/shared/x.ts": `export const c = "#fff"\n` })
    expect(code).toBe(0)
  })

  it("passes on the current repo tree", () => {
    const res = spawnSync("bash", [SCRIPT], { encoding: "utf8" })
    expect(res.stdout + res.stderr).not.toContain("FORBIDDEN")
    expect(res.status).toBe(0)
  })
})
