import { describe, expect, it } from "vitest"
import { mfaDisableTotpPath, mfaEnableTotpPath, mfaValidatePath } from "."

/** Authenticator app (Team B, Epic 8). Team B adds its own cases here. */
describe("mfa", () => {
  it("paths", () => {
    expect(mfaEnableTotpPath()).toBe("/api/1h/v2/mfa/enable/totp")
    expect(mfaDisableTotpPath()).toBe("/api/1h/v2/mfa/disable/totp")
    expect(mfaValidatePath()).toBe("/api/pp/mfa/validate")
  })
})

import { beforeEach } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@/test/msw-server"
import { myselfWire } from "@/test/myself-fixture"
import { disableTotp, enableTotp, fetchMyself, validateTotp } from "."

const QR = "data:image/png;base64,aGVsbG8="
beforeEach(async () => {
  server.use(http.get("/api/1h/v2/user/myself", () => HttpResponse.json(myselfWire())))
  await fetchMyself()
})
it("enables without a query or body, returning only a PNG QR", async () => {
  server.use(http.post(mfaEnableTotpPath(), async ({ request }) => {
    expect(new URL(request.url).search).toBe("")
    expect(await request.text()).toBe("")
    return HttpResponse.json({ qrCode: QR, secret: "discard" })
  }))
  expect(await enableTotp()).toEqual({ success: true, statusCode: 200, data: { qrCode: QR } })
})
it.each([null, [], {}, { qrCode: 12 }, { qrCode: "https://external.test/qr" }, { qrCode: "data:image/svg+xml;base64,AAAA" }])("rejects malformed QR response %j", async (data) => {
  server.use(http.post(mfaEnableTotpPath(), () => HttpResponse.json(data)))
  expect(await enableTotp()).toEqual({ success: false, statusCode: 200 })
})
it.each([false, true])("preserves boolean %s and sends the code only as JSON", async (ok) => {
  server.use(http.post(mfaValidatePath(), async ({ request }) => {
    expect(new URL(request.url).search).toBe("")
    expect(request.headers.get("content-type")).toBe("application/json")
    expect(await request.json()).toEqual({ code: "123456" })
    return HttpResponse.json(ok)
  }))
  expect(await validateTotp("123456")).toEqual({ success: true, statusCode: 200, data: ok })
})
it.each([null, {}, "true", 1])("rejects malformed validation response %j", async (data) => {
  server.use(http.post(mfaValidatePath(), () => HttpResponse.json(data)))
  expect(await validateTotp("123456")).toEqual({ success: false, statusCode: 200 })
})
it.each([mfaEnableTotpPath(), mfaValidatePath()])("preserves errors without retrying %s", async (path) => {
  let calls = 0
  server.use(http.post(path, () => { calls++; return HttpResponse.json({ message: "Too many requests" }, { status: 429 }) }))
  const result = await (path === mfaEnableTotpPath() ? enableTotp() : validateTotp("123456"))
  expect(result).toMatchObject({ success: false, statusCode: 429, platformMessage: "Too many requests" })
  expect(calls).toBe(1)
})

it("disables TOTP with an empty response and no body or query", async () => {
  let calls = 0
  server.use(http.post(mfaDisableTotpPath(), async ({ request }) => {
    calls++
    expect(new URL(request.url).search).toBe("")
    expect(await request.text()).toBe("")
    return new HttpResponse(null, { status: 200 })
  }))
  expect(await disableTotp()).toMatchObject({ success: true, statusCode: 200, data: undefined })
  expect(calls).toBe(1)
})
it.each([400, 403, 429, 500, 504, 0])("does not replay a disable failure %i", async (status) => {
  let calls = 0
  server.use(http.post(mfaDisableTotpPath(), () => { calls++; return status ? HttpResponse.json({ message: "Failure" }, { status }) : HttpResponse.error() }))
  expect(await disableTotp()).toMatchObject({ success: false, data: undefined })
  expect(calls).toBe(1)
})
