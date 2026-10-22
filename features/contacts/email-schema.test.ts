import { describe, expect, it } from "vitest"
import type { ContactPoint } from "@/lib/api"
import {
  EMAIL_LIMIT,
  EMAIL_MAX_LENGTH,
  emailCount,
  emailDraftDiff,
  emailDraftRows,
  emailEditRowOf,
  emailSchema,
  isEmailAddress,
  isEmailFull,
  newEmailEditRow,
  type EmailEditRow,
} from "./email-schema"

/**
 * Stories 3.5–3.6 (NG-9024): `emailSchema` and the Email edit helpers. Covers the
 * "Invalid" and "Limit" rows of the I/O matrix in
 * `spec-3-5-view-add-relabel-and-remove-emails.md` and the edit rows'
 * notifications of spec 3.6.
 */

function point(overrides: Partial<ContactPoint> = {}): ContactPoint {
  return { id: 41, name: null, value: "ann@x.com", type: "Email", label: "Work", isVerified: false, isNotificationEnabled: false, phoneNumberRegion: null, ...overrides }
}

const saved = (overrides: Partial<ContactPoint> = {}): EmailEditRow => emailEditRowOf(`id-${overrides.id ?? 41}`, point(overrides))

const added = (overrides: Partial<EmailEditRow> = {}): EmailEditRow => ({ ...newEmailEditRow("new-1"), value: "new@example.com", label: "Personal", ...overrides })

/** The issues of `rows` as `path: message`. */
function issues(rows: readonly EmailEditRow[]): string[] {
  const result = emailSchema.safeParse({ rows })
  return result.success ? [] : result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
}

/** A valid-looking address of exactly `length` characters. */
const addressOf = (length: number): string => `${"a".repeat(64)}@${"b".repeat(length - 64 - 1 - 4)}.com`

const many = (count: number, start: number, removed = false): EmailEditRow[] =>
  Array.from({ length: count }, (_, index) => ({ ...saved({ id: start + index, value: `user${start + index}@example.com` }), removed }))

describe("emailSchema: addresses", () => {
  it("accepts a valid new row (padded with spaces) and every saved row as it is", () => {
    expect(issues([saved(), saved({ id: 42, value: "", label: null }), added({ value: " Ann@Work.example " })])).toEqual([])
  })

  it.each([
    ["an incomplete address", "ann@"],
    ["no @", "ann.example.com"],
    ["an empty address", ""],
    ["only spaces", "   "],
    ["a space inside", "ann lee@example.com"],
    ["an address over 254 characters", addressOf(EMAIL_MAX_LENGTH + 1)],
  ])("%s reads \"Enter a valid email address\" at the address", (_case, value) => {
    expect(issues([added({ value })])).toEqual(["rows.0.value: Enter a valid email address"])
  })

  it("254 characters is still valid; the length counts the trimmed value", () => {
    expect(addressOf(EMAIL_MAX_LENGTH)).toHaveLength(254)
    expect(isEmailAddress(addressOf(EMAIL_MAX_LENGTH))).toBe(true)
    expect(isEmailAddress(`  ${addressOf(EMAIL_MAX_LENGTH)}  `)).toBe(true)
    expect(isEmailAddress(addressOf(EMAIL_MAX_LENGTH + 1))).toBe(false)
  })

  it("an address equal (trimmed, any case) to any other row, saved, struck through or new, is a duplicate", () => {
    const duplicate = "rows.1.value: This email is already on your profile"
    expect(issues([saved({ value: "ann@x.com" }), added({ value: "ANN@x.com" })])).toEqual([duplicate])
    expect(issues([{ ...saved({ value: "ann@x.com" }), removed: true }, added({ value: " ANN@X.COM " })])).toEqual([duplicate])
    expect(issues([added({ value: "ann@x.com" }), added({ key: "new-2", value: "Ann@X.com" })])).toEqual(["rows.0.value: This email is already on your profile", duplicate])
  })

  it("an invalid address reads only its format error, never the duplicate", () => {
    expect(issues([saved({ value: "ann@" }), added({ value: "ann@" })])).toEqual(["rows.1.value: Enter a valid email address"])
  })
})

describe("emailSchema: provider typos (QA bug)", () => {
  it.each([
    ["test@gmail.cnn", "test@gmail.com"],
    ["test@gmail.cdm", "test@gmail.com"],
    ["test@gmial.com", "test@gmail.com"],
    ["test@yahoo.cmo", "test@yahoo.com"],
    ["TEST@GMAIL.CNN", "TEST@gmail.com"],
    [" a+b@gmail.cdm ", "a+b@gmail.com"],
  ])("%j reads \"Did you mean %s?\"", (value, suggestion) => {
    expect(issues([added({ value })])).toEqual([`rows.0.value: Did you mean ${suggestion}?`])
  })

  it.each(["test@gmail.com", "TEST@GMAIL.COM", "a+b@gmail.com", "name@mycompany.health", "name@university.edu", "name@mail.mycompany.health", "name@yahoo.fr", "name@email.com"])(
    "accepts %s",
    (value) => {
      expect(issues([added({ value })])).toEqual([])
    },
  )

  it("an invalid address reads its format error, never a suggestion; a typo is checked before the duplicate", () => {
    expect(issues([added({ value: "test@@gmail.cnn" })])).toEqual(["rows.0.value: Enter a valid email address"])
    expect(issues([saved({ value: "test@gmail.cnn" }), added({ value: "test@gmail.cnn" })])).toEqual(["rows.1.value: Did you mean test@gmail.com?"])
  })

  it("a saved address with a typo is never flagged (its address is locked)", () => {
    expect(issues([saved({ value: "test@gmail.cnn" })])).toEqual([])
  })
})

describe("emailSchema: label", () => {
  it("an empty Label reads \"Choose a label\"; Primary or an unknown label is never pickable", () => {
    for (const label of ["", "Primary", "Partnership Organization"]) expect(issues([added({ label })])).toEqual(["rows.0.label: Choose a label"])
    for (const label of ["Home", "Main", "Old", "Personal", "Mailing List", "Work"]) expect(issues([added({ label })])).toEqual([])
  })

  it("every rule of a row reports at once, in field order", () => {
    expect(issues([added({ value: "", label: "" })])).toEqual(["rows.0.value: Enter a valid email address", "rows.0.label: Choose a label"])
  })
})

describe("emailSchema: 20 emails", () => {
  it("a new row past the limit reads the limit at its address; saved rows count first, then new rows in order", () => {
    expect(issues([...many(EMAIL_LIMIT, 300), added()])).toEqual([`rows.${EMAIL_LIMIT}.value: You've reached the limit of 20 emails`])
    expect(issues([...many(19, 300), added(), added({ key: "new-2", value: "other@example.com" })])).toEqual(["rows.20.value: You've reached the limit of 20 emails"])
  })

  it("struck-through rows don't count", () => {
    expect(issues([...many(EMAIL_LIMIT, 300).map((row, index) => (index === 0 ? { ...row, removed: true } : row)), added()])).toEqual([])
  })
})

describe("email limit helpers", () => {
  it("counts saved rows not struck through and new rows", () => {
    expect(emailCount([saved({ id: 1 }), { ...saved({ id: 2 }), removed: true }, added()])).toBe(2)
  })

  it("is full at 20", () => {
    expect(isEmailFull(many(EMAIL_LIMIT, 300))).toBe(true)
    expect(isEmailFull(many(19, 300))).toBe(false)
    expect(isEmailFull([...many(19, 300), added()])).toBe(true)
    expect(isEmailFull(many(EMAIL_LIMIT, 300, true))).toBe(false)
  })
})

describe("email rows", () => {
  it("a saved email as an edit row: its id, label, value and notifications; never new or removed", () => {
    expect(emailEditRowOf("id-41", point())).toEqual({ key: "id-41", id: 41, isNew: false, label: "Work", value: "ann@x.com", removed: false, notifications: false })
    expect(emailEditRowOf("k", point({ id: null, label: null, value: null }))).toEqual({ key: "k", id: null, isNew: false, label: "", value: "", removed: false, notifications: false })
    expect(emailEditRowOf("k", point({ label: "Primary", isNotificationEnabled: true })).notifications).toBe(true)
    expect(emailEditRowOf("k", point({ isNotificationEnabled: null })).notifications).toBe(false)
  })

  it("a new row starts empty, notifications off", () => {
    expect(newEmailEditRow("new-3")).toEqual({ key: "new-3", id: null, isNew: true, label: "", value: "", removed: false, notifications: false })
  })
})

describe("email drafts", () => {
  it("reads a draft's rows, and nothing from a malformed one", () => {
    expect(emailDraftRows([added()])).toEqual([added()])
    for (const value of [undefined, null, "rows", [{ key: 1 }], {}]) expect(emailDraftRows(value)).toEqual([])
  })

  it("lists each email whose draft row differs, named by its address", () => {
    const work = saved({ id: 41, value: "ann@work.example", label: "Work" })
    const home = saved({ id: 43, value: "ann@home.example", label: "Home" })
    const draft = { rows: [{ ...work, label: "Main" }, { ...home, removed: true }, added({ value: " new@example.com " })] }
    const current = { rows: [work, home] }
    expect(emailDraftDiff(draft, current)).toEqual([
      { field: "rows.id-41", label: "ann@work.example", mine: "Main", current: "Work" },
      { field: "rows.id-43", label: "ann@home.example", mine: "Home · Removed on save", current: "Home" },
      { field: "rows.new-1", label: "new@example.com", mine: "Personal · New · not saved", current: "" },
    ])
    // An email the server dropped meanwhile shows with an empty draft side; equal rows don't show.
    expect(emailDraftDiff({ rows: [] }, current)).toEqual([
      { field: "rows.id-41", label: "ann@work.example", mine: "", current: "Work" },
      { field: "rows.id-43", label: "ann@home.example", mine: "", current: "Home" },
    ])
    expect(emailDraftDiff(current, current)).toEqual([])
    expect(emailDraftDiff({ rows: [newEmailEditRow("new-9")] }, { rows: [] })).toEqual([{ field: "rows.new-9", label: "", mine: "New · not saved", current: "" }])
  })

  it("includes the Primary's notifications (Story 3.6): a switched one differs; other rows never show theirs", () => {
    const primary = saved({ id: 42, value: "ann@example.com", label: "Primary", isNotificationEnabled: true })
    const work = saved({ id: 41, value: "ann@work.example", label: "Work" })
    const current = { rows: [primary, work] }
    expect(emailDraftDiff({ rows: [{ ...primary, notifications: false }, { ...work, notifications: true }] }, current)).toEqual([
      { field: "rows.id-42", label: "ann@example.com", mine: "Primary · Notifications off", current: "Primary · Notifications on" },
    ])
    // A draft row stored before Story 3.6 (no notifications) still parses, and reads as the current row's notifications.
    const legacy: EmailEditRow = { ...primary }
    delete legacy.notifications
    expect(emailDraftRows([legacy])).toEqual([legacy])
    expect(emailDraftDiff({ rows: [legacy, work] }, current)).toEqual([])
    expect(emailDraftDiff({ rows: [legacy] }, { rows: [] })).toEqual([{ field: "rows.id-42", label: "ann@example.com", mine: "Primary", current: "" }])
  })
})
