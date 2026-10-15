import { spawnSync } from "node:child_process"
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "check-tokens.sh")

let root: string | undefined

/** Runs the token check over a fixture tree of `{ path: content }`. */
function check(files: Record<string, string>): { status: number | null; stderr: string; stdout: string } {
  root = mkdtempSync(join(tmpdir(), "check-tokens-"))
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  const run = spawnSync("bash", [SCRIPT, root], { encoding: "utf8" })
  return { status: run.status, stderr: run.stderr, stdout: run.stdout }
}

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true })
  root = undefined
})

describe("scripts/check-tokens.sh", () => {
  it("passes on semantic tokens only", () => {
    const run = check({
      "features/x.tsx": `export const X = () => <div className="bg-scrim text-link-text bg-destructive-fill text-neutral border-control-border" id="account" />`,
      "components/ui/badge.tsx": `const info = "bg-info/12 text-info-strong"`,
      "app/globals.css": ":root { --card: #ffffff; } .x { color: #202833; }",
      "features/x.test.tsx": `expect(el).not.toHaveClass("bg-black/50 bg-red-500 #fff")`,
    })
    expect(run.stdout).toContain("check-tokens: OK")
    expect(run.status).toBe(0)
  })

  it.each([
    ["a hex color", `const c = "#b23a31"`, "hex color"],
    ["a short hex color", `<div style={{ color: "#fff" }} />`, "hex color"],
    ["an arbitrary hex class", `<div className="bg-[#202833]" />`, "hex color"],
    ["a palette class", `<div className="bg-red-500" />`, "palette color class"],
    ["a variant-prefixed palette class", `<div className="group-[.x]:focus:ring-offset-red-600" />`, "palette color class"],
    ["bg-black/50", `<div className="fixed inset-0 bg-black/50" />`, "palette color class"],
    ["text-white", `<span className="text-white" />`, "palette color class"],
    ["text-info-strong on a link", `<a className="text-info-strong" href="/x">x</a>`, "text-info-strong on a link"],
    ["bg-error-strong", `<button className="bg-error-strong" />`, "bg-error-strong"],
  ])("fails on %s in features/, naming the file", (_name, line, message) => {
    const run = check({ "features/x.tsx": `${line}\n` })
    expect(run.status).toBe(1)
    expect(run.stderr).toContain(message)
    expect(run.stderr).toContain("features/x.tsx:1")
  })

  it("scans components/ and app/ but not app/globals.css", () => {
    const run = check({
      "components/y.tsx": `const a = "text-blue-600"`,
      "app/page.tsx": `const b = "#abcdef"`,
      "app/globals.css": ".x { color: #abcdef; }",
    })
    expect(run.status).toBe(1)
    expect(run.stderr).toContain("components/y.tsx:1")
    expect(run.stderr).toContain("app/page.tsx:1")
    expect(run.stderr).not.toContain("app/globals.css:")
  })

  it("scans lib/, hooks/ and contexts/, but not lib/server/", () => {
    const run = check({
      "lib/shared/colors.ts": `export const c = "#abcdef"`,
      "hooks/use-x.ts": `const a = "bg-red-500"`,
      "contexts/x.tsx": `const b = "bg-error-strong"`,
      "lib/server/mail.ts": `const html = "#ffffff"`,
    })
    expect(run.status).toBe(1)
    expect(run.stderr).toContain("lib/shared/colors.ts:1")
    expect(run.stderr).toContain("hooks/use-x.ts:1")
    expect(run.stderr).toContain("contexts/x.tsx:1")
    expect(run.stderr).not.toContain("lib/server/")
  })

  it("skips comment-only lines for the hex check, but not code with a trailing comment", () => {
    const run = check({
      "features/a.tsx": `// Fixes #123 and #abc\n/* see #456 */\n * #789 in a block comment\n{/* #def */}\n`,
      "features/b.tsx": `const c = "#abc" // #123\n`,
    })
    expect(run.status).toBe(1)
    expect(run.stderr).not.toContain("features/a.tsx")
    expect(run.stderr).toContain("features/b.tsx:1")
  })

  it.skipIf(process.getuid?.() === 0)("aborts with exit 2 when grep fails, instead of passing", () => {
    root = mkdtempSync(join(tmpdir(), "check-tokens-"))
    mkdirSync(join(root, "features"))
    const unreadable = join(root, "features", "x.tsx")
    writeFileSync(unreadable, `const a = "text-info-strong"`)
    chmodSync(unreadable, 0o000)
    const run = spawnSync("bash", [SCRIPT, root], { encoding: "utf8" })
    chmodSync(unreadable, 0o644)
    expect(run.status).toBe(2)
    expect(run.stderr).toContain("grep failed")
    expect(run.stdout).not.toContain("check-tokens: OK")
  })

  // Ported from origin/main's check-forbidden colour gate (spec R5-2): every
  // colour-utility prefix, every border side and the Tailwind 4.3 palettes.
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
    "inset-shadow-blue-500",
    "placeholder:text-gray-400",
    "bg-neutral-100",
    "dark:text-white",
    "border-t-slate-200/40",
    "hover:bg-blue-600",
    "group-[.destructive]:text-red-300",
    "bg-mauve-500",
    "text-olive-700",
    "border-mist-300",
    "ring-taupe-400",
  ])("fails on the palette class %s", (cls) => {
    const run = check({ "components/x.tsx": `export const X = () => <div className="${cls}" />\n` })
    expect(run.status).toBe(1)
    expect(run.stderr).toContain("palette color class")
    expect(run.stderr).toContain("components/x.tsx:1")
  })

  it("scans JSON and CSS modules under app/ and components/, not JSON elsewhere", () => {
    const run = check({
      "app/page.module.css": ".a { color: #fff; }\n",
      "components/theme.json": `{ "c": "#000000" }\n`,
      "lib/shared/data.json": `{ "c": "#000000" }\n`,
    })
    expect(run.status).toBe(1)
    expect(run.stderr).toContain("app/page.module.css:1")
    expect(run.stderr).toContain("components/theme.json:1")
    expect(run.stderr).not.toContain("lib/shared/data.json")
  })

  it("fails on a globals.css that is not exactly app/globals.css", () => {
    const run = check({ "app/nested/globals.css": ":root { --x: #fff; }\n" })
    expect(run.status).toBe(1)
    expect(run.stderr).toContain("app/nested/globals.css:1")
  })

  it("passes on transparent / current / inherit and bare neutral tokens", () => {
    const run = check({
      "features/ok.tsx": `const a = "bg-transparent text-current fill-current stroke-current border-inherit text-inherit text-neutral bg-neutral/10 drop-shadow-md"\n`,
    })
    expect(run.status).toBe(0)
  })

  it("ignores hash links, HTML entities and non-color words", () => {
    const run = check({
      "features/z.tsx": `const a = "/?tab=contacts#email"; const b = "&#123;"; const c = "#account"; const d = "to-do text-whiteish"`,
    })
    expect(run.status).toBe(0)
  })
})
