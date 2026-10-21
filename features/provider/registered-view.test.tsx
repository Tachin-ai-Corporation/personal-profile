import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { useState } from "react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getUserNpi, isNpiRegistered, type UserNpi } from "@/lib/api"
import { COMMON_MESSAGES, NPI_MESSAGES, SHELL_MESSAGES, STATE_MESSAGES } from "@/lib/shared/messages"
import { axeViolations } from "@/test/axe"
import { myselfWire } from "@/test/myself-fixture"
import { renderInPage } from "@/test/providers"
import { server } from "@/test/msw-server"
import { setLeaveGuard } from "@/features/shell"
import { testRouter } from "@/test/next-navigation"
import { stubLayoutApis } from "@/test/dom-stubs"
import { stubViewport } from "@/test/media"
import { RegisteredView } from "./registered-view"

// A forwarding spy exposes completion while preserving the real transport and validation.
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return { ...actual, isNpiRegistered: vi.fn(actual.isNpiRegistered) }
})

vi.mock("next/navigation", async () => (await import("@/test/next-navigation")).nextNavigationMock)

beforeEach(() => { stubLayoutApis(); stubViewport(1024) })

const full: UserNpi = {
  registered: true,
  provider: { id: 77, npi: "1234567890", taxonomy: { name: "Family Medicine" }, providerLicenseNumber: "TEST-LICENSE", providerFirstLineBusinessPracticeLocationAddress: "1 Test Street", providerSecondLineBusinessPracticeLocationAddress: "Suite 2" },
  practice: { id: 88, npi: "1987654321", providerOrganizationName: "Sample Clinic", providerFirstLineBusinessPracticeLocationAddress: "2 Test Avenue", verified: true, organization: { tenantId: 202 } },
  hie: { id: 99, endpoint: "Sample Exchange" },
}
const availability = "/api/1h/v2/health/npi/:id/is-registered"
const identity = "/api/1h/v2/user/myself"
function renderView(registration: UserNpi = full, options: Parameters<typeof renderInPage>[1] = { page: "account" }) {
  return renderInPage(<><h2 id="provider-heading">{NPI_MESSAGES.heading}</h2><RegisteredView registration={registration} /></>, { ...options, page: "account" })
}
function value(label: string) {
  const cell = screen.getByRole("rowheader", { name: label })
  return document.querySelector(`td[headers="${cell.id}"]`) as HTMLElement
}

// Exercise API normalization as well as consumers for every registered sentinel.
describe("registered credentials", () => {
  it("maps the nine FR116 values in exact order and uses existing signature delivery", async () => {
    renderView()
    await screen.findByText(NPI_MESSAGES.organizationExists)
    expect(screen.getAllByRole("rowheader").map((node) => node.textContent)).toEqual([NPI_MESSAGES.npi, NPI_MESSAGES.taxonomy, NPI_MESSAGES.healthInformationExchange, NPI_MESSAGES.practiceName, NPI_MESSAGES.practiceAddress, NPI_MESSAGES.practiceNpi, NPI_MESSAGES.licenses, NPI_MESSAGES.addressOfPractice, SHELL_MESSAGES.signature])
    for (const [label, text] of [[NPI_MESSAGES.npi, "1234567890"], [NPI_MESSAGES.taxonomy, "Family Medicine"], [NPI_MESSAGES.healthInformationExchange, "Sample Exchange"], [NPI_MESSAGES.practiceAddress, "2 Test Avenue"], [NPI_MESSAGES.practiceNpi, "1987654321"], [NPI_MESSAGES.licenses, "TEST-LICENSE"]]) expect(value(label).textContent).toBe(text)
    expect(value(NPI_MESSAGES.addressOfPractice).children[0].children.length).toBe(2)
    expect(screen.getByRole("img", { name: SHELL_MESSAGES.signatureAlt }).getAttribute("src")).toBe("/api/1h/v2/file/501/download")
    expect(screen.queryByRole("combobox")).toBeNull()
    expect(screen.queryByRole("button", { name: /^Edit|Unregister$/ })).toBeNull()
    expect(await axeViolations()).toEqual([])
  })
  it.each([undefined, null, "", "  ", "N/A", -1, "-1"])("normalizes every field sentinel %j before wrapping", async (sentinel) => {
    server.use(http.get("/api/1h/v2/user/npi", () => HttpResponse.json({ providerNpi: { id: 77, npi: sentinel, taxonomy: { name: sentinel }, providerLicenseNumber: sentinel, providerFirstLineBusinessPracticeLocationAddress: sentinel, providerSecondLineBusinessPracticeLocationAddress: sentinel }, practiceNpi: { id: 88, npi: sentinel, providerOrganizationName: sentinel, providerFirstLineBusinessPracticeLocationAddress: sentinel }, hieEndpoint: { id: 99, endpoint: sentinel } })))
    const response = await getUserNpi()
    expect(response.success).toBe(true)
    renderView(response.data)
    await screen.findByRole("img")
    expect(screen.getAllByText(COMMON_MESSAGES.notProvided)).toHaveLength(8)
    expect(screen.queryByRole("button", { name: COMMON_MESSAGES.notProvided })).toBeNull()
  })
  it("omits only missing second address line and shows no practice affordances without a practice", async () => {
    renderView({ registered: true, provider: { id: 77, npi: "1234567890", providerFirstLineBusinessPracticeLocationAddress: "1 Test Street", providerSecondLineBusinessPracticeLocationAddress: "n/a" } })
    await screen.findByRole("img")
    expect(value(NPI_MESSAGES.addressOfPractice).textContent).toBe("1 Test Street")
    for (const label of [NPI_MESSAGES.practiceName, NPI_MESSAGES.practiceAddress, NPI_MESSAGES.practiceNpi]) expect(value(label).textContent).toBe(COMMON_MESSAGES.notProvided)
    expect(screen.queryByText(NPI_MESSAGES.organizationExists)).toBeNull()
    expect(screen.queryByRole("button", { name: NPI_MESSAGES.registerPractice })).toBeNull()
  })
  it("handles missing signature and failed image without hiding the help and guarded Profile link", async () => {
    const user = userEvent.setup()
    renderView()
    fireEvent.error(await screen.findByRole("img"))
    expect(screen.getByText(NPI_MESSAGES.signatureUnavailable)).toBeTruthy()
    const help = screen.getByRole("button", { name: NPI_MESSAGES.aboutSignature })
    act(() => help.focus())
    expect(await screen.findByRole("tooltip")).toHaveProperty("textContent", NPI_MESSAGES.signatureHelp)
    await user.keyboard("{Escape}")
    const guard = vi.fn(async () => false)
    const dispose = setLeaveGuard(guard)
    const pushes = testRouter.push.mock.calls.length
    try {
      await user.click(screen.getByRole("button", { name: SHELL_MESSAGES.pageProfile }))
      expect(guard).toHaveBeenCalledTimes(1)
      expect(testRouter.push.mock.calls.length).toBe(pushes)
      guard.mockResolvedValue(true)
      await user.click(screen.getByRole("button", { name: SHELL_MESSAGES.pageProfile }))
      await waitFor(() => expect(testRouter.push).toHaveBeenLastCalledWith("/?tab=contacts#signature"))
    } finally { dispose() }
  })
  it("does not flash actions while identity loads and leaves exhausted errors to PageFrame", async () => {
    let finish!: (response: Response) => void
    renderView(full, { page: "account", handlers: [http.get(identity, () => new Promise<Response>((resolve) => { finish = resolve }))] })
    await waitFor(() => expect(finish).toBeTypeOf("function"))
    expect(screen.getByRole("table")).toBeTruthy()
    expect(document.querySelector('[data-slot="registered-signature-skeleton"]')).toBeTruthy()
    expect(screen.queryByText(NPI_MESSAGES.organizationExists)).toBeNull()
    await act(async () => finish(HttpResponse.json({}, { status: 400 })))
    await screen.findByText(NPI_MESSAGES.signatureUnavailable)
    expect(screen.queryByText(NPI_MESSAGES.organizationExists)).toBeNull()
    expect(screen.getByRole("table")).toBeTruthy()
  })
  it("shows the signature fallback when identity has no signature", async () => {
    renderView(full, { page: "account", myself: myselfWire({ signature: null }) })
    expect(await screen.findByText(NPI_MESSAGES.signatureUnavailable)).toBeTruthy()
  })
})

describe("registered practice support", () => {
  it("is lazy, opens without moving focus, loads contact once and bridges keyboard links", async () => {
    let calls = 0
    let finish!: (response: Response) => void
    renderView(full, { page: "account", handlers: [http.get("/api/pp/practice-support", () => { calls++; return new Promise<Response>((resolve) => { finish = resolve }) })] })
    await screen.findByText(NPI_MESSAGES.organizationExists)
    expect(calls).toBe(0)
    const trigger = screen.getByRole("button", { name: "Sample Clinic" })
    act(() => trigger.focus())
    expect(await screen.findByText("Loading…")).toBeTruthy()
    expect(document.activeElement).toBe(trigger)
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    expect(trigger.getAttribute("aria-controls")).toBeTruthy()
    await waitFor(() => expect(finish).toBeTypeOf("function"))
    await act(async () => finish(HttpResponse.json({ name: "Clinic support", phone: "4155552671", phoneRegion: "US", email: "support@example.com" })))
    expect(await screen.findByText("Clinic support")).toBeTruthy()
    expect(screen.getByText("+1 (415) 555-2671")).toBeTruthy()
    expect(screen.getByRole("link").getAttribute("href")).toBe("mailto:support@example.com")
    const user = userEvent.setup()
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList)
    await user.keyboard("{Tab}")
    expect(document.activeElement).toBe(screen.getByRole("link"))
    await user.keyboard("{Escape}")
    expect(document.activeElement).toBe(trigger)
    act(() => { trigger.blur(); trigger.focus() })
    await screen.findByText("Clinic support")
    expect(calls).toBe(1)
  })
  it.each([403, 500, "malformed", "proxy403"])("contains support failure %s locally and retries only support", async (failure) => {
    const calls = { support: 0, myself: 0 }
    renderView(full, { page: "account", handlers: [http.get(identity, () => { calls.myself++; return HttpResponse.json(myselfWire()) }), http.get("/api/pp/practice-support", () => {
      calls.support++
      if (calls.support > 1) return HttpResponse.json({})
      if (failure === "malformed") return HttpResponse.json([])
      if (failure === "proxy403") return HttpResponse.json({ source: "proxy", errorCode: "NOT_ALLOWED" }, { status: 403 })
      return HttpResponse.json({ message: "Denied" }, { status: typeof failure === "number" ? failure : 500 })
    })] })
    await screen.findByText(NPI_MESSAGES.organizationExists)
    act(() => screen.getByRole("button", { name: "Sample Clinic" }).focus())
    if (failure === 403) expect(await screen.findByText(STATE_MESSAGES.noAccess)).toBeTruthy()
    else {
      expect(await screen.findByText(NPI_MESSAGES.practiceSupportLoadError)).toBeTruthy()
      fireEvent.click(screen.getByRole("button", { name: "Try again." }))
      expect(await screen.findByText("-")).toBeTruthy()
      expect(calls).toEqual({ support: 2, myself: 1 })
    }
    expect(screen.getByRole("table")).toBeTruthy()
  })
  it("leaves session failures to the global session flow", async () => {
    renderView(full, { page: "account", handlers: [http.get("/api/pp/practice-support", () => HttpResponse.json({ errorCode: "SESSION_EXPIRED", source: "proxy" }, { status: 401 }))] })
    await screen.findByRole("img")
    act(() => screen.getByRole("button", { name: "Sample Clinic" }).focus())
    await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull())
    expect(screen.queryByText(NPI_MESSAGES.practiceSupportLoadError)).toBeNull()
  })
  it("renders an email as plain text when the shared protocol validator refuses it", async () => {
    renderView(full, { page: "account", handlers: [http.get("/api/pp/practice-support", () => HttpResponse.json({ email: "//[" }))] })
    await screen.findByRole("img")
    act(() => screen.getByRole("button", { name: "Sample Clinic" }).focus())
    await screen.findByText("//[")
    expect(screen.queryByRole("link")).toBeNull()
  })
  it.each([{ id: 89, scenario: "another practice" }, { id: 88, scenario: "the same practice with a new tenant" }])("forces a fresh key-only support read for $scenario and discards the old answer", async ({ id }) => {
    let finishOld!: (response: Response) => void
    let finishNew!: (response: Response) => void
    let calls = 0
    function ChangePractice() {
      const [registration, setRegistration] = useState(full)
      return <><button onClick={() => setRegistration({ ...full, practice: { ...full.practice!, id, providerOrganizationName: "New Clinic", organization: { tenantId: 203 } } })}>Change practice</button><RegisteredView registration={registration} /></>
    }
    renderInPage(<ChangePractice />, { page: "account", handlers: [http.get("/api/pp/practice-support", () => {
      calls++
      return new Promise<Response>((resolve) => { if (calls === 1) finishOld = resolve; else finishNew = resolve })
    })] })
    await screen.findByRole("img")
    act(() => screen.getByRole("button", { name: "Sample Clinic" }).focus())
    await waitFor(() => expect(finishOld).toBeTypeOf("function"))
    fireEvent.click(screen.getByRole("button", { name: "Change practice" }))
    act(() => screen.getByRole("button", { name: "New Clinic" }).focus())
    await waitFor(() => expect(finishNew).toBeTypeOf("function"))
    expect(calls).toBe(2)
    await act(async () => finishOld(HttpResponse.json({ name: "Old private contact" })))
    expect(screen.queryByText("Old private contact")).toBeNull()
    expect(screen.getByText("Loading…")).toBeTruthy()
    await act(async () => finishNew(HttpResponse.json({ name: "New support contact" })))
    expect(await screen.findByText("New support contact")).toBeTruthy()
    expect(screen.queryByText("Old private contact")).toBeNull()
  })
  it("keeps the organization trigger even when its tenant or name is unknown", async () => {
    renderView({ ...full, practice: { ...full.practice!, providerOrganizationName: "n/a", organization: { tenantId: null } } })
    await screen.findByRole("img")
    expect(within(value(NPI_MESSAGES.practiceName)).getByRole("button", { name: COMMON_MESSAGES.notProvided })).toBeTruthy()
    expect(screen.queryByText(NPI_MESSAGES.organizationExists)).toBeNull()
  })
})

describe("registered membership and availability", () => {
  it.each([0, 202])("uses the membership helper with tenant %i and skips availability", async (tenantId) => {
    const reads = vi.fn(() => HttpResponse.json(false))
    renderView({ ...full, practice: { ...full.practice!, organization: { tenantId } } }, { page: "account", myself: myselfWire({ tenants: [{ id: tenantId }] }), handlers: [http.get(availability, reads)] })
    await screen.findByRole("img")
    expect(screen.queryByText(NPI_MESSAGES.organizationExists)).toBeNull()
    expect(screen.queryByRole("button", { name: NPI_MESSAGES.registerPractice })).toBeNull()
    expect(reads).not.toHaveBeenCalled()
  })
  it.each([true, false, "false", null, "failure", "403"])("offers CTA only for literal false availability %j", async (answer) => {
    let calls = 0
    const availabilityRead = vi.mocked(isNpiRegistered)
    availabilityRead.mockClear()
    renderView({ ...full, practice: { ...full.practice!, organization: undefined } }, { page: "account", handlers: [http.get(availability, ({ params }) => {
      calls++
      expect(params.id).toBe("88")
      return answer === "failure" || answer === "403" ? HttpResponse.json({}, { status: answer === "403" ? 403 : 500 }) : HttpResponse.json(answer)
    })] })
    await waitFor(() => expect(calls).toBe(1))
    // Observe the real API promise through validation and the hook's state update.
    await act(async () => { await availabilityRead.mock.results[0].value })
    if (answer === false) expect(await screen.findByRole("button", { name: NPI_MESSAGES.registerPractice })).toBeTruthy()
    else expect(screen.queryByRole("button", { name: NPI_MESSAGES.registerPractice })).toBeNull()
    expect(screen.queryByText(NPI_MESSAGES.organizationExists)).toBeNull()
    expect(screen.queryByRole("alert")).toBeNull()
  })
  it("never checks eligibility before identity is known or after identity failure", async () => {
    let finish!: (response: Response) => void
    const reads = vi.fn(() => HttpResponse.json(false))
    renderView({ ...full, practice: { ...full.practice!, organization: undefined } }, { page: "account", handlers: [http.get(identity, () => new Promise<Response>((resolve) => { finish = resolve })), http.get(availability, reads)] })
    await waitFor(() => expect(finish).toBeTypeOf("function"))
    expect(reads).not.toHaveBeenCalled()
    await act(async () => finish(HttpResponse.json({}, { status: 400 })))
    await screen.findByText(NPI_MESSAGES.signatureUnavailable)
    expect(reads).not.toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: NPI_MESSAGES.registerPractice })).toBeNull()
  })
  it.each([false, null, undefined])("does not request availability for verified %j", async (verified) => {
    const reads = vi.fn(() => HttpResponse.json(false))
    renderView({ ...full, practice: { ...full.practice!, organization: undefined, verified } }, { page: "account", handlers: [http.get(availability, reads)] })
    await screen.findByRole("img")
    expect(reads).not.toHaveBeenCalled()
  })
  it("sends the practice handoff through the existing leave guard", async () => {
    renderView({ ...full, practice: { ...full.practice!, organization: undefined } }, { page: "account", handlers: [http.get(availability, () => HttpResponse.json(false))] })
    const trigger = await screen.findByRole("button", { name: NPI_MESSAGES.registerPractice })
    const guard = vi.fn(async () => false)
    const dispose = setLeaveGuard(guard)
    try {
      fireEvent.click(trigger)
      await waitFor(() => expect(guard).toHaveBeenCalledTimes(1))
    } finally { dispose() }
  })
  it("aborts obsolete eligibility and ignores an old practice's late answer", async () => {
    let finish!: (response: Response) => void
    const old = { ...full, practice: { ...full.practice!, organization: undefined } }
    function ChangePractice() {
      const [registration, setRegistration] = useState<UserNpi>(old)
      return <><button onClick={() => setRegistration({ ...old, practice: { ...old.practice, id: 89 } })}>Change practice</button><RegisteredView registration={registration} /></>
    }
    renderInPage(<ChangePractice />, { page: "account", handlers: [http.get(availability, ({ params }) => params.id === "88" ? new Promise<Response>((resolve) => { finish = resolve }) : HttpResponse.json(true))] })
    await waitFor(() => expect(finish).toBeTypeOf("function"))
    fireEvent.click(screen.getByRole("button", { name: "Change practice" }))
    await act(async () => finish(HttpResponse.json(false)))
    expect(screen.queryByRole("button", { name: NPI_MESSAGES.registerPractice })).toBeNull()
  })
})
