import { describe, expect, it } from "vitest"
import { matchEntry } from "../match"
import type { AllowlistEntry } from "../types"
import { ALLOWLIST } from "./index"

/**
 * CONSUMER CONTRACT, owned by Team B (spec F7-1). `PUT v2/user/edit` lives in
 * Team A's `personal.ts` (shared with Personal information, Epic 2); these
 * are the bodies Stories 7.5 (names, birth date, preferred language) and 7.6
 * (Primary email and phone) send and must keep being accepted, and the ones
 * they rely on the proxy to reject. A Team A change that breaks a row fails
 * in Team A's PR: agree the change with Team B, then Team B updates this file.
 * Team A's own rows stay in `personal.test.ts`.
 */

function userEdit(): AllowlistEntry {
  const match = matchEntry(ALLOWLIST, "PUT", "v2/user/edit".split("/"))
  if (match.kind !== "matched") throw new Error("PUT v2/user/edit is not allowlisted")
  return match.entry
}

const parse = (body: unknown) => {
  const schema = userEdit().body
  if (!schema) throw new Error("PUT v2/user/edit has no body schema")
  return schema.safeParse(body)
}

describe("PUT v2/user/edit as Team B uses it (contract)", () => {
  it("is allowlisted for PUT only, takes a body and is not switched off by ACCOUNT_DISABLED (no `profile` tag)", () => {
    const entry = userEdit()
    expect(entry.body).toBeDefined()
    expect(entry.profile).toBeUndefined()
    expect(entry.upload).toBeUndefined()
    expect(matchEntry(ALLOWLIST, "POST", "v2/user/edit".split("/")).kind).toBe("method-not-allowed")
  })

  // Story 7.5: only the changed fields among firstName, lastName, birthDate, preferredLanguage.
  it.each([
    { firstName: "Ann" },
    { lastName: "Lee" },
    { firstName: "José-María", lastName: "O'Neil" },
    { firstName: "x".repeat(24) },
    { birthDate: "1990-04-15" },
    { birthDate: "2008-02-29" },
    { preferredLanguage: "en" },
    { preferredLanguage: "es" },
    { preferredLanguage: "fil" },
    { preferredLanguage: "en-US" },
    { firstName: "Ann", lastName: "Lee", birthDate: "1990-04-15", preferredLanguage: "en" },
  ])("7.5 accepts %j", (body) => {
    expect(parse(body).success).toBe(true)
  })

  it("7.5 names are forwarded trimmed; the other fields unchanged", () => {
    const result = parse({ firstName: "  Ann ", birthDate: "1990-04-15", preferredLanguage: "en" })
    expect(result.success && result.data).toEqual({ firstName: "Ann", birthDate: "1990-04-15", preferredLanguage: "en" })
  })

  // Story 7.5: locale, timeZone (their own endpoints), username and password never travel in /edit (backend R2, FR106).
  it.each([
    { locale: "en-US" },
    { timeZone: "America/Chicago" },
    { username: "ann.lee" },
    { password: "secret" },
    { firstName: "Ann", locale: "en-US" },
    { firstName: "" },
    { firstName: "   " },
    { lastName: "x".repeat(25) },
    { birthDate: "04/15/1990" },
    { birthDate: "n/a" },
    { birthDate: "" },
    { preferredLanguage: "English" },
    { preferredLanguage: "" },
  ])("7.5 rejects %j", (body) => {
    expect(parse(body).success).toBe(false)
  })

  // Story 7.6: `email` alone; `phoneNumber` only with `phoneNumberRegion` (the chosen row's region, default "us", sent unchanged).
  it.each([
    { email: "ann.work@example.com" },
    { phoneNumber: "+14155552671", phoneNumberRegion: "us" },
    { phoneNumber: "+14155552671", phoneNumberRegion: "US" },
    { phoneNumber: "+442071838750", phoneNumberRegion: "GB" },
    { email: "ann.work@example.com", phoneNumber: "+14155552671", phoneNumberRegion: "us" },
    { firstName: "Ann", email: "ann.work@example.com", phoneNumber: "+14155552671", phoneNumberRegion: "us" },
  ])("7.6 accepts %j", (body) => {
    expect(parse(body).success).toBe(true)
  })

  it.each([
    { phoneNumber: "+14155552671" },
    { phoneNumberRegion: "us" },
    { email: "not-an-email" },
    { email: "" },
    { phoneNumber: "", phoneNumberRegion: "us" },
    { phoneNumber: "+14155552671", phoneNumberRegion: "usa" },
  ])("7.6 rejects %j", (body) => {
    expect(parse(body).success).toBe(false)
  })
})

import { createProxyHandler } from "../handler"
import { stubServerEnv, testEnv } from "@/test/env-fixture"
import { makeSession, NOW } from "@/test/session-fixture"
import { SESSION_COOKIE, sealSession } from "@/lib/server/session/session"
import { trackAllRequests } from "@/test/msw-server"

it("rejects locale in the real user/edit proxy body before upstream work", async () => {
  stubServerEnv()
  const calls = trackAllRequests()
  const cookie = `${SESSION_COOKIE}=${await sealSession(makeSession())}`
  const response = await createProxyHandler({ env: testEnv(), now: () => NOW })(new Request("http://localhost:3000/api/1h/v2/user/edit", {
    method: "PUT", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ firstName: "Bea", locale: "en-US" }),
  }))
  expect(response.status).toBe(400)
  expect(calls()).toBe(0)
})
