"use client"

import { useSearchParams } from "next/navigation"
import { useState } from "react"
import type { SectionId } from "../nav-types"
import { useDirtyCount } from "../section-registry"
import { FixtureParticipant, type FixtureSaveBehavior } from "./fixture-participant"

/**
 * Test-only body of `/test-fixtures/save-all` (spec NG-9027, for Story
 * 1.14): three Save-all participants (personal, email, phone) and a
 * guard-only participant that can save (insurance, `saveAll={false}`, never
 * counted), with the page's dirty count. The page passes `SAVE_ORDER` and
 * the Save all bar (`saveAllSlot`). `?fail=<id>` makes that participant's
 * save fail. `save-log` lists the participants whose save ran, in call order
 * (Story 1.14's e2e checks `SAVE_ORDER`). Not app UI; its strings are
 * fixture data.
 */
export function SaveAllFixture() {
  const fail = useSearchParams().get("fail")
  const dirty = useDirtyCount()
  const [saveLog, setSaveLog] = useState<readonly SectionId[]>([])
  const behavior = (id: SectionId): FixtureSaveBehavior => (fail === id ? "fail" : "ok")
  const logSave = (id: SectionId) => () => setSaveLog((log) => [...log, id])

  return (
    <div className="flex flex-col gap-2 px-4 pt-4 pb-8 md:px-6">
      <FixtureParticipant id="personal" label="Fixture personal" displayOrder={1} saveBehavior={behavior("personal")} onSave={logSave("personal")} />
      <FixtureParticipant id="phone" label="Fixture phone" displayOrder={2} saveBehavior={behavior("phone")} onSave={logSave("phone")} />
      <FixtureParticipant id="email" label="Fixture email" displayOrder={3} saveBehavior={behavior("email")} onSave={logSave("email")} />
      <FixtureParticipant
        id="insurance"
        label="Fixture insurance"
        displayOrder={6}
        saveAll={false}
        saveBehavior={behavior("insurance")}
        onSave={logSave("insurance")}
      />
      <span className="text-body-sm">
        Unsaved: <output data-testid="dirty-count">{dirty}</output>
      </span>
      <ol data-testid="save-log" className="text-body-sm">
        {saveLog.map((id, index) => (
          <li key={index}>{id}</li>
        ))}
      </ol>
    </div>
  )
}
