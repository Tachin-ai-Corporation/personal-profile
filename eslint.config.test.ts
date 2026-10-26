import { ESLint } from "eslint"
import { beforeAll, describe, expect, it } from "vitest"

/**
 * Lint fixtures for the ownership rules of spec F1: each snippet is linted as
 * if it lived at `filePath` (the file need not exist), with the real config.
 */
const eslint = new ESLint({ cwd: process.cwd() })

async function ruleHits(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages.filter((m) => m.severity === 2).map((m) => `${m.ruleId}: ${m.message}`)
}

/**
 * The first lint loads the config, its plugins and the TypeScript parser
 * (about 1.4 s alone, over 5 s under full-suite load). Load them once here,
 * with a hook budget for that one-off cost, so no test pays for it.
 */
beforeAll(() => eslint.lintText("export {}\n", { filePath: "features/x.ts" }), 60_000)

const UPDATE_ACCOUNT = 'import { updateAccount } from "@/lib/api"\nexport const f = updateAccount\n'
const ACCOUNT_MODULE = 'import { updateAccount } from "@/lib/api/account"\nexport const f = updateAccount\n'
const RELATIVE_MODULE = 'import { updateAccount } from "../../lib/api/account"\nexport const f = updateAccount\n'
const RELATIVE_INDEX = 'import { updateAccount } from "../../lib/api"\nexport const f = updateAccount\n'
const DYNAMIC_MODULE = 'export const f = () => import("@/lib/api/account")\n'
const DYNAMIC_RELATIVE = 'export const f = () => import("../../lib/api/account")\n'
const DYNAMIC_INDEX = 'export const f = async () => (await import("@/lib/api")).updateAccount\n'
const OTHER_API = 'import { callApi } from "@/lib/api"\nexport const f = callApi\n'
const USE_TOAST = 'import { toast } from "@/hooks/use-toast"\nexport const f = toast\n'

describe("lint: updateAccount only in features/account (AD-9)", () => {
  it.each([
    ["features/personal/save.ts", UPDATE_ACCOUNT],
    ["features/personal/save.ts", ACCOUNT_MODULE],
    ["features/shell/x.ts", UPDATE_ACCOUNT],
    ["components/x.tsx", UPDATE_ACCOUNT],
    ["app/account/page.tsx", ACCOUNT_MODULE],
    ["features/personal/save.ts", RELATIVE_MODULE],
    ["features/personal/save.ts", RELATIVE_INDEX],
    ["lib/shared/x.ts", RELATIVE_MODULE],
    ["components/ui/x.tsx", RELATIVE_MODULE],
  ])("rejects a static import in %s", async (filePath, code) => {
    expect((await ruleHits(filePath, code)).join("\n")).toMatch(/no-restricted-imports: .*updateAccount\(\) is importable only in features\/account/)
  })

  it.each([
    ["features/personal/save.ts", DYNAMIC_MODULE],
    ["features/personal/save.ts", DYNAMIC_RELATIVE],
    ["app/page.tsx", DYNAMIC_INDEX],
  ])("rejects a dynamic import in %s", async (filePath, code) => {
    expect((await ruleHits(filePath, code)).join("\n")).toMatch(/no-restricted-syntax: lib\/api is imported statically/)
  })

  it.each([
    ["features/account/save.ts", UPDATE_ACCOUNT],
    ["features/account/edit/save.ts", ACCOUNT_MODULE],
    ["features/account/edit/save.ts", RELATIVE_MODULE],
    ["features/account/edit/save.ts", DYNAMIC_MODULE],
    ["features/personal/save.ts", OTHER_API],
  ])("allows %s", async (filePath, code) => {
    expect(await ruleHits(filePath, code)).toEqual([])
  })
})

describe("lint: hooks/use-toast only in features/shell/toasts.ts", () => {
  it.each(["features/shell/leave-guard.tsx", "features/shell/leave-guard.test.tsx", "features/account/x.ts", "components/x.tsx", "components/ui/toast.test.tsx", "app/page.tsx", "lib/api/x.ts"])("rejects it in %s", async (filePath) => {
    expect((await ruleHits(filePath, USE_TOAST)).join("\n")).toMatch(/no-restricted-imports: .*features\/shell \(toasts\.ts\)/)
  })

  it.each(["features/shell/toasts.ts", "features/shell/toasts.test.tsx", "components/ui/toaster.tsx"])("allows %s", async (filePath) => {
    expect(await ruleHits(filePath, USE_TOAST)).toEqual([])
  })
})

describe("lint: no string literals as zod messages in features/**/schema.ts", () => {
  const SCHEMA = "features/personal/schema.ts"
  const zod = (body: string): string =>
    `import { z } from "zod"\nimport { PERSON_MESSAGES } from "@/lib/shared/messages"\ndeclare const ok: boolean\nexport const s = ${body}\n`

  it.each([
    'z.string().min(1, "First name is required")',
    "z.string().max(24, `Too long`)",
    'z.string().regex(/x/, "Bad")',
    'z.string().refine((v) => v !== "", "Required")',
    'z.string().nonempty("Required")',
    'z.string().email("Invalid email address")',
    'z.email("Invalid email address")',
    'z.coerce.string("Required")',
    'z.coerce.number().int("Whole numbers only")',
    'z.string().min(1, ok ? "A" : PERSON_MESSAGES.firstNameRequired)',
    'z.string().min(1, PERSON_MESSAGES.firstNameRequired || "Required")',
    'z.string().min(1, { message: "Required" })',
    'z.string().min(1, { error: "Required" })',
    'z.string().min(1, { error: () => "Required" })',
    "z.string().min(1, { error: () => `Required` })",
    'z.string().min(1, { error: (iss) => (iss.input ? PERSON_MESSAGES.firstNameRequired : "Required") })',
    'z.string().min(1, { error: (iss) => { return "Required" } })',
    'z.string().min(1, { error: function () { if (ok) return PERSON_MESSAGES.firstNameRequired; return "Required" } })',
    'z.string({ error: "Required" })',
    'z.string("Required")',
    'z.enum(["Home", "Work"], "Pick one")',
    'z.string().superRefine((v, ctx) => ctx.addIssue({ code: "custom", message: ok ? "A" : PERSON_MESSAGES.firstNameRequired }))',
  ])("rejects %s", async (body) => {
    expect((await ruleHits(SCHEMA, zod(body))).join("\n")).toContain("Zod messages come from the message catalog")
  })

  it.each([
    "z.string().min(1, PERSON_MESSAGES.firstNameRequired)",
    "z.string().min(1, { error: PERSON_MESSAGES.firstNameRequired })",
    'z.string().min(1, { error: (iss) => (iss.code === "too_small" ? PERSON_MESSAGES.firstNameRequired : PERSON_MESSAGES.firstNameTooLong) })',
    'z.literal("Primary")',
    'z.enum(["Home", "Work"])',
    'z.string().startsWith("https://")',
    'z.string().includes("@")',
    'z.string().regex(/^\\d+$/, PERSON_MESSAGES.birthDateFormat).default("n/a")',
    'z.string().transform((v) => String(v.length).padStart(2, "0"))',
    'z.string().transform((v) => v.replace(/\\s+/g, " "))',
    'z.string().superRefine((v, ctx) => ctx.addIssue({ code: "custom", message: PERSON_MESSAGES.firstNameRequired }))',
  ])("allows %s", async (body) => {
    expect(await ruleHits(SCHEMA, zod(body))).toEqual([])
  })

  it("applies only to schema.ts files", async () => {
    expect(await ruleHits("features/personal/form.ts", zod('z.string().min(1, "Required")'))).toEqual([])
  })
})

describe("lint: no entityTypeCode in features/provider (AD-23, Story 9.1; spec F7-2)", () => {
  const HIT = /no-restricted-syntax: features\/provider never names entityTypeCode/

  it.each([
    ["features/provider/search.ts", 'export const q = "entityTypeCode=1"\n'],
    ["features/provider/search.ts", "export const q = (t: number) => `?entityTypeCode=${t}`\n"],
    ["features/provider/search.ts", "export const q = { entityTypeCode: 1 }\n"],
    ["features/provider/search.ts", "declare const p: { entityTypeCode: number }\nexport const q = p.entityTypeCode\n"],
    ["features/provider/npi-field.tsx", "export const F = () => <span>entityTypeCode</span>\n"],
    ["features/provider/nested/schema.ts", 'import { z } from "zod"\nexport const s = z.object({ entityTypeCode: z.number() })\n'],
    // Any case and spelling (spec F7-2 review).
    ["features/provider/search.ts", 'export const q = "entity_type_code=1"\n'],
    ["features/provider/search.ts", "export const ENTITY_TYPE_CODE = 1\n"],
    ["features/provider/search.ts", 'export const q = "EntityTypeCode"\n'],
  ])("rejects it in %s", async (filePath, code) => {
    expect((await ruleHits(filePath, code)).join("\n")).toMatch(HIT)
  })

  it.each([
    ["features/provider/search.test.ts", 'export const q = "entityTypeCode=1"\n'],
    ["features/provider/search.test.tsx", "export const q = { entityTypeCode: 1 }\n"],
    ["features/organizations/x.ts", 'export const q = "entityTypeCode=1"\n'],
    ["lib/api/x.ts", 'export const q = "entityTypeCode=1"\n'],
    ["features/provider/search.ts", 'export const q = "searchText"\n'],
  ])("allows %s", async (filePath, code) => {
    expect((await ruleHits(filePath, code)).join("\n")).not.toMatch(HIT)
  })

  it("keeps the zod and the base bans in features/provider", async () => {
    expect((await ruleHits("features/provider/schema.ts", 'import { z } from "zod"\nexport const s = z.string().min(1, "Required")\n')).join("\n")).toMatch(/Zod messages come from the message catalog/)
    expect((await ruleHits("features/provider/x.ts", "export const f = () => fetch(\"/x\")\n")).join("\n")).toMatch(/Use callApi/)
  })
})

/**
 * Main's lint guards (spec R5-2, ported from origin/main `lib/api/keys.test.ts`):
 * callApi is the only browser transport, keys.ts the only SWR key builder,
 * app-env.ts reads only NODE_ENV.
 */
describe("lint guards ported from main (spec R5-2)", () => {
  async function fatalFree(filePath: string, code: string): Promise<string[]> {
    const [result] = await eslint.lintText(code, { filePath })
    // A parse error would make the "allows" cases pass vacuously.
    expect(result.messages.filter((m) => m.fatal)).toEqual([])
    return result.messages.filter((m) => m.severity === 2).map((m) => `${m.ruleId}: ${m.message}`)
  }

  const FETCH = /no-restricted-syntax: Use callApi/
  const SWR_KEY = /pp\/inline-swr-key: Build SWR keys with lib\/api\/keys\.ts/

  it.each([
    ["bare fetch", 'export const f = () => fetch("/api/x")\n'],
    ["window.fetch", 'export const f = () => window.fetch("/api/x")\n'],
    ["globalThis.fetch", 'export const f = () => globalThis.fetch("/api/x")\n'],
    ["self.fetch", 'export const f = () => self.fetch("/api/x")\n'],
    ["an aliased window.fetch", "export const f = window.fetch\n"],
  ])("rejects %s in app code outside lib/server and lib/api/client.ts", async (_name, code) => {
    for (const filePath of ["features/demo/load.ts", "components/demo.tsx", "lib/api/demo.ts", "lib/shared/demo.ts", "app/demo/page.tsx"]) {
      expect((await fatalFree(filePath, code)).join("\n"), filePath).toMatch(FETCH)
    }
  })

  it.each(["lib/api/client.ts", "features/demo/load.test.ts", "lib/server/proxy/x.ts"])("allows fetch and window.fetch in %s", async (filePath) => {
    expect((await fatalFree(filePath, 'export const f = () => fetch("/x")\nexport const g = () => window.fetch("/x")\n')).join("\n")).not.toMatch(FETCH)
  })

  it.each([
    ["process.env.SECRET", "export const a = process.env.SECRET\n"],
    ['process.env["NODE_ENV"]', 'export const a = process.env["NODE_ENV"]\n'],
    ["a bare process.env", "export const a = process.env\n"],
  ])("rejects %s in lib/shared/app-env.ts (NODE_ENV only, D6)", async (_name, code) => {
    expect((await fatalFree("lib/shared/app-env.ts", code)).join("\n")).toMatch(/lib\/shared\/app-env\.ts may read only process\.env\.NODE_ENV/)
  })

  it("allows process.env.NODE_ENV in lib/shared/app-env.ts and nowhere else in app code", async () => {
    expect(await fatalFree("lib/shared/app-env.ts", "export const a = process.env.NODE_ENV\n")).toEqual([])
    expect((await fatalFree("features/demo/env.ts", "export const a = process.env.NODE_ENV\n")).join("\n")).toMatch(/lib\/server\/env\.ts only/)
  })

  it.each([
    ["useSWR array", 'import useSWR from "swr"\nexport function useX() { return useSWR(["pp","myself"], () => 1) }\n'],
    ["useSWR string", 'import useSWR from "swr"\nexport function useX() { return useSWR("/api/x", () => 1) }\n'],
    ["useSWR template", 'import useSWR from "swr"\nconst r = "x"\nexport function useX() { return useSWR(`pp-${r}`, () => 1) }\n'],
    ["useSWRImmutable array", 'import useSWRImmutable from "swr/immutable"\nexport function useX() { return useSWRImmutable(["pp"], () => 1) }\n'],
    ["useSWRMutation array", 'import useSWRMutation from "swr/mutation"\nexport function useX() { return useSWRMutation(["pp"], () => 1) }\n'],
    ["useSWRSubscription string", 'import useSWRSubscription from "swr/subscription"\nexport function useX() { return useSWRSubscription("pp", () => () => {}) }\n'],
    ["mutate array", 'import { mutate } from "swr"\nexport const m = () => mutate(["pp","myself"])\n'],
    ["preload string", 'import { preload } from "swr"\nexport const p = () => preload("pp", () => 1)\n'],
    ["x.preload template", "export const p = (s: { preload: (k: unknown) => void }) => s.preload(`pp`)\n"],
    // Review fix 4: wrapped, conditional and functional keys; the global mutate from useSWRConfig.
    ["useSWR array as const", 'import useSWR from "swr"\nexport function useX() { return useSWR(["pp", "x"] as const, () => 1) }\n'],
    ["useSWR array satisfies", 'import useSWR from "swr"\nexport function useX() { return useSWR(["pp"] satisfies unknown[], () => 1) }\n'],
    ["useSWR conditional consequent", 'import useSWR from "swr"\ndeclare const ok: boolean\nexport function useX() { return useSWR(ok ? ["pp", "x"] : null, () => 1) }\n'],
    ["useSWR conditional alternate", 'import useSWR from "swr"\nimport { keys } from "@/lib/api"\ndeclare const ok: boolean\nexport function useX() { return useSWR(ok ? keys.myself() : "pp", () => 1) }\n'],
    ["useSWR && key", 'import useSWR from "swr"\ndeclare const ok: boolean\nexport function useX() { return useSWR(ok && ["pp"], () => 1) }\n'],
    ["useSWR key function (expression body)", 'import useSWR from "swr"\nexport function useX() { return useSWR(() => ["pp", "x"], () => 1) }\n'],
    ["useSWR key function (block body)", 'import useSWR from "swr"\ndeclare const ok: boolean\nexport function useX() { return useSWR(() => { if (ok) { return ["pp"] } return null }, () => 1) }\n'],
    ["useSWRConfig().mutate", 'import { useSWRConfig } from "swr"\nexport function useX() { return () => useSWRConfig().mutate(["pp"]) }\n'],
    ["mutate destructured from useSWRConfig()", 'import { useSWRConfig } from "swr"\nexport function useX() { const { mutate } = useSWRConfig(); return () => mutate(["pp", "myself"]) }\n'],
    ["config.mutate with config = useSWRConfig()", 'import { useSWRConfig } from "swr"\nexport function useX() { const config = useSWRConfig(); return () => config.mutate(`pp`) }\n'],
    ["mutate from swr/_internal", 'import { mutate } from "swr/_internal"\nexport const m = () => mutate(["pp"])\n'],
  ])("rejects an inline SWR key: %s", async (_name, code) => {
    expect((await fatalFree("features/demo/hook.ts", code)).join("\n")).toMatch(SWR_KEY)
  })

  it("rejects inline SWR keys outside features/ too", async () => {
    expect((await fatalFree("app/x.tsx", 'import { mutate } from "swr"\nexport const m = () => mutate(["pp"])\n')).join("\n")).toMatch(SWR_KEY)
  })

  it.each([
    ["a bound mutate from useSWR (data, not a key)", 'import useSWR from "swr"\nimport { keys } from "@/lib/api"\nexport function useX() { const { mutate } = useSWR(keys.myself()); return () => mutate(["a", "b"]) }\n'],
    ["a bound x.mutate on another object", 'export const m = (cache: { mutate: (k: unknown) => void }) => cache.mutate(["pp","myself"])\n'],
    ["swr.mutate on a useSWR result", 'import useSWR from "swr"\nimport { keys } from "@/lib/api"\nexport function useX() { const swr = useSWR(keys.myself()); return () => swr.mutate(["a"]) }\n'],
    ["a local function named mutate", 'function mutate(x: unknown) { return x }\nexport const m = () => mutate(["pp"])\n'],
    ["react-dom preload(href, { as })", 'import { preload } from "react-dom"\nexport const p = () => preload("/font.woff2", { as: "font" })\n'],
    ["a conditional key with keys.* and null", 'import useSWR from "swr"\nimport { keys } from "@/lib/api"\ndeclare const ok: boolean\nexport function useX() { return useSWR(ok ? keys.myself() : null) }\n'],
    ["a key function returning keys.*", 'import useSWR from "swr"\nimport { keys } from "@/lib/api"\nexport function useX() { return useSWR(() => keys.myself()) }\n'],
  ])("allows %s", async (_name, code) => {
    expect((await fatalFree("features/demo/hook.ts", code)).join("\n")).not.toMatch(SWR_KEY)
  })

  it("allows inline keys only in lib/api/keys.ts", async () => {
    const code = 'import { mutate } from "swr"\nexport const m = () => mutate(["pp"])\n'
    expect((await fatalFree("lib/api/keys.ts", code)).join("\n")).not.toMatch(SWR_KEY)
  })

  it("allows keys built by keys.*", async () => {
    const code =
      'import useSWR, { mutate } from "swr"\nimport { keys, swrFetcher } from "@/lib/api"\n' +
      "export function useX() { return useSWR(keys.myself(), swrFetcher) }\n" +
      "export const m = () => mutate(keys.myself())\n"
    expect((await fatalFree("features/demo/hook.ts", code)).join("\n")).not.toMatch(SWR_KEY)
  })

  it("bans dangerouslySetInnerHTML", async () => {
    const code = 'export const X = () => <div dangerouslySetInnerHTML={{ __html: "x" }} />\n'
    expect((await fatalFree("features/demo/x.tsx", code)).join("\n")).toMatch(/dangerouslySetInnerHTML is banned/)
  })

  it("bans NextResponse.redirect in app/handoff/** (AD-4)", async () => {
    const code = 'import { NextResponse } from "next/server"\nexport const GET = () => NextResponse.redirect("https://x.example")\n'
    expect((await fatalFree("app/handoff/x/route.ts", code)).join("\n")).toMatch(/Use seeOther\(\)/)
  })
})
