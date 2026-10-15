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
 * pickers) use it. Only what Team B reads is frozen (the fields `id`,
 * `value`, `type`, `label`, `isVerified`, `phoneNumberRegion`; the Email,
 * Mobile and Landline types), so additive changes (a new field or type) pass;
 * a change that breaks a line here fails in the PR that makes it: agree it
 * with Team B, then Team B updates this file. The module's own tests stay in
 * `contact-points.test.ts`.
 */

/** The fields Stories 7.4 / 7.6 and the header read. */
interface UsedContactPoint {
  readonly id: number | null
  readonly value: string | null
  readonly type: string | null
  readonly label: string | null
  readonly isVerified: boolean | null
  readonly phoneNumberRegion: string | null
}

const row = (overrides: Partial<UsedContactPoint> = {}): ContactPoint =>
  ({ id: 1, value: "+14155552671", type: "Mobile", label: "Primary", isVerified: true, phoneNumberRegion: "US", ...overrides }) as ContactPoint

describe("Contact Points read API (contract for 7.4 / 7.6)", () => {
  it("ContactPoint has at least the fields Team B reads, with these types", () => {
    expectTypeOf<ContactPoint>().toExtend<UsedContactPoint>()
    expectTypeOf<ContactPoint["value"]>().toEqualTypeOf<string | null>()
    expectTypeOf<ContactPoint["phoneNumberRegion"]>().toEqualTypeOf<string | null>()
  })

  it("the types Team B reads, the Primary label, the type guard", () => {
    expect(CONTACT_POINT_TYPES).toEqual(expect.arrayContaining(["Email", "Mobile", "Landline"]))
    expectTypeOf<"Email" | "Mobile" | "Landline">().toExtend<ContactPointType>()
    expect(PRIMARY_LABEL).toBe("Primary")
    expect(isContactPointType("Mobile")).toBe(true)
    expect(isContactPointType("Fax")).toBe(false)
  })

  it("one SWR key and one proxy path per type (shared with Contacts and the header)", () => {
    expect(keys.contactPoints("Email")).toEqual(["pp", "contact-points", "Email"])
    expect(keys.contactPoints("Mobile")).toEqual(["pp", "contact-points", "Mobile"])
    expect(contactPointsPath("Email")).toBe("/api/1h/v2/user/contact-point/list?type=Email")
    expect(contactPointsPath("Mobile")).toBe("/api/1h/v2/user/contact-point/list?type=Mobile")
  })

  it("toContactPoints maps the used fields, missing ones to null; a non-list is null", () => {
    expect(toContactPoints([{ id: 3, value: "ann@example.com", type: "Email", label: "Primary", isVerified: false }])).toEqual([
      expect.objectContaining({ id: 3, value: "ann@example.com", type: "Email", label: "Primary", isVerified: false, phoneNumberRegion: null }),
    ])
    expect(toContactPoints([{ value: "+442071838750", phoneNumberRegion: "GB" }])).toEqual([
      expect.objectContaining({ id: null, value: "+442071838750", type: null, label: null, isVerified: null, phoneNumberRegion: "GB" }),
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
