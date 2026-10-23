"use client"

import { useEffect } from "react"
import { InfoIconButton } from "@/components/ui/info-icon-button"
import { InfoPopover } from "@/components/ui/info-popover"
import { SectionLandmark, StateFrame, sectionHeadingId, useSectionFrame } from "@/features/shell"
import { sessionEvents } from "@/lib/api"
import { NPI_MESSAGES } from "@/lib/shared/messages"
import { NpiSearch } from "./npi-search"
import { RegisteredView } from "./registered-view"
import { useProviderController } from "./use-provider-controller"

export function ProviderTab() {
  const { state, data, claimRegistrationFocus, attempt, retry, onSearchFailure, onRegistered } = useProviderController()
  const { onReady } = useSectionFrame("provider")
  useEffect(() => {
    if (state !== "ready" || !data?.provider || sessionEvents.hasPublished("session-expired") || !claimRegistrationFocus()) return
    document.getElementById(sectionHeadingId("provider"))?.focus()
  }, [state, data?.provider, claimRegistrationFocus])
  const frame = (children?: React.ReactNode) => <StateFrame state={state} skeleton="bars" barWidth="wide" loadError={{ kind: "page" }} level="tab" onRetry={retry} attempt={attempt} onReady={onReady}>{children}</StateFrame>
  if (typeof state === "object" && (state.error.kind === "forbidden" || state.error.kind === "session")) return frame()
  return <SectionLandmark id="provider" title={NPI_MESSAGES.heading} tools={<InfoPopover label={NPI_MESSAGES.about} trigger={<InfoIconButton aria-label={NPI_MESSAGES.about} icon="info" />}><p>{NPI_MESSAGES.information}</p></InfoPopover>}>
    {frame(data?.provider ? <RegisteredView registration={data} /> : <NpiSearch onFailure={onSearchFailure} onRegistered={onRegistered} />)}
  </SectionLandmark>
}
