import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import axe from "axe-core"
import { useState, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createSessionEvents } from "@/lib/api"
import { FixtureParticipant, type FixtureParticipantProps } from "./__fixtures__/fixture-participant"
import { confirmUnload, requestLeave, resetLeaveState } from "./leave"
import { LeaveGuard } from "./leave-guard"
import type { SaveResult, SectionId } from "./nav-types"
import { SectionRegistryProvider, useRegisterSection } from "./section-registry"
import { setTelemetrySink } from "@/lib/shared/telemetry"
import { toastPartial } from "./toasts"

vi.mock("./toasts", async (importOriginal) => ({ ...(await importOriginal<typeof import("./toasts")>()), toastPartial: vi.fn() }))

const TITLE = "You have unsaved changes"

/** A trigger that asks to leave and shows the answer. */
function LeaveButton() {
  const [answer, setAnswer] = useState("")
  return (
    <>
      <button type="button" onClick={() => void requestLeave().then((ok) => setAnswer(String(ok)))}>
        Leave
      </button>
      <span data-testid="answer">{answer}</span>
    </>
  )
}

function Page({ children, order }: { children: ReactNode; order?: readonly SectionId[] }) {
  return (
    <SectionRegistryProvider>
      {children}
      <LeaveButton />
      <LeaveGuard order={order} />
    </SectionRegistryProvider>
  )
}

const phone = (props: Partial<FixtureParticipantProps> = {}) => <FixtureParticipant id="phone" label="Phone" displayOrder={2} {...props} />
const email = (props: Partial<FixtureParticipantProps> = {}) => <FixtureParticipant id="email" label="Email" displayOrder={3} {...props} />
const insurance = (props: Partial<FixtureParticipantProps> = {}) => (
  <FixtureParticipant id="insurance" label="Insurance" displayOrder={6} canSave={false} {...props} />
)

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const answer = () => screen.getByTestId("answer").textContent
const nextTask = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))

async function leave(): Promise<void> {
  const trigger = screen.getByRole("button", { name: "Leave" })
  trigger.focus()
  await act(async () => fireEvent.click(trigger))
}

beforeEach(() => resetLeaveState())
afterEach(() => document.documentElement.classList.remove("dark"))

describe("LeaveGuard", () => {
  it("lets every leave through with no dialog while nothing is dirty", async () => {
    render(<Page>{phone()}</Page>)
    await leave()
    await waitFor(() => expect(answer()).toBe("true"))
    expect(screen.queryByRole("alertdialog")).toBeNull()
  })

  it("asks when a participant is dirty: Keep editing (initial focus) / Discard / Save, Keep editing cancels", async () => {
    render(<Page>{phone()}</Page>)
    type("Phone", "1")
    await leave()
    const dialog = screen.getByRole("alertdialog", { name: TITLE })
    const buttons = screen.getAllByRole("button").filter((b) => dialog.contains(b))
    expect(buttons.map((b) => b.textContent)).toEqual(["Keep editing", "Discard", "Save"])
    expect(document.activeElement).toBe(buttons[0])
    await act(async () => fireEvent.click(buttons[0]))
    expect(answer()).toBe("false")
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect((screen.getByLabelText("Phone") as HTMLInputElement).value).toBe("1")
  })

  it("Escape is Keep editing, and focus returns to the trigger", async () => {
    render(<Page>{phone()}</Page>)
    type("Phone", "1")
    await leave()
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" })
    await nextTask()
    expect(answer()).toBe("false")
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Leave" }))
  })

  it("Discard discards every dirty participant, then proceeds", async () => {
    render(
      <Page>
        {phone()}
        {email()}
        {insurance()}
      </Page>,
    )
    type("Phone", "1")
    type("Insurance", "2")
    await leave()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Discard" })))
    expect(answer()).toBe("true")
    expect((screen.getByLabelText("Phone") as HTMLInputElement).value).toBe("")
    expect((screen.getByLabelText("Insurance") as HTMLInputElement).value).toBe("")
  })

  it("Save validates everything first, then saves in displayOrder and proceeds when all are ok", async () => {
    const order: string[] = []
    render(
      <Page>
        {email({ onSave: () => order.push("email") })}
        {phone({ onSave: () => order.push("phone") })}
      </Page>,
    )
    type("Email", "a@b.co")
    type("Phone", "1")
    await leave()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })))
    await waitFor(() => expect(answer()).toBe("true"))
    expect(order).toEqual(["phone", "email"])
    expect(screen.queryByRole("alertdialog")).toBeNull()
  })

  it("Save runs the Save-all runner: Save-all Sections first, then guard-only participants", async () => {
    const order: string[] = []
    render(
      <Page>
        <FixtureParticipant id="insurance" label="Insurance" displayOrder={0} saveAll={false} onSave={() => order.push("insurance")} />
        {phone({ onSave: () => order.push("phone") })}
      </Page>,
    )
    type("Insurance", "x")
    type("Phone", "1")
    await leave()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })))
    await waitFor(() => expect(answer()).toBe("true"))
    expect(order).toEqual(["phone", "insurance"])
  })

  it("Save follows the page's save order when given, and fires no save_all telemetry", async () => {
    const order: string[] = []
    const events: string[] = []
    const restore = setTelemetrySink((event) => void events.push(event))
    render(
      <Page order={["email", "phone"]}>
        {phone({ onSave: () => order.push("phone") })}
        {email({ onSave: () => order.push("email") })}
      </Page>,
    )
    type("Phone", "1")
    type("Email", "a@b.co")
    await leave()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })))
    await waitFor(() => expect(answer()).toBe("true"))
    restore()
    expect(order).toEqual(["email", "phone"])
    expect(events).toEqual([])
  })

  it("a failed Save stays, shows the partial toast and focuses the first failed Section's heading", async () => {
    vi.mocked(toastPartial).mockClear()
    render(
      <Page>
        <h2 id="email-heading" tabIndex={-1}>
          Email
        </h2>
        {phone()}
        {email({ saveBehavior: "fail" })}
      </Page>,
    )
    type("Phone", "1")
    type("Email", "a@b.co")
    await leave()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })))
    await waitFor(() => expect(answer()).toBe("false"))
    await nextTask()
    expect(toastPartial).toHaveBeenCalledWith("1 saved, 1 failed")
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Email" }))
  })

  it("Save with an invalid guard-only participant sends nothing", async () => {
    const onSave = vi.fn()
    render(
      <Page>
        <FixtureParticipant id="insurance" label="Insurance" displayOrder={6} saveAll={false} onSave={onSave} />
        {phone({ onSave })}
      </Page>,
    )
    type("Insurance", "invalid")
    type("Phone", "1")
    await leave()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })))
    await nextTask()
    expect(answer()).toBe("false")
    expect(onSave).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(screen.getByLabelText("Insurance"))
  })

  it("Save with an invalid field sends nothing, closes, cancels and focuses the first invalid field", async () => {
    const onSave = vi.fn()
    render(
      <Page>
        {phone({ onSave })}
        {email({ onSave })}
      </Page>,
    )
    type("Phone", "1")
    type("Email", "invalid")
    await leave()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })))
    await nextTask()
    expect(answer()).toBe("false")
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(document.activeElement).toBe(screen.getByLabelText("Email"))
  })

  it.each(["fail", "throw"] as const)("stays on the page when a save %ss, after trying every Section", async (saveBehavior) => {
    const onSave = vi.fn()
    render(
      <Page>
        {phone({ saveBehavior })}
        {email({ onSave })}
      </Page>,
    )
    type("Phone", "1")
    type("Email", "a@b.co")
    await leave()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })))
    await waitFor(() => expect(answer()).toBe("false"))
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it("hides Save when a dirty participant can't save and says so", async () => {
    render(
      <Page>
        {phone()}
        {insurance()}
      </Page>,
    )
    type("Phone", "1")
    type("Insurance", "2")
    await leave()
    const dialog = screen.getByRole("alertdialog")
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull()
    expect(dialog.textContent).toContain("These changes can't be saved from here.")
  })

  it("refuses a second leave while the dialog is open", async () => {
    render(<Page>{phone()}</Page>)
    type("Phone", "1")
    await leave()
    expect(await requestLeave()).toBe(false)
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1)
  })

  it("attaches beforeunload only while something is dirty, and stays quiet after a confirmed exit", () => {
    const add = vi.spyOn(window, "addEventListener")
    render(<Page>{phone()}</Page>)
    const unload = () => {
      const event = new Event("beforeunload", { cancelable: true })
      window.dispatchEvent(event)
      return event.defaultPrevented
    }
    expect(unload()).toBe(false)
    expect(add.mock.calls.some(([name]) => name === "beforeunload")).toBe(false)
    type("Phone", "1")
    expect(unload()).toBe(true)
    type("Phone", "")
    expect(unload()).toBe(false)
    type("Phone", "1")
    confirmUnload()
    expect(unload()).toBe(false)
  })

  it("a throwing validate counts as invalid: nothing is saved and the dialog recovers", async () => {
    const save = vi.fn(async (): Promise<SaveResult> => ({ ok: true }))
    function Throwing() {
      useRegisterSection({
        id: "email",
        label: "Email",
        displayOrder: 1,
        isDirty: true,
        validate: () => {
          throw new Error("validate blew up")
        },
        save,
        discard: () => undefined,
      })
      return null
    }
    render(
      <Page>
        <Throwing />
      </Page>,
    )
    await leave()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })))
    await waitFor(() => expect(answer()).toBe("false"))
    expect(save).not.toHaveBeenCalled()
    expect(screen.queryByRole("alertdialog")).toBeNull()
    // Not stuck: the next leave opens the dialog again and Keep editing works.
    await leave()
    expect(screen.getByRole("alertdialog")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Keep editing" }).getAttribute("aria-disabled")).toBeNull()
  })

  it("settles a pending leave as false when it unmounts", async () => {
    const view = render(<Page>{phone()}</Page>)
    type("Phone", "1")
    const pending = requestLeave()
    await act(async () => undefined)
    view.unmount()
    expect(await pending).toBe(false)
  })

  it("on session-expired (e.g. during a Save) settles the leave as false and closes", async () => {
    const events = createSessionEvents()
    let finishSave: (result: SaveResult) => void = () => undefined
    function Slow() {
      useRegisterSection({
        id: "phone",
        label: "Phone",
        displayOrder: 1,
        isDirty: true,
        save: () => new Promise<SaveResult>((resolve) => (finishSave = resolve)),
        discard: () => undefined,
      })
      return null
    }
    render(
      <SectionRegistryProvider>
        <Slow />
        <LeaveButton />
        <LeaveGuard events={events} />
      </SectionRegistryProvider>,
    )
    await leave()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })))
    expect(screen.getByRole("alertdialog").getAttribute("aria-busy")).toBe("true")
    act(() => events.publish("session-expired"))
    await waitFor(() => expect(answer()).toBe("false"))
    expect(screen.queryByRole("alertdialog")).toBeNull()
    await act(async () => finishSave({ ok: true }))
    expect(answer()).toBe("false")
  })

  it.each(["light", "dark"])("has no axe violations in %s mode", async (theme) => {
    if (theme === "dark") document.documentElement.classList.add("dark")
    render(<Page>{phone()}</Page>)
    type("Phone", "1")
    await leave()
    const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } })
    expect(results.violations).toEqual([])
  })
})

/** A guard-only participant's own close (Story 5.2 Sheet): `requestLeave({ scope })`. */
function CloseButton({ scope }: { scope: SectionId }) {
  const [answer, setAnswer] = useState("")
  return (
    <>
      <button type="button" onClick={() => void requestLeave({ scope }).then((ok) => setAnswer(String(ok)))}>
        Close editor
      </button>
      <span data-testid="close-answer">{answer}</span>
    </>
  )
}

const closeAnswer = () => screen.getByTestId("close-answer").textContent

async function closeEditor(): Promise<void> {
  const trigger = screen.getByRole("button", { name: "Close editor" })
  trigger.focus()
  await act(async () => fireEvent.click(trigger))
}

const editor = (props: Partial<FixtureParticipantProps> = {}) => (
  <FixtureParticipant id="insurance" label="Insurance" displayOrder={6} saveAll={false} {...props} />
)

describe("LeaveGuard: scoped requestLeave({ scope }) (Stories 1.13 / 5.2, spec F7-2)", () => {
  it("resolves true with no dialog when the scope is clean, even while another Section is dirty", async () => {
    render(
      <Page>
        {phone()}
        {editor()}
        <CloseButton scope="insurance" />
      </Page>,
    )
    type("Phone", "1")
    await closeEditor()
    await waitFor(() => expect(closeAnswer()).toBe("true"))
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect((screen.getByLabelText("Phone") as HTMLInputElement).value).toBe("1")
  })

  it("warns outside production when the scope isn't registered (and lets it through)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    render(
      <Page>
        {phone()}
        <CloseButton scope="insurance" />
      </Page>,
    )
    type("Phone", "1")
    await closeEditor()
    await waitFor(() => expect(closeAnswer()).toBe("true"))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('requestLeave({ scope: "insurance" })'))
    warn.mockRestore()
  })

  it("does not warn for a registered scope", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    render(
      <Page>
        {editor()}
        <CloseButton scope="insurance" />
      </Page>,
    )
    await closeEditor()
    await waitFor(() => expect(closeAnswer()).toBe("true"))
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it("resolves true with no guard set", async () => {
    await expect(requestLeave({ scope: "insurance" })).resolves.toBe(true)
  })

  it("asks about the scope only: Discard discards only it", async () => {
    render(
      <Page>
        {phone()}
        {editor()}
        <CloseButton scope="insurance" />
      </Page>,
    )
    type("Phone", "1")
    type("Insurance", "x")
    await closeEditor()
    expect(screen.getByRole("alertdialog", { name: TITLE })).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Discard" })))
    expect(closeAnswer()).toBe("true")
    expect((screen.getByLabelText("Insurance") as HTMLInputElement).value).toBe("")
    expect((screen.getByLabelText("Phone") as HTMLInputElement).value).toBe("1")
  })

  it("Keep editing keeps the participant open", async () => {
    render(
      <Page>
        {editor()}
        <CloseButton scope="insurance" />
      </Page>,
    )
    type("Insurance", "x")
    await closeEditor()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Keep editing" })))
    expect(closeAnswer()).toBe("false")
    expect((screen.getByLabelText("Insurance") as HTMLInputElement).value).toBe("x")
  })

  it("Save validates and saves only the scope, then proceeds", async () => {
    const saved: string[] = []
    render(
      <Page>
        {phone({ onSave: () => saved.push("phone") })}
        {editor({ onSave: () => saved.push("insurance") })}
        <CloseButton scope="insurance" />
      </Page>,
    )
    type("Phone", "invalid")
    type("Insurance", "x")
    await closeEditor()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })))
    await waitFor(() => expect(closeAnswer()).toBe("true"))
    expect(saved).toEqual(["insurance"])
  })

  it("a failed scoped Save stays without a toast or focus move", async () => {
    vi.mocked(toastPartial).mockClear()
    render(
      <Page>
        {editor({ saveBehavior: "fail" })}
        <CloseButton scope="insurance" />
      </Page>,
    )
    type("Insurance", "x")
    await closeEditor()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })))
    await waitFor(() => expect(closeAnswer()).toBe("false"))
    await nextTask()
    expect(toastPartial).not.toHaveBeenCalled()
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close editor" }))
  })

  it("hides Save when the scoped participant can't save", async () => {
    render(
      <Page>
        {phone()}
        {editor({ canSave: false })}
        <CloseButton scope="insurance" />
      </Page>,
    )
    type("Insurance", "x")
    await closeEditor()
    const dialog = screen.getByRole("alertdialog", { name: TITLE })
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull()
    expect(dialog).toBeTruthy()
  })

  it("an unscoped leave still asks about every dirty participant", async () => {
    render(
      <Page>
        {phone()}
        {editor()}
        <CloseButton scope="insurance" />
      </Page>,
    )
    type("Phone", "1")
    type("Insurance", "x")
    await leave()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Discard" })))
    expect(answer()).toBe("true")
    expect((screen.getByLabelText("Insurance") as HTMLInputElement).value).toBe("")
    expect((screen.getByLabelText("Phone") as HTMLInputElement).value).toBe("")
  })
})
