import { describe, expect, it } from "vitest"
import { sectionStagger } from "./section-motion"

describe("sectionStagger", () => {
  it.each([
    ["personal", 0],
    ["phone", 1],
    ["email", 2],
    ["social", 3],
    ["addresses", 4],
    ["insurance", 0],
    ["account", 0],
    ["authenticator", 0],
  ])("%s enters at step %i", (id, step) => {
    expect(sectionStagger(id)).toBe(step)
  })
})
