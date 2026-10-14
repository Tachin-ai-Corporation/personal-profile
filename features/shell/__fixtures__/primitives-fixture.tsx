"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { DisabledAction } from "@/components/ui/disabled-action"
import { FormField } from "@/components/ui/form-field"
import { InfoIconButton } from "@/components/ui/info-icon-button"
import { InlineBanner } from "@/components/ui/inline-banner"
import { Input } from "@/components/ui/input"
import { InputLocked } from "@/components/ui/input-locked"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { StatusBadge } from "@/components/ui/status-badge"
import { Tooltip } from "@/components/ui/tooltip"
import { toastError, toastPartial, toastSuccess } from "../toasts"

/**
 * Test-only gallery of the F3-1 primitives (e2e: axe in light and dark, 44 px
 * targets, tooltip and toast behaviour in a real browser). Not app UI; its
 * strings are fixture data, not catalog copy.
 */
export function PrimitivesFixture() {
  const [busy, setBusy] = useState(false)
  const [runs, setRuns] = useState(0)
  const [retries, setRetries] = useState(0)
  const [submits, setSubmits] = useState(0)

  return (
    <main className="bg-background text-foreground flex min-h-screen flex-col gap-6 p-4 md:p-6">
      <h1 className="text-h4 font-semibold">Primitives</h1>

      {/* First, so the bottom toasts never cover these triggers on a phone. */}
      <section aria-label="Toasts" className="flex flex-wrap gap-3">
        <Button type="button" size="touch" variant="outline" onClick={() => toastSuccess("Phone saved.")}>
          Show success
        </Button>
        <Button type="button" size="touch" variant="outline" onClick={() => toastPartial("2 saved, 1 failed")}>
          Show partial
        </Button>
        <Button
          type="button"
          size="touch"
          variant="outline"
          onClick={() => toastError("Couldn't save phone. Check your connection.", { onRetry: () => setRetries((n) => n + 1) })}
        >
          Show error
        </Button>
        <output data-testid="retries">{retries}</output>
      </section>

      <section aria-label="Buttons" className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="touch"
          busy={busy}
          busyLabel="Saving…"
          onClick={() => {
            setRuns((n) => n + 1)
            setBusy(true)
          }}
        >
          Save
        </Button>
        <output data-testid="runs">{runs}</output>
        {/* Inside a form: activating the disabled action must never submit it. */}
        <form
          aria-label="Phones"
          onSubmit={(event) => {
            event.preventDefault()
            setSubmits((n) => n + 1)
          }}
        >
          <DisabledAction reason="You've reached the limit of 20 phones">Add phone</DisabledAction>
          <output data-testid="submits">{submits}</output>
        </form>
        <Tooltip content="Your date of birth is an important identifying factor throughout the healthcare industry." wide>
          <InfoIconButton aria-label="About birth date" />
        </Tooltip>
        <Tooltip content="Lab">
          <InfoIconButton aria-label="About this organization" icon="info" />
        </Tooltip>
      </section>

      <section aria-label="Banners and badges" className="flex flex-col gap-3">
        <InlineBanner variant="error" action={<Button type="button" variant="link" size="touch">Retry</Button>}>
          Couldn&apos;t load phones
        </InlineBanner>
        <InlineBanner variant="info">You have unsaved changes from your last visit.</InlineBanner>
        <div className="flex flex-wrap gap-4">
          <StatusBadge status="verified">Verified</StatusBadge>
          <StatusBadge status="notVerified">Not verified</StatusBadge>
          <StatusBadge status="pending">Link sent · Resend in 60 s</StatusBadge>
        </div>
      </section>

      <section aria-label="Fields" className="flex max-w-[480px] flex-col gap-4">
        <FormField label="First name" help="As on your ID.">
          {(control) => <Input {...control} defaultValue="Ann" />}
        </FormField>
        <FormField label="Email address" optional error="Enter a valid email address">
          {(control) => <Input {...control} defaultValue="ann@" />}
        </FormField>
        <FormField label="Username">{(control) => <InputLocked {...control} value="ann.lee" help="Your username can't be changed here." />}</FormField>
        <FormField label="Preferred language">
          {(control) => (
            <Select>
              <SelectTrigger {...control} className="w-full">
                <SelectValue placeholder="Select a value" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="es">Spanish</SelectItem>
              </SelectContent>
            </Select>
          )}
        </FormField>
      </section>
    </main>
  )
}
