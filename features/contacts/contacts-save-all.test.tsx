import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse, type HttpHandler } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { runSaveAll, SAVE_ORDER, toastError } from "@/features/shell"
import { fetchMyself } from "@/lib/api"
import { stubLayoutApis } from "@/test/dom-stubs"
import { stubViewport } from "@/test/media"
import { contactPointWire } from "@/test/myself-fixture"
import { renderInPage } from "@/test/providers"
import { EmailSection, PhoneSection } from "."

// The Sections' own toasts, observed (the shell's toast API; nothing renders a Toaster here).
vi.mock("@/features/shell/toasts", () => ({ toastSuccess: vi.fn(), toastError: vi.fn(() => ({ id: "t", dismiss: vi.fn() })), toastPartial: vi.fn() }))
// Two Sections' edits, two saves and two verifies: several seconds on a loaded CI runner.
vi.setConfig({ testTimeout: 20_000 })

/**
 * Story 3.6 (NG-9024, AD-8): Save all on `/` saves Email, including its
 * auto-verify, before Phone starts (`SAVE_ORDER`: personal → email → phone →
 * social). The real Email and Phone Sections render in one page
 * (`renderInPage`, which hands back the page's registry from
 * `useSectionRegistry`), MSW at `/api`, and `runSaveAll` runs with
 * `SAVE_ORDER` as `PageFrame` passes it. The "Save all" row of the I/O
 * matrix in `spec-3-6-verify-emails-make-an-email-primary-and-manage-notifications.md`.
 * (`SaveAllBar` itself is covered by Story 1.14; `features/contacts` may not import `features/save-all`.)
 */

const LIST = "/api/1h/v2/user/contact-point/list"
const MANAGE = "/api/1h/v2/health/contact-point"
const VERIFY = "/api/1h/v2/health/contact-point/verify"

type Wire = Record<string, unknown>
type Lists = Partial<Record<"Email" | "Mobile" | "Landline", Wire[]>>

const EMAILS: Wire[] = [contactPointWire({ id: 42, value: "ann@example.com", type: "Email", label: "Primary", isVerified: true, isNotificationEnabled: true, phoneNumberRegion: null })]
const MOBILE: Wire[] = [contactPointWire({ id: 12, value: "+14155512125", label: "Primary", isVerified: true, isNotificationEnabled: true })]
const BEFORE: Lists = { Email: EMAILS, Mobile: MOBILE, Landline: [] }
const AFTER: Lists = {
  Email: [...EMAILS, contactPointWire({ id: 44, value: "b@x.com", type: "Email", label: "Personal", isVerified: false, isNotificationEnabled: false, phoneNumberRegion: null })],
  Mobile: [...MOBILE, contactPointWire({ id: 13, value: "+14155550101", label: "Personal", isVerified: false, isNotificationEnabled: false })],
  Landline: [],
}

/**
 * Answers the three lists and records every write in order, named by what it
 * holds: a manage body by its added row's type, a verify by its ids. Each
 * manage POST makes its type's list answer the saved row (its refetch).
 */
function contactsServer() {
  const current: Lists = { ...BEFORE }
  const writes: string[] = []
  const handlers: HttpHandler[] = [
    http.get(LIST, ({ request }) => HttpResponse.json(current[new URL(request.url).searchParams.get("type") as keyof Lists] ?? [])),
    http.post(MANAGE, async ({ request }) => {
      const body = (await request.json()) as { contactPointsToAdd: { type: string }[] }
      const type = body.contactPointsToAdd[0]?.type
      writes.push(type === "Email" ? "email manage" : "phone manage")
      if (type === "Email") current.Email = AFTER.Email
      else current.Mobile = AFTER.Mobile
      return new HttpResponse(null, { status: 200 })
    }),
    http.post(VERIFY, async ({ request }) => {
      const { contactPointIds } = (await request.json()) as { contactPointIds: number[] }
      writes.push(contactPointIds.includes(44) ? `email verify ${contactPointIds.join(",")}` : `phone verify ${contactPointIds.join(",")}`)
      return HttpResponse.json({ success: true, contactPointIdsWithSendError: [] })
    }),
  ]
  return { writes, handlers }
}

const region = (name: string): HTMLElement => screen.getByRole("region", { name })
const isReady = (name: string): boolean => region(name).querySelector('[data-slot="state-frame"]')?.getAttribute("data-state") === "ready"

async function click(element: HTMLElement) {
  await act(async () => fireEvent.click(element))
}

/** Opens a Select and picks the option named `name`. */
async function pick(trigger: HTMLElement, name: string) {
  await act(async () => fireEvent.keyDown(trigger, { key: "Enter" }))
  await act(async () => fireEvent.click(screen.getByRole("option", { name })))
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull())
}

/** The new row (Add email / Add phone) of the Section named `name`. */
async function addRow(name: string, action: string): Promise<HTMLElement> {
  await click(within(region(name)).getByRole("button", { name: action }))
  const rows = region(name).querySelectorAll<HTMLElement>('[data-state="new"]')
  return rows[rows.length - 1]
}

beforeEach(() => {
  stubViewport(1024)
  stubLayoutApis()
  window.localStorage.clear()
  vi.mocked(toastError).mockClear()
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe("Save all with Email and Phone dirty (Story 3.6)", () => {
  it("runs email manage → email verify → phone manage → phone verify, and both save", async () => {
    const server = contactsServer()
    const { registry } = renderInPage(
      <>
        <PhoneSection />
        <EmailSection />
      </>,
      { page: "profile", handlers: server.handlers },
    )
    await waitFor(() => expect(isReady("Email") && isReady("Phone")).toBe(true))
    // D-A: a write goes out only once the page user is pinned (the safeguard re-reads myself per POST).
    await act(async () => {
      await fetchMyself()
    })

    const emailRow = await addRow("Email", "Add email")
    await act(async () => fireEvent.change(within(emailRow).getByRole("textbox", { name: "Email address" }), { target: { value: "b@x.com" } }))
    await pick(within(emailRow).getByRole("combobox", { name: "Label" }), "Personal")
    const phoneRow = await addRow("Phone", "Add phone")
    await act(async () => fireEvent.change(within(phoneRow).getByRole("textbox", { name: "Number" }), { target: { value: "4155550101" } }))
    await pick(within(phoneRow).getByRole("combobox", { name: "Label" }), "Personal")
    await pick(within(phoneRow).getByRole("combobox", { name: "Type" }), "Mobile")
    expect(registry.getDirtyCount()).toBe(2)

    let outcome: Awaited<ReturnType<typeof runSaveAll>> | undefined
    await act(async () => {
      outcome = await runSaveAll(registry, { order: SAVE_ORDER })
    })
    expect(outcome).toMatchObject({ kind: "done", failed: [] })
    expect(outcome?.kind === "done" ? outcome.saved.map((entry) => entry.id) : []).toEqual(["email", "phone"])
    expect(server.writes).toEqual(["email manage", "email verify 44", "phone manage", "phone verify 13"])
    expect(toastError).not.toHaveBeenCalled()
  })
})
