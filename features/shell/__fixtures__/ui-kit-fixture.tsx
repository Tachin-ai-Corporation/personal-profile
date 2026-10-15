"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Chip, OverflowChip } from "@/components/ui/chip"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { LiveStatus, useAnnounce } from "@/components/ui/live-status"
import { PhoneInput } from "@/components/ui/phone-input"
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Tooltip } from "@/components/ui/tooltip"
import { CONTACT_MESSAGES, SECTION_MESSAGES } from "@/lib/shared/messages"
import { EMPTY_PHONE_INPUT, phoneIssue, toE164, type PhoneInputValue } from "@/lib/shared/phone"
import { RowActions } from "../row-actions"
import { RowEditStatus, RowRemoval, type RowEditState } from "../row-removal"
import { SectionTable, type SectionTableColumn } from "../section-table"
import { SectionContainer } from "../section-container"
import { useCountdown } from "../use-countdown"

/** How long the fixture's busy states last, so the e2e can try to dismiss them meanwhile. */
const BUSY_MS = 1500

interface FixturePhone {
  readonly id: number
  readonly number: string
  readonly label: string
}

const PHONES: readonly FixturePhone[] = [
  { id: 1, number: "+1 (415) 551-2125", label: "Primary" },
  { id: 2, number: "+1 (415) 555-0100", label: "Work" },
]

/**
 * Test-only gallery of the F6-2 kit (e2e: axe in light and dark, keyboard
 * and touch operation, 44 px targets, 360 px). Not app UI; its strings are
 * fixture data, not catalog copy.
 */
export function UiKitFixture() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogBusy, setDialogBusy] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [primary, setPrimary] = useState(false)
  const [notify, setNotify] = useState(true)
  const [phone, setPhone] = useState<PhoneInputValue>(EMPTY_PHONE_INPUT)
  const [phoneTouched, setPhoneTouched] = useState(false)
  const [editing, setEditing] = useState(false)
  const [states, setStates] = useState<Record<number, RowEditState>>({})
  const [log, setLog] = useState("")
  const [primaryConfirm, setPrimaryConfirm] = useState(false)
  const codeRef = useRef<HTMLInputElement>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  const later = (fn: () => void) => timers.current.push(setTimeout(fn, BUSY_MS))

  const { message, announce } = useAnnounce()
  const countdown = useCountdown()

  const issue = phoneTouched ? phoneIssue(phone) : null
  const phoneError = issue === "tenDigits" ? CONTACT_MESSAGES.phoneTenDigits : issue === "invalid" ? SECTION_MESSAGES.phoneInvalid : issue === "required" ? "Enter a phone number" : undefined

  const columns: SectionTableColumn<FixturePhone>[] = [
    { key: "number", header: "Number", cell: (row) => row.number, className: "font-semibold", mobileLine: 1 },
    {
      key: "label",
      header: "Label",
      cell: (row) => <Chip variant={row.label === "Primary" ? "primary" : "label"}>{row.label}</Chip>,
    },
    { key: "status", header: "Status", cell: (row) => (editing ? <RowEditStatus state={states[row.id] ?? "saved"} /> : "Verified"), mobileLine: 1 },
  ]

  return (
    <main className="bg-background text-foreground flex min-h-screen flex-col gap-8 p-4 md:p-6">
      <h1 className="text-h4 font-semibold">UI kit</h1>

      <section aria-labelledby="dialogs-heading" className="flex flex-wrap gap-2">
        <h2 id="dialogs-heading" className="section-title w-full">
          Dialogs
        </h2>
        <Button type="button" size="touch" onClick={() => setDialogOpen(true)}>
          Link authenticator
        </Button>
        <Button type="button" size="touch" variant="outline" onClick={() => setSheetOpen(true)}>
          Add insurance
        </Button>
        <Button type="button" size="touch" variant="outline-destructive" onClick={() => setConfirmOpen(true)}>
          Disable
        </Button>
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent fullScreenOnMobile dismissible={!dialogBusy} initialFocus={codeRef}>
          <DialogHeader>
            <DialogTitle>Link your Microsoft authenticator</DialogTitle>
            <DialogDescription>Scan this QR with the app, then enter the code it shows.</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col items-center gap-4">
            <div data-testid="qr" className="bg-qr-surface border-border size-[184px] border" />
            <div className="w-full">
              <FormField label="6-digit code">
                {(control) => <Input {...control} ref={codeRef} inputMode="numeric" autoComplete="one-time-code" className="mono-value tracking-[0.3em]" />}
              </FormField>
            </div>
            <div className="h-[480px] w-full" aria-hidden="true" />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" size="touch" aria-disabled={dialogBusy || undefined} onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="touch"
              busy={dialogBusy}
              busyLabel="Checking…"
              onClick={() => {
                setDialogBusy(true)
                later(() => {
                  setDialogBusy(false)
                  setDialogOpen(false)
                })
              }}
            >
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Add insurance</SheetTitle>
          </SheetHeader>
          <SheetBody className="flex flex-col gap-4">
            <FormField label="Insurer">{(control) => <Input {...control} />}</FormField>
            <FormField label="Member ID">{(control) => <Input {...control} />}</FormField>
            <div className="h-[900px]" aria-hidden="true" />
            <FormField label="Group ID">{(control) => <Input {...control} />}</FormField>
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="secondary" size="touch" onClick={() => setSheetOpen(false)}>
              Cancel
            </Button>
            <Button type="button" size="touch" onClick={() => setSheetOpen(false)}>
              Save
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmOpen}
        title="Turn off authenticator app?"
        body="You'll no longer be asked for a code from your authenticator app when you sign in."
        confirmLabel="Turn off"
        variant="destructive"
        busy={confirmBusy}
        busyLabel="Turning off…"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmBusy(true)
          later(() => {
            setConfirmBusy(false)
            setConfirmOpen(false)
          })
        }}
      />

      <section aria-labelledby="chips-heading" className="flex flex-col gap-3">
        <h2 id="chips-heading" className="section-title">
          Chips and text roles
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Chip>Work</Chip>
          <Chip variant="primary">Primary</Chip>
          <Chip variant="deleted">Deleted</Chip>
          <Tooltip content="2 more types: Insurance, Population Health">
            <OverflowChip count={2} aria-label="2 more types: Insurance, Population Health" />
          </Tooltip>
        </div>
        <p>
          <span data-testid="mono-value" className="mono-value">
            ***-**-1234
          </span>{" "}
          <span data-testid="cell-strong" className="cell-strong">
            Ann Lee
          </span>{" "}
          <span data-testid="kv-value-empty" className="kv-value-empty">
            Not provided
          </span>
        </p>
        <div data-testid="control-max-wide" className="control-max-wide border-border w-full border p-2">
          Wide control area
        </div>
      </section>

      <section aria-labelledby="choices-heading" className="flex flex-col gap-2">
        <h2 id="choices-heading" className="section-title">
          Choices
        </h2>
        <div className="flex items-center">
          <Checkbox id="set-primary" checked={primary} onCheckedChange={(value) => setPrimary(value === true)} />
          <label htmlFor="set-primary" className="text-body-sm">
            Set as primary
          </label>
        </div>
        <div className="flex items-center">
          <Switch id="notifications" checked={notify} onCheckedChange={setNotify} />
          <label htmlFor="notifications" className="text-body-sm">
            Notifications
          </label>
        </div>
      </section>

      <section aria-labelledby="phone-heading-input" className="flex max-w-[480px] flex-col gap-2">
        <h2 id="phone-heading-input" className="section-title">
          Phone input
        </h2>
        <FormField label="Phone number" help="Include the area code." error={phoneError}>
          {(control) => <PhoneInput {...control} value={phone} onChange={setPhone} onBlur={() => setPhoneTouched(true)} />}
        </FormField>
        <p className="text-body-sm">
          E.164: <output data-testid="e164">{toE164(phone) ?? ""}</output>
        </p>
      </section>

      <section aria-labelledby="countdown-heading" className="flex flex-col items-start gap-2">
        <h2 id="countdown-heading" className="section-title">
          Countdown
        </h2>
        <Button
          type="button"
          variant="outline"
          size="touch"
          onClick={() => {
            countdown.start(60)
            announce("Link sent")
          }}
        >
          Send link
        </Button>
        <p data-testid="countdown" className="text-muted-foreground text-body-sm">
          {countdown.running ? `Link sent · Resend in ${countdown.remaining} s` : "Not verified"}
        </p>
        <LiveStatus message={message} />
      </section>

      <section aria-labelledby="phone-heading" className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 id="phone-heading" className="section-title">
            Phone
          </h2>
          <Button type="button" variant="outline" size="touch" onClick={() => setEditing((value) => !value)}>
            {editing ? "Done" : "Edit"}
          </Button>
        </div>
        <SectionContainer editing={editing}>
          <SectionTable<FixturePhone>
            rows={PHONES}
            columns={columns}
            getRowKey={(row) => String(row.id)}
            labelledBy="phone-heading"
            editing={editing}
            rowState={(row) => states[row.id] ?? "saved"}
            actions={(row, layout) =>
              editing ? (
                <RowRemoval
                  state={states[row.id] ?? "saved"}
                  disabledReason={row.label === "Primary" ? "Make another phone primary first" : undefined}
                  onRemove={() => setStates((current) => ({ ...current, [row.id]: "removed" }))}
                  onRestore={() => setStates((current) => ({ ...current, [row.id]: "saved" }))}
                />
              ) : (
                <RowActions
                  name={row.number}
                  showInline={layout === "table"}
                  actions={[
                    { id: "verify", label: "Verify", inline: true, onSelect: () => setLog(`verify ${row.id}`) },
                    {
                      id: "primary",
                      label: "Make primary",
                      inline: true,
                      disabledReason: row.label === "Primary" ? "Already primary" : undefined,
                      onSelect: () => setPrimaryConfirm(true),
                    },
                    { id: "remove", label: "Remove", destructive: true, onSelect: () => setLog(`remove ${row.id}`) },
                  ]}
                />
              )
            }
          />
        </SectionContainer>
        <p data-testid="row-log" className="text-body-sm">
          {log}
        </p>
      </section>

      <ConfirmDialog
        open={primaryConfirm}
        title="This changes how you sign in"
        body="+1 (415) 555-0100 becomes your primary phone and sign-in number."
        confirmLabel="Make primary"
        variant="standard"
        onCancel={() => setPrimaryConfirm(false)}
        onConfirm={() => {
          setPrimaryConfirm(false)
          setLog("primary 2")
        }}
      />

      <section aria-labelledby="links-heading" className="flex flex-col gap-2">
        <h2 id="links-heading" className="section-title">
          Links
        </h2>
        <SectionContainer editing={false}>
          <SectionTable<FixturePhone>
            rows={[{ id: 9, number: "https://www.example.com/a/very/long/profile/link/that/has/no/spaces/at/all/and/keeps/going/onward", label: "Personal" }]}
            columns={[
              { key: "link", header: "Link", cell: (row) => row.number, width: "w-[70%]" },
              { key: "label", header: "Label", cell: (row) => <Chip>{row.label}</Chip> },
            ]}
            getRowKey={(row) => String(row.id)}
            labelledBy="links-heading"
            actions={(row, layout) => (
              <RowActions name="the long link" showInline={layout === "table"} actions={[{ id: "remove", label: "Remove", destructive: true, onSelect: () => setLog(`remove ${row.id}`) }]} />
            )}
          />
        </SectionContainer>
      </section>

      <section aria-labelledby="social-heading" className="flex flex-col gap-2">
        <h2 id="social-heading" className="section-title">
          Social media
        </h2>
        <SectionContainer editing={false}>
          <SectionTable<FixturePhone>
            rows={[]}
            columns={[{ key: "link", header: "Link", cell: (row) => row.number }]}
            getRowKey={(row) => String(row.id)}
            labelledBy="social-heading"
            empty={{ message: "No social links yet", action: { label: "Add link", onClick: () => setLog("add link") } }}
            actions={() => null}
          />
        </SectionContainer>
        <EmptyState
          variant="card"
          message="No insurance on file. Add a policy before your next visit."
          action={{ label: "Add a policy", onClick: () => setLog("add insurance") }}
        />
      </section>
    </main>
  )
}
