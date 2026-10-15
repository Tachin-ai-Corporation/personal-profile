import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"

/**
 * `e2e/fixtures/index.ts` re-exports every area file with `export *` (spec
 * F7-1). Two teams add helpers in parallel, so a name exported by two files
 * would be ambiguous after their merge (TS2308; Playwright would then load a
 * module whose name silently resolves to neither). This test names every
 * clash, and every area file missing from the index, before that happens.
 */

const DIR = path.resolve(__dirname, "../e2e/fixtures")
const INDEX = path.join(DIR, "index.ts")
const areaFiles = readdirSync(DIR)
  .filter((name) => name.endsWith(".ts") && name !== "index.ts")
  .map((name) => name.replace(/\.ts$/, ""))
  .sort()

function program(): ts.Program {
  const config = ts.getParsedCommandLineOfConfigFile(path.resolve(__dirname, "../tsconfig.json"), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => undefined })
  if (!config) throw new Error("tsconfig.json did not parse")
  return ts.createProgram([INDEX, ...areaFiles.map((name) => path.join(DIR, `${name}.ts`))], { ...config.options, noEmit: true, incremental: false })
}

describe("e2e/fixtures/index.ts", () => {
  it("has exactly one `export * from \"./<file>\"` line per area file, and nothing else", () => {
    const lines = readFileSync(INDEX, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("//"))
    const exported = lines.map((line) => /^export \* from "\.\/([\w-]+)"$/.exec(line)?.[1] ?? `not an export * line: ${line}`)
    expect(exported.toSorted()).toEqual(areaFiles)
  })

  it("no name is exported by two area files (unless one re-exports the other's)", { timeout: 60_000 }, () => {
    const prog = program()
    const checker = prog.getTypeChecker()
    const owners = new Map<string, Map<ts.Symbol, string[]>>()
    for (const name of areaFiles) {
      const source = prog.getSourceFile(path.join(DIR, `${name}.ts`))
      const moduleSymbol = source && checker.getSymbolAtLocation(source)
      if (!moduleSymbol) continue // an `export {}`-only file has no exports to clash
      for (const symbol of checker.getExportsOfModule(moduleSymbol)) {
        const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
        const byTarget = owners.get(symbol.name) ?? new Map<ts.Symbol, string[]>()
        byTarget.set(target, [...(byTarget.get(target) ?? []), name])
        owners.set(symbol.name, byTarget)
      }
    }
    const clashes = [...owners].filter(([, byTarget]) => byTarget.size > 1).map(([name, byTarget]) => `${name}: ${[...byTarget.values()].flat().join(", ")}`)
    expect(clashes, "rename with the area prefix (e.g. mockAddressSave)").toEqual([])
    expect(owners.size).toBeGreaterThan(10)
    const diagnostics = prog.getSemanticDiagnostics(prog.getSourceFile(INDEX)).map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))
    expect(diagnostics).toEqual([])
  })
})
