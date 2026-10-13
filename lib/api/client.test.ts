import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import { server } from "../../test/server"
import { callApi } from "./client"

describe("callApi", () => {
  it("resolves a same-origin /api JSON response into a success ApiResponse", async () => {
    server.use(
      http.get("http://localhost:3000/api/1h/v2/user/myself", () =>
        HttpResponse.json({ id: 42, name: "Test User" }),
      ),
    )

    const res = await callApi<{ id: number; name: string }>("myself/fetch", "/api/1h/v2/user/myself")

    expect(res.success).toBe(true)
    expect(res.statusCode).toBe(200)
    expect(res.data).toEqual({ id: 42, name: "Test User" })
  })

  it("maps a non-2xx response to a failure ApiResponse with the status code", async () => {
    server.use(
      http.get("http://localhost:3000/api/1h/v2/user/myself", () =>
        HttpResponse.json({ code: "TOKEN_EXPIRED" }, { status: 401 }),
      ),
    )

    const res = await callApi("myself/fetch", "/api/1h/v2/user/myself")

    expect(res.success).toBe(false)
    expect(res.statusCode).toBe(401)
  })
})
