import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { useEffect } from "react"
import { useSWRConfig, type ScopedMutator } from "swr"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { MyselfErrorClaimProvider, SectionCountProvider, useMyselfErrorClaimed, useSectionCounts } from "@/features/shell"
import { keys } from "@/lib/api"
import { axeViolations } from "@/test/axe"
import { stubViewport } from "@/test/media"
import { myselfWire } from "@/test/myself-fixture"
import { renderInPage } from "@/test/providers"
import { PersonalSection } from "."

/**
 * Story 2.1 (NG-9022): the Personal information read view on `/`, rendered
 * the way `PageFrame` hosts it (`renderInPage`, MSW at `/api`). Covers every
 * I/O matrix row of `spec-2-1-view-personal-information.md`.
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

beforeEach(() => {
  stubViewport(360)
})
afterEach(() => document.documentElement.classList.remove("dark"))

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

  it("has no Edit button (Story 2.2 adds it with its wiring)", async () => {
    await renderLoaded()
    expect(within(section()).queryByRole("button")).toBeNull()
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

  it.each(["***-**-1234", "*****1234", "***-**-****"])("a mask (%s) shows as is", async (socialSecurityNumber) => {
    await renderLoaded(myselfWire({ socialSecurityNumber }))
    expect(valueOf("SSN").textContent).toBe(socialSecurityNumber)
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
