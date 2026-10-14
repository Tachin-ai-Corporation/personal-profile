import { describe, expect, it, vi } from "vitest"
import type { ApiResponse } from "@/lib/api"
import { runSaveSteps, type SaveStep } from "./run-save-steps"

const OK: ApiResponse<unknown> = { success: true, statusCode: 200 }
const FAIL_500: ApiResponse<unknown> = { success: false, statusCode: 500 }
const NETWORK: ApiResponse<unknown> = { success: false, errorCode: "NETWORK_ERROR" }
const SESSION: ApiResponse<unknown> = { success: false, statusCode: 401, errorCode: "SESSION_EXPIRED", source: "proxy" }

type Part = "a" | "b" | "c"
type Values = Readonly<Record<Part, string>>

/**
 * A 3-part Section against a fake server: each step sends one changed part,
 * built from the diff against the baseline (as a Section does).
 */
function fixture(failing: Partial<Record<Part, ApiResponse<unknown>>> = {}) {
  const server: Record<Part, string> = { a: "1", b: "1", c: "1" }
  let baseline: Values = { ...server }
  const sent: Part[] = []
  const answers = { ...failing }
  const steps = (values: Values): SaveStep<Part>[] =>
    (["a", "b", "c"] as const).map((part) => ({
      part,
      skip: values[part] === baseline[part],
      run: async () => {
        sent.push(part)
        const answer = answers[part]
        if (answer) return answer
        server[part] = values[part]
        return OK
      },
    }))
  return {
    sent,
    answers,
    steps,
    get baseline() {
      return baseline
    },
    refetch: vi.fn(async (): Promise<Values> => ({ ...server })),
    rebase: vi.fn((fresh: Values) => {
      baseline = fresh
    }),
  }
}

describe("runSaveSteps: stop mode", () => {
  it("step 2 of 3 fails: step 3 is skipped, refetch + rebase, and a retry sends only steps 2-3", async () => {
    const f = fixture({ b: FAIL_500 })
    const edited: Values = { a: "2", b: "2", c: "2" }
    const first = await runSaveSteps(f.steps(edited), { scope: "phone", mode: "stop", refetch: f.refetch, rebase: f.rebase })
    expect(f.sent).toEqual(["a", "b"])
    expect(first).toEqual({
      ok: false,
      succeeded: ["a"],
      error: { code: "GENERIC", mapped: { kind: "generic" }, failedParts: ["b", "c"] },
    })
    expect(f.refetch).toHaveBeenCalledTimes(1)
    expect(f.baseline).toEqual({ a: "2", b: "1", c: "1" })

    f.sent.length = 0
    delete f.answers.b
    const retry = await runSaveSteps(f.steps(edited), { scope: "phone", mode: "stop", refetch: f.refetch, rebase: f.rebase })
    expect(f.sent).toEqual(["b", "c"])
    expect(retry).toEqual({ ok: true, succeeded: ["b", "c"] })
    expect(f.refetch).toHaveBeenCalledTimes(1)
  })

  it("without refetch, rebases locally from the succeeded parts: a retry sends only the remaining steps", async () => {
    const f = fixture({ b: FAIL_500 })
    const edited: Values = { a: "2", b: "2", c: "2" }
    const local = { scope: "phone", mode: "stop", rebase: f.rebase, applySucceeded: (parts: readonly Part[]) => ({ ...f.baseline, ...Object.fromEntries(parts.map((part) => [part, edited[part]])) }) } as const
    const first = await runSaveSteps(f.steps(edited), local)
    expect(first.ok).toBe(false)
    expect(f.baseline).toEqual({ a: "2", b: "1", c: "1" })
    f.sent.length = 0
    delete f.answers.b
    expect(await runSaveSteps(f.steps(edited), local)).toEqual({ ok: true, succeeded: ["b", "c"] })
    expect(f.sent).toEqual(["b", "c"])
  })

  it("without refetch and nothing succeeded, does not rebase", async () => {
    const f = fixture({ a: FAIL_500 })
    const applySucceeded = vi.fn(() => f.baseline)
    await runSaveSteps(f.steps({ a: "2", b: "1", c: "1" }), { scope: "phone", mode: "stop", rebase: f.rebase, applySucceeded })
    expect(applySucceeded).not.toHaveBeenCalled()
    expect(f.rebase).not.toHaveBeenCalled()
  })

  it("maps failures through mapApiError for the scope (network → NETWORK_ERROR)", async () => {
    const f = fixture({ a: NETWORK })
    const result = await runSaveSteps(f.steps({ a: "2", b: "1", c: "1" }), { scope: "email", mode: "stop" })
    expect(result).toEqual({ ok: false, succeeded: [], error: { code: "NETWORK_ERROR", mapped: { kind: "network" }, failedParts: ["a"] } })
  })

  it("maps a known upstream message to the Section's field error", async () => {
    const taken: ApiResponse<unknown> = { success: false, statusCode: 400, platformMessage: "Duplicate Contact Points specified." }
    const f = fixture({ a: taken })
    const result = await runSaveSteps(f.steps({ a: "2", b: "1", c: "1" }), { scope: "phone", mode: "stop" })
    expect(result).toEqual({
      ok: false,
      succeeded: [],
      error: { code: "FIELD", mapped: { kind: "field", field: "value", messageKey: "contacts.duplicatePhone" }, failedParts: ["a"] },
    })
  })

  it("a throwing step is an UNEXPECTED failure", async () => {
    const steps: SaveStep<Part>[] = [
      {
        part: "a",
        run: () => Promise.reject(new Error("boom")),
      },
    ]
    expect(await runSaveSteps(steps, { scope: "phone", mode: "stop" })).toEqual({
      ok: false,
      succeeded: [],
      error: { code: "UNEXPECTED", mapped: { kind: "generic" }, failedParts: ["a"] },
    })
  })

  it("all skipped: nothing sent, ok", async () => {
    const f = fixture()
    expect(await runSaveSteps(f.steps(f.baseline), { scope: "phone", mode: "stop", refetch: f.refetch })).toEqual({ ok: true, succeeded: [] })
    expect(f.sent).toEqual([])
    expect(f.refetch).not.toHaveBeenCalled()
  })

  it("a failing refetch keeps the baseline and the result", async () => {
    const f = fixture({ a: FAIL_500 })
    const rebase = vi.fn()
    const result = await runSaveSteps(f.steps({ a: "2", b: "1", c: "1" }), {
      scope: "phone",
      mode: "stop",
      refetch: () => Promise.reject(new Error("offline")),
      rebase,
    })
    expect(result.ok).toBe(false)
    expect(rebase).not.toHaveBeenCalled()
  })

  it("refetch without rebase only revalidates", async () => {
    const f = fixture({ a: FAIL_500 })
    await runSaveSteps(f.steps({ a: "2", b: "1", c: "1" }), { scope: "phone", mode: "stop", refetch: f.refetch })
    expect(f.refetch).toHaveBeenCalledTimes(1)
  })
})

describe("runSaveSteps: attemptAll mode", () => {
  it("steps 1 and 3 fail: all run, failedParts [a, c], step 2 becomes the baseline", async () => {
    const f = fixture({ a: FAIL_500, c: NETWORK })
    const edited: Values = { a: "2", b: "2", c: "2" }
    const result = await runSaveSteps(f.steps(edited), { scope: "account", mode: "attemptAll", refetch: f.refetch, rebase: f.rebase })
    expect(f.sent).toEqual(["a", "b", "c"])
    expect(result).toEqual({ ok: false, succeeded: ["b"], error: { code: "GENERIC", mapped: { kind: "generic" }, failedParts: ["a", "c"] } })
    expect(f.baseline).toEqual({ a: "1", b: "2", c: "1" })

    f.sent.length = 0
    delete f.answers.a
    delete f.answers.c
    expect(await runSaveSteps(f.steps(edited), { scope: "account", mode: "attemptAll" })).toEqual({ ok: true, succeeded: ["a", "c"] })
    expect(f.sent).toEqual(["a", "c"])
  })
})

describe.each(["stop", "attemptAll"] as const)("runSaveSteps (%s): a session error stops at once", (mode) => {
  it("runs nothing after it, never refetches and reports SESSION_EXPIRED", async () => {
    const f = fixture({ b: SESSION })
    const result = await runSaveSteps(f.steps({ a: "2", b: "2", c: "2" }), { scope: "phone", mode, refetch: f.refetch, rebase: f.rebase })
    expect(f.sent).toEqual(["a", "b"])
    expect(result).toEqual({
      ok: false,
      succeeded: ["a"],
      error: { code: "SESSION_EXPIRED", mapped: { kind: "session" }, failedParts: ["b", "c"] },
    })
    expect(f.refetch).not.toHaveBeenCalled()
  })
})
