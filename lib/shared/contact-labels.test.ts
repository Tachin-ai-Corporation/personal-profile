import { describe, expect, it } from "vitest"
import { CONTACT_LABEL_HOME, CONTACT_LABEL_OLD, CONTACT_LABELS, CONTACT_PHONE_TYPES, contactLabelsFrom } from "./contact-labels"

describe("CONTACT_LABELS", () => {
  it("lists the seven Contact Labels in the Story 3.1 order", () => {
    expect(CONTACT_LABELS).toEqual(["Primary", "Home", "Main", "Old", "Personal", "Mailing List", "Work"])
  })
})

describe("contactLabelsFrom", () => {
  it("puts the offered labels back in CONTACT_LABELS order and drops every other name", () => {
    // `valueListOptions` sorts by locale: the type key's names arrive alphabetically.
    const names = ["Home", "Mailing List", "Main", "Main Work", "Old", "Partnership Organization", "Personal", "Primary", "Work"]
    expect(contactLabelsFrom(names)).toEqual(["Primary", "Home", "Main", "Old", "Personal", "Mailing List", "Work"])
  })

  it("returns only the labels the platform offers", () => {
    expect(contactLabelsFrom(["Work", "Home", "Primary"])).toEqual(["Primary", "Home", "Work"])
  })

  it.each([
    ["no names (the type key is loading or failed)", undefined],
    ["an empty list", []],
    ["no Contact Label among them", ["Partnership Organization", "Main Work"]],
  ])("falls back to every Contact Label for %s", (_case, names) => {
    expect(contactLabelsFrom(names)).toEqual(CONTACT_LABELS)
  })

  it("matches names exactly", () => {
    expect(contactLabelsFrom(["work", "Home"])).toEqual(["Home"])
  })
})

describe("contact label and phone type constants", () => {
  it("names Home, Old and the two phone types", () => {
    expect(CONTACT_LABEL_HOME).toBe("Home")
    expect(CONTACT_LABEL_OLD).toBe("Old")
    expect(CONTACT_PHONE_TYPES).toEqual(["Mobile", "Landline"])
    expect(CONTACT_LABELS).toContain(CONTACT_LABEL_HOME)
    expect(CONTACT_LABELS).toContain(CONTACT_LABEL_OLD)
  })
})
