import { act, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LeaveGuard, type SaveResult } from "@/features/shell"
import { navigate } from "@/features/shell/navigate"
import { resetLeaveState } from "@/features/shell/leave"
import type { OrganizationPortalItem } from "@/lib/api"
import { pageUser, sessionEvents } from "@/lib/api"
import { renderInPage } from "@/test/providers"
import { stubLayoutApis } from "@/test/dom-stubs"
import { EnterPortalButton } from "./enter-portal-button"

const destination = vi.hoisted(() => ({ assign: vi.fn(), logout: vi.fn(), push: vi.fn(), calls: vi.fn() }))

// Preserve real navigation and the real leave guard; replace only the hook's browser location.
vi.mock("@/features/shell", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/shell")>()),
  useNavigate: () => (target: Parameters<typeof navigate>[0]) => {
    destination.calls(target)
    return navigate(target, {
      router: { push: destination.push },
      portalUrl: "https://portal.test",
      location: { pathname: "/account", search: "?tab=organizations", assign: destination.assign },
      logout: destination.logout,
    })
  },
}))

const organization: OrganizationPortalItem = {
  tenantId: "42", enabledInTenant: true, name: "DNN Diagnostics", shortName: "DNN",
  types: [], personContacts: [],
}

function renderAction(overrides: Partial<OrganizationPortalItem> = {}) {
  return renderInPage(<><EnterPortalButton organization={{ ...organization, ...overrides }} /><LeaveGuard /></>, { page: "account" })
}

const action = () => screen.getByRole("button", { name: "Enter portal for DNN" })

beforeEach(() => {
  stubLayoutApis()
  resetLeaveState()
  vi.clearAllMocks()
})
afterEach(() => resetLeaveState())

describe("EnterPortalButton", () => {
  it.each(["pointer", "Enter", "Space"])("uses the existing same-tab handoff with %s", async (input) => {
    const user = userEvent.setup()
    renderAction()
    expect(action().textContent).toBe("Enter portal")
    expect(action().className).toContain("h-11")
    if (input === "pointer") await user.click(action())
    else {
      action().focus()
      await user.keyboard(input === "Enter" ? "{Enter}" : " ")
    }
    await waitFor(() => expect(destination.assign).toHaveBeenCalledExactlyOnceWith("/handoff/portal?to=tenant&tenantId=42"))
    expect(destination.calls).toHaveBeenCalledExactlyOnceWith({ external: "handoff", href: "/handoff/portal?to=tenant&tenantId=42" })
    expect(destination.logout).not.toHaveBeenCalled()
    expect(destination.push).not.toHaveBeenCalled()
  })

  it.each(["1", "00042", "9999999999999999999", Number.MAX_SAFE_INTEGER])("preserves valid tenant identity %s", async (tenantId) => {
    renderAction({ tenantId: tenantId as string })
    await userEvent.click(action())
    await waitFor(() => expect(destination.assign).toHaveBeenCalledWith(`/handoff/portal?to=tenant&tenantId=${tenantId}`))
  })

  it.each([false, undefined, null, "true", 1])("requires membership strictly true (%s)", async (enabledInTenant) => {
    renderAction({ enabledInTenant: enabledInTenant as boolean })
    const user = userEvent.setup()
    await user.tab()
    expect(document.activeElement).toBe(action())
    expect(action().getAttribute("aria-disabled")).toBe("true")
    expect(action().getAttribute("disabled")).toBeNull()
    const reasonId = action().getAttribute("aria-describedby")!
    expect(document.getElementById(reasonId)?.textContent).toBe("You're disabled in this organization")
    await user.keyboard("{Enter} ")
    await user.click(action())
    expect(destination.calls).not.toHaveBeenCalled()
    expect(destination.assign).not.toHaveBeenCalled()
  })

  it.each(["", "0", "000", "-1", "1.5", " 42", "1e2", "12345678901234567890", "https://evil.example", null, undefined, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])("never passes invalid identity %s to handoffHref", async (tenantId) => {
    renderAction({ tenantId: tenantId as string })
    await userEvent.click(action())
    expect(action().getAttribute("aria-disabled")).toBe("true")
    expect(destination.calls).not.toHaveBeenCalled()
  })

  it("uses the full name when no short name is supplied", () => {
    renderAction({ shortName: null })
    expect(screen.getByRole("button", { name: "Enter portal for DNN Diagnostics" })).toBeTruthy()
  })

  it.each([
    { shortName: "  DNN  ", name: " Full name ", expected: "DNN", enabledInTenant: true },
    { shortName: "  ", name: " DNN Diagnostics ", expected: "DNN Diagnostics", enabledInTenant: true },
    { shortName: " N/A ", name: " DNN Diagnostics ", expected: "DNN Diagnostics", enabledInTenant: true },
    { shortName: "-1", name: " n/a ", expected: "Not provided", enabledInTenant: true },
    { shortName: null, name: "  ", expected: "Not provided", enabledInTenant: true },
    { shortName: undefined, name: undefined, expected: "Not provided", enabledInTenant: true },
    { shortName: " n/a ", name: "  ", expected: "Not provided", enabledInTenant: false },
  ])("matches the card display name for $shortName / $name (enabled=$enabledInTenant)", async ({ shortName, name, expected, enabledInTenant }) => {
    renderAction({ shortName, name: name as string, enabledInTenant })
    const button = screen.getByRole("button", { name: `Enter portal for ${expected}` })
    // Raw attribute equality detects whitespace that accessible-name matching normalizes.
    expect(button.getAttribute("aria-label")).toBe(`Enter portal for ${expected}`)
    await userEvent.click(button)
    expect(destination.assign).toHaveBeenCalledTimes(enabledInTenant ? 1 : 0)
    expect(button.getAttribute("aria-disabled")).toBe(enabledInTenant ? null : "true")
  })
})

describe("EnterPortalButton with the actual shell guard", () => {
  function dirtyGuard(result: SaveResult = { ok: true }) {
    const rendered = renderAction()
    const save = vi.fn(async () => result)
    const discard = vi.fn()
    act(() => {
      rendered.registry.register({ id: "account", label: "Account", displayOrder: 1, isDirty: true, save, discard })
    })
    return { save, discard }
  }

  it("Keep editing refuses the destination and preserves dirty context", async () => {
    const { save, discard } = dirtyGuard()
    await userEvent.click(action())
    await userEvent.click(screen.getByRole("button", { name: "Keep editing" }))
    expect(destination.assign).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
    expect(discard).not.toHaveBeenCalled()
    // A denied exit releases the shared latch and can be requested again.
    await userEvent.click(action())
    expect(screen.getByRole("alertdialog")).toBeTruthy()
  })

  it("Discard uses the shell participant policy before entering", async () => {
    const { save, discard } = dirtyGuard()
    await userEvent.click(action())
    await userEvent.click(screen.getByRole("button", { name: "Discard" }))
    await waitFor(() => expect(destination.assign).toHaveBeenCalledTimes(1))
    expect(discard).toHaveBeenCalledTimes(1)
    expect(save).not.toHaveBeenCalled()
    expect(destination.logout).not.toHaveBeenCalled()
  })

  it.each([true, false])("Save success=%s decides the destination through runSaveAll", async (ok) => {
    const { save, discard } = dirtyGuard(ok ? { ok: true } : { ok: false, error: { code: "GENERIC" } })
    await userEvent.click(action())
    await userEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    expect(save).toHaveBeenCalledTimes(1)
    expect(discard).not.toHaveBeenCalled()
    expect(destination.assign).toHaveBeenCalledTimes(ok ? 1 : 0)
    expect(destination.logout).not.toHaveBeenCalled()
  })

  it("session expiry while saving prevents the pending handoff", async () => {
    let finish!: (result: SaveResult) => void
    const rendered = renderAction()
    act(() => {
      rendered.registry.register({ id: "account", label: "Account", displayOrder: 1, isDirty: true,
        save: () => new Promise((resolve) => { finish = resolve }), discard: vi.fn() })
    })
    // No pinned page user: this synthetic participant still runs the real runner without API writes.
    expect(pageUser.id()).toBeUndefined()
    await userEvent.click(action())
    await userEvent.click(screen.getByRole("button", { name: "Save" }))
    await act(async () => {
      sessionEvents.publish("session-expired")
      finish({ ok: false, error: { code: "SESSION_EXPIRED" } })
    })
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    expect(destination.assign).not.toHaveBeenCalled()
    expect(destination.logout).not.toHaveBeenCalled()
  })
})
