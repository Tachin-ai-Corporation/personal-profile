import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { useState } from "react"
import { z } from "zod"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { CONTACT_MESSAGES } from "@/lib/shared/messages"
import { setTelemetrySink } from "@/lib/shared/telemetry"
import { requestLeave, resetLeaveState } from "./leave"
import { LeaveGuard } from "./leave-guard"
import type { SaveResult } from "./nav-types"
import { SectionFooter } from "./section-footer"
import { SectionHeader } from "./section-header"
import { SectionRegistryProvider } from "./section-registry"
import { toastPartial } from "./toasts"
import { useSectionForm } from "./use-section-form"

vi.mock("./toasts", () => ({ toastSuccess: vi.fn(), toastError: vi.fn(() => ({ id: "t", dismiss: vi.fn() })), toastPartial: vi.fn() }))

/**
 * F6-1 review M1 / H2: `confirmBeforeSave` (Story 2.4 "Remove your
 * signature?") on the own Save and the registered save, and a declined
 * confirm (`CANCELLED`) keeping the leave guard open quietly.
 */

const schema = z.object({ value: z.string().min(1, { message: CONTACT_MESSAGES.phoneTenDigits }) })
type Values = z.infer<typeof schema>

interface Pending {
  resolve: (ok: boolean) => void
  reject: (error: Error) => void
}

let pending: Pending[] = []
let events: string[] = []

beforeEach(() => {
  resetLeaveState()
  pending = []
  events = []
  setTelemetrySink((event) => void events.push(event))
})

function confirm(): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => pending.push({ resolve, reject }))
}

function SignatureSection({ save }: { readonly save: (values: Values) => Promise<SaveResult> }) {
  const section = useSectionForm<Values>({
    id: "personal",
    label: "Personal information",
    displayOrder: 1,
    schema,
    baseline: { value: "saved" },
    save,
    confirmBeforeSave: confirm,
  })
  return (
    <section aria-labelledby="personal-heading">
      <SectionHeader id="personal" title="Personal information" editing={section.isEditing} />
      {section.isEditing ? (
        <>
          <input aria-label="Value" {...section.field("value")} />
          <SectionFooter {...section.footerProps} />
        </>
      ) : (
        <button type="button" {...section.editButtonProps}>
          Edit
        </button>
      )}
    </section>
  )
}

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

function setup() {
  const save = vi.fn(async () => ({ ok: true }) as SaveResult)
  render(
    <SectionRegistryProvider>
      <SignatureSection save={save} />
      <LeaveButton />
      <LeaveGuard />
    </SectionRegistryProvider>,
  )
  return save
}

const button = (name: string | RegExp) => screen.getByRole("button", { name, hidden: true })
const dialogButton = (name: string) => within(screen.getByRole("alertdialog")).getByRole("button", { name })

async function editAndChange(): Promise<void> {
  await act(async () => fireEvent.click(button("Edit")))
  fireEvent.change(screen.getByLabelText("Value"), { target: { value: "new" } })
}

describe("confirmBeforeSave", () => {
  it("own Save: asked after validation, before the saving state; Cancel → nothing sent, still editing, no error", async () => {
    const save = setup()
    await editAndChange()
    await act(async () => fireEvent.click(button("Save")))
    expect(pending).toHaveLength(1)
    expect(screen.queryByRole("button", { name: "Saving…" })).toBeNull()
    expect((screen.getByLabelText("Value") as HTMLInputElement).readOnly).toBe(false)
    // A second press joins the pending confirm.
    await act(async () => fireEvent.click(button("Save")))
    expect(pending).toHaveLength(1)
    await act(async () => pending[0].resolve(false))
    expect(save).not.toHaveBeenCalled()
    expect((screen.getByLabelText("Value") as HTMLInputElement).value).toBe("new")
    expect(document.querySelector("[data-slot~='inline-banner']")).toBeNull()
    expect(events).toEqual([])
  })

  it("own Save: confirm → sent once and saved", async () => {
    const save = setup()
    await editAndChange()
    await act(async () => fireEvent.click(button("Save")))
    await act(async () => pending[0].resolve(true))
    expect(save).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy()
  })

  it("an invalid form never asks", async () => {
    setup()
    await act(async () => fireEvent.click(button("Edit")))
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "" } })
    await act(async () => fireEvent.click(button("Save")))
    expect(pending).toHaveLength(0)
  })

  it("leave guard Save: a declined confirm keeps the dialog open quietly (no toast, no leave); Discard still works", async () => {
    const save = setup()
    await editAndChange()
    await act(async () => fireEvent.click(button("Leave")))
    expect(screen.getByRole("alertdialog", { name: "You have unsaved changes" })).toBeTruthy()
    await act(async () => fireEvent.click(dialogButton("Save")))
    expect(pending).toHaveLength(1)
    await act(async () => pending[0].resolve(false))
    expect(save).not.toHaveBeenCalled()
    expect(screen.getByRole("alertdialog", { name: "You have unsaved changes" })).toBeTruthy()
    expect(dialogButton("Save").getAttribute("aria-busy")).not.toBe("true")
    expect(toastPartial).not.toHaveBeenCalled()
    expect(screen.getByTestId("answer").textContent).toBe("")
    await act(async () => fireEvent.click(dialogButton("Discard")))
    await waitFor(() => expect(screen.getByTestId("answer").textContent).toBe("true"))
  })

  it("leave guard Save: a confirmed save leaves", async () => {
    const save = setup()
    await editAndChange()
    await act(async () => fireEvent.click(button("Leave")))
    await act(async () => fireEvent.click(dialogButton("Save")))
    await act(async () => pending[0].resolve(true))
    expect(save).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByTestId("answer").textContent).toBe("true"))
  })

  it("a rejected confirm counts as declined", async () => {
    const save = setup()
    await editAndChange()
    await act(async () => fireEvent.click(button("Save")))
    await act(async () => pending[0].reject(new Error("closed")))
    expect(save).not.toHaveBeenCalled()
    expect(screen.getByLabelText("Value")).toBeTruthy()
  })
})
