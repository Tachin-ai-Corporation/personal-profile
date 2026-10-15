import { describe, expect, it } from "vitest"
import { ENVIRONMENTS, environmentConfig, environmentFromReferrer, environmentOfPortalUrl, isEnvironment } from "./environments"

describe("environments", () => {
  it("holds the D4 map values", () => {
    expect(environmentConfig("demo")).toMatchObject({
      apiRoot: "https://1health.demo.1health.io",
      apiBase: "https://1health.demo.1health.io/api",
      portalUrl: "https://1health.demo.1health.io",
      publicFilesOrigin: "https://bocore-public-files-demo.s3.us-west-1.amazonaws.com",
      label: "Demo",
    })
    expect(environmentConfig("prod")).toMatchObject({
      apiRoot: "https://1health.app.1health.io",
      apiBase: "https://1health.app.1health.io/api",
      portalUrl: "https://1health.app.1health.io",
      publicFilesOrigin: "https://bocore-public-files-prod.s3.us-west-1.amazonaws.com",
      label: "Production",
    })
  })

  it("holds the D18 dev values: dev.1hdev.io, no confirmed public-files origin", () => {
    expect(ENVIRONMENTS).toEqual(["demo", "prod", "dev"])
    expect(environmentConfig("dev")).toEqual({
      apiRoot: "https://dev.1hdev.io",
      apiBase: "https://dev.1hdev.io/api",
      portalUrl: "https://dev.1hdev.io",
      publicFilesOrigin: null,
      referrerHostFragment: "dev.1hdev.io",
      label: "Dev",
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
    ["https://dev.1hdev.io/apps/launch", "dev"],
    ["https://example.com/", null],
    ["https://dev.1health.io/", null],
    ["https://demo.1hdev.io/", null],
    ["https://app.1hdev.io/", null],
    ["not a url", null],
  ])("detects %s as %s", (referrer, expected) => {
    expect(environmentFromReferrer(referrer)).toBe(expected)
  })

  it("no environment's referrer fragment matches another environment's host (D18)", () => {
    for (const environment of ENVIRONMENTS) {
      const host = new URL(environmentConfig(environment).apiRoot).hostname
      for (const other of ENVIRONMENTS) {
        expect(host.includes(environmentConfig(other).referrerHostFragment)).toBe(other === environment)
      }
    }
  })

  it("recognises only the configured environments' referrers", () => {
    expect(environmentFromReferrer("https://dev.1hdev.io/", ["demo", "prod"])).toBeNull()
    expect(environmentFromReferrer("https://1health.demo.1health.io/", ["demo", "prod"])).toBe("demo")
    expect(environmentFromReferrer("https://1health.app.1health.io/", ["demo"])).toBeNull()
  })

  it("maps a portal URL back to its environment", () => {
    expect(environmentOfPortalUrl("https://1health.demo.1health.io")).toBe("demo")
    expect(environmentOfPortalUrl("https://1health.app.1health.io")).toBe("prod")
    expect(environmentOfPortalUrl("https://dev.1hdev.io")).toBe("dev")
    expect(environmentOfPortalUrl("https://portal.test")).toBeNull()
  })

  it("narrows environment values", () => {
    expect(isEnvironment("demo")).toBe(true)
    expect(isEnvironment("prod")).toBe(true)
    expect(isEnvironment("dev")).toBe(true)
    expect(isEnvironment("staging")).toBe(false)
    expect(isEnvironment(undefined)).toBe(false)
  })
})
