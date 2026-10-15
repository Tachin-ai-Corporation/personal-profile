import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { fetchers } from "."

/**
 * The structure of `lib/api` (specs F6-3, F7-2). Shared by both teams: a
 * story never edits this file. A module's own paths and constants are tested
 * in that module's own `<module>.test.ts` (e.g. `addresses.test.ts`).
 */

const API_DIR = join(process.cwd(), "lib/api")

/**
 * Internal modules are named `*.internal.ts` and never re-exported. Frozen
 * legacy exception (do not extend): `refresh-coordinator.ts`, internal to
 * `callApi` before the convention existed.
 */
const LEGACY_INTERNAL: readonly string[] = Object.freeze(["refresh-coordinator"])

/**
 * Frozen (spec F7-2, do not extend): the infrastructure modules `index.ts`
 * exports by name, because they also hold test seams or internals. Every
 * other module is re-exported with exactly one `export * from "./x"` line.
 */
const NAMED_EXPORTS: readonly string[] = Object.freeze(["client", "fetcher", "log-api-call"])

/**
 * Generic-name rule (spec F7-2; FOUNDATION.md §1, team ownership rule 6): an exported name
 * made only of these words (`loadList`, `savePayload`, `toView`, `PAGE_SIZE`,
 * `keys`) is ambiguous across `export *` modules and must carry its area's
 * prefix (`addressesListPath`, `ADDRESS_LIST_PAGE_SIZE`, `toAccountView`).
 */
const GENERIC_WORDS: ReadonlySet<string> = new Set([
  // verbs
  "load", "fetch", "save", "update", "delete", "remove", "create", "add", "get", "set", "put", "post", "search", "list",
  "to", "from", "is", "has", "map", "build", "make", "parse", "format", "validate", "register", "upload", "download", "use",
  // nouns
  "path", "url", "page", "size", "max", "min", "length", "limit", "item", "items", "data", "result", "results", "value", "values",
  "option", "options", "payload", "body", "view", "domain", "row", "rows", "entry", "entries", "schema", "error", "errors",
  "id", "ids", "key", "keys", "query", "params", "status", "info", "all", "one", "default", "defaults", "config", "label",
  "labels", "field", "fields", "count", "total", "state", "response", "request",
])

/** Frozen legacy exceptions to the generic-name rule (do not extend). */
const LEGACY_GENERIC: readonly string[] = Object.freeze(["keys", "mapFetchError", "parseErrorBody", "valueListOptions"])

const words = (name: string): string[] =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase())

const isGenericName = (name: string): boolean => words(name).every((word) => GENERIC_WORDS.has(word))

const INDEX = readFileSync(join(API_DIR, "index.ts"), "utf8")
const MODULES = readdirSync(API_DIR)
  .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts") && name !== "index.ts")
  .map((name) => name.replace(/\.ts$/, ""))
const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const starLine = (name: string): RegExp => new RegExp(`^export \\* from "\\./${escape(name)}"$`, "m")

/** Every lib/api module's runtime exports (types vanish), `errors/` through its index. */
const LOADED = import.meta.glob<Record<string, unknown>>(["./*.ts", "./errors/index.ts", "!./*.test.ts", "!./index.ts"], { eager: true })

interface ModuleExports {
  readonly path: string
  readonly source: string
  readonly exports: Readonly<Record<string, unknown>>
}

/** The public modules (internal ones are never re-exported, so their names can't clash), with their sources. */
const PUBLIC_MODULES: readonly ModuleExports[] = Object.entries(LOADED)
  .filter(([path]) => !path.endsWith(".internal.ts") && !LEGACY_INTERNAL.some((name) => path === `./${name}.ts`))
  .map(([path, exports]) => ({ path, exports, source: readFileSync(join(API_DIR, path), "utf8") }))

const SHARED_VALUE: readonly unknown[] = Object.freeze([])

/** `export { …name… }` (with or without `from`): the module re-exports a binding it doesn't declare. */
const reExports = (source: string, name: string): boolean =>
  [...source.matchAll(/export\s*\{([^}]*)\}/g)].some((match) => new RegExp(`(^|[\\s,])${escape(name)}\\s*(,|$)`).test(match[1].trim()))

/**
 * Names exported by more than one module (spec F7-2 review). The only
 * allowed duplicate is an identity re-export: every module but the
 * declaring one lists the name in an `export { … }` re-export and the value
 * is the same (`===`). An equal primitive declared twice (two `PAGE_SIZE =
 * 10`) is a clash, though the values compare equal.
 */
function findClashes(modules: readonly ModuleExports[]): string[] {
  const holders = new Map<string, ModuleExports[]>()
  for (const mod of modules) {
    for (const name of Object.keys(mod.exports)) holders.set(name, [...(holders.get(name) ?? []), mod])
  }
  const clashes: string[] = []
  for (const [name, list] of holders) {
    if (list.length < 2) continue
    const declaring = list.filter((mod) => !reExports(mod.source, name))
    const sameValue = list.every((mod) => mod.exports[name] === list[0].exports[name])
    if (declaring.length > 1 || !sameValue) clashes.push(`${name}: ${list.map((mod) => mod.path).join(" and ")}`)
  }
  return clashes.toSorted()
}

describe("lib/api structure (specs F6-3, F7-2)", () => {
  it("re-exports every module with exactly one `export * from` line, so stories never edit index.ts", () => {
    const starred = MODULES.filter((name) => !name.endsWith(".internal") && !LEGACY_INTERNAL.includes(name) && !NAMED_EXPORTS.includes(name))
    expect(starred).toEqual(
      expect.arrayContaining(["personal", "profile-picture", "contacts", "addresses", "places", "insurance", "type-keys", "account", "mfa", "npi", "organizations", "practice-support"]),
    )
    expect(starred).toEqual(expect.arrayContaining(["myself", "contact-points", "files", "keys"]))
    for (const name of starred) expect(INDEX, name).toMatch(starLine(name))
    expect(INDEX).toMatch(starLine("errors"))
    for (const name of NAMED_EXPORTS) {
      expect(INDEX, name).toContain(`from "./${name}"`)
      expect(INDEX, name).not.toMatch(starLine(name))
    }
  })

  it("never re-exports an internal module", () => {
    for (const name of MODULES.filter((mod) => mod.endsWith(".internal") || LEGACY_INTERNAL.includes(mod))) {
      expect(INDEX, name).not.toContain(`"./${name}"`)
    }
  })

  it("has unique value-export names across public modules (an index name export would silently shadow an `export *` one)", () => {
    expect(PUBLIC_MODULES.length).toBeGreaterThan(20)
    expect(PUBLIC_MODULES.some((mod) => mod.path.endsWith(".internal.ts"))).toBe(false)
    expect(findClashes(PUBLIC_MODULES)).toEqual([])
  })

  it.each<[string, readonly ModuleExports[], string[]]>([
    [
      "an equal primitive declared in two modules",
      [
        { path: "./a.ts", source: "export const PAGE_SIZE = 10", exports: { PAGE_SIZE: 10 } },
        { path: "./b.ts", source: "export const PAGE_SIZE = 10", exports: { PAGE_SIZE: 10 } },
      ],
      ["PAGE_SIZE: ./a.ts and ./b.ts"],
    ],
    [
      "a re-exported primitive (identity re-export)",
      [
        { path: "./a.ts", source: "export const LIMIT = 3", exports: { LIMIT: 3 } },
        { path: "./b.ts", source: 'import { LIMIT } from "./a"\nexport { LIMIT }', exports: { LIMIT: 3 } },
      ],
      [],
    ],
    [
      "a re-exported object",
      [
        { path: "./a.ts", source: "export const LIST = []", exports: { LIST: SHARED_VALUE } },
        { path: "./b.ts", source: 'export { LIST, type Item } from "./a"', exports: { LIST: SHARED_VALUE } },
      ],
      [],
    ],
    [
      "a re-export list that names a different value",
      [
        { path: "./a.ts", source: "export const LIST = []", exports: { LIST: SHARED_VALUE } },
        { path: "./b.ts", source: "export { LIST }", exports: { LIST: [] } },
      ],
      ["LIST: ./a.ts and ./b.ts"],
    ],
    [
      "different functions with one name",
      [
        { path: "./a.ts", source: "export function load() {}", exports: { load: () => 1 } },
        { path: "./b.ts", source: "export function load() {}", exports: { load: () => 2 } },
      ],
      ["load: ./a.ts and ./b.ts"],
    ],
  ])("findClashes: %s", (_label, modules, expected) => {
    expect(findClashes(modules)).toEqual(expected)
  })

  it("gives every generic export name its area's prefix (legacy names frozen)", () => {
    const names = new Set(PUBLIC_MODULES.flatMap((mod) => Object.keys(mod.exports)))
    const generic = [...names].filter((name) => isGenericName(name) && !LEGACY_GENERIC.includes(name)).toSorted()
    expect(generic).toEqual([])
    // The legacy exceptions are real (drop one when its name goes away).
    for (const name of LEGACY_GENERIC) expect(names).toContain(name)
  })

  it.each([
    ["loadList", true],
    ["savePayload", true],
    ["toView", true],
    ["PAGE_SIZE", true],
    ["MAX_LENGTH", true],
    ["fetchItems", true],
    ["addressesListPath", false],
    ["ADDRESS_LIST_PAGE_SIZE", false],
    ["toAccountView", false],
    ["fileDeletePath", false],
  ] as const)("the generic-name rule calls %j generic: %s", (name, expected) => {
    expect(isGenericName(name)).toBe(expected)
  })

  it("keeps the legacy fetchers object frozen", () => {
    expect(Object.isFrozen(fetchers)).toBe(true)
    expect(Object.keys(fetchers)).toEqual(["myself", "contactPoints"])
  })
})
