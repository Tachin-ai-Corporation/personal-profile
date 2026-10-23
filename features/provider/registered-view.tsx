"use client"

import { InfoIconButton } from "@/components/ui/info-icon-button"
import { LinkTextButton } from "@/components/ui/link-text-button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip } from "@/components/ui/tooltip"
import { KeyValueTable, SectionContainer, SignatureThumb, useMyself, useNavigate } from "@/features/shell"
import type { UserNpi } from "@/lib/api"
import { isNotProvided } from "@/lib/shared/display-value"
import { COMMON_MESSAGES, NPI_MESSAGES, SHELL_MESSAGES } from "@/lib/shared/messages"
import { PracticeSupportPopover } from "./practice-support-popover"
import { RegisteredPracticeAction } from "./registered-practice-action"

function npiValue(value: string | undefined) {
  return isNotProvided(value) ? null : <span className="mono-value">{value}</span>
}

/** FR116 reading order; normalize placeholders before wrapping elements. */
export function RegisteredView({ registration }: { readonly registration: UserNpi }) {
  const { myself, error, isLoading } = useMyself()
  const navigate = useNavigate()
  const identityReady = !isLoading && !error && myself !== undefined
  const provider = registration.provider
  const practice = registration.practice
  const lines = [provider?.providerFirstLineBusinessPracticeLocationAddress, provider?.providerSecondLineBusinessPracticeLocationAddress].filter((line): line is string => !isNotProvided(line))
  const name = practice?.providerOrganizationName
  let practiceName = name
  if (isNotProvided(name)) practiceName = undefined
  const nameValue = practice?.organization
    ? <PracticeSupportPopover key={`${practice.id}:${practice.organization.tenantId ?? "unknown"}`} name={practiceName ?? COMMON_MESSAGES.notProvided} />
    : practiceName
  const signature = <div className="flex flex-wrap items-center gap-x-1">
    {isLoading ? <Skeleton data-slot="registered-signature-skeleton" aria-hidden="true" className="h-8 w-28 motion-reduce:animate-none" /> : <SignatureThumb fileId={myself?.signature?.id} fallback={NPI_MESSAGES.signatureUnavailable} />}
    <Tooltip content={NPI_MESSAGES.signatureHelp} wide><InfoIconButton aria-label={NPI_MESSAGES.aboutSignature} /></Tooltip>
    <LinkTextButton onClick={() => void navigate({ page: "profile", tab: "contacts", hash: "signature" })}>{SHELL_MESSAGES.pageProfile}</LinkTextButton>
  </div>
  return <>
    <SectionContainer editing={false}><KeyValueTable labelledBy="provider-heading" rows={[
      { key: "npi", label: NPI_MESSAGES.npi, value: npiValue(provider?.npi) },
      { key: "taxonomy", label: NPI_MESSAGES.taxonomy, value: provider?.taxonomy?.name },
      { key: "hie", label: NPI_MESSAGES.healthInformationExchange, value: registration.hie?.endpoint },
      { key: "practiceName", label: NPI_MESSAGES.practiceName, value: nameValue },
      { key: "practiceAddress", label: NPI_MESSAGES.practiceAddress, value: practice?.providerFirstLineBusinessPracticeLocationAddress },
      { key: "practiceNpi", label: NPI_MESSAGES.practiceNpi, value: npiValue(practice?.npi) },
      { key: "licenses", label: NPI_MESSAGES.licenses, value: provider?.providerLicenseNumber },
      { key: "addressOfPractice", label: NPI_MESSAGES.addressOfPractice, value: lines.length ? <div>{lines.map((line, index) => <div key={index}>{line}</div>)}</div> : null },
      { key: "signature", label: SHELL_MESSAGES.signature, value: signature },
    ]} /></SectionContainer>
    {/* Eligibility is private to the current practice, identity and prerequisites. */}
    <RegisteredPracticeAction key={`${practice?.id ?? "none"}:${myself?.id ?? "unknown"}:${identityReady}:${practice?.verified}:${Boolean(practice?.organization)}`} registration={registration} myself={myself} identityReady={identityReady} />
  </>
}
