import { describe, expect, it } from "vitest"
import type { ContactPoint } from "@/lib/api"
import {
  isSocialFull,
  isSocialLink,
  isSocialRowChanged,
  isSocialRowLocked,
  newSocialEditRow,
  SOCIAL_LIMIT,
  socialCount,
  socialDraftDiff,
  socialDraftRows,
  socialEditRowOf,
  socialSchema,
  type SocialEditRow,
} from "./social-schema"

/**
 * Story 3.7 (NG-9025): `socialSchema` and the Social media edit helpers.
 * Covers the "Invalid" and "Limit" rows of the I/O matrix in
 * `spec-3-7-manage-social-media-links.md`.
 */

function point(overrides: Partial<ContactPoint> = {}): ContactPoint {
  return { id: 51, name: null, value: "https://x.com/ann", type: "Social Media", label: "Personal", isVerified: null, isNotificationEnabled: false, phoneNumberRegion: null, ...overrides }
}

const saved = (overrides: Partial<ContactPoint> = {}): SocialEditRow => socialEditRowOf(`id-${overrides.id ?? 51}`, point(overrides))

const added = (value = "https://linkedin.com/in/ann", key = "new-1"): SocialEditRow => ({ ...newSocialEditRow(key), value })

/** The issues of `rows` as `path: message`. */
function issues(rows: readonly SocialEditRow[]): string[] {
  const result = socialSchema.safeParse({ rows })
  return result.success ? [] : result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
}

const many = (count: number, start: number, removed = false): SocialEditRow[] =>
  Array.from({ length: count }, (_, index) => ({ ...saved({ id: start + index, value: `https://example.com/u${start + index}` }), removed }))

describe("isSocialLink", () => {
  it.each([
    "https://x.com/ann",
    " https://linkedin.com/in/ann ",
    "https://www.example.co.uk/path?q=1#top",
    "https://sub.domain.example.org",
    // The QA cases: http and https, with or without www, a trailing slash, a query string.
    "https://www.linkedin.com/in/someone",
    "https://linkedin.com/in/someone",
    "https://www.linkedin.com/in/someone/",
    "https://www.linkedin.com/in/someone?trk=profile&lang=en",
    "http://www.linkedin.com/in/someone",
    "http://linkedin.com/in/someone/",
    "http://linkedin.com/in/someone?trk=profile",
  ])(
    "accepts %s",
    (value) => {
      expect(isSocialLink(value)).toBe(true)
    },
  )

  it.each([
    ["a handle", "@ann"],
    ["javascript", "javascript:alert(1)"],
    ["an upper-case scheme", "HTTPS://x.com"],
    ["an upper-case http scheme", "HTTP://x.com"],
    ["no scheme", "x.com/ann"],
    ["no scheme, with www", "www.linkedin.com/in/someone"],
    ["a scheme without slashes", "https:linkedin.com/in/someone"],
    ["a doubled scheme", "https://https://linkedin.com/in/someone"],
    ["garbage", "not a link"],
    ["punctuation only", "://"],
    ["a host without a dot", "https://localhost/ann"],
    ["a one-letter top-level label", "https://x.c"],
    ["a numeric top-level label", "https://10.0.0.1"],
    ["a trailing dot", "https://x.com."],
    ["whitespace inside", "https://x.com/ann lee"],
    ["only the scheme", "https://"],
    ["empty", ""],
    ["ftp", "ftp://x.com"],
    ["a user name", "https://user@x.com/a"],
    ["credentials that read like another host", "https://x.com@evil.example"],
    ["a password", "https://:secret@x.com/a"],
  ])("rejects %s", (_case, value) => {
    expect(isSocialLink(value)).toBe(false)
  })
})

describe("socialSchema: links", () => {
  it("accepts a valid new row (padded with spaces) and every unchanged saved row, a legacy handle included", () => {
    expect(issues([saved(), saved({ id: 52, value: "@ann" }), added(" https://linkedin.com/in/ann ")])).toEqual([])
  })

  it.each([
    ["empty", ""],
    ["only spaces", "   "],
  ])("%s reads \"Enter a link\"", (_case, value) => {
    expect(issues([added(value)])).toEqual(["rows.0.value: Enter a link"])
  })

  it.each([
    ["no scheme", "www.linkedin.com/in/someone"],
    ["javascript", "javascript:alert(1)"],
    ["a handle", "@ann"],
    ["no dot", "https://x"],
    ["garbage", "not a link"],
  ])("%s reads \"Enter a link that starts with http:// or https://\"", (_case, value) => {
    expect(issues([added(value)])).toEqual(["rows.0.value: Enter a link that starts with http:// or https://"])
  })

  it("an http link is a valid new row", () => {
    expect(issues([added("http://www.linkedin.com/in/someone/")])).toEqual([])
  })

  it("checks a saved link once it changed: emptied, invalid, then valid", () => {
    expect(issues([{ ...saved(), value: "" }])).toEqual(["rows.0.value: Enter a link"])
    expect(issues([{ ...saved(), value: "x.com/ann" }])).toEqual(["rows.0.value: Enter a link that starts with http:// or https://"])
    expect(issues([{ ...saved(), value: "https://x.com/ann2" }])).toEqual([])
  })

  it("never checks a struck-through or locked row", () => {
    expect(issues([{ ...saved(), value: "", removed: true }])).toEqual([])
    expect(issues([{ ...saved({ label: "Primary", value: "@ann" }), value: "" }])).toEqual([])
    expect(issues([{ ...saved({ id: null }), value: "" }])).toEqual([])
  })

  it("a duplicate (trimmed, case-insensitive) of a saved, struck-through or new row reads \"This link is already on your profile\"", () => {
    expect(issues([saved(), added("https://X.COM/Ann")])).toEqual([
      "rows.1.value: This link is already on your profile",
    ])
    expect(issues([{ ...saved(), removed: true }, added(" https://X.com/ANN ")])).toEqual(["rows.1.value: This link is already on your profile"])
    expect(issues([added("https://a.example/x", "new-1"), added("https://A.example/x", "new-2")])).toEqual([
      "rows.0.value: This link is already on your profile",
      "rows.1.value: This link is already on your profile",
    ])
    // A saved link changed to another saved link's value.
    expect(issues([{ ...saved(), value: "https://b.example/ann" }, saved({ id: 52, value: "https://b.example/ann" })])).toEqual([
      "rows.0.value: This link is already on your profile",
    ])
  })

  it("a link with credentials reads \"Enter a link that starts with http:// or https://\"", () => {
    expect(issues([added("https://x.com@evil.example")])).toEqual(["rows.0.value: Enter a link that starts with http:// or https://"])
  })

  it("a saved link edited, then struck through, is compared by its saved link", () => {
    const struck = { ...saved(), value: "https://edited.example/ann", removed: true }
    expect(issues([struck, added("https://X.com/ann")])).toEqual(["rows.1.value: This link is already on your profile"])
    expect(issues([struck, added("https://edited.example/ann")])).toEqual([])
  })

  it("an invalid value reads its own error before a duplicate", () => {
    expect(issues([saved({ value: "@ann" }), added("@ann")])).toEqual(["rows.1.value: Enter a link that starts with http:// or https://"])
  })
})

describe("socialSchema: the limit of 20", () => {
  it("a new row past 20 (saved rows not struck through first) reads the limit; 20 is fine", () => {
    expect(issues([...many(19, 100), added()])).toEqual([])
    expect(issues([...many(20, 100), added()])).toEqual(["rows.20.value: You've reached the limit of 20 links"])
    expect(issues([...many(19, 100), added("https://a.example/1", "new-1"), added("https://a.example/2", "new-2")])).toEqual([
      "rows.20.value: You've reached the limit of 20 links",
    ])
  })

  it("struck-through rows free their place", () => {
    expect(issues([...many(19, 100), ...many(1, 200, true), added()])).toEqual([])
  })

  it("counts saved rows not struck through and new rows", () => {
    const rows = [...many(18, 100), ...many(1, 200, true), added()]
    expect(socialCount(rows)).toBe(19)
    expect(isSocialFull(rows)).toBe(false)
    expect(isSocialFull([...rows, added("https://a.example/2", "new-2")])).toBe(true)
    expect(SOCIAL_LIMIT).toBe(20)
  })
})

describe("social edit rows", () => {
  it("a saved link keeps its value as saved; a missing value or label reads as empty", () => {
    expect(saved({ label: "Work" })).toEqual({ key: "id-51", id: 51, isNew: false, label: "Work", value: "https://x.com/ann", savedValue: "https://x.com/ann", removed: false })
    expect(socialEditRowOf("k", point({ value: null, label: null }))).toMatchObject({ label: "", value: "", savedValue: "" })
    expect(newSocialEditRow("new-3")).toEqual({ key: "new-3", id: null, isNew: true, label: "", value: "", savedValue: "", removed: false })
  })

  it("locks a legacy Primary and a row without an id; a new row never", () => {
    expect(isSocialRowLocked(saved({ label: "Primary" }))).toBe(true)
    expect(isSocialRowLocked(saved({ id: null }))).toBe(true)
    expect(isSocialRowLocked(saved())).toBe(false)
    expect(isSocialRowLocked(added())).toBe(false)
  })

  it("a row is changed when new, or saved, editable, not struck through and its trimmed value differs", () => {
    expect(isSocialRowChanged(added())).toBe(true)
    expect(isSocialRowChanged(saved())).toBe(false)
    expect(isSocialRowChanged({ ...saved(), value: " https://x.com/ann " })).toBe(false)
    expect(isSocialRowChanged({ ...saved(), value: "https://x.com/ann2" })).toBe(true)
    expect(isSocialRowChanged({ ...saved(), value: "https://x.com/ann2", removed: true })).toBe(false)
    expect(isSocialRowChanged({ ...saved({ label: "Primary" }), value: "https://x.com/ann2" })).toBe(false)
  })

  it("reads draft rows, and anything malformed as none", () => {
    expect(socialDraftRows([saved()])).toEqual([saved()])
    expect(socialDraftRows([{ key: "x" }])).toEqual([])
    expect(socialDraftRows("nope")).toEqual([])
  })
})

describe("socialDraftDiff", () => {
  it("one row per link whose stored row differs, named by its saved link (a new row: its link)", () => {
    const current = { rows: [saved(), saved({ id: 52, value: "https://b.example/ann" }), saved({ id: 53, value: "https://c.example/ann" })] }
    const draft = {
      rows: [
        { ...saved(), value: "https://x.com/ann2" },
        { ...saved({ id: 52, value: "https://b.example/ann" }), removed: true },
        saved({ id: 53, value: "https://c.example/ann" }),
        added(" https://d.example/ann "),
      ],
    }
    expect(socialDraftDiff(draft, current)).toEqual([
      { field: "rows.id-51", label: "https://x.com/ann", mine: "https://x.com/ann2", current: "https://x.com/ann" },
      { field: "rows.id-52", label: "https://b.example/ann", mine: "https://b.example/ann · Removed on save", current: "https://b.example/ann" },
      { field: "rows.new-1", label: "https://d.example/ann", mine: "https://d.example/ann · New · not saved", current: "" },
    ])
  })

  it("a link gone from the current rows, and malformed values, read as empty", () => {
    expect(socialDraftDiff({ rows: [saved()] }, { rows: [] })).toEqual([{ field: "rows.id-51", label: "https://x.com/ann", mine: "https://x.com/ann", current: "" }])
    expect(socialDraftDiff({ rows: "x" }, { rows: [saved()] })).toEqual([{ field: "rows.id-51", label: "https://x.com/ann", mine: "", current: "https://x.com/ann" }])
    expect(socialDraftDiff({ rows: [saved()] }, { rows: [saved()] })).toEqual([])
  })
})
