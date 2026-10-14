import { beforeEach, describe, expect, it, vi } from "vitest"

const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND")
})
const requirePageSession = vi.fn(async () => ({ portalUrl: "https://portal.test" }))
let fixturesOn = false

vi.mock("next/navigation", () => ({ notFound }))
vi.mock("@/lib/server/page-session", () => ({ requirePageSession }))
vi.mock("@/lib/server/env", () => ({ serverEnv: () => ({ PP_E2E_FIXTURES: fixturesOn }) }))
// The page's client tree is not rendered here; only its server gate is under test.
vi.mock("@/features/shell", () => ({ PageFrame: () => null, PortalUrlProvider: () => null, ProfileTabs: () => null }))
vi.mock("@/features/header", () => ({ ProfileHeader: () => null }))
vi.mock("@/features/shell/__fixtures__/fixture-participant", () => ({ FixtureParticipant: () => null }))
vi.mock("@/features/shell/__fixtures__/primitives-fixture", () => ({ PrimitivesFixture: () => null }))

/** Imported after the mocks above are registered. */
const LeaveGuardFixturePage = async () => (await import("./test-fixtures/leave-guard/page")).default()
const PrimitivesFixturePage = async () => (await import("./test-fixtures/primitives/page")).default()

beforeEach(() => {
  notFound.mockClear()
  requirePageSession.mockClear()
})

describe("/test-fixtures/leave-guard gate", () => {
  it("is a 404 unless PP_E2E_FIXTURES=1, before any session check", async () => {
    fixturesOn = false
    await expect(LeaveGuardFixturePage()).rejects.toThrow("NEXT_NOT_FOUND")
    expect(notFound).toHaveBeenCalledTimes(1)
    expect(requirePageSession).not.toHaveBeenCalled()
  })

  it("requires a session and renders when the flag is on", async () => {
    fixturesOn = true
    await expect(LeaveGuardFixturePage()).resolves.toBeTruthy()
    expect(notFound).not.toHaveBeenCalled()
    expect(requirePageSession).toHaveBeenCalledTimes(1)
  })
})

describe("/test-fixtures/primitives gate", () => {
  it("is a 404 unless PP_E2E_FIXTURES=1", async () => {
    fixturesOn = false
    await expect(PrimitivesFixturePage()).rejects.toThrow("NEXT_NOT_FOUND")
    expect(notFound).toHaveBeenCalledTimes(1)
  })

  it("renders when the flag is on", async () => {
    fixturesOn = true
    await expect(PrimitivesFixturePage()).resolves.toBeTruthy()
    expect(notFound).not.toHaveBeenCalled()
  })
})
