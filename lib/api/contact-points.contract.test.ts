import { http, HttpResponse } from "msw"
import { describe, expect, expectTypeOf, it } from "vitest"
import { server } from "@/test/msw-server"
import {
  CONTACT_POINT_TYPES,
  contactPointsPath,
  findPrimary,
  isContactPointType,
  keys,
  loadContactPoints,
  PRIMARY_LABEL,
  primaryPhoneRegion,
  toContactPoints,
  type ContactPoint,
  type ContactPointType,
} from "."

/**
 * CONSUMER CONTRACT, owned by Team B (spec F7-1). The Contact Points read API
 * (`lib/api/contact-points.ts`, shared with Team A's Contacts and the header)
 * as Stories 7.4 (Primary phone region) and 7.6 (the Primary email and phone
 * pickers) use it. Frozen: a change that breaks a line here fails in the PR
 * that makes it; agree it with Team B, then Team B updates this file. The
 * module's own tests stay in `contact-points.test.ts`.
 */

const row = (overrides: Partial<ContactPoint> = {}): ContactPoint => ({
  id: 1,
  name: null,
  value: "+14155552671",
  type: "Mobile",
  label: "Primary",
  isVerified: true,
  isNotificationEnabled: true,
  phoneNumberRegion: "US",
  ...overrides,
})

describe("Contact Points read API (contract for 7.4 / 7.6)", () => {
  it("ContactPoint has exactly these nullable fields", () => {
    expectTypeOf<ContactPoint>().toEqualTypeOf<{
      readonly id: number | null
      readonly name: string | null
      readonly value: string | null
      readonly type: string | null
      readonly label: string | null
      readonly isVerified: boolean | null
      readonly isNotificationEnabled: boolean | null
      readonly phoneNumberRegion: string | null
    }>()
  })

  it("the four types, the Primary label, the type guard", () => {
    expect(CONTACT_POINT_TYPES).toEqual(["Email", "Mobile", "Landline", "Social Media"])
    expectTypeOf<ContactPointType>().toEqualTypeOf<"Email" | "Mobile" | "Landline" | "Social Media">()
    expect(PRIMARY_LABEL).toBe("Primary")
    expect(isContactPointType("Mobile")).toBe(true)
    expect(isContactPointType("Fax")).toBe(false)
  })

  it("one SWR key and one proxy path per type (shared with Contacts and the header)", () => {
    expect(keys.contactPoints("Email")).toEqual(["pp", "contact-points", "Email"])
    expect(keys.contactPoints("Mobile")).toEqual(["pp", "contact-points", "Mobile"])
    expect(contactPointsPath("Email")).toBe("/api/1h/v2/user/contact-point/list?type=Email")
    expect(contactPointsPath("Social Media")).toBe("/api/1h/v2/user/contact-point/list?type=Social%20Media")
  })

  it("toContactPoints maps every field, missing ones to null; a non-list is null", () => {
    expect(toContactPoints([{ id: 3, value: "ann@example.com", type: "Email", label: "Primary", isVerified: false }])).toEqual([
      { id: 3, name: null, value: "ann@example.com", type: "Email", label: "Primary", isVerified: false, isNotificationEnabled: null, phoneNumberRegion: null },
    ])
    expect(toContactPoints([])).toEqual([])
    expect(toContactPoints({ content: [] })).toBeNull()
    expect(toContactPoints([{ id: "x" }])).toBeNull()
  })

  it("findPrimary: the row labelled Primary with a value", () => {
    const primary = row({ id: 2 })
    expect(findPrimary([row({ id: 1, label: "Old" }), primary])).toBe(primary)
    expect(findPrimary([row({ label: "Primary", value: "" })])).toBeUndefined()
    expect(findPrimary(undefined)).toBeUndefined()
  })

  it("primaryPhoneRegion: the Primary Mobile's region, else the row equal to myself.phoneNumber, else \"us\"; lower case", () => {
    expect(primaryPhoneRegion([row({ phoneNumberRegion: "GB" })], { phoneNumber: "+14155552671" })).toBe("gb")
    expect(primaryPhoneRegion([row({ label: "Old", value: "+44 20 7183 8750", phoneNumberRegion: "GB" })], { phoneNumber: "+442071838750" })).toBe("gb")
    expect(primaryPhoneRegion([row({ type: "Landline", phoneNumberRegion: "GB" })], { phoneNumber: "+14155552671" })).toBe("us")
    expect(primaryPhoneRegion([row({ phoneNumberRegion: null })], { phoneNumber: null })).toBe("us")
    expect(primaryPhoneRegion(undefined, undefined)).toBe("us")
  })

  it("loadContactPoints(type) reads GET /api/1h/v2/user/contact-point/list?type=<type> into domain rows", async () => {
    let seen = ""
    server.use(
      http.get("/api/1h/v2/user/contact-point/list", ({ request }) => {
        seen = new URL(request.url).search
        return HttpResponse.json([{ id: 9, value: "ann.work@example.com", type: "Email", label: "Work", isVerified: true }])
      }),
    )
    const rows = await loadContactPoints("Email")
    expect(seen).toBe("?type=Email")
    expect(rows).toEqual([expect.objectContaining({ id: 9, value: "ann.work@example.com", isVerified: true, phoneNumberRegion: null })])
  })
})
