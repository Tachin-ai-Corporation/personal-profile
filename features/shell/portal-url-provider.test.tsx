import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { getPortalUrl } from "@/lib/api"
import { PortalUrlProvider, usePortalUrl } from "./portal-url-provider"

function PortalProbe() {
  return <span>{usePortalUrl()}</span>
}

describe("PortalUrlProvider", () => {
  it("exposes the portal URL and registers it with the API client", () => {
    render(
      <PortalUrlProvider portalUrl="https://portal.test">
        <PortalProbe />
      </PortalUrlProvider>,
    )
    expect(screen.getByText("https://portal.test")).toBeTruthy()
    expect(getPortalUrl()).toBe("https://portal.test")
  })

  it("refuses use outside the provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    expect(() => render(<PortalProbe />)).toThrow("usePortalUrl must be used inside PortalUrlProvider")
  })
})
