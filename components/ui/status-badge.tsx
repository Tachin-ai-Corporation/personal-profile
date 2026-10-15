import * as React from "react"
import { AlertCircle, CheckCircle } from "lucide-react"

import { cn } from "@/lib/utils"

const STATUSES = {
  /** `status-verified`: check-circle + word in success-strong, cell-strong type. */
  verified: { className: "text-success-strong font-medium", Icon: CheckCircle },
  /** `status-not-verified`: alert-circle + word in warning-strong, cell-strong type. */
  notVerified: { className: "text-warning-strong font-medium", Icon: AlertCircle },
  /** `status-pending`: muted word, cell type, no icon. */
  pending: { className: "text-muted-foreground", Icon: null },
} as const

export type StatusBadgeStatus = keyof typeof STATUSES

export interface StatusBadgeProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  readonly status: StatusBadgeStatus
  /** The word (e.g. "Verified", "Not verified", "Enabled", "Link sent · Resend in 60 s"): status is never color alone. */
  readonly children: React.ReactNode
}

/** DESIGN.md Row status badges: an icon and a word, never color alone. */
export function StatusBadge({ status, children, className, ...props }: StatusBadgeProps): React.JSX.Element {
  const { className: statusClassName, Icon } = STATUSES[status]
  return (
    <span
      data-slot="status-badge"
      data-status={status}
      className={cn("inline-flex items-center gap-1 text-body-sm", statusClassName, className)}
      {...props}
    >
      {Icon ? <Icon aria-hidden="true" className="size-3.5 shrink-0" /> : null}
      {children}
    </span>
  )
}
