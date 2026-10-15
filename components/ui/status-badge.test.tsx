import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { axeViolations } from "@/test/axe"
import { StatusBadge, type StatusBadgeStatus } from "./status-badge"

describe("StatusBadge", () => {
  it.each<[StatusBadgeStatus, string, string, string | null]>([
    ["verified", "Verified", "text-success-strong", "lucide-circle-check"],
    ["notVerified", "Not verified", "text-warning-strong", "lucide-circle-alert"],
    ["pending", "Link sent · Resend in 60 s", "text-muted-foreground", null],
  ])("%s shows the word in its color, with its icon", (status, word, color, icon) => {
    const { container } = render(<StatusBadge status={status}>{word}</StatusBadge>)
    const badge = container.querySelector<HTMLElement>("[data-slot='status-badge']")
    expect(badge?.textContent).toBe(word)
    expect(badge?.getAttribute("data-status")).toBe(status)
    expect(badge?.className).toContain(color)
    const svg = badge?.querySelector("svg")
    if (icon === null) {
      expect(svg).toBeNull()
      expect(badge?.className).not.toContain("font-medium")
    } else {
      expect(svg?.getAttribute("class")).toContain(icon)
      expect(svg?.getAttribute("aria-hidden")).toBe("true")
      expect(badge?.className).toContain("font-medium")
    }
  })

  it("takes the word from the caller (e.g. Enabled for the authenticator app)", () => {
    render(<StatusBadge status="verified">Enabled</StatusBadge>)
    expect(screen.getByText("Enabled").getAttribute("data-status")).toBe("verified")
  })

  it("has no axe violations", async () => {
    render(
      <main>
        <StatusBadge status="verified">Verified</StatusBadge>
        <StatusBadge status="notVerified">Not verified</StatusBadge>
        <StatusBadge status="pending">Link sent · Resend in 60 s</StatusBadge>
      </main>,
    )
    expect(await axeViolations()).toEqual([])
  })
})
