import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import { server } from "@/test/msw-server"
import { pageUser, sendPersonalInformation, uploadSignature, uploadProfilePicture, saveContactPoints, sendContactVerification, sessionEvents } from "."

const callers = [
  {
    name: "Personal information",
    run: () => sendPersonalInformation({ firstName: "Test" }),
    failed: { success: false }, saved: { success: true },
  },
  {
    name: "Signature upload",
    run: () => uploadSignature(new Blob(["signature"], { type: "image/png" })),
    failed: { success: false }, saved: { success: true },
  },
  {
    name: "Profile picture upload",
    run: () => uploadProfilePicture(new Blob(["picture"], { type: "image/jpeg" }), "picture.jpg"),
    failed: { success: false }, saved: { success: true },
  },
  {
    name: "Contact save",
    run: () => saveContactPoints({ contactPointsToAdd: [], contactPointsToUpdate: [], contactPointsToRemove: [] }),
    failed: { ok: false }, saved: { ok: true },
  },
  {
    name: "Contact verification",
    run: () => sendContactVerification([7]),
    failed: { sent: [], failed: [7], session: false },
    saved: { sent: [7], failed: [], session: false },
  },
]

const badIdentityReads = [
  { name: "missing id", answer: () => HttpResponse.json({}) },
  { name: "string id", answer: () => HttpResponse.json({ id: "42" }) },
  { name: "empty body", answer: () => new HttpResponse(null, { status: 200 }) },
  { name: "unreadable JSON", answer: () => new HttpResponse("{", { status: 200 }) },
]

describe.each(callers)("$name identity preflight contract", ({ run, failed, saved }) => {
  it.each(badIdentityReads)("keeps a blocked write failed after a 200 $name identity read", async ({ answer }) => {
    pageUser.pin(42)
    let writes = 0
    let reads = 0
    server.use(
      http.get("/api/1h/v2/user/myself", () => { reads++; return answer() }),
      http.all("/api/1h/*", () => { writes++; return new HttpResponse(null, { status: 200 }) }),
    )
    expect(await run()).toMatchObject(failed)
    expect(reads).toBe(1)
    expect(writes).toBe(0)
    expect(sessionEvents.hasPublished("session-expired")).toBe(false)
  })

  it("still accepts an unreadable 200 acknowledgement from the actual write", async () => {
    pageUser.pin(42)
    let writes = 0
    server.use(
      http.get("/api/1h/v2/user/myself", () => HttpResponse.json({ id: 42 })),
      http.post("/api/1h/v2/health/type/Person/me/relation/:relation/file/upload", () => { writes++; return HttpResponse.text("OK", { status: 200 }) }),
      http.all("/api/1h/*", () => { writes++; return HttpResponse.text("OK", { status: 200 }) }),
    )
    expect(await run()).toMatchObject(saved)
    expect(writes).toBe(1)
  })
})
