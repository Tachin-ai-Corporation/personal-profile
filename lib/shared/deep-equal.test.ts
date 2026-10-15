import { describe, expect, it } from "vitest"
import { deepEqual } from "./deep-equal"

describe("deepEqual", () => {
  it.each([
    ["equal primitives", "a", "a", true],
    ["different primitives", "a", "b", false],
    ["NaN", Number.NaN, Number.NaN, true],
    ["null and an object", null, {}, false],
    ["an object and null", {}, null, false],
    ["a primitive and an object", 1, { a: 1 }, false],
    ["equal arrays", [1, [2, { a: 3 }]], [1, [2, { a: 3 }]], true],
    ["arrays of different length", [1], [1, 2], false],
    ["arrays with a different item", [1, 2], [1, 3], false],
    ["an array and an object", [1], { 0: 1 }, false],
    ["an object and an array", { 0: 1 }, [1], false],
    ["equal dates", new Date(5), new Date(5), true],
    ["different dates", new Date(5), new Date(6), false],
    ["a date and an object", new Date(5), {}, false],
    ["equal nested objects", { a: { b: [1] }, c: "" }, { c: "", a: { b: [1] } }, true],
    ["a missing key", { a: 1 }, { b: 1 }, false],
    ["an undefined-valued key counts as absent", { a: undefined }, {}, true],
    ["an undefined-valued key on the right counts as absent", { b: 1 }, { b: 1, c: undefined }, true],
    ["undefined vs a value", { a: undefined }, { a: 1 }, false],
    ["a different key count", { a: 1 }, { a: 1, b: 2 }, false],
    ["a different nested value", { a: { b: 1 } }, { a: { b: 2 } }, false],
    ["null-prototype objects", Object.assign(Object.create(null), { a: 1 }), { a: 1 }, true],
    ["class instances by identity", new Map(), new Map(), false],
  ])("%s", (_name, a, b, expected) => {
    expect(deepEqual(a, b)).toBe(expected)
  })
})
