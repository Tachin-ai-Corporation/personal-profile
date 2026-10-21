import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { SESSION_COOKIE, sealSession } from "@/lib/server/session/session"
import { stubServerEnv, testEnv } from "@/test/env-fixture"
import { IMAGES, imageOfSize } from "@/test/image-fixture"
import { server, trackAllRequests } from "@/test/msw-server"
import { multipart, multipartInit, type Part } from "@/test/multipart-fixture"
import { makeSession, NOW } from "@/test/session-fixture"
import { DEMO } from "@/test/upstream-fixture"
import { createProxyHandler } from "../handler"
import { buildUpstreamQuery, matchEntry } from "../match"
import { ALLOWLIST } from "."
import { IMAGE_UPLOAD_MAX_BYTES } from "./core"
// The client's lists (relative import: a drift check only, the proxy never imports lib/api).
import * as client from "../../../api/insurance"
import { entries, INSURANCE_PRECEDENCES, INSURANCE_RELATIONSHIPS, INSURANCE_TYPES } from "./insurance"

const q = (s: string) => new URLSearchParams(s)
const seg = (path: string) => path.split("/")

const FRONT = "InsuranceHasFrontSideCardFile"
const BACK = "InsuranceHasBackSideCardFile"
const LIST = "v2/health/patient/insurance"
const DOWNLOAD = "v2/health/insurance/55/file/900/download"

function matched(method: "GET" | "POST" | "PUT", path: string) {
  const match = matchEntry(entries, method, seg(path))
  if (match.kind !== "matched") throw new Error(`${method} ${path} did not match`)
  return match.entry
}

describe("insurance allowlist area", () => {
  it("takes exactly the enum values the editor offers (lib/api/insurance.ts), so no picker value is a 400", () => {
    expect(client.INSURANCE_TYPES).toEqual(INSURANCE_TYPES)
    expect(client.INSURANCE_PRECEDENCES).toEqual(INSURANCE_PRECEDENCES)
    expect(client.INSURANCE_RELATIONSHIPS).toEqual(INSURANCE_RELATIONSHIPS)
  })

  it("has its entries, all aggregated into the shipped allowlist, none tagged `profile`", () => {
    expect(entries.map((entry) => `${entry.method} ${entry.template}`)).toEqual([
      `POST v2/health/type/Insurance/{insuranceId}/relation/${FRONT}/file/upload`,
      `POST v2/health/type/Insurance/{insuranceId}/relation/${BACK}/file/upload`,
      "GET v2/type/key/Insurance",
      "GET v2/health/patient/insurance",
      "GET v2/health/insurance/{insuranceId}/file/{fileId}/download",
      "GET v2/health/insurance/organizations",
      "POST v2/health/patient/insurance",
      "PUT v2/health/patient/insurance/{insuranceId}",
      "DELETE v2/health/insurance/{insuranceId}",
    ])
    for (const entry of entries) expect(ALLOWLIST).toContain(entry)
    expect(entries.filter((entry) => entry.profile !== undefined)).toEqual([])
  })
})

describe("insurance card uploads (Story 5.3)", () => {
  it.each([FRONT, BACK])("%s: numeric id, isPublic=false forced, no client query, PNG/JPEG `file`, 4 MB", (relation) => {
    const entry = matched("POST", `v2/health/type/Insurance/55/relation/${relation}/file/upload`)
    expect(entry).toMatchObject({ upload: { part: "file", types: ["png", "jpeg"] }, maxBytes: IMAGE_UPLOAD_MAX_BYTES })
    expect(entry.profile).toBeUndefined()
    expect(buildUpstreamQuery(entry, q("isPublic=true"))?.toString()).toBe("isPublic=false")
    expect(buildUpstreamQuery(entry, q("fileName=x.png"))).toBeNull()
    expect(matchEntry(entries, "POST", seg(`v2/health/type/Insurance/me/relation/${relation}/file/upload`)).kind).toBe("not-allowed")
  })
})

/** Story 5.3: the card uploads through the real proxy handler (shipped allowlist). */
describe("insurance card uploads through the proxy (Story 5.3)", () => {
  const proxy = createProxyHandler({ env: testEnv(), now: () => NOW })
  const UP = DEMO.apiBase
  const UPLOAD = (relation: string, id: number | string = 55) => `v2/health/type/Insurance/${id}/relation/${relation}/file/upload`

  async function upload(path: string, parts: readonly Part[]): Promise<Response> {
    const payload = await multipart(parts)
    const cookie = `${SESSION_COOKIE}=${await sealSession(makeSession())}`
    return proxy(new Request(`http://localhost:3000/api/1h/${path}`, multipartInit(payload, "header", { cookie })))
  }

  beforeEach(() => stubServerEnv())

  it.each([FRONT, BACK])("%s: forwards one rebuilt `file` part to the policy, isPublic=false forced even when the client asks for true", async (relation) => {
    let seen: { path: string; search: string; entries: [string, FormDataEntryValue][] } | undefined
    server.use(
      http.post(`${UP}/v2/health/type/Insurance/:id/relation/:relation/file/upload`, async ({ request }) => {
        const url = new URL(request.url)
        seen = { path: url.pathname, search: url.search, entries: [...(await request.formData()).entries()] }
        return HttpResponse.json({ id: 901 })
      }),
    )
    const response = await upload(`${UPLOAD(relation)}?isPublic=true`, [{ name: "file", bytes: IMAGES.jpeg, filename: "card.jpg", type: "image/jpeg" }])
    expect(response.status).toBe(200)
    expect(seen?.path).toBe(`/api/v2/health/type/Insurance/55/relation/${relation}/file/upload`)
    expect(seen?.search).toBe("?isPublic=false")
    expect(seen?.entries.map(([name]) => name)).toEqual(["file"])
  })

  it("forwards without a client query as isPublic=false", async () => {
    let search: string | undefined
    server.use(
      http.post(`${UP}/v2/health/type/Insurance/:id/relation/:relation/file/upload`, ({ request }) => {
        search = new URL(request.url).search
        return HttpResponse.json({ id: 901 })
      }),
    )
    expect((await upload(UPLOAD(BACK), [{ name: "file", bytes: IMAGES.png }])).status).toBe(200)
    expect(search).toBe("?isPublic=false")
  })

  describe("refusals, before any upstream call", () => {
    let upstreamCalls: () => number
    beforeEach(() => {
      upstreamCalls = trackAllRequests()
    })
    afterEach(() => expect(upstreamCalls()).toBe(0))

    it.each<[string, string, readonly Part[], number, string]>([
      ["4 MB + 1 byte", UPLOAD(FRONT), [{ name: "file", bytes: imageOfSize("jpeg", IMAGE_UPLOAD_MAX_BYTES + 1) }], 413, "TOO_LARGE"],
      ["an SVG renamed .png", UPLOAD(FRONT), [{ name: "file", bytes: IMAGES.svg, filename: "card.png" }], 415, "UNSUPPORTED_MEDIA"],
      ["a BMP (not a card type)", UPLOAD(BACK), [{ name: "file", bytes: IMAGES.bmp, filename: "card.png" }], 415, "UNSUPPORTED_MEDIA"],
      ["a client query other than isPublic", `${UPLOAD(FRONT)}?fileName=x.png`, [{ name: "file", bytes: IMAGES.png }], 400, "BAD_QUERY"],
      ["hardDelete in the query", `${UPLOAD(FRONT)}?hardDelete=true`, [{ name: "file", bytes: IMAGES.png }], 400, "BAD_QUERY"],
      ["a part not named file", UPLOAD(FRONT), [{ name: "image", bytes: IMAGES.png }], 400, "BAD_BODY"],
      ["an owner id in place of the policy id", UPLOAD(FRONT, "me"), [{ name: "file", bytes: IMAGES.png }], 403, "NOT_ALLOWED"],
    ])("%s", async (_label, path, parts, status, errorCode) => {
      const response = await upload(path, parts)
      expect(response.status).toBe(status)
      expect(await response.json()).toEqual({ errorCode, source: "proxy" })
    })
  })
})

/** Story 5.1: the policy list read. */
describe("GET v2/health/patient/insurance entry", () => {
  const entry = matched("GET", LIST)

  it("no body, nothing forced, not an image; the same path takes only GET and the Story 5.2 POST", () => {
    expect(entry.body).toBeUndefined()
    expect(entry.fixedQuery).toBeUndefined()
    expect(entry.asImage).toBeUndefined()
    for (const method of ["PUT", "DELETE"] as const) expect(matchEntry(ALLOWLIST, method, seg(LIST)).kind).toBe("method-not-allowed")
  })

  it("accepts exactly page=0&size=100", () => {
    expect(buildUpstreamQuery(entry, q("page=0&size=100"))?.toString()).toBe("page=0&size=100")
    expect(buildUpstreamQuery(entry, q("size=100&page=0"))?.toString()).toBe("size=100&page=0")
  })

  it.each(["", "page=0", "size=100", "page=1&size=100", "page=0&size=20", "page=0&size=100&x=1", "page=0&page=0&size=100", "page=00&size=100", "page=0&size=1000"])(
    "refuses the query %j",
    (query) => {
      expect(buildUpstreamQuery(entry, q(query))).toBeNull()
    },
  )

  it("matches no other path (a policy id takes only the Story 5.2 PUT)", () => {
    expect(matchEntry(entries, "GET", seg("v2/health/patient/insurance/7")).kind).toBe("method-not-allowed")
    expect(matchEntry(entries, "GET", seg("v2/health/patient/insurance/7/x")).kind).toBe("not-allowed")
  })
})

/** Story 5.1: the card image download (AD-13). Mirrors the files-area image-entry tests. */
describe("GET v2/health/insurance/{insuranceId}/file/{fileId}/download entry", () => {
  const entry = matched("GET", DOWNLOAD)

  it("is an image entry for numeric ids that forces preview=true, not a Profile-module entry", () => {
    expect(entry.asImage).toBe(true)
    expect(entry.profile).toBeUndefined()
    expect(entry.body).toBeUndefined()
    expect(buildUpstreamQuery(entry, q(`fileRelKey=${FRONT}`))?.toString()).toBe(`fileRelKey=${FRONT}&preview=true`)
    expect(buildUpstreamQuery(entry, q(`fileRelKey=${BACK}&preview=false`))?.toString()).toBe(`fileRelKey=${BACK}&preview=true`)
  })

  it.each(["", "fileRelKey=Other", "fileRelKey=insurancehasfrontsidecardfile", `fileRelKey=${FRONT}&x=1`, `fileRelKey=${FRONT}&fileRelKey=${BACK}`, "preview=true", `fileRelKey=${FRONT}%20`])(
    "refuses the query %j",
    (query) => {
      expect(buildUpstreamQuery(entry, q(query))).toBeNull()
    },
  )

  it("refuses a non-numeric or owner id and other methods", () => {
    for (const path of ["v2/health/insurance/abc/file/900/download", "v2/health/insurance/55/file/me/download", "v2/health/insurance/me/file/900/download"]) {
      expect(matchEntry(entries, "GET", seg(path)).kind).toBe("not-allowed")
    }
    for (const method of ["POST", "PUT", "DELETE"] as const) expect(matchEntry(ALLOWLIST, method, seg(DOWNLOAD)).kind).toBe("method-not-allowed")
  })
})

/** The entries through the real proxy handler (shipped allowlist). */
describe("insurance reads through the proxy (Story 5.1)", () => {
  const proxy = createProxyHandler({ env: testEnv(), now: () => NOW })
  const UP = DEMO.apiBase

  async function get(path: string): Promise<Response> {
    const cookie = `${SESSION_COOKIE}=${await sealSession(makeSession())}`
    return proxy(new Request(`http://localhost:3000/api/1h/${path}`, { headers: { cookie } }))
  }

  beforeEach(() => stubServerEnv())

  it("forwards the list read to upstream /api/v2/health/patient/insurance?page=0&size=100 and relays the Page", async () => {
    let seen: { path: string; search: string } | undefined
    const page = { content: [{ id: 55, label: "Active" }], last: true }
    server.use(
      http.get(`${UP}/v2/health/patient/insurance`, ({ request }) => {
        const url = new URL(request.url)
        seen = { path: url.pathname, search: url.search }
        return HttpResponse.json(page)
      }),
    )
    const response = await get(`${LIST}?page=0&size=100`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(page)
    expect(seen).toEqual({ path: "/api/v2/health/patient/insurance", search: "?page=0&size=100" })
  })

  it("forwards the download with fileRelKey and preview=true forced", async () => {
    let seen: { path: string; search: string } | undefined
    server.use(
      http.get(`${UP}/v2/health/insurance/:id/file/:fileId/download`, ({ request }) => {
        const url = new URL(request.url)
        seen = { path: url.pathname, search: url.search }
        return new HttpResponse(IMAGES.png, { headers: { "Content-Type": "image/png" } })
      }),
    )
    const response = await get(`${DOWNLOAD}?fileRelKey=${BACK}&preview=false`)
    expect(response.status).toBe(200)
    expect(seen).toEqual({ path: "/api/v2/health/insurance/55/file/900/download", search: `?fileRelKey=${BACK}&preview=true` })
  })

  describe("image headers (AD-13 hardening, as `proxy: image downloads`)", () => {
    const image = (bytes: Uint8Array<ArrayBuffer>, declared: string) =>
      http.get(`${UP}/v2/health/insurance/:id/file/:fileId/download`, () =>
        new HttpResponse(bytes, {
          headers: {
            "Content-Type": declared,
            "Content-Disposition": 'inline; filename="evil.html"',
            "Content-Length": String(bytes.byteLength),
            "Set-Cookie": "up=1",
            "Cache-Control": "public, max-age=600",
            ETag: "x",
          },
        }),
      )

    it.each([
      ["PNG bytes declared image/jpeg", IMAGES.png, "image/jpeg", "image/png", "inline"],
      ["JPEG bytes", IMAGES.jpeg, "image/jpeg", "image/jpeg", "inline"],
      ["BMP bytes", IMAGES.bmp, "image/jpeg", "image/bmp", "inline"],
      ["SVG bytes declared image/svg+xml", IMAGES.svg, "image/svg+xml", "application/octet-stream", 'attachment; filename="file"'],
      ["HTML bytes declared image/png", IMAGES.html, "image/png", "application/octet-stream", 'attachment; filename="file"'],
      ["WebP bytes", IMAGES.webp, "image/webp", "application/octet-stream", 'attachment; filename="file"'],
    ])("%s → %s, %s", async (_label, bytes, declared, type, disposition) => {
      server.use(image(bytes, declared))
      const response = await get(`${DOWNLOAD}?fileRelKey=${FRONT}`)
      expect(response.status).toBe(200)
      expect(response.headers.get("Content-Type")).toBe(type)
      expect(response.headers.get("Content-Disposition")).toBe(disposition)
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
      expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0")
      expect(response.headers.get("Set-Cookie")).toBeNull()
      expect(response.headers.get("Content-Length")).toBeNull()
      expect(response.headers.get("ETag")).toBeNull()
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
    })

    it("an upstream 404 passes through without a disposition", async () => {
      server.use(http.get(`${UP}/v2/health/insurance/:id/file/:fileId/download`, () => HttpResponse.json({ message: "Not found", code: 4 }, { status: 404 })))
      const response = await get(`${DOWNLOAD}?fileRelKey=${FRONT}`)
      expect(response.status).toBe(404)
      expect(response.headers.get("Content-Disposition")).toBeNull()
      expect(await response.json()).toEqual({ message: "Not found", code: 4 })
    })
  })

  describe("refusals, before any upstream call", () => {
    let upstreamCalls: () => number
    beforeEach(() => {
      upstreamCalls = trackAllRequests()
    })
    afterEach(() => expect(upstreamCalls()).toBe(0))

    it.each<[string, string, number, string]>([
      ["fileRelKey=Other", `${DOWNLOAD}?fileRelKey=Other`, 400, "BAD_QUERY"],
      ["no fileRelKey", DOWNLOAD, 400, "BAD_QUERY"],
      ["an extra query", `${DOWNLOAD}?fileRelKey=${FRONT}&x=1`, 400, "BAD_QUERY"],
      ["a non-numeric policy id", `v2/health/insurance/abc/file/900/download?fileRelKey=${FRONT}`, 403, "NOT_ALLOWED"],
      ["a non-numeric file id", `v2/health/insurance/55/file/x/download?fileRelKey=${FRONT}`, 403, "NOT_ALLOWED"],
      ["a list read of another page", `${LIST}?page=1&size=100`, 400, "BAD_QUERY"],
      ["a list read without the query", LIST, 400, "BAD_QUERY"],
    ])("%s → %i %s", async (_label, path, status, errorCode) => {
      const response = await get(path)
      expect(response.status).toBe(status)
      expect(await response.json()).toEqual({ errorCode, source: "proxy" })
    })
  })
})

const ORGS = "v2/health/insurance/organizations"
const POLICY = "v2/health/patient/insurance/55"

/** A full body as the editor sends it: a listed insurer, Medical / Primary / Self, every optional field. */
const BODY = {
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

const SUBSCRIBER = { firstName: "Sam", lastName: "Lee", email: "sam@example.com", phoneNumber: "+14155552125", phoneNumberRegion: "us", birthDate: "1980-05-04" }

/** Story 5.2: the insurer search (the editor's Combobox `load`, never SWR). */
describe("GET v2/health/insurance/organizations entry", () => {
  const entry = matched("GET", ORGS)

  it("GET only, no body, nothing forced", () => {
    expect(entry.body).toBeUndefined()
    expect(entry.fixedQuery).toBeUndefined()
    expect(entry.asImage).toBeUndefined()
    for (const method of ["POST", "PUT", "DELETE"] as const) expect(matchEntry(ALLOWLIST, method, seg(ORGS)).kind).toBe("method-not-allowed")
  })

  it.each(["name=Bl&page=0&size=20", "name=Blue%20Shield&page=9999&size=20", `name=${"a".repeat(100)}&page=12&size=20`, "name=%C3%89tat%20%26%20Co&page=1&size=20"])(
    "accepts %j",
    (query) => {
      expect(buildUpstreamQuery(entry, q(query))?.toString()).toBe(q(query).toString())
    },
  )

  it.each([
    "",
    "name=Bl",
    "name=Bl&page=0",
    "page=0&size=20",
    "name=&page=0&size=20",
    `name=${"a".repeat(101)}&page=0&size=20`,
    "name=Bl%0A&page=0&size=20",
    "name=Bl&page=-1&size=20",
    "name=Bl&page=10000&size=20",
    "name=Bl&page=01&size=20",
    "name=Bl&page=0&size=50",
    "name=Bl&page=0&size=20&x=1",
    "name=Bl&name=Cd&page=0&size=20",
  ])("refuses the query %j", (query) => {
    expect(buildUpstreamQuery(entry, q(query))).toBeNull()
  })
})

/** Story 5.2: add (POST) and edit (PUT) a policy with a full `InsuranceDTO`. */
describe("POST v2/health/patient/insurance and PUT v2/health/patient/insurance/{insuranceId} entries", () => {
  const post = matched("POST", LIST)
  const put = matched("PUT", POLICY)

  it("take the same strict body, a 16 KiB cap and no query; PUT needs a numeric id", () => {
    expect(post.body).toBe(put.body)
    expect(post.maxBytes).toBe(16 * 1024)
    expect(put.maxBytes).toBe(16 * 1024)
    expect(post.profile).toBeUndefined()
    expect(buildUpstreamQuery(post, q("x=1"))).toBeNull()
    expect(buildUpstreamQuery(put, q(""))?.toString()).toBe("")
    for (const path of ["v2/health/patient/insurance/me", "v2/health/patient/insurance/abc"]) expect(matchEntry(entries, "PUT", seg(path)).kind).toBe("not-allowed")
    expect(matchEntry(ALLOWLIST, "DELETE", seg(POLICY)).kind).toBe("method-not-allowed")
  })

  it.each<[string, unknown]>([
    ["a full Self body", BODY],
    ["the required fields only", { ...BODY, insuranceGroupId: undefined, expirationDate: undefined, cancellationDate: undefined }],
    ["a new insurer by name", { ...BODY, insuranceOrganizationDTO: { insuranceCompanyName: "Acme Health" } }],
    ["Drug, Other, Spouse with a subscriber", { ...BODY, insuranceType: "DRUG", insurancePrecedence: "OTHER", relationshipToInsured: "SPOUSE", subscriber: SUBSCRIBER }],
    ["a saved subscriber without a phone or birth date", { ...BODY, relationshipToInsured: "CHILD", subscriber: { firstName: "Kim", lastName: "Lee", email: "kim@example.com" } }],
    ["an upper-case saved region", { ...BODY, relationshipToInsured: "PARENT", subscriber: { ...SUBSCRIBER, phoneNumberRegion: "US" } }],
    ...["DENTAL", "HOSPICE", "VISION"].map((type): [string, unknown] => [type, { ...BODY, insuranceType: type }]),
    ...["SECONDARY", "SUPPLEMENTAL"].map((precedence): [string, unknown] => [precedence, { ...BODY, insurancePrecedence: precedence }]),
    ["DEPENDENT", { ...BODY, relationshipToInsured: "DEPENDENT", subscriber: SUBSCRIBER }],
  ])("accepts %s", (_label, body) => {
    expect(post.body?.safeParse(body).success).toBe(true)
  })

  it.each<[string, unknown]>([
    ["N_A type", { ...BODY, insuranceType: "N_A" }],
    ["a title-case type", { ...BODY, insuranceType: "Medical" }],
    ["N_A precedence", { ...BODY, insurancePrecedence: "N_A" }],
    ["N_A relationship", { ...BODY, relationshipToInsured: "N_A" }],
    ["no insurer", { ...BODY, insuranceOrganizationDTO: undefined }],
    ["both insurer id and name", { ...BODY, insuranceOrganizationDTO: { insuranceCompanyId: 7, insuranceCompanyName: "Acme" } }],
    ["a blank insurer name", { ...BODY, insuranceOrganizationDTO: { insuranceCompanyName: "   " } }],
    ["an insurer id of 0", { ...BODY, insuranceOrganizationDTO: { insuranceCompanyId: 0 } }],
    ["a string insurer id", { ...BODY, insuranceOrganizationDTO: { insuranceCompanyId: "7" } }],
    ["no member id", { ...BODY, memberIdNumber: undefined }],
    ["a 256-character member id", { ...BODY, memberIdNumber: "a".repeat(256) }],
    ["no effective date", { ...BODY, planEffectiveDate: undefined }],
    ["an empty effective date", { ...BODY, planEffectiveDate: "" }],
    ["a display-format date", { ...BODY, expirationDate: "12/31/2026" }],
    ["an empty optional date", { ...BODY, cancellationDate: "" }],
    ["an id", { ...BODY, id: 55 }],
    ["a label", { ...BODY, label: "Deleted" }],
    ["a card file", { ...BODY, frontSideCardFile: { id: 900 } }],
    ["an extra subscriber field", { ...BODY, relationshipToInsured: "SPOUSE", subscriber: { ...SUBSCRIBER, userId: 9 } }],
    ["a subscriber without an email", { ...BODY, relationshipToInsured: "SPOUSE", subscriber: { ...SUBSCRIBER, email: undefined } }],
    ["a bad region", { ...BODY, relationshipToInsured: "SPOUSE", subscriber: { ...SUBSCRIBER, phoneNumberRegion: "usa" } }],
    ["a bad subscriber birth date", { ...BODY, relationshipToInsured: "SPOUSE", subscriber: { ...SUBSCRIBER, birthDate: "1980-5-4" } }],
    ["not an object", ["MEDICAL"]],
  ])("refuses %s", (_label, body) => {
    expect(post.body?.safeParse(body).success).toBe(false)
  })
})

/** Story 5.2 entries through the real proxy handler (shipped allowlist). */
describe("insurance writes and the insurer search through the proxy (Story 5.2)", () => {
  const proxy = createProxyHandler({ env: testEnv(), now: () => NOW })
  const UP = DEMO.apiBase

  async function send(method: "GET" | "POST" | "PUT", path: string, body?: string, contentType = "application/json"): Promise<Response> {
    const cookie = `${SESSION_COOKIE}=${await sealSession(makeSession())}`
    const headers: Record<string, string> = { cookie }
    if (body !== undefined) headers["Content-Type"] = contentType
    return proxy(new Request(`http://localhost:3000/api/1h/${path}`, { method, headers, body }))
  }

  beforeEach(() => stubServerEnv())

  it("forwards the search to upstream /api/v2/health/insurance/organizations and relays the PageImpl", async () => {
    let seen: { path: string; search: string } | undefined
    const answer = { data: [{ id: 7, name: "Blue Shield" }], lastPage: true }
    server.use(
      http.get(`${UP}/v2/health/insurance/organizations`, ({ request }) => {
        const url = new URL(request.url)
        seen = { path: url.pathname, search: url.search }
        return HttpResponse.json(answer)
      }),
    )
    const response = await send("GET", `${ORGS}?name=Blu&page=0&size=20`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(answer)
    expect(seen).toEqual({ path: "/api/v2/health/insurance/organizations", search: "?name=Blu&page=0&size=20" })
  })

  it.each<["POST" | "PUT", string, string]>([
    ["POST", LIST, "/api/v2/health/patient/insurance"],
    ["PUT", POLICY, "/api/v2/health/patient/insurance/55"],
  ])("forwards a %s with the parsed body", async (method, path, upstreamPath) => {
    let seen: { method: string; path: string; body: unknown } | undefined
    const handler = async ({ request }: { request: Request }) => {
      seen = { method: request.method, path: new URL(request.url).pathname, body: await request.json() }
      return HttpResponse.json({ id: 55 })
    }
    server.use(method === "POST" ? http.post(`${UP}/v2/health/patient/insurance`, handler) : http.put(`${UP}/v2/health/patient/insurance/:id`, handler))
    const body = { ...BODY, relationshipToInsured: "SPOUSE", subscriber: SUBSCRIBER }
    const response = await send(method, path, JSON.stringify(body))
    expect(response.status).toBe(200)
    expect(seen).toEqual({ method, path: upstreamPath, body })
  })

  it("relays an upstream 400 rule message as is", async () => {
    const message = "Member Id Number should be at least 3 symbols."
    server.use(http.post(`${UP}/v2/health/patient/insurance`, () => HttpResponse.json({ message, code: 400 }, { status: 400 })))
    const response = await send("POST", LIST, JSON.stringify(BODY))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ message, code: 400 })
  })

  describe("refusals, before any upstream call", () => {
    let upstreamCalls: () => number
    beforeEach(() => {
      upstreamCalls = trackAllRequests()
    })
    afterEach(() => expect(upstreamCalls()).toBe(0))

    it.each<[string, "GET" | "POST" | "PUT", string, string | undefined, string, number, string]>([
      ["a search without a name", "GET", `${ORGS}?page=0&size=20`, undefined, "application/json", 400, "BAD_QUERY"],
      ["a search page of 50", "GET", `${ORGS}?name=Bl&page=0&size=50`, undefined, "application/json", 400, "BAD_QUERY"],
      ["a POST with N_A", "POST", LIST, JSON.stringify({ ...BODY, insuranceType: "N_A" }), "application/json", 400, "BAD_BODY"],
      ["a PUT with an extra field", "PUT", POLICY, JSON.stringify({ ...BODY, id: 55 }), "application/json", 400, "BAD_BODY"],
      ["a POST that isn't JSON", "POST", LIST, JSON.stringify(BODY), "text/plain", 415, "UNSUPPORTED_MEDIA"],
      ["a POST with an empty body", "POST", LIST, "", "application/json", 400, "BAD_BODY"],
      ["a PUT on an owner id", "PUT", "v2/health/patient/insurance/me", JSON.stringify(BODY), "application/json", 403, "NOT_ALLOWED"],
      ["a POST over 16 KiB", "POST", LIST, JSON.stringify({ ...BODY, memberIdNumber: "a".repeat(17 * 1024) }), "application/json", 413, "TOO_LARGE"],
    ])("%s", async (_label, method, path, body, contentType, status, errorCode) => {
      const response = await send(method, path, body, contentType)
      expect(response.status).toBe(status)
      expect(await response.json()).toEqual({ errorCode, source: "proxy" })
    })
  })
})

/** Story 5.5: the policy delete. */
describe("DELETE v2/health/insurance/{id} entry (Story 5.5)", () => {
  const match = matchEntry(ALLOWLIST, "DELETE", seg("v2/health/insurance/55"))
  if (match.kind !== "matched") throw new Error("expected a match")
  const { entry } = match

  it("is this area's entry: numeric ids only, no query, no body, nothing forced, not profile", () => {
    expect(entries).toContain(entry)
    expect(entry.body).toBeUndefined()
    expect(entry.query).toBeUndefined()
    expect(entry.fixedQuery).toBeUndefined()
    expect(entry.upload).toBeUndefined()
    expect(entry.asImage).toBeUndefined()
    expect(entry.profile).toBeUndefined()
    expect(buildUpstreamQuery(entry, q(""))?.toString()).toBe("")
    expect(buildUpstreamQuery(entry, q("hardDelete=true"))).toBeNull()
    for (const id of ["abc", "-1", "1.5", "me", "", "organizations", "12345678901234567890"]) {
      expect(matchEntry(ALLOWLIST, "DELETE", seg(`v2/health/insurance/${id}`)).kind).not.toBe("matched")
    }
    // Only the policy itself: not its card files, not the patient's list.
    expect(matchEntry(ALLOWLIST, "DELETE", seg("v2/health/insurance/55/file/900")).kind).not.toBe("matched")
    expect(matchEntry(ALLOWLIST, "DELETE", seg("v2/health/patient/insurance/55")).kind).not.toBe("matched")
  })
})

describe("DELETE v2/health/insurance/{id} through the proxy (Story 5.5)", () => {
  const proxy = createProxyHandler({ env: testEnv(), now: () => NOW })

  async function remove(options: { readonly path?: string; readonly body?: string; readonly contentType?: string } = {}): Promise<Response> {
    const cookie = `${SESSION_COOKIE}=${await sealSession(makeSession())}`
    const headers: Record<string, string> = { cookie }
    if (options.contentType) headers["Content-Type"] = options.contentType
    return proxy(new Request(`http://localhost:3000/api/1h/${options.path ?? "v2/health/insurance/55"}`, { method: "DELETE", headers, body: options.body }))
  }

  beforeEach(() => stubServerEnv())

  it("forwards the DELETE to the numeric id with no query and no body, and relays the empty 200", async () => {
    let seen: { method: string; path: string; search: string; body: string } | undefined
    server.use(
      http.delete(`${DEMO.apiBase}/v2/health/insurance/55`, async ({ request }) => {
        const url = new URL(request.url)
        seen = { method: request.method, path: url.pathname, search: url.search, body: await request.text() }
        return new HttpResponse(null, { status: 200 })
      }),
    )
    const response = await remove()
    expect(response.status).toBe(200)
    expect(await response.text()).toBe("")
    expect(seen).toEqual({ method: "DELETE", path: "/api/v2/health/insurance/55", search: "", body: "" })
  })

  it("relays the backend's 400 for a policy already gone as is", async () => {
    const message = "Insurance with Id: 55 is already deleted."
    server.use(http.delete(`${DEMO.apiBase}/v2/health/insurance/55`, () => HttpResponse.json({ message, code: 400 }, { status: 400 })))
    const response = await remove()
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ message, code: 400 })
  })

  it.each<[string, Parameters<typeof remove>[0], number, string]>([
    ["a non-numeric id", { path: "v2/health/insurance/abc" }, 403, "NOT_ALLOWED"],
    ["a negative id", { path: "v2/health/insurance/-1" }, 403, "NOT_ALLOWED"],
    ["an owner id", { path: "v2/health/insurance/me" }, 403, "NOT_ALLOWED"],
    ["a query", { path: "v2/health/insurance/55?hardDelete=true" }, 400, "BAD_QUERY"],
    ["a JSON body", { body: JSON.stringify({ id: 55 }), contentType: "application/json" }, 400, "BAD_BODY"],
    ["a text body", { body: "55", contentType: "text/plain" }, 400, "BAD_BODY"],
  ])("refuses %s before upstream", async (_name, options, status, errorCode) => {
    const upstreamCalls = trackAllRequests()
    const response = await remove(options)
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ errorCode, source: "proxy" })
    expect(upstreamCalls()).toBe(0)
  })
})
