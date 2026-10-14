import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { useState } from "react"
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
import { ProfileTabs } from "./page-tabs"
import { SectionCountProvider, useReportSectionCount } from "./section-counts"
import { SectionNav, useSectionNavigation } from "./section-nav"
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
