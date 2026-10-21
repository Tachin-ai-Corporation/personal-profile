import { spawnSync } from "node:child_process"
import { describe, expect, it } from "vitest"

/** Resolve through the real ESLint dependency chain, rather than a direct test-only copy. */
const LOAD = `
  const { createRequire } = require('node:module');
  const next = createRequire(require.resolve('eslint-config-next'));
  const plugin = createRequire(next.resolve('@next/eslint-plugin-next'));
  const glob = createRequire(plugin.resolve('fast-glob'));
  const match = createRequire(glob.resolve('micromatch'));
  const braces = match('braces');
`

function run(source: string): unknown {
  const child = spawnSync(process.execPath, ["--stack-size=512", "-e", LOAD + source], { encoding: "utf8", timeout: 5_000 })
  expect(child.error).toBeUndefined()
  expect(child.status, child.stderr).toBe(0)
  return JSON.parse(child.stdout)
}

const result = (operation: string, pattern: string): unknown => run(`
  try {
    ${operation === "call" ? "braces" : `braces[${JSON.stringify(operation)}]`}(${JSON.stringify(pattern)});
    process.stdout.write(JSON.stringify({ accepted: true }));
  } catch (error) {
    process.stdout.write(JSON.stringify({ name: error.name, message: error.message }));
  }
`)

const DEPTH_ERROR = { name: "SyntaxError", message: "Input nesting exceeds maximum depth (100)" }

describe("installed braces local depth mitigation", () => {
  for (const operation of ["call", "create", "parse", "compile", "expand", "stringify"]) {
    it.each([
      ["balanced braces", "{".repeat(4_000) + "a,b" + "}".repeat(4_000)],
      ["unclosed braces", "{".repeat(4_000) + "a,b"],
      ["parentheses", "(".repeat(4_000) + "x" + ")".repeat(4_000)],
      ["mixed nesting", "{(".repeat(2_000) + "a,b" + ")}".repeat(2_000)],
    ])(`${operation} rejects %s before recursive walkers overflow`, (_label, pattern) => {
      expect(pattern.length).toBeLessThan(10_000)
      expect(result(operation, pattern)).toEqual(DEPTH_ERROR)
    })
    it.each([
      ["braces", "{".repeat(100) + "a,b" + "}".repeat(100)],
      ["parentheses", "(".repeat(100) + "a,b" + ")".repeat(100)],
      ["mixed nesting", "{(".repeat(50) + "a,b" + ")}".repeat(50)],
    ])(`${operation} accepts depth 100 but rejects 101 with %s`, (_label, atLimit) => {
      expect(result(operation, atLimit)).toEqual({ accepted: true })
      expect(result(operation, "{" + atLimit + "}")).toEqual(DEPTH_ERROR)
    })
  }

  it("counts the active depth, rather than rejecting many shallow alternatives", () => {
    expect(result("compile", Array.from({ length: 300 }, () => "{a,b}").join("/"))).toEqual({ accepted: true })
  })

  it.each([
    ["escaped", "\\{".repeat(500) + "x" + "\\}".repeat(500)],
    ["quoted", '"' + "{".repeat(500) + "x" + "}".repeat(500) + '"'],
    ["character class", "[" + "{".repeat(500) + "}]"],
  ])("preserves literal %s braces", (_label, pattern) => {
    expect(result("compile", pattern)).toEqual({ accepted: true })
  })

  it("preserves ordinary expansion, compilation and real fast-glob matching", () => {
    expect(run(`
      const fastGlob = plugin('fast-glob');
      process.stdout.write(JSON.stringify({
        expanded: braces.expand('src/{app,features}/file.{ts,tsx}'),
        compiled: braces.compile('src/{app,features}/file.{ts,tsx}'),
        files: fastGlob.sync('scripts/braces-{mitigation,missing}.test.ts'),
      }));
    `)).toEqual({
      expanded: ["src/app/file.ts", "src/app/file.tsx", "src/features/file.ts", "src/features/file.tsx"],
      compiled: "src/(app|features)/file.(ts|tsx)",
      files: ["scripts/braces-mitigation.test.ts"],
    })
  })
})
