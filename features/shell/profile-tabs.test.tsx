import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SHELL_COPY } from "@/lib/shared/messages"
import { axeViolations } from "../../test/axe"
import { installDomStubs, type DomStubs } from "../../test/dom-stubs"
import { server } from "../../test/server"
import { setLeaveGuard } from "./leave"
import { ProfileTabs } from "./profile-tabs"

/**
 * The profile tabs (Story 1.8): ARIA wiring from Radix, manual-activation keys,
 * the `requestLeave()` gate, `history.replaceState` URLs (hash dropped, no
 * history entry), bad-tab normalisation on mount, and a Medical switch with no
 * network request.
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
  setLeaveGuard(null)
  expect(errorSpy).not.toHaveBeenCalled()
  vi.restoreAllMocks()
  stubs.uninstall()
  setUrl("/")
})

function tab(name: "Contacts" | "Insurance" | "Medical") {
  return screen.getByRole("tab", { name: new RegExp(`^${name}`) })
}

function selectedTab() {
  return screen.getAllByRole("tab").find((t) => t.getAttribute("aria-selected") === "true")
}

describe("ProfileTabs — structure and ARIA", () => {
  it("renders a tablist with Contacts, Insurance and Medical; the panel is wired both ways", () => {
    render(<ProfileTabs initialTab="contacts" />)
    const list = screen.getByRole("tablist")
    const tabs = within(list).getAllByRole("tab")
    expect(tabs.map((t) => t.textContent)).toEqual([
      SHELL_COPY.tabs.contacts,
      SHELL_COPY.tabs.insurance,
      `${SHELL_COPY.tabs.medical} ${SHELL_COPY.comingSoon}${SHELL_COPY.soon}`,
    ])
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual(["true", "false", "false"])
    const panel = screen.getByRole("tabpanel")
    expect(tabs[0]).toHaveAttribute("aria-controls", panel.id)
    expect(panel).toHaveAttribute("aria-labelledby", tabs[0].id)
    expect(panel).toHaveAccessibleName(SHELL_COPY.tabs.contacts)
  })

  it("Tab moves focus onto the selected tab only (roving tabindex)", async () => {
    const user = userEvent.setup()
    render(
      <>
        <button type="button">before</button>
        <ProfileTabs initialTab="insurance" />
      </>,
    )
    act(() => screen.getByRole("button", { name: "before" }).focus())
    await user.tab()
    await waitFor(() => expect(tab("Insurance")).toHaveFocus())
    expect(screen.getAllByRole("tab").map((t) => t.getAttribute("tabindex"))).toEqual(["-1", "0", "-1"])
  })

  it("styles tabs as 44 px with 12 px padding; the active one foreground 600 with a 2 px primary underline", () => {
    render(<ProfileTabs initialTab="contacts" />)
    for (const t of screen.getAllByRole("tab")) {
      expect(t).toHaveClass("h-11", "px-3", "text-muted-foreground", "border-b-2", "-mb-px", "focus-ring")
      expect(t).toHaveClass(
        "data-[state=active]:text-foreground",
        "data-[state=active]:font-semibold",
        "data-[state=active]:border-primary",
      )
    }
    expect(screen.getByRole("tablist")).toHaveClass("border-b")
  })

  it("Medical carries the Coming soon / Soon chip", () => {
    render(<ProfileTabs initialTab="contacts" />)
    const chip = within(tab("Medical")).getByText(SHELL_COPY.comingSoon).parentElement!
    expect(chip).toHaveClass("bg-muted", "text-muted-foreground", "rounded-sm", "text-caption", "px-1.5")
    expect(within(chip).getByText(SHELL_COPY.comingSoon)).toHaveClass("hidden", "md:inline")
    expect(within(chip).getByText(SHELL_COPY.soon)).toHaveClass("md:hidden")
  })

  it.each(["contacts", "insurance", "medical"] as const)("opens on the initial tab %s", (id) => {
    setUrl(`/?tab=${id}`)
    render(<ProfileTabs initialTab={id} />)
    expect(selectedTab()).toBe(tab(SHELL_COPY.tabs[id] as "Contacts"))
    expect(replaceSpy).not.toHaveBeenCalled()
  })
})

describe("ProfileTabs — keyboard (manual activation)", () => {
  it("Right on Medical wraps to Contacts; Left on Contacts wraps to Medical; nothing activates", async () => {
    const user = userEvent.setup()
    render(<ProfileTabs initialTab="contacts" />)
    act(() => tab("Contacts").focus())
    await user.keyboard("{ArrowLeft}")
    await waitFor(() => expect(tab("Medical")).toHaveFocus())
    await user.keyboard("{ArrowRight}")
    await waitFor(() => expect(tab("Contacts")).toHaveFocus())
    await user.keyboard("{ArrowRight}")
    await waitFor(() => expect(tab("Insurance")).toHaveFocus())
    expect(selectedTab()).toBe(tab("Contacts"))
    expect(replaceSpy).not.toHaveBeenCalled()
  })

  it("Home and End move focus to the first and last tab", async () => {
    const user = userEvent.setup()
    render(<ProfileTabs initialTab="insurance" />)
    act(() => tab("Insurance").focus())
    await user.keyboard("{End}")
    await waitFor(() => expect(tab("Medical")).toHaveFocus())
    await user.keyboard("{Home}")
    await waitFor(() => expect(tab("Contacts")).toHaveFocus())
    expect(selectedTab()).toBe(tab("Insurance"))
  })

  it("Enter activates the focused tab only", async () => {
    const user = userEvent.setup()
    render(<ProfileTabs initialTab="contacts" />)
    act(() => tab("Contacts").focus())
    await user.keyboard("{ArrowRight}")
    await waitFor(() => expect(tab("Insurance")).toHaveFocus())
    await user.keyboard("{Enter}")
    await waitFor(() => expect(selectedTab()).toBe(tab("Insurance")))
    expect(tab("Medical")).toHaveAttribute("aria-selected", "false")
    expect(window.location.search).toBe("?tab=insurance")
  })

  it("Space activates the focused tab only", async () => {
    const user = userEvent.setup()
    render(<ProfileTabs initialTab="contacts" />)
    act(() => tab("Contacts").focus())
    await user.keyboard("{End}")
    await waitFor(() => expect(tab("Medical")).toHaveFocus())
    await user.keyboard(" ")
    await waitFor(() => expect(selectedTab()).toBe(tab("Medical")))
    expect(tab("Insurance")).toHaveAttribute("aria-selected", "false")
    expect(window.location.search).toBe("?tab=medical")
  })
})

describe("ProfileTabs — activation and URL", () => {
  it("a switch replaces the URL with ?tab=<id>, drops the hash and adds no history entry", async () => {
    setUrl("/?tab=contacts#email")
    const user = userEvent.setup()
    render(<ProfileTabs initialTab="contacts" />)
    replaceSpy.mockClear()
    const historyLength = window.history.length
    await user.click(tab("Medical"))
    await waitFor(() => expect(selectedTab()).toBe(tab("Medical")))
    expect(replaceSpy).toHaveBeenCalledOnce()
    expect(replaceSpy).toHaveBeenCalledWith(null, "", "?tab=medical")
    expect(window.location.pathname).toBe("/")
    expect(window.location.search).toBe("?tab=medical")
    expect(window.location.hash).toBe("")
    expect(window.history.length).toBe(historyLength)
  })

  it("asks requestLeave() first; when it resolves false, the tab and URL stay unchanged", async () => {
    const guard = vi.fn(() => Promise.resolve(false))
    setLeaveGuard(guard)
    const user = userEvent.setup()
    render(<ProfileTabs initialTab="contacts" />)
    await user.click(tab("Insurance"))
    await act(async () => {})
    expect(guard).toHaveBeenCalledOnce()
    expect(selectedTab()).toBe(tab("Contacts"))
    expect(replaceSpy).not.toHaveBeenCalled()
    expect(window.location.search).toBe("?tab=contacts")
  })

  it("waits for requestLeave(); when it resolves true, the switch goes ahead", async () => {
    let allow: (ok: boolean) => void = () => {}
    setLeaveGuard(() => new Promise<boolean>((resolve) => (allow = resolve)))
    const user = userEvent.setup()
    render(<ProfileTabs initialTab="contacts" />)
    await user.click(tab("Insurance"))
    expect(selectedTab()).toBe(tab("Contacts"))
    expect(replaceSpy).not.toHaveBeenCalled()
    await act(async () => allow(true))
    expect(selectedTab()).toBe(tab("Insurance"))
    expect(window.location.search).toBe("?tab=insurance")
  })

  it("re-activating the current tab does nothing", async () => {
    const guard = vi.fn(() => Promise.resolve(true))
    setLeaveGuard(guard)
    const user = userEvent.setup()
    render(<ProfileTabs initialTab="contacts" />)
    await user.click(tab("Contacts"))
    expect(guard).not.toHaveBeenCalled()
    expect(replaceSpy).not.toHaveBeenCalled()
  })

  it("Insurance shows one loading Insurance Section and no menu or Jump to", async () => {
    const user = userEvent.setup()
    render(<ProfileTabs initialTab="contacts" />)
    await user.click(tab("Insurance"))
    const panel = await screen.findByRole("tabpanel", { name: SHELL_COPY.tabs.insurance })
    const region = within(panel).getByRole("region", { name: SHELL_COPY.insurance })
    expect(region).toHaveAttribute("id", "insurance")
    expect(region.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(within(panel).getAllByRole("region")).toHaveLength(1)
    expect(screen.queryByRole("navigation")).toBeNull()
    expect(screen.queryByRole("combobox")).toBeNull()
  })
})

describe("ProfileTabs — panel focus", () => {
  it.each(["insurance", "medical"] as const)("the %s panel is a Tab stop with the focus ring", (id) => {
    setUrl(`/?tab=${id}`)
    render(<ProfileTabs initialTab={id} />)
    const panel = screen.getByRole("tabpanel")
    expect(panel).toHaveAttribute("tabindex", "0")
    expect(panel).toHaveClass("focus-ring")
  })
})

describe("ProfileTabs — bad ?tab= normalisation on mount", () => {
  it.each([
    ["/?tab=foo", "?tab=contacts", ""],
    ["/", "?tab=contacts", ""],
    ["/?tab=foo#phone", "?tab=contacts", "#phone"],
    ["/?tab=#signature", "?tab=contacts", "#signature"],
    ["/?tab=Contacts", "?tab=contacts", ""],
    ["/?tab=insurance&tab=medical", "?tab=contacts", ""],
  ])("%s → %s (hash kept)", (from, search, hash) => {
    setUrl(from)
    replaceSpy.mockClear()
    render(<ProfileTabs initialTab="contacts" />)
    expect(replaceSpy).toHaveBeenCalledOnce()
    expect(replaceSpy).toHaveBeenCalledWith(null, "", `?tab=contacts${hash}`)
    expect(window.location.search).toBe(search)
    expect(window.location.hash).toBe(hash)
    expect(selectedTab()).toBe(tab("Contacts"))
  })
})

describe("ProfileTabs — Medical", () => {
  it("switching to Medical shows exactly the RC9 text, no action, and makes zero network requests", async () => {
    const requests: string[] = []
    const onRequest = ({ request }: { request: Request }) => {
      requests.push(request.url)
    }
    server.events.on("request:start", onRequest)
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    try {
      const user = userEvent.setup()
      render(<ProfileTabs initialTab="contacts" />)
      await user.click(tab("Medical"))
      const panel = await screen.findByRole("tabpanel", { name: /^Medical/ })
      expect(panel).toHaveTextContent(/^Coming soon: your medical information will appear here\.$/)
      expect(within(panel).getByText(SHELL_COPY.medical)).toHaveClass("text-muted-foreground")
      expect(within(panel).queryByRole("button")).toBeNull()
      expect(within(panel).queryByRole("link")).toBeNull()
      expect(screen.queryByRole("navigation")).toBeNull()
      await new Promise((r) => setTimeout(r, 20))
      expect(requests).toEqual([])
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      server.events.removeListener("request:start", onRequest)
    }
  })
})

describe("ProfileTabs — accessibility", () => {
  it.each(["contacts", "insurance", "medical"] as const)("axe-core reports zero violations on %s", async (id) => {
    setUrl(`/?tab=${id}`)
    render(
      <main>
        <h1>Personal Profile</h1>
        <ProfileTabs initialTab={id} />
      </main>,
    )
    expect(await axeViolations()).toEqual([])
  })
})
