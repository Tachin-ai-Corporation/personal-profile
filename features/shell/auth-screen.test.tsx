import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { environmentConfig } from "@/lib/shared/environments"
import { LOGIN_INTENT_KEY } from "@/lib/shared/login-intent"
import { LAUNCH_MESSAGES as M } from "@/lib/shared/messages"
import type { LaunchAttempt } from "@/lib/api"
import { axeViolations } from "@/test/axe"
import { server } from "@/test/msw-server"
import { AuthScreen, SUCCESS_REDIRECT_DELAY_MS } from "./auth-screen"

function setUrl(url: string): void {
  window.history.replaceState(null, "", url)
}

function setReferrer(value: string): void {
  Object.defineProperty(document, "referrer", { value, configurable: true })
}

const noSleep = { sleep: async () => undefined }

beforeEach(() => {
  setUrl("/auth")
  setReferrer("")
  window.sessionStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe("AuthScreen without lpl", () => {
  it("shows Choose Environment when no environment is known; a choice opens manual entry (display only)", async () => {
    render(<AuthScreen rememberedEnvironment={null} />)
    expect(await screen.findByText(M.chooseTitle)).toBeTruthy()
    expect(screen.getByText(M.chooseDescription)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Demo" }))
    expect(screen.getByText(M.manualTitle)).toBeTruthy()
    expect(screen.getByText(M.manualDescription("Demo"))).toBeTruthy()
    expect(screen.getByRole("link", { name: M.goTo1health("Demo") }).getAttribute("href")).toBe(environmentConfig("demo").portalUrl)
  })

  it("uses the referrer before the remembered environment", async () => {
    setReferrer("https://1health.demo.1health.io/apps")
    render(<AuthScreen rememberedEnvironment="prod" />)
    expect(await screen.findByText(M.manualDescription("Demo"))).toBeTruthy()
  })

  it("shows the manual-entry card for a remembered environment, Submit disabled while empty", async () => {
    render(<AuthScreen rememberedEnvironment="prod" />)
    expect(await screen.findByText(M.manualDescription("Production"))).toBeTruthy()
    expect(screen.getByLabelText(M.lplLabel).getAttribute("placeholder")).toBe(M.lplPlaceholder)
    const submit = screen.getByRole("button", { name: M.submit })
    expect(submit.hasAttribute("disabled")).toBe(true)
    fireEvent.change(screen.getByLabelText(M.lplLabel), { target: { value: "   " } })
    expect(submit.hasAttribute("disabled")).toBe(true)
    expect(screen.getByRole("link", { name: M.goTo1health("Production") }).getAttribute("href")).toBe(environmentConfig("prod").portalUrl)
    fireEvent.click(screen.getByRole("button", { name: M.switchEnvironment }))
    expect(screen.getByText(M.chooseTitle)).toBeTruthy()
  })

  it("submits a pasted LPL trimmed with spaces as '+', never storing it", async () => {
    let posted: unknown
    server.use(
      http.post("/api/token", async ({ request }) => {
        posted = await request.json()
        return HttpResponse.json({ ok: true, environment: "prod" })
      }),
    )
    const navigate = vi.fn()
    render(<AuthScreen rememberedEnvironment="prod" navigate={navigate} />)
    fireEvent.change(await screen.findByLabelText(M.lplLabel), { target: { value: "  ab cd \n" } })
    fireEvent.click(screen.getByRole("button", { name: M.submit }))
    expect(await screen.findByText(M.successTitle)).toBeTruthy()
    expect(posted).toEqual({ lpl: "ab+cd" })
    expect(window.sessionStorage.length).toBe(0)
    expect(window.localStorage.length).toBe(0)
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/"), { timeout: SUCCESS_REDIRECT_DELAY_MS + 1000 })
  })

  it("ignores a submit of only whitespace", async () => {
    const attempt = vi.fn()
    render(<AuthScreen rememberedEnvironment="demo" flowDeps={{ attempt }} />)
    const input = await screen.findByLabelText(M.lplLabel)
    fireEvent.change(input, { target: { value: " " } })
    const form = input.closest("form")
    expect(form).not.toBeNull()
    if (form) fireEvent.submit(form)
    expect(attempt).not.toHaveBeenCalled()
  })
})

describe("AuthScreen with lpl", () => {
  it("removes lpl from the address bar before the request, then lands on a / login intent after 1200 ms", async () => {
    setUrl("/auth?lpl=ab%20cd&x=1#h")
    window.sessionStorage.setItem(LOGIN_INTENT_KEY, "/?tab=insurance")
    let urlAtRequest = ""
    const attempt = vi.fn(async (lpl: string): Promise<LaunchAttempt> => {
      urlAtRequest = window.location.href
      expect(lpl).toBe("ab+cd")
      return { kind: "ok", environment: "demo" }
    })
    const navigate = vi.fn()
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    render(<AuthScreen rememberedEnvironment={null} flowDeps={{ ...noSleep, attempt }} navigate={navigate} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(urlAtRequest).not.toContain("lpl")
    expect(window.location.search).toBe("?x=1")
    expect(window.location.hash).toBe("#h")
    expect(screen.getByText(M.successTitle)).toBeTruthy()
    expect(screen.getByText(M.successBody)).toBeTruthy()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SUCCESS_REDIRECT_DELAY_MS - 1)
    })
    expect(navigate).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(navigate).toHaveBeenCalledWith("/?tab=insurance")
    expect(window.sessionStorage.getItem(LOGIN_INTENT_KEY)).toBeNull()
  })

  it("lands on / when the saved intent is not on / (e.g. /account?tab=provider)", async () => {
    setUrl("/auth?lpl=abc")
    window.sessionStorage.setItem(LOGIN_INTENT_KEY, "/account?tab=provider")
    const navigate = vi.fn()
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    render(<AuthScreen rememberedEnvironment={null} flowDeps={{ attempt: async () => ({ kind: "ok", environment: "prod" }) }} navigate={navigate} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SUCCESS_REDIRECT_DELAY_MS)
    })
    expect(navigate).toHaveBeenCalledWith("/")
    expect(window.sessionStorage.getItem(LOGIN_INTENT_KEY)).toBeNull()
  })

  it("shows Authenticating on attempt 1 and Confirming from attempt 2", async () => {
    setUrl("/auth?lpl=abc")
    const resolvers: ((value: LaunchAttempt) => void)[] = []
    const attempt = () => new Promise<LaunchAttempt>((resolve) => resolvers.push(resolve))
    render(<AuthScreen rememberedEnvironment="prod" flowDeps={{ ...noSleep, attempt }} />)
    expect(await screen.findByText(M.authenticatingTitle)).toBeTruthy()
    expect(screen.getByText(M.connectingTo("Production"))).toBeTruthy()
    await act(async () => resolvers[0]({ kind: "network" }))
    expect(await screen.findByText(M.confirmingTitle)).toBeTruthy()
    expect(screen.getByText(M.confirmingBody)).toBeTruthy()
  })

  it("shows the error Alert with the server's message and the three actions; raw codes never render", async () => {
    setUrl("/auth?lpl=abc")
    server.use(
      http.post("/api/token", () =>
        HttpResponse.json({ ok: false, errorCode: "WRONG_TENANT", source: "proxy", message: "Tenant copy", retryable: false }, { status: 403 }),
      ),
    )
    render(<AuthScreen rememberedEnvironment="demo" />)
    expect(await screen.findByText(M.failedTitle)).toBeTruthy()
    expect(screen.getByText("Tenant copy")).toBeTruthy()
    expect(screen.queryByText(/WRONG_TENANT/)).toBeNull()
    expect(screen.getByRole("link", { name: M.goTo1health("Demo") }).getAttribute("href")).toBe(environmentConfig("demo").portalUrl)
    fireEvent.click(screen.getByRole("button", { name: M.switchEnvironment }))
    expect(screen.getByText(M.chooseTitle)).toBeTruthy()
  })

  it("Enter LPL Manually opens the manual-entry card from the error screen", async () => {
    setUrl("/auth?lpl=abc")
    const attempt = async (): Promise<LaunchAttempt> => ({ kind: "failed", retryable: false })
    render(<AuthScreen rememberedEnvironment={null} flowDeps={{ attempt }} />)
    expect(await screen.findByText(M.failedFallback)).toBeTruthy()
    expect(screen.getByRole("link", { name: M.goTo1health("Production") })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: M.enterManually }))
    expect(screen.getByText(M.manualTitle)).toBeTruthy()
  })

  it("does not navigate after unmounting before the success delay ends", async () => {
    setUrl("/auth?lpl=abc")
    const navigate = vi.fn()
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    const view = render(
      <AuthScreen rememberedEnvironment={null} flowDeps={{ attempt: async () => ({ kind: "ok", environment: "prod" }) }} navigate={navigate} />,
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(screen.getByText(M.successTitle)).toBeTruthy()
    view.unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SUCCESS_REDIRECT_DELAY_MS)
    })
    expect(navigate).not.toHaveBeenCalled()
  })

  it("never reads the browser cookie jar", async () => {
    setUrl("/auth?lpl=abc")
    const cookieGet = vi.spyOn(document, "cookie", "get")
    server.use(http.post("/api/token", () => HttpResponse.json({ ok: true, environment: "prod" })))
    render(<AuthScreen rememberedEnvironment="prod" navigate={vi.fn()} />)
    expect(await screen.findByText(M.successTitle)).toBeTruthy()
    expect(cookieGet).not.toHaveBeenCalled()
  })

  it("navigates with location.assign by default", async () => {
    setUrl("/auth?lpl=abc")
    const assign = vi.fn()
    vi.stubGlobal("location", { ...window.location, assign, href: window.location.href })
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    render(<AuthScreen rememberedEnvironment={null} flowDeps={{ attempt: async () => ({ kind: "ok", environment: "prod" }) }} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SUCCESS_REDIRECT_DELAY_MS)
    })
    expect(assign).toHaveBeenCalledWith("/")
  })
})

// Ported from origin/main's auth-screen.test.tsx (spec R5-2).
describe("AuthScreen: blank lpl values and accessibility", () => {
  function countTokenPosts(): () => number {
    let posts = 0
    server.use(
      http.post("/api/token", () => {
        posts += 1
        return HttpResponse.json({ ok: true, environment: "prod" })
      }),
    )
    return () => posts
  }

  it.each([
    ["/auth?lpl=", ""],
    ["/auth?lpl=%20%20", ""],
    ["/auth?lpl=+++&x=1", "?x=1"],
  ])("%s is treated like no lpl: no POST, the card shows, lpl is stripped (other params kept)", async (url, search) => {
    const posts = countTokenPosts()
    setUrl(url)
    const view = render(<AuthScreen rememberedEnvironment="demo" />)
    expect(await screen.findByText(M.manualTitle)).toBeTruthy()
    expect(window.location.search).toBe(search)
    view.unmount()
    setUrl(url)
    render(<AuthScreen rememberedEnvironment={null} />)
    expect(await screen.findByText(M.chooseTitle)).toBeTruthy()
    expect(window.location.search).toBe(search)
    await act(async () => undefined)
    expect(posts()).toBe(0)
  })

  it("never reads the browser cookie jar without an lpl, on manual entry, or on the error screen", async () => {
    const cookieGet = vi.spyOn(document, "cookie", "get")
    server.use(http.post("/api/token", () => HttpResponse.json({ ok: false, errorCode: "LAUNCH_INVALID", source: "proxy", message: "Nope", retryable: false }, { status: 400 })))
    // No lpl → the manual card; then a manual submit → the error screen.
    render(<AuthScreen rememberedEnvironment="demo" />)
    fireEvent.change(await screen.findByLabelText(M.lplLabel), { target: { value: "abc" } })
    fireEvent.click(screen.getByRole("button", { name: M.submit }))
    expect(await screen.findByText(M.failedTitle)).toBeTruthy()
    // The chooser from the error screen.
    fireEvent.click(screen.getByRole("button", { name: M.switchEnvironment }))
    expect(screen.getByText(M.chooseTitle)).toBeTruthy()
    expect(cookieGet).not.toHaveBeenCalled()
  })

  it("axe-core reports zero violations on the error state", async () => {
    setUrl("/auth?lpl=abc")
    render(<AuthScreen rememberedEnvironment="prod" flowDeps={{ attempt: async () => ({ kind: "failed", message: "Nope", retryable: false }) }} />)
    expect(await screen.findByText(M.failedTitle)).toBeTruthy()
    expect(await axeViolations()).toEqual([])
  })

  it("axe-core reports zero violations on the manual card and the chooser", async () => {
    const view = render(<AuthScreen rememberedEnvironment="demo" />)
    expect(await screen.findByText(M.manualTitle)).toBeTruthy()
    expect(await axeViolations()).toEqual([])
    view.unmount()
    render(<AuthScreen rememberedEnvironment={null} />)
    expect(await screen.findByText(M.chooseTitle)).toBeTruthy()
    expect(await axeViolations()).toEqual([])
  })
})
