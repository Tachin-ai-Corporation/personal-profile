import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { useEffect } from "react"
import { useSWRConfig, type ScopedMutator } from "swr"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { reencodeImage } from "@/components/ui/image-reencode"
import { MyselfErrorClaimProvider, runSaveAll, SectionCountProvider, toastError, toastSuccess, useMyselfErrorClaimed, useSectionCounts } from "@/features/shell"
import { keys, sessionEvents } from "@/lib/api"
import { axeViolations } from "@/test/axe"
import { stubViewport } from "@/test/media"
import { server } from "@/test/msw-server"
import { myselfWire } from "@/test/myself-fixture"
import { renderInPage } from "@/test/providers"
import { PersonalSection } from "."

// The Section's own toasts, observed (the shell's toast API; nothing renders a Toaster here).
vi.mock("@/features/shell/toasts", () => ({ toastSuccess: vi.fn(), toastError: vi.fn(() => ({ id: "t", dismiss: vi.fn() })), toastPartial: vi.fn() }))

// Story 2.4: jsdom has no canvas, so `signature_pad` is a fake that reports strokes on demand
// (the real pad is `e2e/profile-personal.spec.ts`), and `reencodeImage` is stubbed.
const { FakePad, pads } = vi.hoisted(() => {
  const pads: InstanceType<typeof FakePad>[] = []
  class FakePad {
    readonly listeners = new Set<() => void>()
    data: unknown[] = []
    on = vi.fn()
    off = vi.fn()
    constructor() {
      pads.push(this)
    }
    addEventListener(_type: string, listener: () => void): void {
      this.listeners.add(listener)
    }
    removeEventListener(_type: string, listener: () => void): void {
      this.listeners.delete(listener)
    }
    clear(): void {
      this.data = []
    }
    toData(): unknown[] {
      return this.data
    }
    fromData(data: unknown[]): void {
      this.data = this.data.concat(data)
    }
    /** One finished stroke. */
    stroke(): void {
      this.data.push({ points: [] })
      for (const listener of this.listeners) listener()
    }
  }
  return { FakePad, pads }
})
vi.mock("signature_pad", () => ({ default: FakePad }))
vi.mock("@/components/ui/image-reencode", () => ({ reencodeImage: vi.fn() }))

/**
 * Stories 2.1–2.2 (NG-9022): the Personal information read and edit views on
 * `/`, rendered the way `PageFrame` hosts it (`renderInPage`, MSW at `/api`).
 * Covers every I/O matrix row of `spec-2-1-view-personal-information.md` and
 * `spec-2-2-edit-and-save-personal-information.md`.
 */

const MYSELF = "/api/1h/v2/user/myself"
const PERSON_TYPE = "/api/1h/v2/type/key/Person"

/** The F1 order (epics Story 2.1): no email or phone, no group headings. */
const LABELS = [
  "Name prefix",
  "First name",
  "Middle name",
  "Last name",
  "Name suffix",
  "Other names",
  "Titles",
  "Birth date",
  "City of birth",
  "Race",
  "Ethnicity",
  "Biological gender",
  "Gender identity",
  "Sexual orientation",
  "SSN",
  "Signature",
]

/** A full `myself` with the spec's sample birth date. */
const FULL = myselfWire({ birthDate: "1987-03-09" })

/** Counts the requests to each path, answering `myself` with `answer()` and the Person type key with `personAnswer()` (default: no attributes). */
function countRequests(
  answer: () => Response | Promise<Response> = () => HttpResponse.json(FULL),
  personAnswer: () => Response = () => HttpResponse.json({ boKey: "Person", attributes: [] }),
) {
  const counts = { myself: 0, person: 0 }
  const handlers = [
    http.get(MYSELF, () => {
      counts.myself += 1
      return answer()
    }),
    http.get(PERSON_TYPE, () => {
      counts.person += 1
      return personAnswer()
    }),
  ]
  return { counts, handlers }
}

/** The value cell of the row keyed `label` (the cell its `headers` names). */
function valueOf(label: string): HTMLElement {
  const key = screen.getByRole("rowheader", { name: label })
  const cell = document.querySelector<HTMLElement>(`td[headers="${key.id}"]`)
  if (!cell) throw new Error(`no value cell for ${label}`)
  return cell
}

const section = (): HTMLElement => screen.getByRole("region", { name: "Personal information" })
const frame = (): HTMLElement | null => section().querySelector('[data-slot="state-frame"]')

async function renderLoaded(myself: Record<string, unknown> = FULL) {
  const result = renderInPage(<PersonalSection />, { page: "profile", myself })
  await screen.findByRole("table", { name: "Personal information" })
  return result
}

/** The images the pad loaded (the saved Signature, upload previews), in order. */
let images: { src: string; onload: (() => void) | null }[]

beforeEach(() => {
  stubViewport(360)
  // An earlier test's unmount may still write its draft (the registry flushes it): start clean.
  window.localStorage.clear()
  pads.length = 0
  images = []
  vi.stubGlobal(
    "Image",
    class {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      naturalWidth = 0
      naturalHeight = 0
      src = ""
      constructor() {
        images.push(this)
      }
    },
  )
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ({ setTransform: vi.fn(), drawImage: vi.fn() }) as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(new Blob([new Uint8Array([1])], { type: "image/png" })))
  vi.mocked(reencodeImage).mockResolvedValue({ ok: true, blob: new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" }), width: 960, height: 320 })
})
afterEach(() => {
  document.documentElement.classList.remove("dark")
  vi.mocked(toastSuccess).mockClear()
  vi.mocked(toastError).mockClear()
})

describe("PersonalSection: loading", () => {
  it("renders the landmark and h2 from the first render, a kv skeleton in the real container and the #signature anchor", async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    renderInPage(<PersonalSection />, {
      page: "profile",
      handlers: [
        http.get(MYSELF, async () => {
          await gate
          return HttpResponse.json(FULL)
        }),
      ],
    })
    expect(section().id).toBe("personal")
    expect(screen.getByRole("heading", { level: 2, name: "Personal information" }).id).toBe("personal-heading")
    expect(frame()?.getAttribute("data-state")).toBe("loading")
    expect(frame()?.getAttribute("aria-busy")).toBe("true")
    expect(frame()?.getAttribute("data-level")).toBe("section")
    expect(frame()?.querySelector('[data-slot="frame-skeleton"]')?.getAttribute("data-variant")).toBe("kv")
    expect(frame()?.querySelectorAll('[data-slot="frame-skeleton-row"]').length).toBeGreaterThan(0)
    expect(screen.getByText("Loading personal information")).toBeTruthy()
    const anchor = document.getElementById("signature")
    expect(anchor?.closest('[data-slot="state-frame"]')).toBe(frame())
    expect(anchor?.querySelector(".animate-pulse")?.classList.contains("motion-reduce:animate-none")).toBe(true)

    release()
    await screen.findByRole("table", { name: "Personal information" })
    // The same landmark, never remounted; the real row now carries the anchor.
    expect(section().id).toBe("personal")
    expect(document.querySelectorAll("#signature")).toHaveLength(1)
    expect(document.getElementById("signature")?.tagName).toBe("TH")
  })
})

describe("PersonalSection: loaded", () => {
  it("shows the 16 rows in the F1 order at 360 px, one Field | Value pair per row, no email or phone", async () => {
    await renderLoaded()
    const table = screen.getByRole("table", { name: "Personal information" })
    expect(within(table).getAllByRole("rowheader").map((cell) => cell.textContent)).toEqual(LABELS)
    expect(within(table).getAllByRole("row")).toHaveLength(16)
    expect(table.textContent).not.toMatch(/ann\.lee@example\.com|4155552671|Email|Phone/)
  })

  it("fills four columns row by row from 768 px", async () => {
    stubViewport(1024)
    await renderLoaded()
    const rows = within(screen.getByRole("table", { name: "Personal information" })).getAllByRole("row")
    expect(rows).toHaveLength(8)
    expect(rows.flatMap((row) => within(row).getAllByRole("rowheader").map((cell) => cell.textContent))).toEqual(LABELS)
  })

  it("shows the values: names, birth date as MM/DD/YYYY (no shift), demographics as sent", async () => {
    await renderLoaded()
    const expected: Record<string, string> = {
      "Name prefix": "Dr.",
      "First name": "Ann",
      "Middle name": "Marie",
      "Last name": "Lee",
      "Name suffix": "Jr.",
      "Other names": "Ann Smith",
      Titles: "MD",
      "Birth date": "03/09/1987",
      "City of birth": "Springfield",
      Race: "Asian",
      Ethnicity: "Not Hispanic or Latino",
      "Biological gender": "Female",
      "Gender identity": "Woman",
      "Sexual orientation": "Straight",
    }
    for (const [label, value] of Object.entries(expected)) expect(valueOf(label).textContent, label).toBe(value)
  })

  it("shows the Masked SSN in mono-value", async () => {
    await renderLoaded()
    const ssn = within(valueOf("SSN")).getByText("***-**-1234")
    expect(ssn.classList.contains("mono-value")).toBe(true)
  })

  it("shows the Signature thumbnail from the proxy, alt \"Your signature\", on the #signature row, with no Added meta", async () => {
    await renderLoaded()
    const img = within(valueOf("Signature")).getByRole("img", { name: "Your signature" })
    expect(img.getAttribute("src")).toBe("/api/1h/v2/file/501/download")
    expect(screen.getByRole("rowheader", { name: "Signature" }).id).toBe("signature")
    expect(valueOf("Signature").textContent).not.toMatch(/Added/)
  })

  it("a broken signature image reads \"Not provided\", never a broken image", async () => {
    await renderLoaded()
    fireEvent.error(within(valueOf("Signature")).getByRole("img"))
    expect(within(valueOf("Signature")).queryByRole("img")).toBeNull()
    const fallback = within(valueOf("Signature")).getByText("Not provided")
    expect(fallback.classList.contains("text-muted-foreground")).toBe(true)
    expect(fallback.classList.contains("font-normal")).toBe(true)
  })

  it("no signature reads \"Not provided\" and the row keeps id=\"signature\"", async () => {
    await renderLoaded(myselfWire({ signature: null }))
    expect(valueOf("Signature").textContent).toBe("Not provided")
    expect(within(valueOf("Signature")).queryByRole("img")).toBeNull()
    expect(document.getElementById("signature")?.textContent).toBe("Signature")
  })

  it("reports ready to the Section frame (deep-link re-scroll)", async () => {
    const { frameReady } = await renderLoaded()
    await waitFor(() => expect(frameReady).toHaveBeenCalledWith("personal"))
  })

  it("reports no count, so the Section index count stays blank", async () => {
    let counts: ReturnType<typeof useSectionCounts> = {}
    function CountsProbe() {
      counts = useSectionCounts()
      return null
    }
    renderInPage(
      <SectionCountProvider>
        <PersonalSection />
        <CountsProbe />
      </SectionCountProvider>,
      { page: "profile" },
    )
    await screen.findByRole("table", { name: "Personal information" })
    expect(counts.personal).toBeUndefined()
  })

  it("has two actions: the outline Edit button (Story 2.2) and the SSN's Reveal (Story 2.3)", async () => {
    await renderLoaded()
    const buttons = within(section()).getAllByRole("button")
    expect(buttons.map((button) => button.textContent)).toEqual(["Edit", "Reveal"])
    expect(buttons[0].id).toBe("personal-edit")
    expect(buttons[1].getAttribute("aria-label")).toBe("Reveal SSN")
    expect(within(valueOf("SSN")).getByRole("button", { name: "Reveal SSN" })).toBe(buttons[1])
  })
})

describe("PersonalSection: empty values", () => {
  it.each([
    ["null", null],
    ["empty", ""],
    ["blank", "   "],
    ["n/a", "n/a"],
    ["N/A", "N/A"],
  ])("%s values read \"Not provided\" in the muted 400 style", async (_name, empty) => {
    await renderLoaded(
      myselfWire({
        namePrefix: empty,
        middleName: empty,
        nameSuffix: empty,
        otherNames: empty,
        titles: empty,
        birthDate: empty,
        cityOfBirth: empty,
        race: empty,
        ethnicity: empty,
        biologicalGender: empty,
        genderIdentity: empty,
        sexualOrientation: empty,
        socialSecurityNumber: empty,
        signature: null,
      }),
    )
    for (const label of LABELS.filter((name) => name !== "First name" && name !== "Last name")) {
      const cell = valueOf(label)
      expect(cell.textContent, label).toBe("Not provided")
      const text = within(cell).getByText("Not provided")
      expect(text.classList.contains("text-muted-foreground"), label).toBe(true)
      expect(text.classList.contains("font-normal"), label).toBe(true)
    }
  })

  it("an empty list reads \"Not provided\" (a field that is not a string maps to null)", async () => {
    await renderLoaded(myselfWire({ race: [], titles: [] }))
    expect(valueOf("Race").textContent).toBe("Not provided")
    expect(valueOf("Titles").textContent).toBe("Not provided")
  })
})

describe("PersonalSection: SSN shows only a mask", () => {
  it.each([
    ["a full SSN", "123-45-6789"],
    ["nine digits", "123456789"],
    ["five digits behind a mask", "***-*1-2345"],
    ["text around a mask", "***-**-1234 (Ann)"],
    ["no asterisk", "1234"],
  ])("%s reads \"Not provided\"", async (_name, socialSecurityNumber) => {
    await renderLoaded(myselfWire({ socialSecurityNumber }))
    expect(valueOf("SSN").textContent).toBe("Not provided")
    expect(valueOf("SSN").querySelector(".mono-value")).toBeNull()
  })

  it.each(["***-**-1234", "*****1234", "***-**-****"])("a mask (%s) shows as is, with Reveal", async (socialSecurityNumber) => {
    await renderLoaded(myselfWire({ socialSecurityNumber }))
    expect(valueOf("SSN").querySelector(".mono-value")?.textContent).toBe(socialSecurityNumber)
    expect(within(valueOf("SSN")).getByRole("button", { name: "Reveal SSN" })).toBeTruthy()
  })

  it("no safe mask: \"Not provided\" and no Reveal (Story 2.3)", async () => {
    await renderLoaded(myselfWire({ socialSecurityNumber: "n/a" }))
    expect(within(valueOf("SSN")).queryByRole("button")).toBeNull()
  })
})

describe("PersonalSection: load error", () => {
  it("shows \"Couldn't load personal information\" + Retry, claims the page banner, and Retry refetches only myself", async () => {
    let fail = true
    const { counts, handlers } = countRequests(() => (fail ? HttpResponse.json({ message: "boom" }, { status: 500 }) : HttpResponse.json(FULL)))
    let claimed = false
    function ClaimProbe() {
      claimed = useMyselfErrorClaimed()
      return null
    }
    renderInPage(
      <MyselfErrorClaimProvider>
        <PersonalSection />
        <ClaimProbe />
      </MyselfErrorClaimProvider>,
      { page: "profile", handlers },
    )
    const alert = await screen.findByText("Couldn't load personal information")
    expect(alert.closest('[data-slot="state-frame"]')?.getAttribute("data-state")).toBe("error")
    expect(claimed).toBe(true)
    // Outside loading the anchor is a bare target: no "Signature" row under the error.
    const anchor = document.getElementById("signature")
    expect(anchor?.closest('[data-slot="state-frame"]')).toBeTruthy()
    expect(anchor?.getAttribute("role")).toBeNull()
    expect(anchor?.textContent).toBe("")
    await waitFor(() => expect(counts.person).toBe(1))
    const before = { ...counts }

    fail = false
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    await screen.findByRole("table", { name: "Personal information" })
    expect(counts.myself).toBe(before.myself + 1)
    expect(counts.person).toBe(before.person)
    await waitFor(() => expect(claimed).toBe(false))
  })

  it("a repeated failure is re-announced once it arrives, not on the Retry click", async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let calls = 0
    const { counts, handlers } = countRequests(async () => {
      calls += 1
      if (calls > 1) await gate
      return HttpResponse.json({ message: "boom" }, { status: 500 })
    })
    renderInPage(<PersonalSection />, { page: "profile", handlers })
    const first = await screen.findByText("Couldn't load personal information")
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(counts.myself).toBe(2))
    // The retry is still pending: the stale error is not re-announced.
    expect(screen.getByText("Couldn't load personal information")).toBe(first)

    release()
    // The second failure is a new attempt: the live sentence remounts, so assistive tech hears it again.
    await waitFor(() => expect(screen.getByText("Couldn't load personal information")).not.toBe(first))
    expect(screen.getByText("Couldn't load personal information").getAttribute("role")).toBe("alert")
  })

  it("a failed background revalidation keeps the loaded table and leaves the page banner unclaimed", async () => {
    let fail = false
    const { counts, handlers } = countRequests(() => (fail ? HttpResponse.json({ message: "boom" }, { status: 500 }) : HttpResponse.json(FULL)))
    let claimed = false
    let mutate: ScopedMutator | undefined
    function Probe() {
      claimed = useMyselfErrorClaimed()
      const { mutate: scoped } = useSWRConfig()
      useEffect(() => {
        mutate = scoped
      }, [scoped])
      return null
    }
    renderInPage(
      <MyselfErrorClaimProvider>
        <PersonalSection />
        <Probe />
      </MyselfErrorClaimProvider>,
      { page: "profile", handlers },
    )
    await screen.findByRole("table", { name: "Personal information" })
    const before = counts.myself

    fail = true
    await mutate?.(keys.myself())
    await waitFor(() => expect(counts.myself).toBe(before + 1))
    expect(screen.getByRole("table", { name: "Personal information" })).toBeTruthy()
    expect(frame()?.getAttribute("data-state")).toBe("ready")
    expect(screen.queryByText("Couldn't load personal information")).toBeNull()
    expect(claimed).toBe(false)
  })
})

describe("PersonalSection: option lists", () => {
  it("loads the Person type key on mount", async () => {
    const { counts, handlers } = countRequests()
    renderInPage(<PersonalSection />, { page: "profile", handlers })
    await screen.findByRole("table", { name: "Personal information" })
    await waitFor(() => expect(counts.person).toBe(1))
  })

  it("a failed type key leaves the read view unaffected", async () => {
    const { counts, handlers } = countRequests(undefined, () => HttpResponse.json({ message: "boom" }, { status: 500 }))
    renderInPage(<PersonalSection />, { page: "profile", handlers })
    await screen.findByRole("table", { name: "Personal information" })
    await waitFor(() => expect(counts.person).toBe(1))
    // Let the failed response settle into SWR before checking the view.
    await act(async () => undefined)
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.queryByText(/Couldn't load/)).toBeNull()
    expect(valueOf("Race").textContent).toBe("Asian")
  })
})

describe("PersonalSection: accessibility", () => {
  it.each([
    ["light", 360],
    ["dark", 360],
    ["light", 1024],
    ["dark", 1024],
  ] as const)("has no axe violations in %s mode at %i px", async (theme, width) => {
    stubViewport(width)
    if (theme === "dark") document.documentElement.classList.add("dark")
    await renderLoaded()
    expect(await axeViolations()).toEqual([])
  })

  it.each(["light", "dark"])("has no axe violations while loading in %s mode", async (theme) => {
    if (theme === "dark") document.documentElement.classList.add("dark")
    renderInPage(<PersonalSection />, { page: "profile", handlers: [http.get(MYSELF, () => new Promise<Response>(() => undefined))] })
    expect(frame()?.getAttribute("data-state")).toBe("loading")
    expect(await axeViolations()).toEqual([])
  })

  it("has no axe violations with the load error", async () => {
    renderInPage(<PersonalSection />, { page: "profile", handlers: [http.get(MYSELF, () => HttpResponse.json({}, { status: 500 }))] })
    await screen.findByText("Couldn't load personal information")
    expect(await axeViolations()).toEqual([])
  })
})

// --- Story 2.2: edit and save -------------------------------------------------------------------

const EDIT = "/api/1h/v2/user/edit"
const DRAFT_KEY = "pp:draft:v1:demo:42:personal"

/** The optional fields' labels (muted "(optional)" suffix). */
const OPTIONAL_LABELS = ["Name prefix", "Middle name", "Name suffix", "Other names", "Titles", "City of birth", "Sexual orientation", "SSN", "Signature"]

/** Records each `PUT v2/user/edit` body, answering with `answer()` (default: 200 with the user). */
function recordPuts(answer: () => Response | Promise<Response> = () => HttpResponse.json(FULL)) {
  const bodies: Record<string, unknown>[] = []
  const handler = http.put(EDIT, async ({ request }) => {
    bodies.push((await request.json()) as Record<string, unknown>)
    return answer()
  })
  return { bodies, handler }
}

async function renderEditing(myself: Record<string, unknown> = FULL, handlers: Parameters<typeof renderInPage>[1]["handlers"] = []) {
  const result = renderInPage(<PersonalSection />, { page: "profile", myself, handlers })
  await screen.findByRole("table", { name: "Personal information" })
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Edit" })))
  return result
}

/** The control labelled `label` (with or without the "(optional)" suffix); an open combobox listbox shares its name. */
function control(label: string): HTMLElement {
  const matches = screen.getAllByLabelText(new RegExp(`^${label}( \\(optional\\))?$`)).filter((el) => el.getAttribute("role") !== "listbox")
  if (matches.length !== 1) throw new Error(`expected one control labelled ${label}, found ${matches.length}`)
  return matches[0]
}

async function type(label: string, value: string) {
  await act(async () => fireEvent.change(control(label), { target: { value } }))
}

async function blur(label: string) {
  await act(async () => fireEvent.blur(control(label)))
}

async function save() {
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })))
}

const heading = () => screen.getByRole("heading", { level: 2, name: "Personal information" })
const isReadView = () => screen.queryByRole("table", { name: "Personal information" }) !== null && screen.queryByRole("button", { name: "Save" }) === null

describe("PersonalSection: edit view (Story 2.2)", () => {
  it("Edit switches in place: Editing in the header, the editing container, focus on Name prefix, the F1 order", async () => {
    await renderEditing()
    expect(section().id).toBe("personal")
    expect(within(section()).getByText("Editing")).toBeTruthy()
    expect(section().querySelector('[data-slot="section-container"]')?.getAttribute("data-editing")).toBe("true")
    expect(document.activeElement).toBe(control("Name prefix"))
    const labels = [...section().querySelectorAll("label")].map((label) => label.textContent?.replace(/ \(optional\)$/, ""))
    expect(labels).toEqual(LABELS)
    expect(within(section()).queryByRole("button", { name: "Edit" })).toBeNull()
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy()
  })

  it("optional fields read \"(optional)\"; required fields carry no marker but aria-required", async () => {
    await renderEditing()
    for (const label of LABELS) {
      const text = [...section().querySelectorAll("label")].find((el) => el.textContent?.startsWith(label))?.textContent
      expect(text, label).toBe(OPTIONAL_LABELS.includes(label) ? `${label} (optional)` : label)
    }
    for (const label of ["First name", "Last name", "Birth date", "Race", "Ethnicity", "Biological gender", "Gender identity"]) {
      expect(control(label).getAttribute("aria-required"), label).toBe("true")
    }
    expect(control("Middle name").getAttribute("aria-required")).toBeNull()
  })

  it("shows the help: Other names, Gender identity, Sexual orientation and the age rule", async () => {
    await renderEditing()
    const help = (label: string) => {
      const ids = control(label).getAttribute("aria-describedby")?.split(" ") ?? []
      return ids.map((id) => document.getElementById(id)?.textContent).join(" ")
    }
    expect(help("Other names")).toBe("Former or other legal names.")
    expect(help("Gender identity")).toBe("Choose from the list or type your own.")
    expect(help("Sexual orientation")).toBe("Up to 128 characters.")
    expect(help("Birth date")).toBe("You must be between 18 and 120 years old")
  })

  it("Proctor: the age help says 21", async () => {
    await renderEditing(myselfWire({ roles: ["Proctor"] }))
    expect(screen.getByText("You must be between 21 and 120 years old")).toBeTruthy()
  })

  it("shows the saved values; the SSN input holds the mask; the Signature row holds the pad (keeps #signature)", async () => {
    await renderEditing()
    expect((control("First name") as HTMLInputElement).value).toBe("Ann")
    expect((control("Birth date") as HTMLInputElement).value).toBe("03/09/1987")
    expect(control("Race").textContent).toBe("Asian")
    expect(control("Biological gender").textContent).toBe("Female")
    expect((control("Gender identity") as HTMLInputElement).value).toBe("Woman")
    expect((control("SSN") as HTMLInputElement).value).toBe("***-**-1234")
    // The row's label points at the canvas (an img named "Draw your signature").
    const label = [...section().querySelectorAll("label")].find((element) => element.textContent?.startsWith("Signature"))
    expect(document.getElementById(label?.htmlFor ?? "")).toBe(screen.getByRole("img", { name: "Draw your signature" }))
    expect(document.getElementById("signature")?.textContent).toContain("Signature")
    // 12 text-like inputs and the pad's hidden file input.
    expect(section().querySelectorAll("input").length).toBe(13)
  })

  it("lays out a 240 px key column from 768 px", async () => {
    stubViewport(1024)
    await renderEditing()
    const table = section().querySelector('[data-slot="key-value-edit-table"]')
    expect(table?.tagName).toBe("TABLE")
    expect(within(table as HTMLElement).getAllByRole("rowheader")).toHaveLength(16)
    expect(document.getElementById("signature")?.tagName).toBe("TH")
  })

  it("Enter in a field does not save, and Escape does not cancel", async () => {
    const { bodies, handler } = recordPuts()
    await renderEditing(FULL, [handler])
    await type("First name", "Anna")
    await act(async () => fireEvent.keyDown(control("First name"), { key: "Enter" }))
    await act(async () => fireEvent.keyDown(control("First name"), { key: "Escape" }))
    expect(bodies).toEqual([])
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy()
    expect(screen.getByText("Unsaved changes")).toBeTruthy()
  })

  it("Cancel reverts only this Section, returns to read view and focuses the h2", async () => {
    const { bodies, handler } = recordPuts()
    const { registry } = await renderEditing(FULL, [handler])
    await type("First name", "Anna")
    expect(registry.get("personal")?.isDirty).toBe(true)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Cancel" })))
    expect(isReadView()).toBe(true)
    expect(valueOf("First name").textContent).toBe("Ann")
    expect(document.activeElement).toBe(heading())
    expect(registry.get("personal")?.isDirty).toBe(false)
    expect(bodies).toEqual([])
  })

  it("registers as personal, \"Personal information\", display order 1", async () => {
    const { registry } = await renderLoaded()
    expect(registry.get("personal")).toMatchObject({ id: "personal", label: "Personal information", displayOrder: 1, draftFields: [
      "namePrefix",
      "firstName",
      "middleName",
      "lastName",
      "nameSuffix",
      "otherNames",
      "titles",
      "birthDate",
      "cityOfBirth",
      "race",
      "ethnicity",
      "biologicalGender",
      "genderIdentity",
      "sexualOrientation",
    ] })
  })
})

describe("PersonalSection: save (Story 2.2)", () => {
  it("sends only the changed field, trimmed; read view, toast, h2 focus, draft cleared", async () => {
    const { bodies, handler } = recordPuts()
    await renderEditing(myselfWire({ birthDate: "1987-03-09", firstName: "Ann " }), [handler])
    await type("First name", "Anna ")
    await waitFor(() => expect(window.localStorage.getItem(DRAFT_KEY)).not.toBeNull(), { timeout: 2000 })
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([{ firstName: "Anna" }])
    expect(toastSuccess).toHaveBeenCalledWith("Personal information saved.")
    expect(document.activeElement).toBe(heading())
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it("a cleared optional field is sent as n/a", async () => {
    const { bodies, handler } = recordPuts()
    await renderEditing(FULL, [handler])
    await type("Middle name", "")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([{ middleName: "n/a" }])
  })

  it("a changed birth date goes out as YYYY-MM-DD", async () => {
    const { bodies, handler } = recordPuts()
    await renderEditing(FULL, [handler])
    await type("Birth date", "04151990")
    expect((control("Birth date") as HTMLInputElement).value).toBe("04/15/1990")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([{ birthDate: "1990-04-15" }])
  })

  it("unset Race, Ethnicity, Biological gender and Gender identity are preselected and sent, but write no draft", async () => {
    const { bodies, handler } = recordPuts()
    await renderEditing(myselfWire({ race: null, ethnicity: "n/a", biologicalGender: "", genderIdentity: null }), [handler])
    expect(control("Race").textContent).toBe("Unknown")
    expect(control("Ethnicity").textContent).toBe("Unknown")
    expect(control("Biological gender").textContent).toBe("Asked but not answered")
    expect((control("Gender identity") as HTMLInputElement).value).toBe("Asked but not answered")
    expect(screen.getByText("Unsaved changes")).toBeTruthy()
    // Presets alone are not the user's change: no draft after the debounce.
    await act(async () => new Promise((resolve) => setTimeout(resolve, 700)))
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull()
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([{ race: "Unknown", ethnicity: "Unknown", biologicalGender: "Asked but not answered", genderIdentity: "Asked but not answered" }])
  })

  it("no changes: Save sends nothing, returns to read view without a toast and focuses the h2", async () => {
    const { bodies, handler } = recordPuts()
    await renderEditing(FULL, [handler])
    await save()
    expect(isReadView()).toBe(true)
    expect(bodies).toEqual([])
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(heading())
  })

  it("a whitespace-only edit sends nothing and still reads saved (accepted)", async () => {
    const { bodies, handler } = recordPuts()
    await renderEditing(FULL, [handler])
    await type("First name", "Ann  ")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([])
    expect(toastSuccess).toHaveBeenCalledWith("Personal information saved.")
  })

  it("invalid: nothing is sent, the first invalid field (First name) is focused, every error sits under its field", async () => {
    const { bodies, handler } = recordPuts()
    await renderEditing(FULL, [handler])
    await type("First name", "a".repeat(25))
    await type("Birth date", "")
    await save()
    expect(bodies).toEqual([])
    expect(document.activeElement).toBe(control("First name"))
    for (const [label, message] of [
      ["First name", "First name can be up to 24 characters"],
      ["Birth date", "Birth date is required"],
    ]) {
      const field = control(label)
      expect(field.getAttribute("aria-invalid"), label).toBe("true")
      const described = field.getAttribute("aria-describedby")?.split(" ").map((id) => document.getElementById(id)?.textContent)
      expect(described, label).toContain(message)
    }
    // The age help hides while the Birth date shows its error.
    expect(screen.queryByText("You must be between 18 and 120 years old")).toBeNull()
  })

  /** Save with `label` the only invalid field: nothing is sent, that control has focus, no Section error. */
  async function expectFocusedInvalid(label: string, bodies: unknown[]) {
    await save()
    expect(bodies).toEqual([])
    expect(document.activeElement).toBe(control(label))
    expect(control(label).getAttribute("aria-invalid")).toBe("true")
    expect(document.querySelector("[data-slot~='inline-banner']")).toBeNull()
  }

  it("Birth date cleared alone: Save focuses the date input itself", async () => {
    const { bodies, handler } = recordPuts()
    await renderEditing(FULL, [handler])
    await type("Birth date", "")
    await expectFocusedInvalid("Birth date", bodies)
  })

  it("Gender identity cleared alone: Save focuses the combobox input", async () => {
    const { bodies, handler } = recordPuts()
    await renderEditing(FULL, [handler])
    await type("Gender identity", "")
    await expectFocusedInvalid("Gender identity", bodies)
    expect(screen.getByText("Choose a value")).toBeTruthy()
  })

  it("Race empty (a draft restored while editing): Save focuses the Race trigger and reads \"Choose a value\"", async () => {
    const { bodies, handler } = recordPuts()
    const { registry } = await renderEditing(FULL, [handler])
    await act(async () => {
      registry.get("personal")?.applyDraft?.({ race: "" })
    })
    await expectFocusedInvalid("Race", bodies)
    expect(screen.getByText("Choose a value")).toBeTruthy()
  })

  it("while the save is in flight the non-native controls are inert", async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const { bodies, handler } = recordPuts(async () => {
      await gate
      return HttpResponse.json(FULL)
    })
    await renderEditing(FULL, [handler])
    await type("First name", "Anna")
    await save()
    await waitFor(() => expect(bodies).toHaveLength(1))
    const race = control("Race")
    expect(race.getAttribute("aria-readonly")).toBe("true")
    await act(async () => {
      fireEvent.keyDown(race, { key: "Enter" })
      fireEvent.keyDown(race, { key: "ArrowDown" })
    })
    expect(screen.queryByRole("listbox")).toBeNull()
    expect(race.getAttribute("aria-expanded")).toBe("false")
    await type("Gender identity", "Typed while saving")
    expect((control("Gender identity") as HTMLInputElement).value).toBe("Woman")

    await act(async () => release())
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([{ firstName: "Anna" }])
  })

  it("validates on blur: a 129-character City of birth, a non-printable Sexual orientation", async () => {
    await renderEditing()
    await type("City of birth", "c".repeat(129))
    await blur("City of birth")
    await type("Sexual orientation", "\u0007")
    await blur("Sexual orientation")
    await waitFor(() => expect(screen.getByText("Up to 128 characters")).toBeTruthy())
    expect(screen.getByText("Use letters, spaces and standard punctuation only")).toBeTruthy()
  })

  it("a birth date one day short of 18 shows the age error", async () => {
    await renderEditing()
    const today = new Date()
    const short = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate() + 1)
    const text = [short.getMonth() + 1, short.getDate()].map((n) => String(n).padStart(2, "0")).join("/") + `/${short.getFullYear()}`
    await type("Birth date", text.replaceAll("/", ""))
    await blur("Birth date")
    await waitFor(() => expect(control("Birth date").getAttribute("aria-invalid")).toBe("true"))
    expect(screen.getByText("You must be between 18 and 120 years old").closest('[data-slot="field-error"], [id$="-error"]')).toBeTruthy()
  })

  it("a saved value the picker doesn't offer shows on the trigger and is not sent while unchanged", async () => {
    const { bodies, handler } = recordPuts()
    await renderEditing(myselfWire({ biologicalGender: "Intersex" }), [handler])
    expect(control("Biological gender").textContent).toBe("Intersex")
    await type("First name", "Anna")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([{ firstName: "Anna" }])
  })

  it("Gender identity takes free text", async () => {
    const { bodies, handler } = recordPuts()
    await renderEditing(FULL, [handler])
    await type("Gender identity", "Nonbinary")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([{ genderIdentity: "Nonbinary" }])
  })

  it("a full diff never carries email, phoneNumber or phoneNumberRegion although myself has them (AD-9)", async () => {
    const { bodies, handler } = recordPuts()
    await renderEditing(
      myselfWire({ email: "ann.lee@example.com", phoneNumber: "+14155552671", race: null, ethnicity: null, biologicalGender: null, genderIdentity: null }),
      [handler],
    )
    const edits: [string, string][] = [
      ["Name prefix", "Ms."],
      ["First name", "Anna"],
      ["Middle name", "May"],
      ["Last name", "Lim"],
      ["Name suffix", "II"],
      ["Other names", "Anna Smith"],
      ["Titles", "PhD"],
      ["Birth date", "01021980"],
      ["City of birth", "Shelbyville"],
      ["Gender identity", "Female"],
      ["Sexual orientation", "Bisexual"],
    ]
    for (const [label, value] of edits) await type(label, value)
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(Object.keys(bodies[0]).toSorted()).toEqual([...PERSONAL_FIELDS].toSorted())
    for (const field of ["email", "phoneNumber", "phoneNumberRegion", "socialSecurityNumber"]) expect(bodies[0]).not.toHaveProperty(field)
  })
})

/** The 14 fields a Personal-information body may carry (Story 2.3 adds the SSN). */
const PERSONAL_FIELDS = [
  "namePrefix",
  "firstName",
  "middleName",
  "lastName",
  "nameSuffix",
  "otherNames",
  "titles",
  "birthDate",
  "cityOfBirth",
  "race",
  "ethnicity",
  "biologicalGender",
  "genderIdentity",
  "sexualOrientation",
]

describe("PersonalSection: save failures (Story 2.2)", () => {
  /** Console spies of a test, restored even when an assertion fails. */
  const consoleSpies: { mockRestore: () => void }[] = []
  afterEach(() => {
    for (const spy of consoleSpies.splice(0)) spy.mockRestore()
  })

  it("a 400 SSN taken marks only the SSN field and focuses it; stays in edit with the values; no SSN leaks (Story 2.3, Q3)", async () => {
    const spies = (["log", "info", "warn", "error", "debug", "group", "groupCollapsed"] as const).map((method) => vi.spyOn(console, method))
    consoleSpies.push(...spies)
    let cache: ReturnType<typeof useSWRConfig>["cache"] | undefined
    function CacheProbe() {
      cache = useSWRConfig().cache
      return null
    }
    const { bodies, handler } = recordPuts(() =>
      HttpResponse.json({ message: "The Social Security Number {123-45-6789} already belongs to another person." }, { status: 400 }),
    )
    renderInPage(
      <>
        <PersonalSection />
        <CacheProbe />
      </>,
      { page: "profile", myself: FULL, handlers: [handler] },
    )
    await screen.findByRole("table", { name: "Personal information" })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Edit" })))
    await type("First name", "Anna")
    await type("SSN", "123456789")
    await save()
    await waitFor(() => expect(control("SSN").getAttribute("aria-invalid")).toBe("true"))
    expect(bodies).toEqual([{ firstName: "Anna", socialSecurityNumber: "123-45-6789" }])
    const describedBy = control("SSN").getAttribute("aria-describedby")?.split(" ") ?? []
    expect(describedBy.map((id) => document.getElementById(id)?.textContent)).toContain("This SSN belongs to another person")
    expect(document.activeElement).toBe(control("SSN"))
    expect(section().querySelectorAll('[aria-invalid="true"]')).toHaveLength(1)
    expect(section().querySelector('[data-slot~="inline-banner"]')).toBeNull()
    expect((control("First name") as HTMLInputElement).value).toBe("Anna")
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy()
    expect(toastError).not.toHaveBeenCalled()

    // The backend's message holds the typed SSN: it is shown nowhere and kept nowhere.
    const ssn = /(?<![\d-])\d{3}-?\d{2}-?\d{4}(?![\d-])/
    expect(document.body.innerHTML).not.toMatch(ssn)
    const logged = spies.flatMap((spy) => spy.mock.calls).map((args) => JSON.stringify(args))
    for (const line of logged) expect(line).not.toMatch(ssn)
    if (!cache) throw new Error("no SWR cache")
    const swr = cache
    for (const key of swr.keys()) expect(`${key} ${JSON.stringify(swr.get(key) ?? null)}`).not.toMatch(ssn)
    for (const storage of [window.localStorage, window.sessionStorage]) {
      for (let index = 0; index < storage.length; index += 1) expect(storage.getItem(storage.key(index) ?? "")).not.toMatch(ssn)
    }
  })

  it("a 400 INVALID_ENUM_VALUE (an unknown code) shows \"Couldn't save personal information.\" with Retry; stays in edit", async () => {
    const { handler } = recordPuts(() => HttpResponse.json({ message: "Invalid enum value", code: "INVALID_ENUM_VALUE" }, { status: 400 }))
    await renderEditing(FULL, [handler])
    await type("First name", "Anna")
    await save()
    const banner = await screen.findByText("Couldn't save personal information.")
    expect(within(banner.closest('[data-slot~="inline-banner"]') as HTMLElement).getByRole("button", { name: "Retry" })).toBeTruthy()
    expect(screen.queryByText("Invalid enum value")).toBeNull()
    expect((control("First name") as HTMLInputElement).value).toBe("Anna")
    expect(toastError).not.toHaveBeenCalled()
  })

  it("a network failure or 5xx shows the connection error; Retry resends the same diff", async () => {
    let fail = true
    const { bodies, handler } = recordPuts(() =>
      fail ? HttpResponse.json({ errorCode: "SERVICE_DISABLED", source: "proxy" }, { status: 503 }) : HttpResponse.json(FULL),
    )
    await renderEditing(FULL, [handler])
    await type("First name", "Anna")
    await type("Middle name", "")
    await save()
    const banner = await screen.findByText("Couldn't save personal information. Check your connection.")
    expect(toastError).toHaveBeenCalledWith("Couldn't save personal information. Check your connection.", expect.anything())
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy()

    fail = false
    await act(async () => fireEvent.click(within(banner.closest('[data-slot~="inline-banner"]') as HTMLElement).getByRole("button", { name: "Retry" })))
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([
      { firstName: "Anna", middleName: "n/a" },
      { firstName: "Anna", middleName: "n/a" },
    ])
  })

  it("the registered save (Save all) resolves a result without throwing", async () => {
    const { bodies, handler } = recordPuts(() => HttpResponse.error())
    const { registry } = await renderEditing(FULL, [handler])
    await type("First name", "Anna")
    let result: unknown
    await act(async () => {
      result = await registry.get("personal")?.save?.()
    })
    expect(result).toEqual({ ok: false, error: { code: "NETWORK_ERROR", mapped: { kind: "network" } } })
    expect(bodies).toHaveLength(1)
  })
})

describe("PersonalSection: SSN wiring (Story 2.3)", () => {
  it("the SSN is the 15th field in the first-invalid order: alone it is focused; after First name it is not", async () => {
    const { bodies, handler } = recordPuts()
    await renderEditing(FULL, [handler])
    await type("SSN", "12345")
    await save()
    expect(document.activeElement).toBe(control("SSN"))
    await type("First name", "")
    await save()
    expect(document.activeElement).toBe(control("First name"))
    expect(bodies).toEqual([])
  })

  it("a typed SSN is sent with the other changes; back in read view the form is rebased onto myself (no stale override)", async () => {
    let current: Record<string, unknown> = FULL
    const { bodies, handler } = recordPuts(() => HttpResponse.json(current))
    let mutate: ScopedMutator | undefined
    function MutateProbe() {
      mutate = useSWRConfig().mutate
      return null
    }
    renderInPage(
      <>
        <PersonalSection />
        <MutateProbe />
      </>,
      { page: "profile", myself: FULL, handlers: [handler, http.get(MYSELF, () => HttpResponse.json(current))] },
    )
    await screen.findByRole("table", { name: "Personal information" })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Edit" })))
    await type("SSN", "987-65-4321")
    current = { ...FULL, socialSecurityNumber: "***-**-4321" }
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([{ socialSecurityNumber: "987-65-4321" }])
    await act(async () => {
      await mutate?.(keys.myself())
    })
    await waitFor(() => expect(valueOf("SSN").querySelector(".mono-value")?.textContent).toBe("***-**-4321"))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Edit" })))
    expect((control("SSN") as HTMLInputElement).value).toBe("***-**-4321")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toHaveLength(1)
  })

  it("a typed save with myself not refetched: Edit again shows the original mask with Reveal, and a second Save sends nothing", async () => {
    const { bodies, handler } = recordPuts()
    await renderEditing(FULL, [handler])
    await type("SSN", "987654321")
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toEqual([{ socialSecurityNumber: "987-65-4321" }])
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Edit" })))
    expect((control("SSN") as HTMLInputElement).value).toBe("***-**-1234")
    expect(within(section()).getAllByRole("button", { name: "Reveal SSN" })).toHaveLength(1)
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(bodies).toHaveLength(1)
  })

  it("Edit pressed while the read-view SSN is revealed: no full SSN anywhere, the edit input shows the mask", async () => {
    server.use(http.get("/api/1h/v2/person/me/ssn/expose", () => HttpResponse.json({ id: 4242, socialSecurityNumber: "123451234" })))
    await renderLoaded()
    await act(async () => fireEvent.click(within(valueOf("SSN")).getByRole("button", { name: "Reveal SSN" })))
    await waitFor(() => expect(within(valueOf("SSN")).getByText("123-45-1234")).toBeTruthy())
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Edit" })))
    expect((control("SSN") as HTMLInputElement).value).toBe("***-**-1234")
    expect(document.body.textContent).not.toMatch(/123-?45-?1234/)
    expect(document.body.innerHTML).not.toMatch(/123-?45-?1234/)
  })

  it("no SSN in the draft after a session expiry flushes it", async () => {
    await renderEditing()
    await type("First name", "Anna")
    await type("SSN", "123456789")
    await act(async () => sessionEvents.publish("session-expired"))
    await waitFor(() => expect(window.localStorage.getItem(DRAFT_KEY)).not.toBeNull())
    const raw = window.localStorage.getItem(DRAFT_KEY) ?? ""
    expect(raw).toContain("Anna")
    expect(raw).not.toMatch(/socialSecurityNumber|ssn|123-?45-?6789|\*\*\*-\*\*-1234/i)
  })
})

describe("PersonalSection: drafts (Story 2.2)", () => {
  it("a user change writes the 14 fields only: never the SSN or Signature", async () => {
    await renderEditing()
    await type("First name", "Anna")
    await waitFor(() => expect(window.localStorage.getItem(DRAFT_KEY)).not.toBeNull(), { timeout: 2000 })
    const stored = JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? "{}") as { values: Record<string, unknown> }
    expect(Object.keys(stored.values).toSorted()).toEqual([...PERSONAL_FIELDS].toSorted())
    expect(stored.values.firstName).toBe("Anna")
    const raw = window.localStorage.getItem(DRAFT_KEY) ?? ""
    expect(raw).not.toMatch(/socialSecurityNumber|signature|\*\*\*-\*\*-1234|501/i)
  })
})

describe("PersonalSection: edit view accessibility (Story 2.2)", () => {
  it.each([
    ["light", 360],
    ["dark", 360],
    ["light", 1024],
    ["dark", 1024],
  ] as const)("has no axe violations in %s mode at %i px", async (theme, width) => {
    stubViewport(width)
    if (theme === "dark") document.documentElement.classList.add("dark")
    await renderEditing()
    expect(await axeViolations()).toEqual([])
  })

  it("has no axe violations with field errors shown", async () => {
    await renderEditing()
    await type("First name", "")
    await type("Birth date", "")
    await save()
    expect(await axeViolations()).toEqual([])
  })
})

// --- Story 2.4: Signature -----------------------------------------------------------------------

const UPLOAD = "/api/1h/v2/health/type/Person/me/relation/PersonHasSignatureFile/file/upload"
const FILE_DELETE = "/api/pp/file/:fileId"
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])

/**
 * A server for the Signature tests: the caller's `PersonHasSignatureFile`
 * relations (oldest first; `myself.signature` is the newest) and
 * `state.firstName`. The upload adds relation 57. The delete is the named
 * op's ownership rule: it owns every listed relation (the replaced old one
 * included; 204, removed) and answers 404 `NO_FILE` for anything else. Every
 * write is logged as `METHOD path` (deletes with their status).
 */
function signatureServer(initial: number | null, { upload = () => HttpResponse.json({ id: 57 }) }: { upload?: (attempt: number) => Response | Promise<Response> } = {}) {
  const state = { relations: initial === null ? [] : [initial], firstName: "Ann" }
  const writes: string[] = []
  const newest = () => state.relations.at(-1) ?? null
  const wire = () => myselfWire({ birthDate: "1987-03-09", firstName: state.firstName, signature: newest() === null ? null : { id: newest(), name: "signature.png" } })
  let uploads = 0
  const handlers = [
    http.get(MYSELF, () => HttpResponse.json(wire())),
    http.put(EDIT, async ({ request }) => {
      const body = (await request.json()) as { firstName?: string }
      writes.push(`PUT ${JSON.stringify(body)}`)
      if (body.firstName) state.firstName = body.firstName
      return HttpResponse.json(wire())
    }),
    http.post(UPLOAD, async ({ request }) => {
      uploads += 1
      writes.push(`POST upload${new URL(request.url).search}`)
      const response = await upload(uploads)
      if (response.ok) state.relations.push(57)
      return response
    }),
    http.delete(FILE_DELETE, ({ request, params }) => {
      const id = Number(params.fileId)
      const owned = state.relations.includes(id)
      writes.push(`DELETE ${id}${new URL(request.url).search} ${owned ? 204 : 404}`)
      if (!owned) return HttpResponse.json({ errorCode: "NO_FILE", source: "proxy" }, { status: 404 })
      state.relations = state.relations.filter((relation) => relation !== id)
      return new HttpResponse(null, { status: 204 })
    }),
  ]
  return { state, writes, handlers, wire }
}

async function renderSignatureEdit(initial: number | null, options: Parameters<typeof signatureServer>[1] = {}) {
  const server = signatureServer(initial, options)
  const result = await renderEditing(server.wire(), server.handlers)
  return { ...result, ...server }
}

const pad = () => {
  const last = pads.at(-1)
  if (!last) throw new Error("no pad")
  return last
}
const removeDialog = () => screen.queryByRole("alertdialog", { name: "Remove your signature?" })
const isDirty = () => within(section()).queryByText("Unsaved changes") !== null
const signatureImg = () => within(valueOf("Signature")).queryByRole("img", { name: "Your signature" })

describe("PersonalSection: Signature (Story 2.4)", () => {
  it("the edit row holds the pad: #signature on the row, the help line, the canvas described by it", async () => {
    await renderSignatureEdit(501)
    expect(document.getElementById("signature")?.textContent).toContain("Signature")
    const canvas = screen.getByRole("img", { name: "Draw your signature" })
    const described = (canvas.getAttribute("aria-describedby") ?? "").split(" ").map((id) => document.getElementById(id)?.textContent)
    expect(described[0]).toBe("Draw with a mouse, finger or pen, or upload a PNG or JPEG.")
    expect(within(section()).getByRole("button", { name: "Upload image instead" })).toBeTruthy()
    expect(section().textContent).not.toMatch(/Saved \d|Added/)
  })

  it("clean open: the saved Signature is loaded into the pad from myself's id; not dirty; Save sends nothing", async () => {
    const { writes } = await renderSignatureEdit(501)
    expect(images.map((image) => image.src)).toEqual(["/api/1h/v2/file/501/download"])
    await act(async () => images[0]?.onload?.())
    expect(isDirty()).toBe(false)
    await save()
    expect(isReadView()).toBe(true)
    expect(writes).toEqual([])
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it("no saved Signature: nothing is loaded; a stroke makes it dirty; Save uploads it, refetches myself, shows the new thumbnail, toasts and focuses the h2", async () => {
    const { writes } = await renderSignatureEdit(null)
    expect(images).toEqual([])
    expect(isDirty()).toBe(false)
    act(() => pad().stroke())
    expect(isDirty()).toBe(true)
    act(() => pad().stroke())
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(writes).toEqual(["POST upload"])
    await waitFor(() => expect(signatureImg()?.getAttribute("src")).toBe("/api/1h/v2/file/57/download"))
    expect(toastSuccess).toHaveBeenCalledWith("Personal information saved.")
    expect(document.activeElement).toBe(heading())
  })

  it("the drawing survives the 768 px layout swap (the pad remounts with its strokes); Save still uploads it", async () => {
    const setWidth = stubViewport(360)
    const { writes } = await renderSignatureEdit(null)
    act(() => pad().stroke())
    const before = pad()
    act(() => setWidth(1024))
    await waitFor(() => expect(pad()).not.toBe(before))
    expect(pad().toData()).toHaveLength(1)
    expect(document.querySelector('[data-slot="signature-cue"]')).toBeNull()
    expect(isDirty()).toBe(true)
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(writes).toEqual(["POST upload"])
  })

  it("replace: an uploaded PNG is re-encoded, uploaded, then the old file is deleted through the named op", async () => {
    const { writes, state } = await renderSignatureEdit(501)
    const file = new File([PNG_BYTES], "mine.png", { type: "image/png" })
    await act(async () => fireEvent.change(screen.getByTestId("signature-file-input"), { target: { files: [file] } }))
    await waitFor(() => expect(isDirty()).toBe(true))
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(writes).toEqual(["POST upload", "DELETE 501 204"])
    // The old relation is gone; only the new Signature is left.
    expect(state.relations).toEqual([57])
    await waitFor(() => expect(signatureImg()?.getAttribute("src")).toBe("/api/1h/v2/file/57/download"))
  })

  it("remove: Clear → Save asks \"Remove your signature?\" (Cancel focused); Remove signature deletes it; the read view says Not provided", async () => {
    const { writes } = await renderSignatureEdit(501)
    fireEvent.click(within(section()).getByRole("button", { name: "Clear" }))
    expect(isDirty()).toBe(true)
    await save()
    const dialog = removeDialog()
    if (!dialog) throw new Error("no confirm")
    expect(dialog.textContent).toContain("Documents you sign will no longer carry it.")
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Cancel" }))
    expect(within(dialog).getByRole("button", { name: "Remove signature" }).className).toMatch(/destructive/)
    expect(await axeViolations()).toEqual([])
    expect(writes).toEqual([])
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Remove signature" })))
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(writes).toEqual(["DELETE 501 204"])
    await waitFor(() => expect(valueOf("Signature").textContent).toBe("Not provided"))
  })

  it.each(["Cancel", "Escape"])("remove cancelled (%s): nothing is sent; still editing with the pad empty; no error; focus back on Save", async (how) => {
    const { writes } = await renderSignatureEdit(501)
    fireEvent.click(within(section()).getByRole("button", { name: "Clear" }))
    const saveButton = screen.getByRole("button", { name: "Save" })
    saveButton.focus()
    await save()
    const dialog = removeDialog()
    if (!dialog) throw new Error("no confirm")
    await act(async () => {
      if (how === "Cancel") fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))
      else fireEvent.keyDown(dialog, { key: "Escape" })
    })
    await waitFor(() => expect(removeDialog()).toBeNull())
    expect(writes).toEqual([])
    expect(within(section()).getByText("Editing")).toBeTruthy()
    expect(document.querySelector('[data-slot="signature-cue"]')?.textContent).toBe("Draw your signature")
    expect(isDirty()).toBe(true)
    expect(within(section()).queryByRole("alert")).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(saveButton))
  })

  it("Save all counts a declined remove as cancelled, never failed", async () => {
    const { registry, writes } = await renderSignatureEdit(501)
    fireEvent.click(within(section()).getByRole("button", { name: "Clear" }))
    let outcome: Awaited<ReturnType<typeof runSaveAll>> | undefined
    let running: Promise<void> = Promise.resolve()
    await act(async () => {
      running = runSaveAll(registry).then((result) => {
        outcome = result
      })
    })
    const dialog = removeDialog()
    if (!dialog) throw new Error("no confirm")
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" })))
    await act(async () => running)
    expect(outcome).toMatchObject({ kind: "done", saved: [], failed: [] })
    expect(outcome && "cancelled" in outcome ? outcome.cancelled.map((section) => section.id) : []).toEqual(["personal"])
    expect(writes).toEqual([])
  })

  it("the PUT saves but the upload fails: First name saved and clean; \"Couldn't save your signature. Try again.\"; Retry sends only the upload", async () => {
    const { writes } = await renderSignatureEdit(null, { upload: (attempt) => (attempt === 1 ? HttpResponse.json({ message: "boom" }, { status: 500 }) : HttpResponse.json({ id: 57 })) })
    await type("First name", "Anna")
    act(() => pad().stroke())
    await save()
    await waitFor(() => expect(within(section()).getByText("Couldn't save your signature. Try again.")).toBeTruthy())
    expect(writes).toEqual(['PUT {"firstName":"Anna"}', "POST upload"])
    expect(within(section()).getByText("Editing")).toBeTruthy()
    expect((control("First name") as HTMLInputElement).value).toBe("Anna")
    expect(isDirty()).toBe(true)
    await act(async () => fireEvent.click(within(section()).getByRole("button", { name: "Retry" })))
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(writes).toEqual(['PUT {"firstName":"Anna"}', "POST upload", "POST upload"])
    await waitFor(() => expect(valueOf("First name").textContent).toBe("Anna"))
  })

  it("a network failure in the Signature step keeps the connection copy", async () => {
    const { writes } = await renderSignatureEdit(null, { upload: () => HttpResponse.json({ errorCode: "UPSTREAM_ERROR", source: "proxy" }, { status: 502 }) })
    act(() => pad().stroke())
    await save()
    await waitFor(() => expect(within(section()).getByText("Couldn't save personal information. Check your connection.")).toBeTruthy())
    expect(within(section()).queryByText("Couldn't save your signature. Try again.")).toBeNull()
    expect(writes).toEqual(["POST upload"])
  })

  it("while the save is in flight the pad is read-only: off, Clear and Upload inert; exactly one upload of the original drawing", async () => {
    const { writes } = await renderSignatureEdit(null)
    const drawn = new Blob([new Uint8Array([9, 9])], { type: "image/png" })
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation((callback) => callback(drawn))
    // Hold the save at the drawing's re-encode (an MSW handler that waits breaks the multipart stream here).
    let release: () => void = () => undefined
    const encoded = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" })
    vi.mocked(reencodeImage).mockReturnValueOnce(
      new Promise((resolve) => (release = () => resolve({ ok: true, blob: encoded, width: 2, height: 2 }))),
    )
    act(() => pad().stroke())
    await save()
    expect(within(section()).getAllByText("Saving…").length).toBeGreaterThan(0)
    expect(pad().off).toHaveBeenCalled()
    const clear = within(section()).getByRole("button", { name: "Clear" })
    const upload = within(section()).getByRole("button", { name: "Upload image instead" })
    expect(clear.getAttribute("aria-disabled")).toBe("true")
    expect(upload.getAttribute("aria-disabled")).toBe("true")
    const pick = vi.spyOn(screen.getByTestId("signature-file-input"), "click").mockImplementation(() => undefined)
    fireEvent.click(clear)
    fireEvent.click(upload)
    await act(async () =>
      fireEvent.change(screen.getByTestId("signature-file-input"), { target: { files: [new File([PNG_BYTES], "other.png", { type: "image/png" })] } }),
    )
    expect(pick).not.toHaveBeenCalled()
    expect(document.querySelector('[data-slot="signature-cue"]')).toBeNull()
    expect(writes).toEqual([])
    await act(async () => release())
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(writes).toEqual(["POST upload"])
    expect(vi.mocked(reencodeImage).mock.calls.map(([blob]) => blob)).toEqual([drawn])
  })

  it("a failed PUT keeps the Section's own error copy, not the Signature's", async () => {
    const server = signatureServer(null)
    // The first matching handler wins: the failing PUT goes first.
    await renderEditing(server.wire(), [http.put(EDIT, () => HttpResponse.json({ message: "Invalid value", code: "INVALID_ENUM_VALUE" }, { status: 400 })), ...server.handlers])
    await type("First name", "Anna")
    act(() => pad().stroke())
    await save()
    await waitFor(() => expect(within(section()).getByRole("button", { name: "Retry" })).toBeTruthy())
    expect(within(section()).queryByText("Couldn't save your signature. Try again.")).toBeNull()
    expect(server.writes).toEqual([])
  })

  it("never sends isPublic, current or hardDelete", async () => {
    const { writes } = await renderSignatureEdit(501)
    act(() => pad().stroke())
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(writes).toEqual(["POST upload", "DELETE 501 204"])
    for (const write of writes) expect(write).not.toMatch(/isPublic|current|hardDelete/)
  })

  it("drafts: a drawing is never drafted; a restore shows the saved Signature and sends no Signature step", async () => {
    const server = signatureServer(501)
    const first = await renderEditing(server.wire(), server.handlers)
    await type("First name", "Anna")
    act(() => pad().stroke())
    await act(async () => sessionEvents.publish("session-expired"))
    await waitFor(() => expect(window.localStorage.getItem(DRAFT_KEY)).not.toBeNull())
    const raw = window.localStorage.getItem(DRAFT_KEY) ?? ""
    const stored = JSON.parse(raw) as { values: Record<string, unknown> }
    expect(Object.keys(stored.values)).not.toContain("signature")
    expect(raw).not.toMatch(/signature|data:|blob:|new:\d/i)
    first.unmount()
    sessionEvents.reset()

    images = []
    renderInPage(<PersonalSection />, { page: "profile", myself: server.wire(), handlers: server.handlers })
    await screen.findByRole("table", { name: "Personal information" })
    await act(async () => fireEvent.click(await screen.findByRole("button", { name: "Restore" })))
    await waitFor(() => expect((control("First name") as HTMLInputElement).value).toBe("Anna"))
    expect(images.map((image) => image.src)).toEqual(["/api/1h/v2/file/501/download"])
    await save()
    await waitFor(() => expect(isReadView()).toBe(true))
    expect(server.writes).toEqual(['PUT {"firstName":"Anna"}'])
  })

  it.each([
    ["light", 360],
    ["dark", 1024],
  ] as const)("has no axe violations with the pad and an upload error (%s, %i px)", async (theme, width) => {
    stubViewport(width)
    if (theme === "dark") document.documentElement.classList.add("dark")
    await renderSignatureEdit(501)
    await act(async () =>
      fireEvent.change(screen.getByTestId("signature-file-input"), { target: { files: [new File([new Uint8Array([0x47, 0x49, 0x46])], "a.gif", { type: "image/gif" })] } }),
    )
    await waitFor(() => expect(within(section()).getByText("Choose a PNG or JPEG image.")).toBeTruthy())
    expect(await axeViolations()).toEqual([])
  })
})
