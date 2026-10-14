import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { server } from "../../test/server"
import { ApiError } from "./client"
import { fetcher } from "./fetcher"
import { keys } from "./keys"
import * as events from "./session-events"

let consoleSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => {
  events.__resetSessionEventsForTests()
  consoleSpy.mockRestore()
  vi.restoreAllMocks()
})

describe("fetcher", () => {
  it("dispatches keys.myself() to fetchMyself", async () => {
    server.use(
      http.get("http://localhost:3000/api/1h/v2/user/myself", () =>
        HttpResponse.json({ id: 1, personId: 2, firstName: "A", lastName: "B" }),
      ),
    )
    expect(await fetcher(keys.myself())).toEqual({ id: 1, personId: 2, firstName: "A", lastName: "B" })
  })

  it("throws an ApiError carrying the response on failure", async () => {
    server.use(
      http.get("http://localhost:3000/api/1h/v2/user/myself", () =>
        HttpResponse.json({ code: "UPSTREAM_ERROR" }, { status: 502 }),
      ),
    )
    const error = await fetcher(keys.myself()).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).errorCode).toBe("UPSTREAM_ERROR")
    expect((error as ApiError).statusCode).toBe(502)
    expect((error as ApiError).response.success).toBe(false)
  })

  it("unknown key → ApiError UNKNOWN_KEY", async () => {
    await expect(fetcher(["pp", "nope"])).rejects.toMatchObject({ errorCode: "UNKNOWN_KEY" })
    await expect(fetcher(["x", "myself"])).rejects.toMatchObject({ errorCode: "UNKNOWN_KEY" })
    await expect(fetcher(["pp", "toString"])).rejects.toMatchObject({ errorCode: "UNKNOWN_KEY" })
  })

  it("surfaces SESSION_CHANGED as an ApiError; only callApi's single publish reaches subscribers", async () => {
    const changed = vi.fn()
    events.subscribe("session-changed", changed)
    server.use(
      http.get("http://localhost:3000/api/1h/v2/user/myself", () =>
        HttpResponse.json({ code: "SESSION_CHANGED" }, { status: 409 }),
      ),
    )
    await expect(fetcher(keys.myself())).rejects.toMatchObject({ errorCode: "SESSION_CHANGED", statusCode: 409 })
    expect(changed).toHaveBeenCalledOnce()
  })
})
