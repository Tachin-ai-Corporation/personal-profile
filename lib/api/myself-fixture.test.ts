import { describe, expect, it } from "vitest"
import { contactPointWire, myselfHandlers, myselfWire } from "@/test/myself-fixture"
import { server } from "@/test/msw-server"
import { fetchContactPoints, fetchMyself, toMyself } from "."

/** Guards the shared unit fixture (spec F6-3): it must stay a full `Myself`. */
describe("test/myself-fixture", () => {
  it("fills every Myself field", () => {
    const myself = toMyself(myselfWire())
    expect(myself).not.toBeNull()
    for (const [field, value] of Object.entries(myself ?? {})) expect(value, field).not.toBeNull()
    expect(toMyself(myselfWire({ middleName: "n/a" }))?.middleName).toBe("n/a")
  })

  it("serves myself and the per-type contact lists through MSW", async () => {
    server.use(...myselfHandlers({ contacts: { Email: [contactPointWire({ type: "Email", value: "a@b.co" })], Landline: { status: 403, body: { message: "no", code: 403 } } } }))
    expect(await fetchMyself()).toMatchObject({ success: true, data: { id: 42, firstName: "Ann" } })
    expect(await fetchContactPoints("Email")).toMatchObject({ success: true, data: [{ value: "a@b.co" }] })
    expect(await fetchContactPoints("Mobile")).toMatchObject({ success: true, data: [] })
    expect(await fetchContactPoints("Landline")).toMatchObject({ success: false, statusCode: 403 })
  })

  it("answers a status + body for myself", async () => {
    server.use(...myselfHandlers({ myself: { status: 500, body: { message: "x", code: 500 } } }))
    expect(await fetchMyself()).toMatchObject({ success: false, statusCode: 500 })
  })
})
