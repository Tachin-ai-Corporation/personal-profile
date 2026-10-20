"use client"

import { InfoIconButton } from "@/components/ui/info-icon-button"
import { InfoPopover } from "@/components/ui/info-popover"
import { SectionLandmark, StateFrame, useSectionFrame } from "@/features/shell"
import { NPI_MESSAGES } from "@/lib/shared/messages"
import { NpiSearch } from "./npi-search"
import { RegisteredView } from "./registered-view"
import { useProviderController } from "./use-provider-controller"

export function ProviderTab() {
  const { state, data, attempt, retry, onSearchFailure } = useProviderController()
  const { onReady } = useSectionFrame("provider")
  const frame = (children?: React.ReactNode) => <StateFrame state={state} skeleton="bars" barWidth="wide" loadError={{ kind: "page" }} level="tab" onRetry={retry} attempt={attempt} onReady={onReady}>{children}</StateFrame>
  if (typeof state === "object" && (state.error.kind === "forbidden" || state.error.kind === "session")) return frame()
  return <SectionLandmark id="provider" title={NPI_MESSAGES.heading} tools={<InfoPopover label={NPI_MESSAGES.about} trigger={<InfoIconButton aria-label={NPI_MESSAGES.about} icon="info" />}><p>{NPI_MESSAGES.information}</p></InfoPopover>}>
    {frame(data?.provider ? <RegisteredView npi={data.provider.npi} /> : <NpiSearch onFailure={onSearchFailure} />)}
  </SectionLandmark>
}
