import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import { server } from "@/test/msw-server"
import { ApiResponseError, getPracticeSupport, keys, practiceSupportPath, swrFetcher } from "."

describe("practice-support", () => {
  it("uses only the named operation path, without a browser tenant", () => {
    expect(practiceSupportPath()).toBe("/api/pp/practice-support")
  })
  it("validates and whitelists the four support fields through its registered loader", async () => {
    server.use(http.get(practiceSupportPath(), ({ request }) => {
      expect(new URL(request.url).search).toBe("")
      return HttpResponse.json({ name: "Sample Clinic", phone: "4155552671", phoneRegion: "US", email: "support@example.com", privateConfiguration: "never" })
    }))
    expect(await swrFetcher(keys.practiceSupport())).toEqual({ name: "Sample Clinic", phone: "4155552671", phoneRegion: "US", email: "support@example.com" })
  })
  it("accepts absent optional fields", async () => {
    server.use(http.get(practiceSupportPath(), () => HttpResponse.json({})))
    expect(await getPracticeSupport()).toEqual({ success: true, statusCode: 200, data: {} })
  })
  it.each([null, [], { name: 1 }, { phone: null }, { phoneRegion: false }, { email: [] }])("rejects malformed success %j", async (body) => {
    server.use(http.get(practiceSupportPath(), () => HttpResponse.json(body)))
    expect(await getPracticeSupport()).toEqual({ success: false, statusCode: 200 })
    await expect(swrFetcher(keys.practiceSupport())).rejects.toBeInstanceOf(ApiResponseError)
  })
  it.each([403, 404, 500])("retains failure metadata for %i without leaking data", async (status) => {
    server.use(http.get(practiceSupportPath(), () => HttpResponse.json({ errorCode: "UPSTREAM_ERROR", source: "proxy" }, { status })))
    const response = await getPracticeSupport()
    expect(response).toMatchObject({ success: false, statusCode: status, errorCode: "UPSTREAM_ERROR", source: "proxy" })
    expect(response.data).toBeUndefined()
  })
})
