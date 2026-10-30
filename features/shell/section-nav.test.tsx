import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { useEffect, useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SHELL_MESSAGES } from "@/lib/shared/messages"
import { axeViolations } from "@/test/axe"
import { FakeIntersectionObserver, installDomStubs, reportIntersections, type DomStubs } from "@/test/dom-stubs"
import { TestProviders } from "@/test/providers"
import { FixtureParticipant } from "./__fixtures__/fixture-participant"
import { ContactsPanel } from "./contacts-panel"
import { resetLeaveState } from "./leave"
import { LeaveGuard } from "./leave-guard"
import { CurrentPageProvider } from "./navigate"
import { ProfileTabs } from "./profile-tabs"
import { SectionCountProvider, useReportSectionCount } from "./section-counts"
import { PROFILE_SECTIONS } from "./anchors"
import { SectionLandmark } from "./section-landmark"
import { SectionNav, useSectionNavigation, type SectionNavState } from "./section-nav"
import { StateFrame } from "./state-frame"
import { SectionRegistryProvider } from "./section-registry"

vi.mock("next/navigation", async () => (await import("@/test/next-navigation")).nextNavigationMock)

/**
 * Section navigation on Contacts (F3-3, port of main's Story 1.8B cases):
 * menu activation (smooth vs reduced motion, h2 focus, hash replace with other
 * params kept, never the leave guard), Jump to, scroll-spy (exactly one current
 * item, the pin), counts, deep links on mount and on hashchange, bad hashes.
 */

let stubs: DomStubs
let replaceSpy: ReturnType<typeof vi.spyOn>

/** Sets the URL without it counting as a replaceState call under test. */
function setUrl(url: string): void {
  window.history.replaceState(null, "", url)
  replaceSpy?.mockClear()
}

beforeEach(() => {
  resetLeaveState()
  stubs = installDomStubs()
  setUrl("/?tab=contacts")
  replaceSpy = vi.spyOn(window.history, "replaceState")
})

afterEach(() => {
  stubs.uninstall()
  setUrl("/")
})

const hasClasses = (el: Element | null | undefined, ...names: string[]): void => {
  for (const name of names) expect(el?.classList.contains(name), `${name} on ${el?.outerHTML.slice(0, 80)}`).toBe(true)
}
const expectFocus = (el: Element | null): void => expect(document.activeElement).toBe(el)
const h2 = (name: string): HTMLElement => screen.getByRole("heading", { level: 2, name })

const menu = (): HTMLElement => screen.getByRole("navigation", { name: SHELL_MESSAGES.sectionsNavLabel })
const menuLink = (name: RegExp): HTMLElement => within(menu()).getByRole("link", { name })
const jumpTo = (): HTMLElement => screen.getByRole("combobox", { name: SHELL_MESSAGES.jumpTo })
const indicator = (): HTMLElement | null => menu().querySelector('[data-slot="section-nav-indicator"]')

function sectionScrolls(): { el: Element; options: unknown }[] {
  return stubs.scrolls.filter((s) => s.el.tagName === "SECTION" || s.el.id === "signature")
}

function currentItems(): (string | null)[] {
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
    expect(links.map((a) => a.textContent)).toEqual(["01Personal information", "02Phone", "03Email", "04Social media", "05Addresses"])
    for (const [i, name] of ["Personal information", "Phone", "Email", "Social media", "Addresses"].entries()) {
      // The mono number and the count are aria-hidden: the accessible name is the label.
      expect(within(menu()).getByRole("link", { name })).toBe(links[i])
    }
    for (const a of links) {
      hasClasses(a, "min-h-11", "grid-cols-[24px_1fr_auto]", "focus-ring")
      hasClasses(a.firstElementChild, "font-mono", "text-caption")
      expect(a.firstElementChild?.getAttribute("aria-hidden")).toBe("true")
      const count = a.querySelector('[data-slot="section-count"]')
      hasClasses(count, "font-mono", "text-caption")
      expect(count?.getAttribute("aria-hidden")).toBe("true")
      expect(count?.textContent).toBe("")
    }
    hasClasses(menu(), "sticky", "top-0")
  })

  it("renders the five Sections, each a region labelled by its h2, loading, plus the Signature row", () => {
    render(<ContactsPanel />)
    for (const [id, name] of [
      ["personal", "Personal information"],
      ["phone", "Phone"],
      ["email", "Email"],
      ["social", "Social media"],
      ["addresses", "Addresses"],
    ]) {
      const region = screen.getByRole("region", { name })
      expect(region.id).toBe(id)
      expect(within(region).getByRole("heading", { level: 2, name }).getAttribute("tabindex")).toBe("-1")
      expect(region.querySelector('[data-slot="state-frame"]')?.getAttribute("aria-busy")).toBe("true")
    }
    const signature = screen.getByRole("group", { name: SHELL_MESSAGES.signature })
    expect(signature.id).toBe("signature")
    expect(screen.getByRole("region", { name: "Personal information" }).contains(signature)).toBe(true)
  })

  it("a click scrolls smoothly to the Section, focuses its h2 and replaces the hash (no history entry)", () => {
    render(<ContactsPanel />)
    const focusSpy = vi.spyOn(HTMLElement.prototype, "focus")
    const historyLength = window.history.length
    fireEvent.click(menuLink(/^Email$/))
    expect(sectionScrolls()).toEqual([{ el: document.getElementById("email"), options: { behavior: "smooth", block: "start" } }])
    expectFocus(h2("Email"))
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true })
    expect(replaceSpy).toHaveBeenLastCalledWith(null, "", "/?tab=contacts#email")
    expect(window.location.hash).toBe("#email")
    expect(window.history.length).toBe(historyLength)
    expect(currentItems()).toEqual(["03Email"])
  })

  it("keeps the other query params when it replaces the hash", () => {
    setUrl("/?x=1&tab=contacts#phone")
    render(<ContactsPanel />)
    fireEvent.click(menuLink(/^Addresses$/))
    expect(replaceSpy).toHaveBeenLastCalledWith(null, "", "/?x=1&tab=contacts#addresses")
  })

  it("scrolls instantly under prefers-reduced-motion: reduce", () => {
    stubs.setReducedMotion(true)
    render(<ContactsPanel />)
    fireEvent.click(menuLink(/^Phone$/))
    expect(sectionScrolls()).toEqual([{ el: document.getElementById("phone"), options: { behavior: "auto", block: "start" } }])
  })

  it("Enter on a focused item activates it (through the link's click)", () => {
    render(<ContactsPanel />)
    const link = menuLink(/^Social media$/)
    act(() => link.focus())
    fireEvent.keyDown(link, { key: "Enter" })
    fireEvent.click(link)
    expect(sectionScrolls().map((s) => s.el.id)).toEqual(["social"])
    expectFocus(h2("Social media"))
    expect(window.location.hash).toBe("#social")
  })

  it("Space on a focused item activates it and prevents the page scroll; other keys do nothing", () => {
    render(<ContactsPanel />)
    const link = menuLink(/^Addresses$/)
    act(() => link.focus())
    expect(fireEvent.keyDown(link, { key: "a" })).toBe(true)
    expect(sectionScrolls()).toEqual([])
    expect(fireEvent.keyDown(link, { key: " " })).toBe(false)
    expect(sectionScrolls().map((s) => s.el.id)).toEqual(["addresses"])
    expectFocus(h2("Addresses"))
    expect(window.location.hash).toBe("#addresses")
  })

  it("a held Space (repeat) activates once and still prevents the page scroll", () => {
    render(<ContactsPanel />)
    const link = menuLink(/^Addresses$/)
    act(() => link.focus())
    expect(fireEvent.keyDown(link, { key: " " })).toBe(false)
    expect(fireEvent.keyDown(link, { key: " ", repeat: true })).toBe(false)
    expect(fireEvent.keyDown(link, { key: " ", repeat: true })).toBe(false)
    expect(sectionScrolls().map((s) => s.el.id)).toEqual(["addresses"])
  })

  it("a modified or non-primary click does not activate (the browser opens the link)", () => {
    render(<ContactsPanel />)
    // Record whether the app prevented the click, then stop jsdom's own hash navigation
    // (its queued hashchange would otherwise reach a later test).
    const prevented: boolean[] = []
    const record = (event: Event): void => {
      prevented.push(event.defaultPrevented)
      event.preventDefault()
    }
    window.addEventListener("click", record)
    for (const init of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
      fireEvent.click(menuLink(/^Email$/), init)
    }
    window.removeEventListener("click", record)
    expect(prevented).toEqual([false, false, false, false, false])
    expect(sectionScrolls()).toEqual([])
    expect(replaceSpy).not.toHaveBeenCalled()
    expect(currentItems()).toEqual(["01Personal information"])
  })

  it("never asks the leave guard: a dirty Section stays dirty and no dialog opens", () => {
    render(
      <TestProviders>
        <CurrentPageProvider value="profile">
          <SectionRegistryProvider>
            <FixtureParticipant id="phone" label="Fixture phone" displayOrder={2} />
            <ContactsPanel />
            <LeaveGuard />
          </SectionRegistryProvider>
        </CurrentPageProvider>
      </TestProviders>,
    )
    fireEvent.change(screen.getByLabelText("Fixture phone"), { target: { value: "1" } })
    fireEvent.click(menuLink(/^Email$/))
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expectFocus(h2("Email"))
    expect(window.location.hash).toBe("#email")
    expect((screen.getByLabelText("Fixture phone") as HTMLInputElement).value).toBe("1")
  })
})

describe("Jump to", () => {
  it("is a select labelled by its visible Jump to label, showing the current Section", () => {
    render(<ContactsPanel />)
    const trigger = jumpTo()
    expect(trigger.textContent).toBe("01Personal information")
    hasClasses(trigger, "border-control-border", "rounded-md", "data-[size=default]:h-11", "focus-ring")
    const label = screen.getByText(SHELL_MESSAGES.jumpTo)
    expect(label.tagName).toBe("LABEL")
    hasClasses(label, "text-muted-foreground")
    expect(label.getAttribute("for")).toBe(trigger.id)
  })

  it("choosing an option scrolls to the Section, focuses its h2 and replaces the hash", async () => {
    render(<ContactsPanel />)
    const historyLength = window.history.length
    act(() => jumpTo().focus())
    fireEvent.keyDown(jumpTo(), { key: "Enter" })
    const options = await screen.findAllByRole("option")
    expect(options.map((o) => o.textContent)).toEqual(["01Personal information", "02Phone", "03Email", "04Social media", "05Addresses"])
    for (const [i, name] of ["Personal information", "Phone", "Email", "Social media", "Addresses"].entries()) {
      expect(screen.getByRole("option", { name })).toBe(options[i])
    }
    fireEvent.click(screen.getByRole("option", { name: "Addresses" }))
    await waitFor(() => expectFocus(h2("Addresses")))
    expect(sectionScrolls()).toEqual([{ el: document.getElementById("addresses"), options: { behavior: "smooth", block: "start" } }])
    expect(replaceSpy).toHaveBeenLastCalledWith(null, "", "/?tab=contacts#addresses")
    expect(window.history.length).toBe(historyLength)
    expect(jumpTo().textContent).toBe("05Addresses")
  })

  it("picking the current Section again still scrolls, focuses its h2 and replaces the hash", async () => {
    render(<ContactsPanel />)
    expect(jumpTo().textContent).toBe("01Personal information")
    act(() => jumpTo().focus())
    fireEvent.keyDown(jumpTo(), { key: "Enter" })
    await screen.findAllByRole("option")
    fireEvent.click(screen.getByRole("option", { name: "Personal information" }))
    await waitFor(() => expectFocus(h2("Personal information")))
    expect(sectionScrolls()).toEqual([{ el: document.getElementById("personal"), options: { behavior: "smooth", block: "start" } }])
    expect(replaceSpy).toHaveBeenLastCalledWith(null, "", "/?tab=contacts#personal")
  })

  it("Enter on the current option activates it too", async () => {
    render(<ContactsPanel />)
    act(() => jumpTo().focus())
    fireEvent.keyDown(jumpTo(), { key: "Enter" })
    const option = await screen.findByRole("option", { name: "Personal information" })
    act(() => option.focus())
    fireEvent.keyDown(option, { key: "Enter" })
    await waitFor(() => expectFocus(h2("Personal information")))
    expect(window.location.hash).toBe("#personal")
  })

  it("uses generated ids: two Jump tos each keep their own label", () => {
    render(
      <>
        <ContactsPanel />
        <ContactsPanel />
      </>,
    )
    const triggers = screen.getAllByRole("combobox", { name: SHELL_MESSAGES.jumpTo })
    expect(triggers).toHaveLength(2)
    expect(new Set(triggers.map((t) => t.id)).size).toBe(2)
    for (const trigger of triggers) {
      expect(trigger.id).not.toBe("jump-to-trigger")
      const label = document.getElementById(trigger.getAttribute("aria-labelledby") ?? "")
      expect(label?.getAttribute("for")).toBe(trigger.id)
    }
  })

  it("closing the listbox without a choice does nothing and returns focus to the trigger", async () => {
    render(<ContactsPanel />)
    act(() => jumpTo().focus())
    fireEvent.keyDown(jumpTo(), { key: "Enter" })
    await screen.findAllByRole("option")
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull())
    await waitFor(() => expectFocus(jumpTo()))
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

  it("styles the current item with accent, primary-text 600 and the 3 px bar", () => {
    render(<ContactsPanel />)
    reportIntersections({ phone: true })
    const current = menuLink(/^Phone$/)
    hasClasses(current, "relative", "bg-accent", "text-primary-text", "font-semibold", "before:absolute", "before:w-[3px]", "before:bg-primary")
    hasClasses(current.firstElementChild, "text-primary-text")
    hasClasses(current.querySelector('[data-slot="section-count"]'), "text-primary-text")
    expect(menuLink(/^Personal information$/).classList.contains("bg-accent")).toBe(false)
  })

  it("`accent` (design refresh, opt-in): Section icons instead of numbers; the current item on its tone's tint with a brand-hue bar", () => {
    render(<ContactsPanel accent />)
    reportIntersections({ phone: true })
    const current = menuLink(/^Phone$/)
    // The current item's fill and bar are drawn by the sliding indicator, in the current Section's tone.
    hasClasses(current, "relative", "grid-cols-[24px_1fr_auto]", "font-semibold")
    hasClasses(indicator(), "bg-tint-teal-strong", "before:absolute", "before:w-[3px]", "before:bg-brand-secondary")
    for (const name of ["bg-accent", "text-primary-text", "bg-tint-teal-strong", "before:bg-brand-secondary", "hover:bg-tint-teal-surface"]) expect(current.classList.contains(name)).toBe(false)
    // No 01–05: the icon takes the number's column, so the label keeps its place; the names stay the labels.
    expect(menu().textContent).not.toMatch(/0[1-5]/)
    expect(currentItems()).toEqual(["Phone"])
    const icon = menuLink(/^Addresses$/).firstElementChild
    expect(icon?.getAttribute("data-slot")).toBe("section-nav-icon")
    expect(icon?.getAttribute("aria-hidden")).toBe("true")
    expect(icon?.getAttribute("class")).toContain("lucide-map-pin")
    expect(icon?.getAttribute("class")).toContain("text-tint-mint-strong-foreground")
    expect(icon?.nextElementSibling?.textContent).toBe("Addresses")
    // Not current: no fill; hover on the tone's surface tint.
    expect(menuLink(/^Addresses$/).className).not.toContain("bg-tint-mint-strong")
    hasClasses(menuLink(/^Addresses$/), "hover:bg-tint-mint-surface")
    expect(menuLink(/^Addresses$/).classList.contains("hover:bg-accent")).toBe(false)
  })

  it("`accent`: Jump to keeps its numbers, in each Section's tone", () => {
    render(<ContactsPanel accent />)
    const trigger = jumpTo()
    expect(trigger.textContent).toContain("01")
    hasClasses(trigger.querySelector(".font-mono"), "text-tint-blue-strong-foreground")
  })

  it("without `accent`: no Section icons and no sliding indicator", () => {
    render(<ContactsPanel />)
    expect(menu().querySelector('[data-slot="section-nav-icon"]')).toBeNull()
    expect(indicator()).toBeNull()
  })

  it("`accent`: the indicator slides by transform to the current item, on scroll-spy changes and clicks, outside the list", async () => {
    // jsdom has no layout: give each link the offset a 44 px row below the nav's 16 px padding would have.
    const offsetTop = vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(function (this: HTMLElement) {
      const id = this.getAttribute("href")?.slice(1)
      return id ? 16 + PROFILE_SECTIONS.findIndex((section) => section.id === id) * 44 : 0
    })
    const offsetHeight = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(44)
    try {
      render(<ContactsPanel accent />)
      const slider = indicator()
      expect(slider?.getAttribute("aria-hidden")).toBe("true")
      expect(slider?.parentElement?.tagName).toBe("NAV")
      expect(slider?.closest("ol")).toBeNull()
      expect(slider?.style.transform).toBe("translateY(16px)")
      expect(slider?.style.height).toBe("44px")
      // The slide is a transform transition, only with motion allowed, and only once placed (no slide on load).
      hasClasses(slider, "motion-safe:data-ready:transition-transform", "motion-safe:data-ready:ease-premium")
      await waitFor(() => expect(slider?.dataset.ready).toBe("true"))
      reportIntersections({ email: true })
      expect(slider?.style.transform).toBe("translateY(104px)")
      hasClasses(slider, "bg-tint-teal-strong", "before:bg-brand-secondary")
      fireEvent.click(menuLink(/^Addresses$/))
      expect(slider?.style.transform).toBe("translateY(192px)")
      hasClasses(slider, "bg-tint-mint-strong", "before:bg-brand-tertiary")
    } finally {
      offsetTop.mockRestore()
      offsetHeight.mockRestore()
    }
  })

  it("keeps an activated Section current while it is in view, until the user scrolls by hand", () => {
    render(<ContactsPanel />)
    fireEvent.click(menuLink(/^Addresses$/))
    // A short page: Social media stays in view above Addresses.
    reportIntersections({ personal: false, social: true, addresses: true })
    expect(currentItems()).toEqual(["05Addresses"])
    act(() => {
      window.dispatchEvent(new Event("wheel"))
    })
    expect(currentItems()).toEqual(["04Social media"])
  })

  it("keeps an activated Section current during the scroll until it first enters view", () => {
    render(<ContactsPanel />)
    fireEvent.click(menuLink(/^Addresses$/))
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
  ])("%s ends the pin of a Space-activated Section", (_label, scrollByHand) => {
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

  it("scroll keys inside the menu, and other keys, keep the pin", () => {
    render(<ContactsPanel />)
    fireEvent.click(menuLink(/^Addresses$/))
    reportIntersections({ personal: false, social: true, addresses: true })
    fireEvent.keyDown(menuLink(/^Phone$/), { key: "ArrowDown" })
    fireEvent.keyDown(document.body, { key: "a" })
    act(() => {
      window.dispatchEvent(new Event("wheel"))
    })
    expect(currentItems()).toEqual(["04Social media"])
    // With no pin, a second hand scroll changes nothing.
    act(() => {
      window.dispatchEvent(new Event("wheel"))
    })
    expect(currentItems()).toEqual(["04Social media"])
  })

  it.each([
    ["a PageDown typed in a field", () => fireEvent.keyDown(screen.getByLabelText("field"), { key: "PageDown" })],
    ["a Space typed in a field", () => fireEvent.keyDown(screen.getByLabelText("field"), { key: " " })],
    ["a PageDown on the Jump to trigger", () => fireEvent.keyDown(jumpTo(), { key: "PageDown" })],
  ])("%s keeps the pin", (_label, press) => {
    render(
      <>
        <input aria-label="field" />
        <ContactsPanel />
      </>,
    )
    fireEvent.click(menuLink(/^Addresses$/))
    reportIntersections({ personal: false, social: true, addresses: true })
    act(() => {
      press()
    })
    expect(currentItems()).toEqual(["05Addresses"])
  })

  it("scroll keys inside the open Jump to listbox keep the pin", async () => {
    render(<ContactsPanel />)
    fireEvent.click(menuLink(/^Addresses$/))
    reportIntersections({ personal: false, social: true, addresses: true })
    act(() => jumpTo().focus())
    fireEvent.keyDown(jumpTo(), { key: "Enter" })
    const listbox = await screen.findByRole("listbox")
    fireEvent.keyDown(listbox, { key: "ArrowDown" })
    fireEvent.keyDown(listbox, { key: "End" })
    // The modal listbox hides the menu from the accessibility tree: read the DOM.
    expect(document.querySelector('nav [aria-current="location"]')?.textContent).toBe("05Addresses")
  })

  it("a press on the page scrollbar ends the pin", () => {
    render(<ContactsPanel />)
    fireEvent.click(menuLink(/^Addresses$/))
    reportIntersections({ personal: false, social: true, addresses: true })
    act(() => {
      fireEvent.pointerDown(document.documentElement)
    })
    expect(currentItems()).toEqual(["04Social media"])
  })

  it("at the end of the page the last Section is current", () => {
    const root = document.documentElement
    Object.defineProperty(root, "scrollHeight", { configurable: true, value: window.innerHeight + 500 })
    try {
      render(<ContactsPanel />)
      reportIntersections({ personal: false, social: true, addresses: false })
      expect(currentItems()).toEqual(["04Social media"])
      act(() => {
        window.scrollY = 500
        window.dispatchEvent(new Event("scroll"))
      })
      expect(currentItems()).toEqual(["05Addresses"])
      act(() => {
        window.scrollY = 200
        window.dispatchEvent(new Event("scroll"))
      })
      expect(currentItems()).toEqual(["04Social media"])
    } finally {
      delete (root as unknown as Record<string, unknown>).scrollHeight
      window.scrollY = 0
    }
  })

  it("observes the five Sections with a top-weighted root margin and disconnects on unmount", () => {
    const { unmount } = render(<ContactsPanel />)
    const io = FakeIntersectionObserver.instances.at(-1)!
    expect(io.options).toEqual({ rootMargin: "0px 0px -60% 0px" })
    expect(Array.from(io.targets).map((t) => t.id)).toEqual(["personal", "phone", "email", "social", "addresses"])
    unmount()
    expect(io.disconnected).toBe(true)
  })

  it("ignores intersections of elements that aren't Sections", () => {
    render(<ContactsPanel />)
    reportIntersections({ signature: true })
    expect(currentItems()).toEqual(["01Personal information"])
  })
})

describe("counts", () => {
  function Reporter({ id, count }: { readonly id: "phone" | "email"; readonly count: number | undefined }) {
    useReportSectionCount(id, count)
    return null
  }
  function Harness() {
    const nav = useSectionNavigation()
    const [phones, setPhones] = useState<number | undefined>(2)
    const [showEmail, setShowEmail] = useState(true)
    return (
      <>
        <SectionNav state={nav} />
        <Reporter id="phone" count={phones} />
        {showEmail ? <Reporter id="email" count={0} /> : null}
        <button type="button" onClick={() => setPhones(3)}>
          more
        </button>
        <button type="button" onClick={() => setPhones(undefined)}>
          clear
        </button>
        <button type="button" onClick={() => setShowEmail(false)}>
          unmount
        </button>
      </>
    )
  }
  const count = (name: RegExp): string | null | undefined => menuLink(name).querySelector('[data-slot="section-count"]')?.textContent

  it("`accent`: each count is a pill on its tone's strong tint, the current item's on the emphasis tint; none without a count", () => {
    function AccentHarness() {
      const nav = useSectionNavigation()
      return (
        <>
          <SectionNav state={nav} accent />
          <section id="phone" />
          <Reporter id="phone" count={5} />
          <Reporter id="email" count={0} />
        </>
      )
    }
    render(
      <SectionCountProvider>
        <AccentHarness />
      </SectionCountProvider>,
    )
    const pill = (name: RegExp) => menuLink(name).querySelector<HTMLElement>('[data-slot="section-count"]')
    hasClasses(pill(/^Phone$/), "rounded-full", "font-mono", "bg-tint-teal-strong", "text-tint-teal-strong-foreground")
    expect(pill(/^Phone$/)?.textContent).toBe("5")
    hasClasses(pill(/^Email$/), "rounded-full", "bg-tint-teal-strong")
    expect(pill(/^Email$/)?.textContent).toBe("0")
    // Personal information has no count: no pill.
    expect(pill(/^Personal information$/)?.className).not.toContain("rounded-full")
    // The current item: the stronger emphasis tint.
    act(() => menuLink(/^Phone$/).click())
    hasClasses(pill(/^Phone$/), "bg-tint-teal-emphasis", "text-tint-teal-emphasis-foreground")
    expect(pill(/^Phone$/)?.className).not.toContain("bg-tint-teal-strong ")
  })

  it("shows each Section's reported saved-entry count, blank when none is reported", () => {
    render(
      <SectionCountProvider>
        <Harness />
      </SectionCountProvider>,
    )
    expect(count(/^Phone$/)).toBe("2")
    expect(count(/^Email$/)).toBe("0")
    expect(count(/^Personal information$/)).toBe("")
    fireEvent.click(screen.getByRole("button", { name: "more" }))
    expect(count(/^Phone$/)).toBe("3")
    fireEvent.click(screen.getByRole("button", { name: "clear" }))
    expect(count(/^Phone$/)).toBe("")
    fireEvent.click(screen.getByRole("button", { name: "unmount" }))
    expect(count(/^Email$/)).toBe("")
  })

  it("outside a provider, reporting does nothing and counts are blank", () => {
    function Bare() {
      const nav = useSectionNavigation()
      useReportSectionCount("phone", 4)
      return <SectionNav state={nav} />
    }
    render(<Bare />)
    expect(count(/^Phone$/)).toBe("")
  })
})

describe("deep links", () => {
  it.each(["personal", "phone", "email", "social", "addresses"])("#%s on load scrolls (instantly) to that Section and makes it current", (id) => {
    setUrl(`/?tab=contacts#${id}`)
    render(<ContactsPanel />)
    expect(sectionScrolls()).toEqual([{ el: document.getElementById(id), options: { behavior: "auto", block: "start" } }])
    expect(currentItems()).toHaveLength(1)
    expect(within(menu()).getByRole("link", { current: "location" }).getAttribute("href")).toBe(`#${id}`)
  })

  it("#signature on load scrolls to the Signature row; Personal information is current", () => {
    setUrl("/?tab=contacts#signature")
    render(<ContactsPanel />)
    expect(sectionScrolls()).toEqual([{ el: document.getElementById("signature"), options: { behavior: "auto", block: "start" } }])
    expect(currentItems()).toEqual(["01Personal information"])
  })

  it("hashchange scrolls (motion-aware) to the new Section or the Signature row", async () => {
    render(<ContactsPanel />)
    act(() => {
      window.location.hash = "#email"
    })
    await waitFor(() => expect(sectionScrolls().map((s) => s.el.id)).toEqual(["email"]))
    expect(sectionScrolls()[0].options).toEqual({ behavior: "smooth", block: "start" })
    expect(currentItems()).toEqual(["03Email"])
    act(() => {
      window.location.hash = "#signature"
    })
    await waitFor(() => expect(sectionScrolls().map((s) => s.el.id)).toEqual(["email", "signature"]))
  })

  it.each(["#nope", "#", "#%E0%A4%A", "#__proto__", "#toString", "#insurance"])("an unknown hash (%s) leaves the page at the top", (hash) => {
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
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(sectionScrolls()).toEqual([])
  })

  it.each(["insurance", "medical"] as const)("a Section hash on %s is ignored", async (tab) => {
    setUrl(`/?tab=${tab}#phone`)
    render(
      <TestProviders>
        <CurrentPageProvider value="profile">
          <SectionRegistryProvider>
            <ProfileTabs />
          </SectionRegistryProvider>
        </CurrentPageProvider>
      </TestProviders>,
    )
    expect(sectionScrolls()).toEqual([])
    act(() => {
      window.location.hash = "#signature"
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(sectionScrolls()).toEqual([])
    expect(window.location.search).toBe(`?tab=${tab}`)
  })

  it("a menu activation cancels a pending deep-link re-scroll", () => {
    setUrl("/?tab=contacts#phone")
    render(<Harness />)
    expect(sectionScrolls().map((s) => s.el.id)).toEqual(["phone"])
    fireEvent.click(menuLink(/^Email$/))
    act(() => harness?.frameReady("phone"))
    expect(sectionScrolls().map((s) => s.el.id)).toEqual(["phone", "email"])
  })

  it("without an activation, the target frame's first ready re-scrolls once", () => {
    setUrl("/?tab=contacts#phone")
    render(<Harness />)
    act(() => harness?.frameReady("phone"))
    act(() => harness?.frameReady("phone"))
    expect(sectionScrolls().map((s) => [s.el.id, s.options])).toEqual([
      ["phone", { behavior: "auto", block: "start" }],
      ["phone", { behavior: "auto", block: "start" }],
    ])
  })

  it("stops listening for hashchange on unmount", async () => {
    const { unmount } = render(<ContactsPanel />)
    unmount()
    act(() => {
      window.location.hash = "#phone"
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(sectionScrolls()).toEqual([])
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

let harness: SectionNavState | null = null

/** The Section navigation over loading frames, with its state exposed (to drive `frameReady`). */
function Harness() {
  const nav = useSectionNavigation()
  useEffect(() => {
    harness = nav
  })
  return (
    <>
      <SectionNav state={nav} />
      {PROFILE_SECTIONS.map((section) => (
        <SectionLandmark key={section.id} id={section.id} title={section.label}>
          <StateFrame state="loading" skeleton="table" loadError={{ kind: "section", sectionId: section.id }} level="section" onRetry={vi.fn()} />
        </SectionLandmark>
      ))}
    </>
  )
}
