import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { OrganizationTypes } from "./organization-types"

const cases = [
  ["Lab", "Lab", "flask-conical"], ["Health Provider", "Healthcare", "heart-pulse"], ["Healthcare", "Healthcare", "heart-pulse"],
  ["Supplier", "Supplier", "truck"], ["Go To Market", "Go To Market", "store"], ["Population Health", "Population Health", "users"],
  ["Insurance", "Insurance", "umbrella"], ["Carrier", "Carrier", "package"], ["Manufacturer", "Manufacturer", "factory"],
  ["Enterprise", "Enterprise", "building-2"], ["Government Agency", "Government Agency", "landmark"],
  ["n/a", "No types selected for this organization", "circle-help"], ["Unrecognized", "Unrecognized", "circle-help"], ["", "No types selected for this organization", "circle-help"],
]
describe("OrganizationTypes", () => {
  it.each(cases)("maps %s to its accessible label and outline icon", (type, label, icon) => {
    render(<OrganizationTypes types={[type]} />)
    const trigger = screen.getByRole("button", { name: label })
    expect(trigger.querySelector("svg")?.classList.contains(`lucide-${icon}`)).toBe(true)
    expect(trigger?.classList.contains("size-11")).toBe(true)
  })
  it("deduplicates aliases, prioritizes four icons and alphabetizes overflow", () => {
    render(<OrganizationTypes types={["Insurance", "Healthcare", "Lab", "Population Health", "Supplier", "Carrier", "Lab", "Go To Market", "Health Provider"]} />)
    const buttons = within(screen.getByRole("group", { name: "Organization types" })).getAllByRole("button")
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual(["Lab", "Healthcare", "Supplier", "Go To Market", "3 more types: Carrier, Insurance, Population Health"])
    expect(buttons[4]?.textContent).toContain("+3")
  })
  it("orders standalone Healthcare alphabetically after the prioritized platform types", () => {
    render(<OrganizationTypes types={["Healthcare", "Carrier", "Supplier", "Lab"]} />)
    const buttons = within(screen.getByRole("group", { name: "Organization types" })).getAllByRole("button")
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual(["Lab", "Supplier", "Carrier", "Healthcare"])
  })
  it.each([["Healthcare", "Health Provider"], ["Health Provider", "Healthcare"]])("uses the best originating rank for aliases %s, %s", (first, second) => {
    render(<OrganizationTypes types={[first, "Supplier", "Carrier", "Lab", second]} />)
    const buttons = within(screen.getByRole("group", { name: "Organization types" })).getAllByRole("button")
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual(["Lab", "Healthcare", "Supplier", "Carrier"])
  })
  it("uses singular overflow copy", () => {
    render(<OrganizationTypes types={["Lab", "Supplier", "Go To Market", "Healthcare", "Insurance"]} />)
    expect(screen.getByRole("button", { name: "1 more type: Insurance" })).toBeTruthy()
  })
  it("uses the exact absent-type reason for an empty list", () => {
    render(<OrganizationTypes types={[]} />)
    expect(screen.getByRole("button", { name: "No types selected for this organization" })).toBeTruthy()
  })
})
