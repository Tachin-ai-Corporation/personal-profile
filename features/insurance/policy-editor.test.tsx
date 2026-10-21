import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse, type JsonBodyType } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LeaveGuard, requestLeave, toastError, toastSuccess } from "@/features/shell"
import { setTelemetrySink, type TelemetryEvents } from "@/lib/shared/telemetry"
import { axeViolations } from "@/test/axe"
import { stubLayoutApis } from "@/test/dom-stubs"
import { stubViewport } from "@/test/media"
import { myselfWire } from "@/test/myself-fixture"
import { renderInPage } from "@/test/providers"
import { InsuranceSection } from "."

// The editor's own toast, observed (the shell's toast API; nothing renders a Toaster here).
vi.mock("@/features/shell/toasts", () => ({ toastSuccess: vi.fn(), toastError: vi.fn(() => ({ id: "t", dismiss: vi.fn() })), toastPartial: vi.fn() }))

// The drawer journeys type many fields through the real controls (slow under a loaded runner).
vi.setConfig({ testTimeout: 20_000 })

/**
 * Story 5.2 (NG-9029): the Add / Edit insurance drawer on `/`, rendered the
 * way `PageFrame` hosts it (`renderInPage` plus the page's `LeaveGuard`, MSW
 * at `/api`). Covers every row of the I/O matrix in
 * `spec-5-2-add-and-edit-a-policy.md`, the guard wiring, and axe in light and
 * dark with the drawer open.
 */

const LIST = "/api/1h/v2/health/patient/insurance"
const POLICY = "/api/1h/v2/health/patient/insurance/:id"
const ORGS = "/api/1h/v2/health/insurance/organizations"
const TYPE_KEY_PATH = "/api/1h/v2/type/key/Insurance"

type Wire = Record<string, unknown>
type Answer = () => Response | Promise<Response>

const values = (names: readonly string[]) => names.map((name, id) => ({ id, name }))

/** The Insurance type key: Type on the type, Precedence and Relationship on its `InsuranceBelongsToPerson` relation (decision 1A). */
const TYPE_KEY = {
  boKey: "Insurance",
  attributes: [{ attrKey: "insuranceType", type: "VALUE_LIST", attributeValues: values(["n/a", "Medical", "Dental", "Vision", "Drug"]) }],
  relationships: [
    {
      relKey: "InsuranceBelongsToPerson",
      attributes: [
        { attrKey: "insurancePrecedence", type: "VALUE_LIST", attributeValues: values(["n/a", "Primary", "Secondary", "Supplemental", "Other"]) },
        { attrKey: "relationshipToInsured", type: "VALUE_LIST", attributeValues: values(["n/a", "Self", "Spouse", "Parent", "Child", "Dependent"]) },
      ],
    },
  ],
}

/** A backend `ResponseInsuranceDTO`: an active Primary Medical, Self, with the backend's placeholders. */
const wire = (overrides: Wire = {}): Wire => ({
  id: 55,
  memberIdNumber: "948221037",
  insuranceType: "MEDICAL",
  planEffectiveDate: "2025-01-01",
  insuranceOrganizationDTO: { insuranceCompanyName: "UnitedHealthcare", insuranceCompanyId: 7 },
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

const SAM = { firstName: "Sam", lastName: "Lee", email: "sam@example.com", phoneNumber: "+14155552125", phoneNumberRegion: "us", birthDate: "1980-05-04" }
const SPOUSE_POLICY = wire({ id: 56, insuranceType: "DENTAL", insurancePrecedence: "SECONDARY", relationshipToInsured: "SPOUSE", subscriber: SAM, insuranceOrganizationDTO: { insuranceCompanyName: "Delta Dental", insuranceCompanyId: 9 } })

const ok = (body: unknown): Answer => () => HttpResponse.json(body as JsonBodyType)
const fail = (message: string, status = 400): Answer => () => HttpResponse.json({ message, code: status }, { status })

interface Server {
  readonly posts: Wire[]
  readonly puts: { readonly path: string; readonly body: Wire }[]
  readonly searches: string[]
  readonly lists: () => number
  setList: (answer: Answer) => void
  setWrite: (answer: Answer) => void
  setTypeKey: (answer: Answer) => void
}

function makeServer(list: Answer, write: Answer = ok({ id: 60 }), typeKey: Answer = ok(TYPE_KEY)) {
  const state = { list, write, typeKey, lists: 0 }
  const posts: Wire[] = []
  const puts: { path: string; body: Wire }[] = []
  const searches: string[] = []
  const handlers = [
    http.get(LIST, () => {
      state.lists += 1
      return state.list()
    }),
    http.get(TYPE_KEY_PATH, () => state.typeKey()),
    http.get(ORGS, ({ request }) => {
      const url = new URL(request.url)
      searches.push(url.search)
      const name = (url.searchParams.get("name") ?? "").toLowerCase()
      const data = [
        { id: 7, name: "Blue Shield" },
        { id: 8, name: "Blue Cross" },
        { id: 9, name: "Delta Dental" },
      ].filter((row) => row.name.toLowerCase().includes(name))
      return HttpResponse.json({ data, lastPage: true })
    }),
    http.post(LIST, async ({ request }) => {
      posts.push((await request.json()) as Wire)
      return state.write()
    }),
    http.put(POLICY, async ({ request }) => {
      puts.push({ path: new URL(request.url).pathname, body: (await request.json()) as Wire })
      return state.write()
    }),
  ]
  const server: Server = {
    posts,
    puts,
    searches,
    lists: () => state.lists,
    setList: (answer) => {
      state.list = answer
    },
    setWrite: (answer) => {
      state.write = answer
    },
    setTypeKey: (answer) => {
      state.typeKey = answer
    },
  }
  return { server, handlers }
}

const section = (): HTMLElement => screen.getByRole("region", { name: "Insurance" })
const frame = (): HTMLElement | null => section().querySelector('[data-slot="state-frame"]')
const drawer = (): HTMLElement => screen.getByRole("dialog")
const headerAdd = (): HTMLElement => within(section().querySelector('[data-slot="section-header"]') as HTMLElement).getByRole("button", { name: "Add insurance" })

async function renderSection(list: Wire[] = [], write?: Answer, typeKey?: Answer) {
  const { server, handlers } = makeServer(ok({ data: list, lastPage: true }), write, typeKey)
  const result = renderInPage(
    <>
      <InsuranceSection />
      <LeaveGuard />
    </>,
    { page: "profile", handlers, myself: myselfWire({ firstName: "Avery", lastName: "Lee", email: "avery@example.com" }) },
  )
  await waitFor(() => expect(frame()?.getAttribute("data-state")).toBe("ready"))
  return { ...result, server }
}

/** The drawer's control labelled `label` (with or without "(optional)"); an open listbox sharing the name is skipped. */
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

async function blur(label: string) {
  await act(async () => fireEvent.blur(control(label)))
}

/** Opens a Select and picks the option named `name`. */
async function pick(label: string, name: string) {
  const trigger = control(label)
  await act(async () => fireEvent.keyDown(trigger, { key: "Enter" }))
  await act(async () => fireEvent.click(await screen.findByRole("option", { name })))
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull())
}

/** Types into the insurer search and picks the option named `name` (a listed insurer or "Add “…”"). */
async function insurer(query: string, name: string) {
  await type("Insurer", query)
  const option = await screen.findByRole("option", { name }, { timeout: 2000 })
  await click(option)
}

async function openAdd() {
  const add = headerAdd()
  add.focus()
  await click(add)
  await screen.findByRole("dialog", { name: "Add insurance" })
  await waitFor(() => expect(within(control("Type")).queryByText("Loading…")).toBeNull())
  await waitFor(() => expect(control("Type").getAttribute("aria-busy")).toBeNull())
}

async function openEdit(policyName: string) {
  const kebab = within(section()).getByRole("button", { name: `More actions for ${policyName}` })
  kebab.focus()
  await act(async () => fireEvent.keyDown(kebab, { key: "Enter" }))
  await click(await screen.findByRole("menuitem", { name: "Edit" }))
  await screen.findByRole("dialog", { name: "Edit insurance" })
  await waitFor(() => expect(control("Type").getAttribute("aria-busy")).toBeNull())
  return kebab
}

/** Fills a valid Self policy: Blue Shield, Medical, Primary, Self, XKH123, effective 01/01/2025. */
async function fillSelf() {
  await insurer("Blu", "Blue Shield")
  await pick("Type", "Medical")
  await pick("Precedence", "Primary")
  await pick("Relationship", "Self")
  await type("Member ID", "XKH123")
  await type("Effective date", "01012025")
}

async function save() {
  await click(within(drawer()).getByRole("button", { name: "Save" }))
}

const fieldError = (label: string): string | null => {
  const ids = control(label).getAttribute("aria-describedby")?.split(" ") ?? []
  return ids.map((id) => document.getElementById(id)).find((element) => element?.getAttribute("data-slot") === "field-error")?.textContent ?? null
}

let tracked: TelemetryEvents["section_save"][] = []
let restoreSink: () => void = () => undefined

beforeEach(() => {
  stubViewport(1024)
  stubLayoutApis()
  vi.mocked(toastSuccess).mockClear()
  vi.mocked(toastError).mockClear()
  tracked = []
  restoreSink = setTelemetrySink((event, payload) => {
    if (event === "section_save") tracked.push(payload as TelemetryEvents["section_save"])
  })
})
afterEach(() => {
  restoreSink()
  document.documentElement.classList.remove("dark")
})

describe("Insurance editor: entry points", () => {
  it("\"Add insurance\" in the header and on the empty card open the Add drawer; focus starts on the insurer", async () => {
    await renderSection()
    const empty = within(section().querySelector('[data-slot="empty-state"]') as HTMLElement).getByRole("button", { name: "Add insurance" })
    await click(empty)
    const dialog = await screen.findByRole("dialog", { name: "Add insurance" })
    expect(dialog.getAttribute("data-slot")).toBe("insurance-editor")
    await waitFor(() => expect(document.activeElement).toBe(control("Insurer")))
    expect(within(dialog).getByRole("button", { name: "Close" })).toBeTruthy()
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeTruthy()
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeTruthy()
  })

  it("the field order, the optional labels, and no Subscriber group for Self", async () => {
    await renderSection()
    await openAdd()
    const labels = [...drawer().querySelectorAll("label")].map((label) => label.textContent)
    expect(labels).toEqual([
      "Insurer",
      "Type",
      "Precedence",
      "Relationship",
      "Member ID",
      "Group ID (optional)",
      "Effective date",
      "Expiration date (optional)",
      "Cancellation date (optional)",
    ])
    for (const label of ["Insurer", "Type", "Precedence", "Relationship", "Member ID", "Effective date"]) {
      expect(control(label).getAttribute("aria-required"), label).toBe("true")
    }
    expect(control("Group ID").getAttribute("aria-required")).toBeNull()
    const help = (label: string) => (control(label).getAttribute("aria-describedby") ?? "").split(" ").map((id) => document.getElementById(id)?.textContent)
    expect(help("Insurer")).toContain("Search the list, or add your insurer by name if it isn't there.")
    expect(help("Expiration date")).toContain("Expiration and cancellation must be after the effective date. Cancellation must be before expiration.")
    expect(within(drawer()).queryByRole("group", { name: "Subscriber" })).toBeNull()
  })

  it("Type, Precedence and Relationship offer the type key's values in title case, without n/a", async () => {
    await renderSection()
    await openAdd()
    const optionsOf = async (label: string) => {
      await act(async () => fireEvent.keyDown(control(label), { key: "Enter" }))
      const options = await screen.findAllByRole("option")
      const names = options.map((option) => option.textContent)
      await click(options[0] as HTMLElement)
      await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull())
      return names
    }
    expect(await optionsOf("Type")).toEqual(["Medical", "Dental", "Vision", "Drug"])
    expect(await optionsOf("Precedence")).toEqual(["Primary", "Secondary", "Supplemental", "Other"])
    expect(await optionsOf("Relationship")).toEqual(["Self", "Spouse", "Parent", "Child", "Dependent"])
  })
})

describe("Insurance editor: Escape inside the drawer's own popups", () => {
  it("Escape on an open Select or the insurer list closes only that list, never the drawer", async () => {
    await renderSection()
    await openAdd()
    await act(async () => fireEvent.keyDown(control("Type"), { key: "Enter" }))
    const listbox = await screen.findByRole("listbox")
    await act(async () => fireEvent.keyDown(listbox, { key: "Escape" }))
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull())
    expect(screen.getByRole("dialog", { name: "Add insurance" })).toBeTruthy()
    await type("Insurer", "Blu")
    await screen.findByRole("option", { name: "Blue Shield" }, { timeout: 2000 })
    await act(async () => fireEvent.keyDown(control("Insurer"), { key: "Escape" }))
    await waitFor(() => expect(screen.queryByRole("option", { name: "Blue Shield" })).toBeNull())
    expect(screen.getByRole("dialog", { name: "Add insurance" })).toBeTruthy()
    expect(screen.queryByRole("alertdialog")).toBeNull()
  })
})

describe("Insurance editor: add (I/O rows Add, listed / new insurer, Drug)", () => {
  it("Add, listed insurer: one POST with the id, MEDICAL/PRIMARY/SELF and no subscriber; closes, toasts, refetches, focus on Add insurance", async () => {
    const { server } = await renderSection()
    await openAdd()
    await fillSelf()
    expect(server.searches.at(-1)).toBe("?name=Blu&page=0&size=20")
    const listsBefore = server.lists()
    await save()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(server.posts).toEqual([
      {
        insuranceOrganizationDTO: { insuranceCompanyId: 7 },
        insuranceType: "MEDICAL",
        insurancePrecedence: "PRIMARY",
        relationshipToInsured: "SELF",
        memberIdNumber: "XKH123",
        planEffectiveDate: "2025-01-01",
      },
    ])
    expect(toastSuccess).toHaveBeenCalledWith("Insurance saved.")
    expect(tracked).toEqual([{ sectionId: "insurance", ok: true, code: null }])
    await waitFor(() => expect(server.lists()).toBe(listsBefore + 1))
    await waitFor(() => expect(document.activeElement).toBe(headerAdd()))
  })

  it("Add from the empty card: once saved, focus lands on the header's Add insurance", async () => {
    const { server } = await renderSection()
    server.setList(ok({ data: [wire({ id: 60 })], lastPage: true }))
    await click(within(section().querySelector('[data-slot="empty-state"]') as HTMLElement).getByRole("button", { name: "Add insurance" }))
    await screen.findByRole("dialog", { name: "Add insurance" })
    await waitFor(() => expect(control("Type").getAttribute("aria-busy")).toBeNull())
    await fillSelf()
    await save()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await within(section()).findByRole("article", { name: "Medical Insurance" })
    await waitFor(() => expect(document.activeElement).toBe(headerAdd()))
  })

  it("Add, new insurer: \"Add “Acme Health”\" sends insuranceCompanyName; Drug is DRUG; optional fields are sent trimmed", async () => {
    const { server } = await renderSection()
    await openAdd()
    await insurer("Acme Health", "Add “Acme Health”")
    expect((control("Insurer") as HTMLInputElement).value).toBe("Acme Health")
    await pick("Type", "Drug")
    await pick("Precedence", "Other")
    await pick("Relationship", "Self")
    await type("Member ID", "  XKH123  ")
    await type("Group ID", " 704512 ")
    await type("Effective date", "01012025")
    await type("Expiration date", "12312026")
    await type("Cancellation date", "06302026")
    await save()
    await waitFor(() => expect(server.posts).toHaveLength(1))
    expect(server.posts[0]).toEqual({
      insuranceOrganizationDTO: { insuranceCompanyName: "Acme Health" },
      insuranceType: "DRUG",
      insurancePrecedence: "OTHER",
      relationshipToInsured: "SELF",
      memberIdNumber: "XKH123",
      insuranceGroupId: "704512",
      planEffectiveDate: "2025-01-01",
      expirationDate: "2026-12-31",
      cancellationDate: "2026-06-30",
    })
  })

  it("offers \"Add “{name}”\" only while no loaded name equals the text", async () => {
    await renderSection()
    await openAdd()
    await type("Insurer", "blue shield")
    await screen.findByRole("option", { name: "Blue Shield" }, { timeout: 2000 })
    expect(screen.queryByRole("option", { name: /^Add “/ })).toBeNull()
    await type("Insurer", "Blue")
    await waitFor(() => expect(screen.getByRole("option", { name: "Add “Blue”" })).toBeTruthy(), { timeout: 2000 })
  })
})

describe("Insurance editor: validation", () => {
  it("Save with nothing filled: required errors, nothing sent, focus on the insurer", async () => {
    const { server } = await renderSection()
    await openAdd()
    control("Member ID").focus()
    await save()
    await waitFor(() => expect(fieldError("Insurer")).toBe("Choose your insurer"))
    expect(fieldError("Type")).toBe("Choose a value")
    expect(fieldError("Precedence")).toBe("Choose a value")
    expect(fieldError("Relationship")).toBe("Choose a value")
    expect(fieldError("Member ID")).toBe("Member ID is required")
    expect(fieldError("Effective date")).toBe("Effective date is required")
    expect(fieldError("Group ID")).toBeNull()
    expect(document.activeElement).toBe(control("Insurer"))
    expect(server.posts).toEqual([])
    expect(screen.getByRole("dialog", { name: "Add insurance" })).toBeTruthy()
  })

  it("Dates: expiration before effective, cancellation after expiration: inline errors, nothing sent, focus on Expiration", async () => {
    const { server } = await renderSection()
    await openAdd()
    await fillSelf()
    await type("Expiration date", "12312024")
    await blur("Expiration date")
    await waitFor(() => expect(fieldError("Expiration date")).toBe("Expiration must be after the effective date"))
    await type("Expiration date", "12312026")
    await type("Cancellation date", "01152027")
    await save()
    await waitFor(() => expect(fieldError("Cancellation date")).toBe("Cancellation must be before expiration"))
    expect(fieldError("Expiration date")).toBeNull()
    expect(document.activeElement).toBe(control("Cancellation date"))
    expect(server.posts).toEqual([])
  })

  it("Member ID and Group ID lengths", async () => {
    await renderSection()
    await openAdd()
    await type("Member ID", "AB")
    await blur("Member ID")
    await type("Group ID", "x".repeat(33))
    await blur("Group ID")
    await waitFor(() => expect(fieldError("Member ID")).toBe("Member ID must be 3 to 32 characters"))
    expect(fieldError("Group ID")).toBe("Group ID must be 3 to 32 characters")
  })
})

describe("Insurance editor: subscriber (I/O rows Subscriber, Locked subscriber)", () => {
  it("Add, Spouse: the group with the invite line; all five required; own email and age 17 refused; Self again hides it and sends none", async () => {
    const { server } = await renderSection()
    await openAdd()
    await fillSelf()
    await pick("Relationship", "Spouse")
    const group = within(drawer()).getByRole("group", { name: "Subscriber" })
    expect(group.className).toContain("border-t")
    expect(within(group).getByText("The person who holds this policy. Needed because the relationship isn't Self.")).toBeTruthy()
    expect(within(group).getByText("If they aren't on 1health yet, we'll invite them by email.")).toBeTruthy()
    expect(within(group).queryByText(/remove this policy and add it again/)).toBeNull()

    await save()
    await waitFor(() => expect(fieldError("First name")).toBe("First name is required"))
    expect(fieldError("Last name")).toBe("Last name is required")
    expect(fieldError("Email")).toBe("Email is required")
    expect(fieldError("Phone")).toBe("Phone is required")
    expect(fieldError("Birth date")).toBe("Birth date is required")
    expect(document.activeElement).toBe(control("First name"))
    expect(server.posts).toEqual([])

    await type("First name", "Sam")
    expect(within(group).getByText("If Sam isn't on 1health yet, we'll invite them by email.")).toBeTruthy()
    const emailHelp = (control("Email").getAttribute("aria-describedby") ?? "").split(" ").map((id) => document.getElementById(id)?.textContent)
    expect(emailHelp).toContain("Use Sam's email, not the one you sign in with.")
    await type("Last name", "Lee")
    await type("Email", "Avery@Example.com")
    await type("Phone", "4155552125")
    const seventeen = new Date()
    seventeen.setFullYear(seventeen.getFullYear() - 17)
    const mmddyyyy = `${String(seventeen.getMonth() + 1).padStart(2, "0")}${String(seventeen.getDate()).padStart(2, "0")}${seventeen.getFullYear()}`
    await type("Birth date", mmddyyyy)
    await save()
    await waitFor(() => expect(fieldError("Email")).toBe("Use the subscriber's email, not yours"))
    expect(fieldError("Birth date")).toBe("You must be 18 to 120 years old")
    expect(server.posts).toEqual([])

    await type("Email", "sam@example.com")
    await type("Birth date", "05041980")
    await pick("Relationship", "Self")
    expect(within(drawer()).queryByRole("group", { name: "Subscriber" })).toBeNull()
    await save()
    await waitFor(() => expect(server.posts).toHaveLength(1))
    expect(server.posts[0]).not.toHaveProperty("subscriber")
    expect(server.posts[0]).toMatchObject({ relationshipToInsured: "SELF" })
  })

  it("Add, Spouse with a valid subscriber: sends it (E.164 and region, YYYY-MM-DD)", async () => {
    const { server } = await renderSection()
    await openAdd()
    await fillSelf()
    await pick("Relationship", "Spouse")
    await type("First name", " Sam ")
    await type("Last name", "Lee")
    await type("Email", "sam@example.com")
    await type("Phone", "4155552125")
    await type("Birth date", "05041980")
    await save()
    await waitFor(() => expect(server.posts).toHaveLength(1))
    expect(server.posts[0]).toMatchObject({
      relationshipToInsured: "SPOUSE",
      subscriber: { firstName: "Sam", lastName: "Lee", email: "sam@example.com", phoneNumber: "+14155552125", phoneNumberRegion: "us", birthDate: "1980-05-04" },
    })
  })

  it("Edit of a Spouse policy: the five fields read-only with the saved values and the reason; the PUT sends the saved subscriber unchanged", async () => {
    const { server } = await renderSection([wire(), SPOUSE_POLICY])
    await openEdit("Delta Dental Dental Insurance")
    const group = within(drawer()).getByRole("group", { name: "Subscriber" })
    const reason = within(group).getByText("To change the policyholder, remove this policy and add it again.")
    expect(within(group).queryByText(/invite them by email/)).toBeNull()
    const locked: Record<string, string> = { "First name": "Sam", "Last name": "Lee", Email: "sam@example.com", Phone: "+1 (415) 555-2125", "Birth date": "05/04/1980" }
    for (const [label, value] of Object.entries(locked)) {
      const input = control(label) as HTMLInputElement
      expect(input.value, label).toBe(value)
      expect(input.readOnly, label).toBe(true)
      expect(input.getAttribute("aria-readonly"), label).toBe("true")
      expect(input.disabled, label).toBe(false)
      expect(input.getAttribute("aria-describedby")?.split(" "), label).toContain(reason.id)
    }
    // Relationship among non-Self values keeps the locked subscriber.
    await pick("Relationship", "Child")
    expect((control("Email") as HTMLInputElement).readOnly).toBe(true)
    await save()
    await waitFor(() => expect(server.puts).toHaveLength(1))
    expect(server.puts[0]).toEqual({
      path: "/api/1h/v2/health/patient/insurance/56",
      body: {
        insuranceOrganizationDTO: { insuranceCompanyId: 9 },
        insuranceType: "DENTAL",
        insurancePrecedence: "SECONDARY",
        relationshipToInsured: "CHILD",
        memberIdNumber: "948221037",
        planEffectiveDate: "2025-01-01",
        subscriber: SAM,
      },
    })
  })

  it("Edit of a Spouse policy switched to Self: the group hides and no subscriber is sent", async () => {
    const { server } = await renderSection([SPOUSE_POLICY])
    await openEdit("Delta Dental Dental Insurance")
    await pick("Relationship", "Self")
    expect(within(drawer()).queryByRole("group", { name: "Subscriber" })).toBeNull()
    await save()
    await waitFor(() => expect(server.puts).toHaveLength(1))
    expect(server.puts[0]?.body).not.toHaveProperty("subscriber")
  })
})

describe("Insurance editor: no typed subscriber on Edit (decision 3A)", () => {
  const REASON = "To change the policyholder, remove this policy and add it again."

  it("Edit of a Self policy switched to Spouse: no inputs, the reason, Save and the guard's Save blocked; Self again saves without a subscriber", async () => {
    const { server } = await renderSection([wire()])
    await openEdit("UnitedHealthcare Medical Insurance")
    await pick("Relationship", "Spouse")
    const group = within(drawer()).getByRole("group", { name: "Subscriber" })
    const reason = within(group).getByText(REASON)
    expect(within(group).queryByRole("textbox")).toBeNull()
    expect(within(group).queryByText(/invite them by email/)).toBeNull()
    await save()
    await waitFor(() => expect(document.activeElement).toBe(reason))
    expect(server.puts).toEqual([])

    await act(async () => fireEvent.keyDown(control("Member ID"), { key: "Escape" }))
    await click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    expect(screen.getByRole("dialog", { name: "Edit insurance" })).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(within(drawer()).getByText(REASON)))
    expect(server.puts).toEqual([])

    await pick("Relationship", "Self")
    await save()
    await waitFor(() => expect(server.puts).toHaveLength(1))
    expect(server.puts[0]?.body).not.toHaveProperty("subscriber")
  })

  it("Edit of a non-Self policy saved without a subscriber: the reason only, Save blocked, no PUT", async () => {
    const { server } = await renderSection([wire({ relationshipToInsured: "CHILD", subscriber: null })])
    await openEdit("UnitedHealthcare Medical Insurance")
    const group = within(drawer()).getByRole("group", { name: "Subscriber" })
    expect(within(group).queryByRole("textbox")).toBeNull()
    const reason = within(group).getByText(REASON)
    await save()
    await waitFor(() => expect(document.activeElement).toBe(reason))
    expect(server.puts).toEqual([])
  })
})

describe("Insurance editor: insurer and option edge cases", () => {
  it("typing over the saved insurer and leaving drops it: the field is empty and required, nothing is sent", async () => {
    const { server } = await renderSection([wire()])
    await openEdit("UnitedHealthcare Medical Insurance")
    await type("Insurer", "Uni")
    await blur("Insurer")
    await waitFor(() => expect((control("Insurer") as HTMLInputElement).value).toBe(""))
    await save()
    await waitFor(() => expect(fieldError("Insurer")).toBe("Choose your insurer"))
    expect(server.puts).toEqual([])
  })

  it("while the value lists load, Save (and the guard's Save) moves focus to Type and sends nothing", async () => {
    const pending = new Promise<Response>(() => undefined)
    const { server } = await renderSection([wire()], undefined, () => pending)
    const kebab = within(section()).getByRole("button", { name: "More actions for UnitedHealthcare Medical Insurance" })
    await act(async () => fireEvent.keyDown(kebab, { key: "Enter" }))
    await click(await screen.findByRole("menuitem", { name: "Edit" }))
    await screen.findByRole("dialog", { name: "Edit insurance" })
    expect(control("Type").getAttribute("aria-busy")).toBe("true")
    await save()
    await waitFor(() => expect(document.activeElement).toBe(control("Type")))
    await type("Member ID", "XKH999")
    await act(async () => fireEvent.keyDown(control("Member ID"), { key: "Escape" }))
    await click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(control("Type")))
    expect(server.puts).toEqual([])
  })
})

describe("Insurance editor: edit (I/O row Edit)", () => {
  it("pre-fills every field, loads the placeholders as empty, PUTs every field, and returns focus to the kebab", async () => {
    const { server } = await renderSection([wire()])
    const kebab = await openEdit("UnitedHealthcare Medical Insurance")
    expect((control("Insurer") as HTMLInputElement).value).toBe("UnitedHealthcare")
    expect(control("Type").textContent).toBe("Medical")
    expect(control("Precedence").textContent).toBe("Primary")
    expect(control("Relationship").textContent).toBe("Self")
    expect((control("Member ID") as HTMLInputElement).value).toBe("948221037")
    expect((control("Group ID") as HTMLInputElement).value).toBe("")
    expect((control("Effective date") as HTMLInputElement).value).toBe("01/01/2025")
    expect((control("Expiration date") as HTMLInputElement).value).toBe("")
    expect((control("Cancellation date") as HTMLInputElement).value).toBe("")
    await type("Member ID", "XKH999")
    await save()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(server.puts).toEqual([
      {
        path: "/api/1h/v2/health/patient/insurance/55",
        body: {
          insuranceOrganizationDTO: { insuranceCompanyId: 7 },
          insuranceType: "MEDICAL",
          insurancePrecedence: "PRIMARY",
          relationshipToInsured: "SELF",
          memberIdNumber: "XKH999",
          planEffectiveDate: "2025-01-01",
        },
      },
    ])
    expect(toastSuccess).toHaveBeenCalledWith("Insurance saved.")
    await waitFor(() => expect(document.activeElement).toBe(kebab))
  })

  it("a saved value the list doesn't offer stays shown until it is changed", async () => {
    await renderSection([wire({ insuranceType: "HOSPICE" })])
    await openEdit("UnitedHealthcare Hospice Insurance")
    expect(control("Type").textContent).toBe("Hospice")
    await pick("Type", "Vision")
    expect(control("Type").textContent).toBe("Vision")
  })

  it("a Deleted card has no kebab, so no Edit", async () => {
    await renderSection([wire(), wire({ id: 57, label: "Deleted", insuranceType: "VISION" })])
    expect(within(section()).queryByRole("button", { name: "More actions for UnitedHealthcare Vision Insurance" })).toBeNull()
  })
})

describe("Insurance editor: save failures (I/O rows Server field error, Network)", () => {
  it.each<[string, string, string, string, boolean]>([
    ["Member ID length", "Member Id Number should be at least 3 symbols.", "Member ID", "Member ID must be 3 to 32 characters", false],
    [
      "the duplicate",
      "Patient with ID {12} already has an existing insurance record associated with Insurance Company ID {7} and Policy Number {XKH123}",
      "Member ID",
      "This policy is already on your profile",
      false,
    ],
    ["an unknown insurer id", "Operation failed. Insurance Company with ID: 7 does not exist.", "Insurer", "This insurer is no longer listed. Search again.", false],
    ["Group ID length", "Group Number should be at least 3 symbols.", "Group ID", "Group ID must be 3 to 32 characters", false],
    ["a subscriber rule (Add, Spouse)", "Please provide subscriber's email.", "Email", "Email is required", true],
  ])("%s: the message at the field, focus there, no drawer banner, the drawer stays open", async (_name, message, label, shown, spouse) => {
    const { server } = await renderSection([], fail(message))
    await openAdd()
    await fillSelf()
    await type("Group ID", "704512")
    if (spouse) {
      await pick("Relationship", "Spouse")
      await type("First name", "Sam")
      await type("Last name", "Lee")
      await type("Email", "sam@example.com")
      await type("Phone", "4155552125")
      await type("Birth date", "05041980")
    }
    await save()
    await waitFor(() => expect(fieldError(label)).toBe(shown))
    expect(document.activeElement).toBe(control(label))
    expect(drawer().querySelector('[data-slot~="insurance-save-error"]')).toBeNull()
    expect(screen.getByRole("dialog", { name: "Add insurance" })).toBeTruthy()
    expect(server.posts).toHaveLength(1)
    expect(tracked).toEqual([{ sectionId: "insurance", ok: false, code: "FIELD" }])
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it("a subscriber rule on a locked subscriber shows at drawer level: the saved policyholder is incomplete", async () => {
    await renderSection([SPOUSE_POLICY], fail("Please, provide subscriber's birth date."))
    await openEdit("Delta Dental Dental Insurance")
    await save()
    const banner = await within(drawer()).findByText(
      "The saved policyholder is incomplete. To change the policyholder, remove this policy and add it again.",
    )
    expect(within(banner.closest('[data-slot~="insurance-save-error"]') as HTMLElement).queryByRole("button")).toBeNull()
    expect(fieldError("Birth date")).toBeNull()
  })

  it("a subscriber rule with no subscriber field on screen (Edit, Self) shows its message at drawer level", async () => {
    await renderSection([wire()], fail("Please provide subscriber's email."))
    await openEdit("UnitedHealthcare Medical Insurance")
    await save()
    const banner = await within(drawer()).findByText("Email is required")
    expect(banner.closest('[data-slot~="insurance-save-error"]')).not.toBeNull()
  })

  it("a 403 on save shows the no-access message without Retry", async () => {
    await renderSection([], () => HttpResponse.json({ message: "Forbidden" }, { status: 403 }))
    await openAdd()
    await fillSelf()
    await save()
    const banner = await within(drawer()).findByText("You don't have access to this in your current account")
    expect(within(banner.closest('[data-slot~="insurance-save-error"]') as HTMLElement).queryByRole("button")).toBeNull()
  })

  it("the Primary rule shows at Precedence (Story 5.4 keeps it for a race: another device made a Primary meanwhile)", async () => {
    await renderSection([], fail("You can not have multiple insurance records from same type with precedence field set to Primary."))
    await openAdd()
    await fillSelf()
    await save()
    await waitFor(() => expect(fieldError("Precedence")).toBe("You already have a primary policy of this type"))
  })

  it("Network: \"Couldn't save insurance. Check your connection.\" with Retry; Retry sends again", async () => {
    const { server } = await renderSection([], () => HttpResponse.error())
    await openAdd()
    await fillSelf()
    await save()
    const banner = await within(drawer()).findByText("Couldn't save insurance. Check your connection.")
    const container = banner.closest('[data-slot~="insurance-save-error"]') as HTMLElement
    await waitFor(() => expect(document.activeElement).toBe(container))
    expect(tracked).toEqual([{ sectionId: "insurance", ok: false, code: "NETWORK_ERROR" }])
    server.setWrite(ok({ id: 60 }))
    await click(within(container).getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(server.posts).toHaveLength(2)
  })

  it("anything else: \"Couldn't save insurance.\" with Retry at drawer level", async () => {
    await renderSection([], fail("Something went wrong. Please contact an administrator.", 500))
    await openAdd()
    await fillSelf()
    await save()
    const banner = await within(drawer()).findByText("Couldn't save insurance.")
    expect(within(banner.closest('[data-slot~="insurance-save-error"]') as HTMLElement).getByRole("button", { name: "Retry" })).toBeTruthy()
  })

  it("a policy that is gone: the list refetches, the drawer closes without the guard, and an error toast offers to reload", async () => {
    const { server } = await renderSection([wire()], fail("Patient with id: {12} does not have an insurance with id: {55}"))
    await openEdit("UnitedHealthcare Medical Insurance")
    await type("Member ID", "XKH999")
    const before = server.lists()
    await save()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(screen.queryByRole("alertdialog")).toBeNull()
    await waitFor(() => expect(server.lists()).toBe(before + 1))
    expect(toastError).toHaveBeenCalledWith("This policy is no longer on your profile.", { onRetry: expect.any(Function) })
    vi.mocked(toastError).mock.calls[0]?.[1].onRetry()
    await waitFor(() => expect(server.lists()).toBe(before + 2))
    expect(server.puts).toHaveLength(1)
  })

  it("while saving: inputs read-only, Cancel inert, Escape ignored, Save reads Saving…", async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const { server } = await renderSection([], async () => {
      await gate
      return HttpResponse.json({ id: 60 })
    })
    await openAdd()
    await fillSelf()
    await save()
    await waitFor(() => expect(server.posts).toHaveLength(1))
    expect((control("Member ID") as HTMLInputElement).readOnly).toBe(true)
    expect((control("Effective date") as HTMLInputElement).readOnly).toBe(true)
    expect(control("Type").getAttribute("aria-readonly")).toBe("true")
    const cancel = within(drawer()).getByRole("button", { name: "Cancel" })
    expect(cancel.getAttribute("aria-disabled")).toBe("true")
    const busy = within(drawer()).getByRole("button", { name: /Saving…/ })
    expect(busy.getAttribute("aria-busy")).toBe("true")
    await click(cancel)
    await act(async () => fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" }))
    expect(screen.getByRole("dialog", { name: "Add insurance" })).toBeTruthy()
    expect(screen.queryByRole("alertdialog")).toBeNull()
    // A second click on the busy Save sends nothing more.
    await click(busy)
    release()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(server.posts).toHaveLength(1)
  })
})

describe("Insurance editor: options (I/O row Options fail)", () => {
  it("a type key 500: an inline error with Retry; Save is blocked until it loads", async () => {
    const { server } = await renderSection([], undefined, () => HttpResponse.json({ message: "boom" }, { status: 500 }))
    await click(headerAdd())
    await screen.findByRole("dialog", { name: "Add insurance" })
    const banner = await within(drawer()).findByText("Couldn't load the insurance options.")
    const container = banner.closest('[data-slot~="insurance-options-error"]') as HTMLElement
    await insurer("Blu", "Blue Shield")
    await type("Member ID", "XKH123")
    await save()
    expect(document.activeElement).toBe(container)
    expect(server.posts).toEqual([])
    server.setTypeKey(ok(TYPE_KEY))
    await click(within(container).getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(within(drawer()).queryByText("Couldn't load the insurance options.")).toBeNull())
    await pick("Type", "Medical")
  })
})

describe("Insurance editor: the leave guard (I/O rows Dirty close, Clean close)", () => {
  it("Clean close: Escape closes at once, focus back on the trigger; nothing is dirty", async () => {
    const { registry } = await renderSection()
    await openAdd()
    expect(registry.get("insurance")?.isDirty).toBe(false)
    await act(async () => fireEvent.keyDown(control("Insurer"), { key: "Escape" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(screen.queryByRole("alertdialog")).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(headerAdd()))
  })

  it.each<[string, () => Promise<void>]>([
    [
      "Escape",
      async () => {
        await act(async () => {
          fireEvent.keyDown(control("Member ID"), { key: "Escape" })
        })
      },
    ],
    ["Cancel", async () => click(within(drawer()).getByRole("button", { name: "Cancel" }))],
    ["Close", async () => click(within(drawer()).getByRole("button", { name: "Close" }))],
    ["Back", async () => click(within(drawer()).getByRole("button", { name: "Back" }))],
  ])("Dirty close by %s: Keep editing keeps it; Discard closes with focus on the trigger", async (_path, closeBy) => {
    const { registry } = await renderSection()
    await openAdd()
    await type("Member ID", "XKH")
    expect(registry.get("insurance")?.isDirty).toBe(true)
    expect(registry.getDirtyCount()).toBe(0)
    await closeBy()
    const guard = await screen.findByRole("alertdialog", { name: "You have unsaved changes" })
    await click(within(guard).getByRole("button", { name: "Keep editing" }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    expect((control("Member ID") as HTMLInputElement).value).toBe("XKH")
    await closeBy()
    await click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Discard" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(registry.get("insurance")?.isDirty).toBe(false)
    await waitFor(() => expect(document.activeElement).toBe(headerAdd()))
    // Reopened: the discarded edit is gone.
    await openAdd()
    expect((control("Member ID") as HTMLInputElement).value).toBe("")
  })

  it("Dirty close, Save: invalid stays with focus on the field; a valid one saves and closes", async () => {
    const { server } = await renderSection()
    await openAdd()
    await insurer("Blu", "Blue Shield")
    await act(async () => fireEvent.keyDown(control("Insurer"), { key: "Escape" }))
    await click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    expect(screen.getByRole("dialog", { name: "Add insurance" })).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(control("Type")))
    expect(server.posts).toEqual([])

    await pick("Type", "Medical")
    await pick("Precedence", "Primary")
    await pick("Relationship", "Self")
    await type("Member ID", "XKH123")
    await type("Effective date", "01012025")
    await act(async () => fireEvent.keyDown(control("Member ID"), { key: "Escape" }))
    await click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(server.posts).toHaveLength(1)
    expect(toastSuccess).toHaveBeenCalledWith("Insurance saved.")
  })

  it("Dirty close, Save that fails: the guard closes, the drawer stays with the error", async () => {
    const { server } = await renderSection([], fail("Member Id Number cannot exceed 32 symbols."))
    await openAdd()
    await fillSelf()
    await act(async () => fireEvent.keyDown(control("Member ID"), { key: "Escape" }))
    await click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Save" }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    expect(screen.getByRole("dialog", { name: "Add insurance" })).toBeTruthy()
    await waitFor(() => expect(fieldError("Member ID")).toBe("Member ID must be 3 to 32 characters"))
    expect(server.posts).toHaveLength(1)
  })

  it("page navigation (an unscoped leave) asks too; Discard closes the drawer", async () => {
    await renderSection()
    await openAdd()
    await type("Member ID", "XKH")
    let answer: boolean | undefined
    await act(async () => {
      void requestLeave().then((leave) => {
        answer = leave
      })
    })
    await click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Discard" }))
    await waitFor(() => expect(answer).toBe(true))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })
})

describe("Insurance editor: layout and accessibility", () => {
  it("below 768 px the drawer is full screen with Back in place of Close, and the pairs stack", async () => {
    stubViewport(360)
    await renderSection()
    await openAdd()
    expect(drawer().className).toContain("w-full")
    expect(drawer().className).toContain("md:max-w-[480px]")
    expect(within(drawer()).getByRole("button", { name: "Back" }).className).toContain("md:hidden")
    expect(within(drawer()).getByRole("button", { name: "Close" }).className).toContain("max-md:hidden")
    const pair = control("Type").closest('[data-slot="form-field"]')?.parentElement
    expect(pair?.className).toContain("md:grid-cols-2")
    expect(pair?.className).not.toMatch(/(^| )grid-cols-2/)
  })

  it.each([
    ["light", 1024],
    ["dark", 1024],
    ["light", 360],
    ["dark", 360],
  ] as const)("has no axe violations with the drawer open in %s mode at %i px (Add with a subscriber, Edit locked)", async (theme, width) => {
    stubViewport(width)
    if (theme === "dark") document.documentElement.classList.add("dark")
    await renderSection([SPOUSE_POLICY])
    await openAdd()
    await pick("Relationship", "Spouse")
    await save()
    await waitFor(() => expect(fieldError("Email")).toBe("Email is required"))
    expect(await axeViolations()).toEqual([])
    await act(async () => fireEvent.keyDown(control("Member ID"), { key: "Escape" }))
    await click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Discard" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await openEdit("Delta Dental Dental Insurance")
    expect(await axeViolations()).toEqual([])
  })
})
