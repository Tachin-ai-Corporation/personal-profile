import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse, type JsonBodyType } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { reencodeImage, type ReencodeResult } from "@/components/ui/image-reencode"
import { LeaveGuard, toastError, toastPartial, toastSuccess } from "@/features/shell"
import { axeViolations } from "@/test/axe"
import { stubLayoutApis } from "@/test/dom-stubs"
import { stubViewport } from "@/test/media"
import { server as mswServer } from "@/test/msw-server"
import { myselfWire } from "@/test/myself-fixture"
import { renderInPage } from "@/test/providers"
import { InsuranceSection } from "."
import { clearInsurancePendingCards, insurancePendingCard, setInsurancePendingCard } from "./pending-cards"

// The editor's and the card's toasts, observed (the shell's toast API; nothing renders a Toaster here).
vi.mock("@/features/shell/toasts", () => ({ toastSuccess: vi.fn(), toastError: vi.fn(() => ({ id: "t", dismiss: vi.fn() })), toastPartial: vi.fn() }))
// The canvas re-encode is the browser's (e2e); here it answers a small JPEG, or what a test sets.
vi.mock("@/components/ui/image-reencode", async (original) => ({ ...(await original<object>()), reencodeImage: vi.fn() }))

vi.setConfig({ testTimeout: 20_000 })

/**
 * Story 5.3 (NG-9029): card image upload with retry, on `/` the way
 * `PageFrame` hosts the Section (`renderInPage` plus the page's `LeaveGuard`,
 * MSW at `/api`). Covers every row of the I/O matrix in
 * `spec-5-3-card-image-upload-with-retry.md`: the editor's Front / Back
 * slots and their checks, the save (policy, then front, then back, then the
 * replaced file's delete), the partial toasts, "Retry upload" on the card
 * (in memory, or through the picker), and axe in light and dark.
 */

const LIST = "/api/1h/v2/health/patient/insurance"
const POLICY = "/api/1h/v2/health/patient/insurance/:id"
const TYPE_KEY_PATH = "/api/1h/v2/type/key/Insurance"
const ORGS = "/api/1h/v2/health/insurance/organizations"
const UPLOAD = "/api/1h/v2/health/type/Insurance/:id/relation/:relation/file/upload"
const DELETE = "/api/pp/file/:fileId"

type Wire = Record<string, unknown>
type Answer = () => Response | Promise<Response>

const values = (names: readonly string[]) => names.map((name, id) => ({ id, name }))
const TYPE_KEY = {
  boKey: "Insurance",
  attributes: [{ attrKey: "insuranceType", type: "VALUE_LIST", attributeValues: values(["n/a", "Medical", "Dental"]) }],
  relationships: [
    {
      relKey: "InsuranceBelongsToPerson",
      attributes: [
        { attrKey: "insurancePrecedence", type: "VALUE_LIST", attributeValues: values(["n/a", "Primary", "Secondary"]) },
        { attrKey: "relationshipToInsured", type: "VALUE_LIST", attributeValues: values(["n/a", "Self", "Spouse"]) },
      ],
    },
  ],
}

/** A backend `ResponseInsuranceDTO`: an active Primary Medical, Self, Blue Shield. */
const wire = (overrides: Wire = {}): Wire => ({
  id: 55,
  memberIdNumber: "948221037",
  insuranceType: "MEDICAL",
  planEffectiveDate: "2025-01-01",
  insuranceOrganizationDTO: { insuranceCompanyName: "Blue Shield", insuranceCompanyId: 7 },
  insuranceGroupId: "n/a",
  expirationDate: "1970-01-01",
  cancellationDate: "1970-01-01",
  subscriber: null,
  insurancePrecedence: "PRIMARY",
  relationshipToInsured: "SELF",
  label: "Active",
  frontSideCardFile: null,
  backSideCardFile: null,
  ...overrides,
})

const json = (body: unknown, status = 200): Answer => () => HttpResponse.json(body as JsonBodyType, { status })
const page = (rows: Wire[]): Answer => json({ data: rows, lastPage: true })

const RELATION_SIDE: Readonly<Record<string, string>> = { InsuranceHasFrontSideCardFile: "front", InsuranceHasBackSideCardFile: "back" }

interface Server {
  /** Every write and refetch in order: `POST`, `PUT 55`, `upload 60 front`, `DELETE 900`, `list`. */
  readonly log: string[]
  /** The upload URLs' query strings. */
  readonly uploadQueries: string[]
  setList: (answer: Answer) => void
  setWrite: (answer: Answer) => void
  setUpload: (side: "front" | "back", answer: Answer) => void
  setDelete: (answer: Answer) => void
}

function makeServer(list: Answer) {
  const log: string[] = []
  const uploadQueries: string[] = []
  const state: { list: Answer; write: Answer; upload: Record<string, Answer>; delete: Answer; ready: boolean } = {
    list,
    write: json({ id: 60 }),
    upload: { front: json({ id: 950 }), back: json({ id: 951 }) },
    delete: () => new HttpResponse(null, { status: 204 }),
    ready: false,
  }
  const handlers = [
    http.get(LIST, () => {
      if (state.ready) log.push("list")
      return state.list()
    }),
    http.get(TYPE_KEY_PATH, () => HttpResponse.json(TYPE_KEY)),
    // The insurer search knows no insurer: the tests add one by name.
    http.get(ORGS, () => HttpResponse.json({ data: [], lastPage: true })),
    http.post(LIST, () => {
      log.push("POST")
      return state.write()
    }),
    http.put(POLICY, ({ params }) => {
      log.push(`PUT ${String(params.id)}`)
      return state.write()
    }),
    http.post(UPLOAD, ({ params, request }) => {
      const side = RELATION_SIDE[String(params.relation)] ?? "?"
      log.push(`upload ${String(params.id)} ${side}`)
      uploadQueries.push(new URL(request.url).search)
      return state.upload[side]()
    }),
    http.delete(DELETE, ({ params }) => {
      log.push(`DELETE ${String(params.fileId)}`)
      return state.delete()
    }),
  ]
  const server: Server = {
    log,
    uploadQueries,
    setList: (answer) => {
      state.list = answer
    },
    setWrite: (answer) => {
      state.write = answer
    },
    setUpload: (side, answer) => {
      state.upload[side] = answer
    },
    setDelete: (answer) => {
      state.delete = answer
    },
  }
  return { server, handlers, ready: () => (state.ready = true) }
}

const section = (): HTMLElement => screen.getByRole("region", { name: "Insurance" })
const frame = (): HTMLElement | null => section().querySelector('[data-slot="state-frame"]')
const drawer = (): HTMLElement => screen.getByRole("dialog")
const headerAdd = (): HTMLElement => within(section().querySelector('[data-slot="section-header"]') as HTMLElement).getByRole("button", { name: "Add insurance" })
const cardOf = (title: string): HTMLElement => within(section()).getByRole("article", { name: title })
const slot = (side: "Front" | "Back"): HTMLElement => within(within(drawer()).getByRole("group", { name: "Card images" })).getByRole("group", { name: side })
const slotInput = (side: "front" | "back"): HTMLInputElement => within(drawer()).getByTestId(`insurance-card-input-${side}`)

async function renderSection(list: Wire[] = []) {
  const { server, handlers, ready } = makeServer(page(list))
  const result = renderInPage(
    <>
      <InsuranceSection />
      <LeaveGuard />
    </>,
    { page: "profile", handlers, myself: myselfWire({ firstName: "Avery", lastName: "Lee", email: "avery@example.com" }) },
  )
  await waitFor(() => expect(frame()?.getAttribute("data-state")).toBe("ready"))
  ready()
  return { ...result, server }
}

function control(label: string): HTMLElement {
  const matches = within(drawer())
    .getAllByLabelText(new RegExp(`^${label}( \\(optional\\))?$`))
    .filter((element) => element.getAttribute("role") !== "listbox")
  if (matches.length !== 1) throw new Error(`expected one control labelled ${label}, found ${matches.length}`)
  return matches[0]
}

async function click(element: HTMLElement) {
  await act(async () => fireEvent.click(element))
}

async function type(label: string, value: string) {
  await act(async () => fireEvent.change(control(label), { target: { value } }))
}

async function pick(label: string, name: string) {
  await act(async () => fireEvent.keyDown(control(label), { key: "Enter" }))
  await act(async () => fireEvent.click(await screen.findByRole("option", { name })))
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull())
}

async function openAdd() {
  const add = headerAdd()
  add.focus()
  await click(add)
  await screen.findByRole("dialog", { name: "Add insurance" })
  await waitFor(() => expect(control("Type").getAttribute("aria-busy")).toBeNull())
}

async function openEdit(policyName: string) {
  const kebab = within(section()).getByRole("button", { name: `More actions for ${policyName}` })
  kebab.focus()
  await act(async () => fireEvent.keyDown(kebab, { key: "Enter" }))
  await click(await screen.findByRole("menuitem", { name: "Edit" }))
  await screen.findByRole("dialog", { name: "Edit insurance" })
  await waitFor(() => expect(control("Type").getAttribute("aria-busy")).toBeNull())
}

/** A valid Self policy with a new insurer by name (no search needed): Acme Health, Medical, Primary, Self, XKH123. */
async function fillSelf() {
  await type("Insurer", "Acme Health")
  await click(await screen.findByRole("option", { name: "Add “Acme Health”" }, { timeout: 2000 }))
  await pick("Type", "Medical")
  await pick("Precedence", "Primary")
  await pick("Relationship", "Self")
  await type("Member ID", "XKH123")
  await type("Effective date", "01012025")
}

async function save() {
  await click(within(drawer()).getByRole("button", { name: "Save" }))
}

const be = (value: number, length: 2 | 4): number[] => Array.from({ length }, (_, index) => (value >> (8 * (length - 1 - index))) & 0xff)
/** A PNG signature and IHDR declaring the current `pixels` (the check reads the size from the header). */
const pngBytes = (): number[] => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...be(pixels.width, 4), ...be(pixels.height, 4), 8, 2, 0, 0, 0]
/** A JPEG SOI and SOF0 declaring the current `pixels`. */
const jpegBytes = (): number[] => [0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, ...be(pixels.height, 2), ...be(pixels.width, 2), 3, 0, 0, 0, 0, 0, 0, 0, 0, 0]

/** A chosen file: a PNG or JPEG header of the current `pixels` (or an SVG), its MIME type and, optionally, a reported size. */
function file(name: string, { kind = "png", type, size }: { kind?: "png" | "jpeg" | "svg"; type?: string; size?: number } = {}): File {
  const bytes = kind === "png" ? pngBytes() : kind === "jpeg" ? jpegBytes() : [...new TextEncoder().encode("<svg/>")]
  const made = new File([new Uint8Array(bytes)], name, { type: type ?? (kind === "png" ? "image/png" : kind === "jpeg" ? "image/jpeg" : "image/svg+xml") })
  if (size !== undefined) Object.defineProperty(made, "size", { value: size })
  return made
}

/** Picks `chosen` in an `<input type="file">` (the hidden one a slot's or Retry's button opens) and lets the check finish. */
async function choose(input: HTMLInputElement, chosen: File) {
  await act(async () => fireEvent.change(input, { target: { files: [chosen] } }))
  await act(async () => {
    await Promise.resolve()
  })
}

const ENCODED = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xdb])], { type: "image/jpeg" })
let pixels = { width: 1600, height: 1000 }
let objectUrls = 0
const revoked: string[] = []

beforeEach(() => {
  stubViewport(1024)
  stubLayoutApis()
  vi.mocked(toastSuccess).mockClear()
  vi.mocked(toastError).mockClear()
  vi.mocked(toastPartial).mockClear()
  vi.mocked(reencodeImage).mockReset()
  vi.mocked(reencodeImage).mockResolvedValue({ ok: true, blob: ENCODED, width: 1600, height: 1000 })
  pixels = { width: 1600, height: 1000 }
  objectUrls = 0
  revoked.length = 0
  // jsdom has no object URLs: the previews get numbered ones.
  Object.assign(URL, {
    createObjectURL: vi.fn(() => `blob:preview-${(objectUrls += 1)}`),
    revokeObjectURL: vi.fn((url: string) => void revoked.push(url)),
  })
})
afterEach(() => {
  clearInsurancePendingCards()
  document.documentElement.classList.remove("dark")
})

describe("Card images: the editor's slots", () => {
  it("below the Subscriber group: the heading, the rules line, and two empty Front / Back slots with their own pickers", async () => {
    await renderSection()
    await openAdd()
    const group = within(drawer()).getByRole("group", { name: "Card images" })
    expect(group.getAttribute("data-slot")).toBe("insurance-card-images")
    expect(within(group).getByText("PNG or JPEG, up to 10 MB. Images upload after the policy saves.")).toBeTruthy()
    expect(within(group).getAllByRole("group").map((element) => document.getElementById(element.getAttribute("aria-labelledby") ?? "")?.textContent)).toEqual(["Front", "Back"])
    expect(group.querySelector(".md\\:grid-cols-2")).not.toBeNull()
    for (const [side, name] of [["Front", "Choose front image"], ["Back", "Choose back image"]] as const) {
      expect(within(slot(side)).getByRole("img", { name: "No image chosen" })).toBeTruthy()
      expect(within(slot(side)).getByRole("button", { name }).className).toContain("h-11")
    }
    for (const side of ["front", "back"] as const) {
      expect(slotInput(side).getAttribute("accept")).toBe("image/png,image/jpeg")
      expect(slotInput(side).hidden).toBe(true)
    }
    // Each button opens its own side's input.
    const clicks = vi.spyOn(slotInput("back"), "click")
    await click(within(slot("Back")).getByRole("button", { name: "Choose back image" }))
    expect(clicks).toHaveBeenCalledTimes(1)
  })

  it("a chosen file: its preview, \"{name} · {size}\", Replace and Remove; Remove clears only the choice (no request), focus on Choose", async () => {
    const { server } = await renderSection()
    await openAdd()
    await choose(slotInput("front"), file("front.png", { size: 2 * 1024 * 1024 }))
    const front = slot("Front")
    expect(within(front).getByRole("img", { name: "Chosen front image" }).getAttribute("src")).toBe("blob:preview-1")
    expect(within(front).getByText("front.png · 2.0 MB")).toBeTruthy()
    const replace = within(front).getByRole("button", { name: "Replace front image" })
    expect(replace.textContent).toBe("Replace")
    const remove = within(front).getByRole("button", { name: "Remove front image" })
    expect(remove.textContent).toBe("Remove")
    expect(within(slot("Back")).getByRole("button", { name: "Choose back image" })).toBeTruthy()
    // Replacing the choice revokes the old preview.
    await choose(slotInput("front"), file("other.jpg", { kind: "jpeg", size: 300 * 1024 }))
    expect(within(front).getByText("other.jpg · 300 KB")).toBeTruthy()
    expect(revoked).toEqual(["blob:preview-1"])
    await click(within(front).getByRole("button", { name: "Remove front image" }))
    expect(within(front).getByRole("img", { name: "No image chosen" })).toBeTruthy()
    expect(document.activeElement).toBe(within(front).getByRole("button", { name: "Choose front image" }))
    expect(revoked).toEqual(["blob:preview-1", "blob:preview-2"])
    expect(server.log).toEqual([])
  })

  it.each([
    ["card.svg (type)", () => file("card.svg", { kind: "svg" }), "card.svg isn't a PNG or JPEG image."],
    ["a 12 MB jpg (size)", () => file("big.jpg", { kind: "jpeg", size: 12 * 1024 * 1024 }), "big.jpg is 12.0 MB. Choose a file up to 10 MB."],
    [
      "an 8000 × 3000 png (dimensions)",
      () => {
        pixels = { width: 8000, height: 3000 }
        return file("wide.png")
      },
      "wide.png is larger than 6000 × 4000 pixels.",
    ],
    [
      "an undecodable png (re-encode)",
      () => {
        vi.mocked(reencodeImage).mockResolvedValue({ ok: false, reason: "UNDECODABLE" })
        return file("broken.png")
      },
      "broken.png couldn't be used. Choose another file.",
    ],
  ])("rejects %s inline, naming the file; the slot keeps its previous state; nothing is sent", async (_label, make, message) => {
    const { server } = await renderSection()
    await openAdd()
    await choose(slotInput("back"), file("first.png", { size: 1024 }))
    await choose(slotInput("back"), make())
    const back = slot("Back")
    expect(within(back).getByRole("alert").textContent).toBe(message)
    expect(within(back).getByText("first.png · 1 KB")).toBeTruthy()
    expect(within(back).getByRole("button", { name: "Replace back image" }).getAttribute("aria-describedby")).toBe(
      within(back).getByRole("alert").querySelector('[data-slot="field-error"]')?.id,
    )
    // A good file clears the error.
    vi.mocked(reencodeImage).mockResolvedValue({ ok: true, blob: ENCODED, width: 10, height: 10 })
    pixels = { width: 10, height: 10 }
    await choose(slotInput("back"), file("good.png", { size: 1024 }))
    expect(within(back).getByRole("alert").textContent).toBe("")
    expect(server.log).toEqual([])
  })

  it("Edit: a saved image shows its thumbnail with Replace; a side without one shows the empty tile", async () => {
    await renderSection([wire({ frontSideCardFile: { id: 900 } })])
    await openEdit("Blue Shield Medical Insurance")
    const front = slot("Front")
    expect(within(front).getByRole("img", { name: "Front of Blue Shield Medical Insurance card" }).getAttribute("src")).toBe(
      "/api/1h/v2/health/insurance/55/file/900/download?fileRelKey=InsuranceHasFrontSideCardFile",
    )
    expect(within(front).getByRole("button", { name: "Replace front image" })).toBeTruthy()
    expect(within(front).queryByRole("button", { name: "Remove front image" })).toBeNull()
    expect(within(slot("Back")).getByRole("button", { name: "Choose back image" })).toBeTruthy()
  })

  it("a chosen image makes the editor dirty (guard row): Escape asks; Discard drops it and frees its preview", async () => {
    await renderSection([wire()])
    await openEdit("Blue Shield Medical Insurance")
    await choose(slotInput("front"), file("front.png"))
    await act(async () => fireEvent.keyDown(control("Member ID"), { key: "Escape" }))
    await click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Discard" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(revoked).toEqual(["blob:preview-1"])
    // Opened again: the slots start empty.
    await openEdit("Blue Shield Medical Insurance")
    expect(within(slot("Front")).getByRole("button", { name: "Choose front image" })).toBeTruthy()
  })

  it("a check still running when the drawer closes is dropped", async () => {
    await renderSection([wire()])
    await openEdit("Blue Shield Medical Insurance")
    let finish: (result: ReencodeResult) => void = () => undefined
    vi.mocked(reencodeImage).mockReturnValue(new Promise((resolve) => (finish = resolve)))
    await choose(slotInput("front"), file("slow.png"))
    expect(within(slot("Front")).getByRole("button", { name: "Choose front image" }).getAttribute("aria-busy")).toBe("true")
    // Clean (the check hasn't kept anything yet): Escape closes at once.
    await act(async () => fireEvent.keyDown(control("Member ID"), { key: "Escape" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await act(async () => finish({ ok: true, blob: ENCODED, width: 1, height: 1 }))
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })
})

describe("Card images: a check that ends after the Section unmounts", () => {
  it("keeps nothing: no object URL is created", async () => {
    const { unmount } = await renderSection()
    await openAdd()
    let finish: (result: ReencodeResult) => void = () => undefined
    vi.mocked(reencodeImage).mockReturnValue(new Promise((resolve) => (finish = resolve)))
    await choose(slotInput("front"), file("slow.png"))
    unmount()
    await act(async () => finish({ ok: true, blob: ENCODED, width: 1, height: 1 }))
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })
})

describe("Card images: the save (policy first, then front, then back)", () => {
  it("Add with both images: POST, then front, then back (no query); \"Insurance saved.\"; the list refetches", async () => {
    const { server } = await renderSection()
    await openAdd()
    await fillSelf()
    await choose(slotInput("front"), file("front.png"))
    await choose(slotInput("back"), file("back.jpg", { kind: "jpeg" }))
    server.setList(page([wire({ id: 60, frontSideCardFile: { id: 950 }, backSideCardFile: { id: 951 } })]))
    await save()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(server.log).toEqual(["POST", "upload 60 front", "upload 60 back", "list"])
    expect(server.uploadQueries).toEqual(["", ""])
    expect(toastSuccess).toHaveBeenCalledWith("Insurance saved.")
    expect(toastPartial).not.toHaveBeenCalled()
    const card = await waitFor(() => cardOf("Medical Insurance"))
    expect(within(card).getByRole("button", { name: "Front of Blue Shield Medical Insurance card" })).toBeTruthy()
    expect(within(card).queryByRole("button", { name: /^Retry upload/ })).toBeNull()
  })

  it("a file chosen just before Save still goes with it (the save waits for its check)", async () => {
    const { server } = await renderSection()
    await openAdd()
    await fillSelf()
    let finish: (result: ReencodeResult) => void = () => undefined
    vi.mocked(reencodeImage).mockReturnValue(new Promise((resolve) => (finish = resolve)))
    await choose(slotInput("front"), file("front.png"))
    await save()
    expect(server.log).toEqual([])
    await act(async () => finish({ ok: true, blob: ENCODED, width: 1, height: 1 }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(server.log).toEqual(["POST", "upload 60 front", "list"])
  })

  it("a file chosen just before Save that is refused stops the save: nothing is sent, the inline error shows, focus on the slot's Choose", async () => {
    const { server } = await renderSection()
    await openAdd()
    await fillSelf()
    let finish: (result: ReencodeResult) => void = () => undefined
    vi.mocked(reencodeImage).mockReturnValue(new Promise((resolve) => (finish = resolve)))
    await choose(slotInput("front"), file("front.png"))
    await save()
    await act(async () => finish({ ok: false, reason: "UNDECODABLE" }))
    const front = slot("Front")
    await waitFor(() => expect(within(front).getByRole("alert").textContent).toBe("front.png couldn't be used. Choose another file."))
    expect(screen.getByRole("dialog", { name: "Add insurance" })).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(within(front).getByRole("button", { name: "Choose front image" })))
    expect(server.log).toEqual([])
    expect(toastSuccess).not.toHaveBeenCalled()
    // Saving again (nothing pending now) goes on.
    await save()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(server.log).toEqual(["POST", "list"])
  })

  it("an upload that ends the session shows no toast (the shell's session dialog takes over); the policy stays saved", async () => {
    const { server } = await renderSection()
    await openAdd()
    await fillSelf()
    await choose(slotInput("front"), file("front.png"))
    server.setUpload("front", json({ errorCode: "SESSION_EXPIRED", source: "proxy" }, 401))
    await save()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(server.log).toEqual(["POST", "upload 60 front", "list"])
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(toastPartial).not.toHaveBeenCalled()
    expect(toastError).not.toHaveBeenCalled()
  })

  it("back upload fails (500): the policy stays saved, the drawer closes, the partial toast; the card's back is the tile with Retry", async () => {
    const { server } = await renderSection()
    await openAdd()
    await fillSelf()
    await choose(slotInput("front"), file("front.png"))
    await choose(slotInput("back"), file("back.png"))
    server.setUpload("back", json({ message: "Boom", code: 500 }, 500))
    server.setList(page([wire({ id: 60, frontSideCardFile: { id: 950 } })]))
    await save()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(server.log).toEqual(["POST", "upload 60 front", "upload 60 back", "list"])
    expect(toastPartial).toHaveBeenCalledWith("Insurance saved. Back image not uploaded.")
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(insurancePendingCard(60, "back")).toEqual({ blob: ENCODED, name: "back.png", oldFileId: null })
    const card = await waitFor(() => cardOf("Medical Insurance"))
    expect(within(card).getByRole("img", { name: "Back image not uploaded" }).textContent).toBe("Image not uploaded")
    const retry = within(card).getByRole("button", { name: "Retry upload of the back image" })
    expect(retry.textContent).toBe("Retry upload")
    expect(retry.className).toContain("text-link-text")
    expect(retry.className).toContain("h-11")
    expect(within(card).queryByRole("button", { name: "Retry upload of the front image" })).toBeNull()
  })

  it("both uploads fail: \"Insurance saved. Card images not uploaded.\"; front fails: \"… Front image not uploaded.\"", async () => {
    const { server } = await renderSection()
    await openAdd()
    await fillSelf()
    await choose(slotInput("front"), file("front.png"))
    await choose(slotInput("back"), file("back.png"))
    server.setUpload("front", () => HttpResponse.error())
    server.setUpload("back", json({ message: "Boom" }, 502))
    await save()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(toastPartial).toHaveBeenCalledWith("Insurance saved. Card images not uploaded.")
    server.setUpload("back", json({ id: 1 }))
    await openAdd()
    await fillSelf()
    await choose(slotInput("front"), file("front.png"))
    await choose(slotInput("back"), file("back.png"))
    await save()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(toastPartial).toHaveBeenLastCalledWith("Insurance saved. Front image not uploaded.")
  })

  it.each([
    [413, "TOO_LARGE"],
    [415, "UNSUPPORTED_MEDIA"],
  ])("a rejected upload (%i %s) names the file as not usable; that image is dropped, no Retry", async (status, errorCode) => {
    const { server } = await renderSection()
    await openAdd()
    await fillSelf()
    await choose(slotInput("front"), file("front.png"))
    server.setUpload("front", json({ errorCode, source: "proxy" }, status))
    server.setList(page([wire({ id: 60 })]))
    await save()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(toastPartial).toHaveBeenCalledWith("Insurance saved. front.png couldn't be used. Choose another file.")
    expect(insurancePendingCard(60, "front")).toBeUndefined()
    const card = await waitFor(() => cardOf("Medical Insurance"))
    expect(within(card).queryByRole("button", { name: /^Retry upload/ })).toBeNull()
  })

  it("a POST answer without an id: nothing can upload; the toast says so (no Retry)", async () => {
    const { server } = await renderSection()
    server.setWrite(json({}))
    await openAdd()
    await fillSelf()
    await choose(slotInput("back"), file("back.png"))
    await save()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(server.log).toEqual(["POST", "list"])
    expect(toastPartial).toHaveBeenCalledWith("Insurance saved. Back image not uploaded.")
  })

  it("a failed policy save uploads nothing; the drawer stays open with the image", async () => {
    const { server } = await renderSection()
    server.setWrite(json({ message: "Boom", code: 500 }, 500))
    await openAdd()
    await fillSelf()
    await choose(slotInput("front"), file("front.png"))
    await save()
    await waitFor(() => expect(drawer().querySelector('[data-slot~="insurance-save-error"]')).not.toBeNull())
    expect(server.log).toEqual(["POST"])
    expect(within(slot("Front")).getByRole("img", { name: "Chosen front image" })).toBeTruthy()
  })

  it("Replace: PUT, upload the new front, then delete the old file through the named op", async () => {
    const { server } = await renderSection([wire({ frontSideCardFile: { id: 900 }, backSideCardFile: { id: 901 } })])
    await openEdit("Blue Shield Medical Insurance")
    await choose(slotInput("front"), file("new-front.png"))
    await save()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(server.log).toEqual(["PUT 55", "upload 55 front", "DELETE 900", "list"])
    expect(toastSuccess).toHaveBeenCalledWith("Insurance saved.")
  })

  it.each([
    ["refused (404 NO_FILE)", json({ errorCode: "NO_FILE", source: "proxy" }, 404)],
    ["failed (502)", json({ errorCode: "UPSTREAM_ERROR", source: "proxy" }, 502)],
    ["a network error", () => HttpResponse.error()],
  ] as const)("Replace with the old file's delete %s: quiet; the save succeeds and the new image stays", async (_label, answer) => {
    const { server } = await renderSection([wire({ backSideCardFile: { id: 901 } })])
    server.setDelete(answer)
    await openEdit("Blue Shield Medical Insurance")
    await choose(slotInput("back"), file("new-back.png"))
    await save()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(server.log).toEqual(["PUT 55", "upload 55 back", "DELETE 901", "list"])
    expect(toastSuccess).toHaveBeenCalledWith("Insurance saved.")
    expect(toastPartial).not.toHaveBeenCalled()
    expect(toastError).not.toHaveBeenCalled()
  })

  it("a replace whose upload fails keeps the old file (no delete) and remembers it for the Retry", async () => {
    const { server } = await renderSection([wire({ frontSideCardFile: { id: 900 } })])
    server.setUpload("front", json({ message: "Boom" }, 500))
    await openEdit("Blue Shield Medical Insurance")
    await choose(slotInput("front"), file("new-front.png"))
    await save()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(server.log).toEqual(["PUT 55", "upload 55 front", "list"])
    expect(insurancePendingCard(55, "front")).toEqual({ blob: ENCODED, name: "new-front.png", oldFileId: 900 })
    // Retry: the upload, then the old file's delete.
    server.setUpload("front", json({ id: 950 }))
    await click(within(cardOf("Medical Insurance")).getByRole("button", { name: "Retry upload of the front image" }))
    await waitFor(() => expect(server.log).toEqual(["PUT 55", "upload 55 front", "list", "upload 55 front", "DELETE 900", "list"]))
  })

  it("the guard's Save runs the same flow, images included (an Edit whose only change is an image)", async () => {
    const { server } = await renderSection([wire()])
    await openEdit("Blue Shield Medical Insurance")
    await choose(slotInput("back"), file("back.png"))
    await act(async () => fireEvent.keyDown(control("Member ID"), { key: "Escape" }))
    await click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(server.log).toEqual(["PUT 55", "upload 55 back", "list"])
  })
})

describe("Card images: \"Retry upload\" on the card", () => {
  async function failedBack() {
    const { server } = await renderSection()
    await openAdd()
    await fillSelf()
    await choose(slotInput("back"), file("back.png"))
    server.setUpload("back", json({ message: "Boom" }, 500))
    server.setList(page([wire({ id: 60 })]))
    await save()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    const card = await waitFor(() => cardOf("Medical Insurance"))
    server.log.length = 0
    return { server, card, retry: () => within(card).getByRole("button", { name: "Retry upload of the back image" }) }
  }

  it("in memory: only that upload is sent; success → \"Card image uploaded.\", the refetch shows the thumbnail", async () => {
    const { server, card, retry } = await failedBack()
    server.setUpload("back", json({ id: 951 }))
    server.setList(page([wire({ id: 60, backSideCardFile: { id: 951 } })]))
    await click(retry())
    await waitFor(() => expect(toastSuccess).toHaveBeenLastCalledWith("Card image uploaded."))
    await waitFor(() => expect(server.log).toEqual(["upload 60 back", "list"]))
    await waitFor(() => expect(within(card).getByRole("button", { name: "Back of Blue Shield Medical Insurance card" })).toBeTruthy())
    expect(within(card).queryByRole("button", { name: /^Retry upload/ })).toBeNull()
    expect(insurancePendingCard(60, "back")).toBeUndefined()
  })

  it("a failed Retry keeps the tile and shows the error toast with Retry, which uploads again", async () => {
    const { server, retry } = await failedBack()
    await click(retry())
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1))
    expect(vi.mocked(toastError).mock.calls[0]?.[0]).toBe("Back image not uploaded.")
    expect(retry()).toBeTruthy()
    expect(server.log).toEqual(["upload 60 back"])
    server.setUpload("back", json({ id: 951 }))
    await act(async () => vi.mocked(toastError).mock.calls[0]?.[1].onRetry())
    await waitFor(() => expect(toastSuccess).toHaveBeenLastCalledWith("Card image uploaded."))
    await waitFor(() => expect(server.log).toEqual(["upload 60 back", "upload 60 back", "list"]))
  })

  it("a double trigger (the button twice, then the toast's Retry while in flight) sends one upload; the earlier error toast is dismissed", async () => {
    const { server, retry } = await failedBack()
    await click(retry())
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1))
    const failed = vi.mocked(toastError).mock.results[0]?.value as { dismiss: ReturnType<typeof vi.fn> }
    // Held at the write's fresh `myself` check (D-A) before the upload (a held multipart response fails in jsdom).
    let release: () => void = () => undefined
    let held = 0
    mswServer.use(
      http.get("/api/1h/v2/user/myself", async () => {
        held += 1
        await new Promise<void>((resolve) => (release = resolve))
        return HttpResponse.json(myselfWire({ firstName: "Avery", lastName: "Lee", email: "avery@example.com" }))
      }),
    )
    server.setUpload("back", json({ id: 951 }))
    server.log.length = 0
    await act(async () => {
      fireEvent.click(retry())
      fireEvent.click(retry())
      void vi.mocked(toastError).mock.calls[0]?.[1].onRetry()
    })
    await waitFor(() => expect(held).toBe(1))
    expect(failed.dismiss).toHaveBeenCalled()
    expect(server.log).toEqual([])
    await act(async () => release())
    await waitFor(() => expect(toastSuccess).toHaveBeenLastCalledWith("Card image uploaded."))
    await waitFor(() => expect(server.log).toEqual(["upload 60 back", "list"]))
    expect(toastError).toHaveBeenCalledTimes(1)
  })

  it("a Retry that ends the session shows no toast", async () => {
    const { server, retry } = await failedBack()
    server.setUpload("back", json({ errorCode: "SESSION_EXPIRED", source: "proxy" }, 401))
    await click(retry())
    await waitFor(() => expect(server.log).toEqual(["upload 60 back"]))
    await act(async () => {
      await Promise.resolve()
    })
    expect(toastError).not.toHaveBeenCalled()
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it("a failed replace keeps the still-saved image (viewable) with Retry under it; with nothing saved, the tile with Retry", async () => {
    setInsurancePendingCard(55, "front", { blob: ENCODED, name: "x.png", oldFileId: 900 })
    setInsurancePendingCard(55, "back", { blob: ENCODED, name: "y.png", oldFileId: null })
    await renderSection([wire({ frontSideCardFile: { id: 900 } })])
    const card = cardOf("Medical Insurance")
    const front = card.querySelector('figure[data-side="front"]') as HTMLElement
    expect(within(front).getByRole("button", { name: "Front of Blue Shield Medical Insurance card" })).toBeTruthy()
    expect(within(front).getByRole("button", { name: "Retry upload of the front image" })).toBeTruthy()
    expect(within(front).queryByRole("img", { name: "Front image not uploaded" })).toBeNull()
    const back = card.querySelector('figure[data-side="back"]') as HTMLElement
    expect(within(back).getByRole("img", { name: "Back image not uploaded" }).textContent).toBe("Image not uploaded")
    expect(within(back).getByRole("button", { name: "Retry upload of the back image" })).toBeTruthy()
  })

  it("a rejected Retry (415) names the file as not usable and drops the image (no Retry)", async () => {
    const { server, card, retry } = await failedBack()
    server.setUpload("back", json({ errorCode: "UNSUPPORTED_MEDIA", source: "proxy" }, 415))
    await click(retry())
    await waitFor(() => expect(toastPartial).toHaveBeenLastCalledWith("back.png couldn't be used. Choose another file."))
    expect(within(card).queryByRole("button", { name: /^Retry upload/ })).toBeNull()
    expect(within(card).getAllByRole("img", { name: /image not uploaded$/ })).toHaveLength(2)
  })

  it("not in memory: Retry opens that side's file picker; the chosen file is checked (inline error), then uploads directly", async () => {
    const { server, card, retry } = await failedBack()
    act(() => setInsurancePendingCard(60, "back", { blob: null, name: "back.png", oldFileId: 77 }))
    const input = within(card).getByTestId<HTMLInputElement>("insurance-card-retry-input-back")
    expect(input.getAttribute("accept")).toBe("image/png,image/jpeg")
    const opened = vi.spyOn(input, "click")
    await click(retry())
    expect(opened).toHaveBeenCalledTimes(1)
    expect(server.log).toEqual([])
    await choose(input, file("card.svg", { kind: "svg" }))
    await waitFor(() => expect(within(card).getByRole("alert").textContent).toBe("card.svg isn't a PNG or JPEG image."))
    expect(retry().getAttribute("aria-describedby")).toBe(within(card).getByRole("alert").querySelector('[data-slot="field-error"]')?.id)
    expect(server.log).toEqual([])
    server.setUpload("back", json({ id: 951 }))
    await choose(input, file("again.png"))
    await waitFor(() => expect(toastSuccess).toHaveBeenLastCalledWith("Card image uploaded."))
    await waitFor(() => expect(server.log).toEqual(["upload 60 back", "DELETE 77", "list"]))
  })

  it("a Deleted card or a side without a failure shows no Retry", async () => {
    setInsurancePendingCard(57, "front", { blob: ENCODED, name: "x.png", oldFileId: null })
    const { server } = await renderSection([wire({ id: 57, label: "Deleted", insuranceType: "DENTAL" }), wire()])
    expect(within(cardOf("Dental Insurance")).queryByRole("button", { name: /^Retry upload/ })).toBeNull()
    expect(within(cardOf("Medical Insurance")).queryByRole("button", { name: /^Retry upload/ })).toBeNull()
    act(() => setInsurancePendingCard(55, "front", { blob: ENCODED, name: "x.png", oldFileId: null }))
    expect(within(cardOf("Medical Insurance")).getByRole("button", { name: "Retry upload of the front image" })).toBeTruthy()
    expect(server.log).toEqual([])
  })
})

describe("Card images: accessibility", () => {
  it.each(["light", "dark"] as const)("has no axe violations in %s mode: the drawer with a chosen image and an error, and a card with Retry", async (theme) => {
    if (theme === "dark") document.documentElement.classList.add("dark")
    setInsurancePendingCard(55, "back", { blob: ENCODED, name: "back.png", oldFileId: null })
    await renderSection([wire({ frontSideCardFile: { id: 900 } })])
    expect(within(cardOf("Medical Insurance")).getByRole("button", { name: "Retry upload of the back image" })).toBeTruthy()
    expect(await axeViolations()).toEqual([])
    await openEdit("Blue Shield Medical Insurance")
    await choose(slotInput("back"), file("back.png"))
    await choose(slotInput("front"), file("card.svg", { kind: "svg" }))
    expect(await axeViolations()).toEqual([])
  })

  it("at 360 px the slots stack (two columns only from 768 px)", async () => {
    stubViewport(360)
    await renderSection()
    await openAdd()
    const grid = slot("Front").parentElement
    expect(grid?.className).toContain("md:grid-cols-2")
    expect(grid?.className).not.toMatch(/(^| )grid-cols-2/)
  })
})
