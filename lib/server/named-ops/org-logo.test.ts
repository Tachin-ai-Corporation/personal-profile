import { delay, http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { stubServerEnv, testEnv } from "@/test/env-fixture"
import { IMAGES } from "@/test/image-fixture"
import { server, trackAllRequests } from "@/test/msw-server"
import { callOp, expectBffError, expectNoStore } from "@/test/named-op-fixture"
import { makeSession, NOW } from "@/test/session-fixture"
import { DEMO, PROD } from "@/test/upstream-fixture"
import { createOrgLogoHandler, LOGO_MAX_BYTES, ORG_MAX_PAGES, ORG_PAGE_SIZE } from "./org-logo"

const FILES = DEMO.publicFilesOrigin ?? ""
const PROD_FILES = PROD.publicFilesOrigin ?? ""
const LOGO = `${FILES}/tenant/7/logo.png`
const PORTAL = `${DEMO.apiBase}/v2/user/organization/portal`
let handler = createOrgLogoHandler({ env: testEnv(), now: () => NOW })
const get = (tenantId = "7", extra: object = {}) => callOp(handler, { path: `/api/pp/org-logo/${tenantId}`, params: { tenantId }, ...extra })

const item = (tenantId: number, publicUrl: string | null = LOGO) => ({ tenantId, tenantName: `T${tenantId}`, tenantLogo: publicUrl === null ? null : { id: 1, publicUrl }, organization: { id: tenantId } })
const page = (items: object[], pageNumber = 0, totalPages = 1) => ({ data: items, pageNumber, pageSize: ORG_PAGE_SIZE, totalPages, lastPage: pageNumber + 1 >= totalPages })

/** Serves the org list from `pages` (by `page` param) and counts the page requests. */
function portal(pages: object[]): { requests: string[] } {
  const requests: string[] = []
  server.use(
    http.get(PORTAL, ({ request }) => {
      const search = new URL(request.url).searchParams
      requests.push(search.toString())
      return HttpResponse.json(pages[Number(search.get("page"))] ?? page([], Number(search.get("page")), pages.length))
    }),
  )
  return { requests }
}

function logo(resolver: Parameters<typeof http.get>[1], url = LOGO): void {
  server.use(http.get(url, resolver))
}

beforeEach(() => {
  stubServerEnv()
  handler = createOrgLogoHandler({ env: testEnv(), now: () => NOW })
})

describe("GET /api/pp/org-logo/[tenantId] (AD-24)", () => {
  it("serves the logo of a member tenant inline, typed from its bytes, with no credentials to the files host", async () => {
    portal([page([item(3), item(7)])])
    let seen: Headers | undefined
    logo(({ request }) => {
      seen = request.headers
      return new HttpResponse(IMAGES.jpeg, { headers: { "Content-Type": "image/png", "Set-Cookie": "files=1", "Cache-Control": "public, max-age=99" } })
    })
    const response = await get()
    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("image/jpeg")
    expect(response.headers.get("Content-Disposition")).toBe("inline")
    expect(response.headers.get("Set-Cookie")).toBeNull()
    expectNoStore(response)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(IMAGES.jpeg)
    expect(seen?.get("Authorization")).toBeNull()
    expect(seen?.get("Cookie")).toBeNull()
  })

  it.each([
    ["PNG", IMAGES.png, "image/png"],
    ["WebP", IMAGES.webp, "image/webp"],
  ])("serves %s", async (_label, bytes, type) => {
    portal([page([item(7)])])
    logo(() => new HttpResponse(bytes))
    const response = await get()
    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe(type)
  })

  it("pages with size 50 until the member is found on page 3", async () => {
    const { requests } = portal([page([item(1)], 0, 5), page([item(2)], 1, 5), page([item(7)], 2, 5)])
    logo(() => new HttpResponse(IMAGES.png))
    expect((await get()).status).toBe(200)
    expect(requests).toEqual(["page=0&size=50", "page=1&size=50", "page=2&size=50"])
  })

  it("skips numeric tenant ids above 2^53 (JSON.parse rounds them), so a rounded id never matches another tenant", async () => {
    // 9007199254740993 parses to 9007199254740992: without the guard it would match tenant "9007199254740992".
    const { requests } = portal([page([item(9007199254740993)])])
    await expectBffError(await get("9007199254740992"), 404, "NO_LOGO")
    expect(requests).toHaveLength(1)
  })

  it("matches a large tenant id sent as a decimal string", async () => {
    portal([page([{ ...item(0), tenantId: "1234567890123456789" }])])
    logo(() => new HttpResponse(IMAGES.png))
    expect((await get("1234567890123456789")).status).toBe(200)
  })

  it("stops after 5 pages: not a member → 404", async () => {
    const pages = Array.from({ length: 8 }, (_, i) => page([item(100 + i)], i, 8))
    const { requests } = portal(pages)
    await expectBffError(await get(), 404, "NO_LOGO")
    expect(requests).toHaveLength(ORG_MAX_PAGES)
  })

  it.each([
    ["an empty page", [page([], 0, 3)]],
    ["the last page", [{ ...page([item(1)], 0, 1), totalPages: undefined }]],
    ["totalPages reached", [{ ...page([item(1)], 0, 1), lastPage: undefined }]],
  ])("stops at %s", async (_label, pages) => {
    const { requests } = portal(pages)
    await expectBffError(await get(), 404, "NO_LOGO")
    expect(requests).toHaveLength(1)
  })

  describe("private membership page reuse", () => {
    it("shares paged concurrent membership reads across logos but refetches image bytes", async () => {
      let lookups = 0
      handler = createOrgLogoHandler({ env: testEnv(), now: () => NOW, publicFilesOrigin: () => { lookups += 1; return FILES } })
      const requests: string[] = []
      let release!: () => void
      const ready = new Promise<void>((resolve) => { release = resolve })
      let reached = false
      server.use(http.get(PORTAL, async ({ request }) => {
        const index = Number(new URL(request.url).searchParams.get("page"))
        requests.push(String(index))
        reached = true
        await ready
        return HttpResponse.json(index === 0 ? page([item(1)], 0, 2) : page([item(7), item(8)], 1, 2))
      }))
      let images = 0
      logo(() => { images += 1; return new HttpResponse(IMAGES.png) })
      const first = get()
      await vi.waitFor(() => expect(reached).toBe(true))
      const second = get("8")
      // Origin resolution immediately precedes the synchronous pending-cache lookup.
      await vi.waitFor(() => expect(lookups).toBe(2))
      expect(requests).toEqual(["0"])
      release()
      const responses = [...await Promise.all([first, second]), await get()]
      for (const response of responses) { expect(response.status).toBe(200); expectNoStore(response) }
      expect(requests).toEqual(["0", "1"])
      expect(images).toBe(3)
    })

    it("prunes a later cached page using the current clock after a slow earlier page", async () => {
      let now = NOW
      handler = createOrgLogoHandler({ env: testEnv(), now: () => now })
      let release!: () => void
      const ready = new Promise<void>((resolve) => { release = resolve })
      let blocked = false
      let pageZeroReads = 0
      let pageOneReads = 0
      server.use(http.get(PORTAL, async ({ request }) => {
        if (new URL(request.url).searchParams.get("page") === "0") {
          pageZeroReads += 1
          if (pageZeroReads === 2) { blocked = true; await ready }
          return HttpResponse.json(page([item(1)], 0, 2))
        }
        pageOneReads += 1
        return HttpResponse.json(page(pageOneReads === 1 ? [item(7)] : [], 1, 2))
      }))
      logo(() => new HttpResponse(IMAGES.png))
      expect((await get("1")).status).toBe(200)
      now = NOW + 1_000
      expect((await get()).status).toBe(200)
      now = NOW + 5_000
      const pending = get()
      await vi.waitFor(() => expect(blocked).toBe(true))
      now = NOW + 6_000
      release()
      await expectBffError(await pending, 404, "NO_LOGO")
      expect(pageZeroReads).toBe(2)
      expect(pageOneReads).toBe(2)
    })

    it("keeps the original request deadline when the first upstream membership read is slow", async () => {
      let now = NOW
      handler = createOrgLogoHandler({ env: testEnv(), now: () => now })
      let release!: () => void
      const ready = new Promise<void>((resolve) => { release = resolve })
      let reads = 0
      server.use(http.get(PORTAL, async () => {
        reads += 1
        if (reads === 1) { await ready; return HttpResponse.json(page([item(7)])) }
        return HttpResponse.json(page([]))
      }))
      logo(() => new HttpResponse(IMAGES.png))
      const pending = get()
      await vi.waitFor(() => expect(reads).toBe(1))
      now = NOW + 4_000
      release()
      expect((await pending).status).toBe(200)
      expect((await get()).status).toBe(200)
      expect(reads).toBe(1)
      now = NOW + 5_000
      await expectBffError(await get(), 404, "NO_LOGO")
      expect(reads).toBe(2)
    })

    it("retains a replacement when an evicted pending read later fails", async () => {
      let release!: () => void
      const ready = new Promise<void>((resolve) => { release = resolve })
      let reads = 0
      server.use(http.get(PORTAL, async () => {
        reads += 1
        if (reads === 1) { await ready; return new HttpResponse(null, { status: 500 }) }
        return HttpResponse.json(page([item(7)]))
      }))
      logo(() => new HttpResponse(IMAGES.png))
      const old = get()
      await vi.waitFor(() => expect(reads).toBe(1))
      // Tenant 9 is not on the page: each read is retained without a logo fetch, which keeps
      // the 256 sequential exchanges well inside the test timeout under full-suite load.
      for (let gen = 1; gen <= 256; gen += 1) await get("9", { session: makeSession({ gen }) })
      expect((await get()).status).toBe(200)
      expect(reads).toBe(258)
      release()
      await expectBffError(await old, 404, "NO_LOGO")
      expect((await get()).status).toBe(200)
      expect(reads).toBe(258)
    })

    it.each([
      { sid: "another-session-1234567890" }, { environment: "prod" as const },
      { userId: 43 }, { personId: 4243 }, { tenantId: 2 }, { gen: 1 },
    ])("isolates membership by %j", async (identity) => {
      let reads = 0
      server.use(http.get(/\/v2\/user\/organization\/portal$/, () => { reads += 1; return HttpResponse.json(page([item(7)])) }))
      logo(() => new HttpResponse(IMAGES.png))
      await get()
      await get("7", { session: makeSession(identity) })
      await get()
      expect(reads).toBe(2)
    })

    it("expires at exactly five seconds and checks token/session/kill-switch gates before reuse", async () => {
      let now = NOW
      let disabled = false
      handler = createOrgLogoHandler({ env: () => testEnv({ ACCOUNT_DISABLED: disabled ? "1" : "0" })(), now: () => now })
      const pages = [page([item(7)])]
      const { requests } = portal(pages)
      logo(() => new HttpResponse(IMAGES.png))
      await get()
      now += 4_999
      await get()
      expect(requests).toHaveLength(1)
      await expectBffError(await get("7", { session: null }), 401, "SESSION_EXPIRED")
      await expectBffError(await get("7", { session: makeSession({ accessExpiresAt: now + 1_000 }) }), 404, "NO_LOGO")
      disabled = true
      await expectBffError(await get(), 503, "SERVICE_DISABLED")
      disabled = false
      expect(requests).toHaveLength(1)
      now += 1
      pages[0] = page([])
      await expectBffError(await get(), 404, "NO_LOGO")
      expect(requests).toHaveLength(2)
    })

    it.each([
      ["failure", () => new HttpResponse(null, { status: 500 })],
      ["malformed page", () => HttpResponse.json({ content: [] })],
    ] as const)("does not retain a %s", async (_label, answer) => {
      let reads = 0
      server.use(http.get(PORTAL, () => { reads += 1; return reads === 1 ? answer() : HttpResponse.json(page([item(7)])) }))
      logo(() => new HttpResponse(IMAGES.png))
      await expectBffError(await get(), 404, "NO_LOGO")
      expect((await get()).status).toBe(200)
      expect(reads).toBe(2)
    })

    it("bounds retained pages to 256 and isolates handler instances", async () => {
      const { requests } = portal([page([item(7)])])
      logo(() => new HttpResponse(IMAGES.png))
      // Tenant 9 is not on the page: the page is retained without a logo fetch per read.
      for (let gen = 0; gen < 257; gen += 1) await get("9", { session: makeSession({ gen }) })
      await get("9", { session: makeSession({ gen: 1 }) })
      expect(requests).toHaveLength(257)
      await get()
      expect(requests).toHaveLength(258)
      const isolated = createOrgLogoHandler({ env: testEnv(), now: () => NOW })
      await callOp(isolated, { path: "/api/pp/org-logo/7", params: { tenantId: "7" } })
      expect(requests).toHaveLength(259)
    })
  })

  describe("every failure is 404 NO_LOGO", () => {
    it.each([
      ["a non-numeric id", "abc"],
      ["a 20-digit id", "1".repeat(20)],
    ])("%s, with no upstream call", async (_label, tenantId) => {
      const calls = trackAllRequests()
      await expectBffError(await get(tenantId), 404, "NO_LOGO")
      expect(calls()).toBe(0)
    })

    it("a stale token, with no upstream call", async () => {
      const calls = trackAllRequests()
      await expectBffError(await get("7", { session: makeSession({ accessExpiresAt: NOW + 1_000 }) }), 404, "NO_LOGO")
      expect(calls()).toBe(0)
    })

    it.each([
      ["upstream 401", () => new HttpResponse(null, { status: 401 })],
      ["upstream 403", () => HttpResponse.json({ message: "x" }, { status: 403 })],
      ["upstream 500", () => new HttpResponse(null, { status: 500 })],
      ["an unexpected page shape", () => HttpResponse.json({ items: [] })],
    ])("org list: %s", async (_label, resolver) => {
      server.use(http.get(PORTAL, resolver))
      await expectBffError(await get(), 404, "NO_LOGO")
    })

    it.each([
      ["no logo", null],
      ["a host mismatch", "https://evil.example/logo.png"],
      ["a look-alike host", `${FILES}.evil.example/logo.png`],
      ["http instead of https", FILES.replace("https:", "http:") + "/logo.png"],
      ["an unparsable URL", "not a url"],
      ["embedded credentials", LOGO.replace("https://", "https://private:secret@")],
      ["a prod-files logo on a demo session", `${PROD_FILES}/logo.png`],
    ])("logo URL: %s, without fetching it", async (_label, publicUrl) => {
      portal([page([item(7, publicUrl)])])
      const calls = { files: 0 }
      server.use(http.get(/bocore-public-files|evil\.example/, () => {
        calls.files += 1
        return new HttpResponse(IMAGES.png)
      }))
      await expectBffError(await get(), 404, "NO_LOGO")
      expect(calls.files).toBe(0)
    })

    it("a demo-files logo on a prod session", async () => {
      server.use(http.get(`${PROD.apiBase}/v2/user/organization/portal`, () => HttpResponse.json(page([item(7, LOGO)]))))
      await expectBffError(await get("7", { session: makeSession({ environment: "prod" }) }), 404, "NO_LOGO")
    })

    it("publicFilesOrigin unset for the session's environment", async () => {
      portal([page([item(7)])])
      const unset = createOrgLogoHandler({ env: testEnv(), now: () => NOW, publicFilesOrigin: () => null })
      await expectBffError(await callOp(unset, { path: "/api/pp/org-logo/7", params: { tenantId: "7" } }), 404, "NO_LOGO")
    })

    it.each([
      ["a redirect", () => new HttpResponse(null, { status: 302, headers: { Location: `${FILES}/other.png` } })],
      ["a 404", () => new HttpResponse(null, { status: 404 })],
      ["a network error", () => HttpResponse.error()],
      ["Content-Length 600 KB", () => new HttpResponse(IMAGES.png, { headers: { "Content-Length": String(600 * 1024) } })],
      ["a streamed body over 512 KB", () => new HttpResponse(new ReadableStream({ start: (c) => { c.enqueue(IMAGES.png); c.enqueue(new Uint8Array(LOGO_MAX_BYTES)); c.close() } }))],
      ["SVG declared and SVG bytes", () => new HttpResponse(IMAGES.svg, { headers: { "Content-Type": "image/svg+xml" } })],
      ["SVG bytes declared PNG", () => new HttpResponse(IMAGES.svg, { headers: { "Content-Type": "image/png" } })],
      ["BMP bytes", () => new HttpResponse(IMAGES.bmp)],
      ["a body that errors", () => new HttpResponse(new ReadableStream({ start: (c) => c.error(new Error("reset")) }))],
    ])("files host: %s", async (_label, resolver) => {
      portal([page([item(7)])])
      logo(resolver)
      await expectBffError(await get(), 404, "NO_LOGO")
    })

    it("files host: a timeout (5 s)", async () => {
      portal([page([item(7)])])
      let reached = false
      logo(async () => {
        reached = true
        await delay("infinite")
        return new HttpResponse(IMAGES.png)
      })
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
      const pending = get()
      await vi.waitFor(() => expect(reached).toBe(true))
      await vi.advanceTimersByTimeAsync(5_000)
      const response = await pending
      vi.useRealTimers()
      await expectBffError(response, 404, "NO_LOGO")
    })
  })

  it.each([
    ["no session", { session: null }, {}, 401, "SESSION_EXPIRED"],
    ["ACCOUNT_DISABLED=1", {}, { ACCOUNT_DISABLED: "1" }, 503, "SERVICE_DISABLED"],
    ["PP_DISABLED=1", {}, { PP_DISABLED: "1" }, 503, "SERVICE_DISABLED"],
    ["a query", { path: "/api/pp/org-logo/7?size=1" }, {}, 400, "BAD_QUERY"],
  ] as const)("%s → %i %s, no upstream call", async (_label, extra, env, status, errorCode) => {
    const calls = trackAllRequests()
    const h = createOrgLogoHandler({ env: testEnv(env), now: () => NOW })
    await expectBffError(await callOp(h, { path: "/api/pp/org-logo/7", params: { tenantId: "7" }, ...extra }), status, errorCode)
    expect(calls()).toBe(0)
  })
})
