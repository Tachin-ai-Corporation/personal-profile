import { describe, expect, it } from "vitest"
import { environmentConfig, environmentFromReferrer, isEnvironment } from "./environments"

describe("environments", () => {
  it("holds the D4 map values", () => {
    expect(environmentConfig("demo")).toMatchObject({
      apiRoot: "https://1health.demo.1health.io",
      apiBase: "https://1health.demo.1health.io/api",
      portalUrl: "https://1health.demo.1health.io",
      publicFilesOrigin: null,
    })
    expect(environmentConfig("prod")).toMatchObject({
      apiRoot: "https://1health.app.1health.io",
      apiBase: "https://1health.app.1health.io/api",
      portalUrl: "https://1health.app.1health.io",
      publicFilesOrigin: null,
    })
  })

  it.each([
    ["https://1health.demo.1health.io/apps", "demo"],
    ["https://1health.app.1health.io/", "prod"],
    ["https://example.com/", null],
    ["not a url", null],
  ])("detects %s as %s", (referrer, expected) => {
    expect(environmentFromReferrer(referrer)).toBe(expected)
  })

  it("narrows environment values", () => {
    expect(isEnvironment("demo")).toBe(true)
    expect(isEnvironment("prod")).toBe(true)
    expect(isEnvironment("dev")).toBe(false)
  })
})
