import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse, type JsonBodyType } from "msw"
import { useEffect } from "react"
import { useSWRConfig, type ScopedMutator } from "swr"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { toastError, toastPartial, toastSuccess } from "@/features/shell"
import { keys, type MappedError } from "@/lib/api"
import { axeViolations } from "@/test/axe"
import { stubLayoutApis } from "@/test/dom-stubs"
import { stubViewport } from "@/test/media"
import { myselfWire } from "@/test/myself-fixture"
import { renderInPage } from "@/test/providers"
import { InsuranceSection } from "."
import { clearInsurancePendingCards, dropInsurancePendingCards, insurancePendingCard, setInsurancePendingCard } from "./pending-cards"
import { insuranceDeleteFailureText, insuranceDeleteRetryable, isInsurancePolicyGone } from "./use-policy-delete"

// The delete's toasts, observed (the shell's toast API; nothing renders a Toaster here). Each toast has its own `dismiss`.
vi.mock("@/features/shell/toasts", () => ({
  toastSuccess: vi.fn(() => ({ id: "s", dismiss: vi.fn() })),
  toastError: vi.fn(() => ({ id: "e", dismiss: vi.fn() })),
  toastPartial: vi.fn(() => ({ id: "p", dismiss: vi.fn() })),
}))
// The pending store as is, with its policy drop observable (a test makes it throw).
vi.mock("./pending-cards", async (original) => {
  const actual = await original<typeof import("./pending-cards")>()
  return { ...actual, dropInsurancePendingCards: vi.fn(actual.dropInsurancePendingCards) }
})

vi.setConfig({ testTimeout: 20_000 })

/**
 * Story 5.5 (NG-9029): delete a policy, on `/` the way `PageFrame` hosts the
 * Section (`renderInPage`, MSW at `/api`). Covers every row of the I/O matrix
 * in `spec-5-5-delete-a-policy.md`: the kebab, the confirm's copy and focus,
 * both platform outcomes (labelled Deleted, unlinked), busy, the failures
 * with Retry, the "already gone" answers (decision 1B), the pending image,
 * the focus after a removal, and axe in light and dark. The 44 px targets
 * at 360 px are measured in the e2e (`profile-insurance.spec.ts`, Story 5.5).
 */

const LIST = "/api/1h/v2/health/patient/insurance"
const DELETE_POLICY = "/api/1h/v2/health/insurance/:id"
const TYPE_KEY_PATH = "/api/1h/v2/type/key/Insurance"
const ORGS = "/api/1h/v2/health/insurance/organizations"

type Wire = Record<string, unknown>
type Answer = () => Response | Promise<Response>

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

const MEDICAL = wire()
const DENTAL = wire({ id: 56, insuranceType: "DENTAL", insuranceOrganizationDTO: { insuranceCompanyName: "Delta Dental", insuranceCompanyId: 8 } })
const VISION = wire({ id: 57, insuranceType: "VISION", insurancePrecedence: "SECONDARY", insuranceOrganizationDTO: { insuranceCompanyName: "VSP", insuranceCompanyId: 9 } })
const deleted = (row: Wire): Wire => ({ ...row, label: "Deleted" })
const without = (rows: readonly Wire[], id: number): Wire[] => rows.filter((row) => row.id !== id)

const MEDICAL_NAME = "Blue Shield Medical Insurance"
const DENTAL_NAME = "Delta Dental Dental Insurance"
const VISION_NAME = "VSP Vision Insurance"

const json = (body: unknown, status = 200): Answer => () => HttpResponse.json(body as JsonBodyType, { status })
const page = (rows: readonly Wire[]): Answer => json({ data: rows, lastPage: true })
const EMPTY_200: Answer = () => new HttpResponse(null, { status: 200 })
const upstream400 = (message: string): Answer => json({ message, code: 400 }, 400)

interface Server {
  /** Every delete and refetch in order: `DELETE 55`, `list`. */
  readonly log: string[]
  /** The delete requests' query strings and bodies. */
  readonly deletes: { readonly search: string; readonly body: string }[]
  setList: (answer: Answer) => void
  setDelete: (answer: Answer) => void
}

function makeServer(list: Answer) {
  const log: string[] = []
  const deletes: { search: string; body: string }[] = []
  const state: { list: Answer; delete: Answer; ready: boolean } = { list, delete: EMPTY_200, ready: false }
  const handlers = [
    http.get(LIST, () => {
      if (state.ready) log.push("list")
      return state.list()
    }),
    // The editor's reads (a test opens Edit).
    http.get(TYPE_KEY_PATH, () => HttpResponse.json({ boKey: "Insurance", attributes: [], relationships: [] })),
    http.get(ORGS, () => HttpResponse.json({ data: [], lastPage: true })),
    http.delete(DELETE_POLICY, async ({ params, request }) => {
      log.push(`DELETE ${String(params.id)}`)
      deletes.push({ search: new URL(request.url).search, body: await request.text() })
      return state.delete()
    }),
  ]
  const server: Server = {
    log,
    deletes,
    setList: (answer) => {
      state.list = answer
    },
    setDelete: (answer) => {
      state.delete = answer
    },
  }
  return { server, handlers, ready: () => (state.ready = true) }
}

const section = (): HTMLElement => screen.getByRole("region", { name: "Insurance" })
const frame = (): HTMLElement | null => section().querySelector('[data-slot="state-frame"]')
const confirmDialog = (): HTMLElement => screen.getByRole("alertdialog")
const headerAdd = (): HTMLElement => within(section().querySelector('[data-slot="section-header"]') as HTMLElement).getByRole("button", { name: "Add insurance" })
const emptyAdd = (): HTMLElement => within(section().querySelector('[data-slot="empty-state"]') as HTMLElement).getByRole("button", { name: "Add insurance" })
const kebabOf = (name: string): HTMLElement => within(section()).getByRole("button", { name: `More actions for ${name}` })
const cardOf = (title: string): HTMLElement => within(section()).getByRole("article", { name: title })

async function renderSection(rows: readonly Wire[] = [MEDICAL, DENTAL, VISION]) {
  const { server, handlers, ready } = makeServer(page(rows))
  let mutate: ScopedMutator | undefined
  // Hands out the SWR `mutate`, to revalidate `keys.insurance()` as another read would.
  function Probe() {
    const { mutate: scoped } = useSWRConfig()
    useEffect(() => {
      mutate = scoped
    }, [scoped])
    return null
  }
  const result = renderInPage(
    <>
      <InsuranceSection />
      <Probe />
    </>,
    { page: "profile", handlers, myself: myselfWire({ firstName: "Avery", lastName: "Lee" }) },
  )
  await waitFor(() => expect(frame()?.getAttribute("data-state")).toBe("ready"))
  ready()
  const revalidate = async () => {
    await act(async () => {
      await mutate?.(keys.insurance())
    })
  }
  return { ...result, server, revalidate }
}

/** A hold on the next answer: `answer` waits until `release()`. */
function held(answer: Answer = EMPTY_200): { readonly answer: Answer; readonly release: () => void } {
  let release: () => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  return {
    answer: async () => {
      await gate
      return answer()
    },
    release: () => release(),
  }
}

async function click(element: HTMLElement) {
  await act(async () => fireEvent.click(element))
}

/** Opens a card's kebab (keyboard, as a user would) and answers its kebab. */
async function openMenu(name: string): Promise<HTMLElement> {
  const kebab = kebabOf(name)
  kebab.focus()
  await act(async () => fireEvent.keyDown(kebab, { key: "Enter" }))
  await screen.findByRole("menu")
  return kebab
}

/** Kebab → "Delete": the confirm opens (focus on Cancel). */
async function openDelete(name: string): Promise<HTMLElement> {
  const kebab = await openMenu(name)
  await click(screen.getByRole("menuitem", { name: "Delete" }))
  await screen.findByRole("alertdialog")
  await waitFor(() => expect(document.activeElement).toBe(within(confirmDialog()).getByRole("button", { name: "Cancel" })))
  return kebab
}

async function confirm() {
  await click(within(confirmDialog()).getByRole("button", { name: "Delete policy" }))
}

const closed = () => waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())

/** The Retry of the last error toast. */
function lastRetry(): () => void {
  const calls = vi.mocked(toastError).mock.calls
  const onRetry = calls.at(-1)?.[1]?.onRetry
  if (!onRetry) throw new Error("no error toast with Retry")
  return onRetry
}

beforeEach(() => {
  stubViewport(1024)
  stubLayoutApis()
  vi.mocked(toastSuccess).mockClear()
  vi.mocked(toastError).mockClear()
  vi.mocked(toastPartial).mockClear()
  vi.mocked(dropInsurancePendingCards).mockClear()
})
afterEach(() => {
  document.documentElement.classList.remove("dark")
  clearInsurancePendingCards()
})

describe("delete helpers", () => {
  it.each<[MappedError, boolean]>([
    [{ kind: "field", field: "policy", messageKey: "insurance.policyAlreadyRemoved" }, true],
    [{ kind: "field", field: "policy", messageKey: "insurance.policyMissing" }, true],
    [{ kind: "field", field: "memberId", messageKey: "insurance.memberIdLength" }, false],
    [{ kind: "generic" }, false],
    [{ kind: "network" }, false],
  ])("isInsurancePolicyGone(%j) → %s", (mapped, expected) => {
    expect(isInsurancePolicyGone(mapped)).toBe(expected)
  })

  it.each<[MappedError, string]>([
    [{ kind: "network" }, "Couldn't delete insurance policy. Check your connection."],
    [{ kind: "generic" }, "Couldn't delete insurance policy."],
    [{ kind: "generic", message: "Boom" }, "Couldn't delete insurance policy."],
    [{ kind: "coded", code: "UPLOAD_TOO_LARGE" }, "Couldn't delete insurance policy."],
    [{ kind: "forbidden" }, "You don't have access to this in your current account"],
    // A field rule of another insurance request is no delete message.
    [{ kind: "field", field: "memberId", messageKey: "insurance.memberIdLength" }, "Couldn't delete insurance policy."],
  ])("insuranceDeleteFailureText(%j) → %j", (mapped, expected) => {
    expect(insuranceDeleteFailureText(mapped)).toBe(expected)
  })

  it.each<[MappedError, { statusCode?: number; retryable?: false }, boolean]>([
    [{ kind: "network" }, {}, true],
    [{ kind: "network" }, { statusCode: 503, retryable: false }, false],
    [{ kind: "generic" }, { statusCode: 500 }, true],
    [{ kind: "generic" }, {}, true],
    [{ kind: "generic" }, { statusCode: 400 }, false],
    [{ kind: "generic", message: "Nope" }, { statusCode: 409 }, false],
    [{ kind: "generic" }, { statusCode: 500, retryable: false }, false],
    [{ kind: "forbidden" }, { statusCode: 403 }, false],
    [{ kind: "coded", code: "UPLOAD_TOO_LARGE" }, { statusCode: 413 }, false],
    [{ kind: "field", field: "memberId", messageKey: "insurance.memberIdLength" }, { statusCode: 400 }, false],
  ])("insuranceDeleteRetryable(%j, %j) → %s", (mapped, response, expected) => {
    expect(insuranceDeleteRetryable(mapped, response)).toBe(expected)
  })
})

describe("Delete a policy: kebab and confirm", () => {
  it("an active card's kebab lists Edit and Delete (destructive); a Deleted card has no kebab", async () => {
    await renderSection([MEDICAL, deleted(DENTAL)])
    await openMenu(MEDICAL_NAME)
    const items = screen.getAllByRole("menuitem")
    expect(items.map((item) => item.textContent)).toEqual(["Edit", "Delete"])
    expect(items[1].getAttribute("data-variant")).toBe("destructive")
    expect(items[0].getAttribute("data-variant")).toBe("default")
    expect(within(section()).queryByRole("button", { name: `More actions for ${DENTAL_NAME}` })).toBeNull()
  })

  it("a policy without an id has no kebab, so nothing to delete", async () => {
    await renderSection([wire({ id: null })])
    expect(within(section()).queryByRole("button", { name: `More actions for ${MEDICAL_NAME}` })).toBeNull()
  })

  it("shows the destructive confirm: title, body with the policy name, Cancel and Delete policy; focus starts on Cancel", async () => {
    await renderSection()
    await openDelete(DENTAL_NAME)
    const dialog = confirmDialog()
    expect(within(dialog).getByText("Delete this insurance policy?")).toBeTruthy()
    expect(within(dialog).getByText(`${DENTAL_NAME} will be removed from your profile.`)).toBeTruthy()
    expect(within(dialog).getAllByRole("button").map((button) => button.textContent)).toEqual(["Cancel", "Delete policy"])
    expect(within(dialog).getByRole("button", { name: "Delete policy" }).className).toMatch(/bg-destructive-fill/)
  })

  it.each(["Escape", "Cancel"] as const)("%s closes with no request, and focus returns to the kebab", async (how) => {
    const { server } = await renderSection()
    const kebab = await openDelete(DENTAL_NAME)
    if (how === "Escape") await act(async () => fireEvent.keyDown(confirmDialog(), { key: "Escape" }))
    else await click(within(confirmDialog()).getByRole("button", { name: "Cancel" }))
    await closed()
    await waitFor(() => expect(document.activeElement).toBe(kebab))
    expect(server.log).toEqual([])
    expect(toastSuccess).not.toHaveBeenCalled()
  })
})

describe("Delete a policy: outcomes", () => {
  it("labelled Deleted (the only policyholder): one DELETE with no query or body, the refetch shows the muted card, the toast, focus on the next kebab", async () => {
    const { server } = await renderSection()
    await openDelete(MEDICAL_NAME)
    server.setList(page([deleted(MEDICAL), DENTAL, VISION]))
    await confirm()
    await closed()
    expect(server.log).toEqual(["DELETE 55", "list"])
    expect(server.deletes).toEqual([{ search: "", body: "" }])
    const card = cardOf("Medical Insurance")
    expect(card.getAttribute("data-deleted")).toBe("true")
    expect(within(card).getByText("Deleted")).toBeTruthy()
    expect(within(section()).queryByRole("button", { name: `More actions for ${MEDICAL_NAME}` })).toBeNull()
    expect(toastSuccess).toHaveBeenCalledWith("Insurance policy deleted.")
    expect(toastError).not.toHaveBeenCalled()
    await waitFor(() => expect(document.activeElement).toBe(kebabOf(DENTAL_NAME)))
  })

  it("unlinked (other policyholders): the card is gone, focus on the next card's kebab", async () => {
    const { server } = await renderSection()
    await openDelete(DENTAL_NAME)
    server.setList(page(without([MEDICAL, DENTAL, VISION], 56)))
    await confirm()
    await closed()
    expect(within(section()).queryByRole("article", { name: "Dental Insurance" })).toBeNull()
    expect(toastSuccess).toHaveBeenCalledWith("Insurance policy deleted.")
    await waitFor(() => expect(document.activeElement).toBe(kebabOf(VISION_NAME)))
  })

  it("with no next card, focus goes to the previous card's kebab", async () => {
    const { server } = await renderSection([MEDICAL, DENTAL, VISION, deleted(wire({ id: 58, insuranceType: "DRUG" }))])
    await openDelete(VISION_NAME)
    server.setList(page([MEDICAL, DENTAL, deleted(VISION), deleted(wire({ id: 58, insuranceType: "DRUG" }))]))
    await confirm()
    await closed()
    await waitFor(() => expect(document.activeElement).toBe(kebabOf(DENTAL_NAME)))
  })

  it("the last card, unlinked: focus on the empty card's Add insurance", async () => {
    const { server } = await renderSection([MEDICAL])
    await openDelete(MEDICAL_NAME)
    server.setList(page([]))
    await confirm()
    await closed()
    await waitFor(() => expect(document.activeElement).toBe(emptyAdd()))
    expect(toastSuccess).toHaveBeenCalledWith("Insurance policy deleted.")
  })

  it("the last active card, labelled Deleted: focus on the header's Add insurance (no empty card while a Deleted one shows)", async () => {
    const { server } = await renderSection([MEDICAL, deleted(DENTAL)])
    await openDelete(MEDICAL_NAME)
    server.setList(page([deleted(MEDICAL), deleted(DENTAL)]))
    await confirm()
    await closed()
    await waitFor(() => expect(document.activeElement).toBe(headerAdd()))
  })

  it("a Primary policy deletes with no extra prompt", async () => {
    const { server } = await renderSection()
    await openDelete(MEDICAL_NAME)
    server.setList(page(without([MEDICAL, DENTAL, VISION], 55)))
    await confirm()
    await closed()
    expect(server.log).toEqual(["DELETE 55", "list"])
  })

  it("busy: the confirm shows Deleting… with a spinner, and Escape, Cancel and the scrim don't close it", async () => {
    const { server } = await renderSection()
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.setDelete(async () => {
      await gate
      return new HttpResponse(null, { status: 200 })
    })
    await openDelete(DENTAL_NAME)
    await confirm()
    const dialog = confirmDialog()
    await waitFor(() => expect(dialog.getAttribute("aria-busy")).toBe("true"))
    const busyButton = within(dialog).getAllByRole("button").at(-1) as HTMLElement
    expect(busyButton.getAttribute("aria-busy")).toBe("true")
    expect(busyButton.textContent).toContain("Deleting…")
    await act(async () => fireEvent.keyDown(dialog, { key: "Escape" }))
    await click(within(dialog).getByRole("button", { name: "Cancel" }))
    const scrim = document.querySelector('[data-slot="dialog-overlay"]')
    expect(scrim).not.toBeNull()
    await act(async () => fireEvent.pointerDown(scrim as Element))
    expect(screen.getByRole("alertdialog")).toBe(dialog)
    // A second confirm meanwhile sends nothing more.
    await click(busyButton)
    server.setList(page(without([MEDICAL, DENTAL, VISION], 56)))
    await act(async () => release())
    await closed()
    expect(server.log).toEqual(["DELETE 56", "list"])
  })

  it("drops the policy's pending card images on success (Story 5.3's in-memory store)", async () => {
    const { server } = await renderSection()
    setInsurancePendingCard(56, "front", { blob: new Blob([new Uint8Array([1])]), name: "front.png", oldFileId: null })
    setInsurancePendingCard(55, "back", { blob: null, name: "back.png", oldFileId: null })
    await openDelete(DENTAL_NAME)
    server.setList(page(without([MEDICAL, DENTAL, VISION], 56)))
    await confirm()
    await closed()
    expect(insurancePendingCard(56, "front")).toBeUndefined()
    expect(insurancePendingCard(55, "back")).toBeDefined()
  })
})

describe("Delete a policy: failures", () => {
  it("a network failure: the dialog closes, the card is unchanged, focus on the kebab, a persisting error toast; Retry deletes again with no confirm", async () => {
    const { server } = await renderSection()
    setInsurancePendingCard(56, "front", { blob: null, name: "front.png", oldFileId: null })
    const kebab = await openDelete(DENTAL_NAME)
    server.setDelete(() => HttpResponse.error())
    await confirm()
    await closed()
    await waitFor(() => expect(document.activeElement).toBe(kebab))
    expect(server.log).toEqual(["DELETE 56"])
    expect(toastError).toHaveBeenCalledWith("Couldn't delete insurance policy. Check your connection.", { onRetry: expect.any(Function) })
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(cardOf("Dental Insurance").getAttribute("data-deleted")).toBeNull()
    expect(insurancePendingCard(56, "front")).toBeDefined()

    server.setDelete(EMPTY_200)
    server.setList(page(without([MEDICAL, DENTAL, VISION], 56)))
    await act(async () => lastRetry()())
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(server.log).toEqual(["DELETE 56", "DELETE 56", "list"])
    expect(toastSuccess).toHaveBeenCalledWith("Insurance policy deleted.")
    expect(insurancePendingCard(56, "front")).toBeUndefined()
    await waitFor(() => expect(document.activeElement).toBe(kebabOf(VISION_NAME)))
  })

  it("another failure reads Couldn't delete insurance policy.; a failed Retry toasts again with its own Retry", async () => {
    const { server } = await renderSection()
    await openDelete(DENTAL_NAME)
    server.setDelete(json({ message: "Something went wrong. Please contact an administrator.", code: 500 }, 500))
    await confirm()
    await closed()
    expect(toastError).toHaveBeenLastCalledWith("Couldn't delete insurance policy.", { onRetry: expect.any(Function) })
    await act(async () => lastRetry()())
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(2))
    expect(server.log).toEqual(["DELETE 56", "DELETE 56"])
  })

  it("Retry is single flight: one delete per policy at a time", async () => {
    const { server } = await renderSection()
    await openDelete(DENTAL_NAME)
    server.setDelete(json({ message: "boom", code: 500 }, 500))
    await confirm()
    await closed()
    const retry = lastRetry()
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.setDelete(async () => {
      await gate
      return new HttpResponse(null, { status: 200 })
    })
    server.setList(page(without([MEDICAL, DENTAL, VISION], 56)))
    await act(async () => {
      retry()
      retry()
    })
    await act(async () => release())
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1))
    expect(server.log).toEqual(["DELETE 56", "DELETE 56", "list"])
  })

  it("a session end shows nothing (the shell handles it)", async () => {
    const { server } = await renderSection()
    await openDelete(DENTAL_NAME)
    server.setDelete(json({ errorCode: "SESSION_EXPIRED", source: "proxy" }, 401))
    await confirm()
    await closed()
    expect(toastError).not.toHaveBeenCalled()
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(server.log).toEqual(["DELETE 56"])
  })

  it.each([
    "Insurance with Id: 56 is already deleted.",
    "Insurance with id: 56 not found.",
    "Patient with id: {12} does not have an insurance with id: {56}",
  ])("already gone (decision 1B) %j: refetch, the dialog closes, This policy was already removed., no error, focus as on success", async (message) => {
    const { server } = await renderSection()
    setInsurancePendingCard(56, "back", { blob: null, name: "back.png", oldFileId: null })
    await openDelete(DENTAL_NAME)
    server.setDelete(upstream400(message))
    server.setList(page(without([MEDICAL, DENTAL, VISION], 56)))
    await confirm()
    await closed()
    expect(server.log).toEqual(["DELETE 56", "list"])
    expect(toastError).not.toHaveBeenCalled()
    expect(toastSuccess).toHaveBeenCalledWith("This policy was already removed.")
    expect(toastSuccess).not.toHaveBeenCalledWith("Insurance policy deleted.")
    expect(insurancePendingCard(56, "back")).toBeUndefined()
    await waitFor(() => expect(document.activeElement).toBe(kebabOf(VISION_NAME)))
  })

  it("a failed list read after the delete: the cached card reads Deleted (no kebab) until the next revalidation; the success toast", async () => {
    const { server, revalidate } = await renderSection()
    await openDelete(DENTAL_NAME)
    server.setList(json({ message: "boom" }, 500))
    await confirm()
    await closed()
    expect(server.log).toEqual(["DELETE 56", "list"])
    expect(toastSuccess).toHaveBeenCalledWith("Insurance policy deleted.")
    expect(toastError).not.toHaveBeenCalled()
    expect(cardOf("Dental Insurance").getAttribute("data-deleted")).toBe("true")
    expect(within(section()).queryByRole("button", { name: `More actions for ${DENTAL_NAME}` })).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(kebabOf(VISION_NAME)))
    // The next revalidation shows the platform's result (here: unlinked).
    server.setList(page(without([MEDICAL, DENTAL, VISION], 56)))
    await revalidate()
    await waitFor(() => expect(within(section()).queryByRole("article", { name: "Dental Insurance" })).toBeNull())
  })

  it("once the DELETE succeeded, a later step that throws is never reported as a failure", async () => {
    const { server } = await renderSection()
    vi.mocked(dropInsurancePendingCards).mockImplementationOnce(() => {
      throw new Error("boom")
    })
    await openDelete(DENTAL_NAME)
    server.setList(page(without([MEDICAL, DENTAL, VISION], 56)))
    await confirm()
    await closed()
    expect(dropInsurancePendingCards).toHaveBeenCalledWith(56)
    expect(toastError).not.toHaveBeenCalled()
    expect(toastPartial).not.toHaveBeenCalled()
    expect(toastSuccess).toHaveBeenCalledWith("Insurance policy deleted.")
    expect(within(section()).queryByRole("article", { name: "Dental Insurance" })).toBeNull()
  })

  it.each<[string, Answer, string]>([
    ["an upstream 403", json({ message: "Forbidden", code: 403 }, 403), "You don't have access to this in your current account"],
    ["a proxy refusal", json({ errorCode: "NOT_ALLOWED", source: "proxy" }, 403), "Couldn't delete insurance policy."],
    ["an upstream 4xx with its own text", upstream400("Something about this policy."), "Couldn't delete insurance policy."],
    ["an insurance field rule", upstream400("Member Id Number is missing."), "Couldn't delete insurance policy."],
    ["a 5xx that says retryable: false", json({ errorCode: "UPSTREAM_ERROR", source: "proxy", retryable: false }, 502), "Couldn't delete insurance policy. Check your connection."],
  ])("%s: the message without Retry (no error toast), the card unchanged", async (_name, answer, text) => {
    const { server } = await renderSection()
    await openDelete(DENTAL_NAME)
    server.setDelete(answer)
    await confirm()
    await closed()
    expect(toastPartial).toHaveBeenCalledWith(text)
    expect(toastError).not.toHaveBeenCalled()
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(server.log).toEqual(["DELETE 56"])
    expect(cardOf("Dental Insurance").getAttribute("data-deleted")).toBeNull()
  })

  it("keeps one failure toast per policy: a new attempt dismisses the earlier one, and so does the removal", async () => {
    const { server } = await renderSection()
    server.setDelete(json({ message: "boom", code: 500 }, 500))
    await openDelete(DENTAL_NAME)
    await confirm()
    await closed()
    const first = vi.mocked(toastError).mock.results[0]?.value as { dismiss: () => void }
    expect(first.dismiss).not.toHaveBeenCalled()
    // A second confirm (not the toast's Retry): the stale toast goes as the new attempt starts.
    await openDelete(DENTAL_NAME)
    await confirm()
    await closed()
    expect(first.dismiss).toHaveBeenCalledTimes(1)
    expect(toastError).toHaveBeenCalledTimes(2)
    const second = vi.mocked(toastError).mock.results[1]?.value as { dismiss: () => void }
    server.setDelete(EMPTY_200)
    server.setList(page(without([MEDICAL, DENTAL, VISION], 56)))
    await openDelete(DENTAL_NAME)
    await confirm()
    await closed()
    expect(second.dismiss).toHaveBeenCalled()
    expect(toastSuccess).toHaveBeenCalledWith("Insurance policy deleted.")
  })

  it("while a Retry of a policy is in flight, its kebab's Delete is unavailable (Deleting…) and opens nothing", async () => {
    const { server } = await renderSection()
    server.setDelete(() => HttpResponse.error())
    await openDelete(DENTAL_NAME)
    await confirm()
    await closed()
    const hold = held()
    server.setDelete(hold.answer)
    server.setList(page(without([MEDICAL, DENTAL, VISION], 56)))
    const retry = lastRetry()
    act(() => retry())
    await waitFor(() => expect(server.log).toEqual(["DELETE 56", "DELETE 56"]))
    await openMenu(DENTAL_NAME)
    const item = screen.getByRole("menuitem", { name: /^Delete/ })
    expect(item.getAttribute("aria-disabled")).toBe("true")
    expect(item.textContent).toContain("Deleting…")
    await click(item)
    expect(screen.queryByRole("alertdialog")).toBeNull()
    await act(async () => hold.release())
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Insurance policy deleted."))
    expect(server.log).toEqual(["DELETE 56", "DELETE 56", "list"])
  })

  it("Retry focuses by the order when the delete failed, even after a revalidation changed the list", async () => {
    const { server, revalidate } = await renderSection()
    server.setDelete(() => HttpResponse.error())
    await openDelete(DENTAL_NAME)
    await confirm()
    await closed()
    // Another read meanwhile shows Dental Deleted (its kebab goes, so focus is on the body).
    server.setList(page([MEDICAL, deleted(DENTAL), VISION]))
    await revalidate()
    await waitFor(() => expect(within(section()).queryByRole("button", { name: `More actions for ${DENTAL_NAME}` })).toBeNull())
    server.setDelete(upstream400("Insurance with Id: 56 is already deleted."))
    await act(async () => lastRetry()())
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("This policy was already removed."))
    await waitFor(() => expect(document.activeElement).toBe(kebabOf(VISION_NAME)))
  })

  it("Retry leaves focus where the user moved it", async () => {
    const { server } = await renderSection()
    server.setDelete(() => HttpResponse.error())
    await openDelete(DENTAL_NAME)
    await confirm()
    await closed()
    const elsewhere = kebabOf(MEDICAL_NAME)
    elsewhere.focus()
    server.setDelete(EMPTY_200)
    server.setList(page(without([MEDICAL, DENTAL, VISION], 56)))
    await act(async () => lastRetry()())
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Insurance policy deleted."))
    await waitFor(() => expect(within(section()).queryByRole("article", { name: "Dental Insurance" })).toBeNull())
    expect(document.activeElement).toBe(elsewhere)
  })

  it("Retry closes an editor that holds the removed policy", async () => {
    const { server } = await renderSection()
    server.setDelete(() => HttpResponse.error())
    await openDelete(DENTAL_NAME)
    await confirm()
    await closed()
    await openMenu(DENTAL_NAME)
    await click(screen.getByRole("menuitem", { name: "Edit" }))
    await screen.findByRole("dialog", { name: "Edit insurance" })
    server.setDelete(EMPTY_200)
    server.setList(page(without([MEDICAL, DENTAL, VISION], 56)))
    await act(async () => lastRetry()())
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit insurance" })).toBeNull())
    expect(toastSuccess).toHaveBeenCalledWith("Insurance policy deleted.")
  })
})

describe("Delete a policy: accessibility", () => {
  it.each(["light", "dark"] as const)("has no axe violations in %s mode with the confirm open, idle and busy", async (theme) => {
    if (theme === "dark") document.documentElement.classList.add("dark")
    const { server } = await renderSection()
    await openDelete(DENTAL_NAME)
    expect(await axeViolations()).toEqual([])
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.setDelete(async () => {
      await gate
      return new HttpResponse(null, { status: 200 })
    })
    await confirm()
    await waitFor(() => expect(confirmDialog().getAttribute("aria-busy")).toBe("true"))
    expect(await axeViolations()).toEqual([])
    await act(async () => release())
    await closed()
  })
})
