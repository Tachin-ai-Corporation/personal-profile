"use client"

import * as React from "react"

import { INPUT_STYLES } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SECTION_MESSAGES } from "@/lib/shared/messages"
import {
  dialCodeOf,
  formatPhoneInput,
  isPhoneTooLong,
  normalizeRegion,
  parseInternationalPhone,
  phoneRegions,
  regionFlag,
  type PhoneInputValue,
} from "@/lib/shared/phone"
import { cn } from "@/lib/utils"

export type { PhoneInputValue } from "@/lib/shared/phone"

export interface PhoneInputProps {
  /** The picked region (lower-case ISO, default `us`) and the national number as typed. */
  readonly value: PhoneInputValue
  readonly onChange: (next: PhoneInputValue) => void
  /** Called when focus leaves the number field (after it is formatted), for blur validation. */
  readonly onBlur?: () => void
  /** A ref to the number input, e.g. `useSectionForm`'s field ref (focus on the first invalid field). */
  readonly inputRef?: React.Ref<HTMLInputElement>
  readonly name?: string
  readonly disabled?: boolean
  /** Read-only while saving: the number can't be typed and the country can't change. */
  readonly readOnly?: boolean
  /** The country names' language (default `en-US`). */
  readonly locale?: string
  // FormField wiring (spread `control`): it goes on the number input.
  readonly id?: string
  readonly "aria-describedby"?: string
  readonly "aria-invalid"?: true
  readonly "aria-required"?: true
  readonly required?: true
  readonly className?: string
}

/** Characters a phone number may be typed with; anything else is dropped. */
const DISALLOWED = /[^\d\s()+\-.]/g

/**
 * The phone input (F6-2; DESIGN.md Inputs "Phone input", UX-DR30; Stories
 * 3.1, 3.2, 5.2): a country picker as the leading segment (flag + dial code,
 * on the shared `Select`, every libphonenumber region, default United
 * States as in 1health-fe) and the national number field (44 px, 16 px,
 * `inputmode="tel"`). Typing past the country's maximum length is ignored;
 * the number is formatted on blur; a pasted or typed international number
 * (`+44 …`) switches the country. Validation and E.164 live in
 * `lib/shared/phone.ts` (`phoneIssue`, `toE164`); the Section's schema
 * maps the issue to catalog copy.
 */
export function PhoneInput({
  value,
  onChange,
  onBlur,
  inputRef,
  name,
  disabled = false,
  readOnly = false,
  locale = "en-US",
  id,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
  "aria-required": ariaRequired,
  required,
  className,
}: PhoneInputProps): React.JSX.Element {
  const region = normalizeRegion(value.region)
  const regions = phoneRegions(locale)

  const handleInput = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const text = event.target.value.replace(DISALLOWED, "")
    if (text.trim().startsWith("+")) {
      onChange(parseInternationalPhone(text) ?? { region, national: text })
      return
    }
    if (isPhoneTooLong(text, region)) return
    onChange({ region, national: text })
  }

  const handleBlur = (): void => {
    const formatted = formatPhoneInput(value.national, region)
    if (formatted !== value.national) onChange({ region, national: formatted })
    onBlur?.()
  }

  return (
    <div data-slot="phone-input" className={cn("flex w-full min-w-0", className)}>
      <Select
        value={region}
        // The digits stay; they are re-formatted for the new country.
        onValueChange={(next) => onChange({ region: next, national: formatPhoneInput(value.national, next) })}
        disabled={disabled}
        ariaDisabled={readOnly}
      >
        <SelectTrigger
          aria-label={SECTION_MESSAGES.countryCode}
          aria-invalid={invalid}
          data-slot="phone-input-country"
          className="shrink-0 gap-1.5 rounded-r-none border-r-0 px-2.5 aria-invalid:px-[9px] tabular-nums"
        >
          <SelectValue>
            <span aria-hidden="true">{regionFlag(region)}</span>
            <span>+{dialCodeOf(region)}</span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent align="start" className="max-h-80 min-w-64">
          {regions.map((entry) => (
            <SelectItem key={entry.region} value={entry.region} textValue={entry.name}>
              <span aria-hidden="true">{entry.flag}</span>
              <span>{entry.name}</span>
              <span className="text-muted-foreground tabular-nums">+{entry.dialCode}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        value={value.national}
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        aria-required={ariaRequired}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        data-slot="phone-input-number"
        className={cn(INPUT_STYLES, "min-w-0 flex-1 rounded-l-none tabular-nums")}
        onChange={handleInput}
        onBlur={handleBlur}
      />
    </div>
  )
}
