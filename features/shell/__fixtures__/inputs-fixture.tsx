"use client"

import { useMemo, useState } from "react"
import { DateInput } from "@/components/ui/date-input"
import { FormField } from "@/components/ui/form-field"
import { InfoIconButton } from "@/components/ui/info-icon-button"
import { InfoPopover, LinkTextButton, type InfoPopoverState } from "@/components/ui/info-popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PERSON_MESSAGES } from "@/lib/shared/messages"
import { birthDateBounds } from "@/lib/shared/person-rules"

/**
 * Test-only gallery of the F5-1 input controls (e2e: axe in light and dark,
 * keyboard operation, 44 px targets, 360 px). Not app UI; its strings are
 * fixture data, not catalog copy. Birth date bounds use today's date and the
 * Proctor role (21–120).
 */
export function InputsFixture() {
  const [email, setEmail] = useState("ann@work.test")
  const [timeZone, setTimeZone] = useState("America/Phoenix")
  const [language, setLanguage] = useState("")
  const [birthDate, setBirthDate] = useState("")
  const [birthText, setBirthText] = useState("")
  const [supportState, setSupportState] = useState<InfoPopoverState | undefined>("error")
  const bounds = useMemo(() => birthDateBounds(["Proctor"], new Date()), [])
  const birthError = birthText.length === 10 && birthDate === "" ? PERSON_MESSAGES.birthDateFormat : undefined

  return (
    <main className="bg-background text-foreground flex min-h-screen flex-col gap-6 p-4 md:p-6">
      <h1 className="text-h4 font-semibold">Inputs</h1>

      <section aria-label="Selects" className="flex max-w-[480px] flex-col gap-4">
        <FormField label="Primary email address">
          {(control) => (
            <Select
              value={email}
              onValueChange={setEmail}
              ariaDisabled
              helper={
                <>
                  Add another verified email in{" "}
                  <a className="text-link-text underline underline-offset-4" href="#contacts">
                    Contacts
                  </a>
                </>
              }
            >
              <SelectTrigger {...control} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ann@work.test">ann@work.test</SelectItem>
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField label="Default time zone">
          {(control) => (
            <Select value={timeZone} onValueChange={setTimeZone} unlistedValue={{ value: "America/Phoenix", label: "Arizona" }}>
              <SelectTrigger {...control} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="America/New_York">Eastern Time</SelectItem>
                <SelectItem value="America/Chicago">Central Time</SelectItem>
                <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField label="Preferred language">
          {(control) => (
            <Select value={language} onValueChange={setLanguage} placeholder="Select a value">
              <SelectTrigger {...control} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="es">Spanish</SelectItem>
              </SelectContent>
            </Select>
          )}
        </FormField>
      </section>

      <section aria-label="Dates" className="flex max-w-[480px] flex-col gap-4">
        <FormField label="Birth date" required error={birthError}>
          {(control) => (
            <DateInput
              {...control}
              calendar
              min={bounds.min}
              max={bounds.max}
              value={birthDate}
              onChange={(value, { text }) => {
                setBirthDate(value)
                setBirthText(text)
              }}
            />
          )}
        </FormField>
        <p>
          Wire value: <output data-testid="birth-date">{birthDate}</output> · bounds{" "}
          <output data-testid="bounds">
            {bounds.min} {bounds.max}
          </output>
        </p>
      </section>

      <section aria-label="Info popovers" className="flex flex-col gap-4">
        <div className="flex items-center gap-1">
          <h2 className="text-h5 font-semibold">Healthcare credentials</h2>
          <InfoPopover trigger={<InfoIconButton aria-label="About provider registration" icon="info" />} label="About provider registration">
            <p>Registering links your account to your NPI. Adding your practice&apos;s NPI is optional.</p>
          </InfoPopover>
        </div>
        <div className="flex items-center gap-2">
          <span>Practice name</span>
          <InfoPopover
            trigger={<LinkTextButton>Acme Labs</LinkTextButton>}
            title="Acme Labs"
            state={supportState}
            onRetry={() => {
              setSupportState("loading")
              setTimeout(() => setSupportState(undefined), 300)
            }}
          >
            <p className="tabular-nums">(415) 555-0100</p>
            <a className="text-link-text underline underline-offset-4" href="mailto:support@acme.test">
              support@acme.test
            </a>
          </InfoPopover>
        </div>
        <div className="flex items-center gap-2">
          <span>Organization card</span>
          <InfoPopover trigger={<InfoIconButton aria-label="Primary contact for Acme Labs" icon="info" />} title="Primary contact">
            <p>Ann Lee</p>
            <p className="tabular-nums">(415) 555-0101</p>
            <a className="text-link-text underline underline-offset-4" href="mailto:ann@acme.test">
              ann@acme.test
            </a>
          </InfoPopover>
          <button type="button" className="text-link-text min-h-11 rounded-md px-2 outline-none focus-ring">
            After the card
          </button>
        </div>
      </section>
      {/* Room below the popovers, so e2e can place a trigger mid-screen (opens below) or at the bottom (flips above). */}
      <div aria-hidden="true" className="h-[80vh]" />
    </main>
  )
}
