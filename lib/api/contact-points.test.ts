import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import { server } from "@/test/msw-server"
import {
  ApiResponseError,
  CONTACT_POINT_TYPES,
  endpoints,
  fetchContactPoints,
  fetchers,
  findPrimary,
  isContactPointType,
  keys,
  swrFetcher,
  toContactPoints,
  type ContactPoint,
} from "."

const LIST = "/api/1h/v2/user/contact-point/list"

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

describe("contact-point keys and endpoints (Story 1.9)", () => {
  it("has exactly one key per Contact Type, no combined key", () => {
    expect(keys.contactPoints("Mobile")).toEqual(["pp", "contact-points", "Mobile"])
    expect(keys.contactPoints("Landline")).toEqual(["pp", "contact-points", "Landline"])
    expect(keys.contactPoints("Email")).toEqual(["pp", "contact-points", "Email"])
    expect(CONTACT_POINT_TYPES).toEqual(["Email", "Mobile", "Landline"])
    expect(endpoints.contactPoints("Landline")).toBe(`${LIST}?type=Landline`)
  })

  it("recognises only the allowlisted types", () => {
    expect(isContactPointType("Email")).toBe(true)
    expect(isContactPointType("Phone")).toBe(false)
    expect(isContactPointType(3)).toBe(false)
  })
})

describe("toContactPoints", () => {
  it("maps every nullable DTO field, defaulting to null", () => {
    expect(toContactPoints([{ id: 7, value: "a@b.co", type: "Email", label: "Primary", isVerified: false }, {}])).toEqual([
      row({ id: 7, value: "a@b.co", type: "Email", isVerified: false, isNotificationEnabled: null, phoneNumberRegion: null }),
      { id: null, name: null, value: null, type: null, label: null, isVerified: null, isNotificationEnabled: null, phoneNumberRegion: null },
    ])
    expect(toContactPoints([{ id: 1, name: "n", isNotificationEnabled: false, phoneNumberRegion: "CA" }])?.[0]).toMatchObject({
      name: "n",
      isNotificationEnabled: false,
      phoneNumberRegion: "CA",
    })
  })

  it("rejects a body that is not a list of Contact Points", () => {
    expect(toContactPoints({ id: 1 })).toBeNull()
    expect(toContactPoints([{ id: "1" }])).toBeNull()
  })
})

describe("findPrimary", () => {
  it("returns the row labelled Primary that has a value", () => {
    const primary = row({ id: 2 })
    expect(findPrimary([row({ id: 1, label: "Old" }), primary])).toBe(primary)
    expect(findPrimary([row({ value: null })])).toBeUndefined()
    expect(findPrimary([row({ value: "" })])).toBeUndefined()
    expect(findPrimary(undefined)).toBeUndefined()
  })
})

describe("fetchContactPoints", () => {
  it("sends one GET per type and returns typed rows", async () => {
    const types: (string | null)[] = []
    server.use(
      http.get(LIST, ({ request }) => {
        types.push(new URL(request.url).searchParams.get("type"))
        return HttpResponse.json([{ id: 1, value: "x@y.co", type: "Email", label: "Primary", isVerified: true }])
      }),
    )
    expect((await fetchContactPoints("Email")).data?.[0]).toMatchObject({ value: "x@y.co", label: "Primary" })
    expect(types).toEqual(["Email"])
  })

  it("returns the error, or a shape error", async () => {
    server.use(http.get(LIST, () => HttpResponse.json({ errorCode: "UPSTREAM_ERROR", source: "proxy" }, { status: 502 })))
    expect(await fetchContactPoints("Mobile")).toMatchObject({ success: false, errorCode: "UPSTREAM_ERROR", data: undefined })
    server.use(http.get(LIST, () => HttpResponse.json({ nope: true })))
    expect(await fetchContactPoints("Mobile")).toMatchObject({ success: false, statusCode: 200 })
  })

  it("is reachable through the root SWR fetcher by key", async () => {
    server.use(http.get(LIST, () => HttpResponse.json([{ id: 3, value: "+1", label: "Primary" }])))
    expect(await swrFetcher(keys.contactPoints("Landline"))).toMatchObject([{ id: 3 }])
    expect(await fetchers.contactPoints("Mobile")).toMatchObject([{ id: 3 }])
    await expect(swrFetcher(["pp", "contact-points", "Phone"])).rejects.toBeInstanceOf(ApiResponseError)
    await expect(swrFetcher(["pp", "contact-points"])).rejects.toThrow("Unknown contact type undefined")
  })
})
