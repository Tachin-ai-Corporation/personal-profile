import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it } from "vitest"
import { stubServerEnv, testEnv } from "@/test/env-fixture"
import { server, trackAllRequests } from "@/test/msw-server"
import { callOp, expectBffError, expectNoStore } from "@/test/named-op-fixture"
import { makeSession, NOW } from "@/test/session-fixture"
import { DEMO } from "@/test/upstream-fixture"
import { createFileDeleteHandler, INSURANCE_MAX_PAGES, parseFileIdParam, SIGNATURE_FILES_QUERY, signatureFileIds } from "./file-delete"

const MYSELF = `${DEMO.apiBase}/v2/user/myself`
const GRAPHQL = `${DEMO.apiBase}/graphql`
const INSURANCE = `${DEMO.apiBase}/v2/health/patient/insurance`
const FILE = (id: number | string) => `${DEMO.apiBase}/v2/file/${id}`

const handler = createFileDeleteHandler({ env: testEnv(), now: () => NOW })
const del = (fileId: string, extra: object = {}) => callOp(handler, { method: "DELETE", path: `/api/pp/file/${fileId}`, params: { fileId }, ...extra })

const signatures = (ids: (number | string)[]) => ({ data: { Person: { records: [{ PersonHasSignatureFile: { relations: ids.map((id) => ({ record: { id } })) } }] } } })
const picture = (ids: number[]) => ({ data: { Person: { records: [{ PersonHasProfilePictureFile: { relations: ids.map((id) => ({ record: { id } })) } }] } } })
const policy = (front: number | null, back: number | null) => ({
  id: 1,
  frontSideCardFile: front === null ? null : { id: front, name: "front.png", publicURL: "x" },
  backSideCardFile: back === null ? null : { id: back, name: "back.png" },
})
const page = (content: unknown[], last = true) => ({ content, last, number: 0 })

interface Seen {
  myself: number
  graphql: number
  /** The Signature-relations GraphQL reads (counted apart from the picture reads). */
  signatureGraphql: number
  insurance: string[]
  deletes: string[]
}

/** Mocks the three ownership reads and the delete; returns what was called. */
function upstream({
  signature = null as unknown,
  pictures = [] as number[],
  signatureRelations = [] as number[],
  pages = [page([])] as unknown[],
  deleteStatus = 200,
} = {}): Seen {
  const seen: Seen = { myself: 0, graphql: 0, signatureGraphql: 0, insurance: [], deletes: [] }
  server.use(
    http.get(MYSELF, () => {
      seen.myself += 1
      return HttpResponse.json({ id: 1, signature })
    }),
    http.post(GRAPHQL, async ({ request }) => {
      const body = (await request.json()) as { query?: string }
      if (body.query === SIGNATURE_FILES_QUERY) {
        seen.signatureGraphql += 1
        return HttpResponse.json(signatures(signatureRelations))
      }
      seen.graphql += 1
      return HttpResponse.json(picture(pictures))
    }),
    http.get(INSURANCE, ({ request }) => {
      const search = new URL(request.url).searchParams
      seen.insurance.push(search.toString())
      return HttpResponse.json(pages[Number(search.get("page"))] ?? page([]))
    }),
    http.delete(`${DEMO.apiBase}/v2/file/:id`, ({ request }) => {
      seen.deletes.push(new URL(request.url).pathname + new URL(request.url).search)
      return deleteStatus === 200 ? new HttpResponse(null, { status: 200 }) : HttpResponse.json({ message: "No", code: deleteStatus }, { status: deleteStatus })
    }),
  )
  return seen
}

/** Replaces only the Signature-relations GraphQL answer (the picture read still answers "no picture"). */
function signatureGraphql(answer: () => Response): void {
  server.use(
    http.post(GRAPHQL, async ({ request }) => {
      const body = (await request.json()) as { query?: string }
      return body.query === SIGNATURE_FILES_QUERY ? answer() : HttpResponse.json(picture([]))
    }),
  )
}

beforeEach(() => stubServerEnv())

describe("DELETE /api/pp/file/[fileId] (spec F7-2)", () => {
  it("deletes the caller's Signature after only the myself read, forcing hardDelete=true", async () => {
    const seen = upstream({ signature: { id: 42, name: "sig.png" } })
    const response = await del("42")
    expect(response.status).toBe(204)
    expectNoStore(response)
    expect(seen).toEqual({ myself: 1, graphql: 0, signatureGraphql: 0, insurance: [], deletes: ["/api/v2/file/42?hardDelete=true"] })
  })

  it("deletes the caller's profile picture (any of its relations) with the session's token", async () => {
    let auth: string | null = null
    const seen = upstream({ signature: { id: 1 }, pictures: [10, 11] })
    server.use(
      http.delete(FILE(11), ({ request }) => {
        auth = request.headers.get("Authorization")
        seen.deletes.push("11")
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const session = makeSession()
    const response = await del("11", { session })
    expect(response.status).toBe(204)
    expect(auth).toBe(`Bearer ${session.accessToken}`)
    expect(seen.graphql).toBe(1)
    expect(seen.insurance).toEqual([])
  })

  it("deletes a front or back card of the caller's own policies, reading pages until the last", async () => {
    const seen = upstream({ pages: [page([policy(1, null)], false), page([policy(null, 77), policy(null, null)], true)] })
    const response = await del("77")
    expect(response.status).toBe(204)
    expect(seen.insurance).toEqual(["page=0&size=100", "page=1&size=100"])
    expect(seen.deletes).toEqual(["/api/v2/file/77?hardDelete=true"])
  })

  it("deletes an older Signature of the caller (a replaced one) found in its Signature relations, read last", async () => {
    let filter: unknown = null
    const seen = upstream({ signature: { id: 57, name: "signature.png" }, signatureRelations: [57, 41] })
    server.use(
      http.post(GRAPHQL, async ({ request }) => {
        const body = (await request.json()) as { query?: string; variables?: { filter?: unknown } }
        if (body.query !== SIGNATURE_FILES_QUERY) return HttpResponse.json(picture([]))
        seen.signatureGraphql += 1
        filter = body.variables?.filter
        return HttpResponse.json(signatures([57, 41]))
      }),
    )
    const session = makeSession()
    const response = await del("41", { session })
    expect(response.status).toBe(204)
    expect(filter).toEqual({ userId: { equal: session.userId } })
    expect(seen.myself).toBe(1)
    expect(seen.insurance).toEqual(["page=0&size=100"])
    expect(seen.signatureGraphql).toBe(1)
    expect(seen.deletes).toEqual(["/api/v2/file/41?hardDelete=true"])
  })

  it("signatureFileIds reads every relation id (number or decimal string) and rejects an unusable answer", () => {
    expect(signatureFileIds(signatures([41, "57"]))).toEqual([41, 57])
    expect(signatureFileIds({ data: { Person: { records: [] } } })).toEqual([])
    expect(signatureFileIds({ data: { Person: { records: [{ PersonHasSignatureFile: null }] } } })).toEqual([])
    expect(signatureFileIds({ errors: [{ message: "x" }], data: signatures([41]).data })).toBeUndefined()
    expect(signatureFileIds({ data: { Person: { records: [{ PersonHasSignatureFile: { relations: [{ record: { id: 0 } }] } }] } } })).toBeUndefined()
    expect(signatureFileIds([1])).toBeUndefined()
  })

  it.each([
    ["a foreign id", "999", {}],
    ["an id that is only another person's Signature (not in the caller's relations)", "41", { signatureRelations: [57] }],
    ["a foreign id while the user has no picture, signature or policy", "5", { pages: [{ content: [] , last: false }] }],
    ["a string signature id that isn't the one asked", "8", { signature: { id: "9" } }],
    ["a signature without an id", "8", { signature: { name: "x" } }],
  ])("refuses %s with 404 NO_FILE and deletes nothing", async (_label, id, options) => {
    const seen = upstream(options)
    await expectBffError(await del(id), 404, "NO_FILE")
    expect(seen.deletes).toEqual([])
  })

  it.each(["0", "-1", "abc", "1,2", "12345678901234567890", "9007199254740993"])("answers a malformed id %j like a foreign one (404 NO_FILE), with no upstream call", async (id) => {
    const count = trackAllRequests()
    await expectBffError(await del(id), 404, "NO_FILE")
    expect(count()).toBe(0)
  })

  it("parseFileIdParam takes only one positive safe-integer id", () => {
    expect(parseFileIdParam({ fileId: "42" })).toBe(42)
    expect(parseFileIdParam({ fileId: ["42"] })).toBeNull()
    expect(parseFileIdParam({})).toBeNull()
  })

  describe("fails closed when an ownership lookup fails (nothing deleted)", () => {
    it.each([
      ["myself 500", () => server.use(http.get(MYSELF, () => new HttpResponse(null, { status: 500 }))), 502, "UPSTREAM_ERROR"],
      ["myself 403", () => server.use(http.get(MYSELF, () => HttpResponse.json({ message: "No" }, { status: 403 }))), 502, "UPSTREAM_ERROR"],
      ["myself not an object", () => server.use(http.get(MYSELF, () => HttpResponse.json([1]))), 502, "UPSTREAM_ERROR"],
      ["myself 401", () => server.use(http.get(MYSELF, () => new HttpResponse(null, { status: 401 }))), 401, "TOKEN_EXPIRED"],
      ["picture GraphQL errors", () => server.use(http.post(GRAPHQL, () => HttpResponse.json({ errors: [{ message: "x" }] }))), 502, "UPSTREAM_ERROR"],
      ["picture 400", () => server.use(http.post(GRAPHQL, () => HttpResponse.json({ message: "x" }, { status: 400 }))), 502, "UPSTREAM_ERROR"],
      ["picture 500", () => server.use(http.post(GRAPHQL, () => new HttpResponse(null, { status: 500 }))), 502, "UPSTREAM_ERROR"],
      ["insurance 403", () => server.use(http.get(INSURANCE, () => HttpResponse.json({ message: "No" }, { status: 403 }))), 502, "UPSTREAM_ERROR"],
      ["insurance 500", () => server.use(http.get(INSURANCE, () => new HttpResponse(null, { status: 500 }))), 502, "UPSTREAM_ERROR"],
      ["insurance not a page", () => server.use(http.get(INSURANCE, () => HttpResponse.json([policy(5, 5)]))), 502, "UPSTREAM_ERROR"],
      ["more insurance pages than the cap", () => server.use(http.get(INSURANCE, () => HttpResponse.json(page([policy(1, 2)], false)))), 502, "UPSTREAM_ERROR"],
      ["Signature relations GraphQL errors", () => signatureGraphql(() => HttpResponse.json({ errors: [{ message: "x" }] })), 502, "UPSTREAM_ERROR"],
      ["Signature relations 400", () => signatureGraphql(() => HttpResponse.json({ message: "x" }, { status: 400 })), 502, "UPSTREAM_ERROR"],
      ["Signature relations 500", () => signatureGraphql(() => new HttpResponse(null, { status: 500 })), 502, "UPSTREAM_ERROR"],
      ["Signature relations 401", () => signatureGraphql(() => new HttpResponse(null, { status: 401 })), 401, "TOKEN_EXPIRED"],
    ] as const)("%s → %i %s", async (_label, fail, status, code) => {
      const seen = upstream()
      fail()
      await expectBffError(await del("5"), status, code)
      expect(seen.deletes).toEqual([])
    })

    it("stops at the page cap", async () => {
      const seen = upstream({ pages: Array.from({ length: INSURANCE_MAX_PAGES + 2 }, () => page([policy(1, 2)], false)) })
      await expectBffError(await del("5"), 502, "UPSTREAM_ERROR")
      expect(seen.insurance).toHaveLength(INSURANCE_MAX_PAGES)
    })
  })

  it.each([
    [404, 404],
    [403, 403],
  ])("relays an upstream %i on the delete itself", async (upstreamStatus, status) => {
    upstream({ signature: { id: 42 }, deleteStatus: upstreamStatus })
    const response = await del("42")
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ message: "No", code: upstreamStatus })
  })

  it("maps an upstream 500 on the delete to 502", async () => {
    upstream({ signature: { id: 42 }, deleteStatus: 500 })
    await expectBffError(await del("42"), 502, "UPSTREAM_ERROR")
  })

  it("needs a session, DELETE, and is under the pp kill switch", async () => {
    const count = trackAllRequests()
    await expectBffError(await del("42", { session: null }), 401, "SESSION_EXPIRED")
    await expectBffError(await callOp(handler, { method: "POST", path: "/api/pp/file/42", params: { fileId: "42" } }), 405, "METHOD_NOT_ALLOWED")
    const off = createFileDeleteHandler({ env: testEnv({ PP_DISABLED: "1" }), now: () => NOW })
    await expectBffError(await callOp(off, { method: "DELETE", path: "/api/pp/file/42", params: { fileId: "42" } }), 503, "SERVICE_DISABLED")
    expect(count()).toBe(0)
  })
})
