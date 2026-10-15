import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"
import { server } from "@/test/msw-server"
import { checkPageUser, createCallApi, createPageUser, createSessionEvents, myselfPath, pageUser, sessionEvents, type CallApiInit } from "."

const MYSELF = "/api/1h/v2/user/myself"

describe("pageUser (D-A)", () => {
  it("pins the first id only, until reset", () => {
    const user = createPageUser()
    expect(user.id()).toBeUndefined()
    user.pin(42)
    user.pin(43)
    expect(user.id()).toBe(42)
    user.reset()
    expect(user.id()).toBeUndefined()
    user.pin(43)
    expect(user.id()).toBe(43)
  })

  it("is verified only while a batch runs (nested, failing or not)", async () => {
    const user = createPageUser()
    expect(user.isVerified()).toBe(false)
    const seen: boolean[] = []
    const result = await user.runVerified(async () => {
      seen.push(user.isVerified())
      await user.runVerified(async () => seen.push(user.isVerified()))
      seen.push(user.isVerified())
      return "done"
    })
    expect(result).toBe("done")
    expect(seen).toEqual([true, true, true])
    expect(user.isVerified()).toBe(false)
    await expect(user.runVerified(async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom")
    expect(user.isVerified()).toBe(false)
  })

  it("reset also ends a running batch", async () => {
    const user = createPageUser()
    let release: () => void = () => undefined
    const running = user.runVerified(() => new Promise<void>((resolve) => (release = resolve)))
    expect(user.isVerified()).toBe(true)
    user.reset()
    expect(user.isVerified()).toBe(false)
    release()
    await running
  })

  it("a batch reset while pending never makes the count negative: the next batch is verified", async () => {
    const user = createPageUser()
    let release: () => void = () => undefined
    const running = user.runVerified(() => new Promise<void>((resolve) => (release = resolve)))
    user.reset()
    release()
    await running
    expect(user.isVerified()).toBe(false)
    await user.runVerified(async () => expect(user.isVerified()).toBe(true))
    expect(user.isVerified()).toBe(false)
  })

  it("is the page-lifetime instance re-exported from @/lib/api (reset per test by setup-dom)", () => {
    expect(pageUser.id()).toBeUndefined()
  })
})

describe("checkPageUser (D-A)", () => {
  function setup(pinned?: number) {
    const user = createPageUser()
    if (pinned !== undefined) user.pin(pinned)
    const events = createSessionEvents()
    const published: string[] = []
    events.subscribe("session-expired", () => published.push("session-expired"))
    const call = createCallApi({ events, locks: () => undefined, pageUser: user })
    return { user, events, published, call }
  }

  function myselfAnswers(...answers: (() => Response)[]): { readonly requests: Request[] } {
    const requests: Request[] = []
    server.use(
      http.get(MYSELF, ({ request }) => {
        requests.push(request)
        return (answers[requests.length - 1] ?? answers[answers.length - 1])()
      }),
    )
    return { requests }
  }

  it("unpinned: no request", async () => {
    const { call, user, events } = setup()
    let calls = 0
    function counting<T>(context: string, path: string, init?: CallApiInit) {
      calls += 1
      return call<T>(context, path, init)
    }
    expect(await checkPageUser(counting, { pageUser: user, events })).toEqual({ kind: "unpinned" })
    expect(calls).toBe(0)
  })

  it("same id: a fresh, uncached GET of the myself proxy path", async () => {
    const { call, user, events, published } = setup(42)
    const { requests } = myselfAnswers(() => HttpResponse.json({ id: 42 }))
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    expect(await checkPageUser(call, { pageUser: user, events })).toEqual({ kind: "same" })
    expect(requests).toHaveLength(1)
    expect(new URL(requests[0].url).pathname).toBe(myselfPath())
    expect(requests[0].method).toBe("GET")
    expect(fetchSpy.mock.calls[0][1]?.cache).toBe("no-store")
    expect(published).toEqual([])
  })

  it("another id: publishes session-expired once", async () => {
    const { call, user, events, published } = setup(42)
    myselfAnswers(() => HttpResponse.json({ id: 43 }))
    expect(await checkPageUser(call, { pageUser: user, events })).toEqual({ kind: "other" })
    expect(await checkPageUser(call, { pageUser: user, events })).toEqual({ kind: "other" })
    expect(published).toEqual(["session-expired"])
  })

  it.each([
    ["no id", () => HttpResponse.json({})],
    ["a string id", () => HttpResponse.json({ id: "42" })],
    ["a null body", () => HttpResponse.json(null)],
    ["an empty 204", () => new HttpResponse(null, { status: 204 })],
  ])("a body with %s: fails closed with no publish", async (_label, answer) => {
    const { call, user, events, published } = setup(42)
    myselfAnswers(answer)
    const check = await checkPageUser(call, { pageUser: user, events })
    expect(check).toMatchObject({ kind: "failed", response: { success: false, error: "page-user/check returned an unexpected shape" } })
    expect(published).toEqual([])
  })

  it("a failed check returns its failure (network, 502)", async () => {
    const { call, user, events } = setup(42)
    myselfAnswers(() => HttpResponse.error())
    expect(await checkPageUser(call, { pageUser: user, events })).toMatchObject({ kind: "failed", response: { success: false, errorCode: "NETWORK_ERROR" } })
    myselfAnswers(() => HttpResponse.json({ errorCode: "UPSTREAM_ERROR", source: "proxy" }, { status: 502 }))
    const check = await checkPageUser(call, { pageUser: user, events })
    expect(check).toMatchObject({ kind: "failed", response: { success: false, statusCode: 502, errorCode: "UPSTREAM_ERROR" } })
    expect(check.kind === "failed" && check.response.data).toBeUndefined()
  })

  it("defaults to the page-lifetime pageUser and session events", async () => {
    const call = createCallApi({ locks: () => undefined })
    expect(await checkPageUser(call)).toEqual({ kind: "unpinned" })
    pageUser.pin(42)
    myselfAnswers(() => HttpResponse.json({ id: 43 }))
    expect(await checkPageUser(call)).toEqual({ kind: "other" })
    expect(sessionEvents.hasPublished("session-expired")).toBe(true)
  })
})
