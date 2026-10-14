import { describe, expect, it } from "vitest"
import { ENVIRONMENTS, environments, isEnvironment } from "./environments"

describe("environments map (D4)", () => {
  it("holds the demo origins", () => {
    expect(environments.demo).toEqual({
      apiRoot: "https://1health.demo.1health.io",
      apiBase: "https://1health.demo.1health.io/api",
      portalUrl: "https://1health.demo.1health.io",
      publicFilesOrigin: undefined,
    })
  })

  it("holds the prod origins", () => {
    expect(environments.prod).toEqual({
      apiRoot: "https://1health.app.1health.io",
      apiBase: "https://1health.app.1health.io/api",
      portalUrl: "https://1health.app.1health.io",
      publicFilesOrigin: undefined,
    })
  })

  it("has exactly demo and prod, detected prod first", () => {
    expect(Object.keys(environments).sort()).toEqual(["demo", "prod"])
    expect(ENVIRONMENTS).toEqual(["prod", "demo"])
  })

  it("isEnvironment accepts only demo and prod", () => {
    expect(isEnvironment("demo")).toBe(true)
    expect(isEnvironment("prod")).toBe(true)
    for (const v of ["dev", "", "Prod", undefined, null, 1, {}]) expect(isEnvironment(v)).toBe(false)
  })
})
