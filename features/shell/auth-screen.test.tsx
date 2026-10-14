import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LOGIN_INTENT_KEY } from "@/lib/shared/login-intent"
import { AUTH_COPY } from "@/lib/shared/messages"
import { axeViolations } from "../../test/axe"
import { server } from "../../test/server"
import { AUTH_RETRY_DELAY_MS, AuthScreen, MAX_AUTH_ATTEMPTS, SUCCESS_DELAY_MS } from "./auth-screen"

/**
 * The `/auth` client launch flow (Story 1.2, D9) with fake timers + MSW at the
 * same-origin `/api/token` boundary: attempts, the fixed 1,500 ms delay,
 * `retryable: false`, the error Alert, manual entry, Choose Environment, the
 * display environment (referrer → remembered cookie) and the login intent.
 */

const TOKEN_URL = "http://localhost:3000/api/token"
const LPL = "abc+def/ghi+jkl=="

type Seen = { at: number; body: unknown; href: string }

let seen: Seen[]
let assign: ReturnType<typeof vi.fn<(url: string) => void>>
let referrer = ""

/** Answer each POST with the next responder; the last one repeats. */
function answer(...responders: (() => Response)[]) {
  server.use(
    http.post(TOKEN_URL, async ({ request }) => {
      seen.push({ at: Date.now(), body: await request.json(), href: realLocation.href })
      const responder = responders[Math.min(seen.length - 1, responders.length - 1)]
      return responder()
    }),
  )
}

const ok = () => HttpResponse.json({ ok: true, environment: "demo" })
const bad502 = () =>
  HttpResponse.json(
    { ok: false, errorCode: "LAUNCH_INVALID", source: "proxy", message: "Server says expired." },
    { status: 502 },
  )
const stop403 = () =>
  HttpResponse.json(
    { ok: false, errorCode: "WRONG_TENANT", source: "proxy", message: "Tenant copy.", retryable: false },
    { status: 403 },
  )

const realLocation = window.location

/** Let real I/O and microtasks settle without moving the fake clock. */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve))
  })
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
  await settle()
}

function mount(url: string, remembered: "demo" | "prod" | null = null) {
  window.history.replaceState(null, "", url)
  return render(<AuthScreen rememberedEnvironment={remembered} />)
}

beforeEach(() => {
  seen = []
  referrer = ""
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] })
  vi.setSystemTime(1_800_000_000_000)
  assign = vi.fn<(url: string) => void>()
  vi.spyOn(document, "referrer", "get").mockImplementation(() => referrer)
  vi.stubGlobal("location", {
    get href() {
      return realLocation.href
    },
    get origin() {
      return realLocation.origin
    },
    get pathname() {
      return realLocation.pathname
    },
    get search() {
      return realLocation.search
    },
    get hash() {
      return realLocation.hash
    },
    assign,
    replace: vi.fn(),
    reload: vi.fn(),
  })
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.sessionStorage.clear()
  window.history.replaceState(null, "", "/")
})

describe("AuthScreen — launch with lpl", () => {
  it("success on attempt 1 → one POST {lpl} (spaces → +), lpl stripped first, Success!, assign('/') after 1,200 ms", async () => {
    answer(ok)
    // The portal's unencoded `+` arrives as a space after query decoding.
    mount(`/auth?lpl=${LPL}&x=1#frag`)
    await settle()

    expect(seen).toHaveLength(1)
    expect(seen[0].body).toEqual({ lpl: LPL })
    // `lpl` was gone from the address bar before the request was sent; nothing else changed.
    expect(seen[0].href).toBe("http://localhost:3000/auth?x=1#frag")
    expect(screen.getByRole("heading", { name: AUTH_COPY.success })).toBeInTheDocument()
    expect(screen.getByText(AUTH_COPY.loadingApp)).toBeInTheDocument()

    await advance(SUCCESS_DELAY_MS - 1)
    expect(assign).not.toHaveBeenCalled()
    await advance(1)
    expect(assign).toHaveBeenCalledExactlyOnceWith("/")
    expect(seen).toHaveLength(1)
  })

  it("attempt 1 shows Authenticating / Connecting to the shown environment", async () => {
    server.use(http.post(TOKEN_URL, () => new Promise<Response>(() => {})))
    referrer = "https://1health.demo.1health.io/applications"
    mount(`/auth?lpl=${LPL}`)
    await settle()
    expect(screen.getByRole("heading", { name: AUTH_COPY.authenticating })).toBeInTheDocument()
    expect(screen.getByText("Connecting to Demo environment")).toBeInTheDocument()
  })

  it("two 502s then success → three POSTs 1,500 ms apart; attempt 2+ shows Confirming", async () => {
    answer(bad502, bad502, ok)
    mount(`/auth?lpl=${LPL}`)
    await settle()
    expect(seen).toHaveLength(1)

    await advance(AUTH_RETRY_DELAY_MS - 1)
    expect(seen).toHaveLength(1)
    await advance(1)
    expect(seen).toHaveLength(2)
    expect(screen.getByRole("heading", { name: AUTH_COPY.confirming })).toBeInTheDocument()
    expect(screen.getByText(AUTH_COPY.confirmingBody)).toBeInTheDocument()

    await advance(AUTH_RETRY_DELAY_MS)
    expect(seen).toHaveLength(3)
    expect(seen.map((s) => s.at - seen[0].at)).toEqual([0, AUTH_RETRY_DELAY_MS, 2 * AUTH_RETRY_DELAY_MS])
    expect(screen.getByRole("heading", { name: AUTH_COPY.success })).toBeInTheDocument()

    await advance(SUCCESS_DELAY_MS)
    expect(assign).toHaveBeenCalledExactlyOnceWith("/")
  })

  it("a retryable:false body → one POST, then the error Alert with the body's message", async () => {
    answer(stop403)
    mount(`/auth?lpl=${LPL}`)
    await settle()
    await advance(10 * AUTH_RETRY_DELAY_MS)

    expect(seen).toHaveLength(1)
    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent(AUTH_COPY.failedTitle)
    expect(alert).toHaveTextContent("Tenant copy.")
    expect(alert).not.toHaveTextContent("WRONG_TENANT")
    expect(assign).not.toHaveBeenCalled()
  })

  it("five failures → five POSTs, then the last attempt's title and message", async () => {
    let n = 0
    server.use(
      http.post(TOKEN_URL, async ({ request }) => {
        seen.push({ at: Date.now(), body: await request.json(), href: realLocation.href })
        n++
        return HttpResponse.json({ ok: false, errorCode: "LAUNCH_INVALID", source: "proxy", message: `Attempt ${n}.` }, { status: 502 })
      }),
    )
    mount(`/auth?lpl=${LPL}`)
    await settle()
    for (let i = 0; i < MAX_AUTH_ATTEMPTS + 2; i++) await advance(AUTH_RETRY_DELAY_MS)

    expect(seen).toHaveLength(MAX_AUTH_ATTEMPTS)
    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent(AUTH_COPY.failedTitle)
    expect(alert).toHaveTextContent("Attempt 5.")
  })

  it("a failure without a message uses the fallback; an OK body without ok:true is retried", async () => {
    answer(
      () => HttpResponse.json({ ok: false }),
      () => new HttpResponse("not json", { status: 500 }),
    )
    mount(`/auth?lpl=${LPL}`)
    await settle()
    for (let i = 0; i < MAX_AUTH_ATTEMPTS + 1; i++) await advance(AUTH_RETRY_DELAY_MS)
    expect(seen).toHaveLength(MAX_AUTH_ATTEMPTS)
    expect(screen.getByRole("alert")).toHaveTextContent(AUTH_COPY.failedFallback)
  })

  it("network errors on every attempt → five POSTs, then Connection Error", async () => {
    server.use(
      http.post(TOKEN_URL, () => {
        seen.push({ at: Date.now(), body: null, href: "" })
        return HttpResponse.error()
      }),
    )
    mount(`/auth?lpl=${LPL}`)
    await settle()
    for (let i = 0; i < MAX_AUTH_ATTEMPTS + 1; i++) await advance(AUTH_RETRY_DELAY_MS)
    expect(seen).toHaveLength(MAX_AUTH_ATTEMPTS)
    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent(AUTH_COPY.connectionTitle)
    expect(alert).toHaveTextContent(AUTH_COPY.connectionBody)
  })

  it.each([
    ["/?tab=insurance", "/?tab=insurance"],
    ["//evil.example", "/"],
    ["/auth", "/"],
  ])("login intent %j → assign(%j)", async (stored, target) => {
    window.sessionStorage.setItem(LOGIN_INTENT_KEY, stored)
    answer(ok)
    mount(`/auth?lpl=${LPL}`)
    await settle()
    await advance(SUCCESS_DELAY_MS)
    expect(assign).toHaveBeenCalledExactlyOnceWith(target)
    expect(window.sessionStorage.getItem(LOGIN_INTENT_KEY)).toBeNull()
  })

  it("never reads the browser cookie jar", async () => {
    const cookieGet = vi.spyOn(document, "cookie", "get")
    answer(ok)
    mount(`/auth?lpl=${LPL}`, "prod")
    await settle()
    expect(cookieGet).not.toHaveBeenCalled()
  })
})

describe("AuthScreen — error actions", () => {
  async function toError(remembered: "demo" | "prod" | null = null) {
    answer(stop403)
    mount(`/auth?lpl=${LPL}`, remembered)
    await settle()
  }

  it("shows the three buttons; Go to 1health targets the shown environment's portal in the same tab", async () => {
    await toError("demo")
    expect(screen.getByRole("button", { name: AUTH_COPY.enterManually })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: AUTH_COPY.switchEnvironment })).toBeInTheDocument()
    const link = screen.getByRole("link", { name: "Go to 1health (Demo)" })
    expect(link).toHaveAttribute("href", "https://1health.demo.1health.io")
    expect(link).not.toHaveAttribute("target")
  })

  it("falls back to Production with no known environment", async () => {
    await toError(null)
    expect(screen.getByRole("link", { name: "Go to 1health (Production)" })).toHaveAttribute(
      "href",
      "https://1health.app.1health.io",
    )
  })

  it("Enter LPL Manually opens the manual card; Switch Environment opens Choose Environment", async () => {
    await toError("prod")
    fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.enterManually }))
    expect(screen.getByRole("heading", { name: AUTH_COPY.manualTitle })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: AUTH_COPY.switchEnvironment }))
    expect(screen.getByRole("heading", { name: AUTH_COPY.chooseTitle })).toBeInTheDocument()
  })

  it("axe-core reports zero violations on the error state", async () => {
    await toError("prod")
    vi.useRealTimers()
    expect(await axeViolations()).toEqual([])
  })
})

describe("AuthScreen — no lpl", () => {
  it("a demo referrer → the manual-entry card for Demo, with no request", async () => {
    referrer = "https://1health.demo.1health.io/"
    answer(ok)
    mount("/auth", "prod")
    await settle()
    expect(screen.getByRole("heading", { name: AUTH_COPY.manualTitle })).toBeInTheDocument()
    expect(screen.getByText("Connected to Demo environment. No launch payload detected.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Go to 1health (Demo)" })).toBeInTheDocument()
    expect(seen).toHaveLength(0)
  })

  it.each(["/auth?lpl=", "/auth?lpl=%20%20", "/auth?lpl=+++&x=1"])(
    "%s is treated like no lpl: no POST, the card shows, lpl is stripped",
    async (url) => {
      answer(ok)
      mount(url, "demo")
      await settle()
      expect(seen).toHaveLength(0)
      expect(screen.getByRole("heading", { name: AUTH_COPY.manualTitle })).toBeInTheDocument()
      expect(realLocation.href).not.toContain("lpl")
      cleanup()
      mount(url, null)
      await settle()
      expect(seen).toHaveLength(0)
      expect(screen.getByRole("heading", { name: AUTH_COPY.chooseTitle })).toBeInTheDocument()
    },
  )

  it("no referrer → the remembered environment", async () => {
    mount("/auth", "prod")
    await settle()
    expect(screen.getByText("Connected to Production environment. No launch payload detected.")).toBeInTheDocument()
  })

  it("neither → Choose Environment; a choice only changes labels and links", async () => {
    answer(ok)
    mount("/auth", null)
    await settle()
    expect(screen.getByRole("heading", { name: AUTH_COPY.chooseTitle })).toBeInTheDocument()
    expect(screen.getByText(AUTH_COPY.chooseDescription)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Demo" }))
    expect(screen.getByText("Connected to Demo environment. No launch payload detected.")).toBeInTheDocument()
    expect(seen).toHaveLength(0)
  })

  it("Submit is disabled while empty, then sends the trimmed value with spaces → + and no environment", async () => {
    answer(ok)
    mount("/auth", "demo")
    await settle()
    const submit = screen.getByRole("button", { name: AUTH_COPY.submit })
    const field = screen.getByLabelText(AUTH_COPY.lplLabel)
    expect(field).toHaveAttribute("placeholder", AUTH_COPY.lplPlaceholder)
    expect(submit).toBeDisabled()
    fireEvent.change(field, { target: { value: "   " } })
    expect(submit).toBeDisabled()
    fireEvent.change(field, { target: { value: "  abc def==  " } })
    expect(submit).toBeEnabled()
    fireEvent.click(submit)
    await settle()
    expect(seen).toHaveLength(1)
    expect(seen[0].body).toEqual({ lpl: "abc+def==" })
    expect(realLocation.search).toBe("")
  })

  it("axe-core reports zero violations on the manual card and the chooser", async () => {
    mount("/auth", "demo")
    await settle()
    vi.useRealTimers()
    expect(await axeViolations()).toEqual([])
    cleanup()
    mount("/auth", null)
    await settle()
    expect(await axeViolations()).toEqual([])
  })
})
