import { existsSync, readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { formatMessage, LAUNCH_ERROR_MESSAGES, LAUNCH_MESSAGES, MESSAGE_CATALOG, messageFor, PERSON_MESSAGES } from "."

const read = (relative: string): string => readFileSync(new URL(relative, import.meta.url), "utf8")

const EXPERIENCE_URL = new URL("../../../_bmad-output/planning-artifacts/ux-designs/ux-personal-profile-2026-10-13/EXPERIENCE.md", import.meta.url)
if (!existsSync(EXPERIENCE_URL)) {
  throw new Error(`EXPERIENCE.md source missing at ${fileURLToPath(EXPERIENCE_URL)}: update the path in messages.test.ts`)
}
const EXPERIENCE = readFileSync(EXPERIENCE_URL, "utf8")
/** Every per-area catalog file (the launch strings and the aggregator are not catalog copy). */
const AREA_FILES = readdirSync(new URL(".", import.meta.url))
  .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts") && name !== "index.ts" && name !== "launch.ts")
  .toSorted()
const SOURCES = AREA_FILES.map((name) => read(`./${name}`))

/** Every quoted string of the EXPERIENCE.md Voice and Tone table, whole and split on " · ". */
function voiceAndToneStrings(): Set<string> {
  const start = EXPERIENCE.indexOf("## Voice and Tone")
  const end = EXPERIENCE.indexOf("\n## ", start + 1)
  const table = EXPERIENCE.slice(start, end)
  const found = new Set<string>()
  for (const match of table.matchAll(/"([^"]+)"/g)) {
    found.add(match[1])
    for (const part of match[1].split(" · ")) found.add(part)
  }
  return found
}

interface CatalogLine {
  readonly key: string
  readonly value: string
  readonly draft: boolean
}

/** The app catalog's string entries as written in the source, with their DRAFT COPY markers. */
function catalogLines(): CatalogLine[] {
  const lines: CatalogLine[] = []
  for (const match of SOURCES.join("\n").matchAll(/^\s+(\w+): "((?:[^"\\]|\\.)*)",?[ \t]*(\/\/.*)?$/gm)) {
    lines.push({ key: match[1], value: JSON.parse(`"${match[2]}"`), draft: (match[3] ?? "").includes("DRAFT COPY") })
  }
  return lines
}

function catalogValues(): string[] {
  return Object.values(MESSAGE_CATALOG).flatMap((group) => Object.values(group))
}

/** A template matches a Voice and Tone string when its `{Name}` placeholders stand for any text. */
function matchesTemplate(template: string, copy: string): boolean {
  const pattern = template
    .split(/\{\w+\}/)
    .map((literal) => literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".+")
  return new RegExp(`^${pattern}$`).test(copy)
}

const VOICE_AND_TONE = voiceAndToneStrings()

describe("message catalog: verbatim against EXPERIENCE.md Voice and Tone", () => {
  it("aggregates every area file's group into MESSAGE_CATALOG exactly once", async () => {
    const groups = await Promise.all(AREA_FILES.map((name) => import(`./${name.replace(/\.ts$/, "")}`) as Promise<Record<string, object>>))
    const exported = groups.flatMap((module) => Object.values(module))
    expect(exported).toHaveLength(AREA_FILES.length)
    expect(Object.values(MESSAGE_CATALOG)).toHaveLength(AREA_FILES.length)
    for (const group of exported) expect(Object.values(MESSAGE_CATALOG)).toContain(group)
  })

  it("parses every catalog string from the source, so none escapes the marker check", () => {
    const parsed = catalogLines().map((line) => line.value)
    expect(parsed.toSorted()).toEqual(catalogValues().toSorted())
  })

  it("has no duplicated strings", () => {
    const values = catalogValues()
    expect(new Set(values).size).toBe(values.length)
  })

  it.each(catalogLines().filter((line) => !line.draft))("$key is verbatim Voice and Tone copy", ({ value }) => {
    expect([...VOICE_AND_TONE].some((copy) => matchesTemplate(value, copy))).toBe(true)
  })

  it.each([
    "Cancel",
    "Save",
    "Retry",
    "Not provided",
    "Return to 1health",
    "Personal Profile",
    "Personal account settings",
    "Unsaved changes",
    "Something went wrong while loading profile information",
    "You don't have access to this in your current account",
    "You have unsaved changes",
    "Keep editing",
    "Discard",
    "Your session ended",
    "Your changes are kept on this device. Relaunch from 1health to continue.",
    "Phone saved.",
    "Couldn't save phone. Check your connection.",
    "First name is required",
    "Last name is required",
    "First name can be up to 24 characters",
    "Last name can be up to 24 characters",
    "Birth date is required",
    "Enter a date as MM/DD/YYYY",
    "You must be between 18 and 120 years old",
    "You must be between 21 and 120 years old",
    "This SSN belongs to another person",
    "This number is already on your profile",
  ])("holds the shell/state/dialog copy %j", (copy) => {
    expect(VOICE_AND_TONE.has(copy)).toBe(true)
    expect(catalogValues().some((value) => matchesTemplate(value, copy))).toBe(true)
  })
})

describe("message catalog: voice rules", () => {
  const sentences = catalogValues()

  it.each(sentences)("%j has no exclamation mark", (value) => {
    expect(value).not.toContain("!")
  })

  it.each(sentences.filter((value) => value.includes(" ")))("%j keeps platform jargon out of sentences", (value) => {
    expect(value).not.toMatch(/contact point|precedence/i)
  })

  it("exempts only the D9 launch strings, which stay unchanged", () => {
    expect(LAUNCH_MESSAGES.successTitle).toBe("Success!")
    expect(LAUNCH_ERROR_MESSAGES.wrongTenant).toBe(
      "This is available in your personal account. Switch to it in 1health and open it again.",
    )
    expect(catalogValues()).not.toContain("Success!")
  })
})

describe("messageFor", () => {
  it("resolves a typed group.key reference", () => {
    expect(messageFor("person.ssnTaken")).toBe(PERSON_MESSAGES.ssnTaken)
    expect(messageFor("common.retry")).toBe("Retry")
  })
})

describe("formatMessage", () => {
  it("fills placeholders and leaves unknown ones as written", () => {
    expect(formatMessage(MESSAGE_CATALOG.section.saved, { section: "Phone" })).toBe("Phone saved.")
    expect(formatMessage("{N} unsaved sections", { N: 2 })).toBe("2 unsaved sections")
    expect(formatMessage("Couldn't save {section}.", {})).toBe("Couldn't save {section}.")
    expect(formatMessage(PERSON_MESSAGES.ageRange, { min: 21, max: 120 })).toBe("You must be between 21 and 120 years old")
  })
})
