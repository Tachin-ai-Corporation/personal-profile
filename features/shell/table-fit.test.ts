import { describe, expect, it } from "vitest"
import { columnsFit, sharedWidths, type FitColumn } from "./table-fit"

const percent = (value: number) => ({ slope: value / 100, offset: 0 })
const px = (value: number) => ({ slope: 0, offset: value })

describe("columnsFit / sharedWidths (#63 review)", () => {
  // The Phone read view: Number 34 %, four unsized columns (Notifications needs 127 px), the 240 px actions column.
  const phone: FitColumn[] = [
    { length: percent(34), min: 96 },
    { length: null, min: 96 },
    { length: null, min: 96 },
    { length: null, min: 96 },
    { length: null, min: 127 },
  ]

  it("the unsized columns need their mins together from what the sized and fixed columns leave", () => {
    // 0.66 W − 240 ≥ 3 · 96 + 127 = 415 (half a px of slack): W ≥ 991.7.
    expect(columnsFit(993, phone, [px(240)])).toBe(true)
    expect(columnsFit(991, phone, [px(240)])).toBe(false)
    // The 520 px a 768 px viewport leaves (the #63 finding: ~25 px columns).
    expect(columnsFit(520, phone, [px(240)])).toBe(false)
  })

  it("a narrower fixed column (the kebab-only 56 px) lets the same columns fit sooner", () => {
    expect(columnsFit(774, phone, [px(240)])).toBe(false)
    expect(columnsFit(774, phone, [px(56)])).toBe(true)
  })

  it("a sized column below its min fails on its own", () => {
    expect(columnsFit(200, [{ length: percent(34), min: 96 }])).toBe(false)
    expect(columnsFit(300, [{ length: percent(34), min: 96 }])).toBe(true)
  })

  it("each unsized column gets its min plus an equal part of the rest; sized ones are null", () => {
    // 1100 px: 1100 − 374 − 240 = 486 left, 415 needed, 71 / 4 = 17.75 each.
    expect(sharedWidths(1100, phone, [px(240)])).toEqual([null, 113.75, 113.75, 113.75, 144.75])
    // Not enough room: the mins (the caller only asks once the columns fit).
    expect(sharedWidths(500, phone, [px(240)])).toEqual([null, 96, 96, 96, 127])
  })

  it("no unsized columns: only the sized ones count", () => {
    const keyValue: FitColumn[] = [
      { length: percent(16), min: 104 },
      { length: percent(34), min: 96 },
    ]
    expect(columnsFit(650, keyValue)).toBe(true)
    // 16 + 34 + 16 + 34 % of 930 px leaves −1e-13 in floating point: still a fit.
    expect(columnsFit(930, [...keyValue, ...keyValue])).toBe(true)
    expect(columnsFit(431, keyValue)).toBe(false)
    expect(sharedWidths(650, keyValue)).toEqual([null, null])
  })
})
