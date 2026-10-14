import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { DISABLED_COPY } from "@/lib/shared/messages"
import { axeViolations } from "../../test/axe"
import { DisabledScreen } from "./disabled-screen"
import { environmentFromReferrer } from "./display-environment"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function setReferrer(value: string) {
  vi.spyOn(document, "referrer", "get").mockReturnValue(value)
}

describe("DisabledScreen (kill switch)", () => {
  it("renders the draft copy and links to the given environment's portal, same tab", () => {
    render(<DisabledScreen environment="demo" />)
    expect(screen.getByRole("heading", { level: 1, name: DISABLED_COPY.title })).toBeInTheDocument()
    expect(screen.getByText(DISABLED_COPY.body)).toBeInTheDocument()
    const link = screen.getByRole("link", { name: DISABLED_COPY.action })
    expect(link).toHaveAttribute("href", "https://1health.demo.1health.io")
    expect(link).not.toHaveAttribute("target")
  })

  it("falls back to prod", () => {
    render(<DisabledScreen environment={null} />)
    expect(screen.getByRole("link", { name: DISABLED_COPY.action })).toHaveAttribute(
      "href",
      "https://1health.app.1health.io",
    )
  })

  it("the referrer wins only when useReferrer is set", () => {
    setReferrer("https://1health.demo.1health.io/applications")
    const { unmount } = render(<DisabledScreen environment="prod" useReferrer />)
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://1health.demo.1health.io")
    unmount()
    render(<DisabledScreen environment="prod" />)
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://1health.app.1health.io")
  })

  it("axe-core reports zero violations", async () => {
    render(<DisabledScreen environment="prod" />)
    expect(await axeViolations()).toEqual([])
  })
})

describe("environmentFromReferrer", () => {
  it.each([
    ["https://1health.demo.1health.io/x", "demo"],
    ["https://demo.1health.io/", "demo"],
    ["https://1health.app.1health.io/", "prod"],
    ["https://app.1health.io/applications", "prod"],
    ["https://evil.example/", null],
    ["", null],
    ["not a url", null],
  ])("%j → %s", (referrer, expected) => {
    expect(environmentFromReferrer(referrer)).toBe(expected)
  })
})
