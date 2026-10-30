import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it } from "vitest"
import { stubViewport } from "@/test/media"
import { contactPointWire } from "@/test/myself-fixture"
import { renderInPage } from "@/test/providers"
import { EmailSection, PhoneSection } from "."

/**
 * The copy buttons' feature wiring (design refresh, PROPOSAL; #62 review):
 * Phone copies the number as displayed (formatted, without the flag), Email
 * the address, both from the keyboard, in the desktop table and the cards
 * below 768 px. `CopyButton`'s own behavior is covered in `components/ui`.
 * The clipboard is user-event's (`userEvent.setup()` installs it).
 */

const LIST = "/api/1h/v2/user/contact-point/list"

const MOBILE = [contactPointWire({ id: 12, value: "+14155512125", label: "Primary", isVerified: true, isNotificationEnabled: true })]
const LANDLINE = [contactPointWire({ id: 21, value: "+442071838750", type: "Landline", label: "Home", isVerified: false, phoneNumberRegion: "gb" })]
const EMAILS = [contactPointWire({ id: 42, value: "ann@example.com", type: "Email", phoneNumberRegion: null, label: "Primary", isVerified: true })]

/** Answers the Contact Point list per type. */
const listHandler = http.get(LIST, ({ request }) => {
  const type = new URL(request.url).searchParams.get("type")
  return HttpResponse.json(type === "Mobile" ? MOBILE : type === "Landline" ? LANDLINE : type === "Email" ? EMAILS : [])
})

async function renderReady(name: "Phone" | "Email"): Promise<HTMLElement> {
  renderInPage(name === "Phone" ? <PhoneSection /> : <EmailSection />, { page: "profile", handlers: [listHandler] })
  const section = screen.getByRole("region", { name })
  await waitFor(() => expect(section.querySelector('[data-slot="state-frame"]')?.getAttribute("data-state")).toBe("ready"))
  return section
}

/** Focuses `button` and presses `key` on it; returns what the clipboard then holds. */
async function copyByKeyboard(user: ReturnType<typeof userEvent.setup>, button: HTMLElement, key: "{Enter}" | " "): Promise<string> {
  act(() => button.focus())
  await user.keyboard(key)
  return navigator.clipboard.readText()
}

const status = (button: HTMLElement): string | null | undefined => button.parentElement?.querySelector('[data-slot="copy-status"]')?.textContent

describe.each([
  { layout: "desktop table", width: 1024, container: "table" },
  { layout: "cards below 768 px", width: 360, container: "list" },
] as const)("contact copy buttons, $layout", ({ width, container }) => {
  beforeEach(() => stubViewport(width))

  it("Phone copies each number as displayed (formatted, no flag), by Enter and by Space", async () => {
    const user = userEvent.setup()
    const section = await renderReady("Phone")
    const rows = within(section).getByRole(container, { name: "Phone" })
    const us = within(rows).getByRole("button", { name: "Copy +1 (415) 551-2125" })
    expect(await copyByKeyboard(user, us, "{Enter}")).toBe("+1 (415) 551-2125")
    expect(status(us)).toBe("+1 (415) 551-2125 copied")
    expect(us.getAttribute("data-copied")).toBe("true")
    const gb = within(rows).getByRole("button", { name: "Copy +44 20 7183 8750" })
    expect(await copyByKeyboard(user, gb, " ")).toBe("+44 20 7183 8750")
  })

  it("Email copies the address, by Enter", async () => {
    const user = userEvent.setup()
    const section = await renderReady("Email")
    const button = within(within(section).getByRole(container, { name: "Email" })).getByRole("button", { name: "Copy ann@example.com" })
    expect(await copyByKeyboard(user, button, "{Enter}")).toBe("ann@example.com")
    expect(status(button)).toBe("ann@example.com copied")
  })
})
