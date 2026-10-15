import { spawnSync } from "node:child_process"
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"

const SCRIPTS = dirname(fileURLToPath(import.meta.url))

let root: string | undefined

/** Runs check-forbidden.sh in a scratch git repo holding only `files` (untracked files count). */
function check(files: Record<string, string>): { status: number | null; stderr: string } {
  root = mkdtempSync(join(tmpdir(), "check-forbidden-"))
  mkdirSync(join(root, "scripts"))
  for (const name of ["check-forbidden.sh", "check-tokens.sh"]) copyFileSync(join(SCRIPTS, name), join(root, "scripts", name))
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  spawnSync("git", ["init", "-q"], { cwd: root })
  const run = spawnSync("bash", [join(root, "scripts/check-forbidden.sh")], { cwd: root, encoding: "utf8" })
  return { status: run.status, stderr: run.stderr }
}

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true })
  root = undefined
})

const CHECKOUT = 'export const CHECKOUT_URL = "https://learnmore.1health.io/product-checkout"\n'

/** Rule 5 (1health origins), spec F6-3: only environments.ts and the exact CHECKOUT_URL line of profile-constants.ts. */
describe("scripts/check-forbidden.sh: 1health URLs", () => {
  it("allows environments.ts and the CHECKOUT_URL line of profile-constants.ts", () => {
    const run = check({
      "lib/shared/environments.ts": 'export const A = "https://1health.app.1health.io"\n',
      "lib/shared/profile-constants.ts": `/** Mentions 1health.io without a scheme. */\n${CHECKOUT}`,
    })
    expect(run.stderr).toBe("")
    expect(run.status).toBe(0)
  })

  it("fails on any other 1health URL in profile-constants.ts", () => {
    const run = check({ "lib/shared/profile-constants.ts": `${CHECKOUT}export const OTHER = "https://1health.app.1health.io/x"\n` })
    expect(run.status).toBe(1)
    expect(run.stderr).toContain("lib/shared/profile-constants.ts (only the CHECKOUT_URL line may name a 1health URL)")
  })

  it("fails on a changed CHECKOUT_URL line", () => {
    const run = check({ "lib/shared/profile-constants.ts": 'export const CHECKOUT_URL = "https://evil.1health.io/product-checkout"\n' })
    expect(run.status).toBe(1)
  })

  it.each([
    ["https://dev.1hdev.io", "lib/server/launch/exchange.ts"],
    ["https://dev.1hdev.io/api/v2/user/myself", "features/x.tsx"],
    ["//dev.1hdev.io/auth", "app/x/route.ts"],
    ["HTTPS://DEV.1HDEV.IO", "lib/api/x.ts"],
    ["https://1Health.app.1HEALTH.io", "lib/api/y.ts"],
    ["//1health.demo.1health.io", "proxy.ts"],
  ])("fails on %j outside environments.ts (D18: the dev host 1hdev.io too)", (url, path) => {
    const run = check({ [path]: `export const U = "${url}"\n` })
    expect(run.status).toBe(1)
    expect(run.stderr).toContain("hard-coded 1health/1hdev origin outside lib/shared/environments.ts:")
    expect(run.stderr).toContain(path)
  })

  it("allows the dev host in environments.ts and in tests", () => {
    const run = check({
      "lib/shared/environments.ts": 'export const D = "https://dev.1hdev.io"\n',
      "lib/shared/environments.test.ts": 'expect(x).toBe("https://dev.1hdev.io")\n',
    })
    expect(run.stderr).toBe("")
    expect(run.status).toBe(0)
  })

  it("fails on the CHECKOUT_URL line copied into another file", () => {
    const run = check({ "lib/shared/elsewhere.ts": CHECKOUT, "lib/shared/profile-constants.ts": CHECKOUT })
    expect(run.status).toBe(1)
    expect(run.stderr).toContain("lib/shared/elsewhere.ts")
    expect(run.stderr).not.toContain("only the CHECKOUT_URL line")
  })
})

/** Rule 6 (spec F7-2, Story 7.3): only the deny list names switch-tenant. */
describe("scripts/check-forbidden.sh: switch-tenant", () => {
  const DENY = 'export const DENY = [{ method: "*", template: "v2/user/switch-tenant/**" }]\n'

  it("allows the deny list and tests", () => {
    const run = check({
      "lib/server/proxy/deny-list.ts": DENY,
      "lib/server/proxy/deny-list.test.ts": 'it("denies", () => isDenied("POST", "v2/user/switch-tenant"))\n',
    })
    expect(run.stderr).toBe("")
    expect(run.status).toBe(0)
  })

  it.each(["switchTenant", "SWITCH_TENANT", "switch_tenant", "Switch-Tenant", "switchtenant"])("fails on the spelling %j (spec F7-2 review)", (name) => {
    const run = check({ "lib/server/proxy/deny-list.ts": DENY, "lib/api/x.ts": `export const ${name.replace("-", "_")} = "${name}"\n` })
    expect(run.status).toBe(1)
    expect(run.stderr).toContain("lib/api/x.ts")
  })

  it.each(["lib/api/account.ts", "features/organizations/enter.ts", "app/handoff/portal/route.ts", "lib/server/handoff.ts"])("fails on %s", (path) => {
    const run = check({ "lib/server/proxy/deny-list.ts": DENY, [path]: 'export const P = "v2/user/switch-tenant"\n' })
    expect(run.status).toBe(1)
    expect(run.stderr).toContain("switch-tenant outside lib/server/proxy/deny-list.ts")
    expect(run.stderr).toContain(path)
    expect(run.stderr).not.toContain("  lib/server/proxy/deny-list.ts")
  })
})

// Names are assembled at runtime so this file never spells a `_DEMO`/`_PROD`/`_DEV`
// name itself (the gate scans scripts/ tests too).
const demoKeyName = ["ONEHEALTH_SECRET_KEY", "DEMO"].join("_")
const prodAppName = ["APP_ID", "PROD"].join("_")
const demoAppName = ["APP_ID", "DEMO"].join("_")
const devKeyName = ["ONEHEALTH_SECRET_KEY", "DEV"].join("_")
const devAppName = ["APP_ID", "DEV"].join("_")
const MESSAGE = "_DEMO/_PROD/_DEV name outside the allowed files:"

/** Rule 3 (D1, D18; spec R5-1 restored main's broad pattern): every `_DEMO`/`_PROD`/`_DEV` name, `APP_ID_*` included. */
describe("scripts/check-forbidden.sh: per-environment names", () => {
  it.each([
    ["features/x.ts", `export const k = "${demoKeyName}"\n`],
    ["lib/server/launch/launch.ts", `const k = env.${prodAppName}\n`],
    ["lib/server/launch/launch.test.ts", `const k = TEST_ENV.${prodAppName}\n`],
    ["app/api/token/route.ts", `// ${demoAppName}\n`],
    ["proxy.ts", `const k = "${prodAppName}"\n`],
    ["instrumentation.ts", `const k = "${demoKeyName}"\n`],
    ["e2e/fixtures/core.ts", `const k = TEST_SERVER_ENV.${demoAppName}\n`],
    ["e2e/launch.spec.ts", `const k = "${prodAppName}"`],
    ["lib/server/launch/launch.ts", `const k = env.${devKeyName}\n`],
    ["app/auth/page.tsx", `// ${devAppName}\n`],
    ["e2e/launch.spec.ts", `const k = "${devAppName}"`],
    ["test/e2e-upstream-mock.ts", `const k = "${devKeyName}"\n`],
  ])("fails on a name in %s", (path, body) => {
    const run = check({ [path]: body })
    expect(run.status).toBe(1)
    expect(run.stderr).toContain(MESSAGE)
    expect(run.stderr).toContain(path)
  })

  it("allows them in env.ts, its test, the env fixtures, .env.example, the Playwright config and CI", () => {
    const line = `${demoKeyName}=x ${prodAppName}=y ${demoAppName}=z ${devKeyName}=v ${devAppName}=w\n`
    const run = check({
      "lib/server/env.ts": line,
      "lib/server/env.test.ts": line,
      "test/env-fixture.ts": line,
      ".env.example": line,
      "playwright.config.ts": line,
      "e2e/server-env.ts": line,
      ".github/workflows/ci.yml": line,
    })
    expect(run.stderr).toBe("")
    expect(run.status).toBe(0)
  })

  it.each(["DEMO", "PROD", "DEV", "IS_PRODUCTION", "SOME_PRODUCT", "ENV_DEMOGRAPHICS", "x_demo", "MY_DEVICE", "IS_DEVELOPMENT", "x_dev"])("ignores %j (no `_DEMO`/`_PROD`/`_DEV` name)", (word) => {
    const run = check({ "lib/x.ts": `export const value = "${word}"\n` })
    expect(run.stderr).toBe("")
    expect(run.status).toBe(0)
  })
})
