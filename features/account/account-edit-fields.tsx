"use client"

import type { SectionControl } from "@/features/shell/use-section-form"
import type { FieldControlProps } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { InputLocked } from "@/components/ui/input-locked"
import { DateInput } from "@/components/ui/date-input"
import { InfoIconButton } from "@/components/ui/info-icon-button"
import { Tooltip } from "@/components/ui/tooltip"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { KeyValueEditTable, sectionHeadingId, type SectionForm, type KeyValueEditRow } from "@/features/shell"
import { ACCOUNT_MESSAGES, COMMON_MESSAGES } from "@/lib/shared/messages"
import { birthDateBounds } from "@/lib/shared/person-rules"
import { displayToWireDate } from "@/lib/shared/dates"
import { ACCOUNT_TIME_ZONES } from "@/lib/shared/time-zones"
import { ACCOUNT_FIELD_LABELS, type AccountFormValues } from "./schema"
import type { AccountView } from "./view-model"

export function AccountEditFields({ section, view, roles }: { readonly section: SectionForm<AccountFormValues>; readonly view: AccountView; readonly roles?: readonly string[] }) {
  const textRow = (key: "firstName" | "lastName"): KeyValueEditRow => {
    const field = section.field(key)
    return { key, label: ACCOUNT_FIELD_LABELS[key], required: true, error: section.errorFor(key), render: (props) => <Input {...props} {...field} onBlur={(event) => {
      if (!field.readOnly) {
        event.target.value = event.target.value.trim()
        void field.onChange(event)
      }
      void field.onBlur(event)
    }} /> }
  }
  const selectRow = (key: "preferredLanguage" | "timeZone" | "locale", options: readonly { readonly value: string; readonly label: string }[]): KeyValueEditRow => {
    const { ref, value, onChange, onBlur, readOnly } = section.control(key)
    return { key, label: ACCOUNT_FIELD_LABELS[key], required: true, error: section.errorFor(key), render: (props) => (
      <Select value={value} onValueChange={onChange} ariaDisabled={readOnly} placeholder={ACCOUNT_MESSAGES.selectValue} unlistedValue={value && !options.some((option) => option.value === value) ? { value } : undefined}>
        <SelectTrigger {...props} ref={ref} onBlur={onBlur} className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
      </Select>
    ) }
  }
  const dateControl = section.control("birthDate")
  const rows: KeyValueEditRow[] = [
    textRow("firstName"), textRow("lastName"),
    { key: "username", label: ACCOUNT_MESSAGES.username, render: (props) => <InputLocked {...props} value={view.username ?? ""} help={ACCOUNT_MESSAGES.usernameHelp} /> },
    { key: "password", label: ACCOUNT_MESSAGES.password, render: (props) => <InputLocked {...props} value={view.password} help={ACCOUNT_MESSAGES.passwordHelp} className="mono-value" /> },
    { key: "primaryEmail", label: ACCOUNT_MESSAGES.primaryEmail, render: () => <span>{view.primaryEmail ?? COMMON_MESSAGES.notProvided}</span> },
    { key: "primaryPhone", label: ACCOUNT_MESSAGES.primaryPhone, render: () => <span>{view.primaryPhone ?? COMMON_MESSAGES.notProvided}</span> },
    { key: "birthDate", label: ACCOUNT_FIELD_LABELS.birthDate, required: true, error: section.errorFor("birthDate"), labelAddon: <Tooltip wide content={ACCOUNT_MESSAGES.birthDateHelp}><InfoIconButton aria-label={ACCOUNT_MESSAGES.aboutBirthDate} /></Tooltip>, render: (props) => <AccountBirthDateControl wiring={props} binding={dateControl} roles={roles} /> },
    selectRow("preferredLanguage", [{ value: "en", label: ACCOUNT_MESSAGES.english }]),
    selectRow("timeZone", ACCOUNT_TIME_ZONES),
    selectRow("locale", [{ value: "en-US", label: ACCOUNT_MESSAGES.localeEnglishUS }]),
  ]
  return <KeyValueEditTable labelledBy={sectionHeadingId("account")} rows={rows} />
}

/** Account owns the display string so every draft, including invalid text, restores exactly. */
function AccountBirthDateControl({ wiring, binding: { ref, ...binding }, roles }: { readonly wiring: FieldControlProps; readonly binding: SectionControl<string>; readonly roles?: readonly string[] }) {
  return <DateInput {...wiring} ref={ref} name={binding.name} value={displayToWireDate(binding.value) ?? ""} textValue={binding.value} onChange={(_wire, { text }) => binding.onChange(text)} onBlur={binding.onBlur} readOnly={binding.readOnly} {...birthDateBounds(roles, new Date())} calendar autoComplete="bday" />
}
