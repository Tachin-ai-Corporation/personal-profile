import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import { server } from "@/test/msw-server"
import { ApiResponseError, fetchTypeKey, isTypeKey, keys, loadTypeKey, swrFetcher, toTypeInfo, TYPE_KEYS, typeKeyPath, valueListOptions } from "."

/** A trimmed agents.md `TypeInfo` with the shapes 1health-fe reads. */
const PERSON = {
  id: 1,
  boKey: "Person",
  name: "Person",
  attributes: [
    {
      attrKey: "race",
      name: "Race",
      type: "VALUE_LIST",
      attributeValues: [
        { id: 3, name: "White" },
        { id: 1, name: "n/a" },
        { id: 2, name: "Asian" },
        { id: "x", name: "American Indian or Alaska Native" },
        { id: 4 },
        "junk",
      ],
    },
    { attrKey: "firstName", name: "First Name", type: "TEXT", attributeValues: [{ id: 9, name: "ignored" }] },
    { attrKey: "ethnicity", type: "VALUE_LIST" },
    { name: "no key", type: "VALUE_LIST", attributeValues: [] },
    null,
  ],
}

describe("type keys (spec F6-3; Stories 2.1, 3.1, 5.2)", () => {
  it("allows exactly the allowlisted types and builds their proxy paths", () => {
    expect(TYPE_KEYS).toEqual(["Person", "ContactPoint", "Insurance"])
    expect(isTypeKey("ContactPoint")).toBe(true)
    expect(isTypeKey("Organization")).toBe(false)
    expect(isTypeKey(1)).toBe(false)
    expect(typeKeyPath("Insurance")).toBe("/api/1h/v2/type/key/Insurance")
    expect(keys.typeKey("Person")).toEqual(["pp", "type-key", "Person"])
  })

  it("maps TypeInfo, dropping malformed attributes and values", () => {
    expect(toTypeInfo(PERSON)).toEqual({
      boKey: "Person",
      attributes: [
        {
          attrKey: "race",
          name: "Race",
          type: "VALUE_LIST",
          values: [
            { id: 3, name: "White" },
            { id: 1, name: "n/a" },
            { id: 2, name: "Asian" },
            { id: null, name: "American Indian or Alaska Native" },
          ],
        },
        { attrKey: "firstName", name: "First Name", type: "TEXT", values: [{ id: 9, name: "ignored" }] },
        { attrKey: "ethnicity", name: null, type: "VALUE_LIST", values: [] },
      ],
    })
    expect(toTypeInfo({})).toEqual({ boKey: null, attributes: [] })
    expect(toTypeInfo([])).toBeNull()
    expect(toTypeInfo(null)).toBeNull()
  })

  // A superset of 1health-fe's filtering (`useValueListOptions`: VALUE_LIST only, exact "n/a" dropped,
  // localeCompare sort): `isNotProvided` also drops "N/A" in any case, blank names and "-1", which the
  // platform uses for "no value" too (PM3), so a picker never offers a placeholder as a choice.
  it("valueListOptions: VALUE_LIST only, not-provided names dropped, locale-sorted (a superset of 1health-fe filtering)", () => {
    const info = toTypeInfo(PERSON)
    expect(valueListOptions(info, "race").map((value) => value.name)).toEqual(["American Indian or Alaska Native", "Asian", "White"])
    expect(valueListOptions(info, "firstName")).toEqual([])
    expect(valueListOptions(info, "ethnicity")).toEqual([])
    expect(valueListOptions(info, "missing")).toEqual([])
    expect(valueListOptions(undefined, "race")).toEqual([])
    expect(valueListOptions(null, "race")).toEqual([])
  })

  // Spec 5.2 decision 1A: Insurance precedence and relationship to insured are attributes of the
  // `InsuranceBelongsToPerson` relation (backend `RelationInfo.attributes`), not of the type itself.
  it("collects the relations' attributes (decision 1A of spec 5.2) and valueListOptions finds them after the type's own", () => {
    const insurance = toTypeInfo({
      boKey: "Insurance",
      attributes: [
        { attrKey: "insuranceType", type: "VALUE_LIST", attributeValues: [{ id: 1, name: "Medical" }, { id: 2, name: "n/a" }] },
        { attrKey: "label", type: "VALUE_LIST", attributeValues: [{ id: 3, name: "Active" }] },
      ],
      relationships: [
        { relKey: "InsuranceHasFrontSideCardFile", attributes: [] },
        {
          relKey: "InsuranceBelongsToPerson",
          attributes: [
            { attrKey: "insurancePrecedence", type: "VALUE_LIST", attributeValues: [{ id: 5, name: "Secondary" }, { id: 4, name: "Primary" }, { id: 6, name: "n/a" }] },
            { attrKey: "relationshipToInsured", name: "Relationship to insured", type: "VALUE_LIST", attributeValues: [{ id: 7, name: "Self" }, "junk"] },
            { attrKey: "label", type: "VALUE_LIST", attributeValues: [{ id: 8, name: "Relation label" }] },
            { name: "no key" },
          ],
        },
        { relKey: "no attributes" },
        null,
      ],
    })
    expect(insurance?.relationAttributes).toEqual([
      {
        attrKey: "insurancePrecedence",
        name: null,
        type: "VALUE_LIST",
        values: [
          { id: 5, name: "Secondary" },
          { id: 4, name: "Primary" },
          { id: 6, name: "n/a" },
        ],
      },
      { attrKey: "relationshipToInsured", name: "Relationship to insured", type: "VALUE_LIST", values: [{ id: 7, name: "Self" }] },
      { attrKey: "label", name: null, type: "VALUE_LIST", values: [{ id: 8, name: "Relation label" }] },
    ])
    expect(valueListOptions(insurance, "insurancePrecedence").map((value) => value.name)).toEqual(["Primary", "Secondary"])
    expect(valueListOptions(insurance, "relationshipToInsured").map((value) => value.name)).toEqual(["Self"])
    expect(valueListOptions(insurance, "insuranceType").map((value) => value.name)).toEqual(["Medical"])
    // The type's own attribute wins over a relation attribute with the same key.
    expect(valueListOptions(insurance, "label").map((value) => value.name)).toEqual(["Active"])
    // Nothing existing changes: a type without relation attributes has no `relationAttributes` key.
    expect(toTypeInfo({ boKey: "Person", attributes: [], relationships: [{ attributes: [] }, "junk"] })).toEqual({ boKey: "Person", attributes: [] })
    expect(toTypeInfo({ boKey: "Person", attributes: [], relationships: "junk" })).toEqual({ boKey: "Person", attributes: [] })
  })

  it("fetches through the proxy and maps the body", async () => {
    server.use(http.get("/api/1h/v2/type/key/Person", () => HttpResponse.json(PERSON)))
    expect(await fetchTypeKey("Person")).toMatchObject({ success: true, statusCode: 200, data: { boKey: "Person" } })
    expect(await loadTypeKey("Person")).toMatchObject({ boKey: "Person" })
  })

  it("returns the error, or a shape error", async () => {
    server.use(http.get("/api/1h/v2/type/key/ContactPoint", () => HttpResponse.json({ message: "boom", code: 500 }, { status: 500 })))
    expect(await fetchTypeKey("ContactPoint")).toMatchObject({ success: false, statusCode: 500, data: undefined })
    server.use(http.get("/api/1h/v2/type/key/ContactPoint", () => HttpResponse.json(["not", "a", "type"])))
    expect(await fetchTypeKey("ContactPoint")).toMatchObject({ success: false, statusCode: 200, error: "type-keys/fetchTypeKey returned an unexpected shape" })
  })

  it("is registered for keys.typeKey(type) on the root SWR fetcher; an unknown type makes no request", async () => {
    server.use(http.get("/api/1h/v2/type/key/Insurance", () => HttpResponse.json({ boKey: "Insurance", attributes: [] })))
    expect(await swrFetcher(keys.typeKey("Insurance"))).toEqual({ boKey: "Insurance", attributes: [] })
    await expect(swrFetcher(["pp", "type-key", "Organization"])).rejects.toBeInstanceOf(ApiResponseError)
    await expect(swrFetcher(["pp", "type-key"])).rejects.toThrow("Unknown type key undefined")
  })
})
