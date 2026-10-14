import { fireEvent, render, screen } from "@testing-library/react"
import axe from "axe-core"
import { afterEach, describe, expect, it, vi } from "vitest"
import { mapApiError, type ApiResponse, type MappedError } from "@/lib/api"
import { LoadError, NoAccess, ReadStateFor } from "."

const LOAD_ERROR = "Something went wrong while loading profile information"
const NO_ACCESS = "You don't have access to this in your current account"

const fail = (fields: Omit<ApiResponse<unknown>, "success">): ApiResponse<unknown> => ({ success: false, ...fields })

afterEach(() => document.documentElement.classList.remove("dark"))

describe("LoadError", () => {
  it("shows the sentence and a separate Retry button that calls onRetry", () => {
    const onRetry = vi.fn()
    render(<LoadError onRetry={onRetry} />)
    const alert = screen.getByRole("alert")
    expect(alert.textContent).toBe(LOAD_ERROR)
    const retry = screen.getByRole("button", { name: "Retry" })
    expect(alert.contains(retry)).toBe(false)
    expect(retry.className).toContain("h-11")
    expect(retry.className).toContain("text-link-text")
    fireEvent.click(retry)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

describe("NoAccess", () => {
  it("shows one line and no action", () => {
    const { container } = render(<NoAccess />)
    expect(screen.getByRole("status").textContent).toBe(NO_ACCESS)
    expect(container.querySelectorAll("button, a")).toHaveLength(0)
  })
})

describe("ReadStateFor", () => {
  it.each<[string, MappedError, string | null]>([
    ["forbidden", { kind: "forbidden" }, NO_ACCESS],
    ["generic", { kind: "generic" }, LOAD_ERROR],
    ["generic with a platform message", { kind: "generic", message: "Raw platform text" }, LOAD_ERROR],
    ["network", { kind: "network" }, LOAD_ERROR],
    ["session", { kind: "session" }, null],
  ])("renders %s", (_label, error, text) => {
    const { container } = render(<ReadStateFor error={error} onRetry={vi.fn()} />)
    if (text === null) expect(container.innerHTML).toBe("")
    else expect(container.textContent).toContain(text)
    expect(container.textContent).not.toContain("Raw platform text")
  })

  it("never shows no access for a proxy NOT_ALLOWED, only for an upstream 403", () => {
    const proxy = render(<ReadStateFor error={mapApiError(fail({ statusCode: 403, errorCode: "NOT_ALLOWED", source: "proxy" }))} onRetry={vi.fn()} />)
    expect(proxy.container.textContent).toContain(LOAD_ERROR)
    expect(proxy.container.textContent).not.toContain(NO_ACCESS)
    proxy.unmount()
    const upstream = render(<ReadStateFor error={mapApiError(fail({ statusCode: 403 }))} onRetry={vi.fn()} />)
    expect(upstream.container.textContent).toContain(NO_ACCESS)
  })

  it.each(["light", "dark"])("has no axe violations in %s mode", async (theme) => {
    if (theme === "dark") document.documentElement.classList.add("dark")
    render(
      <main>
        <LoadError onRetry={vi.fn()} />
        <NoAccess />
      </main>,
    )
    const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })
    expect(results.violations).toEqual([])
  })
})
