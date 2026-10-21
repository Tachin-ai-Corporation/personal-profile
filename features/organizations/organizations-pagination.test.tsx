import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { OrganizationsPagination } from "./organizations-pagination"

describe("organization pagination", () => {
  it("bounds large totals while retaining server last page and current neighbors", () => {
    const onPage = vi.fn()
    render(<OrganizationsPagination page={500} totalPages={9000} onPage={onPage} />)
    expect(screen.getAllByRole("button")).toHaveLength(7)
    expect(screen.getByRole("button", { name: "501" }).getAttribute("aria-current")).toBe("page")
    fireEvent.click(screen.getByRole("button", { name: "9000" }))
    expect(onPage).toHaveBeenCalledWith(8999)
    fireEvent.click(screen.getByRole("button", { name: "Previous" }))
    expect(onPage).toHaveBeenLastCalledWith(499)
  })
  it("keeps pages outside the accepted API boundary inert without changing server totals", () => {
    const onPage = vi.fn()
    render(<OrganizationsPagination page={9999} totalPages={20000} onPage={onPage} />)
    fireEvent.click(screen.getByRole("button", { name: "20000" }))
    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    expect(onPage).not.toHaveBeenCalled()
  })
})
