import { describe, expect, it } from "vitest"
import { safeHref } from "./safe-href"

describe("safeHref", () => {
  it.each([
    ["https://example.com/a?b=1", "https://example.com/a?b=1"],
    [" https://example.com ", "https://example.com"],
    ["mailto:ann@example.com", "mailto:ann@example.com"],
    ["tel:+14155552125", "tel:+14155552125"],
    ["HTTPS://example.com", "HTTPS://example.com"],
    ["http://example.com", undefined],
    ["javascript:alert(1)", undefined],
    [" javascript:alert(1)", undefined],
    ["data:text/html,x", undefined],
    ["//example.com", undefined],
    ["/account", undefined],
    ["@maria", undefined],
    ["", undefined],
    [null, undefined],
    [undefined, undefined],
  ])("%j → %j", (value, expected) => {
    expect(safeHref(value)).toBe(expected)
  })

  it("narrows to the given protocols (social links: https only)", () => {
    expect(safeHref("https://x.com/ann", ["https:"])).toBe("https://x.com/ann")
    expect(safeHref("mailto:a@b.co", ["https:"])).toBeUndefined()
  })
})
