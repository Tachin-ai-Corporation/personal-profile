"use client"

import { useId, useRef, useState, type JSX, type ReactNode } from "react"
import { useWatch, type FieldPath, type PathValue } from "react-hook-form"
import { Button } from "@/components/ui/button"
import { Combobox, type ComboboxSelection } from "@/components/ui/combobox"
import { DateInput } from "@/components/ui/date-input"
import { FormField, type FieldControlProps } from "@/components/ui/form-field"
import { InlineBanner } from "@/components/ui/inline-banner"
import { Input } from "@/components/ui/input"
import { PhoneInput } from "@/components/ui/phone-input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { INSURER_PAGE_SIZE, searchInsurers, type InsurerOption } from "@/lib/api"
import { formatWireDate, localCalendarDate } from "@/lib/shared/dates"
import { COMBOBOX_MESSAGES, COMMON_MESSAGES, FIELD_MESSAGES, formatMessage, INSURANCE_MESSAGES, SECTION_MESSAGES, SHELL_MESSAGES } from "@/lib/shared/messages"
import { isNotProvided } from "@/lib/shared/display-value"
import { formatPhoneDisplay } from "@/lib/shared/phone"
import { InsuranceCardImages } from "./card-images"
import { insuranceEnumLabel } from "./format"
import { needsSubscriber, type InsuranceFormField, type InsuranceFormValues, type InsurerValue } from "./schema"
import type { InsuranceEditor, InsuranceEditorRefs } from "./use-insurance-editor"

/** Two fields side by side from 768 px, stacked below (the drawer is full screen there). */
const PAIR = "grid gap-4 md:grid-cols-2"

/** The value, user change and blur of one form field (the same synthetic events `useSectionForm.control` sends). */
function useBinding<N extends InsuranceFormField>(editor: InsuranceEditor, name: N) {
  const { form } = editor
  const registered = form.register(name)
  return {
    value: form.getValues(name) as PathValue<InsuranceFormValues, N>,
    error: form.getFieldState(name, form.formState).error?.message,
    onChange: (value: PathValue<InsuranceFormValues, N>) => {
      // Read-only while saving: changes are ignored (controls are never `disabled`).
      if (!editor.saving) void registered.onChange({ target: { name, value }, type: "change" })
    },
    onBlur: () => void registered.onBlur({ target: { name, value: form.getValues(name) }, type: "blur" }),
    register: editor.registerControl(name),
  }
}

/** Joins `aria-describedby` ids. */
const describedBy = (...ids: (string | undefined)[]): string | undefined => ids.filter(Boolean).join(" ") || undefined

interface FieldProps {
  readonly editor: InsuranceEditor
}

/** The insurer search (F5-2 Combobox, the insurer variant): a listed insurer, or "Add “{name}”". */
function InsurerField({ editor, onInput }: FieldProps & { readonly onInput: (element: HTMLInputElement | null) => void }): JSX.Element {
  const { register, ...binding } = useBinding(editor, "insurer")
  const value = binding.value as InsurerValue | null
  const [text, setText] = useState(value?.name ?? "")
  const selection: ComboboxSelection<InsurerOption> | null =
    value === null ? null : value.id !== null ? { type: "option", item: { id: value.id, name: value.name } } : { type: "add", text: value.name }
  return (
    <Combobox<InsurerOption>
      label={INSURANCE_MESSAGES.insurer}
      required
      help={COMBOBOX_MESSAGES.insurerHelp}
      error={binding.error}
      load={searchInsurers}
      getKey={(item) => String(item.id)}
      getLabel={(item) => item.name}
      minChars={2}
      pageSize={INSURER_PAGE_SIZE}
      maxLength={100}
      mode="select-only"
      searchIcon
      searchDisabled={editor.saving}
      allowAdd={(name) => formatMessage(COMBOBOX_MESSAGES.addOption, { name })}
      text={text}
      onTextChange={(next) => {
        if (editor.saving) return
        setText(next)
        // Typing over the picked insurer drops it (a new pick sets it again), so the field never keeps a stale id.
        if (value !== null && next !== value.name) binding.onChange(null)
      }}
      selection={selection}
      onSelect={(picked) =>
        binding.onChange(picked === null ? null : picked.type === "option" ? { id: picked.item.id, name: picked.item.name } : { id: null, name: picked.text })
      }
      onClear={() => binding.onChange(null)}
      onBlur={binding.onBlur}
      inputRef={(element) => {
        register(element)
        onInput(element)
      }}
    />
  )
}

interface ChoiceFieldProps extends FieldProps {
  readonly name: "type" | "precedence" | "relationship"
  readonly label: string
}

/** Type, Precedence or Relationship: a Select of the type key's values (title case); a saved value it doesn't offer stays shown. */
function ChoiceField({ editor, name, label }: ChoiceFieldProps): JSX.Element {
  const { register, ...binding } = useBinding(editor, name)
  const value = binding.value as string
  const options = editor.options[name]
  const unlisted = value !== "" && !options.includes(value) ? { value, label: insuranceEnumLabel(value) ?? value } : undefined
  return (
    <FormField label={label} required error={binding.error}>
      {(wiring) => (
        <Select
          value={value}
          open={editor.saving ? false : undefined}
          onValueChange={binding.onChange}
          unlistedValue={unlisted}
          loading={editor.options.state === "loading"}
        >
          <SelectTrigger {...wiring} ref={register} onBlur={binding.onBlur} aria-readonly={editor.saving || undefined} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option} value={option}>
                {insuranceEnumLabel(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>
  )
}

interface TextFieldProps extends FieldProps {
  readonly name: "memberId" | "groupId" | "subscriberFirstName" | "subscriberLastName" | "subscriberEmail"
  readonly label: string
  readonly optional?: boolean
  readonly help?: ReactNode
  readonly autoComplete?: string
  readonly type?: "text" | "email"
}

function TextField({ editor, name, label, optional = false, help, autoComplete = "off", type = "text" }: TextFieldProps): JSX.Element {
  const { form } = editor
  const error = form.getFieldState(name, form.formState).error?.message
  const { ref: formRef, ...registered } = form.register(name)
  const register = editor.registerControl(name)
  return (
    <FormField label={label} optional={optional} required={!optional} help={help} error={error}>
      {(wiring) => (
        <Input
          {...wiring}
          {...registered}
          ref={(element) => {
            formRef(element)
            register(element)
          }}
          type={type}
          readOnly={editor.saving}
          autoComplete={autoComplete}
        />
      )}
    </FormField>
  )
}

interface DateFieldProps extends FieldProps {
  readonly name: "effectiveDate" | "expirationDate" | "cancellationDate" | "subscriberBirthDate"
  readonly label: string
  readonly optional?: boolean
  /** Also describes the input (the dates help under the date fields). */
  readonly extraDescription?: string
  readonly max?: string
  readonly autoComplete?: string
}

/** A date: the masked `MM/DD/YYYY` input with the calendar; the form holds the shown text. */
function DateField({ editor, name, label, optional = false, extraDescription, max, autoComplete = "off" }: DateFieldProps): JSX.Element {
  const { register, ...binding } = useBinding(editor, name)
  const text = binding.value as string
  return (
    <FormField label={label} optional={optional} required={!optional} error={binding.error}>
      {(wiring) => (
        <DateInput
          {...wiring}
          aria-describedby={describedBy(wiring["aria-describedby"], extraDescription)}
          ref={register}
          name={name}
          value=""
          textValue={text}
          onChange={(_value, { text: shown }) => binding.onChange(shown)}
          onBlur={binding.onBlur}
          readOnly={editor.saving}
          max={max}
          calendar
          autoComplete={autoComplete}
        />
      )}
    </FormField>
  )
}

/** The subscriber's phone: country + national number (F6-2 `PhoneInput`). */
function PhoneField({ editor }: FieldProps): JSX.Element {
  const { register, ...binding } = useBinding(editor, "subscriberPhone")
  return (
    <FormField label={SHELL_MESSAGES.sectionPhone} required error={binding.error}>
      {(wiring) => (
        <PhoneInput
          {...wiring}
          value={binding.value as InsuranceFormValues["subscriberPhone"]}
          onChange={binding.onChange}
          onBlur={binding.onBlur}
          inputRef={register}
          name="subscriberPhone"
          readOnly={editor.saving}
        />
      )}
    </FormField>
  )
}

interface LockedFieldProps {
  readonly editor: InsuranceEditor
  readonly name: FieldPath<InsuranceFormValues>
  readonly label: string
  readonly value: string
  readonly reasonId: string
}

/** A saved subscriber value of a locked subscriber (decision 2C): read-only (`aria-readonly`, focusable, never disabled). */
function LockedField({ editor, name, label, value, reasonId }: LockedFieldProps): JSX.Element {
  const register = editor.registerControl(name as InsuranceFormField)
  const error = editor.form.getFieldState(name, editor.form.formState).error?.message
  return (
    <FormField label={label} error={error}>
      {(wiring: FieldControlProps) => (
        <Input
          {...wiring}
          ref={register}
          aria-describedby={describedBy(wiring["aria-describedby"], reasonId)}
          value={value}
          readOnly
          aria-readonly="true"
          className="bg-muted text-secondary-foreground cursor-default"
        />
      )}
    </FormField>
  )
}

/**
 * The Subscriber group (Relationship ≠ Self): editable on Add only; on Edit,
 * the saved subscriber locked (decision 2C), or, with none saved, no inputs
 * and only the policyholder reason, which blocks Save (decision 3A).
 */
function SubscriberGroup({ editor, refs }: FieldProps & { readonly refs: InsuranceEditorRefs }): JSX.Element {
  const headingId = useId()
  const reasonId = useId()
  const values = useWatch({ control: editor.form.control }) as InsuranceFormValues
  const firstName = values.subscriberFirstName.trim()
  const locked = editor.locked
  const { policyholder } = refs
  return (
    <div role="group" aria-labelledby={headingId} data-slot="insurance-subscriber" className="border-border flex flex-col gap-4 border-t pt-5">
      <div className="flex flex-col gap-1">
        <h3 id={headingId} className="text-body text-foreground font-semibold">
          {INSURANCE_MESSAGES.subscriber}
        </h3>
        <p className="text-muted-foreground text-body-sm">{INSURANCE_MESSAGES.subscriberIntro}</p>
        {editor.mode !== "add" ? null : (
          <p data-slot="insurance-subscriber-invite" className="text-muted-foreground text-body-sm">
            {firstName ? formatMessage(INSURANCE_MESSAGES.subscriberInvite, { name: firstName }) : INSURANCE_MESSAGES.subscriberInviteNoName}
          </p>
        )}
      </div>
      {locked ? (
        <>
          <div className={PAIR}>
            <LockedField editor={editor} name="subscriberFirstName" label={FIELD_MESSAGES.firstName} value={values.subscriberFirstName} reasonId={reasonId} />
            <LockedField editor={editor} name="subscriberLastName" label={FIELD_MESSAGES.lastName} value={values.subscriberLastName} reasonId={reasonId} />
          </div>
          <LockedField editor={editor} name="subscriberEmail" label={SHELL_MESSAGES.sectionEmail} value={values.subscriberEmail} reasonId={reasonId} />
          <LockedField
            editor={editor}
            name="subscriberPhone"
            label={SHELL_MESSAGES.sectionPhone}
            value={locked.phoneNumber && !isNotProvided(locked.phoneNumber) ? formatPhoneDisplay(locked.phoneNumber, locked.phoneNumberRegion) : ""}
            reasonId={reasonId}
          />
          <LockedField editor={editor} name="subscriberBirthDate" label={FIELD_MESSAGES.birthDate} value={values.subscriberBirthDate} reasonId={reasonId} />
          <p id={reasonId} data-slot="insurance-subscriber-locked" className="text-muted-foreground text-body-sm">
            {INSURANCE_MESSAGES.subscriberLocked}
          </p>
        </>
      ) : editor.mode !== "add" ? (
        // Decision 3A: an Edit never sends a typed subscriber.
        <p ref={policyholder} tabIndex={-1} data-slot="insurance-subscriber-blocked" className="text-foreground text-body-sm focus-ring rounded-sm outline-none">
          {INSURANCE_MESSAGES.subscriberLocked}
        </p>
      ) : (
        <>
          <div className={PAIR}>
            <TextField editor={editor} name="subscriberFirstName" label={FIELD_MESSAGES.firstName} />
            <TextField editor={editor} name="subscriberLastName" label={FIELD_MESSAGES.lastName} />
          </div>
          <TextField
            editor={editor}
            name="subscriberEmail"
            label={SHELL_MESSAGES.sectionEmail}
            type="email"
            help={firstName ? formatMessage(INSURANCE_MESSAGES.subscriberEmailHelp, { name: firstName }) : INSURANCE_MESSAGES.subscriberEmailHelpNoName}
          />
          <PhoneField editor={editor} />
          <DateField editor={editor} name="subscriberBirthDate" label={FIELD_MESSAGES.birthDate} max={formatWireDate(localCalendarDate(editor.today))} />
        </>
      )}
    </div>
  )
}

/** The form, in the spec's field order; remounted on every open (`key`), so its local text starts over. */
function EditorBody({ editor, refs, onInsurerInput }: FieldProps & { readonly refs: InsuranceEditorRefs; readonly onInsurerInput: (element: HTMLInputElement | null) => void }): JSX.Element {
  const datesHelpId = useId()
  const relationship = useWatch({ control: editor.form.control, name: "relationship" })
  const { options, drawerError } = editor
  const { banner, optionsBanner } = refs
  return (
    <SheetBody className="flex flex-col gap-5">
      {options.state === "error" ? (
        <InlineBanner
          ref={optionsBanner}
          variant="error"
          focusable
          data-slot="insurance-options-error"
          action={
            <Button type="button" variant="outline" size="touch" onClick={options.retry}>
              {COMMON_MESSAGES.retry}
            </Button>
          }
        >
          {INSURANCE_MESSAGES.optionsLoadError}
        </InlineBanner>
      ) : null}
      {drawerError ? (
        <InlineBanner
          ref={banner}
          variant="error"
          focusable
          announceKey={drawerError.key}
          data-slot="insurance-save-error"
          action={
            drawerError.retry ? (
              <Button type="button" variant="outline" size="touch" onClick={editor.retry}>
                {COMMON_MESSAGES.retry}
              </Button>
            ) : undefined
          }
        >
          {drawerError.message}
        </InlineBanner>
      ) : null}
      <InsurerField editor={editor} onInput={onInsurerInput} />
      <div className={PAIR}>
        <ChoiceField editor={editor} name="type" label={SHELL_MESSAGES.columnType} />
        <ChoiceField editor={editor} name="precedence" label={INSURANCE_MESSAGES.precedence} />
      </div>
      {/* Story 5.4: the Primary-per-type demotion offer goes here. */}
      <ChoiceField editor={editor} name="relationship" label={INSURANCE_MESSAGES.relationship} />
      <div className={PAIR}>
        <TextField editor={editor} name="memberId" label={INSURANCE_MESSAGES.memberId} />
        <TextField editor={editor} name="groupId" label={INSURANCE_MESSAGES.groupId} optional />
      </div>
      <div className={PAIR}>
        <DateField editor={editor} name="effectiveDate" label={INSURANCE_MESSAGES.effectiveDate} extraDescription={datesHelpId} />
        <DateField editor={editor} name="expirationDate" label={INSURANCE_MESSAGES.expirationDate} optional extraDescription={datesHelpId} />
      </div>
      <div className={PAIR}>
        <DateField editor={editor} name="cancellationDate" label={INSURANCE_MESSAGES.cancellationDate} optional extraDescription={datesHelpId} />
      </div>
      <p id={datesHelpId} data-slot="insurance-dates-help" className="text-muted-foreground text-body-sm -mt-2">
        {INSURANCE_MESSAGES.datesHelp}
      </p>
      {needsSubscriber(relationship) ? <SubscriberGroup editor={editor} refs={refs} /> : null}
      <InsuranceCardImages editor={editor} />
    </SheetBody>
  )
}

export interface InsurancePolicyEditorProps {
  readonly editor: InsuranceEditor
  readonly refs: InsuranceEditorRefs
}

/**
 * The Add / Edit insurance drawer (Story 5.2, DESIGN.md `insurance-drawer`):
 * the F6-2 `Sheet` from the right (480 px; full screen with Back below
 * 768 px) with a sticky title and a sticky Cancel / Save footer. Every close
 * path goes through the scoped leave guard (`editor.requestClose`); while
 * saving the inputs are read-only, Cancel is inert and the drawer can't be
 * dismissed. Focus starts on the insurer and returns to the trigger.
 */
export function InsurancePolicyEditor({ editor, refs }: InsurancePolicyEditorProps): JSX.Element {
  const insurerInput = useRef<HTMLInputElement | null>(null)
  const { saveButton } = refs
  return (
    <Sheet
      open={editor.open}
      onOpenChange={(open) => {
        if (!open) editor.requestClose()
      }}
    >
      <SheetContent
        data-slot="insurance-editor"
        aria-describedby={undefined}
        dismissible={!editor.saving}
        initialFocus={insurerInput}
        onCloseAutoFocus={editor.onCloseAutoFocus}
      >
        <SheetHeader>
          <SheetTitle>{editor.mode === "add" ? INSURANCE_MESSAGES.addInsurance : INSURANCE_MESSAGES.editTitle}</SheetTitle>
        </SheetHeader>
        <EditorBody
          key={editor.session}
          editor={editor}
          refs={refs}
          onInsurerInput={(element) => {
            insurerInput.current = element
          }}
        />
        <SheetFooter>
          <Button
            type="button"
            variant="secondary"
            size="touch"
            aria-disabled={editor.saving || undefined}
            onClick={() => {
              if (!editor.saving) editor.requestClose()
            }}
          >
            {COMMON_MESSAGES.cancel}
          </Button>
          <Button ref={saveButton} type="button" size="touch" busy={editor.saving} busyLabel={SECTION_MESSAGES.saving} onClick={() => void editor.submit()}>
            {COMMON_MESSAGES.save}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
