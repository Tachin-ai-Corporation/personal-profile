// @vitest-environment node
import { fileURLToPath } from "node:url"
import { ESLint } from "eslint"
import { beforeAll, describe, expect, it } from "vitest"
import { keys } from "./keys"

describe("keys", () => {
  it("myself() is the readonly tuple ['pp','myself']", () => {
    expect(keys.myself()).toEqual(["pp", "myself"])
  })

  it("every key starts with 'pp' followed by a resource name", () => {
    for (const build of Object.values(keys)) {
      const key = build()
      expect(key[0]).toBe("pp")
      expect(typeof key[1]).toBe("string")
    }
  })
})

/**
 * The lint rules that keep `callApi` the only transport and `keys.ts` the only
 * key builder (AC: `pnpm lint` fails on these). Uses the real flat config.
 */
describe("lint guards (ESLint API)", () => {
  const cwd = fileURLToPath(new URL("../../", import.meta.url))
  let eslint: ESLint

  beforeAll(() => {
    eslint = new ESLint({ cwd })
  })

  async function ruleIds(code: string, filePath: string): Promise<string[]> {
    const [result] = await eslint.lintText(code, { filePath })
    // A parse error would make the "allows" cases pass vacuously.
    expect(result.messages.filter((m) => m.fatal)).toEqual([])
    return result.messages.map((m) => m.ruleId ?? "")
  }

  it.each([
    ["bare fetch", 'export const f = () => fetch("/api/x")'],
    ["window.fetch", 'export const f = () => window.fetch("/api/x")'],
    ["globalThis.fetch", 'export const f = () => globalThis.fetch("/api/x")'],
    ["self.fetch", 'export const f = () => self.fetch("/api/x")'],
  ])("reports %s in features/", async (_name, code) => {
    const ids = await ruleIds(code, "features/demo/load.ts")
    expect(ids.some((id) => id === "no-restricted-globals" || id === "no-restricted-properties")).toBe(true)
  })

  it("reports fetch in components/ and lib/api/ (outside client.ts)", async () => {
    expect(await ruleIds('export const f = () => fetch("/api/x")', "components/demo.tsx")).toContain(
      "no-restricted-globals",
    )
    expect(await ruleIds('export const f = () => fetch("/api/x")', "lib/api/demo.ts")).toContain(
      "no-restricted-globals",
    )
  })

  it("allows fetch in lib/api/client.ts and test files", async () => {
    expect(await ruleIds('export const f = () => fetch("/api/x")', "lib/api/client.ts")).not.toContain(
      "no-restricted-globals",
    )
    expect(await ruleIds('export const f = () => fetch("/api/x")', "features/demo/load.test.ts")).not.toContain(
      "no-restricted-globals",
    )
  })

  it("keeps the process.env ban in the fetch-ban block", async () => {
    expect(await ruleIds("export const v = process.env.X", "features/demo/env.ts")).toContain(
      "no-restricted-properties",
    )
  })

  it.each([
    ["useSWR array", 'import useSWR from "swr"\nexport function useX() { return useSWR(["pp","myself"], () => 1) }'],
    ["useSWR string", 'import useSWR from "swr"\nexport function useX() { return useSWR("/api/x", () => 1) }'],
    ["useSWR template", 'import useSWR from "swr"\nconst r = "x"\nexport function useX() { return useSWR(`pp-${r}`, () => 1) }'],
    ["useSWRImmutable array", 'import useSWRImmutable from "swr/immutable"\nexport function useX() { return useSWRImmutable(["pp"], () => 1) }'],
    ["useSWRMutation array", 'import useSWRMutation from "swr/mutation"\nexport function useX() { return useSWRMutation(["pp"], () => 1) }'],
    ["mutate array", 'import { mutate } from "swr"\nexport const m = () => mutate(["pp","myself"])'],
    ["x.mutate array", 'export const m = (cache: { mutate: (k: unknown) => void }) => cache.mutate(["pp","myself"])'],
    ["preload string", 'import { preload } from "swr"\nexport const p = () => preload("pp", () => 1)'],
  ])("reports inline SWR key: %s", async (_name, code) => {
    expect(await ruleIds(code, "features/demo/hook.ts")).toContain("no-restricted-syntax")
  })

  it("reports inline SWR keys outside features/ too", async () => {
    expect(await ruleIds('import { mutate } from "swr"\nexport const m = () => mutate(["pp"])', "app/x.tsx")).toContain(
      "no-restricted-syntax",
    )
  })

  it("allows keys built by keys.*", async () => {
    const code =
      'import useSWR, { mutate } from "swr"\nimport { keys, fetcher } from "@/lib/api"\n' +
      "export function useX() { return useSWR(keys.myself(), fetcher) }\n" +
      "export const m = () => mutate(keys.myself())"
    expect(await ruleIds(code, "features/demo/hook.ts")).not.toContain("no-restricted-syntax")
  })

  it("still bans dangerouslySetInnerHTML", async () => {
    const code = 'export const X = () => <div dangerouslySetInnerHTML={{ __html: "x" }} />'
    expect(await ruleIds(code, "features/demo/x.tsx")).toContain("no-restricted-syntax")
  })
})
