// @vitest-environment node
//
// Story 1.8a + R1: the design-system color gate and the removed-symbol /
// per-environment-secret bans in scripts/check-forbidden.sh.
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

// Names are assembled at runtime so this file itself never spells a
// `_DEMO`/`_PROD` name (the gate scans scripts/ too).
const DEMO_NAME = ["ONEHEALTH_SECRET_KEY", "DEMO"].join("_")
const PROD_NAME = ["APP_ID", "PROD"].join("_")

describe("check-forbidden: per-environment secret names (D1)", () => {
  it.each([
    ["features/x.ts", `export const k = "${DEMO_NAME}"\n`],
    ["lib/server/launch.ts", `const k = process.env.${PROD_NAME}\n`],
    ["app/api/token/route.ts", `// ${DEMO_NAME}\n`],
    ["proxy.ts", `const k = "${PROD_NAME}"\n`],
    ["instrumentation.ts", `const k = "${DEMO_NAME}"\n`],
    ["e2e/launch.spec.ts", `const k = "${DEMO_NAME}"\n`],
    ["lib/server/token.test.ts", `const k = "${PROD_NAME}"\n`],
  ])("fails on a name in %s", (path, body) => {
    const { code, out } = runGate({ [path]: body })
    expect(code).toBe(1)
    expect(out).toContain("FORBIDDEN [_DEMO/_PROD secret name]")
    expect(out).toContain(path)
  })

  it("allows them in env.ts, its tests, .env.example and the CI/test fixtures", () => {
    const line = `${DEMO_NAME}=x ${PROD_NAME}=y\n`
    const { code, out } = runGate({
      "lib/server/env.ts": line,
      "lib/server/env.test.ts": line,
      ".env.example": line,
      ".github/workflows/ci.yml": line,
      "playwright.config.ts": line,
      "vitest.setup.ts": line,
      "e2e/fixtures.ts": line,
      "test/env-fixture.ts": line,
    })
    expect(out).not.toContain("FORBIDDEN")
    expect(code).toBe(0)
  })
})

describe("check-forbidden: removed symbols (D1, D4, D10, D13)", () => {
  it.each([
    ["APP_ENV", "const e = process.env.APP_ENV\n", "removed env/origin name"],
    ["NEXT_PUBLIC_APP_ENV", "const e = process.env.NEXT_PUBLIC_APP_ENV\n", "removed env/origin name"],
    ["API_ORIGIN", "import { API_ORIGIN } from './env'\n", "removed env/origin name"],
    ["APP_ORIGIN", "const o = APP_ORIGIN\n", "removed env/origin name"],
    ["PORTAL_URL", "// navigates to PORTAL_URL\n", "removed env/origin name"],
    ["PORTAL_ORIGIN", "const o = PORTAL_ORIGIN\n", "removed env/origin name"],
    ["PUBLIC_FILES_ORIGIN", "const o = PUBLIC_FILES_ORIGIN\n", "removed env/origin name"],
    ["SameSite=None", 'const c = "x; SameSite=None; Secure"\n', "SameSite=None"],
    ["Partitioned", 'const c = "x; Partitioned"\n', "Partitioned"],
    ["window.top", "const framed = window.self !== window.top\n", "window.top"],
  ])("fails on %s in features/x.ts", (_name, body, label) => {
    const { code, out } = runGate({ "features/x.ts": body })
    expect(code).toBe(1)
    expect(out).toContain(`FORBIDDEN [${label}]`)
    expect(out).toMatch(/features\/x\.ts:1:/)
  })

  it("fails on bg-black/50 in lib/ too", () => {
    const { code, out } = runGate({ "lib/shared/x.ts": `export const c = "bg-black/50"\n` })
    expect(code).toBe(1)
    expect(out).toContain("FORBIDDEN [bg-black/50]")
  })

  it.each(["lib/server/env.ts", "lib/server/proxy.ts", "proxy.ts", "instrumentation.ts", "app/auth/page.tsx"])(
    "scans %s",
    (path) => {
      const { code } = runGate({ [path]: "const o = APP_ORIGIN\n" })
      expect(code).toBe(1)
    },
  )

  it("skips test files and e2e/, and does not flag look-alikes", () => {
    const { code, out } = runGate({
      "features/x.test.tsx": "const e = APP_ENV; const t = window.top\n",
      "e2e/headers.spec.ts": "const o = PORTAL_URL\n",
      "features/ok.ts": "const portalUrl = env.portalUrl; const topWindow = window.topmost\n",
    })
    expect(out).not.toContain("FORBIDDEN")
    expect(code).toBe(0)
  })
})
