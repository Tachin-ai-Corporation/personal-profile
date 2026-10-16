import { render } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { createElement } from "react"
import { useSWRConfig, type Cache } from "swr"
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest"
import { myselfWire } from "@/test/myself-fixture"
import { server } from "@/test/msw-server"
import {
  fetchMyself,
  PERSON_TYPE_KEY,
  PERSON_VALUE_LISTS,
  deleteSignatureFile,
  isSignatureFileGone,
  revealSsn,
  sendPersonalInformation,
  SIGNATURE_UPLOAD_NAME,
  signatureUploadPath,
  ssnExposePath,
  uploadSignature,
  type PersonalInformationField,
  type PersonalInformationPayload,
} from "."
import { redact } from "./log-api-call"

/** Personal information (Team A, Epic 2). Team A adds its own cases here. */
describe("personal", () => {
  it("paths and constants", () => {
    expect(PERSON_TYPE_KEY).toBe("Person")
    expect(PERSON_VALUE_LISTS).toEqual(["race", "ethnicity", "biologicalGender"])
    expect(ssnExposePath()).toBe("/api/1h/v2/person/me/ssn/expose")
    expect(signatureUploadPath()).toBe("/api/1h/v2/health/type/Person/me/relation/PersonHasSignatureFile/file/upload")
    expect(SIGNATURE_UPLOAD_NAME).toBe("signature.png")
  })

  it("PersonalInformationPayload has exactly the PersonalInformationDTO fields, never email or phone (AD-9, spec F7-2)", () => {
    expectTypeOf<PersonalInformationField>().toEqualTypeOf<
      | "firstName"
      | "middleName"
      | "lastName"
      | "namePrefix"
      | "nameSuffix"
      | "otherNames"
      | "titles"
      | "birthDate"
      | "cityOfBirth"
      | "race"
      | "ethnicity"
      | "biologicalGender"
      | "genderIdentity"
      | "sexualOrientation"
      | "socialSecurityNumber"
    >()
    expectTypeOf<Extract<PersonalInformationField, "email" | "phoneNumber" | "phoneNumberRegion">>().toEqualTypeOf<never>()
    expectTypeOf<PersonalInformationPayload>().toEqualTypeOf<Partial<PersonalInformationPayload>>()
    // @ts-expect-error email is never part of a Personal-information payload
    const withEmail: PersonalInformationPayload = { email: "a@b.co" }
    expect(withEmail).toBeDefined()
  })
})

describe("revealSsn (Story 2.3)", () => {
  const EXPOSE = "/api/1h/v2/person/me/ssn/expose"
  /** Any 9-digit SSN, with or without hyphens (not part of a longer number such as a timestamp or an id). */
  const SSN_SHAPE = /(?<!\d)\d{3}-?\d{2}-?\d{4}(?!\d)/

  function answer(response: () => Response): () => number {
    let calls = 0
    server.use(
      http.get(EXPOSE, () => {
        calls += 1
        return response()
      }),
    )
    return () => calls
  }

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("GETs the expose path once and returns the 9 digits as XXX-XX-XXXX", async () => {
    const calls = answer(() => HttpResponse.json({ id: 4242, socialSecurityNumber: "123456789" }))
    expect(await revealSsn()).toEqual({ ok: true, ssn: "123-45-6789" })
    expect(calls()).toBe(1)
  })

  it.each([
    ["n/a (cleared)", { id: 4242, socialSecurityNumber: "n/a" }],
    ["null", { id: 4242, socialSecurityNumber: null }],
    ["missing", { id: 4242 }],
    ["8 digits", { id: 4242, socialSecurityNumber: "12345678" }],
    ["10 digits", { id: 4242, socialSecurityNumber: "1234567890" }],
    ["hyphenated", { id: 4242, socialSecurityNumber: "123-45-6789" }],
    ["a number", { id: 4242, socialSecurityNumber: 123456789 }],
    ["a bare string body", "123456789"],
    ["a null body", null],
    ["an array body", ["123456789"]],
  ])("%s is not ok, with no mapped error", async (_name, body) => {
    answer(() => HttpResponse.json(body))
    expect(await revealSsn()).toEqual({ ok: false })
  })

  it.each([
    ["403", () => HttpResponse.json({ message: "Forbidden" }, { status: 403 }), { kind: "forbidden" }],
    ["400 (no SSN)", () => HttpResponse.json({ message: "Bad request" }, { status: 400 }), { kind: "generic", message: "Bad request" }],
    ["a proxy 400", () => HttpResponse.json({ errorCode: "BAD_QUERY", source: "proxy" }, { status: 400 }), { kind: "generic" }],
    ["500", () => HttpResponse.json({ message: "boom" }, { status: 500 }), { kind: "generic" }],
    ["502", () => HttpResponse.json({ errorCode: "UPSTREAM_ERROR", source: "proxy" }, { status: 502 }), { kind: "network" }],
    ["a network failure", () => HttpResponse.error(), { kind: "network" }],
  ] as const)("%s is not ok with the mapped error; never throws", async (_name, response, mapped) => {
    answer(response)
    expect(await revealSsn()).toEqual({ ok: false, mapped })
  })

  it("an unreadable 2xx body is not ok", async () => {
    answer(() => HttpResponse.text("not json", { status: 200 }))
    expect(await revealSsn()).toMatchObject({ ok: false })
  })

  it("leaves nothing in the SWR cache", async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
    let cache: Cache | undefined
    function Probe() {
      cache = useSWRConfig().cache
      return null
    }
    render(createElement(Probe))
    answer(() => HttpResponse.json({ id: 4242, socialSecurityNumber: "123456789" }))
    expect(await revealSsn()).toMatchObject({ ok: true })
    if (!cache) throw new Error("no SWR cache")
    const entries = [...cache.keys()].map((key) => `${key} ${JSON.stringify(cache?.get(key) ?? null)}`)
    for (const entry of entries) expect(entry).not.toMatch(SSN_SHAPE)
  })

  it("the dev logger (logApiCall) redacts the expose response body by key and by shape", async () => {
    expect(redact({ id: 4242, socialSecurityNumber: "123456789" })).toEqual({ id: 4242, socialSecurityNumber: "[redacted]" })
    expect(redact({ id: 4242, ssn: "123-45-6789" })).toEqual({ id: 4242, ssn: "[redacted]" })
    expect(redact({ id: 4242, value: "123456789", text: "SSN 123-45-6789." })).toEqual({ id: 4242, value: "[redacted]", text: "SSN [redacted]." })

    // In development `callApi` logs every call: the expose body reaches the console redacted.
    vi.stubEnv("NODE_ENV", "development")
    const spies = (["log", "info", "warn", "error", "debug", "groupCollapsed", "group"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    )
    answer(() => HttpResponse.json({ id: 4242, socialSecurityNumber: "123456789" }))
    expect(await revealSsn()).toEqual({ ok: true, ssn: "123-45-6789" })
    const logged = spies.flatMap((spy) => spy.mock.calls).map((args) => JSON.stringify(args))
    expect(logged.some((line) => line.includes("[redacted]"))).toBe(true)
    for (const line of logged) expect(line).not.toMatch(SSN_SHAPE)
  })
})

describe("sendPersonalInformation (Story 2.4 save step)", () => {
  const EDIT = "/api/1h/v2/user/edit"

  beforeEach(async () => {
    server.use(http.get("/api/1h/v2/user/myself", () => HttpResponse.json(myselfWire())))
    expect((await fetchMyself()).success).toBe(true)
  })

  /** A body with every Personal-information field (AD-9: still no account field). */
  const FULL_DIFF: Required<Omit<PersonalInformationPayload, "socialSecurityNumber">> = {
    firstName: "Anna",
    middleName: "n/a",
    lastName: "Lee",
    namePrefix: "Dr.",
    nameSuffix: "Jr.",
    otherNames: "Ann Smith",
    titles: "MD",
    birthDate: "1990-04-15",
    cityOfBirth: "Springfield",
    race: "Asian",
    ethnicity: "Unknown",
    biologicalGender: "Female",
    genderIdentity: "Woman",
    sexualOrientation: "Straight",
  }

  it("a full diff's body has every Personal-information field and no email, phoneNumber or phoneNumberRegion (AD-9)", async () => {
    const bodies: unknown[] = []
    server.use(
      http.put(EDIT, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(myselfWire())
      }),
    )
    expect(await sendPersonalInformation(FULL_DIFF)).toMatchObject({ success: true })
    expect(bodies).toEqual([FULL_DIFF])
    for (const field of ["email", "phoneNumber", "phoneNumberRegion"]) expect(Object.keys(bodies[0] as object)).not.toContain(field)
  })

  it("PUTs the diff as is and returns the raw answer; a 2xx with an unreadable body is a success", async () => {
    const bodies: unknown[] = []
    server.use(
      http.put(EDIT, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(myselfWire())
      }),
    )
    expect(await sendPersonalInformation({ firstName: "Anna" })).toMatchObject({ success: true, statusCode: 200 })
    expect(bodies).toEqual([{ firstName: "Anna" }])
    server.use(http.put(EDIT, () => HttpResponse.text("OK", { status: 200 })))
    expect(await sendPersonalInformation({ firstName: "Anna" })).toEqual({ success: true, statusCode: 200 })
    server.use(http.put(EDIT, () => HttpResponse.json({ message: "boom" }, { status: 500 })))
    expect(await sendPersonalInformation({ firstName: "Anna" })).toMatchObject({ success: false, statusCode: 500 })
    server.use(http.put(EDIT, () => HttpResponse.error()))
    expect(await sendPersonalInformation({ firstName: "Anna" })).toMatchObject({ success: false, errorCode: "NETWORK_ERROR" })
  })
})

describe("Signature upload and delete (Story 2.4)", () => {
  const UPLOAD = "/api/1h/v2/health/type/Person/me/relation/PersonHasSignatureFile/file/upload"
  /** The parameters the client must never send: the proxy forces `isPublic` and the named op `hardDelete` (AD-13). */
  const FORBIDDEN_PARAMS = /[?&](isPublic|current|hardDelete)=/i

  beforeEach(async () => {
    server.use(http.get("/api/1h/v2/user/myself", () => HttpResponse.json(myselfWire())))
    expect((await fetchMyself()).success).toBe(true)
  })

  // MSW can't read a multipart body in this jsdom + undici setup, so the part is checked where it is
  // built; the real body is asserted in e2e/profile-personal.spec.ts.
  it("posts one multipart `file` part named signature.png, with no query and no JSON content type", async () => {
    const seen: { url: string; contentType: string | null }[] = []
    server.use(
      http.post(UPLOAD, ({ request }) => {
        seen.push({ url: request.url, contentType: request.headers.get("Content-Type") })
        return HttpResponse.json({ id: 57 })
      }),
    )
    const append = vi.spyOn(FormData.prototype, "append")
    const blob = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" })
    expect(await uploadSignature(blob)).toEqual({ success: true, statusCode: 200, data: { id: 57 } })
    expect(append.mock.calls).toEqual([["file", blob, "signature.png"]])
    expect(seen).toHaveLength(1)
    expect(new URL(seen[0].url).search).toBe("")
    expect(seen[0].url).not.toMatch(FORBIDDEN_PARAMS)
    expect(seen[0].contentType).toMatch(/^multipart\/form-data; boundary=/)
  })

  it("counts a 2xx with an unreadable body as uploaded; returns failures as they are", async () => {
    const blob = new Blob([new Uint8Array([1])])
    server.use(http.post(UPLOAD, () => HttpResponse.text("OK", { status: 201 })))
    expect(await uploadSignature(blob)).toEqual({ success: true, statusCode: 201 })
    server.use(http.post(UPLOAD, () => HttpResponse.json({ errorCode: "TOO_LARGE", source: "proxy" }, { status: 413 })))
    expect(await uploadSignature(blob)).toMatchObject({ success: false, statusCode: 413, errorCode: "TOO_LARGE" })
    server.use(http.post(UPLOAD, () => HttpResponse.json({ message: "boom" }, { status: 500 })))
    expect(await uploadSignature(blob)).toMatchObject({ success: false, statusCode: 500 })
    server.use(http.post(UPLOAD, () => HttpResponse.error()))
    expect(await uploadSignature(blob)).toMatchObject({ success: false, errorCode: "NETWORK_ERROR" })
  })

  it("deletes through the ownership-checked named op with no query; sends nothing for a non-id", async () => {
    const urls: string[] = []
    server.use(
      http.delete("/api/pp/file/:fileId", ({ request }) => {
        urls.push(request.url)
        return new HttpResponse(null, { status: 204 })
      }),
    )
    expect(await deleteSignatureFile(41)).toEqual({ success: true, statusCode: 204 })
    expect(urls.map((url) => `${new URL(url).pathname}${new URL(url).search}`)).toEqual(["/api/pp/file/41"])
    for (const url of urls) expect(url).not.toMatch(FORBIDDEN_PARAMS)
    expect(await deleteSignatureFile(0)).toEqual({ success: false, error: "personal/deleteSignatureFile: not a file id" })
    expect(urls).toHaveLength(1)
    server.use(http.delete("/api/pp/file/:fileId", () => HttpResponse.json({ errorCode: "NO_FILE", source: "proxy" }, { status: 404 })))
    const gone = await deleteSignatureFile(41)
    expect(gone).toMatchObject({ success: false, statusCode: 404 })
    expect(isSignatureFileGone(gone)).toBe(true)
  })

  it("isSignatureFileGone: only the named op's 404 NO_FILE, never a success or another failure", () => {
    expect(isSignatureFileGone({ success: false, statusCode: 404, errorCode: "NO_FILE", source: "proxy" })).toBe(true)
    expect(isSignatureFileGone({ success: true, statusCode: 204 })).toBe(false)
    expect(isSignatureFileGone({ success: false, statusCode: 401, errorCode: "TOKEN_EXPIRED", source: "proxy" })).toBe(false)
    expect(isSignatureFileGone({ success: false, statusCode: 502, errorCode: "UPSTREAM_ERROR", source: "proxy" })).toBe(false)
    expect(isSignatureFileGone({ success: false, errorCode: "NETWORK_ERROR" })).toBe(false)
  })
})
