import { describe, expect, it } from "vitest"
import { ACCOUNT_LOCALE, localePath, timeZonePath } from "."

/** Personal account settings (Team B, Epic 7). Team B adds its own cases here. */
describe("account", () => {
  it("paths and constants", () => {
    expect(ACCOUNT_LOCALE).toBe("en-US")
    expect(timeZonePath("America/Chicago")).toBe("/api/1h/v2/user/time-zone?timeZone=America%2FChicago")
    expect(localePath()).toBe("/api/1h/v2/user/locale?locale=en-US")
  })
})

import { beforeEach } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@/test/msw-server"
import { myselfWire } from "@/test/myself-fixture"
import { fetchMyself, updateAccount, setTimeZone, setLocale } from "."

describe("Account writes through guarded transport", () => {
  beforeEach(async () => {
    server.use(http.get("/api/1h/v2/user/myself", () => HttpResponse.json(myselfWire())))
    await fetchMyself()
  })
  it("sends only allowed details, handles void success and never leaks a wider input", async () => {
    let body: unknown
    server.use(http.put("/api/1h/v2/user/edit", async ({ request }) => { body = await request.json(); return new HttpResponse(null, { status: 204 }) }))
    const diff = { firstName: "Bea", lastName: "Lee", birthDate: "1990-04-15", preferredLanguage: "en", username: "never", locale: "en-US", password: "never" }
    expect(await updateAccount(diff)).toEqual({ success: true, statusCode: 204 })
    expect(body).toEqual({ firstName: "Bea", lastName: "Lee", birthDate: "1990-04-15", preferredLanguage: "en" })
  })
  it("regional calls send required query parameters, no body, and accept non-JSON success", async () => {
    const requests: string[] = []
    server.use(http.post("/api/1h/v2/user/:part", async ({ request }) => { requests.push(request.url); expect(await request.text()).toBe(""); return new HttpResponse("OK") }))
    expect(await setTimeZone("America/Chicago")).toEqual({ success: true, statusCode: 200 })
    expect(await setLocale()).toEqual({ success: true, statusCode: 200 })
    expect(requests[0]).toContain("timeZone=America%2FChicago")
    expect(requests[1]).toContain("locale=en-US")
  })
  it("passes failures through unchanged and permits a details subset", async () => {
    server.use(http.put("/api/1h/v2/user/edit", async ({ request }) => { expect(await request.json()).toEqual({ firstName: "Bea" }); return HttpResponse.json({ message: "Rejected" }, { status: 400 }) }))
    expect(await updateAccount({ firstName: "Bea" })).toMatchObject({ success: false, statusCode: 400 })
    server.use(http.post("/api/1h/v2/user/locale", () => HttpResponse.error()))
    expect(await setLocale()).toMatchObject({ success: false })
  })
  it("blocks all writes after a fresh identity mismatch", async () => {
    let writes = 0
    server.use(http.get("/api/1h/v2/user/myself", () => HttpResponse.json(myselfWire({ id: 9999 }))), http.all("/api/1h/v2/user/edit", () => { writes++; return HttpResponse.json({}) }))
    expect(await updateAccount({ firstName: "Bea" })).toMatchObject({ success: false, errorCode: "SESSION_EXPIRED" })
    expect(writes).toBe(0)
  })
})
