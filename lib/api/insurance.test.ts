import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { myselfWire } from "@/test/myself-fixture"
import { server } from "@/test/msw-server"
import {
  deleteInsuranceCardFile,
  insuranceCardUploadName,
  insuranceSavedPolicyId,
  uploadInsuranceCard,
  fetchInsurance,
  fetchMyself,
  INSURANCE_PRECEDENCES,
  INSURANCE_RELATIONSHIPS,
  INSURANCE_SELF,
  INSURANCE_TYPES,
  insuranceCreateBody,
  insuranceCreatePath,
  insuranceUpdateBody,
  insuranceUpdatePath,
  insuranceValueOptions,
  insurerSearchPath,
  saveInsuranceCreate,
  saveInsuranceUpdate,
  searchInsurers,
  toTypeInfo,
  type InsurancePolicyInput,
  INSURANCE_CARD_RELATIONS,
  INSURANCE_CARD_SIDES,
  INSURANCE_DELETED_LABEL,
  INSURANCE_TYPE_KEY,
  insuranceCardDownloadPath,
  insuranceCardUploadPath,
  insuranceListPath,
  INSURER_PAGE_SIZE,
  keys,
  loadInsurance,
  swrFetcher,
  toInsurancePolicies,
  type InsurancePolicy,
} from "."

/** Insurance (Team A, Epic 5). Team A adds its own cases here. */

const LIST = "/api/1h/v2/health/patient/insurance"

/** A backend `ResponseInsuranceDTO` (Story 5.1 fields, plus ones the client ignores). */
const wire = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 55,
  memberIdNumber: "948221037",
  insuranceType: "MEDICAL",
  planEffectiveDate: "2025-01-01",
  insuranceOrganizationDTO: { insuranceCompanyName: "UnitedHealthcare", insuranceCompanyId: 7, naicCode: null, location: null },
  insuranceGroupId: "704512",
  expirationDate: "2026-12-31",
  cancellationDate: "1970-01-01",
  subscriber: null,
  owner: null,
  insurancePrecedence: "PRIMARY",
  relationshipToInsured: "SELF",
  label: "Active",
  frontSideCardFile: { id: 900, name: "front.jpg", publicURL: null },
  backSideCardFile: { id: 901, name: "back.jpg", publicURL: null },
  ...overrides,
})

const policy = (overrides: Partial<InsurancePolicy> = {}): InsurancePolicy => ({
  id: 55,
  type: "MEDICAL",
  precedence: "PRIMARY",
  relationship: "SELF",
  deleted: false,
  insurer: "UnitedHealthcare",
  insurerId: 7,
  subscriber: null,
  memberId: "948221037",
  groupId: "704512",
  effectiveDate: "2025-01-01",
  expirationDate: "2026-12-31",
  cancellationDate: "1970-01-01",
  cardFileIds: { front: 900, back: 901 },
  ...overrides,
})

const page = (content: unknown[]) => ({ content, last: true, totalElements: content.length, totalPages: 1, number: 0, size: 100 })

describe("insurance", () => {
  it("paths and constants", () => {
    expect(INSURANCE_TYPE_KEY).toBe("Insurance")
    expect(INSURER_PAGE_SIZE).toBe(20)
    expect(INSURANCE_DELETED_LABEL).toBe("Deleted")
    expect(INSURANCE_CARD_SIDES).toEqual(["front", "back"])
    expect(insuranceListPath()).toBe("/api/1h/v2/health/patient/insurance?page=0&size=100")
    expect(insuranceCardUploadPath(55, "back")).toBe(`/api/1h/v2/health/type/Insurance/55/relation/${INSURANCE_CARD_RELATIONS.back}/file/upload`)
  })
})

describe("insuranceCardDownloadPath (Story 5.1)", () => {
  it("builds the same-origin download of a side", () => {
    expect(insuranceCardDownloadPath(55, 900, "front")).toBe("/api/1h/v2/health/insurance/55/file/900/download?fileRelKey=InsuranceHasFrontSideCardFile")
    expect(insuranceCardDownloadPath(55, 901, "back")).toBe("/api/1h/v2/health/insurance/55/file/901/download?fileRelKey=InsuranceHasBackSideCardFile")
  })

  it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])("refuses the id %d", (id) => {
    expect(insuranceCardDownloadPath(id, 900, "front")).toBeNull()
    expect(insuranceCardDownloadPath(55, id, "back")).toBeNull()
  })
})

describe("toInsurancePolicies (Story 5.1)", () => {
  it("maps a Spring Page's rows in platform order, Deleted ones included", () => {
    expect(
      toInsurancePolicies(
        page([
          wire(),
          wire({
            id: 56,
            insuranceType: "DENTAL",
            insurancePrecedence: "SECONDARY",
            relationshipToInsured: "SPOUSE",
            subscriber: { firstName: "Sam", lastName: "Lee", email: "sam@example.com" },
            frontSideCardFile: null,
            backSideCardFile: undefined,
          }),
          wire({ id: 57, label: INSURANCE_DELETED_LABEL, insuranceType: "VISION" }),
        ]),
      ),
    ).toEqual([
      policy(),
      policy({
        id: 56,
        type: "DENTAL",
        precedence: "SECONDARY",
        relationship: "SPOUSE",
        subscriber: { firstName: "Sam", lastName: "Lee", email: "sam@example.com", phoneNumber: null, phoneNumberRegion: null, birthDate: null },
        cardFileIds: { front: null, back: null },
      }),
      policy({ id: 57, type: "VISION", deleted: true }),
    ])
  })

  it("accepts a bare list, and reads missing values as null", () => {
    expect(toInsurancePolicies([{}])).toEqual([
      {
        id: null,
        type: null,
        precedence: null,
        relationship: null,
        deleted: false,
        insurer: null,
        insurerId: null,
        subscriber: null,
        memberId: null,
        groupId: null,
        effectiveDate: null,
        expirationDate: null,
        cancellationDate: null,
        cardFileIds: { front: null, back: null },
      },
    ])
    expect(
      toInsurancePolicies([{ insuranceOrganizationDTO: {}, subscriber: {}, frontSideCardFile: {}, backSideCardFile: { id: null } }])?.[0],
    ).toMatchObject({
      insurer: null,
      insurerId: null,
      subscriber: { firstName: null, lastName: null, email: null, phoneNumber: null, phoneNumberRegion: null, birthDate: null },
      cardFileIds: { front: null, back: null },
    })
    // Story 5.2: the subscriber's contact details and birth date (sent back unchanged on an Edit).
    const subscriber = { firstName: "Sam", lastName: "Lee", email: "sam@example.com", phoneNumber: "+14155552125", phoneNumberRegion: "us", birthDate: "1980-05-04", userId: 9 }
    expect(toInsurancePolicies([wire({ subscriber })])?.[0]?.subscriber).toEqual({
      firstName: "Sam",
      lastName: "Lee",
      email: "sam@example.com",
      phoneNumber: "+14155552125",
      phoneNumberRegion: "us",
      birthDate: "1980-05-04",
    })
  })

  it("keeps the enums as constant names, N_A included; only label \"Deleted\" is deleted", () => {
    const [row] = toInsurancePolicies([wire({ insuranceType: "N_A", insurancePrecedence: "N_A", relationshipToInsured: "N_A", label: "deleted" })]) ?? []
    expect(row).toMatchObject({ type: "N_A", precedence: "N_A", relationship: "N_A", deleted: false })
  })

  it("reads the backend PageImpl (`{ data, lastPage }`, common/repository/PageImpl.java)", () => {
    expect(toInsurancePolicies({ data: [wire()], lastPage: true, pageNumber: 0, pageSize: 100 })).toEqual([policy()])
    expect(toInsurancePolicies({ data: [] })).toEqual([])
    expect(toInsurancePolicies({ data: null })).toBeNull()
  })

  it("reads an empty Page and an empty list as no policies", () => {
    expect(toInsurancePolicies(page([]))).toEqual([])
    expect(toInsurancePolicies([])).toEqual([])
  })

  it.each([
    ["an object without content", { totalElements: 0 }],
    ["a Page whose content is not a list", { content: null }],
    ["a row with a string id", [{ id: "1" }]],
    ["a row with a string file id", [{ frontSideCardFile: { id: "900" } }]],
    ["a row with a numeric date", [{ planEffectiveDate: 20250101 }]],
    ["a string", "nope"],
    ["null", null],
  ])("rejects %s", (_case, body) => {
    expect(toInsurancePolicies(body)).toBeNull()
  })
})

describe("fetchInsurance (Story 5.1)", () => {
  it("sends one GET for page 0 of 100 and returns the mapped rows", async () => {
    const seen: string[] = []
    server.use(
      http.get(LIST, ({ request }) => {
        seen.push(new URL(request.url).search)
        return HttpResponse.json(page([wire()]))
      }),
    )
    expect(await fetchInsurance()).toEqual({ success: true, data: [policy()], statusCode: 200 })
    expect(seen).toEqual(["?page=0&size=100"])
  })

  it("returns the error, or a shape error", async () => {
    server.use(http.get(LIST, () => HttpResponse.json({ errorCode: "UPSTREAM_ERROR", source: "proxy" }, { status: 502 })))
    expect(await fetchInsurance()).toMatchObject({ success: false, errorCode: "UPSTREAM_ERROR", data: undefined })
    server.use(http.get(LIST, () => HttpResponse.json({ nope: true })))
    expect(await fetchInsurance()).toEqual({ success: false, statusCode: 200, error: "insurance/fetchInsurance returned an unexpected shape" })
  })

  it("is the loader of keys.insurance() behind the root SWR fetcher", async () => {
    server.use(http.get(LIST, () => HttpResponse.json([wire({ id: 3 })])))
    expect(await swrFetcher(keys.insurance())).toEqual([policy({ id: 3 })])
    expect(await loadInsurance()).toEqual([policy({ id: 3 })])
    server.use(http.get(LIST, () => HttpResponse.json({ message: "boom" }, { status: 500 })))
    await expect(swrFetcher(keys.insurance())).rejects.toMatchObject({ name: "ApiResponseError", response: { success: false, statusCode: 500 } })
  })
})

describe("Story 5.2 paths and constants", () => {
  it("builds the write and search paths", () => {
    expect(insuranceCreatePath()).toBe("/api/1h/v2/health/patient/insurance")
    expect(insuranceUpdatePath(55)).toBe("/api/1h/v2/health/patient/insurance/55")
    expect(insurerSearchPath("Blue Shield & Co", 3)).toBe("/api/1h/v2/health/insurance/organizations?name=Blue+Shield+%26+Co&page=3&size=20")
    expect(INSURANCE_TYPES).toEqual(["MEDICAL", "DENTAL", "HOSPICE", "VISION", "DRUG"])
    expect(INSURANCE_PRECEDENCES).toEqual(["PRIMARY", "SECONDARY", "SUPPLEMENTAL", "OTHER"])
    expect(INSURANCE_RELATIONSHIPS).toEqual(["SELF", "SPOUSE", "PARENT", "CHILD", "DEPENDENT"])
    expect(INSURANCE_SELF).toBe("SELF")
  })

  it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])("refuses the policy id %d", (id) => {
    expect(insuranceUpdatePath(id)).toBeNull()
  })
})

/** A trimmed Insurance type key: Type on the type, Precedence and Relationship on the `InsuranceBelongsToPerson` relation. */
const TYPE_KEY = toTypeInfo({
  boKey: "Insurance",
  attributes: [
    {
      attrKey: "insuranceType",
      type: "VALUE_LIST",
      attributeValues: ["Vision", "n/a", "Drug", "Medical", "Dental", "Hospice", "Pet"].map((name, id) => ({ id, name })),
    },
  ],
  relationships: [
    {
      relKey: "InsuranceBelongsToPerson",
      attributes: [
        { attrKey: "insurancePrecedence", type: "VALUE_LIST", attributeValues: ["Other", "Primary", "n/a", "Secondary", "Supplemental"].map((name, id) => ({ id, name })) },
        { attrKey: "relationshipToInsured", type: "VALUE_LIST", attributeValues: ["Spouse", "Self", " child ", "Dependent", "n/a"].map((name, id) => ({ id, name })) },
      ],
    },
  ],
})

describe("insuranceValueOptions (Story 5.2)", () => {
  it("offers the type key's values as the backend's constants, in the constants' order, without n/a or unknown values", () => {
    expect(insuranceValueOptions(TYPE_KEY, "type")).toEqual(["MEDICAL", "DENTAL", "HOSPICE", "VISION", "DRUG"])
    expect(insuranceValueOptions(TYPE_KEY, "precedence")).toEqual(["PRIMARY", "SECONDARY", "SUPPLEMENTAL", "OTHER"])
    expect(insuranceValueOptions(TYPE_KEY, "relationship")).toEqual(["SELF", "SPOUSE", "CHILD", "DEPENDENT"])
  })

  it("offers nothing without a type key (loading or failed); a type key without the list falls back to the backend's constants", () => {
    expect(insuranceValueOptions(undefined, "type")).toEqual([])
    expect(insuranceValueOptions(null, "type")).toEqual([])
    expect(insuranceValueOptions(toTypeInfo({ boKey: "Insurance", attributes: [] }), "precedence")).toEqual(["PRIMARY", "SECONDARY", "SUPPLEMENTAL", "OTHER"])
    const unknownOnly = toTypeInfo({ boKey: "Insurance", attributes: [{ attrKey: "insuranceType", type: "VALUE_LIST", attributeValues: [{ id: 1, name: "Pet" }] }] })
    expect(insuranceValueOptions(unknownOnly, "type")).toEqual(["MEDICAL", "DENTAL", "HOSPICE", "VISION", "DRUG"])
  })
})

const ORGS = "/api/1h/v2/health/insurance/organizations"

describe("searchInsurers (Story 5.2)", () => {
  it("loads one page of 20 through the proxy and maps the PageImpl; hasMore is !lastPage", async () => {
    const seen: string[] = []
    server.use(
      http.get(ORGS, ({ request }) => {
        seen.push(new URL(request.url).search)
        return HttpResponse.json({ data: [{ id: 7, name: "Blue Shield", naicTag: null }, { id: 8, name: " Blue Cross " }], lastPage: false, pageNumber: 1 })
      }),
    )
    expect(await searchInsurers("Blu", 1)).toEqual({
      items: [
        { id: 7, name: "Blue Shield" },
        { id: 8, name: "Blue Cross" },
      ],
      hasMore: true,
      exactMatch: false,
    })
    expect(seen).toEqual(["?name=Blu&page=1&size=20"])
  })

  it("says when a loaded name equals the query (trimmed, case-insensitive), and drops rows without an id or a name", async () => {
    server.use(
      http.get(ORGS, () => HttpResponse.json({ data: [{ id: 7, name: "Blue Shield" }, { id: "8", name: "Bad id" }, { id: 9, name: "  " }, { name: "No id" }, null], lastPage: true })),
    )
    expect(await searchInsurers(" blue shield ", 0)).toEqual({ items: [{ id: 7, name: "Blue Shield" }], hasMore: false, exactMatch: true })
  })

  it("never throws: a failed call or an unexpected body is { error: true }", async () => {
    server.use(http.get(ORGS, () => HttpResponse.json({ message: "boom" }, { status: 500 })))
    expect(await searchInsurers("Blu", 0)).toEqual({ error: true })
    server.use(http.get(ORGS, () => HttpResponse.json({ content: [] })))
    expect(await searchInsurers("Blu", 0)).toEqual({ error: true })
  })

  it("passes the abort signal on", async () => {
    server.use(http.get(ORGS, () => HttpResponse.json({ data: [], lastPage: true })))
    const controller = new AbortController()
    controller.abort()
    expect(await searchInsurers("Blu", 0, controller.signal)).toEqual({ error: true })
  })
})

/** The editor's input of the I/O matrix's "Add, listed insurer" row, with every optional field. */
const input = (overrides: Partial<InsurancePolicyInput> = {}): InsurancePolicyInput => ({
  insurer: { id: 7 },
  type: "MEDICAL",
  precedence: "PRIMARY",
  relationship: "SELF",
  memberId: " XKH123 ",
  groupId: " 704512 ",
  effectiveDate: "2025-01-01",
  expirationDate: "2026-12-31",
  cancellationDate: "2026-06-30",
  subscriber: null,
  ...overrides,
})

const SUBSCRIBER = { firstName: "Sam", lastName: "Lee", email: "sam@example.com", phoneNumber: "+14155552125", phoneNumberRegion: "us", birthDate: "1980-05-04" }

describe("insuranceCreateBody / insuranceUpdateBody (Story 5.2)", () => {
  it("sends the full InsuranceDTO: uppercase enums, trimmed ids, every date, the insurer by id, no subscriber for Self", () => {
    const body = {
      insuranceOrganizationDTO: { insuranceCompanyId: 7 },
      insuranceType: "MEDICAL",
      insurancePrecedence: "PRIMARY",
      relationshipToInsured: "SELF",
      memberIdNumber: "XKH123",
      insuranceGroupId: "704512",
      planEffectiveDate: "2025-01-01",
      expirationDate: "2026-12-31",
      cancellationDate: "2026-06-30",
    }
    expect(insuranceCreateBody(input())).toEqual(body)
    expect(insuranceUpdateBody(input())).toEqual(body)
    // Self never sends a subscriber, even one left in the input.
    expect(insuranceCreateBody(input({ subscriber: SUBSCRIBER }))).not.toHaveProperty("subscriber")
  })

  it("leaves out a blank Group ID and empty optional dates; a new insurer goes by its trimmed name", () => {
    const body = insuranceCreateBody(input({ groupId: "   ", expirationDate: "", cancellationDate: "", insurer: { name: "  Acme Health " } }))
    expect(body).toEqual({
      insuranceOrganizationDTO: { insuranceCompanyName: "Acme Health" },
      insuranceType: "MEDICAL",
      insurancePrecedence: "PRIMARY",
      relationshipToInsured: "SELF",
      memberIdNumber: "XKH123",
      planEffectiveDate: "2025-01-01",
    })
    expect(Object.keys(body)).not.toContain("insuranceGroupId")
  })

  it("sends the subscriber when the relationship isn't Self, without its missing fields; Drug as DRUG", () => {
    expect(insuranceUpdateBody(input({ type: "DRUG", relationship: "SPOUSE", subscriber: SUBSCRIBER })).subscriber).toEqual(SUBSCRIBER)
    expect(insuranceUpdateBody(input({ type: "DRUG", relationship: "SPOUSE", subscriber: SUBSCRIBER })).insuranceType).toBe("DRUG")
    const saved = { firstName: "Kim", lastName: "Lee", email: "kim@example.com", phoneNumber: undefined, phoneNumberRegion: undefined, birthDate: "2001-02-03" }
    expect(JSON.parse(JSON.stringify(insuranceUpdateBody(input({ relationship: "CHILD", subscriber: saved }))))).toMatchObject({
      subscriber: { firstName: "Kim", lastName: "Lee", email: "kim@example.com", birthDate: "2001-02-03" },
    })
    expect(Object.keys(insuranceUpdateBody(input({ relationship: "CHILD", subscriber: saved })).subscriber ?? {})).toEqual(["firstName", "lastName", "email", "birthDate"])
    // A non-Self relationship without a subscriber sends none (the backend then answers its own rule).
    expect(insuranceCreateBody(input({ relationship: "PARENT" }))).not.toHaveProperty("subscriber")
  })
})

describe("saveInsuranceCreate / saveInsuranceUpdate (Story 5.2)", () => {
  beforeEach(async () => {
    // D-A: a write goes out only once the page user is pinned.
    server.use(http.get("/api/1h/v2/user/myself", () => HttpResponse.json(myselfWire())))
    expect((await fetchMyself()).success).toBe(true)
  })

  it("POSTs a new policy as JSON", async () => {
    let seen: { method: string; type: string | null; body: unknown } | undefined
    server.use(
      http.post("/api/1h/v2/health/patient/insurance", async ({ request }) => {
        seen = { method: request.method, type: request.headers.get("Content-Type"), body: await request.json() }
        return HttpResponse.json({ id: 60 })
      }),
    )
    expect(await saveInsuranceCreate(input())).toMatchObject({ success: true, data: { id: 60 } })
    expect(seen).toEqual({ method: "POST", type: "application/json", body: insuranceCreateBody(input()) })
  })

  it("PUTs an edit to the policy's id and returns a failure as is", async () => {
    let seen: { path: string; body: unknown } | undefined
    server.use(
      http.put("/api/1h/v2/health/patient/insurance/:id", async ({ request }) => {
        seen = { path: new URL(request.url).pathname, body: await request.json() }
        return HttpResponse.json({ message: "Member Id Number should be at least 3 symbols.", code: 400 }, { status: 400 })
      }),
    )
    expect(await saveInsuranceUpdate(55, input({ relationship: "SPOUSE", subscriber: SUBSCRIBER }))).toMatchObject({
      success: false,
      statusCode: 400,
      platformMessage: "Member Id Number should be at least 3 symbols.",
    })
    expect(seen).toEqual({ path: "/api/1h/v2/health/patient/insurance/55", body: insuranceUpdateBody(input({ relationship: "SPOUSE", subscriber: SUBSCRIBER })) })
  })

  it("never sends an edit for an id that isn't a positive integer", async () => {
    expect(await saveInsuranceUpdate(0, input())).toMatchObject({ success: false, errorCode: "BAD_PATH" })
  })
})

describe("card uploads and the replaced card's delete (Story 5.3)", () => {
  const UPLOAD = (id: number, relation: string) => `/api/1h/v2/health/type/Insurance/${id}/relation/${relation}/file/upload`

  beforeEach(async () => {
    server.use(http.get("/api/1h/v2/user/myself", () => HttpResponse.json(myselfWire())))
    expect((await fetchMyself()).success).toBe(true)
  })

  it.each<[string, "front" | "back", string]>([
    ["card front.PNG", "front", "card_front.jpg"],
    ["C:\\fakepath\\scan.jpeg", "back", "scan.jpg"],
    ["/tmp/x/y.z.png", "front", "y.z.jpg"],
    ["__..png", "front", "card-front.jpg"],
    ["", "back", "card-back.jpg"],
    [`${"a".repeat(150)}.png`, "front", `${"a".repeat(96)}.jpg`],
  ])("insuranceCardUploadName(%j, %s) → %j", (name, side, expected) => {
    expect(insuranceCardUploadName(name, side)).toBe(expected)
  })

  // MSW can't read a multipart body in jsdom (see profile-picture.test.ts): the part is checked where it is built.
  it.each([
    ["front", "InsuranceHasFrontSideCardFile"],
    ["back", "InsuranceHasBackSideCardFile"],
  ] as const)("posts one multipart `file` part to the %s relation of the policy, with no query", async (side, relation) => {
    const seen: { url: string; contentType: string | null }[] = []
    server.use(
      http.post(UPLOAD(55, relation), ({ request }) => {
        seen.push({ url: request.url, contentType: request.headers.get("Content-Type") })
        return HttpResponse.json({ id: 901 })
      }),
    )
    const append = vi.spyOn(FormData.prototype, "append")
    const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: "image/jpeg" })
    expect(await uploadInsuranceCard(55, side, blob, "card.png")).toEqual({ success: true, statusCode: 200, data: { id: 901 } })
    expect(append.mock.calls).toEqual([["file", blob, "card.jpg"]])
    append.mockRestore()
    expect(seen).toHaveLength(1)
    expect(new URL(seen[0].url).search).toBe("")
    expect(seen[0].contentType).toMatch(/^multipart\/form-data; boundary=/)
  })

  it("counts a 2xx with an unreadable body as uploaded; returns failures as they are", async () => {
    const blob = new Blob([new Uint8Array([1])])
    const path = UPLOAD(55, "InsuranceHasBackSideCardFile")
    server.use(http.post(path, () => HttpResponse.text("OK", { status: 201 })))
    expect(await uploadInsuranceCard(55, "back", blob, "a.png")).toEqual({ success: true, statusCode: 201 })
    server.use(http.post(path, () => HttpResponse.json({ errorCode: "UNSUPPORTED_MEDIA", source: "proxy" }, { status: 415 })))
    expect(await uploadInsuranceCard(55, "back", blob, "a.png")).toMatchObject({ success: false, statusCode: 415, errorCode: "UNSUPPORTED_MEDIA" })
    server.use(http.post(path, () => HttpResponse.json({ message: "Boom", code: 500 }, { status: 500 })))
    expect(await uploadInsuranceCard(55, "back", blob, "a.png")).toMatchObject({ success: false, statusCode: 500 })
    server.use(http.post(path, () => HttpResponse.error()))
    expect(await uploadInsuranceCard(55, "back", blob, "a.png")).toMatchObject({ success: false, errorCode: "NETWORK_ERROR" })
  })

  it.each([0, -1, 1.5, Number.NaN])("sends nothing for a policy id %s", async (id) => {
    expect(await uploadInsuranceCard(id, "front", new Blob([]), "a.png")).toEqual({ success: false, error: "insurance/uploadInsuranceCard: not a policy id" })
  })

  it("deletes the old card file through the ownership-checked named op; sends nothing for a non-id", async () => {
    const deleted: string[] = []
    server.use(
      http.delete("/api/pp/file/:fileId", ({ request, params }) => {
        deleted.push(`${String(params.fileId)}${new URL(request.url).search}`)
        return new HttpResponse(null, { status: 204 })
      }),
    )
    expect(await deleteInsuranceCardFile(900)).toEqual({ success: true, statusCode: 204 })
    expect(deleted).toEqual(["900"])
    expect(await deleteInsuranceCardFile(0)).toEqual({ success: false, error: "insurance/deleteInsuranceCardFile: not a file id" })
    expect(deleted).toEqual(["900"])
  })
})

describe("insuranceSavedPolicyId (Story 5.3)", () => {
  it.each<[unknown, number | null]>([
    [{ id: 60, memberIdNumber: "X" }, 60],
    [{ id: 0 }, null],
    [{ id: -1 }, null],
    [{ id: 1.5 }, null],
    [{ id: "60" }, null],
    [{}, null],
    [null, null],
    [undefined, null],
  ])("%j → %j", (data, expected) => {
    expect(insuranceSavedPolicyId(data)).toBe(expected)
  })
})
