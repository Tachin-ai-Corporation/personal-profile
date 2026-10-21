"use client"

import { Mail, Phone, User } from "lucide-react"
import type { OrganizationPortalContact } from "@/lib/api"
import { InfoIconButton } from "@/components/ui/info-icon-button"
import { InfoPopover } from "@/components/ui/info-popover"
import { isNotProvided, joinProvided } from "@/lib/shared/display-value"
import { formatPhoneDisplay } from "@/lib/shared/phone"
import { safeHref } from "@/lib/shared/safe-href"
import { formatMessage, ORG_MESSAGES } from "@/lib/shared/messages"

export function OrganizationPrimaryContact({ name, contacts }: { readonly name: string; readonly contacts: readonly OrganizationPortalContact[] }) {
  const contact = contacts.find((item) => item.contactTypes.includes("Primary"))
  const missing = ORG_MESSAGES.missingContactValue
  const fullName = joinProvided([contact?.firstName, contact?.middleName, contact?.lastName]) || missing
  const phone = isNotProvided(contact?.phoneNumber) ? missing : formatPhoneDisplay(contact!.phoneNumber!.trim(), contact?.phoneNumberRegion)
  const email = isNotProvided(contact?.email) ? missing : contact!.email!.trim()
  // Protocol-shaped values remain text. Only a plain address becomes a mailto URL.
  const plainEmail = /^[^\s@:< >]+@[^\s@:< >]+\.[^\s@:< >]+$/.test(email) && !/[\u0000-\u001f\u007f?#%&/\\]/.test(email)
  const href = plainEmail ? safeHref(`mailto:${email}`, ["mailto:"]) : undefined
  return (
    <InfoPopover title={ORG_MESSAGES.primaryContact} trigger={<InfoIconButton icon="info" aria-label={formatMessage(ORG_MESSAGES.primaryContactFor, { name })} />}>
      <div className="flex min-w-0 flex-col gap-2">
        <p className="flex min-w-0 items-start gap-2"><User aria-hidden="true" className="text-muted-foreground mt-0.5 size-4 shrink-0" /><span className="min-w-0 [overflow-wrap:anywhere]">{fullName}</span></p>
        <p className="flex min-w-0 items-start gap-2"><Phone aria-hidden="true" className="text-muted-foreground mt-0.5 size-4 shrink-0" /><span className="min-w-0 tabular-nums [overflow-wrap:anywhere]">{phone}</span></p>
        <p className="flex min-w-0 items-start gap-2"><Mail aria-hidden="true" className="text-muted-foreground mt-0.5 size-4 shrink-0" />{href ? <a className="focus-ring text-link-text inline-flex min-h-11 min-w-11 items-center rounded-sm underline [overflow-wrap:anywhere]" href={href}>{email}</a> : <span className="min-w-0 [overflow-wrap:anywhere]">{email}</span>}</p>
      </div>
    </InfoPopover>
  )
}
