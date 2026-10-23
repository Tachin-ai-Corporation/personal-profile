import { describe, expect, it } from "vitest"
import { editDistance, suggestEmailCorrection } from "./email-typo"

describe("suggestEmailCorrection", () => {
  it.each([
    ["test@gmail.cnn", "test@gmail.com"],
    ["test@gmail.cdm", "test@gmail.com"],
    ["test@gmail.co", "test@gmail.com"],
    ["test@gmail.cmo", "test@gmail.com"],
    ["test@gmail.om", "test@gmail.com"],
    ["test@googlemail.con", "test@googlemail.com"],
    ["test@icloud.vom", "test@icloud.com"],
    ["test@yahoo.cnn", "test@yahoo.com"],
    ["test@hotmail.xom", "test@hotmail.com"],
    ["test@outlook.cim", "test@outlook.com"],
    ["test@live.cpm", "test@live.com"],
    ["test@aol.cdm", "test@aol.com"],
    ["test@msn.con", "test@msn.com"],
    ["test@protonmail.comm", "test@protonmail.com"],
  ])("a provider's name with a mistyped suffix: %s → %s", (typed, suggested) => {
    expect(suggestEmailCorrection(typed)).toBe(suggested)
  })

  it.each([
    ["test@gmial.com", "test@gmail.com"],
    ["test@gamil.com", "test@gmail.com"],
    ["test@gmai.com", "test@gmail.com"],
    ["test@gmaill.com", "test@gmail.com"],
    ["test@yahooo.com", "test@yahoo.com"],
    ["test@yaho.com", "test@yahoo.com"],
    ["test@hotmal.com", "test@hotmail.com"],
    ["test@outlok.com", "test@outlook.com"],
    ["test@icluod.com", "test@icloud.com"],
  ])("a provider's name mistyped at .com: %s → %s", (typed, suggested) => {
    expect(suggestEmailCorrection(typed)).toBe(suggested)
  })

  it.each([
    "test@gmail.com",
    "test@yahoo.com",
    "test@outlook.com",
    "test@hotmail.com",
    "test@icloud.com",
    "test@aol.com",
    "a+b@gmail.com",
    "name@mycompany.health",
    "name@university.edu",
    "name@gmail.net",
    "name@yahoo.org",
    "name@example.org",
  ])("leaves a provider's own address and an unknown domain alone: %s", (address) => {
    expect(suggestEmailCorrection(address)).toBeNull()
  })

  it.each(["test@yahoo.fr", "test@yahoo.ca", "test@hotmail.es", "test@outlook.de", "test@aol.co.uk", "test@yahoo.co.uk", "test@hotmail.co"])(
    "never flags a regional provider's two-letter or multi-label suffix: %s",
    (address) => {
      expect(suggestEmailCorrection(address)).toBeNull()
    },
  )

  it.each(["test@email.com", "test@cloud.com", "test@mail.com", "test@gmx.com", "test@ymail.com", "test@lives.com", "test@aon.com", "test@msu.com"])(
    "keeps a real neighbour of a provider valid: %s",
    (address) => {
      expect(suggestEmailCorrection(address)).toBeNull()
    },
  )

  it.each(["test@mail.gmail.cnn", "test@sub.mycompany.health", "test@gmail.cnn.example", "test@gmial.co"])(
    "checks only two-label domains, and one kind of typo at a time: %s",
    (address) => {
      expect(suggestEmailCorrection(address)).toBeNull()
    },
  )

  it("lower-cases the domain and keeps the local part as typed (case, plus-addressing, surrounding spaces trimmed)", () => {
    expect(suggestEmailCorrection("TEST@GMAIL.CNN")).toBe("TEST@gmail.com")
    expect(suggestEmailCorrection("TEST@GMAIL.COM")).toBeNull()
    expect(suggestEmailCorrection(" a+b@Gmail.Cdm ")).toBe("a+b@gmail.com")
    expect(suggestEmailCorrection("first.last+tag@gmial.com")).toBe("first.last+tag@gmail.com")
  })

  it("reads the domain after the last @", () => {
    expect(suggestEmailCorrection('"a@b"@gmail.cnn')).toBe('"a@b"@gmail.com')
  })

  it.each(["", "   ", "test", "@gmail.cnn", "test@", "test@.com", "test@gmail"])("gives null for what isn't an address: %j", (value) => {
    expect(suggestEmailCorrection(value)).toBeNull()
  })
})

describe("editDistance", () => {
  it.each([
    ["", "", 0],
    ["com", "", 3],
    ["", "com", 3],
    ["com", "com", 0],
    ["cdm", "com", 1],
    ["cnn", "com", 2],
    ["cmo", "com", 1],
    ["gmial", "gmail", 1],
    ["net", "com", 3],
    ["kitten", "sitting", 3],
  ])("%j → %j is %i", (a, b, distance) => {
    expect(editDistance(a, b)).toBe(distance)
  })
})
