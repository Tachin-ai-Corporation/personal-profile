import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import { server } from "@/test/msw-server"
import { fetchers, fetchMyself, isProctor, isTenantMember, keys, myselfPath, swrFetcher, toMyself, type Myself } from "."

const MYSELF = "/api/1h/v2/user/myself"

/** A backend `UserDTO` with every mapped field set. */
const FULL = {
  id: 7,
  personId: 70,
  username: "ann.lee",
  firstName: "Ann",
  middleName: "n/a",
  lastName: "Lee",
  namePrefix: "Dr.",
  nameSuffix: "Jr.",
  otherNames: "Annie",
  titles: "n/a",
  birthDate: "1990-02-28",
  cityOfBirth: "Sofia",
  race: "Asian",
  ethnicity: "Unknown",
  biologicalGender: "Female",
  genderIdentity: "Female",
  sexualOrientation: "n/a",
  socialSecurityNumber: "***-**-6789",
  signature: { id: 99, name: "signature.png" },
  email: "ann@example.com",
  phoneNumber: "+14155552125",
  roles: ["Patient", "Proctor"],
  preferredLanguage: "en",
  timeZone: "America/New_York",
  locale: "en-US",
  tenants: [
    { id: 1, name: "1health" },
    { id: 2, name: null },
  ],
  mfaEnabled: true,
  totpEnabled: false,
  // Wire-only fields are dropped.
  keycloakId: "k",
  isMta: false,
  acceptedTerms: true,
}

const EMPTY: Myself = {
  id: 3,
  personId: null,
  username: null,
  firstName: null,
  middleName: null,
  lastName: null,
  namePrefix: null,
  nameSuffix: null,
  otherNames: null,
  titles: null,
  birthDate: null,
  cityOfBirth: null,
  race: null,
  ethnicity: null,
  biologicalGender: null,
  genderIdentity: null,
  sexualOrientation: null,
  socialSecurityNumber: null,
  signature: null,
  email: null,
  phoneNumber: null,
  roles: null,
  preferredLanguage: null,
  timeZone: null,
  locale: null,
  tenants: null,
  mfaEnabled: null,
  totpEnabled: null,
}

describe("toMyself", () => {
  it("maps every field Epics 2, 7, 8, 9 and 10 need, keeping n/a values", () => {
    const mapped = Object.fromEntries(Object.entries(FULL).filter(([key]) => key in EMPTY))
    expect(toMyself(FULL)).toEqual(mapped)
    expect(Object.keys(mapped)).toHaveLength(Object.keys(EMPTY).length)
  })

  it("keeps nulls and absent fields as null (birth date withheld)", () => {
    expect(toMyself({ id: 3 })).toEqual(EMPTY)
    expect(toMyself({ ...Object.fromEntries(Object.keys(EMPTY).map((key) => [key, null])), id: 3 })).toEqual(EMPTY)
  })

  it("drops an unusable birth date, signature or tenant", () => {
    expect(toMyself({ id: 3, birthDate: "1990-02-30" })?.birthDate).toBeNull()
    expect(toMyself({ id: 3, birthDate: "" })?.birthDate).toBeNull()
    expect(toMyself({ id: 3, signature: {} })?.signature).toBeNull()
    expect(toMyself({ id: 3, signature: { id: 4 } })?.signature).toEqual({ id: 4, name: null })
    expect(toMyself({ id: 3, tenants: [{ name: "x" }, { id: 5, name: "y" }] })?.tenants).toEqual([{ id: 5, name: "y" }])
    expect(toMyself({ id: 3, tenants: [] })?.tenants).toEqual([])
  })

  it.each<[string, Record<string, unknown>, Partial<Myself>]>([
    ["a non-boolean mfaEnabled", { mfaEnabled: "yes" }, { mfaEnabled: null }],
    ["a non-boolean totpEnabled", { totpEnabled: 1 }, { totpEnabled: null }],
    ["a null inside tenants", { tenants: [null, { id: 2, name: "b" }] }, { tenants: [{ id: 2, name: "b" }] }],
    ["a tenant id as a string", { tenants: [{ id: "2", name: "b" }] }, { tenants: [] }],
    ["tenants as an object", { tenants: { id: 2 } }, { tenants: null }],
    ["a non-string role", { roles: ["Patient", 7, null, "Proctor"] }, { roles: ["Patient", "Proctor"] }],
    ["roles as a string", { roles: "Patient" }, { roles: null }],
    ["a string signature id", { signature: { id: "9", name: "s" } }, { signature: null }],
    ["a signature list", { signature: [{ id: 9 }] }, { signature: null }],
    ["a non-integer personId", { personId: 2.5 }, { personId: null }],
    ["a numeric firstName", { firstName: 5 }, { firstName: null }],
    ["a non-string tenant name", { tenants: [{ id: 2, name: 3 }] }, { tenants: [{ id: 2, name: null }] }],
  ])("degrades %s to null and keeps the user", (_label, field, expected) => {
    expect(toMyself({ ...FULL, ...field })).toMatchObject({ id: 7, email: "ann@example.com", ...expected })
  })

  it.each([null, "x", [], 5, { personId: 2 }, { id: "1" }, { id: 1.5 }, { id: null }])("rejects %j (no integer id)", (raw) => {
    expect(toMyself(raw)).toBeNull()
  })
})

describe("isProctor / isTenantMember", () => {
  it("is a Proctor only with the exact role", () => {
    expect(isProctor(["Patient", "Proctor"])).toBe(true)
    expect(isProctor(["proctor", "Proctor Admin"])).toBe(false)
    expect(isProctor([])).toBe(false)
    expect(isProctor(null)).toBe(false)
  })

  it("checks membership in myself.tenants only", () => {
    expect(isTenantMember({ tenants: [{ id: 1, name: null }, { id: 5, name: "x" }] }, 5)).toBe(true)
    expect(isTenantMember({ tenants: [{ id: 1, name: null }] }, 5)).toBe(false)
    expect(isTenantMember({ tenants: null }, 5)).toBe(false)
  })
})

describe("fetchMyself", () => {
  it("returns the domain type, the error, or a shape error", async () => {
    expect(myselfPath()).toBe(MYSELF)
    server.use(http.get(MYSELF, () => HttpResponse.json(FULL)))
    expect((await fetchMyself()).data).toMatchObject({ firstName: "Ann", tenants: [{ id: 1 }, { id: 2 }] })
    server.use(http.get(MYSELF, () => HttpResponse.json({ errorCode: "UPSTREAM_ERROR", source: "proxy" }, { status: 502 })))
    expect(await fetchMyself()).toMatchObject({ success: false, errorCode: "UPSTREAM_ERROR", data: undefined })
    server.use(http.get(MYSELF, () => HttpResponse.json({ nope: true })))
    expect(await fetchMyself()).toMatchObject({ success: false, statusCode: 200, error: "myself/fetchMyself returned an unexpected shape" })
  })

  it("is registered for keys.myself() and exposed as fetchers.myself", async () => {
    server.use(http.get(MYSELF, () => HttpResponse.json({ id: 1, personId: 2 })))
    expect(await swrFetcher(keys.myself())).toMatchObject({ id: 1 })
    expect(await fetchers.myself()).toMatchObject({ personId: 2 })
  })
})
