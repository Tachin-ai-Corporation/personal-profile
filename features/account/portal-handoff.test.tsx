import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  handoffHref,
  LeaveGuard,
  navigate,
  onBeforeExit,
  useRegisterSection,
  type HandoffTarget,
  type NavigateDeps,
  type SaveResult,
} from "@/features/shell"
import { resetLeaveState } from "@/features/shell/leave"
import { COMMON_MESSAGES, LEAVE_GUARD_MESSAGES } from "@/lib/shared/messages"
import { axeViolations } from "@/test/axe"
import { renderInPage, TEST_PORTAL_URL } from "@/test/providers"

const INITIAL = { firstName: "Alex", lastName: "Rivera" }
const EDITED = { firstName: "Sam", lastName: "Chen" }
type AccountValues = typeof INITIAL

/** Story 7.3 consumer contract; no production Account action exists yet. */
function AccountConsumer({ target, deps, persist }: {
  readonly target: HandoffTarget
  readonly deps: NavigateDeps
  readonly persist: (values: AccountValues) => Promise<SaveResult>
}) {
  const [baseline, setBaseline] = useState(INITIAL)
  const [values, setValues] = useState(INITIAL)
  const [navigation, setNavigation] = useState("")

  useRegisterSection({
    id: "account",
    label: "Account settings",
    displayOrder: 0,
    isDirty: values.firstName !== baseline.firstName || values.lastName !== baseline.lastName,
    save: async () => {
      const result = await persist(values)
      if (result.ok) setBaseline(values)
      return result
    },
    discard: () => setValues(baseline),
  })

  return (
    <main>
      <h1>Account</h1>
      <label>
        First name
        <input value={values.firstName} onChange={(event) => setValues({ ...values, firstName: event.target.value })} />
      </label>
      <label>
        Last name
        <input value={values.lastName} onChange={(event) => setValues({ ...values, lastName: event.target.value })} />
      </label>
      <button type="button" onClick={() => {
        void navigate({ external: "handoff", href: handoffHref(target) }, deps)
          .then((proceeded) => setNavigation(proceeded ? "Handing off" : "Still editing"))
      }}>
        Go to portal
      </button>
      <p role="status">{navigation}</p>
    </main>
  )
}

const TARGETS: { name: string; target: HandoffTarget; href: string }[] = [
  { name: "tenant", target: { to: "tenant", tenantId: "1234567890123456789" }, href: "/handoff/portal?to=tenant&tenantId=1234567890123456789" },
  { name: "create organization", target: { to: "create-org" }, href: "/handoff/portal?to=create-org" },
]

let unsubscribeExit: () => void = () => undefined

beforeEach(() => resetLeaveState())
afterEach(() => {
  unsubscribeExit()
  resetLeaveState()
})

function setup(target: HandoffTarget, persist = vi.fn<(values: AccountValues) => Promise<SaveResult>>(async () => ({ ok: true }))) {
  // Only browser navigation and persistence are substituted; the guard and helpers are real.
  const assign = vi.fn()
  const push = vi.fn()
  const logout = vi.fn(async () => undefined)
  const beforeExit = vi.fn()
  const open = vi.spyOn(window, "open")
  unsubscribeExit = onBeforeExit(beforeExit)
  const deps: NavigateDeps = {
    router: { push },
    portalUrl: TEST_PORTAL_URL,
    currentPage: "account",
    location: { pathname: "/account", search: "", assign },
    logout,
  }
  renderInPage(<><AccountConsumer target={target} deps={deps} persist={persist} /><LeaveGuard /></>, { page: "account", url: "/account" })
  return { assign, push, logout, beforeExit, open, persist }
}

async function attemptDirtyHandoff() {
  fireEvent.change(screen.getByRole("textbox", { name: "First name" }), { target: { value: EDITED.firstName } })
  fireEvent.change(screen.getByRole("textbox", { name: "Last name" }), { target: { value: EDITED.lastName } })
  const trigger = screen.getByRole("button", { name: "Go to portal" })
  trigger.focus()
  fireEvent.click(trigger)
  return screen.findByRole("alertdialog", { name: LEAVE_GUARD_MESSAGES.title })
}

function expectFields(values: AccountValues) {
  expect((screen.getByRole("textbox", { name: "First name" }) as HTMLInputElement).value).toBe(values.firstName)
  expect((screen.getByRole("textbox", { name: "Last name" }) as HTMLInputElement).value).toBe(values.lastName)
}

function expectNoPortalExit(boundaries: ReturnType<typeof setup>) {
  expect(boundaries.logout).not.toHaveBeenCalled()
  expect(boundaries.beforeExit).not.toHaveBeenCalled()
  expect(boundaries.open).not.toHaveBeenCalled()
  expect(boundaries.push).not.toHaveBeenCalled()
}

describe.each(TARGETS)("Story 7.3 Account handoff: $name", ({ target, href }) => {
  it("Keep editing cancels, preserves both fields and guards a later attempt again", async () => {
    const boundaries = setup(target)
    const dialog = await attemptDirtyHandoff()
    expect(boundaries.assign).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: LEAVE_GUARD_MESSAGES.keepEditing }))

    fireEvent.click(within(dialog).getByRole("button", { name: LEAVE_GUARD_MESSAGES.keepEditing }))

    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Still editing"))
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expectFields(EDITED)
    expect(boundaries.assign).not.toHaveBeenCalled()
    expect(boundaries.persist).not.toHaveBeenCalled()
    expectNoPortalExit(boundaries)
    fireEvent.click(screen.getByRole("button", { name: "Go to portal" }))
    expect(await screen.findByRole("alertdialog", { name: LEAVE_GUARD_MESSAGES.title })).toBeTruthy()
    expect(boundaries.assign).not.toHaveBeenCalled()
  })

  it("Discard resets fields before handing off in the same tab without portal exit effects", async () => {
    const boundaries = setup(target)
    const dialog = await attemptDirtyHandoff()
    expect(boundaries.assign).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole("button", { name: COMMON_MESSAGES.discard }))

    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Handing off"))
    expect(boundaries.assign).toHaveBeenCalledExactlyOnceWith(href)
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expectFields(INITIAL)
    expect(boundaries.persist).not.toHaveBeenCalled()
    expectNoPortalExit(boundaries)
  })

  it("Save waits for success before handing off in the same tab without portal exit effects", async () => {
    let finishSave!: (result: SaveResult) => void
    const pendingSave = new Promise<SaveResult>((resolve) => { finishSave = resolve })
    const persist = vi.fn<(values: AccountValues) => Promise<SaveResult>>(() => pendingSave)
    const boundaries = setup(target, persist)
    const dialog = await attemptDirtyHandoff()
    expect(boundaries.assign).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole("button", { name: COMMON_MESSAGES.save }))

    await waitFor(() => expect(persist).toHaveBeenCalledExactlyOnceWith(EDITED))
    expect(screen.getByRole("alertdialog").getAttribute("aria-busy")).toBe("true")
    expect(boundaries.assign).not.toHaveBeenCalled()
    expectNoPortalExit(boundaries)
    await act(async () => finishSave({ ok: true }))
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Handing off"))
    expect(boundaries.assign).toHaveBeenCalledExactlyOnceWith(href)
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expectFields(EDITED)
    expectNoPortalExit(boundaries)
  })

  it("a failed Save preserves edits and blocks handoff until an explicit Save retry succeeds", async () => {
    let finishRetry!: (result: SaveResult) => void
    const retry = new Promise<SaveResult>((resolve) => { finishRetry = resolve })
    const persist = vi.fn<(values: AccountValues) => Promise<SaveResult>>()
      .mockResolvedValueOnce({ ok: false, error: { code: "UNEXPECTED" } })
      .mockImplementationOnce(() => retry)
    const boundaries = setup(target, persist)
    const dialog = await attemptDirtyHandoff()

    fireEvent.click(within(dialog).getByRole("button", { name: COMMON_MESSAGES.save }))

    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Still editing"))
    expect(persist).toHaveBeenCalledExactlyOnceWith(EDITED)
    // The real guard closes after failure; the Account consumer stays dirty on the page.
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expectFields(EDITED)
    expect(boundaries.assign).not.toHaveBeenCalled()
    expectNoPortalExit(boundaries)

    fireEvent.click(screen.getByRole("button", { name: "Go to portal" }))
    const retryDialog = await screen.findByRole("alertdialog", { name: LEAVE_GUARD_MESSAGES.title })
    expect(persist).toHaveBeenCalledTimes(1)
    expect(boundaries.assign).not.toHaveBeenCalled()
    fireEvent.click(within(retryDialog).getByRole("button", { name: COMMON_MESSAGES.save }))

    await waitFor(() => expect(persist).toHaveBeenCalledTimes(2))
    expect(persist).toHaveBeenNthCalledWith(2, EDITED)
    expect(screen.getByRole("alertdialog").getAttribute("aria-busy")).toBe("true")
    expect(boundaries.assign).not.toHaveBeenCalled()
    expectNoPortalExit(boundaries)
    await act(async () => finishRetry({ ok: true }))

    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Handing off"))
    expect(boundaries.assign).toHaveBeenCalledExactlyOnceWith(href)
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expectFields(EDITED)
    expectNoPortalExit(boundaries)
  })
})

it("the Account handoff leave dialog has no WCAG 2.1 A/AA axe violations", async () => {
  setup({ to: "create-org" })
  await attemptDirtyHandoff()
  expect(await axeViolations()).toEqual([])
})
