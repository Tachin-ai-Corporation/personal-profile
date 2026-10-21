import { createRef } from "react"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it } from "vitest"
import { OrganizationCard } from "./organization-card"
import type { OrganizationPortalItem } from "@/lib/api"
import { stubLayoutApis } from "@/test/dom-stubs"

beforeEach(() => stubLayoutApis())

const organization: OrganizationPortalItem = { tenantId: "42", enabledInTenant: true, name: "Long Laboratory", shortName: "LL", types: ["Lab"], personContacts: [] }

describe("OrganizationCard", () => {
  it("labels the article, exposes full name and heading focus, and accepts its portal action", () => {
    const ref = createRef<HTMLHeadingElement>()
    render(<OrganizationCard organization={organization} headingRef={ref} portalAction={<button>Portal</button>} />)
    expect(screen.getByRole("article", { name: "LL" })).toBeTruthy()
    expect(ref.current).toBe(screen.getByRole("heading", { name: "LL", level: 3 }))
    expect(ref.current?.getAttribute("tabindex")).toBe("-1")
    expect(screen.getByRole("button", { name: "Portal" })).toBeTruthy()
  })
  it("keeps absent organization names accessible with safe decorative initials", () => {
    render(<OrganizationCard organization={{ ...organization, shortName: " n/a ", name: "  " }} />)
    const article = screen.getByRole("article", { name: "Not provided" })
    const heading = within(article).getByRole("heading", { name: "Not provided", level: 3 })
    expect(article.getAttribute("aria-labelledby")).toBe(heading.id)
    expect(within(article).getByRole("button", { name: "Primary contact for Not provided" })).toBeTruthy()
    const initials = within(article).getByText("NP", { exact: true })
    expect(initials.getAttribute("aria-hidden")).toBe("true")
    expect(article.querySelector("img")?.getAttribute("alt")).toBe("")
  })
  it("shows decorative initials during protected image loading/error and retries when identity changes", () => {
    const { container, rerender } = render(<OrganizationCard organization={organization} />)
    const image = container.querySelector("img")!
    expect(image?.getAttribute("src")).toBe("/api/pp/org-logo/42")
    expect(image?.getAttribute("alt")).toBe("")
    expect(image.hasAttribute("hidden")).toBe(true)
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toContain("LL")
    fireEvent.load(image)
    expect(image?.hasAttribute("hidden")).toBe(false)
    fireEvent.error(image)
    expect(container.querySelector("img")).toBeNull()
    rerender(<OrganizationCard organization={{ ...organization, tenantId: "43" }} />)
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/api/pp/org-logo/43")
    expect(container.querySelector("img")?.hasAttribute("hidden")).toBe(true)
  })
  it("normalizes sentinel short names before rendering and keeps disabled card hints interactive", async () => {
    render(<OrganizationCard organization={{ ...organization, shortName: " n/a ", enabledInTenant: false }} />)
    const article = screen.getByRole("article", { name: "Long Laboratory" })
    expect(article?.classList.contains("text-muted-foreground")).toBe(true)
    await userEvent.click(within(article).getByRole("button", { name: "Primary contact for Long Laboratory" }))
    expect(screen.getByRole("dialog", { name: "Primary contact" })).toBeTruthy()
  })
})


describe("OrganizationCard keyboard navigation", () => {
  it("opens the name tooltip when pagination programmatically focuses the actual heading", async () => {
    const headingRef = createRef<HTMLHeadingElement>()
    render(<OrganizationCard organization={organization} headingRef={headingRef} />)
    act(() => headingRef.current?.focus())
    expect(document.activeElement).toBe(headingRef.current)
    expect((await screen.findByRole("tooltip")).textContent).toBe("LL")
    expect(screen.queryByRole("button", { name: "LL" })).toBeNull()
  })
  it("tabs from contact through types and overflow to the portal without stopping at the name", async () => {
    const user = userEvent.setup()
    render(<OrganizationCard organization={{ ...organization, types: ["Lab", "Health Provider", "Supplier", "Go To Market", "Insurance"] }} portalAction={<button>Portal</button>} />)
    for (const label of ["Primary contact for LL", "Lab", "Healthcare", "Supplier", "Go To Market", "1 more type: Insurance", "Portal"]) {
      await user.tab()
      expect(document.activeElement).toBe(screen.getByRole("button", { name: label }))
    }
  })
})
