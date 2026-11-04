import { describe, expect, it } from "vitest"
import { ACCOUNT_ANCHORS, PROFILE_SECTION_IDS } from "./anchors"
import { labelChipTone, PROFILE_SECTION_ICONS, PROFILE_SECTION_TONES, SECTION_TONE, TONE_CLASSES } from "./section-tones"

describe("PROFILE_SECTION_TONES / PROFILE_SECTION_ICONS", () => {
  it("give every Contacts Section, Insurance and every /account Section a tone and an icon", () => {
    const ids = [...PROFILE_SECTION_IDS, "insurance", ...ACCOUNT_ANCHORS, "provider"].sort()
    expect(Object.keys(PROFILE_SECTION_TONES).sort()).toEqual(ids)
    expect(Object.keys(PROFILE_SECTION_ICONS).sort()).toEqual(ids)
  })

  it("one colour (2026-11-03 feedback): every Section takes SECTION_TONE, the brand-primary blue", () => {
    expect(SECTION_TONE).toBe("blue")
    expect(new Set(Object.values(PROFILE_SECTION_TONES))).toEqual(new Set([SECTION_TONE]))
    expect(TONE_CLASSES[SECTION_TONE].containerBar).toBe("border-l-brand-primary")
  })

  it("a distinct icon per Section", () => {
    expect(new Set(Object.values(PROFILE_SECTION_ICONS)).size).toBe(Object.keys(PROFILE_SECTION_ICONS).length)
  })
})

describe("TONE_CLASSES", () => {
  it("maps each tone to its own brand hue and tints, as whole class names", () => {
    for (const [tone, hue] of [["blue", "brand-primary"], ["teal", "brand-secondary"], ["mint", "brand-tertiary"]] as const) {
      const classes = TONE_CLASSES[tone]
      expect(classes.containerBar).toBe(`border-l-${hue}`)
      expect(classes.titleAccent).toBe(`after:bg-${hue}`)
      expect(classes.headerActions).toContain(`[&_button]:border-${hue}/`)
      expect(classes.headerActions).toContain(`[&_button:hover]:bg-tint-${tone}-surface!`)
      expect(classes.tableHeader).toBe(`bg-tint-${tone}-surface text-tint-${tone}-strong-foreground`)
      expect(classes.rowHover).toBe(`hover:bg-tint-${tone}-surface focus-within:bg-tint-${tone}-surface`)
      expect(classes.navCurrent).toBe(`bg-tint-${tone}-strong before:bg-${hue}`)
      expect(classes.navHover).toBe(`hover:bg-tint-${tone}-surface`)
      expect(classes.navText).toBe(`text-tint-${tone}-strong-foreground`)
      expect(classes.navCount).toBe(`bg-tint-${tone}-strong text-tint-${tone}-strong-foreground`)
      expect(classes.navCountCurrent).toBe(`bg-tint-${tone}-emphasis text-tint-${tone}-emphasis-foreground`)
    }
  })
})

describe("labelChipTone", () => {
  it("is mint for Home, teal for Work and aqua for any other label, ignoring case and spaces", () => {
    expect(labelChipTone("Home")).toBe("mint")
    expect(labelChipTone(" home ")).toBe("mint")
    expect(labelChipTone("WORK")).toBe("teal")
    expect(labelChipTone("Other")).toBe("aqua")
    expect(labelChipTone("Secondary")).toBe("aqua")
    expect(labelChipTone("")).toBe("aqua")
  })
})
