import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { SESSION_COOKIE, sealSession } from "@/lib/server/session/session"
import { stubServerEnv, testEnv } from "@/test/env-fixture"
import { IMAGES } from "@/test/image-fixture"
import { server, trackAllRequests } from "@/test/msw-server"
import { makeSession, NOW } from "@/test/session-fixture"
import { DEMO } from "@/test/upstream-fixture"
import { createProxyHandler } from "../handler"
import { buildUpstreamQuery, matchEntry } from "../match"
import { ALLOWLIST } from "."
import { IMAGE_UPLOAD_MAX_BYTES } from "./core"
import { entries } from "./insurance"

const q = (s: string) => new URLSearchParams(s)
const seg = (path: string) => path.split("/")

const FRONT = "InsuranceHasFrontSideCardFile"
const BACK = "InsuranceHasBackSideCardFile"
const LIST = "v2/health/patient/insurance"
const DOWNLOAD = "v2/health/insurance/55/file/900/download"

function matched(method: "GET" | "POST", path: string) {
  const match = matchEntry(entries, method, seg(path))
  if (match.kind !== "matched") throw new Error(`${method} ${path} did not match`)
  return match.entry
}

describe("insurance allowlist area", () => {
  it("has its entries, all aggregated into the shipped allowlist, none tagged `profile`", () => {
    expect(entries.map((entry) => `${entry.method} ${entry.template}`)).toEqual([
      `POST v2/health/type/Insurance/{insuranceId}/relation/${FRONT}/file/upload`,
      `POST v2/health/type/Insurance/{insuranceId}/relation/${BACK}/file/upload`,
      "GET v2/type/key/Insurance",
      "GET v2/health/patient/insurance",
      "GET v2/health/insurance/{insuranceId}/file/{fileId}/download",
    ])
    for (const entry of entries) expect(ALLOWLIST).toContain(entry)
    expect(entries.filter((entry) => entry.profile !== undefined)).toEqual([])
  })
})

describe("insurance card uploads (Story 5.3)", () => {
  it.each([FRONT, BACK])("%s: numeric id, isPublic=false forced, no client query, PNG/JPEG `file`, 4 MB", (relation) => {
    const entry = matched("POST", `v2/health/type/Insurance/55/relation/${relation}/file/upload`)
    expect(entry).toMatchObject({ upload: { part: "file", types: ["png", "jpeg"] }, maxBytes: IMAGE_UPLOAD_MAX_BYTES })
    expect(entry.profile).toBeUndefined()
    expect(buildUpstreamQuery(entry, q("isPublic=true"))?.toString()).toBe("isPublic=false")
    expect(buildUpstreamQuery(entry, q("fileName=x.png"))).toBeNull()
    expect(matchEntry(entries, "POST", seg(`v2/health/type/Insurance/me/relation/${relation}/file/upload`)).kind).toBe("not-allowed")
  })
})

/** Story 5.1: the policy list read. */
describe("GET v2/health/patient/insurance entry", () => {
  const entry = matched("GET", LIST)

  it("GET only, no body, nothing forced, not an image", () => {
    expect(entry.body).toBeUndefined()
    expect(entry.fixedQuery).toBeUndefined()
    expect(entry.asImage).toBeUndefined()
    for (const method of ["POST", "PUT", "DELETE"] as const) expect(matchEntry(ALLOWLIST, method, seg(LIST)).kind).toBe("method-not-allowed")
  })

  it("accepts exactly page=0&size=100", () => {
    expect(buildUpstreamQuery(entry, q("page=0&size=100"))?.toString()).toBe("page=0&size=100")
    expect(buildUpstreamQuery(entry, q("size=100&page=0"))?.toString()).toBe("size=100&page=0")
  })

  it.each(["", "page=0", "size=100", "page=1&size=100", "page=0&size=20", "page=0&size=100&x=1", "page=0&page=0&size=100", "page=00&size=100", "page=0&size=1000"])(
    "refuses the query %j",
    (query) => {
      expect(buildUpstreamQuery(entry, q(query))).toBeNull()
    },
  )

  it("matches no other path", () => {
    expect(matchEntry(entries, "GET", seg("v2/health/patient/insurance/7")).kind).toBe("not-allowed")
  })
})

/** Story 5.1: the card image download (AD-13). Mirrors the files-area image-entry tests. */
describe("GET v2/health/insurance/{insuranceId}/file/{fileId}/download entry", () => {
  const entry = matched("GET", DOWNLOAD)

  it("is an image entry for numeric ids that forces preview=true, not a Profile-module entry", () => {
    expect(entry.asImage).toBe(true)
    expect(entry.profile).toBeUndefined()
    expect(entry.body).toBeUndefined()
    expect(buildUpstreamQuery(entry, q(`fileRelKey=${FRONT}`))?.toString()).toBe(`fileRelKey=${FRONT}&preview=true`)
    expect(buildUpstreamQuery(entry, q(`fileRelKey=${BACK}&preview=false`))?.toString()).toBe(`fileRelKey=${BACK}&preview=true`)
  })

  it.each(["", "fileRelKey=Other", "fileRelKey=insurancehasfrontsidecardfile", `fileRelKey=${FRONT}&x=1`, `fileRelKey=${FRONT}&fileRelKey=${BACK}`, "preview=true", `fileRelKey=${FRONT}%20`])(
    "refuses the query %j",
    (query) => {
      expect(buildUpstreamQuery(entry, q(query))).toBeNull()
    },
  )

  it("refuses a non-numeric or owner id and other methods", () => {
    for (const path of ["v2/health/insurance/abc/file/900/download", "v2/health/insurance/55/file/me/download", "v2/health/insurance/me/file/900/download"]) {
      expect(matchEntry(entries, "GET", seg(path)).kind).toBe("not-allowed")
    }
    for (const method of ["POST", "PUT", "DELETE"] as const) expect(matchEntry(ALLOWLIST, method, seg(DOWNLOAD)).kind).toBe("method-not-allowed")
  })
})

/** The entries through the real proxy handler (shipped allowlist). */
describe("insurance reads through the proxy (Story 5.1)", () => {
  const proxy = createProxyHandler({ env: testEnv(), now: () => NOW })
  const UP = DEMO.apiBase

  async function get(path: string): Promise<Response> {
    const cookie = `${SESSION_COOKIE}=${await sealSession(makeSession())}`
    return proxy(new Request(`http://localhost:3000/api/1h/${path}`, { headers: { cookie } }))
  }

  beforeEach(() => stubServerEnv())

  it("forwards the list read to upstream /api/v2/health/patient/insurance?page=0&size=100 and relays the Page", async () => {
    let seen: { path: string; search: string } | undefined
    const page = { content: [{ id: 55, label: "Active" }], last: true }
    server.use(
      http.get(`${UP}/v2/health/patient/insurance`, ({ request }) => {
        const url = new URL(request.url)
        seen = { path: url.pathname, search: url.search }
        return HttpResponse.json(page)
      }),
    )
    const response = await get(`${LIST}?page=0&size=100`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(page)
    expect(seen).toEqual({ path: "/api/v2/health/patient/insurance", search: "?page=0&size=100" })
  })

  it("forwards the download with fileRelKey and preview=true forced", async () => {
    let seen: { path: string; search: string } | undefined
    server.use(
      http.get(`${UP}/v2/health/insurance/:id/file/:fileId/download`, ({ request }) => {
        const url = new URL(request.url)
        seen = { path: url.pathname, search: url.search }
        return new HttpResponse(IMAGES.png, { headers: { "Content-Type": "image/png" } })
      }),
    )
    const response = await get(`${DOWNLOAD}?fileRelKey=${BACK}&preview=false`)
    expect(response.status).toBe(200)
    expect(seen).toEqual({ path: "/api/v2/health/insurance/55/file/900/download", search: `?fileRelKey=${BACK}&preview=true` })
  })

  describe("image headers (AD-13 hardening, as `proxy: image downloads`)", () => {
    const image = (bytes: Uint8Array<ArrayBuffer>, declared: string) =>
      http.get(`${UP}/v2/health/insurance/:id/file/:fileId/download`, () =>
        new HttpResponse(bytes, {
          headers: {
            "Content-Type": declared,
            "Content-Disposition": 'inline; filename="evil.html"',
            "Content-Length": String(bytes.byteLength),
            "Set-Cookie": "up=1",
            "Cache-Control": "public, max-age=600",
            ETag: "x",
          },
        }),
      )

    it.each([
      ["PNG bytes declared image/jpeg", IMAGES.png, "image/jpeg", "image/png", "inline"],
      ["JPEG bytes", IMAGES.jpeg, "image/jpeg", "image/jpeg", "inline"],
      ["BMP bytes", IMAGES.bmp, "image/jpeg", "image/bmp", "inline"],
      ["SVG bytes declared image/svg+xml", IMAGES.svg, "image/svg+xml", "application/octet-stream", 'attachment; filename="file"'],
      ["HTML bytes declared image/png", IMAGES.html, "image/png", "application/octet-stream", 'attachment; filename="file"'],
      ["WebP bytes", IMAGES.webp, "image/webp", "application/octet-stream", 'attachment; filename="file"'],
    ])("%s → %s, %s", async (_label, bytes, declared, type, disposition) => {
      server.use(image(bytes, declared))
      const response = await get(`${DOWNLOAD}?fileRelKey=${FRONT}`)
      expect(response.status).toBe(200)
      expect(response.headers.get("Content-Type")).toBe(type)
      expect(response.headers.get("Content-Disposition")).toBe(disposition)
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
      expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0")
      expect(response.headers.get("Set-Cookie")).toBeNull()
      expect(response.headers.get("Content-Length")).toBeNull()
      expect(response.headers.get("ETag")).toBeNull()
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
    })

    it("an upstream 404 passes through without a disposition", async () => {
      server.use(http.get(`${UP}/v2/health/insurance/:id/file/:fileId/download`, () => HttpResponse.json({ message: "Not found", code: 4 }, { status: 404 })))
      const response = await get(`${DOWNLOAD}?fileRelKey=${FRONT}`)
      expect(response.status).toBe(404)
      expect(response.headers.get("Content-Disposition")).toBeNull()
      expect(await response.json()).toEqual({ message: "Not found", code: 4 })
    })
  })

  describe("refusals, before any upstream call", () => {
    let upstreamCalls: () => number
    beforeEach(() => {
      upstreamCalls = trackAllRequests()
    })
    afterEach(() => expect(upstreamCalls()).toBe(0))

    it.each<[string, string, number, string]>([
      ["fileRelKey=Other", `${DOWNLOAD}?fileRelKey=Other`, 400, "BAD_QUERY"],
      ["no fileRelKey", DOWNLOAD, 400, "BAD_QUERY"],
      ["an extra query", `${DOWNLOAD}?fileRelKey=${FRONT}&x=1`, 400, "BAD_QUERY"],
      ["a non-numeric policy id", `v2/health/insurance/abc/file/900/download?fileRelKey=${FRONT}`, 403, "NOT_ALLOWED"],
      ["a non-numeric file id", `v2/health/insurance/55/file/x/download?fileRelKey=${FRONT}`, 403, "NOT_ALLOWED"],
      ["a list read of another page", `${LIST}?page=1&size=100`, 400, "BAD_QUERY"],
      ["a list read without the query", LIST, 400, "BAD_QUERY"],
    ])("%s → %i %s", async (_label, path, status, errorCode) => {
      const response = await get(path)
      expect(response.status).toBe(status)
      expect(await response.json()).toEqual({ errorCode, source: "proxy" })
    })
  })
})
