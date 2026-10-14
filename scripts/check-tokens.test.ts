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

  it("ignores hash links, HTML entities and non-color words", () => {
    const run = check({
      "features/z.tsx": `const a = "/?tab=contacts#email"; const b = "&#123;"; const c = "#account"; const d = "to-do text-whiteish"`,
    })
    expect(run.status).toBe(0)
  })
})
