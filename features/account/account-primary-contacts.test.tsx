import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse, type HttpHandler } from "msw"
import { beforeEach, expect, it, vi } from "vitest"
import { useSWRConfig } from "swr"
import { keys, toContactPoints, toMyself } from "@/lib/api"
import { hashDraftBase, draftKey } from "@/features/shell/drafts"
import { accountFormDefaults } from "./schema"
import { contactPointWire, myselfWire } from "@/test/myself-fixture"
import { renderInPage } from "@/test/providers"
import { stubLayoutApis } from "@/test/dom-stubs"
import { stubViewport } from "@/test/media"
import { AccountSettingsSection } from "./account-settings-section"
vi.mock("next/navigation", async () => (await import("@/test/next-navigation")).nextNavigationMock)
const title = "Personal account settings"
const contactPath = "/api/1h/v2/user/contact-point/list"
const contactRows = [contactPointWire({ type: "Email", value: "ann.lee@example.com", isVerified: false }), contactPointWire({ id: 2, type: "Email", value: "work@example.com" })]
beforeEach(() => { stubViewport(360); stubLayoutApis() })
async function open(handlers: readonly HttpHandler[] = []) {
  const rendered = renderInPage(<AccountSettingsSection />, { page: "account", handlers })
  await screen.findByRole("table", { name: title })
  await userEvent.click(screen.getByRole("button", { name: "Edit" }))
  return rendered
}
it("shows current while busy, keeps first-change notice through reversion and responsive remount", async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const handlers = [http.get(contactPath, async ({ request }) => {
    await gate
    return HttpResponse.json(new URL(request.url).searchParams.get("type") === "Email" ? contactRows : [])
  })]
  await open(handlers)
  const picker = () => screen.getByRole("combobox", { name: "Primary email address" })
  expect(picker().getAttribute("aria-busy")).toBe("true")
  expect(picker().textContent).toContain("ann.lee@example.com")
  await act(async () => release())
  await waitFor(() => expect(picker().getAttribute("aria-busy")).toBeNull())
  fireEvent.keyDown(picker(), { key: "Enter" })
  fireEvent.click(await screen.findByRole("option", { name: "work@example.com" }))
  fireEvent.keyDown(picker(), { key: "Enter" })
  fireEvent.click(await screen.findByRole("option", { name: "ann.lee@example.com" }))
  expect(screen.getByText(/Changing your primary email/)).toBeTruthy()
  act(() => stubViewport(1280))
  expect(screen.getByText(/Changing your primary email/)).toBeTruthy()
  await userEvent.click(screen.getByRole("button", { name: "Save" }))
  expect(screen.queryByText(/Changing your primary email/)).toBeNull()
  expect(screen.getByText("There are no changes")).toBeTruthy()
})
it("failed picker reads cannot authorize changed drafts but names remain savable", async () => {
  const writes: unknown[] = []
  const rendered = await open([
    http.get(contactPath, () => HttpResponse.json({}, { status: 403 })),
    http.put("/api/1h/v2/user/edit", async ({ request }) => { writes.push(await request.json()); return new HttpResponse(null, { status: 204 }) }),
  ])
  await screen.findAllByText("You don't have access to this in your current account")
  expect(screen.queryByRole("combobox", { name: "Primary email address" })).toBeNull()
  const input = screen.getByRole("textbox", { name: "First name" })
  await userEvent.clear(input)
  await userEvent.type(input, "Bea")
  await userEvent.click(screen.getByRole("button", { name: "Save" }))
  await screen.findByRole("button", { name: "Edit" })
  expect(writes).toEqual([{ firstName: "Bea" }])
  expect(rendered.registry.getDirtyCount()).toBe(0)
})
it("unavailable draft primaries fall back without preventing first-invalid date focus", async () => {
  const rendered = await open()
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Primary email address" }).getAttribute("aria-busy")).toBeNull())
  const entry = rendered.registry.get("account")!
  await act(async () => { entry.applyDraft!({ ...entry.getDraftValues!(), primaryEmail: "unknown@example.com", primaryPhone: "unknown", birthDate: "", timeZone: "America/New_York" }) })
  // Unavailable drafts fall back without erasing unrelated invalid draft text.
  expect(entry.getDraftValues?.().primaryEmail).toBe("ann.lee@example.com")
  await userEvent.click(screen.getByRole("button", { name: "Save" }))
  expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Birth date" }))
  expect(within(screen.getByRole("region", { name: title })).getByText("Birth date is required")).toBeTruthy()
})

function RevalidateContacts({ rows }: { readonly rows?: readonly Record<string, unknown>[] }) {
  const { mutate } = useSWRConfig()
  return <button onClick={() => { if (rows) void mutate(keys.contactPoints("Email"), toContactPoints(rows), false); else void mutate(keys.contactPoints("Email")) }}>Refresh emails</button>
}
async function chooseEmail(value = "work@example.com") {
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Primary email address" }), { key: "Enter" })
  fireEvent.click(await screen.findByRole("option", { name: value }))
}
it("mounted revalidation keeps invalid selection recoverable without losing unrelated edits", async () => {
  const writes: unknown[] = []
  renderInPage(<><AccountSettingsSection /><RevalidateContacts rows={[]} /></>, { page: "account", contacts: { Email: contactRows }, handlers: [http.put("/api/1h/v2/user/edit", async ({ request }) => { writes.push(await request.json()); return new HttpResponse(null, { status: 204 }) })] })
  await userEvent.click(await screen.findByRole("button", { name: "Edit" }))
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Primary email address" }).getAttribute("aria-busy")).toBeNull())
  await chooseEmail()
  const first = screen.getByRole("textbox", { name: "First name" }) as HTMLInputElement
  await userEvent.clear(first); await userEvent.type(first, "Bea")
  await userEvent.click(screen.getByRole("button", { name: "Refresh emails" }))
  await userEvent.click(screen.getByRole("button", { name: "Save" }))
  expect(writes).toEqual([])
  expect(first.value).toBe("Bea")
  expect(screen.getByText("Select a current verified contact")).toBeTruthy()
  expect(screen.getByRole("combobox", { name: "Primary email address" }).getAttribute("aria-disabled")).toBeNull()
  await chooseEmail("ann.lee@example.com")
  await userEvent.click(screen.getByRole("button", { name: "Save" }))
  await screen.findByRole("button", { name: "Edit" })
  expect(writes).toEqual([{ firstName: "Bea" }])
})
async function seedDraft(changes: Record<string, string>) {
  const baseline = accountFormDefaults(toMyself(myselfWire())!)
  localStorage.setItem(draftKey({ environment: "demo", userId: 42 }, "account"), JSON.stringify({ savedAt: Date.now(), baseHash: await hashDraftBase({ ...baseline }), values: { ...baseline, ...changes } }))
}
it.each([false, true])("restores %s changed email draft despite unrelated Mobile 403", async (changedEmail) => {
  await seedDraft({ firstName: "Bea", timeZone: "America/New_York", ...(changedEmail ? { primaryEmail: "work@example.com" } : {}) })
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  renderInPage(<AccountSettingsSection />, { page: "account", handlers: [http.get(contactPath, async ({ request }) => {
    if (new URL(request.url).searchParams.get("type") === "Mobile") return HttpResponse.json({}, { status: 403 })
    await gate
    return HttpResponse.json(contactRows)
  })] })
  await userEvent.click(await screen.findByRole("button", { name: "Restore" }))
  if (changedEmail) expect(screen.queryByRole("textbox", { name: "First name" })).toBeNull()
  else expect((screen.getByRole("textbox", { name: "First name" }) as HTMLInputElement).value).toBe("Bea")
  await act(async () => release())
  await waitFor(() => expect((screen.getByRole("textbox", { name: "First name" }) as HTMLInputElement).value).toBe("Bea"))
  expect(screen.getByRole("combobox", { name: "Primary email address" }).textContent).toBe(changedEmail ? "work@example.com" : "ann.lee@example.com")
  expect(screen.getByRole("combobox", { name: "Default time zone" }).textContent).toBe("Eastern")
})
it("current national non-US phone uses primary row region despite different contact formatting", async () => {
  renderInPage(<AccountSettingsSection />, { page: "account", myself: myselfWire({ phoneNumber: "02071838750" }), contacts: { Mobile: [contactPointWire({ value: "+442071838750", phoneNumberRegion: "GB" })] } })
  await userEvent.click(await screen.findByRole("button", { name: "Edit" }))
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Primary phone number" }).textContent).toBe("+44 20 7183 8750"))
})
function ConfirmPrimaryIdentity() {
  const { mutate } = useSWRConfig()
  return <button onClick={() => void mutate(keys.myself(), toMyself(myselfWire({ email: "work@example.com", phoneNumber: "02071838750" })), false)}>Confirm new primaries</button>
}
it("acknowledged replacements override stale identity and old Primary row region", async () => {
  const phones = [contactPointWire(), contactPointWire({ id: 2, value: "02071838750", label: "Work", phoneNumberRegion: "GB" })]
  const rendered = renderInPage(<><AccountSettingsSection /><ConfirmPrimaryIdentity /></>, { page: "account", handlers: [http.get(contactPath, ({ request }) => HttpResponse.json(new URL(request.url).searchParams.get("type") === "Email" ? contactRows : phones)), http.put("/api/1h/v2/user/edit", () => new HttpResponse(null, { status: 204 }))] })
  await userEvent.click(await screen.findByRole("button", { name: "Edit" }))
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Primary phone number" }).getAttribute("aria-busy")).toBeNull())
  await chooseEmail()
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Primary phone number" }), { key: "Enter" })
  fireEvent.click(await screen.findByRole("option", { name: "+44 20 7183 8750" }))
  await userEvent.click(screen.getByRole("button", { name: "Save" }))
  await screen.findByRole("button", { name: "Edit" })
  await waitFor(() => expect(screen.getByRole("table", { name: title }).textContent).toContain("work@example.com"))
  expect(screen.getByRole("table", { name: title }).textContent).toContain("+44 20 7183 8750")
  expect(rendered.registry.getDirtyCount()).toBe(0)
  await userEvent.click(screen.getByRole("button", { name: "Confirm new primaries" }))
  await waitFor(() => expect(rendered.registry.get("account")?.getDraftBase?.().primaryPhone).toBe("02071838750"))
  expect(screen.getByRole("table", { name: title }).textContent).toContain("+44 20 7183 8750")
})
it("repeated failed contact Retry announces another attempt and exposes pending busy state", async () => {
  let release!: () => void
  let attempts = 0
  let hold = false
  const rendered = renderInPage(<><AccountSettingsSection /><RevalidateContacts /></>, { page: "account", handlers: [http.get(contactPath, async ({ request }) => {
    if (new URL(request.url).searchParams.get("type") === "Mobile") return HttpResponse.json([])
    attempts++
    if (attempts === 1) return HttpResponse.json(contactRows)
    if (hold) await new Promise<void>((resolve) => { release = resolve })
    return HttpResponse.json({}, { status: 500 })
  })] })
  await userEvent.click(await screen.findByRole("button", { name: "Edit" }))
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Primary email address" }).getAttribute("aria-busy")).toBeNull())
  await userEvent.click(screen.getByRole("button", { name: "Refresh emails" }))
  await screen.findByText("Something went wrong while loading profile information")
  const banner = () => screen.getByText("Something went wrong while loading profile information")
  const firstAnnouncement = banner()
  hold = true
  await userEvent.click(screen.getByRole("button", { name: "Retry" }))
  await waitFor(() => expect(rendered.container.querySelector('[data-state="loading"][aria-busy="true"]')).not.toBeNull())
  expect(attempts).toBe(3)
  await act(async () => { hold = false; release() })
  await screen.findByText("Something went wrong while loading profile information")
  expect(banner()).not.toBe(firstAnnouncement)
})

it("duplicate email is only a field error while ordinary failures retain the part banner", async () => {
  let duplicate = true
  await open([http.get(contactPath, ({ request }) => HttpResponse.json(new URL(request.url).searchParams.get("type") === "Email" ? contactRows : [])), http.put("/api/1h/v2/user/edit", () => HttpResponse.json({ message: duplicate ? "User with email 'work@example.com' already exists." : "Contact rejected safely" }, { status: 400 }))])
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Primary email address" }).getAttribute("aria-busy")).toBeNull())
  await chooseEmail()
  await userEvent.click(screen.getByRole("button", { name: "Save" }))
  await screen.findByText("This email is already used by another account")
  expect(screen.getAllByText("This email is already used by another account")).toHaveLength(1)
  expect(screen.queryByText(/Account details was not saved/)).toBeNull()
  duplicate = false
  await userEvent.click(screen.getByRole("button", { name: "Save" }))
  expect(await screen.findByText(/Account details was not saved. Contact rejected safely/)).toBeTruthy()
})
it("pending changed-contact Restore retries only relevant reads with busy and repeated failure feedback", async () => {
  await seedDraft({ firstName: "Bea", primaryEmail: "work@example.com" })
  let hold = false
  let succeed = false
  let release!: () => void
  let mobiles = 0
  const rendered = renderInPage(<AccountSettingsSection />, { page: "account", handlers: [http.get(contactPath, async ({ request }) => {
    if (new URL(request.url).searchParams.get("type") === "Mobile") { mobiles++; return HttpResponse.json({}, { status: 403 }) }
    if (hold) await new Promise<void>((resolve) => { release = resolve })
    return succeed ? HttpResponse.json(contactRows) : HttpResponse.json({}, { status: 500 })
  })] })
  await userEvent.click(await screen.findByRole("button", { name: "Restore" }))
  const firstFailure = await screen.findByText("Something went wrong while loading profile information")
  hold = true
  await userEvent.click(screen.getByRole("button", { name: "Retry" }))
  await waitFor(() => expect(rendered.container.querySelector('[data-state="loading"][aria-busy="true"]')).not.toBeNull())
  await act(async () => { hold = false; release() })
  expect(await screen.findByText("Something went wrong while loading profile information")).not.toBe(firstFailure)
  expect(mobiles).toBe(1)
  succeed = true
  await userEvent.click(screen.getByRole("button", { name: "Retry" }))
  await waitFor(() => expect((screen.getByRole("textbox", { name: "First name" }) as HTMLInputElement).value).toBe("Bea"))
  expect(screen.getByRole("combobox", { name: "Primary email address" }).textContent).toBe("work@example.com")
})
