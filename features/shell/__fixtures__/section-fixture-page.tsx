"use client"

import { useId, useMemo, useRef, useState } from "react"
import { callApi, mapApiError, mapFetchError, mappedErrorCode } from "@/lib/api"
import { useClaimMyselfError } from "../myself-error-claim"
import type { SaveResult, SectionDataStatus } from "../nav-types"
import { StateFrame, type FrameState } from "../state-frame"
import { useMyself } from "../use-myself"
import { FIXTURE_BASELINE, FIXTURE_DRAFT_FIELDS, FixtureSection, fixtureDraftDiff } from "./fixture-section"
import type { FixtureSectionValues } from "./schema"

/** Long enough for the e2e spec to see the saving state. */
const SAVE_DELAY_MS = 600

/**
 * Test-only body of `/test-fixtures/section` (F3-2, F4; spec NG-9027): the
 * fixture Section inside a `StateFrame` driven by `useMyself` (its own load
 * error "Couldn't load phones" + Retry, claimed from the page banner; its
 * number comes from `myself.phoneNumber` when set, so a changed server value
 * is a mocked `myself`; it keeps a draft of both fields), a switch that makes
 * the next save fail like a network error, two that send the next save to
 * the server as a real `callApi` PUT (`v2/user/edit`, answered by the e2e
 * spec: a mapped 400, a generic 400, the 401s that end the session, or the
 * D-A user check), and counters of the saves sent and of "Add row" presses.
 * A mapped `value` field error (the phone-duplicate rule) shows at Number.
 * Not app UI; its strings are fixture data.
 */
export function SectionFixturePage() {
  const switchId = useId()
  const expireId = useId()
  const sendId = useId()
  const failNext = useRef(false)
  const expireNext = useRef(false)
  const sendNext = useRef(false)
  const [failing, setFailing] = useState(false)
  const [expiring, setExpiring] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(0)
  const [rowsAdded, setRowsAdded] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const { myself, error, retry } = useMyself()
  useClaimMyselfError(Boolean(error))
  const phoneNumber = myself?.phoneNumber
  const baseline = useMemo<FixtureSectionValues>(() => ({ number: phoneNumber ?? FIXTURE_BASELINE.number, note: "" }), [phoneNumber])
  const dataStatus: SectionDataStatus = error ? "error" : myself ? "loaded" : "loading"
  const frameState: FrameState = error ? { error: mapFetchError("phone", error) } : myself ? "ready" : "loading"

  async function save(values: FixtureSectionValues): Promise<SaveResult> {
    setSent((count) => count + 1)
    if (expireNext.current || sendNext.current) {
      expireNext.current = false
      sendNext.current = false
      setExpiring(false)
      setSending(false)
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
      <div className="text-body-sm flex flex-wrap items-center gap-x-4">
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
        <span className="flex min-h-11 items-center gap-2">
          <input
            id={sendId}
            type="checkbox"
            className="size-5"
            checked={sending}
            onChange={(event) => {
              sendNext.current = event.target.checked
              setSending(event.target.checked)
            }}
          />
          <label htmlFor={sendId}>Send the next save to the server</label>
        </span>
        <span>
          Saves sent: <output data-testid="saves-sent">{sent}</output>
        </span>
        <span>
          Rows added: <output data-testid="rows-added">{rowsAdded}</output>
        </span>
      </div>
      <StateFrame
        state={frameState}
        skeleton="kv"
        loadError={{ kind: "section", sectionId: "phone" }}
        level="section"
        onRetry={() => {
          // Each Retry is a new attempt, so a repeated failure is announced again.
          setAttempt((count) => count + 1)
          retry()
        }}
        attempt={attempt}
      >
        <FixtureSection
          baseline={baseline}
          dataStatus={dataStatus}
          draftFields={[...FIXTURE_DRAFT_FIELDS]}
          describeDraftDiff={fixtureDraftDiff}
          errorFields={{ value: "number" }}
          save={save}
          onAddRow={() => setRowsAdded((count) => count + 1)}
        />
      </StateFrame>
    </div>
  )
}
