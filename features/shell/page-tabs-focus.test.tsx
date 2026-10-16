import { act, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { stubLayoutApis } from "@/test/dom-stubs"
import { renderInPage } from "@/test/providers"
import { AccountTabs } from "./account-tabs"
import { ProfileTabs } from "./profile-tabs"

vi.mock("next/navigation", async () => (await import("@/test/next-navigation")).nextNavigationMock)

beforeEach(() => stubLayoutApis())

describe("PageTabs keyboard focus in a narrow strip", () => {
  it.each(["profile", "account"] as const)("%s reveals focused tabs on both edges without activating or navigating", async (page) => {
    const user = userEvent.setup()
    const url = page === "account" ? "/account?tab=personal" : "/?tab=contacts"
    renderInPage(page === "account" ? <AccountTabs /> : <ProfileTabs />, { page, url })
    const list = screen.getByRole("tablist")
    const [first, second, third] = screen.getAllByRole("tab")
    // jsdom has no layout. These read-only dimensions model an overflowing
    // 360 px strip; scrollLeft is the observable behavior under test.
    Object.defineProperty(list, "clientWidth", { configurable: true, value: 360 })
    for (const [tab, left, width] of [[first, 16, 180], [second, 196, 250], [third, 446, 200]] as const) {
      Object.defineProperty(tab, "offsetLeft", { configurable: true, value: left })
      Object.defineProperty(tab, "offsetWidth", { configurable: true, value: width })
    }
    await act(async () => first.focus())
    await user.keyboard("{ArrowRight}")
    await waitFor(() => expect(document.activeElement).toBe(second))
    expect(list.scrollLeft).toBe(86)

    await user.keyboard("{End}")
    await waitFor(() => expect(document.activeElement).toBe(third))
    expect(list.scrollLeft).toBe(286)

    await user.keyboard("{Home}")
    await waitFor(() => expect(document.activeElement).toBe(first))
    expect(list.scrollLeft).toBe(16)

    await user.keyboard("{ArrowLeft}")
    await waitFor(() => expect(document.activeElement).toBe(third))
    expect(list.scrollLeft).toBe(286)
    expect(first.getAttribute("aria-selected")).toBe("true")
    expect(second.getAttribute("aria-selected")).toBe("false")
    expect(third.getAttribute("aria-selected")).toBe("false")
    expect(`${window.location.pathname}${window.location.search}`).toBe(url)
    expect(document.getElementById(first.getAttribute("aria-controls") ?? "")?.hidden).toBe(false)
  })
})
