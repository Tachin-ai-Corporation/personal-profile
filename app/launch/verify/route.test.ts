// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * Branch coverage for `app/launch/verify/route.ts` (AD-4). `getSession` is mocked
 * so both the cookie-stuck and cookie-missing paths are exercised; `cache-headers`
 * is the real module.
 */

vi.mock("@/lib/server/session", () => ({ getSession: vi.fn() }))

import { getSession as getSessionImport } from "@/lib/server/session"
import { GET } from "./route"

const getSession = vi.mocked(getSessionImport)

function verifyRequest(query = "tab=contacts") {
  return new Request(`http://localhost:3000/launch/verify?${query}`) as unknown as import("next/server").NextRequest
}

function assertNoStore(res: Response) {
  expect(res.headers.get("cache-control")).toBe("private, no-store, max-age=0")
  expect(res.headers.get("pragma")).toBe("no-cache")
  expect(res.headers.get("vary")).toBe("Cookie")
}

afterEach(() => {
  vi.clearAllMocks()
})

describe("GET /launch/verify", () => {
  it("redirects to the cookies screen when the session did not stick", async () => {
    getSession.mockResolvedValue(null)
    const res = await GET(verifyRequest())
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toBe("/launch-error?reason=cookies")
    assertNoStore(res)
  })

  it("redirects to the profile page with the tab when the session is present", async () => {
    getSession.mockResolvedValue({ sid: "abc", userId: 42 } as never)
    const res = await GET(verifyRequest("tab=insurance"))
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toBe("/?tab=insurance")
    assertNoStore(res)
  })

  it("normalizes an unknown tab to contacts", async () => {
    getSession.mockResolvedValue({ sid: "abc" } as never)
    const res = await GET(verifyRequest("tab=bogus"))
    expect(res.headers.get("location")).toBe("/?tab=contacts")
  })
})
