import { beforeEach, describe, expect, it, vi } from "vitest"
import { updateAccount, setTimeZone, setLocale } from "@/lib/api"
import { saveAccount } from "./account-save"

vi.mock("@/lib/api", async (original) => ({ ...await original<typeof import("@/lib/api")>(), updateAccount: vi.fn(), setTimeZone: vi.fn(), setLocale: vi.fn() }))
const base = { primaryEmail: "ann.lee@example.com", primaryPhone: "+14155552671", firstName: "Ann", lastName: "Lee", birthDate: "04/15/1990", preferredLanguage: "en", timeZone: "America/Chicago", locale: "fr-FR" }
const values = { ...base, firstName: "Bea", timeZone: "America/New_York", locale: "en-US" }
const parts = ["details", "timeZone", "locale"] as const
const writes = [updateAccount, setTimeZone, setLocale]
beforeEach(() => vi.clearAllMocks())
describe("Account partial save recovery", () => {
  it.each([0, 1, 2, 3, 4, 5, 6, 7])("attempts all ordinary failures, mask %i, and retries only failures despite failed refresh", async (mask) => {
    const order: number[] = []
    writes.forEach((write, index) => vi.mocked(write).mockImplementation(async () => { order.push(index); return mask & (1 << index) ? { success: false, statusCode: 500 } : { success: true } }))
    const rebase = vi.fn(); const outcomes = vi.fn(); const refresh = vi.fn().mockRejectedValue(new Error("read failed"))
    const result = await saveAccount(values, base, { rebase, refresh, outcomes })
    expect(order).toEqual([0, 1, 2])
    expect(result.ok).toBe(mask === 0)
    if (!result.ok) expect(result.error.failedParts).toEqual(parts.filter((_, index) => mask & (1 << index)))
    const acknowledged = rebase.mock.calls[0]?.[0] ?? base
    order.length = 0
    await saveAccount(values, acknowledged, { rebase, refresh, outcomes })
    expect(order).toEqual([0, 1, 2].filter((index) => mask & (1 << index)))
  })
  it.each([0, 1, 2])("stops on expiry in part %i, preserving earlier acknowledgements", async (expiry) => {
    writes.forEach((write, index) => vi.mocked(write).mockResolvedValue(index === expiry ? { success: false, statusCode: 401, errorCode: "SESSION_EXPIRED", source: "proxy" } : { success: true }))
    const rebase = vi.fn(); const refresh = vi.fn()
    const result = await saveAccount(values, base, { rebase, refresh, outcomes: vi.fn() })
    expect(result).toMatchObject({ ok: false, error: { code: "SESSION_EXPIRED" } })
    writes.forEach((write, index) => expect(write).toHaveBeenCalledTimes(index <= expiry ? 1 : 0))
    expect(refresh).not.toHaveBeenCalled()
  })
  it("skips an unchanged save and tolerates thrown writes", async () => {
    const options = { rebase: vi.fn(), refresh: vi.fn(), outcomes: vi.fn() }
    await saveAccount(base, base, options)
    writes.forEach((write) => expect(write).not.toHaveBeenCalled())
    vi.mocked(updateAccount).mockRejectedValue(new Error("network"))
    expect(await saveAccount({ ...base, firstName: "Bea" }, base, options)).toMatchObject({ ok: false, error: { failedParts: ["details"] } })
  })
})

it("acknowledges only details present in the changed payload", async () => {
  vi.mocked(updateAccount).mockResolvedValue({ success: true })
  const rebase = vi.fn()
  await saveAccount({ ...base, firstName: " Bea ", lastName: " Lee " }, base, { rebase, refresh: vi.fn(), outcomes: vi.fn() })
  expect(updateAccount).toHaveBeenCalledWith({ firstName: "Bea" })
  expect(rebase).toHaveBeenCalledWith({ ...base, firstName: "Bea" })
})

it("rejects unsupported changed draft locale without writing or acknowledging it, while other parts proceed", async () => {
  vi.mocked(updateAccount).mockResolvedValue({ success: true })
  vi.mocked(setTimeZone).mockResolvedValue({ success: true })
  const rebase = vi.fn()
  const outcomes = vi.fn()
  const result = await saveAccount({ ...values, locale: "fr-FR" }, { ...base, locale: "en-US" }, { rebase, outcomes, refresh: vi.fn() })
  expect(result).toMatchObject({ ok: false, error: { failedParts: ["locale"] } })
  expect(setLocale).not.toHaveBeenCalled()
  expect(rebase.mock.calls[0][0]).toMatchObject({ firstName: "Bea", timeZone: "America/New_York", locale: "en-US" })
  await saveAccount(base, base, { rebase, outcomes, refresh: vi.fn() })
  expect(setLocale).not.toHaveBeenCalled()
})

it("finishes acknowledged writes without waiting for a held supplementary refresh", async () => {
  vi.mocked(updateAccount).mockResolvedValue({ success: true })
  let release!: () => void
  const refresh = vi.fn(() => new Promise<void>((resolve) => { release = resolve }))
  expect(await saveAccount({ ...base, firstName: "Bea" }, base, { rebase: vi.fn(), outcomes: vi.fn(), refresh })).toEqual({ ok: true })
  expect(refresh).toHaveBeenCalledOnce()
  release()
})

it("keeps each distinct safe 400 message paired with the part that failed", async () => {
  writes.forEach((write, index) => vi.mocked(write).mockResolvedValue({ success: false, statusCode: 400, platformMessage: `${parts[index]} rejected safely` }))
  const outcomes = vi.fn()
  await saveAccount(values, base, { rebase: vi.fn(), outcomes, refresh: vi.fn() })
  expect(outcomes.mock.calls.at(-1)?.[0]).toEqual(parts.map((part) => ({ part, mapped: { kind: "generic", message: `${part} rejected safely` } })))
})

import { toContactPoints } from "@/lib/api"
import { contactPointWire } from "@/test/myself-fixture"
const contacts = {
  email: toContactPoints([contactPointWire({ type: "Email", value: "work@example.com" })])!,
  mobile: toContactPoints([contactPointWire({ value: "+442071838750", phoneNumberRegion: "GB" })])!,
}
it("acknowledges changed contacts and never resends the own email after partial success", async () => {
  vi.mocked(updateAccount).mockResolvedValue({ success: true })
  vi.mocked(setTimeZone).mockResolvedValue({ success: false, statusCode: 500 })
  const changed = { ...base, primaryEmail: "work@example.com", primaryPhone: "+442071838750", timeZone: "Europe/London" }
  const rebase = vi.fn()
  const options = { contacts, rebase, outcomes: vi.fn(), refresh: vi.fn() }
  expect(await saveAccount(changed, base, options)).toMatchObject({ ok: false })
  expect(updateAccount).toHaveBeenCalledWith({ email: "work@example.com", phoneNumber: "+442071838750", phoneNumberRegion: "GB" })
  expect(rebase.mock.calls[0][0]).toMatchObject({ primaryEmail: changed.primaryEmail, primaryPhone: changed.primaryPhone, timeZone: base.timeZone })
  await saveAccount(changed, rebase.mock.calls[0][0], options)
  expect(updateAccount).toHaveBeenCalledOnce()
  expect(setTimeZone).toHaveBeenCalledTimes(2)
})
it.each([undefined, { email: [], mobile: [] }, { email: contacts.email, mobile: [] }])("rejects unknown/no-longer-verified changes before every write", async (lists) => {
  expect(await saveAccount({ ...values, primaryPhone: "+442071838750" }, base, { contacts: lists, rebase: vi.fn(), outcomes: vi.fn(), refresh: vi.fn() })).toMatchObject({ ok: false, error: { mapped: { kind: "generic", message: "Select a current verified contact" } } })
  writes.forEach((write) => expect(write).not.toHaveBeenCalled())
})
it("A to B to A and email casing alone never send the current email", async () => {
  vi.mocked(updateAccount).mockResolvedValue({ success: true })
  await saveAccount({ ...base, firstName: "Bea", primaryEmail: base.primaryEmail.toUpperCase() }, base, { contacts, rebase: vi.fn(), outcomes: vi.fn(), refresh: vi.fn() })
  expect(updateAccount).toHaveBeenCalledWith({ firstName: "Bea" })
})
