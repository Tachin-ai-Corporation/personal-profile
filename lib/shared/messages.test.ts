import { describe, expect, it } from "vitest"
import { AUTH_COPY, DISABLED_COPY, ENVIRONMENT_LABELS, LAUNCH_ERROR_MESSAGES, SESSION_EXPIRED_COPY } from "./messages"

/**
 * The `/auth` launch copy (Story 1.2, D9) and the `/api/token` errorCode →
 * message map. Strings quoted in EXPERIENCE.md are asserted verbatim.
 */
describe("LAUNCH_ERROR_MESSAGES", () => {
  it("maps every launch errorCode to its user-safe message", () => {
    const expired = "This link has expired. Open Personal Profile again from 1health."
    const unavailable = "Personal Profile is unavailable right now. Use your profile in 1health for now."
    expect(LAUNCH_ERROR_MESSAGES).toEqual({
      LAUNCH_INVALID: expired,
      LAUNCH_USED: expired,
      LAUNCH_EXPIRED: expired,
      WRONG_TENANT: "This is available in your personal account. Switch to it in 1health and open it again.",
      LAUNCH_CONFIG: unavailable,
      SERVICE_DISABLED: unavailable,
      UNSUPPORTED_MEDIA: expired,
      METHOD_NOT_ALLOWED: expired,
    })
  })
})

describe("AUTH_COPY (EXPERIENCE.md, verbatim)", () => {
  it("progress, success and error strings", () => {
    expect(AUTH_COPY.authenticating).toBe("Authenticating...")
    expect(AUTH_COPY.connectingTo("demo")).toBe("Connecting to Demo environment")
    expect(AUTH_COPY.connectingTo("prod")).toBe("Connecting to Production environment")
    expect(AUTH_COPY.confirming).toBe("Confirming your login...")
    expect(AUTH_COPY.confirmingBody).toBe("This can take a moment. Please wait while we finish confirming your login.")
    expect(AUTH_COPY.success).toBe("Success!")
    expect(AUTH_COPY.loadingApp).toBe("Loading app...")
    expect(AUTH_COPY.failedTitle).toBe("Authentication Failed")
    expect(AUTH_COPY.failedFallback).toBe("Unable to authenticate. Please return to 1health and try again.")
    expect(AUTH_COPY.connectionTitle).toBe("Connection Error")
    expect(AUTH_COPY.connectionBody).toBe(
      "Unable to connect to the authentication service. Please check your connection and try again.",
    )
    expect(AUTH_COPY.enterManually).toBe("Enter LPL Manually")
    expect(AUTH_COPY.switchEnvironment).toBe("Switch Environment")
    expect(AUTH_COPY.goTo1health("demo")).toBe("Go to 1health (Demo)")
    expect(AUTH_COPY.goTo1health("prod")).toBe("Go to 1health (Production)")
  })

  it("manual entry and Choose Environment strings", () => {
    expect(AUTH_COPY.manualTitle).toBe("Authentication Required")
    expect(AUTH_COPY.manualDescription("demo")).toBe("Connected to Demo environment. No launch payload detected.")
    expect(AUTH_COPY.lplLabel).toBe("Launch Payload (LPL)")
    expect(AUTH_COPY.lplPlaceholder).toBe("Paste encrypted LPL here...")
    expect(AUTH_COPY.submit).toBe("Submit")
    expect(AUTH_COPY.or).toBe("Or")
    expect(AUTH_COPY.chooseTitle).toBe("Choose Environment")
    expect(ENVIRONMENT_LABELS).toEqual({ demo: "Demo", prod: "Production" })
  })
})

describe("DISABLED_COPY and SESSION_EXPIRED_COPY", () => {
  it("holds the disabled-screen draft copy", () => {
    expect(DISABLED_COPY).toEqual({
      title: "Personal Profile is unavailable right now",
      body: "Use your profile in 1health for now.",
      action: "Go to 1health",
    })
  })

  it("has no framed variant (D10)", () => {
    expect(Object.keys(SESSION_EXPIRED_COPY).sort()).toEqual(["action", "body", "title"])
  })
})
