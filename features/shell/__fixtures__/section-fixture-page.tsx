"use client"

import { useId, useMemo, useRef, useState } from "react"
import { callApi, mapApiError, mappedErrorCode } from "@/lib/api"
import type { SaveResult, SectionDataStatus } from "../nav-types"
import { useMyself } from "../use-myself"
import { FIXTURE_BASELINE, FIXTURE_DRAFT_FIELDS, FixtureSection, fixtureDraftDiff } from "./fixture-section"
import type { FixtureSectionValues } from "./schema"

/** Long enough for the e2e spec to see the saving state. */
const SAVE_DELAY_MS = 600

/**
 * Test-only body of `/test-fixtures/section` (F3-2, F4): the fixture Section
 * (its number comes from `myself.phoneNumber` when set, so a changed server
 * value is a mocked `myself`; it keeps a draft of both fields), a switch that
 * makes the next save fail like a network error, one that makes it end the
 * session (a real `callApi` PUT, whose 401s the e2e spec mocks), and
 * counters of the saves sent and of "Add row" presses. Not app UI; its
 * strings are fixture data.
 */
export function SectionFixturePage() {
  const switchId = useId()
  const expireId = useId()
  const failNext = useRef(false)
  const expireNext = useRef(false)
  const [failing, setFailing] = useState(false)
  const [expiring, setExpiring] = useState(false)
  const [sent, setSent] = useState(0)
  const [rowsAdded, setRowsAdded] = useState(0)
  const { myself, error } = useMyself()
  const phoneNumber = myself?.phoneNumber
  const baseline = useMemo<FixtureSectionValues>(() => ({ number: phoneNumber ?? FIXTURE_BASELINE.number, note: "" }), [phoneNumber])
  const dataStatus: SectionDataStatus = error ? "error" : myself ? "loaded" : "loading"

  async function save(values: FixtureSectionValues): Promise<SaveResult> {
    setSent((count) => count + 1)
    if (expireNext.current) {
      expireNext.current = false
      setExpiring(false)
      const response = await callApi("fixture/save", "/api/1h/v2/user/edit", { method: "PUT", body: JSON.stringify(values) })
      if (!response.success) {
        const mapped = mapApiError("phone", response)
        return { ok: false, error: { code: mappedErrorCode(mapped), mapped } }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, SAVE_DELAY_MS))
    if (failNext.current) {
      failNext.current = false
      setFailing(false)
      return { ok: false, error: { code: "NETWORK_ERROR", mapped: { kind: "network" } } }
    }
    return { ok: true }
  }

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-8 md:px-6">
      <div className="text-body-sm flex items-center gap-4">
        <span className="flex min-h-11 items-center gap-2">
          <input
            id={switchId}
            type="checkbox"
            className="size-5"
            checked={failing}
            onChange={(event) => {
              failNext.current = event.target.checked
              setFailing(event.target.checked)
            }}
          />
          <label htmlFor={switchId}>Fail the next save</label>
        </span>
        <span className="flex min-h-11 items-center gap-2">
          <input
            id={expireId}
            type="checkbox"
            className="size-5"
            checked={expiring}
            onChange={(event) => {
              expireNext.current = event.target.checked
              setExpiring(event.target.checked)
            }}
          />
          <label htmlFor={expireId}>End the session on the next save</label>
        </span>
        <span>
          Saves sent: <output data-testid="saves-sent">{sent}</output>
        </span>
        <span>
          Rows added: <output data-testid="rows-added">{rowsAdded}</output>
        </span>
      </div>
      <FixtureSection
        baseline={baseline}
        dataStatus={dataStatus}
        draftFields={[...FIXTURE_DRAFT_FIELDS]}
        describeDraftDiff={fixtureDraftDiff}
        save={save}
        onAddRow={() => setRowsAdded((count) => count + 1)}
      />
    </div>
  )
}
