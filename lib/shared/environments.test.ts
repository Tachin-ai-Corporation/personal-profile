import { describe, expect, it } from "vitest"
import { environmentConfig, environmentFromReferrer, isEnvironment } from "./environments"

describe("environments", () => {
  it("holds the D4 map values", () => {
    expect(environmentConfig("demo")).toMatchObject({
      apiRoot: "https://1health.demo.1health.io",
      apiBase: "https://1health.demo.1health.io/api",
      portalUrl: "https://1health.demo.1health.io",
      publicFilesOrigin: "https://bocore-public-files-demo.s3.us-west-1.amazonaws.com",
    })
    expect(environmentConfig("prod")).toMatchObject({
      apiRoot: "https://1health.app.1health.io",
      apiBase: "https://1health.app.1health.io/api",
      portalUrl: "https://1health.app.1health.io",
      publicFilesOrigin: "https://bocore-public-files-prod.s3.us-west-1.amazonaws.com",
    })
  })

  it("keeps every public-files origin a bare https origin (AD-24 compares with URL#origin)", () => {
    for (const environment of ["demo", "prod"] as const) {
      const origin = environmentConfig(environment).publicFilesOrigin ?? ""
      expect(new URL(origin).origin).toBe(origin)
      expect(origin.startsWith("https://")).toBe(true)
    }
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
