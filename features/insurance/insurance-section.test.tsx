import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse, type JsonBodyType } from "msw"
import { useEffect } from "react"
import { useSWRConfig, type ScopedMutator } from "swr"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { keys } from "@/lib/api"
import { axeViolations } from "@/test/axe"
import { stubLayoutApis } from "@/test/dom-stubs"
import { stubViewport } from "@/test/media"
import { myselfWire } from "@/test/myself-fixture"
import { renderInPage } from "@/test/providers"
import { InsuranceSection } from "."

/**
 * Story 5.1 (NG-9029): the Insurance Section on `/`, rendered the way
 * `PageFrame` hosts it (`renderInPage`, MSW at `/api`). Covers every row of
 * the I/O matrix in `spec-5-1-view-policies-and-card-images.md` but the
 * download entry (`allowlist/insurance.test.ts`), plus axe in light and dark.
 */

const LIST = "/api/1h/v2/health/patient/insurance"
const FRONT = "InsuranceHasFrontSideCardFile"
const BACK = "InsuranceHasBackSideCardFile"

type Wire = Record<string, unknown>
type Answer = () => Response | Promise<Response>

/** A backend `ResponseInsuranceDTO`: an active Primary Medical, Self, both card images. */
const wire = (overrides: Wire = {}): Wire => ({
  id: 55,
  memberIdNumber: "948221037",
  insuranceType: "MEDICAL",
  planEffectiveDate: "2025-01-01",
  insuranceOrganizationDTO: { insuranceCompanyName: "UnitedHealthcare", insuranceCompanyId: 7 },
  insuranceGroupId: "704512",
  expirationDate: "2026-12-31",
  cancellationDate: null,
  subscriber: null,
  insurancePrecedence: "PRIMARY",
  relationshipToInsured: "SELF",
  label: "Active",
  frontSideCardFile: { id: 900, name: "front.jpg" },
  backSideCardFile: { id: 901, name: "back.jpg" },
  ...overrides,
})

const page = (content: Wire[]) => ({ content, last: true, totalElements: content.length, number: 0, size: 100 })

const DENTAL = wire({
  id: 56,
  insuranceType: "DENTAL",
  insurancePrecedence: "SECONDARY",
  relationshipToInsured: "SPOUSE",
  insuranceOrganizationDTO: { insuranceCompanyName: "Delta Dental" },
  subscriber: { firstName: "Sam", lastName: "Lee" },
  frontSideCardFile: null,
  backSideCardFile: null,
})
const VISION_DELETED = wire({ id: 57, insuranceType: "VISION", label: "Deleted", insuranceOrganizationDTO: { insuranceCompanyName: "VSP" }, backSideCardFile: null })

/** The matrix's "Cards" row, the Deleted policy first in platform order. */
const CARDS = page([VISION_DELETED, wire(), DENTAL])

const ok = (body: Wire | Wire[]): Answer => () => HttpResponse.json(body as JsonBodyType)
const fail = (status = 500): Answer => () => HttpResponse.json({ message: "boom" }, { status })

function listServer(answer: Answer = ok(CARDS)) {
  const seen: string[] = []
  const handler = http.get(LIST, ({ request }) => {
    seen.push(new URL(request.url).search)
    return answer()
  })
  return { seen, handlers: [handler] }
}

const section = (): HTMLElement => screen.getByRole("region", { name: "Insurance" })
const frame = (): HTMLElement | null => section().querySelector('[data-slot="state-frame"]')
const meta = (): string | null | undefined => section().querySelector('[data-slot="section-meta"]')?.textContent
const card = (title: string): HTMLElement => within(section()).getByRole("article", { name: title })

/** The value cell of a key in a card's grid (`td headers` = the key cell's id). */
function valueOf(container: HTMLElement, key: string): string | null | undefined {
  const header = within(container).getByRole("rowheader", { name: key })
  return container.querySelector(`td[headers="${header.id}"]`)?.textContent
}

async function renderLoaded(answer: Answer = ok(CARDS)) {
  const server = listServer(answer)
  const result = renderInPage(<InsuranceSection />, { page: "profile", handlers: server.handlers, myself: myselfWire({ firstName: "Avery", lastName: "Lee" }) })
  await waitFor(() => expect(frame()?.getAttribute("data-state")).toBe("ready"))
  return { ...result, seen: server.seen }
}

/** Renders the Section with a probe that hands out the SWR `mutate` (to revalidate `keys.insurance()`). */
function renderWithMutate(answer: Answer) {
  let mutate: ScopedMutator | undefined
  function Probe() {
    const { mutate: scoped } = useSWRConfig()
    useEffect(() => {
      mutate = scoped
    }, [scoped])
    return null
  }
  const server = listServer(answer)
  renderInPage(
    <>
      <InsuranceSection />
      <Probe />
    </>,
    { page: "profile", handlers: server.handlers },
  )
  return { mutate: () => mutate, seen: server.seen }
}

beforeEach(() => {
  stubViewport(1024)
  stubLayoutApis()
})
afterEach(() => {
  document.documentElement.classList.remove("dark")
})

describe("InsuranceSection: loading", () => {
  it("renders the landmark and h2 from the first render and skeleton policy cards; one list read for page 0 of 100", async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const server = listServer(async () => {
      await gate
      return HttpResponse.json(CARDS)
    })
    renderInPage(<InsuranceSection />, { page: "profile", handlers: server.handlers })
    const landmark = section()
    expect(landmark.id).toBe("insurance")
    expect(screen.getByRole("heading", { level: 2, name: "Insurance" }).id).toBe("insurance-heading")
    expect(frame()?.getAttribute("data-state")).toBe("loading")
    expect(frame()?.getAttribute("aria-busy")).toBe("true")
    expect(frame()?.querySelector('[data-slot="frame-skeleton"]')?.getAttribute("data-variant")).toBe("cards")
    // One column of policy cards, not the organizations grid; the shimmer is static under reduced motion.
    expect(frame()?.className).toContain("[&_[data-slot=frame-skeleton]]:grid-cols-1")
    expect(frame()?.querySelector('[data-slot="frame-skeleton-card"] [data-slot="skeleton"]')?.className).toContain("motion-reduce:animate-none")
    expect(screen.getByText("Loading insurance")).toBeTruthy()
    expect(meta()).toBeUndefined()

    release()
    await within(section()).findByRole("article", { name: "Medical Insurance" })
    // The same landmark, never remounted.
    expect(section()).toBe(landmark)
    expect(server.seen).toEqual(["?page=0&size=100"])
  })
})

describe("InsuranceSection: cards", () => {
  it("orders active policies first, counts them, titles and chips each card", async () => {
    await renderLoaded()
    const titles = within(section()).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)
    expect(titles).toEqual(["Medical Insurance", "Dental Insurance", "Vision Insurance"])
    expect(meta()).toBe("2")
    const chips = section().querySelectorAll('[data-slot="chip"]')
    expect([...chips].map((chip) => [chip.textContent, chip.getAttribute("data-variant")])).toEqual([
      ["Primary", "primary"],
      ["Secondary", "label"],
      ["Deleted", "deleted"],
    ])
    // Flat bordered cards in one column, 16 px apart; the title row is ≥ 52 px with a bottom hairline. The raised shadow
    // (design refresh) lives on a pseudo-element shown only on hover or focus, never on the card at rest.
    expect(section().querySelector('[data-slot="insurance-cards"]')?.className).toContain("gap-4")
    expect(card("Medical Insurance").className).toContain("rounded-md")
    expect(card("Medical Insurance").className).toContain("border")
    expect(card("Medical Insurance").className).not.toMatch(/(^|\s)shadow-/)
    expect(card("Medical Insurance").className).toContain("after:opacity-0")
    expect(card("Medical Insurance").className).toContain("motion-safe:hover:-translate-y-0.5")
    expect(card("Medical Insurance").querySelector('[data-slot="insurance-card-title"]')?.className).toContain("min-h-13")
    expect(card("Medical Insurance").querySelector('[data-slot="insurance-card-title"]')?.className).toContain("border-b")
  })

  it("shows the grid in order, with the user's own name on a Self policy and the subscriber's otherwise", async () => {
    await renderLoaded()
    const medical = card("Medical Insurance")
    expect(within(medical).getAllByRole("rowheader").map((cell) => cell.textContent)).toEqual([
      "Insurer",
      "Subscriber",
      "Member ID",
      "Effective",
      "Group ID",
      "Expiration",
      "Cancellation",
    ])
    expect(within(medical).getByRole("table", { name: "Medical Insurance" })).toBeTruthy()
    expect(valueOf(medical, "Insurer")).toBe("UnitedHealthcare")
    expect(valueOf(medical, "Subscriber")).toBe("Avery Lee")
    expect(valueOf(medical, "Member ID")).toBe("948221037")
    expect(valueOf(medical, "Effective")).toBe("01/01/2025")
    expect(valueOf(medical, "Expiration")).toBe("12/31/2026")
    expect(valueOf(card("Dental Insurance"), "Subscriber")).toBe("Sam Lee")
  })

  it("reads the backend placeholders and a missing date as Not provided", async () => {
    await renderLoaded(ok(page([wire({ expirationDate: "1970-01-01", insuranceGroupId: "n/a", cancellationDate: null })])))
    const medical = card("Medical Insurance")
    expect(valueOf(medical, "Expiration")).toBe("Not provided")
    expect(valueOf(medical, "Group ID")).toBe("Not provided")
    expect(valueOf(medical, "Cancellation")).toBe("Not provided")
  })

  it("shows the Front and Back thumbnails of an active card as buttons on the same-origin download", async () => {
    await renderLoaded()
    const medical = card("Medical Insurance")
    const front = within(medical).getByRole("button", { name: "Front of UnitedHealthcare Medical Insurance card" })
    const back = within(medical).getByRole("button", { name: "Back of UnitedHealthcare Medical Insurance card" })
    expect(front.querySelector("img")?.getAttribute("src")).toBe(`/api/1h/v2/health/insurance/55/file/900/download?fileRelKey=${FRONT}`)
    expect(back.querySelector("img")?.getAttribute("src")).toBe(`/api/1h/v2/health/insurance/55/file/901/download?fileRelKey=${BACK}`)
    expect([...medical.querySelectorAll("figcaption")].map((caption) => caption.textContent)).toEqual(["Front", "Back"])
    expect(front.className).toContain("h-19")
    expect(front.className).toContain("w-30")
    expect(front.className).toContain("rounded-sm")
    expect(medical.querySelector('[data-slot="insurance-thumbnails"]')?.className).toContain("md:border-l")
  })

  it("shows the dashed tile for a side with no file (Dental: both)", async () => {
    await renderLoaded()
    const dental = card("Dental Insurance")
    // Only the kebab (Story 5.2): no thumbnail buttons.
    expect(within(dental).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(["More actions for Delta Dental Dental Insurance"])
    const tiles = within(dental).getAllByRole("img")
    expect(tiles.map((tile) => tile.getAttribute("aria-label"))).toEqual(["Front image not uploaded", "Back image not uploaded"])
    for (const tile of tiles) {
      expect(tile.textContent).toBe("Image not uploaded")
      expect(tile.className).toContain("border-dashed")
    }
    expect(dental.querySelector("img")).toBeNull()
  })

  it("swaps a thumbnail whose image fails to load for the same tile, silently", async () => {
    await renderLoaded()
    const medical = card("Medical Insurance")
    const img = within(medical).getByRole("button", { name: "Back of UnitedHealthcare Medical Insurance card" }).querySelector("img") as HTMLImageElement
    act(() => {
      fireEvent.error(img)
    })
    expect(within(medical).queryByRole("button", { name: /^Back of/ })).toBeNull()
    expect(within(medical).getByRole("img", { name: "Back image not uploaded" }).textContent).toBe("Image not uploaded")
    expect(within(medical).getByRole("button", { name: "Front of UnitedHealthcare Medical Insurance card" })).toBeTruthy()
    expect(screen.queryByRole("alert")).toBeNull()

    // The viewer, opened from Front: Back is disabled and stays unpressed when clicked.
    const user = userEvent.setup()
    await user.click(within(medical).getByRole("button", { name: "Front of UnitedHealthcare Medical Insurance card" }))
    const dialog = await screen.findByRole("dialog")
    const [frontToggle, backToggle] = within(within(dialog).getByRole("group", { name: "Card side" })).getAllByRole("button")
    expect(backToggle.getAttribute("aria-disabled")).toBe("true")
    await user.click(backToggle)
    expect(backToggle.getAttribute("aria-pressed")).toBe("false")
    expect(frontToggle.getAttribute("aria-pressed")).toBe("true")
  })

  it("tries a side again once the list revalidates with a new file id for it", async () => {
    let body: Wire = CARDS
    const { mutate } = renderWithMutate(() => HttpResponse.json(body as JsonBodyType))
    const medical = await within(section()).findByRole("article", { name: "Medical Insurance" })
    act(() => {
      fireEvent.error(within(medical).getByRole("button", { name: /^Back of/ }).querySelector("img") as HTMLImageElement)
    })
    expect(within(medical).queryByRole("button", { name: /^Back of/ })).toBeNull()

    body = page([VISION_DELETED, wire({ backSideCardFile: { id: 902, name: "back-2.jpg" } }), DENTAL])
    await act(async () => {
      await mutate()?.(keys.insurance())
    })
    const back = await within(card("Medical Insurance")).findByRole("button", { name: "Back of UnitedHealthcare Medical Insurance card" })
    expect(back.querySelector("img")?.getAttribute("src")).toBe(`/api/1h/v2/health/insurance/55/file/902/download?fileRelKey=${BACK}`)
  })

  it("a Deleted card is muted, with the Deleted chip, no kebab and no thumbnail action", async () => {
    await renderLoaded()
    const vision = card("Vision Insurance")
    expect(vision.getAttribute("data-deleted")).toBe("true")
    expect(vision.className).toContain("[&_*]:text-muted-foreground!")
    expect(within(vision).queryAllByRole("button")).toEqual([])
    expect(within(vision).getByRole("img", { name: "Front of VSP Vision Insurance card" }).getAttribute("src")).toBe(
      `/api/1h/v2/health/insurance/57/file/900/download?fileRelKey=${FRONT}`,
    )
    expect(within(vision).getByRole("img", { name: "Back image not uploaded" })).toBeTruthy()
    expect(document.querySelector('[data-slot="insurance-card-viewer"]')).toBeNull()
  })

  it("shows the kebab on active cards only and the outline \"Add insurance\" (plus icon) in the header (Story 5.2)", async () => {
    await renderLoaded()
    expect(within(section()).getAllByRole("button", { name: /^More actions for/ }).map((button) => button.getAttribute("aria-label"))).toEqual([
      "More actions for UnitedHealthcare Medical Insurance",
      "More actions for Delta Dental Dental Insurance",
    ])
    const add = within(section()).getByRole("button", { name: "Add insurance" })
    expect(add.closest('[data-slot="section-header"]')).not.toBeNull()
    expect(add.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true")
    expect(add.className).toContain("border")
  })

  it("an active policy without an id gets no kebab (nothing to edit)", async () => {
    await renderLoaded(ok(page([wire({ id: undefined }), DENTAL])))
    const medical = card("Medical Insurance")
    expect(within(medical).queryByRole("button", { name: /^More actions for/ })).toBeNull()
    expect(within(card("Dental Insurance")).getByRole("button", { name: /^More actions for/ })).toBeTruthy()
  })

  it("\"Add insurance\" shows only once the list is ready: not while loading, after a failure or without access", async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const view = renderInPage(<InsuranceSection />, {
      page: "profile",
      handlers: listServer(async () => {
        await gate
        return HttpResponse.json(CARDS)
      }).handlers,
    })
    expect(frame()?.getAttribute("data-state")).toBe("loading")
    expect(within(section()).queryByRole("button", { name: "Add insurance" })).toBeNull()
    release()
    await within(section()).findByRole("button", { name: "Add insurance" })
    view.unmount()
    for (const status of [500, 403]) {
      const failed = renderInPage(<InsuranceSection />, { page: "profile", handlers: listServer(fail(status)).handlers })
      await waitFor(() => expect(frame()?.getAttribute("data-state")).not.toBe("loading"))
      expect(within(section()).queryByRole("button", { name: "Add insurance" })).toBeNull()
      failed.unmount()
    }
  })

  it("moves the thumbnails below the grid under 768 px", async () => {
    stubViewport(360)
    await renderLoaded()
    const body = card("Medical Insurance").querySelector('[data-slot="insurance-thumbnails"]')
    expect(body?.className).toContain("border-t")
    expect(body?.parentElement?.className).toContain("flex-col")
    expect(body?.parentElement?.className).toContain("md:flex-row")
    // The grid is one Field | Value pair per row.
    expect(within(card("Medical Insurance")).getAllByRole("row")).toHaveLength(7)
  })

  it("reports ready to the Section frame", async () => {
    const { frameReady } = await renderLoaded()
    await waitFor(() => expect(frameReady).toHaveBeenCalledWith("insurance"))
  })
})

describe("InsuranceSection: card image viewer", () => {
  it("Enter on Front opens the viewer on Front; Back is a pressed toggle; Escape returns focus to the thumbnail", async () => {
    const user = userEvent.setup()
    await renderLoaded()
    const front = within(card("Medical Insurance")).getByRole("button", { name: "Front of UnitedHealthcare Medical Insurance card" })
    front.focus()
    await user.keyboard("{Enter}")
    const dialog = await screen.findByRole("dialog", { name: "UnitedHealthcare Medical Insurance card" })
    expect(dialog.getAttribute("data-size")).toBe("lg")
    expect(dialog.getAttribute("data-fullscreen-mobile")).toBe("true")
    expect(dialog.className).toContain("rounded-lg")
    const group = within(dialog).getByRole("group", { name: "Card side" })
    const [frontToggle, backToggle] = within(group).getAllByRole("button")
    expect([frontToggle.textContent, frontToggle.getAttribute("aria-pressed")]).toEqual(["Front", "true"])
    expect([backToggle.textContent, backToggle.getAttribute("aria-pressed")]).toEqual(["Back", "false"])
    expect(within(dialog).getByRole("img", { name: "Front of UnitedHealthcare Medical Insurance card" }).getAttribute("src")).toBe(
      `/api/1h/v2/health/insurance/55/file/900/download?fileRelKey=${FRONT}`,
    )

    await user.click(backToggle)
    expect(backToggle.getAttribute("aria-pressed")).toBe("true")
    expect(frontToggle.getAttribute("aria-pressed")).toBe("false")
    expect(within(dialog).getByRole("img", { name: "Back of UnitedHealthcare Medical Insurance card" }).getAttribute("src")).toBe(
      `/api/1h/v2/health/insurance/55/file/901/download?fileRelKey=${BACK}`,
    )

    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(document.activeElement).toBe(front)
  })

  it("Space on Back opens it on Back; a side without an image is disabled; Close returns focus to that thumbnail", async () => {
    const user = userEvent.setup()
    await renderLoaded(ok(page([wire({ frontSideCardFile: null })])))
    const medical = card("Medical Insurance")
    const back = within(medical).getByRole("button", { name: "Back of UnitedHealthcare Medical Insurance card" })
    back.focus()
    await user.keyboard(" ")
    const dialog = await screen.findByRole("dialog", { name: "UnitedHealthcare Medical Insurance card" })
    const [frontToggle, backToggle] = within(within(dialog).getByRole("group", { name: "Card side" })).getAllByRole("button")
    expect(backToggle.getAttribute("aria-pressed")).toBe("true")
    expect(frontToggle.getAttribute("aria-disabled")).toBe("true")
    await user.click(frontToggle)
    expect(backToggle.getAttribute("aria-pressed")).toBe("true")
    await user.click(within(dialog).getByRole("button", { name: "Close" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(document.activeElement).toBe(back)
  })

  it("a click opens it too, and an image that fails in the viewer shows the tile", async () => {
    const user = userEvent.setup()
    await renderLoaded()
    await user.click(within(card("Medical Insurance")).getByRole("button", { name: "Front of UnitedHealthcare Medical Insurance card" }))
    const dialog = await screen.findByRole("dialog")
    act(() => {
      fireEvent.error(within(dialog).getByRole("img", { name: /^Front of/ }))
    })
    expect(within(dialog).getByRole("img", { name: "Front image not uploaded" })).toBeTruthy()
  })
})

describe("InsuranceSection: empty, error and no access", () => {
  it.each([
    ["an empty Page", page([])],
    ["an empty list (the page defaults)", []],
  ])("%s: the dashed empty card with the copy and the primary \"Add insurance\"; count 0", async (_case, body) => {
    await renderLoaded(ok(body))
    const empty = section().querySelector('[data-slot="empty-state"]')
    expect(empty?.getAttribute("data-variant")).toBe("card")
    expect(empty?.className).toContain("border-dashed")
    expect(within(empty as HTMLElement).getByText("No insurance on file. Add a policy before your next visit.")).toBeTruthy()
    expect(within(empty as HTMLElement).getByRole("button", { name: "Add insurance" })).toBeTruthy()
    expect(meta()).toBe("0")
  })

  it("a list 500: \"Couldn't load insurance · Retry\"; Retry reloads only this list", async () => {
    let answer: Answer = fail()
    const server = listServer(() => answer())
    const otherReads: string[] = []
    const spy = http.get("/api/1h/*", ({ request }) => {
      otherReads.push(new URL(request.url).pathname)
      return undefined
    })
    renderInPage(<InsuranceSection />, { page: "profile", handlers: [spy, ...server.handlers] })
    await within(section()).findByText("Couldn't load insurance")
    expect(frame()?.getAttribute("data-state")).toBe("error")
    expect(server.seen).toHaveLength(1)
    const before = otherReads.filter((path) => !path.endsWith("/patient/insurance")).length
    answer = ok(CARDS)
    await userEvent.setup().click(within(section()).getByRole("button", { name: "Retry" }))
    await within(section()).findByRole("article", { name: "Medical Insurance" })
    expect(server.seen).toHaveLength(2)
    expect(otherReads.filter((path) => !path.endsWith("/patient/insurance")).length).toBe(before)
  })

  it("a repeated failure is re-announced once it arrives", async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let calls = 0
    const server = listServer(async () => {
      calls += 1
      if (calls > 1) await gate
      return HttpResponse.json({ message: "boom" }, { status: 500 })
    })
    renderInPage(<InsuranceSection />, { page: "profile", handlers: server.handlers })
    const first = await screen.findByText("Couldn't load insurance")
    fireEvent.click(within(section()).getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(calls).toBe(2))
    expect(screen.getByText("Couldn't load insurance")).toBe(first)

    release()
    await waitFor(() => expect(screen.getByText("Couldn't load insurance")).not.toBe(first))
  })

  it("a failed background revalidation keeps the cached cards", async () => {
    let fails = false
    const { mutate, seen } = renderWithMutate(() => (fails ? fail()() : HttpResponse.json(CARDS)))
    await within(section()).findByRole("article", { name: "Medical Insurance" })
    fails = true
    await act(async () => {
      await mutate()?.(keys.insurance())
    })
    await waitFor(() => expect(seen).toHaveLength(2))
    expect(frame()?.getAttribute("data-state")).toBe("ready")
    expect(screen.queryByText("Couldn't load insurance")).toBeNull()
    expect(card("Medical Insurance")).toBeTruthy()
  })

  it("a list 403: the Section's no-access row", async () => {
    renderInPage(<InsuranceSection />, { page: "profile", handlers: listServer(fail(403)).handlers })
    await waitFor(() => expect(frame()?.getAttribute("data-state")).toBe("forbidden"))
    expect(section().querySelector('[data-slot="no-access"]')?.getAttribute("data-level")).toBe("section")
    expect(within(section()).queryByRole("button", { name: "Retry" })).toBeNull()
  })
})

describe("InsuranceSection: registration", () => {
  it("registers guard-only: never in Save all or the dirty count, no draft fields; the editor supplies its save (Story 5.2)", async () => {
    const { registry } = await renderLoaded()
    expect(registry.get("insurance")).toMatchObject({ id: "insurance", label: "Insurance", displayOrder: 6, isDirty: false, saveAll: false, canSave: true })
    expect(registry.get("insurance")?.draftFields ?? []).toEqual([])
    expect(registry.getDirtyCount()).toBe(0)
    expect(registry.isAnyDirty()).toBe(false)
  })
})

describe("InsuranceSection: accessibility", () => {
  it.each([
    ["light", 1024],
    ["dark", 1024],
    ["light", 360],
    ["dark", 360],
  ])("has no axe violations with the cards in %s mode at %i px", async (theme, width) => {
    stubViewport(width)
    if (theme === "dark") document.documentElement.classList.add("dark")
    await renderLoaded()
    expect(await axeViolations()).toEqual([])
  })

  it.each(["light", "dark"])("has no axe violations in the viewer, empty, error and no-access states in %s mode", async (theme) => {
    if (theme === "dark") document.documentElement.classList.add("dark")
    const user = userEvent.setup()
    const loaded = await renderLoaded()
    await user.click(within(card("Medical Insurance")).getByRole("button", { name: /^Front of/ }))
    await screen.findByRole("dialog")
    expect(await axeViolations()).toEqual([])
    loaded.unmount()

    for (const answer of [ok([]), fail(), fail(403)]) {
      const view = renderInPage(<InsuranceSection />, { page: "profile", handlers: listServer(answer).handlers })
      await waitFor(() => expect(frame()?.getAttribute("data-state")).not.toBe("loading"))
      expect(await axeViolations()).toEqual([])
      view.unmount()
    }
  })
})
