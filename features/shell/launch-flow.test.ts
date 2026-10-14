import { http, HttpResponse } from "msw"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LAUNCH_MESSAGES } from "@/lib/shared/messages"
import { server } from "@/test/msw-server"
import { AUTH_RETRY_DELAY_MS, MAX_AUTH_ATTEMPTS, normalizeLpl, runLaunchFlow } from "./launch-flow"

afterEach(() => vi.useRealTimers())

/** Records each POST's time and answers from a script. */
function scripted(answers: (() => Response)[]): number[] {
  const times: number[] = []
  server.use(
    http.post("/api/token", () => {
      times.push(Date.now())
      const answer = answers[Math.min(times.length - 1, answers.length - 1)]
      return answer()
    }),
  )
  return times
}

const ok = () => HttpResponse.json({ ok: true, environment: "demo" })
const bad502 = () => HttpResponse.json({ ok: false, errorCode: "LAUNCH_INVALID", source: "proxy", message: "Try later copy" }, { status: 502 })

async function runWithClock(lpl = "abc") {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] })
  const pending = runLaunchFlow(lpl)
  await vi.runAllTimersAsync()
  return pending
}

describe("runLaunchFlow (D9)", () => {
  it("has the patient-vault constants", () => {
    expect(MAX_AUTH_ATTEMPTS).toBe(5)
    expect(AUTH_RETRY_DELAY_MS).toBe(1500)
  })

  it("success on attempt 1 → one POST", async () => {
    const times = scripted([ok])
    expect(await runWithClock()).toEqual({ kind: "ok", environment: "demo" })
    expect(times).toHaveLength(1)
  })

  it("two 502s then success → three POSTs 1,500 ms apart", async () => {
    const times = scripted([bad502, bad502, ok])
    expect((await runWithClock()).kind).toBe("ok")
    expect(times).toHaveLength(3)
    expect(times[1] - times[0]).toBe(1500)
    expect(times[2] - times[1]).toBe(1500)
  })

  it("a retryable:false body → one POST, then the error with the server message", async () => {
    const times = scripted([
      () => HttpResponse.json({ ok: false, errorCode: "WRONG_TENANT", source: "proxy", message: "Tenant copy", retryable: false }, { status: 403 }),
    ])
    expect(await runWithClock()).toEqual({ kind: "error", title: LAUNCH_MESSAGES.failedTitle, message: "Tenant copy" })
    expect(times).toHaveLength(1)
  })

  it("five failures → five POSTs, then the last attempt's title and message", async () => {
    const times = scripted([bad502, bad502, bad502, bad502, () => HttpResponse.error()])
    expect(await runWithClock()).toEqual({ kind: "error", title: LAUNCH_MESSAGES.connectionTitle, message: LAUNCH_MESSAGES.connectionBody })
    expect(times).toHaveLength(5)
  })

  it("retries an OK answer without success, falling back to the generic copy", async () => {
    const times = scripted([() => HttpResponse.json({ ok: false })])
    expect(await runWithClock()).toEqual({ kind: "error", title: LAUNCH_MESSAGES.failedTitle, message: LAUNCH_MESSAGES.failedFallback })
    expect(times).toHaveLength(5)
  })

  it("reports each attempt and accepts injected seams", async () => {
    const seen: number[] = []
    const attempt = vi.fn(async () => ({ kind: "network" as const }))
    const sleep = vi.fn(async () => undefined)
    await runLaunchFlow("x", { attempt, sleep, onAttempt: (n) => seen.push(n) })
    expect(seen).toEqual([1, 2, 3, 4, 5])
    expect(sleep).toHaveBeenCalledTimes(4)
  })

  it("normalizes a pasted LPL", () => {
    expect(normalizeLpl("  ab cd \n")).toBe("ab+cd")
  })
})
