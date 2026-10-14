import { ESLint } from "eslint"
import { describe, expect, it } from "vitest"

/**
 * Lint fixtures for the ownership rules of spec F1: each snippet is linted as
 * if it lived at `filePath` (the file need not exist), with the real config.
 */
const eslint = new ESLint({ cwd: process.cwd() })

async function ruleHits(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages.filter((m) => m.severity === 2).map((m) => `${m.ruleId}: ${m.message}`)
}

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
