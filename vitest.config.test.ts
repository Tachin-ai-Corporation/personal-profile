import { globSync } from "node:fs"
import { matchesGlob } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { CLIENT_TESTS, SERVER_TESTS } from "./vitest.config"

/**
 * Spec R5-2: a test file that matches no Vitest project never runs, and one
 * that matches both runs twice in two environments. Every `*.test.ts(x)` in
 * the repository (outside dependencies, build output, agent worktrees and the
 * Playwright tree) must belong to exactly one project.
 */
const ROOT = fileURLToPath(new URL(".", import.meta.url))
const SKIPPED = /^(node_modules|\.next|\.git|\.claude|_bmad|_bmad-output|coverage|playwright-report|test-results|e2e)(\/|$)/

function projectsOf(file: string): string[] {
  return [
    ...(SERVER_TESTS.some((glob) => matchesGlob(file, glob)) ? ["server"] : []),
    ...(CLIENT_TESTS.some((glob) => matchesGlob(file, glob)) ? ["client"] : []),
  ]
}

describe("vitest projects", () => {
  it("every test file belongs to exactly one project", () => {
    const files = globSync("**/*.test.{ts,tsx}", { cwd: ROOT, exclude: (path) => SKIPPED.test(path) })
    expect(files.length).toBeGreaterThan(100)
    expect(files.filter((file) => projectsOf(file).length !== 1)).toEqual([])
  })

  it.each([
    ["app/foo/bar.test.ts", ["server"]],
    ["app/foo/bar.test.tsx", ["client"]],
    ["components/ui/x.test.ts", ["client"]],
    ["hooks/use-x.test.ts", ["client"]],
    ["contexts/x.test.tsx", ["client"]],
    ["lib/server/x/y.test.ts", ["server"]],
    ["lib/api/x.test.ts", ["client"]],
    ["lib/shared/x.test.tsx", ["client"]],
    ["x.test.tsx", ["client"]],
    ["somewhere/new.test.ts", []],
  ])("%s → %j", (file, projects) => {
    expect(projectsOf(file)).toEqual(projects)
  })
})
