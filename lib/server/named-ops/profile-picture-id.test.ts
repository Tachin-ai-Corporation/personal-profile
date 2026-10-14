import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it } from "vitest"
import { setLogSink } from "@/lib/server/log"
import { stubServerEnv, testEnv } from "@/test/env-fixture"
import { server, trackAllRequests } from "@/test/msw-server"
import { callOp, expectBffError, expectNoStore } from "@/test/named-op-fixture"
import { makeSession, NOW } from "@/test/session-fixture"
import { DEMO, PROD } from "@/test/upstream-fixture"
import { createProfilePictureIdHandler, pictureFileId, PROFILE_PICTURE_QUERY } from "./profile-picture-id"

const PATH = "/api/pp/profile-picture-id"
const handler = createProfilePictureIdHandler({ env: testEnv(), now: () => NOW })
const graphql = (apiBase: string) => `${apiBase}/graphql`
const answer = (ids: number[]) => ({ data: { Person: { records: [{ PersonHasProfilePictureFile: { relations: ids.map((id) => ({ record: { id } })) } }] } } })

beforeEach(() => stubServerEnv())

describe("GET /api/pp/profile-picture-id", () => {
  it("runs the server's GraphQL document for the session's user only, and answers { fileId }", async () => {
    let seen: { body: unknown; auth: string | null } | undefined
    server.use(
      http.post(graphql(DEMO.apiBase), async ({ request }) => {
        seen = { body: await request.json(), auth: request.headers.get("Authorization") }
        return HttpResponse.json(answer([321]))
      }),
    )
    const session = makeSession({ userId: 77 })
    const response = await callOp(handler, { path: PATH, session })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ fileId: 321 })
    expectNoStore(response)
    expect(seen).toEqual({
      body: { query: PROFILE_PICTURE_QUERY, variables: { filter: { userId: { equal: 77 } } } },
      auth: `Bearer ${session.accessToken}`,
    })
  })

  it("uses the session's environment", async () => {
    server.use(http.post(graphql(PROD.apiBase), () => HttpResponse.json(answer([]))))
    const response = await callOp(handler, { path: PATH, session: makeSession({ environment: "prod" }) })
    expect(await response.json()).toEqual({ fileId: null })
  })

  it("accepts a Long id serialized as a decimal string", async () => {
    server.use(
      http.post(graphql(DEMO.apiBase), () =>
        HttpResponse.json({ data: { Person: { records: [{ PersonHasProfilePictureFile: { relations: [{ record: { id: "4567" } }] } }] } } }),
      ),
    )
    expect(await (await callOp(handler, { path: PATH })).json()).toEqual({ fileId: 4567 })
  })

  it.each([
    ["no relation", answer([])],
    ["no person record", { data: { Person: { records: [] } } }],
    ["a null relation", { data: { Person: { records: [{ PersonHasProfilePictureFile: null }] } } }],
  ])("%s → { fileId: null }", async (_label, body) => {
    server.use(http.post(graphql(DEMO.apiBase), () => HttpResponse.json(body)))
    expect(await (await callOp(handler, { path: PATH })).json()).toEqual({ fileId: null })
  })

  it.each([
    ["GraphQL errors (even with data)", () => HttpResponse.json({ ...answer([1]), errors: [{ message: "secret detail" }] }), 502, "UPSTREAM_ERROR"],
    ["an unexpected shape", () => HttpResponse.json({ data: { Person: null } }), 502, "UPSTREAM_ERROR"],
    ["an id that is not a decimal", () => HttpResponse.json({ data: { Person: { records: [{ PersonHasProfilePictureFile: { relations: [{ record: { id: "12a" } }] } }] } } }), 502, "UPSTREAM_ERROR"],
    ["an id above 2^53", () => HttpResponse.json({ data: { Person: { records: [{ PersonHasProfilePictureFile: { relations: [{ record: { id: "12345678901234567890" } }] } }] } } }), 502, "UPSTREAM_ERROR"],
    ["an upstream 4xx", () => HttpResponse.json({ message: "No" }, { status: 400 }), 502, "UPSTREAM_ERROR"],
    ["an upstream 5xx", () => HttpResponse.json({ trace: "x" }, { status: 500 }), 502, "UPSTREAM_ERROR"],
    ["an upstream 401", () => new HttpResponse(null, { status: 401 }), 401, "TOKEN_EXPIRED"],
  ])("%s → %i %s, no upstream body", async (_label, resolver, status, errorCode) => {
    server.use(http.post(graphql(DEMO.apiBase), resolver))
    await expectBffError(await callOp(handler, { path: PATH }), status, errorCode)
  })

  it.each([
    ["no session", { session: null }, {}, 401, "SESSION_EXPIRED"],
    ["PP_DISABLED=1", {}, { PP_DISABLED: "1" }, 503, "SERVICE_DISABLED"],
    ["a client query", { path: `${PATH}?userId=1` }, {}, 400, "BAD_QUERY"],
    ["POST", { method: "POST" }, {}, 405, "METHOD_NOT_ALLOWED"],
  ] as const)("%s → %i %s with no upstream call", async (_label, overrides, env, status, errorCode) => {
    const calls = trackAllRequests()
    const h = createProfilePictureIdHandler({ env: testEnv(env), now: () => NOW })
    await expectBffError(await callOp(h, { path: PATH, ...overrides }), status, errorCode)
    expect(calls()).toBe(0)
  })

  it("ACCOUNT_DISABLED=1 does not switch it off (Personal Profile header)", async () => {
    server.use(http.post(graphql(DEMO.apiBase), () => HttpResponse.json(answer([]))))
    const h = createProfilePictureIdHandler({ env: testEnv({ ACCOUNT_DISABLED: "1" }), now: () => NOW })
    expect((await callOp(h, { path: PATH })).status).toBe(200)
  })

  it("logs the route template only", async () => {
    server.use(http.post(graphql(DEMO.apiBase), () => HttpResponse.json(answer([555]))))
    const lines: string[] = []
    const restore = setLogSink({ info: (l) => void lines.push(l), warn: (l) => void lines.push(l), error: (l) => void lines.push(l) })
    await callOp(handler, { path: PATH })
    restore()
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0])).toMatchObject({ routeTemplate: PATH, status: 200 })
    expect(lines[0]).not.toContain("555")
  })
})

describe("pictureFileId", () => {
  it("ignores everything but the first relation id", () => {
    expect(pictureFileId(answer([9, 10]))).toBe(9)
    expect(pictureFileId({ errors: [] , ...answer([3]) })).toBe(3)
    expect(pictureFileId(null)).toBeUndefined()
  })
})
