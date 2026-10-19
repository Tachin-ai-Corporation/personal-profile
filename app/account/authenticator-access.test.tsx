import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AccountPersonalPanel, AccountTabs } from "@/features/shell"
import { AccountSettingsSection } from "@/features/account"
import { AuthenticatorCard } from "@/features/mfa/authenticator-card"
import { useMfaAccess } from "@/features/mfa/mfa-access"
import { mapApiError } from "@/lib/api"
import { installDomStubs } from "@/test/dom-stubs"
import { renderInPage } from "@/test/providers"

vi.mock("next/navigation", async () => (await import("@/test/next-navigation")).nextNavigationMock)
let dom: ReturnType<typeof installDomStubs>
beforeEach(() => { dom = installDomStubs() })
afterEach(() => dom.uninstall())
const MYSELF = "/api/1h/v2/user/myself"
const card = () => screen.getByRole("region", { name: "Authenticator app" })
const tiles = () => within(card()).getAllByRole("button", { name: /^Link / })

describe("MFA access controller seam", () => {
  it.each([
    { path: "/api/1h/v2/mfa/enable/totp", proxy: false, denied: true },
    { path: "/api/1h/v2/mfa/disable/totp", proxy: false, denied: true },
    { path: "/api/pp/mfa/validate", proxy: false, denied: true },
    { path: "/api/pp/mfa/validate", proxy: true, denied: false },
    { path: MYSELF, proxy: false, denied: false },
    { path: "/api/1h/v2/user/npi", proxy: false, denied: false },
  ])("scopes the actual mapped failure: $path proxy=$proxy", async ({ path, proxy, denied }) => {
    function Harness() {
      const { mfaForbidden, handleFailure } = useMfaAccess()
      return <><button onClick={() => handleFailure(path, mapApiError("authenticator", { success: false, statusCode: 403, ...(proxy ? { errorCode: "NOT_ALLOWED", source: "proxy" } as const : {}) }))}>Supply failure</button>
        <AccountTabs personal={<AccountPersonalPanel account={<AccountSettingsSection />} authenticator={<AuthenticatorCard linked state={mfaForbidden ? { error: { kind: "forbidden" } } : "ready"} onRetry={vi.fn()} />} />} provider={<p>Provider tab remains available</p>} /></>
    }
    renderInPage(<Harness />, { page: "account", url: "/account?tab=personal" })
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: "Supply failure" }))
    const noAccess = within(card()).queryByText("You don't have access to this in your current account")
    expect(Boolean(noAccess)).toBe(denied)
    if (denied) {
      expect(noAccess?.closest('[data-slot="no-access"]')?.getAttribute("data-level")).toBe("section")
      expect(within(card()).queryByRole("button")).toBeNull()
      expect(within(card()).queryByText("Enabled")).toBeNull()
    } else expect(tiles()).toHaveLength(5)
    const account = screen.getByRole("region", { name: "Personal account settings" })
    await user.click(await within(account).findByRole("button", { name: "Edit" }))
    expect(within(account).getByRole("textbox", { name: "First name" })).toBeTruthy()
    expect(within(account).getByRole("button", { name: "Save" })).toBeTruthy()
    await user.click(screen.getByRole("tab", { name: "Individual Provider Registration" }))
    expect(await screen.findByText("Provider tab remains available")).toBeTruthy()
  })
})
