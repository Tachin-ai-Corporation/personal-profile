import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import type { OrganizationPortalContact } from "@/lib/api"
import { OrganizationPrimaryContact } from "./organization-primary-contact"

const primary: OrganizationPortalContact = { firstName: "Ann", middleName: "Mae", lastName: "Lee", phoneNumber: "4155512125", email: "ann@example.com", contactTypes: ["Primary"] }
async function open(contacts: readonly OrganizationPortalContact[]) {
  const user = userEvent.setup()
  render(<OrganizationPrimaryContact name="Lab" contacts={contacts} />)
  const trigger = screen.getByRole("button", { name: "Primary contact for Lab" })
  await user.tab()
  expect(document.activeElement).toBe(trigger)
  expect(trigger?.getAttribute("aria-expanded")).toBe("true")
  return { user, trigger, dialog: screen.getByRole("dialog", { name: "Primary contact" }) }
}
describe("OrganizationPrimaryContact", () => {
  it("selects the first exact Primary and formats name/phone with safe email", async () => {
    const { user, trigger, dialog } = await open([{ ...primary, firstName: "Wrong", contactTypes: ["primary"] }, primary, { ...primary, firstName: "Second" }])
    expect(within(dialog).getByText("Ann Mae Lee")).toBeTruthy()
    expect(within(dialog).getByText("+1 (415) 551-2125")).toBeTruthy()
    const email = within(dialog).getByRole("link", { name: "ann@example.com" })
    expect(email?.getAttribute("href")).toBe("mailto:ann@example.com")
    await user.tab()
    expect(document.activeElement).toBe(email)
    await user.keyboard("{Escape}")
    expect(document.activeElement).toBe(trigger)
    expect(screen.queryByRole("dialog")).toBeNull()
  })
  it.each([null, undefined, "", " n/a ", "N/A", "-1"])("omits sentinel middle name %s", async (middleName) => {
    const { dialog } = await open([{ ...primary, middleName }])
    expect(within(dialog).getByText("Ann Lee")).toBeTruthy()
  })
  it("renders three dashes without Primary", async () => {
    const { dialog } = await open([{ ...primary, contactTypes: [] }])
    expect(within(dialog).getAllByText("-", { exact: true })).toHaveLength(3)
  })
  it("renders three dashes for missing fields", async () => {
    const { dialog } = await open([{ contactTypes: ["Primary"], firstName: "n/a", phoneNumber: "-1", email: "" }])
    expect(within(dialog).getAllByText("-", { exact: true })).toHaveLength(3)
  })
  it.each(["javascript:alert(1)", "javascript:user@example.com", "https://example.com", "mailto:ann@example.com", "bad address@example.com", "x@example.com?subject=evil"])("keeps unsafe/protocol email %s as text", async (email) => {
    const { dialog } = await open([{ ...primary, email }])
    expect(within(dialog).getByText(email)).toBeTruthy()
    expect(within(dialog).queryByRole("link")).toBeNull()
  })
})
