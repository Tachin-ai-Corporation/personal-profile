import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SHELL_COPY } from "@/lib/shared/messages"
import { axeViolations } from "../../test/axe"
import { installDomStubs, reportIntersections, type DomStubs } from "../../test/dom-stubs"
import { ContactsPanel } from "./contacts-panel"
import { ProfileTabs } from "./profile-tabs"

/**
 * Section navigation on Contacts (Story 1.8): menu activation (smooth vs reduced
 * motion, h2 focus, hash replace), Jump to, scroll-spy (exactly one current
 * item), deep links on mount and on hashchange, and bad hashes.
 */

let stubs: DomStubs
let replaceSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>

/** Set the URL without it counting as a replaceState call under test. */
function setUrl(url: string) {
  window.history.replaceState(null, "", url)
  replaceSpy?.mockClear()
}

beforeEach(() => {
  stubs = installDomStubs()
  setUrl("/?tab=contacts")
  replaceSpy = vi.spyOn(window.history, "replaceState")
  errorSpy = vi.spyOn(console, "error")
})

afterEach(() => {
  cleanup()
  expect(errorSpy).not.toHaveBeenCalled()
  vi.restoreAllMocks()
  stubs.uninstall()
  setUrl("/")
})

function menu() {
  return screen.getByRole("navigation", { name: SHELL_COPY.sectionsNav })
}

function menuLink(name: RegExp) {
  return within(menu()).getByRole("link", { name })
}

function sectionScrolls() {
  return stubs.scrolls.filter((s) => s.el.tagName === "SECTION" || s.el.id === "signature")
}

function currentItems() {
  return within(menu())
    .getAllByRole("link")
    .filter((a) => a.getAttribute("aria-current") === "location")
    .map((a) => a.textContent)
}

describe("Section menu", () => {
  it("lists the five Sections in order as #<id> links with mono number, label and a blank count", () => {
    render(<ContactsPanel />)
    const links = within(menu()).getAllByRole("link")
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["#personal", "#phone", "#email", "#social", "#addresses"])
    expect(links.map((a) => a.textContent)).toEqual([
      "01Personal information",
      "02Phone",
      "03Email",
      "04Social media",
      "05Addresses",
    ])
    // The mono number is aria-hidden: the accessible name is just the label.
    for (const [i, name] of ["Personal information", "Phone", "Email", "Social media", "Addresses"].entries()) {
      expect(links[i]).toHaveAccessibleName(name)
    }
    for (const a of links) {
      expect(a).toHaveClass("min-h-11", "grid-cols-[24px_1fr_auto]", "focus-ring")
      expect(a.firstElementChild).toHaveClass("font-mono", "text-caption")
      expect(a.firstElementChild).toHaveAttribute("aria-hidden", "true")
      const count = a.querySelector('[data-slot="section-count"]')
      expect(count).toHaveClass("font-mono", "text-caption")
      expect(count).toBeEmptyDOMElement()
    }
  })

  it("renders the five Sections, each a region labelled by an h2, plus the Signature row in Personal information", () => {
    render(<ContactsPanel />)
    for (const [id, name] of [
      ["personal", "Personal information"],
      ["phone", "Phone"],
      ["email", "Email"],
      ["social", "Social media"],
      ["addresses", "Addresses"],
    ]) {
      const region = screen.getByRole("region", { name })
      expect(region).toHaveAttribute("id", id)
      expect(within(region).getByRole("heading", { level: 2, name })).toHaveAttribute("tabindex", "-1")
      expect(region.querySelector('[aria-busy="true"]')).not.toBeNull()
    }
    const signature = document.getElementById("signature")!
    expect(screen.getByRole("region", { name: "Personal information" })).toContainElement(signature)
    expect(signature).toHaveAccessibleName(SHELL_COPY.signature)
  })

  it("a click scrolls smoothly to the Section, focuses its h2 and replaces the hash", async () => {
    const user = userEvent.setup()
    render(<ContactsPanel />)
    const focusSpy = vi.spyOn(HTMLElement.prototype, "focus")
    const historyLength = window.history.length
    await user.click(menuLink(/^Email$/))
    expect(sectionScrolls()).toEqual([{ el: document.getElementById("email"), options: { behavior: "smooth", block: "start" } }])
    const h2 = screen.getByRole("heading", { level: 2, name: "Email" })
    expect(h2).toHaveFocus()
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true })
    expect(replaceSpy).toHaveBeenLastCalledWith(null, "", "?tab=contacts#email")
    expect(window.location.search).toBe("?tab=contacts")
    expect(window.location.hash).toBe("#email")
    expect(window.history.length).toBe(historyLength)
    expect(currentItems()).toEqual(["03Email"])
  })

  it("scrolls instantly under prefers-reduced-motion: reduce", async () => {
    stubs.setReducedMotion(true)
    const user = userEvent.setup()
    render(<ContactsPanel />)
    await user.click(menuLink(/^Phone$/))
    expect(sectionScrolls()).toEqual([{ el: document.getElementById("phone"), options: { behavior: "auto", block: "start" } }])
  })

  it("Enter on a focused item activates it", async () => {
    const user = userEvent.setup()
    render(<ContactsPanel />)
    act(() => menuLink(/^Social media$/).focus())
    await user.keyboard("{Enter}")
    expect(sectionScrolls().map((s) => s.el.id)).toEqual(["social"])
    expect(screen.getByRole("heading", { level: 2, name: "Social media" })).toHaveFocus()
    expect(window.location.hash).toBe("#social")
  })

  it("Space on a focused item activates it and prevents the page scroll", async () => {
    render(<ContactsPanel />)
    const link = menuLink(/^Addresses$/)
    act(() => link.focus())
    const notPrevented = fireEvent.keyDown(link, { key: " " })
    expect(notPrevented).toBe(false)
    expect(sectionScrolls().map((s) => s.el.id)).toEqual(["addresses"])
    expect(screen.getByRole("heading", { level: 2, name: "Addresses" })).toHaveFocus()
    expect(window.location.hash).toBe("#addresses")
  })
})

describe("Jump to", () => {
  it("is a select labelled by its visible Jump to label, showing the current Section", () => {
    render(<ContactsPanel />)
    const trigger = screen.getByRole("combobox", { name: SHELL_COPY.jumpTo })
    expect(trigger).toHaveTextContent("01Personal information")
    expect(trigger).toHaveClass("border-control-border", "rounded-md", "data-[size=default]:h-11", "focus-ring")
    const label = screen.getByText(SHELL_COPY.jumpTo)
    expect(label.tagName).toBe("LABEL")
    expect(label).toHaveClass("text-muted-foreground")
    expect(label).toHaveAttribute("for", trigger.id)
  })

  it("choosing an option scrolls to the Section, focuses its h2 and replaces the hash", async () => {
    const user = userEvent.setup()
    render(<ContactsPanel />)
    const historyLength = window.history.length
    await user.click(screen.getByRole("combobox", { name: SHELL_COPY.jumpTo }))
    const options = await screen.findAllByRole("option")
    expect(options.map((o) => o.textContent)).toEqual([
      "01Personal information",
      "02Phone",
      "03Email",
      "04Social media",
      "05Addresses",
    ])
    for (const [i, name] of ["Personal information", "Phone", "Email", "Social media", "Addresses"].entries()) {
      expect(options[i]).toHaveAccessibleName(name)
    }
    await user.click(screen.getByRole("option", { name: "Addresses" }))
    const h2 = screen.getByRole("heading", { level: 2, name: "Addresses" })
    await waitFor(() => expect(h2).toHaveFocus())
    expect(sectionScrolls()).toEqual([
      { el: document.getElementById("addresses"), options: { behavior: "smooth", block: "start" } },
    ])
    expect(replaceSpy).toHaveBeenLastCalledWith(null, "", "?tab=contacts#addresses")
    expect(window.location.hash).toBe("#addresses")
    expect(window.history.length).toBe(historyLength)
    expect(screen.getByRole("combobox", { name: SHELL_COPY.jumpTo })).toHaveTextContent("05Addresses")
  })

  it("closing the listbox without a choice does nothing", async () => {
    const user = userEvent.setup()
    render(<ContactsPanel />)
    const trigger = screen.getByRole("combobox", { name: SHELL_COPY.jumpTo })
    await user.click(trigger)
    await screen.findAllByRole("option")
    await user.keyboard("{Escape}")
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(sectionScrolls()).toEqual([])
    expect(replaceSpy).not.toHaveBeenCalled()
  })
})

describe("scroll-spy", () => {
  it("defaults to the first Section", () => {
    render(<ContactsPanel />)
    expect(currentItems()).toEqual(["01Personal information"])
  })

  it("marks exactly one item: the top-most Section in view", () => {
    render(<ContactsPanel />)
    reportIntersections({ personal: false, phone: true, email: false })
    expect(currentItems()).toEqual(["02Phone"])
    reportIntersections({ email: true })
    expect(currentItems()).toEqual(["02Phone"])
    reportIntersections({ phone: false })
    expect(currentItems()).toEqual(["03Email"])
    reportIntersections({ email: false })
    expect(currentItems()).toEqual(["01Personal information"])
  })

  it("styles the current item with accent, primary 600 text and the inset bar", () => {
    render(<ContactsPanel />)
    reportIntersections({ phone: true })
    const current = menuLink(/^Phone$/)
    expect(current).toHaveClass(
      "relative",
      "bg-accent",
      "text-primary",
      "font-semibold",
      "before:absolute",
      "before:inset-y-0",
      "before:left-0",
      "before:w-[3px]",
      "before:bg-primary",
    )
    expect(current.className).not.toMatch(/shadow-\[inset/)
    expect(current.firstElementChild).toHaveClass("text-primary")
    expect(current.querySelector('[data-slot="section-count"]')).toHaveClass("text-primary")
    expect(menuLink(/^Personal information$/)).not.toHaveClass("bg-accent")
  })

  it("keeps an activated Section current while it is in view, until the user scrolls by hand", async () => {
    const user = userEvent.setup()
    render(<ContactsPanel />)
    await user.click(menuLink(/^Addresses$/))
    // A short page: Social media stays in view above Addresses.
    reportIntersections({ personal: false, social: true, addresses: true })
    expect(currentItems()).toEqual(["05Addresses"])
    act(() => {
      window.dispatchEvent(new Event("wheel"))
    })
    expect(currentItems()).toEqual(["04Social media"])
  })

  it("keeps an activated Section current during the scroll until it first enters view", async () => {
    const user = userEvent.setup()
    render(<ContactsPanel />)
    await user.click(menuLink(/^Addresses$/))
    // The smooth scroll passes Phone and Email before Addresses arrives.
    reportIntersections({ personal: false, phone: true, email: true })
    expect(currentItems()).toEqual(["05Addresses"])
    reportIntersections({ phone: false, email: false, addresses: true })
    expect(currentItems()).toEqual(["05Addresses"])
    reportIntersections({ addresses: false, phone: true })
    expect(currentItems()).toEqual(["02Phone"])
  })

  it.each([
    ["a PageDown keydown", () => fireEvent.keyDown(document.body, { key: "PageDown" })],
    ["a touchmove", () => window.dispatchEvent(new Event("touchmove"))],
  ])("%s ends the pin of a Space-activated Section", (_, scrollByHand) => {
    render(<ContactsPanel />)
    const link = menuLink(/^Addresses$/)
    act(() => link.focus())
    fireEvent.keyDown(link, { key: " " })
    reportIntersections({ personal: false, social: true, addresses: true })
    expect(currentItems()).toEqual(["05Addresses"])
    act(() => {
      scrollByHand()
    })
    expect(currentItems()).toEqual(["04Social media"])
  })

  it("observes with a top-weighted root margin", async () => {
    const { FakeIntersectionObserver } = await import("../../test/dom-stubs")
    render(<ContactsPanel />)
    expect(FakeIntersectionObserver.instances.at(-1)!.options).toEqual({ rootMargin: "0px 0px -60% 0px" })
  })

  it("a modified or non-primary click does not activate (the browser opens the link)", () => {
    render(<ContactsPanel />)
    for (const init of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
      const link = menuLink(/^Email$/)
      const notPrevented = fireEvent.click(link, init)
      expect(notPrevented).toBe(true)
    }
    expect(sectionScrolls()).toEqual([])
    expect(replaceSpy).not.toHaveBeenCalled()
    expect(currentItems()).toEqual(["01Personal information"])
  })

  it("observes the five Sections and disconnects on unmount", async () => {
    const { FakeIntersectionObserver } = await import("../../test/dom-stubs")
    const { unmount } = render(<ContactsPanel />)
    const io = FakeIntersectionObserver.instances.at(-1)!
    expect(Array.from(io.targets).map((t) => t.id)).toEqual(["personal", "phone", "email", "social", "addresses"])
    unmount()
    expect(io.disconnected).toBe(true)
  })
})

describe("deep links", () => {
  it.each(["personal", "phone", "email", "social", "addresses"])("#%s on load scrolls to that Section", (id) => {
    setUrl(`/?tab=contacts#${id}`)
    render(<ContactsPanel />)
    expect(sectionScrolls()).toEqual([{ el: document.getElementById(id), options: { behavior: "auto", block: "start" } }])
    expect(currentItems()).toHaveLength(1)
  })

  it("#signature on load scrolls to the Signature row", () => {
    setUrl("/?tab=contacts#signature")
    render(<ContactsPanel />)
    expect(sectionScrolls()).toEqual([
      { el: document.getElementById("signature"), options: { behavior: "auto", block: "start" } },
    ])
    expect(currentItems()).toEqual(["01Personal information"])
  })

  it("hashchange scrolls to the new Section", async () => {
    render(<ContactsPanel />)
    act(() => {
      window.location.hash = "#email"
    })
    await waitFor(() => expect(sectionScrolls().map((s) => s.el.id)).toEqual(["email"]))
    expect(currentItems()).toEqual(["03Email"])
    act(() => {
      window.location.hash = "#signature"
    })
    await waitFor(() => expect(sectionScrolls().map((s) => s.el.id)).toEqual(["email", "signature"]))
  })

  it.each(["#nope", "#", "#%E0%A4%A", "#__proto__", "#insurance"])("an unknown hash (%s) leaves the page at the top", (hash) => {
    setUrl(`/?tab=contacts${hash}`)
    render(<ContactsPanel />)
    expect(sectionScrolls()).toEqual([])
    expect(currentItems()).toEqual(["01Personal information"])
  })

  it("an unknown hash via hashchange does nothing", async () => {
    render(<ContactsPanel />)
    act(() => {
      window.location.hash = "#nope"
    })
    await new Promise((r) => setTimeout(r, 0))
    expect(sectionScrolls()).toEqual([])
  })

  it.each(["insurance", "medical"] as const)("a Section hash on %s is ignored", async (tab) => {
    setUrl(`/?tab=${tab}#phone`)
    render(<ProfileTabs initialTab={tab} />)
    expect(sectionScrolls()).toEqual([])
    act(() => {
      window.location.hash = "#signature"
    })
    await new Promise((r) => setTimeout(r, 0))
    expect(sectionScrolls()).toEqual([])
    expect(window.location.search).toBe(`?tab=${tab}`)
  })
})

describe("accessibility", () => {
  it("axe-core reports zero violations on the Contacts body", async () => {
    render(
      <main>
        <ContactsPanel />
      </main>,
    )
    expect(await axeViolations()).toEqual([])
  })
})
