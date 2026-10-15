"use client"

import { useSearchParams } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { BFF_PATHS } from "@/lib/shared/bff-contract"
import { requestLeave } from "../leave"
import type { SectionId } from "../nav-types"
import { useNavigate } from "../navigate"
import { FixtureParticipant, type FixtureSaveBehavior } from "./fixture-participant"

/**
 * Test-only body of `/test-fixtures/leave-guard` (Story 1.13; spec NG-9027):
 * a Save-all participant (phone), a guard-only participant that can save
 * (social, "Fixture editor", `saveAll={false}`, like Story 5.2's editor), a
 * guard-only participant that can't (insurance), a hand-off through
 * `navigate()` and the insurance participant's own scoped close
 * (`requestLeave({ scope: "insurance" })`, whose answer is shown).
 * `?fail=<id>` makes that participant's save fail. Not app UI; its strings
 * are fixture data.
 */
export function LeaveGuardControls() {
  const fail = useSearchParams().get("fail")
  const navigate = useNavigate()
  const [closed, setClosed] = useState("")
  const behavior = (id: SectionId): FixtureSaveBehavior => (fail === id ? "fail" : "ok")

  return (
    <div className="flex flex-col gap-2 px-4 pt-4 md:px-6">
      <FixtureParticipant id="phone" label="Fixture phone" displayOrder={2} saveBehavior={behavior("phone")} />
      <FixtureParticipant id="social" label="Fixture editor" displayOrder={4} saveAll={false} saveBehavior={behavior("social")} />
      <FixtureParticipant id="insurance" label="Fixture insurance" displayOrder={6} canSave={false} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="touch" onClick={() => void navigate({ external: "handoff", href: BFF_PATHS.handoffPortal })}>
          Hand off
        </Button>
        <Button type="button" variant="outline" size="touch" onClick={() => void requestLeave({ scope: "insurance" }).then((ok) => setClosed(String(ok)))}>
          Close insurance
        </Button>
        <span>
          Closed: <output data-testid="scoped-close">{closed}</output>
        </span>
      </div>
    </div>
  )
}
