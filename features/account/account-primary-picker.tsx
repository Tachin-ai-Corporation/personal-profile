"use client"

import { useState } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { InlineBanner } from "@/components/ui/inline-banner"
import type { FieldControlProps } from "@/components/ui/form-field"
import { StateFrame, useNavigate, type SectionForm } from "@/features/shell"
import { mapFetchError, primaryPhoneRegion, type ContactPoint } from "@/lib/api"
import { ACCOUNT_MESSAGES, COMMON_MESSAGES } from "@/lib/shared/messages"
import { formatPhoneDisplay } from "@/lib/shared/phone"
import { primaryOptions, samePrimary, type PrimaryContactKind } from "./primary-contacts"
import type { AccountFormValues } from "./schema"

export interface PrimaryRead { readonly data?: readonly ContactPoint[]; readonly error?: unknown; readonly loading: boolean; readonly attempt: number; readonly retry: () => void }
export function AccountPrimaryPicker({ kind, current, section, wiring, read, changed, onFirstChange }: { readonly kind: PrimaryContactKind; readonly current: string; readonly section: SectionForm<AccountFormValues>; readonly wiring: FieldControlProps; readonly read: PrimaryRead; readonly changed: boolean; readonly onFirstChange: () => void }) {
  const field = kind === "Email" ? "primaryEmail" : "primaryPhone"
  const { ref, value, onChange, onBlur, readOnly } = section.control(field)
  const navigate = useNavigate()
  const options = primaryOptions(kind, current, read.data)
  const helper = kind === "Email" ? ACCOUNT_MESSAGES.emailHelper : ACCOUNT_MESSAGES.phoneHelper
  const [before, after] = helper.split(ACCOUNT_MESSAGES.personalProfile)
  const mapped = read.error ? mapFetchError("account", read.error) : null
  const display = (text: string): string => kind === "Email" ? text : formatPhoneDisplay(text, text === current ? read.data?.find((row) => row.value === current)?.phoneNumberRegion ?? primaryPhoneRegion(read.data, { phoneNumber: current }) : read.data?.find((row) => row.value === text)?.phoneNumberRegion)
  const entries = [...(current ? [{ value: current, label: display(current) }] : []), ...options]
  return <>
    {mapped ? <span>{display(current) || COMMON_MESSAGES.notProvided}</span> : <Select value={value} onValueChange={(next) => { if (next !== current) onFirstChange(); onChange(next) }} ariaDisabled={readOnly || (!read.loading && options.length === 0 && samePrimary(kind, value, current))} loading={read.loading} placeholder={ACCOUNT_MESSAGES.selectValue} unlistedValue={value && !entries.some((option) => option.value === value) ? { value, label: display(value) } : undefined}
      helper={!read.loading && options.length === 0 ? <>{before}<Button type="button" variant="link" size="touch" className="h-auto min-h-11 whitespace-normal p-0 text-link-text" onClick={() => { void navigate({ page: "profile", tab: "contacts", hash: kind === "Email" ? "email" : "phone" }) }}>{ACCOUNT_MESSAGES.personalProfile}</Button>{after}</> : undefined}>
      <SelectTrigger {...wiring} ref={ref} onBlur={onBlur} className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent>{entries.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
    </Select>}
    <StateFrame state={mapped ? read.loading ? "loading" : { error: mapped } : "ready"} skeleton="bars" loadError={{ kind: "page" }} level="section" onRetry={read.retry} attempt={read.attempt} className="border-0 bg-transparent" />
    {changed && <InlineBanner variant="info" className="mt-2">{kind === "Email" ? ACCOUNT_MESSAGES.emailNotice : ACCOUNT_MESSAGES.phoneNotice}</InlineBanner>}
  </>
}

/** A repeated failed read remounts the shared live-region sentence. */
export function usePrimaryReadAttempt(error: unknown): number {
  const [failure, setFailure] = useState({ error, attempt: 0 })
  if (error && error !== failure.error) setFailure({ error, attempt: failure.attempt + 1 })
  return failure.attempt
}
