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
