import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse, type JsonBodyType } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { reencodeImage } from "@/components/ui/image-reencode"
import { LeaveGuard, toastError, toastPartial, toastSuccess } from "@/features/shell"
import { saveInsuranceCreate } from "@/lib/api"
import { setTelemetrySink, type TelemetryEvents } from "@/lib/shared/telemetry"
import { axeViolations } from "@/test/axe"
import { stubLayoutApis } from "@/test/dom-stubs"
import { stubViewport } from "@/test/media"
import { myselfWire } from "@/test/myself-fixture"
import { renderInPage } from "@/test/providers"
import { InsuranceSection } from "."
import { clearInsurancePendingCards } from "./pending-cards"

// The editor's toasts, observed (the shell's toast API; nothing renders a Toaster here).
vi.mock("@/features/shell/toasts", () => ({ toastSuccess: vi.fn(), toastError: vi.fn(() => ({ id: "t", dismiss: vi.fn() })), toastPartial: vi.fn() }))
// The canvas re-encode is the browser's (e2e); here it answers a small JPEG.
vi.mock("@/components/ui/image-reencode", async (original) => ({ ...(await original<object>()), reencodeImage: vi.fn() }))

// The policy POST, observed: one test makes it throw (an unexpected failure after a demotion); it calls through otherwise.
vi.mock("@/lib/api", async (original) => {
  const actual = await original<typeof import("@/lib/api")>()
  return { ...actual, saveInsuranceCreate: vi.fn(actual.saveInsuranceCreate) }
})

vi.setConfig({ testTimeout: 20_000 })

/**
 * Story 5.4 (NG-9029): one Primary policy per type, on `/` the way
 * `PageFrame` hosts the Section (`renderInPage` plus the page's `LeaveGuard`,
 * MSW at `/api`). Covers every row of the I/O matrix in
 * `spec-5-4-primary-per-type-with-demote-offer.md`: the banner (same type
 * only, Deleted ignored, the edited Primary, a type change, legacy data),
 * the acceptance, Save blocked without it (own Save and the guard's), the
 * list read again at send time (a demotion is built from it, and a Primary
 * nobody accepted stops the save; it is the first "list" of a save's log),
 * the request order (demotions, then the policy, then the images; decision 1A),
 * the failures with their rollback (decision 2A) and Retry, and axe in light
 * and dark.
 */

const LIST = "/api/1h/v2/health/patient/insurance"
const POLICY = "/api/1h/v2/health/patient/insurance/:id"
const TYPE_KEY_PATH = "/api/1h/v2/type/key/Insurance"
const ORGS = "/api/1h/v2/health/insurance/organizations"
const UPLOAD = "/api/1h/v2/health/type/Insurance/:id/relation/:relation/file/upload"

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

/** A backend `ResponseInsuranceDTO`: by default Blue Shield, an active Primary Medical, Self. */
const wire = (overrides: Wire = {}): Wire => ({
  id: 55,
  memberIdNumber: "948221037",
  insuranceType: "MEDICAL",
  planEffectiveDate: "2025-01-01",
  insuranceOrganizationDTO: { insuranceCompanyName: "Blue Shield", insuranceCompanyId: 7 },
  insuranceGroupId: "704512",
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

const BLUE = wire()
const DELTA = wire({ id: 56, insuranceType: "DENTAL", memberIdNumber: "D-5521", insuranceOrganizationDTO: { insuranceCompanyName: "Delta Dental", insuranceCompanyId: 9 } })
const AETNA = wire({ id: 57, memberIdNumber: "AET-1", insuranceOrganizationDTO: { insuranceCompanyName: "Aetna", insuranceCompanyId: 11 } })
const CIGNA = wire({ id: 58, memberIdNumber: "CIG-1", insuranceOrganizationDTO: { insuranceCompanyName: "Cigna", insuranceCompanyId: 12 } })

const json = (body: unknown, status = 200): Answer => () => HttpResponse.json(body as JsonBodyType, { status })
const fail = (message: string, status = 400): Answer => json({ message, code: status }, status)
const page = (rows: Wire[]): Answer => json({ data: rows, lastPage: true })

interface Server {
  /** Every write and refetch in order: `PUT 55 SECONDARY`, `POST`, `PUT 55 PRIMARY`, `upload 60 front`, `list`. */
  readonly log: string[]
  /** The `PUT` bodies, in order. */
  readonly puts: { readonly id: string; readonly body: Wire }[]
  setList: (answer: Answer) => void
  setPost: (answer: Answer) => void
  /** The answers of `PUT {id}` with the given precedence, in turn (the last one repeats); default 200. */
  setPut: (id: number, precedence: "PRIMARY" | "SECONDARY", ...answers: Answer[]) => void
}

function makeServer(list: Answer) {
  const log: string[] = []
  const puts: { id: string; body: Wire }[] = []
  const state: { list: Answer; post: Answer; put: Map<string, Answer[]>; ready: boolean } = { list, post: json({ id: 60 }), put: new Map(), ready: false }
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
      return state.post()
    }),
    http.put(POLICY, async ({ params, request }) => {
      const body = (await request.json()) as Wire
      const id = String(params.id)
      puts.push({ id, body })
      const key = `${id} ${String(body.insurancePrecedence)}`
      log.push(`PUT ${key}`)
      const answers = state.put.get(key) ?? []
      const answer = answers.length > 1 ? answers.shift() : answers[0]
      return (answer ?? json({ id: Number(id) }))()
    }),
    http.post(UPLOAD, ({ params }) => {
      log.push(`upload ${String(params.id)} ${String(params.relation) === "InsuranceHasFrontSideCardFile" ? "front" : "back"}`)
      return HttpResponse.json({ id: 950 })
    }),
  ]
  const server: Server = {
    log,
    puts,
    setList: (answer) => {
      state.list = answer
    },
    setPost: (answer) => {
      state.post = answer
    },
    setPut: (id, precedence, ...answers) => {
      state.put.set(`${id} ${precedence}`, answers)
    },
  }
  return { server, handlers, ready: () => (state.ready = true) }
}

const section = (): HTMLElement => screen.getByRole("region", { name: "Insurance" })
const frame = (): HTMLElement | null => section().querySelector('[data-slot="state-frame"]')
const drawer = (): HTMLElement => screen.getByRole("dialog")
const headerAdd = (): HTMLElement => within(section().querySelector('[data-slot="section-header"]') as HTMLElement).getByRole("button", { name: "Add insurance" })
const offer = (): HTMLElement | null => drawer().querySelector('[data-slot="insurance-demotion"]')
const demote = (insurer = "Blue Shield"): HTMLElement => within(drawer()).getByRole("button", { name: `Make ${insurer} secondary` })
const errorLine = (): string | null => offer()?.querySelector('[data-slot="field-error"]')?.textContent ?? null
const note = (): HTMLElement | null => drawer().querySelector('[data-slot="insurance-demotion-note"]')
const saveError = (): HTMLElement | null => drawer().querySelector('[data-slot~="insurance-save-error"]')
/** The list answers `before` until the log holds `entry`, then `after`. */
const listAfter = (server: Server, entry: string, after: Wire[], before: Wire[]): Answer => () => page(server.log.includes(entry) ? after : before)()
const SESSION_ENDED = json({ errorCode: "SESSION_EXPIRED", source: "proxy" }, 401)

/** The drawer error's sentence (its live region; the Retry button sits outside it). */
const saveErrorText = (): string | null => saveError()?.querySelector('[role="alert"]')?.textContent ?? null
const chips = (): string[] => [...section().querySelectorAll('[data-slot="chip"]')].map((chip) => chip.textContent ?? "")

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

/** A valid Self policy with a new insurer by name: Acme Health, `type`, Primary, Self, XKH123. */
async function fillSelf(typeName = "Medical") {
  await type("Insurer", "Acme Health")
  await click(await screen.findByRole("option", { name: "Add “Acme Health”" }, { timeout: 2000 }))
  await pick("Type", typeName)
  await pick("Precedence", "Primary")
  await pick("Relationship", "Self")
  await type("Member ID", "XKH123")
  await type("Effective date", "01012025")
}

async function save() {
  await click(within(drawer()).getByRole("button", { name: "Save" }))
}

/** Adds Acme Health as Primary Medical with the demotion of Blue Shield accepted. */
async function addAccepted() {
  await openAdd()
  await fillSelf()
  await click(demote())
}

const be = (value: number, length: 2 | 4): number[] => Array.from({ length }, (_, index) => (value >> (8 * (length - 1 - index))) & 0xff)
/** A small PNG header (the card check reads the size from it; the re-encode is mocked). */
const pngFile = (name: string): File =>
  new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...be(800, 4), ...be(500, 4), 8, 2, 0, 0, 0])], name, {
    type: "image/png",
  })

let tracked: TelemetryEvents["section_save"][] = []
let restoreSink: () => void = () => undefined

beforeEach(() => {
  stubViewport(1024)
  stubLayoutApis()
  vi.mocked(toastSuccess).mockClear()
  vi.mocked(toastError).mockClear()
  vi.mocked(toastPartial).mockClear()
  vi.mocked(reencodeImage).mockReset()
  vi.mocked(reencodeImage).mockResolvedValue({ ok: true, blob: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xdb])], { type: "image/jpeg" }), width: 800, height: 500 })
  Object.assign(URL, { createObjectURL: vi.fn(() => "blob:preview"), revokeObjectURL: vi.fn() })
  tracked = []
  restoreSink = setTelemetrySink((event, payload) => {
    if (event === "section_save") tracked.push(payload as TelemetryEvents["section_save"])
  })
})
afterEach(() => {
  restoreSink()
  clearInsurancePendingCards()
  document.documentElement.classList.remove("dark")
})

describe("Primary per type: the banner", () => {
  it("Add, Medical + Primary while Blue Shield is Primary Medical: the info banner right after Type + Precedence, its outline button", async () => {
    await renderSection([BLUE])
    await openAdd()
    await pick("Type", "Medical")
    expect(offer()).toBeNull()
    await pick("Precedence", "Primary")
    const banner = offer()?.querySelector('[data-slot~="insurance-demotion-banner"]') as HTMLElement
    expect(banner.getAttribute("data-variant")).toBe("info")
    expect(within(banner).getByRole("status").textContent).toBe("Only one primary Medical policy. Make Blue Shield secondary?")
    const button = demote()
    expect(banner.contains(button)).toBe(true)
    expect(within(banner).getByRole("status").contains(button)).toBe(false)
    expect(button.getAttribute("aria-pressed")).toBe("false")
    expect(button.className).toContain("min-h-11")
    expect(button.className).toContain("border")
    // Between the Type + Precedence pair and Relationship.
    const precedence = control("Precedence")
    const relationship = control("Relationship")
    expect(precedence.compareDocumentPosition(offer() as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect((offer() as HTMLElement).compareDocumentPosition(relationship) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(note()).toBeNull()
    expect(errorLine()).toBeNull()
  })

  it.each([
    ["only a Dental Primary", [DELTA]],
    ["the Medical Primary is Deleted", [wire({ label: "Deleted" })]],
    ["the Medical policy is Secondary", [wire({ insurancePrecedence: "SECONDARY" })]],
  ])("no banner and no demotion: %s", async (_label, list) => {
    const { server } = await renderSection(list)
    await openAdd()
    await fillSelf()
    expect(offer()).toBeNull()
    await save()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(server.log).toEqual(["POST", "list"])
  })

  it("Edit of the current Primary, Primary Medical kept: no banner; the PUT goes alone", async () => {
    const { server } = await renderSection([BLUE])
    await openEdit("Blue Shield Medical Insurance")
    expect(offer()).toBeNull()
    await type("Member ID", "948221038")
    await save()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(server.log).toEqual(["PUT 55 PRIMARY", "list"])
  })

  it("Edit of a Primary Dental changed to Medical: the banner for Blue Shield", async () => {
    await renderSection([BLUE, DELTA])
    await openEdit("Delta Dental Dental Insurance")
    expect(offer()).toBeNull()
    await pick("Type", "Medical")
    expect(within(offer() as HTMLElement).getByRole("status").textContent).toBe("Only one primary Medical policy. Make Blue Shield secondary?")
  })

  it("legacy data, Aetna and Cigna both Primary Medical: the banner names both; Save demotes both, then saves", async () => {
    const { server } = await renderSection([AETNA, CIGNA])
    await openAdd()
    await fillSelf()
    expect(within(offer() as HTMLElement).getByRole("status").textContent).toBe("Only one primary Medical policy. Make Aetna and Cigna secondary?")
    await click(demote("Aetna and Cigna"))
    await save()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(server.log).toEqual(["list", "PUT 57 SECONDARY", "PUT 58 SECONDARY", "POST", "list"])
  })

  it("the same insurer twice is named once", async () => {
    await renderSection([AETNA, wire({ ...CIGNA, insuranceOrganizationDTO: { insuranceCompanyName: "Aetna", insuranceCompanyId: 11 } })])
    await openAdd()
    await fillSelf()
    expect(within(offer() as HTMLElement).getByRole("status").textContent).toBe("Only one primary Medical policy. Make Aetna secondary?")
  })
})

describe("Primary per type: the acceptance", () => {
  it("pressing the button accepts (aria-pressed, the note); pressing again takes it back", async () => {
    await renderSection([BLUE])
    await openAdd()
    await fillSelf()
    await click(demote())
    expect(demote().getAttribute("aria-pressed")).toBe("true")
    expect(note()?.textContent).toBe("The change saves with this policy.")
    expect(demote().getAttribute("aria-describedby")).toBe(note()?.id)
    await click(demote())
    expect(demote().getAttribute("aria-pressed")).toBe("false")
    expect(note()).toBeNull()
  })

  it("changing Precedence re-evaluates: the banner goes, and back on Primary it is not accepted any more", async () => {
    const { server } = await renderSection([BLUE])
    await addAccepted()
    await pick("Precedence", "Secondary")
    expect(offer()).toBeNull()
    await pick("Precedence", "Primary")
    expect(demote().getAttribute("aria-pressed")).toBe("false")
    expect(server.log).toEqual([])
  })

  it("changing Type clears the acceptance too (Medical → Dental → Medical)", async () => {
    await renderSection([BLUE, DELTA])
    await addAccepted()
    await pick("Type", "Dental")
    expect(within(offer() as HTMLElement).getByRole("status").textContent).toBe("Only one primary Dental policy. Make Delta Dental secondary?")
    expect(demote("Delta Dental").getAttribute("aria-pressed")).toBe("false")
    await pick("Type", "Medical")
    expect(demote().getAttribute("aria-pressed")).toBe("false")
  })

  it("opening the editor again starts unaccepted", async () => {
    await renderSection([BLUE])
    await addAccepted()
    await act(async () => fireEvent.keyDown(control("Member ID"), { key: "Escape" }))
    await click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Discard" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await openAdd()
    await fillSelf()
    expect(demote().getAttribute("aria-pressed")).toBe("false")
  })
})

describe("Primary per type: Save without the acceptance", () => {
  it("nothing is sent, focus moves to the button, and the error line under the banner says why", async () => {
    const { server } = await renderSection([BLUE])
    await openAdd()
    await fillSelf()
    await save()
    await waitFor(() => expect(document.activeElement).toBe(demote()))
    expect(errorLine()).toBe("Only one primary Medical policy is allowed. Make Blue Shield secondary, or don't make this policy primary.")
    const errorId = offer()?.querySelector('[data-slot="field-error"]')?.id
    expect(demote().getAttribute("aria-describedby")).toBe(errorId)
    // Read once, as the button's description: not a second live region.
    expect(offer()?.querySelector('[role="alert"]')).toBeNull()
    expect(server.log).toEqual([])
    expect(tracked).toEqual([])
    // Accepting clears the line; Save then goes.
    await click(demote())
    expect(errorLine()).toBeNull()
    await save()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(server.log).toEqual(["list", "PUT 55 SECONDARY", "POST", "list"])
  })

  it("an invalid Insurer comes first (it sits above the banner); otherwise the banner's button", async () => {
    await renderSection([BLUE])
    await openAdd()
    await pick("Type", "Medical")
    await pick("Precedence", "Primary")
    await save()
    await waitFor(() => expect(document.activeElement).toBe(control("Insurer")))
    expect(errorLine()).not.toBeNull()
  })

  it("the field errors after the banner don't take the focus from it", async () => {
    await renderSection([BLUE])
    await openAdd()
    await type("Insurer", "Acme Health")
    await click(await screen.findByRole("option", { name: "Add “Acme Health”" }, { timeout: 2000 }))
    await pick("Type", "Medical")
    await pick("Precedence", "Primary")
    await save()
    await waitFor(() => expect(document.activeElement).toBe(demote()))
  })

  it("the leave guard's Save behaves the same: nothing sent, the error line, focus on the button", async () => {
    const { server } = await renderSection([BLUE])
    await openAdd()
    await fillSelf()
    await act(async () => fireEvent.keyDown(control("Member ID"), { key: "Escape" }))
    await click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    expect(screen.getByRole("dialog", { name: "Add insurance" })).toBeTruthy()
    expect(errorLine()).not.toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(demote()))
    expect(server.log).toEqual([])
  })

  it("the leave guard's Save with the acceptance runs the whole flow", async () => {
    const { server } = await renderSection([BLUE])
    await addAccepted()
    await act(async () => fireEvent.keyDown(control("Member ID"), { key: "Escape" }))
    await click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(server.log).toEqual(["list", "PUT 55 SECONDARY", "POST", "list"])
  })
})

describe("Primary per type: the save (demotions, then the policy, then the images)", () => {
  it("happy path: PUT Blue Shield SECONDARY with its current values, then the POST, then the image; the list shows the new Primary and the old Secondary", async () => {
    const { server } = await renderSection([BLUE])
    await addAccepted()
    await act(async () => fireEvent.change(within(drawer()).getByTestId("insurance-card-input-front"), { target: { files: [pngFile("front.png")] } }))
    await waitFor(() => expect(within(drawer()).getByRole("button", { name: "Remove front image" })).toBeTruthy())
    const after = [wire({ insurancePrecedence: "SECONDARY" }), wire({ id: 60, insuranceOrganizationDTO: { insuranceCompanyName: "Acme Health", insuranceCompanyId: 70 } })]
    server.setList(listAfter(server, "POST", after, [BLUE]))
    await save()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(server.log).toEqual(["list", "PUT 55 SECONDARY", "POST", "upload 60 front", "list"])
    expect(server.puts).toEqual([
      {
        id: "55",
        body: {
          insuranceOrganizationDTO: { insuranceCompanyId: 7 },
          insuranceType: "MEDICAL",
          insurancePrecedence: "SECONDARY",
          relationshipToInsured: "SELF",
          memberIdNumber: "948221037",
          insuranceGroupId: "704512",
          planEffectiveDate: "2025-01-01",
        },
      },
    ])
    expect(toastSuccess).toHaveBeenCalledWith("Insurance saved. Blue Shield is now secondary.")
    expect(tracked).toEqual([{ sectionId: "insurance", ok: true, code: null }])
    await waitFor(() => expect(chips()).toEqual(["Secondary", "Primary"]))
  })

  it("the demotion is built from the list read at send time (a newer edit of the other policy is kept)", async () => {
    const { server } = await renderSection([BLUE])
    await addAccepted()
    server.setList(page([wire({ memberIdNumber: "NEW-12345", insuranceGroupId: "n/a" })]))
    await save()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(server.puts[0].body.memberIdNumber).toBe("NEW-12345")
    expect(server.puts[0].body).not.toHaveProperty("insuranceGroupId")
  })

  it("a Primary nobody accepted appears at send time: nothing is sent; the banner names it; focus on the button", async () => {
    const { server } = await renderSection([AETNA])
    await openAdd()
    await fillSelf()
    await click(demote("Aetna"))
    server.setList(page([AETNA, CIGNA]))
    await save()
    await waitFor(() => expect(document.activeElement).toBe(demote("Aetna and Cigna")))
    expect(within(offer() as HTMLElement).getByRole("status").textContent).toBe("Only one primary Medical policy. Make Aetna and Cigna secondary?")
    expect(demote("Aetna and Cigna").getAttribute("aria-pressed")).toBe("false")
    expect(errorLine()).toBe("Only one primary Medical policy is allowed. Make Aetna and Cigna secondary, or don't make this policy primary.")
    expect(server.log).toEqual(["list"])
    expect(server.puts).toEqual([])
    // Accepting both, then Save, demotes both.
    await click(demote("Aetna and Cigna"))
    await save()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(server.log).toEqual(["list", "list", "PUT 57 SECONDARY", "PUT 58 SECONDARY", "POST", "list"])
  })

  it("the other Primary went Secondary elsewhere meanwhile: no demotion, only the policy", async () => {
    const { server } = await renderSection([BLUE])
    await addAccepted()
    server.setList(page([wire({ insurancePrecedence: "SECONDARY" })]))
    await save()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(server.log).toEqual(["list", "POST", "list"])
    expect(toastSuccess).toHaveBeenCalledWith("Insurance saved.")
  })

  it("the list read at send time fails: nothing is sent; the error with Retry", async () => {
    const { server } = await renderSection([BLUE])
    await addAccepted()
    server.setList(fail("Boom", 500))
    await save()
    await waitFor(() => expect(saveErrorText()).toBe("Couldn't save insurance."))
    expect(server.log).toEqual(["list"])
    expect(within(saveError() as HTMLElement).getByRole("button", { name: "Retry" })).toBeTruthy()
  })

  it("while saving, the demote button is inert (aria-disabled) and pressing it changes nothing", async () => {
    const { server } = await renderSection([BLUE])
    let release: () => void = () => undefined
    server.setPut(55, "SECONDARY", () => new Promise<Response>((resolve) => (release = () => resolve(HttpResponse.json({ id: 55 })))))
    await addAccepted()
    await save()
    await waitFor(() => expect(server.log).toContain("PUT 55 SECONDARY"))
    expect(demote().getAttribute("aria-disabled")).toBe("true")
    await click(demote())
    expect(demote().getAttribute("aria-pressed")).toBe("true")
    await act(async () => release())
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("Edit of a Secondary made Primary: PUT the other one SECONDARY, then this policy's PUT", async () => {
    const { server } = await renderSection([BLUE, wire({ id: 59, insurancePrecedence: "SECONDARY", memberIdNumber: "HUM-1", insuranceOrganizationDTO: { insuranceCompanyName: "Humana", insuranceCompanyId: 13 } })])
    await openEdit("Humana Medical Insurance")
    await pick("Precedence", "Primary")
    await click(demote())
    await save()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(server.log).toEqual(["list", "PUT 55 SECONDARY", "PUT 59 PRIMARY", "list"])
  })

  it("a Spouse policy is demoted with its saved subscriber, unchanged", async () => {
    const sam = { firstName: "Sam", lastName: "Lee", email: "sam@example.com", phoneNumber: "+14155552125", phoneNumberRegion: "us", birthDate: "1980-05-04" }
    const { server } = await renderSection([wire({ relationshipToInsured: "SPOUSE", subscriber: sam })])
    await addAccepted()
    await save()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(server.puts[0].body.subscriber).toEqual(sam)
    expect(server.puts[0].body.relationshipToInsured).toBe("SPOUSE")
  })

  it("the demotion fails (500): the policy isn't sent; the list refetches; the error with Retry; Retry demotes again and saves", async () => {
    const { server } = await renderSection([BLUE])
    server.setPut(55, "SECONDARY", fail("Boom", 500), json({ id: 55 }))
    await addAccepted()
    await save()
    await waitFor(() => expect(saveErrorText()).toContain("Couldn't save insurance."))
    expect(server.log).toEqual(["list", "PUT 55 SECONDARY", "list"])
    await waitFor(() => expect(document.activeElement).toBe(saveError()))
    expect(tracked).toEqual([{ sectionId: "insurance", ok: false, code: "GENERIC" }])
    expect(demote().getAttribute("aria-pressed")).toBe("true")
    await click(within(saveError() as HTMLElement).getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(server.log).toEqual(["list", "PUT 55 SECONDARY", "list", "list", "PUT 55 SECONDARY", "POST", "list"])
    expect(tracked).toHaveLength(2)
  })

  it("the second demotion fails: the first is rolled back; nothing else is sent", async () => {
    const { server } = await renderSection([AETNA, CIGNA])
    server.setPut(58, "SECONDARY", fail("Boom", 500))
    await openAdd()
    await fillSelf()
    await click(demote("Aetna and Cigna"))
    await save()
    await waitFor(() => expect(saveErrorText()).toBe("Couldn't save insurance."))
    expect(server.log).toEqual(["list", "PUT 57 SECONDARY", "PUT 58 SECONDARY", "PUT 57 PRIMARY", "list"])
  })

  it("a demotion the backend refuses (400 about that policy): \"Edit that policy first\", no Retry, nothing on this form's fields", async () => {
    const { server } = await renderSection([BLUE])
    server.setPut(55, "SECONDARY", fail("Member Id Number is missing."))
    await addAccepted()
    await save()
    await waitFor(() => expect(saveErrorText()).toBe("Couldn't make Blue Shield secondary. Edit that policy first."))
    expect(within(saveError() as HTMLElement).queryByRole("button")).toBeNull()
    expect(control("Member ID").getAttribute("aria-invalid")).not.toBe("true")
    expect(server.log).toEqual(["list", "PUT 55 SECONDARY", "list"])
  })

  it.each([
    "Patient with id: {42} does not have an insurance with id: {55}",
    // Story 5.5's "already gone" text: the same policy-gone handling.
    "Insurance with Id: 55 is already deleted.",
  ])("the other policy is gone before its demotion (%j): the refetch drops it; \"… is no longer on your profile. Save again.\" with Retry, which sends only the policy", async (message) => {
    const { server } = await renderSection([BLUE])
    server.setPut(55, "SECONDARY", fail(message))
    await addAccepted()
    server.setList(listAfter(server, "PUT 55 SECONDARY", [], [BLUE]))
    await save()
    await waitFor(() => expect(saveErrorText()).toBe("Blue Shield is no longer on your profile. Save again."))
    await waitFor(() => expect(offer()).toBeNull())
    expect(server.log).toEqual(["list", "PUT 55 SECONDARY", "list"])
    await click(within(saveError() as HTMLElement).getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(server.log.slice(3)).toEqual(["POST", "list"])
  })

  it("the demotion ends the session (401): nothing else is sent; no drawer error", async () => {
    const { server } = await renderSection([BLUE])
    server.setPut(55, "SECONDARY", SESSION_ENDED)
    await addAccepted()
    await save()
    await waitFor(() => expect(within(drawer()).getByRole("button", { name: "Save" }).getAttribute("aria-busy")).toBeNull())
    expect(server.log).toEqual(["list", "PUT 55 SECONDARY"])
    expect(saveError()).toBeNull()
  })

  it("the policy save ends the session after the demotion (401): no rollback, no refetch, no drawer error", async () => {
    const { server } = await renderSection([BLUE])
    server.setPost(SESSION_ENDED)
    await addAccepted()
    await save()
    await waitFor(() => expect(within(drawer()).getByRole("button", { name: "Save" }).getAttribute("aria-busy")).toBeNull())
    expect(server.log).toEqual(["list", "PUT 55 SECONDARY", "POST"])
    expect(saveError()).toBeNull()
  })

  it("a rollback that ends the session stops: no refetch, no drawer error", async () => {
    const { server } = await renderSection([BLUE])
    server.setPost(fail("Boom", 500))
    server.setPut(55, "PRIMARY", SESSION_ENDED)
    await addAccepted()
    await save()
    await waitFor(() => expect(within(drawer()).getByRole("button", { name: "Save" }).getAttribute("aria-busy")).toBeNull())
    expect(server.log).toEqual(["list", "PUT 55 SECONDARY", "POST", "PUT 55 PRIMARY"])
    expect(saveError()).toBeNull()
  })

  it("an unexpected throw after the demotion: the rollback and the refetch still run; the generic error", async () => {
    const { server } = await renderSection([BLUE])
    vi.mocked(saveInsuranceCreate).mockRejectedValueOnce(new Error("boom"))
    await addAccepted()
    await save()
    await waitFor(() => expect(saveErrorText()).toBe("Couldn't save insurance."))
    expect(server.log).toEqual(["list", "PUT 55 SECONDARY", "PUT 55 PRIMARY", "list"])
    expect(tracked).toEqual([{ sectionId: "insurance", ok: false, code: "UNEXPECTED" }])
  })

  it("Edit of a Secondary made Primary, the policy gone and the rollback failed: the error toast names both; the drawer closes", async () => {
    const humana = wire({ id: 59, insurancePrecedence: "SECONDARY", memberIdNumber: "HUM-1", insuranceOrganizationDTO: { insuranceCompanyName: "Humana", insuranceCompanyId: 13 } })
    const { server } = await renderSection([BLUE, humana])
    server.setPut(59, "PRIMARY", fail("Patient with id: {42} does not have an insurance with id: {59}"))
    server.setPut(55, "PRIMARY", fail("Boom", 500))
    await openEdit("Humana Medical Insurance")
    await pick("Precedence", "Primary")
    await click(demote())
    await save()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(toastError).toHaveBeenCalledWith("This policy is no longer on your profile. Blue Shield is now secondary.", expect.objectContaining({ onRetry: expect.any(Function) }))
    expect(server.log).toContain("PUT 55 PRIMARY")
    expect(server.log.slice(0, 4)).toEqual(["list", "PUT 55 SECONDARY", "PUT 59 PRIMARY", "PUT 55 PRIMARY"])
  })

  it("a network failure on the demotion: the connection message with Retry", async () => {
    const { server } = await renderSection([BLUE])
    server.setPut(55, "SECONDARY", () => HttpResponse.error())
    await addAccepted()
    await save()
    await waitFor(() => expect(saveErrorText()).toBe("Couldn't save insurance. Check your connection."))
    expect(within(saveError() as HTMLElement).getByRole("button", { name: "Retry" })).toBeTruthy()
  })

  it("the policy save fails after the demotion (400): Blue Shield is made Primary again, then the error with Retry; Retry demotes and saves again", async () => {
    const { server } = await renderSection([BLUE])
    server.setPost(fail("Something went wrong. Please contact an administrator."))
    await addAccepted()
    await save()
    await waitFor(() => expect(saveErrorText()).toBe("Couldn't save insurance."))
    expect(server.log).toEqual(["list", "PUT 55 SECONDARY", "POST", "PUT 55 PRIMARY", "list"])
    expect(server.puts.map((put) => put.body.insurancePrecedence)).toEqual(["SECONDARY", "PRIMARY"])
    expect({ ...server.puts[1].body, insurancePrecedence: "SECONDARY" }).toEqual(server.puts[0].body)
    expect(tracked).toEqual([{ sectionId: "insurance", ok: false, code: "GENERIC" }])
    server.setPost(json({ id: 60 }))
    await click(within(saveError() as HTMLElement).getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(server.log).toEqual(["list", "PUT 55 SECONDARY", "POST", "PUT 55 PRIMARY", "list", "list", "PUT 55 SECONDARY", "POST", "list"])
  })

  it("the policy save fails at a field after the demotion: the field error; the rollback runs", async () => {
    const { server } = await renderSection([BLUE])
    server.setPost(fail("Member Id Number should be at least 3 symbols."))
    await addAccepted()
    await save()
    await waitFor(() => expect(document.activeElement).toBe(control("Member ID")))
    expect(server.log).toEqual(["list", "PUT 55 SECONDARY", "POST", "PUT 55 PRIMARY", "list"])
    expect(saveError()).toBeNull()
  })

  it("the rollback fails too: the error also says \"Blue Shield is now secondary.\"; after the refetch the banner is gone and Retry sends only the policy", async () => {
    const { server } = await renderSection([BLUE])
    server.setPost(fail("Boom", 500))
    server.setPut(55, "PRIMARY", fail("Boom", 500))
    await addAccepted()
    server.setList(listAfter(server, "PUT 55 PRIMARY", [wire({ insurancePrecedence: "SECONDARY" })], [BLUE]))
    await save()
    await waitFor(() => expect(saveErrorText()).toBe("Couldn't save insurance. Blue Shield is now secondary."))
    expect(server.log).toEqual(["list", "PUT 55 SECONDARY", "POST", "PUT 55 PRIMARY", "list"])
    await waitFor(() => expect(offer()).toBeNull())
    server.setPost(json({ id: 60 }))
    await click(within(saveError() as HTMLElement).getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(server.log).toEqual(["list", "PUT 55 SECONDARY", "POST", "PUT 55 PRIMARY", "list", "POST", "list"])
  })

  it("a field error and a failed rollback: the field error, and the note at drawer level (no Retry)", async () => {
    const { server } = await renderSection([BLUE])
    server.setPost(fail("Member Id Number should be at least 3 symbols."))
    server.setPut(55, "PRIMARY", fail("Boom", 500))
    await addAccepted()
    await save()
    await waitFor(() => expect(saveErrorText()).toBe("Blue Shield is now secondary."))
    expect(within(saveError() as HTMLElement).queryByRole("button")).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(control("Member ID")))
    expect(server.log).toEqual(["list", "PUT 55 SECONDARY", "POST", "PUT 55 PRIMARY", "list"])
  })

  it("legacy rollback: Aetna back to Primary, Cigna refused by the backend's Primary rule: \"Cigna is now secondary.\"", async () => {
    const { server } = await renderSection([AETNA, CIGNA])
    server.setPost(fail("Boom", 500))
    server.setPut(58, "PRIMARY", fail("You can not have multiple insurance records from same type with precedence field set to Primary."))
    await openAdd()
    await fillSelf()
    await click(demote("Aetna and Cigna"))
    server.setList(listAfter(server, "PUT 58 PRIMARY", [AETNA, wire({ ...CIGNA, insurancePrecedence: "SECONDARY" })], [AETNA, CIGNA]))
    await save()
    await waitFor(() => expect(saveErrorText()).toBe("Couldn't save insurance. Cigna is now secondary."))
    expect(server.log).toEqual(["list", "PUT 57 SECONDARY", "PUT 58 SECONDARY", "POST", "PUT 57 PRIMARY", "PUT 58 PRIMARY", "list"])
    // The refetch leaves only Aetna: the acceptance holds for what is left, so Retry demotes Aetna alone.
    await waitFor(() => expect(within(offer() as HTMLElement).getByRole("status").textContent).toBe("Only one primary Medical policy. Make Aetna secondary?"))
    expect(demote("Aetna").getAttribute("aria-pressed")).toBe("true")
    server.setPost(json({ id: 60 }))
    await click(within(saveError() as HTMLElement).getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(server.log.slice(7)).toEqual(["list", "PUT 57 SECONDARY", "POST", "list"])
  })

  it.each([
    ["a missing Member ID", wire({ memberIdNumber: null }), "Couldn't make Blue Shield secondary. Edit that policy first."],
    ["an N_A relationship", wire({ relationshipToInsured: "N_A" }), "Couldn't make Blue Shield secondary. Edit that policy first."],
    [
      "a Spouse policy without a saved subscriber",
      wire({ relationshipToInsured: "SPOUSE", subscriber: null }),
      "Couldn't make Blue Shield secondary: its policyholder is missing. Remove that policy and add it again.",
    ],
  ])("unbuildable demotion (%s): nothing but the list read is sent; the cause's message, no Retry; FIELD tracked", async (_label, other, message) => {
    const { server } = await renderSection([other])
    await addAccepted()
    await save()
    await waitFor(() => expect(saveErrorText()).toBe(message))
    expect(within(saveError() as HTMLElement).queryByRole("button")).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(saveError()))
    expect(server.log).toEqual(["list"])
    expect(tracked).toEqual([{ sectionId: "insurance", ok: false, code: "FIELD" }])
    expect(screen.getByRole("dialog", { name: "Add insurance" })).toBeTruthy()
  })

  it("unbuildable for both causes: one sentence each", async () => {
    await renderSection([
      wire({ memberIdNumber: null }),
      wire({ ...AETNA, relationshipToInsured: "SPOUSE", subscriber: null }),
    ])
    await openAdd()
    await fillSelf()
    await click(demote("Blue Shield and Aetna"))
    await save()
    await waitFor(() =>
      expect(saveErrorText()).toBe(
        "Couldn't make Aetna secondary: its policyholder is missing. Remove that policy and add it again. Couldn't make Blue Shield secondary. Edit that policy first.",
      ),
    )
  })

  it("no conflict: no demotion request (the 5.2 save as before)", async () => {
    const { server } = await renderSection([DELTA])
    await openAdd()
    await fillSelf()
    await save()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(server.puts).toEqual([])
  })
})

describe("Primary per type: accessibility", () => {
  it.each(["light", "dark"] as const)("has no axe violations in %s mode: the banner not accepted, with the error line, and accepted", async (theme) => {
    if (theme === "dark") document.documentElement.classList.add("dark")
    await renderSection([BLUE])
    await openAdd()
    await fillSelf()
    expect(await axeViolations()).toEqual([])
    await save()
    await waitFor(() => expect(errorLine()).not.toBeNull())
    expect(await axeViolations()).toEqual([])
    await click(demote())
    expect(note()).not.toBeNull()
    expect(await axeViolations()).toEqual([])
  })

  it("at 360 px the button wraps long names instead of widening the drawer", async () => {
    stubViewport(360)
    await renderSection([AETNA, CIGNA])
    await openAdd()
    await fillSelf()
    const button = demote("Aetna and Cigna")
    expect(button.className).toContain("whitespace-normal")
    expect(button.className).toContain("max-w-full")
  })
})
