import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it } from "vitest"
import { setLogSink } from "@/lib/server/log"
import { SESSION_COOKIE, sealSession } from "@/lib/server/session/session"
import { PERSON_BIOLOGICAL_GENDER_VALUES, PERSON_ETHNICITY_VALUES, PERSON_RACE_VALUES } from "@/lib/shared/person-options"
import { nameIssue } from "@/lib/shared/person-rules"
import { stubServerEnv, testEnv } from "@/test/env-fixture"
import { server, trackAllRequests } from "@/test/msw-server"
import { makeSession, NOW } from "@/test/session-fixture"
import { DEMO } from "@/test/upstream-fixture"
import { createProxyHandler } from "../handler"
import { buildUpstreamQuery, matchEntry } from "../match"
import { BIOLOGICAL_GENDERS, entries, ETHNICITIES, RACES, SIGNATURE_MAX_BYTES, userEditBodySchema } from "./personal"

const valid = (body: unknown): boolean => userEditBodySchema.safeParse(body).success

describe("PUT v2/user/edit entry", () => {
  it("is the one shared PUT, not a Profile-module entry", () => {
    expect(entries.map((e) => `${e.method} ${e.template}`)).toEqual([
      "PUT v2/user/edit",
      "POST v2/health/type/Person/{personId}/relation/PersonHasSignatureFile/file/upload",
      "GET v2/type/key/Person",
      "GET v2/person/{personId}/ssn/expose",
    ])
    expect(entries.every((e) => e.profile === undefined)).toBe(true)
  })
})

describe("Person enums: the client's accepted-value copies (Story 2.2)", () => {
  it("lib/shared/person-options equals RACES, ETHNICITIES and BIOLOGICAL_GENDERS, so no picker value is a 400", () => {
    expect(PERSON_RACE_VALUES).toEqual(RACES)
    expect(PERSON_ETHNICITY_VALUES).toEqual(ETHNICITIES)
    expect(PERSON_BIOLOGICAL_GENDER_VALUES).toEqual(BIOLOGICAL_GENDERS)
  })
})

describe("Signature upload entries (Story 2.4, AD-13)", () => {
  const seg = (path: string) => path.split("/")
  const q = (query: string) => new URLSearchParams(query)

  it("first Signature: owner me only, isPublic=false forced, no client query, one PNG `file` part, 1 MB", () => {
    const match = matchEntry(entries, "POST", seg("v2/health/type/Person/me/relation/PersonHasSignatureFile/file/upload"))
    if (match.kind !== "matched") throw new Error("expected a match")
    expect(match.entry).toMatchObject({ upload: { part: "file", types: ["png"] }, maxBytes: SIGNATURE_MAX_BYTES })
    // Pinned to the client's re-encode limit: `SIGNATURE_MAX_BYTES` in features/personal/signature-file.ts (its test pins 1024 * 1024 too).
    expect(SIGNATURE_MAX_BYTES).toBe(1024 * 1024)
    expect(buildUpstreamQuery(match.entry, q("isPublic=true"))?.toString()).toBe("isPublic=false")
    expect(buildUpstreamQuery(match.entry, q("fileName=x.png"))).toBeNull()
    expect(matchEntry(entries, "POST", seg("v2/health/type/Person/4242/relation/PersonHasSignatureFile/file/upload")).kind).toBe("not-allowed")
  })

  it("no new-version entry: POST v2/file/{fileId}/version is not allowlisted (human decision 2026-10-16)", () => {
    expect(entries.some((e) => e.template === "v2/file/{fileId}/version")).toBe(false)
    expect(entries.some((e) => e.upload?.part === "fileNewVersion")).toBe(false)
    expect(matchEntry(entries, "POST", seg("v2/file/41/version")).kind).toBe("not-allowed")
  })
})

describe("SSN expose entry (Story 2.3)", () => {
  const seg = (path: string) => path.split("/")
  const q = (query: string) => new URLSearchParams(query)

  it("owner me only, GET only, no query, no body, nothing forced", () => {
    const match = matchEntry(entries, "GET", seg("v2/person/me/ssn/expose"))
    if (match.kind !== "matched") throw new Error("expected a match")
    expect(match.entry).toEqual({ method: "GET", template: "v2/person/{personId}/ssn/expose" })
    expect(buildUpstreamQuery(match.entry, q(""))?.toString()).toBe("")
    expect(buildUpstreamQuery(match.entry, q("x=1"))).toBeNull()
    expect(matchEntry(entries, "GET", seg("v2/person/4242/ssn/expose")).kind).toBe("not-allowed")
    expect(matchEntry(entries, "POST", seg("v2/person/me/ssn/expose")).kind).toBe("method-not-allowed")
  })
})

/**
 * The real expose entry through the real proxy handler (shipped allowlist):
 * own person id upstream, no-store on every answer (human, 2026-10-16) and
 * an AD-15 log line (method, template, status, duration, request id only).
 */
describe("SSN expose through the proxy (Story 2.3)", () => {
  const SSN = "123456789"
  const PERSON_ID = 98765
  const proxy = createProxyHandler({ env: testEnv(), now: () => NOW })

  async function get(path: string): Promise<Response> {
    const cookie = `${SESSION_COOKIE}=${await sealSession(makeSession({ personId: PERSON_ID }))}`
    return proxy(new Request(`http://localhost:3000/api/1h/${path}`, { headers: { cookie } }))
  }

  /** Runs `run`, returning the log lines written meanwhile. */
  async function captureLog(run: () => Promise<void>): Promise<string[]> {
    const lines: string[] = []
    const push = (line: string) => void lines.push(line)
    const restore = setLogSink({ info: push, warn: push, error: push })
    try {
      await run()
    } finally {
      restore()
    }
    return lines
  }

  function expectNoStore(response: Response): void {
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0")
    expect(response.headers.get("Pragma")).toBe("no-cache")
  }

  beforeEach(() => stubServerEnv())

  it("me → upstream /v2/person/{session personId}/ssn/expose; the 200 with the SSN is no-store; the log line has no id, body or SSN", async () => {
    let upstreamPath = ""
    server.use(
      http.get(`${DEMO.apiBase}/v2/person/:id/ssn/expose`, ({ request }) => {
        upstreamPath = new URL(request.url).pathname
        return HttpResponse.json({ id: PERSON_ID, socialSecurityNumber: SSN })
      }),
    )
    let response: Response | undefined
    const lines = await captureLog(async () => {
      response = await get("v2/person/me/ssn/expose")
    })
    if (!response) throw new Error("no response")
    expect(upstreamPath).toBe(`/api/v2/person/${PERSON_ID}/ssn/expose`)
    expect(response.status).toBe(200)
    expectNoStore(response)
    expect(await response.json()).toEqual({ id: PERSON_ID, socialSecurityNumber: SSN })

    expect(lines).toHaveLength(1)
    const line = JSON.parse(lines[0]) as Record<string, unknown>
    expect(Object.keys(line).toSorted()).toEqual(["durationMs", "kind", "method", "requestId", "routeTemplate", "status"])
    expect(line).toMatchObject({ kind: "request", method: "GET", routeTemplate: "/v2/person/{personId}/ssn/expose", status: 200 })
    // The random request id (a UUID) can hold an SSN-shaped run of digits: check the line without it.
    const withoutRequestId = lines[0].replace(String(line.requestId), "")
    expect(withoutRequestId).not.toContain(String(PERSON_ID))
    expect(withoutRequestId).not.toContain(SSN)
    expect(withoutRequestId).not.toMatch(/socialSecurityNumber|\d{3}-?\d{2}-?\d{4}/)
  })

  it.each([
    ["a numeric person id", "v2/person/4242/ssn/expose", 403, "NOT_ALLOWED"],
    ["a query", "v2/person/me/ssn/expose?x=1", 400, "BAD_QUERY"],
  ])("%s is refused before upstream (%i %s), no-store", async (_name, path, status, errorCode) => {
    const upstreamCalls = trackAllRequests()
    let response: Response | undefined
    const lines = await captureLog(async () => {
      response = await get(path)
    })
    if (!response) throw new Error("no response")
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ errorCode, source: "proxy" })
    expectNoStore(response)
    expect(upstreamCalls()).toBe(0)
    for (const line of lines) {
      expect(line).not.toContain("4242")
      expect(line).not.toContain(String(PERSON_ID))
    }
  })
})

/** Story 2.4: a Signature replace is upload + ownership-checked delete; the version endpoint is gone (human, 2026-10-16). */
describe("POST v2/file/{fileId}/version through the proxy (Story 2.4)", () => {
  const proxy = createProxyHandler({ env: testEnv(), now: () => NOW })

  beforeEach(() => stubServerEnv())

  it("is refused before upstream: 403 NOT_ALLOWED", async () => {
    const upstreamCalls = trackAllRequests()
    const cookie = `${SESSION_COOKIE}=${await sealSession(makeSession())}`
    const body = new FormData()
    body.append("fileNewVersion", new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: "image/png" }), "signature.png")
    const response = await proxy(new Request("http://localhost:3000/api/1h/v2/file/41/version", { method: "POST", headers: { cookie }, body }))
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ errorCode: "NOT_ALLOWED", source: "proxy" })
    expect(upstreamCalls()).toBe(0)
  })
})

describe("PUT v2/user/edit body (PersonalInformationDTO)", () => {
  it("accepts a full Personal information body and forwards names trimmed", () => {
    const body = {
      firstName: " Ann ",
      middleName: "n/a",
      lastName: "Lee",
      otherNames: "Annie",
      titles: "n/a",
      namePrefix: "Dr.",
      nameSuffix: "Jr.",
      cityOfBirth: "Sofia",
      sexualOrientation: "Prefer not to say",
      genderIdentity: "Female",
      race: "Asian",
      ethnicity: "Not Hispanic or Latino",
      biologicalGender: "Female",
      birthDate: "1990-01-31",
      preferredLanguage: "en",
      socialSecurityNumber: "123-45-6789",
    }
    expect(userEditBodySchema.parse(body)).toEqual({ ...body, firstName: "Ann" })
  })

  it.each(["locale", "username", "enabled", "receiveNotifications", "roleId", "socialSecurityNumberHash"])("rejects %s", (field) => {
    expect(valid({ firstName: "Ann", [field]: "x" })).toBe(false)
    expect(valid({ firstName: "Ann", [field]: true })).toBe(false)
  })

  it.each([
    ["firstName", 24],
    ["middleName", 24],
    ["lastName", 24],
    ["otherNames", 24],
    ["titles", 24],
    ["namePrefix", 10],
    ["nameSuffix", 10],
    ["cityOfBirth", 128],
    ["sexualOrientation", 128],
    ["genderIdentity", 128],
  ] as const)("%s is 1–%i code points after trimming, printable, not blank", (field, max) => {
    expect(valid({ [field]: "x" })).toBe(true)
    expect(valid({ [field]: "x".repeat(max) })).toBe(true)
    expect(valid({ [field]: `  ${"x".repeat(max)}  ` })).toBe(true)
    expect(valid({ [field]: "\u{1D49C}".repeat(max) })).toBe(true)
    expect(valid({ [field]: "\u{1F600}" })).toBe(false)
    expect(valid({ [field]: "x".repeat(max + 1) })).toBe(false)
    expect(valid({ [field]: "" })).toBe(false)
    expect(valid({ [field]: "   " })).toBe(false)
    expect(valid({ [field]: "a​b" })).toBe(false)
    expect(valid({ [field]: 5 })).toBe(false)
  })

  it.each(["Ann", "  Ann  ", "x".repeat(24), ` ${"x".repeat(24)} `, "😀".repeat(24), "😀".repeat(25), "\u{1D49C}".repeat(24), "\u{1D49C}".repeat(25), "Ann\u{1F600}", "x".repeat(25), "", " ", "A\u0000n", "A​n", "A‮n", "An", "José-María O'Neil"])(
    "agrees with the client name rule for %j",
    (value) => {
      expect(valid({ firstName: value })).toBe(nameIssue(value) === null)
      expect(valid({ lastName: value })).toBe(nameIssue(value) === null)
    },
  )

  it.each([
    ["race", RACES, "Martian"],
    ["ethnicity", ETHNICITIES, "Hispanic or Latina"],
    ["biologicalGender", BIOLOGICAL_GENDERS, "male"],
  ] as const)("%s accepts only the backend enum", (field, values, outside) => {
    for (const value of values) expect(valid({ [field]: value })).toBe(true)
    expect(valid({ [field]: outside })).toBe(false)
    expect(valid({ [field]: "n/a" })).toBe(false)
  })

  it.each([
    [{ birthDate: "1990-01-31" }, true],
    [{ birthDate: "n/a" }, false],
    [{ birthDate: "01/31/1990" }, false],
    [{ socialSecurityNumber: "123-45-6789" }, true],
    [{ socialSecurityNumber: "123456789" }, true],
    [{ socialSecurityNumber: "n/a" }, true],
    [{ socialSecurityNumber: "12-345-6789" }, false],
    [{ socialSecurityNumber: "12345678" }, false],
    [{ socialSecurityNumber: "1234567890" }, false],
    [{ socialSecurityNumber: "123-45-678x" }, false],
    [{ preferredLanguage: "en" }, true],
    [{ preferredLanguage: "fil" }, true],
    [{ preferredLanguage: "en-US" }, true],
    [{ preferredLanguage: "en-us" }, true],
    [{ preferredLanguage: "EN" }, false],
    [{ preferredLanguage: "english" }, false],
    [{ preferredLanguage: "en-USA" }, false],
    [{ preferredLanguage: "en_US" }, false],
    [{ email: "ann@example.com" }, true],
    [{ email: "ann" }, false],
    [{ email: `${"a".repeat(250)}@b.co` }, false],
    [{ phoneNumber: "+14155552125", phoneNumberRegion: "us" }, true],
    [{ phoneNumber: "+44 (20) 7183-8750", phoneNumberRegion: "GB" }, true],
    [{ phoneNumber: "4155", phoneNumberRegion: "us" }, true],
    [{ phoneNumber: "415", phoneNumberRegion: "us" }, false],
    [{ phoneNumber: "+1 415 555 2125 ext 9", phoneNumberRegion: "us" }, false],
    [{ phoneNumber: "call me", phoneNumberRegion: "us" }, false],
    [{ phoneNumber: "++14155552125", phoneNumberRegion: "us" }, false],
    [{ phoneNumber: "1".repeat(33), phoneNumberRegion: "us" }, false],
    [{ phoneNumberRegion: "us" }, false],
    [{ phoneNumber: "+14155552125" }, false],
    [{ phoneNumber: "+14155552125", phoneNumberRegion: "usa" }, false],
    [{ phoneNumber: "", phoneNumberRegion: "us" }, false],
  ])("%j → valid: %s", (body, expected) => {
    expect(valid(body)).toBe(expected)
  })
})
