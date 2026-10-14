"use client"

import { useId, useRef, useState } from "react"
import type { SaveResult } from "../nav-types"
import { FixtureSection } from "./fixture-section"

/** Long enough for the e2e spec to see the saving state. */
const SAVE_DELAY_MS = 600

/**
 * Test-only body of `/test-fixtures/section` (F3-2): the fixture Section, a
 * switch that makes the next save fail like a network error, and counters
 * of the saves sent and of "Add row" presses. Not app UI; its strings are fixture data.
 */
export function SectionFixturePage() {
  const switchId = useId()
  const failNext = useRef(false)
  const [failing, setFailing] = useState(false)
  const [sent, setSent] = useState(0)
  const [rowsAdded, setRowsAdded] = useState(0)

  async function save(): Promise<SaveResult> {
    setSent((count) => count + 1)
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
        <span>
          Saves sent: <output data-testid="saves-sent">{sent}</output>
        </span>
        <span>
          Rows added: <output data-testid="rows-added">{rowsAdded}</output>
        </span>
      </div>
      <FixtureSection save={save} onAddRow={() => setRowsAdded((count) => count + 1)} />
    </div>
  )
}
