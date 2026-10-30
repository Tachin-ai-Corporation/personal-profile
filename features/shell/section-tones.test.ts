import { describe, expect, it } from "vitest"
import { PROFILE_SECTION_IDS } from "./anchors"
import { labelChipTone, PROFILE_SECTION_ICONS, PROFILE_SECTION_TONES, TONE_CLASSES } from "./section-tones"

describe("PROFILE_SECTION_TONES / PROFILE_SECTION_ICONS", () => {
  it("give every Contacts Section and Insurance a tone and an icon", () => {
    const ids = [...PROFILE_SECTION_IDS, "insurance"].sort()
    expect(Object.keys(PROFILE_SECTION_TONES).sort()).toEqual(ids)
    expect(Object.keys(PROFILE_SECTION_ICONS).sort()).toEqual(ids)
  })
})

describe("TONE_CLASSES", () => {
  it("maps each tone to its own brand hue and tints, as whole class names", () => {
    for (const [tone, hue] of [["blue", "brand-primary"], ["teal", "brand-secondary"], ["mint", "brand-tertiary"]] as const) {
      const classes = TONE_CLASSES[tone]
      expect(classes.containerBar).toBe(`before:bg-${hue}`)
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
