import { act, fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useMyself } from "@/features/shell"
import { sessionEvents } from "@/lib/api"
import { NPI_MESSAGES } from "@/lib/shared/messages"
import { renderInPage } from "@/test/providers"
import { stubLayoutApis } from "@/test/dom-stubs"
import { stubViewport } from "@/test/media"
import { axeViolations } from "@/test/axe"
import { NpiSearch } from "./npi-search"
import { useNpiRegistration } from "./use-npi-registration"

const SEARCH = "/api/1h/v2/public/npi/list"
const CHECK = "/api/1h/v2/health/npi/:id/is-registered"
const POST = "/api/1h/v2/user/register/npi"
const personal = () => screen.getByRole("combobox", { name: NPI_MESSAGES.personalSearch })
const practice = () => screen.getByRole("combobox", { name: /Search for your practice/ })
const record = (id: number) => ({ id, npi: id === 77 ? 1234567890 : 1987654321, providerFirstName: "Ann", providerLastName: "Lee", providerOrganizationName: "Test Clinic" })
function Identity() { useMyself(); return null }
function setup(handlers: Parameters<typeof renderInPage>[1]["handlers"] = []) {
  const onFailure = vi.fn()
  const onRegistered = vi.fn(async () => {})
  const view = renderInPage(<><Identity /><NpiSearch onFailure={onFailure} onRegistered={onRegistered} /></>, { page: "account", handlers: [
    ...handlers,
    http.get(SEARCH, ({ request }) => HttpResponse.json({ data: [record(new URL(request.url).searchParams.get("entityTypeCode") === "1" ? 77 : 88)], totalElements: 1 })),
    http.get(CHECK, () => HttpResponse.json(false)),
    http.post(POST, () => new HttpResponse(null, { status: 200 })),
  ] })
  return { ...view, onFailure, onRegistered }
}
async function pick(both = false) {
  const user = userEvent.setup()
  const clear = screen.queryByRole("button", { name: `Clear ${NPI_MESSAGES.personalSearch}` })
  if (clear) await user.click(clear)
  await user.click(screen.getByText(NPI_MESSAGES.instructions))
  await user.click(personal())
  await screen.findByRole("option", { name: "1234567890, Ann Lee" })
  await user.keyboard("{ArrowDown}{Enter}")
  if (both) {
    await user.click(practice())
    await screen.findByRole("option", { name: "1987654321, Test Clinic" })
    await user.keyboard("{ArrowDown}{Enter}")
  }
}
function submit() { fireEvent.submit(personal().closest("form")!) }
beforeEach(() => { stubLayoutApis(); stubViewport(1280) })

describe("NPI registration command", () => {
  it("requires a picked personal record on blur and submit, links its error and focuses it without traffic", async () => {
    const checks = vi.fn(() => HttpResponse.json(false))
    setup([http.get(CHECK, checks)])
    act(() => personal().focus())
    fireEvent.blur(personal())
    expect(await screen.findByText(NPI_MESSAGES.personalNpiRequired)).toBeTruthy()
    expect(personal().getAttribute("aria-invalid")).toBe("true")
    expect(personal().getAttribute("aria-describedby")).toContain(screen.getByText(NPI_MESSAGES.personalNpiRequired).id)
    submit()
    await waitFor(() => expect(document.activeElement).toBe(personal()))
    expect(checks).not.toHaveBeenCalled()
    await pick()
    expect(screen.queryByText(NPI_MESSAGES.personalNpiRequired)).toBeNull()
    expect(await axeViolations()).toEqual([])
  })
  it.each([false, true])("registers record ids with an empty acknowledgement, both=%s; success is latched", async (both) => {
    const ids: string[] = []
    const bodies: unknown[] = []
    const view = setup([
      http.get(CHECK, ({ params }) => { ids.push(String(params.id)); return HttpResponse.json(false) }),
      http.post(POST, async ({ request }) => { bodies.push(await request.json()); return new HttpResponse(null, { status: 200 }) }),
    ])
    await pick(both)
    submit(); submit()
    await waitFor(() => expect(view.onRegistered).toHaveBeenCalledTimes(1))
    expect(ids.sort()).toEqual(both ? ["77", "88"] : ["77"])
    expect(bodies).toEqual([both ? { providerNpiId: 77, practiceNpiId: 88 } : { providerNpiId: 77 }])
    expect(personal()).toHaveProperty("value", "")
    expect(practice()).toHaveProperty("value", "")
    fireEvent.submit(personal().closest("form")!)
    expect(bodies).toHaveLength(1)
  })
  it.each(["personal", "practice", "both"])("shows %s taken fields and never posts", async (taken) => {
    const posts = vi.fn(() => new HttpResponse(null, { status: 200 }))
    setup([http.get(CHECK, ({ params }) => HttpResponse.json(taken === "both" || String(params.id) === (taken === "personal" ? "77" : "88"))), http.post(POST, posts)])
    await pick(true); submit()
    if (taken !== "practice") await screen.findByText(NPI_MESSAGES.personalNpiTaken)
    if (taken !== "personal") await screen.findByText(NPI_MESSAGES.practiceNpiTaken)
    await waitFor(() => expect(document.activeElement).toBe(taken === "practice" ? practice() : personal()))
    expect(posts).not.toHaveBeenCalled()
    expect(personal()).toHaveProperty("value", "1234567890, Ann Lee")
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: `Clear ${taken === "practice" ? NPI_MESSAGES.practiceSearch : NPI_MESSAGES.personalSearch}` }))
    expect(screen.queryByText(taken === "practice" ? NPI_MESSAGES.practiceNpiTaken : NPI_MESSAGES.personalNpiTaken)).toBeNull()
  })
  it("starts both checks in parallel, freezes selections immediately, and guards double activation during checks and POST", async () => {
    const finish: Array<(response: Response) => void> = []
    let completePost!: (response: Response) => void
    let posts = 0
    const view = setup([
      http.get(CHECK, () => new Promise<Response>((resolve) => finish.push(resolve))),
      http.post(POST, () => { posts++; return new Promise<Response>((resolve) => { completePost = resolve }) }),
    ])
    await pick(true); submit(); fireEvent.submit(personal().closest("form")!)
    expect(personal()).toHaveProperty("disabled", true)
    expect(screen.getByRole("button", { name: NPI_MESSAGES.registering }).getAttribute("aria-disabled")).toBe("true")
    await waitFor(() => expect(finish).toHaveLength(2))
    await act(async () => { finish.forEach((done) => done(HttpResponse.json(false))) })
    await waitFor(() => expect(posts).toBe(1))
    fireEvent.submit(personal().closest("form")!)
    expect(posts).toBe(1)
    await act(async () => completePost(new HttpResponse(null, { status: 200 })))
    await waitFor(() => expect(view.onRegistered).toHaveBeenCalledTimes(1))
  })
  it.each(["malformed", "failed"])("blocks a POST after %s availability", async (kind) => {
    const post = vi.fn()
    setup([http.get(CHECK, () => kind === "malformed" ? HttpResponse.json("false") : HttpResponse.json({}, { status: 502 })), http.post(POST, post)])
    await pick(); submit()
    await screen.findByText(NPI_MESSAGES.registrationFailed)
    expect(post).not.toHaveBeenCalled()
    expect(personal()).toHaveProperty("value", "1234567890, Ann Lee")
  })
  it.each([400, 502, 504])("preserves choices and persistent banner for %s; another attempt clears it without replay", async (status) => {
    let posts = 0
    setup([http.post(POST, () => { posts++; return HttpResponse.json({ message: "Registration rejected" }, { status }) })])
    await pick(); submit()
    const text = status === 400 ? "Registration rejected" : NPI_MESSAGES.registrationFailed
    await screen.findByText(text)
    expect(posts).toBe(1)
    expect(personal()).toHaveProperty("value", "1234567890, Ann Lee")
    await pick(true)
    expect(screen.getByText(text)).toBeTruthy()
    submit()
    expect(screen.queryByText(text)).toBeNull()
    await screen.findByText(text)
    expect(posts).toBe(2)
  })
  it.each(["Personal", "Practice"])("maps a real %s taken race to the matching field", async (field) => {
    setup([http.post(POST, () => HttpResponse.json({ message: `Operation failed. The chosen ${field} NPI Number: 1234567890 is already registered.` }, { status: 400 }))])
    await pick(true); submit()
    await screen.findByText(field === "Personal" ? NPI_MESSAGES.personalNpiTaken : NPI_MESSAGES.practiceNpiTaken)
    await waitFor(() => expect(document.activeElement).toBe(field === "Personal" ? personal() : practice()))
    expect(screen.queryByText(NPI_MESSAGES.registrationFailed)).toBeNull()
  })
  it("hands upstream403 to the tab owner", async () => {
    const view = setup([http.get(CHECK, () => HttpResponse.json({ message: "Denied" }, { status: 403 }))])
    await pick(); submit()
    await waitFor(() => expect(view.onFailure).toHaveBeenCalledWith({ kind: "forbidden" }))
    expect(view.onRegistered).not.toHaveBeenCalled()
  })
  it.each(["unmount", "expiry", "pagehide"])("abandons held checks on %s and never starts a POST", async (reason) => {
    let finish!: (response: Response) => void
    const posts = vi.fn()
    const view = setup([http.get(CHECK, () => new Promise<Response>((resolve) => { finish = resolve })), http.post(POST, posts)])
    await pick(); submit()
    await waitFor(() => expect(finish).toBeTypeOf("function"))
    act(() => { if (reason === "unmount") view.unmount(); else if (reason === "expiry") sessionEvents.publish("session-expired"); else window.dispatchEvent(new Event("pagehide")) })
    await act(async () => finish(HttpResponse.json(false)))
    expect(posts).not.toHaveBeenCalled()
    expect(view.onRegistered).not.toHaveBeenCalled()
    expect(view.onFailure).not.toHaveBeenCalled()
  })
  it.each(["unmount", "expiry"])("ignores a late acknowledged POST after %s", async (reason) => {
    let finish!: (response: Response) => void
    const view = setup([http.post(POST, () => new Promise<Response>((resolve) => { finish = resolve }))])
    await pick(); submit()
    await waitFor(() => expect(finish).toBeTypeOf("function"))
    act(() => { if (reason === "unmount") view.unmount(); else sessionEvents.publish("session-expired") })
    await act(async () => finish(new HttpResponse(null, { status: 200 })))
    expect(view.onRegistered).not.toHaveBeenCalled()
    expect(view.onFailure).not.toHaveBeenCalled()
  })
  it("routes an expired transport response to session flow and never reports success", async () => {
    const view = setup([http.post(POST, () => HttpResponse.json({ errorCode: "SESSION_EXPIRED", source: "proxy" }, { status: 401 }))])
    await pick(); submit()
    await waitFor(() => expect(sessionEvents.hasPublished("session-expired")).toBe(true))
    expect(view.onRegistered).not.toHaveBeenCalled()
    expect(screen.queryByText(NPI_MESSAGES.registrationFailed)).toBeNull()
    expect(personal()).toHaveProperty("value", "")
  })
  it("keeps a proxy403 local with fallback and maps a POST403 to tab ownership", async () => {
    let posts = 0
    const view = setup([http.post(POST, () => ++posts === 1 ? HttpResponse.json({ errorCode: "NOT_ALLOWED", source: "proxy" }, { status: 403 }) : HttpResponse.json({ message: "Denied" }, { status: 403 }))])
    await pick(); submit()
    await screen.findByText(NPI_MESSAGES.registrationFailed)
    expect(view.onFailure).not.toHaveBeenCalled()
    submit()
    await waitFor(() => expect(view.onFailure).toHaveBeenCalledWith({ kind: "forbidden" }))
  })

  it("typing after a practice pick drops that record before registration", async () => {
    const checks: string[] = []
    const bodies: unknown[] = []
    const view = setup([
      http.get(CHECK, ({ params }) => { checks.push(String(params.id)); return HttpResponse.json(false) }),
      http.post(POST, async ({ request }) => { bodies.push(await request.json()); return new HttpResponse(null, { status: 200 }) }),
    ])
    await pick(true)
    const user = userEvent.setup()
    await user.type(practice(), "changed")
    await user.click(screen.getByRole("button", { name: NPI_MESSAGES.register }))
    await waitFor(() => expect(view.onRegistered).toHaveBeenCalledTimes(1))
    expect(checks).toEqual(["77"])
    expect(bodies).toEqual([{ providerNpiId: 77 }])
  })
  it.each(["pagehide", "unmount"])("%s during form validation never starts availability or registration", async (reason) => {
    const checks = vi.fn(() => HttpResponse.json(false))
    const posts = vi.fn(() => new HttpResponse(null, { status: 200 }))
    const view = setup([http.get(CHECK, checks), http.post(POST, posts)])
    await pick()
    await act(async () => {
      submit()
      if (reason === "unmount") view.unmount()
      else window.dispatchEvent(new Event("pagehide"))
    })
    expect(checks).not.toHaveBeenCalled()
    expect(posts).not.toHaveBeenCalled()
    expect(view.onRegistered).not.toHaveBeenCalled()
    if (reason === "pagehide") {
      expect(personal()).toHaveProperty("value", "")
      expect(screen.getByRole("button", { name: NPI_MESSAGES.register })).toBeTruthy()
    }
  })

  it("guards command selections synchronously during checks, after acknowledgement, and after expiry", async () => {
    let finishCheck!: (response: Response) => void
    const registered = vi.fn(async () => {})
    const option = (id: number) => ({ id, npi: "1234567890", name: "Ann Lee", city: "Austin", state: "TX", label: "1234567890, Ann Lee, Austin, TX" })
    function Probe() {
      const identity = useMyself()
      const command = useNpiRegistration({ onFailure: vi.fn(), onRegistered: registered })
      return <form onSubmit={command.submit}>
        <output aria-label="Identity">{identity.myself ? "Ready" : "Loading"}</output>
        <output aria-label="Pick">{command.personalSelection?.id ?? "Empty"}</output>
        <button type="button" onClick={() => command.change("personalNpi", option(77))}>Choose personal</button>
        <button type="button" onClick={() => command.change("personalNpi", option(88))}>Choose other</button>
        <button type="submit">Send command</button>
      </form>
    }
    renderInPage(<Probe />, { page: "account", handlers: [
      http.get(CHECK, () => new Promise<Response>((resolve) => { finishCheck = resolve })),
      http.post(POST, () => new HttpResponse(null, { status: 200 })),
    ] })
    await waitFor(() => expect(screen.getByRole("status", { name: "Identity" }).textContent).toBe("Ready"))
    fireEvent.click(screen.getByRole("button", { name: "Choose personal" }))
    fireEvent.click(screen.getByRole("button", { name: "Send command" }))
    // Consumers may activate again before a disabled UI has committed.
    fireEvent.click(screen.getByRole("button", { name: "Choose other" }))
    expect(screen.getByRole("status", { name: "Pick" }).textContent).toBe("77")
    await waitFor(() => expect(finishCheck).toBeTypeOf("function"))
    await act(async () => finishCheck(HttpResponse.json(false)))
    await waitFor(() => expect(registered).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole("button", { name: "Choose other" }))
    expect(screen.getByRole("status", { name: "Pick" }).textContent).toBe("Empty")
    act(() => sessionEvents.publish("session-expired"))
    fireEvent.click(screen.getByRole("button", { name: "Choose personal" }))
    expect(screen.getByRole("status", { name: "Pick" }).textContent).toBe("Empty")
  })

  it.each([
    { usefulId: "77", maskedStatus: 502 }, { usefulId: "88", maskedStatus: 502 },
    { usefulId: "77", maskedStatus: 504 }, { usefulId: "88", maskedStatus: 504 },
  ])("keeps mapper-approved availability copy from $usefulId alongside masked$maskedStatus", async ({ usefulId, maskedStatus }) => {
    const posts = vi.fn(() => new HttpResponse(null, { status: 200 }))
    setup([
      http.get(CHECK, ({ params }) => String(params.id) === usefulId
        ? HttpResponse.json({ message: "Confirm your registry details before registering" }, { status: 400 })
        : HttpResponse.json({ message: "Synthetic internal detail" }, { status: maskedStatus })),
      http.post(POST, posts),
    ])
    await pick(true); submit()
    await screen.findByText("Confirm your registry details before registering")
    expect(screen.queryByText(NPI_MESSAGES.registrationFailed)).toBeNull()
    expect(screen.queryByText("Synthetic internal detail")).toBeNull()
    expect(posts).not.toHaveBeenCalled()
  })
  it.each(["77", "88"])("rechecks selected records after a failed POST and blocks a newly taken%s", async (takenId) => {
    const checks: string[] = []
    let posts = 0
    setup([
      http.get(CHECK, ({ params }) => { checks.push(String(params.id)); return HttpResponse.json(posts > 0 && String(params.id) === takenId) }),
      http.post(POST, () => { posts++; return HttpResponse.json({}, { status: 502 }) }),
    ])
    await pick(true); submit()
    await screen.findByText(NPI_MESSAGES.registrationFailed)
    expect(posts).toBe(1)
    expect(checks.sort()).toEqual(["77", "88"])
    submit()
    await screen.findByText(takenId === "77" ? NPI_MESSAGES.personalNpiTaken : NPI_MESSAGES.practiceNpiTaken)
    await waitFor(() => expect(document.activeElement).toBe(takenId === "77" ? personal() : practice()))
    expect(checks.sort()).toEqual(["77", "77", "88", "88"])
    expect(posts).toBe(1)
    expect(screen.queryByText(NPI_MESSAGES.registrationFailed)).toBeNull()
  })

})
