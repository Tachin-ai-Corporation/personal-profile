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
  it.each([200, 204])("sends only allowed details, accepts empty %i and never leaks a wider input", async (status) => {
    let body: unknown
    server.use(http.put("/api/1h/v2/user/edit", async ({ request }) => { body = await request.json(); return new HttpResponse(null, { status }) }))
    const diff = { firstName: "Bea", lastName: "Lee", birthDate: "1990-04-15", preferredLanguage: "en", username: "never", locale: "en-US", password: "never" }
    expect(await updateAccount(diff)).toEqual({ success: true, statusCode: status })
    expect(body).toEqual({ firstName: "Bea", lastName: "Lee", birthDate: "1990-04-15", preferredLanguage: "en" })
  })
  it.each([200, 204])("regional calls send required query parameters, no body, and accept empty %i", async (status) => {
    const requests: string[] = []
    server.use(http.post("/api/1h/v2/user/:part", async ({ request }) => { requests.push(request.url); expect(await request.text()).toBe(""); return new HttpResponse(null, { status }) }))
    expect(await setTimeZone("America/Chicago")).toEqual({ success: true, statusCode: status })
    expect(await setLocale()).toEqual({ success: true, statusCode: status })
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

// A 200 from the identity check is not a successful write (D-A, review R1).
describe("Account preserves failed identity preflights", () => {
  const writes = [
    { name: "details", run: () => updateAccount({ firstName: "Bea" }) },
    { name: "time zone", run: () => setTimeZone("America/Chicago") },
    { name: "locale", run: () => setLocale() },
  ]
  for (const { name, run } of writes) {
    it.each(["malformed", "non-JSON"])(`rejects a %s 200 identity check before ${name}`, async (answer) => {
      server.use(http.get("/api/1h/v2/user/myself", () => HttpResponse.json(myselfWire())))
      expect((await fetchMyself()).success).toBe(true)
      let sent = 0
      server.use(
        http.get("/api/1h/v2/user/myself", () => answer === "malformed" ? HttpResponse.json({}) : new HttpResponse("not JSON", { status: 200 })),
        http.put("/api/1h/v2/user/edit", () => { sent++; return new HttpResponse(null, { status: 204 }) }),
        http.post("/api/1h/v2/user/:part", () => { sent++; return new HttpResponse(null, { status: 204 }) }),
      )
      expect(await run()).toMatchObject({ success: false, statusCode: 200 })
      expect(sent).toBe(0)
    })
  }
})

import { expectTypeOf } from "vitest"
import type { PersonalInformationPayload } from "."
it("Personal-information payload excludes all primary login contact fields", () => {
  expectTypeOf<Extract<keyof PersonalInformationPayload, "email" | "phoneNumber" | "phoneNumberRegion">>().toEqualTypeOf<never>()
})
it("explicitly forwards selected primary contacts with phone region unchanged", async () => {
  server.use(http.get("/api/1h/v2/user/myself", () => HttpResponse.json(myselfWire())))
  await fetchMyself()
  let body: unknown
  server.use(http.put("/api/1h/v2/user/edit", async ({ request }) => { body = await request.json(); return new HttpResponse(null, { status: 204 }) }))
  expect((await updateAccount({ email: "work@example.com", phoneNumber: "+442071838750", phoneNumberRegion: "GB" })).success).toBe(true)
  expect(body).toEqual({ email: "work@example.com", phoneNumber: "+442071838750", phoneNumberRegion: "GB" })
})
