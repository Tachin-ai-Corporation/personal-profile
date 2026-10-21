import { channel } from "node:diagnostics_channel"
import { getResponse, http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { stubServerEnv, testEnv } from "@/test/env-fixture"
import { server, trackAllRequests } from "@/test/msw-server"
import { callOp, expectBffError, expectNoStore } from "@/test/named-op-fixture"
import { makeSession, NOW } from "@/test/session-fixture"
import { DEMO } from "@/test/upstream-fixture"
import {
  createFileDeleteHandler,
  INSURANCE_CARD_FILES_QUERY,
  INSURANCE_MAX_PAGES,
  insuranceCardFileIds,
  parseFileIdParam,
  SIGNATURE_FILES_QUERY,
  signatureFileIds,
} from "./file-delete"
import { PROFILE_PICTURE_QUERY } from "./profile-picture-id"

const MYSELF = `${DEMO.apiBase}/v2/user/myself`
const GRAPHQL = `${DEMO.apiBase}/graphql`
const INSURANCE = `${DEMO.apiBase}/v2/health/patient/insurance`
const FILE = (id: number | string) => `${DEMO.apiBase}/v2/file/${id}`

const handler = createFileDeleteHandler({ env: testEnv(), now: () => NOW })
const del = (fileId: string, extra: object = {}) => callOp(handler, { method: "DELETE", path: `/api/pp/file/${fileId}`, params: { fileId }, ...extra })

const signatures = (ids: (number | string)[]) => ({ data: { Person: { records: [{ PersonHasSignatureFile: { relations: ids.map((id) => ({ record: { id } })) } }] } } })
const picture = (ids: number[]) => ({ data: { Person: { records: [{ PersonHasProfilePictureFile: { relations: ids.map((id) => ({ record: { id } })) } }] } } })
/** The card relations answer: per policy, its front and back relation file ids. */
const cards = (records: { id: number | string; front?: (number | string)[]; back?: (number | string)[] }[]) => ({
  data: {
    Insurance: {
      records: records.map(({ id, front = [], back = [] }) => ({
        id,
        InsuranceHasFrontSideCardFile: { relations: front.map((id) => ({ record: { id } })) },
        InsuranceHasBackSideCardFile: { relations: back.map((id) => ({ record: { id } })) },
      })),
    },
  },
})
const policy = (front: number | null, back: number | null, id = 1) => ({
  id,
  frontSideCardFile: front === null ? null : { id: front, name: "front.png", publicURL: "x" },
  backSideCardFile: back === null ? null : { id: back, name: "back.png" },
})
/**
 * One `GET v2/health/patient/insurance` page as the backend serializes its own
 * `PageImpl` (`com.sirma.bocore.common.repository.PageImpl`, Jackson names
 * `isLastPage()` → `lastPage`), not Spring's `{ content, last }`.
 */
const page = (data: unknown[], lastPage = true, pageNumber = 0) => ({
  data,
  pageNumber,
  pageSize: 100,
  offset: pageNumber * 100,
  emptyPage: data.length === 0,
  firstPage: pageNumber === 0,
  lastPage,
  numberOfElements: data.length,
  totalElements: pageNumber * 100 + data.length,
  totalPages: lastPage ? pageNumber + 1 : pageNumber + 2,
})

interface Seen {
  myself: number
  graphql: number
  /** The Signature-relations GraphQL reads (counted apart from the picture reads). */
  signatureGraphql: number
  /** The card-relations GraphQL reads, with their filters. */
  cardFilters: unknown[]
  insurance: string[]
  deletes: string[]
}

/** Mocks the three ownership reads and the delete; returns what was called. */
function upstream({
  signature = null as unknown,
  pictures = [] as number[],
  signatureRelations = [] as number[],
  cardRelations = cards([]) as Record<string, unknown>,
  pages = [page([])] as unknown[],
  deleteStatus = 200,
} = {}): Seen {
  const seen: Seen = { myself: 0, graphql: 0, signatureGraphql: 0, cardFilters: [], insurance: [], deletes: [] }
  server.use(
    http.get(MYSELF, () => {
      seen.myself += 1
      return HttpResponse.json({ id: 1, signature })
    }),
    http.post(GRAPHQL, async ({ request }) => {
      const body = (await request.json()) as { query?: string; variables?: { filter?: unknown } }
      if (body.query === SIGNATURE_FILES_QUERY) {
        seen.signatureGraphql += 1
        return HttpResponse.json(signatures(signatureRelations))
      }
      if (body.query === INSURANCE_CARD_FILES_QUERY) {
        seen.cardFilters.push(body.variables?.filter)
        return HttpResponse.json(cardRelations)
      }
      expect(body.query).toBe(PROFILE_PICTURE_QUERY)
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
      if (body.query === SIGNATURE_FILES_QUERY) return answer()
      expect(body.query).toBe(PROFILE_PICTURE_QUERY)
      return HttpResponse.json(picture([]))
    }),
  )
}

const mockFailures: unknown[] = []

beforeEach(() => {
  mockFailures.length = 0
  stubServerEnv()
  // MSW 3's Node Fetch interceptor delegates to Undici and mocks sockets.
  // Resolve these handlers at Fetch instead: asynchronous GraphQL body reads
  // must never depend on pooled TLS sockets or fall through to the network.
  // Vitest's unstubGlobals restores the intercepted Fetch before the next test.
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    request.signal.throwIfAborted()
    const handlers = server.listHandlers().filter((handler) => handler.kind === "request")
    let abort!: () => void
    const aborted = new Promise<never>((_resolve, reject) => {
      abort = () => reject(request.signal.reason)
      request.signal.addEventListener("abort", abort, { once: true })
    })
    const resolved = getResponse(handlers, request).then((response) => {
      if (!response) throw new Error(`Unhandled file-delete test request: ${request.method} ${request.url}`)
      return response
    }).catch((error: unknown) => {
      mockFailures.push(error)
      throw error
    })
    try {
      const response = await Promise.race([resolved, aborted])
      if (response.type === "error") throw new TypeError("Failed to fetch")
      return response
    } finally {
      request.signal.removeEventListener("abort", abort)
    }
  })
})

afterEach(() => {
  // Runtime error mapping must never hide an invalid test setup behind a 502.
  expect(mockFailures, "Unexpected request or MSW handler failure").toEqual([])
})

describe("DELETE /api/pp/file/[fileId] (spec F7-2)", () => {
  it("rejects an unmocked request without falling through to native Fetch", async () => {
    await expect(fetch(MYSELF)).rejects.toThrow(`Unhandled file-delete test request: GET ${MYSELF}`)
    expect(mockFailures.splice(0)).toEqual([expect.objectContaining({ message: `Unhandled file-delete test request: GET ${MYSELF}` })])
  })

  it("preserves already-aborted and pending request cancellation", async () => {
    let entered!: () => void
    const inHandler = new Promise<void>((resolve) => { entered = resolve })
    server.use(http.get(MYSELF, async ({ request }) => {
      entered()
      await new Promise<void>((resolve) => request.signal.addEventListener("abort", () => resolve(), { once: true }))
      return HttpResponse.json({ id: 42 })
    }))
    const stopped = AbortSignal.abort(new DOMException("Stopped", "AbortError"))
    await expect(fetch(MYSELF, { signal: stopped })).rejects.toBe(stopped.reason)
    const controller = new AbortController()
    const pending = fetch(MYSELF, { signal: controller.signal })
    // Let MSW enter the held handler before aborting it.
    await inHandler
    controller.abort(new DOMException("Deadline", "TimeoutError"))
    await expect(pending).rejects.toBe(controller.signal.reason)
  })

  it("records a broken handler even when runtime maps its rejection to UPSTREAM_ERROR", async () => {
    const broken = new Error("Broken test resolver")
    server.use(http.get(MYSELF, () => { throw broken }))
    await expectBffError(await del("5"), 502, "UPSTREAM_ERROR")
    expect(mockFailures.splice(0)).toEqual([broken])
  })

  it("resolves both GraphQL documents without dispatching a native Undici request", async () => {
    const requests = channel("undici:request:create")
    const dispatched = vi.fn()
    requests.subscribe(dispatched)
    try {
      const seen = upstream()
      await expectBffError(await del("999"), 404, "NO_FILE")
      expect(seen).toEqual({ myself: 1, graphql: 1, signatureGraphql: 1, cardFilters: [], insurance: ["page=0&size=100"], deletes: [] })
      expect(dispatched).not.toHaveBeenCalled()
    } finally {
      requests.unsubscribe(dispatched)
    }
  })

  it("deletes the caller's Signature after only the myself read, forcing hardDelete=true", async () => {
    const seen = upstream({ signature: { id: 42, name: "sig.png" } })
    const response = await del("42")
    expect(response.status).toBe(204)
    expectNoStore(response)
    expect(seen).toEqual({ myself: 1, graphql: 0, signatureGraphql: 0, cardFilters: [], insurance: [], deletes: ["/api/v2/file/42?hardDelete=true"] })
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
    const seen = upstream({ pages: [page([policy(1, null)], false, 0), page([policy(null, 77), policy(null, null)], true, 1)] })
    const response = await del("77")
    expect(response.status).toBe(204)
    expect(seen.insurance).toEqual(["page=0&size=100", "page=1&size=100"])
    expect(seen.deletes).toEqual(["/api/v2/file/77?hardDelete=true"])
  })

  it("follows a multi-page backend PageImpl (lastPage false, false, then true) to a front card on the last page", async () => {
    const seen = upstream({
      pages: [page([policy(1, 2)], false, 0), page([policy(3, null)], false, 1), page([policy(88, 4)], true, 2), page([policy(99, null)], true, 3)],
    })
    const response = await del("88")
    expect(response.status).toBe(204)
    expect(seen.insurance).toEqual(["page=0&size=100", "page=1&size=100", "page=2&size=100"])
    expect(seen.deletes).toEqual(["/api/v2/file/88?hardDelete=true"])
  })

  it.each([
    ["lastPage is true", [page([policy(1, 2)], true, 0), page([policy(66, null)], true, 1)]],
    ["lastPage is missing", [{ data: [policy(1, 2)] }, page([policy(66, null)], true, 1)]],
    ["data is empty although lastPage is false", [page([], false, 0), page([policy(66, null)], true, 1)]],
  ])("stops reading insurance pages when %s", async (_label, pages) => {
    const seen = upstream({ pages })
    await expectBffError(await del("66"), 404, "NO_FILE")
    expect(seen.insurance).toEqual(["page=0&size=100"])
    expect(seen.deletes).toEqual([])
  })

  it("deletes an older Signature of the caller (a replaced one) found in its Signature relations, read last", async () => {
    let filter: unknown = null
    const seen = upstream({ signature: { id: 57, name: "signature.png" }, signatureRelations: [57, 41] })
    server.use(
      http.post(GRAPHQL, async ({ request }) => {
        const body = (await request.json()) as { query?: string; variables?: { filter?: unknown } }
        if (body.query !== SIGNATURE_FILES_QUERY) {
          expect(body.query).toBe(PROFILE_PICTURE_QUERY)
          seen.graphql += 1
          return HttpResponse.json(picture([]))
        }
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
    expect(seen.graphql).toBe(1)
    expect(seen.insurance).toEqual(["page=0&size=100"])
    expect(seen.signatureGraphql).toBe(1)
    expect(seen.deletes).toEqual(["/api/v2/file/41?hardDelete=true"])
  })

  describe("older insurance cards (Story 5.3, decision 1A: replace, then delete)", () => {
    it("deletes a replaced (older) card of the caller's policy, found in its card relations, read last", async () => {
      const seen = upstream({
        pages: [page([policy(70, 71, 501), policy(null, null, 502)])],
        cardRelations: cards([{ id: 501, front: [70, 60], back: [71] }, { id: 502 }]),
      })
      const response = await del("60")
      expect(response.status).toBe(204)
      expect(seen.insurance).toEqual(["page=0&size=100"])
      expect(seen.signatureGraphql).toBe(1)
      expect(seen.cardFilters).toEqual([{ id: { in: [501, 502] } }])
      expect(seen.deletes).toEqual(["/api/v2/file/60?hardDelete=true"])
    })

    it("asks for the card relations of every policy of every page", async () => {
      const seen = upstream({
        pages: [page([policy(1, 2, 11)], false, 0), page([policy(null, null, 12)], true, 1)],
        cardRelations: cards([{ id: 11 }, { id: "12", back: ["61"] }]),
      })
      expect((await del("61")).status).toBe(204)
      expect(seen.cardFilters).toEqual([{ id: { in: [11, 12] } }])
    })

    it("deletes the newest card from the list alone (no relations read)", async () => {
      const seen = upstream({ pages: [page([policy(70, 71, 501)])] })
      expect((await del("71")).status).toBe(204)
      expect(seen.signatureGraphql).toBe(0)
      expect(seen.cardFilters).toEqual([])
    })

    it.each([
      ["a stranger's card id (not among the caller's card relations)", { pages: [page([policy(70, 71, 501)])], cardRelations: cards([{ id: 501, front: [70, 60], back: [71] }]) }],
      // The filter isn't trusted: a record that isn't one of the caller's policies doesn't count.
      ["a card of a stranger's policy record in the answer (filter ignored)", { pages: [page([policy(70, 71, 501)])], cardRelations: cards([{ id: 501, front: [70] }, { id: 777, front: [999] }]) }],
      ["any id when no listed policy has an id", { pages: [page([{ frontSideCardFile: { id: 70 } }])] }],
    ])("refuses %s with 404 NO_FILE", async (_label, options) => {
      const seen = upstream(options)
      await expectBffError(await del("999"), 404, "NO_FILE")
      expect(seen.deletes).toEqual([])
    })

    it("skips the card relations read without policies", async () => {
      const seen = upstream({ pages: [page([])] })
      await expectBffError(await del("999"), 404, "NO_FILE")
      expect(seen.cardFilters).toEqual([])
    })

    it.each([
      ["GraphQL errors", () => HttpResponse.json({ errors: [{ message: "x" }] }), 502, "UPSTREAM_ERROR"],
      ["an unexpected shape", () => HttpResponse.json({ data: { Insurance: null } }), 502, "UPSTREAM_ERROR"],
      ["a 400", () => HttpResponse.json({ message: "x" }, { status: 400 }), 502, "UPSTREAM_ERROR"],
      ["a 500", () => new HttpResponse(null, { status: 500 }), 502, "UPSTREAM_ERROR"],
      ["a 401", () => new HttpResponse(null, { status: 401 }), 401, "TOKEN_EXPIRED"],
    ] as const)("fails closed when the card relations read answers %s (nothing deleted)", async (_label, answer, status, code) => {
      const seen = upstream({ pages: [page([policy(70, 71, 501)])] })
      server.use(
        http.post(GRAPHQL, async ({ request }) => {
          const body = (await request.json()) as { query?: string }
          if (body.query === INSURANCE_CARD_FILES_QUERY) return answer()
          if (body.query === SIGNATURE_FILES_QUERY) return HttpResponse.json(signatures([]))
          expect(body.query).toBe(PROFILE_PICTURE_QUERY)
          return HttpResponse.json(picture([]))
        }),
      )
      await expectBffError(await del("60"), status, code)
      expect(seen.deletes).toEqual([])
    })

    it("insuranceCardFileIds reads every front and back relation id of the caller's policies only, and rejects an unusable answer", () => {
      expect(insuranceCardFileIds(cards([{ id: 5, front: [1, "2"], back: [3] }, { id: 6, back: [4] }]), [5, 6])).toEqual([1, 2, 3, 4])
      expect(insuranceCardFileIds(cards([{ id: 5, front: [1] }, { id: 9, front: [8] }]), [5])).toEqual([1])
      expect(insuranceCardFileIds({ data: { Insurance: { records: [{ id: 5, InsuranceHasFrontSideCardFile: null }] } } }, [5])).toEqual([])
      expect(insuranceCardFileIds({ data: { Insurance: { records: [] } } }, [5])).toEqual([])
      expect(insuranceCardFileIds({ errors: [{ message: "x" }], data: cards([{ id: 5, front: [1] }]).data }, [5])).toBeUndefined()
      expect(insuranceCardFileIds(cards([{ id: 5, front: [0] }]), [5])).toBeUndefined()
      expect(insuranceCardFileIds({ data: { Insurance: { records: [{ InsuranceHasFrontSideCardFile: { relations: [{ record: { id: 1 } }] } }] } } }, [5])).toBeUndefined()
      expect(insuranceCardFileIds([1], [5])).toBeUndefined()
    })

    it.each([
      ["GraphQL errors", () => HttpResponse.json({ errors: [{ message: "x" }] })],
      ["a 500", () => new HttpResponse(null, { status: 500 })],
    ] as const)("an older Signature is found before the card relations are read (they fail with %s): 204", async (_label, answer) => {
      const seen = upstream({ signature: { id: 57 }, signatureRelations: [57, 41], pages: [page([policy(70, 71, 501)])] })
      let cardReads = 0
      server.use(
        http.post(GRAPHQL, async ({ request }) => {
          const body = (await request.json()) as { query?: string }
          if (body.query === INSURANCE_CARD_FILES_QUERY) {
            cardReads += 1
            return answer()
          }
          if (body.query === SIGNATURE_FILES_QUERY) return HttpResponse.json(signatures([57, 41]))
          expect(body.query).toBe(PROFILE_PICTURE_QUERY)
          return HttpResponse.json(picture([]))
        }),
      )
      const response = await del("41")
      expect(response.status).toBe(204)
      expect(cardReads).toBe(0)
      expect(seen.deletes).toEqual(["/api/v2/file/41?hardDelete=true"])
    })
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
    ["a foreign id while the user has no picture, signature or policy", "5", { pages: [page([], false)] }],
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
      ["insurance as a Spring page ({ content, last }), not the backend's PageImpl", () => server.use(http.get(INSURANCE, () => HttpResponse.json({ content: [policy(5, 5)], last: true }))), 502, "UPSTREAM_ERROR"],
      ["insurance page data null", () => server.use(http.get(INSURANCE, () => HttpResponse.json({ ...page([]), data: null }))), 502, "UPSTREAM_ERROR"],
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
      const seen = upstream({ pages: Array.from({ length: INSURANCE_MAX_PAGES + 2 }, (_, n) => page([policy(1, 2)], false, n)) })
      await expectBffError(await del("5"), 502, "UPSTREAM_ERROR")
      expect(seen.insurance).toHaveLength(INSURANCE_MAX_PAGES)
      expect(seen.insurance).toEqual(Array.from({ length: INSURANCE_MAX_PAGES }, (_, page) => `page=${page}&size=100`))
      expect(seen.myself).toBe(1)
      expect(seen.graphql).toBe(1)
      expect(seen.signatureGraphql).toBe(0)
      expect(seen.deletes).toEqual([])
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
